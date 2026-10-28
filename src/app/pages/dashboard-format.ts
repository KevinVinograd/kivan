/**
 * Owner Dashboard — formatting + status display helpers.
 *
 * Pure functions that turn derived dashboard values into labels and Badge
 * variants. Currency, percent and relative-date formatting are reused from the
 * shared cobranza vocabulary so the whole product speaks one money/date
 * language. Formatting never lives in the data layer.
 */
import type { BadgeVariant } from '@/app/components/components'
import { ICON, type Icon } from '@/app/lib/icon-registry'
import { NO_VALUE } from './cobranza-format'
import type { PaymentStatus } from './clients-mock-data'
import type {
  AlertSeverity,
  DashboardActivityKind,
  PaymentRowStatus,
  RiskLevel,
  TeamLoadStatus,
} from './dashboard-types'

export {
  formatCurrency,
  formatCompactCurrency,
  formatShortDate,
  formatRelativeDate,
  formatMonthYear,
  NO_REGISTRO,
} from './cobranza-format'

/** Whole-percent label from a 0-100 figure (e.g. 42 -> "42%"). */
export function formatPercent(value: number): string {
  return `${Math.round(value)}%`
}

/** Hours label with up to one decimal (e.g. "38 h", "12,5 h"). Null renders as the
 *  shared no-value dash: an unconfigured capacity is unknown, not "0 h". */
export function formatHours(value: number | null): string {
  if (value == null) return NO_VALUE
  const rounded = Math.round(value * 10) / 10
  return `${rounded.toLocaleString('es-AR', { maximumFractionDigits: 1 })} h`
}

/**
 * A Badge descriptor. `highContrast` opts a state into the loud emphasis fill —
 * set it only on the few "act now" states that must stand out (e.g. the top risk
 * band or a critical alert), never as a default, so the treatment keeps its
 * signal. Consumers forward it to `<Badge highContrast={...}>`.
 */
export type StatusBadge = { label: string; variant: BadgeVariant; highContrast?: boolean }

// ── Risk level ───────────────────────────────────────────────────────────────
const RISK_LEVEL: Record<RiskLevel, StatusBadge> = {
  saludable: { label: 'Saludable', variant: 'success' },
  atencion: { label: 'Atención', variant: 'warning' },
  riesgo_alto: { label: 'Riesgo alto', variant: 'danger', highContrast: true },
}

export function riskLevelBadge(level: RiskLevel): StatusBadge {
  return RISK_LEVEL[level]
}

// ── Alert severity ───────────────────────────────────────────────────────────
const ALERT_SEVERITY: Record<AlertSeverity, StatusBadge> = {
  critical: { label: 'Crítica', variant: 'danger', highContrast: true },
  high: { label: 'Alta', variant: 'danger', highContrast: true },
  medium: { label: 'Media', variant: 'warning' },
  low: { label: 'Baja', variant: 'neutral' },
}

export function alertSeverityBadge(severity: AlertSeverity): StatusBadge {
  return ALERT_SEVERITY[severity]
}

// ── Activity kind → icon (§8) ────────────────────────────────────────────────
/** Each activity kind maps to an already-registered icon (no new registry entry). */
const ACTIVITY_ICON: Record<DashboardActivityKind, Icon> = {
  cobro: ICON.payment,
  horas: ICON.logHours,
  viatico: ICON.expense,
  feedback: ICON.feedback,
  facturacion: ICON.invoice,
  banco: ICON.bankDetails,
}
export function activityIcon(kind: DashboardActivityKind): Icon {
  return ACTIVITY_ICON[kind]
}

// ── Payment row status ───────────────────────────────────────────────────────
const PAYMENT_ROW: Record<PaymentRowStatus, StatusBadge> = {
  pendiente: { label: 'Pendiente', variant: 'neutral' },
  vencido: { label: 'Vencido', variant: 'danger' },
  pagado: { label: 'Pagado', variant: 'success' },
  parcial: { label: 'Parcial', variant: 'warning' },
}

export function paymentRowBadge(status: PaymentRowStatus): StatusBadge {
  return PAYMENT_ROW[status]
}

// ── Client payment status (Clientes mock enum) ───────────────────────────────
const CLIENT_PAYMENT: Record<PaymentStatus, StatusBadge> = {
  paid: { label: 'Cobrado', variant: 'success' },
  pending: { label: 'Pendiente', variant: 'neutral' },
  overdue: { label: 'Vencido', variant: 'danger' },
  partial: { label: 'Parcial', variant: 'warning' },
}

export function clientPaymentBadge(status: PaymentStatus): StatusBadge {
  return CLIENT_PAYMENT[status]
}

// ── Team load status ─────────────────────────────────────────────────────────
const TEAM_LOAD: Record<TeamLoadStatus, StatusBadge> = {
  alta: { label: 'Alta', variant: 'danger' },
  normal: { label: 'Normal', variant: 'success' },
  baja: { label: 'Baja', variant: 'warning' },
  sin_carga: { label: 'Sin carga', variant: 'neutral' },
}

export function teamLoadBadge(status: TeamLoadStatus): StatusBadge {
  return TEAM_LOAD[status]
}

// The margin band no longer has a badge: the profitability section draws the rankings as
// bars, and the band is what picks each bar's data-state fill (`dashboard-margin-chart.tsx`).
// A badge beside the bar would restate what the bar and its printed value already say.
