/**
 * Monthly-plan repository (productions / fixed expenses / alerts). Runs on the
 * `tx` from runInTx. Updates and soft-deletes are guarded by the
 * optimistic-concurrency `version` (a stale caller gets 0 rows affected → 409).
 */
import type { Prisma } from '@hold/db';

/** Period 'YYYY-MM' → the UTC date bounds of that month. */
export function monthBounds(period: string): { start: Date; end: Date } {
  const [y, m] = period.split('-').map(Number);
  return {
    start: new Date(Date.UTC(y as number, (m as number) - 1, 1)),
    end: new Date(Date.UTC(y as number, m as number, 1)),
  };
}

/**
 * The month's registered outflows, grouped by recipient type.
 *
 * Two reads, deliberately, and they answer different questions:
 *
 *   `paymentTotalsByType` is a groupBy with NO limit. It is what the money comes from, so
 *   it must be exact: a capped list that silently omits the 501st payment would understate
 *   the month's cost and overstate its profit, which is the shape of defect this codebase
 *   has already shipped once (see `truncated` in monthly-plan.service.ts).
 *
 *   `listPayments` is the capped row list the Gastos tab renders. Truncating a TABLE is
 *   visible and recoverable; truncating a TOTAL is neither.
 *
 * The filters mirror `monthlyRepo.receivableActualsByClient` exactly, including the ARS
 * scope: the monthly close is the peso operating lane, and summing ARS/USD into one
 * figure would mix currencies that are never converted. Non-ARS outflows belong to the
 * Treasury lanes. `@@index([period])` on Payment covers both reads.
 */
export const monthlyPaymentsRepo = {
  paymentTotalsByType(tx: Prisma.TransactionClient, start: Date, end: Date) {
    return tx.payment.groupBy({
      by: ['recipientType'],
      where: {
        period: { gte: start, lt: end },
        deletedAt: null,
        status: { not: 'cancelled' },
        currency: 'ARS',
      },
      _sum: { totalAmountMinor: true, paidAmountMinor: true },
      _count: { _all: true },
    });
  },

  /**
   * Payroll payments, grouped by the PERSON rather than by the recipient type.
   *
   * The month has two records of what a colaboradora is owed and they overlap: a
   * PayoutStatement (the plan) and the payments recorded in `/pagos` (the actuals). Adding
   * them charges her twice against the month's profit, so the front takes one per member
   * rather than the sum, and it needs the member key to do that.
   *
   * A statement always names a member; a payment need not (`teamMemberId` is nullable), and
   * an unlinked payroll payment cannot overlap anything, so it groups under `null` and is
   * added in full.
   */
  teamPaymentTotalsByMember(tx: Prisma.TransactionClient, start: Date, end: Date) {
    return tx.payment.groupBy({
      by: ['teamMemberId'],
      where: {
        recipientType: { in: ['collaborator', 'employee'] },
        period: { gte: start, lt: end },
        deletedAt: null,
        status: { not: 'cancelled' },
        currency: 'ARS',
      },
      _sum: { totalAmountMinor: true, paidAmountMinor: true },
    });
  },

  /**
   * How many pagos of the period the three ARS-scoped reads above leave out.
   *
   * A COUNT, not a sum: two lanes cannot share one figure, and what the screen needs to
   * say is that money exists outside the peso totals, not how much. Without it the
   * exclusion is invisible - the row is gone from the LIST as well as from the total,
   * and the "se muestran N de M" reconciliation is computed from the same ARS-scoped
   * count, so nothing on the page could ever hint at it.
   */
  otherLanePaymentCount(tx: Prisma.TransactionClient, start: Date, end: Date) {
    return tx.payment.count({
      where: {
        period: { gte: start, lt: end },
        deletedAt: null,
        status: { not: 'cancelled' },
        currency: { not: 'ARS' },
      },
    });
  },

  listPayments(tx: Prisma.TransactionClient, start: Date, end: Date, take: number) {
    return tx.payment.findMany({
      where: {
        period: { gte: start, lt: end },
        deletedAt: null,
        status: { not: 'cancelled' },
        currency: 'ARS',
      },
      orderBy: [{ expectedDate: 'asc' }, { id: 'asc' }],
      take,
      select: {
        id: true,
        recipientType: true,
        recipientName: true,
        concept: true,
        totalAmountMinor: true,
        paidAmountMinor: true,
        status: true,
        expectedDate: true,
        paymentDate: true,
      },
    });
  },
};

/** Attribution travels with every production read — it is what makes hours summable. */
const withAttribution = {
  include: {
    participantLinks: {
      include: { teamMember: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    },
    accountManager: { select: { name: true } },
  },
} satisfies Prisma.ProductionDefaultArgs;

export const monthlyPlanRepo = {
  // ── Productions ──
  listProductions(tx: Prisma.TransactionClient, start: Date, end: Date) {
    return tx.production.findMany({
      where: { period: { gte: start, lt: end }, deletedAt: null },
      // Newest first, and the last one loaded first within a day: what Operación mensual
      // lists, 25 a page. Oldest-first with no tiebreak sent a production loaded today to the
      // last page, and shuffled same-day rows on every re-read (reported 23/10). The client's
      // ficha already lists its productions in this order.
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      ...withAttribution,
    });
  },
  findProduction(tx: Prisma.TransactionClient, id: string) {
    return tx.production.findFirst({ where: { id, deletedAt: null }, ...withAttribution });
  },

  /** Members of this workspace among the given ids, for id→name resolution, with the
   *  hourly rate a production's cost is priced at. */
  findMembersByIds(tx: Prisma.TransactionClient, ids: string[]) {
    return tx.teamMember.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, name: true, hourlyRateMinor: true },
    });
  },

  /**
   * Every live member of the workspace, for name→id resolution.
   *
   * Read whole rather than filtered by name: matching has to be case- and
   * whitespace-insensitive AND has to detect when two members share a name, and
   * a `name: { in: [...] }` filter can do neither. Team rosters are tens of
   * rows, not thousands.
   */
  /** The roster a production is loaded against: names only, active people. */
  listProductionPeople(tx: Prisma.TransactionClient) {
    return tx.teamMember.findMany({
      where: { deletedAt: null, status: { not: 'inactive' } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  },
  listMembersForMatching(tx: Prisma.TransactionClient) {
    return tx.teamMember.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    });
  },

  /**
   * Replace a production's attribution wholesale. Replace-and-not-merge is the
   * point: the caller sends who worked it, and someone removed from that list
   * must stop counting toward their liquidación immediately.
   */
  async replaceAttribution(
    tx: Prisma.TransactionClient,
    productionId: string,
    rows: { teamMemberId: string; hours: number | null; role: string }[],
  ): Promise<void> {
    await tx.productionParticipant.deleteMany({ where: { productionId } });
    if (rows.length === 0) return;
    await tx.productionParticipant.createMany({
      data: rows.map((r) => ({ productionId, ...r })),
    });
  },
  /** Approve pending productions, or send approved ones back to pending. A production on a
   *  cobro (`invoiced`) is never touched. */
  async setApproval(tx: Prisma.TransactionClient, ids: string[], approved: boolean): Promise<number> {
    const r = await tx.production.updateMany({
      where: {
        id: { in: ids },
        deletedAt: null,
        receivableId: null,
        status: approved ? 'pending' : 'approved',
      },
      data: { status: approved ? 'approved' : 'pending', version: { increment: 1 } },
    });
    return r.count;
  },
  /** The clients the given productions belong to, to confine a communication lead. */
  clientsOf(tx: Prisma.TransactionClient, ids: string[]) {
    return tx.production.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { clientId: true },
      distinct: ['clientId'],
    });
  },
  /** The line + month pairs the given productions are linked under, to re-spread each
   *  line's included hours after an approval change. */
  lineMonthsOf(tx: Prisma.TransactionClient, ids: string[]) {
    return tx.production.findMany({
      where: { id: { in: ids }, deletedAt: null, clientServiceId: { not: null } },
      select: { clientServiceId: true, period: true },
      distinct: ['clientServiceId', 'period'],
    });
  },
  /** The months the given productions belong to, to check none of them is closed. */
  periodsOf(tx: Prisma.TransactionClient, ids: string[]) {
    return tx.production.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { period: true },
      distinct: ['period'],
    });
  },
  /** One client's productions since a month, newest first. */
  listClientProductions(tx: Prisma.TransactionClient, clientId: string, since: Date) {
    return tx.production.findMany({
      where: { clientId, deletedAt: null, period: { gte: since } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      ...withAttribution,
    });
  },
  /** Set (or clear) the day productions' viáticos were paid back. Rows without a viático
   *  are skipped: there is nothing to pay on them. */
  async markViaticsPaid(tx: Prisma.TransactionClient, ids: string[], paidAt: Date | null): Promise<number> {
    const r = await tx.production.updateMany({
      where: { id: { in: ids }, deletedAt: null, viaticsMinor: { gt: 0 } },
      data: { viaticsPaidAt: paidAt, version: { increment: 1 } },
    });
    return r.count;
  },
  createProduction(tx: Prisma.TransactionClient, data: Prisma.ProductionUncheckedCreateInput) {
    return tx.production.create({ data });
  },
  async updateProduction(
    tx: Prisma.TransactionClient,
    id: string,
    version: number,
    data: Prisma.ProductionUncheckedUpdateInput,
  ): Promise<number> {
    const r = await tx.production.updateMany({
      where: { id, deletedAt: null, version },
      data: { ...data, version: { increment: 1 } },
    });
    return r.count;
  },
  async softDeleteProduction(tx: Prisma.TransactionClient, id: string, version: number): Promise<number> {
    const r = await tx.production.updateMany({
      where: { id, deletedAt: null, version },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    return r.count;
  },

  // ── Fixed expenses ──
  listExpenses(tx: Prisma.TransactionClient, start: Date, end: Date) {
    return tx.fixedExpense.findMany({
      where: { period: { gte: start, lt: end }, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  },
  findExpense(tx: Prisma.TransactionClient, id: string) {
    return tx.fixedExpense.findFirst({ where: { id, deletedAt: null } });
  },
  createExpense(tx: Prisma.TransactionClient, data: Prisma.FixedExpenseUncheckedCreateInput) {
    return tx.fixedExpense.create({ data });
  },
  async updateExpense(
    tx: Prisma.TransactionClient,
    id: string,
    version: number,
    data: Prisma.FixedExpenseUncheckedUpdateInput,
  ): Promise<number> {
    const r = await tx.fixedExpense.updateMany({
      where: { id, deletedAt: null, version },
      data: { ...data, version: { increment: 1 } },
    });
    return r.count;
  },
  async softDeleteExpense(tx: Prisma.TransactionClient, id: string, version: number): Promise<number> {
    const r = await tx.fixedExpense.updateMany({
      where: { id, deletedAt: null, version },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    return r.count;
  },

  // ── Alerts ──
  listAlerts(tx: Prisma.TransactionClient, start: Date, end: Date) {
    return tx.monthlyAlert.findMany({
      where: { period: { gte: start, lt: end }, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  },
  findAlert(tx: Prisma.TransactionClient, id: string) {
    return tx.monthlyAlert.findFirst({ where: { id, deletedAt: null } });
  },
  createAlert(tx: Prisma.TransactionClient, data: Prisma.MonthlyAlertUncheckedCreateInput) {
    return tx.monthlyAlert.create({ data });
  },
  async updateAlert(
    tx: Prisma.TransactionClient,
    id: string,
    version: number,
    data: Prisma.MonthlyAlertUncheckedUpdateInput,
  ): Promise<number> {
    const r = await tx.monthlyAlert.updateMany({
      where: { id, deletedAt: null, version },
      data: { ...data, version: { increment: 1 } },
    });
    return r.count;
  },
  async softDeleteAlert(tx: Prisma.TransactionClient, id: string, version: number): Promise<number> {
    const r = await tx.monthlyAlert.updateMany({
      where: { id, deletedAt: null, version },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    return r.count;
  },
};
