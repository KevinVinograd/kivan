/**
 * Money as integer MINOR UNITS (e.g. ARS centavos), represented as `bigint` and
 * transferred over JSON as a base-10 string so values > 2^53 don't lose
 * precision. NEVER use a float for money (engineering-standards §5/§14).
 *
 * `MinorUnits` is a Zod codec that accepts a bigint or an integer string and
 * yields a branded bigint. Arithmetic helpers operate strictly per currency
 * lane and refuse to mix lanes (mirrors the treasury ARS/USD invariant —
 * the lanes are never converted into each other).
 */
import { z } from 'zod';
import { Currency } from './enums.js';

// Signed 64-bit bounds — money is stored as Postgres BIGINT; reject over-range
// input at the edge (a 400) instead of letting it 500 on insert.
// Exported because DERIVED amounts need the same bound: the Zod codecs guard
// what a client sends, but a value computed server-side (hours x rate) bypasses
// them entirely and would 500 on insert instead of 400-ing at the edge.
export const INT8_MAX = 9_223_372_036_854_775_807n;
const INT8_MIN = -9_223_372_036_854_775_808n;

export const MinorUnits = z
  .union([z.bigint(), z.string().regex(/^-?\d+$/, 'must be an integer string')])
  .transform((v) => (typeof v === 'bigint' ? v : BigInt(v)))
  .refine((v) => v >= INT8_MIN && v <= INT8_MAX, 'out of 64-bit range')
  .brand<'MinorUnits'>();
export type MinorUnits = z.infer<typeof MinorUnits>;

// Most client-supplied amounts (prices, fees, payment amounts) must be >= 0;
// only deltas/adjustments may be negative. Use this for the former.
export const MinorUnitsNonNeg = z
  .union([z.bigint(), z.string().regex(/^\d+$/, 'must be a non-negative integer string')])
  .transform((v) => (typeof v === 'bigint' ? v : BigInt(v)))
  .refine((v) => v >= 0n && v <= INT8_MAX, 'must be between 0 and the 64-bit max')
  .brand<'MinorUnits'>();

/** Build a MinorUnits value from a bigint or integer string. */
export function minor(value: bigint | string): MinorUnits {
  return MinorUnits.parse(value);
}

/** Serialize a MinorUnits value for JSON transport (base-10 string). */
export function serializeMinor(value: MinorUnits | bigint): string {
  return value.toString();
}

export const Money = z.object({
  amountMinor: MinorUnits,
  currency: Currency,
});
export type Money = z.infer<typeof Money>;

export function money(amountMinor: bigint | string, currency: Currency): Money {
  return { amountMinor: minor(amountMinor), currency };
}

function assertSameLane(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`cross-currency money operation: ${a.currency} vs ${b.currency}`);
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameLane(a, b);
  return { amountMinor: (a.amountMinor + b.amountMinor) as MinorUnits, currency: a.currency };
}

export function subMoney(a: Money, b: Money): Money {
  assertSameLane(a, b);
  return { amountMinor: (a.amountMinor - b.amountMinor) as MinorUnits, currency: a.currency };
}

/**
 * Sum a non-empty list of Money in the same lane. Throws on an empty list (no
 * currency to attribute) or on mixed lanes.
 */
export function sumMoney(items: readonly Money[]): Money {
  const [head, ...rest] = items;
  if (head === undefined) {
    throw new Error('sumMoney: cannot sum an empty list (no currency lane)');
  }
  return rest.reduce(addMoney, head);
}
