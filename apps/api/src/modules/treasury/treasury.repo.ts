/**
 * Treasury repository. Runs on the `tx` from runInTx.
 * Account and commitment edits are guarded by an optimistic-concurrency
 * `version` predicate (updateMany WHERE … version = expected).
 */
import type { Prisma } from '@hold/db';
import type { Currency } from '@hold/shared';

import type { LinkedEntityTypeValue } from './treasury.schema.js';

export const treasuryRepo = {
  /**
   * The automatic balance movements from a date onward (newest first).
   *
   * Read with the position anchor as `from`, this answers "what has moved the balances
   * since the date they were good as of" — provenance for a figure that now changes on
   * its own. It is informational: the movements are ALREADY inside the balances, so
   * nothing may add them to the position on top.
   */
  listMovements(tx: Prisma.TransactionClient, from: Date | undefined, limit: number) {
    return tx.treasuryMovement.findMany({
      where: from ? { date: { gte: from } } : {},
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
  },

  /**
   * Per (account, lane, direction) sums over EVERY movement since `from` — no `take`.
   *
   * `listMovements` is a paged audit read and may legitimately stop at `limit`; the
   * Saldos provenance line is arithmetic and may not. Summing a truncated page told the
   * operator "+$4.100.000 en cobros" when the real figure was larger, on the one screen
   * whose job is explaining why a balance they typed has changed.
   */
  sumMovements(tx: Prisma.TransactionClient, from: Date | undefined) {
    return tx.treasuryMovement.groupBy({
      by: ['accountId', 'lane', 'direction'],
      where: from ? { date: { gte: from } } : {},
      _sum: { amountMinor: true },
    });
  },

  // --- Accounts --------------------------------------------------------------
  createAccount(tx: Prisma.TransactionClient, data: Prisma.TreasuryAccountUncheckedCreateInput) {
    return tx.treasuryAccount.create({ data });
  },
  findAccount(tx: Prisma.TransactionClient, id: string) {
    return tx.treasuryAccount.findFirst({ where: { id, deletedAt: null } });
  },
  listAccounts(tx: Prisma.TransactionClient) {
    return tx.treasuryAccount.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } });
  },
  /** Guarded update: applies only if the row is at the expected version. */
  async updateAccount(
    tx: Prisma.TransactionClient,
    id: string,
    version: number,
    data: Prisma.TreasuryAccountUncheckedUpdateInput,
  ): Promise<number> {
    const res = await tx.treasuryAccount.updateMany({
      where: { id, deletedAt: null, version },
      data: { ...data, version: { increment: 1 } },
    });
    return res.count;
  },
  async softDeleteAccount(tx: Prisma.TransactionClient, id: string, version: number): Promise<number> {
    const res = await tx.treasuryAccount.updateMany({
      where: { id, deletedAt: null, version },
      data: { deletedAt: new Date(), isActive: false, version: { increment: 1 } },
    });
    return res.count;
  },

  async positionSums(tx: Prisma.TransactionClient) {
    const sumFields = { balanceArsMinor: true, balanceUsdMinor: true } as const;
    const [operating, reserve] = await Promise.all([
      tx.treasuryAccount.aggregate({
        _sum: sumFields,
        where: { isActive: true, isReserve: false, deletedAt: null },
      }),
      tx.treasuryAccount.aggregate({
        _sum: sumFields,
        where: { isActive: true, isReserve: true, deletedAt: null },
      }),
    ]);
    return { operating: operating._sum, reserve: reserve._sum };
  },

  // --- Commitments -----------------------------------------------------------
  createCommitment(tx: Prisma.TransactionClient, data: Prisma.CommittedItemUncheckedCreateInput) {
    return tx.committedItem.create({ data });
  },
  /**
   * Does the entity a commitment wants to link to actually exist here?
   *
   * The two link columns are plain nullable columns, not FKs, so nothing at the DB
   * level stops an id that names no row. An unknown id simply finds nothing and
   * the caller turns that into a 400 rather than persisting a link that can never
   * match an actual.
   */
  async linkedEntityExists(
    tx: Prisma.TransactionClient,
    type: LinkedEntityTypeValue,
    id: string,
  ): Promise<boolean> {
    if (type === 'client') {
      return (await tx.client.findFirst({ where: { id, deletedAt: null }, select: { id: true } })) !== null;
    }
    if (type === 'teamMember') {
      return (
        (await tx.teamMember.findFirst({ where: { id, deletedAt: null }, select: { id: true } })) !== null
      );
    }
    if (type === 'invoiceEmitter') {
      // No `deletedAt`: an emitter is workspace configuration, not a record that comes
      // and goes, so existence is the whole check.
      return (await tx.invoiceEmitter.findFirst({ where: { id }, select: { id: true } })) !== null;
    }
    return (await tx.provider.findFirst({ where: { id, deletedAt: null }, select: { id: true } })) !== null;
  },
  findCommitment(tx: Prisma.TransactionClient, id: string) {
    return tx.committedItem.findFirst({ where: { id, deletedAt: null } });
  },
  listCommitments(tx: Prisma.TransactionClient) {
    return tx.committedItem.findMany({ where: { deletedAt: null }, orderBy: { startDate: 'asc' } });
  },
  listActiveCommitments(tx: Prisma.TransactionClient, currency: Currency) {
    return tx.committedItem.findMany({ where: { deletedAt: null, isActive: true, currency } });
  },
  async updateCommitment(
    tx: Prisma.TransactionClient,
    id: string,
    version: number,
    data: Prisma.CommittedItemUncheckedUpdateInput,
  ): Promise<number> {
    const res = await tx.committedItem.updateMany({
      where: { id, deletedAt: null, version },
      data: { ...data, version: { increment: 1 } },
    });
    return res.count;
  },
  async softDeleteCommitment(tx: Prisma.TransactionClient, id: string, version: number): Promise<number> {
    const res = await tx.committedItem.updateMany({
      where: { id, deletedAt: null, version },
      data: { deletedAt: new Date(), isActive: false, version: { increment: 1 } },
    });
    return res.count;
  },
};
