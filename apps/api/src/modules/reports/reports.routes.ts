/**
 * Reports / analytics routes. All read-only, inside runInTx.
 *
 * The money-bearing endpoints are gated by CAPABILITY, not by a hardcoded role
 * list: `financials`/`profitability` need the matching capability, and `capacity`
 * includes per-member cost only for a caller holding `teamCost`. The same table
 * (`ROLE_CAPABILITIES` in `@hold/shared`) drives the UI, so a boundary change
 * moves both sides at once and the server can never quietly serve a field the UI
 * believes it is hiding. Still fail-closed: an absent capability is a 403.
 */
import type { FastifyInstance } from 'fastify';
import { hasCapability } from '@hold/shared';
import { reportsService } from './reports.service.js';
import {
  clientMonthParamsSchema,
  hoursHistoryQuerySchema,
  marginHistoryQuerySchema,
  reportPeriodQuerySchema,
} from './reports.schema.js';

export async function reportsRoutes(app: FastifyInstance): Promise<void> {
  const managers = {
    preHandler: [app.authenticate, app.loadActor, app.requireRole('owner', 'admin')],
  };
  const needsStudioFinancials = {
    preHandler: [app.authenticate, app.loadActor, app.requireCapability('studioFinancials')],
  };
  const needsProfitability = {
    preHandler: [app.authenticate, app.loadActor, app.requireCapability('profitability')],
  };
  const gated = (permission: string) => ({
    preHandler: [...managers.preHandler, app.requirePermission(permission)],
  });

  app.get('/reports/summary', gated('report.summary.read'), async (request) => {
    const { period } = reportPeriodQuerySchema.parse(request.query);
    return app.runInTx((tx) => reportsService.summary(tx, period));
  });

  app.get('/reports/financials', needsStudioFinancials, async (request) => {
    const { period } = reportPeriodQuerySchema.parse(request.query);
    return app.runInTx((tx) => reportsService.financials(tx, period));
  });

  app.get('/reports/profitability', needsProfitability, async (request) => {
    const { period } = reportPeriodQuerySchema.parse(request.query);
    // Team cost enters the margin only for a caller who may see what people are paid.
    const includeTeamCost = hasCapability(request.actor!.capabilities, 'teamCost');
    return app.runInTx((tx) => reportsService.profitability(tx, includeTeamCost, period));
  });

  // One client's month for its Resumen (`?period=`, default this month): what was billed
  // and every cost the studio had on it, even before the month's cobro exists. Same gate
  // and the same team-cost rule as the Rentabilidad table it agrees with.
  app.get('/reports/clients/:clientId/month', needsProfitability, async (request) => {
    const { clientId } = clientMonthParamsSchema.parse(request.params);
    const { period } = reportPeriodQuerySchema.parse(request.query);
    const includeTeamCost = hasCapability(request.actor!.capabilities, 'teamCost');
    return app.runInTx((tx) =>
      reportsService.clientMonth(tx, includeTeamCost, clientId, period ?? new Date()),
    );
  });

  // Margin trend (last 6 months) — money, so it rides the same `profitability` gate as
  // the Rentabilidad tab it lives on. Rolling window up to now, not period-scoped.
  // `?clientId=` narrows it to one client (the Cliente drawer's trend).
  app.get('/reports/margin-history', needsProfitability, async (request) => {
    const { clientId } = marginHistoryQuerySchema.parse(request.query);
    const includeTeamCost = hasCapability(request.actor!.capabilities, 'teamCost');
    return app.runInTx((tx) => reportsService.marginHistory(tx, includeTeamCost, 6, clientId));
  });

  // One member's logged-hours trend (last 6 months). Hours, not money → managers,
  // matching /reports/productivity.
  app.get('/reports/hours-history', managers, async (request) => {
    const { teamMemberId } = hoursHistoryQuerySchema.parse(request.query);
    return app.runInTx((tx) => reportsService.hoursHistory(tx, teamMemberId));
  });

  // Team workload (owner+admin) + real per-member monthly cost, included only for a
  // caller holding `teamCost`. Period-agnostic (standing snapshot).
  app.get('/reports/capacity', managers, async (request) => {
    const includeCost = hasCapability(request.actor!.capabilities, 'teamCost');
    return app.runInTx((tx) => reportsService.capacity(tx, includeCost));
  });

  // Per-task productivity for the period (logged hours). Managers only — it is hours,
  // not money, so no money capability gates it. Period-scoped (on TimeEntry.date).
  app.get('/reports/productivity', managers, async (request) => {
    const { period } = reportPeriodQuerySchema.parse(request.query);
    return app.runInTx((tx) => reportsService.productivity(tx, period));
  });
}
