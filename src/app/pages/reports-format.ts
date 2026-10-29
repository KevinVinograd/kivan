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
export type { Kpi, KpiTone, StatusBadge }

const percentFormatter = new Intl.NumberFormat('es-AR', {
  style: 'percent',
  maximumFractionDigits: 0,
})

export function formatPercent(value: number | null): string {
  if (value == null) return NO_VALUE
  return percentFormatter.format(value / 100)
}

export function formatHours(value: number | null): string {
  if (value == null) return NO_VALUE
  const rounded = Math.round(value * 10) / 10
  return `${rounded.toLocaleString('es-AR', { maximumFractionDigits: 1 })} h`
}

export function formatDeltaPercent(delta: MetricDelta | null): string {
  if (!delta || delta.percent === null) return 'Sin dato anterior'
  const sign = delta.percent > 0 ? '+' : ''
  return `${sign}${Math.round(delta.percent)}%`
}

export type DeltaTone = 'up' | 'down' | 'flat' | 'none'

export function deltaTone(delta: MetricDelta | null): DeltaTone {
  if (!delta || delta.percent === null) return 'none'
  if (delta.absolute > 0) return 'up'
  if (delta.absolute < 0) return 'down'
  return 'flat'
}

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

const CAPACITY_STATUS: Record<TeamCapacityStatus, StatusBadge> = {
  sobrecargada: { label: 'Sobrecargada', variant: 'danger' },
  balanceada: { label: 'Balanceada', variant: 'success' },
  subutilizada: { label: 'Subutilizada', variant: 'warning' },
  sin_carga: { label: 'Sin carga registrada', variant: 'neutral' },
  sin_capacidad: { label: 'Sin capacidad definida', variant: 'neutral' },
}

export function capacityStatusBadge(status: TeamCapacityStatus): StatusBadge {
  return CAPACITY_STATUS[status]
}

export const CAPACITY_STATUS_OPTIONS = (
  Object.keys(CAPACITY_STATUS) as TeamCapacityStatus[]
).map((value) => ({ value, label: CAPACITY_STATUS[value].label }))

export function utilizationTone(
  utilization: number | null,
): 'success' | 'warning' | 'danger' | 'default' {
  if (utilization == null) return 'default'
  if (utilization <= 0) return 'default'
  if (utilization > 1) return 'danger'
  if (utilization < 0.6) return 'warning'
  return 'success'
}

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

export function bucketTone(id: string): KpiTone {
  return BUCKET_TONE[id] ?? 'default'
}

const BUCKET_SEGMENT_FG: Record<KpiTone, string> = {
  default: 'fg-subtle',
  success: 'fg-success',
  warning: 'fg-warning',
  danger: 'fg-danger',
}

export function bucketSegmentFg(id: string): string {
  return BUCKET_SEGMENT_FG[bucketTone(id)]
}
