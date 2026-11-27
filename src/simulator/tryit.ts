import { formatINR, type Paise } from '@/engine/money';
import { inLowestTerms, parseRatio, sameRatio } from './partnership/fraction';

// ---------------------------------------------------------------------------------------------------------------
// The "Try it" questions of the labs of partnership and share capital: a question asked on the picture, answered at
// once with the reason. Nothing is recorded. The marking is here, pure, so that the screen and the tests agree.
// ---------------------------------------------------------------------------------------------------------------

export type Answer =
  | { type: 'amount'; value: Paise }
  | { type: 'ratio'; terms: number[]; of: string[] }
  | { type: 'pick'; options: string[]; correct: number[]; many: boolean };

export interface TryQuestion {
  id: string;
  kind: string;
  /** What the question is about, in a few words. */
  label: string;
  facts: string[];
  prompt: string;
  answer: Answer;
  /** The working, one line at a time. */
  why: string[];
}

export interface Given {
  /** What was typed, for an amount or a ratio. */
  text?: string;
  /** The options picked, for a pick. */
  picked?: number[];
}

export interface Marked {
  right: boolean;
  /** A word on the answer given: what the right one is, or why a near miss is not right. */
  note: string;
  /** Nothing usable was given: ask again, mark nothing. */
  empty?: boolean;
}

/** Reads an amount typed in rupees ("1,23,456", "₹ 4,500.50", "4500") as paise; null when it is not one. */
export function parseAmount(text: string): Paise | null {
  const t = text.replace(/[₹,\s]/g, '').replace(/^Rs\.?/i, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

export function mark(q: TryQuestion, given: Given): Marked {
  const a = q.answer;
  if (a.type === 'amount') {
    const v = given.text === undefined ? null : parseAmount(given.text);
    if (v === null) return { right: false, note: 'Type an amount in rupees, such as 12,500.', empty: true };
    if (v === a.value) return { right: true, note: `Right: ${formatINR(a.value)}.` };
    return { right: false, note: `Not quite: the answer is ${formatINR(a.value)}, not ${formatINR(v)}.` };
  }
  if (a.type === 'ratio') {
    const t = given.text === undefined ? null : parseRatio(given.text);
    if (!t || t.length !== a.terms.length) return { right: false, note: `Type a ratio of ${a.terms.length} terms with colons, such as ${a.terms.map((_, i) => i + 1).join(':')}.`, empty: true };
    if (sameRatio(t, a.terms)) {
      return inLowestTerms(t)
        ? { right: true, note: `Right: ${a.terms.join(':')}.` }
        : { right: true, note: `Right, and in lowest terms it is ${a.terms.join(':')}: write it so in the exam.` };
    }
    return { right: false, note: `Not quite: the ratio of ${a.of.join(', ')} is ${a.terms.join(':')}.` };
  }
  const picked = [...new Set(given.picked ?? [])].sort((x, y) => x - y);
  if (picked.length === 0) return { right: false, note: a.many ? 'Pick every one that applies.' : 'Pick one.', empty: true };
  const correct = [...a.correct].sort((x, y) => x - y);
  const right = picked.length === correct.length && picked.every((p, i) => p === correct[i]);
  const names = correct.map((i) => a.options[i]);
  return right ? { right: true, note: `Right: ${names.join(' and ')}.` } : { right: false, note: `Not quite: the answer is ${names.join(' and ')}.` };
}
