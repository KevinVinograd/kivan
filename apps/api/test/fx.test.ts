import { describe, expect, it } from 'vitest';

import { BadRequestError } from '../src/lib/errors.js';
import { convertToArsMinor } from '../src/lib/fx.js';

/**
 * The arithmetic that turns a dollar retainer into the pesos on a factura.
 *
 * It is worth its own test file because it is the one step where a rounding choice becomes
 * money: everything upstream is a lookup and everything downstream just stores the result.
 */
describe('convertToArsMinor', () => {
  it('converts the studio case exactly', () => {
    // USD 500,00 at 1.234,50 ARS/USD = $617.250,00. The figure the operator approves in
    // the dialog is this one, down to the centavo, because the same function produces both.
    expect(convertToArsMinor(50_000n, 123_450n)).toBe(61_725_000n);
  });

  it('rounds half up, and only at the boundary', () => {
    // 1 centavo of USD at 1,505 ARS/USD is 1,505 ARS centavos. Half-up takes it to 2.
    expect(convertToArsMinor(1n, 150n)).toBe(2n); // 1.50 → 2
    expect(convertToArsMinor(1n, 149n)).toBe(1n); // 1.49 → 1
    expect(convertToArsMinor(1n, 151n)).toBe(2n); // 1.51 → 2
    expect(convertToArsMinor(1n, 250n)).toBe(3n); // 2.50 → 3, not 2
  });

  it('stays exact where a float would not', () => {
    // USD 1.234,56 at 1.187,33. In IEEE-754 the product lands a centavo either side of the
    // true figure depending on the machine, and that centavo goes onto an invoice.
    // 123456 * 118733 = 14_658_301_248, so the true figure is $1.465.830,1248 and the
    // half-up result is 146_583_012 centavos.
    expect(convertToArsMinor(123_456n, 118_733n)).toBe(146_583_012n);
  });

  it('converts zero to zero', () => {
    expect(convertToArsMinor(0n, 123_450n)).toBe(0n);
  });

  it('handles a fee far larger than the studio bills', () => {
    // USD 1.000.000,00 at 1.234,50. Exact: the arithmetic itself has no width to run out
    // of, which is the other reason this is not floating point. Its DESTINATION does have
    // one, which the next case covers.
    expect(convertToArsMinor(100_000_000n, 123_450n)).toBe(123_450_000_000n);
  });

  it('refuses a result too large for the column it is going into', () => {
    // The arithmetic here cannot overflow, but its destination can: the total goes into a
    // BIGINT through a branded MinorUnits capped at INT8_MAX. Past that, `minor()` throws a
    // raw ZodError — not a mapped AppError — and it throws MID-BATCH, after clients have
    // already been created inside the generator's transaction. The operator would see
    // `Internal server error` and a month with zero cobros, for a mistyped fee.
    const overMax = 92_233_720_368_547_759n; // × 123450 / 100 is past INT8_MAX
    expect(() => convertToArsMinor(overMax, 123_450n)).toThrow(/too large to bill/);
    // And it is a 400, so the operator is told what to fix instead of getting a 500.
    expect(() => convertToArsMinor(overMax, 123_450n)).toThrow(BadRequestError);
  });

  it('refuses a negative input rather than rounding it plausibly', () => {
    // Half-up is asymmetric around zero, so a negative would round in a direction nobody
    // chose. Neither a negative retainer nor a negative rate is a real thing.
    expect(() => convertToArsMinor(-1n, 123_450n)).toThrow(/non-negative/);
    expect(() => convertToArsMinor(50_000n, -1n)).toThrow(/non-negative/);
  });
});
