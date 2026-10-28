/**
 * One-time token helpers, shared by the refresh-token and invitation flows: mint
 * a high-entropy raw token to hand out, persist only its sha256 hash so a DB
 * read (or leak) can't yield a usable token.
 */
import { createHash, randomBytes } from 'node:crypto';

/** A URL-safe 256-bit random token — handed to the client, never stored raw. */
export function newRawToken(): string {
  return randomBytes(32).toString('base64url');
}

/** The stored form of a raw token. */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
