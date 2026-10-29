import { describe, expect, it } from 'vitest'

import { formatExchangeRate, formatMoney, formatMoneyPrecise } from './cobranza-format'

const NBSP = String.fromCharCode(160)
const plain = (s: string) => s.split(NBSP).join(' ')

describe('formatMoneyPrecise', () => {
  it('keeps both decimals, which is the whole reason it exists', () => {
    expect(plain(formatMoneyPrecise(1_234.56, 'USD'))).toBe('US$ 1.234,56')
    expect(plain(formatMoneyPrecise(1_234.5, 'ARS'))).toBe('$ 1.234,50')
  })

  it('does not let one lane’s cache entry answer for the other', () => {
    expect(formatMoneyPrecise(1_500, 'USD')).not.toBe(formatMoneyPrecise(1_500, 'ARS'))
    expect(plain(formatMoneyPrecise(1_500, 'ARS'))).toBe('$ 1.500,00')
    expect(plain(formatMoneyPrecise(1_500, 'USD'))).toBe('US$ 1.500,00')
  })
})

describe('formatExchangeRate', () => {
  it('reads a rate back the way the operator typed it', () => {
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
