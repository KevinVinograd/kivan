import { beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  // Valid (non-connecting) env so @hold/config passes and the PrismaPg adapter
  // can be constructed lazily; /health never touches the DB.
  process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/hold';
  process.env.JWT_SECRET ??= 'x'.repeat(32);
  const { buildApp } = await import('../src/app.js');
  app = await buildApp();
});

describe('app boot', () => {
  it('serves GET /health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('serves GET /metrics in Prometheus format (VictoriaMetrics scrape → up=1)', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    // A default metric proves collectDefaultMetrics ran; the custom gauge powers the
    // "backend restarted" alert.
    expect(res.body).toContain('process_cpu_user_seconds_total');
    expect(res.body).toContain('process_uptime_seconds');
  });

  it('rejects /auth/me without a token (401)', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('tolerates an empty JSON body and maps invalid JSON to 400 (not 500)', async () => {
    const empty = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'content-type': 'application/json' },
      // no payload → empty body with a JSON content-type
    });
    expect(empty.statusCode).toBe(400); // Zod rejects the missing fields, not a 500

    const bad = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    });
    expect(bad.statusCode).toBe(400);
  });
});
