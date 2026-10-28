/**
 * Operación mensual mock data — the monthly-closing data model + a local dataset.
 *
 * No backend: in-memory month records that exercise every status, payment/invoice
 * state, payout situation, production state, expense and alert so the tables,
 * detail panels, summary, checklist and the close-month validations can be
 * validated end to end. Numbers are stored as numbers and dates as ISO strings;
 * formatting happens only at render via `monthly-operation-format.ts`. Some rows
 * intentionally violate a close-validation so the close dialog can demonstrate
 * its blockers. Replaced by a real data source later.
 */

import type { PayoutStatementStatus } from '@hold/shared'

// ── Shared enums ─────────────────────────────────────────────────────────────
import { currentPeriod, toMonthId } from '@/app/lib/periods'

export type MonthId = string // 'YYYY-MM'
export type MonthStatus = 'draft' | 'review' | 'closed' | 'reopened'
export type Monotributo = 'monotributo_1' | 'monotributo_2' | 'monotributo_3'

// ── Clientes del mes ─────────────────────────────────────────────────────────
export type ClientMonthStatus = 'pending_review' | 'reviewed' | 'new' | 'churned' | 'paused'
export type MoPaymentStatus = 'paid' | 'partial' | 'pending' | 'overdue'
export type MoInvoiceStatus = 'not_issued' | 'issued' | 'sent' | 'paid'

export type ClientExtra = {
  id: string
  description: string
  amount: number
  billable: boolean
}

export type ClientMonth = {
  id: string
  clientId: string
  name: string
  clientType?: string
  monthStatus: ClientMonthStatus
  services: string[]
  team: { id: string; name: string; role: string }[]
  monthlyFee: number
  extras: ClientExtra[]
  productionsAmount: number
  paidAmount: number
  paymentStatus: MoPaymentStatus
  paymentDate?: string
  invoiceStatus: MoInvoiceStatus
  monotributo: Monotributo
  /**
   * Payroll allocated to this client for the month. `null` means the source does
   * not allocate payroll per client (the live API bundle does not yet), which is
   * NOT the same as `0` (genuinely no team cost). Anything that divides or
   * subtracts this must branch on `null` rather than coerce it to zero, or the
   * client reads as more profitable than it is.
   */
  teamCost: number | null
  productionCost: number
  lastIncreaseDate?: string
  /** Alta/baja effective date — required by the close validation for new/churned. */
  effectiveDate?: string
  notes?: string
}

// ── Pagos al equipo ──────────────────────────────────────────────────────────
export type PayoutStatus = 'pending' | 'partial' | 'paid'
/**
 * The statement's own lifecycle, taken straight from the API contract rather than
 * re-modelled here. It used to be a three-value view type (`not_generated |
 * generated | sent`) that collapsed `dispatched` and `confirmed` into one value —
 * which left the UI unable to tell "lo mandé al banco" from "confirmé que llegó",
 * and therefore unable to pick the one transition the server would accept next.
 */
export type StatementStatus = PayoutStatementStatus

export type TeamAdjustment = { id: string; description: string; amount: number }
export type BankData = {
  bankName?: string
  accountHolder?: string
  cbuOrCvu?: string
  alias?: string
}

export type TeamPayout = {
  id: string
  memberId: string
  name: string
  role: string
  clients: string[]
  baseAmount: number
  productionsAmount: number
  viaticsAmount: number
  adjustments: TeamAdjustment[]
  statementStatus: StatementStatus
  payoutStatus: PayoutStatus
  /** Amount paid so far this month; drives the team paid/remaining figures. */
  paidAmount: number
  payoutDate?: string
  bank?: BankData
}

// ── Producciones ─────────────────────────────────────────────────────────────
export type ProductionStatus = 'pending' | 'approved' | 'invoiced'
/** Whether an approved production is internal cost, billable to the client, or both. */
export type ProductionBillable = 'internal' | 'billable' | 'both'

export type ProductionRecord = {
  id: string
  date: string
  /** YYYY-MM the production counts in (billing, pay and cost). Absent on mock rows, where
   *  the shoot's month stands in. */
  period?: string
  /** Empty string models a production with no client (a close-validation target). */
  clientId: string
  clientName: string
  title: string
  type: string
  responsible: string
  participants: string[]
  hours: number
  viatics: number
  totalCost: number
  /** `null` = not yet defined (a close-validation target once approved). */
  billable: ProductionBillable | null
  billAmount?: number
  /** Hours its per-hour line's included hours covered that month; `billAmount` is the rest. */
  packHours?: number
  status: ProductionStatus
  notes?: string
  /** The client's per-production service it is billed under, when linked. */
  clientServiceId?: string | null
  /** The cobro that billed it. Set = its amount is inside that cobro: read-only. */
  receivableId?: string | null
  /** Who coordinated it — the planilla's "Account Manager". Not a worker. */
  accountManagerId?: string | null
  accountManagerName?: string
  /** The content creator: the person whose hours the production pays. */
  creatorId?: string | null
  /** YYYY-MM-DD the viático was paid back; absent/null while it is owed. */
  viaticsPaidAt?: string | null
  /** Drive link or file name of the viático receipt. */
  receipt?: string
}

// ── Gastos fijos ─────────────────────────────────────────────────────────────
/**
 * The BUILT-IN expense categories: the ones that carry a translated label and a known
 * mapping into the cashflow's committed buckets. A studio can define its own categories
 * in Configuración → Operación mensual, so a stored category is a free string (see
 * `FixedExpense.category`) — this union is the set that is specially understood, not the
 * set that is allowed.
 */
export type ExpenseCategory = 'software' | 'office' | 'services' | 'salaries' | 'taxes' | 'other'
export type ExpenseRecurrence = 'monthly' | 'one_time' | 'quarterly' | 'annual'
export type ExpensePayStatus = 'paid' | 'pending'

export type FixedExpense = {
  id: string
  concept: string
  /** A built-in `ExpenseCategory` key, or a category the studio defined itself. */
  category: string
  amount: number
  recurrence: ExpenseRecurrence
  responsible?: string
  monotributo?: Monotributo
  payStatus: ExpensePayStatus
  affectsProfitability: boolean
  notes?: string
}

// ── Alertas ──────────────────────────────────────────────────────────────────
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low'
export type AlertType = 'cobros' | 'facturacion' | 'equipo' | 'rentabilidad' | 'comercial' | 'arca'
export type AlertStatus = 'open' | 'in_progress' | 'resolved'

export type MonthlyAlert = {
  id: string
  severity: AlertSeverity
  type: AlertType
  entity: string
  description: string
  responsible?: string
  status: AlertStatus
}

// ── Monotributo (annual cap watch) ───────────────────────────────────────────
export type MonotributoWatch = {
  category: Monotributo
  /** Accumulated billing in the category's running year. */
  annualBilled: number
  /** Annual billing ceiling for the category. */
  annualLimit: number
}

// ── Closing checklist ────────────────────────────────────────────────────────
export type ChecklistItemId =
  | 'clients_reviewed'
  | 'changes_applied'
  | 'payments_loaded'
  | 'invoices_issued'
  | 'productions_loaded'
  | 'viatics_loaded'
  | 'extra_work_reviewed'
  | 'team_pay_calculated'
  | 'statements_generated'
  | 'expenses_loaded'
  | 'arca_reviewed'
  | 'profitability_reviewed'

/** The 12 closing-checklist items, in render order (labels are product copy). */
export const CHECKLIST_ITEMS: { id: ChecklistItemId; label: string }[] = [
  { id: 'clients_reviewed', label: 'Clientes del mes revisados' },
  { id: 'changes_applied', label: 'Cambios de altas/bajas aplicados' },
  { id: 'payments_loaded', label: 'Cobros cargados' },
  { id: 'invoices_issued', label: 'Facturas emitidas o marcadas' },
  { id: 'productions_loaded', label: 'Producciones cargadas' },
  { id: 'viatics_loaded', label: 'Viáticos cargados' },
  { id: 'extra_work_reviewed', label: 'Trabajos extra revisados' },
  { id: 'team_pay_calculated', label: 'Pagos al equipo calculados' },
  { id: 'statements_generated', label: 'Cuentas corrientes generadas' },
  { id: 'expenses_loaded', label: 'Gastos fijos cargados' },
  { id: 'arca_reviewed', label: 'Alertas ARCA revisadas' },
  { id: 'profitability_reviewed', label: 'Rentabilidad revisada' },
]

export type Checklist = Record<ChecklistItemId, boolean>

// ── Month record ─────────────────────────────────────────────────────────────
export type MonthlyOperationData = {
  clients: ClientMonth[]
  team: TeamPayout[]
  productions: ProductionRecord[]
  expenses: FixedExpense[]
  alerts: MonthlyAlert[]
  monotributo: MonotributoWatch[]
  checklist: Checklist
  /** The API had more rows for this month than one page carries, so every figure
   *  derived from this data is a SUBSET. Optional: the mock months are complete by
   *  construction, and an API that predates the flag reads as not truncated. */
  truncated?: boolean
  /**
   * The month's outflows, owned by the Pagos module and read here.
   *
   * Kept in its OWN field rather than merged into `team[]`, which is not a style choice:
   * `team[]` is what the `bank_incomplete` close blocker filters, and a payment carries no
   * bank profile, so merging would block a close that works today.
   *
   * `paymentTotals` is exact and is what money is derived from. `payments` is a capped
   * display list and MUST NOT be summed.
   */
  paymentTotals: PaymentTotal[]
  teamPaymentTotals: TeamPaymentTotal[]
  payments: MonthPayment[]
  /** Pagos of the period in a lane other than pesos. Every figure above excludes them,
   *  and the list excludes them too, so without this the omission has nothing on the
   *  page to show it. */
  otherLanePaymentCount: number
}

/** Recipient types, as the Pagos module records them. */
export type MonthPaymentRecipient =
  | 'collaborator'
  | 'provider'
  | 'employee'
  | 'fixed_expense'
  | 'monotributo'
  | 'platform'

/** One recipient type's outflow for the month, in pesos. Exact: safe to sum. */
export type PaymentTotal = {
  recipientType: MonthPaymentRecipient
  /** Recorded as owed this month, paid or not. This is what profitability subtracts. */
  total: number
  /** The part actually settled. */
  paid: number
  count: number
}

/**
 * One member payroll payments for the month, in pesos, keyed by the person.
 * `teamMemberId` is null for a payroll payment naming no member.
 */
export type TeamPaymentTotal = {
  teamMemberId: string | null
  total: number
  paid: number
}

/** One outflow row, for display only. */
export type MonthPayment = {
  id: string
  recipientType: MonthPaymentRecipient
  recipientName: string
  concept: string
  total: number
  paid: number
  status: string
  expectedDate: string | null
  paymentDate: string | null
}

export type MonthRecord = {
  id: MonthId
  label: string
  status: MonthStatus
  data: MonthlyOperationData
  /** Frozen historical copy taken at close — so reopening + editing never rewrites it. */
  snapshot?: MonthlyOperationData
  closedAt?: string
}

// ── Seed builders ────────────────────────────────────────────────────────────
function checklist(overrides: Partial<Checklist> = {}): Checklist {
  const base = Object.fromEntries(CHECKLIST_ITEMS.map((item) => [item.id, true])) as Checklist
  return { ...base, ...overrides }
}

// Cobro/pago actuals note (actuals-shared, B-1a/B-1b): for clients/members that
// resolve to a canonical Receivable/Payment, the per-row money fields below
// (ClientMonth.paidAmount/paymentStatus/paymentDate; TeamPayout.paidAmount/
// payoutStatus/payoutDate) are OVERWRITTEN at read time by the finance-bridge overlay
// (see monthly-operation-finance-bridge.ts) and re-derived from the canonical store.
// The seeded values here are authoritative ONLY for orphan rows (no canonical match,
// e.g. Cobre Bar) and as the frozen value baked into a closed month's snapshot. The
// billing/payout PLAN (monthlyFee/extras/productionsAmount; base/productions/viatics/
// adjustments), invoiceStatus, statementStatus and bank stay month-owned.
function juneClients(): ClientMonth[] {
  return [
    {
      id: 'cm-001',
      clientId: 'cli-001',
      name: 'Café Roma',
      clientType: 'Gastronomía',
      monthStatus: 'pending_review',
      services: ['Redes', 'Ads', 'Producción'],
      team: [
        { id: 'tm-flor', name: 'Flor Giménez', role: 'Account' },
        { id: 'tm-mica', name: 'Mica Torres', role: 'Social' },
        { id: 'tm-nico', name: 'Nico Vega', role: 'Producción' },
      ],
      monthlyFee: 450000,
      extras: [{ id: 'ex-1', description: 'Campaña día del padre', amount: 80000, billable: true }],
      productionsAmount: 120000,
      paidAmount: 0,
      paymentStatus: 'overdue',
      paymentDate: undefined,
      invoiceStatus: 'not_issued',
      monotributo: 'monotributo_1',
      teamCost: 360000,
      productionCost: 90000,
      lastIncreaseDate: '2025-04-01',
    },
    {
      id: 'cm-002',
      clientId: 'cli-002',
      name: 'Marea Contenidos',
      clientType: 'Productora',
      monthStatus: 'reviewed',
      services: ['Producción', 'Branding'],
      team: [
        { id: 'tm-nico', name: 'Nico Vega', role: 'Producción' },
        { id: 'tm-sol', name: 'Sol Ramírez', role: 'Diseño' },
      ],
      monthlyFee: 680000,
      extras: [],
      productionsAmount: 0,
      paidAmount: 680000,
      paymentStatus: 'paid',
      paymentDate: '2026-06-08',
      invoiceStatus: 'sent',
      monotributo: 'monotributo_2',
      teamCost: 300000,
      productionCost: 0,
      lastIncreaseDate: '2026-01-10',
    },
    {
      id: 'cm-003',
      clientId: 'cli-008',
      name: 'Lumen Salud',
      clientType: 'Salud',
      monthStatus: 'new',
      services: ['Redes', 'Branding'],
      team: [{ id: 'tm-sol', name: 'Sol Ramírez', role: 'Diseño' }],
      monthlyFee: 540000,
      extras: [],
      productionsAmount: 0,
      paidAmount: 0,
      paymentStatus: 'pending',
      invoiceStatus: 'not_issued',
      monotributo: 'monotributo_2',
      teamCost: 180000,
      productionCost: 0,
      // effectiveDate intentionally omitted → new-client close validation fires.
    },
    {
      id: 'cm-004',
      clientId: 'cli-015',
      name: 'Raíz Orgánica',
      clientType: 'Alimentos',
      monthStatus: 'reviewed',
      services: ['Redes', 'Email marketing'],
      team: [{ id: 'tm-mica', name: 'Mica Torres', role: 'Social' }],
      monthlyFee: 360000,
      extras: [{ id: 'ex-2', description: 'Ajuste fuera de scope', amount: 40000, billable: false }],
      productionsAmount: 0,
      paidAmount: 180000,
      paymentStatus: 'partial',
      paymentDate: '2026-06-12',
      invoiceStatus: 'issued',
      monotributo: 'monotributo_1',
      // Negative margin (cost > revenue) → "margen negativo" surfacing.
      teamCost: 320000,
      productionCost: 90000,
      lastIncreaseDate: '2024-06-01',
    },
    {
      id: 'cm-005',
      clientId: 'cli-011',
      name: 'Delta Inmobiliaria',
      clientType: 'Inmobiliaria',
      monthStatus: 'paused',
      services: ['Redes', 'Ads'],
      team: [{ id: 'tm-juan', name: 'Juan Pérez', role: 'Ads' }],
      monthlyFee: 420000,
      extras: [],
      productionsAmount: 0,
      paidAmount: 0,
      paymentStatus: 'pending',
      invoiceStatus: 'not_issued',
      monotributo: 'monotributo_1',
      teamCost: 160000,
      productionCost: 0,
      lastIncreaseDate: '2024-04-01',
    },
    {
      id: 'cm-006',
      clientId: 'cli-020',
      name: 'Cobre Bar',
      clientType: 'Gastronomía',
      monthStatus: 'churned',
      services: ['Redes'],
      team: [],
      monthlyFee: 0,
      extras: [],
      productionsAmount: 0,
      paidAmount: 0,
      paymentStatus: 'pending',
      invoiceStatus: 'not_issued',
      monotributo: 'monotributo_1',
      teamCost: 0,
      productionCost: 0,
      effectiveDate: '2026-06-30',
    },
  ]
}

function juneTeam(): TeamPayout[] {
  return [
    {
      id: 'tp-flor',
      memberId: 'tm-flor',
      name: 'Flor Giménez',
      role: 'Account',
      clients: ['Café Roma', 'Norte Logística', 'Pampa Seguros'],
      baseAmount: 1200000,
      productionsAmount: 0,
      viaticsAmount: 0,
      adjustments: [],
      statementStatus: 'approved',
      payoutStatus: 'pending',
      paidAmount: 0,
      bank: {
        bankName: 'Banco Galicia',
        accountHolder: 'Florencia Giménez',
        cbuOrCvu: '0070123430004012345678',
        alias: 'flor.gimenez.mp',
      },
    },
    {
      id: 'tp-mica',
      memberId: 'tm-mica',
      name: 'Mica Torres',
      role: 'Social',
      clients: ['Café Roma', 'Raíz Orgánica', 'Aurora Moda'],
      baseAmount: 0,
      productionsAmount: 0,
      viaticsAmount: 35000,
      adjustments: [{ id: 'aj-1', description: 'Horas extra grilla', amount: 90000 }],
      statementStatus: 'draft',
      payoutStatus: 'pending',
      paidAmount: 0,
      // Missing CBU/CVU → payable-with-incomplete-bank close validation fires.
      bank: { bankName: 'Mercado Pago', alias: 'mica.torres' },
    },
    {
      id: 'tp-juan',
      memberId: 'tm-juan',
      name: 'Juan Pérez',
      role: 'Ads',
      clients: ['Norte Logística', 'Delta Inmobiliaria'],
      baseAmount: 0,
      productionsAmount: 0,
      viaticsAmount: 0,
      adjustments: [{ id: 'aj-2', description: 'Horas Ads', amount: 240000 }],
      statementStatus: 'approved',
      payoutStatus: 'paid',
      paidAmount: 240000,
      payoutDate: '2026-06-10',
      bank: {
        bankName: 'Banco Nación',
        accountHolder: 'Juan Pérez',
        cbuOrCvu: '0110987620098712345678',
        alias: 'juan.perez.nac',
      },
    },
    {
      id: 'tp-sol',
      memberId: 'tm-sol',
      name: 'Sol Ramírez',
      role: 'Diseño',
      clients: ['Marea Contenidos', 'Lumen Salud'],
      baseAmount: 0,
      productionsAmount: 270000,
      viaticsAmount: 18000,
      adjustments: [],
      statementStatus: 'approved',
      payoutStatus: 'partial',
      paidAmount: 150000,
      bank: {
        bankName: 'Brubank',
        accountHolder: 'Sol Ramírez',
        cbuOrCvu: '1430001712345678901234',
        alias: 'sol.ramirez',
      },
    },
    {
      id: 'tp-nico',
      memberId: 'tm-nico',
      name: 'Nico Vega',
      role: 'Producción',
      clients: ['Café Roma', 'Marea Contenidos'],
      baseAmount: 1400000,
      productionsAmount: 0,
      viaticsAmount: 42000,
      adjustments: [],
      statementStatus: 'approved',
      payoutStatus: 'pending',
      paidAmount: 0,
      bank: {
        bankName: 'Banco Santander',
        accountHolder: 'Nicolás Vega',
        cbuOrCvu: '0720000788000123456789',
        alias: 'nico.vega.prod',
      },
    },
  ]
}

function juneProductions(): ProductionRecord[] {
  return [
    {
      id: 'pr-001',
      date: '2026-06-05',
      clientId: 'cli-001',
      clientName: 'Café Roma',
      title: 'Sesión de fotos menú',
      type: 'Fotografía',
      responsible: 'Nico Vega',
      participants: ['Nico Vega', 'Sol Ramírez'],
      hours: 8,
      viatics: 12000,
      totalCost: 90000,
      billable: 'billable',
      billAmount: 120000,
      status: 'invoiced',
    },
    {
      id: 'pr-002',
      date: '2026-06-09',
      clientId: 'cli-002',
      clientName: 'Marea Contenidos',
      title: 'Reel institucional',
      type: 'Video',
      responsible: 'Nico Vega',
      participants: ['Nico Vega'],
      hours: 6,
      viatics: 0,
      totalCost: 70000,
      billable: 'internal',
      status: 'approved',
    },
    {
      id: 'pr-003',
      date: '2026-06-11',
      clientId: 'cli-008',
      clientName: 'Lumen Salud',
      title: 'Producción de contenido lanzamiento',
      type: 'Video',
      responsible: 'Sol Ramírez',
      participants: ['Sol Ramírez', 'Mica Torres'],
      hours: 10,
      viatics: 18000,
      totalCost: 130000,
      // Approved but billable not defined → close validation fires.
      billable: null,
      status: 'approved',
    },
    {
      id: 'pr-004',
      date: '2026-06-13',
      clientId: '',
      clientName: '',
      title: 'Prueba de cámara interna',
      type: 'Otro',
      responsible: 'Nico Vega',
      participants: ['Nico Vega'],
      hours: 3,
      viatics: 0,
      totalCost: 20000,
      // No client → close validation fires.
      billable: 'internal',
      status: 'pending',
    },
    {
      id: 'pr-005',
      date: '2026-06-14',
      clientId: 'cli-019',
      clientName: 'Luz Eventos',
      title: 'Cobertura evento',
      type: 'Fotografía',
      responsible: 'Sol Ramírez',
      participants: ['Sol Ramírez'],
      hours: 5,
      viatics: 9000,
      totalCost: 60000,
      billable: 'both',
      billAmount: 85000,
      status: 'pending',
    },
  ]
}

function juneExpenses(): FixedExpense[] {
  return [
    {
      id: 'fx-001',
      concept: 'Adobe Creative Cloud',
      category: 'software',
      amount: 95000,
      recurrence: 'monthly',
      responsible: 'Adobe',
      payStatus: 'paid',
      affectsProfitability: true,
    },
    {
      id: 'fx-002',
      concept: 'Alquiler oficina',
      category: 'office',
      amount: 420000,
      recurrence: 'monthly',
      responsible: 'Inmob. Centro',
      payStatus: 'pending',
      affectsProfitability: true,
    },
    {
      id: 'fx-003',
      concept: 'Contador',
      category: 'services',
      amount: 180000,
      recurrence: 'monthly',
      responsible: 'Estudio Paz',
      monotributo: 'monotributo_2',
      payStatus: 'paid',
      affectsProfitability: true,
    },
    {
      id: 'fx-004',
      concept: 'Monotributo (3 categorías)',
      category: 'taxes',
      amount: 145000,
      recurrence: 'monthly',
      payStatus: 'pending',
      affectsProfitability: true,
    },
    {
      id: 'fx-005',
      concept: 'Herramientas de reporting',
      category: 'software',
      amount: 60000,
      recurrence: 'monthly',
      responsible: 'Metricool',
      payStatus: 'paid',
      affectsProfitability: false,
    },
  ]
}

function juneAlerts(): MonthlyAlert[] {
  return [
    {
      id: 'al-001',
      severity: 'critical',
      type: 'arca',
      entity: 'Monotributo 1',
      description: 'Cerca del límite de facturación anual de la categoría.',
      responsible: 'Administración',
      // Open + critical → close validation fires.
      status: 'open',
    },
    {
      id: 'al-002',
      severity: 'high',
      type: 'cobros',
      entity: 'Café Roma',
      description: 'Pago vencido del mes sin registrar.',
      responsible: 'Flor Giménez',
      status: 'open',
    },
    {
      id: 'al-003',
      severity: 'high',
      type: 'rentabilidad',
      entity: 'Raíz Orgánica',
      description: 'Margen negativo: el costo supera al fee facturado.',
      responsible: 'Cuentas',
      status: 'in_progress',
    },
    {
      id: 'al-004',
      severity: 'medium',
      type: 'equipo',
      entity: 'Mica Torres',
      description: 'Datos bancarios incompletos para liquidar el pago.',
      responsible: 'Administración',
      status: 'open',
    },
    {
      id: 'al-005',
      severity: 'low',
      type: 'comercial',
      entity: 'Delta Inmobiliaria',
      description: 'Cliente pausado hace más de 60 días.',
      status: 'resolved',
    },
  ]
}

/** Running-year billing per monotributo category — one sits near its cap (MT 1). */
function juneMonotributo(): MonotributoWatch[] {
  return [
    { category: 'monotributo_1', annualBilled: 16300000, annualLimit: 17700000 },
    { category: 'monotributo_2', annualBilled: 11200000, annualLimit: 26600000 },
    { category: 'monotributo_3', annualBilled: 6400000, annualLimit: 35300000 },
  ]
}

function juneData(): MonthlyOperationData {
  return {
    // The mock months predate the Pagos wiring; their cost side is the seeded
    // FixedExpense rows, which no longer reach profitability.
    paymentTotals: [],
    teamPaymentTotals: [],
    payments: [],
    otherLanePaymentCount: 0,
    clients: juneClients(),
    team: juneTeam(),
    productions: juneProductions(),
    expenses: juneExpenses(),
    alerts: juneAlerts(),
    monotributo: juneMonotributo(),
    checklist: checklist({
      payments_loaded: false,
      invoices_issued: false,
      arca_reviewed: false,
      profitability_reviewed: false,
    }),
  }
}

/** Deep clone via structured JSON — the dataset is plain data (no Dates/functions). */
function clone(data: MonthlyOperationData): MonthlyOperationData {
  return JSON.parse(JSON.stringify(data)) as MonthlyOperationData
}

/** A trimmed, settled copy of June for the closed previous month. */
function mayData(): MonthlyOperationData {
  const data = clone(juneData())
  data.clients = data.clients
    .filter((client) => client.monthStatus !== 'new')
    .map((client) => ({
      ...client,
      monthStatus: client.monthStatus === 'churned' ? 'churned' : 'reviewed',
      paidAmount: client.monthlyFee,
      paymentStatus: 'paid',
      paymentDate: '2026-05-06',
      invoiceStatus: 'paid',
      effectiveDate: client.effectiveDate ?? '2026-05-31',
    }))
  data.team = data.team.map((payout) => ({
    ...payout,
    statementStatus: 'dispatched',
    payoutStatus: 'paid',
    paidAmount:
      payout.baseAmount +
      payout.productionsAmount +
      payout.viaticsAmount +
      payout.adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0),
    payoutDate: '2026-05-09',
    bank: {
      bankName: payout.bank?.bankName ?? 'Banco',
      accountHolder: payout.bank?.accountHolder ?? payout.name,
      cbuOrCvu: payout.bank?.cbuOrCvu ?? '0000000000000000000000',
      alias: payout.bank?.alias ?? 'alias',
    },
  }))
  data.productions = data.productions
    .filter((production) => production.clientId !== '')
    .map((production) => ({ ...production, status: 'invoiced', billable: production.billable ?? 'billable' }))
  data.alerts = data.alerts.map((alert) => ({ ...alert, status: 'resolved' }))
  data.checklist = checklist()
  return data
}

/** Seed month records: May (closed), June (active draft) and July (empty draft). */
export function createSeedMonths(): MonthRecord[] {
  const may = mayData()
  return [
    {
      id: '2026-07',
      label: 'Julio 2026',
      status: 'draft',
      data: {
        paymentTotals: [],
        teamPaymentTotals: [],
        payments: [],
        otherLanePaymentCount: 0,
        clients: [],
        team: [],
        productions: [],
        expenses: juneExpenses(),
        alerts: [],
        monotributo: juneMonotributo(),
        checklist: checklist({
          clients_reviewed: false,
          changes_applied: false,
          payments_loaded: false,
          invoices_issued: false,
          productions_loaded: false,
          viatics_loaded: false,
          extra_work_reviewed: false,
          team_pay_calculated: false,
          statements_generated: false,
          arca_reviewed: false,
          profitability_reviewed: false,
        }),
      },
    },
    {
      id: '2026-06',
      label: 'Junio 2026',
      status: 'draft',
      data: juneData(),
    },
    {
      id: '2026-05',
      label: 'Mayo 2026',
      status: 'closed',
      data: may,
      snapshot: clone(may),
      closedAt: '2026-06-02T11:30:00',
    },
  ]
}

/**
 * The month the app opens on: the one we are actually in, resolved per call.
 *
 * This was the literal `'2026-06'`, and it did not only pin `/operacion-mensual` — the three
 * dashboards select their month with it too, so by July all four surfaces were reporting a
 * month in the past with no way to reach the present one. A function, not a const: a const
 * evaluated at module load goes stale in a tab left open across a month boundary, which is
 * the same trap in miniature.
 */
export function defaultMonthId(): MonthId {
  return toMonthId(currentPeriod())
}

/**
 * The month `createSeedMonths` builds its FIXTURE around. Pinned on purpose: it identifies a
 * row inside hand-written demo data, not "now", and derivation tests assert against it. Do
 * not reach for this to pick the month a user sees — that is `defaultMonthId()`.
 */
export const SEED_MONTH_ID: MonthId = '2026-06'

// PRODUCTION_CLIENT_OPTIONS lived here: six fabricated clients with ids 'cli-001'…'cli-019'
// that fed the production form's client picker. Removed with the picker's rewire to
// GET /clients — `createProductionSchema` wants `clientId: z.uuid()`, so those ids could only
// ever produce a 400. Deleted rather than left orphaned: a plausible-looking exported catalog
// is precisely the thing a future picker gets wired back to.
