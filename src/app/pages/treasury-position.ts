import { LANES } from '@/lib/currency'
import type { Account, CommittedItem, Currency, Money } from './treasury-mock-data'

export const CURRENCIES: readonly Currency[] = LANES

export function laneAmount(money: Money, currency: Currency): number {
  return money[currency] ?? 0
}

export function sumMoney(values: Money[]): Money {
  const total: Money = {}
  for (const currency of CURRENCIES) {
    const laneTotal = values.reduce((acc, money) => acc + laneAmount(money, currency), 0)
    if (laneTotal !== 0) total[currency] = laneTotal
  }
  return total
}

export function addMoney(a: Money, b: Money): Money {
  return sumMoney([a, b])
}

export function subtractMoney(a: Money, b: Money): Money {
  const result: Money = {}
  for (const currency of CURRENCIES) {
    const diff = laneAmount(a, currency) - laneAmount(b, currency)
    if (diff !== 0) result[currency] = diff
  }
  return result
}

export function operatingAccounts(accounts: Account[]): Account[] {
  return accounts.filter((account) => account.isActive && !account.isReserve)
}

export function reserveAccounts(accounts: Account[]): Account[] {
  return accounts.filter((account) => account.isActive && account.isReserve)
}

export function saldosByLane(accounts: Account[]): Money {
  return sumMoney(operatingAccounts(accounts).map((account) => account.balances))
}

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

export function reserveByLane(accounts: Account[]): Money {
  return sumMoney(reserveAccounts(accounts).map((account) => account.balances))
}

export function positionByLane(saldos: Money, pendingIn: Money, pendingOut: Money): Money {
  return subtractMoney(addMoney(saldos, pendingIn), pendingOut)
}

export function installmentsPaid(item: CommittedItem): number {
  return (item.installments ?? []).reduce((sum, installment) => sum + installment.amount, 0)
}

export function outstandingAmount(item: CommittedItem): number {
  return Math.max(item.amount - installmentsPaid(item), 0)
}
