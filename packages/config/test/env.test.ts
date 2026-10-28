import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/env.js';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/hold',
  JWT_SECRET: 'x'.repeat(32),
};

describe('loadEnv', () => {
  it('throws listing the missing required vars', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({})).toThrow(/JWT_SECRET/);
  });

  it('rejects a too-short JWT_SECRET', () => {
    expect(() => loadEnv({ ...valid, JWT_SECRET: 'short' })).toThrow(/at least 32/);
  });

  it('returns parsed values with defaults applied', () => {
    const env = loadEnv(valid);
    expect(env.DATABASE_URL).toBe(valid.DATABASE_URL);
    expect(env.PORT).toBe(3000);
    expect(env.RATE_LIMIT_AUTH).toBe(10);
    expect(env.NODE_ENV).toBe('development');
  });

  it('coerces numeric strings', () => {
    const env = loadEnv({ ...valid, PORT: '8080', TRUST_PROXY_HOPS: '1' });
    expect(env.PORT).toBe(8080);
    expect(env.TRUST_PROXY_HOPS).toBe(1);
  });
});
