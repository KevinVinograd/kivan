import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

import type { Currency } from '@hold/shared'

import { apiDateToCalendarDay } from '@/app/lib/iso-date'
import { formatCurrency as formatInCurrency } from '@/lib/currency'

import type { BadgeVariant } from '@/app/components/components'

export const NO_VALUE = '-'

export const NO_REGISTRO = 'Sin registro'

const compactCurrencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const currencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value)
}

export function formatMoney(amount: number, currency: string): string {
  return formatInCurrency(amount, currency as Currency)
}

const preciseFormatters = new Map<string, Intl.NumberFormat>()

export function formatMoneyPrecise(amount: number, currency: string): string {
  let formatter = preciseFormatters.get(currency)
  if (!formatter) {
    formatter = new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    preciseFormatters.set(currency, formatter)
  }
  return formatter.format(amount)
}

export function formatExchangeRate(value: number): string {
  return formatMoneyPrecise(value, 'ARS')
}

export function formatCompactCurrency(value: number): string {
  return compactCurrencyFormatter.format(value)
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function formatMonthYear(iso?: string): string {
  if (!iso) return NO_REGISTRO
  return capitalize(format(parseISO(iso), 'LLLL yyyy', { locale: es }))
}

export function formatShortDate(iso?: string): string {
  if (!iso) return NO_REGISTRO
  return format(parseISO(iso), 'd LLL yyyy', { locale: es })
}

export function formatRelativeDate(iso?: string): string {
  if (!iso) return NO_REGISTRO
  return capitalize(formatDistanceToNow(parseISO(iso), { locale: es, addSuffix: true }))
}

export function formatDateTime(iso?: string): string {
  if (!iso) return NO_REGISTRO
  return format(parseISO(iso), 'd LLL yyyy, HH:mm', { locale: es })
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

export function isPastDate(iso?: string): boolean {
  if (!iso) return false
  return parseISO(iso).getTime() < Date.now()
}

export type { Kpi, KpiTone } from '@/app/components/patterns'

export type ActivityKind =
  | 'created'
  | 'invoice'
  | 'sent'
  | 'collected'
  | 'paid'
  | 'approved'
  | 'reminder'
  | 'note'
  | 'cancelled'

export type ActivityEntry = { iso: string; label: string; kind: ActivityKind }

export function byActivityRecency(a: ActivityEntry, b: ActivityEntry): number {
  const dayA = apiDateToCalendarDay(a.iso)
  const dayB = apiDateToCalendarDay(b.iso)
  return dayA === dayB ? b.iso.localeCompare(a.iso) : dayB.localeCompare(dayA)
}

export type LedgerSummary = {
  previousBalance: number
  periodAmount: number
  settledAmount: number
  currentBalance: number
}

export type DetailRowData = { label: string; value: string }

export type FilterOption = { value: string; label: string }

export type FilterField = {
  id: string
  label: string
  options: FilterOption[]
}

export type TaxProfileId = 'monotributo_1' | 'monotributo_2' | 'monotributo_3' | 'unassigned'

export const TAX_PROFILE_LABEL: Record<TaxProfileId, string> = {
  monotributo_1: 'Monotributo Vicky',
  monotributo_2: 'Monotributo More',
  monotributo_3: 'Monotributo Flor',
  unassigned: 'Sin asignar',
}

export const TAX_PROFILE_SHORT_LABEL: Record<TaxProfileId, string> = {
  monotributo_1: 'Vicky',
  monotributo_2: 'More',
  monotributo_3: 'Flor',
  unassigned: 'Sin asignar',
}

export type StatusBadge = { label: string; variant: BadgeVariant }
