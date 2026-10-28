/**
 * Cobranza y Pagos — shared formatting + display primitives.
 *
 * Pure helpers reused by both tabs (Cobros / Pagos): currency + period + relative
 * date formatting, the KPI tone→token map, and the shared filter/KPI types. Money
 * is stored as numbers and dates as ISO strings in the mock models; formatting
 * happens only at render, here. The per-entity badge maps, search text, filter
 * configs and KPI builders live in `cobros-format.ts` / `pagos-format.ts`.
 */
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

import type { Currency } from '@hold/shared'

import { apiDateToCalendarDay } from '@/app/lib/iso-date'
// From the LEAF module, never from `clients-format`: importing it from there closed the
// cycle that blanked every page in production (see @/lib/currency).
import { formatCurrency as formatInCurrency } from '@/lib/currency'

import type { BadgeVariant } from '@/app/components/components'

/** Compact "no value" marker for numeric cells (hyphen, not an em dash). */
export const NO_VALUE = '-'

export const NO_REGISTRO = 'Sin registro'

const compactCurrencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const currencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value)
}

/**
 * An amount in the currency it is denominated in.
 *
 * `formatCurrency` above is the PESO formatter, so a dollar figure passed through it wears
 * a "$" and reads as pesos. This delegates to the one per-currency formatter the app
 * already has rather than adding a second: an earlier version here appended the code to a
 * peso-formatted number ("$ 3.520 USD"), which is the ARS symbol on a dollar figure.
 *
 * It lives in this module because three surfaces need it now: the month generator's roster,
 * its total, and the cobro detail.
 *
 * IT IS `@/lib/currency`'s `formatCurrency`, and must stay so. /cobros and /billing build
 * their lane-total cards by calling that export directly while /pagos reaches it through
 * this name; the three cards state per-lane totals for the same period under the same
 * labels, and the page-contexts call their agreement a cross-screen invariant. That
 * invariant currently rests on this function being a pure delegation — so if it ever grows
 * a rule of its own (rounding, a suffix, a null guard), the other two screens have to grow
 * it in the same commit or the same month reads two ways.
 */
export function formatMoney(amount: number, currency: string): string {
  return formatInCurrency(amount, currency as Currency)
}

const preciseFormatters = new Map<string, Intl.NumberFormat>()

/**
 * An amount in its own currency, centavos included.
 *
 * Every other money formatter in the app rounds to whole units, which is right almost
 * everywhere and wrong on the cobro detail's cotización line: that line exists so the
 * operator can reconcile `USD 1.234,56 × 1.187,33` against the peso total by hand, and a
 * figure rounded to "US$ 1.235" does not multiply out to what was billed.
 */
export function formatMoneyPrecise(amount: number, currency: string): string {
  // Every lane is a real currency, so `style: 'currency'` is right for all of them. This
  // used to carry a branch printing bare grouped digits for FCI, because fund SHARES
  // cannot wear a peso sign; FCI stopped being a lane (a Fondo Común is an ACCOUNT).
  //
  // Note what does NOT protect this: Intl accepts any well-formed three-letter code and
  // renders it as its own symbol, so `currency: 'FCI'` would produce a plausible
  // "FCI 1.500,00" rather than throwing. Only the `Currency` type keeps a non-lane out —
  // and this function takes a `string`, so its callers are what enforce it.
  //
  // The CACHE is keyed by currency and shared by every lane, which is the defect this
  // function has already had once: the FCI branch was cached under the 'ARS' key, so
  // whichever lane asked first decided the other one's output (`cobranza-format.test.ts`).
  let formatter = preciseFormatters.get(currency)
  if (!formatter) {
    formatter = new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    preciseFormatters.set(currency, formatter)
  }
  return formatter.format(amount)
}

/**
 * A dollar rate, centavos included.
 *
 * 1.234,50 and 1.234,49 bill a USD 500 retainer five pesos apart, so a rate the operator
 * typed with decimals has to read back the way they typed it.
 */
export function formatExchangeRate(value: number): string {
  return formatMoneyPrecise(value, 'ARS')
}

/**
 * Compact currency for KPI tiles (e.g. "$ 12,4 M"), in PESOS.
 *
 * PESO-ONLY on purpose, and it is worth saying why it was not widened when the summary
 * cards grew a dollar hero. es-AR's compact notation switches its abbreviation by
 * MAGNITUDE, not by lane: 98.000 renders "98 k" and 1.400 renders "1,4 K". Peso totals at
 * this studio sit in the first band and dollar totals in the second, so a compact pair
 * would show two different glyphs for the same idea on two figures meant to be read
 * together. The heroes format exactly instead (`formatCurrency`).
 *
 * SO ONE CARD NOW CARRIES BOTH NOTATIONS — an exact hero over a compact supporting grid —
 * and that is a chosen trade, not an oversight. Making the grid exact too was tried and
 * measured: at 1024px `$ 12.850.000` needs 173px in a 131px column and overflows. The
 * five supporting figures share one row, the two heroes do not, so the tier that has the
 * room formats exactly and the tier that does not abbreviates. The difference reads as
 * what it is — the figure you act on, over the figures that orient you.
 */
export function formatCompactCurrency(value: number): string {
  return compactCurrencyFormatter.format(value)
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Full "Mes Año" label for the período column (e.g. "Junio 2026"). */
export function formatMonthYear(iso?: string): string {
  if (!iso) return NO_REGISTRO
  return capitalize(format(parseISO(iso), 'LLLL yyyy', { locale: es }))
}

/** Short "d MMM yyyy" stamp for due / payment dates (e.g. "5 jun 2026"). */
export function formatShortDate(iso?: string): string {
  if (!iso) return NO_REGISTRO
  return format(parseISO(iso), 'd LLL yyyy', { locale: es })
}

/** Relative distance for the "Última actividad" caption (e.g. "hace 3 días"). */
export function formatRelativeDate(iso?: string): string {
  if (!iso) return NO_REGISTRO
  return capitalize(formatDistanceToNow(parseISO(iso), { locale: es, addSuffix: true }))
}

/** Full "d MMM yyyy, HH:mm" stamp for detail records (e.g. "5 jun 2026, 14:32"). */
export function formatDateTime(iso?: string): string {
  if (!iso) return NO_REGISTRO
  return format(parseISO(iso), 'd LLL yyyy, HH:mm', { locale: es })
}

/** Up to two initials from a name, for avatar fallbacks. */
export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

/** Whether a due / expected date is in the past relative to today. */
export function isPastDate(iso?: string): boolean {
  if (!iso) return false
  return parseISO(iso).getTime() < Date.now()
}

// ── KPI tiles (shared figure contract) ───────────────────────────────────────
// The figure contract now belongs to the `KpiSummaryCard` pattern, which renders it.
// Re-exported here — TYPE-ONLY — so the finance surfaces keep their existing import path.
// The `KPI_TONE_FG` map is deliberately NOT re-exported: a value re-export would give this
// pure formatting module a runtime dependency on the React component barrel, dragging the
// whole component library into every node-environment unit test that imports a formatter.
// Type re-exports are erased at emit and cost nothing. Import the map from
// `@/app/components/patterns` at the (already React-bound) call site instead.
export type { Kpi, KpiTone } from '@/app/components/patterns'

// ── Detail: activity timeline + cuenta corriente (shared shapes) ─────────────
/** Activity event kind — the timeline maps each to a registry icon at render. */
export type ActivityKind =
  | 'created'
  | 'invoice'
  | 'sent'
  | 'collected'
  | 'paid'
  | 'approved'
  | 'reminder'
  | 'note'
  | 'cancelled'

export type ActivityEntry = { iso: string; label: string; kind: ActivityKind }

/**
 * Newest first, by calendar DAY, breaking ties with the raw value.
 *
 * A plain lexicographic sort over the raw isos mixes shapes: a calendar day sorts BELOW any
 * instant sharing its prefix ('2026-08-18' < '2026-08-18T10:00:00Z'), so an entry dated today
 * fell under one recorded earlier the same morning. Comparing the day first keeps same-day
 * entries together; within a day the raw value decides, which for a date-only value is
 * arbitrary — nothing in it says what time it happened, so no order there is claimed.
 */
export function byActivityRecency(a: ActivityEntry, b: ActivityEntry): number {
  const dayA = apiDateToCalendarDay(a.iso)
  const dayB = apiDateToCalendarDay(b.iso)
  return dayA === dayB ? b.iso.localeCompare(a.iso) : dayB.localeCompare(dayA)
}

/** Cuenta corriente snapshot for a detail panel (§10.2 / §12.2). */
export type LedgerSummary = {
  /** Carried-over balance before this period. */
  previousBalance: number
  /** Amount charged / owed this period (a cobrar / a pagar). */
  periodAmount: number
  /** Amount settled this period (cobrado / pagado). */
  settledAmount: number
  /** Resulting balance after this period. */
  currentBalance: number
}

/** One detail key/value row, shared by both detail panels. */
export type DetailRowData = { label: string; value: string }

// ── Filters (shared config shape for the generic accordion) ──────────────────
export type FilterOption = { value: string; label: string }

/** One filter axis: a stable column id, the section label, and its options. */
export type FilterField = {
  id: string
  label: string
  options: FilterOption[]
}

// ── Monotributos (3 emisores; full TaxProfile model deferred to facturación) ──
export type TaxProfileId = 'monotributo_1' | 'monotributo_2' | 'monotributo_3' | 'unassigned'

// Named after who holds each emisor, matching `BILLING_ENTITY_LABEL` in
// clients-format.ts. The same emisor must never read "MT 1" here and "Vicky"
// there. The codes remain the stored identifiers.
export const TAX_PROFILE_LABEL: Record<TaxProfileId, string> = {
  monotributo_1: 'Monotributo Vicky',
  monotributo_2: 'Monotributo More',
  monotributo_3: 'Monotributo Flor',
  unassigned: 'Sin asignar',
}

export const TAX_PROFILE_SHORT_LABEL: Record<TaxProfileId, string> = {
  monotributo_1: 'Vicky',
  monotributo_2: 'More',
  monotributo_3: 'Flor',
  unassigned: 'Sin asignar',
}

/** Badge variant used for inline status text shared by both tabs. */
export type StatusBadge = { label: string; variant: BadgeVariant }
