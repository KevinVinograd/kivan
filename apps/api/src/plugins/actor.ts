/**
 * Request actor + transaction helper. After `authenticate` proves the JWT, `loadActor`
 * lifts the claims into `request.actor`, and `runInTx` runs a callback inside one
 * database transaction. Protect routes with `preHandler: [app.authenticate, app.loadActor]`.
 */
import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { runInTx } from '@hold/db';
import type { Prisma, TransactionOptions } from '@hold/db';
import { ROLE_CAPABILITIES, type Capability, type Role } from '@hold/shared';
import { UnauthorizedError } from '../lib/errors.js';

export interface ActorContext {
  userId: string;
  role: Role;
  teamMemberId: string | null;
  /** Effective capabilities from the token (built-in role narrowed by a custom role). */
  capabilities: Capability[];
  /** Custom role's grant keys, or null when governed by the built-in role (see requirePermission). */
  permissions: string[] | null;
}

declare module 'fastify' {
  interface FastifyInstance {
    loadActor: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    runInTx: <T>(
      fn: (tx: Prisma.TransactionClient) => Promise<T>,
      options?: TransactionOptions,
    ) => Promise<T>;
  }
  interface FastifyRequest {
    actor?: ActorContext;
  }
}

export default fp(
  (app, _opts, done) => {
    app.decorate('loadActor', async (request: FastifyRequest) => {
      const user = request.user;
      if (!user) {
        throw new UnauthorizedError();
      }
      request.actor = {
        userId: user.sub,
        role: user.role,
        teamMemberId: user.teamMemberId,
        // Older tokens (minted before the engine) carry no capabilities → fall back to the
        // built-in role's set, so a session in flight during deploy keeps working unchanged.
        capabilities: user.capabilities ?? [...ROLE_CAPABILITIES[user.role]],
        // Older tokens carry no `permissions` field → undefined. Treat that as null (governed
        // by the built-in role), so requirePermission never denies a pre-engine session.
        permissions: user.permissions ?? null,
      };
    });

    app.decorate(
      'runInTx',
      <T>(
        fn: (tx: Prisma.TransactionClient) => Promise<T>,
        // Only a route that knows the SIZE of its own work may raise the transaction
        // budget; everything else keeps Prisma's default (see runInTx in @hold/db).
        options?: TransactionOptions,
      ): Promise<T> => runInTx(fn, options),
    );
    done();
  },
  { name: 'actor' },
);
