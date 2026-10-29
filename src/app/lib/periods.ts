import { addMonths, format, parse, startOfMonth } from 'date-fns'

export const PERIOD_WINDOW_MONTHS = 12

export type Period = string
export type PeriodMonthId = string

function parsePeriod(period: Period | PeriodMonthId): Date {
  const [year, month] = period.split('-').map(Number)
  return new Date(year ?? 1970, (month ?? 1) - 1, 1)
}

export function toPeriod(date: Date): Period {
  return format(startOfMonth(date), 'yyyy-MM-01')
}

export function toMonthId(period: Period): PeriodMonthId {
  return period.slice(0, 7)
}

export function fromMonthId(monthId: PeriodMonthId): Period {
  return `${monthId.slice(0, 7)}-01`
}

export function currentPeriod(): Period {
  return toPeriod(new Date())
}

export function previousPeriod(period: Period): Period {
  return toPeriod(addMonths(parsePeriod(period), -1))
}

export function recentPeriods(count: number = PERIOD_WINDOW_MONTHS): Period[] {
  const start = startOfMonth(new Date())
  return Array.from({ length: count + 1 }, (_, index) => toPeriod(addMonths(start, -index)))
}

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

export function readPeriodParam(value: string | null | undefined): Period | null {
  if (!value || !/^\d{4}-\d{2}(-\d{2})?$/.test(value)) return null
  const month = value.slice(0, 7)
  if (Number.isNaN(parse(month, 'yyyy-MM', new Date()).getTime())) return null
  return fromMonthId(month)
}
