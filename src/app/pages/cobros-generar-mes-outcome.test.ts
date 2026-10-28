import { describe, expect, it } from 'vitest'

import { ApiError } from '@/api/client'
import { failureFor } from './cobros-generar-mes-outcome'

/**
 * The property under test is HONESTY, not wording: a failed generation run must never claim
 * to know something it does not. Three doors reach this function and only one of them proves
 * the batch did not land, so the assertions below are grouped by what each door may assert.
 */
describe('failureFor', () => {
  const ROLLED_BACK = [400, 401, 403, 404, 409, 413, 422, 429]

  it.each(ROLLED_BACK)('says nothing was generated for a %i the API mints itself', (status) => {
    const failure = failureFor(new ApiError(status, 'Unique constraint violation'))
    // Every one of these is a typed AppError raised before or inside the transaction, so
    // Postgres rolled the batch back. Saying so is what lets the operator fix the cause
    // and press the button again.
    expect(failure.description).toContain('No se generó ningún cobro')
    expect(failure.nothingWritten).toBe(true)
    expect(failure.title).not.toBe('')
  })

  it('never claims the batch was rolled back when the response was lost', () => {
    // Status 0 is `client.ts` reporting that fetch itself rejected: the request may have
    // been served and lost on the way back. A gateway wrote the 502 without knowing what
    // happened behind it. Neither one licenses "no se generó ningún cobro".
    for (const status of [0, 502, 503, 504]) {
      const failure = failureFor(new ApiError(status, 'Network request failed'))
      expect(failure.description).not.toContain('No se generó ningún cobro')
      expect(failure.description).toContain('Recargá')
      expect(failure.nothingWritten).toBe(false)
    }
  })

  it('treats a 500 as indeterminate, not as a rollback', () => {
    // 500 is the error handler's CATCH-ALL, so it is the one status that means the server
    // does not know what happened: a `reply.send()` throw fires after the transaction already
    // committed, and a failure at COMMIT time is indeterminate by nature. Reading it as
    // "nothing was written" is exactly the unearned claim this module refuses.
    const failure = failureFor(new ApiError(500, 'Internal server error'))
    expect(failure.description).not.toContain('No se generó ningún cobro')
    expect(failure.description).toContain('Recargá')
    expect(failure.nothingWritten).toBe(false)
  })

  it('reports a post-response throw as cobros that may EXIST', () => {
    // The server already answered; the throw is from our own code afterwards. Telling the
    // operator nothing was created is the mirror of the phantom-write bug, and it invites a
    // second click on a month that is already billed.
    const failure = failureFor(new TypeError('Cannot read properties of undefined'))
    expect(failure.title).toContain('pueden haberse generado')
    expect(failure.description).toContain('Recargá')
    expect(failure.description).not.toContain('No se generó ningún cobro')
    expect(failure.nothingWritten).toBe(false)
  })

  it('only claims a rollback where one is proven', () => {
    // The invariant in one line: `nothingWritten` is the licence for both the sentence and
    // the re-armed button, so it must never be true for an outcome we cannot resolve.
    const indeterminate = [0, 500, 502, 503, 504].map((s) => failureFor(new ApiError(s, 'x')))
    expect(indeterminate.every((f) => f.nothingWritten === false)).toBe(true)
    expect(failureFor(new TypeError('x')).nothingWritten).toBe(false)
  })

  it('reads OUR 503 timeout envelope as a proven rollback, and a bare 503 as indeterminate', () => {
    // P2028 is the one production failure this dialog has actually seen: the batch outgrew
    // Prisma's interactive-transaction budget, which EXPIRES the transaction before COMMIT.
    // Postgres therefore rolled it back, and that is provable rather than assumed, so the
    // operator can be told nothing was billed and handed the button back.
    //
    // The proof is the ENVELOPE, not the status. Only this API mints
    // `{ error: { code: 'TIMEOUT' } }`; a 503 from whatever sits in front of it is a bare
    // body and keeps the honest "we cannot tell" above, which is why both live in one test.
    const ours = new ApiError(503, 'The operation ran out of time and was rolled back', {
      error: { code: 'TIMEOUT', message: 'The operation ran out of time and was rolled back' },
    })
    expect(failureFor(ours).nothingWritten).toBe(true)
    expect(failureFor(ours).description).toContain('No se generó ningún cobro')

    const proxy = new ApiError(503, 'Service Unavailable')
    expect(failureFor(proxy).nothingWritten).toBe(false)
    expect(failureFor(proxy).description).toContain('Recargá')

    // A 503 whose envelope says something else is not the timeout either.
    const other = new ApiError(503, 'nope', { error: { code: 'INTERNAL', message: 'nope' } })
    expect(failureFor(other).nothingWritten).toBe(false)
  })

  it('carries the server message and the status, so a production failure can be read off a screenshot', () => {
    const failure = failureFor(new ApiError(409, 'Unique constraint violation'))
    expect(failure.description).toContain('Unique constraint violation')
    expect(failure.description).toContain('HTTP 409')
  })

  it('separates the causes an operator acts on differently', () => {
    // The whole point of the change: these used to be one sentence. If two of them collapse
    // back into the same title, the operator is again unable to tell a permission problem
    // from a rate limit from a server fault.
    const titles = [401, 403, 409, 429, 400, 500].map((s) => failureFor(new ApiError(s, 'x')).title)
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('follows the copy rules for every branch', () => {
    const all = [
      ...[0, 400, 401, 403, 404, 409, 413, 422, 429, 500, 502].map((s) => failureFor(new ApiError(s, 'x'))),
      failureFor(new ApiError(503, 'x', { error: { code: 'TIMEOUT', message: 'x' } })),
      failureFor(new TypeError('x')),
    ]
    for (const { title, description } of all) {
      // C1: the em dash is banned in every UI-facing string.
      expect(title).not.toContain('—')
      expect(description).not.toContain('—')
      // the convention: toast strings carry no trailing period.
      expect(title.endsWith('.')).toBe(false)
      expect(description.endsWith('.')).toBe(false)
    }
  })
})

describe('failureFor — the 503 for a database that could not be used', () => {
  /**
   * WHAT THIS CATCHES. The API started minting `503 UNAVAILABLE` on 2026-09-05, for a
   * database it could not connect to. Until this branch existed, that envelope failed every
   * check in the module and landed in the indeterminate band — so the toast read "No sabemos
   * si los cobros se generaron / Recargá la página y fijate", and then appended the server's
   * own words to the same sentence: "nothing was written". The screen contradicted itself in
   * one paragraph, and the retry button stayed disabled for a retry that was provably safe.
   */
  const unavailable = () =>
    new ApiError(503, 'The database is temporarily unavailable and nothing was written.', {
      error: {
        code: 'UNAVAILABLE',
        message: 'The database is temporarily unavailable and nothing was written.',
      },
    })

  it('claims the rollback, because this 503 proves it', () => {
    const failure = failureFor(unavailable())
    expect(failure.nothingWritten).toBe(true)
    expect(failure.description).toContain('No se generó ningún cobro')
  })

  it('points at waiting, not at splitting the month', () => {
    // The timeout's advice is to halve the batch. Repeating it here would send the operator
    // to do work that changes nothing: the transaction never started, and a smaller one
    // would not have started either.
    const failure = failureFor(unavailable())
    expect(failure.description).toMatch(/esperá unos segundos/i)
    expect(failure.description).not.toMatch(/tandas/i)
    expect(failure.title).not.toBe(failureFor(
      new ApiError(503, 'x', { error: { code: 'TIMEOUT', message: 'x' } }),
    ).title)
  })

  it('still refuses a 503 that is not ours, however similar it looks', () => {
    // The whole point of reading the envelope: a proxy's 503 knows nothing about what
    // happened behind it, so it cannot claim a rollback no matter what status it carries.
    expect(failureFor(new ApiError(503, 'Service Unavailable')).nothingWritten).toBe(false)
    expect(
      failureFor(new ApiError(503, 'x', { error: { code: 'INTERNAL', message: 'x' } }))
        .nothingWritten,
    ).toBe(false)
  })
})
