/**
 * Reports / analytics integration. Derived aggregates over the canonical stores,
 * with owner-only gating on financials/profitability enforced server-side.
 */
import { execSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

let container: StartedPostgreSqlContainer;
let app: FastifyInstance;

const WS = '1c000000-0000-4000-8000-000000000001';
const OWNER_EMAIL = 'owner@studio.test';
const ADMIN_EMAIL = 'admin@studio.test';
const EMPLOYEE_EMAIL = 'emp@studio.test';
const PASSWORD = 'a-correct-password';
const CLIENT = '1c000000-0000-4000-8000-000000000002';

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
  await admin.query(`INSERT INTO "Client" (id, name, "updatedAt") VALUES ($1, 'Café', now())`, [CLIENT]);
  for (const [email, role] of [[OWNER_EMAIL, 'owner'], [ADMIN_EMAIL, 'admin'], [EMPLOYEE_EMAIL, 'employee']] as const) {
    await admin.query(
      `INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, 'X', 'Y', $3, now())`,
      [email, passwordHash, role],
    );
  }
  await admin.end();

  process.env.DATABASE_URL = ownerUrl.replace('owner:owner@', 'hold_app:app@');
  const { buildApp } = await import('../src/app.js');
  app = await buildApp();
});

afterAll(async () => {
  await app?.close();
  await container?.stop();
});

const tokens: Record<string, string> = {};
beforeAll(async () => {
  for (const [k, email] of [['owner', OWNER_EMAIL], ['admin', ADMIN_EMAIL], ['emp', EMPLOYEE_EMAIL]] as const) {
    tokens[k] = (await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: PASSWORD } })).json().accessToken;
  }
  // Seed money: a receivable collected partially + a paid provider payment.
  const h = { authorization: `Bearer ${tokens.owner}` };
  const rec = await app.inject({ method: 'POST', url: '/receivables', headers: h, payload: { clientId: CLIENT, period: '2026-06-01', service: 'Redes', dueDate: '2026-06-30', baseAmountMinor: '100000' } });
  await app.inject({ method: 'POST', url: `/receivables/${rec.json().id}/collect`, headers: h, payload: { amountMinor: '60000' } });
  const prov = await app.inject({ method: 'POST', url: '/providers', headers: h, payload: { name: 'Proveedor' } });
  const pay = await app.inject({ method: 'POST', url: '/payments', headers: h, payload: { recipientType: 'provider', providerId: prov.json().id, recipientName: 'Proveedor', period: '2026-06-01', concept: 'x', expectedDate: '2026-06-30', totalAmountMinor: '40000' } });
  await app.inject({ method: 'POST', url: `/payments/${pay.json().id}/register`, headers: h, payload: { amountMinor: '40000' } });
});

function h(role: string) {
  return { authorization: `Bearer ${tokens[role]}` };
}

describe('reports', () => {
  it('summarises revenue/payments/payouts and net (owner+admin)', async () => {
    const res = await app.inject({ method: 'GET', url: '/reports/summary', headers: h('owner') });
    expect(res.statusCode).toBe(200);
    expect(res.json().revenue.collectedMinor).toBe('60000');
    expect(res.json().payments.paidMinor).toBe('40000');
    expect(res.json().netCollectedMinusPaidMinor).toBe('20000');

    expect((await app.inject({ method: 'GET', url: '/reports/summary', headers: h('admin') })).statusCode).toBe(200);
  });

  it('exposes financials + profitability to every role holding the capability', async () => {
    const fin = await app.inject({ method: 'GET', url: '/reports/financials', headers: h('owner') });
    expect(fin.json().cashInMinor).toBe('60000');
    expect(fin.json().cashOutMinor).toBe('40000');
    expect(fin.json().netMinor).toBe('20000');

    const prof = await app.inject({ method: 'GET', url: '/reports/profitability', headers: h('owner') });
    const client = prof.json().byClient.find((c: { clientId: string }) => c.clientId === CLIENT);
    expect(client).toMatchObject({ billedMinor: '100000', collectedMinor: '60000', collectionRatePct: 60 });

    // The admin holds `studioFinancials` and `profitability` (ROLE_CAPABILITIES), so both
    // reports answer with the SAME payload the owner gets — not a redacted variant.
    const adminFin = await app.inject({ method: 'GET', url: '/reports/financials', headers: h('admin') });
    expect(adminFin.statusCode).toBe(200);
    expect(adminFin.json()).toEqual(fin.json());

    const adminProf = await app.inject({ method: 'GET', url: '/reports/profitability', headers: h('admin') });
    expect(adminProf.statusCode).toBe(200);
    expect(adminProf.json()).toEqual(prof.json());
  });

  it('keeps the capability gate fail-closed for a role that holds none', async () => {
    // The employee holds no capability, so the capability-gated reports 403 — the gate
    // is a real gate, not a formality that happens to admit everyone today.
    expect((await app.inject({ method: 'GET', url: '/reports/financials', headers: h('emp') })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/reports/profitability', headers: h('emp') })).statusCode).toBe(403);
    // Margin history is money too, on the same `profitability` gate.
    expect((await app.inject({ method: 'GET', url: '/reports/margin-history', headers: h('emp') })).statusCode).toBe(403);
    const mh = await app.inject({ method: 'GET', url: '/reports/margin-history', headers: h('owner') });
    expect(mh.statusCode).toBe(200);
    expect(mh.json().points).toHaveLength(6); // rolling 6-month window
  });

  it('serves the per-member hours trend (owner+admin, 6-month window, not employee)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/reports/hours-history?teamMemberId=${MEMBER}`,
      headers: h('owner'),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().points).toHaveLength(6);
    expect(res.json().points.every((p: { hours: number }) => typeof p.hours === 'number')).toBe(true);

    // Hours, not money → owner+admin; an employee is fail-closed.
    expect((await app.inject({ method: 'GET', url: `/reports/hours-history?teamMemberId=${MEMBER}`, headers: h('admin') })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/reports/hours-history?teamMemberId=${MEMBER}`, headers: h('emp') })).statusCode).toBe(403);
  });

  it('forbids an employee from reports (fail-closed)', async () => {
    expect((await app.inject({ method: 'GET', url: '/reports/summary', headers: h('emp') })).statusCode).toBe(403);
  });
});

const MEMBER = '1c000000-0000-4000-8000-000000000003';

describe('reports — cost, margin & capacity', () => {
  // Cost columns and the team member/assignment aren't writable via the public API
  // yet (loaded out-of-band from HOLD's sheet), so seed them with the owner conn.
  beforeAll(async () => {
    const admin = new Client({ connectionString: container.getConnectionUri() });
    await admin.connect();
    // CLIENT's one receivable (billed 100000): area costs 10+15+20+5+0 + fixed 30 = 80000
    // → margin 20000 (20%). Mirrors HOLD's "GASTO POR ÁREA" + "Fijos asignados" → "Renta".
    await admin.query(
      `UPDATE "Receivable"
         SET "costDesignMinor" = 10000, "costCommMinor" = 15000, "costProductionMinor" = 20000,
             "costViaticsMinor" = 5000, "costPautaMinor" = 0, "costFixedMinor" = 30000
       WHERE "clientId" = $1`,
      [CLIENT],
    );
    await admin.query(
      `INSERT INTO "TeamMember" (id, name, role, "capacityHoursMonthly", "updatedAt")
       VALUES ($1, 'Vir', 'CM', 160, now())`,
      [MEMBER],
    );
    await admin.query(
      `INSERT INTO "ClientAssignment" (id, "clientId", "teamMemberId", "roleOnClient", "estimatedMonthlyHours", "monthlyCostMinor")
       VALUES (gen_random_uuid(), $1, $2, 'Comunicación', 40, 210000)`,
      [CLIENT, MEMBER],
    );
    await admin.end();
  });

  it('returns per-client cost breakdown + margin on profitability (owner)', async () => {
    const prof = await app.inject({ method: 'GET', url: '/reports/profitability', headers: h('owner') });
    const client = prof.json().byClient.find((c: { clientId: string }) => c.clientId === CLIENT);
    expect(client).toMatchObject({
      clientName: 'Café',
      billedMinor: '100000',
      costDesignMinor: '10000',
      costCommMinor: '15000',
      costProductionMinor: '20000',
      costViaticsMinor: '5000',
      costPautaMinor: '0',
      costFixedMinor: '30000',
      costTotalMinor: '80000',
      marginMinor: '20000',
      marginPct: 20,
    });
  });

  it('reports team workload + real monthly cost per member (owner only)', async () => {
    const res = await app.inject({ method: 'GET', url: '/reports/capacity', headers: h('owner') });
    expect(res.statusCode).toBe(200);
    const member = res.json().members.find((m: { personId: string }) => m.personId === MEMBER);
    expect(member).toMatchObject({
      personName: 'Vir',
      role: 'CM',
      clientsActive: 1,
      clientNames: ['Café'],
      hoursAllocated: 40,
      capacityHours: 160,
      utilizationPct: 25,
      teamCostMinor: '210000',
    });

    // Carga de equipo is owner+admin, and the admin holds `teamCost`, so per-member cost
    // crosses the wire for them exactly as it does for the owner. An employee is blocked.
    const adminRes = await app.inject({ method: 'GET', url: '/reports/capacity', headers: h('admin') });
    expect(adminRes.statusCode).toBe(200);
    const adminMember = adminRes.json().members.find((m: { personId: string }) => m.personId === MEMBER);
    expect(adminMember).toMatchObject({ clientsActive: 1, hoursAllocated: 40, teamCostMinor: '210000' });

    expect((await app.inject({ method: 'GET', url: '/reports/capacity', headers: h('emp') })).statusCode).toBe(403);
  });

  it('lists per-task productivity from logged time entries (owner+admin, period-scoped, not employee)', async () => {
    const admin = new Client({ connectionString: container.getConnectionUri() });
    await admin.connect();
    await admin.query(
      `INSERT INTO "TimeEntry" ("teamMemberId", "clientId", "clientName", "taskType", date, hours, "isOutOfScope")
       VALUES ($1, $2, 'Café', 'Contabilidad', '2026-06-15', 6, false)`,
      [MEMBER, CLIENT],
    );
    await admin.end();

    const res = await app.inject({ method: 'GET', url: '/reports/productivity?period=2026-06', headers: h('owner') });
    expect(res.statusCode).toBe(200);
    const row = res.json().items.find((i: { personId: string }) => i.personId === MEMBER);
    expect(row).toMatchObject({
      personName: 'Vir',
      clientName: 'Café',
      taskType: 'Contabilidad',
      service: 'General',
      hours: 6,
      isExtra: false,
    });
    expect(row.date).toBe('2026-06-15');
    expect(typeof row.clientStatus).toBe('string');

    // Scoped on TimeEntry.date: a different month excludes it.
    const other = await app.inject({ method: 'GET', url: '/reports/productivity?period=2026-07', headers: h('owner') });
    expect(other.json().items.find((i: { id: string }) => i.id === row.id)).toBeUndefined();

    // owner + admin only; an employee is fail-closed.
    expect((await app.inject({ method: 'GET', url: '/reports/productivity', headers: h('admin') })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/reports/productivity', headers: h('emp') })).statusCode).toBe(403);
  });
});

/**
 * Reports had NO currency filter anywhere, unlike `paymentsRepo.kpis` and
 * `billingRepo.kpis`, so it summed USD minor units straight into the peso figures.
 * "Egresos del periodo" rose by the face value of a dollar pago rather than by what it
 * cost, which reads as a much smaller expense than the money that left.
 */
describe('reports — currency lanes', () => {
  it('keeps a dollar pago out of the peso figures and counts it instead', async () => {
    const auth = h('owner');
    const before = (await app.inject({ method: 'GET', url: '/reports/summary', headers: auth })).json();

    const usd = await app.inject({
      method: 'POST',
      url: '/payments',
      headers: auth,
      payload: {
        recipientType: 'platform',
        recipientName: 'Figma',
        period: '2026-06-01',
        concept: 'Suscripcion',
        expectedDate: '2026-06-30',
        totalAmountMinor: '5000',
        currency: 'USD',
      },
    });
    expect(usd.statusCode).toBe(201);
    expect(usd.json().currency).toBe('USD');
    // No origin account: settling into a treasury account is a separate decision, and
    // this asserts the AGGREGATES, not the balance path.
    await app.inject({
      method: 'POST',
      url: `/payments/${usd.json().id}/register`,
      headers: auth,
      payload: { amountMinor: '5000' },
    });

    const after = (await app.inject({ method: 'GET', url: '/reports/summary', headers: auth })).json();
    expect(after.payments.totalMinor).toBe(before.payments.totalMinor);
    expect(after.payments.paidMinor).toBe(before.payments.paidMinor);
    expect(after.payments.count).toBe(before.payments.count);
    expect(after.netCollectedMinusPaidMinor).toBe(before.netCollectedMinusPaidMinor);
    // Counted, not dropped: the screen names the omission rather than reporting a
    // quietly smaller number.
    expect(after.payments.otherLaneCount).toBe(before.payments.otherLaneCount + 1);

    // financials reads the same repo, so it must agree.
    const fin = await app.inject({ method: 'GET', url: '/reports/financials', headers: auth });
    expect(fin.json().cashOutMinor).toBe('40000');
  });
});

/**
 * Rentabilidad subtracts PESO area costs from a billed figure, so `profitabilityByClient`
 * scopes to peso rows. A client billed only in another lane therefore vanishes from the
 * report entirely — not as a zero row, as NO row, which nothing on the tab would reveal.
 */
describe('reports — profitability drops a non-peso client', () => {
  it('counts the clients it omitted, and only the ones actually missing', async () => {
    const auth = h('owner');
    const before = (
      await app.inject({ method: 'GET', url: '/reports/profitability?period=2026-06-01', headers: auth })
    ).json();

    // A SECOND cobro for the SAME client, in another lane. The client still has its peso
    // row, so it is not missing and must not be counted.
    await app.inject({
      method: 'POST',
      url: '/receivables',
      headers: auth,
      payload: {
        clientId: CLIENT,
        period: '2026-06-01',
        service: 'Fondo',
        dueDate: '2026-06-30',
        baseAmountMinor: '900',
        currency: 'USD',
      },
    });

    const same = (
      await app.inject({ method: 'GET', url: '/reports/profitability?period=2026-06-01', headers: auth })
    ).json();
    expect(same.otherLaneClientCount).toBe(before.otherLaneClientCount);
    expect(same.byClient).toHaveLength(before.byClient.length);

    // A client whose ONLY cobro of the period is in another lane is absent from byClient.
    const other = await app.inject({
      method: 'POST',
      url: '/clients',
      headers: auth,
      payload: { name: 'Fondo SA', currency: 'USD' },
    });
    expect(other.statusCode).toBe(201);
    await app.inject({
      method: 'POST',
      url: '/receivables',
      headers: auth,
      payload: {
        clientId: other.json().id,
        period: '2026-06-01',
        service: 'Abono',
        dueDate: '2026-06-30',
        baseAmountMinor: '1500',
        currency: 'USD',
      },
    });

    const after = (
      await app.inject({ method: 'GET', url: '/reports/profitability?period=2026-06-01', headers: auth })
    ).json();
    expect(after.byClient.map((c: { clientId: string }) => c.clientId)).not.toContain(
      other.json().id,
    );
    expect(after.otherLaneClientCount).toBe(before.otherLaneClientCount + 1);
  });
});

/**
 * Since 2026-10-01 the margin subtracts what the studio pays the people on a client, read
 * from their assignments — HOLD had typed Nati's 250.000 on an assignment and seen it
 * nowhere. Periods are computed from today: the margin trend is a rolling window up to
 * now, so a fixed month would fall out of it as the calendar moves.
 */
describe('reports — team cost from assignments', () => {
  const now = new Date();
  const m0 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const m1 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const plusDays = (base: Date, days: number) => new Date(base.getTime() + days * 86_400_000);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  let teamClient = '';
  let usdClient = '';

  beforeAll(async () => {
    const owner = h('owner');
    const newClient = async (payload: { name: string; currency?: string }) =>
      (await app.inject({ method: 'POST', url: '/clients', headers: owner, payload })).json().id as string;
    teamClient = await newClient({ name: 'Equipo SA' });
    usdClient = await newClient({ name: 'Dólar SA', currency: 'USD' });
    for (const month of [m1, m0]) {
      const rec = await app.inject({
        method: 'POST',
        url: '/receivables',
        headers: owner,
        payload: {
          clientId: teamClient,
          period: ymd(month),
          service: 'Redes',
          dueDate: ymd(plusDays(month, 27)),
          baseAmountMinor: '1000000',
        },
      });
      expect(rec.statusCode).toBe(201);
    }
    await app.inject({
      method: 'POST',
      url: '/receivables',
      headers: owner,
      payload: {
        clientId: usdClient,
        period: ymd(m0),
        service: 'Fondo',
        dueDate: ymd(plusDays(m0, 27)),
        baseAmountMinor: '5000',
        currency: 'USD',
      },
    });

    const admin = new Client({ connectionString: container.getConnectionUri() });
    await admin.connect();
    // [member, client, status, assignedSince, endedAt, monthly cost, createdAt]
    const rows: [string, string, string, Date | null, Date | null, number | null, Date?][] = [
      ['On since last month', teamClient, 'active', plusDays(m1, 5), null, 150000],
      ['Left last month', teamClient, 'ended', plusDays(m1, 1), plusDays(m1, 20), 100000],
      ['No amount typed', teamClient, 'active', plusDays(m1, 1), null, null],
      ['Starts next month', teamClient, 'active', plusDays(m0, 40), null, 50000],
      ['Ended, no date', teamClient, 'ended', plusDays(m1, 1), null, 999999],
      // No start date recorded: placed by createdAt, which is now — this month only.
      ['No start date', teamClient, 'active', null, null, 20000],
      // Billed only in dollars: no peso margin to take this from.
      ['On the dollar client', usdClient, 'active', plusDays(m1, 2), null, 300000],
      // A raise, done the only way the UI allows: end the row, assign again. Both rows
      // overlap this month; only the newer amount may count in it.
      ['Got a raise', teamClient, 'ended', plusDays(m1, 3), m0, 40000, plusDays(m1, 3)],
    ];
    // Dates go in as UTC ISO strings, cast to `timestamp`. node-postgres would send a
    // Date in the MACHINE's offset, which a `timestamp without time zone` column drops —
    // on a -03:00 laptop a 1st-of-month midnight lands on the 30th at 21:00, last month.
    const utc = (d: Date | null) => (d ? d.toISOString() : null);
    const assign = (clientId: string, member: string, row: [string, Date | null, Date | null, number | null, Date | null]) => {
      const [status, since, ended, cost, createdAt] = row;
      return admin.query(
        `INSERT INTO "ClientAssignment"
           (id, "clientId", "teamMemberId", "roleOnClient", status, "assignedSince", "endedAt", "monthlyCostMinor", "createdAt")
         VALUES (gen_random_uuid(), $1, $2, 'Diseño', $3, $4::timestamp, $5::timestamp, $6, COALESCE($7::timestamp, now()::timestamp))`,
        [clientId, member, status, utc(since), utc(ended), cost, utc(createdAt)],
      );
    };
    let raised = '';
    for (const [name, clientId, status, since, ended, cost, createdAt] of rows) {
      const member = (
        await admin.query(
          `INSERT INTO "TeamMember" (id, name, role, "capacityHoursMonthly", "updatedAt")
           VALUES (gen_random_uuid(), $1, 'Diseño', 160, now()) RETURNING id`,
          [name],
        )
      ).rows[0].id as string;
      if (name === 'Got a raise') raised = member;
      await assign(clientId, member, [status, since, ended, cost, createdAt ?? null]);
    }
    // The replacement row, created after the old one ended.
    await assign(teamClient, raised, ['active', m0, null, 60000, m0]);
    await admin.end();
  });

  type Row = { clientId: string; costTeamMinor: string | null; costTotalMinor: string; marginMinor: string };
  async function table(headers: Record<string, string>, month: Date) {
    const res = await app.inject({ method: 'GET', url: `/reports/profitability?period=${ymd(month)}`, headers });
    expect(res.statusCode).toBe(200);
    return res.json().byClient as Row[];
  }
  async function trend(headers: Record<string, string>, clientId?: string) {
    const url = `/reports/margin-history${clientId ? `?clientId=${clientId}` : ''}`;
    const points = (await app.inject({ method: 'GET', url, headers })).json().points as {
      period: string; marginMinor: string;
    }[];
    return (month: Date) => points.find((p) => p.period === ymd(month).slice(0, 7))?.marginMinor;
  }

  it('charges each month the people who were on the client that month', async () => {
    const thisMonth = (await table(h('owner'), m0)).find((c) => c.clientId === teamClient);
    // 150.000 + 20.000 (no start date) + 60.000 (the raise, not the 40.000 it replaced).
    expect(thisMonth).toMatchObject({ costTeamMinor: '230000', costTotalMinor: '230000', marginMinor: '770000' });

    const lastMonth = (await table(h('owner'), m1)).find((c) => c.clientId === teamClient);
    // 150.000 + 100.000 (left mid-month, paid whole) + 40.000 (before the raise).
    expect(lastMonth).toMatchObject({ costTeamMinor: '290000', costTotalMinor: '290000', marginMinor: '710000' });
  });

  it('draws the same margin in the trend as in the table', async () => {
    const client = await trend(h('owner'), teamClient);
    expect(client(m0)).toBe('770000');
    expect(client(m1)).toBe('710000');

    // Studio-wide, the trend is the sum of the table. The dollar client's 300.000 is in
    // neither: had the trend subtracted it, this month's point would read 300.000 less.
    const studio = await trend(h('owner'));
    const rows = await table(h('owner'), m0);
    expect(rows.some((c) => c.clientId === usdClient)).toBe(false);
    expect(studio(m0)).toBe(rows.reduce((sum, c) => sum + BigInt(c.marginMinor), 0n).toString());
  });

  it('leaves team cost out of the margin for a caller who may not see pay', async () => {
    const users = (await app.inject({ method: 'GET', url: '/users', headers: h('owner') })).json();
    const adminId = users.find((u: { email: string }) => u.email === ADMIN_EMAIL).id as string;
    const roles = (await app.inject({ method: 'GET', url: '/roles', headers: h('owner') })).json() as {
      id: string; key: string | null;
    }[];
    const systemAdmin = roles.find((r) => r.key === 'admin')!.id;
    const narrowed = (
      await app.inject({
        method: 'POST', url: '/roles', headers: h('owner'),
        payload: { name: 'Rentabilidad sin sueldos', grants: ['client.profitability.read'] },
      })
    ).json().id as string;

    const assign = (roleId: string) =>
      app.inject({
        method: 'PATCH', url: `/users/${adminId}/workspace-role`, headers: h('owner'), payload: { roleId },
      });
    try {
      expect((await assign(narrowed)).statusCode).toBe(204);
      const token = (
        await app.inject({ method: 'POST', url: '/auth/login', payload: { email: ADMIN_EMAIL, password: PASSWORD } })
      ).json().accessToken;
      const auth = { authorization: `Bearer ${token}` };

      // null, not '0': "not shown to you" and "costs nothing" are different answers.
      const row = (await table(auth, m0)).find((c) => c.clientId === teamClient);
      expect(row).toMatchObject({ costTeamMinor: null, costTotalMinor: '0', marginMinor: '1000000' });
      // A margin with the pay inside it would let them back it out by subtraction.
      expect((await trend(auth, teamClient))(m0)).toBe('1000000');
    } finally {
      await assign(systemAdmin);
    }
  });
});

/**
 * Productions enter the margin of the month they were shot (2026-10): what the content
 * creator was paid lands in the production bucket — only for a caller who may see pay,
 * since hours × one person's rate IS their pay — and the viáticos in the viáticos bucket
 * for everyone.
 */
describe('reports — production cost', () => {
  const now = new Date();
  const ym = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 7);
  const CREATOR = '1c000000-0000-4000-8000-0000000000c1'; // paid 1.000 ARS an hour
  let client = '';
  let productionId = '';

  beforeAll(async () => {
    const admin = new Client({ connectionString: container.getConnectionUri() });
    await admin.connect();
    await admin.query(
      `INSERT INTO "TeamMember" (id, name, role, "compensationModel", "hourlyRateMinor", "updatedAt")
       VALUES ($1, 'Memo', 'Producción', 'hourly', 100000, now())`,
      [CREATOR],
    );
    await admin.end();
    const owner = h('owner');
    client = (await app.inject({ method: 'POST', url: '/clients', headers: owner, payload: { name: 'Produ SA' } })).json().id;
    const rec = await app.inject({
      method: 'POST',
      url: '/receivables',
      headers: owner,
      payload: { clientId: client, period: `${ym}-01`, service: 'Redes', dueDate: `${ym}-28`, baseAmountMinor: '1000000' },
    });
    expect(rec.statusCode).toBe(201);
    const prod = await app.inject({
      method: 'POST',
      url: `/months/${ym}/productions`,
      headers: owner,
      payload: {
        date: `${ym}-03`,
        clientId: client,
        title: 'Produ mensual',
        type: 'Producción mensual',
        status: 'pending',
        hours: 3,
        viaticsMinor: '50000',
        attribution: [{ teamMemberId: CREATOR, hours: 3, role: 'responsible' }],
      },
    });
    expect(prod.statusCode).toBe(201);
    productionId = prod.json().id;
  });

  async function rowAndTrend(headers: Record<string, string>) {
    const table = (
      await app.inject({ method: 'GET', url: `/reports/profitability?period=${ym}-01`, headers })
    ).json().byClient as { clientId: string }[];
    const points = (
      await app.inject({ method: 'GET', url: `/reports/margin-history?clientId=${client}`, headers })
    ).json().points as { period: string; marginMinor: string }[];
    return { row: table.find((c) => c.clientId === client), trend: points.find((p) => p.period === ym)?.marginMinor };
  }

  it('subtracts what the creator was paid once approved, and the viáticos from the start', async () => {
    // Pending: nobody is paid for it until the communication lead confirms it, but its
    // viáticos are paid back within the week either way.
    const pending = await rowAndTrend(h('owner'));
    expect(pending.row).toMatchObject({ costProductionMinor: '0', costViaticsMinor: '50000', marginMinor: '950000' });
    expect(pending.trend).toBe('950000');

    const approved = await app.inject({
      method: 'POST', url: '/productions/approval', headers: h('owner'), payload: { ids: [productionId], approved: true },
    });
    expect(approved.json()).toEqual({ updated: 1 });
    const { row, trend } = await rowAndTrend(h('owner'));
    // 3 h × 1.000 = 3.000 for the creator, 500 of viáticos, against 10.000 billed.
    expect(row).toMatchObject({ costProductionMinor: '300000', costViaticsMinor: '50000', marginMinor: '650000' });
    expect(trend).toBe('650000');
  });

  it('keeps the creator pay out for a caller who may not see pay, but not the viáticos', async () => {
    const users = (await app.inject({ method: 'GET', url: '/users', headers: h('owner') })).json();
    const adminId = users.find((u: { email: string }) => u.email === ADMIN_EMAIL).id as string;
    const roles = (await app.inject({ method: 'GET', url: '/roles', headers: h('owner') })).json() as {
      id: string; key: string | null;
    }[];
    const narrowed = (
      await app.inject({
        method: 'POST', url: '/roles', headers: h('owner'),
        payload: { name: 'Rentabilidad sin tarifas', grants: ['client.profitability.read'] },
      })
    ).json().id as string;
    const assign = (roleId: string) =>
      app.inject({
        method: 'PATCH', url: `/users/${adminId}/workspace-role`, headers: h('owner'), payload: { roleId },
      });
    try {
      expect((await assign(narrowed)).statusCode).toBe(204);
      const token = (
        await app.inject({ method: 'POST', url: '/auth/login', payload: { email: ADMIN_EMAIL, password: PASSWORD } })
      ).json().accessToken;
      const { row, trend } = await rowAndTrend({ authorization: `Bearer ${token}` });
      expect(row).toMatchObject({ costProductionMinor: '0', costViaticsMinor: '50000', marginMinor: '950000' });
      expect(trend).toBe('950000');
    } finally {
      await assign(roles.find((r) => r.key === 'admin')!.id);
    }
  });
});

describe('reports — a client not billed yet', () => {
  const now = new Date();
  const ym = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 7);
  const CREATOR = '1c000000-0000-4000-8000-0000000000c2'; // paid 1.000 ARS an hour
  const DESIGNER = '1c000000-0000-4000-8000-0000000000d2';
  let fresh = '';
  let churned = '';

  type Unbilled = { clientCount: number; costMinor: string };
  async function unbilled(headers = h('owner')): Promise<Unbilled> {
    return (await app.inject({ method: 'GET', url: `/reports/profitability?period=${ym}-01`, headers })).json()
      .unbilledCost as Unbilled;
  }
  function month(clientId: string, headers = h('owner')) {
    return app.inject({ method: 'GET', url: `/reports/clients/${clientId}/month?period=${ym}-01`, headers });
  }

  let before: Unbilled = { clientCount: 0, costMinor: '0' };
  beforeAll(async () => {
    before = await unbilled();
    const owner = h('owner');
    const newClient = async (name: string, status: string) =>
      (await app.inject({ method: 'POST', url: '/clients', headers: owner, payload: { name, status } })).json().id as string;
    fresh = await newClient('Recién Llegado SA', 'active');
    churned = await newClient('Se Fue SA', 'churned');
    const admin = new Client({ connectionString: container.getConnectionUri() });
    await admin.connect();
    await admin.query(
      `INSERT INTO "TeamMember" (id, name, role, "compensationModel", "hourlyRateMinor", "updatedAt")
       VALUES ($1, 'Valen', 'Producción', 'hourly', 100000, now()), ($2, 'Andrea', 'Diseño', 'monthly_fixed', 0, now())`,
      [CREATOR, DESIGNER],
    );
    // What the studio pays the designer for each client: 2.000 a month.
    for (const clientId of [fresh, churned]) {
      await admin.query(
        `INSERT INTO "ClientAssignment"
           (id, "clientId", "teamMemberId", "roleOnClient", status, "assignedSince", "monthlyCostMinor")
         VALUES (gen_random_uuid(), $1, $2, 'Diseño', 'active', $3::timestamp, 200000)`,
        [clientId, DESIGNER, `${ym}-01T00:00:00.000Z`],
      );
    }
    await admin.end();
    const prod = await app.inject({
      method: 'POST',
      url: `/months/${ym}/productions`,
      headers: owner,
      payload: {
        date: `${ym}-04`, clientId: fresh, type: 'Producción mensual', status: 'approved', hours: 2,
        viaticsMinor: '10000', attribution: [{ teamMemberId: CREATOR, hours: 2, role: 'responsible' }],
      },
    });
    expect(prod.statusCode).toBe(201);
  });

  it('states what a client with no cobro yet cost, beside the table and outside its totals', async () => {
    const after = await unbilled();
    // 2.000 of design + 2 h × 1.000 of production + 100 of viáticos. The churned client's
    // open assignment is stale data, not this month's spend.
    expect(after.clientCount - before.clientCount).toBe(1);
    expect(BigInt(after.costMinor) - BigInt(before.costMinor)).toBe(410000n);
    const table = (await app.inject({ method: 'GET', url: `/reports/profitability?period=${ym}-01`, headers: h('owner') }))
      .json().byClient as { clientId: string }[];
    expect(table.some((row) => row.clientId === fresh)).toBe(false);
  });

  it("gives the client's Resumen its month before any cobro exists", async () => {
    const res = await month(fresh);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      period: ym,
      billedMinor: '0',
      costTeamMinor: '200000',
      costProductionMinor: '200000',
      costViaticsMinor: '10000',
      costOtherMinor: '0',
      costTotalMinor: '410000',
    });
  });

  it('agrees with the Rentabilidad row once the month is billed', async () => {
    const rec = await app.inject({
      method: 'POST',
      url: '/receivables',
      headers: h('owner'),
      payload: { clientId: fresh, period: `${ym}-01`, service: 'Redes', dueDate: `${ym}-28`, baseAmountMinor: '1000000' },
    });
    expect(rec.statusCode).toBe(201);
    const row = ((await app.inject({ method: 'GET', url: `/reports/profitability?period=${ym}-01`, headers: h('owner') }))
      .json().byClient as { clientId: string; billedMinor: string; costTotalMinor: string }[]).find(
      (r) => r.clientId === fresh,
    );
    expect((await month(fresh)).json()).toMatchObject({
      billedMinor: row!.billedMinor,
      costTotalMinor: row!.costTotalMinor,
    });
  });

  it('is closed to a role without profitability, and answers 404 for a client that is not there', async () => {
    expect((await month(fresh, h('emp'))).statusCode).toBe(403);
    expect((await month('00000000-0000-4000-8000-00000000dead')).statusCode).toBe(404);
  });
});
