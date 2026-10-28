import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { apiClient, ApiError, onApiWrite } from './client'
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from './token'

/**
 * Unit tests for the API client's auth-critical behavior: the transparent 401
 * refresh, the single-flight rotation (concurrent 401s share ONE refresh, because
 * the refresh token is single-use), the `_retried` loop guard, and body/error
 * normalization. Runs in the node `unit` project with a mocked global `fetch` and
 * the in-memory token holder (no window → localStorage is a no-op).
 *
 * env.apiUrl defaults to http://localhost:3010 (VITE_API_URL unset in tests).
 */

const BASE = 'http://localhost:3010'

/** A mocked `fetch`, typed for the two-arg shape the client always calls. */
type FetchMock = ReturnType<typeof vi.fn<(url: string, init: RequestInit) => Promise<Response>>>
let fetchMock: FetchMock

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain' } })
}

/** Read the headers object the client sent on the i-th fetch call. */
function sentHeaders(i: number): Record<string, string> {
  return fetchMock.mock.calls[i][1].headers as Record<string, string>
}

function calledUrls(): string[] {
  return fetchMock.mock.calls.map(([url]) => url)
}

beforeEach(() => {
  fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>()
  vi.stubGlobal('fetch', fetchMock)
  setTokens('access-1', 'refresh-1')
})

afterEach(() => {
  vi.unstubAllGlobals()
  clearTokens()
})

describe('apiClient — happy path', () => {
  it('returns the parsed JSON body and sends the bearer + accept headers', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'x', name: 'Uno' }))

    const result = await apiClient.get<{ id: string; name: string }>('/things/x')

    expect(result).toEqual({ id: 'x', name: 'Uno' })
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/things/x`)
    expect(sentHeaders(0).Authorization).toBe('Bearer access-1')
    expect(sentHeaders(0).Accept).toBe('application/json')
  })

  it('serializes a POST body and sets Content-Type', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))

    await apiClient.post('/things', { name: 'a' })

    const init = fetchMock.mock.calls[0][1]
    expect(init.method).toBe('POST')
    expect(sentHeaders(0)['Content-Type']).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ name: 'a' }))
  })

  it('appends defined query params and skips undefined ones', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]))

    await apiClient.get('/things', { params: { period: '2026-06', q: undefined } })

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/things?period=2026-06`)
  })

  it('routes put/delete to the right method and omits the body + Content-Type when there is no body', async () => {
    // A fresh Response per call — a Response body can only be read once.
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })))

    await apiClient.put('/things/1', { a: 1 })
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT')
    expect(sentHeaders(0)['Content-Type']).toBe('application/json')

    await apiClient.delete('/things/1')
    const del = fetchMock.mock.calls[1][1]
    expect(del.method).toBe('DELETE')
    expect(del.body).toBeUndefined() // no body spread
    expect(sentHeaders(1)['Content-Type']).toBeUndefined() // no Content-Type without a body
  })
})

describe('apiClient — 401 refresh', () => {
  it('refreshes once on 401 and retries the request with the new bearer', async () => {
    setTokens('old-access', 'refresh-1')
    fetchMock
      .mockResolvedValueOnce(textResponse('', 401)) // original request → 401
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'new-access', refreshToken: 'new-refresh' })) // /auth/refresh
      .mockResolvedValueOnce(jsonResponse({ id: 'ok' })) // retried request → 200

    const result = await apiClient.get<{ id: string }>('/secure')

    expect(result).toEqual({ id: 'ok' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[1][0]).toBe(`${BASE}/auth/refresh`)
    expect(sentHeaders(2).Authorization).toBe('Bearer new-access') // retry carries the rotated token
    expect(getAccessToken()).toBe('new-access')
    expect(getRefreshToken()).toBe('new-refresh') // the single-use refresh token is rotated + persisted
  })

  it('throws ApiError(401) and clears tokens when the refresh fails (no retry loop)', async () => {
    setTokens('old-access', 'refresh-1')
    fetchMock
      .mockResolvedValueOnce(textResponse('', 401)) // original → 401
      .mockResolvedValueOnce(textResponse('', 401)) // /auth/refresh → not ok

    const error = await apiClient.get('/secure').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 401, message: 'Request failed with status 401' })
    expect(fetchMock).toHaveBeenCalledTimes(2) // original + refresh, never a third
    expect(getAccessToken()).toBeNull() // a backend-rejected refresh (non-ok) clears tokens
  })

  it('retains tokens when the refresh REQUEST fails transiently (network drop)', async () => {
    setTokens('old-access', 'refresh-1')
    fetchMock
      .mockResolvedValueOnce(textResponse('', 401)) // original → 401
      .mockRejectedValueOnce(new Error('offline')) // /auth/refresh fetch rejects (transient)

    const error = await apiClient.get('/secure').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 401 })
    // A TRANSIENT refresh failure must NOT log the user out — tokens are retained so a
    // later attempt can succeed. This is the opposite of the non-ok (rejected) branch above.
    expect(getAccessToken()).toBe('old-access')
    expect(getRefreshToken()).toBe('refresh-1')
    expect(fetchMock).toHaveBeenCalledTimes(2) // original + refresh, no retry
  })

  it('retains tokens when the refresh body is malformed (res.json() throws)', async () => {
    setTokens('old-access', 'refresh-1')
    fetchMock
      .mockResolvedValueOnce(textResponse('', 401)) // original → 401
      // 200 but the body is not valid JSON while claiming application/json → res.json() throws
      .mockResolvedValueOnce(
        new Response('<<not json>>', { status: 200, headers: { 'content-type': 'application/json' } }),
      )

    await expect(apiClient.get('/secure')).rejects.toMatchObject({ status: 401 })

    expect(getAccessToken()).toBe('old-access') // catch branch does not clear (transient)
    expect(getRefreshToken()).toBe('refresh-1')
  })

  it('re-refreshes on a later, independent 401 (the in-flight promise resets)', async () => {
    setTokens('access-0', 'refresh-0')
    // Two sequential request→401→refresh→200 cycles. If the single-flight `.finally`
    // reset were dropped, the second 401 would reuse the settled promise and NOT rotate,
    // so only one /auth/refresh would fire and this assertion would fail.
    fetchMock
      .mockResolvedValueOnce(textResponse('', 401)) // A original → 401
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'access-1', refreshToken: 'refresh-1' })) // refresh #1
      .mockResolvedValueOnce(jsonResponse({ ok: 'A' })) // A retry → 200
      .mockResolvedValueOnce(textResponse('', 401)) // B original → 401
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'access-2', refreshToken: 'refresh-2' })) // refresh #2
      .mockResolvedValueOnce(jsonResponse({ ok: 'B' })) // B retry → 200

    expect(await apiClient.get('/a')).toEqual({ ok: 'A' })
    expect(await apiClient.get('/b')).toEqual({ ok: 'B' })

    const refreshCalls = calledUrls().filter((u) => u.endsWith('/auth/refresh'))
    expect(refreshCalls).toHaveLength(2) // the reset let the second, independent 401 rotate again
  })

  it('does not attempt a refresh when there is no refresh token', async () => {
    setTokens('old-access', null)
    fetchMock.mockResolvedValueOnce(textResponse('', 401))

    await expect(apiClient.get('/secure')).rejects.toMatchObject({ status: 401 })

    expect(fetchMock).toHaveBeenCalledTimes(1) // doRefresh short-circuits before fetching
  })

  it('does not refresh a second time when the retried request also 401s (_retried guard)', async () => {
    setTokens('old-access', 'refresh-1')
    fetchMock
      .mockResolvedValueOnce(textResponse('', 401)) // original → 401
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'new-access', refreshToken: 'new-refresh' })) // refresh ok
      .mockResolvedValueOnce(textResponse('', 401)) // retry → STILL 401

    await expect(apiClient.get('/secure')).rejects.toMatchObject({ status: 401 })

    expect(fetchMock).toHaveBeenCalledTimes(3) // original + refresh + one retry, then stop
  })

  it('deduplicates concurrent 401s into a single refresh (single-flight)', async () => {
    setTokens('old-access', 'refresh-1')
    // 401 while the request carries the OLD bearer; 200 once it carries the rotated one;
    // /auth/refresh always succeeds. This lets N concurrent requests each 401, share one
    // rotation, then all retry with the new token.
    fetchMock.mockImplementation((url, init) => {
      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve(jsonResponse({ accessToken: 'new-access', refreshToken: 'new-refresh' }))
      }
      const auth = (init.headers as Record<string, string>).Authorization
      if (auth === 'Bearer new-access') return Promise.resolve(jsonResponse({ url }))
      return Promise.resolve(textResponse('', 401))
    })

    const results = await Promise.all([
      apiClient.get<{ url: string }>('/a'),
      apiClient.get<{ url: string }>('/b'),
      apiClient.get<{ url: string }>('/c'),
    ])

    expect(results).toEqual([{ url: `${BASE}/a` }, { url: `${BASE}/b` }, { url: `${BASE}/c` }])
    const refreshCalls = calledUrls().filter((u) => u.endsWith('/auth/refresh'))
    expect(refreshCalls).toHaveLength(1) // ONE rotation shared across the three 401s
    // and every retried (200) request carried the rotated bearer
    const retryBearers = fetchMock.mock.calls
      .filter(([url]) => !url.endsWith('/auth/refresh'))
      .map(([, init]) => (init.headers as Record<string, string>).Authorization)
    expect(retryBearers.filter((a) => a === 'Bearer new-access')).toHaveLength(3)
  })

  it('shares ONE refresh across concurrent 401s even when that refresh FAILS (no token reuse)', async () => {
    setTokens('old-access', 'refresh-1')
    // The single-use hazard: concurrent 401s must not each fire /auth/refresh (that would
    // replay the single-use token and trip backend reuse-detection). Here the shared refresh
    // itself fails, so all three reject — but /auth/refresh is still hit exactly once.
    fetchMock.mockImplementation(() => Promise.resolve(textResponse('', 401)))

    const settled = await Promise.allSettled([
      apiClient.get('/a'),
      apiClient.get('/b'),
      apiClient.get('/c'),
    ])

    expect(settled.every((r) => r.status === 'rejected')).toBe(true)
    for (const r of settled) {
      expect((r as PromiseRejectedResult).reason).toMatchObject({ status: 401 })
    }
    const refreshCalls = calledUrls().filter((u) => u.endsWith('/auth/refresh'))
    expect(refreshCalls).toHaveLength(1) // ONE shared refresh attempt, not three
    expect(getAccessToken()).toBeNull() // the non-ok refresh cleared tokens (once)
  })
})

describe('apiClient — errors & body handling', () => {
  it('wraps a network failure as ApiError(0)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('boom'))

    await expect(apiClient.get('/x')).rejects.toMatchObject({
      status: 0,
      message: 'Network request failed',
    })
  })

  it('extracts the server error message on a 4xx', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: 'Nombre requerido' } }, 422))

    await expect(apiClient.get('/x')).rejects.toMatchObject({
      status: 422,
      message: 'Nombre requerido',
    })
  })

  it('falls back to a status message when the error body has no message', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ nope: true }, 500))

    await expect(apiClient.get('/x')).rejects.toMatchObject({
      status: 500,
      message: 'Request failed with status 500',
    })
  })

  it('returns text for a non-JSON 200 and null for an empty body', async () => {
    fetchMock.mockResolvedValueOnce(textResponse('hello', 200))
    expect(await apiClient.get('/x')).toBe('hello')

    fetchMock.mockResolvedValueOnce(textResponse('', 200))
    expect(await apiClient.get('/y')).toBeNull()
  })

  it('throws an ApiError instance (not a plain Error)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: 'x' } }, 400))
    await expect(apiClient.get('/x')).rejects.toBeInstanceOf(ApiError)
  })
})

describe('apiClient — Zod response validation', () => {
  const thing = z.object({ id: z.string(), status: z.enum(['active', 'paused']) })

  it('parses and returns the validated body when a schema is provided', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'x', status: 'active' }))

    const result = await apiClient.get('/things/x', { schema: thing })

    expect(result).toEqual({ id: 'x', status: 'active' })
  })

  it('rejects when the success body violates the schema (contract drift)', async () => {
    // A 200 whose enum value is not in the contract must throw at the boundary rather
    // than flow into React state as a wrong badge/label far from the cause.
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'x', status: 'DELETED' }))

    await expect(apiClient.get('/things/x', { schema: thing })).rejects.toThrow()
  })
})

describe('onApiWrite', () => {
  it('announces a confirmed write and nothing else', async () => {
    const seen: string[] = []
    const off = onApiWrite(({ method, path }) => seen.push(`${method} ${path}`))
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ id: 'x' }))
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'nope' } }, 409))

    await apiClient.get('/things/x')
    await apiClient.post('/things', { name: 'Uno' })
    await expect(apiClient.patch('/things/x', { name: 'Dos' })).rejects.toBeInstanceOf(ApiError)
    off()

    // The GET is a read and the 409 changed nothing: only the 2xx POST is a write.
    expect(seen).toEqual(['POST /things'])
  })

  it('never turns a committed write into a failure when a listener throws', async () => {
    const off = onApiWrite(() => {
      throw new Error('listener bug')
    })
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'x' }))
    await expect(apiClient.post('/things', {})).resolves.toEqual({ id: 'x' })
    off()
  })
})
