import { describe, expect, it } from 'vitest'

import { formatAmountSeed, parseAmountInput, parsePercentInput } from './clients-dialogs'

/**
 * The money field of the client form. These two functions MUST be exact inverses:
 * the dialog seeds the input with `formatAmountSeed(storedFee)` and reads it back
 * with `parseAmountInput`, so any asymmetry silently rewrites a live fee on an edit
 * the operator did not intend to make.
 *
 * That is not hypothetical. The first version seeded with `String(12500.5)`, whose
 * dot `parseAmountInput` strips as a thousands separator, so merely touching the
 * field turned 12.500,50 into 125.005 and saved it with a success toast.
 */
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
    // The old <input type="number"> put a literal 0 in every new client's fee field
    // and made the operator delete it before typing.
    expect(formatAmountSeed(undefined)).toBe('')
    expect(formatAmountSeed(0)).toBe('')
  })

  it('is the exact inverse of parseAmountInput', () => {
    // The invariant that matters: reopening Editar and touching the field must not
    // change the stored amount.
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

/**
 * The DISCOUNT field, which is a rate and not an amount — and needed its own parser for
 * exactly that reason. Reusing `parseAmountInput` here read a typed `12.5` as 125,
 * because on money that dot is a thousands separator. The result clamped to a 100%
 * discount, which bills the client zero, while the field went on showing `12.5`.
 */
describe('parsePercentInput', () => {
  it('reads BOTH separators as the decimal point, because a percentage has no thousands', () => {
    // The regression: as an amount, '12.5' is twelve thousand five hundred.
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
