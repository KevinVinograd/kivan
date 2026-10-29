import type { MonthId } from './monthly-operation-mock-data'
import type { PaymentStatus } from './clients-mock-data'
import type { ActivityPreviews } from './dashboard-activity-previews'

export type RiskLevel = 'saludable' | 'atencion' | 'riesgo_alto'

export type ClientRisk = {
  clientId: string
  clientName: string
  score: number
  level: RiskLevel
  reasons: string[]
  team: string[]
  lastTouchIso?: string
  daysSinceTouch: number | null
  marginPercent: number | null
  paymentStatus: PaymentStatus
}

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
  teamMissingHours: number | null
}

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low'

export type DashboardAlert = {
  id: string
  title: string
  description: string
  severity: AlertSeverity
  entity: string
  ctaLabel: string
  ctaHref: string
}

export type OperationLine = {
  id: string
  label: string
  value: string
  tone: 'default' | 'success' | 'warning'
}

export type OperationStatus = {
  completion: number
  pendingItems: number
  lines: OperationLine[]
  monthLabel: string
}

export type MarginBand = 'high' | 'medium' | 'low'

export type MarginClient = {
  clientId: string
  clientName: string
  marginPercent: number
  band: MarginBand
}

export type ProfitabilitySnapshot = {
  ingresos: number
  egresos: number
  teamCost: number
  fixedExpenses: number
  estimatedResult: number
  marginPercent: number
  otherLaneCount: number
  otherLanePaymentCount: number
  bestMargin: MarginClient[]
  lowMargin: MarginClient[]
}

export type PaymentRowStatus = 'pendiente' | 'vencido' | 'pagado' | 'parcial'

export type PendingPaymentRow = {
  clientId: string
  clientName: string
  amount: number
  status: PaymentRowStatus
  dueIso?: string
  overdueDays: number | null
}

export type PendingPayments = {
  totalExpected: number
  totalCollected: number
  totalPending: number
  overdueClients: number
  rows: PendingPaymentRow[]
  otherLaneCount: number
}

export type TeamLoadStatus = 'alta' | 'normal' | 'baja' | 'sin_carga'

export type TeamLoadMember = {
  personId: string
  personName: string
  hours: number
  capacity: number | null
  clientsCount: number
  status: TeamLoadStatus
  relatedRisk?: string
}

export type TeamLoad = {
  totalHours: number
  averageHours: number
  overloaded: number
  underloaded: number
  missingHours: number
  members: TeamLoadMember[]
}

export type DashboardActivityKind = 'cobro' | 'horas' | 'viatico' | 'feedback' | 'facturacion' | 'banco'

export type DashboardActivityEntity =
  | { kind: 'client'; id: string; name: string }
  | { kind: 'member'; id: string; name: string; role: string }
  | { kind: 'plain'; name: string }

export type ActivityItem = {
  id: string
  activity: DashboardActivityKind
  actor: DashboardActivityEntity
  action: string
  context: DashboardActivityEntity
  iso: string
}

export type DashboardData = {
  monthId: MonthId
  monthLabel: string
  hasData: boolean
  kpis: HealthKpis
  risks: ClientRisk[]
  alerts: DashboardAlert[]
  operation: OperationStatus
  profitability: ProfitabilitySnapshot | null
  payments: PendingPayments | null
  teamLoad: TeamLoad | null
  activity: ActivityItem[]
  activityPreviews: ActivityPreviews
}
