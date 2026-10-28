/**
 * Cuentas corrientes (ledger) resource calls — the persisted append-only running
 * account for a client, colaboradora, or proveedor.
 *
 * Responses are Zod-validated at the boundary rather than cast
 *. These figures are money the
 * operator acts on: a field that silently arrived as `undefined` would render as
 * `$ 0` and read as "nothing owed", which is the one wrong answer that looks
 * exactly like a right one.
 */
import { z } from 'zod'
import { apiClient } from './client'

/** The account kinds the backend keys a ledger by. */
export const LEDGER_ENTITY_TYPES = ['client', 'teamMember', 'provider'] as const
export type LedgerEntityType = (typeof LEDGER_ENTITY_TYPES)[number]

export const LedgerEntrySchema = z.object({
  id: z.string(),
  seq: z.number(),
  /** The lane. `.default('ARS')` covers the deploy window ONLY - an old API omits the
   *  field entirely. It is not a claim about history: rows written before the ledger had
   *  lanes could belong to any lane at all, since a cobro is billed in its client's own
   *  currency, which is why migration 0027 backfills the real lane from the referenced
   *  cobro or pago instead of trusting the column default. */
  currency: z.string().default('ARS'),
  /** The month the money belongs to (YYYY-MM-DD, always the 1st). */
  period: z.string(),
  type: z.string(),
  description: z.string(),
  debitMinor: z.string(),
  creditMinor: z.string(),
  balanceMinor: z.string(),
  referenceType: z.string().nullable(),
  referenceId: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  /** When the entry was recorded, which is NOT necessarily inside `period`. */
  date: z.string(),
})

/**
 * What one month did to the account. Present only when the request was scoped by
 * `period`; the figures close — opening + debit − settled − creditAdjustments ===
 * closing.
 *
 * `settledMinor` is money that MOVED; `creditAdjustmentsMinor` is a lowered total
 * or a cancelled charge. Reporting them as one number let an edit read as a payment.
 */
export const LedgerPeriodSummarySchema = z.object({
  /** The lane these five figures describe. `.default('ARS')` for the deploy window:
   *  an older API omits it, and pesos is the lane it would have summarised. */
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
  /**
   * The account's balance TODAY — deliberately not the period's closing balance.
   * Asking about March and reading this would report what is owed now.
   *
   * This one is the PESO lane. `balancesMinor` below carries every lane the account
   * has, and is what a multi-currency account must be read through: a running balance
   * is per lane, so one number covering two lanes nets dollars against pesos.
   */
  balanceMinor: z.string(),
  /** Per-lane live balances, keyed by currency. `.default({})` for the deploy window,
   *  since Deploy Web lands before Deploy API and this bundle runs against the older
   *  API for several minutes. */
  balancesMinor: z.record(z.string(), z.string()).default({}),
  total: z.number(),
  entries: z.array(LedgerEntrySchema),
  /**
   * `.optional()` and never defaulted: the server omits it when no period was
   * asked for, and a default of four zeroes would let "not asked" render as a
   * settled account.
   */
  period: LedgerPeriodSummarySchema.optional(),
})

export type LedgerEntryDto = z.infer<typeof LedgerEntrySchema>
export type LedgerPeriodSummaryDto = z.infer<typeof LedgerPeriodSummarySchema>
export type LedgerStatementDto = z.infer<typeof LedgerStatementSchema>

export const ledgerApi = {
  /**
   * One account's statement. Pass `period` (any day inside the month) to scope the
   * entries and receive the period summary alongside them.
   */
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
