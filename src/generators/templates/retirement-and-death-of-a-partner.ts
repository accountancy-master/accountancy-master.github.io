import type { AccountQuestion, FormatRow, JournalQuestion, JournalSetQuestion, McqQuestion } from '@/content/types';
import { executor, partnerCapital, partnerCurrent, partnerDrawings, partnerLoan } from '@/engine/accounts';
import { accountOf, balanceOf, columnarAccount, ledgerLabel, post, type DatedEntry, type Ledger } from '@/engine/books';
import type { JournalLine } from '@/engine/journal';
import type { Rng } from '@/engine/rng';
import {
  assertionReasonFacts,
  factsTemplate,
  accountTemplate,
  columnarSides,
  formatINR,
  journalSetTemplate,
  journalTemplate,
  keepFor,
  ledgerPeriods,
  ledgerSides,
  lowestTerms,
  mcqTemplate,
  numericTemplate,
  partnerColumns,
  rupees,
  setHolds,
} from '../authoring';
import type { FormatRowParts, McqParts, NumericParts, RatioParts, SetTransaction, Template } from '../types';

const T = 'retirement-and-death-of-a-partner';

// ---------------------------------------------------------------------------------------------------------------
// Conventions used throughout (and stated in the prompts that rely on them):
//  - goodwill follows AS 26: no Goodwill A/c is raised; the partners who gain compensate the partner who leaves (and
//    a continuing partner who sacrifices) through the capital accounts; goodwill already in the books is first
//    written off among ALL the partners in the old ratio;
//  - reserves, accumulated profits and losses and the result of revaluation belong to ALL the partners in the old
//    ratio, the partner who leaves included;
//  - with nothing agreed, the continuing partners keep the old ratio between them, which is then also their gaining
//    ratio;
//  - a retiring partner's loan carries the agreed rate of interest, or 6% p.a. under section 37 of the Indian
//    Partnership Act, 1932 when nothing is agreed and interest is chosen; interest is simple, on the unpaid principal;
//  - the accounting year ends on 31 March and every date is a month end, so months are whole;
//  - every figure is in whole rupees: a combination that would leave paise is rejected (null) or avoided by choosing
//    the amounts from the values that come out clean.
// ---------------------------------------------------------------------------------------------------------------

/** Whole rupees as the amount text a learner sees. */
const inr = (n: number): string => formatINR(rupees(n));
export const sum = (a: readonly number[]): number => a.reduce((s, v) => s + v, 0);
const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
/** A fraction in its lowest terms: "3/10", or "2" when it is whole. */
export const fr = (n: number, d: number): string => {
  const g = gcd(n, d) || 1;
  return d / g === 1 ? `${n / g}` : `${n / g}/${d / g}`;
};
export const rt = (r: readonly number[]): string => r.join(':');
export const list = (names: readonly string[]): string =>
  names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

const TRIOS = [
  ['Asha', 'Bhavna', 'Chetan'],
  ['Kabir', 'Leela', 'Mohan'],
  ['Anil', 'Bina', 'Charu'],
  ['Farid', 'Gauri', 'Harish'],
  ['Meera', 'Nikhil', 'Omkar'],
  ['Ravi', 'Sunita', 'Tarun'],
  ['Divya', 'Eshan', 'Fatima'],
  ['Imran', 'Jaya', 'Karthik'],
  ['Pooja', 'Rohit', 'Sneha'],
  ['Lata', 'Manoj', 'Nandini'],
];
const QUARTETS = [
  ['Arun', 'Bela', 'Chirag', 'Deepa'],
  ['Kiran', 'Lalit', 'Mona', 'Naveen'],
  ['Padma', 'Rajat', 'Seema', 'Tanvi'],
  ['Gita', 'Hemant', 'Indu', 'Jatin'],
];
const RATIOS3 = [[5, 3, 2], [3, 2, 1], [4, 3, 2], [2, 2, 1], [3, 3, 2], [5, 4, 1], [4, 3, 1], [2, 1, 1], [6, 3, 1], [4, 2, 1], [3, 1, 1], [7, 2, 1], [5, 3, 1], [4, 3, 3]];
const RATIOS4 = [[4, 3, 2, 1], [3, 3, 2, 2], [5, 2, 2, 1], [3, 2, 2, 1], [2, 2, 1, 1], [4, 2, 1, 1], [5, 3, 1, 1], [3, 3, 1, 1]];

/** A firm on the day a partner leaves: who the partners are, their old ratio, who leaves and who stays. */
export interface Firm {
  names: string[];
  old: number[];
  /** The sum of the terms of the old ratio. */
  total: number;
  /** The partner who retires or dies, and that partner's term of the old ratio. */
  out: string;
  x: number;
  /** The continuing partners in the order they are named, and their terms of the old ratio. */
  stay: string[];
  stayOld: number[];
}

export function firm(rng: Rng, size: 3 | 4 = 3): Firm {
  const names = rng.pick(size === 3 ? TRIOS : QUARTETS);
  const old = rng.shuffle(rng.pick(size === 3 ? RATIOS3 : RATIOS4));
  const r = rng.int(0, size - 1);
  const keep = names.map((_, i) => i).filter((i) => i !== r);
  return { names, old, total: sum(old), out: names[r], x: old[r], stay: keep.map((i) => names[i]), stayOld: keep.map((i) => old[i]) };
}

const INTROS: ((names: string, ratio: string) => string)[] = [
  (n, r) => `${n} are partners sharing profits and losses in the ratio ${r}.`,
  (n, r) => `${n} are partners in a firm and share its profits in the ratio ${r}.`,
  (n, r) => `${n} share the profits and losses of their firm in the ratio ${r}.`,
];
/** The opening sentence. Every prompt that names the whole firm starts with it, and `readFirm` reads it back. */
export const intro = (rng: Rng, f: Firm): string => rng.pick(INTROS)(list(f.names), rt(f.old));

export const FLUCTUATING = 'Capitals are fluctuating.';
const NO_GOODWILL_ACCOUNT = 'it is to be adjusted through the capital accounts, without opening Goodwill A/c.';

/** `unit` times a whole number, between `min` and `max`; null when no multiple lies there. */
export function mult(rng: Rng, unit: number, min: number, max: number): number | null {
  const lo = Math.ceil(min / unit);
  const hi = Math.floor(max / unit);
  return hi >= lo ? unit * rng.int(lo, hi) : null;
}

/** A value from `min` to `max` in steps of `step` for which `ok` holds, or null if none does. */
export function clean(rng: Rng, min: number, max: number, step: number, ok: (v: number) => boolean): number | null {
  const all: number[] = [];
  for (let v = min; v <= max; v += step) if (ok(v)) all.push(v);
  return all.length > 0 ? rng.pick(all) : null;
}

/**
 * A numeric question's answer and errors, in whole units (rupees unless `scale` is 1). A wrong figure that is not a
 * whole number, or repeats the answer or another error, is dropped; null when fewer than two remain.
 */
export function numeric(answer: number, errs: [number, string][], scale = 100): Pick<NumericParts, 'answer' | 'commonErrors'> | null {
  if (!Number.isInteger(answer) || answer <= 0) return null;
  const seen = new Set([answer]);
  const commonErrors: { value: number; why: string }[] = [];
  for (const [v, why] of errs) {
    if (Number.isInteger(v) && v > 0 && !seen.has(v)) {
      seen.add(v);
      commonErrors.push({ value: v * scale, why });
    }
  }
  return commonErrors.length >= 2 ? { answer: answer * scale, commonErrors } : null;
}

/** A ratio answer and its wrong ratios, each reduced to lowest terms; null when fewer than two distinct wrong ones remain. */
export function ratioParts(answer: number[], errs: [number[], string][]): Pick<RatioParts, 'answer' | 'commonErrors'> | null {
  if (answer.some((n) => !Number.isInteger(n) || n <= 0)) return null;
  const a = lowestTerms(answer);
  const seen = new Set([rt(a)]);
  const commonErrors: { value: number[]; why: string }[] = [];
  for (const [v, why] of errs) {
    if (v.length !== a.length || v.some((n) => !Number.isInteger(n) || n <= 0)) continue;
    const low = lowestTerms(v);
    if (!seen.has(rt(low))) {
      seen.add(rt(low));
      commonErrors.push({ value: low, why });
    }
  }
  return commonErrors.length >= 2 ? { answer: a, commonErrors } : null;
}

/** A multiple-choice question; null when fewer than three distinct wrong options remain. */
export function choice(prompt: string, correct: string, wrong: [string, string][], explanation: string, hints?: string[]): McqParts | null {
  const seen = new Set([correct]);
  const distractors: { text: string; why: string }[] = [];
  for (const [text, why] of wrong) {
    if (!seen.has(text)) {
      seen.add(text);
      distractors.push({ text, why });
    }
  }
  if (distractors.length < 3) return null;
  return { prompt, correct, distractors, explanation, ...(hints ? { hints } : {}) };
}

const dr = (accountId: string, n: number): JournalLine => ({ accountId, side: 'Dr', amount: rupees(n) });
const cr = (accountId: string, n: number): JournalLine => ({ accountId, side: 'Cr', amount: rupees(n) });

// ---- Reading a prompt back (the independent half of every `verify`) ----

export const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
export const amountsIn = (s: string): number[] => (s.match(/₹\d[\d,]*/g) ?? []).map((x) => Number(x.slice(1).replace(/,/g, '')));
export const ratiosIn = (s: string): number[][] => (s.match(/\d+(?::\d+)+/g) ?? []).map((x) => x.split(':').map(Number));
const intIn = (s: string, re: RegExp): number => Number(re.exec(s)?.[1]);
const optionText = (q: McqQuestion): string => q.options.find((o) => o.id === q.correct)?.text ?? '';
/** True when the terms of a ratio stand to each other as the shares do. */
const sameRatio = (r: readonly number[], shares: readonly number[]): boolean =>
  r.length === shares.length && r.every((v, i) => near(v / sum(r), shares[i] / sum(shares)));
/** Rupees debited or credited to an account by the entry of a question. */
const posted = (q: JournalQuestion, accountId: string, side: 'Dr' | 'Cr'): number =>
  sum(q.expected.filter((l) => l.accountId === accountId && l.side === side).map((l) => l.amount)) / 100;

export interface Read {
  names: string[];
  /** Each partner's old share as a fraction of 1. */
  share: number[];
  out: string;
  /** The old share of the partner who leaves. */
  x: number;
  stay: string[];
  stayShare: number[];
}

/** The firm of a prompt that starts with `intro` and says who "retires" or "dies"; null when it cannot be read. */
export function readFirm(prompt: string): Read | null {
  const m = /^([A-Z][a-z]+), (?:([A-Z][a-z]+), )?([A-Z][a-z]+) and ([A-Z][a-z]+) /.exec(prompt);
  const gone = /([A-Z][a-z]+) (?:retires|retired|dies|died)\b/.exec(prompt);
  if (!m || !gone) return null;
  const names = [m[1], m[2], m[3], m[4]].filter((n): n is string => n !== undefined);
  const old = ratiosIn(prompt).find((r) => r.length === names.length);
  const r = names.indexOf(gone[1]);
  if (!old || r < 0) return null;
  const share = old.map((v) => v / sum(old));
  const keep = names.map((_, i) => i).filter((i) => i !== r);
  return { names, share, out: names[r], x: share[r], stay: keep.map((i) => names[i]), stayShare: keep.map((i) => share[i]) };
}

/** How the continuing partners take the outgoing share, as the prompt words it: "equally", "in the ratio 3:1", "takes 3/5 of". */
function readSplit(prompt: string): number[] | null {
  if (/\bequally\b/.test(prompt)) return [1, 1];
  const f = /takes (\d+)\/(\d+) of/.exec(prompt);
  if (f) return [Number(f[1]), Number(f[2]) - Number(f[1])];
  const r = /share in the ratio (\d+):(\d+)/.exec(prompt);
  return r ? [Number(r[1]), Number(r[2])] : null;
}

export const H = {
  newRatio: [
    'Work out the part of the outgoing share that each continuing partner takes over.',
    'New share = old share + the part taken over. Put both on one denominator before adding, then write the new shares as a ratio.',
  ],
  ratio: ['New share = old share + the part of the outgoing share taken over.', 'Gaining ratio = new share - old share, worked for each continuing partner on a common denominator.'],
  goodwill: [
    'Who gains the share of the partner who leaves, and in what ratio?',
    "The partners who gain are debited in the gaining ratio; the partner who leaves is credited with that partner's share of the firm's goodwill. No Goodwill A/c is opened.",
  ],
  all: ['Did this profit, loss or reserve arise while the outgoing partner was still a partner?', 'Reserves, accumulated profits and losses and the result of revaluation are shared by all the partners in the old ratio.'],
  due: ['List what is added to the capital and what is deducted from it.', 'Amount due = capital + shares of goodwill, reserves, revaluation profit and profit to date + interest on capital - drawings and interest on drawings - share of losses.'],
  loan: ['Count the whole months for which the amount was outstanding.', 'Interest is charged on the principal still unpaid; each equal instalment of principal is paid with the interest then due.'],
  capitals: ['First find the total capital of the new firm, then each partner\'s part of it in the new ratio.', 'Required capital more than the adjusted capital: cash is brought in. Less: the surplus is withdrawn.'],
  death: ['Count the months from the last balance sheet to the date of death.', 'Time basis: profit x months/12 x share. Sales basis: sales to the date of death x rate of profit on sales x share.'],
  executor: ["Everything due is first gathered in the deceased partner's Capital A/c.", "Its balance is transferred to the Executor's A/c, which is paid at once or in instalments with interest."],
};

const SPLITS = [[1, 1], [2, 1], [1, 2], [3, 1], [1, 3], [3, 2], [2, 3], [4, 1], [1, 4], [5, 3], [3, 5]];
const NEW2 = [[1, 1], [2, 1], [1, 2], [3, 1], [1, 3], [3, 2], [2, 3], [4, 1], [1, 4], [5, 3], [3, 5], [4, 3], [3, 4], [5, 2], [2, 5], [5, 4], [4, 5], [7, 3], [3, 7], [5, 1], [1, 5]];

/** The words for the way an outgoing share is divided: "equally" or "in the ratio 3:1". */
const splitText = (p: number, q: number): string => (p === q ? 'equally' : `in the ratio ${p}:${q}`);

/**
 * What each of two continuing partners gains (a negative figure is a sacrifice) when a new ratio is agreed, as
 * numerators over `N x total`, where N is the sum of the terms of the new ratio.
 */
const changes = (f: Firm, n: readonly number[]): number[] => n.map((v, i) => v * f.total - f.stayOld[i] * sum(n));

// ===============================================================================================================
// NEW RATIO AND GAINING RATIO
// ===============================================================================================================

const ratioNoInfo = numericTemplate({
  id: 'ret-ratio-no-info', topicId: T, conceptId: 'ret-ratio', difficulty: 'easy', unit: 'ratio',
  generate: (rng) => {
    const f = firm(rng, rng.int(0, 3) === 0 ? 4 : 3);
    if (new Set(f.stayOld).size === 1) return null; // equal shares leave no wrong ratio worth offering
    const askGain = rng.int(0, 2) === 0;
    const n = f.stay.length;
    const who = list(f.stay);
    const equal = f.stayOld.map(() => 1);
    const split = f.stayOld.map((v) => v * n + f.x);
    const first = f.stayOld.map((v, i) => (i === 0 ? v + f.x : v));
    const reversed = [...lowestTerms(f.stayOld)].reverse();
    const wrongOrder = 'Wrote the terms against the wrong names: a ratio follows the order in which the partners are named.';
    const r = ratioParts(
      f.stayOld,
      askGain
        ? [
            [equal, `Took ${who} to gain equal parts of ${f.out}'s share.`],
            [reversed, wrongOrder],
            [split, `Divided ${f.out}'s share equally and gave the new ratio that would follow from it.`],
          ]
        : [
            [equal, 'Took the continuing partners to share equally because no new ratio was agreed.'],
            [split, `Divided ${f.out}'s share equally between the continuing partners.`],
            [first, `Gave the whole of ${f.out}'s share to ${f.stay[0]}.`],
            [reversed, wrongOrder],
          ],
    );
    if (!r) return null;
    const left = rng.pick([`${f.out} retires.`, `${f.out} dies.`]);
    const silent = rng.pick([`No new profit-sharing ratio is agreed between ${who}.`, `Nothing is said about how ${who} will share profits from now on.`]);
    const ask = askGain ? rng.pick([`In what ratio do ${who} gain?`, `What is the gaining ratio of ${who}?`]) : `What is the new profit-sharing ratio of ${who}?`;
    return {
      prompt: `${intro(rng, f)} ${left} ${silent} ${ask}`,
      ...r,
      explanation: [
        `With nothing agreed, ${who} take over ${f.out}'s share in their old ratio, so the ratio between them does not change.`,
        `Old ratio of ${who} = ${rt(f.stayOld)}${rt(f.stayOld) === rt(r.answer) ? '' : ` = ${rt(r.answer)}`}.`,
        `New ratio = gaining ratio = ${rt(r.answer)}.`,
      ],
      hints: ['What happens to the ratio between the continuing partners when nothing is agreed?', 'They keep their old ratio between themselves, and that is also the ratio in which they gain.'],
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    // The outgoing share is spread in proportion to the old shares; the new shares must stand as the answer does.
    return g !== null && sameRatio(q.answer, g.stayShare.map((s) => s + (g.x * s) / sum(g.stayShare)));
  },
});

const ratioOneTakes = numericTemplate({
  id: 'ret-ratio-one-takes', topicId: T, conceptId: 'ret-ratio', difficulty: 'easy', unit: 'ratio',
  generate: (rng) => {
    const f = firm(rng, rng.int(0, 3) === 0 ? 4 : 3);
    const n = f.stay.length;
    const ti = rng.int(0, n - 1);
    const oi = (ti + 1) % n;
    const taker = f.stay[ti];
    const who = list(f.stay);
    const give = (to: number) => f.stayOld.map((v, i) => (i === to ? v + f.x : v));
    const r = ratioParts(give(ti), [
      [f.stayOld, `Left the ratio between ${who} as it was, as if nothing had been agreed.`],
      [give(oi), `Added ${f.out}'s share to ${f.stay[oi]} instead of ${taker}.`],
      [f.stayOld.map((v) => v * n + f.x), `Divided ${f.out}'s share equally, although ${taker} takes all of it.`],
    ]);
    if (!r) return null;
    const left = rng.pick(['retires', 'dies']);
    return {
      prompt: `${intro(rng, f)} ${f.out} ${left} and ${f.out}'s share is taken over wholly by ${taker}. What is the new profit-sharing ratio of ${who}?`,
      ...r,
      explanation: [
        `${taker}'s new share = ${fr(f.stayOld[ti], f.total)} + ${fr(f.x, f.total)} = ${fr(f.stayOld[ti] + f.x, f.total)}.`,
        `${n === 2 ? `${f.stay[oi]}'s share stays` : 'The other shares stay'} as before.`,
        `New ratio of ${who} = ${rt(give(ti))}${rt(give(ti)) === rt(r.answer) ? '' : ` = ${rt(r.answer)}`}.`,
      ],
      hints: H.ratio,
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    const taker = /wholly by ([A-Z][a-z]+)/.exec(q.prompt)?.[1];
    return g !== null && taker !== undefined && sameRatio(q.answer, g.stayShare.map((s, i) => (g.stay[i] === taker ? s + g.x : s)));
  },
});

const gainRatioStated = numericTemplate({
  id: 'ret-gain-ratio-stated', topicId: T, conceptId: 'ret-ratio', difficulty: 'easy', unit: 'ratio',
  generate: (rng) => {
    const f = firm(rng);
    const [p, q] = rng.pick(SPLITS);
    const who = list(f.stay);
    const [y, z] = f.stayOld;
    if (y * q === z * p) return null; // the stated ratio is the old one: nothing would tell the wrong answers apart
    const fresh = [y * (p + q) + f.x * p, z * (p + q) + f.x * q];
    const r = ratioParts([p, q], [
      [f.stayOld, 'Gave the old ratio between the continuing partners, which is the gaining ratio only when nothing is agreed.'],
      [fresh, 'Gave the new profit-sharing ratio instead of the ratio in which the outgoing share is taken over.'],
      [[q, p], 'Wrote the terms against the wrong names: a ratio follows the order in which the partners are named.'],
    ]);
    if (!r) return null;
    const how = p !== q && rng.int(0, 1) === 0
      ? `${f.stay[0]} takes ${fr(p, p + q)} of ${f.out}'s share and ${f.stay[1]} takes the rest.`
      : `${who} take over ${f.out}'s share ${splitText(p, q)}.`;
    return {
      prompt: `${intro(rng, f)} ${f.out} ${rng.pick(['retires', 'dies'])}. ${how} What is the gaining ratio of ${who}?`,
      ...r,
      explanation: [
        'The gaining ratio is the ratio in which the continuing partners take over the share of the partner who leaves.',
        `${f.stay[0]} gains ${fr(p, p + q)} of ${f.out}'s share and ${f.stay[1]} gains ${fr(q, p + q)} of it.`,
        `Gaining ratio = ${p}:${q}.`,
      ],
      hints: ['Gaining ratio = the ratio of what each continuing partner gains.', 'When the outgoing share is taken over in a stated ratio, that ratio is the gaining ratio.'],
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    const s = readSplit(q.prompt);
    if (!g || !s) return false;
    // New share less old share of each continuing partner.
    const fresh = g.stayShare.map((v, i) => v + (g.x * s[i]) / sum(s));
    return sameRatio(q.answer, fresh.map((v, i) => v - g.stayShare[i]));
  },
});

const ratioShareInRatio = numericTemplate({
  id: 'ret-ratio-share-in-ratio', topicId: T, conceptId: 'ret-ratio', difficulty: 'medium', unit: 'ratio',
  // 2: the working keeps every share on one denominator, and the hints lead to the new ratio, not the gaining ratio.
  version: 2,
  generate: (rng) => {
    const f = firm(rng);
    const [p, q] = rng.pick(SPLITS);
    const who = list(f.stay);
    const [y, z] = f.stayOld;
    if (y * q === z * p) return null;
    const d = f.total * (p + q);
    const fresh = [y * (p + q) + f.x * p, z * (p + q) + f.x * q];
    const r = ratioParts(fresh, [
      [f.stayOld, `Kept the old ratio between ${who}, although ${f.out}'s share is taken over in a different ratio.`],
      [[p, q], 'Gave the gaining ratio, the ratio in which the share is taken over, instead of the new ratio.'],
      [[y + p, z + q], 'Added the terms of the two ratios without first putting the shares on a common denominator.'],
      [[2 * y + f.x, 2 * z + f.x], `Divided ${f.out}'s share equally instead of in the stated ratio.`],
    ]);
    if (!r) return null;
    return {
      prompt: `${intro(rng, f)} ${f.out} ${rng.pick(['retires', 'dies'])}. ${who} take over ${f.out}'s share ${splitText(p, q)}. What is the new profit-sharing ratio of ${who}?`,
      ...r,
      explanation: [
        `${f.out}'s share = ${fr(f.x, f.total)}. ${f.stay[0]} takes ${fr(p, p + q)} of it = ${f.x * p}/${d}; ${f.stay[1]} takes ${fr(q, p + q)} of it = ${f.x * q}/${d}.`,
        `Put the old shares on the same denominator, ${d}: ${f.stay[0]} ${fr(y, f.total)} = ${y * (p + q)}/${d}; ${f.stay[1]} ${fr(z, f.total)} = ${z * (p + q)}/${d}.`,
        `${f.stay[0]}'s new share = ${y * (p + q)}/${d} + ${f.x * p}/${d} = ${fresh[0]}/${d}.`,
        `${f.stay[1]}'s new share = ${z * (p + q)}/${d} + ${f.x * q}/${d} = ${fresh[1]}/${d}.`,
        `${fresh[0]}:${fresh[1]}` === rt(r.answer) ? `New ratio = ${rt(r.answer)}.` : `New ratio = ${fresh[0]}:${fresh[1]} = ${rt(r.answer)}.`,
      ],
      hints: H.newRatio,
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    const s = readSplit(q.prompt);
    return g !== null && s !== null && sameRatio(q.answer, g.stayShare.map((v, i) => v + (g.x * s[i]) / sum(s)));
  },
});

const gainRatioAgreed = numericTemplate({
  id: 'ret-gain-ratio-agreed', topicId: T, conceptId: 'ret-ratio', difficulty: 'medium', unit: 'ratio',
  generate: (rng) => {
    const f = firm(rng);
    const who = list(f.stay);
    const [y, z] = f.stayOld;
    // Both continuing partners must gain, and not simply in their old ratio.
    const options = NEW2.filter((n) => changes(f, n).every((g) => g > 0) && n[0] * z !== n[1] * y);
    if (options.length === 0) return null;
    const n = rng.pick(options);
    const N = sum(n);
    const g = changes(f, n);
    const r = ratioParts(g, [
      [n, 'Gave the new ratio itself; the gaining ratio is the new share less the old share of each partner.'],
      [f.stayOld, 'Took the old ratio between the continuing partners, which is the gaining ratio only when no new ratio is agreed.'],
      [[n[0] - y, n[1] - z], 'Subtracted the terms of the old ratio from the terms of the new one without a common denominator.'],
      [[g[1], g[0]], 'Wrote the terms against the wrong names: a ratio follows the order in which the partners are named.'],
    ]);
    if (!r) return null;
    const d = N * f.total;
    return {
      prompt: `${intro(rng, f)} ${f.out} ${rng.pick(['retires', 'dies'])}. ${who} agree to share future profits ${n[0] === n[1] ? 'equally' : `in the ratio ${rt(n)}`}. What is the gaining ratio of ${who}?`,
      ...r,
      explanation: [
        'Gain = new share - old share.',
        `${f.stay[0]}: ${fr(n[0], N)} - ${fr(y, f.total)} = ${fr(g[0], d)}.`,
        `${f.stay[1]}: ${fr(n[1], N)} - ${fr(z, f.total)} = ${fr(g[1], d)}.`,
        `Gaining ratio = ${rt(r.answer)}.`,
      ],
      hints: H.ratio,
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    const n = /\bequally\b/.test(q.prompt) ? [1, 1] : ratiosIn(q.prompt).filter((r) => r.length === 2)[0];
    return g !== null && n !== undefined && sameRatio(q.answer, n.map((v, i) => v / sum(n) - g.stayShare[i]));
  },
});

/** A new ratio under which one continuing partner gains and the other gives up a part of the old share; null when the pool has none. */
function sacrificeCase(rng: Rng, f: Firm): { n: number[]; g: number[]; gi: number; si: number } | null {
  const options = NEW2.filter((n) => {
    const g = changes(f, n);
    return g[0] * g[1] < 0;
  });
  if (options.length === 0) return null;
  const n = rng.pick(options);
  const g = changes(f, n);
  const gi = g[0] > 0 ? 0 : 1;
  return { n, g, gi, si: 1 - gi };
}

const gainWithSacrifice = mcqTemplate({
  id: 'ret-gain-with-sacrifice', topicId: T, conceptId: 'ret-ratio', difficulty: 'complex',
  generate: (rng) => {
    const f = firm(rng);
    const c = sacrificeCase(rng, f);
    if (!c) return null;
    const { n, g, gi, si } = c;
    const d = sum(n) * f.total;
    const G = f.stay[gi];
    const S = f.stay[si];
    const gain = fr(g[gi], d);
    const lost = fr(-g[si], d);
    const who = list(f.stay);
    return choice(
      `${intro(rng, f)} ${f.out} retires and ${who} agree to share future profits in the ratio ${rt(n)}. Which statement describes the change in their shares?`,
      `${G} gains ${gain} and ${S} sacrifices ${lost}`,
      [
        [`${G} sacrifices ${gain} and ${S} gains ${lost}`, 'Subtracted the new share from the old share, which turns a gain into a sacrifice and a sacrifice into a gain.'],
        [`${who} both gain, in the ratio ${rt(n)}`, 'Took the new ratio for the gaining ratio without comparing each new share with the old one.'],
        [`${who} both gain, in the ratio ${rt(lowestTerms(f.stayOld))}`, 'Applied the rule for the case in which no new ratio is agreed.'],
        [`${G} gains ${fr(f.x, f.total)} and the share of ${S} does not change`, `Gave ${G} only the share of ${f.out} and did not compare the new share of ${S} with the old one.`],
      ],
      `Change = new share - old share. ${f.stay[0]}: ${fr(n[0], sum(n))} - ${fr(f.stayOld[0], f.total)} = ${g[0] > 0 ? '+' : '-'}${fr(Math.abs(g[0]), d)}. ${f.stay[1]}: ${fr(n[1], sum(n))} - ${fr(f.stayOld[1], f.total)} = ${g[1] > 0 ? '+' : '-'}${fr(Math.abs(g[1]), d)}. ${G} gains ${gain}: the whole share of ${f.out} and the ${lost} that ${S} gives up. For goodwill, ${G} compensates both ${f.out} and ${S}.`,
      ['Work out new share - old share for each continuing partner, on a common denominator.', 'A negative result is a sacrifice: that partner is compensated for goodwill like the partner who leaves.'],
    );
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    const n = ratiosIn(q.prompt).filter((r) => r.length === 2)[0];
    const m = /^([A-Z][a-z]+) gains (\d+)\/(\d+) and ([A-Z][a-z]+) sacrifices (\d+)\/(\d+)$/.exec(optionText(q));
    if (!g || !n || !m) return false;
    const change = (name: string) => n[g.stay.indexOf(name)] / sum(n) - g.stayShare[g.stay.indexOf(name)];
    return near(change(m[1]), Number(m[2]) / Number(m[3])) && near(change(m[4]), -Number(m[5]) / Number(m[6]));
  },
});

const ratioTwoOfThree = numericTemplate({
  id: 'ret-ratio-two-of-three', topicId: T, conceptId: 'ret-ratio', difficulty: 'complex', unit: 'ratio',
  generate: (rng) => {
    const f = firm(rng, 4);
    const [p, q] = rng.pick(SPLITS);
    const [a, b] = rng.shuffle([0, 1, 2]).slice(0, 2).sort((i, j) => i - j);
    const part = [0, 1, 2].map((i) => (i === a ? p : i === b ? q : 0));
    const who = list(f.stay);
    const pair = f.stayOld[a] + f.stayOld[b];
    const fresh = f.stayOld.map((v, i) => v * (p + q) + f.x * part[i]);
    const r = ratioParts(fresh, [
      [f.stayOld, `Left the ratio of ${who} as it was, as if nothing had been agreed.`],
      [f.stayOld.map((v) => v * 3 + f.x), `Divided ${f.out}'s share equally among all three continuing partners.`],
      [f.stayOld.map((v, i) => v + part[i]), 'Added the terms of the two ratios without first putting the shares on a common denominator.'],
      [f.stayOld.map((v, i) => v * pair + (part[i] > 0 ? f.x * v : 0)), `Divided ${f.out}'s share between ${f.stay[a]} and ${f.stay[b]} in their old ratio instead of the stated one.`],
    ]);
    if (!r) return null;
    const d = f.total * (p + q);
    return {
      prompt: `${intro(rng, f)} ${f.out} ${rng.pick(['retires', 'dies'])}. ${f.out}'s share is taken over by ${f.stay[a]} and ${f.stay[b]} only, ${splitText(p, q)}. What is the new profit-sharing ratio of ${who}?`,
      ...r,
      explanation: [
        `${f.out}'s share = ${fr(f.x, f.total)}: ${f.stay[a]} takes ${fr(f.x * p, d)} and ${f.stay[b]} takes ${fr(f.x * q, d)}.`,
        ...f.stay.map((name, i) =>
          part[i] > 0 ? `${name}'s new share = ${fr(f.stayOld[i], f.total)} + ${fr(f.x * part[i], d)} = ${fr(fresh[i], d)}.` : `${name}'s share stays ${fr(f.stayOld[i], f.total)} = ${fresh[i]}/${d}.`,
        ),
        `New ratio = ${rt(fresh)}${rt(fresh) === rt(r.answer) ? '' : ` = ${rt(r.answer)}`}.`,
      ],
      hints: H.ratio,
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    const takers = /taken over by ([A-Z][a-z]+) and ([A-Z][a-z]+) only/.exec(q.prompt);
    const s = /\bequally\b/.test(q.prompt) ? [1, 1] : ratiosIn(q.prompt).filter((r) => r.length === 2)[0];
    if (!g || !takers || !s) return false;
    return sameRatio(q.answer, g.stayShare.map((v, i) => v + (g.stay[i] === takers[1] ? (g.x * s[0]) / sum(s) : g.stay[i] === takers[2] ? (g.x * s[1]) / sum(s) : 0)));
  },
});

// ===============================================================================================================
// GOODWILL
// ===============================================================================================================

const gwShare = numericTemplate({
  id: 'ret-gw-share', topicId: T, conceptId: 'ret-goodwill', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const G = mult(rng, f.total * 3000, 60000, 600000);
    if (G === null) return null;
    const share = (G * f.x) / f.total;
    const n = numeric(share, [
      [G / 3, 'Divided the goodwill equally among the three partners instead of in the old profit-sharing ratio.'],
      [G, `Gave the goodwill of the whole firm, not ${f.out}'s share of it.`],
      [(G * f.x) / (f.total - f.x), `Divided ${f.out}'s term by the terms of the continuing partners only; the share is taken on all the terms of the old ratio.`],
      [G - share, `Gave the share of the continuing partners, which is what is left after ${f.out}'s share.`],
    ]);
    const prompt = rng.int(0, 2) === 0
      ? `${intro(rng, f)} ${f.out} dies. On the date of death the goodwill of the firm is valued at ${inr(G)}. How much is due to ${f.out}'s estate as ${f.out}'s share of goodwill?`
      : `${intro(rng, f)} ${f.out} retires. On that date the goodwill of the firm is valued at ${inr(G)}. For what amount of goodwill must the continuing partners compensate ${f.out}?`;
    return n && {
      prompt,
      ...n,
      explanation: [`${f.out}'s share of goodwill = goodwill of the firm x ${f.out}'s old share.`, `${inr(G)} x ${fr(f.x, f.total)} = ${inr(share)}.`],
      hints: ['The partner who leaves helped to build the goodwill, so that partner is paid for a share of it.', 'Share of goodwill = goodwill of the firm x old share of the partner who leaves.'],
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    return g !== null && near(q.answer / 100, amountsIn(q.prompt)[0] * g.x);
  },
});

const gwEntryOneTakes = journalTemplate({
  id: 'ret-gw-entry-one-takes', topicId: T, conceptId: 'ret-goodwill', difficulty: 'easy', computed: true,
  generate: (rng) => {
    const f = firm(rng);
    const ti = rng.int(0, 1);
    const taker = f.stay[ti];
    const G = mult(rng, f.total * 1000, 60000, 600000);
    if (G === null) return null;
    const s = (G * f.x) / f.total;
    return {
      prompt: `${intro(rng, f)} ${FLUCTUATING} ${f.out} retires and ${taker} takes over the whole of ${f.out}'s share. The goodwill of the firm is valued at ${inr(G)}; ${NO_GOODWILL_ACCOUNT} Pass the journal entry for goodwill.`,
      lines: [dr(partnerCapital(taker), s), cr(partnerCapital(f.out), s)],
      explanation: [
        `${f.out}'s share of goodwill = ${inr(G)} x ${fr(f.x, f.total)} = ${inr(s)}.`,
        `${taker} alone gains ${f.out}'s share, so ${taker}'s Capital A/c is debited with the whole of it.`,
        `${f.out} is compensated: ${f.out}'s Capital A/c is credited with ${inr(s)}.`,
        'No Goodwill A/c is opened, because goodwill that has not been purchased is not recorded (AS 26).',
      ],
      hints: H.goodwill,
      distractorAccounts: ['goodwill', partnerCapital(f.stay[1 - ti]), 'premiumForGoodwill', 'revaluation'],
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    const taker = /and ([A-Z][a-z]+) takes over the whole/.exec(q.prompt)?.[1];
    if (!g || !taker) return false;
    const s = amountsIn(q.prompt)[0] * g.x;
    return q.expected.length === 2 && near(posted(q, partnerCapital(taker), 'Dr'), s) && near(posted(q, partnerCapital(g.out), 'Cr'), s);
  },
});

const gwWrittenOff = journalTemplate({
  id: 'ret-gw-written-off', topicId: T, conceptId: 'ret-goodwill', difficulty: 'easy',
  generate: (rng) => {
    const f = firm(rng);
    const E = mult(rng, f.total * 1000, 30000, 300000);
    if (E === null) return null;
    const parts = f.old.map((v) => (E * v) / f.total);
    const left = rng.pick([`${f.out} retires.`, `${f.out} dies.`]);
    return {
      prompt: `${intro(rng, f)} ${FLUCTUATING} ${left} The balance sheet on that date shows Goodwill at ${inr(E)}. Pass the journal entry to write off this goodwill.`,
      lines: [...f.names.map((name, i) => dr(partnerCapital(name), parts[i])), cr('goodwill', E)],
      explanation: [
        'Goodwill already in the books is written off before the new value of goodwill is dealt with.',
        `It is written off among all the partners, ${f.out} included, in the old ratio ${rt(f.old)}: ${f.names.map((name, i) => `${name} ${inr(parts[i])}`).join(', ')}.`,
        'Goodwill A/c is credited, which closes it.',
      ],
      hints: ['Whose capital accounts carry goodwill that is already in the books?', 'Existing goodwill is written off among all the partners in the old ratio: every Capital A/c is debited and Goodwill A/c is credited.'],
      distractorAccounts: ['revaluation', 'premiumForGoodwill', 'profitAndLoss'],
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    const E = amountsIn(q.prompt)[0];
    return g !== null && near(posted(q, 'goodwill', 'Cr'), E) && g.names.every((name, i) => near(posted(q, partnerCapital(name), 'Dr'), E * g.share[i]));
  },
});

const gwEntryGaining = journalTemplate({
  id: 'ret-gw-entry-gaining', topicId: T, conceptId: 'ret-goodwill', difficulty: 'medium', computed: true,
  generate: (rng) => {
    const f = firm(rng);
    const who = list(f.stay);
    const silent = rng.int(0, 1) === 0;
    const [p, q] = rng.pick(SPLITS);
    const w = silent ? lowestTerms(f.stayOld) : [p, q];
    const G = mult(rng, f.total * sum(w) * 1000, 60000, 720000);
    if (G === null) return null;
    const s = (G * f.x) / f.total;
    const parts = w.map((v) => (s * v) / sum(w));
    const how = silent ? `${f.out} retires; no new profit-sharing ratio is agreed between ${who}.` : `${f.out} retires and ${who} take over ${f.out}'s share ${splitText(p, q)}.`;
    return {
      prompt: `${intro(rng, f)} ${FLUCTUATING} ${how} The goodwill of the firm is valued at ${inr(G)}; ${NO_GOODWILL_ACCOUNT} Pass the journal entry for goodwill.`,
      lines: [...f.stay.map((name, i) => dr(partnerCapital(name), parts[i])), cr(partnerCapital(f.out), s)],
      explanation: [
        `${f.out}'s share of goodwill = ${inr(G)} x ${fr(f.x, f.total)} = ${inr(s)}.`,
        silent ? `With nothing agreed, ${who} gain in their old ratio, ${rt(w)}.` : `${who} gain in the ratio in which they take over the share, ${rt(w)}.`,
        `${f.stay[0]}'s Capital A/c is debited with ${inr(s)} x ${fr(w[0], sum(w))} = ${inr(parts[0])} and ${f.stay[1]}'s with ${inr(s)} x ${fr(w[1], sum(w))} = ${inr(parts[1])}.`,
        `${f.out}'s Capital A/c is credited with ${inr(s)}.`,
      ],
      hints: H.goodwill,
      distractorAccounts: ['goodwill', 'premiumForGoodwill', 'revaluation'],
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    if (!g) return false;
    const w = readSplit(q.prompt) ?? g.stayShare;
    const s = amountsIn(q.prompt)[0] * g.x;
    return near(posted(q, partnerCapital(g.out), 'Cr'), s) && g.stay.every((name, i) => near(posted(q, partnerCapital(name), 'Dr'), (s * w[i]) / sum(w)));
  },
});

const gwEntryNewRatio = journalTemplate({
  id: 'ret-gw-entry-new-ratio', topicId: T, conceptId: 'ret-goodwill', difficulty: 'medium', computed: true,
  generate: (rng) => {
    const f = firm(rng);
    const who = list(f.stay);
    const options = NEW2.filter((n) => changes(f, n).every((g) => g > 0) && n[0] * f.stayOld[1] !== n[1] * f.stayOld[0]);
    if (options.length === 0) return null;
    const n = rng.pick(options);
    const N = sum(n);
    const g = changes(f, n);
    const d = N * f.total;
    const G = mult(rng, d * 1000, 60000, 720000);
    if (G === null) return null;
    const s = (G * f.x) / f.total;
    const parts = g.map((v) => (G * v) / d);
    return {
      prompt: `${intro(rng, f)} ${FLUCTUATING} ${f.out} ${rng.pick(['retires', 'dies'])} and ${who} agree to share future profits ${n[0] === n[1] ? 'equally' : `in the ratio ${rt(n)}`}. The goodwill of the firm is valued at ${inr(G)}; ${NO_GOODWILL_ACCOUNT} Pass the journal entry for goodwill.`,
      lines: [...f.stay.map((name, i) => dr(partnerCapital(name), parts[i])), cr(partnerCapital(f.out), s)],
      explanation: [
        `Gain = new share - old share. ${f.stay[0]}: ${fr(n[0], N)} - ${fr(f.stayOld[0], f.total)} = ${fr(g[0], d)}; ${f.stay[1]}: ${fr(n[1], N)} - ${fr(f.stayOld[1], f.total)} = ${fr(g[1], d)}.`,
        `Each partner who gains is debited with goodwill x gain: ${f.stay[0]} ${inr(G)} x ${fr(g[0], d)} = ${inr(parts[0])}; ${f.stay[1]} ${inr(G)} x ${fr(g[1], d)} = ${inr(parts[1])}.`,
        `${f.out}'s Capital A/c is credited with ${f.out}'s share of goodwill, ${inr(G)} x ${fr(f.x, f.total)} = ${inr(s)}.`,
      ],
      hints: H.goodwill,
      distractorAccounts: ['goodwill', 'premiumForGoodwill', 'revaluation'],
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    const n = /\bequally\b/.test(q.prompt) ? [1, 1] : ratiosIn(q.prompt).filter((r) => r.length === 2)[0];
    if (!g || !n) return false;
    const G = amountsIn(q.prompt)[0];
    return near(posted(q, partnerCapital(g.out), 'Cr'), G * g.x) && g.stay.every((name, i) => near(posted(q, partnerCapital(name), 'Dr'), G * (n[i] / sum(n) - g.stayShare[i])));
  },
});

const gwHidden = numericTemplate({
  id: 'ret-gw-hidden', topicId: T, conceptId: 'ret-goodwill', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const who = list(f.stay);
    const w = lowestTerms(f.stayOld);
    const hidden = mult(rng, sum(w) * 2000, 20000, 120000);
    if (hidden === null) return null;
    const due = rng.step(150000, 600000, 10000);
    const paid = due + hidden;
    const i = rng.int(0, 1);
    const ans = (hidden * w[i]) / sum(w);
    const n = numeric(ans, [
      [hidden, `Charged the whole of the hidden goodwill to ${f.stay[i]}; ${who} bear it in their gaining ratio.`],
      [hidden / 2, 'Divided the hidden goodwill equally instead of in the gaining ratio.'],
      [(hidden * f.stayOld[i]) / f.total, `Divided the hidden goodwill in the old ratio of all three partners, which leaves a part of it with ${f.out}.`],
      [(paid * w[i]) / sum(w), 'Treated the whole payment as goodwill, not only the excess over the amount due.'],
    ]);
    return n && {
      prompt: `${intro(rng, f)} ${FLUCTUATING} ${f.out} retires; no new profit-sharing ratio is agreed between ${who}. After the adjustments for reserves and revaluation, ${f.out}'s Capital A/c shows a credit balance of ${inr(due)}. No separate value is placed on the goodwill of the firm: ${who} agree to pay ${f.out} ${inr(paid)} in full settlement, which covers ${f.out}'s share of goodwill. With what amount is ${f.stay[i]}'s Capital A/c debited for goodwill?`,
      ...n,
      explanation: [
        `What is paid above the balance of the capital account is ${f.out}'s share of goodwill (hidden goodwill): ${inr(paid)} - ${inr(due)} = ${inr(hidden)}.`,
        `With nothing agreed, ${who} gain in their old ratio, ${rt(w)}.`,
        `${f.stay[i]}'s Capital A/c is debited with ${inr(hidden)} x ${fr(w[i], sum(w))} = ${inr(ans)}.`,
      ],
      hints: ['Why would the continuing partners pay more than the balance of the capital account?', "The excess is the outgoing partner's share of goodwill; the continuing partners bear it in their gaining ratio."],
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    const who = /is ([A-Z][a-z]+)'s Capital A\/c debited/.exec(q.prompt)?.[1];
    if (!g || !who) return false;
    const [due, paid] = amountsIn(q.prompt);
    return near(q.answer / 100, ((paid - due) * g.stayShare[g.stay.indexOf(who)]) / sum(g.stayShare));
  },
});

const gwNetEffect = numericTemplate({
  id: 'ret-gw-net-effect', topicId: T, conceptId: 'ret-goodwill', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const who = list(f.stay);
    const w = lowestTerms(f.stayOld);
    const E = mult(rng, f.total * 1000, 30000, 150000);
    const G = E === null ? null : mult(rng, f.total * sum(w) * 1000, E + 30000, 600000);
    if (E === null || G === null) return null;
    const base = `${intro(rng, f)} ${FLUCTUATING} ${f.out} retires; no new profit-sharing ratio is agreed between ${who}. Goodwill already appears in the books at ${inr(E)}. On the retirement the goodwill of the firm is valued at ${inr(G)}, and no Goodwill A/c is to remain in the books.`;
    const s = (G * f.x) / f.total;
    if (rng.int(0, 1) === 0) {
      const i = rng.int(0, 1);
      const off = (E * f.stayOld[i]) / f.total;
      const comp = (s * w[i]) / sum(w);
      const n = numeric(off + comp, [
        [comp, `Left out ${f.stay[i]}'s share of the existing goodwill that is written off.`],
        [off, `Wrote off the existing goodwill but did not charge ${f.stay[i]} for the gain of ${f.out}'s share.`],
        [((G - E) * f.x * w[i]) / (f.total * sum(w)), 'Adjusted only the rise in the value of goodwill; the book value is written off in the old ratio and the full new value is adjusted in the gaining ratio.'],
        [(E * w[i]) / sum(w) + comp, 'Wrote off the existing goodwill between the continuing partners only; all the partners bear it in the old ratio.'],
      ]);
      return n && {
        prompt: `${base} By how much, in all, is ${f.stay[i]}'s Capital A/c debited on account of goodwill?`,
        ...n,
        explanation: [
          `Existing goodwill is written off among all the partners in the old ratio: ${f.stay[i]} bears ${inr(E)} x ${fr(f.stayOld[i], f.total)} = ${inr(off)}.`,
          `${f.out}'s share of the new goodwill = ${inr(G)} x ${fr(f.x, f.total)} = ${inr(s)}, borne by ${who} in their gaining ratio ${rt(w)}: ${f.stay[i]} bears ${inr(s)} x ${fr(w[i], sum(w))} = ${inr(comp)}.`,
          `Total debit = ${inr(off)} + ${inr(comp)} = ${inr(off + comp)}.`,
        ],
        hints: H.goodwill,
      };
    }
    const off = (E * f.x) / f.total;
    const n = numeric(s - off, [
      [s, `Left out ${f.out}'s share of the existing goodwill that is written off.`],
      [s + off, `Added ${f.out}'s share of the goodwill written off instead of deducting it.`],
      [G - E, `Gave the rise in the goodwill of the whole firm, not ${f.out}'s share of it.`],
      [(G - E) / 3, 'Divided the rise in goodwill equally instead of in the old profit-sharing ratio.'],
    ]);
    return n && {
      prompt: `${base} What is the net amount credited to ${f.out}'s Capital A/c on account of goodwill?`,
      ...n,
      explanation: [
        `Existing goodwill written off: ${f.out}'s Capital A/c is debited with ${inr(E)} x ${fr(f.x, f.total)} = ${inr(off)}.`,
        `Compensation from ${who}: ${f.out}'s Capital A/c is credited with ${inr(G)} x ${fr(f.x, f.total)} = ${inr(s)}.`,
        `Net credit = ${inr(s)} - ${inr(off)} = ${inr(s - off)}.`,
      ],
      hints: H.goodwill,
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    if (!g) return false;
    const [E, G] = amountsIn(q.prompt);
    const who = /is ([A-Z][a-z]+)'s Capital A\/c debited/.exec(q.prompt)?.[1];
    if (who === undefined) return near(q.answer / 100, (G - E) * g.x);
    const own = g.stayShare[g.stay.indexOf(who)];
    return near(q.answer / 100, E * own + (G * g.x * own) / sum(g.stayShare));
  },
});

const gwEntrySacrifice = journalTemplate({
  id: 'ret-gw-entry-sacrifice', topicId: T, conceptId: 'ret-goodwill', difficulty: 'complex', computed: true,
  generate: (rng) => {
    const f = firm(rng);
    const c = sacrificeCase(rng, f);
    if (!c) return null;
    const { n, g, gi, si } = c;
    const N = sum(n);
    const d = N * f.total;
    const G = mult(rng, d * 1000, 60000, 720000);
    if (G === null) return null;
    const gain = (G * g[gi]) / d;
    const lost = (G * -g[si]) / d;
    const s = (G * f.x) / f.total;
    const who = list(f.stay);
    return {
      prompt: `${intro(rng, f)} ${FLUCTUATING} ${f.out} retires and ${who} agree to share future profits in the ratio ${rt(n)}. The goodwill of the firm is valued at ${inr(G)}; ${NO_GOODWILL_ACCOUNT} Pass the journal entry for goodwill.`,
      lines: [dr(partnerCapital(f.stay[gi]), gain), cr(partnerCapital(f.out), s), cr(partnerCapital(f.stay[si]), lost)],
      explanation: [
        `Change = new share - old share. ${f.stay[0]}: ${fr(n[0], N)} - ${fr(f.stayOld[0], f.total)} = ${g[0] > 0 ? '+' : '-'}${fr(Math.abs(g[0]), d)}; ${f.stay[1]}: ${fr(n[1], N)} - ${fr(f.stayOld[1], f.total)} = ${g[1] > 0 ? '+' : '-'}${fr(Math.abs(g[1]), d)}.`,
        `${f.stay[gi]} alone gains, so ${f.stay[gi]}'s Capital A/c is debited with ${inr(G)} x ${fr(g[gi], d)} = ${inr(gain)}.`,
        `${f.out} gives up the whole share: credit ${inr(G)} x ${fr(f.x, f.total)} = ${inr(s)}.`,
        `${f.stay[si]} also sacrifices: credit ${inr(G)} x ${fr(-g[si], d)} = ${inr(lost)}.`,
      ],
      hints: ['Work out new share - old share for each continuing partner. Is either figure negative?', 'A partner who gains is debited; the partner who leaves and a continuing partner who sacrifices are credited, each with goodwill x the share given up.'],
      distractorAccounts: ['goodwill', 'premiumForGoodwill', 'revaluation'],
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    const n = ratiosIn(q.prompt).filter((r) => r.length === 2)[0];
    if (!g || !n) return false;
    const G = amountsIn(q.prompt)[0];
    const ok = g.stay.every((name, i) => {
      const change = G * (n[i] / sum(n) - g.stayShare[i]);
      return near(posted(q, partnerCapital(name), change > 0 ? 'Dr' : 'Cr'), Math.abs(change));
    });
    return ok && near(posted(q, partnerCapital(g.out), 'Cr'), G * g.x);
  },
});

/** "Year ended 31 March 2024: ₹1,20,000" or "...: Loss ₹30,000", one line for each year, the latest last. */
const yearRows = (profits: readonly number[], lastYear: number): string[] =>
  profits.map((p, i) => `Year ended 31 March ${lastYear - (profits.length - 1 - i)}: ${p < 0 ? `Loss ${inr(-p)}` : inr(p)}`);
/** The profits of the year rows of a prompt, a loss as a negative figure. */
const readYears = (prompt: string): number[] =>
  [...prompt.matchAll(/Year ended 31 March \d{4}: (Loss )?₹([\d,]+)/g)].map((m) => (m[1] ? -1 : 1) * Number(m[2].replace(/,/g, '')));

const gwValuationShare = numericTemplate({
  id: 'ret-gw-valuation-share', topicId: T, conceptId: 'ret-goodwill', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const who = list(f.stay);
    const w = lowestTerms(f.stayOld);
    const k = rng.pick([3, 4]);
    const years = rng.pick([2, 3]);
    const A = mult(rng, f.total * sum(w) * 1000, 60000, 300000);
    if (A === null) return null;
    const withLoss = rng.int(0, 2) === 0;
    const drawn = Array.from({ length: k - 1 }, (_, i) => (withLoss && i === 0 ? -rng.step(10000, 40000, 5000) : A + rng.step(-40000, 40000, 5000)));
    const last = k * A - sum(drawn);
    if (drawn.some((p) => p === 0 || (p > 0 && p < 20000)) || last < 20000 || last > 2.2 * A) return null;
    const profits = rng.shuffle([...drawn, last]);
    const loss = profits.find((p) => p < 0);
    const G = years * A;
    const s = (G * f.x) / f.total;
    const i = rng.int(0, 1);
    const askOut = rng.int(0, 1) === 0;
    /** The asked partner's part of a goodwill figure, in whole-number arithmetic. */
    const part = (v: number): number => (askOut ? (v * f.x) / f.total : (v * f.x * w[i]) / (f.total * sum(w)));
    const ans = part(G);
    const latest = profits[profits.length - 1];
    const n = numeric(ans, [
      [part(A), "Stopped at the average profit and did not multiply it by the number of years' purchase."],
      [part(k * A * years), `Used the total profit of the ${k} years instead of the average.`],
      ...(loss === undefined
        ? ([[part(latest * years), "Used only the latest year's profit instead of the average of the years given."]] as [number, string][])
        : ([[part(((k * A - 2 * loss) * years) / k), 'Added the loss of one year as if it were a profit; a loss is deducted in finding the average.']] as [number, string][])),
      ...(askOut
        ? ([[G, `Gave the goodwill of the whole firm, not ${f.out}'s share of it.`]] as [number, string][])
        : ([[s, `Charged the whole of ${f.out}'s share of goodwill to ${f.stay[i]}; ${who} bear it in their gaining ratio.`]] as [number, string][])),
    ]);
    const lead = `${intro(rng, f)} ${FLUCTUATING} ${f.out} retires on 31 March 2026; no new profit-sharing ratio is agreed between ${who}. Goodwill is valued at ${years} years' purchase of the average profit of the last ${k} years and is adjusted through the capital accounts. The profits were:`;
    const ask = askOut ? `With what amount is ${f.out}'s Capital A/c credited for goodwill?` : `With what amount is ${f.stay[i]}'s Capital A/c debited for goodwill?`;
    return n && {
      prompt: `${lead}\n${yearRows(profits, 2026).join('\n')}\n${ask}`,
      ...n,
      explanation: [
        `Average profit = (${profits.map((p) => (p < 0 ? `- ${inr(-p)}` : inr(p))).join(' + ').replace(/\+ - /g, '- ')}) / ${k} = ${inr(A)}.`,
        `Goodwill of the firm = ${inr(A)} x ${years} = ${inr(G)}.`,
        `${f.out}'s share = ${inr(G)} x ${fr(f.x, f.total)} = ${inr(s)}${askOut ? `, credited to ${f.out}'s Capital A/c.` : '.'}`,
        ...(askOut ? [] : [`${who} gain in their old ratio ${rt(w)}: ${f.stay[i]} is debited with ${inr(s)} x ${fr(w[i], sum(w))} = ${inr(ans)}.`]),
      ],
      hints: ['Value the goodwill of the firm first: average profit, then years of purchase.', "Then take the outgoing partner's share of it, and divide that between the continuing partners in the gaining ratio."],
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    if (!g) return false;
    const profits = readYears(q.prompt);
    const G = (sum(profits) / profits.length) * intIn(q.prompt, /valued at (\d+) years' purchase/);
    const who = /is ([A-Z][a-z]+)'s Capital A\/c debited/.exec(q.prompt)?.[1];
    return near(q.answer / 100, who === undefined ? G * g.x : (G * g.x * g.stayShare[g.stay.indexOf(who)]) / sum(g.stayShare));
  },
});

// ===============================================================================================================
// REVALUATION, RESERVES AND ACCUMULATED PROFITS
// ===============================================================================================================

/** The amount on a row of a prompt that starts with `label` ("General Reserve: ₹60,000"); NaN when there is none. */
export const rowAmount = (prompt: string, label: RegExp): number => {
  const line = prompt.split('\n').find((l) => label.test(l));
  return line === undefined ? NaN : amountsIn(line)[0];
};

const reserveShare = numericTemplate({
  id: 'ret-reserve-share', topicId: T, conceptId: 'ret-revaluation', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const R = mult(rng, f.total * 3000, 30000, 300000);
    const P = mult(rng, f.total * 3000, 15000, 150000);
    if (R === null || P === null) return null;
    const askOut = rng.int(0, 1) === 0;
    const i = rng.int(0, 1);
    const who = askOut ? f.out : f.stay[i];
    const term = askOut ? f.x : f.stayOld[i];
    const all = R + P;
    const ans = (all * term) / f.total;
    const n = numeric(ans, [
      [(R * term) / f.total, 'Left out the credit balance of Profit and Loss A/c, which is an undistributed profit just as the reserve is.'],
      [all / 3, 'Divided the reserve and the profit equally instead of in the old profit-sharing ratio.'],
      ...(askOut ? [] : ([[(all * term) / (f.total - f.x), `Shared the reserve and the profit between the continuing partners only, although ${f.out} was a partner when they were earned.`]] as [number, string][])),
      [all, `Gave the whole of the two balances, not ${who}'s share of them.`],
    ]);
    return n && {
      prompt: `${intro(rng, f)} ${FLUCTUATING} ${f.out} retires on 31 March 2026. The balance sheet on that date shows General Reserve ${inr(R)} and Profit and Loss A/c (credit balance) ${inr(P)}. How much of these two balances is credited to ${who}'s Capital A/c?`,
      ...n,
      explanation: [
        `The reserve and the undistributed profit were earned while ${f.out} was a partner, so all the partners share them in the old ratio ${rt(f.old)}.`,
        `Total = ${inr(R)} + ${inr(P)} = ${inr(all)}.`,
        `${who}'s share = ${inr(all)} x ${fr(term, f.total)} = ${inr(ans)}.`,
      ],
      hints: H.all,
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    const who = /credited to ([A-Z][a-z]+)'s Capital/.exec(q.prompt)?.[1];
    if (!g || !who) return false;
    const [R, P] = amountsIn(q.prompt);
    return near(q.answer / 100, (R + P) * g.share[g.names.indexOf(who)]);
  },
});

const reserveEntry = journalTemplate({
  id: 'ret-reserve-entry', topicId: T, conceptId: 'ret-revaluation', difficulty: 'easy',
  generate: (rng) => {
    const f = firm(rng);
    const R = mult(rng, f.total * 1000, 30000, 300000);
    if (R === null) return null;
    const fixed = rng.int(0, 2) === 0;
    const reserve = rng.int(0, 2) > 0;
    const account = fixed ? partnerCurrent : partnerCapital;
    const parts = f.old.map((v) => (R * v) / f.total);
    const what = reserve ? `The General Reserve stands at ${inr(R)} on that date.` : `Profit and Loss A/c shows a credit balance of ${inr(R)} on that date.`;
    return {
      prompt: `${intro(rng, f)} ${fixed ? 'Capitals are fixed, so each partner also has a current account.' : FLUCTUATING} ${f.out} ${rng.pick(['retires', 'dies'])}. ${what} Pass the journal entry to distribute it.`,
      lines: [dr(reserve ? 'generalReserve' : 'profitAndLoss', R), ...f.names.map((name, i) => cr(account(name), parts[i]))],
      explanation: [
        `${reserve ? 'The reserve is profit set aside' : 'The balance is undistributed profit earned'} while ${f.out} was a partner, so it belongs to all the partners in the old ratio ${rt(f.old)}.`,
        `${reserve ? 'General Reserve A/c' : 'Profit and Loss A/c'} is debited with ${inr(R)}, which closes it.`,
        `${fixed ? 'Capitals are fixed, so the current accounts are credited' : 'The capital accounts are credited'}: ${f.names.map((name, i) => `${name} ${inr(parts[i])}`).join(', ')}.`,
        ...(fixed ? [`The balance of ${f.out}'s Current A/c is afterwards transferred to ${f.out}'s Capital A/c, so that one account shows the amount due.`] : []),
      ],
      hints: H.all,
      distractorAccounts: ['revaluation', 'profitAndLossAppropriation', fixed ? partnerCapital(f.out) : partnerCurrent(f.out)],
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    if (!g) return false;
    const R = amountsIn(q.prompt)[0];
    const account = /Capitals are fixed/.test(q.prompt) ? partnerCurrent : partnerCapital;
    return near(sum(q.expected.filter((l) => l.side === 'Dr').map((l) => l.amount)) / 100, R) && g.names.every((name, i) => near(posted(q, account(name), 'Cr'), R * g.share[i]));
  },
});

const revalEntry = journalTemplate({
  id: 'ret-reval-entry', topicId: T, conceptId: 'ret-revaluation', difficulty: 'medium', computed: true,
  generate: (rng) => {
    const f = firm(rng);
    const V = mult(rng, f.total * 1000, 10000, 120000);
    if (V === null) return null;
    const profit = rng.int(0, 1) === 0;
    const parts = f.old.map((v) => (V * v) / f.total);
    const small = rng.step(20000, 90000, 5000);
    // Either the result is stated, or the two sides of the account are and the result has to be found.
    const told = rng.int(0, 1) === 0
      ? `Revaluation A/c shows a ${profit ? 'profit' : 'loss'} of ${inr(V)}.`
      : `the debit side of Revaluation A/c totals ${inr(profit ? small : small + V)} and the credit side ${inr(profit ? small + V : small)}.`;
    const capitals = f.names.map((name, i) => (profit ? cr : dr)(partnerCapital(name), parts[i]));
    return {
      prompt: `${intro(rng, f)} ${FLUCTUATING} ${f.out} retires. After the assets are revalued and the liabilities reassessed, ${told} Pass the journal entry to close Revaluation A/c.`,
      lines: profit ? [dr('revaluation', V), ...capitals] : [...capitals, cr('revaluation', V)],
      explanation: [
        profit ? `The credit side of Revaluation A/c is the larger: a profit of ${inr(V)}.` : `The debit side of Revaluation A/c is the larger: a loss of ${inr(V)}.`,
        `The values changed while ${f.out} was a partner, so all the partners share the ${profit ? 'profit' : 'loss'} in the old ratio ${rt(f.old)}: ${f.names.map((name, i) => `${name} ${inr(parts[i])}`).join(', ')}.`,
        profit ? 'Revaluation A/c is debited to close it and the capital accounts are credited.' : 'The capital accounts are debited and Revaluation A/c is credited to close it.',
      ],
      hints: H.all,
      distractorAccounts: ['profitAndLoss', 'generalReserve', 'profitAndLossAppropriation'],
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    if (!g) return false;
    const a = amountsIn(q.prompt);
    // Stated outright, or the credit side less the debit side.
    const result = a.length === 1 ? (/a profit of/.test(q.prompt) ? a[0] : -a[0]) : a[1] - a[0];
    return near(posted(q, 'revaluation', result > 0 ? 'Dr' : 'Cr'), Math.abs(result)) && g.names.every((name, i) => near(posted(q, partnerCapital(name), result > 0 ? 'Cr' : 'Dr'), Math.abs(result) * g.share[i]));
  },
});

const REVAL_ITEMS: { text: (a: string) => string; sign: 1 | -1; short: string; flip?: string }[] = [
  { text: (a) => `Land and building is to be appreciated by ${a}.`, sign: 1, short: 'land and building' },
  { text: (a) => `Stock is to be reduced in value by ${a}.`, sign: -1, short: 'stock' },
  { text: (a) => `Machinery is to be depreciated by ${a}.`, sign: -1, short: 'machinery' },
  { text: (a) => `A provision for doubtful debts of ${a} is to be created.`, sign: -1, short: 'provision for doubtful debts', flip: 'Counted the new provision for doubtful debts as a gain; a provision is a loss on revaluation.' },
  { text: (a) => `Creditors of ${a} are not to be paid and are to be written back.`, sign: 1, short: 'creditors written back', flip: 'Counted the creditors written back as a loss; a liability that falls is a gain on revaluation.' },
  { text: (a) => `Outstanding salaries of ${a}, not yet in the books, are to be provided for.`, sign: -1, short: 'outstanding salaries', flip: 'Counted the outstanding salaries now recorded as a gain; a new liability is a loss on revaluation.' },
  { text: (a) => `Investments of ${a}, not yet in the books, are to be recorded.`, sign: 1, short: 'unrecorded investments', flip: 'Counted the unrecorded investments as a loss; an asset brought into the books is a gain on revaluation.' },
];
/** The sign of a revaluation row, read from its wording: a gain is +1 and a loss -1. */
const revalSign = (line: string): number => (/appreciated|written back|to be recorded/.test(line) ? 1 : /reduced|depreciated|provision|provided for/.test(line) ? -1 : 0);

const revalShare = mcqTemplate({
  id: 'ret-reval-share', topicId: T, conceptId: 'ret-revaluation', difficulty: 'medium',
  generate: (rng) => {
    const f = firm(rng);
    const items = rng.shuffle(REVAL_ITEMS).slice(0, rng.pick([3, 3, 4]));
    if (!items.some((it) => it.sign > 0) || !items.some((it) => it.sign < 0)) return null;
    const amounts = items.map(() => mult(rng, f.total * 1000, 8000, 90000));
    if (amounts.some((a) => a === null)) return null;
    const amt = amounts as number[];
    const gains = sum(items.map((it, i) => (it.sign > 0 ? amt[i] : 0)));
    const losses = sum(items.map((it, i) => (it.sign < 0 ? amt[i] : 0)));
    const V = gains - losses;
    if (V === 0) return null;
    /** The option that says what a (signed) result of the whole firm does to the outgoing partner's capital. */
    const effect = (result: number, divisor = f.total, term = f.x): string | null => {
      const share = (Math.abs(result) * term) / divisor;
      return result === 0 || !Number.isInteger(share) ? null : `${f.out}'s Capital A/c is ${result > 0 ? 'credited' : 'debited'} with ${inr(share)}`;
    };
    const flipAt = items.findIndex((it) => it.flip !== undefined);
    const wrong: [string | null, string][] = [
      [effect(-V), V > 0 ? 'Debited a profit on revaluation; a profit is credited to the partners.' : 'Credited a loss on revaluation; a loss is debited to the partners.'],
      ...(flipAt >= 0 ? ([[effect(V - 2 * items[flipAt].sign * amt[flipAt]), items[flipAt].flip!]] as [string | null, string][]) : []),
      [effect(gains), 'Counted only the gains on revaluation and left out the losses.'],
      [effect(V, 3, 1), 'Divided the result equally instead of in the old profit-sharing ratio.'],
      [`${f.out}'s Capital A/c is not affected: only ${list(f.stay)} share the result`, `Left ${f.out} out, although the values changed while ${f.out} was still a partner.`],
    ];
    const share = (Math.abs(V) * f.x) / f.total;
    /** "stock ₹18,000 + machinery ₹81,000 = ₹99,000" for the gains (+1) or the losses (-1); a single item needs no total. */
    const listed = (sign: number, total: number) => {
      const parts = items.map((it, i) => (it.sign === sign ? `${it.short} ${inr(amt[i])}` : '')).filter((s) => s !== '');
      return parts.length === 1 ? parts[0] : `${parts.join(' + ')} = ${inr(total)}`;
    };
    return choice(
      `${intro(rng, f)} ${FLUCTUATING} ${f.out} retires on 31 March 2026. On that date it is agreed that:\n${items.map((it, i) => it.text(inr(amt[i]))).join('\n')}\nHow does the result of this revaluation affect ${f.out}'s Capital A/c?`,
      effect(V)!,
      wrong.filter((w): w is [string, string] => w[0] !== null),
      `Gains: ${listed(1, gains)}. Losses: ${listed(-1, losses)}. Net ${V > 0 ? 'profit' : 'loss'} on revaluation = ${inr(Math.abs(V))}. All the partners share it in the old ratio ${rt(f.old)}: ${f.out}'s share = ${inr(Math.abs(V))} x ${fr(f.x, f.total)} = ${inr(share)}, ${V > 0 ? 'credited' : 'debited'} to ${f.out}'s Capital A/c.`,
      ['Mark each item as a gain (an asset up, a liability down) or a loss (an asset down, a liability up).', 'The net result is shared by all the partners, the outgoing partner included, in the old ratio.'],
    );
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    if (!g) return false;
    const V = sum(q.prompt.split('\n').slice(1, -1).map((line) => revalSign(line) * amountsIn(line)[0]));
    const m = /is (credited|debited) with ₹([\d,]+)$/.exec(optionText(q));
    return m !== null && (m[1] === 'credited') === V > 0 && near(Number(m[2].replace(/,/g, '')), Math.abs(V) * g.x);
  },
});

const accumulatedLossEntry = journalTemplate({
  id: 'ret-accumulated-loss-entry', topicId: T, conceptId: 'ret-revaluation', difficulty: 'easy',
  generate: (rng) => {
    const f = firm(rng);
    const L = mult(rng, f.total * 1000, 20000, 150000);
    if (L === null) return null;
    const item = rng.pick([
      { id: 'profitAndLoss', name: 'Profit and Loss A/c', text: `Profit and Loss A/c shows a debit balance of ${inr(L)}`, what: 'The debit balance is a loss not yet shared' },
      { id: 'advertisementSuspense', name: 'Advertisement Suspense A/c', text: `Advertisement Suspense A/c stands at ${inr(L)} on the assets side`, what: 'Advertisement Suspense is an expense not yet written off' },
      { id: 'deferredRevenueExpenditure', name: 'Deferred Revenue Expenditure A/c', text: `Deferred Revenue Expenditure of ${inr(L)} appears on the assets side`, what: 'Deferred revenue expenditure is an expense not yet written off' },
    ]);
    const parts = f.old.map((v) => (L * v) / f.total);
    return {
      prompt: `${intro(rng, f)} ${FLUCTUATING} ${f.out} ${rng.pick(['retires', 'dies'])}. On that date ${item.text}. Pass the journal entry to deal with it.`,
      lines: [...f.names.map((name, i) => dr(partnerCapital(name), parts[i])), cr(item.id, L)],
      explanation: [
        `${item.what}, and it arose while ${f.out} was a partner, so all the partners bear it in the old ratio ${rt(f.old)}.`,
        `The capital accounts are debited: ${f.names.map((name, i) => `${name} ${inr(parts[i])}`).join(', ')}.`,
        `${item.name} is credited with ${inr(L)}, which closes it.`,
      ],
      hints: H.all,
      distractorAccounts: ['revaluation', 'generalReserve', 'profitAndLossAppropriation'],
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    const L = amountsIn(q.prompt)[0];
    return g !== null && near(sum(q.expected.filter((l) => l.side === 'Cr').map((l) => l.amount)) / 100, L) && g.names.every((name, i) => near(posted(q, partnerCapital(name), 'Dr'), L * g.share[i]));
  },
});

// ===============================================================================================================
// AMOUNT DUE TO THE RETIRING PARTNER AND ITS SETTLEMENT
// ===============================================================================================================

const MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
/** Whole months from 1 April to a month-end date of that accounting year: "30 September 2025" is 6. Used by `verify` only. */
export const monthsFromApril = (date: string): number => MONTHS.indexOf(/\d+ ([A-Z][a-z]+) \d{4}/.exec(date)?.[1] ?? '') + 1;
/** The first date after `after` in a prompt, or the first date of all. */
export const dateIn = (prompt: string, after = ''): string => new RegExp(`${after}(\\d+ [A-Z][a-z]+ \\d{4})`).exec(prompt)?.[1] ?? '';

/** Month ends of the year from 1 April 2025, with the whole months from 1 April to each. */
export const DATES_2025 = [
  { text: '30 June 2025', months: 3 },
  { text: '31 July 2025', months: 4 },
  { text: '31 August 2025', months: 5 },
  { text: '30 September 2025', months: 6 },
  { text: '31 October 2025', months: 7 },
  { text: '30 November 2025', months: 8 },
  { text: '31 December 2025', months: 9 },
  { text: '31 January 2026', months: 10 },
];
/** Month ends of 2024 on which a partner retires, with the whole months from each to the closing of 31 March 2025. */
const DATES_2024 = [
  { text: '30 June 2024', day: '30 June', toClose: 9 },
  { text: '31 July 2024', day: '31 July', toClose: 8 },
  { text: '31 August 2024', day: '31 August', toClose: 7 },
  { text: '30 September 2024', day: '30 September', toClose: 6 },
  { text: '31 October 2024', day: '31 October', toClose: 5 },
  { text: '30 November 2024', day: '30 November', toClose: 4 },
  { text: '31 December 2024', day: '31 December', toClose: 3 },
];

const settleLoanAmount = numericTemplate({
  id: 'ret-settle-loan-amount', topicId: T, conceptId: 'ret-amount-due', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const due = rng.step(200000, 900000, 20000);
    const p = rng.pick([20, 25, 30, 40, 50, 60]);
    const lump = rng.step(50000, 150000, 10000);
    const way = rng.pick([
      { text: `${p}% of it is paid at once by cheque`, paid: (due * p) / 100 },
      { text: 'One-fourth of it is paid at once by cheque', paid: due / 4 },
      { text: 'Two-fifths of it is paid at once by cheque', paid: (due * 2) / 5 },
      { text: `${inr(lump)} is paid at once by cheque`, paid: lump },
    ]);
    const n = numeric(due - way.paid, [
      [way.paid, 'Gave the amount paid at once, not the balance that is left as a loan.'],
      [due, 'Transferred the whole amount due, although a part of it was paid at once.'],
      [due + way.paid, 'Added the payment to the amount due instead of deducting it.'],
    ]);
    return n && {
      prompt: `${f.out} retires from the firm of ${list(f.names)}. After all adjustments the amount due to ${f.out} is ${inr(due)}. ${way.text}, and the balance is transferred to ${f.out}'s Loan A/c. With what amount is ${f.out}'s Loan A/c opened?`,
      ...n,
      explanation: [`Paid at once = ${inr(way.paid)}.`, `Balance transferred to ${f.out}'s Loan A/c = ${inr(due)} - ${inr(way.paid)} = ${inr(due - way.paid)}.`],
      hints: ['How much of the amount due is still unpaid?', "What is not paid at once stays with the firm as the retiring partner's loan."],
    };
  },
  verify: (q) => {
    const a = amountsIn(q.prompt);
    const pc = /(\d+)% of it is paid/.exec(q.prompt);
    const paid = pc ? (a[0] * Number(pc[1])) / 100 : /One-fourth/.test(q.prompt) ? a[0] / 4 : /Two-fifths/.test(q.prompt) ? a[0] * 0.4 : a[1];
    return near(q.answer / 100 + paid, a[0]);
  },
});

const settleEntry = journalTemplate({
  id: 'ret-settle-entry', topicId: T, conceptId: 'ret-amount-due', difficulty: 'easy',
  generate: (rng) => {
    const f = firm(rng);
    const due = rng.step(200000, 900000, 10000);
    const paid = rng.step(50000, due - 50000, 10000);
    const mode = rng.int(0, 2);
    const capital = partnerCapital(f.out);
    const loan = partnerLoan(f.out);
    const how = [
      'The firm pays the whole amount at once by cheque.',
      `The firm cannot pay now, so the whole amount is left with the firm as a loan from ${f.out}.`,
      `${inr(paid)} is paid at once by cheque and the balance is left with the firm as a loan from ${f.out}.`,
    ][mode];
    const lines = [dr(capital, due), ...(mode === 0 ? [cr('bank', due)] : mode === 1 ? [cr(loan, due)] : [cr('bank', paid), cr(loan, due - paid)])];
    return {
      prompt: `${f.out}, a partner in the firm of ${list(f.names)}, retires. After all adjustments ${f.out}'s Capital A/c shows a credit balance of ${inr(due)}. ${how} Pass the journal entry.`,
      lines,
      explanation: [
        `${f.out}'s Capital A/c is debited with ${inr(due)}, which closes it: ${f.out} is no longer a partner.`,
        ...(mode !== 1 ? [`The cheque is credited to Bank A/c: ${inr(mode === 0 ? due : paid)}.`] : []),
        ...(mode !== 0 ? [`What is not paid, ${inr(mode === 1 ? due : due - paid)}, is credited to ${f.out}'s Loan A/c: the firm now owes it as a loan.`] : []),
      ],
      hints: ["The retiring partner's capital account must be closed.", 'Debit the capital account with the amount due; credit Bank A/c with what is paid and the Loan A/c of the partner with what is left unpaid.'],
      distractorAccounts: [executor(f.out), 'loan', loan, partnerCurrent(f.out)],
    };
  },
  verify: (q) => {
    const out = /^([A-Z][a-z]+), a partner/.exec(q.prompt)?.[1];
    if (!out) return false;
    const a = amountsIn(q.prompt);
    const bank = /whole amount at once/.test(q.prompt) ? a[0] : /cannot pay now/.test(q.prompt) ? 0 : a[1];
    return near(posted(q, partnerCapital(out), 'Dr'), a[0]) && near(posted(q, 'bank', 'Cr'), bank) && near(posted(q, partnerLoan(out), 'Cr'), a[0] - bank);
  },
});

const amountDue = numericTemplate({
  id: 'ret-amount-due', topicId: T, conceptId: 'ret-amount-due', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const unit = f.total * 1000;
    const K = rng.step(150000, 600000, 10000);
    const R = mult(rng, unit, 30000, 240000);
    const G = mult(rng, unit, 60000, 480000);
    const V = mult(rng, unit, 10000, 90000);
    if (R === null || G === null || V === null) return null;
    const profit = rng.int(0, 1) === 0;
    const s = profit ? 1 : -1;
    const part = (v: number) => (v * f.x) / f.total;
    const ans = K + part(R) + part(G) + s * part(V);
    const n = numeric(ans, [
      [ans - part(G), `Left out ${f.out}'s share of goodwill.`],
      [ans - 2 * s * part(V), profit ? 'Deducted the share of the profit on revaluation instead of adding it.' : 'Added the share of the loss on revaluation instead of deducting it.'],
      [K + R + G + s * V, `Took the whole of each item instead of ${f.out}'s share of it.`],
      [K + (R + G + s * V) / 3, 'Divided each item equally instead of in the old profit-sharing ratio.'],
      [ans - part(R), `Left out ${f.out}'s share of the General Reserve.`],
    ]);
    const rows = [
      `${f.out}'s Capital A/c (credit balance): ${inr(K)}`,
      `General Reserve: ${inr(R)}`,
      `Goodwill of the firm, valued for the retirement: ${inr(G)}`,
      `${profit ? 'Profit' : 'Loss'} on revaluation: ${inr(V)}`,
    ];
    return n && {
      prompt: `${intro(rng, f)} ${FLUCTUATING} ${f.out} retires on 31 March 2026. On that date:\n${rows.join('\n')}\nWhat is the total amount due to ${f.out}?`,
      ...n,
      explanation: [
        `${f.out}'s share is ${fr(f.x, f.total)} of each item.`,
        `General Reserve: ${inr(R)} x ${fr(f.x, f.total)} = ${inr(part(R))}. Goodwill: ${inr(G)} x ${fr(f.x, f.total)} = ${inr(part(G))}. ${profit ? 'Profit' : 'Loss'} on revaluation: ${inr(V)} x ${fr(f.x, f.total)} = ${inr(part(V))}.`,
        `Amount due = ${inr(K)} + ${inr(part(R))} + ${inr(part(G))} ${profit ? '+' : '-'} ${inr(part(V))} = ${inr(ans)}.`,
      ],
      hints: H.due,
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    if (!g) return false;
    const row = (label: RegExp) => rowAmount(q.prompt, label);
    const reval = Number.isNaN(row(/^Profit on revaluation/)) ? -row(/^Loss on revaluation/) : row(/^Profit on revaluation/);
    return near(q.answer / 100, row(/Capital A\/c \(credit balance\)/) + (row(/^General Reserve/) + row(/^Goodwill of the firm/) + reval) * g.x);
  },
});

const amountDueMidyear = numericTemplate({
  id: 'ret-amount-due-midyear', topicId: T, conceptId: 'ret-amount-due', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const unit = f.total * 1000;
    const date = rng.pick(DATES_2025);
    const m = date.months;
    const K = 60000 * rng.int(2, 10);
    const r = rng.pick([5, 6, 8, 10, 12]);
    const P = clean(rng, 120000, 600000, 6000, (v) => (v * m * f.x) % (12 * f.total) === 0);
    const R = mult(rng, unit, 30000, 200000);
    const G = mult(rng, unit, 60000, 480000);
    if (P === null || R === null || G === null) return null;
    const drawn = rng.step(10000, 60000, 2000);
    const onDrawn = rng.step(300, 2400, 100);
    const other = rng.step(10000, 60000, 2000);
    const ioc = (K * r * m) / 1200;
    const profit = (P * m * f.x) / (12 * f.total);
    const part = (v: number) => (v * f.x) / f.total;
    const ans = K + ioc + profit + part(R) + part(G) - drawn - onDrawn;
    const n = numeric(ans, [
      [ans - ioc + (K * r) / 100, `Allowed interest on capital for a full year instead of the ${m} months up to the retirement.`],
      [ans - profit + part(P), `Gave ${f.out} a full year's share of profit instead of the share for ${m} months.`],
      [ans + onDrawn, `Did not deduct the interest on ${f.out}'s drawings.`],
      [ans + 2 * (drawn + onDrawn), 'Added the drawings and the interest on them instead of deducting them.'],
      [ans - other, `Deducted ${f.stay[0]}'s drawings as well, which belong to ${f.stay[0]}'s own account.`],
      [ans - part(G), `Left out ${f.out}'s share of goodwill.`],
    ]);
    const rows = [
      `${f.out}'s capital on 1 April 2025: ${inr(K)}`,
      `Interest on capital: ${r}% p.a.`,
      `${f.out}'s drawings up to the date of retirement: ${inr(drawn)}`,
      `Interest on ${f.out}'s drawings: ${inr(onDrawn)}`,
      `${f.stay[0]}'s drawings up to the same date: ${inr(other)}`,
      `Profit for the year ended 31 March 2025: ${inr(P)}`,
      `General Reserve: ${inr(R)}`,
      `Goodwill of the firm, valued for the retirement: ${inr(G)}`,
    ];
    return n && {
      prompt: `${intro(rng, f)} ${FLUCTUATING} The firm closes its books on 31 March. ${f.out} retires on ${date.text}; ${f.out}'s share of profit from 1 April 2025 to that date is worked out on the basis of time from the profit of the previous year.\n${rows.join('\n')}\nWhat is the total amount due to ${f.out} on the date of retirement?`,
      ...n,
      explanation: [
        `1 April 2025 to ${date.text} is ${m} months.`,
        `Interest on capital = ${inr(K)} x ${r}% x ${m}/12 = ${inr(ioc)}.`,
        `Share of profit = ${inr(P)} x ${m}/12 x ${fr(f.x, f.total)} = ${inr(profit)}.`,
        `Share of General Reserve = ${inr(R)} x ${fr(f.x, f.total)} = ${inr(part(R))}; share of goodwill = ${inr(G)} x ${fr(f.x, f.total)} = ${inr(part(G))}.`,
        `Amount due = ${inr(K)} + ${inr(ioc)} + ${inr(profit)} + ${inr(part(R))} + ${inr(part(G))} - ${inr(drawn)} - ${inr(onDrawn)} = ${inr(ans)}.`,
        `${f.stay[0]}'s drawings do not enter ${f.out}'s account.`,
      ],
      hints: H.due,
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    if (!g) return false;
    const row = (label: RegExp) => rowAmount(q.prompt, label);
    const m = monthsFromApril(dateIn(q.prompt, 'retires on '));
    const K = row(/capital on 1 April 2025/);
    const r = intIn(q.prompt, /Interest on capital: (\d+)%/);
    const added = K * (1 + (r * m) / 1200) + (row(/^Profit for the year/) * m * g.x) / 12 + (row(/^General Reserve/) + row(/^Goodwill of the firm/)) * g.x;
    return near(q.answer / 100, added - row(new RegExp(`^${g.out}'s drawings`)) - row(/^Interest on .*drawings/));
  },
});

const amountDueReverse = numericTemplate({
  id: 'ret-amount-due-reverse', topicId: T, conceptId: 'ret-amount-due', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const unit = f.total * 1000;
    const K = rng.step(200000, 600000, 10000);
    const R = mult(rng, unit, 30000, 240000);
    const V = mult(rng, unit, 10000, 60000);
    const G = mult(rng, unit, 80000, 480000);
    if (R === null || V === null || G === null) return null;
    const part = (v: number) => (v * f.x) / f.total;
    const due = K + part(R) - part(V) + part(G);
    const paid = clean(rng, 50000, due - 100000, 10000, (v) => v >= due / 5);
    if (paid === null) return null;
    const loan = due - paid;
    const back = (v: number) => (v * f.total) / f.x;
    const n = numeric(G, [
      [part(G), `Stopped at ${f.out}'s share of goodwill; the question asks for the goodwill of the whole firm.`],
      [back(loan - K - part(R) + part(V)), 'Left out the cheque: the amount due is the cheque and the loan taken together.'],
      [back(due - K - part(R) - part(V)), 'Treated the loss on revaluation as a profit when working back.'],
      [back(due - K), 'Left out the shares of the reserve and of the loss on revaluation when working back.'],
    ]);
    const rows = [
      `${f.out}'s Capital A/c before these adjustments: ${inr(K)}`,
      `General Reserve: ${inr(R)}`,
      `Loss on revaluation: ${inr(V)}`,
      `Paid to ${f.out} by cheque on retirement: ${inr(paid)}`,
      `Balance transferred to ${f.out}'s Loan A/c: ${inr(loan)}`,
    ];
    return n && {
      prompt: `${intro(rng, f)} ${FLUCTUATING} ${f.out} retires on 31 March 2026. Besides the items below, the only adjustment made was for ${f.out}'s share of the goodwill of the firm.\n${rows.join('\n')}\nAt what amount was the goodwill of the firm valued?`,
      ...n,
      explanation: [
        `Total amount due to ${f.out} = cheque + loan = ${inr(paid)} + ${inr(loan)} = ${inr(due)}.`,
        `Without goodwill: ${inr(K)} + ${inr(R)} x ${fr(f.x, f.total)} - ${inr(V)} x ${fr(f.x, f.total)} = ${inr(K)} + ${inr(part(R))} - ${inr(part(V))} = ${inr(due - part(G))}.`,
        `${f.out}'s share of goodwill = ${inr(due)} - ${inr(due - part(G))} = ${inr(part(G))}.`,
        `Goodwill of the firm = ${inr(part(G))} x ${fr(f.total, f.x)} = ${inr(G)}.`,
      ],
      hints: ['The cheque and the loan together are the whole amount due.', "Take away the capital and the shares of the reserve and the revaluation loss: what is left is the share of goodwill. Then work back to the firm's goodwill."],
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    if (!g) return false;
    const row = (label: RegExp) => rowAmount(q.prompt, label);
    // Built forwards from the answer, the amount due must be the cheque and the loan together.
    const due = row(/Capital A\/c before/) + (row(/^General Reserve/) - row(/^Loss on revaluation/) + q.answer / 100) * g.x;
    return near(due, row(/^Paid to/) + row(/^Balance transferred/));
  },
});

// ===============================================================================================================
// THE RETIRING PARTNER'S LOAN ACCOUNT
// ===============================================================================================================

export const SECTION_37 = "Section 37 of the Indian Partnership Act, 1932: with nothing agreed, the outgoing partner may choose interest at 6% p.a. on the amount left with the firm instead of a share of the later profits.";

const loanInterest = numericTemplate({
  id: 'ret-loan-interest', topicId: T, conceptId: 'ret-loan', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const date = rng.pick(DATES_2024);
    const m = date.toClose;
    const L = 60000 * rng.int(2, 12);
    const agreed = rng.int(0, 2) > 0;
    const r = agreed ? rng.pick([8, 9, 10, 12]) : 6;
    const interest = (L * r * m) / 1200;
    const n = numeric(interest, [
      [(L * r) / 100, `Charged interest for a full year; the loan ran only for the ${m} months from the retirement to 31 March.`],
      [(L * r * (12 - m)) / 1200, 'Counted the months before the retirement instead of the months after it.'],
      [L + interest, 'Gave the balance of the loan account after the interest, not the interest.'],
    ]);
    const terms = agreed
      ? `, which carries interest at ${r}% p.a.`
      : `. Nothing was agreed about interest, and ${f.out} chose to take interest rather than a share of the later profits.`;
    return n && {
      prompt: `${f.out} retired from the firm of ${list(f.names)} on ${date.text}. The amount due, ${inr(L)}, was transferred to ${f.out}'s Loan A/c${terms} The firm closes its books on 31 March. How much interest is credited to ${f.out}'s Loan A/c on 31 March 2025?`,
      ...n,
      explanation: [
        ...(agreed ? [] : [SECTION_37]),
        `From ${date.text} to 31 March 2025 is ${m} months.`,
        `Interest = ${inr(L)} x ${r}% x ${m}/12 = ${inr(interest)}.`,
      ],
      hints: agreed ? H.loan : ['What rate does the law give when the partners have agreed on none?', 'Section 37: interest at 6% p.a. on the amount left with the firm, for the months it stays unpaid.'],
    };
  },
  verify: (q) => {
    const rate = /interest at (\d+)% p\.a\./.exec(q.prompt);
    const months = 12 - monthsFromApril(dateIn(q.prompt, ' on '));
    return near(q.answer / 100, (amountsIn(q.prompt)[0] * (rate ? Number(rate[1]) : 6) * months) / 1200);
  },
});

/** A loan repaid in `n` equal yearly instalments of principal with interest at `r`% on the balance of the year: what is paid in year `k`. */
function yearlyPayment(L: number, n: number, r: number, k: number): number {
  let balance = L;
  let paid = 0;
  for (let y = 1; y <= k; y++) {
    paid = L / n + (balance * r) / 100;
    balance -= L / n;
  }
  return paid;
}

const loanInstalment = numericTemplate({
  id: 'ret-loan-instalment', topicId: T, conceptId: 'ret-loan', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const count = rng.pick([2, 3, 4, 5]);
    const L = mult(rng, count * 10000, 120000, 900000);
    if (L === null) return null;
    const r = rng.pick([6, 8, 9, 10, 12]);
    const k = rng.int(1, count);
    const inst = L / count;
    const open = L - (k - 1) * inst;
    const interest = (open * r) / 100;
    const n = numeric(inst + interest, [
      [inst, 'Gave only the instalment of principal and left out the interest paid with it.'],
      [interest, 'Gave only the interest for the year and left out the instalment of principal.'],
      [inst + (L * r) / 100, 'Charged interest on the original loan, although earlier instalments had already reduced the balance.'],
      [inst + ((open - inst) * r) / 100, 'Charged interest on the balance left after this instalment; interest is on the balance outstanding during the year.'],
    ]);
    const nth = ['first', 'second', 'third', 'fourth', 'fifth'][k - 1];
    return n && {
      prompt: `${f.out} retired from the firm of ${list(f.names)} on 31 March 2025, and the amount due, ${inr(L)}, was transferred to ${f.out}'s Loan A/c. The loan is repaid in ${count} equal annual instalments of principal, the first on 31 March 2026, each paid together with interest at ${r}% p.a. on the balance outstanding during the year. How much does the firm pay ${f.out} on 31 March ${2025 + k}?`,
      ...n,
      explanation: [
        `Each instalment of principal = ${inr(L)} / ${count} = ${inr(inst)}.`,
        k === 1 ? `During the first year the whole ${inr(L)} is outstanding.` : `Before the ${nth} instalment, ${k - 1} instalment${k > 2 ? 's have' : ' has'} been paid: balance outstanding during the year = ${inr(L)} - ${inr((k - 1) * inst)} = ${inr(open)}.`,
        `Interest for the year = ${inr(open)} x ${r}% = ${inr(interest)}.`,
        `Payment = ${inr(inst)} + ${inr(interest)} = ${inr(inst + interest)}.`,
      ],
      hints: H.loan,
    };
  },
  verify: (q) => {
    const L = amountsIn(q.prompt)[0];
    const count = intIn(q.prompt, /repaid in (\d+) equal/);
    const r = intIn(q.prompt, /interest at (\d+)% p\.a\./);
    const k = intIn(q.prompt, /pay [A-Z][a-z]+ on 31 March (\d{4})/) - 2025;
    return near(q.answer / 100, yearlyPayment(L, count, r, k));
  },
});

const loanFirstClose = numericTemplate({
  id: 'ret-loan-first-close', topicId: T, conceptId: 'ret-loan', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const date = rng.pick(DATES_2024);
    const m = date.toClose;
    const L = 12000 * rng.int(10, 50);
    const paid = rng.step(50000, 300000, 10000);
    const due = L + paid;
    const r = rng.pick([6, 8, 9, 10, 12]);
    const interest = (L * r * m) / 1200;
    const n = numeric(L + interest, [
      [L, 'Left out the interest accrued up to 31 March, which the question says is credited to the loan account.'],
      [L + (L * r) / 100, `Charged interest for a full year instead of the ${m} months from the retirement to 31 March.`],
      [L + (due * r * m) / 1200, 'Charged interest on the whole amount due, including the part that was paid at once.'],
      [due + (due * r * m) / 1200, 'Did not deduct the amount paid at once before working out the loan and its interest.'],
    ]);
    return n && {
      prompt: `${f.out} retired from the firm of ${list(f.names)} on ${date.text}, when the amount due to ${f.out} was ${inr(due)}. ${inr(paid)} was paid at once by cheque and the balance was transferred to ${f.out}'s Loan A/c, carrying interest at ${r}% p.a. Nothing more was paid before the firm closed its books on 31 March 2025, when the interest accrued up to that date was credited to the loan account. At what amount does ${f.out}'s Loan A/c stand in the balance sheet on that date?`,
      ...n,
      explanation: [
        `Loan = ${inr(due)} - ${inr(paid)} = ${inr(L)}.`,
        `From ${date.text} to 31 March 2025 is ${m} months: interest = ${inr(L)} x ${r}% x ${m}/12 = ${inr(interest)}.`,
        `The interest is credited to the loan account: balance = ${inr(L)} + ${inr(interest)} = ${inr(L + interest)}.`,
      ],
      hints: H.loan,
    };
  },
  verify: (q) => {
    const [due, paid] = amountsIn(q.prompt);
    const months = 12 - monthsFromApril(dateIn(q.prompt, ' on '));
    return near(q.answer / 100, (due - paid) * (1 + (intIn(q.prompt, /interest at (\d+)% p\.a\./) * months) / 1200));
  },
});

const loanPaymentEntry = journalTemplate({
  id: 'ret-loan-payment-entry', topicId: T, conceptId: 'ret-loan', difficulty: 'medium', computed: true,
  generate: (rng) => {
    const f = firm(rng);
    const count = rng.pick([2, 3, 4, 5]);
    const L = mult(rng, count * 10000, 120000, 900000);
    if (L === null) return null;
    const r = rng.pick([6, 8, 9, 10, 12]);
    const k = rng.int(1, 2);
    const inst = L / count;
    const open = L - (k - 1) * inst;
    const interest = (open * r) / 100;
    const loan = partnerLoan(f.out);
    return {
      prompt: `${f.out} retired from the firm of ${list(f.names)} on 31 March 2025, and ${inr(L)} was transferred to ${f.out}'s Loan A/c. It is repaid in ${count} equal annual instalments of principal from 31 March 2026, each paid by cheque together with interest at ${r}% p.a. on the balance outstanding during the year. The interest of each year is credited to ${f.out}'s Loan A/c on 31 March, before the payment. Pass the journal entry for the cheque paid to ${f.out} on 31 March ${2025 + k}.`,
      lines: [dr(loan, inst + interest), cr('bank', inst + interest)],
      explanation: [
        `Instalment of principal = ${inr(L)} / ${count} = ${inr(inst)}.`,
        `Balance outstanding during the year = ${inr(open)}; interest = ${inr(open)} x ${r}% = ${inr(interest)}, already credited to the loan account.`,
        `The cheque is for ${inr(inst)} + ${inr(interest)} = ${inr(inst + interest)}: ${f.out}'s Loan A/c is debited (the firm owes less) and Bank A/c is credited.`,
      ],
      hints: ['The interest is already in the loan account. What does the cheque pay off?', 'The cheque covers the instalment of principal and the interest of the year, and both come off the loan account.'],
      distractorAccounts: [partnerCapital(f.out), 'interestPaid', 'loan', executor(f.out)],
    };
  },
  verify: (q) => {
    const out = /^([A-Z][a-z]+) retired/.exec(q.prompt)?.[1];
    if (!out) return false;
    const pay = yearlyPayment(amountsIn(q.prompt)[0], intIn(q.prompt, /repaid in (\d+) equal/), intIn(q.prompt, /interest at (\d+)% p\.a\./), intIn(q.prompt, /on 31 March (\d{4})\.$/) - 2025);
    return q.expected.length === 2 && near(posted(q, partnerLoan(out), 'Dr'), pay) && near(posted(q, 'bank', 'Cr'), pay);
  },
});

const loanSecondClose = numericTemplate({
  id: 'ret-loan-second-close', topicId: T, conceptId: 'ret-loan', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const date = rng.pick(DATES_2024);
    const m = date.toClose;
    const count = rng.pick([2, 3, 4, 5]);
    const L = mult(rng, count * 12000, 120000, 720000);
    if (L === null) return null;
    const r = rng.pick([6, 8, 9, 10, 12]);
    const left = L - L / count;
    const accrued = (left * r * m) / 1200;
    const n = numeric(left + accrued, [
      [left, `Left out the interest accrued for the ${m} months since the first instalment, which is credited to the loan account on 31 March.`],
      [left + (L * r * m) / 1200, 'Charged the interest on the original loan, although the first instalment had been repaid.'],
      [L + (L * r * m) / 1200, 'Gave the balance at the first closing, before any instalment was paid.'],
      [left + (left * r) / 100, `Charged interest for a full year instead of the ${m} months since the first instalment.`],
      [left + (L * r) / 100 + accrued, 'Kept the interest paid with the first instalment in the loan account; it was paid off with that instalment.'],
    ]);
    return n && {
      prompt: `${f.out} retired from the firm of ${list(f.names)} on ${date.text}. The amount due, ${inr(L)}, was transferred to ${f.out}'s Loan A/c. It is repaid in ${count} equal annual instalments of principal on ${date.day} each year, the first in 2025, each paid together with all the interest due up to that day. Simple interest at ${r}% p.a. is charged on the principal outstanding. The firm closes its books on 31 March and credits the interest accrued up to that date to the loan account. What is the balance of ${f.out}'s Loan A/c on 31 March 2026?`,
      ...n,
      explanation: [
        `On ${date.day} 2025 the first instalment of ${inr(L)} / ${count} = ${inr(L / count)} is paid, with all the interest due till then. Principal left = ${inr(left)}.`,
        `From ${date.day} 2025 to 31 March 2026 is ${m} months: interest accrued = ${inr(left)} x ${r}% x ${m}/12 = ${inr(accrued)}.`,
        `Balance on 31 March 2026 = ${inr(left)} + ${inr(accrued)} = ${inr(left + accrued)}.`,
      ],
      hints: ['How much principal is left after the first instalment, and for how many months has it run by 31 March 2026?', 'Balance = principal still unpaid + interest accrued on it since the last payment.'],
    };
  },
  verify: (q) => {
    const L = amountsIn(q.prompt)[0];
    const count = intIn(q.prompt, /repaid in (\d+) equal/);
    const r = intIn(q.prompt, /interest at (\d+)% p\.a\./);
    const months = 12 - monthsFromApril(dateIn(q.prompt, ' on '));
    // Walk the account: loan, interest to the first instalment paid with it, then interest accrued to the closing.
    let balance = L + (L * r) / 100;
    balance -= L / count + (L * r) / 100;
    return near(q.answer / 100, balance + (balance * r * months) / 1200);
  },
});

// ===============================================================================================================
// ADJUSTING THE CAPITALS OF THE CONTINUING PARTNERS
// ===============================================================================================================

const UNEQUAL2 = NEW2.filter((n) => n[0] !== n[1]);

/** "Divya brings in ₹20,000 and Eshan withdraws ₹15,000", from what each must add (+) or take out (-); null when either is nothing or not whole. */
const cashMoves = (names: readonly string[], d: readonly number[]): string | null =>
  d.some((v) => v === 0 || !Number.isInteger(v)) ? null : names.map((name, i) => `${name} ${d[i] > 0 ? 'brings in' : 'withdraws'} ${inr(Math.abs(d[i]))}`).join(' and ');

const capNewCapital = numericTemplate({
  id: 'ret-cap-new-capital', topicId: T, conceptId: 'ret-capitals', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const who = list(f.stay);
    const n = rng.pick(UNEQUAL2);
    const N = sum(n);
    const total = mult(rng, N * 10000, 200000, 1200000);
    if (total === null) return null;
    const i = rng.int(0, 1);
    const ans = (total * n[i]) / N;
    const r = numeric(ans, [
      [total / 2, 'Divided the total capital equally instead of in the new profit-sharing ratio.'],
      [(total * n[1 - i]) / N, `Gave ${f.stay[1 - i]}'s capital: took the terms of the new ratio against the wrong names.`],
      [(total * f.stayOld[i]) / f.total, `Used ${f.stay[i]}'s old share in the firm of three partners instead of the new share.`],
    ]);
    return r && {
      prompt: `${intro(rng, f)} ${f.out} retires and ${who} agree to share future profits in the ratio ${rt(n)}. The total capital of the new firm is fixed at ${inr(total)}, to be held by ${who} in their new profit-sharing ratio. What should ${f.stay[i]}'s capital be?`,
      ...r,
      explanation: [`${f.stay[i]}'s new share = ${fr(n[i], N)}.`, `Capital = ${inr(total)} x ${fr(n[i], N)} = ${inr(ans)}.`],
      hints: H.capitals,
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    const n = ratiosIn(q.prompt).filter((r) => r.length === 2)[0];
    const name = /What should ([A-Z][a-z]+)'s capital be/.exec(q.prompt)?.[1];
    return g !== null && n !== undefined && name !== undefined && near(q.answer / 100, (amountsIn(q.prompt)[0] * n[g.stay.indexOf(name)]) / sum(n));
  },
});

const capCash = mcqTemplate({
  id: 'ret-cap-cash', topicId: T, conceptId: 'ret-capitals', difficulty: 'medium',
  generate: (rng) => {
    const f = firm(rng);
    const who = list(f.stay);
    const n = rng.pick(UNEQUAL2);
    const N = sum(n);
    const total = mult(rng, N * 10000, 300000, 1200000);
    if (total === null) return null;
    const need = n.map((v) => (total * v) / N);
    const d = need.map(() => rng.pick([1, -1]) * rng.step(10000, 60000, 5000));
    const have = need.map((v, i) => v - d[i]);
    if (have.some((v) => v < 50000)) return null;
    const moves = (target: number[]) => cashMoves(f.stay, target.map((v, i) => v - have[i]));
    const pool = sum(have);
    const wrong: [string | null, string][] = [
      [cashMoves(f.stay, d.map((v) => -v)), 'Read a shortfall as a surplus and a surplus as a shortfall: a partner whose capital is below the required figure brings cash in.'],
      [moves([total / 2, total / 2]), 'Divided the total capital equally instead of in the new profit-sharing ratio.'],
      [moves([need[1], need[0]]), 'Took the terms of the new ratio against the wrong names.'],
      [moves(f.stayOld.map((v) => (total * v) / sum(f.stayOld))), 'Divided the total capital in the old ratio between the two partners instead of the new ratio.'],
      [moves(n.map((v) => (pool * v) / N)), 'Kept the present total of the two capitals instead of the total fixed for the new firm.'],
    ];
    return choice(
      `${intro(rng, f)} ${f.out} retires, and ${who} will share future profits in the ratio ${rt(n)}. After all the adjustments ${f.stay[0]}'s capital stands at ${inr(have[0])} and ${f.stay[1]}'s at ${inr(have[1])}. The total capital of the new firm is fixed at ${inr(total)}, to be held in the new ratio; a shortfall is brought in and a surplus is withdrawn, in cash. What must be done?`,
      cashMoves(f.stay, d)!,
      wrong.filter((w): w is [string, string] => w[0] !== null),
      `Required capitals: ${f.stay[0]} ${inr(total)} x ${fr(n[0], N)} = ${inr(need[0])}; ${f.stay[1]} ${inr(total)} x ${fr(n[1], N)} = ${inr(need[1])}. ${f.stay.map((name, i) => `${name} has ${inr(have[i])}, so ${name} ${d[i] > 0 ? 'brings in' : 'withdraws'} ${inr(Math.abs(d[i]))}`).join('. ')}.`,
      H.capitals,
    );
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    const n = ratiosIn(q.prompt).filter((r) => r.length === 2)[0];
    if (!g || !n) return false;
    const [a, b, total] = amountsIn(q.prompt);
    return optionText(q) === cashMoves(g.stay, [(total * n[0]) / sum(n) - a, (total * n[1]) / sum(n) - b].map((v) => Math.round(v)));
  },
});

const capShortfall = numericTemplate({
  id: 'ret-cap-shortfall', topicId: T, conceptId: 'ret-capitals', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const who = list(f.stay);
    const n = rng.pick(NEW2);
    const N = sum(n);
    const total = mult(rng, N * 5000, 300000, 1200000);
    if (total === null) return null;
    const need = n.map((v) => (total * v) / N);
    const d = rng.step(10000, 80000, 5000);
    const si = rng.int(0, 1); // the partner whose capital is short
    const have = need.map((v, i) => (i === si ? v - d : v + d));
    if (have.some((v) => v < 50000)) return null;
    const r = numeric(d, [
      [Math.abs(have[0] - have[1]), 'Took the difference between the two capitals; each capital is compared with what it should be in the new ratio.'],
      [need[si], 'Gave the capital the partner must have, not the cash needed to reach it.'],
      [Math.abs(have[si] - total / 2), 'Divided the total capital equally instead of in the new profit-sharing ratio.'],
      [Math.abs(have[si] - (total * f.stayOld[si]) / sum(f.stayOld)), 'Divided the total capital in the old ratio between the two partners instead of the new ratio.'],
    ]);
    return r && {
      prompt: `${intro(rng, f)} ${f.out} retires, and ${who} will share future profits ${n[0] === n[1] ? 'equally' : `in the ratio ${rt(n)}`}. After all the adjustments ${f.stay[0]}'s capital stands at ${inr(have[0])} and ${f.stay[1]}'s at ${inr(have[1])}. They decide that the total of these two capitals is the capital of the new firm, to be held in the new ratio: the partner with a surplus withdraws it and the partner with a shortfall brings in cash. How much cash is brought in?`,
      ...r,
      explanation: [
        `Total capital of the new firm = ${inr(have[0])} + ${inr(have[1])} = ${inr(total)}.`,
        `Required: ${f.stay[0]} ${inr(total)} x ${fr(n[0], N)} = ${inr(need[0])}; ${f.stay[1]} ${inr(total)} x ${fr(n[1], N)} = ${inr(need[1])}.`,
        `${f.stay[si]} is short by ${inr(need[si])} - ${inr(have[si])} = ${inr(d)} and brings it in; ${f.stay[1 - si]} withdraws the same amount.`,
      ],
      hints: H.capitals,
    };
  },
  verify: (q) => {
    const n = /\bequally\b/.test(q.prompt) ? [1, 1] : ratiosIn(q.prompt).filter((r) => r.length === 2)[0];
    if (!n) return false;
    const [a, b] = amountsIn(q.prompt);
    return near(q.answer / 100, Math.abs(((a + b) * n[0]) / sum(n) - a));
  },
});

const capEntry = journalTemplate({
  id: 'ret-cap-entry', topicId: T, conceptId: 'ret-capitals', difficulty: 'medium', computed: true,
  generate: (rng) => {
    const f = firm(rng);
    const who = list(f.stay);
    const n = rng.pick(UNEQUAL2);
    const N = sum(n);
    const total = mult(rng, N * 10000, 300000, 1200000);
    if (total === null) return null;
    const i = rng.int(0, 1);
    const name = f.stay[i];
    const need = (total * n[i]) / N;
    const short = rng.int(0, 1) === 0;
    const d = rng.step(10000, 80000, 5000);
    const have = short ? need - d : need + d;
    if (have < 50000) return null;
    const byCheque = rng.int(0, 2) > 0;
    const capital = partnerCapital(name);
    const other = byCheque ? 'bank' : partnerCurrent(name);
    const otherName = byCheque ? 'Bank A/c' : `${name}'s Current A/c`;
    return {
      prompt: `${intro(rng, f)} ${f.out} retires, and ${who} will share future profits in the ratio ${rt(n)}. The total capital of the new firm is fixed at ${inr(total)}, to be held in the new ratio. After all the adjustments ${name}'s Capital A/c shows a credit balance of ${inr(have)}. ${byCheque ? 'A shortfall is brought in, and a surplus is withdrawn, by cheque.' : "A shortfall or a surplus is adjusted through the partner's Current A/c."} Pass the journal entry for ${name}.`,
      lines: short ? [dr(other, d), cr(capital, d)] : [dr(capital, d), cr(other, d)],
      explanation: [
        `${name}'s required capital = ${inr(total)} x ${fr(n[i], N)} = ${inr(need)}.`,
        short ? `The capital is short by ${inr(need)} - ${inr(have)} = ${inr(d)}.` : `The capital is in surplus by ${inr(have)} - ${inr(need)} = ${inr(d)}.`,
        short ? `${name}'s Capital A/c is credited with ${inr(d)} to raise it, and ${otherName} is debited.` : `${name}'s Capital A/c is debited with ${inr(d)} to bring it down, and ${otherName} is credited.`,
      ],
      hints: H.capitals,
      distractorAccounts: [partnerCapital(f.stay[1 - i]), byCheque ? partnerCurrent(name) : 'bank', partnerCapital(f.out), 'cash'],
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    const n = ratiosIn(q.prompt).filter((r) => r.length === 2)[0];
    const name = /entry for ([A-Z][a-z]+)\.$/.exec(q.prompt)?.[1];
    if (!g || !n || !name) return false;
    const [total, have] = amountsIn(q.prompt);
    const change = (total * n[g.stay.indexOf(name)]) / sum(n) - have;
    const other = /by cheque/.test(q.prompt) ? 'bank' : partnerCurrent(name);
    return near(posted(q, partnerCapital(name), change > 0 ? 'Cr' : 'Dr'), Math.abs(change)) && near(posted(q, other, change > 0 ? 'Dr' : 'Cr'), Math.abs(change));
  },
});

const capPayRetiring = numericTemplate({
  id: 'ret-cap-pay-retiring', topicId: T, conceptId: 'ret-capitals', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const who = list(f.stay);
    const n = rng.pick(UNEQUAL2);
    const N = sum(n);
    const total = mult(rng, N * 10000, 400000, 1500000);
    if (total === null) return null;
    const need = n.map((v) => (total * v) / N);
    const bring = need.map(() => rng.step(20000, 150000, 5000));
    const have = need.map((v, i) => v - bring[i]);
    const due = sum(bring);
    // Both must hold a sensible capital, and the short cut (the payment shared in the new ratio) must not be right.
    if (have.some((v) => v < 50000) || bring[0] * N === due * n[0]) return null;
    const i = rng.int(0, 1);
    const r = numeric(bring[i], [
      [(due * n[i]) / N, `Shared the payment to ${f.out} in the new ratio without looking at the capitals ${who} already have.`],
      [(sum(have) * n[i]) / N - have[i], `Left the amount due to ${f.out} out of the total capital of the new firm.`],
      [need[i], 'Gave the capital the partner must have, not the cash needed to reach it.'],
      [due / 2, `Divided the payment to ${f.out} equally between the continuing partners.`],
    ]);
    return r && {
      prompt: `${intro(rng, f)} ${f.out} retires, and ${who} will share future profits in the ratio ${rt(n)}. After all the adjustments ${f.stay[0]}'s capital stands at ${inr(have[0])}, ${f.stay[1]}'s at ${inr(have[1])}, and the amount due to ${f.out} is ${inr(due)}. ${f.out} is paid in full at once, out of cash brought in by ${who} in such amounts that their capitals are then in the new profit-sharing ratio. How much cash does ${f.stay[i]} bring in?`,
      ...r,
      explanation: [
        `The cash brought in only replaces what is paid to ${f.out}, so the capital of the new firm = ${inr(have[0])} + ${inr(have[1])} + ${inr(due)} = ${inr(total)}.`,
        `${f.stay[i]}'s required capital = ${inr(total)} x ${fr(n[i], N)} = ${inr(need[i])}.`,
        `${f.stay[i]} brings in ${inr(need[i])} - ${inr(have[i])} = ${inr(bring[i])}.`,
      ],
      hints: ['What is the total capital of the new firm once the continuing partners have put in what the outgoing partner takes out?', 'Total capital = the two adjusted capitals + the amount due to the outgoing partner; each partner brings in required capital - existing capital.'],
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    const n = ratiosIn(q.prompt).filter((r) => r.length === 2)[0];
    const name = /does ([A-Z][a-z]+) bring in/.exec(q.prompt)?.[1];
    if (!g || !n || !name) return false;
    const [a, b, due] = amountsIn(q.prompt);
    const i = g.stay.indexOf(name);
    return near(q.answer / 100, ((a + b + due) * n[i]) / sum(n) - [a, b][i]);
  },
});

// ===============================================================================================================
// DEATH: SHARE OF PROFIT UP TO THE DATE OF DEATH
// ===============================================================================================================

/** Month ends of 2025 for a firm that closes its books on 31 December, with the whole months from 1 January to each. */
const DATES_CALENDAR = [
  { text: '31 March 2025', months: 3 },
  { text: '30 April 2025', months: 4 },
  { text: '31 May 2025', months: 5 },
  { text: '30 June 2025', months: 6 },
  { text: '31 July 2025', months: 7 },
  { text: '31 August 2025', months: 8 },
  { text: '30 September 2025', months: 9 },
  { text: '31 October 2025', months: 10 },
];
export const BASIS_TIME = 'Under the partnership deed, the share of profit of a deceased partner from the last balance sheet to the date of death is worked out on the basis of time';
export const BASIS_SALES = 'Under the partnership deed, the share of profit of a deceased partner from the last balance sheet to the date of death is worked out on the sales of that period';

const deathMonths = numericTemplate({
  id: 'ret-death-months', topicId: T, conceptId: 'ret-death-profit', difficulty: 'easy', unit: 'number',
  generate: (rng) => {
    const f = firm(rng);
    const april = rng.int(0, 2) > 0;
    const date = rng.pick(april ? DATES_2025 : DATES_CALENDAR);
    const m = date.months;
    // What the count would be from the other common start of a year.
    const other = april ? (m + 3 > 12 ? m - 9 : m + 3) : m - 3;
    const r = numeric(m, [
      [12 - m, 'Counted the months from the death to the end of the year instead of from the start of the year to the death.'],
      [other, april ? 'Counted from 1 January, although the accounting year of this firm begins on 1 April.' : 'Counted from 1 April, although the accounting year of this firm begins on 1 January.'],
      [m - 1, `Left out the month in which ${f.out} died, although ${f.out} was a partner to its last day.`],
    ], 1);
    return r && {
      prompt: `${list(f.names)} are partners in a firm that closes its books on ${april ? '31 March' : '31 December'} every year. ${f.out} died on ${date.text}. For how many months of the current accounting year is ${f.out}'s share of profit worked out?`,
      ...r,
      explanation: [
        `The last balance sheet is dated ${april ? '31 March 2025' : '31 December 2024'}, so the current year began on ${april ? '1 April 2025' : '1 January 2025'}.`,
        `From ${april ? '1 April 2025' : '1 January 2025'} to ${date.text} is ${m} months.`,
      ],
      hints: ['When did the current accounting year begin?', 'Count the whole months from the day after the last balance sheet to the date of death.'],
    };
  },
  verify: (q) => {
    const month = /died on \d+ ([A-Z][a-z]+) \d{4}/.exec(q.prompt)?.[1] ?? '';
    const fromApril = MONTHS.indexOf(month) + 1;
    // The calendar position of the month, for a year that begins in January: January is 10 months after April.
    return q.answer === (/31 March every year/.test(q.prompt) ? fromApril : ((fromApril + 2) % 12) + 1);
  },
});

const deathProfitLastYear = numericTemplate({
  id: 'ret-death-profit-last-year', topicId: T, conceptId: 'ret-death-profit', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const date = rng.pick(DATES_2025);
    const m = date.months;
    const P = clean(rng, 120000, 600000, 6000, (v) => (v * m * f.x) % (12 * f.total) === 0);
    if (P === null) return null;
    const ans = (P * m * f.x) / (12 * f.total);
    const r = numeric(ans, [
      [(P * f.x) / f.total, `Gave a full year's share; ${f.out} shares only the profit of the ${m} months up to the date of death.`],
      [(P * m) / 12, `Gave the profit of the whole firm for the ${m} months, not ${f.out}'s share of it.`],
      [(P * (12 - m) * f.x) / (12 * f.total), 'Counted the months after the death instead of the months before it.'],
      [(P * m) / 36, 'Divided the profit of the period equally instead of in the profit-sharing ratio.'],
    ]);
    return r && {
      prompt: `${intro(rng, f)} The firm closes its books on 31 March. ${f.out} died on ${date.text}. ${BASIS_TIME} from the profit of the previous year, which was ${inr(P)}. What is ${f.out}'s share of profit up to the date of death?`,
      ...r,
      explanation: [
        `1 April 2025 to ${date.text} is ${m} months.`,
        `Estimated profit of the firm for the period = ${inr(P)} x ${m}/12 = ${inr((P * m) / 12)}.`,
        `${f.out}'s share = ${inr((P * m) / 12)} x ${fr(f.x, f.total)} = ${inr(ans)}.`,
      ],
      hints: H.death,
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    return g !== null && near(q.answer / 100, (amountsIn(q.prompt)[0] * monthsFromApril(dateIn(q.prompt, 'died on ')) * g.x) / 12);
  },
});

const deathProfitAverage = numericTemplate({
  id: 'ret-death-profit-average', topicId: T, conceptId: 'ret-death-profit', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const date = rng.pick(DATES_2025);
    const m = date.months;
    const A = clean(rng, 120000, 480000, 6000, (v) => (v * m * f.x) % (12 * f.total) === 0);
    if (A === null) return null;
    const withLoss = rng.int(0, 3) === 0;
    const first = withLoss ? -rng.step(12000, 60000, 6000) : A + rng.step(-60000, 60000, 6000);
    const second = A + rng.step(-60000, 60000, 6000);
    const third = 3 * A - first - second;
    if (first === 0 || (first > 0 && first < 30000) || second < 30000 || third < 30000 || third > 2.2 * A) return null;
    const profits = rng.shuffle([first, second, third]);
    const loss = profits.find((p) => p < 0);
    const part = (v: number) => (v * m * f.x) / (12 * f.total);
    const ans = part(A);
    const r = numeric(ans, [
      [part(profits[2]), "Used the profit of the latest year only, although the deed says the average of three years."],
      [part(3 * A), 'Used the total profit of the three years instead of their average.'],
      ...(loss === undefined ? [] : ([[part((3 * A - 2 * loss) / 3), 'Added the loss of one year as if it were a profit; a loss is deducted in finding the average.']] as [number, string][])),
      [(A * f.x) / f.total, `Gave a full year's share; ${f.out} shares only the profit of the ${m} months up to the date of death.`],
      [(A * m) / 12, `Gave the profit of the whole firm for the ${m} months, not ${f.out}'s share of it.`],
    ]);
    return r && {
      prompt: `${intro(rng, f)} The firm closes its books on 31 March. ${f.out} died on ${date.text}. ${BASIS_TIME} from the average profit of the last three years:\n${yearRows(profits, 2025).join('\n')}\nWhat is ${f.out}'s share of profit up to the date of death?`,
      ...r,
      explanation: [
        `Average profit = (${profits.map((p) => (p < 0 ? `- ${inr(-p)}` : inr(p))).join(' + ').replace(/\+ - /g, '- ')}) / 3 = ${inr(A)}.`,
        `1 April 2025 to ${date.text} is ${m} months: estimated profit of the firm = ${inr(A)} x ${m}/12 = ${inr((A * m) / 12)}.`,
        `${f.out}'s share = ${inr((A * m) / 12)} x ${fr(f.x, f.total)} = ${inr(ans)}.`,
      ],
      hints: H.death,
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    const profits = readYears(q.prompt);
    return g !== null && profits.length === 3 && near(q.answer / 100, ((sum(profits) / 3) * monthsFromApril(dateIn(q.prompt, 'died on ')) * g.x) / 12);
  },
});

/** Sales of the months up to a death, near what the previous year's sales would give for those months, for which `ok` holds. */
const salesToDeath = (rng: Rng, S: number, m: number, ok: (v: number) => boolean): number | null => {
  const even = (S * m) / 12;
  return clean(rng, Math.ceil((0.6 * even) / 10000) * 10000, Math.floor(Math.min(1.3 * even, 0.95 * S) / 10000) * 10000, 10000, ok);
};
export const salesRows = (S: number, P: number, S2: number): string =>
  [`Sales for the year ended 31 March 2025: ${inr(S)}`, `Profit for the year ended 31 March 2025: ${inr(P)}`, `Sales from 1 April 2025 to the date of death: ${inr(S2)}`].join('\n');

const deathProfitTurnover = numericTemplate({
  id: 'ret-death-profit-turnover', topicId: T, conceptId: 'ret-death-profit', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const date = rng.pick(DATES_2025);
    const m = date.months;
    const rate = rng.pick([8, 10, 12, 15, 20, 25]);
    const S = 100000 * rng.int(8, 30);
    const P = (S * rate) / 100;
    const S2 = salesToDeath(rng, S, m, (v) => (v * rate * f.x) % (100 * f.total) === 0);
    if (S2 === null) return null;
    const ans = (S2 * rate * f.x) / (100 * f.total);
    const r = numeric(ans, [
      [(P * m * f.x) / (12 * f.total), 'Worked on the basis of time, although the deed says the basis is the sales of the period.'],
      [(S2 * rate) / 100, `Gave the profit of the whole firm on these sales, not ${f.out}'s share of it.`],
      [(S2 * f.x) / f.total, `Took ${f.out}'s share of the sales themselves instead of the profit on them.`],
      [(P * f.x) / f.total, `Gave ${f.out}'s share of the whole of last year's profit.`],
    ]);
    return r && {
      prompt: `${intro(rng, f)} The firm closes its books on 31 March. ${f.out} died on ${date.text}. ${BASIS_SALES}, at the rate of profit on sales earned in the previous year.\n${salesRows(S, P, S2)}\nWhat is ${f.out}'s share of profit up to the date of death?`,
      ...r,
      explanation: [
        `Rate of profit on sales last year = ${inr(P)} / ${inr(S)} x 100 = ${rate}%.`,
        `Estimated profit of the firm up to the date of death = ${inr(S2)} x ${rate}% = ${inr((S2 * rate) / 100)}.`,
        `${f.out}'s share = ${inr((S2 * rate) / 100)} x ${fr(f.x, f.total)} = ${inr(ans)}.`,
      ],
      hints: H.death,
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    if (!g) return false;
    const row = (label: RegExp) => rowAmount(q.prompt, label);
    return near(q.answer / 100, (row(/^Sales from 1 April/) * row(/^Profit for the year/) * g.x) / row(/^Sales for the year/));
  },
});

const deathProfitEntry = mcqTemplate({
  id: 'ret-death-profit-entry', topicId: T, conceptId: 'ret-death-profit', difficulty: 'medium',
  generate: (rng) => {
    const f = firm(rng);
    const date = rng.pick(DATES_2025);
    const m = date.months;
    const P = clean(rng, 120000, 600000, 6000, (v) => (v * m * f.x) % (12 * f.total) === 0);
    if (P === null) return null;
    const share = (P * m * f.x) / (12 * f.total);
    const entry = (debit: string, credit: string, a: number) => `${debit} Dr ${inr(a)}; To ${credit} ${inr(a)}`;
    const suspense = 'Profit and Loss Suspense A/c';
    const capital = `${f.out}'s Capital A/c`;
    return choice(
      `${intro(rng, f)} ${FLUCTUATING} The firm closes its books on 31 March. ${f.out} died on ${date.text}. ${list(f.stay)} go on sharing profits in their old ratio between themselves. ${f.out}'s share of profit up to the date of death is worked out on the basis of time from the profit of the previous year, ${inr(P)}. Which entry records this share on the date of death?`,
      entry(suspense, capital, share),
      [
        [entry(capital, suspense, share), `Debited ${f.out}'s Capital A/c; a share of profit is credited to the partner.`],
        [entry('Profit and Loss Appropriation A/c', capital, share), 'Used Profit and Loss Appropriation A/c, which is prepared only when the accounts of the year are closed; the profit of a part of the year is an estimate.'],
        [entry(suspense, capital, (P * f.x) / f.total), `Credited a full year's share; ${f.out} shares only the profit of the ${m} months up to the date of death.`],
        [entry(suspense, capital, (P * m) / 12), `Credited ${f.out} with the estimated profit of the whole firm for the period, not ${f.out}'s share of it.`],
        [entry(suspense, `${f.out}'s Executor's A/c`, share), "Credited the executor directly; the share of profit goes to the deceased partner's Capital A/c first, and only the final balance of that account is transferred to the executor."],
      ],
      `1 April 2025 to ${date.text} is ${m} months. ${f.out}'s share = ${inr(P)} x ${m}/12 x ${fr(f.x, f.total)} = ${inr(share)}. The accounts of the year are not yet closed, so the estimated share is debited to Profit and Loss Suspense A/c and credited to ${f.out}'s Capital A/c. At the end of the year the suspense account is closed against the profit of the year.`,
      ['The profit of the year is not yet known on the date of death. Which account holds an estimated share until it is?', "Profit and Loss Suspense A/c Dr; To the deceased partner's Capital A/c, with the share up to the date of death."],
    );
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    if (!g) return false;
    const share = (amountsIn(q.prompt)[0] * monthsFromApril(dateIn(q.prompt, 'died on ')) * g.x) / 12;
    const text = optionText(q);
    return text.startsWith('Profit and Loss Suspense A/c Dr') && text.includes(`To ${g.out}'s Capital A/c`) && amountsIn(text).every((a) => near(a, share));
  },
});

const deathProfitRateChange = numericTemplate({
  id: 'ret-death-profit-rate-change', topicId: T, conceptId: 'ret-death-profit', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const date = rng.pick(DATES_2025);
    const m = date.months;
    const rate = rng.pick([10, 12, 15, 20]);
    const delta = rng.pick([1, 2, 3]);
    const up = rng.int(0, 1) === 0;
    const used = up ? rate + delta : rate - delta;
    const S = 100000 * rng.int(8, 30);
    const P = (S * rate) / 100;
    const S2 = salesToDeath(rng, S, m, (v) => (v * used * f.x) % (100 * f.total) === 0 && (v * rate * f.x) % (100 * f.total) === 0);
    if (S2 === null) return null;
    const share = (pc: number) => (S2 * pc * f.x) / (100 * f.total);
    const r = numeric(share(used), [
      [share(rate), "Used last year's rate of profit unchanged."],
      [share(up ? rate - delta : rate + delta), `Changed the rate in the wrong direction: it is to be ${up ? 'higher' : 'lower'}, not ${up ? 'lower' : 'higher'}.`],
      [(S2 * rate * (100 + (up ? delta : -delta)) * f.x) / (10000 * f.total), `Changed the rate by ${delta}% of itself; the change agreed is ${delta} percentage point${delta > 1 ? 's' : ''} on sales.`],
      [(P * m * f.x) / (12 * f.total), 'Worked on the basis of time, although the deed says the basis is the sales of the period.'],
      [(S2 * used) / 100, `Gave the profit of the whole firm on these sales, not ${f.out}'s share of it.`],
    ]);
    return r && {
      prompt: `${intro(rng, f)} The firm closes its books on 31 March. ${f.out} died on ${date.text}. ${BASIS_SALES}. For this period the partners agree on a rate of profit on sales ${delta} percentage point${delta > 1 ? 's' : ''} ${up ? 'higher' : 'lower'} than the rate earned in the previous year.\n${salesRows(S, P, S2)}\nWhat is ${f.out}'s share of profit up to the date of death?`,
      ...r,
      explanation: [
        `Rate of profit on sales last year = ${inr(P)} / ${inr(S)} x 100 = ${rate}%.`,
        `Rate for this period = ${rate}% ${up ? '+' : '-'} ${delta}% = ${used}%.`,
        `Estimated profit of the firm up to the date of death = ${inr(S2)} x ${used}% = ${inr((S2 * used) / 100)}.`,
        `${f.out}'s share = ${inr((S2 * used) / 100)} x ${fr(f.x, f.total)} = ${inr(share(used))}.`,
        'The date of death is not needed: the basis is sales, not time.',
      ],
      hints: ["Find last year's rate of profit on sales first, then change it as agreed.", 'Share = sales up to the date of death x the agreed rate x the share of the deceased partner.'],
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    const change = /(\d+) percentage points? (higher|lower)/.exec(q.prompt);
    if (!g || !change) return false;
    const row = (label: RegExp) => rowAmount(q.prompt, label);
    const rate = (row(/^Profit for the year/) / row(/^Sales for the year/)) * 100 + (change[2] === 'higher' ? 1 : -1) * Number(change[1]);
    return near(q.answer / 100, (row(/^Sales from 1 April/) * rate * g.x) / 100);
  },
});

// ===============================================================================================================
// THE DECEASED PARTNER'S CAPITAL ACCOUNT AND THE EXECUTOR'S ACCOUNT
// ===============================================================================================================

const execEntry = journalTemplate({
  id: 'ret-exec-entry', topicId: T, conceptId: 'ret-executor', difficulty: 'easy',
  generate: (rng) => {
    const f = firm(rng);
    const E = rng.step(200000, 900000, 10000);
    const paid = rng.step(50000, E - 50000, 10000);
    const exec = executor(f.out);
    if (rng.int(0, 1) === 0) {
      return {
        prompt: `${f.out}, a partner in the firm of ${list(f.names)}, died on ${rng.pick(DATES_2025).text}. After all adjustments ${f.out}'s Capital A/c shows a credit balance of ${inr(E)}, which will be paid later. Pass the journal entry to close ${f.out}'s Capital A/c.`,
        lines: [dr(partnerCapital(f.out), E), cr(exec, E)],
        explanation: [
          `${f.out}'s Capital A/c is debited with ${inr(E)}, which closes it.`,
          `The amount is now owed to the person who looks after ${f.out}'s estate, so it is credited to ${f.out}'s Executor's A/c.`,
        ],
        hints: H.executor,
        distractorAccounts: [partnerLoan(f.out), 'loan', partnerCurrent(f.out)],
      };
    }
    return {
      prompt: `${f.out}, a partner in the firm of ${list(f.names)}, has died, and ${inr(E)} stands to the credit of ${f.out}'s Executor's A/c. The firm now pays ${inr(paid)} of it to the executor by cheque. Pass the journal entry.`,
      lines: [dr(exec, paid), cr('bank', paid)],
      explanation: [
        `The firm owes the executor less, so ${f.out}'s Executor's A/c is debited with ${inr(paid)}.`,
        'The cheque goes out of the bank: Bank A/c is credited.',
        `${inr(E - paid)} is still owed to the executor.`,
      ],
      hints: H.executor,
      distractorAccounts: [partnerCapital(f.out), partnerLoan(f.out), 'loan'],
    };
  },
  verify: (q) => {
    const out = /^([A-Z][a-z]+), a partner/.exec(q.prompt)?.[1];
    if (!out) return false;
    const a = amountsIn(q.prompt);
    return /will be paid later/.test(q.prompt)
      ? near(posted(q, partnerCapital(out), 'Dr'), a[0]) && near(posted(q, executor(out), 'Cr'), a[0])
      : near(posted(q, executor(out), 'Dr'), a[1]) && near(posted(q, 'bank', 'Cr'), a[1]);
  },
});

const execAmount = numericTemplate({
  id: 'ret-exec-amount', topicId: T, conceptId: 'ret-executor', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const date = rng.pick(DATES_2025);
    const m = date.months;
    const K = 60000 * rng.int(2, 10);
    const r = rng.pick([5, 6, 8, 10, 12]);
    const G = mult(rng, f.total * 1000, 60000, 480000);
    const P = clean(rng, 120000, 600000, 6000, (v) => (v * m * f.x) % (12 * f.total) === 0);
    if (G === null || P === null) return null;
    const drawn = rng.step(10000, 60000, 2000);
    const ioc = (K * r * m) / 1200;
    const profit = (P * m * f.x) / (12 * f.total);
    const gw = (G * f.x) / f.total;
    const ans = K + ioc + gw + profit - drawn;
    const n = numeric(ans, [
      [ans - ioc + (K * r) / 100, `Allowed interest on capital for a full year instead of the ${m} months up to the date of death.`],
      [ans - profit + (P * f.x) / f.total, `Gave ${f.out} a full year's share of profit instead of the share for ${m} months.`],
      [ans + 2 * drawn, 'Added the drawings instead of deducting them.'],
      [ans - gw, `Left out ${f.out}'s share of goodwill.`],
      [ans + drawn, `Did not deduct ${f.out}'s drawings.`],
    ]);
    const rows = [
      `${f.out}'s capital on 1 April 2025: ${inr(K)}`,
      `Interest on capital: ${r}% p.a.`,
      `Goodwill of the firm, valued on the death: ${inr(G)}`,
      `Profit for the year ended 31 March 2025: ${inr(P)}`,
      `${f.out}'s drawings from 1 April 2025 to the date of death: ${inr(drawn)}`,
    ];
    return n && {
      prompt: `${intro(rng, f)} ${FLUCTUATING} The firm closes its books on 31 March. ${f.out} died on ${date.text}; ${f.out}'s share of profit up to that date is worked out on the basis of time from the profit of the previous year.\n${rows.join('\n')}\nWhat amount is transferred to the account of ${f.out}'s executor?`,
      ...n,
      explanation: [
        `1 April 2025 to ${date.text} is ${m} months.`,
        `Interest on capital = ${inr(K)} x ${r}% x ${m}/12 = ${inr(ioc)}.`,
        `Share of goodwill = ${inr(G)} x ${fr(f.x, f.total)} = ${inr(gw)}.`,
        `Share of profit = ${inr(P)} x ${m}/12 x ${fr(f.x, f.total)} = ${inr(profit)}.`,
        `Amount due = ${inr(K)} + ${inr(ioc)} + ${inr(gw)} + ${inr(profit)} - ${inr(drawn)} = ${inr(ans)}, transferred to ${f.out}'s Executor's A/c.`,
      ],
      hints: H.due,
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    if (!g) return false;
    const row = (label: RegExp) => rowAmount(q.prompt, label);
    const m = monthsFromApril(dateIn(q.prompt, 'died on '));
    const K = row(/capital on 1 April 2025/);
    return near(q.answer / 100, K * (1 + (intIn(q.prompt, /Interest on capital: (\d+)%/) * m) / 1200) + row(/^Goodwill of the firm/) * g.x + (row(/^Profit for the year/) * m * g.x) / 12 - row(/drawings from 1 April 2025/));
  },
});

const execFirstPayment = numericTemplate({
  id: 'ret-exec-first-payment', topicId: T, conceptId: 'ret-executor', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const count = rng.pick([2, 3, 4]);
    const B = mult(rng, count * 10000, 150000, 900000);
    if (B === null) return null;
    const paid = rng.step(50000, 200000, 10000);
    const E = B + paid;
    const agreed = rng.int(0, 2) > 0;
    const r = agreed ? rng.pick([8, 9, 10, 12]) : 6;
    const inst = B / count;
    const interest = (B * r) / 100;
    const n = numeric(inst + interest, [
      [inst, 'Gave only the instalment and left out the interest paid with it.'],
      [inst + (E * r) / 100, 'Charged interest on the whole amount due, including the part that was paid at once.'],
      [E / count + interest, 'Divided the whole amount due into instalments, although a part of it was paid at once.'],
      [B + interest, 'Paid off the whole balance in the first year instead of one instalment of it.'],
      [interest, 'Gave only the interest for the year and left out the instalment.'],
    ]);
    const terms = agreed
      ? `each paid together with interest at ${r}% p.a. on the balance outstanding during the year.`
      : 'each paid together with the interest on the balance outstanding during the year. No rate of interest was agreed, and the executor chose interest rather than a share of the later profits.';
    return n && {
      prompt: `${f.out}, a partner in the firm of ${list(f.names)}, died on 31 March 2025. The amount due to ${f.out}'s executor was ${inr(E)}. ${inr(paid)} was paid at once, and the balance is payable in ${count} equal annual instalments starting on 31 March 2026, ${terms} How much is paid to the executor on 31 March 2026?`,
      ...n,
      explanation: [
        ...(agreed ? [] : [SECTION_37]),
        `Balance left with the firm = ${inr(E)} - ${inr(paid)} = ${inr(B)}.`,
        `Instalment = ${inr(B)} / ${count} = ${inr(inst)}.`,
        `Interest for the first year = ${inr(B)} x ${r}% = ${inr(interest)}.`,
        `Paid on 31 March 2026 = ${inr(inst)} + ${inr(interest)} = ${inr(inst + interest)}.`,
      ],
      hints: H.loan,
    };
  },
  verify: (q) => {
    const [E, paid] = amountsIn(q.prompt);
    const rate = /interest at (\d+)% p\.a\./.exec(q.prompt);
    return near(q.answer / 100, yearlyPayment(E - paid, intIn(q.prompt, /payable in (\d+) equal/), rate ? Number(rate[1]) : 6, 1));
  },
});

const execAmountFull = numericTemplate({
  id: 'ret-exec-amount-full', topicId: T, conceptId: 'ret-executor', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const unit = f.total * 1000;
    const date = rng.pick(DATES_2025);
    const m = date.months;
    const K = 60000 * rng.int(2, 10);
    const r = rng.pick([5, 6, 8, 10, 12]);
    const R = mult(rng, unit, 30000, 200000);
    const rate = rng.pick([10, 12, 15, 20]);
    const S = 100000 * rng.int(8, 30);
    const latest = (S * rate) / 100;
    const A = clean(rng, Math.ceil((0.8 * latest) / unit) * unit, 1.2 * latest, unit, () => true);
    const S2 = salesToDeath(rng, S, m, (v) => (v * rate * f.x) % (100 * f.total) === 0);
    if (R === null || A === null || S2 === null) return null;
    const first = A + rng.step(-40000, 40000, 5000);
    const second = 3 * A - latest - first;
    if (first < 30000 || second < 30000 || second > 2 * A) return null;
    const years = rng.pick([2, 3]);
    const drawn = rng.step(10000, 60000, 2000);
    const onDrawn = rng.step(300, 2400, 100);
    const part = (v: number) => (v * f.x) / f.total;
    const ioc = (K * r * m) / 1200;
    const gw = part(years * A);
    const profit = (S2 * rate * f.x) / (100 * f.total);
    const ans = K + ioc + part(R) + gw + profit - drawn - onDrawn;
    const n = numeric(ans, [
      [ans - profit + (latest * m * f.x) / (12 * f.total), 'Worked out the share of profit on the basis of time, although the deed says the basis is sales.'],
      [ans - gw + part(A), "Took the average profit as the goodwill and did not multiply it by the number of years' purchase."],
      [ans - ioc + (K * r) / 100, `Allowed interest on capital for a full year instead of the ${m} months up to the date of death.`],
      [ans + onDrawn, `Did not deduct the interest on ${f.out}'s drawings.`],
      [ans - part(R), `Left out ${f.out}'s share of the General Reserve.`],
      [ans - gw + part(years * latest), "Valued goodwill on the latest year's profit instead of the average of the three years."],
    ]);
    const rows = [
      `${f.out}'s capital on 1 April 2025: ${inr(K)}`,
      `Interest on capital: ${r}% p.a.`,
      `General Reserve: ${inr(R)}`,
      ...yearRows([first, second, latest], 2025).map((line) => `Profit, ${line.charAt(0).toLowerCase()}${line.slice(1)}`),
      `Sales for the year ended 31 March 2025: ${inr(S)}`,
      `Sales from 1 April 2025 to the date of death: ${inr(S2)}`,
      `${f.out}'s drawings from 1 April 2025 to the date of death: ${inr(drawn)}`,
      `Interest on ${f.out}'s drawings: ${inr(onDrawn)}`,
    ];
    return n && {
      prompt: `${intro(rng, f)} ${FLUCTUATING} The firm closes its books on 31 March. ${f.out} died on ${date.text}. Under the partnership deed, goodwill is valued at ${years} years' purchase of the average profit of the last three years, and the share of profit up to the date of death is worked out on the sales of that period at the rate of profit on sales earned in the previous year.\n${rows.join('\n')}\nWhat amount is transferred to the account of ${f.out}'s executor?`,
      ...n,
      explanation: [
        `1 April 2025 to ${date.text} is ${m} months: interest on capital = ${inr(K)} x ${r}% x ${m}/12 = ${inr(ioc)}.`,
        `Share of General Reserve = ${inr(R)} x ${fr(f.x, f.total)} = ${inr(part(R))}.`,
        `Average profit = (${inr(first)} + ${inr(second)} + ${inr(latest)}) / 3 = ${inr(A)}; goodwill = ${inr(A)} x ${years} = ${inr(years * A)}; share = ${inr(years * A)} x ${fr(f.x, f.total)} = ${inr(gw)}.`,
        `Rate of profit on sales last year = ${inr(latest)} / ${inr(S)} x 100 = ${rate}%; profit up to the date of death = ${inr(S2)} x ${rate}% = ${inr((S2 * rate) / 100)}; share = ${inr(profit)}.`,
        `Amount due = ${inr(K)} + ${inr(ioc)} + ${inr(part(R))} + ${inr(gw)} + ${inr(profit)} - ${inr(drawn)} - ${inr(onDrawn)} = ${inr(ans)}, transferred to ${f.out}'s Executor's A/c.`,
      ],
      hints: H.due,
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    if (!g) return false;
    const row = (label: RegExp) => rowAmount(q.prompt, label);
    const m = monthsFromApril(dateIn(q.prompt, 'died on '));
    const profits = readYears(q.prompt.replace(/Profit, year ended/g, 'Year ended'));
    const K = row(/capital on 1 April 2025/);
    const goodwill = (sum(profits) / 3) * intIn(q.prompt, /valued at (\d+) years' purchase/);
    const profit = (row(/^Sales from 1 April/) * profits[2]) / row(/^Sales for the year/);
    const added = K * (1 + (intIn(q.prompt, /Interest on capital: (\d+)%/) * m) / 1200) + (row(/^General Reserve/) + goodwill + profit) * g.x;
    return profits.length === 3 && near(q.answer / 100, added - row(/drawings from 1 April 2025/) - row(/^Interest on .*drawings/));
  },
});

// ===============================================================================================================
// SETS OF ENTRIES AND FORMATS
// ===============================================================================================================
// What the sets and the formats add to the conventions at the top of the file (every opening and every data panel
// states the ones it relies on):
//  - a retirement falls on 31 March 2026, the last day of the accounting year, so no share of the profit of a part
//    of a year arises; a death falls on a month end of the year that began on 1 April 2025;
//  - the share of profit of a deceased partner is debited to Profit and Loss Suspense A/c; interest on a retired
//    partner's loan, and on what is owed to an executor, is debited to Interest on Loan A/c and credited to the loan
//    or the executor's account before the cheque that pays it is entered;
//  - a cheque is one entry and one row ("To Bank A/c"), also when it pays an instalment together with its interest;
//  - the loan account that is prepared over the years (ret-fmt-loan) is of a partner who retired on 1 April 2025, the
//    first day of a year, so that its first year opens with the transfer from the capital account and has a full
//    year's interest; the executor's account (ret-fmt-executor) opens on the date of death, part-way through a year;
//  - the items of a set are lettered, because the entries of a retirement or a death all fall on one day;
//  - a reserve, an accumulated profit and an accumulated loss are distributed in full among all the partners in the
//    old ratio, and every item and data panel says "the whole of", because the other treatment (transferring only the
//    share of the partner who leaves) is right only where a question asks for it;
//  - in a Revaluation A/c the result is transferred in the house form of the topics on reconstitution, a row for each
//    partner: "To Profit transferred to Asha's Capital A/c", "By Loss transferred to Asha's Capital A/c", with the
//    shorter "Asha's Capital A/c" accepted too; in the capital accounts the row is "By Revaluation A/c (profit)" or
//    "To Revaluation A/c (loss)";
//  - in a loan account and an executor's account the interest is "By Interest on Loan A/c", the chart's name, and
//    "By Interest A/c", the usual name in textbooks, is accepted too.

export const RETIRE_ON = '31 March 2026';
/** What a format says of the reserve, so that the transfer of the outgoing partner's share alone cannot be argued. */
export const RESERVE_IN_FULL = 'The whole of the General Reserve is distributed among all the partners.';
export const CLOSES = 'The firm closes its books on 31 March.';

/** Tries a builder several times on the same random stream, so that an awkward draw seldom rejects the seed. */
export function attempt<P>(times: number, make: () => P | null): P | null {
  for (let i = 0; i < times; i++) {
    const made = make();
    if (made !== null) return made;
  }
  return null;
}

/** The first of the units, largest first, for which `make` finds a value: a figure is round where it can be. */
const roundest = <V>(units: readonly number[], make: (unit: number) => V | null): V | null => {
  for (const unit of units) {
    const made = make(unit);
    if (made !== null) return made;
  }
  return null;
};
/** The share of a deceased partner comes out in round hundreds of rupees where the figures allow, in whole rupees otherwise. */
const SHARE_UNITS = [500, 100, 1];
/** Last year's profit for a share worked on time: `m` months of it, times the share of the partner who died. */
export const profitForTime = (rng: Rng, f: Firm, m: number): number | null =>
  roundest(SHARE_UNITS, (u) => clean(rng, 120000, 600000, 6000, (v) => (v * m * f.x) % (12 * f.total * u) === 0));
/** The sales to the date of death for a share worked on sales at `rate` per cent of them. */
export const salesForShare = (rng: Rng, f: Firm, S: number, m: number, rate: number): number | null =>
  roundest(SHARE_UNITS, (u) => salesToDeath(rng, S, m, (v) => (v * rate * f.x) % (100 * f.total * u) === 0));

/** One item of a set before it is lettered. */
export interface Step {
  text: string;
  lines: JournalLine[];
  explanation: string[];
}
export const lettered = (steps: readonly Step[]): SetTransaction[] => steps.map((s, i) => ({ label: `(${'abcdefgh'[i]})`, ...s }));

/** Each partner's part of an amount shared in the old ratio, in the order of the names (a loss stays negative). */
export const inOld = (f: Firm, v: number): number[] => f.old.map((o) => (v * o) / f.total);
/** "Asha ₹30,000, Bhavna ₹18,000". */
export const named = (names: readonly string[], parts: readonly number[]): string => names.map((name, i) => `${name} ${inr(Math.abs(parts[i]))}`).join(', ');
/** "₹2,00,000 + ₹40,000 (share of goodwill) - ₹15,000 (share of the loss)": a balance and what is added to it or taken off; nil items are left out. */
export const tally = (start: number, items: readonly (readonly [string, number])[]): string =>
  `${inr(start)}${items
    .filter(([, v]) => v !== 0)
    .map(([what, v]) => ` ${v > 0 ? '+' : '-'} ${inr(Math.abs(v))} (${what})`)
    .join('')}`;

export type GainMode = 'silent' | 'split' | 'one' | 'agreed';

/** How the continuing partners take over the outgoing share. */
export interface Gain {
  /** What each continuing partner gains, as terms of a ratio in lowest terms; 0 for a partner who gains nothing. */
  w: number[];
  /** The new profit-sharing ratio of the continuing partners, in lowest terms. */
  fresh: number[];
  /** What is agreed, as the opening says it (no capital letter, no full stop). */
  text: string;
  /** Why the gaining ratio is what it is (no full stop). */
  why: string;
  /** How the new ratio is found (no full stop). */
  freshWhy: string;
}

export function gainOf(rng: Rng, f: Firm, modes: readonly GainMode[]): Gain | null {
  const who = list(f.stay);
  const [y, z] = f.stayOld;
  const mode = rng.pick(modes);
  if (mode === 'split') {
    const [p, q] = rng.pick(SPLITS);
    if (y * q === z * p) return null; // the stated ratio is the old one: it would test nothing
    const d = f.total * (p + q);
    const shares = [y * (p + q) + f.x * p, z * (p + q) + f.x * q];
    const fresh = lowestTerms(shares);
    return {
      w: [p, q],
      fresh,
      text: `${who} take over ${f.out}'s share ${splitText(p, q)}`,
      why: `${who} gain in the ratio in which they take over ${f.out}'s share, ${p}:${q}`,
      freshWhy: `New shares: ${f.stay[0]} ${fr(y, f.total)} + ${fr(f.x * p, d)} = ${fr(shares[0], d)}; ${f.stay[1]} ${fr(z, f.total)} + ${fr(f.x * q, d)} = ${fr(shares[1], d)}. New ratio = ${rt(fresh)}`,
    };
  }
  if (mode === 'one') {
    const ti = rng.int(0, 1);
    const shares = f.stayOld.map((v, i) => (i === ti ? v + f.x : v));
    const fresh = lowestTerms(shares);
    return {
      w: ti === 0 ? [1, 0] : [0, 1],
      fresh,
      text: `${f.stay[ti]} takes over the whole of ${f.out}'s share`,
      why: `${f.stay[ti]} alone gains ${f.out}'s share, so ${f.stay[ti]} alone pays for it`,
      freshWhy: `${f.stay[ti]}'s new share = ${fr(f.stayOld[ti], f.total)} + ${fr(f.x, f.total)} = ${fr(shares[ti], f.total)}; ${f.stay[1 - ti]}'s share stays ${fr(f.stayOld[1 - ti], f.total)}. New ratio = ${rt(fresh)}`,
    };
  }
  if (mode === 'agreed') {
    const options = NEW2.filter((n) => changes(f, n).every((v) => v > 0) && n[0] * z !== n[1] * y);
    if (options.length === 0) return null;
    const n = rng.pick(options);
    const N = sum(n);
    const g = changes(f, n);
    const d = N * f.total;
    return {
      w: lowestTerms(g),
      fresh: n,
      text: `${who} agree to share future profits ${n[0] === n[1] ? 'equally' : `in the ratio ${rt(n)}`}`,
      why: `Gain = new share - old share: ${f.stay[0]} ${fr(n[0], N)} - ${fr(y, f.total)} = ${fr(g[0], d)}; ${f.stay[1]} ${fr(n[1], N)} - ${fr(z, f.total)} = ${fr(g[1], d)}. Gaining ratio = ${rt(lowestTerms(g))}`,
      freshWhy: `The new ratio of ${who} is the one they agreed, ${rt(n)}`,
    };
  }
  const w = lowestTerms(f.stayOld);
  return {
    w,
    fresh: w,
    text: `no new profit-sharing ratio is agreed between ${who}`,
    why: `With nothing agreed, ${who} gain in their old ratio, ${rt(w)}`,
    freshWhy: `With nothing agreed, ${who} keep their old ratio between them, ${rt(w)}`,
  };
}

/** The outgoing partner's share of the goodwill of the firm, and what each continuing partner pays of it. */
export function goodwillParts(f: Firm, g: Gain, G: number): { s: number; parts: number[] } {
  const s = (G * f.x) / f.total;
  return { s, parts: g.w.map((v) => (s * v) / sum(g.w)) };
}

/** The sentence of an opening or a data panel that says how goodwill is treated. */
export const goodwillRule = (inBooks: boolean): string =>
  inBooks
    ? 'The goodwill in the books is written off first; the goodwill of the firm, at its new value, is then adjusted through the capital accounts, so that no Goodwill A/c remains in the books.'
    : 'Goodwill is adjusted through the capital accounts, without opening Goodwill A/c.';

export function stepGoodwillOff(f: Firm, E: number): Step {
  const parts = inOld(f, E);
  return {
    text: 'Write off the goodwill that appears in the books.',
    lines: [...f.names.map((name, i) => dr(partnerCapital(name), parts[i])), cr('goodwill', E)],
    explanation: [
      `The goodwill in the books belongs to the time when all three were partners, so all of them bear it in the old ratio ${rt(f.old)}: ${named(f.names, parts)}.`,
      `The capital accounts are debited and Goodwill A/c is credited with ${inr(E)}, which closes it.`,
    ],
  };
}

export function stepGoodwill(f: Firm, g: Gain, G: number): Step {
  const { s, parts } = goodwillParts(f, g, G);
  const payers = f.stay.map((name, i) => ({ name, amount: parts[i], term: g.w[i] })).filter((p) => p.amount > 0);
  return {
    text: `Adjust ${f.out}'s share of the goodwill of the firm.`,
    lines: [...payers.map((p) => dr(partnerCapital(p.name), p.amount)), cr(partnerCapital(f.out), s)],
    explanation: [
      `${f.out}'s share of goodwill = ${inr(G)} x ${fr(f.x, f.total)} = ${inr(s)}.`,
      `${g.why}.`,
      payers.length === 1
        ? `${payers[0].name}'s Capital A/c is debited with the whole ${inr(s)}.`
        : `The capital accounts of the partners who gain are debited: ${payers.map((p) => `${p.name} ${inr(s)} x ${fr(p.term, sum(g.w))} = ${inr(p.amount)}`).join('; ')}.`,
      `${f.out}'s Capital A/c is credited with ${inr(s)}. No Goodwill A/c is opened.`,
    ],
  };
}

/** A reserve, an accumulated profit or an accumulated loss: its account, the row that states it and what is done with it. */
export interface Accumulated {
  id: string;
  name: string;
  row: string;
  credit: boolean;
  text: string;
  what: string;
  /** What the outgoing partner's part of it is called in the working of the amount due. */
  share: string;
}
export const ACCUMULATED: Record<'reserve' | 'profit' | 'loss' | 'advert', Accumulated> = {
  reserve: { id: 'generalReserve', name: 'General Reserve A/c', row: 'General Reserve', credit: true, text: 'Distribute the whole of the General Reserve among all the partners.', what: 'The General Reserve is profit that was set aside', share: 'share of the General Reserve' },
  profit: {
    id: 'profitAndLoss', name: 'Profit and Loss A/c', row: 'Profit and Loss A/c (credit balance)', credit: true, text: 'Distribute the whole of the credit balance of Profit and Loss A/c among all the partners.',
    what: 'The credit balance of Profit and Loss A/c is profit that was earned', share: 'share of the balance of Profit and Loss A/c',
  },
  loss: {
    id: 'profitAndLoss', name: 'Profit and Loss A/c', row: 'Profit and Loss A/c (debit balance)', credit: false, text: 'Write off the whole of the debit balance of Profit and Loss A/c to the capital accounts of all the partners.',
    what: 'The debit balance of Profit and Loss A/c is a loss that was suffered', share: 'share of the debit balance of Profit and Loss A/c',
  },
  advert: {
    id: 'advertisementSuspense', name: 'Advertisement Suspense A/c', row: 'Advertisement Suspense A/c', credit: false, text: 'Write off the whole of Advertisement Suspense A/c to the capital accounts of all the partners.',
    what: 'Advertisement Suspense is an expense, not yet written off, that was incurred', share: 'share of Advertisement Suspense',
  },
};

export function stepAccumulated(f: Firm, a: Accumulated, amount: number): Step {
  const parts = inOld(f, amount);
  const capitals = f.names.map((name, i) => (a.credit ? cr : dr)(partnerCapital(name), parts[i]));
  return {
    text: a.text,
    lines: a.credit ? [dr(a.id, amount), ...capitals] : [...capitals, cr(a.id, amount)],
    explanation: [
      `${a.what} while ${f.out} was a partner, so all the partners ${a.credit ? 'share' : 'bear'} it in the old ratio ${rt(f.old)}: ${named(f.names, parts)}.`,
      a.credit
        ? `${a.name} is debited with ${inr(amount)}, which closes it, and the capital accounts are credited.`
        : `The capital accounts are debited and ${a.name} is credited with ${inr(amount)}, which closes it.`,
    ],
  };
}

/** The entry that closes Revaluation A/c; `V` is its profit, or its loss as a negative figure, and `how` says how it is found. */
export function stepRevaluation(f: Firm, V: number, how: string): Step {
  const profit = V > 0;
  const parts = inOld(f, Math.abs(V));
  const capitals = f.names.map((name, i) => (profit ? cr : dr)(partnerCapital(name), parts[i]));
  return {
    text: 'Close Revaluation A/c by transferring its profit or loss.',
    lines: profit ? [dr('revaluation', V), ...capitals] : [...capitals, cr('revaluation', -V)],
    explanation: [
      how,
      `The values changed while ${f.out} was a partner, so all the partners share the ${profit ? 'profit' : 'loss'} in the old ratio ${rt(f.old)}: ${named(f.names, parts)}.`,
      profit ? 'Revaluation A/c is debited to close it and the capital accounts are credited.' : 'The capital accounts are debited and Revaluation A/c is credited to close it.',
    ],
  };
}

/** How the amount due to a retiring partner is settled: by cheque, as a loan, or partly each. */
export type Settle = { kind: 'bank' } | { kind: 'loan' } | { kind: 'part'; paid: number };

export const settleSays = (f: Firm, s: Settle): string =>
  s.kind === 'bank'
    ? `The amount due to ${f.out} is paid at once by cheque.`
    : s.kind === 'loan'
      ? `The amount due to ${f.out} is transferred to ${f.out}'s Loan A/c.`
      : `${inr(s.paid)} of the amount due to ${f.out} is paid at once by cheque and the balance is transferred to ${f.out}'s Loan A/c.`;

/** The entry that closes the retiring partner's capital account; `working` is how the amount due is made up. */
export function stepSettle(f: Firm, due: number, s: Settle, working: string): Step {
  const paid = s.kind === 'bank' ? due : s.kind === 'part' ? s.paid : 0;
  return {
    text: `Settle the amount due to ${f.out} as agreed.`,
    lines: [dr(partnerCapital(f.out), due), ...(paid > 0 ? [cr('bank', paid)] : []), ...(due > paid ? [cr(partnerLoan(f.out), due - paid)] : [])],
    explanation: [
      `Amount due to ${f.out} = ${working} = ${inr(due)}.`,
      `${f.out}'s Capital A/c is debited with ${inr(due)}, which closes it: ${f.out} is no longer a partner.`,
      ...(paid > 0 ? [`The cheque is credited to Bank A/c: ${inr(paid)}.`] : []),
      ...(due > paid
        ? [
            s.kind === 'part'
              ? `What is not paid, ${inr(due)} - ${inr(paid)} = ${inr(due - paid)}, is credited to ${f.out}'s Loan A/c: the firm now owes it as a loan.`
              : `Nothing is paid now, so the whole ${inr(due)} is credited to ${f.out}'s Loan A/c: the firm owes it as a loan.`,
          ]
        : []),
    ],
  };
}

export const SET_HINTS = {
  retire: [
    'Take the items one at a time: does the item belong to all three partners, or is it paid for by the partners who gain?',
    'Reserves, accumulated profits and losses, goodwill in the books and the result of revaluation go to all the partners in the old ratio; the share of goodwill of the partner who leaves is debited to the partners who gain, in the gaining ratio.',
  ],
  death: [
    "Everything due is first gathered in the deceased partner's Capital A/c. Count the months from 1 April to the date of death.",
    "Interest on capital and the share of profit are for the months up to the date of death; the share of profit goes through Profit and Loss Suspense A/c, and the balance of the capital account goes to the Executor's A/c.",
  ],
};

// ---- Reading a set back (the independent half of the `verify` of every set) ----

/** What each continuing partner gains, as a part of the whole profit, from the wording of the opening; null when it cannot be read. */
export function readGain(text: string, g: Read): number[] | null {
  const ratio = (m: RegExpExecArray): number[] => (m[2] ? [Number(m[2]), Number(m[3])] : [1, 1]);
  const agreed = /agree to share future profits (equally|in the ratio (\d+):(\d+))/.exec(text);
  if (agreed) return ratio(agreed).map((v, i, n) => v / sum(n) - g.stayShare[i]);
  const one = /([A-Z][a-z]+) takes over the whole of/.exec(text);
  if (one) return g.stay.map((name) => (name === one[1] ? g.x : 0));
  const split = /take over [A-Z][a-z]+'s share (equally|in the ratio (\d+):(\d+))/.exec(text);
  if (split) return ratio(split).map((v, i, n) => (g.x * v) / sum(n));
  return /no new profit-sharing ratio is agreed/.test(text) ? g.stayShare.map((v) => (g.x * v) / sum(g.stayShare)) : null;
}

/** The net of an account after the entries of a set, in rupees: a debit is positive. */
const netOf = (ledger: Ledger, accountId: string): number => (ledger.get(accountId) ?? 0) / 100;

/**
 * A set on a retirement worked again from its own text: the firm, the gaining ratio and every figure are read from
 * the opening, the shares, the amount due, the capitals in the new ratio and the first instalment are worked out from
 * them, and the accounts the entries leave must stand as that working says.
 */
function retirementHolds(q: JournalSetQuestion): boolean {
  const [, first = '', ...rows] = q.prompt.split('\n');
  const g = readFirm(first);
  const gain = g && readGain(first, g);
  if (!g || !gain) return false;
  const row = (label: RegExp): number => {
    const line = rows.find((l) => label.test(l));
    return line === undefined ? 0 : amountsIn(line)[0];
  };
  const K = g.names.map((name) => row(new RegExp(`^${name}'s Capital A/c \\(credit balance\\)`)));
  const reserve = row(/^General Reserve/);
  const pl = row(/^Profit and Loss A\/c \(credit balance\)/) - row(/^Profit and Loss A\/c \(debit balance\)/);
  const advert = row(/^Advertisement Suspense A\/c/);
  const E = row(/^Goodwill appearing in the books/);
  const G = row(/^Goodwill of the firm/);
  // The result of revaluation: stated, or the two sides of the account, or the changes listed one to a row.
  const stated = row(/^Profit on revaluation/) - row(/^Loss on revaluation/) + row(/total of the credit side/) - row(/total of the debit side/);
  const listed = sum(rows.map((l) => revalSign(l) * (amountsIn(l)[0] ?? 0)));
  const pool = reserve + pl - advert - E + stated + listed;
  const o = g.names.indexOf(g.out);
  const due = K[o] + (pool + G) * g.x;
  const part = /(₹[\d,]+) of the amount due to/.exec(first);
  const cheque = part ? amountsIn(part[1])[0] : /is paid at once by cheque/.test(first) ? due : 0;
  const loan = due - cheque;
  const count = intIn(first, /repaid in (\d+) equal annual instalments/);
  const interest = Number.isNaN(count) ? 0 : (loan * intIn(first, /interest at (\d+)% p\.a\./)) / 100;
  const instalment = Number.isNaN(count) ? 0 : loan / count;
  // The capitals of the continuing partners after the adjustments, and the cash that brings them to the new ratio.
  const adjusted = g.stay.map((name, i) => K[g.names.indexOf(name)] + pool * g.stayShare[i] - G * gain[i]);
  const fixed = /capital of the new firm is then fixed at (₹[\d,]+)/.exec(first);
  const total = fixed ? amountsIn(fixed[1])[0] : /total of their two capitals after these adjustments is the capital of the new firm/.test(first) ? sum(adjusted) : null;
  const fresh = g.stayShare.map((v, i) => v + gain[i]);
  const cash = adjusted.map((v, i) => (total === null ? 0 : (total * fresh[i]) / sum(fresh) - v));
  const ledger = post(q.entries.map((e) => e.expected));
  const net = (accountId: string): number => netOf(ledger, accountId);
  return (
    setHolds()(q) &&
    near(net(partnerCapital(g.out)), K[o]) &&
    g.stay.every((name, i) => near(-net(partnerCapital(name)), pool * g.stayShare[i] - G * gain[i] + cash[i])) &&
    near(-net(partnerLoan(g.out)), loan - instalment) &&
    near(net('bank'), sum(cash) - cheque - instalment - interest) &&
    near(net('interestOnLoan'), interest) &&
    near(net('goodwill'), -E) &&
    near(net('generalReserve'), reserve) &&
    near(net('profitAndLoss'), pl) &&
    near(net('advertisementSuspense'), -advert) &&
    near(net('revaluation'), stated)
  );
}

// 1. ret-set-goodwill: goodwill on retirement through the capital accounts of the partners who gain, the goodwill in
//    the books written off first in two shapes of three, with a reserve and the settlement of the amount due (easy)
const setGoodwill = journalSetTemplate({
  id: 'ret-set-goodwill', topicId: T, conceptId: 'ret-sets', difficulty: 'easy',
  generate: (rng) =>
    attempt(8, () => {
      const f = firm(rng);
      const g = gainOf(rng, f, ['silent', 'silent', 'split', 'split', 'one']);
      if (!g) return null;
      const shape = rng.pick(['reserve', 'books', 'both'] as const);
      const G = mult(rng, f.total * sum(g.w) * 1000, 60000, 720000);
      const E = shape === 'reserve' ? 0 : mult(rng, f.total * 1000, 20000, 120000);
      const acc = shape === 'books' ? null : rng.pick([ACCUMULATED.reserve, ACCUMULATED.reserve, ACCUMULATED.profit]);
      const R = acc ? mult(rng, f.total * 1000, 30000, 240000) : 0;
      if (G === null || E === null || R === null || E >= G) return null;
      const K = rng.step(150000, 600000, 10000);
      const settle: Settle = rng.pick<Settle>([{ kind: 'loan' }, { kind: 'bank' }]);
      const part = (v: number): number => (v * f.x) / f.total;
      const due = K - part(E) + part(G) + part(R);
      const steps: Step[] = [
        ...(E > 0 ? [stepGoodwillOff(f, E)] : []),
        stepGoodwill(f, g, G),
        ...(acc ? [stepAccumulated(f, acc, R)] : []),
        stepSettle(f, due, settle, tally(K, [['share of the goodwill written off', -part(E)], ['share of goodwill', part(G)], [acc?.share ?? '', part(R)]])),
      ];
      const rows = [
        `${f.out}'s Capital A/c (credit balance): ${inr(K)}`,
        ...(E > 0 ? [`Goodwill appearing in the books: ${inr(E)}`] : []),
        `Goodwill of the firm, valued for the retirement: ${inr(G)}`,
        ...(acc ? [`${acc.row}: ${inr(R)}`] : []),
      ];
      return {
        task: `Pass the necessary journal entries on ${f.out}'s retirement.`,
        opening: [`${intro(rng, f)} ${FLUCTUATING} ${CLOSES} ${f.out} retires on ${RETIRE_ON}; ${g.text}. ${goodwillRule(E > 0)} ${settleSays(f, settle)} On that date:`, ...rows].join('\n'),
        transactions: lettered(steps),
        hints: SET_HINTS.retire,
        distractorAccounts: [...(E > 0 ? [] : ['goodwill']), 'premiumForGoodwill', 'revaluation', partnerCurrent(f.out), executor(f.out)],
      };
    }),
  verify: retirementHolds,
});

/** A change in the value of an asset or a liability agreed on revaluation, as a set states it: by its amount. */
interface SetChange {
  accountId: string;
  name: string;
  text: (a: string) => string;
  /** Why the account is credited (a fall) or debited (a rise). */
  note: string;
}
const SET_FALLS: SetChange[] = [
  { accountId: 'stock', name: 'Stock A/c', text: (a) => `Stock is to be reduced in value by ${a}.`, note: 'the asset falls in value' },
  { accountId: 'machinery', name: 'Machinery A/c', text: (a) => `Machinery is to be depreciated by ${a}.`, note: 'the asset falls in value' },
  { accountId: 'provisionForDoubtfulDebts', name: 'Provision for Doubtful Debts A/c', text: (a) => `A provision for doubtful debts of ${a} is to be created.`, note: 'a provision is set against the debtors' },
  { accountId: 'outstandingExpenses', name: 'Outstanding Expenses A/c', text: (a) => `Outstanding expenses of ${a}, not yet in the books, are to be provided for.`, note: 'a liability comes into the books' },
];
const SET_RISES: SetChange[] = [
  { accountId: 'building', name: 'Building A/c', text: (a) => `Building is to be appreciated by ${a}.`, note: 'the asset rises in value' },
  { accountId: 'creditors', name: 'Creditors A/c', text: (a) => `Creditors of ${a} are not to be paid and are to be written back.`, note: 'the liability falls' },
  { accountId: 'investments', name: 'Investments A/c', text: (a) => `Investments of ${a}, not yet in the books, are to be recorded.`, note: 'an asset comes into the books' },
];

/** The one entry that records two changes of the same kind in Revaluation A/c: two losses, or two gains. */
function stepRecord(items: readonly { c: SetChange; amount: number }[], fall: boolean): Step {
  const total = sum(items.map((i) => i.amount));
  const each = items.map((i) => `${i.c.name} with ${inr(i.amount)} (${i.c.note})`).join(' and ');
  return {
    text: 'Record the changes in values agreed on revaluation.',
    lines: fall ? [dr('revaluation', total), ...items.map((i) => cr(i.c.accountId, i.amount))] : [...items.map((i) => dr(i.c.accountId, i.amount)), cr('revaluation', total)],
    explanation: fall
      ? [`Both changes are losses, so Revaluation A/c is debited with ${items.map((i) => inr(i.amount)).join(' + ')} = ${inr(total)}.`, `The accounts are credited: ${each}.`]
      : [`Both changes are gains. The accounts are debited: ${each}.`, `Revaluation A/c is credited with ${items.map((i) => inr(i.amount)).join(' + ')} = ${inr(total)}.`],
  };
}

/**
 * The result of revaluation as a set gives it when the changes are already in Revaluation A/c: stated outright, or
 * as the totals of the two sides of the account. `V` is the profit, or the loss as a negative figure.
 */
function revaluationGiven(rng: Rng, V: number): { rows: string[]; how: string } {
  const profit = V > 0;
  const result = Math.abs(V);
  if (rng.int(0, 1) === 0) return { rows: [`${profit ? 'Profit' : 'Loss'} on revaluation: ${inr(result)}`], how: `Revaluation A/c shows a ${profit ? 'profit' : 'loss'} of ${inr(result)}.` };
  const small = rng.step(20000, 90000, 5000);
  const big = small + result;
  return {
    rows: [`Revaluation A/c, total of the debit side: ${inr(profit ? small : big)}`, `Revaluation A/c, total of the credit side: ${inr(profit ? big : small)}`],
    how: `The ${profit ? 'credit' : 'debit'} side of Revaluation A/c is the larger: a ${profit ? 'profit' : 'loss'} of ${inr(big)} - ${inr(small)} = ${inr(result)}.`,
  };
}
const REVALUED = 'The changes in the values of the assets and liabilities are already in Revaluation A/c, which is still to be closed.';

// 2. ret-set-retirement: the entries of a retirement at the year end: the reserve (and in one shape a second
//    accumulated profit or loss), the result of revaluation (from the two sides of the account, or after the entry
//    that records two changes), goodwill, and the amount due transferred to the loan account, a part of it paid at
//    once in half the seeds (medium)
const setRetirement = journalSetTemplate({
  id: 'ret-set-retirement', topicId: T, conceptId: 'ret-sets', difficulty: 'medium',
  generate: (rng) =>
    attempt(10, () => {
      const f = firm(rng);
      const g = gainOf(rng, f, ['silent', 'split', 'agreed']);
      if (!g) return null;
      const unit = f.total * 1000;
      const shape = rng.pick(['given', 'second', 'items'] as const);
      const R = mult(rng, unit, 30000, 240000);
      const result = mult(rng, unit, 10000, 90000);
      const G = mult(rng, f.total * sum(g.w) * 1000, 60000, 720000);
      const second = shape === 'second' ? rng.pick([ACCUMULATED.profit, ACCUMULATED.loss, ACCUMULATED.advert]) : null;
      const P = second ? mult(rng, unit, 15000, 120000) : 0;
      if (R === null || result === null || G === null || P === null) return null;
      const profit = rng.int(0, 1) === 0;
      const V = profit ? result : -result;
      const K = rng.step(150000, 600000, 10000);
      const part = (v: number): number => (v * f.x) / f.total;
      const extra = second ? (second.credit ? P : -P) : 0;
      const due = K + part(R) + part(extra) + part(V) + part(G);
      const paid = rng.int(0, 1) === 0 ? clean(rng, 50000, due - 100000, 10000, (v) => v <= 0.6 * due) : null;
      const settle: Settle = paid === null ? { kind: 'loan' } : { kind: 'part', paid };
      let revaluation: { rows: string[]; steps: Step[] };
      if (shape === 'items') {
        // Two changes of one kind, recorded by one entry: together they are the whole result.
        const [c1, c2] = rng.shuffle(profit ? SET_RISES : SET_FALLS);
        const a1 = 1000 * rng.int(Math.ceil((0.3 * result) / 1000), Math.floor((0.7 * result) / 1000));
        const a2 = result - a1;
        const items = [
          { c: c1, amount: a1 },
          { c: c2, amount: a2 },
        ];
        const side = profit ? 'credit' : 'debit';
        revaluation = {
          rows: items.map((i) => i.c.text(inr(i.amount))),
          steps: [stepRecord(items, !profit), stepRevaluation(f, V, `Revaluation A/c now has ${inr(result)} on its ${side} side and nothing on the other: a ${profit ? 'profit' : 'loss'} of ${inr(result)}.`)],
        };
      } else {
        const given = revaluationGiven(rng, V);
        revaluation = { rows: given.rows, steps: [stepRevaluation(f, V, given.how)] };
      }
      const steps: Step[] = [
        ...revaluation.steps,
        stepAccumulated(f, ACCUMULATED.reserve, R),
        ...(second ? [stepAccumulated(f, second, P)] : []),
        stepGoodwill(f, g, G),
        stepSettle(
          f,
          due,
          settle,
          tally(K, [[`share of the ${profit ? 'profit' : 'loss'} on revaluation`, part(V)], [ACCUMULATED.reserve.share, part(R)], [second?.share ?? '', part(extra)], ['share of goodwill', part(G)]]),
        ),
      ];
      const rows = [
        `${f.out}'s Capital A/c (credit balance): ${inr(K)}`,
        `General Reserve: ${inr(R)}`,
        ...(second ? [`${second.row}: ${inr(P)}`] : []),
        `Goodwill of the firm, valued for the retirement: ${inr(G)}`,
        ...revaluation.rows,
      ];
      const lead = shape === 'items' ? 'On that date the balances, and the changes in values agreed on revaluation, are:' : `${REVALUED} On that date:`;
      return {
        task: `Pass the necessary journal entries on ${f.out}'s retirement.`,
        opening: [`${intro(rng, f)} ${FLUCTUATING} ${CLOSES} ${f.out} retires on ${RETIRE_ON}; ${g.text}. ${goodwillRule(false)} ${settleSays(f, settle)} ${lead}`, ...rows].join('\n'),
        transactions: lettered(steps),
        hints: SET_HINTS.retire,
        distractorAccounts: ['goodwill', 'premiumForGoodwill', 'profitAndLossAppropriation', partnerCurrent(f.out), executor(f.out)],
      };
    }),
  verify: retirementHolds,
});

/**
 * A set on a death worked again from its own text: the months, the interest on capital, the share of profit on the
 * basis the opening names, the share of goodwill and the amount that goes to the executor.
 */
function deathSetHolds(q: JournalSetQuestion): boolean {
  const [, first = '', ...rows] = q.prompt.split('\n');
  const g = readFirm(first);
  const gain = g && readGain(first, g);
  if (!g || !gain) return false;
  const text = rows.join('\n');
  const row = (label: RegExp): number => {
    const amount = rowAmount(text, label);
    return Number.isNaN(amount) ? 0 : amount;
  };
  const m = monthsFromApril(dateIn(first, 'died on '));
  const K = row(/capital on 1 April 2025/);
  const interest = (K * intIn(text, /Interest on capital: (\d+)%/) * m) / 1200;
  const bySales = /on the sales of that period/.test(first);
  const profit = bySales ? (row(/^Sales from 1 April/) * row(/^Profit for the year/) * g.x) / row(/^Sales for the year/) : (row(/^Profit for the year/) * m * g.x) / 12;
  const G = row(/^Goodwill of the firm/);
  const R = row(/^General Reserve/);
  const drawn = row(/drawings from 1 April 2025/);
  const due = K + interest + profit + (G + R) * g.x - drawn;
  const ledger = post(q.entries.map((e) => e.expected));
  const net = (accountId: string): number => netOf(ledger, accountId);
  return (
    setHolds()(q) &&
    m >= 1 &&
    near(net(partnerCapital(g.out)), K) &&
    near(-net(executor(g.out)), due) &&
    near(net('interestOnCapital'), interest) &&
    near(net('profitAndLossSuspense'), profit) &&
    near(net('generalReserve'), R) &&
    near(-net(partnerDrawings(g.out)), drawn) &&
    g.stay.every((name, i) => near(net(partnerCapital(name)), G * gain[i] - R * g.stayShare[i]))
  );
}

// 3. ret-set-death: a partner dies during the year: interest on capital and the share of profit to the date of
//    death (through Profit and Loss Suspense A/c; on the basis of time in half the seeds, of sales in the others),
//    goodwill, in two shapes of three a reserve or the drawings, and the transfer to the executor's account (medium)
const setDeath = journalSetTemplate({
  id: 'ret-set-death', topicId: T, conceptId: 'ret-sets', difficulty: 'medium',
  // 2: the opening names the account that interest on capital to the date of death goes through.
  version: 2,
  generate: (rng) =>
    attempt(10, () => {
      const f = firm(rng);
      const g = gainOf(rng, f, ['silent', 'silent', 'split', 'agreed']);
      if (!g) return null;
      const date = rng.pick(DATES_2025);
      const m = date.months;
      const K = 60000 * rng.int(2, 10);
      // A rate at which the interest for the months is in round hundreds of rupees (an even rate always is).
      const r = rng.pick([5, 6, 8, 10, 12].filter((v) => (K * v * m) % 120000 === 0));
      const interest = (K * r * m) / 1200;
      const G = mult(rng, f.total * sum(g.w) * 1000, 60000, 720000);
      const bySales = rng.int(0, 1) === 0;
      const rate = rng.pick([8, 10, 12, 15, 20, 25]);
      const S = 100000 * rng.int(8, 30);
      const P = bySales ? (S * rate) / 100 : profitForTime(rng, f, m);
      const S2 = bySales ? salesForShare(rng, f, S, m, rate) : 0;
      const extra = rng.pick(['none', 'reserve', 'drawings'] as const);
      const R = extra === 'reserve' ? mult(rng, f.total * 1000, 30000, 200000) : 0;
      if (G === null || P === null || S2 === null || R === null) return null;
      const drawn = extra === 'drawings' ? rng.step(10000, 60000, 2000) : 0;
      const profit = bySales ? (S2 * rate * f.x) / (100 * f.total) : (P * m * f.x) / (12 * f.total);
      const part = (v: number): number => (v * f.x) / f.total;
      const due = K + interest + profit + part(G) + part(R) - drawn;
      const capital = partnerCapital(f.out);
      const steps: Step[] = [
        ...(R > 0 ? [stepAccumulated(f, ACCUMULATED.reserve, R)] : []),
        {
          text: `Allow interest on ${f.out}'s capital up to the date of death.`,
          lines: [dr('interestOnCapital', interest), cr(capital, interest)],
          explanation: [
            `1 April 2025 to ${date.text} is ${m} months.`,
            `Interest on capital = ${inr(K)} x ${r}% x ${m}/12 = ${inr(interest)}.`,
            `Interest on Capital A/c is debited and ${f.out}'s Capital A/c is credited.`,
          ],
        },
        {
          text: `Credit ${f.out} with the share of profit up to the date of death.`,
          lines: [dr('profitAndLossSuspense', profit), cr(capital, profit)],
          explanation: [
            ...(bySales
              ? [`Rate of profit on sales last year = ${inr(P)} / ${inr(S)} x 100 = ${rate}%.`, `Profit of the firm on the sales up to the date of death = ${inr(S2)} x ${rate}% = ${inr((S2 * rate) / 100)}; ${f.out}'s share = ${inr((S2 * rate) / 100)} x ${fr(f.x, f.total)} = ${inr(profit)}.`]
              : [`${f.out}'s share for the ${m} months = ${inr(P)} x ${m}/12 x ${fr(f.x, f.total)} = ${inr(profit)}.`]),
            `The accounts of the year are not yet closed, so the estimated share is debited to Profit and Loss Suspense A/c and credited to ${f.out}'s Capital A/c.`,
          ],
        },
        stepGoodwill(f, g, G),
        ...(drawn > 0
          ? [
              {
                text: `Close ${f.out}'s Drawings A/c.`,
                lines: [dr(capital, drawn), cr(partnerDrawings(f.out), drawn)],
                explanation: [`What ${f.out} drew during the year reduces what the firm owes: ${f.out}'s Capital A/c is debited with ${inr(drawn)} and ${f.out}'s Drawings A/c is credited, which closes it.`],
              },
            ]
          : []),
        {
          text: `Transfer the amount due to ${f.out}'s executor.`,
          lines: [dr(capital, due), cr(executor(f.out), due)],
          explanation: [
            `Amount due = ${tally(K, [[ACCUMULATED.reserve.share, part(R)], ['interest on capital', interest], ['share of profit', profit], ['share of goodwill', part(G)], ['drawings', -drawn]])} = ${inr(due)}.`,
            `${f.out}'s Capital A/c is debited with ${inr(due)}, which closes it, and ${f.out}'s Executor's A/c is credited: the firm now owes the amount to the executor.`,
          ],
        },
      ];
      const basis = bySales ? `${BASIS_SALES}, at the rate of profit on sales earned in the previous year.` : `${BASIS_TIME} from the profit of the previous year.`;
      const rows = [
        `${f.out}'s capital on 1 April 2025: ${inr(K)}`,
        `Interest on capital: ${r}% p.a.`,
        ...(bySales ? salesRows(S, P, S2).split('\n') : [`Profit for the year ended 31 March 2025: ${inr(P)}`]),
        `Goodwill of the firm, valued on the death: ${inr(G)}`,
        ...(R > 0 ? [`General Reserve: ${inr(R)}`] : []),
        ...(drawn > 0 ? [`${f.out}'s drawings from 1 April 2025 to the date of death: ${inr(drawn)}`] : []),
      ];
      return {
        task: `Pass the necessary journal entries on ${f.out}'s death.`,
        opening: [
          `${intro(rng, f)} ${FLUCTUATING} ${CLOSES} ${f.out} died on ${date.text}; ${g.text}. ${basis} Interest on capital is allowed up to the date of death and is recorded through Interest on Capital A/c. ${goodwillRule(false)} The amount due is transferred to ${f.out}'s Executor's A/c.`,
          ...rows,
        ].join('\n'),
        transactions: lettered(steps),
        hints: SET_HINTS.death,
        distractorAccounts: ['profitAndLossAppropriation', 'goodwill', partnerLoan(f.out), 'profitAndLoss', 'interestOnLoan'],
      };
    }),
  verify: deathSetHolds,
});

// 4. ret-set-whole-retirement: a whole retirement: goodwill in the books (one seed in three), the result of
//    revaluation, the reserve, goodwill, the loan, the capitals of the continuing partners brought to the new ratio
//    with cash brought in or withdrawn, and a year later the interest on the loan and its first instalment (complex)
const setWholeRetirement = journalSetTemplate({
  id: 'ret-set-whole-retirement', topicId: T, conceptId: 'ret-sets', difficulty: 'complex',
  generate: (rng) =>
    attempt(12, () => {
      const f = firm(rng);
      const g = gainOf(rng, f, ['silent', 'split', 'agreed', 'agreed']);
      if (!g) return null;
      const who = list(f.stay);
      const unit = f.total * 1000;
      const N = sum(g.fresh);
      // The capitals are worked out in the new ratio, so a ratio such as 19:31 is left to the questions on ratios.
      if (N > 20) return null;
      // Total of the two capitals kept: two entries (one partner pays in, the other draws out). A total fixed
      // above them: one entry, both paying in. The set has six to eight entries either way.
      const capMode = rng.pick(['sum', 'fixed'] as const);
      const hasReserve = rng.int(0, 2) > 0;
      const hasOff = rng.int(0, 2) === 0 && !(capMode === 'sum' && hasReserve);
      const R = hasReserve ? mult(rng, unit, 30000, 240000) : 0;
      const E = hasOff ? mult(rng, unit, 20000, 100000) : 0;
      const result = mult(rng, unit, 10000, 90000);
      const G = mult(rng, f.total * sum(g.w) * 1000, 60000, 720000);
      if (R === null || E === null || result === null || G === null || E >= G) return null;
      const profit = rng.int(0, 1) === 0;
      const V = profit ? result : -result;
      const pool = R - E + V;
      const share = inOld(f, pool);
      const { s, parts: gw } = goodwillParts(f, g, G);
      const o = f.names.indexOf(f.out);
      const at = f.stay.map((name) => f.names.indexOf(name));
      // The loan: the retiring partner's capital is chosen so that the instalment is in ten thousands of rupees, and
      // the interest of the year is then in round hundreds.
      const count = rng.pick([2, 3, 4, 5]);
      const rate = rng.pick([8, 9, 10, 12]);
      const fits = (v: number): boolean => (v + share[o] + s) % (count * 10000) === 0;
      const Kout = clean(rng, 150000, 600000, 5000, fits) ?? clean(rng, 150000, 600000, 1000, fits);
      if (Kout === null) return null;
      const loan = Kout + share[o] + s;
      const instalment = loan / count;
      const interest = (loan * rate) / 100;
      // The capitals of the continuing partners, near the new ratio so that the cash to adjust them is modest.
      const base = rng.step(400000, 900000, 50000);
      const near10 = (v: number): number => Math.round(v / 10000) * 10000;
      const K0 = Math.max(100000, near10((base * g.fresh[0]) / N) + 10000 * rng.int(-3, 3));
      const mid = Math.max(100000, near10((base * g.fresh[1]) / N));
      const adjusted0 = K0 + share[at[0]] - gw[0];
      const adjusted1 = (v: number): number => v + share[at[1]] - gw[1];
      let K1: number | null;
      let total: number | null;
      if (capMode === 'sum') {
        // The cash that passes is in whole thousands where a capital in the range gives that, in five hundreds otherwise.
        const ok = (unit: number) => (v: number): boolean => {
          const d = ((adjusted0 + adjusted1(v)) * g.fresh[0]) / N - adjusted0;
          return v >= 80000 && Number.isInteger(d) && d % unit === 0 && Math.abs(d) >= 5000;
        };
        K1 = roundest([1000, 500], (unit) => clean(rng, mid - 40000, mid + 40000, 5000, ok(unit)) ?? clean(rng, mid - 40000, mid + 40000, 1000, ok(unit)));
        total = K1 === null ? null : adjusted0 + adjusted1(K1);
      } else {
        K1 = mid + 10000 * rng.int(-3, 3);
        const have = [adjusted0, adjusted1(K1)];
        const step = N * 5000;
        total = clean(rng, Math.ceil((sum(have) * 1.02) / step) * step, Math.floor((sum(have) * 1.35) / step) * step, step, (t) => g.fresh.every((n, i) => (t * n) / N - have[i] >= 5000));
      }
      if (K1 === null || total === null || K1 < 80000) return null;
      const K = f.names.map((_, i) => (i === o ? Kout : i === at[0] ? K0 : K1));
      const adjusted = [adjusted0, adjusted1(K1)];
      if (adjusted.some((v) => v < 50000)) return null;
      const need = g.fresh.map((n) => (total * n) / N);
      const cash = need.map((v, i) => v - adjusted[i]);
      if (cash.some((c) => c === 0 || !Number.isInteger(c))) return null;
      const capitals = f.stay.map(partnerCapital);
      const standsAt = (i: number): string =>
        `${tally(K[at[i]], [['goodwill written off', -(E * f.stayOld[i]) / f.total], [`${profit ? 'profit' : 'loss'} on revaluation`, (V * f.stayOld[i]) / f.total], ['General Reserve', (R * f.stayOld[i]) / f.total], [`${f.out}'s goodwill`, -gw[i]]])} = ${inr(adjusted[i])}`;
      const newFirm = capMode === 'sum' ? `Capital of the new firm = ${inr(adjusted[0])} + ${inr(adjusted[1])} = ${inr(total)}.` : `The capital of the new firm is fixed at ${inr(total)}.`;
      const required = (i: number): string => `${f.stay[i]}'s capital should be ${inr(total)} x ${fr(g.fresh[i], N)} = ${inr(need[i])}; after the adjustments it stands at ${standsAt(i)}`;
      const adjust: Step[] = cash.every((c) => c > 0)
        ? [
            {
              text: `Bring the capitals of ${who} to the figures required in the new ratio.`,
              lines: [dr('bank', sum(cash)), cr(capitals[0], cash[0]), cr(capitals[1], cash[1])],
              explanation: [
                `${g.freshWhy}. ${newFirm}`,
                `${required(0)}: a shortfall of ${inr(cash[0])}.`,
                `${required(1)}: a shortfall of ${inr(cash[1])}.`,
                `Both bring in cash: Bank A/c is debited with ${inr(cash[0])} + ${inr(cash[1])} = ${inr(sum(cash))} and each capital account is credited with its shortfall.`,
              ],
            },
          ]
        : f.stay.map(
            (name, i): Step => ({
              text: `Bring ${name}'s capital to the figure required in the new ratio.`,
              lines: cash[i] > 0 ? [dr('bank', cash[i]), cr(capitals[i], cash[i])] : [dr(capitals[i], -cash[i]), cr('bank', -cash[i])],
              explanation: [
                `${g.freshWhy}. ${newFirm}`,
                `${required(i)}.`,
                cash[i] > 0
                  ? `The capital is short by ${inr(cash[i])}: ${name} brings it in, so Bank A/c is debited and ${name}'s Capital A/c is credited.`
                  : `The capital is in surplus by ${inr(-cash[i])}: ${name} withdraws it, so ${name}'s Capital A/c is debited and Bank A/c is credited.`,
              ],
            }),
          );
      const given = revaluationGiven(rng, V);
      const part = (v: number): number => (v * f.x) / f.total;
      const steps: Step[] = [
        ...(E > 0 ? [stepGoodwillOff(f, E)] : []),
        stepRevaluation(f, V, given.how),
        ...(R > 0 ? [stepAccumulated(f, ACCUMULATED.reserve, R)] : []),
        stepGoodwill(f, g, G),
        stepSettle(
          f,
          loan,
          { kind: 'loan' },
          tally(Kout, [['share of the goodwill written off', -part(E)], [`share of the ${profit ? 'profit' : 'loss'} on revaluation`, part(V)], [ACCUMULATED.reserve.share, part(R)], ['share of goodwill', s]]),
        ),
        ...adjust,
        {
          text: `On 31 March 2027, credit the interest of the year to ${f.out}'s Loan A/c.`,
          lines: [dr('interestOnLoan', interest), cr(partnerLoan(f.out), interest)],
          explanation: [
            `The whole loan of ${inr(loan)} was outstanding during the year: interest = ${inr(loan)} x ${rate}% = ${inr(interest)}.`,
            `It is an expense of the firm that is still owed: Interest on Loan A/c is debited and ${f.out}'s Loan A/c is credited.`,
          ],
        },
        {
          text: `On 31 March 2027, pay ${f.out} the first instalment together with the interest of the year.`,
          lines: [dr(partnerLoan(f.out), instalment + interest), cr('bank', instalment + interest)],
          explanation: [
            `Instalment of principal = ${inr(loan)} / ${count} = ${inr(instalment)}.`,
            `The cheque is for ${inr(instalment)} + ${inr(interest)} = ${inr(instalment + interest)}: ${f.out}'s Loan A/c is debited (the firm owes less) and Bank A/c is credited.`,
            `The loan now stands at ${inr(loan)} - ${inr(instalment)} = ${inr(loan - instalment)}.`,
          ],
        },
      ];
      const terms = `The amount due to ${f.out} is transferred to ${f.out}'s Loan A/c, to be repaid in ${count} equal annual instalments of principal, the first on 31 March 2027, each paid by cheque together with interest at ${rate}% p.a. on the balance outstanding during the year; the interest of each year is credited to ${f.out}'s Loan A/c on 31 March, before the payment.`;
      const capitalRule =
        capMode === 'sum'
          ? `The capitals of ${who} are then to be in their new profit-sharing ratio: the total of their two capitals after these adjustments is the capital of the new firm, a shortfall being brought in and a surplus withdrawn by cheque.`
          : `The capital of the new firm is then fixed at ${inr(total)}, to be held by ${who} in their new profit-sharing ratio, a shortfall being brought in and a surplus withdrawn by cheque.`;
      const rows = [
        ...f.names.map((name, i) => `${name}'s Capital A/c (credit balance): ${inr(K[i])}`),
        ...(R > 0 ? [`General Reserve: ${inr(R)}`] : []),
        ...(E > 0 ? [`Goodwill appearing in the books: ${inr(E)}`] : []),
        `Goodwill of the firm, valued for the retirement: ${inr(G)}`,
        ...given.rows,
      ];
      return {
        task: `Pass the necessary journal entries on ${f.out}'s retirement and for the first year of ${f.out}'s loan.`,
        opening: [`${intro(rng, f)} ${FLUCTUATING} ${CLOSES} ${f.out} retires on ${RETIRE_ON}; ${g.text}. ${REVALUED} ${goodwillRule(E > 0)} ${terms} ${capitalRule} On ${RETIRE_ON}:`, ...rows].join('\n'),
        transactions: lettered(steps),
        hints: [
          SET_HINTS.retire[1],
          'For the capitals: find the capital of the new firm, give each continuing partner the part of it that the new ratio allows, and compare it with the capital as it stands after the adjustments. Interest is on the loan outstanding during the year.',
        ],
        distractorAccounts: [...(E > 0 ? [] : ['goodwill']), 'premiumForGoodwill', 'interestOnCapital', partnerCurrent(f.stay[0]), 'cash'],
      };
    }),
  verify: retirementHolds,
});

// ---------------------------------------------------------------------------------------------------------------
// Formats. Every account is written up from the entries of its story with `accountOf`, `columnarAccount` or
// `ledgerPeriods`, and every `verify` works the same figures out by arithmetic from what `generate` drew.
// ---------------------------------------------------------------------------------------------------------------

/** An entry of a format on the day it is passed. */
const on = (date: string, lines: JournalLine[]): DatedEntry => ({ date, lines });
/** The amount of a row in rupees: of its only column, or of the column given. */
const rowRupees = (row: FormatRow | undefined, column = 0): number => (row === undefined ? NaN : row.amounts[column] / 100);
/** The row of a list with these particulars, when there is exactly one. */
const oneRow = (rows: readonly FormatRow[], label: string): FormatRow | undefined => {
  const found = rows.filter((r) => r.label === label);
  return found.length === 1 ? found[0] : undefined;
};
const total = (rows: readonly FormatRow[], column = 0): number => sum(rows.map((r) => r.amounts[column])) / 100;

export type ChangeKind = 'building' | 'machinery' | 'investments' | 'stock' | 'debtors' | 'creditors' | 'outstanding';
/** The order in which the changes of a revaluation are listed: the assets as a balance sheet has them, then the liabilities. */
const CHANGE_ORDER: ChangeKind[] = ['building', 'machinery', 'investments', 'stock', 'debtors', 'creditors', 'outstanding'];

/** A change agreed on revaluation as a format states it: often by a rate, so that the amount has to be worked out. */
export interface Change {
  kind: ChangeKind;
  /** The account that is debited (a gain) or credited (a loss) against Revaluation A/c. */
  accountId: string;
  sign: 1 | -1;
  amount: number;
  /** The balance of the asset or liability in the books before the change; 0 for an item not yet in the books. */
  book: number;
  /** What the balance is called in the list of balances. */
  item: string;
  text: string;
  /** How the amount is found (no full stop). */
  work: string;
}

/** A change of one kind, every amount a multiple of `u` rupees; null when no amount in the range is. */
function changeOf(rng: Rng, kind: ChangeKind, u: number): Change | null {
  const byRate = (accountId: string, item: string, sign: 1 | -1, min: number, max: number, rates: number[], text: (p: number) => string, work: (book: string, p: number, a: string) => string): Change | null => {
    const book = mult(rng, u * 20, min, max);
    const p = rng.pick(rates);
    if (book === null) return null;
    const amount = (book * p) / 100;
    return { kind, accountId, sign, amount, book, item, text: text(p), work: work(inr(book), p, inr(amount)) };
  };
  const byAmount = (accountId: string, item: string, sign: 1 | -1, min: number, max: number, book: number, text: (a: string) => string, work: (a: string) => string): Change | null => {
    const amount = mult(rng, u, min, max);
    return amount === null ? null : { kind, accountId, sign, amount, book, item, text: text(inr(amount)), work: work(inr(amount)) };
  };
  switch (kind) {
    case 'building':
      return byRate('building', 'Building', 1, 300000, 900000, [5, 10, 15, 20], (p) => `Building is to be appreciated by ${p}%.`, (book, p, a) => `Building rises by ${book} x ${p}% = ${a}`);
    case 'machinery':
      return byRate('machinery', 'Machinery', -1, 200000, 600000, [5, 10, 15], (p) => `Machinery is to be depreciated by ${p}%.`, (book, p, a) => `Machinery falls by ${book} x ${p}% = ${a}`);
    case 'debtors':
      return byRate(
        'provisionForDoubtfulDebts', 'Debtors', -1, 60000, 400000, [5, 10],
        (p) => `A provision for doubtful debts of ${p}% is to be created on debtors.`,
        (book, p, a) => `Provision for doubtful debts = ${book} x ${p}% = ${a}`,
      );
    case 'stock': {
      const book = rng.step(120000, 320000, 10000);
      const amount = mult(rng, u, 6000, 40000);
      if (amount === null) return null;
      return rng.int(0, 1) === 0
        ? { kind, accountId: 'stock', sign: -1, amount, book, item: 'Stock', text: `Stock is to be reduced in value by ${inr(amount)}.`, work: `Stock falls by ${inr(amount)}` }
        : { kind, accountId: 'stock', sign: -1, amount, book, item: 'Stock', text: `Stock is to be valued at ${inr(book - amount)}.`, work: `Stock falls by ${inr(book)} - ${inr(book - amount)} = ${inr(amount)}` };
    }
    case 'creditors':
      return byAmount('creditors', 'Creditors', 1, 4000, 30000, rng.step(90000, 240000, 10000), (a) => `Creditors of ${a} are not to be paid and are to be written back.`, (a) => `Creditors fall by ${a}`);
    case 'outstanding':
      return byAmount('outstandingExpenses', 'Outstanding Expenses', -1, 3000, 20000, 0, (a) => `Outstanding expenses of ${a}, not yet in the books, are to be provided for.`, (a) => `Outstanding expenses of ${a} come into the books`);
    case 'investments':
      return byAmount('investments', 'Investments', 1, 10000, 60000, 0, (a) => `Investments of ${a}, not yet in the books, are to be recorded.`, (a) => `Investments of ${a} come into the books`);
  }
}

/** `count` changes of different kinds, in the order of `CHANGE_ORDER`; null when one of them cannot be made. */
export function changesOf(rng: Rng, u: number, count: number, kinds: readonly ChangeKind[] = CHANGE_ORDER): Change[] | null {
  const chosen = new Set(rng.shuffle(kinds).slice(0, count));
  const made = CHANGE_ORDER.filter((k) => chosen.has(k)).map((k) => changeOf(rng, k, u));
  return made.every((c): c is Change => c !== null) ? made : null;
}

export const changeLines = (c: Change): JournalLine[] => (c.sign > 0 ? [dr(c.accountId, c.amount), cr('revaluation', c.amount)] : [dr('revaluation', c.amount), cr(c.accountId, c.amount)]);
/** The entry that closes Revaluation A/c to the capital accounts of all the partners in the old ratio. */
export const revaluationTransfer = (f: Firm, V: number): JournalLine[] => stepRevaluation(f, V, '').lines;
/** "₹18,000 + ₹6,000 = ₹24,000", or the one amount alone. */
export const added = (amounts: readonly number[]): string => (amounts.length === 1 ? inr(amounts[0]) : `${amounts.map(inr).join(' + ')} = ${inr(sum(amounts))}`);

const revaluationKept = keepFor<{ names: string[]; old: number[]; changes: { sign: number; amount: number }[] }>();

/**
 * The row of a Revaluation A/c that transfers a partner's part of its result, in the house form of the three topics
 * on reconstitution: "To Profit transferred to Asha's Capital A/c", "By Loss transferred to Asha's Capital A/c". The
 * shorter "Asha's Capital A/c" is accepted as well (`also`).
 */
export const transferRow = (name: string, profit: boolean): string => `${profit ? 'Profit' : 'Loss'} transferred to ${ledgerLabel(partnerCapital(name))}`;

// 1. ret-fmt-revaluation: the Revaluation Account on a retirement: three or four changes, some stated by a rate or by
//    a new value, and the profit or loss shared by all three partners in the old ratio. In two seeds of three the
//    data also has an item that is no revaluation (the General Reserve, or the value put on goodwill) (easy)
const fmtRevaluation = accountTemplate({
  id: 'ret-fmt-revaluation', topicId: T, conceptId: 'ret-formats', difficulty: 'easy',
  generate: (rng) =>
    attempt(12, () => {
      const f = firm(rng);
      const made = changesOf(rng, f.total * 500, rng.pick([3, 3, 4]));
      if (!made || !made.some((c) => c.sign > 0) || !made.some((c) => c.sign < 0)) return null;
      const gains = made.filter((c) => c.sign > 0);
      const losses = made.filter((c) => c.sign < 0);
      const V = sum(gains.map((c) => c.amount)) - sum(losses.map((c) => c.amount));
      if (V === 0) return null;
      const profit = V > 0;
      const shares = inOld(f, Math.abs(V));
      const extra = rng.pick(['none', 'reserve', 'goodwill'] as const);
      const R = mult(rng, f.total * 1000, 30000, 240000);
      const G = mult(rng, f.total * 1000, 60000, 600000);
      if (R === null || G === null) return null;
      const entries = [...made.map((c) => on(RETIRE_ON, changeLines(c))), on(RETIRE_ON, revaluationTransfer(f, V))];
      // The transfers are written in the house form, and the capital account alone is accepted as other wording.
      const short = new Map(f.names.map((name) => [transferRow(name, profit), ledgerLabel(partnerCapital(name))]));
      const transferOf = new Map(f.names.map((name) => [partnerCapital(name), transferRow(name, profit)]));
      const sides = ledgerSides(accountOf(entries, 'revaluation', null, (id) => transferOf.get(id) ?? ledgerLabel(id)), { closeOn: RETIRE_ON });
      const closed = (rows: FormatRowParts[]): FormatRowParts[] =>
        rows.map((r) => {
          const plain = short.get(r.label);
          return plain === undefined ? r : { ...r, closing: true, also: [plain] };
        });
      const books = made.filter((c) => c.book > 0);
      const data = [
        `${intro(rng, f)} ${FLUCTUATING} ${f.out} retires on ${RETIRE_ON}.`,
        ...(books.length > 0 || extra === 'reserve' ? ['Balances in the books on that date:'] : []),
        ...books.map((c) => `${c.item}: ${inr(c.book)}`),
        ...(extra === 'reserve' ? [`General Reserve: ${inr(R)}`] : []),
        `On ${f.out}'s retirement it is agreed that:`,
        ...made.map((c) => c.text),
        ...(extra === 'goodwill' ? [`The goodwill of the firm is valued at ${inr(G)} and is adjusted through the capital accounts, without opening Goodwill A/c.`] : []),
      ].join('\n');
      revaluationKept.keep(data, { names: f.names, old: f.old, changes: made.map((c) => ({ sign: c.sign, amount: c.amount })) });
      const label = (c: Change): string => ledgerLabel(c.accountId);
      return {
        task: `Prepare the Revaluation Account on ${f.out}'s retirement on ${RETIRE_ON}, closing it by transfer to the capital accounts of the partners.`,
        data,
        title: 'Revaluation A/c',
        left: { ...sides.left, rows: closed(sides.left.rows) },
        right: { ...sides.right, rows: closed(sides.right.rows) },
        // The transfers of the opposite result are on offer too, so that the labels do not say whether it is a profit or a loss.
        distractors: [
          ...f.names.map((name) => transferRow(name, !profit)),
          'Revaluation A/c', 'Balance c/d', 'General Reserve A/c', 'Goodwill A/c', 'Profit and Loss A/c',
          ...(made.some((c) => c.kind === 'debtors') ? ['Debtors A/c'] : []),
        ],
        explanation: [
          ...made.map((c) =>
            c.sign > 0
              ? `${c.work}: a gain, so it is credited ("By ${label(c)}").`
              : `${c.work}: a loss, so it is debited ("To ${label(c)}").`,
          ),
          `Debit side (losses) = ${added(losses.map((c) => c.amount))}; credit side (gains) = ${added(gains.map((c) => c.amount))}.`,
          profit
            ? `The credit side is the larger by ${inr(V)}: a profit on revaluation.`
            : `The debit side is the larger by ${inr(-V)}: a loss on revaluation.`,
          `The values changed while ${f.out} was a partner, so all three share the ${profit ? 'profit' : 'loss'} in the old ratio ${rt(f.old)}: ${named(f.names, shares)}.`,
          profit
            ? `The profit is debited here, a row for each partner ("To ${transferRow(f.names[0], true)}" and so on), and credited to the capital accounts ("By Revaluation A/c (profit)" there). The two sides now agree and the account is closed.`
            : `The loss is credited here, a row for each partner ("By ${transferRow(f.names[0], false)}" and so on), and debited to the capital accounts ("To Revaluation A/c (loss)" there). The two sides now agree and the account is closed.`,
          ...(extra === 'reserve' ? ['The General Reserve is not a change in the value of an asset or a liability: it is distributed by an entry of its own and does not enter Revaluation A/c.'] : []),
          ...(extra === 'goodwill' ? ['Goodwill is adjusted between the capital accounts of the partners: it does not enter Revaluation A/c, and no Goodwill A/c is opened.'] : []),
        ],
        hints: [
          'For each item ask: is the firm better off (an asset up, a liability down) or worse off (an asset down, a liability up)?',
          'Losses are debited and gains are credited. The difference is the profit or loss, shared by all the partners, the retiring partner included, in the old ratio.',
        ],
      };
    }),
  verify: (q) => {
    const kept = revaluationKept.of(q.data);
    if (!kept) return false;
    // Worked from the figures alone: the losses, the gains, and each partner's part of the difference.
    const losses = sum(kept.changes.filter((c) => c.sign < 0).map((c) => c.amount));
    const gains = sum(kept.changes.filter((c) => c.sign > 0).map((c) => c.amount));
    const V = gains - losses;
    const side = V > 0 ? 0 : 1;
    const transfers = q.sides[side].rows.filter((r) => r.closing);
    return (
      V !== 0 &&
      near(total(q.sides[0].rows.filter((r) => !r.closing)), losses) &&
      near(total(q.sides[1].rows.filter((r) => !r.closing)), gains) &&
      q.sides[1 - side].rows.every((r) => !r.closing) &&
      transfers.length === kept.names.length &&
      // Each transfer in the house form, of the profit on the debit side or of the loss on the credit side, with the
      // capital account alone as its one other wording; no other row has another wording.
      kept.names.every((name, i) => {
        const row = oneRow(transfers, `${V > 0 ? 'Profit' : 'Loss'} transferred to ${name}'s Capital A/c`);
        return near(rowRupees(row), (Math.abs(V) * kept.old[i]) / sum(kept.old)) && row?.also?.length === 1 && row.also[0] === `${name}'s Capital A/c`;
      }) &&
      [...q.sides[0].rows, ...q.sides[1].rows].every((r) => r.closing || r.also === undefined)
    );
  },
});

/** What `verify` works the capital accounts out from: each figure by partner, in the order of the names. */
const capitalsKept = keepFor<{
  names: string[];
  out: string;
  capitals: number[];
  /** Each partner's part of the reserve, of the goodwill written off and of the result of revaluation (a loss negative). */
  reserve: number[];
  written: number[];
  revaluation: number[];
  /** What each partner pays for the retiring partner's goodwill; 0 for the retiring partner and for one who gains nothing. */
  goodwill: number[];
  paid: number;
}>();

// 2. ret-fmt-capitals: the partners' capital accounts in columns on a retirement: the reserve, the result of
//    revaluation, goodwill (with goodwill in the books written off first in one seed of three), and the retiring
//    partner's column closed by transfer to the loan account, a part paid by cheque in half the seeds (medium)
const fmtCapitals = accountTemplate({
  id: 'ret-fmt-capitals', topicId: T, conceptId: 'ret-formats', difficulty: 'medium',
  generate: (rng) =>
    attempt(10, () => {
      const f = firm(rng);
      const g = gainOf(rng, f, ['silent', 'split', 'agreed', 'one']);
      if (!g) return null;
      const unit = f.total * 1000;
      const R = mult(rng, unit, 30000, 240000);
      const result = mult(rng, unit, 10000, 90000);
      const G = mult(rng, f.total * sum(g.w) * 1000, 60000, 720000);
      const E = rng.int(0, 2) === 0 ? mult(rng, unit, 20000, 100000) : 0;
      if (R === null || result === null || G === null || E === null || E >= G) return null;
      const profit = rng.int(0, 1) === 0;
      const V = profit ? result : -result;
      const K = f.names.map(() => rng.step(150000, 600000, 10000));
      const o = f.names.indexOf(f.out);
      const { s, parts: gw } = goodwillParts(f, g, G);
      const share = inOld(f, R - E + V);
      const due = K[o] + share[o] + s;
      const paid = rng.int(0, 1) === 0 ? (clean(rng, 50000, due - 100000, 10000, (v) => v <= 0.6 * due) ?? 0) : 0;
      const settle: Settle = paid > 0 ? { kind: 'part', paid } : { kind: 'loan' };
      const entries = [
        ...(E > 0 ? [stepGoodwillOff(f, E)] : []),
        stepAccumulated(f, ACCUMULATED.reserve, R),
        stepRevaluation(f, V, ''),
        stepGoodwill(f, g, G),
        stepSettle(f, due, settle, ''),
      ].map((step) => on(RETIRE_ON, step.lines));
      const result_ = profit ? 'profit' : 'loss';
      const revaluationRow = `Revaluation A/c (${result_})`;
      const view = columnarAccount(
        entries,
        f.names.map(partnerCapital),
        { date: RETIRE_ON, balances: K.map((amount) => ({ side: 'Cr' as const, amount: rupees(amount) })) },
        (id) => (id === 'revaluation' ? revaluationRow : ledgerLabel(id)),
      );
      // The retiring partner's column must close, and each continuing partner must be left with a capital.
      if (view.balances.some((b, i) => (i === o ? b !== null : b === null || b.side !== 'Cr'))) return null;
      const closing = f.names.map((_, i) => (i === o ? 0 : K[i] + share[i] - gw[f.stay.indexOf(f.names[i])]));
      if (closing.some((v, i) => i !== o && v < 50000)) return null;
      const data = [
        `${intro(rng, f)} ${FLUCTUATING} ${f.out} retires on ${RETIRE_ON}; ${g.text}.`,
        'Balances on that date:',
        `Capital accounts: ${named(f.names, K)}`,
        `General Reserve: ${inr(R)}`,
        ...(E > 0 ? [`Goodwill appearing in the books: ${inr(E)}`] : []),
        'On the retirement:',
        RESERVE_IN_FULL,
        `Revaluation A/c shows a ${result_} of ${inr(result)}.`,
        `The goodwill of the firm is valued at ${inr(G)}. ${goodwillRule(E > 0)}`,
        paid > 0
          ? `${inr(paid)} is paid to ${f.out} at once by cheque, and the balance of ${f.out}'s Capital A/c is transferred to ${f.out}'s Loan A/c.`
          : `Nothing is paid to ${f.out} at once: the balance of ${f.out}'s Capital A/c is transferred to ${f.out}'s Loan A/c.`,
      ].join('\n');
      capitalsKept.keep(data, {
        names: f.names,
        out: f.out,
        capitals: K,
        reserve: inOld(f, R),
        written: inOld(f, E),
        revaluation: inOld(f, V),
        goodwill: f.names.map((name) => (name === f.out ? 0 : gw[f.stay.indexOf(name)])),
        paid,
      });
      const payers = f.stay.filter((_, i) => gw[i] > 0);
      // The plain "Revaluation A/c" is as right as the row that says profit or loss: the side already says which it is.
      const sides = columnarSides(view, { closeOn: RETIRE_ON });
      const plain = (rows: FormatRowParts[]): FormatRowParts[] => rows.map((r) => (r.label === revaluationRow ? { ...r, also: ['Revaluation A/c'] } : r));
      const stands = (i: number): string => {
        const k = f.stay.indexOf(f.names[i]);
        return tally(K[i], [['goodwill written off', -(E * f.old[i]) / f.total], ['General Reserve', (R * f.old[i]) / f.total], [`revaluation ${result_}`, (V * f.old[i]) / f.total], ['goodwill', i === o ? s : -gw[k]]]);
      };
      return {
        task: `Prepare the capital accounts of the partners in columns on ${f.out}'s retirement on ${RETIRE_ON}, closing ${f.out}'s account and carrying down the balances of ${list(f.stay)}.`,
        data,
        title: "Partners' Capital Accounts",
        columns: partnerColumns(f.names),
        ...sides,
        left: { ...sides.left, rows: plain(sides.left.rows) },
        right: { ...sides.right, rows: plain(sides.right.rows) },
        distractors: [
          ...(E > 0 ? [] : ['Goodwill A/c']),
          `Revaluation A/c (${profit ? 'loss' : 'profit'})`,
          'Premium for Goodwill A/c',
          `${f.out}'s Executor's A/c`,
          'Profit and Loss Appropriation A/c',
          ...(paid > 0 ? [] : ['Bank A/c']),
        ],
        explanation: [
          'Each partner has a column. A capital is a credit balance, so the capitals open the credit side ("By Balance b/d").',
          ...(E > 0 ? [`The goodwill in the books, ${inr(E)}, is written off among all three in the old ratio ${rt(f.old)} ("To Goodwill A/c"): ${named(f.names, inOld(f, E))}.`] : []),
          `The General Reserve, ${inr(R)}, belongs to all three in the old ratio ${rt(f.old)} ("By General Reserve A/c"): ${named(f.names, inOld(f, R))}.`,
          `The ${result_} on revaluation, ${inr(result)}, is shared in the same ratio ("${profit ? 'By' : 'To'} ${revaluationRow}"): ${named(f.names, inOld(f, result))}.`,
          `${f.out}'s share of goodwill = ${inr(G)} x ${fr(f.x, f.total)} = ${inr(s)}. ${g.why}.`,
          `${payers.length === 1 ? `${payers[0]} is` : 'The partners who gain are'} debited ("To ${f.out}'s Capital A/c"): ${f.stay.map((name, i) => (gw[i] > 0 ? `${name} ${inr(gw[i])}` : '')).filter((x) => x !== '').join(', ')}. ${f.out} is credited with ${payers.length === 1 ? 'it' : 'each part'} ("By ${payers.map((name) => `${name}'s Capital A/c`).join('" and "By ')}").`,
          `${f.out}'s column: ${stands(o)} = ${inr(due)} is due.${paid > 0 ? ` ${inr(paid)} is paid by cheque ("To Bank A/c") and` : ' Nothing is paid, so'} ${paid > 0 ? `the rest, ${inr(due - paid)},` : `the whole ${inr(due)}`} is transferred ("To ${f.out}'s Loan A/c"), which closes the column.`,
          ...f.names.flatMap((name, i) => (i === o ? [] : [`${name}'s column: ${stands(i)} = ${inr(closing[i])}, carried down ("To Balance c/d").`])),
        ],
        hints: [
          'What belongs to all three partners in the old ratio, and what is settled between the retiring partner and the partners who gain?',
          "The reserve and the result of revaluation go to every column in the old ratio; goodwill is debited to the partners who gain and credited to the retiring partner, whose column is then closed by transfer to the loan account.",
        ],
      };
    }),
  verify: (q) => {
    const kept = capitalsKept.of(q.data);
    if (!kept) return false;
    const [debit, credit] = q.sides;
    const o = kept.names.indexOf(kept.out);
    /** True when a side has one row with these particulars and these figures, partner by partner; with no figure at all, when it has none. */
    const has = (side: typeof debit, label: string, amounts: number[]): boolean => {
      const rows = side.rows.filter((r) => r.label === label);
      return amounts.every((a) => a === 0) ? rows.length === 0 : rows.length === 1 && amounts.every((a, i) => near(rowRupees(rows[0], i), a));
    };
    const only = (amount: number): number[] => kept.names.map((_, i) => (i === o ? amount : 0));
    const profit = kept.revaluation.map((v) => Math.max(v, 0));
    const loss = kept.revaluation.map((v) => Math.max(-v, 0));
    // Each capital worked out from the figures: the continuing partners' are carried down, the retiring partner's is paid or lent.
    const share = kept.names.map((_, i) => kept.capitals[i] + kept.reserve[i] - kept.written[i] + kept.revaluation[i]);
    const due = share[o] + sum(kept.goodwill);
    const payers = kept.goodwill.filter((v) => v > 0).length;
    return (
      has(credit, 'Balance b/d', kept.capitals) &&
      has(credit, 'General Reserve A/c', kept.reserve) &&
      has(credit, 'Revaluation A/c (profit)', profit) &&
      has(debit, 'Revaluation A/c (loss)', loss) &&
      has(debit, 'Goodwill A/c', kept.written) &&
      has(debit, `${kept.out}'s Capital A/c`, kept.goodwill) &&
      kept.names.every((name, i) => i === o || has(credit, `${name}'s Capital A/c`, only(kept.goodwill[i]))) &&
      has(debit, 'Bank A/c', only(kept.paid)) &&
      has(debit, `${kept.out}'s Loan A/c`, only(due - kept.paid)) &&
      has(debit, 'Balance c/d', kept.names.map((_, i) => (i === o ? 0 : share[i] - kept.goodwill[i]))) &&
      credit.rows.length === 2 + (profit.some((v) => v > 0) ? 1 : 0) + payers &&
      debit.rows.length === 3 + (loss.some((v) => v > 0) ? 1 : 0) + (kept.written.some((v) => v > 0) ? 1 : 0) + (kept.paid > 0 ? 1 : 0)
    );
  },
});

/** The periods of an account kept over several years as a question has them: the debit and the credit rows of each. */
const periodsOf = (q: AccountQuestion): [FormatRow[], FormatRow[]][] => [[q.sides[0].rows, q.sides[1].rows], ...(q.later ?? [])];
/** The rows of a side with what a cheque is made up of shown under "Bank A/c", for the cheques that pay an instalment with interest. */
export const withCheques = (rows: FormatRowParts[], cheques: ReadonlyMap<string, string[]>): FormatRowParts[] =>
  rows.map((r) => (r.label === 'Bank A/c' && r.date !== undefined && cheques.has(r.date) ? { ...r, details: cheques.get(r.date) } : r));
export const INTEREST_ROW = 'Interest on Loan A/c';
/** What textbooks call the same account: accepted in its place (`also`). */
export const INTEREST_ALSO = 'Interest A/c';
/** The rows of a side with the other wording of the interest account accepted on every row of interest. */
export const withInterestAlso = (rows: FormatRowParts[]): FormatRowParts[] => rows.map((r) => (r.label === INTEREST_ROW ? { ...r, also: [INTEREST_ALSO] } : r));
/** What the working says of the two names. */
export const INTEREST_NAMES = 'The interest is debited to Interest on Loan A/c, which many books call Interest A/c: the row is right under either name.';
/** True when every row of interest of a side, and no other row, has the one other wording. */
const interestAlsoHolds = (rows: readonly FormatRow[]): boolean =>
  rows.every((r) => (r.label === INTEREST_ROW ? r.also?.length === 1 && r.also[0] === INTEREST_ALSO : r.also === undefined));
const YEARS_WORD = ['', 'one', 'two', 'three'];

const loanKept = keepFor<{ out: string; loan: number; count: number; rate: number; years: number }>();

// 3. ret-fmt-loan: the retiring partner's loan account over two or three years: equal instalments of principal, each
//    paid with the interest of the year on the balance outstanding. Two, three or four instalments (with four a
//    balance is left at the end), a part of the amount due paid at once in half the seeds, and in one seed of four
//    no rate agreed, so that the 6% of section 37 applies (medium)
const fmtLoan = accountTemplate({
  id: 'ret-fmt-loan', topicId: T, conceptId: 'ret-formats', difficulty: 'medium',
  generate: (rng) => {
    const f = firm(rng);
    const count = rng.pick([2, 3, 3, 4]);
    const years = Math.min(count, 3);
    const agreed = rng.int(0, 3) > 0;
    const rate = agreed ? rng.pick([8, 9, 10, 12]) : 6;
    const loan = mult(rng, count * 10000, 120000, 720000);
    if (loan === null) return null;
    const paid = rng.int(0, 1) === 0 ? rng.step(50000, 200000, 10000) : 0;
    const due = loan + paid;
    const instalment = loan / count;
    const account = partnerLoan(f.out);
    const start = '1 April 2025';
    const entries: DatedEntry[] = [on(start, [dr(partnerCapital(f.out), due), ...(paid > 0 ? [cr('bank', paid)] : []), cr(account, loan)])];
    const cheques = new Map<string, string[]>();
    const yearly: string[] = [];
    for (let k = 1; k <= years; k++) {
      const open = loan - (k - 1) * instalment;
      const interest = (open * rate) / 100;
      const left = open - instalment;
      const day = `31 March ${2025 + k}`;
      entries.push(on(day, [dr('interestOnLoan', interest), cr(account, interest)]), on(day, [dr(account, instalment + interest), cr('bank', instalment + interest)]));
      cheques.set(day, [`Instalment ${inr(instalment)}`, `Interest ${inr(interest)}`]);
      yearly.push(
        `Year ended ${day}: interest = ${inr(open)} x ${rate}% = ${inr(interest)}, credited ("By ${INTEREST_ROW}"). The cheque is ${inr(instalment)} + ${inr(interest)} = ${inr(instalment + interest)}, debited ("To Bank A/c"). ${
          left > 0
            ? `Balance = ${inr(open)} - ${inr(instalment)} = ${inr(left)}, carried down and brought down on 1 April ${2025 + k}.`
            : 'The last instalment clears the loan: the two sides agree and no balance is left.'
        }`,
      );
    }
    const closings = Array.from({ length: years }, (_, i) => ({ closeOn: `31 March ${2026 + i}`, reopenOn: `1 April ${2026 + i}`, title: `Year ended 31 March ${2026 + i}` }));
    const made = ledgerPeriods(entries, account, closings);
    const data = [
      `${f.out} retired from the firm of ${list(f.names)} on ${start}. ${CLOSES}`,
      `Amount due to ${f.out} on retirement: ${inr(due)}`,
      paid > 0
        ? `Paid to ${f.out} by cheque on ${start}: ${inr(paid)}. The balance was transferred from ${f.out}'s Capital A/c to ${f.out}'s Loan A/c on the same day.`
        : `Nothing was paid at once: the whole amount was transferred from ${f.out}'s Capital A/c to ${f.out}'s Loan A/c on the same day.`,
      `The loan is repaid in ${count} equal annual instalments of principal, the first on 31 March 2026, each paid by cheque together with ${agreed ? `interest at ${rate}% p.a.` : 'the interest'} on the balance outstanding during the year.${
        agreed ? '' : ` No rate of interest was agreed, and ${f.out} chose interest rather than a share of the later profits.`
      }`,
      `The interest of each year is credited to ${f.out}'s Loan A/c on 31 March, before the payment.`,
    ].join('\n');
    loanKept.keep(data, { out: f.out, loan, count, rate, years });
    return {
      task: `Prepare ${f.out}'s Loan A/c for the ${YEARS_WORD[years]} years ended 31 March ${2025 + years}, balancing it on each 31 March and bringing the balance down on each 1 April. Enter each cheque as one figure.`,
      data,
      title: `${f.out}'s Loan A/c`,
      ...made,
      left: { ...made.left, rows: withCheques(made.left.rows, cheques) },
      right: { ...made.right, rows: withInterestAlso(made.right.rows) },
      later: made.later?.map((p) => ({ ...p, left: withCheques(p.left, cheques), right: withInterestAlso(p.right) })),
      // "Interest on Partner's Loan A/c" and "Profit and Loss A/c" are not offered: an examiner may well accept
      // either for the interest.
      distractors: [`${f.out}'s Loan A/c`, 'Interest on Capital A/c', 'Cash A/c', `${f.out}'s Executor's A/c`, 'Profit and Loss Appropriation A/c'],
      explanation: [
        ...(agreed ? [] : [SECTION_37]),
        `The loan is ${paid > 0 ? `${inr(due)} - ${inr(paid)} = ` : ''}${inr(loan)}, credited on ${start} ("By ${f.out}'s Capital A/c"): the firm owes it.${
          paid > 0 ? ` The cheque of ${inr(paid)} paid that day came out of the capital account, so it is no row of the loan account.` : ''
        }`,
        `Each instalment of principal = ${inr(loan)} / ${count} = ${inr(instalment)}. Interest is charged on the balance outstanding during the year, so it falls every year.`,
        ...yearly,
        ...(count > years ? [`After three of the ${count} instalments one is still owed: the balance of ${inr(loan - years * instalment)} is brought down on 1 April ${2025 + years}.`] : []),
        INTEREST_NAMES,
      ],
      hints: [
        'The loan account is a liability: what the firm owes is credited, what it pays is debited.',
        'Each year: credit the interest on the opening balance, debit the cheque (the instalment and that interest), and carry down what is left of the principal.',
      ],
    };
  },
  verify: (q) => {
    const kept = loanKept.of(q.data);
    const periods = periodsOf(q);
    if (!kept || periods.length !== kept.years) return false;
    const instalment = kept.loan / kept.count;
    // The account walked year by year from the loan, the number of instalments and the rate alone.
    const each = periods.every(([debit, credit], i) => {
      const open = kept.loan - i * instalment;
      const interest = (open * kept.rate) / 100;
      const left = open - instalment;
      return (
        near(rowRupees(oneRow(credit, i === 0 ? `${kept.out}'s Capital A/c` : 'Balance b/d')), open) &&
        near(rowRupees(oneRow(credit, INTEREST_ROW)), interest) &&
        near(rowRupees(oneRow(debit, 'Bank A/c')), instalment + interest) &&
        (left > 0 ? near(rowRupees(oneRow(debit, 'Balance c/d')), left) : debit.length === 1) &&
        credit.length === 2 &&
        interestAlsoHolds(credit) &&
        interestAlsoHolds(debit)
      );
    });
    const owed = kept.loan - kept.years * instalment;
    return each && q.sides[0].below.length === 0 && (owed > 0 ? near(rowRupees(q.sides[1].below[0]), owed) : q.sides[1].below.length === 0);
  },
});

const deceasedKept = keepFor<{ out: string; capital: number; added: number; deducted: number }>();

// 4. ret-fmt-deceased-capital: the capital account of a partner who dies during the year (one account): interest on
//    capital and the share of profit to the date of death (by time or by sales), the share of goodwill from the
//    partners who gain, a reserve or an accumulated loss in three seeds of four, the drawings (with interest on them
//    in half the seeds), and the balance transferred to the executor's account (medium)
const fmtDeceasedCapital = accountTemplate({
  id: 'ret-fmt-deceased-capital', topicId: T, conceptId: 'ret-formats', difficulty: 'medium',
  // 2: the data names the account that interest on capital to the date of death goes through.
  version: 2,
  generate: (rng) =>
    attempt(10, () => {
      const f = firm(rng);
      const g = gainOf(rng, f, ['silent', 'silent', 'split', 'agreed', 'one']);
      if (!g) return null;
      const date = rng.pick(DATES_2025);
      const m = date.months;
      const K = 60000 * rng.int(2, 10);
      // A rate at which the interest for the months is in round hundreds of rupees (an even rate always is).
      const r = rng.pick([5, 6, 8, 10, 12].filter((v) => (K * v * m) % 120000 === 0));
      const interest = (K * r * m) / 1200;
      const G = mult(rng, f.total * sum(g.w) * 1000, 60000, 720000);
      const bySales = rng.int(0, 1) === 0;
      const rate = rng.pick([8, 10, 12, 15, 20, 25]);
      const S = 100000 * rng.int(8, 30);
      const P = bySales ? (S * rate) / 100 : profitForTime(rng, f, m);
      const S2 = bySales ? salesForShare(rng, f, S, m, rate) : 0;
      const kind = rng.pick(['reserve', 'reserve', 'loss', 'none'] as const);
      const A = kind === 'none' ? 0 : mult(rng, f.total * 1000, 30000, 200000);
      if (G === null || P === null || S2 === null || A === null) return null;
      const drawn = rng.step(10000, 60000, 2000);
      const onDrawn = rng.int(0, 1) === 0 ? rng.step(300, 2400, 100) : 0;
      const profit = bySales ? (S2 * rate * f.x) / (100 * f.total) : (P * m * f.x) / (12 * f.total);
      const part = (v: number): number => (v * f.x) / f.total;
      const { s, parts: gw } = goodwillParts(f, g, G);
      const added = interest + profit + s + (kind === 'reserve' ? part(A) : 0);
      const deducted = drawn + onDrawn + (kind === 'loss' ? part(A) : 0);
      const due = K + added - deducted;
      const capital = partnerCapital(f.out);
      const drawings = partnerDrawings(f.out);
      const dead = date.text;
      const entries: DatedEntry[] = [
        ...(kind === 'none' ? [] : [on(dead, stepAccumulated(f, kind === 'reserve' ? ACCUMULATED.reserve : ACCUMULATED.loss, A).lines)]),
        on(dead, [dr('interestOnCapital', interest), cr(capital, interest)]),
        on(dead, [dr('profitAndLossSuspense', profit), cr(capital, profit)]),
        on(dead, stepGoodwill(f, g, G).lines),
        on(dead, [dr(capital, drawn), cr(drawings, drawn)]),
        ...(onDrawn > 0 ? [on(dead, [dr(capital, onDrawn), cr('interestOnDrawings', onDrawn)])] : []),
        on(dead, [dr(capital, due), cr(executor(f.out), due)]),
      ];
      const view = accountOf(entries, capital, { date: '1 April 2025', side: 'Cr', amount: rupees(K) }, (id) => (id === drawings ? 'Drawings A/c' : ledgerLabel(id)));
      if (view.balance !== null) return null;
      const sides = ledgerSides(view, { closeOn: dead });
      const executorRow = ledgerLabel(executor(f.out));
      const payers = f.stay.filter((_, i) => gw[i] > 0);
      const data = [
        `${intro(rng, f)} ${FLUCTUATING} ${CLOSES} ${f.out} died on ${dead}; ${g.text}.`,
        'Under the partnership deed, the executor of a deceased partner is entitled to:',
        `the capital of the partner, with interest on capital at ${r}% p.a. up to the date of death, recorded through Interest on Capital A/c;`,
        bySales
          ? 'the share of profit from the last balance sheet to the date of death, worked out on the sales of that period at the rate of profit on sales earned in the previous year;'
          : 'the share of profit from the last balance sheet to the date of death, worked out on the basis of time from the profit of the previous year;',
        'the share of the goodwill of the firm, which is adjusted through the capital accounts without opening Goodwill A/c;',
        'the share, in the old ratio, of any reserve and of any accumulated profit or loss in the books.',
        'From the books:',
        `${f.out}'s capital on 1 April 2025: ${inr(K)}`,
        ...(bySales ? salesRows(S, P, S2).split('\n') : [`Profit for the year ended 31 March 2025: ${inr(P)}`]),
        `Goodwill of the firm, valued on the death: ${inr(G)}`,
        ...(kind === 'reserve' ? [`General Reserve on the date of death: ${inr(A)}`] : kind === 'loss' ? [`Profit and Loss A/c (debit balance) brought forward from earlier years: ${inr(A)}`] : []),
        `${f.out}'s drawings from 1 April 2025 to the date of death: ${inr(drawn)}`,
        ...(onDrawn > 0 ? [`Interest on ${f.out}'s drawings: ${inr(onDrawn)}`] : []),
        `The amount due is transferred to ${f.out}'s Executor's A/c.`,
      ].join('\n');
      deceasedKept.keep(data, { out: f.out, capital: K, added, deducted });
      return {
        task: `Prepare ${f.out}'s Capital A/c up to the date of death, ${dead}, closing it by transfer to ${f.out}'s Executor's A/c.`,
        data,
        title: `${f.out}'s Capital A/c`,
        left: { ...sides.left, rows: sides.left.rows.map((row) => (row.label === executorRow ? { ...row, closing: true } : row)) },
        right: sides.right,
        distractors: [`${f.out}'s Capital A/c`, 'Profit and Loss Appropriation A/c', `${f.out}'s Loan A/c`, 'Goodwill A/c', 'Balance c/d', 'Bank A/c', ...(kind === 'loss' ? [] : ['Profit and Loss A/c'])],
        explanation: [
          `The account opens with the capital on the credit side ("By Balance b/d"). 1 April 2025 to ${dead} is ${m} months.`,
          ...(kind === 'reserve' ? [`The General Reserve belongs to all three in the old ratio: ${f.out}'s share = ${inr(A)} x ${fr(f.x, f.total)} = ${inr(part(A))}, credited ("By General Reserve A/c").`] : []),
          ...(kind === 'loss' ? [`The debit balance of Profit and Loss A/c is a loss of all three in the old ratio: ${f.out}'s share = ${inr(A)} x ${fr(f.x, f.total)} = ${inr(part(A))}, debited ("To Profit and Loss A/c").`] : []),
          `Interest on capital = ${inr(K)} x ${r}% x ${m}/12 = ${inr(interest)}, credited ("By Interest on Capital A/c").`,
          bySales
            ? `Rate of profit on sales last year = ${inr(P)} / ${inr(S)} x 100 = ${rate}%; profit on the sales up to the date of death = ${inr(S2)} x ${rate}% = ${inr((S2 * rate) / 100)}; ${f.out}'s share = ${inr((S2 * rate) / 100)} x ${fr(f.x, f.total)} = ${inr(profit)}.`
            : `Share of profit for the ${m} months = ${inr(P)} x ${m}/12 x ${fr(f.x, f.total)} = ${inr(profit)}.`,
          'The profit of the year is not yet known, so the share is credited from Profit and Loss Suspense A/c ("By Profit and Loss Suspense A/c").',
          `Share of goodwill = ${inr(G)} x ${fr(f.x, f.total)} = ${inr(s)}. ${g.why}. ${payers.length === 1 ? `It is credited ("By ${payers[0]}'s Capital A/c").` : `It is credited in two rows: ${f.stay.map((name, i) => `"By ${name}'s Capital A/c" ${inr(gw[i])}`).join(' and ')}.`}`,
          `The drawings${onDrawn > 0 ? ' and the interest on them' : ''} reduce what is owed: debited ("To Drawings A/c" ${inr(drawn)}${onDrawn > 0 ? `, "To Interest on Drawings A/c" ${inr(onDrawn)}` : ''}).`,
          `Amount due = ${tally(K, [['General Reserve', kind === 'reserve' ? part(A) : 0], ['interest on capital', interest], ['share of profit', profit], ['goodwill', s], ['share of the loss', kind === 'loss' ? -part(A) : 0], ['drawings', -drawn], ['interest on drawings', -onDrawn]])} = ${inr(due)}, transferred to the executor ("To ${executorRow}"), which closes the account.`,
        ],
        hints: [
          'List what the estate is entitled to (credit side) and what the partner has already taken or must bear (debit side). For how many months do interest and the share of profit run?',
          "Credit: capital, interest on capital, share of profit (through Profit and Loss Suspense A/c), share of goodwill and of reserves. Debit: drawings, interest on drawings and a share of any loss. The balance goes to the Executor's A/c.",
        ],
      };
    }),
  verify: (q) => {
    const kept = deceasedKept.of(q.data);
    if (!kept) return false;
    const [debit, credit] = q.sides;
    const due = kept.capital + kept.added - kept.deducted;
    const transfer = oneRow(debit.rows, `${kept.out}'s Executor's A/c`);
    // What is added to the capital stands on the credit side, what is deducted on the debit side, and the rest goes to the executor.
    return (
      near(rowRupees(oneRow(credit.rows, 'Balance b/d')), kept.capital) &&
      near(total(credit.rows), kept.capital + kept.added) &&
      near(rowRupees(transfer), due) &&
      near(total(debit.rows) - rowRupees(transfer), kept.deducted) &&
      [...debit.rows, ...credit.rows].every((r) => r.label !== 'Balance c/d')
    );
  },
});

const executorKept = keepFor<{ out: string; principal: number; paid: number; count: number; rate: number; months: number; years: number }>();

// 5. ret-fmt-executor: the executor's account over two or three accounting years when the death falls during the
//    year: the amount due (a part of it paid at once in half the seeds), simple interest for the months to the first
//    31 March, then on each anniversary of the death the interest since 31 March and the cheque for the instalment
//    with the interest of the whole year, and the interest accrued to the next 31 March (complex)
const fmtExecutor = accountTemplate({
  id: 'ret-fmt-executor', topicId: T, conceptId: 'ret-formats', difficulty: 'complex',
  generate: (rng) =>
    attempt(10, () => {
      const f = firm(rng);
      const date = rng.pick(DATES_2025);
      const before = date.months; // whole months from 1 April to the day and month of the death
      const after = 12 - before; // whole months from that day to 31 March
      const day = date.text.replace(/ \d{4}$/, '');
      const year = Number(date.text.slice(-4));
      // Two instalments followed to the end, two followed for two years, or three followed for three years.
      const { count, years } = rng.pick([
        { count: 2, years: 3 },
        { count: 2, years: 2 },
        { count: 3, years: 3 },
      ]);
      const agreed = rng.int(0, 3) > 0;
      const rate = agreed ? rng.pick([8, 9, 10, 12]) : 6;
      // An instalment in ten thousands of rupees on which the interest of the months before the payment day, and of
      // the months after it, is in round hundreds: every figure of interest of the account is then a round one.
      const instalment = clean(rng, 60000, Math.floor(720000 / count / 10000) * 10000, 10000, (v) => (v * rate * before) % 120000 === 0 && (v * rate * after) % 120000 === 0);
      if (instalment === null) return null;
      const principal = instalment * count;
      const paid = rng.int(0, 1) === 0 ? rng.step(50000, 200000, 10000) : 0;
      const due = principal + paid;
      const interestOn = (p: number, months: number): number => (p * rate * months) / 1200;
      const account = executor(f.out);
      const credit = (dayOf: string, amount: number): DatedEntry => on(dayOf, [dr('interestOnLoan', amount), cr(account, amount)]);
      const first = interestOn(principal, after);
      const entries: DatedEntry[] = [on(date.text, [dr(partnerCapital(f.out), due), cr(account, due)]), ...(paid > 0 ? [on(date.text, [dr(account, paid), cr('bank', paid)])] : []), credit('31 March 2026', first)];
      const cheques = new Map<string, string[]>();
      const steps: string[] = [];
      for (let k = 1; k < years; k++) {
        const open = principal - (k - 1) * instalment;
        const left = open - instalment;
        const toDay = interestOn(open, before);
        const wholeYear = (open * rate) / 100;
        const accrued = interestOn(left, after);
        // Two rows of one year with the same particulars and the same figure could not be told apart.
        if (left > 0 && toDay === accrued) return null;
        const paidOn = `${day} ${year + k}`;
        const closeOn = `31 March ${2026 + k}`;
        entries.push(credit(paidOn, toDay), on(paidOn, [dr(account, instalment + wholeYear), cr('bank', instalment + wholeYear)]));
        cheques.set(paidOn, [`Instalment ${inr(instalment)}`, `Interest for the year ${inr(wholeYear)}`]);
        steps.push(
          `${paidOn}: interest since 31 March = ${inr(open)} x ${rate}% x ${before}/12 = ${inr(toDay)}, credited. The cheque pays the instalment and the interest of the whole year on ${inr(open)}: ${inr(instalment)} + ${inr(wholeYear)} = ${inr(instalment + wholeYear)} ("To Bank A/c"). ${
            left > 0 ? `Principal left = ${inr(left)}.` : 'Nothing is left: the two sides agree and the account is closed.'
          }`,
        );
        if (left > 0) {
          entries.push(credit(closeOn, accrued));
          steps.push(`${closeOn}: interest for the ${after} months since the payment = ${inr(left)} x ${rate}% x ${after}/12 = ${inr(accrued)}, credited. Balance carried down = ${inr(left)} + ${inr(accrued)} = ${inr(left + accrued)}.`);
        }
      }
      const closings = Array.from({ length: years }, (_, i) => ({
        closeOn: `31 March ${2026 + i}`,
        reopenOn: `1 April ${2026 + i}`,
        title: i === 0 ? `${date.text} to 31 March 2026` : `Year ended 31 March ${2026 + i}`,
      }));
      const made = ledgerPeriods(entries, account, closings);
      const data = [
        `${f.out}, a partner in the firm of ${list(f.names)}, died on ${date.text}. ${CLOSES}`,
        `Amount due to ${f.out}'s executor, transferred from ${f.out}'s Capital A/c to ${f.out}'s Executor's A/c on the date of death: ${inr(due)}`,
        ...(paid > 0 ? [`Paid to the executor by cheque on the date of death: ${inr(paid)}`] : []),
        `The ${paid > 0 ? 'balance' : 'amount'} is paid in ${count} equal annual instalments of principal on ${day} each year, the first in ${year + 1}, each paid by cheque together with all the interest due up to that day.`,
        agreed
          ? `Simple interest at ${rate}% p.a. is charged on the principal outstanding.`
          : 'No rate of interest was agreed, and the executor chose interest rather than a share of the later profits. Interest is simple, on the principal outstanding.',
        `Interest is credited to ${f.out}'s Executor's A/c on each 31 March, for the months since the death or the last payment, and on the day of each payment, for the months since 31 March, before the cheque is entered.`,
      ].join('\n');
      executorKept.keep(data, { out: f.out, principal, paid, count, rate, months: before, years });
      return {
        task: `Prepare ${f.out}'s Executor's A/c from ${date.text} to 31 March ${2025 + years}, balancing it on each 31 March and bringing the balance down on each 1 April. Enter each cheque as one figure.`,
        data,
        title: `${f.out}'s Executor's A/c`,
        ...made,
        left: { ...made.left, rows: withCheques(made.left.rows, cheques) },
        right: { ...made.right, rows: withInterestAlso(made.right.rows) },
        later: made.later?.map((p) => ({ ...p, left: withCheques(p.left, cheques), right: withInterestAlso(p.right) })),
        distractors: [`${f.out}'s Executor's A/c`, `${f.out}'s Loan A/c`, 'Interest on Capital A/c', 'Profit and Loss Suspense A/c', 'Cash A/c'],
        explanation: [
          ...(agreed ? [] : [`${SECTION_37} The executor of a deceased partner has the same choice.`]),
          `${date.text}: the amount due, ${inr(due)}, is credited ("By ${f.out}'s Capital A/c"): the firm owes it to the executor.${
            paid > 0 ? ` The cheque of ${inr(paid)} is debited ("To Bank A/c"), which leaves a principal of ${inr(principal)}.` : ''
          } Each instalment = ${inr(principal)} / ${count} = ${inr(instalment)}.`,
          `31 March 2026: ${date.text} to 31 March 2026 is ${after} months: interest = ${inr(principal)} x ${rate}% x ${after}/12 = ${inr(first)}, credited ("By ${INTEREST_ROW}"). Balance carried down = ${inr(principal)} + ${inr(first)} = ${inr(principal + first)}.`,
          ...steps,
          'Interest is simple: it is worked on the principal alone, never on the interest already credited, and each cheque pays off all the interest credited up to that day.',
          INTEREST_NAMES,
        ],
        hints: [
          `The first accounting year is a part year: interest runs only from the date of death to 31 March. After that, every year has ${before} months before the payment and ${after} months after it.`,
          'On each 31 March credit the interest accrued since the death or the last payment. On each payment day credit the interest since 31 March, then debit the cheque: the instalment and the interest of the whole year.',
        ],
      };
    }),
  verify: (q) => {
    const kept = executorKept.of(q.data);
    const periods = periodsOf(q);
    if (!kept || periods.length !== kept.years) return false;
    const instalment = kept.principal / kept.count;
    const after = 12 - kept.months;
    /** A principal with the simple interest accrued on it from the day of the death (or of a payment) to 31 March. */
    const atClose = (p: number): number => p + (p * kept.rate * after) / 1200;
    const interestRows = (rows: FormatRow[]): number => total(rows.filter((r) => r.label === INTEREST_ROW));
    const carried = (rows: FormatRow[], balance: number): boolean => (balance > 0 ? near(rowRupees(oneRow(rows, 'Balance c/d')), balance) : rows.every((r) => r.label !== 'Balance c/d'));
    const [debit0, credit0] = periods[0];
    const opens =
      near(rowRupees(oneRow(credit0, `${kept.out}'s Capital A/c`)), kept.principal + kept.paid) &&
      near(interestRows(credit0), atClose(kept.principal) - kept.principal) &&
      (kept.paid > 0 ? near(rowRupees(oneRow(debit0, 'Bank A/c')), kept.paid) : debit0.every((r) => r.label !== 'Bank A/c')) &&
      carried(debit0, atClose(kept.principal));
    // Every later year: the balance brought down, a year's interest in all on the principal as it changes, the cheque.
    const later = periods.slice(1).every(([debit, credit], i) => {
      const open = kept.principal - i * instalment;
      const left = open - instalment;
      return (
        near(rowRupees(oneRow(credit, 'Balance b/d')), atClose(open)) &&
        near(interestRows(credit), (open * kept.rate * kept.months) / 1200 + atClose(left) - left) &&
        near(rowRupees(oneRow(debit, 'Bank A/c')), instalment + (open * kept.rate) / 100) &&
        carried(debit, atClose(left))
      );
    });
    const worded = periods.every(([debit, credit]) => interestAlsoHolds(debit) && interestAlsoHolds(credit));
    const owed = atClose(kept.principal - (kept.years - 1) * instalment);
    return opens && later && worded && q.sides[0].below.length === 0 && (owed > 0 ? near(rowRupees(q.sides[1].below[0]), owed) : q.sides[1].below.length === 0);
  },
});

const sheetKept = keepFor<{ liabilities: [string, number][]; assets: [string, number][] }>();

// 6. ret-fmt-balance-sheet: the balance sheet of the continuing partners straight after a retirement, from the old
//    balance sheet and what is agreed: two or three changes on revaluation, the reserve, goodwill (with goodwill in
//    the books in one seed of four), and the amount due paid in part or left wholly as a loan. The old balance sheet
//    is posted as opening balances and every adjustment as an entry, so the two sides agree by construction (complex)
const fmtBalanceSheet = accountTemplate({
  id: 'ret-fmt-balance-sheet', topicId: T, conceptId: 'ret-formats', difficulty: 'complex',
  generate: (rng) =>
    attempt(14, () => {
      const f = firm(rng);
      const g = gainOf(rng, f, ['silent', 'split', 'agreed', 'one']);
      if (!g) return null;
      const who = list(f.stay);
      const unit = f.total * 1000;
      const made = changesOf(rng, f.total * 500, rng.pick([2, 3, 3]));
      if (!made) return null;
      const V = sum(made.map((c) => c.sign * c.amount));
      const R = mult(rng, unit, 30000, 240000);
      const G = mult(rng, f.total * sum(g.w) * 1000, 60000, 480000);
      const E = rng.int(0, 3) === 0 ? mult(rng, unit, 20000, 100000) : 0;
      if (V === 0 || R === null || G === null || E === null || E >= G) return null;
      const profit = V > 0;
      // The old balance sheet: an item that is revalued has the book value its change was worked on.
      const change = (kind: ChangeKind): Change | undefined => made.find((c) => c.kind === kind);
      const building = change('building')?.book ?? rng.step(300000, 800000, 50000);
      const machinery = change('machinery')?.book ?? rng.step(200000, 500000, 20000);
      const stock = change('stock')?.book ?? rng.step(120000, 320000, 10000);
      const debtors = change('debtors')?.book ?? rng.step(80000, 300000, 10000);
      const creditors = change('creditors')?.book ?? rng.step(90000, 240000, 10000);
      const bank = rng.step(60000, 300000, 10000);
      // The capitals make the old balance sheet agree: the excess of its assets over the creditors and the reserve.
      const capitalTotal = E + building + machinery + stock + debtors + bank - creditors - R;
      const weights = f.names.map(() => rng.int(3, 6));
      const K = weights.map((w) => Math.floor((capitalTotal * w) / sum(weights) / 10000) * 10000);
      K[2] = capitalTotal - K[0] - K[1];
      if (K.some((k) => k < 150000)) return null;
      const o = f.names.indexOf(f.out);
      const { s, parts: gw } = goodwillParts(f, g, G);
      const share = inOld(f, R - E + V);
      const due = K[o] + share[o] + s;
      const paid = rng.int(0, 1) === 0 ? (clean(rng, 30000, bank - 30000, 10000, (v) => v <= 0.5 * due) ?? 0) : 0;
      const settle: Settle = paid > 0 ? { kind: 'part', paid } : { kind: 'loan' };
      const opening = post([
        [
          ...(E > 0 ? [dr('goodwill', E)] : []),
          dr('building', building), dr('machinery', machinery), dr('stock', stock), dr('debtors', debtors), dr('bank', bank),
          cr('creditors', creditors), cr('generalReserve', R),
          ...f.names.map((name, i) => cr(partnerCapital(name), K[i])),
        ],
      ]);
      const ledger = post(
        [
          ...made.map(changeLines),
          revaluationTransfer(f, V),
          stepAccumulated(f, ACCUMULATED.reserve, R).lines,
          ...(E > 0 ? [stepGoodwillOff(f, E).lines] : []),
          stepGoodwill(f, g, G).lines,
          stepSettle(f, due, settle, '').lines,
        ],
        opening,
      );
      // What the retirement closes must be closed: nothing of it may reach the new balance sheet.
      if (['revaluation', 'generalReserve', 'goodwill', partnerCapital(f.out)].some((id) => balanceOf(ledger, id) !== null)) return null;
      /** The balance of an account on its own side, in paise; negative when it has fallen on the other side. */
      const at = (id: string, side: 'Dr' | 'Cr'): number => {
        const b = balanceOf(ledger, id);
        return b === null ? 0 : b.side === side ? b.amount : -b.amount;
      };
      const provision = at('provisionForDoubtfulDebts', 'Cr');
      const liabilities: [string, number][] = [
        ['Creditors', at('creditors', 'Cr')],
        ['Outstanding Expenses', at('outstandingExpenses', 'Cr')],
        [`${f.out}'s Loan`, at(partnerLoan(f.out), 'Cr')],
        ...f.stay.map((name): [string, number] => [`${name}'s Capital`, at(partnerCapital(name), 'Cr')]),
      ];
      const assets: [string, number][] = [
        ['Building', at('building', 'Dr')],
        ['Machinery', at('machinery', 'Dr')],
        ['Investments', at('investments', 'Dr')],
        ['Stock', at('stock', 'Dr')],
        ['Debtors', at('debtors', 'Dr') - provision],
        ['Bank', at('bank', 'Dr')],
      ];
      if ([...liabilities, ...assets].some(([, amount]) => amount < 0)) return null;
      const rowsOf = (items: [string, number][]): FormatRowParts[] =>
        items
          .filter(([, amount]) => amount > 0)
          .map(([label, amount]) => ({ label, amount, ...(label === 'Debtors' && provision > 0 ? { details: [`Debtors ${inr(debtors)}`, `Less: Provision for doubtful debts ${formatINR(provision)}`] } : {}) }));
      // The same balance sheet by arithmetic, for `verify`: each figure from the old one and the adjustments.
      const moved = (kind: ChangeKind): number => (change(kind)?.sign ?? 0) * (change(kind)?.amount ?? 0);
      const closing = f.stay.map((name, i) => K[f.names.indexOf(name)] + share[f.names.indexOf(name)] - gw[i]);
      const expected = {
        liabilities: [['Creditors', creditors - moved('creditors')], ['Outstanding Expenses', -moved('outstanding')], [`${f.out}'s Loan`, due - paid], ...f.stay.map((name, i): [string, number] => [`${name}'s Capital`, closing[i]])] as [string, number][],
        assets: [['Building', building + moved('building')], ['Machinery', machinery + moved('machinery')], ['Investments', moved('investments')], ['Stock', stock + moved('stock')], ['Debtors', debtors + moved('debtors')], ['Bank', bank - paid]] as [string, number][],
      };
      const data = [
        `${intro(rng, f)} ${FLUCTUATING} ${f.out} retires on ${RETIRE_ON}; ${g.text}.`,
        `Balance Sheet of ${list(f.names)} as at ${RETIRE_ON}, before the retirement:`,
        'Liabilities:',
        `Creditors: ${inr(creditors)}`,
        `General Reserve: ${inr(R)}`,
        ...f.names.map((name, i) => `${name}'s Capital: ${inr(K[i])}`),
        'Assets:',
        ...(E > 0 ? [`Goodwill: ${inr(E)}`] : []),
        `Building: ${inr(building)}`,
        `Machinery: ${inr(machinery)}`,
        `Stock: ${inr(stock)}`,
        `Debtors: ${inr(debtors)}`,
        `Bank: ${inr(bank)}`,
        `On ${f.out}'s retirement it is agreed that:`,
        ...made.map((c) => c.text),
        RESERVE_IN_FULL,
        `The goodwill of the firm is valued at ${inr(G)}. ${goodwillRule(E > 0)}`,
        paid > 0
          ? `${inr(paid)} is paid to ${f.out} at once by cheque, and the rest of the amount due is transferred to ${f.out}'s Loan A/c.`
          : `Nothing is paid to ${f.out} at once: the whole amount due is transferred to ${f.out}'s Loan A/c.`,
      ].join('\n');
      sheetKept.keep(data, expected);
      const o1 = f.old;
      const stands = (i: number): string =>
        tally(K[i], [['goodwill written off', -(E * o1[i]) / f.total], [`revaluation ${profit ? 'profit' : 'loss'}`, (V * o1[i]) / f.total], ['General Reserve', (R * o1[i]) / f.total], ['goodwill', i === o ? s : -gw[f.stay.indexOf(f.names[i])]]]);
      const sideTotal = sum(liabilities.map(([, amount]) => amount)) / 100;
      const newValues = made
        .filter((c) => c.kind !== 'debtors' && c.kind !== 'creditors' && c.kind !== 'outstanding')
        .map((c) => (c.book > 0 ? `${c.item} ${inr(c.book)} ${c.sign > 0 ? '+' : '-'} ${inr(c.amount)} = ${inr(c.book + c.sign * c.amount)}` : `${c.item} ${inr(c.amount)}, now in the books`));
      return {
        task: `Prepare the Balance Sheet of ${who} as at ${RETIRE_ON}, immediately after ${f.out}'s retirement. Show debtors less any provision for doubtful debts as one figure.`,
        data,
        title: `Balance Sheet of ${who} as at ${RETIRE_ON}`,
        left: { title: 'Liabilities', rows: rowsOf(liabilities) },
        right: { title: 'Assets', rows: rowsOf(assets) },
        distractors: ['General Reserve', 'Goodwill', `${f.out}'s Capital`, 'Provision for Doubtful Debts', 'Profit on Revaluation'],
        explanation: [
          `Revaluation: ${made.map((c) => `${c.work} (a ${c.sign > 0 ? 'gain' : 'loss'})`).join('; ')}. Net ${profit ? 'profit' : 'loss'} = ${inr(Math.abs(V))}, shared by all three in the old ratio ${rt(f.old)}: ${named(f.names, inOld(f, V))}.`,
          `The General Reserve, ${inr(R)}, is shared in the same ratio and so leaves the balance sheet: ${named(f.names, inOld(f, R))}.`,
          ...(E > 0 ? [`The goodwill in the books, ${inr(E)}, is written off among all three in the old ratio: ${named(f.names, inOld(f, E))}.`] : []),
          `${f.out}'s share of goodwill = ${inr(G)} x ${fr(f.x, f.total)} = ${inr(s)}. ${g.why}. ${f.stay.map((name, i) => (gw[i] > 0 ? `${name} is debited with ${inr(gw[i])}` : '')).filter((x) => x !== '').join(' and ')}; no Goodwill A/c is opened, so goodwill is not an asset of the new firm.`,
          `Amount due to ${f.out} = ${stands(o)} = ${inr(due)}. ${paid > 0 ? `${inr(paid)} is paid by cheque and the rest, ${inr(due - paid)}, is` : 'Nothing is paid, so the whole of it is'} ${f.out}'s Loan, a liability of the new firm. ${f.out}'s Capital no longer appears.`,
          ...f.names.flatMap((name, i) => (i === o ? [] : [`${name}'s Capital = ${stands(i)} = ${inr(closing[f.stay.indexOf(name)])}.`])),
          ...(change('creditors') ? [`Creditors = ${inr(creditors)} - ${inr(change('creditors')!.amount)} = ${inr(creditors - change('creditors')!.amount)}.`] : []),
          ...(change('outstanding') ? [`Outstanding Expenses of ${inr(change('outstanding')!.amount)} are a new liability.`] : []),
          ...(newValues.length > 0 ? [`Assets at their new values: ${newValues.join('; ')}.`] : []),
          ...(change('debtors') ? [`Debtors are shown less the provision: ${inr(debtors)} - ${inr(change('debtors')!.amount)} = ${inr(debtors - change('debtors')!.amount)}.`] : []),
          `Bank = ${paid > 0 ? `${inr(bank)} - ${inr(paid)} = ${inr(bank - paid)}` : `${inr(bank)}, unchanged, as nothing is paid`}. The assets that were not revalued stay at their book values.`,
          `Each side totals ${inr(sideTotal)}.`,
        ],
        hints: [
          'Work in three steps: the Revaluation Account, then the capital accounts of the three partners, then the balance sheet of the two who continue.',
          "The General Reserve, the goodwill and the retiring partner's capital do not appear in the new balance sheet; the retiring partner's loan does. Assets stand at their new values, and the bank falls by any cheque paid.",
        ],
      };
    }),
  verify: (q) => {
    const kept = sheetKept.of(q.data);
    if (!kept) return false;
    const holds = (side: AccountQuestion['sides'][number], want: [string, number][]): boolean => {
      const shown = want.filter(([, amount]) => amount !== 0);
      return side.below.length === 0 && side.rows.length === shown.length && shown.every(([label, amount]) => amount > 0 && near(rowRupees(oneRow(side.rows, label)), amount));
    };
    const totalOf = (want: [string, number][]): number => sum(want.map(([, amount]) => amount));
    // Each figure worked out from the old balance sheet and the adjustments, and the two sides of that working agree.
    return q.sides[0].title === 'Liabilities' && q.sides[1].title === 'Assets' && holds(q.sides[0], kept.liabilities) && holds(q.sides[1], kept.assets) && totalOf(kept.liabilities) === totalOf(kept.assets);
  },
});

// ===============================================================================================================
// REGISTER
// ===============================================================================================================

// One-mark Assertion-Reason questions of the board. They stand on their own level and go into no mock paper and no
// Look back (`isAssertionReason`), so nothing that was served before moves.
const retAssertionReason = factsTemplate({
  id: 'ret-assertion-reason', topicId: 'retirement-and-death-of-a-partner', conceptId: 'ret-ratio', difficulty: 'medium',
  // 2: the first item says the gaining partners compensate (a continuing partner who sacrifices is compensated).
  version: 2,
  facts: assertionReasonFacts([
    {
      answer: 'both',
      assertion: 'The gaining partners compensate a retiring partner for goodwill.',
      reason: 'The gaining partners take over the share of future profits of the retiring partner.',
      a: "Gaining Partners' Capital A/cs Dr; To Retiring Partner's Capital A/c.",
      r: 'After the retirement, the share of the retiring partner goes to the continuing partners who gain it.',
      link: 'R explains A: they pay for the share of future profits that comes to them.',
    },
    {
      answer: 'both',
      assertion: 'Raj, Seema and Tarun share profits 3:2:1. Tarun retires and nothing is said about the new ratio. Raj and Seema gain in the ratio 3:2.',
      reason: 'When nothing is agreed, the continuing partners keep their old ratio between themselves.',
      a: "Strike out Tarun's term and 3:2 is left. That is the new ratio and the gaining ratio.",
      r: 'This is the rule when nothing is agreed on a retirement or death.',
      link: 'R explains A: the 3:2 comes directly from that rule.',
    },
    {
      answer: 'both',
      assertion: 'A retiring partner shares in a profit on the revaluation of assets.',
      reason: 'The rise in value came about while the retiring partner was still a partner.',
      a: 'All the partners, the one who leaves included, share it in the old ratio.',
      r: 'The values are brought up to date for the time before the retirement.',
      link: 'R explains A: a gain of the time of the old firm is shared by those who were in it.',
    },
    {
      answer: 'both',
      assertion: "An amount due to a retiring partner and transferred to the partner's Loan A/c is a liability of the firm.",
      reason: 'After retirement the partner is no longer an owner, and the firm owes that person the money.',
      a: "Retiring Partner's Capital A/c Dr; To Retiring Partner's Loan A/c.",
      r: 'The Capital A/c is closed, and what is left unpaid is a debt.',
      link: 'R explains A: money owed to someone who is not an owner is a debt of the firm.',
    },
    {
      answer: 'both',
      assertion: "The capital of Uma, after reserves and revaluation, is ₹2,00,000. The firm pays Uma ₹2,30,000 in full settlement. Uma's share of goodwill is ₹30,000.",
      reason: "The excess of a lump sum paid in full settlement over the amount due on the capital account is the outgoing partner's share of goodwill.",
      a: '₹2,30,000 - ₹2,00,000 = ₹30,000.',
      r: 'This is hidden goodwill on retirement.',
      link: 'R explains A: the ₹30,000 is that excess.',
    },
    {
      answer: 'bothNot',
      assertion: 'Goodwill appearing in the balance sheet is written off among all the partners in the old ratio on a retirement.',
      reason: "The gaining partners are debited with the retiring partner's share of goodwill in the gaining ratio.",
      a: "All Partners' Capital A/cs Dr, in the old ratio; To Goodwill A/c.",
      r: 'The gaining partners pay for what they take over.',
      link: 'R does not explain A: R is the entry for compensation, and A removes a balance from the books. Each stands on its own.',
    },
    {
      answer: 'bothNot',
      assertion: 'The share of profit of a deceased partner up to the date of death may be found on the basis of time or of turnover.',
      reason: "The balance of the deceased partner's Capital A/c is transferred to the Executor's A/c.",
      a: 'Both bases are used; the deed or the question says which.',
      r: "Deceased Partner's Capital A/c Dr; To Deceased Partner's Executor's A/c.",
      link: 'R does not explain A: R is about closing the account, and has nothing to do with how the share of profit is measured.',
    },
    {
      answer: 'bothNot',
      assertion: "A retiring partner's loan of ₹3,00,000 is repayable in three equal annual instalments with interest at 10% p.a. on the balance. The interest of the first year is ₹30,000.",
      reason: "A retiring partner's loan is shown as a liability in the balance sheet.",
      a: '₹3,00,000 × 10% = ₹30,000, on the balance outstanding during the first year.',
      r: 'It is a debt the firm owes.',
      link: 'R does not explain A: where the loan is shown does not give the amount of interest.',
    },
    {
      answer: 'aOnly',
      assertion: "Sales up to the date of death are ₹6,00,000. Last year's profit was ₹1,00,000 on sales of ₹20,00,000. The share of Kiran, who died, is 1/2, so Kiran's share of profit is ₹15,000.",
      reason: "On the basis of turnover, the profit up to the date of death is worked at the rate of profit on last year's capital.",
      a: 'The rate is 5% of sales, so ₹6,00,000 × 5% × 1/2 = ₹15,000.',
      r: "The rate is the profit on last year's sales, not on capital.",
    },
    {
      answer: 'aOnly',
      assertion: 'When nothing is agreed, a retiring partner whose money stays in the firm may choose interest at 6% p.a. on it in place of a share of the profit earned with it.',
      reason: 'Section 37 of the Indian Partnership Act, 1932 leaves this choice to the continuing partners.',
      a: 'Section 37 gives this choice between 6% interest and the profit earned with the money.',
      r: 'The choice belongs to the outgoing partner (or the estate), not to the continuing partners.',
    },
    {
      answer: 'rOnly',
      assertion: "On a retirement, the retiring partner's share of goodwill is borne by the continuing partners in their sacrificing ratio.",
      reason: 'The continuing partners take on the share of the partner who leaves.',
      a: 'It is borne in the gaining ratio: on a retirement the continuing partners gain.',
      r: 'That share comes to them, so they gain.',
    },
    {
      answer: 'rOnly',
      assertion: "Anil, Bhanu and Chitra share profits 2:2:1 and the goodwill of the firm is ₹1,50,000. Chitra retires. Chitra's share of goodwill is ₹50,000.",
      reason: "A retiring partner's share of goodwill is the goodwill of the firm multiplied by that partner's share.",
      a: '₹1,50,000 × 1/5 = ₹30,000. ₹50,000 is a third, as if the partners shared equally.',
      r: 'That is how the share of goodwill is found.',
    },
  ]),
});

// ===============================================================================================================
// ADDED LATER: EARMARKED RESERVES, FIXED CAPITALS, A DEATH IN THE MIDDLE OF A MONTH AND THE CLOSING OF PROFIT AND
// LOSS SUSPENSE A/c. These stand on levels of their own and are kept off the mock papers, the worksheets and the Look
// back levels (src/generators/outsidePapers.ts), so no question there moved.
// ===============================================================================================================

/** What the firms of the templates added later do, and where: a firm is a business somewhere, not just "a firm". */
const SETTINGS = [
  'run a pharmacy in Bhopal', 'run a travel agency in Jaipur', 'run a coaching centre in Kota', 'make steel furniture in Ludhiana',
  'deal in seeds and fertilisers in Nashik', 'run a diagnostic laboratory in Lucknow', 'run a fleet of goods carriers in Nagpur',
  'run a sweet shop in Kolkata', 'sell handloom sarees in Kanchipuram', 'run a printing press in Sivakasi',
  'export spices from Kochi', 'run a hardware store in Guwahati', 'run a dental clinic in Mysuru', 'make school uniforms in Tiruppur',
];
/** The opening sentence of a template added later: the partners, their business and town, and the old ratio. `readFirm` reads it back. */
const settingIntro = (rng: Rng, f: Firm): string => `${list(f.names)} ${rng.pick(SETTINGS)} and share profits and losses in the ratio ${rt(f.old)}.`;
const FIXED = 'Capitals are fixed, so each partner also has a current account.';
const CLAIM_RULE = 'A claim that the reserve does not cover is charged to Revaluation A/c.';
const FALL_RULE = 'A fall in value that the reserve does not cover is charged to Revaluation A/c.';
const ownAccount = (prompt: string): ((name: string) => string) => (/Capitals are fixed/.test(prompt) ? partnerCurrent : partnerCapital);

const EARMARKED_HINTS = {
  wcr: [
    'What was the reserve kept for, and is the claim smaller than it, equal to it or larger?',
    'The claim is met from the reserve first and becomes a liability (Workmen Compensation Claim A/c). What is left of the reserve goes to all the partners in the old ratio; a claim larger than the reserve leaves a loss, debited to Revaluation A/c.',
  ],
  ifr: [
    'Compare the market value of the investments with their book value: how far have they fallen, and does the reserve cover it?',
    'The fall is met from the reserve first and Investments A/c is credited with it. What is left of the reserve goes to all the partners in the old ratio; a fall larger than the reserve leaves a loss, debited to Revaluation A/c.',
  ],
};

// 1. ret-wcr-claim: a Workmen Compensation Reserve on a retirement, with no claim, a claim smaller than the reserve,
//    equal to it or larger; capitals fixed in one seed of four (medium)
const wcrClaim = journalTemplate({
  id: 'ret-wcr-claim', topicId: T, conceptId: 'ret-revaluation', difficulty: 'medium',
  generate: (rng) => {
    const f = firm(rng);
    const fixed = rng.int(0, 3) === 0;
    const own = fixed ? partnerCurrent : partnerCapital;
    const kind = rng.pick(['surplus', 'surplus', 'short', 'equal', 'none'] as const);
    const unit = f.total * 1000;
    const S = kind === 'surplus' || kind === 'none' ? mult(rng, unit, 10000, 120000) : 0;
    if (S === null) return null;
    const C = kind === 'none' ? 0 : rng.step(15000, 100000, 5000);
    const W = kind === 'surplus' ? C + S : kind === 'none' ? S : kind === 'equal' ? C : C - rng.step(5000, Math.min(40000, C - 10000), 5000);
    const parts = inOld(f, S);
    const lines: JournalLine[] =
      kind === 'short'
        ? [dr('workmenCompensationReserve', W), dr('revaluation', C - W), cr('workmenCompensationClaim', C)]
        : [dr('workmenCompensationReserve', W), ...(C > 0 ? [cr('workmenCompensationClaim', C)] : []), ...(S > 0 ? f.names.map((name, i) => cr(own(name), parts[i])) : [])];
    const claim = kind === 'none' ? 'there is no claim for workmen\'s compensation against the firm' : `a claim of ${inr(C)} for workmen's compensation is admitted against the firm`;
    const ownWord = fixed ? 'Current' : 'Capital';
    return {
      prompt: `${settingIntro(rng, f)} ${fixed ? FIXED : FLUCTUATING} ${f.out} retires on ${RETIRE_ON}. On that date the balance sheet shows a Workmen Compensation Reserve of ${inr(W)}, and ${claim}. ${CLAIM_RULE} Pass one journal entry for the reserve${C > 0 ? ' and the claim' : ''}.`,
      lines,
      explanation: [
        `Workmen Compensation Reserve A/c is closed: it is debited with the whole ${inr(W)}.`,
        ...(kind === 'none' ? [] : [`The claim of ${inr(C)} is now owed to the workers: Workmen Compensation Claim A/c, a liability, is credited with ${inr(C)}.`]),
        ...(kind === 'short' ? [`The reserve covers only ${inr(W)} of the claim. The rest, ${inr(C)} - ${inr(W)} = ${inr(C - W)}, is a loss: Revaluation A/c is debited, and nothing is left for the partners.`] : []),
        ...(kind === 'equal' ? ['The claim uses up the whole reserve, so nothing is left for the partners and nothing is charged to Revaluation A/c.'] : []),
        ...(S > 0
          ? [
              `${kind === 'none' ? 'With no claim, the whole reserve' : `What is left, ${inr(W)} - ${inr(C)} = ${inr(S)},`} is free reserve built up while ${f.out} was a partner: it is credited to the partners' ${ownWord} A/cs in the old ratio ${rt(f.old)}: ${named(f.names, parts)}.`,
            ]
          : []),
      ],
      hints: EARMARKED_HINTS.wcr,
      distractorAccounts: ['generalReserve', 'investmentFluctuationReserve', 'profitAndLoss', fixed ? partnerCapital(f.out) : partnerCurrent(f.out)],
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    if (!g) return false;
    const [W, C = 0] = amountsIn(q.prompt);
    const own = ownAccount(q.prompt);
    const left = Math.max(W - C, 0);
    return (
      near(posted(q, 'workmenCompensationReserve', 'Dr'), W) &&
      near(posted(q, 'workmenCompensationClaim', 'Cr'), C) &&
      near(posted(q, 'revaluation', 'Dr'), Math.max(C - W, 0)) &&
      g.names.every((name, i) => near(posted(q, own(name), 'Cr'), left * g.share[i]))
    );
  },
});

// 2. ret-ifr: an Investment Fluctuation Reserve on a retirement, with the investments at book value, or fallen by
//    less than the reserve, by exactly the reserve or by more; capitals fixed in one seed of four (medium)
const ifrEntry = journalTemplate({
  id: 'ret-ifr', topicId: T, conceptId: 'ret-revaluation', difficulty: 'medium', computed: true,
  generate: (rng) => {
    const f = firm(rng);
    const fixed = rng.int(0, 3) === 0;
    const own = fixed ? partnerCurrent : partnerCapital;
    const kind = rng.pick(['cover', 'cover', 'short', 'equal', 'none'] as const);
    const unit = f.total * 1000;
    const S = kind === 'cover' || kind === 'none' ? mult(rng, unit, 10000, 90000) : 0;
    if (S === null) return null;
    const fall = kind === 'none' ? 0 : rng.step(10000, 80000, 5000);
    const R = kind === 'cover' ? fall + S : kind === 'none' ? S : kind === 'equal' ? fall : fall - rng.step(5000, Math.min(30000, fall - 5000), 5000);
    if (R <= 0) return null;
    const B = rng.step(Math.max(150000, fall + 100000), 900000, 10000);
    const M = B - fall;
    const parts = inOld(f, S);
    const lines: JournalLine[] =
      kind === 'short'
        ? [dr('investmentFluctuationReserve', R), dr('revaluation', fall - R), cr('investments', fall)]
        : [dr('investmentFluctuationReserve', R), ...(fall > 0 ? [cr('investments', fall)] : []), ...(S > 0 ? f.names.map((name, i) => cr(own(name), parts[i])) : [])];
    const ownWord = fixed ? 'Current' : 'Capital';
    return {
      prompt: `${settingIntro(rng, f)} ${fixed ? FIXED : FLUCTUATING} ${f.out} retires on ${RETIRE_ON}. On that date investments stand in the books at ${inr(B)} and the Investment Fluctuation Reserve at ${inr(R)}; the market value of the investments is ${inr(M)}, and they are to be shown at that value. ${FALL_RULE} Pass one journal entry for the reserve${fall > 0 ? ' and the fall in value' : ''}.`,
      lines,
      explanation: [
        fall > 0 ? `Fall in value = ${inr(B)} - ${inr(M)} = ${inr(fall)}: Investments A/c is credited with it, which brings the investments down to ${inr(M)}.` : 'The market value equals the book value: the investments have not fallen, so Investments A/c is not touched.',
        `Investment Fluctuation Reserve A/c is closed: it is debited with the whole ${inr(R)}.`,
        ...(kind === 'short' ? [`The reserve covers only ${inr(R)} of the fall. The rest, ${inr(fall)} - ${inr(R)} = ${inr(fall - R)}, is a loss: Revaluation A/c is debited, and nothing is left for the partners.`] : []),
        ...(kind === 'equal' ? ['The fall uses up the whole reserve, so nothing is left for the partners and nothing is charged to Revaluation A/c.'] : []),
        ...(S > 0
          ? [`${kind === 'none' ? 'Nothing is needed to meet a fall, so the whole reserve' : `What is left, ${inr(R)} - ${inr(fall)} = ${inr(S)},`} is free reserve: it is credited to the partners' ${ownWord} A/cs in the old ratio ${rt(f.old)}: ${named(f.names, parts)}.`]
          : []),
      ],
      hints: EARMARKED_HINTS.ifr,
      distractorAccounts: ['generalReserve', 'workmenCompensationReserve', 'profitAndLoss', fixed ? partnerCapital(f.out) : partnerCurrent(f.out)],
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    if (!g) return false;
    const [B, R, M] = amountsIn(q.prompt);
    const own = ownAccount(q.prompt);
    const fall = B - M;
    const left = Math.max(R - fall, 0);
    return (
      near(posted(q, 'investmentFluctuationReserve', 'Dr'), R) &&
      near(posted(q, 'investments', 'Cr'), fall) &&
      near(posted(q, 'revaluation', 'Dr'), Math.max(fall - R, 0)) &&
      g.names.every((name, i) => near(posted(q, own(name), 'Cr'), left * g.share[i]))
    );
  },
});

// 3. ret-earmarked-share: what a partner gets out of a Workmen Compensation Reserve after a claim, or out of an
//    Investment Fluctuation Reserve after a fall in value (easy)
const earmarkedShare = numericTemplate({
  id: 'ret-earmarked-share', topicId: T, conceptId: 'ret-revaluation', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const wcr = rng.int(0, 1) === 0;
    const S = mult(rng, f.total * 1000, 10000, 120000);
    if (S === null) return null;
    const used = rng.step(10000, 90000, 5000);
    const W = used + S;
    const askOut = rng.int(0, 2) > 0;
    const i = rng.int(0, 1);
    const who = askOut ? f.out : f.stay[i];
    const term = askOut ? f.x : f.stayOld[i];
    const ans = (S * term) / f.total;
    const n = numeric(ans, [
      [(W * term) / f.total, wcr ? 'Shared the whole reserve and forgot to keep back the claim, which is a liability.' : 'Shared the whole reserve and forgot to meet the fall in the value of the investments first.'],
      [(used * term) / f.total, wcr ? 'Shared the claim instead of what is left of the reserve after it.' : 'Shared the fall in value instead of what is left of the reserve after it.'],
      [S / f.names.length, 'Divided what is left equally instead of in the old ratio.'],
      ...(askOut ? [] : ([[(S * term) / (f.total - f.x), `Shared what is left between the continuing partners only, although ${f.out} was a partner when the reserve was built up.`]] as [number, string][])),
      [S, `Gave the whole of what is left, not ${who}'s share of it.`],
    ]);
    const facts = wcr
      ? `The balance sheet shows a Workmen Compensation Reserve of ${inr(W)}, and a claim of ${inr(used)} for workmen's compensation is admitted against the firm.`
      : `Investments stand in the books at ${inr(used + rng.step(100000, 600000, 10000))} and are to be shown at their market value, which is ${inr(used)} less; the Investment Fluctuation Reserve stands at ${inr(W)}.`;
    return n && {
      prompt: `${settingIntro(rng, f)} ${FLUCTUATING} ${f.out} retires on ${RETIRE_ON}. ${facts} How much of the ${wcr ? 'Workmen Compensation Reserve' : 'Investment Fluctuation Reserve'} is credited to ${who}'s Capital A/c?`,
      ...n,
      explanation: [
        wcr ? `The claim of ${inr(used)} is met from the reserve first: it becomes a liability.` : `The fall in value, ${inr(used)}, is met from the reserve first.`,
        `What is left = ${inr(W)} - ${inr(used)} = ${inr(S)}, a free reserve shared by all the partners in the old ratio ${rt(f.old)}.`,
        `${who}'s share = ${inr(S)} x ${fr(term, f.total)} = ${inr(ans)}.`,
      ],
      hints: wcr ? EARMARKED_HINTS.wcr : EARMARKED_HINTS.ifr,
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    const who = /credited to ([A-Z][a-z]+)'s Capital/.exec(q.prompt)?.[1];
    if (!g || !who) return false;
    const a = amountsIn(q.prompt);
    // A reserve and its claim, or the book value, the fall and the reserve.
    const left = /Workmen Compensation Reserve of/.test(q.prompt) ? a[0] - a[1] : a[2] - a[1];
    return near(q.answer / 100, left * g.share[g.names.indexOf(who)]);
  },
});

// 4. ret-current-transfer: capitals are fixed; the retiring partner's current account, after the adjustments, is
//    closed by transfer to the capital account (a credit balance in most seeds, a debit balance in some) (medium)
const currentTransfer = journalTemplate({
  id: 'ret-current-transfer', topicId: T, conceptId: 'ret-amount-due', difficulty: 'medium', computed: true,
  generate: (rng) => {
    const f = firm(rng);
    const X = f.out;
    const openDebit = rng.int(0, 2) === 0;
    const a = rng.step(5000, openDebit ? 90000 : 60000, 1000);
    const R = rng.step(5000, 40000, 1000);
    const G = rng.step(10000, 80000, 1000);
    const lossOnReval = rng.int(0, 1) === 0;
    const V = rng.step(2000, 30000, 1000);
    const balance = (openDebit ? -a : a) + R + G + (lossOnReval ? -V : V);
    if (balance === 0) return null;
    const credit = balance > 0;
    const B = Math.abs(balance);
    return {
      prompt: [
        `${settingIntro(rng, f)} Capitals are fixed. ${X} retires on ${RETIRE_ON}, and the balance of ${X}'s Current A/c is transferred to ${X}'s Capital A/c. Pass the journal entry for the transfer.`,
        `${X}'s Current A/c before the adjustments: ${inr(a)} (${openDebit ? 'debit' : 'credit'} balance)`,
        `${X}'s share of the General Reserve, credited: ${inr(R)}`,
        `${X}'s share of goodwill, credited: ${inr(G)}`,
        `${X}'s share of the ${lossOnReval ? 'loss' : 'profit'} on revaluation, ${lossOnReval ? 'debited' : 'credited'}: ${inr(V)}`,
      ].join('\n'),
      lines: credit ? [dr(partnerCurrent(X), B), cr(partnerCapital(X), B)] : [dr(partnerCapital(X), B), cr(partnerCurrent(X), B)],
      explanation: [
        `Balance of ${X}'s Current A/c = ${openDebit ? `-${inr(a)} (debit)` : inr(a)} + ${inr(R)} + ${inr(G)} ${lossOnReval ? '-' : '+'} ${inr(V)} = ${inr(B)} ${credit ? 'credit' : 'debit'}.`,
        credit
          ? `A credit balance is owed to ${X}: ${X}'s Current A/c is debited with ${inr(B)}, which closes it, and ${X}'s Capital A/c is credited, so that the capital account shows all that is due.`
          : `A debit balance is owed by ${X} to the firm: ${X}'s Capital A/c is debited with ${inr(B)}, which reduces what is due, and ${X}'s Current A/c is credited, which closes it.`,
      ],
      hints: [
        `Work out the balance of ${X}'s Current A/c first: is it a credit balance or a debit balance?`,
        "A credit balance is owed to the partner: Current A/c Dr, To Capital A/c. A debit balance is owed by the partner: Capital A/c Dr, To Current A/c.",
      ],
      distractorAccounts: [partnerLoan(X), 'revaluation', 'generalReserve'],
    };
  },
  verify: (q) => {
    const X = /([A-Z][a-z]+) retires/.exec(q.prompt)?.[1] ?? '';
    const line = (label: RegExp): number => rowAmount(q.prompt, label);
    const opening = line(/Current A\/c before/) * (/\(debit balance\)/.test(q.prompt) ? -1 : 1);
    const reval = line(/on revaluation/) * (/share of the loss on revaluation/.test(q.prompt) ? -1 : 1);
    const balance = opening + line(/General Reserve/) + line(/share of goodwill/) + reval;
    return balance > 0
      ? near(posted(q, partnerCurrent(X), 'Dr'), balance) && near(posted(q, partnerCapital(X), 'Cr'), balance)
      : near(posted(q, partnerCapital(X), 'Dr'), -balance) && near(posted(q, partnerCurrent(X), 'Cr'), -balance);
  },
});

/** Dates in the middle of a month, from 1 April 2025, with the months up to each: the half month counts as half. */
const MID_MONTH = [
  { text: '15 May 2025', months: 1.5 },
  { text: '15 June 2025', months: 2.5 },
  { text: '15 July 2025', months: 3.5 },
  { text: '15 August 2025', months: 4.5 },
  { text: '15 September 2025', months: 5.5 },
  { text: '15 October 2025', months: 6.5 },
  { text: '15 November 2025', months: 7.5 },
  { text: '15 December 2025', months: 8.5 },
  { text: '15 January 2026', months: 9.5 },
];
const HALF_MONTH = 'The first half of the month of death counts as half a month.';

// 5. ret-death-mid-month: a partner dies on the 15th of a month: the share of profit on the basis of time, or the
//    interest on capital, for whole months and a half (medium)
const deathMidMonth = numericTemplate({
  id: 'ret-death-mid-month', topicId: T, conceptId: 'ret-death-profit', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const date = rng.pick(MID_MONTH);
    const m = date.months;
    const whole = Math.floor(m);
    const askProfit = rng.int(0, 2) > 0;
    if (askProfit) {
      // A profit whose share for the months is whole hundreds of rupees.
      const P = clean(rng, 120000, 720000, 6000, (v) => (v * 2 * m * f.x) % (24 * f.total * 100) === 0);
      if (P === null) return null;
      const share = (P * m * f.x) / (12 * f.total);
      const n = numeric(share, [
        [(P * whole * f.x) / (12 * f.total), `Counted only the ${whole} whole months and left out the half month up to ${date.text}.`],
        [(P * (whole + 1) * f.x) / (12 * f.total), `Counted the month of death as a whole month (${whole + 1} months).`],
        [(P * (12 - m) * f.x) / (12 * f.total), 'Counted the months after the death instead of the months before it.'],
        [(P * f.x) / f.total, "Gave the deceased partner's share of a full year's profit."],
        [(P * m) / 12, 'Gave the profit of the firm for the period, not the share of the deceased partner.'],
      ]);
      return n && {
        prompt: `${settingIntro(rng, f)} ${FLUCTUATING} ${CLOSES} ${f.out} died on ${date.text}. ${BASIS_TIME} from the profit of the previous year, ${inr(P)} for the year ended 31 March 2025. ${HALF_MONTH} What is ${f.out}'s share of profit up to the date of death?`,
        ...n,
        explanation: [
          `1 April 2025 to ${date.text} is ${whole} whole months and half a month: ${m} months.`,
          `Profit of the firm for the period = ${inr(P)} x ${m}/12 = ${inr((P * m) / 12)}.`,
          `${f.out}'s share = ${inr((P * m) / 12)} x ${fr(f.x, f.total)} = ${inr(share)}.`,
        ],
        hints: H.death,
      };
    }
    const r = rng.pick([6, 8, 10, 12]);
    const K = clean(rng, 100000, 600000, 10000, (v) => (v * r * 2 * m) % 240000 === 0);
    if (K === null) return null;
    const interest = (K * r * m) / 1200;
    const n = numeric(interest, [
      [(K * r * whole) / 1200, `Counted only the ${whole} whole months and left out the half month up to ${date.text}.`],
      [(K * r * (whole + 1)) / 1200, `Counted the month of death as a whole month (${whole + 1} months).`],
      [(K * r) / 100, 'Allowed interest for a full year instead of up to the date of death.'],
      [(K * r * (12 - m)) / 1200, 'Counted the months after the death instead of the months before it.'],
    ]);
    return n && {
      prompt: `${settingIntro(rng, f)} ${FLUCTUATING} ${CLOSES} ${f.out} died on ${date.text}. ${f.out}'s capital on 1 April 2025 was ${inr(K)}, and interest on capital is allowed at ${r}% p.a. up to the date of death. ${HALF_MONTH} How much interest on capital is allowed to ${f.out}?`,
      ...n,
      explanation: [`1 April 2025 to ${date.text} is ${whole} whole months and half a month: ${m} months.`, `Interest on capital = ${inr(K)} x ${r}% x ${m}/12 = ${inr(interest)}.`],
      hints: H.death,
    };
  },
  verify: (q) => {
    const g = readFirm(q.prompt);
    const m = /died on 15 ([A-Z][a-z]+) \d{4}/.exec(q.prompt);
    if (!g || !m) return false;
    const months = MONTHS.indexOf(m[1]) + 0.5;
    const a = amountsIn(q.prompt);
    if (/interest on capital is allowed at (\d+)%/.test(q.prompt)) return near(q.answer / 100, (a[0] * intIn(q.prompt, /allowed at (\d+)%/) * months) / 1200);
    return near(q.answer / 100, ((a[0] * months) / 12) * g.x);
  },
});

// 6. ret-suspense-close: Profit and Loss Suspense A/c, debited with the share of profit of a partner who died or
//    retired during the year, closed to Profit and Loss Appropriation A/c when the year's accounts are made up (easy)
const suspenseClose = journalTemplate({
  id: 'ret-suspense-close', topicId: T, conceptId: 'ret-death-profit', difficulty: 'easy',
  generate: (rng) => {
    const f = firm(rng);
    const date = rng.pick(DATES_2025);
    const share = rng.step(6000, 90000, 500);
    const died = rng.int(0, 2) > 0;
    return {
      prompt: `${settingIntro(rng, f)} ${CLOSES} ${f.out} ${died ? 'died' : 'retired'} on ${date.text}, and ${f.out}'s share of profit up to that date, ${inr(share)}, was debited to Profit and Loss Suspense A/c and credited to ${f.out}'s Capital A/c. The firm divides the profit of each year through Profit and Loss Appropriation A/c. Pass the entry that closes Profit and Loss Suspense A/c on 31 March 2026, when the accounts of the year are made up.`,
      lines: [dr('profitAndLossAppropriation', share), cr('profitAndLossSuspense', share)],
      explanation: [
        `Profit and Loss Suspense A/c stands with a debit of ${inr(share)}: the part of the year's profit already given to ${f.out}.`,
        'When the profit of the year is known, that part is taken out of it: Profit and Loss Appropriation A/c is debited, and Profit and Loss Suspense A/c is credited, which closes it.',
        `The rest of the profit is then shared among ${list(f.stay)}.`,
      ],
      hints: [
        'What does the debit balance of Profit and Loss Suspense A/c stand for, now that the profit of the year is known?',
        "The share already credited to the partner who left is a part of the year's profit, so it comes out of the account through which that profit is divided. Which side of Profit and Loss Suspense A/c closes its debit balance?",
      ],
      distractorAccounts: ['profitAndLoss', partnerCapital(f.out), executor(f.out), 'revaluation'],
    };
  },
  verify: (q) => {
    const s = amountsIn(q.prompt)[0];
    return near(posted(q, 'profitAndLossAppropriation', 'Dr'), s) && near(posted(q, 'profitAndLossSuspense', 'Cr'), s) && q.expected.length === 2;
  },
});

/** An earmarked reserve with something left for the partners: a Workmen Compensation Reserve and a smaller claim, or an Investment Fluctuation Reserve and a smaller fall. */
interface Earmarked {
  wcr: boolean;
  reserve: number;
  /** The claim, or the fall in the value of the investments. */
  used: number;
  /** The book value of the investments; 0 for a Workmen Compensation Reserve. */
  book: number;
}
function earmarkedOf(rng: Rng, f: Firm): Earmarked | null {
  const S = mult(rng, f.total * 1000, 10000, 90000);
  if (S === null) return null;
  const used = rng.step(10000, 60000, 5000);
  const wcr = rng.int(0, 1) === 0;
  return { wcr, reserve: used + S, used, book: wcr ? 0 : rng.step(200000, 700000, 10000) };
}
const earmarkedRows = (e: Earmarked): string[] =>
  e.wcr
    ? [`Workmen Compensation Reserve: ${inr(e.reserve)}; a claim of ${inr(e.used)} for workmen's compensation is admitted`]
    : [`Investment Fluctuation Reserve: ${inr(e.reserve)}; investments of book value ${inr(e.book)} are to be shown at their market value, ${inr(e.book - e.used)}`];
function stepEarmarked(f: Firm, e: Earmarked, own: (name: string) => string): Step {
  const S = e.reserve - e.used;
  const parts = inOld(f, S);
  const name = e.wcr ? 'Workmen Compensation Reserve' : 'Investment Fluctuation Reserve';
  return {
    text: e.wcr ? 'Deal with the Workmen Compensation Reserve and the claim.' : 'Deal with the Investment Fluctuation Reserve and the fall in the value of the investments.',
    lines: [dr(e.wcr ? 'workmenCompensationReserve' : 'investmentFluctuationReserve', e.reserve), cr(e.wcr ? 'workmenCompensationClaim' : 'investments', e.used), ...f.names.map((n, i) => cr(own(n), parts[i]))],
    explanation: [
      `${name} A/c is debited with the whole ${inr(e.reserve)}, which closes it.`,
      e.wcr ? `The claim of ${inr(e.used)} is met from it and becomes a liability: Workmen Compensation Claim A/c is credited.` : `The fall in value, ${inr(e.book)} - ${inr(e.book - e.used)} = ${inr(e.used)}, is met from it: Investments A/c is credited.`,
      `What is left, ${inr(e.reserve)} - ${inr(e.used)} = ${inr(S)}, is free reserve shared by all the partners in the old ratio ${rt(f.old)}, through their current accounts: ${named(f.names, parts)}.`,
    ],
  };
}

/** What a set on a retirement with fixed capitals is made from, in the order of the names. */
interface FixedRetirement {
  f: Firm;
  g: Gain;
  K: number;
  /** The retiring partner's current account before the adjustments: a credit balance positive, a debit balance negative. */
  c: number;
  R: number;
  V: number;
  G: number;
  e: Earmarked;
  paid: number;
}
function fixedRetirementOf(rng: Rng): FixedRetirement | null {
  const f = firm(rng);
  const g = gainOf(rng, f, ['silent', 'split', 'agreed', 'one']);
  if (!g) return null;
  const unit = f.total * 1000;
  const R = mult(rng, unit, 30000, 180000);
  const v = mult(rng, unit, 10000, 90000);
  const G = mult(rng, f.total * sum(g.w) * 1000, 60000, 600000);
  const e = earmarkedOf(rng, f);
  if (R === null || v === null || G === null || e === null) return null;
  const V = rng.int(0, 1) === 0 ? v : -v;
  const K = rng.step(100000, 500000, 10000);
  const c = rng.step(5000, 60000, 1000) * (rng.int(0, 3) === 0 ? -1 : 1);
  const due = K + c + ((R + V + e.reserve - e.used + G) * f.x) / f.total;
  const paid = rng.int(0, 1) === 0 ? (clean(rng, 50000, due - 50000, 10000, (p) => p <= 0.6 * due) ?? 0) : 0;
  return due > 100000 ? { f, g, K, c, R, V, G, e, paid } : null;
}

/** The amount due to the retiring partner in a set on fixed capitals, and the balance of that partner's current account after the adjustments. */
const fixedDue = (s: FixedRetirement): { current: number; due: number } => {
  const current = s.c + ((s.R + s.V + s.e.reserve - s.e.used + s.G) * s.f.x) / s.f.total;
  return { current, due: s.K + current };
};

// 7. ret-set-fixed-capitals: a retirement when capitals are fixed: an earmarked reserve, the General Reserve and the
//    result of revaluation through the current accounts, goodwill between the current accounts, the retiring
//    partner's current account closed to the capital account, and the capital account settled (complex)
const setFixedCapitals = journalSetTemplate({
  id: 'ret-set-fixed-capitals', topicId: T, conceptId: 'ret-sets', difficulty: 'complex',
  generate: (rng) =>
    attempt(10, () => {
      const s = fixedRetirementOf(rng);
      if (!s) return null;
      const { f, g, e } = s;
      const X = f.out;
      const { current, due } = fixedDue(s);
      if (current === 0) return null;
      const reserve = stepAccumulated(f, ACCUMULATED.reserve, s.R);
      const revaluation = stepRevaluation(f, s.V, `Revaluation A/c shows a ${s.V > 0 ? 'profit' : 'loss'} of ${inr(Math.abs(s.V))}.`);
      const goodwill = stepGoodwill(f, g, s.G);
      const toCurrent = (lines: JournalLine[]): JournalLine[] => lines.map((l) => (l.accountId.startsWith('capital:') ? { ...l, accountId: partnerCurrent(l.accountId.slice('capital:'.length)) } : l));
      // Capitals are fixed: the current accounts take each of these entries in place of the capital accounts.
      const words = (t: string): string => t.replace(/capital accounts/g, 'current accounts').replace(/Capital A\/c/g, 'Current A/c');
      const throughCurrent = (step: Step): Step => ({ ...step, lines: toCurrent(step.lines), explanation: step.explanation.map(words) });
      const shares = ((s.R + e.reserve - e.used) * f.x) / f.total;
      const B = Math.abs(current);
      const settle = stepSettle(f, due, s.paid > 0 ? { kind: 'part', paid: s.paid } : { kind: 'loan' }, `${inr(s.K)} (capital) ${current > 0 ? '+' : '-'} ${inr(B)} (current account)`);
      const steps: Step[] = [
        stepEarmarked(f, e, partnerCurrent),
        throughCurrent(reserve),
        throughCurrent(revaluation),
        throughCurrent(goodwill),
        {
          text: `Transfer the balance of ${X}'s Current A/c to ${X}'s Capital A/c.`,
          lines: current > 0 ? [dr(partnerCurrent(X), B), cr(partnerCapital(X), B)] : [dr(partnerCapital(X), B), cr(partnerCurrent(X), B)],
          explanation: [
            `${X}'s Current A/c: ${s.c > 0 ? `credit balance ${inr(s.c)}` : `debit balance ${inr(-s.c)}`}, + ${inr(shares)} (shares of the reserves) ${s.V > 0 ? '+' : '-'} ${inr((Math.abs(s.V) * f.x) / f.total)} (share of the ${s.V > 0 ? 'profit' : 'loss'} on revaluation) + ${inr((s.G * f.x) / f.total)} (goodwill) = ${inr(B)} ${current > 0 ? 'credit' : 'debit'}.`,
            current > 0
              ? `The credit balance is owed to ${X}: ${X}'s Current A/c is debited, which closes it, and ${X}'s Capital A/c is credited.`
              : `The debit balance is owed by ${X}: ${X}'s Capital A/c is debited and ${X}'s Current A/c is credited, which closes it.`,
          ],
        },
        settle,
      ];
      return {
        task: `Pass the necessary journal entries on ${X}'s retirement.`,
        opening: [
          `${settingIntro(rng, f)} Capitals are fixed: each partner has a capital account and a current account. ${X} retires on ${RETIRE_ON}; ${g.text}. Every adjustment is made through the current accounts; the balance of ${X}'s Current A/c is then transferred to ${X}'s Capital A/c. ${settleSays(f, s.paid > 0 ? { kind: 'part', paid: s.paid } : { kind: 'loan' })}`,
          `${X}'s Capital A/c: ${inr(s.K)}`,
          `${X}'s Current A/c: ${inr(Math.abs(s.c))} (${s.c > 0 ? 'credit' : 'debit'} balance)`,
          `General Reserve: ${inr(s.R)} (the whole of it is distributed)`,
          ...earmarkedRows(e),
          `${s.V > 0 ? 'Profit' : 'Loss'} on revaluation, as shown by Revaluation A/c: ${inr(Math.abs(s.V))}`,
          `Goodwill of the firm, valued on the retirement: ${inr(s.G)} (adjusted without opening Goodwill A/c)`,
        ].join('\n'),
        transactions: lettered(steps),
        hints: [
          "Capitals are fixed: which account of each partner takes the reserves, the result of revaluation and goodwill? Where does the retiring partner's current account go at the end?",
          "Reserves and the result of revaluation go to all the current accounts in the old ratio; goodwill is debited to the current accounts of the partners who gain. The retiring partner's current account is then closed to the capital account, and the capital account is paid or transferred to the loan account.",
        ],
        distractorAccounts: ['goodwill', 'profitAndLossAppropriation', partnerCapital(f.stay[0]), partnerCapital(f.stay[1])],
      };
    }),
  verify: (q) => {
    const [, first = '', ...rows] = q.prompt.split('\n');
    const g = readFirm(first);
    const gain = g && readGain(first, g);
    if (!g || !gain) return false;
    const row = (label: RegExp): number => {
      const line = rows.find((l) => label.test(l));
      return line === undefined ? 0 : amountsIn(line)[0];
    };
    const X = g.out;
    const K = row(new RegExp(`^${X}'s Capital A/c`));
    const c = row(new RegExp(`^${X}'s Current A/c`)) * (rows.some((l) => /\(debit balance\)/.test(l)) ? -1 : 1);
    const R = row(/^General Reserve/);
    const wcrLine = rows.find((l) => /^Workmen Compensation Reserve/.test(l));
    const ifrLine = rows.find((l) => /^Investment Fluctuation Reserve/.test(l));
    const wcr = wcrLine ? amountsIn(wcrLine) : [];
    const ifr = ifrLine ? amountsIn(ifrLine) : [];
    const left = wcrLine ? wcr[0] - wcr[1] : ifr[0] - (ifr[1] - ifr[2]);
    const V = row(/^Profit on revaluation/) - row(/^Loss on revaluation/);
    const G = row(/^Goodwill of the firm/);
    const pool = R + left + V;
    const current = c + (pool + G) * g.x;
    const due = K + current;
    const part = /(₹[\d,]+) of the amount due to/.exec(first);
    const cheque = part ? amountsIn(part[1])[0] : 0;
    const ledger = post(q.entries.map((e) => e.expected));
    const net = (accountId: string): number => netOf(ledger, accountId);
    return (
      setHolds()(q) &&
      near(net(partnerCurrent(X)), c) &&
      near(net(partnerCapital(X)), K) &&
      near(-net(partnerLoan(X)), due - cheque) &&
      near(-net('bank'), cheque) &&
      g.stay.every((name, i) => near(-net(partnerCurrent(name)), pool * g.stayShare[i] - G * gain[i]) && near(net(partnerCapital(name)), 0)) &&
      near(net('generalReserve'), R) &&
      near(net(wcrLine ? 'workmenCompensationReserve' : 'investmentFluctuationReserve'), wcrLine ? wcr[0] : ifr[0])
    );
  },
});

const currentKept = keepFor<{ s: FixedRetirement; opening: number[] }>();

// 8. ret-fmt-current-accounts: the partners' current accounts in columns on a retirement when capitals are fixed:
//    the opening balances (one of them a debit balance in some seeds), an earmarked reserve, the General Reserve,
//    the result of revaluation and goodwill, the retiring partner's column closed to the capital account (medium)
const fmtCurrentAccounts = accountTemplate({
  id: 'ret-fmt-current-accounts', topicId: T, conceptId: 'ret-formats', difficulty: 'medium',
  generate: (rng) =>
    attempt(10, () => {
      const s = fixedRetirementOf(rng);
      if (!s) return null;
      const { f, g, e } = s;
      const X = f.out;
      const o = f.names.indexOf(X);
      const opening = f.names.map((_, i) => (i === o ? s.c : rng.step(5000, 50000, 1000) * (rng.int(0, 4) === 0 ? -1 : 1)));
      const { current } = fixedDue(s);
      if (current === 0) return null;
      const B = Math.abs(current);
      const toCurrent = (lines: JournalLine[]): JournalLine[] => lines.map((l) => (l.accountId.startsWith('capital:') ? { ...l, accountId: partnerCurrent(l.accountId.slice('capital:'.length)) } : l));
      const entries: DatedEntry[] = [
        stepEarmarked(f, e, partnerCurrent).lines,
        toCurrent(stepAccumulated(f, ACCUMULATED.reserve, s.R).lines),
        toCurrent(stepRevaluation(f, s.V, '').lines),
        toCurrent(stepGoodwill(f, g, s.G).lines),
        current > 0 ? [dr(partnerCurrent(X), B), cr(partnerCapital(X), B)] : [dr(partnerCapital(X), B), cr(partnerCurrent(X), B)],
      ].map((lines) => on(RETIRE_ON, lines));
      const result = s.V > 0 ? 'profit' : 'loss';
      const revaluationRow = `Revaluation A/c (${result})`;
      const view = columnarAccount(
        entries,
        f.names.map(partnerCurrent),
        { date: RETIRE_ON, balances: opening.map((v) => ({ side: v > 0 ? ('Cr' as const) : ('Dr' as const), amount: rupees(Math.abs(v)) })) },
        (id) => (id === 'revaluation' ? revaluationRow : ledgerLabel(id)),
      );
      // The retiring partner's column closes; a continuing partner is left with a balance either way.
      if (view.balances.some((b, i) => (i === o ? b !== null : b === null))) return null;
      const sides = columnarSides(view, { closeOn: RETIRE_ON });
      const plain = (rows: FormatRowParts[]): FormatRowParts[] => rows.map((r) => (r.label === revaluationRow ? { ...r, also: ['Revaluation A/c'] } : r));
      const data = [
        `${settingIntro(rng, f)} Capitals are fixed: each partner has a capital account and a current account. ${X} retires on ${RETIRE_ON}; ${g.text}.`,
        `Current accounts on that date, before the adjustments: ${f.names.map((name, i) => `${name} ${inr(Math.abs(opening[i]))} (${opening[i] > 0 ? 'Cr' : 'Dr'})`).join(', ')}`,
        `General Reserve: ${inr(s.R)}`,
        ...earmarkedRows(e),
        `Revaluation A/c shows a ${result} of ${inr(Math.abs(s.V))}.`,
        `The goodwill of the firm is valued at ${inr(s.G)}; it is adjusted without opening Goodwill A/c.`,
        `Every adjustment is made through the current accounts. The balance of ${X}'s Current A/c is then transferred to ${X}'s Capital A/c.`,
      ].join('\n');
      currentKept.keep(data, { s, opening });
      const { s: share, parts: gw } = goodwillParts(f, g, s.G);
      const left = e.reserve - e.used;
      const each = (i: number): number => opening[i] + ((s.R + left + s.V) * f.old[i]) / f.total + (i === o ? share : -gw[f.stay.indexOf(f.names[i])]);
      return {
        task: `Prepare the partners' current accounts in columns on ${X}'s retirement on ${RETIRE_ON}, closing ${X}'s current account by transfer to ${X}'s Capital A/c and carrying down the balances of ${list(f.stay)}.`,
        data,
        title: "Partners' Current Accounts",
        columns: partnerColumns(f.names),
        ...sides,
        left: { ...sides.left, rows: plain(sides.left.rows) },
        right: { ...sides.right, rows: plain(sides.right.rows) },
        distractors: ['Goodwill A/c', `Revaluation A/c (${s.V > 0 ? 'loss' : 'profit'})`, `${X}'s Loan A/c`, 'Profit and Loss Appropriation A/c', e.wcr ? 'Investment Fluctuation Reserve A/c' : 'Workmen Compensation Reserve A/c'],
        explanation: [
          'Each partner has a column. A credit balance opens the credit side ("By Balance b/d"); a debit balance, drawn beyond what was credited, opens the debit side ("To Balance b/d").',
          `${e.wcr ? 'Workmen Compensation Reserve' : 'Investment Fluctuation Reserve'}: ${inr(e.reserve)} less the ${e.wcr ? 'claim' : 'fall in value'} of ${inr(e.used)} leaves ${inr(left)}, credited in the old ratio ${rt(f.old)}: ${named(f.names, inOld(f, left))}.`,
          `General Reserve ${inr(s.R)}, credited in the old ratio: ${named(f.names, inOld(f, s.R))}.`,
          `The ${result} on revaluation, ${inr(Math.abs(s.V))}, is ${s.V > 0 ? 'credited' : 'debited'} in the old ratio: ${named(f.names, inOld(f, Math.abs(s.V)))}.`,
          `${X}'s share of goodwill = ${inr(s.G)} x ${fr(f.x, f.total)} = ${inr(share)}. ${g.why}: ${f.stay.map((name, i) => (gw[i] > 0 ? `${name} ${inr(gw[i])}` : '')).filter((t) => t !== '').join(', ')}, debited ("To ${X}'s Current A/c") and credited to ${X}.`,
          `${X}'s column: ${inr(B)} ${current > 0 ? 'credit' : 'debit'} is left, transferred ${current > 0 ? `"To ${X}'s Capital A/c"` : `"By ${X}'s Capital A/c"`}, which closes the column.`,
          ...f.names.flatMap((name, i) => (i === o ? [] : [`${name}'s column: ${inr(Math.abs(each(i)))} ${each(i) > 0 ? 'credit, carried down "To Balance c/d"' : 'debit, carried down "By Balance c/d"'}.`])),
        ],
        hints: [
          'Capitals are fixed: every adjustment of the retirement goes to the current accounts. Which items go to all three in the old ratio, and which only to the partners who gain?',
          "Reserves and the result of revaluation go to every column in the old ratio; goodwill is debited to the partners who gain and credited to the retiring partner, whose column is closed by transfer to that partner's capital account.",
        ],
      };
    }),
  verify: (q) => {
    const kept = currentKept.of(q.data);
    if (!kept) return false;
    const { s, opening } = kept;
    const { f, g } = s;
    const o = f.names.indexOf(f.out);
    // Each column worked again: opening, the reserves and revaluation in the old ratio, then goodwill.
    const G = (s.G * f.x) / f.total;
    const pays = f.stay.map((_, i) => (G * g.w[i]) / sum(g.w));
    const balance = f.names.map((name, i) => opening[i] + ((s.R + s.e.reserve - s.e.used + s.V) * f.old[i]) / f.total + (i === o ? G : -pays[f.stay.indexOf(name)]));
    const [debit, credit] = q.sides;
    const colTotal = (rows: readonly FormatRow[], i: number): number => sum(rows.map((r) => r.amounts[i])) / 100;
    const transfer = [...debit.rows, ...credit.rows].filter((r) => r.label === `${f.out}'s Capital A/c`);
    const carried = (side: readonly FormatRow[], i: number): number => rowRupees(side.find((r) => r.label === 'Balance c/d'), i) || 0;
    return (
      transfer.length === 1 &&
      near(rowRupees(transfer[0], o), Math.abs(balance[o])) &&
      f.names.every((_, i) => near(colTotal(debit.rows, i), colTotal(credit.rows, i))) &&
      f.names.every((_, i) => i === o || near(carried(debit.rows, i) - carried(credit.rows, i), balance[i]))
    );
  },
});

const templates: Template[] = [
  ratioNoInfo, ratioOneTakes, gainRatioStated, ratioShareInRatio, gainRatioAgreed, gainWithSacrifice, ratioTwoOfThree,
  gwShare, gwEntryOneTakes, gwWrittenOff, gwEntryGaining, gwEntryNewRatio, gwHidden, gwNetEffect, gwEntrySacrifice, gwValuationShare,
  reserveShare, reserveEntry, revalEntry, revalShare, accumulatedLossEntry,
  settleLoanAmount, settleEntry, amountDue, amountDueMidyear, amountDueReverse,
  loanInterest, loanInstalment, loanFirstClose, loanPaymentEntry, loanSecondClose,
  capNewCapital, capCash, capShortfall, capEntry, capPayRetiring,
  deathMonths, deathProfitLastYear, deathProfitAverage, deathProfitTurnover, deathProfitEntry, deathProfitRateChange,
  execEntry, execAmount, execFirstPayment, execAmountFull,
  setGoodwill,
  setRetirement, setDeath, setWholeRetirement,
  fmtRevaluation, fmtCapitals,
  fmtLoan, fmtDeceasedCapital, fmtExecutor,
  fmtBalanceSheet,
  retAssertionReason,
  // Added later, outside the papers (outsidePapers.ts).
  wcrClaim, ifrEntry, earmarkedShare, currentTransfer, deathMidMonth, suspenseClose,
  setFixedCapitals,
  fmtCurrentAccounts,
];

export default templates;
