/**
 * Cuentas corrientes — append-only ledger writer. Each money operation calls
 * this inside its own transaction (runInTx), so a ledger entry commits
 * atomically with the effect it records and can never drift.
 *
 * Appends for one account AND LANE (entityType, entityId, currency) are serialized via
 * a transaction-scoped advisory lock, so the running `balanceMinor` (cumulative
 * debit − credit) is always consistent. Rows are append-only; corrections are
 * reversing entries.
 *
 * The lane is part of the account. Without it, a pago in dollars to a provider owed
 * pesos netted dollars against the peso balance, and the /pagos detail rendered that as
 * "Saldo al cierre" for an operator to reconcile against a bank.
 */
import type { Currency } from '@hold/shared';
import type { Prisma } from '@hold/db';

export type LedgerEntityType = 'client' | 'teamMember' | 'provider';
export type LedgerType = 'charge' | 'collection' | 'generated' | 'payment' | 'adjustment' | 'reversal';

interface AppendArgs {
  entityType: LedgerEntityType;
  entityId: string;
  /**
   * REQUIRED, and deliberately not defaulted. A default here would let a new caller
   * silently file a dollar movement onto the peso balance, which is exactly the defect
   * this field exists to close: the compiler must ask.
   */
  currency: Currency;
  period: Date;
  type: LedgerType;
  description: string;
  debitMinor?: bigint;
  creditMinor?: bigint;
  referenceType?: string;
  referenceId?: string;
  invoiceNumber?: string;
  createdByUserId?: string;
}

export async function appendLedger(
  tx: Prisma.TransactionClient,
  e: AppendArgs,
): Promise<void> {
  // The lane is in the lock key and in the predicate below. Two lanes of one account
  // hold independent balances, so appends to different lanes need not serialize.
  const lockKey = `${e.entityType}:${e.entityId}:${e.currency}`;
  // (int4, int4) advisory-lock signature; hashtext(text) → int4.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}), 0)`;

  const last = await tx.ledgerEntry.findFirst({
    where: { entityType: e.entityType, entityId: e.entityId, currency: e.currency },
    orderBy: { seq: 'desc' },
    select: { balanceMinor: true },
  });
  const debit = e.debitMinor ?? 0n;
  const credit = e.creditMinor ?? 0n;
  const balance = (last?.balanceMinor ?? 0n) + debit - credit;

  await tx.ledgerEntry.create({
    data: {
      entityType: e.entityType,
      entityId: e.entityId,
      currency: e.currency,
      period: e.period,
      type: e.type,
      description: e.description,
      debitMinor: debit,
      creditMinor: credit,
      balanceMinor: balance,
      ...(e.referenceType ? { referenceType: e.referenceType } : {}),
      ...(e.referenceId ? { referenceId: e.referenceId } : {}),
      ...(e.invoiceNumber ? { invoiceNumber: e.invoiceNumber } : {}),
      ...(e.createdByUserId ? { createdByUserId: e.createdByUserId } : {}),
    },
  });
}

/** Map a payment recipient to its ledger account, or null if it has no entity. */
export function paymentLedgerEntity(p: {
  recipientType: string;
  teamMemberId: string | null;
  providerId: string | null;
}): { entityType: LedgerEntityType; entityId: string } | null {
  if (p.recipientType === 'provider' && p.providerId) {
    return { entityType: 'provider', entityId: p.providerId };
  }
  if ((p.recipientType === 'collaborator' || p.recipientType === 'employee') && p.teamMemberId) {
    return { entityType: 'teamMember', entityId: p.teamMemberId };
  }
  return null;
}
