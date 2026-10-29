import { addWeeks, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

import { type Kpi } from './cobranza-format'
import type { CashflowLine, CashflowWeek } from './treasury-format'
import type { CommittedCategory, CommittedItem, Currency } from './treasury-mock-data'
import { formatLaneAmount } from './treasury-position-view'

export function weekLabel(weekStartISO: string): string {
  return format(parseISO(weekStartISO), 'd LLL', { locale: es })
}

export const COMMITTED_CATEGORY_LABEL: Record<CommittedCategory, string> = {
  salaries: 'Sueldos',
  fixed_expense: 'Gastos fijos',
  tax: 'Impuestos',
  platform: 'Plataformas',
  retainer: 'Abonos',
  other: 'Otros',
}

export function lineCategoryLabel(category: CashflowLine['category']): string {
  if (category === 'collection') return 'Cobros'
  if (category === 'payment') return 'Pagos'
  return COMMITTED_CATEGORY_LABEL[category]
}

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

export function cashflowChartSeries(weeks: CashflowWeek[]): CashflowChartPoint[] {
  return weeks.map((week) => ({ label: weekLabel(week.weekStart), value: week.closing }))
}

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
  belowZero: boolean[]
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

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

export function commitmentSearchText(item: CommittedItem): string {
  return [item.description, COMMITTED_CATEGORY_LABEL[item.category], item.direction]
    .join(' ')
    .toLowerCase()
}

export function weekRealizedNet(week: CashflowWeek): number {
  return week.lines
    .filter((line) => line.basis === 'actual')
    .reduce((net, line) => net + (line.direction === 'inflow' ? line.amount : -line.amount), 0)
}

export type ReconciliationRow = {
  weekStart: string
  weekLabel: string
  isElapsed: boolean
  planNet: number
  actualNet: number | null
  variance: number | null
}

export function reconciliationRows(
  reconciledWeeks: CashflowWeek[],
  planWeeks: CashflowWeek[],
  todayISO: string,
): ReconciliationRow[] {
  return reconciledWeeks.map((week, index) => {
    const plan = planWeeks[index] ?? week
    const planNet = plan.inflows - plan.outflows
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

export function reconciliationSummary(rows: ReconciliationRow[]): ReconciliationSummary {
  const elapsed = rows.filter((row) => row.isElapsed)
  const realized = elapsed.reduce((sum, row) => sum + (row.actualNet ?? 0), 0)
  const planned = elapsed.reduce((sum, row) => sum + row.planNet, 0)
  return { weeksElapsed: elapsed.length, realized, planned, variance: realized - planned }
}

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
