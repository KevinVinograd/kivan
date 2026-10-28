/**
 * Monthly Operation (cierre) routes — owner/admin only (fail-closed). Every
 * handler runs inside runInTx. Close/reopen are atomic in the service.
 */
import type { FastifyInstance } from 'fastify';
import { monthlyService } from './monthly.service.js';
import { periodParamSchema } from './monthly.schema.js';

export async function monthlyRoutes(app: FastifyInstance): Promise<void> {
  const manager = {
    preHandler: [app.authenticate, app.loadActor, app.requireRole('owner', 'admin')],
  };
  const gated = (permission: string) => ({
    preHandler: [...manager.preHandler, app.requirePermission(permission)],
  });

  app.get('/months', manager, async (request) => {
    return app.runInTx((tx) => monthlyService.list(tx));
  });

  app.get('/months/:period', manager, async (request) => {
    const { period } = periodParamSchema.parse(request.params);
    return app.runInTx((tx) => monthlyService.getDetail(tx, period));
  });

  app.get('/months/:period/close-blockers', manager, async (request) => {
    const { period } = periodParamSchema.parse(request.params);
    return app.runInTx((tx) => monthlyService.getBlockers(tx, period));
  });

  app.post('/months/:period/close', gated('month.close'), async (request) => {
    const { period } = periodParamSchema.parse(request.params);
    return app.runInTx((tx) =>
      monthlyService.close(tx, period, request.actor!.userId),
    );
  });

  app.post('/months/:period/reopen', gated('month.reopen'), async (request) => {
    const { period } = periodParamSchema.parse(request.params);
    return app.runInTx((tx) =>
      monthlyService.reopen(tx, period, request.actor!.userId),
    );
  });
}
