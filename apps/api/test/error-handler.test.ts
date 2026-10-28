/**
 * Global error handler — the mapping from a thrown error onto the canonical
 * `{ error: { code, message } }` contract.
 *
 * WHY THIS FILE EXISTS. The handler's last branch answers EVERY unrecognised error with a
 * flat `500 Internal server error`, and the web deliberately reads a 500 as "we cannot tell
 * whether the write landed" (src/app/pages/cobros-generar-mes-outcome.ts). So an error that
 * PROVES a rollback but is not mapped here does not merely lose detail: it is downgraded
 * into an unresolvable outcome, and the operator is told to reload and check a month they
 * could have simply been told was untouched.
 *
 * That is not hypothetical. Three `P2028` rolled back in production on 2026-08-26 and each
 * one reached the screen as "Internal server error". These pin the mapping so the next one
 * arrives as an answer.
 *
 * No database and no app: the handler is the subject, so it is registered on a bare Fastify
 * with routes that throw exactly what Prisma throws.
 */
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import errorHandler from '../src/plugins/error-handler.js';
import { ConflictError } from '../src/lib/errors.js';

let app: FastifyInstance;

/** What the handler wrote to the log, so the tests can assert it wrote anything at all. */
const logged: { msg: unknown; code?: unknown }[] = [];

/** Minimal FastifyBaseLogger. pino is not a direct dependency of this package. */
function recordingLogger(): FastifyBaseLogger {
  const noop = () => {};
  const self = {
    error: (obj: unknown, msg?: unknown) => {
      logged.push({ msg: msg ?? obj, code: (obj as { err?: { code?: unknown } })?.err?.code });
    },
    info: noop,
    warn: noop,
    debug: noop,
    trace: noop,
    fatal: noop,
    silent: noop,
    level: 'error',
    child: () => self,
  };
  return self as unknown as FastifyBaseLogger;
}

/** What a Prisma known-request error looks like where the handler inspects it. */
function prismaError(code: string, message = `Prisma error ${code}`): Error {
  return Object.assign(new Error(message), { code, name: 'PrismaClientKnownRequestError' });
}

/**
 * The shape a driver-adapter failure actually arrives in. This is what the fabricated
 * `prismaError` above CANNOT represent, and the gap is not academic: the first version of
 * the database-unusable branch keyed on `code` alone, passed every test, and still left the
 * raw-SQL path answering 500 in production.
 */
function adapterError(code: string, kind: string): Error {
  return Object.assign(new Error(`Prisma error ${code}`), {
    code,
    name: 'PrismaClientKnownRequestError',
    meta: { driverAdapterError: { name: 'DriverAdapterError', cause: { kind } } },
  });
}

beforeAll(async () => {
  app = Fastify({ loggerInstance: recordingLogger() });
  await app.register(errorHandler);
  app.get('/throw/prisma/:code', async (request) => {
    throw prismaError((request.params as { code: string }).code);
  });
  app.get('/throw/adapter/:code/:kind', async (request) => {
    const { code, kind } = request.params as { code: string; kind: string };
    throw adapterError(code, kind);
  });
  app.get('/throw/app', async () => {
    throw new ConflictError('Already invoiced');
  });
  app.get('/throw/zod', async () => {
    z.object({ n: z.number() }).parse({ n: 'not a number' });
  });
  app.get('/throw/unknown', async () => {
    throw new TypeError('Cannot read properties of undefined');
  });
  await app.ready();
});

afterAll(async () => {
  await app?.close();
});

beforeEach(() => {
  logged.length = 0;
});

async function get(url: string) {
  const res = await app.inject({ method: 'GET', url });
  return { status: res.statusCode, code: res.json().error?.code as string, message: res.json().error?.message as string };
}

describe('error handler — Prisma transaction failures', () => {
  /**
   * P2028 is the transaction budget running out. Prisma's own message says it: "a query
   * cannot be executed on an expired transaction" / "a commit cannot be executed on an
   * expired transaction". Either way the COMMIT never ran, so Postgres rolled the work
   * back — nothing was written, and that is provable rather than assumed.
   */
  it('answers an expired transaction with a status that PROVES the rollback', async () => {
    const res = await get('/throw/prisma/P2028');
    expect(res.status).toBe(503);
    expect(res.code).toBe('TIMEOUT');
    // The operator reads this sentence inside the toast, so it has to say what happened
    // AND what is now true of their data.
    expect(res.message).toMatch(/rolled back/i);
  });

  /**
   * P2024 is the pool timeout: the transaction could not even get a connection, so the
   * query never ran. Same guarantee, same answer.
   */
  it('answers a pool timeout the same way, because nothing ran at all', async () => {
    const res = await get('/throw/prisma/P2024');
    expect(res.status).toBe(503);
    expect(res.code).toBe('TIMEOUT');
  });

  /**
   * P2034 is a write conflict or deadlock. Postgres aborted the transaction, so the
   * rollback is equally proven — but "timed out" would be a lie about the cause, and 409
   * already carries "you collided with another write" honestly.
   */
  it('answers a deadlock as a conflict, not as a timeout', async () => {
    const res = await get('/throw/prisma/P2034');
    expect(res.status).toBe(409);
    expect(res.code).toBe('CONFLICT');
  });

  it('still LOGS them, because mapping an error takes it out of the only branch that did', async () => {
    // The trap this closes: before the mapping, these reached the catch-all, and the
    // catch-all is where `request.log.error` lives. Answering them cleanly and returning
    // early would have silenced the single most diagnostic payload the API produces --
    // P2028 carries `meta.timeTaken` against `meta.timeout`, which is the evidence that
    // identified the incident this whole change came from. A cleaner answer bought with
    // the next diagnosis is not a trade worth making.
    for (const code of ['P2028', 'P2024', 'P2034']) {
      logged.length = 0;
      await get(`/throw/prisma/${code}`);
      expect(logged).toHaveLength(1);
      expect(logged[0]?.code).toBe(code);
    }
  });

  it('keeps the mappings that were already load-bearing', async () => {
    expect(await get('/throw/prisma/P2002')).toMatchObject({ status: 409, code: 'CONFLICT' });
    expect(await get('/throw/prisma/P2025')).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(await get('/throw/prisma/P2003')).toMatchObject({ status: 409, code: 'CONFLICT' });
  });
});

describe('error handler — the branches around the new ones', () => {
  it('still answers an unrecognised error with the catch-all, leaking nothing', async () => {
    // The catch-all must survive: a 500 is how the API says "I do not know what happened",
    // and the web depends on that meaning. Mapping MORE things is only safe while the
    // fallback keeps its own honesty.
    const res = await get('/throw/unknown');
    expect(res.status).toBe(500);
    expect(res.code).toBe('INTERNAL');
    expect(res.message).toBe('Internal server error');
    expect(res.message).not.toContain('Cannot read properties');
  });

  it('keeps AppError and Zod on their own paths', async () => {
    expect(await get('/throw/app')).toMatchObject({ status: 409, code: 'CONFLICT', message: 'Already invoiced' });
    expect(await get('/throw/zod')).toMatchObject({ status: 400, code: 'BAD_REQUEST' });
  });
});

describe('error handler — the database could not be used at all', () => {
  /**
   * P2037 is the one production actually threw: the database
   * ran out of connection slots (Postgres 53300, which the driver adapter reports
   * as `kind: TooManyConnections`) and `prisma.user.findFirst` inside verifyCredentials
   * fell through to the catch-all. For the ~40 s the saturation lasted, the LOGIN of a
   * paying client answered `500 Internal server error` — the one status the web reads as
   * "we cannot tell what happened" — for a request that provably did nothing.
   */
  it('answers a saturated database with a status that says "try again", not "we do not know"', async () => {
    const res = await get('/throw/prisma/P2037');
    expect(res.status).toBe(503);
    expect(res.code).toBe('UNAVAILABLE');
    expect(res.message).toMatch(/nothing was written/i);
  });

  /** Server unreachable, reached but timed out, connection closed: same guarantee. */
  it('answers the rest of the unreachable-database family the same way', async () => {
    for (const code of ['P1001', 'P1008', 'P1011', 'P1017']) {
      expect(await get(`/throw/prisma/${code}`)).toMatchObject({ status: 503, code: 'UNAVAILABLE' });
    }
  });

  /**
   * The header is the only part of this a caller can act on: a saturated pool clears by
   * itself in seconds, which is exactly the difference from a 500.
   */
  it('sends Retry-After, because this one resolves on its own', async () => {
    const res = await app.inject({ method: 'GET', url: '/throw/prisma/P2037' });
    expect(res.headers['retry-after']).toBe('5');
  });

  /** Same trap as the transaction branch: mapping an error moves it out of the branch that logged. */
  it('still LOGS it, so the next saturation is diagnosable', async () => {
    logged.length = 0;
    await get('/throw/prisma/P2037');
    expect(logged).toHaveLength(1);
    expect(logged[0]?.code).toBe('P2037');
  });

  /**
   * UNAVAILABLE is not TIMEOUT on purpose. TIMEOUT names a transaction that started and
   * was rolled back; this one never reached a transaction. Collapsing them would send
   * whoever reads a screenshot looking for a slow query instead of a saturated server.
   */
  it('does not collapse into TIMEOUT, which names a different cause', async () => {
    expect((await get('/throw/prisma/P2024')).code).toBe('TIMEOUT');
    expect((await get('/throw/prisma/P2037')).code).toBe('UNAVAILABLE');
  });
});

describe('error handler — the database-unusable branch, keyed on what Prisma really sends', () => {
  /**
   * THE BUG THIS PINS. Prisma 7 converts errors down two paths: a model call
   * (`prisma.user.findFirst`) surfaces `P2037`, but a RAW statement surfaces `P2010` with
   * the Postgres code buried in a message string. Both carry the same
   * `meta.driverAdapterError.cause.kind`.
   *
   * A branch keyed on the code alone would leave a saturation hit on a raw statement still
   * answering 500.
   */
  it('answers a saturated database on the RAW path too, where the code is P2010', async () => {
    const res = await get('/throw/adapter/P2010/TooManyConnections');
    expect(res.status).toBe(503);
    expect(res.code).toBe('UNAVAILABLE');
  });

  it('recognises the rest of the adapter kinds, whatever code they arrive under', async () => {
    for (const kind of ['ConnectionClosed', 'DatabaseNotReachable', 'SocketTimeout']) {
      expect(await get(`/throw/adapter/P2010/${kind}`)).toMatchObject({
        status: 503,
        code: 'UNAVAILABLE',
      });
    }
  });

  /**
   * P1002 does not exist in Prisma 7 — `getErrorCode()` never emits it. The first version of
   * this branch mapped it, which was dead code, while the real "reached but timed out"
   * (`P1008`, `SocketTimeout`) fell through to a 500.
   */
  it('maps P1008, the code that actually exists, and not the one that does not', async () => {
    expect(await get('/throw/prisma/P1008')).toMatchObject({ status: 503, code: 'UNAVAILABLE' });
    expect(await get('/throw/prisma/P1002')).toMatchObject({ status: 500, code: 'INTERNAL' });
  });

  /**
   * A raw query can fail for reasons that have nothing to do with the connection — a syntax
   * error, a constraint. Those are OUR bug, not a passing outage, and telling the operator
   * to retry in a few seconds would send them in circles.
   */
  it('does not turn every P2010 into a retry: without a connection kind it stays a 500', async () => {
    expect(await get('/throw/prisma/P2010')).toMatchObject({ status: 500, code: 'INTERNAL' });
    expect(await get('/throw/adapter/P2010/GenericJs')).toMatchObject({
      status: 500,
      code: 'INTERNAL',
    });
  });

  /**
   * Credentials being wrong does not clear by itself, so answering "try again in a few
   * seconds" would be a lie that hides a misconfiguration behind a retry loop.
   */
  it('leaves auth failures on the catch-all, because those do not self-heal', async () => {
    expect(await get('/throw/prisma/P1000')).toMatchObject({ status: 500, code: 'INTERNAL' });
    expect(await get('/throw/prisma/P1010')).toMatchObject({ status: 500, code: 'INTERNAL' });
  });

  it('keeps the pool timeout on TIMEOUT, which names a different cause', async () => {
    expect((await get('/throw/prisma/P2024')).code).toBe('TIMEOUT');
  });
});
