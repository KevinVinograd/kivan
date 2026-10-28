/**
 * Settings repository: the studio settings row, users and invitations.
 */
import type { Prisma } from '@hold/db';

/** Name given to the settings row when it is created on first use. */
const DEFAULT_STUDIO_NAME = 'Estudio';

export const settingsRepo = {
  /**
   * The studio's single settings row, created on first use. The advisory lock serializes
   * two first requests racing to create it, so the table never ends up with two rows.
   */
  async getOrCreateWorkspace(tx: Prisma.TransactionClient) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('workspace-settings-row'), 0)`;
    const existing = await tx.workspace.findFirst({ orderBy: { createdAt: 'asc' } });
    return existing ?? tx.workspace.create({ data: { name: DEFAULT_STUDIO_NAME } });
  },
  updateWorkspace(
    tx: Prisma.TransactionClient,
    id: string,
    data: Prisma.WorkspaceUncheckedUpdateInput,
  ) {
    return tx.workspace.update({ where: { id }, data });
  },

  listUsers(tx: Prisma.TransactionClient) {
    return tx.user.findMany({ orderBy: { createdAt: 'asc' } });
  },
  findUser(tx: Prisma.TransactionClient, id: string) {
    return tx.user.findFirst({ where: { id } });
  },
  findUserById(tx: Prisma.TransactionClient, id: string) {
    return tx.user.findUnique({ where: { id } });
  },
  createUser(tx: Prisma.TransactionClient, data: Prisma.UserUncheckedCreateInput) {
    return tx.user.create({ data });
  },
  /** The roster person to link a login to; an unknown or removed id resolves to null. */
  findTeamMember(tx: Prisma.TransactionClient, id: string) {
    return tx.teamMember.findFirst({ where: { id, deletedAt: null } });
  },
  /** The login already linked to a roster person, if any (the link is 1:1). */
  findUserByTeamMemberId(tx: Prisma.TransactionClient, teamMemberId: string) {
    return tx.user.findFirst({ where: { teamMemberId } });
  },
  createInvitation(
    tx: Prisma.TransactionClient,
    data: { userId: string; tokenHash: string; expiresAt: Date },
  ) {
    return tx.invitation.create({ data });
  },
  updateUserRole(tx: Prisma.TransactionClient, id: string, role: 'admin' | 'employee') {
    return tx.user.update({ where: { id }, data: { role } });
  },
  updateProfile(tx: Prisma.TransactionClient, id: string, data: Prisma.UserUncheckedUpdateInput) {
    return tx.user.update({ where: { id }, data });
  },

  recentAudit(tx: Prisma.TransactionClient, limit: number) {
    return tx.auditEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },
};
