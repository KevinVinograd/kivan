/**
 * Reports / analytics service — derived read models over the canonical stores.
 * `financials` and `profitability` are owner-only (gated at the route). Full
 * cost-based margin needs the activity/cost-allocation layer (deferred); v1
 * profitability is revenue-side (billed vs collected per client).
 */
import type { Prisma } from '@hold/db';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import { reportsRepo } from './reports.repo.js';
import {
  type CapacityDto,
  type ClientMonthDto,
  type FinancialsDto,
  type HoursHistoryDto,
  type MarginHistoryDto,
  type ProductivityDto,
  type ProfitabilityDto,
  type SummaryDto,
} from './reports.schema.js';

/** Percentage of `part` over `whole` (in minor units), 2-decimal, 0 when whole is 0. */
function pctOf(part: bigint, whole: bigint): number {
  return whole > 0n ? Number((part * 10000n) / whole) / 100 : 0;
}

/**
 * The last `count` calendar months ending with the current one, oldest first — the window
 * both trend series walk. Extracted because the UTC month arithmetic is the part that is
 * easy to get wrong, and it had been written twice; re-anchoring the window (12 months, or
 * the workspace timezone) is now one edit.
 */
function lastMonths(count: number): { period: string; start: Date; end: Date }[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1 - i), 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    return { period: start.toISOString().slice(0, 7), start, end };
  });
}

function monthBoundsOf(date?: Date): { start?: Date; end?: Date; label: string | null } {
  if (!date) return { label: null };
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start, end, label: start.toISOString().slice(0, 7) };
}

/** The receivable sums `profitabilityByClient` returns for one client. */
type CobroSums = {
  totalAmountMinor: bigint | null;
  collectedAmountMinor: bigint | null;
  costDesignMinor: bigint | null;
  costCommMinor: bigint | null;
  costProductionMinor: bigint | null;
  costViaticsMinor: bigint | null;
  costPautaMinor: bigint | null;
  costFixedMinor: bigint | null;
};

/**
 * One client's month: what its peso cobros billed and recorded as cost, plus what the
 * studio pays the people assigned to it (`team`, null without `teamCost`) and what its
 * productions cost. The one arithmetic behind the Rentabilidad row and the client's own
 * Resumen, so the two can never disagree.
 *
 * Creator pay enters the production bucket only with `includeTeamCost` (hours × one
 * person's rate is that person's pay); production viáticos enter the viáticos bucket for
 * everyone.
 */
function monthCosts(
  sums: CobroSums | undefined,
  team: bigint | null,
  productions: { work: bigint; viatics: bigint } | undefined,
  includeTeamCost: boolean,
) {
  const costDesign = sums?.costDesignMinor ?? 0n;
  const costComm = sums?.costCommMinor ?? 0n;
  const costProduction =
    (sums?.costProductionMinor ?? 0n) + (includeTeamCost && productions ? productions.work : 0n);
  const costViatics = (sums?.costViaticsMinor ?? 0n) + (productions?.viatics ?? 0n);
  const costPauta = sums?.costPautaMinor ?? 0n;
  const costFixed = sums?.costFixedMinor ?? 0n;
  return {
    billed: sums?.totalAmountMinor ?? 0n,
    collected: sums?.collectedAmountMinor ?? 0n,
    costTeam: team,
    costDesign,
    costComm,
    costProduction,
    costViatics,
    costPauta,
    costFixed,
    costTotal: costDesign + costComm + costProduction + costViatics + costPauta + costFixed + (team ?? 0n),
  };
}

export const reportsService = {
  async summary(tx: Prisma.TransactionClient, period?: Date): Promise<SummaryDto> {
    const { start, end, label } = monthBoundsOf(period);
    const [rec, pay, pout] = await Promise.all([
      reportsRepo.receivables(tx, start, end),
      reportsRepo.payments(tx, start, end),
      reportsRepo.payouts(tx, start, end),
    ]);
    const net = rec.collected - (pay.paid + pout.paid);
    return {
      period: label,
      revenue: {
        billedMinor: rec.billed.toString(),
        collectedMinor: rec.collected.toString(),
        count: rec.count,
        otherLaneCount: rec.otherLaneCount,
      },
      payouts: { totalMinor: pout.total.toString(), paidMinor: pout.paid.toString(), count: pout.count },
      payments: {
        totalMinor: pay.total.toString(),
        paidMinor: pay.paid.toString(),
        count: pay.count,
        otherLaneCount: pay.otherLaneCount,
      },
      netCollectedMinusPaidMinor: net.toString(),
    };
  },

  async financials(tx: Prisma.TransactionClient, period?: Date): Promise<FinancialsDto> {
    const { start, end, label } = monthBoundsOf(period);
    const [rec, pay, pout] = await Promise.all([
      reportsRepo.receivables(tx, start, end),
      reportsRepo.payments(tx, start, end),
      reportsRepo.payouts(tx, start, end),
    ]);
    const cashIn = rec.collected;
    const cashOut = pay.paid + pout.paid;
    return {
      period: label,
      cashInMinor: cashIn.toString(),
      cashOutMinor: cashOut.toString(),
      netMinor: (cashIn - cashOut).toString(),
    };
  },

  /**
   * Per-client margin for a period: billed minus what the cobros record (viáticos,
   * pauta, fijos) minus what the studio pays the people assigned to the client.
   *
   * `includeTeamCost` is REQUIRED and has no default, for the reason `capacity`
   * documents: a client with a single person on it turns its team cost into that
   * person's pay, so the figure enters only for a caller holding `teamCost`. Without it
   * the margin leaves team cost out entirely rather than embedding a number the caller
   * could back out by subtraction. With no period there is no month to price the
   * assignments against, so team cost is left out the same way.
   *
   * Productions enter the same month the shoot happened: what the creators were paid
   * for it lands in the production bucket (only with `includeTeamCost`, for the same
   * reason — hours × one person's rate is that person's pay, and only once approved, when
   * a liquidación pays it), its viáticos in the viáticos bucket for everyone.
   *
   * A row exists only for a client with peso billing in the period. What the others cost
   * that month is returned as `unbilledCost`, stated beside the table and kept out of its
   * totals and of the trend — which stays the sum of the table.
   */
  async profitability(
    tx: Prisma.TransactionClient,
    includeTeamCost: boolean,
    period?: Date,
  ): Promise<ProfitabilityDto> {
    const { start, end, label } = monthBoundsOf(period);
    const priceTeam = includeTeamCost && start !== undefined && end !== undefined;
    const [groups, otherLaneGroups, teamCosts, productionCosts] = await Promise.all([
      reportsRepo.profitabilityByClient(tx, start, end),
      reportsRepo.otherLaneClientIds(tx, start, end),
      priceTeam ? reportsRepo.teamCostByClient(tx, start, end) : Promise.resolve(null),
      start && end ? reportsRepo.productionCostByClient(tx, start, end) : Promise.resolve(null),
    ]);
    const clientRows = await reportsRepo.clientNames(tx, groups.map((g) => g.clientId));
    const names = new Map(clientRows.map((c) => [c.id, c.name]));
    const teamOf = (clientId: string) => (teamCosts ? (teamCosts.get(clientId) ?? 0n) : null);
    const byClient = groups.map((g) => {
      const m = monthCosts(g._sum, teamOf(g.clientId), productionCosts?.get(g.clientId), includeTeamCost);
      const margin = m.billed - m.costTotal;
      return {
        clientId: g.clientId,
        clientName: names.get(g.clientId) ?? '',
        billedMinor: m.billed.toString(),
        collectedMinor: m.collected.toString(),
        collectionRatePct: pctOf(m.collected, m.billed),
        costTeamMinor: m.costTeam === null ? null : m.costTeam.toString(),
        costDesignMinor: m.costDesign.toString(),
        costCommMinor: m.costComm.toString(),
        costProductionMinor: m.costProduction.toString(),
        costViaticsMinor: m.costViatics.toString(),
        costPautaMinor: m.costPauta.toString(),
        costFixedMinor: m.costFixed.toString(),
        costTotalMinor: m.costTotal.toString(),
        marginMinor: margin.toString(),
        marginPct: pctOf(margin, m.billed),
      };
    });
    // Only the clients that are MISSING: one billed in both lanes still appears in
    // `byClient` with its peso figures, and reporting it as omitted would be false.
    const present = new Set(byClient.map((c) => c.clientId));
    const otherLane = new Set(otherLaneGroups.map((g) => g.clientId).filter((id) => !present.has(id)));
    // What the studio spent this month on clients with no peso cobro yet. They have no row
    // (no billing to state a margin against), so the screen says what that leaves out
    // instead of a cost that silently "does not load" for them.
    const candidates = [...new Set([...(teamCosts?.keys() ?? []), ...(productionCosts?.keys() ?? [])])].filter(
      (id) => !present.has(id) && !otherLane.has(id),
    );
    const statuses = await reportsRepo.clientNameStatus(tx, candidates);
    let unbilledClients = 0;
    let unbilledCost = 0n;
    for (const client of statuses) {
      // A churned client is not going to be billed; an assignment left open on it is
      // stale data, not this month's spend.
      if (client.status === 'churned') continue;
      const cost = monthCosts(undefined, teamOf(client.id), productionCosts?.get(client.id), includeTeamCost).costTotal;
      if (cost <= 0n) continue;
      unbilledClients += 1;
      unbilledCost += cost;
    }
    return {
      period: label,
      byClient,
      otherLaneClientCount: otherLane.size,
      unbilledCost: { clientCount: unbilledClients, costMinor: unbilledCost.toString() },
    };
  },

  /**
   * One client's month for its own Resumen, billed yet or not: what its peso cobros billed
   * and recorded, what the studio pays the people on it, and what its productions cost.
   *
   * The same arithmetic as its Rentabilidad row (`monthCosts`), so once the month is billed
   * the two agree to the peso. Before that, Rentabilidad has no row for it but this still
   * states the cost: HOLD read the empty Resumen of every client not billed yet as "the
   * cost does not load" (review of 2026-10-21). Team and creator pay follow `teamCost`
   * exactly as Rentabilidad does.
   */
  async clientMonth(
    tx: Prisma.TransactionClient,
    includeTeamCost: boolean,
    clientId: string,
    period: Date,
  ): Promise<ClientMonthDto> {
    const { start, end, label } = monthBoundsOf(period);
    if (!start || !end || !label) throw new BadRequestError('period is required');
    const [client] = await reportsRepo.clientNames(tx, [clientId]);
    if (!client) throw new NotFoundError(`Client ${clientId} not found`);
    const [groups, teamCosts, productionCosts] = await Promise.all([
      reportsRepo.profitabilityByClient(tx, start, end, clientId),
      includeTeamCost ? reportsRepo.teamCostByClient(tx, start, end, clientId) : Promise.resolve(null),
      reportsRepo.productionCostByClient(tx, start, end, [clientId]),
    ]);
    const m = monthCosts(
      groups[0]?._sum,
      teamCosts ? (teamCosts.get(clientId) ?? 0n) : null,
      productionCosts.get(clientId),
      includeTeamCost,
    );
    return {
      period: label,
      billedMinor: m.billed.toString(),
      costTeamMinor: m.costTeam === null ? null : m.costTeam.toString(),
      costProductionMinor: includeTeamCost ? m.costProduction.toString() : null,
      costViaticsMinor: m.costViatics.toString(),
      costOtherMinor: (m.costDesign + m.costComm + m.costPauta + m.costFixed).toString(),
      costTotalMinor: m.costTotal.toString(),
    };
  },

  /** Team workload + real monthly cost per member. Period-agnostic (assignments
   *  are a standing snapshot). Hours/utilization stay null until HOLD loads hours.
   *  Per-member cost crosses the wire only when the caller holds the `teamCost`
   *  capability; otherwise `teamCostMinor` is null. `includeCost` is REQUIRED
   *  and has no default: a money-bearing flag that defaults to true would leak the
   *  figure the day someone adds a caller and forgets to pass it. */
  async capacity(tx: Prisma.TransactionClient, includeCost: boolean): Promise<CapacityDto> {
    const members = await reportsRepo.capacityByMember(tx);
    return {
      members: members.map((m) => {
        const hoursAllocated = m.assignments.reduce((t, a) => t + (a.estimatedMonthlyHours ?? 0), 0);
        // Nothing wrote this column until now, so a member can have assignments and no
        // cost on any of them. Summing nulls as zero and reporting the total as money is
        // exactly the `$ 0` this branch removes: `null` here means NOBODY ENTERED IT.
        //
        // The counters travel with the figure because a PARTIAL sum is the dangerous
        // case — it is a real number that understates, and nothing about it looks wrong.
        const costed = includeCost
          ? m.assignments.filter((a) => a.monthlyCostMinor !== null)
          : [];
        const teamCost =
          costed.length > 0 ? costed.reduce((t, a) => t + a.monthlyCostMinor!, 0n) : null;
        const capacityHours = m.capacityHoursMonthly;
        const utilizationPct =
          capacityHours != null && capacityHours > 0
            ? Math.round((hoursAllocated / capacityHours) * 10000) / 100
            : null;
        return {
          personId: m.id,
          personName: m.name,
          role: m.role,
          clientsActive: m.assignments.length,
          clientNames: m.assignments.map((a) => a.client.name),
          hoursAllocated,
          capacityHours,
          utilizationPct,
          teamCostMinor: teamCost?.toString() ?? null,
          costedAssignments: costed.length,
          totalAssignments: includeCost ? m.assignments.length : 0,
        };
      }),
    };
  },

  /** Per-task productivity for the period, one row per logged `TimeEntry`. Hours,
   *  not money, so it is gated by role (managers) rather than a money capability.
   *  `personName`/`clientStatus` are joined in; `service` has no source on TimeEntry
   *  yet, so it defaults to 'General' (mirrors profitability's service default). */
  async productivity(tx: Prisma.TransactionClient, period?: Date): Promise<ProductivityDto> {
    const { start, end, label } = monthBoundsOf(period);
    const entries = await reportsRepo.timeEntriesForPeriod(tx, start, end);
    const memberIds = [...new Set(entries.map((e) => e.teamMemberId))];
    const clientIds = [
      ...new Set(entries.map((e) => e.clientId).filter((id): id is string => id != null)),
    ];
    const [members, clients] = await Promise.all([
      reportsRepo.memberNames(tx, memberIds),
      reportsRepo.clientNameStatus(tx, clientIds),
    ]);
    const memberName = new Map(members.map((m) => [m.id, m.name]));
    const clientById = new Map(clients.map((c) => [c.id, c]));
    const items = entries.map((e) => {
      const client = e.clientId ? clientById.get(e.clientId) : undefined;
      return {
        id: e.id,
        personId: e.teamMemberId,
        personName: memberName.get(e.teamMemberId) ?? '',
        clientId: e.clientId ?? '',
        // Prefer the client's live name; fall back to the entry's denormalized copy;
        // an entry with no client reads as 'Sin cliente' so it groups distinctly.
        clientName: client?.name ?? e.clientName ?? (e.clientId ? '' : 'Sin cliente'),
        taskType: e.taskType,
        service: 'General',
        hours: e.hours,
        date: e.date.toISOString().slice(0, 10),
        isExtra: e.isOutOfScope,
        clientStatus: client?.status ?? '',
      };
    });
    return { period: label, items };
  },

  /** Margin per month over the last `months` (default 6), oldest first — the "Evolución
   *  del margen" trend. Studio-wide, or ONE client's when `clientId` is given (the
   *  Cliente drawer). Period-agnostic (a rolling window up to now).
   *
   *  `includeTeamCost` follows `profitability` exactly: the trend and the table are the
   *  same margin, and a chart that leaves team cost out next to a table that subtracts
   *  it would show two answers to one question. */
  async marginHistory(
    tx: Prisma.TransactionClient,
    includeTeamCost: boolean,
    months = 6,
    clientId?: string,
  ): Promise<MarginHistoryDto> {
    const points = await Promise.all(
      lastMonths(months).map(async ({ period, start, end }) => {
        const [margin, teamCosts, productionCosts, billedIds] = await Promise.all([
          reportsRepo.marginTotals(tx, start, end, clientId),
          includeTeamCost ? reportsRepo.teamCostByClient(tx, start, end, clientId) : null,
          reportsRepo.productionCostByClient(tx, start, end, clientId ? [clientId] : undefined),
          reportsRepo.pesoClientIds(tx, start, end, clientId),
        ]);
        // The clients the month's table has a row for, and only those: the trend is the
        // sum of the table, and an unbilled client is stated beside the table, not in it.
        const billed = new Set(billedIds);
        let team = 0n;
        for (const [id, cost] of teamCosts ?? []) if (billed.has(id)) team += cost;
        let productions = 0n;
        for (const [id, c] of productionCosts) {
          if (billed.has(id)) productions += c.viatics + (includeTeamCost ? c.work : 0n);
        }
        return { period, marginMinor: (margin - team - productions).toString() };
      }),
    );
    return { points };
  },

  /** One member's logged hours per month over the last `months` (default 6), oldest
   *  first — the Persona drawer's hours trend. Hours, not money. */
  async hoursHistory(
    tx: Prisma.TransactionClient,
    teamMemberId: string,
    months = 6,
  ): Promise<HoursHistoryDto> {
    const points = await Promise.all(
      lastMonths(months).map(async ({ period, start, end }) => ({
        period,
        hours: await reportsRepo.hoursTotal(tx, start, end, teamMemberId),
      })),
    );
    return { points };
  },
};
