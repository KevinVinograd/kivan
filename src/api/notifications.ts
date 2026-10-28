/** In-app notifications + the caller's own preferences — thin typed wrappers. */
import { z } from 'zod'
import { apiClient } from './client'

export const NotificationSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
})
export type NotificationDto = z.infer<typeof NotificationSchema>

export const NotificationListSchema = z.object({
  items: z.array(NotificationSchema),
  /** Unread count for the badge — always the FULL count, not the page's. */
  unread: z.number(),
})
export type NotificationListDto = z.infer<typeof NotificationListSchema>

export const NotificationPrefsSchema = z.object({
  'month.closed': z.boolean(),
  'payment.approved': z.boolean(),
  'statement.sent': z.boolean(),
})
export type NotificationPrefs = z.infer<typeof NotificationPrefsSchema>

const MarkReadResultSchema = z.object({ read: z.number() })

export const notificationsApi = {
  /** The caller's notices. `limit` exists for the rail badge, which needs the `unread`
   *  COUNT and none of the rows: without it every poll shipped up to 50 full notices to
   *  render a number. */
  list: (unread?: boolean, limit?: number) =>
    apiClient.get<NotificationListDto>('/notifications', {
      params: {
        ...(unread ? { unread: 'true' } : {}),
        ...(limit !== undefined ? { limit: String(limit) } : {}),
      },
      schema: NotificationListSchema,
    }),
  markRead: (ids: string[]) =>
    apiClient.post<{ read: number }>('/notifications/read', { ids }, { schema: MarkReadResultSchema }),
  markAllRead: () =>
    apiClient.post<{ read: number }>('/notifications/read', { all: true }, { schema: MarkReadResultSchema }),
  getPrefs: () =>
    apiClient.get<NotificationPrefs>('/me/notification-preferences', { schema: NotificationPrefsSchema }),
  savePrefs: (prefs: NotificationPrefs) =>
    apiClient.put<NotificationPrefs>('/me/notification-preferences', prefs, {
      schema: NotificationPrefsSchema,
    }),
}
