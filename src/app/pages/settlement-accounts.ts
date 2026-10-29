import { useMemo } from 'react'

import { useTreasury } from './treasury-data'
import { operatingAccounts } from './treasury-position'

export type SettlementAccount = {
  id: string
  name: string
  type: string
}

export type SettlementAccountsState = {
  accounts: SettlementAccount[]
  status: 'loading' | 'ready' | 'error'
}

export function useSettlementAccounts(): SettlementAccountsState {
  const { accounts, isLoading, isError } = useTreasury()

  return useMemo(() => {
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

export function settlementDestinationValid(
  state: SettlementAccountsState,
  accountId: string,
): boolean {
  if (state.status !== 'ready') return false
  return state.accounts.length === 0 || accountId !== ''
}

export function defaultSettlementAccountId(accounts: SettlementAccount[]): string {
  return accounts.length === 1 ? (accounts[0] as SettlementAccount).id : ''
}

export const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  bank: 'Banco',
  cash: 'Efectivo',
  investment: 'Inversión',
}
