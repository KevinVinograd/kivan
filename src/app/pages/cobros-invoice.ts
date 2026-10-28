/**
 * Facturación subflow model (PRD §9). The emitter monotributos (§9.5), the
 * fiscal-readiness check (§9.4), the send-message builder (§9.8) and the pure
 * reducers that produce the next `Receivable` for each flow (generate / associate
 * / send, plus the collection-status cancel). No backend: every reducer is a
 * synchronous local-state transform on the
 * demo data, mirroring how the rest of the app mutates its mock. There is no fake
 * ARCA round-trip and no artificial delay — generation succeeds locally, and the
 * "Error ARCA" state is represented by seeded data, retried through the same flow.
 */
import {
  formatMoney,
  formatMonthYear,
  TAX_PROFILE_LABEL,
  type StatusBadge,
  type TaxProfileId,
} from './cobranza-format'
import { todayIso } from '@/app/lib/iso-date'
import type { BillingStatus, Receivable } from './cobros-mock-data'

/**
 * The moment a reducer runs, as an activity timestamp.
 *
 * This was the literal `'2026-06-16T12:00:00'`, so every factura generated here
 * was stamped `invoiceIssuedAt` in the past and every action reported its
 * `lastActivityAt` as a day months gone — on ten importing surfaces across
 * `/cobros` and `/billing`. It also claimed to be "shared with the
 * monthly-operation dialogs so dates line up"; those were unpinned already, so
 * the sharing it described no longer existed and the date lined up with nothing.
 *
 * A FUNCTION and not a module-level `const`, for the reason
 * `monthly-operation-dialogs.tsx` states about its own lazy seeding: this is a
 * long-lived SPA, and a value frozen at import keeps stamping yesterday in a tab
 * left open across midnight — the same bug at a smaller scale.
 */
function activityNow(): string {
  return `${todayIso()}T${new Date().toTimeString().slice(0, 8)}`
}

// ── Emisores (§9.5): the three monotributos invoices can be issued from ───────
export type EmitterId = Exclude<TaxProfileId, 'unassigned'>

/** Nivel de alerta del monotributo (§9.5). */
export type EmitterAlertLevel =
  | 'disponible'
  | 'cerca_limite'
  | 'limite_alcanzado'
  | 'error_conexion'
  | 'datos_incompletos'

export type InvoiceEmitter = {
  id: EmitterId
  label: string
  cuit: string
  puntoDeVenta: string
  /** Uso acumulado del mes / límite mensual (facturación). */
  monthlyUsed: number
  monthlyLimit: number
  /** Uso acumulado anual / límite anual. */
  annualUsed: number
  annualLimit: number
  alert: EmitterAlertLevel
  /** Estado de conexión ARCA. */
  connected: boolean
}

/**
 * The three emisores, tuned to exercise the §9.5 alert states: one disponible,
 * one cerca del límite (warns, does not block), one con límite alcanzado (blocks
 * until the user picks another).
 */
export const INVOICE_EMITTERS: InvoiceEmitter[] = [
  {
    id: 'monotributo_1',
    label: TAX_PROFILE_LABEL.monotributo_1,
    cuit: '20-31045821-3',
    puntoDeVenta: '0001',
    monthlyUsed: 1480000,
    monthlyLimit: 2200000,
    annualUsed: 14200000,
    annualLimit: 26400000,
    alert: 'disponible',
    connected: true,
  },
  {
    id: 'monotributo_2',
    label: TAX_PROFILE_LABEL.monotributo_2,
    cuit: '27-30521478-4',
    puntoDeVenta: '0002',
    monthlyUsed: 2040000,
    monthlyLimit: 2200000,
    annualUsed: 19800000,
    annualLimit: 26400000,
    alert: 'cerca_limite',
    connected: true,
  },
  {
    id: 'monotributo_3',
    label: TAX_PROFILE_LABEL.monotributo_3,
    cuit: '30-68421097-2',
    puntoDeVenta: '0003',
    monthlyUsed: 2200000,
    monthlyLimit: 2200000,
    annualUsed: 25100000,
    annualLimit: 26400000,
    alert: 'limite_alcanzado',
    connected: true,
  },
]

export const EMITTER_ALERT_BADGE: Record<EmitterAlertLevel, StatusBadge> = {
  disponible: { label: 'Disponible', variant: 'success' },
  cerca_limite: { label: 'Cerca del límite', variant: 'warning' },
  limite_alcanzado: { label: 'Límite alcanzado', variant: 'danger' },
  error_conexion: { label: 'Error de conexión', variant: 'danger' },
  datos_incompletos: { label: 'Datos incompletos', variant: 'warning' },
}

/** Usage-bar tone per alert level (drives the §9.5 nivel de uso bar). */
export const EMITTER_ALERT_TONE: Record<EmitterAlertLevel, 'default' | 'success' | 'warning' | 'danger'> = {
  disponible: 'success',
  cerca_limite: 'warning',
  limite_alcanzado: 'danger',
  error_conexion: 'danger',
  datos_incompletos: 'warning',
}

/** Límite alcanzado / error de conexión block the action; the rest only warn. */
export function isBlockingAlert(level: EmitterAlertLevel): boolean {
  return level === 'limite_alcanzado' || level === 'error_conexion'
}

/** Monthly usage as a 0–100 percentage, for the nivel de uso bar. */
export function emitterUsagePct(emitter: InvoiceEmitter): number {
  if (emitter.monthlyLimit <= 0) return 0
  return Math.round((emitter.monthlyUsed / emitter.monthlyLimit) * 100)
}

export function emitterById(id?: TaxProfileId): InvoiceEmitter | undefined {
  return INVOICE_EMITTERS.find((emitter) => emitter.id === id)
}

/** Monotributo sugerido (§9.5): the receivable's own emisor when usable, else the
 *  first non-blocking emisor. */
export function suggestedEmitter(r: Receivable): InvoiceEmitter {
  const own = emitterById(r.taxProfileId)
  if (own && !isBlockingAlert(own.alert)) return own
  return INVOICE_EMITTERS.find((emitter) => !isBlockingAlert(emitter.alert)) ?? INVOICE_EMITTERS[0]
}

// ── Estado de facturación: contextual availability ───────────────────────────
const UNBILLED: BillingStatus[] = ['no_invoice', 'pending', 'error_arca']
const BILLED: BillingStatus[] = ['invoiced', 'sent', 'manual']

/** Whether a cobro can still be invoiced (generate / associate are offered). */
export function canInvoice(r: Receivable): boolean {
  return UNBILLED.includes(r.billingStatus)
}

/** Whether a cobro already has an invoice and can be sent. */
export function isBilled(r: Receivable): boolean {
  return BILLED.includes(r.billingStatus)
}

// ── Datos requeridos (§9.4) ──────────────────────────────────────────────────
export type InvoiceReadiness = { ready: boolean; missing: string[] }

/** Validates the fiscal data needed to generate (§9.4). A `pending` billing
 *  status is the explicit "pendiente de datos" marker (missing condición fiscal). */
export function invoiceReadiness(r: Receivable): InvoiceReadiness {
  const missing: string[] = []
  if (!r.businessName) missing.push('Razón social')
  if (!r.taxId) missing.push('CUIT / DNI')
  if (r.taxProfileId === 'unassigned') missing.push('Monotributo asignado')
  if (r.billingStatus === 'pending') missing.push('Condición fiscal')
  return { ready: missing.length === 0, missing }
}

// ── Pure reducers ─────────────────────────────────────────────────────────────
/** Numeric suffix of a receivable id (`rec-007` -> 7), for deterministic synth. */
function seedNum(id: string): number {
  return Number(id.replace(/\D/g, '')) || 1
}

/** Synthesized 14-digit CAE, deterministic per receivable. */
function synthCae(id: string): string {
  return (10000000000000 + seedNum(id) * 7654321).toString().slice(0, 14)
}

/** §9.6 — generate a factura locally from the chosen emisor. */
export function generateInvoice(r: Receivable, emitter: InvoiceEmitter): Receivable {
  const seq = String(1000 + seedNum(r.id)).padStart(8, '0')
  return {
    ...r,
    billingStatus: 'invoiced',
    taxProfileId: emitter.id,
    emitterTaxProfile: emitter.id,
    invoiceNumber: `${emitter.puntoDeVenta}-${seq}`,
    invoiceIssuedAt: activityNow(),
    cae: synthCae(r.id),
    lastActivityLabel: 'Factura generada',
    lastActivityAt: activityNow(),
  }
}

export type AssociateInput = {
  invoiceNumber: string
  issuedAt: string
  emitter: EmitterId
  amount: number
  notes?: string
}

/** §9.7 — associate an externally emitted factura. */
export function associateInvoice(r: Receivable, input: AssociateInput): Receivable {
  return {
    ...r,
    billingStatus: 'manual',
    invoiceNumber: input.invoiceNumber.trim(),
    invoiceIssuedAt: input.issuedAt,
    emitterTaxProfile: input.emitter,
    taxProfileId: input.emitter,
    cae: undefined,
    notes: input.notes?.trim() || r.notes,
    lastActivityLabel: 'Factura asociada',
    lastActivityAt: activityNow(),
  }
}

export type SendChannel = 'factura' | 'cuenta_corriente'

const SENT_LABEL: Record<SendChannel, string> = {
  factura: 'Factura enviada',
  cuenta_corriente: 'Cuenta corriente enviada',
}

/** §9.8 — mark the factura / cuenta corriente as sent. */
export function markInvoiceSent(r: Receivable, channel: SendChannel): Receivable {
  return {
    ...r,
    // A manually associated invoice keeps its 'manual' origin: overwriting it to
    // 'sent' would erase the Manual distinction. The send is recorded in the last
    // activity instead; other invoices advance to 'sent'.
    billingStatus: r.billingStatus === 'manual' ? 'manual' : 'sent',
    lastActivityLabel: SENT_LABEL[channel],
    lastActivityAt: activityNow(),
  }
}

export type FiscalDataInput = {
  businessName: string
  taxId: string
  taxProfileId: TaxProfileId
}

/** Edit the fiscal data (§9.4) a factura needs. When the cobro was marked
 *  "pendiente de datos" (billingStatus 'pending') and the data is now complete,
 *  lift it to 'no_invoice' so the facturación path unblocks. */
export function editFiscalData(r: Receivable, input: FiscalDataInput): Receivable {
  const businessName = input.businessName.trim()
  const taxId = input.taxId.trim()
  const complete = Boolean(businessName) && Boolean(taxId) && input.taxProfileId !== 'unassigned'
  return {
    ...r,
    businessName: businessName || undefined,
    taxId: taxId || undefined,
    taxProfileId: input.taxProfileId,
    billingStatus: r.billingStatus === 'pending' && complete ? 'no_invoice' : r.billingStatus,
    lastActivityLabel: 'Datos fiscales actualizados',
    lastActivityAt: activityNow(),
  }
}

/**
 * §9.8 — the prepared message for the send dialog (preview + copy).
 *
 * Every figure here is in the COBRO's lane, via `formatMoney`. This is the one string
 * in the product that leaves the studio: the operator copies it and sends it to the
 * client. It used to run every amount through the peso-only `formatCurrency`, so a
 * factura for USD 3.500 was quoted to the client as "por $ 3.500" — off by roughly the
 * exchange rate, in writing, over the studio's name.
 */
export function buildSendMessage(r: Receivable, channel: SendChannel): string {
  const greeting = `Hola ${r.contactName ?? r.clientName},`
  const balance = r.totalAmount - r.collectedAmount
  const money = (amount: number) => formatMoney(amount, r.currency)
  if (channel === 'cuenta_corriente') {
    return [
      greeting,
      `Te compartimos la cuenta corriente de ${formatMonthYear(r.period)}.`,
      `Total del período: ${money(r.totalAmount)}.`,
      `Saldo pendiente: ${money(balance)}.`,
      'Cualquier duda quedamos a disposición.',
    ].join('\n')
  }
  return [
    greeting,
    `Te enviamos la factura ${r.invoiceNumber ?? ''} por ${money(r.totalAmount)}.`,
    `Servicio: ${r.service}, período ${formatMonthYear(r.period)}.`,
    'Cualquier duda quedamos a disposición.',
  ].join('\n')
}

// ── Dialog orchestration ──────────────────────────────────────────────────────
/** Which cobros dialog is open (the tab owns this state). */
export type CobrosInvoiceDialog =
  | { kind: 'none' }
  | { kind: 'generate'; receivable: Receivable }
  | { kind: 'associate'; receivable: Receivable }
  | { kind: 'send'; receivable: Receivable }
  | { kind: 'collect'; receivable: Receivable }
  | { kind: 'edit'; receivable: Receivable }
  | { kind: 'fiscal'; receivable: Receivable }
