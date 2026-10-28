/**
 * PayoutStatement service — reconciles the plan amounts into a server-derived
 * total, manages the approve→dispatch→confirm lifecycle (guarded transitions),
 * and the atomic + idempotent paid register. Plan amounts are set explicitly for
 * now (activity-derived plan lands with P4).
 */
import type { Prisma } from '@hold/db';
import { INT8_MAX } from '@hold/shared';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { tryRecordIdempotencyKey } from '../../lib/idempotency.js';
import { appendLedger } from '../../lib/ledger.js';
import { postTreasuryMovement } from '../../lib/treasury-posting.js';
import { payoutsRepo } from './payouts.repo.js';
import {
  toPayoutStatementDto,
  type AddAdjustmentInput,
  type ListPayoutsQuery,
  type PaginatedPayoutsDto,
  type PayoutStatementDto,
  type UpsertPayoutInput,
} from './payouts.schema.js';

function monthBoundsOf(date: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start, end };
}

/**
 * The compensation models for which an hourly rate is a real, agreed number.
 * `monthly_fixed` and `per_production` are deliberately absent: dividing their
 * pay by a count of hours yields an implied rate nobody ever agreed to, and
 * printing that as "Valor hora" is the fabrication this work exists to remove.
 */
const HOURLY_COMPENSATION_MODELS = new Set(['hourly', 'mixed']);

/**
 * hours x rate, in minor units, bounded like every other amount.
 *
 * The Zod codecs reject over-range money at the edge so it is a 400 and not a
 * 500 on insert — but a value DERIVED server-side never passes through them. A
 * large rate times any hours overflows Postgres BIGINT and the insert dies with
 * an opaque 500 on a payroll write, so the bound is re-applied here.
 *
 * The multiplication goes through Number: hours is a float, so there is no
 * exact bigint form of it. That is fine at real magnitudes and checked at
 * unreal ones — beyond 2^53 the product is refused rather than rounded.
 */
function derivedProductions(hours: number, rate: bigint): bigint {
  const product = Math.round(hours * Number(rate));
  if (!Number.isFinite(product) || !Number.isSafeInteger(product)) {
    throw new BadRequestError('hourly rate is too large to derive this statement');
  }
  const asMinor = BigInt(product);
  if (asMinor > INT8_MAX) {
    throw new BadRequestError('hourly rate is too large to derive this statement');
  }
  return asMinor;
}

/**
 * Keep the colaboradora's running account in step with what her statement says she is
 * owed.
 *
 * WHY THIS EXISTS. A `Payment` posts a CHARGE when it is created and a CREDIT when it is
 * paid, so the account nets to zero. A statement posted only the credit — the "owed" half
 * was never recorded anywhere — so every liquidación ever paid drove the balance further
 * negative, as if the studio had overpaid. Measured on a live workspace: -402.000 against
 * a team that had been paid exactly what it was owed.
 *
 * ONCE COMMITTED TO, not on create. A draft is a working figure the operator is still
 * assembling; charging it would put a number on the account nobody has agreed to. Approval
 * is the obvious commitment — and it is NOT the only one. The register does not require an
 * approved statement, and on the live workspace this was found against, every statement was
 * still `draft` and one had already been part-paid. Paying is the strongest commitment
 * there is, so money registered against a statement charges it too. Charging on approval
 * alone would have missed 100% of the real rows.
 *
 * BY DELTA, not once. The total keeps moving after approval — `addAdjustment` allows it up
 * to `confirmed` and `upsert` has no status guard at all — so a single charge at approve
 * goes stale the first time anyone edits. This posts the difference between what the
 * statement now says and what has already been charged, which also makes it idempotent:
 * called twice with nothing changed, it posts nothing.
 */
async function syncStatementCharge(
  tx: Prisma.TransactionClient,
  statementId: string,
): Promise<void> {
  const s = await payoutsRepo.findById(tx, statementId);
  if (!s) {
    return;
  }
  if (s.statementStatus === 'draft' && s.paidAmountMinor === 0n) {
    return;
  }
  const charged = await payoutsRepo.chargedMinorFor(tx, statementId);
  const delta = s.totalAmountMinor - charged;
  if (delta === 0n) {
    return;
  }
  await appendLedger(tx, {
    entityType: 'teamMember',
    entityId: s.teamMemberId,
    // Pesos by construction: `PayoutStatement` carries no currency column, so a
    // liquidación in another lane is not representable. A stated assumption, not a
    // guess, and the place to change when that column exists.
    currency: 'ARS',
    period: s.period,
    // The first one IS the liquidación; later ones correct it. The ledger is append-only
    // by contract, so a reduction is a credit entry rather than a rewritten row.
    type: charged === 0n ? 'charge' : 'adjustment',
    ...(delta > 0n ? { debitMinor: delta } : { creditMinor: -delta }),
    description: charged === 0n ? 'Liquidación' : 'Ajuste de liquidación',
    referenceType: 'payoutStatement',
    referenceId: s.id,
  });
}

export const payoutsService = {
  async list(tx: Prisma.TransactionClient, query: ListPayoutsQuery): Promise<PaginatedPayoutsDto> {
    const where: Prisma.PayoutStatementWhereInput = {
      deletedAt: null,
      ...(query.status ? { statementStatus: query.status } : {}),
      ...(query.teamMemberId ? { teamMemberId: query.teamMemberId } : {}),
      ...(query.period
        ? (() => {
            const { start, end } = monthBoundsOf(query.period);
            return { period: { gte: start, lt: end } };
          })()
        : {}),
    };
    const { items, total } = await payoutsRepo.list(tx, where, query.limit, query.offset);
    return { items: items.map(toPayoutStatementDto), total, limit: query.limit, offset: query.offset };
  },

  async getById(tx: Prisma.TransactionClient, id: string): Promise<PayoutStatementDto> {
    const s = await payoutsRepo.findById(tx, id);
    if (!s) {
      throw new NotFoundError(`Payout statement ${id} not found`);
    }
    return toPayoutStatementDto(s);
  },

  /** Create or update the plan amounts for (member, period), then re-derive the total. */
  async upsert(
    tx: Prisma.TransactionClient,
    input: UpsertPayoutInput,
  ): Promise<PayoutStatementDto> {
    const member = await payoutsRepo.findTeamMember(tx, input.teamMemberId);
    if (!member) {
      throw new BadRequestError('teamMemberId does not reference a member in this workspace');
    }

    // ── What the month's attributed productions say this member worked ──────
    const { start, end } = monthBoundsOf(input.period);
    const worked = await payoutsRepo.attributedHours(tx, input.teamMemberId, start, end);
    const rate =
      input.hourlyRateMinor ??
      (HOURLY_COMPENSATION_MODELS.has(member.compensationModel) ? member.hourlyRateMinor : null);

    // `recorded === 0` means no attribution carries hours — which is NOT the
    // same as having worked none. Record null so the detail can say "sin
    // registrar"; a confident 0 would be indistinguishable from a real zero.
    const hoursTotal = worked.recorded > 0 ? worked.hours : null;

    // Derive the productions amount from hours x rate ONLY when the statement
    // is being CREATED, both figures are answerable, and the caller did not
    // type an amount in the same call.
    //
    // The create-only rule is the guard against silent restatement: once a
    // statement exists, someone may have adjusted its productions by hand for a
    // reason no attribution knows about, and re-deriving on every later edit
    // (a viáticos tweak, a bank-data fix) would quietly overwrite that. An
    // explicit productionsAmountMinor always wins for the same reason.
    const existing = await payoutsRepo.findByMemberPeriod(
      tx,
      input.teamMemberId,
      input.period,
    );
    const derivedProductionsMinor =
      existing === null &&
      hoursTotal !== null &&
      rate !== null &&
      input.productionsAmountMinor === undefined
        ? derivedProductions(hoursTotal, rate)
        : undefined;

    const plan: Prisma.PayoutStatementUncheckedUpdateInput = {
      ...(input.baseAmountMinor !== undefined ? { baseAmountMinor: input.baseAmountMinor } : {}),
      ...(input.productionsAmountMinor !== undefined
        ? { productionsAmountMinor: input.productionsAmountMinor }
        : derivedProductionsMinor !== undefined
          ? { productionsAmountMinor: derivedProductionsMinor }
          : {}),
      ...(input.viaticsAmountMinor !== undefined
        ? { viaticsAmountMinor: input.viaticsAmountMinor }
        : {}),
      // hoursTotal is always rewritten, null included: it DESCRIBES the current
      // attribution, so a correction to who worked what has to show, and an
      // attribution that goes away must take the recorded hours with it rather
      // than leave a stale figure on screen. It decides no money after create,
      // so refreshing it is free.
      hoursTotal,
      // The rate is the opposite kind of fact: "what an hour was worth WHEN this
      // was liquidated" is history, not a live mirror of the member's card.
      // Raising someone's rate in March must not silently restate February. So
      // it is written only when explicitly supplied, or when the statement is
      // being created — never re-derived, and never erased by an unrelated edit.
      ...(input.hourlyRateMinor !== undefined
        ? { hourlyRateMinor: input.hourlyRateMinor }
        : existing === null
          ? { hourlyRateMinor: rate }
          : {}),
      ...(input.bankId !== undefined ? { bankId: input.bankId } : {}),
      ...(input.bankProfile ? { bankProfile: input.bankProfile as Prisma.InputJsonValue } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
    };
    const upserted = await payoutsRepo.upsert(tx, input.teamMemberId, input.period, plan);
    const recomputed = await payoutsRepo.recomputeTotals(tx, upserted.id);
    // `upsert` carries NO status guard, so it can restate an approved statement's plan
    // amounts. The charge follows the total wherever it moves, or the account silently
    // keeps the figure the statement had at approval.
    await syncStatementCharge(tx, upserted.id);
    return toPayoutStatementDto(recomputed ?? upserted);
  },

  async addAdjustment(
    tx: Prisma.TransactionClient,
    statementId: string,
    input: AddAdjustmentInput,
  ): Promise<PayoutStatementDto> {
    const s = await payoutsRepo.findById(tx, statementId);
    if (!s) {
      throw new NotFoundError(`Payout statement ${statementId} not found`);
    }
    if (s.statementStatus === 'confirmed') {
      throw new ConflictError('Cannot adjust a confirmed statement');
    }
    // A negative adjustment must not push the total below what's already been
    // paid (that would report a phantom over-payment / negative outstanding).
    const prospectiveTotal =
      s.baseAmountMinor +
      s.productionsAmountMinor +
      s.viaticsAmountMinor +
      s.adjustmentsTotalMinor +
      input.amountMinor;
    if (prospectiveTotal < s.paidAmountMinor) {
      throw new BadRequestError('Adjustment would drop the total below the amount already paid');
    }
    await payoutsRepo.createAdjustment(tx, {
      payoutStatementId: statementId,
      description: input.description,
      amountMinor: input.amountMinor,
    });
    const recomputed = await payoutsRepo.recomputeTotals(tx, statementId);
    // An adjustment on an already-approved statement changes what she is owed, so the
    // account has to move with it. No-op while the statement is still a draft.
    await syncStatementCharge(tx, statementId);
    return toPayoutStatementDto(recomputed ?? s);
  },

  async transition(
    tx: Prisma.TransactionClient,
    id: string,
    from: string,
    to: string,
    extra: Prisma.PayoutStatementUncheckedUpdateInput = {},
  ): Promise<PayoutStatementDto> {
    const applied = await payoutsRepo.transition(tx, id, from, to, extra);
    if (applied === 0) {
      const exists = await payoutsRepo.findById(tx, id);
      if (!exists) {
        throw new NotFoundError(`Payout statement ${id} not found`);
      }
      throw new ConflictError(`Statement is not in '${from}' state (cannot move to '${to}')`);
    }
    return this.getById(tx, id);
  },

  async approve(
    tx: Prisma.TransactionClient,
    id: string,
    actorUserId: string,
  ): Promise<PayoutStatementDto> {
    const approved = await this.transition(tx, id, 'draft', 'approved', {
      approvedAt: new Date(),
      approvedByUserId: actorUserId,
    });
    // After the guarded transition, so it runs exactly once per statement: a second
    // approve is a 409 and never reaches here.
    await syncStatementCharge(tx, id);
    return approved;
  },

  dispatch(tx: Prisma.TransactionClient, id: string): Promise<PayoutStatementDto> {
    return this.transition(tx, id, 'approved', 'dispatched');
  },

  confirm(tx: Prisma.TransactionClient, id: string): Promise<PayoutStatementDto> {
    return this.transition(tx, id, 'dispatched', 'confirmed');
  },

  /** Atomic, idempotent payout register (no overpay). */
  async register(
    tx: Prisma.TransactionClient,
    id: string,
    amount: bigint,
    opts: { idempotencyKey?: string; paidAt?: string; treasuryAccountId?: string; userId?: string } = {},
  ): Promise<PayoutStatementDto> {
    if (amount <= 0n) {
      throw new BadRequestError('Payout amount must be positive');
    }
    if (opts.idempotencyKey) {
      const fresh = await tryRecordIdempotencyKey(tx, `payout:${id}`, opts.idempotencyKey);
      if (!fresh) {
        return this.getById(tx, id);
      }
    }
    // Already a 'YYYY-MM-DD' day: the schema takes a day-shaped string precisely so no
    // Date, and therefore no timezone, sits between the operator and the column.
    // The statement is resolved BEFORE anything is written, so `affected === 0` below can
    // only mean overpay. An unknown payout has to read as a 404 about the payout, and
    // asking afterwards would report it as whatever the first write happened to fail on.
    const before = await payoutsRepo.findById(tx, id);
    if (!before) {
      throw new NotFoundError(`Payout statement ${id} not found`);
    }

    if (opts.treasuryAccountId) {
      // Payroll is usually the month's largest outflow, and until now it moved no balance
      // at all: a `PayoutStatement` is not a `Payment`, so nothing else in the system would
      // ever post it. Same contract as a cobro or a pago — naming the account moves it,
      // naming none moves nothing.
      //
      // BEFORE the register, exactly as `billingService` does it: this is the step that
      // validates the destination and reports an unknown one as a 400. Running it after
      // would let the register's raw UPDATE hit the column's foreign key first, and an FK
      // violation surfaces as an opaque 500 rather than a 400 naming the account.
      const member = await payoutsRepo.findTeamMember(tx, before.teamMemberId);
      await postTreasuryMovement(tx, {
        accountId: opts.treasuryAccountId,
        // The day the operator says the money left, falling back to now for a register
        // that named none — the same fallback `billingService` uses for a cobro.
        date: opts.paidAt ? new Date(`${opts.paidAt}T00:00:00Z`) : new Date(),
        direction: 'outflow',
        // `PayoutStatement` carries no currency column: a liquidación is pesos.
        currency: 'ARS',
        amountMinor: amount,
        description: `Liquidación ${member?.name ?? ''}`.trim(),
        referenceType: 'payoutStatement',
        referenceId: before.id,
        ...(opts.userId ? { createdByUserId: opts.userId } : {}),
      });
    }

    const affected = await payoutsRepo.registerPayout(tx, id, amount, opts.paidAt, opts.treasuryAccountId);
    if (affected === 0) {
      // One transaction: this rolls back the movement posted just above, so an overpay
      // never leaves a balance moved for money the statement refused.
      throw new ConflictError('Payout would exceed the statement total');
    }
    const s = await payoutsRepo.findById(tx, id);
    if (s) {
      // BEFORE the credit below. A payment against a still-draft statement is what
      // commits the studio to the amount, and the account has to read in that order:
      // generated, then paid. Posting the credit first would show a payment against
      // nothing until the next entry landed.
      await syncStatementCharge(tx, id);
      await appendLedger(tx, {
        entityType: 'teamMember',
        entityId: s.teamMemberId,
        // Pesos by construction, as in `syncStatementCharge` above.
        currency: 'ARS',
        period: s.period,
        type: 'payment',
        creditMinor: amount,
        description: 'Liquidación',
        referenceType: 'payoutStatement',
        referenceId: s.id,
      });
    }
    return this.getById(tx, id);
  },
};
