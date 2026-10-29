import { describe, expect, it } from 'vitest'

import { formatAmountSeed, parseAmountInput, parsePercentInput } from './clients-dialogs'

describe('parseAmountInput', () => {
  it('reads es-AR notation: dot groups thousands, comma is the decimal separator', () => {
    expect(parseAmountInput('450.000')).toBe(450000)
    expect(parseAmountInput('12.500,50')).toBe(12500.5)
    expect(parseAmountInput('1.250.000')).toBe(1250000)
  })

  it('reads a bare number typed without separators', () => {
    expect(parseAmountInput('450000')).toBe(450000)
  })

  it('treats an empty or junk value as no amount, never as NaN', () => {
    expect(parseAmountInput('')).toBe(0)
    expect(parseAmountInput(',')).toBe(0)
    expect(parseAmountInput('-5')).toBe(0)
  })
})

describe('formatAmountSeed', () => {
  it('emits nothing for an absent or zero amount, so the field starts empty', () => {
    expect(formatAmountSeed(undefined)).toBe('')
    expect(formatAmountSeed(0)).toBe('')
  })

  it('is the exact inverse of parseAmountInput', () => {
    for (const amount of [450000, 12500.5, 1250000, 1, 99.99, 3000.05]) {
      expect(parseAmountInput(formatAmountSeed(amount))).toBe(amount)
    }
  })

  it('specifically survives a fee with centavos, which is what used to break', () => {
    const seeded = formatAmountSeed(12500.5)
    expect(seeded).toBe('12.500,5')
    expect(parseAmountInput(seeded)).toBe(12500.5)
  })
})

describe('parsePercentInput', () => {
  it('reads BOTH separators as the decimal point, because a percentage has no thousands', () => {
    expect(parsePercentInput('12.5')).toBe(12.5)
    expect(parsePercentInput('12,5')).toBe(12.5)
    expect(parseAmountInput('12.5')).toBe(125)
  })

  it('reads a whole percent', () => {
    expect(parsePercentInput('10')).toBe(10)
  })

  it('clamps above 100, so a slip cannot bill a client zero', () => {
    expect(parsePercentInput('250')).toBe(100)
  })

  it('treats an empty or junk value as no discount, never as NaN', () => {
    expect(parsePercentInput('')).toBe(0)
    expect(parsePercentInput('abc')).toBe(0)
    expect(parsePercentInput('-5')).toBe(0)
  })
})
