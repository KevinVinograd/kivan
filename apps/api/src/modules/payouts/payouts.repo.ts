/**
 * PayoutStatement repository. Runs on the `tx` from runInTx.
 * Lifecycle transitions and the paid register are guarded conditional writes
 * (atomic, no TOCTOU).
 */
import type { Prisma } from '@hold/db';
import { PAID_PRODUCTION_STATUSES } from '../monthly/monthly-plan.schema.js';

const withAdjustments = {
  include: { adjustments: { orderBy: { createdAt: 'asc' } } },
} satisfies Prisma.PayoutStatementDefaultArgs;

export const payoutsRepo = {
  findTeamMember(tx: Prisma.TransactionClient, id: string) {
    return tx.teamMember.findFirst({ where: { id, deletedAt: null } });
  },

  findByMemberPeriod(
    tx: Prisma.TransactionClient,
    teamMemberId: string,
    period: Date,
  ) {
    return tx.payoutStatement.findUnique({
      where: { teamMemberId_period: { teamMemberId, period } },
    });
  },

  upsert(
    tx: Prisma.TransactionClient,
    teamMemberId: string,
    period: Date,
    plan: Prisma.PayoutStatementUncheckedUpdateInput,
  ) {
    return tx.payoutStatement.upsert({
      where: { teamMemberId_period: { teamMemberId, period } },
      create: { ...(plan as Prisma.PayoutStatementUncheckedCreateInput), teamMemberId, period },
      update: plan,
    });
  },

  findById(tx: Prisma.TransactionClient, id: string) {
    return tx.payoutStatement.findFirst({ where: { id, deletedAt: null }, ...withAdjustments });
  },

  /**
   * How much this statement has already been CHARGED to the colaboradora's account.
   *
   * Restricted to `charge` and `adjustment`. The paid register posts a `payment` credit
   * carrying the SAME `referenceType`/`referenceId`, so summing every entry for the
   * statement would net the charge against its own payment and report zero — which reads
   * as "nothing charged yet" and posts the charge a second time on the next edit.
   */
  async chargedMinorFor(tx: Prisma.TransactionClient, statementId: string): Promise<bigint> {
    const sums = await tx.ledgerEntry.aggregate({
      _sum: { debitMinor: true, creditMinor: true },
      where: {
        referenceType: 'payoutStatement',
        referenceId: statementId,
        type: { in: ['charge', 'adjustment'] },
      },
    });
    return (sums._sum.debitMinor ?? 0n) - (sums._sum.creditMinor ?? 0n);
  },

  /**
   * Hours this member has ATTRIBUTED to them across the period's productions.
   *
   * Rows whose `hours` is null are counted by `attributed` but contribute
   * nothing to `hours` — they are productions the member demonstrably worked
   * whose split was never recorded. The caller needs both numbers to tell
   * "worked no hours" from "we do not know how many", and `recorded` is what
   * separates them: 0 means nothing is known and the statement must record no
   * hours at all rather than a confident zero.
   */
  async attributedHours(
    tx: Prisma.TransactionClient,
    teamMemberId: string,
    start: Date,
    end: Date,
  ): Promise<{ hours: number; recorded: number; attributed: number }> {
    const rows = await tx.productionParticipant.findMany({
      where: {
        teamMemberId,
        // Hours count once the production is approved (or already billed): HOLD pays a
        // production only after the communication lead confirms it happened.
        production: { period: { gte: start, lt: end }, deletedAt: null, status: { in: [...PAID_PRODUCTION_STATUSES] } },
      },
      select: { hours: true },
    });
    const withHours = rows.filter((r): r is { hours: number } => r.hours !== null);
    return {
      hours: withHours.reduce((sum, r) => sum + r.hours, 0),
      recorded: withHours.length,
      attributed: rows.length,
    };
  },

  async list(
    tx: Prisma.TransactionClient,
    where: Prisma.PayoutStatementWhereInput,
    limit: number,
    offset: number,
  ) {
    const [items, total] = await Promise.all([
      tx.payoutStatement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        ...withAdjustments,
      }),
      tx.payoutStatement.count({ where }),
    ]);
    return { items, total };
  },

  createAdjustment(tx: Prisma.TransactionClient, data: Prisma.TeamAdjustmentUncheckedCreateInput) {
    return tx.teamAdjustment.create({ data });
  },

  /** Recompute adjustmentsTotal + total = base + productions + viatics + adjustments. */
  async recomputeTotals(tx: Prisma.TransactionClient, id: string) {
    const agg = await tx.teamAdjustment.aggregate({
      _sum: { amountMinor: true },
      where: { payoutStatementId: id },
    });
    const adjustmentsTotal = agg._sum.amountMinor ?? 0n;
    const s = await tx.payoutStatement.findUnique({ where: { id } });
    if (!s) {
      return null;
    }
    const total =
      s.baseAmountMinor + s.productionsAmountMinor + s.viaticsAmountMinor + adjustmentsTotal;
    return tx.payoutStatement.update({
      where: { id },
      data: {
        adjustmentsTotalMinor: adjustmentsTotal,
        totalAmountMinor: total,
        version: { increment: 1 },
      },
      ...withAdjustments,
    });
  },

  /** Guarded lifecycle transition: applies only from the expected status. */
  async transition(
    tx: Prisma.TransactionClient,
    id: string,
    from: string,
    to: string,
    extra: Prisma.PayoutStatementUncheckedUpdateInput = {},
  ): Promise<number> {
    const res = await tx.payoutStatement.updateMany({
      where: { id, deletedAt: null, statementStatus: from },
      data: { statementStatus: to, version: { increment: 1 }, ...extra },
    });
    return res.count;
  },

  /** ATOMIC payout register: guarded UPDATE, never overpays. */
  async registerPayout(
    tx: Prisma.TransactionClient,
    id: string,
    amount: bigint,
    /** 'YYYY-MM-DD'. A STRING, deliberately: binding a Date makes Postgres cast a
     *  timestamptz to date in the session timezone, and any zone west of UTC turns
     *  midnight-UTC into the previous day — the exact off-by-one this column exists to
     *  avoid. A text literal cast to date carries no zone to get wrong. */
    paidAt: string | undefined,
    /** The account the money left from, or undefined for a register that names none.
     *  COALESCEd like `paidAt` and for the same reason: /team's dateless "Pagar
     *  diferencia" must not blank the account the first register recorded. */
    treasuryAccountId: string | undefined,
  ): Promise<number> {
    // COALESCE: a register that names no day changes nothing, so /team's dateless
    // "Pagar diferencia" cannot erase a day someone recorded. A register that DOES name
    // one overwrites — last dated wins. That is a real limitation and not a subtlety:
    // one column cannot describe a payout made in two instalments, and
    // `account-ledger-mock-data.ts` posts the WHOLE amount on whatever day it holds. A
    // split payout therefore reports entirely on its last date. Per-register dates need
    // their own table.
    return tx.$executeRaw`
      UPDATE "PayoutStatement"
      SET "paidAmountMinor" = "paidAmountMinor" + ${amount},
          "paidAt" = COALESCE(${paidAt ?? null}::date, "paidAt"),
          "treasuryAccountId" = COALESCE(${treasuryAccountId ?? null}::uuid, "treasuryAccountId"),
          "version" = "version" + 1,
          "updatedAt" = now()
      WHERE "id" = ${id}::uuid
        AND "deletedAt" IS NULL
        AND ${amount} > 0
        AND "paidAmountMinor" + ${amount} <= "totalAmountMinor"`;
  },
};
