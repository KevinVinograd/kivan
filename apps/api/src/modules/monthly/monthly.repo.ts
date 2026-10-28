/**
 * Monthly Operation repository. Runs on the `tx` from runInTx. The close path locks the MonthRecord (FOR UPDATE) so concurrent closes
 * serialize; the snapshot is append-only and versioned.
 */
import type { Prisma } from '@hold/db';

export const monthlyRepo = {
  ensureRecord(tx: Prisma.TransactionClient, period: string) {
    return tx.monthRecord.upsert({
      where: { period },
      create: { period, label: period },
      update: {},
    });
  },

  findRecord(tx: Prisma.TransactionClient, period: string) {
    return tx.monthRecord.findFirst({ where: { period } });
  },

  list(tx: Prisma.TransactionClient) {
    return tx.monthRecord.findMany({ orderBy: { period: 'desc' } });
  },

  /** Serialize concurrent closes/reopens on the same month. */
  async lockRecord(tx: Prisma.TransactionClient, id: string): Promise<void> {
    await tx.$executeRaw`SELECT 1 FROM "MonthRecord" WHERE "id" = ${id}::uuid FOR UPDATE`;
  },

  async maxSnapshotVersion(tx: Prisma.TransactionClient, monthRecordId: string): Promise<number> {
    const agg = await tx.monthSnapshot.aggregate({
      _max: { version: true },
      where: { monthRecordId },
    });
    return agg._max.version ?? 0;
  },

  latestSnapshot(tx: Prisma.TransactionClient, monthRecordId: string) {
    return tx.monthSnapshot.findFirst({ where: { monthRecordId }, orderBy: { version: 'desc' } });
  },

  createSnapshot(tx: Prisma.TransactionClient, data: Prisma.MonthSnapshotUncheckedCreateInput) {
    return tx.monthSnapshot.create({ data });
  },

  setClosed(tx: Prisma.TransactionClient, id: string, actorUserId: string) {
    return tx.monthRecord.update({
      where: { id },
      data: { status: 'closed', closedAt: new Date(), closedByUserId: actorUserId },
    });
  },

  setReopened(tx: Prisma.TransactionClient, id: string) {
    // Clear the close audit fields so a reopened month no longer reports the prior
    // close timestamp/actor (the snapshot history preserves the closed record).
    return tx.monthRecord.update({
      where: { id },
      data: { status: 'reopened', closedAt: null, closedByUserId: null },
    });
  },

  // --- Derived actuals (live overlay) ---------------------------------------
  receivableActualsByClient(tx: Prisma.TransactionClient, start: Date, end: Date) {
    // Scope to the ARS operating lane: the actuals DTO has no currency dimension, so
    // summing ARS/USD together would mix currencies. Non-ARS receivables belong
    // to the Treasury lanes, not the monthly (ARS) operating close.
    return tx.receivable.groupBy({
      by: ['clientId'],
      where: {
        period: { gte: start, lt: end },
        deletedAt: null,
        status: { not: 'cancelled' },
        currency: 'ARS',
      },
      _sum: { totalAmountMinor: true, collectedAmountMinor: true },
    });
  },

  /**
   * How many of the month's live receivables are NOT in the actuals above.
   *
   * `receivableActualsByClient` is scoped to ARS, correctly — a peso figure is peso rows.
   * But the actuals are BAKED into an append-only `MonthSnapshot` at close, so whatever
   * they omit is omitted from the studio's permanent record of that month, and a reopen
   * and reclose recomputes it the same way. Counting the omission is what keeps the frozen
   * record honest about its own scope.
   */
  countOtherLaneReceivables(tx: Prisma.TransactionClient, start: Date, end: Date) {
    return tx.receivable.count({
      where: {
        period: { gte: start, lt: end },
        deletedAt: null,
        status: { not: 'cancelled' },
        currency: { not: 'ARS' },
      },
    });
  },

  payoutActualsByMember(tx: Prisma.TransactionClient, start: Date, end: Date) {
    return tx.payoutStatement.groupBy({
      by: ['teamMemberId'],
      where: { period: { gte: start, lt: end }, deletedAt: null },
      _sum: { totalAmountMinor: true, paidAmountMinor: true },
    });
  },

  // --- Close blockers -------------------------------------------------------
  countArcaErrors(tx: Prisma.TransactionClient, start: Date, end: Date) {
    return tx.receivable.count({
      where: { period: { gte: start, lt: end }, deletedAt: null, billingStatus: 'error_arca' },
    });
  },

  countDraftPayouts(tx: Prisma.TransactionClient, start: Date, end: Date) {
    return tx.payoutStatement.count({
      where: { period: { gte: start, lt: end }, deletedAt: null, statementStatus: 'draft' },
    });
  },

  countActivity(tx: Prisma.TransactionClient, start: Date, end: Date) {
    return Promise.all([
      tx.receivable.count({ where: { period: { gte: start, lt: end }, deletedAt: null } }),
      tx.payoutStatement.count({ where: { period: { gte: start, lt: end }, deletedAt: null } }),
    ]).then(([r, p]) => r + p);
  },
};
