/**
 * TeamMember (roster) routes. Reads are available to any authenticated member
 * (employees see only their own linked member); writes require a manager
 * (owner/admin, fail-closed). Every handler runs inside runInTx.
 */
import type { FastifyInstance } from 'fastify';
import { hasCapability } from '@hold/shared';
import { ForbiddenError } from '../../lib/errors.js';
import { clientsService } from '../clients/clients.service.js';
import { teamService } from './team.service.js';
import {
  bankDetailsSchema,
  createTeamMemberSchema,
  listTeamQuerySchema,
  teamIdParamSchema,
  updateTeamMemberSchema,
} from './team.schema.js';

export async function teamRoutes(app: FastifyInstance): Promise<void> {
  const authed = { preHandler: [app.authenticate, app.loadActor] };
  const manager = {
    preHandler: [app.authenticate, app.loadActor, app.requireRole('owner', 'admin')],
  };
  const gated = (permission: string) => ({
    preHandler: [...manager.preHandler, app.requirePermission(permission)],
  });
  // Banking details are third-party PII: served on their own route behind BOTH gates.
  // `requireRole` says who has business on the roster; `requireCapability` says who may
  // see bank data — flip `teamBankDetails` off for admin and this endpoint plus the
  // /team column close together (never inline on the member DTO). Mirrors /payments/:id/bank.
  const bankGated = {
    preHandler: [
      app.authenticate,
      app.loadActor,
      app.requireRole('owner', 'admin'),
      app.requireCapability('teamBankDetails'),
    ],
  };

  app.get('/team-members', authed, async (request) => {
    const { limit, offset } = listTeamQuerySchema.parse(request.query);
    const actor = request.actor!;
    const onlyId = actor.role === 'employee' ? actor.teamMemberId : undefined;
    return app.runInTx((tx) => teamService.list(tx, { limit, offset, onlyId }));
  });

  app.get('/team-members/:id', authed, async (request) => {
    const { id } = teamIdParamSchema.parse(request.params);
    const actor = request.actor!;
    const restrictToId = actor.role === 'employee' ? actor.teamMemberId : undefined;
    return app.runInTx((tx) => teamService.getById(tx, id, restrictToId));
  });

  /**
   * The clients one member is actively assigned to — the mirror of
   * `GET /clients/:id/assignments`, which answers the other direction.
   *
   * PRIVACY, decided here because only the route knows who is asking. A manager may
   * read anyone's; an employee may read their OWN and nobody else's. That is not the
   * same rule as the client-side endpoint, which scopes an employee to the rows they
   * appear in: here the member IS the subject, and an employee reading a colleague's
   * roster would learn which accounts that colleague works — a fact `/team` already
   * withholds from them.
   *
   * `403`, not a filtered-to-empty list: an empty roster is a real state, and
   * returning it for a refusal would tell an employee their colleague has no clients.
   */
  app.get('/team-members/:id/assignments', authed, async (request) => {
    const { id } = teamIdParamSchema.parse(request.params);
    const actor = request.actor!;
    if (actor.role === 'employee' && actor.teamMemberId !== id) {
      throw new ForbiddenError('Insufficient role for this resource');
    }
    const includeCost = hasCapability(actor.capabilities, 'teamCost');
    return app.runInTx((tx) =>
      clientsService.listAssignmentsForMember(tx, id, includeCost),
    );
  });

  app.post('/team-members', gated('member.create'), async (request, reply) => {
    const input = createTeamMemberSchema.parse(request.body);
    const created = await app.runInTx((tx) =>
      teamService.create(tx, input),
    );
    return reply.status(201).send(created);
  });

  app.put('/team-members/:id', gated('member.update'), async (request) => {
    const { id } = teamIdParamSchema.parse(request.params);
    const input = updateTeamMemberSchema.parse(request.body);
    return app.runInTx((tx) => teamService.update(tx, id, input));
  });

  app.post('/team-members/:id/deactivate', gated('member.deactivate'), async (request) => {
    const { id } = teamIdParamSchema.parse(request.params);
    return app.runInTx((tx) => teamService.deactivate(tx, id));
  });

  app.get('/team-members/:id/bank', bankGated, async (request) => {
    const { id } = teamIdParamSchema.parse(request.params);
    return app.runInTx((tx) => teamService.getBank(tx, id));
  });

  // Reading bank is capability-gated; WRITING additionally needs the action grant so a custom
  // role can be allowed to see banking data but not edit it.
  const canEditBank = {
    preHandler: [...bankGated.preHandler, app.requirePermission('member.bank.update')],
  };
  app.put('/team-members/:id/bank', canEditBank, async (request) => {
    const { id } = teamIdParamSchema.parse(request.params);
    const input = bankDetailsSchema.parse(request.body);
    return app.runInTx((tx) =>
      teamService.setBank(tx, id, input),
    );
  });
}
