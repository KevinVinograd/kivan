import { z } from 'zod'
import { apiClient } from './client'

export const LEDGER_ENTITY_TYPES = ['client', 'teamMember', 'provider'] as const
export type LedgerEntityType = (typeof LEDGER_ENTITY_TYPES)[number]

export const LedgerEntrySchema = z.object({
  id: z.string(),
  seq: z.number(),
  currency: z.string().default('ARS'),
  period: z.string(),
  type: z.string(),
  description: z.string(),
  debitMinor: z.string(),
  creditMinor: z.string(),
  balanceMinor: z.string(),
  referenceType: z.string().nullable(),
  referenceId: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  date: z.string(),
})

export const LedgerPeriodSummarySchema = z.object({
  currency: z.string().default('ARS'),
  openingBalanceMinor: z.string(),
  debitMinor: z.string(),
  settledMinor: z.string(),
  creditAdjustmentsMinor: z.string(),
  closingBalanceMinor: z.string(),
})

export const LedgerStatementSchema = z.object({
  entityType: z.string(),
  entityId: z.string(),
  balanceMinor: z.string(),
  balancesMinor: z.record(z.string(), z.string()).default({}),
  total: z.number(),
  entries: z.array(LedgerEntrySchema),
  period: LedgerPeriodSummarySchema.optional(),
})

export type LedgerEntryDto = z.infer<typeof LedgerEntrySchema>
export type LedgerPeriodSummaryDto = z.infer<typeof LedgerPeriodSummarySchema>
export type LedgerStatementDto = z.infer<typeof LedgerStatementSchema>

export const ledgerApi = {
  statement: (
    entityType: LedgerEntityType,
    entityId: string,
    params?: { period?: string; limit?: number; offset?: number; currency?: string },
  ) =>
    apiClient.get<LedgerStatementDto>(`/ledger/${entityType}/${entityId}`, {
      ...(params ? { params } : {}),
      schema: LedgerStatementSchema,
    }),
}
