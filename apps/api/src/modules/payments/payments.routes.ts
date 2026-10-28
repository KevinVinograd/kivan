/**
 * Payments / Pagos routes — owner/admin only (fail-closed). Every handler runs
 * inside runInTx. `register` is atomic + idempotent in the service.
 */
import type { FastifyInstance } from 'fastify';
import { paymentsService } from './payments.service.js';
import {
  createPaymentSchema,
  createProviderSchema,
  kpisQuerySchema,
  listPaymentsQuerySchema,
  paymentIdParamSchema,
  registerPaymentSchema,
  updatePaymentSchema,
} from './payments.schema.js';

export async function paymentsRoutes(app: FastifyInstance): Promise<void> {
  const manager = {
    preHandler: [app.authenticate, app.loadActor, app.requireRole('owner', 'admin')],
  };
  const gated = (permission: string) => ({
    preHandler: [...manager.preHandler, app.requirePermission(permission)],
  });

  app.get('/providers', manager, async (request) => {
    return app.runInTx((tx) => paymentsService.listProviders(tx));
  });

  app.post('/providers', manager, async (request, reply) => {
    const input = createProviderSchema.parse(request.body);
    const created = await app.runInTx((tx) =>
      paymentsService.createProvider(tx, input),
    );
    return reply.status(201).send(created);
  });

  app.get('/payments', manager, async (request) => {
    const query = listPaymentsQuerySchema.parse(request.query);
    return app.runInTx((tx) => paymentsService.list(tx, query));
  });

  app.get('/payments/kpis', manager, async (request) => {
    const { period } = kpisQuerySchema.parse(request.query);
    return app.runInTx((tx) => paymentsService.kpis(tx, period));
  });

  app.get('/payments/:id', manager, async (request) => {
    const { id } = paymentIdParamSchema.parse(request.params);
    return app.runInTx((tx) => paymentsService.getById(tx, id));
  });

  /**
   * The recipient's banking details. Capability-gated, NOT role-gated, and served
   * apart from the payment itself.
   *
   * `teamBankDetails` exists so this boundary can be closed in one line — flip it
   * off for `admin` and `ROLE_CAPABILITIES` closes the `/team` column and this
   * endpoint together. Folding these fields into `GET /payments` would have left
   * that flip half-applied: the column gone, the same data still served one click
   * deeper, which is the exact drift `capabilities.ts` was written to end.
   */
  app.get(
    '/payments/:id/bank',
    {
      // BOTH gates, conjoined. Identical today (owner and admin hold every
      // capability), but they answer different questions: `requireRole` says who has
      // business on a Finanzas surface, `requireCapability` says who may see banking
      // data. Granting `teamBankDetails` to `employee` — the natural way to let a
      // colaboradora see her OWN account — would otherwise turn this into a
      // workspace-wide CBU dump, silently, since it serves any payment id.
      preHandler: [
        app.authenticate,
        app.loadActor,
        app.requireRole('owner', 'admin'),
        app.requireCapability('teamBankDetails'),
      ],
    },
    async (request) => {
      const { id } = paymentIdParamSchema.parse(request.params);
      return app.runInTx((tx) => paymentsService.recipientBank(tx, id));
    },
  );

  app.post('/payments', gated('payment.create'), async (request, reply) => {
    const input = createPaymentSchema.parse(request.body);
    const created = await app.runInTx((tx) =>
      paymentsService.create(tx, input),
    );
    return reply.status(201).send(created);
  });

  app.patch('/payments/:id', manager, async (request) => {
    const { id } = paymentIdParamSchema.parse(request.params);
    const input = updatePaymentSchema.parse(request.body);
    return app.runInTx((tx) => paymentsService.update(tx, id, input));
  });

  app.post('/payments/:id/approve', gated('payment.approve'), async (request) => {
    const { id } = paymentIdParamSchema.parse(request.params);
    return app.runInTx((tx) =>
      paymentsService.approve(tx, id, request.actor!.userId),
    );
  });

  app.post('/payments/:id/register', gated('payment.register'), async (request) => {
    const { id } = paymentIdParamSchema.parse(request.params);
    const { amountMinor, idempotencyKey, paymentDate, treasuryAccountId, method } =
      registerPaymentSchema.parse(request.body);
    return app.runInTx((tx) =>
      paymentsService.register(tx, id, amountMinor, {
        ...(idempotencyKey ? { idempotencyKey } : {}),
        ...(paymentDate ? { paymentDate } : {}),
        ...(treasuryAccountId ? { treasuryAccountId } : {}),
        ...(method ? { method } : {}),
        userId: request.actor!.userId,
      }),
    );
  });

  app.post('/payments/:id/cancel', manager, async (request) => {
    const { id } = paymentIdParamSchema.parse(request.params);
    return app.runInTx((tx) => paymentsService.cancel(tx, id));
  });
}
