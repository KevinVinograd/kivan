import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

import type { BadgeVariant } from '@/app/components/components'
import { daysSince, formatCurrency, formatMonthYear, formatRelativeDate, initials } from './clients-format'
import {
  bankCompleteness,
  clientsForMember,
  expectedHoursForMember,
  loadStatusForMember,
  pendingExtrasForMember,
  statementForMember,
  trackedHoursForMember,
  type AssignmentStatus,
  type CompensationModel,
  type EmploymentType,
  type ExpenseStatus,
  type ExtraStatus,
  type LoadStatus,
  type ObjectiveStatus,
  type ProductionStatus,
  type TaskStatus,
  type TeamDataSnapshot,
  type TeamMember,
  type TeamMemberStatus,
  type TeamPaymentStatus,
  type BankCompleteness,
  type MonthlyTeamStatement,
} from './team-mock-data'

export { formatCurrency, formatRelativeDate, formatMonthYear, initials }

export const NO_RECORD = 'Sin registro'

export function formatDayMonth(iso: string): string {
  return format(parseISO(iso), 'd LLL', { locale: es })
}

export const TEAM_STATUS_LABEL: Record<TeamMemberStatus, string> = {
  active: 'Activa',
  paused: 'Pausada',
  inactive: 'Inactiva',
}

const TEAM_STATUS_VARIANT: Record<TeamMemberStatus, BadgeVariant> = {
  active: 'success',
  paused: 'warning',
  inactive: 'outline',
}

export function teamStatusBadge(status: TeamMemberStatus): { label: string; variant: BadgeVariant } {
  return { label: TEAM_STATUS_LABEL[status], variant: TEAM_STATUS_VARIANT[status] }
}

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  full_time: 'Full time',
  part_time: 'Part time',
  freelance: 'Freelance',
  external: 'Externa',
}

export const PAYMENT_TYPE_LABEL: Record<CompensationModel, string> = {
  monthly_fixed: 'Fijo mensual',
  hourly: 'Por hora',
  per_production: 'Por proyecto',
  mixed: 'Mixto',
}

export function compensationDisplay(member: TeamMember): string {
  const comp = member.compensation
  const money = (amount: number) => formatCurrency(amount, comp.currency)
  switch (comp.model) {
    case 'monthly_fixed':
      return comp.monthlyAmount ? `${money(comp.monthlyAmount)} /mes` : PAYMENT_TYPE_LABEL.monthly_fixed
    case 'hourly':
      return comp.hourlyRate ? `${money(comp.hourlyRate)} /h` : PAYMENT_TYPE_LABEL.hourly
    case 'per_production':
      return comp.productionRate
        ? `${money(comp.productionRate)} /proyecto`
        : PAYMENT_TYPE_LABEL.per_production
    case 'mixed':
      return PAYMENT_TYPE_LABEL.mixed
  }
}

export const LOAD_LABEL: Record<LoadStatus, string> = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
  overloaded: 'Sobrecargada',
}

const LOAD_VARIANT: Record<LoadStatus, BadgeVariant> = {
  low: 'neutral',
  normal: 'success',
  high: 'warning',
  overloaded: 'danger',
}

export const NO_OBJECTIVE_LABEL = 'Sin objetivo'

export function loadBadge(status: LoadStatus | undefined): { label: string; variant: BadgeVariant } {
  if (!status) return { label: NO_OBJECTIVE_LABEL, variant: 'outline' }
  return { label: LOAD_LABEL[status], variant: LOAD_VARIANT[status] }
}

export const LOAD_PROGRESS_TONE: Record<LoadStatus, 'default' | 'success' | 'warning' | 'danger'> = {
  low: 'default',
  normal: 'success',
  high: 'warning',
  overloaded: 'danger',
}

export function loadHoursLabel(d: TeamDataSnapshot, memberId: string): string {
  const tracked = trackedHoursForMember(d, memberId)
  const expected = expectedHoursForMember(d, memberId)
  if (expected <= 0) return `${tracked} h`
  return `${tracked} h / ${expected} h`
}

export function loadPercent(d: TeamDataSnapshot, memberId: string): number {
  const expected = expectedHoursForMember(d, memberId)
  if (expected <= 0) return 0
  return Math.min(Math.round((trackedHoursForMember(d, memberId) / expected) * 100), 100)
}

export const PAYMENT_STATUS_LABEL: Record<TeamPaymentStatus, string> = {
  pending: 'Pendiente',
  review: 'En revisión',
  approved: 'Aprobado',
  processing: 'Pago en proceso',
  paid: 'Pagado',
  with_difference: 'Con diferencia',
}

const PAYMENT_STATUS_VARIANT: Record<TeamPaymentStatus, BadgeVariant> = {
  pending: 'neutral',
  review: 'warning',
  approved: 'success',
  processing: 'warning',
  paid: 'success',
  with_difference: 'danger',
}

export function paymentStatusBadge(status: TeamPaymentStatus): { label: string; variant: BadgeVariant } {
  return { label: PAYMENT_STATUS_LABEL[status], variant: PAYMENT_STATUS_VARIANT[status] }
}

export const PRODUCTION_STATUS_LABEL: Record<ProductionStatus, string> = {
  pending: 'Cargada',
  review: 'En revisión',
  approved: 'Aprobada',
  paid: 'Pagada',
}

const PRODUCTION_STATUS_VARIANT: Record<ProductionStatus, BadgeVariant> = {
  pending: 'neutral',
  review: 'warning',
  approved: 'success',
  paid: 'success',
}

export function productionStatusBadge(status: ProductionStatus): { label: string; variant: BadgeVariant } {
  return { label: PRODUCTION_STATUS_LABEL[status], variant: PRODUCTION_STATUS_VARIANT[status] }
}

export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  paid: 'Pagado',
}

const EXPENSE_STATUS_VARIANT: Record<ExpenseStatus, BadgeVariant> = {
  pending: 'neutral',
  approved: 'success',
  rejected: 'danger',
  paid: 'success',
}

export function expenseStatusBadge(status: ExpenseStatus): { label: string; variant: BadgeVariant } {
  return { label: EXPENSE_STATUS_LABEL[status], variant: EXPENSE_STATUS_VARIANT[status] }
}

export const EXTRA_STATUS_LABEL: Record<ExtraStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  paid: 'Pagado',
}

const EXTRA_STATUS_VARIANT: Record<ExtraStatus, BadgeVariant> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  paid: 'success',
}

export function extraStatusBadge(status: ExtraStatus): { label: string; variant: BadgeVariant } {
  return { label: EXTRA_STATUS_LABEL[status], variant: EXTRA_STATUS_VARIANT[status] }
}

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  done: 'Completada',
  overdue: 'Vencida',
}

const TASK_STATUS_VARIANT: Record<TaskStatus, BadgeVariant> = {
  pending: 'neutral',
  in_progress: 'warning',
  done: 'success',
  overdue: 'danger',
}

export function taskStatusBadge(status: TaskStatus): { label: string; variant: BadgeVariant } {
  return { label: TASK_STATUS_LABEL[status], variant: TASK_STATUS_VARIANT[status] }
}

const OBJECTIVE_STATUS_LABEL: Record<ObjectiveStatus, string> = {
  on_track: 'En curso',
  at_risk: 'En riesgo',
  completed: 'Completado',
  overdue: 'Vencido',
}

const OBJECTIVE_STATUS_VARIANT: Record<ObjectiveStatus, BadgeVariant> = {
  on_track: 'success',
  at_risk: 'warning',
  completed: 'success',
  overdue: 'danger',
}

export function objectiveStatusBadge(status: ObjectiveStatus): { label: string; variant: BadgeVariant } {
  return { label: OBJECTIVE_STATUS_LABEL[status], variant: OBJECTIVE_STATUS_VARIANT[status] }
}

export const OBJECTIVE_PROGRESS_TONE: Record<ObjectiveStatus, 'default' | 'success' | 'warning' | 'danger'> = {
  on_track: 'default',
  at_risk: 'warning',
  completed: 'success',
  overdue: 'danger',
}

export const ASSIGNMENT_STATUS_LABEL: Record<AssignmentStatus, string> = {
  active: 'Activa',
  paused: 'Pausada',
  ended: 'Finalizada',
}

const ASSIGNMENT_STATUS_VARIANT: Record<AssignmentStatus, BadgeVariant> = {
  active: 'success',
  paused: 'warning',
  ended: 'outline',
}

export function assignmentStatusBadge(status: AssignmentStatus): { label: string; variant: BadgeVariant } {
  return { label: ASSIGNMENT_STATUS_LABEL[status], variant: ASSIGNMENT_STATUS_VARIANT[status] }
}

export const BANK_LABEL: Record<BankCompleteness, string> = {
  complete: 'Completo',
  incomplete: 'Incompleto',
  none: 'Sin datos',
}

const BANK_VARIANT: Record<BankCompleteness, BadgeVariant> = {
  complete: 'success',
  incomplete: 'warning',
  none: 'danger',
}

export function bankBadge(member: TeamMember): { label: string; variant: BadgeVariant } {
  const completeness = bankCompleteness(member)
  return { label: BANK_LABEL[completeness], variant: BANK_VARIANT[completeness] }
}

export function extrasDisplay(
  d: TeamDataSnapshot,
  memberId: string,
): { label: string; amount?: string; pending: boolean } {
  const pending = pendingExtrasForMember(d, memberId)
  if (pending.count === 0) return { label: 'Sin extras', pending: false }
  return {
    label: `${pending.count} ${pending.count === 1 ? 'pendiente' : 'pendientes'}`,
    amount: formatCurrency(pending.amount),
    pending: true,
  }
}

export function isBankComplete(member: TeamMember): boolean {
  return member.bankComplete ?? bankCompleteness(member) === 'complete'
}

function dayMonth(iso: string): string {
  const [, month, day] = iso.split('-')
  return `${day}/${month}`
}

export function paymentDueLabel(dueDate: string): { text: string; overdue: boolean } {
  const overdue = daysSince(dueDate) > 0
  return { text: `${overdue ? 'Venció' : 'Vence'} el ${dayMonth(dueDate)}`, overdue }
}

export function paymentProgressSummary(statement: MonthlyTeamStatement): string {
  const paid = formatCurrency(statement.paidAmount ?? 0)
  const remaining = formatCurrency(statement.differenceAmount ?? 0)
  const remainingLabel = statement.status === 'processing' ? 'En proceso' : 'Queda'
  return `Pagado ${paid} · ${remainingLabel} ${remaining} · ${paymentDueLabel(statement.dueDate).text}`
}

export type MemberAlert = {
  label: string
  tone: 'danger' | 'warning' | 'neutral'
  description?: string
  action: TeamInsightAction
}

export function memberAlerts(d: TeamDataSnapshot, member: TeamMember): MemberAlert[] {
  const alerts: MemberAlert[] = []
  if (bankCompleteness(member) !== 'complete') {
    alerts.push({
      label: 'Datos bancarios incompletos',
      tone: 'danger',
      action: { label: 'Completar', kind: 'edit' },
    })
  }
  if (loadStatusForMember(d, member.id) === 'overloaded') {
    alerts.push({
      label: 'Sobrecarga de horas',
      tone: 'warning',
      action: { label: 'Revisar carga', kind: 'reviewLoad' },
    })
  }
  const pendingExtras = pendingExtrasForMember(d, member.id)
  if (pendingExtras.count > 0) {
    alerts.push({
      label: `${pendingExtras.count} extras sin aprobar`,
      tone: 'warning',
      action: { label: 'Revisar extras', kind: 'approveExtras' },
    })
  }
  const statement = statementForMember(d, member.id)
  if (statement?.status === 'with_difference') {
    alerts.push({
      label: 'Pago con diferencia',
      tone: 'danger',
      description: paymentProgressSummary(statement),
      action: { label: 'Pagar', kind: 'payDifference' },
    })
  } else if (statement?.status === 'processing') {
    alerts.push({
      label: 'Pago en proceso',
      tone: 'warning',
      description: paymentProgressSummary(statement),
      action: { label: 'Confirmar pagado', kind: 'confirmPaid' },
    })
  }
  if (trackedHoursForMember(d, member.id) === 0) {
    alerts.push({
      label: 'Sin carga de horas este mes',
      tone: 'neutral',
      action: { label: 'Cargar horas', kind: 'logHours' },
    })
  }
  return alerts
}

export function primaryAlert(d: TeamDataSnapshot, member: TeamMember): MemberAlert | null {
  return memberAlerts(d, member)[0] ?? null
}

function teamInsight(d: TeamDataSnapshot, member: TeamMember): string {
  const signals: string[] = []
  if (bankCompleteness(member) !== 'complete') signals.push('datos bancarios incompletos')
  if (loadStatusForMember(d, member.id) === 'overloaded') signals.push('sobrecarga de horas')
  const pending = pendingExtrasForMember(d, member.id)
  if (pending.count > 0) signals.push(`${pending.count} extras sin aprobar`)
  const statement = statementForMember(d, member.id)
  if (statement?.status === 'with_difference') signals.push('pago con diferencia')
  if (statement?.status === 'processing') signals.push('pago en proceso')
  if (trackedHoursForMember(d, member.id) === 0) signals.push('sin horas cargadas este mes')

  const pay = statement ? formatCurrency(statement.totalAmount) : null
  if (signals.length === 0) {
    return `${member.name} está al día${pay ? ` con un pago estimado de ${pay}` : ''}.`
  }
  return `${member.name}: ${signals.join(', ')}.`
}

export type TeamInsightActionKind =
  | 'logHours'
  | 'edit'
  | 'reviewLoad'
  | 'approvePayment'
  | 'approveExtras'
  | 'payDifference'
  | 'confirmPaid'

export type TeamInsightAction = { label: string; kind: TeamInsightActionKind }

function teamInsightAction(d: TeamDataSnapshot, member: TeamMember): TeamInsightAction {
  const status = statementForMember(d, member.id)?.status
  if (bankCompleteness(member) !== 'complete') return { label: 'Completar datos', kind: 'edit' }
  if (loadStatusForMember(d, member.id) === 'overloaded') {
    return { label: 'Revisar carga', kind: 'reviewLoad' }
  }
  if (pendingExtrasForMember(d, member.id).count > 0) {
    return { label: 'Revisar extras', kind: 'approveExtras' }
  }
  if (status === 'with_difference') return { label: 'Pagar', kind: 'payDifference' }
  if (status === 'processing') return { label: 'Confirmar pagado', kind: 'confirmPaid' }
  if (trackedHoursForMember(d, member.id) === 0) return { label: 'Cargar horas', kind: 'logHours' }
  if (status === 'approved') return { label: 'Pagar', kind: 'approvePayment' }
  if (status && status !== 'paid') return { label: 'Aprobar pago', kind: 'approvePayment' }
  return { label: 'Editar persona', kind: 'edit' }
}

export function paymentActionForStatus(
  status: TeamPaymentStatus | undefined,
): { label: string; kind: 'approvePayment' | 'payDifference' | 'confirmPaid' } | null {
  if (status === 'with_difference') return { label: 'Pagar diferencia', kind: 'payDifference' }
  if (status === 'processing') return { label: 'Confirmar pagado', kind: 'confirmPaid' }
  if (status === 'approved') return { label: 'Pagar', kind: 'approvePayment' }
  if (status === undefined || status === 'paid') return null
  return { label: 'Aprobar pago', kind: 'approvePayment' }
}

export function teamInsightDisplay(
  d: TeamDataSnapshot,
  member: TeamMember,
): { headline: string; action: TeamInsightAction } {
  return {
    headline: teamInsight(d, member),
    action: teamInsightAction(d, member),
  }
}

export function teamSearchText(d: TeamDataSnapshot, member: TeamMember): string {
  return [member.name, member.role, member.email, ...clientsForMember(d, member.id)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export type FilterOption = { value: string; label: string }

export type TeamFilterId = 'status' | 'role' | 'paymentType' | 'load' | 'client' | 'extras' | 'bank'

export type TeamFilters = { [K in TeamFilterId]?: string }

const STATUS_FILTER_OPTIONS: FilterOption[] = (['active', 'paused', 'inactive'] as const).map(
  (value) => ({ value, label: TEAM_STATUS_LABEL[value] }),
)

const PAYMENT_TYPE_FILTER_OPTIONS: FilterOption[] = (
  ['monthly_fixed', 'hourly', 'per_production', 'mixed'] as const
).map((value) => ({ value, label: PAYMENT_TYPE_LABEL[value] }))

const LOAD_FILTER_OPTIONS: FilterOption[] = (['low', 'normal', 'high', 'overloaded'] as const).map(
  (value) => ({ value, label: LOAD_LABEL[value] }),
)

const EXTRAS_FILTER_OPTIONS: FilterOption[] = [{ value: 'pending', label: 'Con extras pendientes' }]

const BANK_FILTER_OPTIONS: FilterOption[] = [
  { value: 'incomplete', label: 'Incompletos' },
  { value: 'none', label: 'Sin datos' },
]

export type TeamFilterField = { id: TeamFilterId; allLabel: string; options: FilterOption[] }

export function buildTeamFilterFields(roles: string[], clientNames: string[]): TeamFilterField[] {
  const roleOptions: FilterOption[] = Array.from(new Set(roles))
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((role) => ({ value: role, label: role }))
  const clientOptions: FilterOption[] = Array.from(new Set(clientNames))
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((name) => ({ value: name, label: name }))
  return [
    { id: 'status', allLabel: 'Estado', options: STATUS_FILTER_OPTIONS },
    { id: 'role', allLabel: 'Rol', options: roleOptions },
    { id: 'paymentType', allLabel: 'Tipo de pago', options: PAYMENT_TYPE_FILTER_OPTIONS },
    { id: 'load', allLabel: 'Carga', options: LOAD_FILTER_OPTIONS },
    { id: 'client', allLabel: 'Cliente', options: clientOptions },
    { id: 'extras', allLabel: 'Extras', options: EXTRAS_FILTER_OPTIONS },
    { id: 'bank', allLabel: 'Datos bancarios', options: BANK_FILTER_OPTIONS },
  ]
}

export function teamMatchesFilters(
  d: TeamDataSnapshot,
  member: TeamMember,
  filters: TeamFilters,
): boolean {
  if (filters.status && member.status !== filters.status) return false
  if (filters.role && member.role !== filters.role) return false
  if (filters.paymentType && member.compensation.model !== filters.paymentType) return false
  if (filters.load && loadStatusForMember(d, member.id) !== filters.load) return false
  if (filters.client && !clientsForMember(d, member.id).includes(filters.client)) return false
  if (filters.extras === 'pending' && pendingExtrasForMember(d, member.id).count === 0) return false
  if (filters.bank && bankCompleteness(member) !== filters.bank) return false
  return true
}
