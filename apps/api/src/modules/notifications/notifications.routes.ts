/**
 * Notification routes. Every one is SELF-scoped: a caller only ever lists, reads or
 * configures their OWN notices — there is no route that reaches another person's, so
 * these need no role gate beyond being authenticated.
 */
import type { FastifyInstance } from 'fastify';
import { notificationsService } from './notifications.service.js';
import {
  listNotificationsQuerySchema,
  markReadSchema,
  notificationPrefsSchema,
} from './notifications.schema.js';

export async function notificationsRoutes(app: FastifyInstance): Promise<void> {
  const authed = { preHandler: [app.authenticate, app.loadActor] };

  app.get('/notifications', authed, async (request) => {
    const { unread, limit } = listNotificationsQuerySchema.parse(request.query);
    const actor = request.actor!;
    return app.runInTx((tx) =>
      notificationsService.list(tx, actor.userId, unread === true, limit),
    );
  });

  app.post('/notifications/read', authed, async (request) => {
    const input = markReadSchema.parse(request.body);
    const actor = request.actor!;
    return app.runInTx((tx) =>
      notificationsService.markRead(tx, actor.userId, input.all ? null : (input.ids ?? [])),
    );
  });

  app.get('/me/notification-preferences', authed, async (request) => {
    const actor = request.actor!;
    return app.runInTx((tx) =>
      notificationsService.getPrefs(tx, actor.userId),
    );
  });

  app.put('/me/notification-preferences', authed, async (request) => {
    const prefs = notificationPrefsSchema.parse(request.body);
    const actor = request.actor!;
    return app.runInTx((tx) =>
      notificationsService.savePrefs(tx, actor.userId, prefs),
    );
  });
}
