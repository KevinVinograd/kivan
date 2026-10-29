import { describe, expect, it } from 'vitest'

import { ApiError } from '@/api/client'
import { failureFor } from './cobros-generar-mes-outcome'

describe('failureFor', () => {
  const ROLLED_BACK = [400, 401, 403, 404, 409, 413, 422, 429]

  it.each(ROLLED_BACK)('says nothing was generated for a %i the API mints itself', (status) => {
    const failure = failureFor(new ApiError(status, 'Unique constraint violation'))
    expect(failure.description).toContain('No se generó ningún cobro')
    expect(failure.nothingWritten).toBe(true)
    expect(failure.title).not.toBe('')
  })

  it('never claims the batch was rolled back when the response was lost', () => {
    for (const status of [0, 502, 503, 504]) {
      const failure = failureFor(new ApiError(status, 'Network request failed'))
      expect(failure.description).not.toContain('No se generó ningún cobro')
      expect(failure.description).toContain('Recargá')
      expect(failure.nothingWritten).toBe(false)
    }
  })

  it('treats a 500 as indeterminate, not as a rollback', () => {
    const failure = failureFor(new ApiError(500, 'Internal server error'))
    expect(failure.description).not.toContain('No se generó ningún cobro')
    expect(failure.description).toContain('Recargá')
    expect(failure.nothingWritten).toBe(false)
  })

  it('reports a post-response throw as cobros that may EXIST', () => {
    const failure = failureFor(new TypeError('Cannot read properties of undefined'))
    expect(failure.title).toContain('pueden haberse generado')
    expect(failure.description).toContain('Recargá')
    expect(failure.description).not.toContain('No se generó ningún cobro')
    expect(failure.nothingWritten).toBe(false)
  })

  it('only claims a rollback where one is proven', () => {
    const indeterminate = [0, 500, 502, 503, 504].map((s) => failureFor(new ApiError(s, 'x')))
    expect(indeterminate.every((f) => f.nothingWritten === false)).toBe(true)
    expect(failureFor(new TypeError('x')).nothingWritten).toBe(false)
  })

  it('reads OUR 503 timeout envelope as a proven rollback, and a bare 503 as indeterminate', () => {
    const ours = new ApiError(503, 'The operation ran out of time and was rolled back', {
      error: { code: 'TIMEOUT', message: 'The operation ran out of time and was rolled back' },
    })
    expect(failureFor(ours).nothingWritten).toBe(true)
    expect(failureFor(ours).description).toContain('No se generó ningún cobro')

    const proxy = new ApiError(503, 'Service Unavailable')
    expect(failureFor(proxy).nothingWritten).toBe(false)
    expect(failureFor(proxy).description).toContain('Recargá')

    const other = new ApiError(503, 'nope', { error: { code: 'INTERNAL', message: 'nope' } })
    expect(failureFor(other).nothingWritten).toBe(false)
  })

  it('carries the server message and the status, so a production failure can be read off a screenshot', () => {
    const failure = failureFor(new ApiError(409, 'Unique constraint violation'))
    expect(failure.description).toContain('Unique constraint violation')
    expect(failure.description).toContain('HTTP 409')
  })

  it('separates the causes an operator acts on differently', () => {
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
      expect(title).not.toContain('—')
      expect(description).not.toContain('—')
      expect(title.endsWith('.')).toBe(false)
      expect(description.endsWith('.')).toBe(false)
    }
  })
})

describe('failureFor — the 503 for a database that could not be used', () => {
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
    const failure = failureFor(unavailable())
    expect(failure.description).toMatch(/esperá unos segundos/i)
    expect(failure.description).not.toMatch(/tandas/i)
    expect(failure.title).not.toBe(failureFor(
      new ApiError(503, 'x', { error: { code: 'TIMEOUT', message: 'x' } }),
    ).title)
  })

  it('still refuses a 503 that is not ours, however similar it looks', () => {
    expect(failureFor(new ApiError(503, 'Service Unavailable')).nothingWritten).toBe(false)
    expect(
      failureFor(new ApiError(503, 'x', { error: { code: 'INTERNAL', message: 'x' } }))
        .nothingWritten,
    ).toBe(false)
  })
})
