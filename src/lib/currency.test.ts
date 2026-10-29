import { describe, expect, it } from 'vitest'

import { formatCurrency, LANES, LANE_FILTER_OPTIONS, LANE_NOUN, NON_PESO_LANES } from './currency'

const NBSP = String.fromCharCode(160)
const plain = (s: string) => s.split(NBSP).join(' ')

describe('formatCurrency', () => {
  it('gives each lane its own symbol, so two lanes never read alike', () => {
    expect(plain(formatCurrency(1_000, 'ARS'))).toBe('$ 1.000')
    expect(plain(formatCurrency(1_000, 'USD'))).toBe('US$ 1.000')
  })

  it('defaults to pesos, the lane most call sites are in', () => {
    expect(formatCurrency(1_000)).toBe(formatCurrency(1_000, 'ARS'))
  })
})

describe('the lane vocabulary', () => {
  it('offers every lane as a filter option, capitalised, named as the cards name it', () => {
    expect(LANE_FILTER_OPTIONS.map((o) => o.value)).toEqual(['ARS', 'USD'])
    expect(LANES).toEqual(['ARS', 'USD'])
    expect(LANE_FILTER_OPTIONS.map((o) => o.label)).toEqual(['Pesos', 'Dólares'])
    for (const { value, label } of LANE_FILTER_OPTIONS) {
      const noun = LANE_NOUN[value]
      expect(label.slice(1)).toBe(noun.slice(1))
      expect(label.charAt(0)).toBe(noun.charAt(0).toUpperCase())
    }
  })

  it('leaves pesos out of the non-peso lanes, and nothing else', () => {
    expect(NON_PESO_LANES).toEqual(['USD'])
  })

  it('holds exactly TWO lanes, which three summary cards are built on', () => {
    expect(LANES).toHaveLength(2)
  })
})
