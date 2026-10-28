/**
 * Member activity service — viáticos (standalone member reimbursements) and extra
 * work (pending→approved). Money is stored/returned in minor units. Approval
 * records status only; it does not post to the payout yet (deferred by product
 * decision).
 */
import type { Prisma } from '@hold/db';
import { BadRequestError } from '../../lib/errors.js';
import { memberActivityRepo } from './member-activity.repo.js';
import {
  toMemberExpenseDto,
  toMemberExtraDto,
  type CreateMemberExpenseInput,
  type CreateMemberExtraInput,
  type MemberExpenseDto,
  type MemberExtraWorkDto,
} from './member-activity.schema.js';

async function assertMember(tx: Prisma.TransactionClient, teamMemberId: string): Promise<void> {
  const member = await memberActivityRepo.findTeamMember(tx, teamMemberId);
  if (!member) {
    throw new BadRequestError('teamMemberId does not reference a member in this workspace');
  }
}

export const memberActivityService = {
  async listExpenses(tx: Prisma.TransactionClient, teamMemberId?: string): Promise<MemberExpenseDto[]> {
    return (await memberActivityRepo.listExpenses(tx, teamMemberId)).map(toMemberExpenseDto);
  },

  async createExpense(
    tx: Prisma.TransactionClient,
    loggedByUserId: string,
    input: CreateMemberExpenseInput,
  ): Promise<MemberExpenseDto> {
    await assertMember(tx, input.teamMemberId);
    const created = await memberActivityRepo.createExpense(tx, {
      teamMemberId: input.teamMemberId,
      clientId: input.clientId ?? null,
      clientName: input.clientName ?? null,
      date: input.date,
      concept: input.concept,
      amountMinor: input.amountMinor,
      notes: input.notes ?? null,
      loggedByUserId,
    });
    return toMemberExpenseDto(created);
  },

  async listExtras(tx: Prisma.TransactionClient, teamMemberId?: string): Promise<MemberExtraWorkDto[]> {
    return (await memberActivityRepo.listExtras(tx, teamMemberId)).map(toMemberExtraDto);
  },

  async createExtra(
    tx: Prisma.TransactionClient,
    loggedByUserId: string,
    input: CreateMemberExtraInput,
  ): Promise<MemberExtraWorkDto> {
    await assertMember(tx, input.teamMemberId);
    const created = await memberActivityRepo.createExtra(tx, {
      teamMemberId: input.teamMemberId,
      clientId: input.clientId ?? null,
      clientName: input.clientName ?? null,
      date: input.date,
      description: input.description,
      hours: input.hours ?? null,
      amountMinor: input.amountMinor,
      loggedByUserId,
    });
    return toMemberExtraDto(created);
  },

  /** Approve every pending extra for a member. Returns the count approved. */
  async approveExtras(
    tx: Prisma.TransactionClient,
    teamMemberId: string,
    approvedByUserId: string,
  ): Promise<{ approved: number }> {
    await assertMember(tx, teamMemberId);
    const approved = await memberActivityRepo.approveExtras(tx, teamMemberId, approvedByUserId);
    return { approved };
  },
};
