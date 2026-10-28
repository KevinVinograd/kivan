/**
 * Monthly-plan routes — productions / fixed expenses / alerts CRUD, owner/admin
 * only (fail-closed), each inside runInTx. Updates/deletes carry the
 * optimistic-concurrency version (body for PUT, query for DELETE).
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ForbiddenError } from '../../lib/errors.js';
import { z } from 'zod';
import { monthlyPlanService } from './monthly-plan.service.js';
import {
  createAlertSchema,
  createExpenseSchema,
  createProductionSchema,
  markViaticsPaidSchema,
  periodParamSchema,
  productionApprovalSchema,
  planIdParamSchema,
  setChecklistSchema,
  updateAlertSchema,
  updateExpenseSchema,
  updateProductionSchema,
  leadCreateInput,
  leadUpdateInput,
  withoutMoney,
} from './monthly-plan.schema.js';

const deleteQuerySchema = z.object({ version: z.coerce.number().int().nonnegative() });

export async function monthlyPlanRoutes(app: FastifyInstance): Promise<void> {
  const manager = {
    preHandler: [app.authenticate, app.loadActor, app.requireRole('owner', 'admin')],
  };
  const gated = (permission: string) => ({
    preHandler: [...manager.preHandler, app.requirePermission(permission)],
  });

  // The whole monthly page in one read (client-plan receivables, team payouts,
  // productions, expenses, alerts, derived monotributo watches, checklist + status).
  app.get('/months/:period/plan', manager, async (request) => {
    const { period } = periodParamSchema.parse(request.params);
    return app.runInTx((tx) => monthlyPlanService.getBundle(tx, period));
  });

  app.put('/months/:period/checklist', gated('month.checklist.set'), async (request) => {
    const { period } = periodParamSchema.parse(request.params);
    const { item, value } = setChecklistSchema.parse(request.body);
    return app.runInTx((tx) =>
      monthlyPlanService.setChecklist(tx, period, item, value),
    );
  });

  // ── Productions ──
  app.get('/months/:period/productions', manager, async (request) => {
    const { period } = periodParamSchema.parse(request.params);
    return app.runInTx((tx) => monthlyPlanService.listProductions(tx, period));
  });
  /**
   * Production access that a COMMUNICATION LEAD can hold too (2026-10-19: "la responsable de
   * comunicación carga y supervisa la producción"). Owner/admin pass as before, narrowed by a
   * custom role's grants when they carry one. An EMPLOYEE passes only with one of the grants
   * EXPLICITLY on their custom role: a system employee carries no grant list, which
   * `requirePermission` reads as "allowed", so that is deliberately not enough here.
   */
  const productionAccess = (...anyOf: string[]) => ({
    preHandler: [
      app.authenticate,
      app.loadActor,
      async (request: FastifyRequest) => {
        const { role, permissions } = request.actor!;
        const granted = permissions !== null && anyOf.some((p) => permissions.includes(p));
        if (role === 'owner' || role === 'admin') {
          if (permissions !== null && !granted) throw new ForbiddenError('Insufficient role for this resource');
          return;
        }
        if (!granted) throw new ForbiddenError('Insufficient role for this resource');
      },
    ],
  });
  /** A lead (an employee let in by grant) is confined to their clients and kept off money. */
  const leadOf = (request: FastifyRequest) =>
    request.actor!.role === 'employee' ? { teamMemberId: request.actor!.teamMemberId } : null;

  app.post('/months/:period/productions', productionAccess('production.create'), async (request, reply) => {
    const { period } = periodParamSchema.parse(request.params);
    const lead = leadOf(request);
    const parsed = createProductionSchema.parse(request.body);
    const input = lead ? leadCreateInput(parsed) : parsed;
    const created = await app.runInTx(async (tx) => {
      if (lead) await monthlyPlanService.assertLeadClient(tx, input.clientId, lead.teamMemberId);
      return monthlyPlanService.createProduction(tx, period, input);
    });
    return reply.status(201).send(lead ? withoutMoney(created) : created);
  });
  app.put('/productions/:id', productionAccess('production.create'), async (request) => {
    const { id } = planIdParamSchema.parse(request.params);
    const lead = leadOf(request);
    const parsed = updateProductionSchema.parse(request.body);
    const input = lead ? leadUpdateInput(parsed) : parsed;
    const updated = await app.runInTx(async (tx) => {
      if (lead) {
        await monthlyPlanService.assertLeadProductions(tx, [id], lead.teamMemberId);
        if (input.clientId !== undefined) {
          await monthlyPlanService.assertLeadClient(tx, input.clientId, lead.teamMemberId);
        }
      }
      return monthlyPlanService.updateProduction(tx, id, input);
    });
    return lead ? withoutMoney(updated) : updated;
  });
  app.get('/productions/people', productionAccess('production.create'), async (request) =>
    app.runInTx((tx) => monthlyPlanService.listProductionPeople(tx)),
  );
  app.post('/productions/approval', productionAccess('production.approve'), async (request) => {
    const { ids, approved } = productionApprovalSchema.parse(request.body);
    const lead = leadOf(request);
    return app.runInTx(async (tx) => {
      if (lead) await monthlyPlanService.assertLeadProductions(tx, ids, lead.teamMemberId);
      return monthlyPlanService.setProductionApproval(tx, ids, approved);
    });
  });
  app.get(
    '/clients/:id/productions',
    productionAccess('production.create', 'production.approve'),
    async (request) => {
      const { id } = planIdParamSchema.parse(request.params);
      const lead = leadOf(request);
      const list = await app.runInTx(async (tx) => {
        if (lead) await monthlyPlanService.assertLeadClient(tx, id, lead.teamMemberId);
        return monthlyPlanService.listClientProductions(tx, id);
      });
      return lead ? list.map(withoutMoney) : list;
    },
  );
  app.post('/productions/viatics-paid', manager, async (request) => {
    const { ids, paidAt } = markViaticsPaidSchema.parse(request.body);
    return app.runInTx((tx) => monthlyPlanService.markViaticsPaid(tx, ids, paidAt));
  });
  app.delete('/productions/:id', manager, async (request) => {
    const { id } = planIdParamSchema.parse(request.params);
    const { version } = deleteQuerySchema.parse(request.query);
    await app.runInTx((tx) => monthlyPlanService.deleteProduction(tx, id, version));
    return { deleted: true };
  });

  // ── Fixed expenses ──
  app.get('/months/:period/expenses', manager, async (request) => {
    const { period } = periodParamSchema.parse(request.params);
    return app.runInTx((tx) => monthlyPlanService.listExpenses(tx, period));
  });
  app.post('/months/:period/expenses', gated('expense.create'), async (request, reply) => {
    const { period } = periodParamSchema.parse(request.params);
    const input = createExpenseSchema.parse(request.body);
    const created = await app.runInTx((tx) =>
      monthlyPlanService.createExpense(tx, period, input),
    );
    return reply.status(201).send(created);
  });
  app.put('/expenses/:id', manager, async (request) => {
    const { id } = planIdParamSchema.parse(request.params);
    const input = updateExpenseSchema.parse(request.body);
    return app.runInTx((tx) => monthlyPlanService.updateExpense(tx, id, input));
  });
  app.delete('/expenses/:id', manager, async (request) => {
    const { id } = planIdParamSchema.parse(request.params);
    const { version } = deleteQuerySchema.parse(request.query);
    await app.runInTx((tx) => monthlyPlanService.deleteExpense(tx, id, version));
    return { deleted: true };
  });

  // ── Alerts ──
  app.get('/months/:period/alerts', manager, async (request) => {
    const { period } = periodParamSchema.parse(request.params);
    return app.runInTx((tx) => monthlyPlanService.listAlerts(tx, period));
  });
  app.post('/months/:period/alerts', manager, async (request, reply) => {
    const { period } = periodParamSchema.parse(request.params);
    const input = createAlertSchema.parse(request.body);
    const created = await app.runInTx((tx) =>
      monthlyPlanService.createAlert(tx, period, input),
    );
    return reply.status(201).send(created);
  });
  app.put('/alerts/:id', manager, async (request) => {
    const { id } = planIdParamSchema.parse(request.params);
    const input = updateAlertSchema.parse(request.body);
    return app.runInTx((tx) => monthlyPlanService.updateAlert(tx, id, input));
  });
  app.delete('/alerts/:id', manager, async (request) => {
    const { id } = planIdParamSchema.parse(request.params);
    const { version } = deleteQuerySchema.parse(request.query);
    await app.runInTx((tx) => monthlyPlanService.deleteAlert(tx, id, version));
    return { deleted: true };
  });
}
