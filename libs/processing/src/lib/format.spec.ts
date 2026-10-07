import { describe, expect, it } from 'vitest';

import { formatAmount, formatDate } from './format';

describe('formatAmount', () => {
  it.each([
    ['12000', 'KRW', '12,000원'],
    ['1234567', 'KRW', '1,234,567원'],
    ['900', 'KRW', '900원'],
    ['12.50', 'USD', '12.50 USD'],
    ['1234.5', 'EUR', '1,234.5 EUR'],
    ['12000', null, '12,000'],
    ['12345678901234567890', 'KRW', '12,345,678,901,234,567,890원'],
  ])('writes %s %s as %s without turning it into a number', (amount, currency, want) => {
    expect(formatAmount(amount, currency)).toBe(want);
  });
});

describe('formatDate', () => {
  it('writes the date with a period after the day', () => {
    expect(formatDate('2026-10-07')).toBe('2026. 10. 7.');
    expect(formatDate('2026-01-31')).toBe('2026. 1. 31.');
  });
});
