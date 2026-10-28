/**
 * Pure helpers for the priced service lines ("Servicios valorizados").
 *
 * Kept out of the components so the money arithmetic can be unit-tested on its own, and
 * so the row, the add form and the charge dialog read ONE definition of what a mode is
 * called and which lines form the fee.
 */
import type { ServiceBillingMode } from '@hold/shared'

import type { ClientServiceDto } from '@/api/clients'

/** Minor units on the wire, majors in the input — the convention every money field uses. */
export const toMinor = (major: number): string => String(Math.round(major * 100))
export const toMajor = (minor: string): number => Number(minor) / 100

export const BILLING_MODE_LABEL: Record<ServiceBillingMode, string> = {
  monthly: 'Mensual',
  one_time: 'Única vez',
  per_production: 'Por producción',
  per_hour: 'Por hora',
}

/** What the price of a line MEANS, which is what its input has to say. The per-production
 *  and per-hour ones say "le cobramos": beside a person's "le pagamos por hora" (their pay),
 *  "precio por hora" read as the same number (HOLD, 2026-10-22). */
export const PRICE_LABEL: Record<ServiceBillingMode, string> = {
  monthly: 'Precio mensual',
  one_time: 'Precio total',
  per_production: 'Le cobramos por producción',
  per_hour: 'Le cobramos por hora',
}

export const BILLING_MODES: ServiceBillingMode[] = ['monthly', 'one_time', 'per_production', 'per_hour']

/** "6 h incluidas por mes" — the per-hour line's pack, or null when it has none. */
export function includedHoursLabel(line: Pick<ClientServiceDto, 'billingMode' | 'includedHours'>): string | null {
  if (line.billingMode !== 'per_hour' || !line.includedHours) return null
  return `${String(line.includedHours).replace('.', ',')} h incluidas por mes`
}

/** Hours typed with either separator ("6", "1,5"); null for blank or 0 = none included. */
export function parseIncludedHours(input: string): number | null {
  const hours = Number(input.replace(',', '.'))
  return Number.isFinite(hours) && hours > 0 ? Math.min(hours, 744) : null
}

/** The lines a production can be billed under: a price per production or per hour. */
export function isProductionBillingMode(mode: ServiceBillingMode): boolean {
  return mode === 'per_production' || mode === 'per_hour'
}

/**
 * The client's monthly fee as the server derives it: active MONTHLY lines only. A one-time
 * project price or a per-production price is not a retainer, and summing it here is the
 * exact bug the studio reported ("toma el total de los servicios como Fee mensual").
 */
export function monthlyTotal(lines: ClientServiceDto[]): number {
  return lines
    .filter((l) => l.active && l.billingMode === 'monthly')
    .reduce((sum, l) => sum + toMajor(l.priceMinor), 0)
}

/** What is left to bill of a one-time line, in the contract's currency (majors). */
export function remainingOf(line: ClientServiceDto): number {
  const billed = line.billedMinor === null ? 0 : Number(line.billedMinor)
  return Math.max(Number(line.priceMinor) - billed, 0) / 100
}

/**
 * The discount and net of a charge, in MINOR units with the server's formula: floor the
 * DISCOUNT, then subtract. Flooring the net in pesos loses the centavos on a figure that
 * ends up on the statement sent to the client.
 */
export function chargeNet(
  amountMajor: number,
  discountPercentBp: number | null | undefined,
): { discount: number; net: number } {
  const baseMinor = Math.round(amountMajor * 100)
  const discountMinor = discountPercentBp ? Math.floor((baseMinor * discountPercentBp) / 10_000) : 0
  return { discount: discountMinor / 100, net: (baseMinor - discountMinor) / 100 }
}

