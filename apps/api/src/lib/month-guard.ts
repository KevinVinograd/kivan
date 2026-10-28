/**
 * Closed-month plan guard. Closing a month persists MonthRecord.status='closed' and
 * BAKES an immutable snapshot of the money actuals (receivables + payouts) — see
 * monthly.service `computeActuals`. Those actuals stay LIVE by design (a late cobro
 * or pago still records; the frozen snapshot, not the live record, is what the closed
 * month reports — snapshot-freeze). The monthly PLAN, however — productions, expenses,
 * alerts, and the close checklist — is NOT baked into the snapshot, so a post-close
 * edit would silently drift the closed month's reported profitability. This guard is
 * called at the top of every plan write (monthly-plan.service) so a closed month
 * freezes its plan: reopen it to edit. Money write paths deliberately do NOT call it.
 *
 * `period` alone identifies the MonthRecord (the model is unique on period). An ABSENT record means the month was never
 * closed, i.e. open; only `status === 'closed'` blocks. `draft` / `review` /
 * `reopened` are all open.
 */
import type { Prisma } from '@hold/db';
import { ConflictError } from './errors.js';

/** period is 'YYYY-MM'. Throws ConflictError (409) when that month is closed. */
export async function assertMonthOpen(tx: Prisma.TransactionClient, period: string): Promise<void> {
  const rec = await tx.monthRecord.findFirst({ where: { period } });
  if (rec?.status === 'closed') {
    throw new ConflictError(`Month ${period} is closed — reopen it to make changes`);
  }
}

/** Derive the 'YYYY-MM' period key from a Date column (Receivable/Payment/… .period). */
export function periodKeyOf(date: Date): string {
  return date.toISOString().slice(0, 7);
}
