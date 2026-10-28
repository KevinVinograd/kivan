/**
 * Edge validation (Zod) + DTOs for the Monthly-operation PLAN sub-resources:
 * productions, fixed expenses and alerts (each a per-period, version-guarded row).
 * Money is integer minor units serialized as base-10 strings.
 */
import { z } from 'zod';
import { MinorUnitsNonNeg } from '@hold/shared';
import type { PayoutStatementDto } from '../payouts/payouts.schema.js';
import type { ReceivableDto } from '../billing/billing.schema.js';

const isoDate = z.coerce.date();
const periodParamSchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'period must be YYYY-MM'),
});
export const planIdParamSchema = z.object({ id: z.uuid() });
export { periodParamSchema };

// ── Productions ──────────────────────────────────────────────────────────────

/**
 * Who worked a production, BY ID. `responsible` / `participants` carry the same
 * people as display names and stay in sync, but only this can be summed into a
 * liquidación — a name matches nobody in particular.
 *
 * `hours` is nullable and null means UNKNOWN, never zero: a production may be
 * attributed to someone whose share of the hours was never recorded, and the
 * two cases must stay distinguishable all the way to the screen.
 */
export const productionAttributionSchema = z.object({
  teamMemberId: z.uuid(),
  hours: z.number().nonnegative().max(100000).nullable().optional(),
  role: z.enum(['responsible', 'participant']).default('participant'),
});
export type ProductionAttributionInput = z.infer<typeof productionAttributionSchema>;

/** A production's life: loaded, confirmed by the communication lead, on a cobro. */
export const PRODUCTION_STATUSES = ['pending', 'approved', 'invoiced'] as const;
/** The statuses whose work a liquidación pays, and therefore the ones that cost the studio. */
export const PAID_PRODUCTION_STATUSES: readonly string[] = ['approved', 'invoiced'];

export const createProductionSchema = z.object({
  date: isoDate,
  clientId: z.uuid().nullable().optional(),
  clientName: z.string().trim().max(200).nullable().optional(),
  /** The "Tema". Optional: HOLD found a required field nobody knew how to fill (review of
   *  2026-10-21); a blank one is stored as the production's type. */
  title: z.string().trim().max(200).optional(),
  type: z.string().trim().min(1).max(80),
  responsible: z.string().trim().max(120).optional(),
  participants: z.array(z.string().trim().max(120)).max(50).optional(),
  // When supplied, this is authoritative and `responsible` / `participants` are
  // derived from it. When omitted, the legacy name-only path is untouched — so
  // every existing caller keeps working and simply attributes nothing.
  attribution: z.array(productionAttributionSchema).max(50).optional(),
  hours: z.number().nonnegative().max(100000).default(0),
  viaticsMinor: MinorUnitsNonNeg.optional(),
  totalCostMinor: MinorUnitsNonNeg.optional(),
  billable: z.enum(['internal', 'billable', 'both']).nullable().optional(),
  billAmountMinor: MinorUnitsNonNeg.optional(),
  status: z.enum(PRODUCTION_STATUSES).default('pending'),
  notes: z.string().trim().max(2000).optional(),
  /** The client's per-production service this production is billed under (null = none). */
  clientServiceId: z.uuid().nullable().optional(),
  /** Who coordinated it (the planilla's "Account Manager"). A coordinator, not a worker. */
  accountManagerId: z.uuid().nullable().optional(),
  /** The day the viático was paid back; null = still owed. */
  viaticsPaidAt: isoDate.nullable().optional(),
  /** The viático's receipt: a Drive link or the file's name. */
  receipt: z.string().trim().max(500).nullable().optional(),
});
export type CreateProductionInput = z.infer<typeof createProductionSchema>;

/** Approve productions (or send them back to pending), several at once. */
export const productionApprovalSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(200),
  approved: z.boolean(),
});

/** Mark viáticos paid back (a date) or owed again (null), several at once — HOLD settles
 *  them in a weekly batch. */
export const markViaticsPaidSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(200),
  paidAt: isoDate.nullable(),
});

// `.partial()` keeps the create schema's DEFAULTS, so a field the edit did not send came
// back filled in: every edit reset `status` to 'pending' and an edit without `hours` zeroed
// them. Harmless while nothing read the status; once only approved productions are billed
// and paid (2026-10-19) it silently un-approved every production anyone edited. Both are
// redeclared without a default, so an omitted field stays untouched.
export const updateProductionSchema = createProductionSchema
  .partial()
  .extend({
    hours: z.number().nonnegative().max(100000).optional(),
    status: z.enum(PRODUCTION_STATUSES).optional(),
    version: z.number().int().nonnegative(),
  });
export type UpdateProductionInput = z.infer<typeof updateProductionSchema>;

export interface ProductionAttributionDto {
  teamMemberId: string;
  name: string;
  /** null = the split was never recorded for this person. Not zero hours. */
  hours: number | null;
  role: string;
}

export interface ProductionDto {
  id: string;
  period: string;
  date: string;
  clientId: string | null;
  clientName: string | null;
  title: string;
  type: string;
  responsible: string | null;
  participants: string[];
  attribution: ProductionAttributionDto[];
  hours: number;
  viaticsMinor: string;
  /** What the people on it were paid. null when the caller is a communication lead, who
   *  never sees pay (`withoutMoney`). */
  totalCostMinor: string | null;
  billable: string | null;
  billAmountMinor: string | null;
  /** Hours of this production its per-hour line's included hours covered that month;
   *  `billAmountMinor` bills only the rest. 0 off a per-hour line. */
  packHours: number;
  status: string;
  notes: string | null;
  /** The per-production service line it is billed under, or null. */
  clientServiceId: string | null;
  /** The cobro that billed it, or null while it is still to be billed. */
  receivableId: string | null;
  accountManagerId: string | null;
  accountManagerName: string | null;
  /** YYYY-MM-DD the viático was paid back, or null while it is owed. */
  viaticsPaidAt: string | null;
  receipt: string | null;
  version: number;
}

// ── Fixed expenses ───────────────────────────────────────────────────────────
export const createExpenseSchema = z.object({
  concept: z.string().trim().min(1).max(200),
  category: z.string().trim().max(80).default('other'),
  amountMinor: MinorUnitsNonNeg.optional(),
  recurrence: z.enum(['monthly', 'one_time', 'quarterly', 'annual']).default('monthly'),
  responsible: z.string().trim().max(120).optional(),
  monotributo: z.string().trim().max(40).optional(),
  payStatus: z.enum(['paid', 'pending']).default('pending'),
  affectsProfitability: z.boolean().default(true),
  notes: z.string().trim().max(2000).optional(),
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const updateExpenseSchema = createExpenseSchema
  .partial()
  .extend({ version: z.number().int().nonnegative() });
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

export interface ExpenseDto {
  id: string;
  period: string;
  concept: string;
  category: string;
  amountMinor: string;
  recurrence: string;
  responsible: string | null;
  monotributo: string | null;
  payStatus: string;
  affectsProfitability: boolean;
  notes: string | null;
  version: number;
}

// ── Alerts ───────────────────────────────────────────────────────────────────
export const createAlertSchema = z.object({
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  type: z.enum(['cobros', 'facturacion', 'equipo', 'rentabilidad', 'comercial', 'arca']),
  entity: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(500),
  responsible: z.string().trim().max(120).optional(),
  status: z.enum(['open', 'in_progress', 'resolved']).default('open'),
});
export type CreateAlertInput = z.infer<typeof createAlertSchema>;

export const updateAlertSchema = createAlertSchema
  .partial()
  .extend({ version: z.number().int().nonnegative() });
export type UpdateAlertInput = z.infer<typeof updateAlertSchema>;

export interface AlertDto {
  id: string;
  period: string;
  severity: string;
  type: string;
  entity: string;
  description: string;
  responsible: string | null;
  status: string;
  version: number;
}

// ── Checklist ────────────────────────────────────────────────────────────────
export const setChecklistSchema = z.object({
  item: z.string().trim().min(1).max(80),
  value: z.boolean(),
});

// ── Monotributo watch (derived) + the assembled plan bundle ──────────────────
export interface MonotributoWatchDto {
  code: string;
  label: string;
  annualBilledMinor: string;
  annualLimitMinor: string | null;
}

export interface PlanMemberDto {
  id: string;
  name: string;
  role: string;
}

/** One recipient type's registered outflow for the month. Money in MINOR units. */
export interface PaymentTotalDto {
  recipientType: string;
  /** Committed: what was recorded as owed, whether or not it has been paid yet. */
  totalMinor: string;
  /** Settled: the part actually paid out. */
  paidMinor: string;
  count: number;
}

/**
 * One member's payroll payments for the month. Keyed by the person so the front can take
 * ONE of the two overlapping records (statement vs payments) rather than their sum.
 * `teamMemberId` is null for a payroll payment that names no member; those overlap nothing.
 */
export interface TeamPaymentTotalDto {
  teamMemberId: string | null;
  totalMinor: string;
  paidMinor: string;
}

/** One outflow row, for the read-only Gastos list. Not a money source: see PaymentTotalDto. */
export interface PlanPaymentDto {
  id: string;
  recipientType: string;
  recipientName: string;
  concept: string;
  totalMinor: string;
  paidMinor: string;
  status: string;
  expectedDate: string | null;
  paymentDate: string | null;
}

export interface PlanBundleDto {
  period: string;
  status: string;
  checklist: Record<string, boolean>;
  /** True when the month has more receivables or payouts than one page carries, so the
   *  figures in this bundle are a SUBSET. The month must not be closed on it. */
  truncated: boolean;
  receivables: ReceivableDto[];
  payouts: PayoutStatementDto[];
  productions: ProductionDto[];
  expenses: ExpenseDto[];
  alerts: AlertDto[];
  monotributo: MonotributoWatchDto[];
  /**
   * The month's outflows, from the Pagos module. `paymentTotals` is an EXACT groupBy and
   * is the only thing money may be derived from; `payments` is a capped list for display
   * and may be short of `paymentTotals[].count`.
   *
   * Both are optional on the wire so a browser running the previous bundle shape during a
   * deploy reads them as absent rather than crashing.
   */
  paymentTotals: PaymentTotalDto[];
  teamPaymentTotals: TeamPaymentTotalDto[];
  payments: PlanPaymentDto[];
  /** Pagos of the period in a lane other than pesos, which every figure above
   *  excludes. Surfaced so the omission is stated on screen instead of leaving the
   *  operator looking for a pago she recorded and cannot find. */
  otherLanePaymentCount: number;
  /** Roster (id/name/role) so the front can name the payout statements + productions. */
  members: PlanMemberDto[];
}

/**
 * What a communication lead may send (2026-10-19): the production as it happened, never its
 * money. The cost of the people on it, whether and how it is billed, and its status are the
 * studio's to set — so a lead cannot bill a client or approve by typing a field.
 */
export function leadCreateInput(input: CreateProductionInput): CreateProductionInput {
  const { totalCostMinor: _cost, billAmountMinor: _bill, billable: _billable, clientServiceId: _line, ...rest } = input;
  return { ...rest, status: 'pending' };
}
export function leadUpdateInput(input: UpdateProductionInput): UpdateProductionInput {
  const {
    totalCostMinor: _cost, billAmountMinor: _bill, billable: _billable, clientServiceId: _line, status: _status, ...rest
  } = input;
  return rest;
}

/** A production as a communication lead may see it: no pay, no billed amount. */
export function withoutMoney(dto: ProductionDto): ProductionDto {
  return { ...dto, totalCostMinor: null, billAmountMinor: null };
}

