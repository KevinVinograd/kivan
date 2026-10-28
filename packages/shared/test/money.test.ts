import { describe, expect, it } from 'vitest';
import { addMoney, minor, money, serializeMinor, subMoney, sumMoney } from '../src/money.js';

describe('MinorUnits', () => {
  it('parses an integer string into a bigint and round-trips to a string', () => {
    const v = minor('45000000');
    expect(v).toBe(45000000n);
    expect(serializeMinor(v)).toBe('45000000');
  });

  it('accepts a bigint directly', () => {
    expect(minor(1234n)).toBe(1234n);
  });

  it('rejects a non-integer string', () => {
    expect(() => minor('45.00')).toThrow();
  });
});

describe('money arithmetic (per-lane)', () => {
  it('adds amounts in the same currency', () => {
    const sum = addMoney(money('100', 'ARS'), money('250', 'ARS'));
    expect(sum.amountMinor).toBe(350n);
    expect(sum.currency).toBe('ARS');
  });

  it('subtracts amounts in the same currency', () => {
    expect(subMoney(money('500', 'ARS'), money('200', 'ARS')).amountMinor).toBe(300n);
  });

  it('refuses to add across currency lanes', () => {
    expect(() => addMoney(money('100', 'ARS'), money('100', 'USD'))).toThrow(/cross-currency/);
  });

  it('sums a non-empty same-lane list', () => {
    expect(sumMoney([money('1', 'ARS'), money('2', 'ARS'), money('3', 'ARS')]).amountMinor).toBe(6n);
  });

  it('throws summing an empty list (no lane)', () => {
    expect(() => sumMoney([])).toThrow(/empty/);
  });

  it('throws summing mixed lanes', () => {
    expect(() => sumMoney([money('1', 'ARS'), money('1', 'USD')])).toThrow(/cross-currency/);
  });
});
