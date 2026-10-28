/**
 * Clients routes. Reads are available to any authenticated member (employees
 * see only the clients they're actively assigned to); writes + assignment
 * management require a manager (owner/admin, fail-closed). All handlers run
 * inside runInTx.
 */
import type { FastifyInstance } from 'fastify';
import { hasCapability, type Capability } from '@hold/shared';
import { ForbiddenError } from '../../lib/errors.js';
import { clientsService } from './clients.service.js';
import {
  assignmentIdParamSchema,
  changeClientStatusSchema,
  clientIdParamSchema,
  createAssignmentSchema,
  createClientSchema,
  createServiceLineSchema,
  listClientsQuerySchema,
  serviceLineIdParamSchema,
  updateAssignmentSchema,
  updateClientSchema,
  updateServiceLineSchema,
} from './clients.schema.js';

export async function clientsRoutes(app: FastifyInstance): Promise<void> {
  const authed = { preHandler: [app.authenticate, app.loadActor] };
  const manager = {
    preHandler: [app.authenticate, app.loadActor, app.requireRole('owner', 'admin')],
  };
  // Manager + a custom-role permission gate. requirePermission passes through when no custom
  // role is assigned (the built-in manager gate is unchanged) and narrows when one is.
  const gated = (permission: string) => ({
    preHandler: [...manager.preHandler, app.requirePermission(permission)],
  });

  /**
   * The money-privacy gate on the assignment write paths, and the read-back flag.
   *
   * Two separate things that share one answer. A caller without `teamCost` may still
   * manage assignments — who works on what is not payroll — but may not SET what the
   * studio pays per client, and must not receive the figure back either. Refused
   * loudly rather than stripped: silently dropping the field would answer 201 with a
   * row that does not carry the amount the operator just typed.
   *
   * `!== undefined`, not truthiness: `null` (erase it) and `'0'` (agreed to be zero)
   * are both real writes to this column and both must be gated.
   */
  const requireCostCapabilityToWrite = (
    request: { actor?: { capabilities: readonly Capability[] } | null },
    sentCost: bigint | null | undefined,
  ): boolean => {
    const includeCost = hasCapability(request.actor!.capabilities, 'teamCost');
    if (sentCost !== undefined && !includeCost) {
      throw new ForbiddenError('Setting the per-client cost requires the team-cost capability');
    }
    return includeCost;
  };

  app.get('/clients', authed, async (request) => {
    const { limit, offset } = listClientsQuerySchema.parse(request.query);
    const actor = request.actor!;
    const assignedToMemberId = actor.role === 'employee' ? actor.teamMemberId : undefined;
    return app.runInTx((tx) =>
      clientsService.list(tx, { limit, offset, assignedToMemberId }),
    );
  });

  app.get('/clients/:id', authed, async (request) => {
    const { id } = clientIdParamSchema.parse(request.params);
    const actor = request.actor!;
    const scope = actor.role === 'employee' ? actor.teamMemberId : undefined;
    return app.runInTx((tx) => clientsService.getById(tx, id, scope));
  });

  app.post('/clients', gated('client.create'), async (request, reply) => {
    const input = createClientSchema.parse(request.body);
    const created = await app.runInTx((tx) =>
      clientsService.create(tx, input),
    );
    return reply.status(201).send(created);
  });

  app.put('/clients/:id', gated('client.update'), async (request) => {
    const { id } = clientIdParamSchema.parse(request.params);
    const input = updateClientSchema.parse(request.body);
    return app.runInTx((tx) => clientsService.update(tx, id, input));
  });

  app.post('/clients/:id/status', gated('client.status.change'), async (request) => {
    const { id } = clientIdParamSchema.parse(request.params);
    const { status } = changeClientStatusSchema.parse(request.body);
    return app.runInTx((tx) => clientsService.changeStatus(tx, id, status));
  });

  // Soft-delete: the client leaves every read, its receivables and assignments
  // stay. Separate from POST /clients/:id/status — a baja is a lifecycle state,
  // this is removal.
  app.delete('/clients/:id', manager, async (request) => {
    const { id } = clientIdParamSchema.parse(request.params);
    return app.runInTx((tx) => clientsService.remove(tx, id));
  });

  /**
   * Every active assignment in the workspace — what the front's team store loads on
   * mount, so "who works on what" is one request rather than one per client.
   *
   * `authed`, with the employee scoped to their own rows exactly as `GET /clients`
   * does. No new privacy decision: an employee already sees their own assignments
   * through both sibling endpoints.
   */
  app.get('/assignments', authed, async (request) => {
    const actor = request.actor!;
    return app.runInTx((tx) =>
      clientsService.listAllAssignments(
        tx,
        { role: actor.role, teamMemberId: actor.teamMemberId },
        hasCapability(actor.capabilities, 'teamCost'),
      ),
    );
  });

  app.get('/clients/:id/assignments', authed, async (request) => {
    const { id } = clientIdParamSchema.parse(request.params);
    const actor = request.actor!;
    const scope = actor.role === 'employee' ? actor.teamMemberId : undefined;
    const includeCost = hasCapability(actor.capabilities, 'teamCost');
    return app.runInTx((tx) =>
      clientsService.listAssignments(tx, id, includeCost, scope),
    );
  });

  app.post('/clients/:id/assignments', gated('assignment.create'), async (request, reply) => {
    const { id } = clientIdParamSchema.parse(request.params);
    const input = createAssignmentSchema.parse(request.body);
    const includeCost = requireCostCapabilityToWrite(request, input.monthlyCostMinor);
    const created = await app.runInTx((tx) =>
      clientsService.addAssignment(tx, id, input, includeCost),
    );
    return reply.status(201).send(created);
  });

  /**
   * Correct an assignment in place.
   *
   * Its absence was not a policy: the partial unique index on (client, member) allows
   * only one live row per pair, so the only way to fix a mistyped cost was to end the
   * assignment and create another — which rewrites the member's tenure line, making a
   * typo read as a staffing change ever after.
   */
  app.patch('/assignments/:id', manager, async (request) => {
    const { id } = assignmentIdParamSchema.parse(request.params);
    const input = updateAssignmentSchema.parse(request.body);
    const includeCost = requireCostCapabilityToWrite(request, input.monthlyCostMinor);
    return app.runInTx((tx) =>
      clientsService.updateAssignment(tx, id, input, includeCost),
    );
  });

  app.delete('/assignments/:id', manager, async (request) => {
    const { id } = assignmentIdParamSchema.parse(request.params);
    const includeCost = hasCapability(request.actor!.capabilities, 'teamCost');
    return app.runInTx((tx) => clientsService.endAssignment(tx, id, includeCost));
  });

  // ── Priced contract lines ──────────────────────────────────────────────────
  //
  // Readable by anyone who can read the client (the breakdown is the fee, and the fee
  // is already on the roster); writable by a manager, because every write recomputes
  // what the studio bills.

  app.get('/clients/:id/service-lines', authed, async (request) => {
    const { id } = clientIdParamSchema.parse(request.params);
    const actor = request.actor!;
    // The SAME scope `GET /clients/:id` and `/clients/:id/assignments` apply. Without it
    // an employee reads the priced breakdown — every service name and price, whose sum IS
    // the monthly fee — of any client in the workspace, including the ones every other
    // endpoint 404s for them. The employee perspective is money-free by design.
    const scope = actor.role === 'employee' ? actor.teamMemberId : undefined;
    return app.runInTx((tx) => clientsService.listServiceLines(tx, id, scope));
  });

  app.post('/clients/:id/service-lines', gated('client.update'), async (request, reply) => {
    const { id } = clientIdParamSchema.parse(request.params);
    const input = createServiceLineSchema.parse(request.body);
    const created = await app.runInTx((tx) =>
      clientsService.addServiceLine(tx, id, input),
    );
    return reply.status(201).send(created);
  });

  app.patch('/service-lines/:id', gated('client.update'), async (request) => {
    const { id } = serviceLineIdParamSchema.parse(request.params);
    const input = updateServiceLineSchema.parse(request.body);
    return app.runInTx((tx) => clientsService.updateServiceLine(tx, id, input));
  });

  app.delete('/service-lines/:id', gated('client.update'), async (request) => {
    const { id } = serviceLineIdParamSchema.parse(request.params);
    return app.runInTx((tx) => clientsService.removeServiceLine(tx, id));
  });
}
