/**
 * The lane formatters and the lane vocabulary.
 *
 * `Currency` is a segregated lane, not a display format — only USD converts, and only at
 * cobro generation. So the thing these pin is that each lane wears its OWN symbol: a
 * dollar figure carrying a peso "$" is not a rounding difference, it is a different kind
 * of thing, on a statement an operator sends a client.
 *
 * This file used to be dominated by a third lane, `FCI`, and by the symbol-free formatter
 * it needed — fund SHARES cannot wear a currency symbol. That lane is gone: a Fondo Común
 * is an ACCOUNT holding pesos, not a currency (migration 0028,
 * the product rules), and with it went `formatLaneTotal`, whose only
 * reason to differ from `formatCurrency` was FCI's prefix.
 */
import { describe, expect, it } from 'vitest'

import { formatCurrency, LANES, LANE_FILTER_OPTIONS, LANE_NOUN, NON_PESO_LANES } from './currency'

/** Intl emits U+00A0 between symbol and digits; pasting one in makes it load-bearing. */
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
    // One source for three screens (/cobros, /pagos, /billing). Each used to build its own
    // copy; the copies existed to guarantee the filter and the summary card call a lane the
    // same thing, which is precisely what a third copy would have stopped guaranteeing.
    // The literal, NOT `[...LANES]`: both sides derive from that array, so comparing
    // them passed for any lane set at all — including one missing a lane the enum has.
    expect(LANE_FILTER_OPTIONS.map((o) => o.value)).toEqual(['ARS', 'USD'])
    expect(LANES).toEqual(['ARS', 'USD'])
    expect(LANE_FILTER_OPTIONS.map((o) => o.label)).toEqual(['Pesos', 'Dólares'])
    for (const { value, label } of LANE_FILTER_OPTIONS) {
      // Only the FIRST character's case may differ from the noun, so a label can never
      // drift into a word the summary card does not use.
      const noun = LANE_NOUN[value]
      expect(label.slice(1)).toBe(noun.slice(1))
      expect(label.charAt(0)).toBe(noun.charAt(0).toUpperCase())
    }
  })

  it('leaves pesos out of the non-peso lanes, and nothing else', () => {
    expect(NON_PESO_LANES).toEqual(['USD'])
  })

  it('holds exactly TWO lanes, which three summary cards are built on', () => {
    // Not a restatement of the case above — a claim about what depends on the count.
    // `/cobros`, `/pagos` and `/billing` each promote one figure PER LANE to a co-equal
    // `type-metric` hero, and the convention caps co-visible heroes at two
    // (a ceiling `KpiSummaryCard`'s tuple-typed `heroId` enforces at compile time).
    //
    // So a third lane is not a free addition. It would land in each card's SUPPORTING
    // grid — 32px, beside peso amounts, with nothing saying the units differ — while the
    // pair went on naming the first two. Nothing else in the suite would notice, because
    // every other assertion is written against the lanes that exist. This is the line
    // that goes red and sends whoever adds one to `*_HERO_IDS` and the three page-contexts.
    expect(LANES).toHaveLength(2)
  })
})
