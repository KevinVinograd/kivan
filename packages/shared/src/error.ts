/**
 * The canonical API error contract, shared by api + web.
 *
 * Every error the API returns has the shape:
 *   { "error": { "code": "NOT_FOUND", "message": "...", "details"?: ... } }
 *
 * The api maps thrown `AppError`s (apps/api/src/lib/errors.ts) onto this shape;
 * the web narrows on `code` for user-facing handling.
 */
import { z } from 'zod';

export const ErrorCode = z.enum([
  'BAD_REQUEST', // 400
  'UNAUTHORIZED', // 401
  'FORBIDDEN', // 403
  'NOT_FOUND', // 404
  'CONFLICT', // 409
  'PAYLOAD_TOO_LARGE', // 413
  'RATE_LIMITED', // 429
  'INTERNAL', // 500
  // 503. The transaction did not complete, so Postgres rolled it back and NOTHING was
  // written. Distinct from INTERNAL on purpose: 500 is the catch-all the web reads as
  // "we cannot tell whether the write landed", and this is the opposite of that -- an
  // outcome the API can prove. The envelope is what identifies it as ours; a 503 from a
  // proxy carries no body and keeps meaning "we cannot tell".
  'TIMEOUT', // 503
  // 503. The database could not be USED at all, so the request did no work. Distinct from
  // TIMEOUT, which names a transaction that started and was rolled back: this one never
  // reached a transaction. Naming it TIMEOUT would send whoever reads a screenshot looking
  // for a slow query instead of an unreachable or saturated server. Seen in production on
  // 2026-09-04, when the shared cluster ran out of connection slots and the LOGIN answered
  // 500 for ~40 s.
  'UNAVAILABLE', // 503
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorBody = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

export function errorBody(code: ErrorCode, message: string, details?: unknown): ErrorBody {
  return {
    error: details === undefined ? { code, message } : { code, message, details },
  };
}
