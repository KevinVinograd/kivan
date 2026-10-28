/** Security headers via @fastify/helmet. */
import fp from 'fastify-plugin';
import helmet from '@fastify/helmet';

export default fp(
  async (app) => {
    await app.register(helmet);
  },
  { name: 'security' },
);
