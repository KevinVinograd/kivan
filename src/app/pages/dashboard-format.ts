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

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`
}

export function formatHours(value: number | null): string {
  if (value == null) return NO_VALUE
  const rounded = Math.round(value * 10) / 10
  return `${rounded.toLocaleString('es-AR', { maximumFractionDigits: 1 })} h`
}

export type StatusBadge = { label: string; variant: BadgeVariant; highContrast?: boolean }

const RISK_LEVEL: Record<RiskLevel, StatusBadge> = {
  saludable: { label: 'Saludable', variant: 'success' },
  atencion: { label: 'Atención', variant: 'warning' },
  riesgo_alto: { label: 'Riesgo alto', variant: 'danger', highContrast: true },
}

export function riskLevelBadge(level: RiskLevel): StatusBadge {
  return RISK_LEVEL[level]
}

const ALERT_SEVERITY: Record<AlertSeverity, StatusBadge> = {
  critical: { label: 'Crítica', variant: 'danger', highContrast: true },
  high: { label: 'Alta', variant: 'danger', highContrast: true },
  medium: { label: 'Media', variant: 'warning' },
  low: { label: 'Baja', variant: 'neutral' },
}

export function alertSeverityBadge(severity: AlertSeverity): StatusBadge {
  return ALERT_SEVERITY[severity]
}

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

const PAYMENT_ROW: Record<PaymentRowStatus, StatusBadge> = {
  pendiente: { label: 'Pendiente', variant: 'neutral' },
  vencido: { label: 'Vencido', variant: 'danger' },
  pagado: { label: 'Pagado', variant: 'success' },
  parcial: { label: 'Parcial', variant: 'warning' },
}

export function paymentRowBadge(status: PaymentRowStatus): StatusBadge {
  return PAYMENT_ROW[status]
}

const CLIENT_PAYMENT: Record<PaymentStatus, StatusBadge> = {
  paid: { label: 'Cobrado', variant: 'success' },
  pending: { label: 'Pendiente', variant: 'neutral' },
  overdue: { label: 'Vencido', variant: 'danger' },
  partial: { label: 'Parcial', variant: 'warning' },
}

export function clientPaymentBadge(status: PaymentStatus): StatusBadge {
  return CLIENT_PAYMENT[status]
}

const TEAM_LOAD: Record<TeamLoadStatus, StatusBadge> = {
  alta: { label: 'Alta', variant: 'danger' },
  normal: { label: 'Normal', variant: 'success' },
  baja: { label: 'Baja', variant: 'warning' },
  sin_carga: { label: 'Sin carga', variant: 'neutral' },
}

export function teamLoadBadge(status: TeamLoadStatus): StatusBadge {
  return TEAM_LOAD[status]
}

