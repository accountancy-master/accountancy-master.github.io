import type { AccountQuestion, JournalQuestion, JournalSetQuestion, McqQuestion, NumericQuestion, RatioQuestion } from '@/content/types';
import { partnerCapital, partnerCurrent } from '@/engine/accounts';
import { accountOf, balanceOf, columnLabel, columnarAccount, ledgerLabel, post, type DatedEntry, type Ledger } from '@/engine/books';
import type { JournalLine } from '@/engine/journal';
import type { Rng } from '@/engine/rng';
import { assertionReasonFacts, factsTemplate, accountTemplate, columnarSides, formatINR, journalSetTemplate, journalTemplate, keepFor, ledgerSides, lowestTerms, mcqTemplate, numericTemplate, partnerColumns, rupees, setHolds } from '../authoring';
import type { AccountParts, FormatRowParts, JournalParts, McqParts, NumericParts, RatioParts, SetTransaction, Template } from '../types';

const T = 'change-in-profit-sharing-ratio';

// ---------------------------------------------------------------------------------------------------------------
// Conventions used throughout (and stated in the prompts that rely on them):
//  - the same partners stay in the firm; only their profit-sharing ratio changes, from 1 April of a year, and the
//    Balance Sheet meant is that of the 31 March before it;
//  - sacrifice = old share - new share, gain = new share - old share;
//  - goodwill is never raised in the books (AS 26): the gaining partner compensates the sacrificing partner through
//    the capital accounts, and goodwill already in the books is first written off in the old ratio;
//  - reserves, accumulated profits and losses and the result of revaluation belong to the partners in the old ratio;
//  - with fixed capitals every adjustment passes through the current accounts, and the prompt says which it is;
//  - every partner's figure is a whole hundred of rupees: an amount that would leave odd rupees is never drawn.
// ---------------------------------------------------------------------------------------------------------------

/** Whole rupees as the amount text a learner sees. */
const inr = (n: number): string => formatINR(rupees(n));
const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b;
export const total = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
/** A fraction in its lowest terms: "1/10". */
export const frac = (n: number, d: number): string => `${n / gcd(n, d)}/${d / gcd(n, d)}`;
export const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
export const upper = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A change of ratio among the same partners. `d` is what each partner gives up, as a numerator over `L` (the common
 * denominator of the two ratios): above zero for a sacrifice, below zero for a gain, zero for a share that stays.
 */
export interface Change {
  old: number[];
  neu: number[];
  so: number;
  sn: number;
  L: number;
  d: number[];
  sac: number[];
  gain: number[];
  same: number[];
}

export function changeOf(old: number[], neu: number[]): Change {
  const so = total(old);
  const sn = total(neu);
  const L = lcm(so, sn);
  const d = old.map((o, i) => o * (L / so) - neu[i] * (L / sn));
  const at = (ok: (x: number) => boolean): number[] => d.flatMap((x, i) => (ok(x) ? [i] : []));
  return { old, neu, so, sn, L, d, sac: at((x) => x > 0), gain: at((x) => x < 0), same: at((x) => x === 0) };
}

/** Every order of the terms of a ratio, each once. */
function orders(r: number[]): number[][] {
  const out = new Map<string, number[]>();
  const walk = (left: number[], done: number[]): void => {
    if (left.length === 0) out.set(done.join(':'), done);
    left.forEach((x, i) => walk([...left.slice(0, i), ...left.slice(i + 1)], [...done, x]));
  };
  walk(r, []);
  return [...out.values()];
}

// Ratios in lowest terms whose totals (2 to 15) keep every share a simple fraction.
const RATIOS3 = [[1, 1, 1], [2, 1, 1], [2, 2, 1], [3, 1, 1], [3, 2, 1], [4, 1, 1], [3, 3, 2], [4, 3, 1], [5, 2, 1], [4, 3, 3], [5, 3, 2], [5, 4, 1], [6, 3, 1], [7, 5, 3], [6, 5, 4]].flatMap(orders);
const RATIOS2 = [[1, 1], [2, 1], [3, 1], [3, 2], [4, 1], [5, 3], [7, 3]].flatMap(orders);
/** Every change from one of the ratios to another in which no partner gains or gives up more than a quarter of the profit. */
const changes = (ratios: number[][]): Change[] =>
  ratios
    .flatMap((old) => ratios.filter((neu) => neu.join(':') !== old.join(':')).map((neu) => changeOf(old, neu)))
    .filter((c) => c.L <= 60 && c.d.every((x) => Math.abs(x) * 4 <= c.L));

/** Every change among three partners, and those of each pattern: who sacrifices and who gains. */
export const THREE = changes(RATIOS3);
/** One partner sacrifices, one gains and the third is unaffected. */
export const ONE_ONE = THREE.filter((c) => c.same.length === 1);
export const TWO_SAC = THREE.filter((c) => c.sac.length === 2);
export const TWO_GAIN = THREE.filter((c) => c.gain.length === 2);
export const TWO = changes(RATIOS2);
/** The changes whose common denominator is at most 30: the ones for a first question. */
const simple = (list: Change[]): Change[] => list.filter((c) => c.L <= 30);
const THREE_S = simple(THREE);
const ONE_ONE_S = simple(ONE_ONE);
const TWO_SAC_S = simple(TWO_SAC);
const TWO_GAIN_S = simple(TWO_GAIN);
const TWO_S = simple(TWO);
/** One partner pays and one receives: two partners, or three of whom one is unaffected. */
export const pairChange = (rng: Rng, easy = false): Change => rng.pick(rng.int(0, 2) === 0 ? (easy ? TWO_S : TWO) : easy ? ONE_ONE_S : ONE_ONE);
export const anyChange = (rng: Rng, easy = false): Change => rng.pick(rng.int(0, 3) === 0 ? (easy ? TWO_S : TWO) : easy ? THREE_S : THREE);

const TRIOS = [
  ['Asha', 'Bina', 'Charu'], ['Anil', 'Bharat', 'Chetan'], ['Meera', 'Nikhil', 'Omar'], ['Farida', 'Gopal', 'Hema'],
  ['Kavita', 'Lalit', 'Manoj'], ['Ravi', 'Suman', 'Tara'], ['Deepak', 'Esha', 'Firoz'], ['Imran', 'Jaya', 'Kunal'],
  ['Pooja', 'Qasim', 'Rohit'], ['Sneha', 'Tarun', 'Uma'], ['Vikram', 'Yamini', 'Zoya'], ['Gita', 'Harsh', 'Indu'],
];
const FIRMS = ['Sunrise Traders', 'Ganga Textiles', 'Himalaya Stores', 'Deccan Hardware', 'Malabar Spices', 'Narmada Electricals', 'Kaveri Book House', 'Aravali Furnishers'];

export const listOf = (names: readonly string[]): string =>
  names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
export const inRatio = (r: readonly number[]): string => (r.every((x) => x === r[0]) ? 'equally' : `in the ratio ${r.join(':')}`);

/** The partners of a question and the two sentences every question opens with: who shares how, and the change. */
export interface Firm {
  names: string[];
  who: string;
  /** The change takes effect on 1 April of this year; the Balance Sheet is that of 31 March of it. */
  year: number;
  intro: string;
  change: string;
}

export function firmOf(rng: Rng, old: readonly number[], neu?: readonly number[]): Firm {
  const trio = rng.pick(TRIOS);
  const names = old.length === 3 ? trio : rng.pick([[trio[0], trio[1]], [trio[0], trio[2]], [trio[1], trio[2]]]);
  const year = rng.int(2023, 2026);
  const who = listOf(names);
  const house = rng.pick(FIRMS);
  const intro = rng.pick([
    `${who} are partners in a firm sharing profits and losses ${inRatio(old)}.`,
    `${who} are partners in ${house}, sharing profits and losses ${inRatio(old)}.`,
    `${who} carry on business as ${house} and share profits and losses ${inRatio(old)}.`,
  ]);
  const change = neu
    ? rng.pick([
        `With effect from 1 April ${year} they agree to share future profits and losses ${inRatio(neu)}.`,
        `They decide that from 1 April ${year} profits and losses will be shared ${inRatio(neu)}.`,
        `From 1 April ${year} the partners will share profits and losses ${inRatio(neu)}.`,
      ])
    : '';
  return { names, who, year, intro, change };
}

/** `v` rupees shared in a ratio comes to whole hundreds of rupees for every partner. */
const splits = (v: number, r: readonly number[]): boolean => r.every((x) => (v * x) % (total(r) * 100) === 0);
/** `v` rupees times every share gained or sacrificed comes to whole hundreds of rupees. */
const moves = (v: number, ch: Change): boolean => ch.d.every((x) => (v * x) % (ch.L * 100) === 0);
/** A partner's part of `v` in a ratio. */
export const part = (v: number, r: readonly number[], i: number): number => (v * r[i]) / total(r);
/** `v` times the share partner `i` gains or sacrifices. */
export const moved = (v: number, ch: Change, i: number): number => (v * Math.abs(ch.d[i])) / ch.L;

/** A round amount in [min, max] for which `ok` holds, the rounder steps first; null when there is none. */
export function pickAmount(rng: Rng, min: number, max: number, ok: (v: number) => boolean): number | null {
  let last: number[] = [];
  for (const step of [10000, 5000, 2000, 1000]) {
    const all: number[] = [];
    for (let v = Math.ceil(min / step) * step; v <= max; v += step) if (ok(v)) all.push(v);
    if (all.length >= 4) return rng.pick(all);
    last = all;
  }
  return last.length > 0 ? rng.pick(last) : null;
}

/** A rupee answer and its named wrong answers, given in whole rupees. A wrong figure that is not a whole positive amount is dropped; null when fewer than two remain. */
export function numeric(answer: number, errs: [number, string][]): Pick<NumericParts, 'answer' | 'commonErrors'> | null {
  if (!(answer > 0) || !Number.isInteger(answer)) return null;
  const seen = new Set([answer]);
  const commonErrors: { value: number; why: string }[] = [];
  for (const [v, why] of errs) if (v > 0 && Number.isInteger(v) && !seen.has(v) && seen.add(v)) commonErrors.push({ value: rupees(v), why });
  return commonErrors.length >= 2 ? { answer: rupees(answer), commonErrors } : null;
}

/** A ratio answer and its named wrong ratios, each reduced to lowest terms. Null when fewer than two distinct wrong ratios remain. */
export function ratio(answer: number[], errs: [number[], string][]): Pick<RatioParts, 'answer' | 'commonErrors'> | null {
  const ok = (r: number[]): boolean => r.length === answer.length && r.every((x) => Number.isInteger(x) && x > 0);
  if (!ok(answer)) return null;
  const right = lowestTerms(answer);
  const seen = new Set([right.join(':')]);
  const commonErrors: { value: number[]; why: string }[] = [];
  for (const [r, why] of errs) {
    if (!ok(r)) continue;
    const low = lowestTerms(r);
    if (!seen.has(low.join(':')) && seen.add(low.join(':'))) commonErrors.push({ value: low, why });
  }
  return commonErrors.length >= 2 ? { answer: right, commonErrors } : null;
}

/**
 * A multiple-choice question; null when fewer than three distinct wrong options remain. The engine offers three of
 * the wrong options, drawn at random. With `keep`, the first `keep.first` of them (the slip the question is about:
 * the entry passed the wrong way round, the new ratio for the old) are always among the three, and the others are
 * drawn from the rest.
 */
export function choice(prompt: string, correct: string, wrong: [string, string][], explanation: string, hints?: string[], keep?: { rng: Rng; first: number }): McqParts | null {
  const seen = new Set([correct]);
  const kept: { text: string; why: string }[] = [];
  const rest: { text: string; why: string }[] = [];
  wrong.forEach(([text, why], t) => {
    if (seen.has(text)) return;
    seen.add(text);
    (keep && t < keep.first ? kept : rest).push({ text, why });
  });
  if (kept.length + rest.length < 3) return null;
  const distractors = keep && kept.length > 0 ? [...kept, ...keep.rng.shuffle(rest).slice(0, Math.max(0, 3 - kept.length))] : [...kept, ...rest];
  return { prompt, correct, distractors, explanation, ...(hints ? { hints } : {}) };
}

/** The account an adjustment reaches: the current account when capitals are fixed, the capital account otherwise. */
export const acct = (name: string, fixed: boolean): string => (fixed ? partnerCurrent(name) : partnerCapital(name));
export const acctName = (name: string, fixed: boolean): string => `${name}'s ${fixed ? 'Current' : 'Capital'} A/c`;
export const capitalsLine = (fixed: boolean): string =>
  fixed ? "The capitals are fixed, so every adjustment is passed through the partners' current accounts." : 'The capitals are fluctuating.';
const dr = (accountId: string, n: number): JournalLine => ({ accountId, side: 'Dr', amount: rupees(n) });
const cr = (accountId: string, n: number): JournalLine => ({ accountId, side: 'Cr', amount: rupees(n) });

/** One partner's old share, new share and what the change does to it, as a line of working. */
export function moveText(ch: Change, i: number, name: string): string {
  const o = `${ch.old[i]}/${ch.so}`;
  const n = `${ch.neu[i]}/${ch.sn}`;
  if (ch.d[i] > 0) return `${name}: old share ${o} - new share ${n} = ${frac(ch.d[i], ch.L)} sacrificed.`;
  if (ch.d[i] < 0) return `${name}: new share ${n} - old share ${o} = ${frac(-ch.d[i], ch.L)} gained.`;
  return `${name}: old share ${o}, new share ${n}: no change.`;
}
export const movesText = (ch: Change, names: readonly string[]): string[] => names.map((name, i) => moveText(ch, i, name));
/** As `moveText`, with both shares first brought to the common denominator, as cpr-card-3 teaches. */
function moveTextLcd(ch: Change, i: number, name: string): string {
  const [x, y] = [ch.old[i] * (ch.L / ch.so), ch.neu[i] * (ch.L / ch.sn)];
  const o = ch.so === ch.L ? `${ch.old[i]}/${ch.L}` : `${ch.old[i]}/${ch.so} = ${x}/${ch.L}`;
  const n = ch.sn === ch.L ? `${ch.neu[i]}/${ch.L}` : `${ch.neu[i]}/${ch.sn} = ${y}/${ch.L}`;
  if (ch.d[i] > 0) return `${name}: old share ${o}, new share ${n}; ${x}/${ch.L} - ${y}/${ch.L} = ${frac(ch.d[i], ch.L)} sacrificed.`;
  if (ch.d[i] < 0) return `${name}: old share ${o}, new share ${n}; ${y}/${ch.L} - ${x}/${ch.L} = ${frac(-ch.d[i], ch.L)} gained.`;
  return `${name}: old share ${o}, new share ${n}: the same share, no change.`;
}
const movesTextLcd = (ch: Change, names: readonly string[]): string[] => names.map((name, i) => moveTextLcd(ch, i, name));
/** "Asha ₹30,000, Bina ₹18,000 and Charu ₹12,000". */
export const eachOf = (names: readonly string[], amounts: readonly number[]): string => listOf(names.map((name, i) => `${name} ${inr(amounts[i])}`));

export const H = {
  ratio: ['Turn both ratios into shares of the whole profit, with one common denominator.', 'Sacrifice = old share - new share. Gain = new share - old share.'],
  goodwill: [
    'Find who gains and who sacrifices, and by what share of the profit.',
    'The gaining partner compensates the sacrificing partner with goodwill x share gained: gaining partner Dr, sacrificing partner Cr. Goodwill already in the books is first written off in the old ratio.',
  ],
  reserves: [
    'These balances were built up before the change. To whom do they belong, and in which ratio?',
    'Reserves and undistributed profits are credited to the partners in the old ratio; accumulated losses and fictitious assets are debited in the old ratio.',
  ],
  specific: [
    'First set the reserve against what it was kept for: the claim, or the fall in the value of investments.',
    'Only what is left of the reserve is distributed in the old ratio. If the reserve is not enough, the shortfall is a loss debited to Revaluation A/c.',
  ],
  revaluation: [
    'Is the item a gain or a loss to the firm? An asset going up or a liability going down is a gain.',
    'Gains are credited and losses are debited to Revaluation A/c; its balance goes to the partners in the old ratio.',
  ],
  single: [
    'Add up what is being left in the books: reserves, profits and gains, less losses.',
    'Net effect x share gained: debit the gaining partner and credit the sacrificing partner. For a net loss the entry is reversed.',
  ],
  capitals: [
    'Take the adjustments one at a time: each is a credit or a debit to the capital account.',
    'To bring capitals to the new ratio: total capital x new share is what a partner should have; compare it with what the partner has.',
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// Reading a question back, for `verify`: the partners, the two ratios and the amounts are read from the prompt and
// the answer is worked out again with plain fractions, where `generate` used whole numbers over a common denominator.
// ---------------------------------------------------------------------------------------------------------------

export const amountsIn = (s: string): number[] => (s.match(/₹\d[\d,]*/g) ?? []).map((x) => Number(x.slice(1).replace(/,/g, '')));
const namesIn = (s: string): string[] => {
  const m = /^([A-Z][a-z]+)(?:, ([A-Z][a-z]+))? and ([A-Z][a-z]+)/.exec(s);
  return m ? [m[1], m[2], m[3]].filter((x): x is string => x !== undefined) : [];
};
export const ratiosIn = (s: string, n: number): number[][] =>
  (s.match(/equally|\d+(?::\d+)+/g) ?? []).map((m) => (m === 'equally' ? Array.from({ length: n }, () => 1) : m.split(':').map(Number)));
const shareOf = (r: readonly number[]): number[] => r.map((x) => x / total(r));

/** The partners, the old and new shares, and what each partner gives up (old share less new share; negative for a gain). */
export function given(prompt: string): { names: string[]; old: number[]; neu: number[]; give: number[] } {
  const names = namesIn(prompt);
  const [a, b] = ratiosIn(prompt, names.length);
  const old = shareOf(a);
  const neu = shareOf(b);
  return { names, old, neu, give: old.map((o, i) => o - neu[i]) };
}
const fixedIn = (prompt: string): boolean => prompt.includes('capitals are fixed');
const optionText = (q: McqQuestion): string => q.options.find((o) => o.id === q.correct)?.text ?? '';
/** What an entry credits to an account, net of what it debits, in rupees. */
const netCr = (q: JournalQuestion, accountId: string): number =>
  q.expected.filter((l) => l.accountId === accountId).reduce((s, l) => s + (l.side === 'Cr' ? l.amount : -l.amount), 0) / 100;
/** True when the entry credits every partner with `base` times what the partner gives up (and so debits a gain). */
const adjustsBy = (q: JournalQuestion, base: number): boolean => {
  const g = given(q.prompt);
  const fixed = fixedIn(q.prompt);
  return g.names.every((name, i) => near(netCr(q, acct(name, fixed)), base * g.give[i]));
};
/** A check that fails, instead of throwing, when the prompt cannot be read back. */
const checked =
  <Q>(check: (q: Q) => boolean) =>
  (q: Q): boolean => {
    try {
      return check(q);
    } catch {
      return false;
    }
  };

// ===============================================================================================================
// Sacrificing and gaining ratio
// ===============================================================================================================

const shareChange = mcqTemplate({
  id: 'cpr-share-change', topicId: T, conceptId: 'cpr-ratio', difficulty: 'easy',
  generate: (rng) => {
    const ch = anyChange(rng, true);
    const f = firmOf(rng, ch.old, ch.neu);
    const i = rng.pick([...ch.sac, ...ch.gain]);
    const name = f.names[i];
    const x = ch.d[i];
    const say = (sacrifice: boolean, n: number, d: number): string => `${name} ${sacrifice ? 'sacrifices' : 'gains'} ${frac(n, d)} of the profit`;
    const gap = ch.old[i] - ch.neu[i];
    return choice(
      `${f.intro} ${f.change} How does the change affect ${name}'s share of profit?`,
      say(x > 0, Math.abs(x), ch.L),
      [
        [say(x < 0, Math.abs(x), ch.L), 'Read the change the wrong way round: a share that falls is a sacrifice and a share that rises is a gain.'],
        [
          gap === 0 ? `${name}'s share of profit does not change` : say(gap > 0, Math.abs(gap), ch.so),
          `Compared the terms ${ch.old[i]} and ${ch.neu[i]} of the two ratios directly, without turning them into the shares ${ch.old[i]}/${ch.so} and ${ch.neu[i]}/${ch.sn}.`,
        ],
        [say(x > 0, ch.neu[i], ch.sn), `Gave ${name}'s new share itself, not the difference between the old share and the new share.`],
        [say(x > 0, ch.old[i], ch.so), `Gave ${name}'s old share itself, not the difference between the old share and the new share.`],
        // Another partner's figure: the right working, read off the wrong line.
        ...f.names.flatMap((other, j): [string, string][] =>
          j !== i && ch.d[j] !== 0 ? [[say(ch.d[j] > 0, Math.abs(ch.d[j]), ch.L), `Gave the change in ${other}'s share (${ch.old[j]}/${ch.so} to ${ch.neu[j]}/${ch.sn}), not in ${name}'s.`]] : [],
        ),
      ],
      `${moveText(ch, i, name)} Sacrifice = old share - new share; when the new share is the bigger one, the difference is a gain.`,
      H.ratio,
      { rng, first: 1 },
    );
  },
  verify: checked((q: McqQuestion) => {
    const g = given(q.prompt);
    const i = g.names.indexOf(/affect ([A-Z][a-z]+)'s share/.exec(q.prompt)![1]);
    const m = /(sacrifices|gains) (\d+)\/(\d+)/.exec(optionText(q))!;
    return near(Number(m[2]) / Number(m[3]), Math.abs(g.give[i])) && (m[1] === 'sacrifices') === g.give[i] > 0;
  }),
});

const whoChanges = mcqTemplate({
  id: 'cpr-who-changes', topicId: T, conceptId: 'cpr-ratio', difficulty: 'easy',
  // Version 2: the shares are compared over one common denominator, in the whys and in the working.
  version: 2,
  generate: (rng) => {
    const ch = rng.pick(ONE_ONE_S);
    const f = firmOf(rng, ch.old, ch.neu);
    const ask = rng.pick(['same', 'gain', 'sac'] as const);
    const right = (ask === 'same' ? ch.same : ask === 'gain' ? ch.gain : ch.sac)[0];
    const question = {
      same: 'Which partner neither gains nor sacrifices on the change?',
      gain: 'Which partner gains on the change?',
      sac: 'Which partner sacrifices a part of the share of profit on the change?',
    }[ask];
    const fact = (i: number): string => {
      const o = `${ch.old[i]}/${ch.so}${ch.so === ch.L ? '' : ` (${ch.old[i] * (ch.L / ch.so)}/${ch.L})`}`;
      const n = `${ch.neu[i]}/${ch.sn}${ch.sn === ch.L ? '' : ` (${ch.neu[i] * (ch.L / ch.sn)}/${ch.L})`}`;
      return ch.d[i] > 0 ? `${f.names[i]}'s share falls from ${o} to ${n}, a sacrifice` : ch.d[i] < 0 ? `${f.names[i]}'s share rises from ${o} to ${n}, a gain` : `${f.names[i]}'s share is ${o} before and ${n} after, the same share`;
    };
    const slip = (i: number): string =>
      ask === 'same' ? `Picked a partner whose share changes: ${fact(i)}.` : ch.d[i] !== 0 ? `Mixed up gain and sacrifice: ${fact(i)}.` : `Picked the partner whose share stays the same: ${fact(i)}.`;
    const wrong = f.names.flatMap((name, i): [string, string][] => (i === right ? [] : [[name, slip(i)]]));
    return choice(
      `${f.intro} ${f.change} ${question}`,
      f.names[right],
      [...wrong, ['It cannot be said without knowing the amount of profit', 'Thought the amount of profit is needed; the shares, and so the gain or sacrifice, come from the two ratios alone.']],
      `${movesTextLcd(ch, f.names).join(' ')} So the answer is ${f.names[right]}.`,
      H.ratio,
    );
  },
  verify: checked((q: McqQuestion) => {
    const g = given(q.prompt);
    const x = g.give[g.names.indexOf(optionText(q))];
    return q.prompt.includes('neither gains nor sacrifices') ? near(x, 0) : q.prompt.includes('Which partner gains') ? x < -1e-6 : x > 1e-6;
  }),
});

/** The sacrificing ratio of the two partners who sacrifice, or the gaining ratio of the two who gain. */
function ratioOfTwo(rng: Rng, kind: 'sac' | 'gain'): RatioParts | null {
  const ch = rng.pick(kind === 'sac' ? TWO_SAC_S : TWO_GAIN_S);
  const f = firmOf(rng, ch.old, ch.neu);
  const [a, b] = kind === 'sac' ? ch.sac : ch.gain;
  const [A, B] = [f.names[a], f.names[b]];
  const C = f.names[(kind === 'sac' ? ch.gain : ch.sac)[0]];
  const word = kind === 'sac' ? 'sacrificing' : 'gaining';
  const answer = [Math.abs(ch.d[a]), Math.abs(ch.d[b])];
  const ask = rng.pick([
    `Calculate the ${word} ratio of ${A} and ${B}.`,
    kind === 'sac' ? `In what ratio do ${A} and ${B} sacrifice their shares in favour of ${C}?` : `In what ratio do ${A} and ${B} gain the share that ${C} gives up?`,
    `${C} is the only partner who ${kind === 'sac' ? 'gains' : 'sacrifices'}. Find the ${word} ratio of ${A} and ${B}.`,
  ]);
  const did = kind === 'sac' ? 'gave up' : 'gained';
  const parts = ratio(answer, [
    [[ch.old[a], ch.old[b]], `Gave the ratio in which ${A} and ${B} shared profits before the change, not the ratio of what each ${did}.`],
    [[ch.neu[a], ch.neu[b]], `Gave the ratio in which ${A} and ${B} will share profits after the change, not the ratio of what each ${did}.`],
    [
      [Math.abs(ch.old[a] - ch.neu[a]), Math.abs(ch.old[b] - ch.neu[b])],
      `Subtracted the terms of one ratio from the terms of the other. The ratios add up to ${ch.so} and ${ch.sn}, so they must first be turned into shares with a common denominator.`,
    ],
    [[answer[1], answer[0]], `Wrote the terms in the wrong order: the ratio is asked for ${A} first and then ${B}.`],
  ]);
  return (
    parts && {
      prompt: `${f.intro} ${f.change} ${ask}`,
      ...parts,
      explanation: [...movesTextLcd(ch, f.names), `${upper(word)} ratio of ${A} and ${B} = ${frac(answer[0], ch.L)} : ${frac(answer[1], ch.L)} = ${parts.answer.join(':')}.`],
      hints: H.ratio,
    }
  );
}
const ratioOfTwoHolds = (kind: 'sac' | 'gain') =>
  checked((q: RatioQuestion) => {
    const g = given(q.prompt);
    const two = g.give.map((x) => (kind === 'sac' ? x : -x)).filter((x) => x > 1e-6);
    return two.length === 2 && near(q.answer[0] * two[1], q.answer[1] * two[0]);
  });

const sacrificingRatio = numericTemplate({
  id: 'cpr-sacrificing-ratio', topicId: T, conceptId: 'cpr-ratio', difficulty: 'easy', unit: 'ratio',
  // Version 2: the working brings both shares to one common denominator before subtracting.
  version: 2,
  generate: (rng) => ratioOfTwo(rng, 'sac'),
  verify: ratioOfTwoHolds('sac'),
});

const gainingRatio = numericTemplate({
  id: 'cpr-gaining-ratio', topicId: T, conceptId: 'cpr-ratio', difficulty: 'easy', unit: 'ratio',
  // Version 2: the working brings both shares to one common denominator before subtracting.
  version: 2,
  generate: (rng) => ratioOfTwo(rng, 'gain'),
  verify: ratioOfTwoHolds('gain'),
});

const newRatioSurrender = numericTemplate({
  id: 'cpr-new-ratio-surrender', topicId: T, conceptId: 'cpr-ratio', difficulty: 'medium', unit: 'ratio',
  generate: (rng) => {
    const old = rng.pick(RATIOS3);
    const so = total(old);
    const f = firmOf(rng, old);
    const [i, j, m] = rng.shuffle([0, 1, 2]);
    const [G, R, M] = [f.names[i], f.names[j], f.names[m]];
    const own = rng.int(0, 1) === 0;
    const k = own ? rng.pick([2, 3, 4, 5]) : rng.pick([4, 5, 6, 8, 10, 12].filter((x) => old[i] * x > so));
    // Both readings of "1/k", over the common denominator so x k: of the giver's own share, and of the firm's profit.
    const reading = (ofOwn: boolean): number[] => {
      const out = old.map((o) => o * k);
      const given1 = ofOwn ? old[i] : so;
      out[i] -= given1;
      out[j] += given1;
      return out;
    };
    const right = reading(own);
    const lost = own ? old[i] : so;
    const parts = ratio(right, [
      [
        reading(!own),
        own ? `Took 1/${k} of the whole profit of the firm; ${G} gives up only 1/${k} of ${G}'s own share.` : `Took 1/${k} of ${G}'s own share; ${G} gives up 1/${k} of the whole profit of the firm.`,
      ],
      [right.map((x, t) => (t === j ? old[j] * k : x)), `Reduced ${G}'s share but did not add the share given up to ${R}'s share.`],
      [right.map((x, t) => (t === i ? old[i] * k + lost : t === j ? old[j] * k - lost : x)), `Moved the share the wrong way: added it to ${G} and took it from ${R}.`],
    ]);
    if (!parts || total(parts.answer) > 60) return null;
    const share = own ? `1/${k} of ${G}'s own share of profit` : `a 1/${k} share of the whole profit of the firm`;
    const D = so * k;
    return {
      prompt: `${f.intro} From 1 April ${f.year}, ${G} surrenders ${share} in favour of ${R}; ${M}'s share does not change. Find the new profit-sharing ratio of ${f.who}.`,
      ...parts,
      explanation: [
        own ? `Share given up by ${G} = 1/${k} of ${old[i]}/${so} = ${frac(old[i], D)}.` : `Share given up by ${G} = ${frac(so, D)} of the whole profit.`,
        `${G}: ${old[i]}/${so} - ${frac(lost, D)} = ${frac(right[i], D)}.`,
        `${R}: ${old[j]}/${so} + ${frac(lost, D)} = ${frac(right[j], D)}.`,
        `${M}: ${old[m]}/${so} = ${frac(right[m], D)}, unchanged.`,
        `New ratio of ${f.who} = ${right.map((x) => `${x}/${D}`).join(' : ')} = ${parts.answer.join(':')}.`,
      ],
      hints: ['Is the fraction a part of the whole profit, or a part of the partner\'s own share?', 'Deduct the share given up from the one who surrenders it and add it to the one who receives it; the third share stays.'],
    };
  },
  verify: checked((q: RatioQuestion) => {
    const names = namesIn(q.prompt);
    const share = shareOf(ratiosIn(q.prompt, 3)[0]);
    const m = /([A-Z][a-z]+) surrenders (?:a )?1\/(\d+) (of|share)/.exec(q.prompt)!;
    const i = names.indexOf(m[1]);
    const j = names.indexOf(/in favour of ([A-Z][a-z]+)/.exec(q.prompt)![1]);
    const x = m[3] === 'of' ? share[i] / Number(m[2]) : 1 / Number(m[2]);
    share[i] -= x;
    share[j] += x;
    return q.answer.every((v, t) => near(v / total(q.answer), share[t]));
  }),
});

/** One partner's share is raised to a stated fraction, the increase coming from the other two in a stated way. */
function acquired(rng: Rng, old: number[], f: Firm): RatioParts | null {
    const so = total(old);
    const z = rng.int(0, 2);
    const [x, y] = [0, 1, 2].filter((t) => t !== z);
    const [X, Y, Z] = [f.names[x], f.names[y], f.names[z]];
    const how = rng.pick(['equally', 'given', 'given', 'old'] as const);
    const [a, b] = how === 'equally' ? [1, 1] : how === 'old' ? lowestTerms([old[x], old[y]]) : rng.pick([[2, 1], [1, 2], [3, 1], [1, 3], [3, 2], [2, 3]]);
    if (how === 'old' && a === b) return null;
    const m = rng.pick([4, 5, 6, 8, 10, 12, 15, 20]);
    // Everything over the common denominator so x m x (a + b); the additional share is 1/m of the profit.
    const s = a + b;
    const zNew = old[z] * m + so; // over so x m
    const taking = (wx: number, wy: number, base: number): number[] => {
      // X and Y give `base`/(so x m) of the profit between them in wx:wy, over so x m x (wx + wy).
      const out = [0, 0, 0];
      out[x] = old[x] * m * (wx + wy) - base * wx;
      out[y] = old[y] * m * (wx + wy) - base * wy;
      out[z] = zNew * (wx + wy);
      return out;
    };
    const right = taking(a, b, so);
    const left = so * m - zNew;
    const rest = [0, 0, 0];
    rest[x] = left * old[x];
    rest[y] = left * old[y];
    rest[z] = zNew * (old[x] + old[y]);
    const parts = ratio(right, [
      [taking(a, b, zNew), `Took the whole of ${Z}'s new share from ${X} and ${Y}; only the additional share (new share less old share) comes from them.`],
      [taking(1, 1, so), `Took the additional share equally from ${X} and ${Y}, not in the ratio the question states.`],
      [rest, `Shared what is left after ${Z}'s new share between ${X} and ${Y} in their old ratio, which is right only when ${Z} takes the additional share in that ratio.`],
      [taking(1, 0, so), `Took the whole additional share from ${X} alone.`],
    ]);
    if (!parts || total(parts.answer) > 40) return null;
    const D = so * m * s;
    const way = how === 'equally' ? 'equally' : how === 'old' ? `in the ratio in which ${X} and ${Y} share profits between themselves at present` : `in the ratio ${a}:${b}`;
    return {
      prompt: `${f.intro} They agree that from 1 April ${f.year} ${Z}'s share of profit will be ${frac(zNew, so * m)}, and that ${Z} acquires the additional share from ${X} and ${Y} ${way}. Find the new profit-sharing ratio of ${f.who}.`,
      ...parts,
      explanation: [
        `Additional share of ${Z} = new share ${frac(zNew, so * m)} - old share ${old[z]}/${so} = ${frac(1, m)}.`,
        ...(how === 'old' ? [`${X} and ${Y} share profits between themselves as ${old[x]}:${old[y]}${old[x] === a ? '' : ` = ${a}:${b}`}.`] : []),
        `${X} gives ${a}/${s} of ${frac(1, m)} = ${frac(a, m * s)}: new share ${old[x]}/${so} - ${frac(a, m * s)} = ${frac(right[x], D)}.`,
        `${Y} gives ${b}/${s} of ${frac(1, m)} = ${frac(b, m * s)}: new share ${old[y]}/${so} - ${frac(b, m * s)} = ${frac(right[y], D)}.`,
        `New ratio of ${f.who} = ${right.map((v) => `${v}/${D}`).join(' : ')} = ${parts.answer.join(':')}.`,
      ],
      hints: ['How much more than the old share is the new share? Only that much is taken from the other two.', 'Split the additional share in the stated ratio and deduct each part from the partner who gives it.'],
    };
}

const newRatioAcquire = numericTemplate({
  id: 'cpr-new-ratio-acquire', topicId: T, conceptId: 'cpr-ratio', difficulty: 'complex', unit: 'ratio',
  generate: (rng) => {
    const old = rng.pick(RATIOS3);
    const f = firmOf(rng, old);
    // Most draws give a ratio with awkward terms, so a few are tried for the same firm.
    for (let attempt = 0; attempt < 20; attempt++) {
      const made = acquired(rng, old, f);
      if (made) return made;
    }
    return null;
  },
  verify: checked((q: RatioQuestion) => {
    const names = namesIn(q.prompt);
    const share = shareOf(ratiosIn(q.prompt, 3)[0]);
    const m = /([A-Z][a-z]+)'s share of profit will be (\d+)\/(\d+)/.exec(q.prompt)!;
    const from = /additional share from ([A-Z][a-z]+) and ([A-Z][a-z]+) (equally|in the ratio (\d+):(\d+)|in the ratio in which)/.exec(q.prompt)!;
    const [x, y, z] = [names.indexOf(from[1]), names.indexOf(from[2]), names.indexOf(m[1])];
    const w = from[3] === 'equally' ? [1, 1] : from[4] ? [Number(from[4]), Number(from[5])] : [share[x], share[y]];
    const extra = Number(m[2]) / Number(m[3]) - share[z];
    share[z] += extra;
    share[x] -= (extra * w[0]) / (w[0] + w[1]);
    share[y] -= (extra * w[1]) / (w[0] + w[1]);
    return extra > 0 && q.answer.every((v, t) => near(v / total(q.answer), share[t]));
  }),
});

// ===============================================================================================================
// Goodwill on a change
// ===============================================================================================================

const GOODWILL_RULE = 'No Goodwill A/c is to be opened: goodwill is adjusted through the capital accounts, which are fluctuating.';

const gwCompensation = numericTemplate({
  id: 'cpr-gw-compensation', topicId: T, conceptId: 'cpr-goodwill', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const ch = pairChange(rng, true);
    const f = firmOf(rng, ch.old, ch.neu);
    const G = pickAmount(rng, 60000, 900000, (v) => moves(v, ch));
    if (G === null) return null;
    const i = rng.pick([ch.sac[0], ch.gain[0]]);
    const name = f.names[i];
    const gains = ch.d[i] < 0;
    const did = gains ? 'gained' : 'sacrificed';
    const amt = moved(G, ch, i);
    const parts = numeric(amt, [
      [part(G, ch.neu, i), `Multiplied the goodwill by ${name}'s new share, not by the share ${did}.`],
      [part(G, ch.old, i), `Multiplied the goodwill by ${name}'s old share, not by the share ${did}.`],
      [G, `Took the whole goodwill of the firm; only the part that goes with the share ${did} is adjusted.`],
      [(G * Math.abs(ch.old[i] - ch.neu[i])) / ch.so, 'Subtracted the terms of the two ratios without turning them into shares with a common denominator, so the share that changed hands is wrong.'],
    ]);
    const ask = rng.pick([
      `By how much is ${name}'s Capital A/c ${gains ? 'debited' : 'credited'} for goodwill?`,
      gains ? `What amount does ${name} pay as compensation for the share gained, by a debit to ${name}'s Capital A/c?` : `What amount is ${name} compensated with, by a credit to ${name}'s Capital A/c?`,
    ]);
    return (
      parts && {
        prompt: `${f.intro} ${f.change} On that date the goodwill of the firm is valued at ${inr(G)}. ${GOODWILL_RULE} ${ask}`,
        ...parts,
        explanation: [
          moveText(ch, i, name),
          `Goodwill x share ${did} = ${inr(G)} x ${frac(Math.abs(ch.d[i]), ch.L)} = ${inr(amt)}.`,
          gains ? `${name} gains, so ${name} pays: ${name}'s Capital A/c is debited with ${inr(amt)}.` : `${name} sacrifices, so ${name} is compensated: ${name}'s Capital A/c is credited with ${inr(amt)}.`,
        ],
        hints: H.goodwill,
      }
    );
  },
  verify: checked((q: NumericQuestion) => {
    const g = given(q.prompt);
    const x = g.give[g.names.indexOf(/([A-Z][a-z]+)'s Capital A\/c/.exec(q.prompt)![1])];
    return near(q.answer / 100, amountsIn(q.prompt)[0] * Math.abs(x)) && /debited|a debit/.test(q.prompt) === x < 0;
  }),
});

/** The entry by which the partners who gain compensate those who sacrifice with `base` times the share that moved. */
export function compensation(ch: Change, names: readonly string[], base: number, fixed: boolean): JournalLine[] {
  return [...ch.gain.map((i) => dr(acct(names[i], fixed), moved(base, ch, i))), ...ch.sac.map((i) => cr(acct(names[i], fixed), moved(base, ch, i)))];
}
/** Accounts a student might wrongly pick in a goodwill entry. */
const goodwillTraps = (ch: Change, names: readonly string[], fixed: boolean): string[] => [
  'goodwill',
  'premiumForGoodwill',
  acct(names[ch.gain[0]], !fixed),
  ...ch.same.map((i) => acct(names[i], fixed)),
];

function goodwillEntry(rng: Rng, ch: Change): JournalParts | null {
  const f = firmOf(rng, ch.old, ch.neu);
  const fixed = rng.int(0, 3) === 0;
  const G = pickAmount(rng, 60000, 900000, (v) => moves(v, ch));
  if (G === null) return null;
  const rule = fixed
    ? "No Goodwill A/c is to be opened. The capitals are fixed, so goodwill is adjusted through the partners' current accounts."
    : 'No Goodwill A/c is to be opened: goodwill is adjusted through the capital accounts, which are fluctuating.';
  const ask = ch.gain.length + ch.sac.length > 2 ? 'Pass one journal entry for the treatment of goodwill.' : 'Pass the journal entry for the treatment of goodwill.';
  return {
    prompt: `${f.intro} ${f.change} On that date the goodwill of the firm is valued at ${inr(G)}. ${rule} ${ask}`,
    lines: compensation(ch, f.names, G, fixed),
    explanation: [
      ...movesText(ch, f.names),
      ...[...ch.gain, ...ch.sac].map((i) => `${f.names[i]}: ${inr(G)} x ${frac(Math.abs(ch.d[i]), ch.L)} = ${inr(moved(G, ch, i))}.`),
      `A partner who gains pays for the share gained: ${listOf(ch.gain.map((i) => acctName(f.names[i], fixed)))} ${ch.gain.length > 1 ? 'are' : 'is'} debited.`,
      `A partner who sacrifices is compensated: ${listOf(ch.sac.map((i) => acctName(f.names[i], fixed)))} ${ch.sac.length > 1 ? 'are' : 'is'} credited.`,
    ],
    hints: H.goodwill,
    distractorAccounts: goodwillTraps(ch, f.names, fixed),
  };
}
const goodwillEntryHolds = checked((q: JournalQuestion) => adjustsBy(q, amountsIn(q.prompt)[0]) && netCr(q, 'goodwill') === 0);

const gwEntry = journalTemplate({
  id: 'cpr-gw-entry', topicId: T, conceptId: 'cpr-goodwill', difficulty: 'medium', computed: true,
  generate: (rng) => goodwillEntry(rng, pairChange(rng)),
  verify: goodwillEntryHolds,
});

const gwEntryCompound = journalTemplate({
  id: 'cpr-gw-entry-compound', topicId: T, conceptId: 'cpr-goodwill', difficulty: 'medium', computed: true,
  generate: (rng) => goodwillEntry(rng, rng.pick(rng.int(0, 1) === 0 ? TWO_SAC : TWO_GAIN)),
  verify: goodwillEntryHolds,
});

const gwWriteOff = journalTemplate({
  id: 'cpr-gw-writeoff', topicId: T, conceptId: 'cpr-goodwill', difficulty: 'easy',
  generate: (rng) => {
    const ch = anyChange(rng, true);
    const f = firmOf(rng, ch.old, ch.neu);
    const fixed = rng.int(0, 3) === 0;
    const B = pickAmount(rng, 20000, 300000, (v) => splits(v, ch.old));
    if (B === null) return null;
    return {
      prompt: `${f.intro} ${f.change} On that date Goodwill appears in the Balance Sheet at ${inr(B)}. ${capitalsLine(fixed)} Pass the journal entry to write off the goodwill that is in the books.`,
      lines: [...f.names.map((name, i) => dr(acct(name, fixed), part(B, ch.old, i))), cr('goodwill', B)],
      explanation: [
        'Goodwill already in the books is written off among all the partners in the old ratio, whoever gains or sacrifices (AS 26).',
        `Old ratio ${ch.old.join(':')}: ${eachOf(f.names, f.names.map((_, i) => part(B, ch.old, i)))}.`,
        `Each partner's ${fixed ? 'Current' : 'Capital'} A/c is debited and Goodwill A/c is credited with ${inr(B)}, which closes it.`,
      ],
      hints: H.goodwill,
      distractorAccounts: ['revaluation', 'premiumForGoodwill', 'profitAndLoss', acct(f.names[0], !fixed)],
    };
  },
  verify: checked((q: JournalQuestion) => {
    const g = given(q.prompt);
    const B = amountsIn(q.prompt)[0];
    return netCr(q, 'goodwill') === B && g.names.every((name, i) => near(netCr(q, acct(name, fixedIn(q.prompt))), -B * g.old[i]));
  }),
});

const gwTreatment = mcqTemplate({
  id: 'cpr-gw-treatment', topicId: T, conceptId: 'cpr-goodwill', difficulty: 'easy',
  generate: (rng) => {
    const ch = pairChange(rng, true);
    const f = firmOf(rng, ch.old, ch.neu);
    const G = pickAmount(rng, 60000, 900000, (v) => moves(v, ch) && splits(v, ch.neu));
    if (G === null) return null;
    const [g, s] = [f.names[ch.gain[0]], f.names[ch.sac[0]]];
    const amt = moved(G, ch, ch.gain[0]);
    const entry = (from: string, to: string, v: number): string => `Debit ${from}'s Capital A/c and credit ${to}'s Capital A/c with ${inr(v)}`;
    return choice(
      `${f.intro} ${f.change} On that date the goodwill of the firm is valued at ${inr(G)}. ${GOODWILL_RULE} Which entry adjusts the goodwill?`,
      entry(g, s, amt),
      [
        [entry(s, g, amt), `Made the sacrificing partner pay: ${s} gives up a share and must receive the compensation, not pay it.`],
        [`Debit Goodwill A/c with ${inr(G)} and credit the partners' Capital A/cs in the old ratio`, 'Raised goodwill in the books. Goodwill the firm has built up itself is not recorded as an asset (AS 26), and the question says no Goodwill A/c is opened.'],
        [entry(g, s, G), 'Used the whole goodwill of the firm, not goodwill x the share gained.'],
        [entry(g, s, part(G, ch.neu, ch.gain[0])), `Multiplied the goodwill by ${g}'s new share, not by the share ${g} gains.`],
      ],
      `${moveText(ch, ch.gain[0], g)} ${moveText(ch, ch.sac[0], s)} Compensation = ${inr(G)} x ${frac(-ch.d[ch.gain[0]], ch.L)} = ${inr(amt)}: ${g}, who gains, is debited and ${s}, who sacrifices, is credited.`,
      H.goodwill,
      { rng, first: 1 },
    );
  },
  verify: checked((q: McqQuestion) => {
    const g = given(q.prompt);
    const m = /^Debit ([A-Z][a-z]+)'s Capital A\/c and credit ([A-Z][a-z]+)'s Capital A\/c with (₹[\d,]+)$/.exec(optionText(q))!;
    const [from, to] = [g.names.indexOf(m[1]), g.names.indexOf(m[2])];
    const amt = amountsIn(m[3])[0];
    return near(amt, -amountsIn(q.prompt)[0] * g.give[from]) && near(amt, amountsIn(q.prompt)[0] * g.give[to]);
  }),
});

// cpr-gw-super-profit (added after the audit): goodwill valued by super profit, at a number of years' purchase or by
// capitalising it, and then the one entry by which the gaining partners compensate the sacrificing ones (complex)
const gwSuperProfit = journalTemplate({
  id: 'cpr-gw-super-profit', topicId: T, conceptId: 'cpr-goodwill', difficulty: 'complex', computed: true,
  generate: (rng) => {
    const ch = pairChange(rng);
    const f = firmOf(rng, ch.old, ch.neu);
    const fixed = rng.int(0, 3) === 0;
    const r = rng.pick([10, 12, 15, 20]);
    const capitalise = rng.int(0, 2) === 0;
    const n = rng.pick([2, 3, 4]);
    const C = rng.step(400000, 2000000, 50000);
    const normal = (C * r) / 100;
    const goodwillOf = (sp: number): number => (capitalise ? (sp * 100) / r : sp * n);
    const sp = pickAmount(rng, 10000, Math.min(150000, normal), (v) => Number.isInteger(goodwillOf(v)) && moves(goodwillOf(v), ch));
    if (sp === null || !Number.isInteger(normal)) return null;
    const avg = normal + sp;
    const G = goodwillOf(sp);
    const trade = rng.pick(['a wholesale grocery business in Nagpur', 'a dental clinic in Mysuru', 'a transport business in Indore', 'a coaching centre in Patna', 'a seed and fertiliser shop in Nashik', 'a small packaging unit in Rajkot']);
    const how = capitalise ? 'by capitalising the super profit' : `at ${n} years' purchase of the super profit`;
    const rule = fixed
      ? "No Goodwill A/c is to be opened. The capitals are fixed, so goodwill is adjusted through the partners' current accounts."
      : 'No Goodwill A/c is to be opened: goodwill is adjusted through the capital accounts, which are fluctuating.';
    return {
      prompt: `${f.intro} ${f.change} The firm runs ${trade}. On the change, goodwill is valued ${how}. The capital employed is ${inr(C)}, the normal rate of return in the trade is ${r}%, and the average profit of the last three years is ${inr(avg)}. ${rule} Pass the journal entry for goodwill.`,
      lines: compensation(ch, f.names, G, fixed),
      explanation: [
        `Normal profit = ${inr(C)} x ${r} / 100 = ${inr(normal)}; super profit = ${inr(avg)} - ${inr(normal)} = ${inr(sp)}.`,
        capitalise ? `Goodwill = super profit x 100 / normal rate = ${inr(sp)} x 100 / ${r} = ${inr(G)}.` : `Goodwill = ${inr(sp)} x ${n} = ${inr(G)}.`,
        ...movesText(ch, f.names),
        ...[...ch.gain, ...ch.sac].map((i) => `${f.names[i]}: ${inr(G)} x ${frac(Math.abs(ch.d[i]), ch.L)} = ${inr(moved(G, ch, i))}.`),
        `The partner who gains pays for the share gained and is debited; the partner who sacrifices is credited. ${capitalsLine(fixed)}`,
      ],
      hints: [
        capitalise ? 'Value the goodwill first: super profit = average profit - normal profit, then capitalise it (x 100 / normal rate).' : "Value the goodwill first: super profit = average profit - normal profit, then multiply by the years' purchase.",
        H.goodwill[1],
      ],
      distractorAccounts: goodwillTraps(ch, f.names, fixed),
    };
  },
  verify: checked((q: JournalQuestion) => {
    const C = amountsIn(/capital employed is (₹[\d,]+)/.exec(q.prompt)![1])[0];
    const r = Number(/normal rate of return in the trade is (\d+)%/.exec(q.prompt)![1]);
    const avg = amountsIn(/average profit of the last three years is (₹[\d,]+)/.exec(q.prompt)![1])[0];
    const sp = avg - (C * r) / 100;
    const years = /at (\d+) years' purchase/.exec(q.prompt);
    const G = years ? sp * Number(years[1]) : (sp * 100) / r;
    return sp > 0 && adjustsBy(q, G) && netCr(q, 'goodwill') === 0;
  }),
});

const gwFromProfits = numericTemplate({
  id: 'cpr-gw-from-profits', topicId: T, conceptId: 'cpr-goodwill', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const ch = anyChange(rng);
    const f = firmOf(rng, ch.old, ch.neu);
    const i = rng.pick([...ch.sac, ...ch.gain]);
    const name = f.names[i];
    const gains = ch.d[i] < 0;
    const n = rng.pick([3, 4, 5]);
    const k = rng.pick([2, 3]);
    const A = pickAmount(rng, 40000, 240000, (v) => moves(v * k, ch));
    if (A === null) return null;
    // n - 1 years around the average (one of them a loss in some questions); the last year brings the total to n x A.
    const loss = rng.int(0, 2) === 0 ? rng.step(10000, 40000, 5000) : 0;
    const spread = Math.floor((0.4 * A) / 5000);
    const drawn = Array.from({ length: n - 1 }, (_, t) => (t === 0 && loss > 0 ? -loss : A + 5000 * rng.int(-spread, spread)));
    const last = n * A - total(drawn);
    if (last <= 0 || last > 3 * A) return null;
    const profits = rng.shuffle([...drawn, last]);
    const G = A * k;
    const amt = moved(G, ch, i);
    const did = gains ? 'gained' : 'sacrificed';
    const parts = numeric(amt, [
      [moved(n * A * k, ch, i), `Used the total profit of the ${n} years, not their average.`],
      [moved(A, ch, i), `Stopped at the average profit and did not multiply it by ${k} years' purchase.`],
      [G, `Gave the goodwill of the whole firm, not goodwill x the share ${did}.`],
      [moved(((n * A + 2 * loss) / n) * k, ch, i), 'Added the loss of one year to the profits; a loss is deducted when the average is worked out.'],
      [part(G, ch.neu, i), `Multiplied the goodwill by ${name}'s new share, not by the share ${did}.`],
    ]);
    const label = (t: number): string => `${f.year - n + t}-${String((f.year - n + t + 1) % 100).padStart(2, '0')}`;
    return (
      parts && {
        prompt: [
          `${f.intro} ${f.change} The firm closes its books on 31 March every year. Goodwill of the firm is valued at ${k} years' purchase of the average profit of the last ${n} years, given below. ${GOODWILL_RULE} By how much is ${name}'s Capital A/c ${gains ? 'debited' : 'credited'} for goodwill?`,
          ...profits.map((p, t) => `${label(t)}: ${p < 0 ? 'Loss' : 'Profit'} ${inr(Math.abs(p))}`),
        ].join('\n'),
        ...parts,
        explanation: [
          `Total profit of the ${n} years = ${profits.map((p, t) => `${p < 0 ? '- ' : t > 0 ? '+ ' : ''}${inr(Math.abs(p))}`).join(' ')} = ${inr(n * A)}${loss > 0 ? ' (the loss is deducted)' : ''}.`,
          `Average profit = ${inr(n * A)} / ${n} = ${inr(A)}; goodwill = ${inr(A)} x ${k} = ${inr(G)}.`,
          moveText(ch, i, name),
          `${inr(G)} x ${frac(Math.abs(ch.d[i]), ch.L)} = ${inr(amt)}, ${gains ? 'debited' : 'credited'} to ${name}'s Capital A/c.`,
        ],
        hints: ['Value the goodwill first: average profit x the number of years\' purchase.', H.goodwill[1]],
      }
    );
  },
  verify: checked((q: NumericQuestion) => {
    const [first, ...rows] = q.prompt.split('\n');
    const g = given(first);
    const x = g.give[g.names.indexOf(/([A-Z][a-z]+)'s Capital A\/c/.exec(first)![1])];
    const sum = total(rows.map((r) => (r.includes('Loss') ? -1 : 1) * amountsIn(r)[0]));
    const k = Number(/at (\d+) years' purchase/.exec(first)![1]);
    return near(q.answer / 100, (sum / rows.length) * k * Math.abs(x)) && first.includes('debited') === x < 0;
  }),
});

const gwBoth = numericTemplate({
  id: 'cpr-gw-both', topicId: T, conceptId: 'cpr-goodwill', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const ch = anyChange(rng);
    const f = firmOf(rng, ch.old, ch.neu);
    const B = pickAmount(rng, 20000, 200000, (v) => splits(v, ch.old) && splits(v, ch.neu));
    if (B === null) return null;
    const G = pickAmount(rng, B + 40000, 900000, (v) => moves(v, ch) && splits(v, ch.old));
    if (G === null) return null;
    const i = rng.int(0, ch.old.length - 1);
    const name = f.names[i];
    const off = part(B, ch.old, i); // the write-off, a debit
    const comp = moved(G, ch, i); // the compensation: a debit for a gain, a credit for a sacrifice
    const net = (ch.d[i] > 0 ? comp : -comp) - off; // credit positive
    if (Math.abs(net) < 5000) return null;
    const inNew = part(B, ch.neu, i);
    const rise = moved(G - B, ch, i);
    const errs: [number, string][] =
      ch.d[i] < 0
        ? [
            [comp, 'Left out the goodwill already in the books, which is first written off among all the partners in the old ratio.'],
            [inNew + comp, 'Wrote off the goodwill in the books in the new ratio; it is written off in the old ratio.'],
            [rise, `Adjusted only the rise in goodwill, ${inr(G - B)}, for the share gained and did not write off the goodwill in the books.`],
            [Math.abs(comp - off), `Credited ${name} with the write-off of the old goodwill; a write-off is a debit, like the compensation ${name} pays.`],
          ]
        : ch.d[i] === 0
          ? [
              [part(G, ch.old, i), `Took a share of the new value of goodwill. ${name}'s share does not change, so ${name} neither pays nor receives compensation; only the goodwill in the books is written off.`],
              [B, `Charged the whole goodwill in the books to ${name}; it is shared by all the partners in the old ratio.`],
              [part(G - B, ch.old, i), `Worked on the rise in goodwill, ${inr(G - B)}; what is written off is the ${inr(B)} in the books.`],
              [B / ch.old.length, 'Divided the goodwill in the books equally, not in the old ratio.'],
            ]
          : [
              [comp, 'Left out the goodwill already in the books, which is first written off among all the partners in the old ratio.'],
              [comp + off, `Added the write-off of the old goodwill to the compensation; the write-off is a debit to ${name} and the compensation a credit.`],
              [Math.abs(comp - inNew), 'Wrote off the goodwill in the books in the new ratio; it is written off in the old ratio.'],
              [rise, `Adjusted only the rise in goodwill, ${inr(G - B)}, for the share sacrificed and did not write off the goodwill in the books.`],
            ];
    const parts = numeric(Math.abs(net), errs);
    return (
      parts && {
        prompt: `${f.intro} ${f.change} Goodwill already appears in the books at ${inr(B)}. On the change the goodwill of the firm is valued at ${inr(G)}. No Goodwill A/c is to remain in the books; the capitals are fluctuating. What is the net amount ${net > 0 ? 'credited' : 'debited'} to ${name}'s Capital A/c on account of goodwill?`,
        ...parts,
        explanation: [
          `Goodwill in the books is written off in the old ratio: ${name} is debited with ${ch.old[i]}/${ch.so} of ${inr(B)} = ${inr(off)}.`,
          moveText(ch, i, name),
          ch.d[i] === 0
            ? `${name} neither gains nor sacrifices, so there is no compensation: the net debit is ${inr(off)}.`
            : `Compensation = ${inr(G)} x ${frac(Math.abs(ch.d[i]), ch.L)} = ${inr(comp)}, ${ch.d[i] < 0 ? 'debited' : 'credited'} to ${name}.`,
          ...(ch.d[i] < 0 ? [`Net debit = ${inr(off)} + ${inr(comp)} = ${inr(-net)}.`] : ch.d[i] > 0 ? [`Net ${net > 0 ? 'credit' : 'debit'} = ${inr(Math.max(comp, off))} - ${inr(Math.min(comp, off))} = ${inr(Math.abs(net))}.`] : []),
        ],
        hints: H.goodwill,
      }
    );
  },
  verify: checked((q: NumericQuestion) => {
    const g = given(q.prompt);
    const i = g.names.indexOf(/to ([A-Z][a-z]+)'s Capital A\/c/.exec(q.prompt)![1]);
    const [B, G] = amountsIn(q.prompt);
    const net = G * g.give[i] - B * g.old[i];
    return near(q.answer / 100, Math.abs(net)) && q.prompt.includes('net amount credited') === net > 0;
  }),
});

const gwFindValue = numericTemplate({
  id: 'cpr-gw-find-value', topicId: T, conceptId: 'cpr-goodwill', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const ch = pairChange(rng, true);
    const f = firmOf(rng, ch.old, ch.neu);
    const [gi, si] = [ch.gain[0], ch.sac[0]];
    const [g, s] = [f.names[gi], f.names[si]];
    const gained = -ch.d[gi];
    // The two usual wrong divisions (by the new share, by the old share) must come to whole rupees as well.
    const G = pickAmount(rng, 60000, 900000, (v) => moves(v, ch) && (v * gained * ch.sn) % (ch.L * ch.neu[gi]) === 0 && (v * gained * ch.so) % (ch.L * ch.old[gi]) === 0);
    if (G === null) return null;
    const paid = moved(G, ch, gi);
    const parts = numeric(G, [
      [(paid * ch.sn) / ch.neu[gi], `Divided the compensation by ${g}'s new share, not by the share ${g} gained.`],
      [(paid * gained) / ch.L, 'Multiplied the compensation by the share gained; the goodwill of the firm is the compensation divided by that share.'],
      [(paid * ch.so) / ch.old[gi], `Divided the compensation by ${g}'s old share, not by the share ${g} gained.`],
    ]);
    return (
      parts && {
        prompt: `${f.intro} ${f.change} Goodwill was adjusted through the capital accounts without opening a Goodwill A/c: ${g}'s Capital A/c was debited and ${s}'s Capital A/c was credited with ${inr(paid)}. At what amount was the goodwill of the firm valued?`,
        ...parts,
        explanation: [
          moveText(ch, gi, g),
          'Compensation = goodwill of the firm x share gained, so goodwill of the firm = compensation divided by the share gained.',
          `Goodwill of the firm = ${inr(paid)} divided by ${frac(gained, ch.L)} = ${inr(paid)} x ${ch.L / gcd(gained, ch.L)}${gained / gcd(gained, ch.L) === 1 ? '' : ` / ${gained / gcd(gained, ch.L)}`} = ${inr(G)}.`,
        ],
        hints: ['The amount debited is goodwill x the share gained.', 'Find the share gained (new share - old share), then divide the compensation by it.'],
      }
    );
  },
  verify: checked((q: NumericQuestion) => {
    const g = given(q.prompt);
    const i = g.names.indexOf(/opening a Goodwill A\/c: ([A-Z][a-z]+)'s/.exec(q.prompt)![1]);
    return g.give[i] < 0 && near((q.answer / 100) * -g.give[i], amountsIn(q.prompt)[0]);
  }),
});

const ratioTemplates: Template[] = [shareChange, whoChanges, sacrificingRatio, gainingRatio, newRatioSurrender, newRatioAcquire];
const goodwillTemplates: Template[] = [gwCompensation, gwEntry, gwEntryCompound, gwWriteOff, gwTreatment, gwFromProfits, gwBoth, gwFindValue];

// ===============================================================================================================
// Reserves, accumulated profits and losses
// ===============================================================================================================

/** A balance built up before the change: a reserve or profit (credit) or a loss or fictitious asset (debit). */
export interface Held {
  id: string;
  /** As a Balance Sheet line: "General Reserve". */
  label: string;
  /** In a sentence, with its amount: "a General Reserve of ₹60,000". */
  phrase: (x: string) => string;
  credit: boolean;
  /** What it is, as the start of a sentence of working. */
  what: string;
}
export const HELD: Held[] = [
  { id: 'generalReserve', label: 'General Reserve', phrase: (x) => `a General Reserve of ${x}`, credit: true, what: 'General Reserve is profit set aside in past years' },
  { id: 'profitAndLoss', label: 'Profit and Loss A/c (credit balance)', phrase: (x) => `a credit balance of ${x} in Profit and Loss A/c`, credit: true, what: 'A credit balance of Profit and Loss A/c is profit not yet distributed' },
  { id: 'profitAndLoss', label: 'Profit and Loss A/c (debit balance)', phrase: (x) => `a debit balance of ${x} in Profit and Loss A/c`, credit: false, what: 'A debit balance of Profit and Loss A/c is a loss not yet written off' },
  { id: 'advertisementSuspense', label: 'Advertisement Suspense A/c', phrase: (x) => `Advertisement Suspense A/c of ${x} on the assets side`, credit: false, what: 'Advertisement Suspense is advertising cost not yet written off, a fictitious asset' },
  { id: 'deferredRevenueExpenditure', label: 'Deferred Revenue Expenditure', phrase: (x) => `Deferred Revenue Expenditure of ${x} on the assets side`, credit: false, what: 'Deferred Revenue Expenditure is an expense not yet written off, a fictitious asset' },
];
export const FICTITIOUS = [HELD[3], HELD[4]];
/** True when a prompt (or a Balance Sheet line) names a credit balance: a reserve or an undistributed profit. */
const isCreditBalance = (s: string): boolean => /General Reserve|credit balance|Compensation Reserve|Fluctuation Reserve/.test(s);
/** The net credit of Balance Sheet lines such as "General Reserve: ₹60,000", debit balances deducted. */
const heldNet = (rows: readonly string[]): number => total(rows.map((r) => (isCreditBalance(r) ? 1 : -1) * amountsIn(r)[0]));
const OLD_RATIO_WHY = 'Used the new ratio. The balance was built up before the change, so it belongs to the partners in the old ratio.';

const resShare = numericTemplate({
  id: 'cpr-res-share', topicId: T, conceptId: 'cpr-reserves', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const ch = anyChange(rng, true);
    const f = firmOf(rng, ch.old, ch.neu);
    const item = rng.pick(HELD);
    const R = pickAmount(rng, 20000, 400000, (v) => splits(v, ch.old) && splits(v, ch.neu));
    if (R === null) return null;
    const i = rng.int(0, ch.old.length - 1);
    const name = f.names[i];
    const amt = part(R, ch.old, i);
    const parts = numeric(amt, [
      [part(R, ch.neu, i), OLD_RATIO_WHY],
      [R / ch.old.length, 'Divided the balance equally among the partners, not in the old profit-sharing ratio.'],
      [moved(R, ch, i), `Took only the share ${name} gains or sacrifices. That is the working for one adjusting entry when a balance is left in the books; here it is ${item.credit ? 'distributed' : 'written off'}.`],
      [R, `Gave the whole balance, not ${name}'s share of it.`],
    ]);
    return (
      parts && {
        prompt: `${f.intro} ${f.change} The Balance Sheet on 31 March ${f.year} shows ${item.phrase(inr(R))}. ${item.credit ? 'The partners distribute it before the change takes effect.' : 'It is written off before the change takes effect.'} The capitals are fluctuating. By how much is ${name}'s Capital A/c ${item.credit ? 'credited' : 'debited'}?`,
        ...parts,
        explanation: [
          `${item.what}. It arose before the change, so it is ${item.credit ? 'credited' : 'debited'} to the partners in the old ratio ${ch.old.join(':')}.`,
          `${name}'s share = ${ch.old[i]}/${ch.so} of ${inr(R)} = ${inr(amt)}.`,
        ],
        hints: H.reserves,
      }
    );
  },
  verify: checked((q: NumericQuestion) => {
    const g = given(q.prompt);
    const i = g.names.indexOf(/([A-Z][a-z]+)'s Capital A\/c/.exec(q.prompt)![1]);
    return near(q.answer / 100, amountsIn(q.prompt)[0] * g.old[i]) && / credited\?$/.test(q.prompt) === isCreditBalance(q.prompt);
  }),
});

/** The lines that share `v` among the partners in a ratio, all on one side. */
export const sharedLines = (names: readonly string[], fixed: boolean, side: 'Dr' | 'Cr', v: number, r: readonly number[]): JournalLine[] =>
  names.map((name, i) => (side === 'Dr' ? dr : cr)(acct(name, fixed), part(v, r, i)));

const resEntry = journalTemplate({
  id: 'cpr-res-entry', topicId: T, conceptId: 'cpr-reserves', difficulty: 'easy',
  generate: (rng) => {
    const ch = anyChange(rng, true);
    const f = firmOf(rng, ch.old, ch.neu);
    const fixed = rng.int(0, 3) === 0;
    const item = rng.pick(HELD);
    const R = pickAmount(rng, 20000, 400000, (v) => splits(v, ch.old));
    if (R === null) return null;
    const own = fixed ? 'Current' : 'Capital';
    return {
      prompt: `${f.intro} ${f.change} The Balance Sheet on 31 March ${f.year} shows ${item.phrase(inr(R))}. ${capitalsLine(fixed)} Pass the journal entry to ${item.credit ? 'distribute' : 'write off'} this balance before the change takes effect.`,
      lines: item.credit ? [dr(item.id, R), ...sharedLines(f.names, fixed, 'Cr', R, ch.old)] : [...sharedLines(f.names, fixed, 'Dr', R, ch.old), cr(item.id, R)],
      explanation: [
        `${item.what}. It arose before the change, so it belongs to the partners in the old ratio ${ch.old.join(':')}.`,
        `Shares: ${eachOf(f.names, f.names.map((_, i) => part(R, ch.old, i)))}.`,
        item.credit
          ? `The balance is closed by a debit of ${inr(R)}, and each partner's ${own} A/c is credited.`
          : `Each partner's ${own} A/c is debited, and the balance is closed by a credit of ${inr(R)}.`,
      ],
      hints: H.reserves,
      distractorAccounts: ['revaluation', 'profitAndLossAppropriation', acct(f.names[0], !fixed), item.id === 'generalReserve' ? 'profitAndLoss' : 'generalReserve'],
    };
  },
  verify: checked((q: JournalQuestion) => {
    const g = given(q.prompt);
    const R = amountsIn(q.prompt)[0] * (isCreditBalance(q.prompt) ? 1 : -1);
    return g.names.every((name, i) => near(netCr(q, acct(name, fixedIn(q.prompt))), R * g.old[i]));
  }),
});

const resNet = numericTemplate({
  id: 'cpr-res-net', topicId: T, conceptId: 'cpr-reserves', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const ch = anyChange(rng);
    const f = firmOf(rng, ch.old, ch.neu);
    const ok = (v: number): boolean => splits(v, ch.old) && splits(v, ch.neu);
    const R = pickAmount(rng, 60000, 400000, ok);
    const plCredit = rng.int(0, 1) === 0;
    const P = pickAmount(rng, 10000, 120000, ok);
    const fict = rng.pick(FICTITIOUS);
    const D = pickAmount(rng, 5000, 60000, ok);
    const W = rng.int(0, 1) === 0 ? pickAmount(rng, 20000, 150000, ok) : 0;
    if (R === null || P === null || D === null || W === null) return null;
    const net = R + (plCredit ? P : -P) - D + W;
    if (net <= 0) return null;
    const i = rng.int(0, ch.old.length - 1);
    const name = f.names[i];
    const amt = part(net, ch.old, i);
    const parts = numeric(amt, [
      [part(R + P + D + W, ch.old, i), 'Added the debit balances to the reserves. A loss or a fictitious asset is debited to the partners, so it is deducted.'],
      [part(net, ch.neu, i), OLD_RATIO_WHY],
      [part(net + D, ch.old, i), `Left out ${fict.label}. It is not a real asset but an expense not yet written off, and it is debited to the partners.`],
      ...(W > 0 ? [[part(net - W, ch.old, i), 'Left out the Workmen Compensation Reserve. With no claim against it, the whole of it is distributed.'] as [number, string]] : []),
      [part(R, ch.old, i), 'Distributed only the General Reserve and ignored the other balances.'],
    ]);
    const rows = [
      `General Reserve: ${inr(R)}`,
      `Profit and Loss A/c (${plCredit ? 'credit' : 'debit'} balance): ${inr(P)}`,
      `${fict.label}: ${inr(D)}`,
      ...(W > 0 ? [`Workmen Compensation Reserve: ${inr(W)}`] : []),
    ];
    const credits = [R, ...(plCredit ? [P] : []), ...(W > 0 ? [W] : [])];
    const debits = [...(plCredit ? [] : [P]), D];
    return (
      parts && {
        prompt: [
          `${f.intro} ${f.change} The Balance Sheet on 31 March ${f.year} shows the balances below${W > 0 ? "; there is no claim for workmen's compensation" : ''}. The reserves are distributed and the losses written off before the change takes effect; the capitals are fluctuating. What is the net amount credited to ${name}'s Capital A/c?`,
          ...rows,
        ].join('\n'),
        ...parts,
        explanation: [
          `Credited to the partners (reserves and profits): ${credits.map(inr).join(' + ')}${credits.length > 1 ? ` = ${inr(total(credits))}` : ''}.`,
          `Debited to the partners (losses and fictitious assets): ${debits.map(inr).join(' + ')}${debits.length > 1 ? ` = ${inr(total(debits))}` : ''}.`,
          `Net credit = ${inr(total(credits))} - ${inr(total(debits))} = ${inr(net)}, shared in the old ratio ${ch.old.join(':')}.`,
          `${name}'s share = ${ch.old[i]}/${ch.so} of ${inr(net)} = ${inr(amt)}.`,
        ],
        hints: H.reserves,
      }
    );
  },
  verify: checked((q: NumericQuestion) => {
    const [first, ...rows] = q.prompt.split('\n');
    const g = given(first);
    const i = g.names.indexOf(/([A-Z][a-z]+)'s Capital A\/c/.exec(first)![1]);
    return near(q.answer / 100, heldNet(rows) * g.old[i]);
  }),
});

/** A reserve kept for one purpose (a compensation claim, a fall in the value of investments) and what it has to meet. */
interface Specific {
  /** The reserve in the books. */
  reserve: number;
  /** What it has to meet: the claim admitted, or the fall in the value of investments. */
  need: number;
}

const wcrAmount = numericTemplate({
  id: 'cpr-wcr-amount', topicId: T, conceptId: 'cpr-reserves', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const ch = anyChange(rng, true);
    const f = firmOf(rng, ch.old, ch.neu);
    const ok = (v: number): boolean => splits(v, ch.old) && splits(v, ch.neu);
    const kind = rng.pick(['less', 'less', 'more', 'none'] as const);
    // S is what the partners share: the surplus of the reserve, the shortfall, or the whole reserve.
    const s0 = pickAmount(rng, 10000, 150000, ok);
    const c0 = pickAmount(rng, 10000, 120000, ok);
    if (s0 === null || c0 === null) return null;
    // A reserve that falls short still meets the larger part of the claim.
    const [S, C] = kind === 'more' ? [Math.min(s0, c0), Math.max(s0, c0)] : [s0, c0];
    const w: Specific = kind === 'less' ? { reserve: S + C, need: C } : kind === 'more' ? { reserve: C, need: C + S } : { reserve: S, need: 0 };
    const i = rng.int(0, ch.old.length - 1);
    const name = f.names[i];
    const amt = part(S, ch.old, i);
    const errs: [number, string][] =
      kind === 'less'
        ? [
            [part(w.reserve, ch.old, i), 'Distributed the whole reserve and ignored the claim, which has to be met out of it first.'],
            [part(w.need, ch.old, i), 'Distributed the amount of the claim. It is the part of the reserve left after the claim that goes to the partners.'],
            [part(S, ch.neu, i), OLD_RATIO_WHY],
            [S, `Gave the whole surplus of the reserve, not ${name}'s share of it.`],
          ]
        : kind === 'more'
          ? [
              [part(w.need, ch.old, i), `Charged the whole claim to the partners. The reserve meets ${inr(w.reserve)} of it, and only the shortfall is a loss.`],
              [part(w.reserve, ch.old, i), 'Distributed the reserve. The claim uses up all of it, and the part not covered is a loss.'],
              [part(S, ch.neu, i), 'Used the new ratio. The shortfall is a loss on revaluation, shared in the old ratio.'],
              [S, `Gave the whole shortfall, not ${name}'s share of it.`],
            ]
          : [
              [part(S, ch.neu, i), OLD_RATIO_WHY],
              [S / ch.old.length, 'Divided the reserve equally among the partners, not in the old profit-sharing ratio.'],
              [moved(S, ch, i), `Took only the share ${name} gains or sacrifices; the reserve is being distributed, so the old share applies.`],
              [S, `Gave the whole reserve, not ${name}'s share of it.`],
            ];
    const parts = numeric(amt, errs);
    const claim = kind === 'none' ? "There is no claim for workmen's compensation against the firm." : `A claim of ${inr(w.need)} for workmen's compensation is admitted against the firm.`;
    const ask =
      kind === 'more'
        ? `The part of the claim that the reserve does not cover is charged to Revaluation A/c. How much of it is finally debited to ${name}'s Capital A/c?`
        : `By how much is ${name}'s Capital A/c credited out of this reserve?`;
    return (
      parts && {
        prompt: `${f.intro} ${f.change} The Balance Sheet on 31 March ${f.year} shows a Workmen Compensation Reserve of ${inr(w.reserve)}. ${claim} The capitals are fluctuating. ${ask}`,
        ...parts,
        explanation:
          kind === 'less'
            ? [
                `The claim of ${inr(w.need)} is met out of the reserve first: ${inr(w.reserve)} - ${inr(w.need)} = ${inr(S)} is free.`,
                `The free part is credited to the partners in the old ratio ${ch.old.join(':')}.`,
                `${name}'s share = ${ch.old[i]}/${ch.so} of ${inr(S)} = ${inr(amt)}.`,
              ]
            : kind === 'more'
              ? [
                  `The reserve of ${inr(w.reserve)} meets only a part of the claim: shortfall = ${inr(w.need)} - ${inr(w.reserve)} = ${inr(S)}.`,
                  `The shortfall is a loss debited to Revaluation A/c, and the loss on revaluation is borne in the old ratio ${ch.old.join(':')}.`,
                  `${name}'s share = ${ch.old[i]}/${ch.so} of ${inr(S)} = ${inr(amt)}.`,
                ]
              : [
                  `There is no claim, so the whole reserve of ${inr(S)} is free and is credited to the partners in the old ratio ${ch.old.join(':')}.`,
                  `${name}'s share = ${ch.old[i]}/${ch.so} of ${inr(S)} = ${inr(amt)}.`,
                ],
        hints: H.specific,
      }
    );
  },
  verify: checked((q: NumericQuestion) => {
    const g = given(q.prompt);
    const i = g.names.indexOf(/([A-Z][a-z]+)'s Capital A\/c/.exec(q.prompt)![1]);
    const [reserve, claim = 0] = amountsIn(q.prompt);
    return near(q.answer / 100, Math.abs(reserve - claim) * g.old[i]) && q.prompt.includes('finally debited') === claim > reserve;
  }),
});

/** The liability for a claim admitted, under the name the chart gives it and the one many textbooks use. */
export const CLAIM_ACCOUNT = 'Workmen Compensation Claim A/c (many books call it Provision for Workmen Compensation Claim A/c)';

const wcrEntry = journalTemplate({
  id: 'cpr-wcr-entry', topicId: T, conceptId: 'cpr-reserves', difficulty: 'medium',
  generate: (rng) => {
    const ch = anyChange(rng, true);
    const f = firmOf(rng, ch.old, ch.neu);
    const fixed = rng.int(0, 3) === 0;
    const kind = rng.pick(['less', 'less', 'more', 'equal', 'none'] as const);
    const s0 = pickAmount(rng, 10000, 150000, (v) => splits(v, ch.old));
    if (s0 === null) return null;
    const c0 = rng.step(10000, 120000, 5000);
    const [S, C] = kind === 'more' ? [Math.min(s0, c0), Math.max(s0, c0)] : [s0, c0];
    const w: Specific = kind === 'less' ? { reserve: S + C, need: C } : kind === 'more' ? { reserve: C, need: C + S } : kind === 'equal' ? { reserve: C, need: C } : { reserve: S, need: 0 };
    const own = fixed ? 'Current' : 'Capital';
    const lines: JournalLine[] = [
      dr('workmenCompensationReserve', w.reserve),
      ...(kind === 'more' ? [dr('revaluation', S)] : []),
      ...(w.need > 0 ? [cr('workmenCompensationClaim', w.need)] : []),
      ...(kind === 'less' || kind === 'none' ? sharedLines(f.names, fixed, 'Cr', S, ch.old) : []),
    ];
    const claim = kind === 'none' ? "There is no claim for workmen's compensation against the firm." : `A claim of ${inr(w.need)} for workmen's compensation is admitted against the firm.`;
    return {
      prompt: `${f.intro} ${f.change} The Balance Sheet on 31 March ${f.year} shows a Workmen Compensation Reserve of ${inr(w.reserve)}. ${claim} ${capitalsLine(fixed)} Pass one journal entry for the reserve${kind === 'none' ? '' : ' and the claim'}.`,
      lines,
      explanation:
        kind === 'less'
          ? [
              `Workmen Compensation Reserve A/c is closed by a debit of ${inr(w.reserve)}.`,
              `The claim of ${inr(w.need)} becomes a liability: ${CLAIM_ACCOUNT} is credited.`,
              `What is left, ${inr(w.reserve)} - ${inr(w.need)} = ${inr(S)}, is a free reserve credited to the partners' ${own} A/cs in the old ratio ${ch.old.join(':')}: ${eachOf(f.names, f.names.map((_, i) => part(S, ch.old, i)))}.`,
            ]
          : kind === 'more'
            ? [
                `Workmen Compensation Reserve A/c is closed by a debit of ${inr(w.reserve)}, but the claim is ${inr(w.need)}.`,
                `The shortfall, ${inr(w.need)} - ${inr(w.reserve)} = ${inr(S)}, is a loss: Revaluation A/c is debited.`,
                `The whole claim of ${inr(w.need)} becomes a liability: ${CLAIM_ACCOUNT} is credited. Nothing is left for the partners.`,
              ]
            : kind === 'equal'
              ? [
                  `The claim takes the whole reserve: Workmen Compensation Reserve A/c is debited with ${inr(w.reserve)}.`,
                  `${CLAIM_ACCOUNT}, a liability, is credited with the same amount. Nothing is left for the partners and there is no loss.`,
                ]
              : [
                  `With no claim against it, the whole reserve of ${inr(S)} is free: Workmen Compensation Reserve A/c is debited.`,
                  `It is credited to the partners' ${own} A/cs in the old ratio ${ch.old.join(':')}: ${eachOf(f.names, f.names.map((_, i) => part(S, ch.old, i)))}.`,
                ],
      hints: H.specific,
      distractorAccounts: ['revaluation', 'generalReserve', 'workmenCompensationClaim', acct(f.names[0], fixed), acct(f.names[0], !fixed)],
    };
  },
  verify: checked((q: JournalQuestion) => {
    const g = given(q.prompt);
    const [reserve, claim = 0] = amountsIn(q.prompt);
    return (
      netCr(q, 'workmenCompensationReserve') === -reserve &&
      netCr(q, 'workmenCompensationClaim') === claim &&
      netCr(q, 'revaluation') === -Math.max(claim - reserve, 0) &&
      g.names.every((name, i) => near(netCr(q, acct(name, fixedIn(q.prompt))), Math.max(reserve - claim, 0) * g.old[i]))
    );
  }),
});

const ifrAmount = numericTemplate({
  id: 'cpr-ifr-amount', topicId: T, conceptId: 'cpr-reserves', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const ch = anyChange(rng, true);
    const f = firmOf(rng, ch.old, ch.neu);
    const ok = (v: number): boolean => splits(v, ch.old) && splits(v, ch.neu);
    const kind = rng.pick(['less', 'less', 'more', 'same', 'rise'] as const);
    const s0 = pickAmount(rng, 10000, 120000, ok);
    const x0 = pickAmount(rng, 5000, 80000, ok);
    if (s0 === null || x0 === null) return null;
    // A reserve that falls short still covers the larger part of the fall.
    const [S, X] = kind === 'more' ? [Math.min(s0, x0), Math.max(s0, x0)] : [s0, x0];
    const book = rng.step(250000, 800000, 10000);
    // Reserve and market value for each case: X is the fall (or the rise), S what the partners share.
    const reserve = kind === 'less' ? S + X : kind === 'more' ? X : S;
    const market = kind === 'less' ? book - X : kind === 'more' ? book - X - S : kind === 'same' ? book : book + X;
    const fall = book - market;
    const i = rng.int(0, ch.old.length - 1);
    const name = f.names[i];
    const shared = kind === 'rise' ? S + X : S;
    const amt = part(shared, ch.old, i);
    const errs: [number, string][] =
      kind === 'less'
        ? [
            [part(reserve, ch.old, i), 'Distributed the whole reserve and ignored the fall in the value of the investments, which is met out of it first.'],
            [part(fall, ch.old, i), 'Distributed the fall in value. It is the part of the reserve left after the fall that goes to the partners.'],
            [part(S, ch.neu, i), OLD_RATIO_WHY],
            [S, `Gave the whole free part of the reserve, not ${name}'s share of it.`],
          ]
        : kind === 'more'
          ? [
              [part(fall, ch.old, i), `Charged the whole fall in value to the partners. The reserve absorbs ${inr(reserve)} of it, and only the rest is a loss.`],
              [part(reserve, ch.old, i), 'Distributed the reserve. The fall in value uses up all of it, and the part not covered is a loss.'],
              [part(S, ch.neu, i), 'Used the new ratio. The uncovered fall is a loss on revaluation, shared in the old ratio.'],
              [S, `Gave the whole uncovered fall, not ${name}'s share of it.`],
            ]
          : kind === 'same'
            ? [
                [part(S, ch.neu, i), OLD_RATIO_WHY],
                [S / ch.old.length, 'Divided the reserve equally among the partners, not in the old profit-sharing ratio.'],
                [moved(S, ch, i), `Took only the share ${name} gains or sacrifices; the reserve is being distributed, so the old share applies.`],
                [S, `Gave the whole reserve, not ${name}'s share of it.`],
              ]
            : [
                [part(S, ch.old, i), 'Left out the rise in the value of the investments, which is credited to Revaluation A/c and also shared in the old ratio.'],
                [part(X, ch.old, i), 'Left out the reserve. Nothing has to be met out of it, so the whole of it is distributed.'],
                [part(S - X, ch.old, i), 'Deducted the rise in value from the reserve as if it were a fall.'],
                [part(S + X, ch.neu, i), OLD_RATIO_WHY],
              ];
    const parts = numeric(amt, errs);
    const ask =
      kind === 'more'
        ? `The part of the fall in value that the reserve does not cover is charged to Revaluation A/c. How much of it is finally debited to ${name}'s Capital A/c?`
        : kind === 'rise'
          ? `What total amount is credited to ${name}'s Capital A/c on account of the reserve and the rise in the value of the investments?`
          : `By how much is ${name}'s Capital A/c credited out of the Investment Fluctuation Reserve?`;
    return (
      parts && {
        prompt: `${f.intro} ${f.change} The Balance Sheet on 31 March ${f.year} shows Investments at ${inr(book)} and an Investment Fluctuation Reserve of ${inr(reserve)}. The market value of the investments on that date is ${inr(market)}${kind === 'same' ? ', the same as their book value' : ''}, and they are to be shown at market value. The capitals are fluctuating. ${ask}`,
        ...parts,
        explanation:
          kind === 'less'
            ? [
                `Fall in value = ${inr(book)} - ${inr(market)} = ${inr(fall)}, met out of the reserve.`,
                `Free part of the reserve = ${inr(reserve)} - ${inr(fall)} = ${inr(S)}, credited to the partners in the old ratio ${ch.old.join(':')}.`,
                `${name}'s share = ${ch.old[i]}/${ch.so} of ${inr(S)} = ${inr(amt)}.`,
              ]
            : kind === 'more'
              ? [
                  `Fall in value = ${inr(book)} - ${inr(market)} = ${inr(fall)}; the reserve absorbs ${inr(reserve)} of it.`,
                  `Uncovered fall = ${inr(fall)} - ${inr(reserve)} = ${inr(S)}, a loss debited to Revaluation A/c and borne in the old ratio ${ch.old.join(':')}.`,
                  `${name}'s share = ${ch.old[i]}/${ch.so} of ${inr(S)} = ${inr(amt)}.`,
                ]
              : kind === 'same'
                ? [
                    `The investments have not fallen in value, so the whole reserve of ${inr(S)} is free and is credited to the partners in the old ratio ${ch.old.join(':')}.`,
                    `${name}'s share = ${ch.old[i]}/${ch.so} of ${inr(S)} = ${inr(amt)}.`,
                  ]
                : [
                    `The investments have not fallen in value, so the whole reserve of ${inr(S)} is free and is credited to the partners in the old ratio.`,
                    `Rise in value = ${inr(market)} - ${inr(book)} = ${inr(X)}: a gain credited to Revaluation A/c, which also goes to the partners in the old ratio.`,
                    `Total = ${inr(S)} + ${inr(X)} = ${inr(S + X)}; ${name}'s share = ${ch.old[i]}/${ch.so} of ${inr(S + X)} = ${inr(amt)}.`,
                  ],
        hints: H.specific,
      }
    );
  },
  verify: checked((q: NumericQuestion) => {
    const g = given(q.prompt);
    const i = g.names.indexOf(/([A-Z][a-z]+)'s Capital A\/c/.exec(q.prompt)![1]);
    const [book, reserve, market] = amountsIn(q.prompt);
    // What reaches the capital accounts in the end: the reserve, less a fall in value or plus a rise.
    const net = reserve - (book - market);
    return near(q.answer / 100, Math.abs(net) * g.old[i]) && q.prompt.includes('finally debited') === net < 0;
  }),
});

const ifrEntry = journalTemplate({
  id: 'cpr-ifr-entry', topicId: T, conceptId: 'cpr-reserves', difficulty: 'complex',
  generate: (rng) => {
    const ch = anyChange(rng);
    const f = firmOf(rng, ch.old, ch.neu);
    const fixed = rng.int(0, 3) === 0;
    const kind = rng.pick(['less', 'less', 'more', 'more', 'same'] as const);
    const s0 = pickAmount(rng, 10000, 120000, (v) => splits(v, ch.old));
    if (s0 === null) return null;
    const x0 = rng.step(5000, 80000, 5000);
    const [S, X] = kind === 'more' ? [Math.min(s0, x0), Math.max(s0, x0)] : [s0, x0];
    const book = rng.step(250000, 800000, 10000);
    const reserve = kind === 'less' ? S + X : kind === 'more' ? X : S;
    const market = kind === 'less' ? book - X : kind === 'more' ? book - X - S : book;
    const fall = book - market;
    const own = fixed ? 'Current' : 'Capital';
    const lines: JournalLine[] = [
      dr('investmentFluctuationReserve', reserve),
      ...(kind === 'more' ? [dr('revaluation', S)] : []),
      ...(fall > 0 ? [cr('investments', fall)] : []),
      ...(kind === 'more' ? [] : sharedLines(f.names, fixed, 'Cr', S, ch.old)),
    ];
    return {
      prompt: `${f.intro} ${f.change} The Balance Sheet on 31 March ${f.year} shows Investments at ${inr(book)} and an Investment Fluctuation Reserve of ${inr(reserve)}. The market value of the investments on that date is ${inr(market)}${kind === 'same' ? ', the same as their book value' : ''}, and they are to be shown at market value. ${capitalsLine(fixed)} Pass one journal entry for the reserve${kind === 'same' ? '' : ' and the fall in value'}.`,
      lines,
      explanation:
        kind === 'less'
          ? [
              `Fall in value = ${inr(book)} - ${inr(market)} = ${inr(fall)}: Investments A/c is credited.`,
              `Investment Fluctuation Reserve A/c is closed by a debit of ${inr(reserve)}; it covers the fall.`,
              `What is left, ${inr(reserve)} - ${inr(fall)} = ${inr(S)}, is credited to the partners' ${own} A/cs in the old ratio ${ch.old.join(':')}: ${eachOf(f.names, f.names.map((_, i) => part(S, ch.old, i)))}.`,
            ]
          : kind === 'more'
            ? [
                `Fall in value = ${inr(book)} - ${inr(market)} = ${inr(fall)}: Investments A/c is credited.`,
                `Investment Fluctuation Reserve A/c is closed by a debit of ${inr(reserve)}, which covers only a part of the fall.`,
                `The rest, ${inr(fall)} - ${inr(reserve)} = ${inr(S)}, is a loss: Revaluation A/c is debited. Nothing is left for the partners.`,
              ]
            : [
                `The investments have not fallen in value, so nothing has to be met out of the reserve: Investment Fluctuation Reserve A/c is closed by a debit of ${inr(S)}.`,
                `It is credited to the partners' ${own} A/cs in the old ratio ${ch.old.join(':')}: ${eachOf(f.names, f.names.map((_, i) => part(S, ch.old, i)))}.`,
              ],
      hints: H.specific,
      distractorAccounts: ['revaluation', 'investments', 'generalReserve', acct(f.names[0], fixed), acct(f.names[0], !fixed)],
    };
  },
  verify: checked((q: JournalQuestion) => {
    const g = given(q.prompt);
    const [book, reserve, market] = amountsIn(q.prompt);
    const fall = book - market;
    return (
      netCr(q, 'investmentFluctuationReserve') === -reserve &&
      netCr(q, 'investments') === fall &&
      netCr(q, 'revaluation') === -Math.max(fall - reserve, 0) &&
      g.names.every((name, i) => near(netCr(q, acct(name, fixedIn(q.prompt))), Math.max(reserve - fall, 0) * g.old[i]))
    );
  }),
});

const resTreatment = mcqTemplate({
  id: 'cpr-res-treatment', topicId: T, conceptId: 'cpr-reserves', difficulty: 'easy',
  generate: (rng) => {
    const ch = anyChange(rng, true);
    const f = firmOf(rng, ch.old, ch.neu);
    const n = ch.old.length;
    const item = rng.pick(HELD);
    const R = pickAmount(rng, 20000, 400000, (v) => splits(v, ch.old) && splits(v, ch.neu) && v % n === 0);
    if (R === null) return null;
    const by = (r: readonly number[]): number[] => f.names.map((_, i) => part(R, r, i));
    const say = (credit: boolean, v: number[]): string => `${credit ? 'Credited' : 'Debited'} to the Capital A/cs: ${eachOf(f.names, v)}`;
    return choice(
      `${f.intro} ${f.change} The Balance Sheet on 31 March ${f.year} shows ${item.phrase(inr(R))}, which is to be closed before the change takes effect. The capitals are fluctuating. How is it dealt with?`,
      say(item.credit, by(ch.old)),
      [
        [say(item.credit, by(ch.neu)), OLD_RATIO_WHY],
        [
          say(!item.credit, by(ch.old)),
          item.credit ? 'Debited a reserve or an undistributed profit. It is a gain of the partners, so it is credited to them.' : 'Credited a loss or a fictitious asset. It is a loss of the partners, so it is debited to them.',
        ],
        [say(item.credit, f.names.map(() => R / n)), 'Divided the balance equally among the partners, not in the old profit-sharing ratio.'],
        [say(!item.credit, by(ch.neu)), 'Took the wrong side, and the new ratio in place of the old ratio.'],
      ],
      `${item.what}. It arose before the change, so it is ${item.credit ? 'credited' : 'debited'} to the partners in the old ratio ${ch.old.join(':')}: ${eachOf(f.names, by(ch.old))}.`,
      H.reserves,
      { rng, first: 2 },
    );
  },
  verify: checked((q: McqQuestion) => {
    const g = given(q.prompt);
    const text = optionText(q);
    const R = amountsIn(q.prompt)[0];
    return text.startsWith('Credited') === isCreditBalance(q.prompt) && amountsIn(text).every((v, i) => near(v, R * g.old[i]));
  }),
});

const reserveTemplates: Template[] = [resShare, resEntry, resNet, wcrAmount, wcrEntry, ifrAmount, ifrEntry, resTreatment];

// ===============================================================================================================
// Revaluation of assets and reassessment of liabilities
// ===============================================================================================================

/** One change in the value of an asset or a liability, agreed on the change of ratio. */
export interface RevItem {
  /** The change as a clause: "the building is to be appreciated by ₹40,000". */
  text: string;
  /** What it does to the firm, in rupees: above zero a gain (credited to Revaluation A/c), below zero a loss. */
  effect: number;
  dr: string;
  cr: string;
  /** The working, one line. */
  work: string;
  /** The usual slip with this item: the effect a student who makes it arrives at, and the mistake. */
  slip?: { effect: number; why: string };
  /** A figure of the item that is not the change itself (the revised value, the whole of the creditors). */
  gross?: number;
  /** True when the item changes the total of the assets side of the Balance Sheet. */
  asset: boolean;
}
export interface RevKind {
  min: number;
  max: number;
  step: number;
  sign: 1 | -1;
  /** True when the change can be given through other figures (a revised value, a percentage). */
  figures: boolean;
  make(rng: Rng, x: number, computed: boolean): RevItem;
}
const GAIN = 'a gain, credited to Revaluation A/c';
const LOSS = 'a loss, debited to Revaluation A/c';
/** A book value of at least `least`, in steps of `step`, not above `most`. */
const bookValue = (rng: Rng, least: number, most: number, step: number): number => rng.step(Math.ceil(least / step) * step, Math.max(most, Math.ceil(least / step) * step), step);

const ASSET_UP: RevKind = {
  min: 20000, max: 100000, step: 10000, sign: 1, figures: true,
  make: (rng, x, computed) => {
    const [id, a] = rng.pick([['building', 'building'], ['land', 'land']] as const);
    const form = computed ? rng.pick(['value', 'percent'] as const) : 'direct';
    const p = rng.pick([10, 20, 25]);
    const B = form === 'percent' ? (x * 100) / p : bookValue(rng, Math.max(200000, 2 * x), 900000, 50000);
    const base = { effect: x, dr: id, cr: 'revaluation', asset: true };
    if (form === 'direct') return { ...base, text: `the ${a} is to be appreciated by ${inr(x)}`, work: `The ${a} goes up by ${inr(x)}: ${GAIN}.` };
    if (form === 'value') return { ...base, text: `the ${a}, shown in the books at ${inr(B)}, is to be revalued at ${inr(B + x)}`, work: `The ${a}: ${inr(B + x)} - ${inr(B)} = ${inr(x)} more: ${GAIN}.`, gross: B + x };
    return { ...base, text: `the ${a}, shown in the books at ${inr(B)}, is to be appreciated by ${p}%`, work: `The ${a}: ${p}% of ${inr(B)} = ${inr(x)} more: ${GAIN}.`, gross: B + x };
  },
};
/** An asset written down: machinery or furniture, or the stock. */
const writtenDown = (assets: readonly string[], min: number, max: number): RevKind => ({
  min, max, step: 5000, sign: -1, figures: true,
  make: (rng, x, computed) => {
    const a = rng.pick(assets);
    const form = computed ? rng.pick(['value', 'percent'] as const) : 'direct';
    const p = rng.pick([5, 10, 20]);
    const B = form === 'percent' ? (x * 100) / p : bookValue(rng, Math.max(100000, 3 * x), 600000, 10000);
    const base = { effect: -x, dr: 'revaluation', cr: a, asset: true };
    if (form === 'direct') return { ...base, text: `the value of the ${a} is to be reduced by ${inr(x)}`, work: `The ${a} goes down by ${inr(x)}: ${LOSS}.` };
    if (form === 'value') return { ...base, text: `the ${a}, shown in the books at ${inr(B)}, is to be valued at ${inr(B - x)}`, work: `The ${a}: ${inr(B)} - ${inr(B - x)} = ${inr(x)} less: ${LOSS}.`, gross: B - x };
    return { ...base, text: `the ${a}, shown in the books at ${inr(B)}, is to be written down by ${p}%`, work: `The ${a}: ${p}% of ${inr(B)} = ${inr(x)} less: ${LOSS}.`, gross: B - x };
  },
});
const FIXED_DOWN = writtenDown(['machinery', 'furniture'], 10000, 80000);
const STOCK_DOWN = writtenDown(['stock'], 5000, 40000);
const PROVISION: RevKind = {
  min: 2000, max: 15000, step: 1000, sign: -1, figures: true,
  make: (rng, x, computed) => {
    const form = computed ? rng.pick(['new', 'raised'] as const) : 'direct';
    const p = rng.pick([5, 10]);
    const P = rng.step(2000, 10000, 1000);
    const base = { effect: -x, dr: 'revaluation', cr: 'provisionForDoubtfulDebts', asset: true };
    const asGain = { effect: x, why: 'Treated the bigger provision for doubtful debts as a gain. A provision lowers the value of the debtors, so raising it is a loss.' };
    if (form === 'direct') return { ...base, text: `the provision for doubtful debts is to be increased by ${inr(x)}`, work: `The provision for doubtful debts goes up by ${inr(x)}: ${LOSS}.`, slip: asGain };
    if (form === 'new') {
      const D = (x * 100) / p;
      const newAsGain = { effect: x, why: 'Treated the new provision for doubtful debts as a gain. A provision lowers the value of the debtors, so creating it is a loss.' };
      return { ...base, text: `a provision for doubtful debts of ${p}% is to be created on debtors of ${inr(D)}`, work: `Provision for doubtful debts = ${p}% of ${inr(D)} = ${inr(x)}: ${LOSS}.`, slip: newAsGain };
    }
    const D = ((P + x) * 100) / p;
    return {
      ...base,
      text: `the provision for doubtful debts, at present ${inr(P)}, is to be raised to ${p}% of debtors of ${inr(D)}`,
      work: `Provision needed = ${p}% of ${inr(D)} = ${inr(P + x)}; increase = ${inr(P + x)} - ${inr(P)} = ${inr(x)}: ${LOSS}.`,
      slip: { effect: -(P + x), why: `Charged the whole of the new provision. ${inr(P)} is already in the books, so only the increase is a loss.` },
      gross: P + x,
    };
  },
};
const OUTSTANDING: RevKind = {
  min: 2000, max: 20000, step: 1000, sign: -1, figures: false,
  make: (rng, x) => {
    const e = rng.pick(['salaries', 'wages', 'expenses']);
    return {
      effect: -x, dr: 'revaluation', cr: 'outstandingExpenses', asset: false,
      text: `${e} of ${inr(x)} are outstanding and are to be recorded`,
      work: `Outstanding ${e} of ${inr(x)} are a liability that was left out: ${LOSS}.`,
      slip: { effect: x, why: 'Treated the outstanding expense as a gain. A liability that was left out is a loss when it is brought into the books.' },
    };
  },
};
const CREDITORS: RevKind = {
  min: 3000, max: 20000, step: 1000, sign: 1, figures: true,
  make: (rng, x, computed) => {
    const C = bookValue(rng, Math.max(40000, 3 * x), 200000, 10000);
    const base = { effect: x, dr: 'creditors', cr: 'revaluation', asset: false };
    const asLoss = { effect: -x, why: 'Treated the creditors written back as a loss. A liability that goes down is a gain.' };
    return computed
      ? { ...base, text: `creditors of ${inr(C)} include ${inr(x)} that is no longer payable and is to be written back`, work: `Creditors go down by ${inr(x)}: ${GAIN}.`, slip: asLoss, gross: C }
      : { ...base, text: `creditors of ${inr(x)} are not likely to claim and are to be written back`, work: `Creditors go down by ${inr(x)}: ${GAIN}.`, slip: asLoss };
  },
};
const UNRECORDED: RevKind = {
  min: 10000, max: 40000, step: 5000, sign: 1, figures: false,
  make: (rng, x) => {
    const [id, text, what] = rng.pick([
      ['investments', `investments of ${inr(x)}, not recorded in the books so far, are to be brought in`, `The unrecorded investments of ${inr(x)} come`],
      ['computers', `a computer worth ${inr(x)}, not recorded in the books so far, is to be brought in`, `The unrecorded computer of ${inr(x)} comes`],
    ] as const);
    return {
      effect: x, dr: id, cr: 'revaluation', asset: true, text,
      work: `${what} into the books: ${GAIN}.`,
      slip: { effect: 0, why: 'Left out the asset that was not in the books. An unrecorded asset is brought in through Revaluation A/c as a gain.' },
    };
  },
};
const ACCRUED: RevKind = {
  min: 2000, max: 15000, step: 1000, sign: 1, figures: false,
  make: (_rng, x) => ({
    effect: x, dr: 'accruedIncome', cr: 'revaluation', asset: true,
    text: `accrued income of ${inr(x)}, not recorded in the books so far, is to be brought in`,
    work: `Accrued income of ${inr(x)} comes into the books as an asset: ${GAIN}.`,
    slip: { effect: 0, why: 'Left out the accrued income that was not in the books. An unrecorded asset is brought in through Revaluation A/c as a gain.' },
  }),
};
export const REV_KINDS = [ASSET_UP, FIXED_DOWN, STOCK_DOWN, PROVISION, OUTSTANDING, CREDITORS, UNRECORDED, ACCRUED];

/**
 * One item of each kind given, in that order. The amounts are drawn, except the last, which is chosen so that the
 * total effect passes `ok` (it comes to whole rupees for every partner, say). Null when no amount does.
 */
function revItemsOf(rng: Rng, kinds: readonly RevKind[], computed: boolean | 'mixed', ok: (sum: number) => boolean): RevItem[] | null {
  const items: RevItem[] = [];
  let sum = 0;
  for (const [t, kind] of kinds.entries()) {
    const x = t < kinds.length - 1 ? rng.step(kind.min, kind.max, kind.step) : pickAmount(rng, kind.min, kind.max, (v) => ok(sum + kind.sign * v));
    if (x === null) return null;
    const item = kind.make(rng, x, computed === 'mixed' ? rng.int(0, 1) === 0 : computed);
    items.push(item);
    sum += item.effect;
  }
  return items;
}
const revItems = (rng: Rng, count: number, computed: boolean | 'mixed', ok: (sum: number) => boolean): RevItem[] | null =>
  revItemsOf(rng, rng.shuffle(REV_KINDS).slice(0, count), computed, ok);
/** The items as lettered lines of a prompt: "(a) The building is to be appreciated by ₹40,000." */
const lettered = (texts: readonly string[]): string[] => texts.map((text, t) => `(${'abcdefgh'[t]}) ${upper(text)}.`);
const profitOrLoss = (v: number): string => (v > 0 ? `Profit of ${inr(v)}` : v < 0 ? `Loss of ${inr(-v)}` : 'No profit and no loss');

/** What an item, read back from its text, does to the firm: the second way to the same figure, for `verify`. */
export function effectIn(text: string): number {
  const a = amountsIn(text);
  const p = Number(/(\d+)%/.exec(text)?.[1]);
  if (text.includes('provision for doubtful debts')) return text.includes('increased by') ? -a[0] : text.includes('at present') ? a[0] - (a[1] * p) / 100 : -(a[0] * p) / 100;
  if (text.includes('outstanding')) return -a[0];
  if (/creditors/i.test(text)) return text.includes('include') ? a[1] : a[0];
  if (text.includes('not recorded in the books')) return a[0];
  if (text.includes('appreciated by')) return Number.isNaN(p) ? a[0] : (a[0] * p) / 100;
  if (text.includes('written down by')) return -(a[0] * p) / 100;
  if (text.includes('reduced by')) return -a[0];
  if (text.includes('valued at')) return a[1] - a[0];
  throw new Error(`not an item of revaluation: ${text}`);
}
const itemIn = (prompt: string): string => /partners agree that (.*?)\. /.exec(prompt)![1];

function revItemEntry(rng: Rng, computed: boolean): JournalParts | null {
  const ch = anyChange(rng, true);
  const f = firmOf(rng, ch.old, ch.neu);
  const kind = rng.pick(computed ? REV_KINDS.filter((k) => k.figures) : REV_KINDS);
  const [item] = revItemsOf(rng, [kind], computed, (sum) => sum !== 0) ?? [];
  if (!item) return null;
  const x = Math.abs(item.effect);
  return {
    prompt: `${f.intro} ${f.change} On the change the partners agree that ${item.text}. Pass the journal entry for this adjustment.`,
    lines: [dr(item.dr, x), cr(item.cr, x)],
    explanation: [
      item.work,
      item.effect > 0 ? `So the asset or liability account that changes is debited and Revaluation A/c is credited with ${inr(x)}.` : `So Revaluation A/c is debited and the asset, provision or liability account that changes is credited with ${inr(x)}.`,
      'The balance of Revaluation A/c will later go to the partners in the old ratio.',
    ],
    hints: H.revaluation,
    distractorAccounts: ['profitAndLoss', 'profitAndLossAppropriation', partnerCapital(f.names[0]), 'generalReserve'],
  };
}
const revItemEntryHolds = checked((q: JournalQuestion) => netCr(q, 'revaluation') === effectIn(itemIn(q.prompt)) && q.expected.length === 2);

const revItemEntryDirect = journalTemplate({
  id: 'cpr-rev-item-entry', topicId: T, conceptId: 'cpr-revaluation', difficulty: 'easy',
  generate: (rng) => revItemEntry(rng, false),
  verify: revItemEntryHolds,
});

const revEntryComputed = journalTemplate({
  id: 'cpr-rev-entry-computed', topicId: T, conceptId: 'cpr-revaluation', difficulty: 'medium', computed: true,
  generate: (rng) => revItemEntry(rng, true),
  verify: revItemEntryHolds,
});

const revItemSide = mcqTemplate({
  id: 'cpr-rev-item-side', topicId: T, conceptId: 'cpr-revaluation', difficulty: 'easy',
  generate: (rng) => {
    const ch = anyChange(rng, true);
    const f = firmOf(rng, ch.old, ch.neu);
    const [item] = revItems(rng, 1, 'mixed', (sum) => sum !== 0) ?? [];
    if (!item) return null;
    const x = Math.abs(item.effect);
    const side = (gain: boolean): string => (gain ? 'credit' : 'debit');
    const say = (v: number, gain: boolean): string => `${inr(v)} on the ${side(gain)} side of Revaluation A/c`;
    const gain = item.effect > 0;
    return choice(
      `${f.intro} ${f.change} On the change the partners agree that ${item.text}. How is this shown in Revaluation A/c?`,
      say(x, gain),
      [
        [
          say(x, !gain),
          gain
            ? 'Took a gain for a loss. An asset going up or a liability going down is a gain, and gains are credited to Revaluation A/c.'
            : 'Took a loss for a gain. An asset going down, or a liability or provision going up, is a loss, and losses are debited to Revaluation A/c.',
        ],
        ...(item.gross ? [[say(item.gross, gain), 'Entered a whole balance from the question. Only the change in value passes through Revaluation A/c.'] as [string, string]] : []),
        [
          `Nothing in Revaluation A/c: ${inr(x)} goes straight to the partners' Capital A/cs in the new ratio`,
          'Skipped Revaluation A/c and used the new ratio. Every change in value agreed on the change of ratio passes through Revaluation A/c, and its result is shared in the old ratio.',
        ],
        [`${inr(x)} on the ${side(gain)} side of Profit and Loss Appropriation A/c`, "Used the account that shares out the year's profit. A change in the value of an asset or a liability goes to Revaluation A/c."],
      ],
      `${item.work} The balance of Revaluation A/c goes to the partners in the old ratio.`,
      H.revaluation,
      { rng, first: 1 },
    );
  },
  verify: checked((q: McqQuestion) => {
    const effect = effectIn(itemIn(q.prompt));
    const m = /^(₹[\d,]+) on the (credit|debit) side of Revaluation A\/c$/.exec(optionText(q))!;
    return amountsIn(m[1])[0] === Math.abs(effect) && (m[2] === 'credit') === effect > 0;
  }),
});

const REVALUED = 'On the change the assets and liabilities are revalued as given below.';

const revResult = mcqTemplate({
  id: 'cpr-rev-result', topicId: T, conceptId: 'cpr-revaluation', difficulty: 'medium',
  // Version 2: a side with nothing on it is said so ("No gains"), not printed as "₹0".
  version: 2,
  generate: (rng) => {
    const ch = anyChange(rng, true);
    const f = firmOf(rng, ch.old, ch.neu);
    const items = revItems(rng, 3, 'mixed', (sum) => sum !== 0);
    if (!items) return null;
    const sum = total(items.map((it) => it.effect));
    const gains = items.filter((it) => it.effect > 0).map((it) => it.effect);
    const losses = items.filter((it) => it.effect < 0).map((it) => -it.effect);
    return choice(
      [`${f.intro} ${f.change} ${REVALUED} What does Revaluation A/c show?`, ...lettered(items.map((it) => it.text))].join('\n'),
      profitOrLoss(sum),
      [
        [profitOrLoss(-sum), 'Read the balance of Revaluation A/c the wrong way round: bigger credits (gains) mean a profit, bigger debits (losses) mean a loss.'],
        ...items.flatMap((it): [string, string][] => (it.slip ? [[profitOrLoss(sum - it.effect + it.slip.effect), it.slip.why]] : [])),
        [profitOrLoss(total(items.map((it) => Math.abs(it.effect)))), 'Added all the items together as if every one of them were a gain.'],
      ],
      `${items.map((it) => it.work).join(' ')} ${gains.length === 0 ? `No gains; losses ${inr(total(losses))}` : losses.length === 0 ? `Gains ${inr(total(gains))}; no losses` : `Gains ${inr(total(gains))} - losses ${inr(total(losses))}`}: ${profitOrLoss(sum).toLowerCase()} on revaluation.`,
      H.revaluation,
      { rng, first: 1 },
    );
  },
  verify: checked((q: McqQuestion) => optionText(q) === profitOrLoss(total(q.prompt.split('\n').slice(1).map(effectIn)))),
});

const revShare = numericTemplate({
  id: 'cpr-rev-share', topicId: T, conceptId: 'cpr-revaluation', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const ch = anyChange(rng);
    const f = firmOf(rng, ch.old, ch.neu);
    const items = revItems(rng, rng.int(3, 4), 'mixed', (sum) => sum !== 0 && splits(sum, ch.old) && splits(sum, ch.neu));
    if (!items) return null;
    const sum = total(items.map((it) => it.effect));
    const result = Math.abs(sum);
    const i = rng.int(0, ch.old.length - 1);
    const name = f.names[i];
    const amt = part(result, ch.old, i);
    const parts = numeric(amt, [
      [part(result, ch.neu, i), 'Used the new ratio. The profit or loss on revaluation arose before the change, so it is shared in the old ratio.'],
      ...items.flatMap((it): [number, string][] => (it.slip ? [[part(Math.abs(sum - it.effect + it.slip.effect), ch.old, i), it.slip.why]] : [])),
      [result, `Gave the whole ${sum > 0 ? 'profit' : 'loss'} on revaluation, not ${name}'s share of it.`],
      [result / ch.old.length, `Divided the ${sum > 0 ? 'profit' : 'loss'} equally among the partners, not in the old ratio.`],
    ]);
    return (
      parts && {
        prompt: [`${f.intro} ${f.change} ${REVALUED} The capitals are fluctuating. What is ${name}'s share of the profit or loss on revaluation? Give the amount.`, ...lettered(items.map((it) => it.text))].join('\n'),
        ...parts,
        explanation: [
          ...items.map((it) => it.work),
          `Revaluation A/c shows a ${sum > 0 ? 'profit' : 'loss'} of ${inr(result)}, shared in the old ratio ${ch.old.join(':')}.`,
          `${name}'s share = ${ch.old[i]}/${ch.so} of ${inr(result)} = ${inr(amt)}, ${sum > 0 ? 'credited' : 'debited'} to ${name}'s Capital A/c.`,
        ],
        hints: H.revaluation,
      }
    );
  },
  verify: checked((q: NumericQuestion) => {
    const [first, ...rows] = q.prompt.split('\n');
    const g = given(first);
    const i = g.names.indexOf(/What is ([A-Z][a-z]+)'s share/.exec(first)![1]);
    return near(q.answer / 100, Math.abs(total(rows.map(effectIn))) * g.old[i]);
  }),
});

const revTransferEntry = journalTemplate({
  id: 'cpr-rev-transfer-entry', topicId: T, conceptId: 'cpr-revaluation', difficulty: 'easy',
  generate: (rng) => {
    const ch = anyChange(rng, true);
    const f = firmOf(rng, ch.old, ch.neu);
    const fixed = rng.int(0, 3) === 0;
    const profit = rng.int(0, 2) > 0;
    const P = pickAmount(rng, 10000, 240000, (v) => splits(v, ch.old));
    if (P === null) return null;
    const own = fixed ? 'Current' : 'Capital';
    return {
      prompt: `${f.intro} ${f.change} After the assets and liabilities are revalued on the change, Revaluation A/c shows a ${profit ? 'profit (credit balance)' : 'loss (debit balance)'} of ${inr(P)}. ${capitalsLine(fixed)} Pass the journal entry to close Revaluation A/c.`,
      lines: profit ? [dr('revaluation', P), ...sharedLines(f.names, fixed, 'Cr', P, ch.old)] : [...sharedLines(f.names, fixed, 'Dr', P, ch.old), cr('revaluation', P)],
      explanation: [
        `The ${profit ? 'profit' : 'loss'} on revaluation arose while the old ratio was in force, so it goes to the partners in the old ratio ${ch.old.join(':')}: ${eachOf(f.names, f.names.map((_, i) => part(P, ch.old, i)))}.`,
        profit
          ? `Revaluation A/c is closed by a debit of ${inr(P)} and each partner's ${own} A/c is credited.`
          : `Each partner's ${own} A/c is debited and Revaluation A/c is closed by a credit of ${inr(P)}.`,
      ],
      hints: H.revaluation,
      distractorAccounts: ['profitAndLoss', 'profitAndLossAppropriation', 'generalReserve', acct(f.names[0], !fixed)],
    };
  },
  verify: checked((q: JournalQuestion) => {
    const g = given(q.prompt);
    const P = amountsIn(q.prompt)[0] * (q.prompt.includes('profit (credit balance)') ? 1 : -1);
    return netCr(q, 'revaluation') === -P && g.names.every((name, i) => near(netCr(q, acct(name, fixedIn(q.prompt))), P * g.old[i]));
  }),
});

const revComplex = numericTemplate({
  id: 'cpr-rev-complex', topicId: T, conceptId: 'cpr-revaluation', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const ch = anyChange(rng);
    const f = firmOf(rng, ch.old, ch.neu);
    const ok = (v: number): boolean => splits(v, ch.old) && splits(v, ch.neu);
    const R = pickAmount(rng, 60000, 300000, ok);
    if (R === null) return null;
    const items = revItems(rng, 4, true, (sum) => sum !== 0 && ok(sum) && sum + R > 0);
    if (!items) return null;
    const sum = total(items.map((it) => it.effect));
    const i = rng.int(0, ch.old.length - 1);
    const name = f.names[i];
    const amt = part(sum + R, ch.old, i);
    const parts = numeric(amt, [
      [part(sum, ch.old, i) + part(R, ch.neu, i), 'Distributed the General Reserve in the new ratio. Like the result of revaluation, it belongs to the partners in the old ratio.'],
      [part(sum + R, ch.neu, i), 'Used the new ratio. The result of revaluation and the reserve both arose before the change and go to the partners in the old ratio.'],
      ...items.flatMap((it): [number, string][] => (it.slip ? [[part(sum - it.effect + it.slip.effect + R, ch.old, i), it.slip.why]] : [])),
      sum > 0
        ? [part(sum, ch.old, i), 'Left out the General Reserve, which is credited to the partners in the old ratio as well.']
        : [part(R - sum, ch.old, i), 'Added the loss on revaluation to the reserve. A loss on revaluation is debited to the partners.'],
      [part(R, ch.old, i), 'Left out the result of revaluation and gave only the share of the General Reserve.'],
    ]);
    return (
      parts && {
        prompt: [
          `${f.intro} ${f.change} ${REVALUED} The General Reserve of ${inr(R)} is also distributed. The capitals are fluctuating. What is the net amount credited to ${name}'s Capital A/c on account of the revaluation and the reserve?`,
          ...lettered(items.map((it) => it.text)),
        ].join('\n'),
        ...parts,
        explanation: [
          ...items.map((it) => it.work),
          `Revaluation A/c shows a ${sum > 0 ? 'profit' : 'loss'} of ${inr(Math.abs(sum))}.`,
          `With the General Reserve: ${inr(R)} ${sum > 0 ? '+' : '-'} ${inr(Math.abs(sum))} = ${inr(sum + R)}, shared in the old ratio ${ch.old.join(':')}.`,
          `${name}'s share = ${ch.old[i]}/${ch.so} of ${inr(sum + R)} = ${inr(amt)}.`,
        ],
        hints: H.revaluation,
      }
    );
  },
  verify: checked((q: NumericQuestion) => {
    const [first, ...rows] = q.prompt.split('\n');
    const g = given(first);
    const i = g.names.indexOf(/to ([A-Z][a-z]+)'s Capital A\/c/.exec(first)![1]);
    return near(q.answer / 100, (amountsIn(first)[0] + total(rows.map(effectIn))) * g.old[i]);
  }),
});

const revaluationTemplates: Template[] = [revItemEntryDirect, revItemSide, revResult, revShare, revTransferEntry, revEntryComputed, revComplex];

// ===============================================================================================================
// One adjusting entry when the balances are left as they are
// ===============================================================================================================

/** The compensation entry for a net effect: as `compensation` for a net gain, and reversed for a net loss. */
function adjusting(ch: Change, names: readonly string[], net: number, fixed: boolean): JournalLine[] {
  const lines = compensation(ch, names, Math.abs(net), fixed);
  return net > 0 ? lines : lines.map((l) => ({ ...l, side: l.side === 'Dr' ? ('Cr' as const) : ('Dr' as const) })).sort((a, b) => (a.side === b.side ? 0 : a.side === 'Dr' ? -1 : 1));
}
/** Why the entry runs the way it does, for a net gain and for a net loss. */
const whyDirection = (net: number): string =>
  net > 0
    ? 'What is left in the books will be shared in the new ratio later, so a partner who gains gets more of it than before: the gaining partner is debited and the sacrificing partner credited.'
    : 'A net loss is left in the books and will be borne in the new ratio later, so a partner who gains takes over more of it: the sacrificing partner is debited and the gaining partner credited.';

const singleAmount = numericTemplate({
  id: 'cpr-single-amount', topicId: T, conceptId: 'cpr-single-entry', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const ch = pairChange(rng, true);
    const f = firmOf(rng, ch.old, ch.neu);
    const item = rng.pick([HELD[0], HELD[1]]);
    const R = pickAmount(rng, 30000, 500000, (v) => moves(v, ch) && splits(v, ch.old) && splits(v, ch.neu));
    if (R === null) return null;
    const i = rng.pick([ch.sac[0], ch.gain[0]]);
    const name = f.names[i];
    const gains = ch.d[i] < 0;
    const did = gains ? 'gained' : 'sacrificed';
    const amt = moved(R, ch, i);
    const parts = numeric(amt, [
      [part(R, ch.old, i), `Worked out ${name}'s share as if the balance were distributed in the old ratio. It stays in the books, so only the share ${did} is adjusted.`],
      [part(R, ch.neu, i), `Multiplied the balance by ${name}'s new share, not by the share ${did}.`],
      [R, `Took the whole balance; only the part that goes with the share ${did} is adjusted.`],
      [(R * Math.abs(ch.old[i] - ch.neu[i])) / ch.so, 'Subtracted the terms of the two ratios without turning them into shares with a common denominator, so the share that changed hands is wrong.'],
    ]);
    return (
      parts && {
        prompt: `${f.intro} ${f.change} The Balance Sheet on 31 March ${f.year} shows ${item.phrase(inr(R))}. The partners decide to leave it in the books as it is and to pass one adjusting entry through the capital accounts, which are fluctuating. By how much is ${name}'s Capital A/c ${gains ? 'debited' : 'credited'} in that entry?`,
        ...parts,
        explanation: [
          moveText(ch, i, name),
          `The balance stays in the books, so only its effect on the share that moves is adjusted: ${inr(R)} x ${frac(Math.abs(ch.d[i]), ch.L)} = ${inr(amt)}.`,
          gains ? `${name} gains, so ${name}'s Capital A/c is debited with ${inr(amt)}.` : `${name} sacrifices, so ${name}'s Capital A/c is credited with ${inr(amt)}.`,
        ],
        hints: H.single,
      }
    );
  },
  verify: checked((q: NumericQuestion) => {
    const g = given(q.prompt);
    const x = g.give[g.names.indexOf(/is ([A-Z][a-z]+)'s Capital A\/c/.exec(q.prompt)![1])];
    return near(q.answer / 100, amountsIn(q.prompt)[0] * Math.abs(x)) && q.prompt.includes('A/c debited') === x < 0;
  }),
});

const singleEntry = journalTemplate({
  id: 'cpr-single-entry', topicId: T, conceptId: 'cpr-single-entry', difficulty: 'medium', computed: true,
  generate: (rng) => {
    const ch = pairChange(rng);
    const f = firmOf(rng, ch.old, ch.neu);
    const fixed = rng.int(0, 3) === 0;
    const R = rng.step(40000, 300000, 10000);
    const fict = rng.pick(FICTITIOUS);
    const D = rng.int(0, 2) === 0 ? rng.step(10000, 30000, 5000) : 0;
    const base = R - D;
    const plCredit = rng.int(0, 2) === 0;
    const wantLoss = !plCredit && rng.int(0, 2) === 0;
    const P = plCredit
      ? pickAmount(rng, 20000, 200000, (v) => moves(base + v, ch))
      : wantLoss
        ? pickAmount(rng, base + 10000, base + 200000, (v) => moves(base - v, ch))
        : pickAmount(rng, 10000, base - 10000, (v) => moves(base - v, ch));
    if (P === null) return null;
    const net = base + (plCredit ? P : -P);
    if (net === 0) return null;
    const rows = [`General Reserve: ${inr(R)}`, `Profit and Loss A/c (${plCredit ? 'credit' : 'debit'} balance): ${inr(P)}`, ...(D > 0 ? [`${fict.label}: ${inr(D)}`] : [])];
    const sums = `${inr(R)} ${plCredit ? '+' : '-'} ${inr(P)}${D > 0 ? ` - ${inr(D)}` : ''}`;
    const pays = net > 0 ? ch.gain[0] : ch.sac[0];
    const gets = net > 0 ? ch.sac[0] : ch.gain[0];
    const amt = moved(Math.abs(net), ch, pays);
    return {
      prompt: [
        `${f.intro} ${f.change} The Balance Sheet on 31 March ${f.year} shows the balances below. The partners decide to leave them in the books as they are and to pass one adjusting entry. ${capitalsLine(fixed)} Pass that entry.`,
        ...rows,
      ].join('\n'),
      lines: adjusting(ch, f.names, net, fixed),
      explanation: [
        net > 0 ? `Net effect = ${sums} = ${inr(net)}, a net credit balance (profit) left in the books.` : `Net effect = ${sums} = a net debit balance (loss) of ${inr(-net)} left in the books.`,
        moveText(ch, ch.gain[0], f.names[ch.gain[0]]),
        `Adjustment = ${inr(Math.abs(net))} x ${frac(Math.abs(ch.d[pays]), ch.L)} = ${inr(amt)}.`,
        whyDirection(net),
        `${acctName(f.names[pays], fixed)} is debited and ${acctName(f.names[gets], fixed)} is credited with ${inr(amt)}.`,
      ],
      hints: H.single,
      distractorAccounts: ['generalReserve', 'profitAndLoss', acct(f.names[pays], !fixed), ...ch.same.map((s) => acct(f.names[s], fixed))],
    };
  },
  verify: checked((q: JournalQuestion) => {
    const [first, ...rows] = q.prompt.split('\n');
    return adjustsBy({ ...q, prompt: first }, heldNet(rows));
  }),
});

/**
 * The changes in value that can be agreed on and yet kept out of the books: a revised value of an asset, a provision
 * or the creditors. An item that is "to be recorded" or "to be brought in" (an outstanding expense, an unrecorded
 * asset) would contradict a question whose books are left as they are, so it is not drawn there.
 */
const REVISED_KINDS = [ASSET_UP, FIXED_DOWN, STOCK_DOWN, PROVISION, CREDITORS];

/** Goodwill, a reserve, perhaps an accumulated loss, and two changes in value, all to be given effect to by one entry. */
interface Combined {
  ch: Change;
  f: Firm;
  G: number;
  R: number;
  loss: number;
  items: RevItem[];
  net: number;
  rows: string[];
  working: string[];
}

function combined(rng: Rng): Combined | null {
  const ch = anyChange(rng);
  const f = firmOf(rng, ch.old, ch.neu);
  const R = rng.step(30000, 240000, 10000);
  const loss = rng.int(0, 1) === 0 ? rng.step(10000, 60000, 5000) : 0;
  const items = revItemsOf(rng, rng.shuffle(REVISED_KINDS).slice(0, 2), 'mixed', (sum) => sum !== 0);
  if (!items) return null;
  const rev = total(items.map((it) => it.effect));
  const rest = R - loss + rev;
  // The goodwill is chosen so that the net effect comes to whole rupees for every share, old, new and moved.
  const G = pickAmount(rng, 60000, 600000, (v) => rest + v > 0 && moves(rest + v, ch) && splits(rest + v, ch.old) && splits(rest + v, ch.neu));
  if (G === null) return null;
  const net = G + rest;
  const rows = lettered([
    `goodwill of the firm is valued at ${inr(G)}`,
    `the General Reserve stands at ${inr(R)}`,
    ...(loss > 0 ? [`Profit and Loss A/c shows a debit balance of ${inr(loss)}`] : []),
    ...items.map((it) => it.text),
  ]);
  // The values are not altered in the books, so no Revaluation A/c is opened: each item is only a gain or a loss.
  const working = [
    ...items.map((it) => it.work.replace(`: ${GAIN}.`, ': a gain.').replace(`: ${LOSS}.`, ': a loss.')),
    `Net ${rev > 0 ? 'gain' : 'loss'} on revaluation = ${inr(Math.abs(rev))}. The book values are not altered, so no Revaluation A/c is opened; the figure goes into the net effect.`,
    `Net effect = goodwill ${inr(G)} + General Reserve ${inr(R)}${loss > 0 ? ` - Profit and Loss (debit balance) ${inr(loss)}` : ''} ${rev > 0 ? '+ gain' : '- loss'} on revaluation ${inr(Math.abs(rev))} = ${inr(net)}.`,
  ];
  return { ch, f, G, R, loss, items, net, rows, working };
}
/** The net effect of the lettered matters of `combined`, read back from the prompt. */
const combinedNet = (rows: readonly string[]): number =>
  total(rows.map((r) => (r.includes('Goodwill of the firm') || r.includes('General Reserve') ? amountsIn(r)[0] : r.includes('debit balance') ? -amountsIn(r)[0] : effectIn(r))));
const UNALTERED = 'but decide that the book values of the assets and liabilities, the reserve and any accumulated loss are to stay in the books as they are, and that no Goodwill A/c is to be opened';

const singleCombinedEntry = journalTemplate({
  id: 'cpr-single-combined-entry', topicId: T, conceptId: 'cpr-single-entry', difficulty: 'complex', computed: true,
  generate: (rng) => {
    const c = combined(rng);
    if (!c) return null;
    const { ch, f, net } = c;
    const fixed = rng.int(0, 3) === 0;
    return {
      prompt: [`${f.intro} ${f.change} The partners agree on the matters below, ${UNALTERED}. ${capitalsLine(fixed)} Pass one journal entry that gives effect to all of them.`, ...c.rows].join('\n'),
      lines: adjusting(ch, f.names, net, fixed),
      explanation: [
        ...c.working,
        ...movesText(ch, f.names),
        ...[...ch.gain, ...ch.sac].map((i) => `${f.names[i]}: ${inr(net)} x ${frac(Math.abs(ch.d[i]), ch.L)} = ${inr(moved(net, ch, i))}.`),
        'Goodwill, and whatever is left in the books, will benefit the partners in the new ratio from now on, so a partner who gains gets more of it than before: each partner who gains is debited and each partner who sacrifices is credited.',
      ],
      hints: H.single,
      distractorAccounts: ['goodwill', 'generalReserve', 'revaluation', acct(f.names[ch.gain[0]], !fixed), ...ch.same.map((s) => acct(f.names[s], fixed))],
    };
  },
  verify: checked((q: JournalQuestion) => {
    const [first, ...rows] = q.prompt.split('\n');
    return adjustsBy({ ...q, prompt: first }, combinedNet(rows));
  }),
});

const singleCombinedAmount = numericTemplate({
  id: 'cpr-single-combined-amount', topicId: T, conceptId: 'cpr-single-entry', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const c = combined(rng);
    if (!c) return null;
    const { ch, f, net, G, R, loss, items } = c;
    const i = rng.pick([...ch.sac, ...ch.gain]);
    const name = f.names[i];
    const gains = ch.d[i] < 0;
    const did = gains ? 'gained' : 'sacrificed';
    const amt = moved(net, ch, i);
    const parts = numeric(amt, [
      [moved(net - G, ch, i), 'Left out goodwill. The gaining partner pays for goodwill in the same entry.'],
      [moved(G + R - loss, ch, i), 'Left out the gain or loss on revaluation. The values are not changed in the books, so its effect has to go into the adjusting entry.'],
      [part(net, ch.neu, i), `Multiplied the net effect by ${name}'s new share, not by the share ${did}.`],
      ...(loss > 0 ? [[moved(net + 2 * loss, ch, i), 'Added the debit balance of Profit and Loss A/c. An accumulated loss is deducted.'] as [number, string]] : []),
      ...items.flatMap((it): [number, string][] => (it.slip ? [[moved(net - it.effect + it.slip.effect, ch, i), it.slip.why]] : [])),
      [part(net, ch.old, i), `Multiplied the net effect by ${name}'s old share, not by the share ${did}.`],
    ]);
    return (
      parts && {
        prompt: [
          `${f.intro} ${f.change} The partners agree on the matters below, ${UNALTERED}. One adjusting entry is passed through the capital accounts, which are fluctuating. By how much is ${name}'s Capital A/c ${gains ? 'debited' : 'credited'} in that entry?`,
          ...c.rows,
        ].join('\n'),
        ...parts,
        explanation: [...c.working, moveText(ch, i, name), `${inr(net)} x ${frac(Math.abs(ch.d[i]), ch.L)} = ${inr(amt)}, ${gains ? 'debited' : 'credited'} to ${name}'s Capital A/c.`],
        hints: H.single,
      }
    );
  },
  verify: checked((q: NumericQuestion) => {
    const [first, ...rows] = q.prompt.split('\n');
    const g = given(first);
    const x = g.give[g.names.indexOf(/is ([A-Z][a-z]+)'s Capital A\/c/.exec(first)![1])];
    return near(q.answer / 100, combinedNet(rows) * Math.abs(x)) && first.includes('A/c debited') === x < 0;
  }),
});

const singleDirection = mcqTemplate({
  id: 'cpr-single-direction', topicId: T, conceptId: 'cpr-single-entry', difficulty: 'medium',
  // Version 2: the net balance is a credit in about half the seeds (version 1 always left a net loss).
  version: 2,
  generate: (rng) => {
    const ch = pairChange(rng, true);
    const f = firmOf(rng, ch.old, ch.neu);
    const [gi, si] = [ch.gain[0], ch.sac[0]];
    const R = rng.step(40000, 300000, 10000);
    const creditLeft = rng.int(0, 1) === 0;
    const P = pickAmount(rng, 10000, 400000, (v) => (creditLeft ? v < R : v > R) && moves(R - v, ch) && moves(R + v, ch) && splits(Math.abs(R - v), ch.neu));
    if (P === null) return null;
    const net = R - P;
    const [pays, gets] = net > 0 ? [f.names[gi], f.names[si]] : [f.names[si], f.names[gi]];
    const amt = moved(Math.abs(net), ch, gi);
    const entry = (from: string, to: string, v: number): string => `Debit ${from}'s Capital A/c and credit ${to}'s Capital A/c with ${inr(v)}`;
    return choice(
      `${f.intro} ${f.change} The Balance Sheet on 31 March ${f.year} shows a General Reserve of ${inr(R)} and a debit balance of ${inr(P)} in Profit and Loss A/c. The partners decide to leave both in the books and to pass one adjusting entry through the capital accounts, which are fluctuating. Which entry is passed?`,
      entry(pays, gets, amt),
      [
        [
          entry(gets, pays, amt),
          net > 0
            ? `Made ${gets}, who sacrifices, pay. With a net credit balance left in the books it is the gaining partner who compensates.`
            : 'Applied the rule for a net credit balance. Here the loss is bigger than the reserve, so a net loss is left in the books and the entry is reversed.',
        ],
        [entry(f.names[gi], f.names[si], moved(R + P, ch, gi)), 'Added the debit balance of Profit and Loss A/c to the General Reserve. A loss is deducted to find the net balance.'],
        [entry(pays, gets, Math.abs(net)), 'Adjusted the whole net balance, not net balance x the share gained.'],
        [entry(pays, gets, part(Math.abs(net), ch.neu, gi)), "Multiplied the net balance by the gaining partner's new share, not by the share gained."],
      ],
      `Net balance = ${inr(R)} - ${inr(P)} = ${net > 0 ? `${inr(net)}, a net credit balance` : `a net debit balance (loss) of ${inr(-net)}`}. ${moveText(ch, gi, f.names[gi])} Adjustment = ${inr(Math.abs(net))} x ${frac(-ch.d[gi], ch.L)} = ${inr(amt)}. ${whyDirection(net)}`,
      H.single,
      { rng, first: 1 },
    );
  },
  verify: checked((q: McqQuestion) => {
    const g = given(q.prompt);
    const [R, P] = amountsIn(q.prompt);
    const m = /^Debit ([A-Z][a-z]+)'s Capital A\/c and credit ([A-Z][a-z]+)'s Capital A\/c with (₹[\d,]+)$/.exec(optionText(q))!;
    const amt = amountsIn(m[3])[0];
    return near(-amt, (R - P) * g.give[g.names.indexOf(m[1])]) && near(amt, (R - P) * g.give[g.names.indexOf(m[2])]);
  }),
});

const singleTemplates: Template[] = [singleAmount, singleEntry, singleCombinedEntry, singleCombinedAmount, singleDirection];

// ===============================================================================================================
// Capitals and the Balance Sheet after the change
// ===============================================================================================================

/** Capitals that add up to `sum`: all but the last drawn between 20% and 45% of it, in whole ten thousands. Null when the last would be too small. */
function capitalsOf(rng: Rng, n: number, sum: number): number[] | null {
  const caps = Array.from({ length: n - 1 }, () => rng.step(Math.ceil((0.2 * sum) / 10000) * 10000, Math.floor((0.45 * sum) / 10000) * 10000, 10000));
  const last = sum - total(caps);
  return last >= 0.1 * sum ? [...caps, last] : null;
}

const capAfter = numericTemplate({
  id: 'cpr-cap-after', topicId: T, conceptId: 'cpr-capitals', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const ch = anyChange(rng, true);
    const f = firmOf(rng, ch.old, ch.neu);
    const ok = (v: number): boolean => splits(v, ch.old) && splits(v, ch.neu);
    const caps = f.names.map(() => rng.step(100000, 600000, 10000));
    const R = pickAmount(rng, 30000, 300000, ok);
    const P = pickAmount(rng, 10000, 120000, ok);
    const G = pickAmount(rng, 60000, 600000, (v) => moves(v, ch));
    if (R === null || P === null || G === null) return null;
    const profit = rng.int(0, 2) > 0;
    const i = rng.int(0, ch.old.length - 1);
    const name = f.names[i];
    const res = part(R, ch.old, i);
    const rev = (profit ? 1 : -1) * part(P, ch.old, i);
    const gw = (G * ch.d[i]) / ch.L; // a credit for a sacrifice, a debit (negative) for a gain
    const ans = caps[i] + res + rev + gw;
    const parts = numeric(ans, [
      [ans - gw, 'Left out the goodwill adjustment: a partner who gains is debited, and a partner who sacrifices credited, with goodwill x the share that moved.'],
      [ans - 2 * gw, 'Passed the goodwill adjustment the wrong way round: a partner who gains is debited and a partner who sacrifices is credited.'],
      [ans - res + part(R, ch.neu, i), 'Distributed the General Reserve in the new ratio. It belongs to the partners in the old ratio.'],
      [ans - 2 * rev, profit ? 'Debited the profit on revaluation. A profit is credited to the partners.' : 'Credited the loss on revaluation. A loss is debited to the partners.'],
      [ans - res, 'Left out the General Reserve, which is credited to the partners in the old ratio.'],
    ]);
    return (
      parts && {
        prompt: [
          `${f.intro} ${f.change} On that date their capitals are ${eachOf(f.names, caps)}; the capitals are fluctuating. The matters below are adjusted through the capital accounts and no Goodwill A/c is opened. What is the balance of ${name}'s Capital A/c after all the adjustments?`,
          ...lettered([`the General Reserve of ${inr(R)} is distributed`, `revaluation of the assets and liabilities shows a ${profit ? 'profit' : 'loss'} of ${inr(P)}`, `goodwill of the firm is valued at ${inr(G)}`]),
        ].join('\n'),
        ...parts,
        explanation: [
          `General Reserve, old ratio: ${ch.old[i]}/${ch.so} of ${inr(R)} = ${inr(res)}, credited.`,
          `${profit ? 'Profit' : 'Loss'} on revaluation, old ratio: ${ch.old[i]}/${ch.so} of ${inr(P)} = ${inr(Math.abs(rev))}, ${profit ? 'credited' : 'debited'}.`,
          moveText(ch, i, name),
          gw === 0 ? `${name} neither gains nor sacrifices, so goodwill does not touch ${name}'s capital.` : `Goodwill: ${inr(G)} x ${frac(Math.abs(ch.d[i]), ch.L)} = ${inr(Math.abs(gw))}, ${gw > 0 ? 'credited' : 'debited'}.`,
          `Capital = ${inr(caps[i])} + ${inr(res)} ${profit ? '+' : '-'} ${inr(Math.abs(rev))}${gw === 0 ? '' : ` ${gw > 0 ? '+' : '-'} ${inr(Math.abs(gw))}`} = ${inr(ans)}.`,
        ],
        hints: H.capitals,
      }
    );
  },
  verify: checked((q: NumericQuestion) => {
    const [first, a, b, c] = q.prompt.split('\n');
    const g = given(first);
    const i = g.names.indexOf(/balance of ([A-Z][a-z]+)'s Capital A\/c/.exec(first)![1]);
    const rev = (b.includes('profit') ? 1 : -1) * amountsIn(b)[0];
    return near(q.answer / 100, amountsIn(first)[i] + (amountsIn(a)[0] + rev) * g.old[i] + amountsIn(c)[0] * g.give[i]);
  }),
});

/** Capitals after the adjustments and the total they are to be brought to in the new ratio. */
interface Regroup {
  ch: Change;
  f: Firm;
  caps: number[];
  /** The total capital the firm is to have; `stated` when the question fixes a total other than the present one. */
  sum: number;
  stated: boolean;
  lead: string;
}

function regroup(rng: Rng, allowStated: boolean): Regroup | null {
  const ch = anyChange(rng, true);
  const f = firmOf(rng, ch.old, ch.neu);
  const n = ch.old.length;
  const ok = (v: number): boolean => splits(v, ch.old) && splits(v, ch.neu) && v % n === 0;
  const present = pickAmount(rng, 300000, 1500000, ok);
  if (present === null) return null;
  const caps = capitalsOf(rng, n, present);
  if (!caps) return null;
  const stated = allowStated && rng.int(0, 2) === 0;
  const sum = stated ? pickAmount(rng, 300000, 1800000, (v) => ok(v) && v !== present) : present;
  if (sum === null) return null;
  const lead = `${f.intro} ${f.change} After all the adjustments for the change, their capitals stand at ${eachOf(f.names, caps)}. ${stated ? `The partners fix the total capital of the firm at ${inr(sum)}, to be held` : 'The partners decide that the total capital of the firm will remain the same but will be held'} in the new profit-sharing ratio`;
  return { ch, f, caps, sum, stated, lead };
}
/** The capitals and the total to be regrouped, read back from the prompt. */
function regrouped(prompt: string): { g: ReturnType<typeof given>; caps: number[]; sum: number } {
  const g = given(prompt);
  const amounts = amountsIn(prompt);
  const caps = amounts.slice(0, g.names.length);
  return { g, caps, sum: prompt.includes('fix the total capital') ? amounts[g.names.length] : total(caps) };
}

const capProportionate = numericTemplate({
  id: 'cpr-cap-proportionate', topicId: T, conceptId: 'cpr-capitals', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const r = regroup(rng, false);
    if (!r) return null;
    const { ch, f, caps, sum } = r;
    const i = rng.int(0, ch.old.length - 1);
    const name = f.names[i];
    const ans = part(sum, ch.neu, i);
    const parts = numeric(ans, [
      [part(sum, ch.old, i), 'Divided the total capital in the old ratio. The capitals are to follow the new profit-sharing ratio.'],
      [sum / ch.old.length, 'Divided the total capital equally, not in the new profit-sharing ratio.'],
      [caps[i], `Left ${name}'s capital as it stands. It has to be brought to ${name}'s new share of the total capital.`],
      [sum, `Gave the total capital of the firm, not ${name}'s share of it.`],
    ]);
    return (
      parts && {
        prompt: `${r.lead}. What should ${name}'s capital be?`,
        ...parts,
        explanation: [
          `Total capital = ${caps.map(inr).join(' + ')} = ${inr(sum)}.`,
          `${name}'s new share of profit is ${ch.neu[i]}/${ch.sn}, so ${name}'s capital = ${ch.neu[i]}/${ch.sn} of ${inr(sum)} = ${inr(ans)}.`,
        ],
        hints: H.capitals,
      }
    );
  },
  verify: checked((q: NumericQuestion) => {
    const { g, sum } = regrouped(q.prompt);
    return near(q.answer / 100, sum * g.neu[g.names.indexOf(/What should ([A-Z][a-z]+)'s capital/.exec(q.prompt)![1])]);
  }),
});

const capCash = numericTemplate({
  id: 'cpr-cap-cash', topicId: T, conceptId: 'cpr-capitals', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const r = regroup(rng, true);
    if (!r) return null;
    const { ch, f, caps, sum } = r;
    const n = ch.old.length;
    const open = f.names.flatMap((_, t) => (part(sum, ch.neu, t) !== caps[t] ? [t] : []));
    if (open.length === 0) return null;
    const i = rng.pick(open);
    const name = f.names[i];
    const target = part(sum, ch.neu, i);
    const need = target - caps[i];
    const present = total(caps);
    const parts = numeric(Math.abs(need), [
      [target, `Gave the capital ${name} should have. The question asks for the difference from the ${inr(caps[i])} that ${name} has.`],
      [Math.abs(part(sum, ch.old, i) - caps[i]), 'Divided the total capital in the old ratio. The capitals are to follow the new profit-sharing ratio.'],
      ...(r.stated ? [[Math.abs(part(present, ch.neu, i) - caps[i]), `Kept the present total of the capitals, ${inr(present)}. The total is fixed at ${inr(sum)}.`] as [number, string]] : []),
      [Math.abs(sum / n - caps[i]), 'Divided the total capital equally, not in the new profit-sharing ratio.'],
    ]);
    return (
      parts && {
        prompt: `${r.lead}; a partner with a shortfall brings in cash and a partner with an excess is paid back in cash. ${need > 0 ? `How much cash does ${name} bring in?` : `How much cash is paid back to ${name}?`}`,
        ...parts,
        explanation: [
          r.stated ? `Total capital is fixed at ${inr(sum)}.` : `Total capital = ${caps.map(inr).join(' + ')} = ${inr(sum)}.`,
          `${name}'s capital in the new ratio = ${ch.neu[i]}/${ch.sn} of ${inr(sum)} = ${inr(target)}.`,
          need > 0 ? `${name} has ${inr(caps[i])}: shortfall = ${inr(target)} - ${inr(caps[i])} = ${inr(need)}, brought in.` : `${name} has ${inr(caps[i])}: excess = ${inr(caps[i])} - ${inr(target)} = ${inr(-need)}, paid back.`,
        ],
        hints: H.capitals,
      }
    );
  },
  verify: checked((q: NumericQuestion) => {
    const { g, caps, sum } = regrouped(q.prompt);
    const i = g.names.indexOf(/(?:cash does|paid back to) ([A-Z][a-z]+)/.exec(q.prompt)![1]);
    const need = sum * g.neu[i] - caps[i];
    return near(q.answer / 100, Math.abs(need)) && q.prompt.includes('bring in?') === need > 0;
  }),
});

const capAdjustEntry = journalTemplate({
  id: 'cpr-cap-adjust-entry', topicId: T, conceptId: 'cpr-capitals', difficulty: 'medium', computed: true,
  generate: (rng) => {
    const r = regroup(rng, false);
    if (!r) return null;
    const { ch, f, caps, sum } = r;
    const open = f.names.flatMap((_, t) => (part(sum, ch.neu, t) !== caps[t] ? [t] : []));
    if (open.length === 0) return null;
    const i = rng.pick(open);
    const name = f.names[i];
    const target = part(sum, ch.neu, i);
    const need = target - caps[i];
    const viaCurrent = rng.int(0, 1) === 0;
    const other = viaCurrent ? partnerCurrent(name) : 'bank';
    const otherName = viaCurrent ? `${name}'s Current A/c` : 'Bank A/c';
    const capital = partnerCapital(name);
    const way = viaCurrent ? "Any excess or shortfall of capital is transferred to the partner's current account." : "A partner with a shortfall pays it into the firm's bank account, and a partner with an excess is paid back by cheque.";
    return {
      prompt: `${r.lead}. ${way} Pass the journal entry that adjusts ${name}'s capital.`,
      lines: need > 0 ? [dr(other, need), cr(capital, need)] : [dr(capital, -need), cr(other, -need)],
      explanation: [
        `Total capital = ${caps.map(inr).join(' + ')} = ${inr(sum)}; ${name}'s capital in the new ratio = ${ch.neu[i]}/${ch.sn} of ${inr(sum)} = ${inr(target)}.`,
        need > 0 ? `${name} has ${inr(caps[i])}, a shortfall of ${inr(need)}: ${name}'s Capital A/c is credited to raise it.` : `${name} has ${inr(caps[i])}, an excess of ${inr(-need)}: ${name}'s Capital A/c is debited to bring it down.`,
        need > 0 ? `${otherName} is debited with ${inr(need)}.` : `${otherName} is credited with ${inr(-need)}.`,
      ],
      hints: H.capitals,
      distractorAccounts: [viaCurrent ? 'bank' : partnerCurrent(name), 'cash', partnerCapital(f.names[(i + 1) % f.names.length]), 'revaluation'],
    };
  },
  verify: checked((q: JournalQuestion) => {
    const { g, caps, sum } = regrouped(q.prompt);
    const name = /adjusts ([A-Z][a-z]+)'s capital/.exec(q.prompt)![1];
    const i = g.names.indexOf(name);
    const need = sum * g.neu[i] - caps[i];
    const other = q.prompt.includes('current account') ? partnerCurrent(name) : 'bank';
    return near(netCr(q, partnerCapital(name)), need) && near(netCr(q, other), -need);
  }),
});

const capComplex = numericTemplate({
  id: 'cpr-cap-complex', topicId: T, conceptId: 'cpr-capitals', difficulty: 'complex', unit: 'rupees',
  // Version 2: when the loss on revaluation is larger than the reserve, the working says "a net debit", with no "₹-".
  version: 2,
  generate: (rng) => {
    const ch = anyChange(rng);
    const f = firmOf(rng, ch.old, ch.neu);
    const n = ch.old.length;
    const ok = (v: number): boolean => splits(v, ch.old) && splits(v, ch.neu);
    const R = pickAmount(rng, 30000, 240000, ok);
    const G = pickAmount(rng, 60000, 600000, (v) => moves(v, ch));
    if (R === null || G === null) return null;
    const items = revItems(rng, 2, 'mixed', (sum) => sum !== 0 && ok(sum));
    if (!items) return null;
    const rev = total(items.map((it) => it.effect));
    const firstCaps = Array.from({ length: n - 1 }, () => rng.step(100000, 500000, 10000));
    // The last capital brings the total after the adjustments to an amount that divides in the new ratio.
    const lastCap = pickAmount(rng, 100000, 500000, (v) => splits(total(firstCaps) + v + R + rev, ch.neu) && splits(total(firstCaps) + v, ch.neu));
    if (lastCap === null) return null;
    const caps = [...firstCaps, lastCap];
    const sum = total(caps) + R + rev;
    const open = f.names.flatMap((_, t) => (part(sum, ch.neu, t) !== caps[t] + part(R + rev, ch.old, t) + (G * ch.d[t]) / ch.L ? [t] : []));
    if (open.length === 0) return null;
    const i = rng.pick(open);
    const name = f.names[i];
    const gw = (G * ch.d[i]) / ch.L;
    const share = part(R + rev, ch.old, i);
    const adjusted = caps[i] + share + gw;
    const target = part(sum, ch.neu, i);
    const need = target - adjusted;
    const parts = numeric(Math.abs(need), [
      [Math.abs(need + gw), 'Left out the goodwill adjustment when working out the capital after the adjustments.'],
      [Math.abs(part(total(caps), ch.neu, i) - adjusted), 'Used the total of the capitals before the adjustments. The reserve and the result of revaluation change the total capital of the firm.'],
      [target, `Gave the capital ${name} should have, not the difference from the capital ${name} has after the adjustments.`],
      [adjusted, `Gave ${name}'s capital after the adjustments, not the cash needed to bring it to the new ratio.`],
      [Math.abs(target - caps[i]), `Compared the new capital with ${name}'s capital before the adjustments.`],
    ]);
    return (
      parts && {
        prompt: [
          `${f.intro} ${f.change} On that date their capitals are ${eachOf(f.names, caps)}; the capitals are fluctuating. The matters below are adjusted through the capital accounts and no Goodwill A/c is opened. After that the total capital of the firm, as it stands after these adjustments, is to be held in the new profit-sharing ratio, a partner with a shortfall bringing in cash and a partner with an excess being paid back in cash. ${need > 0 ? `How much cash does ${name} bring in?` : `How much cash is paid back to ${name}?`}`,
          ...lettered([`the General Reserve of ${inr(R)} is distributed`, ...items.map((it) => it.text), `goodwill of the firm is valued at ${inr(G)}`]),
        ].join('\n'),
        ...parts,
        explanation: [
          ...items.map((it) => it.work),
          R + rev >= 0
            ? `General Reserve ${inr(R)} ${rev > 0 ? '+ profit' : '- loss'} on revaluation ${inr(Math.abs(rev))} = ${inr(R + rev)}, shared in the old ratio: ${name} gets ${ch.old[i]}/${ch.so} = ${inr(share)}.`
            : `General Reserve ${inr(R)} - loss on revaluation ${inr(-rev)}: a net debit of ${inr(-(R + rev))}, borne in the old ratio: ${name} bears ${ch.old[i]}/${ch.so} = ${inr(-share)} (debited).`,
          gw === 0 ? `${moveText(ch, i, name)} Goodwill does not touch ${name}'s capital.` : `${moveText(ch, i, name)} Goodwill: ${inr(G)} x ${frac(Math.abs(ch.d[i]), ch.L)} = ${inr(Math.abs(gw))}, ${gw > 0 ? 'credited' : 'debited'}.`,
          `${name}'s capital after the adjustments = ${inr(caps[i])} ${share >= 0 ? '+' : '-'} ${inr(Math.abs(share))}${gw === 0 ? '' : ` ${gw > 0 ? '+' : '-'} ${inr(Math.abs(gw))}`} = ${inr(adjusted)}.`,
          `Total capital after the adjustments = ${inr(total(caps))} ${R + rev >= 0 ? '+' : '-'} ${inr(Math.abs(R + rev))} = ${inr(sum)} (goodwill only moves capital between the partners).`,
          `${name}'s capital in the new ratio = ${ch.neu[i]}/${ch.sn} of ${inr(sum)} = ${inr(target)}: ${need > 0 ? `${inr(target)} - ${inr(adjusted)} = ${inr(need)} to bring in` : `${inr(adjusted)} - ${inr(target)} = ${inr(-need)} to be paid back`}.`,
        ],
        hints: H.capitals,
      }
    );
  },
  verify: checked((q: NumericQuestion) => {
    const [first, ...rows] = q.prompt.split('\n');
    const g = given(first);
    const caps = amountsIn(first);
    const i = g.names.indexOf(/(?:cash does|paid back to) ([A-Z][a-z]+)/.exec(first)![1]);
    const pool = amountsIn(rows[0])[0] + total(rows.slice(1, -1).map(effectIn));
    const adjusted = caps[i] + pool * g.old[i] + amountsIn(rows[rows.length - 1])[0] * g.give[i];
    const need = (total(caps) + pool) * g.neu[i] - adjusted;
    return near(q.answer / 100, Math.abs(need)) && first.includes('bring in?') === need > 0;
  }),
});

const BS_ASSET_KINDS = [ASSET_UP, FIXED_DOWN, STOCK_DOWN, UNRECORDED, ACCRUED];
const BS_LIABILITY_KINDS = [OUTSTANDING, CREDITORS];

const bsTotal = numericTemplate({
  id: 'cpr-bs-total', topicId: T, conceptId: 'cpr-capitals', difficulty: 'complex', unit: 'rupees',
  // Version 2: when the changes in the assets cancel out, the working leaves out the nil term ("+ ₹0").
  version: 2,
  generate: (rng) => {
    const ch = anyChange(rng);
    const f = firmOf(rng, ch.old, ch.neu);
    const kinds = rng.shuffle([...rng.shuffle(BS_ASSET_KINDS).slice(0, 2), rng.pick(BS_LIABILITY_KINDS)]);
    const items = revItemsOf(rng, kinds, 'mixed', (sum) => sum !== 0);
    if (!items) return null;
    const B = rng.step(20000, 150000, 10000);
    const R = rng.step(30000, 200000, 10000);
    const G = rng.step(100000, 600000, 20000);
    // The total has room for the assets whose book values the question states (and the goodwill), with others beside them.
    const stated = B + total(items.filter((it) => it.asset && it.gross !== undefined).map((it) => (it.gross ?? 0) - it.effect));
    const least = Math.max(800000, Math.ceil((stated * 1.5) / 50000) * 50000);
    const before = rng.step(least, Math.max(3000000, least + 500000), 50000);
    const assets = total(items.filter((it) => it.asset).map((it) => it.effect));
    const liabilities = total(items.filter((it) => !it.asset).map((it) => it.effect));
    const ans = before + assets - B;
    if (ans === before) return null;
    const parts = numeric(ans, [
      [
        ans - liabilities,
        liabilities < 0
          ? 'Added the outstanding expense to the total. The liability goes up, but the capitals go down by the same loss, so the total of the liabilities side does not move.'
          : 'Deducted the creditors written back from the total. The creditors go down, but the capitals go up by the same gain, so the total of the liabilities side does not move.',
      ],
      [
        ans + liabilities,
        liabilities < 0
          ? 'Deducted the loss on the outstanding expense from the total. The capitals fall by it, but the liability rises by the same amount, so the total does not move.'
          : 'Added the gain on the creditors written back to the total. The capitals rise by it, but the creditors fall by the same amount, so the total does not move.',
      ],
      [ans + B, 'Left the old goodwill among the assets. It is written off against the capitals, so the assets fall by it.'],
      [ans + G, 'Showed goodwill at its new value. It is adjusted between the partners through their capitals, and no Goodwill A/c stays in the books.'],
      [ans - R, 'Deducted the General Reserve. It only moves from the reserve to the capitals, both on the liabilities side.'],
      [before + assets, 'Changed the assets for the revaluation but did not write off the goodwill in the books.'],
    ]);
    return (
      parts && {
        prompt: [
          `${f.intro} ${f.change} Their Balance Sheet on 31 March ${f.year} has a total of ${inr(before)}, which includes Goodwill of ${inr(B)} among the assets. The matters below are settled on the change; every adjustment is made through the capital accounts, and no cash is brought in or paid out. What is the total of the Balance Sheet after the change?`,
          ...lettered([
            `goodwill in the books is written off, and the goodwill of the firm, valued at ${inr(G)}, is adjusted through the capital accounts`,
            `the General Reserve of ${inr(R)} is distributed`,
            ...items.map((it) => it.text),
          ]),
        ].join('\n'),
        ...parts,
        explanation: [
          `Goodwill of ${inr(B)} leaves the assets side; the new goodwill of ${inr(G)} only moves capital between the partners and is not shown.`,
          'The General Reserve moves to the capital accounts: the total of the liabilities side does not change.',
          ...items.map((it) => (it.asset ? `${it.work} The assets ${it.effect > 0 ? 'rise' : 'fall'} by ${inr(Math.abs(it.effect))}.` : `${it.work} A liability and the capitals change by the same amount in opposite directions, so the total does not move.`)),
          `Total = ${inr(before)} - ${inr(B)}${assets === 0 ? ' (the changes in the assets cancel out)' : ` ${assets > 0 ? '+' : '-'} ${inr(Math.abs(assets))}`} = ${inr(ans)}.`,
        ],
        hints: ['Work on the assets side: which of these matters changes an asset?', 'A reserve distributed, a liability revised and goodwill adjusted through the capitals only move amounts within the liabilities side.'],
      }
    );
  },
  verify: checked((q: NumericQuestion) => {
    const [first, , , ...rows] = q.prompt.split('\n');
    const [before, B] = amountsIn(first);
    const assets = total(rows.filter((r) => /building|land|machinery|furniture|stock|investments|computer|accrued/i.test(r)).map(effectIn));
    return q.answer / 100 === before - B + assets;
  }),
});

const capitalTemplates: Template[] = [capAfter, capProportionate, capCash, capAdjustEntry, capComplex, bsTotal];

// ===============================================================================================================
// Sets of entries: one change of ratio, one entry for each matter settled on it
// ===============================================================================================================
//  - every item of a set is lettered, not dated: all of them are passed on the day the new ratio takes effect;
//  - the opening line names the partners, the two ratios and the capitals (fixed or fluctuating) and says how
//    goodwill is treated; an item gives its own figure, and the shares are worked out by the student;
//  - `verify` reads the ratios from the opening line and every figure from the item's own text, and works each
//    entry out again with plain fractions.

const SET_TASK = 'Pass the necessary journal entries in the books of the firm on the change in the profit-sharing ratio.';

/** As `splits`, with every partner's figure a whole multiple of `k` rupees. */
export const splitsBy = (v: number, r: readonly number[], k: number): boolean => r.every((x) => (v * x) % (total(r) * k) === 0);
/**
 * The sets and the formats keep to figures a student would meet in a paper: an amount shared in a ratio gives every
 * partner a whole ₹500 and at least ₹2,000 (`fairIn`), and so does an amount times every share gained or sacrificed
 * (`fairMove`). Nobody's figure is a trifle.
 */
export const fairIn = (v: number, r: readonly number[]): boolean => splitsBy(Math.abs(v), r, 500) && r.every((x) => Math.abs(v) * x >= total(r) * 2000);
export const fairMove = (v: number, ch: Change): boolean => ch.d.every((x) => x === 0 || ((Math.abs(v) * Math.abs(x)) % (ch.L * 500) === 0 && Math.abs(v) * Math.abs(x) >= ch.L * 2000));

/**
 * An amount in [min, max] for which `ok` holds, in whole ten thousands where there is one and in whole five thousands
 * otherwise; null when there is neither. (`pickAmount` goes on to steps of ₹2,000 and ₹1,000, which is right for a
 * share but leaves a capital of ₹5,98,000 or a balance of ₹1,79,000 among the figures a question gives.)
 */
export function roundAmount(rng: Rng, min: number, max: number, ok: (v: number) => boolean): number | null {
  for (const step of [10000, 5000]) {
    const all: number[] = [];
    for (let v = Math.ceil(min / step) * step; v <= max; v += step) if (ok(v)) all.push(v);
    if (all.length > 0) return rng.pick(all);
  }
  return null;
}

/** One item of a set: what is settled, the entry for it and the steps that explain the entry. */
export interface SetItem {
  text: string;
  lines: JournalLine[];
  explanation: string[];
}
const lettering = (items: readonly SetItem[]): SetTransaction[] => items.map((it, t) => ({ label: `(${'abcdefgh'[t]})`, ...it }));
/** "Asha's Capital A/c is" or "Asha's Capital A/c and Bina's Capital A/c are", for the partners at the indices given. */
const accountsAre = (names: readonly string[], at: readonly number[], fixed: boolean): string => `${listOf(at.map((i) => acctName(names[i], fixed)))} ${at.length > 1 ? 'are' : 'is'}`;

/** A reserve, an undistributed profit, an accumulated loss or a fictitious asset closed to the partners in the old ratio. */
export function heldItem(item: Held, v: number, ch: Change, names: readonly string[], fixed: boolean): SetItem {
  const own = fixed ? 'Current' : 'Capital';
  const text =
    item.id === 'generalReserve'
      ? `The General Reserve of ${inr(v)} is distributed among the partners.`
      : item.id === 'profitAndLoss'
        ? item.credit
          ? `The credit balance of ${inr(v)} in Profit and Loss A/c is distributed among the partners.`
          : `The debit balance of ${inr(v)} in Profit and Loss A/c is written off.`
        : `${item.label} of ${inr(v)}, shown on the assets side, is written off.`;
  return {
    text,
    lines: item.credit ? [dr(item.id, v), ...sharedLines(names, fixed, 'Cr', v, ch.old)] : [...sharedLines(names, fixed, 'Dr', v, ch.old), cr(item.id, v)],
    explanation: [
      `${item.what}. It arose before the change, so it ${item.credit ? 'belongs to' : 'is borne by'} the partners in the old ratio ${ch.old.join(':')}: ${eachOf(names, names.map((_, i) => part(v, ch.old, i)))}.`,
      item.credit ? `The balance is closed by a debit of ${inr(v)}, and each partner's ${own} A/c is credited.` : `Each partner's ${own} A/c is debited, and the balance is closed by a credit of ${inr(v)}.`,
    ],
  };
}

/** Goodwill of the firm adjusted between the partners who gain and those who sacrifice, without a Goodwill A/c. */
export function goodwillItem(ch: Change, names: readonly string[], G: number, fixed: boolean): SetItem {
  return {
    text: `Goodwill of the firm, valued at ${inr(G)}, is adjusted through the partners' ${fixed ? 'current' : 'capital'} accounts.`,
    lines: compensation(ch, names, G, fixed),
    explanation: [
      movesText(ch, names).join(' '),
      [...ch.gain, ...ch.sac].map((i) => `${names[i]}: ${inr(G)} x ${frac(Math.abs(ch.d[i]), ch.L)} = ${inr(moved(G, ch, i))}.`).join(' '),
      `A partner who gains pays for the share gained: ${accountsAre(names, ch.gain, fixed)} debited. A partner who sacrifices is compensated: ${accountsAre(names, ch.sac, fixed)} credited. No Goodwill A/c is raised for it.`,
    ],
  };
}

/** Goodwill that stands in the books, written off among all the partners in the old ratio. */
export function writeOffItem(ch: Change, names: readonly string[], B: number, fixed: boolean): SetItem {
  return {
    text: `Goodwill appears in the books at ${inr(B)} and is written off.`,
    lines: [...sharedLines(names, fixed, 'Dr', B, ch.old), cr('goodwill', B)],
    explanation: [
      `Goodwill already in the books is written off among all the partners in the old ratio ${ch.old.join(':')}, whoever gains or sacrifices: ${eachOf(names, names.map((_, i) => part(B, ch.old, i)))}.`,
      `Each partner's ${fixed ? 'Current' : 'Capital'} A/c is debited and Goodwill A/c is credited with ${inr(B)}, which closes it.`,
    ],
  };
}

/** What an entry credits to an account, net of what it debits, in rupees. */
const netOf = (lines: readonly JournalLine[], accountId: string): number => lines.filter((l) => l.accountId === accountId).reduce((s, l) => s + (l.side === 'Cr' ? l.amount : -l.amount), 0) / 100;

/**
 * Every entry of a set on a change of ratio, worked out again: the ratios are read from the opening line and the
 * figures from the item's own text, and each partner's debit or credit is found with plain fractions. The balance of
 * Revaluation A/c is followed from item to item, so that the entry that closes it must clear exactly what the
 * items before it left.
 */
function changeSetHolds(q: JournalSetQuestion): boolean {
  const g = given(q.prompt.split('\n')[1]);
  const fixed = fixedIn(q.prompt);
  let revaluation = 0;
  for (const e of q.entries) {
    const a = amountsIn(e.text);
    const each = (base: number, share: readonly number[]): boolean => g.names.every((name, i) => near(netOf(e.expected, acct(name, fixed)), base * share[i]));
    const rev = netOf(e.expected, 'revaluation');
    let ok: boolean;
    if (e.text.startsWith('Revaluation A/c is closed')) {
      ok = revaluation !== 0 && rev === -revaluation && each(revaluation, g.old);
    } else if (e.text.startsWith('Goodwill of the firm')) {
      ok = rev === 0 && netOf(e.expected, 'goodwill') === 0 && each(a[0], g.give);
    } else if (e.text.startsWith('Goodwill appears in the books')) {
      ok = rev === 0 && netOf(e.expected, 'goodwill') === a[0] && each(-a[0], g.old);
    } else if (e.text.includes('Workmen Compensation Reserve')) {
      const [reserve, claim] = a;
      ok =
        rev === -Math.max(claim - reserve, 0) &&
        netOf(e.expected, 'workmenCompensationReserve') === -reserve &&
        netOf(e.expected, 'workmenCompensationClaim') === claim &&
        each(Math.max(reserve - claim, 0), g.old);
    } else if (e.text.includes('Investment Fluctuation Reserve')) {
      const [book, reserve, market] = a;
      const fall = book - market;
      ok =
        fall > 0 &&
        rev === -Math.max(fall - reserve, 0) &&
        netOf(e.expected, 'investmentFluctuationReserve') === -reserve &&
        netOf(e.expected, 'investments') === fall &&
        each(Math.max(reserve - fall, 0), g.old);
    } else if (/General Reserve|Profit and Loss A\/c|Advertisement Suspense|Deferred Revenue Expenditure/.test(e.text)) {
      ok = rev === 0 && each(isCreditBalance(e.text) ? a[0] : -a[0], g.old);
    } else {
      ok = e.expected.length === 2 && rev === effectIn(e.text);
    }
    if (!ok) return false;
    revaluation += rev;
  }
  return revaluation === 0;
}
const changeSetVerify = checked((q: JournalSetQuestion) => setHolds()(q) && changeSetHolds(q));

// 1. cpr-set-goodwill-reserves: the reserve and the balance of Profit and Loss A/c (and, in some seeds, a fictitious
//    asset) closed in the old ratio, and goodwill adjusted between the partners; three or four entries (easy)
const setGoodwillReserves = journalSetTemplate({
  id: 'cpr-set-goodwill-reserves', topicId: T, conceptId: 'cpr-sets', difficulty: 'easy',
  generate: (rng) => {
    const ch = anyChange(rng, true);
    const f = firmOf(rng, ch.old, ch.neu);
    const fixed = rng.int(0, 3) === 0;
    const ok = (v: number): boolean => fairIn(v, ch.old);
    const R = pickAmount(rng, 40000, 300000, ok);
    const pl = rng.int(0, 1) === 0 ? HELD[1] : HELD[2];
    const P = pickAmount(rng, 20000, 120000, (v) => ok(v) && v !== R);
    const fict = rng.int(0, 1) === 0 ? rng.pick(FICTITIOUS) : null;
    const D = fict ? pickAmount(rng, 10000, 60000, (v) => ok(v) && v !== R && v !== P) : 0;
    const G = pickAmount(rng, 60000, 600000, (v) => fairMove(v, ch));
    if (R === null || P === null || D === null || G === null) return null;
    const balances = rng.shuffle([heldItem(HELD[0], R, ch, f.names, fixed), heldItem(pl, P, ch, f.names, fixed), ...(fict ? [heldItem(fict, D, ch, f.names, fixed)] : [])]);
    const goodwill = goodwillItem(ch, f.names, G, fixed);
    return {
      task: SET_TASK,
      opening: `${f.intro} ${f.change} ${capitalsLine(fixed)} The firm closes its books on 31 March, and the balances named below are those of its Balance Sheet on 31 March ${f.year}: each is closed before the new ratio takes effect. No Goodwill A/c is to be opened: a partner who gains compensates a partner who sacrifices.`,
      transactions: lettering(rng.int(0, 1) === 0 ? [...balances, goodwill] : [goodwill, ...balances]),
      hints: [H.reserves[1], H.goodwill[1]],
      distractorAccounts: ['goodwill', 'revaluation', 'profitAndLossAppropriation', acct(f.names[0], !fixed), ...(fict ? [] : ['advertisementSuspense'])],
    };
  },
  verify: changeSetVerify,
});

/** The changes in value a student works out from a book value, a revised value or a rate, and those that are an amount left out of the books. */
export const WORKED_KINDS = [ASSET_UP, FIXED_DOWN, STOCK_DOWN, PROVISION];
export const PLAIN_KINDS = [OUTSTANDING, CREDITORS, UNRECORDED, ACCRUED];
/**
 * False for a change in value whose figures would not be believed beside the others of a firm of this size: stock or
 * machinery of a few thousand rupees, a building of less than two lakh, furniture of many lakhs, debtors too few (or
 * too many) to need the provision.
 */
function believable(it: RevItem): boolean {
  const id = it.effect > 0 ? it.dr : it.cr;
  if (id === 'provisionForDoubtfulDebts') {
    const debtors = /debtors of (₹[\d,]+)/.exec(it.text);
    return !debtors || (amountsIn(debtors[1])[0] >= 60000 && amountsIn(debtors[1])[0] <= 600000);
  }
  if (it.gross === undefined || !['stock', 'machinery', 'furniture', 'building', 'land'].includes(id)) return true;
  const book = it.gross - it.effect;
  if (id === 'building' || id === 'land') return book >= 200000 && book <= 2000000;
  if (id === 'furniture') return book >= 80000 && book <= 500000;
  return book >= 80000 && book <= (id === 'stock' ? 800000 : 1200000);
}
/**
 * One item of each kind, in that order, with figures to work out wherever the kind allows (`computed`) and figures in
 * the steps a paper uses. The base bank's `revItemsOf` fits the amount of its last item in steps as fine as ₹1,000,
 * which can leave machinery "valued at ₹5,38,000"; here every amount keeps to its kind's own step, so that a building,
 * machinery, furniture or stock changes by a whole ₹5,000 and stands at a whole ₹5,000 before and after. The amount
 * that is fitted, so that the total passes `ok`, is that of a kind stated in whole thousands (a provision, an
 * outstanding expense, creditors, accrued income) on one attempt and that of the last kind on the next; a kind in
 * coarser steps is fitted in steps of ₹5,000. A few draws are tried.
 */
export function workedItems(rng: Rng, kinds: readonly RevKind[], ok: (sum: number) => boolean, computed = true): RevItem[] | null {
  const fine = kinds.flatMap((k, t) => (k.step <= 1000 ? [t] : []));
  for (let attempt = 0; attempt < 24; attempt++) {
    const fit = fine.length > 0 && attempt % 2 === 0 ? rng.pick(fine) : kinds.length - 1;
    const amounts = kinds.map((k, t) => (t === fit ? 0 : rng.step(k.min, k.max, k.step)));
    const others = total(kinds.map((k, t) => k.sign * amounts[t]));
    const kind = kinds[fit];
    const step = Math.min(kind.step, 5000);
    const fits: number[] = [];
    for (let v = Math.ceil(kind.min / step) * step; v <= kind.max; v += step) if (ok(others + kind.sign * v)) fits.push(v);
    if (fits.length === 0) continue;
    amounts[fit] = rng.pick(fits);
    // An item whose book value cannot be believed is made again (another form, rate or book value) before the draw is given up.
    const items = kinds.map((k, t) => {
      for (let again = 0; again < 6; again++) {
        const item = k.make(rng, amounts[t], computed);
        if (believable(item)) return item;
      }
      return null;
    });
    if (items.every((it): it is RevItem => it !== null)) return items;
  }
  return null;
}

/** One change in the value of an asset or a liability as an item of a set: its entry through Revaluation A/c. */
export function revSetItem(it: RevItem): SetItem {
  const x = Math.abs(it.effect);
  return {
    text: `${upper(it.text)}.`,
    lines: [dr(it.dr, x), cr(it.cr, x)],
    explanation: [it.work, it.effect > 0 ? `${ledgerLabel(it.dr)} is debited and Revaluation A/c is credited with ${inr(x)}.` : `Revaluation A/c is debited and ${ledgerLabel(it.cr)} is credited with ${inr(x)}.`],
  };
}

/** The entry that closes Revaluation A/c: its profit or loss, from the gains and the losses passed through it, to the partners in the old ratio. */
export function transferItem(ch: Change, names: readonly string[], fixed: boolean, effects: readonly number[]): SetItem {
  const gains = effects.filter((x) => x > 0);
  const losses = effects.filter((x) => x < 0).map((x) => -x);
  const net = total(gains) - total(losses);
  const own = fixed ? 'Current' : 'Capital';
  const added = (xs: readonly number[]): string => (xs.length === 0 ? 'nil' : xs.length === 1 ? inr(xs[0]) : `${xs.map(inr).join(' + ')} = ${inr(total(xs))}`);
  return {
    text: 'Revaluation A/c is closed, and the profit or loss on revaluation is transferred to the partners.',
    lines: net > 0 ? [dr('revaluation', net), ...sharedLines(names, fixed, 'Cr', net, ch.old)] : [...sharedLines(names, fixed, 'Dr', -net, ch.old), cr('revaluation', -net)],
    explanation: [
      `Credit side of Revaluation A/c (gains): ${added(gains)}. Debit side (losses): ${added(losses)}.`,
      `${net > 0 ? 'Profit' : 'Loss'} on revaluation = ${gains.length > 0 && losses.length > 0 ? `${inr(Math.max(total(gains), total(losses)))} - ${inr(Math.min(total(gains), total(losses)))} = ` : ''}${inr(Math.abs(net))}, shared in the old ratio ${ch.old.join(':')}: ${eachOf(names, names.map((_, i) => part(Math.abs(net), ch.old, i)))}.`,
      net > 0 ? `Revaluation A/c is debited with ${inr(net)}, which closes it, and each partner's ${own} A/c is credited.` : `Each partner's ${own} A/c is debited and Revaluation A/c is credited with ${inr(-net)}, which closes it.`,
    ],
  };
}

/** A reserve kept for one purpose, met by a claim or a fall in value: one entry, and what it charges to Revaluation A/c. */
interface PurposeItem extends SetItem {
  /** The part of the claim or of the fall in value that the reserve does not cover: a loss debited to Revaluation A/c. */
  charge: number;
}

/** A Workmen Compensation Reserve and a claim admitted: the reserve covers it and leaves a surplus, is exactly used up by it, or falls short. */
function wcrSetItem(rng: Rng, ch: Change, names: readonly string[], fixed: boolean): PurposeItem | null {
  const kind = rng.pick(['short', 'short', 'surplus', 'surplus', 'equal'] as const);
  const own = fixed ? 'Current' : 'Capital';
  const say = (reserve: number, claim: number): string =>
    `The Workmen Compensation Reserve stands at ${inr(reserve)}, and a claim of ${inr(claim)} for workmen's compensation is admitted against the firm.`;
  if (kind === 'equal') {
    const reserve = rng.step(40000, 120000, 10000);
    return {
      charge: 0,
      text: say(reserve, reserve),
      lines: [dr('workmenCompensationReserve', reserve), cr('workmenCompensationClaim', reserve)],
      explanation: [
        `The claim takes the whole reserve: Workmen Compensation Reserve A/c is closed by a debit of ${inr(reserve)}.`,
        `The claim of ${inr(reserve)} is now owed: ${CLAIM_ACCOUNT} is credited with the same amount. Nothing is left for the partners, and nothing is charged to Revaluation A/c.`,
      ],
    };
  }
  if (kind === 'short') {
    const reserve = rng.step(40000, 120000, 10000);
    const S = rng.step(5000, 30000, 5000);
    const claim = reserve + S;
    return {
      charge: S,
      text: say(reserve, claim),
      lines: [dr('workmenCompensationReserve', reserve), dr('revaluation', S), cr('workmenCompensationClaim', claim)],
      explanation: [
        `The reserve of ${inr(reserve)} meets only a part of the claim of ${inr(claim)}: Workmen Compensation Reserve A/c is closed by a debit of ${inr(reserve)}.`,
        `The shortfall, ${inr(claim)} - ${inr(reserve)} = ${inr(S)}, is a loss: Revaluation A/c is debited.`,
        `The whole claim of ${inr(claim)} is now owed: ${CLAIM_ACCOUNT} is credited. Nothing is left for the partners.`,
      ],
    };
  }
  const S = pickAmount(rng, 10000, 90000, (v) => fairIn(v, ch.old));
  if (S === null) return null;
  const claim = rng.step(20000, 100000, 10000);
  const reserve = claim + S;
  return {
    charge: 0,
    text: say(reserve, claim),
    lines: [dr('workmenCompensationReserve', reserve), cr('workmenCompensationClaim', claim), ...sharedLines(names, fixed, 'Cr', S, ch.old)],
    explanation: [
      `Workmen Compensation Reserve A/c is closed by a debit of ${inr(reserve)}.`,
      `The claim of ${inr(claim)} is met out of it first and is now owed: ${CLAIM_ACCOUNT} is credited.`,
      `What is left, ${inr(reserve)} - ${inr(claim)} = ${inr(S)}, is a free reserve credited to the partners' ${own} A/cs in the old ratio ${ch.old.join(':')}: ${eachOf(names, names.map((_, i) => part(S, ch.old, i)))}.`,
    ],
  };
}

/** An Investment Fluctuation Reserve and investments whose market value has fallen: the reserve covers the fall, or falls short. */
function ifrSetItem(rng: Rng, ch: Change, names: readonly string[], fixed: boolean): PurposeItem | null {
  const short = rng.int(0, 1) === 0;
  const own = fixed ? 'Current' : 'Capital';
  const book = rng.step(250000, 800000, 10000);
  const say = (reserve: number, market: number): string =>
    `Investments stand in the books at ${inr(book)} and the Investment Fluctuation Reserve at ${inr(reserve)}; the market value of the investments is ${inr(market)}, and they are to be shown at that value.`;
  if (short) {
    const reserve = rng.step(30000, 80000, 10000);
    const S = rng.step(5000, 25000, 5000);
    const fall = reserve + S;
    return {
      charge: S,
      text: say(reserve, book - fall),
      lines: [dr('investmentFluctuationReserve', reserve), dr('revaluation', S), cr('investments', fall)],
      explanation: [
        `Fall in value = ${inr(book)} - ${inr(book - fall)} = ${inr(fall)}: Investments A/c is credited.`,
        `Investment Fluctuation Reserve A/c is closed by a debit of ${inr(reserve)}, which covers only a part of the fall.`,
        `The rest, ${inr(fall)} - ${inr(reserve)} = ${inr(S)}, is a loss: Revaluation A/c is debited. Nothing is left for the partners.`,
      ],
    };
  }
  const S = pickAmount(rng, 10000, 90000, (v) => fairIn(v, ch.old));
  if (S === null) return null;
  const fall = rng.step(10000, 60000, 5000);
  const reserve = fall + S;
  return {
    charge: 0,
    text: say(reserve, book - fall),
    lines: [dr('investmentFluctuationReserve', reserve), cr('investments', fall), ...sharedLines(names, fixed, 'Cr', S, ch.old)],
    explanation: [
      `Fall in value = ${inr(book)} - ${inr(book - fall)} = ${inr(fall)}: Investments A/c is credited.`,
      `Investment Fluctuation Reserve A/c is closed by a debit of ${inr(reserve)}; it covers the fall.`,
      `What is left, ${inr(reserve)} - ${inr(fall)} = ${inr(S)}, is credited to the partners' ${own} A/cs in the old ratio ${ch.old.join(':')}: ${eachOf(names, names.map((_, i) => part(S, ch.old, i)))}.`,
    ],
  };
}

// 2. cpr-set-revaluation: the assets and liabilities revalued, an entry for each change, with a Workmen Compensation
//    Reserve against a claim or an Investment Fluctuation Reserve against a fall in value in half the seeds, and
//    the entry that closes Revaluation A/c; four or five entries (medium)
const setRevaluation = journalSetTemplate({
  id: 'cpr-set-revaluation', topicId: T, conceptId: 'cpr-sets', difficulty: 'medium',
  // Version 2: the check on the size of the debtors (`believable`) now runs, so some seeds draw again.
  version: 2,
  generate: (rng) => {
    const ch = anyChange(rng, true);
    const f = firmOf(rng, ch.old, ch.neu);
    const fixed = rng.int(0, 3) === 0;
    const purpose = rng.pick(['none', 'none', 'wcr', 'ifr'] as const);
    const kept = purpose === 'wcr' ? wcrSetItem(rng, ch, f.names, fixed) : purpose === 'ifr' ? ifrSetItem(rng, ch, f.names, fixed) : null;
    if (purpose !== 'none' && kept === null) return null;
    const charge = kept?.charge ?? 0;
    // Two of the changes are worked out from a book value or a rate; the others are amounts that were left out of the
    // books. Investments that are revalued against their reserve are not also "brought in" as an unrecorded asset.
    const worked = rng.shuffle(WORKED_KINDS).slice(0, 2);
    const others = rng.shuffle(purpose === 'ifr' ? PLAIN_KINDS.filter((k) => k !== UNRECORDED) : PLAIN_KINDS).slice(0, (kept ? rng.int(2, 3) : rng.int(3, 4)) - 2);
    const items = workedItems(rng, rng.shuffle([...worked, ...others]), (sum) => fairIn(sum - charge, ch.old));
    if (!items) return null;
    const changes: SetItem[] = items.map(revSetItem);
    // The reserve stands anywhere among the changes in value; the closing of Revaluation A/c is always last.
    if (kept) changes.splice(rng.int(0, changes.length), 0, { text: kept.text, lines: kept.lines, explanation: kept.explanation });
    return {
      task: SET_TASK,
      opening: `${f.intro} ${f.change} ${capitalsLine(fixed)} On that date the partners agree on the matters below, and one entry is passed for each. Every change in the value of an asset or a liability is recorded in the books through Revaluation A/c.${kept ? ' The reserve named among them is not to remain in the books.' : ''}`,
      transactions: lettering([...changes, transferItem(ch, f.names, fixed, changes.map((c) => netOf(c.lines, 'revaluation')).filter((x) => x !== 0))]),
      hints: kept ? [H.specific[1], H.revaluation[1]] : H.revaluation,
      distractorAccounts: ['profitAndLoss', 'profitAndLossAppropriation', 'generalReserve', 'debtors', acct(f.names[0], !fixed)],
    };
  },
  verify: changeSetVerify,
});

// 3. cpr-set-whole-change: everything that is settled on a change, each matter recorded in the books: the reserve
//    distributed, an accumulated loss or a fictitious asset written off, two or three changes in value and the
//    closing of Revaluation A/c, goodwill in the books written off (two seeds in three) and goodwill adjusted; six to
//    eight entries, the three groups in an order drawn from the seed (complex). The other way of settling a change,
//    leaving the balances as they are and passing one adjusting entry, has no Revaluation A/c and no entry for a
//    reserve, so it cannot end this set: it is the set after it.
const setWholeChange = journalSetTemplate({
  id: 'cpr-set-whole-change', topicId: T, conceptId: 'cpr-sets', difficulty: 'complex',
  // Version 2: the check on the size of the debtors (`believable`) now runs, so some seeds draw again.
  version: 2,
  generate: (rng) => {
    const ch = anyChange(rng);
    const f = firmOf(rng, ch.old, ch.neu);
    const fixed = rng.int(0, 3) === 0;
    const ok = (v: number): boolean => fairIn(v, ch.old);
    const R = pickAmount(rng, 40000, 300000, ok);
    const lost = rng.pick([HELD[2], ...FICTITIOUS]);
    const D = pickAmount(rng, 10000, 80000, (v) => ok(v) && v !== R);
    const B = rng.int(0, 2) > 0 ? pickAmount(rng, 20000, 150000, (v) => ok(v) && v !== R && v !== D) : 0;
    if (R === null || D === null || B === null) return null;
    const G = pickAmount(rng, B + 40000, 900000, (v) => fairMove(v, ch));
    if (G === null) return null;
    const kinds = rng.shuffle([...rng.shuffle(WORKED_KINDS).slice(0, 2), ...rng.shuffle(PLAIN_KINDS).slice(0, rng.int(0, 1))]);
    const items = workedItems(rng, kinds, (sum) => fairIn(sum, ch.old));
    if (!items) return null;
    const balances = rng.shuffle([heldItem(HELD[0], R, ch, f.names, fixed), heldItem(lost, D, ch, f.names, fixed)]);
    const revaluation = [...items.map(revSetItem), transferItem(ch, f.names, fixed, items.map((it) => it.effect))];
    const goodwill = [...(B > 0 ? [writeOffItem(ch, f.names, B, fixed)] : []), goodwillItem(ch, f.names, G, fixed)];
    return {
      task: SET_TASK,
      opening: `${f.intro} ${f.change} ${capitalsLine(fixed)} The firm closes its books on 31 March, and the balances named below are those of its Balance Sheet on 31 March ${f.year}. On the change every reserve and accumulated loss is closed, every change in the value of an asset or a liability is recorded in the books through Revaluation A/c, and no Goodwill A/c is to remain in the books: a partner who gains compensates a partner who sacrifices. One entry is passed for each matter below.`,
      transactions: lettering(rng.shuffle([balances, revaluation, goodwill]).flat()),
      hints: [H.reserves[1], H.revaluation[1]],
      distractorAccounts: ['profitAndLossAppropriation', 'debtors', acct(f.names[0], !fixed), ...(B > 0 ? [] : ['goodwill']), ...(lost.id === 'profitAndLoss' ? [] : ['profitAndLoss'])],
    };
  },
  verify: changeSetVerify,
});

/** A value agreed on the change that the partners do not record: what the books show, what it is agreed at, the gain or loss. */
interface Revised {
  /** As a clause: "the building, in the books at ₹5,00,000, is valued at ₹5,40,000". */
  text: string;
  /** Above zero a gain, below zero a loss. */
  effect: number;
  work: string;
}
const REVISED_VALUES = ['fixedUp', 'fixedDown', 'stock', 'investments', 'creditors'] as const;

/** Two revised values of different kinds. Each is only a value agreed on: nothing is "recorded" or "brought in". */
function revisedValues(rng: Rng): Revised[] {
  const asset = (a: string, book: number, value: number): Revised => ({
    text: `the ${a}, in the books at ${inr(book)}, ${a === 'investments' ? 'are' : 'is'} valued at ${inr(value)}`,
    effect: value - book,
    work: value > book ? `${upper(a)}: ${inr(value)} - ${inr(book)} = ${inr(value - book)} above the book value, a gain.` : `${upper(a)}: ${inr(book)} - ${inr(value)} = ${inr(book - value)} below the book value, a loss.`,
  });
  return rng
    .shuffle([...REVISED_VALUES])
    .slice(0, 2)
    .map((kind): Revised => {
      if (kind === 'fixedUp') {
        const book = rng.step(300000, 900000, 50000);
        return asset(rng.pick(['building', 'land']), book, book + rng.step(20000, 100000, 10000));
      }
      if (kind === 'fixedDown') {
        const book = rng.step(150000, 500000, 10000);
        return asset(rng.pick(['machinery', 'furniture']), book, book - rng.step(10000, 60000, 5000));
      }
      if (kind === 'stock') {
        const book = rng.step(100000, 400000, 10000);
        return asset('stock', book, book - rng.step(5000, 40000, 5000));
      }
      if (kind === 'investments') {
        const book = rng.step(100000, 400000, 10000);
        return asset('investments', book, book + rng.pick([1, -1]) * rng.step(10000, 50000, 5000));
      }
      const book = rng.step(60000, 200000, 10000);
      const x = rng.step(5000, 20000, 5000);
      return {
        text: `the creditors, in the books at ${inr(book)}, are agreed at ${inr(book - x)}`,
        effect: x,
        work: `Creditors: ${inr(book)} - ${inr(book - x)} = ${inr(x)} less to pay than the books show, a gain.`,
      };
    });
}
/**
 * Capitals in whole ten thousands that stand near the new profit-sharing ratio without being in it, so that bringing
 * them to it moves believable amounts: a total that divides in the new ratio, each partner's share of it (`target`),
 * and capitals that differ from those shares by ₹10,000 to ₹80,000 for all but the last partner. Null when a capital
 * would be too small.
 */
export function capitalsNear(rng: Rng, ch: Change): { caps: number[]; sum: number; target: number[] } | null {
  const sum = pickAmount(rng, 600000, 1800000, (v) => ch.neu.every((x) => (v * x) % (ch.sn * 10000) === 0));
  if (sum === null) return null;
  const target = ch.neu.map((_, i) => part(sum, ch.neu, i));
  const off = target.slice(0, -1).map(() => rng.pick([1, -1]) * rng.step(10000, 80000, 10000));
  const caps = target.map((t, i) => t + (i < off.length ? off[i] : -total(off)));
  return caps.every((c) => c >= 80000) ? { caps, sum, target } : null;
}

/** What the revised values in a text come to, read back: a liability agreed at less is a gain, an asset valued at less a loss. */
const revisedIn = (text: string): number =>
  total([...text.matchAll(/the ([a-z]+), in the books at (₹[\d,]+), (?:is|are) (?:valued|agreed) at (₹[\d,]+)/g)].map((m) => (m[1] === 'creditors' ? 1 : -1) * (amountsIn(m[2])[0] - amountsIn(m[3])[0])));

// 4. cpr-set-single-entry: the partners leave the reserve, the balance of Profit and Loss A/c and the book values as
//    they are. No Revaluation A/c is opened: one adjusting entry is passed for the net effect (which is a net loss in
//    some seeds, so that the entry runs the other way), goodwill is adjusted by an entry of its own, and each
//    partner's capital is then made proportionate to the new ratio, by cheque or through a current account; four or
//    five entries (medium). The base bank's `cpr-single-combined-entry` asks for ONE entry for everything and so adds
//    goodwill to the net effect; this set says that goodwill has a separate entry, and its working says why the two
//    come to the same capitals.
const setSingleEntry = journalSetTemplate({
  id: 'cpr-set-single-entry', topicId: T, conceptId: 'cpr-sets', difficulty: 'medium',
  generate: (rng) => {
    const ch = anyChange(rng, true);
    const f = firmOf(rng, ch.old, ch.neu);
    const names = f.names;
    // A net effect or a value of goodwill is used only when every amount it moves is a whole ₹500 and at least ₹2,000.
    const tidy = (v: number): boolean => fairMove(v, ch);
    const revised = revisedValues(rng);
    const rev = total(revised.map((r) => r.effect));
    const plKind = rng.pick(['none', 'credit', 'debit', 'loss'] as const);
    let R: number | null;
    let P: number | null;
    if (plKind === 'loss') {
      // A debit balance of Profit and Loss A/c larger than everything else: a net loss is left in the books.
      const reserve = rng.step(30000, 90000, 10000);
      const least = reserve + Math.max(rev, 0) + 20000;
      R = reserve;
      P = roundAmount(rng, least, least + 180000, (v) => reserve + rev - v < 0 && tidy(reserve + rev - v));
    } else {
      const balance = plKind === 'none' ? 0 : rng.step(10000, 60000, 5000);
      const signed = plKind === 'credit' ? balance : -balance;
      P = balance;
      R = roundAmount(rng, 40000, 300000, (v) => v > balance && v + signed + rev > 0 && tidy(v + signed + rev));
    }
    const G = pickAmount(rng, 60000, 600000, tidy);
    const held = capitalsNear(rng, ch);
    if (R === null || P === null || G === null || held === null) return null;
    const { caps, sum, target } = held;
    const pl = plKind === 'none' ? 0 : plKind === 'credit' ? P : -P;
    const net = R + pl + rev;
    const share = (v: number, i: number): number => (v * ch.d[i]) / ch.L; // credited when above zero
    const after = caps.map((c, i) => c + share(G, i) + share(net, i));
    const need = target.map((t, i) => t - after[i]);
    const open = names.flatMap((_, i) => (need[i] !== 0 ? [i] : []));
    if (open.length < 2 || after.some((a) => a <= 0) || open.some((i) => Math.abs(need[i]) < 5000)) return null;
    const viaBank = rng.int(0, 1) === 0;
    const signedInr = (v: number): string => `${v > 0 ? '+' : '-'} ${inr(Math.abs(v))}`;
    const adjustingItem: SetItem = {
      text: `The Balance Sheet on 31 March ${f.year} shows a General Reserve of ${inr(R)}${plKind === 'none' ? '' : ` and a ${plKind === 'credit' ? 'credit' : 'debit'} balance of ${inr(P)} in Profit and Loss A/c`}; ${revised.map((r) => r.text).join(' and ')}. The one adjusting entry is passed for all of these.`,
      lines: adjusting(ch, names, net, false),
      explanation: [
        `${revised.map((r) => r.work).join(' ')} The book values are not altered, so no Revaluation A/c is opened: each figure goes into the net effect.`,
        `Net effect = General Reserve ${inr(R)}${pl === 0 ? '' : ` ${pl > 0 ? '+ credit' : '- debit'} balance of Profit and Loss A/c ${inr(P)}`}${revised.map((r) => ` ${r.effect > 0 ? '+ gain' : '- loss'} ${inr(Math.abs(r.effect))}`).join('')} = ${net > 0 ? `${inr(net)}, a net gain left in the books` : `a net loss of ${inr(-net)} left in the books`}.`,
        `${movesText(ch, names).join(' ')} ${[...ch.gain, ...ch.sac].map((i) => `${names[i]}: ${inr(Math.abs(net))} x ${frac(Math.abs(ch.d[i]), ch.L)} = ${inr(moved(Math.abs(net), ch, i))}.`).join(' ')}`,
        whyDirection(net),
        'Goodwill has an entry of its own here because the question asks for one. Where a question asks for a single entry for everything, goodwill is added to the net effect; the capitals come to the same figures either way.',
      ],
    };
    const capitalItem = (i: number): SetItem => {
      const name = names[i];
      const other = viaBank ? 'bank' : partnerCurrent(name);
      const otherName = viaBank ? 'Bank A/c' : `${name}'s Current A/c`;
      const x = Math.abs(need[i]);
      return {
        text: `${name}'s capital is made proportionate to the new ratio.`,
        lines: need[i] > 0 ? [dr(other, x), cr(partnerCapital(name), x)] : [dr(partnerCapital(name), x), cr(other, x)],
        explanation: [
          ch.d[i] === 0
            ? `${name} neither gains nor sacrifices, so the two entries above do not touch ${name}'s capital of ${inr(caps[i])}.`
            : `${name}'s capital after the two entries above = ${inr(caps[i])} ${signedInr(share(G, i))} (goodwill) ${signedInr(share(net, i))} (adjusting entry) = ${inr(after[i])}.`,
          `The two entries only move capital between the partners, so the total capital is still ${caps.map(inr).join(' + ')} = ${inr(sum)}. ${name}'s share of it in the new ratio = ${ch.neu[i]}/${ch.sn} of ${inr(sum)} = ${inr(target[i])}.`,
          need[i] > 0
            ? `Deficiency = ${inr(target[i])} - ${inr(after[i])} = ${inr(x)}: ${otherName} is debited and ${name}'s Capital A/c is credited, which raises the capital to ${inr(target[i])}.`
            : `Surplus = ${inr(after[i])} - ${inr(target[i])} = ${inr(x)}: ${name}'s Capital A/c is debited, which brings the capital down to ${inr(target[i])}, and ${otherName} is credited.`,
        ],
      };
    };
    const first = [goodwillItem(ch, names, G, false), adjustingItem];
    return {
      task: SET_TASK,
      // Where the surplus or deficiency goes to current accounts the capitals are not called fluctuating (a firm that
      // keeps current accounts beside its capital accounts is not one with fluctuating capitals): the opening says
      // instead which accounts the two entries pass through.
      opening: `${f.intro} ${f.change} ${viaBank ? `The capitals are fluctuating; on that date they stand at ${eachOf(names, caps)}.` : `On that date their capitals stand at ${eachOf(names, caps)}.`} The partners decide to leave the ${plKind === 'none' ? 'reserve' : 'reserve, the balance of Profit and Loss A/c'} and the book values of the assets and liabilities in the books as they are: no Revaluation A/c is opened, and one adjusting entry is passed through the capital accounts for all of them. No Goodwill A/c is opened either: goodwill is adjusted between the partners by a separate entry, also through the capital accounts. The capitals are then to be made proportionate to the new profit-sharing ratio, on the total capital of the firm as it stands after these two entries: ${viaBank ? "a partner whose capital falls short pays the deficiency into the firm's bank account, and a partner with a surplus is paid it by cheque" : "the surplus or deficiency of each partner's capital is transferred to that partner's current account, opened for the purpose"}.`,
      transactions: lettering([...(rng.int(0, 1) === 0 ? first : [...first].reverse()), ...open.map(capitalItem)]),
      hints: [H.single[1], H.capitals[1]],
      distractorAccounts: ['generalReserve', 'profitAndLoss', 'revaluation', 'goodwill', viaBank ? partnerCurrent(names[open[0]]) : 'cash'],
    };
  },
  verify: checked((q: JournalSetQuestion) => {
    const opening = q.prompt.split('\n')[1];
    const g = given(opening);
    const caps = amountsIn(opening).slice(0, g.names.length);
    const viaBank = opening.includes('bank account');
    const each = (lines: readonly JournalLine[], base: number): boolean => g.names.every((name, i) => near(netOf(lines, partnerCapital(name)), base * g.give[i]));
    let moved2 = 0; // goodwill and the net effect, which both go to each partner by the share given up
    let adjusted = 0;
    for (const e of q.entries) {
      if (e.text.startsWith('Goodwill of the firm')) {
        const G = amountsIn(e.text)[0];
        if (!each(e.expected, G)) return false;
        moved2 += G;
        adjusted++;
      } else if (e.text.startsWith('The Balance Sheet')) {
        const R = amountsIn(/General Reserve of (₹[\d,]+)/.exec(e.text)![1])[0];
        const m = /(credit|debit) balance of (₹[\d,]+)/.exec(e.text);
        const net = R + (m ? (m[1] === 'credit' ? 1 : -1) * amountsIn(m[2])[0] : 0) + revisedIn(e.text);
        if (net === 0 || !each(e.expected, net) || netOf(e.expected, 'revaluation') !== 0 || netOf(e.expected, 'generalReserve') !== 0) return false;
        moved2 += net;
        adjusted++;
      } else {
        // A capital is brought to the new ratio only after both entries, on the total the capitals had all along.
        const name = /^([A-Z][a-z]+)'s capital is made proportionate/.exec(e.text)![1];
        const i = g.names.indexOf(name);
        const need = total(caps) * g.neu[i] - (caps[i] + moved2 * g.give[i]);
        if (adjusted !== 2 || !near(netOf(e.expected, partnerCapital(name)), need) || !near(netOf(e.expected, viaBank ? 'bank' : partnerCurrent(name)), -need)) return false;
      }
    }
    return setHolds()(q) && adjusted === 2;
  }),
});

const setTemplates: Template[] = [setGoodwillReserves, setRevaluation, setWholeChange, setSingleEntry];

// ===============================================================================================================
// Formats: the Revaluation Account, the partners' accounts in columns and the Balance Sheet after the change
// ===============================================================================================================
//  - every format is written up from journal entries posted with the engine, all of them dated the day the new
//    ratio takes effect, so its rows cannot disagree with its data and its two sides agree by construction;
//  - the data names the partners and the two ratios on its first line, then the balances and the matters settled,
//    one to a line; `verify` reads them back and works the format out again with plain fractions.

export const isPartnerAccount = (id: string): boolean => id.startsWith('capital:') || id.startsWith('current:');
/**
 * The house form of the result of revaluation, here and on admission and retirement. In Revaluation A/c each
 * partner's share is a row "Profit transferred to Asha's Capital A/c" (debit side) or "Loss transferred to Asha's
 * Capital A/c" (credit side), "...'s Current A/c" when capitals are fixed, and the plain "Asha's Capital A/c" is
 * accepted as other wording. In the partners' accounts the row is "Revaluation A/c (profit)" (credit side) or
 * "Revaluation A/c (loss)" (debit side), and the plain "Revaluation A/c" is accepted. The result named the wrong way
 * round stays a mistake, and neither plain wording is ever offered as a wrong label.
 */
const TRANSFERRED = / transferred to /;
const REVALUATION_PLAIN = 'Revaluation A/c';
/** The plain wording an examiner also accepts for a row, or null for a row that has none. */
const plainWording = (label: string): string | null =>
  TRANSFERRED.test(label) ? label.slice(label.indexOf(' transferred to ') + ' transferred to '.length) : /^Revaluation A\/c \((profit|loss)\)$/.test(label) ? REVALUATION_PLAIN : null;
/** The two sides of an account, with the other accepted wording (`also`) on every row that has one. */
export function withPlainWording<S extends Pick<AccountParts, 'left' | 'right'>>(sides: S): S {
  const rows = (list: readonly FormatRowParts[]): FormatRowParts[] =>
    list.map((r) => {
      const plain = plainWording(r.label);
      return plain === null ? r : { ...r, also: [plain] };
    });
  return { ...sides, left: { ...sides.left, rows: rows(sides.left.rows) }, right: { ...sides.right, rows: rows(sides.right.rows) } };
}
/** True when every row with a plain wording accepts it, no other row does, and it is not offered as a wrong label. */
const plainWordingHolds = (q: AccountQuestion): boolean =>
  q.sides.every((side) => side.rows.every((r) => (r.also ?? []).join('|') === (plainWording(r.label) ?? ''))) &&
  q.sides.some((side) => side.rows.some((r) => plainWording(r.label) !== null));
/** "₹40,000" for one figure, "₹40,000 + ₹8,000 = ₹48,000" for several, "nil" for none. */
const addedUp = (xs: readonly number[]): string => (xs.length === 0 ? 'nil' : xs.length === 1 ? inr(xs[0]) : `${xs.map(inr).join(' + ')} = ${inr(total(xs))}`);

/**
 * Revaluation A/c on a change of ratio: three to five changes in value, each on its side, and the profit or loss
 * shared in the old ratio, a row for each partner. A profit and a loss are equally likely. With `worked` the changes
 * are given through figures (a provision as a percentage of debtors, a rate of depreciation, a revised value).
 */
function revaluationAccount(rng: Rng, worked: boolean): AccountParts | null {
  const ch = anyChange(rng, true);
  const f = firmOf(rng, ch.old, ch.neu);
  const fixed = rng.int(0, 3) === 0;
  const profit = rng.int(0, 1) === 0;
  const count = worked ? rng.int(4, 5) : rng.int(3, 4);
  // A provision on debtors and an asset written down are always among the worked changes. The change whose amount is
  // chosen last runs the way the result is to: a rise in the land or the building for a profit, a fall for a loss.
  // Neither side is left with the partners' shares alone: a profit still has a loss among its changes, and a loss a gain.
  const falls = worked ? [PROVISION, rng.pick([FIXED_DOWN, STOCK_DOWN])] : profit ? [rng.pick([FIXED_DOWN, STOCK_DOWN, PROVISION, OUTSTANDING])] : [];
  const must = profit ? falls : [...falls, rng.pick([CREDITORS, UNRECORDED, ACCRUED])];
  const last = profit ? ASSET_UP : rng.pick([FIXED_DOWN, STOCK_DOWN].filter((k) => !must.includes(k)));
  const rest = REV_KINDS.filter((k) => !must.includes(k) && k !== last && (profit || k !== ASSET_UP));
  const kinds = [...rng.shuffle([...must, ...rng.shuffle(rest).slice(0, count - must.length - 1)]), last];
  const drawn = workedItems(rng, kinds, (sum) => sum > 0 === profit && fairIn(sum, ch.old), worked);
  if (!drawn) return null;
  const items = rng.shuffle(drawn);
  const sum = total(items.map((it) => it.effect));
  const date = `1 April ${f.year}`;
  const own = fixed ? 'Current' : 'Capital';
  const entries: DatedEntry[] = [
    ...items.map((it) => ({ date, lines: [dr(it.dr, Math.abs(it.effect)), cr(it.cr, Math.abs(it.effect))] })),
    { date, lines: profit ? [dr('revaluation', sum), ...sharedLines(f.names, fixed, 'Cr', sum, ch.old)] : [...sharedLines(f.names, fixed, 'Dr', -sum, ch.old), cr('revaluation', -sum)] },
  ];
  const word = profit ? 'Profit' : 'Loss';
  const view = accountOf(entries, 'revaluation', null, (id) => (isPartnerAccount(id) ? `${word} transferred to ${ledgerLabel(id)}` : ledgerLabel(id)));
  if (view.balance) return null;
  const gains = items.filter((it) => it.effect > 0).map((it) => it.effect);
  const losses = items.filter((it) => it.effect < 0).map((it) => -it.effect);
  return {
    task: `Prepare the Revaluation Account of the firm on ${date}, with each partner's share of the profit or loss on revaluation as a row of its own.`,
    data: [
      `${f.intro} ${f.change} ${capitalsLine(fixed)}`,
      `On ${date} the partners agree on these changes in the values of the assets and liabilities, all of which are recorded in the books:`,
      ...lettered(items.map((it) => it.text)),
    ].join('\n'),
    title: 'Revaluation A/c',
    ...withPlainWording(ledgerSides(view, { closeOn: date })),
    // The result named the wrong way round, the account itself, a balance carried down in an account that is closed,
    // the debtors where the provision is meant, and the account that shares out the profit of a year. The partner's
    // account named plainly is other wording of the row (`also`), so it is not among them.
    distractors: [...f.names.map((name) => `${profit ? 'Loss' : 'Profit'} transferred to ${acctName(name, fixed)}`), 'Revaluation A/c', 'Balance c/d', 'Debtors A/c', 'Profit and Loss A/c'],
    explanation: [
      ...items.map((it, t) => `(${'abcdefgh'[t]}) ${it.work}`),
      `Debit side (losses): ${addedUp(losses)}. Credit side (gains): ${addedUp(gains)}.`,
      `The ${profit ? 'credit' : 'debit'} side is the larger by ${inr(Math.abs(sum))}: a ${profit ? 'profit' : 'loss'} on revaluation. It arose while the old ratio was in force, so it goes to the partners in the old ratio ${ch.old.join(':')}: ${eachOf(f.names, f.names.map((_, i) => part(Math.abs(sum), ch.old, i)))}.`,
      profit
        ? `Each share is entered on the debit side, "To Profit transferred to" the partner's ${own} A/c (the partner's ${own} A/c named alone is accepted too), which closes the account: both sides total ${inr(view.total / 100)}.`
        : `Each share is entered on the credit side, "By Loss transferred to" the partner's ${own} A/c (the partner's ${own} A/c named alone is accepted too), which closes the account: both sides total ${inr(view.total / 100)}.`,
    ],
    hints: [H.revaluation[0], 'Add each side. The difference is the profit (credit side larger) or the loss (debit side larger) on revaluation, shared in the old ratio; entering each share on the shorter side closes the account.'],
  };
}

/** Revaluation A/c worked out again from the lettered lines of its data: every change on its side, and the result in the old ratio. */
const revaluationHolds = checked((q: AccountQuestion) => {
  const lines = q.data.split('\n');
  const g = given(lines[0]);
  const own = fixedIn(lines[0]) ? 'Current' : 'Capital';
  const effects = lines.slice(2).map(effectIn);
  const sum = total(effects);
  const [debit, credit] = [q.sides[0].rows, q.sides[1].rows];
  const isShare = (r: { label: string }): boolean => r.label.includes('transferred to');
  const plain = (rows: readonly { label: string; amounts: number[] }[]): number => total(rows.filter((r) => !isShare(r)).map((r) => r.amounts[0])) / 100;
  const shares = (sum > 0 ? debit : credit).filter(isShare);
  return (
    sum !== 0 &&
    plainWordingHolds(q) &&
    shares.every((r) => r.also?.length === 1 && g.names.some((name) => r.also?.[0] === `${name}'s ${own} A/c`)) &&
    plain(debit) === -total(effects.filter((x) => x < 0)) &&
    plain(credit) === total(effects.filter((x) => x > 0)) &&
    debit.length + credit.length === effects.length + g.names.length &&
    shares.length === g.names.length &&
    g.names.every((name, i) => shares.some((r) => r.label === `${sum > 0 ? 'Profit' : 'Loss'} transferred to ${name}'s ${own} A/c` && near(r.amounts[0] / 100, Math.abs(sum) * g.old[i])))
  );
});

// 1. cpr-fmt-revaluation-direct: Revaluation A/c from three or four changes given as amounts (easy)
const fmtRevaluationDirect = accountTemplate({
  id: 'cpr-fmt-revaluation-direct', topicId: T, conceptId: 'cpr-formats', difficulty: 'easy',
  generate: (rng) => revaluationAccount(rng, false),
  verify: revaluationHolds,
});

// 2. cpr-fmt-revaluation: Revaluation A/c from four or five changes with figures to work out: a provision as a
//    percentage of debtors, an asset written down at a rate or to a value, a building appreciated (medium)
const fmtRevaluation = accountTemplate({
  id: 'cpr-fmt-revaluation', topicId: T, conceptId: 'cpr-formats', difficulty: 'medium',
  // Version 2: the check on the size of the debtors (`believable`) now runs, so some seeds draw again.
  version: 2,
  generate: (rng) => revaluationAccount(rng, true),
  verify: revaluationHolds,
});

/**
 * The partners' accounts in columns on a change of ratio: the capital accounts when capitals are fluctuating
 * ('capital'), the current accounts when they are fixed ('current'), and the capital accounts with the capitals then
 * brought to the new ratio ('adjusted'). The reserve, a second balance (an undistributed profit, an accumulated loss
 * or a fictitious asset), goodwill in the books in some seeds, the result of revaluation and goodwill adjusted
 * between the partners are posted as entries, and the accounts are written up from them.
 */
function partnerAccounts(rng: Rng, mode: 'capital' | 'current' | 'adjusted'): AccountParts | null {
  const ch = anyChange(rng, true);
  const f = firmOf(rng, ch.old, ch.neu);
  const names = f.names;
  const n = names.length;
  const fixed = mode === 'current';
  const family = fixed ? 'current' : 'capital';
  const own = fixed ? 'Current' : 'Capital';
  const date = `1 April ${f.year}`;
  // Every figure shared in the old ratio gives each partner a fair amount, no two of them are the same amount, and
  // one of a lakh or more is a whole five thousand.
  const taken: number[] = [];
  const fresh = (min: number, max: number): number | null => {
    const v = pickAmount(rng, min, max, (x) => fairIn(x, ch.old) && !taken.includes(x) && (x < 100000 || x % 5000 === 0));
    if (v !== null) taken.push(v);
    return v;
  };
  const R = fresh(40000, 300000);
  const second = mode === 'adjusted' ? rng.pick([HELD[1], HELD[2], ...FICTITIOUS]) : rng.pick([HELD[1], HELD[2], rng.pick(FICTITIOUS), null]);
  const D = second ? fresh(20000, 90000) : 0;
  const profit = rng.int(0, 1) === 0;
  const P = fresh(10000, 120000);
  const B = rng.int(0, mode === 'adjusted' ? 1 : 2) === 0 ? fresh(20000, 120000) : 0;
  if (R === null || D === null || P === null || B === null) return null;
  const G = pickAmount(rng, B + 40000, 600000, (v) => fairMove(v, ch));
  if (G === null) return null;
  // What goes to the partners in the old ratio, net: credits less debits.
  const pool = R + (second ? (second.credit ? D : -D) : 0) + (profit ? P : -P) - B;
  const fixedCaps = names.map(() => rng.step(200000, 600000, 50000));
  let open: number[]; // the balance each account opens with; below zero for a debit balance
  let sum = 0; // 'adjusted': the total capital that is to be held in the new ratio
  let stated = false;
  const viaBank = rng.int(0, 1) === 0;
  if (mode === 'capital') {
    open = names.map(() => rng.step(150000, 600000, 10000));
  } else if (mode === 'current') {
    const overdrawn = rng.int(0, 2) === 0 ? rng.int(0, n - 1) : -1;
    open = names.map((_, i) => (i === overdrawn ? -rng.step(5000, 20000, 5000) : rng.step(10000, 60000, 5000)));
  } else {
    const near = capitalsNear(rng, ch);
    if (!near) return null;
    stated = rng.int(0, 2) === 0;
    if (stated) {
      // The partners fix a total of their own: a round figure not far from what the capitals come to.
      open = near.caps;
      const present = near.sum + pool;
      const fixedAt = pickAmount(rng, present - 150000, present + 150000, (v) => v !== present && splitsBy(v, ch.neu, 10000));
      if (fixedAt === null) return null;
      sum = fixedAt;
    } else {
      // The last capital is chosen so that the total after the adjustments divides in the new ratio.
      const first = near.caps.slice(0, -1);
      const lastCap = roundAmount(rng, Math.max(80000, near.caps[n - 1] - 60000), near.caps[n - 1] + 60000, (v) => splitsBy(total(first) + v + pool, ch.neu, 1000));
      if (lastCap === null) return null;
      open = [...first, lastCap];
      sum = total(open) + pool;
    }
  }
  const adjusted = open.map((o, i) => o + (pool * ch.old[i]) / ch.so + (G * ch.d[i]) / ch.L);
  const target = names.map((_, i) => part(sum, ch.neu, i));
  const need = mode === 'adjusted' ? target.map((t, i) => t - adjusted[i]) : names.map(() => 0);
  // Every column carries a balance down: a capital stays a credit balance, and no current account comes to exactly nil.
  if (adjusted.some((a) => (mode === 'current' ? a === 0 : a <= 0))) return null;
  if (mode === 'adjusted' && (need.filter((x) => x !== 0).length < 2 || need.some((x) => x !== 0 && Math.abs(x) < 5000))) return null;
  const other = (name: string): string => (viaBank ? 'bank' : partnerCurrent(name));
  const entries: DatedEntry[] = [
    heldItem(HELD[0], R, ch, names, fixed).lines,
    ...(second ? [heldItem(second, D, ch, names, fixed).lines] : []),
    ...(B > 0 ? [writeOffItem(ch, names, B, fixed).lines] : []),
    profit ? [dr('revaluation', P), ...sharedLines(names, fixed, 'Cr', P, ch.old)] : [...sharedLines(names, fixed, 'Dr', P, ch.old), cr('revaluation', P)],
    compensation(ch, names, G, fixed),
    ...names.flatMap((name, i) =>
      need[i] === 0 ? [] : [need[i] > 0 ? [dr(other(name), need[i]), cr(partnerCapital(name), need[i])] : [dr(partnerCapital(name), -need[i]), cr(other(name), -need[i])]],
    ),
  ].map((lines) => ({ date, lines }));
  // Another partner's account of the same kind is named in full ("To Asha's Capital A/c"): it is the goodwill that
  // passes between two partners. The result of revaluation says which it is.
  const labelOf = (id: string): string => (id === 'revaluation' ? `Revaluation A/c (${profit ? 'profit' : 'loss'})` : id.startsWith(`${family}:`) ? ledgerLabel(id) : columnLabel(id));
  const ids = names.map((name) => acct(name, fixed));
  const view = columnarAccount(entries, ids, { date, balances: open.map((o) => ({ side: o > 0 ? ('Cr' as const) : ('Dr' as const), amount: rupees(Math.abs(o)) })) }, labelOf);
  const closed = [
    'the General Reserve',
    ...(second ? [second.id === 'profitAndLoss' ? 'the balance of Profit and Loss A/c' : `the ${second.label}`] : []),
    ...(B > 0 ? ['the Goodwill in the books'] : []),
  ];
  const settle = viaBank
    ? "A partner whose capital falls short pays the deficiency into the firm's bank account, and a partner with a surplus is paid it by cheque"
    : "The surplus or deficiency of each partner's capital is transferred to that partner's current account, opened for the purpose";
  // Capitals whose surplus or deficiency goes to current accounts are not called fluctuating: the data says instead
  // that every adjustment for the change is made through the capital accounts.
  const capitalsAre = mode === 'adjusted' && !viaBank ? "Every adjustment for the change is made through the partners' capital accounts." : capitalsLine(fixed);
  const data = [
    `${f.intro} ${f.change} ${capitalsAre}`,
    `Balances in the books on 31 March ${f.year}:`,
    ...(fixed
      ? [`Capital A/cs (fixed): ${eachOf(names, fixedCaps)}`, `Current A/cs: ${listOf(names.map((name, i) => `${name} ${inr(Math.abs(open[i]))} (${open[i] > 0 ? 'Cr' : 'Dr'})`))}`]
      : [`Capital A/cs: ${eachOf(names, open)}`]),
    `General Reserve: ${inr(R)}`,
    ...(second ? [`${second.label}: ${inr(D)}`] : []),
    ...(B > 0 ? [`Goodwill: ${inr(B)}`] : []),
    `On ${date} the partners settle the following:`,
    ...lettered([
      `${listOf(closed)} ${closed.length > 1 ? 'are' : 'is'} closed to the partners' ${family} accounts`,
      `the Revaluation Account prepared on the change shows a ${profit ? 'profit' : 'loss'} of ${inr(P)}`,
      `the goodwill of the firm is valued at ${inr(G)}. No Goodwill A/c is to ${B > 0 ? 'remain in the books' : 'be opened'}: goodwill is adjusted through the partners' ${family} accounts`,
      ...(mode === 'adjusted'
        ? [`after these adjustments the capitals of the partners are to be made proportionate to the new profit-sharing ratio, ${stated ? `the total capital of the firm being fixed at ${inr(sum)}` : 'on the total capital of the firm as it then stands'}. ${settle}`]
        : []),
    ]),
  ].join('\n');
  const shares = (v: number): string => eachOf(names, names.map((_, i) => part(v, ch.old, i)));
  const viaLabel = viaBank ? 'Bank A/c' : 'Current A/c';
  const balanceText = (v: number): string => `${inr(Math.abs(v))}${fixed ? (v >= 0 ? ' (Cr)' : ' (Dr)') : ''}`;
  const closing = mode === 'adjusted' ? target : adjusted;
  const wrong = [
    `Revaluation A/c (${profit ? 'loss' : 'profit'})`,
    ...(B > 0 ? [] : ['Goodwill A/c']),
    ...ch.same.map((i) => ledgerLabel(ids[i])),
    ...(mode === 'adjusted' ? [viaBank ? 'Current A/c' : 'Bank A/c'] : ['Bank A/c', fixed ? 'Capital A/c' : 'Current A/c']),
    'Profit and Loss Appropriation A/c',
    'Drawings A/c',
  ];
  return {
    task:
      mode === 'adjusted'
        ? `Prepare the partners' capital accounts in columns on ${date}, with the adjustments for the change in the profit-sharing ratio and the capitals made proportionate to the new ratio, and carry the balances down.`
        : `Prepare the partners' ${family} accounts in columns on ${date}, with the adjustments for the change in the profit-sharing ratio, and carry the balances down.`,
    data,
    title: `Partners' ${own} Accounts`,
    columns: partnerColumns(names),
    ...withPlainWording(columnarSides(view, { closeOn: date })),
    distractors: [...new Set(wrong)],
    explanation: [
      fixed
        ? `The capitals are fixed, so they are not touched: every adjustment goes through the current accounts, a column for each partner. A credit balance opens on the credit side as "By Balance b/d"${open.some((o) => o < 0) ? ', and a debit balance on the debit side as "To Balance b/d"' : ''}.`
        : 'Each partner has a column. A capital is a credit balance, so the capitals open on the credit side as "By Balance b/d".',
      `General Reserve ${inr(R)}, in the old ratio ${ch.old.join(':')}: ${shares(R)}, credited as "By General Reserve A/c".`,
      ...(second ? [`${second.what}: ${inr(D)} in the old ratio is ${shares(D)}, ${second.credit ? 'credited as "By' : 'debited as "To'} ${columnLabel(second.id)}".`] : []),
      ...(B > 0 ? [`Goodwill in the books, ${inr(B)}, is written off among all the partners in the old ratio: ${shares(B)}, debited as "To Goodwill A/c".`] : []),
      `The ${profit ? 'profit' : 'loss'} on revaluation, ${inr(P)}, in the old ratio: ${shares(P)}, ${profit ? 'credited as "By Revaluation A/c (profit)"' : 'debited as "To Revaluation A/c (loss)"'}; "Revaluation A/c" alone is accepted too.`,
      `${movesText(ch, names).join(' ')} Goodwill ${inr(G)} x the share that moves: ${[...ch.gain, ...ch.sac].map((i) => `${names[i]} ${inr(moved(G, ch, i))}`).join(', ')}.`,
      `A partner who gains is debited with the name of the partner who is compensated ("To ${ledgerLabel(ids[ch.sac[0]])}"), and a partner who sacrifices is credited with the name of the partner who pays ("By ${ledgerLabel(ids[ch.gain[0]])}"). No Goodwill A/c is raised for it.`,
      ...(mode === 'adjusted'
        ? [
            `Capitals after these adjustments: ${eachOf(names, adjusted)}${stated ? `. The total is fixed at ${inr(sum)}` : `, a total of ${inr(sum)}`}. In the new ratio ${ch.neu.join(':')}: ${eachOf(names, target)}.`,
            `${names
              .flatMap((name, i) => (need[i] === 0 ? [] : [need[i] > 0 ? `${name} has a deficiency of ${inr(need[i])}: "By ${viaLabel}".` : `${name} has a surplus of ${inr(-need[i])}: "To ${viaLabel}".`]))
              .join(' ')}${need.some((x) => x === 0) ? ` ${listOf(names.filter((_, i) => need[i] === 0))} already has the right capital.` : ''}`,
          ]
        : []),
      `The balance of each column is carried down as "Balance c/d", on the side that is the shorter: ${listOf(names.map((name, i) => `${name} ${balanceText(closing[i])}`))}.`,
    ],
    hints: [H.capitals[0], mode === 'adjusted' ? H.capitals[1] : 'Reserves, profits and the result of revaluation go to the partners in the old ratio; goodwill x the share that moves is debited to the partner who gains and credited to the partner who sacrifices.'],
  };
}

/**
 * The partners' accounts worked out again from the lines of the data: the opening balances, the balances closed to
 * the partners and the result of revaluation in the old ratio, goodwill by the share each partner gives up, and
 * (where the capitals are brought to the new ratio) each partner's share of the total and what is paid in or out.
 */
const partnerAccountsHold = checked((q: AccountQuestion) => {
  const lines = q.data.split('\n');
  const g = given(lines[0]);
  const fixed = fixedIn(lines[0]);
  const at = lines.findIndex((l) => l.startsWith('On 1 April'));
  const balances = lines.slice(2, at);
  const openLine = balances.find((l) => l.startsWith(fixed ? 'Current A/cs:' : 'Capital A/cs:'))!;
  const open = fixed ? [...openLine.matchAll(/(₹[\d,]+) \((Cr|Dr)\)/g)].map((m) => (m[2] === 'Cr' ? 1 : -1) * amountsIn(m[1])[0]) : amountsIn(openLine);
  const held = heldNet(balances.filter((l) => !l.includes('A/cs')));
  const settled = lines.slice(at + 1);
  const revLine = settled.find((l) => l.includes('Revaluation Account'))!;
  const rev = (revLine.includes('a profit') ? 1 : -1) * amountsIn(revLine)[0];
  const G = amountsIn(settled.find((l) => l.includes('goodwill of the firm is valued'))!)[0];
  const adjusted = g.names.map((_, i) => open[i] + (held + rev) * g.old[i] + G * g.give[i]);
  const last = settled.find((l) => l.includes('new profit-sharing ratio'));
  const sum = last?.includes('fixed at') ? amountsIn(last)[0] : total(adjusted);
  const closing = last ? g.names.map((_, i) => sum * g.neu[i]) : adjusted;
  // A row of a side, by its particulars: its figure in each partner's column, in rupees (nil where there is no such row).
  const row = (side: 0 | 1, pick: (r: { label: string; closing?: boolean }) => boolean): number[] => {
    const found = q.sides[side].rows.find(pick);
    return g.names.map((_, i) => (found ? found.amounts[i] / 100 : 0));
  };
  const carried = [row(0, (r) => r.closing === true), row(1, (r) => r.closing === true)];
  const via = last?.includes('current account') ? 'Current A/c' : 'Bank A/c';
  const paid = last ? [row(0, (r) => r.label === via), row(1, (r) => r.label === via)] : null;
  // The result of revaluation is one row, on the credit side for a profit and on the debit side for a loss, each
  // partner's share of it in the old ratio; it also answers to the plain "Revaluation A/c".
  const revRow = q.sides[rev > 0 ? 1 : 0].rows.filter((r) => r.label === `Revaluation A/c (${rev > 0 ? 'profit' : 'loss'})`);
  if (!plainWordingHolds(q) || revRow.length !== 1 || !g.names.every((_, i) => near(revRow[0].amounts[i] / 100, Math.abs(rev) * g.old[i]))) return false;
  return g.names.every(
    (_, i) =>
      open.length === g.names.length &&
      near(carried[0][i] - carried[1][i], closing[i]) &&
      (paid === null || (near(paid[1][i], Math.max(closing[i] - adjusted[i], 0)) && near(paid[0][i], Math.max(adjusted[i] - closing[i], 0)))),
  );
});

// 3. cpr-fmt-capitals: the partners' capital accounts in columns after the change, capitals fluctuating (medium)
const fmtCapitals = accountTemplate({
  id: 'cpr-fmt-capitals', topicId: T, conceptId: 'cpr-formats', difficulty: 'medium',
  generate: (rng) => partnerAccounts(rng, 'capital'),
  verify: partnerAccountsHold,
});

// 4. cpr-fmt-current-accounts: the same adjustments through the partners' current accounts, capitals fixed; in one
//    seed in three a partner's current account opens with a debit balance (medium)
const fmtCurrentAccounts = accountTemplate({
  id: 'cpr-fmt-current-accounts', topicId: T, conceptId: 'cpr-formats', difficulty: 'medium',
  generate: (rng) => partnerAccounts(rng, 'current'),
  verify: partnerAccountsHold,
});

// 5. cpr-fmt-capitals-adjusted: the capital accounts in columns, and the capitals then brought to the new ratio: on
//    the total as it stands or on a total the partners fix, the difference paid in or out by cheque or carried to
//    current accounts (complex)
const fmtCapitalsAdjusted = accountTemplate({
  id: 'cpr-fmt-capitals-adjusted', topicId: T, conceptId: 'cpr-formats', difficulty: 'complex',
  generate: (rng) => partnerAccounts(rng, 'adjusted'),
  verify: partnerAccountsHold,
});

/** One change in value agreed on a firm's own Balance Sheet figures: its entry, and what it does to the two sides. */
interface SheetItem {
  /** As a clause: "the building is to be appreciated by 10%". */
  text: string;
  dr: string;
  cr: string;
  /** Above zero a gain, below zero a loss. */
  effect: number;
  /** What it adds to the total of the assets side (a provision takes away; a change in a liability adds nothing). */
  assets: number;
  /** The working, and how the item then stands in the Balance Sheet. */
  work: string;
}
/** What a Balance Sheet after a change was made from, for `verify`: the changes in value, and the total before them. */
const sheetKept = keepFor<{ effects: number[]; assets: number; before: number }>();
/** What an account is called as a line of a firm's Balance Sheet. */
const SHEET_LABEL: Record<string, string> = {
  creditors: 'Creditors', outstandingExpenses: 'Outstanding Expenses', building: 'Building', land: 'Land', machinery: 'Machinery', furniture: 'Furniture',
  investments: 'Investments', stock: 'Stock', debtors: 'Debtors', bank: 'Cash at Bank', goodwill: 'Goodwill', generalReserve: 'General Reserve',
};

// 6. cpr-fmt-balance-sheet: the Balance Sheet of the firm after the change, from the Balance Sheet before it and the
//    matters settled: the reserve and a second balance closed, three or four changes in value worked from the
//    Balance Sheet figures, goodwill in the books written off in some seeds and goodwill adjusted. Every matter is
//    posted as an entry to the balances of the old Balance Sheet, and the new one is read off the ledger (complex)
// The same Balance Sheet with fixed capitals (cpr-fmt-balance-sheet-fixed, added after the audit) comes from the same
// function with `fixed`: every partner's funds are then a fixed capital and a current account, every matter goes
// through the current accounts, and a current account left with a debit balance is shown among the assets. With
// `fixed` false nothing is drawn or written otherwise, so cpr-fmt-balance-sheet makes what it always made.
function balanceSheetAfter(rng: Rng, fixed: boolean): AccountParts | null {
    const ch = anyChange(rng, true);
    const f = firmOf(rng, ch.old, ch.neu);
    const names = f.names;
    const taken: number[] = [];
    const fresh = (min: number, max: number): number | null => {
      const v = pickAmount(rng, min, max, (x) => fairIn(x, ch.old) && !taken.includes(x) && (x < 100000 || x % 5000 === 0));
      if (v !== null) taken.push(v);
      return v;
    };
    // The Balance Sheet before the change. The capitals are what is left of the assets, so the two sides agree.
    const R = fresh(40000, 300000);
    const second = rng.pick([HELD[1], HELD[2], rng.pick(FICTITIOUS), null]);
    const D = second ? fresh(20000, 90000) : 0;
    const B = rng.int(0, 2) === 0 ? fresh(20000, 120000) : 0;
    if (R === null || D === null || B === null) return null;
    const G = pickAmount(rng, B + 40000, 600000, (v) => fairMove(v, ch));
    if (G === null) return null;
    const [fixedA, fixedB] = [rng.pick(['building', 'land']), rng.pick(['machinery', 'furniture'])];
    const held = {
      [fixedA]: rng.step(300000, 900000, 50000),
      [fixedB]: rng.step(150000, fixedB === 'furniture' ? 300000 : 500000, 10000), // furniture is not worth more than the premises
      investments: rng.int(0, 1) === 0 ? rng.step(80000, 300000, 10000) : 0,
      stock: rng.step(100000, 400000, 10000),
      debtors: rng.step(100000, 400000, 20000),
    };
    const creditors = rng.step(80000, 300000, 10000);
    const lost = second && !second.credit ? D : 0; // a debit balance of Profit and Loss A/c or a fictitious asset, on the assets side
    const undistributed = second?.credit ? D : 0;
    // The bank balance is rounded up so that the capitals come to a whole ten thousand.
    const rest = total(Object.values(held)) + B + lost - creditors - R - undistributed;
    const base = rng.step(40000, 150000, 5000);
    const bank = base + ((10000 - ((((rest + base) % 10000) + 10000) % 10000)) % 10000);
    const capital = rest + bank;
    const before = capital + creditors + R + undistributed;
    if (capital < 0.4 * before) return null;
    const caps = capitalsOf(rng, names.length, capital);
    if (!caps) return null;
    // With fixed capitals each partner's funds are a fixed capital in whole ₹50,000 and the rest in the current account.
    const fixedCaps = caps.map((c) => (fixed ? Math.floor((c * 0.9) / 50000) * 50000 : c));
    const currents = caps.map((c, i) => c - fixedCaps[i]);
    if (fixed && fixedCaps.some((c) => c <= 0)) return null;

    // Three or four changes in value. The amount of the last is chosen so that the profit or loss on revaluation
    // gives every partner a fair amount.
    const fair = (net: number): boolean => fairIn(net, ch.old);
    // That one is the creditors written back or an outstanding expense, which a paper gives in any whole thousand; the
    // stock and the investments are revalued in steps of ₹5,000, so that neither is "valued at ₹2,47,000".
    const [fitted, other] = rng.shuffle(['creditors', 'outstanding']);
    const kinds = [...rng.shuffle(['up', 'down', 'provision', 'stock', other, ...(held.investments > 0 ? ['investments'] : [])]).slice(0, rng.int(2, 3)), fitted];
    const items: SheetItem[] = [];
    for (const [t, kind] of kinds.entries()) {
      const sofar = total(items.map((it) => it.effect));
      const lastOne = t === kinds.length - 1;
      // The amount of a change that is given as an amount: drawn, or (for the last) chosen to make the result fair.
      const amountOf = (min: number, max: number, step: number, sign: 1 | -1): number | null => (lastOne ? pickAmount(rng, min, max, (v) => fair(sofar + sign * v)) : rng.step(min, max, step));
      if (kind === 'up') {
        const p = rng.pick([10, 20]);
        const byRate = rng.int(0, 1) === 0;
        const x = byRate ? (held[fixedA] * p) / 100 : rng.step(20000, 100000, 10000);
        const now = held[fixedA] + x;
        items.push({
          text: byRate ? `the ${fixedA} is to be appreciated by ${p}%` : `the ${fixedA} is to be revalued at ${inr(now)}`,
          dr: fixedA, cr: 'revaluation', effect: x, assets: x,
          work: `${upper(fixedA)}: ${byRate ? `${p}% of ${inr(held[fixedA])}` : `${inr(now)} - ${inr(held[fixedA])}`} = ${inr(x)}, a gain; it is shown at ${inr(now)}.`,
        });
      } else if (kind === 'down') {
        const p = rng.pick([5, 10, 20]);
        const byRate = rng.int(0, 1) === 0;
        const x = byRate ? (held[fixedB] * p) / 100 : rng.step(10000, 60000, 5000);
        const now = held[fixedB] - x;
        items.push({
          text: byRate ? `the ${fixedB} is to be depreciated by ${p}%` : `the ${fixedB} is to be valued at ${inr(now)}`,
          dr: 'revaluation', cr: fixedB, effect: -x, assets: -x,
          work: `${upper(fixedB)}: ${byRate ? `${p}% of ${inr(held[fixedB])}` : `${inr(held[fixedB])} - ${inr(now)}`} = ${inr(x)}, a loss; it is shown at ${inr(now)}.`,
        });
      } else if (kind === 'provision') {
        const p = rng.pick([5, 10]);
        const x = (held.debtors * p) / 100;
        items.push({
          text: `a provision of ${p}% for doubtful debts is to be created on the debtors`,
          dr: 'revaluation', cr: 'provisionForDoubtfulDebts', effect: -x, assets: -x,
          work: `Provision for doubtful debts: ${p}% of ${inr(held.debtors)} = ${inr(x)}, a loss; the debtors are shown at ${inr(held.debtors)} - ${inr(x)} = ${inr(held.debtors - x)}.`,
        });
      } else if (kind === 'stock') {
        const x = amountOf(5000, 30000, 5000, -1);
        if (x === null) return null;
        items.push({
          text: `the stock is to be valued at ${inr(held.stock - x)}`,
          dr: 'revaluation', cr: 'stock', effect: -x, assets: -x,
          work: `Stock: ${inr(held.stock)} - ${inr(held.stock - x)} = ${inr(x)}, a loss; it is shown at ${inr(held.stock - x)}.`,
        });
      } else if (kind === 'investments') {
        const sign = rng.pick([1, -1] as const);
        const x = amountOf(10000, 40000, 5000, sign);
        if (x === null) return null;
        const now = held.investments + sign * x;
        items.push({
          text: `the investments are to be shown at their market value of ${inr(now)}`,
          dr: sign > 0 ? 'investments' : 'revaluation', cr: sign > 0 ? 'revaluation' : 'investments', effect: sign * x, assets: sign * x,
          work: `Investments: ${sign > 0 ? `${inr(now)} - ${inr(held.investments)}` : `${inr(held.investments)} - ${inr(now)}`} = ${inr(x)}, a ${sign > 0 ? 'gain' : 'loss'}; they are shown at ${inr(now)}.`,
        });
      } else if (kind === 'creditors') {
        const x = amountOf(5000, 20000, 5000, 1);
        if (x === null) return null;
        items.push({
          text: `the creditors include ${inr(x)} that is no longer payable and is to be written back`,
          dr: 'creditors', cr: 'revaluation', effect: x, assets: 0,
          work: `Creditors written back: ${inr(x)}, a gain; the creditors are shown at ${inr(creditors)} - ${inr(x)} = ${inr(creditors - x)}.`,
        });
      } else {
        const x = amountOf(4000, 20000, 2000, -1);
        if (x === null) return null;
        items.push({
          text: `expenses of ${inr(x)} are outstanding and are to be provided for`,
          dr: 'revaluation', cr: 'outstandingExpenses', effect: -x, assets: 0,
          work: `Outstanding expenses: ${inr(x)}, a loss; they are a new liability of ${inr(x)}.`,
        });
      }
    }
    const rev = total(items.map((it) => it.effect));
    if (!fair(rev)) return null;

    // Every matter as an entry, posted to the balances of the old Balance Sheet.
    const balances: [string, number][] = [
      ...Object.entries(held).filter(([, v]) => v > 0),
      ['bank', bank],
      ...(B > 0 ? [['goodwill', B] as [string, number]] : []),
      ...(second ? [[second.id, second.credit ? -D : D] as [string, number]] : []),
      ['creditors', -creditors],
      ['generalReserve', -R],
      ...names.map((name, i): [string, number] => [partnerCapital(name), -fixedCaps[i]]),
      ...(fixed ? names.map((name, i): [string, number] => [partnerCurrent(name), -currents[i]]) : []),
    ];
    const opening: Ledger = new Map(balances.map(([id, v]): [string, number] => [id, rupees(v)]));
    const ledger = post(
      [
        heldItem(HELD[0], R, ch, names, fixed).lines,
        ...(second ? [heldItem(second, D, ch, names, fixed).lines] : []),
        ...(B > 0 ? [writeOffItem(ch, names, B, fixed).lines] : []),
        ...items.map((it) => [dr(it.dr, Math.abs(it.effect)), cr(it.cr, Math.abs(it.effect))]),
        rev > 0 ? [dr('revaluation', rev), ...sharedLines(names, fixed, 'Cr', rev, ch.old)] : [...sharedLines(names, fixed, 'Dr', -rev, ch.old), cr('revaluation', -rev)],
        compensation(ch, names, G, fixed),
      ],
      opening,
    );
    // The new Balance Sheet is read off the ledger: a credit balance is a liability or a capital, a debit balance an asset.
    const balance = (id: string): number => {
      const b = balanceOf(ledger, id);
      return b ? (b.side === 'Dr' ? b.amount : -b.amount) / 100 : 0;
    };
    const provision = -balance('provisionForDoubtfulDebts');
    // Both sides stand in the order of permanence, as in the Balance Sheet the data gives: the capitals first and the
    // creditors last, the fixed assets first and the bank last.
    // A current account in credit stands after the capitals; one in debit is shown last among the assets.
    const currentIds = fixed ? names.map(partnerCurrent) : [];
    // A current account closed off at nil would be a row that is not there: such a seed is drawn again.
    if (currentIds.some((id) => balance(id) === 0)) return null;
    const liabilityIds = [...names.map(partnerCapital), ...currentIds.filter((id) => balance(id) < 0), 'creditors', 'outstandingExpenses'];
    const assetIds = [fixedA, fixedB, 'investments', 'stock', 'debtors', 'bank', ...currentIds.filter((id) => balance(id) > 0)];
    const shown = new Set([...liabilityIds, ...assetIds, ...currentIds, 'provisionForDoubtfulDebts']);
    // Nothing else may be left in the books: the reserve, the goodwill and Revaluation A/c are all closed.
    if ([...ledger.keys()].some((id) => !shown.has(id) && balance(id) !== 0)) return null;
    const nameOf = (id: string): string => (id.startsWith('capital:') || id.startsWith('current:') ? ledgerLabel(id) : SHEET_LABEL[id]);
    const liabilities: FormatRowParts[] = liabilityIds.filter((id) => balance(id) !== 0).map((id) => ({ label: nameOf(id), amount: rupees(-balance(id)) }));
    const assets: FormatRowParts[] = assetIds
      .filter((id) => balance(id) !== 0)
      .map((id) =>
        id === 'debtors' && provision > 0
          ? { label: 'Debtors', amount: rupees(balance(id) - provision), details: [`Debtors ${inr(balance(id))}`, `Less: Provision for doubtful debts ${inr(provision)}`] }
          : { label: nameOf(id), amount: rupees(balance(id)) },
      );
    if (liabilities.some((r) => (r.amount ?? 0) <= 0) || assets.some((r) => (r.amount ?? 0) <= 0)) return null;
    const date = `1 April ${f.year}`;
    const closed = [
      'the General Reserve',
      ...(second ? [second.id === 'profitAndLoss' ? 'the balance of Profit and Loss A/c' : `the ${second.label}`] : []),
      ...(B > 0 ? ['the Goodwill in the books'] : []),
    ];
    const data = [
      fixed ? `${f.intro} ${f.change} The capitals are fixed: every adjustment goes through the partners' current accounts.` : `${f.intro} ${f.change} The capitals are fluctuating.`,
      `Their Balance Sheet as at 31 March ${f.year} shows these liabilities:`,
      ...(fixed ? [`Capital A/cs (fixed): ${eachOf(names, fixedCaps)}`, `Current A/cs: ${eachOf(names, currents)}`] : [`Capital A/cs: ${eachOf(names, caps)}`]),
      `General Reserve: ${inr(R)}`,
      ...(second?.credit ? [`${second.label}: ${inr(D)}`] : []),
      `Creditors: ${inr(creditors)}`,
      'and these assets:',
      ...(B > 0 ? [`Goodwill: ${inr(B)}`] : []),
      ...[fixedA, fixedB, 'investments', 'stock', 'debtors'].filter((id) => held[id] > 0).map((id) => `${SHEET_LABEL[id]}: ${inr(held[id])}`),
      `Cash at Bank: ${inr(bank)}`,
      ...(second && !second.credit ? [`${second.label}: ${inr(D)}`] : []),
      `Each side totals ${inr(before)}.`,
      `On ${date} the partners settle the following:`,
      ...lettered([
        `${listOf(closed)} ${closed.length > 1 ? 'are' : 'is'} closed to the partners' ${fixed ? 'current' : 'capital'} accounts`,
        ...items.map((it) => it.text),
        `the goodwill of the firm is valued at ${inr(G)}. No Goodwill A/c is to ${B > 0 ? 'remain in the books' : 'be opened'}: goodwill is adjusted through the partners' ${fixed ? 'current' : 'capital'} accounts`,
      ]),
    ].join('\n');
    sheetKept.keep(data, { effects: items.map((it) => it.effect), assets: total(items.map((it) => it.assets)), before });
    const gains = items.filter((it) => it.effect > 0).map((it) => it.effect);
    const losses = items.filter((it) => it.effect < 0).map((it) => -it.effect);
    const signedInr = (v: number): string => `${v > 0 ? '+' : '-'} ${inr(Math.abs(v))}`;
    const pool = R + (second ? (second.credit ? D : -D) : 0) - B;
    const after = names.map((_, i) => caps[i] + ((pool + rev) * ch.old[i]) / ch.so + (G * ch.d[i]) / ch.L);
    const sideTotal = total(assets.map((r) => r.amount ?? 0)) / 100;
    return {
      task: `Prepare the Balance Sheet of the firm as at ${date}, after the change in the profit-sharing ratio, with the debtors shown net of any provision for doubtful debts${fixed ? ' and each current account on the side its balance belongs to' : ''}.`,
      data,
      title: `Balance Sheet as at ${date}`,
      left: { title: 'Liabilities', rows: liabilities },
      right: { title: 'Assets', rows: assets },
      // What is closed on the change and so is not in the new Balance Sheet, the account the changes pass through, and
      // the provision, which is deducted from the debtors and is not a row of its own.
      distractors: ['General Reserve', 'Goodwill', 'Revaluation A/c', 'Provision for Doubtful Debts', 'Profit and Loss A/c', 'Advertisement Suspense A/c'],
      explanation: [
        `(a) ${upper(listOf(closed))} ${closed.length > 1 ? 'are' : 'is'} closed to the partners in the old ratio ${ch.old.join(':')}: ${[`General Reserve ${inr(R)}`, ...(second ? [`${second.credit ? '+' : '-'} ${second.label} ${inr(D)}`] : []), ...(B > 0 ? [`- Goodwill ${inr(B)}`] : [])].join(' ')}${closed.length > 1 ? ` = a net ${pool >= 0 ? 'credit' : 'debit'} of ${inr(Math.abs(pool))}` : ', a credit'}. ${closed.length > 1 ? 'None of them is' : 'It is not'} in the new Balance Sheet.`,
        ...items.map((it, t) => `(${'abcdefgh'[t + 1]}) ${it.work}`),
        `Revaluation A/c: gains ${addedUp(gains)}, losses ${addedUp(losses)}: a ${rev > 0 ? 'profit' : 'loss'} of ${inr(Math.abs(rev))}, shared in the old ratio: ${eachOf(names, names.map((_, i) => part(Math.abs(rev), ch.old, i)))}.`,
        `${movesText(ch, names).join(' ')} Goodwill ${inr(G)} x the share that moves: ${[...ch.gain, ...ch.sac].map((i) => `${names[i]} ${inr(moved(G, ch, i))} ${ch.d[i] < 0 ? 'debited' : 'credited'}`).join(', ')}. It only moves capital between the partners: no Goodwill A/c is shown.`,
        ...names.map((name, i) =>
          fixed
            ? `${name}'s current account = ${inr(currents[i])} ${signedInr((pool * ch.old[i]) / ch.so)} (balances closed) ${signedInr((rev * ch.old[i]) / ch.so)} (revaluation)${ch.d[i] === 0 ? '' : ` ${signedInr((G * ch.d[i]) / ch.L)} (goodwill)`} = ${after[i] - fixedCaps[i] >= 0 ? `${inr(after[i] - fixedCaps[i])} (Cr), a liability` : `${inr(fixedCaps[i] - after[i])} (Dr), shown among the assets`}; the fixed capital stays at ${inr(fixedCaps[i])}.`
            : `${name}'s capital = ${inr(caps[i])} ${signedInr((pool * ch.old[i]) / ch.so)} (balances closed) ${signedInr((rev * ch.old[i]) / ch.so)} (revaluation)${ch.d[i] === 0 ? '' : ` ${signedInr((G * ch.d[i]) / ch.L)} (goodwill)`} = ${inr(after[i])}.`,
        ),
        `Liabilities: ${liabilities.map((r) => inr((r.amount ?? 0) / 100)).join(' + ')}. Assets: ${assets.map((r) => inr((r.amount ?? 0) / 100)).join(' + ')}. Both sides total ${inr(sideTotal)}.`,
      ],
      hints: fixed
        ? [
            'Prepare Revaluation A/c and the current accounts as working first: the fixed capitals do not move, and every matter is settled through the current accounts.',
            'A current account left in credit is a liability; one left in debit is shown among the assets. The reserve, the accumulated profit or loss and goodwill are not rows.',
          ]
        : [
            'Prepare Revaluation A/c and the capital accounts as working first; the new Balance Sheet takes each asset and liability at its revised figure and each capital at its new balance.',
            'The reserve, the accumulated profit or loss and goodwill are closed to the capitals, so none of them is a row; a provision for doubtful debts is deducted from the debtors.',
          ],
    };
}
// Worked out again without the ledger: each capital (with fixed capitals, each current account) from the balances in
// the data and the kept changes in value, with plain fractions, and the total of the assets from the total before the change.
const balanceSheetHolds = checked((q: AccountQuestion) => {
    const kept = sheetKept.of(q.data);
    if (!kept) return false;
    const lines = q.data.split('\n');
    const g = given(lines[0]);
    const at = lines.findIndex((l) => l.startsWith('On 1 April'));
    const sheet = lines.slice(2, at);
    const caps = amountsIn(sheet.find((l) => l.startsWith('Capital A/cs'))!);
    const currentLine = sheet.find((l) => l.startsWith('Current A/cs:'));
    const closedLines = sheet.filter((l) => /^(General Reserve|Profit and Loss A\/c|Goodwill|Advertisement Suspense|Deferred Revenue Expenditure)/.test(l));
    const pool = heldNet(closedLines);
    // What leaves the assets side when the balances are closed: goodwill, a fictitious asset, a debit balance of Profit and Loss A/c.
    const written = total(closedLines.filter((l) => !isCreditBalance(l)).map((l) => amountsIn(l)[0]));
    const G = amountsIn(lines.slice(at + 1).find((l) => l.includes('goodwill of the firm is valued'))!)[0];
    const rev = total(kept.effects);
    const sum = (side: 0 | 1): number => total(q.sides[side].rows.map((r) => r.amounts[0])) / 100;
    const shownAt = (side: 0 | 1, label: string): number | undefined => {
      const row = q.sides[side].rows.find((r) => r.label === label);
      return row === undefined ? undefined : row.amounts[0] / 100;
    };
    if (currentLine) {
      // A debit balance of a current account stands among the assets: the two sides then still agree.
      const currents = amountsIn(currentLine);
      const debits = total(g.names.map((name) => shownAt(1, `${name}'s Current A/c`) ?? 0));
      return (
        sum(1) - debits === kept.before - written + kept.assets &&
        sum(0) === sum(1) &&
        g.names.every((name, i) => {
          const want = currents[i] + (pool + rev) * g.old[i] + G * g.give[i];
          return shownAt(0, `${name}'s Capital A/c`) === caps[i] && near(want >= 0 ? (shownAt(0, `${name}'s Current A/c`) ?? NaN) : -(shownAt(1, `${name}'s Current A/c`) ?? NaN), want);
        })
      );
    }
    return (
      amountsIn(sheet.find((l) => l.startsWith('Each side totals'))!)[0] === kept.before &&
      sum(1) === kept.before - written + kept.assets &&
      sum(0) === sum(1) &&
      g.names.every((name, i) => {
        const row = q.sides[0].rows.find((r) => r.label === `${name}'s Capital A/c`);
        return row !== undefined && near(row.amounts[0] / 100, caps[i] + (pool + rev) * g.old[i] + G * g.give[i]);
      })
    );
});

const fmtBalanceSheet = accountTemplate({
  id: 'cpr-fmt-balance-sheet', topicId: T, conceptId: 'cpr-formats', difficulty: 'complex',
  generate: (rng) => balanceSheetAfter(rng, false),
  verify: balanceSheetHolds,
});

// cpr-fmt-balance-sheet-fixed (added after the audit): the same Balance Sheet when the capitals are fixed (complex)
const fmtBalanceSheetFixed = accountTemplate({
  id: 'cpr-fmt-balance-sheet-fixed', topicId: T, conceptId: 'cpr-formats', difficulty: 'complex',
  generate: (rng) => balanceSheetAfter(rng, true),
  verify: balanceSheetHolds,
});

const formatTemplates: Template[] = [fmtRevaluationDirect, fmtRevaluation, fmtCapitals, fmtCurrentAccounts, fmtCapitalsAdjusted, fmtBalanceSheet];
const formatTemplatesAdded: Template[] = [fmtBalanceSheetFixed];

// One-mark Assertion-Reason questions of the board. They stand on their own level and go into no mock paper and no
// Look back (`isAssertionReason`), so nothing that was served before moves.
const cprAssertionReason = factsTemplate({
  id: 'cpr-assertion-reason', topicId: 'change-in-profit-sharing-ratio', conceptId: 'cpr-ratio', difficulty: 'medium',
  facts: assertionReasonFacts([
    {
      answer: 'both',
      assertion: 'A profit on the revaluation of assets on a change in the ratio is shared by the partners in the old ratio.',
      reason: 'The rise in value came about while the old ratio was in force.',
      a: 'Revaluation A/c is closed to the partners in the old ratio.',
      r: 'The values are brought up to date as at the date of the change, for the time before it.',
      link: 'R explains A: a gain of the time of the old ratio belongs to the partners in that ratio.',
    },
    {
      answer: 'both',
      assertion: 'A partner who gains a share on a change in the ratio compensates the partner who sacrifices.',
      reason: 'The gaining partner will now receive a part of the future profits that used to go to the sacrificing partner.',
      a: 'The gaining partner pays goodwill of the firm × share gained.',
      r: 'What one partner gains in the ratio, another gives up.',
      link: 'R explains A: the payment is the price of that part of the future profits.',
    },
    {
      answer: 'both',
      assertion: 'Aman and Bina share profits 3:2 and now agree to share equally. Bina is the gaining partner.',
      reason: 'A partner whose new share is larger than the old share has gained.',
      a: "Bina's share rises from 2/5 to 1/2, a gain of 1/10.",
      r: 'Share gained = new share - old share.',
      link: "R explains A: Bina's new share of 1/2 is larger than the old share of 2/5.",
    },
    {
      answer: 'both',
      assertion: 'The total of the shares sacrificed on a change in the ratio equals the total of the shares gained.',
      reason: 'The shares of the partners add up to one whole both before and after the change.',
      a: 'This equality is the check on any sacrifice and gain working.',
      r: 'A change in the ratio only moves shares among the same partners.',
      link: 'R explains A: when the whole stays the same, what some partners give up is what the others receive.',
    },
    {
      answer: 'both',
      assertion: 'Advertisement Suspense in the Balance Sheet on a change in the ratio is debited to the partners in the old ratio.',
      reason: 'A fictitious asset is a past expense carried forward, from the time of the old ratio.',
      a: "It is written off: Partners' Capital A/cs Dr; To Advertisement Suspense A/c, in the old ratio.",
      r: 'It has no value to realise and stands for money spent before the change.',
      link: 'R explains A: an expense of the time of the old ratio falls on the partners in that ratio.',
    },
    {
      answer: 'bothNot',
      assertion: 'A change in the profit-sharing ratio reconstitutes the firm.',
      reason: 'Assets and liabilities are usually revalued on a change in the ratio.',
      a: 'The old agreement ends and a new one begins, though the firm goes on.',
      r: 'Revaluation is one of the adjustments made on a change in the ratio.',
      link: 'R does not explain A: reconstitution comes from the new agreement. Revaluation is a result of it, not its cause.',
    },
    {
      answer: 'bothNot',
      assertion: 'Goodwill appearing in the Balance Sheet is written off among all the partners in the old ratio on a change in the ratio.',
      reason: "A loss on revaluation is debited to the partners' capital accounts on a change in the ratio.",
      a: 'Goodwill already in the books is removed first, in the old ratio.',
      r: "Partners' Capital A/cs Dr; To Revaluation A/c.",
      link: 'R does not explain A: the two are separate adjustments, and a loss on revaluation does not say why goodwill is written off.',
    },
    {
      answer: 'bothNot',
      assertion: 'Workmen Compensation Reserve is ₹50,000 and the claim is ₹20,000. On a change in the ratio, ₹30,000 is credited to the partners in the old ratio.',
      reason: 'An Investment Fluctuation Reserve is first used to meet a fall in the market value of the investments.',
      a: 'The claim is met from the reserve, and the rest, ₹50,000 - ₹20,000 = ₹30,000, goes to the partners.',
      r: 'Only what is left of that reserve after the fall goes to the partners.',
      link: 'R does not explain A: R is the rule for a different reserve, so it does not say why this claim is met first.',
    },
    {
      answer: 'aOnly',
      assertion: 'Investment Fluctuation Reserve is ₹40,000 and the market value of the investments falls by ₹55,000. Revaluation A/c is debited with ₹15,000.',
      reason: 'A fall in the value of investments is debited in full to Revaluation A/c, and the reserve goes to the partners.',
      a: 'The reserve meets the fall as far as it goes, and only the excess, ₹15,000, is a loss on revaluation.',
      r: 'The fall is first set against the reserve; it is not debited in full.',
    },
    {
      answer: 'aOnly',
      assertion: 'Ravi and Sona change their ratio from 3:2 to 1:1 and leave a General Reserve of ₹1,00,000 in the books. Sona is debited and Ravi credited with ₹10,000.',
      reason: "The amount of this entry is the reserve multiplied by the gaining partner's new share.",
      a: 'Sona gains 1/2 - 2/5 = 1/10 and ₹1,00,000 × 1/10 = ₹10,000.',
      r: "The amount is the reserve multiplied by the share gained, not by the gaining partner's new share.",
    },
    {
      answer: 'rOnly',
      assertion: 'On a change in the ratio, a debit balance of Profit and Loss A/c is shared by the partners in the new ratio.',
      reason: 'A debit balance of Profit and Loss A/c is a loss of the past.',
      a: 'It is debited to the partners in the old ratio.',
      r: 'It was suffered before the change, while the old ratio was in force.',
    },
    {
      answer: 'rOnly',
      assertion: 'Rita and Sanjay change their ratio from 5:3 to 3:5, and the goodwill of the firm is ₹80,000. Sanjay compensates Rita with ₹10,000.',
      reason: 'The amount adjusted is the goodwill of the firm multiplied by the share gained.',
      a: 'Sanjay gains 5/8 - 3/8 = 2/8, so the amount is ₹80,000 × 2/8 = ₹20,000.',
      r: 'Goodwill of the firm × share gained is the rule.',
    },
  ]),
});

const templates: Template[] = [...ratioTemplates, ...goodwillTemplates, ...reserveTemplates, ...revaluationTemplates, ...singleTemplates, ...capitalTemplates, ...setTemplates, ...formatTemplates, cprAssertionReason, gwSuperProfit, ...formatTemplatesAdded];

export default templates;
