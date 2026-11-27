import { describe, expect, it } from 'vitest';
import { parseRupees } from './money-input';

describe('parseRupees', () => {
  it.each([
    ['5000', 500000],
    ['5,000', 500000],
    ['1,25,000', 12500000],
    ['₹ 9,800', 980000],
    ['125.5', 12550],
    ['125.50', 12550],
    ['0.05', 5],
    [' 700 ', 70000],
    ['Rs. 5000', 500000],
    ['rs 5,000', 500000],
    ['5000/-', 500000],
    ['₹1,25,000.50', 12500050],
    ['125,000', 12500000],
    ['12,34,567', 123456700],
    ['1,234,567', 123456700],
  ])('parses %s', (input, paise) => {
    expect(parseRupees(input)).toBe(paise);
  });

  it.each(['', '   ', 'abc', '12.345', '-5', '1e3', '5..0', '.', '0', '0.00'])('rejects %s', (input) => {
    expect(parseRupees(input)).toBeNull();
  });

  it.each([
    '1,5',
    '12,50',
    '1,2,3',
    ',5',
    '5,',
    '1 2 3',
    '5₹00',
    '1,25,00',
    '₹ ₹5',
    '₹₹5',
    '5 000',
    '1,25 000',
    '-5,000',
    '1.5e3',
    '5.123',
    '1,234,56,789',
    '0,000',
  ])('rejects malformed %s', (input) => {
    expect(parseRupees(input)).toBeNull();
  });

  it('is exact for values floats get wrong', () => {
    expect(parseRupees('1.15')).toBe(115);
    expect(parseRupees('4.35')).toBe(435);
  });
});
