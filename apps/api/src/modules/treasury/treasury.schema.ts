/** Edge validation (Zod) + DTOs for the Treasury / Cashflow module. */
import { z } from 'zod';
import { Currency, MinorUnits, MinorUnitsNonNeg, TreasuryPartner } from '@hold/shared';

const isoDate = z.coerce.date();

export const createAccountSchema = z.object({
  name: z.string().trim().min(1).max(200),
  partner: TreasuryPartner.default('shared'),
  type: z.enum(['bank', 'cash', 'investment']).default('bank'),
  balanceArsMinor: MinorUnits.optional(), // signed: an account can be overdrawn
  balanceUsdMinor: MinorUnits.optional(),
  isReserve: z.boolean().default(false),
  // Whether the balance counts as operating cash. It decides both the Posición total and
  // the projection opening, so the switch has to persist — dropping it was the "success
  // toast, nothing saved" no-op the audit flagged.
  isActive: z.boolean().default(true),
  note: z.string().trim().max(500).optional(),
});
export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export const updateAccountSchema = z.object({
  // Optimistic-concurrency guard: the caller must send the version it read.
  version: z.number().int().nonnegative(),
  name: z.string().trim().min(1).max(200).optional(),
  partner: TreasuryPartner.optional(),
  type: z.enum(['bank', 'cash', 'investment']).optional(),
  balanceArsMinor: MinorUnits.optional(),
  balanceUsdMinor: MinorUnits.optional(),
  isReserve: z.boolean().optional(),
  isActive: z.boolean().optional(),
  note: z.string().trim().max(500).optional(),
});
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

export const accountIdParamSchema = z.object({ id: z.uuid() });

/** The window of settlement movements to read. `from` is normally the position anchor:
 *  "what has moved the balances since the date they were good as of". */
export const listMovementsQuerySchema = z.object({
  from: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type ListMovementsQuery = z.infer<typeof listMovementsQuerySchema>;

/**
 * What the automatic movements add up to, per account / lane / direction, since `from`.
 *
 * This is what the Saldos provenance line reads. It is a separate figure from `items`
 * on purpose: `items` is a paged audit read that stops at `limit`, and summing a page
 * that stopped short understates the money by an unbounded amount.
 */
export interface TreasuryMovementTotalDto {
  accountId: string;
  lane: string;
  direction: string;
  amountMinor: string;
}

/** One automatic balance movement — what a cobro or a pago did to an account. */
export interface TreasuryMovementDto {
  id: string;
  accountId: string;
  date: string;
  direction: string;
  lane: string;
  amountMinor: string;
  description: string;
  referenceType: string | null;
  referenceId: string | null;
}

/**
 * The entity a commitment realizes. The projection supersedes an occurrence by
 * IDENTITY, so this pair is what lets it stop guessing from (week, direction,
 * category) — a guess that let one small payment erase a large payroll.
 *
 * Only kinds whose ACTUALS already carry a matching id are accepted:
 * `Receivable.clientId`, `Payment.teamMemberId`, `Payment.providerId` and, since
 * migration 0021, `Payment.invoiceEmitterId`.
 *
 * The emitter is what a monotributo cuota points at. A gasto fijo and a plataforma
 * point at a PROVIDER instead — the landlord, the subscription — which needed no new
 * modeling at all: `Payment.providerId` already existed and the pago simply never
 * offered it for those recipient types. What they were missing was a counterparty to
 * name, not a column to name it in.
 */
export const LinkedEntityType = z.enum(['client', 'teamMember', 'provider', 'invoiceEmitter']);
export type LinkedEntityTypeValue = z.infer<typeof LinkedEntityType>;

/**
 * The two columns travel TOGETHER, always: a type with no id names nothing, and an
 * id with no type cannot be resolved to a table. Send neither (leave as-is on
 * update, unlinked on create), or send both — both null clears the link.
 */
function assertLinkPairing(
  value: { linkedEntityType?: string | null; linkedEntityId?: string | null },
  ctx: z.RefinementCtx,
): void {
  const typeSent = 'linkedEntityType' in value && value.linkedEntityType !== undefined;
  const idSent = 'linkedEntityId' in value && value.linkedEntityId !== undefined;
  if (typeSent !== idSent) {
    ctx.addIssue({
      code: 'custom',
      path: ['linkedEntityId'],
      message: 'linkedEntityType and linkedEntityId must be sent together',
    });
    return;
  }
  if (typeSent && (value.linkedEntityType === null) !== (value.linkedEntityId === null)) {
    ctx.addIssue({
      code: 'custom',
      path: ['linkedEntityId'],
      message: 'linkedEntityType and linkedEntityId must both be set or both be null',
    });
  }
}

export const createCommitmentSchema = z.object({
  description: z.string().trim().min(1).max(200),
  direction: z.enum(['inflow', 'outflow']),
  amountMinor: MinorUnitsNonNeg, // sign comes from direction
  currency: Currency.default('ARS'),
  category: z.string().trim().max(80).optional(),
  // Union of the original backend cadences + the front's (quarterly/annual); the
  // column is a plain String so both sets are valid.
  recurrence: z
    .enum(['one_time', 'weekly', 'monthly', 'quarterly', 'annual'])
    .default('one_time'),
  startDate: isoDate,
  endDate: isoDate.nullable().optional(), // null clears the horizon (open-ended)
  anchorDay: z.number().int().min(1).max(28).default(1),
  // Union of the original backend confidences + the front's (committed/projected).
  confidence: z
    .enum(['expected', 'likely', 'tentative', 'committed', 'projected'])
    .default('expected'),
  observations: z.string().trim().max(2000).optional(),
  // An inactive commitment is excluded from the projection. Editable on update already;
  // it was silently dropped on create, so one created inactive entered the projection anyway.
  isActive: z.boolean().default(true),
  linkedEntityType: LinkedEntityType.nullable().optional(),
  linkedEntityId: z.uuid().nullable().optional(),
}).superRefine(assertLinkPairing);
export type CreateCommitmentInput = z.infer<typeof createCommitmentSchema>;

export const updateCommitmentSchema = z.object({
  version: z.number().int().nonnegative(),
  description: z.string().trim().min(1).max(200).optional(),
  amountMinor: MinorUnitsNonNeg.optional(),
  category: z.string().trim().max(80).optional(),
  recurrence: z.enum(['one_time', 'weekly', 'monthly', 'quarterly', 'annual']).optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.nullable().optional(), // null clears the horizon (open-ended)
  anchorDay: z.number().int().min(1).max(28).optional(),
  confidence: z.enum(['expected', 'likely', 'tentative', 'committed', 'projected']).optional(),
  observations: z.string().trim().max(2000).optional(),
  isActive: z.boolean().optional(),
  linkedEntityType: LinkedEntityType.nullable().optional(),
  linkedEntityId: z.uuid().nullable().optional(),
}).superRefine(assertLinkPairing);
export type UpdateCommitmentInput = z.infer<typeof updateCommitmentSchema>;

export const commitmentIdParamSchema = z.object({ id: z.uuid() });

export const projectionQuerySchema = z.object({
  lane: z.enum(['ARS', 'USD']).default('ARS'),
  weeks: z.coerce.number().int().min(1).max(52).default(13),
  from: isoDate.optional(),
});
export type ProjectionQuery = z.infer<typeof projectionQuerySchema>;

export interface TreasuryAccountDto {
  id: string;
  name: string;
  partner: string;
  type: string;
  balanceArsMinor: string;
  balanceUsdMinor: string;
  isReserve: boolean;
  note: string | null;
  isActive: boolean;
  version: number;
}

export interface LanePositionDto {
  operatingMinor: string;
  reserveMinor: string;
  totalMinor: string;
}

export interface PositionDto {
  ars: LanePositionDto;
  usd: LanePositionDto;
}

export interface CommittedItemDto {
  id: string;
  description: string;
  direction: string;
  amountMinor: string;
  currency: string;
  category: string | null;
  recurrence: string;
  startDate: string;
  endDate: string | null;
  anchorDay: number;
  confidence: string;
  source: string;
  observations: string | null;
  isActive: boolean;
  version: number;
  /** The entity this commitment realizes, or null. See `LinkedEntityType`. */
  linkedEntityType: string | null;
  linkedEntityId: string | null;
}

export interface ProjectionWeekDto {
  weekStart: string;
  inflowMinor: string;
  outflowMinor: string;
  netMinor: string;
  endBalanceMinor: string;
}

export interface ProjectionDto {
  lane: string;
  startingBalanceMinor: string;
  weeks: ProjectionWeekDto[];
}

interface AccountRecord {
  id: string;
  name: string;
  partner: string;
  type: string;
  balanceArsMinor: bigint;
  balanceUsdMinor: bigint;
  isReserve: boolean;
  note: string | null;
  isActive: boolean;
  version: number;
}

export function toAccountDto(r: AccountRecord): TreasuryAccountDto {
  return {
    id: r.id,
    name: r.name,
    partner: r.partner,
    type: r.type,
    balanceArsMinor: r.balanceArsMinor.toString(),
    balanceUsdMinor: r.balanceUsdMinor.toString(),
    isReserve: r.isReserve,
    note: r.note,
    isActive: r.isActive,
    version: r.version,
  };
}

interface MovementRecord {
  id: string;
  accountId: string;
  date: Date;
  direction: string;
  lane: string;
  amountMinor: bigint;
  description: string;
  referenceType: string | null;
  referenceId: string | null;
}

export function toMovementDto(r: MovementRecord): TreasuryMovementDto {
  return {
    id: r.id,
    accountId: r.accountId,
    // A `@db.Date` column: it carries a DAY, so it is serialized as one. Handing the
    // front a full instant would make it localize a midnight that means nothing.
    date: r.date.toISOString().slice(0, 10),
    direction: r.direction,
    lane: r.lane,
    amountMinor: r.amountMinor.toString(),
    description: r.description,
    referenceType: r.referenceType,
    referenceId: r.referenceId,
  };
}

interface CommitmentRecord {
  id: string;
  description: string;
  direction: string;
  amountMinor: bigint;
  currency: string;
  category: string | null;
  recurrence: string;
  startDate: Date;
  endDate: Date | null;
  anchorDay: number;
  confidence: string;
  source: string;
  observations: string | null;
  isActive: boolean;
  version: number;
  linkedEntityType: string | null;
  linkedEntityId: string | null;
}

export function toCommitmentDto(r: CommitmentRecord): CommittedItemDto {
  return {
    id: r.id,
    description: r.description,
    direction: r.direction,
    amountMinor: r.amountMinor.toString(),
    currency: r.currency,
    category: r.category,
    recurrence: r.recurrence,
    startDate: r.startDate.toISOString().slice(0, 10),
    endDate: r.endDate?.toISOString().slice(0, 10) ?? null,
    anchorDay: r.anchorDay,
    confidence: r.confidence,
    source: r.source,
    observations: r.observations,
    isActive: r.isActive,
    version: r.version,
    linkedEntityType: r.linkedEntityType,
    linkedEntityId: r.linkedEntityId,
  };
}
