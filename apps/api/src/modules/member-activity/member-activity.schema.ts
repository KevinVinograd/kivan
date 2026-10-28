/** Edge validation (Zod) + DTOs for member activity: viáticos + extra work. */
import { z } from 'zod';
import { INT8_MAX } from '@hold/shared';

const amountMinor = z.coerce.bigint().positive().max(INT8_MAX);

export const createMemberExpenseSchema = z.object({
  teamMemberId: z.uuid(),
  clientId: z.uuid().optional(),
  clientName: z.string().trim().max(200).optional(),
  date: z.coerce.date(),
  concept: z.string().trim().min(1).max(200),
  amountMinor,
  notes: z.string().trim().max(2000).optional(),
});
export type CreateMemberExpenseInput = z.infer<typeof createMemberExpenseSchema>;

export const createMemberExtraSchema = z.object({
  teamMemberId: z.uuid(),
  clientId: z.uuid().optional(),
  clientName: z.string().trim().max(200).optional(),
  date: z.coerce.date(),
  description: z.string().trim().min(1).max(500),
  hours: z.number().nonnegative().max(1000).optional(),
  amountMinor,
});
export type CreateMemberExtraInput = z.infer<typeof createMemberExtraSchema>;

/** Approve every pending extra for one member (the bulk "aprobar extras" action). */
export const approveExtrasSchema = z.object({ teamMemberId: z.uuid() });
export type ApproveExtrasInput = z.infer<typeof approveExtrasSchema>;

export const listActivityQuerySchema = z.object({ teamMemberId: z.uuid().optional() });
export type ListActivityQuery = z.infer<typeof listActivityQuerySchema>;

export interface MemberExpenseDto {
  id: string;
  teamMemberId: string;
  clientId: string | null;
  clientName: string | null;
  date: string; // YYYY-MM-DD
  concept: string;
  amountMinor: string;
  status: string;
  notes: string | null;
  loggedByUserId: string | null;
}

export interface MemberExtraWorkDto {
  id: string;
  teamMemberId: string;
  clientId: string | null;
  clientName: string | null;
  date: string; // YYYY-MM-DD
  description: string;
  hours: number | null;
  amountMinor: string;
  status: string;
  approvedByUserId: string | null;
  loggedByUserId: string | null;
}

interface MemberExpenseRecord {
  id: string;
  teamMemberId: string;
  clientId: string | null;
  clientName: string | null;
  date: Date;
  concept: string;
  amountMinor: bigint;
  status: string;
  notes: string | null;
  loggedByUserId: string | null;
}

interface MemberExtraRecord {
  id: string;
  teamMemberId: string;
  clientId: string | null;
  clientName: string | null;
  date: Date;
  description: string;
  hours: number | null;
  amountMinor: bigint;
  status: string;
  approvedByUserId: string | null;
  loggedByUserId: string | null;
}

export function toMemberExpenseDto(r: MemberExpenseRecord): MemberExpenseDto {
  return {
    id: r.id,
    teamMemberId: r.teamMemberId,
    clientId: r.clientId,
    clientName: r.clientName,
    date: r.date.toISOString().slice(0, 10),
    concept: r.concept,
    amountMinor: r.amountMinor.toString(),
    status: r.status,
    notes: r.notes,
    loggedByUserId: r.loggedByUserId,
  };
}

export function toMemberExtraDto(r: MemberExtraRecord): MemberExtraWorkDto {
  return {
    id: r.id,
    teamMemberId: r.teamMemberId,
    clientId: r.clientId,
    clientName: r.clientName,
    date: r.date.toISOString().slice(0, 10),
    description: r.description,
    hours: r.hours,
    amountMinor: r.amountMinor.toString(),
    status: r.status,
    approvedByUserId: r.approvedByUserId,
    loggedByUserId: r.loggedByUserId,
  };
}
