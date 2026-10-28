import type { FastifyInstance } from 'fastify';
import client from 'prom-client';

/**
 * Prometheus scrape endpoint for the shared VictoriaMetrics/Grafana monitoring stack
 * (see infrastructure-cdk/monitoring). VictoriaMetrics scrapes `/metrics`; a successful
 * scrape yields `up{job="hold-backend"} = 1`, and the "Backend caido" alert fires when
 * it drops to 0. `process_uptime_seconds` additionally powers the "Backend se reinicio"
 * alert, mirroring the Micrometer metric the Ktor services expose.
 *
 * Public + unauthenticated by design (the actor/authorize preHandlers are per-route,
 * so a route without them is open) — scraped over the internal `backend-net`, same as
 * the sibling services.
 */

// Default Node/process metrics (CPU, memory, event loop, GC, process_start_time…) plus a
// Micrometer-compatible uptime gauge, so the shared "Backend se reinicio" rule
// (process_uptime_seconds < 300) also covers this Node service.
//
// Guarded on the REGISTRY, not on the module cache. `prom-client` resolves from node_modules
// and is instantiated once per process, but this module is source and gets re-evaluated per
// test file — so a bare `collectDefaultMetrics()` re-registers the same collectors against the
// one surviving registry and throws ("A metric with the name … has already been registered"),
// taking down every API test suite in the run. Registering is idempotent by construction here.
if (!client.register.getSingleMetric('process_cpu_user_seconds_total')) {
  client.collectDefaultMetrics();
}

if (!client.register.getSingleMetric('process_uptime_seconds')) {
  new client.Gauge({
    name: 'process_uptime_seconds',
    help: 'Seconds since the API process started.',
    collect() {
      this.set(process.uptime());
    },
  });
}

export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', client.register.contentType);
    return client.register.metrics();
  });
}
