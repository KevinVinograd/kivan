/**
 * TeamMember repository — the only Prisma caller for the module. Every function
 * takes the transaction (`tx` from runInTx). Soft-deleted rows
 * (`deletedAt != null`) are excluded from reads.
 */
import type { Prisma } from '@hold/db';

// `bank` is included ONLY to derive `bankComplete`/`bankStatus` in the DTO — the fields
// themselves are never serialized there (they ride the capability-gated bank route). The
// module holds that gate, so BD001 is satisfied; this include exposes nothing. EVERY read
// or write that answers with a member DTO carries it: one without it reports "no bank".
const bankFlag = {
  select: { bankName: true, accountHolder: true, cbuOrCvu: true, alias: true },
} as const;

interface ListArgs {
  limit: number;
  offset: number;
  onlyId?: string | null;
}

export const teamRepo = {
  async list(tx: Prisma.TransactionClient, { limit, offset, onlyId }: ListArgs) {
    // Employee with no linked member → no rows (avoid querying an invalid id).
    if (onlyId === null) {
      return { items: [], total: 0 };
    }
    const where: Prisma.TeamMemberWhereInput = {
      deletedAt: null,
      ...(onlyId ? { id: onlyId } : {}),
    };
    const [items, total] = await Promise.all([
      tx.teamMember.findMany({
        where,
        include: { bank: bankFlag },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      tx.teamMember.count({ where }),
    ]);
    return { items, total };
  },

  findById(tx: Prisma.TransactionClient, id: string) {
    return tx.teamMember.findFirst({
      where: { id, deletedAt: null },
      include: { bank: bankFlag },
    });
  },

  create(tx: Prisma.TransactionClient, data: Prisma.TeamMemberUncheckedCreateInput) {
    return tx.teamMember.create({ data, include: { bank: bankFlag } });
  },

  update(tx: Prisma.TransactionClient, id: string, data: Prisma.TeamMemberUpdateInput) {
    return tx.teamMember.update({ where: { id }, data, include: { bank: bankFlag } });
  },

  softDelete(tx: Prisma.TransactionClient, id: string) {
    return tx.teamMember.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'inactive' },
      include: { bank: bankFlag },
    });
  },

  // --- Bank details (served ONLY through the capability-gated bank sub-resource) ---
  findBank(tx: Prisma.TransactionClient, bankId: string) {
    return tx.bank.findFirst({ where: { id: bankId } });
  },
  createBank(tx: Prisma.TransactionClient, data: Prisma.BankUncheckedCreateInput) {
    return tx.bank.create({ data });
  },
  updateBank(tx: Prisma.TransactionClient, id: string, data: Prisma.BankUncheckedUpdateInput) {
    return tx.bank.update({ where: { id }, data });
  },
  linkBank(tx: Prisma.TransactionClient, memberId: string, bankId: string) {
    return tx.teamMember.update({ where: { id: memberId }, data: { bankId } });
  },
};
