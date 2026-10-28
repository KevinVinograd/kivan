/**
 * Reportes — derivation layer (real, backend-driven).
 *
 * Every figure comes from the API: `financials`/`summary` from the real
 * receivables + payments the page already fetches, `profitability` from
 * `GET /reports/profitability` (per-client six-area cost + margin), and
 * `capacity` from `GET /reports/capacity` (per-member real monthly cost; hours
 * stay "sin datos" until HOLD loads them), `productividad` from
 * `GET /reports/productivity` (one row per logged `TimeEntry`, hours by
 * person/client/task), and the two trend charts from `GET /reports/margin-history`
 * and `GET /reports/hours-history` (a rolling window of real per-month totals).
 * An empty studio sees honest empty states instead of invented data.
 * No mock, no mutation, no fake delays.
 */
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

// ── Small label maps (Finanzas buckets) ─────────────────────────────────────
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

/** Minor units (centavos) string → major units (pesos) number. */

// ── Status classifiers (shared with the API mappers) ─────────────────────────
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

/**
 * Load band for a person. Both inputs can be absent, and each absence means something
 * different: no hours logged is "sin carga" (we know they logged nothing), while no
 * configured capacity is "sin capacidad" (we cannot judge their load at all). The
 * capacity check comes FIRST because judging someone under-loaded against a capacity
 * nobody ever set is a fabricated verdict, not a lenient one.
 */
function capacityStatusOf(hoursLogged: number, utilization: number | null): TeamCapacityStatus {
  if (utilization == null) return 'sin_capacidad'
  if (hoursLogged <= 0) return 'sin_carga'
  if (utilization > 1) return 'sobrecargada'
  if (utilization < 0.6) return 'subutilizada'
  return 'balanceada'
}

// ── API → report-item mappers ────────────────────────────────────────────────
/**
 * Map the API's per-client profitability onto the report item. `costos` and
 * `rentabilidad` come straight from the API, which already subtracts everything; the
 * buckets here only split it for display. Production and viáticos keep their own; the
 * `teamCost` bucket carries what the studio pays the people assigned to the client
 * (`costTeamMinor`, from the assignments) plus pauta and fijos — and the legacy
 * design/communication columns, which are always zero now that they are no longer
 * writable. The buckets therefore still add up to `costos`. `horas` and increase history
 * have no backend source yet (null/0).
 */
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

/**
 * Map the API's per-member capacity onto the report item. `personCost` is the real
 * monthly cost ("Le pagamos x cliente" summed); hours read as "sin carga" until HOLD
 * loads them.
 *
 * `personCost` must NOT go through `toMajor`: that helper is `minor ? .../100 : 0`
 * (`src/lib/money.ts`), so it launders a wire `null` into a real-looking zero and every
 * absence test downstream is dead on arrival — which would re-print the `$ 0` this
 * change exists to remove, through its own fix.
 *
 * Capacity stays NULL when the backend has none (`capacityHoursMonthly` is nullable and
 * no screen sets it yet) instead of collapsing to 0. A 0 here used to make a person with
 * assigned hours compute to 0% utilization and render "0 h · Subutilizada" — a verdict
 * about someone's workload measured against a capacity nobody had configured.
 */
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
      // Null when there is no COST, not only when there are no hours. The old form
      // keyed on hours alone, so a person with hours logged and no cost divided zero
      // by them and produced a second confident `$ 0`.
      costPerHour: personCost != null && hoursLogged > 0 ? personCost / hoursLogged : null,
      costedAssignments: m.costedAssignments,
      totalAssignments: m.totalAssignments,
      status: capacityStatusOf(hoursLogged, utilization),
    }
  })
}


// ── Finanzas operativas (real per-period cobros/pagos) ───────────────────────
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
  // EVERY figure in this report is PESOS — the totals, the buckets, their counts, and the
  // rows of the detail tables alike. One invariant, stated once, because the alternative
  // was tried and does not survive contact with this file's consumers.
  //
  // The alternative was: lists carry every lane, each row rendered in its own currency.
  // It reads better in the abstract and it is what /cobros and /pagos do — but those pages
  // render ROWS. This report's lists feed nine other files that AGGREGATE them: two
  // donuts, a collapsed accordion summary, the bucket drawer's aging and concentration
  // buckets, the record drawer, the CSV export and the owner dashboard's pendientes. Every
  // one of them sums or peso-formats without asking, so widening the lists put dollars
  // back into peso totals in eight places at once — the exact defect this work exists to
  // remove. Lane-awareness spread across nine files is a rule whose next omission is
  // invisible; a peso-only report is a rule the type carries.
  //
  // The non-peso rows are not lost: they are COUNTED here, said on screen, and shown with
  // their own currency on /cobros and /pagos, which is where rows belong.
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

  // `livePays`, not `pays`: a CANCELLED fixed expense is excluded from the `gastosFijos`
  // total three lines up, and listing it anyway put it in the donut as "Pendiente" — a
  // slice for money nobody owes, next to a total that correctly leaves it out.
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
  // Peso lane only. `ingresos - egresos` is a subtraction, so a dollar cobro counted at
  // face value against peso costs moves Rentabilidad by roughly the exchange rate.
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

/** Inputs for one report period: the real stores plus the mapped API aggregates. */
export type ReportInputs = {
  receivables: Receivable[]
  payments: Payment[]
  profitability?: ClientProfitabilityReportItem[]
  /** Clients whose period billing is entirely in another lane, and which `profitability`
   *  therefore omits — not as a zero row, as no row. */
  otherLaneClientCount?: number
  /** What clients with no peso cobro cost — no row either (see `ReportDataset`). */
  unbilledCost?: { clientCount: number; cost: number }
  capacity?: TeamCapacityReportItem[]
  productivity?: ProductivityReportItem[]
}

/** Build the full dataset for a period from real inputs. Pure; safe to memoize.
 *  With no inputs it yields an all-empty dataset (the honest empty state). */
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

/** Map the API's per-month margin trend onto the chart point (minor → pesos). */
export function mapApiMarginHistory(points: MarginHistoryPointDto[]): MarginHistoryPoint[] {
  return points.map((p) => ({ period: p.period, label: p.period, margin: toMajor(p.marginMinor) }))
}

// The per-person hours trend and the per-client margin trend are no longer derived
// here: they come from `GET /reports/hours-history` and `GET /reports/margin-history
// ?clientId=`, consumed by the drawers via `useReportsHoursHistory` /
// `useReportsMarginHistory` (see reports-api-data.ts).
