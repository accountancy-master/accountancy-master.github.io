import type { AccountQuestion, JournalQuestion, JournalSetQuestion, McqQuestion, NumericQuestion, RatioQuestion } from '@/content/types';
import { partnerCapital, partnerCurrent, partnerDrawings } from '@/engine/accounts';
import { accountOf, columnLabel, columnarAccount, ledgerLabel, post, trialBalance, type ColumnarView, type DatedEntry, type Posting } from '@/engine/books';
import type { JournalLine } from '@/engine/journal';
import type { Rng } from '@/engine/rng';
import { assertionReasonFacts, factsTemplate, accountTemplate, columnarSides, crSide, drSide, formatINR, journalSetTemplate, journalTemplate, keepFor, lowestTerms, mcqTemplate, numericTemplate, partnerColumns, rupees, setHolds } from '../authoring';
import type { AccountParts, FormatRowParts, McqParts, NumericParts, RatioParts, SetTransaction, Template } from '../types';

const T = 'admission-of-a-partner';

// ---------------------------------------------------------------------------------------------------------------
// Conventions used throughout (and stated in the prompts that rely on them):
//  - a partner is admitted on 1 April, the first day of the accounting year;
//  - goodwill follows AS 26: no goodwill account is raised; a premium brought in is shared by the sacrificing
//    partners in the sacrificing ratio; a share of goodwill not brought in is debited to the new partner's current
//    (or capital) account, whichever the prompt names; goodwill already in the books is written off among the old
//    partners in the old ratio;
//  - reserves, accumulated profits and losses and the result of revaluation belong to the old partners in the old
//    ratio; with fixed capitals these adjustments pass through the current accounts, and the prompt says so;
//  - every share is an exact fraction (no decimals) and every amount is in whole rupees: a combination that would
//    leave a fraction of a rupee is rejected.
// ---------------------------------------------------------------------------------------------------------------

/** Whole rupees as the amount text a learner sees. */
const inr = (n: number): string => formatINR(rupees(n));
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b;
/** "Asha and Bhavna", "Asha, Bhavna and Chetan". */
const list = (xs: readonly string[]): string => (xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

// A share of profit is kept as an exact fraction, [numerator, denominator], in lowest terms.
export type Frac = readonly [number, number];
export const fr = (n: number, d: number): Frac => {
  const g = gcd(n, d) || 1;
  return [n / g, d / g];
};
export const ZERO: Frac = [0, 1];
export const ONE: Frac = [1, 1];
export const plus = (a: Frac, b: Frac): Frac => fr(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
export const minus = (a: Frac, b: Frac): Frac => fr(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
export const times = (a: Frac, b: Frac): Frac => fr(a[0] * b[0], a[1] * b[1]);
/** a / b, for b above zero. */
export const over = (a: Frac, b: Frac): Frac => fr(a[0] * b[1], a[1] * b[0]);
export const isPos = (a: Frac): boolean => a[0] > 0;
const sameFrac = (a: Frac, b: Frac): boolean => a[0] === b[0] && a[1] === b[1];
export const fs = (a: Frac): string => (a[1] === 1 ? String(a[0]) : `${a[0]}/${a[1]}`);
/** A fraction of an amount; not a whole number when the amount does not divide. */
export const of = (amount: number, f: Frac): number => (amount * f[0]) / f[1];
/** The shares a ratio stands for: 3:2 is 3/5 and 2/5. */
export const sharesOf = (ratio: readonly number[]): Frac[] => ratio.map((t) => fr(t, sum(ratio)));
/** The ratio between some shares, in lowest terms; null when a share is not above zero. */
export function ratioOf(fracs: readonly Frac[]): number[] | null {
  if (!fracs.every(isPos)) return null;
  const den = fracs.reduce((l, f) => lcm(l, f[1]), 1);
  return lowestTerms(fracs.map((f) => f[0] * (den / f[1])));
}
export const rs = (r: readonly number[]): string => r.join(':');
const sameTerms = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((t, i) => t === b[i]);
/** The shares written over their common denominator: 12/25, 8/25, 5/25. */
function overCommon(fracs: readonly Frac[]): string[] {
  const den = fracs.reduce((l, f) => lcm(l, f[1]), 1);
  return fracs.map((f) => `${f[0] * (den / f[1])}/${den}`);
}

/** A rupee answer and its named mistakes, in paise. Mistakes that are not whole rupees, or repeat a value, are dropped; null when fewer than two remain. */
export function money(answer: number, errs: [number, string][]): Pick<NumericParts, 'answer' | 'commonErrors'> | null {
  if (!Number.isInteger(answer) || answer <= 0) return null;
  const seen = new Set([answer]);
  const commonErrors: { value: number; why: string }[] = [];
  for (const [v, why] of errs) if (Number.isInteger(v) && v > 0 && !seen.has(v) && seen.add(v)) commonErrors.push({ value: rupees(v), why });
  return commonErrors.length >= 2 ? { answer: rupees(answer), commonErrors } : null;
}

/** A ratio answer and its named mistakes. A mistake that cannot be written as a ratio (a term at or below zero) is dropped; null when fewer than two remain. */
export function ratio(answer: number[] | null, errs: [number[] | null, string][]): Pick<RatioParts, 'answer' | 'commonErrors'> | null {
  if (!answer) return null;
  const seen = new Set([rs(answer)]);
  const commonErrors: { value: number[]; why: string }[] = [];
  for (const [v, why] of errs) {
    if (!v || v.length !== answer.length || v.some((t) => !Number.isInteger(t) || t <= 0)) continue;
    const low = lowestTerms(v);
    if (!seen.has(rs(low)) && seen.add(rs(low))) commonErrors.push({ value: low, why });
  }
  return commonErrors.length >= 2 ? { answer, commonErrors } : null;
}

/** A multiple-choice question; null when fewer than three distinct wrong options remain. */
export function choice(prompt: string, correct: string, wrong: [string | null, string][], explanation: string, hints?: string[]): McqParts | null {
  const seen = new Set([correct]);
  const distractors: { text: string; why: string }[] = [];
  for (const [text, why] of wrong) if (text !== null && !seen.has(text) && seen.add(text)) distractors.push({ text, why });
  if (distractors.length < 3) return null;
  return { prompt, correct, distractors, explanation, ...(hints ? { hints } : {}) };
}

const Dr = (accountId: string, n: number): JournalLine => ({ accountId, side: 'Dr', amount: rupees(n) });
const Cr = (accountId: string, n: number): JournalLine => ({ accountId, side: 'Cr', amount: rupees(n) });
/** The lines of an entry that carry an amount: a partner who gets or gives nothing has no line. */
export const entry = (...lines: JournalLine[]): JournalLine[] => lines.filter((l) => l.amount > 0);

// ---------------------------------------------------------------------------------------------------------------
// The firm and the admission
// ---------------------------------------------------------------------------------------------------------------

export const NAMES = [
  'Asha', 'Bhavna', 'Chetan', 'Deepak', 'Esha', 'Farhan', 'Gauri', 'Harish', 'Indu', 'Jatin', 'Kavita', 'Lokesh', 'Meera', 'Naveen',
  'Pooja', 'Rohit', 'Sneha', 'Tarun', 'Uma', 'Vivek', 'Yamini', 'Zubin', 'Anwar', 'Dinesh', 'Girija', 'Imran', 'Mohan', 'Nisha', 'Rekha', 'Sunil',
];
const FIRMS = [
  'a textile agency in Surat', 'a furniture showroom in Jodhpur', 'a spice trading firm in Kochi', 'a stationery business in Pune',
  'a hardware store in Ludhiana', 'a garment unit in Tiruppur', 'a tea trading firm in Guwahati', 'a printing press in Sivakasi',
  'a sports goods firm in Meerut', 'a handloom business in Bhagalpur',
];
const YEARS = [2024, 2025, 2026];

const OLD2: number[][] = [[3, 2], [2, 1], [5, 3], [4, 1], [3, 1], [7, 3], [4, 3], [5, 4], [5, 2], [7, 5], [1, 1], [3, 2], [2, 1], [5, 3], [2, 3], [1, 2], [3, 5], [1, 3]];
const OLD3: number[][] = [[5, 3, 2], [3, 2, 1], [4, 3, 2], [2, 2, 1], [3, 3, 2], [5, 4, 1], [4, 3, 1], [2, 1, 1], [5, 3, 2], [6, 3, 1], [3, 2, 2], [1, 1, 1], [4, 2, 1]];
const SHARES: Frac[] = [[1, 4], [1, 5], [1, 6], [1, 3], [1, 8], [1, 10], [2, 5], [1, 7], [3, 10], [1, 5], [1, 4], [1, 6], [2, 7], [1, 9]];
const SPLITS2: number[][] = [[2, 1], [1, 2], [3, 1], [1, 3], [3, 2], [2, 3], [4, 1], [1, 4]];
const SPLITS3: number[][] = [[2, 2, 1], [3, 2, 1], [2, 1, 1], [1, 2, 1], [1, 2, 2], [3, 1, 1], [1, 1, 2]];
const SURRENDER: Frac[] = [[1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [2, 5], [1, 8], [1, 10], [3, 10], [1, 4], [1, 3]];

/**
 * How the new partner's share is acquired, the standard cases: the old partners keep their old ratio ('old'), the
 * share is taken equally ('equal'), in a stated ratio ('stated'), wholly from one partner ('one'), or each old
 * partner surrenders a fraction of the partner's own share ('surrender').
 */
export type DealKind = 'old' | 'equal' | 'stated' | 'one' | 'surrender';

export interface Deal {
  kind: DealKind;
  olds: string[];
  /** The new partner. */
  nw: string;
  /** The old partners and then the new one: the order every ratio is asked in. */
  names: string[];
  old: number[];
  oldShares: Frac[];
  /** The new partner's share. */
  share: Frac;
  /** What each old partner gives up; zero for one who gives up nothing. */
  given: Frac[];
  /** The new shares, the new partner's last. */
  news: Frac[];
  newRatio: number[];
  /** The sacrificing ratio of the old partners; null when one of them gives up nothing. */
  sac: number[] | null;
  /** Each old partner's part of anything shared in the sacrificing ratio (a premium): given / share. */
  parts: Frac[];
  year: number;
  /** "Asha and Bhavna are partners in ..., sharing profits and losses in the ratio 3:2." */
  open: string;
  /** "On 1 April 2025, Chetan is admitted as a partner for 1/5 share in the profits." */
  admit: string;
  /** How the share is acquired, as the question says it. */
  how: string;
  /** 'stated': the ratio in which the share is given up, and whether the prompt gives it as two fractions instead. */
  split?: number[];
  asParts?: boolean;
  /** 'one': which old partner gives the share up. */
  giver?: number;
  /** 'surrender': the fraction of the partner's own share each old partner gives up. */
  cut?: Frac[];
}

/** Ratios stay readable: the terms of a new ratio add up to no more than this. */
const TIDY = 80;

function opening(rng: Rng, olds: readonly string[], old: readonly number[]): string {
  const firm = rng.pick(FIRMS);
  return rng.pick([
    `${list(olds)} are partners in ${firm}, sharing profits and losses in the ratio ${rs(old)}.`,
    `${list(olds)} run ${firm} in partnership and share profits and losses in the ratio ${rs(old)}.`,
    `${list(olds)} are partners sharing profits and losses in the ratio ${rs(old)}.`,
  ]);
}

/** One admission of the kind asked for, or null when no tidy combination turns up in a few draws. */
export function deal(rng: Rng, kinds: DealKind | readonly DealKind[], m = 2): Deal | null {
  const names = rng.shuffle(NAMES).slice(0, m + 1);
  const olds = names.slice(0, m);
  const nw = names[m];
  const year = rng.pick(YEARS);
  const kind = typeof kinds === 'string' ? kinds : rng.pick(kinds);
  for (let attempt = 0; attempt < 12; attempt++) {
    const old = rng.pick(m === 2 ? OLD2 : OLD3);
    const oldShares = sharesOf(old);
    let share = rng.pick(SHARES);
    let given: Frac[];
    let how: string;
    const extra: Pick<Deal, 'split' | 'asParts' | 'giver' | 'cut'> = {};
    if (kind === 'old') {
      given = oldShares.map((s) => times(s, share));
      how = rng.pick([`${list(olds)} will share the remaining profit in their old ratio.`, 'The old partners keep their old ratio between themselves.']);
    } else if (kind === 'equal') {
      given = olds.map(() => fr(share[0], share[1] * m));
      how = rng.pick([`${nw} acquires this share equally from ${list(olds)}.`, `${list(olds)} give up this share equally.`]);
    } else if (kind === 'stated') {
      const split = rng.pick(m === 2 ? SPLITS2 : SPLITS3);
      const asParts = m === 2 && rng.int(0, 3) === 0;
      given = split.map((x) => times(share, fr(x, sum(split))));
      how = asParts
        ? `Of this share, ${nw} acquires ${fs(given[0])} from ${olds[0]} and ${fs(given[1])} from ${olds[1]}.`
        : rng.pick([`${nw} acquires this share from ${list(olds)} in the ratio ${rs(split)}.`, `${list(olds)} give up this share in the ratio ${rs(split)}.`]);
      extra.split = split;
      extra.asParts = asParts;
    } else if (kind === 'one') {
      const giver = rng.int(0, m - 1);
      given = olds.map((_, i) => (i === giver ? share : ZERO));
      how = rng.pick([`${nw} acquires the whole of this share from ${olds[giver]}.`, `${olds[giver]} alone gives up this share.`]);
      extra.giver = giver;
    } else {
      const cut = olds.map(() => rng.pick(SURRENDER));
      given = oldShares.map((s, i) => times(s, cut[i]));
      share = given.reduce(plus);
      // A new partner is not handed more than two-fifths of the firm.
      if (share[0] * 5 > share[1] * 2) continue;
      how = `${list(olds.map((n, i) => `${n} surrenders ${fs(cut[i])} of ${n}'s share`))} in favour of ${nw}.`;
      extra.cut = cut;
    }
    const news = [...oldShares.map((s, i) => minus(s, given[i])), share];
    const newRatio = ratioOf(news);
    if (!newRatio || sum(newRatio) > TIDY) continue;
    // Nobody hands over most of a share: every old partner keeps at least a third of the old one.
    if (oldShares.some((s, i) => news[i][0] * s[1] * 3 < s[0] * news[i][1])) continue;
    const forShare = kind === 'surrender' ? '' : ` for ${fs(share)} share`;
    const admit = rng.pick([
      `On 1 April ${year}, ${nw} is admitted as a partner${forShare}${forShare ? ' in the profits' : ''}.`,
      `${nw} is admitted into the firm on 1 April ${year}${forShare}${forShare ? ' of the profits' : ''}.`,
    ]);
    return {
      kind, olds, nw, names, old, oldShares, share, given, news, newRatio, year, how, admit, ...extra,
      sac: ratioOf(given),
      parts: given.map((g) => over(g, share)),
      open: opening(rng, olds, old),
    };
  }
  return null;
}

/** A deal of one of several kinds, drawn. */
const dealOf = (rng: Rng, kinds: readonly DealKind[], m = 2): Deal | null => deal(rng, kinds, m);

/** A deal the question can use: a few are drawn until one passes `ok`, so that a seed is seldom turned away. */
export function dealWhere(rng: Rng, kinds: DealKind | readonly DealKind[], ok: (d: Deal) => boolean, m = 2): Deal | null {
  for (let attempt = 0; attempt < 8; attempt++) {
    const d = deal(rng, kinds, m);
    if (d && ok(d)) return d;
  }
  return null;
}

/** The new shares had the old partners kept their old ratio, whatever the question says. */
const asOld = (d: Deal): Frac[] => [...d.oldShares.map((s) => times(s, minus(ONE, d.share))), d.share];
/** The new shares had the new partner's share been taken equally from the old partners. */
const asEqual = (d: Deal): Frac[] => [...d.oldShares.map((s) => minus(s, fr(d.share[0], d.share[1] * d.olds.length))), d.share];

/** Working: what each old partner gives up. */
export function givesSteps(d: Deal): string[] {
  const { olds, nw, share, given, oldShares } = d;
  switch (d.kind) {
    case 'old':
      return [`The old partners keep their old ratio ${rs(d.old)}, so they give up ${nw}'s ${fs(share)} in that ratio: ${olds.map((n, i) => `${n} ${fs(share)} x ${fs(oldShares[i])} = ${fs(given[i])}`).join('; ')}.`];
    case 'equal':
      return [`Each old partner gives up ${fs(share)} x 1/${olds.length} = ${fs(given[0])}.`];
    case 'stated':
      return d.asParts
        ? [`${olds[0]} gives up ${fs(given[0])} and ${olds[1]} gives up ${fs(given[1])}, as stated.`]
        : [`${olds.map((n, i) => `${n} gives up ${fs(share)} x ${d.split![i]}/${sum(d.split!)} = ${fs(given[i])}`).join('; ')}.`];
    case 'one':
      return [`${olds[d.giver!]} alone gives up ${fs(share)}; ${list(olds.filter((_, i) => i !== d.giver))} ${olds.length === 2 ? 'gives' : 'give'} up nothing.`];
    case 'surrender':
      return [
        `${olds.map((n, i) => `${n} gives up ${fs(d.cut![i])} of ${fs(oldShares[i])} = ${fs(given[i])}`).join('; ')}.`,
        `${nw} gets ${given.map(fs).join(' + ')} = ${fs(share)}.`,
      ];
  }
}

/** Working: the new share of each partner and the new ratio. */
export function newShareSteps(d: Deal): string[] {
  return [
    `${d.olds.map((n, i) => (isPos(d.given[i]) ? `${n}'s new share = ${fs(d.oldShares[i])} - ${fs(d.given[i])} = ${fs(d.news[i])}` : `${n} keeps ${fs(d.oldShares[i])}`)).join('; ')}; ${d.nw}'s share = ${fs(d.share)}.`,
    `New ratio of ${list(d.names)} = ${overCommon(d.news).join(' : ')} = ${rs(d.newRatio)}.`,
  ];
}

/** Working: the sacrificing ratio, or who alone sacrifices. */
export const sacStep = (d: Deal): string =>
  d.sac ? `Sacrificing ratio of ${list(d.olds)} = ${d.given.map(fs).join(' : ')} = ${rs(d.sac)}.` : `Only ${d.olds[d.giver!]} sacrifices, so ${d.olds[d.giver!]} alone is compensated.`;

const capsText = (fixed: boolean): string =>
  fixed ? "The firm keeps fixed capital accounts, so an adjustment of this kind is passed through the partners' current accounts." : 'The capital accounts are fluctuating.';

// ---------------------------------------------------------------------------------------------------------------
// Reading a question back, for `verify`: the figures are taken from the prompt and worked again in plain decimals,
// so a slip in the fractions above, or a prompt that does not say what the answer relies on, is caught.
// ---------------------------------------------------------------------------------------------------------------

export const ratiosIn = (s: string): number[][] => (s.match(/\d+(?::\d+)+/g) ?? []).map((x) => x.split(':').map(Number));
const fracsIn = (s: string): number[] => [...s.matchAll(/(\d+)\/(\d+)/g)].map((x) => Number(x[1]) / Number(x[2]));
export const amountsIn = (s: string): number[] => (s.match(/₹\d[\d,]*/g) ?? []).map((x) => Number(x.slice(1).replace(/,/g, '')));
export const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
/** The old partners, in the order the question opens with. */
export const oldNamesIn = (prompt: string): string[] => (/^(.+?) (?:are partners|run )/.exec(prompt)?.[1] ?? '').split(/, | and /);
const optionText = (q: McqQuestion): string => q.options.find((o) => o.id === q.correct)?.text ?? '';
export const sameRatio = (answer: readonly number[], expected: readonly number[]): boolean =>
  answer.length === expected.length && expected.every((e) => e > 0) && answer.every((t, i) => near(t / sum(answer), expected[i] / sum(expected)));

/** The old ratio, the new partner's share and what each old partner gives up, read from the prompt. */
export function readDeal(prompt: string): { olds: string[]; old: number[]; shares: number[]; share: number; given: number[] } | null {
  const olds = oldNamesIn(prompt);
  const old = ratiosIn(prompt)[0];
  if (!old || old.length !== olds.length) return null;
  const shares = old.map((t) => t / sum(old));
  const cuts = [...prompt.matchAll(/surrenders (\d+)\/(\d+)/g)].map((x) => Number(x[1]) / Number(x[2]));
  if (cuts.length > 0) {
    if (cuts.length !== old.length) return null;
    const given = shares.map((s, i) => s * cuts[i]);
    return { olds, old, shares, share: sum(given), given };
  }
  const stated = /for (\d+)\/(\d+) share/.exec(prompt);
  if (!stated) return null;
  const share = Number(stated[1]) / Number(stated[2]);
  const done = (given: number[]) => ({ olds, old, shares, share, given });
  if (/this share equally/.test(prompt)) return done(shares.map(() => share / old.length));
  const one = /whole of this share from (\w+)\.|(\w+) alone gives up this share/.exec(prompt);
  if (one) return done(olds.map((n) => (n === (one[1] ?? one[2]) ? share : 0)));
  const parts = /acquires (\d+)\/(\d+) from \w+ and (\d+)\/(\d+) from \w+/.exec(prompt);
  if (parts) return done([Number(parts[1]) / Number(parts[2]), Number(parts[3]) / Number(parts[4])]);
  const split = /this share (?:from [^.]*? )?in the ratio (\d+(?::\d+)+)/.exec(prompt);
  if (split) {
    const terms = split[1].split(':').map(Number);
    return terms.length === old.length ? done(terms.map((x) => (share * x) / sum(terms))) : null;
  }
  return /old ratio/.test(prompt) ? done(shares.map((s) => s * share)) : null;
}

/** The answer is the new ratio the prompt leads to. */
const verifyNewRatio = (q: RatioQuestion): boolean => {
  const d = readDeal(q.prompt);
  return !!d && near(sum(d.given), d.share) && sameRatio(q.answer, [...d.shares.map((s, i) => s - d.given[i]), d.share]);
};
/** The answer is the ratio of what the old partners give up. */
const verifySacrifice = (q: RatioQuestion): boolean => {
  const d = readDeal(q.prompt);
  return !!d && sameRatio(q.answer, d.given);
};
/** The lines of an entry on one side, as rupees by account. */
const sideOf = (q: JournalQuestion, side: 'Dr' | 'Cr'): Map<string, number> => new Map(q.expected.filter((l) => l.side === side).map((l) => [l.accountId, l.amount / 100]));
const totalOf = (lines: Map<string, number>): number => sum([...lines.values()]);

export const H = {
  newRatio: ["Write each old partner's old share as a fraction, then deduct what that partner gives up.", 'New share = old share - share given up. The new shares must add up to 1.'],
  sacrifice: ['For each old partner: old share less new share.', 'Sacrificing ratio = old share - new share, compared between the old partners in the order asked.'],
  premium: ['Who gives up a share of profit to the new partner, and in what ratio?', 'The premium for goodwill goes to the sacrificing partners in the sacrificing ratio; no goodwill account is raised (AS 26).'],
  hidden: ["Scale the new partner's capital up to the whole firm, then compare with the capital actually there.", "Hidden goodwill = new partner's capital x reciprocal of the share - total capital of the new firm, the new partner's included."],
  revaluation: ['Is the firm better off or worse off because of this change in value?', 'A gain is credited to Revaluation A/c and a loss debited; the balance goes to the old partners in the old ratio.'],
  reserves: ['These balances were earned (or lost) before the new partner came in.', 'Reserves and accumulated profits are credited, and accumulated losses debited, to the old partners in the old ratio.'],
  capitals: ["The new partner's capital stands for the new partner's share of the firm.", 'Total capital of the new firm = new partner\'s capital x reciprocal of the share; each partner\'s capital = total x that partner\'s new share.'],
  newFirm: ['Take the adjustments one at a time: reserve, revaluation, goodwill, then cash.', 'Reserves and revaluation go to the old partners in the old ratio; the premium in the sacrificing ratio.'],
};

// ===============================================================================================================
// NEW PROFIT-SHARING RATIO
// ===============================================================================================================

const ASK_NEW = (d: Deal): string => `Calculate the new profit-sharing ratio of ${list(d.names)}, in that order.`;

const newRatioOld = numericTemplate({
  id: 'adm-new-ratio-old-ratio', topicId: T, conceptId: 'adm-new-ratio', difficulty: 'easy', unit: 'ratio',
  generate: (rng) => {
    const d = deal(rng, 'old', rng.pick([2, 2, 3]));
    if (!d) return null;
    const m = d.olds.length;
    const left = minus(ONE, d.share);
    const r = ratio(d.newRatio, [
      [ratioOf(asEqual(d)), `Took ${d.nw}'s share equally from the old partners. They keep their old ratio between themselves, so they give it up in the old ratio.`],
      [ratioOf([...d.oldShares, d.share]), `Left the old partners' shares as they were and added ${d.nw}'s share on top, so the shares add up to more than the whole profit.`],
      [ratioOf([...d.olds.map(() => fr(left[0], left[1] * m)), d.share]), 'Divided what is left equally among the old partners instead of in their old ratio.'],
      [ratioOf([...d.oldShares.map((s) => minus(s, d.share)), d.share]), `Deducted the whole of ${d.nw}'s share from each old partner.`],
    ]);
    return r && {
      prompt: `${d.open} ${d.admit} ${d.how} ${ASK_NEW(d)}`,
      ...r,
      explanation: [
        `Share left for the old partners = 1 - ${fs(d.share)} = ${fs(left)}, which they share in the old ratio ${rs(d.old)}.`,
        `${d.olds.map((n, i) => `${n}'s new share = ${fs(left)} x ${fs(d.oldShares[i])} = ${fs(d.news[i])}`).join('; ')}; ${d.nw}'s share = ${fs(d.share)}.`,
        `New ratio of ${list(d.names)} = ${overCommon(d.news).join(' : ')} = ${rs(d.newRatio)}.`,
      ],
      hints: ['First find the share that is left for the old partners after the new partner takes a share.', 'The old partners divide what is left in their old ratio.'],
    };
  },
  verify: verifyNewRatio,
});

const newRatioEqual = numericTemplate({
  id: 'adm-new-ratio-equal', topicId: T, conceptId: 'adm-new-ratio', difficulty: 'easy', unit: 'ratio',
  generate: (rng) => {
    const d = deal(rng, 'equal', rng.pick([2, 2, 2, 3]));
    if (!d) return null;
    const m = d.olds.length;
    const left = minus(ONE, d.share);
    const r = ratio(d.newRatio, [
      [ratioOf(asOld(d)), `Took ${d.nw}'s share from the old partners in their old ratio; the question says it is taken equally.`],
      [ratioOf([...d.oldShares.map((s) => minus(s, d.share)), d.share]), `Deducted the whole of ${d.nw}'s share from each old partner instead of ${fs(d.given[0])} from each.`],
      [ratioOf([...d.olds.map(() => fr(left[0], left[1] * m)), d.share]), 'Divided what is left equally among the old partners. It is the share given up that is equal, not what each old partner keeps.'],
      [ratioOf([...d.oldShares, d.share]), `Left the old partners' shares as they were and added ${d.nw}'s share on top.`],
    ]);
    return r && {
      prompt: `${d.open} ${d.admit} ${d.how} ${ASK_NEW(d)}`,
      ...r,
      explanation: [...givesSteps(d), ...newShareSteps(d)],
      hints: H.newRatio,
    };
  },
  verify: verifyNewRatio,
});

const newRatioOne = numericTemplate({
  id: 'adm-new-ratio-one', topicId: T, conceptId: 'adm-new-ratio', difficulty: 'easy', unit: 'ratio',
  generate: (rng) => {
    const d = deal(rng, 'one');
    if (!d) return null;
    const g = d.giver!;
    const other = [...d.oldShares.map((s, i) => (i === g ? s : minus(s, d.share))), d.share];
    const r = ratio(d.newRatio, [
      [ratioOf(other), `Took the share from ${d.olds[1 - g]}, although ${d.olds[g]} is the one who gives it up.`],
      [ratioOf(asEqual(d)), `Took the share equally from both old partners; only ${d.olds[g]} gives it up.`],
      [ratioOf(asOld(d)), `Took the share from both old partners in their old ratio; only ${d.olds[g]} gives it up.`],
      [ratioOf([...d.oldShares, d.share]), `Left the old partners' shares as they were and added ${d.nw}'s share on top.`],
    ]);
    return r && {
      prompt: `${d.open} ${d.admit} ${d.how} ${ASK_NEW(d)}`,
      ...r,
      explanation: [...givesSteps(d), ...newShareSteps(d)],
      hints: H.newRatio,
    };
  },
  verify: verifyNewRatio,
});

const newRatioStated = numericTemplate({
  id: 'adm-new-ratio-stated', topicId: T, conceptId: 'adm-new-ratio', difficulty: 'medium', unit: 'ratio',
  generate: (rng) => {
    const d = deal(rng, 'stated', rng.pick([2, 2, 2, 3]));
    if (!d || !d.sac) return null;
    const split = d.split!;
    const left = minus(ONE, d.share);
    const stated = d.asParts ? 'the parts stated' : `the ratio ${rs(split)}`;
    const back = [...split].reverse();
    const r = ratio(d.newRatio, [
      [ratioOf(asEqual(d)), `Took the share equally from the old partners instead of in ${stated}.`],
      [ratioOf(asOld(d)), `Took the share from the old partners in their old ratio instead of in ${stated}.`],
      [
        ratioOf([...d.oldShares.map((s, i) => minus(s, times(d.share, fr(back[i], sum(back))))), d.share]),
        d.asParts ? 'Deducted each part from the wrong partner.' : `Applied ${rs(split)} the wrong way round: its first term is ${d.olds[0]}'s part of the sacrifice.`,
      ],
      [
        ratioOf([...split.map((x) => times(left, fr(x, sum(split)))), d.share]),
        d.asParts ? 'Shared what is left in the ratio of the parts given up, instead of deducting each part from the old share.' : `Used ${rs(split)} to share what is left. It is the ratio in which the old partners give up the new share, not their new ratio between themselves.`,
      ],
    ]);
    return r && {
      prompt: `${d.open} ${d.admit} ${d.how} ${ASK_NEW(d)}`,
      ...r,
      explanation: [...givesSteps(d), ...newShareSteps(d)],
      hints: H.newRatio,
    };
  },
  verify: verifyNewRatio,
});

const newRatioSurrender = numericTemplate({
  id: 'adm-new-ratio-surrender', topicId: T, conceptId: 'adm-new-ratio', difficulty: 'medium', unit: 'ratio',
  generate: (rng) => {
    const d = deal(rng, 'surrender');
    if (!d) return null;
    const cut = d.cut!;
    const r = ratio(d.newRatio, [
      [
        ratioOf([...d.oldShares.map((s, i) => minus(s, cut[i])), cut.reduce(plus)]),
        "Deducted the fractions from the shares as they stand. Each is a fraction of that partner's own share, so it must first be multiplied by the share.",
      ],
      [
        ratioOf([...d.oldShares.map((s, i) => minus(s, times(s, cut[1 - i]))), plus(times(d.oldShares[0], cut[1]), times(d.oldShares[1], cut[0]))]),
        "Swapped the two fractions: applied each partner's fraction to the other partner's share.",
      ],
      [ratioOf([...d.given, minus(ONE, d.share)]), 'Took the part each old partner gives up as the share that partner keeps.'],
    ]);
    return r && {
      prompt: `${d.open} ${d.admit} ${d.how} ${ASK_NEW(d)}`,
      ...r,
      explanation: [...givesSteps(d), ...newShareSteps(d)],
      hints: ["A fraction 'of a partner's share' is multiplied by that share: 1/4 of 3/5 is 3/20.", 'New share = old share - part surrendered; the new partner gets the total of the parts surrendered.'],
    };
  },
  verify: verifyNewRatio,
});

/** The old partners agree a new ratio between themselves for what is left: every tidy combination, worked once. */
interface Remaining {
  old: number[];
  share: Frac;
  mutual: number[];
  news: Frac[];
  given: Frac[];
  newRatio: number[];
  sac: number[] | null;
}
const MUTUAL: number[][] = [[1, 1], [2, 1], [3, 2], [3, 1], [4, 3], [5, 3], [1, 2], [2, 3], [5, 4], [4, 1]];
const uniqueRatios = (all: number[][]): number[][] => all.filter((r, i) => all.findIndex((x) => sameTerms(x, r)) === i);
const REMAINING: Remaining[] = uniqueRatios(OLD2).flatMap((old) =>
  SHARES.filter((s, i) => SHARES.findIndex((x) => sameFrac(x, s)) === i).flatMap((share) =>
    MUTUAL.filter((mutual) => !sameTerms(mutual, old)).flatMap((mutual): Remaining[] => {
      const left = minus(ONE, share);
      const oldShares = sharesOf(old);
      const news = [...mutual.map((x) => times(left, fr(x, sum(mutual)))), share];
      const given = oldShares.map((s, i) => minus(s, news[i]));
      const newRatio = ratioOf(news);
      return newRatio && sum(newRatio) <= TIDY ? [{ old, share, mutual, news, given, newRatio, sac: ratioOf(given) }] : [];
    }),
  ),
);
const REMAINING_SAC = REMAINING.filter((x) => x.sac !== null && sum(x.sac) <= 20);

function remainingPrompt(rng: Rng, x: Remaining): { names: string[]; olds: string[]; nw: string; text: string } {
  const names = rng.shuffle(NAMES).slice(0, 3);
  const olds = names.slice(0, 2);
  const nw = names[2];
  const admit = rng.pick([
    `On 1 April ${rng.pick(YEARS)}, ${nw} is admitted as a partner for ${fs(x.share)} share in the profits.`,
    `${nw} is admitted into the firm on 1 April ${rng.pick(YEARS)} for ${fs(x.share)} share of the profits.`,
  ]);
  const agree = rng.pick([
    `${list(olds)} agree to share the rest of the profit between themselves in the ratio ${rs(x.mutual)}.`,
    `From that date ${list(olds)} will divide what is left between themselves in the ratio ${rs(x.mutual)}.`,
  ]);
  return { names, olds, nw, text: `${opening(rng, olds, x.old)} ${admit} ${agree}` };
}

/** The new shares when the old partners share what is left in an agreed ratio, read from the prompt. */
function readRemaining(prompt: string): { olds: number[]; news: number[] } | null {
  const [old, mutual] = ratiosIn(prompt);
  const share = fracsIn(prompt)[0];
  if (!old || !mutual || !(share > 0)) return null;
  return { olds: old.map((t) => t / sum(old)), news: [...mutual.map((x) => ((1 - share) * x) / sum(mutual)), share] };
}

const newRatioRemaining = numericTemplate({
  id: 'adm-new-ratio-remaining', topicId: T, conceptId: 'adm-new-ratio', difficulty: 'medium', unit: 'ratio',
  generate: (rng) => {
    const x = rng.pick(REMAINING);
    const p = remainingPrompt(rng, x);
    const left = minus(ONE, x.share);
    const oldShares = sharesOf(x.old);
    const r = ratio(x.newRatio, [
      [ratioOf([...oldShares.map((s) => times(s, left)), x.share]), `Shared what is left in the old ratio ${rs(x.old)}, although the old partners agreed on ${rs(x.mutual)} for it.`],
      [ratioOf([...sharesOf(x.mutual), x.share]), `Wrote ${rs(x.mutual)} beside ${p.nw}'s share without first applying it to the ${fs(left)} that is left, so the shares add up to more than the whole profit.`],
      [
        ratioOf([...oldShares.map((s, i) => minus(s, times(x.share, fr(x.mutual[i], sum(x.mutual))))), x.share]),
        `Took ${rs(x.mutual)} as the ratio in which ${p.nw}'s share is given up. It is the ratio in which the old partners share what is left.`,
      ],
    ]);
    return r && {
      prompt: `${p.text} Calculate the new profit-sharing ratio of ${list(p.names)}, in that order.`,
      ...r,
      explanation: [
        `Share left for the old partners = 1 - ${fs(x.share)} = ${fs(left)}, shared in ${rs(x.mutual)}. The old ratio ${rs(x.old)} is not needed for the new ratio.`,
        `${p.olds.map((n, i) => `${n}'s new share = ${fs(left)} x ${x.mutual[i]}/${sum(x.mutual)} = ${fs(x.news[i])}`).join('; ')}; ${p.nw}'s share = ${fs(x.share)}.`,
        `New ratio of ${list(p.names)} = ${overCommon(x.news).join(' : ')} = ${rs(x.newRatio)}.`,
      ],
      hints: ['What is left after the new partner takes a share? That is what the old partners divide.', 'Apply the agreed ratio to the share that is left, not to the whole profit.'],
    };
  },
  verify: (q) => {
    const x = readRemaining(q.prompt);
    return !!x && sameRatio(q.answer, x.news);
  },
});

const newPartnerShare = mcqTemplate({
  id: 'adm-new-partner-share', topicId: T, conceptId: 'adm-new-ratio', difficulty: 'medium',
  generate: (rng) => {
    const d = deal(rng, 'surrender');
    if (!d) return null;
    const cut = d.cut!;
    const added = cut.reduce(plus);
    return choice(
      `${d.open} ${d.admit} ${d.how} What share of the profits does ${d.nw} get?`,
      fs(d.share),
      [
        [added[0] < added[1] ? fs(added) : null, "Added the two fractions as they stand. Each is a fraction of that partner's own share, not of the whole profit."],
        [fs(plus(times(d.oldShares[0], cut[1]), times(d.oldShares[1], cut[0]))), "Swapped the two fractions: applied each partner's fraction to the other partner's share."],
        [fs(d.given[0]), `Counted only what ${d.olds[0]} gives up.`],
        [fs(d.given[1]), `Counted only what ${d.olds[1]} gives up.`],
        [fs(minus(ONE, d.share)), 'Gave the share the old partners keep between them, not what the new partner gets.'],
      ],
      `${givesSteps(d).join(' ')} So ${d.nw}'s share is ${fs(d.share)}.`,
      ["A fraction 'of a partner's share' is multiplied by that share.", "The new partner's share is the total of the parts the old partners surrender."],
    );
  },
  verify: (q) => {
    const d = readDeal(q.prompt);
    const [n, den] = optionText(q).split('/').map(Number);
    return !!d && near(n / den, d.share);
  },
});

// ===============================================================================================================
// SACRIFICING RATIO
// ===============================================================================================================

/** The terms of the old ratio less those of the new one as they stand, which is what subtracting without a common denominator gives. */
const rawDifference = (old: readonly number[], newRatio: readonly number[]): number[] => old.map((t, i) => Math.abs(t - newRatio[i]));

function sacrificeFromRatios(d: Deal): Pick<RatioParts, 'answer' | 'commonErrors'> | null {
  const m = d.olds.length;
  return ratio(d.sac, [
    [d.old, 'Gave the old ratio. The sacrifice is in the old ratio only when the old partners keep that ratio between themselves.'],
    [lowestTerms(d.newRatio.slice(0, m)), 'Gave the ratio in which the old partners now share between themselves, not what each of them gave up.'],
    [rawDifference(d.old, d.newRatio), 'Subtracted the terms of the two ratios as they stand, without first writing each share as a fraction of the whole profit.'],
    [d.sac ? [...d.sac].reverse() : null, `Wrote the sacrifices in the wrong order: the first term belongs to ${d.olds[0]}.`],
  ]);
}

const sacrificeSteps = (d: Deal): string[] => [
  `${d.olds.map((n, i) => `${n}: old share ${fs(d.oldShares[i])} - new share ${fs(d.news[i])} = ${fs(d.given[i])}`).join('; ')}.`,
  sacStep(d),
];

/** Old share less new share for every old partner, from the two ratios the prompt gives. */
const verifyFromRatios = (q: RatioQuestion): boolean => {
  const [old, newRatio] = ratiosIn(q.prompt);
  if (!old || !newRatio || newRatio.length !== old.length + 1) return false;
  return sameRatio(q.answer, old.map((t, i) => t / sum(old) - newRatio[i] / sum(newRatio)));
};

const sacrificeOldNew = numericTemplate({
  id: 'adm-sacrifice-old-new', topicId: T, conceptId: 'adm-sacrifice', difficulty: 'easy', unit: 'ratio',
  generate: (rng) => {
    const d = dealWhere(rng, ['equal', 'stated', 'stated', 'surrender'], (x) => x.sac !== null && sum(x.newRatio) <= 40 && sacrificeFromRatios(x) !== null);
    if (!d) return null;
    const r = sacrificeFromRatios(d);
    const told = rng.pick([
      `${d.nw} is admitted as a partner on 1 April ${d.year}, and the new profit-sharing ratio of ${list(d.names)} is ${rs(d.newRatio)}.`,
      `On 1 April ${d.year} they admit ${d.nw}, and ${list(d.names)} agree to share future profits in the ratio ${rs(d.newRatio)}.`,
    ]);
    return r && {
      prompt: `${d.open} ${told} Find the sacrificing ratio of ${list(d.olds)}, in that order.`,
      ...r,
      explanation: sacrificeSteps(d),
      hints: H.sacrifice,
    };
  },
  verify: verifyFromRatios,
});

const sacrificeThree = numericTemplate({
  id: 'adm-sacrifice-three', topicId: T, conceptId: 'adm-sacrifice', difficulty: 'medium', unit: 'ratio',
  generate: (rng) => {
    const d = dealWhere(rng, ['stated', 'stated', 'equal', 'surrender'], (x) => x.sac !== null && sum(x.sac) <= 40 && sacrificeFromRatios(x) !== null, 3);
    if (!d) return null;
    const r = sacrificeFromRatios(d);
    const told = rng.pick([
      `${d.nw} is admitted as a partner on 1 April ${d.year}, and the new profit-sharing ratio of ${list(d.names)} is ${rs(d.newRatio)}.`,
      `On 1 April ${d.year} they admit ${d.nw}, and ${list(d.names)} agree to share future profits in the ratio ${rs(d.newRatio)}.`,
    ]);
    return r && {
      prompt: `${d.open} ${told} Find the sacrificing ratio of ${list(d.olds)}, in that order.`,
      ...r,
      explanation: sacrificeSteps(d),
      hints: H.sacrifice,
    };
  },
  verify: verifyFromRatios,
});

const sacrificeSurrender = numericTemplate({
  id: 'adm-sacrifice-surrender', topicId: T, conceptId: 'adm-sacrifice', difficulty: 'medium', unit: 'ratio',
  generate: (rng) => {
    const d = dealWhere(rng, 'surrender', (x) => x.sac !== null && sum(x.sac) <= 40 && !sameFrac(x.cut![0], x.cut![1]));
    if (!d || !d.sac) return null;
    const r = ratio(d.sac, [
      [ratioOf(d.cut!), "Compared the two fractions as they stand. Each is a fraction of that partner's own share, so it must first be multiplied by the share."],
      [d.old, 'Gave the old ratio. The sacrifice is in the old ratio only when both partners give up the same fraction of their shares.'],
      [ratioOf(d.news.slice(0, 2)), 'Gave the ratio of what the old partners keep, which is their new ratio between themselves, not of what they give up.'],
      [[...d.sac].reverse(), `Wrote the sacrifices in the wrong order: the first term belongs to ${d.olds[0]}.`],
    ]);
    return r && {
      prompt: `${d.open} ${d.admit} ${d.how} Find the sacrificing ratio of ${list(d.olds)}, in that order.`,
      ...r,
      explanation: [givesSteps(d)[0], sacStep(d)],
      hints: ["Multiply each fraction by the share of the partner who surrenders it.", 'Sacrifice = old share x fraction surrendered; compare the two sacrifices.'],
    };
  },
  verify: verifySacrifice,
});

const sacrificeRemaining = numericTemplate({
  id: 'adm-sacrifice-remaining', topicId: T, conceptId: 'adm-sacrifice', difficulty: 'complex', unit: 'ratio',
  generate: (rng) => {
    const x = rng.pick(REMAINING_SAC);
    const p = remainingPrompt(rng, x);
    const left = minus(ONE, x.share);
    const oldShares = sharesOf(x.old);
    const r = ratio(x.sac, [
      [x.mutual, 'Gave the ratio in which the old partners will share what is left. The sacrifice is old share less new share.'],
      [x.old, 'Gave the old ratio. The sacrifice is in the old ratio only when the old partners keep that ratio between themselves, and here they change it.'],
      [ratioOf(oldShares.map((s, i) => minus(s, fr(x.mutual[i], sum(x.mutual))))), `Deducted ${rs(x.mutual)} from the old shares without first applying it to the ${fs(left)} that is left.`],
      [x.sac ? [...x.sac].reverse() : null, `Wrote the sacrifices in the wrong order: the first term belongs to ${p.olds[0]}.`],
    ]);
    return r && {
      prompt: `${p.text} Find the sacrificing ratio of ${list(p.olds)}, in that order.`,
      ...r,
      explanation: [
        `Share left for the old partners = 1 - ${fs(x.share)} = ${fs(left)}, shared in ${rs(x.mutual)}: ${p.olds.map((n, i) => `${n} ${fs(left)} x ${x.mutual[i]}/${sum(x.mutual)} = ${fs(x.news[i])}`).join('; ')}.`,
        `${p.olds.map((n, i) => `${n}: old share ${fs(oldShares[i])} - new share ${fs(x.news[i])} = ${fs(x.given[i])}`).join('; ')}.`,
        `Sacrificing ratio of ${list(p.olds)} = ${overCommon(x.given).join(' : ')} = ${rs(x.sac!)}.`,
      ],
      hints: ['Find the new share of each old partner first.', 'Sacrifice = old share - new share, for each old partner.'],
    };
  },
  verify: (q) => {
    const x = readRemaining(q.prompt);
    return !!x && sameRatio(q.answer, x.olds.map((s, i) => s - x.news[i]));
  },
});

const sacrificeRule = mcqTemplate({
  id: 'adm-sacrifice-rule', topicId: T, conceptId: 'adm-sacrifice', difficulty: 'easy',
  generate: (rng) => {
    const d = dealWhere(rng, ['old', 'equal', 'stated', 'one'], (x) => !x.asParts && !sameTerms(x.old, [1, 1]) && !(x.split && sameTerms(x.split, x.old)));
    if (!d) return null;
    const [a, b] = d.olds;
    const premium = rng.step(20000, 150000, 5000);
    const inOld = `${a} and ${b} in ${rs(d.old)}`;
    const equally = `${a} and ${b} equally`;
    const inNew = `${list(d.names)} in ${rs(d.newRatio)}`;
    const alone = (n: string): string => `${n} alone`;
    const inSplit = d.split ? `${a} and ${b} in ${rs(d.split)}` : null;
    const whyOld = 'Used the old ratio. The premium follows the old ratio only when the old partners keep that ratio between themselves.';
    const whyEqual = "Split the premium equally. The sacrifice is equal only when the new partner's share is taken equally from the old partners.";
    const whyNew = 'Shared the premium in the new ratio, which hands the new partner back a part of what the new partner paid.';
    const whyAlone = 'Gave the whole premium to one partner; that is right only when that partner alone gives up the share.';
    const correct = d.kind === 'old' ? inOld : d.kind === 'equal' ? equally : d.kind === 'stated' ? inSplit! : alone(d.olds[d.giver!]);
    const wrong: [string | null, string][] =
      d.kind === 'old'
        ? [[equally, whyEqual], [inNew, whyNew], [alone(a), whyAlone], [`${a} and ${b} in ${rs([...d.old].reverse())}`, `Wrote the old ratio the wrong way round: its first term is ${a}'s.`]]
        : d.kind === 'equal'
          ? [[inOld, whyOld], [inNew, whyNew], [alone(a), whyAlone], [alone(b), whyAlone]]
          : d.kind === 'stated'
            ? [[inOld, whyOld], [equally, whyEqual], [inNew, whyNew], [`${a} and ${b} in ${rs([...d.split!].reverse())}`, `Applied ${rs(d.split!)} the wrong way round: its first term is ${a}'s part of the sacrifice.`]]
            : [[inOld, whyOld], [equally, whyEqual], [inNew, whyNew], [alone(d.olds[1 - d.giver!]), 'Gave the premium to the partner who gives up nothing.']];
    return choice(
      `${d.open} ${d.admit} ${d.how} ${d.nw} brings ${inr(premium)} in cash as premium for goodwill. Who is credited with this premium, and in what ratio?`,
      correct,
      wrong,
      `The premium compensates the partners who give up a share of profit, in the ratio in which they give it up. ${sacStep(d)}`,
      H.premium,
    );
  },
  verify: (q) => {
    const d = readDeal(q.prompt);
    if (!d) return false;
    const text = optionText(q);
    const givers = d.olds.filter((_, i) => d.given[i] > 0);
    if (givers.length === 1) return text === `${givers[0]} alone`;
    if (near(d.given[0], d.given[1])) return text.endsWith('equally');
    const terms = ratiosIn(text)[0];
    return !!terms && terms.length === 2 && sameRatio(terms, d.given);
  },
});

// ===============================================================================================================
// PREMIUM FOR GOODWILL BROUGHT IN CASH
// ===============================================================================================================

/**
 * An amount in [min, max] of which every fraction given is a whole number of rupees, as round as the range allows;
 * null when the range holds too few such amounts.
 */
export function amountFor(rng: Rng, min: number, max: number, fracs: readonly Frac[]): number | null {
  const den = fracs.reduce((l, f) => lcm(l, f[1]), 1);
  const pick = rng.next();
  for (const unit of [5000, 1000, 500]) {
    const step = den * unit;
    const lo = Math.ceil(min / step);
    const hi = Math.floor(max / step);
    if (hi - lo >= 3) return step * (lo + Math.floor(pick * (hi - lo + 1)));
  }
  return null;
}

/** The share the prompt admits the new partner for, as [numerator, denominator]. */
const shareIn = (prompt: string): [number, number] | null => {
  const m = /for (\d+)\/(\d+) share/.exec(prompt);
  return m ? [Number(m[1]), Number(m[2])] : null;
};

const premiumAmount = numericTemplate({
  id: 'adm-premium-amount', topicId: T, conceptId: 'adm-premium', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const d = deal(rng, 'old');
    if (!d) return null;
    const [k, n] = d.share;
    const base = `${d.open} ${d.admit}`;
    const variant = rng.int(0, 2);
    if (variant === 0) {
      const goodwill = n * 1000 * rng.int(12, 50);
      const m = money(of(goodwill, d.share), [
        [goodwill, `Took the whole goodwill of the firm. ${d.nw} pays only for the ${fs(d.share)} share acquired.`],
        [of(goodwill, minus(ONE, d.share)), `Took the old partners' ${fs(minus(ONE, d.share))} of the goodwill instead of ${d.nw}'s ${fs(d.share)}.`],
        [goodwill / n, 'Divided by the denominator of the share but forgot its numerator.'],
      ]);
      return m && {
        prompt: `${base} The goodwill of the firm is valued at ${inr(goodwill)}. How much premium for goodwill must ${d.nw} bring in?`,
        ...m,
        explanation: [`Premium for goodwill = goodwill of the firm x ${d.nw}'s share.`, `${inr(goodwill)} x ${fs(d.share)} = ${inr(of(goodwill, d.share))}.`],
        hints: ['The new partner pays for the share of goodwill that goes with the share of profit.', "Premium = firm's goodwill x new partner's share."],
      };
    }
    if (variant === 1) {
      const average = n * 1000 * rng.int(4, 20);
      const years = rng.pick([2, 3, 4]);
      const goodwill = average * years;
      const m = money(of(goodwill, d.share), [
        [of(average, d.share), `Took ${d.nw}'s share of one year's average profit and forgot the ${years} years' purchase.`],
        [goodwill, `Stopped at the goodwill of the firm. ${d.nw} pays only for the ${fs(d.share)} share acquired.`],
        [of(goodwill, minus(ONE, d.share)), `Took the old partners' ${fs(minus(ONE, d.share))} of the goodwill instead of ${d.nw}'s ${fs(d.share)}.`],
      ]);
      return m && {
        prompt: `${base} Goodwill of the firm is to be valued at ${years} years' purchase of the average profit, which is ${inr(average)}. How much premium for goodwill must ${d.nw} bring in?`,
        ...m,
        explanation: [`Goodwill of the firm = ${inr(average)} x ${years} = ${inr(goodwill)}.`, `${d.nw}'s premium = ${inr(goodwill)} x ${fs(d.share)} = ${inr(of(goodwill, d.share))}.`],
        hints: ["Value the firm's goodwill first.", "Premium = firm's goodwill x new partner's share."],
      };
    }
    const premium = k * n * 1000 * rng.int(2, 12);
    const m = money(of(premium, [n, k]), [
      [of(premium, d.share), `Took ${fs(d.share)} of the premium. The premium is itself only ${fs(d.share)} of the firm's goodwill, so it has to be scaled up.`],
      [of(premium, [n - k, k]), `Gave the old partners' part of the goodwill and left out ${d.nw}'s own part.`],
      [premium * n, 'Multiplied by the denominator of the share but did not divide by its numerator.'],
    ]);
    return m && {
      prompt: `${base} ${d.nw} brings ${inr(premium)} in cash as premium for goodwill for this share. At what amount has the goodwill of the whole firm been valued?`,
      ...m,
      explanation: [`${inr(premium)} is ${fs(d.share)} of the firm's goodwill.`, `Goodwill of the firm = ${inr(premium)} x ${n}/${k} = ${inr(of(premium, [n, k]))}.`],
      hints: ['The premium is the price of a part of the goodwill. What is the whole worth?', "Firm's goodwill = premium x reciprocal of the new partner's share."],
    };
  },
  verify: (q: NumericQuestion) => {
    const share = shareIn(q.prompt);
    const [x] = amountsIn(q.prompt);
    if (!share) return false;
    const s = share[0] / share[1];
    const years = /(\d+) years' purchase/.exec(q.prompt);
    const expected = years ? Number(years[1]) * x * s : /valued at ₹/.test(q.prompt) ? x * s : x / s;
    return near(q.answer / 100, expected);
  },
});

const premiumShare = numericTemplate({
  id: 'adm-premium-share', topicId: T, conceptId: 'adm-premium', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const d = dealOf(rng, ['equal', 'stated', 'stated', 'surrender', 'old']);
    if (!d) return null;
    const premium = amountFor(rng, 20000, 240000, [...d.parts, ...d.oldShares, fr(1, 2)]);
    if (premium === null) return null;
    const j = rng.int(0, 1);
    const who = d.olds[j];
    const m = money(of(premium, d.parts[j]), [
      [of(premium, d.oldShares[j]), 'Shared the premium in the old ratio. It goes to the old partners in the ratio in which they give up their shares.'],
      [premium / 2, 'Split the premium equally between the old partners, although they do not give up equal shares.'],
      [of(premium, d.news[j]), 'Shared the premium in the new ratio, in which the new partner also gets a part of it.'],
      [of(premium, d.parts[1 - j]), `Gave ${d.olds[1 - j]}'s part of the premium.`],
      [premium, `Gave the whole premium to ${who}.`],
    ]);
    return m && {
      prompt: `${d.open} ${d.admit} ${d.how} ${d.nw} brings ${inr(premium)} in cash as premium for goodwill. The capital accounts are fluctuating. How much of the premium is credited to ${who}'s Capital A/c?`,
      ...m,
      explanation: [givesSteps(d)[0], sacStep(d), `${who}'s part = ${inr(premium)} x ${fs(d.parts[j])} = ${inr(of(premium, d.parts[j]))}.`],
      hints: H.premium,
    };
  },
  verify: (q: NumericQuestion) => {
    const d = readDeal(q.prompt);
    const who = /credited to (\w+)'s Capital/.exec(q.prompt)?.[1];
    const j = d ? d.olds.indexOf(who ?? '') : -1;
    return !!d && j >= 0 && near(q.answer / 100, (amountsIn(q.prompt)[0] * d.given[j]) / d.share);
  },
});

const jePremiumBrought = journalTemplate({
  id: 'adm-je-premium-brought', topicId: T, conceptId: 'adm-premium', difficulty: 'easy',
  generate: (rng) => {
    const d = deal(rng, 'old');
    if (!d) return null;
    const capital = rng.step(100000, 600000, 20000);
    const premium = rng.step(20000, 120000, 5000);
    const byCheque = rng.int(0, 2) > 0;
    const account = byCheque ? 'bank' : 'cash';
    return {
      prompt: `${d.open} ${d.admit} ${d.nw} brings ${inr(capital)} as capital and ${inr(premium)} as premium for goodwill ${byCheque ? 'by cheque' : 'in cash'}. The capital accounts are fluctuating. Pass the journal entry for the amount ${d.nw} brings in.`,
      lines: [Dr(account, capital + premium), Cr(partnerCapital(d.nw), capital), Cr('premiumForGoodwill', premium)],
      explanation: [
        `${inr(capital)} + ${inr(premium)} = ${inr(capital + premium)} comes into the firm, so ${byCheque ? 'Bank' : 'Cash'} A/c is debited.`,
        `${d.nw}'s Capital A/c is credited with the capital of ${inr(capital)} only.`,
        `The premium of ${inr(premium)} is not ${d.nw}'s capital: it is credited to Premium for Goodwill A/c, from where it goes to the sacrificing partners.`,
      ],
      distractorAccounts: ['goodwill', partnerCapital(d.olds[0]), byCheque ? 'cash' : 'bank'],
      hints: ['Two things come in: capital and a premium. Do both belong to the new partner?', `${byCheque ? 'Bank' : 'Cash'} A/c Dr; To New Partner's Capital A/c; To Premium for Goodwill A/c.`],
    };
  },
  verify: (q) => {
    const [capital, premium] = amountsIn(q.prompt);
    const credits = sideOf(q, 'Cr');
    return near(totalOf(sideOf(q, 'Dr')), capital + premium) && credits.get('premiumForGoodwill') === premium && totalOf(credits) === capital + premium;
  },
});

/** A partner's capital account, or with fixed capitals the partner's current account. */
export const ownAccount = (fixed: boolean) => (name: string): string => (fixed ? partnerCurrent(name) : partnerCapital(name));
export const ownName = (fixed: boolean): string => (fixed ? 'Current' : 'Capital');

const jePremiumDistribute = journalTemplate({
  id: 'adm-je-premium-distribute', topicId: T, conceptId: 'adm-premium', difficulty: 'medium',
  generate: (rng) => {
    const d = dealOf(rng, ['old', 'equal', 'stated', 'stated', 'one', 'surrender']);
    if (!d) return null;
    const premium = amountFor(rng, 20000, 240000, d.parts);
    if (premium === null) return null;
    const fixed = rng.int(0, 3) === 0;
    const own = ownAccount(fixed);
    return {
      prompt: `${d.open} ${d.admit} ${d.how} ${d.nw} brings ${inr(premium)} in cash as premium for goodwill, which has been credited to Premium for Goodwill A/c and is kept in the business. ${capsText(fixed)} Pass the journal entry to share the premium.`,
      lines: entry(Dr('premiumForGoodwill', premium), ...d.olds.map((n, i) => Cr(own(n), of(premium, d.parts[i])))),
      explanation: [
        givesSteps(d)[0],
        sacStep(d),
        `Premium for Goodwill A/c is debited with ${inr(premium)} to close it.`,
        `${d.olds.filter((_, i) => isPos(d.given[i])).map((n, i2) => `${n}'s ${ownName(fixed)} A/c is credited with ${inr(of(premium, d.parts.filter(isPos)[i2]))}`).join('; ')}.`,
      ],
      distractorAccounts: ['goodwill', own(d.nw), ...d.olds.map(own), ...d.olds.map(ownAccount(!fixed))],
      hints: H.premium,
    };
  },
  verify: (q) => {
    const d = readDeal(q.prompt);
    if (!d) return false;
    const [premium] = amountsIn(q.prompt);
    const own = ownAccount(/fixed capital/.test(q.prompt));
    const debits = sideOf(q, 'Dr');
    const credits = sideOf(q, 'Cr');
    return debits.size === 1 && debits.get('premiumForGoodwill') === premium && near(totalOf(credits), premium) && d.olds.every((n, i) => near(credits.get(own(n)) ?? 0, (premium * d.given[i]) / d.share));
  },
});

const WITHDRAW: { part: Frac; text: string }[] = [
  { part: [1, 1], text: 'withdraw their shares of the premium in full' },
  { part: [1, 2], text: 'withdraw half of their shares of the premium' },
  { part: [1, 4], text: 'withdraw one-fourth of their shares of the premium' },
];

const jePremiumWithdrawn = journalTemplate({
  id: 'adm-je-premium-withdrawn', topicId: T, conceptId: 'adm-premium', difficulty: 'medium', computed: true,
  generate: (rng) => {
    const d = dealOf(rng, ['old', 'equal', 'stated', 'stated']);
    if (!d) return null;
    const w = rng.pick(WITHDRAW);
    const premium = amountFor(rng, 20000, 240000, d.parts.map((p) => times(p, w.part)));
    if (premium === null) return null;
    const out = d.parts.map((p) => of(premium, times(p, w.part)));
    return {
      prompt: `${d.open} ${d.admit} ${d.how} ${d.nw} brought ${inr(premium)} as premium for goodwill by cheque, and it has been credited to the capital accounts of the sacrificing partners in their sacrificing ratio. The capital accounts are fluctuating. ${list(d.olds)} then ${w.text} by cheque. Pass the journal entry for the withdrawal.`,
      lines: entry(...d.olds.map((n, i) => Dr(partnerCapital(n), out[i])), Cr('bank', sum(out))),
      explanation: [
        givesSteps(d)[0],
        sacStep(d),
        `Premium credited: ${d.olds.map((n, i) => `${n} ${inr(of(premium, d.parts[i]))}`).join('; ')}.`,
        `Amount withdrawn: ${d.olds.map((n, i) => `${n} ${inr(out[i])}`).join('; ')}. The capital accounts are debited and Bank A/c is credited with ${inr(sum(out))}.`,
      ],
      distractorAccounts: ['premiumForGoodwill', partnerCapital(d.nw), ...d.olds.map(partnerDrawings), 'goodwill'],
      hints: ['How much of the premium did each old partner get? What part of it is taken out?', "Old Partners' Capital A/cs Dr; To Bank A/c, with the amount each withdraws."],
    };
  },
  verify: (q) => {
    const d = readDeal(q.prompt);
    if (!d) return false;
    const [premium] = amountsIn(q.prompt);
    const part = /in full/.test(q.prompt) ? 1 : /withdraw half/.test(q.prompt) ? 0.5 : /one-fourth/.test(q.prompt) ? 0.25 : NaN;
    const debits = sideOf(q, 'Dr');
    return near(sideOf(q, 'Cr').get('bank') ?? 0, premium * part) && d.olds.every((n, i) => near(debits.get(partnerCapital(n)) ?? 0, (premium * part * d.given[i]) / d.share));
  },
});

const goodwillTreatment = mcqTemplate({
  id: 'adm-goodwill-treatment', topicId: T, conceptId: 'adm-premium', difficulty: 'easy',
  generate: (rng) => {
    const d = deal(rng, 'old');
    if (!d) return null;
    const [a, b] = d.olds;
    const c = d.nw;
    const amt = inr(rng.step(20000, 150000, 5000));
    const none = 'No entry is passed in the books of the firm';
    const share = `Premium for Goodwill A/c Dr; To ${a}'s Capital A/c and ${b}'s Capital A/c, in the sacrificing ratio`;
    const current = `${c}'s Current A/c Dr; To ${a}'s Capital A/c and ${b}'s Capital A/c, in the sacrificing ratio`;
    const writeOff = `${a}'s Capital A/c and ${b}'s Capital A/c Dr, in the old ratio; To Goodwill A/c`;
    const raise = `Goodwill A/c Dr; To ${a}'s Capital A/c and ${b}'s Capital A/c, in the old ratio`;
    const whyRaise = 'Raised goodwill in the books. AS 26 does not allow goodwill a firm has built itself to be recorded as an asset.';
    const base = `${d.open} ${d.admit}`;
    const hints = ['Did any money for goodwill come into the firm?', 'A premium brought in goes to the sacrificing partners; a share not brought in is charged to the new partner; goodwill already in the books is written off by the old partners.'];
    switch (rng.int(0, 3)) {
      case 0:
        return choice(
          `${base} ${c} pays ${amt} as premium for goodwill to ${a} and ${b} privately, outside the firm. The capital accounts are fluctuating. What entry does the firm pass for this payment?`,
          none,
          [
            [share, 'Recorded a premium that never came into the firm; it was settled privately between the partners.'],
            [current, "Charged the new partner in the firm's books for goodwill that was already paid for privately."],
            ['Bank A/c Dr; To Premium for Goodwill A/c', "Debited the firm's Bank A/c although the money never reached the firm."],
            [raise, whyRaise],
          ],
          `The premium was paid by ${c} to ${a} and ${b} outside the firm. The firm neither receives nor pays anything, so its books show no entry.`,
          hints,
        );
      case 1:
        return choice(
          `${base} ${c} brings ${amt} in cash as premium for goodwill and it is kept in the business. Cash A/c has been debited and Premium for Goodwill A/c credited. The capital accounts are fluctuating. Which entry completes the treatment of the premium?`,
          share,
          [
            [none, 'Stopped once the cash was received, so the premium is left in Premium for Goodwill A/c instead of going to the partners who sacrifice.'],
            [current, 'Debited the new partner a second time, although the premium was brought in cash.'],
            [`Premium for Goodwill A/c Dr; To ${a}'s, ${b}'s and ${c}'s Capital A/cs, in the new ratio`, 'Shared the premium in the new ratio, which hands the new partner back a part of it.'],
            [raise, whyRaise],
          ],
          'The premium is the price of the share of profit the old partners give up, so Premium for Goodwill A/c is closed by crediting the sacrificing partners in the sacrificing ratio.',
          hints,
        );
      case 2:
        return choice(
          `${base} ${c} is unable to bring the share of goodwill, ${amt}, in cash, and it is to be adjusted through ${c}'s Current A/c; the capital accounts of the old partners are fluctuating. Which entry is passed?`,
          current,
          [
            [none, 'Passed no entry, so the old partners get nothing for the share of profit they give up.'],
            [share, 'Used Premium for Goodwill A/c although no premium came into the firm.'],
            [`${a}'s Capital A/c and ${b}'s Capital A/c Dr; To ${c}'s Current A/c`, 'Reversed the entry: it is the new partner who owes the old partners for goodwill.'],
            [raise, whyRaise],
          ],
          `No cash comes in, so ${c} is made to owe the amount: ${c}'s Current A/c is debited and the sacrificing partners are credited in the sacrificing ratio.`,
          hints,
        );
      default:
        return choice(
          `${base} Goodwill already appears in the books of the firm at ${amt}. The capital accounts are fluctuating. How is this goodwill dealt with on ${c}'s admission?`,
          writeOff,
          [
            [`${a}'s, ${b}'s and ${c}'s Capital A/cs Dr, in the new ratio; To Goodwill A/c`, 'Wrote it off among all the partners in the new ratio. The goodwill in the books belongs to the time before the admission, so only the old partners bear it, in the old ratio.'],
            [none, 'Left the old goodwill in the books. It is written off at the time of admission.'],
            [`${a}'s Capital A/c and ${b}'s Capital A/c Dr, in the sacrificing ratio; To Goodwill A/c`, 'Used the sacrificing ratio. That ratio is for the premium the new partner brings; goodwill in the books is written off in the old ratio.'],
            [raise, 'Debited Goodwill A/c, which adds to the goodwill in the books instead of removing it.'],
          ],
          'Goodwill standing in the books is written off at the time of admission: the old partners are debited in their old ratio and Goodwill A/c is credited.',
          hints,
        );
    }
  },
});

// ===============================================================================================================
// GOODWILL NOT BROUGHT IN, PARTLY BROUGHT IN, ALREADY IN THE BOOKS
// ===============================================================================================================

const jeGoodwillNotBrought = journalTemplate({
  id: 'adm-je-goodwill-not-brought', topicId: T, conceptId: 'adm-goodwill-adjust', difficulty: 'medium', computed: true,
  generate: (rng) => {
    const d = dealOf(rng, ['old', 'equal', 'stated', 'stated', 'one']);
    if (!d) return null;
    const goodwill = amountFor(rng, 60000, 720000, d.given);
    if (goodwill === null) return null;
    const due = of(goodwill, d.share);
    const viaCurrent = rng.int(0, 2) > 0;
    const debit = viaCurrent ? partnerCurrent(d.nw) : partnerCapital(d.nw);
    const via = viaCurrent ? 'Current' : 'Capital';
    const shareGiven = rng.int(0, 2) === 0;
    const told = shareGiven
      ? `${d.nw}'s share of the firm's goodwill comes to ${inr(due)}, but ${d.nw} cannot bring it in cash.`
      : `The goodwill of the firm is valued at ${inr(goodwill)}, but ${d.nw} cannot bring the share of goodwill in cash.`;
    return {
      prompt: `${d.open} ${d.admit} ${d.how} ${told} It is to be adjusted through ${d.nw}'s ${via} A/c; the capital accounts of the old partners are fluctuating. Pass the journal entry for goodwill.`,
      lines: entry(Dr(debit, due), ...d.olds.map((n, i) => Cr(partnerCapital(n), of(goodwill, d.given[i])))),
      explanation: [
        shareGiven ? `${d.nw}'s share of goodwill is ${inr(due)}.` : `${d.nw}'s share of goodwill = ${inr(goodwill)} x ${fs(d.share)} = ${inr(due)}.`,
        givesSteps(d)[0],
        sacStep(d),
        `No cash comes in, so ${d.nw}'s ${via} A/c is debited with ${inr(due)} and Premium for Goodwill A/c is not used.`,
        `${d.olds.filter((_, i) => isPos(d.given[i])).map((n, i2) => `${n}'s Capital A/c is credited with ${inr(of(goodwill, d.given.filter(isPos)[i2]))}`).join('; ')}.`,
      ],
      distractorAccounts: ['premiumForGoodwill', 'goodwill', viaCurrent ? partnerCapital(d.nw) : partnerCurrent(d.nw), ...d.olds.map(partnerCapital)],
      hints: ['No money comes in for goodwill, so who is made to owe it, and to whom?', "New Partner's Current (or Capital) A/c Dr; To Sacrificing Partners' Capital A/cs, in the sacrificing ratio."],
    };
  },
  verify: (q) => {
    const d = readDeal(q.prompt);
    if (!d) return false;
    const [x] = amountsIn(q.prompt);
    const due = /comes to ₹/.test(q.prompt) ? x : x * d.share;
    const credits = sideOf(q, 'Cr');
    const debits = sideOf(q, 'Dr');
    const nw = /through (\w+)'s (Current|Capital) A\/c/.exec(q.prompt);
    if (!nw) return false;
    const debit = nw[2] === 'Current' ? partnerCurrent(nw[1]) : partnerCapital(nw[1]);
    return debits.size === 1 && near(debits.get(debit) ?? 0, due) && d.olds.every((n, i) => near(credits.get(partnerCapital(n)) ?? 0, (due * d.given[i]) / d.share));
  },
});

const PAID: Frac[] = [[1, 2], [3, 5], [2, 5], [3, 4], [1, 4], [2, 3], [1, 3]];

const jeGoodwillPartly = journalTemplate({
  id: 'adm-je-goodwill-partly', topicId: T, conceptId: 'adm-goodwill-adjust', difficulty: 'complex', computed: true,
  generate: (rng) => {
    const d = dealOf(rng, ['old', 'equal', 'stated', 'stated']);
    if (!d) return null;
    const paid = rng.pick(PAID);
    const goodwill = amountFor(rng, 80000, 900000, [...d.given, times(d.share, paid)]);
    if (goodwill === null) return null;
    const due = of(goodwill, d.share);
    const brought = of(due, paid);
    return {
      prompt: `${d.open} ${d.admit} ${d.how} The goodwill of the firm is valued at ${inr(goodwill)}. ${d.nw} brings only ${inr(brought)} in cash as premium for goodwill, which has been credited to Premium for Goodwill A/c; the rest of ${d.nw}'s share of goodwill is to be adjusted through ${d.nw}'s Current A/c. The capital accounts are fluctuating. Pass the one journal entry that gives the sacrificing partners their due.`,
      lines: entry(Dr('premiumForGoodwill', brought), Dr(partnerCurrent(d.nw), due - brought), ...d.olds.map((n, i) => Cr(partnerCapital(n), of(goodwill, d.given[i])))),
      explanation: [
        `${d.nw}'s share of goodwill = ${inr(goodwill)} x ${fs(d.share)} = ${inr(due)}; brought in cash ${inr(brought)}, not brought ${inr(due - brought)}.`,
        givesSteps(d)[0],
        sacStep(d),
        `Premium for Goodwill A/c is debited with the ${inr(brought)} received and ${d.nw}'s Current A/c with the ${inr(due - brought)} not brought in.`,
        `The sacrificing partners are credited with the whole ${inr(due)}: ${d.olds.map((n, i) => `${n} ${inr(of(goodwill, d.given[i]))}`).join('; ')}.`,
      ],
      distractorAccounts: ['goodwill', partnerCapital(d.nw), 'bank'],
      hints: ["Work out the new partner's full share of goodwill first, then split it into the part brought and the part not brought.", "Premium for Goodwill A/c Dr (brought); New Partner's Current A/c Dr (not brought); To Sacrificing Partners' Capital A/cs."],
    };
  },
  verify: (q) => {
    const d = readDeal(q.prompt);
    if (!d) return false;
    const [goodwill, brought] = amountsIn(q.prompt);
    const due = goodwill * d.share;
    const debits = sideOf(q, 'Dr');
    const credits = sideOf(q, 'Cr');
    return debits.get('premiumForGoodwill') === brought && near(totalOf(debits), due) && debits.size === 2 && d.olds.every((n, i) => near(credits.get(partnerCapital(n)) ?? 0, goodwill * d.given[i]));
  },
});

/** Admissions in which one old partner gains a share while the other sacrifices: the old ratio, the new one, and the common denominator. */
const NEW3: number[][] = [[2, 2, 1], [1, 1, 1], [3, 2, 1], [3, 3, 2], [2, 1, 1], [5, 3, 2], [4, 3, 3], [3, 2, 2], [4, 4, 1], [3, 3, 1], [2, 3, 1], [1, 2, 1], [1, 2, 2], [2, 3, 3], [3, 4, 3]];
const GAINERS = uniqueRatios(OLD2).flatMap((old) =>
  NEW3.flatMap((newRatio) => {
    const change = sharesOf(old).map((s, i) => minus(s, sharesOf(newRatio)[i]));
    const den = lcm(sum(old), sum(newRatio));
    const keepsEnough = sharesOf(old).every((s, i) => sharesOf(newRatio)[i][0] * s[1] * 3 >= s[0] * sharesOf(newRatio)[i][1]);
    return change.filter(isPos).length === 1 && change.filter((c) => c[0] < 0).length === 1 && den <= 60 && keepsEnough ? [{ old, newRatio, change, den }] : [];
  }),
);

const jePremiumGainer = journalTemplate({
  id: 'adm-je-premium-gainer', topicId: T, conceptId: 'adm-goodwill-adjust', difficulty: 'complex', computed: true,
  generate: (rng) => {
    const x = rng.pick(GAINERS);
    const names = rng.shuffle(NAMES).slice(0, 3);
    const olds = names.slice(0, 2);
    const nw = names[2];
    const goodwill = x.den * 1000 * rng.int(Math.ceil(90 / x.den), Math.max(Math.ceil(90 / x.den) + 3, Math.floor(600 / x.den)));
    const newShare = sharesOf(x.newRatio)[2];
    const loser = x.change.findIndex(isPos);
    const gainer = 1 - loser;
    const gain: Frac = [-x.change[gainer][0], x.change[gainer][1]];
    return {
      prompt: `${opening(rng, olds, x.old)} On 1 April ${rng.pick(YEARS)}, ${nw} is admitted as a partner, and the new profit-sharing ratio of ${list(names)} is ${rs(x.newRatio)}. The goodwill of the firm is valued at ${inr(goodwill)}. ${nw} brings ${nw}'s share of this goodwill in cash as premium, and it has been credited to Premium for Goodwill A/c. An old partner who gains a share is to compensate the sacrificing partner through the capital accounts, which are fluctuating. Pass the one journal entry that adjusts goodwill among the partners.`,
      lines: [Dr('premiumForGoodwill', of(goodwill, newShare)), Dr(partnerCapital(olds[gainer]), of(goodwill, gain)), Cr(partnerCapital(olds[loser]), of(goodwill, x.change[loser]))],
      explanation: [
        `${olds[loser]}: old share ${fs(sharesOf(x.old)[loser])} - new share ${fs(sharesOf(x.newRatio)[loser])} = ${fs(x.change[loser])}, a sacrifice.`,
        `${olds[gainer]}: old share ${fs(sharesOf(x.old)[gainer])} - new share ${fs(sharesOf(x.newRatio)[gainer])} = -${fs(gain)}, a gain of ${fs(gain)}; ${nw} gains ${fs(newShare)}.`,
        `${nw}'s premium = ${inr(goodwill)} x ${fs(newShare)} = ${inr(of(goodwill, newShare))}: Premium for Goodwill A/c is debited.`,
        `${olds[gainer]} also gains, so ${olds[gainer]}'s Capital A/c is debited with ${inr(goodwill)} x ${fs(gain)} = ${inr(of(goodwill, gain))}.`,
        `${olds[loser]} alone sacrifices and is credited with ${inr(goodwill)} x ${fs(x.change[loser])} = ${inr(of(goodwill, x.change[loser]))}.`,
      ],
      distractorAccounts: ['goodwill', partnerCapital(nw), partnerCurrent(olds[gainer]), 'bank'],
      hints: ['Find old share less new share for each old partner. Is every answer a sacrifice?', 'Every partner who gains pays for the gain: the new partner through the premium, an old partner through the capital account. The sacrificing partner is credited.'],
    };
  },
  verify: (q) => {
    const [old, newRatio] = ratiosIn(q.prompt);
    const olds = oldNamesIn(q.prompt);
    const [goodwill] = amountsIn(q.prompt);
    if (!old || !newRatio || newRatio.length !== 3 || olds.length !== 2) return false;
    const debits = sideOf(q, 'Dr');
    const credits = sideOf(q, 'Cr');
    const moved = olds.every((n, i) => {
      const change = (old[i] / sum(old) - newRatio[i] / sum(newRatio)) * goodwill;
      return near((change > 0 ? credits : debits).get(partnerCapital(n)) ?? 0, Math.abs(change));
    });
    return moved && near(debits.get('premiumForGoodwill') ?? 0, (goodwill * newRatio[2]) / sum(newRatio)) && near(totalOf(debits), totalOf(credits));
  },
});

const jeExistingGoodwill = journalTemplate({
  id: 'adm-je-existing-goodwill', topicId: T, conceptId: 'adm-goodwill-adjust', difficulty: 'easy',
  generate: (rng) => {
    const d = deal(rng, 'old', rng.pick([2, 2, 3]));
    if (!d) return null;
    const goodwill = sum(d.old) * 1000 * rng.int(4, 24);
    const premium = rng.step(20000, 120000, 5000);
    const fixed = rng.int(0, 3) === 0;
    const own = ownAccount(fixed);
    return {
      prompt: `${d.open} Goodwill appears in the books of the firm at ${inr(goodwill)}. ${d.admit} ${d.nw} brings ${inr(premium)} in cash as premium for goodwill. ${capsText(fixed)} Pass the journal entry to write off the goodwill that appears in the books.`,
      lines: [...d.olds.map((n, i) => Dr(own(n), of(goodwill, d.oldShares[i]))), Cr('goodwill', goodwill)],
      explanation: [
        'Goodwill standing in the books is written off at the time of admission.',
        `It belongs to the time before ${d.nw} came in, so the old partners bear it in the old ratio ${rs(d.old)}: ${d.olds.map((n, i) => `${n} ${inr(of(goodwill, d.oldShares[i]))}`).join('; ')}.`,
        `Goodwill A/c is credited with ${inr(goodwill)} to close it. The premium ${d.nw} brings is a separate entry.`,
      ],
      distractorAccounts: ['premiumForGoodwill', own(d.nw), 'revaluation'],
      hints: ['Who built the goodwill that is already in the books?', "Old Partners' Capital A/cs Dr, in the old ratio; To Goodwill A/c."],
    };
  },
  verify: (q) => {
    const old = ratiosIn(q.prompt)[0];
    const olds = oldNamesIn(q.prompt);
    const [goodwill] = amountsIn(q.prompt);
    const own = ownAccount(/fixed capital/.test(q.prompt));
    const debits = sideOf(q, 'Dr');
    return sideOf(q, 'Cr').get('goodwill') === goodwill && debits.size === olds.length && olds.every((n, i) => near(debits.get(own(n)) ?? 0, (goodwill * old[i]) / sum(old)));
  },
});

const goodwillExistingNet = numericTemplate({
  id: 'adm-goodwill-existing-net', topicId: T, conceptId: 'adm-goodwill-adjust', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const d = dealWhere(rng, ['equal', 'stated', 'stated', 'surrender'], (x) => x.sac !== null && !sameTerms(x.sac, x.old));
    if (!d) return null;
    const caps = [rng.step(200000, 800000, 10000), rng.step(200000, 800000, 10000)];
    const existing = amountFor(rng, 20000, 150000, d.oldShares);
    const premium = amountFor(rng, 30000, 240000, d.parts);
    if (existing === null || premium === null) return null;
    const j = rng.int(0, 1);
    const who = d.olds[j];
    const off = of(existing, d.oldShares[j]);
    const got = of(premium, d.parts[j]);
    const m = money(caps[j] - off + got, [
      [caps[j] + got, 'Left the old goodwill in the books instead of writing it off among the old partners.'],
      [caps[j] - off + of(premium, d.oldShares[j]), 'Shared the premium in the old ratio instead of the sacrificing ratio.'],
      [caps[j] + off + got, 'Added the share of the old goodwill. Writing goodwill off reduces the capital.'],
      [caps[j] - of(existing, d.news[j]) + got, 'Wrote the old goodwill off in the new ratio. It is written off among the old partners in the old ratio.'],
      [caps[j] - off, 'Wrote off the old goodwill but left out the share of the premium.'],
    ]);
    return m && {
      prompt: `${d.open} Their capitals are ${inr(caps[0])} and ${inr(caps[1])}, and Goodwill appears in the books at ${inr(existing)}. ${d.admit} ${d.how} ${d.nw} brings ${inr(premium)} in cash as premium for goodwill, and it is kept in the business. The capital accounts are fluctuating. After the two goodwill adjustments alone, what is the balance of ${who}'s Capital A/c?`,
      ...m,
      explanation: [
        `Goodwill in the books is written off in the old ratio ${rs(d.old)}: ${who} is debited with ${inr(existing)} x ${fs(d.oldShares[j])} = ${inr(off)}.`,
        givesSteps(d)[0],
        `${sacStep(d)} ${who} is credited with ${inr(premium)} x ${fs(d.parts[j])} = ${inr(got)}.`,
        `Balance = ${inr(caps[j])} - ${inr(off)} + ${inr(got)} = ${inr(caps[j] - off + got)}.`,
      ],
      hints: ['There are two adjustments: the goodwill already in the books, and the premium brought in. Each has its own ratio.', 'Old goodwill is written off in the old ratio; the premium is credited in the sacrificing ratio.'],
    };
  },
  verify: (q: NumericQuestion) => {
    const d = readDeal(q.prompt);
    const who = /balance of (\w+)'s Capital/.exec(q.prompt)?.[1];
    const j = d ? d.olds.indexOf(who ?? '') : -1;
    if (!d || j < 0) return false;
    const [capA, capB, existing, premium] = amountsIn(q.prompt);
    return near(q.answer / 100, [capA, capB][j] - existing * d.shares[j] + (premium * d.given[j]) / d.share);
  },
});

// ===============================================================================================================
// HIDDEN GOODWILL
// ===============================================================================================================

const HIDDEN_SHARES: Frac[] = [[1, 4], [1, 5], [1, 3], [1, 6], [2, 5], [1, 8], [3, 10], [1, 4], [1, 5]];

/** Two round capitals that add up to a total (itself in thousands): the first between two- and three-fifths of it. */
function splitCapital(rng: Rng, total: number): [number, number] {
  const first = Math.round((total * rng.int(40, 62)) / 100 / 5000) * 5000;
  return [first, total - first];
}

const hiddenGoodwill = numericTemplate({
  id: 'adm-hidden-goodwill', topicId: T, conceptId: 'adm-hidden-goodwill', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const names = rng.shuffle(NAMES).slice(0, 3);
    const olds = names.slice(0, 2);
    const nw = names[2];
    const share = rng.pick(HIDDEN_SHARES);
    const [k, n] = share;
    const capital = k * 10000 * rng.int(Math.ceil(8 / k), Math.floor(40 / k));
    const firm = (capital * n) / k;
    const hidden = n * 1000 * rng.int(Math.ceil(20 / n), Math.floor(240 / n));
    const oldTotal = firm - capital - hidden;
    if (oldTotal < 150000) return null;
    const [capA, capB] = splitCapital(rng, oldTotal);
    const askShare = rng.int(0, 2) === 0;
    const base = `${opening(rng, olds, rng.pick(OLD2))} After all adjustments their capitals stand at ${inr(capA)} and ${inr(capB)}. On 1 April ${rng.pick(YEARS)}, ${nw} is admitted for ${fs(share)} share in the profits and brings ${inr(capital)} as capital, but nothing for goodwill. The firm has no reserves or accumulated profits or losses, and goodwill is to be worked out from the capitals.`;
    const steps = [
      `${nw}'s ${inr(capital)} is for ${fs(share)} of the firm, so the firm is worth ${inr(capital)} x ${n}/${k} = ${inr(firm)}.`,
      `Capital actually in the new firm = ${inr(capA)} + ${inr(capB)} + ${inr(capital)} = ${inr(oldTotal + capital)}.`,
      `Hidden goodwill = ${inr(firm)} - ${inr(oldTotal + capital)} = ${inr(hidden)}.`,
    ];
    if (askShare) {
      const m = money(of(hidden, share), [
        [hidden, `Gave the goodwill of the whole firm. ${nw} is charged only for the ${fs(share)} share.`],
        [of(firm - oldTotal, share), `Left ${nw}'s own capital out of the capital actually in the new firm.`],
        [of(hidden, minus(ONE, share)), `Gave the old partners' part of the goodwill instead of ${nw}'s.`],
      ]);
      return m && {
        prompt: `${base} What is ${nw}'s share of the hidden goodwill?`,
        ...m,
        explanation: [...steps, `${nw}'s share = ${inr(hidden)} x ${fs(share)} = ${inr(of(hidden, share))}.`],
        hints: H.hidden,
      };
    }
    const m = money(hidden, [
      [firm - oldTotal, `Left ${nw}'s own capital out of the capital actually in the new firm.`],
      [firm, 'Stopped at the capitalised value of the firm. Goodwill is what is left after the actual capital is deducted.'],
      [of(hidden, share), `Gave ${nw}'s share of the goodwill; the question asks for the goodwill of the whole firm.`],
      [capital * n - (oldTotal + capital), 'Multiplied the capital by the denominator of the share only, without dividing by its numerator.'],
    ]);
    return m && {
      prompt: `${base} What is the hidden goodwill of the firm?`,
      ...m,
      explanation: steps,
      hints: H.hidden,
    };
  },
  verify: (q: NumericQuestion) => {
    const share = shareIn(q.prompt);
    const [capA, capB, capital] = amountsIn(q.prompt);
    if (!share) return false;
    const s = share[0] / share[1];
    // Another way to the same figure: what the old partners' capital should be for their share, less what it is.
    const hidden = (capital / s) * (1 - s) - (capA + capB);
    return near(q.answer / 100, /share of the hidden goodwill/.test(q.prompt) ? hidden * s : hidden);
  },
});

const hiddenGoodwillShare = numericTemplate({
  id: 'adm-hidden-goodwill-share', topicId: T, conceptId: 'adm-hidden-goodwill', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const names = rng.shuffle(NAMES).slice(0, 3);
    const olds = names.slice(0, 2);
    const nw = names[2];
    const share = rng.pick(HIDDEN_SHARES);
    const [k, n] = share;
    const capital = k * 10000 * rng.int(Math.ceil(10 / k), Math.floor(40 / k));
    const firm = (capital * n) / k;
    const hidden = n * 1000 * rng.int(Math.ceil(20 / n), Math.floor(200 / n));
    const which = rng.int(0, 2);
    const reserve = which === 1 ? 0 : n * 1000 * rng.int(Math.ceil(20 / n), Math.ceil(90 / n));
    const loss = which === 0 ? 0 : n * 1000 * rng.int(Math.ceil(10 / n), Math.ceil(45 / n));
    const oldTotal = firm - capital - hidden - reserve + loss;
    if (oldTotal < 150000) return null;
    const [capA, capB] = splitCapital(rng, oldTotal);
    const worth = oldTotal + reserve - loss + capital;
    const also = [
      reserve > 0 ? `a General Reserve of ${inr(reserve)}` : '',
      loss > 0 ? `a debit balance of ${inr(loss)} in Profit and Loss A/c` : '',
    ].filter((x) => x !== '');
    const m = money(of(hidden, share), [
      [hidden, `Gave the goodwill of the whole firm. ${nw} is charged only for the ${fs(share)} share.`],
      [reserve > 0 ? of(hidden + reserve, share) : 0, 'Left the General Reserve out of the net worth. A reserve is part of what the partners own in the firm.'],
      [loss > 0 ? of(hidden - loss, share) : 0, 'Ignored the debit balance of Profit and Loss A/c. An accumulated loss reduces the net worth.'],
      [loss > 0 ? of(hidden - 2 * loss, share) : 0, 'Added the debit balance of Profit and Loss A/c to the net worth. An accumulated loss reduces it.'],
      [of(hidden + capital, share), `Left ${nw}'s own capital out of the net worth of the new firm.`],
    ]);
    return m && {
      prompt: `${opening(rng, olds, rng.pick(OLD2))} Their capital accounts show ${inr(capA)} and ${inr(capB)}, and the balance sheet also shows ${also.join(' and ')}. On 1 April ${rng.pick(YEARS)}, ${nw} is admitted for ${fs(share)} share in the profits and brings ${inr(capital)} as capital, but nothing for goodwill. Goodwill is to be worked out from the capitals (hidden goodwill), taking the net worth of the new firm into account. What is ${nw}'s share of the goodwill?`,
      ...m,
      explanation: [
        `${nw}'s ${inr(capital)} is for ${fs(share)} of the firm, so the firm is worth ${inr(capital)} x ${n}/${k} = ${inr(firm)}.`,
        `Net worth of the new firm = ${inr(capA)} + ${inr(capB)}${reserve > 0 ? ` + ${inr(reserve)} (reserve)` : ''}${loss > 0 ? ` - ${inr(loss)} (accumulated loss)` : ''} + ${inr(capital)} = ${inr(worth)}.`,
        `Hidden goodwill = ${inr(firm)} - ${inr(worth)} = ${inr(hidden)}.`,
        `${nw}'s share = ${inr(hidden)} x ${fs(share)} = ${inr(of(hidden, share))}.`,
      ],
      hints: ['Net worth is the capitals plus reserves and undistributed profits, less accumulated losses.', "Hidden goodwill = capitalised value of the firm - net worth of the new firm, the new partner's capital included."],
    };
  },
  verify: (q: NumericQuestion) => {
    const share = shareIn(q.prompt);
    if (!share) return false;
    const s = share[0] / share[1];
    const amounts = amountsIn(q.prompt);
    const [capA, capB] = amounts;
    const capital = amounts[amounts.length - 1];
    const reserve = /General Reserve of ₹([\d,]+)/.exec(q.prompt);
    const loss = /debit balance of ₹([\d,]+)/.exec(q.prompt);
    const num = (m: RegExpExecArray | null): number => (m ? Number(m[1].replace(/,/g, '')) : 0);
    return near(q.answer / 100, (capital / s - (capA + capB + num(reserve) - num(loss) + capital)) * s);
  },
});

// ===============================================================================================================
// REVALUATION OF ASSETS AND REASSESSMENT OF LIABILITIES
// ===============================================================================================================

/** One change of value on revaluation: a gain (effect above zero) or a loss, in rupees. */
interface RevItem {
  text: string;
  effect: number;
  /** The working line for it. */
  step: string;
  /** The mistake of taking it the other way round. */
  flipWhy: string;
}

/**
 * The changes a question may list, with amounts that are multiples of `unit` rupees (so that every partner's share
 * of the result is a whole number of rupees).
 */
function revPool(rng: Rng, unit: number): { gains: RevItem[]; losses: RevItem[] } {
  const u = (lo: number, hi: number): number => {
    const first = Math.max(1, Math.ceil((lo * 1000) / unit));
    return unit * rng.int(first, Math.max(first, Math.floor((hi * 1000) / unit)));
  };
  const asset = rng.pick(['Building', 'Land']);
  const up = u(10, 80);
  const invest = u(6, 40);
  const cred = u(3, 20);
  const stock = u(4, 30);
  const prov = u(2, 15);
  const out = u(2, 12);
  const furn = u(3, 15);
  const dep = u(5, 30);
  const provRate = rng.pick([5, 10]);
  const debtors = (prov * 100) / provRate;
  const depRate = rng.pick([5, 10, 20]);
  const machinery = (dep * 100) / depRate;
  const outKind = rng.pick(['salaries', 'rent', 'wages']);
  return {
    gains: [
      { text: `${asset} is to be appreciated by ${inr(up)}.`, effect: up, step: `${asset} rises by ${inr(up)}: a gain.`, flipWhy: `Took the rise in the value of ${asset === 'Building' ? 'the building' : 'land'} as a loss. An asset that rises in value is a gain.` },
      { text: `Investments of ${inr(invest)}, not recorded in the books, are to be brought into the books.`, effect: invest, step: `Unrecorded investments of ${inr(invest)} come into the books: a gain.`, flipWhy: 'Took the unrecorded investments as a loss. An asset brought into the books is a gain.' },
      { text: `Creditors of ${inr(cred)} are no longer payable and are to be written back.`, effect: cred, step: `Creditors fall by ${inr(cred)}: a gain.`, flipWhy: 'Took the creditors written back as a loss. A liability that falls is a gain.' },
    ],
    losses: [
      { text: `Stock is to be reduced by ${inr(stock)}.`, effect: -stock, step: `Stock falls by ${inr(stock)}: a loss.`, flipWhy: 'Took the fall in the value of stock as a gain. An asset that falls in value is a loss.' },
      { text: `A provision for doubtful debts of ${provRate}% is to be made on debtors of ${inr(debtors)}.`, effect: -prov, step: `Provision for doubtful debts = ${provRate}% of ${inr(debtors)} = ${inr(prov)}: a loss.`, flipWhy: 'Took the provision for doubtful debts as a gain. It reduces the debtors, so it is a loss.' },
      { text: `Outstanding ${outKind} of ${inr(out)} are to be recorded.`, effect: -out, step: `Outstanding ${outKind} of ${inr(out)} are a new liability: a loss.`, flipWhy: `Took the outstanding ${outKind} as a gain. A liability brought into the books is a loss.` },
      { text: `Furniture is to be reduced by ${inr(furn)}.`, effect: -furn, step: `Furniture falls by ${inr(furn)}: a loss.`, flipWhy: 'Took the fall in the value of furniture as a gain. An asset that falls in value is a loss.' },
      { text: `Machinery, in the books at ${inr(machinery)}, is to be depreciated by ${depRate}%.`, effect: -dep, step: `Depreciation on machinery = ${depRate}% of ${inr(machinery)} = ${inr(dep)}: a loss.`, flipWhy: 'Took the depreciation on machinery as a gain. An asset that falls in value is a loss.' },
    ],
  };
}

/** Some gains and some losses from the pool, in the order they are listed in the question. */
function revItems(rng: Rng, unit: number, counts: readonly (readonly [number, number])[]): RevItem[] {
  const pool = revPool(rng, unit);
  const [gains, losses] = rng.pick(counts);
  return rng.shuffle([...rng.shuffle(pool.gains).slice(0, gains), ...rng.shuffle(pool.losses).slice(0, losses)]);
}
const lettered = (texts: readonly string[]): string => texts.map((t, k) => `(${'abcdefgh'[k]}) ${t}`).join('\n');
const netOf = (items: readonly RevItem[]): number => sum(items.map((i) => i.effect));
const resultText = (v: number): string | null => (v > 0 ? `Profit of ${inr(v)}` : v < 0 ? `Loss of ${inr(-v)}` : null);
/** The working of a Revaluation Account from its items. */
function revSteps(items: readonly RevItem[]): string[] {
  const net = netOf(items);
  const gains = sum(items.filter((i) => i.effect > 0).map((i) => i.effect));
  return [...items.map((i) => i.step), `Gains ${inr(gains)} - losses ${inr(gains - net)} = ${net > 0 ? 'profit' : 'loss'} on revaluation of ${inr(Math.abs(net))}.`];
}

/** One listed change read back from its line: above zero for a gain, below for a loss. */
function readRevLine(line: string): number {
  const [x] = amountsIn(line);
  const rate = /(\d+)%/.exec(line);
  const amount = rate ? (x * Number(rate[1])) / 100 : x;
  if (/appreciated by|brought into the books|written back/.test(line)) return amount;
  if (/reduced by|Outstanding|provision for doubtful debts|depreciated by/.test(line)) return -amount;
  return NaN;
}
const readRevLines = (lines: readonly string[]): number => sum(lines.map(readRevLine));

const revaluationResult = mcqTemplate({
  id: 'adm-revaluation-result', topicId: T, conceptId: 'adm-revaluation', difficulty: 'medium',
  generate: (rng) => {
    const d = deal(rng, 'old');
    if (!d) return null;
    const items = revItems(rng, 1000, [[1, 2], [2, 1], [2, 2]]);
    const net = netOf(items);
    const correct = resultText(net);
    if (correct === null) return null;
    return choice(
      `${d.open} ${d.admit} The assets and liabilities are revalued as listed below. What is the result of the revaluation?\n${lettered(items.map((i) => i.text))}`,
      correct,
      [
        [resultText(-net), 'Read the Revaluation Account the wrong way round: took the gains as losses and the losses as gains.'],
        ...items.map((i): [string | null, string] => [resultText(net - 2 * i.effect), i.flipWhy]),
      ],
      revSteps(items).join(' '),
      H.revaluation,
    );
  },
  verify: (q) => {
    const net = readRevLines(q.prompt.split('\n').slice(1));
    const m = /^(Profit|Loss) of ₹([\d,]+)$/.exec(optionText(q));
    return !!m && near((m[1] === 'Profit' ? 1 : -1) * Number(m[2].replace(/,/g, '')), net);
  },
});

const revaluationShare = numericTemplate({
  id: 'adm-revaluation-share', topicId: T, conceptId: 'adm-revaluation', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const d = deal(rng, ['old', 'equal', 'stated'], rng.pick([2, 2, 3]));
    if (!d) return null;
    const m = d.olds.length;
    const items = revItems(rng, sum(d.old) * 1000, [[1, 1], [2, 1], [1, 2]]);
    const net = netOf(items);
    if (net === 0) return null;
    const size = Math.abs(net);
    const j = rng.int(0, m - 1);
    const who = d.olds[j];
    const word = net > 0 ? 'profit' : 'loss';
    const answer = money(of(size, d.oldShares[j]), [
      [of(size, d.news[j]), `Shared the ${word} on revaluation in the new ratio. It arose before the admission, so it belongs to the old partners in the old ratio.`],
      [size / m, `Shared the ${word} equally among the old partners instead of in the old ratio.`],
      ...items.map((i): [number, string] => [of(Math.abs(net - 2 * i.effect), d.oldShares[j]), i.flipWhy]),
      [size, `Gave the whole ${word} on revaluation, not ${who}'s share of it.`],
    ]);
    return answer && {
      prompt: `${d.open} ${d.admit} ${d.how} The assets and liabilities are revalued as listed below, and the capital accounts are fluctuating. How much is ${net > 0 ? 'credited' : 'debited'} to ${who}'s Capital A/c for the ${word} on revaluation?\n${lettered(items.map((i) => i.text))}`,
      ...answer,
      explanation: [...revSteps(items), `It belongs to the old partners in the old ratio ${rs(d.old)}: ${who}'s share = ${inr(size)} x ${fs(d.oldShares[j])} = ${inr(of(size, d.oldShares[j]))}.`],
      hints: H.revaluation,
    };
  },
  verify: (q: NumericQuestion) => {
    const [first, ...lines] = q.prompt.split('\n');
    const old = ratiosIn(first)[0];
    const who = /to (\w+)'s Capital A\/c for the (profit|loss)/.exec(first);
    const j = oldNamesIn(first).indexOf(who?.[1] ?? '');
    const net = readRevLines(lines);
    return !!who && j >= 0 && net > 0 === (who[2] === 'profit') && near(q.answer / 100, (Math.abs(net) * old[j]) / sum(old));
  },
});

/** A single change on revaluation and its entry: which account is debited and which credited. */
const REV_ENTRIES: { text: (x: string) => string; dr: string; cr: string; steps: [string, string] }[] = [
  { text: (x) => `the building is to be appreciated by ${x}`, dr: 'building', cr: 'revaluation', steps: ['The building is worth more, so Building A/c is debited.', 'A rise in the value of an asset is a gain: Revaluation A/c is credited.'] },
  { text: (x) => `the land is to be appreciated by ${x}`, dr: 'land', cr: 'revaluation', steps: ['The land is worth more, so Land A/c is debited.', 'A rise in the value of an asset is a gain: Revaluation A/c is credited.'] },
  { text: (x) => `investments of ${x}, not recorded in the books, are to be brought into the books`, dr: 'investments', cr: 'revaluation', steps: ['An asset comes into the books, so Investments A/c is debited.', 'An unrecorded asset is a gain: Revaluation A/c is credited.'] },
  { text: (x) => `creditors of ${x} are no longer payable and are to be written back`, dr: 'creditors', cr: 'revaluation', steps: ['The liability falls, so Creditors A/c is debited.', 'A fall in a liability is a gain: Revaluation A/c is credited.'] },
  { text: (x) => `stock is to be reduced by ${x}`, dr: 'revaluation', cr: 'stock', steps: ['A fall in the value of an asset is a loss: Revaluation A/c is debited.', 'Stock is worth less, so Stock A/c is credited.'] },
  { text: (x) => `furniture is to be reduced by ${x}`, dr: 'revaluation', cr: 'furniture', steps: ['A fall in the value of an asset is a loss: Revaluation A/c is debited.', 'Furniture is worth less, so Furniture A/c is credited.'] },
  { text: (x) => `machinery is to be written down by ${x}`, dr: 'revaluation', cr: 'machinery', steps: ['A fall in the value of an asset is a loss: Revaluation A/c is debited.', 'Machinery is worth less, so Machinery A/c is credited.'] },
  { text: (x) => `outstanding expenses of ${x}, not yet in the books, are to be recorded`, dr: 'revaluation', cr: 'outstandingExpenses', steps: ['A liability that was not in the books is a loss: Revaluation A/c is debited.', 'The liability is now recorded, so Outstanding Expenses A/c is credited.'] },
  { text: (x) => `a provision for doubtful debts of ${x} is to be created`, dr: 'revaluation', cr: 'provisionForDoubtfulDebts', steps: ['The provision reduces what the debtors are worth, a loss: Revaluation A/c is debited.', 'Provision for Doubtful Debts A/c is credited.'] },
  { text: (x) => `debtors of ${x} have turned bad and are to be written off, there being no provision for doubtful debts`, dr: 'revaluation', cr: 'debtors', steps: ['There is no provision to meet the bad debts, so they are a loss on revaluation: Revaluation A/c is debited.', 'The debtors fall, so Debtors A/c is credited.'] },
];

const jeRevaluationItem = journalTemplate({
  id: 'adm-je-revaluation-item', topicId: T, conceptId: 'adm-revaluation', difficulty: 'easy',
  generate: (rng) => {
    const d = deal(rng, 'old');
    if (!d) return null;
    const e = rng.pick(REV_ENTRIES);
    const x = rng.step(4000, 80000, 2000);
    return {
      prompt: `${d.open} ${d.admit} On revaluation at the time of admission, ${e.text(inr(x))}. Pass the journal entry for this change.`,
      lines: [Dr(e.dr, x), Cr(e.cr, x)],
      explanation: e.steps,
      distractorAccounts: ['profitAndLoss', partnerCapital(d.olds[0]), 'generalReserve'],
      hints: H.revaluation,
    };
  },
  verify: (q) => {
    const [x] = amountsIn(q.prompt);
    const gain = /appreciated by|brought into the books|written back/.test(q.prompt);
    return q.expected.length === 2 && q.expected.every((l) => l.amount === x * 100) && q.expected.some((l) => l.accountId === 'revaluation' && l.side === (gain ? 'Cr' : 'Dr'));
  },
});

const jeRevaluationPercent = journalTemplate({
  id: 'adm-je-revaluation-percent', topicId: T, conceptId: 'adm-revaluation', difficulty: 'medium', computed: true,
  generate: (rng) => {
    const d = deal(rng, 'old');
    if (!d) return null;
    const base = `${d.open} ${d.admit} On revaluation at the time of admission:`;
    const ask = 'Pass the journal entry for this change.';
    const distractorAccounts = ['profitAndLoss', partnerCapital(d.olds[0]), 'badDebts'];
    const variant = rng.int(0, 4);
    if (variant === 0) {
      const rate = rng.pick([5, 10]);
      const debtors = rng.step(100000, 600000, 20000);
      const needed = (debtors * rate) / 100;
      const gap = rng.step(1000, Math.min(8000, needed - 1000), 1000);
      const more = rng.int(0, 2) > 0;
      const existing = more ? needed - gap : needed + gap;
      return {
        prompt: `${base} debtors stand at ${inr(debtors)} and the existing provision for doubtful debts is ${inr(existing)}; the provision is to be kept at ${rate}% of debtors. ${ask}`,
        lines: more ? [Dr('revaluation', gap), Cr('provisionForDoubtfulDebts', gap)] : [Dr('provisionForDoubtfulDebts', gap), Cr('revaluation', gap)],
        explanation: [
          `Provision needed = ${rate}% of ${inr(debtors)} = ${inr(needed)}; provision in the books = ${inr(existing)}.`,
          more
            ? `The provision must rise by ${inr(gap)}, a loss: Revaluation A/c is debited and Provision for Doubtful Debts A/c credited.`
            : `The provision is ${inr(gap)} more than needed. The excess is a gain: Provision for Doubtful Debts A/c is debited and Revaluation A/c credited.`,
        ],
        distractorAccounts: [...distractorAccounts, 'debtors'],
        hints: ['How much provision is needed, and how much is already there?', 'Only the difference goes through Revaluation A/c: a rise in the provision is a loss, a fall is a gain.'],
      };
    }
    if (variant === 1) {
      const rate = rng.pick([5, 10, 15, 20]);
      const book = rng.step(100000, 800000, 20000);
      const dep = (book * rate) / 100;
      return {
        prompt: `${base} machinery stands in the books at ${inr(book)} and is to be depreciated by ${rate}%. ${ask}`,
        lines: [Dr('revaluation', dep), Cr('machinery', dep)],
        explanation: [`Fall in value = ${rate}% of ${inr(book)} = ${inr(dep)}.`, 'A fall in the value of an asset is a loss: Revaluation A/c is debited and Machinery A/c credited.'],
        distractorAccounts: [...distractorAccounts, 'depreciation'],
        hints: H.revaluation,
      };
    }
    if (variant === 2 || variant === 4) {
      const [asset, id] = variant === 2 ? rng.pick([['building', 'building'], ['land', 'land']] as const) : (['stock', 'stock'] as const);
      const book = variant === 2 ? rng.step(200000, 900000, 50000) : rng.step(60000, 300000, 10000);
      const change = variant === 2 ? rng.step(20000, 150000, 10000) : rng.step(4000, 30000, 2000);
      const up = variant === 2 ? rng.int(0, 3) > 0 : rng.int(0, 3) === 0;
      const value = up ? book + change : book - change;
      const name = asset.charAt(0).toUpperCase() + asset.slice(1);
      return {
        prompt: `${base} ${asset} stands in the books at ${inr(book)} and is ${variant === 2 ? 'revalued at' : 'found to be worth'} ${inr(value)}. ${ask}`,
        lines: up ? [Dr(id, change), Cr('revaluation', change)] : [Dr('revaluation', change), Cr(id, change)],
        explanation: [
          `Change in value = ${inr(value)} - ${inr(book)} = ${up ? 'a rise' : 'a fall'} of ${inr(change)}.`,
          up ? `A rise in the value of an asset is a gain: ${name} A/c is debited and Revaluation A/c credited.` : `A fall in the value of an asset is a loss: Revaluation A/c is debited and ${name} A/c credited.`,
        ],
        distractorAccounts,
        hints: ['Only the change in value is entered, not the new value.', 'A rise in an asset is credited to Revaluation A/c; a fall is debited to it.'],
      };
    }
    const rate = rng.pick([5, 10]);
    const left = rng.step(100000, 500000, 20000);
    const bad = rng.step(2000, 20000, 1000);
    const prov = (left * rate) / 100;
    return {
      prompt: `${base} debtors stand at ${inr(left + bad)} and there is no provision for doubtful debts; bad debts of ${inr(bad)} are to be written off and a provision of ${rate}% is to be made on the remaining debtors. Pass one journal entry for these changes.`,
      lines: [Dr('revaluation', bad + prov), Cr('debtors', bad), Cr('provisionForDoubtfulDebts', prov)],
      explanation: [
        `Debtors after writing off bad debts = ${inr(left + bad)} - ${inr(bad)} = ${inr(left)}; provision = ${rate}% of ${inr(left)} = ${inr(prov)}.`,
        `Both are losses: Revaluation A/c is debited with ${inr(bad)} + ${inr(prov)} = ${inr(bad + prov)}.`,
        `Debtors A/c is credited with ${inr(bad)} and Provision for Doubtful Debts A/c with ${inr(prov)}.`,
      ],
      distractorAccounts,
      hints: ['Write off the bad debts first; the provision is worked on the debtors that remain.', 'Revaluation A/c Dr; To Debtors A/c (bad debts); To Provision for Doubtful Debts A/c.'],
    };
  },
  verify: (q) => {
    const [a, b] = amountsIn(q.prompt);
    const rate = Number(/(\d+)%/.exec(q.prompt)?.[1]);
    const debits = sideOf(q, 'Dr');
    const credits = sideOf(q, 'Cr');
    const reval = (debits.get('revaluation') ?? 0) - (credits.get('revaluation') ?? 0);
    if (!near(totalOf(debits), totalOf(credits))) return false;
    if (/existing provision/.test(q.prompt)) return near(reval, (a * rate) / 100 - b);
    if (/bad debts of/.test(q.prompt)) return near(reval, b + ((a - b) * rate) / 100) && credits.get('debtors') === b;
    if (/depreciated by/.test(q.prompt)) return near(reval, (a * rate) / 100);
    return near(reval, a - b);
  },
});

const jeRevaluationTransfer = journalTemplate({
  id: 'adm-je-revaluation-transfer', topicId: T, conceptId: 'adm-revaluation', difficulty: 'medium',
  generate: (rng) => {
    const d = deal(rng, 'old', rng.pick([2, 2, 3]));
    if (!d) return null;
    const unit = sum(d.old) * 1000;
    const result = unit * rng.int(Math.ceil(15000 / unit), Math.floor(150000 / unit));
    const profit = rng.int(0, 2) > 0;
    const fixed = rng.int(0, 3) === 0;
    const own = ownAccount(fixed);
    const parts = d.olds.map((_, i) => of(result, d.oldShares[i]));
    return {
      prompt: `${d.open} ${d.admit} The new profit-sharing ratio of ${list(d.names)} is ${rs(d.newRatio)}. The Revaluation Account prepared on ${d.nw}'s admission shows a ${profit ? 'profit' : 'loss'} of ${inr(result)}. ${capsText(fixed)} Pass the journal entry to transfer it.`,
      lines: profit ? [Dr('revaluation', result), ...d.olds.map((n, i) => Cr(own(n), parts[i]))] : [...d.olds.map((n, i) => Dr(own(n), parts[i])), Cr('revaluation', result)],
      explanation: [
        `The ${profit ? 'profit' : 'loss'} arose before ${d.nw} came in, so it belongs to the old partners in the old ratio ${rs(d.old)}, not the new ratio.`,
        `${d.olds.map((n, i) => `${n} ${inr(result)} x ${fs(d.oldShares[i])} = ${inr(parts[i])}`).join('; ')}.`,
        profit
          ? `Revaluation A/c has a credit balance, so it is debited to close it and the old partners' ${ownName(fixed)} A/cs are credited.`
          : `Revaluation A/c has a debit balance, so the old partners' ${ownName(fixed)} A/cs are debited and Revaluation A/c is credited to close it.`,
      ],
      distractorAccounts: [own(d.nw), 'profitAndLoss', 'generalReserve'],
      hints: H.revaluation,
    };
  },
  verify: (q) => {
    const old = ratiosIn(q.prompt)[0];
    const olds = oldNamesIn(q.prompt);
    const [result] = amountsIn(q.prompt);
    const profit = /shows a profit of/.test(q.prompt);
    const own = ownAccount(/fixed capital/.test(q.prompt));
    const partners = sideOf(q, profit ? 'Cr' : 'Dr');
    return sideOf(q, profit ? 'Dr' : 'Cr').get('revaluation') === result && partners.size === olds.length && olds.every((n, i) => near(partners.get(own(n)) ?? 0, (result * old[i]) / sum(old)));
  },
});

// ===============================================================================================================
// RESERVES AND ACCUMULATED PROFITS AND LOSSES
// ===============================================================================================================

/** A balance that belongs to the old partners: whether they are credited with it or bear it, and its account. */
const BALANCES: { text: (x: string) => string; account: string; name: string; credit: boolean }[] = [
  { text: (x) => `a General Reserve of ${x}`, account: 'generalReserve', name: 'General Reserve', credit: true },
  { text: (x) => `a credit balance of ${x} in Profit and Loss A/c (undistributed profit)`, account: 'profitAndLoss', name: 'Profit and Loss', credit: true },
  { text: (x) => `a Workmen Compensation Reserve of ${x}, against which there is no claim`, account: 'workmenCompensationReserve', name: 'Workmen Compensation Reserve', credit: true },
  { text: (x) => `an Investment Fluctuation Reserve of ${x}, the investments being worth their book value`, account: 'investmentFluctuationReserve', name: 'Investment Fluctuation Reserve', credit: true },
  { text: (x) => `a debit balance of ${x} in Profit and Loss A/c (accumulated loss)`, account: 'profitAndLoss', name: 'Profit and Loss', credit: false },
  { text: (x) => `Advertisement Suspense A/c of ${x} on the assets side`, account: 'advertisementSuspense', name: 'Advertisement Suspense', credit: false },
  { text: (x) => `Deferred Revenue Expenditure of ${x} on the assets side`, account: 'deferredRevenueExpenditure', name: 'Deferred Revenue Expenditure', credit: false },
];

const jeReserves = journalTemplate({
  id: 'adm-je-reserves', topicId: T, conceptId: 'adm-reserves', difficulty: 'easy',
  generate: (rng) => {
    const d = deal(rng, 'old', rng.pick([2, 2, 3]));
    if (!d) return null;
    const b = rng.pick(BALANCES);
    const unit = sum(d.old) * 1000;
    const x = unit * rng.int(Math.ceil(12000 / unit), Math.floor(160000 / unit));
    const fixed = rng.int(0, 3) === 0;
    const own = ownAccount(fixed);
    const parts = d.olds.map((_, i) => of(x, d.oldShares[i]));
    return {
      prompt: `${d.open} ${d.admit} On that date the balance sheet shows ${b.text(inr(x))}. ${capsText(fixed)} Pass the journal entry to deal with it on the admission.`,
      lines: b.credit ? [Dr(b.account, x), ...d.olds.map((n, i) => Cr(own(n), parts[i]))] : [...d.olds.map((n, i) => Dr(own(n), parts[i])), Cr(b.account, x)],
      explanation: [
        b.credit
          ? `It was built up out of profits earned before ${d.nw} came in, so it is given to the old partners in the old ratio ${rs(d.old)}.`
          : `It is a loss of the time before ${d.nw} came in, so the old partners bear it in the old ratio ${rs(d.old)}.`,
        `${d.olds.map((n, i) => `${n} ${inr(x)} x ${fs(d.oldShares[i])} = ${inr(parts[i])}`).join('; ')}.`,
        b.credit ? `${b.name} A/c is debited to close it and the old partners' ${ownName(fixed)} A/cs are credited.` : `The old partners' ${ownName(fixed)} A/cs are debited and ${b.name} A/c is credited to close it.`,
      ],
      distractorAccounts: [own(d.nw), 'revaluation', 'profitAndLossAppropriation'],
      hints: H.reserves,
    };
  },
  verify: (q) => {
    const old = ratiosIn(q.prompt)[0];
    const olds = oldNamesIn(q.prompt);
    const [x] = amountsIn(q.prompt);
    const credit = /Reserve of|credit balance of/.test(q.prompt);
    const own = ownAccount(/fixed capital/.test(q.prompt));
    const partners = sideOf(q, credit ? 'Cr' : 'Dr');
    return totalOf(sideOf(q, credit ? 'Dr' : 'Cr')) === x && partners.size === olds.length && olds.every((n, i) => near(partners.get(own(n)) ?? 0, (x * old[i]) / sum(old)));
  },
});

const reserveShare = numericTemplate({
  id: 'adm-reserve-share', topicId: T, conceptId: 'adm-reserves', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const d = deal(rng, ['old', 'equal', 'stated'], rng.pick([2, 2, 3]));
    if (!d) return null;
    const m = d.olds.length;
    const unit = sum(d.old) * 1000;
    const reserve = unit * rng.int(Math.ceil(40000 / unit), Math.floor(180000 / unit));
    const variant = rng.int(0, 2);
    const other = variant === 0 ? 0 : unit * rng.int(1, Math.max(1, Math.floor(36000 / unit)));
    if (variant === 2 && other >= reserve) return null;
    const net = variant === 2 ? reserve - other : reserve + other;
    const j = rng.int(0, m - 1);
    const who = d.olds[j];
    const also = variant === 1 ? ` and a credit balance of ${inr(other)} in Profit and Loss A/c` : variant === 2 ? ` and a debit balance of ${inr(other)} in Profit and Loss A/c` : '';
    const answer = money(of(net, d.oldShares[j]), [
      [of(net, d.news[j]), 'Shared in the new ratio. These balances were built up before the admission, so they belong to the old partners in the old ratio.'],
      [net / m, 'Shared equally among the old partners instead of in the old ratio.'],
      [variant === 1 ? of(reserve, d.oldShares[j]) : 0, 'Left out the credit balance of Profit and Loss A/c. Undistributed profit also belongs to the old partners.'],
      [variant === 2 ? of(reserve, d.oldShares[j]) : 0, 'Ignored the debit balance of Profit and Loss A/c. The old partners must bear this accumulated loss.'],
      [variant === 2 ? of(reserve + other, d.oldShares[j]) : 0, 'Added the debit balance of Profit and Loss A/c. It is an accumulated loss, so it is deducted.'],
      [net, `Gave the whole amount, not ${who}'s share of it.`],
    ]);
    return answer && {
      prompt: `${d.open} ${d.admit} ${d.how} On that date the balance sheet shows a General Reserve of ${inr(reserve)}${also}. The capital accounts are fluctuating. What is the net amount credited to ${who}'s Capital A/c for ${variant === 0 ? 'this reserve' : 'these balances'}?`,
      ...answer,
      explanation: [
        variant === 0
          ? `The reserve belongs to the old partners in the old ratio ${rs(d.old)}.`
          : variant === 1
            ? `Reserve ${inr(reserve)} + undistributed profit ${inr(other)} = ${inr(net)}, which belongs to the old partners in the old ratio ${rs(d.old)}.`
            : `Reserve ${inr(reserve)} - accumulated loss ${inr(other)} = ${inr(net)}, shared by the old partners in the old ratio ${rs(d.old)}.`,
        `${who}'s share = ${inr(net)} x ${fs(d.oldShares[j])} = ${inr(of(net, d.oldShares[j]))}.`,
      ],
      hints: H.reserves,
    };
  },
  verify: (q: NumericQuestion) => {
    const old = ratiosIn(q.prompt)[0];
    const j = oldNamesIn(q.prompt).indexOf(/credited to (\w+)'s Capital/.exec(q.prompt)?.[1] ?? '');
    const [reserve, other = 0] = amountsIn(q.prompt);
    const net = /debit balance/.test(q.prompt) ? reserve - other : reserve + other;
    return j >= 0 && near(q.answer / 100, (net * old[j]) / sum(old));
  },
});

const reserveClaim = numericTemplate({
  id: 'adm-reserve-claim', topicId: T, conceptId: 'adm-reserves', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const d = deal(rng, ['old', 'equal', 'stated']);
    if (!d) return null;
    const unit = sum(d.old) * 1000;
    const u = (lo: number, hi: number): number => {
      const first = Math.max(1, Math.ceil((lo * 1000) / unit));
      return unit * rng.int(first, Math.max(first, Math.floor((hi * 1000) / unit)));
    };
    const j = rng.int(0, 1);
    const who = d.olds[j];
    const share = d.oldShares[j];
    const base = `${d.open} ${d.admit} ${d.how} The capital accounts are fluctuating.`;
    const whyNew = 'Used the new ratio. A reserve built up before the admission, and a loss of that time, belong to the old partners in the old ratio.';
    const variant = rng.int(0, 3);
    const small = u(10, 45);
    const big = small + u(8, 50);
    if (variant === 0 || variant === 2) {
      const surplus = variant === 0;
      const reserve = surplus ? big : small;
      const claim = surplus ? small : big;
      const told = `On that date the balance sheet shows a Workmen Compensation Reserve of ${inr(reserve)}, and a claim of ${inr(claim)} for workmen's compensation is to be provided for.`;
      const diff = Math.abs(reserve - claim);
      if (surplus) {
        const answer = money(of(diff, share), [
          [of(reserve, share), 'Shared the whole reserve and ignored the claim, which must first be met out of it.'],
          [of(claim, share), 'Shared the amount of the claim instead of what is left of the reserve after the claim.'],
          [of(diff, d.news[j]), whyNew],
          [diff, `Gave the whole surplus, not ${who}'s share of it.`],
        ]);
        return answer && {
          prompt: `${base} ${told} How much of this reserve is credited to ${who}'s Capital A/c?`,
          ...answer,
          explanation: [
            `The claim of ${inr(claim)} is first provided out of the reserve: Workmen Compensation Claim ${inr(claim)}.`,
            `Surplus reserve = ${inr(reserve)} - ${inr(claim)} = ${inr(diff)}, which goes to the old partners in the old ratio ${rs(d.old)}.`,
            `${who}'s share = ${inr(diff)} x ${fs(share)} = ${inr(of(diff, share))}.`,
          ],
          hints: ['A reserve kept for a purpose is used for that purpose first.', 'Only the reserve left after the claim is shared, in the old ratio.'],
        };
      }
      const answer = money(of(diff, share), [
        [of(claim, share), 'Charged the whole claim to the partners and ignored the reserve, which already covers part of it.'],
        [of(reserve, share), 'Shared the reserve among the partners, although the claim uses all of it up.'],
        [of(diff, d.news[j]), whyNew],
        [diff, `Gave the whole shortfall, not ${who}'s share of it.`],
      ]);
      return answer && {
        prompt: `${base} ${told} By how much is ${who}'s Capital A/c debited, through Revaluation A/c, on account of this claim?`,
        ...answer,
        explanation: [
          `The reserve of ${inr(reserve)} meets part of the claim of ${inr(claim)}; nothing of the reserve is left to share.`,
          `Shortfall = ${inr(claim)} - ${inr(reserve)} = ${inr(diff)}, a loss debited to Revaluation A/c and borne by the old partners in the old ratio ${rs(d.old)}.`,
          `${who}'s share = ${inr(diff)} x ${fs(share)} = ${inr(of(diff, share))}.`,
        ],
        hints: ['A reserve kept for a purpose is used for that purpose first.', 'A claim above the reserve is a loss on revaluation for the part not covered.'],
      };
    }
    const surplus = variant === 1;
    const reserve = surplus ? big : small;
    const fall = surplus ? small : big;
    const book = rng.step(Math.ceil((fall * 2) / 10000) * 10000 + 50000, 600000, 10000);
    const told = `On that date the balance sheet shows investments at ${inr(book)} and an Investment Fluctuation Reserve of ${inr(reserve)}; the market value of the investments is ${inr(book - fall)}.`;
    const diff = Math.abs(reserve - fall);
    if (surplus) {
      const answer = money(of(diff, share), [
        [of(reserve, share), 'Shared the whole reserve without first meeting the fall in the value of the investments out of it.'],
        [of(fall, share), 'Shared the fall in the value of the investments instead of what is left of the reserve after it.'],
        [of(diff, d.news[j]), whyNew],
        [diff, `Gave the whole surplus, not ${who}'s share of it.`],
      ]);
      return answer && {
        prompt: `${base} ${told} How much of this reserve is credited to ${who}'s Capital A/c?`,
        ...answer,
        explanation: [
          `Fall in the value of investments = ${inr(book)} - ${inr(book - fall)} = ${inr(fall)}, met out of the reserve.`,
          `Surplus reserve = ${inr(reserve)} - ${inr(fall)} = ${inr(diff)}, which goes to the old partners in the old ratio ${rs(d.old)}.`,
          `${who}'s share = ${inr(diff)} x ${fs(share)} = ${inr(of(diff, share))}.`,
        ],
        hints: ['The reserve is there to absorb a fall in the value of investments.', 'Only the reserve left after the fall is shared, in the old ratio.'],
      };
    }
    const answer = money(of(diff, share), [
      [of(fall, share), 'Charged the whole fall in value to the partners and ignored the reserve, which absorbs part of it.'],
      [of(reserve, share), 'Shared the reserve among the partners, although the fall in value uses all of it up.'],
      [of(diff, d.news[j]), whyNew],
      [diff, `Gave the whole shortfall, not ${who}'s share of it.`],
    ]);
    return answer && {
      prompt: `${base} ${told} By how much is ${who}'s Capital A/c debited, through Revaluation A/c, for the fall in the value of the investments?`,
      ...answer,
      explanation: [
        `Fall in the value of investments = ${inr(book)} - ${inr(book - fall)} = ${inr(fall)}; the reserve of ${inr(reserve)} absorbs part of it and nothing of the reserve is left to share.`,
        `Fall not covered = ${inr(fall)} - ${inr(reserve)} = ${inr(diff)}, a loss debited to Revaluation A/c and borne by the old partners in the old ratio ${rs(d.old)}.`,
        `${who}'s share = ${inr(diff)} x ${fs(share)} = ${inr(of(diff, share))}.`,
      ],
      hints: ['The reserve is there to absorb a fall in the value of investments.', 'A fall above the reserve is a loss on revaluation for the part not covered.'],
    };
  },
  verify: (q: NumericQuestion) => {
    const old = ratiosIn(q.prompt)[0];
    const j = oldNamesIn(q.prompt).indexOf(/ (\w+)'s Capital A\/c/.exec(q.prompt)?.[1] ?? '');
    const amounts = amountsIn(q.prompt);
    if (j < 0) return false;
    const [reserve, against] = /Workmen/.test(q.prompt) ? [amounts[0], amounts[1]] : [amounts[1], amounts[0] - amounts[2]];
    const credited = /credited to/.test(q.prompt);
    return credited === reserve > against && near(q.answer / 100, (Math.abs(reserve - against) * old[j]) / sum(old));
  },
});

const distributionRule = mcqTemplate({
  id: 'adm-distribution-rule', topicId: T, conceptId: 'adm-reserves', difficulty: 'easy',
  generate: (rng) => {
    const d = dealWhere(rng, 'stated', (x) => !x.asParts && x.sac !== null && !sameTerms(x.old, [1, 1]) && !sameTerms(x.split!, x.old));
    if (!d) return null;
    const [a, b] = d.olds;
    const x = inr(rng.step(20000, 150000, 5000));
    const inOld = `${a} and ${b}, in ${rs(d.old)}`;
    const inSac = `${a} and ${b}, in ${rs(d.split!)}`;
    const inNew = `${list(d.names)}, in ${rs(d.newRatio)}`;
    const equally = `${a} and ${b}, equally`;
    const allEqually = `${list(d.names)}, equally`;
    const base = `${d.open} ${d.admit} ${d.how}`;
    const item = rng.int(0, 5);
    if (item === 4) {
      return choice(
        `${base} ${d.nw} brings ${x} in cash as premium for goodwill. Who is credited with it, and in what ratio?`,
        inSac,
        [
          [inOld, 'Used the old ratio. The premium pays the old partners for the share they give up, so it follows the sacrificing ratio.'],
          [inNew, 'Used the new ratio, which hands the new partner back a part of the premium.'],
          [equally, 'Split the premium equally, although the old partners do not give up equal shares.'],
          [allEqually, 'Gave every partner an equal part, the new partner included.'],
        ],
        `The premium for goodwill compensates the partners who sacrifice, in the sacrificing ratio. ${sacStep(d)}`,
        H.premium,
      );
    }
    const [told, ask, what, why] = [
      [`On that date the balance sheet shows a General Reserve of ${x}.`, 'Who is credited with it, and in what ratio?', 'A reserve', 'it was built up out of profits earned before the admission'],
      [`The revaluation of assets and liabilities on the admission shows a profit of ${x}.`, 'Who is credited with it, and in what ratio?', 'A profit on revaluation', 'the change in values happened before the admission'],
      [`The revaluation of assets and liabilities on the admission shows a loss of ${x}.`, 'Who bears it, and in what ratio?', 'A loss on revaluation', 'the change in values happened before the admission'],
      [`On that date the balance sheet shows a debit balance of ${x} in Profit and Loss A/c.`, 'Who bears it, and in what ratio?', 'An accumulated loss', 'it was suffered before the admission'],
      ['', '', '', ''],
      [`Goodwill appears in the books of the firm at ${x} and is to be written off.`, 'Who bears it, and in what ratio?', 'Goodwill already in the books', 'it belongs to the time before the admission'],
    ][item];
    return choice(
      `${base} ${told} ${ask}`,
      inOld,
      [
        [inSac, 'Used the sacrificing ratio. That ratio is only for the premium for goodwill the new partner brings.'],
        [inNew, 'Used the new ratio, which brings the new partner into something that belongs to the time before the admission.'],
        [equally, 'Split it equally. The old partners share it as they shared profits, in the old ratio.'],
        [allEqually, 'Gave every partner an equal part, the new partner included.'],
      ],
      `${what} belongs to the old partners in their old ratio, because ${why}. So it goes to ${a} and ${b} in ${rs(d.old)}.`,
      H.reserves,
    );
  },
  verify: (q) => {
    const d = readDeal(q.prompt);
    const terms = ratiosIn(optionText(q))[0];
    if (!d || !terms || terms.length !== 2) return false;
    return /premium for goodwill/.test(q.prompt) ? sameRatio(terms, d.given) : sameRatio(terms, d.old);
  },
});

// ===============================================================================================================
// ADJUSTMENT OF CAPITALS
// ===============================================================================================================

const totalCapital = numericTemplate({
  id: 'adm-total-capital', topicId: T, conceptId: 'adm-capitals', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const d = deal(rng, 'old');
    if (!d) return null;
    const [k, n] = d.share;
    // The total is drawn first, so that a small share does not make an outsized firm.
    const total = n * n * 1000 * rng.int(Math.ceil(400 / (n * n)), Math.max(Math.ceil(400 / (n * n)) + 2, Math.floor(2000 / (n * n))));
    const capital = (total * k) / n;
    const base = `${d.open} ${d.admit} ${d.nw} brings ${inr(capital)} as capital, and the capital of the new firm is to be fixed on the basis of ${d.nw}'s capital.`;
    if (rng.int(0, 2) > 0) {
      const answer = money(total, [
        [total - capital, `Gave the combined capital of the old partners and left out ${d.nw}'s own capital.`],
        [of(capital, d.share), `Took ${fs(d.share)} of ${d.nw}'s capital. That capital is itself ${fs(d.share)} of the total, so it has to be scaled up.`],
        [capital * n, 'Multiplied by the denominator of the share but did not divide by its numerator.'],
      ]);
      return answer && {
        prompt: `${base} What should the total capital of the new firm be?`,
        ...answer,
        explanation: [`${inr(capital)} stands for ${fs(d.share)} of the firm.`, `Total capital = ${inr(capital)} x ${n}/${k} = ${inr(total)}.`],
        hints: H.capitals,
      };
    }
    const answer = money(total - capital, [
      [total, `Gave the total capital of the new firm, which includes ${d.nw}'s own capital.`],
      [of(capital, minus(ONE, d.share)), `Took the old partners' ${fs(minus(ONE, d.share))} of ${d.nw}'s capital instead of scaling that capital up to the whole firm first.`],
      [of(capital, d.share), `Took ${fs(d.share)} of ${d.nw}'s capital.`],
    ]);
    return answer && {
      prompt: `${base} What should the combined capital of ${list(d.olds)} be?`,
      ...answer,
      explanation: [
        `${inr(capital)} stands for ${fs(d.share)} of the firm, so the total capital = ${inr(capital)} x ${n}/${k} = ${inr(total)}.`,
        `Combined capital of ${list(d.olds)} = ${inr(total)} - ${inr(capital)} = ${inr(total - capital)}.`,
      ],
      hints: H.capitals,
    };
  },
  verify: (q: NumericQuestion) => {
    const share = shareIn(q.prompt);
    const [capital] = amountsIn(q.prompt);
    if (!share) return false;
    const s = share[0] / share[1];
    return near(q.answer / 100, /total capital of the new firm/.test(q.prompt) ? capital / s : (capital / s) * (1 - s));
  },
});

const newPartnerCapital = numericTemplate({
  id: 'adm-new-partner-capital', topicId: T, conceptId: 'adm-capitals', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const d = deal(rng, 'old');
    if (!d) return null;
    const [k, n] = d.share;
    const unit = (n - k) * n * 1000;
    const combined = unit * rng.int(Math.ceil(300000 / unit), Math.max(Math.ceil(300000 / unit) + 2, Math.floor(1200000 / unit)));
    const [capA, capB] = splitCapital(rng, combined);
    const total = (combined * n) / (n - k);
    const answer = money(total - combined, [
      [of(combined, d.share), `Took ${fs(d.share)} of the old partners' capital. Their capital stands for only ${fs(minus(ONE, d.share))} of the new firm, so the total has to be found first.`],
      [total, `Gave the total capital of the new firm, not ${d.nw}'s part of it.`],
      [combined, 'Gave the combined capital of the old partners.'],
      [of(capA, [k, n - k]), `Used ${d.olds[0]}'s capital alone as the base instead of the combined capital of both old partners.`],
    ]);
    return answer && {
      prompt: `${d.open} After revaluation and all other adjustments their capitals stand at ${inr(capA)} and ${inr(capB)}. ${d.admit} ${d.nw} is to bring capital in proportion to this share of profit, taking the combined adjusted capital of the old partners as the base. How much capital must ${d.nw} bring?`,
      ...answer,
      explanation: [
        `Combined capital of the old partners = ${inr(capA)} + ${inr(capB)} = ${inr(combined)}, which stands for 1 - ${fs(d.share)} = ${fs(minus(ONE, d.share))} of the new firm.`,
        `Total capital of the new firm = ${inr(combined)} x ${n}/${n - k} = ${inr(total)}.`,
        `${d.nw}'s capital = ${inr(total)} x ${fs(d.share)} = ${inr(total - combined)}.`,
      ],
      hints: ['What share of the new firm do the old partners hold between them?', "Total capital = old partners' capital x reciprocal of their combined share; the new partner brings the new partner's share of that total."],
    };
  },
  verify: (q: NumericQuestion) => {
    const share = shareIn(q.prompt);
    const [capA, capB] = amountsIn(q.prompt);
    if (!share) return false;
    return near(q.answer / 100, ((capA + capB) * share[0]) / (share[1] - share[0]));
  },
});

/** The capital of the new partner, of which every old partner's capital in the new and in the old ratio is in whole rupees. */
const baseCapital = (rng: Rng, d: Deal): number | null => amountFor(rng, 80000, 480000, [...d.news.map((s) => over(s, d.share)), ...d.oldShares.map((s) => over(s, d.share))]);
const requiredSteps = (d: Deal, capital: number): string[] => [
  givesSteps(d)[0],
  ...newShareSteps(d),
  `${d.nw}'s ${inr(capital)} stands for ${fs(d.share)} of the firm, so the total capital = ${inr(capital)} x ${d.share[1]}/${d.share[0]} = ${inr(of(capital, over(ONE, d.share)))}.`,
];

const oldPartnerCapital = numericTemplate({
  id: 'adm-old-partner-capital', topicId: T, conceptId: 'adm-capitals', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const d = deal(rng, ['old', 'equal', 'stated', 'stated']);
    if (!d) return null;
    const capital = baseCapital(rng, d);
    if (capital === null) return null;
    const total = of(capital, over(ONE, d.share));
    const j = rng.int(0, 1);
    const who = d.olds[j];
    const answer = money(of(total, d.news[j]), [
      [of(total, d.oldShares[j]), `Applied ${who}'s old share to the total capital. The capitals are to follow the new ratio.`],
      [total, `Gave the total capital of the new firm, not ${who}'s part of it.`],
      [of(capital, d.news[j]), `Took ${who}'s share of ${d.nw}'s capital alone, instead of the total capital of the firm.`],
      [of(total, d.news[1 - j]), `Gave the capital ${d.olds[1 - j]} should have.`],
    ]);
    return answer && {
      prompt: `${d.open} ${d.admit} ${d.how} ${d.nw} brings ${inr(capital)} as capital. The capitals of ${list(d.olds)} are to be adjusted in the new profit-sharing ratio on the basis of ${d.nw}'s capital. What should ${who}'s capital be after the adjustment?`,
      ...answer,
      explanation: [...requiredSteps(d, capital), `${who}'s capital = ${inr(total)} x ${fs(d.news[j])} = ${inr(of(total, d.news[j]))}.`],
      hints: H.capitals,
    };
  },
  verify: (q: NumericQuestion) => {
    const d = readDeal(q.prompt);
    const j = d ? d.olds.indexOf(/What should (\w+)'s capital/.exec(q.prompt)?.[1] ?? '') : -1;
    return !!d && j >= 0 && near(q.answer / 100, (amountsIn(q.prompt)[0] / d.share) * (d.shares[j] - d.given[j]));
  },
});

/** "Asha brings in ₹20,000", "Asha withdraws ₹20,000"; null when nothing moves or the figure is not in whole rupees. */
const moveText = (name: string, shortfall: number): string | null =>
  !Number.isInteger(shortfall) || shortfall === 0 ? null : shortfall > 0 ? `${name} brings in ${inr(shortfall)}` : `${name} withdraws ${inr(-shortfall)}`;

const capitalAdjustCash = mcqTemplate({
  id: 'adm-capital-adjust-cash', topicId: T, conceptId: 'adm-capitals', difficulty: 'complex',
  generate: (rng) => {
    const d = deal(rng, ['old', 'equal', 'stated', 'stated']);
    if (!d) return null;
    const capital = baseCapital(rng, d);
    if (capital === null) return null;
    const total = of(capital, over(ONE, d.share));
    const required = d.olds.map((_, i) => of(total, d.news[i]));
    const gaps = d.olds.map(() => rng.step(5000, 60000, 5000) * (rng.int(0, 1) === 0 ? 1 : -1));
    const existing = required.map((r, i) => r - gaps[i]);
    if (existing.some((x) => x < 50000)) return null;
    const j = rng.int(0, 1);
    const who = d.olds[j];
    const correct = moveText(who, gaps[j]);
    if (correct === null) return null;
    return choice(
      `${d.open} ${d.admit} ${d.how} ${d.nw} brings ${inr(capital)} as capital. After all adjustments the capitals of ${d.olds[0]} and ${d.olds[1]} stand at ${inr(existing[0])} and ${inr(existing[1])}. The capitals of the old partners are to be adjusted in the new profit-sharing ratio on the basis of ${d.nw}'s capital, any excess being withdrawn and any shortfall brought in, in cash. What does ${who} have to do?`,
      correct,
      [
        [moveText(who, -gaps[j]), 'Read the difference the wrong way round: a capital below the figure required is a shortfall to be brought in, one above it an excess to be withdrawn.'],
        [moveText(who, of(total, d.oldShares[j]) - existing[j]), `Applied ${who}'s old share to the total capital. The capitals are to follow the new ratio.`],
        [moveText(who, of(sum(existing) + capital, d.news[j]) - existing[j]), `Shared out the capital already in the books in the new ratio. The base is ${d.nw}'s capital, which fixes the total capital of the firm.`],
        [moveText(who, gaps[1 - j]), `Worked out ${d.olds[1 - j]}'s adjustment.`],
        [`${who} neither brings in nor withdraws anything`, 'Took the capital in the books as already in the new ratio, without working out the capital required.'],
      ],
      `${requiredSteps(d, capital).join(' ')} ${who}'s capital should be ${inr(total)} x ${fs(d.news[j])} = ${inr(required[j])}; it stands at ${inr(existing[j])}, so ${correct}.`,
      ['Find the total capital of the new firm from the new partner\'s capital, then each old partner\'s capital in the new ratio.', 'Capital required less capital in the books: a shortfall is brought in, an excess is withdrawn.'],
    );
  },
  verify: (q) => {
    const d = readDeal(q.prompt);
    const m = /^(\w+) (brings in|withdraws) ₹([\d,]+)$/.exec(optionText(q));
    if (!d || !m) return false;
    const j = d.olds.indexOf(m[1]);
    const [capital, capA, capB] = amountsIn(q.prompt);
    const shortfall = (capital / d.share) * (d.shares[j] - d.given[j]) - [capA, capB][j];
    return j >= 0 && near(shortfall, (m[2] === 'brings in' ? 1 : -1) * Number(m[3].replace(/,/g, '')));
  },
});

const jeCapitalAdjust = journalTemplate({
  id: 'adm-je-capital-adjust', topicId: T, conceptId: 'adm-capitals', difficulty: 'complex', computed: true,
  generate: (rng) => {
    const d = deal(rng, ['old', 'equal', 'stated', 'stated']);
    if (!d) return null;
    const capital = baseCapital(rng, d);
    if (capital === null) return null;
    const total = of(capital, over(ONE, d.share));
    const required = d.olds.map((_, i) => of(total, d.news[i]));
    const short = rng.int(0, 1) === 0;
    const gaps = d.olds.map(() => rng.step(5000, 60000, 5000));
    const existing = required.map((r, i) => (short ? r - gaps[i] : r + gaps[i]));
    if (existing.some((x) => x < 50000)) return null;
    const byCheque = rng.int(0, 2) > 0;
    const caps = d.olds.map(partnerCapital);
    const other = byCheque ? null : d.olds.map(partnerCurrent);
    const lines = byCheque
      ? short
        ? [Dr('bank', sum(gaps)), ...caps.map((c, i) => Cr(c, gaps[i]))]
        : [...caps.map((c, i) => Dr(c, gaps[i])), Cr('bank', sum(gaps))]
      : short
        ? [...other!.map((c, i) => Dr(c, gaps[i])), ...caps.map((c, i) => Cr(c, gaps[i]))]
        : [...caps.map((c, i) => Dr(c, gaps[i])), ...other!.map((c, i) => Cr(c, gaps[i]))];
    return {
      prompt: `${d.open} ${d.admit} ${d.how} ${d.nw} brings ${inr(capital)} as capital. After all adjustments the capitals of ${d.olds[0]} and ${d.olds[1]} stand at ${inr(existing[0])} and ${inr(existing[1])}. The capitals of the old partners are to be adjusted in the new profit-sharing ratio on the basis of ${d.nw}'s capital, ${byCheque ? 'any excess being withdrawn and any shortfall brought in by cheque' : "any excess or shortfall being transferred to the partners' current accounts"}. Pass one journal entry for the adjustment.`,
      lines,
      explanation: [
        ...requiredSteps(d, capital),
        `Capital required: ${d.olds.map((n, i) => `${n} ${inr(total)} x ${fs(d.news[i])} = ${inr(required[i])}`).join('; ')}.`,
        `${d.olds.map((n, i) => `${n} has ${inr(existing[i])}, ${short ? 'a shortfall' : 'an excess'} of ${inr(gaps[i])}`).join('; ')}.`,
        byCheque
          ? short
            ? `The shortfalls are brought in: Bank A/c is debited with ${inr(sum(gaps))} and the capital accounts are credited.`
            : `The excesses are withdrawn: the capital accounts are debited and Bank A/c is credited with ${inr(sum(gaps))}.`
          : short
            ? 'The shortfalls are made up from the current accounts: the current accounts are debited and the capital accounts credited.'
            : 'The excesses are moved to the current accounts: the capital accounts are debited and the current accounts credited.',
      ],
      distractorAccounts: [partnerCapital(d.nw), ...(byCheque ? d.olds.map(partnerCurrent) : ['bank']), 'cash'],
      hints: ["Find the total capital of the new firm from the new partner's capital, then each old partner's capital in the new ratio.", 'A shortfall raises the capital account (credit); an excess lowers it (debit). The other side is Bank A/c or the current account.'],
    };
  },
  verify: (q) => {
    const d = readDeal(q.prompt);
    if (!d) return false;
    const [capital, capA, capB] = amountsIn(q.prompt);
    const debits = sideOf(q, 'Dr');
    const credits = sideOf(q, 'Cr');
    return near(totalOf(debits), totalOf(credits)) && d.olds.every((n, i) => {
      const shortfall = (capital / d.share) * (d.shares[i] - d.given[i]) - [capA, capB][i];
      return near((shortfall > 0 ? credits : debits).get(partnerCapital(n)) ?? 0, Math.abs(shortfall));
    });
  },
});

// ===============================================================================================================
// CAPITALS AND BALANCE SHEET OF THE NEW FIRM
// ===============================================================================================================

const bankBalance = numericTemplate({
  id: 'adm-bank-balance', topicId: T, conceptId: 'adm-new-firm', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const d = deal(rng, 'old');
    if (!d) return null;
    const opening0 = rng.step(20000, 200000, 5000);
    const capital = rng.step(100000, 500000, 20000);
    const premium = rng.step(20000, 120000, 10000);
    const base = `${d.open} The firm's bank balance is ${inr(opening0)}. ${d.admit}`;
    const ask = 'What is the bank balance after these transactions?';
    const brings = `${d.nw} brings ${inr(capital)} as capital and ${inr(premium)} as premium for goodwill by cheque.`;
    const hints = ['Which amounts actually pass through the bank account of the firm?', 'Bank balance = opening balance + capital + premium received by the firm - premium withdrawn by the old partners.'];
    const variant = rng.int(0, 3);
    if (variant === 0) {
      const answer = money(opening0 + capital + premium, [
        [opening0 + capital, 'Left out the premium, although it was paid into the bank of the firm and kept there.'],
        [capital + premium, 'Left out the balance the firm already had in the bank.'],
        [opening0 + capital - premium, 'Deducted the premium, although nobody withdrew it.'],
      ]);
      return answer && {
        prompt: `${base} ${brings} The premium is kept in the business. ${ask}`,
        ...answer,
        explanation: [`Bank balance = ${inr(opening0)} + ${inr(capital)} + ${inr(premium)} = ${inr(opening0 + capital + premium)}.`, 'The premium is credited to the old partners but the money stays in the bank.'],
        hints,
      };
    }
    if (variant === 1) {
      const answer = money(opening0 + capital + premium / 2, [
        [opening0 + capital + premium, 'Did not deduct what the old partners withdrew.'],
        [opening0 + capital, 'Deducted the whole premium, though only half of it was withdrawn.'],
        [opening0 + capital - premium / 2, 'Deducted the amount withdrawn but never added the premium that came in.'],
      ]);
      return answer && {
        prompt: `${base} ${brings} ${list(d.olds)} withdraw half of the premium. ${ask}`,
        ...answer,
        explanation: [`Received: ${inr(capital)} + ${inr(premium)} = ${inr(capital + premium)}; withdrawn: half of ${inr(premium)} = ${inr(premium / 2)}.`, `Bank balance = ${inr(opening0)} + ${inr(capital + premium)} - ${inr(premium / 2)} = ${inr(opening0 + capital + premium / 2)}.`],
        hints,
      };
    }
    if (variant === 2) {
      const answer = money(opening0 + capital, [
        [opening0 + capital + premium, 'Did not deduct the premium the old partners withdrew.'],
        [opening0 + capital - premium, 'Deducted the amount withdrawn without first adding the premium that came in.'],
        [capital, 'Left out the balance the firm already had in the bank.'],
      ]);
      return answer && {
        prompt: `${base} ${brings} ${list(d.olds)} withdraw the whole of the premium. ${ask}`,
        ...answer,
        explanation: [`Received: ${inr(capital)} + ${inr(premium)}; withdrawn: ${inr(premium)}.`, `Bank balance = ${inr(opening0)} + ${inr(capital)} + ${inr(premium)} - ${inr(premium)} = ${inr(opening0 + capital)}.`],
        hints,
      };
    }
    const answer = money(opening0 + capital, [
      [opening0 + capital + premium, 'Added a premium that never came into the firm: it was paid privately to the old partners.'],
      [opening0 + capital - premium, 'Deducted the premium as if the firm had paid it out. A private payment does not touch the firm.'],
      [capital, 'Left out the balance the firm already had in the bank.'],
    ]);
    return answer && {
      prompt: `${base} ${d.nw} brings ${inr(capital)} as capital by cheque and pays ${inr(premium)} privately to ${list(d.olds)} as premium for goodwill. ${ask}`,
      ...answer,
      explanation: ['A premium paid privately does not pass through the books of the firm.', `Bank balance = ${inr(opening0)} + ${inr(capital)} = ${inr(opening0 + capital)}.`],
      hints,
    };
  },
  verify: (q: NumericQuestion) => {
    const [opening0, capital, premium] = amountsIn(q.prompt);
    const kept = /privately|whole of the premium/.test(q.prompt) ? 0 : /half of the premium/.test(q.prompt) ? premium / 2 : premium;
    return near(q.answer / 100, opening0 + capital + kept);
  },
});

const capitalAfterAll = numericTemplate({
  id: 'adm-capital-after-all', topicId: T, conceptId: 'adm-new-firm', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const d = deal(rng, ['equal', 'stated', 'stated', 'old']);
    if (!d) return null;
    const unit = sum(d.old) * 1000;
    const caps = [rng.step(200000, 800000, 10000), rng.step(200000, 800000, 10000)];
    const reserve = unit * rng.int(Math.ceil(30000 / unit), Math.floor(150000 / unit));
    const items = revItems(rng, unit, [[1, 1]]);
    const net = netOf(items);
    const capital = rng.step(100000, 500000, 20000);
    const premium = amountFor(rng, 20000, 240000, [...d.parts, ...d.oldShares]);
    if (premium === null || net === 0) return null;
    const j = rng.int(0, 1);
    const who = d.olds[j];
    const old = d.oldShares[j];
    const fromReserve = of(reserve, old);
    const fromReval = of(net, old);
    const fromPremium = of(premium, d.parts[j]);
    const loss = items.find((i) => i.effect < 0)!;
    const answer = money(caps[j] + fromReserve + fromReval + fromPremium, [
      [caps[j] + of(reserve + net, d.news[j]) + fromPremium, 'Shared the reserve and the result of revaluation in the new ratio. Both belong to the old partners in the old ratio.'],
      [caps[j] + fromReserve + fromReval + of(premium, old), 'Shared the premium in the old ratio instead of the sacrificing ratio.'],
      [caps[j] + fromReval + fromPremium, 'Left the General Reserve out. It is distributed to the old partners on the admission.'],
      [caps[j] + fromReserve + of(net - 2 * loss.effect, old) + fromPremium, loss.flipWhy],
      [caps[j] + fromReserve + fromReval, 'Left out the share of the premium for goodwill.'],
      [caps[j] + fromReserve + fromReval + fromPremium + capital, `Added ${d.nw}'s capital, which is credited to ${d.nw}'s own account.`],
    ]);
    return answer && {
      prompt: `${d.open} ${d.admit} ${d.how} The capital accounts are fluctuating. From the details below, find the balance of ${who}'s Capital A/c after all these adjustments.\nCapitals before the admission: ${d.olds[0]} ${inr(caps[0])}; ${d.olds[1]} ${inr(caps[1])}.\nGeneral Reserve: ${inr(reserve)}.\n${items.map((i) => i.text).join('\n')}\n${d.nw} brings ${inr(capital)} as capital and ${inr(premium)} as premium for goodwill in cash; the premium is kept in the business.`,
      ...answer,
      explanation: [
        `General Reserve, old ratio ${rs(d.old)}: ${who} gets ${inr(reserve)} x ${fs(old)} = ${inr(fromReserve)}.`,
        ...revSteps(items),
        `${who}'s share of it, old ratio: ${inr(Math.abs(net))} x ${fs(old)} = ${inr(Math.abs(fromReval))}, ${net > 0 ? 'credited' : 'debited'}.`,
        `${givesSteps(d)[0]} ${sacStep(d)} ${who}'s part of the premium = ${inr(premium)} x ${fs(d.parts[j])} = ${inr(fromPremium)}.`,
        `Balance = ${inr(caps[j])} + ${inr(fromReserve)} ${net > 0 ? '+' : '-'} ${inr(Math.abs(fromReval))} + ${inr(fromPremium)} = ${inr(caps[j] + fromReserve + fromReval + fromPremium)}.`,
      ],
      hints: H.newFirm,
    };
  },
  verify: (q: NumericQuestion) => {
    const lines = q.prompt.split('\n');
    const d = readDeal(lines[0]);
    const j = d ? d.olds.indexOf(/balance of (\w+)'s Capital/.exec(lines[0])?.[1] ?? '') : -1;
    if (!d || j < 0 || lines.length !== 6) return false;
    const before = amountsIn(lines[1])[j];
    const reserve = amountsIn(lines[2])[0];
    const net = readRevLines(lines.slice(3, 5));
    const premium = amountsIn(lines[5])[1];
    return near(q.answer / 100, before + (reserve + net) * d.shares[j] + (premium * d.given[j]) / d.share);
  },
});

const combinedNewCapital = numericTemplate({
  id: 'adm-combined-new-capital', topicId: T, conceptId: 'adm-new-firm', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const d = deal(rng, 'old');
    if (!d) return null;
    const [k, n] = d.share;
    // Each adjustment is a multiple of the old partners' share of the firm in thousands, so that a figure worked
    // without it (a named mistake) is still in whole rupees.
    const part = (lo: number, hi: number): number => (n - k) * 1000 * rng.int(Math.ceil(lo / (n - k)), Math.max(Math.ceil(lo / (n - k)), Math.floor(hi / (n - k))));
    const capA = rng.step(150000, 500000, 10000);
    const reserve = part(20, 120);
    const result = part(10, 60);
    const profit = rng.int(0, 2) > 0;
    const premium = part(20, 100);
    const kept = rng.int(0, 2) > 0;
    const unit = (n - k) * n * 1000;
    const rough = capA + rng.step(150000, 500000, 10000) + reserve + (profit ? result : -result) + (kept ? premium : 0);
    const combined = Math.ceil(rough / unit) * unit;
    const capB = combined - (capA + reserve + (profit ? result : -result) + (kept ? premium : 0));
    const scale: Frac = [k, n - k];
    const answer = money(of(combined, scale), [
      [kept ? of(combined - premium, scale) : of(combined + premium, scale), kept ? "Left out the premium for goodwill. It was credited to the old partners' capitals and the money stayed in the firm." : 'Counted the premium, although the old partners withdrew the whole of it.'],
      [of(combined - reserve, scale), 'Left the General Reserve out. It is credited to the old partners before the new capital is worked out.'],
      [of(combined + (profit ? -2 : 2) * result, scale), profit ? 'Deducted the profit on revaluation instead of adding it.' : 'Added the loss on revaluation instead of deducting it.'],
      [of(capA + capB, scale), 'Used the capitals as they stood before the adjustments.'],
      [of(combined, d.share), `Took ${fs(d.share)} of the old partners' capital. Their capital stands for only ${fs(minus(ONE, d.share))} of the new firm.`],
      [combined, 'Gave the combined adjusted capital of the old partners.'],
    ]);
    return answer && {
      prompt: `${d.open} ${d.admit} ${d.nw} is to bring capital in proportion to this share of profit, taking the combined capital of the old partners after all the adjustments below as the base. The capital accounts are fluctuating. How much capital must ${d.nw} bring?\nCapitals before the adjustments: ${d.olds[0]} ${inr(capA)}; ${d.olds[1]} ${inr(capB)}.\nGeneral Reserve: ${inr(reserve)}.\nRevaluation A/c shows a ${profit ? 'profit' : 'loss'} of ${inr(result)}.\n${d.nw} brings ${inr(premium)} as premium for goodwill in cash, and ${kept ? 'it is kept in the business' : 'the old partners withdraw the whole of it'}.`,
      ...answer,
      explanation: [
        `Combined capital of the old partners = ${inr(capA)} + ${inr(capB)} + reserve ${inr(reserve)} ${profit ? '+' : '-'} revaluation ${inr(result)}${kept ? ` + premium ${inr(premium)}` : ''} = ${inr(combined)}.`,
        kept ? 'The premium is credited to the old partners and stays in the firm, so it is part of their capital.' : 'The premium is credited to the old partners and then withdrawn by them, so it adds nothing to their capital.',
        `This stands for 1 - ${fs(d.share)} = ${fs(minus(ONE, d.share))} of the new firm, so the total capital = ${inr(combined)} x ${n}/${n - k} = ${inr((combined * n) / (n - k))}.`,
        `${d.nw}'s capital = ${inr((combined * n) / (n - k))} x ${fs(d.share)} = ${inr(of(combined, scale))}.`,
      ],
      hints: ["Bring the old partners' capitals up to date first: reserve, revaluation and the premium that stays in the firm.", "Their combined capital stands for their combined share; scale it to the whole firm and take the new partner's share."],
    };
  },
  verify: (q: NumericQuestion) => {
    const lines = q.prompt.split('\n');
    const share = shareIn(lines[0]);
    if (!share || lines.length !== 5) return false;
    const [capA, capB] = amountsIn(lines[1]);
    const result = amountsIn(lines[3])[0] * (/profit/.test(lines[3]) ? 1 : -1);
    const premium = /kept in the business/.test(lines[4]) ? amountsIn(lines[4])[0] : 0;
    const combined = capA + capB + amountsIn(lines[2])[0] + result + premium;
    return near(q.answer / 100, (combined * share[0]) / (share[1] - share[0]));
  },
});

const balanceSheetTotal = numericTemplate({
  id: 'adm-balance-sheet-total', topicId: T, conceptId: 'adm-new-firm', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const d = deal(rng, 'old');
    if (!d) return null;
    const before = rng.step(600000, 2000000, 50000);
    const up = rng.step(20000, 120000, 10000);
    const down = rng.step(5000, 40000, 5000);
    const neutral = rng.step(4000, 30000, 2000);
    const outstanding = rng.int(0, 1) === 0;
    const goodwill = rng.int(0, 2) === 0 ? 0 : rng.step(20000, 80000, 10000);
    const capital = rng.step(100000, 500000, 20000);
    const premium = rng.step(20000, 100000, 10000);
    const withdrawn = rng.int(0, 2) === 0 ? premium / 2 : 0;
    const total = before + up - down - goodwill + capital + premium - withdrawn;
    const answer = money(total, [
      [outstanding ? total + neutral : total - neutral, outstanding
        ? 'Added the outstanding expenses to the total. They raise a liability and reduce the capitals by the same amount, so the total does not change.'
        : 'Deducted the creditors written back. The liability falls and the capitals rise by the same amount, so the total does not change.'],
      [goodwill > 0 ? total + goodwill : 0, 'Left the old goodwill among the assets. Writing it off removes it from the assets and from the capitals.'],
      [total - premium + withdrawn, 'Left the premium for goodwill out altogether. What stays in the firm adds to the bank balance and to the capitals.'],
      [withdrawn > 0 ? total + withdrawn : 0, 'Did not deduct the part of the premium the old partners withdrew.'],
      [total - 2 * up + 2 * down, 'Deducted the rise in the building and added the fall in stock.'],
      [total - capital, `Left out the capital ${d.nw} brought in.`],
    ]);
    const lines = [
      `Building is appreciated by ${inr(up)}.`,
      `Stock is reduced by ${inr(down)}.`,
      outstanding ? `Outstanding expenses of ${inr(neutral)} are recorded.` : `Creditors of ${inr(neutral)} are written back as no longer payable.`,
      ...(goodwill > 0 ? [`Goodwill of ${inr(goodwill)} appearing in the books is written off.`] : []),
      `${d.nw} brings ${inr(capital)} as capital and ${inr(premium)} as premium for goodwill by cheque${withdrawn > 0 ? '; the old partners withdraw half of the premium' : '; the premium is kept in the business'}.`,
    ];
    return answer && {
      prompt: `${d.open} Their balance sheet totals ${inr(before)} on each side. ${d.admit} After the adjustments below, what is the total of each side of the balance sheet of the new firm?\n${lettered(lines)}`,
      ...answer,
      explanation: [
        `Building + ${inr(up)} and stock - ${inr(down)} change the assets, and the capitals with them.`,
        outstanding
          ? `Outstanding expenses of ${inr(neutral)} add a liability and take the same amount off the capitals: no change in the total.`
          : `Creditors written back of ${inr(neutral)} reduce a liability and add the same amount to the capitals: no change in the total.`,
        ...(goodwill > 0 ? [`Goodwill written off takes ${inr(goodwill)} off the assets and off the capitals.`] : []),
        `Cash brought in adds ${inr(capital)} + ${inr(premium)}${withdrawn > 0 ? `, and the withdrawal takes off ${inr(withdrawn)}` : ''}.`,
        `Total = ${inr(before)} + ${inr(up)} - ${inr(down)}${goodwill > 0 ? ` - ${inr(goodwill)}` : ''} + ${inr(capital)} + ${inr(premium)}${withdrawn > 0 ? ` - ${inr(withdrawn)}` : ''} = ${inr(total)}.`,
      ],
      hints: ['For each adjustment ask: does the total of the assets change, or only where a figure sits on the liabilities side?', 'A change between a liability and the capitals leaves the total as it was; a change in an asset or in cash changes it.'],
    };
  },
  verify: (q: NumericQuestion) => {
    const [first, ...lines] = q.prompt.split('\n');
    let total = amountsIn(first)[0];
    for (const line of lines) {
      const [x, y] = amountsIn(line);
      if (/appreciated by/.test(line)) total += x;
      else if (/Stock is reduced|written off/.test(line)) total -= x;
      else if (/as capital/.test(line)) total += x + (/withdraw half/.test(line) ? y / 2 : y);
      else if (!/Outstanding expenses|written back/.test(line)) return false;
    }
    return near(q.answer / 100, total);
  },
});

// ===============================================================================================================
// SETS OF ENTRIES AND FORMATS
//
// Conventions of the long questions, each stated in the question that relies on it:
//  - the items of a set are lettered, not dated: every entry is passed on the day of the admission;
//  - capitals are fluctuating unless the question says they are fixed, and then every adjustment but the capital
//    brought in passes through the current accounts;
//  - bad debts are written off against a provision for doubtful debts where the question says one exists, and
//    through Revaluation A/c where it says there is none;
//  - a Workmen Compensation Reserve first meets the claim against it and an Investment Fluctuation Reserve the fall in
//    the investments: what is left goes to the old partners in the old ratio, and a shortfall is a loss on revaluation;
//  - the capitals of the old partners are adjusted on the basis of the new partner's capital only where the question
//    says so, and it says whether the difference moves in cash or to current accounts opened for the purpose (the
//    capitals are fluctuating, so the question says that the current accounts are opened).
// ===============================================================================================================

/** A few tries at a scenario that may not come out tidy, so that a seed is seldom turned away. */
function attempt<X>(tries: number, make: () => X | null): X | null {
  for (let i = 0; i < tries; i++) {
    const made = make();
    if (made !== null) return made;
  }
  return null;
}

/** The terms of a sacrificing ratio add up to 40 at most; where one partner alone sacrifices there is no ratio to keep tidy. */
export const tidySac = (d: Deal): boolean => (d.sac === null ? d.kind === 'one' : sum(d.sac) <= 40);

/** The range a premium stated outright is drawn from: the new partner's share of a goodwill of ₹80,000 to ₹7,20,000 for the firm. */
function premiumRange(d: Deal): [number, number] {
  const lo = Math.max(10000, Math.ceil(of(80000, d.share) / 5000) * 5000);
  return [lo, Math.max(lo * 3, Math.floor(of(720000, d.share) / 5000) * 5000)];
}

/** One item of a set before it is lettered. */
interface SetItem {
  text: string;
  lines: JournalLine[];
  explanation: string[];
}
/** The items of a set, lettered (a), (b), ... in the order given. */
const letteredItems = (items: readonly SetItem[]): SetTransaction[] => items.map((item, k) => ({ label: `(${'abcdefgh'[k]})`, ...item }));

/** What a set says about the capitals: `capitals are fixed` is what `verify` looks for. */
export const setCaps = (fixed: boolean): string =>
  fixed
    ? "The capitals are fixed: capital brought in is credited to the capital account, and every other adjustment is passed through the partners' current accounts."
    : 'The capital accounts are fluctuating.';
export const isFixed = (text: string): boolean => /capitals are fixed/.test(text);

/** How money moves in a set: by cheque through Bank A/c, or in cash. */
const MODES = [
  { id: 'bank', by: 'by cheque', name: 'Bank' },
  { id: 'cash', by: 'in cash', name: 'Cash' },
] as const;

/** The opening line of a set: everything of its prompt after the task. */
const openingOf = (q: JournalSetQuestion): string => q.prompt.split('\n').slice(1).join(' ');
/** What the entries of a set leave in each account, in rupees: above zero for a debit balance. */
function booksOf(entries: readonly JournalLine[][]): (accountId: string) => number {
  const ledger = post([...entries]);
  return (accountId) => (ledger.get(accountId) ?? 0) / 100;
}
const rupeesIn = (m: RegExpExecArray | null): number => (m ? Number(m[1].replace(/,/g, '')) : 0);
/** The old partners who give up a share, in order. */
export const giversOf = (d: Deal): string[] => d.olds.filter((_, i) => isPos(d.given[i]));
/** "Asha ₹30,000; Bhavna ₹20,000" for the partners whose amount is above zero. */
export const eachGets = (names: readonly string[], amounts: readonly number[]): string =>
  names.flatMap((n, i) => (amounts[i] > 0 ? [`${n} ${inr(amounts[i])}`] : [])).join('; ');

// ---------------------------------------------------------------------------------------------------------------
// Set 1 (easy): capital and premium for goodwill brought in, the premium shared in the sacrificing ratio and, in some
// seeds, half or the whole of it withdrawn.
// ---------------------------------------------------------------------------------------------------------------

const setPremiumCash = journalSetTemplate({
  id: 'adm-set-premium-cash', topicId: T, conceptId: 'adm-sets', difficulty: 'easy',
  generate: (rng) => {
    const fixed = rng.int(0, 3) === 0;
    const own = ownAccount(fixed);
    const mode = rng.pick([MODES[0], MODES[0], MODES[1]]);
    // Nothing withdrawn, half withdrawn, or the whole.
    const part: Frac = rng.pick([ZERO, ZERO, fr(1, 2), fr(1, 2), ONE]);
    const withdrawn = isPos(part);
    const valued = rng.int(0, 2) > 0;
    // The capital and the premium are one receipt, or two: with nothing withdrawn they are two, so that the set has three entries.
    const together = withdrawn && rng.int(0, 1) === 0;
    const made = attempt(6, () => {
      const d = dealWhere(rng, ['old', 'equal', 'stated', 'stated', 'one', 'surrender'], tidySac, rng.pick([2, 2, 2, 3]));
      if (!d) return null;
      const whole = withdrawn ? part : ONE;
      // The goodwill of the firm, or the premium itself, of which every credit and every withdrawal is in whole rupees.
      const base = valued ? amountFor(rng, 80000, 720000, d.given.map((g) => times(g, whole))) : amountFor(rng, ...premiumRange(d), d.parts.map((p) => times(p, whole)));
      return base === null ? null : { d, base };
    });
    if (!made) return null;
    const { d, base } = made;
    const premium = valued ? of(base, d.share) : base;
    const credits = d.olds.map((_, i) => (valued ? of(base, d.given[i]) : of(base, d.parts[i])));
    const out = credits.map((c) => of(c, part));
    if (premium < 10000 || ![premium, ...credits, ...out].every(Number.isInteger)) return null;
    // A capital of at least twice the premium, so that the two figures look like what they are.
    const capital = Math.max(rng.step(100000, 600000, 20000), Math.ceil((premium * 2) / 20000) * 20000);
    const givers = giversOf(d);
    const one = givers.length === 1;
    const what = valued ? `${d.nw}'s share of the goodwill of the firm` : inr(premium);
    const premiumSteps = valued
      ? [...(d.kind === 'surrender' ? givesSteps(d) : []), `${d.nw}'s share of goodwill = ${inr(base)} x ${fs(d.share)} = ${inr(premium)}.`]
      : [];
    const receipts: SetItem[] = together
      ? [
          {
            text: `${d.nw} brings ${inr(capital)} as capital and ${what} as premium for goodwill, ${mode.by}.`,
            lines: [Dr(mode.id, capital + premium), Cr(partnerCapital(d.nw), capital), Cr('premiumForGoodwill', premium)],
            explanation: [
              ...premiumSteps,
              `${inr(capital)} + ${inr(premium)} = ${inr(capital + premium)} comes in: ${mode.name} A/c is debited.`,
              `Only the capital is ${d.nw}'s: ${d.nw}'s Capital A/c is credited with ${inr(capital)}.`,
              `The premium of ${inr(premium)} is credited to Premium for Goodwill A/c until it is given to those who sacrifice.`,
            ],
          },
        ]
      : [
          {
            text: `${d.nw} brings ${inr(capital)} as capital, ${mode.by}.`,
            lines: [Dr(mode.id, capital), Cr(partnerCapital(d.nw), capital)],
            explanation: [`${mode.name} A/c is debited with the ${inr(capital)} received.`, `It is ${d.nw}'s capital: ${d.nw}'s Capital A/c is credited.`],
          },
          {
            text: `${d.nw} brings ${what} as premium for goodwill, ${mode.by}.`,
            lines: [Dr(mode.id, premium), Cr('premiumForGoodwill', premium)],
            explanation: [
              ...premiumSteps,
              `${mode.name} A/c is debited with the ${inr(premium)} received.`,
              `A premium is not ${d.nw}'s capital: it is credited to Premium for Goodwill A/c until it is given to those who sacrifice.`,
            ],
          },
        ];
    const shared: SetItem = {
      text: `The premium for goodwill is credited to the old ${one ? 'partner who gives' : 'partners who give'} up a share of profit.`,
      lines: entry(Dr('premiumForGoodwill', premium), ...d.olds.map((n, i) => Cr(own(n), credits[i]))),
      explanation: [
        givesSteps(d)[0],
        sacStep(d),
        `Premium for Goodwill A/c is debited with ${inr(premium)} to close it.`,
        `Credited to the ${ownName(fixed)} A/c${one ? '' : 's'}: ${eachGets(d.olds, credits)}.`,
      ],
    };
    const fraction = sameFrac(part, ONE) ? 'the whole' : 'half';
    const taken: SetItem[] = withdrawn
      ? [
          {
            text: one ? `${givers[0]} withdraws ${fraction} of the premium credited to ${givers[0]}, ${mode.by}.` : `${list(givers)} withdraw ${fraction} of the premium credited to them, ${mode.by}.`,
            lines: entry(...d.olds.map((n, i) => Dr(own(n), out[i])), Cr(mode.id, sum(out))),
            explanation: [
              `Premium credited: ${eachGets(d.olds, credits)}. Withdrawn, ${fraction} of it: ${eachGets(d.olds, out)}.`,
              `What is taken out reduces what the firm owes the partner: the ${ownName(fixed)} A/c${one ? ' is' : 's are'} debited and ${mode.name} A/c is credited with ${inr(sum(out))}.`,
            ],
          },
        ]
      : [];
    return {
      task: `Pass the journal entries for ${d.nw}'s admission on 1 April ${d.year}.`,
      opening: `${d.open} ${d.admit} ${d.how}${valued ? ` The goodwill of the firm is valued at ${inr(base)}.` : ''} ${setCaps(fixed)} No goodwill account is to be raised in the books.`,
      transactions: letteredItems([...receipts, shared, ...taken]),
      hints: H.premium,
      distractorAccounts: ['goodwill', ownAccount(!fixed)(givers[0]), partnerDrawings(givers[0]), partnerCurrent(d.nw)],
    };
  },
  verify: (q) => {
    const opening = openingOf(q);
    const d = readDeal(opening);
    if (!d || !setHolds()(q)) return false;
    const own = ownAccount(isFixed(opening));
    const net = booksOf(q.entries.map((e) => e.expected));
    const told = q.entries.map((e) => e.text).join(' ');
    const nw = /^(\w+) brings/.exec(told)?.[1] ?? '';
    const capital = amountsIn(told)[0];
    // The premium is the new partner's share of the goodwill of the firm, or the amount an item states.
    const premium = /valued at ₹/.test(opening) ? amountsIn(opening)[0] * d.share : amountsIn(told)[1];
    const left = /the whole of the premium credited/.test(told) ? 0 : /half of the premium credited/.test(told) ? 0.5 : 1;
    return (
      near(net('premiumForGoodwill'), 0) &&
      near(-net(partnerCapital(nw)), capital) &&
      near(net('bank') + net('cash'), capital + premium * left) &&
      d.olds.every((n, i) => near(-net(own(n)), ((premium * d.given[i]) / d.share) * left))
    );
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Set 2 (medium): goodwill in every form. The goodwill in the books is written off first; the premium is then brought
// in full, in part or not at all, and what is not brought is debited to the new partner's current or capital account.
// ---------------------------------------------------------------------------------------------------------------

/** What a new partner may bring as capital besides money. */
const IN_KIND = [
  { id: 'machinery', name: 'machinery' },
  { id: 'furniture', name: 'furniture' },
  { id: 'stock', name: 'stock' },
] as const;

const setGoodwillForms = journalSetTemplate({
  id: 'adm-set-goodwill-forms', topicId: T, conceptId: 'adm-sets', difficulty: 'medium',
  generate: (rng) => {
    const form = rng.pick(['full', 'full', 'partly', 'partly', 'none', 'none'] as const);
    const fixed = rng.int(0, 3) === 0;
    const own = ownAccount(fixed);
    // With fixed capitals the new partner's unpaid share can only go to the current account.
    const via = fixed || rng.int(0, 2) > 0 ? 'Current' : 'Capital';
    const paid = rng.pick(PAID);
    const half = form === 'full' && rng.int(0, 2) === 0;
    // Capital brought partly as an asset: always where nothing is brought for goodwill, so that the set has four entries.
    const inKind = form === 'none' || (!half && rng.int(0, 1) === 0);
    const made = attempt(6, () => {
      const d = dealWhere(rng, ['old', 'equal', 'stated', 'stated', 'one'], tidySac, rng.pick([2, 2, 2, 3]));
      if (!d) return null;
      const goodwill = amountFor(rng, 80000, 720000, [...d.given.map((g) => (half ? times(g, fr(1, 2)) : g)), ...(form === 'partly' ? [times(d.share, paid)] : [])]);
      return goodwill === null ? null : { d, goodwill };
    });
    if (!made) return null;
    const { d, goodwill } = made;
    const due = of(goodwill, d.share);
    const brought = form === 'full' ? due : form === 'partly' ? of(due, paid) : 0;
    const credits = d.given.map((g) => of(goodwill, g));
    if (due < 10000 || ![due, brought, ...credits].every(Number.isInteger)) return null;
    const unit = sum(d.old) * 1000;
    // Less stands in the books than the goodwill is now valued at.
    const existing = unit * rng.int(Math.ceil(20000 / unit), Math.max(Math.ceil(20000 / unit), Math.floor(Math.min(120000, goodwill * 0.6) / unit)));
    const off = d.oldShares.map((s) => of(existing, s));
    const capital = Math.max(rng.step(100000, 500000, 20000), Math.ceil((due * 2) / 20000) * 20000);
    const asset = rng.pick(IN_KIND);
    const worth = rng.step(40000, 200000, 10000);
    const unpaidTo = via === 'Current' ? partnerCurrent(d.nw) : partnerCapital(d.nw);
    const givers = giversOf(d);
    const one = givers.length === 1;
    const who = `the old ${one ? 'partner who gives' : 'partners who give'} up a share of profit`;
    const creditedLine = `Credited to the ${ownName(fixed)} A/c${one ? '' : 's'}: ${eachGets(d.olds, credits)}.`;
    const dueLine = `${d.nw}'s share of goodwill = ${inr(goodwill)} x ${fs(d.share)} = ${inr(due)}.`;
    const items: SetItem[] = [
      {
        text: `Goodwill of ${inr(existing)} that stands in the books is written off.`,
        lines: [...d.olds.map((n, i) => Dr(own(n), off[i])), Cr('goodwill', existing)],
        explanation: [
          `Goodwill in the books belongs to the time before ${d.nw} came in, so the old partners write it off in the old ratio ${rs(d.old)}: ${eachGets(d.olds, off)}.`,
          `The ${ownName(fixed)} A/cs are debited and Goodwill A/c is credited with ${inr(existing)} to close it.`,
        ],
      },
      {
        text: `${d.nw} brings ${inr(capital)} as capital, by cheque.`,
        lines: [Dr('bank', capital), Cr(partnerCapital(d.nw), capital)],
        explanation: [`Bank A/c is debited with the ${inr(capital)} received.`, `It is ${d.nw}'s capital: ${d.nw}'s Capital A/c is credited.`],
      },
    ];
    if (inKind) {
      const name = asset.name.charAt(0).toUpperCase() + asset.name.slice(1);
      items.push({
        text: `${d.nw} also brings in ${asset.name} valued at ${inr(worth)} as capital.`,
        lines: [Dr(asset.id, worth), Cr(partnerCapital(d.nw), worth)],
        explanation: [`The firm gets an asset: ${name} A/c is debited with ${inr(worth)}.`, `It is brought in as capital: ${d.nw}'s Capital A/c is credited.`],
      });
    }
    if (form === 'full') {
      items.push(
        {
          text: `${d.nw} brings the whole of ${d.nw}'s share of the firm's goodwill as premium, by cheque.`,
          lines: [Dr('bank', due), Cr('premiumForGoodwill', due)],
          explanation: [dueLine, 'Bank A/c is debited, and the premium is credited to Premium for Goodwill A/c until it is given to those who sacrifice.'],
        },
        {
          text: `The premium for goodwill is credited to ${who}.`,
          lines: entry(Dr('premiumForGoodwill', due), ...d.olds.map((n, i) => Cr(own(n), credits[i]))),
          explanation: [givesSteps(d)[0], sacStep(d), `Premium for Goodwill A/c is debited with ${inr(due)} to close it.`, creditedLine],
        },
      );
    } else if (form === 'partly') {
      items.push(
        {
          text: `${d.nw} brings ${inr(brought)} by cheque as premium for goodwill, which is only a part of ${d.nw}'s share of the firm's goodwill.`,
          lines: [Dr('bank', brought), Cr('premiumForGoodwill', brought)],
          explanation: [`Bank A/c is debited with the ${inr(brought)} received.`, 'It is a premium, not capital: Premium for Goodwill A/c is credited.'],
        },
        {
          text: `${who.charAt(0).toUpperCase()}${who.slice(1)} ${one ? 'is' : 'are'} given the full due for goodwill: the premium received, and the part of ${d.nw}'s share that was not brought in.`,
          lines: entry(Dr('premiumForGoodwill', brought), Dr(unpaidTo, due - brought), ...d.olds.map((n, i) => Cr(own(n), credits[i]))),
          explanation: [
            `${dueLine} Brought in ${inr(brought)}, not brought in ${inr(due)} - ${inr(brought)} = ${inr(due - brought)}.`,
            givesSteps(d)[0],
            sacStep(d),
            `Premium for Goodwill A/c is debited with the ${inr(brought)} received, and ${d.nw}'s ${via} A/c with the ${inr(due - brought)} not brought in.`,
            creditedLine,
          ],
        },
      );
    } else {
      items.push({
        text: `${d.nw} brings nothing for goodwill, and ${who} ${one ? 'is' : 'are'} given the due for goodwill.`,
        lines: entry(Dr(unpaidTo, due), ...d.olds.map((n, i) => Cr(own(n), credits[i]))),
        explanation: [
          dueLine,
          givesSteps(d)[0],
          sacStep(d),
          `No premium comes in, so Premium for Goodwill A/c is not used: ${d.nw}'s ${via} A/c is debited with ${inr(due)}.`,
          creditedLine,
        ],
      });
    }
    if (half) {
      const out = credits.map((c) => c / 2);
      items.push({
        text: one ? `${givers[0]} withdraws half of the premium credited to ${givers[0]}, by cheque.` : `${list(givers)} withdraw half of the premium credited to them, by cheque.`,
        lines: entry(...d.olds.map((n, i) => Dr(own(n), out[i])), Cr('bank', sum(out))),
        explanation: [
          `Premium credited: ${eachGets(d.olds, credits)}. Half of it is withdrawn: ${eachGets(d.olds, out)}.`,
          `The ${ownName(fixed)} A/c${one ? ' is' : 's are'} debited and Bank A/c is credited with ${inr(sum(out))}.`,
        ],
      });
    }
    return {
      task: `Pass the journal entries for goodwill and capital on ${d.nw}'s admission on 1 April ${d.year}.`,
      opening: `${d.open} ${d.admit} ${d.how} Goodwill stands in the books at ${inr(existing)}, and on the admission the goodwill of the firm is valued at ${inr(goodwill)}. ${setCaps(fixed)}${
        form === 'full' ? '' : ` Whatever part of ${d.nw}'s share of goodwill is not brought in is to be debited to ${d.nw}'s ${via} A/c.`
      } No goodwill is to stand in the books after the admission.`,
      transactions: letteredItems(items),
      hints: [
        'Three things can happen to goodwill here: what is in the books is written off, a premium is brought in, and a share not brought in is charged to the new partner.',
        "Goodwill in the books: old partners, old ratio. The new partner's share of goodwill, brought in or not: sacrificing partners, sacrificing ratio.",
      ],
      distractorAccounts: ['premiumForGoodwill', via === 'Current' ? partnerCapital(d.nw) : partnerCurrent(d.nw), ownAccount(!fixed)(givers[0]), 'revaluation'],
    };
  },
  verify: (q) => {
    const opening = openingOf(q);
    const d = readDeal(opening);
    if (!d || !setHolds()(q)) return false;
    const own = ownAccount(isFixed(opening));
    const net = booksOf(q.entries.map((e) => e.expected));
    const told = q.entries.map((e) => e.text).join(' ');
    const [existing, goodwill] = amountsIn(opening);
    const nw = /(\w+) brings ₹[\d,]+ as capital/.exec(told)?.[1] ?? '';
    const capital = rupeesIn(/brings ₹([\d,]+) as capital/.exec(told));
    const worth = rupeesIn(/valued at ₹([\d,]+) as capital/.exec(told));
    const due = goodwill * d.share;
    const brought = /brings the whole of/.test(told) ? due : rupeesIn(/brings ₹([\d,]+) by cheque as premium/.exec(told));
    const left = /withdraws? half of the premium/.test(told) ? 0.5 : 1;
    // What is not brought in is debited where the opening says: to the new partner's current or capital account.
    const via = /is to be debited to \w+'s (Current|Capital) A\/c/.exec(opening)?.[1];
    const unpaid = due - brought;
    if (!near(unpaid, 0) && !via) return false;
    return (
      near(net('goodwill'), -existing) &&
      near(net('premiumForGoodwill'), 0) &&
      near(net('bank'), capital + brought - (1 - left) * due) &&
      near(-net(partnerCapital(nw)), capital + worth - (via === 'Capital' ? unpaid : 0)) &&
      near(net(partnerCurrent(nw)), via === 'Current' ? unpaid : 0) &&
      d.olds.every((n, i) => near(-net(own(n)), ((due * d.given[i]) / d.share) * left - existing * d.shares[i]))
    );
  },
});

// ---------------------------------------------------------------------------------------------------------------
// A change on revaluation with the entry that records it: what the third set, the Revaluation Accounts, the capital
// accounts and the balance sheet are made of.
// ---------------------------------------------------------------------------------------------------------------

interface Change {
  /** The adjustment as the question states it. */
  text: string;
  /** The entry that passes through Revaluation A/c. */
  lines: JournalLine[];
  /** An entry passed first that does not touch Revaluation A/c: bad debts met out of a provision that exists. */
  before?: JournalLine[];
  /** Above zero for a gain and below it for a loss, in rupees. */
  effect: number;
  /** The working, a step to a line; the last says which account is debited and which credited. */
  steps: string[];
}

/** "Building" for the account id `building`. */
const plainName = (accountId: string): string => ledgerLabel(accountId).replace(/ A\/c$/, '');
const gainOn = (text: string, accountId: string, x: number, why: string): Change => ({
  text,
  lines: [Dr(accountId, x), Cr('revaluation', x)],
  effect: x,
  steps: [`${why} It is a gain: ${ledgerLabel(accountId)} is debited and Revaluation A/c credited with ${inr(x)}.`],
});
const lossOn = (text: string, accountId: string, x: number, why: string): Change => ({
  text,
  lines: [Dr('revaluation', x), Cr(accountId, x)],
  effect: -x,
  steps: [`${why} It is a loss: Revaluation A/c is debited and ${ledgerLabel(accountId)} credited with ${inr(x)}.`],
});

const PDD = 'provisionForDoubtfulDebts';
const FOUND = {
  investments: {
    text: (x: string) => `Investments of ${x}, not recorded in the books, are to be brought into the books.`,
    why: (x: string) => `Investments of ${x} that were not recorded come into the books as an asset.`,
  },
  accruedIncome: {
    text: (x: string) => `Accrued income of ${x} has not been recorded in the books.`,
    why: (x: string) => `Income of ${x} has been earned but not yet received: an asset that was not recorded.`,
  },
  prepaidExpenses: {
    text: (x: string) => `Prepaid insurance of ${x} has not been recorded in the books.`,
    why: (x: string) => `Insurance of ${x} paid for the coming period is an asset that was not recorded.`,
  },
} as const;
type FoundKind = keyof typeof FOUND;
const FOUND_KINDS: FoundKind[] = ['investments', 'accruedIncome', 'prepaidExpenses'];
const OWED_KINDS = ['salaries', 'wages', 'rent'] as const;

const CH = {
  /** An asset that is worth more, by a stated amount. */
  up: (asset: string, x: number): Change => gainOn(`${plainName(asset)} is to be appreciated by ${inr(x)}.`, asset, x, `${plainName(asset)} is worth ${inr(x)} more.`),
  /** An asset that is worth less, by a stated amount. */
  down: (asset: string, x: number): Change => lossOn(`${plainName(asset)} is to be reduced by ${inr(x)}.`, asset, x, `${plainName(asset)} is worth ${inr(x)} less.`),
  /** An asset revalued at a figure above or below its book value. */
  revalued: (asset: string, book: number, value: number): Change => {
    const text = `${plainName(asset)}, in the books at ${inr(book)}, is revalued at ${inr(value)}.`;
    return value > book
      ? gainOn(text, asset, value - book, `${plainName(asset)}: ${inr(value)} - ${inr(book)} = a rise of ${inr(value - book)}.`)
      : lossOn(text, asset, book - value, `${plainName(asset)}: ${inr(book)} - ${inr(value)} = a fall of ${inr(book - value)}.`);
  },
  depreciated: (asset: string, book: number, rate: number): Change =>
    lossOn(
      `${plainName(asset)}, in the books at ${inr(book)}, is to be depreciated by ${rate}%.`,
      asset,
      (book * rate) / 100,
      `Depreciation on ${plainName(asset).toLowerCase()} = ${rate}% of ${inr(book)} = ${inr((book * rate) / 100)}.`,
    ),
  /** An asset that was not in the books. */
  found: (kind: FoundKind, x: number): Change => gainOn(FOUND[kind].text(inr(x)), kind, x, FOUND[kind].why(inr(x))),
  /** A liability that was not in the books. */
  owed: (kind: (typeof OWED_KINDS)[number], x: number): Change =>
    lossOn(
      `Outstanding ${kind} of ${inr(x)} ${kind === 'rent' ? 'has' : 'have'} not been recorded in the books.`,
      'outstandingExpenses',
      x,
      `Outstanding ${kind} of ${inr(x)} ${kind === 'rent' ? 'is' : 'are'} a liability that was not recorded.`,
    ),
  back: (x: number): Change => gainOn(`Creditors include ${inr(x)} that is no longer payable and is to be written back.`, 'creditors', x, `Creditors fall by ${inr(x)}: a liability that need not be paid.`),
  bad: (x: number): Change =>
    lossOn(`Debtors of ${inr(x)} have turned bad and are to be written off; there is no provision for doubtful debts.`, 'debtors', x, `There is no provision to meet the bad debts of ${inr(x)}.`),
  provided: (x: number): Change => lossOn(`A provision for doubtful debts of ${inr(x)} is to be created; there is none in the books.`, PDD, x, `A provision of ${inr(x)} reduces what the debtors are worth.`),
  /**
   * A provision for doubtful debts worked out at a rate: with or without a provision in the books (`existing`), and
   * with or without bad debts to write off first. Null when the provision in the books is exactly what is needed.
   */
  provision: (debtors: number, existing: number, bad: number, rate: number): Change | null => {
    const rest = debtors - bad;
    const needed = (rest * rate) / 100;
    if (existing === 0) {
      if (bad === 0) {
        return lossOn(`Debtors stand at ${inr(debtors)} and there is no provision for doubtful debts; a provision of ${rate}% is to be made on debtors.`, PDD, needed, `Provision = ${rate}% of ${inr(debtors)} = ${inr(needed)}.`);
      }
      return {
        text: `Debtors stand at ${inr(debtors)} and there is no provision for doubtful debts; bad debts of ${inr(bad)} are to be written off and a provision of ${rate}% is to be made on the remaining debtors.`,
        lines: [Dr('revaluation', bad + needed), Cr('debtors', bad), Cr(PDD, needed)],
        effect: -(bad + needed),
        steps: [
          `There is no provision to meet the bad debts of ${inr(bad)}, so they are a loss on revaluation.`,
          `Debtors left = ${inr(debtors)} - ${inr(bad)} = ${inr(rest)}; provision = ${rate}% of ${inr(rest)} = ${inr(needed)}, a loss too.`,
          `Revaluation A/c is debited with ${inr(bad)} + ${inr(needed)} = ${inr(bad + needed)}; Debtors A/c is credited with ${inr(bad)} and Provision for Doubtful Debts A/c with ${inr(needed)}.`,
        ],
      };
    }
    const left = existing - bad;
    const gap = needed - left;
    if (left < 0 || gap === 0) return null;
    return {
      text:
        bad === 0
          ? `Debtors stand at ${inr(debtors)} and the provision for doubtful debts at ${inr(existing)}; the provision is to be kept at ${rate}% of debtors.`
          : `Debtors stand at ${inr(debtors)} and the provision for doubtful debts at ${inr(existing)}; bad debts of ${inr(bad)} are to be written off against the provision, which is then to be kept at ${rate}% of the remaining debtors.`,
      lines: gap > 0 ? [Dr('revaluation', gap), Cr(PDD, gap)] : [Dr(PDD, -gap), Cr('revaluation', -gap)],
      ...(bad > 0 ? { before: [Dr(PDD, bad), Cr('debtors', bad)] } : {}),
      effect: -gap,
      steps: [
        ...(bad > 0
          ? [`The bad debts of ${inr(bad)} are met out of the provision (Provision for Doubtful Debts A/c Dr; To Debtors A/c) and do not pass through Revaluation A/c. Provision left = ${inr(existing)} - ${inr(bad)} = ${inr(left)}; debtors left = ${inr(rest)}.`]
          : []),
        `Provision needed = ${rate}% of ${inr(rest)} = ${inr(needed)}; provision in the books = ${inr(left)}.`,
        gap > 0
          ? `The provision must rise by ${inr(gap)}. It is a loss: Revaluation A/c is debited and Provision for Doubtful Debts A/c credited with ${inr(gap)}.`
          : `The provision is ${inr(-gap)} more than is needed. The excess is a gain: Provision for Doubtful Debts A/c is debited and Revaluation A/c credited with ${inr(-gap)}.`,
      ],
    };
  },
};

/**
 * A change read back from its words alone, for `verify`: above zero for a gain, below it for a loss, and NaN for a
 * line that is not a change on revaluation.
 */
function readChange(text: string): number {
  const a = amountsIn(text);
  const rate = Number(/(\d+)%/.exec(text)?.[1]);
  if (/^Debtors stand at/.test(text)) {
    const none = /there is no provision/.test(text);
    const bad = /bad debts of ₹/.test(text) ? a[none ? 1 : 2] : 0;
    const needed = ((a[0] - bad) * rate) / 100;
    return none ? -(bad + needed) : a[1] - bad - needed;
  }
  if (/is revalued at/.test(text)) return a[1] - a[0];
  if (/is to be depreciated by/.test(text)) return -(a[0] * rate) / 100;
  if (/is to be appreciated by|are to be brought into the books|^Accrued income of|^Prepaid insurance of|no longer payable/.test(text)) return a[0];
  if (/is to be reduced by|^Outstanding \w+ of|have turned bad|^A provision for doubtful debts of/.test(text)) return -a[0];
  return NaN;
}

/**
 * The changes of one revaluation, in the order the question lists them: `count` of them, one always an asset or a
 * liability that was not in the books. `worked` gives book values and rates to work the amounts from; `lean` says
 * whether the largest change is a gain or a loss, so that some seeds end in a profit and others in a loss; `before`
 * allows bad debts met out of a provision (which need an entry of their own, so a set of entries cannot have them).
 * The result is never nil and every old partner's share of it is a whole number of thousands (`unit` is the sum of
 * the old ratio in thousands of rupees): the one plain figure is moved up a thousand at a time until it is.
 */
function drawChanges(rng: Rng, o: { count: number; worked: boolean; lean: 'profit' | 'loss'; unit: number; before: boolean }): Change[] | null {
  const rise = (): Change => {
    const asset = rng.pick(['building', 'land']);
    const x = rng.step(20000, 120000, 10000);
    if (!o.worked || rng.int(0, 2) === 0) return CH.up(asset, x);
    const book = rng.step(300000, 900000, 50000);
    return CH.revalued(asset, book, book + x);
  };
  const wear = (): Change => {
    const asset = rng.pick(['machinery', 'furniture']);
    if (!o.worked) return CH.down(asset, rng.step(4000, 30000, 1000));
    return CH.depreciated(asset, asset === 'machinery' ? rng.step(100000, 500000, 20000) : rng.step(40000, 160000, 20000), rng.pick([5, 10, 15, 20]));
  };
  const stock = (): Change => {
    const x = rng.step(4000, 30000, 2000);
    if (!o.worked || rng.int(0, 1) === 0) return CH.down('stock', x);
    const book = rng.step(80000, 300000, 10000);
    // Stock falls by a fifth of its book value at most.
    return CH.revalued('stock', book, book - Math.min(x, Math.floor(book / 5 / 2000) * 2000));
  };
  const debts = (): Change | null => {
    if (!o.worked) return rng.int(0, 1) === 0 ? CH.provided(rng.step(3000, 15000, 1000)) : CH.bad(rng.step(2000, 12000, 1000));
    const rate = rng.pick([5, 10]);
    const rest = rng.step(100000, 400000, 20000);
    const needed = (rest * rate) / 100;
    const bad = rng.step(2000, 10000, 1000);
    // How far the provision in the books is from the one needed: below it two times in three.
    const gap = rng.step(1000, Math.min(8000, needed - 1000), 1000) * (rng.int(0, 2) === 0 ? -1 : 1);
    switch (rng.int(0, o.before ? 3 : 2)) {
      case 0:
        return CH.provision(rest, 0, 0, rate);
      case 1:
        return CH.provision(rest + bad, 0, bad, rate);
      case 2:
        return CH.provision(rest, needed - gap, 0, rate);
      default:
        return CH.provision(rest + bad, needed - gap + bad, bad, rate);
    }
  };
  const back = (): Change => CH.back(rng.step(3000, 15000, 1000));
  const second = rng.shuffle(o.lean === 'profit' ? [wear, stock, debts] : [stock, debts]);
  const order = [o.lean === 'profit' ? rise : wear, second[0], ...rng.shuffle([...second.slice(1), back])];
  const others: Change[] = [];
  for (const make of order.slice(0, o.count - 1)) {
    const change = make();
    if (change === null) return null;
    others.push(change);
  }
  const partial = sum(others.map((c) => c.effect));
  if (partial % 1000 !== 0 || o.unit % 1000 !== 0) return null;
  // The item that was not in the books is an asset where every other change is a loss, and a liability where every
  // other change is a gain, so that a revaluation always has both.
  const coin = rng.int(0, 1) === 0;
  const asset = others.every((c) => c.effect < 0) || (coin && others.some((c) => c.effect < 0));
  const sign = asset ? 1 : -1;
  let x = rng.step(4000, 20000, 1000);
  while ((((partial + sign * x) % o.unit) + o.unit) % o.unit !== 0) x += 1000;
  if (partial + sign * x === 0) x += o.unit;
  return rng.shuffle([...others, asset ? CH.found(rng.pick(FOUND_KINDS), x) : CH.owed(rng.pick(OWED_KINDS), x)]);
}

/** The working of the result of a revaluation from the effects of its changes. */
function resultStep(effects: readonly number[]): string {
  const added = (xs: number[]): string => (xs.length === 0 ? 'nil' : xs.length === 1 ? inr(xs[0]) : `${xs.map(inr).join(' + ')} = ${inr(sum(xs))}`);
  const net = sum(effects);
  return `Gains (credits to Revaluation A/c): ${added(effects.filter((e) => e > 0))}. Losses (debits): ${added(effects.filter((e) => e < 0).map((e) => -e))}. The ${net > 0 ? 'gains' : 'losses'} are larger by ${inr(Math.abs(net))}: a ${net > 0 ? 'profit' : 'loss'} on revaluation.`;
}

// ---------------------------------------------------------------------------------------------------------------
// Set 3 (medium): revaluation. An entry for each change in an asset or a liability, one of them not in the books
// before, and the transfer of the profit or the loss to the old partners.
// ---------------------------------------------------------------------------------------------------------------

const setRevaluation = journalSetTemplate({
  id: 'adm-set-revaluation', topicId: T, conceptId: 'adm-sets', difficulty: 'medium',
  generate: (rng) => {
    const d = deal(rng, 'old', rng.pick([2, 2, 3]));
    if (!d) return null;
    const fixed = rng.int(0, 3) === 0;
    const own = ownAccount(fixed);
    const changes = drawChanges(rng, { count: rng.pick([3, 3, 4]), worked: true, lean: rng.pick(['profit', 'profit', 'loss']), unit: sum(d.old) * 1000, before: false });
    if (!changes) return null;
    const net = sum(changes.map((c) => c.effect));
    const size = Math.abs(net);
    const parts = d.oldShares.map((s) => of(size, s));
    if (!parts.every(Number.isInteger)) return null;
    const transfer: SetItem = {
      text: 'The profit or loss on revaluation is transferred to the old partners.',
      lines: net > 0 ? [Dr('revaluation', size), ...d.olds.map((n, i) => Cr(own(n), parts[i]))] : [...d.olds.map((n, i) => Dr(own(n), parts[i])), Cr('revaluation', size)],
      explanation: [
        resultStep(changes.map((c) => c.effect)),
        `It arose before ${d.nw} came in, so it belongs to the old partners in the old ratio ${rs(d.old)}: ${eachGets(d.olds, parts)}. ${d.nw} gets none of it.`,
        net > 0
          ? `Revaluation A/c has a credit balance: it is debited to close it and the old partners' ${ownName(fixed)} A/cs are credited.`
          : `Revaluation A/c has a debit balance: the old partners' ${ownName(fixed)} A/cs are debited and Revaluation A/c is credited to close it.`,
      ],
    };
    return {
      task: `Pass the journal entries for the revaluation on ${d.nw}'s admission on 1 April ${d.year}.`,
      opening: `${d.open} ${d.admit} On that date the assets and liabilities are revalued as the items below say, each change being recorded through Revaluation A/c. ${setCaps(fixed)}`,
      transactions: letteredItems([...changes.map((c) => ({ text: c.text, lines: c.lines, explanation: c.steps })), transfer]),
      hints: H.revaluation,
      distractorAccounts: ['profitAndLoss', own(d.nw), 'badDebts', 'depreciation', 'generalReserve'],
    };
  },
  verify: (q) => {
    const opening = openingOf(q);
    const old = ratiosIn(opening)[0];
    const olds = oldNamesIn(opening);
    if (!old || old.length !== olds.length || !setHolds()(q)) return false;
    const own = ownAccount(isFixed(opening));
    const changes = q.entries.slice(0, -1);
    // Every change moves Revaluation A/c by what its own words say, and the last entry shares out what is left.
    const effects = changes.map((e) => readChange(e.text));
    const each = changes.every((e, k) => near(-booksOf([e.expected])('revaluation'), effects[k]));
    const net = booksOf(q.entries.map((e) => e.expected));
    const result = sum(effects);
    return each && result !== 0 && near(net('revaluation'), 0) && olds.every((n, i) => near(-net(own(n)), (result * old[i]) / sum(old)));
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Reserves and accumulated profits and losses, as the long questions state them.
// ---------------------------------------------------------------------------------------------------------------

/** A balance that belongs to the old partners in the old ratio: as an item of a set (`text`) and as a line of data (`line`). */
export const HELD: { text: (x: string) => string; line: (x: string) => string; account: string; name: string; credit: boolean }[] = [
  { text: (x) => `The balance sheet shows a General Reserve of ${x}.`, line: (x) => `General Reserve: ${x}`, account: 'generalReserve', name: 'General Reserve', credit: true },
  {
    text: (x) => `Profit and Loss A/c shows a credit balance of ${x}, the undistributed profit of earlier years.`,
    line: (x) => `Profit and Loss A/c (credit balance, undistributed profit): ${x}`,
    account: 'profitAndLoss', name: 'Profit and Loss', credit: true,
  },
  {
    text: (x) => `Profit and Loss A/c shows a debit balance of ${x}, the accumulated loss of earlier years.`,
    line: (x) => `Profit and Loss A/c (debit balance, accumulated loss): ${x}`,
    account: 'profitAndLoss', name: 'Profit and Loss', credit: false,
  },
  {
    text: (x) => `Advertisement Suspense A/c stands on the assets side at ${x}.`,
    line: (x) => `Advertisement Suspense A/c (on the assets side): ${x}`,
    account: 'advertisementSuspense', name: 'Advertisement Suspense', credit: false,
  },
];

/**
 * A reserve kept for a purpose and what stands against it: a Workmen Compensation Reserve and a claim, or an
 * Investment Fluctuation Reserve and a fall in the market value of the investments (`book` is their book value).
 * What the reserve has left goes to the old partners (`surplus`); what it cannot meet is a loss on revaluation.
 */
export interface Earmarked {
  wcr: boolean;
  name: string;
  reserve: number;
  against: number;
  book: number;
  surplus: number;
  shortfall: number;
}

/** One such reserve: with something left over, short of what stands against it, exactly used up, or with nothing against it. */
export function earmarked(rng: Rng, unit: number): Earmarked {
  const wcr = rng.int(0, 1) === 0;
  const kind = rng.pick(['surplus', 'surplus', 'short', 'short', 'equal', 'none'] as const);
  const mult = (lo: number, hi: number): number => unit * rng.int(Math.max(1, Math.ceil(lo / unit)), Math.max(1, Math.ceil(lo / unit), Math.floor(hi / unit)));
  let reserve: number;
  let against: number;
  if (kind === 'surplus') {
    against = rng.step(10000, 40000, 5000);
    reserve = against + mult(8000, 40000);
  } else if (kind === 'short') {
    reserve = rng.step(10000, 40000, 5000);
    against = reserve + rng.step(4000, 20000, 1000);
  } else if (kind === 'equal') {
    reserve = rng.step(10000, 50000, 5000);
    against = reserve;
  } else {
    reserve = mult(10000, 50000);
    against = 0;
  }
  // The investments stand at three times the fall at least, so that they lose no more than a third of their book value.
  const book = rng.step(Math.ceil(Math.max(against + 60000, against * 3) / 10000) * 10000, 300000, 10000);
  return {
    wcr, reserve, against, book,
    name: wcr ? 'Workmen Compensation Reserve' : 'Investment Fluctuation Reserve',
    surplus: Math.max(reserve - against, 0),
    shortfall: Math.max(against - reserve, 0),
  };
}

/** The one entry that closes such a reserve; `toOld` credits the old partners with what is left of it. */
export const earmarkedLines = (e: Earmarked, toOld: (x: number) => JournalLine[]): JournalLine[] =>
  entry(
    Dr(e.wcr ? 'workmenCompensationReserve' : 'investmentFluctuationReserve', e.reserve),
    Dr('revaluation', e.shortfall),
    Cr(e.wcr ? 'workmenCompensationClaim' : 'investments', e.against),
    ...toOld(e.surplus),
  );

/** The working of that entry; `shares` says what each old partner gets of the amount left. */
export function earmarkedSteps(e: Earmarked, shares: string, own: string): string[] {
  const first = e.wcr
    ? e.against > 0
      ? `The claim of ${inr(e.against)} is a liability: Workmen Compensation Claim A/c is credited, and the reserve is there to meet it.`
      : 'There is no claim, so the whole of the reserve is free.'
    : e.against > 0
      ? `The investments have fallen from ${inr(e.book)} to ${inr(e.book - e.against)}, by ${inr(e.against)}: Investments A/c is credited, and the reserve is there to meet the fall.`
      : 'The investments have not fallen in value, so the whole of the reserve is free.';
  const what = e.wcr ? 'claim' : 'fall';
  const then =
    e.surplus > 0
      ? `${e.against > 0 ? `Reserve left = ${inr(e.reserve)} - ${inr(e.against)} = ${inr(e.surplus)}. ` : ''}What is free belongs to the old partners in the old ratio: ${shares}, credited to the ${own} A/cs.`
      : e.shortfall > 0
        ? `The reserve of ${inr(e.reserve)} meets only a part of the ${what}; the other ${inr(e.against)} - ${inr(e.reserve)} = ${inr(e.shortfall)} is a loss, debited to Revaluation A/c. Nothing of the reserve is left to share.`
        : `The ${what} uses up the whole reserve: nothing is left to share and nothing goes to Revaluation A/c.`;
  return [first, then, `${e.name} A/c is debited with ${inr(e.reserve)} to close it.`];
}

/** Such a reserve as one item of a set. */
const earmarkedText = (e: Earmarked): string =>
  e.wcr
    ? e.against > 0
      ? `Workmen Compensation Reserve stands at ${inr(e.reserve)}, and a claim of ${inr(e.against)} for workmen's compensation is to be provided for.`
      : `Workmen Compensation Reserve stands at ${inr(e.reserve)}; there is no claim against it.`
    : e.against > 0
      ? `Investments stand in the books at ${inr(e.book)} and Investment Fluctuation Reserve at ${inr(e.reserve)}; the market value of the investments is ${inr(e.book - e.against)}.`
      : `Investments stand in the books at ${inr(e.book)} and Investment Fluctuation Reserve at ${inr(e.reserve)}; the investments are worth their book value.`;

/** What such an item leaves, read from its words: above zero for the old partners, below zero for a loss on revaluation. */
function readEarmarked(text: string): number | null {
  const a = amountsIn(text);
  if (/^Workmen Compensation Reserve stands at/.test(text)) return a[0] - (a[1] ?? 0);
  if (/Investment Fluctuation Reserve at/.test(text)) return a[1] - (a.length > 2 ? a[0] - a[2] : 0);
  return null;
}

/** "₹4,00,000 + ₹36,000 (General Reserve) - ₹6,000 (loss on revaluation)": a capital and what moved it, nil amounts left out. */
export const movedText = (start: number, moves: readonly { what: string; amounts: number[] }[], i: number): string =>
  `${inr(start)}${moves.flatMap((m) => (m.amounts[i] === 0 ? [] : [` ${m.amounts[i] > 0 ? '+' : '-'} ${inr(Math.abs(m.amounts[i]))} (${m.what})`])).join('')}`;

// ---------------------------------------------------------------------------------------------------------------
// Set 4 (complex): a whole admission. A reserve or an accumulated balance, a reserve kept for a purpose with what
// stands against it, a change on revaluation and its transfer, the capital and the premium, and each old partner's
// capital brought to the new ratio in cash.
// ---------------------------------------------------------------------------------------------------------------

const setWholeAdmission = journalSetTemplate({
  id: 'adm-set-whole-admission', topicId: T, conceptId: 'adm-sets', difficulty: 'complex',
  generate: (rng) => {
    const made = attempt(8, () => {
      const d = dealWhere(rng, ['old', 'equal', 'stated', 'stated'], (x) => tidySac(x) && sum(x.newRatio) <= 40);
      if (!d) return null;
      const capital = baseCapital(rng, d);
      const goodwill = amountFor(rng, 60000, 600000, d.given);
      return capital === null || goodwill === null ? null : { d, capital, goodwill };
    });
    if (!made) return null;
    const { d, capital, goodwill } = made;
    const unit = sum(d.old) * 1000;
    const caps = d.olds.map(partnerCapital);
    const inOld = (x: number): number[] => d.oldShares.map((s) => of(x, s));
    const creditOld = (x: number): JournalLine[] => inOld(x).map((part, i) => Cr(caps[i], part));
    const debitOld = (x: number): JournalLine[] => inOld(x).map((part, i) => Dr(caps[i], part));
    const held = rng.int(0, 2) === 0 ? null : rng.pick(HELD);
    const heldAmount = unit * rng.int(Math.ceil(20000 / unit), Math.floor(120000 / unit));
    const e = earmarked(rng, unit);
    // One change on revaluation with a plain figure, moved up a thousand at a time until the result, the shortfall
    // of the reserve included, divides among the old partners in whole thousands.
    const owedKind = rng.pick(OWED_KINDS);
    const foundKind = rng.pick(e.wcr ? FOUND_KINDS : FOUND_KINDS.filter((k) => k !== 'investments'));
    const makeChange = rng.pick<(x: number) => Change>([
      (x) => CH.up('building', x), (x) => CH.up('land', x), (x) => CH.down('stock', x), (x) => CH.down('machinery', x), (x) => CH.down('furniture', x),
      (x) => CH.back(x), (x) => CH.bad(x), (x) => CH.provided(x), (x) => CH.owed(owedKind, x), (x) => CH.found(foundKind, x),
    ]);
    const sign = Math.sign(makeChange(1000).effect);
    let x = rng.step(6000, 40000, 1000);
    while ((((sign * x - e.shortfall) % unit) + unit) % unit !== 0) x += 1000;
    if (sign * x === e.shortfall) x += unit;
    const change = makeChange(x);
    const result = change.effect - e.shortfall;
    const premium = of(goodwill, d.share);
    const credits = d.given.map((g) => of(goodwill, g));
    const required = d.olds.map((_, i) => of(capital, over(d.news[i], d.share)));
    const signed = (amounts: number[], up: boolean): number[] => amounts.map((a) => (up ? a : -a));
    const moves = [
      ...(held ? [{ what: held.name, amounts: signed(inOld(heldAmount), held.credit) }] : []),
      ...(e.surplus > 0 ? [{ what: e.name, amounts: inOld(e.surplus) }] : []),
      { what: `${result > 0 ? 'profit' : 'loss'} on revaluation`, amounts: signed(inOld(Math.abs(result)), result > 0) },
      { what: 'premium for goodwill', amounts: credits },
    ];
    const moved = d.olds.map((_, i) => sum(moves.map((m) => m.amounts[i])));
    // The capitals the firm starts with are round figures near what the new ratio requires, so that what each old
    // partner brings in or withdraws is a modest amount, and its direction changes with the seed.
    const start = d.olds.map((_, i) => Math.round((required[i] - moved[i] - rng.step(5000, 40000, 5000) * (rng.int(0, 1) === 0 ? 1 : -1)) / 10000) * 10000);
    const before = start.map((c, i) => c + moved[i]);
    const gaps = required.map((r, i) => r - before[i]);
    if (![premium, ...credits, ...required, ...moved].every(Number.isInteger)) return null;
    // A capital is not adjusted by a trifle: at least ₹5,000 moves for each old partner.
    if (start.some((c) => c < 60000) || gaps.some((g) => Math.abs(g) < 5000)) return null;
    const total = of(capital, over(ONE, d.share));
    const heldItems: SetItem[] = held
      ? [
          {
            text: held.text(inr(heldAmount)),
            lines: held.credit ? [Dr(held.account, heldAmount), ...creditOld(heldAmount)] : [...debitOld(heldAmount), Cr(held.account, heldAmount)],
            explanation: [
              held.credit
                ? `It was built up out of profits earned before ${d.nw} came in, so it goes to the old partners in the old ratio ${rs(d.old)}: ${eachGets(d.olds, inOld(heldAmount))}.`
                : `It is a loss of the time before ${d.nw} came in, so the old partners bear it in the old ratio ${rs(d.old)}: ${eachGets(d.olds, inOld(heldAmount))}.`,
              held.credit ? `${held.name} A/c is debited to close it and the Capital A/cs are credited.` : `The Capital A/cs are debited and ${held.name} A/c is credited to close it.`,
            ],
          },
        ]
      : [];
    const items: SetItem[] = [
      ...rng.shuffle<SetItem>([
        ...heldItems,
        { text: earmarkedText(e), lines: earmarkedLines(e, creditOld), explanation: earmarkedSteps(e, eachGets(d.olds, inOld(e.surplus)), 'Capital') },
        { text: change.text, lines: change.lines, explanation: change.steps },
      ]),
      {
        text: 'The profit or loss on revaluation is transferred to the old partners.',
        lines: result > 0 ? [Dr('revaluation', result), ...creditOld(result)] : [...debitOld(-result), Cr('revaluation', -result)],
        explanation: [
          ...(e.shortfall > 0 ? [`Revaluation A/c holds the change in value and the ${inr(e.shortfall)} that the ${e.name} could not meet.`] : []),
          resultStep([change.effect, ...(e.shortfall > 0 ? [-e.shortfall] : [])]),
          `It belongs to the old partners in the old ratio ${rs(d.old)}: ${eachGets(d.olds, inOld(Math.abs(result)))}.`,
          result > 0 ? 'Revaluation A/c is debited to close it and the Capital A/cs are credited.' : 'The Capital A/cs are debited and Revaluation A/c is credited to close it.',
        ],
      },
      {
        text: `${d.nw} brings ${inr(capital)} as capital and ${d.nw}'s share of the firm's goodwill as premium, by cheque.`,
        lines: [Dr('bank', capital + premium), Cr(partnerCapital(d.nw), capital), Cr('premiumForGoodwill', premium)],
        explanation: [
          `${d.nw}'s share of goodwill = ${inr(goodwill)} x ${fs(d.share)} = ${inr(premium)}.`,
          `Bank A/c is debited with ${inr(capital)} + ${inr(premium)} = ${inr(capital + premium)}.`,
          `${d.nw}'s Capital A/c is credited with the capital only; the premium is credited to Premium for Goodwill A/c.`,
        ],
      },
      {
        text: 'The premium for goodwill is credited to the old partners who give up a share of profit.',
        lines: entry(Dr('premiumForGoodwill', premium), ...d.olds.map((_, i) => Cr(caps[i], credits[i]))),
        explanation: [givesSteps(d)[0], sacStep(d), `Premium for Goodwill A/c is debited with ${inr(premium)} to close it. Credited: ${eachGets(d.olds, credits)}.`],
      },
      ...d.olds.map((n, i): SetItem => ({
        text: `${n}'s capital is brought to the figure that the new ratio requires, by cheque.`,
        lines: gaps[i] > 0 ? [Dr('bank', gaps[i]), Cr(caps[i], gaps[i])] : [Dr(caps[i], -gaps[i]), Cr('bank', -gaps[i])],
        explanation: [
          ...(i === 0 ? newShareSteps(d) : []),
          `${d.nw}'s ${inr(capital)} stands for ${fs(d.share)} of the firm, so the total capital = ${inr(capital)} x ${d.share[1]}/${d.share[0]} = ${inr(total)}; ${n}'s capital should be ${inr(total)} x ${fs(d.news[i])} = ${inr(required[i])}.`,
          `${n}'s capital after the entries above = ${movedText(start[i], moves, i)} = ${inr(before[i])}.`,
          gaps[i] > 0
            ? `It is short by ${inr(required[i])} - ${inr(before[i])} = ${inr(gaps[i])}, which ${n} brings in: Bank A/c is debited and ${n}'s Capital A/c credited.`
            : `It is in excess by ${inr(before[i])} - ${inr(required[i])} = ${inr(-gaps[i])}, which ${n} withdraws: ${n}'s Capital A/c is debited and Bank A/c credited.`,
        ],
      })),
    ];
    return {
      task: `Pass the journal entries for ${d.nw}'s admission on 1 April ${d.year}, from the reserves to the adjustment of the capitals.`,
      opening: `${d.open} ${d.admit} ${d.how} The capital accounts are fluctuating; on that date they stand at ${inr(start[0])} for ${d.olds[0]} and ${inr(start[1])} for ${d.olds[1]}. The goodwill of the firm is valued at ${inr(goodwill)}, and no goodwill account is to be raised. After all the other entries the capitals of ${list(d.olds)} are to be adjusted to the new profit-sharing ratio on the basis of ${d.nw}'s capital: a shortfall is brought in and an excess withdrawn, by cheque.`,
      transactions: letteredItems(items),
      hints: [
        'Settle the past first: reserves, accumulated profits or losses and the result of revaluation go to the old partners in the old ratio. A reserve kept for a purpose first meets that purpose.',
        "Then the premium, in the sacrificing ratio. Last, total capital = new partner's capital x reciprocal of the share; each old partner's capital in the new ratio, less the capital after all the entries, is the cash to bring in or withdraw.",
      ],
      distractorAccounts: ['goodwill', partnerCurrent(d.olds[0]), 'profitAndLoss', 'generalReserve', 'cash'],
    };
  },
  verify: (q) => {
    const opening = openingOf(q);
    const d = readDeal(opening);
    if (!d || d.olds.length !== 2 || !setHolds()(q)) return false;
    const [capA, capB, goodwill] = amountsIn(opening);
    // What the old partners share in the old ratio, read from the words of each item: reserves and accumulated
    // balances, what a reserve kept for a purpose has left, and the result of revaluation.
    let shared = 0;
    let revaluation = 0;
    let capital = 0;
    for (const e of q.entries) {
      const a = amountsIn(e.text);
      const left = readEarmarked(e.text);
      if (/General Reserve of|credit balance of/.test(e.text)) shared += a[0];
      else if (/debit balance of|^Advertisement Suspense/.test(e.text)) shared -= a[0];
      else if (left !== null) {
        if (left > 0) shared += left;
        else revaluation += left;
      } else if (/as capital and/.test(e.text)) capital = a[0];
      else if (!Number.isNaN(readChange(e.text))) revaluation += readChange(e.text);
    }
    const net = booksOf(q.entries.map((e) => e.expected));
    const required = d.olds.map((_, i) => (capital / d.share) * (d.shares[i] - d.given[i]));
    const before = [capA, capB].map((c, i) => c + (shared + revaluation) * d.shares[i] + goodwill * d.given[i]);
    const last = q.entries.slice(-2);
    return (
      capital > 0 &&
      near(net('revaluation'), 0) &&
      near(net('premiumForGoodwill'), 0) &&
      // Each capital ends at the figure the new ratio requires, and the cash that moves is what was missing or over.
      d.olds.every((n, i) => near([capA, capB][i] - net(partnerCapital(n)), required[i]) && near(booksOf([last[i].expected])('bank'), required[i] - before[i]))
    );
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Formats 1 and 2: the Revaluation Account, from a list of changes (easy) and from book values, rates and a
// provision to be worked out (medium). The rows are the postings of the entries to Revaluation A/c; the profit or
// the loss is a row for each old partner, which the student enters, and it closes the account.
// ---------------------------------------------------------------------------------------------------------------

/** The row of a Revaluation Account that carries a partner's share of the profit or of the loss. */
const movedTo = (word: string, name: string, account: string): string => `${word} transferred to ${name}'s ${account} A/c`;
const LETTERS = 'abcdefgh';

function revaluationAccount(rng: Rng, worked: boolean): AccountParts | null {
  const d = deal(rng, 'old', rng.pick([2, 2, 3]));
  if (!d) return null;
  const fixed = rng.int(0, 3) === 0;
  const own = ownAccount(fixed);
  const lean = rng.pick(['profit', 'loss'] as const);
  // Four or five changes in a list; five or six where the figures are worked out (a revaluation that leans to a loss has five kinds of change to draw on).
  const count = worked ? (lean === 'profit' ? rng.pick([5, 6]) : 5) : rng.pick([4, 5, 5]);
  const changes = drawChanges(rng, { count, worked, lean, unit: sum(d.old) * 1000, before: worked });
  if (!changes) return null;
  const day = `1 April ${d.year}`;
  const entries: DatedEntry[] = changes.flatMap((c) => [...(c.before ? [{ date: day, lines: c.before }] : []), { date: day, lines: c.lines }]);
  // What the changes leave in Revaluation A/c is its result: a credit balance is a profit, a debit balance a loss.
  const balance = accountOf(entries, 'revaluation').balance;
  if (!balance) return null;
  const profit = balance.side === 'Cr';
  const result = balance.amount / 100;
  const parts = d.oldShares.map((s) => of(result, s));
  if (!parts.every(Number.isInteger)) return null;
  entries.push({
    date: day,
    lines: profit ? [Dr('revaluation', result), ...d.olds.map((n, i) => Cr(own(n), parts[i]))] : [...d.olds.map((n, i) => Dr(own(n), parts[i])), Cr('revaluation', result)],
  });
  const word = profit ? 'Profit' : 'Loss';
  const account = ownName(fixed);
  const partner = (accountId: string): string | undefined => d.olds.find((n) => own(n) === accountId);
  const view = accountOf(entries, 'revaluation', null, (id) => (partner(id) ? movedTo(word, partner(id)!, account) : ledgerLabel(id)));
  if (view.balance) throw new Error('admission: the Revaluation Account is not closed');
  const row = (p: Posting): FormatRowParts => ({
    date: p.date,
    label: p.label,
    amount: p.amount,
    // The house form names the transfer in full; the partner's account alone ("Asha's Capital A/c") is as right.
    ...(partner(p.accountIds[0]) ? { closing: true, also: [ledgerLabel(p.accountIds[0])] } : {}),
    // Bad debts written off through Revaluation A/c are credited to Debtors A/c; an examiner accepts either name.
    ...(p.accountIds[0] === 'debtors' ? { also: ['Bad Debts A/c'] } : {}),
  });
  return {
    task: `Prepare the Revaluation Account on ${d.nw}'s admission on ${day}, with a row for each partner's share of the profit or loss.`,
    data: [
      `${d.open} ${d.admit}`,
      fixed ? "The capitals are fixed, so the profit or loss on revaluation is carried to the partners' current accounts." : 'The capital accounts are fluctuating.',
      'On that date the assets and liabilities are revalued as follows:',
      lettered(changes.map((c) => c.text)),
    ].join('\n'),
    title: 'Revaluation A/c',
    left: drSide(view.debit.map(row)),
    right: crSide(view.credit.map(row)),
    // Only what a student reaches for, so that the list stays short enough for a phone: the transfer under the wrong
    // word (for every old partner, or the list would say whether it is a profit or a loss), to the new partner and,
    // with fixed capitals, to a capital account; bad debts that a provision has already met; and, where two old
    // partners leave room for them, the account balanced or closed to Profit and Loss A/c. None of them is a name an
    // examiner would accept for a row: what is as right as the house form is an `also` of its row.
    distractors: [
      ...d.olds.map((n) => movedTo(profit ? 'Loss' : 'Profit', n, account)),
      movedTo(word, d.nw, account),
      ...(fixed ? [movedTo(word, d.olds[0], 'Capital')] : []),
      ...(changes.some((c) => c.before) ? ['Bad Debts A/c', 'Debtors A/c'] : []),
      ...(d.olds.length === 2 ? ['Balance c/d', 'Profit and Loss A/c'] : []),
    ],
    explanation: [
      'A gain (an asset worth more, a liability that falls, an asset not yet in the books) is credited to Revaluation A/c, and a loss (an asset worth less, a provision, a liability not yet in the books) is debited: each row is named after the other account of its entry.',
      ...changes.map((c, k) => `(${LETTERS[k]}) ${c.steps.join(' ')}`),
      resultStep(changes.map((c) => c.effect)),
      `It arose before ${d.nw} came in, so it belongs to the old partners in the old ratio ${rs(d.old)}: ${eachGets(d.olds, parts)}. ${d.nw} gets none of it.`,
      `${profit ? 'A profit is written on the debit side' : 'A loss is written on the credit side'}, a row for each old partner${fixed ? " (to the Current A/c, because the capitals are fixed)" : ''}; that closes the account, and both sides total ${inr(view.total / 100)}.`,
    ],
    hints: H.revaluation,
  };
}

/** The Revaluation Account worked again from the words of its data: gains, losses, and each old partner's share of the difference. */
const revaluationHolds = (q: AccountQuestion): boolean => {
  const lines = q.data.split('\n');
  const old = ratiosIn(lines[0])[0];
  const olds = oldNamesIn(lines[0]);
  const effects = lines.filter((l) => /^\([a-h]\) /.test(l)).map((l) => readChange(l.slice(4)));
  if (!old || old.length !== olds.length || effects.length < 3 || effects.some(Number.isNaN)) return false;
  const gains = sum(effects.filter((e) => e > 0));
  const losses = -sum(effects.filter((e) => e < 0));
  const net = gains - losses;
  const [debit, credit] = q.sides.map((s) => s.rows);
  const changed = (rows: typeof debit): number => sum(rows.filter((r) => !r.closing).map((r) => r.amounts[0])) / 100;
  const moved = (net > 0 ? debit : credit).filter((r) => r.closing);
  const account = isFixed(q.data) ? 'Current' : 'Capital';
  return (
    net !== 0 &&
    near(changed(debit), losses) &&
    near(changed(credit), gains) &&
    (net > 0 ? credit : debit).every((r) => !r.closing) &&
    moved.length === olds.length &&
    olds.every((n, i) => moved.some((r) => r.label === movedTo(net > 0 ? 'Profit' : 'Loss', n, account) && near(r.amounts[0] / 100, (Math.abs(net) * old[i]) / sum(old))))
  );
};

const fmtRevaluation = accountTemplate({
  id: 'adm-fmt-revaluation', topicId: T, conceptId: 'adm-formats', difficulty: 'easy',
  generate: (rng) => revaluationAccount(rng, false),
  verify: revaluationHolds,
});

const fmtRevaluationWorked = accountTemplate({
  id: 'adm-fmt-revaluation-worked', topicId: T, conceptId: 'adm-formats', difficulty: 'medium',
  generate: (rng) => revaluationAccount(rng, true),
  verify: revaluationHolds,
});

// ---------------------------------------------------------------------------------------------------------------
// Formats 3 and 4: the partners' capital accounts in columns, a column for each old partner and one for the new.
// The rows are the postings of the entries of the admission to the capital accounts.
// ---------------------------------------------------------------------------------------------------------------

/** In the capital accounts Revaluation A/c says what it brings: a profit on the credit side, a loss on the debit side. */
export const revaluationRow = (profit: boolean): string => `Revaluation A/c (${profit ? 'profit' : 'loss'})`;
/** The plain name is as right as the one that says profit or loss: the side already says which it is. */
export const plainRevaluation = (rows: FormatRowParts[]): FormatRowParts[] => rows.map((r) => (r.label.startsWith('Revaluation A/c (') ? { ...r, also: ['Revaluation A/c'] } : r));
/** A multiple of `unit` rupees between two amounts, and at least one unit. */
const multipleOf = (rng: Rng, unit: number, lo: number, hi: number): number => unit * rng.int(Math.max(1, Math.ceil(lo / unit)), Math.max(1, Math.ceil(lo / unit), Math.floor(hi / unit)));

/**
 * What the data of a capital-accounts format says, read line by line as a student reads it, for `verify`: the old
 * capitals, what the old partners share in the old ratio (reserves, accumulated balances, goodwill written off and
 * the result of revaluation, each with its sign), the premium, the capital brought in and the part of the premium
 * left in the firm.
 */
function readAdmission(data: string): { d: NonNullable<ReturnType<typeof readDeal>>; caps: number[]; shared: number; premium: number; capital: number; left: number } | null {
  const lines = data.split('\n');
  const d = readDeal(lines[0]);
  if (!d) return null;
  let caps: number[] = [];
  let shared = 0;
  let goodwill: number | null = null;
  let premium = 0;
  let capital = 0;
  let left = 1;
  for (const line of lines.slice(1)) {
    const a = amountsIn(line);
    const change = /^\([a-h]\) /.test(line) ? readChange(line.slice(4)) : NaN;
    if (/^Capitals on that date/.test(line)) caps = a;
    else if (/^General Reserve|credit balance/.test(line)) shared += a[0];
    else if (/debit balance|^Advertisement Suspense|^Goodwill appears in the books/.test(line)) shared -= a[0];
    else if (/shows a (?:profit|loss) of/.test(line)) shared += /shows a profit/.test(line) ? a[0] : -a[0];
    else if (!Number.isNaN(change)) shared += change;
    if (/goodwill of the firm is valued at/.test(line)) goodwill = a[0];
    const brought = /brings ₹([\d,]+) as capital/.exec(line);
    if (brought) {
      capital = rupeesIn(brought);
      premium = rupeesIn(/and ₹([\d,]+) as premium/.exec(line));
    }
    if (/withdraws? half of the premium/.test(line)) left = 0.5;
  }
  return { d, caps, shared, premium: goodwill === null ? premium : goodwill * d.share, capital, left };
}

// Format 3 (medium): reserves, the result of revaluation, goodwill in the books written off, the premium shared (and
// in some seeds half of it withdrawn) and the capital brought in.
const fmtCapitals = accountTemplate({
  id: 'adm-fmt-capitals', topicId: T, conceptId: 'adm-formats', difficulty: 'medium',
  generate: (rng) => {
    const m = rng.pick([2, 2, 3]);
    const valued = rng.int(0, 1) === 0;
    const half = rng.int(0, 2) === 0;
    const made = attempt(6, () => {
      const d = dealWhere(rng, ['old', 'equal', 'stated', 'stated', 'one'], tidySac, m);
      if (!d) return null;
      const cut = half ? fr(1, 2) : ONE;
      const base = valued ? amountFor(rng, 60000, 600000, d.given.map((g) => times(g, cut))) : amountFor(rng, ...premiumRange(d), d.parts.map((p) => times(p, cut)));
      return base === null ? null : { d, base };
    });
    if (!made) return null;
    const { d, base } = made;
    const premium = valued ? of(base, d.share) : base;
    const credits = d.olds.map((_, i) => (valued ? of(base, d.given[i]) : of(base, d.parts[i])));
    const out = credits.map((c) => (half ? c / 2 : 0));
    if (premium < 10000 || ![premium, ...credits, ...out].every(Number.isInteger)) return null;
    const unit = sum(d.old) * 1000;
    const caps = d.olds.map(() => rng.step(150000, 600000, 10000));
    const reserve = multipleOf(rng, unit, 20000, 120000);
    const other = rng.pick([null, null, HELD[1], HELD[2], HELD[3]]);
    const otherAmount = multipleOf(rng, unit, 10000, 40000);
    const existing = rng.int(0, 2) > 0 ? multipleOf(rng, unit, 20000, 90000) : 0;
    const profit = rng.int(0, 2) > 0;
    const result = multipleOf(rng, unit, 10000, 80000);
    // A capital of about the size the new partner's share calls for beside the capitals of the old partners.
    const fair = (sum(caps) * d.share[0]) / (d.share[1] - d.share[0]);
    const capital = Math.max(60000, Math.round((fair * rng.int(80, 125)) / 100 / 20000) * 20000, Math.ceil((premium * 1.5) / 20000) * 20000);
    const day = `1 April ${d.year}`;
    const ids = d.names.map(partnerCapital);
    const inOld = (x: number): number[] => d.oldShares.map((s) => of(x, s));
    const toOld = (account: string, x: number): DatedEntry => ({ date: day, lines: [Dr(account, x), ...inOld(x).map((p, i) => Cr(ids[i], p))] });
    const fromOld = (account: string, x: number): DatedEntry => ({ date: day, lines: [...inOld(x).map((p, i) => Dr(ids[i], p)), Cr(account, x)] });
    const entries: DatedEntry[] = [
      toOld('generalReserve', reserve),
      ...(other ? [other.credit ? toOld(other.account, otherAmount) : fromOld(other.account, otherAmount)] : []),
      ...(existing > 0 ? [fromOld('goodwill', existing)] : []),
      profit ? toOld('revaluation', result) : fromOld('revaluation', result),
      { date: day, lines: [Dr('bank', capital + premium), Cr(ids[m], capital), Cr('premiumForGoodwill', premium)] },
      { date: day, lines: entry(Dr('premiumForGoodwill', premium), ...credits.map((c, i) => Cr(ids[i], c))) },
      ...(half ? [{ date: day, lines: entry(...out.map((o, i) => Dr(ids[i], o)), Cr('bank', sum(out))) }] : []),
    ];
    const view = columnarAccount(entries, ids, { date: day, balances: [...caps.map((c) => ({ side: 'Cr' as const, amount: rupees(c) })), null] }, (id) =>
      id === 'revaluation' ? revaluationRow(profit) : columnLabel(id),
    );
    const sides = columnarSides(view, { closeOn: day });
    const closing = view.balances.map((b) => (b ? b.amount / 100 : 0));
    const givers = giversOf(d);
    return {
      task: `Prepare the capital accounts of the partners in columns as on ${day}, after ${d.nw}'s admission, and carry the balances down.`,
      data: [
        `${d.open} ${d.admit} ${d.how}`,
        'The capital accounts are fluctuating.',
        `Capitals on that date: ${d.olds.map((n, i) => `${n} ${inr(caps[i])}`).join('; ')}.`,
        `${HELD[0].line(inr(reserve))}.`,
        ...(other ? [`${other.line(inr(otherAmount))}.`] : []),
        ...(existing > 0 ? [`Goodwill appears in the books at ${inr(existing)}.`] : []),
        `The Revaluation Account prepared on the admission shows a ${profit ? 'profit' : 'loss'} of ${inr(result)}.`,
        valued
          ? `The goodwill of the firm is valued at ${inr(base)}. ${d.nw} brings ${inr(capital)} as capital and ${d.nw}'s share of the goodwill as premium, by cheque.`
          : `${d.nw} brings ${inr(capital)} as capital and ${inr(premium)} as premium for goodwill, by cheque.`,
        half
          ? givers.length === 1
            ? `${givers[0]} withdraws half of the premium credited to ${givers[0]}, by cheque.`
            : `${list(givers)} withdraw half of the premium credited to them, by cheque.`
          : 'The premium is kept in the business.',
      ].join('\n'),
      title: "Partners' Capital Accounts",
      columns: partnerColumns(d.names),
      left: { ...sides.left, rows: plainRevaluation(sides.left.rows) },
      right: { ...sides.right, rows: plainRevaluation(sides.right.rows) },
      // Revaluation under the wrong name, goodwill raised in the books, and accounts that have no place here.
      distractors: [revaluationRow(!profit), 'Goodwill A/c', 'Current A/c', 'Cash A/c', 'Profit and Loss Appropriation A/c', 'Drawings A/c'],
      explanation: [
        'Each partner has a column. A capital has a credit balance, so the capitals of the old partners open on the credit side as Balance b/d.',
        `The General Reserve of ${inr(reserve)} goes to the old partners in the old ratio ${rs(d.old)}: ${eachGets(d.olds, inOld(reserve))}, on the credit side.`,
        ...(other
          ? [
              other.credit
                ? `The credit balance of Profit and Loss A/c, ${inr(otherAmount)}, is undistributed profit of the old partners: ${eachGets(d.olds, inOld(otherAmount))}, on the credit side.`
                : `${other.name} A/c, ${inr(otherAmount)}, is a loss of the time before the admission: the old partners bear it in the old ratio, ${eachGets(d.olds, inOld(otherAmount))}, on the debit side.`,
            ]
          : []),
        ...(existing > 0 ? [`Goodwill of ${inr(existing)} in the books is written off by the old partners in the old ratio: ${eachGets(d.olds, inOld(existing))}, on the debit side.`] : []),
        `The ${profit ? 'profit' : 'loss'} on revaluation of ${inr(result)} belongs to the old partners in the old ratio: ${eachGets(d.olds, inOld(result))}, on the ${profit ? 'credit' : 'debit'} side.`,
        `${valued ? `${d.nw}'s premium = ${inr(base)} x ${fs(d.share)} = ${inr(premium)}. ` : ''}${givesSteps(d)[0]} ${sacStep(d)}`,
        `The premium reaches the capital accounts through Premium for Goodwill A/c: ${eachGets(d.olds, credits)}, on the credit side. ${d.nw}'s column gets none of it.`,
        `${d.nw}'s capital of ${inr(capital)} is credited in ${d.nw}'s column: By Bank A/c.`,
        ...(half ? [`Half of the premium credited is withdrawn: ${eachGets(d.olds, out)}, on the debit side as To Bank A/c.`] : []),
        `The balance of each column is carried down on the debit side: ${d.names.map((n, c) => `${n} ${inr(closing[c])}`).join('; ')}.`,
      ],
      hints: H.newFirm,
    };
  },
  // Each closing balance, from the data alone: the old capital, the partner's share of what the old partners share,
  // and the part of the premium that stays.
  verify: (q) => {
    const k = readAdmission(q.data);
    const closing = q.sides[0].rows.find((r) => r.closing);
    if (!k || !closing || k.caps.length !== k.d.olds.length || k.capital <= 0 || k.premium <= 0) return false;
    const expected = [...k.d.olds.map((_, i) => k.caps[i] + k.shared * k.d.shares[i] + ((k.premium * k.d.given[i]) / k.d.share) * k.left), k.capital];
    return closing.amounts.length === expected.length && expected.every((x, c) => near(closing.amounts[c] / 100, x));
  },
});

// Format 4 (complex): the same accounts carried one step further. The capitals of the old partners are brought to the
// new ratio on the basis of the new partner's capital, in cash or through the current accounts as the data says.
const fmtCapitalsAdjusted = accountTemplate({
  id: 'adm-fmt-capitals-adjusted', topicId: T, conceptId: 'adm-formats', difficulty: 'complex',
  generate: (rng) => {
    const made = attempt(8, () => {
      const d = dealWhere(rng, ['old', 'equal', 'stated', 'stated'], (x) => tidySac(x) && sum(x.newRatio) <= 40);
      if (!d) return null;
      const capital = baseCapital(rng, d);
      const goodwill = amountFor(rng, 60000, 600000, d.given);
      return capital === null || goodwill === null ? null : { d, capital, goodwill };
    });
    if (!made) return null;
    const { d, capital, goodwill } = made;
    const byCheque = rng.int(0, 2) > 0;
    const unit = sum(d.old) * 1000;
    const reserve = multipleOf(rng, unit, 20000, 100000);
    const existing = rng.int(0, 2) === 0 ? multipleOf(rng, unit, 20000, 80000) : 0;
    const changes = drawChanges(rng, { count: rng.pick([2, 2, 3]), worked: false, lean: rng.pick(['profit', 'profit', 'loss']), unit, before: false });
    if (!changes) return null;
    const result = sum(changes.map((c) => c.effect));
    const profit = result > 0;
    const premium = of(goodwill, d.share);
    const credits = d.given.map((g) => of(goodwill, g));
    const required = d.olds.map((_, i) => of(capital, over(d.news[i], d.share)));
    const inOld = (x: number): number[] => d.oldShares.map((s) => of(x, s));
    const signed = (amounts: number[], up: boolean): number[] => amounts.map((a) => (up ? a : -a));
    const moves = [
      { what: 'General Reserve', amounts: inOld(reserve) },
      ...(existing > 0 ? [{ what: 'goodwill written off', amounts: signed(inOld(existing), false) }] : []),
      { what: `${profit ? 'profit' : 'loss'} on revaluation`, amounts: signed(inOld(Math.abs(result)), profit) },
      { what: 'premium for goodwill', amounts: credits },
    ];
    const moved = d.olds.map((_, i) => sum(moves.map((m) => m.amounts[i])));
    // Round capitals near what the new ratio requires: what adjusts them is modest, and its direction changes with the seed.
    const start = d.olds.map((_, i) => Math.round((required[i] - moved[i] - rng.step(5000, 40000, 5000) * (rng.int(0, 1) === 0 ? 1 : -1)) / 10000) * 10000);
    const before = start.map((c, i) => c + moved[i]);
    const gaps = required.map((r, i) => r - before[i]);
    if (![premium, ...credits, ...required, ...moved].every(Number.isInteger)) return null;
    // A capital is not adjusted by a trifle: at least ₹5,000 moves for each old partner.
    if (start.some((c) => c < 60000) || gaps.some((g) => Math.abs(g) < 5000)) return null;
    const day = `1 April ${d.year}`;
    const ids = d.names.map(partnerCapital);
    const toOld = (account: string, x: number): DatedEntry => ({ date: day, lines: [Dr(account, x), ...inOld(x).map((p, i) => Cr(ids[i], p))] });
    const fromOld = (account: string, x: number): DatedEntry => ({ date: day, lines: [...inOld(x).map((p, i) => Dr(ids[i], p)), Cr(account, x)] });
    const first: DatedEntry[] = [
      toOld('generalReserve', reserve),
      ...(existing > 0 ? [fromOld('goodwill', existing)] : []),
      profit ? toOld('revaluation', result) : fromOld('revaluation', -result),
      { date: day, lines: [Dr('bank', capital + premium), Cr(ids[2], capital), Cr('premiumForGoodwill', premium)] },
      { date: day, lines: entry(Dr('premiumForGoodwill', premium), ...credits.map((c, i) => Cr(ids[i], c))) },
    ];
    // What brings each capital to the figure required: cash, or a transfer to or from the partner's current account.
    const against = (i: number): string => (byCheque ? 'bank' : partnerCurrent(d.olds[i]));
    const second: DatedEntry[] = gaps.map((g, i) => ({ date: day, lines: g > 0 ? [Dr(against(i), g), Cr(ids[i], g)] : [Dr(ids[i], -g), Cr(against(i), -g)] }));
    const labelOf = (id: string): string => (id === 'revaluation' ? revaluationRow(profit) : columnLabel(id));
    const opening = { date: day, balances: [...start.map((c) => ({ side: 'Cr' as const, amount: rupees(c) })), null] };
    const whole = columnarAccount([...first, ...second], ids, opening, labelOf);
    if (whole.balances.some((b, c) => !b || b.side !== 'Cr' || b.amount !== rupees(c < 2 ? required[c] : capital))) throw new Error('admission: the adjusted capitals are not in the new ratio');
    // The adjustment stands in rows of its own, after the rows of the admission, as the task asks.
    const admitted = columnarAccount(first, ids, opening, labelOf);
    const adjusting = columnarAccount(second, ids, null, labelOf);
    const view: ColumnarView = { ...whole, debit: [...admitted.debit, ...adjusting.debit], credit: [...admitted.credit, ...adjusting.credit] };
    const sides = columnarSides(view, { closeOn: day });
    const total = of(capital, over(ONE, d.share));
    const how = byCheque ? 'Bank' : 'Current';
    return {
      task: `Prepare the capital accounts of the partners in columns as on ${day}, after ${d.nw}'s admission and the adjustment of the capitals; enter what adjusts a capital in a row of its own.`,
      data: [
        `${d.open} ${d.admit} ${d.how}`,
        'The capital accounts are fluctuating.',
        `Capitals on that date: ${d.olds.map((n, i) => `${n} ${inr(start[i])}`).join('; ')}.`,
        `${HELD[0].line(inr(reserve))}.`,
        ...(existing > 0 ? [`Goodwill appears in the books at ${inr(existing)}.`] : []),
        'On the revaluation of the assets and liabilities:',
        lettered(changes.map((c) => c.text)),
        `The goodwill of the firm is valued at ${inr(goodwill)}. ${d.nw} brings ${inr(capital)} as capital and ${d.nw}'s share of the goodwill as premium, by cheque; the premium is kept in the business.`,
        `The capitals of ${list(d.olds)} are then to be adjusted to the new profit-sharing ratio on the basis of ${d.nw}'s capital: ${
          byCheque
            ? 'a shortfall is brought in and an excess withdrawn, by cheque.'
            : "no cash is to move, so a current account is opened for each of them, and a shortfall or an excess of capital is transferred to the partner's current account."
        }`,
      ].join('\n'),
      title: "Partners' Capital Accounts",
      columns: partnerColumns(d.names),
      left: { ...sides.left, rows: plainRevaluation(sides.left.rows) },
      right: { ...sides.right, rows: plainRevaluation(sides.right.rows) },
      // Revaluation under the wrong name, goodwill raised in the books, and the other way of adjusting a capital.
      distractors: [revaluationRow(!profit), 'Goodwill A/c', byCheque ? 'Current A/c' : 'Cash A/c', 'Drawings A/c', 'Profit and Loss Appropriation A/c'],
      explanation: [
        'Each partner has a column. The capitals of the old partners open on the credit side as Balance b/d.',
        `The General Reserve of ${inr(reserve)} goes to the old partners in the old ratio ${rs(d.old)}: ${eachGets(d.olds, inOld(reserve))}, on the credit side.`,
        ...(existing > 0 ? [`Goodwill of ${inr(existing)} in the books is written off by the old partners in the old ratio: ${eachGets(d.olds, inOld(existing))}, on the debit side.`] : []),
        `${resultStep(changes.map((c) => c.effect))} It belongs to the old partners in the old ratio: ${eachGets(d.olds, inOld(Math.abs(result)))}, on the ${profit ? 'credit' : 'debit'} side.`,
        `${d.nw}'s premium = ${inr(goodwill)} x ${fs(d.share)} = ${inr(premium)}. ${givesSteps(d)[0]} ${sacStep(d)} Credited through Premium for Goodwill A/c: ${eachGets(d.olds, credits)}.`,
        `${d.nw}'s capital of ${inr(capital)} is credited in ${d.nw}'s column: By Bank A/c.`,
        newShareSteps(d).join(' '),
        `${d.nw}'s ${inr(capital)} stands for ${fs(d.share)} of the firm, so the total capital = ${inr(capital)} x ${d.share[1]}/${d.share[0]} = ${inr(total)}. Capital required: ${d.olds.map((n, i) => `${n} ${inr(total)} x ${fs(d.news[i])} = ${inr(required[i])}`).join('; ')}.`,
        ...d.olds.map((n, i) =>
          gaps[i] > 0
            ? `${n}'s capital so far = ${movedText(start[i], moves, i)} = ${inr(before[i])}: short by ${inr(gaps[i])}, which is ${byCheque ? 'brought in' : "made up from the partner's current account (Current A/c Dr; To Capital A/c)"}: By ${how} A/c.`
            : `${n}'s capital so far = ${movedText(start[i], moves, i)} = ${inr(before[i])}: in excess by ${inr(-gaps[i])}, which is ${byCheque ? 'withdrawn' : "moved to the partner's current account (Capital A/c Dr; To Current A/c)"}: To ${how} A/c.`,
        ),
        `The balances carried down are in the new ratio ${rs(d.newRatio)}: ${d.names.map((n, c) => `${n} ${inr(c < 2 ? required[c] : capital)}`).join('; ')}.`,
      ],
      hints: H.capitals,
    };
  },
  // From the data alone: each capital ends at its share of the total the new partner's capital fixes, and what
  // adjusts it is that figure less the capital after the reserve, the revaluation, the goodwill and the premium.
  verify: (q) => {
    const k = readAdmission(q.data);
    const closing = q.sides[0].rows.find((r) => r.closing);
    if (!k || !closing || k.caps.length !== 2 || k.capital <= 0 || k.premium <= 0) return false;
    const required = k.d.olds.map((_, i) => (k.capital / k.d.share) * (k.d.shares[i] - k.d.given[i]));
    const before = k.caps.map((c, i) => c + k.shared * k.d.shares[i] + (k.premium * k.d.given[i]) / k.d.share);
    const label = /transferred to the partner's current account/.test(q.data) ? 'Current A/c' : 'Bank A/c';
    const adjusted = (i: number): number => sum(q.sides.map((s, side) => (side === 0 ? -1 : 1) * sum(s.rows.filter((r) => r.label === label).map((r) => r.amounts[i])))) / 100;
    return [...required, k.capital].every((x, c) => near(closing.amounts[c] / 100, x)) && required.every((x, i) => near(adjusted(i), x - before[i]));
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Format 5 (complex): the balance sheet of the new firm. The old balance sheet opens the books, every adjustment of
// the admission is posted as an entry, and each row is a balance of those books: the two sides agree because every
// entry does. `verify` works the capitals and the total out again by formula, without the books.
// ---------------------------------------------------------------------------------------------------------------

/** What `verify` expects of a balance sheet: each partner's capital and the total of a side, in rupees. */
const sheetKept = keepFor<{ capitals: number[]; total: number; currents?: number[] }>();

// The same balance sheet with fixed capitals (adm-fmt-balance-sheet-fixed, added after the audit) comes from this
// function with `fixed`: the old partners' funds are a fixed capital and a current account, everything the old
// partners share goes to the current accounts, the new partner's capital to the Capital A/c, and a current account
// left in debit stands among the assets. With `fixed` false nothing is drawn or written otherwise.
function admissionSheet(rng: Rng, fixed: boolean): AccountParts | null {
    const made = attempt(8, () => {
      const d = dealWhere(rng, ['old', 'equal', 'stated', 'stated'], tidySac);
      if (!d) return null;
      const goodwill = amountFor(rng, 60000, 600000, d.given);
      return goodwill === null ? null : { d, goodwill };
    });
    if (!made) return null;
    const { d, goodwill } = made;
    const unit = sum(d.old) * 1000;
    // The old balance sheet: everything but the capitals and the bank balance is drawn; they follow from the rest.
    const building = rng.step(300000, 800000, 50000);
    const machinery = rng.step(100000, 400000, 20000);
    const stock = rng.step(60000, 240000, 10000);
    const rest = rng.step(100000, 300000, 20000);
    const creditors = rng.step(60000, 200000, 10000);
    const reserve = multipleOf(rng, unit, 20000, 100000);
    const existing = rng.int(0, 2) === 0 ? multipleOf(rng, unit, 20000, 80000) : 0;
    const e = rng.int(0, 2) > 0 ? earmarked(rng, unit) : null;
    const investments = e && !e.wcr ? e.book : 0;
    // Three changes on revaluation. The balance sheet gives the book values, so the words give only the new terms.
    const rise = rng.step(20000, 100000, 10000);
    const rate = rng.pick([5, 10, 15, 20]);
    const first: Change = rng.pick<() => Change>([
      () => CH.up('building', rise),
      () => ({ ...CH.revalued('building', building, building + rise), text: `Building is revalued at ${inr(building + rise)}.` }),
      () => ({ ...CH.depreciated('machinery', machinery, rate), text: `Machinery is to be depreciated by ${rate}%.` }),
    ])();
    // Stock falls by a fifth of its book value at most.
    const fall = Math.min(rng.step(4000, 30000, 2000), Math.floor(stock / 5 / 2000) * 2000);
    const debtRate = rng.pick([5, 10]);
    const needed = (rest * debtRate) / 100;
    const bad = rng.step(2000, 10000, 1000);
    const gap = rng.step(1000, Math.min(8000, needed - 1000), 1000) * (rng.int(0, 2) === 0 ? -1 : 1);
    // Debtors and the provision as the old balance sheet shows them, and what is to be done about them.
    const debts = rng.pick([
      null,
      { debtors: rest, provision: 0, bad: 0, text: `A provision for doubtful debts of ${debtRate}% is to be made on debtors.` },
      { debtors: rest + bad, provision: 0, bad, text: `Bad debts of ${inr(bad)} are to be written off, and a provision for doubtful debts of ${debtRate}% is to be made on the remaining debtors.` },
      { debtors: rest, provision: needed - gap, bad: 0, text: `The provision for doubtful debts is to be kept at ${debtRate}% of debtors.` },
      { debtors: rest + bad, provision: needed - gap + bad, bad, text: `Bad debts of ${inr(bad)} are to be written off against the provision for doubtful debts, which is then to be kept at ${debtRate}% of the remaining debtors.` },
    ]);
    const second: Change | null = debts
      ? ((c) => (c ? { ...c, text: debts.text } : null))(CH.provision(debts.debtors, debts.provision, debts.bad, debtRate))
      : { ...CH.revalued('stock', stock, stock - fall), text: `Stock is to be valued at ${inr(stock - fall)}.` };
    if (!second) return null;
    const debtors = debts ? debts.debtors : rest;
    const provision = debts ? debts.provision : 0;
    // The third is a liability, not in the books or no longer payable: a plain figure, moved up a thousand at a time
    // until the result of the revaluation divides among the old partners in whole thousands.
    const owedKind = rng.pick(OWED_KINDS);
    const makeThird = rng.pick<(x: number) => Change>([(x) => CH.owed(owedKind, x), (x) => CH.back(x)]);
    const sign = Math.sign(makeThird(1000).effect);
    const partial = first.effect + second.effect - (e ? e.shortfall : 0);
    if (partial % 1000 !== 0) return null;
    let x = rng.step(4000, 20000, 1000);
    while ((((partial + sign * x) % unit) + unit) % unit !== 0) x += 1000;
    if (partial + sign * x === 0) x += unit;
    // No more than a third of the creditors is written back.
    if (sign > 0 && x * 3 > creditors) return null;
    const third = makeThird(x);
    const changes = rng.shuffle([first, second, third]);
    const result = partial + third.effect;
    const premium = of(goodwill, d.share);
    const credits = d.given.map((g) => of(goodwill, g));
    if (![premium, ...credits].every(Number.isInteger)) return null;
    // The capitals of the old partners are round figures that leave a believable balance at the bank.
    const otherAssets = debtors - provision + stock + investments + machinery + building + existing;
    const otherLiabilities = creditors + reserve + (e ? e.reserve : 0);
    const needed2 = otherAssets + rng.step(30000, 120000, 5000) - otherLiabilities;
    const capA = Math.round((needed2 * rng.int(40, 62)) / 100 / 10000) * 10000;
    const caps = [capA, Math.round((needed2 - capA) / 10000) * 10000];
    const bank = otherLiabilities + sum(caps) - otherAssets;
    if (bank < 20000 || caps.some((c) => c < 100000)) return null;
    // With fixed capitals each old partner's funds are a fixed capital in whole ₹50,000 and the rest in the current
    // account; in a third of the seeds one old partner has overdrawn, and that current account stands in debit among
    // the assets. (Nothing is drawn here unless `fixed`, so adm-fmt-balance-sheet makes what it always made.)
    const overdrawnAt = fixed && rng.int(0, 2) === 0 ? rng.int(0, 1) : -1;
    const fixedCaps = caps.map((c, i) => (!fixed ? c : i === overdrawnAt ? Math.floor(c / 50000) * 50000 + 50000 : Math.floor((c * 0.9) / 50000) * 50000));
    const currents = caps.map((c, i) => c - fixedCaps[i]);
    const overdrawnBefore = sum(currents.filter((c) => c < 0).map((c) => -c));
    const oldTotal = otherAssets + bank + overdrawnBefore;
    const currentLine = (n: string, c: number): JournalLine => (c >= 0 ? Cr(partnerCurrent(n), c) : Dr(partnerCurrent(n), -c));
    const fair = (sum(caps) * d.share[0]) / (d.share[1] - d.share[0]);
    const capital = Math.max(60000, Math.round((fair * rng.int(80, 125)) / 100 / 20000) * 20000, Math.ceil((premium * 1.5) / 20000) * 20000);
    const ids = d.names.map(partnerCapital);
    // Where the old partners' adjustments go: the capital accounts, or with fixed capitals the current accounts.
    const own = d.olds.map((n, i) => (fixed ? partnerCurrent(n) : ids[i]));
    const inOld = (amount: number): number[] => d.oldShares.map((s) => of(amount, s));
    const creditOld = (amount: number): JournalLine[] => inOld(amount).map((p, i) => Cr(own[i], p));
    const debitOld = (amount: number): JournalLine[] => inOld(amount).map((p, i) => Dr(own[i], p));
    const reserveId = e ? (e.wcr ? 'workmenCompensationReserve' : 'investmentFluctuationReserve') : 'generalReserve';
    const opening = entry(
      Dr('bank', bank), Dr('debtors', debtors), Dr('stock', stock), Dr('investments', investments), Dr('machinery', machinery), Dr('building', building), Dr('goodwill', existing),
      Cr('creditors', creditors), Cr(PDD, provision), Cr('generalReserve', reserve), Cr(reserveId, e ? e.reserve : 0), Cr(ids[0], fixedCaps[0]), Cr(ids[1], fixedCaps[1]),
      currentLine(d.olds[0], currents[0]), currentLine(d.olds[1], currents[1]),
    );
    const passed: JournalLine[][] = [
      [Dr('generalReserve', reserve), ...creditOld(reserve)],
      ...(e ? [earmarkedLines(e, creditOld)] : []),
      ...(existing > 0 ? [[...debitOld(existing), Cr('goodwill', existing)]] : []),
      ...changes.flatMap((c) => [...(c.before ? [c.before] : []), c.lines]),
    ];
    // What the entries so far leave in Revaluation A/c is its result; it must be what the changes add up to.
    const left = -(post(passed).get('revaluation') ?? 0) / 100;
    if (left !== result || !inOld(Math.abs(result)).every(Number.isInteger)) throw new Error('admission: the result of the revaluation does not follow from its changes');
    passed.push(
      result > 0 ? [Dr('revaluation', result), ...creditOld(result)] : [...debitOld(-result), Cr('revaluation', -result)],
      [Dr('bank', capital + premium), Cr(ids[2], capital), Cr('premiumForGoodwill', premium)],
      entry(Dr('premiumForGoodwill', premium), ...credits.map((c, i) => Cr(own[i], c))),
    );
    const books = new Map(trialBalance(post(passed, post([opening]))).rows.map((r) => [r.accountId, r]));
    // A current account closed off at nil would be a row that is not there: such a seed is drawn again.
    if (fixed && d.olds.some((n) => !books.has(partnerCurrent(n)))) return null;
    const currentNames: [string, string][] = fixed ? d.olds.map((n): [string, string] => [partnerCurrent(n), `${n}'s Current A/c`]) : [];
    const isCurrent = (id: string): boolean => currentNames.some(([c]) => c === id);
    const owedName = `Outstanding ${owedKind.charAt(0).toUpperCase()}${owedKind.slice(1)}`;
    const liabilityNames: [string, string][] = [
      ['creditors', 'Creditors'], ['outstandingExpenses', 'Outstanding Expenses'], ['workmenCompensationClaim', 'Workmen Compensation Claim'],
      ...d.names.map((n, i): [string, string] => [ids[i], `${n}'s Capital`]),
      ...currentNames,
    ];
    const assetNames: [string, string][] = [['bank', 'Cash at Bank'], ['debtors', 'Debtors'], ['stock', 'Stock'], ['investments', 'Investments'], ['machinery', 'Machinery'], ['building', 'Building'], ...currentNames];
    // Every balance left in the books has its place in the balance sheet; the provision stands inside the debtors.
    const placed = new Set([...liabilityNames, ...assetNames].map(([id]) => id).concat(PDD));
    for (const [id, b] of books) {
      if (!placed.has(id) || (!isCurrent(id) && (b.side === 'Dr') !== assetNames.some(([a]) => a === id))) throw new Error(`admission: ${id} has no place in the balance sheet`);
    }
    const provisionNow = books.get(PDD)?.amount ?? 0;
    const liabilities: FormatRowParts[] = liabilityNames.flatMap(([id, label]) => {
      const b = books.get(id);
      if (!b || (isCurrent(id) && b.side === 'Dr')) return [];
      // The only outstanding expense in these books is the one term (owedKind) names, so the row carries that name;
      // the general name is as right.
      return [id === 'outstandingExpenses' ? { label: owedName, amount: b.amount, also: [label] } : { label, amount: b.amount }];
    });
    const assets: FormatRowParts[] = assetNames.flatMap(([id, label]) => {
      const b = books.get(id);
      if (!b || (isCurrent(id) && b.side === 'Cr')) return [];
      if (id !== 'debtors' || provisionNow === 0) return [{ label, amount: b.amount }];
      return [{ label, amount: b.amount - provisionNow, details: [`Debtors ${formatINR(b.amount)}`, `Less: Provision for doubtful debts ${formatINR(provisionNow)}`] }];
    });
    const signed = (amounts: number[], up: boolean): number[] => amounts.map((a) => (up ? a : -a));
    const moves = [
      { what: 'General Reserve', amounts: inOld(reserve) },
      ...(e && e.surplus > 0 ? [{ what: e.name, amounts: inOld(e.surplus) }] : []),
      ...(existing > 0 ? [{ what: 'goodwill written off', amounts: signed(inOld(existing), false) }] : []),
      { what: `${result > 0 ? 'profit' : 'loss'} on revaluation`, amounts: signed(inOld(Math.abs(result)), result > 0) },
      { what: 'premium for goodwill', amounts: credits },
    ];
    const capitals = fixed ? [...fixedCaps, capital] : [...caps.map((c, i) => c + sum(moves.map((m) => m.amounts[i]))), capital];
    const currentsAfter = currents.map((c, i) => c + sum(moves.map((m) => m.amounts[i])));
    // The total by formula: what changes the assets, and nothing that only moves between the liabilities and the
    // capitals; with fixed capitals a current account in debit stands among the assets and adds to both sides.
    const overdrawn = fixed ? sum(currentsAfter.filter((c) => c < 0).map((c) => -c)) : 0;
    const total = oldTotal - overdrawnBefore - existing + first.effect + second.effect - (e && !e.wcr ? e.against : 0) + capital + premium + overdrawn;
    const day = `1 April ${d.year}`;
    const line = (name: string, amount: number): string => `${name}: ${inr(amount)}`;
    const terms = [
      `${d.nw} brings ${inr(capital)} as capital and ${d.nw}'s share of goodwill as premium, by cheque; the goodwill of the firm is valued at ${inr(goodwill)}, and the premium is kept in the business.`,
      ...changes.map((c) => c.text),
      ...(e
        ? [
            e.wcr
              ? e.against > 0
                ? `A claim of ${inr(e.against)} for workmen's compensation is to be provided for.`
                : "There is no claim for workmen's compensation."
              : e.against > 0
                ? `The market value of the investments is ${inr(e.book - e.against)}.`
                : 'The investments are worth their book value.',
          ]
        : []),
      ...(existing > 0 ? ['Goodwill is not to appear in the books of the new firm.'] : []),
    ];
    const data = [
      `${d.open} ${d.admit} ${d.how}`,
      fixed
        ? `The capitals are fixed: what the old partners share on the admission goes to their current accounts, and ${d.nw}'s capital to ${d.nw}'s Capital A/c. The balance sheet of ${list(d.olds)} as at 31 March ${d.year} was:`
        : `The capital accounts are fluctuating. The balance sheet of ${list(d.olds)} as at 31 March ${d.year} was:`,
      'Liabilities',
      line('Creditors', creditors),
      line('General Reserve', reserve),
      ...(e ? [line(e.name, e.reserve)] : []),
      ...d.olds.map((n, i) => line(`${n}'s Capital`, fixedCaps[i])),
      ...(fixed ? d.olds.flatMap((n, i) => (currents[i] >= 0 ? [line(`${n}'s Current A/c`, currents[i])] : [])) : []),
      'Assets',
      line('Cash at Bank', bank),
      provision > 0 ? `Debtors: ${inr(debtors)}, less Provision for Doubtful Debts ${inr(provision)}` : `Debtors: ${inr(debtors)} (there is no provision for doubtful debts)`,
      line('Stock', stock),
      ...(investments > 0 ? [line('Investments', investments)] : []),
      line('Machinery', machinery),
      line('Building', building),
      ...(existing > 0 ? [line('Goodwill', existing)] : []),
      ...(fixed ? d.olds.flatMap((n, i) => (currents[i] < 0 ? [line(`${n}'s Current A/c (debit balance)`, -currents[i])] : [])) : []),
      `Each side of it totals ${inr(oldTotal)}.`,
      'The terms of the admission:',
      lettered(terms),
    ].join('\n');
    sheetKept.keep(data, { capitals, total, ...(fixed ? { currents: currentsAfter } : {}) });
    const revaluationSteps = [...changes.map((c) => c.effect), ...(e && e.shortfall > 0 ? [-e.shortfall] : [])];
    return {
      task: `Prepare the Balance Sheet of the new firm as at ${day}, after ${d.nw}'s admission; show debtors at their net figure${fixed ? ' and each current account on the side its balance belongs to' : ''}.`,
      data,
      title: `Balance Sheet of ${list(d.names)} as at ${day}`,
      left: { title: 'Liabilities', rows: liabilities },
      right: { title: 'Assets', rows: assets },
      // What has been shared out or written off and so has left the balance sheet, and what stands inside another row.
      // The result of the revaluation is offered under both names, so that the list does not say which it is.
      distractors: ['General Reserve', ...(e ? [e.name] : []), 'Goodwill', 'Premium for Goodwill', 'Provision for Doubtful Debts', 'Profit on Revaluation', 'Loss on Revaluation'],
      explanation: [
        `The General Reserve of ${inr(reserve)} goes to the old partners in the old ratio ${rs(d.old)} (${eachGets(d.olds, inOld(reserve))}) and leaves the balance sheet.`,
        ...changes.map((c, k) => `(${LETTERS[k + 1]}) ${c.steps.join(' ')}`),
        ...(e ? [`(${LETTERS[changes.length + 1]}) ${earmarkedSteps(e, eachGets(d.olds, inOld(e.surplus)), fixed ? 'Current' : 'Capital').join(' ')}`] : []),
        ...(existing > 0 ? [`Goodwill of ${inr(existing)} is written off by the old partners in the old ratio (${eachGets(d.olds, inOld(existing))}) and leaves the assets.`] : []),
        `${e && e.shortfall > 0 ? `Revaluation A/c also bears the ${inr(e.shortfall)} that the ${e.name} could not meet. ` : ''}${resultStep(revaluationSteps)} It goes to the old partners in the old ratio: ${eachGets(d.olds, inOld(Math.abs(result)))}.`,
        `${d.nw}'s premium = ${inr(goodwill)} x ${fs(d.share)} = ${inr(premium)}. ${givesSteps(d)[0]} ${sacStep(d)} Credited: ${eachGets(d.olds, credits)}. Neither Premium for Goodwill nor Goodwill is a row of the new balance sheet.`,
        ...(fixed
          ? [
              ...d.olds.map((n, i) => `${n}'s Current A/c = ${currents[i] >= 0 ? movedText(currents[i], moves, i) : `- ${inr(-currents[i])} (debit balance)${movedText(0, moves, i).slice(inr(0).length)}`} = ${inr(Math.abs(currentsAfter[i]))} ${currentsAfter[i] >= 0 ? '(Cr), among the liabilities' : '(Dr), among the assets'}.`),
              `The fixed capitals do not move: ${d.olds.map((n, i) => `${n} ${inr(fixedCaps[i])}`).join(', ')}.`,
            ]
          : d.olds.map((n, i) => `${n}'s Capital = ${movedText(caps[i], moves, i)} = ${inr(capitals[i])}.`)),
        `${d.nw}'s Capital = ${inr(capital)}, the capital brought in.`,
        `Cash at Bank = ${inr(bank)} + ${inr(capital)} + ${inr(premium)} = ${inr(bank + capital + premium)}.`,
        ...(provisionNow > 0 ? [`Debtors ${formatINR(books.get('debtors')!.amount)} less the provision of ${formatINR(provisionNow)} = ${formatINR(books.get('debtors')!.amount - provisionNow)}.`] : []),
        `Each side totals ${inr(total)}.`,
      ],
      hints: [
        fixed
          ? 'Take the terms one at a time: does each change an asset, a liability, or an old partner\'s current account? The fixed capitals stay as they are.'
          : 'Take the terms one at a time and ask which rows each one changes: an asset, a liability, or the capitals of the old partners.',
        'Reserves, the result of revaluation and goodwill written off go to the old partners in the old ratio; the premium in the sacrificing ratio. None of them is a row of the new balance sheet.',
      ],
    };
}

const admissionSheetHolds = (q: AccountQuestion): boolean => {
    const k = sheetKept.of(q.data);
    if (!k) return false;
    const [liabilities, assets] = q.sides.map((s) => s.rows);
    const side = (rows: typeof assets): number => sum(rows.map((r) => r.amounts[0])) / 100;
    const capitals = liabilities.filter((r) => /'s Capital$/.test(r.label)).map((r) => r.amounts[0] / 100);
    // With fixed capitals each old partner's current account, on the side its balance belongs to.
    const names = (readDeal(q.data.split('\n')[0])?.olds ?? []);
    const current = (n: string): number => {
      const cr = liabilities.find((r) => r.label === `${n}'s Current A/c`);
      const dr = assets.find((r) => r.label === `${n}'s Current A/c`);
      return cr ? cr.amounts[0] / 100 : dr ? -dr.amounts[0] / 100 : NaN;
    };
    return (
      near(side(assets), k.total) &&
      near(side(liabilities), k.total) &&
      capitals.length === k.capitals.length &&
      k.capitals.every((c, i) => near(capitals[i], c)) &&
      (k.currents === undefined || (names.length === k.currents.length && k.currents.every((c, i) => near(current(names[i]), c))))
    );
};

const fmtBalanceSheet = accountTemplate({
  id: 'adm-fmt-balance-sheet', topicId: T, conceptId: 'adm-formats', difficulty: 'complex',
  generate: (rng) => admissionSheet(rng, false),
  verify: admissionSheetHolds,
});

// adm-fmt-balance-sheet-fixed (added after the audit): the balance sheet after admission with fixed capitals (complex)
const fmtBalanceSheetFixed = accountTemplate({
  id: 'adm-fmt-balance-sheet-fixed', topicId: T, conceptId: 'adm-formats', difficulty: 'complex',
  generate: (rng) => admissionSheet(rng, true),
  verify: admissionSheetHolds,
});

// One-mark Assertion-Reason questions of the board. They stand on their own level and go into no mock paper and no
// Look back (`isAssertionReason`), so nothing that was served before moves.
const admAssertionReason = factsTemplate({
  id: 'adm-assertion-reason', topicId: 'admission-of-a-partner', conceptId: 'adm-sacrifice', difficulty: 'medium',
  facts: assertionReasonFacts([
    {
      answer: 'both',
      assertion: 'A new partner may be asked to bring a premium for goodwill.',
      reason: 'The old partners give up a part of their future profits to the new partner.',
      a: 'The premium is shared by the old partners who sacrifice.',
      r: 'The share of the new partner comes out of the shares of the old partners.',
      link: 'R explains A: the premium compensates them for what they give up.',
    },
    {
      answer: 'both',
      assertion: 'Old partners share profits 3:2 and admit a new partner for a 1/4 share. Nothing is said about how the share is acquired, so their sacrificing ratio is 3:2.',
      reason: 'When the old partners keep their old ratio between themselves, they sacrifice in that ratio.',
      a: 'With nothing said, the old partners are taken to keep their old ratio.',
      r: 'Each gives up in proportion to the old share, so the old ratio is the sacrificing ratio.',
      link: 'R explains A: the 3:2 is read straight from that rule.',
    },
    {
      answer: 'both',
      assertion: 'A profit on revaluation on admission goes to the old partners alone.',
      reason: 'The rise in value came about before the new partner joined.',
      a: 'It is credited to the old partners in the old ratio.',
      r: 'The values are brought up to date for the time before the admission.',
      link: 'R explains A: a gain of the time before admission cannot belong to a partner who was not there.',
    },
    {
      answer: 'both',
      assertion: "A new partner's capital of ₹2,00,000 is for a 1/4 share, and capitals are to follow the shares. The total capital of the new firm is ₹8,00,000.",
      reason: "The new partner's capital stands for the new partner's share, so the total is that capital multiplied by the reciprocal of the share.",
      a: '₹2,00,000 × 4/1 = ₹8,00,000.',
      r: 'If 1/4 is ₹2,00,000, the whole is four times as much.',
      link: 'R explains A: it is the working that gives ₹8,00,000.',
    },
    {
      answer: 'both',
      assertion: 'No entry is passed in the books of the firm when a new partner pays the premium for goodwill privately to the old partners.',
      reason: 'The money does not pass through the firm.',
      a: 'A private payment outside the firm needs no entry.',
      r: 'It goes from the new partner straight to the old partners.',
      link: 'R explains A: the books of the firm record only what happens to the firm.',
    },
    {
      answer: 'bothNot',
      assertion: 'Goodwill already in the books is written off among the old partners in the old ratio on an admission.',
      reason: 'The premium for goodwill is shared by the old partners in the sacrificing ratio.',
      a: "Old Partners' Capital A/cs Dr; To Goodwill A/c.",
      r: 'Those who give up a share get the premium.',
      link: 'R does not explain A: the two are separate adjustments, each with its own ratio.',
    },
    {
      answer: 'bothNot',
      assertion: "Under fixed capitals, an old partner's share of the premium for goodwill is credited to that partner's Current A/c.",
      reason: "Under fixed capitals, the capital brought in by the new partner is credited to the new partner's Capital A/c.",
      a: 'Under fixed capitals, every adjustment other than capital brought in passes through the Current A/cs.',
      r: 'The capital brought in still goes to the Capital A/c.',
      link: 'R does not explain A: R is about the capital brought in and A about the premium, and the first does not decide the second.',
    },
    {
      answer: 'bothNot',
      assertion: 'Naina brings ₹1,00,000 as capital for a 1/5 share. The capitals of all the partners, Naina included, and the reserves total ₹4,20,000. Hidden goodwill is ₹80,000.',
      reason: "The sacrificing partners are credited with the new partner's share of goodwill.",
      a: 'Capitalised value = ₹1,00,000 × 5 = ₹5,00,000, and ₹5,00,000 - ₹4,20,000 = ₹80,000.',
      r: 'They are compensated for the share they give up.',
      link: 'R does not explain A: R says who receives the share of goodwill; the ₹80,000 comes from comparing the capitalised value with the net worth.',
    },
    {
      answer: 'aOnly',
      assertion: "When a new partner brings no goodwill in cash, the share of goodwill is debited to the new partner's Current A/c (or Capital A/c), and no Goodwill A/c is raised.",
      reason: 'AS 26 requires Goodwill A/c to be raised for a share of goodwill that is not brought in cash.',
      a: "New Partner's Current (or Capital) A/c Dr; To Sacrificing Partners' Capital A/cs.",
      r: 'AS 26 allows only purchased goodwill to be recorded, so Goodwill A/c is not raised.',
    },
    {
      answer: 'aOnly',
      assertion: "On the admission of Tara, the share of Uday, an old partner, rises. Uday's Capital A/c is debited with the goodwill on that gain.",
      reason: 'On an admission, only the new partner pays for goodwill.',
      a: 'Every partner who gains pays for the gain, and an old partner pays through the capital account.',
      r: 'An old partner who gains a share pays for it as well.',
    },
    {
      answer: 'rOnly',
      assertion: 'A General Reserve in the books on the date of admission is credited to all the partners, the new partner included, in the new ratio.',
      reason: 'A General Reserve is made up of profits kept back in the past.',
      a: 'It is credited to the old partners alone, in the old ratio.',
      r: 'It was built before the new partner joined.',
    },
    {
      answer: 'rOnly',
      assertion: 'Pia and Rohan share profits 3:2. Sid is admitted for a 1/5 share, taken wholly from Pia. The sacrificing ratio of Pia and Rohan is 3:2.',
      reason: 'The sacrificing ratio shows how the old partners give up the share taken by the new partner.',
      a: 'Pia alone gives up the share, so Rohan sacrifices nothing.',
      r: 'That is what the sacrificing ratio shows, and it is found from each old share and new share.',
    },
  ]),
});

// ===============================================================================================================
// ADDED AFTER THE AUDIT (outside the mock papers, the worksheets and Look back: src/generators/outsidePapers.ts)
// ===============================================================================================================

/**
 * Goodwill valued from the firm's profits inside an admission, the commonest board pattern: at N years' purchase of
 * the average normal profit of three years (one of them with an abnormal item), or of the super profit on the
 * capital employed. The goodwill is chosen first, so that the premium and every sacrificing partner's part of it are
 * whole rupees; the profits are then made to give it.
 */
interface Valuation {
  d: Deal;
  goodwill: number;
  premium: number;
  /** What the prompt says about the valuation, one sentence or two, with no ratio in it. */
  text: string;
  /** The working, one step to a line. */
  steps: string[];
  /** The goodwill a student finds who leaves the abnormal item in, or who multiplies the whole average profit. */
  slip: { goodwill: number; why: string };
  /** The average (or super) profit, before the years' purchase. */
  yearly: number;
}
function valuation(rng: Rng, fixedKinds: readonly DealKind[] = ['old', 'equal', 'stated', 'stated', 'one']): Valuation | null {
  const d = dealWhere(rng, fixedKinds, tidySac);
  if (!d) return null;
  const n = rng.pick([2, 3, 4]);
  const goodwill = amountFor(rng, 150000, 720000, [...d.given, fr(1, n)]);
  if (goodwill === null) return null;
  const yearly = goodwill / n;
  const premium = of(goodwill, d.share);
  const ys = [d.year - 3, d.year - 2, d.year - 1];
  const fy = (y: number): string => `${y - 1}-${String(y % 100).padStart(2, '0')}`;
  if (rng.int(0, 1) === 0) {
    // Average normal profit: three years around it, one of them as the books show it, with an abnormal item.
    const up = 1000 * rng.int(-12, 12);
    const down = 1000 * rng.int(-12, 12);
    const normal = [yearly + up, yearly + down, yearly - up - down];
    const at = rng.int(0, 2);
    const loss = rng.int(0, 1) === 0;
    const x = rng.step(10000, Math.max(10000, Math.min(40000, Math.floor(yearly / 3 / 5000) * 5000)), 5000);
    const shown = normal.map((v, i) => (i === at ? (loss ? v - x : v + x) : v));
    if (shown.some((v) => v <= 0)) return null;
    const item = loss ? `the profit of ${fy(ys[at])} is after an abnormal loss of ${inr(x)} by fire` : `the profit of ${fy(ys[at])} includes an abnormal gain of ${inr(x)} on the sale of a plot of land`;
    return {
      d, goodwill, premium, yearly,
      text: `Goodwill is valued at ${n} years' purchase of the average normal profit of the last three years. The profits of those years were ${inr(shown[0])}, ${inr(shown[1])} and ${inr(shown[2])}; ${item}.`,
      steps: [
        `Normal profit of ${fy(ys[at])} = ${inr(shown[at])} ${loss ? '+' : '-'} ${inr(x)} = ${inr(normal[at])} (the abnormal ${loss ? 'loss added back' : 'gain taken out'}).`,
        `Average normal profit = (${normal.map(inr).join(' + ')}) / 3 = ${inr(yearly)}.`,
        `Goodwill of the firm = ${inr(yearly)} x ${n} = ${inr(goodwill)}.`,
      ],
      slip: { goodwill: (sum(shown) / 3) * n, why: `Averaged the profits as given, without ${loss ? 'adding back the abnormal loss' : 'taking out the abnormal gain'}.` },
    };
  }
  // Super profit: the normal profit on the capital employed at the normal rate, and what is earned above it.
  const r = rng.pick([10, 12, 15, 20]);
  const capital = rng.step(400000, 2000000, 50000);
  const normal = (capital * r) / 100;
  const average = normal + yearly;
  if (yearly > normal * 1.5) return null;
  return {
    d, goodwill, premium, yearly,
    text: `Goodwill is valued at ${n} years' purchase of the super profit. The firm's capital employed is ${inr(capital)}, the normal rate of return in its trade is ${r}%, and its average profit is ${inr(average)}.`,
    steps: [
      `Normal profit = ${inr(capital)} x ${r} / 100 = ${inr(normal)}; super profit = ${inr(average)} - ${inr(normal)} = ${inr(yearly)}.`,
      `Goodwill of the firm = ${inr(yearly)} x ${n} = ${inr(goodwill)}.`,
    ],
    slip: { goodwill: average * n, why: 'Multiplied the whole average profit; under the super profit method only the profit above the normal is multiplied.' },
  };
}
/** The goodwill a prompt of `valuation` leads to, worked again from its words. */
function goodwillIn(prompt: string): number | null {
  const years = /valued at (\d+) years' purchase/.exec(prompt);
  if (!years) return null;
  const n = Number(years[1]);
  const sup = /capital employed is (₹[\d,]+), the normal rate of return in its trade is (\d+)%, and its average profit is (₹[\d,]+)/.exec(prompt);
  if (sup) return (amountsIn(sup[3])[0] - (amountsIn(sup[1])[0] * Number(sup[2])) / 100) * n;
  const avg = /profits of those years were (.+?); the profit of \d{4}-\d{2} (is after an abnormal loss|includes an abnormal gain) of (₹[\d,]+)/.exec(prompt);
  if (!avg) return null;
  const shown = amountsIn(avg[1]);
  const x = amountsIn(avg[3])[0];
  return shown.length === 3 ? ((sum(shown) + (avg[2].startsWith('is after') ? x : -x)) / 3) * n : null;
}

// adm-premium-from-profits: goodwill valued from the profits, then the premium the new partner brings, or one
// sacrificing partner's part of it (complex)
const premiumFromProfits = numericTemplate({
  id: 'adm-premium-from-profits', topicId: T, conceptId: 'adm-premium', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const v = valuation(rng);
    if (!v) return null;
    const { d } = v;
    const givers = d.olds.flatMap((_, i) => (isPos(d.given[i]) ? [i] : []));
    const askPart = givers.length > 1 && rng.int(0, 1) === 0;
    const j = rng.pick(givers);
    const answer = askPart ? of(v.goodwill, d.given[j]) : v.premium;
    const m = money(
      answer,
      askPart
        ? [
            [of(v.slip.goodwill, d.given[j]), v.slip.why],
            [of(v.premium, d.oldShares[j]), 'Shared the premium in the old ratio; it goes to the sacrificing partners in the ratio of what each gives up.'],
            [of(v.goodwill, d.oldShares[j]), `Gave ${d.olds[j]} the old share of the whole goodwill; only the premium for ${d.nw}'s share is shared.`],
            [v.premium, `Gave the whole premium to ${d.olds[j]}.`],
          ]
        : [
            [of(v.slip.goodwill, d.share), v.slip.why],
            [v.goodwill, `Stopped at the goodwill of the firm; ${d.nw} pays only for the ${fs(d.share)} share acquired.`],
            [of(v.yearly, d.share), "Took the new partner's share of one year's profit and left out the years' purchase."],
            [of(v.goodwill, minus(ONE, d.share)), `Took the old partners' ${fs(minus(ONE, d.share))} of the goodwill instead of ${d.nw}'s ${fs(d.share)}.`],
          ],
    );
    return m && {
      prompt: `${d.open} ${d.admit} ${d.how} ${v.text} ${d.nw} brings ${d.nw}'s share of the goodwill as premium, in cash. The capital accounts are fluctuating. ${askPart ? `How much of the premium is credited to ${d.olds[j]}'s Capital A/c?` : `How much premium for goodwill does ${d.nw} bring in?`}`,
      ...m,
      explanation: [
        ...v.steps,
        `${d.nw}'s premium = ${inr(v.goodwill)} x ${fs(d.share)} = ${inr(v.premium)}.`,
        ...(askPart ? [givesSteps(d)[0], sacStep(d), `${d.olds[j]}'s part = ${inr(v.premium)} x ${fs(d.parts[j])} = ${inr(answer)}.`] : []),
      ],
      hints: ['Value the goodwill of the whole firm first, from the profits, exactly as the question says.', "Premium = firm's goodwill x new partner's share; it is shared by the sacrificing partners in the sacrificing ratio."],
    };
  },
  verify: (q: NumericQuestion) => {
    const d = readDeal(q.prompt);
    const goodwill = goodwillIn(q.prompt);
    if (!d || goodwill === null) return false;
    const who = /credited to (\w+)'s Capital/.exec(q.prompt)?.[1];
    if (!who) return near(q.answer / 100, goodwill * d.share);
    const j = d.olds.indexOf(who);
    return j >= 0 && near(q.answer / 100, goodwill * d.given[j]);
  },
});

// adm-je-premium-from-profits: the same valuation, then the one entry that brings in the capital and the premium
// and the entry that shares the premium, passed as the second (complex)
const jePremiumFromProfits = journalTemplate({
  id: 'adm-je-premium-from-profits', topicId: T, conceptId: 'adm-premium', difficulty: 'complex', computed: true,
  generate: (rng) => {
    const v = valuation(rng);
    if (!v) return null;
    const { d } = v;
    const fixed = rng.int(0, 2) === 0;
    const own = ownAccount(fixed);
    const parts = d.olds.map((_, i) => of(v.goodwill, d.given[i]));
    if (!parts.every(Number.isInteger)) return null;
    return {
      prompt: `${d.open} ${d.admit} ${d.how} ${v.text} ${d.nw} brings ${d.nw}'s share of the goodwill as premium, in cash, and it is credited to Premium for Goodwill A/c. ${capsText(fixed)} Pass the journal entry to share the premium.`,
      lines: entry(Dr('premiumForGoodwill', v.premium), ...d.olds.map((n, i) => Cr(own(n), parts[i]))),
      explanation: [
        ...v.steps,
        `${d.nw}'s premium = ${inr(v.goodwill)} x ${fs(d.share)} = ${inr(v.premium)}.`,
        givesSteps(d)[0],
        sacStep(d),
        `Premium for Goodwill A/c is debited with ${inr(v.premium)}; ${d.olds.flatMap((n, i) => (parts[i] > 0 ? [`${n}'s ${ownName(fixed)} A/c is credited with ${inr(parts[i])}`] : [])).join('; ')}.`,
      ],
      distractorAccounts: ['goodwill', own(d.nw), ...d.olds.map(ownAccount(!fixed))],
      hints: ['Value the goodwill of the whole firm from the profits first, then take the new partner\'s share of it.', H.premium[1]],
    };
  },
  verify: (q) => {
    const d = readDeal(q.prompt);
    const goodwill = goodwillIn(q.prompt);
    if (!d || goodwill === null) return false;
    const own = ownAccount(/fixed capital/.test(q.prompt));
    const credits = sideOf(q, 'Cr');
    return near(sideOf(q, 'Dr').get('premiumForGoodwill') ?? 0, goodwill * d.share) && d.olds.every((n, i) => near(credits.get(own(n)) ?? 0, goodwill * d.given[i]));
  },
});

// adm-je-revaluation-more: what the revaluation item bank lacked: an asset taken over by an old partner at an agreed
// value, an asset not in the books taken over by a partner, and a liability not in the books paid privately by a
// partner (medium)
const TAKEN = [
  { id: 'vehicles', name: 'delivery van' },
  { id: 'computers', name: 'computer' },
  { id: 'furniture', name: 'furniture' },
  { id: 'machinery', name: 'machine' },
];
const jeRevaluationMore = journalTemplate({
  id: 'adm-je-revaluation-more', topicId: T, conceptId: 'adm-revaluation', difficulty: 'medium',
  generate: (rng) => {
    const d = deal(rng, 'old');
    if (!d) return null;
    const fixed = rng.int(0, 2) === 0;
    const own = ownAccount(fixed);
    const who = rng.pick(d.olds);
    const asset = rng.pick(TAKEN);
    const kind = rng.pick(['taken-loss', 'taken-gain', 'unrecorded', 'paid'] as const);
    const book = rng.step(30000, 150000, 5000);
    const x = rng.step(5000, 25000, 1000);
    const base = `${d.open} ${d.admit} ${capsText(fixed)} On the admission`;
    if (kind === 'taken-loss' || kind === 'taken-gain') {
      const agreed = kind === 'taken-loss' ? book - x : book + x;
      return {
        prompt: `${base}, ${who} takes over the ${asset.name}, which stands in the books at ${inr(book)}, at an agreed value of ${inr(agreed)}. Pass the journal entry.`,
        lines: kind === 'taken-loss' ? [Dr(own(who), agreed), Dr('revaluation', x), Cr(asset.id, book)] : [Dr(own(who), agreed), Cr(asset.id, book), Cr('revaluation', x)],
        explanation: [
          `The ${asset.name} leaves the books at its book value: ${ledgerLabel(asset.id)} is credited with ${inr(book)}.`,
          `${who} pays for it by a debit to ${who}'s ${ownName(fixed)} A/c at the agreed ${inr(agreed)}.`,
          kind === 'taken-loss'
            ? `The ${inr(x)} by which the agreed value falls short of the book value is a loss on revaluation: Revaluation A/c is debited.`
            : `The ${inr(x)} by which the agreed value exceeds the book value is a gain on revaluation: Revaluation A/c is credited.`,
        ],
        distractorAccounts: ['bank', own(d.nw), ownAccount(!fixed)(who), 'profitAndLoss'],
        hints: ['Three things happen: the asset leaves the books, the partner pays for it, and the difference is a gain or loss.', 'Partner Dr at the agreed value; asset Cr at book value; the difference to Revaluation A/c.'],
      };
    }
    if (kind === 'unrecorded') {
      return {
        prompt: `${base}, a ${asset.name} worth ${inr(x)}, which had been written off and does not appear in the books, is taken over by ${who} at that value. Pass the journal entry.`,
        lines: [Dr(own(who), x), Cr('revaluation', x)],
        explanation: [
          `An asset not in the books is a gain of ${inr(x)} when it is realised: Revaluation A/c is credited.`,
          `${who} takes it over, so ${who}'s ${ownName(fixed)} A/c is debited; no asset account is opened, since the ${asset.name} leaves the firm at once.`,
        ],
        distractorAccounts: [asset.id, 'bank', own(d.nw), 'profitAndLoss'],
        hints: ['Is the firm better off by this item? It was not in the books at all.', "An unrecorded asset taken over by a partner: Partner's account Dr; To Revaluation A/c."],
      };
    }
    return {
      prompt: `${base}, a bill of ${inr(x)} for repairs, not recorded in the books, is found to be payable; ${who} pays it privately. Pass the journal entry.`,
      lines: [Dr('revaluation', x), Cr(own(who), x)],
      explanation: [
        `A liability not in the books is a loss of ${inr(x)}: Revaluation A/c is debited.`,
        `${who} pays it from ${who}'s own pocket, so the firm owes ${who}: ${who}'s ${ownName(fixed)} A/c is credited. No liability stays in the books and no cash of the firm moves.`,
      ],
      distractorAccounts: ['outstandingExpenses', 'repairs', 'bank', own(d.nw)],
      hints: ['Is the firm worse off by this item, and who has paid it?', "An unrecorded liability paid by a partner: Revaluation A/c Dr; To Partner's account."],
    };
  },
  verify: (q) => {
    const debits = sideOf(q, 'Dr');
    const credits = sideOf(q, 'Cr');
    const amounts = amountsIn(q.prompt);
    const rev = (credits.get('revaluation') ?? 0) - (debits.get('revaluation') ?? 0);
    if (/stands in the books at/.test(q.prompt)) {
      const [book, agreed] = amounts;
      return near(rev, agreed - book) && near(totalOf(debits), totalOf(credits));
    }
    if (/takes over|taken over/.test(q.prompt)) return near(rev, amounts[0]);
    return near(rev, -amounts[0]);
  },
});

// adm-fmt-current-accounts: with fixed capitals, the old partners' current accounts in columns on the admission:
// the reserve, the result of revaluation and goodwill in the books, the premium shared and perhaps half withdrawn,
// and a partner whose account may end in debit (complex)
const currentKept = keepFor<{ opening: number[]; shared: number; credits: number[]; out: number[] }>();
const fmtCurrentAccounts = accountTemplate({
  id: 'adm-fmt-current-accounts', topicId: T, conceptId: 'adm-formats', difficulty: 'complex',
  generate: (rng) => {
    const m = rng.pick([2, 2, 3]);
    const half = rng.int(0, 2) === 0;
    const made = attempt(6, () => {
      const d = dealWhere(rng, ['old', 'equal', 'stated', 'stated', 'one'], tidySac, m);
      if (!d) return null;
      const cut = half ? fr(1, 2) : ONE;
      const base = amountFor(rng, ...premiumRange(d), d.parts.map((p) => times(p, cut)));
      return base === null ? null : { d, premium: base };
    });
    if (!made) return null;
    const { d, premium } = made;
    const credits = d.olds.map((_, i) => of(premium, d.parts[i]));
    const out = credits.map((c) => (half ? c / 2 : 0));
    if (![...credits, ...out].every(Number.isInteger)) return null;
    const unit = sum(d.old) * 1000;
    const reserve = multipleOf(rng, unit, 20000, 120000);
    const existing = rng.int(0, 2) > 0 ? multipleOf(rng, unit, 20000, 90000) : 0;
    const profit = rng.int(0, 2) > 0;
    const result = multipleOf(rng, unit, 10000, 80000);
    // Opening current balances: credits as a rule, and in a third of the seeds one partner overdrawn.
    const opening = d.olds.map(() => rng.step(10000, 90000, 5000));
    const debitAt = rng.int(0, 2) === 0 ? rng.int(0, m - 1) : -1;
    if (debitAt >= 0) opening[debitAt] = -opening[debitAt];
    const caps = d.olds.map(() => rng.step(200000, 600000, 50000));
    const capital = rng.step(100000, 400000, 50000);
    const day = `1 April ${d.year}`;
    const ids = d.olds.map(partnerCurrent);
    const inOld = (x: number): number[] => d.oldShares.map((s) => of(x, s));
    const toOld = (account: string, x: number): DatedEntry => ({ date: day, lines: [Dr(account, x), ...inOld(x).map((p, i) => Cr(ids[i], p))] });
    const fromOld = (account: string, x: number): DatedEntry => ({ date: day, lines: [...inOld(x).map((p, i) => Dr(ids[i], p)), Cr(account, x)] });
    const entries: DatedEntry[] = [
      toOld('generalReserve', reserve),
      ...(existing > 0 ? [fromOld('goodwill', existing)] : []),
      profit ? toOld('revaluation', result) : fromOld('revaluation', result),
      { date: day, lines: entry(Dr('premiumForGoodwill', premium), ...credits.map((c, i) => Cr(ids[i], c))) },
      ...(half ? [{ date: day, lines: entry(...out.map((o, i) => Dr(ids[i], o)), Cr('bank', sum(out))) }] : []),
    ];
    const shared = reserve - existing + (profit ? result : -result);
    const closing = opening.map((o, i) => o + of(shared, d.oldShares[i]) + credits[i] - out[i]);
    if (closing.some((c) => c === 0)) return null;
    const view = columnarAccount(
      entries,
      ids,
      { date: day, balances: opening.map((o) => ({ side: o > 0 ? ('Cr' as const) : ('Dr' as const), amount: rupees(Math.abs(o)) })) },
      (id) => (id === 'revaluation' ? revaluationRow(profit) : columnLabel(id)),
    );
    const sides = columnarSides(view, { closeOn: day });
    const data = [
      `${d.open} ${d.admit} ${d.how}`,
      `The capitals are fixed: Capital A/cs ${d.olds.map((n, i) => `${n} ${inr(caps[i])}`).join('; ')}. Everything the old partners share on the admission goes to their current accounts.`,
      `Current A/cs on that date: ${d.olds.map((n, i) => `${n} ${inr(Math.abs(opening[i]))} (${opening[i] > 0 ? 'Cr' : 'Dr'})`).join('; ')}.`,
      `${HELD[0].line(inr(reserve))}.`,
      ...(existing > 0 ? [`Goodwill appears in the books at ${inr(existing)}.`] : []),
      `The Revaluation Account prepared on the admission shows a ${profit ? 'profit' : 'loss'} of ${inr(result)}.`,
      `${d.nw} brings ${inr(capital)} as capital and ${inr(premium)} as premium for goodwill, by cheque.`,
      half ? `The partners who receive the premium withdraw half of it, by cheque.` : 'The premium is kept in the business.',
    ].join('\n');
    currentKept.keep(data, { opening, shared, credits, out });
    const givers = giversOf(d);
    return {
      task: `Prepare the current accounts of the old partners in columns as on ${day}, after ${d.nw}'s admission, and carry the balances down.`,
      data,
      title: "Partners' Current Accounts",
      columns: partnerColumns(d.olds),
      left: { ...sides.left, rows: plainRevaluation(sides.left.rows) },
      right: { ...sides.right, rows: plainRevaluation(sides.right.rows) },
      distractors: [revaluationRow(!profit), 'Capital A/c', 'Cash A/c', 'Profit and Loss Appropriation A/c', 'Interest on Capital A/c'],
      explanation: [
        `The capitals are fixed, so the capital accounts are left alone: ${d.nw}'s capital of ${inr(capital)} goes to ${d.nw}'s Capital A/c, and no capital of an old partner moves.`,
        `Each old partner's current account opens with its balance: ${d.olds.map((n, i) => `${n} ${inr(Math.abs(opening[i]))} ${opening[i] > 0 ? 'on the credit side' : 'on the debit side (overdrawn)'}`).join('; ')}.`,
        `The General Reserve of ${inr(reserve)} goes to the old partners in the old ratio ${rs(d.old)}: ${eachGets(d.olds, inOld(reserve))}, on the credit side.`,
        ...(existing > 0 ? [`Goodwill of ${inr(existing)} in the books is written off in the old ratio: ${eachGets(d.olds, inOld(existing))}, on the debit side.`] : []),
        `The ${profit ? 'profit' : 'loss'} on revaluation of ${inr(result)}, in the old ratio: ${eachGets(d.olds, inOld(result))}, on the ${profit ? 'credit' : 'debit'} side.`,
        `${givesSteps(d)[0]} ${sacStep(d)} The premium of ${inr(premium)} is credited through Premium for Goodwill A/c: ${eachGets(d.olds, credits)}.`,
        ...(half ? [`Half of it is withdrawn by ${list(givers)}: ${eachGets(d.olds, out)}, on the debit side as To Bank A/c.`] : []),
        `Closing balances: ${d.olds.map((n, i) => `${n} ${inr(Math.abs(closing[i]))} ${closing[i] > 0 ? '(Cr), carried down on the debit side' : '(Dr), carried down on the credit side'}`).join('; ')}.`,
      ],
      hints: [
        'With fixed capitals the capital accounts do not move: every adjustment of the old partners goes to their current accounts.',
        'Reserves, revaluation and goodwill in the books go in the old ratio; the premium in the sacrificing ratio. A current account may end with a debit balance.',
      ],
    };
  },
  verify: (q) => {
    // Each closing balance in plain decimals from the kept figures and the deal read from the data.
    const k = currentKept.of(q.data);
    const d = readDeal(q.data.split('\n')[0]);
    if (!k || !d) return false;
    const premium = amountsIn(q.data.split('\n').find((l) => /as premium for goodwill/.test(l)) ?? '')[1];
    const want = d.olds.map((_, i) => k.opening[i] + k.shared * d.shares[i] + ((premium * d.given[i]) / d.share) * (k.out.some((o) => o > 0) ? 0.5 : 1));
    const closingDr = q.sides[0].rows.find((r) => r.closing);
    const closingCr = q.sides[1].rows.find((r) => r.closing);
    return want.every((w, c) => near(w > 0 ? (closingDr?.amounts[c] ?? 0) / 100 : -((closingCr?.amounts[c] ?? 0) / 100), w));
  },
});

const templates: Template[] = [
  newRatioOld, newRatioEqual, newRatioOne, newRatioStated, newRatioSurrender, newRatioRemaining, newPartnerShare,
  sacrificeOldNew, sacrificeThree, sacrificeSurrender, sacrificeRemaining, sacrificeRule,
  premiumAmount, premiumShare, jePremiumBrought, jePremiumDistribute, jePremiumWithdrawn, goodwillTreatment,
  jeGoodwillNotBrought, jeGoodwillPartly, jePremiumGainer, jeExistingGoodwill, goodwillExistingNet,
  hiddenGoodwill, hiddenGoodwillShare,
  revaluationResult, revaluationShare, jeRevaluationItem, jeRevaluationPercent, jeRevaluationTransfer,
  jeReserves, reserveShare, reserveClaim, distributionRule,
  totalCapital, newPartnerCapital, oldPartnerCapital, capitalAdjustCash, jeCapitalAdjust,
  bankBalance, capitalAfterAll, combinedNewCapital, balanceSheetTotal,
  // Sets of entries, then formats.
  setPremiumCash, setGoodwillForms, setRevaluation, setWholeAdmission,
  fmtRevaluation, fmtRevaluationWorked, fmtCapitals, fmtCapitalsAdjusted, fmtBalanceSheet,
  // Added after the audit.
  premiumFromProfits, jePremiumFromProfits, jeRevaluationMore, fmtCurrentAccounts, fmtBalanceSheetFixed,
  admAssertionReason,
];

export default templates;
