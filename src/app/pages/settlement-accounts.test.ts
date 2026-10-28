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
    // THE regression guard. A failed fetch yields an empty list, exactly like a workspace
    // with no accounts — and reading it as "no accounts" let a cobro be registered with no
    // destination. Nothing moved a balance, the receivable left "Ingresos pendientes", the
    // Posición fell by the amount collected, and the toast said "Cobro registrado". That is
    // the defect this whole feature exists to close, arriving through its own error path.
    expect(settlementDestinationValid(state({ accounts: [], status: 'error' }), '')).toBe(false)
    // Not rescued by a stale id either: the list it was chosen from is gone.
    expect(settlementDestinationValid(state({ accounts: [], status: 'error' }), 'acc-1')).toBe(false)
  })

  it('refuses to submit before the list has resolved', () => {
    expect(settlementDestinationValid(state({ accounts: [], status: 'loading' }), '')).toBe(false)
  })

  it('lets a workspace with genuinely no accounts register anyway', () => {
    // A studio that never loaded one is not blocked; it just gets no balance movement,
    // and the dialog says so. The difference from the error case is that here we KNOW.
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
    // Choosing for the operator would silently decide where the money went.
    expect(defaultSettlementAccountId([account, { id: 'acc-2', name: 'Caja', type: 'cash' }])).toBe(
      '',
    )
    expect(defaultSettlementAccountId([])).toBe('')
  })
})

// `settlesToTreasuryAccount` used to live here, carving FCI out of the destination
// requirement because `postTreasuryMovement` refused that lane outright. Migration 0028
// removed the lane, so every settlement now names an account and the predicate would be a
// guard that cannot fail — `settlementDestinationValid` above is the whole gate.
