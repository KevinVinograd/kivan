/**
 * Admin / Operations Dashboard — derivation orchestrator + lighter builders.
 *
 * Pure, read-only assembly of every admin aggregate for one month. It composes
 * two existing sources: the live Operación mensual record (per-month operational
 * state: clients/cobros, team/pagos, productions/viáticos, expenses, alerts,
 * monotributo, checklist) and the Reportes capacity derivation (per-person
 * expected vs. logged hours). Recent activity comes from the shared dashboard
 * mock. Nothing here mutates, calls a backend, or fakes a delay.
 *
 * The heavier section builders (§2 pendientes, §5 pagos, §7 facturación) live in
 * `admin-dashboard-pendientes-data.ts`; this file owns the orchestrator plus the
 * §1 / §3 / §4 / §6 / §8 builders. CTA routing comes from `admin-dashboard-routes`.
 */
import {
  CHECKLIST_ITEMS,
  type ClientMonth,
  type ExpenseCategory,
  type MonthRecord,
  type ProductionRecord,
} from './monthly-operation-mock-data'
import { withDashboardTrail } from './dashboard-trail'
import { bankComplete, clientTotalToBill, payoutTotal, pctDelta, summarize } from './monthly-operation-format'
import { getReportData, type ReportInputs } from './reports-data'
import type { ReportDataset } from './reports-types'
import { monthIdToPeriod } from './dashboard-data'
import { buildActivityPreviews } from './dashboard-activity-previews'
import type {
  AdminDashboardData,
  BillingAndArca,
  ClientCollections,
  CloseSummaryKpi,
  CollectionStatus,
  FixedExpensesSummary,
  HoursCompleteness,
  ProductionsAndExpenses,
  TeamPayments,
  ViaticoStatus,
} from './admin-dashboard-types'
import { ROUTE } from './admin-dashboard-routes'
import { buildBilling, buildPendings, buildTeamPayments } from './admin-dashboard-pendientes-data'

const sum = <T,>(items: T[], pick: (item: T) => number) => items.reduce((t, i) => t + pick(i), 0)
const ratioPct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

// ── §3 Horas y productividad ─────────────────────────────────────────────────
function buildHours(report: ReportDataset | null): HoursCompleteness | null {
  if (!report) return null
  // "How complete are this month's hours" is only answerable for people who have a
  // stipulated capacity to be measured against. Members without one are excluded, and if
  // nobody has one there is nothing to report — the card shows its "No disponible" state
  // rather than a 0%-complete verdict derived from capacities that were never set.
  const measurable = report.capacity.filter(
    (member): member is typeof member & { capacity: number } => member.capacity != null,
  )
  if (measurable.length === 0) return null
  const rows = measurable
    .map((member) => {
      const missing = Math.max(0, member.capacity - member.hoursLogged)
      const ratio = member.capacity > 0 ? member.hoursLogged / member.capacity : 0
      const status = member.hoursLogged <= 0 ? 'sin_carga' : ratio >= 0.95 ? 'completo' : 'incompleto'
      return {
        personId: member.personId,
        personName: member.personName,
        expected: member.capacity,
        loaded: member.hoursLogged,
        missing,
        clients: member.clientNames,
        status,
        ctaHref: withDashboardTrail(ROUTE.operacionEstado),
      } as const
    })
    .sort((a, b) => b.missing - a.missing)
  const incomplete = rows.filter((row) => row.status !== 'completo')
  const expectedHours = sum(rows, (row) => row.expected)
  const loadedHours = sum(rows, (row) => row.loaded)
  return {
    expectedHours,
    loadedHours,
    completionPercent: ratioPct(loadedHours, expectedHours),
    peopleMissing: incomplete.length,
    clientsIncomplete: new Set(incomplete.flatMap((row) => row.clients)).size,
    rows,
  }
}

// ── §4 Producciones y viáticos ───────────────────────────────────────────────
/** Whether the viático was paid back — HOLD pays them within the week, billed or not. */
function viaticoStatus(production: ProductionRecord): ViaticoStatus {
  if (production.viatics <= 0) return 'sin_cargar'
  return production.viaticsPaidAt ? 'pagado' : 'sin_pagar'
}

function buildProductions(productions: ProductionRecord[]): ProductionsAndExpenses {
  const pendingViatics = productions.filter((p) => p.viatics > 0 && !p.viaticsPaidAt)
  const rows = productions
    .filter((p) => p.status !== 'invoiced')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6)
    .map((p) => ({
      id: p.id,
      title: p.title,
      clientName: p.clientName || 'Sin cliente',
      dateIso: p.date,
      people: p.participants,
      viaticoStatus: viaticoStatus(p),
      amount: p.viatics > 0 ? p.viatics : null,
      // Land on the Producciones tab: the row IS a production, so dropping the reader on
      // Pagos to go find it is the friction this param removes.
      ctaHref: withDashboardTrail(`${ROUTE.operacionEquipo}&view=producciones`),
    }))
  return {
    total: productions.length,
    closed: productions.filter((p) => p.status === 'invoiced').length,
    withPendingViatics: pendingViatics.length,
    viaticsLoaded: sum(productions, (p) => p.viatics),
    viaticsUnvalidated: sum(pendingViatics, (p) => p.viatics),
    viaticsUnvalidatedCount: pendingViatics.length,
    rows,
  }
}

// ── §6 Cobros de clientes ────────────────────────────────────────────────────
function collectionStatus(client: ClientMonth): CollectionStatus {
  if (client.paymentStatus === 'paid') return 'pagado'
  if (client.paymentStatus === 'overdue') return 'vencido'
  if (client.paymentStatus === 'partial') return 'pendiente'
  return client.paidAmount > 0 ? 'pendiente' : 'sin_registrar'
}

function buildCollections(clients: ClientMonth[], totals: ReturnType<typeof summarize>): ClientCollections {
  const active = clients.filter((client) => client.monthStatus !== 'churned')
  const rows = active
    .filter((client) => client.paymentStatus !== 'paid' && clientTotalToBill(client) > 0)
    .map((client) => ({
      clientId: client.clientId,
      clientName: client.name,
      amount: clientTotalToBill(client) - client.paidAmount,
      status: collectionStatus(client),
      overdueDays: null,
      ctaHref: withDashboardTrail(`${ROUTE.operacionClientes}&open=${client.clientId}`),
    }))
    .sort((a, b) => Number(b.status === 'vencido') - Number(a.status === 'vencido') || b.amount - a.amount)
    .slice(0, 5)
  return {
    totalExpected: totals.totalToCollect,
    totalCollected: totals.collected,
    totalPending: totals.pendingToCollect,
    overdue: active.filter((client) => client.paymentStatus === 'overdue').length,
    unregistered: active.filter((c) => c.paymentStatus === 'pending' && c.paidAmount <= 0).length,
    rows,
  }
}

// ── §8 Gastos fijos ──────────────────────────────────────────────────────────
const EXPENSE_CATEGORY_TO_ADMIN: Record<ExpenseCategory, string> = {
  software: 'Plataforma',
  taxes: 'Monotributo',
  services: 'Externo',
  salaries: 'Empleado fijo',
  office: 'Otro',
  other: 'Otro',
}

function buildExpenses(record: MonthRecord, previousExpected: number | null): FixedExpensesSummary {
  const expenses = record.data.expenses
  const expected = sum(expenses, (e) => e.amount)
  const rows = expenses.slice(0, 6).map((expense) => ({
    id: expense.id,
    concept: expense.concept,
    // A studio-defined category has no built-in mapping; show what the studio called it
    // rather than dropping the row into a bucket it did not choose.
    category: EXPENSE_CATEGORY_TO_ADMIN[expense.category as ExpenseCategory] ?? expense.category,
    amount: expense.amount,
    status: expense.payStatus === 'paid' ? ('registrado' as const) : ('pendiente' as const),
    ctaHref: withDashboardTrail(`${ROUTE.operacionEquipo}&view=gastos`),
  }))
  return {
    expected,
    registered: sum(expenses.filter((e) => e.payStatus === 'paid'), (e) => e.amount),
    pending: sum(expenses.filter((e) => e.payStatus === 'pending'), (e) => e.amount),
    variationPercent: previousExpected != null ? pctDelta(expected, previousExpected) : null,
    rows,
  }
}

/** Count of the monthly-close validations currently failing (close blockers). */
function closeBlockerCount(record: MonthRecord): number {
  const { clients, team, productions, alerts } = record.data
  let count = 0
  if (team.some((p) => payoutTotal(p) > 0 && !bankComplete(p))) count += 1
  if (productions.some((p) => !p.clientId)) count += 1
  if (productions.some((p) => p.status === 'approved' && p.billable == null)) count += 1
  if (alerts.some((a) => a.severity === 'critical' && a.status !== 'resolved')) count += 1
  if (clients.some((c) => (c.monthStatus === 'new' || c.monthStatus === 'churned') && !c.effectiveDate)) count += 1
  return count
}

// ── §1 Resumen del cierre (4 KPI cards) ──────────────────────────────────────
function buildKpis(
  record: MonthRecord,
  hours: HoursCompleteness | null,
  productions: ProductionsAndExpenses,
  teamPayments: TeamPayments,
  billing: BillingAndArca,
): CloseSummaryKpi[] {
  const checked = CHECKLIST_ITEMS.filter((item) => record.data.checklist[item.id]).length
  const pendingItems = CHECKLIST_ITEMS.length - checked
  const completion = ratioPct(checked, CHECKLIST_ITEMS.length)
  const blockers = closeBlockerCount(record)

  const productionsNotClosed = record.data.productions.filter(
    (p) => (p.clientId === '' || p.billable == null) && !(p.viatics > 0 && p.status !== 'invoiced'),
  ).length
  const clientsPendingReview = record.data.clients.filter((c) => c.monthStatus === 'pending_review').length
  const datosPendientes =
    (hours?.peopleMissing ?? 0) + productions.viaticsUnvalidatedCount + productionsNotClosed + clientsPendingReview

  const billingPending = billing.invoicesPending + billing.monotributosAlert
  const billingNearLimit = (billing.usageEstimate ?? 0) >= 95

  return [
    {
      id: 'cierre',
      label: 'Estado del cierre',
      value: `${completion}%`,
      supporting: `${pendingItems} pendientes para cerrar el mes`,
      tone: blockers > 0 ? 'critical' : pendingItems > 0 ? 'warning' : 'success',
      ctaLabel: 'Continuar carga',
      ctaHref: withDashboardTrail(ROUTE.operacionEstado),
    },
    {
      id: 'datos',
      label: 'Datos pendientes',
      value: String(datosPendientes),
      supporting: 'Horas, viáticos, extras o datos faltantes',
      tone: datosPendientes > 0 ? 'warning' : 'success',
      ctaLabel: 'Ver pendientes',
      ctaHref: withDashboardTrail(ROUTE.operacionEstado),
    },
    {
      id: 'pagos',
      label: 'Pagos bloqueados',
      value: String(teamPayments.blocked),
      supporting: 'Por horas, CBU o validaciones faltantes',
      tone: teamPayments.blocked > 0 ? 'critical' : 'success',
      ctaLabel: 'Resolver pagos',
      ctaHref: withDashboardTrail(ROUTE.operacionEquipo),
    },
    {
      id: 'facturacion',
      label: 'Facturación pendiente',
      value: String(billingPending),
      supporting: 'Clientes o monotributos por revisar',
      tone: billingNearLimit ? 'critical' : billingPending > 0 ? 'warning' : 'success',
      ctaLabel: 'Revisar facturación',
      ctaHref: withDashboardTrail(ROUTE.facturacion),
    },
  ]
}

/** Build the full admin dashboard dataset for one Operación mensual month record.
 *  `reportInputs` carries the real profitability/capacity aggregates the page fetches from
 *  the owner+admin `/reports/*` endpoints; without them the report's capacity is empty and
 *  the "Horas y productividad" card can only report "No disponible". The admin holds both
 *  capabilities (money parity with the owner), so both are passed. */
export function getAdminDashboardData(
  record: MonthRecord,
  previous?: MonthRecord,
  reportInputs?: Pick<ReportInputs, 'profitability' | 'capacity'>,
): AdminDashboardData {
  const period = monthIdToPeriod(record.id)
  const report = period
    ? getReportData(period, {
        receivables: [],
        payments: [],
        profitability: reportInputs?.profitability,
        capacity: reportInputs?.capacity,
      })
    : null
  const data = record.data
  const totals = summarize(data)

  const hours = buildHours(report)
  const productions = buildProductions(data.productions)
  const missingHoursNames = new Set((hours?.rows ?? []).filter((r) => r.status !== 'completo').map((r) => r.personName))
  const viaticPeople = new Set(
    data.productions
      .filter((p) => p.viatics > 0 && p.status !== 'invoiced')
      .flatMap((p) => [p.responsible, ...p.participants]),
  )
  const teamPayments = buildTeamPayments(data.team, totals, missingHoursNames, viaticPeople)
  const collections = buildCollections(data.clients, totals)
  const billing = buildBilling(record)
  const previousExpected = previous ? sum(previous.data.expenses, (e) => e.amount) : null
  const expenses = buildExpenses(record, previousExpected)

  return {
    monthId: record.id,
    monthLabel: record.label,
    hasData: data.clients.length > 0 || data.team.length > 0 || data.productions.length > 0,
    kpis: buildKpis(record, hours, productions, teamPayments, billing),
    pendings: buildPendings(record, hours, billing),
    hours,
    productions,
    teamPayments,
    collections,
    billing,
    expenses,
    // No backend activity-feed source yet — the rail shows its honest empty state.
    activity: [],
    activityPreviews: buildActivityPreviews(report),
  }
}
