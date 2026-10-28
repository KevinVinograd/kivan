/** Payments (Pagos) + providers resource calls — thin typed wrappers over the api client. */
import { z } from 'zod'
import type { Currency } from '@hold/shared'
import { apiClient } from './client'

/** Raw Payment entity as `GET /payments` returns it. Money is integer minor units
 *  (centavos) serialized as strings; recipientName is denormalized on the entity. */
export interface PaymentDto {
  id: string
  recipientType: string
  teamMemberId: string | null
  providerId: string | null
  /** WHICH monotributista a cuota is for. Optional in the type for the deploy window:
   *  Web ships before API, so for a few minutes this bundle talks to an API that has
   *  never heard of the field. */
  invoiceEmitterId?: string | null
  recipientName: string
  period: string
  concept: string
  totalAmountMinor: string
  paidAmountMinor: string
  outstandingMinor: string
  /** The lane the money moves in. Never converted into another lane. */
  currency: Currency
  expectedDate: string
  paymentDate: string | null
  status: string
  method: string | null
  /** Where the cash left from, when the payment said so. Null = nobody recorded it. */
  treasuryAccountId: string | null
  treasuryAccountName: string | null
  version: number
  createdAt: string
}

export interface PaginatedPaymentsDto {
  items: PaymentDto[]
  total: number
  limit: number
  offset: number
}

export interface ProviderDto {
  id: string
  name: string
  taxId: string | null
  bankId: string | null
  createdAt: string
}

/** Body for `POST /payments`. Money in minor units (string). */
export interface CreatePaymentInput {
  recipientType: string
  recipientName: string
  teamMemberId?: string
  providerId?: string
  invoiceEmitterId?: string
  period: string
  concept: string
  totalAmountMinor: string
  /**
   * The lane the money moves in. Optional because the server defaults to ARS, which also
   * keeps an older bundle working through the deploy window. Create-only: the PATCH body
   * does not accept it, so a pago cannot change lane after it is recorded.
   */
  currency?: Currency
  expectedDate: string
  method?: string
}

/** Body for `PATCH /payments/:id` — at least one field. */
export interface UpdatePaymentInput {
  concept?: string
  totalAmountMinor?: string
  expectedDate?: string
  method?: string
}

/**
 * A recipient's banking details, served by `GET /payments/:id/bank` behind
 * `requireCapability('teamBankDetails')`.
 *
 * Validated rather than cast, unlike its neighbours in this file: every field is
 * nullable in the database, and a CBU that arrived as `undefined` instead of
 * `null` would render as an empty field indistinguishable from one nobody filled
 * in.
 *
 * SIDE EFFECT, stated because it is not obvious and not good: RS001 is file-level and
 * short-circuits on the FIRST `schema:` it finds, BEFORE consulting its allowlist
 * (`response-schema-source-check.mjs`). So adding this one schema dropped `payments.ts`
 * out of the check's tracked-debt count entirely — the report went from naming it to
 * silence, while ~8 calls above still cast. The allowlist entry for this file is now
 * dead config. The remaining casts are unchanged debt; the number that used to make
 * them visible no longer does.
 */
export const PaymentBankSchema = z.object({
  bankName: z.string().nullable(),
  accountHolder: z.string().nullable(),
  cbuOrCvu: z.string().nullable(),
  alias: z.string().nullable(),
  accountType: z.string().nullable(),
})

/** `bank: null` = no counterparty, or a counterparty with nothing on file. */
export const PaymentBankResponseSchema = z.object({
  bank: PaymentBankSchema.nullable(),
})

export type PaymentBankDto = z.infer<typeof PaymentBankSchema>
export type PaymentBankResponseDto = z.infer<typeof PaymentBankResponseSchema>

export const paymentsApi = {
  list: (params?: { limit?: number; offset?: number; status?: string; recipientType?: string }) =>
    apiClient.get<PaginatedPaymentsDto>('/payments', params ? { params } : undefined),
  create: (input: CreatePaymentInput) => apiClient.post<PaymentDto>('/payments', input),
  update: (id: string, input: UpdatePaymentInput) =>
    apiClient.patch<PaymentDto>(`/payments/${id}`, input),
  /** `paymentDate` is the day the money actually moved. The endpoint has always
   *  accepted it (`registerPaymentSchema`); sending nothing lets the server stamp
   *  the moment of data entry, which for a pago entered days later is a date that
   *  never happened. */
  register: (
    id: string,
    amountMinor: string,
    idempotencyKey: string,
    paymentDate?: string,
    treasuryAccountId?: string,
    method?: string,
  ) =>
    apiClient.post<PaymentDto>(`/payments/${id}/register`, {
      amountMinor,
      idempotencyKey,
      ...(paymentDate ? { paymentDate } : {}),
      // Where it left from. Sending it drops that account's balance in the same
      // transaction; omitting it moves nothing.
      ...(treasuryAccountId ? { treasuryAccountId } : {}),
      ...(method ? { method } : {}),
    }),
  approve: (id: string) => apiClient.post<PaymentDto>(`/payments/${id}/approve`, {}),
  cancel: (id: string) => apiClient.post<PaymentDto>(`/payments/${id}/cancel`, {}),
  bank: (id: string) =>
    apiClient.get<PaymentBankResponseDto>(`/payments/${id}/bank`, {
      schema: PaymentBankResponseSchema,
    }),
  listProviders: () => apiClient.get<ProviderDto[]>('/providers'),
  createProvider: (input: { name: string; taxId?: string }) =>
    apiClient.post<ProviderDto>('/providers', input),
}
