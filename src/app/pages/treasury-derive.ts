import type { CommittedCategory, CommittedItem } from './treasury-mock-data'
import type { Client, TeamMember } from './clients-mock-data'
import { netMonthlyFee } from './clients-format'
import type { ExpenseCategory, FixedExpense } from './monthly-operation-mock-data'

const EXPENSE_ANCHOR_DAY = 10
const SALARY_ANCHOR_DAY = 5
const RETAINER_ANCHOR_DAY = 8

export function expenseCategoryToCommitted(category: string): CommittedCategory {
  switch (category as ExpenseCategory) {
    case 'taxes':
      return 'tax'
    case 'software':
      return 'platform'
    case 'salaries':
      return 'salaries'
    case 'office':
    case 'services':
      return 'fixed_expense'
    case 'other':
      return 'other'
  }
}

export function deriveExpenseCommitments(expenses: FixedExpense[], startDate: string): CommittedItem[] {
  return expenses
    .filter((e) => e.recurrence !== 'one_time')
    .map((e) => ({
      id: `der-${e.id}`,
      description: e.concept,
      direction: 'outflow' as const,
      amount: e.amount,
      currency: 'ARS' as const,
      category: expenseCategoryToCommitted(e.category),
      recurrence: e.recurrence,
      startDate,
      anchorDay: EXPENSE_ANCHOR_DAY,
      confidence: 'committed' as const,
      source: 'derived' as const,
      linkedEntityId: e.id,
      isActive: true,
    }))
}

export function deriveSalaryCommitments(teamMembers: TeamMember[], startDate: string): CommittedItem[] {
  return teamMembers.flatMap((m) => {
    if (m.status !== 'active') return []
    if (m.compensation.model !== 'monthly_fixed' && m.compensation.model !== 'mixed') return []
    const amount = m.compensation.monthlyAmount
    if (amount == null) return []
    return [
      {
        id: `der-${m.id}`,
        description: `Sueldo ${m.name}`,
        direction: 'outflow' as const,
        amount,
        currency: m.compensation.currency,
        category: 'salaries' as const,
        recurrence: 'monthly' as const,
        startDate,
        anchorDay: SALARY_ANCHOR_DAY,
        confidence: 'committed' as const,
        source: 'derived' as const,
        linkedEntityType: 'teamMember' as const,
        linkedEntityId: m.id,
        isActive: true,
      },
    ]
  })
}

export function deriveRetainerCommitments(clients: Client[], startDate: string): CommittedItem[] {
  return clients
    .filter((c) => c.currency !== 'USD')
    .filter((c) => c.status === 'active' && c.monthlyFee > 0)
    .map((c) => ({
      id: `der-${c.id}`,
      description: `Abono ${c.name}`,
      direction: 'inflow' as const,
      amount: netMonthlyFee(c),
      currency: c.currency,
      category: 'retainer' as const,
      recurrence: 'monthly' as const,
      startDate,
      anchorDay: RETAINER_ANCHOR_DAY,
      confidence: 'projected' as const,
      source: 'derived' as const,
      linkedEntityType: 'client' as const,
      linkedEntityId: c.id,
      isActive: true,
    }))
}

export type DeriveSources = {
  expenses: FixedExpense[]
  teamMembers: TeamMember[]
  clients: Client[]
}

export function deriveCommittedItems(
  sources: DeriveSources,
  opts: { startDate: string },
): CommittedItem[] {
  return [
    ...deriveExpenseCommitments(sources.expenses, opts.startDate),
    ...deriveSalaryCommitments(sources.teamMembers, opts.startDate),
    ...deriveRetainerCommitments(sources.clients, opts.startDate),
  ]
}

export function mergeCommitments(derived: CommittedItem[], manual: CommittedItem[]): CommittedItem[] {
  const overridden = new Set(
    manual.map((m) => m.linkedEntityId).filter((id): id is string => id != null),
  )
  const keptDerived = derived.filter(
    (d) => !(d.linkedEntityId != null && overridden.has(d.linkedEntityId)),
  )
  return [...keptDerived, ...manual]
}
