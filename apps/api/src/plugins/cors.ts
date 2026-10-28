/**
 * CORS for browser clients. Bearer tokens travel in `Authorization` (not
 * cookies), so credentials stay off.
 *
 * Origin policy:
 *   - Production: only origins listed in `CORS_ORIGINS` (required) are accepted.
 *     Any other origin is denied — no dev fallback ever leaks into prod.
 *   - Non-production: origins in the allow-list PLUS any `http://localhost:<port>`
 *     or `http://127.0.0.1:<port>` are accepted. This lets ephemeral dev proxies
 *     (Ship Studio preview, alternate Vite ports, Playwright, Storybook) work
 *     without hand-editing the allow-list each session.
 *
 * Requests without an `Origin` header (same-origin, curl, server-to-server) are
 * always accepted — CORS only exists to gate cross-origin browser callers.
 */
import fp from 'fastify-plugin';
import cors from '@fastify/cors';

const DEV_LOOPBACK_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Allowed origins: the comma-separated `CORS_ORIGINS` allow-list. In production
 * this is REQUIRED — falling back to the dev origin there would silently reject
 * the real front (every cross-origin call, login included), so we fail fast at
 * boot instead. Outside production we default to the local Vite front.
 */
function corsAllowList(): string[] {
  const raw = process.env.CORS_ORIGINS?.trim();
  const exact = raw ? raw.split(',').map((o) => o.trim()).filter(Boolean) : [];
  if (exact.length > 0) return exact;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('CORS_ORIGINS must be set in production (allowed front origins)');
  }
  return ['http://localhost:5173'];
}

/**
 * Pure decision function so the policy can be exercised in unit tests without
 * booting Fastify. Kept in-plugin (single source of truth) rather than lifted
 * to a shared util — this is the only caller.
 */
export function shouldAllowOrigin(
  origin: string | undefined,
  allowList: readonly string[],
  allowDevLoopback: boolean,
): boolean {
  if (!origin) return true;
  if (allowList.includes(origin)) return true;
  if (allowDevLoopback && DEV_LOOPBACK_RE.test(origin)) return true;
  return false;
}

export default fp(
  async (app) => {
    const allowList = corsAllowList();
    const allowDevLoopback = process.env.NODE_ENV !== 'production';
    await app.register(cors, {
      origin: (origin, cb) => {
        cb(null, shouldAllowOrigin(origin, allowList, allowDevLoopback));
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      // The web is a different origin from the API, so a response header the browser is
      // not told to expose is simply invisible to `fetch()`. Without this line the
      // `Retry-After` on a 503 UNAVAILABLE reaches the browser and cannot be read — the
      // header would be decoration, and the comment claiming a caller can act on it
      // would be false.
      exposedHeaders: ['Retry-After'],
      credentials: false,
      maxAge: 86400,
    });
  },
  { name: 'cors' },
);
