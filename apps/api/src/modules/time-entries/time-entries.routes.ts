/**
 * Time Entry routes (Cargar horas). Reads are available to any authenticated member
 * (an employee is scoped to their OWN entries); an employee may log only against their
 * own member record, a manager against anyone. Every handler runs inside runInTx.
 */
import type { FastifyInstance } from 'fastify';
import { ForbiddenError } from '../../lib/errors.js';
import { teamIdParamSchema } from '../team/team.schema.js';
import { timeEntriesService } from './time-entries.service.js';
import { createTimeEntrySchema, listTimeEntriesQuerySchema } from './time-entries.schema.js';

export async function timeEntriesRoutes(app: FastifyInstance): Promise<void> {
  const authed = { preHandler: [app.authenticate, app.loadActor] };

  app.get('/time-entries', authed, async (request) => {
    const query = listTimeEntriesQuerySchema.parse(request.query);
    const actor = request.actor!;
    // An employee sees only their own hours, whatever they ask for.
    const scoped =
      actor.role === 'employee'
        ? { ...query, teamMemberId: actor.teamMemberId ?? '00000000-0000-0000-0000-000000000000' }
        : query;
    return app.runInTx((tx) => timeEntriesService.list(tx, scoped));
  });

  // authed + a custom-role grant gate (passes through for built-in sessions; a custom role
  // must hold `worklog.hours.create`). The self/manager scoping below is unchanged.
  const canLogHours = {
    preHandler: [...authed.preHandler, app.requirePermission('worklog.hours.create')],
  };
  app.post('/team-members/:id/time-entries', canLogHours, async (request, reply) => {
    const { id } = teamIdParamSchema.parse(request.params);
    const actor = request.actor!;
    // Employees may log only against their own member record; managers, against anyone.
    if (actor.role === 'employee' && actor.teamMemberId !== id) {
      throw new ForbiddenError('You can only log hours for yourself');
    }
    const input = createTimeEntrySchema.parse(request.body);
    const created = await app.runInTx((tx) =>
      timeEntriesService.create(tx, id, actor.userId, input),
    );
    return reply.status(201).send(created);
  });
}
