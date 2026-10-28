/**
 * Currency formatting at the UI edge. A LEAF module on purpose: it imports nothing from
 * `app/pages`, so anything may depend on it without creating a cycle.
 *
 * It lives here because it did not. `formatCurrency` sat in `clients-format`, and the day
 * `cobranza-format` needed it the import closed a ring —
 * `cobranza-format → clients-format → dashboard-format → cobranza-format` — and
 * `clients-format` computes `RISK_FILTER_OPTIONS` at module level by calling
 * `riskLevelBadge`, which reads a `const` in `dashboard-format` that the cycle had not
 * initialized yet. The result was `Cannot access 'RISK_LEVEL' before initialization`
 * thrown during module evaluation: React never mounted and every page went blank in
 * production, on a build whose server still answered 200.
 *
 * The formatters are cached because `Intl.NumberFormat` is expensive to construct and
 * these run per row.
 */
import type { Currency } from '@hold/shared'

const currencyFormatters = new Map<string, Intl.NumberFormat>()

function formatterFor(currency: Currency): Intl.NumberFormat {
  // Every lane is a real currency now, so every one wears its own symbol. This used to
  // carry an FCI branch returning a symbol-free formatter, because fund SHARES are not
  // money and cannot wear a peso sign. FCI stopped being a lane: a Fondo Común is an
  // ACCOUNT, and what it holds is pesos.
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



/**
 * How a lane is NAMED in a label, in the operator's words rather than its ISO code.
 *
 * "pesos" and "dólares" are what an operator writing to a client would type; `ARS 12.000`
 * in a sentence reads like a system message, and the label is prose, not a figure.
 */
export const LANE_NOUN: Record<Currency, string> = {
  ARS: 'pesos',
  USD: 'dólares',
}

/**
 * Every lane, in display order — the order a summary card lists them and a filter offers
 * them, so the two never disagree.
 *
 * DERIVED from `LANE_NOUN`, not written out again. That `Record<Currency, string>` is
 * exhaustiveness-checked by the compiler, so a lane added to the shared enum cannot
 * compile until it is named there — and now cannot be missing from this array either.
 * As a hand-written literal it was the opposite: a new lane was silently absent from
 * every summary card and every Moneda filter, with the whole suite green, while the peso
 * aggregates went on excluding it. The docblock even told the reader this file was
 * enum-protected, which was true of `LANE_NOUN` and false of the constant it described.
 *
 * It lives HERE rather than being imported from `treasury-position`, which also exports a
 * `CURRENCIES`. A page module reaching into that one for a constant is the exact import
 * shape that closed a ring once already and blanked the app in production (see this
 * file's header). This module imports nothing, so nothing can cycle through it.
 */
export const LANES: readonly Currency[] = Object.keys(LANE_NOUN) as Currency[]

/** The lanes a peso-scoped total leaves out. */
export const NON_PESO_LANES: readonly Currency[] = LANES.filter((c) => c !== 'ARS')

/**
 * How a lane is NAMED in a settings picker — the currency itself, not the prose noun.
 *
 * `LANE_NOUN` is written for a sentence ("total en pesos"); a `Moneda` Select names the
 * thing being chosen, and "Pesos" is not what anyone calls the currency in that position.
 *
 * It lives HERE and not on the screen that renders it, for the reason `LANE_FILTER_OPTIONS`
 * gives just below: a per-screen copy is exhaustiveness-checked and still drifts, because
 * the next lane has to be given a label in each copy by someone who cannot see the others.
 */
export const LANE_PICKER_LABEL: Record<Currency, string> = {
  ARS: 'Peso argentino (ARS)',
  USD: 'Dólar (USD)',
}

/**
 * The lanes as `Moneda` filter options, capitalised for a label.
 *
 * It lives here, beside `LANE_NOUN`, because three screens offer this filter (/cobros,
 * /pagos, /billing) and the first two each built their own copy. Those copies existed to
 * guarantee that a lane is named identically in the filter and on the summary card — an
 * invariant a third copy would have started breaking rather than keeping.
 */
// Not `readonly`: `FilterField.options` is a mutable `FilterOption[]`, and widening that
// type ripples through `FiltersPopover`. The three copies this replaces were mutable too.
export const LANE_FILTER_OPTIONS: { value: Currency; label: string }[] = LANES.map((value) => ({
  value,
  label: LANE_NOUN[value].replace(/^./, (c) => c.toUpperCase()),
}))
