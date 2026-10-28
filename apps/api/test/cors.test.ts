/**
 * CORS origin policy — pure predicate, no Fastify boot needed.
 * Covers the two contracts callers rely on:
 *   1. Prod: only the explicit allow-list is accepted.
 *   2. Dev:  allow-list PLUS any `http://localhost:<port>` / `http://127.0.0.1:<port>`.
 */
import { describe, expect, it } from 'vitest';
import { shouldAllowOrigin } from '../src/plugins/cors.js';

const ALLOW = ['http://localhost:5173'];

describe('shouldAllowOrigin', () => {
  it('accepts requests without an Origin header (same-origin, curl, s2s)', () => {
    expect(shouldAllowOrigin(undefined, ALLOW, true)).toBe(true);
    expect(shouldAllowOrigin(undefined, ALLOW, false)).toBe(true);
  });

  it('accepts an explicit allow-list match in both prod and dev', () => {
    expect(shouldAllowOrigin('http://localhost:5173', ALLOW, true)).toBe(true);
    expect(shouldAllowOrigin('http://localhost:5173', ALLOW, false)).toBe(true);
  });

  it('accepts any http://localhost:<port> and http://127.0.0.1:<port> in dev', () => {
    expect(shouldAllowOrigin('http://localhost:61748', ALLOW, true)).toBe(true);
    expect(shouldAllowOrigin('http://127.0.0.1:5174', ALLOW, true)).toBe(true);
    expect(shouldAllowOrigin('http://localhost', ALLOW, true)).toBe(true);
  });

  it('rejects loopback origins outside dev', () => {
    expect(shouldAllowOrigin('http://localhost:61748', ALLOW, false)).toBe(false);
    expect(shouldAllowOrigin('http://127.0.0.1:5174', ALLOW, false)).toBe(false);
  });

  it('rejects unrelated origins in any mode', () => {
    expect(shouldAllowOrigin('https://evil.example', ALLOW, true)).toBe(false);
    expect(shouldAllowOrigin('https://evil.example', ALLOW, false)).toBe(false);
  });

  it('rejects loopback lookalikes and non-http schemes even in dev', () => {
    // https loopback is not implicit — dev servers speak http
    expect(shouldAllowOrigin('https://localhost:5173', ALLOW, true)).toBe(false);
    // hostname trickery: `localhost.attacker.com` is a subdomain of attacker.com
    expect(shouldAllowOrigin('http://localhost.attacker.com', ALLOW, true)).toBe(false);
    // `evil-localhost` is not `localhost`
    expect(shouldAllowOrigin('http://evil-localhost', ALLOW, true)).toBe(false);
    // trailing garbage after port
    expect(shouldAllowOrigin('http://localhost:5173.evil', ALLOW, true)).toBe(false);
  });
});
