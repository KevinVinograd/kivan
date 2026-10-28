/**
 * Reportes — pure aggregation + insight helpers over a derived dataset.
 *
 * These read a `ReportDataset` (and optionally the previous period's dataset for
 * the compare toggle) and produce the chart groupings, risk lists, compare
 * deltas and the Resumen insight copy. Read-only and side-effect free.
 */
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

/** A labelled value for a bar/donut chart. */
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

/** Id of the synthetic slice that carries a donut's truncated residual. */
export const OTHER_BUCKET_ID = 'otros'

/** A ranking capped to its leading categories, plus what the cap left out. */
export type RankedChartData = {
  /** The categories that made the cut, still ordered desc by value. */
  shown: ChartDatum[]
  /** How many categories the cap left out (0 when nothing was truncated). */
  tailCount: number
  /** The hours those left-out categories add up to. */
  tailValue: number
}

/**
 * Cap a ranking at `limit` categories and summarize the rest.
 *
 * A chart card's height is fixed by the layout, so the data is capped to fit it —
 * never the reverse, which is what let a studio with many clients stretch its card
 * and tear a hole in the row. The tail is summarized, not dropped.
 *
 * It is deliberately NOT folded into an "Otros" bar: a ranking exists to order
 * categories, and an aggregate of the tail can outgrow the leader and invert the
 * very order the chart is read for. Part-to-whole charts, where the residual must
 * be drawn or the whole is a lie, use `withOtherBucket` instead.
 */
export function topRanked(data: ChartDatum[], limit: number): RankedChartData {
  if (data.length <= limit) return { shown: data, tailCount: 0, tailValue: 0 }
  const tail = data.slice(limit)
  return {
    shown: data.slice(0, limit),
    tailCount: tail.length,
    tailValue: tail.reduce((sum, datum) => sum + datum.value, 0),
  }
}

/**
 * Cap a part-to-whole series at `limit` slices, folding the residual into a single
 * "Otros" bucket so the ring still sums to the whole.
 *
 * `limit` counts the "Otros" slice itself, so `limit = 6` yields the top 5 plus the
 * bucket. Six is this composition's own ceiling, not a design-system rule: past it
 * adjacent arcs get too thin to compare, and the legend outgrows the chart it labels.
 * (A cap also has to stay under `DATA_PALETTE`'s 13 hues — beyond that the index
 * cycle wraps and two categories render in the same color.)
 */
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

// ── Cohort comparison ────────────────────────────────────────────────────────

/**
 * Median of a numeric list. The cohort centre is the MEDIAN, not the mean: a
 * single overloaded person (112%) drags the mean of a six-person team, and the
 * comparison exists precisely to place that outlier.
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** One entity placed against its cohort: the drawn window, its true rank, and the centre. */
export type CohortRanking = {
  /** The window actually drawn, ordered desc by value. Always contains `selectedId`. */
  shown: ChartDatum[]
  selectedId: string
  /** 1-based rank of the selected entity across the FULL cohort, not the window. */
  rank: number
  /** Full cohort size. */
  total: number
  /** Median over the FULL cohort. */
  median: number
  /** Selected value minus the cohort median. */
  deltaVsMedian: number
}

/**
 * Place one entity against its cohort on a normalized axis.
 *
 * The window is centred on the SELECTED entity rather than taking the top N:
 * with twenty clients a top-8 would silently drop the very client being read
 * whenever it ranks ninth or worse — which is exactly when its position matters.
 * The window slides and clamps at both ends, so a leader or a laggard still sees
 * a full window of neighbours. The rank and the median are always computed over
 * the full cohort, so the caption tells the truth even when the bars are a slice.
 *
 * Returns `null` when there is nothing to compare against: an empty cohort, a
 * selected id the cohort does not contain, or a cohort of one (the subject alone
 * — a lone bar with a median line through it is not a comparison).
 */
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
  // Centre the window on the selection, then clamp it inside the cohort's bounds.
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

/** Clients flagged for attention, worst margin first (Resumen risk table, §1). */
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

/** Most-loaded people first (Resumen workload table, §1). People with no configured
 *  capacity have no utilization to rank on, so they sort last instead of masquerading
 *  as the least-loaded members of the team. */
export function topLoadedTeam(capacity: TeamCapacityReportItem[]): TeamCapacityReportItem[] {
  return [...capacity].sort((a, b) => {
    if (a.utilization == null && b.utilization == null) return 0
    if (a.utilization == null) return 1
    if (b.utilization == null) return -1
    return b.utilization - a.utilization
  })
}

/**
 * Collapsed-header summary for a Resumen disclosure card (§1): the record count
 * plus the short severity signals shown beside the title while the card is
 * closed. The detail table is the source of truth; this is the at-a-glance line.
 */
export type ResumenCardSummary = {
  /** How many records the card holds (the caller's already-capped slice). */
  count: number
  /** Severity signals rendered after the count, joined by " · " in the header. */
  signals: string[]
}

/**
 * Collapsed summary for the "Clientes con riesgo" card: the at-risk count, how
 * many are outright losses, and (capability-gated) the worst margin in the slice.
 * Margin is profitability data, so `showProfitability` gates it; the admin keeps
 * only the count and the loss count, both already visible in the table's Estado.
 */
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

/**
 * Collapsed summary for the "Equipo con mayor carga" card: the team count, how
 * many are overloaded, and the peak utilization in the slice. Workload is
 * operational (not profitability), so every role sees the full summary.
 */
export function loadCardSummary(loaded: TeamCapacityReportItem[]): ResumenCardSummary {
  const signals: string[] = []
  const overloaded = loaded.filter((person) => person.status === 'sobrecargada').length
  if (overloaded > 0) {
    signals.push(`${overloaded} ${overloaded === 1 ? 'sobrecargada' : 'sobrecargadas'}`)
  }
  // Peak utilization only across people with a configured capacity — `Math.max` over a
  // list containing nulls would coerce them to 0 and, with nobody configured, report a
  // confident "util. máx 0%".
  const measured = loaded
    .map((person) => person.utilization)
    .filter((value): value is number => value != null)
  if (measured.length > 0) {
    signals.push(`util. máx ${formatPercent(Math.max(...measured) * 100)}`)
  }
  return { count: loaded.length, signals }
}

// ── Compare deltas ───────────────────────────────────────────────────────────
function deltaOf(current: number, previous: number | undefined): MetricDelta | null {
  if (previous === undefined) return null
  const absolute = current - previous
  const percent = previous !== 0 ? (absolute / previous) * 100 : null
  return { absolute, percent }
}

/** The six Resumen headline metrics, with compare deltas when a prior period is given. */
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

/**
 * Resumen insight copy, derived from the real risk signals: how the average
 * margin moved vs. the prior period, how many clients need a price review, and
 * how many people are overloaded. Plain sentences, no em dash.
 *
 * `showProfitability` gates the profitability lead sentence: when
 * false (admin), the rentabilidad framing is omitted and only the operational
 * signals (price-review, overload) remain, which may yield an empty string when
 * there are no operational signals — the caller then hides the insight banner.
 */
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
  // A previous period with no client rows has a 0% margin that only means "no data": comparing
  // against it made every month "mejoró" (25/10 review). No rows, no comparison.
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

// ── Aging + concentration (Finanzas bucket drawer) ───────────────────────────

/** One age band of overdue money. */
export type AgingBucket = { id: string; label: string; count: number; amount: number }

const AGING_BANDS: { id: string; label: string; max: number }[] = [
  { id: '0-30', label: '1 a 30 días', max: 30 },
  { id: '31-60', label: '31 a 60 días', max: 60 },
  { id: '61-90', label: '61 a 90 días', max: 90 },
  { id: '90+', label: 'Más de 90 días', max: Infinity },
]

/**
 * Split overdue money into age bands.
 *
 * Age is measured to the LAST DAY OF THE PERÍODO, never to `today`: /reports is
 * period-scoped, and measuring against a moving `today` would make a June report
 * report a different aging every day it is reopened. A record not yet due at the
 * period end is not overdue and lands in no band.
 *
 * All four bands are always returned, empty ones included, so the chart keeps a stable
 * shape across periods instead of growing and shrinking its axis.
 */
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
    // A date `parseISO` cannot read yields NaN, and `NaN <= 0` is false — so without this
    // guard the row falls through to `findIndex`, which matches no band (NaN <= Infinity
    // is false too), returns -1, and `buckets[-1].count += 1` throws. A record whose due
    // date is unreadable has no age; it is skipped, not crashed on.
    if (!Number.isFinite(daysOverdue) || daysOverdue <= 0) continue
    const index = AGING_BANDS.findIndex((band) => daysOverdue <= band.max)
    buckets[index].count += 1
    buckets[index].amount += row.totalAmount
  }
  return buckets
}

/** How much of a total sits with its few largest contributors. */
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
