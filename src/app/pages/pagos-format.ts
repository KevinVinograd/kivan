import { apiDateToCalendarDay } from '@/app/lib/iso-date'
import { formatCurrency as formatInLane, LANES, LANE_FILTER_OPTIONS, LANE_NOUN } from '@/lib/currency'
import type { Currency } from '@hold/shared'

import type { LedgerPeriodSummaryDto } from '@/api/ledger'
import type { PaymentBankDto } from '@/api/payments'
import type { PayoutStatementDto } from '@/api/payouts'
import {
  formatCompactCurrency,
  formatCurrency,
  formatMoney,
  formatShortDate,
  isPastDate,
  NO_REGISTRO,
  NO_VALUE,
  byActivityRecency,
  type ActivityEntry,
  type DetailRowData,
  type FilterField,
  type Kpi,
  type LedgerSummary,
  type StatusBadge,
} from './cobranza-format'
import type {
  Payment,
  PaymentMethod,
  PaymentStatus,
  RecipientType,
} from './pagos-mock-data'

const PAYMENT_STATUS: Record<PaymentStatus, StatusBadge> = {
  pending: { label: 'Pendiente', variant: 'neutral' },
  approved: { label: 'Aprobado', variant: 'neutral' },
  paid: { label: 'Pagado', variant: 'success' },
  partial: { label: 'Parcial', variant: 'warning' },
  overdue: { label: 'Vencido', variant: 'danger' },
  cancelled: { label: 'Cancelado', variant: 'outline' },
}

export function paymentStatusBadge(status: PaymentStatus): StatusBadge {
  return PAYMENT_STATUS[status]
}

export const RECIPIENT_TYPE_LABEL: Record<RecipientType, string> = {
  collaborator: 'Colaboradora',
  provider: 'Proveedor',
  employee: 'Empleado fijo',
  fixed_expense: 'Gasto fijo',
  monotributo: 'Monotributo',
  platform: 'Plataforma',
}

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  transfer: 'Transferencia',
  cash: 'Efectivo',
  mercado_pago: 'Mercado Pago',
  other: 'Otro',
}

export function paymentMethodLabel(method?: PaymentMethod): string {
  return method ? PAYMENT_METHOD_LABEL[method] : 'Sin asignar'
}

export function paymentBalanceOf(payment: Payment): number {
  return payment.totalAmount - payment.paidAmount
}

export function isPaymentOverdue(payment: Payment): boolean {
  return (
    payment.status !== 'cancelled' &&
    paymentBalanceOf(payment) > 0 &&
    (payment.status === 'overdue' || isPastDate(payment.expectedDate))
  )
}

export function paymentSearchText(p: Payment): string {
  return [p.recipientName, p.accountAlias, p.concept, RECIPIENT_TYPE_LABEL[p.recipientType]]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

const STATUS_FILTER_OPTIONS = (
  ['pending', 'approved', 'paid', 'partial', 'overdue', 'cancelled'] as const
).map((value) => ({ value, label: PAYMENT_STATUS[value].label }))

const TYPE_FILTER_OPTIONS = (
  ['collaborator', 'provider', 'employee', 'fixed_expense', 'monotributo', 'platform'] as const
).map((value) => ({ value, label: RECIPIENT_TYPE_LABEL[value] }))

export const PAGOS_FILTER_FIELDS: FilterField[] = [
  { id: 'status', label: 'Estado', options: STATUS_FILTER_OPTIONS },
  { id: 'recipientType', label: 'Tipo', options: TYPE_FILTER_OPTIONS },
  { id: 'currency', label: 'Moneda', options: LANE_FILTER_OPTIONS },
]

export function pagosKpis(rows: Payment[]): Kpi[] {
  const isArs = (p: Payment) => p.currency === 'ARS'
  const ars = rows.filter(isArs)
  const live = ars.filter((p) => p.status !== 'cancelled')
  const sum = (items: Payment[], pick: (p: Payment) => number) =>
    items.reduce((total, p) => total + pick(p), 0)

  const totalPaid = sum(ars, (p) => p.paidAmount)
  const pendingBalance = sum(live, paymentBalanceOf)
  const overdue = sum(live.filter(isPaymentOverdue), paymentBalanceOf)
  const pendingReview = sum(
    live.filter((p) => p.status === 'pending'),
    (p) => p.totalAmount,
  )
  const fixedExpenses = sum(
    live.filter((p) => p.recipientType === 'fixed_expense'),
    (p) => p.totalAmount,
  )

  const figures: Kpi[] = [
    ...LANES.map((currency) => laneFigure(rows, currency)),
    { id: 'paid', label: 'Pagado', value: formatCompactCurrency(totalPaid), tone: 'default' },
    {
      id: 'pending',
      label: 'Pendiente',
      value: formatCompactCurrency(pendingBalance),
      tone: pendingBalance > 0 ? 'warning' : 'default',
    },
    {
      id: 'overdue',
      label: 'Vencido',
      value: formatCompactCurrency(overdue),
      tone: overdue > 0 ? 'danger' : 'default',
    },
    {
      id: 'pendingReview',
      label: 'Pendiente de revisión',
      value: formatCompactCurrency(pendingReview),
      tone: 'default',
    },
    {
      id: 'fixedExpenses',
      label: 'Gastos fijos',
      value: formatCompactCurrency(fixedExpenses),
      tone: 'default',
    },
  ]
  return figures
}

function laneFigure(rows: Payment[], currency: Currency): Kpi {
  const live = rows.filter((p) => p.currency === currency && p.status !== 'cancelled')
  const total = live.reduce((sum, p) => sum + p.totalAmount, 0)
  return {
    id: heroIdFor(currency),
    label: `Total a pagar en ${LANE_NOUN[currency]}`,
    value: formatInLane(total, currency),
    tone: 'default' as const,
    hint: live.length === 0 ? 'sin pagos en el período' : live.length === 1 ? '1 pago' : `${live.length} pagos`,
  }
}

const heroIdFor = (currency: Currency) => `toPay${currency}`

export const PAGOS_HERO_IDS: [string, string] = [heroIdFor('ARS'), heroIdFor('USD')]

function fromMinor(minor: string): number {
  return Number(minor) / 100
}

const row = (label: string, value: string): DetailRowData => ({ label, value })

export function paymentDesglose(p: Payment, statement: PayoutStatementDto | null): DetailRowData[] {
  if (p.recipientType === 'collaborator' || p.recipientType === 'employee') {
    if (!statement) return []
    return [
      row('Horas', statement.hoursTotal === null ? NO_REGISTRO : `${statement.hoursTotal} h`),
      row(
        'Valor hora',
        statement.hourlyRateMinor === null
          ? NO_REGISTRO
          : formatCurrency(fromMinor(statement.hourlyRateMinor)),
      ),
      row('Base', formatCurrency(fromMinor(statement.baseAmountMinor))),
      row('Producciones', formatCurrency(fromMinor(statement.productionsAmountMinor))),
      row('Viáticos', formatCurrency(fromMinor(statement.viaticsAmountMinor))),
      ...statement.adjustments.map((a) => row(a.description, formatCurrency(fromMinor(a.amountMinor)))),
      row('Total', formatCurrency(fromMinor(statement.totalAmountMinor))),
    ]
  }

  if (p.recipientType === 'fixed_expense') {
    return [
      row('Categoría', p.concept),
      row('Proveedor', p.recipientName),
      row('Monto', formatMoney(p.totalAmount, p.currency)),
      row('Vencimiento', formatShortDate(p.expectedDate)),
      row('Medio de pago', paymentMethodLabel(p.method)),
    ]
  }

  return [
    row('Concepto', p.concept),
    row('Monto', formatMoney(p.totalAmount, p.currency)),
    row('Vencimiento', formatShortDate(p.expectedDate)),
    row('Medio de pago', paymentMethodLabel(p.method)),
  ]
}

export function paymentBankData(bank: PaymentBankDto | null): DetailRowData[] {
  return [
    row('Banco', bank?.bankName ?? NO_VALUE),
    row('CBU', bank?.cbuOrCvu ?? NO_VALUE),
    row('Alias', bank?.alias ?? NO_VALUE),
    row('Titular', bank?.accountHolder ?? NO_VALUE),
  ]
}

export type PaymentLedgerSummary = LedgerSummary & {
  creditAdjustments: number
}

export function paymentLedger(summary: LedgerPeriodSummaryDto | null): PaymentLedgerSummary | null {
  if (!summary) return null
  return {
    previousBalance: fromMinor(summary.openingBalanceMinor),
    periodAmount: fromMinor(summary.debitMinor),
    settledAmount: fromMinor(summary.settledMinor),
    creditAdjustments: fromMinor(summary.creditAdjustmentsMinor),
    currentBalance: fromMinor(summary.closingBalanceMinor),
  }
}

export function paymentActivity(p: Payment): ActivityEntry[] {
  const items: ActivityEntry[] = [
    { iso: apiDateToCalendarDay(p.lastActivityAt), label: 'Pago creado', kind: 'created' },
  ]
  if (p.paidAmount > 0 && p.paymentDate) {
    items.push({
      iso: p.paymentDate,
      label: p.status === 'partial' ? 'Pago parcial registrado' : 'Pago realizado',
      kind: 'paid',
    })
  }
  return items.sort(byActivityRecency)
}
