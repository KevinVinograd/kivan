/**
 * Cuentas corrientes (ledger) integration. Verifies that money operations emit
 * append-only ledger entries in the same transaction, the running balance is
 * correct (debit − credit cumulative), and the read endpoints work.
 */
import { execSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

let container: StartedPostgreSqlContainer;
let app: FastifyInstance;

const WS = '1b000000-0000-4000-8000-000000000001';
const OWNER_EMAIL = 'owner@studio.test';
const EMPLOYEE_EMAIL = 'emp@studio.test';
const PASSWORD = 'a-correct-password';
const CLIENT = '1b000000-0000-4000-8000-000000000002';

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

describe('cuentas corrientes (ledger)', () => {
  it('records a client charge on receivable create and a collection on collect', async () => {
    const rec = await app.inject({
      method: 'POST',
      url: '/receivables',
      headers: h(),
      payload: { clientId: CLIENT, period: '2026-06-01', service: 'Redes', dueDate: '2026-06-30', baseAmountMinor: '100000' },
    });
    expect(rec.statusCode).toBe(201);

    const afterCharge = await app.inject({ method: 'GET', url: `/ledger/client/${CLIENT}`, headers: h() });
    expect(afterCharge.json().balanceMinor).toBe('100000');
    expect(afterCharge.json().entries[0]).toMatchObject({ type: 'charge', debitMinor: '100000', balanceMinor: '100000' });

    await app.inject({ method: 'POST', url: `/receivables/${rec.json().id}/collect`, headers: h(), payload: { amountMinor: '30000' } });
    const afterCollect = await app.inject({ method: 'GET', url: `/ledger/client/${CLIENT}`, headers: h() });
    expect(afterCollect.json().balanceMinor).toBe('70000'); // 100000 charge − 30000 collection
    expect(afterCollect.json().entries[0]).toMatchObject({ type: 'collection', creditMinor: '30000', balanceMinor: '70000' });
  });

  it('records a provider charge on payment create and a payment on register', async () => {
    const prov = await app.inject({ method: 'POST', url: '/providers', headers: h(), payload: { name: 'Imprenta' } });
    const providerId = prov.json().id as string;

    const pay = await app.inject({
      method: 'POST',
      url: '/payments',
      headers: h(),
      payload: { recipientType: 'provider', providerId, recipientName: 'Imprenta', period: '2026-06-01', concept: 'Folletos', expectedDate: '2026-06-30', totalAmountMinor: '50000' },
    });
    expect(pay.statusCode).toBe(201);

    await app.inject({ method: 'POST', url: `/payments/${pay.json().id}/register`, headers: h(), payload: { amountMinor: '20000' } });
    const stmt = await app.inject({ method: 'GET', url: `/ledger/provider/${providerId}`, headers: h() });
    expect(stmt.json().balanceMinor).toBe('30000'); // 50000 charge − 20000 payment
    expect(stmt.json().entries[0]).toMatchObject({ type: 'payment', creditMinor: '20000' });
  });

  it('lists accounts with their current balance', async () => {
    const accounts = await app.inject({ method: 'GET', url: '/ledger/client', headers: h() });
    expect(accounts.statusCode).toBe(200);
    const cafe = accounts.json().find((a: { entityId: string }) => a.entityId === CLIENT);
    expect(cafe.balanceMinor).toBe('70000');
  });

  it('forbids an employee from the ledger surface (fail-closed)', async () => {
    const res = await app.inject({ method: 'GET', url: '/ledger/client', headers: h(empToken) });
    expect(res.statusCode).toBe(403);
  });
});

describe('ledger stays in lock-step on edit + cancel', () => {
  // Fresh accounts so we do not collide with the shared-state tests above.
  const clientBalance = async (clientId: string) =>
    (await app.inject({ method: 'GET', url: `/ledger/client/${clientId}`, headers: h() })).json().balanceMinor;
  const providerBalance = async (providerId: string) =>
    (await app.inject({ method: 'GET', url: `/ledger/provider/${providerId}`, headers: h() })).json().balanceMinor;

  it('adjusts the client balance when a receivable total changes, and reverses the outstanding on cancel', async () => {
    const clientId = (await app.inject({ method: 'POST', url: '/clients', headers: h(), payload: { name: 'Bar Lux' } })).json().id as string;

    // create 100000 → charge
    const recId = (await app.inject({
      method: 'POST', url: '/receivables', headers: h(),
      payload: { clientId, period: '2026-06-01', service: 'Ads', dueDate: '2026-06-30', baseAmountMinor: '100000' },
    })).json().id as string;
    expect(await clientBalance(clientId)).toBe('100000');

    // edit DOWN to 60000 → adjustment credit 40000
    await app.inject({ method: 'PATCH', url: `/receivables/${recId}`, headers: h(), payload: { baseAmountMinor: '60000' } });
    expect(await clientBalance(clientId)).toBe('60000');

    // collect 20000
    await app.inject({ method: 'POST', url: `/receivables/${recId}/collect`, headers: h(), payload: { amountMinor: '20000' } });
    expect(await clientBalance(clientId)).toBe('40000');

    // cancel → reverse the outstanding 40000 → account back to 0
    const cancel = await app.inject({ method: 'POST', url: `/receivables/${recId}/cancel`, headers: h() });
    expect(cancel.statusCode).toBe(200);
    expect(await clientBalance(clientId)).toBe('0');

    // the corrections are recorded as ledger entries, not silent row mutations
    const types = (await app.inject({ method: 'GET', url: `/ledger/client/${clientId}`, headers: h() }))
      .json().entries.map((e: { type: string }) => e.type);
    expect(types).toContain('adjustment');
    expect(types).toContain('reversal');

    // a second cancel finds nothing (soft-deleted) → no double reversal
    const again = await app.inject({ method: 'POST', url: `/receivables/${recId}/cancel`, headers: h() });
    expect(again.statusCode).toBe(404);
  });

  it('posts an upward adjustment when a receivable total is raised', async () => {
    const clientId = (await app.inject({ method: 'POST', url: '/clients', headers: h(), payload: { name: 'Kiosco 24h' } })).json().id as string;
    const recId = (await app.inject({
      method: 'POST', url: '/receivables', headers: h(),
      payload: { clientId, period: '2026-06-01', service: 'Redes', dueDate: '2026-06-30', baseAmountMinor: '50000' },
    })).json().id as string;
    await app.inject({ method: 'PATCH', url: `/receivables/${recId}`, headers: h(), payload: { baseAmountMinor: '80000' } });
    expect(await clientBalance(clientId)).toBe('80000'); // 50000 charge + 30000 adjustment debit
  });

  it('reverses the outstanding on a provider payment cancel', async () => {
    const providerId = (await app.inject({ method: 'POST', url: '/providers', headers: h(), payload: { name: 'Fletes SA' } })).json().id as string;
    const payId = (await app.inject({
      method: 'POST', url: '/payments', headers: h(),
      payload: { recipientType: 'provider', providerId, recipientName: 'Fletes SA', period: '2026-06-01', concept: 'Envios', expectedDate: '2026-06-30', totalAmountMinor: '80000' },
    })).json().id as string;
    expect(await providerBalance(providerId)).toBe('80000');
    await app.inject({ method: 'POST', url: `/payments/${payId}/register`, headers: h(), payload: { amountMinor: '30000' } });
    expect(await providerBalance(providerId)).toBe('50000');
    await app.inject({ method: 'POST', url: `/payments/${payId}/cancel`, headers: h() });
    expect(await providerBalance(providerId)).toBe('0'); // outstanding 50000 reversed
  });
});

describe('period-scoped statement', () => {
  /**
   * One provider across two months, so the two questions the endpoint answers can
   * be told apart:
   *
   *   May   charge 100000, register 40000  → May closes at 60000
   *   June  charge  50000                  → June opens at 60000, closes at 110000
   *
   * The account's LIVE balance is 110000 throughout. Asking for MAY must therefore
   * report a 60000 close alongside a 110000 live balance — if those two ever come
   * out equal, the period scoping is not scoping anything.
   */
  let providerId = '';
  let mayPaymentId = '';

  const statement = async (query: string) =>
    (
      await app.inject({ method: 'GET', url: `/ledger/provider/${providerId}${query}`, headers: h() })
    ).json();

  beforeAll(async () => {
    providerId = (
      await app.inject({ method: 'POST', url: '/providers', headers: h(), payload: { name: 'Papelera Norte' } })
    ).json().id as string;

    mayPaymentId = (
      await app.inject({
        method: 'POST', url: '/payments', headers: h(),
        payload: { recipientType: 'provider', providerId, recipientName: 'Papelera Norte', period: '2026-05-01', concept: 'Resmas', expectedDate: '2026-05-31', totalAmountMinor: '100000' },
      })
    ).json().id as string;
    await app.inject({ method: 'POST', url: `/payments/${mayPaymentId}/register`, headers: h(), payload: { amountMinor: '40000' } });

    await app.inject({
      method: 'POST', url: '/payments', headers: h(),
      payload: { recipientType: 'provider', providerId, recipientName: 'Papelera Norte', period: '2026-06-01', concept: 'Sobres', expectedDate: '2026-06-30', totalAmountMinor: '50000' },
    });
  });

  it('omits the period summary entirely when the caller does not scope', async () => {
    const body = await statement('');
    // Absent, not four zeroes: a consumer must not be able to read "no period asked
    // for" as "a period with no movement".
    expect(body.period).toBeUndefined();
    expect(body.entries).toHaveLength(3); // charge, payment, charge
    expect(body.balanceMinor).toBe('110000');
  });

  it('carries the earlier month in as the opening balance', async () => {
    const june = await statement('?period=2026-06-01');
    expect(june.period).toEqual({
      currency: 'ARS',
      openingBalanceMinor: '60000', // May's close: 100000 charged − 40000 paid
      debitMinor: '50000',
      settledMinor: '0',
      creditAdjustmentsMinor: '0',
      closingBalanceMinor: '110000',
    });
  });

  it('reports a past month at ITS close, not at the account balance today', async () => {
    const may = await statement('?period=2026-05-01');
    expect(may.period.openingBalanceMinor).toBe('0');
    expect(may.period.debitMinor).toBe('100000');
    expect(may.period.settledMinor).toBe('40000');
    expect(may.period.creditAdjustmentsMinor).toBe('0');
    expect(may.period.closingBalanceMinor).toBe('60000');
    // The live balance is a DIFFERENT question and keeps its own answer.
    expect(may.balanceMinor).toBe('110000');
  });

  it('accepts any day of the month, not only the first', async () => {
    const mid = await statement('?period=2026-06-18');
    const first = await statement('?period=2026-06-01');
    expect(mid.period).toEqual(first.period);
  });

  it('narrows the entries to the month, and counts only those', async () => {
    const may = await statement('?period=2026-05-01');
    expect(may.total).toBe(2); // pagination must count what it is paging through
    expect(may.entries).toHaveLength(2);
    expect(may.entries.every((e: { period: string }) => e.period.startsWith('2026-05'))).toBe(true);
  });

  it('reports a month with no movement as zeroes on top of the carried balance', async () => {
    const july = await statement('?period=2026-07-01');
    expect(july.entries).toHaveLength(0);
    expect(july.period).toEqual({
      currency: 'ARS',
      openingBalanceMinor: '110000',
      debitMinor: '0',
      settledMinor: '0',
      creditAdjustmentsMinor: '0',
      closingBalanceMinor: '110000',
    });
  });

  /**
   * The reason the summary is AGGREGATED per period instead of read off the running
   * `balanceMinor` column.
   *
   * Editing the May payment now appends a MAY-period adjustment with the newest
   * `seq` in the account. The last row ordered by seq whose period precedes June is
   * therefore that adjustment — and its running balance (140000) already contains
   * June's charge. An implementation that trusted the running column would open June
   * at 140000 instead of 90000, overstating the carried debt by exactly the June
   * charge it had not happened yet.
   */
  it('opens the month correctly even when an earlier period is edited afterwards', async () => {
    await app.inject({
      method: 'PATCH', url: `/payments/${mayPaymentId}`, headers: h(),
      payload: { totalAmountMinor: '130000' },
    });

    const may = await statement('?period=2026-05-01');
    expect(may.period.debitMinor).toBe('130000'); // 100000 charge + 30000 adjustment
    expect(may.period.closingBalanceMinor).toBe('90000');

    const june = await statement('?period=2026-06-01');
    expect(june.period.openingBalanceMinor).toBe('90000'); // NOT 140000
    expect(june.period.closingBalanceMinor).toBe('140000');
  });

  /**
   * A credit is not a payment.
   *
   * Three different things write credits — a register (money moved), an edit that
   * lowers a total, and a cancel reversing what was outstanding — and only the first
   * is money leaving the studio. Summed into one figure labelled `Pagado`, correcting
   * a 100000 charge down to 60000 reports 40000 as paid on a month when nothing was.
   */
  it('keeps corrections out of what was settled', async () => {
    const provId = (
      await app.inject({ method: 'POST', url: '/providers', headers: h(), payload: { name: 'Cartelería Sur' } })
    ).json().id as string;
    const payId = (
      await app.inject({
        method: 'POST', url: '/payments', headers: h(),
        payload: { recipientType: 'provider', providerId: provId, recipientName: 'Cartelería Sur', period: '2026-08-01', concept: 'Lonas', expectedDate: '2026-08-31', totalAmountMinor: '100000' },
      })
    ).json().id as string;

    // A routine correction. Nothing has been registered; not one peso has moved.
    await app.inject({
      method: 'PATCH', url: `/payments/${payId}`, headers: h(),
      payload: { totalAmountMinor: '60000' },
    });

    const august = (
      await app.inject({ method: 'GET', url: `/ledger/provider/${provId}?period=2026-08-01`, headers: h() })
    ).json();
    expect(august.period.debitMinor).toBe('100000');
    expect(august.period.settledMinor).toBe('0'); // NOT '40000'
    expect(august.period.creditAdjustmentsMinor).toBe('40000');
    expect(august.period.closingBalanceMinor).toBe('60000');
  });

  it('counts a cancellation as a reversal, not as money paid', async () => {
    const provId = (
      await app.inject({ method: 'POST', url: '/providers', headers: h(), payload: { name: 'Vinilos Norte' } })
    ).json().id as string;
    const payId = (
      await app.inject({
        method: 'POST', url: '/payments', headers: h(),
        payload: { recipientType: 'provider', providerId: provId, recipientName: 'Vinilos Norte', period: '2026-08-01', concept: 'Vinilos', expectedDate: '2026-08-31', totalAmountMinor: '80000' },
      })
    ).json().id as string;
    await app.inject({ method: 'POST', url: `/payments/${payId}/register`, headers: h(), payload: { amountMinor: '30000' } });
    await app.inject({ method: 'POST', url: `/payments/${payId}/cancel`, headers: h() });

    const august = (
      await app.inject({ method: 'GET', url: `/ledger/provider/${provId}?period=2026-08-01`, headers: h() })
    ).json();
    // 30000 really went out; the 50000 reversal did not.
    expect(august.period.settledMinor).toBe('30000');
    expect(august.period.creditAdjustmentsMinor).toBe('50000');
    expect(august.period.closingBalanceMinor).toBe('0');
  });

  it('still forbids an employee (the period query is not a way around the gate)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/ledger/provider/${providerId}?period=2026-06-01`,
      headers: h(empToken),
    });
    expect(res.statusCode).toBe(403);
  });
});

/**
 * A running account is PER LANE.
 *
 * `LedgerEntry` had no currency and `balanceMinor` was a running debit-minus-credit for
 * (entityType, entityId) alone, so a pago in dollars to a provider owed pesos netted
 * dollars against the peso balance. The /pagos detail rendered that number as "Saldo al
 * cierre" for an operator to reconcile against a bank statement.
 */
describe('ledger lanes', () => {
  it('keeps a dollar pago off the peso balance and on its own', async () => {
    const prov = await app.inject({
      method: 'POST', url: '/providers', headers: h(), payload: { name: 'Estudio Dolar' },
    });
    const providerId = prov.json().id as string;

    const mk = (body: Record<string, unknown>) =>
      app.inject({
        method: 'POST', url: '/payments', headers: h(),
        payload: {
          recipientType: 'provider', providerId, recipientName: 'Estudio Dolar',
          period: '2026-06-01', concept: 'Trabajo', expectedDate: '2026-06-30', ...body,
        },
      });

    const ars = await mk({ totalAmountMinor: '300000' });
    const usd = await mk({ totalAmountMinor: '4000', currency: 'USD' });
    expect([ars.statusCode, usd.statusCode]).toEqual([201, 201]);

    const stmt = await app.inject({
      method: 'GET', url: `/ledger/provider/${providerId}`, headers: h(),
    });
    const body = stmt.json();

    // Two independent running balances, neither of them a sum of the other.
    expect(body.balancesMinor).toEqual({ ARS: '300000', USD: '4000' });
    // `balanceMinor` is the PESO lane specifically, kept for a reader that predates
    // `balancesMinor`. Before the lane existed it would have read '304000': pesos and
    // dollars added at face value.
    expect(body.balanceMinor).toBe('300000');
  });

  it('scopes the entries and the period summary to the lane asked for', async () => {
    const prov = await app.inject({
      method: 'POST', url: '/providers', headers: h(), payload: { name: 'Estudio Lane' },
    });
    const providerId = prov.json().id as string;
    const mk = (body: Record<string, unknown>) =>
      app.inject({
        method: 'POST', url: '/payments', headers: h(),
        payload: {
          recipientType: 'provider', providerId, recipientName: 'Estudio Lane',
          period: '2026-07-01', concept: 'Trabajo', expectedDate: '2026-07-30', ...body,
        },
      });
    await mk({ totalAmountMinor: '500000' });
    await mk({ totalAmountMinor: '7000', currency: 'USD' });

    const usd = await app.inject({
      method: 'GET',
      url: `/ledger/provider/${providerId}?period=2026-07-01&currency=USD`,
      headers: h(),
    });
    const body = usd.json();

    // One entry, in the lane asked for, and the month's figures are that lane's.
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]).toMatchObject({ currency: 'USD', debitMinor: '7000' });
    expect(body.total).toBe(1);
    expect(body.period.debitMinor).toBe('7000');
    expect(body.period.closingBalanceMinor).toBe('7000');
    // The balances stay complete even though the entries were scoped: showing one lane of
    // a two-lane account would omit money from a figure somebody reconciles against.
    expect(body.balancesMinor).toEqual({ ARS: '500000', USD: '7000' });
  });

  it('registers a dollar pago against the dollar balance only', async () => {
    const prov = await app.inject({
      method: 'POST', url: '/providers', headers: h(), payload: { name: 'Estudio Settle' },
    });
    const providerId = prov.json().id as string;
    const usd = await app.inject({
      method: 'POST', url: '/payments', headers: h(),
      payload: {
        recipientType: 'provider', providerId, recipientName: 'Estudio Settle',
        period: '2026-08-01', concept: 'Trabajo', expectedDate: '2026-08-30',
        totalAmountMinor: '9000', currency: 'USD',
      },
    });
    await app.inject({
      method: 'POST', url: `/payments/${usd.json().id}/register`, headers: h(),
      payload: { amountMinor: '9000' },
    });

    const body = (
      await app.inject({ method: 'GET', url: `/ledger/provider/${providerId}`, headers: h() })
    ).json();
    // 9000 charge - 9000 payment, in the dollar lane. No peso lane exists at all, which is
    // the truth: nothing was ever owed in pesos.
    expect(body.balancesMinor).toEqual({ USD: '0' });
    expect(body.balanceMinor).toBe('0');
  });
});

/**
 * An UNSCOPED statement returns entries from every lane, while the period summary is
 * necessarily one lane's — five figures that close as an identity cannot span two. That
 * default has to be reported, or a consumer reads a peso summary beside a mixed list
 * with nothing saying so.
 */
describe('ledger statement — the summary names its lane', () => {
  it('reports the lane it summarised, scoped or not', async () => {
    const auth = h();
    const unscoped = await app.inject({
      method: 'GET',
      url: `/ledger/client/${CLIENT}?period=2026-06-01`,
      headers: auth,
    });
    expect(unscoped.statusCode).toBe(200);
    expect(unscoped.json().period.currency).toBe('ARS');

    const scoped = await app.inject({
      method: 'GET',
      url: `/ledger/client/${CLIENT}?period=2026-06-01&currency=USD`,
      headers: auth,
    });
    expect(scoped.statusCode).toBe(200);
    expect(scoped.json().period.currency).toBe('USD');
  });
});
