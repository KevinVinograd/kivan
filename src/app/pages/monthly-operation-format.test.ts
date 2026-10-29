import { describe, expect, it } from 'vitest'

import {
  cierreFigures,
  clientMargin,
  clientMarginPercent,
  closeBlockers,
  formatCurrency,
  monthInsight,
  nextStatementAction,
  statementBadge,
  summarize,
} from './monthly-operation-format'
import type {
  MonthPaymentRecipient,
  PaymentTotal,
  TeamPaymentTotal,
  ClientMonth,
  FixedExpense,
  MonthlyAlert,
  MonthlyOperationData,
  ProductionRecord,
  TeamPayout,
} from './monthly-operation-mock-data'

function client(overrides: Partial<ClientMonth> = {}): ClientMonth {
  return {
    id: 'cm-1',
    clientId: 'cli-1',
    name: 'Cliente Uno',
    monthStatus: 'reviewed',
    services: [],
    team: [],
    monthlyFee: 100_000,
    extras: [
      { id: 'x-1', description: 'Extra facturable', amount: 20_000, billable: true },
      { id: 'x-2', description: 'Extra interno', amount: 5_000, billable: false },
    ],
    productionsAmount: 30_000,
    paidAmount: 50_000,
    paymentStatus: 'partial',
    paymentDate: '2026-07-05',
    invoiceStatus: 'issued',
    monotributo: 'monotributo_1',
    teamCost: 40_000,
    productionCost: 10_000,
    ...overrides,
  }
}

function payout(overrides: Partial<TeamPayout> = {}): TeamPayout {
  return {
    id: 'p-1',
    memberId: 'tm-1',
    name: 'Mica',
    role: 'Diseñadora',
    clients: ['cli-1'],
    baseAmount: 60_000,
    productionsAmount: 10_000,
    viaticsAmount: 5_000,
    adjustments: [
      { id: 'adj-1', description: 'Bono', amount: 3_000 },
      { id: 'adj-2', description: 'Descuento', amount: -1_000 },
    ],
    statementStatus: 'approved',
    payoutStatus: 'partial',
    paidAmount: 20_000,
    bank: { bankName: 'Galicia', accountHolder: 'Mica', cbuOrCvu: '0000003100000000000000' },
    ...overrides,
  }
}

function expense(overrides: Partial<FixedExpense> = {}): FixedExpense {
  return {
    id: 'e-1',
    concept: 'Software',
    category: 'software',
    amount: 25_000,
    recurrence: 'monthly',
    payStatus: 'paid',
    affectsProfitability: true,
    ...overrides,
  }
}

function production(overrides: Partial<ProductionRecord> = {}): ProductionRecord {
  return {
    id: 'pr-1',
    date: '2026-07-03',
    clientId: 'cli-1',
    clientName: 'Cliente Uno',
    title: 'Sesión de fotos',
    type: 'foto',
    responsible: 'Mica',
    participants: [],
    hours: 4,
    viatics: 0,
    totalCost: 10_000,
    billable: 'billable',
    status: 'invoiced',
    ...overrides,
  }
}

function alert(overrides: Partial<MonthlyAlert> = {}): MonthlyAlert {
  return {
    id: 'a-1',
    severity: 'low',
    type: 'cobros',
    entity: 'Cliente Uno',
    description: 'Nada grave',
    status: 'open',
    ...overrides,
  }
}

function data(overrides: Partial<MonthlyOperationData> = {}): MonthlyOperationData {
  return {
    paymentTotals: [],
    otherLanePaymentCount: 0,
    teamPaymentTotals: [],
    payments: [],
    clients: [client()],
    team: [payout()],
    productions: [production()],
    expenses: [expense()],
    alerts: [alert()],
    monotributo: [],
    checklist: {
      clients_reviewed: true,
      changes_applied: true,
      payments_loaded: true,
      invoices_issued: true,
      productions_loaded: true,
      viatics_loaded: true,
      extra_work_reviewed: true,
      team_pay_calculated: true,
      statements_generated: true,
      expenses_loaded: true,
      arca_reviewed: true,
      profitability_reviewed: true,
    },
    ...overrides,
  }
}

function figure(figures: ReturnType<typeof cierreFigures>, label: string) {
  const found = figures.find((f) => f.label === label)
  if (!found) throw new Error(`cierreFigures has no row labelled "${label}"`)
  return found
}

const TOTAL_TO_BILL = 150_000
const PAYOUT_TOTAL = 77_000
const PROFIT = 38_000

function excludedExpense(amount: number) {
  return expense({ id: 'e-excluded', concept: 'Herramientas', amount, affectsProfitability: false })
}

describe('summarize', () => {
  it('derives every figure of the month from the fixture', () => {
    const summary = summarize(data())

    expect(summary.totalToCollect).toBe(TOTAL_TO_BILL)
    expect(summary.collected).toBe(50_000)
    expect(summary.pendingToCollect).toBe(100_000)
    expect(summary.totalToPayTeam).toBe(PAYOUT_TOTAL)
    expect(summary.paidToTeam).toBe(20_000)
    expect(summary.fixedExpenses).toBe(25_000)
    expect(summary.estimatedProfitability).toBe(PROFIT)
    expect(summary.openAlerts).toBe(1)
    expect(summary.criticalAlerts).toBe(0)
  })

  it('subtracts the payouts, NOT the per-client payroll allocation', () => {
    const summary = summarize(data())

    expect(summary.estimatedProfitability).toBe(38_000)
    expect(summary.estimatedProfitability).not.toBe(75_000)
    expect(summary.estimatedProfitability).not.toBe(115_000)
  })

  it('still subtracts the full payroll when the source does not allocate it per client', () => {
    const summary = summarize(data({ clients: [client({ teamCost: null })] }))

    expect(summary.totalToPayTeam).toBe(PAYOUT_TOTAL)
    expect(summary.estimatedProfitability).toBe(PROFIT)
  })

  it('does NOT let an expense flagged "no afecta rentabilidad" cut the profit', () => {
    const withExcluded = summarize(data({ expenses: [expense(), excludedExpense(8_000)] }))

    expect(withExcluded.fixedExpenses).toBe(33_000)
    expect(withExcluded.fixedExpensesExcluded).toBe(8_000)
    expect(withExcluded.estimatedProfitability).toBe(PROFIT)
    expect(withExcluded.estimatedProfitability).not.toBe(30_000)
  })

  it('reports no exclusions when every expense bears on profitability', () => {
    const summary = summarize(data())

    expect(summary.fixedExpenses).toBe(25_000)
    expect(summary.fixedExpensesExcluded).toBe(0)
    expect(summary.estimatedProfitability).toBe(PROFIT)
  })

  it('excludes EVERY expense when they are all flagged out', () => {
    const summary = summarize(data({ expenses: [excludedExpense(25_000)] }))

    expect(summary.fixedExpenses).toBe(25_000)
    expect(summary.fixedExpensesExcluded).toBe(25_000)
    expect(summary.estimatedProfitability).toBe(63_000)
  })

  it('counts only unresolved alerts, and criticals separately', () => {
    const summary = summarize(
      data({
        alerts: [
          alert({ id: 'a-1', severity: 'critical', status: 'open' }),
          alert({ id: 'a-2', severity: 'critical', status: 'resolved' }),
          alert({ id: 'a-3', severity: 'low', status: 'in_progress' }),
        ],
      }),
    )

    expect(summary.openAlerts).toBe(2)
    expect(summary.criticalAlerts).toBe(1)
  })
})

describe('clientMargin / clientMarginPercent', () => {
  it('computes the margin when payroll is allocated to the client', () => {
    const c = client()

    expect(clientMargin(c)).toBe(100_000)
    expect(clientMarginPercent(c)).toBeCloseTo((100_000 / TOTAL_TO_BILL) * 100, 5)
  })

  it('returns null — not a zero-payroll margin — when payroll is unallocated', () => {
    const c = client({ teamCost: null })

    expect(clientMargin(c)).toBeNull()
    expect(clientMarginPercent(c)).toBeNull()
  })

  it('distinguishes a genuinely zero team cost from an unknown one', () => {
    expect(clientMargin(client({ teamCost: 0 }))).toBe(140_000)
    expect(clientMargin(client({ teamCost: null }))).toBeNull()
  })

  it('reports a 0% margin rather than dividing by zero when there is nothing to bill', () => {
    const c = client({ monthlyFee: 0, extras: [], productionsAmount: 0, teamCost: 0, productionCost: 0 })

    expect(clientMarginPercent(c)).toBe(0)
  })
})

describe('cierreFigures', () => {
  it('renders the close card, reconciled against summarize', () => {
    const figures = cierreFigures(data())

    expect(figure(figures, 'Total facturado').value).toBe(formatCurrency(150_000))
    expect(figure(figures, 'Total cobrado').value).toBe(formatCurrency(50_000))
    expect(figure(figures, 'Pendiente de cobro').value).toBe(formatCurrency(100_000))
    expect(figure(figures, 'Total a pagar al equipo').value).toBe(formatCurrency(PAYOUT_TOTAL))
    expect(figure(figures, 'Gastos fijos').value).toBe(formatCurrency(25_000))
    expect(figure(figures, 'Rentabilidad neta').value).toBe(formatCurrency(PROFIT))
    expect(figure(figures, 'Rentabilidad neta').tone).toBe('success')
    expect(figure(figures, 'Margen promedio').value).toBe('67%')
    expect(figure(figures, 'Clientes con margen negativo').value).toBe('0')
    expect(figure(figures, 'Producciones sin aprobar').value).toBe('0')
    expect(figure(figures, 'Alertas críticas').value).toBe('0')
  })

  it.each([
    ['no excluded expenses', [expense()]],
    ['one excluded expense', [expense(), excludedExpense(8_000)]],
    ['every expense excluded', [excludedExpense(25_000)]],
  ])('reconciles: revenue minus the costs equals the profit row (%s)', (_label, expenses) => {
    const summary = summarize(data({ expenses }))
    const productionCost = 10_000

    expect(
      summary.totalToCollect -
        summary.totalToPayTeam -
        productionCost -
        (summary.fixedExpenses - summary.fixedExpensesExcluded),
    ).toBe(summary.estimatedProfitability)
  })

  it('shows the excluded-expense row, and still adds up to Rentabilidad neta', () => {
    const figures = cierreFigures(data({ expenses: [expense(), excludedExpense(8_000)] }))

    expect(figure(figures, 'Gastos fijos').value).toBe(formatCurrency(33_000))
    expect(figure(figures, 'No imputados a rentabilidad').value).toBe(`-${formatCurrency(8_000)}`)
    expect(figure(figures, 'Rentabilidad neta').value).toBe(formatCurrency(PROFIT))
  })

  it('omits the excluded-expense row entirely when there is nothing to exclude', () => {
    const figures = cierreFigures(data())

    expect(figures.some((f) => f.label === 'No imputados a rentabilidad')).toBe(false)
  })

  it('excludes clients with no invoice issued from Total facturado', () => {
    const figures = cierreFigures(
      data({ clients: [client(), client({ id: 'cm-2', clientId: 'cli-2', invoiceStatus: 'not_issued' })] }),
    )

    expect(figure(figures, 'Total facturado').value).toBe(formatCurrency(150_000))
  })

  it('tones Rentabilidad neta success at exactly 0, danger below it', () => {
    const breakEven = data({
      clients: [client({ monthlyFee: 100_000, extras: [], productionsAmount: 0, productionCost: 15_000 })],
      team: [payout({ baseAmount: 60_000, productionsAmount: 0, viaticsAmount: 0, adjustments: [] })],
      expenses: [expense({ amount: 25_000 })],
    })
    const atZero = figure(cierreFigures(breakEven), 'Rentabilidad neta')
    expect(atZero.value).toBe(formatCurrency(0))
    expect(atZero.tone).toBe('success')

    const belowZero = data({
      clients: [client({ monthlyFee: 100_000, extras: [], productionsAmount: 0, productionCost: 15_000 })],
      team: [payout({ baseAmount: 60_000, productionsAmount: 0, viaticsAmount: 0, adjustments: [] })],
      expenses: [expense({ amount: 25_001 })],
    })
    expect(figure(cierreFigures(belowZero), 'Rentabilidad neta').tone).toBe('danger')
  })

  it('withholds both margin figures when payroll is not allocated per client', () => {
    const figures = cierreFigures(data({ clients: [client({ teamCost: null })] }))

    expect(figure(figures, 'Margen promedio').value).toBe('-')
    expect(figure(figures, 'Clientes con margen negativo').value).toBe('-')
    expect(figure(figures, 'Rentabilidad neta').value).toBe(formatCurrency(PROFIT))
  })

  it('withholds the margin figures when only SOME clients are unallocated', () => {
    const figures = cierreFigures(
      data({ clients: [client(), client({ id: 'cm-2', clientId: 'cli-2', teamCost: null })] }),
    )

    expect(figure(figures, 'Margen promedio').value).toBe('-')
    expect(figure(figures, 'Clientes con margen negativo').value).toBe('-')
  })

  it('counts clients whose allocated margin is negative', () => {
    const figures = cierreFigures(
      data({
        clients: [
          client(),
          client({ id: 'cm-2', clientId: 'cli-2', teamCost: 200_000, productionCost: 0 }),
        ],
      }),
    )

    expect(figure(figures, 'Clientes con margen negativo').value).toBe('1')
  })
})

describe('closeBlockers', () => {
  it('returns no blockers for a clean month', () => {
    expect(closeBlockers(data())).toEqual([])
  })

  it('blocks an active client with nothing to bill', () => {
    const blockers = closeBlockers(
      data({ clients: [client({ monthlyFee: 0, extras: [], productionsAmount: 0 })] }),
    )

    expect(blockers.map((b) => b.id)).toContain('client_no_amount')
    expect(blockers.find((b) => b.id === 'client_no_amount')?.items).toEqual(['Cliente Uno'])
  })

  it('does NOT block a churned or paused client with nothing to bill', () => {
    const churned = closeBlockers(
      data({
        clients: [
          client({ monthStatus: 'churned', effectiveDate: '2026-07-31', monthlyFee: 0, extras: [], productionsAmount: 0 }),
        ],
      }),
    )
    const paused = closeBlockers(
      data({ clients: [client({ monthStatus: 'paused', monthlyFee: 0, extras: [], productionsAmount: 0 })] }),
    )

    expect(churned.map((b) => b.id)).not.toContain('client_no_amount')
    expect(paused.map((b) => b.id)).not.toContain('client_no_amount')
  })

  it('blocks a paid or partial client whose payment has no amount or no date', () => {
    const noAmount = closeBlockers(data({ clients: [client({ paymentStatus: 'paid', paidAmount: 0 })] }))
    const noDate = closeBlockers(
      data({ clients: [client({ paymentStatus: 'partial', paymentDate: undefined })] }),
    )

    expect(noAmount.map((b) => b.id)).toContain('payment_incomplete')
    expect(noDate.map((b) => b.id)).toContain('payment_incomplete')
  })

  it('blocks a payable team member with incomplete bank data', () => {
    const missingCbu = closeBlockers(
      data({ team: [payout({ bank: { accountHolder: 'Mica' } })] }),
    )
    const noBank = closeBlockers(data({ team: [payout({ bank: undefined })] }))

    expect(missingCbu.map((b) => b.id)).toContain('bank_incomplete')
    expect(noBank.map((b) => b.id)).toContain('bank_incomplete')
  })

  it('does NOT block an unpayable team member with incomplete bank data', () => {
    const blockers = closeBlockers(
      data({
        team: [
          payout({
            baseAmount: 0,
            productionsAmount: 0,
            viaticsAmount: 0,
            adjustments: [],
            bank: undefined,
          }),
        ],
      }),
    )

    expect(blockers.map((b) => b.id)).not.toContain('bank_incomplete')
  })

  it('blocks a production with no client', () => {
    const blockers = closeBlockers(data({ productions: [production({ clientId: '' })] }))

    expect(blockers.map((b) => b.id)).toContain('production_no_client')
    expect(blockers.find((b) => b.id === 'production_no_client')?.items).toEqual(['Sesión de fotos'])
  })

  it('blocks an APPROVED production with no billable classification, but not a pending one', () => {
    const approved = closeBlockers(
      data({ productions: [production({ status: 'approved', billable: null })] }),
    )
    const pending = closeBlockers(
      data({ productions: [production({ status: 'pending', billable: null })] }),
    )

    expect(approved.map((b) => b.id)).toContain('production_billable')
    expect(pending.map((b) => b.id)).not.toContain('production_billable')
  })

  it('blocks unresolved critical alerts, but not resolved ones or lesser severities', () => {
    const unresolved = closeBlockers(
      data({ alerts: [alert({ severity: 'critical', status: 'open' })] }),
    )
    const resolved = closeBlockers(
      data({ alerts: [alert({ severity: 'critical', status: 'resolved' })] }),
    )
    const high = closeBlockers(data({ alerts: [alert({ severity: 'high', status: 'open' })] }))

    expect(unresolved.map((b) => b.id)).toContain('critical_alerts')
    expect(resolved.map((b) => b.id)).not.toContain('critical_alerts')
    expect(high.map((b) => b.id)).not.toContain('critical_alerts')
  })

  it('blocks a new or churned client with no effective date', () => {
    const isNew = closeBlockers(data({ clients: [client({ monthStatus: 'new', effectiveDate: undefined })] }))
    const churned = closeBlockers(
      data({ clients: [client({ monthStatus: 'churned', effectiveDate: undefined })] }),
    )
    const dated = closeBlockers(
      data({ clients: [client({ monthStatus: 'new', effectiveDate: '2026-07-01' })] }),
    )

    expect(isNew.map((b) => b.id)).toContain('no_effective_date')
    expect(churned.map((b) => b.id)).toContain('no_effective_date')
    expect(dated.map((b) => b.id)).not.toContain('no_effective_date')
  })

  it('accumulates every blocker a month trips at once', () => {
    const blockers = closeBlockers(
      data({
        clients: [
          client({ monthlyFee: 0, extras: [], productionsAmount: 0 }),
          client({ id: 'cm-2', clientId: 'cli-2', monthStatus: 'new', effectiveDate: undefined }),
        ],
        team: [payout({ bank: undefined })],
        productions: [production({ clientId: '' }), production({ id: 'pr-2', status: 'approved', billable: null })],
        alerts: [alert({ severity: 'critical', status: 'open' })],
      }),
    )

    expect(blockers.map((b) => b.id).sort()).toEqual(
      [
        'bank_incomplete',
        'client_no_amount',
        'critical_alerts',
        'no_effective_date',
        'production_billable',
        'production_no_client',
      ].sort(),
    )
  })

  it('merges the server blockers with the front ones', () => {
    const blockers = closeBlockers(data({ team: [payout({ statementStatus: 'draft' })] }), [
      { code: 'unapproved_payouts', message: 'Payout statements still in draft', count: 1 },
    ])

    const unapproved = blockers.find((b) => b.id === 'unapproved_payouts')
    expect(unapproved?.label).toBe('Cuentas corrientes sin aprobar')
    expect(unapproved?.items).toEqual(['Mica'])
  })

  it('shows an unknown server blocker instead of dropping it', () => {
    const blockers = closeBlockers(data(), [
      { code: 'future_rule', message: 'Something the web app has never heard of', count: 2 },
    ])

    expect(blockers.map((b) => b.id)).toContain('future_rule')
    expect(blockers.find((b) => b.id === 'future_rule')?.label).toBe(
      'Something the web app has never heard of',
    )
  })

  it('stays on the front list when no server blockers are supplied', () => {
    expect(closeBlockers(data())).toEqual([])
  })
})

describe('monthInsight', () => {
  it('names the merged blocker instead of announcing a closable month', () => {
    const month = data({ team: [payout({ statementStatus: 'draft' })] })
    const merged = closeBlockers(month, [
      { code: 'unapproved_payouts', message: 'Payout statements still in draft', count: 1 },
    ])

    const insight = monthInsight(month, 'draft', merged, true)

    expect(insight.headline).toContain('cuentas corrientes sin aprobar')
    expect(insight.headline).not.toContain('en condiciones de cerrarse')
    expect(insight.cta?.kind).toBe('review-blockers')
  })

  it('announces a closable month only when the merged list is empty', () => {
    const month = data({ clients: [client({ paidAmount: TOTAL_TO_BILL, paymentStatus: 'paid' })] })
    expect(closeBlockers(month)).toEqual([])

    expect(monthInsight(month, 'draft', closeBlockers(month), true).headline).toContain(
      'en condiciones de cerrarse',
    )
    const merged = closeBlockers(month, [{ code: 'arca_errors', message: 'ARCA', count: 2 }])
    expect(monthInsight(month, 'draft', merged, true).headline).not.toContain(
      'en condiciones de cerrarse',
    )
  })

  it('withholds the profitability from a role that cannot see it', () => {
    const month = data({ clients: [client({ paidAmount: TOTAL_TO_BILL, paymentStatus: 'paid' })] })

    const withCapability = monthInsight(month, 'closed', [], true).headline
    const without = monthInsight(month, 'closed', [], false).headline

    expect(withCapability).toContain('rentabilidad estimada')
    expect(without).not.toContain('rentabilidad estimada')
    expect(without).toContain('cobrados')
  })

  it('withholds the profitability when no cost has been recorded', () => {
    const month = data({
      clients: [client({ paidAmount: TOTAL_TO_BILL, paymentStatus: 'paid', productionCost: 0 })],
      team: [],
      productions: [],
      expenses: [],
    })

    const headline = monthInsight(month, 'closed', [], true).headline

    expect(headline).not.toContain('rentabilidad estimada')
    expect(headline).toContain('cobrados')
  })

  it('states it once there is a cost side to subtract', () => {
    const month = data({
      clients: [client({ paidAmount: TOTAL_TO_BILL, paymentStatus: 'paid' })],
      team: [payout()],
    })

    expect(monthInsight(month, 'closed', [], true).headline).toContain('rentabilidad estimada')
  })
})

describe('nextStatementAction', () => {
  it('offers exactly one legal step per state, and none once confirmed', () => {
    expect(nextStatementAction('draft')).toEqual({ label: 'Aprobar', transition: 'approve' })
    expect(nextStatementAction('approved')).toEqual({ label: 'Enviar', transition: 'dispatch' })
    expect(nextStatementAction('dispatched')).toEqual({ label: 'Confirmar', transition: 'confirm' })
    expect(nextStatementAction('confirmed')).toBeNull()
  })

  it('labels every state, with success reserved for the settled one', () => {
    expect(statementBadge('draft')).toEqual({ label: 'Sin aprobar', variant: 'neutral' })
    expect(statementBadge('approved')).toEqual({ label: 'Aprobada', variant: 'warning' })
    expect(statementBadge('dispatched')).toEqual({ label: 'Enviada', variant: 'warning' })
    expect(statementBadge('confirmed')).toEqual({ label: 'Confirmada', variant: 'success' })
  })
})

describe('summarize with payments from /pagos', () => {
  const total = (recipientType: MonthPaymentRecipient, amount: number, paid = amount): PaymentTotal => ({
    recipientType,
    total: amount,
    paid,
    count: 1,
  })

  const bare = (paymentTotals: PaymentTotal[]) =>
    data({ team: [], expenses: [], paymentTotals })

  describe('a member with BOTH a statement and payments', () => {
    const member = (over: Partial<TeamPayout> = {}) =>
      payout({ memberId: 'tm-1', baseAmount: 0, productionsAmount: 0, viaticsAmount: 0, adjustments: [], paidAmount: 0, ...over })

    const memberTotal = (teamMemberId: string | null, total: number, paid = total): TeamPaymentTotal => ({
      teamMemberId,
      total,
      paid,
    })

    it('counts her once, not twice', () => {
      const both = summarize(
        data({
          expenses: [],
          team: [member({ productionsAmount: 300_000 })],
          teamPaymentTotals: [memberTotal('tm-1', 300_000)],
        }),
      )
      expect(both.totalToPayTeam).toBe(300_000)
      expect(both.paidToTeam).toBe(300_000)
    })

    it('keeps the larger record when the two disagree', () => {
      const statementBigger = summarize(
        data({ expenses: [], team: [member({ productionsAmount: 500_000 })], teamPaymentTotals: [memberTotal('tm-1', 200_000)] }),
      )
      expect(statementBigger.totalToPayTeam).toBe(500_000)

      const paymentsBigger = summarize(
        data({ expenses: [], team: [member({ productionsAmount: 200_000 })], teamPaymentTotals: [memberTotal('tm-1', 500_000)] }),
      )
      expect(paymentsBigger.totalToPayTeam).toBe(500_000)
    })

    it('still counts a member paid with no statement at all', () => {
      const summary = summarize(
        data({ expenses: [], team: [], teamPaymentTotals: [memberTotal('tm-2', 450_000)] }),
      )
      expect(summary.totalToPayTeam).toBe(450_000)
    })

    it('counts an unlinked payroll payment in full', () => {
      const summary = summarize(
        data({ expenses: [], team: [member({ productionsAmount: 100_000 })], teamPaymentTotals: [memberTotal(null, 70_000)] }),
      )
      expect(summary.totalToPayTeam).toBe(170_000)
    })
  })

  it('counts collaborator and employee payments as the month payroll', () => {
    const summary = summarize(
      data({ team: [], expenses: [], teamPaymentTotals: [
        { teamMemberId: 'tm-a', total: 400_000, paid: 400_000 },
        { teamMemberId: 'tm-b', total: 100_000, paid: 100_000 },
      ] }),
    )
    expect(summary.totalToPayTeam).toBe(500_000)
    expect(summary.paidToTeam).toBe(500_000)
  })

  it('reports the settled part separately from what was committed', () => {
    const summary = summarize(
      data({ team: [], expenses: [], teamPaymentTotals: [{ teamMemberId: 'tm-a', total: 400_000, paid: 150_000 }] }),
    )
    expect(summary.totalToPayTeam).toBe(400_000)
    expect(summary.paidToTeam).toBe(150_000)
  })

  it('counts the non-payroll types as gastos fijos', () => {
    const summary = summarize(
      bare([
        total('provider', 50_000),
        total('fixed_expense', 30_000),
        total('monotributo', 20_000),
        total('platform', 10_000),
      ]),
    )
    expect(summary.fixedExpenses).toBe(110_000)
    expect(summary.totalToPayTeam).toBe(0)
  })

  it('subtracts payments from the profitability', () => {
    const withoutCosts = summarize(bare([]))
    const withCosts = summarize(
      data({
        team: [], expenses: [],
        paymentTotals: [total('provider', 200_000)],
        teamPaymentTotals: [{ teamMemberId: 'tm-a', total: 300_000, paid: 300_000 }],
      }),
    )
    expect(withoutCosts.estimatedProfitability - withCosts.estimatedProfitability).toBe(500_000)
  })

  it('stops reporting the revenue as the profit once a payment exists', () => {
    const noCostAtAll = (paymentTotals: PaymentTotal[]) =>
      data({ team: [], expenses: [], clients: [client({ productionCost: 0 })], paymentTotals })

    const noCosts = summarize(noCostAtAll([]))
    expect(noCosts.estimatedProfitability).toBe(noCosts.totalToCollect)

    const withPayment = summarize(
      data({
        team: [], expenses: [], clients: [client({ productionCost: 0 })],
        teamPaymentTotals: [{ teamMemberId: 'tm-a', total: 1, paid: 1 }],
      }),
    )
    expect(withPayment.estimatedProfitability).not.toBe(withPayment.totalToCollect)
  })

  it('adds the month-owned expenses to the payments rather than replacing them', () => {
    const withBoth = summarize(data({ team: [], paymentTotals: [total('fixed_expense', 30_000)] }))
    const ownExpensesOnly = summarize(data({ team: [], paymentTotals: [] }))
    expect(withBoth.fixedExpenses - ownExpensesOnly.fixedExpenses).toBe(30_000)
  })

  it('still honours "no impacta en la rentabilidad" on the month-owned rows', () => {
    const excluded = expense({ amount: 70_000, affectsProfitability: false })
    const summary = summarize(
      data({ team: [], expenses: [excluded], paymentTotals: [total('provider', 30_000)] }),
    )
    expect(summary.fixedExpenses).toBe(100_000)
    expect(summary.fixedExpensesExcluded).toBe(70_000)
    expect(summary.totalToCollect - summary.estimatedProfitability).toBe(
      30_000 + summary.totalToPayTeam + 10_000,
    )
  })
})
