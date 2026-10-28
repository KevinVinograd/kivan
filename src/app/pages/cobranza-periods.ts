import { currentPeriod, periodOptions, type Period } from '@/app/lib/periods'

/**
 * Cobranza periods — the months the Cobros / Pagos / Facturación selectors switch between.
 *
 * This module used to export a frozen three-item list (`['2026-06-01','2026-05-01',
 * '2026-04-01']`) and a `CURRENT_PERIOD` pinned to June 2026. By July the actual current
 * month was not selectable, and every record outside those three months was invisible on
 * the surface that owns it — including the cobros and pagos the Cashflow launcher creates,
 * which carry the real month. The list is derived now; see `lib/periods.ts`.
 */

export type CobranzaPeriod = Period

/**
 * The months to offer. Pass the periods present in the loaded rows so historical records
 * stay reachable past the rolling window — a receivable from two years ago falls outside
 * the window, and leaving it off the list would hide a row that exists.
 */
export function cobranzaPeriods(present: Iterable<string> = []): CobranzaPeriod[] {
  return periodOptions(present)
}

/** The period the page opens on: the month we are actually in. */
export function currentCobranzaPeriod(): CobranzaPeriod {
  return currentPeriod()
}
