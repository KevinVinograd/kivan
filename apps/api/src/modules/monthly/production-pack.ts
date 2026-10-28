/**
 * Included production hours on a per-hour line, and the excess billed past them.
 *
 * HOLD sells content production by the hour, and some retainers include a number of those
 * hours: "el servicio de redes incluye 6 h de producción con celular" — if the client gets
 * 7 that month, one is billed (review of 2026-10-21, §1). `ClientService.includedHours`
 * carries the number; this module spreads it over the line's productions.
 *
 * The included hours are per line and per calendar month (the production's `period`), and
 * do not carry over. Each production stores how many of its hours they covered
 * (`packHours`) and bills only the rest at the line's price. So the generator keeps
 * reading one stored amount per production, and a production entirely inside the pack
 * bills 0 and is never offered for a cobro.
 *
 * Who uses the included hours first:
 *  1. productions already on a cobro keep what they were billed with: frozen, like their
 *     amount, because their cobro is already out;
 *  2. then the approved ones, oldest shoot first;
 *  3. then the pending ones, oldest first. Their amount is what they WOULD bill once
 *     approved, never ahead of an approved one: a production nobody has confirmed must not
 *     use up hours a confirmed one is owed — that is the overbilling HOLD's approval step
 *     exists to prevent.
 */
import type { Prisma } from '@hold/db';
import { billingRepo } from '../billing/billing.repo.js';

/** One production as the allocation sees it. */
export interface PackItem {
  id: string;
  hours: number;
  date: Date;
  createdAt: Date;
  status: string;
  /** On a cobro already: its `packHours` is final. */
  billed: boolean;
  packHours: number;
}

/**
 * How many hours of each production the month's included hours cover, by id.
 *
 * Never covers more than `includedHours` in total, and never re-covers what a billed
 * production already used. Pure, so the order rules above are tested without a database.
 */
export function allocatePack(items: readonly PackItem[], includedHours: number): Map<string, number> {
  const covered = new Map<string, number>();
  let left = Math.max(0, includedHours);
  for (const item of items) {
    if (!item.billed) continue;
    covered.set(item.id, item.packHours);
    left -= item.packHours;
  }
  left = Math.max(0, left);
  const pendingLast = (status: string) => (status === 'pending' ? 1 : 0);
  const open = items
    .filter((item) => !item.billed)
    .sort(
      (a, b) =>
        pendingLast(a.status) - pendingLast(b.status) ||
        a.date.getTime() - b.date.getTime() ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );
  for (const item of open) {
    const take = Math.min(Math.max(0, item.hours), left);
    covered.set(item.id, take);
    left -= take;
  }
  return covered;
}

/**
 * What `hours` bill at `priceMinor` an hour, in minor units. A float remainder of a
 * subtraction (2.5 − 2.4999999999) is not an hour anyone worked, so it bills nothing.
 */
export function hourBill(priceMinor: bigint, hours: number): bigint {
  return hours < 1e-9 ? 0n : BigInt(Math.round(Number(priceMinor) * hours));
}

/**
 * Re-spread a per-hour line's included hours over one month and re-bill that month's
 * productions not yet on a cobro. Returns false when the line is not a live per-hour line,
 * which leaves every production on it as it is.
 *
 * Writes only the derived pair (`packHours`, `billAmountMinor`) and leaves `version`
 * alone: a sibling re-billed because another production moved is not an edit of it, and
 * bumping its version would fail the next save of whoever has it open.
 *
 * Serialised on the line (the same row lock a one-time charge takes): two productions
 * saved at once would each read the month without the other and both use the same
 * included hours. And a production the generator puts on a cobro meanwhile is not
 * re-billed under it: the write is conditional on it still being off a cobro.
 */
export async function repriceHourMonth(
  tx: Prisma.TransactionClient,
  clientServiceId: string,
  period: Date,
): Promise<boolean> {
  // Lock BEFORE reading the line: a price change commits under this same lock, and a price
  // read ahead of it would re-bill the month at the old one after the new one landed.
  await billingRepo.lockServiceLine(tx, clientServiceId);
  const line = await tx.clientService.findFirst({
    where: { id: clientServiceId, deletedAt: null },
    select: { billingMode: true, priceMinor: true, includedHours: true },
  });
  if (line?.billingMode !== 'per_hour') return false;
  const rows = await tx.production.findMany({
    where: { clientServiceId, period, deletedAt: null },
    select: {
      id: true, hours: true, date: true, createdAt: true, status: true,
      receivableId: true, packHours: true, billAmountMinor: true,
    },
  });
  const covered = allocatePack(
    rows.map((r) => ({ ...r, billed: r.receivableId !== null })),
    line.includedHours ?? 0,
  );
  for (const r of rows) {
    if (r.receivableId) continue;
    const packHours = covered.get(r.id) ?? 0;
    const billAmountMinor = hourBill(line.priceMinor, r.hours - packHours);
    if (packHours === r.packHours && billAmountMinor === r.billAmountMinor) continue;
    await tx.production.updateMany({ where: { id: r.id, receivableId: null }, data: { packHours, billAmountMinor } });
  }
  return true;
}

/**
 * Re-bill every month in which the line has productions not yet on a cobro — after its
 * price or its included hours change. A billed production keeps its amount: its cobro is
 * already out.
 */
export async function repriceHourLine(tx: Prisma.TransactionClient, clientServiceId: string): Promise<void> {
  const months = await tx.production.groupBy({
    by: ['period'],
    where: { clientServiceId, receivableId: null, deletedAt: null },
  });
  for (const { period } of months) await repriceHourMonth(tx, clientServiceId, period);
}
