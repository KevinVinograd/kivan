/**
 * Close-math tests for `monthly-operation-format`.
 *
 * This module is imported by 21 call sites and had no test. It owns the figures the
 * owner signs the month off on, and `closeBlockers` is the only barrier between the
 * studio and an irreversible close, so a silently inverted predicate here fails OPEN.
 *
 * The fixture deliberately gives the per-client payroll allocation (`teamCost`, 40_000)
 * a DIFFERENT value from the month's actual payouts (`totalToPayTeam`, 77_000). Any
 * regression that goes back to deriving studio profit from the per-client allocation
 * therefore fails loudly, instead of passing because the two happened to coincide.
 */
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

// ── Fixture builders ─────────────────────────────────────────────────────────

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

// The fixture's arithmetic, stated once so the expectations below read as claims
// about behaviour rather than as restatements of the implementation.
//
//   totalToBill  = fee 100_000 + billable extra 20_000 + productions 30_000 = 150_000
//                  (the 5_000 non-billable extra is excluded)
//   payoutTotal  = base 60_000 + productions 10_000 + viatics 5_000 + adj 2_000 = 77_000
//   profit       = 150_000 - payroll 77_000 - productionCost 10_000 - expenses 25_000 = 38_000
const TOTAL_TO_BILL = 150_000
const PAYOUT_TOTAL = 77_000
const PROFIT = 38_000

/** An expense the user flagged as NOT bearing on profitability. */
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
    // The regression this whole file exists for. Against the live API `teamCost` is
    // null for every client; deriving payroll from it dropped the entire payroll to 0
    // and reported the month as profitable by exactly the payroll.
    const summary = summarize(data())

    // 150_000 - 77_000 (payouts) - 10_000 - 25_000
    expect(summary.estimatedProfitability).toBe(38_000)
    // NOT 150_000 - 40_000 (the per-client allocation) - 10_000 - 25_000
    expect(summary.estimatedProfitability).not.toBe(75_000)
    // ...and above all NOT the payroll-free figure the live API produced.
    expect(summary.estimatedProfitability).not.toBe(115_000)
  })

  it('still subtracts the full payroll when the source does not allocate it per client', () => {
    const summary = summarize(data({ clients: [client({ teamCost: null })] }))

    expect(summary.totalToPayTeam).toBe(PAYOUT_TOTAL)
    expect(summary.estimatedProfitability).toBe(PROFIT)
  })

  it('does NOT let an expense flagged "no afecta rentabilidad" cut the profit', () => {
    // The whole defect: `affectsProfitability` shipped in the DTO, in the expenses table
    // and as a Checkbox in the dialog — and nothing read it. Adding an excluded expense
    // must move `fixedExpenses` (real cash out) and leave `estimatedProfitability` alone.
    const withExcluded = summarize(data({ expenses: [expense(), excludedExpense(8_000)] }))

    expect(withExcluded.fixedExpenses).toBe(33_000) // 25_000 + 8_000 — the cash that left
    expect(withExcluded.fixedExpensesExcluded).toBe(8_000)
    expect(withExcluded.estimatedProfitability).toBe(PROFIT) // unchanged: 150 - 77 - 10 - 25
    // The old behaviour, kept as an explicit anti-assertion: it subtracted all 33_000.
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
    // No fixed-expense cost at all: 150 - 77 - 10.
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

    // 150_000 - 40_000 - 10_000
    expect(clientMargin(c)).toBe(100_000)
    expect(clientMarginPercent(c)).toBeCloseTo((100_000 / TOTAL_TO_BILL) * 100, 5)
  })

  it('returns null — not a zero-payroll margin — when payroll is unallocated', () => {
    const c = client({ teamCost: null })

    expect(clientMargin(c)).toBeNull()
    expect(clientMarginPercent(c)).toBeNull()
  })

  it('distinguishes a genuinely zero team cost from an unknown one', () => {
    // 0 is a real allocation and yields a real margin; null does not.
    expect(clientMargin(client({ teamCost: 0 }))).toBe(140_000)
    expect(clientMargin(client({ teamCost: null }))).toBeNull()
  })

  it('reports a 0% margin rather than dividing by zero when there is nothing to bill', () => {
    const c = client({ monthlyFee: 0, extras: [], productionsAmount: 0, teamCost: 0, productionCost: 0 })

    expect(clientMarginPercent(c)).toBe(0)
  })
})

describe('cierreFigures', () => {
  // Currency rows are compared against `formatCurrency`, not a hardcoded string: the
  // es-AR formatter separates the symbol with a NON-BREAKING space (U+00A0), so a
  // literal "$ 150.000" typed here would fail on an invisible character. What these
  // assertions are actually about is which NUMBER lands in which row.
  it('renders the close card, reconciled against summarize', () => {
    const figures = cierreFigures(data())

    expect(figure(figures, 'Total facturado').value).toBe(formatCurrency(150_000))
    expect(figure(figures, 'Total cobrado').value).toBe(formatCurrency(50_000))
    expect(figure(figures, 'Pendiente de cobro').value).toBe(formatCurrency(100_000))
    // Accrued payroll: the same figure Rentabilidad neta subtracts, so the card adds up.
    expect(figure(figures, 'Total a pagar al equipo').value).toBe(formatCurrency(PAYOUT_TOTAL))
    expect(figure(figures, 'Gastos fijos').value).toBe(formatCurrency(25_000))
    expect(figure(figures, 'Rentabilidad neta').value).toBe(formatCurrency(PROFIT))
    expect(figure(figures, 'Rentabilidad neta').tone).toBe('success')
    expect(figure(figures, 'Margen promedio').value).toBe('67%')
    expect(figure(figures, 'Clientes con margen negativo').value).toBe('0')
    expect(figure(figures, 'Producciones sin aprobar').value).toBe('0')
    expect(figure(figures, 'Alertas críticas').value).toBe('0')
  })

  // The close card's job is to explain the profit, so it has to add up. This is asserted
  // against summarize()'s OWN output — restating the fixture's arithmetic here would only
  // test JavaScript's minus operator. The expense term is NET of the excluded slice, which
  // is exactly what the "No imputados a rentabilidad" row exists to make visible.
  it.each([
    ['no excluded expenses', [expense()]],
    ['one excluded expense', [expense(), excludedExpense(8_000)]],
    ['every expense excluded', [excludedExpense(25_000)]],
  ])('reconciles: revenue minus the costs equals the profit row (%s)', (_label, expenses) => {
    const summary = summarize(data({ expenses }))
    const productionCost = 10_000 // the fixture's only client

    expect(
      summary.totalToCollect -
        summary.totalToPayTeam -
        productionCost -
        (summary.fixedExpenses - summary.fixedExpensesExcluded),
    ).toBe(summary.estimatedProfitability)
  })

  it('shows the excluded-expense row, and still adds up to Rentabilidad neta', () => {
    const figures = cierreFigures(data({ expenses: [expense(), excludedExpense(8_000)] }))

    // Gastos fijos stays the TOTAL cash out — hiding real spend from the summary would be
    // its own lie — and the excluded slice is named rather than silently dropped.
    expect(figure(figures, 'Gastos fijos').value).toBe(formatCurrency(33_000))
    expect(figure(figures, 'No imputados a rentabilidad').value).toBe(`-${formatCurrency(8_000)}`)
    expect(figure(figures, 'Rentabilidad neta').value).toBe(formatCurrency(PROFIT))
  })

  it('omits the excluded-expense row entirely when there is nothing to exclude', () => {
    // A row reading "$ 0" on every normal month is noise on an already dense card.
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
    // profit = 100_000 - 60_000 - 15_000 - 25_000 = 0
    const breakEven = data({
      clients: [client({ monthlyFee: 100_000, extras: [], productionsAmount: 0, productionCost: 15_000 })],
      team: [payout({ baseAmount: 60_000, productionsAmount: 0, viaticsAmount: 0, adjustments: [] })],
      expenses: [expense({ amount: 25_000 })],
    })
    const atZero = figure(cierreFigures(breakEven), 'Rentabilidad neta')
    expect(atZero.value).toBe(formatCurrency(0))
    expect(atZero.tone).toBe('success')

    // One peso of expense more and the verdict flips.
    const belowZero = data({
      clients: [client({ monthlyFee: 100_000, extras: [], productionsAmount: 0, productionCost: 15_000 })],
      team: [payout({ baseAmount: 60_000, productionsAmount: 0, viaticsAmount: 0, adjustments: [] })],
      expenses: [expense({ amount: 25_001 })],
    })
    expect(figure(cierreFigures(belowZero), 'Rentabilidad neta').tone).toBe('danger')
  })

  it('withholds both margin figures when payroll is not allocated per client', () => {
    const figures = cierreFigures(data({ clients: [client({ teamCost: null })] }))

    // Averaging an unallocated margin would report the studio as more profitable than
    // it is — the exact failure the close card exists to prevent.
    expect(figure(figures, 'Margen promedio').value).toBe('-')
    expect(figure(figures, 'Clientes con margen negativo').value).toBe('-')
    // Studio-level profit stays exact: it comes from the payouts, which every source has.
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
    // Nothing to pay means nowhere to pay it to.
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

  // The server refuses the close on validations the front does not compute. Before
  // this, the UI showed only its own list, said "listo para cerrar", and let the
  // close 409 with nothing on screen explaining it.
  it('merges the server blockers with the front ones', () => {
    const blockers = closeBlockers(data({ team: [payout({ statementStatus: 'draft' })] }), [
      { code: 'unapproved_payouts', message: 'Payout statements still in draft', count: 1 },
    ])

    const unapproved = blockers.find((b) => b.id === 'unapproved_payouts')
    expect(unapproved?.label).toBe('Cuentas corrientes sin aprobar')
    // Named, not counted: "1 cuenta corriente" is not something the user can act on.
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
  // The page's most prominent element used to derive its own blocker list, so it
  // announced "el mes está en condiciones de cerrarse" while the close dialog listed an
  // unresolved SERVER blocker. Same page, two answers, headline taking the optimistic
  // one. Found by driving the real stack in a browser, not by any assertion here.
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
    // Fully collected, so the "quedan X por cobrar" branch does not intercept.
    const month = data({ clients: [client({ paidAmount: TOTAL_TO_BILL, paymentStatus: 'paid' })] })
    expect(closeBlockers(month)).toEqual([])

    expect(monthInsight(month, 'draft', closeBlockers(month), true).headline).toContain(
      'en condiciones de cerrarse',
    )
    // ...and one server blocker is enough to take it back.
    const merged = closeBlockers(month, [{ code: 'arca_errors', message: 'ARCA', count: 2 }])
    expect(monthInsight(month, 'draft', merged, true).headline).not.toContain(
      'en condiciones de cerrarse',
    )
  })

  /**
   * The closed-month headline restates the profitability, and the insight renders
   * unconditionally at the top of the page while the KPI two rows below is gated on the
   * `profitability` capability. A custom role can hold `page.monthly_operation` without
   * `client.profitability.read`, reach the page, and read in prose the figure the tile
   * withholds. Built-in roles are unaffected: the route is owner/admin and both hold every
   * capability, which is exactly why nothing caught this.
   */
  it('withholds the profitability from a role that cannot see it', () => {
    const month = data({ clients: [client({ paidAmount: TOTAL_TO_BILL, paymentStatus: 'paid' })] })

    const withCapability = monthInsight(month, 'closed', [], true).headline
    const without = monthInsight(month, 'closed', [], false).headline

    expect(withCapability).toContain('rentabilidad estimada')
    expect(without).not.toContain('rentabilidad estimada')
    // Collected cash stays: it is the same figure the cobros tiles already show.
    expect(without).toContain('cobrados')
  })

  /**
   * The headline restates the profitability tile, so it has to withhold the figure on the
   * same TWO axes the tile does. The capability axis was closed first; this is the cost
   * basis. `estimatedProfitability` subtracts payouts, production cost and
   * profit-affecting expenses, none of which reaches this screen from the pagos module, so
   * a month with every pago loaded still resolves to the BILLING. Left ungated, the page
   * announced the studio's revenue as its profit at the very top, immediately above a tile
   * that said "Sin costos cargados" about the same month.
   */
  it('withholds the profitability when no cost has been recorded', () => {
    // Fully collected and no payout, production cost or expense: profitability collapses
    // onto the billing, which is exactly the operator's August. `productionCost` lives on
    // the client ROW (it is per-cobro), so emptying `productions` does not zero it.
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
      // The default fixture carries base, productions, viatics and adjustments, so the
      // month has a real payroll cost to subtract.
      team: [payout()],
    })

    expect(monthInsight(month, 'closed', [], true).headline).toContain('rentabilidad estimada')
  })
})

describe('nextStatementAction', () => {
  // The server transitions are conditional updates filtered on the status they move
  // FROM, so anything but the single legal step is a 409 the user cannot act on.
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

/**
 * The cost side comes from the Pagos module.
 *
 * The operator loaded every one of August's payments — colaboradoras, proveedores, viáticos —
 * approved them and marked them paid, and the month still reported "Pendiente de pago al
 * equipo $0" and a profitability with nothing subtracted. `getBundle` did not read the
 * payments table at all: the string "payment" appeared zero times in the whole monthly
 * module. Her work was stored correctly and was invisible to the screen that closes the month.
 */
describe('summarize with payments from /pagos', () => {
  const total = (recipientType: MonthPaymentRecipient, amount: number, paid = amount): PaymentTotal => ({
    recipientType,
    total: amount,
    paid,
    count: 1,
  })

  // No statements and no month-owned expenses: every cost figure below comes from payments.
  const bare = (paymentTotals: PaymentTotal[]) =>
    data({ team: [], expenses: [], paymentTotals })

  /**
   * PAYROLL MUST NOT BE COUNTED TWICE.
   *
   * A colaboradora has two overlapping records of one obligation: a PayoutStatement and the
   * payments in /pagos. A first version of this feature ADDED them, on the premise that a
   * statement is structurally 0 because no screen sends it a money field. The premise was
   * false on two paths that both run from this page:
   *
   *   - the server derives `productionsAmountMinor` as hours x rate when a statement is
   *     CREATED, and `setBankData` is its only creator, so entering a colaboradora's bank
   *     details mints a statement carrying money;
   *   - `addAdjustment` folds an adjustment into `totalAmountMinor`.
   *
   * The result was a silent inflation of the cost side, on the profitability the operator
   * freezes when she closes the month. These cases pin the dedup.
   */
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
      // The same 300.000 recorded on both sides is 300.000 of payroll, never 600.000.
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
      // Every workspace is in this state today: nothing creates a statement with money
      // unless someone opens the bank dialog, so /pagos is the only payroll record there is.
      const summary = summarize(
        data({ expenses: [], team: [], teamPaymentTotals: [memberTotal('tm-2', 450_000)] }),
      )
      expect(summary.totalToPayTeam).toBe(450_000)
    })

    it('counts an unlinked payroll payment in full', () => {
      // `teamMemberId` is nullable on a Payment. Naming no member, it can overlap no
      // statement, so it is added rather than deduped.
      const summary = summarize(
        data({ expenses: [], team: [member({ productionsAmount: 100_000 })], teamPaymentTotals: [memberTotal(null, 70_000)] }),
      )
      expect(summary.totalToPayTeam).toBe(170_000)
    })
  })

  it('counts collaborator and employee payments as the month payroll', () => {
    // Payroll reads the PER-MEMBER aggregate, not the by-type one: the by-type total
    // cannot be deduplicated against the statements, and payroll has two records.
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
    // ...and NOT as payroll, which is the split the whole wiring turns on.
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

  /**
   * The exact regression the fix exists for: a month whose only cost record is in /pagos used
   * to report its BILLING as its profit, in success green, on the page that invites a close.
   */
  it('stops reporting the revenue as the profit once a payment exists', () => {
    // A genuinely cost-free month: no statements, no expenses, and the fixture's
    // `productionCost` zeroed, so profit and revenue start out equal. That equality is what
    // the summary tile reads to decide whether it has anything to state at all.
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

  /**
   * A gasto fijo must be counted ONCE. The two sources are additive because they cannot
   * describe the same peso: the Gastos tab no longer accepts new rows, so /pagos is the only
   * place an operating cost can be recorded from now on.
   */
  it('adds the month-owned expenses to the payments rather than replacing them', () => {
    const withBoth = summarize(data({ team: [], paymentTotals: [total('fixed_expense', 30_000)] }))
    const ownExpensesOnly = summarize(data({ team: [], paymentTotals: [] }))
    expect(withBoth.fixedExpenses - ownExpensesOnly.fixedExpenses).toBe(30_000)
  })

  it('still honours "no impacta en la rentabilidad" on the month-owned rows', () => {
    // The flag has no equivalent on a Payment, so every payment counts; an excluded expense
    // is still recorded in the total and still kept out of the profit.
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
