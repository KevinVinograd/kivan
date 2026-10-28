/**
 * Treasury / Cashflow integration (real Postgres, non-superuser app role):
 * multi-lane position, optimistic-concurrency on account edits (stale version →
 * 409), the deterministic 13-week projection from committed items, and authz.
 */
import { execSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

let container: StartedPostgreSqlContainer;
let app: FastifyInstance;

const WS = '1a000000-0000-4000-8000-000000000001';
const EMITTER = '0c000000-0000-4000-8000-0000000000e1';
const OWNER_EMAIL = 'owner@studio.test';
const EMPLOYEE_EMAIL = 'emp@studio.test';
const PASSWORD = 'a-correct-password';

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
  // An emisor, so the commitment link test's POSITIVE half actually runs. Without one it
  // early-returned and the whole test passed with the emitter branch disabled — a test
  // that cannot fail is not a guard.
  await admin.query(
    `INSERT INTO "InvoiceEmitter" (id, code, label) VALUES ($1, 'monotributo_1', 'Monotributo Uno')`,
    [EMITTER],
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

describe('treasury', () => {
  it('aggregates the multi-lane position (operating vs reserve)', async () => {
    await app.inject({ method: 'POST', url: '/treasury/accounts', headers: h(), payload: { name: 'Op ARS', balanceArsMinor: '1000000' } });
    await app.inject({ method: 'POST', url: '/treasury/accounts', headers: h(), payload: { name: 'Reserva', balanceArsMinor: '500000', isReserve: true } });

    const pos = await app.inject({ method: 'GET', url: '/treasury/position', headers: h() });
    expect(pos.json().ars.operatingMinor).toBe('1000000');
    expect(pos.json().ars.reserveMinor).toBe('500000');
    expect(pos.json().ars.totalMinor).toBe('1500000');
  });

  it('enforces optimistic concurrency on account edits (stale version → 409)', async () => {
    const created = await app.inject({ method: 'POST', url: '/treasury/accounts', headers: h(), payload: { name: 'Editable', balanceArsMinor: '0' } });
    const id = created.json().id as string;
    expect(created.json().version).toBe(0);

    const ok = await app.inject({ method: 'PUT', url: `/treasury/accounts/${id}`, headers: h(), payload: { version: 0, name: 'Renamed' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().version).toBe(1);
    expect(ok.json().name).toBe('Renamed');

    const stale = await app.inject({ method: 'PUT', url: `/treasury/accounts/${id}`, headers: h(), payload: { version: 0, name: 'Nope' } });
    expect(stale.statusCode).toBe(409); // version moved to 1
  });

  it('derives the 13-week projection from committed items', async () => {
    // Operating account funds the starting balance (1.000.000 + the editable 0).
    await app.inject({ method: 'POST', url: '/treasury/commitments', headers: h(), payload: { description: 'Alquiler', direction: 'outflow', amountMinor: '300000', recurrence: 'monthly', anchorDay: 5, startDate: '2026-01-01' } });
    await app.inject({ method: 'POST', url: '/treasury/commitments', headers: h(), payload: { description: 'Cobro semanal', direction: 'inflow', amountMinor: '50000', recurrence: 'weekly', startDate: '2026-06-01' } });

    const res = await app.inject({ method: 'GET', url: '/treasury/projection?lane=ARS&weeks=4&from=2026-06-01', headers: h() });
    expect(res.statusCode).toBe(200);
    const p = res.json();
    expect(p.startingBalanceMinor).toBe('1000000'); // sum of operating accounts
    // week 0: +50.000 inflow, -300.000 outflow (alquiler on the 5th) → net -250.000 → 750.000
    expect(p.weeks[0].outflowMinor).toBe('300000');
    expect(p.weeks[0].inflowMinor).toBe('50000');
    expect(p.weeks[0].endBalanceMinor).toBe('750000');
    // weeks 1-3: only the weekly +50.000 each → 800k, 850k, 900k
    expect(p.weeks[1].endBalanceMinor).toBe('800000');
    expect(p.weeks[3].endBalanceMinor).toBe('900000');
  });

  it('forbids an employee from the treasury surface (fail-closed)', async () => {
    const res = await app.inject({ method: 'GET', url: '/treasury/position', headers: h(empToken) });
    expect(res.statusCode).toBe(403);
  });

  it('persists an account created inactive, and keeps it out of the operating position', async () => {
    const before = (await app.inject({ method: 'GET', url: '/treasury/position', headers: h() })).json()
      .ars.operatingMinor;

    const created = await app.inject({
      method: 'POST',
      url: '/treasury/accounts',
      headers: h(),
      payload: { name: 'Inactiva', balanceArsMinor: '424242', isActive: false },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().isActive).toBe(false);

    // Survives a reload: the flag comes back off from the list, not just the create echo.
    const listed = (await app.inject({ method: 'GET', url: '/treasury/accounts', headers: h() }))
      .json()
      .find((a: { id: string }) => a.id === created.json().id);
    expect(listed.isActive).toBe(false);

    // Its balance is not operating cash, so the position total does not move.
    const after = (await app.inject({ method: 'GET', url: '/treasury/position', headers: h() })).json()
      .ars.operatingMinor;
    expect(after).toBe(before);
  });

  it('persists the Activa switch flipping on across an edit', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/treasury/accounts',
      headers: h(),
      payload: { name: 'Prende', balanceArsMinor: '0', isActive: false },
    });
    const id = created.json().id as string;

    const on = await app.inject({
      method: 'PUT',
      url: `/treasury/accounts/${id}`,
      headers: h(),
      payload: { version: 0, isActive: true },
    });
    expect(on.statusCode).toBe(200);
    expect(on.json().isActive).toBe(true);
  });

  it('persists a commitment created inactive (kept out of the projection)', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/treasury/commitments',
      headers: h(),
      payload: {
        description: 'Inactivo',
        direction: 'outflow',
        amountMinor: '900000',
        recurrence: 'monthly',
        anchorDay: 5,
        startDate: '2026-06-01',
        isActive: false,
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().isActive).toBe(false);

    const listed = (await app.inject({ method: 'GET', url: '/treasury/commitments', headers: h() }))
      .json()
      .find((c: { id: string }) => c.id === created.json().id);
    expect(listed.isActive).toBe(false);
  });

  describe('commitment entity link', () => {
    // The projection supersedes a commitment by IDENTITY, so this pair is the whole
    // mechanism. The columns are plain nullable columns with no foreign key behind them,
    // which is why every guard below lives in the API rather than in the database.
    const commitmentPayload = {
      description: 'Abono mensual',
      direction: 'inflow',
      amountMinor: '500000',
      recurrence: 'monthly',
      anchorDay: 10,
      startDate: '2026-06-01',
      category: 'retainer',
    };

    async function makeClient(name: string): Promise<string> {
      const res = await app.inject({ method: 'POST', url: '/clients', headers: h(), payload: { name } });
      expect(res.statusCode).toBe(201);
      return res.json().id as string;
    }

    it('round-trips a link on create, on read and on update', async () => {
      const clientId = await makeClient('Café Roma');
      const created = await app.inject({
        method: 'POST',
        url: '/treasury/commitments',
        headers: h(),
        payload: { ...commitmentPayload, linkedEntityType: 'client', linkedEntityId: clientId },
      });
      expect(created.statusCode).toBe(201);
      expect(created.json().linkedEntityType).toBe('client');
      expect(created.json().linkedEntityId).toBe(clientId);

      const listed = (await app.inject({ method: 'GET', url: '/treasury/commitments', headers: h() }))
        .json()
        .find((c: { id: string }) => c.id === created.json().id);
      expect(listed.linkedEntityId).toBe(clientId);

      // Both null CLEARS it, which is how moving a row to a category that names no
      // counterparty stops it pointing at a client it is no longer about.
      const cleared = await app.inject({
        method: 'PUT',
        url: `/treasury/commitments/${created.json().id}`,
        headers: h(),
        payload: { version: created.json().version, linkedEntityType: null, linkedEntityId: null },
      });
      expect(cleared.statusCode).toBe(200);
      expect(cleared.json().linkedEntityType).toBeNull();
      expect(cleared.json().linkedEntityId).toBeNull();
    });

    it('rejects a half-sent pair', async () => {
      // A type with no id names nothing; an id with no type cannot be resolved to a table.
      const clientId = await makeClient('Media Pila');
      const typeOnly = await app.inject({
        method: 'POST',
        url: '/treasury/commitments',
        headers: h(),
        payload: { ...commitmentPayload, linkedEntityType: 'client' },
      });
      expect(typeOnly.statusCode).toBe(400);

      const idOnly = await app.inject({
        method: 'POST',
        url: '/treasury/commitments',
        headers: h(),
        payload: { ...commitmentPayload, linkedEntityId: clientId },
      });
      expect(idOnly.statusCode).toBe(400);
    });

    it('rejects an id that names no row in this workspace', async () => {
      // Without this the link persists happily and then silently never matches an actual:
      // the register would read as linked while the projection behaved as unlinked.
      const res = await app.inject({
        method: 'POST',
        url: '/treasury/commitments',
        headers: h(),
        payload: {
          ...commitmentPayload,
          linkedEntityType: 'client',
          linkedEntityId: '1a000000-0000-4000-8000-0000000000ff',
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects an entity kind whose actuals carry no matching id', async () => {
      // `fixed_expense` is a CATEGORY, never an entity kind. The categories it names now
      // do link — to the provider that is actually paid — but the kind sent here still
      // has to be one of the four the pool can key on.
      const res = await app.inject({
        method: 'POST',
        url: '/treasury/commitments',
        headers: h(),
        payload: {
          ...commitmentPayload,
          linkedEntityType: 'fixed_expense',
          linkedEntityId: '1a000000-0000-4000-8000-0000000000ff',
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('links a monotributo cuota to its emisor, and refuses one that does not exist', async () => {
      // The emisor is what makes a cuota tellable from another monotributista's. It has
      // no soft delete — it is studio configuration — so existence is the whole
      // check, and this pins that the kind resolves against the right table at all.
      const emitters = await app.inject({ method: 'GET', url: '/invoice-emitters', headers: h() });
      expect(emitters.statusCode).toBe(200);
      const emitterId = (emitters.json() as { id: string }[])[0]?.id;

      const unknown = await app.inject({
        method: 'POST',
        url: '/treasury/commitments',
        headers: h(),
        payload: {
          ...commitmentPayload,
          linkedEntityType: 'invoiceEmitter',
          linkedEntityId: '1a000000-0000-4000-8000-0000000000fe',
        },
      });
      expect(unknown.statusCode).toBe(400);

      expect(emitterId).toBeTruthy();
      const created = await app.inject({
        method: 'POST',
        url: '/treasury/commitments',
        headers: h(),
        payload: {
          ...commitmentPayload,
          linkedEntityType: 'invoiceEmitter',
          linkedEntityId: emitterId,
        },
      });
      expect(created.statusCode).toBe(201);
      expect(created.json().linkedEntityType).toBe('invoiceEmitter');
    });
  });
});
