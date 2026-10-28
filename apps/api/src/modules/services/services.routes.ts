/**
 * Service catalog routes. Reading is open to any authenticated role — an employee
 * sees the service on their own assignments, so hiding the catalog from them would
 * leave a label they cannot resolve. Writing is owner/admin: the catalog is shared
 * state, and a typo becomes a near-duplicate every future assignment can pick.
 */
import type { FastifyInstance } from 'fastify';
import { servicesService } from './services.service.js';
import { createServiceSchema } from './services.schema.js';

export async function servicesRoutes(app: FastifyInstance): Promise<void> {
  const authed = { preHandler: [app.authenticate, app.loadActor] };
  const manager = {
    preHandler: [app.authenticate, app.loadActor, app.requireRole('owner', 'admin')],
  };

  app.get('/services', authed, async (request) => {
    return app.runInTx((tx) => servicesService.list(tx));
  });

  app.post('/services', manager, async (request, reply) => {
    const input = createServiceSchema.parse(request.body);
    const created = await app.runInTx((tx) =>
      servicesService.create(tx, input),
    );
    return reply.status(201).send(created);
  });
}
