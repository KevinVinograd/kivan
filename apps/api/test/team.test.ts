/**
 * TeamMember module integration (real Postgres, non-superuser app role):
 * manager CRUD, fail-closed authorization (employee can't write), and the
 * employee self-scoping (sees only their own linked member).
 */
import { execSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

let container: StartedPostgreSqlContainer;
let app: FastifyInstance;

const WS = '44444444-4444-4444-4444-444444444444';
const OWNER_EMAIL = 'owner@studio.test';
const EMPLOYEE_EMAIL = 'mica@studio.test';
const PASSWORD = 'a-correct-password';
const SEEDED_MEMBER = '0d000000-0000-4000-8000-000000000055';

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
     VALUES ($1, 'Mica Torres', 'designer', 'employee', 'monthly_fixed', now())`,
    [SEEDED_MEMBER],
  );
  await admin.query(
    `INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, 'Vicky', 'Owner', 'owner', now())`,
    [OWNER_EMAIL, passwordHash],
  );
  await admin.query(
    `INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, "teamMemberId", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, 'Mica', 'Torres', 'employee', $3, now())`,
    [EMPLOYEE_EMAIL, passwordHash, SEEDED_MEMBER],
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

async function token(email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password: PASSWORD },
  });
  return res.json().accessToken as string;
}

function auth(t: string) {
  return { authorization: `Bearer ${t}` };
}

describe('team-members', () => {
  it('manager creates, reads, updates and deactivates a member', async () => {
    const t = await token(OWNER_EMAIL);

    const created = await app.inject({
      method: 'POST',
      url: '/team-members',
      headers: auth(t),
      payload: { name: 'Flor Diseñadora', role: 'designer', monthlyAmountMinor: '45000000' },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;
    expect(created.json().monthlyAmountMinor).toBe('45000000');

    const list = await app.inject({ method: 'GET', url: '/team-members', headers: auth(t) });
    expect(list.statusCode).toBe(200);
    expect(list.json().total).toBeGreaterThanOrEqual(2);

    const updated = await app.inject({
      method: 'PUT',
      url: `/team-members/${id}`,
      headers: auth(t),
      payload: { role: 'senior designer' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().role).toBe('senior designer');

    const deactivated = await app.inject({
      method: 'POST',
      url: `/team-members/${id}/deactivate`,
      headers: auth(t),
    });
    expect(deactivated.statusCode).toBe(200);
    expect(deactivated.json().status).toBe('inactive');

    const gone = await app.inject({ method: 'GET', url: `/team-members/${id}`, headers: auth(t) });
    expect(gone.statusCode).toBe(404);
  });

  it('persists the roster status on edit (Editar persona / En pausa)', async () => {
    const t = await token(OWNER_EMAIL);
    const created = await app.inject({
      method: 'POST',
      url: '/team-members',
      headers: auth(t),
      payload: { name: 'Pausable', role: 'editor', status: 'active' },
    });
    const id = created.json().id as string;
    expect(created.json().status).toBe('active');

    const paused = await app.inject({
      method: 'PUT',
      url: `/team-members/${id}`,
      headers: auth(t),
      payload: { status: 'paused' },
    });
    expect(paused.statusCode).toBe(200);
    expect(paused.json().status).toBe('paused');

    // Survives a reload — it is a real column, not an in-memory flag.
    const reload = await app.inject({ method: 'GET', url: `/team-members/${id}`, headers: auth(t) });
    expect(reload.json().status).toBe('paused');
  });

  it('serves bank details only through the capability-gated sub-resource', async () => {
    const t = await token(OWNER_EMAIL);
    const created = await app.inject({
      method: 'POST',
      url: '/team-members',
      headers: auth(t),
      payload: { name: 'Bancaria', role: 'editor' },
    });
    const id = created.json().id as string;
    // Bank fields are NOT on the general DTO — only the derived boolean.
    expect(created.json().bank).toBeUndefined();
    expect(created.json().bankComplete).toBe(false);
    expect(created.json().bankStatus).toBe('none');

    // Upsert bank via the gated route.
    const saved = await app.inject({
      method: 'PUT',
      url: `/team-members/${id}/bank`,
      headers: auth(t),
      payload: {
        bankName: 'Galicia',
        accountHolder: 'Bancaria',
        cbuOrCvu: '0070123430004012345678',
        bankAlias: 'ban.caria',
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().alias).toBe('ban.caria');

    // Readable back through the gated route; the general DTO now reports complete.
    const bank = await app.inject({ method: 'GET', url: `/team-members/${id}/bank`, headers: auth(t) });
    expect(bank.json().cbuOrCvu).toBe('0070123430004012345678');
    const member = await app.inject({ method: 'GET', url: `/team-members/${id}`, headers: auth(t) });
    expect(member.json().bankComplete).toBe(true);
    expect(member.json().bank).toBeUndefined();
    expect(member.json().bankStatus).toBe('complete');

    // An edit answers with the member it wrote; that DTO must still see the bank row, or
    // the roster flips the person to "Sin datos" until the next reload.
    const edited = await app.inject({
      method: 'PUT',
      url: `/team-members/${id}`,
      headers: auth(t),
      payload: { role: 'fotografa' },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().bankComplete).toBe(true);
    expect(edited.json().bankStatus).toBe('complete');

    // Something on file but no CBU/CVU is incomplete, not absent.
    await app.inject({
      method: 'PUT',
      url: `/team-members/${id}/bank`,
      headers: auth(t),
      payload: { bankName: 'Galicia', accountHolder: 'Bancaria', cbuOrCvu: '', bankAlias: '' },
    });
    const partial = await app.inject({ method: 'GET', url: `/team-members/${id}`, headers: auth(t) });
    expect(partial.json().bankComplete).toBe(false);
    expect(partial.json().bankStatus).toBe('incomplete');
  });

  it('forbids an employee from the bank sub-resource (capability-gated)', async () => {
    const et = await token(EMPLOYEE_EMAIL);
    const denied = await app.inject({
      method: 'GET',
      url: `/team-members/${SEEDED_MEMBER}/bank`,
      headers: auth(et),
    });
    expect(denied.statusCode).toBe(403);
  });

  it('forbids an employee from creating a member (fail-closed)', async () => {
    const t = await token(EMPLOYEE_EMAIL);
    const res = await app.inject({
      method: 'POST',
      url: '/team-members',
      headers: auth(t),
      payload: { name: 'Nope', role: 'x' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('forbids an employee from reading another member by id (404)', async () => {
    const ot = await token(OWNER_EMAIL);
    const created = await app.inject({ method: 'POST', url: '/team-members', headers: auth(ot), payload: { name: 'Other', role: 'x' } });
    const otherId = created.json().id as string;
    const et = await token(EMPLOYEE_EMAIL);
    const denied = await app.inject({ method: 'GET', url: `/team-members/${otherId}`, headers: auth(et) });
    expect(denied.statusCode).toBe(404);
    const own = await app.inject({ method: 'GET', url: `/team-members/${SEEDED_MEMBER}`, headers: auth(et) });
    expect(own.statusCode).toBe(200);
  });

  it('scopes an employee list to their own linked member', async () => {
    const t = await token(EMPLOYEE_EMAIL);
    const res = await app.inject({ method: 'GET', url: '/team-members', headers: auth(t) });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.items[0].id).toBe(SEEDED_MEMBER);
  });
});

describe('time entries (Cargar horas)', () => {
  it('logs hours that persist and reads them back', async () => {
    const t = await token(OWNER_EMAIL);
    const created = await app.inject({
      method: 'POST',
      url: `/team-members/${SEEDED_MEMBER}/time-entries`,
      headers: auth(t),
      payload: { date: '2026-06-10', hours: 4, taskType: 'diseño', description: 'landing' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().hours).toBe(4);
    expect(created.json().month).toBe('2026-06');

    const list = await app.inject({
      method: 'GET',
      url: '/time-entries?period=2026-06',
      headers: auth(t),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().some((e: { id: string }) => e.id === created.json().id)).toBe(true);
  });

  it('lets an employee log their OWN hours but not another member’s', async () => {
    const et = await token(EMPLOYEE_EMAIL);
    const own = await app.inject({
      method: 'POST',
      url: `/team-members/${SEEDED_MEMBER}/time-entries`,
      headers: auth(et),
      payload: { date: '2026-06-11', hours: 2 },
    });
    expect(own.statusCode).toBe(201);

    // Another member's id → 403. The role check fires before any DB lookup, so a
    // non-SEEDED uuid is enough (and avoids an extra login the suite would rate-limit).
    const denied = await app.inject({
      method: 'POST',
      url: `/team-members/0e000000-0000-4000-8000-0000000000ee/time-entries`,
      headers: auth(et),
      payload: { date: '2026-06-11', hours: 1 },
    });
    expect(denied.statusCode).toBe(403);

    // An employee's list is scoped to their own entries only.
    const list = await app.inject({ method: 'GET', url: '/time-entries', headers: auth(et) });
    expect(list.json().every((e: { teamMemberId: string }) => e.teamMemberId === SEEDED_MEMBER)).toBe(true);
  });
});
