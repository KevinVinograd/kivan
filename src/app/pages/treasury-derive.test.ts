import { describe, expect, it } from 'vitest'
import {
  deriveCommittedItems,
  deriveExpenseCommitments,
  deriveRetainerCommitments,
  deriveSalaryCommitments,
  expenseCategoryToCommitted,
  mergeCommitments,
} from './treasury-derive'
import { clients, teamMembers } from './clients-mock-data'
import { createSeedMonths, SEED_MONTH_ID } from './monthly-operation-mock-data'
import type { CommittedItem } from './treasury-mock-data'

const expenses = createSeedMonths().find((m) => m.id === SEED_MONTH_ID)?.data.expenses ?? []
const START = '2026-06-01'

describe('expenseCategoryToCommitted', () => {
  it('maps expense categories to committed categories', () => {
    expect(expenseCategoryToCommitted('taxes')).toBe('tax')
    expect(expenseCategoryToCommitted('software')).toBe('platform')
    expect(expenseCategoryToCommitted('salaries')).toBe('salaries')
    expect(expenseCategoryToCommitted('office')).toBe('fixed_expense')
    expect(expenseCategoryToCommitted('services')).toBe('fixed_expense')
    expect(expenseCategoryToCommitted('other')).toBe('other')
  })
})

describe('deriveExpenseCommitments', () => {
  const derived = deriveExpenseCommitments(expenses, START)
  it('derives one outflow per recurring (non one_time) expense, marked derived', () => {
    const recurring = expenses.filter((e) => e.recurrence !== 'one_time')
    expect(derived).toHaveLength(recurring.length)
    for (const d of derived) {
      expect(d.direction).toBe('outflow')
      expect(d.source).toBe('derived')
      expect(d.currency).toBe('ARS')
      expect(d.id.startsWith('der-')).toBe(true)
      expect(d.recurrence).not.toBe('one_time')
    }
  })
  it('maps monotributo (fx-004, category taxes) to a tax outflow', () => {
    const mono = derived.find((d) => d.linkedEntityId === 'fx-004')
    expect(mono).toBeDefined()
    expect(mono!.category).toBe('tax')
    expect(mono!.amount).toBe(145000)
  })
})

describe('deriveSalaryCommitments', () => {
  const derived = deriveSalaryCommitments(teamMembers, START)
  it('derives a salaries outflow only for active monthly_fixed/mixed members with an amount', () => {
    for (const d of derived) {
      expect(d.category).toBe('salaries')
      expect(d.direction).toBe('outflow')
      expect(d.recurrence).toBe('monthly')
    }
    const flor = derived.find((d) => d.linkedEntityId === 'tm-flor')
    expect(flor).toBeDefined()
    expect(flor!.amount).toBe(1200000)
    expect(derived.find((d) => d.linkedEntityId === 'tm-mica')).toBeUndefined()
  })

  it('projects the salary in the lane the member is actually paid in', () => {
    const dollars = deriveSalaryCommitments(
      [
        {
          ...teamMembers.find((m) => m.id === 'tm-flor')!,
          compensation: { model: 'monthly_fixed', monthlyAmount: 3_000, currency: 'USD' },
        },
      ],
      START,
    )
    expect(dollars).toHaveLength(1)
    expect(dollars[0].currency).toBe('USD')
  })
})

describe('deriveRetainerCommitments', () => {
  const derived = deriveRetainerCommitments(clients, START)
  it('derives a retainer inflow only for active clients with monthlyFee > 0', () => {
    for (const d of derived) {
      expect(d.category).toBe('retainer')
      expect(d.direction).toBe('inflow')
      expect(d.confidence).toBe('projected')
      expect(d.amount).toBeGreaterThan(0)
      expect(d.currency).toBe('ARS')
    }
    const cafe = derived.find((d) => d.linkedEntityId === 'cli-001')
    expect(cafe).toBeDefined()
    expect(cafe!.amount).toBe(450000)
  })

  it('omits a USD client rather than naming a lane its amount is not in', () => {
    const source = clients.find((c) => c.id === 'cli-001')!
    expect(deriveRetainerCommitments([{ ...source, currency: 'USD' }], START)).toHaveLength(0)
  })

})

describe('deriveCommittedItems', () => {
  it('concatenates expense + salary + retainer derivations', () => {
    const all = deriveCommittedItems({ expenses, teamMembers, clients }, { startDate: START })
    const expected =
      deriveExpenseCommitments(expenses, START).length +
      deriveSalaryCommitments(teamMembers, START).length +
      deriveRetainerCommitments(clients, START).length
    expect(all).toHaveLength(expected)
    expect(all.every((d) => d.source === 'derived')).toBe(true)
  })
})

function makeItem(p: Partial<CommittedItem>): CommittedItem {
  return {
    id: 'x', description: 'x', direction: 'outflow', amount: 1, currency: 'ARS',
    category: 'fixed_expense', recurrence: 'monthly', startDate: '2026-06-01',
    anchorDay: 10, confidence: 'committed', source: 'derived', isActive: true, ...p,
  }
}

describe('mergeCommitments', () => {
  it('manual overrides derived by linkedEntityId', () => {
    const derived = [makeItem({ id: 'der-fx-002', linkedEntityId: 'fx-002', amount: 450000 })]
    const manual = [makeItem({ id: 'cmt-001', linkedEntityId: 'fx-002', amount: 500000, source: 'manual' })]
    const merged = mergeCommitments(derived, manual)
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('cmt-001')
    expect(merged[0].amount).toBe(500000)
  })
  it('keeps derived items that have no manual override, and adds manual-only items', () => {
    const derived = [makeItem({ id: 'der-fx-002', linkedEntityId: 'fx-002' })]
    const manual = [makeItem({ id: 'cmt-001', source: 'manual' })]
    const merged = mergeCommitments(derived, manual)
    expect(merged.map((m) => m.id).sort()).toEqual(['cmt-001', 'der-fx-002'])
  })
})
