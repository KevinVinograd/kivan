import { describe, expect, it } from 'vitest'

import { getReportData } from './reports-data'
import type { Receivable } from './cobros-mock-data'
import type { Payment } from './pagos-mock-data'

const PERIOD = '2026-06-01'

function receivable(overrides: Partial<Receivable> = {}): Receivable {
  return {
    id: 'rec-1',
    clientName: 'Cliente Uno',
    period: PERIOD,
    service: 'Redes',
    baseAmount: 100_000,
    extraAmount: 0,
    extras: [],
    discountAmount: 0,
    totalAmount: 100_000,
    collectedAmount: 0,
    currency: 'ARS',
    dueDate: '2026-06-25',
    status: 'pending',
    billingStatus: 'no_invoice',
    taxProfileId: 'unassigned',
    lastActivityLabel: '',
    lastActivityAt: '2026-06-02T14:00:00.000Z',
    ...overrides,
  }
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'pay-1',
    recipientName: 'Proveedor Uno',
    recipientType: 'provider',
    providerId: 'prov-1',
    period: PERIOD,
    concept: 'Servicio mensual',
    totalAmount: 80_000,
    paidAmount: 0,
    currency: 'ARS',
    expectedDate: '2026-06-30',
    status: 'pending',
    lastActivityLabel: 'Sin actividad',
    lastActivityAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

const pesoRec = receivable()
const pesoPay = payment()

describe('report figures across currency lanes', () => {
  it('leaves every peso figure unchanged when a dollar cobro joins the period', () => {
    const pesoOnly = getReportData(PERIOD, { receivables: [pesoRec], payments: [pesoPay] })
    const mixed = getReportData(PERIOD, {
      receivables: [pesoRec, receivable({ id: 'usd-1', currency: 'USD', totalAmount: 1_000 })],
      payments: [pesoPay],
    })

    expect(mixed.summary.ingresos).toBe(pesoOnly.summary.ingresos)
    expect(mixed.summary.rentabilidad).toBe(pesoOnly.summary.rentabilidad)
  })

  it('leaves every peso figure unchanged when a dollar pago joins the period', () => {
    const pesoOnly = getReportData(PERIOD, { receivables: [pesoRec], payments: [pesoPay] })
    const mixed = getReportData(PERIOD, {
      receivables: [pesoRec],
      payments: [pesoPay, payment({ id: 'usd-2', currency: 'USD', totalAmount: 1_000 })],
    })

    expect(mixed.summary.egresos).toBe(pesoOnly.summary.egresos)
    expect(mixed.summary.rentabilidad).toBe(pesoOnly.summary.rentabilidad)
  })

  it('keeps a fund-unit cobro out of Total cobrado and out of the Facturación buckets', () => {
    const data = getReportData(PERIOD, {
      receivables: [
        receivable({ id: 'ars-1', collectedAmount: 100_000, status: 'collected' }),
        receivable({ id: 'usd-1', currency: 'USD', totalAmount: 900, collectedAmount: 900, status: 'collected' }),
      ],
      payments: [],
    })

    expect(data.financials.totalCobrado).toBe(100_000)
    const facturado = data.financials.facturacion.reduce((total, bucket) => total + bucket.amount, 0)
    expect(facturado).toBe(100_000)
  })

  it('keeps a dollar pago out of the Gastos fijos total AND out of its list', () => {
    const data = getReportData(PERIOD, {
      receivables: [],
      payments: [
        payment({ id: 'ars-fix', recipientType: 'fixed_expense', totalAmount: 50_000 }),
        payment({ id: 'usd-fix', recipientType: 'fixed_expense', currency: 'USD', totalAmount: 500 }),
      ],
    })

    expect(data.financials.gastosFijos).toBe(50_000)
    expect(data.financials.gastosFijosList.map((line) => line.id)).toEqual(['ars-fix'])
    const donutTotal = data.financials.gastosFijosList.reduce((t, line) => t + line.amount, 0)
    expect(donutTotal).toBe(50_000)
  })

  it('counts what it excluded, on both the summary and the financials', () => {
    const data = getReportData(PERIOD, {
      receivables: [pesoRec, receivable({ id: 'usd-1', currency: 'USD' })],
      payments: [pesoPay, payment({ id: 'usd-p1', currency: 'USD' })],
    })

    expect(data.summary.otherLaneCount).toBe(2)
    expect(data.financials.otherLaneCount).toBe(2)
  })

  it('does not count a cancelled non-peso row, which is in no figure either way', () => {
    const data = getReportData(PERIOD, {
      receivables: [receivable({ id: 'usd-x', currency: 'USD', status: 'cancelled' })],
      payments: [],
    })

    expect(data.summary.otherLaneCount).toBe(0)
    expect(data.financials.otherLaneCount).toBe(0)
  })

  it('reports nothing to exclude when the whole period is in pesos', () => {
    const data = getReportData(PERIOD, { receivables: [pesoRec], payments: [pesoPay] })

    expect(data.summary.otherLaneCount).toBe(0)
    expect(data.financials.otherLaneCount).toBe(0)
  })
})

describe('the report is one lane, and says what that leaves out', () => {
  it('describes the same peso population in a bucket count and its amount', () => {
    const data = getReportData(PERIOD, {
      receivables: [
        receivable({ id: 'ars-1', totalAmount: 100_000 }),
        receivable({ id: 'usd-1', currency: 'USD', totalAmount: 700 }),
      ],
      payments: [],
    })

    const pending = data.financials.cobrosPorEstado.find((b) => b.id === 'pending')
    expect(pending?.count).toBe(1)
    expect(pending?.amount).toBe(100_000)
  })

  it('keeps every detail table on the peso lane', () => {
    const data = getReportData(PERIOD, {
      receivables: [pesoRec, receivable({ id: 'usd-r1', currency: 'USD', totalAmount: 900 })],
      payments: [pesoPay, payment({ id: 'usd-1', currency: 'USD', totalAmount: 800 })],
    })

    expect(data.financials.cobrosDetail.map((r) => r.currency)).toEqual(['ARS'])
    expect(data.financials.pagosDetail.map((r) => r.currency)).toEqual(['ARS'])
    expect(data.financials.facturacionDetail).toHaveLength(1)
  })

  it('still has something to show for a month billed entirely in another lane', () => {
    const data = getReportData(PERIOD, {
      receivables: [receivable({ id: 'usd-only', currency: 'USD', totalAmount: 5_000 })],
      payments: [],
    })

    expect(data.summary.ingresos).toBe(0)
    expect(data.financials.cobrosDetail).toHaveLength(0)
    expect(data.summary.otherLaneCount).toBe(1)
    expect(data.financials.otherLaneCount).toBe(1)
  })
})

describe('countsAllLanes', () => {
  it('counts an overdue cobro in any lane', () => {
    const data = getReportData(PERIOD, {
      receivables: [
        receivable({ id: 'ars-1', status: 'pending' }),
        receivable({ id: 'usd-1', currency: 'USD', status: 'overdue', totalAmount: 700 }),
      ],
      payments: [],
    })

    expect(data.financials.countsAllLanes.overdue).toBe(1)
    expect(data.financials.totalPendienteCobro).toBe(100_000)
  })

  it('counts every client in the denominator of "N de M clientes pagaron"', () => {
    const data = getReportData(PERIOD, {
      receivables: [
        receivable({ id: 'ars-1', status: 'collected', collectedAmount: 100_000 }),
        receivable({ id: 'usd-1', currency: 'USD', status: 'pending', totalAmount: 900 }),
      ],
      payments: [],
    })

    expect(data.financials.countsAllLanes.total).toBe(2)
    expect(data.financials.countsAllLanes.collected).toBe(1)
  })

  it('holds no amounts, so it cannot be mistaken for money', () => {
    const data = getReportData(PERIOD, { receivables: [pesoRec], payments: [] })
    expect(Object.keys(data.financials.countsAllLanes).sort()).toEqual([
      'collected',
      'overdue',
      'total',
    ])
  })
})

describe('gastosFijosList', () => {
  it('leaves a cancelled expense out of the list, as the total already does', () => {
    const data = getReportData(PERIOD, {
      receivables: [],
      payments: [
        payment({ id: 'live', recipientType: 'fixed_expense', totalAmount: 50_000 }),
        payment({ id: 'dead', recipientType: 'fixed_expense', totalAmount: 30_000, status: 'cancelled' }),
      ],
    })

    expect(data.financials.gastosFijos).toBe(50_000)
    expect(data.financials.gastosFijosList.map((l) => l.id)).toEqual(['live'])
  })
})
