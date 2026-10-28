/**
 * Roles routes — OWNER ONLY, fail-closed.
 *
 * Defining what a role may do is account governance, and governance is the one
 * place owner and admin differ (see `settings.service.ts`). An admin who could
 * edit roles could grant themselves anything, which is a privilege-escalation
 * path dressed up as a settings screen — so the whole module sits behind
 * `requireRole('owner')`, matching the section's own gate in the web app.
 */
import type { FastifyInstance } from 'fastify';
import { rolesService } from './roles.service.js';
import {
  assignRoleSchema,
  createRoleSchema,
  deleteRoleQuerySchema,
  roleIdParamSchema,
  updateRoleSchema,
  userIdParamSchema,
} from './roles.schema.js';

export async function rolesRoutes(app: FastifyInstance): Promise<void> {
  const ownerOnly = {
    preHandler: [app.authenticate, app.loadActor, app.requireRole('owner')],
  };

  app.get('/roles', ownerOnly, async (request) => {
    return app.runInTx((tx) => rolesService.list(tx));
  });

  app.post('/roles', ownerOnly, async (request, reply) => {
    const input = createRoleSchema.parse(request.body);
    const role = await app.runInTx((tx) =>
      rolesService.create(tx, request.actor!.userId, input),
    );
    return reply.status(201).send(role);
  });

  app.put('/roles/:id', ownerOnly, async (request) => {
    const { id } = roleIdParamSchema.parse(request.params);
    const input = updateRoleSchema.parse(request.body);
    return app.runInTx((tx) =>
      rolesService.update(tx, request.actor!.userId, id, input),
    );
  });

  app.delete('/roles/:id', ownerOnly, async (request, reply) => {
    const { id } = roleIdParamSchema.parse(request.params);
    const { version } = deleteRoleQuerySchema.parse(request.query);
    await app.runInTx((tx) =>
      rolesService.remove(tx, request.actor!.userId, id, version),
    );
    return reply.status(204).send();
  });

  // Assignment lives here rather than in the settings module: it is the roles
  // domain, and keeping it out of settings.routes.ts avoids colliding with the
  // concurrent work in the users/auth modules.
  app.patch('/users/:id/workspace-role', ownerOnly, async (request, reply) => {
    const { id } = userIdParamSchema.parse(request.params);
    const { roleId } = assignRoleSchema.parse(request.body);
    await app.runInTx((tx) =>
      rolesService.assign(tx, request.actor!.userId, id, roleId),
    );
    return reply.status(204).send();
  });
}
