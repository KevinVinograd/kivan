/**
 * The netting pass behind `projectCashflow`: deciding which real money already accounts
 * for which commitment occurrence, so the projection counts it once.
 *
 * Its own module because `treasury-format.ts` crossed the 300-line limit in
 * the convention once this landed, and because the rule here is the part of the
 * engine that has been got wrong the most times and deserves to be readable on its own.
 */
import { addMonths, isBefore, isSameISOWeek, parseISO, startOfMonth } from 'date-fns'

import type { CashflowLine, DatedLine, EntityRef } from './treasury-format'
import type { CommittedItem } from './treasury-mock-data'

/** One counterparty's money, and what is left of it after occurrences take their share. */
export type PoolLine = { at: Date; remaining: number }

/** One expansion of a commitment onto a date inside the projection window. */
export type Occurrence = { item: CommittedItem; at: Date; idx: number }

/**
 * Amounts are pesos (major units) held as floats, so a fully consumed occurrence can be
 * left with a few 1e-13 instead of exactly zero. Below a hundredth of a peso there is
 * nothing left to owe, and treating it as a residual pushes a phantom "$0" committed line
 * into the week and into every rollup that reads it.
 */
const NOTHING_LEFT = 0.005

/** Normalize category for the fallback key: committed retainers match actual collections. */
export function dedupCategory(category: CashflowLine['category']): string {
  return category === 'retainer' ? 'collection' : category
}

/**
 * Pool key when the expectation names a counterparty. Direction rides along so an inflow
 * can never consume an outflow; the CATEGORY deliberately does not.
 *
 * The original reason was that the entity kind determined the category — a pago naming a
 * provider was always `other`. That stopped being true once a gasto fijo and a plataforma
 * could name a provider too, so the real reason is the one that survives: the pago and the
 * commitment classify the SAME money independently, and they disagree routinely. The rent
 * filed as `fixed_expense` is paid on a pago whose `recipientType` may well be `provider`
 * (category `other`). Keying on the pair would refuse that match and project the rent on
 * top of the payment that already made it.
 *
 * The cost is that two commitments on one provider — the rent and a one-off repair —
 * share a bucket and can take each other's money. That misattributes; it never double
 * counts, which is the invariant this pass exists for.
 */
function entityKey(direction: CashflowLine['direction'], entity: EntityRef): string {
  return `${direction}|${entity.type}|${entity.id}`
}

/** Pool key when it does not. Coarser, and that is the whole difference. */
function categoryKey(direction: CashflowLine['direction'], category: CashflowLine['category']): string {
  return `${direction}|${dedupCategory(category)}`
}

/** How many months of money an occurrence may absorb, by cadence. `one_time` is bounded
 *  like the rest: letting it run to the end of the window meant a single one-off could
 *  swallow months of the same counterparty's recurring pagos, and then the recurring
 *  commitment re-projected its own amount into the wrong week. */
const REALIZATION_SPAN_MONTHS = { monthly: 1, quarterly: 3, annual: 12, one_time: 1 } as const

/**
 * Does money that moved on `moneyAt` plausibly realize the expectation `occ`?
 *
 * The pool key says the money is with the right counterparty (or at least in the right
 * category); this says it is at the right TIME. Two windows, unioned, both load-bearing:
 *
 * - The occurrence's own RECURRENCE PERIOD, counted from the first of its month. Anchoring
 *   to the month is what the original ISO-week key got wrong: every commitment anchors to a
 *   day of the MONTH, so a retainer due the 10th and collected on the 2nd never matched and
 *   the month was counted as both collected and expected.
 * - The same ISO WEEK, which bridges month boundaries. An anchor on the 1st is the
 *   commonest there is and its money routinely moves in the last days of the previous
 *   month: different months, same week. A month-only rule regressed exactly that.
 */
export function realizes(moneyAt: Date, occ: Occurrence): boolean {
  if (isSameISOWeek(moneyAt, occ.at)) return true
  const from = startOfMonth(occ.at)
  const to = addMonths(from, REALIZATION_SPAN_MONTHS[occ.item.recurrence])
  return !isBefore(moneyAt, from) && isBefore(moneyAt, to)
}

/**
 * The money the canonical stores already account for, indexed two ways over ONE set of
 * line objects.
 *
 * A commitment occurrence is an EXPECTATION; the cobro or the pago is the record of that
 * same money, and counting both in full is the double-count this pass exists to prevent.
 * Every earlier shape of it guessed at which records went together, and each guess was
 * wrong in a measurable way, the worst being that one 5.000 payment to one person erased a
 * 3.000.000 payroll for everyone.
 *
 * Both indexes hold the SAME `PoolLine` objects, so a peso consumed through one is gone
 * from the other. Without that, a linked commitment and an unlinked one could each net the
 * same cobro and the projection would understate by its amount.
 *
 * PROJECTED lines are pooled too, not only settled ones: a pago still pending and a cobro
 * still outstanding are the same money the commitment expects, and netting only the settled
 * half left the unpaid state, the more common one, double-counted.
 *
 * Which lines may be pooled: IN-WINDOW ones, or ACTUALS wherever they fall. An out-of-window
 * actual must count, because the money really moved and the opening balance already reflects
 * it. An out-of-window PROJECTED line must not: it has not happened and is placed in no
 * week, so letting it consume would delete the occurrence from the totals outright rather
 * than netting it.
 */
export function buildPool(
  lines: DatedLine[],
  isInWindow: (dateISO: string) => boolean,
): { byEntity: Map<string, PoolLine[]>; byCategory: Map<string, PoolLine[]> } {
  const byEntity = new Map<string, PoolLine[]>()
  const byCategory = new Map<string, PoolLine[]>()
  const push = (map: Map<string, PoolLine[]>, key: string, line: PoolLine) => {
    const bucket = map.get(key)
    if (bucket) bucket.push(line)
    else map.set(key, [line])
  }

  for (const line of lines) {
    if (line.basis !== 'actual' && !isInWindow(line.date)) continue
    const entry: PoolLine = { at: parseISO(line.date), remaining: line.amount }
    if (line.entity) push(byEntity, entityKey(line.direction, line.entity), entry)
    push(byCategory, categoryKey(line.direction, line.category), entry)
  }

  // Each bucket in DATE order. Consumption is greedy first-fit, so an unsorted bucket made
  // the answer depend on the order the stores happened to return rows in, and both repos
  // list `createdAt: desc` - the failing order.
  const byDate = (a: PoolLine, b: PoolLine) => a.at.getTime() - b.at.getTime()
  for (const bucket of byEntity.values()) bucket.sort(byDate)
  for (const bucket of byCategory.values()) bucket.sort(byDate)
  return { byEntity, byCategory }
}

/** Does this commitment name a counterparty? Both halves or neither: an id with no type
 *  cannot be resolved to a table, and a type with no id names nothing. */
export function isLinked(item: CommittedItem): boolean {
  return Boolean(item.linkedEntityType && item.linkedEntityId)
}

/**
 * What this occurrence still expects after taking its share of the money already recorded.
 *
 * A LINKED occurrence draws only from its own counterparty's lines. An UNLINKED one draws
 * from the category bucket, which is coarser and can attribute the wrong record, but is the
 * behavior the register has always had and is what keeps a commitment filed before the link
 * existed from projecting on top of the cobro that already realized it.
 *
 * The fallback is the OLD key with the NEW mechanics: netted by amount, never all-or-nothing,
 * so a small unrelated payment can no longer delete a large commitment whole.
 */
export function claim(
  occ: Occurrence,
  pool: { byEntity: Map<string, PoolLine[]>; byCategory: Map<string, PoolLine[]> },
  onlyEntity: boolean,
): number {
  const { item } = occ
  const bucket = onlyEntity
    ? (pool.byEntity.get(entityKey(item.direction, {
        type: item.linkedEntityType!,
        id: item.linkedEntityId!,
      })) ?? [])
    : (pool.byCategory.get(categoryKey(item.direction, item.category)) ?? [])

  let needed = item.amount
  for (const line of bucket) {
    if (needed < NOTHING_LEFT) break
    if (line.remaining < NOTHING_LEFT) continue
    if (!realizes(line.at, occ)) continue
    const taken = Math.min(line.remaining, needed)
    line.remaining -= taken
    needed -= taken
  }
  return needed < NOTHING_LEFT ? 0 : needed
}
