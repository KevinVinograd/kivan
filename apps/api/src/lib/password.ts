/**
 * Password hashing.
 *
 * argon2id is the documented preference, but we implement with Node's built-in
 * `crypto.scrypt` — a strong, memory-hard KDF that ships with Node and needs NO
 * native module. That keeps the Alpine Docker image and CI build clean (argon2's
 * native binding is a recurring build headache on Alpine). Verification is
 * constant-time via `timingSafeEqual`.
 *
 * Stored format: `scrypt$N$r$p$<saltB64>$<hashB64>` so params travel with the
 * hash and can be tuned without breaking existing hashes.
 */
import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

const KEYLEN = 64;
// CPU/memory cost. 2^15 meets the OWASP scrypt minimum; params travel with each
// hash (verify reads N/r/p from the stored string), so raising N only affects new
// hashes — existing ones keep verifying at their stored cost.
const N = 32768; // 2^15
const R = 8;
const P = 1;
// scrypt needs ~128*N*r bytes; N=2^15, r=8 ≈ 32 MiB, at/above Node's 32 MiB
// `maxmem` default → raise it (also covers the stored params on verify).
const MAXMEM = 64 * 1024 * 1024;

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, derivedKey) => {
      if (err) {
        reject(err);
      } else {
        resolve(derivedKey);
      }
    });
  });
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(plain, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(stored: string, plain: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64 as string, 'base64');
  const expected = Buffer.from(hashB64 as string, 'base64');
  const derived = await scrypt(plain, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAXMEM,
  });
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
