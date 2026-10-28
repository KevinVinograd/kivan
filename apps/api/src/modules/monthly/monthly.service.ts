/**
 * Monthly Operation service — the close hub. While a month is open the actuals
 * are DERIVED live from Receivable/PayoutStatement; closing runs the blockers,
 * BAKES the actuals into an immutable versioned snapshot, and locks the month —
 * all atomically. A closed month reads the frozen snapshot, never the live data.
 */
import type { Prisma } from '@hold/db';
import { appendAudit } from '../../lib/audit.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { monthlyRepo } from './monthly.repo.js';
import {
  toMonthRecordDto,
  type ActualsDto,
  type CloseBlockerDto,
  type MonthDetailDto,
  type MonthRecordDto,
} from './monthly.schema.js';

function periodBounds(period: string): { start: Date; end: Date } {
  const [y, m] = period.split('-').map(Number);
  const start = new Date(Date.UTC(y as number, (m as number) - 1, 1));
  const end = new Date(Date.UTC(y as number, m as number, 1));
  return { start, end };
}

async function computeActuals(tx: Prisma.TransactionClient, period: string): Promise<ActualsDto> {
  const { start, end } = periodBounds(period);
  const [recGroups, payGroups, otherLaneCount] = await Promise.all([
    monthlyRepo.receivableActualsByClient(tx, start, end),
    monthlyRepo.payoutActualsByMember(tx, start, end),
    monthlyRepo.countOtherLaneReceivables(tx, start, end),
  ]);

  let recTotal = 0n;
  let recCollected = 0n;
  const byClient = recGroups.map((g) => {
    const total = g._sum.totalAmountMinor ?? 0n;
    const collected = g._sum.collectedAmountMinor ?? 0n;
    recTotal += total;
    recCollected += collected;
    return { clientId: g.clientId, totalBilledMinor: total.toString(), collectedMinor: collected.toString() };
  });

  let payTotal = 0n;
  let payPaid = 0n;
  const byMember = payGroups.map((g) => {
    const total = g._sum.totalAmountMinor ?? 0n;
    const paid = g._sum.paidAmountMinor ?? 0n;
    payTotal += total;
    payPaid += paid;
    return { teamMemberId: g.teamMemberId, totalMinor: total.toString(), paidMinor: paid.toString() };
  });

  return {
    period,
    receivables: {
      count: byClient.length,
      totalBilledMinor: recTotal.toString(),
      totalCollectedMinor: recCollected.toString(),
      otherLaneCount,
      byClient,
    },
    payouts: {
      count: byMember.length,
      totalMinor: payTotal.toString(),
      paidMinor: payPaid.toString(),
      byMember,
    },
  };
}

async function computeBlockers(
  tx: Prisma.TransactionClient,
  period: string,
): Promise<CloseBlockerDto[]> {
  const { start, end } = periodBounds(period);
  const [activity, arcaErrors, draftPayouts] = await Promise.all([
    monthlyRepo.countActivity(tx, start, end),
    monthlyRepo.countArcaErrors(tx, start, end),
    monthlyRepo.countDraftPayouts(tx, start, end),
  ]);
  const blockers: CloseBlockerDto[] = [];
  if (activity === 0) {
    blockers.push({ code: 'empty_month', message: 'No receivables or payout statements in this period', count: 0 });
  }
  if (arcaErrors > 0) {
    blockers.push({ code: 'arca_errors', message: 'Receivables with an ARCA invoicing error', count: arcaErrors });
  }
  if (draftPayouts > 0) {
    blockers.push({ code: 'unapproved_payouts', message: 'Payout statements still in draft', count: draftPayouts });
  }
  return blockers;
}

export const monthlyService = {
  async list(tx: Prisma.TransactionClient): Promise<MonthRecordDto[]> {
    const records = await monthlyRepo.list(tx);
    return records.map(toMonthRecordDto);
  },

  async getBlockers(tx: Prisma.TransactionClient, period: string): Promise<CloseBlockerDto[]> {
    return computeBlockers(tx, period);
  },

  async getDetail(tx: Prisma.TransactionClient, period: string): Promise<MonthDetailDto> {
    const record = await monthlyRepo.findRecord(tx, period);
    const base: MonthRecordDto = record
      ? toMonthRecordDto(record)
      : { id: '', period, label: period, status: 'draft', closedAt: null, closedByUserId: null };

    if (record && record.status === 'closed') {
      const snap = await monthlyRepo.latestSnapshot(tx, record.id);
      const frozen = (snap?.bakedActuals as ActualsDto | undefined) ?? (await computeActuals(tx, period));
      return { ...base, frozen: true, snapshotVersion: snap?.version ?? null, actuals: frozen };
    }
    return { ...base, frozen: false, snapshotVersion: null, actuals: await computeActuals(tx, period) };
  },

  /**
   * Atomic close: ensure + lock the month, re-derive + bake actuals, run the
   * blockers, and only with zero blockers write an immutable versioned snapshot
   * and lock the month — all in one transaction (the snapshot persisted IS the
   * one validated; no TOCTOU). Concurrent closes serialize on the row lock.
   */
  async close(
    tx: Prisma.TransactionClient,
    period: string,
    actorUserId: string,
  ): Promise<MonthDetailDto> {
    const record = await monthlyRepo.ensureRecord(tx, period);
    await monthlyRepo.lockRecord(tx, record.id);
    const fresh = await monthlyRepo.findRecord(tx, period);
    if (fresh && fresh.status === 'closed') {
      throw new ConflictError('Month already closed');
    }
    const blockers = await computeBlockers(tx, period);
    if (blockers.length > 0) {
      throw new ConflictError('Month cannot be closed', { blockers });
    }
    const bakedActuals = await computeActuals(tx, period);
    const version = (await monthlyRepo.maxSnapshotVersion(tx, record.id)) + 1;
    await monthlyRepo.createSnapshot(tx, {
      monthRecordId: record.id,
      version,
      bakedActuals: bakedActuals as unknown as Prisma.InputJsonValue,
      createdByUserId: actorUserId,
    });
    await monthlyRepo.setClosed(tx, record.id, actorUserId);
    await appendAudit(tx, actorUserId, {
      entityType: 'month',
      entityId: record.id,
      action: 'month.closed',
      after: { period, snapshotVersion: version },
    });
    // Tell the other managers. `notify` owns its own failure boundary (see its doc): it
    // swallows a JS-level failure, and a DB-level one would have aborted this transaction
    // before anything here could catch it.
    await notificationsService.notify(tx, actorUserId, {
      type: 'month.closed',
      title: `Se cerró ${period}`,
      body: 'La operación del mes quedó cerrada.',
      entityType: 'month',
    });
    return this.getDetail(tx, period);
  },

  /**
   * Reopen a closed month.
   *
   * `setReopened` CLEARS `closedAt` and `closedByUserId` — the record keeps no trace of
   * the close that just happened — while the confirm dialog promises the operator that
   * reopening "quedará registrado". The audit event below is what makes that true, and
   * it is why this takes an actor: without one, reopening a settled accounting period
   * was the one destructive action in the product that nobody could be asked about.
   */
  async reopen(
    tx: Prisma.TransactionClient,
    period: string,
    actorUserId: string,
  ): Promise<MonthDetailDto> {
    const record = await monthlyRepo.findRecord(tx, period);
    if (!record) {
      throw new NotFoundError(`Month ${period} not found`);
    }
    await monthlyRepo.lockRecord(tx, record.id);
    const fresh = await monthlyRepo.findRecord(tx, period);
    if (!fresh || fresh.status !== 'closed') {
      throw new ConflictError('Only a closed month can be reopened');
    }
    await monthlyRepo.setReopened(tx, record.id);
    // Captured BEFORE the clear would have been lost — `fresh` still carries who closed
    // it and when, and those two columns are about to become null.
    await appendAudit(tx, actorUserId, {
      entityType: 'month',
      entityId: record.id,
      action: 'month.reopened',
      before: { period, closedAt: fresh.closedAt, closedByUserId: fresh.closedByUserId },
    });
    // No notification: `NotificationType` has no `month.reopened`, and adding one drags
    // in the front's label map and its icon. The AUDIT event is what the confirm
    // dialog's promise actually requires; the notification is a separate ask.
    return this.getDetail(tx, period);
  },
};
