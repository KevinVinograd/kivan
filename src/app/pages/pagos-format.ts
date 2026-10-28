/**
 * Pagos formatting + status helpers. Turns the §22.2 Payment values into badge
 * labels/variants, type/method labels, the searchable text, the saldo derivation,
 * the filter configs and the §11.6 resumen KPIs. Pure functions.
 */
import { apiDateToCalendarDay } from '@/app/lib/iso-date'
import { formatCurrency as formatInLane, LANES, LANE_FILTER_OPTIONS, LANE_NOUN } from '@/lib/currency'
import type { Currency } from '@hold/shared'

import type { LedgerPeriodSummaryDto } from '@/api/ledger'
import type { PaymentBankDto } from '@/api/payments'
import type { PayoutStatementDto } from '@/api/payouts'
import {
  formatCompactCurrency,
  formatCurrency,
  formatMoney,
  formatShortDate,
  isPastDate,
  NO_REGISTRO,
  NO_VALUE,
  byActivityRecency,
  type ActivityEntry,
  type DetailRowData,
  type FilterField,
  type Kpi,
  type LedgerSummary,
  type StatusBadge,
} from './cobranza-format'
import type {
  Payment,
  PaymentMethod,
  PaymentStatus,
  RecipientType,
} from './pagos-mock-data'

// ── Estado de pago ───────────────────────────────────────────────────────────
const PAYMENT_STATUS: Record<PaymentStatus, StatusBadge> = {
  pending: { label: 'Pendiente', variant: 'neutral' },
  approved: { label: 'Aprobado', variant: 'neutral' },
  paid: { label: 'Pagado', variant: 'success' },
  partial: { label: 'Parcial', variant: 'warning' },
  overdue: { label: 'Vencido', variant: 'danger' },
  cancelled: { label: 'Cancelado', variant: 'outline' },
}

export function paymentStatusBadge(status: PaymentStatus): StatusBadge {
  return PAYMENT_STATUS[status]
}

// ── Tipo de pago ─────────────────────────────────────────────────────────────
export const RECIPIENT_TYPE_LABEL: Record<RecipientType, string> = {
  collaborator: 'Colaboradora',
  provider: 'Proveedor',
  employee: 'Empleado fijo',
  fixed_expense: 'Gasto fijo',
  monotributo: 'Monotributo',
  platform: 'Plataforma',
}

// ── Medio de pago ────────────────────────────────────────────────────────────
const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  transfer: 'Transferencia',
  cash: 'Efectivo',
  mercado_pago: 'Mercado Pago',
  other: 'Otro',
}

export function paymentMethodLabel(method?: PaymentMethod): string {
  return method ? PAYMENT_METHOD_LABEL[method] : 'Sin asignar'
}

// ── Saldo + vencimiento ──────────────────────────────────────────────────────
/** Outstanding balance for a payment (a pagar − pagado). */
export function paymentBalanceOf(payment: Payment): number {
  return payment.totalAmount - payment.paidAmount
}

/** Whether the expected date should read as overdue: past, still owed, not cancelled. */
export function isPaymentOverdue(payment: Payment): boolean {
  return (
    payment.status !== 'cancelled' &&
    paymentBalanceOf(payment) > 0 &&
    (payment.status === 'overdue' || isPastDate(payment.expectedDate))
  )
}

// ── Search (§11.5) ───────────────────────────────────────────────────────────
/** Searchable text: nombre, alias, concepto, tipo de pago. */
export function paymentSearchText(p: Payment): string {
  return [p.recipientName, p.accountAlias, p.concept, RECIPIENT_TYPE_LABEL[p.recipientType]]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

// ── Filters (§11.5, scoped: estado / tipo / moneda) ──────────────────────────
const STATUS_FILTER_OPTIONS = (
  ['pending', 'approved', 'paid', 'partial', 'overdue', 'cancelled'] as const
).map((value) => ({ value, label: PAYMENT_STATUS[value].label }))

const TYPE_FILTER_OPTIONS = (
  ['collaborator', 'provider', 'employee', 'fixed_expense', 'monotributo', 'platform'] as const
).map((value) => ({ value, label: RECIPIENT_TYPE_LABEL[value] }))

/**
 * Filter ids align with the column ids the toolbar targets (§11.5).
 *
 * The `Moneda` axis is what makes "how much of the dollar total is overdue" answerable.
 * The card gives one total per lane and deliberately stops there — a per-lane status
 * breakdown would put six figures where two belong — so the question is answered by
 * isolating the lane in the TABLE, where every row already carries its own status badge.
 * The options come from `@/lib/currency` so the filter, the card and the hidden column
 * cannot name a lane differently.
 */
export const PAGOS_FILTER_FIELDS: FilterField[] = [
  { id: 'status', label: 'Estado', options: STATUS_FILTER_OPTIONS },
  { id: 'recipientType', label: 'Tipo', options: TYPE_FILTER_OPTIONS },
  { id: 'currency', label: 'Moneda', options: LANE_FILTER_OPTIONS },
]

// ── Resumen KPIs (§11.6) ─────────────────────────────────────────────────────
/**
 * The period's resumen, scoped to the PESO lane.
 *
 * These sums used to run over every row whatever its currency, while `dtoToPayment`
 * relabelled every row 'ARS'. A pago of USD 1.000 therefore added 1.000 to "Total a
 * pagar" and printed it under a "$": a figure in no currency at all.
 *
 * Lanes are never converted into each other, so a peso total is peso rows only. Note
 * what does NOT enforce that: `assertSameLane` in `@hold/shared` has no production
 * caller anywhere in the repo, so the rule lives in filters like the one below and in
 * the tests that pin them — not in a runtime guard that would throw.
 *
 * What the peso figures leave out is not a count and not a second card any more: the
 * dollar total is a CO-EQUAL hero in this same array (`laneFigure`), at the same tier. A
 * count was the one thing an operator closing a month could not act on, and a smaller
 * figure in a card underneath still read as an aside to the peso total.
 */
export function pagosKpis(rows: Payment[]): Kpi[] {
  const isArs = (p: Payment) => p.currency === 'ARS'
  const ars = rows.filter(isArs)
  const live = ars.filter((p) => p.status !== 'cancelled')
  const sum = (items: Payment[], pick: (p: Payment) => number) =>
    items.reduce((total, p) => total + pick(p), 0)

  const totalPaid = sum(ars, (p) => p.paidAmount)
  const pendingBalance = sum(live, paymentBalanceOf)
  const overdue = sum(live.filter(isPaymentOverdue), paymentBalanceOf)
  const pendingReview = sum(
    live.filter((p) => p.status === 'pending'),
    (p) => p.totalAmount,
  )
  const fixedExpenses = sum(
    live.filter((p) => p.recipientType === 'fixed_expense'),
    (p) => p.totalAmount,
  )

  // §6: the view has TWO focal figures, `toPay` and `toPayUsd` — one period total per
  // lane, at the same tier, read together or not at all. The grid's sanctioned tinted
  // figures are Vencido (fg-danger) and Pendiente (fg-warning) when > 0 — the two
  // Secondary tiles §6 explicitly keeps toned. Pagado / Pendiente de revisión / Gastos
  // fijos are fg-default; other status reads on the per-row badges.
  const figures: Kpi[] = [
    // ONE function, called once per lane. The peso hero used to be hand-built here beside
    // a `laneHero` for the other lane, and the two drifted immediately: they took their
    // counts from different row sets, so two figures whose whole premise is that they ask
    // the same question in two lanes were answering different ones. Deriving the pair from
    // `LANES` also means a lane added to the enum cannot be silently absent from the card.
    ...LANES.map((currency) => laneFigure(rows, currency)),
    { id: 'paid', label: 'Pagado', value: formatCompactCurrency(totalPaid), tone: 'default' },
    {
      id: 'pending',
      label: 'Pendiente',
      value: formatCompactCurrency(pendingBalance),
      tone: pendingBalance > 0 ? 'warning' : 'default',
    },
    {
      id: 'overdue',
      label: 'Vencido',
      value: formatCompactCurrency(overdue),
      tone: overdue > 0 ? 'danger' : 'default',
    },
    {
      id: 'pendingReview',
      label: 'Pendiente de revisión',
      value: formatCompactCurrency(pendingReview),
      tone: 'default',
    },
    {
      id: 'fixedExpenses',
      label: 'Gastos fijos',
      value: formatCompactCurrency(fixedExpenses),
      tone: 'default',
    },
  ]
  return figures
}

/**
 * ONE HALF OF THE PAIR — called once per lane, so the two cannot drift.
 *
 * That is the point of the shape. The peso figure used to be built by hand at the call
 * site while this function served the other lane, and they diverged within one commit:
 * their counts came from different row sets, so two figures whose whole premise is that
 * they ask the same question in two lanes were answering different ones.
 *
 * IT ALWAYS RENDERS, including at zero. That is a reversal, and the reason it reverses is
 * worth keeping: the earlier version returned nothing for an empty lane on the argument
 * that "an empty lane is EMPTY, not US$ 0 — a zero would state that the studio owes
 * nothing in dollars, which is a different claim from having no dollar pagos at all."
 * That argument is sound about the FIGURE and is answered by the HINT, which says which
 * of the two a zero means. What it cost was the pairing: a card whose second protagonist
 * disappears some months is not a pair, and the operator has to notice its absence to
 * learn anything from it.
 *
 * NO COMBINED TOTAL EXISTS, and none is offered. There is exactly one sanctioned
 * conversion in the product — a USD retainer priced into ARS at a stamped monthly rate,
 * at cobro generation — so any figure summing these would be in no currency at all. The
 * card's footer says so in words the density toggle cannot collapse, and it matters MORE
 * now: two equal figures side by side are easier to read as addable than a total and a
 * smaller aside underneath it.
 */
function laneFigure(rows: Payment[], currency: Currency): Kpi {
  const live = rows.filter((p) => p.currency === currency && p.status !== 'cancelled')
  const total = live.reduce((sum, p) => sum + p.totalAmount, 0)
  return {
    id: heroIdFor(currency),
    label: `Total a pagar en ${LANE_NOUN[currency]}`,
    // The SAME function as the peso hero, called with the other lane, and EXACT rather
    // than the compact notation the supporting grid uses. Two figures a reader is meant to
    // compare cannot be produced by two formatters — but compact would not have given one
    // either: es-AR abbreviates by MAGNITUDE, so 98.000 renders "98 k" while 1.400 renders
    // "1,4 K", and peso totals here sit in the first band with dollar totals in the second.
    // The pair would have shown two glyphs for the same idea. Exact also stops a hero the
    // operator acts on from rounding; the compact tier stays where it belongs, one rung
    // down in the peso-only supporting grid.
    value: formatInLane(total, currency),
    tone: 'default' as const,
    // What a zero MEANS. Without this the figure is ambiguous between "nothing is owed in
    // this lane" and "this lane had no pagos at all", which are different months.
    hint: live.length === 0 ? 'sin pagos en el período' : live.length === 1 ? '1 pago' : `${live.length} pagos`,
  }
}

/** The ids of the two focal figures, in reading order — what the card passes as `heroId`. */
const heroIdFor = (currency: Currency) => `toPay${currency}`

/**
 * The ids of the two focal figures, in reading order — what the card passes as `heroId`.
 *
 * A TUPLE, because the convention caps co-visible heroes at two and
 * `KpiSummaryCard` types that ceiling. It is written out rather than derived from `LANES`
 * so that a third lane is a DECISION and not an automatic third hero: the figures above
 * would grow, this stays two, and `currency.test.ts` fails to say so out loud.
 */
export const PAGOS_HERO_IDS: [string, string] = [heroIdFor('ARS'), heroIdFor('USD')]

// ── Detail mapping (§12.2): desglose, datos de pago, ledger, activity ─────────
/** Integer minor units (centavos, as a string) → the major units the UI works in. */
function fromMinor(minor: string): number {
  return Number(minor) / 100
}

const row = (label: string, value: string): DetailRowData => ({ label, value })

/**
 * Desglose (§12.2), shaped by recipient type.
 *
 * For a colaboradora / empleado this describes the **liquidación del período**, not
 * this one payment: `PayoutStatement` is unique per (member, month), so two payments
 * to the same person in one month share it. The panel's heading says so.
 *
 * Everything here now comes from a record. It used to be synthesized from the digits
 * of the row id — `16 + (seed % 20)` hours, and a `Valor hora` obtained by dividing
 * the total by that invented count, which produced a plausible rate for a number of
 * hours nobody worked.
 *
 * Returns `[]` for a member with no statement; the caller renders that as the
 * explicit "sin liquidación" state rather than an empty card.
 */
export function paymentDesglose(p: Payment, statement: PayoutStatementDto | null): DetailRowData[] {
  if (p.recipientType === 'collaborator' || p.recipientType === 'employee') {
    if (!statement) return []
    return [
      // NOT `0 h` / `$ 0` when unrecorded: a statement from before hours were
      // attributed, and a member paid a fixed monthly amount, both genuinely have
      // no hours — which is a different fact from having worked none.
      row('Horas', statement.hoursTotal === null ? NO_REGISTRO : `${statement.hoursTotal} h`),
      row(
        'Valor hora',
        statement.hourlyRateMinor === null
          ? NO_REGISTRO
          : formatCurrency(fromMinor(statement.hourlyRateMinor)),
      ),
      row('Base', formatCurrency(fromMinor(statement.baseAmountMinor))),
      row('Producciones', formatCurrency(fromMinor(statement.productionsAmountMinor))),
      row('Viáticos', formatCurrency(fromMinor(statement.viaticsAmountMinor))),
      // Itemized, not summed into one "Extras" line: an adjustment carries the
      // reason it exists, and that is the part an operator checks.
      ...statement.adjustments.map((a) => row(a.description, formatCurrency(fromMinor(a.amountMinor)))),
      row('Total', formatCurrency(fromMinor(statement.totalAmountMinor))),
    ]
  }

  if (p.recipientType === 'fixed_expense') {
    return [
      row('Categoría', p.concept),
      row('Proveedor', p.recipientName),
      // The row's OWN lane. `formatCurrency` here is the peso-only formatter, and it
      // printed this same field as "$ 1.250.000" three rows under the Resumen's
      // "US$ 1.250" — the same number, two units, one panel.
      row('Monto', formatMoney(p.totalAmount, p.currency)),
      row('Vencimiento', formatShortDate(p.expectedDate)),
      row('Medio de pago', paymentMethodLabel(p.method)),
    ]
  }

  // Monotributo, proveedor externo, plataforma — the payment's own fields, which
  // are real. The monotributo rows used to lead with a CUIT and a category built
  // out of the row id (`30-7xxxxxxx-n`, `Categoría C`): a tax id is checked against
  // ARCA, so inventing one is worse than leaving it out, and there is nowhere to
  // read the real one from yet.
  return [
    row('Concepto', p.concept),
    row('Monto', formatMoney(p.totalAmount, p.currency)),
    row('Vencimiento', formatShortDate(p.expectedDate)),
    row('Medio de pago', paymentMethodLabel(p.method)),
  ]
}

/**
 * Datos de pago (§12.2) — the counterparty's bank account, from `GET
 * /payments/:id/bank`.
 *
 * `null` (no counterparty, nothing on file, or a caller without the
 * `teamBankDetails` capability) reads as blank across the board. The previous
 * version picked a bank out of a four-item list by `seed % 4` and built a CBU from
 * the row id — 22 digits that look exactly like the real thing and would be
 * transcribed into a transfer.
 *
 * `Titular` now comes from the account, not from `recipientName`: who is paid and
 * whose account receives it are two different facts, and they routinely differ.
 */
export function paymentBankData(bank: PaymentBankDto | null): DetailRowData[] {
  return [
    row('Banco', bank?.bankName ?? NO_VALUE),
    row('CBU', bank?.cbuOrCvu ?? NO_VALUE),
    row('Alias', bank?.alias ?? NO_VALUE),
    row('Titular', bank?.accountHolder ?? NO_VALUE),
  ]
}

/**
 * Cuenta corriente (§12.2) — the recipient's running account for this month.
 *
 * Extends the shared `LedgerSummary` with a fifth figure instead of changing it:
 * that type is also `/cobros`' (`receivableLedger`), and widening it there would
 * add a field no receivable can fill.
 */
export type PaymentLedgerSummary = LedgerSummary & {
  /**
   * Credits that CORRECTED what was owed rather than settling it — a lowered total
   * or a cancelled charge. Split out of `settledAmount` because both used to land
   * in it: editing a $1.000 pago down to $600 reported $400 as "Pagado" on a month
   * when nothing had been paid.
   */
  creditAdjustments: number
}

/**
 * From the persisted ledger's period summary. The figures CLOSE by construction
 * server-side (opening + debit − settled − adjustments === closing), which is what
 * makes them safe to stack. `previousBalance` used to be
 * `seed % 5 === 0 ? total * 0.2 : 0` — a carried debt on one account in five,
 * chosen by the row id.
 */
export function paymentLedger(summary: LedgerPeriodSummaryDto | null): PaymentLedgerSummary | null {
  if (!summary) return null
  return {
    previousBalance: fromMinor(summary.openingBalanceMinor),
    periodAmount: fromMinor(summary.debitMinor),
    settledAmount: fromMinor(summary.settledMinor),
    creditAdjustments: fromMinor(summary.creditAdjustmentsMinor),
    currentBalance: fromMinor(summary.closingBalanceMinor),
  }
}

/**
 * Actividad (§12.2): the payment's chronology, newest first.
 *
 * Same single rule as `receivableActivity`, and applied here because half an invariant is
 * worse than none — the two details are mirror surfaces and a reader comparing them would
 * have found /pagos still asserting days nobody recorded. **An entry is emitted only when
 * its OWN date was recorded.**
 *
 * What that removed:
 * - "Pago creado" was dated at `p.period`, the billing MONTH, so every pago in a month
 *   read as created on the 1st. It now uses `lastActivityAt` (the row's `createdAt`),
 *   normalized to a day so the timeline keeps one idiom.
 * - "Pago aprobado" was `lastActivityAt` minus one day — an approval stamped the day
 *   BEFORE the row existed. Nothing records when a pago was approved; `status` still says
 *   that it was.
 * - "Pago cancelado" was stamped at creation, the one moment it certainly did not happen.
 * - The paid entry no longer falls back to `lastActivityAt`: that would date the money by
 *   when the pago was opened. The amount stays visible in the KPI and in the detail rows.
 */
export function paymentActivity(p: Payment): ActivityEntry[] {
  const items: ActivityEntry[] = [
    { iso: apiDateToCalendarDay(p.lastActivityAt), label: 'Pago creado', kind: 'created' },
  ]
  if (p.paidAmount > 0 && p.paymentDate) {
    items.push({
      iso: p.paymentDate,
      label: p.status === 'partial' ? 'Pago parcial registrado' : 'Pago realizado',
      kind: 'paid',
    })
  }
  return items.sort(byActivityRecency)
}
