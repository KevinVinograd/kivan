/**
 * Clients repository. Runs on the `tx` from runInTx. Soft-deleted clients (`deletedAt != null`) are excluded from reads;
 * assignments are soft-ended via status='ended'.
 */
import type { Prisma } from '@hold/db';

interface ListArgs {
  limit: number;
  offset: number;
  /** When set, restrict to clients this team member is actively assigned to. */
  assignedToMemberId?: string | null;
}

export const clientsRepo = {
  async list(tx: Prisma.TransactionClient, { limit, offset, assignedToMemberId }: ListArgs) {
    if (assignedToMemberId === null) {
      return { items: [], total: 0 };
    }
    const where: Prisma.ClientWhereInput = {
      deletedAt: null,
      ...(assignedToMemberId
        ? { assignments: { some: { teamMemberId: assignedToMemberId, status: 'active' } } }
        : {}),
    };
    const [items, total] = await Promise.all([
      tx.client.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
      tx.client.count({ where }),
    ]);
    return { items, total };
  },

  findById(tx: Prisma.TransactionClient, id: string) {
    return tx.client.findFirst({ where: { id, deletedAt: null } });
  },

  /** A client visible to a given member only if they're actively assigned. */
  findByIdAssignedTo(tx: Prisma.TransactionClient, id: string, teamMemberId: string) {
    return tx.client.findFirst({
      where: { id, deletedAt: null, assignments: { some: { teamMemberId, status: 'active' } } },
    });
  },

  create(tx: Prisma.TransactionClient, data: Prisma.ClientUncheckedCreateInput) {
    return tx.client.create({ data });
  },

  update(tx: Prisma.TransactionClient, id: string, data: Prisma.ClientUpdateInput) {
    return tx.client.update({ where: { id }, data });
  },

  /**
   * Remove a client from every read by stamping `deletedAt` (same soft-delete
   * shape as `teamRepo.softDelete`). A hard DELETE is not an option: receivables
   * and assignments reference the client, and the studio's billing history must
   * survive the removal of the client it belongs to. `status` is deliberately
   * left alone — the record keeps the lifecycle state it actually ended on.
   */
  softDelete(tx: Prisma.TransactionClient, id: string) {
    return tx.client.update({ where: { id }, data: { deletedAt: new Date() } });
  },

  /**
   * The names every assignment surface renders, fetched with the row rather than
   * joined by hand in the browser against lists it may not have loaded.
   */
  withNames: {
    include: {
      client: { select: { name: true } },
      teamMember: { select: { name: true } },
      service: { select: { name: true } },
    },
  } satisfies Prisma.ClientAssignmentDefaultArgs,

  listAssignments(tx: Prisma.TransactionClient, clientId: string) {
    return tx.clientAssignment.findMany({
      where: { clientId, status: { not: 'ended' } },
      orderBy: { createdAt: 'desc' },
      ...this.withNames,
    });
  },

  /**
   * Every active assignment in the workspace.
   *
   * The primitive the front's team store hydrates from. Without it, "who works on
   * what" costs one request per client (or per member), and a write that persisted
   * into a snapshot nothing ever loads would vanish on reload — looking exactly like
   * a failed save.
   *
   * `assignedToMemberId` scopes an EMPLOYEE to their own rows, mirroring what
   * `GET /clients` already does with the same argument name.
   */
  async listAllAssignments(
    tx: Prisma.TransactionClient,
    scope: { role: string; teamMemberId: string | null },
  ) {
    /**
     * The scope is decided from the ROLE, and `null` is never "no filter".
     *
     * An employee's `teamMemberId` is nullable — an invitation can link a login to
     * a roster person or leave it unlinked ("Sin vincular"), so an unlinked employee
     * is a real production state. Written as
     * `...(assignedToMemberId ? { teamMemberId } : {})`, that `null` fell through the
     * ternary and returned EVERY assignment in the workspace: client names, colleague
     * names, the whole who-works-on-what map — to the one user `GET /clients` was
     * simultaneously telling they had zero clients.
     *
     * `clientsRepo.list` guards the same value explicitly, and
     * `/team-members/:id/assignments` 403s on it. This one has to match them.
     */
    if (scope.role === 'employee') {
      if (!scope.teamMemberId) {
        return [];
      }
      return tx.clientAssignment.findMany({
        where: {
          status: { not: 'ended' },
          client: { deletedAt: null },
          teamMemberId: scope.teamMemberId,
        },
        orderBy: { createdAt: 'desc' },
        ...this.withNames,
      });
    }
    return tx.clientAssignment.findMany({
      where: { status: { not: 'ended' }, client: { deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      ...this.withNames,
    });
  },

  /**
   * The mirror direction: every client one member is actively on.
   *
   * A separate query and not a filter on `listAssignments`, because the privacy
   * question differs. `GET /clients/:id/assignments` scopes an employee to rows they
   * appear in; here the member IS the subject, so the caller must be a manager or
   * that same member — decided in the route, since only it knows who is asking.
   */
  listAssignmentsForMember(tx: Prisma.TransactionClient, teamMemberId: string) {
    return tx.clientAssignment.findMany({
      where: { teamMemberId, status: { not: 'ended' }, client: { deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      ...this.withNames,
    });
  },

  createAssignment(tx: Prisma.TransactionClient, data: Prisma.ClientAssignmentUncheckedCreateInput) {
    return tx.clientAssignment.create({ data, ...this.withNames });
  },

  // Existence checks for the assignment FKs, so a bad id is a clean 400.
  findTeamMember(tx: Prisma.TransactionClient, id: string) {
    return tx.teamMember.findFirst({ where: { id, deletedAt: null } });
  },

  findService(tx: Prisma.TransactionClient, id: string) {
    return tx.service.findUnique({ where: { id } });
  },

  findAssignment(tx: Prisma.TransactionClient, id: string) {
    return tx.clientAssignment.findUnique({ where: { id } });
  },

  endAssignment(tx: Prisma.TransactionClient, id: string) {
    return tx.clientAssignment.update({
      where: { id },
      data: { status: 'ended', endedAt: new Date() },
      ...this.withNames,
    });
  },

  /** Correct an assignment in place. `withNames` so the response can be rendered
   *  without a second read, exactly like the create and the end. */
  updateAssignment(
    tx: Prisma.TransactionClient,
    id: string,
    data: Prisma.ClientAssignmentUncheckedUpdateInput,
  ) {
    return tx.clientAssignment.update({ where: { id }, data, ...this.withNames });
  },

  // ── Priced contract lines (ClientService) ─────────────────────────────────

  /** A client's live, active lines, in the order the operator arranged them. */
  listServiceLines(tx: Prisma.TransactionClient, clientId: string) {
    return tx.clientService.findMany({
      where: { clientId, deletedAt: null },
      orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  },

  findServiceLine(tx: Prisma.TransactionClient, id: string) {
    return tx.clientService.findFirst({ where: { id, deletedAt: null } });
  },

  createServiceLine(tx: Prisma.TransactionClient, data: Prisma.ClientServiceUncheckedCreateInput) {
    return tx.clientService.create({ data });
  },

  updateServiceLine(
    tx: Prisma.TransactionClient,
    id: string,
    data: Prisma.ClientServiceUncheckedUpdateInput,
  ) {
    return tx.clientService.update({ where: { id }, data });
  },

  /** SOFT delete: receivable lines cite this row, and a cobro must stay explicable
   *  after the service leaves the contract. */
  softDeleteServiceLine(tx: Prisma.TransactionClient, id: string) {
    return tx.clientService.update({ where: { id }, data: { deletedAt: new Date() } });
  },

  /**
   * How much of each `one_time` line has already been billed, in the CONTRACT's currency.
   *
   * A converted cobro stores the ARS figure in `amountMinor` and the contracted one in
   * `originalAmountMinor`, so the contract-side amount is `originalAmountMinor ??
   * amountMinor`. Cancelled cobros are soft-deleted and do not count: cancelling the
   * anticipo gives the price back. One query for all the lines, never one per line.
   */
  async billedByServiceLine(tx: Prisma.TransactionClient, clientServiceIds: string[]) {
    const billed = new Map<string, bigint>();
    if (clientServiceIds.length === 0) return billed;
    const rows = await tx.receivableLine.findMany({
      // Same rule as `billingRepo.billedAgainstServiceLine`: one-time cobros only, and a
      // cancelled one keeps counting once money came in.
      where: {
        clientServiceId: { in: clientServiceIds },
        receivable: {
          source: 'one_time',
          OR: [{ deletedAt: null }, { collectedAmountMinor: { gt: 0n } }],
        },
      },
      select: { clientServiceId: true, amountMinor: true, originalAmountMinor: true },
    });
    for (const row of rows) {
      if (!row.clientServiceId) continue;
      const amount = row.originalAmountMinor ?? row.amountMinor;
      billed.set(row.clientServiceId, (billed.get(row.clientServiceId) ?? 0n) + amount);
    }
    return billed;
  },

  /**
   * Recompute a client's fee from its live, active MONTHLY lines — the whole point of the
   * feature ("que se genere asi un total a pagar que seria el fee mensual"). A one-time
   * project price or a per-production price is not a retainer and never forms the fee.
   *
   * Returns the new total, or null when the client has NO active monthly line. Null is not
   * zero: such a client is on its hand-typed fee and must keep it. Deriving 0 there — the
   * first version of this did — meant that adding a one-time "Etapa 1" to a client on a
   * $500.000 abono zeroed the abono, dropped the client out of the month generator, and
   * (with the edit guard) left no way to type it back. The abono is the operator's to
   * change, from the edit dialog, until a monthly line takes over.
   */
  async recomputeMonthlyFee(tx: Prisma.TransactionClient, clientId: string) {
    const lines = await tx.clientService.findMany({
      where: { clientId, deletedAt: null, active: true, billingMode: 'monthly' },
      select: { priceMinor: true },
    });
    if (lines.length === 0) return null;
    const total = lines.reduce((sum, l) => sum + l.priceMinor, 0n);
    await tx.client.update({ where: { id: clientId }, data: { monthlyFeeMinor: total } });
    return total;
  },

  /** Whether the client's fee is derived from its lines (≥1 active, live MONTHLY line). */
  async isPricedByLines(tx: Prisma.TransactionClient, clientId: string) {
    const count = await tx.clientService.count({
      where: { clientId, deletedAt: null, active: true, billingMode: 'monthly' },
    });
    return count > 0;
  },

  /** Unbilled productions still linked to a line: what a mode change would strand. */
  countPendingProductions(tx: Prisma.TransactionClient, clientServiceId: string) {
    return tx.production.count({
      where: { clientServiceId, receivableId: null, deletedAt: null },
    });
  },
};
