/** Edge validation (Zod) + DTOs for the PayoutStatement module. */
import { z } from 'zod';
import { MinorUnits, MinorUnitsNonNeg } from '@hold/shared';

const isoDate = z.coerce.date();

export const STATEMENT_STATUSES = ['draft', 'approved', 'dispatched', 'confirmed'] as const;

export const bankProfileSchema = z.object({
  bankName: z.string().trim().max(200).optional(),
  accountHolder: z.string().trim().max(200).optional(),
  cbuOrCvu: z.string().trim().max(60).optional(),
  alias: z.string().trim().max(120).optional(),
});
export type BankProfile = z.infer<typeof bankProfileSchema>;

export const upsertPayoutSchema = z.object({
  teamMemberId: z.uuid(),
  period: isoDate,
  baseAmountMinor: MinorUnitsNonNeg.optional(),
  productionsAmountMinor: MinorUnitsNonNeg.optional(),
  viaticsAmountMinor: MinorUnitsNonNeg.optional(),
  // The rate this statement is computed at. Supplying it (or leaving it to the
  // member's own `hourlyRateMinor`) is what lets the statement RECORD what an
  // hour was worth that month, instead of leaving the detail to divide a total
  // by a count and call the quotient a rate.
  hourlyRateMinor: MinorUnitsNonNeg.optional(),
  bankId: z.uuid().optional(),
  bankProfile: bankProfileSchema.nullable().optional(),
  dueDate: isoDate.optional(),
});
export type UpsertPayoutInput = z.infer<typeof upsertPayoutSchema>;

export const addAdjustmentSchema = z.object({
  description: z.string().trim().min(1).max(200),
  amountMinor: MinorUnits, // may be negative (a deduction)
});
export type AddAdjustmentInput = z.infer<typeof addAdjustmentSchema>;

export const registerPayoutSchema = z.object({
  amountMinor: MinorUnitsNonNeg,
  /** The DAY the money left, as the operator entered it. Optional: a caller that sends
   *  none records none, rather than having the moment of data entry stand in for it.
   *  Never in the future — a payout records money that HAS left, so a later date is a
   *  mistyped year. Checked HERE and not only in the dialog: a retry, a script or any
   *  future caller reaches this endpoint too, and the colaboradora ledger sorts by this
   *  day, so one bad value sits above every real movement forever. */
  paidAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'paidAt must be a YYYY-MM-DD day')
    // Shape is not enough: a bare regex accepts '2026-02-31' and '2026-13-01', which then
    // reach `COALESCE($1::date, ...)` and make Postgres raise, surfacing as a 500 rather
    // than the 400 `z.coerce.date()` used to give. Round-trip the day and require it back.
    .refine((day) => new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day, 'paidAt is not a real date')
    // A calendar day has no single global "today", so this guard picks a tolerance rather
    // than pretending to be exact. It exists to catch a mistyped YEAR, and it must never
    // refuse a legitimate today: the browser sends its LOCAL day while the server reads
    // UTC, so at 21:30 in UTC-3 the operator's "today" is already tomorrow in UTC — and
    // an earlier attempt here, comparing against `new Date().toISOString().slice(0,10)`,
    // was the same off-by-one it claimed to have fixed. One day of slack covers every
    // offset in both directions; a mistyped year misses by thousands.
    .refine((day) => day <= new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), 'paidAt cannot be in the future')
    .optional(),
  /** WHERE the money left from. Optional, and optional means "moves no balance": every
   *  payout registered before 0021 named no account, and picking one for them would be
   *  the invented reconciliation this column exists to avoid. When it IS named, that
   *  account's balance moves in this same transaction. */
  treasuryAccountId: z.uuid().optional(),
  idempotencyKey: z.string().trim().min(1).max(120).optional(),
});

export const listPayoutsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  period: isoDate.optional(),
  status: z.enum(STATEMENT_STATUSES).optional(),
  teamMemberId: z.uuid().optional(),
});
export type ListPayoutsQuery = z.infer<typeof listPayoutsQuerySchema>;

export const statementIdParamSchema = z.object({ id: z.uuid() });

export interface TeamAdjustmentDto {
  id: string;
  description: string;
  amountMinor: string;
  createdAt: string;
}

export interface PayoutStatementDto {
  id: string;
  teamMemberId: string;
  period: string;
  baseAmountMinor: string;
  productionsAmountMinor: string;
  viaticsAmountMinor: string;
  adjustmentsTotalMinor: string;
  totalAmountMinor: string;
  paidAmountMinor: string;
  outstandingMinor: string;
  // Both null means NOT RECORDED, and consumers must render it as such. A
  // statement predating attribution has no hours and no rate; a member paid
  // monthly_fixed never will. Neither case is "0 hours at $0".
  hoursTotal: number | null;
  hourlyRateMinor: string | null;
  statementStatus: string;
  bankId: string | null;
  bankProfile: BankProfile | null;
  dueDate: string | null;
  /** The day it was paid, or null when nobody recorded one. */
  paidAt: string | null;
  /** The account the money left from, or null when the payout named none (and therefore
   *  moved no balance). */
  treasuryAccountId: string | null;
  approvedAt: string | null;
  approvedByUserId: string | null;
  version: number;
  createdAt: string;
  adjustments: TeamAdjustmentDto[];
}

export interface PaginatedPayoutsDto {
  items: PayoutStatementDto[];
  total: number;
  limit: number;
  offset: number;
}

interface AdjustmentRecord {
  id: string;
  description: string;
  amountMinor: bigint;
  createdAt: Date;
}

interface PayoutRecord {
  id: string;
  teamMemberId: string;
  period: Date;
  baseAmountMinor: bigint;
  productionsAmountMinor: bigint;
  viaticsAmountMinor: bigint;
  adjustmentsTotalMinor: bigint;
  totalAmountMinor: bigint;
  paidAmountMinor: bigint;
  hoursTotal: number | null;
  hourlyRateMinor: bigint | null;
  statementStatus: string;
  bankId: string | null;
  bankProfile: unknown;
  dueDate: Date | null;
  paidAt: Date | null;
  treasuryAccountId: string | null;
  approvedAt: Date | null;
  approvedByUserId: string | null;
  version: number;
  createdAt: Date;
  adjustments?: AdjustmentRecord[];
}

export function toPayoutStatementDto(r: PayoutRecord): PayoutStatementDto {
  return {
    id: r.id,
    teamMemberId: r.teamMemberId,
    period: r.period.toISOString().slice(0, 10),
    baseAmountMinor: r.baseAmountMinor.toString(),
    productionsAmountMinor: r.productionsAmountMinor.toString(),
    viaticsAmountMinor: r.viaticsAmountMinor.toString(),
    adjustmentsTotalMinor: r.adjustmentsTotalMinor.toString(),
    totalAmountMinor: r.totalAmountMinor.toString(),
    paidAmountMinor: r.paidAmountMinor.toString(),
    outstandingMinor: (r.totalAmountMinor - r.paidAmountMinor).toString(),
    // `?? null` and NOT `?? 0` / `?? '0'`: the absence is the message.
    hoursTotal: r.hoursTotal ?? null,
    hourlyRateMinor: r.hourlyRateMinor?.toString() ?? null,
    statementStatus: r.statementStatus,
    bankId: r.bankId,
    bankProfile: (r.bankProfile as BankProfile | null) ?? null,
    dueDate: r.dueDate?.toISOString().slice(0, 10) ?? null,
    // A `@db.Date` column: it carries a DAY, so it is serialized as one. Handing the
    // front a full instant would make it localize a midnight that means nothing.
    paidAt: r.paidAt?.toISOString().slice(0, 10) ?? null,
    treasuryAccountId: r.treasuryAccountId,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    approvedByUserId: r.approvedByUserId,
    version: r.version,
    createdAt: r.createdAt.toISOString(),
    adjustments: (r.adjustments ?? []).map((a) => ({
      id: a.id,
      description: a.description,
      amountMinor: a.amountMinor.toString(),
      createdAt: a.createdAt.toISOString(),
    })),
  };
}
