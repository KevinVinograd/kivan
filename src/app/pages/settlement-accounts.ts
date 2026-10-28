import { useMemo } from 'react'

import { useTreasury } from './treasury-data'
import { operatingAccounts } from './treasury-position'

/** A treasury account a settlement can name as its destination or origin. */
export type SettlementAccount = {
  id: string
  name: string
  /** bank | cash | investment — the detail line under the name, so two accounts at the
   *  same bank are still tellable apart. */
  type: string
}

export type SettlementAccountsState = {
  accounts: SettlementAccount[]
  status: 'loading' | 'ready' | 'error'
}

/**
 * The accounts a cobro or a pago may settle into.
 *
 * Read from `TreasuryProvider`, which `router.tsx` mounts around the whole authenticated
 * tree — `/cobros` and `/pagos` included. (An earlier version of this hook fetched
 * `/treasury/accounts` itself on the belief that the provider was mounted by `/cashflow`
 * alone. It is not, so that fetch was a second copy of a list the cache already held: it
 * missed every invalidation the settlement mutations fire, and it swallowed the query's
 * error state, which is how a failed fetch came to look exactly like a workspace with no
 * accounts.)
 *
 * ACTIVE and NON-RESERVE only:
 * - Inactive is excluded from the Posición by design, so settling into one would move a
 *   balance nothing reads — and the API refuses it anyway.
 * - Reserve is excluded because `operatingAccounts` keeps reserve balances OUT of the
 *   Saldos total. A cobro settled into one credits a balance the Posición does not count,
 *   so the Posición falls by the amount collected — the precise defect this whole feature
 *   exists to close. Money that genuinely belongs in a reserve gets there by a transfer,
 *   which is a treasury operation, not a collection.
 */
export function useSettlementAccounts(): SettlementAccountsState {
  const { accounts, isLoading, isError } = useTreasury()

  return useMemo(() => {
    // Error first: with the fetch failed the list is empty for a reason that "cargá una
    // cuenta en Cashflow" does not describe, and the caller must be able to tell them
    // apart before it lets money be settled into nothing.
    if (isError) return { accounts: [], status: 'error' }
    if (isLoading) return { accounts: [], status: 'loading' }
    return {
      accounts: operatingAccounts(accounts).map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
      })),
      status: 'ready',
    }
  }, [accounts, isLoading, isError])
}

/**
 * Whether a settlement may be submitted with this destination choice.
 *
 * Lived inline in three dialogs as `accounts.length === 0 || accountId !== ''`, which
 * reads a FAILED fetch — an empty list — as "this workspace has no accounts" and lets the
 * money through with no destination. Nothing then moves a balance: the receivable leaves
 * "Ingresos pendientes", no Saldo rises to meet it, the Posición falls by the amount
 * collected, and the toast reports success. That is the defect this feature exists to
 * close, arriving through its own error path.
 *
 * So: only from a RESOLVED list. A studio that genuinely has no accounts is still not
 * blocked — it just gets no balance movement, and the dialog says so.
 */
export function settlementDestinationValid(
  state: SettlementAccountsState,
  accountId: string,
): boolean {
  if (state.status !== 'ready') return false
  return state.accounts.length === 0 || accountId !== ''
}

/** The account to preselect: the only one, when there is only one. With several,
 *  nothing is chosen — a default here would silently pick where the money went. */
export function defaultSettlementAccountId(accounts: SettlementAccount[]): string {
  return accounts.length === 1 ? (accounts[0] as SettlementAccount).id : ''
}

/** bank | cash | investment, in the operator's words. */
export const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  bank: 'Banco',
  cash: 'Efectivo',
  investment: 'Inversión',
}
