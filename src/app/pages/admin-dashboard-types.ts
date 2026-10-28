/**
 * Admin / Operations Dashboard — typed models.
 *
 * The admin dashboard is a read-only monthly-close control center: these types
 * describe aggregates derived in `admin-dashboard-data.ts` from existing module
 * data (the live Operación mensual store + the Reportes capacity derivation) plus
 * the shared recent-activity mock. No record here is authored against a backend;
 * money is stored as numbers, dates as ISO strings, and formatting happens only
 * at render via `admin-dashboard-format.ts`. CTA targets are resolved in the data
 * layer (one central routing map) so sections stay presentation-only.
 */
import type { MonthId } from './monthly-operation-mock-data'
import type { ActivityItem } from './dashboard-types'
import type { ActivityPreviews } from './dashboard-activity-previews'

/** Operational severity for a pending item (§2). Maps to a Badge variant. */
export type AdminSeverity = 'alta' | 'media' | 'baja'

/** Close-readiness tone for a KPI (§1). `critical` blocks the close. */
export type CloseTone = 'success' | 'warning' | 'critical'

// ── §1 Resumen del cierre (4 KPI cards) ──────────────────────────────────────
export type CloseSummaryKpiId = 'cierre' | 'datos' | 'pagos' | 'facturacion'

/** One §1 KPI card: a figure with supporting text and an explicit CTA. */
export type CloseSummaryKpi = {
  id: CloseSummaryKpiId
  label: string
  /** Formatted figure, or `null` for the "No disponible" incomplete state. */
  value: string | null
  supporting: string
  tone: CloseTone
  ctaLabel: string
  ctaHref: string
}

// ── §2 Pendientes críticos ───────────────────────────────────────────────────
export type PendingType =
  | 'horas'
  | 'viaticos'
  | 'extra'
  | 'pago'
  | 'banco'
  | 'cobro'
  | 'facturacion'
  | 'arca'
  | 'gasto'
  | 'produccion'

/** One prioritized operational blocker (§2). */
export type OperationPending = {
  id: string
  title: string
  description: string
  type: PendingType
  severity: AdminSeverity
  responsible?: string
  entity: string
  ctaLabel: string
  ctaHref: string
}

// ── §3 Horas y productividad ─────────────────────────────────────────────────
export type HoursPersonStatus = 'completo' | 'incompleto' | 'sin_carga'

/** One person's hour-loading row (§3). */
export type HoursPersonRow = {
  personId: string
  personName: string
  expected: number
  loaded: number
  missing: number
  clients: string[]
  status: HoursPersonStatus
  ctaHref: string
}

/** Hours-completeness snapshot (§3). `null` when the month has no Reportes period. */
export type HoursCompleteness = {
  expectedHours: number
  loadedHours: number
  completionPercent: number
  peopleMissing: number
  clientsIncomplete: number
  rows: HoursPersonRow[]
}

// ── §4 Producciones y viáticos ───────────────────────────────────────────────
export type ViaticoStatus = 'sin_cargar' | 'sin_pagar' | 'pagado'

/** One production row needing attention (§4). */
export type ProductionRow = {
  id: string
  title: string
  clientName: string
  dateIso: string
  people: string[]
  viaticoStatus: ViaticoStatus
  /** Viáticos amount, or `null` when none are loaded. */
  amount: number | null
  ctaHref: string
}

/** Productions + viáticos snapshot (§4). Folds the §1 "viáticos sin validar" count. */
export type ProductionsAndExpenses = {
  total: number
  closed: number
  withPendingViatics: number
  viaticsLoaded: number
  viaticsUnvalidated: number
  /** Count of entries with viáticos still to validate (the folded §1 metric). */
  viaticsUnvalidatedCount: number
  rows: ProductionRow[]
}

// ── §5 Pagos al equipo ───────────────────────────────────────────────────────
export type TeamPayStatus = 'listo' | 'pendiente' | 'bloqueado' | 'pagado'

/** One team-payment row (§5). `blocker` is the human reason label or `null`. */
export type TeamPayRow = {
  payoutId: string
  personName: string
  amount: number
  status: TeamPayStatus
  blocker: string | null
  ctaHref: string
}

/** Team-payments snapshot (§5). */
export type TeamPayments = {
  totalToPay: number
  paid: number
  pending: number
  blocked: number
  missingBank: number
  rows: TeamPayRow[]
}

// ── §6 Cobros de clientes ────────────────────────────────────────────────────
export type CollectionStatus = 'pagado' | 'pendiente' | 'vencido' | 'sin_registrar'

/** One client-collection row (§6). */
export type CollectionRow = {
  clientId: string
  clientName: string
  amount: number
  status: CollectionStatus
  dueIso?: string
  overdueDays: number | null
  ctaHref: string
}

/** Client-collections snapshot (§6). */
export type ClientCollections = {
  totalExpected: number
  totalCollected: number
  totalPending: number
  overdue: number
  unregistered: number
  rows: CollectionRow[]
}

// ── §7 Facturación y ARCA ────────────────────────────────────────────────────
export type MonotributoAlert = 'normal' | 'atencion' | 'limite'

/** One monotributo usage row (§7). Three accounts back the agency's invoicing. */
export type MonotributoRow = {
  id: string
  label: string
  usagePercent: number
  billed: number
  alert: MonotributoAlert
  ctaHref: string
}

export type BillingItemStatus = 'pendiente' | 'revisado' | 'bloqueado'

/** One pending billing item (§7). */
export type BillingItemRow = {
  clientId: string
  clientName: string
  amount: number
  monotributo?: string
  status: BillingItemStatus
  ctaHref: string
}

/** Billing + ARCA snapshot (§7). */
export type BillingAndArca = {
  invoicesPending: number
  invoicesReviewed: number
  monotributosActive: number
  monotributosAlert: number
  /** Highest category usage (the binding constraint), or `null` when unknown. */
  usageEstimate: number | null
  monotributos: MonotributoRow[]
  items: BillingItemRow[]
}

// ── §8 Gastos fijos ──────────────────────────────────────────────────────────
export type ExpenseStatus = 'registrado' | 'pendiente' | 'vencido'

/** One fixed-expense row (§8). */
export type FixedExpenseRow = {
  id: string
  concept: string
  category: string
  amount: number
  status: ExpenseStatus
  ctaHref: string
}

/** Fixed-expenses snapshot (§8). */
export type FixedExpensesSummary = {
  expected: number
  registered: number
  pending: number
  /** Percent change vs. the previous month, or `null` when there is no base. */
  variationPercent: number | null
  rows: FixedExpenseRow[]
}

// ── Full dataset ─────────────────────────────────────────────────────────────
/** Everything the Admin / Operations Dashboard renders for one month. */
export type AdminDashboardData = {
  monthId: MonthId
  monthLabel: string
  /** False when the selected month has no loaded data (drives the empty state). */
  hasData: boolean
  kpis: CloseSummaryKpi[]
  pendings: OperationPending[]
  hours: HoursCompleteness | null
  productions: ProductionsAndExpenses
  teamPayments: TeamPayments
  collections: ClientCollections
  billing: BillingAndArca
  expenses: FixedExpensesSummary
  activity: ActivityItem[]
  /** Per-id lookups enriching the recent-activity entity previews. */
  activityPreviews: ActivityPreviews
}
