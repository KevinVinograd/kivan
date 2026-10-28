/** Ledger read repository. Runs on the `tx` from runInTx. */
import type { Prisma } from '@hold/db';

interface AccountBalanceRow {
  entityId: string;
  currency: string;
  balanceMinor: bigint;
}

export interface PeriodSummary {
  openingBalanceMinor: bigint;
  debitMinor: bigint;
  settledMinor: bigint;
  creditAdjustmentsMinor: bigint;
  closingBalanceMinor: bigint;
}

/**
 * Credit types that mean MONEY ACTUALLY LEFT (or arrived). The other credit types —
 * `adjustment` and `reversal` — are corrections to what was owed, and summing them
 * into the same figure is how a payment edited DOWN from 100000 to 60000 came to
 * report 40000 as "Pagado" when nothing had been paid at all.
 */
const SETTLEMENT_TYPES = ['payment', 'collection'] as const;

export const ledgerRepo = {
  /**
   * Latest running balance per account AND LANE for an entity type (DISTINCT ON).
   *
   * Keyed by lane because `balanceMinor` is a per-lane running total: taking the last
   * row for an account regardless of currency would report whichever lane happened to
   * be written most recently as though it were the whole account.
   */
  accountsWithBalance(tx: Prisma.TransactionClient, entityType: string) {
    return tx.$queryRaw<AccountBalanceRow[]>`
      SELECT DISTINCT ON ("entityId", "currency") "entityId", "currency"::text, "balanceMinor"
      FROM "LedgerEntry"
      WHERE "entityType" = ${entityType}
      ORDER BY "entityId", "currency", "seq" DESC`;
  },

  async statement(
    tx: Prisma.TransactionClient,
    entityType: string,
    entityId: string,
    limit: number,
    offset: number,
    bounds?: { start: Date; end: Date },
    currency?: string,
  ) {
    // Scoping narrows the ENTRIES only. `total` counts the same scope, so the
    // caller's pagination stays consistent with what it is paging through; the
    // account balance below is deliberately unscoped.
    const where: Prisma.LedgerEntryWhereInput = {
      entityType,
      entityId,
      ...(currency ? { currency: currency as Prisma.EnumCurrencyFilter } : {}),
      ...(bounds ? { period: { gte: bounds.start, lt: bounds.end } } : {}),
    };
    const [entries, total, balances] = await Promise.all([
      tx.ledgerEntry.findMany({ where, orderBy: { seq: 'desc' }, take: limit, skip: offset }),
      tx.ledgerEntry.count({ where }),
      // NOT filtered by period: these are the account's live balances, the answer to
      // "what do we owe them right now", which a month's worth of rows cannot give.
      //
      // PER LANE, and every lane the account has, even when the caller scoped the
      // entries to one: showing a single lane of a multi-lane account omits money from a
      // balance somebody reconciles against, and that omission would be invisible.
      tx.$queryRaw<{ currency: string; balanceMinor: bigint }[]>`
        SELECT DISTINCT ON ("currency") "currency"::text, "balanceMinor"
        FROM "LedgerEntry"
        WHERE "entityType" = ${entityType} AND "entityId" = ${entityId}::uuid
        ORDER BY "currency", "seq" DESC`,
    ]);
    return { entries, total, balances };
  },

  /**
   * What one month did to the account: the balance carried in, the debits and
   * credits within it, and the balance it closed at.
   *
   * AGGREGATED, not read off the running `balanceMinor` column. That column is
   * cumulative in `seq` order — the order rows were APPENDED — while this question
   * is about `period`, the month the money belongs to. The two orders agree only
   * while nobody records anything out of order, and this product invites exactly
   * that: `payments.service.update` appends an adjustment carrying the ORIGINAL
   * payment's period, so editing a March payment in July writes a March-period row
   * with a July `seq`. Reading "the balance before this period" as "the
   * balanceMinor of the last row with an earlier period" would then return a
   * balance that already includes four later months of activity.
   *
   * Summing per period cannot drift that way, and it makes the figures close:
   * opening + debit − settled − creditAdjustments === closing, by construction.
   *
   * Credits are SPLIT by type rather than summed into one figure. Three different
   * things write credits — a register (money moved), an edit that lowers the total,
   * and a cancel that reverses what was outstanding — and only the first is a
   * payment. Reported together under one label, correcting a 100000 charge down to
   * 60000 reads as 40000 paid on a month when nothing was paid.
   */
  async periodSummary(
    tx: Prisma.TransactionClient,
    entityType: string,
    entityId: string,
    bounds: { start: Date; end: Date },
    currency: string,
  ): Promise<PeriodSummary> {
    // ONE LANE, and required. The five figures close by construction
    // (opening + debit - settled - creditAdjustments === closing), and that identity is
    // only meaningful inside a lane: summed across two it is an equation about nothing.
    const account = { entityType, entityId, currency: currency as Prisma.EnumCurrencyFilter };
    const inPeriod = { ...account, period: { gte: bounds.start, lt: bounds.end } };
    const [before, debits, settled, corrections] = await Promise.all([
      tx.ledgerEntry.aggregate({
        _sum: { debitMinor: true, creditMinor: true },
        where: { ...account, period: { lt: bounds.start } },
      }),
      tx.ledgerEntry.aggregate({ _sum: { debitMinor: true }, where: inPeriod }),
      tx.ledgerEntry.aggregate({
        _sum: { creditMinor: true },
        where: { ...inPeriod, type: { in: [...SETTLEMENT_TYPES] } },
      }),
      tx.ledgerEntry.aggregate({
        _sum: { creditMinor: true },
        // Everything that is NOT a settlement, so a credit type added later lands
        // among the corrections rather than silently inflating what was paid.
        where: { ...inPeriod, type: { notIn: [...SETTLEMENT_TYPES] } },
      }),
    ]);
    // `_sum` is null when nothing matched — a brand-new account, or a month with
    // no movement. Both are legitimately zero, unlike the nulls elsewhere in this
    // codebase that mean "not recorded".
    const opening = (before._sum.debitMinor ?? 0n) - (before._sum.creditMinor ?? 0n);
    const debit = debits._sum.debitMinor ?? 0n;
    const paid = settled._sum.creditMinor ?? 0n;
    const corrected = corrections._sum.creditMinor ?? 0n;
    return {
      openingBalanceMinor: opening,
      debitMinor: debit,
      settledMinor: paid,
      creditAdjustmentsMinor: corrected,
      closingBalanceMinor: opening + debit - paid - corrected,
    };
  },
};
