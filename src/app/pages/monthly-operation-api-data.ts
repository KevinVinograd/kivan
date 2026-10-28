/**
 * Bridges the real Monthly-operation plan bundle (GET /months/:period/plan) to the
 * front's `MonthlyOperationData`. The backend carries money in minor units and a
 * few concepts that diverge from the front's view-model, so this maps enums and
 * fills the display-only fields the bundle doesn't source (services, assigned team,
 * teamCost/productionCost) with safe defaults. Cobro/pago actuals stay overlaid by
 * the finance-bridge on top (receivables/payments are already API-backed).
 */
import type {
  ProductionDto,
  ExpenseDto,
  AlertDto,
  PlanBundleDto,
} from '@/api/monthly'
import type { PayoutStatementDto } from '@/api/payouts'
import type { ReceivableDto } from '@/api/receivables'
import { toMajor } from '@/lib/money'
import type {
  AlertStatus,
  AlertSeverity,
  AlertType,
  ClientMonth,
  ClientMonthStatus,
  ExpenseCategory,
  ExpensePayStatus,
  ExpenseRecurrence,
  FixedExpense,
  MoInvoiceStatus,
  MoPaymentStatus,
  Monotributo,
  MonotributoWatch,
  MonthlyAlert,
  MonthlyOperationData,
  ProductionBillable,
  ProductionRecord,
  ProductionStatus,
  StatementStatus,
  TeamPayout,
  PaymentTotal,
  MonthPayment
} from './monthly-operation-mock-data'


function pick<T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

const CLIENT_STATUSES: ClientMonthStatus[] = ['pending_review', 'reviewed', 'new', 'churned', 'paused']
const MONOTRIBUTOS: Monotributo[] = ['monotributo_1', 'monotributo_2', 'monotributo_3']

const INVOICE_FROM_BILLING: Record<string, MoInvoiceStatus> = {
  no_invoice: 'not_issued',
  pending: 'not_issued',
  error_arca: 'not_issued',
  not_required: 'not_issued',
  invoiced: 'issued',
  manual: 'issued',
  sent: 'sent',
}
const PAYMENT_FROM_COLLECTION: Record<string, MoPaymentStatus> = {
  collected: 'paid',
  partial: 'partial',
  overdue: 'overdue',
  pending: 'pending',
  cancelled: 'pending',
}
/**
 * The statement status now passes through unmapped — the view model speaks the
 * API's own lifecycle. It is still `pick`ed rather than cast: the bundle is the one
 * payout read with no response schema, so the value arrives unchecked.
 *
 * The fallback is `draft` (the least-advanced state) on purpose. Falling back
 * forward would render "Confirmada" for a status we failed to recognize — claiming
 * money reached someone on the strength of a string we could not parse. Under-claiming
 * costs a refused transition; over-claiming costs a payment nobody made.
 */
const STATEMENT_STATUSES: StatementStatus[] = ['draft', 'approved', 'dispatched', 'confirmed']

function clientFromReceivable(
  r: ReceivableDto,
  productionsAmount: number,
  productionCost: number,
): ClientMonth {
  return {
    id: r.id,
    clientId: r.clientId,
    name: r.clientName,
    monthStatus: pick(r.reviewStatus, CLIENT_STATUSES, 'pending_review'),
    services: [],
    team: [],
    monthlyFee: toMajor(r.baseAmountMinor),
    extras: r.extras.map((e) => ({
      id: e.id ?? `${r.id}-${e.description}`,
      description: e.description,
      amount: toMajor(e.amountMinor),
      billable: e.billable,
    })),
    productionsAmount,
    paidAmount: toMajor(r.collectedAmountMinor),
    paymentStatus: PAYMENT_FROM_COLLECTION[r.status] ?? 'pending',
    // The day the money actually arrived. It was collected by the Registrar-pago
    // dialog, stored, and returned by the API as `collectedAt` — and then dropped
    // HERE, which made the month impossible to close for anybody.
    //
    // `closeBlockers` raises `payment_incomplete` ("Cobros sin monto o fecha") for any
    // client marked paid or partial whose `paymentDate` is missing. With it never
    // mapped, that blocker fired for EVERY collected client, on EVERY month, and could
    // not be resolved from the UI: the operator is told to fix a date that is already
    // there. Reported from production by an operator at 94% collected, being sent to
    // correct cobros one by one that had nothing wrong with them.
    //
    // `.slice(0, 10)`, not `new Date(...)`: the API serializes this one as a UTC
    // midnight instant (`...T00:00:00.000Z`), so at UTC-3 any local formatting renders
    // the PREVIOUS day. The front's contract for a day-column is the date part.
    ...(r.collectedAt ? { paymentDate: r.collectedAt.slice(0, 10) } : {}),
    ...(r.effectiveDate ? { effectiveDate: r.effectiveDate } : {}),
    invoiceStatus: INVOICE_FROM_BILLING[r.billingStatus] ?? 'not_issued',
    monotributo: pick(r.emitterCode, MONOTRIBUTOS, 'monotributo_1'),
    // The bundle does not source per-client assignment-cost allocation yet, so the
    // payroll share of this client is UNKNOWN, not zero: `null` keeps that distinct
    // so the margin derivations render "-" instead of silently overstating profit.
    // Studio-level payroll is still exact — `summarize` takes it from the payouts.
    teamCost: null,
    productionCost,
    ...(r.planNotes ? { notes: r.planNotes } : {}),
  }
}

function payoutFromDto(p: PayoutStatementDto, memberById: Map<string, { name: string; role: string }>): TeamPayout {
  const total = toMajor(p.totalAmountMinor)
  const paid = toMajor(p.paidAmountMinor)
  const member = memberById.get(p.teamMemberId)
  return {
    id: p.id,
    memberId: p.teamMemberId,
    name: member?.name ?? 'Sin nombre',
    role: member?.role ?? '',
    clients: [],
    baseAmount: toMajor(p.baseAmountMinor),
    productionsAmount: toMajor(p.productionsAmountMinor),
    viaticsAmount: toMajor(p.viaticsAmountMinor),
    adjustments: p.adjustments.map((a) => ({
      id: a.id,
      description: a.description,
      amount: toMajor(a.amountMinor),
    })),
    statementStatus: pick(p.statementStatus, STATEMENT_STATUSES, 'draft'),
    payoutStatus: paid >= total && total > 0 ? 'paid' : paid > 0 ? 'partial' : 'pending',
    paidAmount: paid,
    // The day the statement records. Without this the "Fecha de pago" an operator enters
    // in THIS page's Registrar pago dialog was sent, stored, returned by the API — and
    // dropped here, so the detail showed "—" for a day just entered. `/team` closed the
    // loop; this did not. `payoutDate` was simply always undefined on the API path:
    // `overlayTeamPayout` in the finance bridge does set it, and no page calls that
    // module. If it is ever wired up it will OVERWRITE this, unconditionally, with
    // `latestPayoutDate` of the matching Payment rows — undefined when none of them
    // carries a `paymentDate`.
    ...(p.paidAt ? { payoutDate: p.paidAt } : {}),
    ...(p.bankProfile ? { bank: p.bankProfile } : {}),
  }
}

const BILLABLES: ProductionBillable[] = ['internal', 'billable', 'both']
const PROD_STATUSES: ProductionStatus[] = ['pending', 'approved', 'invoiced']

export function productionFromDto(d: ProductionDto): ProductionRecord {
  return {
    id: d.id,
    date: d.date,
    period: d.period,
    clientId: d.clientId ?? '',
    clientName: d.clientName ?? '',
    title: d.title,
    type: d.type,
    responsible: d.responsible ?? '',
    participants: d.participants,
    hours: d.hours,
    viatics: toMajor(d.viaticsMinor),
    totalCost: toMajor(d.totalCostMinor),
    billable: d.billable && (BILLABLES as string[]).includes(d.billable) ? (d.billable as ProductionBillable) : null,
    ...(d.billAmountMinor ? { billAmount: toMajor(d.billAmountMinor) } : {}),
    ...(d.packHours ? { packHours: d.packHours } : {}),
    status: pick(d.status, PROD_STATUSES, 'pending'),
    ...(d.notes ? { notes: d.notes } : {}),
    clientServiceId: d.clientServiceId ?? null,
    receivableId: d.receivableId ?? null,
    accountManagerId: d.accountManagerId ?? null,
    ...(d.accountManagerName ? { accountManagerName: d.accountManagerName } : {}),
    // The content creator is the production's lead — the one row the form writes. A row
    // from before the form picked people by id falls back to its first attribution.
    creatorId: (d.attribution.find((a) => a.role === 'responsible') ?? d.attribution[0])?.teamMemberId ?? null,
    viaticsPaidAt: d.viaticsPaidAt ?? null,
    ...(d.receipt ? { receipt: d.receipt } : {}),
  }
}

const EXPENSE_CATS: ExpenseCategory[] = ['software', 'office', 'services', 'salaries', 'taxes', 'other']
const EXPENSE_RECS: ExpenseRecurrence[] = ['monthly', 'one_time', 'quarterly', 'annual']
const EXPENSE_PAY: ExpensePayStatus[] = ['paid', 'pending']

function expenseFromDto(d: ExpenseDto): FixedExpense {
  return {
    id: d.id,
    concept: d.concept,
    category: pick(d.category, EXPENSE_CATS, 'other'),
    amount: toMajor(d.amountMinor),
    recurrence: pick(d.recurrence, EXPENSE_RECS, 'monthly'),
    ...(d.responsible ? { responsible: d.responsible } : {}),
    ...(d.monotributo && (MONOTRIBUTOS as string[]).includes(d.monotributo)
      ? { monotributo: d.monotributo as Monotributo }
      : {}),
    payStatus: pick(d.payStatus, EXPENSE_PAY, 'pending'),
    affectsProfitability: d.affectsProfitability,
    ...(d.notes ? { notes: d.notes } : {}),
  }
}

const ALERT_SEVS: AlertSeverity[] = ['critical', 'high', 'medium', 'low']
const ALERT_TYPES: AlertType[] = ['cobros', 'facturacion', 'equipo', 'rentabilidad', 'comercial', 'arca']
const ALERT_STATUSES: AlertStatus[] = ['open', 'in_progress', 'resolved']

function alertFromDto(d: AlertDto): MonthlyAlert {
  return {
    id: d.id,
    severity: pick(d.severity, ALERT_SEVS, 'medium'),
    type: pick(d.type, ALERT_TYPES, 'cobros'),
    entity: d.entity,
    description: d.description,
    ...(d.responsible ? { responsible: d.responsible } : {}),
    status: pick(d.status, ALERT_STATUSES, 'open'),
  }
}

function monotributoFromDto(d: PlanBundleDto['monotributo'][number]): MonotributoWatch | null {
  if (!(MONOTRIBUTOS as string[]).includes(d.code)) return null
  return {
    category: d.code as Monotributo,
    annualBilled: toMajor(d.annualBilledMinor),
    annualLimit: toMajor(d.annualLimitMinor),
  }
}

/** Map the plan bundle onto the front MonthlyOperationData view-model. */
export function bundleToMonthData(bundle: PlanBundleDto): MonthlyOperationData {
  const memberById = new Map(bundle.members.map((m) => [m.id, { name: m.name, role: m.role }]))
  // Per-client rollups from the productions: billable amount (feeds the total to
  // bill) and total cost (feeds profitability). Keyed by clientId.
  const prodBillable = new Map<string, number>()
  const prodCost = new Map<string, number>()
  for (const p of bundle.productions) {
    if (!p.clientId) continue
    // A production already on a cobro is inside that cobro's base, which this row reads
    // as its fee. Adding it again here billed it twice in "Total a facturar".
    if ((p.billable === 'billable' || p.billable === 'both') && !p.receivableId) {
      prodBillable.set(p.clientId, (prodBillable.get(p.clientId) ?? 0) + toMajor(p.billAmountMinor))
    }
    // What the people on it were paid AND their viáticos: both are what the shoot cost.
    prodCost.set(p.clientId, (prodCost.get(p.clientId) ?? 0) + toMajor(p.totalCostMinor) + toMajor(p.viaticsMinor))
  }
  // The rollups belong to the CLIENT, and a client can carry several cobros in a month
  // (the retainer plus a one-time anticipo). Attached to every row they were counted once
  // per cobro; they go on ONE row — the generated retainer when there is one.
  const rollupRow = new Map<string, ReceivableDto>()
  for (const r of bundle.receivables) {
    const chosen = rollupRow.get(r.clientId)
    if (!chosen || (r.source === 'monthly_fee' && chosen.source !== 'monthly_fee')) {
      rollupRow.set(r.clientId, r)
    }
  }
  const owns = (r: ReceivableDto) => rollupRow.get(r.clientId)?.id === r.id
  return {
    clients: bundle.receivables.map((r) =>
      clientFromReceivable(
        r,
        owns(r) ? (prodBillable.get(r.clientId) ?? 0) : 0,
        owns(r) ? (prodCost.get(r.clientId) ?? 0) : 0,
      ),
    ),
    team: bundle.payouts.map((p) => payoutFromDto(p, memberById)),
    productions: bundle.productions.map(productionFromDto),
    expenses: bundle.expenses.map(expenseFromDto),
    alerts: bundle.alerts.map(alertFromDto),
    monotributo: bundle.monotributo.map(monotributoFromDto).filter((m): m is MonotributoWatch => m !== null),
    checklist: bundle.checklist as MonthlyOperationData['checklist'],
    // `?? false`, so an API that predates the flag reads as complete — the answer it has
    // always given. Defaulting the other way would raise a close blocker on every month
    // the moment the browser updates ahead of the API.
    truncated: bundle.truncated ?? false,
    // `?? []`, so a browser ahead of the API reads a month with no outflows: what the
    // screen showed before this existed, rather than a crash.
    paymentTotals: (bundle.paymentTotals ?? []).map((t) => ({
      recipientType: t.recipientType as PaymentTotal['recipientType'],
      total: toMajor(t.totalMinor),
      paid: toMajor(t.paidMinor),
      count: t.count,
    })),
    teamPaymentTotals: (bundle.teamPaymentTotals ?? []).map((t) => ({
      teamMemberId: t.teamMemberId,
      total: toMajor(t.totalMinor),
      paid: toMajor(t.paidMinor),
    })),
    payments: (bundle.payments ?? []).map((p) => ({
      id: p.id,
      recipientType: p.recipientType as MonthPayment['recipientType'],
      recipientName: p.recipientName,
      concept: p.concept,
      total: toMajor(p.totalMinor),
      paid: toMajor(p.paidMinor),
      status: p.status,
      expectedDate: p.expectedDate,
      paymentDate: p.paymentDate,
    })),
    otherLanePaymentCount: bundle.otherLanePaymentCount ?? 0,
  }
}
