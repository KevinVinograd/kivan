/**
 * The `/pagos` resumen figures, on a roster that holds more than one currency.
 *
 * What these guard is a wrong number, not a missing one. `dtoToPayment` used to hardcode
 * `currency: 'ARS'` and discard what the server sent, and `pagosKpis` summed every row
 * regardless of lane. A pago of USD 1.000 therefore added 1.000 to "Total a pagar" and
 * printed it under a "$": not money in the wrong place, money in no currency at all.
 *
 * Asserting the peso-only case would pass before and after the fix, so every case here
 * puts a non-peso row in the roster.
 */
import { describe, expect, it } from 'vitest'

import { PAGOS_HERO_IDS, pagosKpis, paymentDesglose } from './pagos-format'
import { formatCurrency as formatInLane } from '@/lib/currency'
import type { Kpi } from './cobranza-format'
import type { Payment } from './pagos-mock-data'
import { formatCompactCurrency } from './cobranza-format'

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'pay-1',
    recipientName: 'Proveedor Uno',
    recipientType: 'provider',
    providerId: 'prov-1',
    period: '2026-06-01',
    concept: 'Servicio mensual',
    totalAmount: 100_000,
    paidAmount: 0,
    currency: 'ARS',
    expectedDate: '2026-06-30',
    status: 'pending',
    lastActivityLabel: 'Sin actividad',
    lastActivityAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

const figure = (figures: ReturnType<typeof pagosKpis>, id: string) =>
  figures.find((kpi) => kpi.id === id)

const peso = payment({ id: 'ars-1', totalAmount: 100_000, paidAmount: 40_000 })

describe('pagosKpis across currency lanes', () => {
  it('leaves every peso figure unchanged when a dollar pago joins the period', () => {
    // Stated as the invariant rather than against a formatted string: adding a row in
    // another lane may not move a figure denominated in pesos, whatever the amount.
    const pesoOnly = pagosKpis([peso])
    const mixed = pagosKpis([peso, payment({ id: 'usd-1', currency: 'USD', totalAmount: 1_000 })])

    for (const id of ['toPayARS', 'paid', 'pending', 'overdue', 'pendingReview', 'fixedExpenses']) {
      expect(figure(mixed, id)?.value).toBe(figure(pesoOnly, id)?.value)
    }
  })

  it('holds the pair plus five, whatever the period contains', () => {
    // The card is a fixed shape: two heroes and five supporting figures, always. The
    // count is load-bearing twice over — the supporting grid is sized from it, and
    // `CobranzaLoading`'s skeleton is built to match, so a figure appearing or
    // disappearing with the data would shift the layout on every load.
    const mixed = pagosKpis([
      peso,
      payment({ id: 'usd-1', currency: 'USD' }),
      payment({ id: 'usd-2', currency: 'USD' }),
    ])
    // A dollars-only period, and a pesos-only one: the SAME seven figures.
    expect(mixed).toHaveLength(7)
    expect(pagosKpis([peso])).toHaveLength(7)
    expect(pagosKpis([payment({ id: 'usd-1', currency: 'USD' })])).toHaveLength(7)
    // The count-based stand-in the pair replaced is gone for good.
    expect(figure(mixed, 'otherLane')).toBeUndefined()
  })

  it('says nothing about lanes when the period is all pesos', () => {
    expect(figure(pagosKpis([peso]), 'otherLane')).toBeUndefined()
  })

  it('carries a row COUNT on the peso hero, the same kind its twin carries', () => {
    // It used to read "en pesos", which was the label's job done by the hint because the
    // label said only "Total a pagar". Both heroes name their lane now, so the hint is
    // free to say the same thing on both: how many rows the figure covers.
    expect(figure(pagosKpis([peso]), 'toPayARS')?.hint).toBe('1 pago')
  })

  it('does not count a cancelled pago as excluded money', () => {
    // A cancelled row is not money the total owes, in any lane. Counting it would send
    // the operator looking for a dollar pago that is not pending.
    const mixed = pagosKpis([peso, payment({ id: 'usd-x', currency: 'USD', status: 'cancelled' })])
    expect(figure(mixed, 'otherLane')).toBeUndefined()
  })

  it('reports zero pesos for a period that is dollars only', () => {
    // "Total a pagar en pesos" reads zero because no PESO is owed, which is true. What
    // makes it honest rather than a lie by omission is its twin beside it, which states
    // the dollar total at the same tier.
    //
    // Asserted against the peso hero's OWN formatter. It used to compare against the
    // compact one, which passed by coincidence once the hero went exact — both render 0
    // as "$ 0" — so the comparison was pinning nothing about which formatter ran. The
    // third assertion is what pins that now, and the second is what pins the claim this
    // case exists for: no dollar leaked into the peso total.
    const figures = pagosKpis([payment({ id: 'usd-1', currency: 'USD', totalAmount: 1_000 })])
    const toPay = figure(figures, 'toPayARS')?.value

    expect(toPay).toBe(formatInLane(0, 'ARS'))
    expect(toPay).not.toBe(formatInLane(1_000, 'ARS'))
    expect(figure(figures, 'toPayARS')?.value).not.toBe(formatCompactCurrency(1_000))
  })
})

/**
 * The LANE PAIR: the two co-equal focal figures the card promotes to `type-metric`.
 *
 * It replaced a second card whose single 20px figure appeared only when the period held
 * dollar rows, which itself replaced a Tertiary COUNT ("En otra moneda: 2") — the one
 * thing an operator closing a month cannot act on. Both figures are Primary on this
 * page now.
 */
/** `Intl` separates a currency symbol from its digits with a NON-BREAKING space (U+00A0).
 *  Pasting one into a test file makes an invisible character load-bearing, and a failure
 *  then reads "expected '$ 0' to be '$ 0'". Normalise instead. */
const NBSP_PAIR = String.fromCharCode(160)
const plain = (s: string | undefined) => s?.split(NBSP_PAIR).join(' ')

describe('the lane pair', () => {
  const figureOf = (figures: Kpi[], id: string) => figures.find((k) => k.id === id)

  it('puts both lanes in ONE figure list, named as the two heroes the card asks for', () => {
    const figures = pagosKpis([
      peso,
      payment({ id: 'usd-1', currency: 'USD', totalAmount: 1_000 }),
      payment({ id: 'usd-2', currency: 'USD', totalAmount: 400 }),
    ])

    // The ids the card names as heroes must EXIST in the list it is handed, or
    // `KpiSummaryCard` silently degrades to one hero and the pair is gone with the whole
    // suite green. This is the assertion that ties the two halves together.
    expect(PAGOS_HERO_IDS.every((id) => figureOf(figures, id) != null)).toBe(true)
    expect(figures.slice(0, 2).map((k) => k.id)).toEqual([...PAGOS_HERO_IDS])
  })

  it('states each lane in its own money, from the same formatter', () => {
    const figures = pagosKpis([
      peso,
      payment({ id: 'usd-1', currency: 'USD', totalAmount: 1_000 }),
      payment({ id: 'usd-2', currency: 'USD', totalAmount: 400 }),
    ])

    expect(figureOf(figures, 'toPayARS')?.label).toBe('Total a pagar en pesos')
    expect(figureOf(figures, 'toPayUSD')?.label).toBe('Total a pagar en dólares')
    // EXACT, and specifically not the compact notation the supporting grid uses: es-AR
    // abbreviates by magnitude, so a compact pair would render the peso total "98 k" and
    // the dollar total "1,4 K" — two glyphs for one idea, on two figures whose whole point
    // is to be read together. The second assertion is what pins that.
    expect(plain(figureOf(figures, 'toPayUSD')?.value)).toBe('US$ 1.400')
    expect(figureOf(figures, 'toPayUSD')?.value).toBe(formatInLane(1_400, 'USD'))
    expect(figureOf(figures, 'toPayUSD')?.value).not.toBe(formatCompactCurrency(1_400))
    // Both heroes name their own lane, so neither reads as the total with the other an
    // aside, and the peso hint carries a COUNT like its twin rather than the "en pesos"
    // that used to do the label's disambiguating.
    expect(figureOf(figures, 'toPayARS')?.hint).toBe('1 pago')
    expect(figureOf(figures, 'toPayUSD')?.hint).toBe('2 pagos')
  })

  it('renders US$ 0 on an empty lane, and SAYS which kind of zero it is', () => {
    // A reversal, deliberately. The figure used to be withheld on the argument that an
    // empty lane is EMPTY, not "US$ 0" — a zero would state the studio owes nothing in
    // dollars, which is a different claim from having had no dollar pagos. That is right
    // about the FIGURE and is answered by the HINT. What withholding cost was the pair:
    // a second protagonist that vanishes some months is not one.
    const empty = pagosKpis([peso])
    expect(plain(figureOf(empty, 'toPayUSD')?.value)).toBe('US$ 0')
    expect(figureOf(empty, 'toPayUSD')?.hint).toBe('sin pagos en el período')

    // A cancelled dollar pago is not a live row, so it reads the same way.
    const cancelled = pagosKpis([
      peso,
      payment({ id: 'usd-x', currency: 'USD', status: 'cancelled' }),
    ])
    expect(figureOf(cancelled, 'toPayUSD')?.hint).toBe('sin pagos en el período')
  })

  it('claims no status on either lane: a period total is not one', () => {
    const figures = pagosKpis([
      peso,
      payment({ id: 'usd-1', currency: 'USD', totalAmount: 1_000 }),
    ])
    for (const id of PAGOS_HERO_IDS) {
      expect(figureOf(figures, id)?.tone).toBe('default')
      expect(figureOf(figures, id)?.tertiary).not.toBe(true)
    }
  })
})

/**
 * The detail panel's `Monto`, which is the same money the KPI strip above it states.
 *
 * `formatCurrency` in this module is the PESO-ONLY formatter, and this row used to use it:
 * a dollar pago read "US$ 1.250" in the Resumen and "$ 1.250" three rows below, the same
 * number in two units inside one panel. Nothing covered it, so the lane-aware call could be
 * swapped back for the peso one with the whole suite green — which is the only reason this
 * describe exists.
 */
describe('paymentDesglose', () => {
  // Intl puts U+00A0 between symbol and digits. Written as a pasted character it is
  // invisible in a diff and easy to lose; `fromCharCode` makes it survive an edit.
  const NBSP = String.fromCharCode(160)
  const plain = (s: string | undefined) => s?.split(NBSP).join(' ')
  const monto = (p: Payment) => paymentDesglose(p, null).find((r) => r.label === 'Monto')?.value

  it('states a fixed expense in its own lane', () => {
    // `fixed_expense` and the default branch are separate returns, so one being right says
    // nothing about the other.
    const p = payment({ recipientType: 'fixed_expense', currency: 'USD', totalAmount: 1_250 })
    expect(plain(monto(p))).toBe('US$ 1.250')
  })

  it('states a provider pago in its own lane', () => {
    const p = payment({ recipientType: 'provider', currency: 'USD', totalAmount: 1_250 })
    expect(plain(monto(p))).toBe('US$ 1.250')
  })

  it('still reads pesos as pesos', () => {
    expect(plain(monto(payment({ totalAmount: 1_250 })))).toBe('$ 1.250')
  })
})
