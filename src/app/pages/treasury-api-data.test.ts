import { describe, expect, it, vi } from 'vitest'

import type { CommittedItemDto, TreasuryAccountDto } from '@/api/treasury'
import { treasuryApi } from '@/api/treasury'
import { dtoToAccount, dtoToCommitment, fetchTreasuryMovements } from './treasury-api-data'

function accountDto(overrides: Partial<TreasuryAccountDto> = {}): TreasuryAccountDto {
  return {
    id: 'acc-1',
    name: 'Caja ARS',
    partner: 'estudio',
    type: 'bank',
    balanceArsMinor: '0',
    balanceUsdMinor: '0',
    isReserve: false,
    note: null,
    isActive: true,
    version: 3,
    ...overrides,
  }
}

function commitmentDto(overrides: Partial<CommittedItemDto> = {}): CommittedItemDto {
  return {
    id: 'com-1',
    description: 'Alquiler',
    direction: 'outflow',
    amountMinor: '25000000',
    currency: 'ARS',
    category: 'fixed_expense',
    recurrence: 'monthly',
    startDate: '2026-06-01',
    endDate: null,
    anchorDay: 10,
    confidence: 'committed',
    source: 'manual',
    observations: null,
    isActive: true,
    version: 1,
    linkedEntityType: null,
    linkedEntityId: null,
    ...overrides,
  }
}

describe('dtoToAccount', () => {
  it('only populates the non-zero balance lanes', () => {
    const a = dtoToAccount(accountDto({ balanceArsMinor: '150000', balanceUsdMinor: '0' }))
    expect(a.balances.ARS).toBe(1500)
    expect(a.balances).not.toHaveProperty('USD')
  })

  it('populates every lane when all are non-zero (incl. negative)', () => {
    const a = dtoToAccount(accountDto({ balanceArsMinor: '-5000', balanceUsdMinor: '10000' }))
    expect(a.balances).toEqual({ ARS: -50, USD: 100 })
  })

  it('normalizes isReserve false → undefined and passes version + note through', () => {
    expect(dtoToAccount(accountDto({ isReserve: false })).isReserve).toBeUndefined()
    expect(dtoToAccount(accountDto({ isReserve: true })).isReserve).toBe(true)
    expect(dtoToAccount(accountDto({ note: 'reserva' })).note).toBe('reserva')
    expect(dtoToAccount(accountDto({ note: null })).note).toBeUndefined()
    expect(dtoToAccount(accountDto({ version: 7 })).version).toBe(7)
  })
})

describe('dtoToCommitment', () => {
  it('converts the amount and passes version/isActive/anchorDay through', () => {
    const c = dtoToCommitment(commitmentDto({ amountMinor: '25000000', anchorDay: 15, version: 4 }))
    expect(c.amount).toBe(250000)
    expect(c.anchorDay).toBe(15)
    expect(c.version).toBe(4)
    expect(c.isActive).toBe(true)
  })

  it('narrows direction to inflow/outflow', () => {
    expect(dtoToCommitment(commitmentDto({ direction: 'inflow' })).direction).toBe('inflow')
    expect(dtoToCommitment(commitmentDto({ direction: 'outflow' })).direction).toBe('outflow')
    expect(dtoToCommitment(commitmentDto({ direction: 'sideways' })).direction).toBe('outflow')
  })

  it('falls back to safe enums for unknown category/recurrence/confidence', () => {
    const c = dtoToCommitment(
      commitmentDto({ category: 'weird', recurrence: 'weird', confidence: 'weird' }),
    )
    expect(c.category).toBe('other')
    expect(c.recurrence).toBe('monthly')
    expect(c.confidence).toBe('committed')
    expect(dtoToCommitment(commitmentDto({ category: null })).category).toBe('other')
  })

  it('maps source and clears a null endDate', () => {
    expect(dtoToCommitment(commitmentDto({ source: 'derived' })).source).toBe('derived')
    expect(dtoToCommitment(commitmentDto({ source: 'manual' })).source).toBe('manual')
    expect(dtoToCommitment(commitmentDto({ endDate: null })).endDate).toBeUndefined()
    expect(dtoToCommitment(commitmentDto({ endDate: '2026-12-31' })).endDate).toBe('2026-12-31')
  })
})

describe('fetchTreasuryMovements', () => {
  it('reads the amount in pesos, and keeps the direction the API reported', async () => {
    vi.spyOn(treasuryApi, 'listMovements').mockResolvedValue({
      items: [],
      totals: [
        { accountId: 'acc-1', lane: 'ARS', direction: 'outflow', amountMinor: '25000000' },
      ],
    })

    const [movement] = await fetchTreasuryMovements('2026-06-01')
    expect(movement?.amount).toBe(250_000)
    expect(movement?.direction).toBe('outflow')
  })

  it('sums the server totals and ignores the paged rows entirely', async () => {
    vi.spyOn(treasuryApi, 'listMovements').mockResolvedValue({
      items: [
        {
          id: 'mov-1',
          accountId: 'acc-1',
          date: '2026-06-15',
          direction: 'inflow',
          lane: 'ARS',
          amountMinor: '1',
          description: 'only the first page',
          referenceType: 'receivable',
          referenceId: 'rec-1',
        },
      ],
      totals: [{ accountId: 'acc-1', lane: 'ARS', direction: 'inflow', amountMinor: '680000000' }],
    })

    const movements = await fetchTreasuryMovements('2026-06-01')
    expect(movements).toHaveLength(1)
    expect(movements[0]?.amount).toBe(6_800_000)
  })

  it('asks for nothing without an anchor — "since when" is the whole meaning', async () => {
    const spy = vi.spyOn(treasuryApi, 'listMovements')
    expect(await fetchTreasuryMovements(undefined)).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })

  it('treats any direction that is not an outflow as an inflow', async () => {
    vi.spyOn(treasuryApi, 'listMovements').mockResolvedValue({
      items: [],
      totals: [{ accountId: 'acc-1', lane: 'ARS', direction: 'inflow', amountMinor: '100' }],
    })
    expect((await fetchTreasuryMovements('2026-06-01'))[0]?.direction).toBe('inflow')
  })
})
