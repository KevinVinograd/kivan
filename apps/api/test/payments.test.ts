/**
 * Payments / Pagos integration (real Postgres, non-superuser app role). Mirrors
 * the billing money-correctness guarantees on the OUTGOING side: atomic register
 * under concurrency (no overpay), idempotent register, recipient validation,
 * approve/cancel lifecycle, and fail-closed authz.
 */
import { execSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

let container: StartedPostgreSqlContainer;
let app: FastifyInstance;

const WS = '0b000000-0000-4000-8000-000000000001';
const OWNER_EMAIL = 'owner@studio.test';
const EMPLOYEE_EMAIL = 'emp@studio.test';
const PASSWORD = 'a-correct-password';
const TEAM_MEMBER = '0b000000-0000-4000-8000-000000000002';
const BANK = '0b000000-0000-4000-8000-000000000003';

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
  // The global limiter is 100 requests/minute per IP and this suite now makes more than
  // that. A 429 would fail a test for a reason unrelated to payments, and as a confusing
  // shape error rather than as "rate limited". The limiter is covered in auth.test.ts.
  process.env.RATE_LIMIT_MAX = '10000';
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
  await admin.query(
    `INSERT INTO "Bank" (id, "bankName", "accountHolder", "cbuOrCvu", alias, "accountType")
     VALUES ($1, 'Banco Nación', 'Florencia Giménez', '0110599520000012345678', 'flor.gimenez', 'savings')`,
    [BANK],
  );
  await admin.query(
    `INSERT INTO "TeamMember" (id, name, role, "employmentType", "compensationModel", "bankId", "updatedAt")
     VALUES ($1, 'Flor', 'designer', 'collaborator', 'monthly_fixed', $2, now())`,
    [TEAM_MEMBER, BANK],
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

async function createPayment(body: Record<string, unknown>): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/payments',
    headers: h(),
    payload: {
      recipientType: 'collaborator',
      teamMemberId: TEAM_MEMBER,
      recipientName: 'Flor',
      period: '2026-06-01',
      concept: 'Sueldo junio',
      expectedDate: '2026-06-30',
      ...body,
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json().id as string;
}

describe('payments', () => {
  it('creates a provider', async () => {
    const res = await app.inject({ method: 'POST', url: '/providers', headers: h(), payload: { name: 'Imprenta Sur', taxId: '30-1-2' } });
    expect(res.statusCode).toBe(201);
    expect(res.json().name).toBe('Imprenta Sur');
  });

  it('registers payment without overpaying', async () => {
    const id = await createPayment({ totalAmountMinor: '100000' });

    const partial = await app.inject({ method: 'POST', url: `/payments/${id}/register`, headers: h(), payload: { amountMinor: '40000' } });
    expect(partial.json().status).toBe('partial');
    expect(partial.json().outstandingMinor).toBe('60000');

    const over = await app.inject({ method: 'POST', url: `/payments/${id}/register`, headers: h(), payload: { amountMinor: '70000' } });
    expect(over.statusCode).toBe(409);

    const rest = await app.inject({ method: 'POST', url: `/payments/${id}/register`, headers: h(), payload: { amountMinor: '60000' } });
    expect(rest.json().status).toBe('paid');
    expect(rest.json().paidAmountMinor).toBe('100000');
  });

  it('stamps the caller-supplied payment date, and now() when none is given', async () => {
    // A payment is routinely entered days after the money moved. Stamping it with
    // the moment of data entry records a date that never happened.
    const backdated = await createPayment({ totalAmountMinor: '10000' });
    const res = await app.inject({
      method: 'POST',
      url: `/payments/${backdated}/register`,
      headers: h(),
      payload: { amountMinor: '10000', paymentDate: '2026-05-02' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().paymentDate.slice(0, 10)).toBe('2026-05-02');

    const today = await createPayment({ totalAmountMinor: '10000' });
    const now = await app.inject({
      method: 'POST',
      url: `/payments/${today}/register`,
      headers: h(),
      payload: { amountMinor: '10000' },
    });
    expect(now.json().paymentDate.slice(0, 10)).toBe(new Date().toISOString().slice(0, 10));
  });

  it('never overpays under concurrent register', async () => {
    const id = await createPayment({ totalAmountMinor: '1000' });
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        app.inject({ method: 'POST', url: `/payments/${id}/register`, headers: h(), payload: { amountMinor: '100' } }),
      ),
    );
    const ok = results.filter((r) => r.statusCode === 200);
    expect(ok.length).toBe(10);
    const final = await app.inject({ method: 'GET', url: `/payments/${id}`, headers: h() });
    expect(final.json().paidAmountMinor).toBe('1000');
    expect(final.json().status).toBe('paid');
  });

  it('applies an idempotent register at most once', async () => {
    const id = await createPayment({ totalAmountMinor: '10000' });
    const first = await app.inject({ method: 'POST', url: `/payments/${id}/register`, headers: h(), payload: { amountMinor: '5000', idempotencyKey: 'p-1' } });
    expect(first.json().paidAmountMinor).toBe('5000');
    const retry = await app.inject({ method: 'POST', url: `/payments/${id}/register`, headers: h(), payload: { amountMinor: '5000', idempotencyKey: 'p-1' } });
    expect(retry.json().paidAmountMinor).toBe('5000');
  });

  it('approves a pending payment and cancels (soft)', async () => {
    const id = await createPayment({ totalAmountMinor: '8000' });
    const approved = await app.inject({ method: 'POST', url: `/payments/${id}/approve`, headers: h() });
    expect(approved.json().status).toBe('approved');

    const id2 = await createPayment({ totalAmountMinor: '5000' });
    const cancelled = await app.inject({ method: 'POST', url: `/payments/${id2}/cancel`, headers: h() });
    expect(cancelled.json().status).toBe('cancelled');
    const gone = await app.inject({ method: 'GET', url: `/payments/${id2}`, headers: h() });
    expect(gone.statusCode).toBe(404);
  });

  it('re-derives the status when a settled payment total is raised', async () => {
    // Regression: `update` used to write `totalAmountMinor` without touching `status`, so
    // raising the total of a fully-paid payment left it "paid" while money was outstanding.
    const id = await createPayment({ totalAmountMinor: '10000' });
    const paid = await app.inject({ method: 'POST', url: `/payments/${id}/register`, headers: h(), payload: { amountMinor: '10000' } });
    expect(paid.json().status).toBe('paid');
    expect(paid.json().outstandingMinor).toBe('0');

    const raised = await app.inject({ method: 'PATCH', url: `/payments/${id}`, headers: h(), payload: { totalAmountMinor: '20000' } });
    expect(raised.statusCode).toBe(200);
    expect(raised.json().status).toBe('partial');
    expect(raised.json().outstandingMinor).toBe('10000');

    // ...and settling the difference closes it again.
    const rest = await app.inject({ method: 'POST', url: `/payments/${id}/register`, headers: h(), payload: { amountMinor: '10000' } });
    expect(rest.json().status).toBe('paid');
  });

  it('does not clobber the lifecycle status of an unsettled payment on edit', async () => {
    // The re-derive is scoped to settled payments: an `approved` payment has nothing paid yet,
    // so re-deriving from (paid=0, total) would silently walk it back to `pending`.
    const id = await createPayment({ totalAmountMinor: '8000' });
    const approved = await app.inject({ method: 'POST', url: `/payments/${id}/approve`, headers: h() });
    expect(approved.json().status).toBe('approved');

    const edited = await app.inject({ method: 'PATCH', url: `/payments/${id}`, headers: h(), payload: { totalAmountMinor: '9000' } });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().status).toBe('approved');
  });

  it('rejects a provider payment with no providerId (validation)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/payments',
      headers: h(),
      payload: { recipientType: 'provider', recipientName: 'X', period: '2026-06-01', concept: 'c', expectedDate: '2026-06-30', totalAmountMinor: '1000' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('forbids an employee from the payments surface (fail-closed)', async () => {
    const res = await app.inject({ method: 'GET', url: '/payments', headers: h(empToken) });
    expect(res.statusCode).toBe(403);
  });
});

describe('recipient banking details', () => {
  const bankOf = async (id: string, t?: string) =>
    app.inject({ method: 'GET', url: `/payments/${id}/bank`, headers: h(t) });

  it('falls back to the Bank row on file for a collaborator', async () => {
    const id = await createPayment({ totalAmountMinor: '10000' });
    const res = await bankOf(id);
    expect(res.statusCode).toBe(200);
    expect(res.json().bank).toEqual({
      bankName: 'Banco Nación',
      accountHolder: 'Florencia Giménez',
      cbuOrCvu: '0110599520000012345678',
      alias: 'flor.gimenez',
      accountType: 'savings',
    });
  });

  it("prefers the period's statement over the Bank row", async () => {
    /**
     * The statement's `bankProfile` is the only banking data the product actually
     * WRITES (`payoutsApi.upsert({ bankProfile })` from Operación mensual); nothing
     * creates a `Bank` row or sets `TeamMember.bankId`, which is why the first
     * version of this endpoint answered `{ bank: null }` for every payment in
     * production while a test seeded by raw SQL stayed green.
     *
     * It is also per-period: an account changed in August must not restate what July
     * was paid into. So when both exist, the statement wins.
     */
    const period = '2026-09-01';
    await app.inject({
      method: 'POST', url: '/payout-statements', headers: h(),
      payload: {
        teamMemberId: TEAM_MEMBER, period,
        bankProfile: { bankName: 'Brubank', accountHolder: 'F. Giménez', cbuOrCvu: '0000003100010000000001', alias: 'flor.bru' },
      },
    });
    const id = await createPayment({ period, expectedDate: '2026-09-30', totalAmountMinor: '10000' });
    expect((await bankOf(id)).json().bank).toEqual({
      bankName: 'Brubank',
      accountHolder: 'F. Giménez',
      cbuOrCvu: '0000003100010000000001',
      alias: 'flor.bru',
      // No counterpart in the free-form profile — null, not a value carried over
      // from the Bank row this deliberately overrode.
      accountType: null,
    });
  });

  it('answers null for a counterparty with nothing on file', async () => {
    // A provider created through the API has no bankId, which is a real state and
    // not an error — the detail must render it as blank, never as invented digits.
    const providerId = (
      await app.inject({ method: 'POST', url: '/providers', headers: h(), payload: { name: 'Sin banco SRL' } })
    ).json().id as string;
    const id = await createPayment({
      recipientType: 'provider', providerId, teamMemberId: undefined,
      recipientName: 'Sin banco SRL', totalAmountMinor: '10000',
    });
    const res = await bankOf(id);
    expect(res.statusCode).toBe(200);
    expect(res.json().bank).toBeNull();
  });

  it('answers null for a recipient that has no counterparty at all', async () => {
    // Gasto fijo / monotributo / plataforma reference neither a member nor a
    // provider (lib/ledger.ts § paymentLedgerEntity), so there is nobody to have
    // a bank account.
    const id = await createPayment({
      recipientType: 'fixed_expense', teamMemberId: undefined,
      recipientName: 'Alquiler', totalAmountMinor: '10000',
    });
    expect((await bankOf(id)).json().bank).toBeNull();
  });

  it('404s on a payment that does not exist, rather than answering null', async () => {
    // The two absences above are facts about the data; this one is a bad request,
    // and collapsing it into `{ bank: null }` would hide a broken link.
    const res = await bankOf('0b000000-0000-4000-8000-0000000000ff');
    expect(res.statusCode).toBe(404);
  });

  /**
   * Named for what it actually observes. It does NOT prove the gate is the
   * CAPABILITY one: `employee` is refused by `requireCapability('teamBankDetails')`
   * and by a plain `requireRole('owner', 'admin')` alike, so swapping one for the
   * other leaves this green. Discriminating between them at runtime would need a
   * role that holds the route but not the capability, and `ROLE_CAPABILITIES` grants
   * all four to both manager roles today — there is no such role to log in as.
   *
   * Keep the route gated by the capability, not only by role.
   */
  it('forbids an employee (fail-closed)', async () => {
    const id = await createPayment({ totalAmountMinor: '10000' });
    expect((await bankOf(id, empToken)).statusCode).toBe(403);
  });
});

/**
 * Where the money left from — the outgoing half of the settlement destination.
 *
 * `Payment.method` has existed since the module shipped and the API has accepted it just
 * as long; nothing ever sent one, so the detail had no medio de pago to show and the
 * treasury balance never moved when the studio paid somebody.
 */
describe('payments — settlement origin', () => {
  let account = '';

  async function balanceOf(id: string): Promise<bigint> {
    const res = await app.inject({ method: 'GET', url: '/treasury/accounts', headers: h() });
    const row = (res.json() as { id: string; balanceArsMinor: string }[]).find((a) => a.id === id);
    return BigInt(row!.balanceArsMinor);
  }

  beforeAll(async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/treasury/accounts',
      headers: h(),
      payload: { name: 'Caja', type: 'cash', balanceArsMinor: '500000' },
    });
    expect(res.statusCode).toBe(201);
    account = res.json().id as string;
  });

  it('drops the named account by exactly the amount paid, and records the medio', async () => {
    const id = await createPayment({ totalAmountMinor: '40000' });
    const before = await balanceOf(account);

    const res = await app.inject({
      method: 'POST',
      url: `/payments/${id}/register`,
      headers: h(),
      payload: {
        amountMinor: '40000',
        paymentDate: '2026-06-20',
        treasuryAccountId: account,
        method: 'efectivo',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      treasuryAccountId: account,
      treasuryAccountName: 'Caja',
      method: 'efectivo',
    });

    expect(await balanceOf(account)).toBe(before - 40000n);

    const moves = await app.inject({ method: 'GET', url: '/treasury/movements', headers: h() });
    const mine = (
      moves.json().items as { referenceId: string; amountMinor: string; direction: string; date: string }[]
    ).filter((m) => m.referenceId === id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ amountMinor: '40000', direction: 'outflow', date: '2026-06-20' });
  });

  it('moves nothing when the payment names no origin', async () => {
    const id = await createPayment({ totalAmountMinor: '40000' });
    const before = await balanceOf(account);

    const res = await app.inject({
      method: 'POST',
      url: `/payments/${id}/register`,
      headers: h(),
      payload: { amountMinor: '40000' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().treasuryAccountId).toBeNull();
    expect(await balanceOf(account)).toBe(before);
  });

  it('rolls the whole payment back when the origin is not a live account', async () => {
    const id = await createPayment({ totalAmountMinor: '40000' });
    const before = await balanceOf(account);

    const res = await app.inject({
      method: 'POST',
      url: `/payments/${id}/register`,
      headers: h(),
      payload: { amountMinor: '40000', treasuryAccountId: '0b000000-0000-4000-8000-0000000000ff' },
    });
    expect(res.statusCode).toBe(400);

    const after = await app.inject({ method: 'GET', url: `/payments/${id}`, headers: h() });
    expect(after.json().paidAmountMinor).toBe('0');
    expect(await balanceOf(account)).toBe(before);
  });
});
