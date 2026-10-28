/**
 * Facturación (billing lens) formatting + KPIs + filters. The Cobros page reads
 * the same Receivable model through its collection lens (`cobros-format.ts`); this
 * module derives the facturación-focused resumen (§8.5 / §24) and the filter axes
 * the Facturación page (`/billing`) exposes. Pure functions — formatting never
 * lives in the data. Reuses the shared badge + currency helpers.
 */
import { formatCurrency as formatInLane, LANES, LANE_FILTER_OPTIONS, LANE_NOUN } from '@/lib/currency'
import type { Currency } from '@hold/shared'

import {
  formatCompactCurrency,
  TAX_PROFILE_LABEL,
  type FilterField,
  type Kpi,
} from './cobranza-format'
import { balanceOf, billingStatusBadge } from './cobros-format'
import type { BillingStatus, Receivable } from './cobros-mock-data'

/** Estados that still need a factura (count toward "pendiente de facturar"). */
const NEEDS_INVOICE: BillingStatus[] = ['no_invoice', 'pending']
/** Estados that already carry a factura (generated / sent / manually associated). */
const BILLED: BillingStatus[] = ['invoiced', 'sent', 'manual']

// ── Filters (estado de facturación + monotributo) ────────────────────────────
const BILLING_STATUSES: BillingStatus[] = [
  'no_invoice',
  'pending',
  'invoiced',
  'sent',
  'error_arca',
  'manual',
  'not_required',
]

const BILLING_FILTER_OPTIONS = BILLING_STATUSES.map((value) => ({
  value,
  label: billingStatusBadge(value).label,
}))

const MONOTRIBUTO_FILTER_OPTIONS = (
  ['monotributo_1', 'monotributo_2', 'monotributo_3', 'unassigned'] as const
).map((value) => ({ value, label: TAX_PROFILE_LABEL[value] }))

/** Filter ids align with the column ids the toolbar targets. Lane options come from the
 *  leaf module, shared with /cobros and /pagos. */
export const BILLING_FILTER_FIELDS: FilterField[] = [
  { id: 'billingStatus', label: 'Estado de facturación', options: BILLING_FILTER_OPTIONS },
  { id: 'taxProfileId', label: 'Monotributo', options: MONOTRIBUTO_FILTER_OPTIONS },
  { id: 'currency', label: 'Moneda', options: LANE_FILTER_OPTIONS },
]

// ── Resumen KPIs (facturación lens) ──────────────────────────────────────────
export function billingKpis(rows: Receivable[]): Kpi[] {
  // The SAME lane scope as `cobrosKpis`. Both read the same receivables for the same
  // period and print peso figures under the same labels ("Pendiente de facturar",
  // "Facturado no cobrado"), so a lane rule applied to one and not the other does not
  // produce a wrong figure on one screen — it produces two screens that disagree.
  const isArs = (r: Receivable) => r.currency === 'ARS'
  // MONEY is peso-scoped; a COUNT is not. "How much is pending" cannot add a dollar to a
  // peso, but "how many comprobantes bounced at ARCA" is a fact about documents — a USD
  // cobro is as stuck as a peso one, and dropping it turns a real alarm into a confident
  // zero while the table beside it still shows the row with its red badge.
  const liveAllLanes = rows.filter((r) => r.status !== 'cancelled')
  const live = liveAllLanes.filter(isArs)
  const sum = (items: Receivable[], pick: (r: Receivable) => number) =>
    items.reduce((total, r) => total + pick(r), 0)

  const billableAllLanes = liveAllLanes.filter((r) => r.billingStatus !== 'not_required')
  const billable = live.filter((r) => r.billingStatus !== 'not_required')
  const pendingToInvoice = sum(
    billable.filter((r) => NEEDS_INVOICE.includes(r.billingStatus)),
    (r) => r.totalAmount,
  )
  const billed = sum(
    live.filter((r) => BILLED.includes(r.billingStatus)),
    (r) => r.totalAmount,
  )
  const billedNotCollected = sum(
    live.filter((r) => BILLED.includes(r.billingStatus)),
    balanceOf,
  )
  const issuedCount = liveAllLanes.filter((r) => Boolean(r.invoiceNumber)).length
  const errorCount = liveAllLanes.filter((r) => r.billingStatus === 'error_arca').length
  const unassignedCount = billableAllLanes.filter(
    (r) => NEEDS_INVOICE.includes(r.billingStatus) && r.taxProfileId === 'unassigned',
  ).length

  // billing §6: the resumen has TWO focal figures — Pendiente de facturar per lane, at
  // the same tier. figure-color-restraint rations tinted figures, so the tint goes to
  // whichever number is the live alarm: Error ARCA (danger) when nonzero, else the PESO
  // hero (warning). The dollar hero stays fg-default even when it has money pending, and
  // that is deliberate rather than an oversight: unlike /cobros, where each lane carries
  // its own overdue alarm, the alarm here is Error ARCA — a fact about documents that is
  // already counted across every lane in one tile. A second warning would be the same
  // signal said twice. Every other tile is fg-default.
  const figures: Kpi[] = [
    // ONE function, called once per lane, so the pair cannot drift — and derived from
    // `LANES`, so a lane added to the enum cannot be silently absent from the card.
    //
    // The PESO half then takes back the one thing that is genuinely lane-specific here:
    // the warning tint, which belongs to the peso hero alone because this screen's alarm
    // is Error ARCA, counted once across every lane. `laneFigure` returns `default` for
    // both and the peso one is re-toned, rather than the tint living inside a function
    // that would then need to know which lane is special.
    ...LANES.map((currency) => {
      const figure = laneFigure(rows, currency)
      if (currency !== 'ARS') return figure
      return {
        ...figure,
        tone: errorCount === 0 && pendingToInvoice > 0 ? ('warning' as const) : ('default' as const),
      }
    }),
    { id: 'billed', label: 'Facturado', value: formatCompactCurrency(billed), tone: 'default' },
    {
      id: 'billedNotCollected',
      label: 'Facturado no cobrado',
      value: formatCompactCurrency(billedNotCollected),
      tone: 'default',
    },
    { id: 'issued', label: 'Comprobantes emitidos', value: String(issuedCount), tone: 'default' },
    {
      id: 'errorArca',
      label: 'Error ARCA',
      value: String(errorCount),
      tone: errorCount > 0 ? 'danger' : 'default',
    },
    {
      id: 'unassigned',
      label: 'Sin monotributo',
      value: String(unassignedCount),
      tone: 'default',
    },
  ]
  return figures
}

/**
 * ONE HALF OF THE PAIR — called once per lane, so the two cannot drift.
 *
 * The scope is deliberately NARROWER than the /cobros pair. That page states what is
 * OUTSTANDING because it asks "how much is coming in"; this one asks "what still needs a
 * comprobante", so both figures here hold their lane's **pendiente de facturar**. The two
 * screens therefore print different numbers for the same rows, exactly as `Total a cobrar`
 * and `Pendiente de facturar` already do in pesos.
 *
 * IT ALWAYS RENDERS, zero included — see the /pagos twin for why the earlier
 * appears-iff-it-has-rows form cost more than it bought. What that
 * makes a zero honest: a lane whose comprobantes are all issued reads `US$ 0` beside a hint
 * saying so, because the figure only ever renders next to rows it describes.
 *
 * An earlier version rendered the lane only when something was PENDING, so a fully-invoiced
 * lane vanished — and with it the last signal that the peso figures beside it were leaving
 * money out. Withholding the lane was the worse of the two, because "US$ 0 · 2 cobros, nada
 * pendiente" states two facts and invents neither.
 *
 * It replaces the `En otra moneda` count, which was right while a non-peso cobro was an
 * exception and wrong once the lane became permanent — a count is the one thing an
 * operator cannot act on. And this page reads the SAME receivables as /cobros: per-lane
 * totals there against a bare "1" here made the two screens disagree about one row set.
 */
function laneFigure(rows: Receivable[], currency: Currency): Kpi {
  const live = rows.filter((r) => r.currency === currency && r.status !== 'cancelled')
  // No `not_required` guard: that status is not in `NEEDS_INVOICE`, so the peso path's
  // extra filter for it is already redundant there.
  const pending = live.filter((r) => NEEDS_INVOICE.includes(r.billingStatus))
  const total = pending.reduce((sum, r) => sum + r.totalAmount, 0)
  return {
    id: heroIdFor(currency),
    label: `Pendiente de facturar en ${LANE_NOUN[currency]}`,
    value: formatInLane(total, currency),
    tone: 'default' as const,
    // The count says which rows the figure covers, and says so precisely when it covers
    // only some of them — this screen has THREE ways to reach a zero and they are
    // different months. No live rows at all; live rows whose comprobantes are all issued
    // ("nada pendiente", not "ya facturado": a `not_required` row is exempt, not invoiced,
    // and both land there); or some pending out of more.
    hint:
      live.length === 0
        ? 'sin cobros en el período'
        : pending.length === live.length
          ? live.length === 1
            ? '1 cobro'
            : `${live.length} cobros`
          : pending.length === 0
            ? live.length === 1
              ? '1 cobro, nada pendiente'
              : `${live.length} cobros, nada pendiente`
            : `${pending.length} de ${live.length} sin facturar`,
  }
}

const heroIdFor = (currency: Currency) => `toInvoice${currency}`

/**
 * The ids of the two focal figures, in reading order — what the card passes as `heroId`.
 *
 * A TUPLE, because the convention caps co-visible heroes at two and
 * `KpiSummaryCard` types that ceiling. Written out rather than derived from `LANES` so a
 * third lane is a DECISION, not an automatic third hero.
 */
export const BILLING_HERO_IDS: [string, string] = [heroIdFor('ARS'), heroIdFor('USD')]
