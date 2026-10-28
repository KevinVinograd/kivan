/**
 * PayoutStatement integration (real Postgres, non-superuser app role): plan
 * total derivation, adjustments (incl. negative), the guarded approve→dispatch→
 * confirm lifecycle, atomic + idempotent payout register, and fail-closed authz.
 */
import { execSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { registerPayoutSchema } from '../src/modules/payouts/payouts.schema.js';

let container: StartedPostgreSqlContainer;
let app: FastifyInstance;

const WS = '0e000000-0000-4000-8000-000000000001';
const OWNER_EMAIL = 'owner@studio.test';
const EMPLOYEE_EMAIL = 'emp@studio.test';
const PASSWORD = 'a-correct-password';
const MEMBER = '0e000000-0000-4000-8000-000000000002';
/** Paid by the hour, at $5.000 — the only shape for which a rate is a real number. */
const HOURLY_MEMBER = '0e000000-0000-4000-8000-000000000003';

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
  await admin.query(
    `INSERT INTO "TeamMember" (id, name, role, "employmentType", "compensationModel", "updatedAt")
     VALUES ($1, 'Flor', 'designer', 'employee', 'monthly_fixed', now())`,
    [MEMBER],
  );
  await admin.query(
    `INSERT INTO "TeamMember" (id, name, role, "employmentType", "compensationModel", "hourlyRateMinor", "updatedAt")
     VALUES ($1, 'Ana', 'editor', 'collaborator', 'hourly', 500000, now())`,
    [HOURLY_MEMBER],
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

async function upsert(period: string, body: Record<string, unknown>) {
  const res = await app.inject({
    method: 'POST',
    url: '/payout-statements',
    headers: h(),
    payload: { teamMemberId: MEMBER, period, ...body },
  });
  expect(res.statusCode).toBe(201);
  return res.json();
}

describe('payout-statements', () => {
  let id = '';

  it('derives the total from plan + adjustments', async () => {
    const created = await upsert('2026-06-01', { baseAmountMinor: '100000', productionsAmountMinor: '20000', viaticsAmountMinor: '5000' });
    id = created.id;
    expect(created.totalAmountMinor).toBe('125000');

    const adj1 = await app.inject({ method: 'POST', url: `/payout-statements/${id}/adjustments`, headers: h(), payload: { description: 'deduction', amountMinor: '-10000' } });
    expect(adj1.json().adjustmentsTotalMinor).toBe('-10000');
    expect(adj1.json().totalAmountMinor).toBe('115000');

    const adj2 = await app.inject({ method: 'POST', url: `/payout-statements/${id}/adjustments`, headers: h(), payload: { description: 'bonus', amountMinor: '5000' } });
    expect(adj2.json().totalAmountMinor).toBe('120000');
    expect(adj2.json().adjustments).toHaveLength(2);
  });

  it('walks the lifecycle and rejects invalid transitions', async () => {
    const approved = await app.inject({ method: 'POST', url: `/payout-statements/${id}/approve`, headers: h() });
    expect(approved.json().statementStatus).toBe('approved');
    expect(approved.json().approvedAt).toBeTruthy();

    const badConfirm = await app.inject({ method: 'POST', url: `/payout-statements/${id}/confirm`, headers: h() });
    expect(badConfirm.statusCode).toBe(409); // not dispatched yet

    expect((await app.inject({ method: 'POST', url: `/payout-statements/${id}/dispatch`, headers: h() })).json().statementStatus).toBe('dispatched');
    expect((await app.inject({ method: 'POST', url: `/payout-statements/${id}/confirm`, headers: h() })).json().statementStatus).toBe('confirmed');

    const reApprove = await app.inject({ method: 'POST', url: `/payout-statements/${id}/approve`, headers: h() });
    expect(reApprove.statusCode).toBe(409); // already past draft
  });

  it('registers the payout atomically without overpaying', async () => {
    const partial = await app.inject({ method: 'POST', url: `/payout-statements/${id}/register`, headers: h(), payload: { amountMinor: '50000' } });
    expect(partial.json().paidAmountMinor).toBe('50000');
    expect(partial.json().outstandingMinor).toBe('70000');

    const over = await app.inject({ method: 'POST', url: `/payout-statements/${id}/register`, headers: h(), payload: { amountMinor: '80000' } });
    expect(over.statusCode).toBe(409);

    const rest = await app.inject({ method: 'POST', url: `/payout-statements/${id}/register`, headers: h(), payload: { amountMinor: '70000' } });
    expect(rest.json().paidAmountMinor).toBe('120000');
  });

  it('stores the day the payout was paid, as a day', async () => {
    // The dialog has shown a "Fecha de pago" picker since the module shipped and the
    // value was discarded at every layer: no parameter, no column. The payout was
    // therefore dated by the moment of data entry — the last settlement path still
    // carrying the defect the cobro and the pago shed in #132.
    const s = await upsert('2026-09-01', { baseAmountMinor: '30000' });
    const res = await app.inject({
      method: 'POST',
      url: `/payout-statements/${s.id}/register`,
      headers: h(),
      payload: { amountMinor: '30000', paidAt: '2026-08-04' },
    });
    expect(res.statusCode).toBe(200);
    // A DATE column, serialized as a day: no instant to localize into the day before.
    expect(res.json().paidAt).toBe('2026-08-04');
  });

  it('records no day when the caller sends none, and never erases one it already has', async () => {
    const s = await upsert('2026-10-01', { baseAmountMinor: '20000' });

    const noDate = await app.inject({
      method: 'POST', url: `/payout-statements/${s.id}/register`, headers: h(),
      payload: { amountMinor: '5000' },
    });
    // Honest absence, not a stand-in: /team's "Pagar diferencia" confirm asks for no date.
    expect(noDate.json().paidAt).toBeNull();

    const dated = await app.inject({
      method: 'POST', url: `/payout-statements/${s.id}/register`, headers: h(),
      payload: { amountMinor: '5000', paidAt: '2026-08-07' },
    });
    expect(dated.json().paidAt).toBe('2026-08-07');

    // A later partial that names no day must not wipe the day already recorded.
    const undated = await app.inject({
      method: 'POST', url: `/payout-statements/${s.id}/register`, headers: h(),
      payload: { amountMinor: '5000' },
    });
    expect(undated.json().paidAt).toBe('2026-08-07');
  });

  it('refuses a payout dated in the future', async () => {
    // The guard cannot live only in the dialog: a retry, a script or any future caller
    // reaches this endpoint too, and the colaboradora ledger sorts by this day — one bad
    // value would sit above every real movement forever.
    const s = await upsert('2026-11-01', { baseAmountMinor: '10000' });
    const res = await app.inject({
      method: 'POST', url: `/payout-statements/${s.id}/register`, headers: h(),
      payload: { amountMinor: '10000', paidAt: '2226-10-07' },
    });
    expect(res.statusCode).toBe(400);
    // And nothing moved.
    expect((await app.inject({ method: 'GET', url: `/payout-statements/${s.id}`, headers: h() })).json().paidAmountMinor).toBe('0');
  });

  it('refuses an impossible calendar day with a 400, not a 500', async () => {
    // A bare shape regex accepts '2026-02-31'. It used to reach `COALESCE($1::date, ...)`,
    // where Postgres raises an error the handler cannot classify, so the caller got
    // INTERNAL 500 for what is plainly bad input.
    const s = await upsert('2026-12-01', { baseAmountMinor: '10000' });
    const res = await app.inject({
      method: 'POST', url: `/payout-statements/${s.id}/register`, headers: h(),
      payload: { amountMinor: '10000', paidAt: '2026-02-31' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('accepts today even when the server and the operator disagree about the day', () => {
    // The guard exists to catch a mistyped YEAR, and must never refuse a legitimate today.
    // The browser sends its LOCAL day while the server reads UTC, so at 21:30 in UTC-3 the
    // operator's today is already tomorrow in UTC — comparing against the bare UTC day was
    // the same off-by-one the guard claimed to fix. One day of slack covers every offset.
    const tomorrowUtc = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    expect(registerPayoutSchema.safeParse({ amountMinor: '1', paidAt: tomorrowUtc }).success).toBe(true);
    const wayOut = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    expect(registerPayoutSchema.safeParse({ amountMinor: '1', paidAt: wayOut }).success).toBe(false);
    expect(registerPayoutSchema.safeParse({ amountMinor: '1', paidAt: '2226-10-07' }).success).toBe(false);
  });

  it('applies an idempotent register at most once', async () => {
    const s = await upsert('2026-07-01', { baseAmountMinor: '10000' });
    const first = await app.inject({ method: 'POST', url: `/payout-statements/${s.id}/register`, headers: h(), payload: { amountMinor: '5000', idempotencyKey: 'po-1' } });
    expect(first.json().paidAmountMinor).toBe('5000');
    const retry = await app.inject({ method: 'POST', url: `/payout-statements/${s.id}/register`, headers: h(), payload: { amountMinor: '5000', idempotencyKey: 'po-1' } });
    expect(retry.json().paidAmountMinor).toBe('5000');
  });

  it('upsert updates the same (member, period) and re-derives', async () => {
    const again = await upsert('2026-07-01', { baseAmountMinor: '12000' });
    expect(again.totalAmountMinor).toBe('12000');
  });

  it('round-trips the bankProfile on upsert and re-read', async () => {
    const created = await upsert('2026-09-01', {
      baseAmountMinor: '50000',
      bankProfile: { bankName: 'Galicia', accountHolder: 'Mica Duarte', cbuOrCvu: '0070999530004123456789', alias: 'mica.hold' },
    });
    expect(created.bankProfile).toMatchObject({
      bankName: 'Galicia',
      accountHolder: 'Mica Duarte',
      cbuOrCvu: '0070999530004123456789',
      alias: 'mica.hold',
    });

    // Persisted as JSON on the statement (re-read by id).
    const got = await app.inject({ method: 'GET', url: `/payout-statements/${created.id}`, headers: h() });
    expect(got.json().bankProfile).toMatchObject({ bankName: 'Galicia', alias: 'mica.hold' });
  });

  it('forbids an employee from the payouts surface (fail-closed)', async () => {
    const res = await app.inject({ method: 'GET', url: '/payout-statements', headers: h(empToken) });
    expect(res.statusCode).toBe(403);
  });
});

/**
 * Recorded hours and the rate a statement was computed at.
 *
 * The pair is nullable and null means NOT RECORDED — a statement that predates
 * attribution has neither, and a member paid monthly_fixed never will. Rendering
 * either as `0 h` at `$ 0` would put a figure nobody worked for on a payroll
 * screen, which is the class of defect this whole change removes.
 */
describe('payout-statements — attributed hours and rate', () => {
  // Approved by default: since 2026-10-19 only approved productions reach a liquidación.
  async function production(period: string, hours: number | null, memberId = HOURLY_MEMBER, status = 'approved') {
    const res = await app.inject({
      method: 'POST',
      url: `/months/${period}/productions`,
      headers: h(),
      payload: {
        date: `${period}-12`,
        title: 'Edición',
        type: 'video',
        hours: hours ?? 0,
        status,
        attribution: [{ teamMemberId: memberId, ...(hours === null ? {} : { hours }), role: 'responsible' }],
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  async function statement(period: string, body: Record<string, unknown> = {}) {
    const res = await app.inject({
      method: 'POST',
      url: '/payout-statements',
      headers: h(),
      payload: { teamMemberId: HOURLY_MEMBER, period, ...body },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  it('records the hours worked and the rate, and derives productions from them', async () => {
    await production('2027-01', 6);
    await production('2027-01', 4.5);

    const s = await statement('2027-01-01');
    expect(s.hoursTotal).toBe(10.5);
    // The member's own hourlyRateMinor, RECORDED on the statement rather than
    // recovered later by dividing a total by a count of hours.
    expect(s.hourlyRateMinor).toBe('500000');
    expect(s.productionsAmountMinor).toBe('5250000');
    expect(s.totalAmountMinor).toBe('5250000');
  });

  it('pays no hours of a production the communication lead has not approved', async () => {
    await production('2026-03', 6, HOURLY_MEMBER, 'pending');
    const s = await statement('2026-03-01');
    expect(s.hoursTotal).toBeNull();
    expect(s.productionsAmountMinor).toBe('0');
  });

  it('records no hours at all when no attribution carries them', async () => {
    await production('2027-02', null);

    const s = await statement('2027-02-01', { baseAmountMinor: '80000' });
    // The member demonstrably worked that production; how much is unknown. A
    // confident 0 would be indistinguishable from having genuinely worked none.
    expect(s.hoursTotal).toBeNull();
    // With no hours to multiply, productions stays untouched instead of being
    // derived to zero — which would have wiped a real amount.
    expect(s.productionsAmountMinor).toBe('0');
    expect(s.totalAmountMinor).toBe('80000');
  });

  it('leaves hours and rate unrecorded for a member not paid by the hour', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/payout-statements',
      headers: h(),
      payload: { teamMemberId: MEMBER, period: '2027-03-01', baseAmountMinor: '900000' },
    });
    const s = res.json();
    // MEMBER is monthly_fixed. Dividing their pay by hours would imply a rate
    // nobody agreed to, so no rate is recorded and none can be printed.
    expect(s.hoursTotal).toBeNull();
    expect(s.hourlyRateMinor).toBeNull();
  });

  it('refuses a rate whose derived amount would overflow, rather than 500ing', async () => {
    await production('2027-08', 10);
    const res = await app.inject({
      method: 'POST',
      url: '/payout-statements',
      headers: h(),
      payload: {
        teamMemberId: HOURLY_MEMBER,
        period: '2027-08-01',
        // Inside the codec's 64-bit bound, so the edge accepts it — but 10x it
        // is not, and the DERIVED value never passes through that codec.
        hourlyRateMinor: '9000000000000000000',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('BAD_REQUEST');
  });

  it('keeps the rate it was liquidated at, through an unrelated later edit', async () => {
    await production('2027-05', 3);
    const first = await statement('2027-05-01', { hourlyRateMinor: '700000' });
    expect(first.hourlyRateMinor).toBe('700000');
    expect(first.productionsAmountMinor).toBe('2100000');

    // An unrelated edit, with no rate in the payload. The rate is history — what
    // an hour was worth when this was liquidated — so falling back to the
    // member's current card rate here would silently restate the month.
    const later = await statement('2027-05-01', { viaticsAmountMinor: '1000' });
    expect(later.hourlyRateMinor).toBe('700000');
  });

  it('never restates an existing statement, however the attribution moves', async () => {
    await production('2027-04', 2);
    const first = await statement('2027-04-01');
    expect(first.productionsAmountMinor).toBe('1000000');

    // Someone corrects the productions amount by hand, for a reason no
    // attribution knows about.
    const overridden = await statement('2027-04-01', { productionsAmountMinor: '1234567' });
    expect(overridden.productionsAmountMinor).toBe('1234567');

    // More hours land, and an unrelated edit touches the statement. The derived
    // amount must NOT come back and overwrite the correction: re-deriving on
    // every later edit is exactly how a hand-entered liquidación gets silently
    // restated.
    await production('2027-04', 8);
    const later = await statement('2027-04-01', { viaticsAmountMinor: '15000' });
    expect(later.productionsAmountMinor).toBe('1234567');
    // The recorded hours DO follow the attribution — they describe it, they do
    // not decide the money.
    expect(later.hoursTotal).toBe(10);
    expect(later.totalAmountMinor).toBe('1249567');
  });
});

/**
 * Where the payroll left from.
 *
 * 0019 gave a cobro and a pago a destination, so settling one moves a balance. A team
 * payout was left out — and it is usually the largest outflow of the month. Paying
 * payroll moved nothing at all: a `PayoutStatement` is not a `Payment`, so no other
 * path would ever post it either. The money left the bank and every figure on screen
 * stayed where it was.
 */
describe('payouts — settlement origin', () => {
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
      payload: { name: 'Galicia', type: 'bank', balanceArsMinor: '5000000' },
    });
    expect(res.statusCode).toBe(201);
    account = res.json().id as string;
  });

  it('LOWERS the named account by exactly the amount paid, and records why', async () => {
    const s = await upsert('2026-11-01', { baseAmountMinor: '80000' });
    const before = await balanceOf(account);

    const res = await app.inject({
      method: 'POST',
      url: `/payout-statements/${s.id}/register`,
      headers: h(),
      payload: { amountMinor: '80000', paidAt: '2026-07-05', treasuryAccountId: account },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().treasuryAccountId).toBe(account);

    // An OUTFLOW: the sign is the whole point. A payroll that raised the balance would
    // be worse than one that moved nothing.
    expect(await balanceOf(account)).toBe(before - 80000n);

    const moves = await app.inject({ method: 'GET', url: '/treasury/movements', headers: h() });
    const mine = (
      moves.json().items as {
        referenceId: string;
        referenceType: string;
        amountMinor: string;
        direction: string;
        date: string;
      }[]
    ).filter((m) => m.referenceId === s.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      amountMinor: '80000',
      direction: 'outflow',
      // The day the operator entered, not the write moment.
      date: '2026-07-05',
      referenceType: 'payoutStatement',
    });
  });

  it('moves nothing when the register names no account', async () => {
    const s = await upsert('2026-12-01', { baseAmountMinor: '40000' });
    const before = await balanceOf(account);

    const res = await app.inject({
      method: 'POST',
      url: `/payout-statements/${s.id}/register`,
      headers: h(),
      payload: { amountMinor: '40000', paidAt: '2026-07-03' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().treasuryAccountId).toBeNull();
    // Every payout registered before 0021 named no account. Nothing may move on their
    // behalf, and nothing may be invented for them.
    expect(await balanceOf(account)).toBe(before);
  });

  it('refuses an account that is not this workspace, and moves no money doing it', async () => {
    const s = await upsert('2027-01-01', { baseAmountMinor: '25000' });
    const before = await balanceOf(account);

    const res = await app.inject({
      method: 'POST',
      url: `/payout-statements/${s.id}/register`,
      headers: h(),
      payload: { amountMinor: '25000', treasuryAccountId: '0a000000-0000-4000-8000-0000000000ff' },
    });
    expect(res.statusCode).toBe(400);

    // The register and the movement are ONE transaction: a rejected destination must
    // roll the payment back too, or the statement reads as paid out of nowhere.
    expect(await balanceOf(account)).toBe(before);
    const after = await app.inject({
      method: 'GET',
      url: `/payout-statements/${s.id}`,
      headers: h(),
    });
    expect(after.json().paidAmountMinor).toBe('0');
  });

  it('does not post twice for a replayed register', async () => {
    const s = await upsert('2027-02-01', { baseAmountMinor: '60000' });
    const before = await balanceOf(account);
    const payload = {
      amountMinor: '60000',
      paidAt: '2026-07-10',
      treasuryAccountId: account,
      idempotencyKey: 'payout-replay-1',
    };

    const first = await app.inject({
      method: 'POST',
      url: `/payout-statements/${s.id}/register`,
      headers: h(),
      payload,
    });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({
      method: 'POST',
      url: `/payout-statements/${s.id}/register`,
      headers: h(),
      payload,
    });
    expect(second.statusCode).toBe(200);

    // The idempotency guard short-circuits BEFORE the register, so the movement that
    // sits after it is covered by the same guard. A retry on a flaky connection must
    // not debit payroll twice.
    expect(await balanceOf(account)).toBe(before - 60000n);
  });

  it('keeps the account a first register recorded when a later one names none', async () => {
    const s = await upsert('2027-03-01', { baseAmountMinor: '90000' });
    await app.inject({
      method: 'POST',
      url: `/payout-statements/${s.id}/register`,
      headers: h(),
      payload: { amountMinor: '50000', treasuryAccountId: account },
    });
    // /team's "Pagar diferencia" is a confirm with no fields: it names no account, and
    // must not blank the one the first register wrote.
    const rest = await app.inject({
      method: 'POST',
      url: `/payout-statements/${s.id}/register`,
      headers: h(),
      payload: { amountMinor: '40000' },
    });
    expect(rest.json().treasuryAccountId).toBe(account);
  });
});

/**
 * The liquidación as a payable.
 *
 * A `Payment` posts a CHARGE when created and a CREDIT when paid, so the counterparty's
 * running account nets to zero. A statement posted only the credit — the "owed" half was
 * recorded nowhere — so every liquidación ever paid drove the balance further negative,
 * as if the studio had overpaid. Measured on a live workspace before this: -402.000
 * against a team that had been paid exactly what it was owed.
 */
describe('payouts — the statement charges the account', () => {
  /** The account's LIVE running balance, straight off the API the product reads. */
  async function balanceOf(memberId: string): Promise<bigint> {
    const res = await app.inject({
      method: 'GET',
      url: `/ledger/teamMember/${memberId}`,
      headers: h(),
    });
    expect(res.statusCode).toBe(200);
    return BigInt(res.json().balanceMinor as string);
  }

  it('charges on approve and nets to zero once paid', async () => {
    const s = await upsert('2027-06-01', { baseAmountMinor: '70000' });
    const before = await balanceOf(MEMBER);

    await app.inject({ method: 'POST', url: `/payout-statements/${s.id}/approve`, headers: h() });
    // The charge is what a `Payment` would have posted on creation: she is OWED this.
    expect(await balanceOf(MEMBER)).toBe(before + 70000n);

    await app.inject({
      method: 'POST',
      url: `/payout-statements/${s.id}/register`,
      headers: h(),
      payload: { amountMinor: '70000' },
    });
    // Charge then credit: back where it started. Before this, paying drove it DOWN by the
    // whole amount and stayed there.
    expect(await balanceOf(MEMBER)).toBe(before);
  });

  it('does not charge a draft', async () => {
    const before = await balanceOf(MEMBER);
    await upsert('2027-07-01', { baseAmountMinor: '30000' });
    // A draft is a working figure the operator is still assembling. Charging it would put
    // a number on her account that nobody has committed to paying.
    expect(await balanceOf(MEMBER)).toBe(before);
  });

  it('follows the total when an approved statement is adjusted', async () => {
    const s = await upsert('2027-08-01', { baseAmountMinor: '50000' });
    await app.inject({ method: 'POST', url: `/payout-statements/${s.id}/approve`, headers: h() });
    const afterApprove = await balanceOf(MEMBER);

    await app.inject({
      method: 'POST',
      url: `/payout-statements/${s.id}/adjustments`,
      headers: h(),
      payload: { description: 'Viáticos', amountMinor: '12000' },
    });
    // The DELTA only — a second full charge would double what she is owed.
    expect(await balanceOf(MEMBER)).toBe(afterApprove + 12000n);

    const negative = await app.inject({
      method: 'POST',
      url: `/payout-statements/${s.id}/adjustments`,
      headers: h(),
      payload: { description: 'Descuento', amountMinor: '-2000' },
    });
    expect(negative.statusCode).toBe(201);
    // A reduction is a CREDIT entry, not a rewritten row: the ledger is append-only by
    // its own contract and corrections are entries.
    expect(await balanceOf(MEMBER)).toBe(afterApprove + 10000n);
  });

  it('follows the total when an approved statement is re-planned', async () => {
    const s = await upsert('2027-09-01', { baseAmountMinor: '40000' });
    await app.inject({ method: 'POST', url: `/payout-statements/${s.id}/approve`, headers: h() });
    const afterApprove = await balanceOf(MEMBER);

    // `upsert` carries no status guard, so it can restate an approved statement.
    await upsert('2027-09-01', { baseAmountMinor: '65000' });
    expect(await balanceOf(MEMBER)).toBe(afterApprove + 25000n);
  });

  it('charges once, however many times the total is re-saved unchanged', async () => {
    const before = await balanceOf(MEMBER);
    const s = await upsert('2027-10-01', { baseAmountMinor: '15000' });
    await app.inject({ method: 'POST', url: `/payout-statements/${s.id}/approve`, headers: h() });
    const once = await balanceOf(MEMBER);
    // Asserted FIRST, so the idempotency check below cannot pass by nothing ever being
    // charged — which is exactly how it read with the charge disabled.
    expect(once).toBe(before + 15000n);

    await upsert('2027-10-01', { baseAmountMinor: '15000' });
    await upsert('2027-10-01', { baseAmountMinor: '15000' });
    // Idempotent by construction: it posts total-minus-already-charged, which is zero.
    expect(await balanceOf(MEMBER)).toBe(once);
  });
});
