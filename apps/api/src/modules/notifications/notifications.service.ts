/**
 * In-app notifications. A notice is a row the recipient reads inside the app — there is
 * no email and no scheduler here: `notify` is called INLINE by the action that caused the
 * event, inside that action's own transaction, so a notice can never claim something the
 * write did not commit.
 */
import type { Prisma } from '@hold/db';
import { childLogger } from '@hold/config';
import type { Role } from '@hold/shared';
import { notificationsRepo } from './notifications.repo.js';
import {
  readPrefs,
  toNotificationDto,
  type NotificationDto,
  type NotificationPrefs,
  type NotificationType,
} from './notifications.schema.js';

/** Closing a month and moving money are manager business; the whole roster does not need
 *  them. Kept as a per-type map, not one constant, because it is the seam an
 *  employee-facing event (an extra of theirs approved, say) would use — the three entries
 *  agreeing today is a fact about today's events, not about the rule. */
const MANAGER_AUDIENCE: readonly Role[] = ['owner', 'admin'];
const AUDIENCE: Record<NotificationType, readonly Role[]> = {
  'month.closed': MANAGER_AUDIENCE,
  'payment.approved': MANAGER_AUDIENCE,
  'statement.sent': MANAGER_AUDIENCE,
};

export const notificationsService = {
  async list(
    tx: Prisma.TransactionClient,
    userId: string,
    unreadOnly: boolean,
    limit: number,
  ): Promise<{ items: NotificationDto[]; unread: number }> {
    const [rows, unread] = await Promise.all([
      notificationsRepo.list(tx, userId, unreadOnly, limit),
      notificationsRepo.countUnread(tx, userId),
    ]);
    return { items: rows.map(toNotificationDto), unread };
  },

  async markRead(
    tx: Prisma.TransactionClient,
    userId: string,
    ids: string[] | null,
  ): Promise<{ read: number }> {
    return { read: await notificationsRepo.markRead(tx, userId, ids) };
  },

  async getPrefs(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<NotificationPrefs> {
    const row = await notificationsRepo.findPrefs(tx, userId);
    return readPrefs(row?.notificationPrefs);
  },

  async savePrefs(
    tx: Prisma.TransactionClient,
    userId: string,
    prefs: NotificationPrefs,
  ): Promise<NotificationPrefs> {
    await notificationsRepo.savePrefs(tx, userId, prefs);
    return prefs;
  },

  /**
   * Write one notice per eligible recipient. Eligible = an active member whose ROLE is in
   * the event's audience AND whose own preference has the event on (an unconfigured
   * person gets the defaults). The actor is skipped: nobody needs to be told about what
   * they just did themselves.
   *
   * NEVER THROWS. It runs inside the caller's transaction, so an exception here would roll
   * back the write that caused it — and notifying is never worth losing a close or a
   * payment. The failure boundary lives HERE rather than in a try/catch at each emit site:
   * three call sites each remembering to wrap it is a rule enforced by convention, and the
   * fourth emitter that forgets would take a money write down with it. A failure is logged
   * (a silently dropped notice is invisible) and reported as 0 sent.
   */
  /**
   * Never throws: a notice that cannot be written is logged and reported as 0 delivered.
   *
   * What that does and does NOT buy, stated precisely because the comment it replaces was
   * wrong in exactly this way. It stops a JS-level failure — a bad payload, a missing
   * recipient — from propagating into the caller's `catch` and aborting their write. It does
   * NOT make the notice free: this runs INSIDE the caller's transaction, so a failure at the
   * DATABASE level has already aborted it, and the caller's next statement fails with 25P02
   * no matter what is swallowed here. Nothing at this layer can undo that, and the previous
   * per-caller try/catch could not either.
   *
   * That is accepted, not overlooked: the notice is written in the same transaction on
   * purpose, so it can never claim something the write did not commit, and a DB refusing an
   * INSERT means the month close was in trouble regardless.
   */
  async notify(
    tx: Prisma.TransactionClient,
    actorUserId: string | null,
    notice: {
      type: NotificationType;
      title: string;
      body?: string;
      entityType?: string;
      entityId?: string;
    },
  ): Promise<number> {
    try {
      return await emit(tx, actorUserId, notice);
    } catch (err) {
      childLogger(actorUserId).error({ err, type: notice.type }, 'notification not written');
      return 0;
    }
  },
};

async function emit(
  tx: Prisma.TransactionClient,
  actorUserId: string | null,
  notice: {
    type: NotificationType;
    title: string;
    body?: string;
    entityType?: string;
    entityId?: string;
  },
): Promise<number> {
    const users = await notificationsRepo.recipients(tx, AUDIENCE[notice.type]);
    const rows = users
      .filter((u) => u.id !== actorUserId)
      .filter((u) => readPrefs(u.notificationPrefs)[notice.type])
      .map((u) => ({
        userId: u.id,
        type: notice.type,
        title: notice.title,
        ...(notice.body ? { body: notice.body } : {}),
        ...(notice.entityType ? { entityType: notice.entityType } : {}),
        ...(notice.entityId ? { entityId: notice.entityId } : {}),
      }));
    if (rows.length === 0) return 0;
    await notificationsRepo.createMany(tx, rows);
    return rows.length;
}
