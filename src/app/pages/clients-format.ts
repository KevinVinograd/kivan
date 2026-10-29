import {
  differenceInCalendarDays,
  differenceInCalendarMonths,
  format,
  formatDistanceToNow,
  parseISO,
} from 'date-fns'
import { es } from 'date-fns/locale'

import { formatCurrency } from '@/lib/currency'
import type { BadgeVariant } from '@/app/components/components'
import type {
  BillingCycle,
  BillingEntity,
  Client,
  ClientStatus,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  ProfitabilityStatus,
  TeamMember,
} from './clients-mock-data'
import { SERVICE_CATALOG } from './clients-mock-data'
import type { RiskLevel } from './dashboard-types'
import { riskLevelBadge } from './dashboard-format'

export const NO_REGISTRO = 'Sin registro'
export const NO_ACTION = 'Sin acción'

export { formatCurrency }

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function formatRelativeDate(iso?: string): string {
  if (!iso) return NO_REGISTRO
  return capitalize(formatDistanceToNow(parseISO(iso), { locale: es, addSuffix: true }))
}

export function formatMonthYear(iso?: string): string {
  if (!iso) return NO_REGISTRO
  return capitalize(format(parseISO(iso), 'LLL yyyy', { locale: es }))
}

export function formatDateTime(iso?: string): string {
  if (!iso) return NO_REGISTRO
  return format(parseISO(iso), "d LLL yyyy, HH:mm", { locale: es })
}

export function monthsSince(iso: string): number {
  return differenceInCalendarMonths(new Date(), parseISO(iso))
}

export function daysSince(iso: string): number {
  return differenceInCalendarDays(new Date(), parseISO(iso))
}

export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  active: 'Activo',
  onboarding: 'Onboarding',
  paused: 'Pausado',
  churned: 'Deshabilitado',
}

const CLIENT_STATUS_VARIANT: Record<ClientStatus, BadgeVariant> = {
  active: 'success',
  onboarding: 'neutral',
  paused: 'warning',
  churned: 'outline',
}

export function clientStatusBadge(status: ClientStatus): { label: string; variant: BadgeVariant } {
  return { label: CLIENT_STATUS_LABEL[status], variant: CLIENT_STATUS_VARIANT[status] }
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  paid: 'Pagado',
  pending: 'Pendiente',
  overdue: 'Vencido',
  partial: 'Parcial',
}

const PAYMENT_STATUS_VARIANT: Record<PaymentStatus, BadgeVariant> = {
  paid: 'success',
  pending: 'neutral',
  overdue: 'danger',
  partial: 'warning',
}

export function paymentDisplay(client: Client): {
  label: string
  variant: BadgeVariant
  detail?: string
} | null {
  if (!client.paymentStatus) return null
  const label = PAYMENT_STATUS_LABEL[client.paymentStatus]
  const variant = PAYMENT_STATUS_VARIANT[client.paymentStatus]
  const due = client.currentMonthDueAmount ?? 0
  const paid = client.currentMonthPaidAmount ?? 0
  let detail: string | undefined
  if (client.paymentStatus === 'pending' || client.paymentStatus === 'overdue') {
    detail = formatCurrency(due)
  } else if (client.paymentStatus === 'partial') {
    detail = `${formatCurrency(paid)} / ${formatCurrency(due)}`
  }
  return { label, variant, detail }
}

export const PROFITABILITY_LABEL: Record<ProfitabilityStatus, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
}

const PROFITABILITY_VARIANT: Record<ProfitabilityStatus, BadgeVariant> = {
  high: 'success',
  medium: 'neutral',
  low: 'danger',
}

export function resolveProfitabilityStatus(percent?: number): ProfitabilityStatus | undefined {
  if (percent === undefined) return undefined
  if (percent >= 40) return 'high'
  if (percent >= 20) return 'medium'
  return 'low'
}

export function profitabilityStatusOf(client: Client): ProfitabilityStatus | undefined {
  return client.profitabilityStatus ?? resolveProfitabilityStatus(client.profitabilityPercent)
}

export function profitabilityBadge(client: Client): {
  label: string
  variant: BadgeVariant
} | null {
  if (client.profitabilityPercent === undefined) return null
  const status = profitabilityStatusOf(client) ?? 'medium'
  return { label: `${client.profitabilityPercent}%`, variant: PROFITABILITY_VARIANT[status] }
}

export type IncreaseTone = 'ok' | 'review' | 'urgent' | 'none'

export function increaseInfo(iso?: string): { label: string; tone: IncreaseTone } {
  if (!iso) return { label: NO_REGISTRO, tone: 'none' }
  const months = monthsSince(iso)
  const tone: IncreaseTone = months > 12 ? 'urgent' : months >= 6 ? 'review' : 'ok'
  return { label: formatRelativeDate(iso), tone }
}

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  not_issued: 'No emitida',
  issued: 'Emitida',
  sent: 'Enviada',
  paid: 'Pagada',
}

const INVOICE_STATUS_VARIANT: Record<InvoiceStatus, BadgeVariant> = {
  not_issued: 'neutral',
  issued: 'neutral',
  sent: 'neutral',
  paid: 'success',
}

export function invoiceBadge(status: InvoiceStatus | undefined): {
  label: string
  variant: BadgeVariant
} {
  if (!status) return { label: NO_REGISTRO, variant: 'outline' }
  return { label: INVOICE_STATUS_LABEL[status], variant: INVOICE_STATUS_VARIANT[status] }
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
}

export function formatDiscountPercent(discountPercentBp: number): string {
  return `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(
    discountPercentBp / 100,
  )}%`
}

// Same formula as the server (floor the discount in minor units, then subtract) so it matches the cobro to the centavo.
export function netMonthlyFee(client: Client): number {
  if (!client.discountPercentBp) return client.monthlyFee
  const baseMinor = Math.round(client.monthlyFee * 100)
  const discountMinor = Math.floor((baseMinor * client.discountPercentBp) / 10_000)
  return (baseMinor - discountMinor) / 100
}

export const BILLING_CYCLE_LABEL: Record<BillingCycle, string> = {
  arrears: 'Mes vencido',
  current: 'Mes corriendo',
}

export const BILLING_ENTITY_LABEL: Record<BillingEntity, string> = {
  monotributo_1: 'Vicky',
  monotributo_2: 'More',
  monotributo_3: 'Flor',
}

export const BILLING_ENTITY_FULL_LABEL: Record<BillingEntity, string> = {
  monotributo_1: 'Monotributo Vicky',
  monotributo_2: 'Monotributo More',
  monotributo_3: 'Monotributo Flor',
}

export type Alerta = { label: string; tone: 'danger' | 'warning' | 'neutral' }

export function alertaPrincipal(client: Client): Alerta | null {
  if (client.paymentStatus === 'overdue') return { label: 'Pago vencido', tone: 'danger' }
  if (profitabilityStatusOf(client) === 'low') return { label: 'Rentabilidad baja', tone: 'danger' }
  if (client.lastIncreaseDate && monthsSince(client.lastIncreaseDate) > 12) {
    return { label: `${monthsSince(client.lastIncreaseDate)} meses sin aumento`, tone: 'warning' }
  }
  if (client.lastMeetingDate && daysSince(client.lastMeetingDate) > 60) {
    return { label: `${daysSince(client.lastMeetingDate)} días sin reunión`, tone: 'warning' }
  }
  if (client.invoiceStatus === 'not_issued') return { label: 'Factura no emitida', tone: 'neutral' }
  if (!client.nextAction) return { label: 'Sin próxima acción', tone: 'neutral' }
  return null
}

export function clientSearchText(c: Client): string {
  return [c.name, c.businessName, c.taxId, c.contactName, c.billingEmail]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

export type ActivityKind = 'payment' | 'meeting' | 'feedback' | 'increase' | 'created' | 'delivery'

export type ActivityItem = { iso: string; label: string; kind: ActivityKind }

export function clientActivity(client: Client): ActivityItem[] {
  const items: ActivityItem[] = []
  if (client.lastPaymentDate && client.currentMonthPaidAmount)
    items.push({
      iso: client.lastPaymentDate,
      label: `Pago registrado (${formatCurrency(client.currentMonthPaidAmount)})`,
      kind: 'payment',
    })
  if (client.lastMeetingDate)
    items.push({ iso: client.lastMeetingDate, label: 'Reunión con el cliente', kind: 'meeting' })
  if (client.lastFeedbackDate)
    items.push({ iso: client.lastFeedbackDate, label: 'Feedback recibido', kind: 'feedback' })
  if (client.lastIncreaseDate)
    items.push({ iso: client.lastIncreaseDate, label: 'Aumento de fee aplicado', kind: 'increase' })
  items.push({ iso: client.createdAt, label: 'Cliente creado', kind: 'created' })
  return items.sort((a, b) => b.iso.localeCompare(a.iso))
}

export type FilterOption = { value: string; label: string }

export const STATUS_FILTER_OPTIONS: FilterOption[] = (
  ['active', 'onboarding', 'paused', 'churned'] as const
).map((value) => ({ value, label: CLIENT_STATUS_LABEL[value] }))

export const PAYMENT_FILTER_OPTIONS: FilterOption[] = (
  ['paid', 'pending', 'overdue', 'partial'] as const
).map((value) => ({ value, label: PAYMENT_STATUS_LABEL[value] }))

export const PROFITABILITY_FILTER_OPTIONS: FilterOption[] = (
  ['high', 'medium', 'low'] as const
).map((value) => ({ value, label: PROFITABILITY_LABEL[value] }))

export const SERVICE_FILTER_OPTIONS: FilterOption[] = SERVICE_CATALOG.map((service) => ({
  value: service,
  label: service,
}))

export const MONOTRIBUTO_FILTER_OPTIONS: FilterOption[] = (
  ['monotributo_1', 'monotributo_2', 'monotributo_3'] as const
).map((value) => ({ value, label: BILLING_ENTITY_FULL_LABEL[value] }))

export const INCREASE_FILTER_OPTIONS: FilterOption[] = [
  { value: 'gt6', label: 'Más de 6 meses' },
  { value: 'gt12', label: 'Más de 12 meses' },
  { value: 'none', label: 'Sin registro' },
]

export const MEETING_FILTER_OPTIONS: FilterOption[] = [
  { value: 'gt30', label: 'Más de 30 días' },
  { value: 'gt60', label: 'Más de 60 días' },
  { value: 'gt90', label: 'Más de 90 días' },
  { value: 'none', label: 'Sin registro' },
]

export const RISK_FILTER_OPTIONS: FilterOption[] = (
  ['riesgo_alto', 'atencion', 'saludable'] as const
).map((value) => ({ value, label: riskLevelBadge(value).label }))

export type ClientFilterId =
  | 'risk'
  | 'status'
  | 'paymentStatus'
  | 'profitability'
  | 'services'
  | 'billing'
  | 'lastIncreaseDate'
  | 'lastMeetingDate'

export type ClientListFilters = { [K in ClientFilterId]?: string }

export const CLIENT_FILTER_FIELDS: {
  id: ClientFilterId
  allLabel: string
  options: FilterOption[]
}[] = [
  { id: 'risk', allLabel: 'Riesgo', options: RISK_FILTER_OPTIONS },
  { id: 'status', allLabel: 'Estado', options: STATUS_FILTER_OPTIONS },
  { id: 'paymentStatus', allLabel: 'Pago', options: PAYMENT_FILTER_OPTIONS },
  { id: 'profitability', allLabel: 'Rentabilidad', options: PROFITABILITY_FILTER_OPTIONS },
  { id: 'services', allLabel: 'Servicios', options: SERVICE_FILTER_OPTIONS },
  { id: 'billing', allLabel: 'Monotributo', options: MONOTRIBUTO_FILTER_OPTIONS },
  { id: 'lastIncreaseDate', allLabel: 'Aumento', options: INCREASE_FILTER_OPTIONS },
  { id: 'lastMeetingDate', allLabel: 'Reunión', options: MEETING_FILTER_OPTIONS },
]

export function matchesIncreaseFilter(iso: string | undefined, value: string): boolean {
  if (value === 'none') return !iso
  if (!iso) return false
  const months = monthsSince(iso)
  if (value === 'gt6') return months > 6
  if (value === 'gt12') return months > 12
  return true
}

export function matchesMeetingFilter(iso: string | undefined, value: string): boolean {
  if (value === 'none') return !iso
  if (!iso) return false
  const days = daysSince(iso)
  if (value === 'gt30') return days > 30
  if (value === 'gt60') return days > 60
  if (value === 'gt90') return days > 90
  return true
}

export function clientMatchesListFilters(
  client: Client,
  filters: ClientListFilters,
  riskLevel?: RiskLevel | null,
): boolean {
  if (filters.risk && riskLevel !== filters.risk) return false
  if (filters.status && client.status !== filters.status) return false
  if (filters.paymentStatus && client.paymentStatus !== filters.paymentStatus) return false
  if (filters.profitability && profitabilityStatusOf(client) !== filters.profitability) return false
  if (filters.services && !client.services.includes(filters.services)) return false
  if (filters.billing && client.billingEntity !== filters.billing) return false
  if (filters.lastIncreaseDate && !matchesIncreaseFilter(client.lastIncreaseDate, filters.lastIncreaseDate))
    return false
  if (filters.lastMeetingDate && !matchesMeetingFilter(client.lastMeetingDate, filters.lastMeetingDate))
    return false
  return true
}

export const PROFITABILITY_GAUGE_FG: Record<ProfitabilityStatus, string> = {
  high: 'fg-data-green',
  medium: 'fg-data-yellow',
  low: 'fg-data-red',
}

export type InvoiceRecord = {
  id: string
  iso: string
  number: string
  amount: number
  status: InvoiceStatus
  billingEntity: BillingEntity
  receivableId?: string
  period?: string
}

export function clientInvoices(_client: Client): InvoiceRecord[] {
  return []
}

export type PaymentRecord = {
  id: string
  iso: string
  amount: number
  method: string
  billingEntity: BillingEntity
}

export function clientPayments(_client: Client): PaymentRecord[] {
  return []
}

export type ActivityEntry = {
  iso: string
  label: string
  kind: ActivityKind
  member?: TeamMember
}

export function clientActivityFeed(client: Client): ActivityEntry[] {
  return clientActivity(client).map((item) => ({ iso: item.iso, label: item.label, kind: item.kind }))
}

export type KpiTone = 'default' | 'success' | 'danger'

export type Kpi = {
  label: string
  value: string
  hint?: string
  tone?: KpiTone
  deltaPercent?: number
}

export const KPI_TONE_FG: Record<KpiTone, string> = {
  default: 'fg-default',
  success: 'fg-success',
  danger: 'fg-danger',
}

export const PAYMENT_TONE_FG: Record<BadgeVariant, string> = {
  success: 'fg-success',
  danger: 'fg-danger',
  warning: 'fg-warning',
  neutral: 'fg-default',
  outline: 'fg-default',
  primary: 'fg-primary',
}

const compactCurrencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  notation: 'compact',
  maximumFractionDigits: 1,
})

export function formatCompactCurrency(value: number): string {
  return compactCurrencyFormatter.format(value)
}

function monthsActive(client: Client): number {
  return Math.max(0, monthsSince(client.startDate ?? client.createdAt))
}

export function clientTenure(client: Client): Kpi {
  const months = monthsActive(client)
  const years = Math.floor(months / 12)
  const value =
    years >= 1
      ? `${years} ${years === 1 ? 'año' : 'años'}`
      : `${months} ${months === 1 ? 'mes' : 'meses'}`
  return { label: 'Antigüedad', value, hint: `Desde ${formatMonthYear(client.startDate ?? client.createdAt)}` }
}

export function clientGrowth(_client: Client): Kpi {
  return { label: 'Crecimiento', value: 'No disponible', hint: 'vs. año anterior' }
}

export function clientLtv(client: Client): Kpi {
  const discount = client.discountPercentBp
  return {
    label: 'Valor acumulado',
    value: formatCompactCurrency(netMonthlyFee(client) * monthsActive(client)),
    hint: discount ? `facturado estimado, con ${formatDiscountPercent(discount)} off` : 'facturado estimado',
  }
}

export type BreakdownRow = {
  label: string
  value: string
  tone?: KpiTone
  hint?: string
}

function clientInsight(client: Client): string {
  const signals: string[] = []
  if (client.paymentStatus === 'overdue') {
    const pending = Math.max(
      (client.currentMonthDueAmount ?? 0) - (client.currentMonthPaidAmount ?? 0),
      0,
    )
    signals.push(`pago vencido por ${formatCurrency(pending)}`)
  } else if (client.paymentStatus === 'partial') {
    signals.push('pago parcial del mes')
  }
  const tier = profitabilityStatusOf(client)
  if (tier === 'low' && client.profitabilityPercent != null) {
    signals.push(`rentabilidad baja (${client.profitabilityPercent}%)`)
  }
  if (client.lastIncreaseDate && monthsSince(client.lastIncreaseDate) > 12) {
    signals.push(`${monthsSince(client.lastIncreaseDate)} meses sin aumento`)
  }

  const action = client.nextAction ? ` Priorizar ${client.nextAction.toLowerCase()}.` : ''
  if (signals.length === 0) {
    const positive =
      tier === 'high' && client.profitabilityPercent != null
        ? ` con rentabilidad alta (${client.profitabilityPercent}%)`
        : ''
    return `${client.name} está al día${positive}.${action || ' Sin acciones pendientes.'}`
  }
  return `${client.name}: ${signals.join(', ')}.${action}`
}

export type ClientInsightActionKind = 'registerPayment' | 'edit' | 'contact' | 'reviewProfitability'

export type ClientInsightAction = { label: string; kind: ClientInsightActionKind }

function clientInsightAction(client: Client): ClientInsightAction {
  if (client.paymentStatus === 'overdue' || client.paymentStatus === 'partial') {
    return { label: 'Registrar pago', kind: 'registerPayment' }
  }
  if (profitabilityStatusOf(client) === 'low') {
    return { label: 'Revisar rentabilidad', kind: 'reviewProfitability' }
  }
  if (client.lastIncreaseDate && monthsSince(client.lastIncreaseDate) > 12) {
    return { label: 'Aplicar aumento', kind: 'edit' }
  }
  return { label: 'Contactar cliente', kind: 'contact' }
}

export function clientInsightDisplay(client: Client): {
  headline: string
  action: ClientInsightAction
} {
  return {
    headline: clientInsight(client),
    action: clientInsightAction(client),
  }
}
