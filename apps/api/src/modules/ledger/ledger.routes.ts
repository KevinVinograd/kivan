/**
 * Cuentas corrientes (ledger) routes — owner/admin only (fail-closed). Read-only
 * over the persisted append-only ledger; every handler runs inside runInTx.
 */
import type { FastifyInstance } from 'fastify';
import { ledgerService } from './ledger.service.js';
import {
  ledgerListParamSchema,
  ledgerQuerySchema,
  ledgerStatementParamSchema,
} from './ledger.schema.js';

export async function ledgerRoutes(app: FastifyInstance): Promise<void> {
  const manager = {
    preHandler: [app.authenticate, app.loadActor, app.requireRole('owner', 'admin')],
  };

  app.get('/ledger/:entityType', manager, async (request) => {
    const { entityType } = ledgerListParamSchema.parse(request.params);
    return app.runInTx((tx) => ledgerService.listAccounts(tx, entityType));
  });

  app.get('/ledger/:entityType/:entityId', manager, async (request) => {
    const { entityType, entityId } = ledgerStatementParamSchema.parse(request.params);
    const { limit, offset, period, currency } = ledgerQuerySchema.parse(request.query);
    return app.runInTx((tx) =>
      ledgerService.statement(tx, entityType, entityId, limit, offset, period, currency),
    );
  });
}
