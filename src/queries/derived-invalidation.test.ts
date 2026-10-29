import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const listeners: Array<(write: { method: string; path: string }) => void> = []
vi.mock('@/api/client', () => ({
  onApiWrite: (listener: (write: { method: string; path: string }) => void) => {
    listeners.push(listener)
    return () => listeners.splice(listeners.indexOf(listener), 1)
  },
}))

const { DERIVED_READ_MODELS, WRITE_BURST_MS, invalidateDerivedOnWrite } = await import('./derived-invalidation')
const { queryKeys } = await import('./keys')

const write = (path: string, method = 'POST') => listeners.forEach((listener) => listener({ method, path }))

describe('invalidateDerivedOnWrite', () => {
  let client: QueryClient
  const invalidate = vi.fn<(filters: { queryKey?: unknown }) => Promise<void>>()
  let off: () => void

  beforeEach(() => {
    vi.useFakeTimers()
    client = new QueryClient()
    invalidate.mockReset().mockResolvedValue(undefined)
    client.invalidateQueries = invalidate as unknown as QueryClient['invalidateQueries']
    off = invalidateDerivedOnWrite(client)
  })

  afterEach(() => {
    off()
    vi.useRealTimers()
  })

  const invalidatedKeys = () => invalidate.mock.calls.map(([filters]) => JSON.stringify(filters.queryKey))

  it('refreshes every derived read model once per burst of writes', () => {
    write('/productions/approval')
    write('/productions/approval')
    write('/team-members/tm-1/time-entries')
    expect(invalidate).not.toHaveBeenCalled()

    vi.advanceTimersByTime(WRITE_BURST_MS)
    expect(invalidatedKeys()).toEqual(DERIVED_READ_MODELS.map((key) => JSON.stringify(key)))
  })

  it('leaves the cobros alone unless a client record changed', () => {
    write('/receivables/r-1/collect')
    vi.advanceTimersByTime(WRITE_BURST_MS)
    expect(invalidatedKeys()).not.toContain(JSON.stringify(queryKeys.receivables.all))

    invalidate.mockClear()
    write('/clients/c-1', 'PUT')
    vi.advanceTimersByTime(WRITE_BURST_MS)
    expect(invalidatedKeys()).toContain(JSON.stringify(queryKeys.receivables.all))
  })

  it('reports covers every report, the ficha month included', () => {
    expect(queryKeys.reports.clientMonth('c-1', '2026-10-01').slice(0, 1)).toEqual(queryKeys.reports.all)
  })
})
