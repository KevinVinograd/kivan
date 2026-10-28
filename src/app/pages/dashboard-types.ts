/**
 * Owner Dashboard — typed models.
 *
 * The dashboard is read-only: these types describe aggregates derived in
 * `dashboard-data.ts` from existing module data (Reportes derivation layer,
 * Clientes mock, the live Operación mensual store) plus one curated recent
 * activity mock. No record here is authored against a backend; money is stored
 * as numbers, dates as ISO strings, and formatting happens only at render via
 * `dashboard-format.ts`.
 */
import type { MonthId } from './monthly-operation-mock-data'
import type { PaymentStatus } from './clients-mock-data'
import type { ActivityPreviews } from './dashboard-activity-previews'

/** Risk band for a client (§2 risk score: 0-2 / 3-5 / 6+). */
export type RiskLevel = 'saludable' | 'atencion' | 'riesgo_alto'

/** One client's risk row, with the score breakdown reasons (§2). */
export type ClientRisk = {
  clientId: string
  clientName: string
  score: number
  level: RiskLevel
  reasons: string[]
  team: string[]
  /** Latest meeting/feedback date (ISO), for the "last touch" line. */
  lastTouchIso?: string
  daysSinceTouch: number | null
  marginPercent: number | null
  paymentStatus: PaymentStatus
}

/** The 5 owner-health KPIs (§1). A `null` figure renders the "No disponible" state. */
export type HealthKpis = {
  clientsAtRisk: number
  clientsInAttention: number
  ingresosRegistrados: number | null
  paidClients: number | null
  totalClients: number | null
  marginPercent: number | null
  estimatedProfit: number | null
  operationCompletion: number
  pendingDataItems: number
  overloadedTeam: number
  /** People with no hours loaded at all. `null` when the month has no report behind it. */
  teamMissingHours: number | null
}

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low'

/** One critical alert (§3), already resolved to a title, severity and CTA target. */
export type DashboardAlert = {
  id: string
  title: string
  description: string
  severity: AlertSeverity
  entity: string
  ctaLabel: string
  ctaHref: string
}

/** One row of the monthly-operation status card (§4). */
export type OperationLine = {
  id: string
  label: string
  value: string
  tone: 'default' | 'success' | 'warning'
}

/** Monthly-operation close-readiness snapshot (§4). */
export type OperationStatus = {
  completion: number
  pendingItems: number
  lines: OperationLine[]
  monthLabel: string
}

export type MarginBand = 'high' | 'medium' | 'low'

/** One client in the best/low margin lists (§5). */
export type MarginClient = {
  clientId: string
  clientName: string
  marginPercent: number
  band: MarginBand
}

/** Compact financial snapshot (§5). */
export type ProfitabilitySnapshot = {
  ingresos: number
  /**
   * The period's registered outflows. Carried so the section can tell "the studio made
   * money" from "no pago has been loaded yet": `estimatedResult` is `ingresos - egresos`,
   * so with no pagos it IS the revenue, and tinting that green states a result the data
   * cannot support.
   */
  egresos: number
  teamCost: number
  fixedExpenses: number
  estimatedResult: number
  marginPercent: number
  /**
   * Live operations of the period that are NOT in pesos. Every figure above is the peso
   * lane alone, because `estimatedResult` is `ingresos - egresos` and a dollar cobro
   * counted at face value against peso costs moves it by roughly the exchange rate. A
   * COUNT rather than an amount: there is no honest total across lanes.
   */
  otherLaneCount: number
  /** Of those, the PAGOS — what decides whether "no hay egresos" or "no hay egresos EN
   *  PESOS" is the true sentence. The combined count would assert outflows in another
   *  lane on a month whose only foreign money was a cobro. */
  otherLanePaymentCount: number
  bestMargin: MarginClient[]
  lowMargin: MarginClient[]
}

export type PaymentRowStatus = 'pendiente' | 'vencido' | 'pagado' | 'parcial'

/** One pending-payment row (§6). */
export type PendingPaymentRow = {
  clientId: string
  clientName: string
  amount: number
  status: PaymentRowStatus
  dueIso?: string
  overdueDays: number | null
}

/** Pending-payments summary (§6). */
export type PendingPayments = {
  /** PESOS. `rows` too — they carry amounts, and a peso "$" over a dollar figure is the
   *  defect this whole area exists to remove. */
  totalExpected: number
  totalCollected: number
  totalPending: number
  /** EVERY lane, unlike the figures above: this is what turns the tile red, and an
   *  overdue cobro is overdue whatever it is billed in. */
  overdueClients: number
  rows: PendingPaymentRow[]
  /** Live cobros of the month in another lane, so absent from `rows` and from the peso
   *  figures. Named on screen rather than folded in. */
  otherLaneCount: number
}

export type TeamLoadStatus = 'alta' | 'normal' | 'baja' | 'sin_carga'

/** One team member's load row (§7). */
export type TeamLoadMember = {
  personId: string
  personName: string
  hours: number
  /** Estimated/stipulated monthly capacity in hours (source: `report.capacity`), or
   *  null when nobody configured one for this person — rendered as "sin definir",
   *  never as "0 h estipuladas". */
  capacity: number | null
  clientsCount: number
  status: TeamLoadStatus
  relatedRisk?: string
}

/** Team-load snapshot (§7). */
export type TeamLoad = {
  totalHours: number
  averageHours: number
  overloaded: number
  underloaded: number
  missingHours: number
  members: TeamLoadMember[]
}

// ── Actividad reciente (§8) ──────────────────────────────────────────────────
/** Activity event kind — the timeline maps each to a registered leading icon. */
export type DashboardActivityKind = 'cobro' | 'horas' | 'viatico' | 'feedback' | 'facturacion' | 'banco'

/**
 * An entity referenced in an activity line. `client` and `member` render as
 * hover link-text with a preview + "Ver perfil"; `plain` (e.g. a production,
 * which has no profile page) renders as static text.
 */
export type DashboardActivityEntity =
  | { kind: 'client'; id: string; name: string }
  | { kind: 'member'; id: string; name: string; role: string }
  | { kind: 'plain'; name: string }

/** One recent-activity entry: actor + action + context, newest first (§8). */
export type ActivityItem = {
  id: string
  activity: DashboardActivityKind
  actor: DashboardActivityEntity
  /** Connecting verb phrase between actor and context, e.g. "registró el cobro de". */
  action: string
  context: DashboardActivityEntity
  iso: string
}

/** Everything the Owner Dashboard renders for one month. */
export type DashboardData = {
  monthId: MonthId
  monthLabel: string
  /** False when the selected month has no loaded data (drives the empty state). */
  hasData: boolean
  kpis: HealthKpis
  risks: ClientRisk[]
  alerts: DashboardAlert[]
  operation: OperationStatus
  profitability: ProfitabilitySnapshot | null
  payments: PendingPayments | null
  teamLoad: TeamLoad | null
  activity: ActivityItem[]
  /** Per-id lookups enriching the recent-activity entity previews. */
  activityPreviews: ActivityPreviews
}
