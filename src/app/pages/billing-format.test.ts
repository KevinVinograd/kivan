import { describe, expect, it } from 'vitest'

import { BILLING_HERO_IDS, billingKpis } from './billing-format'
import { cobrosKpis } from './cobros-format'
import { formatCompactCurrency } from './cobranza-format'
import { formatCurrency } from '@/lib/currency'
import type { Receivable } from './cobros-mock-data'

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
    const rows = [peso, dollars]
    const pesoPending = 1_000_000
    expect(figure(billingKpis(rows), 'toInvoiceARS')?.value).toBe(formatCurrency(pesoPending, 'ARS'))
    expect(figure(cobrosKpis(rows), 'toInvoice')?.value).toBe(formatCompactCurrency(pesoPending))
  })

  it('states the same "Facturado no cobrado" as /cobros for the same rows', () => {
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
    expect(billingKpis([peso, dollars])).toHaveLength(7)
    expect(billingKpis([peso])).toHaveLength(7)
    expect(billingKpis([dollars])).toHaveLength(7)
    const ids = billingKpis([peso, dollars]).map((kpi) => kpi.id)
    expect(ids.filter((id) => id.startsWith('lane-'))).toEqual([])
    expect(ids).not.toContain('otherLane')
  })
})

describe('the lane pair', () => {
  const figureOf = (figures: ReturnType<typeof billingKpis>, id: string) =>
    figures.find((kpi) => kpi.id === id)

  it('names both heroes as ids that exist in the list the card is handed', () => {
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
    const invoiced = receivable({ id: 'usd-done', currency: 'USD', billingStatus: 'sent' })
    const figures = billingKpis([peso, invoiced])

    expect(plain(figureOf(figures, 'toInvoiceUSD')?.value)).toBe('US$ 0')
    expect(figureOf(figures, 'toInvoiceUSD')?.hint).toBe('1 cobro, nada pendiente')
  })

  it('says nada pendiente for an EXEMPT row too, which is not invoiced but needs nothing', () => {
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
    const none = billingKpis([peso])
    expect(plain(figureOf(none, 'toInvoiceUSD')?.value)).toBe('US$ 0')
    expect(figureOf(none, 'toInvoiceUSD')?.hint).toBe('sin cobros en el período')

    const cancelled = receivable({ id: 'usd-x', currency: 'USD', status: 'cancelled' })
    expect(figureOf(billingKpis([peso, cancelled]), 'toInvoiceUSD')?.hint).toBe(
      'sin cobros en el período',
    )
  })

  it('claims no status on the dollar hero, even when it has money pending', () => {
    const figures = billingKpis([
      receivable({ id: 'usd-1', currency: 'USD', totalAmount: 500 }),
      dollars,
    ])
    expect(figureOf(figures, 'toInvoiceUSD')?.tone).toBe('default')
  })
})

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
