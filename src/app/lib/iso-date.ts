import { format } from 'date-fns'

// Local calendar date. Never toISOString().slice(0, 10): in UTC-3 it returns the next day after 21:00.
export function toIsoDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function todayIso(): string {
  return toIsoDate(new Date())
}

// Exact UTC midnight = a day the user picked (read the UTC day); anything else = a server timestamp (read the local day).
export function apiDateToCalendarDay(iso: string): string {
  if (!iso.includes('T')) return iso.slice(0, 10)
  const instant = new Date(iso)
  if (Number.isNaN(instant.getTime())) return iso.slice(0, 10)
  if (instant.getTime() % 86_400_000 === 0) return instant.toISOString().slice(0, 10)
  return toIsoDate(instant)
}

export function isCalendarDay(iso: string): boolean {
  return !iso.includes('T')
}

export function isFutureIso(iso: string): boolean {
  return iso !== '' && apiDateToCalendarDay(iso) > todayIso()
}
