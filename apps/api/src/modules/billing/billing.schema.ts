/** Edge validation (Zod) + DTOs for the Billing / Cobros module. */
import { z } from 'zod';
import { BillingStatus, CollectionStatus, Currency, MinorUnitsNonNeg } from '@hold/shared';

const isoDate = z.coerce.date();

export const createReceivableSchema = z.object({
  clientId: z.uuid(),
  period: isoDate,
  service: z.string().trim().min(1).max(200),
  baseAmountMinor: MinorUnitsNonNeg,
  extraAmountMinor: MinorUnitsNonNeg.optional(),
  discountAmountMinor: MinorUnitsNonNeg.optional(),
  currency: Currency.default('ARS'),
  dueDate: isoDate,
});
export type CreateReceivableInput = z.infer<typeof createReceivableSchema>;

/**
 * Bill part (or all) of a client's ONE-TIME service: an anticipo, an etapa, the balance.
 *
 * The amount is in the CONTRACT's currency — the one the line is priced in — and the
 * server converts it exactly as it converts a retainer. No `service` label and no client
 * id travel: both are read from the line, so the cobro cannot be filed under a service or
 * a client the line does not belong to.
 */
export const serviceLineChargeSchema = z.object({
  clientServiceId: z.uuid(),
  amountMinor: MinorUnitsNonNeg,
  period: isoDate,
  dueDate: isoDate,
});
export type ServiceLineChargeInput = z.infer<typeof serviceLineChargeSchema>;

// One itemized extra behind the extraAmountMinor aggregate (Operación mensual).
// amountMinor is a STRING (minor units) so the row is JSON-serialisable.
const receivableExtraSchema = z.object({
  id: z.string().max(60).optional(),
  description: z.string().trim().min(1).max(200),
  amountMinor: z.string().regex(/^\d+$/, 'minor units'),
  billable: z.boolean(),
});
export type ReceivableExtra = z.infer<typeof receivableExtraSchema>;

export const updateReceivableSchema = z
  .object({
    service: z.string().trim().min(1).max(200).optional(),
    baseAmountMinor: MinorUnitsNonNeg.optional(),
    extraAmountMinor: MinorUnitsNonNeg.optional(),
    discountAmountMinor: MinorUnitsNonNeg.optional(),
    dueDate: isoDate.optional(),
    // Monthly-plan fields (per-client-month workflow).
    reviewStatus: z.enum(['pending_review', 'reviewed', 'new', 'churned', 'paused']).optional(),
    effectiveDate: isoDate.nullable().optional(),
    planNotes: z.string().trim().max(2000).optional(),
    extras: z.array(receivableExtraSchema).max(50).optional(),
    // The costs a cobro still carries: pauta and allocated fixed. The route additionally
    // requires the `profitability` capability to touch them.
    //
    // Design, communication and production USED to be entered here too. They left on
    // 2026-10-01: the cost of the PEOPLE on a client now comes from their assignments
    // ("Le pagamos por este cliente"), and keeping a second place to type the same
    // salary is how a designer gets counted twice and a margin comes out lower than it
    // is. Viáticos followed in 2026-10: they are recorded on each production, which is
    // where HOLD tracks them and marks them paid. Not one of 52 cobros had ever filled
    // any of the four in. The columns stay in the table (forward-only); the keys are
    // simply no longer accepted, and Zod strips them.
    costPautaMinor: MinorUnitsNonNeg.optional(),
    costFixedMinor: MinorUnitsNonNeg.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });
export type UpdateReceivableInput = z.infer<typeof updateReceivableSchema>;

/** The cost keys a cobro accepts — the fields that need the `profitability` capability. */
export const COST_FIELDS = [
  'costPautaMinor',
  'costFixedMinor',
] as const;

export const collectSchema = z.object({
  amountMinor: MinorUnitsNonNeg,
  /**
   * When the cash arrived. Optional, defaulting to now, because a cobro is often
   * registered days later and stamping it with the moment of data entry records a
   * date that never happened. Note this does NOT re-bucket the money: every
   * aggregate filters on the receivable's own `period`, which is unchanged.
   */
  collectedAt: z.coerce.date().optional(),
  /**
   * WHERE the cash landed — a treasury account. Optional, because a collection whose
   * destination nobody recorded is a real thing and inventing one is the defect this
   * closes. When present, that account's balance moves by exactly this amount inside
   * the same transaction, which is what stops the Cashflow Posición falling when money
   * comes in.
   */
  treasuryAccountId: z.uuid().optional(),
  idempotencyKey: z.string().trim().min(1).max(120).optional(),
});

export const generateInvoiceSchema = z.object({ emitterId: z.uuid() });

/** Associate an externally emitted factura: its number + when it was issued. */
export const associateInvoiceSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(40),
  issuedAt: isoDate,
});
export type AssociateInvoiceInput = z.infer<typeof associateInvoiceSchema>;

export const listReceivablesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  period: isoDate.optional(),
  status: CollectionStatus.optional(),
  billingStatus: BillingStatus.optional(),
});
export type ListReceivablesQuery = z.infer<typeof listReceivablesQuerySchema>;

export const receivableIdParamSchema = z.object({ id: z.uuid() });

export const kpisQuerySchema = z.object({ period: isoDate.optional() });

/** The month whose retainers are being previewed / generated. */
export const monthlyFeePeriodQuerySchema = z.object({ period: isoDate });

/**
 * The dollar rate for one month.
 *
 * `arsPerUsdMinor` is ARS centavos per 1 USD, so 1.234,50 arrives as 123450 — the same
 * minor-unit convention every amount in this module uses, and the reason the conversion
 * is integer arithmetic. The lower bound is 1 rather than 0: a rate of zero would bill
 * every dollar client at nothing, and it is far likelier to be an empty field than a
 * deliberate figure. The upper bound is a typo guard, not a forecast.
 */
export const setExchangeRateSchema = z.object({
  period: isoDate,
  arsPerUsdMinor: z.coerce.bigint().min(1n).max(100_000_000n),
});
export type SetExchangeRateInput = z.infer<typeof setExchangeRateSchema>;

export interface ExchangeRateDto {
  /** The month it belongs to, normalized to the 1st. */
  period: string;
  arsPerUsdMinor: string;
  /** When it was last set, so the dialog can say a rate is this month's and not a leftover. */
  updatedAt: string;
}

/**
 * Generate the month's retainer cobros.
 *
 * The caller sends the LIST it was shown in the preview, not just a period, so the write
 * is the one the operator actually looked at: a client that changed underneath (paused,
 * fee zeroed, already generated) is skipped and REPORTED rather than silently swept in.
 * Amounts are deliberately absent — the fee is re-read from the client inside the
 * transaction, because a bulk money action must never bill a number the browser chose.
 */
export const generateMonthlyFeesSchema = z.object({
  period: isoDate,
  dueDate: isoDate,
  items: z
    .array(
      z.object({
        clientId: z.uuid(),
        // STAYS REQUIRED. Making it optional would turn the duplicate guard into a
        // comparison against `undefined`, so a client already billed by hand for a
        // service would sail through and be billed a second time.
        service: z.string().trim().min(1).max(200),
        /**
         * Which of the client's priced services to bill THIS month — the studio's
         * "agregar o deducir servicios brindados o no para un mes en particular".
         *
         * IDS, never amounts: the invariant above holds, and the server prices the
         * selection from the client's own lines. An id that is not this client's live,
         * active line is dropped rather than trusted.
         *
         * Absent means "everything on the contract", which is also what an older
         * browser sends — so a stale bundle bills the full retainer, exactly as it
         * did before this field existed.
         */
        clientServiceIds: z.array(z.uuid()).max(50).optional(),
        /**
         * Which of the client's pending productions to bill on this cobro. IDS, never
         * amounts: the server re-reads each one's `billAmountMinor` and refuses any that
         * is not this client's, linked, billable and still unbilled.
         *
         * Absent means NONE — the opposite default from `clientServiceIds`, on purpose: an
         * older browser never showed the productions, and billing money the operator never
         * saw on screen is the one thing a preview-before-write dialog exists to prevent.
         */
        productionIds: z.array(z.uuid()).max(200).optional(),
      }),
    )
    .min(1)
    .max(500),
});
export type GenerateMonthlyFeesInput = z.infer<typeof generateMonthlyFeesSchema>;

/** Why a client is not going to be billed by this run (or was not). */
export type MonthlyFeeSkipReason =
  /** A generated cobro already exists for this (client, period). */
  | 'already_generated'
  /** A cobro for the same service and period was created by hand — almost certainly
   *  this same retainer, so generating a second one would double-bill. */
  | 'manual_exists'
  /** The client is no longer active, or its monthly fee is zero. */
  | 'not_billable'
  /** The retainer is priced in a foreign currency and this month has no rate loaded, so
   *  there is no honest peso figure to bill. Skipped rather than billed in dollars: a
   *  cobro in USD settles into the account's USD lane, and the money arrives in pesos. */
  | 'missing_exchange_rate';

export interface MonthlyFeeCandidateDto {
  clientId: string;
  clientName: string;
  /** The client's contracted services, for the picker when there is more than one. */
  services: string[];
  /** The service the cobro would carry: the single contracted one, else null (the
   *  operator picks). Never guessed from a list of several. */
  suggestedService: string | null;
  monthlyFeeMinor: string;
  currency: string;
  /**
   * What this client would actually be billed, in ARS, when the retainer is priced in a
   * foreign currency and the month has a rate. Null for a peso client (there is nothing
   * to convert) and null when the rate is missing (`skipReason` says so).
   *
   * Computed here rather than in the browser so the figure the operator approves is the
   * one the generator writes, down to the centavo.
   */
  convertedArsMinor: string | null;
  /**
   * The client's standing discount: the rate as agreed (basis points, 1000 = 10%) and
   * what it comes to on this cobro. Both are sent because the dialog shows the rule and
   * the operator approves the amount, and only the amount is written.
   *
   * `discountAmountMinor` is null when the client could not be priced at all (a missing
   * exchange rate), which is not the same as a discount of zero.
   */
  discountPercentBp: number | null;
  discountAmountMinor: string | null;
  /**
   * The client's PRICED contract lines, when it has any.
   *
   * Empty for a client still on a hand-typed fee — which is most of the book, and is
   * the state this feature deliberately left working untouched. The dialog uses the
   * PRESENCE of this field (not its length) to decide whether to offer the per-service
   * checklist at all: an API that predates it sends nothing, and a browser that
   * offered the checklist anyway would send ids the old server strips, billing the
   * full fee while the screen said otherwise.
   */
  lines: { id: string; name: string; priceMinor: string }[];
  /**
   * The client's productions waiting to be billed: linked to a per-production service,
   * billable, with an amount, not yet on any cobro, and logged in this period or before.
   * Amounts are in the CONTRACT's currency, like the lines. Productions logged after this
   * month's cobro was generated wait for the next one.
   */
  productions: { id: string; date: string; title: string; serviceName: string; amountMinor: string }[];
  /** null = ready to generate. */
  skipReason: MonthlyFeeSkipReason | null;
  /** The cobro already covering it, when there is one. */
  existingReceivableId: string | null;
  /** Services this client was already billed by hand this period. Informational: a second
   *  cobro under a genuinely different service can be legitimate, so the operator decides
   *  rather than being silently skipped. */
  manualServices: string[];
}

export interface MonthlyFeePreviewDto {
  period: string;
  items: MonthlyFeeCandidateDto[];
  /** Active clients carrying no monthly fee, by name. They can never appear in `items`
   *  — the eligibility query excludes them — so without this the operator sees a roster
   *  shorter than their active-client count and nothing explains the difference. */
  withoutFee: string[];
  /** This month's dollar rate, or null when nobody has loaded one. Carried on the preview
   *  rather than fetched separately: the dialog needs it to explain its own numbers, and
   *  a second request would be a second thing that can fail on the way to one screen. */
  exchangeRate: ExchangeRateDto | null;
}

export interface MonthlyFeeGenerationDto {
  period: string;
  created: ReceivableDto[];
  skipped: { clientId: string; clientName: string; reason: MonthlyFeeSkipReason }[];
}

export interface ReceivableDto {
  id: string;
  clientId: string;
  clientName: string;
  /** Client fiscal/contact fields the Cobros list searches on (§8.4). */
  businessName: string | null;
  taxId: string | null;
  contactName: string | null;
  period: string;
  service: string;
  baseAmountMinor: string;
  extraAmountMinor: string;
  discountAmountMinor: string;
  totalAmountMinor: string;
  collectedAmountMinor: string;
  outstandingMinor: string;
  currency: string;
  /**
   * Where the amount came from, when it was priced in one currency and billed in another.
   * All three are null together, on every cobro billed in the currency it was priced in.
   *
   * A record, not a live conversion: `fxRateMinor` is the rate this cobro was generated
   * at, and re-loading the month's rate does not change it.
   */
  originalCurrency: string | null;
  originalAmountMinor: string | null;
  fxRateMinor: string | null;
  dueDate: string;
  /** When the cash arrived (latest collection wins). Null = never collected. */
  collectedAt: string | null;
  status: string;
  billingStatus: string;
  emitterId: string | null;
  /** Emitter code (e.g. the monotributo profile) when invoiced, else null. */
  emitterCode: string | null;
  invoiceNumber: string | null;
  cae: string | null;
  invoiceIssuedAt: string | null;
  // Monthly-plan fields (per-client-month workflow).
  reviewStatus: string | null;
  effectiveDate: string | null;
  planNotes: string | null;
  extras: ReceivableExtra[];
  /** 'manual' | 'monthly_fee' — how the row came to exist. The Cobros list uses it to
   *  tell a generated retainer from one somebody typed. */
  source: string;
  /** Where the cash landed, when the collection said. Null = nobody recorded it, and
   *  the UI must show nothing rather than a plausible-looking default. */
  treasuryAccountId: string | null;
  /** That account's name, joined for display. Null when there is no destination. */
  treasuryAccountName: string | null;
  // Cost by area, in minor units. Always serialized; the UI decides who may SEE them
  // (the `profitability` capability), and only that capability may write them.
  costDesignMinor: string;
  costCommMinor: string;
  costProductionMinor: string;
  costViaticsMinor: string;
  costPautaMinor: string;
  costFixedMinor: string;
  version: number;
  createdAt: string;
}

export interface PaginatedReceivablesDto {
  items: ReceivableDto[];
  total: number;
  limit: number;
  offset: number;
}

export interface ReceivableKpisDto {
  count: number;
  totalBilledMinor: string;
  totalCollectedMinor: string;
  totalOutstandingMinor: string;
}

export interface InvoiceEmitterDto {
  id: string;
  code: string;
  label: string;
  cuit: string | null;
  puntoDeVenta: number;
  connected: boolean;
  monthlyLimitMinor: string | null;
  annualLimitMinor: string | null;
  monthIssuedMinor: string;
}

interface ReceivableRecord {
  id: string;
  clientId: string;
  client: { name: string; businessName: string | null; taxId: string | null; contactName: string | null };
  emitter: { code: string } | null;
  period: Date;
  service: string;
  baseAmountMinor: bigint;
  extraAmountMinor: bigint;
  discountAmountMinor: bigint;
  totalAmountMinor: bigint;
  collectedAmountMinor: bigint;
  currency: string;
  originalCurrency: string | null;
  originalAmountMinor: bigint | null;
  fxRateMinor: bigint | null;
  dueDate: Date;
  collectedAt: Date | null;
  status: string;
  billingStatus: string;
  emitterId: string | null;
  invoiceNumber: string | null;
  cae: string | null;
  invoiceIssuedAt: Date | null;
  reviewStatus: string | null;
  effectiveDate: Date | null;
  planNotes: string | null;
  extras: unknown;
  source: string;
  treasuryAccountId: string | null;
  treasuryAccount: { name: string } | null;
  costDesignMinor: bigint;
  costCommMinor: bigint;
  costProductionMinor: bigint;
  costViaticsMinor: bigint;
  costPautaMinor: bigint;
  costFixedMinor: bigint;
  version: number;
  createdAt: Date;
}

/** Narrow the stored extras JSON to the DTO shape, dropping malformed entries. */
function toExtras(v: unknown): ReceivableExtra[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((e) =>
    e && typeof e === 'object' && typeof (e as ReceivableExtra).description === 'string'
      ? [
          {
            id: (e as ReceivableExtra).id,
            description: (e as ReceivableExtra).description,
            amountMinor: String((e as ReceivableExtra).amountMinor ?? '0'),
            billable: Boolean((e as ReceivableExtra).billable),
          },
        ]
      : [],
  );
}

/**
 * The client fields a receivable DTO reports, and therefore the minimum a caller must hold
 * to build one WITHOUT re-reading the client. Exported so the month generator can hand over
 * the record it already loaded instead of spending a round trip per client on the same row.
 */
export type ReceivableClientFields = ReceivableRecord['client'];

export function toReceivableDto(r: ReceivableRecord): ReceivableDto {
  return {
    id: r.id,
    clientId: r.clientId,
    clientName: r.client.name,
    businessName: r.client.businessName,
    taxId: r.client.taxId,
    contactName: r.client.contactName,
    period: r.period.toISOString().slice(0, 10),
    service: r.service,
    baseAmountMinor: r.baseAmountMinor.toString(),
    extraAmountMinor: r.extraAmountMinor.toString(),
    discountAmountMinor: r.discountAmountMinor.toString(),
    totalAmountMinor: r.totalAmountMinor.toString(),
    collectedAmountMinor: r.collectedAmountMinor.toString(),
    outstandingMinor: (r.totalAmountMinor - r.collectedAmountMinor).toString(),
    currency: r.currency,
    originalCurrency: r.originalCurrency,
    originalAmountMinor: r.originalAmountMinor?.toString() ?? null,
    fxRateMinor: r.fxRateMinor?.toString() ?? null,
    dueDate: r.dueDate.toISOString().slice(0, 10),
    collectedAt: r.collectedAt?.toISOString() ?? null,
    status: r.status,
    billingStatus: r.billingStatus,
    emitterId: r.emitterId,
    emitterCode: r.emitter?.code ?? null,
    invoiceNumber: r.invoiceNumber,
    cae: r.cae,
    invoiceIssuedAt: r.invoiceIssuedAt?.toISOString() ?? null,
    reviewStatus: r.reviewStatus,
    effectiveDate: r.effectiveDate ? r.effectiveDate.toISOString().slice(0, 10) : null,
    planNotes: r.planNotes,
    extras: toExtras(r.extras),
    source: r.source,
    treasuryAccountId: r.treasuryAccountId,
    treasuryAccountName: r.treasuryAccount?.name ?? null,
    costDesignMinor: r.costDesignMinor.toString(),
    costCommMinor: r.costCommMinor.toString(),
    costProductionMinor: r.costProductionMinor.toString(),
    costViaticsMinor: r.costViaticsMinor.toString(),
    costPautaMinor: r.costPautaMinor.toString(),
    costFixedMinor: r.costFixedMinor.toString(),
    version: r.version,
    createdAt: r.createdAt.toISOString(),
  };
}
