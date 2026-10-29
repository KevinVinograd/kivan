import { describe, expect, it } from 'vitest'

import { readOpenRef, withOpenRef, withoutOpenRef } from './reports-open-param'
import type { ReportDataset } from './reports-types'

function dataset(ids: {
  profitability?: string[]
  capacity?: string[]
  buckets?: string[]
}): ReportDataset {
  return {
    productivity: [],
    profitability: (ids.profitability ?? []).map((clientId) => ({ clientId })),
    capacity: (ids.capacity ?? []).map((personId) => ({ personId })),
    financials: {
      cobrosPorEstado: (ids.buckets ?? [])
        .filter((id) => id.startsWith('cobros-'))
        .map((id) => ({ id: id.slice('cobros-'.length) })),
      pagosPorEstado: (ids.buckets ?? [])
        .filter((id) => id.startsWith('pagos-'))
        .map((id) => ({ id: id.slice('pagos-'.length) })),
      facturacion: [],
      gastosFijosList: [],
    },
  } as unknown as ReportDataset
}

describe('readOpenRef', () => {
  it('returns null when there is no ?open=', () => {
    expect(readOpenRef(new URLSearchParams('tab=rentabilidad'), 'rentabilidad', dataset({ profitability: ['acme'] }))).toBeNull()
  })

  it('resolves a client ref on rentabilidad', () => {
    const params = new URLSearchParams('open=client:acme')
    expect(readOpenRef(params, 'rentabilidad', dataset({ profitability: ['acme', 'beta'] }))).toEqual({
      kind: 'client',
      id: 'acme',
    })
  })

  it('resolves a person ref on carga and on productividad', () => {
    const data = dataset({ capacity: ['ana'] })
    const params = new URLSearchParams('open=person:ana')
    expect(readOpenRef(params, 'carga', data)).toEqual({ kind: 'person', id: 'ana' })
    expect(readOpenRef(params, 'productividad', data)).toEqual({ kind: 'person', id: 'ana' })
  })

  it('resolves BOTH kinds on resumen (it has two tables)', () => {
    const data = dataset({ profitability: ['acme'], capacity: ['ana'] })
    expect(readOpenRef(new URLSearchParams('open=client:acme'), 'resumen', data)).toEqual({ kind: 'client', id: 'acme' })
    expect(readOpenRef(new URLSearchParams('open=person:ana'), 'resumen', data)).toEqual({ kind: 'person', id: 'ana' })
  })

  it('resolves a bucket ref on finanzas', () => {
    const data = dataset({ buckets: ['cobros-overdue'] })
    expect(readOpenRef(new URLSearchParams('open=bucket:cobros-overdue'), 'finanzas', data)).toEqual({
      kind: 'bucket',
      id: 'cobros-overdue',
    })
  })

  it('rejects a kind the active tab cannot open', () => {
    const data = dataset({ profitability: ['acme'], capacity: ['ana'] })
    expect(readOpenRef(new URLSearchParams('open=person:ana'), 'rentabilidad', data)).toBeNull()
    expect(readOpenRef(new URLSearchParams('open=client:acme'), 'carga', data)).toBeNull()
  })

  it('ignores a stale id the current period does not contain', () => {
    expect(readOpenRef(new URLSearchParams('open=client:gone'), 'rentabilidad', dataset({ profitability: ['acme'] }))).toBeNull()
  })

  it('rejects an unknown kind', () => {
    expect(readOpenRef(new URLSearchParams('open=alien:acme'), 'rentabilidad', dataset({ profitability: ['acme'] }))).toBeNull()
  })

  it('rejects a malformed ref with no colon', () => {
    expect(readOpenRef(new URLSearchParams('open=acme'), 'rentabilidad', dataset({ profitability: ['acme'] }))).toBeNull()
  })

  it('keeps a colon inside the id (splits on the FIRST colon only)', () => {
    const data = dataset({ profitability: ['acme:latam'] })
    expect(readOpenRef(new URLSearchParams('open=client:acme:latam'), 'rentabilidad', data)).toEqual({
      kind: 'client',
      id: 'acme:latam',
    })
  })
})

describe('withOpenRef', () => {
  it('writes kind:id and preserves every other param', () => {
    const next = withOpenRef(new URLSearchParams('tab=carga&trail=dashboard'), { kind: 'person', id: 'ana' })
    expect(next.get('open')).toBe('person:ana')
    expect(next.get('tab')).toBe('carga')
    expect(next.get('trail')).toBe('dashboard')
  })

  it('replaces an already-open ref', () => {
    const next = withOpenRef(new URLSearchParams('open=person:ana'), { kind: 'client', id: 'acme' })
    expect(next.get('open')).toBe('client:acme')
  })

  it('does not mutate the params it was given', () => {
    const params = new URLSearchParams('tab=carga')
    withOpenRef(params, { kind: 'person', id: 'ana' })
    expect(params.get('open')).toBeNull()
  })
})

describe('withoutOpenRef', () => {
  it('drops open and preserves every other param', () => {
    const next = withoutOpenRef(new URLSearchParams('tab=carga&open=person:ana&trail=dashboard'))
    expect(next.get('open')).toBeNull()
    expect(next.get('tab')).toBe('carga')
    expect(next.get('trail')).toBe('dashboard')
  })

  it('does not mutate the params it was given', () => {
    const params = new URLSearchParams('open=person:ana')
    withoutOpenRef(params)
    expect(params.get('open')).toBe('person:ana')
  })
})
