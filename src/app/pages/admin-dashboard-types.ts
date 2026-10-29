import type { MonthId } from './monthly-operation-mock-data'
import type { ActivityItem } from './dashboard-types'
import type { ActivityPreviews } from './dashboard-activity-previews'

export type AdminSeverity = 'alta' | 'media' | 'baja'

export type CloseTone = 'success' | 'warning' | 'critical'

export type CloseSummaryKpiId = 'cierre' | 'datos' | 'pagos' | 'facturacion'

export type CloseSummaryKpi = {
  id: CloseSummaryKpiId
  label: string
  value: string | null
  supporting: string
  tone: CloseTone
  ctaLabel: string
  ctaHref: string
}

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

export type HoursPersonStatus = 'completo' | 'incompleto' | 'sin_carga'

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

export type HoursCompleteness = {
  expectedHours: number
  loadedHours: number
  completionPercent: number
  peopleMissing: number
  clientsIncomplete: number
  rows: HoursPersonRow[]
}

export type ViaticoStatus = 'sin_cargar' | 'sin_pagar' | 'pagado'

export type ProductionRow = {
  id: string
  title: string
  clientName: string
  dateIso: string
  people: string[]
  viaticoStatus: ViaticoStatus
  amount: number | null
  ctaHref: string
}

export type ProductionsAndExpenses = {
  total: number
  closed: number
  withPendingViatics: number
  viaticsLoaded: number
  viaticsUnvalidated: number
  viaticsUnvalidatedCount: number
  rows: ProductionRow[]
}

export type TeamPayStatus = 'listo' | 'pendiente' | 'bloqueado' | 'pagado'

export type TeamPayRow = {
  payoutId: string
  personName: string
  amount: number
  status: TeamPayStatus
  blocker: string | null
  ctaHref: string
}

export type TeamPayments = {
  totalToPay: number
  paid: number
  pending: number
  blocked: number
  missingBank: number
  rows: TeamPayRow[]
}

export type CollectionStatus = 'pagado' | 'pendiente' | 'vencido' | 'sin_registrar'

export type CollectionRow = {
  clientId: string
  clientName: string
  amount: number
  status: CollectionStatus
  dueIso?: string
  overdueDays: number | null
  ctaHref: string
}

export type ClientCollections = {
  totalExpected: number
  totalCollected: number
  totalPending: number
  overdue: number
  unregistered: number
  rows: CollectionRow[]
}

export type MonotributoAlert = 'normal' | 'atencion' | 'limite'

export type MonotributoRow = {
  id: string
  label: string
  usagePercent: number
  billed: number
  alert: MonotributoAlert
  ctaHref: string
}

export type BillingItemStatus = 'pendiente' | 'revisado' | 'bloqueado'

export type BillingItemRow = {
  clientId: string
  clientName: string
  amount: number
  monotributo?: string
  status: BillingItemStatus
  ctaHref: string
}

export type BillingAndArca = {
  invoicesPending: number
  invoicesReviewed: number
  monotributosActive: number
  monotributosAlert: number
  usageEstimate: number | null
  monotributos: MonotributoRow[]
  items: BillingItemRow[]
}

export type ExpenseStatus = 'registrado' | 'pendiente' | 'vencido'

export type FixedExpenseRow = {
  id: string
  concept: string
  category: string
  amount: number
  status: ExpenseStatus
  ctaHref: string
}

export type FixedExpensesSummary = {
  expected: number
  registered: number
  pending: number
  variationPercent: number | null
  rows: FixedExpenseRow[]
}

export type AdminDashboardData = {
  monthId: MonthId
  monthLabel: string
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
  activityPreviews: ActivityPreviews
}
