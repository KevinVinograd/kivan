/**
 * Treasury / Cashflow routes — owner/admin only (fail-closed). Every handler
 * runs inside runInTx. Account/commitment edits enforce optimistic
 * concurrency in the service.
 */
import type { FastifyInstance } from 'fastify';
import { treasuryService } from './treasury.service.js';
import {
  accountIdParamSchema,
  commitmentIdParamSchema,
  createAccountSchema,
  createCommitmentSchema,
  listMovementsQuerySchema,
  projectionQuerySchema,
  updateAccountSchema,
  updateCommitmentSchema,
} from './treasury.schema.js';
import { z } from 'zod';

const versionBody = z.object({ version: z.coerce.number().int().nonnegative() });

export async function treasuryRoutes(app: FastifyInstance): Promise<void> {
  const manager = {
    preHandler: [app.authenticate, app.loadActor, app.requireRole('owner', 'admin')],
  };
  const gated = (permission: string) => ({
    preHandler: [...manager.preHandler, app.requirePermission(permission)],
  });

  app.get('/treasury/accounts', manager, async (request) => {
    return app.runInTx((tx) => treasuryService.listAccounts(tx));
  });

  app.post('/treasury/accounts', gated('treasury.account.create'), async (request, reply) => {
    const input = createAccountSchema.parse(request.body);
    const dto = await app.runInTx((tx) =>
      treasuryService.createAccount(tx, input),
    );
    return reply.status(201).send(dto);
  });

  app.put('/treasury/accounts/:id', gated('treasury.account.update'), async (request) => {
    const { id } = accountIdParamSchema.parse(request.params);
    const input = updateAccountSchema.parse(request.body);
    return app.runInTx((tx) => treasuryService.updateAccount(tx, id, input));
  });

  app.delete('/treasury/accounts/:id', gated('treasury.account.delete'), async (request) => {
    const { id } = accountIdParamSchema.parse(request.params);
    const { version } = versionBody.parse(request.query);
    return app.runInTx((tx) => treasuryService.deleteAccount(tx, id, version));
  });

  app.get('/treasury/commitments', manager, async (request) => {
    return app.runInTx((tx) => treasuryService.listCommitments(tx));
  });

  app.post('/treasury/commitments', gated('treasury.commitment.create'), async (request, reply) => {
    const input = createCommitmentSchema.parse(request.body);
    const dto = await app.runInTx((tx) =>
      treasuryService.createCommitment(tx, input),
    );
    return reply.status(201).send(dto);
  });

  app.put('/treasury/commitments/:id', manager, async (request) => {
    const { id } = commitmentIdParamSchema.parse(request.params);
    const input = updateCommitmentSchema.parse(request.body);
    return app.runInTx((tx) => treasuryService.updateCommitment(tx, id, input));
  });

  app.delete('/treasury/commitments/:id', manager, async (request) => {
    const { id } = commitmentIdParamSchema.parse(request.params);
    const { version } = versionBody.parse(request.query);
    return app.runInTx((tx) => treasuryService.deleteCommitment(tx, id, version));
  });

  // What has moved the balances on its own, since a date (normally the position anchor).
  app.get('/treasury/movements', manager, async (request) => {
    const query = listMovementsQuerySchema.parse(request.query);
    return app.runInTx((tx) => treasuryService.movements(tx, query));
  });

  app.get('/treasury/position', manager, async (request) => {
    return app.runInTx((tx) => treasuryService.position(tx));
  });

  app.get('/treasury/projection', manager, async (request) => {
    const query = projectionQuerySchema.parse(request.query);
    return app.runInTx((tx) => treasuryService.projection(tx, query));
  });
}
