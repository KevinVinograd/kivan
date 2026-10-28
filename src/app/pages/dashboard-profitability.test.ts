import { describe, expect, it } from 'vitest'

import { profitabilityKpis } from './dashboard-profitability'
import type { ProfitabilitySnapshot } from './dashboard-types'

/** A month with real income; override only what a case asserts. */
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

/**
 * `Resultado estimado` is `ingresos - egresos`, so a period with no pago loaded resolves to
 * the REVENUE. Tinted success green and labelled a result, on the first screen of the
 * product, that reads as "the studio made 25,3 M this month" when what actually happened is
 * that nobody has recorded a single cost yet.
 *
 * The operator's real August is the case: 25,3 M billed, every pago loaded into `/pagos`,
 * and this tile showing the billing as profit. Absence must not render as a figure, and it
 * must not carry status.
 */
describe('profitabilityKpis', () => {
  it('says the absence instead of presenting revenue as a result', () => {
    const kpi = hero(snapshot())
    expect(kpi?.value).toBe('Sin pagos cargados')
    // No tone: there is no status to report. `KpiSummaryCard` renders a digit-free value as
    // a quiet label rather than a 52px figure, so the slot degrades on its own.
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

  /**
   * The gate is the OUTFLOW, not the result. A month that genuinely breaks even has a cost
   * basis and must report `$ 0` as the real figure it is: keying the check on
   * `estimatedResult === 0` would have called that "sin pagos cargados" and hidden a true
   * answer behind an empty state.
   */
  it('reports a genuine break-even as a figure', () => {
    const kpi = hero(snapshot({ egresos: 25_300_000, estimatedResult: 0 }))
    expect(kpi?.value).not.toBe('Sin pagos cargados')
    expect(kpi?.tone).toBe('success')
  })

  it('leaves the supporting figures alone', () => {
    // Only the hero is gated; the inputs behind it keep reporting whatever they hold.
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

/**
 * Currency is a LANE: every figure on this card is the peso lane alone. A period that
 * excluded non-peso operations has to SAY so on the card itself, not in a hint the
 * card's persisted dense mode drops.
 */
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
    // `egresos` is the peso lane, so a month whose only outflow is a dollar-paid
    // colaboradora scores zero here. Saying "Sin pagos cargados" would be a false
    // statement about loaded data rather than a report of its absence.
    const value = hero(snapshot({ egresos: 0, otherLaneCount: 1, otherLanePaymentCount: 1 }))?.value
    expect(value).toBe('Sin pagos en pesos')
  })

  it('does not assert non-peso PAGOS when the foreign money is all cobros', () => {
    // The combined count includes receivables. Choosing the sentence by it claimed
    // outflows in another lane on a month that has no outflows at all, and replaced the
    // prompt that would have told the operator to go load them.
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
