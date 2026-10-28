/**
 * Global error handler. Maps every thrown error onto the canonical
 * `{ error: { code, message, details? } }` contract:
 *   - AppError subclasses → their status + code
 *   - Zod validation errors → 400 BAD_REQUEST (+ flattened issues)
 *   - @fastify/jwt auth errors → 401 UNAUTHORIZED
 *   - Prisma P2002 → 409 CONFLICT, P2025 → 404 NOT_FOUND
 *   - Prisma P2028 / P2024 → 503 TIMEOUT, P2034 → 409 CONFLICT (all three roll back)
 *   - database unusable (adapter `kind`, or P2037/P1001/P1008/P1011/P1017) → 503 UNAVAILABLE
 *     + Retry-After. Matched by `databaseUnusable()` below, NOT by code alone.
 *   - body-limit (FST_ERR_CTP_BODY_TOO_LARGE) → 413
 *   - rate limit (429) is shaped by the rate-limit plugin's errorResponseBuilder
 *   - anything else → 500 INTERNAL (no internals leaked)
 *
 * Every line logged here goes through `request.log`, which the auth plugin binds to the
 * caller (`userId`, or `anon` on a public route) — so the userId is NOT repeated in the
 * merge objects below: pino appends bindings, and passing it again would emit the key
 * twice in one JSON object. The `err` serializer flattens the whole `cause` chain, so a
 * Prisma wrapper still reports the root cause.
 */
import fp from 'fastify-plugin';
import { errorBody } from '@hold/shared';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

/**
 * What the driver adapter calls a database it could not use. This is the signal that is
 * IDENTICAL on both of Prisma's error paths — the model-call one (`P2037`) and the raw-SQL
 * one (`P2010`, which hides the Postgres code inside a message string) — so matching on it
 * catches the same outage however the query happened to be written.
 */
const DB_UNUSABLE_KINDS = new Set([
  'TooManyConnections',
  'ConnectionClosed',
  'DatabaseNotReachable',
  'SocketTimeout',
]);

/**
 * The connection-acquisition codes, as a second net for anything that arrives without an
 * adapter payload. These are the ones Prisma 7 can actually emit: `getErrorCode()` in the
 * runtime lists P1000/P1001/P1003/P1008/P1009/P1010/P1011/P1017/P1018 and friends — there
 * is NO P1002 (the first draft of this branch mapped it, which was dead code, and left
 * `SocketTimeout` → P1008 falling through to a 500).
 *
 * P1000/P1010 stay out on purpose: bad credentials and denied access do not clear by
 * themselves, so answering "try again in a few seconds" would be a lie.
 */
const DB_UNUSABLE_CODES = new Set(['P2037', 'P1001', 'P1008', 'P1017', 'P1011']);

function databaseUnusable(error: unknown): boolean {
  const e = error as {
    code?: string;
    meta?: { driverAdapterError?: { cause?: { kind?: string } } };
  };
  const kind = e.meta?.driverAdapterError?.cause?.kind;
  if (typeof kind === 'string' && DB_UNUSABLE_KINDS.has(kind)) return true;
  return typeof e.code === 'string' && DB_UNUSABLE_CODES.has(e.code);
}

export default fp(
  (app, _opts, done) => {
    app.setErrorHandler((error, request, reply) => {
      if (error instanceof AppError) {
        reply.status(error.statusCode).send(errorBody(error.code, error.message, error.details));
        return;
      }

      if (error instanceof ZodError) {
        reply.status(400).send(errorBody('BAD_REQUEST', 'Validation failed', error.flatten()));
        return;
      }

      const code = (error as { code?: string }).code;

      if (code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER' || code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID' || code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
        reply.status(401).send(errorBody('UNAUTHORIZED', 'Invalid or missing authentication token'));
        return;
      }

      if (code === 'P2002') {
        reply.status(409).send(errorBody('CONFLICT', 'Unique constraint violation'));
        return;
      }
      if (code === 'P2025') {
        reply.status(404).send(errorBody('NOT_FOUND', 'Resource not found'));
        return;
      }
      // Foreign-key restriction: the row is still referenced (e.g. deleting a role a user
      // holds, when a concurrent assign slipped in after the service's held-count check).
      // The DB RESTRICT is the backstop; without this branch it surfaced as a raw 500
      // instead of the clean 409 the conflict deserves.
      if (code === 'P2003') {
        reply.status(409).send(errorBody('CONFLICT', 'Record is still referenced'));
        return;
      }
      // Transaction failures that PROVE a rollback.
      //
      // P2028 is the interactive-transaction budget expiring and P2024 is the pool timeout:
      // in both the COMMIT never runs, so Postgres rolls the work back and nothing was
      // written. Left unmapped they fell into the catch-all below, and a 500 is precisely
      // the answer that means "we do not know" -- so an outcome the API could PROVE reached
      // the operator as an unresolvable one, telling them to reload and check a month that
      // was provably untouched. Production hit this three times on 2026-08-26 generating
      // the month's cobros.
      //
      // All three are LOGGED before they are answered. Mapping an error moves it out of
      // the catch-all below, which is the only branch that logs — and the P2028 payload is
      // the most diagnostic thing this API produces: `meta.timeTaken` against
      // `meta.timeout` is what identified the 2026-08-26 incident at all. Answering these
      // cleanly while silently dropping that would trade the next diagnosis for this one.
      if (code === 'P2028' || code === 'P2024') {
        request.log.error({ err: error }, 'Transaction did not complete');
        reply.status(503).send(
          errorBody(
            'TIMEOUT',
            code === 'P2028'
              ? 'The operation ran out of time and was rolled back, nothing was written'
              : // P2024 is OUR connection pool, not Postgres. "The database was too busy"
                // would send whoever reads it off to check a server that was fine.
                'The server ran out of database connections to start the operation, nothing was written',
          ),
        );
        return;
      }
      // A write conflict or deadlock rolls back just as provably, but calling it a timeout
      // would misname the cause on a screenshot. 409 already says "you collided with
      // another write", and the web already reads it as a rollback.
      if (code === 'P2034') {
        request.log.error({ err: error }, 'Transaction hit a write conflict');
        reply.status(409).send(
          errorBody('CONFLICT', 'The operation collided with another write and was rolled back'),
        );
        return;
      }
      // The database could not be USED, so the failing statement did no work — the same
      // provable outcome as the branch above, from a different cause: not a transaction
      // that started and rolled back, but one that never began.
      //
      // When the database runs out of connection slots (Postgres
      // 53300) and `prisma.user.findFirst` inside verifyCredentials fell through to the
      // catch-all below: the LOGIN of a paying client answered 500 for the ~40 s the
      // saturation lasted, and 500 is what the web reads as "we cannot tell".
      //
      // MATCH ON THE ADAPTER `kind` FIRST, NOT ONLY ON THE CODE. Prisma 7 has two error
      // paths and they report the SAME saturation differently: a model call
      // (`prisma.user.findFirst`) surfaces `P2037`, but a RAW statement surfaces `P2010`
      // with the Postgres code buried in a message string. Keying on the code alone would
      // leave a saturation hit on a raw statement still answering 500.
      //
      // `Retry-After` is what makes this actionable: unlike a 500, it clears by itself.
      if (databaseUnusable(error)) {
        request.log.error({ err: error }, 'Database unavailable');
        reply.header('Retry-After', '5');
        reply.status(503).send(
          errorBody(
            'UNAVAILABLE',
            'The database is temporarily unavailable and nothing was written. Try again in a few seconds.',
          ),
        );
        return;
      }
      if (code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
        reply.status(413).send(errorBody('PAYLOAD_TOO_LARGE', 'Request body too large'));
        return;
      }

      // Framework / parser errors that already carry a 4xx status (e.g. invalid
      // JSON body) — surface them honestly instead of masking as 500.
      const status = (error as { statusCode?: number }).statusCode;
      if (typeof status === 'number' && status >= 400 && status < 500) {
        const byStatus: Record<number, Parameters<typeof errorBody>[0]> = {
          400: 'BAD_REQUEST',
          401: 'UNAUTHORIZED',
          403: 'FORBIDDEN',
          404: 'NOT_FOUND',
          409: 'CONFLICT',
          413: 'PAYLOAD_TOO_LARGE',
          429: 'RATE_LIMITED',
        };
        reply.status(status).send(errorBody(byStatus[status] ?? 'BAD_REQUEST', (error as Error).message));
        return;
      }

      request.log.error({ err: error }, 'Unhandled error');
      reply.status(500).send(errorBody('INTERNAL', 'Internal server error'));
    });
    done();
  },
  { name: 'error-handler' },
);
