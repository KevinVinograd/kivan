import { describe, expect, it } from 'vitest'

import {
  agingBuckets,
  cohortRanking,
  concentration,
  loadCardSummary,
  median,
  riskCardSummary,
  summaryInsight,
} from './reports-aggregations'
import { getReportData } from './reports-data'
import { formatPercent } from './reports-format'
import { reportPeriods } from './reports-periods'

const PERIODS = reportPeriods().slice(0, 3)
import type { ClientProfitabilityReportItem, ReportDataset, TeamCapacityReportItem } from './reports-types'

function client(overrides: Partial<ClientProfitabilityReportItem>): ClientProfitabilityReportItem {
  return {
    clientId: 'c',
    clientName: 'Cliente',
    service: 'Servicio',
    ingresos: 0,
    teamCost: 0,
    productionCost: 0,
    travelCost: 0,
    unchargedExtras: 0,
    costos: 0,
    rentabilidad: 0,
    margen: 0,
    horas: 0,
    monthsSinceIncrease: null,
    team: [],
    paymentPending: false,
    status: 'margen_bajo',
    ...overrides,
  }
}

function person(overrides: Partial<TeamCapacityReportItem>): TeamCapacityReportItem {
  return {
    personId: 'p',
    personName: 'Persona',
    role: 'Rol',
    clientsActive: 0,
    clientNames: [],
    costedAssignments: 0,
    totalAssignments: 0,
    hoursLogged: 0,
    capacity: 0,
    utilization: 0,
    personCost: 0,
    costPerHour: null,
    status: 'balanceada',
    ...overrides,
  }
}

describe('riskCardSummary', () => {
  it('counts records and, for the owner, the losses and worst margin', () => {
    const risk = [
      client({ clientId: 'a', status: 'perdida', margen: -12 }),
      client({ clientId: 'b', status: 'perdida', margen: -4 }),
      client({ clientId: 'c', status: 'margen_bajo', margen: 8 }),
    ]
    const summary = riskCardSummary(risk, true)
    expect(summary.count).toBe(3)
    expect(summary.signals).toEqual(['2 con pérdida', `margen mín. ${formatPercent(-12)}`])
  })

  it('hides the margin for the admin (no profitability), keeping count + losses', () => {
    const risk = [
      client({ clientId: 'a', status: 'perdida', margen: -12 }),
      client({ clientId: 'c', status: 'margen_bajo', margen: 8 }),
    ]
    const summary = riskCardSummary(risk, false)
    expect(summary.count).toBe(2)
    expect(summary.signals).toEqual(['1 con pérdida'])
  })

  it('omits the losses signal when there are none', () => {
    const summary = riskCardSummary([client({ status: 'margen_bajo', margen: 5 })], true)
    expect(summary.signals).toEqual([`margen mín. ${formatPercent(5)}`])
  })

  it('returns an empty summary for an empty slice', () => {
    expect(riskCardSummary([], true)).toEqual({ count: 0, signals: [] })
  })
})

describe('loadCardSummary', () => {
  it('counts the team, the overloaded, and the peak utilization', () => {
    const loaded = [
      person({ personId: 'a', status: 'sobrecargada', utilization: 1.3 }),
      person({ personId: 'b', status: 'sobrecargada', utilization: 1.1 }),
      person({ personId: 'c', status: 'balanceada', utilization: 0.8 }),
    ]
    const summary = loadCardSummary(loaded)
    expect(summary.count).toBe(3)
    expect(summary.signals).toEqual(['2 sobrecargadas', `util. máx ${formatPercent(1.3 * 100)}`])
  })

  it('uses the singular for a single overloaded person', () => {
    const loaded = [
      person({ personId: 'a', status: 'sobrecargada', utilization: 1.05 }),
      person({ personId: 'b', status: 'balanceada', utilization: 0.5 }),
    ]
    expect(loadCardSummary(loaded).signals[0]).toBe('1 sobrecargada')
  })

  it('shows only the peak when nobody is overloaded', () => {
    const summary = loadCardSummary([person({ status: 'balanceada', utilization: 0.7 })])
    expect(summary.signals).toEqual([`util. máx ${formatPercent(0.7 * 100)}`])
  })

  it('returns an empty summary for an empty slice', () => {
    expect(loadCardSummary([])).toEqual({ count: 0, signals: [] })
  })
})

function cohort(values: number[]): { id: string; label: string; value: number }[] {
  return values.map((value, i) => ({
    id: String.fromCharCode(97 + i),
    label: String.fromCharCode(97 + i).toUpperCase(),
    value,
  }))
}

describe('median', () => {
  it('returns the middle value for an odd count', () => {
    expect(median([10, 30, 20])).toBe(20)
  })

  it('averages the two middle values for an even count', () => {
    expect(median([10, 20, 30, 40])).toBe(25)
  })

  it('returns 0 for an empty list', () => {
    expect(median([])).toBe(0)
  })

  it('does not mutate the array it was given', () => {
    const values = [30, 10, 20]
    median(values)
    expect(values).toEqual([30, 10, 20])
  })
})

describe('cohortRanking', () => {
  it('returns null when the cohort holds only the selected entity', () => {
    expect(cohortRanking(cohort([50]), 'a', 8)).toBeNull()
  })

  it('returns null when the selected id is not in the cohort', () => {
    expect(cohortRanking(cohort([50, 40]), 'zz', 8)).toBeNull()
  })

  it('returns null for an empty cohort', () => {
    expect(cohortRanking([], 'a', 8)).toBeNull()
  })

  it('shows the whole cohort when it fits the window', () => {
    const result = cohortRanking(cohort([54, 112, 86, 18, 98, 72]), 'b', 8)
    expect(result).not.toBeNull()
    expect(result!.shown.map((d) => d.value)).toEqual([112, 98, 86, 72, 54, 18])
    expect(result!.rank).toBe(1)
    expect(result!.total).toBe(6)
    expect(result!.median).toBe(79)
    expect(result!.deltaVsMedian).toBe(33)
  })

  it('always includes the selected entity when the cohort exceeds the window', () => {
    const values = [95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 0]
    const result = cohortRanking(cohort(values), 'o', 8)
    expect(result).not.toBeNull()
    expect(result!.rank).toBe(15)
    expect(result!.total).toBe(20)
    expect(result!.shown).toHaveLength(8)
    expect(result!.shown.map((d) => d.id)).toContain('o')
  })

  it('centres the window on the selected entity when it sits mid-ranking', () => {
    const values = [95, 90, 85, 80, 75, 70, 65, 60, 55, 50]
    const result = cohortRanking(cohort(values), 'f', 4)
    expect(result!.shown.map((d) => d.value)).toEqual([75, 70, 65, 60])
  })

  it('clamps the window to the top when the selected entity ranks first', () => {
    const result = cohortRanking(cohort([95, 90, 85, 80, 75, 70]), 'a', 3)
    expect(result!.shown.map((d) => d.value)).toEqual([95, 90, 85])
    expect(result!.rank).toBe(1)
  })

  it('clamps the window to the bottom when the selected entity ranks last', () => {
    const result = cohortRanking(cohort([95, 90, 85, 80, 75, 70]), 'f', 3)
    expect(result!.shown.map((d) => d.value)).toEqual([80, 75, 70])
    expect(result!.rank).toBe(6)
  })

  it('computes the median over the FULL cohort, not the window', () => {
    const values = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10]
    const result = cohortRanking(cohort(values), 'a', 3)
    expect(result!.shown).toHaveLength(3)
    expect(result!.median).toBe(55)
  })
})

describe('person cost reconciliation', () => {
  it.each(PERIODS)('person costs sum to the client team costs (%s)', (period) => {
    const dataset = getReportData(period, { receivables: [], payments: [] })
    const byPerson = dataset.capacity.reduce((sum, person) => sum + (person.personCost ?? 0), 0)
    const byClient = dataset.profitability.reduce((sum, client) => sum + client.teamCost, 0)
    const tolerance = dataset.capacity.length + dataset.profitability.length
    expect(Math.abs(byPerson - byClient)).toBeLessThanOrEqual(tolerance)
  })

  it('leaves costPerHour null for a person with no logged hours', () => {
    const dataset = getReportData(PERIODS[0], { receivables: [], payments: [] })
    for (const person of dataset.capacity) {
      if (person.hoursLogged === 0) expect(person.costPerHour).toBeNull()
      else expect(person.costPerHour).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('agingBuckets', () => {
  const END = '2026-06-30'

  it('buckets by days overdue against the period end, not today', () => {
    const rows = [
      { dueDate: '2026-06-25', totalAmount: 100 },
      { dueDate: '2026-05-25', totalAmount: 200 },
      { dueDate: '2026-04-20', totalAmount: 300 },
      { dueDate: '2026-01-10', totalAmount: 400 },
    ]
    const buckets = agingBuckets(rows, END)
    expect(buckets.map((b) => b.amount)).toEqual([100, 200, 300, 400])
    expect(buckets.map((b) => b.count)).toEqual([1, 1, 1, 1])
    expect(buckets.map((b) => b.id)).toEqual(['0-30', '31-60', '61-90', '90+'])
  })

  it('puts a not-yet-due record in no bucket', () => {
    expect(agingBuckets([{ dueDate: '2026-07-15', totalAmount: 100 }], END).every((b) => b.count === 0)).toBe(true)
  })

  it('is inclusive at the boundaries (30, 31, 90, 91)', () => {
    const at30 = agingBuckets([{ dueDate: '2026-05-31', totalAmount: 1 }], END)
    expect(at30.find((b) => b.id === '0-30')!.count).toBe(1)
    const at31 = agingBuckets([{ dueDate: '2026-05-30', totalAmount: 1 }], END)
    expect(at31.find((b) => b.id === '31-60')!.count).toBe(1)
    const at90 = agingBuckets([{ dueDate: '2026-04-01', totalAmount: 1 }], END)
    expect(at90.find((b) => b.id === '61-90')!.count).toBe(1)
    const at91 = agingBuckets([{ dueDate: '2026-03-31', totalAmount: 1 }], END)
    expect(at91.find((b) => b.id === '90+')!.count).toBe(1)
  })

  it('always returns all four buckets, even when empty', () => {
    expect(agingBuckets([], END)).toHaveLength(4)
  })
})

describe('concentration', () => {
  const rows = [
    { name: 'ACME', amount: 640 },
    { name: 'Nexo', amount: 410 },
    { name: 'ACME', amount: 160 },
    { name: 'Sur', amount: 90 },
    { name: 'Norte', amount: 60 },
    { name: 'Este', amount: 40 },
  ]

  it('merges rows by name and ranks by amount', () => {
    const result = concentration(rows, (r) => r.name, (r) => r.amount, 3)
    expect(result.top.map((t) => t.name)).toEqual(['ACME', 'Nexo', 'Sur'])
    expect(result.top[0].amount).toBe(800)
  })

  it('reports the top-N share of the total', () => {
    const result = concentration(rows, (r) => r.name, (r) => r.amount, 3)
    expect(result.total).toBe(1400)
    expect(Math.round(result.topShare)).toBe(93)
  })

  it('handles an empty list without dividing by zero', () => {
    const result = concentration([], (r: { name: string }) => r.name, () => 0, 5)
    expect(result.total).toBe(0)
    expect(result.topShare).toBe(0)
    expect(result.top).toEqual([])
  })
})

describe('agingBuckets — unreadable due dates', () => {
  it('skips a record whose due date cannot be parsed instead of throwing', () => {
    expect(() => agingBuckets([{ dueDate: 'not-a-date', totalAmount: 100 }], '2026-06-30')).not.toThrow()
    const buckets = agingBuckets(
      [
        { dueDate: 'not-a-date', totalAmount: 100 },
        { dueDate: '2026-05-25', totalAmount: 200 },
      ],
      '2026-06-30',
    )
    expect(buckets.reduce((sum, band) => sum + band.amount, 0)).toBe(200)
    expect(buckets.reduce((sum, band) => sum + band.count, 0)).toBe(1)
  })
})

describe('hours are single-sourced', () => {
  it.each(PERIODS)('capacity hours equal the sum of that person\'s productivity rows (%s)', (period) => {
    const dataset = getReportData(period, { receivables: [], payments: [] })
    for (const person of dataset.capacity) {
      const fromRows = dataset.productivity
        .filter((row) => row.personId === person.personId)
        .reduce((sum, row) => sum + row.hours, 0)
      expect(person.hoursLogged).toBe(fromRows)
    }
  })
})

describe('summaryInsight', () => {
  const dataset = (margin: number, rows: number) =>
    ({
      profitability: Array.from({ length: rows }, () => client({})),
      capacity: [],
      summary: { margenPromedio: margin },
    }) as unknown as ReportDataset

  it('never claims an improvement over a previous period that has no data', () => {
    const text = summaryInsight(dataset(72, 4), dataset(0, 0))
    expect(text).not.toContain('mejoró')
    expect(text).toContain('Todavía no hay un período anterior con datos')
  })

  it('compares against a previous period that has data, without inventing a cause', () => {
    expect(summaryInsight(dataset(72, 4), dataset(60, 3))).toContain('mejoró')
    expect(summaryInsight(dataset(50, 4), dataset(60, 3))).toBe('La rentabilidad bajó respecto al período anterior.')
  })
})
