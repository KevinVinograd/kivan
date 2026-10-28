/**
 * Billing / Cobros routes — owner/admin only (fail-closed). Every handler runs
 * inside runInTx. The money mutations (collect, invoice/generate) are
 * atomic in the service; collect is also idempotent via an Idempotency key.
 */
import type { FastifyInstance } from 'fastify';
import { hasCapability } from '@hold/shared';
import { ForbiddenError } from '../../lib/errors.js';
import { billingService } from './billing.service.js';
import {
  associateInvoiceSchema,
  collectSchema,
  COST_FIELDS,
  createReceivableSchema,
  generateInvoiceSchema,
  generateMonthlyFeesSchema,
  kpisQuerySchema,
  monthlyFeePeriodQuerySchema,
  listReceivablesQuerySchema,
  receivableIdParamSchema,
  serviceLineChargeSchema,
  setExchangeRateSchema,
  updateReceivableSchema,
} from './billing.schema.js';

/**
 * A transaction budget sized to the BATCH, because a constant cannot be right for both
 * ends of it.
 *
 * `generateMonthlyFeesSchema` accepts up to 500 items and the generator spends four round
 * trips on each, at ~27 ms per round trip in production. So any single number is either
 * generous for the studio's thirty clients or too small for the largest batch the endpoint
 * says it takes — and being too small is how this failed in the first place: a budget that
 * does not know how much work it is buying.
 *
 * 600 ms per client is ~5x the measured cost, over a floor that covers the fixed preamble,
 * under a ceiling so no one request can hold a pool connection indefinitely. At the 500-item
 * maximum the ceiling still leaves roughly twice the measured need.
 */
function monthlyFeeBudgetMs(items: number): number {
  return Math.min(120_000, 15_000 + items * 600);
}

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  const manager = {
    preHandler: [app.authenticate, app.loadActor, app.requireRole('owner', 'admin')],
  };
  const gated = (permission: string) => ({
    preHandler: [...manager.preHandler, app.requirePermission(permission)],
  });

  app.get('/receivables', manager, async (request) => {
    const query = listReceivablesQuerySchema.parse(request.query);
    return app.runInTx((tx) => billingService.list(tx, query));
  });

  app.get('/receivables/kpis', manager, async (request) => {
    const { period } = kpisQuerySchema.parse(request.query);
    return app.runInTx((tx) => billingService.kpis(tx, period));
  });

  app.get('/invoice-emitters', manager, async (request) => {
    return app.runInTx((tx) => billingService.listEmitters(tx));
  });

  // What generating the month's retainers WOULD create. Read-only, so it is open to any
  // manager: seeing the roster is not the act being gated.
  app.get('/receivables/monthly-fee/preview', manager, async (request) => {
    const { period } = monthlyFeePeriodQuerySchema.parse(request.query);
    return app.runInTx((tx) => billingService.monthlyFeePreview(tx, period));
  });

  // Create them. One transaction: either the whole batch lands or none of it does, so a
  // failure halfway cannot leave a month half-billed with no way to tell which half.
  //
  // That atomicity is what makes the budget load-bearing. Prisma's default is 5000 ms for
  // ANY transaction, so the one endpoint whose work scales with the roster was also the one
  // most likely to outgrow it -- and it did, three times in production on 2026-08-26 (P2028
  // at 5336 / 5424 / 6055 ms), discarding the whole month each time. The service now spends
  // four round trips per client instead of nine, but a round trip costs ~27 ms in production
  // against ~1 ms locally, so the cut alone would still put a roster of forty inside a
  // fraction of the default.
  app.post('/receivables/monthly-fee/generate', gated('receivable.generate'), async (request, reply) => {
    const input = generateMonthlyFeesSchema.parse(request.body);
    const result = await app.runInTx(
      (tx) => billingService.generateMonthlyFees(tx, input),
      { timeout: monthlyFeeBudgetMs(input.items.length), maxWait: 10_000 },
    );
    return reply.status(201).send(result);
  });

  // The dollar rate a month is billed at. There is no GET beside this: the monthly-fee
  // preview already carries the rate, so a second read endpoint would be a permission-gated
  // surface with no caller. Gated with the SAME permission as generating, because loading
  // the rate is the first step of that one job and whoever may bill the month is who
  // decides what the month is billed at.
  app.put('/exchange-rates', gated('receivable.generate'), async (request) => {
    const input = setExchangeRateSchema.parse(request.body);
    return app.runInTx((tx) =>
      billingService.setExchangeRate(tx, input),
    );
  });

  app.get('/receivables/:id', manager, async (request) => {
    const { id } = receivableIdParamSchema.parse(request.params);
    return app.runInTx((tx) => billingService.getById(tx, id));
  });

  app.post('/receivables', gated('receivable.create'), async (request, reply) => {
    const input = createReceivableSchema.parse(request.body);
    const created = await app.runInTx((tx) =>
      billingService.create(tx, input),
    );
    return reply.status(201).send(created);
  });

  // Bill part of a one-time service line. The same permission as a hand-made cobro:
  // it creates one, just priced from the contract instead of typed.
  app.post('/receivables/service-line-charge', gated('receivable.create'), async (request, reply) => {
    const input = serviceLineChargeSchema.parse(request.body);
    const created = await app.runInTx((tx) =>
      billingService.chargeServiceLine(tx, input),
    );
    return reply.status(201).send(created);
  });

  app.patch('/receivables/:id', gated('receivable.update'), async (request) => {
    const { id } = receivableIdParamSchema.parse(request.params);
    const input = updateReceivableSchema.parse(request.body);
    // Cost by area is money the studio spent — a stricter boundary than the rest of the
    // record. Editing a cobro is allowed by `receivable.update`; touching its COSTS
    // additionally requires `profitability`, the same capability that gates seeing them.
    // Checked per-field so a caller without it can still edit everything else.
    const touchesCost = COST_FIELDS.some((field) => input[field] !== undefined);
    if (touchesCost && !hasCapability(request.actor!.capabilities, 'profitability')) {
      throw new ForbiddenError('Editing costs requires the profitability capability');
    }
    return app.runInTx((tx) => billingService.update(tx, id, input));
  });

  app.post('/receivables/:id/collect', gated('receivable.collect'), async (request) => {
    const { id } = receivableIdParamSchema.parse(request.params);
    const { amountMinor, idempotencyKey, collectedAt, treasuryAccountId } = collectSchema.parse(
      request.body,
    );
    return app.runInTx((tx) =>
      billingService.collect(tx, id, amountMinor, {
        ...(idempotencyKey ? { idempotencyKey } : {}),
        ...(collectedAt ? { collectedAt } : {}),
        ...(treasuryAccountId ? { treasuryAccountId } : {}),
        userId: request.actor!.userId,
      }),
    );
  });

  app.post('/receivables/:id/invoice/generate', gated('receivable.invoice.generate'), async (request) => {
    const { id } = receivableIdParamSchema.parse(request.params);
    const { emitterId } = generateInvoiceSchema.parse(request.body);
    return app.runInTx((tx) => billingService.generateInvoice(tx, id, emitterId));
  });

  // Record an externally emitted factura against the receivable (manual, no CAE).
  app.post('/receivables/:id/invoice/associate', gated('receivable.invoice.associate'), async (request) => {
    const { id } = receivableIdParamSchema.parse(request.params);
    const input = associateInvoiceSchema.parse(request.body);
    return app.runInTx((tx) => billingService.associateInvoice(tx, id, input));
  });

  // Mark the factura / cuenta corriente as sent.
  app.post('/receivables/:id/invoice/sent', gated('receivable.invoice.send'), async (request) => {
    const { id } = receivableIdParamSchema.parse(request.params);
    return app.runInTx((tx) =>
      billingService.markInvoiceSent(tx, id, request.actor!.userId),
    );
  });

  app.post('/receivables/:id/cancel', gated('receivable.cancel'), async (request) => {
    const { id } = receivableIdParamSchema.parse(request.params);
    return app.runInTx((tx) => billingService.cancel(tx, id));
  });
}
