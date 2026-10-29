import { describe, expect, it } from 'vitest'

import { entityFromEntries, statementsForEntity } from './account-ledger-format'
import { withRunningBalance } from './account-ledger-mock-data'
import type { LedgerEntry } from './account-ledger-types'

function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: 'led-1',
    entityType: 'client',
    entityId: 'cli-1',
    period: '2026-09-01',
    type: 'charge',
    description: 'Cobro',
    debit: 0,
    credit: 0,
    currency: 'ARS',
    balance: 0,
    date: '2026-09-05',
    ...over,
  }
}

describe('the running balance is per lane', () => {
  const entries = [
    entry({ id: 'a', debit: 100_000, date: '2026-09-01' }),
    entry({ id: 'b', currency: 'USD', debit: 500, date: '2026-09-02' }),
    entry({ id: 'c', credit: 40_000, type: 'collection', date: '2026-09-03' }),
    entry({ id: 'd', currency: 'USD', credit: 200, type: 'collection', date: '2026-09-04' }),
  ]

  it('never lets one lane move another lane balance', () => {
    const [statement] = statementsForEntity(withRunningBalance(entries), 'cli-1')
    const balanceOf = (id: string) => statement.movements.find((m) => m.id === id)?.balance

    expect(balanceOf('a')).toBe(100_000)
    expect(balanceOf('c')).toBe(60_000)
    expect(balanceOf('b')).toBe(500)
    expect(balanceOf('d')).toBe(300)
  })

  it('scopes the statement figures to pesos and counts the rest', () => {
    const [statement] = statementsForEntity(withRunningBalance(entries), 'cli-1')

    expect(statement.charged).toBe(100_000)
    expect(statement.settled).toBe(40_000)
    expect(statement.balance).toBe(60_000)
    expect(statement.otherLaneCount).toBe(2)
  })

  it('does not let the LAST movement decide which lane the statement balance is in', () => {
    const [statement] = statementsForEntity(withRunningBalance(entries), 'cli-1')
    expect(statement.balance).not.toBe(300)
  })

  it('reports a zero peso balance, not a foreign one, for an entity billed only in USD', () => {
    const [statement] = statementsForEntity(
      withRunningBalance([entry({ id: 'usd', currency: 'USD', debit: 500 })]),
      'cli-1',
    )
    expect(statement.balance).toBe(0)
    expect(statement.charged).toBe(0)
    expect(statement.otherLaneCount).toBe(1)
  })

  it('carries the omission up to the entity row, across every period', () => {
    const entity = entityFromEntries(
      withRunningBalance([
        ...entries,
        entry({ id: 'old', currency: 'USD', period: '2026-08-01', debit: 9, date: '2026-08-01' }),
      ]),
      'cli-1',
      'client',
      'Cliente Uno',
    )

    expect(entity.currentBalance).toBe(60_000)
    expect(entity.otherLaneCount).toBe(3)
  })

  it('says nothing about other lanes when there are none', () => {
    const entity = entityFromEntries(
      withRunningBalance([entry({ debit: 1_000 })]),
      'cli-1',
      'client',
      'Cliente Uno',
    )
    expect(entity.otherLaneCount).toBe(0)
    expect(entity.currentBalance).toBe(1_000)
  })
})

describe('a period with no peso movement', () => {
  const carried = [
    entry({ id: 'aug', period: '2026-08-01', debit: 500_000, date: '2026-08-10' }),
    entry({ id: 'sep-usd', period: '2026-09-01', currency: 'USD', debit: 300, date: '2026-09-10' }),
  ]

  it('keeps the peso debt carried in from an earlier period', () => {
    const [september] = statementsForEntity(withRunningBalance(carried), 'cli-1')

    expect(september.period).toBe('2026-09-01')
    expect(september.charged).toBe(0)
    expect(september.balance).toBe(500_000)
    expect(september.otherLaneCount).toBe(1)
  })

  it('reports that debt on the entity row, which reads the NEWEST period', () => {
    const entity = entityFromEntries(withRunningBalance(carried), 'cli-1', 'client', 'Acme')
    expect(entity.currentBalance).toBe(500_000)
  })

  it('still reports 0 for an entity that has never had a peso movement', () => {
    const [statement] = statementsForEntity(
      withRunningBalance([entry({ id: 'usd', currency: 'USD', debit: 500 })]),
      'cli-1',
    )
    expect(statement.balance).toBe(0)
  })
})

describe('the statement status is decided lane by lane', () => {
  it('reads paid when a period was settled entirely in another lane', () => {
    const [statement] = statementsForEntity(
      withRunningBalance([
        entry({ id: 'c', currency: 'USD', debit: 500, date: '2026-09-01' }),
        entry({ id: 's', currency: 'USD', credit: 500, type: 'collection', date: '2026-09-02' }),
      ]),
      'cli-1',
    )
    expect(statement.status).toBe('paid')
    expect(statement.charged).toBe(0)
  })

  it('does not read paid while one lane is still outstanding', () => {
    const [statement] = statementsForEntity(
      withRunningBalance([
        entry({ id: 'ars-c', debit: 1_000, date: '2026-09-01' }),
        entry({ id: 'ars-s', credit: 1_000, type: 'collection', date: '2026-09-02' }),
        entry({ id: 'usd-c', currency: 'USD', debit: 500, date: '2026-09-03' }),
      ]),
      'cli-1',
    )
    expect(statement.status).toBe('partial')
  })

  it('never adds one lane to another to decide it', () => {
    const [statement] = statementsForEntity(
      withRunningBalance([
        entry({ id: 'ars-c', debit: 1_000, date: '2026-09-01' }),
        entry({ id: 'usd-s', currency: 'USD', credit: 1_000, type: 'collection', date: '2026-09-02' }),
      ]),
      'cli-1',
    )
    expect(statement.status).not.toBe('paid')
  })
})
