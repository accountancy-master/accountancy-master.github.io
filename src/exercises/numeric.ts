import type { NumericUnit, NumericValue, TypedQuestion } from '@/content/types';
import { formatINR } from '@/engine/money';
import { parseRupees } from '@/lib/money-input';

const PERCENT_INPUT = /^(\d+)(?:\.(\d{1,2}))?\s*%?$/;
const WHOLE_NUMBER = /^\d+$/;
// "2.5", and as a student may well write it, "2.5 times" or "2.5 : 1".
const TIMES_INPUT = /^(\d+)(?:\.(\d{1,2}))?\s*(?:times|x|:\s*1)?$/i;

/** Hundredths from the whole part and up to two decimals of what was typed. */
const hundredths = (whole: string, decimals: string | undefined): number | null => {
  const value = Number(whole) * 100 + Number((decimals ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(value) ? value : null;
};

/**
 * What a student typed, as the integer the question counts in (see NumericUnit); null when it is not a valid
 * amount. Rupees accept what parseRupees does ("1,25,000", "₹ 980.50"), a number is plain digits, a percent is
 * digits with up to two decimals and an optional "%", and "times" is digits with up to two decimals (a "times" or
 * ": 1" after them is taken as read).
 */
export function parseNumeric(input: string, unit: NumericUnit): number | null {
  const text = input.trim();
  if (unit === 'rupees') return parseRupees(text);
  if (unit === 'number') {
    if (!WHOLE_NUMBER.test(text)) return null;
    const n = Number(text);
    return Number.isSafeInteger(n) ? n : null;
  }
  const m = (unit === 'times' ? TIMES_INPUT : PERCENT_INPUT).exec(text);
  return m ? hundredths(m[1], m[2]) : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Ratios. A ratio is held as its terms, in the order the question names the parties, in lowest terms: [5, 3, 2].
// ---------------------------------------------------------------------------------------------------------------

/** A ratio has this many terms: two partners at least, four at most. */
export const MIN_RATIO_TERMS = 2;
export const MAX_RATIO_TERMS = 4;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** True for two to four whole numbers above zero: what a ratio is made of, in lowest terms or not. */
export const isRatioTerms = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length >= MIN_RATIO_TERMS && value.length <= MAX_RATIO_TERMS && value.every((n) => Number.isSafeInteger(n) && n > 0);

/** The ratio in its lowest terms, in the same order: 6:4 is 3:2, and 20:12:8 is 5:3:2. */
export function lowestTerms(terms: readonly number[]): number[] {
  const shared = terms.reduce(gcd);
  return terms.map((n) => n / shared);
}

/** True for a ratio as a question holds it: two to four whole numbers above zero with no common factor. */
export const isRatio = (value: unknown): value is number[] => isRatioTerms(value) && lowestTerms(value).every((n, i) => n === value[i]);

/** What separates the terms of a ratio as it is typed: a colon, and what a phone's number pad offers in its place. */
export const RATIO_SEPARATOR = /\s*[:;,./-]\s*|\s+/;

/**
 * What a student typed as a ratio of `terms` numbers ("3:2", "5 : 3 : 2"), in lowest terms; null when it is not that
 * many whole numbers above zero. "6:4" is read as 3:2: a ratio is compared in its lowest terms, and in the order typed.
 */
export function parseRatio(input: string, terms: number): number[] | null {
  const parts = input.trim().split(RATIO_SEPARATOR);
  if (parts.length !== terms || !parts.every((p) => WHOLE_NUMBER.test(p))) return null;
  const numbers = parts.map(Number);
  return isRatioTerms(numbers) ? lowestTerms(numbers) : null;
}

/** The answer a student typed to this question, in what the question counts in; null when it cannot be read as one. */
export const readNumeric = (question: Pick<TypedQuestion, 'unit' | 'answer'>, input: string): NumericValue | null =>
  question.unit === 'ratio' ? parseRatio(input, (question.answer as number[]).length) : parseNumeric(input, question.unit);

/** A value as a mistake code and a comparison write it: the integer, or the terms of a ratio joined by colons. */
export const numericKey = (value: NumericValue): string => (typeof value === 'number' ? String(value) : value.join(':'));

/** True when two values are the same answer. */
export const sameNumeric = (a: NumericValue, b: NumericValue): boolean => numericKey(a) === numericKey(b);

/** The value as a student would type it ("12500" for ₹12,500, "12.5" for 1250 hundredths of a percent, "3:2"). */
export function typedNumeric(value: NumericValue, unit: TypedQuestion['unit']): string {
  if (typeof value !== 'number') return value.join(':');
  if (unit === 'number') return String(value);
  return value % 100 === 0 ? String(value / 100) : (value / 100).toFixed(2).replace(/0$/, '');
}

/** The value as it is shown in feedback ("₹12,500", "42", "12.5%", "2.5", "3:2"). */
export function formatNumeric(value: NumericValue, unit: TypedQuestion['unit']): string {
  if (typeof value !== 'number') return value.join(':');
  if (unit === 'rupees') return formatINR(value);
  if (unit === 'percent') return `${typedNumeric(value, 'percent')}%`;
  if (unit === 'times') return typedNumeric(value, 'times');
  return value.toLocaleString('en-IN');
}

/** "5:3:2" for three terms: the example a ratio of that many terms is asked for with. */
const RATIO_EXAMPLE: Record<number, string> = { 2: '3:2', 3: '5:3:2', 4: '4:3:2:1' };

/**
 * How an answer of each unit is asked for: the label of its field, what the empty field shows, and what is said when
 * what was typed cannot be read. The answer inputs and a mock paper's list of unanswered questions share these.
 */
export function numericWords(question: Pick<TypedQuestion, 'unit' | 'answer'>): { label: string; placeholder: string; problem: string } {
  switch (question.unit) {
    case 'rupees':
      return { label: 'Your answer in rupees (₹)', placeholder: 'Amount ₹', problem: 'Enter an amount in rupees, for example 12,500.' };
    case 'number':
      return { label: 'Your answer (a whole number)', placeholder: 'Number', problem: 'Enter a whole number, for example 42.' };
    case 'percent':
      return { label: 'Your answer in percent (%)', placeholder: 'Percent %', problem: 'Enter a percentage, for example 12.5.' };
    case 'times':
      return { label: 'Your answer (a number, up to two decimal places)', placeholder: 'Number', problem: 'Enter a number with up to two decimal places, for example 2.5.' };
    case 'ratio': {
      const example = RATIO_EXAMPLE[(question.answer as number[]).length] ?? RATIO_EXAMPLE[2];
      return { label: 'Your answer (a ratio)', placeholder: '', problem: `Enter the ratio as whole numbers above zero, one in every box, for example ${example}.` };
    }
  }
}
