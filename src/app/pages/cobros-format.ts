import { formatCurrency as formatInLane, LANES, LANE_FILTER_OPTIONS, LANE_NOUN } from '@/lib/currency'
import type { Currency } from '@hold/shared'
import {
  formatCompactCurrency,
  isPastDate,
  TAX_PROFILE_LABEL,
  byActivityRecency,
  type ActivityEntry,
  type FilterField,
  type Kpi,
  type LedgerSummary,
  type StatusBadge,
  type TaxProfileId,
} from './cobranza-format'
import { apiDateToCalendarDay } from '@/app/lib/iso-date'
import type { BillingStatus, CollectionStatus, Receivable } from './cobros-mock-data'

const COLLECTION_STATUS: Record<CollectionStatus, StatusBadge> = {
  pending: { label: 'Pendiente', variant: 'neutral' },
  collected: { label: 'Cobrado', variant: 'success' },
  partial: { label: 'Parcial', variant: 'warning' },
  overdue: { label: 'Vencido', variant: 'danger' },
  cancelled: { label: 'Cancelado', variant: 'outline' },
}

export function collectionStatusBadge(status: CollectionStatus): StatusBadge {
  return COLLECTION_STATUS[status]
}

const BILLING_STATUS: Record<BillingStatus, StatusBadge> = {
  no_invoice: { label: 'Sin factura', variant: 'neutral' },
  pending: { label: 'Pendiente', variant: 'warning' },
  invoiced: { label: 'Facturado', variant: 'neutral' },
  sent: { label: 'Enviado', variant: 'neutral' },
  error_arca: { label: 'Error ARCA', variant: 'danger' },
  manual: { label: 'Manual', variant: 'neutral' },
  not_required: { label: 'No requiere', variant: 'outline' },
}

export function billingStatusBadge(status: BillingStatus): StatusBadge {
  return BILLING_STATUS[status]
}

export function balanceOf(receivable: Receivable): number {
  return receivable.totalAmount - receivable.collectedAmount
}

export function isOverdue(receivable: Receivable): boolean {
  return (
    receivable.status !== 'cancelled' &&
    balanceOf(receivable) > 0 &&
    (receivable.status === 'overdue' || isPastDate(receivable.dueDate))
  )
}

export function effectiveCollectionStatus(receivable: Receivable): CollectionStatus {
  return receivable.status === 'pending' && isOverdue(receivable) ? 'overdue' : receivable.status
}

export function receivableSearchText(r: Receivable): string {
  return [r.clientName, r.businessName, r.taxId, r.contactName, r.invoiceNumber, r.service]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

const COLLECTION_FILTER_OPTIONS = (
  ['pending', 'collected', 'partial', 'overdue', 'cancelled'] as const
).map((value) => ({ value, label: COLLECTION_STATUS[value].label }))

const BILLING_FILTER_OPTIONS = (
  ['no_invoice', 'pending', 'invoiced', 'sent', 'error_arca', 'manual', 'not_required'] as const
).map((value) => ({ value, label: BILLING_STATUS[value].label }))

const MONOTRIBUTO_FILTER_OPTIONS = (
  ['monotributo_1', 'monotributo_2', 'monotributo_3', 'unassigned'] as const
).map((value) => ({ value, label: TAX_PROFILE_LABEL[value as TaxProfileId] }))

export const COBROS_FILTER_FIELDS: FilterField[] = [
  { id: 'status', label: 'Estado de cobro', options: COLLECTION_FILTER_OPTIONS },
  { id: 'billingStatus', label: 'Facturación', options: BILLING_FILTER_OPTIONS },
  { id: 'taxProfileId', label: 'Monotributo', options: MONOTRIBUTO_FILTER_OPTIONS },
  { id: 'currency', label: 'Moneda', options: LANE_FILTER_OPTIONS },
]

function laneFigure(rows: Receivable[], currency: Currency): Kpi {
  const live = rows.filter((r) => r.currency === currency && r.status !== 'cancelled')
  const pendingBalance = live.reduce((sum, r) => sum + balanceOf(r), 0)
  const overdue = live.filter(isOverdue).reduce((sum, r) => sum + balanceOf(r), 0)
  return {
    id: heroIdFor(currency),
    label: `Saldo pendiente en ${LANE_NOUN[currency]}`,
    value: formatInLane(pendingBalance, currency),
    tone: overdue > 0 ? 'danger' : pendingBalance > 0 ? 'warning' : 'default',
    hint:
      live.length === 0
        ? 'sin cobros en el período'
        : live.length === 1
          ? '1 cobro'
          : `${live.length} cobros`,
  }
}

const heroIdFor = (currency: Currency) => `pending${currency}`

export const COBROS_HERO_IDS: [string, string] = [heroIdFor('ARS'), heroIdFor('USD')]

const NEEDS_INVOICE: BillingStatus[] = ['no_invoice', 'pending']
const BILLED_NOT_REQUIRED: BillingStatus[] = ['invoiced', 'sent', 'manual']

export function cobrosKpis(rows: Receivable[]): Kpi[] {
  const isArs = (r: Receivable) => r.currency === 'ARS'
  const ars = rows.filter(isArs)
  const live = ars.filter((r) => r.status !== 'cancelled')
  const sum = (items: Receivable[], pick: (r: Receivable) => number) =>
    items.reduce((total, r) => total + pick(r), 0)

  const totalToCollect = sum(live, (r) => r.totalAmount)
  const totalCollected = sum(ars, (r) => r.collectedAmount)
  const overdue = sum(live.filter(isOverdue), balanceOf)
  const pendingToInvoice = sum(
    live.filter((r) => NEEDS_INVOICE.includes(r.billingStatus)),
    (r) => r.totalAmount,
  )
  const billedNotCollected = sum(
    live.filter((r) => BILLED_NOT_REQUIRED.includes(r.billingStatus)),
    balanceOf,
  )

  const figures: Kpi[] = [
    ...LANES.map((currency) => laneFigure(rows, currency)),
    {
      id: 'toCollect',
      label: 'Total a cobrar',
      value: formatCompactCurrency(totalToCollect),
      tone: 'default',
      hint: 'en pesos',
    },
    { id: 'collected', label: 'Total cobrado', value: formatCompactCurrency(totalCollected), tone: 'default' },
    {
      id: 'overdue',
      label: 'Vencido',
      value: formatCompactCurrency(overdue),
      tone: 'default',
    },
    {
      id: 'toInvoice',
      label: 'Pendiente de facturar',
      value: formatCompactCurrency(pendingToInvoice),
      tone: 'default',
    },
    {
      id: 'billedNotCollected',
      label: 'Facturado no cobrado',
      value: formatCompactCurrency(billedNotCollected),
      tone: 'default',
    },
  ]
  return figures
}

export type ReceivablePayment = {
  id: string
  iso?: string
  amount: number
  reference?: string
  account?: string
}

export function receivableRegisteredPayments(r: Receivable): ReceivablePayment[] {
  if (r.collectedAmount <= 0) return []
  return [
    {
      id: `${r.id}-pay-0`,
      ...(r.collectedAt ? { iso: r.collectedAt } : {}),
      amount: r.collectedAmount,
      reference: r.invoiceNumber,
      account: r.treasuryAccountName,
    },
  ]
}

export function receivableInvoiceDate(r: Receivable): string | undefined {
  return r.invoiceIssuedAt
}

export function receivableLedger(r: Receivable, all: Receivable[]): LedgerSummary {
  const previousBalance = all
    .filter(
      (other) =>
        r.clientId != null &&
        other.clientId === r.clientId &&
        other.currency === r.currency &&
        other.id !== r.id &&
        other.period < r.period &&
        other.status !== 'cancelled',
    )
    .reduce((sum, other) => sum + Math.max(balanceOf(other), 0), 0)
  const owed = r.status === 'cancelled' ? 0 : balanceOf(r)
  return {
    previousBalance,
    periodAmount: r.status === 'cancelled' ? 0 : r.totalAmount,
    settledAmount: r.collectedAmount,
    currentBalance: previousBalance + owed,
  }
}

export function receivableActivity(r: Receivable): ActivityEntry[] {
  const items: ActivityEntry[] = [
    { iso: apiDateToCalendarDay(r.lastActivityAt), label: 'Cobro creado', kind: 'created' },
  ]
  const invoiceIso = receivableInvoiceDate(r)
  if (invoiceIso) {
    items.push({
      iso: invoiceIso,
      label: r.billingStatus === 'manual' ? 'Factura asociada' : 'Factura generada',
      kind: 'invoice',
    })
  }
  if (r.collectedAmount > 0 && r.collectedAt) {
    items.push({ iso: r.collectedAt, label: 'Pago registrado', kind: 'collected' })
  }
  return items.sort(byActivityRecency)
}
