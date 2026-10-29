import { endOfMonth, parseISO } from 'date-fns'
import { describe, expect, it, vi } from 'vitest'

import { apiDateToCalendarDay, isCalendarDay, isFutureIso, toIsoDate } from './iso-date'

describe('toIsoDate (TZ pinned to UTC-3)', () => {
  it('is actually running in the timezone these assertions depend on', () => {
    expect(new Date('2026-06-30T23:59:00').getTimezoneOffset()).toBe(180)
  })

  it('serializes the last day of the month as the last day of the month', () => {
    const monthEnd = endOfMonth(parseISO('2026-06-01'))

    expect(toIsoDate(monthEnd)).toBe('2026-06-30')

    expect(monthEnd.toISOString().slice(0, 10)).toBe('2026-07-01')
  })

  it('serializes a late-evening instant as today, not tomorrow', () => {
    const lateEvening = new Date('2026-03-15T21:30:00')

    expect(toIsoDate(lateEvening)).toBe('2026-03-15')
    expect(lateEvening.toISOString().slice(0, 10)).toBe('2026-03-16')
  })

  it('leaves a midday instant alone (where the bug is invisible)', () => {
    const midday = new Date('2026-03-15T12:00:00')
    expect(toIsoDate(midday)).toBe('2026-03-15')
    expect(midday.toISOString().slice(0, 10)).toBe('2026-03-15')
  })
})

describe('apiDateToCalendarDay (TZ pinned to UTC-3)', () => {
  it('keeps a date the operator picked on the day they picked', () => {
    expect(apiDateToCalendarDay('2026-08-18T00:00:00.000Z')).toBe('2026-08-18')
    expect(toIsoDate(new Date('2026-08-18T00:00:00.000Z'))).toBe('2026-08-17')
  })

  it('reports a late-evening server stamp as the day the operator lived, not the UTC one', () => {
    expect(apiDateToCalendarDay('2026-08-19T01:00:00.000Z')).toBe('2026-08-18')
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
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 18, 12, 0, 0))
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
