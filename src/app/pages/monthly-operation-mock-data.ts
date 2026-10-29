import type { PayoutStatementStatus } from '@hold/shared'

import { currentPeriod, toMonthId } from '@/app/lib/periods'

export type MonthId = string
export type MonthStatus = 'draft' | 'review' | 'closed' | 'reopened'
export type Monotributo = 'monotributo_1' | 'monotributo_2' | 'monotributo_3'

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
  teamCost: number | null
  productionCost: number
  lastIncreaseDate?: string
  effectiveDate?: string
  notes?: string
}

export type PayoutStatus = 'pending' | 'partial' | 'paid'
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
  paidAmount: number
  payoutDate?: string
  bank?: BankData
}

export type ProductionStatus = 'pending' | 'approved' | 'invoiced'
export type ProductionBillable = 'internal' | 'billable' | 'both'

export type ProductionRecord = {
  id: string
  date: string
  period?: string
  clientId: string
  clientName: string
  title: string
  type: string
  responsible: string
  participants: string[]
  hours: number
  viatics: number
  totalCost: number
  billable: ProductionBillable | null
  billAmount?: number
  packHours?: number
  status: ProductionStatus
  notes?: string
  clientServiceId?: string | null
  receivableId?: string | null
  accountManagerId?: string | null
  accountManagerName?: string
  creatorId?: string | null
  viaticsPaidAt?: string | null
  receipt?: string
}

export type ExpenseCategory = 'software' | 'office' | 'services' | 'salaries' | 'taxes' | 'other'
export type ExpenseRecurrence = 'monthly' | 'one_time' | 'quarterly' | 'annual'
export type ExpensePayStatus = 'paid' | 'pending'

export type FixedExpense = {
  id: string
  concept: string
  category: string
  amount: number
  recurrence: ExpenseRecurrence
  responsible?: string
  monotributo?: Monotributo
  payStatus: ExpensePayStatus
  affectsProfitability: boolean
  notes?: string
}

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

export type MonotributoWatch = {
  category: Monotributo
  annualBilled: number
  annualLimit: number
}

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

export type MonthlyOperationData = {
  clients: ClientMonth[]
  team: TeamPayout[]
  productions: ProductionRecord[]
  expenses: FixedExpense[]
  alerts: MonthlyAlert[]
  monotributo: MonotributoWatch[]
  checklist: Checklist
  truncated?: boolean
  paymentTotals: PaymentTotal[]
  teamPaymentTotals: TeamPaymentTotal[]
  payments: MonthPayment[]
  otherLanePaymentCount: number
}

export type MonthPaymentRecipient =
  | 'collaborator'
  | 'provider'
  | 'employee'
  | 'fixed_expense'
  | 'monotributo'
  | 'platform'

export type PaymentTotal = {
  recipientType: MonthPaymentRecipient
  total: number
  paid: number
  count: number
}

export type TeamPaymentTotal = {
  teamMemberId: string | null
  total: number
  paid: number
}

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
  snapshot?: MonthlyOperationData
  closedAt?: string
}

function checklist(overrides: Partial<Checklist> = {}): Checklist {
  const base = Object.fromEntries(CHECKLIST_ITEMS.map((item) => [item.id, true])) as Checklist
  return { ...base, ...overrides }
}

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

function juneMonotributo(): MonotributoWatch[] {
  return [
    { category: 'monotributo_1', annualBilled: 16300000, annualLimit: 17700000 },
    { category: 'monotributo_2', annualBilled: 11200000, annualLimit: 26600000 },
    { category: 'monotributo_3', annualBilled: 6400000, annualLimit: 35300000 },
  ]
}

function juneData(): MonthlyOperationData {
  return {
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

function clone(data: MonthlyOperationData): MonthlyOperationData {
  return JSON.parse(JSON.stringify(data)) as MonthlyOperationData
}

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

export function defaultMonthId(): MonthId {
  return toMonthId(currentPeriod())
}

export const SEED_MONTH_ID: MonthId = '2026-06'

