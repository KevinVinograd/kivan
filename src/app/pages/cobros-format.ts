/**
 * Cobros formatting + status helpers. Turns the §22.1 Receivable values into
 * badge labels/variants, the searchable text, the saldo derivation, the filter
 * configs and the §8.5 resumen KPIs. Pure functions — formatting never lives in
 * the data.
 */
import { formatCurrency as formatInLane, LANES, LANE_FILTER_OPTIONS, LANE_NOUN } from '@/lib/currency'
import type { Currency } from '@hold/shared'
import {
  formatCompactCurrency,
  isPastDate,
  TAX_PROFILE_LABEL,
  byActivityRecency,
  type ActivityEntry,
  type FilterField,
  type Kpi,
  type LedgerSummary,
  type StatusBadge,
  type TaxProfileId,
} from './cobranza-format'
import { apiDateToCalendarDay } from '@/app/lib/iso-date'
import type { BillingStatus, CollectionStatus, Receivable } from './cobros-mock-data'

// ── Estado de cobro ──────────────────────────────────────────────────────────
const COLLECTION_STATUS: Record<CollectionStatus, StatusBadge> = {
  pending: { label: 'Pendiente', variant: 'neutral' },
  collected: { label: 'Cobrado', variant: 'success' },
  partial: { label: 'Parcial', variant: 'warning' },
  overdue: { label: 'Vencido', variant: 'danger' },
  cancelled: { label: 'Cancelado', variant: 'outline' },
}

export function collectionStatusBadge(status: CollectionStatus): StatusBadge {
  return COLLECTION_STATUS[status]
}

// ── Estado de facturación ────────────────────────────────────────────────────
const BILLING_STATUS: Record<BillingStatus, StatusBadge> = {
  no_invoice: { label: 'Sin factura', variant: 'neutral' },
  pending: { label: 'Pendiente', variant: 'warning' },
  invoiced: { label: 'Facturado', variant: 'neutral' },
  sent: { label: 'Enviado', variant: 'neutral' },
  error_arca: { label: 'Error ARCA', variant: 'danger' },
  manual: { label: 'Manual', variant: 'neutral' },
  not_required: { label: 'No requiere', variant: 'outline' },
}

export function billingStatusBadge(status: BillingStatus): StatusBadge {
  return BILLING_STATUS[status]
}

// ── Saldo + vencimiento ──────────────────────────────────────────────────────
/** Outstanding balance for a receivable (a cobrar − cobrado). */
export function balanceOf(receivable: Receivable): number {
  return receivable.totalAmount - receivable.collectedAmount
}

/** Whether the due date should read as overdue: past, still owed, not cancelled. */
export function isOverdue(receivable: Receivable): boolean {
  return (
    receivable.status !== 'cancelled' &&
    balanceOf(receivable) > 0 &&
    (receivable.status === 'overdue' || isPastDate(receivable.dueDate))
  )
}

/**
 * The cobro state a person should read: a "Pendiente" whose due date already passed IS
 * overdue. The stored status only moves on a write, so a cobro generated with a past due
 * date said "Pendiente" in red-dated rows while the header counted it as "Vencido"
 * (25/10 review). Every surface that shows the state reads it through here.
 */
export function effectiveCollectionStatus(receivable: Receivable): CollectionStatus {
  return receivable.status === 'pending' && isOverdue(receivable) ? 'overdue' : receivable.status
}

// ── Search (§8.4) ────────────────────────────────────────────────────────────
/** Searchable text: client, razón social, CUIT, contacto, número de factura, servicio. */
export function receivableSearchText(r: Receivable): string {
  return [r.clientName, r.businessName, r.taxId, r.contactName, r.invoiceNumber, r.service]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

// ── Filters (§8.4, scoped: estado / facturación / monotributo) ────────────────
const COLLECTION_FILTER_OPTIONS = (
  ['pending', 'collected', 'partial', 'overdue', 'cancelled'] as const
).map((value) => ({ value, label: COLLECTION_STATUS[value].label }))

const BILLING_FILTER_OPTIONS = (
  ['no_invoice', 'pending', 'invoiced', 'sent', 'error_arca', 'manual', 'not_required'] as const
).map((value) => ({ value, label: BILLING_STATUS[value].label }))

const MONOTRIBUTO_FILTER_OPTIONS = (
  ['monotributo_1', 'monotributo_2', 'monotributo_3', 'unassigned'] as const
).map((value) => ({ value, label: TAX_PROFILE_LABEL[value as TaxProfileId] }))

/** Filter ids align with the column ids the toolbar targets (§8.4). Lane options come
 *  from the leaf module, shared with /pagos and /billing. */
export const COBROS_FILTER_FIELDS: FilterField[] = [
  { id: 'status', label: 'Estado de cobro', options: COLLECTION_FILTER_OPTIONS },
  { id: 'billingStatus', label: 'Facturación', options: BILLING_FILTER_OPTIONS },
  { id: 'taxProfileId', label: 'Monotributo', options: MONOTRIBUTO_FILTER_OPTIONS },
  { id: 'currency', label: 'Moneda', options: LANE_FILTER_OPTIONS },
]

/**
 * ONE HALF OF THE PAIR — called once per lane, so the two cannot drift.
 *
 * The /pagos twin carries the full reasoning (`laneFigure` there). Two things are specific
 * to this screen.
 *
 * IT MEASURES SALDO PENDIENTE, not the period total. The peso hero here is the outstanding
 * balance, and a pair has to be the SAME question in two lanes — "Saldo pendiente $ 450 k"
 * beside "Total a cobrar US$ 1.500" would put two different questions at identical weight,
 * which is worse than the smaller-aside layout it replaces. The period total stays in the
 * supporting grid, where it always was.
 *
 * IT ESCALATES ON ITS OWN LANE. The peso hero tints danger/warning off ITS overdue and
 * pending balances; this one does the same off its own. The convention rations
 * tinted figures to one per viewport "a second only when a second value is genuinely a
 * threshold status and Primary" — which is exactly this figure's new rank. Two tints appear
 * only when both lanes genuinely have money at risk, which is when two alarms are true.
 */
function laneFigure(rows: Receivable[], currency: Currency): Kpi {
  const live = rows.filter((r) => r.currency === currency && r.status !== 'cancelled')
  const pendingBalance = live.reduce((sum, r) => sum + balanceOf(r), 0)
  const overdue = live.filter(isOverdue).reduce((sum, r) => sum + balanceOf(r), 0)
  return {
    id: heroIdFor(currency),
    label: `Saldo pendiente en ${LANE_NOUN[currency]}`,
    value: formatInLane(pendingBalance, currency),
    tone: overdue > 0 ? 'danger' : pendingBalance > 0 ? 'warning' : 'default',
    // What a zero MEANS: nothing outstanding in this lane, or no cobros in it at all.
    hint:
      live.length === 0
        ? 'sin cobros en el período'
        : live.length === 1
          ? '1 cobro'
          : `${live.length} cobros`,
  }
}

const heroIdFor = (currency: Currency) => `pending${currency}`

/**
 * The ids of the two focal figures, in reading order — what the card passes as `heroId`.
 *
 * A TUPLE, because the convention caps co-visible heroes at two and
 * `KpiSummaryCard` types that ceiling. Written out rather than derived from `LANES` so a
 * third lane is a DECISION, not an automatic third hero.
 */
export const COBROS_HERO_IDS: [string, string] = [heroIdFor('ARS'), heroIdFor('USD')]

// ── Resumen KPIs (§8.5) ──────────────────────────────────────────────────────
const NEEDS_INVOICE: BillingStatus[] = ['no_invoice', 'pending']
const BILLED_NOT_REQUIRED: BillingStatus[] = ['invoiced', 'sent', 'manual']

/**
 * The period's resumen, scoped to the PESO lane. See `pagosKpis` for why: the same
 * unfiltered sum ran here, and a cobro is billed in its client's own lane, so a dollar
 * amount landed in a peso total under a "$", understated by roughly the exchange rate.
 */
export function cobrosKpis(rows: Receivable[]): Kpi[] {
  const isArs = (r: Receivable) => r.currency === 'ARS'
  const ars = rows.filter(isArs)
  const live = ars.filter((r) => r.status !== 'cancelled')
  const sum = (items: Receivable[], pick: (r: Receivable) => number) =>
    items.reduce((total, r) => total + pick(r), 0)

  const totalToCollect = sum(live, (r) => r.totalAmount)
  const totalCollected = sum(ars, (r) => r.collectedAmount)
  const overdue = sum(live.filter(isOverdue), balanceOf)
  const pendingToInvoice = sum(
    live.filter((r) => NEEDS_INVOICE.includes(r.billingStatus)),
    (r) => r.totalAmount,
  )
  const billedNotCollected = sum(
    live.filter((r) => BILLED_NOT_REQUIRED.includes(r.billingStatus)),
    balanceOf,
  )

  // §6: the view has TWO focal figures — Saldo pendiente per lane, at the same tier,
  // each escalating in color off its OWN lane: fg-danger when that lane has overdue
  // money, fg-warning when a balance remains, else fg-default. The Vencido tile stays
  // Secondary fg-default (the peso hero already carries its escalation). Every other tile
  // fg-default; status otherwise reads on the per-row badges (figure-color-restraint).
  const figures: Kpi[] = [
    // ONE function, called once per lane, so the pair cannot drift — and derived from
    // `LANES`, so a lane added to the enum cannot be silently absent from the card.
    ...LANES.map((currency) => laneFigure(rows, currency)),
    {
      id: 'toCollect',
      label: 'Total a cobrar',
      value: formatCompactCurrency(totalToCollect),
      tone: 'default',
      hint: 'en pesos',
    },
    { id: 'collected', label: 'Total cobrado', value: formatCompactCurrency(totalCollected), tone: 'default' },
    {
      id: 'overdue',
      label: 'Vencido',
      value: formatCompactCurrency(overdue),
      tone: 'default',
    },
    {
      id: 'toInvoice',
      label: 'Pendiente de facturar',
      value: formatCompactCurrency(pendingToInvoice),
      tone: 'default',
    },
    {
      id: 'billedNotCollected',
      label: 'Facturado no cobrado',
      value: formatCompactCurrency(billedNotCollected),
      tone: 'default',
    },
  ]
  return figures
}

// ── Detail reads (§10.2): registered cobros, ledger, activity ────────────────
// Nothing below is synthesized. Every figure and every date here is one the row
// actually carries; where a value was never recorded, the line is absent rather than
// filled with a plausible one.

export type ReceivablePayment = {
  id: string
  /** The calendar day the operator entered, or absent for a row collected before that
   *  column shipped. Absent means "nobody recorded when" — the amount is still real. */
  iso?: string
  amount: number
  /** The comprobante number, when one was issued. Never synthesized. */
  reference?: string
  /**
   * Where the cash landed — the treasury account the collection named. Undefined when
   * it named none, which is true of everything collected before the destination
   * existed. This is the slot the fabricated medio de pago used to occupy, and it stays
   * EMPTY rather than falling back to a plausible value.
   */
  account?: string
}

/**
 * Cobros registrados: the collections received against this receivable, read off
 * the stored collected amount and date. Nothing here is synthesized. The medio de
 * pago and the reference used to be derived from the digits of the row id, which
 * put a fact nobody entered next to a real amount; the receivable carries no
 * payment-method column at any layer, so the field is gone rather than guessed.
 * The row still holds one running total and one `collectedAt`, so N partial
 * collections collapse into a single line until a per-collection table exists.
 */
export function receivableRegisteredPayments(r: Receivable): ReceivablePayment[] {
  if (r.collectedAmount <= 0) return []
  return [
    {
      id: `${r.id}-pay-0`,
      // The recorded day, or NOTHING. The fallback used to be `lastActivityAt` — the
      // row's createdAt — rendered to the minute as "14 ago 2026, 09:00", a far more
      // confident claim about when the money arrived than the Actividad timeline three
      // functions down is willing to make about the same event. One panel, one rule.
      ...(r.collectedAt ? { iso: r.collectedAt } : {}),
      amount: r.collectedAmount,
      reference: r.invoiceNumber,
      account: r.treasuryAccountName,
    },
  ]
}

/**
 * Invoice issue date for the Facturación section: the STORED emission date, or nothing.
 *
 * It used to fall back to `lastActivityAt` minus two days for any row carrying an
 * invoice number without an emission date. `lastActivityAt` is the row's `createdAt`
 * (see `receivables-api-data.ts`), so that produced an emission date two days BEFORE
 * the cobro existed, printed next to a real comprobante number. The number is real; the
 * date was not. A factura whose emission date nobody recorded now shows the number and
 * no date.
 */
export function receivableInvoiceDate(r: Receivable): string | undefined {
  // Already a day: `receivables-api-data.ts` normalizes the column beside `collectedAt`,
  // so this is a plain field access and every other consumer gets the same value.
  return r.invoiceIssuedAt
}

/**
 * Cuenta corriente del cliente (§10.2): carried balance + this period's movement.
 *
 * `previousBalance` is what THIS client still owes across EARLIER periods, summed from
 * the same receivables that feed `/cuentas-corrientes` — display-derived here, that page
 * remains the authority. It used to be
 * `seedOf(r) % 4 === 0 ? totalAmount * 0.25 : 0`: a quarter of all cobros showed a
 * carried debt computed from the DIGITS OF THE ROW ID, sitting in a money column beside
 * real figures. Same defect class as the medio de pago removed in #132.
 *
 * `all` is the full receivables list (the store fetches every period, not one), so a
 * client with nothing outstanding earlier correctly reads 0 rather than "unknown".
 */
export function receivableLedger(r: Receivable, all: Receivable[]): LedgerSummary {
  const previousBalance = all
    .filter(
      (other) =>
        // `Receivable.clientId` is OPTIONAL and absent from every seed row, so a bare
        // equality made `undefined === undefined` true and summed EVERY other client's
        // earlier debt into this one's "Saldo anterior" — a fabricated money figure in
        // the very block this change de-fabricated.
        r.clientId != null &&
        other.clientId === r.clientId &&
        // Same LANE, too. A running balance is per currency, so a dollar cobro summed
        // into a peso client's "Saldo anterior" is not a bigger debt, it is a figure in
        // no currency at all.
        other.currency === r.currency &&
        other.id !== r.id &&
        // Lexicographic works: `period` is always 'YYYY-MM-01'.
        other.period < r.period &&
        other.status !== 'cancelled',
    )
    // Clamped PER ROW. `balanceOf` goes negative when a cobro was over-collected (its
    // total edited down after the fact), and summing that raw silently cancelled real debt
    // from a different period — the client would read a smaller "Saldo anterior" than they
    // owe. `receivableOutstanding` in treasury-position-view.ts clamps for the same reason.
    .reduce((sum, other) => sum + Math.max(balanceOf(other), 0), 0)
  const owed = r.status === 'cancelled' ? 0 : balanceOf(r)
  return {
    previousBalance,
    periodAmount: r.status === 'cancelled' ? 0 : r.totalAmount,
    settledAmount: r.collectedAmount,
    currentBalance: previousBalance + owed,
  }
}

/**
 * Actividad (§10.2): the receivable's chronology, newest first.
 *
 * ONE RULE: an entry is emitted only when its OWN date was recorded. A timeline is a
 * claim about when things happened, so an entry at a stand-in date is worse than no
 * entry — the underlying fact stays visible in the panel's other sections (the estado
 * badge, the comprobante number, the collected amount), it just stops asserting a day.
 *
 * What this removed, and why each was wrong:
 * - "Cobro creado" was dated at `r.period` — the billing MONTH, not the moment of
 *   creation. It now uses `lastActivityAt`, which the mapper sets to the row's
 *   `createdAt` and which therefore genuinely is that moment.
 * - "Factura generada/asociada" fell back to two days before creation (impossible).
 *   It is emitted only with a stored `invoiceIssuedAt`.
 * - "Cuenta corriente enviada" was dated one day before the cobro existed. Nothing
 *   records when a statement was sent, so the entry is gone; `billingStatus` still
 *   says it was.
 * - "Error de facturación" and "Cobro cancelado" were both stamped at creation — the
 *   one moment they certainly did NOT happen. Neither event has a recorded date.
 */
export function receivableActivity(r: Receivable): ActivityEntry[] {
  const items: ActivityEntry[] = [
    // Normalized to a DAY. `lastActivityAt` is a full instant, and the timeline branches
    // on `isCalendarDay` to choose between a date and a relative distance — so leaving it
    // raw rendered "Cobro creado · hace 5 días" stacked above "Pago registrado · 12 ago",
    // two idioms in one chronology.
    { iso: apiDateToCalendarDay(r.lastActivityAt), label: 'Cobro creado', kind: 'created' },
  ]
  const invoiceIso = receivableInvoiceDate(r)
  if (invoiceIso) {
    items.push({
      iso: invoiceIso,
      label: r.billingStatus === 'manual' ? 'Factura asociada' : 'Factura generada',
      kind: 'invoice',
    })
  }
  // Only a collection that carries its own day. `lastActivityAt` is NOT a fallback worth
  // taking: it is the row's createdAt, so it would stamp the collection with the day the
  // cobro was opened — a different event, and one that predates the money arriving.
  if (r.collectedAmount > 0 && r.collectedAt) {
    items.push({ iso: r.collectedAt, label: 'Pago registrado', kind: 'collected' })
  }
  return items.sort(byActivityRecency)
}
