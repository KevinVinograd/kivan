/**
 * Cobros mock data — the PRD §22.1 Receivable model + a local demo dataset.
 *
 * No backend: in-memory cobros that exercise every collection state, billing
 * state and monotributo so the table, filters, KPIs and states can be validated
 * end to end. Single demo period (Junio 2026); the period switcher is deferred.
 * Numbers are stored as numbers and dates as ISO strings — formatting happens
 * only at render (`cobros-format.ts`). `totalAmount` is derived from base + extra
 * - discount at build time so the figures stay internally consistent. Replaced by
 * a real data source later.
 */
import type { Currency } from '@hold/shared'

import type { TaxProfileId } from './cobranza-format'

/** Estado de cobro — the financial state of the receivable (badges §25.2). */
export type CollectionStatus = 'pending' | 'collected' | 'partial' | 'overdue' | 'cancelled'

/** Estado de facturación — independent of the collection state (badges §25.2). */
export type BillingStatus =
  | 'no_invoice'
  | 'pending'
  | 'invoiced'
  | 'sent'
  | 'error_arca'
  | 'manual'
  | 'not_required'

/** One itemized extra on a cobro (amount in major units, unlike the DTO). */
export type ReceivableExtraItem = {
  id?: string
  description: string
  amount: number
  /** Whether it goes on the factura. Non-billable extras still raise the amount owed. */
  billable: boolean
}

export type Receivable = {
  id: string
  /**
   * The owning client's real id. Optional only because rows built by the mock/seed
   * helpers predate it; every row that came from the API carries it.
   *
   * It used to be dropped in the DTO mapping even though the API returns it, which
   * forced every cross-store join to match on a normalized `clientName` + period
   * (see `monthly-operation-finance-bridge.ts`). A name match is wrong the moment two
   * clients read alike or one is renamed — and `/clientes` bases its whole money
   * column on this join.
   */
  clientId?: string
  clientName: string
  clientType?: string
  /** Search-only fiscal/contact fields (§8.4 search). */
  businessName?: string
  taxId?: string
  contactName?: string
  invoiceNumber?: string

  /** First day of the billed month (ISO), rendered as "Mes Año". */
  period: string
  service: string

  baseAmount: number
  extraAmount: number
  /**
   * The itemized extras behind `extraAmount`. The aggregate alone cannot say WHAT was
   * charged, which is the whole point of a trabajo extra — the API has modelled them
   * from the start and the front mapping dropped them.
   */
  extras: ReceivableExtraItem[]
  discountAmount: number
  /** base + extra - discount (derived at build time). */
  totalAmount: number
  collectedAmount: number
  /** The lane the cobro is billed in. Declared as the literal 'ARS' until a non-peso
   *  client proved otherwise; see `originalCurrency` below for the USD-priced case. */
  currency: Currency
  /**
   * Where the amount came from, when the retainer was priced in another currency.
   *
   * The studio prices some clients in dollars and invoices them in pesos, at a rate it
   * fixes for the month. THAT cobro is pesos, so `currency` above reads 'ARS' and these two
   * are what let the detail say which dollar figure and which rate produced it. Absent
   * together on every cobro billed in the currency it was priced in.
   *
   * Conversion happens only when the studio CHOSE to price in dollars and invoice in
   * pesos. A client billed in their own lane keeps it, so `currency` is NOT always 'ARS'
   * and no consumer may assume it.
   *
   * A record of what was billed, not a live conversion: the rate here is the one used at
   * generation, and next month's rate does not change it.
   */
  originalCurrency?: string
  originalAmount?: number
  /** ARS per 1 unit of `originalCurrency`, as used. Major units: 1234.5 = $1.234,50. */
  fxRate?: number
  /**
   * Cost by area, in pesos — what the work cost the studio, the other side of what the
   * client was billed. Optional because a row built before costs were writable carries
   * none; a missing value means "not recorded", which reads as 0 cost in the reports.
   */
  costs?: {
    design: number
    comm: number
    production: number
    viatics: number
    pauta: number
    fixed: number
  }

  dueDate: string
  /**
   * When the cash actually arrived (ISO), set once something is collected. The API has
   * carried it since the row was found to be rendering its `createdAt` as the "Fecha de
   * cobro"; the front mapping still dropped it, so anything needing a collection date
   * had to fall back to an unrelated timestamp.
   */
  collectedAt?: string
  /**
   * Where the cash landed — a treasury account, named. Undefined when the collection
   * did not say, which is true of every row collected before the destination existed.
   * The detail renders NOTHING for an undefined one: this replaced a medio de pago the
   * old code picked from the digits of the row id, and a plausible-looking default is
   * the same defect wearing a different value.
   */
  treasuryAccountId?: string
  treasuryAccountName?: string
  status: CollectionStatus
  billingStatus: BillingStatus
  taxProfileId: TaxProfileId

  /** Invoice subflow (§9) — set when a factura is generated or associated. */
  invoiceIssuedAt?: string
  cae?: string
  /** Emisor (monotributo) the factura was issued from. */
  emitterTaxProfile?: TaxProfileId

  /** Última actividad — a short label + when it happened. */
  lastActivityLabel: string
  lastActivityAt: string
  notes?: string
}

const PERIOD = '2026-06-01'

type ReceivableSeed = Omit<
  Receivable,
  'totalAmount' | 'currency' | 'period' | 'clientId' | 'extras'
> & {
  period?: string
}

const receivablesSeed: ReceivableSeed[] = [
  {
    id: 'rec-001',
    clientName: 'Café Roma',
    clientType: 'Gastronomía',
    businessName: 'Roma Gastronomía SRL',
    taxId: '30-71045821-3',
    contactName: 'Romina Alé',
    invoiceNumber: '0001-00000142',
    service: 'Gestión mensual',
    baseAmount: 450000,
    // Extra = campaña día del padre (80k) + producciones (120k); aligns the receivable
    // total to Operación mensual's clientTotalToBill (650k) — actuals-shared, B-1a.
    extraAmount: 200000,
    discountAmount: 0,
    collectedAmount: 0,
    dueDate: '2026-06-05',
    status: 'overdue',
    billingStatus: 'invoiced',
    taxProfileId: 'monotributo_1',
    lastActivityLabel: 'Recordatorio enviado',
    lastActivityAt: '2026-06-12T10:15:00',
  },
  {
    id: 'rec-002',
    clientName: 'Marea Contenidos',
    clientType: 'Productora',
    businessName: 'Marea Audiovisual SAS',
    taxId: '30-71588204-9',
    contactName: 'Diego Sosa',
    service: 'Producción de contenido',
    baseAmount: 680000,
    // B-1a: aligned to Operación mensual (owed 680k, fully collected on 2026-06-08).
    extraAmount: 0,
    discountAmount: 0,
    collectedAmount: 680000,
    dueDate: '2026-06-20',
    status: 'collected',
    billingStatus: 'no_invoice',
    taxProfileId: 'monotributo_2',
    lastActivityLabel: 'Pago registrado',
    lastActivityAt: '2026-06-08T12:00:00',
  },
  {
    id: 'rec-003',
    clientName: 'Taller Sur',
    clientType: 'Industria',
    businessName: 'Sur Diseño Industrial',
    taxId: '27-30521478-4',
    contactName: 'Pablo Núñez',
    invoiceNumber: '0001-00000138',
    service: 'Redes sociales',
    baseAmount: 320000,
    extraAmount: 0,
    discountAmount: 20000,
    collectedAmount: 300000,
    dueDate: '2026-06-05',
    status: 'collected',
    billingStatus: 'sent',
    taxProfileId: 'monotributo_1',
    lastActivityLabel: 'Pago registrado',
    lastActivityAt: '2026-06-04T16:40:00',
  },
  {
    id: 'rec-004',
    clientName: 'Verde Agencia',
    clientType: 'Servicios',
    businessName: 'Verde Servicios Integrales SRL',
    taxId: '30-71299830-1',
    contactName: 'Carla Méndez',
    invoiceNumber: '0001-00000151',
    service: 'Combo mensual',
    baseAmount: 510000,
    extraAmount: 60000,
    discountAmount: 0,
    collectedAmount: 200000,
    dueDate: '2026-06-08',
    status: 'partial',
    billingStatus: 'sent',
    taxProfileId: 'monotributo_3',
    lastActivityLabel: 'Cuenta corriente enviada',
    lastActivityAt: '2026-06-09T11:05:00',
  },
  {
    id: 'rec-005',
    clientName: 'Norte Logística',
    clientType: 'Logística',
    businessName: 'Norte Logística SA',
    taxId: '30-68421097-2',
    contactName: 'Gabriel Ortiz',
    service: 'Paid media',
    baseAmount: 720000,
    extraAmount: 0,
    discountAmount: 0,
    collectedAmount: 0,
    dueDate: '2026-06-01',
    status: 'overdue',
    billingStatus: 'error_arca',
    taxProfileId: 'monotributo_3',
    lastActivityLabel: 'Error de facturación',
    lastActivityAt: '2026-06-10T14:20:00',
  },
  {
    id: 'rec-006',
    clientName: 'Lumen Salud',
    clientType: 'Salud',
    businessName: 'Lumen Centro Médico',
    taxId: '30-71655320-7',
    contactName: 'Valeria Paz',
    service: 'Gestión mensual',
    baseAmount: 540000,
    extraAmount: 0,
    discountAmount: 0,
    collectedAmount: 0,
    dueDate: '2026-06-25',
    status: 'pending',
    billingStatus: 'pending',
    taxProfileId: 'monotributo_2',
    lastActivityLabel: 'Faltan datos fiscales',
    lastActivityAt: '2026-06-08T08:30:00',
  },
  {
    id: 'rec-007',
    clientName: 'Origen Café',
    clientType: 'Gastronomía',
    businessName: 'Origen Café de Especialidad',
    taxId: '27-35012984-1',
    contactName: 'Tomás Bravo',
    invoiceNumber: 'EXT-2026-0042',
    service: 'Redes sociales',
    baseAmount: 380000,
    extraAmount: 0,
    discountAmount: 0,
    collectedAmount: 380000,
    dueDate: '2026-06-05',
    status: 'collected',
    billingStatus: 'manual',
    taxProfileId: 'monotributo_1',
    lastActivityLabel: 'Factura asociada',
    lastActivityAt: '2026-06-03T13:10:00',
  },
  {
    id: 'rec-008',
    clientName: 'Pampa Seguros',
    clientType: 'Seguros',
    businessName: 'Pampa Seguros SA',
    taxId: '30-65122087-4',
    contactName: 'Andrea Funes',
    invoiceNumber: '0001-00000149',
    service: 'Paid media',
    baseAmount: 890000,
    extraAmount: 0,
    discountAmount: 40000,
    collectedAmount: 850000,
    dueDate: '2026-06-05',
    status: 'collected',
    billingStatus: 'sent',
    taxProfileId: 'monotributo_3',
    lastActivityLabel: 'Pago registrado',
    lastActivityAt: '2026-06-05T10:00:00',
  },
  {
    id: 'rec-009',
    clientName: 'Delta Inmobiliaria',
    clientType: 'Inmobiliaria',
    businessName: 'Delta Propiedades SRL',
    taxId: '30-70788341-5',
    contactName: 'Luciano Vidal',
    service: 'Redes sociales',
    baseAmount: 420000,
    extraAmount: 0,
    discountAmount: 0,
    collectedAmount: 0,
    dueDate: '2026-06-18',
    status: 'pending',
    billingStatus: 'no_invoice',
    taxProfileId: 'unassigned',
    lastActivityLabel: 'Cobro creado',
    lastActivityAt: '2026-06-02T09:45:00',
  },
  {
    id: 'rec-010',
    clientName: 'Aurora Moda',
    clientType: 'Retail',
    businessName: 'Aurora Indumentaria SRL',
    taxId: '30-71820455-0',
    contactName: 'Bianca Ferrer',
    invoiceNumber: '0001-00000147',
    service: 'Combo mensual',
    baseAmount: 610000,
    extraAmount: 90000,
    discountAmount: 0,
    collectedAmount: 300000,
    dueDate: '2026-06-10',
    status: 'partial',
    billingStatus: 'invoiced',
    taxProfileId: 'monotributo_2',
    lastActivityLabel: 'Factura generada',
    lastActivityAt: '2026-06-09T15:30:00',
  },
  {
    id: 'rec-011',
    clientName: 'Sierra Outdoor',
    clientType: 'Retail',
    businessName: 'Sierra Equipamiento SA',
    taxId: '30-69755012-3',
    contactName: 'Federico Lima',
    invoiceNumber: 'EXT-2026-0051',
    service: 'Paid media',
    baseAmount: 475000,
    extraAmount: 0,
    discountAmount: 0,
    collectedAmount: 475000,
    dueDate: '2026-06-05',
    status: 'collected',
    billingStatus: 'manual',
    taxProfileId: 'monotributo_3',
    lastActivityLabel: 'Factura asociada',
    lastActivityAt: '2026-06-01T12:00:00',
  },
  {
    id: 'rec-012',
    clientName: 'Nube Software',
    clientType: 'Tecnología',
    businessName: 'Nube Tecnología SAS',
    taxId: '30-71933701-8',
    contactName: 'Ezequiel Roca',
    service: 'Consultoría',
    baseAmount: 760000,
    extraAmount: 0,
    discountAmount: 0,
    collectedAmount: 0,
    dueDate: '2026-06-28',
    status: 'cancelled',
    billingStatus: 'no_invoice',
    taxProfileId: 'unassigned',
    lastActivityLabel: 'Cobro cancelado',
    lastActivityAt: '2026-06-06T17:25:00',
  },
  {
    id: 'rec-013',
    clientName: 'Raíz Orgánica',
    clientType: 'Alimentos',
    businessName: 'Raíz Alimentos Naturales SRL',
    taxId: '30-71477820-6',
    contactName: 'Paula Sáez',
    invoiceNumber: '0001-00000140',
    service: 'Email marketing',
    baseAmount: 360000,
    extraAmount: 0,
    discountAmount: 0,
    // B-1a: aligned to Operación mensual (owed 360k, partial 180k on 2026-06-12).
    collectedAmount: 180000,
    dueDate: '2026-06-03',
    status: 'partial',
    billingStatus: 'sent',
    taxProfileId: 'monotributo_1',
    lastActivityLabel: 'Pago parcial registrado',
    lastActivityAt: '2026-06-12T12:00:00',
  },
  {
    id: 'rec-014',
    clientName: 'Faro Educación',
    clientType: 'Educación',
    businessName: 'Faro Instituto Educativo',
    taxId: '30-70233981-9',
    contactName: 'Hernán Díaz',
    invoiceNumber: '0001-00000145',
    service: 'Combo mensual',
    baseAmount: 560000,
    extraAmount: 0,
    discountAmount: 0,
    collectedAmount: 560000,
    dueDate: '2026-06-05',
    status: 'collected',
    billingStatus: 'sent',
    taxProfileId: 'monotributo_2',
    lastActivityLabel: 'Pago registrado',
    lastActivityAt: '2026-06-04T11:20:00',
  },
  {
    id: 'rec-015',
    clientName: 'Brío Fitness',
    clientType: 'Fitness',
    businessName: 'Brío Centros Deportivos SRL',
    taxId: '30-71712044-2',
    contactName: 'Rocío Campos',
    service: 'Redes sociales',
    baseAmount: 430000,
    extraAmount: 0,
    discountAmount: 0,
    collectedAmount: 0,
    dueDate: '2026-06-22',
    status: 'pending',
    billingStatus: 'not_required',
    taxProfileId: 'monotributo_1',
    lastActivityLabel: 'Cobro creado',
    lastActivityAt: '2026-06-02T10:30:00',
  },

  // ── Mayo 2026 (prior month, mostly settled) ──────────────────────────────
  {
    id: 'rec-101',
    clientName: 'Café Roma',
    clientType: 'Gastronomía',
    businessName: 'Roma Gastronomía SRL',
    taxId: '30-71045821-3',
    contactName: 'Romina Alé',
    invoiceNumber: '0001-00000130',
    period: '2026-05-01',
    service: 'Gestión mensual',
    baseAmount: 450000,
    extraAmount: 0,
    discountAmount: 0,
    collectedAmount: 450000,
    dueDate: '2026-05-05',
    status: 'collected',
    billingStatus: 'sent',
    taxProfileId: 'monotributo_1',
    lastActivityLabel: 'Pago registrado',
    lastActivityAt: '2026-05-06T10:00:00',
  },
  {
    id: 'rec-102',
    clientName: 'Marea Contenidos',
    clientType: 'Productora',
    businessName: 'Marea Audiovisual SAS',
    taxId: '30-71588204-9',
    contactName: 'Diego Sosa',
    invoiceNumber: '0002-00000088',
    period: '2026-05-01',
    service: 'Producción de contenido',
    baseAmount: 680000,
    extraAmount: 0,
    discountAmount: 0,
    collectedAmount: 680000,
    dueDate: '2026-05-18',
    status: 'collected',
    billingStatus: 'sent',
    taxProfileId: 'monotributo_2',
    lastActivityLabel: 'Pago registrado',
    lastActivityAt: '2026-05-19T12:00:00',
  },
  {
    id: 'rec-103',
    clientName: 'Norte Logística',
    clientType: 'Logística',
    businessName: 'Norte Logística SA',
    taxId: '30-68421097-2',
    contactName: 'Gabriel Ortiz',
    invoiceNumber: '0003-00000044',
    period: '2026-05-01',
    service: 'Paid media',
    baseAmount: 720000,
    extraAmount: 0,
    discountAmount: 0,
    collectedAmount: 0,
    dueDate: '2026-05-01',
    status: 'overdue',
    billingStatus: 'invoiced',
    taxProfileId: 'monotributo_3',
    lastActivityLabel: 'Recordatorio enviado',
    lastActivityAt: '2026-05-22T09:30:00',
  },
  {
    id: 'rec-104',
    clientName: 'Lumen Salud',
    clientType: 'Salud',
    businessName: 'Lumen Centro Médico',
    taxId: '30-71655320-7',
    contactName: 'Valeria Paz',
    invoiceNumber: 'EXT-2026-0030',
    period: '2026-05-01',
    service: 'Gestión mensual',
    baseAmount: 540000,
    extraAmount: 0,
    discountAmount: 0,
    collectedAmount: 540000,
    dueDate: '2026-05-10',
    status: 'collected',
    billingStatus: 'manual',
    taxProfileId: 'monotributo_2',
    lastActivityLabel: 'Factura asociada',
    lastActivityAt: '2026-05-09T13:00:00',
  },
  {
    id: 'rec-105',
    clientName: 'Aurora Moda',
    clientType: 'Retail',
    businessName: 'Aurora Indumentaria SRL',
    taxId: '30-71820455-0',
    contactName: 'Bianca Ferrer',
    invoiceNumber: '0002-00000090',
    period: '2026-05-01',
    service: 'Combo mensual',
    baseAmount: 610000,
    extraAmount: 0,
    discountAmount: 0,
    collectedAmount: 300000,
    dueDate: '2026-05-10',
    status: 'partial',
    billingStatus: 'sent',
    taxProfileId: 'monotributo_2',
    lastActivityLabel: 'Pago parcial registrado',
    lastActivityAt: '2026-05-12T11:30:00',
  },

  // ── Abril 2026 (prior month, settled) ────────────────────────────────────
  {
    id: 'rec-201',
    clientName: 'Café Roma',
    clientType: 'Gastronomía',
    businessName: 'Roma Gastronomía SRL',
    taxId: '30-71045821-3',
    contactName: 'Romina Alé',
    invoiceNumber: '0001-00000118',
    period: '2026-04-01',
    service: 'Gestión mensual',
    baseAmount: 430000,
    extraAmount: 0,
    discountAmount: 0,
    collectedAmount: 430000,
    dueDate: '2026-04-05',
    status: 'collected',
    billingStatus: 'sent',
    taxProfileId: 'monotributo_1',
    lastActivityLabel: 'Pago registrado',
    lastActivityAt: '2026-04-06T10:00:00',
  },
  {
    id: 'rec-202',
    clientName: 'Taller Sur',
    clientType: 'Industria',
    businessName: 'Sur Diseño Industrial',
    taxId: '27-30521478-4',
    contactName: 'Pablo Núñez',
    invoiceNumber: '0001-00000115',
    period: '2026-04-01',
    service: 'Redes sociales',
    baseAmount: 320000,
    extraAmount: 0,
    discountAmount: 20000,
    collectedAmount: 300000,
    dueDate: '2026-04-05',
    status: 'collected',
    billingStatus: 'sent',
    taxProfileId: 'monotributo_1',
    lastActivityLabel: 'Pago registrado',
    lastActivityAt: '2026-04-04T16:00:00',
  },
  {
    id: 'rec-203',
    clientName: 'Pampa Seguros',
    clientType: 'Seguros',
    businessName: 'Pampa Seguros SA',
    taxId: '30-65122087-4',
    contactName: 'Andrea Funes',
    invoiceNumber: '0003-00000031',
    period: '2026-04-01',
    service: 'Paid media',
    baseAmount: 890000,
    extraAmount: 0,
    discountAmount: 40000,
    collectedAmount: 850000,
    dueDate: '2026-04-05',
    status: 'collected',
    billingStatus: 'sent',
    taxProfileId: 'monotributo_3',
    lastActivityLabel: 'Pago registrado',
    lastActivityAt: '2026-04-05T10:00:00',
  },
  {
    id: 'rec-204',
    clientName: 'Faro Educación',
    clientType: 'Educación',
    businessName: 'Faro Instituto Educativo',
    taxId: '30-70233981-9',
    contactName: 'Hernán Díaz',
    invoiceNumber: '0002-00000071',
    period: '2026-04-01',
    service: 'Combo mensual',
    baseAmount: 560000,
    extraAmount: 0,
    discountAmount: 0,
    collectedAmount: 560000,
    dueDate: '2026-04-05',
    status: 'collected',
    billingStatus: 'sent',
    taxProfileId: 'monotributo_2',
    lastActivityLabel: 'Pago registrado',
    lastActivityAt: '2026-04-04T11:20:00',
  },
]

/** The demo receivables, with `totalAmount` derived and the shared period applied. */
export const receivables: Receivable[] = receivablesSeed.map((seed) => ({
  ...seed,
  period: seed.period ?? PERIOD,
  currency: 'ARS',
  // The seeds carry no itemization behind their `extraAmount` aggregate — only rows
  // that came from the API do.
  extras: [],
  totalAmount: seed.baseAmount + seed.extraAmount - seed.discountAmount,
}))
