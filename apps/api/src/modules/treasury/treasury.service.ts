/**
 * Treasury / Cashflow service. Account + commitment edits enforce optimistic
 * concurrency (the caller's `version` must match, else 409). The position and
 * the 13-week projection are DERIVED read models; lanes (ARS/USD) are never
 * converted into each other.
 */
import type { Prisma } from '@hold/db';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { treasuryRepo } from './treasury.repo.js';
import {
  toAccountDto,
  toCommitmentDto,
  toMovementDto,
  type TreasuryMovementTotalDto,
  type ListMovementsQuery,
  type TreasuryMovementDto,
  type CommittedItemDto,
  type CreateAccountInput,
  type CreateCommitmentInput,
  type LinkedEntityTypeValue,
  type PositionDto,
  type ProjectionDto,
  type ProjectionQuery,
  type TreasuryAccountDto,
  type UpdateAccountInput,
  type UpdateCommitmentInput,
} from './treasury.schema.js';

const WEEK_MS = 7 * 86_400_000;

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * A link must name a row that exists HERE. The columns are plain nullable columns,
 * not foreign keys, so without this a typo or another workspace's id persists happily
 * and then silently never matches an actual — the commitment would read as linked in
 * the register and behave as unlinked in the projection, which is the worst of both.
 *
 * Only fires when the pair is being SET; the schema has already rejected a half-sent
 * pair, and both-null (clearing the link) has nothing to resolve.
 */
async function assertLinkResolves(
  tx: Prisma.TransactionClient,
  input: { linkedEntityType?: LinkedEntityTypeValue | null; linkedEntityId?: string | null },
): Promise<void> {
  const { linkedEntityType: type, linkedEntityId: id } = input;
  if (!type || !id) return;
  if (!(await treasuryRepo.linkedEntityExists(tx, type, id))) {
    throw new BadRequestError(`No ${type} ${id} in this workspace`);
  }
}

interface CommitmentRow {
  direction: string;
  amountMinor: bigint;
  recurrence: string;
  startDate: Date;
  endDate: Date | null;
  anchorDay: number;
}

function generateOccurrences(c: CommitmentRow, windowStart: Date, windowEnd: Date): Date[] {
  const out: Date[] = [];
  const start = startOfDayUTC(c.startDate);
  const end = c.endDate ? startOfDayUTC(c.endDate) : null;
  const within = (d: Date) => d >= windowStart && d < windowEnd && d >= start && (!end || d <= end);

  if (c.recurrence === 'one_time') {
    if (within(start)) out.push(start);
  } else if (c.recurrence === 'weekly') {
    let d = start;
    while (d < windowStart) d = new Date(d.getTime() + WEEK_MS);
    for (; d < windowEnd && (!end || d <= end); d = new Date(d.getTime() + WEEK_MS)) out.push(d);
  } else if (c.recurrence === 'monthly') {
    let y = windowStart.getUTCFullYear();
    let m = windowStart.getUTCMonth();
    for (let k = 0; k < 14; k++) {
      const d = new Date(Date.UTC(y, m, Math.min(c.anchorDay, 28)));
      if (within(d)) out.push(d);
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
  } else if (c.recurrence === 'quarterly' || c.recurrence === 'annual') {
    // Cadence anchored to the start month, stepping every 3 (quarterly) or 12
    // (annual) months on the anchor day — mirrors the front projection engine.
    const stepMonths = c.recurrence === 'quarterly' ? 3 : 12;
    const day = Math.min(c.anchorDay, 28);
    let y = start.getUTCFullYear();
    let m = start.getUTCMonth();
    let d = new Date(Date.UTC(y, m, day));
    while (d < windowStart) {
      m += stepMonths;
      y += Math.floor(m / 12);
      m %= 12;
      d = new Date(Date.UTC(y, m, day));
    }
    for (; d < windowEnd && (!end || d <= end); ) {
      if (d >= start) out.push(d);
      m += stepMonths;
      y += Math.floor(m / 12);
      m %= 12;
      d = new Date(Date.UTC(y, m, day));
    }
  }
  return out;
}

export const treasuryService = {
  async listAccounts(tx: Prisma.TransactionClient): Promise<TreasuryAccountDto[]> {
    return (await treasuryRepo.listAccounts(tx)).map(toAccountDto);
  },

  async createAccount(
    tx: Prisma.TransactionClient,
    input: CreateAccountInput,
  ): Promise<TreasuryAccountDto> {
    const created = await treasuryRepo.createAccount(tx, { ...input });
    return toAccountDto(created);
  },

  async updateAccount(
    tx: Prisma.TransactionClient,
    id: string,
    input: UpdateAccountInput,
  ): Promise<TreasuryAccountDto> {
    const { version, ...fields } = input;
    const affected = await treasuryRepo.updateAccount(tx, id, version, fields);
    if (affected === 0) {
      const exists = await treasuryRepo.findAccount(tx, id);
      if (!exists) {
        throw new NotFoundError(`Treasury account ${id} not found`);
      }
      throw new ConflictError('Stale version — reload the account and retry');
    }
    const updated = await treasuryRepo.findAccount(tx, id);
    return toAccountDto(updated!);
  },

  async deleteAccount(
    tx: Prisma.TransactionClient,
    id: string,
    version: number,
  ): Promise<{ deleted: true }> {
    const affected = await treasuryRepo.softDeleteAccount(tx, id, version);
    if (affected === 0) {
      const exists = await treasuryRepo.findAccount(tx, id);
      if (!exists) {
        throw new NotFoundError(`Treasury account ${id} not found`);
      }
      throw new ConflictError('Stale version — reload the account and retry');
    }
    return { deleted: true };
  },

  async listCommitments(tx: Prisma.TransactionClient): Promise<CommittedItemDto[]> {
    return (await treasuryRepo.listCommitments(tx)).map(toCommitmentDto);
  },

  async createCommitment(
    tx: Prisma.TransactionClient,
    input: CreateCommitmentInput,
  ): Promise<CommittedItemDto> {
    await assertLinkResolves(tx, input);
    const created = await treasuryRepo.createCommitment(tx, { ...input, source: 'manual' });
    return toCommitmentDto(created);
  },

  async updateCommitment(
    tx: Prisma.TransactionClient,
    id: string,
    input: UpdateCommitmentInput,
  ): Promise<CommittedItemDto> {
    const { version, ...fields } = input;
    await assertLinkResolves(tx, fields);
    const affected = await treasuryRepo.updateCommitment(tx, id, version, fields);
    if (affected === 0) {
      const exists = await treasuryRepo.findCommitment(tx, id);
      if (!exists) {
        throw new NotFoundError(`Committed item ${id} not found`);
      }
      throw new ConflictError('Stale version — reload the commitment and retry');
    }
    const updated = await treasuryRepo.findCommitment(tx, id);
    return toCommitmentDto(updated!);
  },

  async deleteCommitment(
    tx: Prisma.TransactionClient,
    id: string,
    version: number,
  ): Promise<{ deleted: true }> {
    const affected = await treasuryRepo.softDeleteCommitment(tx, id, version);
    if (affected === 0) {
      const exists = await treasuryRepo.findCommitment(tx, id);
      if (!exists) {
        throw new NotFoundError(`Committed item ${id} not found`);
      }
      throw new ConflictError('Stale version — reload the commitment and retry');
    }
    return { deleted: true };
  },

  /**
   * The automatic movements behind the current balances.
   *
   * Provenance only. The movements are already applied to `TreasuryAccount.balance*`,
   * so the position must NOT add them on top — that double-counts, which is the exact
   * mistake a previous attempt at this made and measured in production numbers.
   */
  async movements(
    tx: Prisma.TransactionClient,
    query: ListMovementsQuery,
  ): Promise<{ items: TreasuryMovementDto[]; totals: TreasuryMovementTotalDto[] }> {
    const [rows, sums] = await Promise.all([
      treasuryRepo.listMovements(tx, query.from, query.limit),
      treasuryRepo.sumMovements(tx, query.from),
    ]);
    return {
      items: rows.map(toMovementDto),
      // Read by the Saldos note. Computed over every movement, not over `rows`, which
      // stops at `limit` — a sum of a truncated page is a wrong number, not a partial one.
      totals: sums.map((s) => ({
        accountId: s.accountId,
        lane: s.lane,
        direction: s.direction,
        amountMinor: (s._sum.amountMinor ?? 0n).toString(),
      })),
    };
  },

  async position(tx: Prisma.TransactionClient): Promise<PositionDto> {
    const { operating, reserve } = await treasuryRepo.positionSums(tx);
    const lane = (op: bigint | null, res: bigint | null) => {
      const o = op ?? 0n;
      const r = res ?? 0n;
      return { operatingMinor: o.toString(), reserveMinor: r.toString(), totalMinor: (o + r).toString() };
    };
    return {
      ars: lane(operating.balanceArsMinor ?? null, reserve.balanceArsMinor ?? null),
      usd: lane(operating.balanceUsdMinor ?? null, reserve.balanceUsdMinor ?? null),
    };
  },

  async projection(tx: Prisma.TransactionClient, query: ProjectionQuery): Promise<ProjectionDto> {
    const { lane, weeks } = query;
    const windowStart = startOfDayUTC(query.from ?? new Date());
    const windowEnd = new Date(windowStart.getTime() + weeks * WEEK_MS);

    const { operating } = await treasuryRepo.positionSums(tx);
    const startingBalance =
      lane === 'ARS' ? (operating.balanceArsMinor ?? 0n) : (operating.balanceUsdMinor ?? 0n);

    const commitments = await treasuryRepo.listActiveCommitments(tx, lane);
    const inflow = Array.from({ length: weeks }, () => 0n);
    const outflow = Array.from({ length: weeks }, () => 0n);
    for (const c of commitments) {
      for (const occ of generateOccurrences(c, windowStart, windowEnd)) {
        const wi = Math.floor((occ.getTime() - windowStart.getTime()) / WEEK_MS);
        if (wi < 0 || wi >= weeks) continue;
        if (c.direction === 'inflow') {
          inflow[wi] = (inflow[wi] as bigint) + c.amountMinor;
        } else {
          outflow[wi] = (outflow[wi] as bigint) + c.amountMinor;
        }
      }
    }

    let balance = startingBalance;
    const weeksDto = inflow.map((inMinor, i) => {
      const net = (inMinor as bigint) - (outflow[i] as bigint);
      balance += net;
      return {
        weekStart: new Date(windowStart.getTime() + i * WEEK_MS).toISOString().slice(0, 10),
        inflowMinor: (inMinor as bigint).toString(),
        outflowMinor: (outflow[i] as bigint).toString(),
        netMinor: net.toString(),
        endBalanceMinor: balance.toString(),
      };
    });

    return { lane, startingBalanceMinor: startingBalance.toString(), weeks: weeksDto };
  },
};
