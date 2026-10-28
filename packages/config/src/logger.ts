/**
 * Shared pino logger. It exists to make two things true of every line the backend
 * writes, per the engineering standards:
 *
 * 1. **The line names a user.** Lines written before (or without) a session carry
 *    `userId: 'anon'`; work that KNOWS whose it is binds the real id — `childLogger`
 *    below for anything outside request scope, and `bindUser` for the request logger,
 *    which the API's auth plugin rebinds the moment the JWT verifies so even Fastify's
 *    own "request completed" line names the caller.
 * 2. **No secret reaches the log.** `redact` scrubs the auth headers and the
 *    credential-shaped fields, one level down as well (`*.token`), because a body, a
 *    DTO or an error is almost always logged as a nested object. Extend the list when
 *    a new sensitive field appears — it is cheaper than an incident.
 *
 * Error causes need no help here: pino's default `err` serializer already walks the
 * `cause` chain into the logged `message` and `stack` (pino-std-serializers'
 * `messageWithCauses`/`stackWithCauses`), so `log.error({ err }, 'what failed')`
 * carries the ROOT cause and not just the wrapper Prisma threw.
 *
 * Reads LOG_LEVEL directly from process.env (allowed here — this is the config
 * package) with a safe default, so the logger never forces full env validation just
 * to log.
 */
import { pino } from 'pino';

const level = process.env.LOG_LEVEL ?? 'info';

/**
 * Records the id a logger is already bound to, so the default below stops being added to
 * its lines and a second bind of the same user is a no-op instead of a duplicate key. Set
 * as an OWN property, which that logger's children then inherit through the prototype
 * chain — which is what keeps a bound request logger bound.
 */
const BOUND_USER = Symbol('hold.logger.bound-user');

function boundUserId(log: unknown): string | undefined {
  const bound = (log as Record<symbol, unknown> | null | undefined)?.[BOUND_USER];
  return typeof bound === 'string' ? bound : undefined;
}

export const logger = pino({
  level,
  /**
   * The `anon` default is added per LINE rather than bound onto the logger, and that is
   * load-bearing. pino APPENDS a child's bindings to its parent's instead of replacing
   * them, so a logger carrying `userId: 'anon'` that is later rebound to the real caller
   * emits the key TWICE in one JSON object — `{"userId":"anon","userId":"u1"}`. Most
   * consumers take the last one and read it correctly; a human scanning the log, and any
   * parser that keeps the first, read it as anon. Skipping the default for a logger that
   * already has a user leaves exactly one `userId` on every line either way.
   */
  mixin: (_merge, _level, log) => (boundUserId(log) === undefined ? { userId: 'anon' } : {}),
  redact: {
    paths: [
      // Request/response headers, both under pino's `req`/`res` serializers and as a
      // bare header bag someone logged on its own.
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'headers.authorization',
      'headers.cookie',
      // Credential-shaped fields. Listed at the top level AND one level down, because
      // the value that leaks is usually inside an object (a parsed body, a DTO, an
      // error's own properties) rather than at the root of the log call.
      'authorization',
      'cookie',
      'password',
      'passwordHash',
      'newPassword',
      'currentPassword',
      'token',
      'rawToken',
      'tokenHash',
      'accessToken',
      'refreshToken',
      'jwt',
      'secret',
      '*.authorization',
      '*.cookie',
      '*.password',
      '*.passwordHash',
      '*.newPassword',
      '*.currentPassword',
      '*.token',
      '*.rawToken',
      '*.tokenHash',
      '*.accessToken',
      '*.refreshToken',
      '*.jwt',
      '*.secret',
    ],
    censor: '[redacted]',
  },
});

export type Logger = typeof logger;

/** The shape `bindUser` needs: anything that can spawn a child logger. */
interface Childable {
  child(bindings: Record<string, unknown>): unknown;
}

/**
 * Returns a child of `parent` bound to `userId` (`anon` when there is none). Binding the
 * user already bound returns `parent` untouched — a request has one identity, and childing
 * again would only append a second `userId` to the same line.
 *
 * The parent matters. Inside the API it MUST be the request's own logger, so the bound
 * logger keeps everything Fastify configured on it — above all the `req`/`res`
 * serializers: rebuilt from this module's root instead, the "request completed" line
 * dumps the entire raw response object, every header included.
 */
export function bindUser<T extends Childable>(parent: T, userId: string | null | undefined): T {
  const id = userId ?? 'anon';
  if (boundUserId(parent) === id) return parent;
  const bound = parent.child({ userId: id }) as T;
  (bound as unknown as Record<symbol, unknown>)[BOUND_USER] = id;
  return bound;
}

/**
 * A logger bound to a user id, for work that holds one but no `request` — mail sends,
 * jobs, anything called below the route layer. Inside a route use `request.log`, which
 * the auth plugin has already bound.
 */
export function childLogger(userId: string | null | undefined): Logger {
  return bindUser(logger, userId);
}
