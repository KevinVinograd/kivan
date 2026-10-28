/**
 * In-app notifications integration. Verifies the table migration applies, that a
 * real action writes a notice to the OTHER managers (never the actor), that a person who
 * turned the event off gets none, and that reading is strictly self-scoped.
 */
import { execSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

let container: StartedPostgreSqlContainer;
let app: FastifyInstance;

const WS = '3c000000-0000-4000-8000-000000000001';
const OWNER_EMAIL = 'owner@nt.test';
const ADMIN_EMAIL = 'admin@nt.test';
const EMP_EMAIL = 'emp@nt.test';
const PASSWORD = 'a-correct-password';
const MEMBER = '3c000000-0000-4000-8000-000000000002';
const CLIENT = '3c000000-0000-4000-8000-000000000003';

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
  await admin.query(
    `INSERT INTO "TeamMember" (id, name, role, "employmentType", "compensationModel", "updatedAt")
     VALUES ($1, 'Vir', 'CM', 'employee', 'monthly_fixed', now())`,
    [MEMBER],
  );
  for (const [email, role] of [
    [OWNER_EMAIL, 'owner'],
    [ADMIN_EMAIL, 'admin'],
    [EMP_EMAIL, 'employee'],
  ] as const) {
    await admin.query(
      `INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, 'A', 'B', $3::"Role", now())`,
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

let ownerToken = '';
let adminToken = '';
let empToken = '';
beforeAll(async () => {
  const login = async (email: string) =>
    (await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: PASSWORD } })).json()
      .accessToken as string;
  ownerToken = await login(OWNER_EMAIL);
  adminToken = await login(ADMIN_EMAIL);
  empToken = await login(EMP_EMAIL);
});
function h(t: string) {
  return { authorization: `Bearer ${t}` };
}

describe('in-app notifications', () => {
  it('notifies the OTHER managers when a month is closed, never the actor', async () => {
    // Activity so the month is closeable, then close it as the owner.
    await app.inject({
      method: 'POST',
      url: '/receivables',
      headers: h(ownerToken),
      payload: { clientId: CLIENT, period: '2026-06-01', service: 'Redes', dueDate: '2026-06-30', baseAmountMinor: '10000' },
    });
    const closed = await app.inject({ method: 'POST', url: '/months/2026-06/close', headers: h(ownerToken) });
    expect(closed.statusCode).toBe(200);

    // The admin is told; the owner (who did it) is not.
    const adminInbox = await app.inject({ method: 'GET', url: '/notifications', headers: h(adminToken) });
    expect(adminInbox.statusCode).toBe(200);
    expect(adminInbox.json().items.some((n: { type: string }) => n.type === 'month.closed')).toBe(true);
    expect(adminInbox.json().unread).toBeGreaterThanOrEqual(1);

    const ownerInbox = await app.inject({ method: 'GET', url: '/notifications', headers: h(ownerToken) });
    expect(ownerInbox.json().items.some((n: { type: string }) => n.type === 'month.closed')).toBe(false);

    // An employee is outside the audience for a money movement.
    const empInbox = await app.inject({ method: 'GET', url: '/notifications', headers: h(empToken) });
    expect(empInbox.json().items).toHaveLength(0);
  });

  it('marks read only the caller own notices', async () => {
    const before = await app.inject({ method: 'GET', url: '/notifications?unread=true', headers: h(adminToken) });
    const target = before.json().items[0];
    expect(target).toBeDefined();

    const read = await app.inject({
      method: 'POST',
      url: '/notifications/read',
      headers: h(adminToken),
      payload: { ids: [target.id] },
    });
    expect(read.json().read).toBe(1);

    // Someone else marking the SAME id read affects nothing — the WHERE is scoped by user.
    const other = await app.inject({
      method: 'POST',
      url: '/notifications/read',
      headers: h(ownerToken),
      payload: { ids: [target.id] },
    });
    expect(other.json().read).toBe(0);

    const after = await app.inject({ method: 'GET', url: '/notifications?unread=true', headers: h(adminToken) });
    expect(after.json().items.some((n: { id: string }) => n.id === target.id)).toBe(false);
  });

  it('respects the recipient own preference (turning an event off stops the notice)', async () => {
    const prefs = await app.inject({ method: 'GET', url: '/me/notification-preferences', headers: h(adminToken) });
    expect(prefs.json()['month.closed']).toBe(true); // default

    const saved = await app.inject({
      method: 'PUT',
      url: '/me/notification-preferences',
      headers: h(adminToken),
      payload: { 'month.closed': false, 'payment.approved': true, 'statement.sent': true },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()['month.closed']).toBe(false);

    // Reopen + reclose: with the event off, the admin gets no new notice.
    const beforeCount = (await app.inject({ method: 'GET', url: '/notifications', headers: h(adminToken) })).json().items
      .length;
    await app.inject({ method: 'POST', url: '/months/2026-06/reopen', headers: h(ownerToken) });
    await app.inject({ method: 'POST', url: '/months/2026-06/close', headers: h(ownerToken) });
    const afterCount = (await app.inject({ method: 'GET', url: '/notifications', headers: h(adminToken) })).json().items
      .length;
    expect(afterCount).toBe(beforeCount);
  });
});
