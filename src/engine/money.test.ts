import { describe, expect, it } from 'vitest';
import { formatINR, percentOf, rupees } from './money';

describe('money', () => {
  it('converts rupees to paise', () => {
    expect(rupees(1500)).toBe(150000);
  });
  it('takes a percentage in whole paise', () => {
    expect(percentOf(rupees(10000), 18)).toBe(rupees(1800));
    expect(percentOf(333, 5)).toBe(17);
  });
  it('formats with Indian digit grouping', () => {
    expect(formatINR(rupees(125000))).toBe('₹1,25,000');
    expect(formatINR(12550)).toBe('₹125.50');
  });
});
