import { describe, expect, it } from 'vitest'

import type { Client } from './clients-mock-data'
import { portfolioTotals } from './clients-summary-kpis'

function client(overrides: Partial<Client> = {}): Client {
  return {
    id: 'c1',
    name: 'Uno',
    status: 'active',
    services: [],
    assignedTeam: [],
    monthlyFee: 1000,
    currency: 'ARS',
    paymentStatus: 'pending',
    currentMonthPaidAmount: 0,
    currentMonthDueAmount: 1000,
    invoiceStatus: 'not_issued',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('portfolioTotals', () => {
  it('sums the ARS lane', () => {
    const totals = portfolioTotals([
      client({ id: 'a' }),
      client({ id: 'b', monthlyFee: 500, currentMonthDueAmount: 500 }),
    ])
    expect(totals.mrr).toBe(1500)
    expect(totals.outstanding).toBe(1500)
    expect(totals.otherLaneCount).toBe(0)
  })

  it('never adds a non-ARS fee into the peso total', () => {
    const totals = portfolioTotals([
      client({ id: 'ars', monthlyFee: 1000, currentMonthDueAmount: 1000 }),
      client({ id: 'usd', monthlyFee: 3000, currentMonthDueAmount: 3000, currency: 'USD' }),
      client({ id: 'usd2', monthlyFee: 7000, currentMonthDueAmount: 7000, currency: 'USD' }),
    ])
    expect(totals.mrr).toBe(1000)
    expect(totals.outstanding).toBe(1000)
  })

  it('counts the excluded clients so the omission is visible, not silent', () => {
    const totals = portfolioTotals([
      client({ id: 'ars' }),
      client({ id: 'usd', currency: 'USD' }),
      client({ id: 'usd2', currency: 'USD' }),
    ])
    expect(totals.otherLaneCount).toBe(2)
  })

  it('counts every client as active/total regardless of lane', () => {
    const totals = portfolioTotals([
      client({ id: 'ars' }),
      client({ id: 'usd', currency: 'USD' }),
      client({ id: 'churned', status: 'churned' }),
    ])
    expect(totals.activeCount).toBe(2)
    expect(totals.totalCount).toBe(3)
  })

  it('excludes paid clients from outstanding and never goes negative', () => {
    const totals = portfolioTotals([
      client({ id: 'paid', paymentStatus: 'paid' }),
      client({ id: 'over', currentMonthDueAmount: 500, currentMonthPaidAmount: 900 }),
    ])
    expect(totals.outstanding).toBe(0)
  })
})
