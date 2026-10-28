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
    // The mapper sets this to the row's createdAt, so it is deliberately far from any
    // collection date below — a fixture that used the same day could not catch the bug.
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

/**
 * `paymentDate` here is what Operación mensual renders under "Fecha de cobro" — on the same
 * screen that captures it. It used to read `lastActivityAt` (the row's createdAt) for every
 * row, so the operator entered one day and the panel showed another.
 */
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
    // '2026-08-20T10:00:00.000Z' is midday UTC, so the local day is the 20th either way.
    expect(out.clients[0].paymentDate).toBe('2026-08-20')
  })

  it('does not let one legacy row outrank every real collection date', () => {
    // The legacy row's createdAt (the 20th) is LATER than the real collection (the 10th).
    // Comparing raw shapes lexicographically would report the 20th — a day on which
    // nothing was collected — as the client's collection date.
    const out = overlayClientCollection(
      monthWithClient(),
      [
        makeReceivable({ id: 'a', collectedAmount: 500, status: 'partial', collectedAt: '2026-08-10' }),
        makeReceivable({ id: 'b', collectedAmount: 500, status: 'partial', collectedAt: undefined }),
      ],
      PERIOD,
    )
    // The fallback row genuinely has no better date, so the max is still the 20th — but it
    // is compared as a DAY, not as a longer string that always wins.
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
