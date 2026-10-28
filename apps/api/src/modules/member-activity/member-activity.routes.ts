/**
 * Member activity routes — viáticos + extra work. Reads are available to any
 * authenticated member (an employee is scoped to their OWN rows); creating is
 * allowed for anyone but an employee may only log against their own member record
 * (mirrors time-entries). Approving extras is manager-only. Every handler runs
 * inside runInTx.
 */
import type { FastifyInstance } from 'fastify';
import { ForbiddenError } from '../../lib/errors.js';
import { memberActivityService } from './member-activity.service.js';
import {
  approveExtrasSchema,
  createMemberExpenseSchema,
  createMemberExtraSchema,
  listActivityQuerySchema,
} from './member-activity.schema.js';

export async function memberActivityRoutes(app: FastifyInstance): Promise<void> {
  const authed = { preHandler: [app.authenticate, app.loadActor] };
  const manager = {
    preHandler: [app.authenticate, app.loadActor, app.requireRole('owner', 'admin')],
  };

  /** An employee only ever sees their own rows; a manager sees what they asked for. */
  const scopeMember = (
    actor: { role: string; teamMemberId: string | null },
    requested?: string,
  ): string | undefined =>
    actor.role === 'employee'
      ? (actor.teamMemberId ?? '00000000-0000-0000-0000-000000000000')
      : requested;

  app.get('/member-expenses', authed, async (request) => {
    const { teamMemberId } = listActivityQuerySchema.parse(request.query);
    const actor = request.actor!;
    const scoped = scopeMember(actor, teamMemberId);
    return app.runInTx((tx) => memberActivityService.listExpenses(tx, scoped));
  });

  app.post('/member-expenses', authed, async (request, reply) => {
    const input = createMemberExpenseSchema.parse(request.body);
    const actor = request.actor!;
    if (actor.role === 'employee' && actor.teamMemberId !== input.teamMemberId) {
      throw new ForbiddenError('You can only log a viático for yourself');
    }
    const created = await app.runInTx((tx) =>
      memberActivityService.createExpense(tx, actor.userId, input),
    );
    return reply.status(201).send(created);
  });

  app.get('/member-extras', authed, async (request) => {
    const { teamMemberId } = listActivityQuerySchema.parse(request.query);
    const actor = request.actor!;
    const scoped = scopeMember(actor, teamMemberId);
    return app.runInTx((tx) => memberActivityService.listExtras(tx, scoped));
  });

  app.post('/member-extras', authed, async (request, reply) => {
    const input = createMemberExtraSchema.parse(request.body);
    const actor = request.actor!;
    if (actor.role === 'employee' && actor.teamMemberId !== input.teamMemberId) {
      throw new ForbiddenError('You can only log extra work for yourself');
    }
    const created = await app.runInTx((tx) =>
      memberActivityService.createExtra(tx, actor.userId, input),
    );
    return reply.status(201).send(created);
  });

  // Approving is a manager judgement (owner/admin), never a self-action.
  app.post('/member-extras/approve', manager, async (request) => {
    const { teamMemberId } = approveExtrasSchema.parse(request.body);
    const actor = request.actor!;
    return app.runInTx((tx) =>
      memberActivityService.approveExtras(tx, teamMemberId, actor.userId),
    );
  });
}
