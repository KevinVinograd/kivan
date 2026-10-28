import { describe, expect, it } from 'vitest'
import { ZodError } from 'zod'

import { ApiError } from '@/api/client'
import { queryClient } from './queryClient'

/**
 * Unit tests for the shared QueryClient's retry policy: 4xx client errors and
 * ZodErrors (deterministic contract-drift) are not retried (they will not succeed on
 * a repeat), while transient failures (5xx, network, other non-ApiError) retry up to
 * the default cap. Mutations never retry.
 */

const retry = queryClient.getDefaultOptions().queries?.retry as (
  failureCount: number,
  error: Error,
) => boolean

describe('queryClient retry predicate', () => {
  it('never retries a 4xx ApiError', () => {
    expect(retry(0, new ApiError(400, 'bad request'))).toBe(false)
    expect(retry(0, new ApiError(404, 'not found'))).toBe(false)
    expect(retry(1, new ApiError(422, 'unprocessable'))).toBe(false)
  })

  it('retries a 5xx ApiError until the failure count reaches the cap', () => {
    expect(retry(0, new ApiError(500, 'server error'))).toBe(true)
    expect(retry(1, new ApiError(503, 'unavailable'))).toBe(true)
    expect(retry(2, new ApiError(500, 'server error'))).toBe(false)
  })

  it('retries a network ApiError (status 0)', () => {
    expect(retry(0, new ApiError(0, 'Network request failed'))).toBe(true)
    expect(retry(2, new ApiError(0, 'Network request failed'))).toBe(false)
  })

  it('retries a non-ApiError error while under the cap', () => {
    expect(retry(0, new Error('weird'))).toBe(true)
    expect(retry(1, new Error('weird'))).toBe(true)
    expect(retry(2, new Error('weird'))).toBe(false)
  })

  it('never retries a ZodError (contract drift is deterministic)', () => {
    // A failed response-schema parse throws a ZodError at the fetch boundary; the same
    // drifted body would fail identically on every attempt, so it must not be retried.
    const drift = new ZodError([])
    expect(retry(0, drift)).toBe(false)
    expect(retry(1, drift)).toBe(false)
  })

  it('never retries mutations', () => {
    expect(queryClient.getDefaultOptions().mutations?.retry).toBe(false)
  })
})
