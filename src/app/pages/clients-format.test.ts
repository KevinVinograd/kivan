import { describe, expect, it } from 'vitest'

import { formatCurrency, netMonthlyFee } from './clients-format'
import type { Client } from './clients-mock-data'

describe('formatCurrency', () => {
  it('defaults to ARS so existing peso call sites are unchanged', () => {
    expect(formatCurrency(1500).replace(/ | /g, ' ')).toBe('$ 1.500')
  })

  it('formats an amount in its own currency instead of assuming pesos', () => {
    const usd = formatCurrency(1500, 'USD')
    expect(usd).toContain('US$')
    expect(usd).not.toBe(formatCurrency(1500, 'ARS'))
  })

  it('never converts between currencies: the number is carried through untouched', () => {
    for (const currency of ['ARS', 'USD'] as const) {
      expect(formatCurrency(1500, currency)).toContain('1.500')
    }
  })
})

describe('netMonthlyFee', () => {
  const client = (monthlyFee: number, discountPercentBp?: number) =>
    ({ monthlyFee, discountPercentBp }) as Client

  it('returns the fee untouched when no discount was agreed', () => {
    expect(netMonthlyFee(client(150000))).toBe(150000)
  })

  it('keeps the centavos the server keeps', () => {
    expect(netMonthlyFee(client(1500.5, 1000))).toBe(1350.45)
  })

  it('floors the DISCOUNT, not the net, on a rate that does not divide evenly', () => {
    expect(netMonthlyFee(client(100.33, 1250))).toBe(87.79)
  })

  it('handles a whole-peso fee at a whole rate', () => {
    expect(netMonthlyFee(client(200000, 1000))).toBe(180000)
  })
})
