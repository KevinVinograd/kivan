import type { Currency } from '@hold/shared'
import { apiClient } from './client'

// Money is integer minor units (centavos) serialized as strings.
export interface ReceivableDto {
  id: string
  clientId: string
  clientName: string
  businessName: string | null
  taxId: string | null
  contactName: string | null
  period: string
  service: string
  baseAmountMinor: string
  extraAmountMinor: string
  discountAmountMinor: string
  totalAmountMinor: string
  collectedAmountMinor: string
  outstandingMinor: string
  currency: Currency
  originalCurrency?: string | null
  originalAmountMinor?: string | null
  fxRateMinor?: string | null
  dueDate: string
  collectedAt: string | null
  status: string
  billingStatus: string
  emitterId: string | null
  emitterCode: string | null
  invoiceNumber: string | null
  cae: string | null
  invoiceIssuedAt: string | null
  reviewStatus: string | null
  effectiveDate: string | null
  planNotes: string | null
  extras: ReceivableExtra[]
  costDesignMinor: string
  costCommMinor: string
  costProductionMinor: string
  costViaticsMinor: string
  costPautaMinor: string
  costFixedMinor: string
  source: string
  treasuryAccountId: string | null
  treasuryAccountName: string | null
  version: number
  createdAt: string
}

export type MonthlyFeeSkipReason =
  | 'already_generated'
  | 'manual_exists'
  | 'not_billable'
  | 'missing_exchange_rate'

export interface ExchangeRateDto {
  period: string
  arsPerUsdMinor: string
  updatedAt: string
}

export interface SetExchangeRateInput {
  period: string
  arsPerUsdMinor: string
}

export interface MonthlyFeeCandidateDto {
  clientId: string
  clientName: string
  services: string[]
  suggestedService: string | null
  monthlyFeeMinor: string
  currency: string
  convertedArsMinor?: string | null
  discountPercentBp?: number | null
  discountAmountMinor?: string | null
  lines?: { id: string; name: string; priceMinor: string }[]
  productions?: { id: string; date: string; title: string; serviceName: string; amountMinor: string }[]
  skipReason: MonthlyFeeSkipReason | null
  existingReceivableId: string | null
  manualServices?: string[]
}

export interface MonthlyFeePreviewDto {
  period: string
  items: MonthlyFeeCandidateDto[]
  withoutFee?: string[]
  exchangeRate?: ExchangeRateDto | null
}

export interface MonthlyFeeGenerationDto {
  period: string
  created: ReceivableDto[]
  skipped: { clientId: string; clientName: string; reason: MonthlyFeeSkipReason }[]
}

export interface GenerateMonthlyFeesInput {
  period: string
  dueDate: string
  items: { clientId: string; service: string; clientServiceIds?: string[]; productionIds?: string[] }[]
}

export interface ReceivableExtra {
  id?: string
  description: string
  amountMinor: string
  billable: boolean
}

export interface PaginatedReceivablesDto {
  items: ReceivableDto[]
  total: number
  limit: number
  offset: number
}

export interface CreateReceivableInput {
  clientId: string
  period: string
  service: string
  baseAmountMinor: string
  extraAmountMinor?: string
  discountAmountMinor?: string
  dueDate: string
}

export interface UpdateReceivableInput {
  service?: string
  baseAmountMinor?: string
  extraAmountMinor?: string
  discountAmountMinor?: string
  dueDate?: string
  reviewStatus?: string
  effectiveDate?: string | null
  planNotes?: string
  extras?: ReceivableExtra[]
  costDesignMinor?: string
  costCommMinor?: string
  costProductionMinor?: string
  costViaticsMinor?: string
  costPautaMinor?: string
  costFixedMinor?: string
}

export const receivablesApi = {
  list: (params?: { limit?: number; offset?: number; status?: string; billingStatus?: string }) =>
    apiClient.get<PaginatedReceivablesDto>('/receivables', params ? { params } : undefined),
  create: (input: CreateReceivableInput) => apiClient.post<ReceivableDto>('/receivables', input),
  chargeServiceLine: (input: {
    clientServiceId: string
    amountMinor: string
    period: string
    dueDate: string
  }) => apiClient.post<ReceivableDto>('/receivables/service-line-charge', input),
  update: (id: string, input: UpdateReceivableInput) =>
    apiClient.patch<ReceivableDto>(`/receivables/${id}`, input),
  collect: (
    id: string,
    amountMinor: string,
    idempotencyKey: string,
    collectedAt?: string,
    treasuryAccountId?: string,
  ) =>
    apiClient.post<ReceivableDto>(`/receivables/${id}/collect`, {
      amountMinor,
      idempotencyKey,
      ...(collectedAt ? { collectedAt } : {}),
      ...(treasuryAccountId ? { treasuryAccountId } : {}),
    }),
  generateInvoice: (id: string, emitterId: string) =>
    apiClient.post<ReceivableDto>(`/receivables/${id}/invoice/generate`, { emitterId }),
  associateInvoice: (id: string, invoiceNumber: string, issuedAt: string) =>
    apiClient.post<ReceivableDto>(`/receivables/${id}/invoice/associate`, { invoiceNumber, issuedAt }),
  markInvoiceSent: (id: string) =>
    apiClient.post<ReceivableDto>(`/receivables/${id}/invoice/sent`, {}),
  cancel: (id: string) => apiClient.post<ReceivableDto>(`/receivables/${id}/cancel`, {}),
  monthlyFeePreview: (period: string) =>
    apiClient.get<MonthlyFeePreviewDto>('/receivables/monthly-fee/preview', { params: { period } }),
  generateMonthlyFees: (input: GenerateMonthlyFeesInput) =>
    apiClient.post<MonthlyFeeGenerationDto>('/receivables/monthly-fee/generate', input),
  setExchangeRate: (input: SetExchangeRateInput) =>
    apiClient.put<ExchangeRateDto>('/exchange-rates', input),
}
