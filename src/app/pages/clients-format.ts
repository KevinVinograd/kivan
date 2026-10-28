/**
 * Clients formatting + status helpers. Pure functions that turn the raw §11
 * model values (numbers, ISO dates, enums) into display strings and Badge
 * variants. Formatting lives here, never in the data — numbers/dates sort raw and
 * render formatted. The `alertaPrincipal` resolver implements the §8.7 priority.
 */
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
// Risk vocabulary is reused from the dashboard risk model (single source) so the
// Clients "Riesgo" filter and the dashboard agree on bands and labels.
import type { RiskLevel } from './dashboard-types'
import { riskLevelBadge } from './dashboard-format'

export const NO_REGISTRO = 'Sin registro'
export const NO_ACTION = 'Sin acción'

/** Re-exported so the many callers that already import it from here keep working. The
 *  implementation lives in `@/lib/currency`, a leaf module — see the note there for the
 *  import cycle that moving it out of this file resolved. */
export { formatCurrency }

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function formatRelativeDate(iso?: string): string {
  if (!iso) return NO_REGISTRO
  return capitalize(formatDistanceToNow(parseISO(iso), { locale: es, addSuffix: true }))
}

/** Short "Mes Año" label for invoice/payment rows (e.g. "May 2026"). */
export function formatMonthYear(iso?: string): string {
  if (!iso) return NO_REGISTRO
  return capitalize(format(parseISO(iso), 'LLL yyyy', { locale: es }))
}

/** Full "día mes año, HH:mm" stamp for the invoice hover preview (e.g. "5 jun 2026, 14:32"). */
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

// ── Client status ──────────────────────────────────────────────────────────
export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  active: 'Activo',
  onboarding: 'Onboarding',
  paused: 'Pausado',
  // The `churned` state is surfaced as "Deshabilitado": the client is turned off
  // (inactive, no longer billed) but stays in the list and can be re-enabled. This is
  // the soft half of the two client-removal choices — the hard half is a permanent
  // delete, which drops the client from every view.
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

// ── Payment status ─────────────────────────────────────────────────────────
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

/**
 * Pago del mes — badge label/variant plus the optional amount detail (§6.3).
 *
 * `null` means the client has NO cobro this month, which is not a payment state: it is
 * the absence of one. Rendering "Pendiente · $0" there would announce a debt nobody
 * incurred, and "Pagado" would announce a settlement nobody made.
 */
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

// ── Profitability ──────────────────────────────────────────────────────────
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

// ── Último aumento ─────────────────────────────────────────────────────────
export type IncreaseTone = 'ok' | 'review' | 'urgent' | 'none'

export function increaseInfo(iso?: string): { label: string; tone: IncreaseTone } {
  if (!iso) return { label: NO_REGISTRO, tone: 'none' }
  const months = monthsSince(iso)
  const tone: IncreaseTone = months > 12 ? 'urgent' : months >= 6 ? 'review' : 'ok'
  return { label: formatRelativeDate(iso), tone }
}

// ── Invoice + billing entity ───────────────────────────────────────────────
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

/** `undefined` (no cobro this month) is its own label: there is no factura to be
 *  missing, so "No emitida" would read as an outstanding task that does not exist. */
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

/**
 * The client's standing discount as the operator agreed it ("10%"), from the basis
 * points the column stores. es-AR separators, and no trailing `,0` on a whole percent.
 */
export function formatDiscountPercent(discountPercentBp: number): string {
  return `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(
    discountPercentBp / 100,
  )}%`
}

/**
 * The contracted fee AFTER the client's standing discount.
 *
 * Only for figures derived from the CONTRACT (MRR, valor acumulado) — anything derived
 * from a receivable is already net, because the discount was resolved to centavos when
 * the cobro was generated. Applying this on top of a billed amount would take it off
 * twice.
 *
 * Computed in MINOR UNITS with the server's own formula (`discountFor` in
 * billing.service.ts: floor the DISCOUNT, then subtract). Flooring the net in pesos
 * instead truncates the centavos and rounds the wrong way — a $1.500,50 fee at 10%
 * renders $1.350 against a cobro of $1.350,45 — and this figure is printed into the
 * statement SENT TO THE CLIENT, so the two have to agree to the centavo.
 */
export function netMonthlyFee(client: Client): number {
  if (!client.discountPercentBp) return client.monthlyFee
  const baseMinor = Math.round(client.monthlyFee * 100)
  const discountMinor = Math.floor((baseMinor * client.discountPercentBp) / 10_000)
  return (baseMinor - discountMinor) / 100
}

// "Mes vencido" and "mes corriendo" are the studio's own words for these terms.
export const BILLING_CYCLE_LABEL: Record<BillingCycle, string> = {
  arrears: 'Mes vencido',
  current: 'Mes corriendo',
}

// The three emisores are people, and the studio picks between them by name. The
// numbered codes stay the stored identifiers (`monotributo_1`…) so the data does
// not depend on who holds each one; only the label is the person.
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

// ── Alerta principal (§8.7 priority order) ─────────────────────────────────
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
  // Only flag a missing factura when there IS something to invoice. With no cobro this
  // month the absence of a factura is correct, not an alert.
  if (client.invoiceStatus === 'not_issued') return { label: 'Factura no emitida', tone: 'neutral' }
  if (!client.nextAction) return { label: 'Sin próxima acción', tone: 'neutral' }
  return null
}

// ── Search ─────────────────────────────────────────────────────────────────
/** Concatenated searchable text per PRD §7.1 (name, razón social, CUIT, contacto, email). */
export function clientSearchText(c: Client): string {
  return [c.name, c.businessName, c.taxId, c.contactName, c.billingEmail]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

/** Up to two initials from a name, for avatar fallbacks. */
export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

// ── Actividad reciente ───────────────────────────────────────────────────────
export type ActivityKind = 'payment' | 'meeting' | 'feedback' | 'increase' | 'created' | 'delivery'

export type ActivityItem = { iso: string; label: string; kind: ActivityKind }

/** Recent activity feed synthesized from the client's dated fields, newest first. */
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

// ── Filters (shared by the table toolbar and the list panel) ─────────────────
export type FilterOption = { value: string; label: string }

/** Single-select option lists for the client filters. Derived from the label
 *  maps so the toolbar (tanstack column filters) and the list panel (local
 *  array filtering) stay in sync from one source. */
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

/** Risk bands (highest first), labels sourced from the shared risk badge map. */
export const RISK_FILTER_OPTIONS: FilterOption[] = (
  ['riesgo_alto', 'atencion', 'saludable'] as const
).map((value) => ({ value, label: riskLevelBadge(value).label }))

/** Canonical client filter ids — the single source of truth shared by the table
 *  column ids (`COLUMN_IDS`, enforced via `satisfies`), the list-filter state and
 *  the filter config below, so a rename can't silently desync them. */
export type ClientFilterId =
  | 'risk'
  | 'status'
  | 'paymentStatus'
  | 'profitability'
  | 'services'
  | 'billing'
  | 'lastIncreaseDate'
  | 'lastMeetingDate'

/** Local list-panel filter state (each key is an optional single-select value). */
export type ClientListFilters = { [K in ClientFilterId]?: string }

/** Single source of truth for the client filter set, consumed by both the table
 *  toolbar (tanstack column id) and the list panel (ClientListFilters key) — the
 *  ids align with COLUMN_IDS so one config drives both popovers. */
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

/** Array predicate mirroring the table column filters, for the list panel. The
 *  `riskLevel` is supplied by the caller (risk is a derived, month-scoped value,
 *  not a `Client` field) so the `risk` filter matches the table's risk column.
 *  A null/absent band means the risk is unknown, so a risk filter excludes the
 *  client — filtering by "Saludable" must never sweep in clients we never scored. */
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

// ── Detail overview: profitability gauge + generated history ─────────────────
/** Gauge arc color per profitability tier — uses the data-viz token family
 *  (chart-specific, theme-independent), applied to SVG via `stroke="currentColor"`. */
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
  /** Legal entity that issued the invoice — the "quién la facturó" of the preview. */
  billingEntity: BillingEntity
  /** When the current-month invoice maps to a real /cobros receivable, its id +
   *  period — powers the preview's "Ver detalle" deep-link. Absent for older or
   *  unmatched rows (no resolvable receivable, so no detail to open). */
  receivableId?: string
  period?: string
}

/** Recent invoices for a client. There is no per-client invoices source yet (invoices
 *  belong to /cobros receivables, joined by client id — not available here), so this
 *  returns empty and the invoices card renders its honest empty state. */
export function clientInvoices(_client: Client): InvoiceRecord[] {
  return []
}

export type PaymentRecord = {
  id: string
  iso: string
  amount: number
  method: string
  /** Legal entity that collected the payment — the "cobrado por" of the preview. */
  billingEntity: BillingEntity
}

/** Recent payments for a client. No per-client payment-history source yet, so this
 *  returns empty and the payments card renders its honest empty state. */
export function clientPayments(_client: Client): PaymentRecord[] {
  return []
}

export type ActivityEntry = {
  iso: string
  label: string
  kind: ActivityKind
  /** Present when the entry is an employee delivery (renders the member avatar). */
  member?: TeamMember
}

/** Recent client activity, from the client's own real dated fields (created, fee
 *  increase, and payment/meeting/feedback when those dates are loaded). Employee
 *  deliveries had no real source and were dropped, so this is the real event set only. */
export function clientActivityFeed(client: Client): ActivityEntry[] {
  return clientActivity(client).map((item) => ({ iso: item.iso, label: item.label, kind: item.kind }))
}

// ── Detail KPIs ──────────────────────────────────────────────────────────────
export type KpiTone = 'default' | 'success' | 'danger'

export type Kpi = {
  label: string
  value: string
  /** Optional secondary line under the value. */
  hint?: string
  /** Value color. Defaults to `default`; success = money in, danger = owed/negative. */
  tone?: KpiTone
  /** Signed % — when set, the value renders success (≥ 0) / danger (< 0). */
  deltaPercent?: number
}

/** Single source of truth for tone → foreground token for the detail KPI tiles
 *  (`clients-kpis`). Figures default to `fg-default`; state color is reserved for
 *  values that carry a threshold status (figure-color-restraint). */
export const KPI_TONE_FG: Record<KpiTone, string> = {
  default: 'fg-default',
  success: 'fg-success',
  danger: 'fg-danger',
}

/** Badge-variant → foreground token for inline status text (e.g. the list's
 *  payment label), centralized so the mapping lives in one place. */
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

/** Compact currency for KPI tiles (e.g. "$12,4 M"). */
export function formatCompactCurrency(value: number): string {
  return compactCurrencyFormatter.format(value)
}

/** Whole months the client has been active (from startDate, fallback createdAt). */
function monthsActive(client: Client): number {
  return Math.max(0, monthsSince(client.startDate ?? client.createdAt))
}

/** Antigüedad — months/years active (exported for the detail Resumen). */
export function clientTenure(client: Client): Kpi {
  const months = monthsActive(client)
  const years = Math.floor(months / 12)
  const value =
    years >= 1
      ? `${years} ${years === 1 ? 'año' : 'años'}`
      : `${months} ${months === 1 ? 'mes' : 'meses'}`
  return { label: 'Antigüedad', value, hint: `Desde ${formatMonthYear(client.startDate ?? client.createdAt)}` }
}

/** Year-over-year fee growth. No fee-history source exists yet (would need prior-year
 *  billing), so this reports "No disponible" instead of an invented percentage. */
export function clientGrowth(_client: Client): Kpi {
  return { label: 'Crecimiento', value: 'No disponible', hint: 'vs. año anterior' }
}

/**
 * Estimated lifetime value = monthly fee × months active (exported for Resumen).
 *
 * Net of the client's standing discount: this figure is an estimate of what the studio
 * actually billed, and a client on a permanent 10% has never been invoiced the gross
 * number a single time.
 */
export function clientLtv(client: Client): Kpi {
  const discount = client.discountPercentBp
  return {
    label: 'Valor acumulado',
    value: formatCompactCurrency(netMonthlyFee(client) * monthsActive(client)),
    hint: discount ? `facturado estimado, con ${formatDiscountPercent(discount)} off` : 'facturado estimado',
  }
}

/** One figure of the detail financial breakdown (a KPI tile). */
export type BreakdownRow = {
  label: string
  value: string
  tone?: KpiTone
  /** One line under the figure saying what kind of figure it is (contracted, estimated). */
  hint?: string
}

// ── AI insight (per-client headline) ─────────────────────────────────────────
/**
 * Concise, deterministic per-client summary for the AiInsight banner. Surfaces
 * the most relevant signals (payment, profitability, stale increase) plus the
 * next action. Mock stand-in for a real model — replaced later.
 */
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

// ── AI insight CTA (resolution within system capabilities) ───────────────────
/** In-system actions a client insight CTA can trigger (handlers wired by the consumer). */
export type ClientInsightActionKind = 'registerPayment' | 'edit' | 'contact' | 'reviewProfitability'

export type ClientInsightAction = { label: string; kind: ClientInsightActionKind }

/**
 * The in-system action that resolves the client's top insight signal — the CTA
 * directs to the fix, not a generic label. Priority mirrors `clientInsight`'s
 * signal order; falls back to contacting the client when nothing needs fixing.
 */
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
