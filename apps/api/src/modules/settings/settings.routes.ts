/**
 * Settings routes. Workspace/users/audit are owner+admin (fail-closed); the
 * profile routes are available to any authenticated user (their own profile).
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { env } from '@hold/config';
import { settingsService } from './settings.service.js';
import {
  changePasswordSchema,
  changeRoleSchema,
  changeStatusSchema,
  inviteUserSchema,
  updateProfileSchema,
  updateWorkspaceSchema,
  userIdParamSchema,
} from './settings.schema.js';

const auditQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  const authed = { preHandler: [app.authenticate, app.loadActor] };
  const manager = {
    preHandler: [app.authenticate, app.loadActor, app.requireRole('owner', 'admin')],
  };
  const ownerOnly = {
    preHandler: [app.authenticate, app.loadActor, app.requireRole('owner')],
  };
  const gated = (permission: string) => ({
    preHandler: [...manager.preHandler, app.requirePermission(permission)],
  });

  app.get('/workspace', manager, async (request) => {
    return app.runInTx((tx) =>
      settingsService.getWorkspace(tx),
    );
  });

  app.put('/workspace', gated('workspace.update'), async (request) => {
    const input = updateWorkspaceSchema.parse(request.body);
    return app.runInTx((tx) =>
      settingsService.updateWorkspace(tx, request.actor!.userId, input),
    );
  });

  app.get('/users', manager, async (request) => {
    return app.runInTx((tx) => settingsService.listUsers(tx));
  });

  app.post('/users', gated('user.invite'), async (request, reply) => {
    const input = inviteUserSchema.parse(request.body);
    // Returns { user, invite: { link, mailed } } — the caller shows the link when
    // mail didn't go out (or is off) so the admin can hand it over.
    const result = await app.runInTx((tx) =>
      settingsService.inviteUser(tx, request.actor!.userId, input),
    );
    return reply.status(201).send(result);
  });

  app.patch('/users/:id/role', gated('user.role.change'), async (request) => {
    const { id } = userIdParamSchema.parse(request.params);
    const { role } = changeRoleSchema.parse(request.body);
    return app.runInTx((tx) =>
      settingsService.changeUserRole(
        tx,
        request.actor!.userId,
        request.actor!.role,
        id,
        role,
      ),
    );
  });

  app.patch('/users/:id/status', gated('user.deactivate'), async (request) => {
    const { id } = userIdParamSchema.parse(request.params);
    const { status } = changeStatusSchema.parse(request.body);
    return app.runInTx((tx) =>
      settingsService.changeUserStatus(
        tx,
        request.actor!.userId,
        request.actor!.role,
        id,
        status,
      ),
    );
  });

  // Hand the owner seat to another member — owner-only, and the service re-checks
  // that the caller holds it. The current owner steps down to admin in the same
  // transaction, so the caller must refresh its session (its role changed).
  app.post('/users/:id/transfer-ownership', ownerOnly, async (request) => {
    const { id } = userIdParamSchema.parse(request.params);
    return app.runInTx((tx) =>
      settingsService.transferOwnership(
        tx,
        request.actor!.userId,
        id,
      ),
    );
  });

  // Owner/admin sends a locked-out member a password-reset link (mints a one-time
  // set-password token + emails it, reusing the invite machinery). The member chooses
  // their own new password; the actor never sees it. Returns { link, mailed } so the UI
  // can hand the link over on-screen when mail is off/unconfigured, like the invite flow.
  app.post('/users/:id/password-reset', manager, async (request) => {
    const { id } = userIdParamSchema.parse(request.params);
    return app.runInTx((tx) =>
      settingsService.sendPasswordReset(
        tx,
        request.actor!.userId,
        request.actor!.role,
        id,
      ),
    );
  });

  // Changing your own password ends every session (including this one's refresh chain),
  // so the client must send the user back through login.
  //
  // Rate-limited per ACCOUNT, not per IP. The current-password check is what stops a
  // stolen access token from being escalated into a full account takeover, which makes it
  // a guessing oracle: the global limiter (per-IP) leaves an attacker who already holds a
  // token free to grind guesses from a handful of addresses. Keying on the authenticated
  // user id caps attempts against a given account no matter where they come from. The
  // limiter runs after `authenticate`, so `request.actor` is populated; the IP is the
  // fallback only for the unauthenticated case, which never reaches the handler anyway.
  app.put('/me/password', {
    ...authed,
    config: {
      rateLimit: {
        max: env.RATE_LIMIT_AUTH,
        timeWindow: env.RATE_LIMIT_AUTH_WINDOW,
        keyGenerator: (request: FastifyRequest) => request.actor?.userId ?? request.ip,
      },
    },
  }, async (request, reply) => {
    const input = changePasswordSchema.parse(request.body);
    await app.runInTx((tx) =>
      settingsService.changePassword(tx, request.actor!.userId, input),
    );
    return reply.status(204).send();
  });

  app.get('/me/profile', authed, async (request) => {
    return app.runInTx((tx) => settingsService.getProfile(tx, request.actor!.userId));
  });

  app.put('/me/profile', authed, async (request) => {
    const input = updateProfileSchema.parse(request.body);
    return app.runInTx((tx) =>
      settingsService.updateProfile(tx, request.actor!.userId, input),
    );
  });

  app.get('/audit-events', gated('activity.read'), async (request) => {
    const { limit } = auditQuerySchema.parse(request.query);
    return app.runInTx((tx) => settingsService.recentAudit(tx, limit));
  });
}
