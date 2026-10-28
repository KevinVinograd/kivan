/**
 * Monthly Operation (close hub) integration. Exercises the load-bearing
 * correctness of the close: blockers gate it, the close BAKES an immutable
 * snapshot (later collections don't change a closed month), reopen→reclose
 * appends a new snapshot version, empty months can't close, and concurrent
 * closes serialize (exactly one wins).
 */
import { execSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

let container: StartedPostgreSqlContainer;
let app: FastifyInstance;

const WS = '0f000000-0000-4000-8000-000000000001';
const OWNER_EMAIL = 'owner@studio.test';
const EMPLOYEE_EMAIL = 'emp@studio.test';
const PASSWORD = 'a-correct-password';
const CLIENT = '0f000000-0000-4000-8000-000000000002';
const MEMBER = '0f000000-0000-4000-8000-000000000003';

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('hold')
    .withUsername('owner')
    .withPassword('owner')
    .start();
  const ownerUrl = container.getConnectionUri();

  execSync('pnpm --filter @hold/db exec prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: ownerUrl },
    stdio: 'pipe',
  });

  process.env.JWT_SECRET ??= 'x'.repeat(32);
  const { hashPassword } = await import('../src/lib/password.js');
  const passwordHash = await hashPassword(PASSWORD);

  const admin = new Client({ connectionString: ownerUrl });
  await admin.connect();
  await admin.query(`CREATE ROLE hold_app LOGIN PASSWORD 'app'`);
  await admin.query(`GRANT CONNECT ON DATABASE hold TO hold_app`);
  await admin.query(`GRANT USAGE ON SCHEMA public TO hold_app`);
  await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hold_app`);
  await admin.query(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO hold_app`);

  await admin.query(`INSERT INTO "Workspace" (id, name) VALUES ($1, 'Studio')`, [WS]);
  await admin.query(`INSERT INTO "Client" (id, name, "updatedAt") VALUES ($1, 'Café Roma', now())`, [CLIENT]);
  await admin.query(
    `INSERT INTO "TeamMember" (id, name, role, "employmentType", "compensationModel", "updatedAt")
     VALUES ($1, 'Flor', 'designer', 'employee', 'monthly_fixed', now())`,
    [MEMBER],
  );
  await admin.query(
    `INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, 'V', 'O', 'owner', now())`,
    [OWNER_EMAIL, passwordHash],
  );
  await admin.query(
    `INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, 'E', 'M', 'employee', now())`,
    [EMPLOYEE_EMAIL, passwordHash],
  );
  await admin.end();

  process.env.DATABASE_URL = ownerUrl.replace('owner:owner@', 'hold_app:app@');
  const { buildApp } = await import('../src/app.js');
  app = await buildApp();
});

afterAll(async () => {
  await app?.close();
  await container?.stop();
});

let token = '';
let empToken = '';
beforeAll(async () => {
  token = (await app.inject({ method: 'POST', url: '/auth/login', payload: { email: OWNER_EMAIL, password: PASSWORD } })).json().accessToken;
  empToken = (await app.inject({ method: 'POST', url: '/auth/login', payload: { email: EMPLOYEE_EMAIL, password: PASSWORD } })).json().accessToken;
});
function h(t = token) {
  return { authorization: `Bearer ${t}` };
}

async function createReceivable(periodDate: string, base: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/receivables',
    headers: h(),
    payload: { clientId: CLIENT, period: periodDate, service: 'Redes', dueDate: periodDate, baseAmountMinor: base },
  });
  return res.json().id as string;
}
async function collect(id: string, amount: string) {
  return app.inject({ method: 'POST', url: `/receivables/${id}/collect`, headers: h(), payload: { amountMinor: amount } });
}
async function createPayout(periodDate: string, base: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/payout-statements', headers: h(), payload: { teamMemberId: MEMBER, period: periodDate, baseAmountMinor: base } });
  return res.json().id as string;
}

describe('monthly close', () => {
  let recId = '';
  let payoutId = '';

  it('blocks the close while a payout is still draft', async () => {
    recId = await createReceivable('2026-06-01', '100000');
    await collect(recId, '30000');
    payoutId = await createPayout('2026-06-01', '50000'); // draft

    const blockers = await app.inject({ method: 'GET', url: '/months/2026-06/close-blockers', headers: h() });
    expect(blockers.json().some((b: { code: string }) => b.code === 'unapproved_payouts')).toBe(true);

    const close = await app.inject({ method: 'POST', url: '/months/2026-06/close', headers: h() });
    expect(close.statusCode).toBe(409);
  });

  it('closes atomically and freezes the actuals into a snapshot', async () => {
    await app.inject({ method: 'POST', url: `/payout-statements/${payoutId}/approve`, headers: h() });

    const closed = await app.inject({ method: 'POST', url: '/months/2026-06/close', headers: h() });
    expect(closed.statusCode).toBe(200);
    expect(closed.json().status).toBe('closed');
    expect(closed.json().frozen).toBe(true);
    expect(closed.json().snapshotVersion).toBe(1);
    expect(closed.json().actuals.receivables.totalCollectedMinor).toBe('30000');

    // Collect more AFTER closing — the frozen snapshot must not change.
    await collect(recId, '20000');
    const detail = await app.inject({ method: 'GET', url: '/months/2026-06', headers: h() });
    expect(detail.json().frozen).toBe(true);
    expect(detail.json().actuals.receivables.totalCollectedMinor).toBe('30000'); // still frozen
  });

  it('reopens and recloses with a new snapshot version reflecting current data', async () => {
    const reopened = await app.inject({ method: 'POST', url: '/months/2026-06/reopen', headers: h() });
    expect(reopened.json().status).toBe('reopened');
    // Reopening clears the close audit fields (no longer reads as closed).
    expect(reopened.json().closedAt).toBeNull();
    expect(reopened.json().closedByUserId).toBeNull();

    const reclosed = await app.inject({ method: 'POST', url: '/months/2026-06/close', headers: h() });
    expect(reclosed.json().snapshotVersion).toBe(2);
    expect(reclosed.json().actuals.receivables.totalCollectedMinor).toBe('50000'); // now baked at current state
  });

  it('refuses to close an empty month', async () => {
    const res = await app.inject({ method: 'POST', url: '/months/2026-12/close', headers: h() });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.details.blockers.some((b: { code: string }) => b.code === 'empty_month')).toBe(true);
  });

  it('serializes concurrent closes (exactly one wins)', async () => {
    await createReceivable('2026-08-01', '10000'); // activity, no draft payout → closeable
    const [a, b] = await Promise.all([
      app.inject({ method: 'POST', url: '/months/2026-08/close', headers: h() }),
      app.inject({ method: 'POST', url: '/months/2026-08/close', headers: h() }),
    ]);
    const codes = [a.statusCode, b.statusCode].sort();
    expect(codes).toEqual([200, 409]);
  });

  it('forbids an employee from the monthly surface (fail-closed)', async () => {
    const res = await app.inject({ method: 'GET', url: '/months', headers: h(empToken) });
    expect(res.statusCode).toBe(403);
  });

  it('sums only ARS receivables into the monthly actuals (mixed-currency guard)', async () => {
    // ARS receivable: belongs to the monthly (ARS) operating close.
    const ars = await createReceivable('2026-11-01', '40000');
    await collect(ars, '40000');
    // USD receivable in the SAME period + client: belongs to a Treasury lane, so it
    // must NOT bleed into the ARS actuals (summing them would mix currencies).
    const usd = await app.inject({
      method: 'POST',
      url: '/receivables',
      headers: h(),
      payload: { clientId: CLIENT, period: '2026-11-01', service: 'USD job', dueDate: '2026-11-30', baseAmountMinor: '99999', currency: 'USD' },
    });
    await collect(usd.json().id as string, '99999');

    const detail = await app.inject({ method: 'GET', url: '/months/2026-11', headers: h() });
    const receivables = detail.json().actuals.receivables;
    expect(receivables.totalCollectedMinor).toBe('40000'); // ARS only — the 99999 USD is excluded
    expect(receivables.totalBilledMinor).toBe('40000');
    expect(receivables.count).toBe(1); // one ARS client group, not two
    // Excluding it is right; excluding it SILENTLY is not. These actuals are baked into an
    // append-only MonthSnapshot at close, and a reopen + reclose recomputes them the same
    // way — so a month that billed in another lane would have been recorded, permanently,
    // as a month with less money in it and nothing saying why.
    expect(receivables.otherLaneCount).toBe(1);
  });

  it('records zero excluded rows for a month that is entirely in pesos', async () => {
    // A month WITH peso receivables, not an empty one. Querying a month that has no rows at
    // all makes the assertion pass for any predicate — including an inverted one — because
    // both the peso and the non-peso count are 0 there. The control has to be a month the
    // actuals actually describe.
    const period = '2026-12-01';
    const id = await createReceivable(period, '40000');
    await collect(id, '40000');

    const detail = await app.inject({ method: 'GET', url: '/months/2026-12', headers: h() });
    const receivables = detail.json().actuals.receivables;

    expect(receivables.count).toBe(1);
    expect(receivables.totalBilledMinor).toBe('40000');
    expect(receivables.otherLaneCount).toBe(0);
  });

  it('freezes the plan on a closed month (productions rejected, late collection still works)', async () => {
    const rec = await createReceivable('2027-01-01', '10000'); // activity → closeable, no draft payout
    const closed = await app.inject({ method: 'POST', url: '/months/2027-01/close', headers: h() });
    expect(closed.statusCode).toBe(200);

    // A production against the now-closed month is rejected: the plan (productions /
    // expenses / alerts / checklist) is NOT baked into the close snapshot, so a
    // post-close edit would silently drift the closed month's profitability.
    const prod = await app.inject({
      method: 'POST',
      url: '/months/2027-01/productions',
      headers: h(),
      payload: { date: '2027-01-10', title: 'Spot', type: 'video', hours: 4, totalCostMinor: '50000', status: 'pending' },
    });
    expect(prod.statusCode).toBe(409);

    // A late collection STILL works — snapshot-freeze keeps money actuals live; the
    // frozen snapshot (not the live record) is what the closed month reports.
    const late = await collect(rec, '5000');
    expect(late.statusCode).toBe(200);
  });
});
