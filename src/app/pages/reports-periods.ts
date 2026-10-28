import { currentPeriod, periodOptions, previousPeriod, type Period } from '@/app/lib/periods'

/**
 * Reportes periods — the months the report selector switches between.
 *
 * This module used to export a frozen three-item list pinned to Abr–Jun 2026, so by July
 * the current month could not be selected and no report could be run on it. The list is
 * derived now; see `lib/periods.ts`.
 */

export type ReportPeriod = Period

/**
 * The months to offer. Pass the periods present in the loaded dataset so a month with data
 * outside the rolling window is still reportable.
 */
export function reportPeriods(present: Iterable<string> = []): ReportPeriod[] {
  return periodOptions(present)
}

/** The period the page opens on: the month we are actually in. */
export function currentReportPeriod(): ReportPeriod {
  return currentPeriod()
}

/**
 * The chronologically previous month, for "comparar con período anterior".
 *
 * It used to look the period up in the fixed array and return `null` past its end, so the
 * comparison silently switched itself off on the oldest listed month — which read as "this
 * month has no prior data" when the data was merely outside the array. Real date arithmetic
 * has no such edge: every month has a month before it, and whether that month HAS data is a
 * question for the dataset, not for the period list.
 */
export function previousReportPeriod(period: ReportPeriod): ReportPeriod {
  return previousPeriod(period)
}
