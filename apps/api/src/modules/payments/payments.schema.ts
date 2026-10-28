/** Edge validation (Zod) + DTOs for the Payments / Pagos module. */
import { z } from 'zod';
import { Currency, MinorUnitsNonNeg, PaymentStatus, RecipientType } from '@hold/shared';

const isoDate = z.coerce.date();

export const createProviderSchema = z.object({
  name: z.string().trim().min(1).max(200),
  taxId: z.string().trim().max(40).optional(),
  bankId: z.uuid().optional(),
});
export type CreateProviderInput = z.infer<typeof createProviderSchema>;

export const createPaymentSchema = z
  .object({
    recipientType: RecipientType,
    teamMemberId: z.uuid().optional(),
    providerId: z.uuid().optional(),
    /** WHICH monotributista this pago is for. A workspace runs up to three emisores with
     *  their own limits, so a `tax` commitment can only be superseded by identity once
     *  the pago says which one — collapsing them onto a single AFIP-shaped provider would
     *  let one monotributista's cuota net against another's. */
    invoiceEmitterId: z.uuid().optional(),
    recipientName: z.string().trim().min(1).max(200),
    period: isoDate,
    concept: z.string().trim().min(1).max(200),
    totalAmountMinor: MinorUnitsNonNeg,
    currency: Currency.default('ARS'),
    expectedDate: isoDate,
    method: z.string().trim().max(60).optional(),
  })
  .refine((v) => (v.recipientType === 'provider' ? v.providerId !== undefined : true), {
    message: 'providerId is required when recipientType is provider',
    path: ['providerId'],
  })
  .refine(
    (v) =>
      v.recipientType === 'collaborator' || v.recipientType === 'employee'
        ? v.teamMemberId !== undefined
        : true,
    { message: 'teamMemberId is required for collaborator/employee', path: ['teamMemberId'] },
  );
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export const updatePaymentSchema = z
  .object({
    concept: z.string().trim().min(1).max(200).optional(),
    totalAmountMinor: MinorUnitsNonNeg.optional(),
    expectedDate: isoDate.optional(),
    method: z.string().trim().max(60).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });
export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;

export const registerPaymentSchema = z.object({
  amountMinor: MinorUnitsNonNeg,
  /**
   * When the money actually moved. Optional, defaulting to now, because a payment
   * is often entered days after the fact and stamping it with the moment of data
   * entry records a date that never happened.
   */
  paymentDate: z.coerce.date().optional(),
  /**
   * WHERE the cash left from — a treasury account. Optional for the same reason its
   * cobro twin is: a payment whose origin nobody recorded is a real thing. When present,
   * that account's balance drops by exactly this amount inside the same transaction.
   */
  treasuryAccountId: z.uuid().optional(),
  /** How it was paid (efectivo, transferencia…). The column and this field have both
   *  existed since the module shipped; nothing ever sent it. */
  method: z.string().trim().max(60).optional(),
  idempotencyKey: z.string().trim().min(1).max(120).optional(),
});

export const listPaymentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  period: isoDate.optional(),
  status: PaymentStatus.optional(),
  recipientType: RecipientType.optional(),
});
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;

export const paymentIdParamSchema = z.object({ id: z.uuid() });
export const kpisQuerySchema = z.object({ period: isoDate.optional() });

export interface ProviderDto {
  id: string;
  name: string;
  taxId: string | null;
  bankId: string | null;
  createdAt: string;
}

export interface PaymentDto {
  id: string;
  recipientType: string;
  teamMemberId: string | null;
  providerId: string | null;
  invoiceEmitterId: string | null;
  recipientName: string;
  period: string;
  concept: string;
  totalAmountMinor: string;
  paidAmountMinor: string;
  outstandingMinor: string;
  currency: string;
  expectedDate: string;
  paymentDate: string | null;
  status: string;
  method: string | null;
  /** Where the cash left from, when the payment said. Null = nobody recorded it. */
  treasuryAccountId: string | null;
  /** That account's name, joined for display. Null when there is no origin. */
  treasuryAccountName: string | null;
  version: number;
  createdAt: string;
}

export interface PaginatedPaymentsDto {
  items: PaymentDto[];
  total: number;
  limit: number;
  offset: number;
}

export interface PaymentKpisDto {
  count: number;
  totalDueMinor: string;
  totalPaidMinor: string;
  totalOutstandingMinor: string;
}

/**
 * A counterparty's banking details. Third-party personal data, which is why it is
 * served by its own endpoint behind `requireCapability('teamBankDetails')` instead
 * of riding along on every row of `GET /payments`.
 *
 * Every field is nullable because `Bank` stores them that way: a row created from a
 * CBU alone genuinely has no `accountHolder`, and a blank is the honest answer.
 */
export interface PaymentBankDto {
  bankName: string | null;
  accountHolder: string | null;
  cbuOrCvu: string | null;
  alias: string | null;
  accountType: string | null;
}

/**
 * Wrapped rather than returned bare so `null` keeps its meaning. A payment to a
 * gasto fijo has no counterparty at all, and one to a colaboradora who never handed
 * over her CBU has a counterparty with no bank on file — both answer `{ bank: null }`,
 * and neither is the 404 that a bare `null` body would be indistinguishable from.
 */
export interface PaymentBankResponseDto {
  bank: PaymentBankDto | null;
}

interface BankRecord {
  bankName: string | null;
  accountHolder: string | null;
  cbuOrCvu: string | null;
  alias: string | null;
  accountType: string | null;
}

export function toPaymentBankDto(r: BankRecord): PaymentBankDto {
  return {
    bankName: r.bankName,
    accountHolder: r.accountHolder,
    cbuOrCvu: r.cbuOrCvu,
    alias: r.alias,
    accountType: r.accountType,
  };
}

/**
 * `PayoutStatement.bankProfile` → the same DTO.
 *
 * The profile is free-form JSON with every field optional, so each one maps to
 * `null` when absent — a statement saved with only an alias must not claim a bank
 * name. `accountType` has no counterpart in the profile and is always null here.
 */
export function bankProfileToDto(profile: unknown): PaymentBankDto {
  const p = (profile ?? {}) as Partial<Record<keyof PaymentBankDto, unknown>>;
  const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
  return {
    bankName: str(p.bankName),
    accountHolder: str(p.accountHolder),
    cbuOrCvu: str(p.cbuOrCvu),
    alias: str(p.alias),
    accountType: null,
  };
}

interface ProviderRecord {
  id: string;
  name: string;
  taxId: string | null;
  bankId: string | null;
  createdAt: Date;
}

export function toProviderDto(r: ProviderRecord): ProviderDto {
  return {
    id: r.id,
    name: r.name,
    taxId: r.taxId,
    bankId: r.bankId,
    createdAt: r.createdAt.toISOString(),
  };
}

interface PaymentRecord {
  id: string;
  recipientType: string;
  teamMemberId: string | null;
  providerId: string | null;
  invoiceEmitterId: string | null;
  recipientName: string;
  period: Date;
  concept: string;
  totalAmountMinor: bigint;
  paidAmountMinor: bigint;
  currency: string;
  expectedDate: Date;
  paymentDate: Date | null;
  status: string;
  method: string | null;
  treasuryAccountId: string | null;
  treasuryAccount: { name: string } | null;
  version: number;
  createdAt: Date;
}

export function toPaymentDto(r: PaymentRecord): PaymentDto {
  return {
    id: r.id,
    recipientType: r.recipientType,
    teamMemberId: r.teamMemberId,
    providerId: r.providerId,
    invoiceEmitterId: r.invoiceEmitterId,
    recipientName: r.recipientName,
    period: r.period.toISOString().slice(0, 10),
    concept: r.concept,
    totalAmountMinor: r.totalAmountMinor.toString(),
    paidAmountMinor: r.paidAmountMinor.toString(),
    outstandingMinor: (r.totalAmountMinor - r.paidAmountMinor).toString(),
    currency: r.currency,
    expectedDate: r.expectedDate.toISOString().slice(0, 10),
    paymentDate: r.paymentDate?.toISOString() ?? null,
    status: r.status,
    method: r.method,
    treasuryAccountId: r.treasuryAccountId,
    treasuryAccountName: r.treasuryAccount?.name ?? null,
    version: r.version,
    createdAt: r.createdAt.toISOString(),
  };
}
