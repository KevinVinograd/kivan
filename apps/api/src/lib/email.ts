/**
 * Email normalization, shared by every edge that accepts one.
 *
 * Postgres compares text case-sensitively and `User.email` is a plain `String` under
 * `@@unique([email])`, so "Flor@studio.com" and "flor@studio.com" are two
 * different rows. Left unnormalized that silently creates duplicate members who look
 * identical in the UI, each with their own password and role.
 *
 * Writes normalize (below); the login lookup instead matches case-insensitively, so
 * accounts created before this existed — stored with whatever casing was typed — keep
 * working rather than being locked out by a normalized lookup that no longer finds them.
 */
import { z } from 'zod';

/** Lowercased + trimmed, the canonical form stored for new accounts. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Validated + normalized email for request schemas. */
export const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform(normalizeEmail);
