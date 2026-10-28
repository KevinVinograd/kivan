import type { FastifyInstance } from 'fastify';
import { prisma } from '@hold/db';

/** Liveness (`/health`) + readiness (`/health/ready`, checks DB reachability). */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({ status: 'ok' }));

  // Readiness: the deploy health-gate points here so a container that boots but
  // can't reach the database fails CLOSED before the swap. Prisma/@prisma/adapter-pg
  // connect lazily, so `/health` alone would pass green with a dead DB.
  app.get('/health/ready', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch (err) {
      app.log.error({ err }, 'readiness check failed');
      return reply.status(503).send({ status: 'unavailable' });
    }
  });
}
