/**
 * Bridges the real Receivables API to the front's (derived-rich) `Receivable`
 * shape. The API returns money in minor units and the raw entity + a joined
 * client name / emitter code; the front works in major units (pesos) and carries
 * a few activity fields with no backend source yet (defaulted here).
 */
import {
  receivablesApi,
  type CreateReceivableInput,
  type ExchangeRateDto,
  type GenerateMonthlyFeesInput,
  type MonthlyFeeSkipReason,
  type ReceivableDto,
  type UpdateReceivableInput,
} from '@/api/receivables'
import type {
  BillingStatus,
  CollectionStatus,
  Receivable,
  ReceivableExtraItem,
} from './cobros-mock-data'
import { apiDateToCalendarDay } from '@/app/lib/iso-date'
import type { TaxProfileId } from './cobranza-format'

/** pesos (major units) → centavos string (minor units). */
const majorToMinor = (major: number): string => String(Math.round(major * 100))

const TAX_PROFILES: readonly string[] = [
  'monotributo_1',
  'monotributo_2',
  'monotributo_3',
  'unassigned',
]

/** Map an emitter code onto a known fiscal profile, defaulting to 'unassigned'. */
function asTaxProfile(code: string | null): TaxProfileId {
  return code && TAX_PROFILES.includes(code) ? (code as TaxProfileId) : 'unassigned'
}

const minorToMajor = (minor: string): number => Number(minor) / 100

/** Map the raw API entity onto the front Receivable, defaulting activity fields. */
export function dtoToReceivable(d: ReceivableDto): Receivable {
  return {
    id: d.id,
    clientId: d.clientId,
    clientName: d.clientName,
    businessName: d.businessName ?? undefined,
    taxId: d.taxId ?? undefined,
    contactName: d.contactName ?? undefined,
    invoiceNumber: d.invoiceNumber ?? undefined,
    period: d.period,
    service: d.service,
    baseAmount: minorToMajor(d.baseAmountMinor),
    extraAmount: minorToMajor(d.extraAmountMinor),
    extras: (d.extras ?? []).map((extra) => ({
      id: extra.id,
      description: extra.description,
      amount: minorToMajor(extra.amountMinor),
      billable: extra.billable,
    })),
    discountAmount: minorToMajor(d.discountAmountMinor),
    totalAmount: minorToMajor(d.totalAmountMinor),
    collectedAmount: minorToMajor(d.collectedAmountMinor),
    // Read, not assumed. A cobro is billed in its client's own lane, so the hardcoded
    // 'ARS' put dollar amounts into the peso totals under a "$".
    currency: d.currency,
    // The three move together or not at all, so one guard covers all of them: a row with a
    // rate but no original amount would render "× $1.234,50" against nothing.
    ...(d.originalCurrency && d.originalAmountMinor && d.fxRateMinor
      ? {
          originalCurrency: d.originalCurrency,
          originalAmount: minorToMajor(d.originalAmountMinor),
          fxRate: minorToMajor(d.fxRateMinor),
        }
      : {}),
    dueDate: d.dueDate,
    // A calendar day, not an instant — see `apiDateToCalendarDay` for why the column
    // carries both picked dates and server-stamped moments, and why each is read
    // differently. Normalized here so every consumer downstream sees the same day.
    collectedAt: d.collectedAt ? apiDateToCalendarDay(d.collectedAt) : undefined,
    treasuryAccountId: d.treasuryAccountId ?? undefined,
    treasuryAccountName: d.treasuryAccountName ?? undefined,
    status: d.status as CollectionStatus,
    billingStatus: d.billingStatus as BillingStatus,
    taxProfileId: asTaxProfile(d.emitterCode),
    // A day, like `collectedAt` two lines up. The column takes both a server `new Date()`
    // and an operator-picked day, and is serialized with `toISOString()`, so a picked date
    // arrives as an instant and renders as the PREVIOUS day in UTC-3. Normalizing here
    // rather than in one reader means every consumer — filters, sorts, the CSV export —
    // sees the same day.
    ...(d.invoiceIssuedAt ? { invoiceIssuedAt: apiDateToCalendarDay(d.invoiceIssuedAt) } : {}),
    cae: d.cae ?? undefined,
    emitterTaxProfile: d.emitterCode ? asTaxProfile(d.emitterCode) : undefined,
    lastActivityLabel: 'Sin actividad',
    lastActivityAt: d.createdAt,
    // Cost by area, in pesos — the margin side of the record (see UpdateCobroInput.costs).
    costs: {
      design: minorToMajor(d.costDesignMinor ?? '0'),
      comm: minorToMajor(d.costCommMinor ?? '0'),
      production: minorToMajor(d.costProductionMinor ?? '0'),
      viatics: minorToMajor(d.costViaticsMinor ?? '0'),
      pauta: minorToMajor(d.costPautaMinor ?? '0'),
      fixed: minorToMajor(d.costFixedMinor ?? '0'),
    },
  }
}

/** Load the workspace's receivables from the API, mapped to the front shape.
 *  The list endpoint caps `limit` at 100, so page through until exhausted. */
export async function fetchReceivables(): Promise<Receivable[]> {
  const LIMIT = 100
  const all: ReceivableDto[] = []
  for (let offset = 0; ; offset += LIMIT) {
    const res = await receivablesApi.list({ limit: LIMIT, offset })
    all.push(...res.items)
    if (all.length >= res.total || res.items.length < LIMIT) break
  }
  return all.map(dtoToReceivable)
}

/** Raw create-cobro inputs from the dialog (amounts in pesos / major units). */
export interface CreateCobroInput {
  clientId: string
  period: string
  service: string
  baseAmount: number
  extraAmount: number
  discountAmount: number
  dueDate: string
}

/** Persist a new cobro and return it in the front shape. */
export async function createReceivableViaApi(input: CreateCobroInput): Promise<Receivable> {
  const body: CreateReceivableInput = {
    clientId: input.clientId,
    period: input.period,
    service: input.service,
    baseAmountMinor: majorToMinor(input.baseAmount),
    extraAmountMinor: majorToMinor(input.extraAmount),
    discountAmountMinor: majorToMinor(input.discountAmount),
    dueDate: input.dueDate,
  }
  return dtoToReceivable(await receivablesApi.create(body))
}

/** Raw edit-cobro inputs from the dialog (amounts in pesos / major units). */
export interface UpdateCobroInput {
  service?: string
  baseAmount?: number
  extraAmount?: number
  discountAmount?: number
  dueDate?: string
  /**
   * Replace the itemized extras.
   *
   * The server stores this as an opaque JSON blob and does NOT sum it: the total is
   * derived from `extraAmountMinor` alone (`billing.service.ts` → `deriveTotal`). So the
   * aggregate is the caller's to keep in step, and this wrapper derives it from the
   * items rather than trusting two independent inputs to agree. Sending only `extras`
   * persisted the description and left the amount owed unchanged — the operator was told
   * the extra was added and the client still owed the old total.
   */
  extras?: ReceivableExtraItem[]
  /**
   * The costs a cobro carries, in pesos: what the work COST the studio beyond the people
   * on it. They never move the billed total, and the server refuses them without the
   * `profitability` capability.
   *
   * No design / communication / production: since 2026-10-01 the cost of the people on a
   * client comes from their assignments, and offering a second place to type the same
   * salary is how a designer gets counted twice. No viáticos either: they live on each
   * production.
   */
  costs?: {
    pauta: number
    fixed: number
  }
}

/** The aggregate the total is derived from, summed from the items. */
export function extrasTotal(extras: ReceivableExtraItem[]): number {
  return extras.reduce((sum, extra) => sum + extra.amount, 0)
}

/**
 * Persist an edit to a cobro and return the updated front shape.
 *
 * Only the fields the caller actually supplied are sent. It used to build the body
 * unconditionally, so a partial edit (adding an extra, say) would have blanked `service`
 * and zeroed every amount it did not mention.
 */
export async function updateReceivableViaApi(
  id: string,
  input: UpdateCobroInput,
): Promise<Receivable> {
  const body: UpdateReceivableInput = {}
  if (input.service !== undefined) body.service = input.service
  if (input.baseAmount !== undefined) body.baseAmountMinor = majorToMinor(input.baseAmount)
  if (input.discountAmount !== undefined) {
    body.discountAmountMinor = majorToMinor(input.discountAmount)
  }
  if (input.dueDate !== undefined) body.dueDate = input.dueDate
  if (input.costs !== undefined) {
    body.costPautaMinor = majorToMinor(input.costs.pauta)
    body.costFixedMinor = majorToMinor(input.costs.fixed)
  }
  if (input.extras !== undefined) {
    body.extras = input.extras.map((extra) => ({
      ...(extra.id ? { id: extra.id } : {}),
      description: extra.description,
      amountMinor: majorToMinor(extra.amount),
      billable: extra.billable,
    }))
    // Sent together, always. The server treats `extras` as metadata and derives the
    // total from this aggregate, so omitting it stores the itemization against an
    // unchanged amount owed. Derived from the items so the two cannot disagree.
    body.extraAmountMinor = majorToMinor(input.extraAmount ?? extrasTotal(input.extras))
  } else if (input.extraAmount !== undefined) {
    body.extraAmountMinor = majorToMinor(input.extraAmount)
  }
  return dtoToReceivable(await receivablesApi.update(id, body))
}

/** Register a collection (pesos) against a cobro; idempotent per call. `collectedAt` is the
 *  ISO date the cash actually arrived (optional). */
export async function collectReceivableViaApi(
  id: string,
  amount: number,
  collectedAt?: string,
  treasuryAccountId?: string,
): Promise<Receivable> {
  const key = crypto.randomUUID()
  return dtoToReceivable(
    await receivablesApi.collect(id, majorToMinor(amount), key, collectedAt, treasuryAccountId),
  )
}

/** Generate the comprobante for a cobro from the given emitter. */
export async function generateInvoiceViaApi(id: string, emitterId: string): Promise<Receivable> {
  return dtoToReceivable(await receivablesApi.generateInvoice(id, emitterId))
}

/** Associate an externally emitted factura (manual) and return the updated front shape. */
export async function associateInvoiceViaApi(
  id: string,
  invoiceNumber: string,
  issuedAt: string,
): Promise<Receivable> {
  return dtoToReceivable(await receivablesApi.associateInvoice(id, invoiceNumber, issuedAt))
}

/** Mark the factura / cuenta corriente as sent and return the updated front shape. */
export async function markInvoiceSentViaApi(id: string): Promise<Receivable> {
  return dtoToReceivable(await receivablesApi.markInvoiceSent(id))
}

/** Cancel (anular) a cobro and return the updated front shape. */
export async function cancelReceivableViaApi(id: string): Promise<Receivable> {
  return dtoToReceivable(await receivablesApi.cancel(id))
}

/** One client the month generator would bill, in pesos. */
export interface MonthlyFeeCandidate {
  clientId: string
  clientName: string
  services: string[]
  /** The service the cobro would carry, or null when the client contracts several and
   *  the operator has to pick one. Never guessed. */
  suggestedService: string | null
  monthlyFee: number
  /** The client's own billing currency. Carried through because the fee is denominated
   *  in it: dropping it made every retainer render with the peso formatter and let the
   *  dialog add dollars to pesos in one total. */
  currency: string
  /** The pesos this client would actually be billed, when the retainer is priced in
   *  dollars and the month has a rate. Null for a peso client, and null when the rate is
   *  missing — which `skipReason` reports as `missing_exchange_rate`. */
  convertedArs: number | null
  /** The client's standing discount — the agreed rate as a percent, and the amount it
   *  takes off this cobro. Both null on an API that predates the field, which reads as
   *  "no discount" and is safe: the SERVER prices the write either way, so a stale
   *  browser can only under-describe a cobro, never cause a wrong one. */
  discountPercent: number | null
  discountAmount: number | null
  /** The client's priced contract lines. `null` (not `[]`) when the API predates the
   *  field — the dialog must be able to tell "this server cannot honour a per-service
   *  selection" from "this client has no priced services", because sending ids to the
   *  first bills the full fee with nothing on screen to say so. */
  lines: { id: string; name: string; price: number }[] | null
  /** Productions waiting to be billed on this client's cobro, in the contract's currency.
   *  `[]` on an API that predates them, which is safe: the server bills none it was not
   *  sent. */
  productions: { id: string; date: string; title: string; serviceName: string; amount: number }[]
  /** The month's ARS-per-USD rate, for pricing a dollar client whose cobro is made of
   *  productions only (it has no retainer to derive the rate from). Null without one. */
  arsPerUsd: number | null
  /** null = ready to bill. Anything else is a client this run will not touch. */
  skipReason: MonthlyFeeSkipReason | null
  /** Services this client was already billed by hand this period. Informational: the
   *  server is what actually refuses a same-service duplicate, so this only keeps the
   *  dialog from queueing a row the run would skip, and from claiming a cobro it cannot
   *  create. An API that predates the field reads as `[]`, which is safe precisely
   *  BECAUSE the server is the guard. */
  manualServices: string[]
}

/** The dollar rate one month is billed at, in major units (1234.5 = $1.234,50 per USD). */
export interface MonthlyExchangeRate {
  period: string
  arsPerUsd: number
  updatedAt: string
}

/** What the month generator would create for a period, with nothing written. */
export interface MonthlyFeePreview {
  items: MonthlyFeeCandidate[]
  /** Active clients the generator cannot offer, because no fee is loaded on them. */
  withoutFee: string[]
  /** This month's dollar rate, or null when nobody loaded one. Rides the preview rather
   *  than a second request: the dialog needs it to explain its own numbers, and one
   *  screen should not depend on two calls that can fail independently. */
  exchangeRate: MonthlyExchangeRate | null
}

export async function fetchMonthlyFeePreview(period: string): Promise<MonthlyFeePreview> {
  const res = await receivablesApi.monthlyFeePreview(period)
  return {
    items: res.items.map((item) => ({
      clientId: item.clientId,
      clientName: item.clientName,
      services: item.services,
      suggestedService: item.suggestedService,
      monthlyFee: minorToMajor(item.monthlyFeeMinor),
      currency: item.currency,
      convertedArs: item.convertedArsMinor ? minorToMajor(item.convertedArsMinor) : null,
      discountPercent: item.discountPercentBp ? item.discountPercentBp / 100 : null,
      discountAmount: item.discountAmountMinor ? minorToMajor(item.discountAmountMinor) : null,
      lines:
        item.lines?.map((l) => ({ id: l.id, name: l.name, price: minorToMajor(l.priceMinor) })) ??
        null,
      productions: (item.productions ?? []).map((p) => ({
        id: p.id,
        date: p.date,
        title: p.title,
        serviceName: p.serviceName,
        amount: minorToMajor(p.amountMinor),
      })),
      arsPerUsd: res.exchangeRate ? minorToMajor(res.exchangeRate.arsPerUsdMinor) : null,
      skipReason: item.skipReason,
      // An API that predates the field reads as "nothing billed by hand", which is safe
      // BECAUSE the server is what refuses a same-service duplicate. This only shapes what
      // the dialog offers, so the worst a stale API costs is one "sin generar" line.
      manualServices: item.manualServices ?? [],
    })),
    // An API that predates this field is not the same as a workspace with nothing to
    // disclose, but both are safe to render as "nothing to say" for the one release the
    // two deploys are out of step.
    withoutFee: res.withoutFee ?? [],
    exchangeRate: res.exchangeRate ? toMonthlyExchangeRate(res.exchangeRate) : null,
  }
}

function toMonthlyExchangeRate(dto: ExchangeRateDto): MonthlyExchangeRate {
  return {
    period: dto.period,
    arsPerUsd: minorToMajor(dto.arsPerUsdMinor),
    updatedAt: dto.updatedAt,
  }
}

/**
 * Set the dollar rate for a month.
 *
 * Returns what the server stored, not what was sent: the caller re-reads the preview after
 * this resolves, and a rate the UI displayed from its own input would be a claim about a
 * write it had not seen confirmed.
 */
export async function setMonthlyExchangeRateViaApi(
  period: string,
  arsPerUsd: number,
): Promise<MonthlyExchangeRate> {
  const dto = await receivablesApi.setExchangeRate({
    period,
    arsPerUsdMinor: majorToMinor(arsPerUsd),
  })
  return toMonthlyExchangeRate(dto)
}

/** The outcome of a generation run: the cobros created, and every client it skipped. */
export interface MonthlyFeeGenerationResult {
  created: Receivable[]
  skipped: { clientId: string; clientName: string; reason: MonthlyFeeSkipReason }[]
}

/** Generate the month's retainer cobros. The amounts are the server's — this sends only
 *  who to bill and under which service. */
export async function generateMonthlyFeesViaApi(
  input: GenerateMonthlyFeesInput,
): Promise<MonthlyFeeGenerationResult> {
  const res = await receivablesApi.generateMonthlyFees(input)
  return { created: res.created.map(dtoToReceivable), skipped: res.skipped }
}
