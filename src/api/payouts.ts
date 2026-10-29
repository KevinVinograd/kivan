import { z } from 'zod'
import { PayoutStatementStatus } from '@hold/shared'
import { apiClient } from './client'

export const TeamAdjustmentSchema = z.object({
  id: z.string(),
  description: z.string(),
  amountMinor: z.string(),
  createdAt: z.string(),
})

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
  hoursTotal: z.number().nullable(),
  hourlyRateMinor: z.string().nullable(),
  statementStatus: PayoutStatementStatus,
  bankId: z.string().nullable(),
  bankProfile: BankProfileSchema.nullable(),
  dueDate: z.string().nullable(),
  paidAt: z.string().nullish(),
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
  list: (params: {
    teamMemberId?: string
    period?: string
    limit?: number
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
      {
        amountMinor,
        idempotencyKey,
        ...(paidAt ? { paidAt } : {}),
        ...(treasuryAccountId ? { treasuryAccountId } : {}),
      },
      { schema: PayoutStatementSchema },
    ),
}
