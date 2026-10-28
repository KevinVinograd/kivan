/**
 * Global rate limit via @fastify/rate-limit, keyed on the REAL client IP
 * (resolved via trustProxy = TRUST_PROXY_HOPS so X-Forwarded-For can't be
 * spoofed past the proxy). The global limiter runs in the onRequest phase —
 * BEFORE auth — so it cannot key on the user id; per-user throttling is layered
 * per-route after authentication where it matters (e.g. the tighter limit on the
 * public auth routes in modules/auth/auth.routes.ts).
 */
import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import { env } from '@hold/config';
import { errorBody } from '@hold/shared';

export default fp(
  async (app) => {
    await app.register(rateLimit, {
      max: env.RATE_LIMIT_MAX,
      timeWindow: env.RATE_LIMIT_WINDOW,
      keyGenerator: (request) => request.ip,
      // MUST carry `statusCode` (and `message`): the throttled request goes through the
      // global error handler, which decides the status from `error.statusCode`. Returning
      // only the body — as this did — left it undefined, so the handler fell through to
      // its "Unhandled error" branch and answered **500 instead of 429**. Callers could
      // not tell "slow down" from "the server is broken", and ordinary throttling was
      // logged and alarmed as a server fault. The handler already maps 429 → RATE_LIMITED.
      errorResponseBuilder: () => ({
        statusCode: 429,
        message: 'Too many requests',
        ...errorBody('RATE_LIMITED', 'Too many requests'),
      }),
    });
  },
  { name: 'rate-limit' },
);
