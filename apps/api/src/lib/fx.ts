/**
 * Turning a foreign-currency price into the pesos it is actually billed at.
 *
 * The studio prices some retainers in USD and invoices them in ARS, at a rate it fixes on
 * the first business day of the month. This is the one place that arithmetic happens, so
 * the generator, its preview, and any later caller cannot drift apart on rounding.
 */
import { BadRequestError } from './errors.js';

/**
 * ARS minor units for `amountMinor` of a foreign currency at `arsPerUsdMinor`.
 *
 * Both inputs are minor units and so is the result: USD 500,00 is 50000, a rate of
 * 1.234,50 ARS/USD is 123450, and the product carries two extra decimal places that the
 * division removes. 50000 × 123450 / 100 = 61_725_000, which is $617.250,00.
 *
 * BIGINT THROUGHOUT, deliberately. A rate has two decimals and a fee has two, so the
 * intermediate product is four decimal places wide; in floating point a fee like USD
 * 1.234,56 at 1.187,33 lands a centavo either side of the true figure depending on the
 * machine, and that centavo goes onto a factura. Integers cannot do that.
 *
 * Rounds half UP, which is the convention a person doing this by hand uses, and the
 * direction the studio would round its own invoice.
 *
 * The arithmetic here has no width to overflow, but its DESTINATION does: the result goes
 * into a `BIGINT` column through a branded `MinorUnits` whose ceiling is INT8_MAX. Past
 * that, `minor()` throws a raw ZodError rather than a mapped `AppError`, and it throws
 * mid-batch, after clients have already been created inside the generator's transaction —
 * so the operator would get `Internal server error` and a month with zero cobros. Refused
 * here instead, where it can be reported as the bad input it is.
 */

/** The largest value a Postgres BIGINT (and this app's `MinorUnits`) can hold. */
const MINOR_UNITS_MAX = 9_223_372_036_854_775_807n;

export function convertToArsMinor(amountMinor: bigint, arsPerUsdMinor: bigint): bigint {
  if (amountMinor < 0n || arsPerUsdMinor < 0n) {
    // Neither a negative retainer nor a negative rate is a thing, and half-up rounding is
    // asymmetric around zero — so rather than round a nonsense input in a plausible
    // direction, refuse it. The callers validate before this, which makes this the
    // backstop for a path that stops validating later.
    throw new Error('convertToArsMinor expects non-negative minor units');
  }
  const converted = (amountMinor * arsPerUsdMinor + 50n) / 100n;
  if (converted > MINOR_UNITS_MAX) {
    throw new BadRequestError(
      'The converted amount is too large to bill: check the monthly fee and the exchange rate',
    );
  }
  return converted;
}
