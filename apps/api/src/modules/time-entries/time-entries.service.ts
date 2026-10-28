/**
 * TimeEntry service — logging hours a team member worked (Cargar horas), and reading
 * them back. Receives the `tx` from the route's runInTx wrapper.
 */
import type { Prisma } from '@hold/db';
import { BadRequestError } from '../../lib/errors.js';
import { timeEntriesRepo } from './time-entries.repo.js';
import {
  toTimeEntryDto,
  type CreateTimeEntryInput,
  type ListTimeEntriesQuery,
  type TimeEntryDto,
} from './time-entries.schema.js';

/** 'YYYY-MM' → UTC [start, end) bounds of that month. */
function monthBounds(period: string): { start: Date; end: Date } {
  // slice (not split+destructure) so the values are `number`, not `number | undefined`
  // under noUncheckedIndexedAccess. The zod regex already guaranteed the shape.
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

export const timeEntriesService = {
  async list(tx: Prisma.TransactionClient, query: ListTimeEntriesQuery): Promise<TimeEntryDto[]> {
    const where: Prisma.TimeEntryWhereInput = {
      ...(query.teamMemberId ? { teamMemberId: query.teamMemberId } : {}),
      ...(query.period
        ? (() => {
            const { start, end } = monthBounds(query.period);
            return { date: { gte: start, lt: end } };
          })()
        : {}),
    };
    return (await timeEntriesRepo.list(tx, where)).map(toTimeEntryDto);
  },

  async create(
    tx: Prisma.TransactionClient,
    teamMemberId: string,
    loggedByUserId: string,
    input: CreateTimeEntryInput,
  ): Promise<TimeEntryDto> {
    // The member must exist and be live.
    const member = await tx.teamMember.findFirst({ where: { id: teamMemberId, deletedAt: null } });
    if (!member) {
      throw new BadRequestError('teamMemberId does not reference a member in this workspace');
    }
    // If a client is named, it must be one of this workspace's clients.
    if (input.clientId) {
      const client = await tx.client.findFirst({ where: { id: input.clientId, deletedAt: null } });
      if (!client) {
        throw new BadRequestError('clientId does not reference a client in this workspace');
      }
    }
    const created = await timeEntriesRepo.create(tx, {
      teamMemberId,
      clientId: input.clientId ?? null,
      clientName: input.clientName ?? null,
      taskType: input.taskType,
      date: input.date,
      hours: input.hours,
      description: input.description ?? null,
      isOutOfScope: input.isOutOfScope,
      loggedByUserId,
    });
    return toTimeEntryDto(created);
  },
};
