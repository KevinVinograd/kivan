/**
 * Process entrypoint. Importing ./config (via @hold/config env access) first
 * means a missing/invalid env var aborts at boot (fail-fast) before binding.
 * Wires graceful shutdown so in-flight requests drain and the DB pool closes.
 */
import { env, logger } from '@hold/config';
import { prisma } from '@hold/db';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  const app = await buildApp();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down');
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => void shutdown(sig));
  }

  await app.listen({ host: env.HOST, port: env.PORT });
  logger.info({ port: env.PORT, host: env.HOST }, 'Server listening');
}

main().catch((err) => {
  logger.fatal({ err }, 'Fatal error during boot');
  process.exit(1);
});
