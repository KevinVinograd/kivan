/** Team payout statements (Operación mensual — plan de equipo) resource calls. */
import { z } from 'zod'
import { PayoutStatementStatus } from '@hold/shared'
import { apiClient } from './client'

export const TeamAdjustmentSchema = z.object({
  id: z.string(),
  description: z.string(),
  amountMinor: z.string(),
  createdAt: z.string(),
})

/** Free-form bank data stored as JSON, so every field is optional server-side. */
export const BankProfileSchema = z.object({
  bankName: z.string().optional(),
  accountHolder: z.string().optional(),
  cbuOrCvu: z.string().optional(),
  alias: z.string().optional(),
})

export const PayoutStatementSchema = z.object({
  id: z.string(),
  teamMemberId: z.string(),
  period: z.string(),
  baseAmountMinor: z.string(),
  productionsAmountMinor: z.string(),
  viaticsAmountMinor: z.string(),
  adjustmentsTotalMinor: z.string(),
  totalAmountMinor: z.string(),
  paidAmountMinor: z.string(),
  outstandingMinor: z.string(),
  /**
   * Hours the month's attributed productions credit to this member, and what an
   * hour was worth WHEN the statement was liquidated.
   *
   * `null` on both means NOT RECORDED, and a consumer must render it as such: a
   * statement predating the attribution model has no hours, and a member on
   * `monthly_fixed` never will. Neither is "0 hours at $0", and neither may be
   * defaulted to a number here — Zod would happily accept `.default(0)` and the
   * absence would become a confident zero one layer below.
   */
  hoursTotal: z.number().nullable(),
  hourlyRateMinor: z.string().nullable(),
  /**
   * Validated against the shared enum rather than cast as `string`: the lifecycle
   * decides which action the UI may offer, and offering one the server refuses turns
   * into a 409 the user cannot act on. Fail-closed
   * § 2.4 — a new backend status must ship to `@hold/shared` first.
   */
  statementStatus: PayoutStatementStatus,
  bankId: z.string().nullable(),
  bankProfile: BankProfileSchema.nullable(),
  dueDate: z.string().nullable(),
  /** The day the payout was paid, or null when nobody recorded one.
   *  `nullish`, not `nullable`: a push to main deploys Web (S3 + CloudFront, ~1-2 min)
   *  and API (ECR -> EC2, ~5-10 min) as independent workflows, so for several minutes the
   *  new bundle talks to an API that has never heard of this field. `apiClient` throws a
   *  raw ZodError on a schema mismatch — contract drift is a bug, not an HTTP error — and
   *  this schema backs list/upsert/approve/dispatch/confirm/register/addAdjustment, so a
   *  required key would take out /operacion-mensual and /team outright until the API
   *  lands. Every additive response field must be optional for exactly this window. */
  paidAt: z.string().nullish(),
  /** The account the money left from. `nullish` for the same deploy-window reason as
   *  `paidAt` one line up: Web ships before API, so for a few minutes this bundle talks
   *  to an API that has never heard of the field. */
  treasuryAccountId: z.string().nullish(),
  approvedAt: z.string().nullable(),
  approvedByUserId: z.string().nullable(),
  version: z.number(),
  createdAt: z.string(),
  adjustments: z.array(TeamAdjustmentSchema),
})

export const PaginatedPayoutsSchema = z.object({
  items: z.array(PayoutStatementSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
})

export type TeamAdjustmentDto = z.infer<typeof TeamAdjustmentSchema>
export type BankProfile = z.infer<typeof BankProfileSchema>
export type PayoutStatementDto = z.infer<typeof PayoutStatementSchema>
export type PaginatedPayoutsDto = z.infer<typeof PaginatedPayoutsSchema>

export interface UpsertPayoutInput {
  teamMemberId: string
  period: string
  baseAmountMinor?: string
  productionsAmountMinor?: string
  viaticsAmountMinor?: string
  bankProfile?: BankProfile
  dueDate?: string
}

export const payoutsApi = {
  /**
   * Statements for a period, optionally narrowed to one member.
   *
   * `(teamMemberId, period)` is UNIQUE on the backend, so that pair identifies at
   * most one statement — which is why a per-payment detail can resolve a
   * liquidación from a payment's recipient and month, and why several payments to
   * the same person in one month all resolve to the SAME one.
   */
  list: (params: {
    teamMemberId?: string
    period?: string
    limit?: number
    /** Paging, for the reads that must not truncate — the Posición sums what it gets. */
    offset?: number
  }) =>
    apiClient.get<PaginatedPayoutsDto>('/payout-statements', {
      params,
      schema: PaginatedPayoutsSchema,
    }),
  upsert: (input: UpsertPayoutInput) =>
    apiClient.post<PayoutStatementDto>('/payout-statements', input, { schema: PayoutStatementSchema }),
  addAdjustment: (id: string, input: { description: string; amountMinor: string }) =>
    apiClient.post<PayoutStatementDto>(`/payout-statements/${id}/adjustments`, input, {
      schema: PayoutStatementSchema,
    }),

  /**
   * The lifecycle transitions. Each is a conditional update filtered on the status it
   * expects to move FROM, so an out-of-order call is refused with a 409 rather than
   * silently reordering the chain — derive the offered action from the row's current
   * status instead of letting the user pick.
   */
  approve: (id: string) =>
    apiClient.post<PayoutStatementDto>(`/payout-statements/${id}/approve`, {}, { schema: PayoutStatementSchema }),
  dispatch: (id: string) =>
    apiClient.post<PayoutStatementDto>(`/payout-statements/${id}/dispatch`, {}, { schema: PayoutStatementSchema }),
  confirm: (id: string) =>
    apiClient.post<PayoutStatementDto>(`/payout-statements/${id}/confirm`, {}, { schema: PayoutStatementSchema }),

  register: (
    id: string,
    amountMinor: string,
    idempotencyKey: string,
    paidAt?: string,
    treasuryAccountId?: string,
  ) =>
    apiClient.post<PayoutStatementDto>(
      `/payout-statements/${id}/register`,
      // `paidAt` is omitted rather than sent as null when the caller has no day: the
      // server COALESCEs, so an absent value leaves any previously recorded day alone.
      // Both omitted rather than sent as null when the caller has none: the server
      // COALESCEs, so an absent value leaves a previously recorded day or account alone.
      // /team's dateless "Pagar diferencia" depends on exactly that.
      {
        amountMinor,
        idempotencyKey,
        ...(paidAt ? { paidAt } : {}),
        ...(treasuryAccountId ? { treasuryAccountId } : {}),
      },
      { schema: PayoutStatementSchema },
    ),
}
