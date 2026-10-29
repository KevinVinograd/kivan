import type {
  ClientProfitabilityDto,
  MarginHistoryPointDto,
  MemberCapacityDto,
} from '@/api/reports'
import type { CollectionStatus, BillingStatus, Receivable } from './cobros-mock-data'
import { toMajor } from '@/lib/money'
import type { PaymentStatus, Payment } from './pagos-mock-data'
import type { ReportPeriod } from './reports-periods'
import type {
  ClientProfitabilityReportItem,
  ClientProfitabilityStatus,
  FinancialOperationsReport,
  FixedExpenseLine,
  MarginHistoryPoint,
  ProductivityReportItem,
  ReportDataset,
  ReportSummary,
  StatusBucket,
  TeamCapacityReportItem,
  TeamCapacityStatus,
} from './reports-types'

const COLLECTION_LABEL: Record<CollectionStatus, string> = {
  pending: 'Pendiente',
  collected: 'Cobrado',
  partial: 'Parcial',
  overdue: 'Vencido',
  cancelled: 'Cancelado',
}
const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  paid: 'Pagado',
  partial: 'Parcial',
  overdue: 'Vencido',
  cancelled: 'Cancelado',
}
const BILLING_LABEL: Record<BillingStatus, string> = {
  no_invoice: 'Sin factura',
  pending: 'Pendiente',
  invoiced: 'Facturado',
  sent: 'Enviado',
  error_arca: 'Error ARCA',
  manual: 'Manual',
  not_required: 'No requiere',
}

const sum = <T,>(items: T[], pick: (item: T) => number) => items.reduce((t, i) => t + pick(i), 0)

function profitabilityStatusOf(
  margen: number,
  monthsSinceIncrease: number | null,
  teamCost: number,
  ingresos: number,
  paymentPending: boolean,
): ClientProfitabilityStatus {
  if (margen < 0) return 'perdida'
  if (margen < 22) return 'margen_bajo'
  if (monthsSinceIncrease !== null && monthsSinceIncrease >= 14) return 'revisar_precio'
  if (ingresos > 0 && teamCost > ingresos * 0.7) return 'excedido_horas'
  if (paymentPending) return 'pago_pendiente'
  return 'rentable'
}

function capacityStatusOf(hoursLogged: number, utilization: number | null): TeamCapacityStatus {
  if (utilization == null) return 'sin_capacidad'
  if (hoursLogged <= 0) return 'sin_carga'
  if (utilization > 1) return 'sobrecargada'
  if (utilization < 0.6) return 'subutilizada'
  return 'balanceada'
}

export function mapApiProfitability(byClient: ClientProfitabilityDto[]): ClientProfitabilityReportItem[] {
  return byClient.map((c) => {
    const ingresos = toMajor(c.billedMinor)
    const productionCost = toMajor(c.costProductionMinor)
    const travelCost = toMajor(c.costViaticsMinor)
    const teamCost =
      toMajor(c.costTeamMinor ?? '0') +
      toMajor(c.costDesignMinor) +
      toMajor(c.costCommMinor) +
      toMajor(c.costPautaMinor) +
      toMajor(c.costFixedMinor)
    const costos = toMajor(c.costTotalMinor)
    const rentabilidad = toMajor(c.marginMinor)
    const margen = c.marginPct
    const paymentPending = Number(c.collectedMinor) < Number(c.billedMinor)
    return {
      clientId: c.clientId,
      clientName: c.clientName,
      service: 'General',
      ingresos,
      teamCost,
      productionCost,
      travelCost,
      unchargedExtras: 0,
      costos,
      rentabilidad,
      margen,
      horas: 0,
      monthsSinceIncrease: null,
      team: [],
      paymentPending,
      status: profitabilityStatusOf(margen, null, teamCost, ingresos, paymentPending),
    }
  })
}

export function mapApiCapacity(members: MemberCapacityDto[]): TeamCapacityReportItem[] {
  return members.map((m) => {
    const hoursLogged = m.hoursAllocated
    const capacity = m.capacityHours ?? null
    const utilization =
      m.utilizationPct != null
        ? m.utilizationPct / 100
        : capacity != null && capacity > 0
          ? hoursLogged / capacity
          : null
    const personCost = m.teamCostMinor == null ? null : toMajor(m.teamCostMinor)
    return {
      personId: m.personId,
      personName: m.personName,
      role: m.role,
      clientsActive: m.clientsActive,
      clientNames: m.clientNames,
      hoursLogged,
      capacity,
      utilization,
      personCost,
      costPerHour: personCost != null && hoursLogged > 0 ? personCost / hoursLogged : null,
      costedAssignments: m.costedAssignments,
      totalAssignments: m.totalAssignments,
      status: capacityStatusOf(hoursLogged, utilization),
    }
  })
}


function bucketBy<T, K extends string>(
  items: T[],
  keyOf: (item: T) => K,
  labelOf: (key: K) => string,
  amountOf: (item: T) => number,
): StatusBucket[] {
  const map = new Map<K, { count: number; amount: number }>()
  for (const item of items) {
    const key = keyOf(item)
    const entry = map.get(key) ?? { count: 0, amount: 0 }
    entry.count += 1
    entry.amount += amountOf(item)
    map.set(key, entry)
  }
  return Array.from(map.entries()).map(([key, value]) => ({
    id: key,
    label: labelOf(key),
    count: value.count,
    amount: value.amount,
  }))
}

function buildFinancials(
  period: ReportPeriod,
  receivables: Receivable[],
  payments: Payment[],
): FinancialOperationsReport {
  const allRecs = receivables.filter((r) => r.period === period)
  const allPays = payments.filter((p) => p.period === period)
  const recs = allRecs.filter((r) => r.currency === 'ARS')
  const pays = allPays.filter((p) => p.currency === 'ARS')
  const liveRecs = recs.filter((r) => r.status !== 'cancelled')
  const livePays = pays.filter((p) => p.status !== 'cancelled')
  const otherLaneCount =
    allRecs.filter((r) => r.currency !== 'ARS' && r.status !== 'cancelled').length +
    allPays.filter((p) => p.currency !== 'ARS' && p.status !== 'cancelled').length

  const totalCobrado = sum(recs, (r) => r.collectedAmount)
  const totalPendienteCobro = sum(liveRecs, (r) => r.totalAmount - r.collectedAmount)
  const totalPagadoEquipo = sum(
    pays.filter((p) => p.recipientType === 'collaborator' || p.recipientType === 'employee'),
    (p) => p.paidAmount,
  )
  const gastosFijos = sum(
    livePays.filter((p) => p.recipientType === 'fixed_expense'),
    (p) => p.totalAmount,
  )
  const viaticos = sum(
    livePays.filter((p) => /vi[áa]tic/i.test(p.concept)),
    (p) => p.totalAmount,
  )
  const extrasCobrados = sum(
    recs.filter((r) => r.status === 'collected'),
    (r) => r.extraAmount,
  )
  const extrasPendientes = sum(
    liveRecs.filter((r) => r.status !== 'collected'),
    (r) => r.extraAmount,
  )

  const gastosFijosList: FixedExpenseLine[] = livePays
    .filter((p) => p.recipientType === 'fixed_expense')
    .map((p) => ({
      id: p.id,
      concept: p.recipientName,
      currency: p.currency,
      amount: p.totalAmount,
      paid: p.status === 'paid',
    }))

  return {
    period,
    totalCobrado,
    totalPendienteCobro,
    totalPagadoEquipo,
    gastosFijos,
    viaticos,
    extrasCobrados,
    extrasPendientes,
    cobrosPorEstado: bucketBy(recs, (r) => r.status, (k) => COLLECTION_LABEL[k], (r) => r.totalAmount),
    pagosPorEstado: bucketBy(pays, (p) => p.status, (k) => PAYMENT_LABEL[k], (p) => p.totalAmount),
    gastosFijosList,
    facturacion: bucketBy(recs, (r) => r.billingStatus, (k) => BILLING_LABEL[k], (r) => r.totalAmount),
    cobrosDetail: recs.map((r) => ({
      id: r.id,
      clientName: r.clientName,
      service: r.service,
      dueDate: r.dueDate,
      status: r.status,
      statusLabel: COLLECTION_LABEL[r.status],
      currency: r.currency,
      totalAmount: r.totalAmount,
      collectedAmount: r.collectedAmount,
    })),
    pagosDetail: pays.map((p) => ({
      id: p.id,
      recipientName: p.recipientName,
      concept: p.concept,
      expectedDate: p.expectedDate,
      status: p.status,
      statusLabel: PAYMENT_LABEL[p.status],
      currency: p.currency,
      totalAmount: p.totalAmount,
      paidAmount: p.paidAmount,
    })),
    facturacionDetail: recs.map((r) => ({
      id: r.id,
      clientName: r.clientName,
      billingStatus: r.billingStatus,
      billingLabel: BILLING_LABEL[r.billingStatus],
      currency: r.currency,
      totalAmount: r.totalAmount,
    })),
    otherLaneCount,
    countsAllLanes: {
      total: allRecs.length,
      collected: allRecs.filter((r) => r.status === 'collected').length,
      overdue: allRecs.filter((r) => r.status === 'overdue').length,
    },
  }
}

function buildSummary(
  period: ReportPeriod,
  profitability: ClientProfitabilityReportItem[],
  capacity: TeamCapacityReportItem[],
  receivables: Receivable[],
  payments: Payment[],
): ReportSummary {
  const liveRecs = receivables.filter((r) => r.period === period && r.status !== 'cancelled')
  const livePays = payments.filter((p) => p.period === period && p.status !== 'cancelled')
  const recs = liveRecs.filter((r) => r.currency === 'ARS')
  const pays = livePays.filter((p) => p.currency === 'ARS')
  const ingresos = sum(recs, (r) => r.totalAmount)
  const egresos = sum(pays, (p) => p.totalAmount)
  const margenPromedio =
    profitability.length > 0 ? sum(profitability, (p) => p.margen) / profitability.length : 0
  return {
    period,
    ingresos,
    egresos,
    rentabilidad: ingresos - egresos,
    margenPromedio,
    horasCargadas: sum(capacity, (c) => c.hoursLogged),
    clientesActivos: profitability.length,
    extrasFueraScopeCount: 0,
    extrasFueraScopeAmount: 0,
    otherLaneCount: liveRecs.length - recs.length + (livePays.length - pays.length),
    otherLanePaymentCount: livePays.length - pays.length,
  }
}

export type ReportInputs = {
  receivables: Receivable[]
  payments: Payment[]
  profitability?: ClientProfitabilityReportItem[]
  otherLaneClientCount?: number
  unbilledCost?: { clientCount: number; cost: number }
  capacity?: TeamCapacityReportItem[]
  productivity?: ProductivityReportItem[]
}

export function getReportData(
  period: ReportPeriod,
  inputs: ReportInputs = { receivables: [], payments: [] },
): ReportDataset {
  const {
    receivables,
    payments,
    profitability = [],
    otherLaneClientCount = 0,
    unbilledCost = { clientCount: 0, cost: 0 },
    capacity = [],
    productivity = [],
  } = inputs
  const financials = buildFinancials(period, receivables, payments)
  const summary = buildSummary(period, profitability, capacity, receivables, payments)
  return {
    period,
    summary,
    productivity,
    profitability,
    otherLaneClientCount,
    unbilledCost,
    capacity,
    financials,
  }
}

export function mapApiMarginHistory(points: MarginHistoryPointDto[]): MarginHistoryPoint[] {
  return points.map((p) => ({ period: p.period, label: p.period, margin: toMajor(p.marginMinor) }))
}

