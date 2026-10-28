/**
 * Member activity (viáticos + extra work) integration. Verifies the new tables +
 * migration applies, that create/list/approve persist, money round-trips in
 * minor units, an employee is scoped to their own rows, and approving is
 * manager-only.
 */
import { execSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

let container: StartedPostgreSqlContainer;
let app: FastifyInstance;

const WS = '2c000000-0000-4000-8000-000000000001';
const OWNER_EMAIL = 'owner@ma.test';
const EMP_EMAIL = 'emp@ma.test';
const PASSWORD = 'a-correct-password';
const MEMBER = '2c000000-0000-4000-8000-000000000002';
const EMP_MEMBER = '2c000000-0000-4000-8000-000000000003';

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
     VALUES ($1, 'Vir', 'CM', 'employee', 'monthly_fixed', now()), ($2, 'Emi', 'CM', 'employee', 'monthly_fixed', now())`,
    [MEMBER, EMP_MEMBER],
  );
  await admin.query(
    `INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, 'V', 'O', 'owner', now())`,
    [OWNER_EMAIL, passwordHash],
  );
  // The employee login is linked to EMP_MEMBER so self-scoping resolves.
  await admin.query(
    `INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, "teamMemberId", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, 'E', 'M', 'employee', $3, now())`,
    [EMP_EMAIL, passwordHash, EMP_MEMBER],
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
  empToken = (await app.inject({ method: 'POST', url: '/auth/login', payload: { email: EMP_EMAIL, password: PASSWORD } })).json().accessToken;
});
function h(t = token) {
  return { authorization: `Bearer ${t}` };
}

describe('member activity — viáticos + extra work', () => {
  it('creates + lists a viático (money round-trips in minor units)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/member-expenses',
      headers: h(),
      payload: { teamMemberId: MEMBER, date: '2026-06-10', concept: 'Taxi', amountMinor: '15000' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ teamMemberId: MEMBER, concept: 'Taxi', amountMinor: '15000', status: 'pending' });

    const list = await app.inject({ method: 'GET', url: '/member-expenses', headers: h() });
    expect(list.json().some((e: { id: string }) => e.id === res.json().id)).toBe(true);
  });

  it('creates + approves extra work (pending → approved, manager only)', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/member-extras',
      headers: h(),
      payload: { teamMemberId: MEMBER, date: '2026-06-11', description: 'Fin de semana', hours: 5, amountMinor: '40000' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ status: 'pending', amountMinor: '40000' });

    // An employee cannot approve.
    expect((await app.inject({ method: 'POST', url: '/member-extras/approve', headers: h(empToken), payload: { teamMemberId: MEMBER } })).statusCode).toBe(403);

    const approve = await app.inject({ method: 'POST', url: '/member-extras/approve', headers: h(), payload: { teamMemberId: MEMBER } });
    expect(approve.statusCode).toBe(200);
    expect(approve.json().approved).toBeGreaterThanOrEqual(1);

    const list = await app.inject({ method: 'GET', url: '/member-extras', headers: h() });
    const row = list.json().find((e: { id: string }) => e.id === created.json().id);
    expect(row.status).toBe('approved');
  });

  it('scopes an employee to their OWN rows and blocks logging for others', async () => {
    // The employee logs their own viático — allowed.
    const own = await app.inject({
      method: 'POST',
      url: '/member-expenses',
      headers: h(empToken),
      payload: { teamMemberId: EMP_MEMBER, date: '2026-06-12', concept: 'Propio', amountMinor: '5000' },
    });
    expect(own.statusCode).toBe(201);

    // Logging for ANOTHER member is forbidden.
    const other = await app.inject({
      method: 'POST',
      url: '/member-expenses',
      headers: h(empToken),
      payload: { teamMemberId: MEMBER, date: '2026-06-12', concept: 'Ajeno', amountMinor: '5000' },
    });
    expect(other.statusCode).toBe(403);

    // The employee's list shows only their own rows (never the owner-logged MEMBER ones).
    const list = await app.inject({ method: 'GET', url: '/member-expenses', headers: h(empToken) });
    expect(list.json().every((e: { teamMemberId: string }) => e.teamMemberId === EMP_MEMBER)).toBe(true);
  });
});
