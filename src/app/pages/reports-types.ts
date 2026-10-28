/**
 * Reportes — typed report models, derived from existing domain concepts.
 *
 * The report area is read-only: these types describe aggregates computed in
 * `reports-data.ts` from the Clients, Team, Monthly Operation and Cobranza mock
 * data. No record here is authored by hand against a backend; every figure is a
 * pure derivation of the source mock. Money is stored as numbers, hours as
 * numbers, dates as ISO strings — formatting happens only at render.
 */
import type { Currency } from './treasury-mock-data'
import type { ReportPeriod } from './reports-periods'

/** Profitability state for a client (Rentabilidad statuses, §3). */
export type ClientProfitabilityStatus =
  | 'rentable'
  | 'margen_bajo'
  | 'perdida'
  | 'revisar_precio'
  | 'excedido_horas'
  | 'pago_pendiente'

/** Workload state for a person (Carga de equipo statuses, §4). */
export type TeamCapacityStatus =
  | 'sobrecargada'
  | 'balanceada'
  | 'subutilizada'
  | 'sin_carga'
  /** No stipulated capacity configured for this person — we cannot judge their load. */
  | 'sin_capacidad'

/** A signed period-over-period delta on a numeric metric (compare toggle). */
export type MetricDelta = {
  /** Current value minus previous value (absolute). */
  absolute: number
  /** Percent change vs. the previous period, or `null` when no prior data. */
  percent: number | null
}

/** One headline figure on the Resumen tab, optionally with a compare delta. */
export type SummaryMetric = {
  id: string
  value: number
  delta: MetricDelta | null
}

/** Resumen aggregates for a period (§1). */
export type ReportSummary = {
  period: ReportPeriod
  /** PESOS. Every figure below is the peso lane alone — see `otherLaneCount`. */
  ingresos: number
  egresos: number
  rentabilidad: number
  margenPromedio: number
  horasCargadas: number
  clientesActivos: number
  extrasFueraScopeCount: number
  extrasFueraScopeAmount: number
  /**
   * Live operations of the period that are NOT in pesos, and so are in none of the
   * figures above. Carried as a COUNT rather than an amount because there is no honest
   * amount: dollars and fund units cannot be added to each other, let alone to pesos.
   * Zero is the normal case and renders nothing.
   */
  otherLaneCount: number
  /** Of those, the PAGOS. Split out because a sentence about outflows may not be chosen
   *  by a number that also counts cobros: it would assert non-peso pagos on a month whose
   *  only foreign money came in. */
  otherLanePaymentCount: number
}

/** One productivity row: a logged unit of work (§2 main table). */
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

/** Per-client profitability with its cost breakdown (§3). */
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

/** Per-person workload + utilization (§4). */
export type TeamCapacityReportItem = {
  personId: string
  personName: string
  role: string
  clientsActive: number
  clientNames: string[]
  hoursLogged: number
  /** Stipulated monthly capacity in hours, or null when nobody has configured it for
   *  this person. Null is NOT zero: a person without a configured capacity cannot be
   *  called under- or over-loaded, and every surface must say "sin configurar"
   *  instead of showing "0 h". */
  capacity: number | null
  /** `hoursLogged / capacity`, or null when capacity is unknown. Never defaults to 0
   *  — a 0 would read as "idle" and would drag any team average down with it. */
  utilization: number | null
  /**
   * The period's cost of this person, summed from the SAME per-assignment monthly
   * amount (`monthlyCostMinor`) that Rentabilidad subtracts as team cost — only grouped
   * by person instead of by client. Deriving it from the compensation model instead
   * would put a second, different "cost of the team" in the same report. Owner-only
   * at render (money).
   */
  /**
   * NULL when no assignment of theirs carries a cost, or the viewer lacks `teamCost`.
   * Never 0 for either — nothing wrote that column until it gained a form, so a zero
   * could only mean "never entered", and this screen printed it as `$ 0`.
   */
  personCost: number | null
  /** `personCost / hoursLogged`; null when there are no hours OR no cost. */
  costPerHour: number | null
  /** How many of this person's assignments carry a cost, out of how many exist.
   *  A PARTIAL sum is a real number that silently understates, so the screen has to
   *  be able to say so instead of presenting it as the whole figure. */
  costedAssignments: number
  totalAssignments: number
  status: TeamCapacityStatus
}

/** A status bucket (count + amount) for the Finanzas operativas breakdowns. */
/**
 * One status slice. Both halves describe the SAME peso population, so a legend count and
 * its arc never disagree — see {@link FinancialOperationsReport} for why the whole report
 * is peso-scoped. Document counts that must span lanes (ARCA errors, comprobantes issued)
 * are built from the raw receivables in `billing-format.ts`, not from here.
 */
export type StatusBucket = { id: string; label: string; count: number; amount: number }

/** A fixed-expense line for Finanzas operativas (§5). */
export type FixedExpenseLine = {
  id: string
  concept: string
  /** The lane `amount` is denominated in — always 'ARS' today, because the whole report
   *  is peso-scoped (see {@link FinancialOperationsReport}). Carried anyway so every
   *  render site formats per-lane instead of assuming: the assumption is what let dollars
   *  into peso totals in the first place. */
  currency: Currency
  amount: number
  paid: boolean
}

/**
 * One receivable, for the Cobros detail table (§5). `status` is the raw
 * collection-status key (drives the status tone + the risk sort); `statusLabel`
 * is its display string.
 */
export type CollectionDetailRow = {
  id: string
  clientName: string
  service: string
  dueDate: string
  status: string
  statusLabel: string
  /** The lane the amounts are denominated in. Always 'ARS' today, because this whole
   *  report is peso-scoped, which is why the render sites may use the peso formatter.
   *  Carried so that stops being an assumption the moment the scope changes. */
  currency: Currency
  totalAmount: number
  collectedAmount: number
}

/** One payment, for the Pagos detail table (§5). */
export type PaymentDetailRow = {
  id: string
  recipientName: string
  concept: string
  /** The payment's due date (`Payment.expectedDate`) — receivables call theirs `dueDate`.
   *  Carried so the bucket drawer can age overdue payouts the same way it ages cobros. */
  expectedDate: string
  status: string
  statusLabel: string
  /** The lane the amounts are denominated in. See {@link CollectionDetailRow}. */
  currency: Currency
  totalAmount: number
  paidAmount: number
}

/** One receivable seen by billing status, for the Facturación detail table (§5). */
export type BillingDetailRow = {
  id: string
  clientName: string
  billingStatus: string
  billingLabel: string
  /** The lane the amount is denominated in. See {@link CollectionDetailRow}. */
  currency: Currency
  totalAmount: number
}

/** Finanzas operativas analysis for a period (§5). */
/**
 * Finanzas operativas for one period, in PESOS — every total, every bucket, every bucket
 * COUNT and every detail row. A cobro or pago in another lane is counted in
 * `otherLaneCount` and appears in none of them.
 *
 * The one-lane invariant is load-bearing rather than tidy. Nine other files aggregate
 * these lists — two donuts, a collapsed accordion summary, the bucket drawer's aging and
 * concentration buckets, the record drawer, the CSV export, the owner dashboard's
 * pendientes — and every one sums or peso-formats without asking. Widening the lists to
 * carry other lanes was tried, and it put dollars back into peso totals in eight places at
 * once. Lane-awareness spread across nine files is a rule whose next omission is
 * invisible; this is a rule the type carries.
 */
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
  // Record-level detail behind each donut, for the collapsible detail tables.
  cobrosDetail: CollectionDetailRow[]
  pagosDetail: PaymentDetailRow[]
  facturacionDetail: BillingDetailRow[]
  /** Live operations of the period in another currency, excluded from everything above. */
  otherLaneCount: number
  /**
   * COUNTS over every lane. Deliberately a separate field holding no amounts, because the
   * rest of this object is peso-only and the two must not be confused.
   *
   * A count is not money. An overdue cobro is overdue whatever it is billed in, and the
   * owner dashboard raises its "Clientes vencidos" alarm off this — scoping it to pesos
   * turned a real alarm into a confident zero in default tone, twice, once in each
   * direction of an earlier fix. The dashboard's "N de M clientes pagaron" reads the same
   * way. Every AMOUNT those sections show stays peso-scoped.
   */
  countsAllLanes: { total: number; collected: number; overdue: number }
}

/** Everything the page needs for one period. */
export type ReportDataset = {
  period: ReportPeriod
  summary: ReportSummary
  productivity: ProductivityReportItem[]
  profitability: ClientProfitabilityReportItem[]
  /** Clients omitted from `profitability` because their period billing is in another
   *  lane. Rentabilidad subtracts peso costs from a billed figure, so a non-peso cobro
   *  would produce a margin in no currency — the row is dropped rather than distorted,
   *  and this is what lets the tab say so. */
  otherLaneClientCount: number
  /** What clients with NO peso cobro in the period cost, and how many. They have no row
   *  (nothing billed to state a margin against) and are kept out of the totals; this is
   *  what lets the tab say their cost exists instead of letting it "not load". */
  unbilledCost: { clientCount: number; cost: number }
  capacity: TeamCapacityReportItem[]
  financials: FinancialOperationsReport
}

/** One month of margin history, for the evolution line chart. */
export type MarginHistoryPoint = { period: ReportPeriod; label: string; margin: number }
