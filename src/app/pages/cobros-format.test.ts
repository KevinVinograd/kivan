import { describe, expect, it } from 'vitest'

import { isCalendarDay } from '@/app/lib/iso-date'
import {
  cobrosKpis,
  COBROS_HERO_IDS,
  receivableActivity,
  receivableInvoiceDate,
  receivableLedger,
  receivableRegisteredPayments,
  effectiveCollectionStatus,
} from './cobros-format'
import { LANE_NOUN } from '@/lib/currency'

import type { Receivable } from './cobros-mock-data'

function makeReceivable(partial: Partial<Receivable>): Receivable {
  return {
    id: 'b6f1c2d4-0000-4000-8000-000000000007',
    clientName: 'Cliente',
    period: '2026-08-01',
    service: 'Redes',
    baseAmount: 0,
    extraAmount: 0,
    extras: [],
    discountAmount: 0,
    totalAmount: 0,
    collectedAmount: 0,
    currency: 'ARS',
    dueDate: '2026-08-25',
    status: 'pending',
    billingStatus: 'no_invoice',
    taxProfileId: 'unassigned',
    lastActivityLabel: '',
    lastActivityAt: '2026-08-02T14:00:00.000Z',
    ...partial,
  }
}

describe('receivableRegisteredPayments', () => {
  it('returns no row when nothing has been collected', () => {
    expect(receivableRegisteredPayments(makeReceivable({ collectedAmount: 0 }))).toEqual([])
  })

  it('never returns a payment method, whatever the id digits would have selected', () => {
    for (const id of ['rec-001', 'rec-002', 'rec-003']) {
      const [row] = receivableRegisteredPayments(makeReceivable({ id, collectedAmount: 500 }))
      expect(row).not.toHaveProperty('method')
      expect(JSON.stringify(row)).not.toMatch(/Transferencia|Mercado Pago|Efectivo/)
    }
  })

  it('carries the real comprobante number, and nothing when there is none', () => {
    const [withInvoice] = receivableRegisteredPayments(
      makeReceivable({ collectedAmount: 500, invoiceNumber: '0001-00000042' }),
    )
    expect(withInvoice.reference).toBe('0001-00000042')

    const [without] = receivableRegisteredPayments(makeReceivable({ collectedAmount: 500 }))
    expect(without.reference).toBeUndefined()
    expect(JSON.stringify(without)).not.toMatch(/REC-\d/)
  })

  it('dates the row by collectedAt, as a calendar day', () => {
    const [row] = receivableRegisteredPayments(
      makeReceivable({ collectedAmount: 500, collectedAt: '2026-08-18', lastActivityAt: '2026-08-02T14:00:00.000Z' }),
    )
    expect(row.iso).toBe('2026-08-18')
    expect(isCalendarDay(row.iso!)).toBe(true)
  })

  it('carries NO date for a row collected before the column shipped', () => {
    const [row] = receivableRegisteredPayments(
      makeReceivable({ collectedAmount: 500, collectedAt: undefined }),
    )
    expect(row.iso).toBeUndefined()
    expect(row.amount).toBe(500)
  })

  it('reports the full collected amount as one row', () => {
    const [row] = receivableRegisteredPayments(makeReceivable({ totalAmount: 1_000, collectedAmount: 400 }))
    expect(row.amount).toBe(400)
    expect(receivableRegisteredPayments(makeReceivable({ collectedAmount: 400 }))).toHaveLength(1)
  })
})

describe('receivableActivity', () => {
  it('dates the collection entry by collectedAt, matching the Cobros registrados row', () => {
    const r = makeReceivable({
      collectedAmount: 500,
      collectedAt: '2026-08-18',
      lastActivityAt: '2026-08-01T09:00:00.000Z',
    })
    const entry = receivableActivity(r).find((item) => item.kind === 'collected')
    const [row] = receivableRegisteredPayments(r)

    expect(entry?.iso).toBe('2026-08-18')
    expect(entry?.iso).toBe(row.iso)
    expect(isCalendarDay(entry!.iso)).toBe(true)
  })

  it('omits the collection entry when no collection date was recorded', () => {
    const entry = receivableActivity(
      makeReceivable({ collectedAmount: 500, collectedAt: undefined, lastActivityAt: '2026-08-01T09:00:00.000Z' }),
    ).find((item) => item.kind === 'collected')

    expect(entry).toBeUndefined()
  })

  it('dates "Cobro creado" at the creation instant, not at the billing month', () => {
    const entry = receivableActivity(
      makeReceivable({ period: '2026-08-01', lastActivityAt: '2026-08-14T09:00:00.000Z' }),
    ).find((item) => item.kind === 'created')

    expect(entry?.iso).toBe('2026-08-14')
  })

  it('emits no invoice entry, and no invoice date, without a stored emission date', () => {
    const r = makeReceivable({ invoiceNumber: 'A-0001-00000123', invoiceIssuedAt: undefined })

    expect(receivableInvoiceDate(r)).toBeUndefined()
    expect(receivableActivity(r).some((item) => item.kind === 'invoice')).toBe(false)
  })

  it('orders a later collection day above an earlier invoice instant', () => {
    const items = receivableActivity(
      makeReceivable({
        collectedAmount: 500,
        collectedAt: '2026-08-18',
        invoiceNumber: '0001-00000042',
        invoiceIssuedAt: '2026-08-17T10:00:00.000Z',
        lastActivityAt: '2026-08-01T09:00:00.000Z',
      }),
    )
    const collectedIndex = items.findIndex((item) => item.kind === 'collected')
    const invoiceIndex = items.findIndex((item) => item.kind === 'invoice')
    expect(collectedIndex).toBeGreaterThanOrEqual(0)
    expect(invoiceIndex).toBeGreaterThanOrEqual(0)
    expect(collectedIndex).toBeLessThan(invoiceIndex)
  })

  it('leaves same-day order to the raw value, which a calendar day cannot settle', () => {
    const items = receivableActivity(
      makeReceivable({
        collectedAmount: 500,
        collectedAt: '2026-08-18',
        invoiceNumber: '0001-00000042',
        invoiceIssuedAt: '2026-08-18T10:00:00.000Z',
        lastActivityAt: '2026-08-01T09:00:00.000Z',
      }),
    )
    const days = items.map((item) => item.iso.slice(0, 10))
    expect([...days].sort().reverse()).toEqual(days)
  })
})

describe('receivableLedger', () => {
  const august = makeReceivable({
    id: 'rec-004',
    clientId: 'cli-1',
    period: '2026-08-01',
    totalAmount: 90_000,
    collectedAmount: 0,
  })

  it('carries what the client still owes from EARLIER periods, and nothing else', () => {
    const ledger = receivableLedger(august, [
      august,
      makeReceivable({ id: 'rec-001', clientId: 'cli-1', period: '2026-06-01', totalAmount: 50_000, collectedAmount: 20_000 }),
      makeReceivable({ id: 'rec-002', clientId: 'cli-1', period: '2026-07-01', totalAmount: 40_000, collectedAmount: 40_000 }),
      makeReceivable({ id: 'rec-003', clientId: 'cli-2', period: '2026-07-01', totalAmount: 70_000, collectedAmount: 0 }),
      makeReceivable({ id: 'rec-005', clientId: 'cli-1', period: '2026-09-01', totalAmount: 10_000, collectedAmount: 0 }),
    ])

    expect(ledger.previousBalance).toBe(30_000)
    expect(ledger.currentBalance).toBe(120_000)
  })

  it('reads 0 for a client with no earlier debt, whatever the row id digits are', () => {
    expect(receivableLedger(august, [august]).previousBalance).toBe(0)
  })

  it('ignores a cancelled earlier cobro', () => {
    const ledger = receivableLedger(august, [
      august,
      makeReceivable({ id: 'rec-006', clientId: 'cli-1', period: '2026-07-01', totalAmount: 80_000, collectedAmount: 0, status: 'cancelled' }),
    ])
    expect(ledger.previousBalance).toBe(0)
  })
})

describe('receivableLedger — an over-collected earlier cobro', () => {
  it('does not net a negative balance off real debt from another period', () => {
    const august = makeReceivable({ id: 'rec-x', clientId: 'cli-1', period: '2026-08-01', totalAmount: 90_000 })
    const ledger = receivableLedger(august, [
      august,
      makeReceivable({ id: 'rec-o', clientId: 'cli-1', period: '2026-06-01', totalAmount: 50_000, collectedAmount: 80_000 }),
      makeReceivable({ id: 'rec-d', clientId: 'cli-1', period: '2026-07-01', totalAmount: 40_000, collectedAmount: 0 }),
    ])
    expect(ledger.previousBalance).toBe(40_000)
  })
})

describe('cobrosKpis across currency lanes', () => {
  const figure = (figures: ReturnType<typeof cobrosKpis>, id: string) =>
    figures.find((kpi) => kpi.id === id)

  const peso = makeReceivable({ id: 'ars-1', totalAmount: 100_000, collectedAmount: 25_000 })

  it('leaves every peso figure unchanged when a dollar cobro joins the period', () => {
    const pesoOnly = cobrosKpis([peso])
    const mixed = cobrosKpis([
      peso,
      makeReceivable({ id: 'usd-1', currency: 'USD', totalAmount: 900 }),
    ])

    for (const id of [
      'toCollect',
      'collected',
      'pending',
      'overdue',
      'toInvoice',
      'billedNotCollected',
    ]) {
      expect(figure(mixed, id)?.value).toBe(figure(pesoOnly, id)?.value)
    }
  })

  it('holds the pair plus five, whatever the period contains', () => {
    const mixed = cobrosKpis([peso, makeReceivable({ id: 'usd-1', currency: 'USD' })])
    expect(mixed).toHaveLength(7)
    expect(cobrosKpis([peso])).toHaveLength(7)
    expect(cobrosKpis([makeReceivable({ id: 'usd-1', currency: 'USD' })])).toHaveLength(7)
    expect(figure(mixed, 'toCollect')?.hint).toBe('en pesos')
  })
})

describe('the lane pair', () => {
  const peso = makeReceivable({ id: 'ars-1', totalAmount: 100_000 })
  const NBSP = String.fromCharCode(160)
  const plain = (s: string | undefined) => s?.split(NBSP).join(' ')
  const figureOf = (figures: ReturnType<typeof cobrosKpis>, id: string) =>
    figures.find((k) => k.id === id)

  it('names both heroes as ids that exist in the list the card is handed', () => {
    const figures = cobrosKpis([peso, makeReceivable({ id: 'usd-1', currency: 'USD' })])
    expect(COBROS_HERO_IDS.every((id) => figureOf(figures, id) != null)).toBe(true)
    expect(figures.slice(0, 2).map((k) => k.id)).toEqual([...COBROS_HERO_IDS])
  })

  it('states the SALDO in each lane, not the period total', () => {
    const figures = cobrosKpis([
      peso,
      makeReceivable({ id: 'usd-1', currency: 'USD', totalAmount: 900, collectedAmount: 400 }),
      makeReceivable({ id: 'usd-2', currency: 'USD', totalAmount: 100 }),
    ])

    expect(figureOf(figures, 'pendingARS')?.label).toBe('Saldo pendiente en pesos')
    expect(figureOf(figures, 'pendingUSD')?.label).toBe('Saldo pendiente en dólares')
    expect(plain(figureOf(figures, 'pendingUSD')?.value)).toBe('US$ 600')
    expect(figureOf(figures, 'pendingUSD')?.hint).toBe('2 cobros')
  })

  it('escalates each lane on ITS OWN money, not on the other one', () => {
    const pesoAtRest = makeReceivable({
      id: 'ars-paid', totalAmount: 100_000, collectedAmount: 100_000, status: 'collected',
    })
    const owing = cobrosKpis([
      pesoAtRest,
      makeReceivable({ id: 'usd-1', currency: 'USD', totalAmount: 900, dueDate: '2099-01-31' }),
    ])

    expect(figureOf(owing, 'pendingARS')?.tone).toBe('default')
    expect(figureOf(owing, 'pendingUSD')?.tone).toBe('warning')

    const late = cobrosKpis([
      pesoAtRest,
      makeReceivable({ id: 'usd-late', currency: 'USD', totalAmount: 900, dueDate: '2026-01-31' }),
    ])
    expect(figureOf(late, 'pendingARS')?.tone).toBe('default')
    expect(figureOf(late, 'pendingUSD')?.tone).toBe('danger')

    const bothAtRest = cobrosKpis([pesoAtRest])
    expect(figureOf(bothAtRest, 'pendingUSD')?.tone).toBe('default')
  })

  it('renders US$ 0 on an empty lane, and SAYS which kind of zero it is', () => {
    const empty = cobrosKpis([peso])
    expect(plain(figureOf(empty, 'pendingUSD')?.value)).toBe('US$ 0')
    expect(figureOf(empty, 'pendingUSD')?.hint).toBe('sin cobros en el período')

    const cancelled = cobrosKpis([
      peso,
      makeReceivable({ id: 'x', currency: 'USD', status: 'cancelled' }),
    ])
    expect(figureOf(cancelled, 'pendingUSD')?.hint).toBe('sin cobros en el período')
  })

  it('builds the label from the shared lane noun, so no screen can rename a lane', () => {
    const figures = cobrosKpis([makeReceivable({ id: 'u', currency: 'USD' })])
    expect(figureOf(figures, 'pendingUSD')?.label).toBe('Saldo pendiente en ' + LANE_NOUN.USD)
  })
})

describe('effectiveCollectionStatus', () => {
  it('reads a pending cobro past its due date as overdue', () => {
    const r = makeReceivable({ status: 'pending', dueDate: '2020-01-10', totalAmount: 1000, collectedAmount: 0 })
    expect(effectiveCollectionStatus(r)).toBe('overdue')
  })

  it('keeps a pending cobro that is not due yet, and any other state as stored', () => {
    expect(effectiveCollectionStatus(makeReceivable({ status: 'pending', dueDate: '2999-01-10', totalAmount: 1000, collectedAmount: 0 }))).toBe('pending')
    expect(effectiveCollectionStatus(makeReceivable({ status: 'collected', dueDate: '2020-01-10', totalAmount: 1000, collectedAmount: 1000 }))).toBe('collected')
    expect(effectiveCollectionStatus(makeReceivable({ status: 'partial', dueDate: '2020-01-10', totalAmount: 1000, collectedAmount: 400 }))).toBe('partial')
  })
})
