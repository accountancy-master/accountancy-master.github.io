/**
 * Integrated case studies of the stage "The life of a firm" (Class 12): one firm followed through several events of
 * the six partnership topics (the year's appropriations, goodwill, a change of ratio, an admission, a retirement or a
 * death, and the dissolution), so that a student practises them together, as the examination and real books do.
 * Every case draws on at least three of those topics; short-part cases come first, then the chained cases.
 *
 * The cases are made from the examined code of the topics and stages, with their conventions and wording:
 *  - the year of a firm and its Profit and Loss Appropriation Account (`PF_CASE` of `templates/partnership-fundamentals.ts`);
 *  - the deals of an admission, its sacrifice and premium (`templates/admission-of-a-partner.ts`);
 *  - the changes of ratio and the entry that compensates for them (`templates/change-in-profit-sharing-ratio.ts`);
 *  - the firm of a retirement or a death, its gaining ratio, its steps and its revaluation changes
 *    (`templates/retirement-and-death-of-a-partner.ts`);
 *  - a whole dissolution, its accounts, wrong labels, working and checks (`templates/dissolution-of-partnership.ts`).
 *
 * Conventions, each stated in the case text that relies on it:
 *  - the firm closes its books on 31 March; capitals are said to be fixed or fluctuating in every case;
 *  - goodwill follows AS 26: no Goodwill A/c is raised; a premium is shared by the sacrificing partners in the
 *    sacrificing ratio; on a retirement or a death the partners who gain compensate the partner who leaves; profits
 *    used to value goodwill are the net profits as per Profit and Loss A/c, before any appropriation;
 *  - a reserve that is distributed is distributed "the whole of" it, in the ratio of the partners who earned it;
 *  - in a Revaluation A/c the result is "To Profit transferred to Asha's Capital A/c" / "By Loss transferred to Asha's
 *    Capital A/c" ("Asha's Capital A/c" accepted); in the capital accounts it is "By Revaluation A/c (profit)" /
 *    "To Revaluation A/c (loss)" ("Revaluation A/c" accepted);
 *  - interest on a partner's loan is a charge (6% p.a. when nothing is agreed); interest on capital, salary and
 *    commission are appropriations;
 *  - dissolution: no insolvency, no piecemeal distribution; an asset about which nothing is said realises its book
 *    value if tangible and nothing if intangible; a partner's loan is repaid after the outside liabilities and before
 *    the capitals; who bears and pays the realisation expenses is always said.
 *
 * Every part has a `verify` that works its answer out again another way: from the printed case text where the figures
 * can be read back, otherwise from the kept scenario by the ledger where the part used arithmetic (or the reverse).
 */
import type { AccountQuestion, JournalQuestion, McqQuestion, NumericQuestion, RatioQuestion } from '@/content/types';
import { executor, partnerCapital, partnerCurrent, partnerDrawings, partnerLoan } from '@/engine/accounts';
import { accountOf, columnLabel, columnarAccount, ledgerLabel, post, type DatedEntry } from '@/engine/books';
import type { JournalLine } from '@/engine/journal';
import type { Rng } from '@/engine/rng';
import { caseTemplate, columnarSides, formatINR, keepFor, ledgerPeriods, ledgerSides, lowestTerms, partnerColumns, rupees } from '../authoring';
import * as ADM from '../templates/admission-of-a-partner';
import * as CPR from '../templates/change-in-profit-sharing-ratio';
import * as DIS from '../templates/dissolution-of-partnership';

import { PF_CASE as P, type PfPartnersYear } from '../templates/partnership-fundamentals';
import * as RET from '../templates/retirement-and-death-of-a-partner';
import { believable } from './partnership-accounts';
import { revaluationSides } from './reconstitution';

import type { CaseTemplate, FormatRowParts, McqParts, NumericParts, RatioParts } from '../types';

const TOPIC = 'dissolution-of-partnership';
const CONCEPT = 'dis-integrated';

// ===============================================================================================================
// Small helpers
// ===============================================================================================================

/** Whole rupees as the amount text a learner sees. */
const inr = (n: number): string => formatINR(rupees(n));
const dr = (accountId: string, n: number): JournalLine => ({ accountId, side: 'Dr', amount: rupees(n) });
const cr = (accountId: string, n: number): JournalLine => ({ accountId, side: 'Cr', amount: rupees(n) });
const sum = RET.sum;
const near = RET.near;
/** "Asha", "Asha and Bhavna", "Asha, Bhavna and Chetan". */
const list = (xs: readonly string[]): string => (xs.length <= 1 ? xs.join('') : RET.list(xs));
const rt = (r: readonly number[]): string => r.join(':');
/** "equally" or "in the ratio 3:2". */
const inRatio = (r: readonly number[]): string => (r.every((x) => x === r[0]) ? 'equally' : `in the ratio ${rt(r)}`);
const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b;
/** A fraction in lowest terms, "3/10". */
const fr = RET.fr;
const optionText = (q: McqQuestion): string => q.options.find((o) => o.id === q.correct)?.text ?? '';
const amountsIn = RET.amountsIn;

type Errs = [number, string][];
/** A numeric part in whole rupees: wrong figures that are not whole, or repeat, are dropped; null when fewer than two remain. */
function num(prompt: string, answer: number, errs: Errs, explanation: string[], hints?: string[]): NumericParts | null {
  const n = RET.numeric(answer, errs);
  return n && { prompt, ...n, explanation, ...(hints ? { hints } : {}) };
}
/** A ratio part: every ratio reduced to lowest terms; null when fewer than two distinct wrong ratios remain. */
function ratioQ(prompt: string, answer: number[], errs: [number[] | null, string][], explanation: string[], hints?: string[]): RatioParts | null {
  const r = RET.ratioParts(answer, errs.filter((e): e is [number[], string] => e[0] !== null));
  return r && { prompt, ...r, explanation, ...(hints ? { hints } : {}) };
}
const choice = (prompt: string, correct: string, wrong: [string, string][], explanation: string, hints?: string[]): McqParts | null =>
  RET.choice(prompt, correct, wrong, explanation, hints);

/** The line of a case text that starts with `start` (or matches it), or ''. */
const lineOf = (text: string, start: string | RegExp): string =>
  text.split('\n').find((l) => (typeof start === 'string' ? l.startsWith(start) : start.test(l))) ?? '';
/** The first amount on the line that starts with `start`; NaN when there is none, which fails any check. */
const figure = (text: string, start: string | RegExp): number => amountsIn(lineOf(text, start))[0] ?? NaN;
/** The amount printed after a partner's name on a line ("Aarav ₹3,00,000, Bhavna ₹2,00,000"); NaN when absent. */
const amountOf = (line: string, name: string): number => {
  const m = new RegExp(`\\b${name} (₹[\\d,]+)`).exec(line);
  return m ? amountsIn(m[1])[0] : NaN;
};
/** "Aarav ₹3,00,000, Bhavna ₹2,00,000". */
const each = (names: readonly string[], xs: readonly number[]): string => names.map((nm, j) => `${nm} ${inr(xs[j])}`).join(', ');
/** "Aarav ₹3,00,000 and Bhavna ₹2,00,000", leaving out partners with nothing. */
const eachAnd = (names: readonly string[], xs: readonly number[]): string => list(names.flatMap((nm, j) => (xs[j] !== 0 ? [`${nm} ${inr(Math.abs(xs[j]))}`] : []))) || 'nobody';
/** The amounts of an entry on one side, by account, in rupees. */
const posted = (q: JournalQuestion, accountId: string, side: 'Dr' | 'Cr'): number =>
  sum(q.expected.filter((l) => l.accountId === accountId && l.side === side).map((l) => l.amount)) / 100;
/** The ratio a phrase gives: "equally" among `n`, or "in the ratio 3:2". */
const ratioFrom = (text: string, n: number): number[] | null => {
  const m = /^(?:equally|in the ratio (\d+(?::\d+)+))/.exec(text);
  if (!m) return null;
  return m[1] ? m[1].split(':').map(Number) : Array.from({ length: n }, () => 1);
};
/** A share as a fraction of 1, from a ratio. */
const shares = (r: readonly number[]): number[] => r.map((x) => x / sum(r));
const sameTerms = (a: readonly number[], b: readonly number[] | null): boolean => b !== null && a.length === b.length && a.every((t, i) => t === b[i]);

/** Tries a builder several times on the same random stream, so that an awkward draw seldom rejects the seed. */
const attempt = RET.attempt;

/** The firms a story is set in. */
const FIRM_OF = P.firmOf;
/** Two or three partners, alphabetical, and a ratio in lowest terms. */
const PSR2 = [[3, 2], [2, 1], [3, 1], [5, 3], [4, 1], [7, 3], [5, 2], [1, 1]];
const PSR3 = [[5, 3, 2], [3, 2, 1], [2, 2, 1], [4, 3, 2], [2, 1, 1], [3, 3, 2], [4, 3, 1], [1, 1, 1], [5, 4, 1], [3, 1, 1]];

// ===============================================================================================================
// Goodwill from the profits of the past years
// ===============================================================================================================

/** "year ended 31 March 2025". */
const yearEnded = (y: number): string => `year ended 31 March ${y}`;

/**
 * Profits of the two years before the one whose profit is `last`, so that the average of the three is a whole number of
 * rupees whose `n` years' purchase is a multiple of `unit`. Each is a whole thousand, believable beside `last`
 * (within about a third of it). Null when no pair fits.
 */
function twoBefore(rng: Rng, last: number, n: number, unit: number): [number, number] | null {
  const lo = Math.ceil((last * 0.7) / 1000) * 1000;
  const hi = Math.floor((last * 1.15) / 1000) * 1000;
  for (let t = 0; t < 30; t++) {
    const p1 = rng.step(lo, hi, 1000);
    const fits: number[] = [];
    for (let p2 = lo; p2 <= hi; p2 += 1000) {
      const total = p1 + p2 + last;
      if (total % 3 !== 0) continue;
      const g = (total / 3) * n;
      if (Number.isInteger(g) && g % unit === 0 && p2 !== p1) fits.push(p2);
    }
    if (fits.length > 0) return [p1, rng.pick(fits)];
  }
  return null;
}

/** The unit every goodwill of a case must be a multiple of: whole hundreds of rupees for every fraction given. */
const unitFor = (fracs: readonly ADM.Frac[]): number => 100 * fracs.reduce((l, f) => lcm(l, f[1]), 1);
const YEARS_PURCHASE = [2, 3, 2, 3, 1.5, 2.5];

/**
 * Three profits, the earliest first, each a whole thousand and near their average, such that the goodwill at `n`
 * years' purchase of the average lies from `lo` to `hi` and is a multiple of `unit`, and the average itself lies in
 * `avg` (in keeping with the capital the firm employs). Null when no draw fits.
 */
function profitsFor(
  rng: Rng,
  unit: number,
  lo: number,
  hi: number,
  ns: readonly number[] = [2, 3, 1.5],
  avg: readonly [number, number] = [0, Infinity],
): { profits: number[]; n: number; G: number } | null {
  const n = rng.pick(ns);
  const fits: number[] = [];
  for (let a = Math.max(1000, Math.ceil(Math.max(lo / n, avg[0]) / 1000) * 1000); a * n <= hi && a <= avg[1]; a += 1000) if (Number.isInteger(a * n) && (a * n) % unit === 0) fits.push(a);
  if (fits.length === 0) return null;
  const a = rng.pick(fits);
  const p1 = rng.step(Math.round((a * 0.8) / 1000) * 1000, Math.round((a * 1.1) / 1000) * 1000, 1000);
  const p2 = rng.step(Math.round((a * 0.85) / 1000) * 1000, Math.round((a * 1.15) / 1000) * 1000, 1000);
  const p3 = 3 * a - p1 - p2;
  if (p3 < a * 0.75 || p3 > a * 1.35 || new Set([p1, p2, p3]).size < 3) return null;
  return { profits: [p1, p2, p3], n, G: a * n };
}
/** "₹1,20,000 (year ended 31 March 2024), ..." for the three years that end on 31 March `last`. */
const threeYears = (profits: readonly number[], last: number): string => profits.map((p, k) => `${inr(p)} (${yearEnded(last - 2 + k)})`).join(', ');

// ===============================================================================================================
// 1. case-life-year-then-admission: a firm's year (interest on capital, salary, drawings and interest on them), then
//    goodwill valued on the profits of three years, the year just closed among them, and a partner admitted with a
//    premium on the first day of the next year (complex). What varies: the deal of the admission (old ratio, equal,
//    stated, from one partner), whether there is a salary, the years' purchase, which old partner is asked about.
// ===============================================================================================================

interface YearAdmission {
  d: ADM.Deal;
  caps: number[];
  r: number;
  ioc: number[];
  si: number;
  s: number;
  salary: number;
  drawings: number[];
  q: number;
  iod: number[];
  divisible: number;
  profit: number;
  past: [number, number];
  n: number;
  G: number;
  premium: number;
  credits: number[];
  /** The old partner whose capital is asked: one who gets part of the premium. */
  ask: number;
  closing: number[];
}

/** The year and the admission read back from the case text, worked in plain decimals. */
function readYearAdmission(text: string) {
  const deal = ADM.readDeal(text);
  if (!deal) return null;
  const { olds } = deal;
  const caps = olds.map((nm) => amountOf(lineOf(text, 'Capitals on'), nm));
  const r = Number(/Interest on capital: (\d+)% p\.a\./.exec(text)?.[1]);
  const salaryLine = lineOf(text, 'Salary:');
  const salary = olds.map((nm) => (salaryLine.endsWith(` to ${nm}`) ? 12 * amountsIn(salaryLine)[0] : 0));
  const drawLine = lineOf(text, 'Drawings during the year:');
  const drawings = olds.map((nm) => amountOf(drawLine, nm));
  const q = Number(/interest on drawings at (\d+)% p\.a\./.exec(drawLine)?.[1]);
  const iod = drawings.map((x) => (x * q * 6) / 1200);
  const ioc = caps.map((c) => (c * r) / 100);
  const profit = figure(text, 'Net profit for the year ended');
  const divisible = profit + sum(iod) - sum(ioc) - sum(salary);
  const past = amountsIn(lineOf(text, 'Net profits of the two years before'));
  const n = Number(/valued at ([\d.]+) years' purchase/.exec(text)?.[1]);
  const G = ((past[0] + past[1] + profit) / 3) * n;
  const closing = olds.map((_, i) => caps[i] + ioc[i] + salary[i] + divisible * deal.shares[i] - drawings[i] - iod[i] + G * deal.given[i]);
  return { deal, divisible, G, closing };
}

const yearThenAdmission = caseTemplate<YearAdmission>({
  id: 'case-life-year-then-admission',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'A year of profit, then a new partner',
  setup: (rng) =>
    attempt(10, () => {
      const d = ADM.dealWhere(rng, ['old', 'old', 'equal', 'stated', 'one'], ADM.tidySac, 2);
      if (!d) return null;
      const T = sum(d.old);
      const base = rng.pick([50000, 100000]);
      const caps = rng.shuffle(rng.pick(P.CAPS2)).map((u) => u * base);
      if (sum(caps) < 300000) return null;
      const r = rng.pick([5, 6, 8, 10]);
      const ioc = caps.map((c) => (c * r) / 100);
      const si = rng.int(0, 1);
      const s = rng.int(0, 2) > 0 ? rng.step(2000, 6000, 500) : 0;
      const salary = 12 * s;
      // Drawings in whole twenty thousands: six months' interest on them is then whole hundreds at every rate.
      const drawings = d.olds.map(() => rng.step(20000, 100000, 20000));
      const q = rng.pick([6, 9, 10, 12]);
      const iod = drawings.map((x) => (x * q * 6) / 1200);
      const step = T * 1000;
      const lo = Math.ceil(Math.max(90000, 0.12 * sum(caps)) / step);
      const hi = Math.floor(Math.min(420000, 0.3 * sum(caps)) / step);
      if (hi < lo) return null;
      const divisible = step * rng.int(lo, hi);
      const profit = divisible + sum(ioc) + salary - sum(iod);
      const n = rng.pick(YEARS_PURCHASE);
      const past = twoBefore(rng, profit, n, unitFor([d.share, ...d.given.filter(ADM.isPos)]));
      if (!past) return null;
      const G = ((past[0] + past[1] + profit) / 3) * n;
      if (G < 60000) return null;
      const premium = ADM.of(G, d.share);
      const credits = d.given.map((g) => ADM.of(G, g));
      const givers = d.olds.map((_, i) => i).filter((i) => credits[i] > 0);
      const ask = rng.pick(givers);
      const shares = d.old.map((t) => (divisible * t) / T);
      const closing = d.olds.map((_, i) => caps[i] + ioc[i] + (i === si ? salary : 0) + shares[i] - drawings[i] - iod[i] + credits[i]);
      if (closing.some((c) => c <= 0)) return null;
      return { d, caps, r, ioc, si, s, salary, drawings, q, iod, divisible, profit, past, n, G, premium, credits, ask, closing };
    }),
  context: (s) => {
    const { d } = s;
    const y = d.year;
    return [
      `${d.open} Their capitals are fluctuating. The firm closes its books on 31 March.`,
      `Capitals on 1 April ${y - 1}: ${each(d.olds, s.caps)}; no capital was brought in or withdrawn during the year`,
      `Interest on capital: ${s.r}% p.a.`,
      ...(s.salary > 0 ? [`Salary: ${inr(s.s)} per month to ${d.olds[s.si]}`] : []),
      `Drawings during the year: ${each(d.olds, s.drawings)}; interest on drawings at ${s.q}% p.a., the dates not known`,
      `Net profit for the ${yearEnded(y)} as per Profit and Loss A/c: ${inr(s.profit)}`,
      `Net profits of the two years before, as per Profit and Loss A/c: ${inr(s.past[0])} (${yearEnded(y - 2)}) and ${inr(s.past[1])} (${yearEnded(y - 1)})`,
      `${d.admit} ${d.how}`,
      `The goodwill of the firm is valued at ${s.n} years' purchase of the average net profit of the last three years. ${d.nw} brings in ${d.nw}'s share of goodwill as premium in cash, and it is kept in the business.`,
    ].join('\n');
  },
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { profit, iod, ioc, salary } = s;
        return num(
          `What is the divisible profit of the ${yearEnded(s.d.year)}, the profit left to be shared in the profit-sharing ratio?`,
          s.divisible,
          [
            [profit - sum(iod) - sum(ioc) - salary, 'Deducted the interest on drawings; the partners pay it to the firm, so it is added.'],
            [profit - sum(ioc) - salary, 'Left out the interest on drawings, which adds to the profit to be shared.'],
            [profit + sum(iod) - salary, 'Forgot to take out the interest on capital.'],
            ...(salary > 0 ? ([[profit + sum(iod) - sum(ioc) - s.s, 'Took out the salary of one month only; it is paid for twelve months.']] as Errs) : []),
            ...(salary > 0 ? ([[profit + sum(iod) - sum(ioc), 'Left out the salary, which is an appropriation like interest on capital.']] as Errs) : []),
          ],
          [
            `Interest on capital at ${s.r}% p.a.: ${s.d.olds.map((nm, i) => `${nm} ${inr(s.caps[i])} x ${s.r}/100 = ${inr(ioc[i])}`).join('; ')}; total ${inr(sum(ioc))}.`,
            `Interest on drawings at ${s.q}% p.a. for six months, the dates not being known: ${s.d.olds.map((nm, i) => `${nm} ${inr(s.drawings[i])} x ${s.q}/100 x 6/12 = ${inr(iod[i])}`).join('; ')}; total ${inr(sum(iod))}.`,
            ...(salary > 0 ? [`Salary = ${inr(s.s)} x 12 = ${inr(salary)}.`] : []),
            `Divisible profit = ${inr(profit)} + ${inr(sum(iod))} - ${inr(sum(ioc))}${salary > 0 ? ` - ${inr(salary)}` : ''} = ${inr(s.divisible)}.`,
          ],
          P.H.approp,
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readYearAdmission(q.context ?? '');
        return k !== null && near(q.answer / 100, k.divisible);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const [p1, p2] = s.past;
        const avg = (p1 + p2 + s.profit) / 3;
        return num(
          'At what amount is the goodwill of the firm valued?',
          s.G,
          [
            [((p1 + p2 + s.divisible) / 3) * s.n, `Took the divisible profit for the last year; goodwill is valued on the net profit as per Profit and Loss A/c, before interest on capital${s.salary > 0 ? ', salary' : ''} and the other appropriations.`],
            [((p1 + p2) / 2) * s.n, `Left out the ${yearEnded(s.d.year)}, which is one of the last three years.`],
            [s.profit * s.n, 'Valued goodwill on the profit of the last year alone instead of the average of three years.'],
            [avg, `Stopped at the average profit and did not multiply it by ${s.n}.`],
            [(p1 + p2 + s.profit) * s.n, 'Multiplied the total of the three profits, not their average.'],
          ],
          [
            `Average net profit = (${inr(p1)} + ${inr(p2)} + ${inr(s.profit)}) / 3 = ${inr(avg)}.`,
            `Goodwill = ${inr(avg)} x ${s.n} = ${inr(s.G)}.`,
            'The profits used are the net profits as per Profit and Loss A/c: interest on capital, salary and the like are appropriations of that profit, not charges against it.',
          ],
          ['Which profits are averaged, and are they before or after the appropriations?', "Goodwill = average profit x number of years' purchase."],
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readYearAdmission(q.context ?? '');
        return k !== null && near(q.answer / 100, k.G);
      },
    },
    {
      kind: 'numeric',
      unit: 'ratio',
      make: (s) => {
        const { d } = s;
        const asOld = ADM.ratioOf([...d.oldShares.map((x) => ADM.times(x, ADM.minus(ADM.ONE, d.share))), d.share]);
        const asEqual = ADM.ratioOf([...d.oldShares.map((x) => ADM.minus(x, ADM.fr(d.share[0], d.share[1] * 2))), d.share]);
        return ratioQ(
          `Find the new profit-sharing ratio of ${list(d.names)}.`,
          d.newRatio,
          [
            [[...d.old, 1], `Kept the old ratio and gave ${d.nw} one more term, without taking ${d.nw}'s share out of the old shares.`],
            [d.kind === 'old' ? asEqual : asOld, d.kind === 'old' ? `Took ${d.nw}'s share equally from the old partners; they keep their old ratio between them.` : `Took ${d.nw}'s share from the old partners in their old ratio, which is not what was agreed.`],
            [[d.newRatio[1], d.newRatio[0], d.newRatio[2]], 'Wrote the terms of the old partners against the wrong names.'],
            [[1, 1, 1], 'Shared the profit equally among the three.'],
          ],
          [...ADM.givesSteps(d), ...ADM.newShareSteps(d)],
          ADM.H.newRatio,
        );
      },
      verify: (q: RatioQuestion) => {
        const k = readYearAdmission(q.context ?? '');
        return k !== null && ADM.sameRatio(q.answer, [...k.deal.shares.map((x, i) => x - k.deal.given[i]), k.deal.share]);
      },
    },
    {
      kind: 'journal',
      make: (s) => {
        const { d } = s;
        return {
          prompt: `${d.nw}'s premium has been credited to Premium for Goodwill A/c. Pass the journal entry that gives it to the partners entitled to it.`,
          lines: ADM.entry(dr('premiumForGoodwill', s.premium), ...s.credits.map((c, i) => cr(partnerCapital(d.olds[i]), c))),
          explanation: [
            `Premium = ${inr(s.G)} x ${ADM.fs(d.share)} = ${inr(s.premium)}.`,
            ...ADM.givesSteps(d),
            ADM.sacStep(d),
            `The premium goes to the partners who sacrifice, in the sacrificing ratio: ${ADM.eachGets(d.olds, s.credits)}, credited to their capital accounts.`,
            'Premium for Goodwill A/c is debited, which closes it. No Goodwill A/c is raised (AS 26).',
          ],
          hints: ADM.H.premium,
          distractorAccounts: ['goodwill', partnerCapital(d.nw), 'profitAndLossAppropriation'],
        };
      },
      verify: (q: JournalQuestion) => {
        const k = readYearAdmission(q.context ?? '');
        return k !== null && near(posted(q, 'premiumForGoodwill', 'Dr'), k.G * k.deal.share) && k.deal.olds.every((nm, i) => near(posted(q, partnerCapital(nm), 'Cr'), k.G * k.deal.given[i]));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { d } = s;
        const i = s.ask;
        const nm = d.olds[i];
        const T = sum(d.old);
        const share = (s.divisible * d.old[i]) / T;
        const own = i === s.si ? s.salary : 0;
        const right = s.closing[i];
        return num(
          `What is the balance of ${nm}'s Capital A/c on 1 April ${d.year}, once the premium has been given to the partners entitled to it?`,
          right,
          [
            [right - s.credits[i], `Left out ${nm}'s part of the premium, which is credited to ${nm}'s Capital A/c.`],
            [right - s.credits[i] + s.premium, `Credited ${nm} with the whole premium; it is shared by the partners who sacrifice, in the sacrificing ratio.`],
            [right + s.iod[i], `Did not debit ${nm} with the interest on drawings.`],
            [right + s.drawings[i], `Did not debit ${nm} with the drawings.`],
            [right - share + (s.profit * d.old[i]) / T, `Credited ${nm} with a share of the net profit instead of the divisible profit.`],
          ],
          [
            `Capitals are fluctuating, so every item of the year goes to ${nm}'s Capital A/c.`,
            RET.tally(s.caps[i], [
              ['interest on capital', s.ioc[i]],
              ['salary', own],
              [`share of profit, ${inr(s.divisible)} x ${fr(d.old[i], T)}`, share],
              ['drawings', -s.drawings[i]],
              ['interest on drawings', -s.iod[i]],
              ['share of the premium', s.credits[i]],
            ]) + ` = ${inr(right)}.`,
          ],
          ['Start from the opening capital and take the year item by item, then the admission.', "Credits: interest on capital, salary, share of profit, share of the premium. Debits: drawings and interest on drawings."],
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readYearAdmission(q.context ?? '');
        const i = k ? k.deal.olds.indexOf(/balance of ([A-Z][a-z]+)'s Capital/.exec(q.prompt)?.[1] ?? '') : -1;
        return k !== null && i >= 0 && near(q.answer / 100, k.closing[i]);
      },
    },
  ],
});

// ===============================================================================================================
// 2. case-life-change-then-admission: partners change their ratio (goodwill adjusted through the capital accounts),
//    and a year later admit a partner who brings a premium for goodwill valued on the profits of three years, taken
//    from them in the ratio they then share in (complex).
//    The ratio of the change is the old ratio of the admission, so a student who goes back to the first ratio is
//    caught. What varies: two or three partners, the change, the deal of the admission, the partner asked about.
// ===============================================================================================================

interface ChangeAdmission {
  d: ADM.Deal;
  ch: CPR.Change;
  firm: string;
  G1: number;
  /** The profits of the three years before the admission, the years' purchase and the goodwill they give. */
  profits: number[];
  n: number;
  G2: number;
  credits: number[];
  ask: number;
}

/** What the case text says, read back: both ratios, the deal and the two goodwill figures. */
function readChangeAdmission(text: string) {
  const first = lineOf(text, / are partners in /);
  const olds = (/^(.+?) are partners/.exec(first)?.[1] ?? '').split(/, | and /);
  const before = /Until .*? they shared profits and losses (equally|in the ratio [\d:]+)/.exec(first)?.[1] ?? '';
  const after = /they agreed to share them (equally|in the ratio [\d:]+)/.exec(first)?.[1] ?? '';
  const oldR = ratioFrom(before, olds.length);
  const neuR = ratioFrom(after, olds.length);
  const G1 = figure(text, 'Goodwill on the change');
  const n = Number(/goodwill is valued at ([\d.]+) years' purchase/.exec(text)?.[1]);
  const G2 = (sum(amountsIn(lineOf(text, 'Net profits of the last three years'))) / 3) * n;
  const admit = lineOf(text, / is admitted /);
  const nw = /, ([A-Z][a-z]+) is admitted|^([A-Z][a-z]+) is admitted/.exec(admit);
  const share = /for (\d+)\/(\d+) share/.exec(admit);
  if (!oldR || !neuR || !share || !nw) return null;
  const x = Number(share[1]) / Number(share[2]);
  const ns = shares(neuR);
  const one = /whole of this share from (\w+)\.|(\w+) alone gives up this share/.exec(admit);
  const split = /in the ratio (\d+(?::\d+)+)\.?$/.exec(admit);
  const parts = /acquires (\d+)\/(\d+) from \w+ and (\d+)\/(\d+) from \w+/.exec(admit);
  const given = parts
    ? [Number(parts[1]) / Number(parts[2]), Number(parts[3]) / Number(parts[4])]
    : /equally/.test(admit)
    ? olds.map(() => x / olds.length)
    : one
      ? olds.map((nm) => (nm === (one[1] ?? one[2]) ? x : 0))
      : split
        ? split[1].split(':').map(Number).map((t, _, all) => (x * t) / sum(all))
        : ns.map((v) => v * x);
  return { olds, old: shares(oldR), neu: ns, x, given, news: [...ns.map((v, i) => v - given[i]), x], G1, G2 };
}

const changeThenAdmission = caseTemplate<ChangeAdmission>({
  id: 'case-life-change-then-admission',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'A new ratio, then a new partner',
  setup: (rng) =>
    attempt(12, () => {
      const m = rng.pick([2, 2, 3]);
      const d = ADM.dealWhere(rng, ['old', 'old', 'equal', 'stated'], ADM.tidySac, m);
      if (!d || d.sac === null) return null;
      const options = (m === 2 ? CPR.TWO : CPR.THREE).filter((c) => sameTerms(c.neu, d.old) && (m === 2 || c.same.length < 2));
      if (options.length === 0) return null;
      const ch = rng.pick(options);
      const G1 = CPR.pickAmount(rng, 60000, 480000, (v) => ch.d.every((x) => (v * Math.abs(x)) % (ch.L * 100) === 0));
      // A year later goodwill is valued on the profits of three years, and is somewhat higher: from a tenth to a half more.
      const valued = G1 === null ? null : profitsFor(rng, unitFor([d.share, ...d.given.filter(ADM.isPos)]), G1 * 1.1, G1 * 1.5);
      if (G1 === null || valued === null) return null;
      const G2 = valued.G;
      const credits = d.given.map((g) => ADM.of(G2, g));
      if (credits.some((c) => !Number.isInteger(c) || c % 100 !== 0)) return null;
      // The partner asked about at the end gave something up on the change or kept a share that moved.
      const ask = rng.int(0, m - 1);
      return { d, ch, firm: FIRM_OF(rng), G1, profits: valued.profits, n: valued.n, G2, credits, ask };
    }),
  context: (s) => {
    const { d, ch } = s;
    const y = d.year;
    return [
      `${list(d.olds)} are partners in ${s.firm}. Until 31 March ${y - 1} they shared profits and losses ${inRatio(ch.old)}; from 1 April ${y - 1} they agreed to share them ${inRatio(ch.neu)}. Their capitals are fluctuating, and goodwill is never raised in the books: it is adjusted through the capital accounts.`,
      `Goodwill on the change of ratio, 1 April ${y - 1}: ${inr(s.G1)}`,
      `On 1 April ${y}, ${d.nw} is admitted for ${ADM.fs(d.share)} share. ${d.kind === 'old' ? `${list(d.olds)} keep the ratio in which they then share.` : d.how}`,
      `Net profits of the last three years: ${threeYears(s.profits, y)}`,
      `On the admission, goodwill is valued at ${s.n} years' purchase of the average profit of the last three years; ${d.nw} brings ${d.nw}'s share of it as premium in cash.`,
    ].join('\n');
  },
  parts: [
    {
      kind: 'journal',
      make: (s) => {
        const { d, ch } = s;
        const names = d.olds;
        return {
          prompt: `Pass the journal entry for goodwill on the change of ratio on 1 April ${d.year - 1}.`,
          lines: CPR.compensation(ch, names, s.G1, false),
          explanation: [
            ...CPR.movesText(ch, names),
            ...[...ch.gain, ...ch.sac].map((i) => `${names[i]}: ${inr(s.G1)} x ${CPR.frac(Math.abs(ch.d[i]), ch.L)} = ${inr(CPR.moved(s.G1, ch, i))}.`),
            `The partner who gains pays for the share gained: ${list(ch.gain.map((i) => `${names[i]}'s Capital A/c`))} ${ch.gain.length > 1 ? 'are' : 'is'} debited.`,
            `The partner who sacrifices is compensated: ${list(ch.sac.map((i) => `${names[i]}'s Capital A/c`))} ${ch.sac.length > 1 ? 'are' : 'is'} credited. No Goodwill A/c is opened.`,
          ],
          hints: CPR.H.goodwill,
          distractorAccounts: ['goodwill', 'premiumForGoodwill', 'revaluation'],
        };
      },
      verify: (q: JournalQuestion) => {
        const k = readChangeAdmission(q.context ?? '');
        // Each partner is credited with goodwill x (old share - new share): a gain is a debit.
        return k !== null && k.olds.every((nm, i) => near(posted(q, partnerCapital(nm), 'Cr') - posted(q, partnerCapital(nm), 'Dr'), k.G1 * (k.old[i] - k.neu[i])));
      },
    },
    {
      kind: 'numeric',
      unit: 'ratio',
      make: (s) => {
        const { d, ch } = s;
        // The same admission worked on the ratio before the change.
        const before = ADM.sharesOf(ch.old);
        const fromBefore = ADM.ratioOf([...before.map((x, i) => ADM.minus(x, d.kind === 'old' ? ADM.times(x, d.share) : d.given[i])), d.share]);
        return ratioQ(
          `Find the new profit-sharing ratio of ${list(d.names)} on ${d.nw}'s admission.`,
          d.newRatio,
          [
            [fromBefore, `Started from the ratio before the change, ${rt(ch.old)}; on 1 April ${d.year} the partners share ${inRatio(d.old)}.`],
            [[...d.old, 1], `Kept the ratio of the old partners and gave ${d.nw} one more term, without taking ${d.nw}'s share out of theirs.`],
            [[...ch.old, 1], 'Went back to the ratio before the change and added one more term for the new partner.'],
            [d.names.map(() => 1), 'Shared the profit equally among all the partners.'],
          ],
          [`On 1 April ${d.year} the partners share ${inRatio(d.old)}: that is the ratio the admission starts from.`, ...ADM.givesSteps(d), ...ADM.newShareSteps(d)],
          ADM.H.newRatio,
        );
      },
      verify: (q: RatioQuestion) => {
        const k = readChangeAdmission(q.context ?? '');
        return k !== null && ADM.sameRatio(q.answer, k.news);
      },
    },
    {
      kind: 'numeric',
      unit: 'ratio',
      make: (s) => {
        const { d, ch } = s;
        const sac = d.sac!;
        return ratioQ(
          `In what ratio do ${list(d.olds)} sacrifice on ${d.nw}'s admission?`,
          sac,
          [
            [lowestTerms(ch.old), `Took the ratio before the change, ${rt(ch.old)}; by 1 April ${d.year} the partners share ${inRatio(d.old)}.`],
            [d.newRatio.slice(0, d.olds.length), 'Gave the new ratio of the old partners instead of what each gave up.'],
            [d.kind === 'old' ? d.olds.map(() => 1) : lowestTerms(d.old), d.kind === 'old' ? 'Took the old partners to give up the share equally.' : 'Took the old partners to give up the share in the ratio in which they shared, which is not what was agreed.'],
            [[...sac].reverse(), 'Wrote the terms against the wrong names.'],
          ],
          [...ADM.givesSteps(d), ADM.sacStep(d)],
          ADM.H.sacrifice,
        );
      },
      verify: (q: RatioQuestion) => {
        const k = readChangeAdmission(q.context ?? '');
        return k !== null && ADM.sameRatio(q.answer, k.given);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { d, ch } = s;
        const i = d.olds.findIndex((_, j) => s.credits[j] > 0 && s.credits[j] !== s.credits[(j + 1) % d.olds.length]);
        const j = i >= 0 ? i : 0;
        const nm = d.olds[j];
        const premium = ADM.of(s.G2, d.share);
        return num(
          `How much of ${d.nw}'s premium is credited to ${nm}'s Capital A/c?`,
          s.credits[j],
          [
            [(premium * ch.old[j]) / ch.so, `Shared the premium in the ratio before the change, ${rt(ch.old)}.`],
            [premium, `Gave ${nm} the whole premium.`],
            [premium / d.olds.length, 'Shared the premium equally among the old partners.'],
            [(s.G2 * d.old[j]) / sum(d.old), `Gave ${nm} a share of the whole goodwill instead of a share of ${d.nw}'s premium.`],
            [s.G1 * Math.abs(ch.d[j]) / ch.L, 'Used the goodwill of the change of ratio, a year earlier.'],
            [s.credits[j] / s.n, `Worked on the average profit and forgot the ${s.n} years' purchase.`],
          ],
          [
            `Average profit = (${s.profits.map(inr).join(' + ')}) / 3 = ${inr(s.G2 / s.n)}; goodwill = ${inr(s.G2 / s.n)} x ${s.n} = ${inr(s.G2)}.`,
            `Premium = ${inr(s.G2)} x ${ADM.fs(d.share)} = ${inr(premium)}.`,
            ...ADM.givesSteps(d),
            ADM.sacStep(d),
            `${nm} gets ${inr(premium)} x ${ADM.fs(d.parts[j])} = ${inr(s.credits[j])}.`,
          ],
          ADM.H.premium,
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readChangeAdmission(q.context ?? '');
        const j = k ? k.olds.indexOf(/credited to ([A-Z][a-z]+)'s Capital/.exec(q.prompt)?.[1] ?? '') : -1;
        return k !== null && j >= 0 && near(q.answer / 100, k.G2 * k.given[j]);
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const { d, ch } = s;
        const j = s.ask;
        const nm = d.olds[j];
        const before = ADM.fr(ch.old[j], ch.so);
        const afterChange = d.oldShares[j];
        const right = d.news[j];
        const fromBefore = ADM.minus(before, d.kind === 'old' ? ADM.times(before, d.share) : d.given[j]);
        return choice(
          `What is ${nm}'s share of the profits after ${d.nw}'s admission?`,
          ADM.fs(right),
          [
            [ADM.fs(afterChange), `Gave ${nm}'s share after the change of ratio, before ${d.nw} came in.`],
            [ADM.isPos(fromBefore) ? ADM.fs(fromBefore) : '', `Took ${d.nw}'s share out of ${nm}'s share before the change, ${ADM.fs(before)}.`],
            [ADM.fs(before), `Gave ${nm}'s share before the change of ratio.`],
            [ADM.fs(ADM.minus(ADM.ONE, d.share)), `Gave what the old partners keep between them, not ${nm}'s part of it.`],
            [ADM.fs(ADM.fr(1, d.names.length)), 'Took all the partners to share equally.'],
          ].filter(([t]) => t !== '') as [string, string][],
          `Before the change ${nm} had ${ADM.fs(before)}; from 1 April ${d.year - 1}, ${ADM.fs(afterChange)}. On ${d.nw}'s admission ${nm} gives up ${ADM.fs(d.given[j])}, which leaves ${ADM.fs(afterChange)} - ${ADM.fs(d.given[j])} = ${ADM.fs(right)}.`,
          ADM.H.newRatio,
        );
      },
      verify: (q: McqQuestion) => {
        const k = readChangeAdmission(q.context ?? '');
        const j = k ? k.olds.indexOf(/What is ([A-Z][a-z]+)'s share/.exec(q.prompt)?.[1] ?? '') : -1;
        const m = /^(\d+)\/(\d+)$/.exec(optionText(q));
        return k !== null && j >= 0 && m !== null && near(Number(m[1]) / Number(m[2]), k.news[j]);
      },
    },
  ],
});

// ===============================================================================================================
// Dates of a year that runs from 1 April
// ===============================================================================================================

const MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
const LAST_DAY = [30, 31, 30, 31, 31, 30, 31, 30, 31, 31, 28, 31];
/** The last day of the `m`th month of the year that starts on 1 April `y` (m from 1 to 12): monthEnd(2025, 3) is "30 June 2025". */
const monthEnd = (y: number, m: number): string => `${LAST_DAY[m - 1]} ${MONTHS[m - 1]} ${m >= 10 ? y + 1 : y}`;
/** The whole months from 1 April to a month-end date of that year, read back from the date. */
const monthsTo = (date: string): number => MONTHS.indexOf(/\d+ ([A-Z][a-z]+) \d{4}/.exec(date)?.[1] ?? '') + 1;

/** The ratio of a RET firm read back from its opening sentence: the first ratio of as many terms as there are partners. */
const oldRatioIn = (text: string, n: number): number[] | null => RET.ratiosIn(text).find((r) => r.length === n) ?? null;

// ===============================================================================================================
// 3. case-life-year-then-retirement: a firm's year (interest on capital and drawings, a salary in some seeds), then
//    a partner retires on the last day of it: the retiring partner's capital built from the year's figures, goodwill
//    valued on the profits of three years, the goodwill entry, the amount due and the interest on the loan it becomes
//    (complex). What varies: who retires, how the continuing partners take the share over, a profit or a loss on
//    revaluation, the salary, the years' purchase.
// ===============================================================================================================

interface YearRetirement {
  f: RET.Firm;
  intro: string;
  g: RET.Gain;
  y: number;
  caps: number[];
  r: number;
  ioc: number[];
  si: number;
  s: number;
  salary: number[];
  drawings: number[];
  q: number;
  iod: number[];
  divisible: number;
  profit: number;
  past: [number, number];
  n: number;
  G: number;
  R: number;
  V: number;
  rate: number;
  closing: number[];
  due: number;
}

/** The year and the retirement read back from the case text, worked in plain decimals. */
function readYearRetirement(text: string) {
  const g = RET.readFirm(text);

  const gain = g && RET.readGain(text, g);
  if (!g || !gain) return null;
  const capsLine = lineOf(text, 'Capitals on');
  const caps = g.names.map((nm) => amountOf(capsLine, nm));
  const r = Number(/Interest on capital: (\d+)% p\.a\./.exec(text)?.[1]);
  const salaryLine = lineOf(text, 'Salary:');
  const salary = g.names.map((nm) => (salaryLine.endsWith(` to ${nm}`) ? 12 * amountsIn(salaryLine)[0] : 0));
  const drawLine = lineOf(text, 'Drawings during the year:');
  const drawings = g.names.map((nm) => amountOf(drawLine, nm));
  const q = Number(/interest on drawings at (\d+)% p\.a\./.exec(drawLine)?.[1]);
  const iod = drawings.map((x) => (x * q * 6) / 1200);
  const ioc = caps.map((c) => (c * r) / 100);
  const profit = figure(text, 'Net profit for the year ended');
  const divisible = profit + sum(iod) - sum(ioc) - sum(salary);
  const past = amountsIn(lineOf(text, 'Net profits of the two years before'));
  const n = Number(/valued at ([\d.]+) years' purchase/.exec(text)?.[1]);
  const G = ((past[0] + past[1] + profit) / 3) * n;
  const R = figure(text, 'General Reserve');
  const revLine = lineOf(text, 'Revaluation of the assets');
  const V = amountsIn(revLine)[0] * (/ a profit of /.test(revLine) ? 1 : -1);
  const o = g.names.indexOf(g.out);
  const closing = g.names.map((_, i) => caps[i] + ioc[i] + salary[i] + divisible * g.share[i] - drawings[i] - iod[i]);
  return { g, gain, G, divisible, closing, due: closing[o] + (G + R + V) * g.x, o };
}

const yearThenRetirement = caseTemplate<YearRetirement>({
  id: 'case-life-year-then-retirement',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'A last year, then a partner retires',
  setup: (rng) =>
    attempt(10, () => {
      const f = RET.firm(rng);
      const g = RET.gainOf(rng, f, ['silent', 'silent', 'split', 'one', 'agreed']);
      if (!g) return null;
      const T = f.total;
      const y = rng.pick([2024, 2025, 2026]);
      const base = rng.pick([50000, 100000]);
      const caps = rng.shuffle(rng.pick(P.CAPS3)).map((u) => u * base);
      if (sum(caps) < 400000) return null;
      const r = rng.pick([5, 6, 8, 10]);
      const ioc = caps.map((c) => (c * r) / 100);
      const si = rng.int(0, 2);
      const s = rng.int(0, 2) > 0 ? rng.step(2000, 6000, 500) : 0;
      const salary = f.names.map((_, i) => (i === si ? 12 * s : 0));
      const drawings = f.names.map(() => rng.step(20000, 80000, 20000));
      const q = rng.pick([6, 9, 10, 12]);
      const iod = drawings.map((x) => (x * q * 6) / 1200);
      const step = T * 1000;
      const lo = Math.ceil(Math.max(120000, 0.12 * sum(caps)) / step);
      const hi = Math.floor(Math.min(480000, 0.3 * sum(caps)) / step);
      if (hi < lo) return null;
      const divisible = step * rng.int(lo, hi);
      const profit = divisible + sum(ioc) + sum(salary) - sum(iod);
      const n = rng.pick(YEARS_PURCHASE);
      const past = twoBefore(rng, profit, n, 100 * T * sum(g.w));
      if (!past) return null;
      const G = ((past[0] + past[1] + profit) / 3) * n;
      const R = RET.mult(rng, T * 1000, 20000, 150000);
      const V = (rng.int(0, 2) > 0 ? 1 : -1) * (RET.mult(rng, T * 1000, 10000, 80000) ?? 0);
      if (R === null || V === 0) return null;
      const closing = f.names.map((_, i) => caps[i] + ioc[i] + salary[i] + (divisible * f.old[i]) / T - drawings[i] - iod[i]);
      if (closing.some((c) => c < 50000)) return null;
      const o = f.names.indexOf(f.out);
      const due = closing[o] + ((G + R + V) * f.x) / T;
      // The continuing partners can bear the goodwill they pay for.
      const { parts } = RET.goodwillParts(f, g, G);
      if (f.stay.some((nm, i) => closing[f.names.indexOf(nm)] + ((R + V) * f.stayOld[i]) / T - parts[i] < 30000)) return null;
      return { f, intro: RET.intro(rng, f), g, y, caps, r, ioc, si, s, salary, drawings, q, iod, divisible, profit, past, n, G, R, V, rate: rng.pick([8, 9, 10, 12]), closing, due };
    }),
  context: (s) => {
    const { f, y } = s;
    return [
      `${s.intro} ${RET.FLUCTUATING} ${RET.CLOSES}`,
      `Capitals on 1 April ${y - 1}: ${each(f.names, s.caps)}; no capital was brought in or withdrawn during the year`,
      `Interest on capital: ${s.r}% p.a.`,
      ...(s.s > 0 ? [`Salary: ${inr(s.s)} per month to ${f.names[s.si]}`] : []),
      `Drawings during the year: ${each(f.names, s.drawings)}; interest on drawings at ${s.q}% p.a., the dates not known`,
      `Net profit for the ${yearEnded(y)} as per Profit and Loss A/c: ${inr(s.profit)}`,
      `Net profits of the two years before, as per Profit and Loss A/c: ${inr(s.past[0])} (${yearEnded(y - 2)}) and ${inr(s.past[1])} (${yearEnded(y - 1)})`,
      `General Reserve in the books on 31 March ${y}: ${inr(s.R)}`,
      `Once the accounts of the year are closed, ${f.out} retires on 31 March ${y}; ${s.g.text}.`,
      `Revaluation of the assets and liabilities on that date shows a ${s.V > 0 ? 'profit' : 'loss'} of ${inr(Math.abs(s.V))}.`,
      `${RET.RESERVE_IN_FULL} The goodwill of the firm is valued at ${s.n} years' purchase of the average net profit of the last three years; ${RET.goodwillRule(false).charAt(0).toLowerCase()}${RET.goodwillRule(false).slice(1)}`,
      `The amount due to ${f.out} is transferred to ${f.out}'s Loan A/c, which carries interest at ${s.rate}% p.a.`,
    ].join('\n');
  },
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { f } = s;
        const o = f.names.indexOf(f.out);
        const share = (s.divisible * f.x) / f.total;
        const right = s.closing[o];
        return num(
          `What is the balance of ${f.out}'s Capital A/c on 31 March ${s.y}, once the year's appropriations have been entered and before anything for the retirement?`,
          right,
          [
            [right + s.iod[o], `Did not debit ${f.out} with the interest on drawings.`],
            [right + s.drawings[o], `Did not debit ${f.out} with the drawings.`],
            [right - s.ioc[o], `Left out the interest on ${f.out}'s capital.`],
            [right - share + (s.profit * f.x) / f.total, `Credited ${f.out} with a share of the net profit instead of the divisible profit.`],
            [right - share + s.divisible / 3, 'Shared the divisible profit equally instead of in the profit-sharing ratio.'],
          ],
          [
            `Divisible profit = ${inr(s.profit)} + interest on drawings ${inr(sum(s.iod))} - interest on capital ${inr(sum(s.ioc))}${sum(s.salary) > 0 ? ` - salary ${inr(sum(s.salary))}` : ''} = ${inr(s.divisible)}.`,
            `${f.out}'s Capital A/c: ${RET.tally(s.caps[o], [
              ['interest on capital', s.ioc[o]],
              ['salary', s.salary[o]],
              [`share of profit, ${inr(s.divisible)} x ${fr(f.x, f.total)}`, share],
              ['drawings', -s.drawings[o]],
              ['interest on drawings', -s.iod[o]],
            ])} = ${inr(right)}.`,
          ],
          P.H.approp,
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readYearRetirement(q.context ?? '');
        return k !== null && near(q.answer / 100, k.closing[k.o]);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const [p1, p2] = s.past;
        const avg = (p1 + p2 + s.profit) / 3;
        return num(
          'At what amount is the goodwill of the firm valued?',
          s.G,
          [
            [((p1 + p2 + s.divisible) / 3) * s.n, 'Took the divisible profit for the last year; goodwill is valued on the net profit as per Profit and Loss A/c, before the appropriations.'],
            [((p1 + p2) / 2) * s.n, `Left out the ${yearEnded(s.y)}, which is one of the last three years.`],
            [s.profit * s.n, 'Valued goodwill on the profit of the last year alone instead of the average of three years.'],
            [avg, `Stopped at the average profit and did not multiply it by ${s.n}.`],
          ],
          [`Average net profit = (${inr(p1)} + ${inr(p2)} + ${inr(s.profit)}) / 3 = ${inr(avg)}.`, `Goodwill = ${inr(avg)} x ${s.n} = ${inr(s.G)}.`],
          ['Which profits are averaged, and are they before or after the appropriations?', "Goodwill = average profit x number of years' purchase."],
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readYearRetirement(q.context ?? '');
        return k !== null && near(q.answer / 100, k.G);
      },
    },
    {
      kind: 'journal',
      make: (s) => {
        const step = RET.stepGoodwill(s.f, s.g, s.G);
        return {
          prompt: `Pass the journal entry for ${s.f.out}'s share of goodwill.`,
          lines: step.lines,
          explanation: step.explanation,
          hints: RET.H.goodwill,
          distractorAccounts: ['goodwill', 'premiumForGoodwill', partnerLoan(s.f.out)],
        };
      },
      verify: (q: JournalQuestion) => {
        const k = readYearRetirement(q.context ?? '');
        if (!k) return false;
        const out = k.G * k.g.x;
        return near(posted(q, partnerCapital(k.g.out), 'Cr'), out) && k.g.stay.every((nm, i) => near(posted(q, partnerCapital(nm), 'Dr'), (out * k.gain[i]) / sum(k.gain)));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { f } = s;
        const o = f.names.indexOf(f.out);
        const part = (v: number): number => (v * f.x) / f.total;
        const gs = part(s.G);
        return num(
          `How much is transferred to ${f.out}'s Loan A/c?`,
          s.due,
          [
            [s.due - gs, `Left out ${f.out}'s share of goodwill, which the continuing partners pay for through the capital accounts.`],
            [s.due - gs + s.G, `Credited ${f.out} with the whole goodwill of the firm instead of ${f.out}'s share of it.`],
            [s.due - part(s.R), `Left out ${f.out}'s share of the General Reserve.`],
            [s.due - 2 * part(s.V), `Took the ${s.V > 0 ? 'profit' : 'loss'} on revaluation as a ${s.V > 0 ? 'loss' : 'profit'}.`],
            [s.caps[o] + gs + part(s.R + s.V), `Started from ${f.out}'s capital at the beginning of the year, leaving out the year's interest, profit and drawings.`],
          ],
          [
            `${f.out}'s capital after the year's appropriations = ${inr(s.closing[o])}.`,
            `Amount due = ${RET.tally(s.closing[o], [
              ['share of goodwill', gs],
              ['share of the General Reserve', part(s.R)],
              [`share of the ${s.V > 0 ? 'profit' : 'loss'} on revaluation`, part(s.V)],
            ])} = ${inr(s.due)}.`,
            `Each share is ${fr(f.x, f.total)}, ${f.out}'s share in the old ratio ${rt(f.old)}. The whole amount is transferred to ${f.out}'s Loan A/c.`,
          ],
          RET.H.due,
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readYearRetirement(q.context ?? '');
        return k !== null && near(q.answer / 100, k.due);
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const { f } = s;
        const out = f.out;
        return choice(
          `At the end of the next year the firm records the interest of that year on ${out}'s loan, without paying it. Which entry does it pass?`,
          `Interest on Loan A/c Dr; To ${out}'s Loan A/c`,
          [
            [`Profit and Loss Appropriation A/c Dr; To ${out}'s Loan A/c`, `Treated the interest as an appropriation of profit; ${out} is no longer a partner, and interest on a loan is a charge whether the firm earns a profit or not.`],
            [`${out}'s Loan A/c Dr; To Interest on Loan A/c`, `Wrote the entry the wrong way round: the firm owes ${out} the interest, so ${out}'s Loan A/c is credited.`],
            [`Interest on Loan A/c Dr; To Bank A/c`, 'Recorded the interest as paid; it is only credited to the loan, which grows by it.'],
            [`${list(f.stay.map((nm) => `${nm}'s Capital A/c`))} Dr; To ${out}'s Loan A/c`, `Charged the interest straight to the continuing partners' capitals; it is an expense of the firm, closed to Profit and Loss A/c.`],
          ],
          `Interest at ${s.rate}% p.a. on ${out}'s loan is an expense of the firm: Interest on Loan A/c is debited (and closed to Profit and Loss A/c), and ${out}'s Loan A/c is credited, since the interest is added to what the firm owes until it is paid.`,
          RET.H.loan,
        );
      },
      verify: (q: McqQuestion) => {
        const out = /interest of that year on ([A-Z][a-z]+)'s loan/.exec(q.prompt)?.[1] ?? '';
        return out !== '' && optionText(q) === `Interest on Loan A/c Dr; To ${out}'s Loan A/c` && (q.context ?? '').includes(`${out} retires`);
      },
    },
  ],
});

// ===============================================================================================================
// 4. case-life-death-in-year: a partner dies part-way through the year. The deed gives the executor the capital, the
//    interest on it and the share of profit to the date of death (on the last year's profit), the share of goodwill
//    valued on the profits of three years and of the reserve, less the drawings (complex). What varies: who dies and
//    when, how the survivors take the share over, the rate, the years' purchase.
// ===============================================================================================================

interface DeathInYear {
  f: RET.Firm;
  intro: string;
  g: RET.Gain;
  y: number;
  m: number;
  date: string;
  K: number;
  r: number;
  interest: number;
  last: number;
  past: [number, number];
  n: number;
  G: number;
  R: number;
  drawn: number;
  profitShare: number;
  goodwillShare: number;
  due: number;
}

function readDeathInYear(text: string) {
  const first = text.split('\n')[0];
  const g = RET.readFirm(text);
  const gain = g && RET.readGain(text, g);
  if (!g || !gain || !first) return null;
  const date = /dies on (\d+ [A-Z][a-z]+ \d{4})/.exec(text)?.[1] ?? '';
  const m = monthsTo(date);
  const K = figure(text, `${g.out}'s capital as per the balance sheet`);
  const r = Number(/interest on capital at (\d+)% p\.a\./.exec(text)?.[1]);
  const last = figure(text, 'Net profit for the year ended');
  const past = amountsIn(lineOf(text, 'Net profits of the two years before'));
  const n = Number(/valued at ([\d.]+) years' purchase/.exec(text)?.[1]);
  const G = ((past[0] + past[1] + last) / 3) * n;
  const R = figure(text, 'General Reserve');
  const drawn = figure(text, `${g.out}'s drawings`);
  const profitShare = (last * m * g.x) / 12;
  return { g, gain, m, profitShare, G, due: K + (K * r * m) / 1200 + profitShare + (G + R) * g.x - drawn };
}

const deathInYear = caseTemplate<DeathInYear>({
  id: 'case-life-death-in-year',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'A partner dies during the year',
  setup: (rng) =>
    attempt(12, () => {
      const f = RET.firm(rng);
      const g = RET.gainOf(rng, f, ['silent', 'silent', 'split', 'one']);
      if (!g) return null;
      const T = f.total;
      const y = rng.pick([2024, 2025, 2026]);
      const m = rng.pick([3, 4, 5, 6, 7, 8, 9, 10]);
      const last = RET.profitForTime(rng, f, m);
      if (last === null) return null;
      const profitShare = (last * m * f.x) / (12 * T);
      if (profitShare % 100 !== 0) return null;
      const n = rng.pick(YEARS_PURCHASE);
      const past = twoBefore(rng, last, n, 100 * T * sum(g.w));
      if (!past) return null;
      const G = ((past[0] + past[1] + last) / 3) * n;
      const r = rng.pick([6, 8, 9, 10, 12]);
      // A capital whose interest for the months is whole hundreds of rupees.
      const K = RET.clean(rng, 100000, 500000, 10000, (k) => (k * r * m) % 120000 === 0);
      const R = RET.mult(rng, T * 1000, 20000, 150000);
      if (K === null || R === null) return null;
      const interest = (K * r * m) / 1200;
      const drawn = rng.step(10000, Math.max(10000, Math.min(80000, Math.floor((K * 0.3) / 5000) * 5000)), 5000);
      const goodwillShare = (G * f.x) / T;
      const due = K + interest + profitShare + goodwillShare + (R * f.x) / T - drawn;
      return { f, intro: RET.intro(rng, f), g, y, m, date: monthEnd(y, m), K, r, interest, last, past, n, G, R, drawn, profitShare, goodwillShare, due };
    }),
  context: (s) => {
    const { f, y } = s;
    return [
      `${s.intro} ${RET.FLUCTUATING} ${RET.CLOSES}`,
      `${f.out}'s capital as per the balance sheet of 31 March ${y}: ${inr(s.K)}`,
      `General Reserve as per that balance sheet: ${inr(s.R)}`,
      `Net profit for the ${yearEnded(y)} as per Profit and Loss A/c: ${inr(s.last)}`,
      `Net profits of the two years before, as per Profit and Loss A/c: ${inr(s.past[0])} (${yearEnded(y - 2)}) and ${inr(s.past[1])} (${yearEnded(y - 1)})`,
      `${f.out} dies on ${s.date}; ${s.g.text}.`,
      `${f.out}'s drawings from 1 April ${y} to the date of death: ${inr(s.drawn)} (no interest is charged on drawings)`,
      `Under the deed the executor of a deceased partner is entitled to the capital, interest on capital at ${s.r}% p.a. to the date of death, the share of profit to the date of death on the basis of the last year's profit, the share of the General Reserve and the share of goodwill. The whole of the General Reserve is distributed among all the partners. The goodwill of the firm is valued at ${s.n} years' purchase of the average net profit of the last three years; ${RET.goodwillRule(false).charAt(0).toLowerCase()}${RET.goodwillRule(false).slice(1)} The share of profit is passed through Profit and Loss Suspense A/c.`,
    ].join('\n');
  },
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { f, m } = s;
        const share = (v: number): number => (v * f.x) / f.total;
        const avg = (s.past[0] + s.past[1] + s.last) / 3;
        return num(
          `What is ${f.out}'s share of profit from 1 April ${s.y} to the date of death?`,
          s.profitShare,
          [
            [share(s.last), `Gave ${f.out} a share of the whole year's profit; ${f.out} was a partner for ${m} months of it.`],
            [(share(s.last) * (m - 1)) / 12, `Counted ${m - 1} months; from 1 April to ${s.date} is ${m} months.`],
            [(share(s.last) * (m + 1)) / 12, `Counted ${m + 1} months; from 1 April to ${s.date} is ${m} months.`],
            [(share(avg) * m) / 12, "Worked on the average profit of three years; the deed says the last year's profit."],
            [(s.last * m) / 12, `Gave the profit of the ${m} months without taking ${f.out}'s share of it.`],
          ],
          [
            `From 1 April ${s.y} to ${s.date} is ${m} months.`,
            `Share of profit = ${inr(s.last)} x ${m}/12 x ${fr(f.x, f.total)} = ${inr(s.profitShare)}.`,
          ],
          RET.H.death,
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readDeathInYear(q.context ?? '');
        return k !== null && near(q.answer / 100, k.profitShare);
      },
    },
    {
      kind: 'journal',
      make: (s) => ({
        prompt: `Pass the journal entry for ${s.f.out}'s share of profit to the date of death.`,
        lines: [dr('profitAndLossSuspense', s.profitShare), cr(partnerCapital(s.f.out), s.profitShare)],
        explanation: [
          `The share of profit, ${inr(s.profitShare)}, is credited to ${s.f.out}'s Capital A/c: the firm owes it to ${s.f.out}.`,
          'The year is not over, so there is no profit to appropriate yet: Profit and Loss Suspense A/c is debited, and closed to Profit and Loss Appropriation A/c at the end of the year.',
        ],
        hints: RET.H.death,
        distractorAccounts: ['profitAndLossAppropriation', 'profitAndLoss', executor(s.f.out)],
      }),
      verify: (q: JournalQuestion) => {
        const k = readDeathInYear(q.context ?? '');
        return k !== null && near(posted(q, 'profitAndLossSuspense', 'Dr'), k.profitShare) && near(posted(q, partnerCapital(k.g.out), 'Cr'), k.profitShare);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { f } = s;
        const avg = (s.past[0] + s.past[1] + s.last) / 3;
        const share = (v: number): number => (v * f.x) / f.total;
        return num(
          `What is ${f.out}'s share of the goodwill of the firm?`,
          s.goodwillShare,
          [
            [s.G, `Gave ${f.out} the whole goodwill of the firm.`],
            [share(avg), `Took ${f.out}'s share of the average profit and forgot the ${s.n} years' purchase.`],
            [share(s.last * s.n), "Valued goodwill on the last year's profit alone."],
            [s.G / 3, 'Took the share as one third because there are three partners; shares follow the profit-sharing ratio.'],
          ],
          [`Average net profit = (${inr(s.past[0])} + ${inr(s.past[1])} + ${inr(s.last)}) / 3 = ${inr(avg)}.`, `Goodwill = ${inr(avg)} x ${s.n} = ${inr(s.G)}.`, `${f.out}'s share = ${inr(s.G)} x ${fr(f.x, f.total)} = ${inr(s.goodwillShare)}.`],
          ["First value the goodwill of the whole firm, then take the deceased partner's share of it.", "Goodwill = average profit x years' purchase; share = goodwill x share in the old ratio."],
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readDeathInYear(q.context ?? '');
        return k !== null && near(q.answer / 100, k.G * k.g.x);
      },
    },
    {
      kind: 'journal',
      make: (s) => {
        const step = RET.stepGoodwill(s.f, s.g, s.G);
        return {
          prompt: `Pass the journal entry for ${s.f.out}'s share of goodwill.`,
          lines: step.lines,
          explanation: step.explanation,
          hints: RET.H.goodwill,
          distractorAccounts: ['goodwill', executor(s.f.out), 'profitAndLossSuspense'],
        };
      },
      verify: (q: JournalQuestion) => {
        const k = readDeathInYear(q.context ?? '');
        if (!k) return false;
        const out = k.G * k.g.x;
        return near(posted(q, partnerCapital(k.g.out), 'Cr'), out) && k.g.stay.every((nm, i) => near(posted(q, partnerCapital(nm), 'Dr'), (out * k.gain[i]) / sum(k.gain)));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { f } = s;
        const reserve = (s.R * f.x) / f.total;
        return num(
          `What amount is transferred to ${f.out}'s Executor's A/c?`,
          s.due,
          [
            [s.due + s.drawn * 2, `Added ${f.out}'s drawings instead of deducting them.`],
            [s.due - s.interest, 'Left out the interest on capital to the date of death.'],
            [s.due - s.interest + (s.K * s.r) / 100, 'Allowed interest on capital for the whole year instead of to the date of death.'],
            [s.due - s.goodwillShare, `Left out ${f.out}'s share of goodwill.`],
            [s.due - reserve, `Left out ${f.out}'s share of the General Reserve.`],
          ],
          [
            `Interest on capital = ${inr(s.K)} x ${s.r}/100 x ${s.m}/12 = ${inr(s.interest)}.`,
            `Amount due = ${RET.tally(s.K, [
              ['interest on capital', s.interest],
              ['share of profit', s.profitShare],
              ['share of goodwill', s.goodwillShare],
              ['share of the General Reserve', reserve],
              ['drawings', -s.drawn],
            ])} = ${inr(s.due)}.`,
            `${f.out}'s Capital A/c is closed by transfer to ${f.out}'s Executor's A/c.`,
          ],
          RET.H.executor,
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readDeathInYear(q.context ?? '');
        return k !== null && near(q.answer / 100, k.due);
      },
    },
  ],
});

/** A RET firm made from partners and the ratio they share in, with the partner who leaves. */
function firmFrom(names: readonly string[], ratio: readonly number[], out: number): RET.Firm {
  const keep = names.map((_, i) => i).filter((i) => i !== out);
  return { names: [...names], old: [...ratio], total: sum(ratio), out: names[out], x: ratio[out], stay: keep.map((i) => names[i]), stayOld: keep.map((i) => ratio[i]) };
}
/** A value from `lo` to `hi` that is a multiple of `unit`, the rounder (a multiple of 1000 x the unit, then 100, 10) first; null when none. */
function roundMultiple(rng: Rng, unit: number, lo: number, hi: number): number | null {
  for (const k of [10, 5, 2, 1]) {
    const v = RET.mult(rng, lcm(unit, 1000 * k), lo, hi);
    if (v !== null) return v;
  }
  return null;
}

// ===============================================================================================================
// 5. case-life-super-profit-twice: goodwill valued by super profit on an admission (the premium shared by the
//    sacrificing partners) and, two years later, by capitalising the super profit on the retirement of one of the old
//    partners, adjusted through the capital accounts (complex). What varies: the deal of the admission, who retires,
//    how the continuing partners take the share over, the figures of both valuations.
// ===============================================================================================================

interface SuperTwice {
  d: ADM.Deal;
  ce: number;
  rate: number;
  avg: number;
  n: number;
  sp: number;
  G1: number;
  credits: number[];
  f: RET.Firm;
  g: RET.Gain;
  ce2: number;
  rate2: number;
  avg2: number;
  sp2: number;
  G2: number;
}

function readSuperTwice(text: string) {
  const deal = ADM.readDeal(text);
  const ce = figure(text, 'Capital employed on admission');
  const rate = Number(/normal rate of return on admission: (\d+)%/i.exec(text)?.[1]);
  const avg = figure(text, 'Average profit on admission');
  const n = Number(/valued at ([\d.]+) years' purchase of the super profit/.exec(text)?.[1]);
  const ce2 = figure(text, 'Capital employed on retirement');
  const rate2 = Number(/normal rate of return on retirement: (\d+)%/i.exec(text)?.[1]);
  const avg2 = figure(text, 'Average profit on retirement');
  if (!deal) return null;
  const G1 = (avg - (ce * rate) / 100) * n;
  const G2 = ((avg2 - (ce2 * rate2) / 100) * 100) / rate2;
  const news = [...deal.shares.map((x, i) => x - deal.given[i]), deal.share];
  const out = /On 31 March \d{4}, ([A-Z][a-z]+) retires/.exec(text)?.[1] ?? '';
  const names = [...deal.olds, /, ([A-Z][a-z]+) is admitted|([A-Z][a-z]+) is admitted/.exec(text)?.slice(1).find((x) => x) ?? ''];
  return { deal, G1, G2, news, names, out };
}

const superTwice = caseTemplate<SuperTwice>({
  id: 'case-life-super-profit-twice',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Super profit on an admission and a retirement',
  setup: (rng) =>
    attempt(12, () => {
      const d = ADM.dealWhere(rng, ['old', 'old', 'equal', 'stated'], ADM.tidySac, 2);
      if (!d || d.sac === null) return null;
      const rate = rng.pick([10, 15, 20]);
      const ce = rng.step(400000, 1500000, 50000);
      const n = rng.pick([2, 3, 4, 2.5]);
      const normal = (ce * rate) / 100;
      const unit = unitFor([d.share, ...d.given]);
      // A super profit of a fifth to two-thirds of the normal profit, whose years' purchase splits into whole hundreds.
      const fits: number[] = [];
      for (let sp = Math.ceil((normal * 0.2) / 1000) * 1000; sp <= normal * 0.66; sp += 1000) if (Number.isInteger(sp * n) && (sp * n) % unit === 0) fits.push(sp);
      if (fits.length === 0) return null;
      const sp = rng.pick(fits);
      const G1 = sp * n;
      const credits = d.given.map((x) => ADM.of(G1, x));
      // Two years later one of the old partners retires.
      const out = rng.int(0, 1);
      const f = firmFrom(d.names, d.newRatio, out);
      const g = RET.gainOf(rng, f, ['silent', 'silent', 'split']);
      if (!g) return null;
      // The normal rate of return of the trade is the same two years later.
      const rate2 = rate;
      const need = 10000 / gcd(rate2, 100);
      const G2 = roundMultiple(rng, lcm(100 * f.total * sum(g.w), need), Math.max(80000, G1 * 0.9), G1 * 1.8);
      if (G2 === null || G2 === G1) return null;
      const sp2 = (G2 * rate2) / 100;
      const ce2 = rng.step(Math.max(500000, ce), ce + 600000, 50000);
      const avg2 = (ce2 * rate2) / 100 + sp2;
      return { d, ce, rate, avg: normal + sp, n, sp, G1, credits, f, g, ce2, rate2, avg2, sp2, G2 };
    }),
  context: (s) => {
    const { d, f } = s;
    return [
      `${d.open} Their capitals are fluctuating, and goodwill is never raised in the books.`,
      `${d.admit} ${d.how} ${d.nw} brings ${d.nw}'s share of goodwill as premium in cash.`,
      `Capital employed on admission: ${inr(s.ce)}; normal rate of return on admission: ${s.rate}%`,
      `Average profit on admission: ${inr(s.avg)}`,
      `On admission, goodwill is valued at ${s.n} years' purchase of the super profit.`,
      `On 31 March ${d.year + 2}, ${f.out} retires; ${s.g.text}. Goodwill is then valued by capitalising the super profit, and adjusted through the capital accounts.`,
      `Capital employed on retirement: ${inr(s.ce2)}; normal rate of return on retirement: ${s.rate2}%`,
      `Average profit on retirement: ${inr(s.avg2)}`,
    ].join('\n');
  },
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const normal = (s.ce * s.rate) / 100;
        return num(
          `At what amount is goodwill valued on ${s.d.nw}'s admission?`,
          s.G1,
          [
            [s.avg * s.n, `Took ${s.n} years' purchase of the average profit; the method uses the super profit, what is earned above the normal profit.`],
            [s.sp, `Stopped at the super profit and did not multiply it by ${s.n}.`],
            [normal * s.n, 'Took the normal profit for the super profit.'],
            [(s.sp * 100) / s.rate, `Capitalised the super profit, the method used on the retirement; on admission it is ${s.n} years' purchase.`],
          ],
          [
            `Normal profit = ${inr(s.ce)} x ${s.rate}/100 = ${inr(normal)}.`,
            `Super profit = ${inr(s.avg)} - ${inr(normal)} = ${inr(s.sp)}.`,
            `Goodwill = ${inr(s.sp)} x ${s.n} = ${inr(s.G1)}.`,
          ],
          ['Super profit is what the firm earns above the normal return on the capital employed.', "Goodwill = (average profit - capital employed x normal rate) x years' purchase."],
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readSuperTwice(q.context ?? '');
        return k !== null && near(q.answer / 100, k.G1);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { d } = s;
        const j = s.credits[0] > 0 ? 0 : 1;
        const premium = ADM.of(s.G1, d.share);
        return num(
          `How much of ${d.nw}'s premium is credited to ${d.olds[j]}'s Capital A/c?`,
          s.credits[j],
          [
            [premium, `Gave ${d.olds[j]} the whole premium.`],
            [(s.G1 * d.old[j]) / sum(d.old), `Gave ${d.olds[j]} a share of the whole goodwill, not of ${d.nw}'s premium.`],
            [(premium * d.old[j]) / sum(d.old), d.kind === 'old' ? 'Shared the premium equally.' : 'Shared the premium in the old ratio instead of the sacrificing ratio.'],
            [premium / 2, 'Shared the premium equally between the old partners.'],
          ],
          [`Premium = ${inr(s.G1)} x ${ADM.fs(d.share)} = ${inr(premium)}.`, ...ADM.givesSteps(d), ADM.sacStep(d), `${d.olds[j]} gets ${inr(premium)} x ${ADM.fs(d.parts[j])} = ${inr(s.credits[j])}.`],
          ADM.H.premium,
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readSuperTwice(q.context ?? '');
        const j = k ? k.deal.olds.indexOf(/credited to ([A-Z][a-z]+)'s Capital/.exec(q.prompt)?.[1] ?? '') : -1;
        return k !== null && j >= 0 && near(q.answer / 100, k.G1 * k.deal.given[j]);
      },
    },
    {
      kind: 'numeric',
      unit: 'ratio',
      make: (s) => {
        const { d } = s;
        const asOld = ADM.ratioOf([...d.oldShares.map((x) => ADM.times(x, ADM.minus(ADM.ONE, d.share))), d.share]);
        return ratioQ(
          `Find the new profit-sharing ratio of ${list(d.names)} on ${d.nw}'s admission.`,
          d.newRatio,
          [
            [[...d.old, 1], `Kept the old ratio and gave ${d.nw} one more term.`],
            [d.kind === 'old' ? [1, 1, 1] : asOld, d.kind === 'old' ? 'Shared the profit equally among the three.' : `Took ${d.nw}'s share in the old ratio, which is not what was agreed.`],
            [[d.newRatio[1], d.newRatio[0], d.newRatio[2]], 'Wrote the terms of the old partners against the wrong names.'],
            [[...d.sac!, d.share[0] * sum(d.sac!)], 'Gave the sacrificing ratio of the old partners as their new shares.'],
          ],
          [...ADM.givesSteps(d), ...ADM.newShareSteps(d)],
          ADM.H.newRatio,
        );
      },
      verify: (q: RatioQuestion) => {
        const k = readSuperTwice(q.context ?? '');
        return k !== null && ADM.sameRatio(q.answer, k.news);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const normal2 = (s.ce2 * s.rate2) / 100;
        return num(
          `At what amount is goodwill valued on ${s.f.out}'s retirement?`,
          s.G2,
          [
            [(s.avg2 * 100) / s.rate2, 'Capitalised the average profit and did not deduct the capital employed.'],
            [s.sp2 * s.n, `Took ${s.n} years' purchase of the super profit, the method of the admission; on the retirement the super profit is capitalised.`],
            [s.sp2, 'Stopped at the super profit and did not capitalise it.'],
            [s.G1, 'Used the value of goodwill on the admission, two years earlier.'],
          ],
          [
            `Normal profit = ${inr(s.ce2)} x ${s.rate2}/100 = ${inr(normal2)}.`,
            `Super profit = ${inr(s.avg2)} - ${inr(normal2)} = ${inr(s.sp2)}.`,
            `Goodwill = ${inr(s.sp2)} x 100/${s.rate2} = ${inr(s.G2)}.`,
          ],
          ['Find the super profit first, then the capital that would earn it at the normal rate.', 'Goodwill = super profit x 100 / normal rate of return.'],
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readSuperTwice(q.context ?? '');
        return k !== null && near(q.answer / 100, k.G2);
      },
    },
    {
      kind: 'journal',
      make: (s) => {
        const step = RET.stepGoodwill(s.f, s.g, s.G2);
        return {
          prompt: `Pass the journal entry for ${s.f.out}'s share of goodwill on retirement.`,
          lines: step.lines,
          explanation: [`On 31 March ${s.d.year + 2} the partners share ${inRatio(s.f.old)}, the ratio fixed on ${s.d.nw}'s admission.`, ...step.explanation],
          hints: RET.H.goodwill,
          distractorAccounts: ['goodwill', 'premiumForGoodwill', partnerLoan(s.f.out)],
        };
      },
      verify: (q: JournalQuestion) => {
        const k = readSuperTwice(q.context ?? '');
        if (!k) return false;
        const o = k.names.indexOf(k.out);
        const outShare = k.G2 * k.news[o];
        const stay = k.names.filter((_, i) => i !== o);
        const stayShare = k.news.filter((_, i) => i !== o);
        const split = /take over [A-Z][a-z]+'s share (?:equally|in the ratio (\d+):(\d+))/.exec(q.context ?? '');
        const w = split ? (split[1] ? [Number(split[1]), Number(split[2])] : [1, 1]) : stayShare;
        return o >= 0 && near(posted(q, partnerCapital(k.out), 'Cr'), outShare) && stay.every((nm, i) => near(posted(q, partnerCapital(nm), 'Dr'), (outShare * w[i]) / sum(w)));
      },
    },
  ],
});

// ===============================================================================================================
// 6. case-life-admission-then-dissolution: goodwill valued on the profits of three years, a partner admitted with
//    capital and a premium, and a year later the firm dissolved at a loss on realisation, shared in the new ratio,
//    with an old partner's loan repaid after the outside liabilities (complex). What varies: the deal, the partner
//    with the loan, the partner asked about, the figures.
// ===============================================================================================================

interface AdmitDissolve {
  d: ADM.Deal;
  caps: number[];
  profits: number[];
  n: number;
  G: number;
  credits: number[];
  K: number;
  lender: number;
  loan: number;
  L: number;
  /** Capitals after the admission, and what each partner is finally paid. */
  after: number[];
  finals: number[];
  ask: number;
}

function readAdmitDissolve(text: string) {
  const deal = ADM.readDeal(text);
  if (!deal) return null;
  const nw = /([A-Z][a-z]+) brings ₹[\d,]+ as capital/.exec(text)?.[1] ?? '';
  const names = [...deal.olds, nw];
  const capsLine = lineOf(text, 'Capitals on');
  const caps = deal.olds.map((nm) => amountOf(capsLine, nm));
  const profits = amountsIn(lineOf(text, 'Net profits of the last three years'));
  const n = Number(/valued at ([\d.]+) years' purchase/.exec(text)?.[1]);
  const G = (sum(profits) / 3) * n;
  const K = amountsIn(/brings (₹[\d,]+) as capital/.exec(text)?.[1] ?? '')[0];
  const L = figure(text, 'Realisation A/c, in which the creditors had been paid');

  const news = [...deal.shares.map((x, i) => x - deal.given[i]), deal.share];
  const after = [...caps.map((c, i) => c + G * deal.given[i]), K];
  return { names, news, G, after, finals: after.map((a, i) => a - L * news[i]), L };
}

const admitThenDissolve = caseTemplate<AdmitDissolve>({
  id: 'case-life-admission-then-dissolution',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'A new partner, then the end of the firm',
  setup: (rng) =>
    attempt(12, () => {
      const d = ADM.dealWhere(rng, ['old', 'old', 'equal', 'stated', 'one'], ADM.tidySac, 2);
      if (!d) return null;
      const base = rng.pick([50000, 100000]);
      const caps = rng.shuffle(rng.pick(P.CAPS2)).map((u) => u * base);
      const n = rng.pick([2, 3, 2, 1.5]);
      const unit = unitFor([d.share, ...d.given.filter(ADM.isPos)]);
      const fits: number[] = [];
      for (let a = Math.max(50000, Math.ceil(sum(caps) / 10000) * 1000); a <= Math.min(300000, 0.35 * sum(caps) + 30000); a += 1000) if (Number.isInteger(a * n) && (a * n) % unit === 0) fits.push(a);
      if (fits.length === 0) return null;
      const avg = rng.pick(fits);
      const G = avg * n;
      // Three profits that average `avg`: two drawn near it, the third what is left.
      const p1 = rng.step(Math.round(avg * 0.8 / 1000) * 1000, Math.round(avg * 1.1 / 1000) * 1000, 1000);
      const p2 = rng.step(Math.round(avg * 0.8 / 1000) * 1000, Math.round(avg * 1.2 / 1000) * 1000, 1000);
      const p3 = 3 * avg - p1 - p2;
      if (p3 < avg * 0.7 || p3 > avg * 1.35 || new Set([p1, p2, p3]).size < 3) return null;
      const credits = d.given.map((x) => ADM.of(G, x));
      // The new partner's capital is in keeping with the share bought.
      const fair = (sum(caps) * d.share[0]) / (d.share[1] - d.share[0]);
      const K = Math.max(50000, Math.round((fair * rng.int(80, 120)) / 100 / 10000) * 10000);
      const lender = rng.int(0, 1);
      const loan = rng.step(20000, 80000, 10000);
      const after = [...caps.map((c, i) => c + credits[i]), K];
      const T = sum(d.newRatio);
      const L = RET.mult(rng, T * 1000, 0.1 * sum(after), 0.35 * sum(after));
      if (L === null) return null;
      const finals = after.map((a, i) => a - (L * d.newRatio[i]) / T);
      if (finals.some((x) => x < 10000)) return null;
      return { d, caps, profits: [p1, p2, p3], n, G, credits, K, lender, loan, L, after, finals, ask: rng.int(0, 2) };
    }),
  context: (s) => {
    const { d } = s;
    const y = d.year;
    return [
      `${d.open} Their capitals are fluctuating, and goodwill is never raised in the books.`,
      `Capitals on 31 March ${y}: ${each(d.olds, s.caps)}`,
      `Net profits of the last three years: ${s.profits.map((p, k) => `${inr(p)} (${yearEnded(y - 2 + k)})`).join(', ')}`,
      `${d.admit} ${d.how}`,
      `${d.nw} brings ${inr(s.K)} as capital and ${d.nw}'s share of goodwill as premium, both in cash; the premium is kept in the business. The goodwill of the firm is valued at ${s.n} years' purchase of the average profit of the last three years.`,
      `The new firm did not last: it was dissolved on 31 March ${y + 1}. In that year each partner withdrew exactly the profit credited, so the capitals stood as they did just after ${d.nw}'s admission.`,
      `${d.olds[s.lender]}'s loan to the firm of ${inr(s.loan)} was outstanding on that date.`,
      `Realisation A/c, in which the creditors had been paid, showed a loss of ${inr(s.L)}. Every receipt and payment was by cheque.`,
    ].join('\n');
  },
  parts: [
    {
      kind: 'numeric',
      unit: 'ratio',
      make: (s) => {
        const { d } = s;
        const asOld = ADM.ratioOf([...d.oldShares.map((x) => ADM.times(x, ADM.minus(ADM.ONE, d.share))), d.share]);
        return ratioQ(
          `Find the new profit-sharing ratio of ${list(d.names)}.`,
          d.newRatio,
          [
            [[...d.old, 1], `Kept the old ratio and gave ${d.nw} one more term.`],
            [d.kind === 'old' ? [1, 1, 1] : asOld, d.kind === 'old' ? 'Shared the profit equally among the three.' : `Took ${d.nw}'s share in the old ratio, which is not what was agreed.`],
            [[d.newRatio[1], d.newRatio[0], d.newRatio[2]], 'Wrote the terms of the old partners against the wrong names.'],
          ],
          [...ADM.givesSteps(d), ...ADM.newShareSteps(d)],
          ADM.H.newRatio,
        );
      },
      verify: (q: RatioQuestion) => {
        const k = readAdmitDissolve(q.context ?? '');
        return k !== null && ADM.sameRatio(q.answer, k.news);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { d } = s;
        const j = s.credits[0] > 0 ? 0 : 1;
        const avg = sum(s.profits) / 3;
        const premium = ADM.of(s.G, d.share);
        return num(
          `How much of ${d.nw}'s premium is credited to ${d.olds[j]}'s Capital A/c?`,
          s.credits[j],
          [
            [premium, `Gave ${d.olds[j]} the whole premium.`],
            [ADM.of(avg, d.share) * (s.credits[j] / premium), `Worked on the average profit and forgot the ${s.n} years' purchase.`],
            [(s.G * d.old[j]) / sum(d.old), `Gave ${d.olds[j]} a share of the whole goodwill, not of ${d.nw}'s premium.`],
            [(premium * d.newRatio[j]) / sum(d.newRatio), 'Shared the premium in the new ratio; it goes to the partners who sacrifice, in the sacrificing ratio.'],
          ],
          [
            `Average profit = (${s.profits.map(inr).join(' + ')}) / 3 = ${inr(avg)}; goodwill = ${inr(avg)} x ${s.n} = ${inr(s.G)}.`,
            `Premium = ${inr(s.G)} x ${ADM.fs(d.share)} = ${inr(premium)}.`,
            ...ADM.givesSteps(d),
            ADM.sacStep(d),
            `${d.olds[j]} gets ${inr(premium)} x ${ADM.fs(d.parts[j])} = ${inr(s.credits[j])}.`,
          ],
          ADM.H.premium,
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readAdmitDissolve(q.context ?? '');
        const j = k ? k.names.indexOf(/credited to ([A-Z][a-z]+)'s Capital/.exec(q.prompt)?.[1] ?? '') : -1;
        return k !== null && j >= 0 && near(q.answer / 100, k.after[j] - amountOf(lineOf(q.context ?? '', 'Capitals on'), k.names[j]));
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const lender = s.d.olds[s.lender];
        return choice(
          'The money realised is paid out in which order?',
          `The creditors, then ${lender}'s loan, then the balances of the partners' capital accounts`,
          [
            [`${lender}'s loan, then the creditors, then the balances of the partners' capital accounts`, `Put the partner's loan before the outside liabilities; outsiders are paid first (Section 48).`],
            [`The creditors and ${lender}'s loan together in proportion, then the capital accounts`, "Ranked a partner's loan with the debts to outsiders; it is paid only after them."],
            [`The creditors, then the balances of the capital accounts, ${lender}'s loan included in ${lender}'s capital`, "Added the partner's loan to the capital; a loan is repaid before any capital and is never shared out."],
            [`The balances of the capital accounts, then ${lender}'s loan, then the creditors`, 'Turned the order round: the partners, as owners, are paid last.'],
          ],
          `Section 48 of the Indian Partnership Act, 1932: the debts to outsiders are paid first, then each partner's loan (apart from capital), then the capitals. ${lender}'s loan never goes to Realisation A/c; it is repaid by itself after the creditors.`,
          ['Who is an outsider, who is a partner lending money, and who is a partner as owner?', 'Outsiders first, then partners\' loans, then capitals.'],
        );
      },
      verify: (q: McqQuestion) => {
        const lender = /([A-Z][a-z]+)'s loan to the firm/.exec(q.context ?? '')?.[1] ?? '';
        return lender !== '' && optionText(q).startsWith(`The creditors, then ${lender}'s loan, then`);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { d } = s;
        const T = sum(d.newRatio);
        const i = s.ask;
        const nm = d.names[i];
        const share = (s.L * d.newRatio[i]) / T;
        return num(
          `What is ${nm}'s share of the loss on realisation?`,
          share,
          [
            [s.L / 3, 'Shared the loss equally; it is shared in the profit-sharing ratio of the firm that is dissolved.'],
            ...(i < 2 ? ([[(s.L * d.old[i]) / sum(d.old), `Shared the loss in the old ratio of ${list(d.olds)}, as if ${d.nw} had never come in.`]] as Errs) : []),
            [(s.L * s.after[i]) / sum(s.after), 'Shared the loss in the ratio of the capitals.'],
            [s.L, 'Gave the whole loss.'],
            [(s.L * d.newRatio[(i + 1) % 3]) / T, `Used ${d.names[(i + 1) % 3]}'s term of the new ratio.`],
          ],
          [`The loss is shared in the new ratio ${rt(d.newRatio)}: ${nm} bears ${inr(s.L)} x ${fr(d.newRatio[i], T)} = ${inr(share)}.`],
          ['Which ratio is the firm using on the day it is dissolved?', 'A profit or loss on realisation is shared in the profit-sharing ratio of the partners at the time.'],
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readAdmitDissolve(q.context ?? '');
        const i = k ? k.names.indexOf(/What is ([A-Z][a-z]+)'s share of the loss/.exec(q.prompt)?.[1] ?? '') : -1;
        return k !== null && i >= 0 && near(q.answer / 100, k.L * k.news[i]);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { d } = s;
        const T = sum(d.newRatio);
        const i = (s.ask + 1) % 3;
        const nm = d.names[i];
        const share = (s.L * d.newRatio[i]) / T;
        const right = s.finals[i];
        return num(
          `How much is finally paid to ${nm} to close ${nm}'s capital account?`,
          right,
          [
            [right + share, `Did not debit ${nm} with ${nm}'s share of the loss on realisation.`],
            ...(i < 2 && s.credits[i] > 0 ? ([[right - s.credits[i], `Left out ${nm}'s part of the premium, which stays in ${nm}'s capital.`]] as Errs) : []),
            ...(i === s.lender ? ([[right + s.loan, `Added ${nm}'s loan to the capital; the loan is repaid by itself, before the capitals.`]] as Errs) : []),
            [s.after[i] - s.L / 3, 'Shared the loss on realisation equally.'],
            [s.after[i] - s.L, 'Debited the whole loss on realisation to one partner.'],

            ...(i < 2 ? ([[s.after[i] - (s.L * d.old[i]) / sum(d.old), `Shared the loss in the old ratio of ${list(d.olds)}.`]] as Errs) : []),
          ],
          [
            i < 2
              ? `${nm}'s capital after the admission = ${inr(s.caps[i])}${s.credits[i] > 0 ? ` + share of the premium ${inr(s.credits[i])}` : ''} = ${inr(s.after[i])}.`
              : `${nm}'s capital is what ${nm} brought in, ${inr(s.K)}; the premium went to the partners who sacrificed.`,
            `Share of the loss on realisation = ${inr(s.L)} x ${fr(d.newRatio[i], T)} = ${inr(share)}.`,
            `Final payment = ${inr(s.after[i])} - ${inr(share)} = ${inr(right)}.${i === s.lender ? ` ${nm}'s loan of ${inr(s.loan)} is repaid separately, before this.` : ''}`,
          ],
          ["Start from the capital after the admission and debit the share of the loss.", "A partner's loan is repaid on its own, before the capitals are settled."],
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readAdmitDissolve(q.context ?? '');
        const i = k ? k.names.indexOf(/finally paid to ([A-Z][a-z]+) to close/.exec(q.prompt)?.[1] ?? '') : -1;
        return k !== null && i >= 0 && near(q.answer / 100, k.finals[i]);
      },
    },
  ],
});

// ===============================================================================================================
// 7. case-life-guarantee-on-admission: goodwill valued by capitalising the average profit, a partner admitted with a
//    premium and a minimum share of profit guaranteed by the old partners (or one of them), then the first year's
//    profit and the deficiency (complex). What varies: the deal, who gives the guarantee and in what ratio.
// ===============================================================================================================

interface GuaranteeAdmission {
  d: ADM.Deal;
  ce: number;
  rate: number;
  avg: number;
  G: number;
  credits: number[];
  /** Who bears a deficiency: both old partners in their old ratio, both in a stated ratio, or one of them. */
  by: 'old' | 'stated' | 'one';
  bear: number[];
  M: number;
  P: number;
  gap: number;
  borne: number[];
}

function readGuaranteeAdmission(text: string) {
  const deal = ADM.readDeal(text);
  if (!deal) return null;
  const ce = figure(text, 'Net assets (capital employed)');
  const rate = Number(/normal rate of return: (\d+)%/.exec(text)?.[1]);
  const avg = figure(text, 'Average profit');
  const G = (avg * 100) / rate - ce;
  const M = amountsIn(/not be less than (₹[\d,]+)/.exec(text)?.[1] ?? '')[0];
  const P = figure(text, 'Profit for the year ended');
  const gline = lineOf(text, / guaranteed that /);
  const one = /^([A-Z][a-z]+) has personally guaranteed/.exec(gline)?.[1];
  const stated = /borne by them in the ratio (\d+):(\d+)/.exec(gline);
  const bear = one ? deal.olds.map((nm) => (nm === one ? 1 : 0)) : stated ? [Number(stated[1]), Number(stated[2])] : deal.old;
  const gap = M - P * deal.share;
  return { deal, G, gap, borne: bear.map((b) => (gap * b) / sum(bear)) };
}

const guaranteeOnAdmission = caseTemplate<GuaranteeAdmission>({
  id: 'case-life-guarantee-on-admission',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'A new partner with a guaranteed share',
  setup: (rng) =>
    attempt(12, () => {
      const d = ADM.dealWhere(rng, ['old', 'old', 'equal', 'stated'], ADM.tidySac, 2);
      if (!d || d.sac === null) return null;
      const rate = rng.pick([10, 12, 15, 20]);
      const G = ADM.amountFor(rng, 60000, 480000, [d.share, ...d.given]);
      if (G === null) return null;
      // Net assets and an average profit whose capitalised value exceeds them by the goodwill.
      const ce = rng.step(300000, 1200000, 50000);
      const avg = ((G + ce) * rate) / 100;
      if (!Number.isInteger(avg) || avg % 100 !== 0) return null;
      const credits = d.given.map((x) => ADM.of(G, x));
      const by = rng.pick(['old', 'old', 'stated', 'one'] as const);
      const bear = by === 'old' ? [...d.old] : by === 'stated' ? rng.pick([[1, 1], [2, 1], [1, 2], [3, 2], [2, 3]].filter((r) => !sameTerms(lowestTerms(r), lowestTerms(d.old)))) : rng.int(0, 1) === 0 ? [1, 0] : [0, 1];
      const T = sum(d.newRatio);
      // The first year's profit leaves the new partner a little short of the guarantee.
      const P = RET.mult(rng, T * 1000, Math.max(80000, avg * 0.6), avg * 1.1);
      if (P === null) return null;
      const own = ADM.of(P, d.share);
      const unit = 1000 * sum(bear);
      const gap = unit * rng.int(1, Math.max(1, Math.floor((own * 0.4) / unit)));
      const M = own + gap;
      if (gap > own * 0.4 || M % 100 !== 0 || !Number.isInteger(own)) return null;
      const borne = bear.map((b) => (gap * b) / sum(bear));
      if (borne.some((b, i) => b * 2 > ADM.of(P, d.news[i]))) return null;
      return { d, ce, rate, avg, G, credits, by, bear, M, P, gap, borne };
    }),
  context: (s) => {
    const { d } = s;
    const promise = `that ${d.nw}'s share of profit will not be less than ${inr(s.M)} in any year`;
    const guarantee =
      s.by === 'one'
        ? `${d.olds[s.bear[0] > 0 ? 0 : 1]} has personally guaranteed ${promise}.`
        : `${list(d.olds)} have guaranteed ${promise}; any deficiency is borne by them ${s.by === 'old' ? `in their old ratio, ${rt(d.old)}` : `in the ratio ${rt(s.bear)}`}.`;
    return [
      `${d.open} Their capitals are fluctuating, and goodwill is never raised in the books. The deed allows no interest on capital and no salary.`,
      `${d.admit} ${d.how} ${d.nw} brings ${d.nw}'s share of goodwill as premium in cash.`,
      `Goodwill is valued by capitalising the average profit at the normal rate of return: ${s.rate}%`,
      `Average profit: ${inr(s.avg)}`,
      `Net assets (capital employed): ${inr(s.ce)}`,
      guarantee,
      `Profit for the year ended 31 March ${d.year + 1}: ${inr(s.P)}, shared in the new ratio. A deficiency is then made good by an entry between the partners' capital accounts.`,
    ].join('\n');
  },
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const capitalised = (s.avg * 100) / s.rate;
        return num(
          'At what amount is the goodwill of the firm valued?',
          s.G,
          [
            [capitalised, 'Capitalised the average profit and did not deduct the net assets.'],
            [s.ce, 'Gave the net assets instead of the goodwill.'],
            [s.avg - (s.ce * s.rate) / 100, 'Stopped at the super profit and did not capitalise it.'],
            [s.avg * 2, "Took two years' purchase of the average profit; the method here capitalises it."],
          ],
          [
            `Capitalised value = ${inr(s.avg)} x 100/${s.rate} = ${inr(capitalised)}.`,
            `Goodwill = ${inr(capitalised)} - net assets ${inr(s.ce)} = ${inr(s.G)}.`,
          ],
          ['What capital would earn the average profit at the normal rate?', 'Goodwill = average profit x 100 / normal rate - net assets.'],
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readGuaranteeAdmission(q.context ?? '');
        return k !== null && near(q.answer / 100, k.G);
      },
    },
    {
      kind: 'numeric',
      unit: 'ratio',
      make: (s) => {
        const { d } = s;
        const asOld = ADM.ratioOf([...d.oldShares.map((x) => ADM.times(x, ADM.minus(ADM.ONE, d.share))), d.share]);
        return ratioQ(
          `Find the new profit-sharing ratio of ${list(d.names)}.`,
          d.newRatio,
          [
            [[...d.old, 1], `Kept the old ratio and gave ${d.nw} one more term.`],
            [d.kind === 'old' ? [1, 1, 1] : asOld, d.kind === 'old' ? 'Shared the profit equally among the three.' : `Took ${d.nw}'s share in the old ratio, which is not what was agreed.`],
            [[d.newRatio[1], d.newRatio[0], d.newRatio[2]], 'Wrote the terms of the old partners against the wrong names.'],
          ],
          [...ADM.givesSteps(d), ...ADM.newShareSteps(d)],
          ADM.H.newRatio,
        );
      },
      verify: (q: RatioQuestion) => {
        const k = readGuaranteeAdmission(q.context ?? '');
        return k !== null && ADM.sameRatio(q.answer, [...k.deal.shares.map((x, i) => x - k.deal.given[i]), k.deal.share]);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { d } = s;
        const j = s.credits[0] >= s.credits[1] ? 0 : 1;
        const premium = ADM.of(s.G, d.share);
        return num(
          `How much of ${d.nw}'s premium is credited to ${d.olds[j]}'s Capital A/c?`,
          s.credits[j],
          [
            [premium, `Gave ${d.olds[j]} the whole premium.`],
            [(s.G * d.old[j]) / sum(d.old), `Gave ${d.olds[j]} a share of the whole goodwill, not of ${d.nw}'s premium.`],
            [(premium * d.newRatio[j]) / sum(d.newRatio), 'Shared the premium in the new ratio; it goes to the sacrificing partners in the sacrificing ratio.'],
            [ADM.of((s.avg * 100) / s.rate, d.share) * d.parts[j][0] / d.parts[j][1], 'Worked the premium on the capitalised value without deducting the net assets.'],
          ],
          [`Premium = ${inr(s.G)} x ${ADM.fs(d.share)} = ${inr(premium)}.`, ...ADM.givesSteps(d), ADM.sacStep(d), `${d.olds[j]} gets ${inr(premium)} x ${ADM.fs(d.parts[j])} = ${inr(s.credits[j])}.`],
          ADM.H.premium,
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readGuaranteeAdmission(q.context ?? '');
        const j = k ? k.deal.olds.indexOf(/credited to ([A-Z][a-z]+)'s Capital/.exec(q.prompt)?.[1] ?? '') : -1;
        return k !== null && j >= 0 && near(q.answer / 100, k.G * k.deal.given[j]);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { d } = s;
        const own = ADM.of(s.P, d.share);
        return num(
          `By how much does ${d.nw}'s share of the profit for the year fall short of the guarantee?`,
          s.gap,
          [
            [s.M, 'Gave the guaranteed amount itself, not the shortfall.'],
            [own, `Gave ${d.nw}'s share of profit, not the shortfall.`],
            [s.M - s.P / 3, `Took ${d.nw}'s share as one third of the profit; it is ${ADM.fs(d.share)}.`],
            [s.M - ADM.of(s.P, d.share) - s.borne[0], 'Took off what one partner bears as well.'],
          ],
          [`${d.nw}'s share = ${inr(s.P)} x ${ADM.fs(d.share)} = ${inr(own)}.`, `Shortfall = ${inr(s.M)} - ${inr(own)} = ${inr(s.gap)}.`],
          P.H.guarantee,
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readGuaranteeAdmission(q.context ?? '');
        return k !== null && near(q.answer / 100, k.gap);
      },
    },
    {
      kind: 'journal',
      make: (s) => {
        const { d } = s;
        const how = s.by === 'one' ? `${d.olds[s.bear[0] > 0 ? 0 : 1]} alone gave the guarantee, so ${d.olds[s.bear[0] > 0 ? 0 : 1]} bears the whole ${inr(s.gap)}.` : `${list(d.olds)} bear it ${s.by === 'old' ? `in their old ratio, ${rt(d.old)}` : `in the ratio ${rt(s.bear)}`}: ${eachAnd(d.olds, s.borne)}.`;
        return {
          prompt: `Pass the journal entry that makes good the deficiency in ${d.nw}'s share for the year.`,
          lines: [...d.olds.flatMap((nm, i) => (s.borne[i] > 0 ? [dr(partnerCapital(nm), s.borne[i])] : [])), cr(partnerCapital(d.nw), s.gap)],
          explanation: [`Deficiency = ${inr(s.M)} - ${inr(ADM.of(s.P, d.share))} = ${inr(s.gap)}.`, how, `The partners who bear it are debited and ${d.nw}'s Capital A/c is credited, so that ${d.nw} gets ${inr(s.M)} in all.`],
          hints: P.H.guarantee,
          distractorAccounts: ['profitAndLossAppropriation', 'premiumForGoodwill', 'goodwill'],
        };
      },
      verify: (q: JournalQuestion) => {
        const k = readGuaranteeAdmission(q.context ?? '');
        const nw = /pass the journal entry that makes good the deficiency in ([A-Z][a-z]+)'s/i.exec(q.prompt)?.[1] ?? '';
        return k !== null && near(posted(q, partnerCapital(nw), 'Cr'), k.gap) && k.deal.olds.every((nm, i) => near(posted(q, partnerCapital(nm), 'Dr'), k.borne[i]));
      },
    },
  ],
});

// ===============================================================================================================
// 8. case-life-change-then-retirement: partners change their ratio (goodwill adjusted), and a year later one of them
//    retires, goodwill being valued on the profits of three years: the gaining ratio, the share of goodwill and the
//    result of revaluation all follow the ratio after the change, which is what the case tests (complex). What varies: the change, who retires, a silent or an agreed new
//    ratio, the figures.
// ===============================================================================================================

interface ChangeRetire {
  f: RET.Firm;
  ch: CPR.Change;
  g: RET.Gain;
  firm: string;
  y: number;
  G1: number;
  /** The profits of the three years to the retirement, the years' purchase and the goodwill they give. */
  profits: number[];
  n: number;
  G2: number;
  V: number;
}

function readChangeRetire(text: string) {
  const first = text.split('\n')[0];
  const names = (/^(.+?) are partners/.exec(first)?.[1] ?? '').split(/, | and /);
  const before = ratioFrom(/Until .*? they shared profits and losses (equally|in the ratio [\d:]+)/.exec(first)?.[1] ?? '', names.length);
  const after = ratioFrom(/they agreed to share them (equally|in the ratio [\d:]+)/.exec(first)?.[1] ?? '', names.length);
  const out = /([A-Z][a-z]+) retires on/.exec(text)?.[1] ?? '';
  if (!before || !after || !names.includes(out)) return null;
  const o = names.indexOf(out);
  const ns = shares(after);
  const g = { names, share: ns, out, x: ns[o], stay: names.filter((_, i) => i !== o), stayShare: ns.filter((_, i) => i !== o) };
  const gain = RET.readGain(text, g);
  const n = Number(/goodwill is valued at ([\d.]+) years' purchase/.exec(text)?.[1]);
  const G2 = (sum(amountsIn(lineOf(text, 'Net profits of the last three years'))) / 3) * n;
  return { names, old: shares(before), neu: ns, o, out, gain, x: ns[o], G1: figure(text, 'Goodwill on the change'), G2 };
}

const changeThenRetirement = caseTemplate<ChangeRetire>({
  id: 'case-life-change-then-retirement',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'A new ratio, then a partner retires',
  setup: (rng) =>
    attempt(14, () => {
      const ch = rng.pick(CPR.THREE.filter((c) => c.L <= 30));
      const names = P.partners(rng, 3);
      const out = rng.int(0, 2);
      const f = firmFrom(names, ch.neu, out);
      // The retiring partner's share moved on the change, so that the old ratio would give another answer.
      if (ch.d[out] === 0) return null;
      const g = RET.gainOf(rng, f, ['silent', 'silent', 'agreed']);
      if (!g) return null;
      const G1 = CPR.pickAmount(rng, 60000, 480000, (v) => ch.d.every((x) => (v * Math.abs(x)) % (ch.L * 100) === 0));
      // A year later goodwill is valued on the profits of three years, and is somewhat higher.
      const valued = G1 === null ? null : profitsFor(rng, 100 * f.total * sum(g.w), G1 * 1.1, G1 * 1.6);
      const V = (rng.int(0, 2) > 0 ? 1 : -1) * (RET.mult(rng, f.total * 1000, 12000, 90000) ?? 0);
      if (G1 === null || valued === null || V === 0) return null;
      return { f, ch, g, firm: FIRM_OF(rng), y: rng.pick([2024, 2025, 2026]), G1, profits: valued.profits, n: valued.n, G2: valued.G, V };
    }),
  context: (s) => {
    const { f, ch, y } = s;
    return [
      `${list(f.names)} are partners in ${s.firm}. Until 31 March ${y - 1} they shared profits and losses ${inRatio(ch.old)}; from 1 April ${y - 1} they agreed to share them ${inRatio(ch.neu)}. Their capitals are fluctuating, and goodwill is never raised in the books: it is adjusted through the capital accounts.`,
      `Goodwill on the change of ratio, 1 April ${y - 1}: ${inr(s.G1)}`,
      `${f.out} retires on 31 March ${y}; ${s.g.text}.`,
      `Net profits of the last three years: ${threeYears(s.profits, y)}`,
      `On the retirement, goodwill is valued at ${s.n} years' purchase of the average profit of the last three years.`,
      `Revaluation on the retirement shows a ${s.V > 0 ? 'profit' : 'loss'} of ${inr(Math.abs(s.V))}.`,
    ].join('\n');
  },
  parts: [
    {
      kind: 'journal',
      make: (s) => {
        const { f, ch } = s;
        return {
          prompt: `Pass the journal entry for goodwill on the change of ratio on 1 April ${s.y - 1}.`,
          lines: CPR.compensation(ch, f.names, s.G1, false),
          explanation: [
            ...CPR.movesText(ch, f.names),
            ...[...ch.gain, ...ch.sac].map((i) => `${f.names[i]}: ${inr(s.G1)} x ${CPR.frac(Math.abs(ch.d[i]), ch.L)} = ${inr(CPR.moved(s.G1, ch, i))}.`),
            `The partners who gain are debited and the partners who sacrifice are credited. No Goodwill A/c is opened.`,
          ],
          hints: CPR.H.goodwill,
          distractorAccounts: ['goodwill', 'premiumForGoodwill', 'revaluation'],
        };
      },
      verify: (q: JournalQuestion) => {
        const k = readChangeRetire(q.context ?? '');
        return k !== null && k.names.every((nm, i) => near(posted(q, partnerCapital(nm), 'Cr') - posted(q, partnerCapital(nm), 'Dr'), k.G1 * (k.old[i] - k.neu[i])));
      },
    },
    {
      kind: 'numeric',
      unit: 'ratio',
      make: (s) => {
        const { f, ch, g } = s;
        const o = f.names.indexOf(f.out);
        const keep = f.names.map((_, i) => i).filter((i) => i !== o);
        const beforeStay = keep.map((i) => ch.old[i]);
        return ratioQ(
          `In what ratio do ${list(f.stay)} gain on ${f.out}'s retirement?`,
          g.w,
          [
            [beforeStay, `Used the ratio before the change, ${rt(ch.old)}; on the day of the retirement the partners share ${inRatio(ch.neu)}.`],
            [[1, 1], `Took ${list(f.stay)} to gain equally.`],
            [g.fresh.length === 2 && !sameTerms(lowestTerms(g.fresh), lowestTerms(g.w)) ? g.fresh : null, 'Gave the new ratio of the continuing partners instead of what each gains.'],
            [[...g.w].reverse(), 'Wrote the terms against the wrong names.'],
          ],
          [`On 31 March ${s.y} the partners share ${inRatio(ch.neu)}: the ratio after the change.`, `${g.why}.`],
          RET.H.ratio,
        );
      },
      verify: (q: RatioQuestion) => {
        const k = readChangeRetire(q.context ?? '');
        return k !== null && k.gain !== null && ADM.sameRatio(q.answer, k.gain);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { f, ch } = s;
        const o = f.names.indexOf(f.out);
        const share = (s.G2 * f.x) / f.total;
        return num(
          `What is ${f.out}'s share of goodwill on retirement?`,
          share,
          [
            [(s.G2 * ch.old[o]) / ch.so, `Used ${f.out}'s share before the change of ratio, ${fr(ch.old[o], ch.so)}.`],
            [(s.G1 * f.x) / f.total, 'Used the goodwill of the change of ratio, a year earlier.'],
            [s.G2 / 3, 'Took one third of the goodwill because there are three partners.'],
            [s.G2, 'Gave the whole goodwill of the firm.'],
            [share / s.n, `Worked on the average profit and forgot the ${s.n} years' purchase.`],
          ],
          [
            `Average profit = (${s.profits.map(inr).join(' + ')}) / 3 = ${inr(s.G2 / s.n)}; goodwill = ${inr(s.G2 / s.n)} x ${s.n} = ${inr(s.G2)}.`,
            `${f.out}'s share on 31 March ${s.y} is ${fr(f.x, f.total)}, the share since the change of ratio.`,
            `Share of goodwill = ${inr(s.G2)} x ${fr(f.x, f.total)} = ${inr(share)}.`,
          ],
          RET.H.goodwill,
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readChangeRetire(q.context ?? '');
        return k !== null && near(q.answer / 100, k.G2 * k.x);
      },
    },
    {
      kind: 'journal',
      make: (s) => {
        const step = RET.stepGoodwill(s.f, s.g, s.G2);
        return {
          prompt: `Pass the journal entry for ${s.f.out}'s share of goodwill on retirement.`,
          lines: step.lines,
          explanation: step.explanation,
          hints: RET.H.goodwill,
          distractorAccounts: ['goodwill', 'premiumForGoodwill', partnerLoan(s.f.out)],
        };
      },
      verify: (q: JournalQuestion) => {
        const k = readChangeRetire(q.context ?? '');
        if (!k || !k.gain) return false;
        const out = k.G2 * k.x;
        const gain = k.gain;
        return near(posted(q, partnerCapital(k.out), 'Cr'), out) && k.names.filter((_, i) => i !== k.o).every((nm, i) => near(posted(q, partnerCapital(nm), 'Dr'), (out * gain[i]) / sum(gain)));
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const { f, ch, g } = s;
        return choice(
          `In what ratio is the ${s.V > 0 ? 'profit' : 'loss'} on revaluation on ${f.out}'s retirement shared?`,
          `${rt(ch.neu)} among ${list(f.names)}`,
          [
            [`${rt(ch.old)} among ${list(f.names)}`, `Went back to the ratio before the change; by the retirement the partners share ${inRatio(ch.neu)}.`],
            [`${rt(g.fresh)} between ${list(f.stay)}`, `Left ${f.out} out; the values changed while ${f.out} was a partner, so ${f.out} shares the result.`],
            [`${rt(g.w)} between ${list(f.stay)}`, 'Used the gaining ratio, which is for goodwill only.'],
            ...(ch.neu.every((t) => t === ch.neu[0]) ? [] : ([[`Equally among ${list(f.names)}`, 'Shared the result equally; it is shared in the profit-sharing ratio.']] as [string, string][])),
          ],
          `The result of revaluation belongs to the partners of the firm before the retirement, ${f.out} included, in the ratio they then share in, ${rt(ch.neu)}: the ratio since the change.`,

          RET.H.all,
        );
      },
      verify: (q: McqQuestion) => {
        const k = readChangeRetire(q.context ?? '');
        const r = RET.ratiosIn(optionText(q))[0];
        return k !== null && r !== undefined && r.length === 3 && ADM.sameRatio(r, k.neu);
      },
    },
  ],
});

// ===============================================================================================================
// 9. case-life-fixed-capitals-admission: fixed capitals with current accounts through a year (interest on capital,
//    the shares, the drawings), then a partner admitted who cannot bring a premium, so goodwill is adjusted through
//    the current accounts (valued on the profits of three years, the year just closed among them), and the old
//    partners' capitals are brought into the new ratio on the basis of the new partner's capital through their
//    current accounts (complex). What varies: the deal, the partner asked about,
//    whether that partner's capital goes up or down.
// ===============================================================================================================

interface FixedAdmission {
  d: ADM.Deal;
  caps: number[];
  cur: number[];
  r: number;
  drawings: number[];
  profit: number;
  divisible: number;
  closing: number[];
  /** The profits of the two years before the one just closed, the years' purchase and the goodwill. */
  past: [number, number];
  n: number;
  G: number;
  K: number;
  total: number;
  required: number[];
  ask: number;
}

function readFixedAdmission(text: string) {
  const deal = ADM.readDeal(text);
  if (!deal) return null;
  const capsLine = lineOf(text, 'Fixed capitals');
  const curLine = lineOf(text, 'Current accounts on');
  const caps = deal.olds.map((nm) => amountOf(capsLine, nm));
  const cur = deal.olds.map((nm) => amountOf(curLine, nm));
  const r = Number(/Interest on capital: (\d+)% p\.a\./.exec(text)?.[1]);
  const drawings = deal.olds.map((nm) => amountOf(lineOf(text, 'Drawings during the year'), nm));
  const profit = figure(text, 'Net profit for the year ended');
  const divisible = profit - (sum(caps) * r) / 100;
  const closing = deal.olds.map((_, i) => cur[i] + (caps[i] * r) / 100 + divisible * deal.shares[i] - drawings[i]);
  const past = amountsIn(lineOf(text, 'Net profits of the two years before'));
  const n = Number(/valued at ([\d.]+) years' purchase/.exec(text)?.[1]);
  const G = ((past[0] + past[1] + profit) / 3) * n;
  const K = amountsIn(/brings (₹[\d,]+) as capital/.exec(text)?.[1] ?? '')[0];
  const total = K / deal.share;
  const news = deal.shares.map((x, i) => x - deal.given[i]);
  return { deal, caps, closing, G, required: news.map((x) => total * x), news };
}

const fixedAdmission = caseTemplate<FixedAdmission>({
  id: 'case-life-fixed-capitals-admission',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Fixed capitals, then a new partner',
  setup: (rng) =>
    attempt(14, () => {
      const d = ADM.dealWhere(rng, ['old', 'old', 'equal', 'stated', 'one'], ADM.tidySac, 2);
      if (!d) return null;
      const base = rng.pick([50000, 100000]);
      const caps = rng.shuffle(rng.pick(P.CAPS2)).map((u) => u * base);
      const cur = d.olds.map(() => rng.step(4000, 30000, 2000));
      const r = rng.pick([5, 6, 8, 10]);
      const ioc = caps.map((c) => (c * r) / 100);
      const drawings = d.olds.map(() => rng.step(20000, 80000, 10000));
      const T = sum(d.old);
      const step = T * 1000;
      const lo = Math.ceil(Math.max(80000, 0.12 * sum(caps)) / step);
      const hi = Math.floor(Math.min(400000, 0.3 * sum(caps)) / step);
      if (hi < lo) return null;
      const divisible = step * rng.int(lo, hi);
      const profit = divisible + sum(ioc);
      const closing = d.olds.map((_, i) => cur[i] + ioc[i] + (divisible * d.old[i]) / T - drawings[i]);
      if (closing.some((c) => c < 2000)) return null;
      // Goodwill on the profits of three years, the year just closed among them.
      const n = rng.pick(YEARS_PURCHASE);
      const past = twoBefore(rng, profit, n, unitFor([d.share, ...d.given.filter(ADM.isPos)]));
      if (!past) return null;
      const G = ((past[0] + past[1] + profit) / 3) * n;
      if (G < 60000) return null;
      // The capital of the new firm, near what the old capitals stand for, such that every partner's part of it is a
      // whole thousand; the new partner's capital is that partner's part.
      const den = d.news.reduce((l, f) => lcm(l, f[1]), d.share[1]);
      const target = sum(caps) / (1 - d.share[0] / d.share[1]);
      const total = roundMultiple(rng, 1000 * den, target * 0.85, target * 1.2);
      if (total === null) return null;
      const K = ADM.of(total, d.share);
      const required = d.news.slice(0, 2).map((f) => ADM.of(total, f));
      if (required.some((x, i) => !Number.isInteger(x) || x === caps[i] || x < 30000)) return null;
      const movers = [0, 1].filter((i) => required[i] !== caps[i]);
      return { d, caps, cur, r, drawings, profit, divisible, closing, past, n, G, K, total, required, ask: rng.pick(movers) };
    }),
  context: (s) => {
    const { d } = s;
    const y = d.year;
    return [
      `${d.open} Their capitals are fixed; interest on capital, the shares of profit and the drawings go to their current accounts. The firm closes its books on 31 March.`,
      `Fixed capitals: ${each(d.olds, s.caps)}`,
      `Current accounts on 1 April ${y - 1} (credit balances): ${each(d.olds, s.cur)}`,
      `Interest on capital: ${s.r}% p.a.; no interest is charged on drawings`,
      `Drawings during the year: ${each(d.olds, s.drawings)}`,
      `Net profit for the ${yearEnded(y)} as per Profit and Loss A/c: ${inr(s.profit)}`,
      `Net profits of the two years before, as per Profit and Loss A/c: ${inr(s.past[0])} (${yearEnded(y - 2)}) and ${inr(s.past[1])} (${yearEnded(y - 1)})`,
      `${d.admit} ${d.how} ${d.nw} brings ${inr(s.K)} as capital but cannot bring any premium for goodwill.`,
      `The goodwill of the firm is valued at ${s.n} years' purchase of the average net profit of the last three years; no Goodwill A/c is to be raised, and goodwill is adjusted through the current accounts.`,
      `The capitals of ${list(d.olds)} are to be brought into the new ratio on the basis of ${d.nw}'s capital; any surplus or shortage is transferred to their current accounts.`,
    ].join('\n');
  },
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { d } = s;
        const i = s.ask;
        const nm = d.olds[i];
        const T = sum(d.old);
        const ioc = (s.caps[i] * s.r) / 100;
        const share = (s.divisible * d.old[i]) / T;
        const right = s.closing[i];
        return num(
          `What is the balance of ${nm}'s Current A/c on 31 March ${d.year}?`,
          right,
          [
            [right - ioc, `Left out the interest on ${nm}'s capital, which is credited to the current account when capitals are fixed.`],
            [right + s.drawings[i], `Did not debit ${nm} with the drawings.`],
            [right - share + (s.profit * d.old[i]) / T, `Credited ${nm} with a share of the net profit before interest on capital.`],
            [right - s.cur[i], 'Left out the opening balance of the current account.'],
            [right + s.caps[i], 'Added the fixed capital to the current account.'],
          ],
          [
            `Interest on capital = ${inr(s.caps[i])} x ${s.r}/100 = ${inr(ioc)}.`,
            `Divisible profit = ${inr(s.profit)} - interest on capital ${inr((sum(s.caps) * s.r) / 100)} = ${inr(s.divisible)}; ${nm}'s share = ${inr(s.divisible)} x ${fr(d.old[i], T)} = ${inr(share)}.`,
            `${nm}'s Current A/c: ${RET.tally(s.cur[i], [
              ['interest on capital', ioc],
              ['share of profit', share],
              ['drawings', -s.drawings[i]],
            ])} = ${inr(right)} (credit). The fixed capital is not touched.`,
          ],
          P.H.capitals,
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readFixedAdmission(q.context ?? '');
        const i = k ? k.deal.olds.indexOf(/balance of ([A-Z][a-z]+)'s Current/.exec(q.prompt)?.[1] ?? '') : -1;
        return k !== null && i >= 0 && near(q.answer / 100, k.closing[i]);
      },
    },
    {
      kind: 'journal',
      make: (s) => {
        const { d } = s;
        const premium = ADM.of(s.G, d.share);
        const credits = d.given.map((x) => ADM.of(s.G, x));
        return {
          prompt: `Pass the journal entry for ${d.nw}'s share of goodwill.`,
          lines: ADM.entry(dr(partnerCurrent(d.nw), premium), ...credits.map((c, i) => cr(partnerCurrent(d.olds[i]), c))),
          explanation: [
            `Average net profit = (${inr(s.past[0])} + ${inr(s.past[1])} + ${inr(s.profit)}) / 3 = ${inr(s.G / s.n)}; goodwill = ${inr(s.G / s.n)} x ${s.n} = ${inr(s.G)}: the profits as per Profit and Loss A/c, before interest on capital.`,
            `${d.nw}'s share of goodwill = ${inr(s.G)} x ${ADM.fs(d.share)} = ${inr(premium)}. ${d.nw} brings no premium, so ${d.nw}'s Current A/c is debited with it: the capitals are fixed.`,
            ...ADM.givesSteps(d),
            ADM.sacStep(d),
            `The sacrificing partners' current accounts are credited: ${ADM.eachGets(d.olds, credits)}. No Goodwill A/c is raised (AS 26).`,
          ],
          hints: ADM.H.premium,
          distractorAccounts: ['goodwill', 'premiumForGoodwill', partnerCapital(d.nw)],
        };
      },
      verify: (q: JournalQuestion) => {
        const k = readFixedAdmission(q.context ?? '');
        const nw = /Pass the journal entry for ([A-Z][a-z]+)'s share/.exec(q.prompt)?.[1] ?? '';
        return k !== null && near(posted(q, partnerCurrent(nw), 'Dr'), k.G * k.deal.share) && k.deal.olds.every((nm, i) => near(posted(q, partnerCurrent(nm), 'Cr'), k.G * k.deal.given[i]));
      },
    },
    {
      kind: 'numeric',
      unit: 'ratio',
      make: (s) => {
        const { d } = s;
        const asOld = ADM.ratioOf([...d.oldShares.map((x) => ADM.times(x, ADM.minus(ADM.ONE, d.share))), d.share]);
        return ratioQ(
          `Find the new profit-sharing ratio of ${list(d.names)}.`,
          d.newRatio,
          [
            [[...d.old, 1], `Kept the old ratio and gave ${d.nw} one more term.`],
            [d.kind === 'old' ? [1, 1, 1] : asOld, d.kind === 'old' ? 'Shared the profit equally among the three.' : `Took ${d.nw}'s share in the old ratio, which is not what was agreed.`],
            [[d.newRatio[1], d.newRatio[0], d.newRatio[2]], 'Wrote the terms of the old partners against the wrong names.'],
            [[...s.caps, s.K], 'Took the ratio of the capitals for the profit-sharing ratio.'],
          ],
          [...ADM.givesSteps(d), ...ADM.newShareSteps(d)],
          ADM.H.newRatio,
        );
      },
      verify: (q: RatioQuestion) => {
        const k = readFixedAdmission(q.context ?? '');
        return k !== null && ADM.sameRatio(q.answer, [...k.news, k.deal.share]);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { d } = s;
        const i = s.ask;
        const nm = d.olds[i];
        return num(
          `What should ${nm}'s capital be in the new firm?`,
          s.required[i],
          [
            [ADM.of(s.total, d.oldShares[i]), `Used ${nm}'s old share; the capitals are to be in the new ratio.`],
            [ADM.of(sum(s.caps) + s.K, d.news[i]), `Took the capitals now in the firm as the total; the total capital of the new firm is worked out from ${d.nw}'s capital.`],
            [ADM.of(s.K, d.news[i]), `Took ${d.nw}'s capital as the whole capital of the firm.`],
            [s.caps[i], `Left ${nm}'s capital as it is.`],
          ],
          [
            `${d.nw}'s capital of ${inr(s.K)} is for ${ADM.fs(d.share)} share, so the capital of the whole firm = ${inr(s.K)} x ${d.share[0] === 1 ? d.share[1] : `${d.share[1]}/${d.share[0]}`} = ${inr(s.total)}.`,

            ...ADM.newShareSteps(d),
            `${nm}'s capital = ${inr(s.total)} x ${ADM.fs(d.news[i])} = ${inr(s.required[i])}.`,
          ],
          ADM.H.capitals,
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readFixedAdmission(q.context ?? '');
        const i = k ? k.deal.olds.indexOf(/should ([A-Z][a-z]+)'s capital/.exec(q.prompt)?.[1] ?? '') : -1;
        return k !== null && i >= 0 && near(q.answer / 100, k.required[i]);
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const { d } = s;
        const i = s.ask;
        const nm = d.olds[i];
        const diff = s.required[i] - s.caps[i];
        const x = inr(Math.abs(diff));
        const up = diff > 0;
        const right = up ? `${nm}'s Current A/c Dr; To ${nm}'s Capital A/c, ${x}` : `${nm}'s Capital A/c Dr; To ${nm}'s Current A/c, ${x}`;
        return choice(
          `Which entry brings ${nm}'s capital to the figure the new ratio calls for?`,
          right,
          [
            [up ? `${nm}'s Capital A/c Dr; To ${nm}'s Current A/c, ${x}` : `${nm}'s Current A/c Dr; To ${nm}'s Capital A/c, ${x}`, `Wrote the entry the wrong way round: ${nm}'s capital has to ${up ? 'rise' : 'fall'}.`],
            [up ? `Bank A/c Dr; To ${nm}'s Capital A/c, ${x}` : `${nm}'s Capital A/c Dr; To Bank A/c, ${x}`, 'Settled the difference in cash; the case says it goes to the current accounts.'],
            [`${nm}'s Current A/c Dr; To ${nm}'s Capital A/c, ${inr(s.required[i])}`, 'Transferred the whole new capital instead of the difference.'],
            [`${nm}'s Capital A/c Dr; To ${d.nw}'s Capital A/c, ${x}`, `Moved the difference to ${d.nw}; each partner's own current account takes it.`],
          ],
          `${nm}'s capital should be ${inr(s.required[i])} and is ${inr(s.caps[i])}: it must ${up ? 'rise' : 'fall'} by ${x}. The capitals are fixed, so the difference goes to ${nm}'s Current A/c: ${up ? `the current account is debited and the capital credited` : 'the capital is debited and the current account credited'}.`,
          ADM.H.capitals,
        );
      },
      verify: (q: McqQuestion) => {
        const k = readFixedAdmission(q.context ?? '');
        const i = k ? k.deal.olds.indexOf(/brings ([A-Z][a-z]+)'s capital to/.exec(q.prompt)?.[1] ?? '') : -1;
        if (!k || i < 0) return false;
        const nm = k.deal.olds[i];
        const diff = k.required[i] - k.caps[i];
        const text = optionText(q);
        return near(amountsIn(text)[0], Math.abs(diff)) && text.startsWith(diff > 0
 ? `${nm}'s Current A/c Dr; To ${nm}'s Capital A/c` : `${nm}'s Capital A/c Dr; To ${nm}'s Current A/c`);
      },
    },
  ],
});

// ===============================================================================================================
// 10. case-life-retirement-new-ratio: goodwill valued on the weighted average profit, a partner retires and the two
//     who continue agree a new ratio in which one of them gains more than the share that is free and the other gives
//     part of a share up, so the goodwill entry compensates two partners; then the amount due and the first of two
//     instalments with interest (complex). What varies: who retires, the new ratio, the weights, the rate.
// ===============================================================================================================

interface RetireNewRatio {
  names: string[];
  old: number[];
  firm: string;
  o: number;
  /** The continuing partners (indexes into names), the one who gains and the one who sacrifices. */
  a: number;
  b: number;
  fresh: number[];
  gainA: ADM.Frac;
  sacB: ADM.Frac;
  y: number;
  profits: number[];
  n: number;
  G: number;
  K: number;
  R: number;
  due: number;
  rate: number;
  first: number;
}

/** "Bhavna" gains and "Chetan" sacrifices; the fractions of the whole profit each moves. */
function readRetireNewRatio(text: string) {
  const first = text.split('\n')[0];
  const names = (/^(.+?) are partners/.exec(first)?.[1] ?? '').split(/, | and /);
  const old = oldRatioIn(first, names.length);
  const out = /([A-Z][a-z]+) retires on/.exec(text)?.[1] ?? '';
  const agreed = /([A-Z][a-z]+) and ([A-Z][a-z]+) agree to share future profits in the ratio (\d+):(\d+)/.exec(text);
  if (!old || !agreed || !names.includes(out)) return null;
  const fresh = [Number(agreed[3]), Number(agreed[4])];
  const os = shares(old);
  const stay = [agreed[1], agreed[2]];
  const move = stay.map((nm, i) => fresh[i] / sum(fresh) - os[names.indexOf(nm)]);
  const profits = amountsIn(lineOf(text, 'Net profits'));
  const n = Number(/valued at ([\d.]+) years' purchase/.exec(text)?.[1]);
  const G = ((profits[0] + 2 * profits[1] + 3 * profits[2]) / 6) * n;
  const x = os[names.indexOf(out)];
  const due = figure(text, `${out}'s capital`) + (G + figure(text, 'General Reserve')) * x;
  const rate = Number(/interest at (\d+)% p\.a\./.exec(text)?.[1]);
  return { names, stay, move, out, x, G, due, first: due / 2 + (due * rate) / 100 };
}

const retireNewRatio = caseTemplate<RetireNewRatio>({
  id: 'case-life-retirement-new-ratio',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'A retirement, a new ratio and instalments',
  setup: (rng) =>
    attempt(16, () => {
      const names = P.partners(rng, 3);
      const old = rng.shuffle(rng.pick(PSR3.filter((r) => new Set(r).size > 1)));
      const T = sum(old);
      const o = rng.int(0, 2);
      const [p, q] = names.map((_, i) => i).filter((i) => i !== o);
      const options = [[2, 1], [1, 2], [3, 1], [1, 3], [3, 2], [2, 3], [4, 1], [1, 4], [5, 3], [3, 5], [5, 2], [2, 5], [7, 3], [3, 7]].filter((nr) => {
        const gp = nr[0] * T - old[p] * sum(nr);
        const gq = nr[1] * T - old[q] * sum(nr);
        return (gp > 0 && gq < 0) || (gp < 0 && gq > 0);
      });
      if (options.length === 0) return null;
      const fresh = rng.pick(options);
      const N = sum(fresh);
      const gp = ADM.minus(ADM.fr(fresh[0], N), ADM.fr(old[p], T));
      const [a, b] = ADM.isPos(gp) ? [p, q] : [q, p];
      const gainA = ADM.minus(ADM.fr(fresh[a === p ? 0 : 1], N), ADM.fr(old[a], T));
      const sacB = ADM.minus(ADM.fr(old[b], T), ADM.fr(fresh[b === p ? 0 : 1], N));
      const n = rng.pick([2, 3, 2, 1.5]);
      const unit = 100 * N * T;
      // Weighted average profit (weights 1, 2, 3, the latest year the heaviest) whose years' purchase is a multiple of the unit.
      for (let t = 0; t < 20; t++) {
        const w = rng.step(60000, 300000, 1000);
        if (!Number.isInteger(w * n) || (w * n) % unit !== 0) continue;
        const p1 = rng.step(Math.round((w * 0.7) / 1000) * 1000, Math.round((w * 1.0) / 1000) * 1000, 1000);
        const p2 = rng.step(Math.round((w * 0.8) / 1000) * 1000, Math.round((w * 1.1) / 1000) * 1000, 1000);
        const rest = 6 * w - p1 - 2 * p2;
        if (p1 === p2 || rest % 3 !== 0 || (rest / 3) % 1000 !== 0) continue;
        const p3 = rest / 3;
        if (p3 < w * 0.8 || p3 > w * 1.35) continue;
        const G = w * n;
        const K = rng.step(100000, 400000, 10000);
        const R = RET.mult(rng, T * 1000, 20000, 120000);
        if (R === null) return null;
        const due = K + ((G + R) * old[o]) / T;
        const rate = rng.pick([6, 8, 9, 10, 12]);
        const first = due / 2 + (due * rate) / 100;
        if (!Number.isInteger(due / 2) || (due / 2) % 100 !== 0 || !Number.isInteger(first)) continue;
        return { names, old, firm: FIRM_OF(rng), o, a, b, fresh, gainA, sacB, y: rng.pick([2024, 2025, 2026]), profits: [p1, p2, p3], n, G, K, R, due, rate, first };
      }
      return null;
    }),
  context: (s) => {
    const { names, y } = s;
    const out = names[s.o];
    const [p, q] = names.filter((_, i) => i !== s.o);
    return [
      `${list(names)} are partners in ${s.firm}, sharing profits and losses in the ratio ${rt(s.old)}. Their capitals are fluctuating. The firm closes its books on 31 March.`,
      `${out}'s capital on 31 March ${y}: ${inr(s.K)}`,
      `General Reserve on 31 March ${y}: ${inr(s.R)}`,
      `Net profits: ${s.profits.map((x, k) => `${inr(x)} (${yearEnded(y - 2 + k)})`).join(', ')}`,
      `${out} retires on 31 March ${y}; ${p} and ${q} agree to share future profits in the ratio ${rt(s.fresh)}.`,
      `The whole of the General Reserve is distributed among all the partners. Goodwill is valued at ${s.n} years' purchase of the weighted average profit of the three years, weighted 1, 2 and 3 from the earliest year, and is adjusted through the capital accounts without opening Goodwill A/c.`,
      `The amount due to ${out} is to be paid in two equal annual instalments of principal, with interest at ${s.rate}% p.a. on the amount unpaid, the first on 31 March ${y + 1}.`,
    ].join('\n');
  },
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const [p1, p2, p3] = s.profits;
        const w = (p1 + 2 * p2 + 3 * p3) / 6;
        return num(
          'At what amount is the goodwill of the firm valued?',
          s.G,
          [
            [((p1 + p2 + p3) / 3) * s.n, 'Took the simple average of the three profits; the deed weights them.'],
            [((3 * p1 + 2 * p2 + p3) / 6) * s.n, 'Gave the heaviest weight to the earliest year; the latest year carries weight 3.'],
            [w, `Stopped at the weighted average and did not multiply it by ${s.n}.`],
            [(p1 + 2 * p2 + 3 * p3) * s.n, 'Did not divide by the total of the weights, 6.'],
          ],
          [`Weighted average profit = (${inr(p1)} x 1 + ${inr(p2)} x 2 + ${inr(p3)} x 3) / 6 = ${inr(w)}.`, `Goodwill = ${inr(w)} x ${s.n} = ${inr(s.G)}.`],
          ['Which year carries the heaviest weight?', 'Weighted average = sum of (profit x weight) / sum of the weights; goodwill = weighted average x years\' purchase.'],
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readRetireNewRatio(q.context ?? '');
        return k !== null && near(q.answer / 100, k.G);
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const { names } = s;
        const nb = names[s.b];
        const out = names[s.o];
        const T = sum(s.old);
        const takeOld = ADM.fr(s.old[s.o] * s.old[s.b], T * (T - s.old[s.o]));
        return choice(
          `What does the new ratio do to ${nb}'s share of the profits?`,
          `${nb} gives up ${ADM.fs(s.sacB)}`,
          [
            [`${nb} gains ${ADM.fs(s.sacB)}`, `Read the change the wrong way: ${nb}'s new share is smaller than the old one.`],
            [`${nb} gains ${ADM.fs(takeOld)}`, `Assumed the continuing partners take over ${out}'s share in their old ratio; they agreed a new ratio instead.`],
            [`${nb}'s share does not change`, `Assumed only ${out}'s share moves; ${nb}'s share is fixed afresh by the new ratio.`],
            [`${nb} gives up ${ADM.fs(s.gainA)}`, `Gave the share the other continuing partner gains.`],
          ],
          `${nb}'s old share is ${fr(s.old[s.b], T)} and the new share ${fr(s.fresh[s.b === names.findIndex((_, i) => i !== s.o) ? 0 : 1], sum(s.fresh))}: ${nb} gives up ${ADM.fs(s.sacB)}, so ${nb} too must be compensated for goodwill.`,
          CPR.H.ratio,
        );
      },
      verify: (q: McqQuestion) => {
        const k = readRetireNewRatio(q.context ?? '');
        const nb = /What does the new ratio do to ([A-Z][a-z]+)'s share/.exec(q.prompt)?.[1] ?? '';
        const m = /gives up (\d+)\/(\d+)$/.exec(optionText(q));
        return k !== null && m !== null && near(-k.move[k.stay.indexOf(nb)], Number(m[1]) / Number(m[2]));
      },
    },
    {
      kind: 'journal',
      make: (s) => {
        const { names } = s;
        const out = names[s.o];
        const T = sum(s.old);
        const outShare = (s.G * s.old[s.o]) / T;
        const sacB = ADM.of(s.G, s.sacB);
        const gainA = ADM.of(s.G, s.gainA);
        return {
          prompt: `Pass the journal entry for goodwill on ${out}'s retirement.`,
          lines: [dr(partnerCapital(names[s.a]), gainA), cr(partnerCapital(out), outShare), cr(partnerCapital(names[s.b]), sacB)],
          explanation: [
            `${names[s.a]} gains ${ADM.fs(s.gainA)}: ${inr(s.G)} x ${ADM.fs(s.gainA)} = ${inr(gainA)}, debited to ${names[s.a]}'s Capital A/c.`,
            `${out} gives up the whole share of ${fr(s.old[s.o], T)}: ${inr(outShare)}, credited to ${out}'s Capital A/c.`,
            `${names[s.b]} gives up ${ADM.fs(s.sacB)}: ${inr(sacB)}, credited to ${names[s.b]}'s Capital A/c.`,
            `The partner who gains pays everyone who gives up a share. No Goodwill A/c is opened.`,
          ],
          hints: RET.H.goodwill,
          distractorAccounts: ['goodwill', 'premiumForGoodwill', partnerLoan(out)],
        };
      },
      verify: (q: JournalQuestion) => {
        const k = readRetireNewRatio(q.context ?? '');
        if (!k) return false;
        // Every partner's net credit is goodwill x what that partner gives up.
        const give = k.names.map((nm) => (nm === k.out ? k.x : -k.move[k.stay.indexOf(nm)]));
        return k.names.every((nm, i) => near(posted(q, partnerCapital(nm), 'Cr') - posted(q, partnerCapital(nm), 'Dr'), k.G * give[i]));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const out = s.names[s.o];
        const T = sum(s.old);
        const part = (v: number): number => (v * s.old[s.o]) / T;
        return num(
          `What is the amount due to ${out}?`,
          s.due,
          [
            [s.K + part(s.R), `Left out ${out}'s share of goodwill.`],
            [s.K + part(s.G), `Left out ${out}'s share of the General Reserve.`],
            [s.K + s.G + part(s.R), `Credited ${out} with the whole goodwill of the firm.`],
            [s.K + part(s.G + s.R) - ADM.of(s.G, s.sacB), `Took off the goodwill ${s.names[s.b]} is compensated with; that is paid by ${s.names[s.a]}.`],
          ],
          [`Amount due = ${RET.tally(s.K, [['share of goodwill', part(s.G)], ['share of the General Reserve', part(s.R)]])} = ${inr(s.due)}.`],
          RET.H.due,
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readRetireNewRatio(q.context ?? '');
        return k !== null && near(q.answer / 100, k.due);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const out = s.names[s.o];
        const half = s.due / 2;
        const interest = (s.due * s.rate) / 100;
        return num(
          `How much is paid to ${out} on 31 March ${s.y + 1}?`,
          s.first,
          [
            [half, 'Paid the instalment of principal without the interest.'],
            [half + (half * s.rate) / 100, 'Charged interest on half the amount; for the first year the whole amount is unpaid.'],
            [interest, 'Paid only the interest.'],
            [s.due + interest, 'Paid the whole amount with interest at once.'],
          ],
          [`Instalment of principal = ${inr(s.due)} / 2 = ${inr(half)}.`, `Interest for the first year on the whole amount unpaid = ${inr(s.due)} x ${s.rate}/100 = ${inr(interest)}.`, `Paid = ${inr(half)} + ${inr(interest)} = ${inr(s.first)}.`],
          RET.H.loan,
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readRetireNewRatio(q.context ?? '');
        return k !== null && near(q.answer / 100, k.first);
      },
    },
  ],
});

// ===============================================================================================================
// 11. case-life-year-then-dissolution: a firm's last year (interest on capital, a salary, the shares) and then its
//     dissolution on the last day of it, in which goodwill that was never in the books (AS 26) is sold (medium).
//     What varies: two or three partners, the salary, a discount from the creditors, profit or loss on realisation.
// ===============================================================================================================

interface YearDissolve {
  names: string[];
  ratio: number[];
  firm: string;
  y: number;
  caps: number[];
  r: number;
  si: number;
  s: number;
  drawings: number[];
  profit: number;
  divisible: number;
  closing: number[];
  bv: number;
  rv: number;
  creditors: number;
  paid: number;
  gw: number;
  e: number;
  result: number;
  ask: number;
}

function readYearDissolve(text: string) {
  const first = text.split('\n')[0];
  const names = (/^(.+?) are partners/.exec(first)?.[1] ?? '').split(/, | and /);
  const ratio = /sharing profits and losses equally/.test(first) ? names.map(() => 1) : oldRatioIn(first, names.length);
  if (!ratio) return null;
  const caps = names.map((nm) => amountOf(lineOf(text, 'Capitals on'), nm));
  const r = Number(/Interest on capital: (\d+)% p\.a\./.exec(text)?.[1]);
  const salaryLine = lineOf(text, 'Salary:');
  const salary = names.map((nm) => (salaryLine.endsWith(` to ${nm}`) ? 12 * amountsIn(salaryLine)[0] : 0));
  const drawings = names.map((nm) => amountOf(lineOf(text, 'Drawings during the year'), nm));
  const profit = figure(text, 'Net profit for the year ended');
  const divisible = profit - (sum(caps) * r) / 100 - sum(salary);
  const sh = shares(ratio);
  const closing = names.map((_, i) => caps[i] + (caps[i] * r) / 100 + salary[i] + divisible * sh[i] - drawings[i]);
  const bv = figure(text, 'Assets other than cash at bank');
  const rv = amountsIn(lineOf(text, 'Assets other than cash at bank'))[1];
  const cl = lineOf(text, 'Creditors');
  const [creditors, paid] = amountsIn(cl).length > 1 ? amountsIn(cl) : [amountsIn(cl)[0], amountsIn(cl)[0]];
  const gw = figure(text, 'Goodwill, never');
  const e = figure(text, 'Realisation expenses');
  const result = rv + gw + creditors - bv - paid - e;
  return { names, sh, closing, result, finals: closing.map((c, i) => c + result * sh[i]) };
}

const yearThenDissolution = caseTemplate<YearDissolve>({
  id: 'case-life-year-then-dissolution',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'A last year, then the firm is dissolved',
  setup: (rng) =>
    attempt(14, () => {
      const n = rng.pick([2, 2, 3]);
      const names = P.partners(rng, n);
      const ratio = rng.pick(n === 2 ? PSR2 : PSR3);
      const T = sum(ratio);
      const y = rng.pick([2024, 2025, 2026]);
      const base = rng.pick([50000, 100000]);
      const caps = rng.shuffle(rng.pick(n === 2 ? P.CAPS2 : P.CAPS3)).map((u) => u * base);
      const r = rng.pick([5, 6, 8, 10]);
      const si = rng.int(0, n - 1);
      const s = rng.int(0, 1) === 0 ? rng.step(2000, 5000, 500) : 0;
      const drawings = names.map(() => rng.step(20000, 80000, 10000));
      const step = T * 1000;
      const lo = Math.ceil(Math.max(60000, 0.1 * sum(caps)) / step);
      const hi = Math.floor(Math.min(360000, 0.25 * sum(caps)) / step);
      if (hi < lo) return null;
      const divisible = step * rng.int(lo, hi);
      const salary = names.map((_, i) => (i === si ? 12 * s : 0));
      const profit = divisible + (sum(caps) * r) / 100 + sum(salary);
      const closing = names.map((_, i) => caps[i] + (caps[i] * r) / 100 + salary[i] + (divisible * ratio[i]) / T - drawings[i]);
      if (closing.some((c) => c < 40000)) return null;
      // The balance sheet on the day of dissolution: the other assets, the creditors and the bank balance that agrees it.
      const creditors = rng.step(40000, 160000, 5000);
      const bv = Math.round((sum(closing) + creditors - rng.step(20000, 80000, 5000)) / 5000) * 5000;
      const bank = sum(closing) + creditors - bv;
      if (bank < 10000) return null;
      const paid = creditors - (rng.int(0, 1) === 0 ? rng.step(1000, 5000, 1000) : 0);
      const gw = rng.step(10000, 60000, 5000);
      const e = rng.step(2000, 9000, 1000);
      // What the other assets fetch, near their book value, so that every share of the result is a whole hundred.
      const base2 = bv + (bv / 100) * rng.pick([-25, -15, -10, 5]);
      let rv = Math.round(base2 / 1000) * 1000;
      let k = 0;
      while (k < 40 && ((((rv + gw + creditors - bv - paid - e) % (T * 100)) + T * 100) % (T * 100) !== 0 || rv + gw + creditors - bv - paid - e === 0)) {
        rv -= 100;
        k++;
      }
      if (k === 40) return null;
      const result = rv + gw + creditors - bv - paid - e;
      const finals = closing.map((c, i) => c + (result * ratio[i]) / T);
      if (finals.some((x) => x < 5000) || Math.abs(result) < T * 1000) return null;
      return { names, ratio, firm: FIRM_OF(rng), y, caps, r, si, s, drawings, profit, divisible, closing, bv, rv, creditors, paid, gw, e, result, ask: rng.int(0, n - 1) };
    }),
  context: (s) => {
    const { names, y } = s;
    return [
      `${list(names)} are partners in ${s.firm}, sharing profits and losses ${inRatio(s.ratio)}. Their capitals are fluctuating. The firm closes its books on 31 March.`,
      `Capitals on 1 April ${y - 1}: ${each(names, s.caps)}`,
      `Interest on capital: ${s.r}% p.a.; no interest is charged on drawings`,
      ...(s.s > 0 ? [`Salary: ${inr(s.s)} per month to ${names[s.si]}`] : []),
      `Drawings during the year: ${each(names, s.drawings)}`,
      `Net profit for the ${yearEnded(y)} as per Profit and Loss A/c: ${inr(s.profit)}`,
      `Once the accounts of the year were closed, the firm was dissolved on 31 March ${y}. Every receipt and payment was by cheque.`,
      `Assets other than cash at bank, at book value ${inr(s.bv)}, realised ${inr(s.rv)}`,
      s.paid < s.creditors ? `Creditors of ${inr(s.creditors)} accepted ${inr(s.paid)} in full settlement` : `Creditors of ${inr(s.creditors)} were paid in full`,
      `Goodwill, never recorded in the books, was sold for ${inr(s.gw)}`,
      `Realisation expenses, borne and paid by the firm: ${inr(s.e)}`,
    ].join('\n');
  },
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const i = s.ask;
        const nm = s.names[i];
        const T = sum(s.ratio);
        const ioc = (s.caps[i] * s.r) / 100;
        const share = (s.divisible * s.ratio[i]) / T;
        const right = s.closing[i];
        return num(
          `What is the balance of ${nm}'s Capital A/c on 31 March ${s.y}, once the year's appropriations have been entered?`,
          right,
          [
            [right - ioc, `Left out the interest on ${nm}'s capital.`],
            [right + s.drawings[i], `Did not debit ${nm} with the drawings.`],
            [right - share + (s.profit * s.ratio[i]) / T, `Credited ${nm} with a share of the net profit instead of the divisible profit.`],
            ...(s.s > 0 && i === s.si ? ([[right - 12 * s.s, `Left out ${nm}'s salary.`]] as Errs) : []),
          ],
          [
            `Divisible profit = ${inr(s.profit)} - interest on capital ${inr((sum(s.caps) * s.r) / 100)}${s.s > 0 ? ` - salary ${inr(12 * s.s)}` : ''} = ${inr(s.divisible)}.`,
            `${nm}'s Capital A/c: ${RET.tally(s.caps[i], [
              ['interest on capital', ioc],
              ['salary', i === s.si ? 12 * s.s : 0],
              ['share of profit', share],
              ['drawings', -s.drawings[i]],
            ])} = ${inr(right)}.`,
          ],
          P.H.approp,
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readYearDissolve(q.context ?? '');
        const i = k ? k.names.indexOf(/balance of ([A-Z][a-z]+)'s Capital/.exec(q.prompt)?.[1] ?? '') : -1;
        return k !== null && i >= 0 && near(q.answer / 100, k.closing[i]);
      },
    },
    {
      kind: 'mcq',
      make: (s) =>
        choice(
          `Which entry records the sale of goodwill for ${inr(s.gw)}?`,
          'Bank A/c Dr; To Realisation A/c',
          [
            ['Bank A/c Dr; To Goodwill A/c', 'Credited a Goodwill A/c, but there is none: goodwill was never in the books.'],
            [`Bank A/c Dr; To ${list(s.names.map((nm) => `${nm}'s Capital A/c`))}`, 'Gave the money straight to the partners; like every asset sold on dissolution, it goes through Realisation A/c.'],
            ['Goodwill A/c Dr; To Realisation A/c', 'Brought goodwill into the books first; self-generated goodwill is never recorded (AS 26), and money was received.'],
            ['Realisation A/c Dr; To Bank A/c', 'Wrote the entry the wrong way round: money came in.'],
          ],
          'Self-generated goodwill is never recorded (AS 26), so nothing for it went to the debit of Realisation A/c. The money it fetches is a gain on realisation: Bank A/c is debited and Realisation A/c credited.',
          DIS.H.entry,
        ),
      verify: (q: McqQuestion) => optionText(q) === 'Bank A/c Dr; To Realisation A/c' && /Goodwill, never recorded in the books, was sold/.test(q.context ?? ''),
    },
    {
      kind: 'mcq',
      make: (s) => {
        const debit = s.bv + s.paid + s.e;
        const credit = s.creditors + s.rv + s.gw;
        return choice(
          'What does Realisation A/c show?',
          DIS.profitOrLoss(s.result),
          [
            [DIS.profitOrLoss(-s.result), s.result > 0 ? 'Read the heavier credit side as a loss.' : 'Read the heavier debit side as a profit.'],
            [DIS.profitOrLoss(s.result - s.gw), 'Left out the goodwill sold, which is a gain because it was never in the books.'],
            [DIS.profitOrLoss(s.result + s.e), 'Left out the realisation expenses.'],
            ...(s.paid < s.creditors ? ([[DIS.profitOrLoss(s.result - (s.creditors - s.paid)), 'Took the creditors as paid in full, missing the discount they allowed.']] as [string, string][]) : []),
            [DIS.profitOrLoss(s.result - s.creditors), 'Left the creditors out of the credit side while debiting what was paid to them.'],
          ],
          `Debit: assets ${inr(s.bv)} + creditors paid ${inr(s.paid)} + expenses ${inr(s.e)} = ${inr(debit)}. Credit: creditors ${inr(s.creditors)} + assets realised ${inr(s.rv)} + goodwill sold ${inr(s.gw)} = ${inr(credit)}. ${DIS.resultLine(debit, credit)}`,
          DIS.H.realisation,
        );
      },
      verify: (q: McqQuestion) => {
        const k = readYearDissolve(q.context ?? '');
        return k !== null && optionText(q) === DIS.profitOrLoss(k.result);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const i = (s.ask + 1) % s.names.length;
        const nm = s.names[i];
        const T = sum(s.ratio);
        const share = (s.result * s.ratio[i]) / T;
        const right = s.closing[i] + share;
        return num(
          `How much is finally paid to ${nm}?`,
          right,
          [
            [s.closing[i] - share, `Took the ${s.result > 0 ? 'profit' : 'loss'} on realisation the wrong way.`],
            [s.closing[i], 'Left out the share of the result on realisation.'],
            [s.caps[i] + share, "Started from the capital at the beginning of the year, leaving out the year's items."],
            [s.closing[i] + s.result / s.names.length, 'Shared the result on realisation equally.'],
          ],
          [
            `${nm}'s capital after the year's items = ${inr(s.closing[i])}.`,
            `Share of the ${s.result > 0 ? 'profit' : 'loss'} on realisation = ${inr(Math.abs(s.result))} x ${fr(s.ratio[i], T)} = ${inr(Math.abs(share))}.`,
            `Final payment = ${inr(s.closing[i])} ${share > 0 ? '+' : '-'} ${inr(Math.abs(share))} = ${inr(right)}.`,
          ],
          DIS.H.closing,
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readYearDissolve(q.context ?? '');
        const i = k ? k.names.indexOf(/finally paid to ([A-Z][a-z]+)\?/.exec(q.prompt)?.[1] ?? '') : -1;
        return k !== null && i >= 0 && near(q.answer / 100, k.finals[i]);
      },
    },
  ],
});

// ===============================================================================================================
// 12. case-life-retirement-then-admission: a partner retires and the two who continue take the share over as agreed;
//     a year later they admit a new partner, who brings a premium for goodwill valued on the average profit
//     (complex). What varies: who retires, how the share is taken over, the deal of the admission, the figures.
// ===============================================================================================================

interface RetireAdmit {
  f: RET.Firm;
  intro: string;
  g: RET.Gain;
  y: number;
  G1: number;
  nw: string;
  share: ADM.Frac;
  kind: 'old' | 'equal';
  given: ADM.Frac[];
  news: ADM.Frac[];
  newRatio: number[];
  profits: number[];
  n: number;
  G2: number;
}

function readRetireAdmit(text: string) {
  const g = RET.readFirm(text);
  const gain = g && RET.readGain(text, g);
  if (!g || !gain) return null;
  const neu = g.stayShare.map((x, i) => x + gain[i]);
  const adm = lineOf(text, / is admitted /);
  const sh = /for (\d+)\/(\d+) share/.exec(adm);
  if (!sh) return null;
  const x = Number(sh[1]) / Number(sh[2]);
  const given = /equally/.test(adm) ? neu.map(() => x / 2) : neu.map((v) => v * x);
  const profits = amountsIn(lineOf(text, 'Net profits of the last three years'));
  const n = Number(/valued at ([\d.]+) years' purchase/.exec(text)?.[1]);
  return { g, gain, neu, x, given, news: [...neu.map((v, i) => v - given[i]), x], G1: figure(text, 'Goodwill on the retirement'), G2: (sum(profits) / 3) * n };
}

const retirementThenAdmission = caseTemplate<RetireAdmit>({
  id: 'case-life-retirement-then-admission',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'A partner leaves, then another joins',
  setup: (rng) =>
    attempt(14, () => {
      const f = RET.firm(rng);
      const g = RET.gainOf(rng, f, ['split', 'split', 'one', 'agreed']);
      if (!g || g.fresh.some((t) => t <= 0)) return null;
      const y = rng.pick([2024, 2025]);
      const G1 = roundMultiple(rng, 100 * f.total * sum(g.w), 80000, 500000);
      if (G1 === null) return null;
      const kind = rng.pick(['old', 'equal'] as const);
      const share = rng.pick<ADM.Frac>([[1, 4], [1, 5], [1, 3], [1, 6], [1, 8]]);
      const fresh = ADM.sharesOf(g.fresh);
      const given = kind === 'old' ? fresh.map((x) => ADM.times(x, share)) : fresh.map(() => ADM.fr(share[0], share[1] * 2));
      const news = [...fresh.map((x, i) => ADM.minus(x, given[i])), share];
      const newRatio = ADM.ratioOf(news);
      if (!newRatio || sum(newRatio) > 60) return null;
      const n = rng.pick([2, 3, 1.5]);
      const unit = unitFor([share, ...given]);
      const fits: number[] = [];
      for (let a = 60000; a <= 300000; a += 1000) if (Number.isInteger(a * n) && (a * n) % unit === 0) fits.push(a);
      if (fits.length === 0) return null;
      const avg = rng.pick(fits);
      const p1 = rng.step(Math.round((avg * 0.8) / 1000) * 1000, Math.round((avg * 1.1) / 1000) * 1000, 1000);
      const p2 = rng.step(Math.round((avg * 0.85) / 1000) * 1000, Math.round((avg * 1.15) / 1000) * 1000, 1000);
      const p3 = 3 * avg - p1 - p2;
      if (p3 < avg * 0.75 || p3 > avg * 1.35 || new Set([p1, p2, p3]).size < 3) return null;
      const nw = rng.pick(ADM.NAMES.filter((nm) => !f.names.includes(nm)));
      return { f, intro: RET.intro(rng, f), g, y, G1, nw, share, kind, given, news, newRatio, profits: [p1, p2, p3], n, G2: avg * n };
    }),
  context: (s) => {
    const { f, y } = s;
    const stay = list(f.stay);
    return [
      `${s.intro} ${RET.FLUCTUATING} Goodwill is never raised in the books.`,
      `${f.out} retires on 31 March ${y}; ${s.g.text}.`,
      `Goodwill on the retirement: ${inr(s.G1)}, adjusted through the capital accounts`,
      `On 1 April ${y + 1}, ${s.nw} is admitted for ${ADM.fs(s.share)} share, ${s.kind === 'old' ? `${stay} keeping the ratio in which they then share` : `taken equally from ${stay}`}.`,
      `Net profits of the last three years: ${s.profits.map((x, k) => `${inr(x)} (${yearEnded(y - 1 + k)})`).join(', ')}`,
      `On the admission, goodwill is valued at ${s.n} years' purchase of the average profit of the last three years, and ${s.nw} brings ${s.nw}'s share of it as premium in cash.`,
    ].join('\n');
  },
  parts: [
    {
      kind: 'numeric',
      unit: 'ratio',
      make: (s) => {
        const { f, g } = s;
        return ratioQ(
          `Find the new profit-sharing ratio of ${f.stay[0]} and ${f.stay[1]} after ${f.out}'s retirement.`,
          g.fresh,
          [
            [f.stayOld, `Kept the old ratio of ${list(f.stay)}, as if nothing had been agreed about ${f.out}'s share.`],
            [g.w, `Gave the ratio in which ${list(f.stay)} gain, not their new shares.`],
            [[1, 1], 'Took the continuing partners to share equally.'],
            [[...g.fresh].reverse(), 'Wrote the terms against the wrong names.'],
          ],
          [`${g.freshWhy}.`],
          RET.H.ratio,
        );
      },
      verify: (q: RatioQuestion) => {
        const k = readRetireAdmit(q.context ?? '');
        return k !== null && ADM.sameRatio(q.answer, k.neu);
      },
    },
    {
      kind: 'journal',
      make: (s) => {
        const step = RET.stepGoodwill(s.f, s.g, s.G1);
        return {
          prompt: `Pass the journal entry for ${s.f.out}'s share of goodwill on retirement.`,
          lines: step.lines,
          explanation: step.explanation,
          hints: RET.H.goodwill,
          distractorAccounts: ['goodwill', 'premiumForGoodwill', partnerLoan(s.f.out)],
        };
      },
      verify: (q: JournalQuestion) => {
        const k = readRetireAdmit(q.context ?? '');
        if (!k) return false;
        const out = k.G1 * k.g.x;
        return near(posted(q, partnerCapital(k.g.out), 'Cr'), out) && k.g.stay.every((nm, i) => near(posted(q, partnerCapital(nm), 'Dr'), (out * k.gain[i]) / sum(k.gain)));
      },
    },
    {
      kind: 'numeric',
      unit: 'ratio',
      make: (s) => {
        const { f } = s;
        const names = [...f.stay, s.nw];
        const fromOld = ADM.ratioOf([...ADM.sharesOf(f.stayOld).map((x) => ADM.times(x, ADM.minus(ADM.ONE, s.share))), s.share]);
        return ratioQ(
          `Find the new profit-sharing ratio of ${list(names)} on ${s.nw}'s admission.`,
          s.newRatio,
          [
            [fromOld, `Started from the ratio of ${list(f.stay)} before ${f.out} retired; since the retirement they share ${rt(s.g.fresh)}.`],
            [[...s.g.fresh, 1], `Kept the ratio of ${list(f.stay)} and gave ${s.nw} one more term.`],
            [[...s.f.stayOld, 1], 'Went back to the ratio before the retirement and added a term for the new partner.'],
            [[1, 1, 1], 'Shared the profit equally among the three.'],
          ],
          [
            `Since ${f.out}'s retirement ${list(f.stay)} share ${rt(s.g.fresh)}.`,
            ...s.given.map((x, i) => `${f.stay[i]} gives up ${ADM.fs(x)} and keeps ${ADM.fs(s.news[i])}.`),
            `${s.nw} gets ${ADM.fs(s.share)}. New ratio = ${rt(s.newRatio)}.`,
          ],
          ADM.H.newRatio,
        );
      },
      verify: (q: RatioQuestion) => {
        const k = readRetireAdmit(q.context ?? '');
        return k !== null && ADM.sameRatio(q.answer, k.news);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const avg = sum(s.profits) / 3;
        const premium = ADM.of(s.G2, s.share);
        return num(
          `How much premium for goodwill does ${s.nw} bring in?`,
          premium,
          [
            [s.G2, `Gave the goodwill of the whole firm, not ${s.nw}'s share of it.`],
            [ADM.of(avg, s.share), `Took ${s.nw}'s share of the average profit and forgot the ${s.n} years' purchase.`],
            [ADM.of(s.G1, s.share), `Used the goodwill of ${s.f.out}'s retirement, a year earlier.`],
            [s.G2 / 3, `Took ${s.nw}'s share as one third because there will be three partners.`],
          ],
          [`Average profit = (${s.profits.map(inr).join(' + ')}) / 3 = ${inr(avg)}.`, `Goodwill = ${inr(avg)} x ${s.n} = ${inr(s.G2)}.`, `Premium = ${inr(s.G2)} x ${ADM.fs(s.share)} = ${inr(premium)}.`],
          ADM.H.premium,
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readRetireAdmit(q.context ?? '');
        return k !== null && near(q.answer / 100, k.G2 * k.x);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { f } = s;
        const j = ADM.of(s.G2, s.given[0]) !== ADM.of(s.G2, s.given[1]) ? 0 : 1;
        const premium = ADM.of(s.G2, s.share);
        const right = ADM.of(s.G2, s.given[j]);
        const before = ADM.sharesOf(f.stayOld);
        return num(
          `How much of the premium is credited to ${f.stay[j]}'s Capital A/c?`,
          right,
          [
            [premium, `Gave ${f.stay[j]} the whole premium.`],
            [s.kind === 'old' ? ADM.of(premium, before[j]) : ADM.of(premium, ADM.sharesOf(s.g.fresh)[j]), s.kind === 'old' ? `Shared the premium in the ratio of ${list(f.stay)} before the retirement.` : `Shared the premium in the ratio of ${list(f.stay)}; they gave up equal shares, so they share it equally.`],
            [ADM.of(premium, ADM.fr(s.newRatio[j], sum(s.newRatio))), 'Gave the share of the premium in the new ratio; it goes in the sacrificing ratio.'],
            [ADM.of(s.G2, ADM.sharesOf(s.g.fresh)[j]), `Gave ${f.stay[j]} a share of the whole goodwill.`],
          ],
          [`Premium = ${inr(premium)}. ${f.stay[j]} gives up ${ADM.fs(s.given[j])} of ${ADM.fs(s.share)}: ${inr(premium)} x ${ADM.fs(ADM.over(s.given[j], s.share))} = ${inr(right)}.`],
          ADM.H.premium,
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readRetireAdmit(q.context ?? '');
        const j = k ? k.g.stay.indexOf(/credited to ([A-Z][a-z]+)'s Capital/.exec(q.prompt)?.[1] ?? '') : -1;
        return k !== null && j >= 0 && near(q.answer / 100, k.G2 * k.given[j]);
      },
    },
  ],
});

// ===============================================================================================================
// 13. case-life-loan-interest-omitted: a partner's loan on which nothing was agreed, whose interest (6% p.a., a
//     charge) was left out of last year's accounts; it is put right by one entry before a new partner is admitted,
//     and goodwill is valued on the profits with last year's profit corrected (complex). What varies: the lender, the
//     date of the loan, the deal of the admission, the figures.
// ===============================================================================================================

interface LoanOmitted {
  d: ADM.Deal;
  lender: number;
  k: number;
  loan: number;
  interest: number;
  reported: number;
  past: [number, number];
  n: number;
  G: number;
  credits: number[];
}

function readLoanOmitted(text: string) {
  const deal = ADM.readDeal(text);
  if (!deal) return null;
  const loanLine = lineOf(text, / lent the firm /);
  const lender = /^On \d+ [A-Z][a-z]+ \d{4}, ([A-Z][a-z]+) lent the firm/.exec(loanLine)?.[1] ?? '';
  const loan = amountsIn(loanLine)[0];
  const m = 12 - (monthsTo(/^On (\d+ [A-Z][a-z]+ \d{4})/.exec(loanLine)?.[1] ?? '') - 1);
  const interest = (loan * 6 * m) / 1200;
  const reported = figure(text, 'Profit for the year ended');
  const past = amountsIn(lineOf(text, 'Net profits of the two years before'));
  const n = Number(/valued at ([\d.]+) years' purchase/.exec(text)?.[1]);
  return { deal, lender, interest, G: ((past[0] + past[1] + reported - interest) / 3) * n };
}

const loanInterestOmitted = caseTemplate<LoanOmitted>({
  id: 'case-life-loan-interest-omitted',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: "A partner's loan, a correction and a new partner",
  setup: (rng) =>
    attempt(14, () => {
      const d = ADM.dealWhere(rng, ['old', 'old', 'equal', 'stated', 'one'], ADM.tidySac, 2);
      if (!d) return null;
      const T = sum(d.old);
      const lender = rng.int(0, 1);
      const k = rng.int(0, 8);
      const m = 12 - k;
      // A loan whose interest for the months splits among the partners in whole hundreds.
      const loan = RET.clean(rng, 40000, 300000, 10000, (L) => ((L * m) / 200) % (100 * T) === 0);
      if (loan === null) return null;
      const interest = (loan * 6 * m) / 1200;
      const n = rng.pick(YEARS_PURCHASE);
      const reported = rng.step(120000, 400000, 1000);
      const past = twoBefore(rng, reported - interest, n, unitFor([d.share, ...d.given.filter(ADM.isPos)]));
      if (!past) return null;
      const G = ((past[0] + past[1] + reported - interest) / 3) * n;
      return { d, lender, k, loan, interest, reported, past, n, G, credits: d.given.map((x) => ADM.of(G, x)) };
    }),
  context: (s) => {
    const { d } = s;
    const y = d.year;
    const day = `1 ${MONTHS[s.k]} ${s.k >= 9 ? y : y - 1}`;
    return [
      `${d.open} Their capitals are fluctuating, and goodwill is never raised in the books. The firm closes its books on 31 March.`,
      `On ${day}, ${d.olds[s.lender]} lent the firm ${inr(s.loan)}; nothing was agreed about interest on it.`,
      `Profit for the ${yearEnded(y)}, as first worked out and already shared: ${inr(s.reported)}. No interest on the loan was charged in it.`,
      `Net profits of the two years before, as per Profit and Loss A/c: ${inr(s.past[0])} (${yearEnded(y - 2)}) and ${inr(s.past[1])} (${yearEnded(y - 1)})`,
      `On 1 April ${y} the omission is put right by one entry through the partners' capital accounts, the interest being credited to ${d.olds[s.lender]}'s Loan A/c.`,
      `${d.admit} ${d.how}`,
      `Goodwill is valued at ${s.n} years' purchase of the average profit of the last three years, after the correction; ${d.nw} brings ${d.nw}'s share of it as premium in cash.`,
    ].join('\n');
  },
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const m = 12 - s.k;
        const nm = s.d.olds[s.lender];
        return num(
          `How much interest on ${nm}'s loan should have been charged for the ${yearEnded(s.d.year)}?`,
          s.interest,
          [
            [(s.loan * 6) / 100, 'Charged a whole year, although the loan was given part-way through it.'],
            [(s.loan * 6 * (m - 1)) / 1200, 'Left out the month in which the loan was given, though it came on the first day of that month.'],
            [(s.loan * 12 * m) / 1200, 'Took 12% p.a.; with nothing agreed, a partner\'s loan earns 6% p.a.'],
            [(s.loan * 6 * (12 - m)) / 1200, 'Counted the months before the loan instead of the months after it.'],
          ],
          [`Nothing was agreed, so the loan earns 6% p.a. (Indian Partnership Act, 1932).`, `It was with the firm for ${m} months: ${inr(s.loan)} x 6/100 x ${m}/12 = ${inr(s.interest)}.`],
          P.H.noDeed,
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readLoanOmitted(q.context ?? '');
        return k !== null && near(q.answer / 100, k.interest);
      },
    },
    {
      kind: 'journal',
      make: (s) => {
        const { d } = s;
        const T = sum(d.old);
        const parts = d.old.map((t) => (s.interest * t) / T);
        return {
          prompt: `Pass the journal entry on 1 April ${d.year} that puts the omission right.`,
          lines: [...d.olds.map((nm, i) => dr(partnerCapital(nm), parts[i])), cr(partnerLoan(d.olds[s.lender]), s.interest)],
          explanation: [
            `Interest on a partner's loan is a charge: had it been charged, the profit shared would have been ${inr(s.interest)} less.`,
            `So each partner was credited with too much profit, in the ratio ${rt(d.old)}: ${eachAnd(d.olds, parts)}. Their capital accounts are debited.`,
            `${d.olds[s.lender]}'s Loan A/c is credited with the whole interest, ${inr(s.interest)}: the firm owes it as part of the loan.`,
          ],
          hints: P.H.past,
          distractorAccounts: ['interestOnLoan', 'profitAndLossAppropriation', partnerCapital(d.nw)],
        };
      },
      verify: (q: JournalQuestion) => {
        const k = readLoanOmitted(q.context ?? '');
        return k !== null && near(posted(q, partnerLoan(k.lender), 'Cr'), k.interest) && k.deal.olds.every((nm, i) => near(posted(q, partnerCapital(nm), 'Dr'), k.interest * k.deal.shares[i]));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const [p1, p2] = s.past;
        const fixed = s.reported - s.interest;
        const avg = (p1 + p2 + fixed) / 3;
        return num(
          'At what amount is the goodwill of the firm valued?',
          s.G,
          [
            [((p1 + p2 + s.reported) / 3) * s.n, `Used last year's profit as first worked out; the interest on the loan is a charge, so the corrected profit is ${inr(fixed)}.`],
            [((p1 + p2 + s.reported + s.interest) / 3) * s.n, 'Added the interest to the profit instead of deducting it.'],
            [avg, `Stopped at the average profit and did not multiply it by ${s.n}.`],
            [((p1 + p2) / 2) * s.n, `Left out the ${yearEnded(s.d.year)}.`],
          ],
          [`Corrected profit of the ${yearEnded(s.d.year)} = ${inr(s.reported)} - ${inr(s.interest)} = ${inr(fixed)}.`, `Average profit = (${inr(p1)} + ${inr(p2)} + ${inr(fixed)}) / 3 = ${inr(avg)}.`, `Goodwill = ${inr(avg)} x ${s.n} = ${inr(s.G)}.`],
          ['Is every profit used for goodwill after all the charges?', "Correct the profit first, then average and multiply by the years' purchase."],
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readLoanOmitted(q.context ?? '');
        return k !== null && near(q.answer / 100, k.G);
      },
    },
    {
      kind: 'numeric',
      unit: 'ratio',
      make: (s) => {
        const { d } = s;
        const asOld = ADM.ratioOf([...d.oldShares.map((x) => ADM.times(x, ADM.minus(ADM.ONE, d.share))), d.share]);
        return ratioQ(
          `Find the new profit-sharing ratio of ${list(d.names)}.`,
          d.newRatio,
          [
            [[...d.old, 1], `Kept the old ratio and gave ${d.nw} one more term.`],
            [d.kind === 'old' ? [1, 1, 1] : asOld, d.kind === 'old' ? 'Shared the profit equally among the three.' : `Took ${d.nw}'s share in the old ratio, which is not what was agreed.`],
            [[d.newRatio[1], d.newRatio[0], d.newRatio[2]], 'Wrote the terms of the old partners against the wrong names.'],
          ],
          [...ADM.givesSteps(d), ...ADM.newShareSteps(d)],
          ADM.H.newRatio,
        );
      },
      verify: (q: RatioQuestion) => {
        const k = readLoanOmitted(q.context ?? '');
        return k !== null && ADM.sameRatio(q.answer, [...k.deal.shares.map((x, i) => x - k.deal.given[i]), k.deal.share]);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { d } = s;
        const j = s.credits[0] > 0 ? 0 : 1;
        const premium = ADM.of(s.G, d.share);
        const wrongG = ((s.past[0] + s.past[1] + s.reported) / 3) * s.n;
        return num(
          `How much of ${d.nw}'s premium is credited to ${d.olds[j]}'s Capital A/c?`,
          s.credits[j],
          [
            [premium, `Gave ${d.olds[j]} the whole premium.`],
            [ADM.of(wrongG, d.given[j]), "Worked the premium on the goodwill before last year's profit was corrected."],
            [(s.G * d.old[j]) / sum(d.old), `Gave ${d.olds[j]} a share of the whole goodwill, not of the premium.`],
            [(premium * d.newRatio[j]) / sum(d.newRatio), 'Shared the premium in the new ratio instead of the sacrificing ratio.'],
          ],
          [`Premium = ${inr(s.G)} x ${ADM.fs(d.share)} = ${inr(premium)}.`, ...ADM.givesSteps(d), ADM.sacStep(d), `${d.olds[j]} gets ${inr(premium)} x ${ADM.fs(d.parts[j])} = ${inr(s.credits[j])}.`],
          ADM.H.premium,
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readLoanOmitted(q.context ?? '');
        const j = k ? k.deal.olds.indexOf(/credited to ([A-Z][a-z]+)'s Capital/.exec(q.prompt)?.[1] ?? '') : -1;
        return k !== null && j >= 0 && near(q.answer / 100, k.G * k.deal.given[j]);
      },
    },
  ],
});

// ===============================================================================================================
// 14. case-life-change-then-dissolution: partners change their ratio at the start of a year (the whole reserve
//     distributed in the old ratio first), share that year's profit in the new ratio, and dissolve the firm at its end
//     (medium). What varies: two or three partners, the change, profit or loss on realisation, the partner asked.
// ===============================================================================================================

interface ChangeDissolve {
  names: string[];
  ch: CPR.Change;
  firm: string;
  y: number;
  caps: number[];
  R: number;
  profit: number;
  drawings: number[];
  closing: number[];
  bv: number;
  rv: number;
  creditors: number;
  e: number;
  result: number;
  ask: number;
}

function readChangeDissolve(text: string) {
  const first = text.split('\n')[0];
  const names = (/^(.+?) are partners/.exec(first)?.[1] ?? '').split(/, | and /);
  const oldR = ratioFrom(/Until .*? they shared profits and losses (equally|in the ratio [\d:]+)/.exec(first)?.[1] ?? '', names.length);
  const neuR = ratioFrom(/they agreed to share them (equally|in the ratio [\d:]+)/.exec(first)?.[1] ?? '', names.length);
  if (!oldR || !neuR) return null;
  const old = shares(oldR);
  const neu = shares(neuR);
  const caps = names.map((nm) => amountOf(lineOf(text, 'Capitals on'), nm));
  const R = figure(text, 'General Reserve');
  const profit = figure(text, 'Net profit for the year ended');
  const drawings = names.map((nm) => amountOf(lineOf(text, 'Drawings during the year'), nm));
  const closing = names.map((_, i) => caps[i] + R * old[i] + profit * neu[i] - drawings[i]);
  const al = amountsIn(lineOf(text, 'Assets other than cash at bank'));
  const creditors = figure(text, 'Creditors');
  const e = figure(text, 'Realisation expenses');
  const result = al[1] - al[0] - e;
  return { names, old, neu, R, profit, closing, result, finals: closing.map((c, i) => c + result * neu[i]), creditors };
}

const changeThenDissolution = caseTemplate<ChangeDissolve>({
  id: 'case-life-change-then-dissolution',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'A new ratio for a last year',
  setup: (rng) =>
    attempt(14, () => {
      const ch = rng.pick([...CPR.TWO, ...CPR.THREE.filter((c) => c.L <= 30)]);
      const n = ch.old.length;
      const names = P.partners(rng, n);
      const y = rng.pick([2024, 2025, 2026]);
      const base = rng.pick([50000, 100000]);
      const caps = rng.shuffle(rng.pick(n === 2 ? P.CAPS2 : P.CAPS3)).map((u) => u * base);
      const R = RET.mult(rng, ch.so * 1000, 20000, 120000);
      const profit = RET.mult(rng, ch.sn * 1000, Math.max(60000, 0.1 * sum(caps)), 0.3 * sum(caps));
      if (R === null || profit === null) return null;
      const drawings = names.map(() => rng.step(20000, 80000, 10000));
      const closing = names.map((_, i) => caps[i] + (R * ch.old[i]) / ch.so + (profit * ch.neu[i]) / ch.sn - drawings[i]);
      if (closing.some((c) => c < 40000)) return null;
      const creditors = rng.step(40000, 150000, 5000);
      const bv = Math.round((sum(closing) + creditors - rng.step(20000, 80000, 5000)) / 5000) * 5000;
      if (sum(closing) + creditors - bv < 10000) return null;
      const e = rng.step(2000, 9000, 1000);
      let rv = Math.round((bv * (1 + rng.pick([-0.2, -0.12, -0.08, 0.06]))) / 1000) * 1000;
      let k = 0;
      while (k < 40 && ((((rv - bv - e) % (ch.sn * 100)) + ch.sn * 100) % (ch.sn * 100) !== 0 || rv - bv - e === 0)) {
        rv -= 100;
        k++;
      }
      const result = rv - bv - e;
      if (k === 40 || Math.abs(result) < ch.sn * 1000) return null;
      if (closing.some((c, i) => c + (result * ch.neu[i]) / ch.sn < 5000)) return null;
      return { names, ch, firm: FIRM_OF(rng), y, caps, R, profit, drawings, closing, bv, rv, creditors, e, result, ask: rng.int(0, n - 1) };
    }),
  context: (s) => {
    const { names, ch, y } = s;
    return [
      `${list(names)} are partners in ${s.firm}. Until 31 March ${y - 1} they shared profits and losses ${inRatio(ch.old)}; from 1 April ${y - 1} they agreed to share them ${inRatio(ch.neu)}. Their capitals are fluctuating, and the deed allows no interest, salary or commission.`,
      `Capitals on 1 April ${y - 1}: ${each(names, s.caps)}`,
      `General Reserve on that date: ${inr(s.R)}; the whole of it is distributed on the change of ratio. The partners agreed to make no adjustment for goodwill on the change and not to revalue the assets and liabilities.`,
      `Net profit for the ${yearEnded(y)}: ${inr(s.profit)}`,
      `Drawings during the year: ${each(names, s.drawings)}`,
      `The firm was dissolved on 31 March ${y}, once the year's profit had been shared. Every receipt and payment was by cheque.`,
      `Assets other than cash at bank, at book value ${inr(s.bv)}, realised ${inr(s.rv)}`,
      `Creditors of ${inr(s.creditors)} were paid in full`,
      `Realisation expenses, borne and paid by the firm: ${inr(s.e)}`,
    ].join('\n');
  },
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { ch } = s;
        const i = s.ch.d[s.ask] !== 0 ? s.ask : s.ch.d.findIndex((x) => x !== 0);
        const nm = s.names[i];
        const right = (s.R * ch.old[i]) / ch.so;
        return num(
          `How much of the General Reserve is credited to ${nm}'s Capital A/c?`,
          right,
          [
            [(s.R * ch.neu[i]) / ch.sn, 'Shared the reserve in the new ratio; it was built up while the partners shared in the old ratio.'],
            [s.R / s.names.length, 'Shared the reserve equally.'],
            [s.R, `Gave ${nm} the whole reserve.`],
          ],
          [`The reserve belongs to the time before the change, so it is shared in the old ratio ${rt(ch.old)}: ${inr(s.R)} x ${fr(ch.old[i], ch.so)} = ${inr(right)}.`],
          CPR.H.reserves,
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readChangeDissolve(q.context ?? '');
        const i = k ? k.names.indexOf(/credited to ([A-Z][a-z]+)'s Capital/.exec(q.prompt)?.[1] ?? '') : -1;
        return k !== null && i >= 0 && near(q.answer / 100, k.R * k.old[i]);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { ch } = s;
        const i = s.ch.d[s.ask] !== 0 ? s.ask : s.ch.d.findIndex((x) => x !== 0);
        const nm = s.names[i];
        const right = s.closing[i];
        const sh = (s.profit * ch.neu[i]) / ch.sn;
        return num(
          `What is the balance of ${nm}'s Capital A/c on 31 March ${s.y}, before the dissolution?`,
          right,
          [
            [right - sh + (s.profit * ch.old[i]) / ch.so, 'Shared the profit of the year in the old ratio; from 1 April the partners share in the new one.'],
            [right - (s.R * ch.old[i]) / ch.so + (s.R * ch.neu[i]) / ch.sn, 'Shared the reserve in the new ratio.'],
            [right + s.drawings[i], `Did not debit ${nm} with the drawings.`],
            [right - (s.R * ch.old[i]) / ch.so, `Left out ${nm}'s share of the reserve.`],
          ],
          [
            `${nm}'s Capital A/c: ${RET.tally(s.caps[i], [
              [`share of the General Reserve, old ratio ${fr(ch.old[i], ch.so)}`, (s.R * ch.old[i]) / ch.so],
              [`share of profit, new ratio ${fr(ch.neu[i], ch.sn)}`, sh],
              ['drawings', -s.drawings[i]],
            ])} = ${inr(right)}.`,
          ],
          CPR.H.capitals,
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readChangeDissolve(q.context ?? '');
        const i = k ? k.names.indexOf(/balance of ([A-Z][a-z]+)'s Capital/.exec(q.prompt)?.[1] ?? '') : -1;
        return k !== null && i >= 0 && near(q.answer / 100, k.closing[i]);
      },
    },
    {
      kind: 'mcq',
      make: (s) =>
        choice(
          'What does Realisation A/c show?',
          DIS.profitOrLoss(s.result),
          [
            [DIS.profitOrLoss(-s.result), s.result > 0 ? 'Read the heavier credit side as a loss.' : 'Read the heavier debit side as a profit.'],
            [DIS.profitOrLoss(s.result + s.e), 'Left out the realisation expenses.'],
            [DIS.profitOrLoss(s.result - s.creditors), 'Debited the creditors paid but left them off the credit side.'],
            [DIS.profitOrLoss(s.result + s.creditors), 'Credited the creditors but did not debit the payment to them.'],
          ],
          `Debit: assets ${inr(s.bv)} + creditors paid ${inr(s.creditors)} + expenses ${inr(s.e)} = ${inr(s.bv + s.creditors + s.e)}. Credit: creditors ${inr(s.creditors)} + assets realised ${inr(s.rv)} = ${inr(s.creditors + s.rv)}. ${DIS.resultLine(s.bv + s.creditors + s.e, s.creditors + s.rv)}`,
          DIS.H.realisation,
        ),
      verify: (q: McqQuestion) => {
        const k = readChangeDissolve(q.context ?? '');
        return k !== null && optionText(q) === DIS.profitOrLoss(k.result);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { ch } = s;
        const i = (s.ask + 1) % s.names.length;
        const nm = s.names[i];
        const sh = (s.result * ch.neu[i]) / ch.sn;
        const right = s.closing[i] + sh;
        return num(
          `How much is finally paid to ${nm}?`,
          right,
          [
            [s.closing[i] + (s.result * ch.old[i]) / ch.so, 'Shared the result on realisation in the old ratio; on the day of dissolution the partners share in the new one.'],
            [s.closing[i] - sh, `Took the ${s.result > 0 ? 'profit' : 'loss'} on realisation the wrong way.`],
            [s.closing[i], 'Left out the share of the result on realisation.'],
            [s.caps[i] + sh, "Started from the capital of 1 April, leaving out the reserve and the year's profit and drawings."],
          ],
          [
            `${nm}'s capital before the dissolution = ${inr(s.closing[i])}.`,
            `Share of the ${s.result > 0 ? 'profit' : 'loss'} on realisation, in the new ratio = ${inr(Math.abs(s.result))} x ${fr(ch.neu[i], ch.sn)} = ${inr(Math.abs(sh))}.`,
            `Final payment = ${inr(s.closing[i])} ${sh > 0 ? '+' : '-'} ${inr(Math.abs(sh))} = ${inr(right)}.`,
          ],
          DIS.H.closing,
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readChangeDissolve(q.context ?? '');
        const i = k ? k.names.indexOf(/finally paid to ([A-Z][a-z]+)\?/.exec(q.prompt)?.[1] ?? '') : -1;
        return k !== null && i >= 0 && near(q.answer / 100, k.finals[i]);
      },
    },
  ],
});

// ===============================================================================================================
// 15. case-life-admission-reserves-revaluation: an admission with a revaluation, a Workmen Compensation Reserve that
//     meets a claim (its surplus to the old partners, a shortfall a loss on revaluation), the General Reserve, and a
//     premium for goodwill valued by capitalising the super profit (complex). What varies: the changes on revaluation,
//     a surplus or a shortfall, the deal, the partner asked.
// ===============================================================================================================

interface AdmitReserves {
  d: ADM.Deal;
  made: RET.Change[];
  W: number;
  claim: number;
  R: number;
  V: number;
  ce: number;
  rate: number;
  avg: number;
  G: number;
  credits: number[];
}

const keptReserves = keepFor<AdmitReserves>();

const admitReserves = caseTemplate<AdmitReserves>({
  id: 'case-life-admission-reserves-revaluation',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Reserves, revaluation and a new partner',
  setup: (rng) =>
    attempt(16, () => {
      const d = ADM.dealWhere(rng, ['old', 'old', 'equal', 'stated', 'one'], ADM.tidySac, 2);
      if (!d) return null;
      const T = sum(d.old);
      const made = RET.changesOf(rng, T * 500, rng.pick([2, 3]), ['building', 'machinery', 'stock', 'debtors', 'creditors', 'investments']);
      if (!made) return null;
      const W = RET.mult(rng, T * 1000, 20000, 80000);
      const claim = W === null ? null : RET.mult(rng, T * 1000, W * 0.4, W * 1.5);
      if (W === null || claim === null || claim === W) return null;
      // The loss on revaluation includes the part of the claim the reserve cannot meet.
      const V = sum(made.map((c) => c.sign * c.amount)) - Math.max(claim - W, 0);
      if (V === 0 || Math.abs(V) % (T * 100) !== 0) return null;
      const R = RET.mult(rng, T * 1000, 20000, 120000);
      const rate = rng.pick([10, 15, 20]);
      const G = ADM.amountFor(rng, 60000, 360000, [d.share, ...d.given]);
      if (R === null || G === null) return null;
      const ce = rng.step(400000, 1200000, 50000);
      const sp = (G * rate) / 100;
      if (!Number.isInteger(sp) || sp % 100 !== 0) return null;
      return { d, made, W, claim, R, V, ce, rate, avg: (ce * rate) / 100 + sp, G, credits: d.given.map((x) => ADM.of(G, x)) };
    }),
  context: (s) => {
    const { d } = s;
    const books = s.made.filter((c) => c.book > 0).map((c) => `${c.item} ${inr(c.book)}`);
    const text = [
      `${d.open} Their capitals are fluctuating, and goodwill is never raised in the books.`,
      `${d.admit} ${d.how}`,
      `Book values on that date: ${books.join(', ')}; Workmen Compensation Reserve ${inr(s.W)}; General Reserve ${inr(s.R)}`,
      'On the admission it is agreed that:',
      ...s.made.map((c) => c.text),
      `A claim for workmen compensation of ${inr(s.claim)} is admitted, and is to be met first out of the Workmen Compensation Reserve.`,
      'The whole of the General Reserve, and whatever is left of the Workmen Compensation Reserve, are distributed among the old partners.',
      `Goodwill is valued by capitalising the super profit at the normal rate of return of ${s.rate}%; capital employed ${inr(s.ce)}, average profit ${inr(s.avg)}. ${d.nw} brings ${d.nw}'s share of goodwill as premium in cash.`,
    ].join('\n');
    keptReserves.keep(text, s);
    return text;
  },
  parts: [
    {
      kind: 'mcq',
      make: (s) => {
        const gains = s.made.filter((c) => c.sign > 0);
        const losses = s.made.filter((c) => c.sign < 0);
        const short = Math.max(s.claim - s.W, 0);
        const surplus = Math.max(s.W - s.claim, 0);
        return choice(
          'What does Revaluation A/c show on the admission?',
          DIS.profitOrLoss(s.V).replace(/^(Profit|Loss)/, '$1 on revaluation'),
          [
            [DIS.profitOrLoss(-s.V).replace(/^(Profit|Loss)/, '$1 on revaluation'), 'Took the gains for losses and the losses for gains.'],
            ...(short > 0 ? ([[DIS.profitOrLoss(s.V + short).replace(/^(Profit|Loss)/, '$1 on revaluation'), 'Left out the part of the claim the reserve cannot meet; that shortfall is a loss on revaluation.']] as [string, string][]) : []),
            ...(surplus > 0 ? ([[DIS.profitOrLoss(s.V + surplus).replace(/^(Profit|Loss)/, '$1 on revaluation'), 'Took the surplus of the Workmen Compensation Reserve to Revaluation A/c; it goes straight to the old partners.']] as [string, string][]) : []),
            ...(surplus > 0 ? ([[DIS.profitOrLoss(s.V - s.claim).replace(/^(Profit|Loss)/, '$1 on revaluation'), 'Debited the whole claim to Revaluation A/c, though the reserve meets it.']] as [string, string][]) : []),
            [DIS.profitOrLoss(s.V + s.R).replace(/^(Profit|Loss)/, '$1 on revaluation'), 'Took the General Reserve to Revaluation A/c; it goes straight to the old partners.'],
            ...(s.made.length > 1 ? ([[DIS.profitOrLoss(s.V - s.made[0].sign * s.made[0].amount).replace(/^(Profit|Loss)/, '$1 on revaluation'), `Left out the first change: ${s.made[0].work}.`]] as [string, string][]) : []),
          ],
          [
            ...s.made.map((c) => `${c.work}: a ${c.sign > 0 ? 'gain' : 'loss'}.`),
            short > 0 ? `The claim of ${inr(s.claim)} exceeds the reserve of ${inr(s.W)}: the shortfall of ${inr(short)} is a loss on revaluation.` : `The claim of ${inr(s.claim)} is met out of the reserve; it does not touch Revaluation A/c.`,
            `Gains ${inr(sum(gains.map((c) => c.amount)))}; losses ${inr(sum(losses.map((c) => c.amount)) + short)}: ${s.V > 0 ? 'a profit' : 'a loss'} of ${inr(Math.abs(s.V))}.`,
          ].join(' '),
          CPR.H.revaluation,
        );
      },
      verify: (q: McqQuestion) => {
        const s = keptReserves.of(q.context ?? '');
        if (!s) return false;
        // The long way: post every change and the shortfall of the reserve, and read the balance of Revaluation A/c.
        const short = Math.max(s.claim - s.W, 0);
        const ledger = post([...s.made.map(RET.changeLines), ...(short > 0 ? [[dr('revaluation', short), cr('workmenCompensationClaim', short)]] : [])]);
        const V = -(ledger.get('revaluation') ?? 0) / 100;
        return optionText(q) === DIS.profitOrLoss(V).replace(/^(Profit|Loss)/, '$1 on revaluation');
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { d } = s;
        const T = sum(d.old);
        const i = 0;
        const nm = d.olds[i];
        const surplus = Math.max(s.W - s.claim, 0);
        const net = ((s.R + surplus + s.V) * d.old[i]) / T;
        const wrong = (x: number): number => Math.abs((x * d.old[i]) / T);
        if (net === 0) return null;
        // When the loss on revaluation outweighs the reserves the capital falls, and the question asks by how much.
        const up = net > 0;
        const total = s.R + surplus + s.V;
        return num(
          `By how much, in all, do the two reserves and the result of revaluation ${up ? 'raise' : 'reduce'} ${nm}'s capital?`,
          Math.abs(net),
          [
            [wrong(s.R + s.W + s.V), 'Gave the old partners the whole Workmen Compensation Reserve, ignoring the claim it must meet.'],
            [wrong(s.R + surplus - s.V), `Took the ${s.V > 0 ? 'profit' : 'loss'} on revaluation the wrong way.`],
            [Math.abs((total * d.newRatio[i]) / sum(d.newRatio)), 'Shared them in the new ratio; they belong to the old partners in the old ratio.'],
            [wrong(s.R + surplus), 'Left out the result of revaluation.'],
            [wrong(s.R + s.V), 'Left out what is left of the Workmen Compensation Reserve.'],
          ],
          [
            `General Reserve ${inr(s.R)}${surplus > 0 ? ` + what is left of the Workmen Compensation Reserve ${inr(s.W)} - ${inr(s.claim)} = ${inr(surplus)}` : ' (the Workmen Compensation Reserve is used up by the claim)'} ${s.V > 0 ? '+' : '-'} ${s.V > 0 ? 'profit' : 'loss'} on revaluation ${inr(Math.abs(s.V))} = ${up ? '' : 'a net reduction of '}${inr(Math.abs(total))}.`,
            `${nm}'s share in the old ratio ${rt(d.old)}: ${inr(Math.abs(total))} x ${fr(d.old[i], T)} = ${inr(Math.abs(net))}${up ? '' : `, by which ${nm}'s capital falls`}.`,
          ],
          CPR.H.specific,
        );
      },
      verify: (q: NumericQuestion) => {
        const s = keptReserves.of(q.context ?? '');
        if (!s) return false;
        const short = Math.max(s.claim - s.W, 0);
        // The long way: post the changes, the claim against the reserve and the transfers, and read the partner's capital.
        const T = sum(s.d.old);
        const V = sum(s.made.map((c) => c.sign * c.amount)) - short;
        const left = Math.max(s.W - s.claim, 0);
        const entries = [
          ...s.made.map(RET.changeLines),
          [dr('workmenCompensationReserve', Math.min(s.W, s.claim)), cr('workmenCompensationClaim', Math.min(s.W, s.claim))],
          ...(short > 0 ? [[dr('revaluation', short), cr('workmenCompensationClaim', short)]] : []),
          ...(left > 0 ? [[dr('workmenCompensationReserve', left), ...s.d.olds.map((nm, i) => cr(partnerCapital(nm), (left * s.d.old[i]) / T))]] : []),
          [dr('generalReserve', s.R), ...s.d.olds.map((nm, i) => cr(partnerCapital(nm), (s.R * s.d.old[i]) / T))],
          V > 0 ? [dr('revaluation', V), ...s.d.olds.map((nm, i) => cr(partnerCapital(nm), (V * s.d.old[i]) / T))] : [...s.d.olds.map((nm, i) => dr(partnerCapital(nm), (-V * s.d.old[i]) / T)), cr('revaluation', -V)],
        ];
        const ledger = post(entries);
        const moved = -(ledger.get(partnerCapital(s.d.olds[0])) ?? 0) / 100;
        const says = /\b(raise|reduce) [A-Z][a-z]+'s capital/.exec(q.prompt)?.[1];
        return (ledger.get('revaluation') ?? 0) === 0 && says === (moved > 0 ? 'raise' : 'reduce') && near(q.answer / 100, Math.abs(moved));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const normal = (s.ce * s.rate) / 100;
        const sp = s.avg - normal;
        return num(
          'At what amount is goodwill valued?',
          s.G,
          [
            [(s.avg * 100) / s.rate, 'Capitalised the average profit instead of the super profit.'],
            [sp, 'Stopped at the super profit and did not capitalise it.'],
            [sp * 2, "Took two years' purchase of the super profit; the method here capitalises it."],
            [(s.avg * 100) / s.rate + s.ce, 'Added the capital employed to the capitalised average profit instead of deducting it.'],
          ],
          [`Normal profit = ${inr(s.ce)} x ${s.rate}/100 = ${inr(normal)}.`, `Super profit = ${inr(s.avg)} - ${inr(normal)} = ${inr(sp)}.`, `Goodwill = ${inr(sp)} x 100/${s.rate} = ${inr(s.G)}.`],
          ['Find the super profit, then the capital that would earn it at the normal rate.', 'Goodwill = super profit x 100 / normal rate of return.'],
        );
      },
      verify: (q: NumericQuestion) => {
        const text = q.context ?? '';
        const rate = Number(/normal rate of return of (\d+)%/.exec(text)?.[1]);
        const ce = amountsIn(/capital employed (₹[\d,]+)/.exec(text)?.[1] ?? '')[0];
        const avg = amountsIn(/average profit (₹[\d,]+)/.exec(text)?.[1] ?? '')[0];
        return near(q.answer / 100, ((avg - (ce * rate) / 100) * 100) / rate);
      },
    },
    {
      kind: 'numeric',
      unit: 'ratio',
      make: (s) => {
        const { d } = s;
        const asOld = ADM.ratioOf([...d.oldShares.map((x) => ADM.times(x, ADM.minus(ADM.ONE, d.share))), d.share]);
        return ratioQ(
          `Find the new profit-sharing ratio of ${list(d.names)}.`,
          d.newRatio,
          [
            [[...d.old, 1], `Kept the old ratio and gave ${d.nw} one more term.`],
            [d.kind === 'old' ? [1, 1, 1] : asOld, d.kind === 'old' ? 'Shared the profit equally among the three.' : `Took ${d.nw}'s share in the old ratio, which is not what was agreed.`],
            [[d.newRatio[1], d.newRatio[0], d.newRatio[2]], 'Wrote the terms of the old partners against the wrong names.'],
            ...(d.kind === 'old' ? [] : ([[[1, 1, 1], 'Shared the profit equally among the three.']] as [number[], string][])),
          ],
          [...ADM.givesSteps(d), ...ADM.newShareSteps(d)],
          ADM.H.newRatio,
        );
      },
      verify: (q: RatioQuestion) => {
        const k = ADM.readDeal(q.context ?? '');
        return k !== null && ADM.sameRatio(q.answer, [...k.shares.map((x, i) => x - k.given[i]), k.share]);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { d } = s;
        const j = s.credits[1] > 0 ? 1 : 0;
        const premium = ADM.of(s.G, d.share);
        return num(
          `How much of ${d.nw}'s premium is credited to ${d.olds[j]}'s Capital A/c?`,
          s.credits[j],
          [
            [premium, `Gave ${d.olds[j]} the whole premium.`],
            [premium / 2, 'Shared the premium equally between the old partners.'],
            [(premium * d.old[j]) / sum(d.old), 'Shared the premium in the old ratio instead of the sacrificing ratio.'],
            [(s.G * d.old[j]) / sum(d.old), `Gave ${d.olds[j]} a share of the whole goodwill, not of the premium.`],
            [(premium * d.newRatio[j]) / sum(d.newRatio), 'Shared the premium in the new ratio instead of the sacrificing ratio.'],
            [ADM.of((s.avg * 100) / s.rate, d.given[j]), 'Worked the premium on the capitalised average profit, not on the goodwill.'],
          ],
          [`Premium = ${inr(s.G)} x ${ADM.fs(d.share)} = ${inr(premium)}.`, ...ADM.givesSteps(d), ADM.sacStep(d), `${d.olds[j]} gets ${inr(premium)} x ${ADM.fs(d.parts[j])} = ${inr(s.credits[j])}.`],
          ADM.H.premium,
        );
      },
      verify: (q: NumericQuestion) => {
        const s = keptReserves.of(q.context ?? '');
        const k = ADM.readDeal(q.context ?? '');
        const j = k ? k.olds.indexOf(/credited to ([A-Z][a-z]+)'s Capital/.exec(q.prompt)?.[1] ?? '') : -1;
        return s !== undefined && k !== null && j >= 0 && near(q.answer / 100, s.G * k.given[j]);
      },
    },
  ],
});

// ===============================================================================================================
// 16. case-life-single-entry-then-admission: on a change of ratio the partners leave the General Reserve and the
//     revaluation of their assets out of the books and pass one adjusting entry instead; a year later they admit a
//     partner and then distribute that reserve, in the ratio they share in by then (complex). What varies: the
//     change, the size of the gain on revaluation, the deal of the admission, the partner asked.
// ===============================================================================================================

interface SingleEntry {
  d: ADM.Deal;
  ch: CPR.Change;
  firm: string;
  R: number;
  V: number;
  profits: number[];
  n: number;
  G: number;
  credits: number[];
}

function readSingleEntry(text: string) {
  const first = text.split('\n')[0];
  const olds = (/^(.+?) are partners/.exec(first)?.[1] ?? '').split(/, | and /);
  const oldR = ratioFrom(/Until .*? they shared profits and losses (equally|in the ratio [\d:]+)/.exec(first)?.[1] ?? '', olds.length);
  const neuR = ratioFrom(/they agreed to share them (equally|in the ratio [\d:]+)/.exec(first)?.[1] ?? '', olds.length);
  if (!oldR || !neuR) return null;
  const R = figure(text, 'General Reserve in the books');
  const V = figure(text, 'Net gain on revaluing');
  const profits = amountsIn(lineOf(text, 'Net profits of the last three years'));
  const n = Number(/valued at ([\d.]+) years' purchase/.exec(text)?.[1]);
  const adm = lineOf(text, / is admitted /);
  const sh = /for (\d+)\/(\d+) share/.exec(adm);
  if (!sh) return null;
  const x = Number(sh[1]) / Number(sh[2]);
  const neu = shares(neuR);
  const given = /equally/.test(adm) ? neu.map(() => x / olds.length) : neu.map((v) => v * x);
  return { olds, old: shares(oldR), neu, R, V, G: (sum(profits) / 3) * n, given, news: [...neu.map((v, i) => v - given[i]), x] };
}

const singleEntryThenAdmission = caseTemplate<SingleEntry>({
  id: 'case-life-single-entry-then-admission',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'One adjusting entry, then a new partner',
  setup: (rng) =>
    attempt(16, () => {
      const m = rng.pick([2, 2, 3]);
      const d = ADM.dealWhere(rng, ['old', 'old', 'equal'], ADM.tidySac, m);
      if (!d) return null;
      const options = (m === 2 ? CPR.TWO : CPR.THREE).filter((c) => sameTerms(c.neu, d.old) && c.L <= 40);
      if (options.length === 0) return null;
      const ch = rng.pick(options);
      // The reserve and the gain moved between the partners come out in whole hundreds, and so does the reserve shared on the admission.
      const R = CPR.pickAmount(rng, 30000, 150000, (v) => ch.d.every((x) => (v * Math.abs(x)) % (ch.L * 100) === 0) && d.old.every((t) => (v * t) % (sum(d.old) * 100) === 0));
      const V = CPR.pickAmount(rng, 10000, 90000, (v) => ch.d.every((x) => (v * Math.abs(x)) % (ch.L * 100) === 0));
      if (R === null || V === null || R === V) return null;
      const n = rng.pick([2, 3, 1.5]);
      const unit = unitFor([d.share, ...d.given]);
      const fits: number[] = [];
      for (let a = 60000; a <= 300000; a += 1000) if (Number.isInteger(a * n) && (a * n) % unit === 0) fits.push(a);
      if (fits.length === 0) return null;
      const avg = rng.pick(fits);
      const p1 = rng.step(Math.round((avg * 0.8) / 1000) * 1000, Math.round((avg * 1.1) / 1000) * 1000, 1000);
      const p2 = rng.step(Math.round((avg * 0.85) / 1000) * 1000, Math.round((avg * 1.15) / 1000) * 1000, 1000);
      const p3 = 3 * avg - p1 - p2;
      if (p3 < avg * 0.75 || p3 > avg * 1.35 || new Set([p1, p2, p3]).size < 3) return null;
      const G = avg * n;
      return { d, ch, firm: FIRM_OF(rng), R, V, profits: [p1, p2, p3], n, G, credits: d.given.map((x) => ADM.of(G, x)) };
    }),
  context: (s) => {
    const { d, ch } = s;
    const y = d.year;
    return [
      `${list(d.olds)} are partners in ${s.firm}. Until 31 March ${y - 1} they shared profits and losses ${inRatio(ch.old)}; from 1 April ${y - 1} they agreed to share them ${inRatio(ch.neu)}. Their capitals are fluctuating, and goodwill is never raised in the books.`,
      `General Reserve in the books on 1 April ${y - 1}: ${inr(s.R)}`,
      `Net gain on revaluing the assets and liabilities on that date: ${inr(s.V)}`,
      'The partners decided to leave the reserve and the values of the assets and liabilities in the books as they stood, and to pass one adjusting entry instead.',
      `On 1 April ${y}, ${d.nw} is admitted for ${ADM.fs(d.share)} share, ${d.kind === 'old' ? `${list(d.olds)} keeping the ratio in which they then share` : `taken equally from ${list(d.olds)}`}. The whole of the General Reserve, still ${inr(s.R)}, is then distributed among the old partners.`,
      `Net profits of the last three years: ${s.profits.map((x, k) => `${inr(x)} (${yearEnded(y - 2 + k)})`).join(', ')}`,
      `Goodwill is valued at ${s.n} years' purchase of the average profit of the last three years; ${d.nw} brings ${d.nw}'s share of it as premium in cash.`,
    ].join('\n');
  },
  parts: [
    {
      kind: 'journal',
      make: (s) => {
        const { d, ch } = s;
        const base = s.R + s.V;
        return {
          prompt: `Pass the one adjusting entry on 1 April ${d.year - 1}.`,
          lines: CPR.compensation(ch, d.olds, base, false),
          explanation: [
            `What is left in the books belongs to the old ratio: reserve ${inr(s.R)} + gain on revaluation ${inr(s.V)} = ${inr(base)}.`,
            ...CPR.movesText(ch, d.olds),
            ...[...ch.gain, ...ch.sac].map((i) => `${d.olds[i]}: ${inr(base)} x ${CPR.frac(Math.abs(ch.d[i]), ch.L)} = ${inr(CPR.moved(base, ch, i))}.`),
            'The partner who gains is debited and the partner who sacrifices is credited; the reserve and the assets stay as they are.',
          ],
          hints: CPR.H.single,
          distractorAccounts: ['generalReserve', 'revaluation', 'goodwill'],
        };
      },
      verify: (q: JournalQuestion) => {
        const k = readSingleEntry(q.context ?? '');
        return k !== null && k.olds.every((nm, i) => near(posted(q, partnerCapital(nm), 'Cr') - posted(q, partnerCapital(nm), 'Dr'), (k.R + k.V) * (k.old[i] - k.neu[i])));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { d, ch } = s;
        const i = ch.d.findIndex((x) => x !== 0);
        const nm = d.olds[i];
        const right = (s.R * d.old[i]) / sum(d.old);
        return num(
          `How much of the General Reserve is credited to ${nm}'s Capital A/c on ${d.nw}'s admission?`,
          right,
          [
            [(s.R * ch.old[i]) / ch.so, `Shared the reserve in the ratio before the change; the adjusting entry already settled that, and on 1 April ${d.year} the partners share ${inRatio(ch.neu)}.`],
            [ADM.of(s.R, d.news[i]), `Shared the reserve in the new ratio after ${d.nw}'s admission; ${d.nw} has no part in it.`],
            [s.R / d.olds.length, 'Shared the reserve equally among the old partners.'],
          ],
          [`The adjusting entry of ${d.year - 1} compensated the partners for the change, so the reserve is now treated as belonging to them in the ratio they share in on ${d.nw}'s admission, ${rt(d.old)}: ${inr(s.R)} x ${fr(d.old[i], sum(d.old))} = ${inr(right)}.`],
          ADM.H.reserves,
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readSingleEntry(q.context ?? '');
        const i = k ? k.olds.indexOf(/credited to ([A-Z][a-z]+)'s Capital/.exec(q.prompt)?.[1] ?? '') : -1;
        return k !== null && i >= 0 && near(q.answer / 100, k.R * k.neu[i]);
      },
    },
    {
      kind: 'numeric',
      unit: 'ratio',
      make: (s) => {
        const { d, ch } = s;
        const before = ADM.sharesOf(ch.old);
        const fromBefore = ADM.ratioOf([...before.map((x, i) => ADM.minus(x, d.kind === 'old' ? ADM.times(x, d.share) : d.given[i])), d.share]);
        return ratioQ(
          `Find the new profit-sharing ratio of ${list(d.names)}.`,
          d.newRatio,
          [
            [fromBefore, `Started from the ratio before the change, ${rt(ch.old)}.`],
            [[...d.old, 1], `Kept the ratio of the old partners and gave ${d.nw} one more term.`],
            [d.names.map(() => 1), 'Shared the profit equally among all the partners.'],
          ],
          [`On 1 April ${d.year} the partners share ${inRatio(d.old)}.`, ...ADM.givesSteps(d), ...ADM.newShareSteps(d)],
          ADM.H.newRatio,
        );
      },
      verify: (q: RatioQuestion) => {
        const k = readSingleEntry(q.context ?? '');
        return k !== null && ADM.sameRatio(q.answer, k.news);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { d, ch } = s;
        const j = d.olds.findIndex((_, i) => s.credits[i] > 0);
        const premium = ADM.of(s.G, d.share);
        const avg = sum(s.profits) / 3;
        return num(
          `How much of ${d.nw}'s premium is credited to ${d.olds[j]}'s Capital A/c?`,
          s.credits[j],
          [
            [premium, `Gave ${d.olds[j]} the whole premium.`],
            [(premium * ch.old[j]) / ch.so, `Shared the premium in the ratio before the change, ${rt(ch.old)}.`],
            [(s.G * d.old[j]) / sum(d.old), `Gave ${d.olds[j]} a share of the whole goodwill, not of the premium.`],
            [ADM.of(avg, d.given[j]), `Worked on the average profit and forgot the ${s.n} years' purchase.`],
          ],
          [`Average profit = (${s.profits.map(inr).join(' + ')}) / 3 = ${inr(avg)}; goodwill = ${inr(avg)} x ${s.n} = ${inr(s.G)}.`, `Premium = ${inr(s.G)} x ${ADM.fs(d.share)} = ${inr(premium)}.`, ...ADM.givesSteps(d), ADM.sacStep(d), `${d.olds[j]} gets ${inr(premium)} x ${ADM.fs(d.parts[j])} = ${inr(s.credits[j])}.`],
          ADM.H.premium,
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readSingleEntry(q.context ?? '');
        const j = k ? k.olds.indexOf(/credited to ([A-Z][a-z]+)'s Capital/.exec(q.prompt)?.[1] ?? '') : -1;
        return k !== null && j >= 0 && near(q.answer / 100, k.G * k.given[j]);
      },
    },
  ],
});

// ===============================================================================================================
// Chained cases
// ===============================================================================================================

/**
 * An admission into a firm whose partners and ratio are given (the firm of a year that has just closed): the deal
 * of the examined topic, made on these partners. 'old': they keep their ratio; 'equal': the share is taken from them
 * equally; 'one': one of them gives it all. Null when no tidy share turns up.
 */
function dealOn(rng: Rng, olds: readonly string[], old: readonly number[], year: number, kinds: readonly ('old' | 'equal' | 'one')[]): ADM.Deal | null {
  const m = olds.length;
  const nw = rng.pick(ADM.NAMES.filter((nm) => !olds.includes(nm)));
  const names = [...olds, nw];
  const kind = rng.pick(kinds);
  const oldShares = ADM.sharesOf(old);
  for (let t = 0; t < 10; t++) {
    const share = rng.pick<ADM.Frac>([[1, 4], [1, 5], [1, 6], [1, 3], [1, 8], [1, 10]]);
    const giver = rng.int(0, m - 1);
    const given = kind === 'old' ? oldShares.map((x) => ADM.times(x, share)) : kind === 'equal' ? olds.map(() => ADM.fr(share[0], share[1] * m)) : olds.map((_, i) => (i === giver ? share : ADM.ZERO));
    const news = [...oldShares.map((x, i) => ADM.minus(x, given[i])), share];
    const newRatio = ADM.ratioOf(news);
    if (!newRatio || sum(newRatio) > 80) continue;
    if (oldShares.some((x, i) => news[i][0] * x[1] * 3 < x[0] * news[i][1])) continue;
    const how =
      kind === 'old'
        ? `${list(olds)} will share the remaining profit in their old ratio.`
        : kind === 'equal'
          ? `${nw} acquires this share equally from ${list(olds)}.`
          : `${nw} acquires the whole of this share from ${olds[giver]}.`;
    return {
      kind, olds: [...olds], nw, names, old: [...old], oldShares, share, given, news, newRatio, year, how,
      admit: `On 1 April ${year}, ${nw} is admitted as a partner for ${ADM.fs(share)} share in the profits.`,
      open: '',
      sac: ADM.ratioOf(given),
      parts: given.map((g) => ADM.over(g, share)),
      ...(kind === 'one' ? { giver } : {}),
    };
  }
  return null;
}

/** The year of a firm as the case text gives it, one item to a line (the examined wording of the topic's formats). */
function yearLines(y: PfPartnersYear): string[] {
  return [
    `${y.fixed ? 'Fixed capitals' : 'Capitals'} on ${y.yr.from}: ${each(y.names, y.caps)}`,
    ...(y.fixed ? [`Current accounts on ${y.yr.from}: ${y.names.map((nm, j) => `${nm} ${inr(Math.abs(y.currents[j]))} (${y.currents[j] < 0 ? 'Dr' : 'Cr'})`).join(', ')}`] : []),
    ...y.moves.map((m) => `${P.firstOf(y.yr, m.k)}: ${P.moveSays(y.names, m)}`),
    `Drawings during the year: ${each(y.names, y.drawings)}`,
    `Interest on capital: ${y.r}% p.a.`,
    sum(y.iod) > 0 ? `Interest on drawings: ${y.q}% p.a.; the dates of the drawings are not known` : 'No interest is charged on drawings',
    ...(sum(y.salary) > 0 ? [`Salary: ${inr(y.s)} per month to ${y.names[y.si]}`] : []),
    ...(sum(y.commission) > 0 ? [`Commission: ${inr(sum(y.commission))} for the year to ${y.names[y.ci]}`] : []),
    `Net profit for the ${y.yr.ended} as per Profit and Loss A/c: ${inr(y.profit)}`,
  ];
}
/** What the year leaves in each partner's own account: the capital (fluctuating) or the current account (fixed), a credit positive. */
const yearClosing = (y: PfPartnersYear): number[] =>
  y.names.map((_, j) => {
    const yearly = y.ioc[j] + y.salary[j] + y.commission[j] + y.shares[j] - y.drawings[j] - y.iod[j];
    return y.fixed ? y.currents[j] + yearly : y.caps[j] + sum(y.moves.filter((m) => m.i === j).map((m) => (m.kind === 'in' ? m.amt : -m.amt))) + yearly;
  });
const APP_SLIPS = (y: PfPartnersYear): string[] => [
  "Interest on Partner's Loan A/c", 'Drawings A/c', 'Balance c/d', `${y.names[0]}'s ${y.fixed ? 'Capital' : 'Current'} A/c`, 'General Reserve A/c', "Manager's Commission A/c",
  "Partner's Salary A/c", "Partner's Commission A/c", 'Interest on Drawings A/c', 'Premium for Goodwill A/c',
];
/** The working of an Appropriation Account of a year. */
function appWorking(y: PfPartnersYear): string[] {
  const out = [`interest on capital ${inr(sum(y.ioc))}`, ...(sum(y.salary) > 0 ? [`salary ${inr(sum(y.salary))}`] : []), ...(sum(y.commission) > 0 ? [`commission ${inr(sum(y.commission))}`] : [])];
  return [
    `The account opens with the net profit brought from Profit and Loss A/c: By Profit and Loss A/c ${inr(y.profit)}.`,
    ...(sum(y.iod) > 0 ? [`Interest on drawings is credited. With no dates it runs for six months at ${y.q}% p.a.: ${y.names.map((nm, j) => `${nm} ${inr(y.drawings[j])} x ${y.q}/100 x 6/12 = ${inr(y.iod[j])}`).join('; ')}; total ${inr(sum(y.iod))}.`] : []),
    `Interest on capital at ${y.r}% p.a. is debited: ${y.iocWorking.join(' ')} Total ${inr(sum(y.ioc))}.`,
    ...(sum(y.salary) > 0 ? [`Salary to ${y.names[y.si]} = ${inr(y.s)} x 12 = ${inr(sum(y.salary))}, debited.`] : []),
    ...(sum(y.commission) > 0 ? [`The commission of ${inr(sum(y.commission))} to ${y.names[y.ci]} is debited.`] : []),
    `Divisible profit = ${inr(y.profit)}${sum(y.iod) > 0 ? ` + ${inr(sum(y.iod))}` : ''} - ${out.join(' - ')} = ${inr(y.divisible)}.`,
    P.sharesText(y.names, y.divisible, y.psr),
    `Each share is debited and carried to the partner's ${y.fixed ? 'Current' : 'Capital'} A/c. The two sides then agree.`,
  ];
}
/** An Appropriation Account checked against the year worked by arithmetic: both sides, interest on capital and every share. */
function appHolds(q: AccountQuestion, y: PfPartnersYear): boolean {
  const [debit, creditSide] = q.sides.map((s) => s.rows);
  const total = (rows: typeof debit): number => sum(rows.map((r) => r.amounts[0])) / 100;
  const credits = y.profit + sum(y.iod);
  const divisible = credits - sum(y.ioc) - sum(y.salary) - sum(y.commission);
  const shown = (label: string): number => (debit.find((r) => r.label === label)?.amounts[0] ?? 0) / 100;
  return (
    near(total(debit), credits) &&
    near(total(creditSide), credits) &&
    near(shown('Interest on Capital A/c'), sum(y.ioc)) &&
    y.names.every((nm, j) => debit.some((r) => r.closing && r.label === `${nm}'s ${y.fixed ? 'Current' : 'Capital'} A/c` && near(r.amounts[0] / 100, (divisible * y.psr[j]) / sum(y.psr))))
  );
}
/** Partners' own accounts of a year in columns, closed and brought down. */
function yearColumns(y: PfPartnersYear) {
  const accountIds = y.names.map((nm) => P.ownId(y.fixed, nm));
  const opening = { date: y.yr.from, balances: P.openingBalances(y.fixed ? y.currents : y.caps) };
  return columnarSides(columnarAccount(P.yearEntries(y), accountIds, opening), { closeOn: y.yr.on, reopenOn: P.reopens(y.yr) });
}
/** Columns whose balances, carried and brought down, are those the year gives by arithmetic. */
function columnsClose(q: AccountQuestion, expected: number[]): boolean {
  const [debit, creditSide] = q.sides;
  const carried = (side: typeof debit): number[] => side.rows.find((row) => row.closing)?.amounts ?? [];
  const brought = (side: typeof debit): number[] => side.below[0]?.amounts ?? [];
  return expected.every((x, c) => near(((carried(debit)[c] ?? 0) - (carried(creditSide)[c] ?? 0)) / 100, x) && near(((brought(creditSide)[c] ?? 0) - (brought(debit)[c] ?? 0)) / 100, x));
}
/** The working of the partners' own accounts of a year. */
function columnsWorking(y: PfPartnersYear): string[] {
  const closing = yearClosing(y);
  return [
    y.fixed
      ? 'Capitals are fixed, so every yearly item goes through the current accounts, each partner in a column: Balance b/d first.'
      : 'Capitals are fluctuating, so every item of the year goes through the capital accounts. Each partner has a column, and a capital is a credit balance: By Balance b/d.',
    [y.fixed ? '' : P.movesWhy(y), `Interest on capital is credited: By Interest on Capital A/c. ${y.iocWorking.join(' ')}`].filter(Boolean).join(' '),
    ...P.allowedWhy(y),
    P.drawingsWhy(y),
    `Each partner's share of profit is taken from the Profit and Loss Appropriation Account: By Profit and Loss Appropriation A/c, ${each(y.names, y.shares)}.`,
    `Balances: ${P.balancesText(y.names, closing)}, carried down and brought down on ${P.reopens(y.yr)}.`,
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// 17. case-life-chain-year-admission: the Profit and Loss Appropriation Account of a year, the partners' capital
//     accounts for it (from the shares of profit), then the entries for a partner admitted the next day with a premium
//     for goodwill valued on three years' profits, the year just closed among them (complex). What varies: two or three
//     partners, capital brought in or withdrawn, a salary or commission, the deal, whether half the premium is withdrawn.
// ---------------------------------------------------------------------------------------------------------------

interface YearDeal {
  y: PfPartnersYear;
  d: ADM.Deal;
  R: number;
  past: [number, number];
  n: number;
  G: number;
  K: number;
  premium: number;
  credits: number[];
  half: boolean;
  closing: number[];
}

const keptYearDeal = keepFor<YearDeal>();

/** A year of a firm with fluctuating or fixed capitals, then the deal of an admission on the first day of the next. */
function yearThenDeal(rng: Rng, fixed: boolean): YearDeal | null {
  const drawn = P.partnersYear(rng, fixed, { changes: fixed ? [0] : [0, 0, 1] });
  // Capitals in keeping with the profit, as the stage of the topic makes them.
  const y = drawn && believable(drawn);
  if (!y) return null;
  const closing = yearClosing(y);
  if (closing.some((c) => c < (fixed ? 2000 : 50000))) return null;
  const d = dealOn(rng, y.names, y.psr, y.yr.y, ['old', 'old', 'equal', 'one']);
  if (!d) return null;
  const T = sum(y.psr);
  const R = RET.mult(rng, T * 1000, 20000, 120000);
  const n = rng.pick([2, 3, 2, 1.5]);
  const unit = unitFor([d.share, ...d.given.filter(ADM.isPos)]);
  const past = twoBefore(rng, y.profit, n, unit);
  if (R === null || !past) return null;
  const G = ((past[0] + past[1] + y.profit) / 3) * n;
  const premium = ADM.of(G, d.share);
  const credits = d.given.map((x) => ADM.of(G, x));
  // The new partner's capital, in keeping with the share bought.
  const fair = (sum(y.caps) * d.share[0]) / (d.share[1] - d.share[0]);
  const K = Math.max(50000, Math.round((fair * rng.int(80, 120)) / 100 / 10000) * 10000);
  return { y, d, R, past, n, G, K, premium, credits, half: !fixed && rng.int(0, 2) === 0 && credits.every((c) => c % 200 === 0), closing };
}

const chainYearAdmission = caseTemplate<YearDeal>({
  id: 'case-life-chain-year-admission',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Appropriation, capitals, then a new partner',
  setup: (rng) => attempt(8, () => yearThenDeal(rng, false)),
  context: (s) => {
    const { y, d } = s;
    const text = [
      `${list(y.names)} are partners in ${y.firm} sharing profits and losses in the ratio ${rt(y.psr)}. Their capitals are fluctuating. ${P.OWN_ACCOUNTS}${sum(y.iod) > 0 ? ` ${P.OWN_DRAWINGS}` : ''}`,
      ...yearLines(y),
      `General Reserve on 31 March ${y.yr.y}: ${inr(s.R)}`,
      `Net profits of the two years before, as per Profit and Loss A/c: ${inr(s.past[0])} (${yearEnded(y.yr.y - 2)}) and ${inr(s.past[1])} (${yearEnded(y.yr.y - 1)})`,
      `${d.admit} ${d.how} The whole of the General Reserve is distributed among the old partners.`,
      `${d.nw} brings ${inr(s.K)} as capital and ${d.nw}'s share of goodwill as premium, by cheque. Goodwill is valued at ${s.n} years' purchase of the average net profit of the last three years; no Goodwill A/c is raised.${s.half ? ` The partners who receive the premium withdraw half of it by cheque.` : ''}`,
    ].join('\n');
    keptYearDeal.keep(text, s);
    return text;
  },
  parts: [
    {
      kind: 'account',
      make: (s) => {
        const made = P.appropriationAccount({ yr: s.y.yr, names: s.y.names, fixed: false, psr: s.y.psr, profit: s.y.profit, ioc: s.y.ioc, salary: s.y.salary, commission: s.y.commission, iod: s.y.iod, reserve: 0 });
        return {
          task: P.appTask(s.y.yr, sum(s.y.iod) > 0),
          title: P.APP_TITLE,
          left: made.left,
          right: made.right,
          distractors: APP_SLIPS(s.y),
          explanation: appWorking(s.y),
          hints: P.H.approp,
        };
      },
      verify: (q: AccountQuestion) => {
        const s = keptYearDeal.of(q.data);
        return s !== undefined && appHolds(q, s.y);
      },
    },
    {
      kind: 'account',
      make: (s) => ({
        task: `Prepare the partners' capital accounts in columns for the ${s.y.yr.ended}, taking each partner's share of profit from the Profit and Loss Appropriation Account, and bring the balances down on ${P.reopens(s.y.yr)}.`,
        title: "Partners' Capital Accounts",
        columns: partnerColumns(s.y.names),
        ...yearColumns(s.y),
        distractors: ['Current A/c', 'Cash A/c', 'Premium for Goodwill A/c', 'General Reserve A/c', "Interest on Partner's Loan A/c", "Partner's Salary A/c", "Partner's Commission A/c", 'Interest on Drawings A/c', 'Interest on Capital A/c'],
        explanation: columnsWorking(s.y),
        hints: ["Which items add to a partner's capital and which take away from it?", P.H.ioc[0]],
      }),
      verify: (q: AccountQuestion) => {
        const s = keptYearDeal.of(q.data);
        if (!s) return false;
        // The long way: post the year's entries on the opening capitals and read each capital.
        const ledger = post(
          P.yearEntries(s.y).map((e) => e.lines),
          post([s.y.names.map((nm, j) => cr(partnerCapital(nm), s.y.caps[j]))].map((l) => [...l, dr('bank', sum(s.y.caps))])),
        );
        return columnsClose(q, s.y.names.map((nm) => -(ledger.get(partnerCapital(nm)) ?? 0) / 100));
      },
    },
    {
      kind: 'journal_set',
      make: (s) => {
        const { d } = s;
        const T = sum(d.old);
        const reserve = d.old.map((t) => (s.R * t) / T);
        const out = s.credits.map((c) => (s.half ? c / 2 : 0));
        const items = [
          {
            text: 'The General Reserve is distributed among the old partners.',
            lines: [dr('generalReserve', s.R), ...d.olds.map((nm, i) => cr(partnerCapital(nm), reserve[i]))],
            explanation: [`The reserve was built up before ${d.nw} came in: the old partners share it in their ratio ${rt(d.old)}: ${eachAnd(d.olds, reserve)}.`, 'General Reserve A/c is debited, which closes it, and their capital accounts are credited.'],
          },
          {
            text: `${d.nw} brings in capital and premium by cheque.`,
            lines: [dr('bank', s.K + s.premium), cr(partnerCapital(d.nw), s.K), cr('premiumForGoodwill', s.premium)],
            explanation: [
              `Average net profit = (${inr(s.past[0])} + ${inr(s.past[1])} + ${inr(s.y.profit)}) / 3 = ${inr(s.G / s.n)}; goodwill = ${inr(s.G / s.n)} x ${s.n} = ${inr(s.G)}.`,
              `Premium = ${inr(s.G)} x ${ADM.fs(d.share)} = ${inr(s.premium)}. Bank A/c is debited with ${inr(s.K)} + ${inr(s.premium)} = ${inr(s.K + s.premium)}; ${d.nw}'s Capital A/c and Premium for Goodwill A/c are credited.`,
            ],
          },
          {
            text: 'The premium is credited to the partners who sacrifice.',
            lines: ADM.entry(dr('premiumForGoodwill', s.premium), ...s.credits.map((c, i) => cr(partnerCapital(d.olds[i]), c))),
            explanation: [...ADM.givesSteps(d), ADM.sacStep(d), `Premium for Goodwill A/c is debited, which closes it; the sacrificing partners are credited: ${ADM.eachGets(d.olds, s.credits)}.`],
          },
          ...(s.half
            ? [
                {
                  text: 'The partners who receive the premium withdraw half of it.',
                  lines: ADM.entry(...out.map((o, i) => dr(partnerCapital(d.olds[i]), o)), cr('bank', sum(out))),
                  explanation: [`Half of what each was credited: ${ADM.eachGets(d.olds, out)}. Their capital accounts are debited and Bank A/c is credited.`],
                },
              ]
            : []),
        ];
        return {
          task: `Pass the journal entries on 1 April ${d.year} for ${d.nw}'s admission, in the order given.`,
          transactions: P.labelled(items),
          hints: ADM.H.newFirm,
          distractorAccounts: ['goodwill', 'revaluation', 'profitAndLossAppropriation', ...d.olds.map(partnerCurrent)],
        };
      },
      verify: (q) => {
        const s = keptYearDeal.of(q.context ?? '');
        if (!s) return false;
        const ledger = post(q.entries.map((e) => e.expected));
        const k = ADM.readDeal(q.context ?? '');
        if (!k) return false;
        const kept = s.half ? 0.5 : 1;
        return (
          (ledger.get('premiumForGoodwill') ?? 0) === 0 &&
          (ledger.get('generalReserve') ?? 0) === rupees(s.R) &&
          k.olds.every((nm, i) => near(-(ledger.get(partnerCapital(nm)) ?? 0) / 100, s.R * k.shares[i] + s.G * k.given[i] * kept)) &&
          near(-(ledger.get(partnerCapital(s.d.nw)) ?? 0) / 100, s.K)
        );
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 18. case-life-chain-fixed-year-admission: fixed capitals. The Profit and Loss Appropriation Account, the partners'
//     current accounts for the year, then the entries for a partner admitted the next day who brings capital but no
//     premium: goodwill through the current accounts, and the old partners' capitals brought into the new ratio on the
//     basis of the new partner's capital through their current accounts (complex).
// ---------------------------------------------------------------------------------------------------------------

interface FixedDeal {
  base: YearDeal;
  total: number;
  required: number[];
}

const keptFixedDeal = keepFor<FixedDeal>();

const chainFixedAdmission = caseTemplate<FixedDeal>({
  id: 'case-life-chain-fixed-year-admission',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Current accounts, then a new partner',
  setup: (rng) =>
    attempt(10, () => {
      const base = yearThenDeal(rng, true);
      if (!base) return null;
      const { d, y } = base;
      // The capital of the new firm, a whole thousand for every partner, near what the old capitals stand for.
      const den = d.news.reduce((l, f) => lcm(l, f[1]), d.share[1]);
      const target = sum(y.caps) / (1 - d.share[0] / d.share[1]);
      const total = roundMultiple(rng, 1000 * den, target * 0.85, target * 1.2);
      if (total === null) return null;
      const required = d.olds.map((_, i) => ADM.of(total, d.news[i]));
      if (required.every((x, i) => x === y.caps[i]) || required.some((x) => x < 30000)) return null;
      return { base: { ...base, K: ADM.of(total, d.share) }, total, required };
    }),
  context: (s) => {
    const { y, d } = s.base;
    const text = [
      `${list(y.names)} are partners in ${y.firm} sharing profits and losses in the ratio ${rt(y.psr)}. Their capitals are fixed. ${P.ITEMS_OWN}`,
      ...yearLines(y),
      `General Reserve on 31 March ${y.yr.y}: ${inr(s.base.R)}`,
      `Net profits of the two years before, as per Profit and Loss A/c: ${inr(s.base.past[0])} (${yearEnded(y.yr.y - 2)}) and ${inr(s.base.past[1])} (${yearEnded(y.yr.y - 1)})`,
      `${d.admit} ${d.how} The whole of the General Reserve is distributed among the old partners.`,
      `${d.nw} brings ${inr(s.base.K)} as capital by cheque but no premium. Goodwill is valued at ${s.base.n} years' purchase of the average net profit of the last three years and adjusted through the current accounts; no Goodwill A/c is raised.`,
      `The fixed capitals of ${list(d.olds)} are then brought into the new ratio on the basis of ${d.nw}'s capital; any surplus or shortage is transferred to their current accounts.`,
    ].join('\n');
    keptFixedDeal.keep(text, s);
    return text;
  },
  parts: [
    {
      kind: 'account',
      make: (s) => {
        const { y } = s.base;
        const made = P.appropriationAccount({ yr: y.yr, names: y.names, fixed: true, psr: y.psr, profit: y.profit, ioc: y.ioc, salary: y.salary, commission: y.commission, iod: y.iod, reserve: 0 });
        return { task: P.appTask(y.yr, sum(y.iod) > 0), title: P.APP_TITLE, left: made.left, right: made.right, distractors: APP_SLIPS(y), explanation: appWorking(y), hints: P.H.approp };
      },
      verify: (q: AccountQuestion) => {
        const s = keptFixedDeal.of(q.data);
        return s !== undefined && appHolds(q, s.base.y);
      },
    },
    {
      kind: 'account',
      make: (s) => {
        const { y } = s.base;
        return {
          task: `Prepare the partners' current accounts in columns for the ${y.yr.ended}, taking each partner's share of profit from the Profit and Loss Appropriation Account, and bring the balances down on ${P.reopens(y.yr)}.`,
          title: "Partners' Current Accounts",
          columns: partnerColumns(y.names),
          ...yearColumns(y),
          distractors: ['Capital A/c', 'Cash A/c', 'Premium for Goodwill A/c', 'General Reserve A/c', "Interest on Partner's Loan A/c", "Partner's Salary A/c", "Partner's Commission A/c", 'Interest on Drawings A/c', 'Interest on Capital A/c'],
          explanation: columnsWorking(y),
          hints: ['Capitals are fixed: what goes to the current accounts, and what stays in the capital accounts?', P.H.ioc[0]],
        };
      },
      verify: (q: AccountQuestion) => {
        const s = keptFixedDeal.of(q.data);
        if (!s) return false;
        const { y } = s.base;
        const ledger = post(P.yearEntries(y).map((e) => e.lines));
        return columnsClose(q, y.names.map((nm, j) => y.currents[j] - (ledger.get(partnerCurrent(nm)) ?? 0) / 100));
      },
    },
    {
      kind: 'journal_set',
      make: (s) => {
        const { d, y, R, G } = s.base;
        const T = sum(d.old);
        const reserve = d.old.map((t) => (R * t) / T);
        const premium = ADM.of(G, d.share);
        const credits = d.given.map((x) => ADM.of(G, x));
        const items = [
          {
            text: 'The General Reserve is distributed among the old partners.',
            lines: [dr('generalReserve', R), ...d.olds.map((nm, i) => cr(partnerCurrent(nm), reserve[i]))],
            explanation: [`The old partners share it in their ratio ${rt(d.old)}: ${eachAnd(d.olds, reserve)}.`, 'The capitals are fixed, so their current accounts are credited.'],
          },
          {
            text: `${d.nw} brings in capital by cheque.`,
            lines: [dr('bank', s.base.K), cr(partnerCapital(d.nw), s.base.K)],
            explanation: [`Bank A/c is debited and ${d.nw}'s Capital A/c is credited with ${inr(s.base.K)}: capital brought in is the one item that goes to a fixed capital account.`],
          },
          {
            text: `${d.nw}'s share of goodwill is adjusted.`,
            lines: ADM.entry(dr(partnerCurrent(d.nw), premium), ...credits.map((c, i) => cr(partnerCurrent(d.olds[i]), c))),
            explanation: [
              `Average net profit = (${inr(s.base.past[0])} + ${inr(s.base.past[1])} + ${inr(y.profit)}) / 3 = ${inr(G / s.base.n)}; goodwill = ${inr(G)}; ${d.nw}'s share = ${inr(G)} x ${ADM.fs(d.share)} = ${inr(premium)}.`,
              ...ADM.givesSteps(d),
              `${d.nw} brings no premium, so ${d.nw}'s Current A/c is debited and the sacrificing partners' current accounts are credited: ${ADM.eachGets(d.olds, credits)}.`,
            ],
          },
          ...d.olds.flatMap((nm, i) => {
            const diff = s.required[i] - y.caps[i];
            if (diff === 0) return [];
            return [
              {
                text: `${nm}'s capital is brought into the new ratio.`,
                lines: diff > 0 ? [dr(partnerCurrent(nm), diff), cr(partnerCapital(nm), diff)] : [dr(partnerCapital(nm), -diff), cr(partnerCurrent(nm), -diff)],
                explanation: [
                  `Capital of the new firm = ${inr(s.base.K)} x ${d.share[0] === 1 ? d.share[1] : `${d.share[1]}/${d.share[0]}`} = ${inr(s.total)}; ${nm}'s new share ${ADM.fs(d.news[i])} gives ${inr(s.required[i])}.`,
                  `${nm} has ${inr(y.caps[i])}, so the capital must ${diff > 0 ? 'rise' : 'fall'} by ${inr(Math.abs(diff))}: ${diff > 0 ? `${nm}'s Current A/c is debited and ${nm}'s Capital A/c credited` : `${nm}'s Capital A/c is debited and ${nm}'s Current A/c credited`}.`,
                ],
              },
            ];
          }),
        ];
        return {
          task: `Pass the journal entries on 1 April ${d.year} for ${d.nw}'s admission, in the order given.`,
          transactions: P.labelled(items),
          hints: ADM.H.capitals,
          distractorAccounts: ['goodwill', 'premiumForGoodwill', 'revaluation', ...d.olds.map(partnerDrawings)],
        };
      },
      verify: (q) => {
        const s = keptFixedDeal.of(q.context ?? '');
        const k = ADM.readDeal(q.context ?? '');
        if (!s || !k) return false;
        const ledger = post(q.entries.map((e) => e.expected));
        const capital = (nm: string): number => -(ledger.get(partnerCapital(nm)) ?? 0) / 100;
        const total = s.base.K / k.share;
        // Every capital of the new firm stands in the new ratio, the old ones counted from their fixed figures.
        return (
          (ledger.get('generalReserve') ?? 0) === rupees(s.base.R) &&
          k.olds.every((nm, i) => near(capital(nm) + s.base.y.caps[i], total * (k.shares[i] - k.given[i]))) &&
          near(capital(s.base.d.nw), total * k.share)
        );
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// A whole dissolution from a balance sheet a case has already made (after an admission, a retirement or a year), in
// the form of the topic's `windUp`: the same assets and liabilities, steps, events and checks, so that the examined
// Realisation A/c, capital accounts and Bank A/c of the topic (`realisationAccount` and the rest) are made from it.
// ---------------------------------------------------------------------------------------------------------------

type Owned = DIS.Books['assets'][number];
type Owed = DIS.Books['liabs'][number];
const REAL = 'realisation';
const DEBTORS: DIS.Thing = { id: 'debtors', name: 'Debtors', the: 'the debtors', plural: true };
const cap1 = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);
const low1 = (t: string): string => t.charAt(0).toLowerCase() + t.slice(1);

/** The balance sheet a dissolution starts from: everything at its value in the books on the day of dissolution. */
interface SheetIn {
  f: DIS.Firm;
  capitals: number[];
  bank: number;
  /** The main fixed asset, which is sold; its price is settled last so that every share of the result is round. */
  main: { t: DIS.Thing; book: number };
  stock: number;
  debtors: number;
  provision: number;
  /** A second asset (investments brought in on a revaluation, furniture): sold, about which nothing is said, or taken over. */
  second: { t: DIS.Thing; book: number } | null;
  creditors: number;
  outstanding: number;
  loan: { by: number; amount: number } | null;
  /** Something never in the books (self-generated goodwill) that is sold. */
  extra?: { what: string; short: string; cash: number } | null;
}
interface WindWays {
  stock: readonly ('sold' | 'taken')[];
  second: readonly ('sold' | 'silent' | 'partner')[];
  expenses: readonly DIS.ExpenseForm[];
}

/** One dissolution of the sheet given, as the topic's `windUp` makes one; null for a draw that does not work out. */
function windUpFrom(rng: Rng, s: SheetIn, w: WindWays): DIS.Books | null {
  const { f } = s;
  const n = f.names.length;
  const who = (i: number): string => f.names[i];
  const anyone = (): number => rng.int(0, n - 1);
  const capital = (i: number): string => partnerCapital(who(i));
  const share = (x: number, i: number): number => (x * f.ratio[i]) / f.sum;
  const assets: Owned[] = [{ t: s.main.t, book: s.main.book, cash: 0 }];
  const stockAt = Math.round((s.stock * (1 + rng.pick([-0.2, -0.1, 0.1]))) / 1000) * 1000;
  if (rng.pick(w.stock) === 'sold') assets.push({ t: DIS.TANGIBLE[0], book: s.stock, cash: stockAt });
  else assets.push({ t: DIS.TANGIBLE[0], book: s.stock, cash: 0, taken: { by: anyone(), at: stockAt } });
  const bad = rng.step(1000, Math.max(1000, Math.min(12000, Math.floor((s.debtors * 0.12) / 1000) * 1000)), 1000);
  assets.push({ t: DEBTORS, book: s.debtors, cash: s.debtors - bad, ...(rng.int(0, 1) === 0 ? { bad } : {}) });
  if (s.second) {
    const way = rng.pick(w.second);
    const at = Math.max(1000, s.second.book + rng.pick([-5000, 5000]));
    if (way === 'sold') assets.push({ t: s.second.t, book: s.second.book, cash: at });
    else if (way === 'silent') assets.push({ t: s.second.t, book: s.second.book, cash: s.second.book, silent: true });
    else assets.push({ t: s.second.t, book: s.second.book, cash: 0, taken: { by: anyone(), at } });
  }
  const liabs: Owed[] = [];
  const discount = rng.int(0, 1) === 0 ? rng.step(1000, 5000, 1000) : 0;
  liabs.push({ id: 'creditors', label: 'Creditors', the: 'the creditors', plural: true, what: 'creditors', book: s.creditors, cash: s.creditors - discount });
  if (s.outstanding > 0) liabs.push({ id: 'outstandingExpenses', label: 'Outstanding expenses', the: 'the outstanding expenses', plural: true, what: 'outstanding expenses', book: s.outstanding, cash: s.outstanding });
  const actual = rng.step(2000, 10000, 1000);
  const exp: DIS.Books['exp'] = { form: rng.pick(w.expenses), by: anyone(), actual, fee: actual + rng.pick([-1000, 1000, 2000, 3000].filter((x) => actual + x >= 3000)) };
  const extraAsset: DIS.Books['extraAsset'] = s.extra ? { what: s.extra.what, short: s.extra.short, cash: s.extra.cash } : null;

  const credits = (): number => sum(liabs.map((l) => l.book)) + s.provision + sum(assets.map((a) => a.cash + (a.taken?.at ?? 0))) + (extraAsset?.cash ?? 0);
  const debits = (): number => sum(assets.map((a) => a.book)) + sum(liabs.map((l) => l.cash)) + DIS.chargeOf(exp);
  // The price of the main asset: near its book value (within a sixth: the books were often revalued only months
  // before), and such that every share of the result is a whole hundred.
  const base = Math.round((s.main.book * (1 + rng.pick([-0.15, -0.1, -0.05, 0.05, 0.1, 0.15]))) / 1000) * 1000;
  assets[0].cash = base;
  const unit = f.sum * 100;
  let k = 0;
  while (k < 100 && ((((credits() - debits() - k * 100) % unit) + unit) % unit !== 0)) k++;
  if (k === 100) return null;
  assets[0].cash = base - k * 100;

  if (assets[0].cash < s.main.book * 0.75) return null;
  const result = credits() - debits();
  if (Math.abs(result) < f.sum * 1000) return null;
  const nets = f.names.map(
    (_, i) =>
      -sum(assets.filter((a) => a.taken?.by === i).map((a) => a.taken!.at)) + (exp.by === i ? DIS.creditedFor(exp) - DIS.chargedFor(exp) : 0) + share(result, i),
  );
  const finals = s.capitals.map((c, i) => c + nets[i]);
  if (finals.some((x) => x < 5000)) return null;

  const events: DIS.Books['events'] = [];
  const tell = (text: string, cap = false): void => {
    events.push({ text, capital: cap });
  };
  for (const a of assets) {
    if (a.silent) continue;
    if (a.taken) tell(`${who(a.taken.by)} took over ${a.t.the} at ${inr(a.taken.at)}.`, true);
    else if (a.bad) tell(`Bad debts came to ${inr(a.bad)}; the remaining debtors paid in full.`);
    else if (a.t.id === 'debtors') tell(`The debtors realised ${inr(a.cash)}.`);
    else tell(`${cap1(a.t.the)} ${DIS.was(a.t)} sold for ${inr(a.cash)}.`);
  }
  if (extraAsset) tell(`${cap1(extraAsset.what)} was sold for ${inr(extraAsset.cash)}.`);
  const inFull = liabs.filter((l) => l.cash === l.book);
  for (const l of liabs) if (l.cash < l.book) tell(`The creditors were paid ${inr(l.cash)} in full settlement.`);
  if (inFull.length) tell(`${cap1(list(inFull.map((l) => l.the)))} ${inFull.length > 1 || inFull[0].plural ? 'were' : 'was'} paid in full.`);
  const x = who(exp.by);
  const expenseText: Record<DIS.ExpenseForm, string> = {
    firm: `Realisation expenses of ${inr(actual)} were borne and paid by the firm.`,
    partnerPays: `Realisation expenses of ${inr(actual)} were to be borne by the firm; ${x} paid them out of ${x}'s own money.`,
    feePersonal: `${x} was to bear the realisation expenses for a remuneration of ${inr(exp.fee)}. The expenses, ${inr(actual)}, were paid by ${x} out of ${x}'s own money.`,
    feeFirmPays: `${x} was to bear the realisation expenses for a remuneration of ${inr(exp.fee)}. The expenses, ${inr(actual)}, were paid by the firm on ${x}'s behalf.`,
    borneFirmPays: `${x} had agreed to bear the realisation expenses without any remuneration. The expenses, ${inr(actual)}, were paid by the firm on ${x}'s behalf.`,
    bornePersonal: `${x} had agreed to bear the realisation expenses without any remuneration, and paid them, ${inr(actual)}, out of ${x}'s own money.`,
  };
  tell(expenseText[exp.form], exp.form !== 'firm');

  const shared = (amount: number, side: 'Dr' | 'Cr'): JournalLine[] => f.names.map((_, i) => (side === 'Dr' ? dr : cr)(capital(i), share(amount, i)));
  const steps: DIS.Step[] = [
    { kind: 'assets', lines: [dr(REAL, sum(assets.map((a) => a.book))), ...assets.map((a) => cr(a.t.id, a.book))] },
    { kind: 'liabilities', lines: [...liabs.map((l) => dr(l.id, l.book)), ...(s.provision ? [dr('provisionForDoubtfulDebts', s.provision)] : []), cr(REAL, sum(liabs.map((l) => l.book)) + s.provision)] },
  ];
  for (const a of assets) {
    if (a.cash) steps.push({ kind: 'realised', what: low1(a.t.name), lines: [dr('bank', a.cash), cr(REAL, a.cash)] });
    if (a.taken) steps.push({ kind: 'taken', what: low1(a.t.name), lines: [dr(capital(a.taken.by), a.taken.at), cr(REAL, a.taken.at)] });
  }
  if (extraAsset) steps.push({ kind: 'realised', what: extraAsset.short, lines: [dr('bank', extraAsset.cash), cr(REAL, extraAsset.cash)] });
  for (const l of liabs) steps.push({ kind: 'paid', what: l.what, lines: [dr(REAL, l.cash), cr('bank', l.cash)] });
  if (DIS.chargeOf(exp)) {
    steps.push({
      kind: 'expenses',
      what: DIS.forFee(exp) ? 'remuneration' : 'realisation expenses',
      lines: [dr(REAL, DIS.chargeOf(exp)), cr(exp.form === 'firm' ? 'bank' : capital(exp.by), DIS.chargeOf(exp))],
    });
  }
  if (DIS.chargedFor(exp)) steps.push({ kind: 'onBehalf', what: 'realisation expenses', lines: [dr(capital(exp.by), actual), cr('bank', actual)] });
  steps.push(result > 0 ? { kind: 'result', what: 'profit', lines: [dr(REAL, result), ...shared(result, 'Cr')] } : { kind: 'result', what: 'loss', lines: [...shared(-result, 'Dr'), cr(REAL, -result)] });
  if (s.loan) steps.push({ kind: 'loan', lines: [dr(partnerLoan(who(s.loan.by)), s.loan.amount), cr('bank', s.loan.amount)] });
  steps.push({ kind: 'final', lines: [...f.names.map((_, i) => dr(capital(i), finals[i])), cr('bank', sum(finals))] });

  // The firm never pays out money it does not have, and the last payment empties the bank.
  let held = rupees(s.bank);
  for (const st of steps) {
    for (const l of st.lines) if (l.accountId === 'bank') held += l.side === 'Dr' ? l.amount : -l.amount;
    if (held < 0) return null;
  }
  if (held !== 0) return null;
  return {
    f, money: 'bank', bank: s.bank, capitals: [...s.capitals], assets, provision: s.provision, liabs, accumulated: [], loan: s.loan, loanTo: null,
    extraAsset, extraLiab: null, exp, result, finals, events, steps,
  };
}
/** The events of a dissolution, numbered, with the rule for an asset about which nothing is said where one is silent. */
const windUpLines = (b: DIS.Books, after: readonly string[] = []): string[] => [
  ...[...b.events.map((e) => e.text), ...(b.loan ? [`After the outside liabilities had been settled, ${b.f.names[b.loan.by]}'s loan was repaid.`] : []), ...after].map(
    (t, k) => `${['(i)', '(ii)', '(iii)', '(iv)', '(v)', '(vi)', '(vii)', '(viii)', '(ix)', '(x)'][k]} ${t}`,
  ),
  ...(b.assets.some((a) => a.silent) ? ['An asset about which nothing is said realised its book value.'] : []),
];
const PAID_OFF = "Finally, every partner was paid the balance of that partner's capital account.";

// ---------------------------------------------------------------------------------------------------------------
// 19. case-life-chain-admission-dissolution: a partner is admitted (revaluation, the reserve, capital and a premium for
//     goodwill valued on three years' profits), and a few months later, the profit of those months shared and
//     withdrawn so that no balance has changed, the firm is dissolved: the partners' capital accounts on the
//     admission, then Realisation A/c from the values in the books after it, then the capital accounts that close the
//     books, starting from the capitals the first part carries down (complex).
// ---------------------------------------------------------------------------------------------------------------

interface AdmitWindUp {
  d: ADM.Deal;
  bs: { main: DIS.Thing; mainBook: number; stock: number; debtors: number; creditors: number; bank: number; second: DIS.Thing; secondBook: number };
  caps: number[];
  R: number;
  made: RET.Change[];
  V: number;
  profits: number[];
  n: number;
  G: number;
  K: number;
  premium: number;
  credits: number[];
  after: number[];
  b: DIS.Books;
  day: string;
}

const keptAdmitWindUp = keepFor<AdmitWindUp>();

const KIND_OF: Record<string, RET.ChangeKind> = { building: 'building', machinery: 'machinery' };

function admitThenWindUp(rng: Rng, ways: WindWays): AdmitWindUp | null {
  const d = ADM.dealWhere(rng, ['old', 'old', 'equal', 'stated'], ADM.tidySac, 2);
  if (!d) return null;
  const T = sum(d.old);
  const main = rng.pick([DIS.TANGIBLE[1], DIS.TANGIBLE[3]]);
  const made = RET.changesOf(rng, T * 500, 2, [KIND_OF[main.id], 'stock', 'debtors', 'creditors']);
  if (!made) return null;
  const V = sum(made.map((c) => c.sign * c.amount));
  if (V === 0) return null;
  const change = (kind: RET.ChangeKind): RET.Change | undefined => made.find((c) => c.kind === kind);
  const bs = {
    main,
    mainBook: change(KIND_OF[main.id])?.book ?? rng.step(main.id === 'building' ? 300000 : 200000, main.id === 'building' ? 800000 : 500000, main.id === 'building' ? 50000 : 20000),
    stock: change('stock')?.book ?? rng.step(120000, 320000, 10000),
    debtors: change('debtors')?.book ?? rng.step(80000, 300000, 10000),
    creditors: change('creditors')?.book ?? rng.step(90000, 240000, 10000),
    bank: rng.step(40000, 150000, 10000),
    second: rng.pick([DIS.TANGIBLE[2], DIS.TANGIBLE[5], DIS.TANGIBLE[6]]),
    secondBook: rng.step(20000, 80000, 5000),
  };
  const R = RET.mult(rng, T * 1000, 30000, 150000);
  if (R === null) return null;
  const capitalTotal = bs.mainBook + bs.secondBook + bs.stock + bs.debtors + bs.bank - bs.creditors - R;
  const w = d.olds.map(() => rng.int(3, 6));
  const caps = w.map((x) => Math.floor((capitalTotal * x) / sum(w) / 10000) * 10000);
  caps[1] = capitalTotal - caps[0];
  if (caps.some((c) => c < 100000)) return null;
  // Goodwill on the profits of the last three years, in keeping with the capital the firm employs.
  const valued = profitsFor(rng, unitFor([d.share, ...d.given.filter(ADM.isPos)]), 60000, 600000, [2, 3, 1.5], [0.1 * capitalTotal, 0.35 * capitalTotal]);
  if (valued === null) return null;
  const G = valued.G;
  const premium = ADM.of(G, d.share);
  const credits = d.given.map((x) => ADM.of(G, x));
  const fair = (sum(caps) * d.share[0]) / (d.share[1] - d.share[0]);
  const K = Math.max(60000, Math.round((fair * rng.int(80, 120)) / 100 / 10000) * 10000);
  const after = [...caps.map((c, i) => c + ((R + V) * d.old[i]) / T + credits[i]), K];
  if (after.some((x) => x <= 0)) return null;
  const moved = (kind: RET.ChangeKind): number => {
    const c = change(kind);
    return c ? c.sign * c.amount : 0;
  };
  const provision = change('debtors')?.amount ?? 0;
  const day = rng.pick([`30 June ${d.year}`, `31 July ${d.year}`, `31 August ${d.year}`]);
  const f: DIS.Firm = { names: d.names, ratio: d.newRatio, sum: sum(d.newRatio), date: day, intro: '' };
  const b = windUpFrom(
    rng,
    {
      f,
      capitals: after,
      bank: bs.bank + K + premium,
      main: { t: main, book: bs.mainBook + moved(KIND_OF[main.id]) },
      stock: bs.stock + moved('stock'),
      debtors: bs.debtors,
      provision,
      second: { t: bs.second, book: bs.secondBook },
      creditors: bs.creditors - (change('creditors')?.amount ?? 0),
      outstanding: 0,
      loan: null,
    },
    ways,
  );
  if (!b) return null;
  return { d, bs, caps, R, made, V, profits: valued.profits, n: valued.n, G, K, premium, credits, after, b, day };
}

/** The balance sheet before an event, one line to a balance, as the topics print it. */
const oldSheet = (who: string, on: string, liabs: [string, number][], caps: [string, number][], assets: [string, number][]): string[] => [
  `Balance Sheet of ${who} as at ${on}:`,
  'Liabilities:',
  ...liabs.filter(([, v]) => v > 0).map(([l, v]) => `${l}: ${inr(v)}`),
  ...caps.map(([nm, v]) => `${nm}'s Capital: ${inr(v)}`),
  'Assets:',
  ...assets.filter(([, v]) => v > 0).map(([l, v]) => `${l}: ${inr(v)}`),
];

const chainAdmissionDissolution = caseTemplate<AdmitWindUp>({
  id: 'case-life-chain-admission-dissolution',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'A new partner, then the firm is wound up',
  setup: (rng) =>
    attempt(12, () => {
      const s = admitThenWindUp(rng, { stock: ['sold', 'taken'], second: ['partner', 'partner', 'sold', 'silent'], expenses: ['partnerPays', 'feePersonal', 'feeFirmPays', 'borneFirmPays', 'firm'] });
      return s && DIS.realisationAccount(s.b) && DIS.capitalAccounts(s.b, 6) ? s : null;
    }),
  context: (s) => {
    const { d, bs } = s;
    const text = [
      `${d.open} Their capitals are fluctuating, goodwill is never raised in the books, and every receipt and payment is by cheque.`,
      ...oldSheet(list(d.olds), `31 March ${d.year}`, [['Creditors', bs.creditors], ['General Reserve', s.R]], d.olds.map((nm, i) => [nm, s.caps[i]]), [
        [bs.main.name, bs.mainBook],
        [bs.second.name, bs.secondBook],
        ['Stock', bs.stock],
        ['Debtors', bs.debtors],
        ['Bank', bs.bank],
      ]),
      `${d.admit} ${d.how} It is agreed that:`,
      ...s.made.map((c) => c.text),
      'The whole of the General Reserve is distributed among the old partners.',
      `Net profits of the last three years: ${threeYears(s.profits, d.year)}`,
      `${d.nw} brings ${inr(s.K)} as capital and ${d.nw}'s share of goodwill as premium, and the premium is kept in the business. Goodwill is valued at ${s.n} years' purchase of the average profit of the last three years.`,
      `The partners soon fell out, and the firm was dissolved on ${s.day}. The profit of the months in between was shared and withdrawn in full, so every balance in the books was still as it stood just after ${d.nw}'s admission.`,
      'On dissolution:',
      ...windUpLines(s.b, [PAID_OFF]),
    ].join('\n');
    keptAdmitWindUp.keep(text, s);
    return text;
  },
  parts: [
    {
      kind: 'account',
      make: (s) => {
        const { d } = s;
        const day = `1 April ${d.year}`;
        const profit = s.V > 0;
        const T = sum(d.old);
        const ids = d.names.map(partnerCapital);
        const inOld = (x: number): number[] => d.old.map((t) => (x * t) / T);
        const lines: JournalLine[][] = [
          s.V > 0 ? [dr('revaluation', s.V), ...inOld(s.V).map((p, i) => cr(ids[i], p))] : [...inOld(-s.V).map((p, i) => dr(ids[i], p)), cr('revaluation', -s.V)],
          [dr('generalReserve', s.R), ...inOld(s.R).map((p, i) => cr(ids[i], p))],
          [dr('bank', s.K + s.premium), cr(ids[2], s.K), cr('premiumForGoodwill', s.premium)],
          ADM.entry(dr('premiumForGoodwill', s.premium), ...s.credits.map((c, i) => cr(ids[i], c))),
        ];
        const view = columnarAccount(
          lines.map((l) => ({ date: day, lines: l })),
          ids,
          { date: day, balances: [...s.caps.map((c) => ({ side: 'Cr' as const, amount: rupees(c) })), null] },
          (id) => (id === 'revaluation' ? ADM.revaluationRow(profit) : columnLabel(id)),
        );
        if (view.balances.some((b) => b === null || b.side !== 'Cr')) return null;
        const sides = columnarSides(view, { closeOn: day });
        return {
          task: `Prepare the partners' capital accounts in columns on ${d.nw}'s admission on ${day}, and carry the balances down.`,
          title: "Partners' Capital Accounts",
          columns: partnerColumns(d.names),
          left: { ...sides.left, rows: ADM.plainRevaluation(sides.left.rows) },
          right: { ...sides.right, rows: ADM.plainRevaluation(sides.right.rows) },
          distractors: [ADM.revaluationRow(!profit), 'Goodwill A/c', 'Current A/c', 'Realisation A/c', 'Profit and Loss Appropriation A/c'],
          explanation: [
            'Each partner has a column. The capitals of the old partners open the credit side: By Balance b/d.',
            `Revaluation: ${s.made.map((c) => `${c.work} (${c.sign > 0 ? 'a gain' : 'a loss'})`).join('; ')}; a ${profit ? 'profit' : 'loss'} of ${inr(Math.abs(s.V))}, shared by the old partners in ${rt(d.old)}: ${ADM.eachGets(d.olds, inOld(Math.abs(s.V)))}, "${profit ? 'By' : 'To'} ${ADM.revaluationRow(profit)}" ("Revaluation A/c" is accepted too).`,
            `The whole of the General Reserve, ${inr(s.R)}, goes to the old partners in the old ratio: ${ADM.eachGets(d.olds, inOld(s.R))}, "By General Reserve A/c".`,
            `${d.nw}'s capital of ${inr(s.K)} is credited in ${d.nw}'s column: "By Bank A/c".`,
            `Average profit = (${s.profits.map(inr).join(' + ')}) / 3 = ${inr(s.G / s.n)}; goodwill = ${inr(s.G / s.n)} x ${s.n} = ${inr(s.G)}. Premium = ${inr(s.G)} x ${ADM.fs(d.share)} = ${inr(s.premium)}. ${ADM.givesSteps(d)[0]} ${ADM.sacStep(d)} "By Premium for Goodwill A/c": ${ADM.eachGets(d.olds, s.credits)}.`,
            `Balances carried down: ${ADM.eachGets(d.names, s.after)}.`,
          ],
          hints: ADM.H.newFirm,
        };
      },
      verify: (q: AccountQuestion) => {
        const s = keptAdmitWindUp.of(q.data);
        if (!s) return false;
        // The result of revaluation the long way, by posting the changes; the closing balances by plain arithmetic.
        const V = -(post(s.made.map(RET.changeLines)).get('revaluation') ?? 0) / 100;
        const T = sum(s.d.old);
        // Goodwill read back from the printed profits.
        const G = (sum(amountsIn(lineOf(q.data, 'Net profits of the last three years'))) / 3) * Number(/valued at ([\d.]+) years' purchase/.exec(q.data)?.[1]);
        const want = [...s.caps.map((c, i) => c + ((V + s.R) * s.d.old[i]) / T + G * (s.d.given[i][0] / s.d.given[i][1])), s.K];
        const closing = q.sides[0].rows.find((r) => r.closing)?.amounts ?? [];
        return want.every((x, c) => near((closing[c] ?? 0) / 100, x));
      },
    },
    {
      kind: 'account',
      make: (s) => {
        const sides = DIS.realisationAccount(s.b);
        return (
          sides && {
            task: `Prepare Realisation A/c of the firm on its dissolution on ${s.day}, from the values in the books after ${s.d.nw}'s admission. ${DIS.REALISATION_TASK}`,
            title: 'Realisation A/c',
            ...sides,
            distractors: DIS.realisationSlips(s.b),
            explanation: [`The assets and the creditors stand at their values after the revaluation on ${s.d.nw}'s admission: ${s.made.map((c) => c.work).join('; ')}.`, ...DIS.realisationNotes(s.b)],
            hints: DIS.FORMAT_HINTS.realisation,
          }
        );
      },
      verify: (q: AccountQuestion) => {
        const s = keptAdmitWindUp.of(q.data);
        return s !== undefined && DIS.realisationHoldsFor(s.b, q);
      },
    },
    {
      kind: 'account',
      make: (s) => {
        const sides = DIS.capitalAccounts(s.b, 6);

        return (
          sides && {
            task: "Starting from the capitals carried down on the admission and the profit or loss of Realisation A/c, prepare the partners' capital accounts in columns to close the books of the firm. Enter each item as a row of its own.",
            title: "Partners' Capital Accounts",
            columns: partnerColumns(s.b.f.names),
            ...sides,
            distractors: DIS.capitalSlips(s.b),
            explanation: DIS.capitalWorking(s.b, false),
            hints: DIS.FORMAT_HINTS.capitals,
          }
        );
      },
      verify: (q: AccountQuestion) => {
        const s = keptAdmitWindUp.of(q.data);
        return s !== undefined && DIS.capitalsHoldFor(s.b, q, false);
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 20. case-life-chain-retirement-dissolution: a partner retires (revaluation, the reserve, goodwill valued on the
//     profits of three years, the amount due paid by cheque); some months later the two who continue dissolve the
//     firm (the profit of those months shared and withdrawn, so no balance has changed): the Revaluation Account, the capital accounts on the retirement (starting
//     from its result), then Realisation A/c from the values in the books after the retirement (complex).
// ---------------------------------------------------------------------------------------------------------------

interface RetireWindUp {
  f: RET.Firm;
  intro: string;
  g: RET.Gain;
  y: number;
  bs: { main: DIS.Thing; mainBook: number; second: DIS.Thing; secondBook: number; stock: number; debtors: number; creditors: number; bank: number };
  K: number[];
  R: number;
  made: RET.Change[];
  V: number;
  profits: number[];
  n: number;
  G: number;
  due: number;
  after: number[];
  b: DIS.Books;
  day: string;
}

const keptRetireWindUp = keepFor<RetireWindUp>();

function retireThenWindUp(rng: Rng): RetireWindUp | null {
  const f = RET.firm(rng);
  const g = RET.gainOf(rng, f, ['silent', 'silent', 'split', 'agreed']);
  if (!g) return null;
  const T = f.total;
  const o = f.names.indexOf(f.out);
  const y = rng.pick([2024, 2025, 2026]);
  const main = rng.pick([DIS.TANGIBLE[1], DIS.TANGIBLE[3]]);
  const made = RET.changesOf(rng, T * 500, 2, [KIND_OF[main.id], 'stock', 'debtors', 'creditors']);
  if (!made) return null;
  const V = sum(made.map((c) => c.sign * c.amount));
  if (V === 0) return null;
  const change = (kind: RET.ChangeKind): RET.Change | undefined => made.find((c) => c.kind === kind);
  const moved = (kind: RET.ChangeKind): number => (change(kind)?.sign ?? 0) * (change(kind)?.amount ?? 0);
  const R = RET.mult(rng, T * 1000, 30000, 150000);
  const n = rng.pick([2, 3, 1.5]);
  const unit = 100 * T * sum(g.w);
  const fits: number[] = [];
  for (let a = 60000; a <= 300000; a += 1000) if (Number.isInteger(a * n) && (a * n) % unit === 0) fits.push(a);
  if (R === null || fits.length === 0) return null;
  const avg = rng.pick(fits);
  const p1 = rng.step(Math.round((avg * 0.8) / 1000) * 1000, Math.round((avg * 1.1) / 1000) * 1000, 1000);
  const p2 = rng.step(Math.round((avg * 0.85) / 1000) * 1000, Math.round((avg * 1.15) / 1000) * 1000, 1000);
  const p3 = 3 * avg - p1 - p2;
  if (p3 < avg * 0.75 || p3 > avg * 1.35 || new Set([p1, p2, p3]).size < 3) return null;
  const G = avg * n;
  const Kout = rng.step(150000, 400000, 10000);
  const due = Kout + ((R + V + G) * f.x) / T;
  const bs = {
    main,
    mainBook: change(KIND_OF[main.id])?.book ?? rng.step(main.id === 'building' ? 400000 : 250000, main.id === 'building' ? 900000 : 600000, 50000),
    second: rng.pick([DIS.TANGIBLE[2], DIS.TANGIBLE[5], DIS.TANGIBLE[6]]),
    secondBook: rng.step(20000, 80000, 5000),
    stock: change('stock')?.book ?? rng.step(120000, 320000, 10000),
    debtors: change('debtors')?.book ?? rng.step(80000, 300000, 10000),
    creditors: change('creditors')?.book ?? rng.step(90000, 240000, 10000),
    // Enough at the bank to pay the retiring partner by cheque, with something left.
    bank: Math.ceil((due + rng.step(30000, 120000, 10000)) / 10000) * 10000,
  };
  const capitalTotal = bs.mainBook + bs.secondBook + bs.stock + bs.debtors + bs.bank - bs.creditors - R;
  const rest = capitalTotal - Kout;
  const keep = f.names.map((_, i) => i).filter((i) => i !== o);
  const K = f.names.map(() => 0);
  K[o] = Kout;
  K[keep[0]] = Math.round((rest * rng.pick([0.4, 0.5, 0.6])) / 10000) * 10000;
  K[keep[1]] = rest - K[keep[0]];
  if (K.some((k) => k < 100000)) return null;
  const { parts } = RET.goodwillParts(f, g, G);
  const after = f.stay.map((nm, i) => K[f.names.indexOf(nm)] + ((R + V) * f.stayOld[i]) / T - parts[i]);
  if (after.some((x) => x < 60000)) return null;
  const day = rng.pick([`30 June ${y}`, `31 July ${y}`, `30 September ${y}`]);
  const f2: DIS.Firm = { names: f.stay, ratio: g.fresh, sum: sum(g.fresh), date: day, intro: '' };
  const b = windUpFrom(
    rng,
    {
      f: f2,
      capitals: after,
      bank: bs.bank - due,
      main: { t: main, book: bs.mainBook + moved(KIND_OF[main.id]) },
      stock: bs.stock + moved('stock'),
      debtors: bs.debtors,
      provision: change('debtors')?.amount ?? 0,
      second: { t: bs.second, book: bs.secondBook },
      creditors: bs.creditors - (change('creditors')?.amount ?? 0),
      outstanding: 0,
      loan: null,
    },
    { stock: ['sold', 'taken'], second: ['sold', 'partner', 'silent'], expenses: ['firm', 'partnerPays', 'feePersonal', 'feeFirmPays', 'borneFirmPays'] },
  );
  if (!b) return null;
  return { f, intro: RET.intro(rng, f), g, y, bs, K, R, made, V, profits: [p1, p2, p3], n, G, due, after, b, day };
}

const chainRetirementDissolution = caseTemplate<RetireWindUp>({
  id: 'case-life-chain-retirement-dissolution',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'A partner retires, then the firm is wound up',
  setup: (rng) =>
    attempt(12, () => {
      const s = retireThenWindUp(rng);
      return s && DIS.realisationAccount(s.b) ? s : null;
    }),
  context: (s) => {
    const { f, bs, y } = s;
    const text = [
      `${s.intro} ${RET.FLUCTUATING} Goodwill is never raised in the books, and every receipt and payment is by cheque.`,
      ...oldSheet(list(f.names), `31 March ${y}`, [['Creditors', bs.creditors], ['General Reserve', s.R]], f.names.map((nm, i) => [nm, s.K[i]]), [
        [bs.main.name, bs.mainBook],
        [bs.second.name, bs.secondBook],
        ['Stock', bs.stock],
        ['Debtors', bs.debtors],
        ['Bank', bs.bank],
      ]),
      `${f.out} retires on 31 March ${y}; ${s.g.text}. It is agreed that:`,
      ...s.made.map((c) => c.text),
      `${RET.RESERVE_IN_FULL} The goodwill of the firm is valued at ${s.n} years' purchase of the average profit of the last three years, ${s.profits.map(inr).join(', ')}; ${RET.goodwillRule(false).charAt(0).toLowerCase()}${RET.goodwillRule(false).slice(1)}`,
      `The amount due to ${f.out} is paid at once by cheque.`,
      `On ${s.day} ${list(f.stay)} dissolved the firm. The profit of the months in between was shared and withdrawn in full, so every balance in the books was still as it stood just after ${f.out}'s retirement.`,
      'On dissolution:',
      ...windUpLines(s.b),
    ].join('\n');
    keptRetireWindUp.keep(text, s);
    return text;
  },
  parts: [
    {
      kind: 'account',
      make: (s) => {
        const { f } = s;
        const day = `31 March ${s.y}`;
        const profit = s.V > 0;
        const entries = [...s.made.map((c) => ({ date: day, lines: RET.changeLines(c) })), { date: day, lines: RET.revaluationTransfer(f, s.V) }];
        const losses = s.made.filter((c) => c.sign < 0);
        const gains = s.made.filter((c) => c.sign > 0);
        return {
          task: `Prepare the Revaluation Account on ${f.out}'s retirement on ${day}, closing it by transfer to the capital accounts of the partners.`,
          title: 'Revaluation A/c',
          ...revaluationSides(entries, f.names, profit),
          distractors: [...f.names.map((nm) => RET.transferRow(nm, !profit)), 'Balance c/d', 'General Reserve A/c', 'Goodwill A/c', 'Realisation A/c'],
          explanation: [
            ...s.made.map((c) => (c.sign > 0 ? `${c.work}: a gain, credited ("By ${ledgerLabel(c.accountId)}").` : `${c.work}: a loss, debited ("To ${ledgerLabel(c.accountId)}").`)),
            `Debit side (losses) = ${losses.length ? RET.added(losses.map((c) => c.amount)) : 'nothing'}; credit side (gains) = ${gains.length ? RET.added(gains.map((c) => c.amount)) : 'nothing'}.`,
            `The values changed while ${f.out} was a partner, so all three share the ${profit ? 'profit' : 'loss'} of ${inr(Math.abs(s.V))} in the old ratio ${rt(f.old)}: ${RET.named(f.names, RET.inOld(f, Math.abs(s.V)))}.`,
            `Each share is a row of its own ("${profit ? 'To' : 'By'} ${RET.transferRow(f.names[0], profit)}"; "${f.names[0]}'s Capital A/c" alone is accepted too).`,
          ],
          hints: [RET.SET_HINTS.retire[0], 'Losses are debited and gains credited. The difference is shared by all the partners, the retiring partner included, in the old ratio.'],
        };
      },
      verify: (q: AccountQuestion) => {
        const s = keptRetireWindUp.of(q.data);
        if (!s) return false;
        // The result the long way, by the ledger; the shares of it by plain arithmetic.
        const V = -(post(s.made.map(RET.changeLines)).get('revaluation') ?? 0) / 100;
        const rows = q.sides[V > 0 ? 0 : 1].rows.filter((r) => r.closing);
        return rows.length === 3 && s.f.names.every((nm, i) => rows.some((r) => r.label === RET.transferRow(nm, V > 0) && near(r.amounts[0] / 100, (Math.abs(V) * s.f.old[i]) / s.f.total)));
      },
    },
    {
      kind: 'account',
      make: (s) => {
        const { f, g } = s;
        const day = `31 March ${s.y}`;
        const profit = s.V > 0;
        const entries = [
          RET.stepAccumulated(f, RET.ACCUMULATED.reserve, s.R),
          RET.stepRevaluation(f, s.V, ''),
          RET.stepGoodwill(f, g, s.G),
          RET.stepSettle(f, s.due, { kind: 'bank' }, ''),
        ].map((st) => ({ date: day, lines: st.lines }));
        const view = columnarAccount(entries, f.names.map(partnerCapital), { date: day, balances: s.K.map((k) => ({ side: 'Cr' as const, amount: rupees(k) })) }, (id) => (id === 'revaluation' ? ADM.revaluationRow(profit) : ledgerLabel(id)));
        const o = f.names.indexOf(f.out);
        if (view.balances.some((b, i) => (i === o ? b !== null : b === null || b.side !== 'Cr'))) return null;
        const sides = columnarSides(view, { closeOn: day });
        const { s: gs, parts } = RET.goodwillParts(f, g, s.G);
        const avg = sum(s.profits) / 3;
        return {
          task: `Prepare the capital accounts of the partners in columns on ${f.out}'s retirement, taking the profit or loss on revaluation from the Revaluation Account; close ${f.out}'s account and carry down the balances of ${list(f.stay)}.`,
          title: "Partners' Capital Accounts",
          columns: partnerColumns(f.names),
          left: { ...sides.left, rows: ADM.plainRevaluation(sides.left.rows) },
          right: { ...sides.right, rows: ADM.plainRevaluation(sides.right.rows) },
          distractors: ['Goodwill A/c', ADM.revaluationRow(!profit), 'Premium for Goodwill A/c', `${f.out}'s Loan A/c`, 'Realisation A/c'],
          explanation: [
            'Each partner has a column; the capitals open the credit side ("By Balance b/d").',
            `The whole of the General Reserve, ${inr(s.R)}, goes to all three in the old ratio ${rt(f.old)} ("By General Reserve A/c"): ${RET.named(f.names, RET.inOld(f, s.R))}.`,
            `The ${profit ? 'profit' : 'loss'} on revaluation, ${inr(Math.abs(s.V))}, from the Revaluation Account, in the same ratio ("${profit ? 'By' : 'To'} ${ADM.revaluationRow(profit)}"; "Revaluation A/c" is accepted too).`,
            `Average profit = (${s.profits.map(inr).join(' + ')}) / 3 = ${inr(avg)}; goodwill = ${inr(avg)} x ${s.n} = ${inr(s.G)}; ${f.out}'s share = ${inr(gs)}. ${g.why}: ${f.stay.flatMap((nm, i) => (parts[i] > 0 ? [`${nm} ${inr(parts[i])}`] : [])).join(', ')}, debited "To ${f.out}'s Capital A/c" and credited in ${f.out}'s column.`,
            `${f.out}'s column comes to ${inr(s.due)}, paid by cheque ("To Bank A/c"), which closes it.`,
            `The balances of ${list(f.stay)} are carried down: ${each(f.stay, s.after)}.`,
          ],
          hints: RET.SET_HINTS.retire,
        };
      },
      verify: (q: AccountQuestion) => {
        const s = keptRetireWindUp.of(q.data);
        if (!s) return false;
        const T = s.f.total;
        const o = s.f.names.indexOf(s.f.out);
        const closing = q.sides[0].rows.find((r) => r.closing)?.amounts ?? [];
        const bank = q.sides[0].rows.find((r) => r.label === 'Bank A/c')?.amounts ?? [];
        const due = s.K[o] + ((s.R + s.V + s.G) * s.f.x) / T;
        return near((bank[o] ?? 0) / 100, due) && s.f.stay.every((nm, i) => near((closing[s.f.names.indexOf(nm)] ?? 0) / 100, s.after[i]));
      },
    },
    {
      kind: 'account',
      make: (s) => {
        const sides = DIS.realisationAccount(s.b);
        return (
          sides && {
            task: `Prepare Realisation A/c of the firm on its dissolution on ${s.day}, from the values in the books after ${s.f.out}'s retirement. ${DIS.REALISATION_TASK}`,
            title: 'Realisation A/c',
            ...sides,
            distractors: [...DIS.realisationSlips(s.b), `${s.f.out}'s Capital A/c (profit)`],
            explanation: [`${s.f.out} is no longer a partner: the profit or loss is shared by ${list(s.f.stay)} in their new ratio, ${rt(s.g.fresh)}. The assets and the creditors stand at their values after the revaluation: ${s.made.map((c) => c.work).join('; ')}.`, ...DIS.realisationNotes(s.b)],
            hints: DIS.FORMAT_HINTS.realisation,
          }
        );
      },
      verify: (q: AccountQuestion) => {
        const s = keptRetireWindUp.of(q.data);
        return s !== undefined && DIS.realisationHoldsFor(s.b, q);
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 21. case-life-chain-year-dissolution: a firm's last year and its dissolution at the end of it, in which goodwill
//     that was never in the books (AS 26) is sold: the Profit and Loss Appropriation Account, Realisation A/c, then the
//     partners' capital accounts for the year and the dissolution, starting from the shares of profit and the result
//     on realisation (complex).
// ---------------------------------------------------------------------------------------------------------------

interface YearWindUp {
  y: PfPartnersYear;
  closing: number[];
  bs: { main: DIS.Thing; mainBook: number; second: DIS.Thing; secondBook: number; stock: number; debtors: number; creditors: number; bank: number };
  gw: number;
  b: DIS.Books;
}

const keptYearWindUp = keepFor<YearWindUp>();

function yearThenWindUp(rng: Rng): YearWindUp | null {
  const drawn = P.partnersYear(rng, false, { changes: [0] });
  const y = drawn && believable(drawn);
  if (!y) return null;
  const closing = yearClosing(y);
  if (closing.some((c) => c < 50000)) return null;
  const main = rng.pick([DIS.TANGIBLE[1], DIS.TANGIBLE[3], DIS.TANGIBLE[4]]);
  const creditors = rng.step(50000, 200000, 5000);
  const stock = Math.round((sum(closing) * rng.pick([0.15, 0.2, 0.25])) / 10000) * 10000;
  const debtors = Math.round((sum(closing) * rng.pick([0.1, 0.15, 0.2])) / 10000) * 10000;
  const secondBook = rng.step(20000, 80000, 5000);
  // The main fixed asset a round figure; the balance at bank is what agrees the balance sheet.
  const mainBook = Math.round((sum(closing) + creditors - stock - debtors - secondBook - rng.step(20000, 80000, 5000)) / 10000) * 10000;
  const bank = sum(closing) + creditors - stock - debtors - secondBook - mainBook;
  if (mainBook < 100000 || bank < 10000) return null;

  const bs = { main, mainBook, second: rng.pick([DIS.TANGIBLE[2], DIS.TANGIBLE[5], DIS.TANGIBLE[6]]), secondBook, stock, debtors, creditors, bank };
  const gw = rng.step(10000, 60000, 5000);
  const f: DIS.Firm = { names: y.names, ratio: y.psr, sum: sum(y.psr), date: y.yr.on, intro: '' };
  const b = windUpFrom(
    rng,
    {
      f,
      capitals: closing,
      bank,
      main: { t: main, book: mainBook },
      stock,
      debtors,
      provision: 0,
      second: { t: bs.second, book: secondBook },
      creditors,
      outstanding: 0,
      loan: null,
      extra: { what: 'the goodwill of the firm, which had never been recorded in the books,', short: 'goodwill', cash: gw },
    },
    { stock: ['sold', 'taken'], second: ['sold', 'partner', 'silent'], expenses: ['firm', 'partnerPays', 'feePersonal', 'borneFirmPays'] },
  );
  return b ? { y, closing, bs, gw, b } : null;
}

/**
 * The partners' capital accounts for the year and the dissolution that ends it, in columns: the year's entries and
 * then every step of the dissolution, each row of the dissolution named as the topic names it ("Realisation A/c
 * (stock)"), all on the last day of the year.
 */
function yearAndWindUpColumns(s: YearWindUp) {
  const { y, b } = s;
  const steps: DatedEntry[] = b.steps.map((st, k) => ({ date: `step ${k}`, lines: st.lines }));
  const view = columnarAccount([...P.yearEntries(y), ...steps], y.names.map(partnerCapital), { date: y.yr.from, balances: P.openingBalances(y.caps) });
  const name = (r: FormatRowParts): FormatRowParts => {
    const m = /^step (\d+)$/.exec(r.date ?? '');
    if (!m) return r;
    const what = b.steps[Number(m[1])].what;
    return { ...r, date: y.yr.on, label: what ? `${r.label} (${what})` : r.label };
  };
  const sides = columnarSides(view, { closeOn: y.yr.on });
  return { closed: view.balances.every((x) => x === null), left: { ...sides.left, rows: sides.left.rows.map(name) }, right: { ...sides.right, rows: sides.right.rows.map(name) } };
}

const chainYearDissolution = caseTemplate<YearWindUp>({
  id: 'case-life-chain-year-dissolution',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'A last year, then the books are closed',
  setup: (rng) =>
    attempt(12, () => {
      const s = yearThenWindUp(rng);
      return s && DIS.realisationAccount(s.b) && yearAndWindUpColumns(s).closed ? s : null;
    }),
  context: (s) => {
    const { y, bs } = s;
    const text = [
      `${list(y.names)} are partners in ${y.firm} sharing profits and losses in the ratio ${rt(y.psr)}. Their capitals are fluctuating. ${P.ITEMS_OWN} Every receipt and payment is by cheque.`,
      ...yearLines(y),
      `Once the year's accounts were closed, the firm was dissolved on ${y.yr.on}. Its assets and liabilities, besides the capitals, were then: ${bs.main.name} ${inr(bs.mainBook)}, ${bs.second.name} ${inr(bs.secondBook)}, Stock ${inr(bs.stock)}, Debtors ${inr(bs.debtors)}, Bank ${inr(bs.bank)}; Creditors ${inr(bs.creditors)}.`,
      'On dissolution:',
      ...windUpLines(s.b, [PAID_OFF]),
    ].join('\n');
    keptYearWindUp.keep(text, s);
    return text;
  },
  parts: [
    {
      kind: 'account',
      make: (s) => {
        const made = P.appropriationAccount({ yr: s.y.yr, names: s.y.names, fixed: false, psr: s.y.psr, profit: s.y.profit, ioc: s.y.ioc, salary: s.y.salary, commission: s.y.commission, iod: s.y.iod, reserve: 0 });
        return { task: P.appTask(s.y.yr, sum(s.y.iod) > 0), title: P.APP_TITLE, left: made.left, right: made.right, distractors: APP_SLIPS(s.y), explanation: appWorking(s.y), hints: P.H.approp };
      },
      verify: (q: AccountQuestion) => {
        const s = keptYearWindUp.of(q.data);
        return s !== undefined && appHolds(q, s.y);
      },
    },
    {
      kind: 'account',
      make: (s) => {
        const sides = DIS.realisationAccount(s.b);
        return (
          sides && {
            task: `Prepare Realisation A/c of the firm on its dissolution on ${s.y.yr.on}. ${DIS.REALISATION_TASK}`,
            title: 'Realisation A/c',
            ...sides,
            distractors: [...DIS.realisationSlips(s.b), 'Goodwill A/c'],
            explanation: ['Self-generated goodwill is never recorded (AS 26), so nothing for it is on the debit side: the money it fetches is all gain.', ...DIS.realisationNotes(s.b)],
            hints: DIS.FORMAT_HINTS.realisation,
          }
        );
      },
      verify: (q: AccountQuestion) => {
        const s = keptYearWindUp.of(q.data);
        return s !== undefined && DIS.realisationHoldsFor(s.b, q);
      },
    },
    {
      kind: 'account',
      make: (s) => {
        const made = yearAndWindUpColumns(s);
        if (!made.closed) return null;
        return {
          task: `Starting from the shares of profit of the Appropriation Account and the profit or loss of Realisation A/c, prepare the partners' capital accounts in columns for the ${s.y.yr.ended} and the dissolution, closing them. Enter each item as a row of its own.`,
          title: "Partners' Capital Accounts",
          columns: partnerColumns(s.y.names),
          left: made.left,
          right: made.right,
          distractors: ['Balance c/d', 'Current A/c', 'Revaluation A/c', 'General Reserve A/c', `Realisation A/c (${s.b.result > 0 ? 'loss' : 'profit'})`, 'Goodwill A/c'],
          explanation: [
            ...columnsWorking(s.y).slice(0, -1),
            `Balances after the year: ${each(s.y.names, s.closing)}. The dissolution follows on the same day.`,
            ...DIS.capitalWorking(s.b, false).slice(1),
          ],
          hints: ["Take the year's items first, then those of the dissolution.", DIS.FORMAT_HINTS.capitals[1]],
        };
      },
      verify: (q: AccountQuestion) => {
        const s = keptYearWindUp.of(q.data);
        if (!s) return false;
        // The books closed the long way (the topic's check), and each column paid out exactly what the partner is due.
        const bank = q.sides[0].rows.find((r) => r.label === 'Bank A/c')?.amounts ?? [];
        return DIS.closes(s.b) && s.b.finals.every((x, i) => near((bank[i] ?? 0) / 100, x)) && s.y.names.every((_, i) => near(((q.sides[1].rows.find((r) => r.label === 'Balance b/d')?.amounts ?? [])[i] ?? 0) / 100, s.y.caps[i]));
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 22. case-life-chain-death-executor: a partner dies during the year; goodwill is valued by super profit, interest
//     on capital and the share of profit run to the date of death. The entries on the death, the deceased partner's
//     Capital A/c, then the Executor's A/c to the next 31 March, starting from the amount transferred (complex).
// ---------------------------------------------------------------------------------------------------------------

interface DeathChain {
  f: RET.Firm;
  intro: string;
  g: RET.Gain;
  y: number;
  m: number;
  date: string;
  K: number;
  r: number;
  interest: number;
  last: number;
  profit: number;
  ce: number;
  rate: number;
  avg: number;
  n: number;
  G: number;
  R: number;
  drawn: number;
  due: number;
  paid: number;
  rate2: number;
  late: number;
}

const keptDeathChain = keepFor<DeathChain>();

/** The entries on the death, in the order of the set: the reserve, interest, profit, goodwill, drawings and the transfer. */
function deathSteps(s: DeathChain): RET.Step[] {
  const { f } = s;
  const capital = partnerCapital(f.out);
  const part = (v: number): number => (v * f.x) / f.total;
  const sp = s.avg - (s.ce * s.rate) / 100;
  return [
    RET.stepAccumulated(f, RET.ACCUMULATED.reserve, s.R),
    {
      text: `Allow interest on ${f.out}'s capital up to the date of death.`,
      lines: [dr('interestOnCapital', s.interest), cr(capital, s.interest)],
      explanation: [`1 April ${s.y} to ${s.date} is ${s.m} months.`, `Interest on capital = ${inr(s.K)} x ${s.r}/100 x ${s.m}/12 = ${inr(s.interest)}: Interest on Capital A/c is debited and ${f.out}'s Capital A/c is credited.`],
    },
    {
      text: `Credit ${f.out} with the share of profit up to the date of death.`,
      lines: [dr('profitAndLossSuspense', s.profit), cr(capital, s.profit)],
      explanation: [`Share of profit = ${inr(s.last)} x ${s.m}/12 x ${fr(f.x, f.total)} = ${inr(s.profit)}.`, `The year's accounts are not closed, so Profit and Loss Suspense A/c is debited and ${f.out}'s Capital A/c credited.`],
    },
    {
      ...RET.stepGoodwill(f, s.g, s.G),
      explanation: [
        `Normal profit = ${inr(s.ce)} x ${s.rate}/100 = ${inr((s.ce * s.rate) / 100)}; super profit = ${inr(s.avg)} - ${inr((s.ce * s.rate) / 100)} = ${inr(sp)}; goodwill = ${inr(sp)} x ${s.n} = ${inr(s.G)}.`,
        ...RET.stepGoodwill(f, s.g, s.G).explanation,
      ],
    },
    {
      text: `Close ${f.out}'s Drawings A/c.`,
      lines: [dr(capital, s.drawn), cr(partnerDrawings(f.out), s.drawn)],
      explanation: [`What ${f.out} drew reduces what the firm owes: ${f.out}'s Capital A/c is debited and ${f.out}'s Drawings A/c is credited with ${inr(s.drawn)}.`],
    },
    {
      text: `Transfer the amount due to ${f.out}'s executor.`,
      lines: [dr(capital, s.due), cr(executor(f.out), s.due)],
      explanation: [
        `Amount due = ${RET.tally(s.K, [['share of the General Reserve', part(s.R)], ['interest on capital', s.interest], ['share of profit', s.profit], ['share of goodwill', part(s.G)], ['drawings', -s.drawn]])} = ${inr(s.due)}.`,
        `${f.out}'s Capital A/c is debited, which closes it, and ${f.out}'s Executor's A/c is credited.`,
      ],
    },
  ];
}

const chainDeath = caseTemplate<DeathChain>({
  id: 'case-life-chain-death-executor',
  // 2: the context names the account that interest on capital to the date of death goes through.
  version: 2,
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: "A death: entries, capital and the executor",
  setup: (rng) =>
    attempt(14, () => {
      const f = RET.firm(rng);
      const g = RET.gainOf(rng, f, ['silent', 'silent', 'split', 'one']);
      if (!g) return null;
      const T = f.total;
      const y = rng.pick([2024, 2025]);
      const m = rng.pick([3, 4, 5, 6, 7, 8, 9]);
      const last = RET.profitForTime(rng, f, m);
      if (last === null) return null;
      const profit = (last * m * f.x) / (12 * T);
      if (profit % 100 !== 0) return null;
      const r = rng.pick([6, 8, 10, 12]);
      const K = RET.clean(rng, 120000, 500000, 10000, (k) => (k * r * m) % 120000 === 0);
      const R = RET.mult(rng, T * 1000, 20000, 120000);
      const rate = rng.pick([10, 12, 15, 20]);
      const n = rng.pick([2, 3, 2.5]);
      const ce = rng.step(500000, 1500000, 50000);
      const normal = (ce * rate) / 100;
      const unit = 100 * T * sum(g.w);
      const fits: number[] = [];
      for (let sp = Math.ceil((normal * 0.2) / 1000) * 1000; sp <= normal * 0.7; sp += 1000) if (Number.isInteger(sp * n) && (sp * n) % unit === 0) fits.push(sp);
      if (K === null || R === null || fits.length === 0) return null;
      const sp = rng.pick(fits);
      // The average profit is in keeping with last year's.
      if (Math.abs(normal + sp - last) > 0.25 * last) return null;
      const G = sp * n;
      const interest = (K * r * m) / 1200;

      const drawn = rng.step(10000, 60000, 5000);
      const due = K + interest + profit + ((G + R) * f.x) / T - drawn;
      // Part of it is paid at once; the rest, with interest from the date of death, on the next 31 March.
      const rate2 = rng.pick([6, 8, 9, 10, 12]);
      const paid = RET.clean(rng, 50000, Math.floor((due * 0.6) / 10000) * 10000, 10000, (p) => ((due - p) * rate2 * (12 - m)) % 1200 === 0);
      if (paid === null || due < 150000) return null;
      const late = ((due - paid) * rate2 * (12 - m)) / 1200;
      return { f, intro: RET.intro(rng, f), g, y, m, date: monthEnd(y, m), K, r, interest, last, profit, ce, rate, avg: normal + sp, n, G, R, drawn, due, paid, rate2, late };
    }),
  context: (s) => {
    const { f, y } = s;
    const text = [
      `${s.intro} ${RET.FLUCTUATING} ${RET.CLOSES} Every receipt and payment is by cheque.`,
      `${f.out}'s capital as per the balance sheet of 31 March ${y}: ${inr(s.K)}`,
      `General Reserve as per that balance sheet: ${inr(s.R)}`,
      `Net profit for the ${yearEnded(y)}: ${inr(s.last)}`,
      `${f.out} dies on ${s.date}; ${s.g.text}.`,
      `${f.out}'s drawings from 1 April ${y} to the date of death: ${inr(s.drawn)} (no interest is charged on drawings)`,
      `Under the deed the executor is entitled to the capital, interest on capital at ${s.r}% p.a. to the date of death (recorded through Interest on Capital A/c), the share of profit to the date of death on the basis of the last year's profit (through Profit and Loss Suspense A/c), and the shares of the General Reserve and of goodwill. The whole of the General Reserve is distributed among all the partners.`,
      `Goodwill is valued at ${s.n} years' purchase of the super profit: capital employed ${inr(s.ce)}, normal rate of return ${s.rate}%, average profit ${inr(s.avg)}. ${RET.goodwillRule(false)}`,
      `On the date of death ${inr(s.paid)} is paid to the executor by cheque; the rest, with interest at ${s.rate2}% p.a. from the date of death, is paid by cheque on 31 March ${y + 1}.`,
    ].join('\n');
    keptDeathChain.keep(text, s);
    return text;
  },
  parts: [
    {
      kind: 'journal_set',
      make: (s) => ({
        task: `Pass the journal entries on ${s.f.out}'s death, in the order given.`,
        transactions: RET.lettered(deathSteps(s)),
        hints: RET.SET_HINTS.death,
        distractorAccounts: ['goodwill', 'profitAndLossAppropriation', partnerLoan(s.f.out), 'premiumForGoodwill'],
      }),
      verify: (q) => {
        const s = keptDeathChain.of(q.context ?? '');
        if (!s) return false;
        const ledger = post(q.entries.map((e) => e.expected));
        const T = s.f.total;
        // The capital account closes on the opening capital: what is credited less what is debited, and then the transfer.
        const net = -(ledger.get(partnerCapital(s.f.out)) ?? 0) / 100;
        const due = s.K + (s.K * s.r * s.m) / 1200 + (s.last * s.m * s.f.x) / (12 * T) + ((s.G + s.R) * s.f.x) / T - s.drawn;
        return near(net, -s.K) && near(-(ledger.get(executor(s.f.out)) ?? 0) / 100, due) && (ledger.get('generalReserve') ?? 0) === rupees(s.R);
      },
    },
    {
      kind: 'account',
      make: (s) => {
        const { f } = s;
        const capital = partnerCapital(f.out);
        const entries = deathSteps(s).map((st) => ({ date: s.date, lines: st.lines }));
        const view = accountOf(entries, capital, { date: `1 April ${s.y}`, side: 'Cr', amount: rupees(s.K) }, (id) => (id === partnerDrawings(f.out) ? 'Drawings A/c' : ledgerLabel(id)));
        if (view.balance !== null) return null;
        const sides = ledgerSides(view, { closeOn: s.date });
        const exec = ledgerLabel(executor(f.out));
        return {
          task: `Prepare ${f.out}'s Capital A/c up to the date of death, closing it by transfer to ${f.out}'s Executor's A/c.`,
          title: `${f.out}'s Capital A/c`,
          left: { ...sides.left, rows: sides.left.rows.map((r) => (r.label === exec ? { ...r, closing: true } : r)) },
          right: sides.right,
          distractors: [`${f.out}'s Capital A/c`, 'Profit and Loss Appropriation A/c', `${f.out}'s Loan A/c`, 'Goodwill A/c', 'Balance c/d', 'Bank A/c'],
          explanation: deathSteps(s).flatMap((st) => st.explanation).filter((t) => !/closes it, and the capital accounts are credited|which closes it\.$/.test(t)),
          hints: [RET.SET_HINTS.death[0], "Credit: capital, interest on capital, share of profit, shares of the reserve and of goodwill. Debit: drawings. The balance goes to the Executor's A/c."],
        };
      },
      verify: (q: AccountQuestion) => {
        const s = keptDeathChain.of(q.data);
        if (!s) return false;
        const T = s.f.total;
        const credits = s.K + s.interest + s.profit + ((s.G + s.R) * s.f.x) / T;
        const total = (rows: typeof q.sides[0]['rows']): number => sum(rows.map((r) => r.amounts[0])) / 100;
        const transfer = q.sides[0].rows.find((r) => r.label === `${s.f.out}'s Executor's A/c`);
        return near(total(q.sides[1].rows), credits) && near(total(q.sides[0].rows), credits) && transfer !== undefined && near(transfer.amounts[0] / 100, credits - s.drawn);
      },
    },
    {
      kind: 'account',
      make: (s) => {
        const { f } = s;
        const account = executor(f.out);
        const end = `31 March ${s.y + 1}`;
        const entries: DatedEntry[] = [
          { date: s.date, lines: [dr(partnerCapital(f.out), s.due), cr(account, s.due)] },
          { date: s.date, lines: [dr(account, s.paid), cr('bank', s.paid)] },
          { date: end, lines: [dr('interestOnLoan', s.late), cr(account, s.late)] },
          { date: end, lines: [dr(account, s.due - s.paid + s.late), cr('bank', s.due - s.paid + s.late)] },
        ];
        const view = accountOf(entries, account);
        if (view.balance !== null || s.paid === s.due - s.paid + s.late) return null;
        const sides = ledgerSides(view, { closeOn: end });
        return {
          task: `Starting from the amount transferred to it on the death, prepare ${f.out}'s Executor's A/c up to 31 March ${s.y + 1}.`,
          title: `${f.out}'s Executor's A/c`,
          left: sides.left,
          right: { ...sides.right, rows: RET.withInterestAlso(sides.right.rows) },
          distractors: [`${f.out}'s Executor's A/c`, `${f.out}'s Loan A/c`, 'Interest on Capital A/c', 'Profit and Loss Suspense A/c', 'Balance c/d'],
          explanation: [
            `${s.date}: the amount due, ${inr(s.due)}, is credited ("By ${f.out}'s Capital A/c"); the cheque of ${inr(s.paid)} is debited ("To Bank A/c").`,
            `${s.date} to ${end} is ${12 - s.m} months: interest = ${inr(s.due - s.paid)} x ${s.rate2}/100 x ${12 - s.m}/12 = ${inr(s.late)}, credited ("By ${RET.INTEREST_ROW}"). ${RET.INTEREST_NAMES}`,
            `${end}: the balance and the interest are paid, ${inr(s.due - s.paid)} + ${inr(s.late)} = ${inr(s.due - s.paid + s.late)} ("To Bank A/c"), which closes the account.`,
          ],
          hints: RET.H.executor,
        };
      },
      verify: (q: AccountQuestion) => {
        const s = keptDeathChain.of(q.data);
        if (!s) return false;
        const left = (s.due - s.paid) * (1 + (s.rate2 * (12 - s.m)) / 1200);
        const banks = q.sides[0].rows.filter((r) => r.label === 'Bank A/c').map((r) => r.amounts[0] / 100);
        return banks.length === 2 && banks.some((b) => near(b, s.paid)) && banks.some((b) => near(b, left));
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 23. case-life-chain-change-year: partners change their ratio at the start of a year (the reserve and the profit on
//     revaluation to the old ratio, goodwill valued on three years' profits adjusted between them), then share that
//     year's profit in the new ratio with interest on the capitals the change leaves: the entries, the capital
//     accounts on the change, then the Profit and Loss Appropriation Account of the year (complex).
// ---------------------------------------------------------------------------------------------------------------

interface ChangeYear {
  names: string[];
  ch: CPR.Change;
  firm: string;
  y: number;
  caps: number[];
  R: number;
  V: number;
  profits: number[];
  n: number;
  G: number;
  after: number[];
  r: number;
  ioc: number[];
  si: number;
  s: number;
  profit: number;
  divisible: number;
}

const keptChangeYear = keepFor<ChangeYear>();

/** The entries of the change, in order: the reserve, the profit on revaluation, goodwill. */
function changeSteps(s: ChangeYear) {
  const { ch, names } = s;
  const ids = names.map(partnerCapital);
  const inOld = (v: number): number[] => ch.old.map((t) => (v * t) / ch.so);
  return [
    {
      text: 'The General Reserve is distributed.',
      lines: [dr('generalReserve', s.R), ...inOld(s.R).map((x, i) => cr(ids[i], x))],
      explanation: [`It was built up under the old ratio, ${rt(ch.old)}: ${eachAnd(names, inOld(s.R))}, credited; General Reserve A/c is debited, which closes it.`],
    },
    {
      text: 'The profit on revaluation is transferred.',
      lines: [dr('revaluation', s.V), ...inOld(s.V).map((x, i) => cr(ids[i], x))],
      explanation: [`The values changed before the new ratio began: the profit goes to the partners in the old ratio, ${eachAnd(names, inOld(s.V))}; Revaluation A/c is debited, which closes it.`],
    },
    {
      text: 'Goodwill is adjusted between the partners.',
      lines: CPR.compensation(ch, names, s.G, false),
      explanation: [
        `Average profit = (${s.profits.map(inr).join(' + ')}) / 3 = ${inr(s.G / s.n)}; goodwill = ${inr(s.G / s.n)} x ${s.n} = ${inr(s.G)}.`,
        ...CPR.movesText(ch, names),
        ...[...ch.gain, ...ch.sac].map((i) => `${names[i]}: ${inr(s.G)} x ${CPR.frac(Math.abs(ch.d[i]), ch.L)} = ${inr(CPR.moved(s.G, ch, i))}.`),
        'The partner who gains is debited and the partner who sacrifices is credited.',
      ],
    },
  ];
}

const chainChangeYear = caseTemplate<ChangeYear>({
  id: 'case-life-chain-change-year',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'A new ratio, then a year in it',
  setup: (rng) =>
    attempt(16, () => {
      const ch = rng.pick([...CPR.TWO, ...CPR.THREE.filter((c) => c.L <= 30)]);
      const n = ch.old.length;
      const names = P.partners(rng, n);
      const y = rng.pick([2024, 2025, 2026]);
      const base = rng.pick([50000, 100000]);
      const caps = rng.shuffle(rng.pick(n === 2 ? P.CAPS2 : P.CAPS3)).map((u) => u * base);
      const R = RET.mult(rng, ch.so * 1000, 20000, 120000);
      const V = RET.mult(rng, ch.so * 1000, 10000, 80000);
      // Goodwill on the profits of three years, the average from a tenth to a third of the capitals; a multiple of a
      // hundred times the denominator of the change, so that every amount moved is a whole hundred.
      const valued = profitsFor(rng, 100 * ch.L, 60000, 480000, [2, 3, 4], [0.1 * sum(caps), sum(caps) / 3]);
      if (R === null || V === null || valued === null) return null;
      const { profits, n: yp, G } = valued;
      const avg = G / yp;
      const after = caps.map((c, i) => c + ((R + V) * ch.old[i]) / ch.so + (G * ch.d[i]) / ch.L);
      const r = rng.pick([5, 6, 8, 10]);
      const ioc = after.map((c) => (c * r) / 100);
      if (after.some((c) => c < 50000) || ioc.some((x) => !Number.isInteger(x) || x % 10 !== 0)) return null;
      const si = rng.int(0, n - 1);
      const s = rng.int(0, 1) === 0 ? rng.step(2000, 6000, 500) : 0;
      // The year's profit is in keeping with the profits goodwill was valued on.
      const divisible = RET.mult(rng, ch.sn * 1000, Math.max(40000, 0.85 * avg - sum(ioc) - 12 * s), 1.3 * avg - sum(ioc) - 12 * s);
      if (divisible === null) return null;
      const profit = divisible + sum(ioc) + 12 * s;

      return { names, ch, firm: FIRM_OF(rng), y, caps, R, V, profits, n: yp, G, after, r, ioc, si, s, profit, divisible };
    }),
  context: (s) => {
    const { names, ch, y } = s;
    const text = [
      `${list(names)} are partners in ${s.firm}. Until 31 March ${y - 1} they shared profits and losses ${inRatio(ch.old)}; from 1 April ${y - 1} they agreed to share them ${inRatio(ch.neu)}. Their capitals are fluctuating, and goodwill is never raised in the books. ${P.OWN_ACCOUNTS}`,
      `Capitals on 1 April ${y - 1}: ${each(names, s.caps)}`,
      `General Reserve on that date: ${inr(s.R)}; the whole of it is distributed on the change`,
      `Revaluation A/c, prepared on the change, shows a profit of ${inr(s.V)}, still to be transferred`,
      `Goodwill is valued at ${s.n} years' purchase of the average profit of the last three years, ${s.profits.map(inr).join(', ')}, and adjusted through the capital accounts.`,
      `For the ${yearEnded(y)}: interest on capital at ${s.r}% p.a. on the capitals as they stand after the change${s.s > 0 ? `; salary ${inr(s.s)} per month to ${names[s.si]}` : ''}; net profit as per Profit and Loss A/c ${inr(s.profit)}.`,
    ].join('\n');
    keptChangeYear.keep(text, s);
    return text;
  },
  parts: [
    {
      kind: 'journal_set',
      make: (s) => ({
        task: `Pass the journal entries on 1 April ${s.y - 1} for the change of ratio, in the order given.`,
        transactions: P.labelled(changeSteps(s)),
        hints: CPR.H.goodwill,
        distractorAccounts: ['goodwill', 'premiumForGoodwill', 'profitAndLossAppropriation', ...s.names.map(partnerCurrent)],
      }),
      verify: (q) => {
        const s = keptChangeYear.of(q.context ?? '');
        if (!s) return false;
        const ledger = post(q.entries.map((e) => e.expected));
        const old = shares(s.ch.old);
        const neu = shares(s.ch.neu);
        return s.names.every((nm, i) => near(-(ledger.get(partnerCapital(nm)) ?? 0) / 100, (s.R + s.V) * old[i] + s.G * (old[i] - neu[i])));
      },
    },
    {
      kind: 'account',
      make: (s) => {
        const day = `1 April ${s.y - 1}`;
        const ids = s.names.map(partnerCapital);
        const view = columnarAccount(
          changeSteps(s).map((st) => ({ date: day, lines: st.lines })),
          ids,
          { date: day, balances: s.caps.map((c) => ({ side: 'Cr' as const, amount: rupees(c) })) },
          (id) => (id === 'revaluation' ? ADM.revaluationRow(true) : ledgerLabel(id)),
        );
        if (view.balances.some((b) => b === null || b.side !== 'Cr')) return null;
        const sides = columnarSides(view, { closeOn: day, reopenOn: day });
        return {
          task: `Prepare the partners' capital accounts in columns on the change of ratio, and bring the balances down.`,
          title: "Partners' Capital Accounts",
          columns: partnerColumns(s.names),
          left: { ...sides.left, rows: ADM.plainRevaluation(sides.left.rows) },
          right: { ...sides.right, rows: ADM.plainRevaluation(sides.right.rows) },
          distractors: ['Goodwill A/c', ADM.revaluationRow(false), 'Premium for Goodwill A/c', 'Current A/c', 'Profit and Loss Appropriation A/c'],
          explanation: [
            'Each partner has a column; the capitals open the credit side ("By Balance b/d").',
            ...changeSteps(s).flatMap((st) => st.explanation),
            `Balances carried down and brought down: ${each(s.names, s.after)}.`,
          ],
          hints: CPR.H.capitals,
        };
      },
      verify: (q: AccountQuestion) => {
        const s = keptChangeYear.of(q.data);
        if (!s) return false;
        const old = shares(s.ch.old);
        const neu = shares(s.ch.neu);
        return columnsClose(q, s.names.map((_, i) => s.caps[i] + (s.R + s.V) * old[i] + s.G * (old[i] - neu[i])));
      },
    },
    {
      kind: 'account',
      make: (s) => {
        const yr = { y: s.y, ended: yearEnded(s.y), from: `1 April ${s.y - 1}`, on: `31 March ${s.y}` };
        const salary = s.names.map((_, i) => (i === s.si ? 12 * s.s : 0));
        const made = P.appropriationAccount({ yr, names: s.names, fixed: false, psr: s.ch.neu, profit: s.profit, ioc: s.ioc, salary, commission: s.names.map(() => 0), iod: s.names.map(() => 0), reserve: 0 });
        return {
          task: `Starting from the capitals carried down on the change, prepare the Profit and Loss Appropriation Account for the ${yr.ended}, showing interest on capital as one figure and each partner's share of profit on its own.`,
          title: P.APP_TITLE,
          left: made.left,
          right: made.right,
          distractors: ["Interest on Partner's Loan A/c", 'Drawings A/c', 'Balance c/d', 'General Reserve A/c', 'Revaluation A/c', 'Interest on Drawings A/c', `${s.names[0]}'s Current A/c`],
          explanation: [
            `The account opens with the net profit: By Profit and Loss A/c ${inr(s.profit)}.`,
            `Interest on capital at ${s.r}% p.a. on the capitals after the change: ${s.names.map((nm, i) => `${nm} ${inr(s.after[i])} x ${s.r}/100 = ${inr(s.ioc[i])}`).join('; ')}; total ${inr(sum(s.ioc))}.`,
            ...(s.s > 0 ? [`Salary to ${s.names[s.si]} = ${inr(s.s)} x 12 = ${inr(12 * s.s)}.`] : []),
            `Divisible profit = ${inr(s.profit)} - ${inr(sum(s.ioc))}${s.s > 0 ? ` - ${inr(12 * s.s)}` : ''} = ${inr(s.divisible)}, shared in the new ratio: ${P.sharesText(s.names, s.divisible, s.ch.neu)}`,
          ],
          hints: [P.H.approp[0], 'From 1 April the partners share in the new ratio, and interest runs on the capitals the change left.'],
        };
      },
      verify: (q: AccountQuestion) => {
        const s = keptChangeYear.of(q.data);
        if (!s) return false;
        const [debit, credit] = q.sides.map((x) => x.rows);
        const total = (rows: typeof debit): number => sum(rows.map((r) => r.amounts[0])) / 100;
        const neu = shares(s.ch.neu);
        const ioc = s.names.map((_, i) => ((s.caps[i] + ((s.R + s.V) * s.ch.old[i]) / s.ch.so + (s.G * s.ch.d[i]) / s.ch.L) * s.r) / 100);
        const left = s.profit - sum(ioc) - 12 * s.s;
        return (
          near(total(debit), s.profit) &&
          near(total(credit), s.profit) &&
          near((debit.find((r) => r.label === 'Interest on Capital A/c')?.amounts[0] ?? 0) / 100, sum(ioc)) &&
          s.names.every((nm, i) => debit.some((r) => r.closing && r.label === `${nm}'s Capital A/c` && near(r.amounts[0] / 100, left * neu[i])))
        );
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 24. case-life-chain-year-retirement-loan: a firm's year, then a partner retires on its last day: the Profit and
//     Loss Appropriation Account, the retiring partner's Capital A/c for the year and the retirement (starting from
//     the share of profit), then the Loan A/c over two years, repaid in two instalments with interest (complex).
// ---------------------------------------------------------------------------------------------------------------

interface YearRetireLoan {
  y: PfPartnersYear;
  f: RET.Firm;
  g: RET.Gain;
  closing: number[];
  R: number;
  V: number;
  past: [number, number];
  n: number;
  G: number;
  due: number;
  rate: number;
}

const keptYearRetireLoan = keepFor<YearRetireLoan>();

function retireSteps(s: YearRetireLoan): RET.Step[] {
  return [
    RET.stepAccumulated(s.f, RET.ACCUMULATED.reserve, s.R),
    RET.stepRevaluation(s.f, s.V, `Revaluation shows a ${s.V > 0 ? 'profit' : 'loss'} of ${inr(Math.abs(s.V))}.`),
    RET.stepGoodwill(s.f, s.g, s.G),
    RET.stepSettle(s.f, s.due, { kind: 'loan' }, ''),
  ];
}

const chainYearRetirementLoan = caseTemplate<YearRetireLoan>({
  id: 'case-life-chain-year-retirement-loan',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: "A last year, a retirement and the loan",
  setup: (rng) =>
    attempt(14, () => {
      const drawn = P.partnersYear(rng, false, { changes: [0] });
      const y = drawn && believable(drawn);
      if (!y || y.names.length !== 3) return null;
      const closing = yearClosing(y);
      if (closing.some((c) => c < 60000)) return null;
      const out = rng.int(0, 2);
      const f = firmFrom(y.names, y.psr, out);
      const g = RET.gainOf(rng, f, ['silent', 'silent', 'split']);
      if (!g) return null;
      const T = f.total;
      const n = rng.pick([2, 3, 1.5]);
      const past = twoBefore(rng, y.profit, n, 100 * T * sum(g.w));
      const R = RET.mult(rng, T * 1000, 20000, 120000);
      const V = (rng.int(0, 2) > 0 ? 1 : -1) * (RET.mult(rng, T * 1000, 10000, 60000) ?? 0);
      if (!past || R === null || V === 0) return null;
      const G = ((past[0] + past[1] + y.profit) / 3) * n;
      const due = closing[out] + ((G + R + V) * f.x) / T;
      const rate = rng.pick([6, 8, 9, 10, 12]);
      // Two equal instalments of principal whose interest is in whole rupees.
      if (due % 200 !== 0 || ((due * rate) / 100) % 1 !== 0 || (((due / 2) * rate) / 100) % 1 !== 0) return null;
      const { parts } = RET.goodwillParts(f, g, G);
      if (f.stay.some((nm, i) => closing[f.names.indexOf(nm)] + ((R + V) * f.stayOld[i]) / T - parts[i] < 20000)) return null;
      return { y, f, g, closing, R, V, past, n, G, due, rate };
    }),
  context: (s) => {
    const { y, f } = s;
    const text = [
      `${list(y.names)} are partners in ${y.firm} sharing profits and losses in the ratio ${rt(y.psr)}. Their capitals are fluctuating. ${P.ITEMS_OWN}`,
      ...yearLines(y),
      `General Reserve on 31 March ${y.yr.y}: ${inr(s.R)}`,
      `Net profits of the two years before, as per Profit and Loss A/c: ${inr(s.past[0])} (${yearEnded(y.yr.y - 2)}) and ${inr(s.past[1])} (${yearEnded(y.yr.y - 1)})`,
      `Once the accounts of the year are closed, ${f.out} retires on ${y.yr.on}; ${s.g.text}. Revaluation on that date shows a ${s.V > 0 ? 'profit' : 'loss'} of ${inr(Math.abs(s.V))}.`,
      `${RET.RESERVE_IN_FULL} Goodwill is valued at ${s.n} years' purchase of the average net profit of the last three years; ${RET.goodwillRule(false).charAt(0).toLowerCase()}${RET.goodwillRule(false).slice(1)}`,
      `The amount due to ${f.out} is transferred to ${f.out}'s Loan A/c and repaid in two equal annual instalments of principal on 31 March ${y.yr.y + 1} and 31 March ${y.yr.y + 2}, each with interest at ${s.rate}% p.a. on the loan outstanding.`,
    ].join('\n');
    keptYearRetireLoan.keep(text, s);
    return text;
  },
  parts: [
    {
      kind: 'account',
      make: (s) => {
        const made = P.appropriationAccount({ yr: s.y.yr, names: s.y.names, fixed: false, psr: s.y.psr, profit: s.y.profit, ioc: s.y.ioc, salary: s.y.salary, commission: s.y.commission, iod: s.y.iod, reserve: 0 });
        return { task: P.appTask(s.y.yr, sum(s.y.iod) > 0), title: P.APP_TITLE, left: made.left, right: made.right, distractors: APP_SLIPS(s.y), explanation: appWorking(s.y), hints: P.H.approp };
      },
      verify: (q: AccountQuestion) => {
        const s = keptYearRetireLoan.of(q.data);
        return s !== undefined && appHolds(q, s.y);
      },
    },
    {
      kind: 'account',
      make: (s) => {
        const { f, y } = s;
        const capital = partnerCapital(f.out);
        const entries: DatedEntry[] = [...P.yearEntries(y), ...retireSteps(s).map((st) => ({ date: y.yr.on, lines: st.lines }))];
        const o = f.names.indexOf(f.out);
        const view = accountOf(entries, capital, { date: y.yr.from, side: 'Cr', amount: rupees(y.caps[o]) }, (id) =>
          id.startsWith('drawings:') ? 'Drawings A/c' : id === 'revaluation' ? ADM.revaluationRow(s.V > 0) : ledgerLabel(id),
        );
        if (view.balance !== null) return null;
        const sides = ledgerSides(view, { closeOn: y.yr.on });
        const loan = ledgerLabel(partnerLoan(f.out));
        const mark = (rows: FormatRowParts[]): FormatRowParts[] => ADM.plainRevaluation(rows.map((r) => (r.label === loan ? { ...r, closing: true } : r)));
        const T = f.total;
        return {
          task: `Starting from ${f.out}'s share of profit in the Appropriation Account, prepare ${f.out}'s Capital A/c for the ${y.yr.ended} and the retirement, closing it by transfer to ${f.out}'s Loan A/c.`,
          title: `${f.out}'s Capital A/c`,
          left: { ...sides.left, rows: mark(sides.left.rows) },
          right: { ...sides.right, rows: mark(sides.right.rows) },
          distractors: ['Balance c/d', 'Goodwill A/c', `${f.out}'s Current A/c`, 'Bank A/c', 'Premium for Goodwill A/c', ADM.revaluationRow(s.V < 0)],
          explanation: [
            `The year: capital ${inr(y.caps[o])} b/d, interest on capital ${inr(y.ioc[o])}${y.salary[o] ? `, salary ${inr(y.salary[o])}` : ''}${y.commission[o] ? `, commission ${inr(y.commission[o])}` : ''}, share of profit ${inr(y.shares[o])} (from the Appropriation Account); drawings ${inr(y.drawings[o])}${y.iod[o] ? ` and interest on them ${inr(y.iod[o])}` : ''} debited. Balance after the year ${inr(s.closing[o])}.`,
            `The retirement: share of the General Reserve ${inr((s.R * f.x) / T)}, ${s.V > 0 ? 'profit' : 'loss'} on revaluation ${inr((Math.abs(s.V) * f.x) / T)} ("${s.V > 0 ? 'By' : 'To'} ${ADM.revaluationRow(s.V > 0)}").`,
            `Average net profit = (${inr(s.past[0])} + ${inr(s.past[1])} + ${inr(y.profit)}) / 3 = ${inr(s.G / s.n)}; goodwill = ${inr(s.G)}; ${f.out}'s share ${inr((s.G * f.x) / T)}, credited from the partners who gain. ${s.g.why}.`,
            `Amount due = ${inr(s.due)}, transferred "To ${loan}", which closes the account.`,
          ],
          hints: [RET.H.due[0], 'The year\'s items come first, then the retirement: reserve, revaluation, goodwill. The balance goes to the Loan A/c.'],
        };
      },
      verify: (q: AccountQuestion) => {
        const s = keptYearRetireLoan.of(q.data);
        if (!s) return false;
        const o = s.f.names.indexOf(s.f.out);
        const due = s.y.caps[o] + s.y.ioc[o] + s.y.salary[o] + s.y.commission[o] + (s.y.divisible * s.f.x) / s.f.total - s.y.drawings[o] - s.y.iod[o] + ((s.G + s.R + s.V) * s.f.x) / s.f.total;
        const row = q.sides[0].rows.find((r) => r.label === `${s.f.out}'s Loan A/c`);
        return row !== undefined && near(row.amounts[0] / 100, due);
      },
    },
    {
      kind: 'account',
      make: (s) => {
        const { f, y } = s;
        const account = partnerLoan(f.out);
        const half = s.due / 2;
        const i1 = (s.due * s.rate) / 100;
        const i2 = (half * s.rate) / 100;
        const y1 = `31 March ${y.yr.y + 1}`;
        const y2 = `31 March ${y.yr.y + 2}`;
        const entries: DatedEntry[] = [
          { date: y.yr.on, lines: [dr(partnerCapital(f.out), s.due), cr(account, s.due)] },
          { date: y1, lines: [dr('interestOnLoan', i1), cr(account, i1)] },
          { date: y1, lines: [dr(account, half + i1), cr('bank', half + i1)] },
          { date: y2, lines: [dr('interestOnLoan', i2), cr(account, i2)] },
          { date: y2, lines: [dr(account, half + i2), cr('bank', half + i2)] },
        ];
        const made = ledgerPeriods(entries, account, [
          { closeOn: y1, reopenOn: `1 April ${y.yr.y + 1}`, title: `Year ended ${y1}` },
          { closeOn: y2, title: `Year ended ${y2}` },
        ]);
        return {
          task: `Starting from the amount transferred to it, prepare ${f.out}'s Loan A/c for the two years to ${y2}, balancing it on each 31 March. Enter each payment as one figure.`,
          title: `${f.out}'s Loan A/c`,
          ...made,
          right: { ...made.right, rows: RET.withInterestAlso(made.right.rows) },
          later: made.later?.map((p) => ({ ...p, right: RET.withInterestAlso(p.right) })),
          periodTitle: `${y.yr.on} to ${y1}`,
          distractors: [`${f.out}'s Loan A/c`, `${f.out}'s Executor's A/c`, 'Interest on Capital A/c', 'Balance b/d', "Interest on Partner's Loan A/c"],
          explanation: [
            `${y.yr.on}: the amount due, ${inr(s.due)}, is credited ("By ${f.out}'s Capital A/c"). Each instalment of principal = ${inr(s.due)} / 2 = ${inr(half)}.`,
            `${y1}: interest for the year on ${inr(s.due)} at ${s.rate}% = ${inr(i1)}, credited ("By ${RET.INTEREST_ROW}"). The payment is the instalment and that interest: ${inr(half)} + ${inr(i1)} = ${inr(half + i1)} ("To Bank A/c"). Balance carried down ${inr(half)}.`,
            `${y2}: interest on ${inr(half)} = ${inr(i2)}; payment ${inr(half)} + ${inr(i2)} = ${inr(half + i2)}, which closes the account.`,
            RET.INTEREST_NAMES,
          ],
          hints: RET.H.loan,
        };
      },
      verify: (q: AccountQuestion) => {
        const s = keptYearRetireLoan.of(q.data);
        if (!s || !q.later || q.later.length !== 1) return false;
        const half = s.due / 2;
        const bank1 = q.sides[0].rows.find((r) => r.label === 'Bank A/c')?.amounts[0] ?? 0;
        const bank2 = q.later[0][0].find((r) => r.label === 'Bank A/c')?.amounts[0] ?? 0;
        return near(bank1 / 100, half * (1 + (2 * s.rate) / 100)) && near(bank2 / 100, half * (1 + s.rate / 100));
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 25. case-life-chain-admission-guarantee: a partner admitted with capital and a premium (goodwill valued on three
//     years' profits, the reserve to the old partners), and a minimum share of profit guaranteed by the old partners;
//     the capital accounts on the admission, then the first year's Profit and Loss Appropriation Account, with interest
//     on the capitals those accounts carry down and the deficiency made good (complex).
// ---------------------------------------------------------------------------------------------------------------

interface AdmitGuarantee {
  d: ADM.Deal;
  caps: number[];
  R: number;
  profits: number[];
  n: number;
  G: number;
  K: number;
  premium: number;
  credits: number[];
  after: number[];
  r: number;
  ioc: number[];
  profit: number;
  divisible: number;
  own: number[];
  M: number;
  gap: number;
  borne: number[];
  final: number[];
}

const keptAdmitGuarantee = keepFor<AdmitGuarantee>();

const chainAdmissionGuarantee = caseTemplate<AdmitGuarantee>({
  id: 'case-life-chain-admission-guarantee',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'A new partner with a guarantee, then a year',
  setup: (rng) =>
    attempt(16, () => {
      const d = ADM.dealWhere(rng, ['old', 'old', 'equal', 'stated'], ADM.tidySac, 2);
      if (!d || d.sac === null) return null;
      const T = sum(d.old);
      const base = rng.pick([50000, 100000]);
      const caps = rng.shuffle(rng.pick(P.CAPS2)).map((u) => u * base);
      const R = RET.mult(rng, T * 1000, 20000, 100000);
      const n = rng.pick([2, 3, 1.5]);
      const unit = unitFor([d.share, ...d.given]);
      const fits: number[] = [];
      // An average profit in keeping with the capitals: from a sixth to a half of them.
      for (let a = Math.max(60000, Math.ceil(sum(caps) / 6000) * 1000); a <= Math.min(300000, sum(caps) / 2); a += 1000) if (Number.isInteger(a * n) && (a * n) % unit === 0) fits.push(a);
      if (R === null || fits.length === 0) return null;
      const avg = rng.pick(fits);
      const p1 = rng.step(Math.round((avg * 0.8) / 1000) * 1000, Math.round((avg * 1.1) / 1000) * 1000, 1000);
      const p2 = rng.step(Math.round((avg * 0.85) / 1000) * 1000, Math.round((avg * 1.15) / 1000) * 1000, 1000);
      const p3 = 3 * avg - p1 - p2;
      if (p3 < avg * 0.75 || p3 > avg * 1.35 || new Set([p1, p2, p3]).size < 3) return null;
      const G = avg * n;
      const premium = ADM.of(G, d.share);
      const credits = d.given.map((x) => ADM.of(G, x));
      const fair = (sum(caps) * d.share[0]) / (d.share[1] - d.share[0]);
      const K = Math.max(50000, Math.round((fair * rng.int(80, 120)) / 100 / 10000) * 10000);
      const after = [...caps.map((c, i) => c + (R * d.old[i]) / T + credits[i]), K];
      const r = rng.pick([5, 6, 8, 10]);
      const ioc = after.map((c) => (c * r) / 100);
      if (ioc.some((x) => !Number.isInteger(x) || x % 10 !== 0)) return null;
      const N = sum(d.newRatio);
      // A first year that leaves the new partner a little short of the guarantee.
      const divisible = RET.mult(rng, N * 1000, Math.max(60000, avg * 0.4), avg * 0.9);
      if (divisible === null) return null;
      const own = d.newRatio.map((t) => (divisible * t) / N);
      const step = 1000 * T;
      const gap = step * rng.int(1, Math.max(1, Math.floor((own[2] * 0.4) / step)));
      if (gap > own[2] * 0.4) return null;
      const M = own[2] + gap;
      const borne = d.old.map((t) => (gap * t) / T);
      const final = [own[0] - borne[0], own[1] - borne[1], M];
      if (final.some((x) => x <= 0)) return null;
      return { d, caps, R, profits: [p1, p2, p3], n, G, K, premium, credits, after, r, ioc, profit: divisible + sum(ioc), divisible, own, M, gap, borne, final };
    }),
  context: (s) => {
    const { d } = s;
    const y = d.year;
    const text = [
      `${d.open} Their capitals are fluctuating, and goodwill is never raised in the books. ${P.OWN_ACCOUNTS}`,
      `Capitals on 31 March ${y}: ${each(d.olds, s.caps)}; General Reserve ${inr(s.R)}`,
      `Net profits of the last three years: ${s.profits.map((x, k) => `${inr(x)} (${yearEnded(y - 2 + k)})`).join(', ')}`,
      `${d.admit} ${d.how} The whole of the General Reserve is distributed among the old partners.`,
      `${d.nw} brings ${inr(s.K)} as capital and ${d.nw}'s share of goodwill as premium, by cheque; goodwill is valued at ${s.n} years' purchase of the average profit of the last three years, and the premium is kept in the business.`,
      `${list(d.olds)} guarantee that ${d.nw}'s share of profit will not be less than ${inr(s.M)} in any year; any deficiency is borne by them in their old ratio, ${rt(d.old)}, and is made good in the Profit and Loss Appropriation Account.`,
      `For the ${yearEnded(y + 1)}: interest on capital at ${s.r}% p.a. on the capitals as they stand after the admission; net profit as per Profit and Loss A/c ${inr(s.profit)}.`,
    ].join('\n');
    keptAdmitGuarantee.keep(text, s);
    return text;
  },
  parts: [
    {
      kind: 'account',
      make: (s) => {
        const { d } = s;
        const day = `1 April ${d.year}`;
        const T = sum(d.old);
        const ids = d.names.map(partnerCapital);
        const reserve = d.old.map((t) => (s.R * t) / T);
        const lines: JournalLine[][] = [
          [dr('generalReserve', s.R), ...reserve.map((x, i) => cr(ids[i], x))],
          [dr('bank', s.K + s.premium), cr(ids[2], s.K), cr('premiumForGoodwill', s.premium)],
          ADM.entry(dr('premiumForGoodwill', s.premium), ...s.credits.map((c, i) => cr(ids[i], c))),
        ];
        const view = columnarAccount(lines.map((l) => ({ date: day, lines: l })), ids, { date: day, balances: [...s.caps.map((c) => ({ side: 'Cr' as const, amount: rupees(c) })), null] });
        const sides = columnarSides(view, { closeOn: day, reopenOn: day });
        const avg = sum(s.profits) / 3;
        return {
          task: `Prepare the partners' capital accounts in columns on ${d.nw}'s admission on ${day}, and bring the balances down.`,
          title: "Partners' Capital Accounts",
          columns: partnerColumns(d.names),
          ...sides,
          distractors: ['Goodwill A/c', 'Revaluation A/c', 'Current A/c', 'Profit and Loss Appropriation A/c', 'Cash A/c'],
          explanation: [
            'Each partner has a column. The capitals of the old partners open the credit side: By Balance b/d.',
            `The whole of the General Reserve goes to the old partners in ${rt(d.old)}: ${ADM.eachGets(d.olds, reserve)}, "By General Reserve A/c".`,
            `${d.nw}'s capital of ${inr(s.K)}: "By Bank A/c" in ${d.nw}'s column.`,
            `Average profit = (${s.profits.map(inr).join(' + ')}) / 3 = ${inr(avg)}; goodwill = ${inr(avg)} x ${s.n} = ${inr(s.G)}; premium = ${inr(s.G)} x ${ADM.fs(d.share)} = ${inr(s.premium)}. ${ADM.sacStep(d)} "By Premium for Goodwill A/c": ${ADM.eachGets(d.olds, s.credits)}.`,
            `Balances carried down and brought down: ${ADM.eachGets(d.names, s.after)}.`,
          ],
          hints: ADM.H.newFirm,
        };
      },
      verify: (q: AccountQuestion) => {
        const s = keptAdmitGuarantee.of(q.data);
        const k = ADM.readDeal(q.data);
        if (!s || !k) return false;
        const avg = sum(amountsIn(lineOf(q.data, 'Net profits of the last three years'))) / 3;
        const G = avg * s.n;
        return columnsClose(q, [...k.olds.map((nm, i) => amountOf(lineOf(q.data, 'Capitals on'), nm) + s.R * k.shares[i] + G * k.given[i]), s.K]);
      },
    },
    {
      kind: 'account',
      make: (s) => {
        const { d } = s;
        const y = d.year + 1;
        const yr = { y, ended: yearEnded(y), from: `1 April ${y - 1}`, on: `31 March ${y}` };
        const zero = d.names.map(() => 0);
        const made = P.appropriationAccount({ yr, names: d.names, fixed: false, psr: d.newRatio, profit: s.profit, ioc: s.ioc, salary: zero, commission: zero, iod: zero, reserve: 0 });
        const details = (j: number): string[] =>
          j === 2 ? [`Share of profit ${inr(s.own[2])}`, `Add: Deficiency made good by ${list(d.olds)} ${inr(s.gap)}`] : [`Share of profit ${inr(s.own[j])}`, `Less: Deficiency borne for ${d.nw} ${inr(s.borne[j])}`];
        const rows = made.left.rows.map((row): FormatRowParts => {
          const j = d.names.findIndex((nm) => `${nm}'s Capital A/c` === row.label);
          return row.closing && j >= 0 ? { ...row, amount: rupees(s.final[j]), details: details(j) } : row;
        });
        return {
          task: `Starting from the capitals carried down on the admission, prepare the Profit and Loss Appropriation Account for the ${yr.ended}, showing interest on capital as one figure and each partner's share of profit after any deficiency.`,
          title: P.APP_TITLE,
          left: { ...made.left, rows },
          right: made.right,
          distractors: ["Interest on Partner's Loan A/c", 'Premium for Goodwill A/c', 'Balance c/d', 'General Reserve A/c', 'Drawings A/c', `${d.olds[0]}'s Current A/c`],
          explanation: [
            `By Profit and Loss A/c ${inr(s.profit)}.`,
            `Interest on capital at ${s.r}% p.a. on the capitals after the admission: ${d.names.map((nm, i) => `${nm} ${inr(s.after[i])} x ${s.r}/100 = ${inr(s.ioc[i])}`).join('; ')}; total ${inr(sum(s.ioc))}.`,
            `Divisible profit = ${inr(s.profit)} - ${inr(sum(s.ioc))} = ${inr(s.divisible)}, shared in the new ratio ${rt(d.newRatio)}: ${ADM.eachGets(d.names, s.own)}.`,
            `${d.nw}'s share is ${inr(s.gap)} short of the guaranteed ${inr(s.M)}; ${list(d.olds)} bear it in ${rt(d.old)}: ${ADM.eachGets(d.olds, s.borne)}.`,
            `Each share is shown after the deficiency: ${ADM.eachGets(d.names, s.final)}.`,
          ],
          hints: [P.H.approp[0], P.H.guarantee[1]],
        };
      },
      verify: (q: AccountQuestion) => {
        const s = keptAdmitGuarantee.of(q.data);
        if (!s) return false;
        const [debit, credit] = q.sides.map((x) => x.rows);
        const total = (rows: typeof debit): number => sum(rows.map((r) => r.amounts[0])) / 100;
        const ioc = s.after.reduce((a, c) => a + (c * s.r) / 100, 0);
        const left = s.profit - ioc;
        const shareC = (left * s.d.share[0]) / s.d.share[1];
        const gap = Math.max(s.M - shareC, 0);
        const finals = s.d.names.map((_, j) => (j === 2 ? Math.max(s.M, shareC) : (left * s.d.newRatio[j]) / sum(s.d.newRatio) - (gap * s.d.old[j]) / sum(s.d.old)));
        return (
          near(total(debit), s.profit) &&
          near(total(credit), s.profit) &&
          s.d.names.every((nm, j) => debit.some((r) => r.closing && r.label === `${nm}'s Capital A/c` && near(r.amounts[0] / 100, finals[j])))
        );
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 26. case-life-chain-change-dissolution: partners change their ratio (revaluation, the reserve to the old ratio,
//     goodwill valued on three years' profits adjusted between them), and some months later dissolve the firm (the
//     profit of those months shared and withdrawn, so no balance has changed): the capital accounts on the change, Realisation A/c from the values the change leaves, then
//     the capital accounts that close the books, starting from the capitals the first part carries down (complex).
// ---------------------------------------------------------------------------------------------------------------

interface ChangeWindUp {
  names: string[];
  ch: CPR.Change;
  firm: string;
  y: number;
  bs: { main: DIS.Thing; mainBook: number; second: DIS.Thing; secondBook: number; stock: number; debtors: number; creditors: number; bank: number };
  caps: number[];
  R: number;
  made: RET.Change[];
  V: number;
  profits: number[];
  n: number;
  G: number;
  after: number[];
  b: DIS.Books;
  day: string;
}

const keptChangeWindUp = keepFor<ChangeWindUp>();

function changeThenWindUp(rng: Rng): ChangeWindUp | null {
  const ch = rng.pick([...CPR.TWO, ...CPR.THREE.filter((c) => c.L <= 30)]);
  const n = ch.old.length;
  const names = P.partners(rng, n);
  const y = rng.pick([2024, 2025, 2026]);
  const main = rng.pick([DIS.TANGIBLE[1], DIS.TANGIBLE[3]]);
  const made = RET.changesOf(rng, ch.so * 500, 2, [KIND_OF[main.id], 'stock', 'debtors', 'creditors']);
  if (!made) return null;
  const V = sum(made.map((c) => c.sign * c.amount));
  if (V === 0) return null;
  const change = (kind: RET.ChangeKind): RET.Change | undefined => made.find((c) => c.kind === kind);
  const moved = (kind: RET.ChangeKind): number => (change(kind)?.sign ?? 0) * (change(kind)?.amount ?? 0);
  const R = RET.mult(rng, ch.so * 1000, 20000, 120000);
  if (R === null) return null;
  const bs = {
    main,
    mainBook: change(KIND_OF[main.id])?.book ?? rng.step(main.id === 'building' ? 300000 : 200000, main.id === 'building' ? 800000 : 500000, 50000),
    second: rng.pick([DIS.TANGIBLE[2], DIS.TANGIBLE[5], DIS.TANGIBLE[6]]),
    secondBook: rng.step(20000, 80000, 5000),
    stock: change('stock')?.book ?? rng.step(120000, 320000, 10000),
    debtors: change('debtors')?.book ?? rng.step(80000, 300000, 10000),
    creditors: change('creditors')?.book ?? rng.step(90000, 240000, 10000),
    bank: rng.step(40000, 150000, 10000),
  };
  const capitalTotal = bs.mainBook + bs.secondBook + bs.stock + bs.debtors + bs.bank - bs.creditors - R;
  const w = names.map(() => rng.int(3, 6));
  const caps = w.map((x) => Math.floor((capitalTotal * x) / sum(w) / 10000) * 10000);
  caps[n - 1] = capitalTotal - sum(caps.slice(0, -1));
  if (caps.some((c) => c < 80000)) return null;
  // Goodwill on the profits of three years, the average from a tenth to a third of the capital the firm employs; a
  // multiple of a hundred times the denominator of the change, so that every amount moved is a whole hundred.
  const valued = profitsFor(rng, 100 * ch.L, 60000, 600000, [2, 3, 4], [0.1 * capitalTotal, capitalTotal / 3]);
  if (valued === null) return null;
  const { profits, n: yp, G } = valued;
  const after = caps.map((c, i) => c + ((R + V) * ch.old[i]) / ch.so + (G * ch.d[i]) / ch.L);
  if (after.some((x) => x < 40000)) return null;
  const day = rng.pick([`30 June ${y}`, `31 August ${y}`, `30 September ${y}`]);
  const f: DIS.Firm = { names, ratio: ch.neu, sum: ch.sn, date: day, intro: '' };
  const b = windUpFrom(
    rng,
    {
      f,
      capitals: after,
      bank: bs.bank,
      main: { t: main, book: bs.mainBook + moved(KIND_OF[main.id]) },
      stock: bs.stock + moved('stock'),
      debtors: bs.debtors,
      provision: change('debtors')?.amount ?? 0,
      second: { t: bs.second, book: bs.secondBook },
      creditors: bs.creditors - (change('creditors')?.amount ?? 0),
      outstanding: 0,
      loan: null,
    },
    { stock: ['sold', 'taken'], second: ['partner', 'partner', 'sold', 'silent'], expenses: ['partnerPays', 'feePersonal', 'feeFirmPays', 'borneFirmPays', 'firm'] },
  );
  if (!b) return null;
  return { names, ch, firm: FIRM_OF(rng), y, bs, caps, R, made, V, profits, n: yp, G, after, b, day };
}

const chainChangeDissolution = caseTemplate<ChangeWindUp>({
  id: 'case-life-chain-change-dissolution',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'A new ratio, then the firm is wound up',
  setup: (rng) =>
    attempt(12, () => {
      const s = changeThenWindUp(rng);
      return s && DIS.realisationAccount(s.b) && DIS.capitalAccounts(s.b, 6) ? s : null;
    }),
  context: (s) => {
    const { names, ch, y, bs } = s;
    const text = [
      `${list(names)} are partners in ${s.firm}. Until 31 March ${y} they shared profits and losses ${inRatio(ch.old)}; from 1 April ${y} they agreed to share them ${inRatio(ch.neu)}. Their capitals are fluctuating, goodwill is never raised in the books, and every receipt and payment is by cheque.`,
      ...oldSheet(list(names), `31 March ${y}`, [['Creditors', bs.creditors], ['General Reserve', s.R]], names.map((nm, i) => [nm, s.caps[i]]), [
        [bs.main.name, bs.mainBook],
        [bs.second.name, bs.secondBook],
        ['Stock', bs.stock],
        ['Debtors', bs.debtors],
        ['Bank', bs.bank],
      ]),
      'On the change it is agreed that:',
      ...s.made.map((c) => c.text),
      `The whole of the General Reserve is distributed. Goodwill is valued at ${s.n} years' purchase of the average profit of the last three years, ${s.profits.map(inr).join(', ')}, and adjusted through the capital accounts.`,
      `The partners could not agree how to run the business, and the firm was dissolved on ${s.day}. The profit of the months in between was shared and withdrawn in full, so every balance in the books was still as it stood just after the change of ratio.`,
      'On dissolution:',
      ...windUpLines(s.b, [PAID_OFF]),
    ].join('\n');
    keptChangeWindUp.keep(text, s);
    return text;
  },
  parts: [
    {
      kind: 'account',
      make: (s) => {
        const { names, ch } = s;
        const day = `1 April ${s.y}`;
        const profit = s.V > 0;
        const ids = names.map(partnerCapital);
        const inOld = (v: number): number[] => ch.old.map((t) => (v * t) / ch.so);
        const lines: JournalLine[][] = [
          profit ? [dr('revaluation', s.V), ...inOld(s.V).map((x, i) => cr(ids[i], x))] : [...inOld(-s.V).map((x, i) => dr(ids[i], x)), cr('revaluation', -s.V)],
          [dr('generalReserve', s.R), ...inOld(s.R).map((x, i) => cr(ids[i], x))],
          CPR.compensation(ch, names, s.G, false),
        ];
        const view = columnarAccount(
          lines.map((l) => ({ date: day, lines: l })),
          ids,
          { date: day, balances: s.caps.map((c) => ({ side: 'Cr' as const, amount: rupees(c) })) },
          (id) => (id === 'revaluation' ? ADM.revaluationRow(profit) : ledgerLabel(id)),
        );
        if (view.balances.some((b) => b === null || b.side !== 'Cr')) return null;
        const sides = columnarSides(view, { closeOn: day });
        return {
          task: `Prepare the partners' capital accounts in columns on the change of ratio on ${day}, and carry the balances down.`,
          title: "Partners' Capital Accounts",
          columns: partnerColumns(names),
          left: { ...sides.left, rows: ADM.plainRevaluation(sides.left.rows) },
          right: { ...sides.right, rows: ADM.plainRevaluation(sides.right.rows) },
          distractors: [ADM.revaluationRow(!profit), 'Goodwill A/c', 'Premium for Goodwill A/c', 'Realisation A/c', 'Current A/c'],
          explanation: [
            'Each partner has a column; the capitals open the credit side ("By Balance b/d").',
            `Revaluation: ${s.made.map((c) => `${c.work} (${c.sign > 0 ? 'a gain' : 'a loss'})`).join('; ')}; a ${profit ? 'profit' : 'loss'} of ${inr(Math.abs(s.V))}, shared in the old ratio ${rt(ch.old)}: ${eachAnd(names, inOld(Math.abs(s.V)))} ("${profit ? 'By' : 'To'} ${ADM.revaluationRow(profit)}"; "Revaluation A/c" is accepted too).`,
            `The whole of the General Reserve, ${inr(s.R)}, in the old ratio: ${eachAnd(names, inOld(s.R))} ("By General Reserve A/c").`,
            `Average profit = (${s.profits.map(inr).join(' + ')}) / 3 = ${inr(s.G / s.n)}; goodwill = ${inr(s.G)}.`,
            ...CPR.movesText(ch, names),
            `The partner who gains is debited with goodwill x share gained, "To" the sacrificing partner's Capital A/c; the partner who sacrifices is credited, "By" the gaining partner's Capital A/c.`,
            `Balances carried down: ${each(names, s.after)}.`,
          ],
          hints: CPR.H.capitals,
        };
      },
      verify: (q: AccountQuestion) => {
        const s = keptChangeWindUp.of(q.data);
        if (!s) return false;
        const V = -(post(s.made.map(RET.changeLines)).get('revaluation') ?? 0) / 100;
        const old = shares(s.ch.old);
        const neu = shares(s.ch.neu);
        const closing = q.sides[0].rows.find((r) => r.closing)?.amounts ?? [];
        return s.names.every((_, i) => near((closing[i] ?? 0) / 100, s.caps[i] + (V + s.R) * old[i] + s.G * (old[i] - neu[i])));
      },
    },
    {
      kind: 'account',
      make: (s) => {
        const sides = DIS.realisationAccount(s.b);
        return (
          sides && {
            task: `Prepare Realisation A/c of the firm on its dissolution on ${s.day}, from the values in the books after the change of ratio. ${DIS.REALISATION_TASK}`,
            title: 'Realisation A/c',
            ...sides,
            distractors: DIS.realisationSlips(s.b),
            explanation: [`The assets and the creditors stand at their values after the revaluation: ${s.made.map((c) => c.work).join('; ')}. The result is shared in the new ratio, ${rt(s.ch.neu)}.`, ...DIS.realisationNotes(s.b)],
            hints: DIS.FORMAT_HINTS.realisation,
          }
        );
      },
      verify: (q: AccountQuestion) => {
        const s = keptChangeWindUp.of(q.data);
        return s !== undefined && DIS.realisationHoldsFor(s.b, q);
      },
    },
    {
      kind: 'account',
      make: (s) => {
        const sides = DIS.capitalAccounts(s.b, 6);
        return (
          sides && {
            task: "Starting from the capitals carried down on the change of ratio and the profit or loss of Realisation A/c, prepare the partners' capital accounts in columns to close the books of the firm. Enter each item as a row of its own.",
            title: "Partners' Capital Accounts",
            columns: partnerColumns(s.names),
            ...sides,
            distractors: DIS.capitalSlips(s.b),
            explanation: DIS.capitalWorking(s.b, false),
            hints: DIS.FORMAT_HINTS.capitals,
          }
        );
      },
      verify: (q: AccountQuestion) => {
        const s = keptChangeWindUp.of(q.data);
        return s !== undefined && DIS.capitalsHoldFor(s.b, q, false);
      },
    },
  ],
});

const cases: CaseTemplate[] = [yearThenAdmission, changeThenAdmission, yearThenRetirement, deathInYear, superTwice, admitThenDissolve, guaranteeOnAdmission, changeThenRetirement, fixedAdmission, retireNewRatio, yearThenDissolution, retirementThenAdmission, loanInterestOmitted, changeThenDissolution, admitReserves, singleEntryThenAdmission, chainYearAdmission, chainFixedAdmission, chainAdmissionDissolution, chainRetirementDissolution, chainYearDissolution, chainDeath, chainChangeYear, chainYearRetirementLoan, chainAdmissionGuarantee, chainChangeDissolution];

export default cases;
