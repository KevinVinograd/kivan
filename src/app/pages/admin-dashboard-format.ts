import type { BadgeVariant } from '@/app/components/components'
import type {
  AdminSeverity,
  BillingItemStatus,
  CollectionStatus,
  ExpenseStatus,
  HoursPersonStatus,
  MonotributoAlert,
  PendingType,
  TeamPayStatus,
  ViaticoStatus,
} from './admin-dashboard-types'

export {
  formatCurrency,
  formatCompactCurrency,
  formatPercent,
  formatDate,
  formatSignedPercent,
} from './monthly-operation-format'
export { formatShortDate, formatRelativeDate, formatHours } from './dashboard-format'

export type StatusBadge = { label: string; variant: BadgeVariant }

const SEVERITY: Record<AdminSeverity, StatusBadge> = {
  alta: { label: 'Alta', variant: 'danger' },
  media: { label: 'Media', variant: 'warning' },
  baja: { label: 'Baja', variant: 'neutral' },
}

export function severityBadge(severity: AdminSeverity): StatusBadge {
  return SEVERITY[severity]
}

export const SEVERITY_RANK: Record<AdminSeverity, number> = { alta: 0, media: 1, baja: 2 }

export const PENDING_TYPE_LABEL: Record<PendingType, string> = {
  horas: 'Horas',
  viaticos: 'Viáticos',
  extra: 'Extras',
  pago: 'Pago',
  banco: 'Datos bancarios',
  cobro: 'Cobro',
  facturacion: 'Facturación',
  arca: 'ARCA',
  gasto: 'Gasto fijo',
  produccion: 'Producción',
}

const HOURS_STATUS: Record<HoursPersonStatus, StatusBadge> = {
  completo: { label: 'Completo', variant: 'success' },
  incompleto: { label: 'Incompleto', variant: 'warning' },
  sin_carga: { label: 'Sin carga', variant: 'danger' },
}

export function hoursStatusBadge(status: HoursPersonStatus): StatusBadge {
  return HOURS_STATUS[status]
}

const VIATICO_STATUS: Record<ViaticoStatus, StatusBadge> = {
  sin_cargar: { label: 'Sin cargar', variant: 'neutral' },
  sin_pagar: { label: 'Sin pagar', variant: 'warning' },
  pagado: { label: 'Pagado', variant: 'success' },
}

export function viaticoStatusBadge(status: ViaticoStatus): StatusBadge {
  return VIATICO_STATUS[status]
}

const TEAM_PAY_STATUS: Record<TeamPayStatus, StatusBadge> = {
  listo: { label: 'Listo para pagar', variant: 'success' },
  pendiente: { label: 'Pendiente', variant: 'neutral' },
  bloqueado: { label: 'Bloqueado', variant: 'danger' },
  pagado: { label: 'Pagado', variant: 'success' },
}

export function teamPayStatusBadge(status: TeamPayStatus): StatusBadge {
  return TEAM_PAY_STATUS[status]
}

const COLLECTION_STATUS: Record<CollectionStatus, StatusBadge> = {
  pagado: { label: 'Pagado', variant: 'success' },
  pendiente: { label: 'Pendiente', variant: 'neutral' },
  vencido: { label: 'Vencido', variant: 'danger' },
  sin_registrar: { label: 'Sin registrar', variant: 'warning' },
}

export function collectionStatusBadge(status: CollectionStatus): StatusBadge {
  return COLLECTION_STATUS[status]
}

const MONOTRIBUTO_ALERT: Record<MonotributoAlert, StatusBadge> = {
  normal: { label: 'Normal', variant: 'success' },
  atencion: { label: 'Atención', variant: 'warning' },
  limite: { label: 'Cerca del límite', variant: 'danger' },
}

export function monotributoAlertBadge(alert: MonotributoAlert): StatusBadge {
  return MONOTRIBUTO_ALERT[alert]
}

const BILLING_ITEM_STATUS: Record<BillingItemStatus, StatusBadge> = {
  pendiente: { label: 'Pendiente', variant: 'neutral' },
  revisado: { label: 'Revisado', variant: 'success' },
  bloqueado: { label: 'Bloqueado', variant: 'danger' },
}

export function billingItemStatusBadge(status: BillingItemStatus): StatusBadge {
  return BILLING_ITEM_STATUS[status]
}

const EXPENSE_STATUS: Record<ExpenseStatus, StatusBadge> = {
  registrado: { label: 'Registrado', variant: 'success' },
  pendiente: { label: 'Pendiente', variant: 'neutral' },
  vencido: { label: 'Vencido', variant: 'danger' },
}

export function expenseStatusBadge(status: ExpenseStatus): StatusBadge {
  return EXPENSE_STATUS[status]
}
