/**
 * `formatMoneyPrecise` — the centavos-inclusive formatter behind the cobro detail's
 * cotización line ("USD 1.234,56 a $ 1.187,33").
 *
 * It keeps its own formatter CACHE, keyed by currency, and that cache is the whole reason
 * this file exists: the FCI branch it used to carry was cached under the `'ARS'` key, so
 * whichever lane asked first decided the other one's output for the rest of the session.
 * FCI is gone, the collision is not — two lanes still share one map.
 *
 * `formatMoney` is covered here too, thinly: it only delegates to `@/lib/currency`
 * (pinned by `currency.test.ts`), but it is the export the tables actually call, and a
 * delegation that stops delegating is exactly the kind of change no other test sees.
 */
import { describe, expect, it } from 'vitest'

import { formatExchangeRate, formatMoney, formatMoneyPrecise } from './cobranza-format'

/** Intl emits U+00A0 between symbol and digits; pasting one in makes it load-bearing. */
const NBSP = String.fromCharCode(160)
const plain = (s: string) => s.split(NBSP).join(' ')

describe('formatMoneyPrecise', () => {
  it('keeps both decimals, which is the whole reason it exists', () => {
    // The operator reconciles `USD 1.234,56 × 1.187,33` against the peso total by hand, so
    // a figure rounded to "US$ 1.235" does not multiply out to what was billed.
    expect(plain(formatMoneyPrecise(1_234.56, 'USD'))).toBe('US$ 1.234,56')
    expect(plain(formatMoneyPrecise(1_234.5, 'ARS'))).toBe('$ 1.234,50')
  })

  it('does not let one lane’s cache entry answer for the other', () => {
    // Same amount, both lanes, in one test: a cache that filed the second lane under the
    // first one's key returns the first lane's string here, and the two `toBe`s below are
    // what catch it whichever order the map happened to be filled in.
    expect(formatMoneyPrecise(1_500, 'USD')).not.toBe(formatMoneyPrecise(1_500, 'ARS'))
    expect(plain(formatMoneyPrecise(1_500, 'ARS'))).toBe('$ 1.500,00')
    expect(plain(formatMoneyPrecise(1_500, 'USD'))).toBe('US$ 1.500,00')
  })
})

describe('formatExchangeRate', () => {
  it('reads a rate back the way the operator typed it', () => {
    // 1.234,50 and 1.234,49 bill a USD 500 retainer five pesos apart.
    expect(plain(formatExchangeRate(1_234.5))).toBe('$ 1.234,50')
    expect(plain(formatExchangeRate(1_234.49))).toBe('$ 1.234,49')
  })
})

describe('formatMoney', () => {
  it('prints each lane in its own unit', () => {
    expect(plain(formatMoney(1_500, 'USD'))).toBe('US$ 1.500')
    expect(plain(formatMoney(1_500, 'ARS'))).toBe('$ 1.500')
  })
})
