import { addMonths, format, parse, startOfMonth } from 'date-fns'

/**
 * The months a period selector offers, derived from the calendar instead of pinned to it.
 *
 * Three separate hardcoded lists used to answer this — `COBRANZA_PERIODS` (Cobros, Pagos,
 * Facturación), `REPORT_PERIODS` (Reportes) and `DEFAULT_MONTH_ID` (Operación mensual) —
 * each frozen at Abr–Jun 2026. One bug written three times: by July 2026 the CURRENT month
 * was unreachable on five surfaces, and any record outside those three months was invisible
 * even though it had persisted. The Cashflow launcher made it acute, because a cobro created
 * there is stamped with the real month and then could not be found in the list that owns it.
 *
 * A derived list cannot go stale: never reintroduce a literal month string as a selector option.
 *
 * Dates are read on the LOCAL calendar (date-fns `format`), never through
 * `toISOString().slice(0, 10)` — see `lib/iso-date.ts` for why that is wrong west of
 * Greenwich, and `local-date-serialization-check.mjs` for the guard.
 */

/** How much history the selectors offer, on top of the current month. A fiscal year is the
 *  horizon an administrator works against; older months stay reachable when they carry data
 *  (see `periodOptions`). */
export const PERIOD_WINDOW_MONTHS = 12

/** `'YYYY-MM-01'` — the first-of-month ISO key the finance surfaces tag records with. */
export type Period = string
/** `'YYYY-MM'` — the shorter key `/operacion-mensual` uses for a month. */
export type PeriodMonthId = string

/** Parse either key shape back to a Date at the start of that month. */
function parsePeriod(period: Period | PeriodMonthId): Date {
  const [year, month] = period.split('-').map(Number)
  return new Date(year ?? 1970, (month ?? 1) - 1, 1)
}

/** The month `date` falls in, as `'YYYY-MM-01'`. */
export function toPeriod(date: Date): Period {
  return format(startOfMonth(date), 'yyyy-MM-01')
}

/** `'YYYY-MM-01'` → `'YYYY-MM'`, the id `/operacion-mensual` speaks. */
export function toMonthId(period: Period): PeriodMonthId {
  return period.slice(0, 7)
}

/** `'YYYY-MM'` → `'YYYY-MM-01'`. */
export function fromMonthId(monthId: PeriodMonthId): Period {
  return `${monthId.slice(0, 7)}-01`
}

/** The month we are in right now. Every selector opens here. */
export function currentPeriod(): Period {
  return toPeriod(new Date())
}

/** The month before `period`, by real date arithmetic. Always returns a month: there is no
 *  "oldest" edge, unlike the index lookup this replaced, which returned null at the end of a
 *  three-item array and silently disabled "comparar con período anterior" there. */
export function previousPeriod(period: Period): Period {
  return toPeriod(addMonths(parsePeriod(period), -1))
}

/** The current month plus the previous `count`, newest first. */
export function recentPeriods(count: number = PERIOD_WINDOW_MONTHS): Period[] {
  const start = startOfMonth(new Date())
  return Array.from({ length: count + 1 }, (_, index) => toPeriod(addMonths(start, -index)))
}

/**
 * What a selector should offer: the rolling window, UNION whatever periods the loaded records
 * actually carry, newest first. The union is what keeps history reachable — a receivable from
 * two years ago falls outside the window, and dropping it from the list would hide a row that
 * exists. Values are normalized, so callers may pass either key shape.
 */
export function periodOptions(
  present: Iterable<Period | PeriodMonthId> = [],
  count: number = PERIOD_WINDOW_MONTHS,
): Period[] {
  const all = new Set(recentPeriods(count))
  for (const value of present) {
    if (value) all.add(fromMonthId(value))
  }
  return [...all].sort().reverse()
}

/** Spanish month label, e.g. `Julio 2026`. Sentence case, matching the product's copy. */
const MONTHS_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

export function periodLabel(period: Period | PeriodMonthId): string {
  const [year, month] = period.split('-').map(Number)
  return `${MONTHS_ES[(month ?? 1) - 1]} ${year}`
}

/**
 * Read a `?period=` URL parameter into a canonical period, or `null` when it is not one.
 *
 * It NORMALIZES, it does not merely validate — that distinction is the whole point. A
 * shape-only guard let `'2026-07'`, `'2026-07-15'` and even `'2026-02-31'` through as the
 * selected period, and none of those equals any option the selector offers. The result was
 * not a caught error but a quietly broken page: the trigger renders blank (no matching
 * item), the row filters compare `row.period === selected` and match nothing so the month
 * looks empty, and a cobro created from that state is POSTed with the raw string — stored
 * verbatim, then unmatchable in EVERY month, which is the exact defect this module exists
 * to remove. `'2026-02-31'` went further and crashed the create dialog, because
 * `formatMonthYear` throws `RangeError` on an invalid date.
 *
 * Only the MONTH is validated (the day is discarded, so it cannot be wrong), and the return
 * is always `'YYYY-MM-01'`. Callers must use this rather than a bare shape check — a
 * validator that hands back the caller's string invites exactly the bug above.
 */
export function readPeriodParam(value: string | null | undefined): Period | null {
  if (!value || !/^\d{4}-\d{2}(-\d{2})?$/.test(value)) return null
  const month = value.slice(0, 7)
  if (Number.isNaN(parse(month, 'yyyy-MM', new Date()).getTime())) return null
  return fromMonthId(month)
}
