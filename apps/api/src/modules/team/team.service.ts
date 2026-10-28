/**
 * TeamMember service — business logic + DTO mapping. Receives the `tx` from the
 * route's runInTx wrapper. Throws typed
 * AppErrors the global handler maps to the error contract.
 */
import type { Prisma } from '@hold/db';
import { NotFoundError } from '../../lib/errors.js';
import { teamRepo } from './team.repo.js';
import {
  toBankDto,
  toTeamMemberDto,
  type BankDetailsInput,
  type InvitedProfileInput,
  type BankDto,
  type CreateTeamMemberInput,
  type PaginatedTeamDto,
  type TeamMemberDto,
  type UpdateTeamMemberInput,
} from './team.schema.js';

/** undefined → leave the column untouched on update; '' → clear to null; value → set. */
function normBank(input: BankDetailsInput) {
  const norm = (v: string | undefined): string | null | undefined =>
    v === undefined ? undefined : v.length > 0 ? v : null;
  const data = {
    bankName: norm(input.bankName),
    accountHolder: norm(input.accountHolder),
    cbuOrCvu: norm(input.cbuOrCvu),
    alias: norm(input.bankAlias),
  };
  const hasValue = Object.values(data).some((v) => typeof v === 'string' && v.length > 0);
  return { data, hasValue };
}

interface ListOptions {
  limit: number;
  offset: number;
  onlyId?: string | null;
}

export const teamService = {
  async list(tx: Prisma.TransactionClient, opts: ListOptions): Promise<PaginatedTeamDto> {
    const { items, total } = await teamRepo.list(tx, opts);
    return { items: items.map(toTeamMemberDto), total, limit: opts.limit, offset: opts.offset };
  },

  async getById(
    tx: Prisma.TransactionClient,
    id: string,
    restrictToId?: string | null,
  ): Promise<TeamMemberDto> {
    // Employees may read only their own member record (compensation included);
    // 404 (not 403) for anything else so existence isn't disclosed.
    if (restrictToId !== undefined && restrictToId !== id) {
      throw new NotFoundError(`Team member ${id} not found`);
    }
    const member = await teamRepo.findById(tx, id);
    if (!member) {
      throw new NotFoundError(`Team member ${id} not found`);
    }
    return toTeamMemberDto(member);
  },

  async create(
    tx: Prisma.TransactionClient,
    input: CreateTeamMemberInput,
  ): Promise<TeamMemberDto> {
    const created = await teamRepo.create(tx, { ...input });
    return toTeamMemberDto(created);
  },

  async update(
    tx: Prisma.TransactionClient,
    id: string,
    input: UpdateTeamMemberInput,
  ): Promise<TeamMemberDto> {
    await this.getById(tx, id); // 404 if absent before the update
    const updated = await teamRepo.update(tx, id, input);
    return toTeamMemberDto(updated);
  },

  async deactivate(tx: Prisma.TransactionClient, id: string): Promise<TeamMemberDto> {
    await this.getById(tx, id);
    const updated = await teamRepo.softDelete(tx, id);
    return toTeamMemberDto(updated);
  },

  /** The member's bank details. Callers reach this only through the capability-gated route. */
  async getBank(tx: Prisma.TransactionClient, id: string): Promise<BankDto | null> {
    const member = await teamRepo.findById(tx, id);
    if (!member) {
      throw new NotFoundError(`Team member ${id} not found`);
    }
    if (!member.bankId) return null;
    const bank = await teamRepo.findBank(tx, member.bankId);
    return bank ? toBankDto(bank) : null;
  },

  /** Upsert the member's bank details (create + link, or update in place). */
  async setBank(
    tx: Prisma.TransactionClient,
    id: string,
    input: BankDetailsInput,
  ): Promise<BankDto | null> {
    const member = await teamRepo.findById(tx, id);
    if (!member) {
      throw new NotFoundError(`Team member ${id} not found`);
    }
    const { data, hasValue } = normBank(input);
    if (member.bankId) {
      const updated = await teamRepo.updateBank(tx, member.bankId, data);
      return toBankDto(updated);
    }
    if (!hasValue) return null; // nothing to store, no row to clear
    const created = await teamRepo.createBank(tx, { ...data });
    await teamRepo.linkBank(tx, id, created.id);
    return toBankDto(created);
  },

  /**
   * The member fills in their OWN ficha while accepting their invitation.
   *
   * The one write of banking data that is NOT capability-gated, and the exception is the
   * point: `teamBankDetails` governs whether a studio member may see or write SOMEBODY
   * ELSE's bank details. This is a person supplying their own, before they have a session
   * at all — there is no capability to hold yet, and gating it would mean nobody could
   * ever complete their own ficha.
   *
   * What stands in for the gate is the caller's contract, enforced in `auth.service`:
   * `teamMemberId` is resolved from the invitation token's user row and never from the
   * request, and only a FIRST-TIME invite may call this — a password reset may not, so a
   * stolen reset link cannot rewrite a victim's CBU. Both are covered by tests in
   * `settings.test.ts` ("accept-invitation: the person completes their own ficha").
   */
  async completeOwnProfile(
    tx: Prisma.TransactionClient,
    teamMemberId: string,
    input: InvitedProfileInput,
  ): Promise<void> {
    // A ficha that is gone (soft-deleted between the invite and its acceptance) means there
    // is nothing to fill in — NOT that the person may not have an account. Letting `setBank`
    // throw here would abort the accept transaction and leave them unable to set a password
    // at all, reading "el enlace no es válido" forever with no way to recover.
    const member = await teamRepo.findById(tx, teamMemberId);
    if (!member) return;
    const { phone, taxId, ...bank } = input;
    await teamRepo.update(tx, teamMemberId, {
      ...(phone !== undefined ? { phone } : {}),
      ...(taxId !== undefined ? { taxId } : {}),
    });
    // Through the studio-side upsert on purpose: the person's details must land in exactly
    // the row an admin typing them would have written, or the payout reads a different one.
    await this.setBank(tx, teamMemberId, bank);
  },
};
