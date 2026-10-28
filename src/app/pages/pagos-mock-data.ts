/**
 * Pagos mock data — the PRD §22.2 Payment model + a local demo dataset.
 *
 * No backend: in-memory pagos to colaboradoras, proveedores, empleados, gastos
 * fijos, monotributos and plataformas that exercise every payment state, type and
 * method so the table, filters, KPIs and states can be validated end to end.
 * Single demo period (Junio 2026). Numbers are numbers, dates are ISO strings;
 * formatting happens only at render (`pagos-format.ts`). Replaced by a real data
 * source later.
 */
import type { Currency } from '@hold/shared'


/** Estado de pago (badges §25.2). */
export type PaymentStatus = 'pending' | 'approved' | 'paid' | 'partial' | 'overdue' | 'cancelled'

/** Tipo de pago / destinatario (§11.2). */
export type RecipientType =
  | 'collaborator'
  | 'provider'
  | 'employee'
  | 'fixed_expense'
  | 'monotributo'
  | 'platform'

export type PaymentMethod = 'transfer' | 'cash' | 'mercado_pago' | 'other'

export type Payment = {
  id: string
  recipientName: string
  recipientType: RecipientType
  /**
   * The recipient's real FK, when it has one. Polymorphic by `recipientType`:
   * `teamMemberId` for colaboradora / empleado, `providerId` for proveedor or for the
   * gasto fijo / plataforma that names who it is paid TO, and `invoiceEmitterId` for a
   * monotributo cuota.
   *
   * A gasto fijo and a plataforma used to carry none of these, on the reasoning that
   * they had no counterparty record. They do: the landlord and the subscription are
   * proveedores, and the column was always there — the dialog simply never offered it.
   * Still optional, because a bank fee genuinely has nobody to name.
   *
   * The detail panel needs these to reach the period's liquidación and the ledger;
   * `recipientName` cannot stand in, because two people may share a name.
   */
  teamMemberId?: string
  providerId?: string
  invoiceEmitterId?: string

  /** First day of the period (ISO), rendered as "Mes Año". */
  period: string
  concept: string

  totalAmount: number
  paidAmount: number
  /**
   * The lane the money moved in.
   *
   * This was declared as the LITERAL 'ARS', which is why no compiler error ever flagged
   * the mapper that hardcoded the same literal: a USD pago arrived relabelled as pesos and
   * was added to peso totals at face value, printing USD 1.000 as $ 1.000. Widened so
   * every consumer has to say what it does with a non-peso row.
   */
  currency: Currency

  expectedDate: string
  paymentDate?: string
  status: PaymentStatus
  method?: PaymentMethod
  /** Where the cash left from — a treasury account, named. Undefined when the payment
   *  did not say. Rendered only when present. */
  treasuryAccountId?: string
  treasuryAccountName?: string
  /** Cuenta / Alias for the transfer (PRD §11.4). */
  accountAlias?: string

  lastActivityLabel: string
  lastActivityAt: string
  notes?: string
}

const PERIOD = '2026-06-01'

type PaymentSeed = Omit<Payment, 'currency' | 'period'> & { period?: string }

const paymentsSeed: PaymentSeed[] = [
  {
    id: 'pay-001',
    recipientName: 'Mica Torres',
    recipientType: 'collaborator',
    concept: 'Horas mensuales',
    // B-1b: aligned to Operación mensual (viáticos 35k + ajuste 90k = 125k owed, unpaid).
    totalAmount: 125000,
    paidAmount: 0,
    expectedDate: '2026-06-10',
    status: 'pending',
    method: 'transfer',
    accountAlias: 'mica.torres',
    lastActivityLabel: 'Pago creado',
    lastActivityAt: '2026-06-01T09:00:00',
  },
  {
    id: 'pay-002',
    recipientName: 'Juan Pérez',
    recipientType: 'collaborator',
    concept: 'Producción de contenido',
    // B-1b: aligned to Operación mensual (owed 240k, fully paid on 2026-06-10).
    totalAmount: 240000,
    paidAmount: 240000,
    expectedDate: '2026-06-10',
    paymentDate: '2026-06-10',
    status: 'paid',
    method: 'transfer',
    accountAlias: 'juan.perez.nac',
    lastActivityLabel: 'Pago realizado',
    lastActivityAt: '2026-06-10T12:00:00',
  },
  {
    id: 'pay-003',
    recipientName: 'Sol Ramírez',
    recipientType: 'collaborator',
    concept: 'Producciones del mes',
    // B-1b: aligned to Operación mensual (owed 288k = prod 270k + viáticos 18k, partial 150k).
    totalAmount: 288000,
    paidAmount: 150000,
    expectedDate: '2026-06-05',
    status: 'partial',
    method: 'mercado_pago',
    accountAlias: 'sol.ramirez',
    lastActivityLabel: 'Pago parcial registrado',
    lastActivityAt: '2026-06-04T16:00:00',
  },
  {
    id: 'pay-004',
    recipientName: 'Nico Vega',
    recipientType: 'employee',
    concept: 'Fee fijo',
    // B-1b: aligned to Operación mensual (owed 1442k = fee 1400k + viáticos 42k, unpaid).
    totalAmount: 1442000,
    paidAmount: 0,
    expectedDate: '2026-06-05',
    status: 'pending',
    method: 'transfer',
    accountAlias: 'nico.vega.prod',
    lastActivityLabel: 'Pago creado',
    lastActivityAt: '2026-06-01T09:00:00',
  },
  {
    id: 'pay-005',
    recipientName: 'Flor Giménez',
    recipientType: 'employee',
    concept: 'Fee fijo',
    // B-1b: aligned to Operación mensual (owed 1200k, unpaid in the draft close).
    totalAmount: 1200000,
    paidAmount: 0,
    expectedDate: '2026-06-05',
    status: 'pending',
    method: 'transfer',
    accountAlias: 'flor.gimenez.mp',
    lastActivityLabel: 'Pago creado',
    lastActivityAt: '2026-06-01T09:00:00',
  },
  {
    id: 'pay-006',
    recipientName: 'Adobe Creative Cloud',
    recipientType: 'platform',
    concept: 'Plataforma de diseño',
    totalAmount: 78000,
    paidAmount: 78000,
    expectedDate: '2026-06-02',
    paymentDate: '2026-06-02',
    status: 'paid',
    method: 'other',
    lastActivityLabel: 'Pago realizado',
    lastActivityAt: '2026-06-02T08:00:00',
  },
  {
    id: 'pay-007',
    recipientName: 'Meta Ads',
    recipientType: 'platform',
    concept: 'Inversión publicitaria',
    totalAmount: 320000,
    paidAmount: 0,
    expectedDate: '2026-06-15',
    status: 'pending',
    method: 'other',
    lastActivityLabel: 'Pago creado',
    lastActivityAt: '2026-06-01T09:30:00',
  },
  {
    id: 'pay-008',
    recipientName: 'Monotributo 1',
    recipientType: 'monotributo',
    concept: 'Monotributo mensual',
    totalAmount: 42000,
    paidAmount: 0,
    expectedDate: '2026-06-12',
    status: 'overdue',
    method: 'transfer',
    lastActivityLabel: 'Vencimiento alcanzado',
    lastActivityAt: '2026-06-12T00:00:00',
  },
  {
    id: 'pay-009',
    recipientName: 'Monotributo 2',
    recipientType: 'monotributo',
    concept: 'Monotributo mensual',
    totalAmount: 65000,
    paidAmount: 0,
    expectedDate: '2026-06-20',
    status: 'pending',
    method: 'transfer',
    lastActivityLabel: 'Pago creado',
    lastActivityAt: '2026-06-01T09:00:00',
  },
  {
    id: 'pay-010',
    recipientName: 'Estudio Contable Sur',
    recipientType: 'provider',
    concept: 'Honorarios contables',
    totalAmount: 180000,
    paidAmount: 0,
    expectedDate: '2026-06-18',
    status: 'approved',
    method: 'transfer',
    accountAlias: 'estudiosur',
    lastActivityLabel: 'Pago aprobado',
    lastActivityAt: '2026-06-09T14:00:00',
  },
  {
    id: 'pay-011',
    recipientName: 'Alquiler oficina',
    recipientType: 'fixed_expense',
    concept: 'Alquiler mensual',
    totalAmount: 450000,
    paidAmount: 450000,
    expectedDate: '2026-06-05',
    paymentDate: '2026-06-03',
    status: 'paid',
    method: 'transfer',
    lastActivityLabel: 'Pago realizado',
    lastActivityAt: '2026-06-03T09:00:00',
  },
  {
    id: 'pay-012',
    recipientName: 'Internet y telefonía',
    recipientType: 'fixed_expense',
    concept: 'Servicios fijos',
    totalAmount: 55000,
    paidAmount: 0,
    expectedDate: '2026-06-14',
    status: 'pending',
    method: 'mercado_pago',
    lastActivityLabel: 'Pago creado',
    lastActivityAt: '2026-06-01T09:00:00',
  },
  {
    id: 'pay-013',
    recipientName: 'Lara Costa',
    recipientType: 'collaborator',
    concept: 'Viáticos',
    totalAmount: 48000,
    paidAmount: 0,
    expectedDate: '2026-06-11',
    status: 'pending',
    method: 'cash',
    lastActivityLabel: 'Pago creado',
    lastActivityAt: '2026-06-02T10:00:00',
  },
  {
    id: 'pay-014',
    recipientName: 'Productora Externa Vista',
    recipientType: 'provider',
    concept: 'Producción audiovisual',
    totalAmount: 290000,
    paidAmount: 0,
    expectedDate: '2026-06-16',
    status: 'cancelled',
    method: 'other',
    lastActivityLabel: 'Pago cancelado',
    lastActivityAt: '2026-06-07T15:00:00',
  },
  {
    id: 'pay-015',
    recipientName: 'Imprenta Delta',
    recipientType: 'provider',
    concept: 'Impresión de materiales',
    totalAmount: 95000,
    paidAmount: 50000,
    expectedDate: '2026-06-13',
    paymentDate: '2026-06-14',
    status: 'partial',
    method: 'transfer',
    accountAlias: 'imprenta.delta',
    lastActivityLabel: 'Pago parcial registrado',
    lastActivityAt: '2026-06-14T11:30:00',
  },

  // ── Mayo 2026 (prior month, settled) ─────────────────────────────────────
  {
    id: 'pay-101',
    recipientName: 'Mica Torres',
    recipientType: 'collaborator',
    period: '2026-05-01',
    concept: 'Horas mensuales',
    totalAmount: 540000,
    paidAmount: 540000,
    expectedDate: '2026-05-10',
    paymentDate: '2026-05-09',
    status: 'paid',
    method: 'transfer',
    accountAlias: 'mica.torres',
    lastActivityLabel: 'Pago realizado',
    lastActivityAt: '2026-05-09T16:00:00',
  },
  {
    id: 'pay-102',
    recipientName: 'Nico Vega',
    recipientType: 'employee',
    period: '2026-05-01',
    concept: 'Fee fijo',
    totalAmount: 1400000,
    paidAmount: 1400000,
    expectedDate: '2026-05-05',
    paymentDate: '2026-05-05',
    status: 'paid',
    method: 'transfer',
    accountAlias: 'nico.vega.prod',
    lastActivityLabel: 'Pago realizado',
    lastActivityAt: '2026-05-05T10:10:00',
  },
  {
    id: 'pay-103',
    recipientName: 'Alquiler oficina',
    recipientType: 'fixed_expense',
    period: '2026-05-01',
    concept: 'Alquiler mensual',
    totalAmount: 450000,
    paidAmount: 450000,
    expectedDate: '2026-05-05',
    paymentDate: '2026-05-03',
    status: 'paid',
    method: 'transfer',
    lastActivityLabel: 'Pago realizado',
    lastActivityAt: '2026-05-03T09:00:00',
  },
  {
    id: 'pay-104',
    recipientName: 'Monotributo 1',
    recipientType: 'monotributo',
    period: '2026-05-01',
    concept: 'Monotributo mensual',
    totalAmount: 42000,
    paidAmount: 42000,
    expectedDate: '2026-05-12',
    paymentDate: '2026-05-11',
    status: 'paid',
    method: 'transfer',
    lastActivityLabel: 'Pago realizado',
    lastActivityAt: '2026-05-11T08:00:00',
  },
  {
    id: 'pay-105',
    recipientName: 'Estudio Contable Sur',
    recipientType: 'provider',
    period: '2026-05-01',
    concept: 'Honorarios contables',
    totalAmount: 180000,
    paidAmount: 180000,
    expectedDate: '2026-05-18',
    paymentDate: '2026-05-19',
    status: 'paid',
    method: 'transfer',
    accountAlias: 'estudiosur',
    lastActivityLabel: 'Pago realizado',
    lastActivityAt: '2026-05-19T14:00:00',
  },
  {
    id: 'pay-106',
    recipientName: 'Imprenta Delta',
    recipientType: 'provider',
    period: '2026-05-01',
    concept: 'Impresión de materiales',
    totalAmount: 90000,
    paidAmount: 90000,
    expectedDate: '2026-05-13',
    paymentDate: '2026-05-14',
    status: 'paid',
    method: 'transfer',
    accountAlias: 'imprenta.delta',
    lastActivityLabel: 'Pago realizado',
    lastActivityAt: '2026-05-14T10:00:00',
  },

  // ── Abril 2026 (prior month, settled) ────────────────────────────────────
  {
    id: 'pay-201',
    recipientName: 'Mica Torres',
    recipientType: 'collaborator',
    period: '2026-04-01',
    concept: 'Horas mensuales',
    totalAmount: 520000,
    paidAmount: 520000,
    expectedDate: '2026-04-10',
    paymentDate: '2026-04-10',
    status: 'paid',
    method: 'transfer',
    accountAlias: 'mica.torres',
    lastActivityLabel: 'Pago realizado',
    lastActivityAt: '2026-04-10T15:00:00',
  },
  {
    id: 'pay-202',
    recipientName: 'Flor Giménez',
    recipientType: 'employee',
    period: '2026-04-01',
    concept: 'Fee fijo',
    totalAmount: 1200000,
    paidAmount: 1200000,
    expectedDate: '2026-04-05',
    paymentDate: '2026-04-05',
    status: 'paid',
    method: 'transfer',
    accountAlias: 'flor.gimenez.mp',
    lastActivityLabel: 'Pago realizado',
    lastActivityAt: '2026-04-05T11:00:00',
  },
  {
    id: 'pay-203',
    recipientName: 'Adobe Creative Cloud',
    recipientType: 'platform',
    period: '2026-04-01',
    concept: 'Plataforma de diseño',
    totalAmount: 78000,
    paidAmount: 78000,
    expectedDate: '2026-04-02',
    paymentDate: '2026-04-02',
    status: 'paid',
    method: 'other',
    lastActivityLabel: 'Pago realizado',
    lastActivityAt: '2026-04-02T08:00:00',
  },
  {
    id: 'pay-204',
    recipientName: 'Estudio Contable Sur',
    recipientType: 'provider',
    period: '2026-04-01',
    concept: 'Honorarios contables',
    totalAmount: 180000,
    paidAmount: 180000,
    expectedDate: '2026-04-18',
    paymentDate: '2026-04-18',
    status: 'paid',
    method: 'transfer',
    accountAlias: 'estudiosur',
    lastActivityLabel: 'Pago realizado',
    lastActivityAt: '2026-04-18T14:00:00',
  },
  {
    id: 'pay-205',
    recipientName: 'Productora Externa Vista',
    recipientType: 'provider',
    period: '2026-04-01',
    concept: 'Producción audiovisual',
    totalAmount: 290000,
    paidAmount: 290000,
    expectedDate: '2026-04-16',
    paymentDate: '2026-04-17',
    status: 'paid',
    method: 'transfer',
    accountAlias: 'productora.vista',
    lastActivityLabel: 'Pago realizado',
    lastActivityAt: '2026-04-17T15:00:00',
  },
  {
    id: 'pay-206',
    recipientName: 'Imprenta Delta',
    recipientType: 'provider',
    period: '2026-04-01',
    concept: 'Impresión de materiales',
    totalAmount: 92000,
    paidAmount: 92000,
    expectedDate: '2026-04-13',
    paymentDate: '2026-04-14',
    status: 'paid',
    method: 'transfer',
    accountAlias: 'imprenta.delta',
    lastActivityLabel: 'Pago realizado',
    lastActivityAt: '2026-04-14T10:00:00',
  },
]

/** The demo payments, with the shared period and currency applied. */
export const payments: Payment[] = paymentsSeed.map((seed) => ({
  ...seed,
  period: seed.period ?? PERIOD,
  currency: 'ARS',
}))
