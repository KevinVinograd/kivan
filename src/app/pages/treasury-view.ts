/**
 * Cashflow view-model (pure). Shapes the engine output (`CashflowWeek[]` from
 * `treasury-format.ts`) into the structures the `/cashflow` UI renders: the KPI
 * strip, the running-balance chart series, and the 13-week matrix (weeks as
 * columns, category rows). No React, no I/O — formatting + aggregation only, so
 * it is unit-tested in the node `unit` project alongside the engine. ARS-only (v1).
 */
import { addWeeks, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

import { type Kpi } from './cobranza-format'
import type { CashflowLine, CashflowWeek } from './treasury-format'
import type { CommittedCategory, CommittedItem, Currency } from './treasury-mock-data'
import { formatLaneAmount } from './treasury-position-view'

/** Short "d LLL" week-start label for chart axes + matrix headers (e.g. "1 jun"). */
export function weekLabel(weekStartISO: string): string {
  return format(parseISO(weekStartISO), 'd LLL', { locale: es })
}

/** Spanish labels for the committed-item categories (UI copy). */
export const COMMITTED_CATEGORY_LABEL: Record<CommittedCategory, string> = {
  salaries: 'Sueldos',
  fixed_expense: 'Gastos fijos',
  tax: 'Impuestos',
  platform: 'Plataformas',
  retainer: 'Abonos',
  other: 'Otros',
}

/** Spanish label for any projection line category (commitments + raw actuals). */
export function lineCategoryLabel(category: CashflowLine['category']): string {
  if (category === 'collection') return 'Cobros'
  if (category === 'payment') return 'Pagos'
  return COMMITTED_CATEGORY_LABEL[category]
}

/** Spanish UI labels for the committed-item enums (shared by the register columns + form). */
export const DIRECTION_LABEL: Record<CommittedItem['direction'], string> = {
  inflow: 'Ingreso',
  outflow: 'Egreso',
}

export const RECURRENCE_LABEL: Record<CommittedItem['recurrence'], string> = {
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  annual: 'Anual',
  one_time: 'Único',
}

export const CONFIDENCE_LABEL: Record<CommittedItem['confidence'], string> = {
  committed: 'Comprometido',
  projected: 'Proyectado',
}

export const SOURCE_LABEL: Record<CommittedItem['source'], string> = {
  derived: 'Automático',
  manual: 'Manual',
}

export type CashflowChartPoint = { label: string; value: number }

/** One point per week: the week label and its closing balance (the chart line). */
export function cashflowChartSeries(weeks: CashflowWeek[]): CashflowChartPoint[] {
  return weeks.map((week) => ({ label: weekLabel(week.weekStart), value: week.closing }))
}

/**
 * The header KPI strip: opening, projected close, 13-week delta, lowest week.
 * Reuses the shared finance `Kpi` shape + tone vocabulary (`KPI_TONE_FG`).
 */
export function cashflowKpis(weeks: CashflowWeek[], currency: Currency = 'ARS'): Kpi[] {
  if (weeks.length === 0) return []
  const opening = weeks[0].opening
  const closing = weeks[weeks.length - 1].closing
  const net = closing - opening
  const lowest = weeks.reduce((min, week) => (week.closing < min.closing ? week : min), weeks[0])
  return [
    { id: 'opening', label: 'Saldo inicial', value: formatLaneAmount(opening, currency), tone: 'default' },
    {
      id: 'closing',
      label: 'Cierre proyectado',
      value: formatLaneAmount(closing, currency),
      hint: `A ${weeks.length} semanas`,
      tone: closing < 0 ? 'danger' : 'default',
    },
    {
      // Variación is a direction, not a threshold alarm — the +/- sign carries it,
      // so the figure stays fg-default (figure-color-restraint). The two below-zero
      // cash-crunch signals (Cierre proyectado, Semana más baja) keep their danger
      // tint; they only fire when negative.
      id: 'net',
      label: 'Variación 13 semanas',
      value: `${net > 0 ? '+' : ''}${formatLaneAmount(net, currency)}`,
      tone: 'default',
    },
    {
      id: 'lowest',
      label: 'Semana más baja',
      value: formatLaneAmount(lowest.closing, currency),
      hint: weekLabel(lowest.weekStart),
      tone: lowest.closing < 0 ? 'danger' : 'default',
    },
  ]
}

export type CashflowCategoryRow = {
  category: CashflowLine['category']
  label: string
  /** One amount per week (length === weeks.length). */
  amounts: number[]
}

export type CashflowMatrix = {
  weekLabels: string[]
  openingRow: number[]
  inflowRows: CashflowCategoryRow[]
  totalInflows: number[]
  outflowRows: CashflowCategoryRow[]
  totalOutflows: number[]
  closingRow: number[]
  /** Per-week cash-crunch flag (closing < 0), for the Cierre row highlight. */
  belowZero: boolean[]
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

/** Aggregate one direction's lines into per-category × per-week amount rows,
 *  dropping all-zero categories and ordering by descending window total. */
function categoryRows(weeks: CashflowWeek[], direction: 'inflow' | 'outflow'): CashflowCategoryRow[] {
  const byCategory = new Map<CashflowLine['category'], number[]>()
  weeks.forEach((week, weekIdx) => {
    for (const line of week.lines) {
      if (line.direction !== direction) continue
      let amounts = byCategory.get(line.category)
      if (!amounts) {
        amounts = new Array(weeks.length).fill(0)
        byCategory.set(line.category, amounts)
      }
      amounts[weekIdx] += line.amount
    }
  })
  return [...byCategory.entries()]
    .map(([category, amounts]) => ({ category, label: lineCategoryLabel(category), amounts }))
    .filter((row) => row.amounts.some((amount) => amount !== 0))
    .sort((a, b) => sum(b.amounts) - sum(a.amounts))
}

/** The 13-week matrix view-model: weeks as columns, grouped category rows. */
export function cashflowMatrix(weeks: CashflowWeek[]): CashflowMatrix {
  return {
    weekLabels: weeks.map((week) => weekLabel(week.weekStart)),
    openingRow: weeks.map((week) => week.opening),
    inflowRows: categoryRows(weeks, 'inflow'),
    totalInflows: weeks.map((week) => week.inflows),
    outflowRows: categoryRows(weeks, 'outflow'),
    totalOutflows: weeks.map((week) => week.outflows),
    closingRow: weeks.map((week) => week.closing),
    belowZero: weeks.map((week) => week.isBelowZero),
  }
}

/** Lowercased haystack for the register's global filter (description + category + direction). */
export function commitmentSearchText(item: CommittedItem): string {
  return [item.description, COMMITTED_CATEGORY_LABEL[item.category], item.direction]
    .join(' ')
    .toLowerCase()
}

// ── Reconciliation (M4): projected-vs-actual variance per week ────────────────

/** Net of a week's realized (actual-basis) lines only: collected − paid. */
export function weekRealizedNet(week: CashflowWeek): number {
  return week.lines
    .filter((line) => line.basis === 'actual')
    .reduce((net, line) => net + (line.direction === 'inflow' ? line.amount : -line.amount), 0)
}

export type ReconciliationRow = {
  weekStart: string
  weekLabel: string
  /** True once the week has fully elapsed (its start is before `todayISO`). */
  isElapsed: boolean
  /** Expected net from the committed register alone (the plan-only projection). */
  planNet: number
  /** Realized net from actual cobros/pagos; null until the week has elapsed. */
  actualNet: number | null
  /** `actualNet − planNet` for elapsed weeks; null otherwise. */
  variance: number | null
}

/**
 * Per-week plan-vs-actual reconciliation. `reconciledWeeks` overlays the actuals
 * on the register (the projection the dashboard shows); `planWeeks` is the
 * register-only projection (actuals excluded), i.e. what the commitments alone
 * predicted. For an elapsed week the realized actuals are the truth and the
 * variance shows how far they ran from the plan; future weeks carry the plan
 * only (actualNet/variance null). Both projections share one window, so the
 * arrays align by index.
 */
export function reconciliationRows(
  reconciledWeeks: CashflowWeek[],
  planWeeks: CashflowWeek[],
  todayISO: string,
): ReconciliationRow[] {
  return reconciledWeeks.map((week, index) => {
    const plan = planWeeks[index] ?? week
    const planNet = plan.inflows - plan.outflows
    // Fully elapsed only once the week's END (its next Monday) is on or before
    // today — so the still-open current week stays "Proyectada" and its partial
    // week-to-date actuals are never compared against a full-week plan.
    const weekEndISO = format(addWeeks(parseISO(week.weekStart), 1), 'yyyy-MM-dd')
    const isElapsed = weekEndISO <= todayISO
    const actualNet = isElapsed ? weekRealizedNet(week) : null
    return {
      weekStart: week.weekStart,
      weekLabel: weekLabel(week.weekStart),
      isElapsed,
      planNet,
      actualNet,
      variance: actualNet === null ? null : actualNet - planNet,
    }
  })
}

export type ReconciliationSummary = {
  weeksElapsed: number
  realized: number
  planned: number
  variance: number
}

/** Roll the elapsed weeks up into a realized-vs-planned summary. */
export function reconciliationSummary(rows: ReconciliationRow[]): ReconciliationSummary {
  const elapsed = rows.filter((row) => row.isElapsed)
  const realized = elapsed.reduce((sum, row) => sum + (row.actualNet ?? 0), 0)
  const planned = elapsed.reduce((sum, row) => sum + row.planNet, 0)
  return { weeksElapsed: elapsed.length, realized, planned, variance: realized - planned }
}

/** KPI tiles for the reconciliation summary, reusing the shared `Kpi` shape. */
export function reconciliationKpis(summary: ReconciliationSummary, currency: Currency = 'ARS'): Kpi[] {
  return [
    {
      id: 'realized',
      label: 'Ejecutado (real)',
      value: formatLaneAmount(summary.realized, currency),
      hint: `${summary.weeksElapsed} semanas cerradas`,
      tone: 'default',
    },
    { id: 'planned', label: 'Plan (cerradas)', value: formatLaneAmount(summary.planned, currency), tone: 'default' },
    {
      id: 'variance',
      label: 'Variación vs plan',
      value: `${summary.variance > 0 ? '+' : ''}${formatLaneAmount(summary.variance, currency)}`,
      tone: summary.variance > 0 ? 'success' : summary.variance < 0 ? 'danger' : 'default',
    },
  ]
}
