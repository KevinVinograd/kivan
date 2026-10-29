import { describe, expect, it } from 'vitest'

import { profitabilityKpis } from './dashboard-profitability'
import type { ProfitabilitySnapshot } from './dashboard-types'

function snapshot(overrides: Partial<ProfitabilitySnapshot> = {}): ProfitabilitySnapshot {
  return {
    ingresos: 25_300_000,
    egresos: 0,
    teamCost: 0,
    fixedExpenses: 0,
    estimatedResult: 25_300_000,
    marginPercent: 0,
    otherLaneCount: 0,
    otherLanePaymentCount: 0,
    bestMargin: [],
    lowMargin: [],
    ...overrides,
  }
}

const hero = (s: ProfitabilitySnapshot) =>
  profitabilityKpis(s).find((kpi) => kpi.id === 'estimated-result')

describe('profitabilityKpis', () => {
  it('says the absence instead of presenting revenue as a result', () => {
    const kpi = hero(snapshot())
    expect(kpi?.value).toBe('Sin pagos cargados')
    expect(kpi?.tone).toBeUndefined()
  })

  it('reports the result once any outflow is recorded', () => {
    const kpi = hero(snapshot({ egresos: 4_000_000, estimatedResult: 21_300_000 }))
    expect(kpi?.value).not.toBe('Sin pagos cargados')
    expect(kpi?.tone).toBe('success')
  })

  it('tones a loss as danger, not as an absence', () => {
    const kpi = hero(snapshot({ egresos: 30_000_000, estimatedResult: -4_700_000 }))
    expect(kpi?.tone).toBe('danger')
  })

  it('reports a genuine break-even as a figure', () => {
    const kpi = hero(snapshot({ egresos: 25_300_000, estimatedResult: 0 }))
    expect(kpi?.value).not.toBe('Sin pagos cargados')
    expect(kpi?.tone).toBe('success')
  })

  it('leaves the supporting figures alone', () => {
    const ids = profitabilityKpis(snapshot()).map((kpi) => kpi.id)
    expect(ids).toEqual([
      'estimated-result',
      'recorded-income',
      'team-cost',
      'fixed-expenses',
      'estimated-margin',
    ])
  })
})

describe('otra moneda', () => {
  it('says nothing when the whole period is in pesos', () => {
    const ids = profitabilityKpis(snapshot({ otherLaneCount: 0 })).map((kpi) => kpi.id)
    expect(ids).not.toContain('other-lane')
  })

  it('reports the excluded count as a figure, not as a hint', () => {
    const note = profitabilityKpis(snapshot({ otherLaneCount: 2 })).find(
      (kpi) => kpi.id === 'other-lane',
    )
    expect(note).toMatchObject({ label: 'En otra moneda', value: '2', tertiary: true })
    expect(note?.hint).toBeUndefined()
  })
})

describe('Resultado estimado with no peso cost basis', () => {
  it('says the pagos are missing when there are none at all', () => {
    expect(hero(snapshot({ egresos: 0, otherLaneCount: 0 }))?.value).toBe(
      'Sin pagos cargados',
    )
  })

  it('does not claim the pagos are missing when they are in another lane', () => {
    const value = hero(snapshot({ egresos: 0, otherLaneCount: 1, otherLanePaymentCount: 1 }))?.value
    expect(value).toBe('Sin pagos en pesos')
  })

  it('does not assert non-peso PAGOS when the foreign money is all cobros', () => {
    const value = hero(snapshot({ egresos: 0, otherLaneCount: 2, otherLanePaymentCount: 0 }))?.value
    expect(value).toBe('Sin pagos cargados')
  })

  it('never prints a number for either absence', () => {
    for (const otherLanePaymentCount of [0, 1]) {
      const value = hero(snapshot({ egresos: 0, otherLanePaymentCount }))?.value ?? ''
      expect(/[0-9]/.test(value)).toBe(false)
    }
  })
})
