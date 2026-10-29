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
    const pesoOnly = pagosKpis([peso])
    const mixed = pagosKpis([peso, payment({ id: 'usd-1', currency: 'USD', totalAmount: 1_000 })])

    for (const id of ['toPayARS', 'paid', 'pending', 'overdue', 'pendingReview', 'fixedExpenses']) {
      expect(figure(mixed, id)?.value).toBe(figure(pesoOnly, id)?.value)
    }
  })

  it('holds the pair plus five, whatever the period contains', () => {
    const mixed = pagosKpis([
      peso,
      payment({ id: 'usd-1', currency: 'USD' }),
      payment({ id: 'usd-2', currency: 'USD' }),
    ])
    expect(mixed).toHaveLength(7)
    expect(pagosKpis([peso])).toHaveLength(7)
    expect(pagosKpis([payment({ id: 'usd-1', currency: 'USD' })])).toHaveLength(7)
    expect(figure(mixed, 'otherLane')).toBeUndefined()
  })

  it('says nothing about lanes when the period is all pesos', () => {
    expect(figure(pagosKpis([peso]), 'otherLane')).toBeUndefined()
  })

  it('carries a row COUNT on the peso hero, the same kind its twin carries', () => {
    expect(figure(pagosKpis([peso]), 'toPayARS')?.hint).toBe('1 pago')
  })

  it('does not count a cancelled pago as excluded money', () => {
    const mixed = pagosKpis([peso, payment({ id: 'usd-x', currency: 'USD', status: 'cancelled' })])
    expect(figure(mixed, 'otherLane')).toBeUndefined()
  })

  it('reports zero pesos for a period that is dollars only', () => {
    const figures = pagosKpis([payment({ id: 'usd-1', currency: 'USD', totalAmount: 1_000 })])
    const toPay = figure(figures, 'toPayARS')?.value

    expect(toPay).toBe(formatInLane(0, 'ARS'))
    expect(toPay).not.toBe(formatInLane(1_000, 'ARS'))
    expect(figure(figures, 'toPayARS')?.value).not.toBe(formatCompactCurrency(1_000))
  })
})

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
    expect(plain(figureOf(figures, 'toPayUSD')?.value)).toBe('US$ 1.400')
    expect(figureOf(figures, 'toPayUSD')?.value).toBe(formatInLane(1_400, 'USD'))
    expect(figureOf(figures, 'toPayUSD')?.value).not.toBe(formatCompactCurrency(1_400))
    expect(figureOf(figures, 'toPayARS')?.hint).toBe('1 pago')
    expect(figureOf(figures, 'toPayUSD')?.hint).toBe('2 pagos')
  })

  it('renders US$ 0 on an empty lane, and SAYS which kind of zero it is', () => {
    const empty = pagosKpis([peso])
    expect(plain(figureOf(empty, 'toPayUSD')?.value)).toBe('US$ 0')
    expect(figureOf(empty, 'toPayUSD')?.hint).toBe('sin pagos en el período')

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

describe('paymentDesglose', () => {
  const NBSP = String.fromCharCode(160)
  const plain = (s: string | undefined) => s?.split(NBSP).join(' ')
  const monto = (p: Payment) => paymentDesglose(p, null).find((r) => r.label === 'Monto')?.value

  it('states a fixed expense in its own lane', () => {
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
