/**
 * /cuentas-corrientes ran ONE running balance over every lane.
 *
 * `running += m.debit - m.credit` across ARS and USD rows alike, rendered through the peso
 * formatter — so an entity with a peso cobro and a dollar cobro carried a "saldo" that
 * subtracts dollars from pesos: a figure in no currency at all, under a "$".
 *
 * The accumulation is now per lane; the aggregates that can only show one number are the
 * peso lane and count what they leave out.
 */
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

    // Peso: 100.000 then 60.000. Dollar: 500 then 300. Under one accumulator the third
    // movement would have read 100.500 - 40.000 = 60.500 — pesos with a dollar folded in.
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
    // `balance` used to read the final movement's running total. With a per-lane
    // accumulator that would be whichever lane happened to move most recently — here USD,
    // which would report a saldo of 300 for a client owing 60.000 pesos.
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
    // Two in September plus one in August: the entity row summarises the whole ledger.
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

/**
 * The balance CARRIES FORWARD, and the first version of the per-lane fix forgot that.
 *
 * `peso[peso.length - 1].balance` with a `: 0` fallback was dead code before the peso
 * filter existed — `statementsForEntity` drops empty statements, so `movements` was never
 * empty. Adding the filter made it live, and a period holding only a dollar cobro reported
 * a peso saldo of ZERO: every earlier peso movement discarded, on the one screen whose job
 * is to state the debt.
 */
describe('a period with no peso movement', () => {
  const carried = [
    entry({ id: 'aug', period: '2026-08-01', debit: 500_000, date: '2026-08-10' }),
    entry({ id: 'sep-usd', period: '2026-09-01', currency: 'USD', debit: 300, date: '2026-09-10' }),
  ]

  it('keeps the peso debt carried in from an earlier period', () => {
    const [september] = statementsForEntity(withRunningBalance(carried), 'cli-1')

    expect(september.period).toBe('2026-09-01')
    // Nothing in pesos happened in September, so `charged` and `settled` are 0 — correct.
    expect(september.charged).toBe(0)
    // But 500.000 is still owed, and this figure is what the screen prints.
    expect(september.balance).toBe(500_000)
    expect(september.otherLaneCount).toBe(1)
  })

  it('reports that debt on the entity row, which reads the NEWEST period', () => {
    const entity = entityFromEntries(withRunningBalance(carried), 'cli-1', 'client', 'Acme')
    // `$ 0 · Pendiente` here is what an operator reads as "nothing to chase".
    expect(entity.currentBalance).toBe(500_000)
  })

  it('still reports 0 for an entity that has never had a peso movement', () => {
    // The zero has to remain possible, or the carry-forward is just a different lie.
    const [statement] = statementsForEntity(
      withRunningBalance([entry({ id: 'usd', currency: 'USD', debit: 500 })]),
      'cli-1',
    )
    expect(statement.balance).toBe(0)
  })
})

/**
 * The status badge is a claim about the WHOLE obligation, so it cannot inherit the peso
 * scoping the amounts need. Fed the peso-only totals, it called a period settled entirely
 * in dollars "Pendiente", and a period whose pesos were paid and whose dollars were not
 * "Cobrado".
 */
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
    // And the peso figures beside it stay honestly empty.
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
    // The pesos are settled; the dollars are not. "Cobrado" would close a live debt.
    expect(statement.status).toBe('partial')
  })

  it('never adds one lane to another to decide it', () => {
    // A dollar credit must not settle a peso charge. Under a cross-lane comparison
    // 1.000 charged vs 1.000 settled reads paid; per lane, neither is.
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
