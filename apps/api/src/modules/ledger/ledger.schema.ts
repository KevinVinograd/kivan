/** Edge validation (Zod) + DTOs for the Cuentas corrientes (ledger) module. */
import { Currency } from '@hold/shared';
import { z } from 'zod';

export const LEDGER_ENTITY_TYPES = ['client', 'teamMember', 'provider'] as const;

export const ledgerListParamSchema = z.object({
  entityType: z.enum(LEDGER_ENTITY_TYPES),
});

export const ledgerStatementParamSchema = z.object({
  entityType: z.enum(LEDGER_ENTITY_TYPES),
  entityId: z.uuid(),
});

export const ledgerQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  /**
   * Scope the statement to one calendar month. Any day within the month works —
   * the service takes its month bounds — so a caller holding `2026-07-01` and one
   * holding `2026-07-18` get the same statement.
   *
   * Omitted, the response is byte-identical to what it was before this existed:
   * the whole account, newest first. `/cuentas-corrientes` calls it that way.
   */
  period: z.coerce.date().optional(),
  /**
   * Scope the ENTRIES and the period summary to one currency lane. The balances come
   * back per lane either way: a running balance is per lane, so a single number for a
   * multi-lane account would omit money from a figure somebody reconciles against.
   */
  currency: Currency.optional(),
});

export interface LedgerAccountDto {
  entityType: string;
  entityId: string;
  /** The lane this balance belongs to. One account may appear once per lane. */
  currency: string;
  balanceMinor: string;
}

export interface LedgerEntryDto {
  id: string;
  seq: number;
  currency: string;
  period: string;
  type: string;
  description: string;
  debitMinor: string;
  creditMinor: string;
  balanceMinor: string;
  referenceType: string | null;
  referenceId: string | null;
  invoiceNumber: string | null;
  date: string;
}

/**
 * What one month did to a running account. Present only when the caller scoped
 * the request with `period`.
 *
 * The figures CLOSE: `opening + debit − settled − creditAdjustments === closing`.
 * That identity is why they are aggregated over the entries' `period` rather than
 * read off the running `balanceMinor` column — see `ledger.repo.ts § periodSummary`
 * for why the running column cannot answer this question.
 */
export interface LedgerPeriodSummaryDto {
  /**
   * WHICH LANE these five figures describe. Never inferable from the request: an
   * unscoped call returns entries from every lane while the summary is necessarily one
   * lane's (five figures that close as an identity cannot span two), and it defaults to
   * pesos. Without this field that default is invisible, and a consumer reading a
   * mixed-lane entry list beside a peso-only summary has no way to tell.
   */
  currency: string;
  /** Balance carried in from every earlier period. */
  openingBalanceMinor: string;
  /** Charged to the account during the period (what we came to owe). */
  debitMinor: string;
  /**
   * MONEY THAT MOVED during the period — `payment` and `collection` entries only.
   * Kept apart from the corrections below so a lowered total or a cancelled charge
   * can never be reported as an amount somebody was paid.
   */
  settledMinor: string;
  /**
   * Credits that corrected what was owed rather than settling it: an edit that
   * lowered a total (`adjustment`) or a cancel reversing an outstanding charge
   * (`reversal`). Real movements on the account, but not payments.
   */
  creditAdjustmentsMinor: string;
  /** Balance at the close: opening + debit − settled − creditAdjustments. */
  closingBalanceMinor: string;
}

export interface LedgerStatementDto {
  entityType: string;
  entityId: string;
  /**
   * The account's LIVE balances, PER LANE — the running total of every entry ever,
   * which is NOT `period.closingBalanceMinor` whenever entries exist in later periods.
   * Two different questions, deliberately both answered.
   *
   * Keyed by currency and carrying every lane the account has, even when the request
   * scoped the entries to one. A single number here was a running balance across lanes:
   * a dollar pago to a provider owed pesos netted against the peso figure.
   */
  balancesMinor: Record<string, string>;
  /**
   * The PESO lane of `balancesMinor`, kept as its own key.
   *
   * Not redundant: Deploy Web and Deploy API fire independently, so a cached bundle
   * that requires this field talks to this API for as long as the browser holds it.
   * Removing the key would throw at that reader's fetch boundary and put the panel
   * into its error state. It is the ARS balance specifically, never a cross-lane sum.
   */
  balanceMinor: string;
  total: number;
  entries: LedgerEntryDto[];
  /** Only when the request carried a `period`; otherwise absent. */
  period?: LedgerPeriodSummaryDto;
}

interface EntryRecord {
  id: string;
  seq: number;
  currency: string;
  period: Date;
  type: string;
  description: string;
  debitMinor: bigint;
  creditMinor: bigint;
  balanceMinor: bigint;
  referenceType: string | null;
  referenceId: string | null;
  invoiceNumber: string | null;
  date: Date;
}

export function toLedgerEntryDto(r: EntryRecord): LedgerEntryDto {
  return {
    id: r.id,
    seq: r.seq,
    currency: r.currency,
    period: r.period.toISOString().slice(0, 10),
    type: r.type,
    description: r.description,
    debitMinor: r.debitMinor.toString(),
    creditMinor: r.creditMinor.toString(),
    balanceMinor: r.balanceMinor.toString(),
    referenceType: r.referenceType,
    referenceId: r.referenceId,
    invoiceNumber: r.invoiceNumber,
    date: r.date.toISOString(),
  };
}
