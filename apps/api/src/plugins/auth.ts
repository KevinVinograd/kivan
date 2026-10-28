/**
 * JWT authentication via @fastify/jwt.
 *
 * Registers JWT verify/sign with the validated secret + access-token TTL, and
 * decorates `app.authenticate` (a preHandler that proves identity). On success
 * `request.user` holds the payload `{ sub, role, teamMemberId }` and
 * the request's logger is bound to the caller, so every line the request writes
 * names them instead of the `anon` default.
 * Authorization (what the user may do) lives in plugins/authorize.ts + services.
 */
import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { bindUser, env } from '@hold/config';
import type { Capability, Role } from '@hold/shared';
import { UnauthorizedError } from '../lib/errors.js';

export interface JwtPayload {
  sub: string;
  role: Role;
  teamMemberId: string | null;
  /** The session's effective capabilities (built-in role, narrowed by a custom role's grants
   *  when one is assigned). Minted here so both gates and the front read one resolved set. */
  capabilities: Capability[];
  /** The assigned custom role's grant keys, or NULL when governed by the built-in role.
   *  `requirePermission` passes null through (built-in unchanged) and narrows on a set. */
  permissions: string[] | null;
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

/**
 * Binds this request's logger to `userId`, so every subsequent line — ours and Fastify's
 * own "request completed"/"request errored" — is attributable instead of `anon`. Called
 * on every path that establishes an identity: the JWT preHandler below, and the login
 * and refresh routes, which learn who the caller is only after the credentials or the
 * refresh token check out.
 *
 * BOTH references are reassigned. Fastify hands request and reply the same child logger
 * at the start of the request but keeps two references to it, and the line reporting the
 * OUTCOME is written through the reply's — rebinding only the request's would leave the
 * one line that says what happened unattributed.
 *
 * The bound logger is a child of the request's own, never of the root: that is what
 * keeps Fastify's `req`/`res` serializers. Without them the response line dumps the raw
 * response object — every header included — instead of `{statusCode}`.
 */
export function bindLogUser(request: FastifyRequest, reply: FastifyReply, userId: string): void {
  const bound = bindUser(request.log, userId);
  request.log = bound;
  reply.log = bound;
}

export default fp(
  async (app) => {
    await app.register(jwt, {
      secret: env.JWT_SECRET,
      sign: { expiresIn: env.ACCESS_TTL },
    });

    app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch {
        // Uniform 401 — don't leak expired vs malformed.
        throw new UnauthorizedError('Invalid or missing authentication token');
      }
      bindLogUser(request, reply, request.user.sub);
    });
  },
  { name: 'auth' },
);
