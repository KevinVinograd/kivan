/**
 * Bridges the real Payments API to the front's `Payment` shape. The API returns
 * money in minor units + the raw entity (recipientName is denormalized, so no
 * join needed). The front works in major units (pesos) and carries a few fields
 * with no backend source yet (accountAlias, activity, notes) — defaulted here.
 */
import type { Currency } from '@hold/shared'

import {
  paymentsApi,
  type CreatePaymentInput,
  type PaymentDto,
  type UpdatePaymentInput,
} from '@/api/payments'
import { apiDateToCalendarDay } from '@/app/lib/iso-date'
import type { Payment, PaymentMethod, RecipientType } from './pagos-mock-data'

const METHODS: readonly string[] = ['transfer', 'cash', 'mercado_pago', 'other']

/** Map the backend method string onto a known PaymentMethod, else undefined. */
function asMethod(method: string | null): PaymentMethod | undefined {
  return method && METHODS.includes(method) ? (method as PaymentMethod) : undefined
}

const minorToMajor = (minor: string): number => Number(minor) / 100
const majorToMinor = (major: number): string => String(Math.round(major * 100))

/** Map the raw API entity onto the front Payment, defaulting activity fields. */
export function dtoToPayment(d: PaymentDto): Payment {
  return {
    id: d.id,
    recipientName: d.recipientName,
    recipientType: d.recipientType as RecipientType,
    // Dropped until now, which left the detail with no way to reach the recipient's
    // liquidación or running account — it synthesized both from the row id instead.
    ...(d.teamMemberId ? { teamMemberId: d.teamMemberId } : {}),
    ...(d.providerId ? { providerId: d.providerId } : {}),
    ...(d.invoiceEmitterId ? { invoiceEmitterId: d.invoiceEmitterId } : {}),
    period: d.period,
    concept: d.concept,
    totalAmount: minorToMajor(d.totalAmountMinor),
    paidAmount: minorToMajor(d.paidAmountMinor),
    // Read, not assumed. This hardcoded 'ARS' and discarded what the server sent, so a USD
    // row reached the table labelled as pesos and every downstream sum counted its face
    // value as centavos.
    currency: d.currency,
    expectedDate: d.expectedDate,
    // A calendar day, not an instant — see `apiDateToCalendarDay`. Unlike the date-only
    // `expectedDate`, this column is serialized with `toISOString()` and carries both
    // picked dates and server-stamped moments, which are read differently.
    paymentDate: d.paymentDate ? apiDateToCalendarDay(d.paymentDate) : undefined,
    status: d.status as Payment['status'],
    method: asMethod(d.method),
    treasuryAccountId: d.treasuryAccountId ?? undefined,
    treasuryAccountName: d.treasuryAccountName ?? undefined,
    lastActivityLabel: 'Sin actividad',
    lastActivityAt: d.createdAt,
  }
}

/** Load the workspace's payments from the API, mapped to the front shape.
 *  The list endpoint caps `limit` at 100, so page through until exhausted. */
export async function fetchPayments(): Promise<Payment[]> {
  const LIMIT = 100
  const all: PaymentDto[] = []
  for (let offset = 0; ; offset += LIMIT) {
    const res = await paymentsApi.list({ limit: LIMIT, offset })
    all.push(...res.items)
    if (all.length >= res.total || res.items.length < LIMIT) break
  }
  return all.map(dtoToPayment)
}

/** Raw create-pago inputs from the dialog (amount in pesos / major units). The
 *  FK (providerId / teamMemberId) is resolved by the dialog per recipient type. */
export interface CreatePagoInput {
  recipientType: RecipientType
  recipientName: string
  providerId?: string
  teamMemberId?: string
  invoiceEmitterId?: string
  period: string
  concept: string
  totalAmount: number
  /** The lane the money left in. Chosen in the dialog; immutable once recorded, because
   *  `UpdatePagoInput` below deliberately has no currency. */
  currency: Currency
  expectedDate: string
  method?: PaymentMethod
}

/** Persist a new pago and return it in the front shape. */
export async function createPaymentViaApi(input: CreatePagoInput): Promise<Payment> {
  const body: CreatePaymentInput = {
    recipientType: input.recipientType,
    recipientName: input.recipientName,
    period: input.period,
    concept: input.concept,
    totalAmountMinor: majorToMinor(input.totalAmount),
    currency: input.currency,
    expectedDate: input.expectedDate,
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.invoiceEmitterId ? { invoiceEmitterId: input.invoiceEmitterId } : {}),
    ...(input.teamMemberId ? { teamMemberId: input.teamMemberId } : {}),
    ...(input.method ? { method: input.method } : {}),
  }
  return dtoToPayment(await paymentsApi.create(body))
}

/** Raw edit-pago inputs from the dialog (amount in pesos / major units). */
export interface UpdatePagoInput {
  concept: string
  totalAmount: number
  expectedDate: string
  method?: PaymentMethod
}

/** Persist an edit to a pago and return the updated front shape. */
export async function updatePaymentViaApi(id: string, input: UpdatePagoInput): Promise<Payment> {
  const body: UpdatePaymentInput = {
    concept: input.concept,
    totalAmountMinor: majorToMinor(input.totalAmount),
    expectedDate: input.expectedDate,
    ...(input.method ? { method: input.method } : {}),
  }
  return dtoToPayment(await paymentsApi.update(id, body))
}

/** Register a payment (pesos) against a pago; idempotent per call. `paymentDate` is
 *  the ISO date the money actually moved (optional; the server defaults to now). */
export async function registerPaymentViaApi(
  id: string,
  amount: number,
  paymentDate?: string,
  treasuryAccountId?: string,
  method?: PaymentMethod,
): Promise<Payment> {
  const key = crypto.randomUUID()
  return dtoToPayment(
    await paymentsApi.register(id, majorToMinor(amount), key, paymentDate, treasuryAccountId, method),
  )
}

/** Approve a pago (pending -> approved). */
export async function approvePaymentViaApi(id: string): Promise<Payment> {
  return dtoToPayment(await paymentsApi.approve(id))
}

/** Cancel (anular) a pago and return the updated front shape. */
export async function cancelPaymentViaApi(id: string): Promise<Payment> {
  return dtoToPayment(await paymentsApi.cancel(id))
}
