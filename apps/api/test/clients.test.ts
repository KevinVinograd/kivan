/**
 * Clients module integration (real Postgres, non-superuser app role): manager
 * CRUD + status, the assignment sub-resource (create/list/soft-end), fail-closed
 * authz, and the employee "assigned-only" client visibility.
 */
import { execSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

let container: StartedPostgreSqlContainer;
let app: FastifyInstance;

const WS = '66666666-6666-6666-6666-666666666666';
const OWNER_EMAIL = 'owner@studio.test';
const EMPLOYEE_EMAIL = 'emp@studio.test';
// An employee login with NO roster person. An invitation may leave that link unset
// ("Sin vincular"), so `actor.teamMemberId` is legitimately null for a real user.
const UNLINKED_EMAIL = 'sinvincular@studio.test';
const PASSWORD = 'a-correct-password';
// A well-formed UUID: the variant nibble (first of the 4th group) must be 8-b, so
// the old '7777…-7777-…' was rejected by `z.uuid()` the moment it reached a validated
// route param. It only ever went into raw SQL before, which accepts it happily.
const EMP_MEMBER = '77777777-7777-4777-8777-777777777777';
const ASSIGNABLE_MEMBER = '88888888-8888-8888-8888-888888888888';
const ASSIGNED_CLIENT = '0d000000-0000-4000-8000-000000000099';

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
  for (const [id, name] of [
    [EMP_MEMBER, 'Mica'],
    [ASSIGNABLE_MEMBER, 'Flor'],
  ] as const) {
    await admin.query(
      `INSERT INTO "TeamMember" (id, name, role, "employmentType", "compensationModel", "updatedAt")
       VALUES ($1, $2, 'designer', 'employee', 'monthly_fixed', now())`,
      [id, name],
    );
  }
  await admin.query(
    `INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, 'V', 'O', 'owner', now())`,
    [OWNER_EMAIL, passwordHash],
  );
  await admin.query(
    `INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, "teamMemberId", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, 'M', 'T', 'employee', $3, now())`,
    [EMPLOYEE_EMAIL, passwordHash, EMP_MEMBER],
  );
  await admin.query(
    `INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, 'S', 'V', 'employee', now())`,
    [UNLINKED_EMAIL, passwordHash],
  );
  // A client the employee IS assigned to (so they can see it) + the assignment.
  await admin.query(
    `INSERT INTO "Client" (id, name, "updatedAt") VALUES ($1, 'Café Roma', now())`,
    [ASSIGNED_CLIENT],
  );
  await admin.query(
    `INSERT INTO "ClientAssignment" (id, "clientId", "teamMemberId", "roleOnClient", status)
     VALUES (gen_random_uuid(), $1, $2, 'lead', 'active')`,
    [ASSIGNED_CLIENT, EMP_MEMBER],
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

/**
 * One login per identity for the whole file.
 *
 * `/auth/login` is rate-limited (`auth.routes.ts` → `RATE_LIMIT_AUTH`), and this
 * helper used to log in on every call. Adding tests therefore consumed a budget
 * shared with every existing one: past the limit, login 429s, `accessToken` comes
 * back `undefined`, and EVERY request in the file 401s — a failure that points at
 * authorization and is really about test-suite arithmetic. The sibling suites
 * (`ledger`, `payments`) already hoist their tokens for the same reason.
 */
const tokens = new Map<string, string>();
async function token(email: string): Promise<string> {
  const cached = tokens.get(email);
  if (cached) return cached;
  const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: PASSWORD } });
  const accessToken = res.json().accessToken as string;
  if (!accessToken) {
    throw new Error(`login failed for ${email}: ${res.statusCode} ${res.body}`);
  }
  tokens.set(email, accessToken);
  return accessToken;
}
function auth(t: string) {
  return { authorization: `Bearer ${t}` };
}

describe('clients', () => {
  it('manager CRUD + status + assignments', async () => {
    const t = await token(OWNER_EMAIL);

    const created = await app.inject({
      method: 'POST',
      url: '/clients',
      headers: auth(t),
      payload: { name: 'Logística Sur', monthlyFeeMinor: '120000000', status: 'active' },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;
    expect(created.json().monthlyFeeMinor).toBe('120000000');

    const updated = await app.inject({
      method: 'PUT',
      url: `/clients/${id}`,
      headers: auth(t),
      payload: { contactName: 'Juan' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().contactName).toBe('Juan');
    // A partial update must not resurrect the create-time defaults: omitting
    // `status`/`currency` means "leave them alone", never "reset to onboarding/ARS".
    expect(updated.json().status).toBe('active');
    expect(updated.json().currency).toBe('ARS');

    // The commercial terms round-trip. `services` is the one that mattered most:
    // the checkboxes were collected by the form and dropped on the way out, so every
    // reload showed an empty list and the operator had to re-tick them on each edit.
    const terms = await app.inject({
      method: 'PUT',
      url: `/clients/${id}`,
      headers: auth(t),
      payload: {
        clientType: 'Gastronomía',
        services: ['Redes', 'Diseño gráfico'],
        paymentMethod: 'transfer',
        billingCycle: 'arrears',
        projectFeeMinor: '5000000',
        projectEndDate: '2026-12-31',
        secondaryEmail: 'pagos@sur.com',
        adminContactName: 'Vero',
        adminContactEmail: 'admin@sur.com',
        adminContactPhone: '+54 11 4444',
        address: 'Av. Corrientes 1234, CABA',
        discountPercentBp: 1000,
      },
    });
    expect(terms.statusCode).toBe(200);
    expect(terms.json().services).toEqual(['Redes', 'Diseño gráfico']);
    expect(terms.json().clientType).toBe('Gastronomía');
    expect(terms.json().paymentMethod).toBe('transfer');
    expect(terms.json().billingCycle).toBe('arrears');
    expect(terms.json().projectFeeMinor).toBe('5000000');
    expect(terms.json().adminContactName).toBe('Vero');
    expect(terms.json().secondaryEmail).toBe('pagos@sur.com');

    expect(terms.json().address).toBe('Av. Corrientes 1234, CABA');
    expect(terms.json().discountPercentBp).toBe(1000);

    // And they survive a re-read, not just the write's own response.
    const reread = await app.inject({ method: 'GET', url: `/clients/${id}`, headers: auth(t) });
    expect(reread.json().services).toEqual(['Redes', 'Diseño gráfico']);
    expect(reread.json().adminContactPhone).toBe('+54 11 4444');
    // The half that catches a field wired into the write and forgotten in the DTO
    // mapper: the create response echoes what was sent, the re-read does not.
    expect(reread.json().address).toBe('Av. Corrientes 1234, CABA');
    expect(reread.json().discountPercentBp).toBe(1000);

    // Both new fields can be CLEARED, which no other optional here can: an explicit
    // null erases. A discount that could be set and never removed would keep taking
    // money off every cobro after the deal ended.
    const cleared = await app.inject({
      method: 'PUT',
      url: `/clients/${id}`,
      headers: auth(t),
      payload: { address: null, discountPercentBp: null },
    });
    expect(cleared.statusCode).toBe(200);
    const afterClear = await app.inject({ method: 'GET', url: `/clients/${id}`, headers: auth(t) });
    expect(afterClear.json().address).toBeNull();
    expect(afterClear.json().discountPercentBp).toBeNull();
    // Clearing them left the neighbours alone — this is a targeted erase, not a reset.
    expect(afterClear.json().paymentMethod).toBe('transfer');

    // An unrelated edit must not clear them (the .partial() default leak's cousin:
    // an omitted array must mean "leave alone", never "clear").
    const unrelated = await app.inject({
      method: 'PUT',
      url: `/clients/${id}`,
      headers: auth(t),
      payload: { contactName: 'Juan 2' },
    });
    expect(unrelated.json().services).toEqual(['Redes', 'Diseño gráfico']);

    const paused = await app.inject({
      method: 'POST',
      url: `/clients/${id}/status`,
      headers: auth(t),
      payload: { status: 'paused' },
    });
    expect(paused.json().status).toBe('paused');

    const assigned = await app.inject({
      method: 'POST',
      url: `/clients/${id}/assignments`,
      headers: auth(t),
      payload: { teamMemberId: ASSIGNABLE_MEMBER, roleOnClient: 'Diseño' },
    });
    expect(assigned.statusCode).toBe(201);
    const assignmentId = assigned.json().id as string;

    const assignments = await app.inject({
      method: 'GET',
      url: `/clients/${id}/assignments`,
      headers: auth(t),
    });
    expect(assignments.json()).toHaveLength(1);

    const ended = await app.inject({
      method: 'DELETE',
      url: `/assignments/${assignmentId}`,
      headers: auth(t),
    });
    expect(ended.json().status).toBe('ended');

    const afterEnd = await app.inject({
      method: 'GET',
      url: `/clients/${id}/assignments`,
      headers: auth(t),
    });
    expect(afterEnd.json()).toHaveLength(0);
  });

  it('scopes client detail to assigned clients for employees (404 otherwise)', async () => {
    const ot = await token(OWNER_EMAIL);
    const created = await app.inject({ method: 'POST', url: '/clients', headers: auth(ot), payload: { name: 'Unassigned SA' } });
    const unassignedId = created.json().id as string;
    const et = await token(EMPLOYEE_EMAIL);
    const denied = await app.inject({ method: 'GET', url: `/clients/${unassignedId}`, headers: auth(et) });
    expect(denied.statusCode).toBe(404);
    const allowed = await app.inject({ method: 'GET', url: `/clients/${ASSIGNED_CLIENT}`, headers: auth(et) });
    expect(allowed.statusCode).toBe(200);
  });

  it('rejects an assignment to a member outside the workspace (400)', async () => {
    const ot = await token(OWNER_EMAIL);
    const created = await app.inject({ method: 'POST', url: '/clients', headers: auth(ot), payload: { name: 'C' } });
    const cid = created.json().id as string;
    const res = await app.inject({
      method: 'POST',
      url: `/clients/${cid}/assignments`,
      headers: auth(ot),
      payload: { teamMemberId: '0c000000-0000-4000-8000-000000000009', roleOnClient: 'Diseño' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('soft-deletes a client: gone from reads, and a second delete is 404', async () => {
    const t = await token(OWNER_EMAIL);
    const created = await app.inject({
      method: 'POST',
      url: '/clients',
      headers: auth(t),
      payload: { name: 'Borrable SA' },
    });
    const id = created.json().id as string;

    const before = await app.inject({ method: 'GET', url: '/clients', headers: auth(t) });
    expect((before.json().items as { id: string }[]).map((c) => c.id)).toContain(id);

    const removed = await app.inject({ method: 'DELETE', url: `/clients/${id}`, headers: auth(t) });
    expect(removed.statusCode).toBe(200);

    const detail = await app.inject({ method: 'GET', url: `/clients/${id}`, headers: auth(t) });
    expect(detail.statusCode).toBe(404);

    const after = await app.inject({ method: 'GET', url: '/clients', headers: auth(t) });
    expect((after.json().items as { id: string }[]).map((c) => c.id)).not.toContain(id);

    // Idempotent-ish: the second delete finds nothing to delete rather than
    // re-stamping deletedAt and reporting success again.
    const again = await app.inject({ method: 'DELETE', url: `/clients/${id}`, headers: auth(t) });
    expect(again.statusCode).toBe(404);
  });

  it('forbids an employee from deleting a client they are assigned to', async () => {
    const t = await token(EMPLOYEE_EMAIL);
    const res = await app.inject({
      method: 'DELETE',
      url: `/clients/${ASSIGNED_CLIENT}`,
      headers: auth(t),
    });
    expect(res.statusCode).toBe(403);

    // And the client is still there for a manager.
    const ot = await token(OWNER_EMAIL);
    const still = await app.inject({
      method: 'GET',
      url: `/clients/${ASSIGNED_CLIENT}`,
      headers: auth(ot),
    });
    expect(still.statusCode).toBe(200);
  });

  it('forbids an employee from creating a client', async () => {
    const t = await token(EMPLOYEE_EMAIL);
    const res = await app.inject({
      method: 'POST',
      url: '/clients',
      headers: auth(t),
      payload: { name: 'Nope' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('shows an employee only the clients they are assigned to', async () => {
    const t = await token(EMPLOYEE_EMAIL);
    const res = await app.inject({ method: 'GET', url: '/clients', headers: auth(t) });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.items[0].id).toBe(ASSIGNED_CLIENT);
  });
});

describe('service catalog', () => {
  it('creates a service and lists it', async () => {
    const t = await token(OWNER_EMAIL);
    const created = await app.inject({
      method: 'POST', url: '/services', headers: auth(t), payload: { name: 'Redes' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().name).toBe('Redes');

    const list = await app.inject({ method: 'GET', url: '/services', headers: auth(t) });
    expect(list.json().map((s: { name: string }) => s.name)).toContain('Redes');
  });

  it('refuses a duplicate name case-insensitively, with a 409 the dialog can act on', async () => {
    // The unique index is on the exact pair, so "redes" and "Redes" are two rows to
    // Postgres and one service to the studio — and a catalog with both silently
    // splits a client's assignments across what a person reads as one service.
    const t = await token(OWNER_EMAIL);
    const dup = await app.inject({
      method: 'POST', url: '/services', headers: auth(t), payload: { name: 'redes' },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.message).toContain('Redes');
  });

  it('lets an employee READ the catalog but not write it', async () => {
    // Reading is open because an employee sees the service on their own assignment;
    // hiding the catalog would leave them a label they cannot resolve.
    const t = await token(EMPLOYEE_EMAIL);
    expect((await app.inject({ method: 'GET', url: '/services', headers: auth(t) })).statusCode).toBe(200);
    const write = await app.inject({
      method: 'POST', url: '/services', headers: auth(t), payload: { name: 'Ads' },
    });
    expect(write.statusCode).toBe(403);
  });

  it('accepts a serviceId on an assignment — the FK that could never be set before', async () => {
    /**
     * `ClientAssignment.serviceId` has been validated against this table since the
     * assignment endpoints shipped, but no code path could create a `Service`, so the
     * column was permanently null in production while the API advertised it.
     * `fk-write-path-check.mjs` (FK001) now fails the build on the next one.
     */
    const t = await token(OWNER_EMAIL);
    const service = (
      await app.inject({ method: 'POST', url: '/services', headers: auth(t), payload: { name: 'Producción' } })
    ).json();
    const client = (
      await app.inject({ method: 'POST', url: '/clients', headers: auth(t), payload: { name: 'Con servicio SA' } })
    ).json();

    const assigned = await app.inject({
      method: 'POST', url: `/clients/${client.id}/assignments`, headers: auth(t),
      payload: { teamMemberId: ASSIGNABLE_MEMBER, roleOnClient: 'Diseño', serviceId: service.id },
    });
    expect(assigned.statusCode).toBe(201);
    expect(assigned.json().serviceId).toBe(service.id);
    // Denormalized so no surface has to join it by hand against a list it may not hold.
    expect(assigned.json().serviceName).toBe('Producción');
    expect(assigned.json().clientName).toBe('Con servicio SA');
    expect(assigned.json().teamMemberName).toBeTruthy();
    // Stamped on create. Without it `/team` reads "Sin fecha de inicio" and cannot
    // compute tenure, while `endedAt` still gets stamped on the way out — an
    // assignment with an end and no beginning.
    expect(assigned.json().assignedSince).toBeTruthy();
  });
});

describe('a member’s own client roster', () => {
  it('lists every client a member is actively assigned to', async () => {
    const t = await token(OWNER_EMAIL);
    const res = await app.inject({
      method: 'GET', url: `/team-members/${EMP_MEMBER}/assignments`, headers: auth(t),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().map((a: { clientId: string }) => a.clientId)).toContain(ASSIGNED_CLIENT);
  });

  it('drops an ended assignment from the roster', async () => {
    const t = await token(OWNER_EMAIL);
    const client = (
      await app.inject({ method: 'POST', url: '/clients', headers: auth(t), payload: { name: 'Temporal SA' } })
    ).json();
    const assignment = (
      await app.inject({
        method: 'POST', url: `/clients/${client.id}/assignments`, headers: auth(t),
        payload: { teamMemberId: ASSIGNABLE_MEMBER, roleOnClient: 'Diseño' },
      })
    ).json();

    const before = await app.inject({
      method: 'GET', url: `/team-members/${ASSIGNABLE_MEMBER}/assignments`, headers: auth(t),
    });
    expect(before.json().map((a: { id: string }) => a.id)).toContain(assignment.id);

    await app.inject({ method: 'DELETE', url: `/assignments/${assignment.id}`, headers: auth(t) });

    const after = await app.inject({
      method: 'GET', url: `/team-members/${ASSIGNABLE_MEMBER}/assignments`, headers: auth(t),
    });
    // Soft-ended, so the row survives as history and leaves the roster.
    expect(after.json().map((a: { id: string }) => a.id)).not.toContain(assignment.id);
  });

  it('hides a soft-deleted client from the roster', async () => {
    // Otherwise ending a client's relationship would leave every member it touched
    // still listing it, on a page whose whole job is "who works on what".
    const t = await token(OWNER_EMAIL);
    const client = (
      await app.inject({ method: 'POST', url: '/clients', headers: auth(t), payload: { name: 'Se va SA' } })
    ).json();
    await app.inject({
      method: 'POST', url: `/clients/${client.id}/assignments`, headers: auth(t),
      payload: { teamMemberId: ASSIGNABLE_MEMBER, roleOnClient: 'Diseño' },
    });
    await app.inject({ method: 'DELETE', url: `/clients/${client.id}`, headers: auth(t) });

    const roster = await app.inject({
      method: 'GET', url: `/team-members/${ASSIGNABLE_MEMBER}/assignments`, headers: auth(t),
    });
    expect(roster.json().map((a: { clientId: string }) => a.clientId)).not.toContain(client.id);
  });

  it('survives assign → end → re-assign → end for the same pair', async () => {
    /**
     * The old constraint was UNIQUE (clientId, teamMemberId, status), which permits
     * exactly ONE ended row per pair — so the SECOND removal collided with the first
     * and 409ed on every retry, forever. The person could not be taken off the client
     * and the button could only keep failing.
     *
     * Unreachable until the front started calling these endpoints, which is why it
     * had never surfaced. Migration 0013 replaces it with a partial unique index on
     * the LIVE rows only.
     */
    const t = await token(OWNER_EMAIL);
    const client = (
      await app.inject({ method: 'POST', url: '/clients', headers: auth(t), payload: { name: 'Ida y vuelta SA' } })
    ).json();
    const assign = async () =>
      app.inject({
        method: 'POST', url: `/clients/${client.id}/assignments`, headers: auth(t),
        payload: { teamMemberId: ASSIGNABLE_MEMBER, roleOnClient: 'Diseño' },
      });
    const end = async (id: string) =>
      app.inject({ method: 'DELETE', url: `/assignments/${id}`, headers: auth(t) });

    const first = await assign();
    expect(first.statusCode).toBe(201);
    expect((await end(first.json().id)).statusCode).toBe(200);

    const second = await assign();
    expect(second.statusCode).toBe(201);
    // The one that used to 409, and kept 409-ing.
    expect((await end(second.json().id)).statusCode).toBe(200);

    const roster = await app.inject({
      method: 'GET', url: `/clients/${client.id}/assignments`, headers: auth(t),
    });
    expect(roster.json()).toHaveLength(0);
  });

  it('still refuses a SECOND live assignment for the same pair', async () => {
    // The invariant the old constraint was reaching for, kept: one live relationship
    // per (client, member). Losing it would let a person be assigned twice and have
    // their estimated hours counted twice.
    const t = await token(OWNER_EMAIL);
    const client = (
      await app.inject({ method: 'POST', url: '/clients', headers: auth(t), payload: { name: 'Una sola vez SA' } })
    ).json();
    const payload = { teamMemberId: ASSIGNABLE_MEMBER, roleOnClient: 'Diseño' };
    expect(
      (await app.inject({ method: 'POST', url: `/clients/${client.id}/assignments`, headers: auth(t), payload }))
        .statusCode,
    ).toBe(201);
    const dup = await app.inject({
      method: 'POST', url: `/clients/${client.id}/assignments`, headers: auth(t), payload,
    });
    expect(dup.statusCode).toBe(409);
  });

  it('lets an employee read their OWN roster', async () => {
    const t = await token(EMPLOYEE_EMAIL);
    const res = await app.inject({
      method: 'GET', url: `/team-members/${EMP_MEMBER}/assignments`, headers: auth(t),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });

  it('gives an UNLINKED employee nothing from GET /assignments', async () => {
    /**
     * `actor.teamMemberId` is legitimately null for an employee whose invitation left
     * the roster link unset. Written as `...(assignedToMemberId ? { teamMemberId } : {})`,
     * that null fell through the ternary and returned EVERY assignment in the
     * workspace — client names, colleague names, the whole who-works-on-what map — to
     * the one user `GET /clients` was simultaneously telling had zero clients.
     *
     * Asserted alongside `/clients`, which has always guarded this, so the two answers
     * cannot drift apart again.
     */
    const t = await token(UNLINKED_EMAIL);
    const assignments = await app.inject({ method: 'GET', url: '/assignments', headers: auth(t) });
    expect(assignments.statusCode).toBe(200);
    expect(assignments.json()).toEqual([]);

    const clients = await app.inject({ method: 'GET', url: '/clients', headers: auth(t) });
    expect(clients.json().total).toBe(0);
  });

  it('still gives a LINKED employee exactly their own rows', async () => {
    // So the guard above cannot be "fixed" by refusing everyone.
    const t = await token(EMPLOYEE_EMAIL);
    const res = await app.inject({ method: 'GET', url: '/assignments', headers: auth(t) });
    expect(res.json()).toHaveLength(1);
    expect(res.json()[0].teamMemberId).toBe(EMP_MEMBER);
  });

  it("forbids an employee from reading a colleague's roster (403, not an empty list)", async () => {
    /**
     * A DIFFERENT rule from `GET /clients/:id/assignments`, which scopes an employee
     * to the rows they appear in. Here the member IS the subject, so a colleague's
     * roster would tell them which accounts that person works — a fact `/team`
     * already withholds.
     *
     * And a 403 rather than a filtered-to-empty list: an empty roster is a real
     * state, so returning it for a refusal would assert that the colleague has no
     * clients.
     */
    const t = await token(EMPLOYEE_EMAIL);
    const res = await app.inject({
      method: 'GET', url: `/team-members/${ASSIGNABLE_MEMBER}/assignments`, headers: auth(t),
    });
    expect(res.statusCode).toBe(403);
  });
});

/**
 * What the studio pays a member for one client.
 *
 * `ClientAssignment.monthlyCostMinor` shipped with the assignment table and NOTHING ever
 * wrote it: no form, no endpoint. Reports summed the resulting zeros and printed
 * "Costo total: $ 0" — a measured figure nobody had measured. These pin the write path,
 * and the distinction the nullable column exists to keep: `null` is nobody said, `0` is
 * the studio agreed this client is free.
 */
describe('per-client member cost', () => {
  let client = '';

  beforeAll(async () => {
    const t = await token(OWNER_EMAIL);
    client = (
      await app.inject({
        method: 'POST', url: '/clients', headers: auth(t), payload: { name: 'Costos SA' },
      })
    ).json().id;
  });

  it('round-trips the amount, and keeps it on the RE-READ', async () => {
    const t = await token(OWNER_EMAIL);
    const created = await app.inject({
      method: 'POST', url: `/clients/${client}/assignments`, headers: auth(t),
      payload: { teamMemberId: ASSIGNABLE_MEMBER, roleOnClient: 'Comunicación', monthlyCostMinor: '25000' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().monthlyCostMinor).toBe('25000');

    // The half that catches a field wired into the write and forgotten in the DTO
    // mapper: the create response echoes what was sent, a re-read does not.
    const reread = await app.inject({
      method: 'GET', url: `/clients/${client}/assignments`, headers: auth(t),
    });
    const row = (reread.json() as { teamMemberId: string; monthlyCostMinor: string | null }[])
      .find((a) => a.teamMemberId === ASSIGNABLE_MEMBER);
    expect(row?.monthlyCostMinor).toBe('25000');
  });

  it('keeps a typed ZERO as zero, and an omitted amount as null', async () => {
    // The one value the nullable column exists for. Every truthiness check on this path
    // turns an agreed 'this client is free' into 'nobody entered it', with a success
    // toast either way.
    const t = await token(OWNER_EMAIL);
    const free = (
      await app.inject({
        method: 'POST', url: '/clients', headers: auth(t), payload: { name: 'Pro Bono SA' },
      })
    ).json();
    const zero = await app.inject({
      method: 'POST', url: `/clients/${free.id}/assignments`, headers: auth(t),
      payload: { teamMemberId: ASSIGNABLE_MEMBER, roleOnClient: 'Diseño', monthlyCostMinor: '0' },
    });
    expect(zero.json().monthlyCostMinor).toBe('0');

    const silent = (
      await app.inject({
        method: 'POST', url: '/clients', headers: auth(t), payload: { name: 'Sin Costo SA' },
      })
    ).json();
    const none = await app.inject({
      method: 'POST', url: `/clients/${silent.id}/assignments`, headers: auth(t),
      payload: { teamMemberId: ASSIGNABLE_MEMBER, roleOnClient: 'Diseño' },
    });
    expect(none.json().monthlyCostMinor).toBeNull();
  });

  it('corrects the amount in place, without ending the assignment', async () => {
    // The reason PATCH exists: the partial unique index on (client, member) allows one
    // live row per pair, so before this the only way to fix a typo was to end the
    // assignment and create another — which rewrites the member's tenure line, making a
    // typo read as a staffing change ever after.
    const t = await token(OWNER_EMAIL);
    const c = (
      await app.inject({ method: 'POST', url: '/clients', headers: auth(t), payload: { name: 'Typo SA' } })
    ).json();
    const a = (
      await app.inject({
        method: 'POST', url: `/clients/${c.id}/assignments`, headers: auth(t),
        payload: { teamMemberId: ASSIGNABLE_MEMBER, roleOnClient: 'Diseño', monthlyCostMinor: '999999' },
      })
    ).json();

    const patched = await app.inject({
      method: 'PATCH', url: `/assignments/${a.id}`, headers: auth(t),
      payload: { monthlyCostMinor: '40000' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().monthlyCostMinor).toBe('40000');
    // Same row, same start date — not a new relationship.
    expect(patched.json().id).toBe(a.id);
    expect(patched.json().assignedSince).toBe(a.assignedSince);

    // And an explicit null ERASES it: an operator who no longer knows the figure is not
    // saying it is zero.
    const cleared = await app.inject({
      method: 'PATCH', url: `/assignments/${a.id}`, headers: auth(t),
      payload: { monthlyCostMinor: null },
    });
    expect(cleared.json().monthlyCostMinor).toBeNull();
  });

  it('refuses to edit an assignment that has ended', async () => {
    // History. Restating what a finished relationship cost would change a period the
    // studio has already paid out on.
    const t = await token(OWNER_EMAIL);
    const c = (
      await app.inject({ method: 'POST', url: '/clients', headers: auth(t), payload: { name: 'Cerrado SA' } })
    ).json();
    const a = (
      await app.inject({
        method: 'POST', url: `/clients/${c.id}/assignments`, headers: auth(t),
        payload: { teamMemberId: ASSIGNABLE_MEMBER, roleOnClient: 'Diseño' },
      })
    ).json();
    await app.inject({ method: 'DELETE', url: `/assignments/${a.id}`, headers: auth(t) });

    const res = await app.inject({
      method: 'PATCH', url: `/assignments/${a.id}`, headers: auth(t),
      payload: { monthlyCostMinor: '1' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a negative amount at the edge', async () => {
    const t = await token(OWNER_EMAIL);
    const res = await app.inject({
      method: 'POST', url: `/clients/${client}/assignments`, headers: auth(t),
      payload: { teamMemberId: EMP_MEMBER, roleOnClient: 'Diseño', monthlyCostMinor: '-1' },
    });
    // 400 at the API, not a 500 from the column's CHECK.
    expect(res.statusCode).toBe(400);
  });
});

/**
 * The priced breakdown is MONEY, and the employee perspective is money-free.
 *
 * The sum of a client's service lines IS its monthly fee, so this read has to carry the
 * same scope `GET /clients/:id` and `/clients/:id/assignments` apply. Without it any
 * authenticated employee could read every service and price of every client in the
 * workspace - including the ones every other endpoint 404s for them.
 */
describe('service lines are scoped like the client itself', () => {
  it('404s for an employee on a client they are not assigned to', async () => {
    const owner = await token(OWNER_EMAIL);
    const other = (
      await app.inject({
        method: 'POST', url: '/clients', headers: auth(owner),
        payload: { name: 'Ajeno SA', status: 'active' },
      })
    ).json();
    await app.inject({
      method: 'POST', url: `/clients/${other.id}/service-lines`, headers: auth(owner),
      payload: { name: 'Redes', priceMinor: '90000' },
    });

    const emp = await token(EMPLOYEE_EMAIL);
    const res = await app.inject({
      method: 'GET', url: `/clients/${other.id}/service-lines`, headers: auth(emp),
    });
    // 404, the same answer `GET /clients/:id` gives: an empty list would be a different
    // claim (this client has no priced services) and would leak that it exists.
    expect(res.statusCode).toBe(404);
  });

  it('lets an employee read the lines of a client they ARE assigned to', async () => {
    // The scope narrows, it does not close the endpoint.
    const emp = await token(EMPLOYEE_EMAIL);
    const res = await app.inject({
      method: 'GET', url: `/clients/${ASSIGNED_CLIENT}/service-lines`, headers: auth(emp),
    });
    expect(res.statusCode).toBe(200);
  });

  it('refuses to point a line at an unknown service', async () => {
    // The check lives in the service, on the update path as well as the create one, so a
    // bad id is a clean 400 instead of a raw FK violation.
    const t = await token(OWNER_EMAIL);
    const c = (
      await app.inject({
        method: 'POST', url: '/clients', headers: auth(t), payload: { name: 'FK SA' },
      })
    ).json();
    const created = await app.inject({
      method: 'POST', url: `/clients/${c.id}/service-lines`, headers: auth(t),
      payload: { name: 'Redes', priceMinor: '10000' },
    });
    const res = await app.inject({
      method: 'PATCH', url: `/service-lines/${created.json().id}`, headers: auth(t),
      payload: { serviceId: '99999999-9999-4999-8999-999999999999' },
    });
    expect(res.statusCode).toBe(400);
  });
});

/**
 * The area a person works in for a client is a CLOSED list since 2026-10-01: typed by
 * hand, the same role had reached the database as "Diseñadora gráfica" and "Diseñadora
 * Grafica". New writes are validated; rows written before the list keep their text.
 */
describe('assignment area (closed list)', () => {
  it('refuses a free-text role and accepts every area on the list', async () => {
    const t = await token(OWNER_EMAIL);
    const created = await app.inject({
      method: 'POST', url: '/clients', headers: auth(t), payload: { name: 'Áreas SA' },
    });
    const clientId = created.json().id as string;

    const freeText = await app.inject({
      method: 'POST',
      url: `/clients/${clientId}/assignments`,
      headers: auth(t),
      payload: { teamMemberId: ASSIGNABLE_MEMBER, roleOnClient: 'Diseñadora Grafica' },
    });
    expect(freeText.statusCode).toBe(400);

    // Paid Media is on the list on purpose: three live assignments do that work and fit
    // none of the other four.
    const paidMedia = await app.inject({
      method: 'POST',
      url: `/clients/${clientId}/assignments`,
      headers: auth(t),
      payload: { teamMemberId: ASSIGNABLE_MEMBER, roleOnClient: 'Paid Media' },
    });
    expect(paidMedia.statusCode).toBe(201);
    expect(paidMedia.json().roleOnClient).toBe('Paid Media');
  });

  it('still reads a row written before the list, with the text it was given', async () => {
    const t = await token(OWNER_EMAIL);
    const rows = await app.inject({
      method: 'GET', url: `/clients/${ASSIGNED_CLIENT}/assignments`, headers: auth(t),
    });
    expect(rows.statusCode).toBe(200);
    // Seeded straight into the table as 'lead' — never through the API — exactly like
    // the 41 assignments HOLD typed before the list existed.
    expect((rows.json() as { roleOnClient: string }[]).map((r) => r.roleOnClient)).toContain('lead');
  });
});

/**
 * Communication leads (2026-10-19): an employee whose custom role grants production.create /
 * production.approve loads and approves the productions of THEIR clients — and never sees,
 * or sets, money. A system employee (no grant list) stays out.
 */
describe('communication leads and productions', () => {
  const ym = new Date().toISOString().slice(0, 7);
  const body = (clientId: string, extra: Record<string, unknown> = {}) => ({
    date: `${ym}-05`, title: 'Produ mensual', type: 'Producción mensual', hours: 2, clientId, ...extra,
  });

  it('keeps a system employee out of productions', async () => {
    const t = await token(EMPLOYEE_EMAIL);
    const res = await app.inject({
      method: 'POST', url: `/months/${ym}/productions`, headers: auth(t), payload: body(ASSIGNED_CLIENT),
    });
    expect(res.statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/productions/people', headers: auth(t) })).statusCode).toBe(403);
  });

  it('lets a lead load and approve on their own clients, without money', async () => {
    const owner = await token(OWNER_EMAIL);
    const role = (
      await app.inject({
        method: 'POST', url: '/roles', headers: auth(owner),
        payload: { name: 'Responsable de comunicación', grants: ['production.create', 'production.approve'] },
      })
    ).json() as { id: string };
    const users = (await app.inject({ method: 'GET', url: '/users', headers: auth(owner) })).json() as {
      id: string; email: string;
    }[];
    const employeeId = users.find((u) => u.email === EMPLOYEE_EMAIL)!.id;
    const roles = (await app.inject({ method: 'GET', url: '/roles', headers: auth(owner) })).json() as {
      id: string; key: string | null;
    }[];
    const assign = (roleId: string) =>
      app.inject({
        method: 'PATCH', url: `/users/${employeeId}/workspace-role`, headers: auth(owner), payload: { roleId },
      });
    try {
      expect((await assign(role.id)).statusCode).toBe(204);
      const lead = auth(
        (await app.inject({ method: 'POST', url: '/auth/login', payload: { email: EMPLOYEE_EMAIL, password: PASSWORD } }))
          .json().accessToken,
      );

      // Money and status in the payload are dropped, and none comes back.
      const created = await app.inject({
        method: 'POST', url: `/months/${ym}/productions`, headers: lead,
        payload: body(ASSIGNED_CLIENT, {
          totalCostMinor: '999', billable: 'billable', billAmountMinor: '5000', status: 'approved',
        }),
      });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({
        totalCostMinor: null, billAmountMinor: null, billable: null, status: 'pending',
      });
      const id = created.json().id as string;

      // Not their client: it does not exist for them.
      const foreign = (
        await app.inject({ method: 'POST', url: '/clients', headers: auth(owner), payload: { name: 'No es suyo SA' } })
      ).json().id as string;
      expect(
        (await app.inject({ method: 'POST', url: `/months/${ym}/productions`, headers: lead, payload: body(foreign) }))
          .statusCode,
      ).toBe(404);
      expect(
        (await app.inject({ method: 'GET', url: `/clients/${foreign}/productions`, headers: lead })).statusCode,
      ).toBe(404);

      // They pick the photographer from a names-only roster (their own roster read shows
      // only themselves) — and that roster carries nothing but id and name.
      const people = (await app.inject({ method: 'GET', url: '/productions/people', headers: lead })).json() as Record<
        string,
        unknown
      >[];
      expect(people.some((p) => p.id === ASSIGNABLE_MEMBER)).toBe(true);
      expect(Object.keys(people[0] ?? {}).sort()).toEqual(['id', 'name']);

      const approved = await app.inject({
        method: 'POST', url: '/productions/approval', headers: lead, payload: { ids: [id], approved: true },
      });
      expect(approved.json()).toEqual({ updated: 1 });

      const history = (
        await app.inject({ method: 'GET', url: `/clients/${ASSIGNED_CLIENT}/productions`, headers: lead })
      ).json() as { id: string; totalCostMinor: string | null; status: string }[];
      expect(history.find((p) => p.id === id)).toMatchObject({ totalCostMinor: null, status: 'approved' });

      // The studio sees the row as stored: none of the money the lead tried to set.
      const studio = (
        await app.inject({ method: 'GET', url: `/clients/${ASSIGNED_CLIENT}/productions`, headers: auth(owner) })
      ).json() as { id: string; totalCostMinor: string | null; billAmountMinor: string | null; billable: string | null }[];
      expect(studio.find((p) => p.id === id)).toMatchObject({ totalCostMinor: '0', billAmountMinor: null, billable: null });
    } finally {
      await assign(roles.find((r) => r.key === 'employee')!.id);
    }
  });
});

