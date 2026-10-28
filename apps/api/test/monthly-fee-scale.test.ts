/**
 * The month generator at production scale — a ROUND-TRIP BUDGET, not a timing test.
 *
 * WHY. `runInTx` wraps every request in `prisma.$transaction(fn)`, whose default budget
 * is 5000 ms, and the generator loops over the whole roster inside that one transaction.
 * Work therefore grows with the roster while the budget stays fixed, and on 2026-08-26
 * production crossed it three times: `P2028`, timeTaken 5336 / 5424 / 6055 ms, from
 * `generateMonthlyFees`. The operator got `Internal server error` and a month with no
 * cobros in it. One client at a time never failed, because one client is one ninth of the
 * work.
 *
 * WHY A BUDGET AND NOT A CLOCK. A wall-clock assertion here would pass on any laptop and
 * prove nothing about the box that failed: a round trip costs ~1 ms against this container
 * and ~27 ms in production. The count is the property that actually travels, so this test
 * pins the count and leaves the clock alone.
 *
 * Counted with `pg_stat_statements` rather than by scraping the container log: it is the
 * server's own tally of executions, so it cannot race with a log stream.
 */
import { execSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

let container: StartedPostgreSqlContainer;
let app: FastifyInstance;
let admin: Client;

const WS = '0a000000-0000-4000-8000-000000000001';
const OWNER_EMAIL = 'owner@studio.test';
const PASSWORD = 'a-correct-password';
const PERIOD = '2026-09-01';

/** A full roster, near what the studio actually runs. */
const ROSTER = 24;

/**
 * Statements allowed per generated client.
 *
 * FOUR is the irreducible set: INSERT the receivable, take the ledger's advisory lock,
 * read that account's last balance, INSERT the ledger entry. Everything else the loop used
 * to spend was avoidable — re-reading a client the generator already held, and three
 * relation SELECTs for an emitter and a treasury account that are structurally null on a
 * row created one statement earlier.
 *
 * FIVE is the budget, so a genuinely needed statement can be added without a test edit.
 * What may NOT happen quietly is another include or another per-row lookup: at 9 per client
 * this endpoint was 6 seconds of a 5 second budget.
 */
const BUDGET_PER_CLIENT = 5;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('hold')
    .withUsername('owner')
    .withPassword('owner')
    // The extension has to be preloaded at server start; CREATE EXTENSION alone is not enough.
    .withCommand(['postgres', '-c', 'shared_preload_libraries=pg_stat_statements'])
    .start();
  const ownerUrl = container.getConnectionUri();

  execSync('pnpm --filter @hold/db exec prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: ownerUrl },
    stdio: 'pipe',
  });

  process.env.JWT_SECRET ??= 'x'.repeat(32);
  process.env.RATE_LIMIT_MAX = '10000';
  const { hashPassword } = await import('../src/lib/password.js');
  const passwordHash = await hashPassword(PASSWORD);

  admin = new Client({ connectionString: ownerUrl });
  await admin.connect();
  await admin.query(`CREATE EXTENSION IF NOT EXISTS pg_stat_statements`);
  await admin.query(`CREATE ROLE hold_app LOGIN PASSWORD 'app'`);
  await admin.query(`GRANT CONNECT ON DATABASE hold TO hold_app`);
  await admin.query(`GRANT USAGE ON SCHEMA public TO hold_app`);
  await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hold_app`);
  await admin.query(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO hold_app`);
  await admin.query(`INSERT INTO "Workspace" (id, name) VALUES ($1, 'Studio')`, [WS]);
  await admin.query(
    `INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, 'V', 'O', 'owner', now())`,
    [OWNER_EMAIL, passwordHash],
  );

  process.env.DATABASE_URL = ownerUrl.replace('owner:owner@', 'hold_app:app@');
  const { buildApp } = await import('../src/app.js');
  app = await buildApp();
});

afterAll(async () => {
  await app?.close();
  await admin?.end();
  await container?.stop();
});

let token = '';
beforeAll(async () => {
  const res = await app.inject({
    method: 'POST', url: '/auth/login', payload: { email: OWNER_EMAIL, password: PASSWORD },
  });
  token = res.json().accessToken as string;
});
const h = () => ({ authorization: `Bearer ${token}` });

/** Executions the server itself counted, ignoring this test's own bookkeeping. */
async function statementsSinceReset(): Promise<number> {
  const { rows } = await admin.query<{ calls: string }>(
    `SELECT COALESCE(sum(calls), 0)::text AS calls FROM pg_stat_statements
      WHERE query NOT ILIKE '%pg_stat_statements%'`,
  );
  return Number(rows[0]?.calls ?? 0);
}

/**
 * Executions of the statements that touch one table, since the reset.
 *
 * The scaled budget below cannot see a single extra per-client read: one more lookup on a
 * roster of 24 is 24 statements, which still fits under `ROSTER * BUDGET_PER_CLIENT + 10`
 * and passes. Verified by injecting exactly that regression. So the reads that MUST be
 * once-per-request are pinned by name instead of left to the aggregate.
 */
async function callsTouching(table: string): Promise<number> {
  const { rows } = await admin.query<{ calls: string }>(
    `SELECT COALESCE(sum(calls), 0)::text AS calls FROM pg_stat_statements
      WHERE query ILIKE $1 AND query NOT ILIKE '%pg_stat_statements%'`,
    [`%${table}%`],
  );
  return Number(rows[0]?.calls ?? 0);
}

describe('monthly fee generation — round-trip budget', () => {
  const items: { clientId: string; service: string }[] = [];

  /**
   * Every third client is priced in USD, so the roster is MIXED.
   *
   * The conversion reads the month's rate, and the whole point is that it reads it ONCE
   * per request. A per-client lookup there would be invisible on an all-peso roster and
   * would cost 24 extra round trips on this one: ~650 ms in production, against a budget
   * this endpoint has already blown through in front of the studio.
   */
  const isUsd = (i: number) => i % 3 === 0;

  beforeAll(async () => {
    // Loaded BEFORE the reset inside the test, so the rate's own write is not counted.
    const rate = await app.inject({
      method: 'PUT', url: '/exchange-rates', headers: h(),
      payload: { period: PERIOD, arsPerUsdMinor: '123450' },
    });
    expect(rate.statusCode).toBe(200);

    for (let i = 0; i < ROSTER; i += 1) {
      const res = await app.inject({
        method: 'POST', url: '/clients', headers: h(),
        payload: {
          name: `Cliente ${String(i).padStart(2, '0')}`,
          status: 'active',
          monthlyFeeMinor: isUsd(i) ? String(50_000 + i * 10) : String(500_000 + i * 1000),
          ...(isUsd(i) ? { currency: 'USD' } : {}),
          services: ['Produccion'],
          // Fields the created DTO reports. Populated on purpose: a generator that stops
          // re-reading the client must still return the client's real fiscal data, and
          // nulls everywhere would let a regression hide behind empty columns.
          businessName: `Cliente ${i} SRL`,
          taxId: `2000000000${String(i).padStart(2, '0')}`,
          contactName: `Contacto ${i}`,
        },
      });
      expect(res.statusCode).toBe(201);
      items.push({ clientId: res.json().id as string, service: 'Produccion' });
    }
  });

  it(`bills a roster of ${ROSTER} within ${BUDGET_PER_CLIENT} statements per client`, async () => {
    await admin.query(`SELECT pg_stat_statements_reset()`);

    const res = await app.inject({
      method: 'POST', url: '/receivables/monthly-fee/generate', headers: h(),
      payload: { period: PERIOD, dueDate: '2026-09-10', items },
    });

    const statements = await statementsSinceReset();
    expect(res.statusCode).toBe(201);
    // The budget is meaningless if the run got cheap by doing less: assert the work first.
    expect(res.json().created).toHaveLength(ROSTER);
    expect(res.json().skipped).toHaveLength(0);

    // A fixed preamble is fine (BEGIN, the three roster reads, the month's
    // exchange rate, COMMIT); what must not grow is the PER-CLIENT cost, so the allowance
    // is scaled and given slack.
    expect(statements).toBeLessThanOrEqual(ROSTER * BUDGET_PER_CLIENT + 10);

    // The budget is also meaningless if the dollar clients quietly stopped converting: an
    // unconverted roster is cheaper AND wrong, and it would sail under the count above.
    const created = res.json().created as { currency: string; fxRateMinor: string | null }[];
    // ONCE for the whole batch. A rate cannot change mid-transaction, so a lookup per
    // client buys nothing and costs a round trip each: ~650 ms in production on this
    // roster, against a budget this endpoint has already blown in front of the studio.
    expect(await callsTouching('MonthlyExchangeRate')).toBeLessThanOrEqual(1);

    const converted = created.filter((r) => r.fxRateMinor !== null);
    expect(converted).toHaveLength(items.filter((_, i) => isUsd(i)).length);
    expect(converted.every((r) => r.currency === 'ARS')).toBe(true);
  });

  it('still reports each created cobro with its real client data', async () => {
    // The saving comes from trusting the client the generator already loaded. If that
    // record is ever narrowed, these fields go null and the cobro list loses the fiscal
    // data it searches on -- a silent regression the statement count alone would applaud.
    const res = await app.inject({
      method: 'GET', url: `/receivables?period=${PERIOD}&limit=100`, headers: h(),
    });
    expect(res.statusCode).toBe(200);
    const rows = res.json().items as { clientName: string; businessName: string | null; taxId: string | null; contactName: string | null }[];
    expect(rows).toHaveLength(ROSTER);
    for (const row of rows) {
      expect(row.businessName).toMatch(/^Cliente \d+ SRL$/);
      expect(row.taxId).toMatch(/^\d{12}$/);
      expect(row.contactName).toMatch(/^Contacto \d+$/);
    }
  });
});
