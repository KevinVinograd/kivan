/**
 * The /billing resumen figures, against the /cobros ones they must agree with.
 *
 * These two views read the SAME receivables for the SAME period and print peso figures
 * under the SAME labels — "Pendiente de facturar", "Facturado no cobrado". `cobrosKpis`
 * was scoped to the peso lane and `billingKpis` was not, so the defect was not a wrong
 * figure on one screen: it was two screens stating different amounts for one month, with
 * nothing on either saying why.
 *
 * The cross-view case is therefore the point of this file, not a bonus: it fails for a
 * lane rule applied to one view and not the other, in either direction.
 */
import { describe, expect, it } from 'vitest'

import { BILLING_HERO_IDS, billingKpis } from './billing-format'
import { cobrosKpis } from './cobros-format'
import { formatCompactCurrency } from './cobranza-format'
import { formatCurrency } from '@/lib/currency'
import type { Receivable } from './cobros-mock-data'

/** Intl emits U+00A0 between symbol and digits; pasting one in makes it load-bearing. */
const NBSP = String.fromCharCode(160)
const plain = (s: string | undefined) => s == null ? s : s.split(NBSP).join(" ")

function receivable(overrides: Partial<Receivable> = {}): Receivable {
  return {
    id: 'rec-1',
    clientName: 'Cliente Uno',
    period: '2026-09-01',
    service: 'Redes',
    baseAmount: 1_000_000,
    extraAmount: 0,
    extras: [],
    discountAmount: 0,
    totalAmount: 1_000_000,
    collectedAmount: 0,
    currency: 'ARS',
    dueDate: '2026-09-25',
    status: 'pending',
    billingStatus: 'no_invoice',
    taxProfileId: 'unassigned',
    lastActivityLabel: '',
    lastActivityAt: '2026-09-02T14:00:00.000Z',
    ...overrides,
  }
}

const figure = (figures: ReturnType<typeof billingKpis>, id: string) =>
  figures.find((kpi) => kpi.id === id)

const peso = receivable()
const dollars = receivable({ id: 'usd-big', currency: 'USD', totalAmount: 1_000_000 })

describe('billingKpis across currency lanes', () => {
  it('states the same "Pendiente de facturar" AMOUNT as /cobros for the same rows', () => {
    // The invariant is the AMOUNT, not the glyphs, and this case used to compare the two
    // strings — which was the same thing until `toInvoice` became a hero here and stayed a
    // supporting tile on /cobros. Different tiers format differently by design: a hero is
    // exact because the operator acts on it, a supporting tile is compact because five of
    // them share a row. Comparing strings would now force one of those to be wrong.
    //
    // Stating the number once and deriving BOTH renderings from it is also stronger than
    // the original: two screens that were wrong in the same way used to pass.
    const rows = [peso, dollars]
    const pesoPending = 1_000_000
    expect(figure(billingKpis(rows), 'toInvoiceARS')?.value).toBe(formatCurrency(pesoPending, 'ARS'))
    expect(figure(cobrosKpis(rows), 'toInvoice')?.value).toBe(formatCompactCurrency(pesoPending))
  })

  it('states the same "Facturado no cobrado" as /cobros for the same rows', () => {
    // The non-peso amount has to be large enough to survive the compact formatter: at
    // US$ 800 both sides render "$1 M" and the case passes unscoped, guarding nothing.
    const rows = [
      receivable({ billingStatus: 'invoiced' }),
      receivable({ id: 'usd-invoiced', currency: 'USD', billingStatus: 'invoiced', totalAmount: 1_000_000 }),
    ]
    expect(figure(billingKpis(rows), 'billedNotCollected')?.value).toBe(
      figure(cobrosKpis(rows), 'billedNotCollected')?.value,
    )
  })

  it('leaves every peso figure unchanged when a dollar cobro joins the period', () => {
    const pesoOnly = billingKpis([peso])
    const mixed = billingKpis([peso, dollars])

    for (const id of ['toInvoiceARS', 'billed', 'billedNotCollected']) {
      expect(figure(mixed, id)?.value).toBe(figure(pesoOnly, id)?.value)
    }
  })

  it('holds the pair plus five, whatever the period contains', () => {
    // A fixed shape: two heroes and five supporting figures, always — the count the
    // supporting grid and `CobranzaLoading`'s skeleton are both sized from.
    expect(billingKpis([peso, dollars])).toHaveLength(7)
    expect(billingKpis([peso])).toHaveLength(7)
    expect(billingKpis([dollars])).toHaveLength(7)
    // The stand-ins the pair replaced are gone: a lane never lands in the SUPPORTING grid,
    // where it would sit at 32px beside peso amounts with nothing saying the units differ.
    const ids = billingKpis([peso, dollars]).map((kpi) => kpi.id)
    expect(ids.filter((id) => id.startsWith('lane-'))).toEqual([])
    expect(ids).not.toContain('otherLane')
  })
})

/**
 * The LANE PAIR. Its scope is deliberately NARROWER than the /cobros twin: that page
 * states what is outstanding because it asks how much is coming in, while this lens asks
 * what still needs a comprobante — so both heroes here are a pendiente de facturar.
 *
 * This screen has THREE ways to reach a zero and they are different months, which is why
 * the hint carries more work here than on its twins.
 */
describe('the lane pair', () => {
  const figureOf = (figures: ReturnType<typeof billingKpis>, id: string) =>
    figures.find((kpi) => kpi.id === id)

  it('names both heroes as ids that exist in the list the card is handed', () => {
    // `KpiSummaryCard` degrades to one hero on an unmatched id, silently and green.
    const figures = billingKpis([peso, receivable({ id: 'usd-1', currency: 'USD' })])
    expect(BILLING_HERO_IDS.every((id) => figureOf(figures, id) != null)).toBe(true)
    expect(figures.slice(0, 2).map((kpi) => kpi.id)).toEqual([...BILLING_HERO_IDS])
  })

  it('gives each lane its own pendiente de facturar, in its own money', () => {
    const figures = billingKpis([
      peso,
      receivable({ id: 'usd-1', currency: 'USD', totalAmount: 1_000 }),
      receivable({ id: 'usd-2', currency: 'USD', totalAmount: 400, billingStatus: 'pending' }),
    ])

    expect(figureOf(figures, 'toInvoiceARS')?.label).toBe('Pendiente de facturar en pesos')
    expect(figureOf(figures, 'toInvoiceUSD')?.label).toBe('Pendiente de facturar en dólares')
    expect(plain(figureOf(figures, 'toInvoiceUSD')?.value)).toBe('US$ 1.400')
    expect(figureOf(figures, 'toInvoiceUSD')?.hint).toBe('2 cobros')
  })

  it('shows a zero for a lane whose comprobantes are all issued, and says which', () => {
    // Three zeros, three meanings. This one: the lane HAS rows and none of them needs a
    // comprobante — a fact about documents, not about money not existing.
    const invoiced = receivable({ id: 'usd-done', currency: 'USD', billingStatus: 'sent' })
    const figures = billingKpis([peso, invoiced])

    expect(plain(figureOf(figures, 'toInvoiceUSD')?.value)).toBe('US$ 0')
    expect(figureOf(figures, 'toInvoiceUSD')?.hint).toBe('1 cobro, nada pendiente')
  })

  it('says nada pendiente for an EXEMPT row too, which is not invoiced but needs nothing', () => {
    // `not_required` is not in NEEDS_INVOICE and is not a comprobante either. "Ya
    // facturado" would have been a false statement about it.
    const exempt = receivable({ id: 'usd-e', currency: 'USD', billingStatus: 'not_required' })
    expect(figureOf(billingKpis([peso, exempt]), 'toInvoiceUSD')?.hint).toBe(
      '1 cobro, nada pendiente',
    )
  })

  it('counts the pending rows against the live ones when only some need a comprobante', () => {
    const figures = billingKpis([
      receivable({ id: 'usd-1', currency: 'USD', totalAmount: 1_000 }),
      receivable({ id: 'usd-2', currency: 'USD', billingStatus: 'sent', totalAmount: 900 }),
    ])

    expect(plain(figureOf(figures, 'toInvoiceUSD')?.value)).toBe('US$ 1.000')
    expect(figureOf(figures, 'toInvoiceUSD')?.hint).toBe('1 de 2 sin facturar')
  })

  it('distinguishes NO ROWS from nothing pending, which are different months', () => {
    // The third zero, and the one the figure used to answer by vanishing. A lane with no
    // live rows at all is not the same month as a lane whose comprobantes are all issued,
    // and both render US$ 0 — so the hint is the only thing that tells them apart.
    const none = billingKpis([peso])
    expect(plain(figureOf(none, 'toInvoiceUSD')?.value)).toBe('US$ 0')
    expect(figureOf(none, 'toInvoiceUSD')?.hint).toBe('sin cobros en el período')

    const cancelled = receivable({ id: 'usd-x', currency: 'USD', status: 'cancelled' })
    expect(figureOf(billingKpis([peso, cancelled]), 'toInvoiceUSD')?.hint).toBe(
      'sin cobros en el período',
    )
  })

  it('claims no status on the dollar hero, even when it has money pending', () => {
    // Unlike /cobros, where each lane carries its own overdue alarm, the alarm on this
    // screen is Error ARCA — a fact about documents already counted across every lane in
    // one tile. A second warning here would be the same signal said twice.
    const figures = billingKpis([
      receivable({ id: 'usd-1', currency: 'USD', totalAmount: 500 }),
      dollars,
    ])
    expect(figureOf(figures, 'toInvoiceUSD')?.tone).toBe('default')
  })
})

/**
 * An ARCA rejection, an issued comprobante and a missing monotributo are facts about a
 * DOCUMENT, not about money. Scoping them to the peso lane disarmed the only alarm on the
 * board while the table beside it still showed the row with its red badge.
 */
describe('billingKpis counts every lane', () => {
  const brokenUsd = receivable({
    id: 'usd-arca',
    currency: 'USD',
    billingStatus: 'error_arca',
    invoiceNumber: 'A-0001',
  })

  it('raises the ARCA alarm for a non-peso cobro', () => {
    const note = figure(billingKpis([brokenUsd]), 'errorArca')
    expect(note?.value).toBe('1')
    expect(note?.tone).toBe('danger')
  })

  it('counts a non-peso comprobante as issued', () => {
    expect(figure(billingKpis([brokenUsd]), 'issued')?.value).toBe('1')
  })

  it('flags a non-peso cobro with no monotributo assigned', () => {
    const unassigned = receivable({
      id: 'usd-unassigned',
      currency: 'USD',
      billingStatus: 'no_invoice',
      taxProfileId: 'unassigned',
    })
    expect(figure(billingKpis([unassigned]), 'unassigned')?.value).toBe('1')
  })

  it('still keeps the MONEY figures in pesos on the same rows', () => {
    const mixed = billingKpis([peso, brokenUsd])
    const pesoOnly = billingKpis([peso])
    expect(figure(mixed, 'toInvoice')?.value).toBe(figure(pesoOnly, 'toInvoice')?.value)
  })
})
