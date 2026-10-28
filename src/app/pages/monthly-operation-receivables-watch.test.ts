import { describe, expect, it } from 'vitest'

import { nextReceivablesWatch } from './monthly-operation-receivables-watch'

/**
 * The guard that keeps `/dashboard` § Pendientes críticos from listing a cobro that was
 * already collected on `/cobros`. Every case below is one of the two ways this can be
 * wrong: refreshing when it must not (a GET per app start), or not refreshing when it
 * must (the reported bug).
 */
describe('nextReceivablesWatch', () => {
  it('does not refresh while the receivables store has no data', () => {
    expect(nextReceivablesWatch(0, 0)).toEqual({ seen: 0, refresh: false })
  })

  it('adopts the first timestamp without refreshing (the store initial load)', () => {
    expect(nextReceivablesWatch(0, 1_000)).toEqual({ seen: 1_000, refresh: false })
  })

  it('refreshes when the cache advances after that first load', () => {
    expect(nextReceivablesWatch(1_000, 1_001)).toEqual({ seen: 1_001, refresh: true })
  })

  it('does not refresh on a re-render that carries the same timestamp', () => {
    expect(nextReceivablesWatch(1_000, 1_000)).toEqual({ seen: 1_000, refresh: false })
  })

  it('ignores a timestamp that moved backwards', () => {
    expect(nextReceivablesWatch(1_000, 900)).toEqual({ seen: 1_000, refresh: false })
  })

  it('refreshes once per advance across a sequence of writes', () => {
    const stamps = [0, 1_000, 1_000, 1_010, 1_010, 1_020]
    let seen = 0
    const refreshes: number[] = []
    for (const updatedAt of stamps) {
      const next = nextReceivablesWatch(seen, updatedAt)
      seen = next.seen
      if (next.refresh) refreshes.push(updatedAt)
    }
    expect(refreshes).toEqual([1_010, 1_020])
    expect(seen).toBe(1_020)
  })
})
