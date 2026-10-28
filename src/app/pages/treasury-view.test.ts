import { describe, expect, it } from 'vitest'
import { addWeeks, format, parseISO } from 'date-fns'

import { formatCurrency } from './cobranza-format'
import { projectCashflow } from './treasury-format'
import type { Receivable } from './cobros-mock-data'
import type { Payment } from './pagos-mock-data'
import type { CashAccount, CommittedItem } from './treasury-mock-data'
import {
  cashflowChartSeries,
  cashflowKpis,
  cashflowMatrix,
  commitmentSearchText,
  reconciliationKpis,
  reconciliationRows,
  reconciliationSummary,
  weekLabel,
  weekRealizedNet,
} from './treasury-view'

const account: CashAccount = {
  id: 'cash-test',
  name: 'Caja de prueba',
  currency: 'ARS',
  openingBalance: 1_000_000,
  openingBalanceDate: '2026-06-01',
  isActive: true,
}

const commitments: CommittedItem[] = [
  {
    id: 'c1',
    description: 'Sueldos del equipo',
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
  },
  {
    id: 'c2',
    description: 'Abono mensual',
    direction: 'inflow',
    amount: 400_000,
    currency: 'ARS',
    category: 'retainer',
    recurrence: 'monthly',
    startDate: '2026-06-01',
    anchorDay: 8,
    confidence: 'projected',
    source: 'manual',
    isActive: true,
  },
]

const weeks = projectCashflow({
  account,
  receivables: [],
  payments: [],
  commitments,
  asOf: '2026-06-01',
  weeks: 13,
})

describe('weekLabel', () => {
  it('formats the ISO week-start as a short Spanish "d LLL" label', () => {
    expect(weekLabel('2026-06-01')).toBe('1 jun')
  })
})

describe('cashflowChartSeries', () => {
  it('emits one point per week carrying that week closing balance', () => {
    const series = cashflowChartSeries(weeks)
    expect(series).toHaveLength(weeks.length)
    series.forEach((point, index) => {
      expect(point.value).toBe(weeks[index].closing)
      expect(point.label).toBe(weekLabel(weeks[index].weekStart))
    })
  })
})

describe('cashflowKpis', () => {
  it('reports opening, projected close and the lowest-week balance', () => {
    const kpis = cashflowKpis(weeks)
    const byId = Object.fromEntries(kpis.map((kpi) => [kpi.id, kpi]))
    expect(byId.opening.value).toBe(formatCurrency(weeks[0].opening))
    expect(byId.closing.value).toBe(formatCurrency(weeks[weeks.length - 1].closing))
    const lowest = weeks.reduce((min, week) => (week.closing < min.closing ? week : min), weeks[0])
    expect(byId.lowest.value).toBe(formatCurrency(lowest.closing))
    expect(byId.lowest.hint).toBe(weekLabel(lowest.weekStart))
  })

  it('surfaces a negative 13-week variation by sign, not color', () => {
    const kpis = cashflowKpis(weeks)
    const net = kpis.find((kpi) => kpi.id === 'net')
    // 600k monthly salary outflow vs 400k monthly retainer inflow → net down.
    // Variación is a direction, not a threshold alarm: the sign carries it and the
    // figure stays fg-default (figure-color-restraint). The cash-crunch tint lives on
    // Cierre proyectado / Semana más baja, not on this variation.
    expect(net?.value).toContain('-')
    expect(net?.tone).toBe('default')
  })

  it('returns no KPIs for an empty window', () => {
    expect(cashflowKpis([])).toEqual([])
  })
})

describe('cashflowMatrix', () => {
  it('keeps per-week totals in lockstep with the engine roll-up', () => {
    const matrix = cashflowMatrix(weeks)
    weeks.forEach((week, index) => {
      expect(matrix.totalInflows[index]).toBe(week.inflows)
      expect(matrix.totalOutflows[index]).toBe(week.outflows)
      expect(matrix.openingRow[index]).toBe(week.opening)
      expect(matrix.closingRow[index]).toBe(week.closing)
      expect(matrix.belowZero[index]).toBe(week.isBelowZero)
    })
  })

  it('groups lines into labelled category rows and omits categories with no movement', () => {
    const matrix = cashflowMatrix(weeks)
    expect(matrix.outflowRows.some((row) => row.label === 'Sueldos')).toBe(true)
    expect(matrix.inflowRows.some((row) => row.label === 'Abonos')).toBe(true)
    // No receivables were supplied, so there is no "Cobros" inflow row.
    expect(matrix.inflowRows.some((row) => row.category === 'collection')).toBe(false)
  })

  it('sums each category row to its window total', () => {
    const matrix = cashflowMatrix(weeks)
    const salaries = matrix.outflowRows.find((row) => row.label === 'Sueldos')
    expect(salaries).toBeDefined()
    expect(salaries?.amounts).toHaveLength(weeks.length)
  })
})

describe('commitmentSearchText', () => {
  it('builds a lowercased haystack from description, category label and direction', () => {
    const text = commitmentSearchText(commitments[0])
    expect(text).toContain('sueldos del equipo')
    expect(text).toContain('outflow')
  })
})

// ── Reconciliation (M4) ──────────────────────────────────────────────────────

function makeReceivable(partial: Partial<Receivable>): Receivable {
  return {
    id: 'rec',
    clientName: 'C',
    period: '2026-06-01',
    service: 's',
    baseAmount: 0,
    extraAmount: 0,
    extras: [],
    discountAmount: 0,
    totalAmount: 0,
    collectedAmount: 0,
    currency: 'ARS',
    dueDate: '2026-06-30',
    status: 'pending',
    billingStatus: 'no_invoice',
    taxProfileId: 'unassigned',
    lastActivityLabel: '',
    lastActivityAt: '2026-06-15',
    ...partial,
  }
}

function makePayment(partial: Partial<Payment>): Payment {
  return {
    id: 'pay',
    recipientName: 'R',
    recipientType: 'collaborator',
    period: '2026-06-01',
    concept: 'c',
    totalAmount: 0,
    paidAmount: 0,
    currency: 'ARS',
    expectedDate: '2026-06-30',
    status: 'pending',
    lastActivityLabel: '',
    lastActivityAt: '2026-06-15',
    ...partial,
  }
}

// A 450k collection and a 600k salary payout, both realized in early June.
const realizedReceivables: Receivable[] = [
  makeReceivable({
    totalAmount: 450_000,
    collectedAmount: 450_000,
    status: 'collected',
    // The day the cash ARRIVED. This fixture used to say "realized in early June" in a
    // comment and set only `lastActivityAt`, which is the row's createdAt: the engine
    // read it as the collection date, so the comment happened to describe the behavior
    // by accident. The engine now reads `collectedAt`, and the fixture says it outright.
    collectedAt: '2026-06-08',
    lastActivityAt: '2026-06-02T09:00:00',
  }),
]
const realizedPayments: Payment[] = [
  makePayment({
    recipientType: 'employee',
    totalAmount: 600_000,
    paidAmount: 600_000,
    status: 'paid',
    paymentDate: '2026-06-05',
  }),
]

const reconciledWeeks = projectCashflow({
  account,
  receivables: realizedReceivables,
  payments: realizedPayments,
  commitments,
  asOf: '2026-06-01',
  weeks: 13,
})
const planWeeks = projectCashflow({
  account,
  receivables: [],
  payments: [],
  commitments,
  asOf: '2026-06-01',
  weeks: 13,
})
const TODAY = '2026-06-20'

describe('weekRealizedNet', () => {
  it('nets only the actual-basis lines (collected − paid), ignoring committed/projected', () => {
    const total = reconciledWeeks.reduce((sum, week) => sum + weekRealizedNet(week), 0)
    // 450k collected − 600k paid across the window.
    expect(total).toBe(-150_000)
  })
})

describe('reconciliationRows', () => {
  const rows = reconciliationRows(reconciledWeeks, planWeeks, TODAY)

  it('marks a week elapsed only once its end (next Monday) is on or before today', () => {
    expect(rows).toHaveLength(reconciledWeeks.length)
    expect(rows.some((row) => row.isElapsed)).toBe(true)
    expect(rows.some((row) => !row.isElapsed)).toBe(true)
    rows.forEach((row) => {
      const weekEndISO = format(addWeeks(parseISO(row.weekStart), 1), 'yyyy-MM-dd')
      expect(row.isElapsed).toBe(weekEndISO <= TODAY)
    })
  })

  it('keeps the still-open current week (containing today) out of the elapsed set', () => {
    // 2026-06-20 falls in the ISO week starting Mon 2026-06-15, which ends 06-22.
    const current = rows.find((row) => row.weekStart === '2026-06-15')
    expect(current?.isElapsed).toBe(false)
    expect(current?.actualNet).toBeNull()
  })

  it('computes variance as actual − plan for elapsed weeks and null for future weeks', () => {
    rows.forEach((row, index) => {
      if (row.isElapsed) {
        expect(row.actualNet).toBe(weekRealizedNet(reconciledWeeks[index]))
        expect(row.variance).toBe((row.actualNet ?? 0) - row.planNet)
      } else {
        expect(row.actualNet).toBeNull()
        expect(row.variance).toBeNull()
      }
    })
  })
})

describe('reconciliationSummary', () => {
  it('rolls elapsed weeks into realized, planned and their variance', () => {
    const rows = reconciliationRows(reconciledWeeks, planWeeks, TODAY)
    const summary = reconciliationSummary(rows)
    // June salary (−600k) + retainer (+400k) are the only plan items before 2026-06-20.
    expect(summary.planned).toBe(-200_000)
    // 450k collected − 600k paid, both realized before 2026-06-20.
    expect(summary.realized).toBe(-150_000)
    // Collected 50k more than planned.
    expect(summary.variance).toBe(50_000)
    expect(summary.weeksElapsed).toBeGreaterThan(0)
  })
})

describe('reconciliationKpis', () => {
  it('flags a positive variance as success and a negative one as danger', () => {
    const positive = reconciliationKpis({ weeksElapsed: 3, realized: 100, planned: 50, variance: 50 })
    expect(positive.find((kpi) => kpi.id === 'variance')?.tone).toBe('success')
    const negative = reconciliationKpis({ weeksElapsed: 3, realized: 50, planned: 100, variance: -50 })
    expect(negative.find((kpi) => kpi.id === 'variance')?.tone).toBe('danger')
  })
})
