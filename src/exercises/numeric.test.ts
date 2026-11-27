import { describe, expect, it } from 'vitest';
import { formatNumeric, parseNumeric, typedNumeric } from './numeric';
import type { NumericQuestion } from '@/content/types';
import { EXERCISE_LOGIC } from './logic';

describe('parseNumeric', () => {
  it('reads rupees as paise, with Indian or Western grouping', () => {
    expect(parseNumeric('12500', 'rupees')).toBe(1250000);
    expect(parseNumeric('₹ 1,25,000', 'rupees')).toBe(12500000);
    expect(parseNumeric('980.50', 'rupees')).toBe(98050);
    expect(parseNumeric('Rs. 5000/-', 'rupees')).toBe(500000);
  });
  it('reads a number as plain digits only', () => {
    expect(parseNumeric(' 42 ', 'number')).toBe(42);
    for (const bad of ['4.5', '1,000', '-3', 'abc', '', '99999999999999999999']) expect(parseNumeric(bad, 'number'), bad).toBeNull();
  });
  it('reads a percent as hundredths, with an optional % sign', () => {
    expect(parseNumeric('12.5', 'percent')).toBe(1250);
    expect(parseNumeric('12.5%', 'percent')).toBe(1250);
    expect(parseNumeric('8 %', 'percent')).toBe(800);
    expect(parseNumeric('0.25', 'percent')).toBe(25);
    for (const bad of ['12.555', '-1', 'x%', '']) expect(parseNumeric(bad, 'percent'), bad).toBeNull();
  });
  it('rejects nothing typed and zero rupees', () => {
    expect(parseNumeric('', 'rupees')).toBeNull();
    expect(parseNumeric('0', 'rupees')).toBeNull();
  });
});

describe('typedNumeric and formatNumeric', () => {
  it('write an answer the way a student types it, and the way feedback shows it', () => {
    expect(typedNumeric(1250000, 'rupees')).toBe('12500');
    expect(typedNumeric(98050, 'rupees')).toBe('980.5');
    expect(typedNumeric(98005, 'rupees')).toBe('980.05');
    expect(typedNumeric(42, 'number')).toBe('42');
    expect(typedNumeric(1250, 'percent')).toBe('12.5');
    expect(formatNumeric(1250000, 'rupees')).toBe('₹12,500');
    expect(formatNumeric(1250, 'percent')).toBe('12.5%');
    expect(formatNumeric(125000, 'number')).toBe('1,25,000');
  });
  it('round-trip: what is typed for an answer parses back to it', () => {
    for (const [value, unit] of [
      [1250000, 'rupees'],
      [98050, 'rupees'],
      [98005, 'rupees'],
      [42, 'number'],
      [1250, 'percent'],
      [805, 'percent'],
    ] as const) {
      expect(parseNumeric(typedNumeric(value, unit), unit), `${value} ${unit}`).toBe(value);
    }
  });
});

describe('a percent answer is typed as a percent, not as hundredths', () => {
  it('stores 5% as 500 and 12.5% as 1250, and expects "5" and "12.5" to be typed', () => {
    expect(parseNumeric('5', 'percent')).toBe(500);
    expect(parseNumeric('12.5', 'percent')).toBe(1250);
    expect(typedNumeric(500, 'percent')).toBe('5');
    expect(typedNumeric(1250, 'percent')).toBe('12.5');
    const q = { type: 'numeric', unit: 'percent', answer: 500, commonErrors: [] } as unknown as NumericQuestion;
    expect(EXERCISE_LOGIC.numeric.e2eExpected(q)).toBe('5');
    expect(EXERCISE_LOGIC.numeric.check(q, { type: 'numeric', value: parseNumeric('5', 'percent')! }).correct).toBe(true);
    // Typing the stored value (500) is the wrong answer: it would be 500%.
    expect(EXERCISE_LOGIC.numeric.check(q, { type: 'numeric', value: parseNumeric('500', 'percent')! }).correct).toBe(false);
  });
});
