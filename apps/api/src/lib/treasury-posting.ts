/**
 * Treasury posting — move an account's balance when a settlement says where the money
 * went, inside the same transaction as the settlement itself.
 *
 * WHY THIS EXISTS. The Cashflow Posición is `Saldos + Ingresos pendientes − Egresos
 * pendientes`. Registering a cobro took the receivable out of "Ingresos pendientes" and
 * moved no balance, so the position FELL by the amount collected — the number went down
 * when money came in. Naming the destination and moving that balance makes the two halves
 * cancel, and the position simply correct.
 *
 * THE BALANCE IS STILL THE BALANCE. `TreasuryAccount.balance*Minor` stays directly
 * editable: reconciling against the bank is the operator's prerogative and a manual edit
 * must keep winning. The movement row is the audit trail of the automatic half, so a
 * delta between two readings is never unexplained.
 *
 * The increment is a single guarded UPDATE rather than read-modify-write: two settlements
 * posting to one account concurrently must both land, and a read-then-write would lose
 * one of them silently.
 */
import type { Prisma } from '@hold/db';
import { BadRequestError } from './errors.js';

/** Which lane of the account a settlement moves — every lane the `Currency` enum has. */
export type TreasuryLane = 'ARS' | 'USD';

interface PostArgs {
  accountId: string;
  /** The calendar day the money moved — the settlement date, not the write time. */
  date: Date;
  direction: 'inflow' | 'outflow';
  /** The settlement's currency. Anything that is not a lane is refused rather than
   *  silently posted to pesos. */
  currency: string;
  amountMinor: bigint;
  description: string;
  /** What settled. `payoutStatement` is a team payout: unlike the other two it is not a
   *  `Payment`, so nothing else in the system would move a balance for payroll — usually
   *  the month's largest outflow. */
  referenceType: 'receivable' | 'payment' | 'payoutStatement';
  referenceId: string;
  createdByUserId?: string;
}

const LANE_COLUMN: Record<TreasuryLane, 'balanceArsMinor' | 'balanceUsdMinor'> = {
  ARS: 'balanceArsMinor',
  USD: 'balanceUsdMinor',
};

export async function postTreasuryMovement(
  tx: Prisma.TransactionClient,
  e: PostArgs,
): Promise<void> {
  if (e.amountMinor <= 0n) {
    throw new BadRequestError('Movement amount must be positive');
  }
  if (e.currency !== 'ARS' && e.currency !== 'USD') {
    // `currency` is a plain string here (it crosses a module boundary as one), so this
    // stays a real runtime guard even though every `Currency` value now passes it: an
    // unknown lane is refused rather than silently posted to pesos.
    throw new BadRequestError(`Cannot settle a ${e.currency} amount into a treasury account`);
  }
  const lane: TreasuryLane = e.currency;

  // The destination must be a live account; an unknown id reads as absent.
  const account = await tx.treasuryAccount.findFirst({
    where: { id: e.accountId, deletedAt: null },
    select: { id: true, isActive: true },
  });
  if (!account) {
    throw new BadRequestError('treasuryAccountId does not reference an account in this workspace');
  }
  if (!account.isActive) {
    throw new BadRequestError('Cannot settle into an inactive account');
  }

  const signed = e.direction === 'inflow' ? e.amountMinor : -e.amountMinor;
  await tx.treasuryAccount.update({
    where: { id: e.accountId },
    data: {
      [LANE_COLUMN[lane]]: { increment: signed },
      // Bumped so a balance edit prepared BEFORE this movement is rejected as stale
      // rather than overwriting it. That 409 is correct: the operator computed their
      // number against a balance that has since moved.
      version: { increment: 1 },
    },
  });

  await tx.treasuryMovement.create({
    data: {
      accountId: e.accountId,
      date: e.date,
      direction: e.direction,
      lane,
      amountMinor: e.amountMinor,
      description: e.description,
      referenceType: e.referenceType,
      referenceId: e.referenceId,
      ...(e.createdByUserId ? { createdByUserId: e.createdByUserId } : {}),
    },
  });
}
