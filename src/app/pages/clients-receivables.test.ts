import { describe, expect, it } from 'vitest'

import type { Receivable } from './cobros-mock-data'
import type { Client } from './clients-mock-data'
import {
  clientMonth,
  collectable,
  invoiceable,
  receivablesForClient,
  withMonth,
} from './clients-receivables'

const PERIOD = '2026-07-01'
const TODAY = '2026-07-20'

function receivable(over: Partial<Receivable> = {}): Receivable {
  return {
    id: 'rec-1',
    clientId: 'cli-1',
    clientName: 'Estudio Uno',
    period: PERIOD,
    service: 'Gestión mensual',
    baseAmount: 100000,
    extraAmount: 0,
    extras: [],
    discountAmount: 0,
    totalAmount: 100000,
    collectedAmount: 0,
    currency: 'ARS',
    dueDate: '2026-07-10',
    status: 'pending',
    billingStatus: 'no_invoice',
    taxProfileId: 'monotributo_1',
    lastActivityLabel: '',
    lastActivityAt: '2026-07-01T00:00:00',
    ...over,
  }
}

describe('receivablesForClient', () => {
  it('matches on the client id, not the name', () => {
    const rows = receivablesForClient(
      [
        receivable({ id: 'a', clientId: 'cli-1', clientName: 'Estudio Uno' }),
        receivable({ id: 'b', clientId: 'cli-2', clientName: 'Estudio Uno' }),
      ],
      'cli-1',
      PERIOD,
    )
    expect(rows.map((r) => r.id)).toEqual(['a'])
  })

  it('keeps only the requested month', () => {
    const rows = receivablesForClient(
      [receivable({ id: 'jul' }), receivable({ id: 'jun', period: '2026-06-01' })],
      'cli-1',
      PERIOD,
    )
    expect(rows.map((r) => r.id)).toEqual(['jul'])
  })

  it('excludes cancelled rows', () => {
    const rows = receivablesForClient(
      [receivable({ id: 'live' }), receivable({ id: 'void', status: 'cancelled' })],
      'cli-1',
      PERIOD,
    )
    expect(rows.map((r) => r.id)).toEqual(['live'])
  })
})

describe('clientMonth', () => {
  it('returns undefined when nothing was billed', () => {
    expect(clientMonth([], 'cli-1', PERIOD, TODAY)).toBeUndefined()
    expect(clientMonth([receivable({ clientId: 'other' })], 'cli-1', PERIOD, TODAY)).toBeUndefined()
  })

  it('sums across several cobros of the same month', () => {
    const month = clientMonth(
      [
        receivable({ id: 'a', totalAmount: 100000, collectedAmount: 40000 }),
        receivable({ id: 'b', totalAmount: 60000, collectedAmount: 0, service: 'Paid media' }),
      ],
      'cli-1',
      PERIOD,
      TODAY,
    )
    expect(month?.due).toBe(160000)
    expect(month?.paid).toBe(40000)
    expect(month?.receivables).toHaveLength(2)
  })

  it('reads a fully collected month as paid', () => {
    const month = clientMonth([receivable({ collectedAmount: 100000 })], 'cli-1', PERIOD, TODAY)
    expect(month?.paymentStatus).toBe('paid')
  })

  it('derives overdue from the due date and today, not from a constant', () => {
    const past = clientMonth([receivable({ dueDate: '2026-07-10' })], 'cli-1', PERIOD, '2026-07-20')
    expect(past?.paymentStatus).toBe('overdue')

    const future = clientMonth([receivable({ dueDate: '2026-07-25' })], 'cli-1', PERIOD, '2026-07-20')
    expect(future?.paymentStatus).toBe('pending')
  })

  it('reads a part-paid, not-yet-due month as partial', () => {
    const month = clientMonth(
      [receivable({ collectedAmount: 40000, dueDate: '2026-07-25' })],
      'cli-1',
      PERIOD,
      '2026-07-20',
    )
    expect(month?.paymentStatus).toBe('partial')
  })

  it('only reports the month as invoiced when every row is', () => {
    const partial = clientMonth(
      [
        receivable({ id: 'a', billingStatus: 'invoiced' }),
        receivable({ id: 'b', billingStatus: 'no_invoice' }),
      ],
      'cli-1',
      PERIOD,
      TODAY,
    )
    expect(partial?.invoiceStatus).toBe('not_issued')

    const all = clientMonth(
      [
        receivable({ id: 'a', billingStatus: 'invoiced' }),
        receivable({ id: 'b', billingStatus: 'sent' }),
      ],
      'cli-1',
      PERIOD,
      TODAY,
    )
    expect(all?.invoiceStatus).toBe('issued')
  })

  it('takes the last payment date from collectedAt', () => {
    const month = clientMonth(
      [
        receivable({ id: 'a', collectedAmount: 10000, collectedAt: '2026-07-05T10:00:00' }),
        receivable({ id: 'b', collectedAmount: 10000, collectedAt: '2026-07-18T10:00:00' }),
      ],
      'cli-1',
      PERIOD,
      TODAY,
    )
    expect(month?.lastPaymentDate).toBe('2026-07-18')
  })
})

describe('withMonth', () => {
  const client = { id: 'cli-1', name: 'Estudio Uno', monthlyFee: 999 } as Client

  it('leaves the money absent when there is no month', () => {
    const row = withMonth(client, undefined)
    expect(row.currentMonthDueAmount).toBeUndefined()
    expect(row.paymentStatus).toBeUndefined()
    expect(row.monthlyFee).toBe(999)
  })

  it('projects the real figures when there is one', () => {
    const month = clientMonth([receivable({ collectedAmount: 30000 })], 'cli-1', PERIOD, TODAY)
    const row = withMonth(client, month)
    expect(row.currentMonthDueAmount).toBe(100000)
    expect(row.currentMonthPaidAmount).toBe(30000)
    expect(row.paymentStatus).toBe('overdue')
  })
})

describe('eligibility', () => {
  it('offers only rows with something outstanding to collect', () => {
    const rows = [
      receivable({ id: 'open', collectedAmount: 40000 }),
      receivable({ id: 'settled', collectedAmount: 100000 }),
    ]
    expect(collectable(rows).map((r) => r.id)).toEqual(['open'])
  })

  it('offers only rows with no factura yet to invoice', () => {
    const rows = [
      receivable({ id: 'none', billingStatus: 'no_invoice' }),
      receivable({ id: 'queued', billingStatus: 'pending' }),
      receivable({ id: 'done', billingStatus: 'invoiced' }),
    ]
    expect(invoiceable(rows).map((r) => r.id)).toEqual(['none', 'queued'])
  })
})
