/**
 * Fail-CLOSED authorization. Two preHandler factories, both default-deny — there
 * is no "open on unlisted" fall-through (the front's PAGE_ACCESS fails open; the
 * backend must not).
 *
 * - `app.requireRole(...roles)` — 403s unless the caller's role is allow-listed.
 *   For endpoints that belong to a role by JOB (a manager surface an employee has
 *   no business calling).
 * - `app.requireCapability(capability)` — 403s unless the caller's role holds the
 *   capability in `@hold/shared`'s ROLE_CAPABILITIES. For endpoints gated by what
 *   the caller may SEE (money, cost, banking), so the server and the UI read the
 *   same table and cannot drift apart.
 *
 * Usage: `{ preHandler: [app.authenticate, app.loadActor, app.requireRole('owner', 'admin')] }`
 *        `{ preHandler: [app.authenticate, app.loadActor, app.requireCapability('profitability')] }`
 */
import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { hasCapability, type Capability, type Role } from '@hold/shared';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';

declare module 'fastify' {
  interface FastifyInstance {
    requireRole: (
      ...roles: Role[]
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireCapability: (
      capability: Capability,
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (
      permission: string,
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(
  (app, _opts, done) => {
    app.decorate('requireRole', (...roles: Role[]) => {
      return async (request: FastifyRequest) => {
        if (!request.actor) {
          throw new UnauthorizedError();
        }
        if (!roles.includes(request.actor.role)) {
          throw new ForbiddenError('Insufficient role for this resource');
        }
      };
    });

    app.decorate('requireCapability', (capability: Capability) => {
      return async (request: FastifyRequest) => {
        if (!request.actor) {
          throw new UnauthorizedError();
        }
        // The session's EFFECTIVE capabilities (built-in role narrowed by a custom role),
        // resolved at token mint. With no custom role this equals can(role, capability), so
        // behaviour is unchanged for every existing session.
        if (!hasCapability(request.actor.capabilities, capability)) {
          throw new ForbiddenError('Insufficient role for this resource');
        }
      };
    });

    // Custom-role action gate. STRUCTURAL invariant: `permissions === null` means "governed by
    // the built-in role" — pass through, so the existing `requireRole` on the same route is the
    // only gate and every built-in session is unchanged. A non-null set is a custom role, which
    // can only NARROW: the request is refused unless the role was granted this exact key. Always
    // pair it with the route's existing `requireRole` (this never widens access on its own).
    app.decorate('requirePermission', (permission: string) => {
      return async (request: FastifyRequest) => {
        if (!request.actor) {
          throw new UnauthorizedError();
        }
        const { permissions } = request.actor;
        if (permissions !== null && !permissions.includes(permission)) {
          throw new ForbiddenError('Insufficient role for this resource');
        }
      };
    });

    done();
  },
  { name: 'authorize' },
);
