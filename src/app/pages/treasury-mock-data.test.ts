import { describe, expect, it } from 'vitest'
import { CURRENCIES } from './treasury-position'
import { seedAccounts, seedCashAccount, seedCommittedItems } from './treasury-mock-data'

describe('treasury seed', () => {
  it('has one active ARS opening account anchored to a month start', () => {
    expect(seedCashAccount.isActive).toBe(true)
    expect(seedCashAccount.currency).toBe('ARS')
    expect(seedCashAccount.openingBalanceDate).toMatch(/^\d{4}-\d{2}-01$/)
    expect(typeof seedCashAccount.openingBalance).toBe('number')
  })

  it('seeds committed items with valid anchorDay and a startDate', () => {
    expect(seedCommittedItems.length).toBeGreaterThan(0)
    for (const item of seedCommittedItems) {
      expect(item.anchorDay).toBeGreaterThanOrEqual(1)
      expect(item.anchorDay).toBeLessThanOrEqual(28)
      expect(item.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(['inflow', 'outflow']).toContain(item.direction)
    }
  })
})

describe('seedAccounts', () => {
  it('seeds unique active accounts with valid partner/type/lane balances', () => {
    expect(seedAccounts.length).toBeGreaterThan(0)
    expect(new Set(seedAccounts.map((a) => a.id)).size).toBe(seedAccounts.length)
    for (const account of seedAccounts) {
      expect(account.isActive).toBe(true)
      expect(['vicky', 'flor', 'more', 'shared']).toContain(account.partner)
      expect(['bank', 'cash', 'investment']).toContain(account.type)
      const lanes = Object.keys(account.balances)
      expect(lanes.length).toBeGreaterThan(0)
      for (const lane of lanes) {
        expect(CURRENCIES).toContain(lane)
        expect(typeof account.balances[lane as (typeof CURRENCIES)[number]]).toBe('number')
      }
    }
  })

  it('includes both operating and reserve accounts, and an investment bucket', () => {
    expect(seedAccounts.some((a) => !a.isReserve)).toBe(true)
    expect(seedAccounts.some((a) => a.isReserve)).toBe(true)
    expect(seedAccounts.some((a) => a.type === 'investment' && a.balances.ARS != null)).toBe(true)
  })
})
