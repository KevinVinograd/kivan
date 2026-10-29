import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

import type { BadgeVariant } from '@/app/components/components'
import type {
  AlertSeverity,
  AlertStatus,
  AlertType,
  ClientMonth,
  ClientMonthStatus,
  ExpenseCategory,
  ExpensePayStatus,
  ExpenseRecurrence,
  MoInvoiceStatus,
  MonthlyOperationData,
  MonthStatus,
  Monotributo,
  MonotributoWatch,
  MoPaymentStatus,
  PayoutStatus,
  ProductionBillable,
  ProductionRecord,
  ProductionStatus,
  StatementStatus,
  TeamPayout,
  PaymentTotal,
  MonthPaymentRecipient,
} from './monthly-operation-mock-data'

export const NO_VALUE = '-'
export const NO_REGISTRO = 'Sin registro'

const currencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

const compactCurrencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  notation: 'compact',
  maximumFractionDigits: 1,
})

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value)
}

export function formatCompactCurrency(value: number): string {
  return compactCurrencyFormatter.format(value)
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`
}

export function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

export function formatSignedPercent(value: number): string {
  const rounded = Math.round(value)
  return `${rounded > 0 ? '+' : ''}${rounded}%`
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function formatDate(iso?: string): string {
  if (!iso) return NO_REGISTRO
  return capitalize(format(parseISO(iso), 'd LLL yyyy', { locale: es }))
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

export const MONTH_STATUS_LABEL: Record<MonthStatus, string> = {
  draft: 'Borrador',
  review: 'En revisión',
  closed: 'Cerrado',
  reopened: 'Reabierto',
}

const MONTH_STATUS_VARIANT: Record<MonthStatus, BadgeVariant> = {
  draft: 'neutral',
  review: 'warning',
  closed: 'success',
  reopened: 'outline',
}

export function monthStatusBadge(status: MonthStatus): { label: string; variant: BadgeVariant } {
  return { label: MONTH_STATUS_LABEL[status], variant: MONTH_STATUS_VARIANT[status] }
}

export function isLocked(status: MonthStatus): boolean {
  return status === 'closed'
}

export const CLIENT_MONTH_STATUS_LABEL: Record<ClientMonthStatus, string> = {
  pending_review: 'Por revisar',
  reviewed: 'Revisado',
  new: 'Alta',
  churned: 'Baja',
  paused: 'Pausado',
}

const CLIENT_MONTH_STATUS_VARIANT: Record<ClientMonthStatus, BadgeVariant> = {
  pending_review: 'warning',
  reviewed: 'success',
  new: 'neutral',
  churned: 'outline',
  paused: 'warning',
}

export function clientMonthStatusBadge(status: ClientMonthStatus): {
  label: string
  variant: BadgeVariant
} {
  return { label: CLIENT_MONTH_STATUS_LABEL[status], variant: CLIENT_MONTH_STATUS_VARIANT[status] }
}

export const PAYMENT_STATUS_LABEL: Record<MoPaymentStatus, string> = {
  paid: 'Cobrado',
  partial: 'Parcial',
  pending: 'Pendiente',
  overdue: 'Vencido',
}

const PAYMENT_STATUS_VARIANT: Record<MoPaymentStatus, BadgeVariant> = {
  paid: 'success',
  partial: 'warning',
  pending: 'neutral',
  overdue: 'danger',
}

export function paymentBadge(status: MoPaymentStatus): { label: string; variant: BadgeVariant } {
  return { label: PAYMENT_STATUS_LABEL[status], variant: PAYMENT_STATUS_VARIANT[status] }
}

export const INVOICE_STATUS_LABEL: Record<MoInvoiceStatus, string> = {
  not_issued: 'No emitida',
  issued: 'Emitida',
  sent: 'Enviada',
  paid: 'Pagada',
}

const INVOICE_STATUS_VARIANT: Record<MoInvoiceStatus, BadgeVariant> = {
  not_issued: 'neutral',
  issued: 'neutral',
  sent: 'warning',
  paid: 'success',
}

export function invoiceBadge(status: MoInvoiceStatus): { label: string; variant: BadgeVariant } {
  return { label: INVOICE_STATUS_LABEL[status], variant: INVOICE_STATUS_VARIANT[status] }
}

export const MONOTRIBUTO_LABEL: Record<Monotributo, string> = {
  monotributo_1: 'Vicky',
  monotributo_2: 'More',
  monotributo_3: 'Flor',
}

export const MONOTRIBUTO_FULL_LABEL: Record<Monotributo, string> = {
  monotributo_1: 'Monotributo Vicky',
  monotributo_2: 'Monotributo More',
  monotributo_3: 'Monotributo Flor',
}

export const MONOTRIBUTO_NEAR_THRESHOLD = 80

export function monotributoUsagePct(watch: MonotributoWatch): number {
  return watch.annualLimit > 0 ? (watch.annualBilled / watch.annualLimit) * 100 : 0
}

export function monotributoTone(pct: number): 'default' | 'warning' | 'danger' {
  if (pct >= 95) return 'danger'
  if (pct >= MONOTRIBUTO_NEAR_THRESHOLD) return 'warning'
  return 'default'
}

export const PAYOUT_STATUS_LABEL: Record<PayoutStatus, string> = {
  pending: 'Pendiente',
  partial: 'Parcial',
  paid: 'Pagado',
}

const PAYOUT_STATUS_VARIANT: Record<PayoutStatus, BadgeVariant> = {
  pending: 'neutral',
  partial: 'warning',
  paid: 'success',
}

export function payoutBadge(status: PayoutStatus): { label: string; variant: BadgeVariant } {
  return { label: PAYOUT_STATUS_LABEL[status], variant: PAYOUT_STATUS_VARIANT[status] }
}

export const STATEMENT_STATUS_LABEL: Record<StatementStatus, string> = {
  draft: 'Sin aprobar',
  approved: 'Aprobada',
  dispatched: 'Enviada',
  confirmed: 'Confirmada',
}

const STATEMENT_STATUS_VARIANT: Record<StatementStatus, BadgeVariant> = {
  draft: 'neutral',
  approved: 'warning',
  dispatched: 'warning',
  confirmed: 'success',
}

export function statementBadge(status: StatementStatus): { label: string; variant: BadgeVariant } {
  return { label: STATEMENT_STATUS_LABEL[status], variant: STATEMENT_STATUS_VARIANT[status] }
}

export type StatementTransition = 'approve' | 'dispatch' | 'confirm'

export function nextStatementAction(
  status: StatementStatus,
): { label: string; transition: StatementTransition } | null {
  switch (status) {
    case 'draft':
      return { label: 'Aprobar', transition: 'approve' }
    case 'approved':
      return { label: 'Enviar', transition: 'dispatch' }
    case 'dispatched':
      return { label: 'Confirmar', transition: 'confirm' }
    case 'confirmed':
      return null
  }
}

export const PRODUCTION_STATUS_LABEL: Record<ProductionStatus, string> = {
  pending: 'Sin aprobar',
  approved: 'Aprobada',
  invoiced: 'En cobro',
}

const PRODUCTION_STATUS_VARIANT: Record<ProductionStatus, BadgeVariant> = {
  pending: 'neutral',
  approved: 'primary',
  invoiced: 'success',
}

export function productionStatusBadge(status: ProductionStatus): {
  label: string
  variant: BadgeVariant
} {
  return { label: PRODUCTION_STATUS_LABEL[status], variant: PRODUCTION_STATUS_VARIANT[status] }
}

export const PRODUCTION_BILLABLE_LABEL: Record<ProductionBillable, string> = {
  internal: 'Interna',
  billable: 'Facturable',
  both: 'Mixta',
}

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  software: 'Software',
  office: 'Oficina',
  services: 'Servicios',
  salaries: 'Sueldos',
  taxes: 'Impuestos',
  other: 'Otro',
}

export const EXPENSE_RECURRENCE_LABEL: Record<ExpenseRecurrence, string> = {
  monthly: 'Mensual',
  one_time: 'Única vez',
  quarterly: 'Trimestral',
  annual: 'Anual',
}

export const EXPENSE_PAY_STATUS_LABEL: Record<ExpensePayStatus, string> = {
  paid: 'Pagado',
  pending: 'Pendiente',
}

const EXPENSE_PAY_STATUS_VARIANT: Record<ExpensePayStatus, BadgeVariant> = {
  paid: 'success',
  pending: 'neutral',
}

export function expensePayBadge(status: ExpensePayStatus): { label: string; variant: BadgeVariant } {
  return { label: EXPENSE_PAY_STATUS_LABEL[status], variant: EXPENSE_PAY_STATUS_VARIANT[status] }
}

export const ALERT_SEVERITY_LABEL: Record<AlertSeverity, string> = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
}

const ALERT_SEVERITY_VARIANT: Record<AlertSeverity, BadgeVariant> = {
  critical: 'danger',
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
}

export function alertSeverityBadge(severity: AlertSeverity): { label: string; variant: BadgeVariant } {
  return { label: ALERT_SEVERITY_LABEL[severity], variant: ALERT_SEVERITY_VARIANT[severity] }
}

export const ALERT_TYPE_LABEL: Record<AlertType, string> = {
  cobros: 'Cobros',
  facturacion: 'Facturación',
  equipo: 'Equipo',
  rentabilidad: 'Rentabilidad',
  comercial: 'Gestión comercial',
  arca: 'ARCA',
}

export const ALERT_STATUS_LABEL: Record<AlertStatus, string> = {
  open: 'Abierta',
  in_progress: 'En curso',
  resolved: 'Resuelta',
}

const ALERT_STATUS_VARIANT: Record<AlertStatus, BadgeVariant> = {
  open: 'danger',
  in_progress: 'warning',
  resolved: 'success',
}

export function alertStatusBadge(status: AlertStatus): { label: string; variant: BadgeVariant } {
  return { label: ALERT_STATUS_LABEL[status], variant: ALERT_STATUS_VARIANT[status] }
}

export function clientBillableExtras(client: ClientMonth): number {
  return client.extras.filter((extra) => extra.billable).reduce((sum, extra) => sum + extra.amount, 0)
}

export function clientExtrasTotal(client: ClientMonth): number {
  return client.extras.reduce((sum, extra) => sum + extra.amount, 0)
}

export function clientTotalToBill(client: ClientMonth): number {
  return client.monthlyFee + clientBillableExtras(client) + client.productionsAmount
}

export function clientMargin(client: ClientMonth): number | null {
  if (client.teamCost === null) return null
  return clientTotalToBill(client) - client.teamCost - client.productionCost
}

export function clientMarginPercent(client: ClientMonth): number | null {
  const margin = clientMargin(client)
  if (margin === null) return null
  const total = clientTotalToBill(client)
  if (total <= 0) return 0
  return (margin / total) * 100
}

export function marginTone(percent: number | null): 'default' | 'warning' | 'danger' {
  if (percent === null) return 'default'
  if (percent < 0) return 'danger'
  if (percent < 15) return 'warning'
  return 'default'
}

export function payoutAdjustmentsTotal(payout: TeamPayout): number {
  return payout.adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0)
}

export function payoutTotal(payout: TeamPayout): number {
  return (
    payout.baseAmount +
    payout.productionsAmount +
    payout.viaticsAmount +
    payoutAdjustmentsTotal(payout)
  )
}

export function bankComplete(payout: TeamPayout): boolean {
  return Boolean(payout.bank?.accountHolder && payout.bank?.cbuOrCvu)
}

export function bankLabel(payout: TeamPayout): { label: string; complete: boolean } {
  if (!payout.bank) return { label: 'Sin datos', complete: false }
  if (bankComplete(payout)) return { label: payout.bank.bankName ?? 'Completos', complete: true }
  return { label: 'Incompletos', complete: false }
}

export function productionBillableLabel(production: ProductionRecord): string {
  return production.billable ? PRODUCTION_BILLABLE_LABEL[production.billable] : 'Sin definir'
}

export type MonthlySummary = {
  totalToCollect: number
  collected: number
  pendingToCollect: number
  totalToPayTeam: number
  paidToTeam: number
  fixedExpenses: number
  fixedExpensesExcluded: number
  estimatedProfitability: number
  openAlerts: number
  criticalAlerts: number
}

export function summarize(data: MonthlyOperationData): MonthlySummary {
  const totalToCollect = data.clients.reduce((sum, client) => sum + clientTotalToBill(client), 0)
  const collected = data.clients.reduce((sum, client) => sum + client.paidAmount, 0)
  const paymentsOf = (...types: MonthPaymentRecipient[]) =>
    data.paymentTotals.filter((t) => types.includes(t.recipientType))
  const sumTotal = (rows: PaymentTotal[]) => rows.reduce((sum, t) => sum + t.total, 0)

  const operatingPayments = paymentsOf('provider', 'fixed_expense', 'monotributo', 'platform')

  const paymentsByMember = new Map(data.teamPaymentTotals.map((t) => [t.teamMemberId, t]))
  const memberIdsWithStatement = new Set(data.team.map((payout) => payout.memberId))

  const statementPayroll = data.team.reduce(
    (acc, payout) => {
      const paid = paymentsByMember.get(payout.memberId)
      return {
        total: acc.total + Math.max(payoutTotal(payout), paid?.total ?? 0),
        paid: acc.paid + Math.max(payout.paidAmount, paid?.paid ?? 0),
      }
    },
    { total: 0, paid: 0 },
  )
  const unmatchedPayroll = data.teamPaymentTotals
    .filter((t) => t.teamMemberId === null || !memberIdsWithStatement.has(t.teamMemberId))
    .reduce((acc, t) => ({ total: acc.total + t.total, paid: acc.paid + t.paid }), { total: 0, paid: 0 })

  const totalToPayTeam = statementPayroll.total + unmatchedPayroll.total
  const paidToTeam = statementPayroll.paid + unmatchedPayroll.paid

  const ownExpenses = data.expenses.reduce((sum, expense) => sum + expense.amount, 0)
  const fixedExpenses = ownExpenses + sumTotal(operatingPayments)
  const fixedExpensesExcluded = data.expenses
    .filter((expense) => !expense.affectsProfitability)
    .reduce((sum, expense) => sum + expense.amount, 0)
  const fixedExpensesAffectingProfit = fixedExpenses - fixedExpensesExcluded
  const productionCost = data.clients.reduce((sum, client) => sum + client.productionCost, 0)
  return {
    totalToCollect,
    collected,
    pendingToCollect: totalToCollect - collected,
    totalToPayTeam,
    paidToTeam,
    fixedExpenses,
    fixedExpensesExcluded,
    estimatedProfitability:
      totalToCollect - totalToPayTeam - productionCost - fixedExpensesAffectingProfit,
    openAlerts: data.alerts.filter((alert) => alert.status !== 'resolved').length,
    criticalAlerts: data.alerts.filter(
      (alert) => alert.severity === 'critical' && alert.status !== 'resolved',
    ).length,
  }
}

export type CierreFigure = { label: string; value: string; tone?: 'default' | 'success' | 'danger' }

export function cierreFigures(data: MonthlyOperationData): CierreFigure[] {
  const summary = summarize(data)
  const billed = data.clients
    .filter((client) => client.invoiceStatus !== 'not_issued')
    .reduce((sum, client) => sum + clientTotalToBill(client), 0)
  const pendingProductions = data.productions.filter((p) => p.status === 'pending').length
  const margins = data.clients.map((client) => clientMarginPercent(client))
  const marginsAllocated = margins.every((percent) => percent !== null)
  const avgMargin =
    marginsAllocated && margins.length
      ? margins.reduce((sum, percent) => sum + (percent ?? 0), 0) / margins.length
      : null
  const negativeMargin = marginsAllocated
    ? data.clients.filter((client) => (clientMargin(client) ?? 0) < 0).length
    : null
  return [
    { label: 'Total facturado', value: formatCurrency(billed) },
    { label: 'Total cobrado', value: formatCurrency(summary.collected) },
    { label: 'Pendiente de cobro', value: formatCurrency(summary.pendingToCollect) },
    { label: 'Total a pagar al equipo', value: formatCurrency(summary.totalToPayTeam) },
    { label: 'Gastos fijos', value: formatCurrency(summary.fixedExpenses) },
    ...(summary.fixedExpensesExcluded > 0
      ? [
          {
            label: 'No imputados a rentabilidad',
            value: `-${formatCurrency(summary.fixedExpensesExcluded)}`,
          },
        ]
      : []),
    {
      label: 'Rentabilidad neta',
      value: formatCurrency(summary.estimatedProfitability),
      tone: summary.estimatedProfitability >= 0 ? 'success' : 'danger',
    },
    { label: 'Margen promedio', value: avgMargin === null ? NO_VALUE : formatPercent(avgMargin) },
    {
      label: 'Clientes con margen negativo',
      value: negativeMargin === null ? NO_VALUE : String(negativeMargin),
    },
    { label: 'Producciones sin aprobar', value: String(pendingProductions) },
    { label: 'Alertas críticas', value: String(summary.criticalAlerts) },
  ]
}

export type CloseBlocker = { id: string; label: string; items: string[] }

type ServerBlocker = { code: string; message: string; count: number }

const SERVER_BLOCKER_LABEL: Record<string, string> = {
  empty_month: 'El mes no tiene cobros ni cuentas corrientes',
  arca_errors: 'Facturas con error de ARCA',
  unapproved_payouts: 'Cuentas corrientes sin aprobar',
}

export function serverBlockerLabel(blocker: { code: string; message: string }): string {
  return SERVER_BLOCKER_LABEL[blocker.code] ?? blocker.message
}

export function closeBlockers(
  data: MonthlyOperationData,
  serverBlockers: ServerBlocker[] = [],
): CloseBlocker[] {
  const blockers: CloseBlocker[] = []

  if (data.truncated) {
    blockers.push({
      id: 'bundle_truncated',
      label: 'El mes tiene más movimientos de los que esta pantalla puede mostrar',
      items: [],
    })
  }

  for (const blocker of serverBlockers) {
    const items =
      blocker.code === 'unapproved_payouts'
        ? data.team.filter((p) => p.statementStatus === 'draft').map((p) => p.name)
        : []
    blockers.push({ id: blocker.code, label: serverBlockerLabel(blocker), items })
  }

  const noAmount = data.clients
    .filter((c) => c.monthStatus !== 'churned' && c.monthStatus !== 'paused' && clientTotalToBill(c) <= 0)
    .map((c) => c.name)
  if (noAmount.length)
    blockers.push({ id: 'client_no_amount', label: 'Clientes activos sin monto a cobrar', items: noAmount })

  const badPayment = data.clients
    .filter((c) => (c.paymentStatus === 'paid' || c.paymentStatus === 'partial') && (c.paidAmount <= 0 || !c.paymentDate))
    .map((c) => c.name)
  if (badPayment.length)
    blockers.push({ id: 'payment_incomplete', label: 'Cobros sin monto o fecha', items: badPayment })

  const missingBank = data.team
    .filter((p) => payoutTotal(p) > 0 && !bankComplete(p))
    .map((p) => p.name)
  if (missingBank.length)
    blockers.push({ id: 'bank_incomplete', label: 'Equipo con pago y datos bancarios incompletos', items: missingBank })

  const noClient = data.productions.filter((p) => !p.clientId).map((p) => p.title)
  if (noClient.length)
    blockers.push({ id: 'production_no_client', label: 'Producciones sin cliente', items: noClient })

  const undefinedBillable = data.productions
    .filter((p) => p.status === 'approved' && p.billable == null)
    .map((p) => p.title)
  if (undefinedBillable.length)
    blockers.push({
      id: 'production_billable',
      label: 'Producciones aprobadas sin definir interna/facturable/mixta',
      items: undefinedBillable,
    })

  const criticalAlerts = data.alerts
    .filter((a) => a.severity === 'critical' && a.status !== 'resolved')
    .map((a) => a.entity)
  if (criticalAlerts.length)
    blockers.push({ id: 'critical_alerts', label: 'Alertas críticas sin resolver', items: criticalAlerts })

  const noEffectiveDate = data.clients
    .filter((c) => (c.monthStatus === 'new' || c.monthStatus === 'churned') && !c.effectiveDate)
    .map((c) => c.name)
  if (noEffectiveDate.length)
    blockers.push({ id: 'no_effective_date', label: 'Altas/bajas sin fecha efectiva', items: noEffectiveDate })

  return blockers
}

export type MonthInsightCtaKind =
  | 'resolve-alerts'
  | 'review-blockers'
  | 'review-collections'
  | 'close-month'

export type MonthInsight = {
  headline: string
  cta: { label: string; kind: MonthInsightCtaKind } | null
}

function validationCount(n: number): string {
  return `${n} ${n === 1 ? 'validación' : 'validaciones'}`
}

function criticalAlertCount(n: number): string {
  return `${n} ${n === 1 ? 'alerta crítica' : 'alertas críticas'}`
}

export function monthInsight(
  data: MonthlyOperationData,
  status: MonthStatus,
  blockers: CloseBlocker[],
  canSeeProfitability: boolean,
): MonthInsight {
  const summary = summarize(data)
  if (status === 'closed') {
    const hasCostBasis = summary.estimatedProfitability !== summary.totalToCollect
    return {
      headline: canSeeProfitability && hasCostBasis
        ? `Mes cerrado con ${formatCompactCurrency(summary.collected)} cobrados y una rentabilidad estimada de ${formatCompactCurrency(summary.estimatedProfitability)}.`
        : `Mes cerrado con ${formatCompactCurrency(summary.collected)} cobrados.`,
      cta: null,
    }
  }
  if (summary.criticalAlerts > 0) {
    return {
      headline: `Hay ${criticalAlertCount(summary.criticalAlerts)} y ${validationCount(blockers.length)} que bloquean el cierre. Resolvelas antes de cerrar el mes.`,
      cta: { label: 'Resolver alertas', kind: 'resolve-alerts' },
    }
  }
  if (blockers.length > 0) {
    return {
      headline: `Faltan ${validationCount(blockers.length)} para poder cerrar: ${blockers[0].label.toLowerCase()}.`,
      cta: { label: 'Ver validaciones', kind: 'review-blockers' },
    }
  }
  if (summary.pendingToCollect > 0) {
    return {
      headline: `Quedan ${formatCompactCurrency(summary.pendingToCollect)} por cobrar antes del cierre. El resto está en condiciones de cerrarse.`,
      cta: { label: 'Ver cobros pendientes', kind: 'review-collections' },
    }
  }
  return {
    headline: 'Sin validaciones pendientes: el mes está en condiciones de cerrarse.',
    cta: { label: 'Cerrar mes', kind: 'close-month' },
  }
}

export function clientSearchText(client: ClientMonth): string {
  return [client.name, client.clientType, ...client.services, ...client.team.map((m) => m.name)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function payoutSearchText(payout: TeamPayout): string {
  return [payout.name, payout.role, ...payout.clients].filter(Boolean).join(' ').toLowerCase()
}

export function productionSearchText(production: ProductionRecord): string {
  return [production.title, production.clientName, production.type, production.responsible]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}
