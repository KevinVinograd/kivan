/**
 * Billing / Cobros integration (real Postgres, non-superuser app role). Focus on
 * the money-correctness guarantees: derived totals, ATOMIC collect under
 * concurrency (no oversell), idempotent collect, atomic comprobante sequence,
 * emitter quota reserve-before-effect, cancel, and fail-closed authz.
 */
import { execSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

let container: StartedPostgreSqlContainer;
let app: FastifyInstance;

const WS = '0a000000-0000-4000-8000-000000000001';
const OWNER_EMAIL = 'owner@studio.test';
const EMPLOYEE_EMAIL = 'emp@studio.test';
const PASSWORD = 'a-correct-password';
const CLIENT = '0a000000-0000-4000-8000-000000000002';
const EMITTER_OK = '0a000000-0000-4000-8000-000000000003';
const EMITTER_CAPPED = '0a000000-0000-4000-8000-000000000004';

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
  // that. A 429 here would fail a test for a reason that has nothing to do with billing —
  // and it fails as a confusing shape error, not as "rate limited", because the throttled
  // body is an object where the assertion expects a list. The limiter itself is covered
  // in auth.test.ts, where it is the subject rather than the environment.
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
  await admin.query(`INSERT INTO "Client" (id, name, "updatedAt") VALUES ($1, 'Café Roma', now())`, [CLIENT]);
  await admin.query(
    `INSERT INTO "InvoiceEmitter" (id, code, label, "puntoDeVenta", "nextNumber", connected)
     VALUES ($1, 'monotributo_1', 'MT 1', 4, 1, true)`,
    [EMITTER_OK],
  );
  await admin.query(
    `INSERT INTO "InvoiceEmitter" (id, code, label, "monthlyLimitMinor", connected)
     VALUES ($1, 'monotributo_2', 'MT 2', 1000, true)`,
    [EMITTER_CAPPED],
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
  const t = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: OWNER_EMAIL, password: PASSWORD } });
  token = t.json().accessToken;
  const e = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: EMPLOYEE_EMAIL, password: PASSWORD } });
  empToken = e.json().accessToken;
});

function h(t = token) {
  return { authorization: `Bearer ${t}` };
}

async function createReceivable(body: Record<string, unknown>): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/receivables',
    headers: h(),
    payload: { clientId: CLIENT, period: '2026-06-01', service: 'Redes', dueDate: '2026-06-30', ...body },
  });
  expect(res.statusCode).toBe(201);
  return res.json().id as string;
}

describe('billing', () => {
  it('derives the total server-side and collects without overselling', async () => {
    const id = await createReceivable({ baseAmountMinor: '50000', extraAmountMinor: '5000', discountAmountMinor: '1000' });

    const got = await app.inject({ method: 'GET', url: `/receivables/${id}`, headers: h() });
    expect(got.json().totalAmountMinor).toBe('54000');
    expect(got.json().status).toBe('pending');

    const partial = await app.inject({ method: 'POST', url: `/receivables/${id}/collect`, headers: h(), payload: { amountMinor: '20000' } });
    expect(partial.json().status).toBe('partial');
    expect(partial.json().outstandingMinor).toBe('34000');

    const over = await app.inject({ method: 'POST', url: `/receivables/${id}/collect`, headers: h(), payload: { amountMinor: '40000' } });
    expect(over.statusCode).toBe(409);

    const rest = await app.inject({ method: 'POST', url: `/receivables/${id}/collect`, headers: h(), payload: { amountMinor: '34000' } });
    expect(rest.json().status).toBe('collected');
    expect(rest.json().collectedAmountMinor).toBe('54000');
  });

  it('stamps a backdated collection without re-bucketing the money into another month', async () => {
    // A cobro is routinely registered days after the cash arrived. Before this the
    // date was not stored at all, so the UI displayed the row's createdAt as the
    // "Fecha de cobro" — a data-entry timestamp presented as a business fact.
    const id = await createReceivable({ baseAmountMinor: '10000' });
    const res = await app.inject({
      method: 'POST',
      url: `/receivables/${id}/collect`,
      headers: h(),
      payload: { amountMinor: '10000', collectedAt: '2026-05-02' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().collectedAt.slice(0, 10)).toBe('2026-05-02');

    // The load-bearing half: every aggregate filters on the receivable's own
    // `period`, so backdating records WHEN the money moved without moving WHICH
    // month it counts toward. If this ever flips, the monthly close silently
    // changes shape for every already-closed month.
    const after = await app.inject({ method: 'GET', url: `/receivables/${id}`, headers: h() });
    expect(after.json().period).toBe('2026-06-01');
  });

  it('defaults the collection date to now when the caller does not choose one', async () => {
    const id = await createReceivable({ baseAmountMinor: '10000' });
    const res = await app.inject({
      method: 'POST',
      url: `/receivables/${id}/collect`,
      headers: h(),
      payload: { amountMinor: '10000' },
    });
    expect(res.json().collectedAt.slice(0, 10)).toBe(new Date().toISOString().slice(0, 10));
  });

  it('never oversells under concurrent collects', async () => {
    const id = await createReceivable({ baseAmountMinor: '1000' });

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        app.inject({ method: 'POST', url: `/receivables/${id}/collect`, headers: h(), payload: { amountMinor: '100' } }),
      ),
    );
    const ok = results.filter((r) => r.statusCode === 200);
    // total is 1000; each collect is 100 → at most 10 can succeed.
    expect(ok.length).toBe(10);
    // and no successful response ever reports more than the total collected.
    for (const r of ok) {
      expect(BigInt(r.json().collectedAmountMinor) <= 1000n).toBe(true);
    }

    const final = await app.inject({ method: 'GET', url: `/receivables/${id}`, headers: h() });
    expect(final.json().collectedAmountMinor).toBe('1000');
    expect(final.json().status).toBe('collected');
  });

  it('applies an idempotent collect at most once', async () => {
    const id = await createReceivable({ baseAmountMinor: '10000' });

    const first = await app.inject({ method: 'POST', url: `/receivables/${id}/collect`, headers: h(), payload: { amountMinor: '5000', idempotencyKey: 'k-1' } });
    expect(first.json().collectedAmountMinor).toBe('5000');

    const retry = await app.inject({ method: 'POST', url: `/receivables/${id}/collect`, headers: h(), payload: { amountMinor: '5000', idempotencyKey: 'k-1' } });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().collectedAmountMinor).toBe('5000'); // NOT 10000 — applied once
  });

  it('generates a comprobante with an atomic sequence and blocks double-invoicing', async () => {
    const id = await createReceivable({ baseAmountMinor: '30000' });

    const inv = await app.inject({ method: 'POST', url: `/receivables/${id}/invoice/generate`, headers: h(), payload: { emitterId: EMITTER_OK } });
    expect(inv.statusCode).toBe(200);
    expect(inv.json().billingStatus).toBe('invoiced');
    expect(inv.json().invoiceNumber).toMatch(/^00004-0000000\d$/); // puntoDeVenta 4 + seq
    expect(inv.json().cae).toBeTruthy();

    const again = await app.inject({ method: 'POST', url: `/receivables/${id}/invoice/generate`, headers: h(), payload: { emitterId: EMITTER_OK } });
    expect(again.statusCode).toBe(409);
  });

  it('reserves emitter quota before issuing (rejects over-cap)', async () => {
    const id = await createReceivable({ baseAmountMinor: '2000' }); // > emitter monthly cap 1000
    const res = await app.inject({ method: 'POST', url: `/receivables/${id}/invoice/generate`, headers: h(), payload: { emitterId: EMITTER_CAPPED } });
    expect(res.statusCode).toBe(409);
  });

  /**
   * The cap gate compared two things that are not comparable: `issuedMinorInWindow` is
   * filtered to ARS (its own comment explains why, at length), while the incoming row's
   * `totalAmountMinor` was added raw in whatever lane it was in. Because ARS-per-USD is
   * always far greater than 1, the comparison failed OPEN every single time.
   *
   * These two cases are each other's control. The amount is 500 against a cap of 1000, so
   * it passes the arithmetic — the request is refused for the lane, not for the size, and
   * before the fix it issued a comprobante with a clean 201.
   */
  it('refuses to issue a non-peso comprobante from an emitter with a peso cap', async () => {
    const id = await createReceivable({ baseAmountMinor: '500', currency: 'USD' });
    const res = await app.inject({ method: 'POST', url: `/receivables/${id}/invoice/generate`, headers: h(), payload: { emitterId: EMITTER_CAPPED } });

    expect(res.statusCode).toBe(409);
    // The reason has to reach the operator: 500 < 1000, so "quota would be exceeded"
    // would be a lie about why it was refused.
    expect(res.json().error.message).toMatch(/USD/);
    expect(res.json().error.message).not.toMatch(/exceeded/);

    // And it really did not issue: no number was consumed off the emitter's sequence.
    const after = await app.inject({ method: 'GET', url: `/receivables/${id}`, headers: h() });
    expect(after.json().invoiceNumber).toBeNull();
  });

  it('still issues a PESO comprobante from the capped emitter, well under its cap', async () => {
    // The peso control. Without it the refusal could be widened to every capped emisor —
    // bricking the normal path for every client — with the rest of this suite green, because
    // nothing else here issues from EMITTER_CAPPED and succeeds.
    const id = await createReceivable({ baseAmountMinor: '500' });
    const res = await app.inject({ method: 'POST', url: `/receivables/${id}/invoice/generate`, headers: h(), payload: { emitterId: EMITTER_CAPPED } });

    expect(res.statusCode).toBe(200);
    expect(res.json().invoiceNumber).toBeTruthy();
  });

  it('still issues a non-peso comprobante from an emitter with NO cap', async () => {
    // The refusal is scoped to the thing that is actually broken. An uncapped emitter has
    // no peso limit to compare a dollar amount against, so nothing is unsound there — and
    // refusing it too would have blocked a flow for no reason.
    const id = await createReceivable({ baseAmountMinor: '500', currency: 'USD' });
    const res = await app.inject({ method: 'POST', url: `/receivables/${id}/invoice/generate`, headers: h(), payload: { emitterId: EMITTER_OK } });

    expect(res.statusCode).toBe(200);
    expect(res.json().invoiceNumber).toBeTruthy();
  });

  it('cancels a receivable (soft) and hides it afterwards', async () => {
    const id = await createReceivable({ baseAmountMinor: '7000' });
    const cancelled = await app.inject({ method: 'POST', url: `/receivables/${id}/cancel`, headers: h() });
    expect(cancelled.json().status).toBe('cancelled');
    const gone = await app.inject({ method: 'GET', url: `/receivables/${id}`, headers: h() });
    expect(gone.statusCode).toBe(404);
  });

  it('rejects a negative base amount at the edge (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/receivables',
      headers: h(),
      payload: { clientId: CLIENT, period: '2026-06-01', service: 'X', dueDate: '2026-06-30', baseAmountMinor: '-5000' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('binds idempotency to the resource (same key on two receivables both apply)', async () => {
    const a = await createReceivable({ baseAmountMinor: '10000' });
    const b = await createReceivable({ baseAmountMinor: '10000' });
    const ra = await app.inject({ method: 'POST', url: `/receivables/${a}/collect`, headers: h(), payload: { amountMinor: '1000', idempotencyKey: 'shared-key' } });
    const rb = await app.inject({ method: 'POST', url: `/receivables/${b}/collect`, headers: h(), payload: { amountMinor: '1000', idempotencyKey: 'shared-key' } });
    expect(ra.json().collectedAmountMinor).toBe('1000');
    expect(rb.json().collectedAmountMinor).toBe('1000'); // not swallowed despite the shared key
  });

  it('forbids an employee from the billing surface (fail-closed)', async () => {
    const res = await app.inject({ method: 'GET', url: '/receivables', headers: h(empToken) });
    expect(res.statusCode).toBe(403);
  });

  it('round-trips the monthly-plan fields (reviewStatus / effectiveDate / planNotes / extras)', async () => {
    const id = await createReceivable({ baseAmountMinor: '10000' });
    const patched = await app.inject({
      method: 'PATCH',
      url: `/receivables/${id}`,
      headers: h(),
      payload: {
        reviewStatus: 'reviewed',
        effectiveDate: '2026-06-15',
        planNotes: 'Cliente nuevo, revisar fee',
        extras: [{ description: 'Diseño extra', amountMinor: '5000', billable: true }],
      },
    });
    expect(patched.statusCode).toBe(200);
    const dto = patched.json();
    expect(dto.reviewStatus).toBe('reviewed');
    expect(dto.effectiveDate).toBe('2026-06-15'); // ISO date-only, not a timestamp
    expect(dto.planNotes).toBe('Cliente nuevo, revisar fee');
    expect(dto.extras).toHaveLength(1);
    expect(dto.extras[0]).toMatchObject({ description: 'Diseño extra', amountMinor: '5000', billable: true });

    // Persisted (re-read reflects the same plan fields).
    const got = await app.inject({ method: 'GET', url: `/receivables/${id}`, headers: h() });
    expect(got.json().reviewStatus).toBe('reviewed');
    expect(got.json().extras[0].amountMinor).toBe('5000');
  });

  it('clears effectiveDate when patched to null (nullable plan field)', async () => {
    const id = await createReceivable({ baseAmountMinor: '10000' });
    await app.inject({ method: 'PATCH', url: `/receivables/${id}`, headers: h(), payload: { effectiveDate: '2026-06-15' } });
    const cleared = await app.inject({ method: 'PATCH', url: `/receivables/${id}`, headers: h(), payload: { effectiveDate: null } });
    expect(cleared.json().effectiveDate).toBeNull();
  });

  it('associates an external factura (manual) and marks it sent — both persist', async () => {
    const id = await createReceivable({ baseAmountMinor: '10000' });

    const assoc = await app.inject({
      method: 'POST', url: `/receivables/${id}/invoice/associate`, headers: h(),
      payload: { invoiceNumber: '0001-00001234', issuedAt: '2026-06-10' },
    });
    expect(assoc.statusCode).toBe(200);
    expect(assoc.json().billingStatus).toBe('manual');
    expect(assoc.json().invoiceNumber).toBe('0001-00001234');

    // A manually-associated invoice keeps its 'manual' origin when sent.
    const sent = await app.inject({ method: 'POST', url: `/receivables/${id}/invoice/sent`, headers: h() });
    expect(sent.statusCode).toBe(200);
    expect(sent.json().billingStatus).toBe('manual');

    // Survives a reload.
    const got = await app.inject({ method: 'GET', url: `/receivables/${id}`, headers: h() });
    expect(got.json().invoiceNumber).toBe('0001-00001234');
  });

  it('marks a non-manual invoice as sent (advances to sent)', async () => {
    const id = await createReceivable({ baseAmountMinor: '10000' });
    const sent = await app.inject({ method: 'POST', url: `/receivables/${id}/invoice/sent`, headers: h() });
    expect(sent.statusCode).toBe(200);
    expect(sent.json().billingStatus).toBe('sent');
  });

  it('records the costs a cobro carries, keeps them out of the billed total, and moves the reported margin', async () => {
    const id = await createReceivable({ baseAmountMinor: '100000' });

    const upd = await app.inject({
      method: 'PATCH',
      url: `/receivables/${id}`,
      headers: h(),
      payload: { costPautaMinor: '25000', costFixedMinor: '5000' },
    });
    expect(upd.statusCode).toBe(200);
    expect(upd.json()).toMatchObject({
      costPautaMinor: '25000',
      costFixedMinor: '5000',
      // Cost is margin-side: what the client is billed does not move.
      totalAmountMinor: '100000',
    });

    // The reported margin now reflects the cost (100000 − 30000 = 70000).
    const prof = await app.inject({ method: 'GET', url: '/reports/profitability?period=2026-06-01', headers: h() });
    const row = prof.json().byClient.find((c: { clientId: string }) => c.clientId === CLIENT);
    expect(BigInt(row.costTotalMinor)).toBeGreaterThanOrEqual(30000n);

    // Editing COSTS needs the `profitability` capability, which an employee lacks — and
    // the employee cannot reach the endpoint at all (fail-closed).
    const denied = await app.inject({
      method: 'PATCH',
      url: `/receivables/${id}`,
      headers: h(empToken),
      payload: { costPautaMinor: '1' },
    });
    expect(denied.statusCode).toBe(403);
  });

  /**
   * Design, communication and production left the cobro on 2026-10-01: the cost of the
   * people on a client now comes from their assignments, and a second place to type the
   * same salary is how a designer gets counted twice. Viáticos followed: they live on each
   * production. The keys are not refused loudly — Zod strips them — so this pins that they
   * really are not STORED: a cobro that kept accepting them would quietly reopen the
   * double count.
   */
  it('no longer stores design, communication, production or viáticos on a cobro', async () => {
    const id = await createReceivable({ baseAmountMinor: '100000' });
    const upd = await app.inject({
      method: 'PATCH',
      url: `/receivables/${id}`,
      headers: h(),
      payload: {
        costDesignMinor: '10000',
        costCommMinor: '15000',
        costProductionMinor: '20000',
        costViaticsMinor: '1000',
        costPautaMinor: '1000',
      },
    });
    expect(upd.statusCode).toBe(200);
    expect(upd.json()).toMatchObject({
      costDesignMinor: '0',
      costCommMinor: '0',
      costProductionMinor: '0',
      costViaticsMinor: '0',
      costPautaMinor: '1000',
    });
  });
});

/**
 * The month generator. `Client.monthlyFeeMinor` had been stored since the client form
 * shipped and read by NOTHING — every month the studio retyped each retainer as a cobro
 * by hand. These pin the two properties that make a bulk money action safe to press:
 * it bills the amount ON THE CLIENT (never the one the caller sent), and running it a
 * second time creates nothing.
 */
describe('billing — monthly fee generation', () => {
  const PERIOD = '2026-09-01';
  let retainer = '';
  let twoServices = '';
  let paused = '';
  let noFee = '';

  async function createClient(body: Record<string, unknown>): Promise<string> {
    const res = await app.inject({ method: 'POST', url: '/clients', headers: h(), payload: body });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  beforeAll(async () => {
    retainer = await createClient({
      name: 'Retainer SA', status: 'active', monthlyFeeMinor: '120000', services: ['Redes'],
    });
    twoServices = await createClient({
      name: 'Dos Servicios', status: 'active', monthlyFeeMinor: '80000', services: ['Redes', 'Ads'],
    });
    paused = await createClient({
      name: 'En Pausa', status: 'paused', monthlyFeeMinor: '99000', services: ['Redes'],
    });
    noFee = await createClient({ name: 'Sin Abono', status: 'active', services: ['Redes'] });
  });

  it('previews only the active clients that carry a retainer, and resolves the service when there is one', async () => {
    const res = await app.inject({
      method: 'GET', url: `/receivables/monthly-fee/preview?period=${PERIOD}`, headers: h(),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().items as {
      clientId: string; suggestedService: string | null; monthlyFeeMinor: string; skipReason: string | null;
    }[];
    const ids = items.map((i) => i.clientId);

    expect(ids).toContain(retainer);
    expect(ids).toContain(twoServices);
    // A paused client has stopped paying and a client with no fee is not on a retainer:
    // neither is something the operator should have to untick every single month.
    expect(ids).not.toContain(paused);
    expect(ids).not.toContain(noFee);

    // Excluded is not the same as unmentionable. An active client carrying no fee can never
    // reach `items`, so the preview names it separately: without this the operator compares
    // a roster of 21 against 29 active clients and nothing on screen accounts for the gap.
    // A paused client is NOT named here — it is not active, so it is not part of that gap.
    const withoutFee = res.json().withoutFee as string[];
    expect(withoutFee).toContain('Sin Abono');
    expect(withoutFee).not.toContain('Retainer SA');
    expect(withoutFee).not.toContain('En Pausa');

    // A client with a resolved service still reports nothing billed by hand when nothing is.
    const items2 = res.json().items as { clientId: string; manualServices: string[] }[];
    expect(items2.find((i) => i.clientId === retainer)?.manualServices).toEqual([]);

    expect(items.find((i) => i.clientId === retainer)).toMatchObject({
      suggestedService: 'Redes', monthlyFeeMinor: '120000', skipReason: null,
    });
    // Two contracted services cannot be resolved without asking — guessing would file the
    // whole retainer under whichever happened to be first in an unordered array.
    expect(items.find((i) => i.clientId === twoServices)?.suggestedService).toBeNull();
  });

  it('bills the fee stored on the client, and charges the cuenta corriente exactly once', async () => {
    const res = await app.inject({
      method: 'POST', url: '/receivables/monthly-fee/generate', headers: h(),
      payload: { period: PERIOD, dueDate: '2026-09-10', items: [{ clientId: retainer, service: 'Redes' }] },
    });
    expect(res.statusCode).toBe(201);
    const created = res.json().created as {
      id: string; totalAmountMinor: string; source: string; period: string; dueDate: string;
    }[];
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      totalAmountMinor: '120000', source: 'monthly_fee', period: PERIOD, dueDate: '2026-09-10',
    });

    // The generated cobro is a cobro like any other: same derived total, same charge on
    // the client's running account. A second creation path is how those two drift apart.
    const ledger = await app.inject({ method: 'GET', url: `/ledger/client/${retainer}`, headers: h() });
    const charges = (ledger.json().entries as { type: string; referenceId: string }[]).filter(
      (e) => e.type === 'charge' && e.referenceId === created[0]!.id,
    );
    expect(charges).toHaveLength(1);
  });

  it('creates nothing on a second run and says which clients it skipped', async () => {
    const res = await app.inject({
      method: 'POST', url: '/receivables/monthly-fee/generate', headers: h(),
      payload: { period: PERIOD, dueDate: '2026-09-10', items: [{ clientId: retainer, service: 'Redes' }] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().created).toHaveLength(0);
    expect(res.json().skipped).toEqual([
      { clientId: retainer, clientName: 'Retainer SA', reason: 'already_generated' },
    ]);

    // And the preview now reports it as covered rather than offering it again.
    const preview = await app.inject({
      method: 'GET', url: `/receivables/monthly-fee/preview?period=${PERIOD}`, headers: h(),
    });
    const row = (
      preview.json().items as { clientId: string; skipReason: string | null; existingReceivableId: string | null }[]
    ).find((i) => i.clientId === retainer);
    expect(row?.skipReason).toBe('already_generated');
    expect(row?.existingReceivableId).not.toBeNull();
  });

  it('normalizes the period, so naming the same month by another day is still the same month', async () => {
    // Without this the unique index that makes regeneration safe never sees a collision:
    // '2026-09-01' and '2026-09-15' would be two different keys for one month.
    const res = await app.inject({
      method: 'POST', url: '/receivables/monthly-fee/generate', headers: h(),
      payload: { period: '2026-09-15', dueDate: '2026-09-10', items: [{ clientId: retainer, service: 'Redes' }] },
    });
    expect(res.json().created).toHaveLength(0);
    expect(res.json().skipped[0].reason).toBe('already_generated');
  });

  it('skips a client whose cobro for that service was already loaded by hand', async () => {
    const manual = await app.inject({
      method: 'POST', url: '/receivables', headers: h(),
      payload: {
        clientId: twoServices, period: PERIOD, service: 'Redes', baseAmountMinor: '80000', dueDate: '2026-09-10',
      },
    });
    expect(manual.statusCode).toBe(201);

    // The PREVIEW must name it, and this client is exactly the case `skipReason` cannot
    // cover: with two contracted services nothing resolves, so the manual-cobro check the
    // skip reason is built on never runs and the row previews as clean. Without
    // `manualServices` the dialog pre-ticks a client that was already invoiced by hand,
    // which is how one gets billed twice in a month.
    const preview = await app.inject({
      method: 'GET', url: `/receivables/monthly-fee/preview?period=${PERIOD}`, headers: h(),
    });
    const candidate = (preview.json().items as {
      clientId: string; skipReason: string | null; manualServices: string[];
    }[]).find((i) => i.clientId === twoServices);
    expect(candidate?.manualServices).toContain('Redes');
    expect(candidate?.skipReason).toBeNull();

    const res = await app.inject({
      method: 'POST', url: '/receivables/monthly-fee/generate', headers: h(),
      payload: { period: PERIOD, dueDate: '2026-09-10', items: [{ clientId: twoServices, service: 'Redes' }] },
    });
    expect(res.json().created).toHaveLength(0);
    expect(res.json().skipped[0]).toMatchObject({ clientId: twoServices, reason: 'manual_exists' });

    // But only for THAT service: the same client billed for Ads is a different cobro, and
    // refusing it would be the generator inventing a rule the studio does not have.
    const other = await app.inject({
      method: 'POST', url: '/receivables/monthly-fee/generate', headers: h(),
      payload: { period: PERIOD, dueDate: '2026-09-10', items: [{ clientId: twoServices, service: 'Ads' }] },
    });
    expect(other.json().created).toHaveLength(1);
    expect(other.json().created[0]).toMatchObject({ service: 'Ads', totalAmountMinor: '80000' });
  });

  it('reports a client that stopped being billable between the preview and the run', async () => {
    const res = await app.inject({
      method: 'POST', url: '/receivables/monthly-fee/generate', headers: h(),
      payload: { period: PERIOD, dueDate: '2026-09-10', items: [{ clientId: paused, service: 'Redes' }] },
    });
    expect(res.json().created).toHaveLength(0);
    expect(res.json().skipped[0]).toMatchObject({
      clientId: paused, clientName: 'En Pausa', reason: 'not_billable',
    });
  });

  it('frees the month again when the generated cobro is cancelled', async () => {
    const period = '2026-10-01';
    const first = await app.inject({
      method: 'POST', url: '/receivables/monthly-fee/generate', headers: h(),
      payload: { period, dueDate: '2026-10-10', items: [{ clientId: retainer, service: 'Redes' }] },
    });
    const id = first.json().created[0].id as string;

    await app.inject({ method: 'POST', url: `/receivables/${id}/cancel`, headers: h() });

    // Anular a wrong batch and generate again — otherwise one mistaken run locks the
    // month out of the generator forever and the operator is back to typing by hand.
    const second = await app.inject({
      method: 'POST', url: '/receivables/monthly-fee/generate', headers: h(),
      payload: { period, dueDate: '2026-10-10', items: [{ clientId: retainer, service: 'Redes' }] },
    });
    expect(second.json().created).toHaveLength(1);
  });

  it('is fail-closed: an employee can neither preview nor generate', async () => {
    const preview = await app.inject({
      method: 'GET', url: `/receivables/monthly-fee/preview?period=${PERIOD}`, headers: h(empToken),
    });
    expect(preview.statusCode).toBe(403);

    const generate = await app.inject({
      method: 'POST', url: '/receivables/monthly-fee/generate', headers: h(empToken),
      payload: { period: PERIOD, dueDate: '2026-09-10', items: [{ clientId: retainer, service: 'Redes' }] },
    });
    expect(generate.statusCode).toBe(403);
  });
});

/**
 * The client's standing discount.
 *
 * The studio agrees rates like "10% por pago en efectivo" once, per client, and was
 * retyping the resulting amount into every cobro by hand. The rate lives on the client;
 * the RESOLVED CENTAVOS live on the receivable. These pin the three properties that keep
 * those two from drifting: the amount is derived from the client's rate and never from
 * anything the caller sent, the total is the fee minus it, and the preview states the
 * same figure the run writes.
 */
describe('billing — client standing discount', () => {
  const PERIOD = '2026-11-01';
  let discounted = '';
  let plain = '';

  async function createClient(body: Record<string, unknown>): Promise<string> {
    const res = await app.inject({ method: 'POST', url: '/clients', headers: h(), payload: body });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  beforeAll(async () => {
    discounted = await createClient({
      name: 'Con Descuento', status: 'active', monthlyFeeMinor: '200000',
      services: ['Redes'], paymentMethod: 'cash', discountPercentBp: 1000,
    });
    // Same fee, no rate. The control that proves the discount is the client's and not
    // something the generator applies to everyone.
    plain = await createClient({
      name: 'Sin Descuento', status: 'active', monthlyFeeMinor: '200000', services: ['Redes'],
    });
  });

  it('states the rate and the resolved amount in the preview', async () => {
    const res = await app.inject({
      method: 'GET', url: `/receivables/monthly-fee/preview?period=${PERIOD}`, headers: h(),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().items as {
      clientId: string; discountPercentBp: number | null; discountAmountMinor: string | null;
    }[];

    expect(items.find((i) => i.clientId === discounted)).toMatchObject({
      discountPercentBp: 1000, discountAmountMinor: '20000',
    });
    // Null, not '0'. A client with no agreed discount is not a client on a discount of
    // zero, and the dialog renders the two differently.
    expect(items.find((i) => i.clientId === plain)).toMatchObject({
      discountPercentBp: null, discountAmountMinor: '0',
    });
  });

  it('writes the resolved discount on the generated cobro and derives the total from it', async () => {
    const res = await app.inject({
      method: 'POST', url: '/receivables/monthly-fee/generate', headers: h(),
      payload: {
        period: PERIOD, dueDate: '2026-11-10',
        items: [{ clientId: discounted, service: 'Redes' }, { clientId: plain, service: 'Redes' }],
      },
    });
    expect(res.statusCode).toBe(201);
    const created = res.json().created as {
      clientId: string; baseAmountMinor: string; discountAmountMinor: string; totalAmountMinor: string;
    }[];

    // The base is the full retainer — the discount is a separate, visible line, not a
    // quietly smaller fee. That is what lets a factura state both.
    expect(created.find((c) => c.clientId === discounted)).toMatchObject({
      baseAmountMinor: '200000', discountAmountMinor: '20000', totalAmountMinor: '180000',
    });
    expect(created.find((c) => c.clientId === plain)).toMatchObject({
      baseAmountMinor: '200000', discountAmountMinor: '0', totalAmountMinor: '200000',
    });
  });

  it('charges the running account the discounted total, not the retainer', async () => {
    // The ledger is what the cuenta corriente and every downstream balance read. A charge
    // for the gross would leave the client permanently owing a debt they never incurred.
    const ledger = await app.inject({ method: 'GET', url: `/ledger/client/${discounted}`, headers: h() });
    const charges = (ledger.json().entries as { type: string; debitMinor: string }[]).filter(
      (e) => e.type === 'charge',
    );
    expect(charges).toHaveLength(1);
    expect(charges[0]!.debitMinor).toBe('180000');
  });

  it('refuses a rate outside 0..100% at the edge', async () => {
    const res = await app.inject({
      method: 'POST', url: '/clients', headers: h(),
      payload: { name: 'Descuento Imposible', status: 'active', discountPercentBp: 10001 },
    });
    // 400 at the API, not a 500 from the column's CHECK: the operator gets a field error.
    expect(res.statusCode).toBe(400);
  });
});

/**
 * Where the money went.
 *
 * The Cashflow Posición is `Saldos + Ingresos pendientes − Egresos pendientes`. Before
 * this, registering a cobro removed the receivable from "Ingresos pendientes" and moved
 * no balance, so the position FELL by the amount collected — it went DOWN when money came
 * in. These pin the fix: naming a destination moves that account's balance by exactly the
 * amount, in the same transaction, so the two halves cancel.
 */
describe('billing — settlement destination', () => {
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
      payload: { name: 'Santander', type: 'bank', balanceArsMinor: '1000000' },
    });
    expect(res.statusCode).toBe(201);
    account = res.json().id as string;
  });

  it('moves the named account by exactly the amount collected, and records why', async () => {
    const id = await createReceivable({ baseAmountMinor: '30000' });
    const before = await balanceOf(account);

    const res = await app.inject({
      method: 'POST',
      url: `/receivables/${id}/collect`,
      headers: h(),
      payload: { amountMinor: '30000', collectedAt: '2026-06-15', treasuryAccountId: account },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().treasuryAccountId).toBe(account);
    expect(res.json().treasuryAccountName).toBe('Santander');

    expect(await balanceOf(account)).toBe(before + 30000n);

    // The balance column IS the balance, so the movement row is what keeps a delta from
    // being unexplained: it carries the day the money moved and what caused it.
    const moves = await app.inject({ method: 'GET', url: '/treasury/movements', headers: h() });
    const mine = (moves.json().items as { referenceId: string; amountMinor: string; direction: string; date: string }[])
      .filter((m) => m.referenceId === id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ amountMinor: '30000', direction: 'inflow', date: '2026-06-15' });
  });

  it('totals every movement even when the row list is capped', async () => {
    // `items` is a paged audit read; `totals` is what the Cashflow Saldos note reads.
    // Summing the page instead understated the money by however many rows the cap left
    // behind — silently, on the one screen whose job is explaining a balance that now
    // changes on its own.
    const first = await createReceivable({ baseAmountMinor: '11000' });
    const second = await createReceivable({ baseAmountMinor: '13000' });
    for (const id of [first, second]) {
      const res = await app.inject({
        method: 'POST',
        url: `/receivables/${id}/collect`,
        headers: h(),
        payload: {
          amountMinor: id === first ? '11000' : '13000',
          collectedAt: '2026-06-15',
          treasuryAccountId: account,
        },
      });
      expect(res.statusCode).toBe(200);
    }

    const capped = await app.inject({
      method: 'GET',
      url: '/treasury/movements?limit=1',
      headers: h(),
    });
    const body = capped.json() as {
      items: unknown[];
      totals: { accountId: string; lane: string; direction: string; amountMinor: string }[];
    };
    expect(body.items).toHaveLength(1);

    const inflow = body.totals.find(
      (t) => t.accountId === account && t.lane === 'ARS' && t.direction === 'inflow',
    );
    // Both collections, not just the one that fit on the page.
    expect(BigInt(inflow!.amountMinor)).toBeGreaterThanOrEqual(24000n);
  });

  it('moves nothing when the collection names no destination', async () => {
    const id = await createReceivable({ baseAmountMinor: '30000' });
    const before = await balanceOf(account);

    const res = await app.inject({
      method: 'POST',
      url: `/receivables/${id}/collect`,
      headers: h(),
      payload: { amountMinor: '30000' },
    });
    expect(res.statusCode).toBe(200);
    // Honest, not helpful: a collection whose destination nobody recorded reconciles
    // against no account, and guessing one is the defect this replaced.
    expect(res.json().treasuryAccountId).toBeNull();
    expect(await balanceOf(account)).toBe(before);
  });

  it('credits the balance once when the same collection is retried', async () => {
    const id = await createReceivable({ baseAmountMinor: '30000' });
    const before = await balanceOf(account);
    const payload = {
      amountMinor: '30000',
      treasuryAccountId: account,
      idempotencyKey: 'settle-retry-1',
    };

    const first = await app.inject({ method: 'POST', url: `/receivables/${id}/collect`, headers: h(), payload });
    expect(first.statusCode).toBe(200);
    const retry = await app.inject({ method: 'POST', url: `/receivables/${id}/collect`, headers: h(), payload });
    expect(retry.statusCode).toBe(200);

    // A double-credited balance is worse than a double-collected receivable: nothing
    // downstream can tell the money was never there.
    expect(await balanceOf(account)).toBe(before + 30000n);
  });

  it('rolls the whole collection back when the destination is not a live account', async () => {
    const id = await createReceivable({ baseAmountMinor: '30000' });
    const before = await balanceOf(account);

    const res = await app.inject({
      method: 'POST',
      url: `/receivables/${id}/collect`,
      headers: h(),
      payload: { amountMinor: '30000', treasuryAccountId: '0a000000-0000-4000-8000-0000000000ff' },
    });
    expect(res.statusCode).toBe(400);

    // The load-bearing half: the collection and the balance move in ONE transaction, so
    // a rejected destination must not leave the receivable marked collected.
    const after = await app.inject({ method: 'GET', url: `/receivables/${id}`, headers: h() });
    expect(after.json().collectedAmountMinor).toBe('0');
    expect(after.json().status).toBe('pending');
    expect(await balanceOf(account)).toBe(before);
  });

  it('makes a balance edit prepared before the movement fail rather than overwrite it', async () => {
    const accounts = await app.inject({ method: 'GET', url: '/treasury/accounts', headers: h() });
    const stale = (accounts.json() as { id: string; version: number }[]).find((a) => a.id === account)!;

    const id = await createReceivable({ baseAmountMinor: '30000' });
    await app.inject({
      method: 'POST',
      url: `/receivables/${id}/collect`,
      headers: h(),
      payload: { amountMinor: '30000', treasuryAccountId: account },
    });

    // The operator read a balance, money arrived, and they saved a number computed against
    // the old one. A 409 is the correct answer: silently accepting it would erase the cobro
    // from the balance while leaving the receivable collected.
    const res = await app.inject({
      method: 'PUT',
      url: `/treasury/accounts/${account}`,
      headers: h(),
      payload: { version: stale.version, balanceArsMinor: '1' },
    });
    expect(res.statusCode).toBe(409);
  });
});

/**
 * Retainers priced in dollars, invoiced in pesos.
 *
 * The studio prices several clients in USD and bills them in ARS at a rate it fixes on the
 * first business day of the month. Before this, `Client.currency = USD` produced a cobro
 * denominated in USD -- and `collect` posts its treasury movement in the RECEIVABLE's
 * currency, so registering one credited the account's USD lane with dollars that never
 * arrived, while the pesos that did arrive were recorded nowhere.
 *
 * These pin the three things that make the conversion trustworthy: it uses the rate the
 * server holds (never one the caller sent), it REFUSES rather than guessing when the month
 * has no rate, and what it billed stays legible on the row after the rate moves on.
 */
describe('billing — monthly fee generation in dollars', () => {
  const PERIOD = '2026-11-01';
  let usdClient = '';
  let arsClient = '';

  async function createFxClient(body: Record<string, unknown>): Promise<string> {
    const res = await app.inject({ method: 'POST', url: '/clients', headers: h(), payload: body });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  function preview() {
    return app.inject({
      method: 'GET', url: `/receivables/monthly-fee/preview?period=${PERIOD}`, headers: h(),
    });
  }

  beforeAll(async () => {
    usdClient = await createFxClient({
      name: 'Emblema USD', status: 'active', monthlyFeeMinor: '50000', currency: 'USD', services: ['Redes'],
    });
    arsClient = await createFxClient({
      name: 'Pesos SA', status: 'active', monthlyFeeMinor: '200000', currency: 'ARS', services: ['Redes'],
    });
  });

  it('will not bill a dollar client until the month has a rate, and says so by name', async () => {
    const res = await preview();
    const items = res.json().items as {
      clientId: string; skipReason: string | null; convertedArsMinor: string | null;
    }[];

    // Skipped, not billed in dollars. This is the whole defect: a USD cobro settles into
    // the USD lane, and the money arrives in pesos.
    expect(items.find((i) => i.clientId === usdClient)).toMatchObject({
      skipReason: 'missing_exchange_rate', convertedArsMinor: null,
    });
    // The peso client is unaffected by a rate it does not need.
    expect(items.find((i) => i.clientId === arsClient)?.skipReason).toBeNull();
    expect(res.json().exchangeRate).toBeNull();
  });

  it('refuses the write too, not only the preview', async () => {
    // The preview marks the row unselectable, but the guard cannot live there: a request
    // assembled anywhere else would otherwise bill a dollar figure as pesos.
    const res = await app.inject({
      method: 'POST', url: '/receivables/monthly-fee/generate', headers: h(),
      payload: { period: PERIOD, dueDate: '2026-11-10', items: [{ clientId: usdClient, service: 'Redes' }] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().created).toHaveLength(0);
    expect(res.json().skipped).toEqual([
      { clientId: usdClient, clientName: 'Emblema USD', reason: 'missing_exchange_rate' },
    ]);
  });

  it('stores one rate per month, normalized to the first, and replaces it on a second save', async () => {
    // Loaded on the 4th: the rate belongs to the MONTH, so it normalizes. Without that,
    // which rate the generator found would depend on the day somebody opened the dialog.
    const first = await app.inject({
      method: 'PUT', url: '/exchange-rates', headers: h(),
      payload: { period: '2026-11-04', arsPerUsdMinor: '100000' },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ period: PERIOD, arsPerUsdMinor: '100000' });

    const second = await app.inject({
      method: 'PUT', url: '/exchange-rates', headers: h(),
      payload: { period: '2026-11-20', arsPerUsdMinor: '123450' },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ period: PERIOD, arsPerUsdMinor: '123450' });

    // One row, not two. The unique index on period is what makes the second
    // save an update rather than a competing rate for the same month. Read back through the
    // preview, which is the only read path: a GET beside the PUT would be a permission-gated
    // endpoint the product never calls.
    const read = await preview();
    expect(read.json().exchangeRate).toMatchObject({ period: PERIOD, arsPerUsdMinor: '123450' });
  });

  it('previews the dollar client in pesos once the rate is loaded', async () => {
    const res = await preview();
    const items = res.json().items as {
      clientId: string; convertedArsMinor: string | null; skipReason: string | null;
    }[];
    // USD 500,00 at 1.234,50 = $617.250,00. The figure the operator approves.
    expect(items.find((i) => i.clientId === usdClient)).toMatchObject({
      skipReason: null, convertedArsMinor: '61725000', monthlyFeeMinor: '50000', currency: 'USD',
    });
    // A peso client has nothing to convert, and must not be given a converted figure that
    // merely happens to equal its fee.
    expect(items.find((i) => i.clientId === arsClient)?.convertedArsMinor).toBeNull();
    expect(res.json().exchangeRate).toMatchObject({ arsPerUsdMinor: '123450' });
  });

  it('bills the converted amount in pesos and records what produced it', async () => {
    const res = await app.inject({
      method: 'POST', url: '/receivables/monthly-fee/generate', headers: h(),
      payload: {
        period: PERIOD, dueDate: '2026-11-10',
        items: [{ clientId: usdClient, service: 'Redes' }, { clientId: arsClient, service: 'Redes' }],
      },
    });
    expect(res.statusCode).toBe(201);
    const created = res.json().created as {
      clientId: string; currency: string; totalAmountMinor: string;
      originalCurrency: string | null; originalAmountMinor: string | null; fxRateMinor: string | null;
    }[];

    // The cobro IS pesos. That is what makes the collection settle into the ARS lane of
    // whichever account the operator names.
    expect(created.find((r) => r.clientId === usdClient)).toMatchObject({
      currency: 'ARS',
      totalAmountMinor: '61725000',
      // And it remembers where that came from, so the cobro can still say "USD 500 at
      // 1.234,50" after December's rate replaces November's.
      originalCurrency: 'USD',
      originalAmountMinor: '50000',
      fxRateMinor: '123450',
    });

    // A peso client is identical to what it was before any of this existed: no conversion,
    // and all three stamps null rather than a rate it was never billed at.
    expect(created.find((r) => r.clientId === arsClient)).toMatchObject({
      currency: 'ARS',
      totalAmountMinor: '200000',
      originalCurrency: null,
      originalAmountMinor: null,
      fxRateMinor: null,
    });
  });

  it('does not reprice a generated cobro when the month rate changes afterwards', async () => {
    // The rate is a STAMP. These rows are invoiced money, so a total that shifted under an
    // issued factura would be worse than a stale one; correcting one is an amount edit.
    await app.inject({
      method: 'PUT', url: '/exchange-rates', headers: h(),
      payload: { period: PERIOD, arsPerUsdMinor: '200000' },
    });
    const list = await app.inject({ method: 'GET', url: '/receivables?limit=100', headers: h() });
    const row = (
      list.json().items as { clientId: string; totalAmountMinor: string; fxRateMinor: string | null }[]
    ).find((r) => r.clientId === usdClient);
    expect(row).toMatchObject({ totalAmountMinor: '61725000', fxRateMinor: '123450' });
  });

  it('refuses a rate of zero rather than billing every dollar client at nothing', async () => {
    // Far likelier to be an empty field than a deliberate figure, and accepting it would
    // bill the whole dollar roster at nothing with every row looking successful.
    const res = await app.inject({
      method: 'PUT', url: '/exchange-rates', headers: h(),
      payload: { period: PERIOD, arsPerUsdMinor: '0' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('is fail-closed: an employee cannot set the rate', async () => {
    const write = await app.inject({
      method: 'PUT', url: '/exchange-rates', headers: h(empToken),
      payload: { period: PERIOD, arsPerUsdMinor: '123450' },
    });
    expect(write.statusCode).toBe(403);
  });
});

/**
 * Priced contracted services: the fee as the sum of its parts.
 *
 * The studio asked for it in these words - "este importe se forma por los distintos
 * servicios ... podemos agregar o deducir servicios brindados o no para un mes en
 * particular".
 *
 * Lines are OPT-IN. A client with none bills its hand-typed fee exactly as before, which
 * is what let this ship with no backfill and no client silently leaving the generator.
 */
describe('billing - priced service lines', () => {
  const PERIOD = '2026-12-01';
  let client = '';
  let redes = '';
  let ads = '';

  async function line(clientId: string, name: string, priceMinor: string) {
    const res = await app.inject({
      method: 'POST', url: `/clients/${clientId}/service-lines`, headers: h(),
      payload: { name, priceMinor },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  beforeAll(async () => {
    client = (
      await app.inject({
        method: 'POST', url: '/clients', headers: h(),
        payload: { name: 'Desglosado SA', status: 'active', services: ['Redes', 'Ads'] },
      })
    ).json().id;
    redes = await line(client, 'Redes', '60000');
    ads = await line(client, 'Ads', '40000');
  });

  it('derives the monthly fee from the sum of the lines', async () => {
    const res = await app.inject({ method: 'GET', url: `/clients/${client}`, headers: h() });
    expect(res.json().monthlyFeeMinor).toBe('100000');
  });

  it('re-derives the fee when a price changes, in the same write', async () => {
    await app.inject({
      method: 'PATCH', url: `/service-lines/${ads}`, headers: h(), payload: { priceMinor: '50000' },
    });
    const res = await app.inject({ method: 'GET', url: `/clients/${client}`, headers: h() });
    expect(res.json().monthlyFeeMinor).toBe('110000');
    await app.inject({
      method: 'PATCH', url: `/service-lines/${ads}`, headers: h(), payload: { priceMinor: '40000' },
    });
  });

  it('lets a client fall back to its manual fee when every line is removed', async () => {
    // The safe direction, and the reason un-pricing a client cannot un-bill them: with
    // no lines left the recompute returns null rather than 0, so the fee stays at what
    // the lines last summed to and the client keeps appearing in the generator.
    const solo = (
      await app.inject({
        method: 'POST', url: '/clients', headers: h(),
        payload: { name: 'Vuelve Manual SA', status: 'active' },
      })
    ).json();
    const only = await line(solo.id, 'Redes', '80000');
    expect(
      (await app.inject({ method: 'DELETE', url: `/service-lines/${only}`, headers: h() })).statusCode,
    ).toBe(200);
    const after = await app.inject({ method: 'GET', url: `/clients/${solo.id}`, headers: h() });
    expect(after.json().monthlyFeeMinor).toBe('80000');
  });

  it('refuses a change that would take the fee to zero', async () => {
    // The silent-money case this guard exists for: a fee of 0 drops the client out of
    // `listMonthlyFeeClients` (monthlyFeeMinor > 0), so it stops being offered by the
    // generator with no error anywhere and resurfaces only in the no-fee list - exactly
    // where the operator expects to see project-only clients. The month runs green and
    // the client is never invoiced.
    const solo = (
      await app.inject({
        method: 'POST', url: '/clients', headers: h(),
        payload: { name: 'Una Linea SA', status: 'active', monthlyFeeMinor: '80000' },
      })
    ).json();
    // A single line priced at 0 is the only route to a zero fee, and it is refused
    // both on the way in and on the way to zero.
    const res = await app.inject({
      method: 'POST', url: `/clients/${solo.id}/service-lines`, headers: h(),
      payload: { name: 'Redes', priceMinor: '0' },
    });
    expect(res.statusCode).toBe(400);
    // Untouched: the refusal rolled the whole write back, it did not half-apply.
    const after = await app.inject({ method: 'GET', url: `/clients/${solo.id}`, headers: h() });
    expect(after.json().monthlyFeeMinor).toBe('80000');
    expect(
      (await app.inject({ method: 'GET', url: `/clients/${solo.id}/service-lines`, headers: h() })).json(),
    ).toEqual([]);
  });

  it('previews the lines so the dialog can offer them', async () => {
    const res = await app.inject({
      method: 'GET', url: `/receivables/monthly-fee/preview?period=${PERIOD}`, headers: h(),
    });
    const item = (
      res.json().items as { clientId: string; lines: { name: string; priceMinor: string }[] }[]
    ).find((i) => i.clientId === client);
    expect(item?.lines.map((l) => l.name)).toEqual(['Redes', 'Ads']);
    expect(item?.lines.map((l) => l.priceMinor)).toEqual(['60000', '40000']);
  });

  it('bills only the selected services, and leaves the contract alone', async () => {
    // Ads is left out of December, so the cobro is 60.000 rather than 100.000.
    const res = await app.inject({
      method: 'POST', url: '/receivables/monthly-fee/generate', headers: h(),
      payload: {
        period: PERIOD, dueDate: '2026-12-10',
        items: [{ clientId: client, service: 'Redes', clientServiceIds: [redes] }],
      },
    });
    expect(res.statusCode).toBe(201);
    const created = res.json().created as { baseAmountMinor: string; totalAmountMinor: string }[];
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ baseAmountMinor: '60000', totalAmountMinor: '60000' });

    // Leaving a service out for ONE month is not dropping it: next month it is offered
    // again, so the contract total must be unchanged.
    const after = await app.inject({ method: 'GET', url: `/clients/${client}`, headers: h() });
    expect(after.json().monthlyFeeMinor).toBe('100000');
  });

  it('refuses to edit the amount of an itemized cobro', async () => {
    // Otherwise the breakdown describes a total that is no longer true - and the
    // breakdown is what reaches the factura and the client.
    const list = await app.inject({ method: 'GET', url: `/receivables?period=${PERIOD}`, headers: h() });
    const row = (list.json().items as { id: string; clientId: string }[]).find(
      (r) => r.clientId === client,
    );
    const res = await app.inject({
      method: 'PATCH', url: `/receivables/${row!.id}`, headers: h(),
      payload: { baseAmountMinor: '999' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('takes an edit that resends the unchanged base, so a discount still goes through', async () => {
    // The edit dialog sends every amount on every save. Refusing the unchanged base made an
    // itemized cobro impossible to edit at all: its extras and discount included.
    const list = await app.inject({ method: 'GET', url: `/receivables?period=${PERIOD}`, headers: h() });
    const row = (list.json().items as { id: string; clientId: string; baseAmountMinor: string }[]).find(
      (r) => r.clientId === client,
    );
    const res = await app.inject({
      method: 'PATCH', url: `/receivables/${row!.id}`, headers: h(),
      payload: { baseAmountMinor: row!.baseAmountMinor, discountAmountMinor: '100' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ baseAmountMinor: row!.baseAmountMinor, discountAmountMinor: '100' });
  });

  it('leaves a client with NO lines billing exactly as before', async () => {
    // The reason this shipped without a backfill. Most of the book is in this state.
    const plain = (
      await app.inject({
        method: 'POST', url: '/clients', headers: h(),
        payload: {
          name: 'Sin Desglose SA', status: 'active', monthlyFeeMinor: '75000', services: ['Redes'],
        },
      })
    ).json();
    const res = await app.inject({
      method: 'POST', url: '/receivables/monthly-fee/generate', headers: h(),
      payload: { period: PERIOD, dueDate: '2026-12-10', items: [{ clientId: plain.id, service: 'Redes' }] },
    });
    expect(res.json().created[0]).toMatchObject({ baseAmountMinor: '75000' });
  });

  it('refuses a second cobro for a service already billed by hand, under ANY line name', async () => {
    // The duplicate guard the old comparison could not make. A multi-line cobro carries a
    // SUMMARY label in `service`, so comparing that one string against a hand-made
    // 'Redes' never matched - and the idempotency index only sees source='monthly_fee'.
    // The client was billed twice while the toast truthfully reported what it created.
    const period = '2027-01-01';
    const c = (
      await app.inject({
        method: 'POST', url: '/clients', headers: h(),
        payload: { name: 'Doble Cobro SA', status: 'active' },
      })
    ).json();
    const a = await line(c.id, 'Redes', '30000');
    const b = await line(c.id, 'Ads', '20000');

    await app.inject({
      method: 'POST', url: '/receivables', headers: h(),
      payload: {
        clientId: c.id, period, service: 'Redes', baseAmountMinor: '30000',
        currency: 'ARS', dueDate: '2027-01-10',
      },
    });

    const res = await app.inject({
      method: 'POST', url: '/receivables/monthly-fee/generate', headers: h(),
      payload: {
        period, dueDate: '2027-01-10',
        items: [{ clientId: c.id, service: 'Abono mensual', clientServiceIds: [a, b] }],
      },
    });
    expect(res.json().created).toHaveLength(0);
    expect(res.json().skipped[0]).toMatchObject({ clientId: c.id, reason: 'manual_exists' });
  });
});
