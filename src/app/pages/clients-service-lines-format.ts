import type { ServiceBillingMode } from '@hold/shared'

import type { ClientServiceDto } from '@/api/clients'

export const toMinor = (major: number): string => String(Math.round(major * 100))
export const toMajor = (minor: string): number => Number(minor) / 100

export const BILLING_MODE_LABEL: Record<ServiceBillingMode, string> = {
  monthly: 'Mensual',
  one_time: 'Única vez',
  per_production: 'Por producción',
  per_hour: 'Por hora',
}

export const PRICE_LABEL: Record<ServiceBillingMode, string> = {
  monthly: 'Precio mensual',
  one_time: 'Precio total',
  per_production: 'Le cobramos por producción',
  per_hour: 'Le cobramos por hora',
}

export const BILLING_MODES: ServiceBillingMode[] = ['monthly', 'one_time', 'per_production', 'per_hour']

export function includedHoursLabel(line: Pick<ClientServiceDto, 'billingMode' | 'includedHours'>): string | null {
  if (line.billingMode !== 'per_hour' || !line.includedHours) return null
  return `${String(line.includedHours).replace('.', ',')} h incluidas por mes`
}

export function parseIncludedHours(input: string): number | null {
  const hours = Number(input.replace(',', '.'))
  return Number.isFinite(hours) && hours > 0 ? Math.min(hours, 744) : null
}

export function isProductionBillingMode(mode: ServiceBillingMode): boolean {
  return mode === 'per_production' || mode === 'per_hour'
}

export function monthlyTotal(lines: ClientServiceDto[]): number {
  return lines
    .filter((l) => l.active && l.billingMode === 'monthly')
    .reduce((sum, l) => sum + toMajor(l.priceMinor), 0)
}

export function remainingOf(line: ClientServiceDto): number {
  const billed = line.billedMinor === null ? 0 : Number(line.billedMinor)
  return Math.max(Number(line.priceMinor) - billed, 0) / 100
}

export function chargeNet(
  amountMajor: number,
  discountPercentBp: number | null | undefined,
): { discount: number; net: number } {
  const baseMinor = Math.round(amountMajor * 100)
  const discountMinor = discountPercentBp ? Math.floor((baseMinor * discountPercentBp) / 10_000) : 0
  return { discount: discountMinor / 100, net: (baseMinor - discountMinor) / 100 }
}

