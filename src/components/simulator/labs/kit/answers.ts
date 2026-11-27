import { formatINR, type Paise } from '@/engine/money';

// The answers of a lab's quick questions: a figure as a learner types it (rupees, a percentage, a ratio), and the
// marking of an answer.

/** Rupees as a learner types them ("1,20,000", "₹ 4500", "4500.50") in paise, or null when it is not a figure. */
export function parseRupees(text: string): Paise | null {
  const t = text.replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

/** A percentage as a learner types it ("12.5", "16.67 %") in hundredths of a per cent, or null. */
export function parsePercentText(text: string): number | null {
  const t = text.replace(/[%\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

/** A ratio as a learner types it ("3:2", "3 : 2 : 1"): its terms, or null. */
export function parseRatioText(text: string): number[] | null {
  const parts = text.split(':').map((p) => p.trim());
  if (parts.length < 2 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const terms = parts.map(Number);
  return terms.some((t) => t > 0) ? terms : null;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
/** The same ratio, whatever the common factor: 6:4 is 3:2. */
export function sameRatio(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const low = (t: readonly number[]) => {
    const g = t.reduce((x, y) => gcd(x, y), 0);
    return g === 0 ? [...t] : t.map((x) => x / g);
  };
  const la = low(a);
  const lb = low(b);
  return la.every((x, i) => x === lb[i]);
}

/** A percentage in hundredths, as it is written: 1250 is "12.5". */
export const percentText = (h: number): string => String(h / 100);

export interface KitChoice {
  id: string;
  text: string;
  /** Why this option is wrong. */
  why?: string;
}

/** A word that goes with a figure: "increase" or "decrease", "debit" or "credit". */
export interface KitTag {
  label: string;
  options: KitChoice[];
  correct: string;
}

/** The answers the labs' own questions use: an amount in rupees (with a word), or one option. */
export type KitAnswer =
  | { type: 'number'; value: Paise; mistakes: { value: Paise; why: string }[]; tag?: KitTag }
  | { type: 'choice'; options: KitChoice[]; correct: string };

/** Every answer the card can mark. */
export type AnyAnswer =
  /** An amount in rupees. */
  | { type: 'number'; value: Paise; mistakes: { value: Paise; why: string }[]; tag?: KitTag }
  /** A percentage, in hundredths of a per cent. */
  | { type: 'percent'; value: number; mistakes: { value: number; why: string }[]; tag?: KitTag }
  /** A ratio, right in any terms that reduce to it. */
  | { type: 'ratio'; terms: number[]; of?: string[]; mistakes?: { terms: number[]; why: string }[] }
  /** One option. */
  | { type: 'choice'; options: KitChoice[]; correct: string }
  /** Every option that applies. */
  | { type: 'multi'; options: KitChoice[]; correct: string[] };

export interface KitAsk {
  prompt: string;
  answer: KitAnswer;
  reason: string;
}

/** A question for the card: any answer. */
export interface CardAsk {
  prompt: string;
  answer: AnyAnswer;
  reason: string;
}

export interface Verdict {
  right: boolean;
  /** What was wrong with the answer (the slip, named), when it is wrong. */
  why: string | null;
}

export interface Given {
  /** A figure already read (paise, or hundredths of a per cent). */
  figure?: number | null;
  /** What was typed, when the figure has not been read. */
  typed?: string;
  tag?: string | null;
  choice?: string | null;
  picked?: readonly string[];
}

/** The right answer in words: "₹4,500 (decrease)", "12.5% (increase)", "3:2", the option's text. */
export function answerText(answer: AnyAnswer): string {
  const tag = (t?: KitTag) => (t ? ` (${t.options.find((o) => o.id === t.correct)!.text.toLowerCase()})` : '');
  switch (answer.type) {
    case 'number':
      return `${formatINR(answer.value)}${tag(answer.tag)}`;
    case 'percent':
      return `${percentText(answer.value)}%${tag(answer.tag)}`;
    case 'ratio':
      return answer.terms.join(':');
    case 'choice':
      return answer.options.find((o) => o.id === answer.correct)!.text;
    case 'multi':
      return answer.options
        .filter((o) => answer.correct.includes(o.id))
        .map((o) => o.text)
        .join('; ');
  }
}

/** Whether what is given is an answer that can be marked (a figure that reads, a word where one is asked, a choice). */
export function readyToMark(answer: AnyAnswer, given: Given): boolean {
  switch (answer.type) {
    case 'choice':
      return given.choice !== null && given.choice !== undefined;
    case 'multi':
      return (given.picked?.length ?? 0) > 0;
    default:
      return figureProblem(answer, given.typed ?? '') === null && (given.typed ?? '').trim() !== '' && (answer.type === 'ratio' || !answer.tag || (given.tag !== null && given.tag !== undefined));
  }
}

/** Why what is typed cannot be read as the figure asked for; null when it can (or nothing is typed yet). */
export function figureProblem(answer: AnyAnswer, typed: string): string | null {
  if (typed.trim() === '') return null;
  if (answer.type === 'number') return parseRupees(typed) === null ? 'Type an amount in rupees, such as 12,500.' : null;
  if (answer.type === 'percent') return parsePercentText(typed) === null ? 'Type a percentage, such as 12.5.' : null;
  if (answer.type === 'ratio') return parseRatioText(typed) === null ? 'Type a ratio with colons, such as 3:2.' : null;
  return null;
}

/** Marks an answer: a figure (and the word with it), a ratio, an option or a set of options. */
export function judge(answer: AnyAnswer, given: Given): Verdict {
  if (answer.type === 'choice') {
    const right = given.choice === answer.correct;
    return { right, why: right ? null : (answer.options.find((o) => o.id === given.choice)?.why ?? null) };
  }
  if (answer.type === 'multi') {
    const picked = new Set(given.picked ?? []);
    const right = picked.size === answer.correct.length && answer.correct.every((c) => picked.has(c));
    if (right) return { right, why: null };
    const wrong = answer.options.find((o) => picked.has(o.id) && !answer.correct.includes(o.id));
    return { right, why: wrong?.why ?? (wrong ? null : 'Some that apply are not picked.') };
  }
  if (answer.type === 'ratio') {
    const terms = parseRatioText(given.typed ?? '');
    if (!terms || terms.length !== answer.terms.length) return { right: false, why: `Type a ratio of ${answer.terms.length} terms with colons, such as ${answer.terms.map((_, i) => i + 1).join(':')}.` };
    if (sameRatio(terms, answer.terms)) return { right: true, why: null };
    const known = answer.mistakes?.find((m) => sameRatio(m.terms, terms));
    return { right: false, why: known ? known.why : `${terms.join(':')} is not it.` };
  }
  const figure = given.figure !== undefined ? given.figure : answer.type === 'number' ? parseRupees(given.typed ?? '') : parsePercentText(given.typed ?? '');
  const figureRight = figure === answer.value;
  const tagRight = !answer.tag || given.tag === answer.tag.correct;
  if (figureRight && tagRight) return { right: true, why: null };
  if (!figureRight) {
    const known = (answer.mistakes as { value: number; why: string }[]).find((m) => m.value === figure);
    if (known) return { right: false, why: known.why };
    if (figure === null || figure === undefined) return { right: false, why: 'That is not a figure.' };
    return { right: false, why: answer.type === 'number' ? `${formatINR(figure)} is not it.` : `${percentText(figure)}% is not it.` };
  }
  const why = answer.tag!.options.find((o) => o.id === given.tag)?.why;
  return { right: false, why: `The figure is right, but not the word with it.${why ? ` ${why}` : ''}` };
}
