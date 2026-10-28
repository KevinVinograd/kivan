/**
 * Operación mensual formatting, derivation + close-validation helpers. Pure
 * functions that turn the raw model values into display strings, Badge variants
 * and the derived figures the summary cards, detail panels and close dialog read.
 * Formatting lives here, never in the data; numbers/dates sort raw and render
 * formatted. The `closeBlockers` resolver implements the seven close validations.
 */
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

/**
 * Percentage change of current vs previous; `null` when there is no comparable
 * base. The denominator uses `Math.abs(previous)` so the result reflects the
 * direction of change, not the sign of the base, which is correct for
 * margin/revenue deltas. In a debt/liability context (a negative base growing
 * less negative), read the value as magnitude of change, not as an accounting
 * gain or loss.
 */
export function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

/** Signed percent label, e.g. "+327%", "0%", "-12%". */
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

// ── Month status ─────────────────────────────────────────────────────────────
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

// ── Client month status ──────────────────────────────────────────────────────
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

// ── Payment ──────────────────────────────────────────────────────────────────
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

// ── Invoice ──────────────────────────────────────────────────────────────────
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

// ── Monotributo ──────────────────────────────────────────────────────────────
// Named after who holds each emisor, matching `BILLING_ENTITY_LABEL` in
// clients-format.ts. The same emisor must never read "MT 1" here and "Vicky"
// there. The codes remain the stored identifiers.
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

/** A category is "near" its annual cap at or above this usage percentage. */
export const MONOTRIBUTO_NEAR_THRESHOLD = 80

/** Share of the category's annual billing ceiling already consumed (0–100+). */
export function monotributoUsagePct(watch: MonotributoWatch): number {
  return watch.annualLimit > 0 ? (watch.annualBilled / watch.annualLimit) * 100 : 0
}

/** Bar tone for a usage ratio: danger at/over 95%, warning at/over the near threshold. */
export function monotributoTone(pct: number): 'default' | 'warning' | 'danger' {
  if (pct >= 95) return 'danger'
  if (pct >= MONOTRIBUTO_NEAR_THRESHOLD) return 'warning'
  return 'default'
}

// ── Payout / statement ───────────────────────────────────────────────────────
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

/**
 * Only the last step is `success`: the two middle states are work in progress, not
 * an outcome. Tinting `approved` or `dispatched` green would read as "cobrada" on a
 * row where nobody has been paid yet.
 */
const STATEMENT_STATUS_VARIANT: Record<StatementStatus, BadgeVariant> = {
  draft: 'neutral',
  approved: 'warning',
  dispatched: 'warning',
  confirmed: 'success',
}

export function statementBadge(status: StatementStatus): { label: string; variant: BadgeVariant } {
  return { label: STATEMENT_STATUS_LABEL[status], variant: STATEMENT_STATUS_VARIANT[status] }
}

/** The three server transitions, named as the API names them. */
export type StatementTransition = 'approve' | 'dispatch' | 'confirm'

/**
 * The ONE transition the server will accept from here, or `null` when the statement
 * is settled. The lifecycle is forward-only and each route is a conditional update
 * filtered on the status it expects to move from, so anything else is a 409 the user
 * cannot act on: the UI must derive the action from the row rather than offer a menu
 * of them (`apps/api/src/modules/payouts/payouts.service.ts`).
 */
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

// ── Production ───────────────────────────────────────────────────────────────
// "Sin aprobar", not "Pendiente": the viático beside it on the same row is pending too
// (not paid back yet), and one word for both read as one state (HOLD, 2026-10-21).
// "En cobro" is what every list already called a production on a cobro.
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

// ── Expense ──────────────────────────────────────────────────────────────────
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

// ── Alerts ───────────────────────────────────────────────────────────────────
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

// ── Client derivations ───────────────────────────────────────────────────────
export function clientBillableExtras(client: ClientMonth): number {
  return client.extras.filter((extra) => extra.billable).reduce((sum, extra) => sum + extra.amount, 0)
}

export function clientExtrasTotal(client: ClientMonth): number {
  return client.extras.reduce((sum, extra) => sum + extra.amount, 0)
}

export function clientTotalToBill(client: ClientMonth): number {
  return client.monthlyFee + clientBillableExtras(client) + client.productionsAmount
}

/**
 * Per-client margin, or `null` when the source does not allocate payroll to the
 * client (`teamCost === null`). Returning 0-cost margin in that case would report
 * every client as more profitable than it is, so the caller must render "-".
 */
export function clientMargin(client: ClientMonth): number | null {
  if (client.teamCost === null) return null
  return clientTotalToBill(client) - client.teamCost - client.productionCost
}

/** Per-client margin as a percent of what it bills; `null` when `clientMargin` is. */
export function clientMarginPercent(client: ClientMonth): number | null {
  const margin = clientMargin(client)
  if (margin === null) return null
  const total = clientTotalToBill(client)
  if (total <= 0) return 0
  return (margin / total) * 100
}

/** Tone for a margin figure: negative = danger, thin (<15%) = warning, else default.
 *  An unallocated margin (`null`) has no verdict to carry, so it stays neutral. */
export function marginTone(percent: number | null): 'default' | 'warning' | 'danger' {
  if (percent === null) return 'default'
  if (percent < 0) return 'danger'
  if (percent < 15) return 'warning'
  return 'default'
}

// ── Team derivations ─────────────────────────────────────────────────────────
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

// ── Production derivations ───────────────────────────────────────────────────
export function productionBillableLabel(production: ProductionRecord): string {
  return production.billable ? PRODUCTION_BILLABLE_LABEL[production.billable] : 'Sin definir'
}

// ── Summary ──────────────────────────────────────────────────────────────────
export type MonthlySummary = {
  totalToCollect: number
  collected: number
  pendingToCollect: number
  totalToPayTeam: number
  paidToTeam: number
  /**
   * EVERY fixed expense of the month — the cash that actually left, including the ones
   * flagged `affectsProfitability: false`. This is the figure the KPI strip and the close
   * card show, because hiding real spend from the summary would be its own lie.
   *
   * It is NOT what profit subtracts. See `fixedExpensesExcluded`.
   */
  fixedExpenses: number
  /**
   * The portion of `fixedExpenses` the user explicitly marked as NOT bearing on
   * profitability (`affectsProfitability: false` — a Checkbox in the expense dialog, a
   * Badge in the expenses table, a persisted DTO field). `estimatedProfitability`
   * subtracts `fixedExpenses - fixedExpensesExcluded`, so the close card reconciles:
   *
   *   totalToCollect - totalToPayTeam - productionCost - (fixedExpenses - fixedExpensesExcluded)
   *     = estimatedProfitability
   *
   * Keep the two fields separate. Collapsing them back into one is exactly the bug this
   * split fixes: the flag shipped in the DTO, in the table and in the form, and NOTHING
   * read it, so an expense the user marked "no afecta rentabilidad" still cut the profit.
   */
  fixedExpensesExcluded: number
  /**
   * Projected (accrual-basis) profit: billable revenue (`totalToCollect`) minus
   * team, production and fixed costs, independent of how much has been collected.
   * It is a forward estimate, NOT realized cash profit: the cash actually received
   * is `collected` and what is still outstanding is `pendingToCollect`. Switching
   * the basis to cash-collected is a domain decision (see `summarize`).
   *
   * The payroll cost subtracted here is `totalToPayTeam` — the month's actual
   * payouts — NOT the sum of the per-client `teamCost` allocation, which is `null`
   * (unknown) whenever the source does not break payroll down per client.
   *
   * The fixed-expense cost subtracted here EXCLUDES the expenses flagged
   * `affectsProfitability: false` (see `fixedExpensesExcluded`).
   */
  estimatedProfitability: number
  openAlerts: number
  criticalAlerts: number
}

export function summarize(data: MonthlyOperationData): MonthlySummary {
  const totalToCollect = data.clients.reduce((sum, client) => sum + clientTotalToBill(client), 0)
  const collected = data.clients.reduce((sum, client) => sum + client.paidAmount, 0)
  // The cost side comes from the Pagos module, which is where the studio actually records
  // what it spends. Before this, the month read PayoutStatement and FixedExpense, and an
  // operator who had loaded every one of August's payments still saw a $0 cost side.
  const paymentsOf = (...types: MonthPaymentRecipient[]) =>
    data.paymentTotals.filter((t) => types.includes(t.recipientType))
  const sumTotal = (rows: PaymentTotal[]) => rows.reduce((sum, t) => sum + t.total, 0)

  const operatingPayments = paymentsOf('provider', 'fixed_expense', 'monotributo', 'platform')

  // PAYROLL IS DEDUPLICATED PER PERSON, never summed.
  //
  // A colaboradora has TWO overlapping records of the same obligation: a PayoutStatement
  // (the month's plan) and the payments recorded in `/pagos` (the actuals). Both post to the
  // SAME teamMember ledger account, so they describe one debt, not two.
  //
  // A first version of this added them, on the premise that a statement is structurally 0
  // because no screen sends it a money field. The premise was wrong twice over, and both
  // paths run from this very page: the server DERIVES `productionsAmountMinor` as
  // `hours × rate` when a statement is created (payouts.service.ts) — and `setBankData` is
  // its only creator, so filling in a colaboradora's bank details mints a statement carrying
  // money — while `addAdjustment` folds an adjustment into `totalAmountMinor`
  // (payouts.repo.ts `recomputeTotals`). Adding them charged her twice against the profit
  // the operator freezes at close. `bank_incomplete` filtering `payoutTotal(p) > 0` was
  // already saying so: that filter would be dead code if a total were structurally 0.
  //
  // Taking the LARGER of the two per member is the rule: it cannot double-count, it keeps
  // the statement for a member whose pay is planned but not yet paid, and it keeps the
  // payments for a member with no statement at all — which is the state of every workspace
  // today.
  //
  // Its known limit, stated plainly because an earlier version of this comment claimed a
  // visibility that does not exist: a payment genuinely ON TOP of a full statement (a bonus)
  // is under-reported, and NOTHING on the page shows it. The Equipo tab renders statements,
  // the Gastos tab renders payment rows, and no surface puts one member's two figures side
  // by side. `total` and `paid` are also maxed independently, so a member settled across
  // both records can still print a remaining balance. Both cases need the settlement
  // question answered (is a pago to a colaboradora her liquidación, or money on top of it),
  // which is recorded as open in the 2026-06-22 audit.
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
  // Payroll paid to someone with no statement this month — including the unlinked payments,
  // which name no member and so can overlap nothing.
  const unmatchedPayroll = data.teamPaymentTotals
    .filter((t) => t.teamMemberId === null || !memberIdsWithStatement.has(t.teamMemberId))
    .reduce((acc, t) => ({ total: acc.total + t.total, paid: acc.paid + t.paid }), { total: 0, paid: 0 })

  const totalToPayTeam = statementPayroll.total + unmatchedPayroll.total
  const paidToTeam = statementPayroll.paid + unmatchedPayroll.paid

  // Operating cost: the month's own FixedExpense rows PLUS the non-payroll outflows from
  // `/pagos` (proveedores, gastos fijos, monotributo, plataformas).
  //
  // Adding them is only safe because they cannot describe the same peso, and that is
  // enforced at the SOURCE rather than trusted here: the Gastos tab no longer accepts new
  // rows, so `/pagos` is the one place an operating cost can be recorded from now on and no
  // fresh overlap can be created. The historical case, where a month already carries rows
  // on both sides, is surfaced in the Gastos tab rather than resolved here: only a human can
  // say whether the two rows are the same alquiler recorded twice.
  const ownExpenses = data.expenses.reduce((sum, expense) => sum + expense.amount, 0)
  const fixedExpenses = ownExpenses + sumTotal(operatingPayments)
  // The expenses the user flagged as not bearing on profitability. `affectsProfitability`
  // is a persisted DTO field, a Badge column and a Checkbox in the expense dialog — and
  // until this split NOTHING read it, so the product promised "no afecta rentabilidad"
  // and cut the profit anyway. A Payment carries no such flag, so every payment counts.
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
    // Accrual basis: billable revenue minus costs (see MonthlySummary.estimatedProfitability).
    // Payroll comes from `totalToPayTeam` (the month's payouts), which is exact in every
    // source. Summing the per-client `teamCost` here instead would silently drop the whole
    // payroll to 0 against the live API, which does not allocate it per client.
    // Fixed expenses are net of the ones the user excluded from profitability.
    estimatedProfitability:
      totalToCollect - totalToPayTeam - productionCost - fixedExpensesAffectingProfit,
    openAlerts: data.alerts.filter((alert) => alert.status !== 'resolved').length,
    criticalAlerts: data.alerts.filter(
      (alert) => alert.severity === 'critical' && alert.status !== 'resolved',
    ).length,
  }
}

// ── Cierre figures ───────────────────────────────────────────────────────────
export type CierreFigure = { label: string; value: string; tone?: 'default' | 'success' | 'danger' }

export function cierreFigures(data: MonthlyOperationData): CierreFigure[] {
  const summary = summarize(data)
  const billed = data.clients
    .filter((client) => client.invoiceStatus !== 'not_issued')
    .reduce((sum, client) => sum + clientTotalToBill(client), 0)
  const pendingProductions = data.productions.filter((p) => p.status === 'pending').length
  const margins = data.clients.map((client) => clientMarginPercent(client))
  // Both margin figures are per-client derivations, so they are only computable when the
  // source allocates payroll per client. When it does not, they render "-": averaging an
  // unallocated margin would report the studio as more profitable than it is, which is the
  // exact failure this card exists to prevent. Studio-level profit below stays exact — it
  // subtracts `totalToPayTeam`, which every source has.
  const marginsAllocated = margins.every((percent) => percent !== null)
  const avgMargin =
    marginsAllocated && margins.length
      ? margins.reduce((sum, percent) => sum + (percent ?? 0), 0) / margins.length
      : null
  const negativeMargin = marginsAllocated
    ? data.clients.filter((client) => (clientMargin(client) ?? 0) < 0).length
    : null
  // Figures render fg-default; only Rentabilidad neta — the profit/loss verdict —
  // carries a state color (figure-color-restraint: one tinted figure per viewport).
  // The go/no-go Alert in the dialog carries blocker status (critical alerts,
  // validations), so those counts stay neutral rather than double-encoding it.
  return [
    { label: 'Total facturado', value: formatCurrency(billed) },
    { label: 'Total cobrado', value: formatCurrency(summary.collected) },
    { label: 'Pendiente de cobro', value: formatCurrency(summary.pendingToCollect) },
    // Accrued, not settled: this is the payroll the month owes, and it is exactly what
    // `estimatedProfitability` subtracts two rows below, so the card reconciles with itself.
    // (`summary.paidToTeam` is what has actually been disbursed and is a different figure.)
    { label: 'Total a pagar al equipo', value: formatCurrency(summary.totalToPayTeam) },
    // The TOTAL cash out, including expenses excluded from profitability. The excluded
    // amount then gets its own row (below) so the card still adds up to Rentabilidad neta
    // instead of showing a cost the profit line silently did not subtract.
    { label: 'Gastos fijos', value: formatCurrency(summary.fixedExpenses) },
    // Only when there is something to exclude: a row reading "$ 0" on every normal month
    // is noise, and this card is already dense.
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

// ── Close validations (the front's seven + whatever the server refuses on) ───
export type CloseBlocker = { id: string; label: string; items: string[] }

/** The server's blocker shape (`GET /months/:period/close-blockers`). */
type ServerBlocker = { code: string; message: string; count: number }

/**
 * Spanish for the codes the API can return today. An unlisted code is NOT dropped —
 * it falls back to the server's own English message, because a blocker the user
 * cannot see is exactly how "listo para cerrar" ends in a 409 with no explanation.
 */
const SERVER_BLOCKER_LABEL: Record<string, string> = {
  empty_month: 'El mes no tiene cobros ni cuentas corrientes',
  arca_errors: 'Facturas con error de ARCA',
  unapproved_payouts: 'Cuentas corrientes sin aprobar',
}

export function serverBlockerLabel(blocker: { code: string; message: string }): string {
  return SERVER_BLOCKER_LABEL[blocker.code] ?? blocker.message
}

/**
 * The front's validations and the server's are computed from DIFFERENT data and
 * neither contains the other: the seven below look at rows the API never inspects,
 * while `unapproved_payouts` / `arca_errors` / `empty_month` are counted server-side
 * over the whole period. Merging both is what makes the close button honest — the UI
 * used to show only its own seven, promise a close, and let the server refuse it.
 *
 * `serverBlockers` defaults to empty so a failed blockers fetch degrades to the old
 * client-only list instead of blanking the close dialog.
 */
export function closeBlockers(
  data: MonthlyOperationData,
  serverBlockers: ServerBlocker[] = [],
): CloseBlocker[] {
  const blockers: CloseBlocker[] = []

  // FIRST, because it invalidates every other answer on this page. When the month has
  // more rows than the bundle carries, the totals, the profitability and the rest of
  // these blockers are all computed over a SUBSET — so a clean checklist would be a
  // clean checklist for part of the month. Signing that off freezes it into a snapshot.
  if (data.truncated) {
    blockers.push({
      id: 'bundle_truncated',
      label: 'El mes tiene más movimientos de los que esta pantalla puede mostrar',
      items: [],
    })
  }

  for (const blocker of serverBlockers) {
    // Name the people behind the count when the rows are on screen anyway; the
    // server sends a number, and "3 cuentas corrientes" is not something the user
    // can act on.
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

// ── Page-level AI insight ────────────────────────────────────────────────────

/**
 * What the insight's CTA resolves. Each `kind` maps to a real capability the page
 * can perform, so the CTA always acts on the SAME signal the headline reports — the
 * CTA-resolution rule A closed month has
 * nothing to resolve, so its insight carries no CTA.
 */
export type MonthInsightCtaKind =
  | 'resolve-alerts'
  | 'review-blockers'
  | 'review-collections'
  | 'close-month'

export type MonthInsight = {
  headline: string
  cta: { label: string; kind: MonthInsightCtaKind } | null
}

/** "1 validación" / "N validaciones" — the accent drops in the plural, so a naive
 *  `validación` + `es` suffix produces the misspelling "validaciónes". */
function validationCount(n: number): string {
  return `${n} ${n === 1 ? 'validación' : 'validaciones'}`
}

/** "1 alerta crítica" / "N alertas críticas". */
function criticalAlertCount(n: number): string {
  return `${n} ${n === 1 ? 'alerta crítica' : 'alertas críticas'}`
}

/**
 * The period's one-line takeaway plus the action that resolves it. The branches are
 * ordered by urgency — critical alerts, then close validations, then uncollected
 * money — so the headline always names the thing standing between the user and the
 * close, and the CTA points at where that thing is fixed.
 */
/**
 * `blockers` is passed in, not recomputed, and it is REQUIRED. This function used to call
 * `closeBlockers(data)` itself, which meant the page's most prominent element announced
 * "el mes está en condiciones de cerrarse" from the client-only seven while the close
 * dialog listed an unresolved SERVER blocker — the page contradicting itself, with the
 * headline taking the optimistic side. Taking the same list the dialog renders makes the
 * two agree by construction; an optional parameter defaulting to `[]` would have quietly
 * restored the bug for any caller that forgot it.
 */
export function monthInsight(
  data: MonthlyOperationData,
  status: MonthStatus,
  blockers: CloseBlocker[],
  canSeeProfitability: boolean,
): MonthInsight {
  const summary = summarize(data)
  if (status === 'closed') {
    // The profitability clause is withheld on BOTH axes the tile two rows below applies,
    // because the insight restates that tile in prose and a page that answers the same
    // question twice must not give two answers.
    //
    // Capability: the insight renders unconditionally, so stating the margin here
    // published a figure the KPI withholds. A custom role can hold
    // `page.monthly_operation` without `client.profitability.read` and reach this line.
    // (Built-in roles are unaffected — the route is owner/admin, and both hold every
    // capability, which is why nothing caught it.)
    //
    // Cost basis: `estimatedProfitability` subtracts payouts, production cost and
    // profit-affecting expenses from the billing. None of those reaches this screen from
    // the pagos module, so a month with every pago loaded still resolves to the BILLING,
    // and the headline announced the studio's revenue as its profit on the page that
    // invites the operator to sign the month off. Same test the tile uses.
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

// ── Search text (table global filters) ───────────────────────────────────────
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
