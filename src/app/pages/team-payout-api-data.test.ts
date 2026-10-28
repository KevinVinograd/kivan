import { describe, expect, it, vi } from 'vitest'

import { monthlyApi } from '@/api/monthly'
import type { PayoutStatementDto } from '@/api/payouts'
import {
  fetchPeriodPayouts,
  payoutPaymentStatus,
  payoutToStatement,
  payoutsByMember,
} from './team-payout-api-data'

/** A canonical payout row; each test overrides only the field it is about. */
function dto(overrides: Partial<PayoutStatementDto> = {}): PayoutStatementDto {
  return {
    id: 'payout-1',
    teamMemberId: 'member-1',
    period: '2026-07-01',
    baseAmountMinor: '30000000',
    productionsAmountMinor: '5000000',
    viaticsAmountMinor: '1200000',
    adjustmentsTotalMinor: '800000',
    totalAmountMinor: '37000000',
    paidAmountMinor: '0',
    outstandingMinor: '37000000',
    // null on both = NOT RECORDED, the default state for every statement
    // predating attribution. Overridden per-test where hours matter.
    hoursTotal: null,
    hourlyRateMinor: null,
    statementStatus: 'draft',
    bankId: null,
    bankProfile: null,
    dueDate: null,
  paidAt: null,
    approvedAt: null,
    approvedByUserId: null,
    version: 0,
    createdAt: '2026-07-01T10:00:00.000Z',
    adjustments: [],
    ...overrides,
  }
}

describe('payoutPaymentStatus', () => {
  it('reads a draft statement as pending', () => {
    expect(payoutPaymentStatus(dto({ statementStatus: 'draft' }))).toBe('pending')
  })

  it('reads an approved statement with nothing paid as approved', () => {
    expect(
      payoutPaymentStatus(
        dto({ statementStatus: 'approved', paidAmountMinor: '0', outstandingMinor: '37000000' }),
      ),
    ).toBe('approved')
  })

  it('reads an approved statement with a partial payment as a difference', () => {
    expect(
      payoutPaymentStatus(
        dto({
          statementStatus: 'approved',
          paidAmountMinor: '20000000',
          outstandingMinor: '17000000',
        }),
      ),
    ).toBe('with_difference')
  })

  it('reads a dispatched statement as in process regardless of the balance', () => {
    expect(payoutPaymentStatus(dto({ statementStatus: 'dispatched', outstandingMinor: '0' }))).toBe(
      'processing',
    )
    expect(
      payoutPaymentStatus(dto({ statementStatus: 'dispatched', outstandingMinor: '17000000' })),
    ).toBe('processing')
  })

  it('reads a fully settled confirmed statement as paid', () => {
    expect(
      payoutPaymentStatus(
        dto({ statementStatus: 'confirmed', paidAmountMinor: '37000000', outstandingMinor: '0' }),
      ),
    ).toBe('paid')
  })

  /**
   * The case the status alone cannot express, and the reason this derivation exists:
   * the transfer cleared for less than the total. Reading `statementStatus` on its own
   * would call it "Pagado" and the outstanding balance would disappear from the module.
   */
  it('reads a short-paid confirmed statement as a difference, never as paid', () => {
    expect(
      payoutPaymentStatus(
        dto({
          statementStatus: 'confirmed',
          paidAmountMinor: '30000000',
          outstandingMinor: '7000000',
        }),
      ),
    ).toBe('with_difference')
  })
})

describe('payoutToStatement', () => {
  it('converts every amount from minor units', () => {
    const statement = payoutToStatement(dto(), '2026-07')
    expect(statement.baseAmount).toBe(300000)
    expect(statement.productionsAmount).toBe(50000)
    expect(statement.expensesAmount).toBe(12000)
    expect(statement.adjustmentsAmount).toBe(8000)
    expect(statement.totalAmount).toBe(370000)
    expect(statement.differenceAmount).toBe(370000)
  })

  /** Every lifecycle call is addressed to this id, so a synthesized one would 404. */
  it('carries the server payout id, not one derived from the member', () => {
    expect(payoutToStatement(dto({ id: 'payout-xyz' }), '2026-07').id).toBe('payout-xyz')
  })

  /** Zero because there is no server model, not because the member earned nothing. */
  it('zeroes the three lines the API does not model', () => {
    const statement = payoutToStatement(dto(), '2026-07')
    expect(statement.hoursAmount).toBe(0)
    expect(statement.extrasAmount).toBe(0)
    expect(statement.deductionsAmount).toBe(0)
  })

  it("takes the row's own due date when the plan set one", () => {
    expect(payoutToStatement(dto({ dueDate: '2026-07-22' }), '2026-07').dueDate).toBe('2026-07-22')
  })

  it('falls back to the studio payday when the row has no due date', () => {
    expect(payoutToStatement(dto({ dueDate: null }), '2026-07').dueDate).toBe('2026-07-10')
  })

  it('trims a full ISO timestamp down to the date', () => {
    expect(payoutToStatement(dto({ dueDate: '2026-07-22T00:00:00.000Z' }), '2026-07').dueDate).toBe(
      '2026-07-22',
    )
  })

  /**
   * The API records the approval date and no settlement date. Passing `approvedAt`
   * off as `paidAt` would date the payment on the day it was authorized — and the
   * colaboradora ledger posts its movement on exactly that field.
   */
  it('never passes the approval date off as a payment date', () => {
    const settled = payoutToStatement(
      dto({
        statementStatus: 'confirmed',
        paidAmountMinor: '37000000',
        outstandingMinor: '0',
        approvedAt: '2026-07-14T12:00:00.000Z',
      }),
      '2026-07',
    )
    expect(settled.approvedAt).toBe('2026-07-14')
    expect(settled.paidAt).toBeUndefined()
  })

  it('stamps the month it was asked for', () => {
    expect(payoutToStatement(dto(), '2026-07').month).toBe('2026-07')
  })
})

describe('payoutsByMember', () => {
  it('keys the statements by member', () => {
    const map = payoutsByMember(
      [dto({ id: 'p1', teamMemberId: 'm1' }), dto({ id: 'p2', teamMemberId: 'm2' })],
      '2026-07',
    )
    expect(map.m1.id).toBe('p1')
    expect(map.m2.id).toBe('p2')
  })

  /** The absence must stay an absence: a zero-filled statement here is what let the
   *  module show a total for somebody who has no plan for the month. */
  it('leaves a member with no statement absent rather than zeroed', () => {
    const map = payoutsByMember([dto({ teamMemberId: 'm1' })], '2026-07')
    expect(map.m2).toBeUndefined()
    expect(Object.keys(map)).toEqual(['m1'])
  })
})

describe('fetchPeriodPayouts', () => {
  /**
   * The plan route validates `period must be YYYY-MM` and 400s on the `YYYY-MM-01`
   * period the rest of the app passes around. Passing the wrong one made every member
   * read "Sin plan del mes" against a month that had plans — and no route stub could
   * catch it, because a glob matches both shapes.
   */
  it('asks for the MONTH id, never the YYYY-MM-01 period', async () => {
    const getBundle = vi
      .spyOn(monthlyApi, 'getBundle')
      .mockResolvedValue({ payouts: [dto()] } as unknown as Awaited<ReturnType<typeof monthlyApi.getBundle>>)

    const payouts = await fetchPeriodPayouts('2026-07')

    expect(getBundle).toHaveBeenCalledWith('2026-07')
    expect(getBundle).not.toHaveBeenCalledWith('2026-07-01')
    expect(payouts).toHaveLength(1)
    getBundle.mockRestore()
  })
})
