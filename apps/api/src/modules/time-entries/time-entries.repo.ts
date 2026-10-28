/**
 * TimeEntry repository. Runs on the `tx` from runInTx. Soft-deleted rows are excluded from reads.
 */
import type { Prisma } from '@hold/db';

export const timeEntriesRepo = {
  list(tx: Prisma.TransactionClient, where: Prisma.TimeEntryWhereInput) {
    return tx.timeEntry.findMany({
      where: { deletedAt: null, ...where },
      orderBy: { date: 'desc' },
    });
  },
  create(tx: Prisma.TransactionClient, data: Prisma.TimeEntryUncheckedCreateInput) {
    return tx.timeEntry.create({ data });
  },
};
