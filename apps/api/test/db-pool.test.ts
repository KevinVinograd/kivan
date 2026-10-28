/**
 * The database pool has a DECLARED ceiling.
 *
 * This is a regression test for an outage, not a style rule. The pool used to carry no
 * `max`, which is not "no limit" — it is node-postgres' default of 10 per process. The
 * database is shared with the studio's other apps and its direct port offers 25 slots in
 * total, so one unstated default claimed 40% of a common resource; on 2026-09-04 the API
 * spent ten minutes unable to open a single connection, its own health check included.
 *
 * The test asserts the CONFIG, not the socket, because that is where the defect lived: the
 * numbers were absent. A live-pool test would need a real database and would pass just as
 * happily with the ceiling removed again.
 */
import { describe, expect, it } from 'vitest';
import { loadEnv } from '@hold/config';

const BASE = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/hold',
  JWT_SECRET: 'x'.repeat(32),
};

describe('database pool ceiling', () => {
  it('defaults to a ceiling sized to the login burst, not to the driver default', () => {
    // 12, not 5. The first cap was set from "a few dozen queries a minute" and the real
    // pattern is ~20 concurrent GETs at login: against 5 slots the last three hit Prisma's
    // 2000 ms maxWait and BOTH logins after that cap shipped answered three 503s each.
    // A ceiling below the app's own known burst is an outage on a timer, not a ceiling.
    expect(loadEnv(BASE).DB_POOL_MAX).toBe(12);
  });

  it('bounds how long a request may wait for a connection', () => {
    // node-postgres waits forever when this is unset, which is how a starved pool takes the
    // health check down with it instead of answering "busy".
    expect(loadEnv(BASE).DB_CONNECT_TIMEOUT_MS).toBe(5_000);
  });

  it('is raisable from the environment without a code change', () => {
    expect(loadEnv({ ...BASE, DB_POOL_MAX: '12' }).DB_POOL_MAX).toBe(12);
  });

  it('refuses a value that would be a lie — zero, negative, or absurd', () => {
    for (const bad of ['0', '-1', '500']) {
      expect(() => loadEnv({ ...BASE, DB_POOL_MAX: bad })).toThrow();
    }
  });
});

describe('database pool warmth', () => {
  /**
   * The number that matters most here is the least obvious one. node-postgres closes an idle
   * connection after 10 s, which is free when the database is next door — but across regions
   * a fresh connection costs ~800 ms.
   *
   * At the driver default the pool went cold between one click and the next (measured: alive
   * at 8 s of idle, gone by 12), and `/health/ready` — one SELECT 1 — took ~800 ms on 92% of
   * its calls.
   */
  it('keeps a connection alive across the gaps between clicks, not 10 seconds', () => {
    const idle = loadEnv(BASE).DB_POOL_IDLE_TIMEOUT_MS;
    expect(idle).toBe(300_000);
    // The driver default is what this exists to override. Asserting the direction, not just
    // the number, is what catches a future "tidy-up" that removes the option entirely.
    expect(idle).toBeGreaterThan(10_000);
  });

  it('is tunable from the environment, like the other two pool numbers', () => {
    expect(loadEnv({ ...BASE, DB_POOL_IDLE_TIMEOUT_MS: '60000' }).DB_POOL_IDLE_TIMEOUT_MS).toBe(60_000);
  });

  it('refuses both spellings of "never close" — zero and an absurdly large value', () => {
    // Zero is the obvious trap: in node-postgres it disables the idle timeout entirely, so
    // every connection the burst opens is pinned forever — the exact opposite of what
    // DB_POOL_MAX is for. A mistyped 3_000_000 gets to the same place by a longer road, so
    // rejecting only the zero would leave the guard half-open.
    for (const bad of ['0', '-1', '3000000']) {
      expect(() => loadEnv({ ...BASE, DB_POOL_IDLE_TIMEOUT_MS: bad })).toThrow();
    }
  });
});
