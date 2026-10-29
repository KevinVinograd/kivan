import { describe, expect, it } from 'vitest'

import {
  currentPeriod,
  fromMonthId,
  periodOptions,
  previousPeriod,
  readPeriodParam,
  recentPeriods,
  toMonthId,
  toPeriod,
} from './periods'

describe('period keys', () => {
  it('round-trips a date through both key shapes', () => {
    const period = toPeriod(new Date(2026, 6, 15))
    expect(period).toBe('2026-07-01')
    expect(toMonthId(period)).toBe('2026-07')
    expect(fromMonthId('2026-07')).toBe('2026-07-01')
  })

  it('reads the LOCAL calendar, not UTC', () => {
    expect(toPeriod(new Date(2026, 6, 1, 0, 30))).toBe('2026-07-01')
    expect(toPeriod(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-01')
  })
})

describe('previousPeriod', () => {
  it('crosses a year boundary', () => {
    expect(previousPeriod('2026-01-01')).toBe('2025-12-01')
  })

  it('never runs out', () => {
    let period = '2026-03-01'
    for (let index = 0; index < 40; index++) period = previousPeriod(period)
    expect(period).toBe('2022-11-01')
  })

  it('does not skip a month coming out of a 31-day one', () => {
    expect(previousPeriod('2026-03-01')).toBe('2026-02-01')
    expect(previousPeriod('2026-02-01')).toBe('2026-01-01')
  })
})

describe('recentPeriods', () => {
  it('returns the current month plus `count` back, newest first', () => {
    const periods = recentPeriods(3)
    expect(periods).toHaveLength(4)
    expect(periods[0]).toBe(currentPeriod())
    expect([...periods].sort().reverse()).toEqual(periods)
  })
})

describe('periodOptions', () => {
  it('keeps a record older than the window reachable', () => {
    const ancient = '2019-04-01'
    const options = periodOptions([ancient])
    expect(options).toContain(ancient)
    expect(options[0]).toBe(currentPeriod())
  })

  it('normalizes whatever key shape the rows carry, and de-duplicates', () => {
    const options = periodOptions(['2019-04', '2019-04-01', '2019-04-22'])
    expect(options.filter((option) => option === '2019-04-01')).toHaveLength(1)
  })

  it('sorts newest first across a year boundary', () => {
    const options = periodOptions(['2024-12-01', '2025-01-01'])
    expect(options.indexOf('2025-01-01')).toBeLessThan(options.indexOf('2024-12-01'))
  })
})

describe('readPeriodParam', () => {
  it('normalizes every accepted shape to a canonical period', () => {
    for (const input of ['2026-07', '2026-07-01', '2026-07-15', '2026-07-31']) {
      expect(readPeriodParam(input)).toBe('2026-07-01')
    }
  })

  it('accepts an impossible DAY, because the day is discarded before it can be wrong', () => {
    expect(readPeriodParam('2026-02-31')).toBe('2026-02-01')
  })

  it('rejects an impossible month, a wrong shape, and nothing at all', () => {
    for (const input of ['2026-13-01', '2026-00-01', '26-07-01', 'julio', '', null, undefined]) {
      expect(readPeriodParam(input)).toBeNull()
    }
  })

  it('always returns something a selector can match', () => {
    const options = periodOptions()
    const parsed = readPeriodParam(toMonthId(options[1]))
    expect(options).toContain(parsed)
  })
})
