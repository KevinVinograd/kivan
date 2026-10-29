import { describe, expect, it } from 'vitest'

import {
  defaultSettlementAccountId,
  settlementDestinationValid,
  type SettlementAccountsState,
} from './settlement-accounts'

const account = { id: 'acc-1', name: 'Santander', type: 'bank' }

function state(over: Partial<SettlementAccountsState> = {}): SettlementAccountsState {
  return { accounts: [account], status: 'ready', ...over }
}

describe('settlementDestinationValid', () => {
  it('refuses to submit while the accounts fetch is in error', () => {
    expect(settlementDestinationValid(state({ accounts: [], status: 'error' }), '')).toBe(false)
    expect(settlementDestinationValid(state({ accounts: [], status: 'error' }), 'acc-1')).toBe(false)
  })

  it('refuses to submit before the list has resolved', () => {
    expect(settlementDestinationValid(state({ accounts: [], status: 'loading' }), '')).toBe(false)
  })

  it('lets a workspace with genuinely no accounts register anyway', () => {
    expect(settlementDestinationValid(state({ accounts: [], status: 'ready' }), '')).toBe(true)
  })

  it('requires a choice once there are accounts to choose from', () => {
    expect(settlementDestinationValid(state(), '')).toBe(false)
    expect(settlementDestinationValid(state(), 'acc-1')).toBe(true)
  })
})

describe('defaultSettlementAccountId', () => {
  it('preselects the only account, and nothing when there are several', () => {
    expect(defaultSettlementAccountId([account])).toBe('acc-1')
    expect(defaultSettlementAccountId([account, { id: 'acc-2', name: 'Caja', type: 'cash' }])).toBe(
      '',
    )
    expect(defaultSettlementAccountId([])).toBe('')
  })
})

