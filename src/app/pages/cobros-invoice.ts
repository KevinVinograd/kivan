import {
  formatMoney,
  formatMonthYear,
  TAX_PROFILE_LABEL,
  type StatusBadge,
  type TaxProfileId,
} from './cobranza-format'
import { todayIso } from '@/app/lib/iso-date'
import type { BillingStatus, Receivable } from './cobros-mock-data'

function activityNow(): string {
  return `${todayIso()}T${new Date().toTimeString().slice(0, 8)}`
}

export type EmitterId = Exclude<TaxProfileId, 'unassigned'>

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
  monthlyUsed: number
  monthlyLimit: number
  annualUsed: number
  annualLimit: number
  alert: EmitterAlertLevel
  connected: boolean
}

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

export const EMITTER_ALERT_TONE: Record<EmitterAlertLevel, 'default' | 'success' | 'warning' | 'danger'> = {
  disponible: 'success',
  cerca_limite: 'warning',
  limite_alcanzado: 'danger',
  error_conexion: 'danger',
  datos_incompletos: 'warning',
}

export function isBlockingAlert(level: EmitterAlertLevel): boolean {
  return level === 'limite_alcanzado' || level === 'error_conexion'
}

export function emitterUsagePct(emitter: InvoiceEmitter): number {
  if (emitter.monthlyLimit <= 0) return 0
  return Math.round((emitter.monthlyUsed / emitter.monthlyLimit) * 100)
}

export function emitterById(id?: TaxProfileId): InvoiceEmitter | undefined {
  return INVOICE_EMITTERS.find((emitter) => emitter.id === id)
}

export function suggestedEmitter(r: Receivable): InvoiceEmitter {
  const own = emitterById(r.taxProfileId)
  if (own && !isBlockingAlert(own.alert)) return own
  return INVOICE_EMITTERS.find((emitter) => !isBlockingAlert(emitter.alert)) ?? INVOICE_EMITTERS[0]
}

const UNBILLED: BillingStatus[] = ['no_invoice', 'pending', 'error_arca']
const BILLED: BillingStatus[] = ['invoiced', 'sent', 'manual']

export function canInvoice(r: Receivable): boolean {
  return UNBILLED.includes(r.billingStatus)
}

export function isBilled(r: Receivable): boolean {
  return BILLED.includes(r.billingStatus)
}

export type InvoiceReadiness = { ready: boolean; missing: string[] }

export function invoiceReadiness(r: Receivable): InvoiceReadiness {
  const missing: string[] = []
  if (!r.businessName) missing.push('Razón social')
  if (!r.taxId) missing.push('CUIT / DNI')
  if (r.taxProfileId === 'unassigned') missing.push('Monotributo asignado')
  if (r.billingStatus === 'pending') missing.push('Condición fiscal')
  return { ready: missing.length === 0, missing }
}

function seedNum(id: string): number {
  return Number(id.replace(/\D/g, '')) || 1
}

function synthCae(id: string): string {
  return (10000000000000 + seedNum(id) * 7654321).toString().slice(0, 14)
}

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

export function markInvoiceSent(r: Receivable, channel: SendChannel): Receivable {
  return {
    ...r,
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

export type CobrosInvoiceDialog =
  | { kind: 'none' }
  | { kind: 'generate'; receivable: Receivable }
  | { kind: 'associate'; receivable: Receivable }
  | { kind: 'send'; receivable: Receivable }
  | { kind: 'collect'; receivable: Receivable }
  | { kind: 'edit'; receivable: Receivable }
  | { kind: 'fiscal'; receivable: Receivable }
