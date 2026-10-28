/**
 * Monthly-plan sub-resources (productions / expenses / alerts) integration:
 * create → list, the optimistic-version guard (stale PUT → 409), and soft-delete.
 */
import { execSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

let container: StartedPostgreSqlContainer;
let app: FastifyInstance;
let token = '';

const WS = '0e000000-0000-4000-8000-000000000001';
const EMAIL = 'owner@plan.test';
const PASSWORD = 'a-correct-password';
const MEMBER_A = '0e000000-0000-4000-8000-0000000000a1';
const MEMBER_B = '0e000000-0000-4000-8000-0000000000b1';
/** A well-formed uuid belonging to nobody — the id an attribution must refuse. */
const STRANGER = '0e000000-0000-4000-8000-0000000000ff';

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('hold').withUsername('owner').withPassword('owner').start();
  const ownerUrl = container.getConnectionUri();
  execSync('pnpm --filter @hold/db exec prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: ownerUrl }, stdio: 'pipe',
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
    `INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, 'V', 'O', 'owner', now())`,
    [EMAIL, passwordHash],
  );
  for (const [id, name] of [
    [MEMBER_A, 'Ana Ruiz'],
    [MEMBER_B, 'Bruno Sosa'],
  ] as const) {
    await admin.query(
      `INSERT INTO "TeamMember" (id, name, role, "employmentType", "compensationModel", "updatedAt")
       VALUES ($1, $2, 'designer', 'collaborator', 'hourly', now())`,
      [id, name],
    );
  }
  await admin.end();

  process.env.DATABASE_URL = ownerUrl.replace('owner:owner@', 'hold_app:app@');
  const { buildApp } = await import('../src/app.js');
  app = await buildApp();
  token = (await app.inject({ method: 'POST', url: '/auth/login', payload: { email: EMAIL, password: PASSWORD } })).json().accessToken;
});

afterAll(async () => {
  await app?.close();
  await container?.stop();
});

function auth() {
  return { authorization: `Bearer ${token}` };
}

describe('monthly-plan productions', () => {
  it('creates, lists, guards the version on edit, and soft-deletes', async () => {
    const created = await app.inject({
      method: 'POST', url: '/months/2026-08/productions', headers: auth(),
      payload: { date: '2026-08-10', title: 'Spot', type: 'video', hours: 4, totalCostMinor: '50000', status: 'pending' },
    });
    expect(created.statusCode).toBe(201);
    const p = created.json();
    expect(p.title).toBe('Spot');
    expect(p.totalCostMinor).toBe('50000');
    expect(p.version).toBe(0);

    const list = await app.inject({ method: 'GET', url: '/months/2026-08/productions', headers: auth() });
    expect(list.json()).toHaveLength(1);
    // A different month is empty (period-scoped).
    expect((await app.inject({ method: 'GET', url: '/months/2026-09/productions', headers: auth() })).json()).toHaveLength(0);

    const ok = await app.inject({
      method: 'PUT', url: `/productions/${p.id}`, headers: auth(),
      payload: { version: 0, status: 'approved', hours: 5 },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().status).toBe('approved');
    expect(ok.json().version).toBe(1);

    // Stale version → 409.
    const stale = await app.inject({
      method: 'PUT', url: `/productions/${p.id}`, headers: auth(),
      payload: { version: 0, status: 'invoiced' },
    });
    expect(stale.statusCode).toBe(409);

    const del = await app.inject({ method: 'DELETE', url: `/productions/${p.id}?version=1`, headers: auth() });
    expect(del.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/months/2026-08/productions', headers: auth() })).json()).toHaveLength(0);
  });

  it('lists the month newest first, the last one loaded first within a day', async () => {
    const add = async (date: string, title: string) => {
      const res = await app.inject({
        method: 'POST', url: '/months/2026-03/productions', headers: auth(),
        payload: { date, title, type: 'video', hours: 1, totalCostMinor: '0', status: 'pending' },
      });
      expect(res.statusCode).toBe(201);
      // Apart in time, so the same-day order is decided by createdAt and not by chance.
      await new Promise((resolve) => setTimeout(resolve, 15));
    };
    await add('2026-03-05', 'oldest');
    await add('2026-03-20', 'same day, loaded first');
    await add('2026-03-10', 'middle');
    await add('2026-03-20', 'same day, loaded last');

    const expected = ['same day, loaded last', 'same day, loaded first', 'middle', 'oldest'];
    const list = await app.inject({ method: 'GET', url: '/months/2026-03/productions', headers: auth() });
    expect(list.json().map((p: { title: string }) => p.title)).toEqual(expected);
    // The bundle Operación mensual reads carries the same order.
    const bundle = await app.inject({ method: 'GET', url: '/months/2026-03/plan', headers: auth() });
    expect(bundle.json().productions.map((p: { title: string }) => p.title)).toEqual(expected);
  });

  it('creates an expense and an alert (period-scoped)', async () => {
    const exp = await app.inject({
      method: 'POST', url: '/months/2026-08/expenses', headers: auth(),
      payload: { concept: 'Figma', category: 'software', amountMinor: '12000' },
    });
    expect(exp.statusCode).toBe(201);
    expect(exp.json().concept).toBe('Figma');

    const alert = await app.inject({
      method: 'POST', url: '/months/2026-08/alerts', headers: auth(),
      payload: { severity: 'high', type: 'cobros', entity: 'Café Roma', description: 'Atrasado' },
    });
    expect(alert.statusCode).toBe(201);
    expect(alert.json().status).toBe('open');
  });

  it('assembles the plan bundle and toggles a checklist item', async () => {
    // Seed a production in a fresh period.
    await app.inject({
      method: 'POST', url: '/months/2026-10/productions', headers: auth(),
      payload: { date: '2026-10-05', title: 'Reel', type: 'video', totalCostMinor: '20000' },
    });
    const set = await app.inject({
      method: 'PUT', url: '/months/2026-10/checklist', headers: auth(),
      payload: { item: 'productions_loaded', value: true },
    });
    expect(set.statusCode).toBe(200);
    expect(set.json().productions_loaded).toBe(true);

    const bundle = await app.inject({ method: 'GET', url: '/months/2026-10/plan', headers: auth() });
    expect(bundle.statusCode).toBe(200);
    const b = bundle.json();
    expect(b.period).toBe('2026-10');
    expect(b.status).toBe('draft');
    expect(b.checklist.productions_loaded).toBe(true);
    expect(b.productions).toHaveLength(1);
    expect(Array.isArray(b.receivables)).toBe(true);
    expect(Array.isArray(b.payouts)).toBe(true);
    expect(Array.isArray(b.monotributo)).toBe(true);
  });

  /**
   * The month's cost side comes from the Pagos module.
   *
   * It did not, until an operator loaded every one of August's payments and the screen she
   * closes the month on still reported `Pendiente de pago al equipo $0` and a profitability
   * with nothing subtracted. `monthly-plan.service.ts` did not reference the payments table
   * at all.
   *
   * The two fields answer different questions and the distinction is load-bearing:
   * `paymentTotals` is an unbounded groupBy and is the ONLY thing money may be derived from;
   * `payments` shares the bundle's page cap. Summing the rows instead would understate the
   * month's cost and overstate its profit exactly when a month is busiest.
   */
  it('carries the period payments as an exact aggregate plus a display list', async () => {
    const period = '2026-11';
    const mk = (body: Record<string, unknown>) =>
      app.inject({
        method: 'POST', url: '/payments', headers: auth(),
        payload: {
          recipientName: 'Proveedor Uno',
          period: `${period}-01`,
          concept: 'Gasto del mes',
          expectedDate: `${period}-20`,
          ...body,
        },
      });

    const a = await mk({ recipientType: 'fixed_expense', totalAmountMinor: '5000000' });
    const b2 = await mk({ recipientType: 'fixed_expense', totalAmountMinor: '3000000' });
    // `platform`, not `provider`: a proveedor payment requires a linked providerId.
    const c = await mk({ recipientType: 'platform', totalAmountMinor: '1000000' });
    expect([a.statusCode, b2.statusCode, c.statusCode]).toEqual([201, 201, 201]);

    const bundle = await app.inject({ method: 'GET', url: `/months/${period}/plan`, headers: auth() });
    expect(bundle.statusCode).toBe(200);
    const body = bundle.json();

    const byType = Object.fromEntries(
      (body.paymentTotals as { recipientType: string; totalMinor: string; count: number }[])
        .map((t) => [t.recipientType, t]),
    );
    // Two fixed-expense payments, summed ONCE each.
    expect(byType.fixed_expense?.totalMinor).toBe('8000000');
    expect(byType.fixed_expense?.count).toBe(2);
    expect(byType.platform?.totalMinor).toBe('1000000');

    // The rows are there for display, and carry calendar days rather than UTC instants:
    // a full instant renders as the PREVIOUS day at UTC-3, and this feeds a month-end screen.
    expect(body.payments).toHaveLength(3);
    expect(body.payments[0].expectedDate).toBe(`${period}-20`);
  });

  /**
   * The three payment reads are ARS-scoped on purpose: the monthly close is the peso
   * operating lane, and summing lanes that are never converted would produce a figure in
   * no currency. But the scope removes the row from the LIST as well as from the totals,
   * and the "se muestran N de M" reconciliation is computed from the same ARS-scoped
   * count, so nothing on the page could hint at the omission. Hence the count.
   */
  it('counts the pagos it excludes for being in another lane', async () => {
    const period = '2026-10';
    const mk = (body: Record<string, unknown>) =>
      app.inject({
        method: 'POST', url: '/payments', headers: auth(),
        payload: {
          recipientName: 'Figma',
          period: `${period}-01`,
          concept: 'Suscripcion',
          expectedDate: `${period}-20`,
          ...body,
        },
      });

    const ars = await mk({ recipientType: 'platform', totalAmountMinor: '2000000' });
    const usd = await mk({ recipientType: 'platform', totalAmountMinor: '5000', currency: 'USD' });
    expect([ars.statusCode, usd.statusCode]).toEqual([201, 201]);
    expect(usd.json().currency).toBe('USD');

    const body = (
      await app.inject({ method: `GET`, url: `/months/${period}/plan`, headers: auth() })
    ).json();

    // The peso total is the peso pago alone, and the dollar one is neither summed nor
    // listed. It is COUNTED, which is the only thing on the page that can show it.
    const platform = (body.paymentTotals as { recipientType: string; totalMinor: string; count: number }[])
      .find((t) => t.recipientType === 'platform');
    expect(platform?.totalMinor).toBe('2000000');
    expect(platform?.count).toBe(1);
    expect(body.payments).toHaveLength(1);
    expect(body.otherLanePaymentCount).toBe(1);
  });

  it('leaves the next month payments out of the totals', async () => {
    // The aggregate is period-scoped: a cost from December must not land on November's
    // profitability, which is a figure the operator freezes when she closes.
    await app.inject({
      method: 'POST', url: '/payments', headers: auth(),
      payload: {
        recipientType: 'monotributo', recipientName: 'AFIP', period: '2026-12-01',
        concept: 'Monotributo diciembre', expectedDate: '2026-12-10', totalAmountMinor: '9900000',
      },
    });

    const nov = await app.inject({ method: 'GET', url: '/months/2026-11/plan', headers: auth() });
    const types = (nov.json().paymentTotals as { recipientType: string }[]).map((t) => t.recipientType);
    expect(types).not.toContain('monotributo');
  });
});

/**
 * Attribution by id — the join that makes a production's hours summable into a
 * liquidación. Before it existed, who worked what lived only in `responsible`
 * and `participants` as free-text names, which is why the /pagos detail printed
 * a labour breakdown derived from a hash of the payment's own id.
 */
describe('production attribution', () => {
  async function createWithAttribution(period: string, attribution: unknown) {
    return app.inject({
      method: 'POST',
      url: `/months/${period}/productions`,
      headers: auth(),
      payload: {
        date: `${period}-05`,
        title: 'Sesión de fotos',
        type: 'photo',
        hours: 10,
        status: 'pending',
        attribution,
      },
    });
  }

  it('attributes by id and derives the display names from it', async () => {
    const res = await createWithAttribution('2026-11', [
      { teamMemberId: MEMBER_A, hours: 6, role: 'responsible' },
      { teamMemberId: MEMBER_B, hours: 4, role: 'participant' },
    ]);
    expect(res.statusCode).toBe(201);
    const p = res.json();

    expect(p.attribution).toHaveLength(2);
    expect(p.attribution.find((a: { name: string }) => a.name === 'Ana Ruiz')).toMatchObject({
      teamMemberId: MEMBER_A,
      hours: 6,
      role: 'responsible',
    });
    // The legacy columns are derived from the ids, so the two representations
    // cannot drift into disagreeing about who worked this.
    expect(p.responsible).toBe('Ana Ruiz');
    expect(p.participants).toEqual(['Bruno Sosa']);
  });

  it('keeps an unrecorded split as null, never as zero hours', async () => {
    const res = await createWithAttribution('2026-11', [
      { teamMemberId: MEMBER_A, role: 'responsible' },
    ]);
    const [row] = res.json().attribution;
    // The distinction this whole change exists to protect: nobody said this
    // person worked no hours, only that the split was never written down.
    expect(row.hours).toBeNull();
    expect(row.hours).not.toBe(0);
  });

  it('refuses an id that names nobody here, instead of dropping it', async () => {
    const res = await createWithAttribution('2026-11', [
      { teamMemberId: MEMBER_A, hours: 3, role: 'responsible' },
      { teamMemberId: STRANGER, hours: 3, role: 'participant' },
    ]);
    // Silently ignoring the unknown id would leave a production looking fully
    // attributed while one person's hours vanished from their liquidación.
    expect(res.statusCode).toBe(400);
    // The canonical `{ error: { code, message } }` contract — the refusal has to
    // name the id, or the operator cannot tell which person failed to attach.
    expect(res.json().error.code).toBe('BAD_REQUEST');
    expect(res.json().error.message).toContain(STRANGER);
  });

  it('refuses the same person twice instead of collapsing their hours', async () => {
    const res = await createWithAttribution('2026-11', [
      { teamMemberId: MEMBER_A, hours: 4, role: 'participant' },
      { teamMemberId: MEMBER_A, hours: 5, role: 'participant' },
    ]);
    // Deduping would have to pick a winner and drop the loser's hours — 9 h of
    // work liquidated as 4, silently. Same reason the unknown id is refused.
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('more than once');
  });

  it('refuses a second responsible, which the display columns cannot represent', async () => {
    const res = await createWithAttribution('2026-11', [
      { teamMemberId: MEMBER_A, hours: 4, role: 'responsible' },
      { teamMemberId: MEMBER_B, hours: 4, role: 'responsible' },
    ]);
    // Both would persist and both would be summed into a liquidación, but only
    // one fits the `responsible` column and the other is excluded from
    // `participants` too — so the names would disagree with who is being paid.
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('one responsible');
  });

  /**
   * The shape every client actually sends. No UI writes `attribution` yet, so
   * without this sync the 0012 backfill would be undone by the first save: the
   * production would read one name while a different person's liquidación kept
   * counting its hours.
   */
  it('keeps attribution in step with a name-only edit', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/months/2027-09/productions',
      headers: auth(),
      payload: {
        date: '2027-09-05',
        title: 'Spot',
        type: 'video',
        hours: 8,
        status: 'pending',
        responsible: '  ana ruiz  ',
        participants: ['Bruno Sosa', 'Nadie Enparticular'],
      },
    });
    const p = created.json();
    // Resolved by the same rule the backfill uses: exact modulo case and
    // whitespace, and an unmatched name simply creates no row.
    expect(p.attribution).toHaveLength(2);
    expect(p.attribution.map((a: { name: string }) => a.name).sort()).toEqual([
      'Ana Ruiz',
      'Bruno Sosa',
    ]);
    expect(p.attribution.find((a: { role: string }) => a.role === 'responsible').name).toBe('Ana Ruiz');

    const reassigned = await app.inject({
      method: 'PUT',
      url: `/productions/${p.id}`,
      headers: auth(),
      payload: { version: p.version, responsible: 'Bruno Sosa', participants: [] },
    });
    const after = reassigned.json();
    // Ana is off the production, so she stops accruing its hours. Before this
    // sync her row survived and kept counting.
    expect(after.attribution).toHaveLength(1);
    expect(after.attribution[0].teamMemberId).toBe(MEMBER_B);
    expect(after.responsible).toBe('Bruno Sosa');
  });

  it('replaces the attribution wholesale, so a removed person stops counting', async () => {
    const created = await createWithAttribution('2026-12', [
      { teamMemberId: MEMBER_A, hours: 5, role: 'responsible' },
      { teamMemberId: MEMBER_B, hours: 5, role: 'participant' },
    ]);
    const p = created.json();

    const updated = await app.inject({
      method: 'PUT',
      url: `/productions/${p.id}`,
      headers: auth(),
      payload: {
        version: p.version,
        attribution: [{ teamMemberId: MEMBER_B, hours: 10, role: 'responsible' }],
      },
    });
    expect(updated.statusCode).toBe(200);
    const after = updated.json();

    // Merge semantics would leave Ana attached and still drawing hours from a
    // production she was taken off.
    expect(after.attribution).toHaveLength(1);
    expect(after.attribution[0]).toMatchObject({ teamMemberId: MEMBER_B, hours: 10 });
    expect(after.responsible).toBe('Bruno Sosa');
    expect(after.participants).toEqual([]);
  });
});

/**
 * The production planilla HOLD kept in a spreadsheet (2026-10): who coordinated the
 * shoot, what the content creator costs (hours × their hourly rate), and whether the
 * viático was paid back — weekly, often after the month already closed.
 */
describe('production planilla', () => {
  const CREATOR = '0e000000-0000-4000-8000-0000000000c1'; // paid 9.000 ARS an hour
  const NO_RATE = '0e000000-0000-4000-8000-0000000000c2';
  const MANAGER = '0e000000-0000-4000-8000-0000000000c3';
  /** Names nobody on the roster. */
  const UNKNOWN_MEMBER = '0e000000-0000-4000-8000-0000000000c4';

  beforeAll(async () => {
    const admin = new Client({ connectionString: container.getConnectionUri() });
    await admin.connect();
    for (const [id, name, rate] of [
      [CREATOR, 'Memo', 900000],
      [NO_RATE, 'Julia', null],
      [MANAGER, 'Vir Re', null],
    ] as const) {
      await admin.query(
        `INSERT INTO "TeamMember" (id, name, role, "employmentType", "compensationModel", "hourlyRateMinor", "updatedAt")
         VALUES ($1, $2, 'Producción', 'collaborator', 'hourly', $3, now())`,
        [id, name, rate],
      );
    }
    await admin.end();
  });

  async function create(period: string, body: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: `/months/${period}/productions`,
      headers: auth(),
      payload: { date: `${period}-12`, title: 'Produ mensual', type: 'Producción mensual', status: 'pending', ...body },
    });
  }
  const as = (creator: string, hours: number) => [{ teamMemberId: creator, hours, role: 'responsible' }];

  it('prices the creator at hours × rate and keeps the coordinator out of the attribution', async () => {
    const res = await create('2026-08', {
      hours: 2.5,
      viaticsMinor: '4350000',
      accountManagerId: MANAGER,
      receipt: 'https://drive.google.com/file/d/abc',
      attribution: as(CREATOR, 2.5),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      totalCostMinor: '2250000',
      viaticsMinor: '4350000',
      accountManagerId: MANAGER,
      accountManagerName: 'Vir Re',
      receipt: 'https://drive.google.com/file/d/abc',
      viaticsPaidAt: null,
      responsible: 'Memo',
    });
    // Only the creator is paid for it: the coordinator is not a worker on the row.
    expect(res.json().attribution).toEqual([
      expect.objectContaining({ teamMemberId: CREATOR, hours: 2.5 }),
    ]);
  });

  it('lets a typed cost win, and re-prices an untyped one when the hours change', async () => {
    const typed = await create('2026-08', { hours: 2, totalCostMinor: '100000', attribution: as(CREATOR, 2) });
    expect(typed.json().totalCostMinor).toBe('100000');

    const priced = (await create('2026-08', { hours: 2, attribution: as(CREATOR, 2) })).json();
    expect(priced.totalCostMinor).toBe('1800000');
    const moved = await app.inject({
      method: 'PUT',
      url: `/productions/${priced.id}`,
      headers: auth(),
      payload: { version: priced.version, hours: 3, attribution: as(CREATOR, 3) },
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json().totalCostMinor).toBe('2700000');
  });

  it('leaves the cost at what was typed when the creator has no rate', async () => {
    const res = await create('2026-08', { hours: 3, attribution: as(NO_RATE, 3) });
    expect(res.json().totalCostMinor).toBe('0');
    const typed = await create('2026-08', { hours: 3, totalCostMinor: '5000000', attribution: as(NO_RATE, 3) });
    expect(typed.json().totalCostMinor).toBe('5000000');
  });

  it('takes a production with no Tema, and names it after its type', async () => {
    // HOLD found the required Tema confusing (review of 2026-10-21); a blank one, on a
    // create or on an edit, reads as the production's type instead of an empty row.
    const res = await create('2026-08', { title: undefined, type: 'Evento' });
    expect(res.statusCode).toBe(201);
    expect(res.json().title).toBe('Evento');
    const edited = await app.inject({
      method: 'PUT', url: `/productions/${res.json().id}`, headers: auth(),
      payload: { version: res.json().version, title: '' },
    });
    expect(edited.json().title).toBe('Evento');
  });

  it('refuses an account manager who is not on the roster', async () => {
    const res = await create('2026-08', { hours: 1, accountManagerId: UNKNOWN_MEMBER, attribution: as(CREATOR, 1) });
    expect(res.statusCode).toBe(400);
  });

  it('marks viáticos paid in a batch — on a closed month too — and owed again', async () => {
    const a = (await create('2026-04', { hours: 2, viaticsMinor: '250000', attribution: as(CREATOR, 2) })).json();
    const b = (await create('2026-04', { hours: 1, viaticsMinor: '480000', attribution: as(CREATOR, 1) })).json();
    const none = (await create('2026-04', { hours: 1, attribution: as(CREATOR, 1) })).json();

    const admin = new Client({ connectionString: container.getConnectionUri() });
    await admin.connect();
    await admin.query(
      `INSERT INTO "MonthRecord" (id, period, label, status, "updatedAt")
       VALUES (gen_random_uuid(), '2026-04', 'Abril 2026', 'closed', now())`,
      [],
    );
    await admin.end();

    const paid = await app.inject({
      method: 'POST',
      url: '/productions/viatics-paid',
      headers: auth(),
      payload: { ids: [a.id, b.id, none.id], paidAt: '2026-05-08' },
    });
    expect(paid.statusCode).toBe(200);
    // The one without a viático is skipped: there is nothing on it to pay back.
    expect(paid.json()).toEqual({ updated: 2 });

    const listed = (
      await app.inject({ method: 'GET', url: '/months/2026-04/productions', headers: auth() })
    ).json() as { id: string; viaticsPaidAt: string | null; version: number }[];
    const byId = new Map(listed.map((p) => [p.id, p]));
    expect(byId.get(a.id)?.viaticsPaidAt).toBe('2026-05-08');
    expect(byId.get(b.id)?.viaticsPaidAt).toBe('2026-05-08');
    expect(byId.get(none.id)?.viaticsPaidAt).toBeNull();

    // The closed month still refuses a real edit; only the payment flag got through.
    const edit = await app.inject({
      method: 'PUT',
      url: `/productions/${a.id}`,
      headers: auth(),
      payload: { version: byId.get(a.id)!.version, hours: 5 },
    });
    expect(edit.statusCode).toBe(409);

    const owed = await app.inject({
      method: 'POST',
      url: '/productions/viatics-paid',
      headers: auth(),
      payload: { ids: [a.id], paidAt: null },
    });
    expect(owed.json()).toEqual({ updated: 1 });
    const after = (
      await app.inject({ method: 'GET', url: '/months/2026-04/productions', headers: auth() })
    ).json() as { id: string; viaticsPaidAt: string | null }[];
    expect(after.find((p) => p.id === a.id)?.viaticsPaidAt).toBeNull();
  });
});

describe('production approval and the client history', () => {
  async function create(period: string, body: Record<string, unknown>) {
    const res = await app.inject({
      method: 'POST',
      url: `/months/${period}/productions`,
      headers: auth(),
      payload: { date: `${period}-10`, title: 'Produ mensual', type: 'Producción mensual', hours: 2, ...body },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; status: string };
  }

  it('creates productions pending, and takes no approval change on a closed month', async () => {
    const p = await create('2026-02', {});
    expect(p.status).toBe('pending');
    const admin = new Client({ connectionString: container.getConnectionUri() });
    await admin.connect();
    await admin.query(
      `INSERT INTO "MonthRecord" (id, period, label, status, "updatedAt")
       VALUES (gen_random_uuid(), '2026-02', 'Febrero 2026', 'closed', now())`,
      [],
    );
    await admin.end();
    const res = await app.inject({
      method: 'POST', url: '/productions/approval', headers: auth(), payload: { ids: [p.id], approved: true },
    });
    expect(res.statusCode).toBe(409);
  });

  it("lists one client's productions, newest first, and nobody else's", async () => {
    const now = new Date();
    const ym = (offset: number) =>
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1)).toISOString().slice(0, 7);
    const mine = (await app.inject({ method: 'POST', url: '/clients', headers: auth(), payload: { name: 'Historial SA' } })).json().id;
    const other = (await app.inject({ method: 'POST', url: '/clients', headers: auth(), payload: { name: 'Ajeno SA' } })).json().id;
    const older = await create(ym(1), { clientId: mine, title: 'Mes pasado' });
    const newer = await create(ym(0), { clientId: mine, title: 'Este mes' });
    await create(ym(0), { clientId: other, title: 'De otro' });
    const list = (await app.inject({ method: 'GET', url: `/clients/${mine}/productions`, headers: auth() })).json() as {
      id: string;
    }[];
    expect(list.map((p) => p.id)).toEqual([newer.id, older.id]);
  });
});

