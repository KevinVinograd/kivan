/**
 * PayoutStatement routes — owner/admin only (fail-closed). Every handler runs
 * inside runInTx. Lifecycle transitions and register are atomic.
 */
import type { FastifyInstance } from 'fastify';
import { payoutsService } from './payouts.service.js';
import {
  addAdjustmentSchema,
  listPayoutsQuerySchema,
  registerPayoutSchema,
  statementIdParamSchema,
  upsertPayoutSchema,
} from './payouts.schema.js';

export async function payoutsRoutes(app: FastifyInstance): Promise<void> {
  const manager = {
    preHandler: [app.authenticate, app.loadActor, app.requireRole('owner', 'admin')],
  };
  const gated = (permission: string) => ({
    preHandler: [...manager.preHandler, app.requirePermission(permission)],
  });

  app.get('/payout-statements', manager, async (request) => {
    const query = listPayoutsQuerySchema.parse(request.query);
    return app.runInTx((tx) => payoutsService.list(tx, query));
  });

  app.get('/payout-statements/:id', manager, async (request) => {
    const { id } = statementIdParamSchema.parse(request.params);
    return app.runInTx((tx) => payoutsService.getById(tx, id));
  });

  // Upsert the plan for (member, period).
  app.post('/payout-statements', manager, async (request, reply) => {
    const input = upsertPayoutSchema.parse(request.body);
    const dto = await app.runInTx((tx) =>
      payoutsService.upsert(tx, input),
    );
    return reply.status(201).send(dto);
  });

  app.post('/payout-statements/:id/adjustments', manager, async (request, reply) => {
    const { id } = statementIdParamSchema.parse(request.params);
    const input = addAdjustmentSchema.parse(request.body);
    const dto = await app.runInTx((tx) =>
      payoutsService.addAdjustment(tx, id, input),
    );
    return reply.status(201).send(dto);
  });

  app.post('/payout-statements/:id/approve', gated('payout.approve'), async (request) => {
    const { id } = statementIdParamSchema.parse(request.params);
    return app.runInTx((tx) =>
      payoutsService.approve(tx, id, request.actor!.userId),
    );
  });

  app.post('/payout-statements/:id/dispatch', gated('payout.approve'), async (request) => {
    const { id } = statementIdParamSchema.parse(request.params);
    return app.runInTx((tx) => payoutsService.dispatch(tx, id));
  });

  app.post('/payout-statements/:id/confirm', gated('payout.approve'), async (request) => {
    const { id } = statementIdParamSchema.parse(request.params);
    return app.runInTx((tx) => payoutsService.confirm(tx, id));
  });

  app.post('/payout-statements/:id/register', manager, async (request) => {
    const { id } = statementIdParamSchema.parse(request.params);
    const { amountMinor, paidAt, treasuryAccountId, idempotencyKey } = registerPayoutSchema.parse(
      request.body,
    );
    return app.runInTx((tx) =>
      payoutsService.register(tx, id, amountMinor, {
        idempotencyKey,
        paidAt,
        treasuryAccountId,
        userId: request.actor!.userId,
      }),
    );
  });
}
