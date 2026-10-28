/**
 * Builds the Fastify app: wires plugins then route modules. Exported separately
 * from server.ts so tests can build an instance without binding a port.
 *
 * Plugin order matters: request metrics first (so the hook also observes the responses
 * the error handler fabricates), then the error handler (catches everything), security
 * headers, JWT auth, rate limit, the actor + authorize decorators, then routes.
 */
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { env, logger } from '@hold/config';
import errorHandler from './plugins/error-handler.js';
import security from './plugins/security.js';
import cors from './plugins/cors.js';
import auth from './plugins/auth.js';
import rateLimit from './plugins/rate-limit.js';
import actor from './plugins/actor.js';
import authorize from './plugins/authorize.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { metricsRoutes } from './modules/metrics/metrics.routes.js';
import { metricsInstrumentation } from './modules/metrics/metrics.instrumentation.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { teamRoutes } from './modules/team/team.routes.js';
import { timeEntriesRoutes } from './modules/time-entries/time-entries.routes.js';
import { memberActivityRoutes } from './modules/member-activity/member-activity.routes.js';
import { notificationsRoutes } from './modules/notifications/notifications.routes.js';
import { clientsRoutes } from './modules/clients/clients.routes.js';
import { servicesRoutes } from './modules/services/services.routes.js';
import { billingRoutes } from './modules/billing/billing.routes.js';
import { paymentsRoutes } from './modules/payments/payments.routes.js';
import { payoutsRoutes } from './modules/payouts/payouts.routes.js';
import { monthlyRoutes } from './modules/monthly/monthly.routes.js';
import { monthlyPlanRoutes } from './modules/monthly/monthly-plan.routes.js';
import { treasuryRoutes } from './modules/treasury/treasury.routes.js';
import { ledgerRoutes } from './modules/ledger/ledger.routes.js';
import { reportsRoutes } from './modules/reports/reports.routes.js';
import { settingsRoutes } from './modules/settings/settings.routes.js';
import { rolesRoutes } from './modules/roles/roles.routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: logger as unknown as FastifyBaseLogger,
    bodyLimit: env.BODY_LIMIT_BYTES,
    // Trust EXACTLY this many proxy hops so request.ip is the real client IP and
    // X-Forwarded-For can't be spoofed past our infra (Caddy = 1).
    trustProxy: env.TRUST_PROXY_HOPS,
    genReqId: () => randomUUID(),
  });

  // Tolerate an empty JSON body: bodyless POSTs (close/reopen/approve/…) are
  // commonly sent by browsers with `Content-Type: application/json` and no body.
  // The default parser rejects that; treat empty as no body, and surface invalid
  // JSON as a clean 400.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = (body as string).trim();
    if (text === '') {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(text));
    } catch (err) {
      (err as { statusCode?: number }).statusCode = 400;
      done(err as Error, undefined);
    }
  });

  // Before everything else: the onResponse hook has to see the responses the error
  // handler FABRICATES too. A 5xx that goes unmeasured is precisely the one the shared
  // alert rules exist to catch.
  await app.register(metricsInstrumentation);
  await app.register(errorHandler);
  await app.register(security);
  await app.register(cors);
  await app.register(auth);
  await app.register(rateLimit);
  await app.register(actor);
  await app.register(authorize);

  await app.register(healthRoutes);
  await app.register(metricsRoutes);
  await app.register(authRoutes);
  await app.register(teamRoutes);
  await app.register(timeEntriesRoutes);
  await app.register(memberActivityRoutes);
  await app.register(notificationsRoutes);
  await app.register(clientsRoutes);
  await app.register(servicesRoutes);
  await app.register(billingRoutes);
  await app.register(paymentsRoutes);
  await app.register(payoutsRoutes);
  await app.register(monthlyRoutes);
  await app.register(monthlyPlanRoutes);
  await app.register(treasuryRoutes);
  await app.register(ledgerRoutes);
  await app.register(reportsRoutes);
  await app.register(settingsRoutes);
  await app.register(rolesRoutes);

  return app;
}
