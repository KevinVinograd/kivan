/**
 * Treasury consolidation (pure). Lane-wise arithmetic over `Money` and the
 * roll-ups the "Posición" view renders: per-lane operating Saldos, the
 * consolidated reserve (Finanzas Hold), and the net position. No React, no I/O —
 * unit-tested in the node `unit` project alongside the engine. Currency lanes are
 * tracked side by side and never converted into each other.
 */
import { LANES } from '@/lib/currency'
import type { Account, CommittedItem, Currency, Money } from './treasury-mock-data'

/**
 * The treasury currency lanes, in display order.
 *
 * THE SAME ARRAY as `LANES`, not a second list that happens to agree. `LANES` is derived
 * from `LANE_NOUN`, a `Record<Currency, string>` the compiler checks for exhaustiveness,
 * so a lane added to the shared enum cannot compile until it is named — and then appears
 * here too. Written out by hand, as this was, it is the exact drift `currency.ts` says it
 * exists to prevent: a new lane would be silently absent from `sumMoney`, `LaneCells`,
 * `saldosByLane`, the settlement note and `projectionLanes` at once, with the whole suite
 * green and every peso aggregate quietly excluding it.
 *
 * The import direction is the safe one: `@/lib/currency` imports nothing but a type, so
 * nothing can cycle through it (the reverse — that file reaching in here — is the shape
 * that closed a ring once and blanked the app in production).
 */
export const CURRENCIES: readonly Currency[] = LANES

/** Read a lane off a `Money`, treating an omitted lane as 0. */
export function laneAmount(money: Money, currency: Currency): number {
  return money[currency] ?? 0
}

/** Lane-wise sum of any number of `Money` values; zero-sum lanes are omitted. */
export function sumMoney(values: Money[]): Money {
  const total: Money = {}
  for (const currency of CURRENCIES) {
    const laneTotal = values.reduce((acc, money) => acc + laneAmount(money, currency), 0)
    if (laneTotal !== 0) total[currency] = laneTotal
  }
  return total
}

/** Lane-wise `a + b`. */
export function addMoney(a: Money, b: Money): Money {
  return sumMoney([a, b])
}

/** Lane-wise `a - b`; a lane absent from either side reads as 0, zero results are omitted. */
export function subtractMoney(a: Money, b: Money): Money {
  const result: Money = {}
  for (const currency of CURRENCIES) {
    const diff = laneAmount(a, currency) - laneAmount(b, currency)
    if (diff !== 0) result[currency] = diff
  }
  return result
}

/** The active accounts that count toward operating Saldos (everything not a reserve). */
export function operatingAccounts(accounts: Account[]): Account[] {
  return accounts.filter((account) => account.isActive && !account.isReserve)
}

/** The active accounts that count toward the consolidated reserve (Finanzas Hold). */
export function reserveAccounts(accounts: Account[]): Account[] {
  return accounts.filter((account) => account.isActive && account.isReserve)
}

/** Per-lane total of operating Saldos (the green "Total saldos" row). */
export function saldosByLane(accounts: Account[]): Money {
  return sumMoney(operatingAccounts(accounts).map((account) => account.balances))
}

/**
 * The lanes worth offering a forward projection for: an operating Saldos balance, an
 * active commitment, or a real cobro/pago in that lane. ARS is always offered.
 *
 * The actuals belong in this gate because the projection is lane-SCOPED — it takes
 * `payments.filter((p) => p.currency === lane)`. Gating on balances and commitments alone
 * would leave a dollar pago with neither one projected NOWHERE: no USD tab to select, and
 * dropped from the ARS one, with no control on the screen that would reveal the outflow.
 *
 * A cancelled row is not cash flow and opens nothing.
 *
 * No lane is excluded. A lane that only ever holds reserve balances still has to open on a
 * real cobro or pago, because that is operating money and the projection is lane-scoped —
 * omitting the lane would drop it from every tab rather than from one.
 */
export function projectionLanes(
  accounts: Account[],
  commitments: CommittedItem[],
  actuals: { currency: Currency; status: string }[],
): Currency[] {
  const saldos = saldosByLane(accounts)
  return CURRENCIES.filter(
    (currency) =>
      currency === 'ARS' ||
      laneAmount(saldos, currency) !== 0 ||
      commitments.some((item) => item.isActive && item.currency === currency) ||
      actuals.some((item) => item.currency === currency && item.status !== 'cancelled'),
  )
}

/** Per-lane total of the reserve accounts (the "Reserva acumulada" base). */
export function reserveByLane(accounts: Account[]): Money {
  return sumMoney(reserveAccounts(accounts).map((account) => account.balances))
}

/** Net position per lane: Saldos + pending inflows - pending outflows. */
export function positionByLane(saldos: Money, pendingIn: Money, pendingOut: Money): Money {
  return subtractMoney(addMoney(saldos, pendingIn), pendingOut)
}

/** Total already settled "a cuenta" across a committed item's installments. */
export function installmentsPaid(item: CommittedItem): number {
  return (item.installments ?? []).reduce((sum, installment) => sum + installment.amount, 0)
}

/** Remaining amount of a committed item after its "a cuenta" installments (never negative). */
export function outstandingAmount(item: CommittedItem): number {
  return Math.max(item.amount - installmentsPaid(item), 0)
}
