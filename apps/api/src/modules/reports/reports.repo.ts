/** Reports read repository — pure aggregates over the canonical stores. */
import type { Prisma } from '@hold/db';
import { PAID_PRODUCTION_STATUSES } from '../monthly/monthly-plan.schema.js';

function periodFilter(start?: Date, end?: Date) {
  return start && end ? { period: { gte: start, lt: end } } : {};
}

/**
 * Every aggregate here is a PESO aggregate.
 *
 * This module had no currency filter anywhere, unlike its siblings (`paymentsRepo.kpis`,
 * `billingRepo.kpis`), so it added USD minor units straight into the peso sums.
 * A pago of USD 1.000 raised "Egresos del periodo" by $1.000 instead of what it actually
 * cost in pesos. Lanes are never
 * converted into each other, so the only honest scope for a peso figure is peso rows.
 *
 * What is excluded is COUNTED and returned, so the screen can name the omission instead
 * of quietly reporting a smaller number.
 */
const ARS = { currency: 'ARS' } as const;

export const reportsRepo = {
  async receivables(tx: Prisma.TransactionClient, start?: Date, end?: Date) {
    const scope: Prisma.ReceivableWhereInput = {
      deletedAt: null,
      status: { not: 'cancelled' },
      ...periodFilter(start, end),
    };
    const where: Prisma.ReceivableWhereInput = { ...scope, ...ARS };
    const [agg, count, otherLaneCount] = await Promise.all([
      tx.receivable.aggregate({ _sum: { totalAmountMinor: true, collectedAmountMinor: true }, where }),
      tx.receivable.count({ where }),
      tx.receivable.count({ where: { ...scope, currency: { not: 'ARS' } } }),
    ]);
    return {
      billed: agg._sum.totalAmountMinor ?? 0n,
      collected: agg._sum.collectedAmountMinor ?? 0n,
      count,
      otherLaneCount,
    };
  },

  async payments(tx: Prisma.TransactionClient, start?: Date, end?: Date) {
    const scope: Prisma.PaymentWhereInput = {
      deletedAt: null,
      status: { not: 'cancelled' },
      ...periodFilter(start, end),
    };
    const where: Prisma.PaymentWhereInput = { ...scope, ...ARS };
    const [agg, count, otherLaneCount] = await Promise.all([
      tx.payment.aggregate({ _sum: { totalAmountMinor: true, paidAmountMinor: true }, where }),
      tx.payment.count({ where }),
      tx.payment.count({ where: { ...scope, currency: { not: 'ARS' } } }),
    ]);
    return {
      total: agg._sum.totalAmountMinor ?? 0n,
      paid: agg._sum.paidAmountMinor ?? 0n,
      count,
      otherLaneCount,
    };
  },

  /** No currency filter, and none is missing: `PayoutStatement` carries no currency
   *  column, so every liquidacion is pesos by construction. */
  async payouts(tx: Prisma.TransactionClient, start?: Date, end?: Date) {
    const where: Prisma.PayoutStatementWhereInput = { deletedAt: null, ...periodFilter(start, end) };
    const [agg, count] = await Promise.all([
      tx.payoutStatement.aggregate({ _sum: { totalAmountMinor: true, paidAmountMinor: true }, where }),
      tx.payoutStatement.count({ where }),
    ]);
    return { total: agg._sum.totalAmountMinor ?? 0n, paid: agg._sum.paidAmountMinor ?? 0n, count };
  },

  profitabilityByClient(tx: Prisma.TransactionClient, start?: Date, end?: Date, clientId?: string) {
    return tx.receivable.groupBy({
      by: ['clientId'],
      // Peso rows only: the costs subtracted from this billed figure are peso columns, so
      // a non-peso cobro would produce a margin in no currency.
      where: {
        deletedAt: null,
        status: { not: 'cancelled' },
        ...ARS,
        ...(clientId ? { clientId } : {}),
        ...periodFilter(start, end),
      },
      _sum: {
        totalAmountMinor: true,
        collectedAmountMinor: true,
        costDesignMinor: true,
        costCommMinor: true,
        costProductionMinor: true,
        costViaticsMinor: true,
        costPautaMinor: true,
        costFixedMinor: true,
      },
    });
  },

  /** Clients with at least one live NON-peso cobro in the period. `profitabilityByClient`
   *  drops those rows, so a client billed only in another lane vanishes from Rentabilidad
   *  entirely — not as a zero row, as no row. This is what makes that omission sayable. */
  otherLaneClientIds(tx: Prisma.TransactionClient, start?: Date, end?: Date) {
    return tx.receivable.groupBy({
      by: ['clientId'],
      where: {
        deletedAt: null,
        status: { not: 'cancelled' },
        currency: { not: 'ARS' },
        ...periodFilter(start, end),
      },
    });
  },

  clientNames(tx: Prisma.TransactionClient, ids: string[]) {
    return tx.client.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  },

  /** Total billed − total area cost for a period. Studio-wide, or one client's when
   *  `clientId` is given (the per-client margin trend in the Cliente drawer). */
  async marginTotals(
    tx: Prisma.TransactionClient,
    start: Date,
    end: Date,
    clientId?: string,
  ): Promise<bigint> {
    const agg = await tx.receivable.aggregate({
      where: {
        deletedAt: null,
        status: { not: 'cancelled' },
        // Peso rows only, for the same reason as `profitabilityByClient`: billed minus
        // peso area costs is only a margin when the billed side is pesos too.
        ...ARS,
        ...(clientId ? { clientId } : {}),
        ...periodFilter(start, end),
      },
      _sum: {
        totalAmountMinor: true,
        costDesignMinor: true,
        costCommMinor: true,
        costProductionMinor: true,
        costViaticsMinor: true,
        costPautaMinor: true,
        costFixedMinor: true,
      },
    });
    const s = agg._sum;
    const billed = s.totalAmountMinor ?? 0n;
    const cost =
      (s.costDesignMinor ?? 0n) +
      (s.costCommMinor ?? 0n) +
      (s.costProductionMinor ?? 0n) +
      (s.costViaticsMinor ?? 0n) +
      (s.costPautaMinor ?? 0n) +
      (s.costFixedMinor ?? 0n);
    return billed - cost;
  },

  /**
   * What the studio pays its people for each client in a window, from the assignments —
   * the monthly "Le pagamos por este cliente".
   *
   * An assignment counts toward a month it OVERLAPS: it started before the month ended
   * (`assignedSince`, falling back to `createdAt` for rows that never recorded it) and
   * had not ended before the month began. A past month therefore charges whoever was on
   * the client THEN, not whoever is on it today. Any overlap counts the full amount: it
   * is a monthly agreement, and HOLD pays it whole.
   *
   * A row with no amount (`null` = nobody entered it) contributes nothing. An assignment
   * marked ended without an end date cannot be placed in time, so it counts toward no
   * month rather than toward every month.
   *
   * ONE amount per person per client per month: the newest row that carries one. No
   * screen edits an assignment, so changing what someone is paid means ending the row
   * and assigning them again — and both rows overlap the month of the change. Summing
   * them would charge that month twice; the newer row is the amount HOLD meant. Two
   * LIVE rows for one pair cannot exist (the live-pair index), so this only ever picks
   * between an ended row and its replacement.
   *
   * Every client is priced, billed that month or not. Which of them a MARGIN is stated
   * for is the caller's rule, not this query's: Rentabilidad keeps the clients with peso
   * billing (a client billed only in dollars has no peso figure to subtract from) and the
   * trend keeps exactly those too, so a month's trend is still the sum of its table. The
   * client's own Resumen keeps all of it: a client nobody has billed yet still costs what
   * its people are paid, and hiding that read as "the cost does not load" (HOLD's review
   * of 2026-10-21).
   */
  async teamCostByClient(
    tx: Prisma.TransactionClient,
    start: Date,
    end: Date,
    clientId?: string,
  ): Promise<Map<string, bigint>> {
    const rows = await tx.clientAssignment.findMany({
      where: {
        monthlyCostMinor: { not: null },
        ...(clientId ? { clientId } : {}),
        AND: [
          { OR: [{ assignedSince: { lt: end } }, { assignedSince: null, createdAt: { lt: end } }] },
          { OR: [{ endedAt: null, status: { not: 'ended' } }, { endedAt: { gte: start } }] },
        ],
      },
      select: { clientId: true, teamMemberId: true, monthlyCostMinor: true },
      orderBy: { createdAt: 'desc' },
    });
    const seen = new Set<string>();
    const byClient = new Map<string, bigint>();
    for (const row of rows) {
      const pair = `${row.clientId}:${row.teamMemberId}`;
      if (seen.has(pair)) continue;
      seen.add(pair);
      byClient.set(row.clientId, (byClient.get(row.clientId) ?? 0n) + (row.monthlyCostMinor ?? 0n));
    }
    return byClient;
  },

  /** Clients with peso billing in a window: the ones a margin exists for. */
  async pesoClientIds(
    tx: Prisma.TransactionClient,
    start: Date,
    end: Date,
    clientId?: string,
  ): Promise<string[]> {
    const groups = await tx.receivable.groupBy({
      by: ['clientId'],
      where: {
        deletedAt: null,
        status: { not: 'cancelled' },
        ...ARS,
        ...(clientId ? { clientId } : {}),
        ...periodFilter(start, end),
      },
    });
    return groups.map((g) => g.clientId);
  },

  /**
   * What each client's productions cost in a window, by the month of the shoot: `work` is
   * what the people on them were paid (`totalCostMinor`), `viatics` their travel.
   *
   * `work` counts APPROVED productions only (and the ones already billed), the same set a
   * liquidación pays: until the communication lead confirms it happened, nobody is paid
   * for it, so it is not yet a cost. Viáticos count from the moment the production is
   * loaded, because HOLD pays them back within the week, approved or not.
   *
   * Every client when `clientIds` is omitted; the callers keep the ones they state a
   * margin for. Productions carry no currency: they are pesos, the lane HOLD pays its
   * people in.
   */
  async productionCostByClient(
    tx: Prisma.TransactionClient,
    start: Date,
    end: Date,
    clientIds?: string[],
  ): Promise<Map<string, { work: bigint; viatics: bigint }>> {
    if (clientIds?.length === 0) return new Map();
    const groups = await tx.production.groupBy({
      by: ['clientId', 'status'],
      where: {
        deletedAt: null,
        ...(clientIds ? { clientId: { in: clientIds } } : { clientId: { not: null } }),
        period: { gte: start, lt: end },
      },
      _sum: { totalCostMinor: true, viaticsMinor: true },
    });
    const byClient = new Map<string, { work: bigint; viatics: bigint }>();
    for (const g of groups) {
      if (!g.clientId) continue;
      const sums = byClient.get(g.clientId) ?? { work: 0n, viatics: 0n };
      if (PAID_PRODUCTION_STATUSES.includes(g.status)) sums.work += g._sum.totalCostMinor ?? 0n;
      sums.viatics += g._sum.viaticsMinor ?? 0n;
      byClient.set(g.clientId, sums);
    }
    return byClient;
  },

  /** Name + status per client, for the productivity rollup (the table shows the
   *  client's lifecycle status alongside each logged task). */
  clientNameStatus(tx: Prisma.TransactionClient, ids: string[]) {
    return tx.client.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, status: true },
    });
  },

  memberNames(tx: Prisma.TransactionClient, ids: string[]) {
    return tx.teamMember.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  },

  /** Hours one member logged in a window (their monthly hours trend). Scoped on
   *  TimeEntry.date, like every other TimeEntry read — the model has no period column. */
  async hoursTotal(
    tx: Prisma.TransactionClient,
    start: Date,
    end: Date,
    teamMemberId: string,
  ): Promise<number> {
    const agg = await tx.timeEntry.aggregate({
      where: { deletedAt: null, teamMemberId, date: { gte: start, lt: end } },
      _sum: { hours: true },
    });
    return agg._sum.hours ?? 0;
  },

  /** Every logged time entry in the window (row-level detail — the by-person /
   *  by-client / by-task rollups are computed client-side). Scoped on `date`:
   *  TimeEntry has no `period` column. */
  /** Selects exactly the columns the productivity row renders. An unbounded `findMany` over
   *  every logged entry in a month is the widest read on this page, so it does not also drag
   *  the columns nobody maps. */
  timeEntriesForPeriod(tx: Prisma.TransactionClient, start?: Date, end?: Date) {
    return tx.timeEntry.findMany({
      where: { deletedAt: null, ...(start && end ? { date: { gte: start, lt: end } } : {}) },
      orderBy: { date: 'desc' },
      select: {
        id: true,
        teamMemberId: true,
        clientId: true,
        clientName: true,
        taskType: true,
        hours: true,
        date: true,
        isOutOfScope: true,
      },
    });
  },

  /** Per active member: their active assignments (client, hours, monthly cost) plus
   *  the member's monthly hour capacity. Standing snapshot (assignments are not
   *  month-scoped), so capacity is period-agnostic. */
  capacityByMember(tx: Prisma.TransactionClient) {
    return tx.teamMember.findMany({
      where: { deletedAt: null, status: 'active' },
      select: {
        id: true,
        name: true,
        role: true,
        capacityHoursMonthly: true,
        assignments: {
          // `not: 'ended'`, so a PAUSED assignment still counts — the studio keeps
          // paying for a paused client, and the rest of the clients module already
          // treats 'live' as 'not ended' (the partial unique index in 0013, and every
          // read in clients.repo.ts). Filtering to 'active' here made this the one
          // place with a different definition of the same word, which moved FOUR
          // figures at once: cost, allocated hours, active-client count and the client
          // name list — so a paused assignment quietly improved someone's utilization.
          //
          // A soft-deleted client is excluded, unlike a paused one: its row is gone
          // from every other surface, so leaving its cost in this total would make the
          // report disagree with the member's own card by an amount with no visible
          // source.
          where: { status: { not: 'ended' }, client: { deletedAt: null } },
          select: {
            estimatedMonthlyHours: true,
            monthlyCostMinor: true,
            client: { select: { name: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  },
};
