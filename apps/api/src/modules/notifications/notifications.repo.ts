/** Notifications repository. */
import type { Prisma } from '@hold/db';
import type { Role } from '@hold/shared';

export const notificationsRepo = {
  list(tx: Prisma.TransactionClient, userId: string, unreadOnly: boolean, limit: number) {
    return tx.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },

  countUnread(tx: Prisma.TransactionClient, userId: string) {
    return tx.notification.count({ where: { userId, readAt: null } });
  },

  /** Mark the caller's notices read. Scoped by userId in the WHERE so a caller can never
   *  mark someone else's as read, even with a borrowed id. */
  async markRead(
    tx: Prisma.TransactionClient,
    userId: string,
    ids: string[] | null,
  ): Promise<number> {
    const result = await tx.notification.updateMany({
      where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    return result.count;
  },

  createMany(tx: Prisma.TransactionClient, rows: Prisma.NotificationUncheckedCreateInput[]) {
    return tx.notification.createMany({ data: rows });
  },

  /** Candidate recipients: the studio's active members whose ROLE is in the event's
   *  audience. Filtered in the QUERY, not after — this runs inside the caller's write
   *  transaction, so loading the whole roster to keep two managers held the money row
   *  locked for a scan it never needed. */
  recipients(tx: Prisma.TransactionClient, roles: readonly Role[]) {
    return tx.user.findMany({
      where: { status: 'active', role: { in: [...roles] } },
      select: { id: true, role: true, notificationPrefs: true },
    });
  },

  findPrefs(tx: Prisma.TransactionClient, userId: string) {
    return tx.user.findFirst({
      where: { id: userId },
      select: { notificationPrefs: true },
    });
  },

  savePrefs(tx: Prisma.TransactionClient, userId: string, prefs: Prisma.InputJsonValue) {
    return tx.user.update({ where: { id: userId }, data: { notificationPrefs: prefs } });
  },
};
