import { currentPeriod, periodOptions, type Period } from '@/app/lib/periods'

export type CobranzaPeriod = Period

export function cobranzaPeriods(present: Iterable<string> = []): CobranzaPeriod[] {
  return periodOptions(present)
}

export function currentCobranzaPeriod(): CobranzaPeriod {
  return currentPeriod()
}
