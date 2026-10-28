/**
 * The HTTP histogram that puts this service under the shared 5xx and latency rules.
 *
 * WHY THIS FILE EXISTS. Until 2026-09-05 `{job="hold-backend"}` exported no `http_*`
 * series at all, and the two shared rules in infrastructure-cdk evaluate exactly that. A
 * rule with no series to read does not fail loudly — it stays green forever. That is how
 * the incident of 2026-09-04 crossed all three alert channels without touching any of
 * them, while the login answered 500 for ~40 s and `up{job="hold-backend"}` sat at 1 the
 * whole time, because the process was perfectly alive.
 *
 * So what is pinned here is not "a metric exists": it is the three properties the alert
 * rules actually depend on — the metric NAME they query, that a 5xx is recorded at all,
 * and that the route label is the pattern rather than the raw URL, because unbounded
 * cardinality in the SHARED tsdb is how you lose the whole stack instead of one service.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import client from 'prom-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { metricsInstrumentation } from '../src/modules/metrics/metrics.instrumentation.js';

let app: FastifyInstance;

beforeEach(async () => {
  client.register.resetMetrics();
  app = Fastify();
  await app.register(metricsInstrumentation);
  app.get('/clients/:id', async () => ({ ok: true }));
  app.get('/boom', async () => {
    throw new Error('kaboom');
  });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

/** The scrape body, which is the only surface the alert rules ever see. */
async function scrape(): Promise<string> {
  return client.register.metrics();
}

describe('http request metrics', () => {
  it('uses the metric name the shared alert rules query', async () => {
    await app.inject({ method: 'GET', url: '/clients/42' });
    const body = await scrape();
    // Not a cosmetic assertion: alert rules are written against this exact name.
    // Rename it and they go quiet without failing.
    expect(body).toContain('http_request_duration_seconds_bucket');
    expect(body).toContain('http_request_duration_seconds_count');
  });

  it('records a 5xx, which is the whole point', async () => {
    await app.inject({ method: 'GET', url: '/boom' });
    const body = await scrape();
    expect(body).toMatch(/http_request_duration_seconds_count\{[^}]*status_code="500"[^}]*\}\s+1/);
  });

  it('labels the route with the PATTERN, so ids do not each become a series', async () => {
    await app.inject({ method: 'GET', url: '/clients/1' });
    await app.inject({ method: 'GET', url: '/clients/2' });
    await app.inject({ method: 'GET', url: '/clients/3' });
    const body = await scrape();
    expect(body).toContain('route="/clients/:id"');
    expect(body).not.toContain('route="/clients/1"');
    // Three requests, one series.
    expect(body).toMatch(/http_request_duration_seconds_count\{[^}]*route="\/clients\/:id"[^}]*\}\s+3/);
  });

  it('collapses unmatched paths into one bucket, so a scanner cannot inflate the shared tsdb', async () => {
    for (const url of ['/.env', '/wp-admin', '/actuator/health']) {
      await app.inject({ method: 'GET', url });
    }
    const body = await scrape();
    expect(body).toContain('route="__unmatched__"');
    expect(body).not.toContain('route="/.env"');
    expect(body).toMatch(/http_request_duration_seconds_count\{[^}]*route="__unmatched__"[^}]*\}\s+3/);
  });

  it('records the method, so one noisy verb is separable from the rest', async () => {
    await app.inject({ method: 'GET', url: '/clients/7' });
    expect(await scrape()).toContain('method="GET"');
  });
});
