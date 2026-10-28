/** Edge validation (Zod) + DTOs for in-app notifications and their per-user preferences. */
import { z } from 'zod';

/**
 * The events a notice can be about. Closed on purpose: a preference document and a
 * notice row both key on these, so an unknown type would be a notice nobody can turn
 * off. Adding one means adding it here, to the defaults, and to the section's copy.
 */
export const NOTIFICATION_TYPES = ['month.closed', 'payment.approved', 'statement.sent'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** What a person is notified about when they have never configured it. On by default:
 *  these are the three movements the section already promised to announce. */
export const DEFAULT_NOTIFICATION_PREFS: Record<NotificationType, boolean> = {
  'month.closed': true,
  'payment.approved': true,
  'statement.sent': true,
};

export const notificationPrefsSchema = z.object({
  'month.closed': z.boolean(),
  'payment.approved': z.boolean(),
  'statement.sent': z.boolean(),
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

export const listNotificationsQuerySchema = z.object({
  /** Only the unread ones — what the badge counts. */
  unread: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

/** Mark specific notices read, or every one of the caller's when `all` is set. */
export const markReadSchema = z
  .object({
    ids: z.array(z.uuid()).max(200).optional(),
    all: z.boolean().optional(),
  })
  .refine((v) => v.all === true || (v.ids?.length ?? 0) > 0, {
    message: 'Send ids or all',
  });
export type MarkReadInput = z.infer<typeof markReadSchema>;

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationRecord {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export function toNotificationDto(r: NotificationRecord): NotificationDto {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    entityType: r.entityType,
    entityId: r.entityId,
    readAt: r.readAt ? r.readAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Read a stored preference document, falling back to the defaults for anything the
 *  stored blob does not answer (a document written before a type existed). */
export function readPrefs(stored: unknown): Record<NotificationType, boolean> {
  const parsed = notificationPrefsSchema.safeParse(stored);
  return parsed.success ? parsed.data : { ...DEFAULT_NOTIFICATION_PREFS };
}
