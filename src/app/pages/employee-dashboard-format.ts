/**
 * Employee Dashboard — formatting + status display helpers.
 *
 * Pure functions that turn employee values into labels, Badge variants and
 * Progress tones. Currency / percent / hours / relative-date formatting are
 * reused from the shared vocabulary (via `dashboard-format`) so the whole product
 * speaks one money/date language. Formatting never lives in the data layer.
 */
import type { BadgeVariant, ProgressTone } from '@/app/components/components'
import { ICON, type Icon } from '@/app/lib/icon-registry'
import type {
  AssignedClientStatus,
  EmployeeActivityKind,
  EmployeeAlertTone,
  ExtraKind,
  ExtraStatus,
  HoursStatus,
  ObjectiveStatus,
  PendingStatus,
  PendingType,
  TaskKind,
  TaskStatus,
} from './employee-dashboard-types'

export {
  formatCurrency,
  formatCompactCurrency,
  formatShortDate,
  formatRelativeDate,
  formatMonthYear,
  formatPercent,
  formatHours,
  NO_REGISTRO,
} from './dashboard-format'

export type StatusBadge = { label: string; variant: BadgeVariant }

// ── Pending status (§2) ──────────────────────────────────────────────────────
const PENDING_STATUS: Record<PendingStatus, StatusBadge> = {
  pendiente: { label: 'Pendiente', variant: 'neutral' },
  atencion: { label: 'Atención', variant: 'warning' },
  vencido: { label: 'Vencido', variant: 'danger' },
}
export function pendingStatusBadge(status: PendingStatus): StatusBadge {
  return PENDING_STATUS[status]
}

const PENDING_TYPE_LABEL: Record<PendingType, string> = {
  horas: 'Horas',
  tarea: 'Tarea',
  produccion: 'Producción',
  extra: 'Extra',
  viatico: 'Viático',
  seguimiento: 'Seguimiento',
  feedback: 'Feedback',
  objetivo: 'Objetivo',
}
export function pendingTypeLabel(type: PendingType): string {
  return PENDING_TYPE_LABEL[type]
}

// ── Assigned client status (§3) ──────────────────────────────────────────────
const CLIENT_STATUS: Record<AssignedClientStatus, StatusBadge> = {
  al_dia: { label: 'Al día', variant: 'success' },
  atencion: { label: 'Atención', variant: 'warning' },
  pendiente: { label: 'Pendiente', variant: 'neutral' },
}
export function clientStatusBadge(status: AssignedClientStatus): StatusBadge {
  return CLIENT_STATUS[status]
}

// ── Objective status (§4) ────────────────────────────────────────────────────
const OBJECTIVE_STATUS: Record<ObjectiveStatus, StatusBadge> = {
  en_curso: { label: 'En curso', variant: 'neutral' },
  completado: { label: 'Completado', variant: 'success' },
  en_riesgo: { label: 'En riesgo', variant: 'warning' },
  vencido: { label: 'Vencido', variant: 'danger' },
}
export function objectiveStatusBadge(status: ObjectiveStatus): StatusBadge {
  return OBJECTIVE_STATUS[status]
}

const OBJECTIVE_PROGRESS_TONE: Record<ObjectiveStatus, ProgressTone> = {
  en_curso: 'default',
  completado: 'success',
  en_riesgo: 'warning',
  vencido: 'danger',
}
export function objectiveProgressTone(status: ObjectiveStatus): ProgressTone {
  return OBJECTIVE_PROGRESS_TONE[status]
}

// ── Hours status (§5) ────────────────────────────────────────────────────────
const HOURS_STATUS: Record<HoursStatus, StatusBadge> = {
  completo: { label: 'Completo', variant: 'success' },
  incompleto: { label: 'Incompleto', variant: 'warning' },
  sin_carga: { label: 'Sin carga', variant: 'neutral' },
}
export function hoursStatusBadge(status: HoursStatus): StatusBadge {
  return HOURS_STATUS[status]
}

// ── Task / production status (§6) ─────────────────────────────────────────────
const TASK_STATUS: Record<TaskStatus, StatusBadge> = {
  pendiente: { label: 'Pendiente', variant: 'neutral' },
  en_curso: { label: 'En curso', variant: 'neutral' },
  completado: { label: 'Completado', variant: 'success' },
  vencido: { label: 'Vencido', variant: 'danger' },
}
export function taskStatusBadge(status: TaskStatus): StatusBadge {
  return TASK_STATUS[status]
}

const TASK_KIND_LABEL: Record<TaskKind, string> = {
  produccion: 'Producción',
  tarea: 'Tarea',
}
export function taskKindLabel(kind: TaskKind): string {
  return TASK_KIND_LABEL[kind]
}

// ── Extra / viático status (§7) ──────────────────────────────────────────────
const EXTRA_STATUS: Record<ExtraStatus, StatusBadge> = {
  pendiente: { label: 'Pendiente', variant: 'neutral' },
  declarado: { label: 'Declarado', variant: 'neutral' },
  en_revision: { label: 'En revisión', variant: 'warning' },
  aprobado: { label: 'Aprobado', variant: 'success' },
}
export function extraStatusBadge(status: ExtraStatus): StatusBadge {
  return EXTRA_STATUS[status]
}

const EXTRA_KIND_LABEL: Record<ExtraKind, string> = {
  extra: 'Extra',
  viatico: 'Viático',
}
export function extraKindLabel(kind: ExtraKind): string {
  return EXTRA_KIND_LABEL[kind]
}

// ── Activity kind → icon (§9) ────────────────────────────────────────────────
/** Each activity kind maps to an already-registered icon (no new registry entry). */
const ACTIVITY_ICON: Record<EmployeeActivityKind, Icon> = {
  horas: ICON.logHours,
  extra: ICON.addExtraWork,
  feedback: ICON.feedback,
  viatico: ICON.expense,
  produccion: ICON.production,
  reunion: ICON.meeting,
}
export function activityIcon(kind: EmployeeActivityKind): Icon {
  return ACTIVITY_ICON[kind]
}

// ── Client alert tone (§8) ───────────────────────────────────────────────────
const ALERT_TONE_VARIANT: Record<EmployeeAlertTone, BadgeVariant> = {
  warning: 'warning',
  danger: 'danger',
  neutral: 'neutral',
}
export function alertToneVariant(tone: EmployeeAlertTone): BadgeVariant {
  return ALERT_TONE_VARIANT[tone]
}
