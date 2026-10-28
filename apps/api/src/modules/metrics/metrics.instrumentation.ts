/**
 * HTTP request metrics for the shared VictoriaMetrics/Grafana stack. The endpoint that
 * EXPOSES everything is `metrics.routes.ts`; this file defines the histogram and the hook
 * that feeds it.
 *
 * WHY THIS EXISTS. Until 2026-09-05 this service exported only `collectDefaultMetrics()`
 * and an uptime gauge, so `{job="hold-backend"}` had no `http_*` series at all — and the
 * two shared 5xx rules in infrastructure-cdk evaluate exactly that. A rule with no series
 * to read does not fail loudly: it stays green. That is how the incident of 2026-09-04
 * crossed all three alert channels without touching any of them, while the login answered
 * 500 for ~40 s. `up{job="hold-backend"}` was 1 the whole time, because the process was
 * perfectly alive; what was broken was the database behind it.
 *
 * The metric name and buckets match the CRM's instrumentation on purpose. Those rules are
 * written against `http_request_duration_seconds` and are shared across the suite, so
 * matching the name is what puts this service under a rule that already exists and already
 * works, instead of needing one of its own.
 *
 * Registrations are guarded on the REGISTRY, not the module cache: this module is source
 * and gets re-evaluated per test file, and a bare registration would throw "already
 * registered" against the one surviving registry, taking down the whole suite. Same reason
 * `metrics.routes.ts` guards its own.
 */
import fp from 'fastify-plugin';
import client from 'prom-client';

const REQUEST_DURATION = 'http_request_duration_seconds';

const requestDuration =
  (client.register.getSingleMetric(REQUEST_DURATION) as client.Histogram<string> | undefined) ??
  new client.Histogram({
    name: REQUEST_DURATION,
    help: 'HTTP request duration in seconds, by method, route pattern and status.',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  });

/**
 * Fastify hands back the matched route PATTERN ('/clients/:id'), never the raw URL, so
 * every id collapses into one series. Requests that match nothing — 404s, bots probing
 * paths — have no pattern, and labelling those with the raw URL would let anyone on the
 * internet inflate cardinality in the SHARED tsdb, so they all land in one bucket.
 */
const UNMATCHED_ROUTE = '__unmatched__';

export const metricsInstrumentation = fp(
  async (app) => {
    app.addHook('onResponse', async (request, reply) => {
      requestDuration.observe(
        {
          method: request.method,
          route: request.routeOptions?.url ?? UNMATCHED_ROUTE,
          status_code: String(reply.statusCode),
        },
        // Fastify measures this from request start. ms -> seconds, the Prometheus
        // convention the JVM services already follow, so one dashboard query works across
        // both stacks.
        reply.elapsedTime / 1000,
      );
    });
  },
  { name: 'metrics-instrumentation' },
);
