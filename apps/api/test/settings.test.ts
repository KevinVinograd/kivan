/**
 * Settings integration: workspace config (+ audit trail), user list/invite,
 * role change with self-protection, own profile, and fail-closed authz.
 */
import { execSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

let container: StartedPostgreSqlContainer;
let app: FastifyInstance;

const WS = '1d000000-0000-4000-8000-000000000001';
const OWNER_EMAIL = 'owner@studio.test';
const EMPLOYEE_EMAIL = 'emp@studio.test';
const PASSWORD = 'a-correct-password';

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('hold').withUsername('owner').withPassword('owner').start();
  const ownerUrl = container.getConnectionUri();
  execSync('pnpm --filter @hold/db exec prisma migrate deploy', { env: { ...process.env, DATABASE_URL: ownerUrl }, stdio: 'pipe' });

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
  await admin.query(`INSERT INTO "Workspace" (id, name) VALUES ($1, 'Studio Hakuna')`, [WS]);
  for (const [email, role] of [[OWNER_EMAIL, 'owner'], [EMPLOYEE_EMAIL, 'employee']] as const) {
    await admin.query(
      `INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, 'X', 'Y', $3, now())`,
      [email, passwordHash, role],
    );
  }
  await admin.end();

  process.env.DATABASE_URL = ownerUrl.replace('owner:owner@', 'hold_app:app@');
  // This suite exercises many auth-surface calls (logins + invitation accepts,
  // which share the per-IP auth bucket) in seconds; it does not test rate
  // limiting itself, so lift the cap for the run to avoid spurious 429s.
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
  for (const [k, email] of [['owner', OWNER_EMAIL], ['emp', EMPLOYEE_EMAIL]] as const) {
    tokens[k] = (await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: PASSWORD } })).json().accessToken;
  }
});
function h(role: string) {
  return { authorization: `Bearer ${tokens[role]}` };
}

/**
 * Invite a member and immediately consume the returned one-time link to set their
 * password — the email-invite flow (POST /users creates a `pending` account +
 * returns { user, invite: { link } }; the member sets their own password via
 * POST /auth/accept-invitation). Returns the created user + the two responses.
 */
async function inviteAndActivate(input: {
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'employee';
  password: string;
}) {
  const { password, ...invitePayload } = input;
  const invited = await app.inject({ method: 'POST', url: '/users', headers: h('owner'), payload: invitePayload });
  const body = invited.json() as { user: { id: string; role: string }; invite: { link: string; mailed: boolean } };
  const token = new URL(body.invite.link).searchParams.get('token');
  const accepted = await app.inject({
    method: 'POST',
    url: '/auth/accept-invitation',
    payload: { token, password },
  });
  return { invited, body, accepted, user: body.user };
}

describe('settings', () => {
  it('reads/updates the workspace and records an audit event', async () => {
    const get = await app.inject({ method: 'GET', url: '/workspace', headers: h('owner') });
    expect(get.json().name).toBe('Studio Hakuna');

    const upd = await app.inject({ method: 'PUT', url: '/workspace', headers: h('owner'), payload: { name: 'Hold', monotributoCategory: 'D' } });
    expect(upd.json().name).toBe('Hold');

    const audit = await app.inject({ method: 'GET', url: '/audit-events', headers: h('owner') });
    expect(audit.json().some((e: { action: string }) => e.action === 'workspace.update')).toBe(true);
  });

  it('persists the monthly-operation rules and refuses a malformed document', async () => {
    const rules = {
      closeDay: 28,
      closeReminder: true,
      reminderDays: 3,
      autoReminders: false,
      payDay: 5,
      requireApproval: true,
      expenseCategories: ['Software', 'Viáticos'],
      productionTypes: ['Reel', 'Spot'],
    };
    const saved = await app.inject({ method: 'PUT', url: '/workspace', headers: h('owner'), payload: { monthlyRules: rules } });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().monthlyRules).toEqual(rules);

    // Survives a reload — the whole point of the section.
    const got = await app.inject({ method: 'GET', url: '/workspace', headers: h('owner') });
    expect(got.json().monthlyRules).toEqual(rules);

    // A partial / out-of-range document is refused rather than stored half-formed: a
    // closing day of 31 does not exist in February, and a reader could not tell an absent
    // rule from an unset one.
    const bad = await app.inject({
      method: 'PUT',
      url: '/workspace',
      headers: h('owner'),
      payload: { monthlyRules: { ...rules, closeDay: 31 } },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('persists the cashflow position anchor (positionAsOf) as a date, and can clear it', async () => {
    const set = await app.inject({
      method: 'PUT',
      url: '/workspace',
      headers: h('owner'),
      payload: { positionAsOf: '2026-07-15' },
    });
    expect(set.statusCode).toBe(200);
    expect(set.json().positionAsOf).toBe('2026-07-15');

    // Survives a reload as a date-only string (no timezone drift).
    const get = await app.inject({ method: 'GET', url: '/workspace', headers: h('owner') });
    expect(get.json().positionAsOf).toBe('2026-07-15');

    // null clears it back to the default anchor.
    const clear = await app.inject({
      method: 'PUT',
      url: '/workspace',
      headers: h('owner'),
      payload: { positionAsOf: null },
    });
    expect(clear.json().positionAsOf).toBeNull();
  });

  it('lists + invites users; the invited user can log in', async () => {
    const list = await app.inject({ method: 'GET', url: '/users', headers: h('owner') });
    expect(list.json().length).toBe(2);

    const { invited, accepted, user } = await inviteAndActivate({ email: 'flor@studio.test', firstName: 'Flor', lastName: 'D', role: 'admin', password: 'flor-strong-pass' });
    expect(invited.statusCode).toBe(201);
    expect(user.role).toBe('admin');
    // The invite returns a set-password link; consuming it activates the account.
    expect(accepted.statusCode).toBe(204);

    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'flor@studio.test', password: 'flor-strong-pass' } });
    expect(login.statusCode).toBe(200);
  });

  it('invite creates a pending member; the emailed link sets their password and is single-use', async () => {
    const invited = await app.inject({
      method: 'POST',
      url: '/users',
      headers: h('owner'),
      payload: { email: 'nadia@studio.test', firstName: 'Nadia', lastName: 'K', role: 'employee' },
    });
    expect(invited.statusCode).toBe(201);
    const body = invited.json();
    // Mail is off in tests → the link is returned so the admin can hand it over.
    expect(body.invite.mailed).toBe(false);
    expect(body.invite.link).toContain('/aceptar-invitacion?token=');
    const token = new URL(body.invite.link).searchParams.get('token');

    // A pending member can't log in yet (unusable password until they accept).
    expect(
      (await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'nadia@studio.test', password: 'anything-at-all' } })).statusCode,
    ).toBe(401);

    // Accepting sets the password + activates → login works.
    expect(
      (await app.inject({ method: 'POST', url: '/auth/accept-invitation', payload: { token, password: 'nadia-strong-pass' } })).statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'nadia@studio.test', password: 'nadia-strong-pass' } })).statusCode,
    ).toBe(200);

    // Single-use: a replay of the same token fails with the uniform 401.
    expect(
      (await app.inject({ method: 'POST', url: '/auth/accept-invitation', payload: { token, password: 'other-strong-pass' } })).statusCode,
    ).toBe(401);
    // A garbage token fails the same way (no oracle).
    expect(
      (await app.inject({ method: 'POST', url: '/auth/accept-invitation', payload: { token: 'not-a-real-token', password: 'xxxxxxxx' } })).statusCode,
    ).toBe(401);
  });

  it('changes a user role but protects against self-demotion', async () => {
    const users = await app.inject({ method: 'GET', url: '/users', headers: h('owner') });
    const emp = users.json().find((u: { email: string }) => u.email === EMPLOYEE_EMAIL);
    const owner = users.json().find((u: { email: string }) => u.email === OWNER_EMAIL);

    const ok = await app.inject({ method: 'PATCH', url: `/users/${emp.id}/role`, headers: h('owner'), payload: { role: 'admin' } });
    expect(ok.json().role).toBe('admin');

    const self = await app.inject({ method: 'PATCH', url: `/users/${owner.id}/role`, headers: h('owner'), payload: { role: 'admin' } });
    expect(self.statusCode).toBe(400); // can't change your own role
  });

  it('lets a user read + update their own profile', async () => {
    const me = await app.inject({ method: 'GET', url: '/me/profile', headers: h('emp') });
    expect(me.json().email).toBe(EMPLOYEE_EMAIL);
    const upd = await app.inject({ method: 'PUT', url: '/me/profile', headers: h('emp'), payload: { firstName: 'Mica' } });
    expect(upd.json().firstName).toBe('Mica');
  });

  it('forbids an employee from workspace settings (fail-closed)', async () => {
    expect((await app.inject({ method: 'GET', url: '/workspace', headers: h('emp') })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/users', headers: h('emp') })).statusCode).toBe(403);
  });
});

describe('settings — deactivation & own password', () => {
  const TARGET_EMAIL = 'target@studio.test';
  const TARGET_PASSWORD = 'target-strong-pass';
  let targetId: string;

  beforeAll(async () => {
    const { user } = await inviteAndActivate({
      email: TARGET_EMAIL,
      firstName: 'Tar',
      lastName: 'Get',
      role: 'employee',
      password: TARGET_PASSWORD,
    });
    targetId = user.id;
  });

  const loginTarget = (password: string) =>
    app.inject({ method: 'POST', url: '/auth/login', payload: { email: TARGET_EMAIL, password } });

  it('deactivates a member — they can no longer log in — and reactivating restores access', async () => {
    expect((await loginTarget(TARGET_PASSWORD)).statusCode).toBe(200);

    const off = await app.inject({
      method: 'PATCH',
      url: `/users/${targetId}/status`,
      headers: h('owner'),
      payload: { status: 'disabled' },
    });
    expect(off.statusCode).toBe(200);
    expect(off.json().status).toBe('disabled');

    // The whole point of a deactivation: the account is actually locked out.
    expect((await loginTarget(TARGET_PASSWORD)).statusCode).toBe(401);

    const on = await app.inject({
      method: 'PATCH',
      url: `/users/${targetId}/status`,
      headers: h('owner'),
      payload: { status: 'active' },
    });
    expect(on.json().status).toBe('active');
    expect((await loginTarget(TARGET_PASSWORD)).statusCode).toBe(200);
  });

  it('refuses self-deactivation, protects the owner, and stays closed to employees', async () => {
    const users = (await app.inject({ method: 'GET', url: '/users', headers: h('owner') })).json();
    const owner = users.find((u: { email: string }) => u.email === OWNER_EMAIL);

    // The owner acting on their own row trips the self-guard first.
    const self = await app.inject({
      method: 'PATCH',
      url: `/users/${owner.id}/status`,
      headers: h('owner'),
      payload: { status: 'disabled' },
    });
    expect(self.statusCode).toBe(400);

    // An ADMIN aiming at the owner trips the ownership guard (409, not 400).
    const adminToken = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'flor@studio.test', password: 'flor-strong-pass' },
      })
    ).json().accessToken;
    const byAdmin = await app.inject({
      method: 'PATCH',
      url: `/users/${owner.id}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'disabled' },
    });
    expect(byAdmin.statusCode).toBe(409);

    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/users/${targetId}/status`,
          headers: h('emp'),
          payload: { status: 'disabled' },
        })
      ).statusCode,
    ).toBe(403);
  });

  it('lets only the OWNER demote or deactivate an admin — admins are peers, not each other’s managers', async () => {
    // Two admins: one acts, one is the target. Peer-vs-peer is the case that matters —
    // without the guard, whichever admin clicks first removes the other.
    const actor = await inviteAndActivate({
      email: 'peer-actor@studio.test',
      firstName: 'Peer',
      lastName: 'Actor',
      role: 'admin',
      password: 'peer-actor-strong-pass',
    });
    expect(actor.invited.statusCode).toBe(201);
    const victim = await inviteAndActivate({
      email: 'peer-victim@studio.test',
      firstName: 'Peer',
      lastName: 'Victim',
      role: 'admin',
      password: 'peer-victim-strong-pass',
    });
    expect(victim.invited.statusCode).toBe(201);
    const victimId = victim.user.id;

    const actorToken = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'peer-actor@studio.test', password: 'peer-actor-strong-pass' },
      })
    ).json().accessToken;
    const asPeer = { authorization: `Bearer ${actorToken}` };

    // An admin may not deactivate or demote a fellow admin.
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/users/${victimId}/status`,
          headers: asPeer,
          payload: { status: 'disabled' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/users/${victimId}/role`,
          headers: asPeer,
          payload: { role: 'employee' },
        })
      ).statusCode,
    ).toBe(403);

    // The refusal is real, not cosmetic: the target is untouched.
    const stillActive = (await app.inject({ method: 'GET', url: '/users', headers: h('owner') }))
      .json()
      .find((u: { id: string }) => u.id === victimId);
    expect(stillActive).toMatchObject({ role: 'admin', status: 'active' });

    // An admin MAY still manage an employee — that is the point of the role.
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/users/${targetId}/status`,
          headers: asPeer,
          payload: { status: 'disabled' },
        })
      ).statusCode,
    ).toBe(200);
    await app.inject({
      method: 'PATCH',
      url: `/users/${targetId}/status`,
      headers: asPeer,
      payload: { status: 'active' },
    });

    // And the owner may do to an admin what the peer could not.
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/users/${victimId}/status`,
          headers: h('owner'),
          payload: { status: 'disabled' },
        })
      ).statusCode,
    ).toBe(200);
  });

  it('changes your own password: the old one dies and every session is revoked', async () => {
    const { accessToken, refreshToken } = (await loginTarget(TARGET_PASSWORD)).json();
    const auth = { authorization: `Bearer ${accessToken}` };

    // An access token alone must not be enough — the current password is required.
    const wrong = await app.inject({
      method: 'PUT',
      url: '/me/password',
      headers: auth,
      payload: { currentPassword: 'not-my-password', newPassword: 'brand-new-password' },
    });
    expect(wrong.statusCode).toBe(401);

    const ok = await app.inject({
      method: 'PUT',
      url: '/me/password',
      headers: auth,
      payload: { currentPassword: TARGET_PASSWORD, newPassword: 'brand-new-password' },
    });
    expect(ok.statusCode).toBe(204);

    expect((await loginTarget(TARGET_PASSWORD)).statusCode).toBe(401);
    expect((await loginTarget('brand-new-password')).statusCode).toBe(200);

    // A refresh token held from before the change can no longer extend the session.
    const stale = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken } });
    expect(stale.statusCode).toBe(401);
  });
});

describe("reset another member's password (owner/admin)", () => {
  const RESET_EMAIL = 'reset-target@studio.test';
  const OLD_PASSWORD = 'reset-old-strong-pass';
  let resetTargetId: string;
  let ownerId: string;
  let actorAdminToken: string;
  let victimAdminId: string;

  beforeAll(async () => {
    const target = await inviteAndActivate({
      email: RESET_EMAIL,
      firstName: 'Re',
      lastName: 'Set',
      role: 'employee',
      password: OLD_PASSWORD,
    });
    resetTargetId = target.user.id;

    // An admin who acts, and a second admin who is the target — the peer case that proves
    // only the owner may reset an admin.
    await inviteAndActivate({
      email: 'reset-actor-admin@studio.test',
      firstName: 'Act',
      lastName: 'Or',
      role: 'admin',
      password: 'reset-actor-strong-pass',
    });
    actorAdminToken = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'reset-actor-admin@studio.test', password: 'reset-actor-strong-pass' },
      })
    ).json().accessToken;
    const victim = await inviteAndActivate({
      email: 'reset-victim-admin@studio.test',
      firstName: 'Vic',
      lastName: 'Tim',
      role: 'admin',
      password: 'reset-victim-strong-pass',
    });
    victimAdminId = victim.user.id;

    ownerId = (await app.inject({ method: 'GET', url: '/users', headers: h('owner') }))
      .json()
      .find((u: { email: string }) => u.email === OWNER_EMAIL).id;
  });

  const loginTarget = (password: string) =>
    app.inject({ method: 'POST', url: '/auth/login', payload: { email: RESET_EMAIL, password } });
  const sendReset = (id: string, headers: Record<string, string>) =>
    app.inject({ method: 'POST', url: `/users/${id}/password-reset`, headers });
  // Mail is off in tests, so the endpoint returns the one-time link; the raw token rides in it.
  const tokenOf = (link: string) => link.split('token=')[1];

  it('owner sends a reset link; consuming it sets a new password — old dies, new works, sessions revoked', async () => {
    const before = await loginTarget(OLD_PASSWORD);
    expect(before.statusCode).toBe(200);
    const staleRefresh = before.json().refreshToken;

    const res = await sendReset(resetTargetId, h('owner'));
    expect(res.statusCode).toBe(200);
    const { link, mailed } = res.json();
    expect(mailed).toBe(false); // mail disabled in the test env → link handed back
    expect(link).toContain('token=');

    // Merely minting the link does NOT change anything yet — the old password still works.
    expect((await loginTarget(OLD_PASSWORD)).statusCode).toBe(200);

    // The member chooses their own new password by consuming the link (same accept flow as
    // the invite). That is what actually re-keys the account.
    const accepted = await app.inject({
      method: 'POST',
      url: '/auth/accept-invitation',
      payload: { token: tokenOf(link), password: 'reset-brand-new-pass' },
    });
    expect(accepted.statusCode).toBe(204);

    expect((await loginTarget(OLD_PASSWORD)).statusCode).toBe(401);
    expect((await loginTarget('reset-brand-new-pass')).statusCode).toBe(200);

    // A session held from before the reset can no longer extend itself (consume revokes them).
    const stale = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: staleRefresh },
    });
    expect(stale.statusCode).toBe(401);
  });

  it('refuses yourself and a disabled member; with mail off an admin cannot reset a peer or the owner; employees are blocked', async () => {
    // Resetting your own row makes no sense — you are logged in. Use change password.
    expect((await sendReset(ownerId, h('owner'))).statusCode).toBe(400);

    // This used to assert 200 for both, on the premise that "the actor never sees the
    // password". They do not — they see the LINK, and the test above proves what that is
    // worth: it lifts `tokenOf(link)` straight out of this endpoint's response, sets a new
    // password with it and logs in as the target. That is a takeover, and with
    // MAIL_ENABLED=false (the default here, in packages/config, and in what deploy-api.yml
    // ships) the link comes back in the response body with a Copiar button beside it.
    //
    // So the escalating direction is refused while the token cannot be delivered out of
    // band. The locked-out-owner recovery path is not gone: turn mail on and the link
    // reaches the owner's own inbox, which is what made it safe in the first place.
    expect((await sendReset(victimAdminId, { authorization: `Bearer ${actorAdminToken}` })).statusCode).toBe(403);
    expect((await sendReset(ownerId, { authorization: `Bearer ${actorAdminToken}` })).statusCode).toBe(403);

    // Downward and sideways-from-the-owner are untouched: an admin still recovers an
    // employee, and the owner still recovers an admin.
    expect((await sendReset(resetTargetId, { authorization: `Bearer ${actorAdminToken}` })).statusCode).toBe(200);
    expect((await sendReset(victimAdminId, h('owner'))).statusCode).toBe(200);

    // A DISABLED member is blocked (consuming the link would silently reactivate them).
    await app.inject({
      method: 'PATCH',
      url: `/users/${resetTargetId}/status`,
      headers: h('owner'),
      payload: { status: 'disabled' },
    });
    expect((await sendReset(resetTargetId, h('owner'))).statusCode).toBe(409);
    await app.inject({
      method: 'PATCH',
      url: `/users/${resetTargetId}/status`,
      headers: h('owner'),
      payload: { status: 'active' },
    });

    // And an employee cannot reach the endpoint at all.
    expect((await sendReset(resetTargetId, h('emp'))).statusCode).toBe(403);
  });

  it('withholds the one-time link from the response whenever the mail actually went out', async () => {
    // The invariant that makes the hierarchy guard above worth anything. The guard refuses
    // admin -> owner only when MAIL_ENABLED is false; PRODUCTION runs with mail ON (the prod
    // environment sets MAIL_ENABLED=true against SES), where the guard passes by design so a
    // locked-out owner can be helped. If the response still carried the token there, an admin
    // could reset the owner, read it out of their own 200 body with curl, POST it to the
    // public /auth/accept-invitation and own the account. So the token must never come back
    // once it has been delivered out of band — and this suite runs with mail OFF, which is
    // exactly why that half went untested and shipped.
    const mailer = await import('../src/lib/mailer.js');
    const spy = vi.spyOn(mailer, 'sendPasswordResetEmail').mockResolvedValue({ mailed: true });
    try {
      const res = await sendReset(resetTargetId, h('owner'));
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.mailed).toBe(true);
      expect(body.link).toBeUndefined();
      // Not merely absent from a typed field: nothing anywhere in the payload is a token.
      expect(JSON.stringify(body)).not.toContain('aceptar-invitacion');
    } finally {
      spy.mockRestore();
    }

    // With the mail failing, the link IS returned — that fallback is the product behaviour,
    // and the guard above has already established it can only be reached downward.
    const fallback = await sendReset(resetTargetId, h('owner'));
    expect(fallback.statusCode).toBe(200);
    expect(fallback.json().mailed).toBe(false);
    expect(fallback.json().link).toContain('aceptar-invitacion');
  });
});

describe('link a login to a roster person on invite', () => {
  const MEMBER_ID = 'aa000000-0000-4000-8000-0000000000aa';

  beforeAll(async () => {
    const db = new Client({ connectionString: container.getConnectionUri() });
    await db.connect();
    await db.query(
      `INSERT INTO "TeamMember" (id, name, role, "employmentType", "compensationModel", "updatedAt")
       VALUES ($1, 'Mica', 'designer', 'employee', 'monthly_fixed', now())`,
      [MEMBER_ID],
    );
    await db.end();
  });

  const invite = (payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/users', headers: h('owner'), payload });

  it('links a valid roster member, rejects an unknown one, and refuses a second link to the same', async () => {
    // A valid, unlinked roster member is set as the login's teamMemberId — this is what makes
    // `me.teamMemberId` resolve, so the employee self-view stops relying on a mock id.
    const ok = await invite({
      email: 'linked@studio.test',
      firstName: 'Link',
      lastName: 'Ed',
      role: 'employee',
      teamMemberId: MEMBER_ID,
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().user.teamMemberId).toBe(MEMBER_ID);

    // An unknown member id is a clean 400, not a raw FK violation.
    expect(
      (
        await invite({
          email: 'bad@studio.test',
          firstName: 'B',
          lastName: 'A',
          role: 'employee',
          teamMemberId: '11111111-1111-4111-8111-111111111111',
        })
      ).statusCode,
    ).toBe(400);

    // The link is 1:1 — a second login for the same roster person is refused (409).
    expect(
      (
        await invite({
          email: 'dupe@studio.test',
          firstName: 'D',
          lastName: 'U',
          role: 'employee',
          teamMemberId: MEMBER_ID,
        })
      ).statusCode,
    ).toBe(409);
  });
});

/**
 * The invited person completes their OWN ficha while setting their password.
 *
 * This is the one place a PRE-AUTH request writes business data, so the
 * tests below are about who it is allowed to write to, not merely that it writes.
 */
describe('accept-invitation: the person completes their own ficha', () => {
  async function newRosterPerson(name: string): Promise<string> {
    const created = await app.inject({
      method: 'POST',
      url: '/team-members',
      headers: h('owner'),
      payload: { name, role: 'Diseñadora' },
    });
    expect(created.statusCode).toBe(201);
    return created.json().id as string;
  }

  async function inviteLinked(email: string, teamMemberId: string): Promise<string> {
    const invited = await app.inject({
      method: 'POST',
      url: '/users',
      headers: h('owner'),
      payload: { email, firstName: 'Sofía', lastName: 'Ledesma', role: 'employee', teamMemberId },
    });
    expect(invited.statusCode).toBe(201);
    return new URL(invited.json().invite.link).searchParams.get('token') as string;
  }

  it('writes phone, CUIT and bank details onto the ficha the TOKEN resolves to', async () => {
    const memberId = await newRosterPerson('Sofía Ledesma');
    const token = await inviteLinked('sofia.ledesma@example.com', memberId);

    const preview = await app.inject({ method: 'POST', url: '/auth/invitation/preview', payload: { token } });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({ firstName: 'Sofía', needsProfile: true });
    // The preview must not hand a pre-auth caller anything else about the account.
    expect(preview.json().email).toBeUndefined();

    const accepted = await app.inject({
      method: 'POST',
      url: '/auth/accept-invitation',
      payload: {
        token,
        password: 'sofia-strong-pass',
        profile: {
          phone: '+54 11 5555-1234',
          taxId: '27-35123456-4',
          bankName: 'Galicia',
          accountHolder: 'Sofía Ledesma',
          cbuOrCvu: '0070999830004123456789',
          bankAlias: 'sofi.diseno.gal',
        },
      },
    });
    expect(accepted.statusCode).toBe(204);

    const member = await app.inject({ method: 'GET', url: `/team-members/${memberId}`, headers: h('owner') });
    expect(member.json()).toMatchObject({ phone: '+54 11 5555-1234', taxId: '27-35123456-4' });
    const bank = await app.inject({ method: 'GET', url: `/team-members/${memberId}/bank`, headers: h('owner') });
    expect(bank.json()).toMatchObject({
      bankName: 'Galicia',
      accountHolder: 'Sofía Ledesma',
      cbuOrCvu: '0070999830004123456789',
      alias: 'sofi.diseno.gal',
    });
  });

  it('a password RESET never rewrites the ficha, even when a profile is sent', async () => {
    const memberId = await newRosterPerson('Nadia Ferro');
    const firstToken = await inviteLinked('nadia.ferro@example.com', memberId);
    await app.inject({
      method: 'POST',
      url: '/auth/accept-invitation',
      payload: {
        token: firstToken,
        password: 'nadia-strong-pass',
        profile: { phone: '+54 11 4444-0000', bankName: 'Nación' },
      },
    });

    // Now the user is ACTIVE. A forgot-password link is consumed through this same route:
    // a stolen reset link must not become a way to rewrite somebody's bank details.
    await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email: 'nadia.ferro@example.com' } });
    const reset = await app.inject({ method: 'GET', url: '/users', headers: h('owner') });
    expect(reset.statusCode).toBe(200);
    const link = await app.inject({
      method: 'POST',
      url: `/users/${(reset.json() as { id: string; email: string }[]).find((u) => u.email === 'nadia.ferro@example.com')!.id}/password-reset`,
      headers: h('owner'),
    });
    const resetToken = new URL(link.json().link).searchParams.get('token');

    const preview = await app.inject({ method: 'POST', url: '/auth/invitation/preview', payload: { token: resetToken } });
    expect(preview.json().needsProfile).toBe(false);

    const accepted = await app.inject({
      method: 'POST',
      url: '/auth/accept-invitation',
      payload: {
        token: resetToken,
        password: 'nadia-brand-new-pass',
        profile: { phone: 'ATTACKER', bankName: 'ATTACKER', cbuOrCvu: '9999999999999999999999' },
      },
    });
    expect(accepted.statusCode).toBe(204);

    const member = await app.inject({ method: 'GET', url: `/team-members/${memberId}`, headers: h('owner') });
    expect(member.json().phone).toBe('+54 11 4444-0000');
    const bank = await app.inject({ method: 'GET', url: `/team-members/${memberId}/bank`, headers: h('owner') });
    expect(bank.json().bankName).toBe('Nación');
  });

  it('an invite with no roster link asks for no ficha, and ignores one that is sent anyway', async () => {
    const invited = await app.inject({
      method: 'POST',
      url: '/users',
      headers: h('owner'),
      payload: { email: 'contadora@example.com', firstName: 'Ana', lastName: 'Paz', role: 'admin' },
    });
    const token = new URL(invited.json().invite.link).searchParams.get('token');

    const preview = await app.inject({ method: 'POST', url: '/auth/invitation/preview', payload: { token } });
    expect(preview.json()).toMatchObject({ firstName: 'Ana', needsProfile: false });

    // There is no ficha behind this login, so there is nowhere to write: it must activate
    // the account normally rather than 500 on a null teamMemberId.
    const accepted = await app.inject({
      method: 'POST',
      url: '/auth/accept-invitation',
      payload: { token, password: 'ana-strong-pass', profile: { phone: '+54 11 1111-1111' } },
    });
    expect(accepted.statusCode).toBe(204);
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'contadora@example.com', password: 'ana-strong-pass' },
    });
    expect(login.statusCode).toBe(200);
  });

  it('refuses an invalid or already-used token the same way the accept route does', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/invitation/preview',
          payload: { token: 'not-a-real-token' },
        })
      ).statusCode,
    ).toBe(401);
  });
});

/** Edges the review surfaced. Each one locked somebody out or leaked a credential. */
describe('accept-invitation: the edges that lock people out', () => {
  it('activates the account even when the linked ficha was deleted after the invite', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/team-members',
      headers: h('owner'),
      payload: { name: 'Rocío Vega', role: 'Community' },
    });
    const memberId = created.json().id as string;
    const invited = await app.inject({
      method: 'POST',
      url: '/users',
      headers: h('owner'),
      payload: {
        email: 'rocio.vega@example.com',
        firstName: 'Rocío',
        lastName: 'Vega',
        role: 'employee',
        teamMemberId: memberId,
      },
    });
    const token = new URL(invited.json().invite.link).searchParams.get('token');

    // The studio removes her from the roster before she opens her mail. There is no ficha
    // left to fill in — but that must not cost her the account, which would leave her
    // reading "el enlace no es válido" with no way back.
    await app.inject({ method: 'POST', url: `/team-members/${memberId}/deactivate`, headers: h('owner') });

    const accepted = await app.inject({
      method: 'POST',
      url: '/auth/accept-invitation',
      payload: { token, password: 'rocio-strong-pass', profile: { phone: '+54 11 2222-2222' } },
    });
    expect(accepted.statusCode).toBe(204);
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'rocio.vega@example.com', password: 'rocio-strong-pass' },
    });
    expect(login.statusCode).toBe(200);
  });

  it('takes the preview token in the BODY, never the URL', async () => {
    // `req.url` is logged verbatim on every request, and this token is good for taking over
    // the invited account. The old query-string route must stay gone.
    const stale = await app.inject({ method: 'GET', url: '/auth/invitation?token=whatever' });
    expect(stale.statusCode).toBe(404);
  });
});
