import type { Currency } from './treasury-mock-data'
import type { ReportPeriod } from './reports-periods'

export type ClientProfitabilityStatus =
  | 'rentable'
  | 'margen_bajo'
  | 'perdida'
  | 'revisar_precio'
  | 'excedido_horas'
  | 'pago_pendiente'

export type TeamCapacityStatus =
  | 'sobrecargada'
  | 'balanceada'
  | 'subutilizada'
  | 'sin_carga'
  | 'sin_capacidad'

export type MetricDelta = {
  absolute: number
  percent: number | null
}

export type SummaryMetric = {
  id: string
  value: number
  delta: MetricDelta | null
}

export type ReportSummary = {
  period: ReportPeriod
  ingresos: number
  egresos: number
  rentabilidad: number
  margenPromedio: number
  horasCargadas: number
  clientesActivos: number
  extrasFueraScopeCount: number
  extrasFueraScopeAmount: number
  otherLaneCount: number
  otherLanePaymentCount: number
}

export type ProductivityReportItem = {
  id: string
  personId: string
  personName: string
  clientId: string
  clientName: string
  taskType: string
  service: string
  hours: number
  date: string
  isExtra: boolean
  clientStatus: string
}

export type ClientProfitabilityReportItem = {
  clientId: string
  clientName: string
  clientType?: string
  service: string
  ingresos: number
  teamCost: number
  productionCost: number
  travelCost: number
  unchargedExtras: number
  costos: number
  rentabilidad: number
  margen: number
  horas: number
  lastIncreaseDate?: string
  monthsSinceIncrease: number | null
  team: string[]
  paymentPending: boolean
  status: ClientProfitabilityStatus
}

export type TeamCapacityReportItem = {
  personId: string
  personName: string
  role: string
  clientsActive: number
  clientNames: string[]
  hoursLogged: number
  capacity: number | null
  utilization: number | null
  personCost: number | null
  costPerHour: number | null
  costedAssignments: number
  totalAssignments: number
  status: TeamCapacityStatus
}

export type StatusBucket = { id: string; label: string; count: number; amount: number }

export type FixedExpenseLine = {
  id: string
  concept: string
  currency: Currency
  amount: number
  paid: boolean
}

export type CollectionDetailRow = {
  id: string
  clientName: string
  service: string
  dueDate: string
  status: string
  statusLabel: string
  currency: Currency
  totalAmount: number
  collectedAmount: number
}

export type PaymentDetailRow = {
  id: string
  recipientName: string
  concept: string
  expectedDate: string
  status: string
  statusLabel: string
  currency: Currency
  totalAmount: number
  paidAmount: number
}

export type BillingDetailRow = {
  id: string
  clientName: string
  billingStatus: string
  billingLabel: string
  currency: Currency
  totalAmount: number
}

export type FinancialOperationsReport = {
  period: ReportPeriod
  totalCobrado: number
  totalPendienteCobro: number
  totalPagadoEquipo: number
  gastosFijos: number
  viaticos: number
  extrasCobrados: number
  extrasPendientes: number
  cobrosPorEstado: StatusBucket[]
  pagosPorEstado: StatusBucket[]
  gastosFijosList: FixedExpenseLine[]
  facturacion: StatusBucket[]
  cobrosDetail: CollectionDetailRow[]
  pagosDetail: PaymentDetailRow[]
  facturacionDetail: BillingDetailRow[]
  otherLaneCount: number
  countsAllLanes: { total: number; collected: number; overdue: number }
}

export type ReportDataset = {
  period: ReportPeriod
  summary: ReportSummary
  productivity: ProductivityReportItem[]
  profitability: ClientProfitabilityReportItem[]
  otherLaneClientCount: number
  unbilledCost: { clientCount: number; cost: number }
  capacity: TeamCapacityReportItem[]
  financials: FinancialOperationsReport
}

export type MarginHistoryPoint = { period: ReportPeriod; label: string; margin: number }
