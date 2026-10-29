import { differenceInCalendarDays, parseISO } from 'date-fns'

import type {
  ClientProfitabilityReportItem,
  MetricDelta,
  ProductivityReportItem,
  ReportDataset,
  SummaryMetric,
  TeamCapacityReportItem,
} from './reports-types'
import { formatPercent } from './reports-format'

export type ChartDatum = { id: string; label: string; value: number }

function groupHours(
  items: ProductivityReportItem[],
  keyOf: (item: ProductivityReportItem) => { id: string; label: string },
): ChartDatum[] {
  const map = new Map<string, ChartDatum>()
  for (const item of items) {
    const { id, label } = keyOf(item)
    const entry = map.get(id) ?? { id, label, value: 0 }
    entry.value += item.hours
    map.set(id, entry)
  }
  return Array.from(map.values()).sort((a, b) => b.value - a.value)
}

export function hoursByPerson(items: ProductivityReportItem[]): ChartDatum[] {
  return groupHours(items, (i) => ({ id: i.personId, label: i.personName }))
}

export function hoursByClient(items: ProductivityReportItem[]): ChartDatum[] {
  return groupHours(items, (i) => ({ id: i.clientId, label: i.clientName }))
}

export function hoursByTask(items: ProductivityReportItem[]): ChartDatum[] {
  return groupHours(items, (i) => ({ id: i.taskType, label: i.taskType }))
}

export const OTHER_BUCKET_ID = 'otros'

export type RankedChartData = {
  shown: ChartDatum[]
  tailCount: number
  tailValue: number
}

export function topRanked(data: ChartDatum[], limit: number): RankedChartData {
  if (data.length <= limit) return { shown: data, tailCount: 0, tailValue: 0 }
  const tail = data.slice(limit)
  return {
    shown: data.slice(0, limit),
    tailCount: tail.length,
    tailValue: tail.reduce((sum, datum) => sum + datum.value, 0),
  }
}

export function withOtherBucket(data: ChartDatum[], limit: number): ChartDatum[] {
  if (data.length <= limit) return data
  const rest = data.slice(limit - 1)
  return [
    ...data.slice(0, limit - 1),
    {
      id: OTHER_BUCKET_ID,
      label: 'Otros',
      value: rest.reduce((sum, datum) => sum + datum.value, 0),
    },
  ]
}

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export type CohortRanking = {
  shown: ChartDatum[]
  selectedId: string
  rank: number
  total: number
  median: number
  deltaVsMedian: number
}

export function cohortRanking(
  data: ChartDatum[],
  selectedId: string,
  windowSize: number,
): CohortRanking | null {
  if (data.length < 2) return null
  const ordered = [...data].sort((a, b) => b.value - a.value)
  const index = ordered.findIndex((datum) => datum.id === selectedId)
  if (index === -1) return null

  const size = Math.min(windowSize, ordered.length)
  const start = Math.max(0, Math.min(index - Math.floor((size - 1) / 2), ordered.length - size))
  const shown = ordered.slice(start, start + size)

  const centre = median(ordered.map((datum) => datum.value))
  return {
    shown,
    selectedId,
    rank: index + 1,
    total: ordered.length,
    median: centre,
    deltaVsMedian: ordered[index].value - centre,
  }
}

export function riskClients(profitability: ClientProfitabilityReportItem[]): ClientProfitabilityReportItem[] {
  const flagged: ClientProfitabilityReportItem['status'][] = [
    'perdida',
    'margen_bajo',
    'revisar_precio',
    'excedido_horas',
  ]
  return profitability
    .filter((item) => flagged.includes(item.status))
    .sort((a, b) => a.margen - b.margen)
}

export function topLoadedTeam(capacity: TeamCapacityReportItem[]): TeamCapacityReportItem[] {
  return [...capacity].sort((a, b) => {
    if (a.utilization == null && b.utilization == null) return 0
    if (a.utilization == null) return 1
    if (b.utilization == null) return -1
    return b.utilization - a.utilization
  })
}

export type ResumenCardSummary = {
  count: number
  signals: string[]
}

export function riskCardSummary(
  risk: ClientProfitabilityReportItem[],
  showProfitability: boolean,
): ResumenCardSummary {
  const signals: string[] = []
  const losses = risk.filter((client) => client.status === 'perdida').length
  if (losses > 0) signals.push(`${losses} con pérdida`)
  if (showProfitability && risk.length > 0) {
    const worstMargin = Math.min(...risk.map((client) => client.margen))
    signals.push(`margen mín. ${formatPercent(worstMargin)}`)
  }
  return { count: risk.length, signals }
}

export function loadCardSummary(loaded: TeamCapacityReportItem[]): ResumenCardSummary {
  const signals: string[] = []
  const overloaded = loaded.filter((person) => person.status === 'sobrecargada').length
  if (overloaded > 0) {
    signals.push(`${overloaded} ${overloaded === 1 ? 'sobrecargada' : 'sobrecargadas'}`)
  }
  const measured = loaded
    .map((person) => person.utilization)
    .filter((value): value is number => value != null)
  if (measured.length > 0) {
    signals.push(`util. máx ${formatPercent(Math.max(...measured) * 100)}`)
  }
  return { count: loaded.length, signals }
}

function deltaOf(current: number, previous: number | undefined): MetricDelta | null {
  if (previous === undefined) return null
  const absolute = current - previous
  const percent = previous !== 0 ? (absolute / previous) * 100 : null
  return { absolute, percent }
}

export function summaryMetrics(
  current: ReportDataset,
  previous: ReportDataset | null,
): SummaryMetric[] {
  const c = current.summary
  const p = previous?.summary
  return [
    { id: 'ingresos', value: c.ingresos, delta: deltaOf(c.ingresos, p?.ingresos) },
    { id: 'egresos', value: c.egresos, delta: deltaOf(c.egresos, p?.egresos) },
    { id: 'rentabilidad', value: c.rentabilidad, delta: deltaOf(c.rentabilidad, p?.rentabilidad) },
    { id: 'horasCargadas', value: c.horasCargadas, delta: deltaOf(c.horasCargadas, p?.horasCargadas) },
    { id: 'clientesActivos', value: c.clientesActivos, delta: deltaOf(c.clientesActivos, p?.clientesActivos) },
    {
      id: 'extras',
      value: c.extrasFueraScopeCount,
      delta: deltaOf(c.extrasFueraScopeCount, p?.extrasFueraScopeCount),
    },
  ]
}

export function summaryInsight(
  current: ReportDataset,
  previous: ReportDataset | null,
  showProfitability = true,
): string {
  const toReview = current.profitability.filter(
    (c) => c.status === 'revisar_precio' || (c.monthsSinceIncrease ?? 0) >= 6,
  ).length
  const overloaded = current.capacity.filter((c) => c.status === 'sobrecargada').length
  const marginNow = current.summary.margenPromedio
  const marginPrev = previous && previous.profitability.length > 0 ? previous.summary.margenPromedio : undefined

  const parts: string[] = []
  if (showProfitability) {
    if (marginPrev !== undefined && marginNow < marginPrev) {
      parts.push('La rentabilidad bajó respecto al período anterior.')
    } else if (marginPrev !== undefined && marginNow > marginPrev) {
      parts.push('La rentabilidad mejoró respecto al período anterior.')
    } else if (marginPrev === undefined) {
      parts.push('Todavía no hay un período anterior con datos para comparar la rentabilidad.')
    } else {
      parts.push('La rentabilidad se mantiene estable en el período.')
    }
  }
  if (toReview > 0) {
    parts.push(
      `Hay ${toReview} ${toReview === 1 ? 'cliente' : 'clientes'} con más de 6 meses sin aumento que conviene revisar.`,
    )
  }
  if (overloaded > 0) {
    parts.push(
      `${overloaded} ${overloaded === 1 ? 'persona está' : 'personas están'} con carga operativa alta este mes.`,
    )
  }
  return parts.join(' ')
}

export type AgingBucket = { id: string; label: string; count: number; amount: number }

const AGING_BANDS: { id: string; label: string; max: number }[] = [
  { id: '0-30', label: '1 a 30 días', max: 30 },
  { id: '31-60', label: '31 a 60 días', max: 60 },
  { id: '61-90', label: '61 a 90 días', max: 90 },
  { id: '90+', label: 'Más de 90 días', max: Infinity },
]

export function agingBuckets(
  rows: { dueDate: string; totalAmount: number }[],
  periodEnd: string,
): AgingBucket[] {
  const end = parseISO(periodEnd)
  const buckets: AgingBucket[] = AGING_BANDS.map((band) => ({
    id: band.id,
    label: band.label,
    count: 0,
    amount: 0,
  }))
  for (const row of rows) {
    const daysOverdue = differenceInCalendarDays(end, parseISO(row.dueDate))
    if (!Number.isFinite(daysOverdue) || daysOverdue <= 0) continue
    const index = AGING_BANDS.findIndex((band) => daysOverdue <= band.max)
    buckets[index].count += 1
    buckets[index].amount += row.totalAmount
  }
  return buckets
}

export function concentration<T>(
  rows: T[],
  nameOf: (row: T) => string,
  amountOf: (row: T) => number,
  top: number,
): { top: { name: string; amount: number }[]; topShare: number; total: number } {
  const merged = new Map<string, number>()
  for (const row of rows) {
    const name = nameOf(row)
    merged.set(name, (merged.get(name) ?? 0) + amountOf(row))
  }
  const ranked = Array.from(merged.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
  const total = ranked.reduce((sum, entry) => sum + entry.amount, 0)
  const leaders = ranked.slice(0, top)
  const leadersTotal = leaders.reduce((sum, entry) => sum + entry.amount, 0)
  return {
    top: leaders,
    topShare: total > 0 ? (leadersTotal / total) * 100 : 0,
    total,
  }
}
