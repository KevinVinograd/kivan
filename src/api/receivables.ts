/** Receivables (Cobros) resource calls — thin typed wrappers over the api client. */
import type { Currency } from '@hold/shared'
import { apiClient } from './client'

/** Raw Receivable entity as `GET /receivables` returns it. Money is integer minor
 *  units (centavos) serialized as strings; the front converts to major units.
 *  clientName + fiscal/contact fields + emitterCode are joined server-side. */
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
  /** The lane the cobro is billed in. Only USD is repriced into ARS at generation;
   *  every other lane is billed in itself, so this is not always `ARS`. */
  currency: Currency
  /** Where the amount came from, when the retainer was priced in one currency and billed
   *  in another. All three null together on a cobro billed in its own currency, and on
   *  every row created before the app knew about rates. Optional for the same reason
   *  `withoutFee` is: Deploy Web and Deploy API fire independently. */
  originalCurrency?: string | null
  originalAmountMinor?: string | null
  fxRateMinor?: string | null
  dueDate: string
  /** When the cash actually arrived (ISO). Null until something is collected. The
   *  column exists precisely so nothing has to stand in `createdAt` for it. */
  collectedAt: string | null
  status: string
  billingStatus: string
  emitterId: string | null
  emitterCode: string | null
  invoiceNumber: string | null
  cae: string | null
  invoiceIssuedAt: string | null
  // Monthly-plan fields (per-client-month workflow).
  reviewStatus: string | null
  effectiveDate: string | null
  planNotes: string | null
  extras: ReceivableExtra[]
  /** Cost by area, minor units. Visible to a viewer holding `profitability`. */
  costDesignMinor: string
  costCommMinor: string
  costProductionMinor: string
  costViaticsMinor: string
  costPautaMinor: string
  costFixedMinor: string
  /** 'manual' | 'monthly_fee' — how the row came to exist. */
  source: string
  /** Where the cash landed, when the collection said so. Null = nobody recorded it,
   *  and the UI must show nothing rather than a plausible-looking default. */
  treasuryAccountId: string | null
  treasuryAccountName: string | null
  version: number
  createdAt: string
}

/** Why the month generator is not going to bill a client (or did not). */
export type MonthlyFeeSkipReason =
  | 'already_generated'
  | 'manual_exists'
  | 'not_billable'
  | 'missing_exchange_rate'

/** The dollar rate one month is billed at, as `GET /exchange-rates` returns it. */
export interface ExchangeRateDto {
  /** The month it belongs to, normalized to the 1st. */
  period: string
  /** ARS centavos per 1 USD: 1.234,50 arrives as "123450". */
  arsPerUsdMinor: string
  updatedAt: string
}

/** Body for `PUT /exchange-rates`. */
export interface SetExchangeRateInput {
  period: string
  arsPerUsdMinor: string
}

/** One client the month generator would bill, as `GET /receivables/monthly-fee/preview`
 *  returns it. `suggestedService` is null when the client contracts more than one and
 *  the operator has to choose. */
export interface MonthlyFeeCandidateDto {
  clientId: string
  clientName: string
  services: string[]
  suggestedService: string | null
  monthlyFeeMinor: string
  currency: string
  /** What the client would actually be billed in ARS, when the retainer is priced in a
   *  foreign currency and the month has a rate. Null for a peso client and null when the
   *  rate is missing (`skipReason` says which). Server-computed so the figure shown is the
   *  one written. Optional for deploy skew. */
  convertedArsMinor?: string | null
  /** The client's standing discount: the agreed rate (basis points) and what it takes
   *  off THIS cobro, resolved server-side against the same base the generator will
   *  price with. `discountAmountMinor` is null when the client could not be priced at
   *  all, which is not a discount of zero. Optional for deploy skew. */
  discountPercentBp?: number | null
  discountAmountMinor?: string | null
  /** The client's priced contract lines, when it has any. Empty for a client still on a
   *  hand-typed fee, which is most of the book. The dialog keys on the FIELD being
   *  present, not on the array being non-empty: an API that predates it sends neither,
   *  and a browser that offered the per-service checklist anyway would send ids the old
   *  server strips, billing the full fee while the screen said otherwise. */
  lines?: { id: string; name: string; priceMinor: string }[]
  /** The client's productions waiting to be billed (linked to a per-production service,
   *  billable, not on any cobro yet), in the contract's currency. Optional for deploy
   *  skew: an API that predates it reads as "no productions". */
  productions?: { id: string; date: string; title: string; serviceName: string; amountMinor: string }[]
  skipReason: MonthlyFeeSkipReason | null
  existingReceivableId: string | null
  /** Services already billed by hand this period. Optional for the same deploy-skew reason
   *  as `withoutFee`: the browser can run one release ahead of the API. */
  manualServices?: string[]
}

export interface MonthlyFeePreviewDto {
  period: string
  items: MonthlyFeeCandidateDto[]
  /** Active clients with no monthly fee, by name. Optional because Deploy Web and Deploy
   *  API fire independently: for one release the browser can be newer than the API and
   *  must not read `undefined` as "no excluded clients" crashing on `.length`. */
  withoutFee?: string[]
  /** This month's dollar rate, or null when none is loaded. Optional for deploy skew: an
   *  API that predates it reads as "no rate", which is what the dialog already handles. */
  exchangeRate?: ExchangeRateDto | null
}

/** What a generation run actually did. `skipped` names every client it did NOT bill. */
export interface MonthlyFeeGenerationDto {
  period: string
  created: ReceivableDto[]
  skipped: { clientId: string; clientName: string; reason: MonthlyFeeSkipReason }[]
}

/** Body for `POST /receivables/monthly-fee/generate`. Amounts are deliberately absent:
 *  the server re-reads each client's fee, so the browser never gets to bill a number. */
export interface GenerateMonthlyFeesInput {
  period: string
  dueDate: string
  items: { clientId: string; service: string; clientServiceIds?: string[]; productionIds?: string[] }[]
}

/** One itemized extra behind the extraAmountMinor aggregate (amountMinor as string). */
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

/** Body for `POST /receivables`. Money in minor units (string). */
export interface CreateReceivableInput {
  clientId: string
  period: string
  service: string
  baseAmountMinor: string
  extraAmountMinor?: string
  discountAmountMinor?: string
  dueDate: string
}

/** Body for `PATCH /receivables/:id` — at least one field. */
export interface UpdateReceivableInput {
  service?: string
  baseAmountMinor?: string
  extraAmountMinor?: string
  discountAmountMinor?: string
  dueDate?: string
  // Monthly-plan fields.
  reviewStatus?: string
  effectiveDate?: string | null
  planNotes?: string
  extras?: ReceivableExtra[]
  // Cost by area (minor units). Writing any of these needs the `profitability`
  // capability server-side; they never change the billed total.
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
  /**
   * Bill part of a one-time service line (an anticipo, an etapa, the balance). The amount
   * is in the contract's currency; the server prices, discounts and converts it, and
   * refuses anything above what is left of the line's price.
   */
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
      // The date the cash actually arrived (ISO). Optional: omitted → the API defaults it.
      ...(collectedAt ? { collectedAt } : {}),
      // Where it landed. Sending it moves that account's balance in the same
      // transaction; omitting it moves nothing, which is the honest outcome when
      // nobody knows where the money went.
      ...(treasuryAccountId ? { treasuryAccountId } : {}),
    }),
  generateInvoice: (id: string, emitterId: string) =>
    apiClient.post<ReceivableDto>(`/receivables/${id}/invoice/generate`, { emitterId }),
  // Record an externally emitted factura (manual, no CAE).
  associateInvoice: (id: string, invoiceNumber: string, issuedAt: string) =>
    apiClient.post<ReceivableDto>(`/receivables/${id}/invoice/associate`, { invoiceNumber, issuedAt }),
  // Mark the factura / cuenta corriente as sent.
  markInvoiceSent: (id: string) =>
    apiClient.post<ReceivableDto>(`/receivables/${id}/invoice/sent`, {}),
  cancel: (id: string) => apiClient.post<ReceivableDto>(`/receivables/${id}/cancel`, {}),
  // What generating the month's retainers WOULD create. Read-only.
  monthlyFeePreview: (period: string) =>
    apiClient.get<MonthlyFeePreviewDto>('/receivables/monthly-fee/preview', { params: { period } }),
  generateMonthlyFees: (input: GenerateMonthlyFeesInput) =>
    apiClient.post<MonthlyFeeGenerationDto>('/receivables/monthly-fee/generate', input),
  // The dollar rate a month is billed at. Write only: the monthly-fee preview already
  // carries the rate, so a read endpoint here would have no caller.
  setExchangeRate: (input: SetExchangeRateInput) =>
    apiClient.put<ExchangeRateDto>('/exchange-rates', input),
}
