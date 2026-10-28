/** Member activity repository — viáticos (MemberExpense) + extra work (MemberExtraWork). */
import type { Prisma } from '@hold/db';

export const memberActivityRepo = {
  /** Existence probe only — the caller just needs to know the id resolves, so it selects the id and nothing else (the row carries the member's cost
   *  and bank fields, which no caller of this reads). */
  findTeamMember(tx: Prisma.TransactionClient, id: string) {
    return tx.teamMember.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  },

  // ── Viáticos ──
  listExpenses(tx: Prisma.TransactionClient, teamMemberId?: string) {
    return tx.memberExpense.findMany({
      where: { deletedAt: null, ...(teamMemberId ? { teamMemberId } : {}) },
      orderBy: { date: 'desc' },
    });
  },
  createExpense(tx: Prisma.TransactionClient, data: Prisma.MemberExpenseUncheckedCreateInput) {
    return tx.memberExpense.create({ data });
  },

  // ── Extra work ──
  listExtras(tx: Prisma.TransactionClient, teamMemberId?: string) {
    return tx.memberExtraWork.findMany({
      where: { deletedAt: null, ...(teamMemberId ? { teamMemberId } : {}) },
      orderBy: { date: 'desc' },
    });
  },
  createExtra(tx: Prisma.TransactionClient, data: Prisma.MemberExtraWorkUncheckedCreateInput) {
    return tx.memberExtraWork.create({ data });
  },
  /** Flip every pending extra for a member to approved. Returns rows affected. */
  async approveExtras(
    tx: Prisma.TransactionClient,
    teamMemberId: string,
    approvedByUserId: string | null,
  ): Promise<number> {
    const result = await tx.memberExtraWork.updateMany({
      where: { teamMemberId, status: 'pending', deletedAt: null },
      data: { status: 'approved', approvedByUserId },
    });
    return result.count;
  },
};
