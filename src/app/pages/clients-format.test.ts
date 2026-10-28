import { describe, expect, it } from 'vitest'

import { formatCurrency, netMonthlyFee } from './clients-format'
import type { Client } from './clients-mock-data'

describe('formatCurrency', () => {
  it('defaults to ARS so existing peso call sites are unchanged', () => {
    // Intl uses a narrow no-break space between symbol and digits in es-AR.
    expect(formatCurrency(1500).replace(/ | /g, ' ')).toBe('$ 1.500')
  })

  it('formats an amount in its own currency instead of assuming pesos', () => {
    // The whole point: a USD fee rendered with the ARS formatter is a peso figure
    // that happens to carry a dollar amount, which is worse than showing nothing.
    const usd = formatCurrency(1500, 'USD')
    expect(usd).toContain('US$')
    expect(usd).not.toBe(formatCurrency(1500, 'ARS'))
  })

  it('never converts between currencies: the number is carried through untouched', () => {
    // Segregated lanes. There is no FX rate in the product and money.ts makes
    // cross-currency arithmetic throw, so formatting must not imply a conversion.
    for (const currency of ['ARS', 'USD'] as const) {
      expect(formatCurrency(1500, currency)).toContain('1.500')
    }
  })
})

/**
 * The net fee has to agree with the server to the CENTAVO, because it is printed into
 * the cuenta corriente statement sent to the client, into the CSV, and into MRR.
 *
 * The server computes `base - floor(base * bp / 10000)` in MINOR units. Flooring the net
 * in pesos instead truncates the centavos and rounds the other way, which is a figure
 * the client can hold up against their own cobro.
 */
describe('netMonthlyFee', () => {
  const client = (monthlyFee: number, discountPercentBp?: number) =>
    ({ monthlyFee, discountPercentBp }) as Client

  it('returns the fee untouched when no discount was agreed', () => {
    // Absent, not zero: a client with no rate is not a client on a 0% rate.
    expect(netMonthlyFee(client(150000))).toBe(150000)
  })

  it('keeps the centavos the server keeps', () => {
    // 150050 centavos − floor(150050 * 1000 / 10000) = 150050 − 15005 = 135045.
    // Flooring in pesos gives 1350, which is 45 centavos short of the cobro.
    expect(netMonthlyFee(client(1500.5, 1000))).toBe(1350.45)
  })

  it('floors the DISCOUNT, not the net, on a rate that does not divide evenly', () => {
    // 10033 centavos at 12.5%: floor(10033 * 1250 / 10000) = floor(1254.125) = 1254.
    expect(netMonthlyFee(client(100.33, 1250))).toBe(87.79)
  })

  it('handles a whole-peso fee at a whole rate', () => {
    expect(netMonthlyFee(client(200000, 1000))).toBe(180000)
  })
})
