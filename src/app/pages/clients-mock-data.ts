/**
 * Clients mock data — the §11 PRD data model + a realistic local dataset.
 *
 * No backend: in-memory records that exercise every status, payment state,
 * profitability band, invoice state and billing entity so the table, filters,
 * list and detail can be validated end to end. Numbers are stored as numbers and
 * dates as ISO strings; formatting (currency, relative dates) happens only at
 * render via `clients-format.ts`. Replaced by a real data source later.
 */
import { addMonths, parseISO } from 'date-fns'

import type { Currency } from '@hold/shared'
import { toIsoDate } from '@/app/lib/iso-date'

export type ClientStatus = 'active' | 'onboarding' | 'paused' | 'churned'
export type PaymentStatus = 'paid' | 'pending' | 'overdue' | 'partial'
export type ProfitabilityStatus = 'high' | 'medium' | 'low'
export type InvoiceStatus = 'not_issued' | 'issued' | 'sent' | 'paid'
export type BillingEntity = 'monotributo_1' | 'monotributo_2' | 'monotributo_3'

/** How the client normally pays. A property of the client, not of each cobro. */
export type PaymentMethod = 'cash' | 'transfer'

/** `arrears` = mes vencido, `current` = mes corriendo. */
export type BillingCycle = 'arrears' | 'current'

/**
 * The rubros a client can belong to. "Tipo de cliente" used to be a free-text input
 * bound to nothing, so the same rubro was typed five different ways and could never
 * be filtered on. A closed list, sentence case, with a catch-all at the end.
 */
export const CLIENT_TYPE_CATALOG = [
  'Gastronomía',
  'Retail y comercio',
  'Salud',
  'Inmobiliaria',
  'Servicios profesionales',
  'Industria',
  'Tecnología',
  'Educación',
  'Turismo y hotelería',
  'Construcción',
  'Logística',
  'Agro',
  'Indumentaria',
  'Belleza y estética',
  'Entretenimiento y producción',
  'Finanzas y seguros',
  'ONG e institucional',
  'Otro',
] as const

export type TeamMemberStatus = 'active' | 'paused' | 'inactive'
export type EmploymentType = 'full_time' | 'part_time' | 'freelance' | 'external'
export type CompensationModel = 'hourly' | 'monthly_fixed' | 'per_production' | 'mixed'

/** Member-level compensation contract. Per-client cost is NOT stored here — it
 *  is a relationship attribute on {@link ClientAssignment}. */
export type Compensation = {
  model: CompensationModel
  hourlyRate?: number
  monthlyAmount?: number
  productionRate?: number
  /** The lane the rates above are denominated in. `TeamMember.currency` exists in the
   *  schema and the DTO carries it, so pinning this to the literal was a front-side
   *  claim the data never made: a colaboradora paid in dollars read as pesos. */
  currency: Currency
}

/** Bank details used to transfer the member their monthly pay (PRD §8.3).
 *  Completeness is derived (not stored): missing `cbuOrCvu` or `accountHolder`
 *  marks the member's bank data as incomplete. */
export type BankDetails = {
  bankName?: string
  accountHolder?: string
  cbuOrCvu?: string
  alias?: string
  accountType?: 'checking' | 'savings'
}

/** A person on the roster. Only member-level facts live here; everything that
 *  depends on the member↔client relationship (role on client, hours, cost,
 *  allocation) lives on {@link ClientAssignment}. Contact + bank fields are the
 *  Team-module extension of the shared model — optional so the Clients page,
 *  which never reads them, keeps compiling against the same type. */
export type TeamMember = {
  id: string
  name: string
  firstName?: string
  lastName?: string
  avatarUrl?: string
  role: string
  status: TeamMemberStatus
  employmentType: EmploymentType
  /** Agency start date (ISO), source of the "Antigüedad" tenure label. */
  startDate?: string
  compensation: Compensation
  email?: string
  phone?: string
  /** CUIT / CUIL (Argentina tax id). */
  taxId?: string
  bank?: BankDetails
  /** Derived from the API (holder + CBU/CVU present). The bank FIELDS live behind a
   *  capability gate and are absent from the member DTO, so this boolean — not `bank` —
   *  is what drives the pay-readiness signal for API-loaded members. */
  bankComplete?: boolean
  /** Three-valued twin of `bankComplete`, also API-derived: what the Datos bancarios badge
   *  and filter read, since `bank` is never loaded for the roster. */
  bankStatus?: 'complete' | 'incomplete' | 'none'
  /** Internal notes for the member detail (PRD §8.1). */
  notes?: string
}

/** Normalized member↔client relationship — the source of truth for everything
 *  that is specific to "this person on this client". Backed by mock records
 *  (deterministically seeded) until a real backend supplies them. */
export type AssignmentStatus = 'active' | 'paused' | 'ended'

export type ClientAssignment = {
  id: string
  clientId: string
  /** Denormalized for convenience in previews; mirrors clients[clientId].name. */
  clientName: string
  teamMemberId: string
  roleOnClient: string
  /** The catalogued service this person covers on the client (PRD §8.4). */
  serviceName?: string
  /** Relationship lifecycle, independent of the member's roster status. Soft-delete
   *  only: ending an assignment sets `status: 'ended'` + `endedAt` — the record is
   *  never removed, so mid-month altas/bajas and historical hours/productions stay
   *  attributable. `assignedSince` is the start date. */
  status?: AssignmentStatus
  assignedSince?: string
  /** Set when the assignment is ended (soft-delete). Past entries remain valid. */
  endedAt?: string
  allocationPercent?: number
  /** Expected monthly hours for this person on this client (PRD §8.4 carga estimada). */
  estimatedMonthlyHours?: number
  /**
   * What the studio pays this member for this client per month.
   *
   * TYPED per assignment, never derived: a `monthly_fixed` collaborator has no hourly
   * rate, so an hours-based estimate is blank for most of the team.
   *
   * `undefined` = nobody entered it, or the reader does not hold `teamCost`. `0` is a
   * real amount the studio agreed to. Every surface must render the first as absence
   * and the second as a figure; a truthiness check collapses them.
   *
   * This replaces a dead `currentMonth: { hours, productionsCount, estimatedCost }`
   * that the mock builder wrote and NOTHING ever read. Two cost-shaped fields on one
   * type, one live and one inert, is how the wrong one gets picked up later.
   */
  monthlyCost?: number
}

export type Client = {
  id: string

  name: string
  businessName?: string
  taxId?: string
  clientType?: string
  status: ClientStatus

  services: string[]

  /**
   * @deprecated Legacy denormalized roster. It still SEEDS `clientAssignments`
   * (buildClientAssignments) but must NOT drive render or calculations — the
   * normalized, mutable `clientAssignments` (via `membersForClient` /
   * `assignmentsForClient` in the shared store) is the source of truth. The client
   * detail is migrated; the table/list previews are a tracked follow-up.
   */
  assignedTeam: TeamMember[]

  monthlyFee: number
  /**
   * The fee's own currency. Segregated lanes, never converted: there is no FX rate
   * anywhere in the product and `money.ts` makes cross-currency arithmetic throw by
   * design, so a USD fee is shown as its own figure rather than blended into a peso
   * total.
   */
  currency: Currency

  /**
   * The month's money, projected from the CANONICAL receivables
   * (`clients-receivables.ts`) — not owned here.
   *
   * All four are OPTIONAL, and `undefined` means "nothing was billed to this client
   * this month". That is a state to render, not a zero to substitute: `$0` reads as a
   * real amount owed to nobody, and defaulting `currentMonthDueAmount` to `monthlyFee`
   * (which is what `dtoToClient` used to do on every successful fetch) presents the
   * contracted fee as though somebody had billed it.
   */
  paymentStatus?: PaymentStatus
  currentMonthPaidAmount?: number
  currentMonthDueAmount?: number
  expectedPaymentDate?: string
  lastPaymentDate?: string

  profitabilityPercent?: number
  profitabilityStatus?: ProfitabilityStatus

  /**
   * The monotributo emisor that bills this client. OPTIONAL on purpose: most of the
   * book is loaded before anyone decides who invoices it, and coercing a blank to
   * the first emisor would turn an unanswered question into a fabricated answer.
   */
  billingEntity?: BillingEntity
  /** Undefined when the client has no receivable this month — see the block above. */
  invoiceStatus?: InvoiceStatus

  startDate?: string
  lastIncreaseDate?: string
  lastMeetingDate?: string
  lastFeedbackDate?: string

  nextAction?: string
  notes?: string

  /** Search-only fields (PRD §7.1 searches contacto principal + email de facturación). */
  contactName?: string
  billingEmail?: string
  /** Contact phone. Drives the WhatsApp contact action. */
  phone?: string
  /** The client's domicilio. Display only: nothing parses, sorts or geocodes it. */
  address?: string
  /** A second contact email. Some clients bill to one address and read another. */
  secondaryEmail?: string
  /** The administrative contact, distinct from the day-to-day one. */
  adminContactName?: string
  adminContactEmail?: string
  adminContactPhone?: string

  /** How the client normally pays. */
  paymentMethod?: PaymentMethod
  /**
   * A standing discount off the monthly fee, in basis points (1000 = 10%).
   *
   * Kept in basis points rather than a percent so the value the UI shows and the value
   * the generator prices with are the same integer. `undefined` means no discount was
   * agreed, which every surface renders as absence rather than as 0%.
   */
  discountPercentBp?: number
  /** Recorded, not enforced: nothing derives a due date from it yet. */
  billingCycle?: BillingCycle
  /**
   * A one-off project fee alongside the monthly retainer, and when it ends. The fee
   * TYPE (monthly / project / both) is derived from which amounts are present.
   */
  projectFee?: number
  projectEndDate?: string

  createdAt: string
  updatedAt: string
}

/** Shared team roster reused across clients. Compensation spans all four models
 *  so the detail preview can exercise every "Cálculo" layout. */
const team: Record<string, TeamMember> = {
  flor: {
    id: 'tm-flor',
    name: 'Flor Giménez',
    firstName: 'Flor',
    lastName: 'Giménez',
    role: 'Account',
    status: 'active',
    employmentType: 'full_time',
    startDate: '2021-03-01',
    compensation: { model: 'monthly_fixed', monthlyAmount: 1200000, currency: 'ARS' },
    email: 'flor@holdstudio.com',
    phone: '+54 9 11 5544-1020',
    taxId: '27-35124870-4',
    bank: {
      bankName: 'Banco Galicia',
      accountHolder: 'Florencia Giménez',
      cbuOrCvu: '0070123430004012345678',
      alias: 'flor.gimenez.mp',
      accountType: 'savings',
    },
  },
  mica: {
    id: 'tm-mica',
    name: 'Mica Torres',
    firstName: 'Mica',
    lastName: 'Torres',
    role: 'Social',
    status: 'active',
    employmentType: 'part_time',
    startDate: '2023-06-01',
    compensation: { model: 'hourly', hourlyRate: 9000, currency: 'ARS' },
    email: 'mica@holdstudio.com',
    phone: '+54 9 11 5544-2244',
    taxId: '27-38920114-1',
    // Incomplete bank data (no CBU/CVU) — exercises the "Incompleto" state.
    bank: { bankName: 'Mercado Pago', alias: 'mica.torres' },
  },
  juan: {
    id: 'tm-juan',
    name: 'Juan Pérez',
    firstName: 'Juan',
    lastName: 'Pérez',
    role: 'Ads',
    status: 'active',
    employmentType: 'freelance',
    startDate: '2022-09-01',
    compensation: { model: 'hourly', hourlyRate: 12000, currency: 'ARS' },
    email: 'juan@holdstudio.com',
    phone: '+54 9 11 5544-3380',
    taxId: '20-33450980-7',
    bank: {
      bankName: 'Banco Nación',
      accountHolder: 'Juan Pérez',
      cbuOrCvu: '0110987620098712345678',
      alias: 'juan.perez.nac',
      accountType: 'checking',
    },
  },
  sol: {
    id: 'tm-sol',
    name: 'Sol Ramírez',
    firstName: 'Sol',
    lastName: 'Ramírez',
    role: 'Diseño',
    status: 'active',
    employmentType: 'freelance',
    startDate: '2020-11-01',
    compensation: { model: 'per_production', productionRate: 45000, currency: 'ARS' },
    email: 'sol@holdstudio.com',
    phone: '+54 9 11 5544-4471',
    taxId: '27-36880255-9',
    bank: {
      bankName: 'Brubank',
      accountHolder: 'Sol Ramírez',
      cbuOrCvu: '1430001712345678901234',
      alias: 'sol.ramirez',
      accountType: 'savings',
    },
  },
  nico: {
    id: 'tm-nico',
    name: 'Nico Vega',
    firstName: 'Nico',
    lastName: 'Vega',
    role: 'Producción',
    status: 'active',
    employmentType: 'full_time',
    startDate: '2019-05-01',
    compensation: { model: 'monthly_fixed', monthlyAmount: 1400000, currency: 'ARS' },
    email: 'nico@holdstudio.com',
    phone: '+54 9 11 5544-5562',
    taxId: '20-31207644-2',
    bank: {
      bankName: 'Banco Santander',
      accountHolder: 'Nicolás Vega',
      cbuOrCvu: '0720000788000123456789',
      alias: 'nico.vega.prod',
      accountType: 'checking',
    },
  },
  lara: {
    id: 'tm-lara',
    name: 'Lara Costa',
    firstName: 'Lara',
    lastName: 'Costa',
    role: 'Content',
    status: 'paused',
    employmentType: 'external',
    startDate: '2024-01-01',
    compensation: { model: 'mixed', currency: 'ARS' },
    email: 'lara@holdstudio.com',
    phone: '+54 9 11 5544-6650',
    // No bank data at all — exercises the "Sin datos" state.
  },
}

/** All catalogued services (PRD §6.3 Servicios — also the dynamic filter source). */
// Sentence case, and the exact strings are load-bearing: a client's services are
// compared by string equality (`client.services.includes(...)` in the filter), so
// re-adding an existing entry under different casing would create a second
// checkbox and a filter option that matches no existing client.
export const SERVICE_CATALOG = [
  'Redes',
  'Ads',
  'Producción',
  'Branding',
  'Desarrollo web',
  'Plan de marketing',
  'Diseño gráfico',
  'Email marketing',
  'Consultoría',
] as const

const clientsSeed: Client[] = [
  {
    id: 'cli-001',
    name: 'Café Roma',
    businessName: 'Roma Gastronomía SRL',
    taxId: '30-71045821-3',
    clientType: 'Gastronomía',
    status: 'active',
    services: ['Redes', 'Ads', 'Producción'],
    assignedTeam: [team.flor, team.mica, team.juan, team.nico],
    monthlyFee: 450000,
    currency: 'ARS',
    paymentStatus: 'overdue',
    currentMonthPaidAmount: 0,
    currentMonthDueAmount: 450000,
    expectedPaymentDate: '2026-06-05',
    lastPaymentDate: '2026-04-30',
    profitabilityPercent: 18,
    profitabilityStatus: 'low',
    billingEntity: 'monotributo_1',
    invoiceStatus: 'not_issued',
    startDate: '2024-02-01',
    lastIncreaseDate: '2025-04-01',
    lastMeetingDate: '2026-03-20',
    lastFeedbackDate: '2026-03-20',
    nextAction: 'Reclamar pago',
    contactName: 'Romina Alé',
    billingEmail: 'pagos@caferoma.com',
    createdAt: '2024-02-01',
    updatedAt: '2026-06-10',
  },
  {
    id: 'cli-002',
    name: 'Marea Contenidos',
    businessName: 'Marea Audiovisual SAS',
    taxId: '30-71588204-9',
    clientType: 'Productora',
    status: 'active',
    services: ['Producción', 'Branding'],
    assignedTeam: [team.nico, team.sol],
    monthlyFee: 680000,
    currency: 'ARS',
    paymentStatus: 'pending',
    currentMonthPaidAmount: 0,
    currentMonthDueAmount: 680000,
    expectedPaymentDate: '2026-06-20',
    lastPaymentDate: '2026-05-18',
    profitabilityPercent: 42,
    profitabilityStatus: 'high',
    billingEntity: 'monotributo_2',
    invoiceStatus: 'issued',
    startDate: '2023-09-15',
    lastIncreaseDate: '2026-01-10',
    lastMeetingDate: '2026-05-28',
    lastFeedbackDate: '2026-05-28',
    nextAction: 'Enviar factura',
    contactName: 'Diego Sosa',
    billingEmail: 'admin@mareacontenidos.com',
    createdAt: '2023-09-15',
    updatedAt: '2026-06-08',
  },
  {
    id: 'cli-003',
    name: 'Taller Sur',
    businessName: 'Sur Diseño Industrial',
    taxId: '27-30521478-4',
    clientType: 'Industria',
    status: 'paused',
    services: ['Redes'],
    assignedTeam: [team.mica],
    monthlyFee: 320000,
    currency: 'ARS',
    paymentStatus: 'paid',
    currentMonthPaidAmount: 320000,
    currentMonthDueAmount: 320000,
    expectedPaymentDate: '2026-06-05',
    lastPaymentDate: '2026-06-03',
    profitabilityPercent: 27,
    profitabilityStatus: 'medium',
    billingEntity: 'monotributo_1',
    invoiceStatus: 'paid',
    startDate: '2024-06-01',
    lastIncreaseDate: '2025-11-01',
    lastMeetingDate: '2026-04-15',
    nextAction: 'Agendar reunión',
    contactName: 'Pablo Núñez',
    billingEmail: 'pablo@tallersur.com',
    createdAt: '2024-06-01',
    updatedAt: '2026-06-03',
  },
  {
    id: 'cli-004',
    name: 'Verde Agencia',
    businessName: 'Verde Servicios Integrales SRL',
    taxId: '30-71299830-1',
    clientType: 'Servicios',
    status: 'active',
    services: ['Redes', 'Ads', 'Email marketing', 'Consultoría'],
    assignedTeam: [team.flor, team.juan, team.lara],
    monthlyFee: 510000,
    currency: 'ARS',
    paymentStatus: 'partial',
    currentMonthPaidAmount: 200000,
    currentMonthDueAmount: 510000,
    expectedPaymentDate: '2026-06-08',
    lastPaymentDate: '2026-06-09',
    profitabilityPercent: 33,
    profitabilityStatus: 'medium',
    billingEntity: 'monotributo_3',
    invoiceStatus: 'sent',
    startDate: '2023-03-01',
    lastIncreaseDate: '2024-05-01',
    lastMeetingDate: '2026-05-02',
    lastFeedbackDate: '2026-05-02',
    nextAction: 'Revisar aumento',
    contactName: 'Carla Méndez',
    billingEmail: 'finanzas@verdeagencia.com',
    createdAt: '2023-03-01',
    updatedAt: '2026-06-09',
  },
  {
    id: 'cli-005',
    name: 'Bruma Estudio',
    businessName: 'Bruma Estudio Creativo',
    taxId: '27-32874105-6',
    clientType: 'Estudio',
    status: 'churned',
    services: ['Branding'],
    assignedTeam: [team.sol],
    monthlyFee: 0,
    currency: 'ARS',
    paymentStatus: 'paid',
    currentMonthPaidAmount: 0,
    currentMonthDueAmount: 0,
    lastPaymentDate: '2025-12-20',
    profitabilityPercent: 0,
    profitabilityStatus: 'low',
    billingEntity: 'monotributo_2',
    invoiceStatus: 'paid',
    startDate: '2022-08-01',
    lastIncreaseDate: '2024-02-01',
    lastMeetingDate: '2025-12-15',
    nextAction: undefined,
    contactName: 'Inés Lara',
    billingEmail: 'hola@brumaestudio.com',
    createdAt: '2022-08-01',
    updatedAt: '2025-12-20',
  },
  {
    id: 'cli-006',
    name: 'Costa Diseño',
    businessName: 'Costa Diseño y Branding SRL',
    taxId: '30-70994512-8',
    clientType: 'Estudio',
    status: 'active',
    services: ['Branding', 'Producción'],
    assignedTeam: [team.sol, team.nico],
    monthlyFee: 395000,
    currency: 'ARS',
    paymentStatus: 'paid',
    currentMonthPaidAmount: 395000,
    currentMonthDueAmount: 395000,
    expectedPaymentDate: '2026-06-05',
    lastPaymentDate: '2026-06-04',
    profitabilityPercent: 48,
    profitabilityStatus: 'high',
    billingEntity: 'monotributo_1',
    invoiceStatus: 'paid',
    startDate: '2024-01-15',
    lastIncreaseDate: '2026-03-01',
    lastMeetingDate: '2026-06-01',
    lastFeedbackDate: '2026-06-01',
    nextAction: undefined,
    contactName: 'Mariano Ruiz',
    billingEmail: 'mariano@costadiseno.com',
    createdAt: '2024-01-15',
    updatedAt: '2026-06-04',
  },
  {
    id: 'cli-007',
    name: 'Norte Logística',
    businessName: 'Norte Logística SA',
    taxId: '30-68421097-2',
    clientType: 'Logística',
    status: 'active',
    services: ['Ads', 'Consultoría'],
    assignedTeam: [team.juan, team.flor],
    monthlyFee: 720000,
    currency: 'ARS',
    paymentStatus: 'overdue',
    currentMonthPaidAmount: 0,
    currentMonthDueAmount: 720000,
    expectedPaymentDate: '2026-06-01',
    lastPaymentDate: '2026-04-28',
    profitabilityPercent: 38,
    profitabilityStatus: 'medium',
    billingEntity: 'monotributo_3',
    invoiceStatus: 'issued',
    startDate: '2023-11-01',
    lastIncreaseDate: '2024-12-01',
    lastMeetingDate: '2026-02-10',
    lastFeedbackDate: '2026-02-10',
    nextAction: 'Reclamar pago',
    contactName: 'Gabriel Ortiz',
    billingEmail: 'cobros@nortelogistica.com',
    createdAt: '2023-11-01',
    updatedAt: '2026-06-07',
  },
  {
    id: 'cli-008',
    name: 'Lumen Salud',
    businessName: 'Lumen Centro Médico',
    taxId: '30-71655320-7',
    clientType: 'Salud',
    status: 'onboarding',
    services: ['Redes', 'Branding'],
    assignedTeam: [team.mica, team.sol],
    monthlyFee: 540000,
    currency: 'ARS',
    paymentStatus: 'pending',
    currentMonthPaidAmount: 0,
    currentMonthDueAmount: 540000,
    expectedPaymentDate: '2026-06-25',
    profitabilityPercent: 30,
    profitabilityStatus: 'medium',
    billingEntity: 'monotributo_2',
    invoiceStatus: 'not_issued',
    startDate: '2026-06-01',
    lastMeetingDate: '2026-06-09',
    nextAction: 'Actualizar servicios',
    contactName: 'Valeria Paz',
    billingEmail: 'administracion@lumensalud.com',
    createdAt: '2026-06-01',
    updatedAt: '2026-06-09',
  },
  {
    id: 'cli-009',
    name: 'Origen Café',
    businessName: 'Origen Café de Especialidad',
    taxId: '27-35012984-1',
    clientType: 'Gastronomía',
    status: 'active',
    services: ['Redes', 'Producción'],
    assignedTeam: [team.mica, team.nico, team.lara],
    monthlyFee: 380000,
    currency: 'ARS',
    paymentStatus: 'paid',
    currentMonthPaidAmount: 380000,
    currentMonthDueAmount: 380000,
    expectedPaymentDate: '2026-06-05',
    lastPaymentDate: '2026-06-02',
    profitabilityPercent: 44,
    profitabilityStatus: 'high',
    billingEntity: 'monotributo_1',
    invoiceStatus: 'paid',
    startDate: '2024-09-01',
    lastIncreaseDate: '2025-03-01',
    lastMeetingDate: '2026-04-22',
    lastFeedbackDate: '2026-04-22',
    nextAction: 'Revisar aumento',
    contactName: 'Tomás Bravo',
    billingEmail: 'tomas@origencafe.com',
    createdAt: '2024-09-01',
    updatedAt: '2026-06-02',
  },
  {
    id: 'cli-010',
    name: 'Pampa Seguros',
    businessName: 'Pampa Seguros SA',
    taxId: '30-65122087-4',
    clientType: 'Seguros',
    status: 'active',
    services: ['Ads', 'Email marketing', 'Consultoría'],
    assignedTeam: [team.juan, team.lara, team.flor],
    monthlyFee: 890000,
    currency: 'ARS',
    paymentStatus: 'paid',
    currentMonthPaidAmount: 890000,
    currentMonthDueAmount: 890000,
    expectedPaymentDate: '2026-06-05',
    lastPaymentDate: '2026-06-05',
    profitabilityPercent: 52,
    profitabilityStatus: 'high',
    billingEntity: 'monotributo_3',
    invoiceStatus: 'paid',
    startDate: '2022-05-01',
    lastIncreaseDate: '2026-02-01',
    lastMeetingDate: '2026-05-30',
    lastFeedbackDate: '2026-05-30',
    nextAction: undefined,
    contactName: 'Andrea Funes',
    billingEmail: 'proveedores@pampaseguros.com',
    createdAt: '2022-05-01',
    updatedAt: '2026-06-05',
  },
  {
    id: 'cli-011',
    name: 'Delta Inmobiliaria',
    businessName: 'Delta Propiedades SRL',
    taxId: '30-70788341-5',
    clientType: 'Inmobiliaria',
    status: 'paused',
    services: ['Redes', 'Ads'],
    assignedTeam: [team.mica, team.juan],
    monthlyFee: 420000,
    currency: 'ARS',
    paymentStatus: 'pending',
    currentMonthPaidAmount: 0,
    currentMonthDueAmount: 420000,
    expectedPaymentDate: '2026-06-18',
    lastPaymentDate: '2026-05-12',
    profitabilityPercent: 22,
    profitabilityStatus: 'medium',
    billingEntity: 'monotributo_1',
    invoiceStatus: 'not_issued',
    startDate: '2024-04-01',
    lastIncreaseDate: '2024-04-01',
    lastMeetingDate: '2026-01-20',
    nextAction: 'Agendar reunión',
    contactName: 'Luciano Vidal',
    billingEmail: 'luciano@deltaprop.com',
    createdAt: '2024-04-01',
    updatedAt: '2026-05-12',
  },
  {
    id: 'cli-012',
    name: 'Aurora Moda',
    businessName: 'Aurora Indumentaria SRL',
    taxId: '30-71820455-0',
    clientType: 'Retail',
    status: 'active',
    services: ['Redes', 'Producción', 'Email marketing'],
    assignedTeam: [team.mica, team.nico, team.lara, team.sol],
    monthlyFee: 610000,
    currency: 'ARS',
    paymentStatus: 'partial',
    currentMonthPaidAmount: 300000,
    currentMonthDueAmount: 610000,
    expectedPaymentDate: '2026-06-10',
    lastPaymentDate: '2026-06-11',
    profitabilityPercent: 36,
    profitabilityStatus: 'medium',
    billingEntity: 'monotributo_2',
    invoiceStatus: 'sent',
    startDate: '2023-07-01',
    lastIncreaseDate: '2025-07-01',
    lastMeetingDate: '2026-05-15',
    lastFeedbackDate: '2026-05-15',
    nextAction: 'Reclamar saldo',
    contactName: 'Bianca Ferrer',
    billingEmail: 'pagos@auroramoda.com',
    createdAt: '2023-07-01',
    updatedAt: '2026-06-11',
  },
  {
    id: 'cli-013',
    name: 'Sierra Outdoor',
    businessName: 'Sierra Equipamiento SA',
    taxId: '30-69755012-3',
    clientType: 'Retail',
    status: 'active',
    services: ['Ads', 'Producción'],
    assignedTeam: [team.juan, team.nico],
    monthlyFee: 475000,
    currency: 'ARS',
    paymentStatus: 'paid',
    currentMonthPaidAmount: 475000,
    currentMonthDueAmount: 475000,
    expectedPaymentDate: '2026-06-05',
    lastPaymentDate: '2026-06-01',
    profitabilityPercent: 41,
    profitabilityStatus: 'high',
    billingEntity: 'monotributo_3',
    invoiceStatus: 'paid',
    startDate: '2024-10-01',
    lastIncreaseDate: '2025-10-01',
    lastMeetingDate: '2026-03-08',
    lastFeedbackDate: '2026-03-08',
    nextAction: undefined,
    contactName: 'Federico Lima',
    billingEmail: 'fede@sierraoutdoor.com',
    createdAt: '2024-10-01',
    updatedAt: '2026-06-01',
  },
  {
    id: 'cli-014',
    name: 'Nube Software',
    businessName: 'Nube Tecnología SAS',
    taxId: '30-71933701-8',
    clientType: 'Tecnología',
    status: 'onboarding',
    services: ['Branding', 'Consultoría'],
    assignedTeam: [team.flor, team.sol],
    monthlyFee: 760000,
    currency: 'ARS',
    paymentStatus: 'pending',
    currentMonthPaidAmount: 0,
    currentMonthDueAmount: 760000,
    expectedPaymentDate: '2026-06-28',
    profitabilityPercent: 35,
    profitabilityStatus: 'medium',
    billingEntity: 'monotributo_2',
    invoiceStatus: 'not_issued',
    startDate: '2026-05-20',
    lastMeetingDate: '2026-06-12',
    lastFeedbackDate: '2026-06-12',
    nextAction: 'Actualizar servicios',
    contactName: 'Ezequiel Roca',
    billingEmail: 'admin@nubesoftware.com',
    createdAt: '2026-05-20',
    updatedAt: '2026-06-12',
  },
  {
    id: 'cli-015',
    name: 'Raíz Orgánica',
    businessName: 'Raíz Alimentos Naturales SRL',
    taxId: '30-71477820-6',
    clientType: 'Alimentos',
    status: 'active',
    services: ['Redes', 'Email marketing'],
    assignedTeam: [team.mica, team.lara],
    monthlyFee: 360000,
    currency: 'ARS',
    paymentStatus: 'overdue',
    currentMonthPaidAmount: 0,
    currentMonthDueAmount: 360000,
    expectedPaymentDate: '2026-06-03',
    lastPaymentDate: '2026-04-25',
    profitabilityPercent: 16,
    profitabilityStatus: 'low',
    billingEntity: 'monotributo_1',
    invoiceStatus: 'issued',
    startDate: '2023-12-01',
    lastIncreaseDate: '2024-06-01',
    lastMeetingDate: '2026-02-28',
    nextAction: 'Reclamar pago',
    contactName: 'Paula Sáez',
    billingEmail: 'paula@raizorganica.com',
    createdAt: '2023-12-01',
    updatedAt: '2026-06-06',
  },
  {
    id: 'cli-016',
    name: 'Faro Educación',
    businessName: 'Faro Instituto Educativo',
    taxId: '30-70233981-9',
    clientType: 'Educación',
    status: 'active',
    services: ['Redes', 'Ads', 'Branding'],
    assignedTeam: [team.flor, team.mica, team.sol],
    monthlyFee: 560000,
    currency: 'ARS',
    paymentStatus: 'paid',
    currentMonthPaidAmount: 560000,
    currentMonthDueAmount: 560000,
    expectedPaymentDate: '2026-06-05',
    lastPaymentDate: '2026-06-04',
    profitabilityPercent: 39,
    profitabilityStatus: 'medium',
    billingEntity: 'monotributo_2',
    invoiceStatus: 'paid',
    startDate: '2022-11-01',
    lastIncreaseDate: '2025-01-01',
    lastMeetingDate: '2026-05-20',
    lastFeedbackDate: '2026-05-20',
    nextAction: 'Revisar aumento',
    contactName: 'Hernán Díaz',
    billingEmail: 'administracion@faroeducacion.com',
    createdAt: '2022-11-01',
    updatedAt: '2026-06-04',
  },
  {
    id: 'cli-017',
    name: 'Brío Fitness',
    businessName: 'Brío Centros Deportivos SRL',
    taxId: '30-71712044-2',
    clientType: 'Fitness',
    status: 'active',
    services: ['Redes', 'Producción', 'Ads'],
    assignedTeam: [team.mica, team.juan, team.nico],
    monthlyFee: 430000,
    currency: 'ARS',
    paymentStatus: 'pending',
    currentMonthPaidAmount: 0,
    currentMonthDueAmount: 430000,
    expectedPaymentDate: '2026-06-22',
    lastPaymentDate: '2026-05-21',
    profitabilityPercent: 29,
    profitabilityStatus: 'medium',
    billingEntity: 'monotributo_1',
    invoiceStatus: 'not_issued',
    startDate: '2024-03-15',
    lastIncreaseDate: '2025-09-01',
    lastMeetingDate: '2026-04-30',
    lastFeedbackDate: '2026-04-30',
    nextAction: 'Enviar factura',
    contactName: 'Rocío Campos',
    billingEmail: 'rocio@briofitness.com',
    createdAt: '2024-03-15',
    updatedAt: '2026-05-21',
  },
  {
    id: 'cli-018',
    name: 'Vértice Arquitectura',
    businessName: 'Vértice Estudio de Arquitectura',
    taxId: '27-33908712-5',
    clientType: 'Arquitectura',
    status: 'paused',
    services: ['Branding'],
    assignedTeam: [team.sol],
    monthlyFee: 290000,
    currency: 'ARS',
    paymentStatus: 'paid',
    currentMonthPaidAmount: 290000,
    currentMonthDueAmount: 290000,
    expectedPaymentDate: '2026-06-05',
    lastPaymentDate: '2026-06-05',
    profitabilityPercent: 24,
    profitabilityStatus: 'medium',
    billingEntity: 'monotributo_3',
    invoiceStatus: 'paid',
    startDate: '2024-07-01',
    lastIncreaseDate: '2024-07-01',
    lastMeetingDate: '2026-03-12',
    nextAction: 'Agendar reunión',
    contactName: 'Martín Aguirre',
    billingEmail: 'martin@verticearq.com',
    createdAt: '2024-07-01',
    updatedAt: '2026-06-05',
  },
  {
    id: 'cli-019',
    name: 'Luz Eventos',
    businessName: 'Luz Producción de Eventos SRL',
    taxId: '30-71366229-7',
    clientType: 'Eventos',
    status: 'active',
    services: ['Producción', 'Redes', 'Branding', 'Ads'],
    assignedTeam: [team.nico, team.mica, team.sol, team.juan],
    monthlyFee: 640000,
    currency: 'ARS',
    paymentStatus: 'paid',
    currentMonthPaidAmount: 640000,
    currentMonthDueAmount: 640000,
    expectedPaymentDate: '2026-06-05',
    lastPaymentDate: '2026-06-03',
    profitabilityPercent: 46,
    profitabilityStatus: 'high',
    billingEntity: 'monotributo_2',
    invoiceStatus: 'paid',
    startDate: '2023-05-01',
    lastIncreaseDate: '2026-04-01',
    lastMeetingDate: '2026-06-06',
    lastFeedbackDate: '2026-06-06',
    nextAction: undefined,
    contactName: 'Sofía Linares',
    billingEmail: 'sofia@luzeventos.com',
    createdAt: '2023-05-01',
    updatedAt: '2026-06-03',
  },
  {
    id: 'cli-020',
    name: 'Cobre Bar',
    businessName: 'Cobre Cocktail Bar',
    taxId: '27-34551209-8',
    clientType: 'Gastronomía',
    status: 'churned',
    services: ['Redes'],
    assignedTeam: [team.mica],
    monthlyFee: 0,
    currency: 'ARS',
    paymentStatus: 'paid',
    currentMonthPaidAmount: 0,
    currentMonthDueAmount: 0,
    lastPaymentDate: '2026-01-15',
    profitabilityPercent: 12,
    profitabilityStatus: 'low',
    billingEntity: 'monotributo_1',
    invoiceStatus: 'paid',
    startDate: '2023-02-01',
    lastIncreaseDate: '2024-08-01',
    lastMeetingDate: '2026-01-10',
    nextAction: undefined,
    contactName: 'Nahuel Ponce',
    billingEmail: 'nahuel@cobrebar.com',
    createdAt: '2023-02-01',
    updatedAt: '2026-01-15',
  },
]

/** Deterministic AR mobile per client (mock) for the WhatsApp contact action. */
function seedPhone(index: number): string {
  return `+54 9 11 5555-${String(1000 + index).padStart(4, '0')}`
}

/** Clients enriched with a deterministic mock phone where none was authored. */
export const clients: Client[] = clientsSeed.map((client, index) => ({
  ...client,
  phone: client.phone ?? seedPhone(index),
}))

// ── Normalized assignments (member ↔ client) ────────────────────────────────
/** Numeric suffix of a client id (`cli-007` → 7), for deterministic seeding. */
function clientNumber(client: Client): number {
  return Number(client.id.replace(/\D/g, '')) || 1
}

/** Stable hash of a member id, so the seed varies per (client, member) pair. */
function memberHash(id: string): number {
  let sum = 0
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i)
  return sum
}

/**
 * Builds the normalized `ClientAssignment` table from the client roster. The
 * table is the source of truth for per-client attributes (role on client,
 * assigned-since, allocation, monthly hours/productions/cost); values are
 * seeded deterministically from the (client, member) pair so the dataset is
 * stable across reloads. A few records intentionally omit hours / cost /
 * assigned-since so the preview can exercise its empty states. Mock stand-in —
 * a real backend supplies these rows later.
 */
function buildClientAssignments(source: Client[]): ClientAssignment[] {
  const out: ClientAssignment[] = []
  for (const client of source) {
    const anchor = parseISO(client.startDate ?? client.createdAt)
    client.assignedTeam.forEach((member, idx) => {
      const seed = (clientNumber(client) * 7 + memberHash(member.id) + idx) % 100
      const comp = member.compensation
      const assignedSince =
        seed % 13 === 0 ? undefined : toIsoDate(addMonths(anchor, seed % 10))

      // Only the allocation survives. The hours / productions / estimated-cost figures
      // this block used to compute fed `currentMonth`, which nothing read — see the
      // note on `ClientAssignment.monthlyCost`. Seeding a per-client cost here would
      // be worse than seeding nothing: it is the exact figure the studio is now being
      // asked to enter, and a fabricated one is indistinguishable from a real one.
      const allocationPercent =
        comp.model === 'monthly_fixed' ? 15 + (seed % 4) * 10 : undefined

      // Service covered + relationship status + expected monthly load (Team §8.4).
      const serviceName = client.services[idx % client.services.length]
      const status: AssignmentStatus =
        seed % 17 === 0 ? 'ended' : seed % 7 === 0 ? 'paused' : 'active'
      const estimatedMonthlyHours = 12 + (seed % 5) * 4

      out.push({
        id: `${client.id}::${member.id}`,
        clientId: client.id,
        clientName: client.name,
        teamMemberId: member.id,
        roleOnClient: member.role,
        serviceName,
        status,
        assignedSince,
        allocationPercent,
        estimatedMonthlyHours,
      })
    })
  }
  return out
}

/** The normalized assignment table — iterate/query this, not `assignedTeam`. */
export const clientAssignments: ClientAssignment[] = buildClientAssignments(clients)

/** All roster members (for member-level lookups in the preview DTO). */
export const teamMembers: TeamMember[] = Object.values(team)
