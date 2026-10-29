import { describe, expect, it } from 'vitest'

import { overlayClientCollection } from './monthly-operation-finance-bridge'
import type { Receivable } from './cobros-mock-data'
import type { MonthlyOperationData } from './monthly-operation-mock-data'

function makeReceivable(partial: Partial<Receivable>): Receivable {
  return {
    id: 'rec-1',
    clientName: 'Cafe Roma',
    period: '2026-08-01',
    service: 'Redes',
    baseAmount: 0,
    extraAmount: 0,
    extras: [],
    discountAmount: 0,
    totalAmount: 1_000,
    collectedAmount: 0,
    currency: 'ARS',
    dueDate: '2026-08-25',
    status: 'pending',
    billingStatus: 'no_invoice',
    taxProfileId: 'unassigned',
    lastActivityLabel: '',
    lastActivityAt: '2026-08-20T10:00:00.000Z',
    ...partial,
  }
}

function monthWithClient(): MonthlyOperationData {
  return {
    clients: [{ name: 'Cafe Roma', paidAmount: 0, paymentStatus: 'pending' }],
  } as unknown as MonthlyOperationData
}

const PERIOD = '2026-08-01'
const clientOf = (data: MonthlyOperationData) => data.clients[0]

describe('overlayClientCollection → paymentDate', () => {
  it('reports the day the operator entered, not the day the row was created', () => {
    const out = overlayClientCollection(
      monthWithClient(),
      [makeReceivable({ collectedAmount: 1_000, status: 'collected', collectedAt: '2026-08-10' })],
      PERIOD,
    )
    expect(clientOf(out).paymentDate).toBe('2026-08-10')
  })

  it('falls back to the row instant only when there is no collectedAt, reduced to its day', () => {
    const out = overlayClientCollection(
      monthWithClient(),
      [makeReceivable({ collectedAmount: 1_000, status: 'collected', collectedAt: undefined })],
      PERIOD,
    )
    expect(out.clients[0].paymentDate).toBe('2026-08-20')
  })

  it('does not let one legacy row outrank every real collection date', () => {
    const out = overlayClientCollection(
      monthWithClient(),
      [
        makeReceivable({ id: 'a', collectedAmount: 500, status: 'partial', collectedAt: '2026-08-10' }),
        makeReceivable({ id: 'b', collectedAmount: 500, status: 'partial', collectedAt: undefined }),
      ],
      PERIOD,
    )
    expect(clientOf(out).paymentDate).toBe('2026-08-20')

    const bothDated = overlayClientCollection(
      monthWithClient(),
      [
        makeReceivable({ id: 'a', collectedAmount: 500, status: 'partial', collectedAt: '2026-08-10' }),
        makeReceivable({ id: 'b', collectedAmount: 500, status: 'partial', collectedAt: '2026-08-12' }),
      ],
      PERIOD,
    )
    expect(clientOf(bothDated).paymentDate).toBe('2026-08-12')
  })

  it('ignores cancelled rows and rows with nothing collected', () => {
    const out = overlayClientCollection(
      monthWithClient(),
      [
        makeReceivable({ id: 'a', collectedAmount: 1_000, status: 'cancelled', collectedAt: '2026-08-28' }),
        makeReceivable({ id: 'b', collectedAmount: 0, status: 'pending', collectedAt: '2026-08-27' }),
        makeReceivable({ id: 'c', collectedAmount: 300, status: 'partial', collectedAt: '2026-08-05' }),
      ],
      PERIOD,
    )
    expect(clientOf(out).paymentDate).toBe('2026-08-05')
  })

  it('leaves a client with no matching receivable untouched', () => {
    const out = overlayClientCollection(monthWithClient(), [], PERIOD)
    expect(clientOf(out).paymentDate).toBeUndefined()
    expect(clientOf(out).paidAmount).toBe(0)
  })
})
