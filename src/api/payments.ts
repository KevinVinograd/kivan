import { z } from 'zod'
import type { Currency } from '@hold/shared'
import { apiClient } from './client'

// Money is integer minor units (centavos) serialized as strings.
export interface PaymentDto {
  id: string
  recipientType: string
  teamMemberId: string | null
  providerId: string | null
  invoiceEmitterId?: string | null
  recipientName: string
  period: string
  concept: string
  totalAmountMinor: string
  paidAmountMinor: string
  outstandingMinor: string
  currency: Currency
  expectedDate: string
  paymentDate: string | null
  status: string
  method: string | null
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

export interface CreatePaymentInput {
  recipientType: string
  recipientName: string
  teamMemberId?: string
  providerId?: string
  invoiceEmitterId?: string
  period: string
  concept: string
  totalAmountMinor: string
  currency?: Currency
  expectedDate: string
  method?: string
}

export interface UpdatePaymentInput {
  concept?: string
  totalAmountMinor?: string
  expectedDate?: string
  method?: string
}

export const PaymentBankSchema = z.object({
  bankName: z.string().nullable(),
  accountHolder: z.string().nullable(),
  cbuOrCvu: z.string().nullable(),
  alias: z.string().nullable(),
  accountType: z.string().nullable(),
})

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
