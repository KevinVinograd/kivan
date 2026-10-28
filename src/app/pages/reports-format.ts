/**
 * Reportes — formatting + status display helpers.
 *
 * Pure functions that turn the derived report values into labels, badge
 * variants, percent/hours strings and the filter option sets. Currency, period
 * and short-date formatting are reused from `cobranza-format` so the whole app
 * shares one money/date vocabulary. Formatting never lives in the data layer.
 */
import { NO_VALUE } from './cobranza-format'
import type { Kpi, KpiTone, StatusBadge } from './cobranza-format'
import type { ClientProfitabilityStatus, TeamCapacityStatus, MetricDelta } from './reports-types'

export {
  formatCurrency,
  formatCompactCurrency,
  formatMonthYear,
  formatShortDate,
  formatRelativeDate,
  NO_VALUE,
  NO_REGISTRO,
} from './cobranza-format'
// Type-only, like `cobranza-format`: re-exporting the `KPI_TONE_FG` VALUE here would give
// this pure formatting module a runtime dependency on the React component barrel. Render
// surfaces import the map straight from `@/app/components/patterns`.
export type { Kpi, KpiTone, StatusBadge }

const percentFormatter = new Intl.NumberFormat('es-AR', {
  style: 'percent',
  maximumFractionDigits: 0,
})

/** Whole-percent label from a 0–100 figure (e.g. 42 → "42%"). Null renders as the
 *  shared no-value dash — never 0%, which would read as a real measurement of nothing. */
export function formatPercent(value: number | null): string {
  if (value == null) return NO_VALUE
  return percentFormatter.format(value / 100)
}

/** Hours label with up to one decimal (e.g. "128 h", "12,5 h"). Null renders as
 *  "Sin definir" — an unset capacity is not "0 h". */
export function formatHours(value: number | null): string {
  if (value == null) return NO_VALUE
  const rounded = Math.round(value * 10) / 10
  return `${rounded.toLocaleString('es-AR', { maximumFractionDigits: 1 })} h`
}

/** Signed percent label for a compare delta (e.g. "+12%", "-4%", "Sin dato"). */
export function formatDeltaPercent(delta: MetricDelta | null): string {
  if (!delta || delta.percent === null) return 'Sin dato anterior'
  const sign = delta.percent > 0 ? '+' : ''
  return `${sign}${Math.round(delta.percent)}%`
}

/** Direction of a delta for tone selection, accounting for "lower is better". */
export type DeltaTone = 'up' | 'down' | 'flat' | 'none'

export function deltaTone(delta: MetricDelta | null): DeltaTone {
  if (!delta || delta.percent === null) return 'none'
  if (delta.absolute > 0) return 'up'
  if (delta.absolute < 0) return 'down'
  return 'flat'
}

// ── Client profitability status ──────────────────────────────────────────────
const PROFITABILITY_STATUS: Record<ClientProfitabilityStatus, StatusBadge> = {
  rentable: { label: 'Rentable', variant: 'success' },
  margen_bajo: { label: 'Margen bajo', variant: 'warning' },
  perdida: { label: 'Pérdida', variant: 'danger' },
  revisar_precio: { label: 'Revisar precio', variant: 'warning' },
  excedido_horas: { label: 'Excedido en horas', variant: 'warning' },
  pago_pendiente: { label: 'Pago pendiente', variant: 'neutral' },
}

export function profitabilityStatusBadge(status: ClientProfitabilityStatus): StatusBadge {
  return PROFITABILITY_STATUS[status]
}

export const PROFITABILITY_STATUS_OPTIONS = (
  Object.keys(PROFITABILITY_STATUS) as ClientProfitabilityStatus[]
).map((value) => ({ value, label: PROFITABILITY_STATUS[value].label }))

// ── Team capacity status ─────────────────────────────────────────────────────
const CAPACITY_STATUS: Record<TeamCapacityStatus, StatusBadge> = {
  sobrecargada: { label: 'Sobrecargada', variant: 'danger' },
  balanceada: { label: 'Balanceada', variant: 'success' },
  subutilizada: { label: 'Subutilizada', variant: 'warning' },
  sin_carga: { label: 'Sin carga registrada', variant: 'neutral' },
  // Neutral on purpose: with no stipulated capacity there is nothing to judge, so this
  // is an absence of information — not a warning about the person.
  sin_capacidad: { label: 'Sin capacidad definida', variant: 'neutral' },
}

export function capacityStatusBadge(status: TeamCapacityStatus): StatusBadge {
  return CAPACITY_STATUS[status]
}

export const CAPACITY_STATUS_OPTIONS = (
  Object.keys(CAPACITY_STATUS) as TeamCapacityStatus[]
).map((value) => ({ value, label: CAPACITY_STATUS[value].label }))

/** Progress tone for a utilization ratio (0–1+). */
export function utilizationTone(
  utilization: number | null,
): 'success' | 'warning' | 'danger' | 'default' {
  // Unknown utilization is toneless: colouring it would assert a judgement we cannot make.
  if (utilization == null) return 'default'
  if (utilization <= 0) return 'default'
  if (utilization > 1) return 'danger'
  if (utilization < 0.6) return 'warning'
  return 'success'
}

// ── Finanzas bucket tone ─────────────────────────────────────────────────────
// Each Finanzas bucket id is the underlying status key (collection / payment /
// billing). Settled money reads success, in-flight reads warning, overdue or
// errored reads danger; cancelled / manual / not-required stay neutral.
const BUCKET_TONE: Record<string, KpiTone> = {
  collected: 'success',
  paid: 'success',
  approved: 'success',
  invoiced: 'success',
  sent: 'success',
  pending: 'warning',
  partial: 'warning',
  no_invoice: 'warning',
  overdue: 'danger',
  error_arca: 'danger',
}

/** Semantic tone for a Finanzas operativas status bucket, keyed by its id. */
export function bucketTone(id: string): KpiTone {
  return BUCKET_TONE[id] ?? 'default'
}

// Foreground token used to fill a Finanzas bucket's stacked-bar segment and its
// legend swatch. Mirrors the KPI tone palette but maps the neutral tone to the
// muted fg so "other" buckets stay quiet inside the single distribution bar.
const BUCKET_SEGMENT_FG: Record<KpiTone, string> = {
  default: 'fg-subtle',
  success: 'fg-success',
  warning: 'fg-warning',
  danger: 'fg-danger',
}

/** Foreground (fill) token for a Finanzas bucket's segment / legend swatch. */
export function bucketSegmentFg(id: string): string {
  return BUCKET_SEGMENT_FG[bucketTone(id)]
}
