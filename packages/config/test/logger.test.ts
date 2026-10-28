/**
 * The logger's two contractual promises, asserted on the REAL exported instance:
 * every line names a user, and no line carries a secret.
 *
 * WHY THIS FILE EXISTS. Both promises fail SILENTLY. A production log with no `userId`
 * looks perfectly healthy — it just cannot answer "who did this", which is the question
 * asked the moment something goes wrong (it was asked here, of a log where no line named
 * anyone). A redact path with a typo looks equally healthy right up to the moment a
 * password sits in the log forever. Neither shows up in a typecheck, a build, or any
 * other test in this repo.
 *
 * Reading the real logger's output needs the stream swapped, which pino has no API for.
 * `pino.symbols` is its documented escape hatch, and assigning `streamSym` as an OWN
 * property shadows the inherited destination for that ONE logger — so the redaction,
 * serializers and bindings under test are the ones the API actually runs with, not a
 * lookalike rebuilt from copied options.
 */
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { bindUser, childLogger, logger, type Logger } from '../src/logger.js';

/** Captures what `log` writes, by shadowing just this instance's destination. */
function capture(log: Logger): string[] {
  const lines: string[] = [];
  (log as unknown as Record<symbol, unknown>)[pino.symbols.streamSym] = {
    write: (line: string) => lines.push(line),
  };
  return lines;
}

function logOne(log: Logger, obj: object, msg = 'test line'): Record<string, unknown> {
  const lines = capture(log);
  log.error(obj, msg);
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0] as string) as Record<string, unknown>;
}

describe('every line names a user', () => {
  it('tags the process logger with anon, so a line with no session is still attributable', () => {
    expect(logOne(logger, {}).userId).toBe('anon');
  });

  it('binds the real user id when there is one', () => {
    expect(logOne(childLogger('user-42'), {}).userId).toBe('user-42');
  });

  it('falls back to anon for a null/undefined id instead of dropping the field', () => {
    // The callers below the route layer hold `string | null` (an actor that may be the
    // system). Dropping the key there would put the un-attributable lines back.
    expect(logOne(childLogger(null), {}).userId).toBe('anon');
    expect(logOne(childLogger(undefined), {}).userId).toBe('anon');
  });

  it('writes userId exactly ONCE', () => {
    // pino APPENDS a child's bindings to its parent's rather than replacing them, so a
    // logger that carries the anon default and is later rebound to the real caller emits
    // the key twice in a single JSON object. Last-one-wins saves most consumers, but not
    // the one that keeps the first — and `{"userId":"anon","userId":"u"}` reads as anon
    // to a human scanning the log.
    for (const log of [logger, childLogger('user-42')]) {
      const lines = capture(log);
      log.error({}, 'once');
      expect(lines[0]?.match(/"userId"/g)).toHaveLength(1);
    }
  });

  it('is a no-op when the same user is bound twice, rather than a second userId', () => {
    // pino cannot UNbind, so a second child would append the key again. Nothing in the API
    // binds twice today (a request has one identity), which is exactly why the day someone
    // composes two preHandlers that both authenticate, this should stay silent and correct.
    const bound = childLogger('user-42');
    expect(bindUser(bound, 'user-42')).toBe(bound);
    const lines = capture(bound);
    bindUser(bound, 'user-42').error({}, 'once');
    expect(lines[0]?.match(/"userId"/g)).toHaveLength(1);
  });

  it('binds onto an existing logger without losing what it already carried', () => {
    // How the API uses it: the parent is the REQUEST's logger, which already carries the
    // reqId — and, more importantly, Fastify's req/res serializers. Binding the user must
    // extend that logger, never replace it with one built from the root.
    const requestLog = logger.child({ reqId: 'req-1' });
    const beforeAuth = logOne(requestLog, {});
    expect(beforeAuth).toMatchObject({ reqId: 'req-1', userId: 'anon' });

    const line = logOne(bindUser(requestLog, 'user-42'), {});
    expect(line).toMatchObject({ reqId: 'req-1', userId: 'user-42' });
  });
});

describe('no line carries a secret', () => {
  it('censors credential-shaped fields, at the top level and one level down', () => {
    const line = logOne(childLogger('user-42'), {
      password: 'hunter2',
      refreshToken: 'rt_live',
      body: { password: 'hunter2', token: 'invitation-token' },
    });
    expect(line.password).toBe('[redacted]');
    expect(line.refreshToken).toBe('[redacted]');
    expect(line.body).toEqual({ password: '[redacted]', token: '[redacted]' });
    expect(JSON.stringify(line)).not.toContain('hunter2');
    expect(JSON.stringify(line)).not.toContain('invitation-token');
  });

  it('censors the auth headers under the req serializer', () => {
    const line = logOne(childLogger('user-42'), {
      req: { headers: { authorization: 'Bearer eyJhbGciOi', cookie: 'session=abc', 'user-agent': 'curl' } },
    });
    expect(line.req).toEqual({
      headers: { authorization: '[redacted]', cookie: '[redacted]', 'user-agent': 'curl' },
    });
  });
});

describe('errors report the cause, not just the wrapper', () => {
  it('flattens the whole cause chain into the logged error', () => {
    // What Prisma does: a generic wrapper around the error that actually explains it.
    // Logging only the outer message says "failed" without saying why.
    const err = new Error('Failed query', { cause: new Error('duplicate key value violates unique constraint') });
    const line = logOne(childLogger('user-42'), { err }, 'write failed');
    const logged = line.err as { message: string; stack: string };
    expect(logged.message).toContain('duplicate key value');
    expect(logged.stack).toContain('caused by');
  });
});
