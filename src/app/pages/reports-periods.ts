import { currentPeriod, periodOptions, previousPeriod, type Period } from '@/app/lib/periods'

export type ReportPeriod = Period

export function reportPeriods(present: Iterable<string> = []): ReportPeriod[] {
  return periodOptions(present)
}

export function currentReportPeriod(): ReportPeriod {
  return currentPeriod()
}

export function previousReportPeriod(period: ReportPeriod): ReportPeriod {
  return previousPeriod(period)
}
