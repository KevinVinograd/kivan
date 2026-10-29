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

function asMethod(method: string | null): PaymentMethod | undefined {
  return method && METHODS.includes(method) ? (method as PaymentMethod) : undefined
}

const minorToMajor = (minor: string): number => Number(minor) / 100
const majorToMinor = (major: number): string => String(Math.round(major * 100))

export function dtoToPayment(d: PaymentDto): Payment {
  return {
    id: d.id,
    recipientName: d.recipientName,
    recipientType: d.recipientType as RecipientType,
    ...(d.teamMemberId ? { teamMemberId: d.teamMemberId } : {}),
    ...(d.providerId ? { providerId: d.providerId } : {}),
    ...(d.invoiceEmitterId ? { invoiceEmitterId: d.invoiceEmitterId } : {}),
    period: d.period,
    concept: d.concept,
    totalAmount: minorToMajor(d.totalAmountMinor),
    paidAmount: minorToMajor(d.paidAmountMinor),
    currency: d.currency,
    expectedDate: d.expectedDate,
    paymentDate: d.paymentDate ? apiDateToCalendarDay(d.paymentDate) : undefined,
    status: d.status as Payment['status'],
    method: asMethod(d.method),
    treasuryAccountId: d.treasuryAccountId ?? undefined,
    treasuryAccountName: d.treasuryAccountName ?? undefined,
    lastActivityLabel: 'Sin actividad',
    lastActivityAt: d.createdAt,
  }
}

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

export interface CreatePagoInput {
  recipientType: RecipientType
  recipientName: string
  providerId?: string
  teamMemberId?: string
  invoiceEmitterId?: string
  period: string
  concept: string
  totalAmount: number
  currency: Currency
  expectedDate: string
  method?: PaymentMethod
}

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

export interface UpdatePagoInput {
  concept: string
  totalAmount: number
  expectedDate: string
  method?: PaymentMethod
}

export async function updatePaymentViaApi(id: string, input: UpdatePagoInput): Promise<Payment> {
  const body: UpdatePaymentInput = {
    concept: input.concept,
    totalAmountMinor: majorToMinor(input.totalAmount),
    expectedDate: input.expectedDate,
    ...(input.method ? { method: input.method } : {}),
  }
  return dtoToPayment(await paymentsApi.update(id, body))
}

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

export async function approvePaymentViaApi(id: string): Promise<Payment> {
  return dtoToPayment(await paymentsApi.approve(id))
}

export async function cancelPaymentViaApi(id: string): Promise<Payment> {
  return dtoToPayment(await paymentsApi.cancel(id))
}
