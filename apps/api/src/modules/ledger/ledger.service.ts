/** Cuentas corrientes service — reads the persisted append-only ledger. */
import type { Prisma } from '@hold/db';
import { ledgerRepo } from './ledger.repo.js';
// Local copy, matching payments/payouts/billing. Extracting the shared helper
// would edit three unrelated services for a five-line pure function (G3).
function monthBoundsOf(date: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start, end };
}
import {
  toLedgerEntryDto,
  type LedgerAccountDto,
  type LedgerStatementDto,
} from './ledger.schema.js';

export const ledgerService = {
  async listAccounts(
    tx: Prisma.TransactionClient,
    entityType: string,
  ): Promise<LedgerAccountDto[]> {
    const rows = await ledgerRepo.accountsWithBalance(tx, entityType);
    return rows.map((r) => ({
      entityType,
      entityId: r.entityId,
      currency: r.currency,
      balanceMinor: r.balanceMinor.toString(),
    }));
  },

  async statement(
    tx: Prisma.TransactionClient,
    entityType: string,
    entityId: string,
    limit: number,
    offset: number,
    period?: Date,
    currency?: string,
  ): Promise<LedgerStatementDto> {
    const bounds = period ? monthBoundsOf(period) : undefined;
    // The summary needs a lane to be an identity rather than a mixed sum, so an
    // unscoped caller gets the PESO month. That default is REPORTED, on
    // `period.currency` below: an unscoped call returns entries from every lane, and a
    // consumer that could not see which lane the five figures describe would be reading
    // a peso summary beside a mixed list with nothing to say so.
    const summaryLane = currency ?? "ARS";
    const [{ entries, total, balances }, summary] = await Promise.all([
      ledgerRepo.statement(tx, entityType, entityId, limit, offset, bounds, currency),
      bounds
        ? ledgerRepo.periodSummary(tx, entityType, entityId, bounds, summaryLane)
        : null,
    ]);
    return {
      entityType,
      entityId,
      balancesMinor: Object.fromEntries(
        balances.map((row) => [row.currency, row.balanceMinor.toString()]),
      ),
      // The peso lane, for a reader that predates `balancesMinor`. Zero when the account
      // has no peso entries, which is the truth rather than a stand-in: it owes nothing
      // in pesos.
      balanceMinor: (balances.find((row) => row.currency === 'ARS')?.balanceMinor ?? 0n).toString(),
      total,
      entries: entries.map(toLedgerEntryDto),
      // Absent, not zeroed, when the caller did not scope: a summary of "no period"
      // is not four zeroes, and a consumer must not be able to read one as such.
      ...(summary
        ? {
            period: {
              currency: summaryLane,
              openingBalanceMinor: summary.openingBalanceMinor.toString(),
              debitMinor: summary.debitMinor.toString(),
              settledMinor: summary.settledMinor.toString(),
              creditAdjustmentsMinor: summary.creditAdjustmentsMinor.toString(),
              closingBalanceMinor: summary.closingBalanceMinor.toString(),
            },
          }
        : {}),
    };
  },
};
