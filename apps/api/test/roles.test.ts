/**
 * Roles integration: studio-defined role CRUD, its invariants, assignment, and
 * fail-closed authz (owner-only — an admin must not be able to edit roles, since
 * that would let them grant themselves anything).
 */
import { execSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

let container: StartedPostgreSqlContainer;
let app: FastifyInstance;

const WS = '1d000000-0000-4000-8000-000000000010';
const OWNER_EMAIL = 'owner@roles.test';
const ADMIN_EMAIL = 'admin@roles.test';
const EMPLOYEE_EMAIL = 'emp@roles.test';
const PASSWORD = 'a-correct-password';

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('hold').withUsername('owner').withPassword('owner').start();
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
  // The settings row is created AFTER the migration, with no seeded system
  // roles — which is exactly the case `ensureSystemRoles` has to heal.
  await admin.query(`INSERT INTO "Workspace" (id, name) VALUES ($1, 'Studio')`, [WS]);
  for (const [email, role] of [
    [OWNER_EMAIL, 'owner'],
    [ADMIN_EMAIL, 'admin'],
    [EMPLOYEE_EMAIL, 'employee'],
  ] as const) {
    await admin.query(
      `INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, 'X', 'Y', $3, now())`,
      [email, passwordHash, role],
    );
  }
  await admin.end();

  process.env.DATABASE_URL = ownerUrl.replace('owner:owner@', 'hold_app:app@');
  process.env.RATE_LIMIT_AUTH = '10000';
  const { buildApp } = await import('../src/app.js');
  app = await buildApp();
});

afterAll(async () => {
  await app?.close();
  await container?.stop();
});

const tokens: Record<string, string> = {};
beforeAll(async () => {
  for (const [k, email] of [
    ['owner', OWNER_EMAIL],
    ['admin', ADMIN_EMAIL],
    ['emp', EMPLOYEE_EMAIL],
  ] as const) {
    tokens[k] = (
      await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: PASSWORD } })
    ).json().accessToken;
  }
});
function h(who: string) {
  return { authorization: `Bearer ${tokens[who]}` };
}

async function listRoles(who = 'owner') {
  const res = await app.inject({ method: 'GET', url: '/roles', headers: h(who) });
  return res.json() as Array<{
    id: string; key: string | null; name: string; isSystem: boolean; isOwner: boolean;
    grants: string[]; version: number; memberCount: number;
  }>;
}

async function createRole(name: string, grants: string[] = ['client.read']) {
  return app.inject({ method: 'POST', url: '/roles', headers: h('owner'), payload: { name, grants } });
}

describe('system roles', () => {
  it('heals a workspace that has none, and marks exactly one owner seat', async () => {
    const roles = await listRoles();
    const system = roles.filter((r) => r.isSystem);
    expect(system.map((r) => r.key).sort()).toEqual(['admin', 'employee', 'owner']);
    expect(system.filter((r) => r.isOwner)).toHaveLength(1);
    // Their authority is the Role enum + ROLE_CAPABILITIES, not a stored copy.
    expect(system.every((r) => r.grants.length === 0)).toBe(true);
  });

  it('is idempotent — a second read does not duplicate them', async () => {
    await listRoles();
    const roles = await listRoles();
    expect(roles.filter((r) => r.isSystem)).toHaveLength(3);
  });

  it('refuses to edit or delete one', async () => {
    const owner = (await listRoles()).find((r) => r.key === 'owner')!;
    const edit = await app.inject({
      method: 'PUT', url: `/roles/${owner.id}`, headers: h('owner'),
      payload: { name: 'Jefe', version: owner.version },
    });
    expect(edit.statusCode).toBe(409);
    const del = await app.inject({
      method: 'DELETE', url: `/roles/${owner.id}?version=${owner.version}`, headers: h('owner'),
    });
    expect(del.statusCode).toBe(409);
  });
});

describe('custom roles', () => {
  it('creates, reads back and updates with a version guard', async () => {
    const created = await createRole('Contadora', ['receivable.read', 'payment.read']);
    expect(created.statusCode).toBe(201);
    const role = created.json();
    expect(role.isSystem).toBe(false);
    expect(role.grants).toEqual(['receivable.read', 'payment.read']);

    const updated = await app.inject({
      method: 'PUT', url: `/roles/${role.id}`, headers: h('owner'),
      payload: { name: 'Contadora externa', grants: ['receivable.read'], version: role.version },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().name).toBe('Contadora externa');
    expect(updated.json().version).toBe(role.version + 1);

    // The stale writer loses rather than clobbering the newer edit.
    const stale = await app.inject({
      method: 'PUT', url: `/roles/${role.id}`, headers: h('owner'),
      payload: { name: 'Otra cosa', version: role.version },
    });
    expect(stale.statusCode).toBe(409);
  });

  it('refuses a duplicate name in the same workspace', async () => {
    await createRole('Repetido');
    const again = await createRole('Repetido');
    expect(again.statusCode).toBe(409);
  });

  // Privilege-escalation guard: isOwner/isSystem/key are server-controlled. Sending them in
  // the body must NOT mint an owner-equivalent or a fake system role. Today the zod schema
  // strips them and the repo hardcodes false — this test is the regression that fails the
  // moment someone loosens the schema or spreads the raw body into the create data.
  it('ignores isOwner/isSystem/key smuggled in the create body', async () => {
    const res = await app.inject({
      method: 'POST', url: '/roles', headers: h('owner'),
      payload: { name: 'Colada', grants: [], isOwner: true, isSystem: true, key: 'owner' },
    });
    expect(res.statusCode).toBe(201);
    const role = res.json();
    expect(role.isOwner).toBe(false);
    expect(role.isSystem).toBe(false);
    expect(role.key).toBeNull();
  });

  it('rejects a grant that is not a resource.action key', async () => {
    const res = await app.inject({
      method: 'POST', url: '/roles', headers: h('owner'),
      payload: { name: 'Malformado', grants: ['NotAKey'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('deletes one that nobody holds', async () => {
    const role = (await createRole('Descartable')).json();
    const del = await app.inject({
      method: 'DELETE', url: `/roles/${role.id}?version=${role.version}`, headers: h('owner'),
    });
    expect(del.statusCode).toBe(204);
    expect((await listRoles()).find((r) => r.id === role.id)).toBeUndefined();
  });
});

describe('assignment', () => {
  async function userId(email: string): Promise<string> {
    const users = (await app.inject({ method: 'GET', url: '/users', headers: h('owner') })).json();
    return users.find((u: { email: string }) => u.email === email).id;
  }

  it('assigns a custom role WITHOUT changing the enum the API still authorizes on', async () => {
    const role = (await createRole('Analista')).json();
    const target = await userId(EMPLOYEE_EMAIL);
    const res = await app.inject({
      method: 'PATCH', url: `/users/${target}/workspace-role`, headers: h('owner'),
      payload: { roleId: role.id },
    });
    expect(res.statusCode).toBe(204);

    const users = (await app.inject({ method: 'GET', url: '/users', headers: h('owner') })).json();
    // Still an employee as far as authorization is concerned: nothing enforces
    // custom grants yet, so the enum must not move.
    expect(users.find((u: { email: string }) => u.email === EMPLOYEE_EMAIL).role).toBe('employee');
    expect((await listRoles()).find((r) => r.id === role.id)!.memberCount).toBe(1);
  });

  it('refuses to delete a role somebody holds', async () => {
    const role = (await listRoles()).find((r) => r.name === 'Analista')!;
    const del = await app.inject({
      method: 'DELETE', url: `/roles/${role.id}?version=${role.version}`, headers: h('owner'),
    });
    expect(del.statusCode).toBe(409);
    // The API's error contract is `{ error: { code, message } }`. The message
    // has to name the obstacle, not just refuse — the owner needs to know that
    // somebody holds the role and has to be moved first.
    expect(del.json().error.message).toMatch(/persona/i);
  });

  it('refuses to move the owner out of their own seat', async () => {
    const role = (await createRole('Cualquiera')).json();
    const self = await userId(OWNER_EMAIL);
    const onSelf = await app.inject({
      method: 'PATCH', url: `/users/${self}/workspace-role`, headers: h('owner'),
      payload: { roleId: role.id },
    });
    expect(onSelf.statusCode).toBe(409);
    // NOTE what this does and does not prove. The route is owner-only, so the
    // actor and the owner seat are the same person and this case trips the
    // `target.role === 'owner'` guard. It does NOT cover the separate
    // self-assignment guard: disabling that one leaves this test green
    // (measured). That guard is unreachable until `role.manage` can be delegated
    // to a custom role, and it needs its own test the day it can be.
  });

  it('refuses to confer the owner seat', async () => {
    const ownerRole = (await listRoles()).find((r) => r.isOwner)!;
    const target = await userId(ADMIN_EMAIL);
    const res = await app.inject({
      method: 'PATCH', url: `/users/${target}/workspace-role`, headers: h('owner'),
      payload: { roleId: ownerRole.id },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('authz, fail-closed', () => {
  it('forbids an admin from reading or writing roles', async () => {
    expect((await app.inject({ method: 'GET', url: '/roles', headers: h('admin') })).statusCode).toBe(403);
    expect(
      (await app.inject({ method: 'POST', url: '/roles', headers: h('admin'), payload: { name: 'X', grants: [] } }))
        .statusCode,
    ).toBe(403);
  });

  it('forbids an employee', async () => {
    expect((await app.inject({ method: 'GET', url: '/roles', headers: h('emp') })).statusCode).toBe(403);
  });

  it('requires a token', async () => {
    expect((await app.inject({ method: 'GET', url: '/roles' })).statusCode).toBe(401);
  });
});

describe('capability enforcement (custom-role engine)', () => {
  async function userId(email: string): Promise<string> {
    const users = (await app.inject({ method: 'GET', url: '/users', headers: h('owner') })).json();
    return users.find((u: { email: string }) => u.email === email).id;
  }
  async function login(email: string): Promise<string> {
    return (
      await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: PASSWORD } })
    ).json().accessToken as string;
  }

  it('narrows a session to the custom role grants, and enforces it on the gated routes', async () => {
    // A role that grants every money capability EXCEPT profitability.
    const role = (
      await createRole('Sin rentabilidad', [
        'report.financials.read',
        'member.compensation.read',
        'member.bank.read',
      ])
    ).json();
    const target = await userId(ADMIN_EMAIL);
    const assigned = await app.inject({
      method: 'PATCH', url: `/users/${target}/workspace-role`, headers: h('owner'),
      payload: { roleId: role.id },
    });
    expect(assigned.statusCode).toBe(204);

    // A FRESH login mints the narrowed capabilities into the token.
    const token = await login(ADMIN_EMAIL);
    const auth = { authorization: `Bearer ${token}` };

    const me = (await app.inject({ method: 'GET', url: '/auth/me', headers: auth })).json();
    expect(me.capabilities.sort()).toEqual(
      ['studioFinancials', 'teamCost', 'teamBankDetails'].sort(),
    );
    expect(me.capabilities).not.toContain('profitability');
    // The enum is unchanged — authorization narrows via capabilities, not the built-in role.
    expect(me.role).toBe('admin');

    // studioFinancials is granted → 200; profitability is not → 403.
    expect(
      (await app.inject({ method: 'GET', url: '/reports/financials?period=2026-06', headers: auth })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/reports/profitability?period=2026-06', headers: auth })).statusCode,
    ).toBe(403);
  });

  /**
   * The per-client payable, withheld on EVERY row and not just the first.
   *
   * `toAssignmentDto` takes the capability as its second argument. Written as
   * `rows.map(toAssignmentDto)` that argument is the ARRAY INDEX: row 0 is withheld
   * (index 0 is falsy) and every later row leaks what the studio pays per client. The
   * response is a 200 and looks correct on any client whose FIRST assignment you happen
   * to check, which is why this test reads three and asserts on all of them.
   *
   * The mapper's required parameter makes that call a compile error today. This is the
   * runtime proof, so the guarantee survives a future refactor that reintroduces a
   * default.
   */
  it('withholds the per-client cost on EVERY assignment row, not just the first', async () => {
    const role = (await createRole('Sin costos', ['client.read', 'assignment.create'])).json();
    const target = await userId(ADMIN_EMAIL);
    await app.inject({
      method: 'PATCH', url: `/users/${target}/workspace-role`, headers: h('owner'),
      payload: { roleId: role.id },
    });

    // Seeded by the OWNER, who holds teamCost — so the amounts really are stored.
    const client = (
      await app.inject({
        method: 'POST', url: '/clients', headers: h('owner'), payload: { name: 'Tres Personas SA' },
      })
    ).json();
    for (const name of ['Uno', 'Dos', 'Tres']) {
      const member = (
        await app.inject({
          method: 'POST', url: '/team-members', headers: h('owner'),
          payload: { name, role: 'Diseño' },
        })
      ).json();
      const created = await app.inject({
        method: 'POST', url: `/clients/${client.id}/assignments`, headers: h('owner'),
        payload: { teamMemberId: member.id, roleOnClient: 'Diseño', monthlyCostMinor: '50000' },
      });
      expect(created.json().monthlyCostMinor).toBe('50000');
    }

    // A FRESH login mints the narrowed capabilities.
    const token = await login(ADMIN_EMAIL);
    const narrowed = { authorization: `Bearer ${token}` };
    const me = (await app.inject({ method: 'GET', url: '/auth/me', headers: narrowed })).json();
    expect(me.capabilities).not.toContain('teamCost');

    const rows = (
      await app.inject({
        method: 'GET', url: `/clients/${client.id}/assignments`, headers: narrowed,
      })
    ).json() as { monthlyCostMinor: string | null }[];
    expect(rows).toHaveLength(3);
    // Every row, named individually: `.every()` would also pass if the array were empty,
    // and the SECOND is the one an index-as-flag bug leaks first.
    expect(rows[0]!.monthlyCostMinor).toBeNull();
    expect(rows[1]!.monthlyCostMinor).toBeNull();
    expect(rows[2]!.monthlyCostMinor).toBeNull();

    // And it cannot be SET either — refused loudly rather than stripped, so the caller
    // is never told a figure was saved that was not.
    const fourth = (
      await app.inject({
        method: 'POST', url: '/team-members', headers: h('owner'),
        payload: { name: 'Cuatro', role: 'Diseño' },
      })
    ).json();
    const write = await app.inject({
      method: 'POST', url: `/clients/${client.id}/assignments`, headers: narrowed,
      payload: { teamMemberId: fourth.id, roleOnClient: 'Diseño', monthlyCostMinor: '1' },
    });
    expect(write.statusCode).toBe(403);

    // The same request WITHOUT the money field goes through: managing who works on
    // what is not payroll, and the gate must not swallow the whole action.
    const allowed = await app.inject({
      method: 'POST', url: `/clients/${client.id}/assignments`, headers: narrowed,
      payload: { teamMemberId: fourth.id, roleOnClient: 'Diseño' },
    });
    expect(allowed.statusCode).toBe(201);
    expect(allowed.json().monthlyCostMinor).toBeNull();
  });

  it('leaves a session WITHOUT a custom role unchanged (owner keeps everything)', async () => {
    const token = await login(OWNER_EMAIL);
    const auth = { authorization: `Bearer ${token}` };
    const me = (await app.inject({ method: 'GET', url: '/auth/me', headers: auth })).json();
    expect(me.capabilities.sort()).toEqual(
      ['profitability', 'studioFinancials', 'teamCost', 'teamBankDetails'].sort(),
    );
    expect(me.permissions ?? null).toBeNull();
    expect(
      (await app.inject({ method: 'GET', url: '/reports/profitability?period=2026-06', headers: auth })).statusCode,
    ).toBe(200);
  });

  it('narrows ACTIONS to the grants: an ungranted write 403s, a granted one passes', async () => {
    const ownerAuth = { authorization: `Bearer ${await login(OWNER_EMAIL)}` };
    // Owner (no custom role) creates a client — the built-in path is unchanged.
    const created = await app.inject({
      method: 'POST', url: '/clients', headers: ownerAuth,
      payload: { name: 'Cliente base', monthlyFeeMinor: '0' },
    });
    expect(created.statusCode).toBe(201);
    const clientId = created.json().id as string;

    // A custom role that can EDIT clients but not CREATE them.
    const role = (await createRole('Editor de clientes', ['client.update'])).json();
    const target = await userId(ADMIN_EMAIL);
    await app.inject({
      method: 'PATCH', url: `/users/${target}/workspace-role`, headers: h('owner'),
      payload: { roleId: role.id },
    });
    const adminAuth = { authorization: `Bearer ${await login(ADMIN_EMAIL)}` };

    // create is NOT granted → 403; update IS granted → 200. Same admin, same route family.
    const create = await app.inject({
      method: 'POST', url: '/clients', headers: adminAuth,
      payload: { name: 'No permitido', monthlyFeeMinor: '0' },
    });
    expect(create.statusCode).toBe(403);
    const update = await app.inject({
      method: 'PUT', url: `/clients/${clientId}`, headers: adminAuth,
      payload: { name: 'Renombrado por editor' },
    });
    expect(update.statusCode).toBe(200);
  });
});
