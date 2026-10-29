import { describe, expect, it } from 'vitest'

import { buildTeamPayments } from './admin-dashboard-pendientes-data'
import { summarize } from './monthly-operation-format'
import type { MonthlyOperationData, TeamPayout } from './monthly-operation-mock-data'

function payout(overrides: Partial<TeamPayout> = {}): TeamPayout {
  return {
    id: 'tp-1',
    memberId: 'tm-1',
    name: 'Mica',
    role: 'Diseñadora',
    clients: [],
    baseAmount: 0,
    productionsAmount: 0,
    viaticsAmount: 0,
    adjustments: [],
    statementStatus: 'approved',
    payoutStatus: 'pending',
    paidAmount: 0,
    bank: { bankName: 'Galicia', accountHolder: 'Mica', cbuOrCvu: '0000003100000000000000' },
    ...overrides,
  }
}

function month(overrides: Partial<MonthlyOperationData> = {}): MonthlyOperationData {
  return {
    clients: [],
    team: [],
    productions: [],
    expenses: [],
    alerts: [],
    monotributo: [],
    paymentTotals: [],
    teamPaymentTotals: [],
    payments: [],
    otherLanePaymentCount: 0,
    checklist: {} as MonthlyOperationData['checklist'],
    ...overrides,
  }
}

describe('buildTeamPayments', () => {
  const empty = { missingHours: new Set<string>(), viatics: new Set<string>() }

  it('reports the payroll the monthly screen reports', () => {
    const data = month({ teamPaymentTotals: [{ teamMemberId: 'tm-1', total: 450_000, paid: 200_000 }] })
    const totals = summarize(data)

    const built = buildTeamPayments(data.team, totals, empty.missingHours, empty.viatics)

    expect(built.totalToPay).toBe(totals.totalToPayTeam)
    expect(built.paid).toBe(totals.paidToTeam)
    expect(built.pending).toBe(totals.totalToPayTeam - totals.paidToTeam)
  })

  it('does not report $0 for a month whose payroll lives only in /pagos', () => {
    const data = month({ teamPaymentTotals: [{ teamMemberId: 'tm-1', total: 450_000, paid: 200_000 }] })

    const built = buildTeamPayments(data.team, summarize(data), empty.missingHours, empty.viatics)

    expect(built.totalToPay).toBe(450_000)
    expect(built.paid).toBe(200_000)
  })

  it('still counts a statement when there is one', () => {
    const data = month({ team: [payout({ baseAmount: 300_000, paidAmount: 300_000 })] })

    const built = buildTeamPayments(data.team, summarize(data), empty.missingHours, empty.viatics)

    expect(built.totalToPay).toBe(300_000)
    expect(built.paid).toBe(300_000)
  })

  it('counts a member with both records once', () => {
    const data = month({
      team: [payout({ baseAmount: 300_000, paidAmount: 300_000 })],
      teamPaymentTotals: [{ teamMemberId: 'tm-1', total: 300_000, paid: 300_000 }],
    })

    const built = buildTeamPayments(data.team, summarize(data), empty.missingHours, empty.viatics)

    expect(built.totalToPay).toBe(300_000)
  })

  it('keeps the rows statement-derived', () => {
    const data = month({
      team: [payout()],
      teamPaymentTotals: [{ teamMemberId: 'tm-9', total: 99_000, paid: 0 }],
    })

    const built = buildTeamPayments(data.team, summarize(data), empty.missingHours, empty.viatics)

    expect(built.rows).toHaveLength(1)
    expect(built.rows[0]?.personName).toBe('Mica')
  })
})
