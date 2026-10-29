import type { Currency } from '@hold/shared'

const currencyFormatters = new Map<string, Intl.NumberFormat>()

function formatterFor(currency: Currency): Intl.NumberFormat {
  let formatter = currencyFormatters.get(currency)
  if (!formatter) {
    formatter = new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    })
    currencyFormatters.set(currency, formatter)
  }
  return formatter
}

export function formatCurrency(value: number, currency: Currency = 'ARS'): string {
  return formatterFor(currency).format(value)
}



export const LANE_NOUN: Record<Currency, string> = {
  ARS: 'pesos',
  USD: 'dólares',
}

export const LANES: readonly Currency[] = Object.keys(LANE_NOUN) as Currency[]

export const NON_PESO_LANES: readonly Currency[] = LANES.filter((c) => c !== 'ARS')

export const LANE_PICKER_LABEL: Record<Currency, string> = {
  ARS: 'Peso argentino (ARS)',
  USD: 'Dólar (USD)',
}

export const LANE_FILTER_OPTIONS: { value: Currency; label: string }[] = LANES.map((value) => ({
  value,
  label: LANE_NOUN[value].replace(/^./, (c) => c.toUpperCase()),
}))
