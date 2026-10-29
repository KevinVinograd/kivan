import { describe, expect, it } from 'vitest'

import type { ClientServiceDto } from '@/api/clients'
import {
  chargeNet,
  includedHoursLabel,
  monthlyTotal,
  parseIncludedHours,
  remainingOf,
} from './clients-service-lines-format'

function line(over: Partial<ClientServiceDto>): ClientServiceDto {
  return {
    id: 'l',
    clientId: 'c',
    serviceId: null,
    name: 'Redes',
    priceMinor: '0',
    active: true,
    billingMode: 'monthly',
    includedHours: null,
    billedMinor: null,
    sortOrder: 0,
    ...over,
  }
}

describe('monthlyTotal', () => {
  it('sums the active monthly lines only', () => {
    const lines = [
      line({ priceMinor: '130000000' }),
      line({ priceMinor: '140000000', billingMode: 'one_time' }),
      line({ priceMinor: '7500000', billingMode: 'per_production' }),
      line({ priceMinor: '5000000', active: false }),
    ]
    expect(monthlyTotal(lines)).toBe(1_300_000)
  })
})

describe('remainingOf', () => {
  it('subtracts what is already in cobros', () => {
    expect(remainingOf(line({ priceMinor: '140000000', billingMode: 'one_time', billedMinor: '70000000' }))).toBe(
      700_000,
    )
  })

  it('never goes negative', () => {
    expect(remainingOf(line({ priceMinor: '100', billingMode: 'one_time', billedMinor: '500' }))).toBe(0)
  })
})

describe('chargeNet', () => {
  it('floors the discount in minor units, like the server', () => {
    expect(chargeNet(700_000.01, 500)).toEqual({ discount: 35_000, net: 665_000.01 })
  })

  it('charges the full amount with no discount agreed', () => {
    expect(chargeNet(700_000, null)).toEqual({ discount: 0, net: 700_000 })
  })
})

describe('included hours', () => {
  it('reads only on a per-hour line that has some', () => {
    expect(includedHoursLabel(line({ billingMode: 'per_hour', includedHours: 6 }))).toBe('6 h incluidas por mes')
    expect(includedHoursLabel(line({ billingMode: 'per_hour', includedHours: 1.5 }))).toBe('1,5 h incluidas por mes')
    expect(includedHoursLabel(line({ billingMode: 'per_hour', includedHours: null }))).toBeNull()
    expect(includedHoursLabel(line({ billingMode: 'monthly', includedHours: 6 }))).toBeNull()
  })

  it('parses either separator, and treats blank or zero as none', () => {
    expect(parseIncludedHours('6')).toBe(6)
    expect(parseIncludedHours('1,5')).toBe(1.5)
    expect(parseIncludedHours('')).toBeNull()
    expect(parseIncludedHours('0')).toBeNull()
    expect(parseIncludedHours('9999')).toBe(744)
  })
})
