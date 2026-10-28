/**
 * Full auth integration against a real Postgres (Testcontainers): login,
 * refresh-rotation, reuse-detection, and /auth/me — with the API connected as
 * the non-superuser app role.
 */
import { execSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

let container: StartedPostgreSqlContainer;
let app: FastifyInstance;

const WS = '33333333-3333-3333-3333-333333333333';
const EMAIL = 'owner@studio.test';
const PASSWORD = 'correct horse battery';

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

  // Compute the password hash with the same KDF the API uses.
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
  await admin.query(`INSERT INTO "Workspace" (id, name) VALUES ($1, $2)`, [WS, 'Studio']);
  await admin.query(
    `INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, 'Vicky', 'Owner', 'owner', now())`,
    [EMAIL, passwordHash],
  );
  await admin.end();

  process.env.DATABASE_URL = ownerUrl.replace('owner:owner@', 'hold_app:app@');
  // The auth limit defaults to 10/minute, and this suite logs in well over ten times.
  // Left at the default, whether a test passes depends on how many logins the tests
  // BEFORE it happened to spend — adding one assertion anywhere silently breaks another
  // test. Raised here so the suite tests auth, not throttling; the throttle has its own
  // dedicated app below, built with a deliberately tiny limit.
  process.env.RATE_LIMIT_AUTH = '1000';
  const { buildApp } = await import('../src/app.js');
  app = await buildApp();
});

afterAll(async () => {
  await app?.close();
  await container?.stop();
});

async function login(password: string) {
  return app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: EMAIL, password },
  });
}

describe('auth', () => {
  it('rejects a wrong password with a uniform 401', async () => {
    const res = await login('wrong');
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  // The stored email is lowercase, and Postgres compares text case-sensitively. Someone
  // typing the address the way they write it — capitalised, or with a stray trailing
  // space from a paste — must still land on their own account rather than getting a
  // clean 401 with the correct password.
  it('finds the account whatever case the email is typed in', async () => {
    for (const typed of ['Owner@Studio.test', 'OWNER@STUDIO.TEST', '  owner@studio.test  ']) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: typed, password: PASSWORD },
      });
      expect(res.statusCode, `login with "${typed}"`).toBe(200);
    }
  });

  // Case-insensitive lookup must not become a way to log in as someone else: it widens
  // which SPELLING matches, never which ACCOUNT.
  it('still rejects a different address that only looks similar', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'owner@studio.tesst', password: PASSWORD },
    });
    expect(res.statusCode).toBe(401);
  });

  it('logs in and the access token resolves /auth/me', async () => {
    const res = await login(PASSWORD);
    expect(res.statusCode).toBe(200);
    const { accessToken, refreshToken, tokenType } = res.json();
    expect(tokenType).toBe('Bearer');
    expect(accessToken).toBeTruthy();
    expect(refreshToken).toBeTruthy();

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ email: EMAIL, role: 'owner' });
    expect(me.json()).not.toHaveProperty('workspaceId');
  });

  it('rotates a refresh token and detects reuse', async () => {
    const first = (await login(PASSWORD)).json();

    const rotated = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: first.refreshToken },
    });
    expect(rotated.statusCode).toBe(200);
    const next = rotated.json();
    expect(next.refreshToken).not.toBe(first.refreshToken);

    // Reusing the now-rotated original token = theft signal → 401 + chain revoked.
    const reuse = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: first.refreshToken },
    });
    expect(reuse.statusCode).toBe(401);

    // The chain was revoked, so the rotated token no longer works either.
    const afterReuse = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: next.refreshToken },
    });
    expect(afterReuse.statusCode).toBe(401);
  });

  it('stops a user disabled after login from refreshing, and kills their chain', async () => {
    const { refreshToken } = (await login(PASSWORD)).json();

    // Disable the account AFTER login (the owner conn writes it).
    const admin = new Client({ connectionString: container.getConnectionUri() });
    await admin.connect();
    await admin.query(`UPDATE "User" SET status = 'disabled' WHERE email = $1`, [EMAIL]);

    // The still-valid refresh token can no longer rotate — session ends.
    const denied = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken } });
    expect(denied.statusCode).toBe(401);

    // Re-enable: the chain was revoked, so the same token still fails...
    await admin.query(`UPDATE "User" SET status = 'active' WHERE email = $1`, [EMAIL]);
    await admin.end();
    const stillDead = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken } });
    expect(stillDead.statusCode).toBe(401);

    // ...but a fresh login works again now that the account is active.
    expect((await login(PASSWORD)).statusCode).toBe(200);
  });

  it('logout revokes the refresh token server-side, and is idempotent', async () => {
    const { refreshToken } = (await login(PASSWORD)).json();

    const out = await app.inject({ method: 'POST', url: '/auth/logout', payload: { refreshToken } });
    expect(out.statusCode).toBe(204);

    // The revoked token can no longer rotate — the session is dead server-side, not just
    // cleared in the browser.
    const denied = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken } });
    expect(denied.statusCode).toBe(401);

    // Logging out again (or with an unknown token) is a no-op, still 204 — sign-out never fails.
    expect(
      (await app.inject({ method: 'POST', url: '/auth/logout', payload: { refreshToken } })).statusCode,
    ).toBe(204);
  });

  it('forgot-password mints a reset token for a real account, and is enumeration-safe', async () => {
    const db = new Client({ connectionString: container.getConnectionUri() });
    await db.connect();
    const invitesFor = async (email: string) =>
      (
        await db.query(
          `SELECT count(*)::int AS n FROM "Invitation" i
             JOIN "User" u ON u.id = i."userId" WHERE u.email = $1`,
          [email],
        )
      ).rows[0].n as number;

    const before = await invitesFor(EMAIL);
    const real = await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email: EMAIL } });
    expect(real.statusCode).toBe(204);
    // A hit for a real, active account mints a one-time set-password token.
    expect(await invitesFor(EMAIL)).toBe(before + 1);

    // An unknown email returns the EXACT same 204 — no oracle for which addresses exist —
    // and creates nothing.
    const unknown = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: { email: 'nobody@nowhere.test' },
    });
    expect(unknown.statusCode).toBe(204);
    expect(await invitesFor('nobody@nowhere.test')).toBe(0);

    await db.end();
  });
});

/**
 * The throttle answers 429, not 500.
 *
 * `errorResponseBuilder` used to return only the response BODY, with no `statusCode`.
 * The throttled request still goes through the global error handler, which reads the
 * status off the error — found nothing, and fell through to its catch-all 500. So a
 * client being rate-limited was told the server had broken, and every ordinary throttle
 * was logged as an unhandled server fault. Its own app instance with a tiny limit, so
 * the assertion does not depend on how many logins the rest of the suite spent.
 */
describe('rate limiting', () => {
  it('answers 429 RATE_LIMITED once the auth limit is exceeded', async () => {
    process.env.RATE_LIMIT_AUTH = '2';
    // `@hold/config` parses env once at module load, so a plain re-import would hand back
    // the already-frozen limit and the request would never be throttled — the test would
    // pass by never exercising the throttle.
    vi.resetModules();
    const { buildApp } = await import('../src/app.js');
    const throttled = await buildApp();
    try {
      const hit = () =>
        throttled.inject({
          method: 'POST',
          url: '/auth/login',
          payload: { email: EMAIL, password: 'wrong' },
        });

      expect((await hit()).statusCode).toBe(401);
      expect((await hit()).statusCode).toBe(401);

      const limited = await hit();
      expect(limited.statusCode).toBe(429);
      expect(limited.json().error.code).toBe('RATE_LIMITED');
    } finally {
      await throttled.close();
      process.env.RATE_LIMIT_AUTH = '1000';
    }
  });
});
