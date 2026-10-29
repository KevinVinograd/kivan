import { describe, expect, it } from 'vitest'

import {
  addMoney,
  installmentsPaid,
  laneAmount,
  operatingAccounts,
  outstandingAmount,
  positionByLane,
  projectionLanes,
  reserveAccounts,
  reserveByLane,
  saldosByLane,
  subtractMoney,
  sumMoney,
} from './treasury-position'
import { seedAccounts, type Account, type CommittedItem } from './treasury-mock-data'

function makeAccount(partial: Partial<Account>): Account {
  return {
    id: 'a',
    name: 'Cuenta',
    partner: 'shared',
    type: 'bank',
    balances: {},
    isActive: true,
    ...partial,
  }
}

describe('laneAmount', () => {
  it('reads a present lane and treats an omitted lane as 0', () => {
    expect(laneAmount({ ARS: 100, USD: 5 }, 'ARS')).toBe(100)
    expect(laneAmount({ ARS: 100 }, 'USD')).toBe(0)
    expect(laneAmount({}, 'ARS')).toBe(0)
  })
})

describe('sumMoney', () => {
  it('sums lane by lane and omits zero-sum lanes', () => {
    expect(sumMoney([{ ARS: 100 }, { ARS: 50 }, { USD: 5 }])).toEqual({
      ARS: 150,
      USD: 5,
    })
    expect(sumMoney([{ ARS: 100 }, { ARS: -100 }])).toEqual({})
    expect(sumMoney([])).toEqual({})
  })
})

describe('addMoney / subtractMoney', () => {
  it('adds lane-wise', () => {
    expect(addMoney({ ARS: 100 }, { ARS: 25, USD: 1 })).toEqual({ ARS: 125, USD: 1 })
  })

  it('subtracts lane-wise, keeping negatives and omitting zeros', () => {
    expect(subtractMoney({ ARS: 100, USD: 5 }, { ARS: 30, USD: 5 })).toEqual({ ARS: 70 })
    expect(subtractMoney({ ARS: 100 }, { ARS: 250 })).toEqual({ ARS: -150 })
  })
})

describe('operating vs reserve partitioning', () => {
  it('splits active accounts by the reserve flag and excludes inactive ones', () => {
    const accounts = [
      makeAccount({ id: 'op', balances: { ARS: 100 } }),
      makeAccount({ id: 'res', balances: { ARS: 200 }, isReserve: true }),
      makeAccount({ id: 'off', balances: { ARS: 999 }, isActive: false }),
      makeAccount({ id: 'res-off', balances: { ARS: 999 }, isReserve: true, isActive: false }),
    ]
    expect(operatingAccounts(accounts).map((a) => a.id)).toEqual(['op'])
    expect(reserveAccounts(accounts).map((a) => a.id)).toEqual(['res'])
  })
})

describe('saldosByLane / reserveByLane over the seed', () => {
  it('totals operating Saldos per lane', () => {
    expect(saldosByLane(seedAccounts)).toEqual({ ARS: 2_385_000, USD: 1_800 })
  })

  it('totals reserve accounts per lane (FIMA + USD savings + ARS savings)', () => {
    expect(reserveByLane(seedAccounts)).toEqual({ ARS: 4_300_000, USD: 7_000 })
  })
})

describe('positionByLane', () => {
  it('computes Saldos + pending inflows - pending outflows per lane', () => {
    const position = positionByLane({ ARS: 1_000, USD: 100 }, { ARS: 500 }, { ARS: 300, USD: 40 })
    expect(position).toEqual({ ARS: 1_200, USD: 60 })
  })
})

describe('installmentsPaid / outstandingAmount', () => {
  function makeItem(partial: Partial<CommittedItem>): CommittedItem {
    return {
      id: 'c',
      description: 'Sueldo',
      direction: 'outflow',
      amount: 600_000,
      currency: 'ARS',
      category: 'salaries',
      recurrence: 'monthly',
      startDate: '2026-06-01',
      anchorDay: 5,
      confidence: 'committed',
      source: 'manual',
      isActive: true,
      ...partial,
    }
  }

  it('sums the "a cuenta" installments and computes the remainder', () => {
    const item = makeItem({
      installments: [
        { date: '2026-06-12', amount: 200_000, note: 'a cuenta' },
        { date: '2026-06-19', amount: 150_000, note: 'a cuenta' },
      ],
    })
    expect(installmentsPaid(item)).toBe(350_000)
    expect(outstandingAmount(item)).toBe(250_000)
  })

  it('treats an item with no installments as fully outstanding', () => {
    const item = makeItem({})
    expect(installmentsPaid(item)).toBe(0)
    expect(outstandingAmount(item)).toBe(600_000)
  })

  it('never reports a negative remainder when installments exceed the amount', () => {
    const item = makeItem({ amount: 100_000, installments: [{ date: '2026-06-12', amount: 150_000 }] })
    expect(outstandingAmount(item)).toBe(0)
  })
})

describe('projectionLanes', () => {
  function makeCommitment(partial: Partial<CommittedItem>): CommittedItem {
    return {
      id: 'c',
      description: 'Sueldo',
      direction: 'outflow',
      amount: 600_000,
      currency: 'ARS',
      category: 'salaries',
      recurrence: 'monthly',
      startDate: '2026-06-01',
      anchorDay: 5,
      confidence: 'committed',
      source: 'manual',
      isActive: true,
      ...partial,
    }
  }

  it('always offers pesos, even on an empty studio', () => {
    expect(projectionLanes([], [], [])).toEqual(['ARS'])
  })

  it('opens a lane for a pago that has neither a balance nor a commitment behind it', () => {
    const lanes = projectionLanes([], [], [{ currency: 'USD', status: 'pending' }])
    expect(lanes).toContain('USD')
  })

  it('opens a lane for a cobro in it', () => {
    expect(projectionLanes([], [], [{ currency: 'USD', status: 'collected' }])).toContain('USD')
  })

  it('does not open a lane for a cancelled row, which is not cash flow', () => {
    const lanes = projectionLanes([], [], [{ currency: 'USD', status: 'cancelled' }])
    expect(lanes).toEqual(['ARS'])
  })

  it('still opens a lane on a balance or an active commitment alone', () => {
    const withBalance = projectionLanes([makeAccount({ balances: { USD: 400 } })], [], [])
    expect(withBalance).toContain('USD')

    const withCommitment = projectionLanes(
      [],
      [makeCommitment({ currency: 'USD' })],
      [],
    )
    expect(withCommitment).toContain('USD')
  })

  it('ignores an inactive commitment', () => {
    const lanes = projectionLanes([], [makeCommitment({ currency: 'USD', isActive: false })], [])
    expect(lanes).toEqual(['ARS'])
  })
})
