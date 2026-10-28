/**
 * Cashflow committed-items derivation (pure). Turns the canonical recurring
 * source records — fixed expenses (incl. monotributo, which is just a
 * `category: 'taxes'` FixedExpense), team salaries, and client retainers —
 * into derived CommittedItem[] for the treasury register. ARS-only (v1).
 *
 * Derived ids are `der-<sourceEntityId>` so they never collide with the
 * `cmt-NNN` ids minted for manual items.
 */
import type { CommittedCategory, CommittedItem } from './treasury-mock-data'
import type { Client, TeamMember } from './clients-mock-data'
import { netMonthlyFee } from './clients-format'
import type { ExpenseCategory, FixedExpense } from './monthly-operation-mock-data'

const EXPENSE_ANCHOR_DAY = 10
const SALARY_ANCHOR_DAY = 5
const RETAINER_ANCHOR_DAY = 8

/**
 * Map an expense category onto the cashflow's committed bucket. Takes a plain string
 * because a studio can define its own categories: anything outside the built-in set has
 * no known bucket and falls through to `fixed_expense` — the neutral "a recurring cost
 * the studio pays" bucket — rather than being silently dropped out of the projection.
 */
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
      // A STATED ASSUMPTION, not a discarded field: `FixedExpense` has no currency column
      // at any layer, so there is nothing to read here. Contrast the salary and retainer
      // derivations below, where the lane WAS available and pinning it was a bug.
      currency: 'ARS' as const,
      category: expenseCategoryToCommitted(e.category),
      recurrence: e.recurrence,
      startDate,
      anchorDay: EXPENSE_ANCHOR_DAY,
      confidence: 'committed' as const,
      source: 'derived' as const,
      // An id with NO type, deliberately. `mergeCommitments` uses this field to let a
      // manual item override the derived one it replaces, and a fixed expense has no
      // counterparty kind to declare: `Payment` carries no `fixedExpenseId`, so nothing
      // on the money side could ever match it. The projection reads the PAIR (see
      // `treasury-netting.ts`), so a bare id here correctly reads as unlinked and the
      // occurrence nets on the category key instead.
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
        // The lane the member is actually paid in — the field was right there on
        // `compensation` and the commitment type has carried a `currency` all along.
        //
        // NOTE: nothing imports this module today (`CashflowPage` takes its commitments
        // straight from `/treasury/commitments`), so this changes no rendered figure. It
        // is the correct value for whenever it IS wired up, not a fix to a live defect.
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
    // A USD client is EXCLUDED, not relabelled. `priceFor` bills that retainer in pesos at
    // the month's stamped rate, so the lane is ARS — but the amount here is
    // `netMonthlyFee`, which is denominated in dollars, and this pure function has no rate
    // to convert it with. Labelling a dollar amount 'ARS' states a peso figure that is
    // wrong by the exchange rate; labelling it 'USD' files the projection in a lane no
    // cobro of theirs will ever land in. Omitting it is the only honest option left, and
    // the Cashflow projection is a forecast rather than a ledger.
    .filter((c) => c.currency !== 'USD')
    .filter((c) => c.status === 'active' && c.monthlyFee > 0)
    .map((c) => ({
      id: `der-${c.id}`,
      description: `Abono ${c.name}`,
      direction: 'inflow' as const,
      // Net of the client's standing discount, like every other contract-derived figure
      // (MRR, Valor acumulado). This is a projection of cash the studio expects to
      // RECEIVE, and it will never receive the gross retainer from a discounted client.
      amount: netMonthlyFee(c),
      // Every remaining lane is billed in itself (`priceFor` reprices only USD, and USD
      // is filtered out above), so the amount and the lane name the same unit.
      //
      // Same caveat as the salaries above: nothing imports this module today.
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

/** Manual items override derived ones sharing a linkedEntityId; manual items
 *  without a linkedEntityId are pure additions. */
export function mergeCommitments(derived: CommittedItem[], manual: CommittedItem[]): CommittedItem[] {
  const overridden = new Set(
    manual.map((m) => m.linkedEntityId).filter((id): id is string => id != null),
  )
  const keptDerived = derived.filter(
    (d) => !(d.linkedEntityId != null && overridden.has(d.linkedEntityId)),
  )
  return [...keptDerived, ...manual]
}
