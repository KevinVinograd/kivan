/** Service catalog repository. Runs on the `tx` from runInTx. */
import type { Prisma } from '@hold/db';

export const servicesRepo = {
  list(tx: Prisma.TransactionClient) {
    return tx.service.findMany({ orderBy: { name: 'asc' } });
  },

  /**
   * Case-insensitive lookup by name, for the duplicate check.
   *
   * The unique index is on the exact `name`, so "Redes" and
   * "redes" are two rows to Postgres and one service to the studio. Catching it
   * here keeps the catalog from filling with near-duplicates that then split a
   * client's assignments across what a person reads as one service.
   */
  findByName(tx: Prisma.TransactionClient, name: string) {
    return tx.service.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
  },

  create(tx: Prisma.TransactionClient, data: Prisma.ServiceUncheckedCreateInput) {
    return tx.service.create({ data });
  },
};
