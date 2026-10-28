import { endOfMonth, parseISO } from 'date-fns'
import { describe, expect, it, vi } from 'vitest'

import { apiDateToCalendarDay, isCalendarDay, isFutureIso, toIsoDate } from './iso-date'

/**
 * These pin the exact bug `toIsoDate` exists to prevent, and they are worth reading before
 * changing them, because they are only meaningful under one condition.
 *
 * `process.env.TZ` is set in `vitest.config.ts` to `America/Argentina/Buenos_Aires`. **Without
 * that, these tests cannot fail.** On a UTC machine — which is what CI is by default — the broken
 * implementation (`.toISOString().slice(0, 10)`) returns exactly the same string as the correct
 * one, so the suite would go green over the bug and stay green forever. That is not a
 * hypothetical: it is precisely how this bug survived in `dashboard-data.ts` for as long as it
 * did. A date test that does not pin its timezone is decoration.
 */
describe('toIsoDate (TZ pinned to UTC-3)', () => {
  it('is actually running in the timezone these assertions depend on', () => {
    // Guard the guard: if someone drops the TZ from the vitest config, this fails loudly here
    // rather than turning the assertions below into silent no-ops.
    expect(new Date('2026-06-30T23:59:00').getTimezoneOffset()).toBe(180) // UTC-3
  })

  it('serializes the last day of the month as the last day of the month', () => {
    const monthEnd = endOfMonth(parseISO('2026-06-01')) // local: 30 June, 23:59:59.999

    expect(toIsoDate(monthEnd)).toBe('2026-06-30')

    // The bug, stated: through UTC, that same instant is the 1st of JULY.
    expect(monthEnd.toISOString().slice(0, 10)).toBe('2026-07-01')
  })

  it('serializes a late-evening instant as today, not tomorrow', () => {
    const lateEvening = new Date('2026-03-15T21:30:00') // local

    expect(toIsoDate(lateEvening)).toBe('2026-03-15')
    expect(lateEvening.toISOString().slice(0, 10)).toBe('2026-03-16')
  })

  it('leaves a midday instant alone (where the bug is invisible)', () => {
    // The reason this survives review: most of the day, the broken version is right.
    const midday = new Date('2026-03-15T12:00:00')
    expect(toIsoDate(midday)).toBe('2026-03-15')
    expect(midday.toISOString().slice(0, 10)).toBe('2026-03-15')
  })
})

/**
 * `apiDateToCalendarDay` reads one column that carries two kinds of value, so each case below
 * must fail for a DIFFERENT wrong implementation. Reading everything as UTC (a bare `.slice`)
 * breaks the server-stamped cases; reading everything as local breaks the picked-date cases.
 * Both mistakes look correct on a UTC machine, which is why the TZ guard above matters here too.
 */
describe('apiDateToCalendarDay (TZ pinned to UTC-3)', () => {
  it('keeps a date the operator picked on the day they picked', () => {
    // The dialog sends '2026-08-18'; zod coerces it to exactly UTC midnight.
    expect(apiDateToCalendarDay('2026-08-18T00:00:00.000Z')).toBe('2026-08-18')
    // Reading it as a local instant would walk it back to the 17th.
    expect(toIsoDate(new Date('2026-08-18T00:00:00.000Z'))).toBe('2026-08-17')
  })

  it('reports a late-evening server stamp as the day the operator lived, not the UTC one', () => {
    // A collection registered at 22:00 local, stamped by `new Date()` server-side.
    expect(apiDateToCalendarDay('2026-08-19T01:00:00.000Z')).toBe('2026-08-18')
    // The bug, stated: a bare slice reports a day that had not happened yet.
    expect('2026-08-19T01:00:00.000Z'.slice(0, 10)).toBe('2026-08-19')
  })

  it('reports a midday server stamp as that same day (where the bug is invisible)', () => {
    expect(apiDateToCalendarDay('2026-08-18T15:00:00.000Z')).toBe('2026-08-18')
  })

  it('passes a date-only string straight through', () => {
    expect(apiDateToCalendarDay('2026-08-18')).toBe('2026-08-18')
  })

  it('falls back to the leading date rather than throwing on an unparseable value', () => {
    expect(apiDateToCalendarDay('2026-08-18Tnonsense')).toBe('2026-08-18')
  })
})

describe('isFutureIso (TZ pinned to UTC-3)', () => {
  it('is false for today and for the past, true for tomorrow', () => {
    // The clock is frozen: the fixtures below are derived from one reading of "today" while
    // the function under test takes its own. A run straddling local midnight would otherwise
    // compare two different days and fail with no defect behind it.
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 18, 12, 0, 0)) // 18 Aug 2026, local noon
    try {
      expect(isFutureIso('2026-08-18')).toBe(false)
      expect(isFutureIso('2026-08-17')).toBe(false)
      expect(isFutureIso('2026-08-19')).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('compares by day, so a full instant from today is not reported as future', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 18, 12, 0, 0))
    try {
      // A raw string compare says '2026-08-18T09:00:00.000Z' > '2026-08-18', which would
      // reject today's own value and leave the submit permanently disabled.
      expect(isFutureIso('2026-08-18T09:00:00.000Z')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('treats an empty string as not-future, so it is the required-check that rejects it', () => {
    expect(isFutureIso('')).toBe(false)
  })
})

describe('isCalendarDay', () => {
  it('separates a stored day from a recorded instant', () => {
    expect(isCalendarDay('2026-08-18')).toBe(true)
    expect(isCalendarDay('2026-08-18T00:00:00.000Z')).toBe(false)
  })
})
