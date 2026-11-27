/**
 * Case studies of the stage "A firm that changes its partners" (Class 12): goodwill, a change in the ratio, the
 * admission, the retirement and the death of a partner, each as one firm and one story.
 *
 * Every case is made from the examined banks of the topics it draws on, with their conventions and wording: the
 * deals of an admission, the sacrifice and the premium (`templates/admission-of-a-partner.ts`), the change of ratio,
 * its reserves, revaluation items and goodwill entry (`templates/change-in-profit-sharing-ratio.ts`), and the firm of a
 * retirement or a death, its gaining ratio, its steps and its changes on revaluation
 * (`templates/retirement-and-death-of-a-partner.ts`). Their helpers are imported, not written again.
 *
 * Conventions, each stated in the case text that relies on it:
 *  - goodwill follows AS 26: only purchased goodwill is recorded; goodwill already in the books is written off in the
 *    old ratio first; a premium brought in is shared by the sacrificing partners in the sacrificing ratio; on a
 *    retirement or a death the partners who gain compensate the partner who leaves in the gaining ratio;
 *  - reserves, accumulated profits and losses and the result of revaluation belong to the partners of the old firm in
 *    the old ratio, and a case that distributes a reserve says "the whole of" it;
 *  - every case says whether the capitals are fixed or fluctuating; capitals made proportionate through current
 *    accounts are not called fluctuating;
 *  - a Workmen Compensation Reserve first meets the claim and an Investment Fluctuation Reserve the fall in the
 *    investments: what is left goes to the partners in the old ratio, and a shortfall is a loss on revaluation;
 *  - in a Revaluation A/c the result is "To Profit transferred to Asha's Capital A/c" / "By Loss transferred to Asha's
 *    Capital A/c", a row for each partner, with "Asha's Capital A/c" accepted too; in the capital accounts it is
 *    "By Revaluation A/c (profit)" / "To Revaluation A/c (loss)", with "Revaluation A/c" accepted too; interest on a
 *    loan or on what is owed to an executor is "Interest on Loan A/c", with "Interest A/c" accepted too.
 *
 * Every part has a `verify` that reads the figures back from the printed case text and works the answer out again by
 * plain arithmetic, where the part built it from the entries of the scenario.
 */
import type { AccountQuestion, FormatRow, JournalQuestion, JournalSetQuestion, McqQuestion, NumericQuestion, RatioQuestion } from '@/content/types';
import { executor, partnerCapital, partnerCurrent, partnerDrawings, partnerLoan } from '@/engine/accounts';
import { accountOf, balanceOf, columnLabel, columnarAccount, ledgerLabel, post, type DatedEntry, type Ledger } from '@/engine/books';
import type { JournalLine } from '@/engine/journal';
import type { Rng } from '@/engine/rng';
import { caseTemplate, columnarSides, formatINR, ledgerPeriods, ledgerSides, lowestTerms, partnerColumns, rupees, setHolds } from '../authoring';
import * as ADM from '../templates/admission-of-a-partner';
import * as CPR from '../templates/change-in-profit-sharing-ratio';
import * as RET from '../templates/retirement-and-death-of-a-partner';
import type { AccountSideParts, CaseTemplate, FormatRowParts } from '../types';

const TOPIC = 'retirement-and-death-of-a-partner';
const CONCEPT = 'ret-case';

/** Whole rupees as the amount text a learner sees. */
const inr = (n: number): string => formatINR(rupees(n));
const dr = (accountId: string, n: number): JournalLine => ({ accountId, side: 'Dr', amount: rupees(n) });
const cr = (accountId: string, n: number): JournalLine => ({ accountId, side: 'Cr', amount: rupees(n) });
const sum = RET.sum;
const near = RET.near;
const amountsIn = RET.amountsIn;
const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b;
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five'];
/** The accounting year that ends on 31 March `end`, as it is named: "2024-25". */
const fy = (end: number): string => `${end - 1}-${String(end % 100).padStart(2, '0')}`;
/** The text of the right option of a choice question. */
const optionText = (q: McqQuestion): string => q.options.find((o) => o.id === q.correct)?.text ?? '';
/** Rupees an entry puts on one side of an account. */
const posted = (q: JournalQuestion, accountId: string, side: 'Dr' | 'Cr'): number => sum(q.expected.filter((l) => l.accountId === accountId && l.side === side).map((l) => l.amount)) / 100;
/** The line of a case text that matches, or ''. */
const lineOf = (text: string, re: RegExp): string => text.split('\n').find((l) => re.test(l)) ?? '';
/** The amount after a label in a case text ("General Reserve: ₹60,000"), or 0 when there is none. */
const amountAfter = (text: string, re: RegExp): number => {
  const m = re.exec(text);
  return m ? amountsIn(m[0])[0] ?? 0 : 0;
};
/** True when two ratios stand in the same proportion, term by term. */
const sameRatio = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((t, i) => near(t / sum(a), b[i] / sum(b)));

// ===============================================================================================================
// 1. Goodwill valued from the profits, and the premium a new partner brings for it (medium)
// ===============================================================================================================

/** A goodwill valued from the profits of a firm: the method, the figures the case prints and the value. */
interface Valuation {
  method: 'average' | 'super';
  /** Years' purchase: 2, 3, 1.5 ... */
  n: number;
  /** The years printed (by the year in which each ends) and their profits as printed. */
  years: number[];
  profits: number[];
  /** An abnormal loss charged in the profit of one printed year (its index), to be added back. */
  abnormal: { at: number; loss: number } | null;
  /** The super profit method: the capital employed, the normal rate, and whether the average is printed instead of the years. */
  ce: number;
  rate: number;
  direct: boolean;
  avg: number;
  normal: number;
  sp: number;
  G: number;
}

/** Profits of `k` years that average `avg`, each a whole thousand and believable beside the others; null when none fit. */
function profitsAveraging(rng: Rng, avg: number, k: number): number[] | null {
  for (let t = 0; t < 12; t++) {
    const lo = Math.ceil((avg * 0.65) / 10000) * 10000;
    const hi = Math.floor((avg * 1.35) / 10000) * 10000;
    if (hi < lo) return null;
    const others = Array.from({ length: k - 1 }, () => rng.step(lo, hi, 10000));
    const last = avg * k - sum(others);
    if (last >= avg * 0.6 && last <= avg * 1.4 && last % 1000 === 0) return rng.shuffle([...others, last]);
  }
  return null;
}

/**
 * A goodwill of which `G x f` is a whole hundred of rupees for every fraction `f` given (each partner's part of the
 * premium), valued by the method drawn. The value is built from the average (or super) profit, so that the profits,
 * the capital employed and the rate are the round figures a paper prints.
 */
function valuation(rng: Rng, end: number, fracs: readonly ADM.Frac[]): Valuation | null {
  const D = fracs.reduce((l, f) => lcm(l, f[1]), 1);
  const method = rng.pick(['average', 'average', 'super'] as const);
  const n = rng.pick([2, 3, 4, 1.5, 2.5]);
  const k = rng.pick([3, 4]);
  const years = Array.from({ length: k }, (_, i) => end - k + 1 + i);
  /** A value from `lo` to `hi` in steps of `step` whose `n` years' purchase passes the test of the fractions, the rounder first. */
  const fitting = (lo: number, hi: number, step: number): number | null => {
    for (const unit of [1000, 500, 100]) {
      const all: number[] = [];
      for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) if (Number.isInteger(v * n) && (v * n) % (D * unit) === 0) all.push(v);
      if (all.length > 0) return rng.pick(all);
    }
    return null;
  };
  if (method === 'average') {
    const avg = fitting(60000, 300000, 1000);
    if (avg === null) return null;
    const normal = profitsAveraging(rng, avg, k);
    if (!normal) return null;
    const abnormal = rng.int(0, 2) === 0 ? { at: rng.int(0, k - 1), loss: rng.step(10000, 40000, 5000) } : null;
    const profits = normal.map((p, i) => (abnormal && i === abnormal.at ? p - abnormal.loss : p));
    if (profits.some((p) => p <= 0)) return null;
    return { method, n, years, profits, abnormal, ce: 0, rate: 0, direct: false, avg, normal: 0, sp: 0, G: avg * n };
  }
  const rate = rng.pick([10, 12, 15, 20]);
  const ce = rng.step(400000, 1500000, 50000);
  const normal = (ce * rate) / 100;
  const sp = fitting(15000, Math.min(1.5 * normal, 150000), 1000);
  if (sp === null) return null;
  const avg = normal + sp;
  const direct = rng.int(0, 1) === 0;
  const profits = direct ? [] : profitsAveraging(rng, avg, k);
  if (!profits) return null;
  return { method, n, years: direct ? [] : years, profits, abnormal: null, ce, rate, direct, avg, normal, sp, G: sp * n };
}

/** The lines of the case text that state the valuation. */
function valuationText(v: Valuation): string[] {
  const rows = v.years.map((y, i) => `${fy(y)}: ${inr(v.profits[i])}`);
  const k = WORDS[v.years.length];
  if (v.method === 'average') {
    return [
      `The goodwill of the firm is valued at ${v.n} years' purchase of the average profit of the last ${k} years, which were:`,
      ...rows,
      ...(v.abnormal ? [`The profit of ${fy(v.years[v.abnormal.at])} is after charging an abnormal loss of ${inr(v.abnormal.loss)} (goods destroyed by fire).`] : []),
    ];
  }
  const base = `The goodwill of the firm is valued at ${v.n} years' purchase of the super profit. The capital employed is ${inr(v.ce)} and the normal rate of return in this trade is ${v.rate}%.`;
  return v.direct ? [`${base} The average profit of the firm is ${inr(v.avg)} a year.`] : [`${base} The profits of the last ${k} years were:`, ...rows];
}

/** The goodwill a valuation text comes to, worked out again from its printed figures. */
function readValuation(text: string): number {
  const n = Number(/(\d+(?:\.\d+)?) years' purchase/.exec(text)?.[1]);
  const rows = [...text.matchAll(/^\d{4}-\d{2}: ₹([\d,]+)$/gm)].map((m) => Number(m[1].replace(/,/g, '')));
  const loss = amountAfter(text, /abnormal loss of ₹[\d,]+/);
  const avg = rows.length > 0 ? (sum(rows) + loss) / rows.length : amountAfter(text, /average profit of the firm is ₹[\d,]+/);
  if (!/super profit/.test(text)) return avg * n;
  const ce = amountAfter(text, /capital employed is ₹[\d,]+/);
  const rate = Number(/normal rate of return in this trade is (\d+)%/.exec(text)?.[1]);
  return (avg - (ce * rate) / 100) * n;
}

/** The working of a valuation, a step to a line. */
function valuationSteps(v: Valuation): string[] {
  const k = v.years.length;
  const total = sum(v.profits);
  if (v.method === 'average') {
    const normalTotal = total + (v.abnormal?.loss ?? 0);
    return [
      ...(v.abnormal ? [`The abnormal loss of ${inr(v.abnormal.loss)} will not recur, so it is added back to the profit of ${fy(v.years[v.abnormal.at])}.`] : []),
      `Total profit = ${v.profits.map(inr).join(' + ')}${v.abnormal ? ` + ${inr(v.abnormal.loss)}` : ''} = ${inr(normalTotal)}.`,
      `Average profit = ${inr(normalTotal)} / ${k} = ${inr(v.avg)}.`,
      `Goodwill = ${inr(v.avg)} x ${v.n} = ${inr(v.G)}.`,
    ];
  }
  return [
    ...(v.direct ? [] : [`Average profit = (${v.profits.map(inr).join(' + ')}) / ${k} = ${inr(total)} / ${k} = ${inr(v.avg)}.`]),
    `Normal profit = ${inr(v.ce)} x ${v.rate} / 100 = ${inr(v.normal)}.`,
    `Super profit = ${inr(v.avg)} - ${inr(v.normal)} = ${inr(v.sp)}.`,
    `Goodwill = ${inr(v.sp)} x ${v.n} = ${inr(v.G)}.`,
  ];
}

const VALUATION_HINTS = [
  'Average profit = total of the profits / number of years; an abnormal loss that will not recur is added back first.',
  "Goodwill = average profit x years' purchase; by the super profit method, (average profit - capital employed x normal rate / 100) x years' purchase.",
];

interface Premium {
  d: ADM.Deal;
  fixed: boolean;
  v: Valuation;
  capital: number;
  premium: number;
  credits: number[];
  mode: { id: string; by: string; name: string };
}

const goodwillPremium = caseTemplate<Premium>({
  id: 'case-recon-goodwill-premium',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Goodwill valued, and the premium for it',
  setup: (rng) =>
    RET.attempt(4, () => {
      // A deal in which every old partner gives up a part of the share, so that there is a sacrificing ratio to ask.
      const d = ADM.dealWhere(rng, ['old', 'equal', 'stated', 'stated', 'surrender'], (x) => x.sac !== null && ADM.tidySac(x) && !(x.kind === 'old' && x.old.every((t) => t === x.old[0])), rng.pick([2, 2, 3]));
      if (!d) return null;
      const v = valuation(rng, d.year, [d.share, ...d.given]);
      if (!v) return null;
      const premium = ADM.of(v.G, d.share);
      const credits = d.given.map((g) => ADM.of(v.G, g));
      if (premium < 10000 || ![premium, ...credits].every(Number.isInteger)) return null;
      const capital = Math.max(rng.step(100000, 500000, 20000), Math.ceil((premium * 2) / 20000) * 20000);
      return { d, fixed: rng.int(0, 3) === 0, v, capital, premium, credits, mode: rng.pick([{ id: 'bank', by: 'by cheque', name: 'Bank' }, { id: 'cash', by: 'in cash', name: 'Cash' }]) };
    }),
  context: (s) =>
    [
      `${s.d.open} ${s.d.admit} ${s.d.how}`,
      `${ADM.setCaps(s.fixed)} No goodwill account is to be raised in the books.`,
      `${s.d.nw} brings ${inr(s.capital)} as capital and ${s.d.nw}'s share of the goodwill of the firm as premium, ${s.mode.by}; the premium is credited to Premium for Goodwill A/c when it is received.`,
      ...valuationText(s.v),
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { v } = s;
        const k = v.years.length;
        const errs: [number, string][] =
          v.method === 'average'
            ? [
                [v.avg, "Stopped at the average profit and did not multiply by the number of years' purchase."],
                [v.avg * k, `Multiplied by ${k}, the number of years averaged, instead of by ${v.n}, the number of years' purchase.`],
                [v.avg * k * v.n, 'Multiplied the total profit of all the years, not the average profit.'],
                ...(v.abnormal ? [[(v.avg - v.abnormal.loss / k) * v.n, 'Took the profits as printed: the abnormal loss will not recur and is added back first.'] as [number, string]] : []),
              ]
            : [
                [v.avg * v.n, 'Multiplied the whole average profit; under the super profit method only the profit above the normal is multiplied.'],
                [v.sp, "Stopped at the super profit and did not multiply by the number of years' purchase."],
                [v.normal * v.n, 'Multiplied the normal profit instead of the super profit.'],
                ...(v.direct ? [] : [[(sum(v.profits) - v.normal) * v.n, 'Deducted the normal profit from the total profit of all the years instead of from the average profit.'] as [number, string]]),
              ];
        const r = RET.numeric(v.G, errs);
        return r && { prompt: 'What is the value of the goodwill of the firm?', ...r, explanation: valuationSteps(v), hints: VALUATION_HINTS };
      },
      verify: (q: NumericQuestion) => near(q.answer / 100, readValuation(q.context ?? '')),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { d, v } = s;
        const [k, n] = d.share;
        const r = RET.numeric(s.premium, [
          [v.G, `Took the whole goodwill of the firm. ${d.nw} pays only for the ${ADM.fs(d.share)} share acquired.`],
          [ADM.of(v.G, ADM.minus(ADM.ONE, d.share)), `Took the old partners' ${ADM.fs(ADM.minus(ADM.ONE, d.share))} of the goodwill instead of ${d.nw}'s ${ADM.fs(d.share)}.`],
          [ADM.of(v.G / v.n, d.share), `Took ${d.nw}'s share of one year's ${v.method === 'average' ? 'average' : 'super'} profit and left out the ${v.n} years' purchase.`],
          ...(k > 1 ? [[v.G / n, 'Divided the goodwill by the denominator of the share but left out its numerator.'] as [number, string]] : []),
        ]);
        return (
          r && {
            prompt: `How much does ${d.nw} bring as premium for goodwill?`,
            ...r,
            explanation: [`Goodwill of the firm = ${inr(v.G)} (worked out from the profits as the case says).`, `Premium = goodwill of the firm x ${d.nw}'s share = ${inr(v.G)} x ${ADM.fs(d.share)} = ${inr(s.premium)}.`],
            hints: ADM.H.premium,
          }
        );
      },
      verify: (q: NumericQuestion) => {
        const text = q.context ?? '';
        const d = ADM.readDeal(text.split('\n')[0]);
        return d !== null && near(q.answer / 100, readValuation(text) * d.share);
      },
    },
    {
      kind: 'numeric',
      unit: 'ratio',
      make: (s) => {
        const { d } = s;
        const m = d.olds.length;
        const r = RET.ratioParts(d.sac!, [
          [d.old, `Took the old ratio ${ADM.rs(d.old)}. The premium goes in the ratio of what each old partner gives up.`],
          [d.newRatio.slice(0, m), `Took the new ratio of the old partners. What matters is what each one gives up, not what each keeps.`],
          [[...d.sac!].reverse(), 'Wrote the sacrificing ratio the wrong way round.'],
          [d.olds.map(() => 1), 'Took the share as given up equally.'],
        ]);
        return (
          r && {
            prompt: `Find the sacrificing ratio of ${RET.list(d.olds)}.`,
            ...r,
            explanation: [...ADM.givesSteps(d), ADM.sacStep(d)],
            hints: ADM.H.sacrifice,
          }
        );
      },
      verify: (q: RatioQuestion) => {
        const d = ADM.readDeal((q.context ?? '').split('\n')[0]);
        return d !== null && sameRatio(q.answer, d.given);
      },
    },
    {
      kind: 'journal',
      make: (s) => {
        const { d } = s;
        const own = ADM.ownAccount(s.fixed);
        const givers = ADM.giversOf(d);
        return {
          prompt: 'Pass the journal entry that transfers the premium from Premium for Goodwill A/c to the old partners.',
          lines: ADM.entry(dr('premiumForGoodwill', s.premium), ...d.olds.map((name, i) => cr(own(name), s.credits[i]))),
          explanation: [
            `Premium = ${inr(s.premium)}, credited to Premium for Goodwill A/c when it came in.`,
            ADM.sacStep(d),
            `Premium for Goodwill A/c is debited with ${inr(s.premium)} to close it, and the ${ADM.ownName(s.fixed)} A/c${givers.length > 1 ? 's' : ''} of the old partners are credited in the sacrificing ratio: ${ADM.eachGets(d.olds, s.credits)}.`,
            `${d.nw} gets none of it: a premium is paid to those who give up a share of profit. No Goodwill A/c is raised (AS 26).`,
          ],
          hints: ADM.H.premium,
          distractorAccounts: ['goodwill', own(d.nw), ADM.ownAccount(!s.fixed)(d.olds[0]), 'revaluation'],
        };
      },
      verify: (q: JournalQuestion) => {
        const text = q.context ?? '';
        const d = ADM.readDeal(text.split('\n')[0]);
        if (!d) return false;
        const premium = readValuation(text) * d.share;
        const own = ADM.ownAccount(ADM.isFixed(text));
        return near(posted(q, 'premiumForGoodwill', 'Dr'), premium) && d.olds.every((name, i) => near(posted(q, own(name), 'Cr'), (premium * d.given[i]) / d.share));
      },
    },
  ],
});

// ===============================================================================================================
// 2. A change in the ratio: the sacrifice or gain, the goodwill entry and the reserve (medium)
// ===============================================================================================================

interface ChangeCase {
  ch: CPR.Change;
  f: CPR.Firm;
  fixed: boolean;
  G: number;
  item: CPR.Held;
  R: number;
  /** The two partners who move the same way (two who sacrifice, or two who gain), and the one who moves the other way. */
  pair: number[];
  single: number;
  pairSacrifice: boolean;
}

/** The sentence of the case text that states the balance and what is done with it. */
const balanceSays = (item: CPR.Held, R: number, year: number): string =>
  item.id === 'generalReserve'
    ? `The Balance Sheet on 31 March ${year} shows a General Reserve of ${inr(R)}; the whole of it is to be distributed before the new ratio takes effect.`
    : item.credit
      ? `The Balance Sheet on 31 March ${year} shows a credit balance of ${inr(R)} in Profit and Loss A/c; the whole of it is to be distributed before the new ratio takes effect.`
      : `The Balance Sheet on 31 March ${year} shows a debit balance of ${inr(R)} in Profit and Loss A/c; the whole of it is to be written off before the new ratio takes effect.`;

const changeOfRatio = caseTemplate<ChangeCase>({
  id: 'case-recon-change-ratio',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'A new ratio among the same partners',
  setup: (rng) => {
    // Two partners move the same way and the third the other way, so that the two have a ratio of their own.
    const pairSacrifice = rng.int(0, 1) === 0;
    const ch = rng.pick((pairSacrifice ? CPR.TWO_SAC : CPR.TWO_GAIN).filter((c) => c.L <= 40));
    const f = CPR.firmOf(rng, ch.old, ch.neu);
    const G = CPR.pickAmount(rng, 60000, 600000, (v) => CPR.fairMove(v, ch));
    const item = rng.pick([CPR.HELD[0], CPR.HELD[0], CPR.HELD[0], CPR.HELD[1], CPR.HELD[2]]);
    const R = CPR.pickAmount(rng, 30000, 300000, (v) => CPR.fairIn(v, ch.old));
    if (G === null || R === null) return null;
    const pair = pairSacrifice ? ch.sac : ch.gain;
    const single = (pairSacrifice ? ch.gain : ch.sac)[0];
    return { ch, f, fixed: rng.int(0, 3) === 0, G, item, R, pair, single, pairSacrifice };
  },
  context: (s) =>
    [
      `${s.f.intro} ${s.f.change} ${CPR.capitalsLine(s.fixed)}`,
      `On that date the goodwill of the firm is valued at ${inr(s.G)}. No Goodwill A/c is to be opened: a partner who gains compensates a partner who sacrifices, through the partners' ${s.fixed ? 'current' : 'capital'} accounts.`,
      balanceSays(s.item, s.R, s.f.year),
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'ratio',
      make: (s) => {
        const { ch, f, pair } = s;
        const [i, j] = pair;
        const word = s.pairSacrifice ? 'sacrificing' : 'gaining';
        const r = RET.ratioParts([Math.abs(ch.d[i]), Math.abs(ch.d[j])], [
          [[ch.old[i], ch.old[j]], `Took the old ratio of ${f.names[i]} and ${f.names[j]}. The ${word} ratio is what each ${s.pairSacrifice ? 'gives up' : 'gains'}, old share against new.`],
          [[ch.neu[i], ch.neu[j]], `Took the new ratio of ${f.names[i]} and ${f.names[j]}. The ${word} ratio is what each ${s.pairSacrifice ? 'gives up' : 'gains'}, old share against new.`],
          [[Math.abs(ch.d[j]), Math.abs(ch.d[i])], `Wrote the ${word} ratio the wrong way round.`],
          [[1, 1], `Took the ${s.pairSacrifice ? 'sacrifice' : 'gain'} as equal between the two.`],
        ]);
        return (
          r && {
            prompt: `Two of the partners ${s.pairSacrifice ? 'sacrifice' : 'gain'} on the change. Find the ${word} ratio of ${f.names[i]} and ${f.names[j]}.`,
            ...r,
            explanation: [...CPR.movesText(ch, f.names), `${upperFirst(word)} ratio of ${f.names[i]} and ${f.names[j]} = ${CPR.frac(Math.abs(ch.d[i]), ch.L)} : ${CPR.frac(Math.abs(ch.d[j]), ch.L)} = ${lowestTerms([Math.abs(ch.d[i]), Math.abs(ch.d[j])]).join(':')}.`],
            hints: CPR.H.ratio,
          }
        );
      },
      verify: (q: RatioQuestion) => {
        const g = CPR.given(q.context ?? '');
        const m = /ratio of ([A-Z][a-z]+) and ([A-Z][a-z]+)\.$/.exec(q.prompt);
        if (!m) return false;
        const [i, j] = [g.names.indexOf(m[1]), g.names.indexOf(m[2])];
        return i >= 0 && j >= 0 && sameRatio(q.answer, [Math.abs(g.give[i]), Math.abs(g.give[j])]) && Math.sign(g.give[i]) === Math.sign(g.give[j]);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { ch, f, G } = s;
        const i = s.single;
        const name = f.names[i];
        const amount = CPR.moved(G, ch, i);
        const debit = ch.d[i] < 0;
        const r = RET.numeric(amount, [
          [CPR.part(G, ch.neu, i), `Took ${name}'s new share of goodwill. Only the share that moves is paid for: new share less old share.`],
          [CPR.part(G, ch.old, i), `Took ${name}'s old share of goodwill instead of the share that moves.`],
          [CPR.moved(G, ch, s.pair[0]), `Took the share that ${f.names[s.pair[0]]} ${s.pairSacrifice ? 'gives up' : 'gains'}, not ${name}'s.`],
          [G, 'Took the whole goodwill of the firm.'],
        ]);
        return (
          r && {
            prompt: `By how much is ${CPR.acctName(name, s.fixed)} ${debit ? 'debited' : 'credited'} in the entry for goodwill?`,
            ...r,
            explanation: [CPR.moveText(ch, i, name), `${name}: ${inr(G)} x ${CPR.frac(Math.abs(ch.d[i]), ch.L)} = ${inr(amount)}, ${debit ? 'debited: a partner who gains pays for the share gained' : 'credited: a partner who sacrifices is compensated'}.`],
            hints: CPR.H.goodwill,
          }
        );
      },
      verify: (q: NumericQuestion) => {
        const g = CPR.given(q.context ?? '');
        const name = /^By how much is ([A-Z][a-z]+)'s/.exec(q.prompt)?.[1] ?? '';
        const i = g.names.indexOf(name);
        const G = amountAfter(q.context ?? '', /goodwill of the firm is valued at ₹[\d,]+/);
        return i >= 0 && near(q.answer / 100, G * Math.abs(g.give[i])) && /debited/.test(q.prompt) === g.give[i] < 0;
      },
    },
    {
      kind: 'journal',
      make: (s) => {
        const item = CPR.goodwillItem(s.ch, s.f.names, s.G, s.fixed);
        return {
          prompt: 'Pass the journal entry for the treatment of goodwill on the change.',
          lines: item.lines,
          explanation: item.explanation,
          hints: CPR.H.goodwill,
          distractorAccounts: ['goodwill', 'premiumForGoodwill', CPR.acct(s.f.names[s.single], !s.fixed), 'revaluation'],
        };
      },
      verify: (q: JournalQuestion) => {
        const text = q.context ?? '';
        const g = CPR.given(text);
        const fixed = /capitals are fixed/.test(text);
        const G = amountAfter(text, /goodwill of the firm is valued at ₹[\d,]+/);
        return g.names.every((name, i) => near(posted(q, CPR.acct(name, fixed), 'Cr') - posted(q, CPR.acct(name, fixed), 'Dr'), G * g.give[i])) && posted(q, 'goodwill', 'Dr') === 0;
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const { ch, item } = s;
        const old = ch.old.join(':');
        const neu = ch.neu.join(':');
        const own = s.fixed ? 'current' : 'capital';
        const verb = item.credit ? 'Credited' : 'Debited';
        const what = item.id === 'generalReserve' ? 'the General Reserve' : `the ${item.credit ? 'credit' : 'debit'} balance of Profit and Loss A/c`;
        const sacRatio = s.pairSacrifice ? `in their sacrificing ratio ${lowestTerms(s.pair.map((i) => Math.abs(ch.d[i]))).join(':')}` : '';
        // Where the old shares are equal, sharing equally is sharing in the old ratio: that option would be right too.
        const equalOld = ch.old.every((t) => t === ch.old[0]);
        return RET.choice(
          `How is ${what} dealt with on the change?`,
          `${verb} to the partners' ${own} accounts in the old ratio ${old}`,
          [
            [`${verb} to the partners' ${own} accounts in the new ratio ${neu}`, `Used the new ratio. The balance was built up before the change, so it belongs to the partners in the old ratio.`],
            [
              s.pairSacrifice ? `${verb} to the ${own} accounts of the partners who sacrifice, ${sacRatio}` : `${verb} to the ${own} accounts of the partners who gain, in their gaining ratio`,
              'Shared it only among the partners whose share moves. Every partner of the old firm had a part in it, in the old ratio.',
            ],
            [
              item.credit ? 'Transferred to the credit of Revaluation A/c' : 'Transferred to the debit of Revaluation A/c',
              'Took it to Revaluation A/c, which is for changes in the values of assets and liabilities, not for balances already earned or lost.',
            ],
            ...(equalOld ? [] : [[`${verb} to the partners' ${own} accounts equally`, 'Shared it equally. Without an agreement to the contrary, it goes in the old profit-sharing ratio.'] as [string, string]]),
          ],
          `${item.what}. It arose while the old ratio was in force, so the whole of it is ${item.credit ? 'credited' : 'debited'} to the partners' ${own} accounts in the old ratio ${old}.`,
          CPR.H.reserves,
        );
      },
      verify: (q: McqQuestion) => {
        const g = CPR.given(q.context ?? '');
        const old = CPR.ratiosIn(q.context ?? '', g.names.length)[0];
        const credit = /General Reserve|credit balance/.test(lineOf(q.context ?? '', /^The Balance Sheet/));
        return optionText(q).startsWith(credit ? 'Credited' : 'Debited') && optionText(q).endsWith(`in the old ratio ${old.join(':')}`);
      },
    },
    {
      kind: 'journal',
      make: (s) => {
        const item = CPR.heldItem(s.item, s.R, s.ch, s.f.names, s.fixed);
        return {
          prompt: `Pass the journal entry that ${s.item.credit ? 'distributes' : 'writes off'} the balance named in the case.`,
          lines: item.lines,
          explanation: item.explanation,
          hints: CPR.H.reserves,
          distractorAccounts: ['revaluation', 'profitAndLossAppropriation', CPR.acct(s.f.names[0], !s.fixed), ...(s.item.id === 'generalReserve' ? ['profitAndLoss'] : ['generalReserve'])],
        };
      },
      verify: (q: JournalQuestion) => {
        const text = q.context ?? '';
        const g = CPR.given(text);
        const line = lineOf(text, /^The Balance Sheet/);
        const R = amountsIn(line)[0];
        const credit = /General Reserve|credit balance/.test(line);
        const fixed = /capitals are fixed/.test(text);
        return g.names.every((name, i) => near(posted(q, CPR.acct(name, fixed), credit ? 'Cr' : 'Dr'), R * g.old[i]));
      },
    },
  ],
});

const upperFirst = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// ===============================================================================================================
// 3. Hidden goodwill on an admission (medium)
// ===============================================================================================================

interface Hidden {
  d: ADM.Deal;
  caps: number[];
  /** The balance the old partners share before the admission: a General Reserve (above zero), a debit balance of Profit and Loss A/c (below zero), or none. */
  held: number;
  capital: number;
  firm: number;
  hidden: number;
  charged: number;
  credits: number[];
}

const hiddenGoodwill = caseTemplate<Hidden>({
  id: 'case-recon-hidden-goodwill',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Goodwill hidden in the capitals',
  setup: (rng) =>
    RET.attempt(4, () => {
      const d = ADM.dealWhere(
        rng,
        ['old', 'equal', 'stated', 'stated'],
        (x) => x.sac !== null && ADM.tidySac(x) && x.share[1] <= 10 && x.share[0] <= 3 && !(x.kind === 'old' && x.old.every((t) => t === x.old[0])),
        rng.pick([2, 2, 3]),
      );
      if (!d) return null;
      const [k, n] = d.share;
      const capital = k * 10000 * rng.int(Math.ceil(10 / k), Math.floor(40 / k));
      const firm = (capital * n) / k;
      // Every partner's part of the goodwill is a whole hundred of rupees, and the capitals and the reserve are whole
      // five thousands, so the goodwill (what is left of the capital the firm should have) is a multiple of both.
      const D = [d.share, ...d.given].reduce((l, f) => lcm(l, f[1]), 1);
      const unit = lcm(5000, D * 100);
      if (unit > 150000) return null;
      const hidden = unit * rng.int(Math.max(1, Math.ceil(30000 / unit)), Math.max(1, Math.floor(300000 / unit)));
      const kind = rng.pick(['none', 'reserve', 'reserve', 'loss'] as const);
      const oldUnit = lcm(sum(d.old) * 1000, 5000);
      const held = kind === 'none' ? 0 : (kind === 'reserve' ? 1 : -1) * oldUnit * rng.int(Math.max(1, Math.ceil(20000 / oldUnit)), Math.max(1, Math.floor(120000 / oldUnit)));
      const oldTotal = firm - capital - hidden - held;
      if (oldTotal < 100000 * d.olds.length || hidden > 0.35 * firm) return null;
      // Round capitals for the old partners that add up to what they have.
      const weights = d.olds.map(() => rng.int(3, 6));
      const caps = weights.map((w) => Math.round((oldTotal * w) / sum(weights) / 10000) * 10000);
      caps[caps.length - 1] = oldTotal - sum(caps.slice(0, -1));
      if (caps.some((c) => c < 60000)) return null;
      const charged = ADM.of(hidden, d.share);
      const credits = d.given.map((g) => ADM.of(hidden, g));
      if (![charged, ...credits].every(Number.isInteger)) return null;
      return { d, caps, held, capital, firm, hidden, charged, credits };
    }),
  context: (s) =>
    [
      `${s.d.open} ${s.d.admit} ${s.d.how}`,
      `The capital accounts are fluctuating. Before the admission the capitals stand at ${ADM.eachGets(s.d.olds, s.caps)}.`,
      ...(s.held > 0
        ? [`The Balance Sheet shows a General Reserve of ${inr(s.held)}; the whole of it is distributed among the old partners before the admission.`]
        : s.held < 0
          ? [`The Balance Sheet shows a debit balance of ${inr(-s.held)} in Profit and Loss A/c; the whole of it is written off to the old partners before the admission.`]
          : ['There is no reserve and no accumulated profit or loss in the books.']),
      `${s.d.nw} brings ${inr(s.capital)} as capital but nothing for goodwill. The goodwill of the firm is to be inferred from ${s.d.nw}'s capital, and ${s.d.nw}'s share of it is debited to ${s.d.nw}'s Capital A/c; no goodwill account is raised.`,
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { d } = s;
        const [k, n] = d.share;
        const r = RET.numeric(s.firm, [
          [ADM.of(s.capital, d.share), `Multiplied ${d.nw}'s capital by the share instead of dividing by it.`],
          [s.firm - s.capital, `Gave the capital that the old partners should have, not the capital of the whole firm.`],
          ...(k > 1 ? [[s.capital * n, 'Multiplied by the denominator of the share and did not divide by its numerator.'] as [number, string]] : []),
          [s.capital + sum(s.caps), 'Added up the capitals as they are, instead of working out what the new partner\'s capital stands for.'],
        ]);
        return (
          r && {
            prompt: `On the basis of ${d.nw}'s capital, what should the total capital of the new firm be?`,
            ...r,
            explanation: [`${d.nw}'s ${inr(s.capital)} is for ${ADM.fs(d.share)} of the firm, so the whole firm should have ${inr(s.capital)} x ${n}/${k} = ${inr(s.firm)}.`],
            hints: ADM.H.hidden,
          }
        );
      },
      verify: (q: NumericQuestion) => {
        const text = q.context ?? '';
        const d = ADM.readDeal(text.split('\n')[0]);
        const capital = amountAfter(text, /brings ₹[\d,]+ as capital/);
        return d !== null && near(q.answer / 100, capital / d.share);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { d } = s;
        const actual = sum(s.caps) + s.held + s.capital;
        const r = RET.numeric(s.hidden, [
          [s.firm - sum(s.caps) - s.held, `Left ${d.nw}'s own capital out of the capital actually in the new firm.`],
          ...(s.held !== 0 ? [[s.firm - sum(s.caps) - s.capital, s.held > 0 ? 'Left out the General Reserve, which is added to the old partners\' capitals before the admission.' : 'Left out the loss written off, which reduces the old partners\' capitals before the admission.'] as [number, string]] : []),
          [s.firm, 'Stopped at the capital the firm should have. Goodwill is what is left after the capital actually in the firm is deducted.'],
          [s.charged, `Gave ${d.nw}'s share of the goodwill; the question asks for the goodwill of the whole firm.`],
        ]);
        return (
          r && {
            prompt: 'What is the hidden goodwill of the firm?',
            ...r,
            explanation: [
              `The firm should have ${inr(s.firm)} of capital (on the basis of ${d.nw}'s capital).`,
              s.held === 0
                ? `Capital actually in the new firm = ${s.caps.map(inr).join(' + ')} + ${inr(s.capital)} = ${inr(actual)}.`
                : `Capital actually in the new firm = ${s.caps.map(inr).join(' + ')} ${s.held > 0 ? `+ ${inr(s.held)} (General Reserve)` : `- ${inr(-s.held)} (loss written off)`} + ${inr(s.capital)} = ${inr(actual)}.`,
              `Hidden goodwill = ${inr(s.firm)} - ${inr(actual)} = ${inr(s.hidden)}.`,
            ],
            hints: ADM.H.hidden,
          }
        );
      },
      verify: (q: NumericQuestion) => {
        const text = q.context ?? '';
        const d = ADM.readDeal(text.split('\n')[0]);
        if (!d) return false;
        const caps = amountsIn(lineOf(text, /capitals stand at/));
        const capital = amountAfter(text, /brings ₹[\d,]+ as capital/);
        const held = amountAfter(text, /General Reserve of ₹[\d,]+/) - amountAfter(text, /debit balance of ₹[\d,]+/);
        // Another way to the same figure: what the old partners' capital should be for their share, less what it is.
        return near(q.answer / 100, (capital / d.share) * (1 - d.share) - (sum(caps) + held));
      },
    },
    {
      kind: 'numeric',
      unit: 'ratio',
      make: (s) => {
        const { d } = s;
        const r = RET.ratioParts(d.sac!, [
          [d.old, `Took the old ratio ${ADM.rs(d.old)}. Goodwill is credited in the ratio of what each old partner gives up.`],
          [d.newRatio.slice(0, d.olds.length), 'Took the new ratio of the old partners. What matters is what each one gives up, not what each keeps.'],
          [[...d.sac!].reverse(), 'Wrote the sacrificing ratio the wrong way round.'],
          [d.olds.map(() => 1), 'Took the share as given up equally.'],
        ]);
        return r && { prompt: `In what ratio are ${RET.list(d.olds)} credited with ${d.nw}'s share of goodwill? Give the ratio of ${RET.list(d.olds)}.`, ...r, explanation: [...ADM.givesSteps(d), ADM.sacStep(d)], hints: ADM.H.sacrifice };
      },
      verify: (q: RatioQuestion) => {
        const d = ADM.readDeal((q.context ?? '').split('\n')[0]);
        return d !== null && sameRatio(q.answer, d.given);
      },
    },
    {
      kind: 'journal',
      make: (s) => {
        const { d } = s;
        return {
          prompt: `Pass the journal entry for ${d.nw}'s share of the hidden goodwill.`,
          lines: ADM.entry(dr(partnerCapital(d.nw), s.charged), ...d.olds.map((name, i) => cr(partnerCapital(name), s.credits[i]))),
          explanation: [
            `${d.nw}'s share of goodwill = ${inr(s.hidden)} x ${ADM.fs(d.share)} = ${inr(s.charged)}. Nothing is brought for it, so ${d.nw}'s Capital A/c is debited.`,
            ADM.sacStep(d),
            `The old partners' Capital A/cs are credited in the sacrificing ratio: ${ADM.eachGets(d.olds, s.credits)}. No Goodwill A/c is raised.`,
          ],
          hints: ADM.H.hidden,
          distractorAccounts: ['goodwill', 'premiumForGoodwill', partnerCurrent(d.nw), 'bank'],
        };
      },
      verify: (q: JournalQuestion) => {
        const text = q.context ?? '';
        const d = ADM.readDeal(text.split('\n')[0]);
        if (!d) return false;
        const caps = amountsIn(lineOf(text, /capitals stand at/));
        const capital = amountAfter(text, /brings ₹[\d,]+ as capital/);
        const held = amountAfter(text, /General Reserve of ₹[\d,]+/) - amountAfter(text, /debit balance of ₹[\d,]+/);
        const hidden = capital / d.share - (sum(caps) + held + capital);
        const nw = /^([A-Z][a-z]+) brings/.exec(lineOf(text, / brings ₹/))?.[1] ?? '';
        return near(posted(q, partnerCapital(nw), 'Dr'), hidden * d.share) && d.olds.every((name, i) => near(posted(q, partnerCapital(name), 'Cr'), hidden * d.given[i]));
      },
    },
  ],
});

// ===============================================================================================================
// 4. A retirement: the gaining ratio, goodwill and the amount due (medium)
// ===============================================================================================================

interface Retiring {
  f: RET.Firm;
  /** The opening sentence: the partners and their ratio. */
  opening: string;
  g: RET.Gain;
  K: number;
  R: number;
  V: number;
  G: number;
  E: number;
  s: number;
  gw: number[];
  due: number;
}

const RETIRE_ON = RET.RETIRE_ON;

const retirementDue = caseTemplate<Retiring>({
  id: 'case-recon-retirement-due',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'What a retiring partner is owed',
  setup: (rng) =>
    RET.attempt(6, () => {
      const f = RET.firm(rng);
      const g = RET.gainOf(rng, f, ['silent', 'split', 'split', 'agreed', 'agreed']);
      // Both continuing partners gain, so that there is a gaining ratio; equal old shares would leave nothing to tell apart.
      if (!g || g.w.some((v) => v <= 0) || f.stayOld[0] === f.stayOld[1]) return null;
      const unit = f.total * 1000;
      const G = RET.mult(rng, f.total * sum(g.w) * 1000, 60000, 720000);
      const R = RET.mult(rng, unit, 30000, 240000);
      const result = RET.mult(rng, unit, 10000, 90000);
      const E = rng.int(0, 2) === 0 ? RET.mult(rng, unit, 20000, 100000) : 0;
      if (G === null || R === null || result === null || E === null || E >= G) return null;
      const V = rng.int(0, 1) === 0 ? result : -result;
      const K = rng.step(150000, 600000, 10000);
      const { s, parts } = RET.goodwillParts(f, g, G);
      const part = (v: number): number => (v * f.x) / f.total;
      return { f, opening: RET.intro(rng, f), g, K, R, V, G, E, s, gw: parts, due: K + part(R) + part(V) + s - part(E) };
    }),
  context: (s) =>
    [
      `${s.opening} ${RET.FLUCTUATING} ${s.f.out} retires on ${RETIRE_ON}; ${s.g.text}.`,
      `Balances on that date: ${s.f.out}'s Capital A/c ${inr(s.K)}; General Reserve ${inr(s.R)}${s.E > 0 ? `; Goodwill appearing in the books ${inr(s.E)}` : ''}.`,
      `${RET.RESERVE_IN_FULL} Revaluation A/c shows a ${s.V > 0 ? 'profit' : 'loss'} of ${inr(Math.abs(s.V))}.`,
      `The goodwill of the firm is valued at ${inr(s.G)}. ${RET.goodwillRule(s.E > 0)}`,
      `The amount due to ${s.f.out} is transferred to ${s.f.out}'s Loan A/c.`,
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'ratio',
      make: (s) => {
        const { f, g } = s;
        const r = RET.ratioParts(g.w, [
          [f.stayOld, `Took the old ratio of ${RET.list(f.stay)}; the gaining ratio is the ratio in which they take over ${f.out}'s share.`],
          [g.fresh, 'Took the new ratio as the gaining ratio. Gain = new share - old share.'],
          [[...g.w].reverse(), 'Wrote the gaining ratio the wrong way round.'],
          [[1, 1], `Took ${f.out}'s share as taken over equally.`],
        ]);
        return r && { prompt: `Find the gaining ratio of ${RET.list(f.stay)}.`, ...r, explanation: [`${g.why}.`], hints: RET.H.ratio };
      },
      verify: (q: RatioQuestion) => {
        const g = RET.readFirm(q.context ?? '');
        const gain = g && RET.readGain(q.context ?? '', g);
        return !!gain && sameRatio(q.answer, gain);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { f, G } = s;
        const r = RET.numeric(s.s, [
          [G, `Took the whole goodwill of the firm; ${f.out} is paid only for ${f.out}'s own share of it.`],
          [G / f.names.length, 'Divided the goodwill equally among the three partners instead of in the profit-sharing ratio.'],
          [G - s.s, `Took the share of the continuing partners instead of ${f.out}'s.`],
          ...(s.E > 0 ? [[s.s - (s.E * f.x) / f.total, "Set the goodwill written off against the share of goodwill. The two are separate entries; this question asks for the share of the firm's goodwill."] as [number, string]] : []),
        ]);
        return r && { prompt: `What is ${f.out}'s share of the goodwill of the firm?`, ...r, explanation: [`${f.out}'s share = ${inr(G)} x ${RET.fr(f.x, f.total)} = ${inr(s.s)}.`], hints: RET.H.goodwill };
      },
      verify: (q: NumericQuestion) => {
        const g = RET.readFirm(q.context ?? '');
        return g !== null && near(q.answer / 100, amountAfter(q.context ?? '', /goodwill of the firm is valued at ₹[\d,]+/) * g.x);
      },
    },
    {
      kind: 'journal',
      make: (s) => {
        const step = RET.stepGoodwill(s.f, s.g, s.G);
        return {
          prompt: `Pass the journal entry that adjusts ${s.f.out}'s share of the goodwill of the firm${s.E > 0 ? ' (the goodwill in the books has already been written off)' : ''}.`,
          lines: step.lines,
          explanation: step.explanation,
          hints: RET.H.goodwill,
          distractorAccounts: ['goodwill', 'premiumForGoodwill', 'revaluation', partnerLoan(s.f.out)],
        };
      },
      verify: (q: JournalQuestion) => {
        const text = q.context ?? '';
        const g = RET.readFirm(text);
        const gain = g && RET.readGain(text, g);
        if (!g || !gain) return false;
        const G = amountAfter(text, /goodwill of the firm is valued at ₹[\d,]+/);
        return near(posted(q, partnerCapital(g.out), 'Cr'), G * g.x) && g.stay.every((name, i) => near(posted(q, partnerCapital(name), 'Dr'), G * gain[i]));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { f } = s;
        const part = (v: number): number => (v * f.x) / f.total;
        const r = RET.numeric(s.due, [
          [s.due - s.s, `Left out ${f.out}'s share of goodwill.`],
          [s.due - part(s.R), 'Left out the share of the General Reserve.'],
          [s.due - 2 * part(s.V), `Took the ${s.V > 0 ? 'profit' : 'loss'} on revaluation the wrong way round.`],
          ...(s.E > 0 ? [[s.due + part(s.E), 'Did not write off the goodwill in the books first.'] as [number, string]] : []),
          [s.due - s.s + s.G, `Credited ${f.out} with the whole goodwill of the firm instead of ${f.out}'s share of it.`],
        ]);
        return (
          r && {
            prompt: `What amount is transferred to ${f.out}'s Loan A/c?`,
            ...r,
            explanation: [
              `Shares of ${f.out} (${RET.fr(f.x, f.total)}): General Reserve ${inr(part(s.R))}; revaluation ${s.V > 0 ? 'profit' : 'loss'} ${inr(Math.abs(part(s.V)))}; goodwill ${inr(s.s)}${s.E > 0 ? `; goodwill written off ${inr(part(s.E))}` : ''}.`,
              `Amount due = ${RET.tally(s.K, [['share of the General Reserve', part(s.R)], [`share of the revaluation ${s.V > 0 ? 'profit' : 'loss'}`, part(s.V)], ['share of goodwill', s.s], ['share of the goodwill written off', -part(s.E)]])} = ${inr(s.due)}.`,
            ],
            hints: RET.H.due,
          }
        );
      },
      verify: (q: NumericQuestion) => {
        const text = q.context ?? '';
        const g = RET.readFirm(text);
        if (!g) return false;
        const K = amountAfter(text, /Capital A\/c ₹[\d,]+/);
        const R = amountAfter(text, /General Reserve ₹[\d,]+/);
        const E = amountAfter(text, /Goodwill appearing in the books ₹[\d,]+/);
        const V = (/shows a profit/.test(text) ? 1 : -1) * amountAfter(text, /shows a (?:profit|loss) of ₹[\d,]+/);
        const G = amountAfter(text, /goodwill of the firm is valued at ₹[\d,]+/);
        return near(q.answer / 100, K + (R + V + G - E) * g.x);
      },
    },
  ],
});

// ===============================================================================================================
// 5. A death during the year: the share of profit, interest on capital and the amount due to the executor (medium)
// ===============================================================================================================

interface Death {
  f: RET.Firm;
  opening: string;
  g: RET.Gain;
  date: { text: string; months: number };
  K: number;
  r: number;
  interest: number;
  G: number;
  s: number;
  bySales: boolean;
  rate: number;
  S: number;
  P: number;
  S2: number;
  profit: number;
  R: number;
  drawn: number;
  due: number;
}

/** What the case text of a death says, read back: the months, the capital, the rate and the share of profit. */
function readDeath(text: string): { x: number; m: number; K: number; r: number; profit: number; G: number; R: number; drawn: number } | null {
  const g = RET.readFirm(text);
  if (!g) return null;
  const row = (re: RegExp): number => {
    const v = RET.rowAmount(text, re);
    return Number.isNaN(v) ? 0 : v;
  };
  const m = RET.monthsFromApril(RET.dateIn(text, 'died on '));
  const K = row(/capital on 1 April 2025/);
  const r = Number(/Interest on capital: (\d+)% p\.a\./.exec(text)?.[1]);
  const profit = /on the sales of that period/.test(text) ? (row(/^Sales from 1 April/) * row(/^Profit for the year/) * g.x) / row(/^Sales for the year/) : (row(/^Profit for the year/) * m * g.x) / 12;
  return { x: g.x, m, K, r, profit, G: row(/^Goodwill of the firm/), R: row(/^General Reserve/), drawn: row(/drawings from 1 April 2025/) };
}

const deathExecutor = caseTemplate<Death>({
  id: 'case-recon-death-executor',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'A partner dies during the year',
  setup: (rng) =>
    RET.attempt(8, () => {
      const f = RET.firm(rng);
      const g = RET.gainOf(rng, f, ['silent', 'silent', 'split', 'agreed', 'one']);
      if (!g) return null;
      const date = rng.pick(RET.DATES_2025);
      const m = date.months;
      const K = 60000 * rng.int(2, 10);
      // A rate at which the interest for the months is in round hundreds of rupees.
      const rates = [5, 6, 8, 10, 12].filter((v) => (K * v * m) % 120000 === 0);
      if (rates.length === 0) return null;
      const r = rng.pick(rates);
      const G = RET.mult(rng, f.total * sum(g.w) * 1000, 60000, 720000);
      const bySales = rng.int(0, 1) === 0;
      const rate = rng.pick([8, 10, 12, 15, 20, 25]);
      const S = 100000 * rng.int(8, 30);
      const P = bySales ? (S * rate) / 100 : RET.profitForTime(rng, f, m);
      const S2 = bySales ? RET.salesForShare(rng, f, S, m, rate) : 0;
      const R = rng.int(0, 1) === 0 ? RET.mult(rng, f.total * 1000, 30000, 200000) : 0;
      if (G === null || P === null || S2 === null || R === null) return null;
      const drawn = rng.step(10000, 60000, 2000);
      const interest = (K * r * m) / 1200;
      const profit = bySales ? (S2 * rate * f.x) / (100 * f.total) : (P * m * f.x) / (12 * f.total);
      const { s } = RET.goodwillParts(f, g, G);
      const due = K + interest + profit + s + (R * f.x) / f.total - drawn;
      return { f, opening: RET.intro(rng, f), g, date, K, r, interest, G, s, bySales, rate, S, P, S2, profit, R, drawn, due };
    }),
  context: (s) =>
    [
      `${s.opening} ${RET.FLUCTUATING} ${RET.CLOSES} ${s.f.out} died on ${s.date.text}; ${s.g.text}.`,
      `${s.bySales ? `${RET.BASIS_SALES}, at the rate of profit on sales earned in the previous year.` : `${RET.BASIS_TIME} from the profit of the previous year.`} Interest on capital is allowed up to the date of death. ${RET.goodwillRule(false)} The amount due is transferred to ${s.f.out}'s Executor's A/c.`,
      `${s.f.out}'s capital on 1 April 2025: ${inr(s.K)}`,
      `Interest on capital: ${s.r}% p.a.`,
      ...(s.bySales ? RET.salesRows(s.S, s.P, s.S2).split('\n') : [`Profit for the year ended 31 March 2025: ${inr(s.P)}`]),
      `Goodwill of the firm, valued on the death: ${inr(s.G)}`,
      ...(s.R > 0 ? [`General Reserve: ${inr(s.R)} (the whole of it is distributed among all the partners)`] : []),
      `${s.f.out}'s drawings from 1 April 2025 to the date of death: ${inr(s.drawn)}`,
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { f, date, P, S, S2, rate } = s;
        const m = date.months;
        const share = RET.fr(f.x, f.total);
        const r = s.bySales
          ? RET.numeric(s.profit, [
              [(P * m * f.x) / (12 * f.total), 'Worked on the basis of time, although the deed says the basis is the sales of the period.'],
              [(S2 * rate) / 100, `Gave the profit of the whole firm on these sales, not ${f.out}'s share of it.`],
              [(S2 * f.x) / f.total, `Took ${f.out}'s share of the sales themselves instead of the profit on them.`],
              [(P * f.x) / f.total, `Gave ${f.out}'s share of the whole of last year's profit.`],
            ])
          : RET.numeric(s.profit, [
              [(P * f.x) / f.total, `Gave a full year's share; ${f.out} shares only the profit of the ${m} months up to the date of death.`],
              [(P * m) / 12, `Gave the profit of the whole firm for the ${m} months, not ${f.out}'s share of it.`],
              [(P * (12 - m) * f.x) / (12 * f.total), 'Counted the months after the death instead of the months before it.'],
              [(P * m) / 36, 'Divided the profit of the period equally instead of in the profit-sharing ratio.'],
            ]);
        return (
          r && {
            prompt: `What is ${f.out}'s share of profit up to the date of death?`,
            ...r,
            explanation: s.bySales
              ? [`Rate of profit on sales last year = ${inr(P)} / ${inr(S)} x 100 = ${rate}%.`, `Profit of the firm on the sales up to the date of death = ${inr(S2)} x ${rate}% = ${inr((S2 * rate) / 100)}.`, `${f.out}'s share = ${inr((S2 * rate) / 100)} x ${share} = ${inr(s.profit)}.`]
              : [`1 April 2025 to ${date.text} is ${m} months.`, `Estimated profit of the firm for the period = ${inr(P)} x ${m}/12 = ${inr((P * m) / 12)}.`, `${f.out}'s share = ${inr((P * m) / 12)} x ${share} = ${inr(s.profit)}.`],
            hints: RET.H.death,
          }
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readDeath(q.context ?? '');
        return k !== null && k.m >= 1 && near(q.answer / 100, k.profit);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { K, r, date, f } = s;
        const m = date.months;
        const n = RET.numeric(s.interest, [
          [(K * r) / 100, `Allowed interest for a full year instead of the ${m} months up to the date of death.`],
          [(K * r * (12 - m)) / 1200, 'Counted the months after the death instead of the months before it.'],
          [(K * r * m) / 100, 'Multiplied by the number of months without dividing by 12.'],
          [((K - s.drawn) * r * m) / 1200, 'Deducted the drawings from the capital first. Interest on capital runs on the capital at the start of the year; the drawings are dealt with separately.'],
        ]);
        return (
          n && {
            prompt: `How much interest on capital is allowed to ${f.out}?`,
            ...n,
            explanation: [`1 April 2025 to ${date.text} is ${m} months.`, `Interest on capital = ${inr(K)} x ${r}% x ${m}/12 = ${inr(s.interest)}.`],
            hints: RET.H.death,
          }
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readDeath(q.context ?? '');
        return k !== null && near(q.answer / 100, (k.K * k.r * k.m) / 1200);
      },
    },
    {
      kind: 'journal',
      make: (s) => ({
        prompt: `Pass the journal entry that credits ${s.f.out} with the share of profit up to the date of death.`,
        lines: [dr('profitAndLossSuspense', s.profit), cr(partnerCapital(s.f.out), s.profit)],
        explanation: [
          `${s.f.out}'s share of profit up to ${s.date.text} = ${inr(s.profit)}.`,
          `The accounts of the year are not yet closed, so the estimated share is debited to Profit and Loss Suspense A/c, which is closed to Profit and Loss Appropriation A/c at the year end.`,
          `${s.f.out}'s Capital A/c is credited: the amount is owed to the partner's estate.`,
        ],
        hints: RET.H.death,
        distractorAccounts: ['profitAndLossAppropriation', 'profitAndLoss', executor(s.f.out), 'interestOnCapital'],
      }),
      verify: (q: JournalQuestion) => {
        const k = readDeath(q.context ?? '');
        const out = /([A-Z][a-z]+) died on/.exec(q.context ?? '')?.[1] ?? '';
        return k !== null && near(posted(q, 'profitAndLossSuspense', 'Dr'), k.profit) && near(posted(q, partnerCapital(out), 'Cr'), k.profit) && q.expected.length === 2;
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { f, K, r, date } = s;
        const m = date.months;
        const part = (v: number): number => (v * f.x) / f.total;
        const fullYear = (s.P * f.x) / f.total;
        const n = RET.numeric(s.due, [
          [s.due - s.interest + (K * r) / 100, `Allowed interest on capital for a full year instead of the ${m} months up to the date of death.`],
          [s.due - s.profit + fullYear, `Gave ${f.out} a full year's share of profit instead of the share up to the date of death.`],
          [s.due + 2 * s.drawn, 'Added the drawings instead of deducting them.'],
          [s.due - s.s, `Left out ${f.out}'s share of goodwill.`],
          [s.due + s.drawn, `Did not deduct ${f.out}'s drawings.`],
          ...(s.R > 0 ? [[s.due - part(s.R), `Left out ${f.out}'s share of the General Reserve.`] as [number, string]] : []),
        ]);
        return (
          n && {
            prompt: `What amount is transferred to ${f.out}'s Executor's A/c?`,
            ...n,
            explanation: [
              `Interest on capital = ${inr(K)} x ${r}% x ${m}/12 = ${inr(s.interest)}; share of profit up to the date of death = ${inr(s.profit)}.`,
              `Share of goodwill = ${inr(s.G)} x ${RET.fr(f.x, f.total)} = ${inr(s.s)}. ${s.g.why}.`,
              ...(s.R > 0 ? [`Share of the General Reserve = ${inr(s.R)} x ${RET.fr(f.x, f.total)} = ${inr(part(s.R))}.`] : []),
              `Amount due = ${RET.tally(K, [['share of the General Reserve', part(s.R)], ['interest on capital', s.interest], ['share of profit', s.profit], ['share of goodwill', s.s], ['drawings', -s.drawn]])} = ${inr(s.due)}.`,
            ],
            hints: RET.H.executor,
          }
        );
      },
      verify: (q: NumericQuestion) => {
        const k = readDeath(q.context ?? '');
        return k !== null && near(q.answer / 100, k.K * (1 + (k.r * k.m) / 1200) + k.profit + (k.G + k.R) * k.x - k.drawn);
      },
    },
  ],
});

// ===============================================================================================================
// 6. A Workmen Compensation Reserve or an Investment Fluctuation Reserve on an admission or a retirement (medium)
// ===============================================================================================================

interface Earmark {
  event: 'admission' | 'retirement';
  /** The partners who share the reserve (the old partners, or all of them, the retiring one included), and their ratio. */
  names: string[];
  old: number[];
  /** The first line of the case: the firm and the change. */
  first: string;
  /** Who shares, as a phrase: "the old partners", "all the partners". */
  who: string;
  /** The wrong sharers a student reaches for, and in which ratio. */
  wrongWho: string;
  e: ADM.Earmarked;
  /** The partner whose share of what is left is asked. */
  ask: number;
}

const earmarkedReserve = caseTemplate<Earmark>({
  id: 'case-recon-earmarked-reserve',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'A reserve kept for a purpose',
  setup: (rng) => {
    const event = rng.pick(['admission', 'retirement'] as const);
    let base: Omit<Earmark, 'e' | 'ask'>;
    if (event === 'admission') {
      const d = ADM.deal(rng, ['old', 'equal', 'stated', 'one'], rng.pick([2, 2, 3]));
      if (!d) return null;
      base = { event, names: d.olds, old: d.old, first: `${d.open} ${d.admit} ${d.how}`, who: 'the old partners', wrongWho: `all the partners, ${d.nw} included, in the new ratio` };
    } else {
      const f = RET.firm(rng);
      const g = RET.gainOf(rng, f, ['silent', 'split', 'agreed']);
      if (!g) return null;
      base = { event, names: f.names, old: f.old, first: `${RET.intro(rng, f)} ${f.out} retires on ${RETIRE_ON}; ${g.text}.`, who: `all the partners, ${f.out} included,`, wrongWho: `${RET.list(f.stay)} alone, in their gaining ratio` };
    }
    // A reserve that is more than what stands against it, or less: each case has a part of the reserve to place.
    let e: ADM.Earmarked | null = null;
    for (let t = 0; t < 8 && e === null; t++) {
      const x = ADM.earmarked(rng, sum(base.old) * 1000);
      if (x.against > 0 && (x.surplus > 0 || x.shortfall > 0)) e = x;
    }
    return e && { ...base, e, ask: rng.int(0, base.names.length - 1) };
  },
  context: (s) => {
    const { e } = s;
    return [
      s.first,
      'The capital accounts are fluctuating.',
      e.wcr
        ? `The Balance Sheet shows a Workmen Compensation Reserve of ${inr(e.reserve)}. A claim of ${inr(e.against)} for workmen's compensation is to be provided for.`
        : `The Balance Sheet shows Investments at ${inr(e.book)} and an Investment Fluctuation Reserve of ${inr(e.reserve)}. The market value of the investments is ${inr(e.book - e.against)}, and they are to be shown at that value.`,
      `The reserve is not to remain in the books after the ${s.event}.`,
    ].join('\n');
  },
  parts: [
    {
      kind: 'mcq',
      make: (s) => {
        const { e } = s;
        const what = e.wcr ? 'claim' : 'fall in the value of the investments';
        const left = `The reserve first meets the ${what}; what is left of it is credited to the capital accounts of ${s.who} in the old ratio`;
        const short = `The whole reserve goes towards the ${what}, and the part of it that the reserve cannot meet is debited to Revaluation A/c`;
        const correct = e.surplus > 0 ? left : short;
        return RET.choice(
          `How is the ${e.name} dealt with on the ${s.event}?`,
          correct,
          [
            e.surplus > 0
              ? [`The reserve first meets the ${what}; what is left of it is credited to the capital accounts of ${s.wrongWho}`, s.event === 'admission' ? 'Gave a share to the new partner. The reserve was built up before the admission and belongs to the old partners in the old ratio.' : 'Left out the retiring partner. The reserve was built up while all were partners and is shared by all of them in the old ratio.']
              : [`The whole reserve goes towards the ${what}, and the part of it that the reserve cannot meet is debited to the capital accounts of ${s.wrongWho}`, s.event === 'admission' ? 'Charged the new partner with a loss of the time before the admission. The part not covered is a loss on revaluation, shared by the old partners.' : 'Left out the retiring partner. The part not covered is a loss on revaluation, which all the partners share in the old ratio.'],
            e.surplus > 0 ? [short, `Compared the reserve and the ${what} the wrong way round: here the reserve is the larger.`] : [left, `Compared the reserve and the ${what} the wrong way round: here the ${what} is the larger, and nothing of the reserve is left.`],
            [`The ${what} is recorded, and the ${e.name} is shown in the balance sheet of the reconstituted firm`, `Left the reserve in the books. A reserve kept for a purpose is set against that purpose, and the case says it is not to remain.`],
            [`The whole reserve is credited to the capital accounts of ${s.who} in the old ratio, and nothing is recorded for the ${what}`, `Ignored the ${what}. The reserve was kept to meet it, and it is set against the reserve before anything is shared.`],
          ],
          `${e.name} ${inr(e.reserve)}; ${e.wcr ? 'claim' : 'fall in value'} ${inr(e.against)}. ${e.surplus > 0 ? `The reserve covers it and ${inr(e.surplus)} is left, a free reserve credited to ${s.who.replace(/,$/, '')} in the old ratio ${s.old.join(':')}.` : `The reserve falls short by ${inr(e.shortfall)}, which is a loss debited to Revaluation A/c.`}`,
          CPR.H.specific,
        );
      },
      verify: (q: McqQuestion) => {
        const a = amountsIn(lineOf(q.context ?? '', /^The Balance Sheet shows/));
        const left = a.length === 2 ? a[0] - a[1] : a[1] - (a[0] - a[2]);
        return optionText(q).includes(left > 0 ? 'what is left of it is credited' : 'debited to Revaluation A/c');
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { e, names, old } = s;
        const what = e.wcr ? 'the claim' : 'the fall in value';
        if (e.surplus > 0) {
          const name = names[s.ask];
          const share = (v: number): number => (v * old[s.ask]) / sum(old);
          const r = RET.numeric(share(e.surplus), [
            [share(e.reserve), `Shared the whole reserve without first meeting ${what}.`],
            [e.surplus, `Gave the whole of what is left, not ${name}'s share of it.`],
            [e.surplus / names.length, 'Shared what is left equally instead of in the old ratio.'],
            [share(e.against), `Gave ${name}'s share of ${what} instead of the share of what is left of the reserve.`],
          ]);
          return (
            r && {
              prompt: `By how much is ${name}'s Capital A/c credited out of the ${e.name}?`,
              ...r,
              explanation: [`Left = ${inr(e.reserve)} - ${inr(e.against)} = ${inr(e.surplus)}.`, `${name}'s share in the old ratio ${old.join(':')} = ${inr(e.surplus)} x ${old[s.ask]}/${sum(old)} = ${inr(share(e.surplus))}.`],
              hints: CPR.H.specific,
            }
          );
        }
        const r = RET.numeric(e.shortfall, [
          [e.against, `Debited the whole of ${what} to Revaluation A/c without first setting the reserve against it.`],
          [e.reserve, 'Gave the reserve instead of the part it cannot meet.'],
          [e.against + e.reserve, 'Added the reserve to the amount it is set against instead of deducting it.'],
        ]);
        return (
          r && {
            prompt: `What amount is debited to Revaluation A/c on account of ${what}?`,
            ...r,
            explanation: [`The reserve of ${inr(e.reserve)} goes towards ${what} of ${inr(e.against)}.`, `What it cannot meet = ${inr(e.against)} - ${inr(e.reserve)} = ${inr(e.shortfall)}, a loss debited to Revaluation A/c.`],
            hints: CPR.H.specific,
          }
        );
      },
      verify: (q: NumericQuestion) => {
        const text = q.context ?? '';
        const a = amountsIn(lineOf(text, /^The Balance Sheet shows/));
        const [reserve, against] = a.length === 2 ? [a[0], a[1]] : [a[1], a[0] - a[2]];
        if (/debited to Revaluation A\/c/.test(q.prompt)) return near(q.answer / 100, against - reserve);
        const name = /^By how much is ([A-Z][a-z]+)'s/.exec(q.prompt)?.[1] ?? '';
        const first = text.split('\n')[0];
        const names = (/^(.+?) (?:are partners|run |share )/.exec(first)?.[1] ?? '').split(/, | and /);
        const old = RET.ratiosIn(first)[0] ?? [];
        return old.length === names.length && near(q.answer / 100, ((reserve - against) * old[names.indexOf(name)]) / sum(old));
      },
    },
    {
      kind: 'journal',
      make: (s) => {
        const { e, names, old } = s;
        const parts = old.map((t) => (e.surplus * t) / sum(old));
        return {
          prompt: `Pass the journal entry that closes the ${e.name}.`,
          lines: ADM.earmarkedLines(e, () => names.map((name, i) => cr(partnerCapital(name), parts[i]))),
          explanation: ADM.earmarkedSteps(e, ADM.eachGets(names, parts), 'Capital'),
          hints: CPR.H.specific,
          distractorAccounts: [e.wcr ? 'investmentFluctuationReserve' : 'workmenCompensationReserve', 'generalReserve', 'profitAndLoss', ...(e.wcr ? [] : ['workmenCompensationClaim'])],
        };
      },
      verify: (q: JournalQuestion) => {
        const a = amountsIn(lineOf(q.context ?? '', /^The Balance Sheet shows/));
        const wcr = /Workmen Compensation Reserve/.test(q.context ?? '');
        const [reserve, against] = a.length === 2 ? [a[0], a[1]] : [a[1], a[0] - a[2]];
        const capitals = q.expected.filter((l) => l.accountId.startsWith('capital:'));
        return (
          near(posted(q, wcr ? 'workmenCompensationReserve' : 'investmentFluctuationReserve', 'Dr'), reserve) &&
          near(posted(q, wcr ? 'workmenCompensationClaim' : 'investments', 'Cr'), against) &&
          near(posted(q, 'revaluation', 'Dr'), Math.max(against - reserve, 0)) &&
          near(sum(capitals.map((l) => (l.side === 'Cr' ? l.amount : -l.amount))) / 100, Math.max(reserve - against, 0))
        );
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { e } = s;
        if (e.wcr) {
          const r = RET.numeric(e.against, [
            [e.against - e.reserve, 'Deducted the reserve from the claim. The claim is a liability shown in full; the reserve is closed against it.'],
            [e.reserve, 'Showed the reserve instead of the claim.'],
            [e.surplus, 'Showed what was left of the reserve.'],
            [e.against + e.reserve, 'Added the reserve to the claim.'],
          ]);
          return r && { prompt: `At what amount is Workmen Compensation Claim shown in the balance sheet after the ${s.event}?`, ...r, explanation: [`The claim of ${inr(e.against)} is a liability the firm must pay: it is shown in full as Workmen Compensation Claim (many books call it Provision for Workmen Compensation Claim).`, `The reserve does not appear: it has been closed against the claim.`], hints: CPR.H.specific };
        }
        const market = e.book - e.against;
        const r = RET.numeric(market, [
          [e.book, 'Kept the investments at their book value; they are to be shown at the market value.'],
          [e.book - e.reserve, 'Deducted the reserve from the investments instead of writing them down to their market value.'],
          [e.book - e.against - e.reserve, 'Deducted the reserve as well as the fall in value.'],
          [e.against, 'Gave the fall in value instead of the value of the investments.'],
        ]);
        return r && { prompt: `At what amount are Investments shown in the balance sheet after the ${s.event}?`, ...r, explanation: [`The investments are written down from ${inr(e.book)} to their market value: ${inr(e.book)} - ${inr(e.against)} = ${inr(market)}.`, 'The fall is met out of the reserve, which does not appear any more.'], hints: CPR.H.specific };
      },
      verify: (q: NumericQuestion) => {
        const a = amountsIn(lineOf(q.context ?? '', /^The Balance Sheet shows/));
        return a.length === 2 ? near(q.answer / 100, a[1]) : near(q.answer / 100, a[2]);
      },
    },
  ],
});

// ===============================================================================================================
// Chained cases: the long question. The firm's balance sheet before the change opens the books, every term of the
// change is posted as an entry, and each format is read from those books: the Revaluation Account, the capital
// accounts in columns (starting from the result of revaluation, which the case text does not print), and the
// balance sheet after the change (starting from the capitals the capital accounts carry down). Each `verify` reads
// the old balance sheet and the terms back from the printed case and works the format out again by arithmetic.
// ===============================================================================================================

/** The figures of a balance sheet printed one to a line ("Building: ₹5,00,000"), by name, up to the line that starts the terms. */
function sheetOf(text: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const line of text.split('\n')) {
    if (/agreed that:$|^The terms of/.test(line)) break;
    const m = /^([A-Z][A-Za-z' ]+): ₹([\d,]+)$/.exec(line);
    if (m) out.set(m[1], Number(m[2].replace(/,/g, '')));
  }
  return out;
}

/**
 * A change agreed on revaluation, read back from its words (those of `changeOf` in the retirement topic) and the
 * book values of the printed balance sheet: what it does to Revaluation A/c (a gain above zero), which row of the
 * balance sheet it moves and by how much (a liability's own amount for a liability). Null for a line that is no change.
 */
function revaluedLine(line: string, book: Map<string, number>): { effect: number; row: string; delta: number } | null {
  const a = amountsIn(line);
  const p = Number(/(\d+)%/.exec(line)?.[1]);
  const at = (name: string): number => book.get(name) ?? NaN;
  if (/^Building is to be appreciated by/.test(line)) return { effect: (at('Building') * p) / 100, row: 'Building', delta: (at('Building') * p) / 100 };
  if (/^Machinery is to be depreciated by/.test(line)) return { effect: -(at('Machinery') * p) / 100, row: 'Machinery', delta: -(at('Machinery') * p) / 100 };
  if (/^A provision for doubtful debts of \d+% is to be created on debtors/.test(line)) return { effect: -(at('Debtors') * p) / 100, row: 'Debtors', delta: -(at('Debtors') * p) / 100 };
  if (/^Stock is to be reduced in value by/.test(line)) return { effect: -a[0], row: 'Stock', delta: -a[0] };
  if (/^Stock is to be valued at/.test(line)) return { effect: a[0] - at('Stock'), row: 'Stock', delta: a[0] - at('Stock') };
  if (/^Creditors of ₹[\d,]+ are not to be paid/.test(line)) return { effect: a[0], row: 'Creditors', delta: -a[0] };
  if (/^Outstanding expenses of/.test(line)) return { effect: -a[0], row: 'Outstanding Expenses', delta: a[0] };
  if (/^Investments of ₹[\d,]+, not yet in the books/.test(line)) return { effect: a[0], row: 'Investments', delta: a[0] };
  return null;
}
const revaluedLines = (text: string): { effect: number; row: string; delta: number }[] => {
  const book = sheetOf(text);
  return text.split('\n').flatMap((l) => {
    const c = revaluedLine(l, book);
    return c ? [c] : [];
  });
};

/** The rows of a Revaluation A/c in the house form, from the changes and the transfer to the partners named. */
export function revaluationSides(entries: DatedEntry[], names: readonly string[], profit: boolean): { left: AccountSideParts; right: AccountSideParts } {
  const short = new Map(names.map((name) => [RET.transferRow(name, profit), ledgerLabel(partnerCapital(name))]));
  const transferOf = new Map(names.map((name) => [partnerCapital(name), RET.transferRow(name, profit)]));
  const sides = ledgerSides(accountOf(entries, 'revaluation', null, (id) => transferOf.get(id) ?? ledgerLabel(id)), { closeOn: entries[0].date });
  const closed = (rows: FormatRowParts[]): FormatRowParts[] =>
    rows.map((r) => {
      const plain = short.get(r.label);
      return plain === undefined ? r : { ...r, closing: true, also: [plain] };
    });
  return { left: { ...sides.left, rows: closed(sides.left.rows) }, right: { ...sides.right, rows: closed(sides.right.rows) } };
}

/**
 * A Revaluation A/c worked again from the case text: the losses on the debit side and the gains on the credit side
 * (each read from its words and the printed book values), and the result shared among `names` in the ratio `ratio`,
 * a transfer row for each in the house form with the plain capital account as its one other wording.
 */
function revaluationHoldsFor(q: AccountQuestion, names: readonly string[], ratio: readonly number[]): boolean {
  const effects = revaluedLines(q.data).map((c) => c.effect);
  const V = sum(effects);
  const rows = (side: 0 | 1): FormatRow[] => q.sides[side].rows;
  const plain = (side: 0 | 1): number => sum(rows(side).filter((r) => !r.closing).map((r) => r.amounts[0])) / 100;
  const transfers = rows(V > 0 ? 0 : 1).filter((r) => r.closing);
  return (
    V !== 0 &&
    effects.length >= 2 &&
    near(plain(0), -sum(effects.filter((e) => e < 0))) &&
    near(plain(1), sum(effects.filter((e) => e > 0))) &&
    rows(V > 0 ? 1 : 0).every((r) => !r.closing) &&
    transfers.length === names.length &&
    names.every((name, i) => {
      const row = transfers.find((r) => r.label === `${V > 0 ? 'Profit' : 'Loss'} transferred to ${name}'s Capital A/c`);
      return row !== undefined && near(row.amounts[0] / 100, (Math.abs(V) * ratio[i]) / sum(ratio)) && row.also?.length === 1 && row.also[0] === `${name}'s Capital A/c`;
    })
  );
}

/** The figure of a partner's column in the one row of a side with these particulars; 0 when there is no such row. */
const columnFigure = (q: AccountQuestion, side: 0 | 1, pick: (r: FormatRow) => boolean, column: number): number => (q.sides[side].rows.find(pick)?.amounts[column] ?? 0) / 100;

/** The balance sheet of a chained case: its rows, from the books after every entry, in the order of a firm's balance sheet. */
function sheetRows(ledger: Ledger, liabilities: [string, string][], assets: [string, string][], debtorsBook: number): { left: FormatRowParts[]; right: FormatRowParts[] } | null {
  const at = (id: string, side: 'Dr' | 'Cr'): number => {
    const b = balanceOf(ledger, id);
    return b === null ? 0 : b.side === side ? b.amount : -b.amount;
  };
  const provision = at('provisionForDoubtfulDebts', 'Cr');
  const rows = (items: [string, string][], side: 'Dr' | 'Cr'): FormatRowParts[] | null => {
    const out: FormatRowParts[] = [];
    for (const [id, label] of items) {
      const amount = at(id, side) - (id === 'debtors' ? provision : 0);
      if (amount < 0) return null;
      if (amount === 0) continue;
      out.push({ label, amount, ...(id === 'debtors' && provision > 0 ? { details: [`Debtors ${inr(debtorsBook)}`, `Less: Provision for doubtful debts ${formatINR(provision)}`] } : {}) });
    }
    return out;
  };
  const left = rows(liabilities, 'Cr');
  const right = rows(assets, 'Dr');
  return left && right ? { left, right } : null;
}

// ---------------------------------------------------------------------------------------------------------------
// 7. Admission: Revaluation A/c, then the partners' capital accounts in columns, then the balance sheet (complex)
// ---------------------------------------------------------------------------------------------------------------

interface AdmChain {
  d: ADM.Deal;
  made: RET.Change[];
  V: number;
  R: number;
  E: number;
  G: number;
  premium: number;
  credits: number[];
  /** What the old partners withdraw of the premium credited to them: half of it, or nothing. */
  out: number[];
  capital: number;
  caps: number[];
  bs: { building: number; machinery: number; stock: number; debtors: number; creditors: number; bank: number };
  day: string;
  entries: DatedEntry[];
}

const admissionChain = caseTemplate<AdmChain>({
  id: 'case-recon-chain-admission',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Admission: revaluation, capitals and the new balance sheet',
  setup: (rng) =>
    RET.attempt(12, () => {
      const d = ADM.dealWhere(rng, ['old', 'equal', 'stated', 'stated', 'one'], ADM.tidySac, rng.pick([2, 2, 3]));
      if (!d) return null;
      const T = sum(d.old);
      const made = RET.changesOf(rng, T * 500, 3);
      if (!made || !made.some((c) => c.sign > 0) || !made.some((c) => c.sign < 0)) return null;
      const V = sum(made.map((c) => c.sign * c.amount));
      const R = RET.mult(rng, T * 1000, 30000, 200000);
      const E = rng.int(0, 2) === 0 ? RET.mult(rng, T * 1000, 20000, 100000) : 0;
      const half = rng.int(0, 2) === 0;
      const G = ADM.amountFor(rng, 60000, 600000, d.given.map((g) => (half ? ADM.times(g, ADM.fr(1, 2)) : g)));
      if (V === 0 || R === null || E === null || G === null) return null;
      const premium = ADM.of(G, d.share);
      const credits = d.given.map((g) => ADM.of(G, g));
      const out = credits.map((c) => (half ? c / 2 : 0));
      if (premium < 10000 || ![premium, ...credits, ...out].every(Number.isInteger)) return null;
      const change = (kind: RET.ChangeKind): RET.Change | undefined => made.find((c) => c.kind === kind);
      const bs = {
        building: change('building')?.book ?? rng.step(300000, 800000, 50000),
        machinery: change('machinery')?.book ?? rng.step(200000, 500000, 20000),
        stock: change('stock')?.book ?? rng.step(120000, 320000, 10000),
        debtors: change('debtors')?.book ?? rng.step(80000, 300000, 10000),
        creditors: change('creditors')?.book ?? rng.step(90000, 240000, 10000),
        bank: rng.step(40000, 200000, 10000),
      };
      // The capitals make the old balance sheet agree: its assets less the creditors and the reserve.
      const capitalTotal = E + bs.building + bs.machinery + bs.stock + bs.debtors + bs.bank - bs.creditors - R;
      const weights = d.olds.map(() => rng.int(3, 6));
      const caps = weights.map((w) => Math.floor((capitalTotal * w) / sum(weights) / 10000) * 10000);
      caps[caps.length - 1] = capitalTotal - sum(caps.slice(0, -1));
      if (caps.some((k) => k < 120000)) return null;
      // A capital of about the size the new partner's share calls for beside the capitals of the old partners.
      const fair = (sum(caps) * d.share[0]) / (d.share[1] - d.share[0]);
      const capital = Math.max(60000, Math.round((fair * rng.int(80, 125)) / 100 / 20000) * 20000, Math.ceil((premium * 1.5) / 20000) * 20000);
      const day = `1 April ${d.year}`;
      const ids = d.names.map(partnerCapital);
      const inOld = (x: number): number[] => d.oldShares.map((s) => ADM.of(x, s));
      const toOld = (account: string, x: number): JournalLine[] => [dr(account, x), ...inOld(x).map((p, i) => cr(ids[i], p))];
      const fromOld = (account: string, x: number): JournalLine[] => [...inOld(x).map((p, i) => dr(ids[i], p)), cr(account, x)];
      const lines: JournalLine[][] = [
        ...made.map(RET.changeLines),
        V > 0 ? toOld('revaluation', V) : fromOld('revaluation', -V),
        toOld('generalReserve', R),
        ...(E > 0 ? [fromOld('goodwill', E)] : []),
        [dr('bank', capital + premium), cr(ids[d.olds.length], capital), cr('premiumForGoodwill', premium)],
        ADM.entry(dr('premiumForGoodwill', premium), ...credits.map((c, i) => cr(ids[i], c))),
        ...(half ? [ADM.entry(...out.map((o, i) => dr(ids[i], o)), cr('bank', sum(out)))] : []),
      ];
      if (inOld(Math.abs(V)).some((p) => !Number.isInteger(p))) return null;
      return { d, made, V, R, E, G, premium, credits, out, capital, caps, bs, day, entries: lines.map((l) => ({ date: day, lines: l })) };
    }),
  context: (s) => {
    const { d, bs } = s;
    const withdrawn = ADM.giversOf(d);
    return [
      `${d.open} ${d.admit} ${d.how} The capital accounts are fluctuating.`,
      `Balance Sheet of ${RET.list(d.olds)} as at 31 March ${d.year}:`,
      'Liabilities:',
      `Creditors: ${inr(bs.creditors)}`,
      `General Reserve: ${inr(s.R)}`,
      ...d.olds.map((name, i) => `${name}'s Capital: ${inr(s.caps[i])}`),
      'Assets:',
      ...(s.E > 0 ? [`Goodwill: ${inr(s.E)}`] : []),
      `Building: ${inr(bs.building)}`,
      `Machinery: ${inr(bs.machinery)}`,
      `Stock: ${inr(bs.stock)}`,
      `Debtors: ${inr(bs.debtors)}`,
      `Bank: ${inr(bs.bank)}`,
      `On ${d.nw}'s admission it is agreed that:`,
      ...s.made.map((c) => c.text),
      'The whole of the General Reserve is distributed among the old partners.',
      `The goodwill of the firm is valued at ${inr(s.G)}; ${d.nw} brings ${inr(s.capital)} as capital and ${d.nw}'s share of the goodwill as premium, by cheque. No goodwill account is to ${s.E > 0 ? 'remain in the books' : 'be raised'}.`,
      s.out.some((o) => o > 0)
        ? `${withdrawn.length === 1 ? `${withdrawn[0]} withdraws` : `${RET.list(withdrawn)} withdraw`} half of the premium credited, by cheque.`
        : 'The premium is kept in the business.',
    ].join('\n');
  },
  parts: [
    {
      kind: 'account',
      make: (s) => {
        const { d } = s;
        const profit = s.V > 0;
        const entries = [...s.made.map((c) => ({ date: s.day, lines: RET.changeLines(c) })), s.entries[s.made.length]];
        const shares = d.oldShares.map((x) => ADM.of(Math.abs(s.V), x));
        const losses = s.made.filter((c) => c.sign < 0);
        const gains = s.made.filter((c) => c.sign > 0);
        return {
          task: `Prepare the Revaluation Account on ${d.nw}'s admission on ${s.day}, closing it by transfer to the old partners' capital accounts.`,
          title: 'Revaluation A/c',
          ...revaluationSides(entries, d.olds, profit),
          distractors: [...d.olds.map((name) => RET.transferRow(name, !profit)), RET.transferRow(d.nw, profit), 'General Reserve A/c', 'Premium for Goodwill A/c', 'Balance c/d', ...(s.made.some((c) => c.kind === 'debtors') ? ['Debtors A/c'] : [])],
          explanation: [
            ...s.made.map((c) => (c.sign > 0 ? `${c.work}: a gain, credited ("By ${ledgerLabel(c.accountId)}").` : `${c.work}: a loss, debited ("To ${ledgerLabel(c.accountId)}").`)),
            `Debit side (losses) = ${RET.added(losses.map((c) => c.amount))}; credit side (gains) = ${RET.added(gains.map((c) => c.amount))}.`,
            `The ${profit ? 'credit' : 'debit'} side is the larger by ${inr(Math.abs(s.V))}: a ${profit ? 'profit' : 'loss'} on revaluation.`,
            `It arose before ${d.nw} came in, so it belongs to the old partners in the old ratio ${ADM.rs(d.old)}: ${ADM.eachGets(d.olds, shares)}. ${d.nw} gets none of it.`,
            `Each share is a row of its own on the ${profit ? 'debit' : 'credit'} side ("${profit ? 'To' : 'By'} ${RET.transferRow(d.olds[0], profit)}"; "${d.olds[0]}'s Capital A/c" alone is accepted too), which closes the account.`,
          ],
          hints: ADM.H.revaluation,
        };
      },
      verify: (q: AccountQuestion) => {
        const d = ADM.readDeal(q.data.split('\n')[0]);
        return d !== null && revaluationHoldsFor(q, d.olds, d.old);
      },
    },
    {
      kind: 'account',
      make: (s) => {
        const { d } = s;
        const profit = s.V > 0;
        const ids = d.names.map(partnerCapital);
        const view = columnarAccount(
          s.entries.slice(s.made.length),
          ids,
          { date: s.day, balances: [...s.caps.map((c) => ({ side: 'Cr' as const, amount: rupees(c) })), null] },
          (id) => (id === 'revaluation' ? ADM.revaluationRow(profit) : columnLabel(id)),
        );
        if (view.balances.some((b) => b === null || b.side !== 'Cr')) return null;
        const sides = columnarSides(view, { closeOn: s.day });
        const inOld = (x: number): number[] => d.oldShares.map((x2) => ADM.of(x, x2));
        const closing = view.balances.map((b) => (b ? b.amount / 100 : 0));
        return {
          task: `Prepare the partners' capital accounts in columns on ${s.day}, taking the profit or loss on revaluation from the Revaluation Account, and carry the balances down.`,
          title: "Partners' Capital Accounts",
          columns: partnerColumns(d.names),
          left: { ...sides.left, rows: ADM.plainRevaluation(sides.left.rows) },
          right: { ...sides.right, rows: ADM.plainRevaluation(sides.right.rows) },
          distractors: [ADM.revaluationRow(!profit), ...(s.E > 0 ? [] : ['Goodwill A/c']), 'Current A/c', 'Cash A/c', 'Profit and Loss Appropriation A/c'],
          explanation: [
            'Each partner has a column. The capitals of the old partners open on the credit side as "By Balance b/d".',
            `The ${s.V > 0 ? 'profit' : 'loss'} on revaluation, ${inr(Math.abs(s.V))}, from the Revaluation Account, is shared in the old ratio ${ADM.rs(d.old)}: ${ADM.eachGets(d.olds, inOld(Math.abs(s.V)))}, ${profit ? '"By Revaluation A/c (profit)"' : '"To Revaluation A/c (loss)"'} ("Revaluation A/c" alone is accepted too).`,
            `The whole of the General Reserve, ${inr(s.R)}, goes to the old partners in the old ratio: ${ADM.eachGets(d.olds, inOld(s.R))}, "By General Reserve A/c".`,
            ...(s.E > 0 ? [`The goodwill in the books, ${inr(s.E)}, is written off by the old partners in the old ratio: ${ADM.eachGets(d.olds, inOld(s.E))}, "To Goodwill A/c".`] : []),
            `${d.nw}'s capital of ${inr(s.capital)} is credited in ${d.nw}'s column, "By Bank A/c".`,
            `Premium = ${inr(s.G)} x ${ADM.fs(d.share)} = ${inr(s.premium)}. ${ADM.givesSteps(d)[0]} ${ADM.sacStep(d)} Credited "By Premium for Goodwill A/c": ${ADM.eachGets(d.olds, s.credits)}.`,
            ...(s.out.some((o) => o > 0) ? [`Half of the premium credited is withdrawn, "To Bank A/c": ${ADM.eachGets(d.olds, s.out)}.`] : []),
            `The balance of each column is carried down on the debit side, "To Balance c/d": ${ADM.eachGets(d.names, closing)}.`,
          ],
          hints: ADM.H.newFirm,
        };
      },
      verify: (q: AccountQuestion) => {
        const text = q.data;
        const d = ADM.readDeal(text.split('\n')[0]);
        if (!d) return false;
        const book = sheetOf(text);
        const V = sum(revaluedLines(text).map((c) => c.effect));
        const pool = (book.get('General Reserve') ?? 0) - (book.get('Goodwill') ?? 0) + V;
        const G = amountAfter(text, /goodwill of the firm is valued at ₹[\d,]+/);
        const capital = amountAfter(text, /brings ₹[\d,]+ as capital/);
        const kept = /withdraws? half of the premium/.test(text) ? 0.5 : 1;
        const want = [...d.olds.map((name, i) => (book.get(`${name}'s Capital`) ?? NaN) + pool * d.shares[i] + G * d.given[i] * kept), capital];
        const closing = (c: number): number => columnFigure(q, 0, (r) => r.closing === true, c);
        return want.every((w, c) => near(closing(c), w)) && near(columnFigure(q, 1, (r) => r.label === 'Bank A/c', d.olds.length), capital);
      },
    },
    {
      kind: 'account',
      make: (s) => {
        const { d, bs } = s;
        const ids = d.names.map(partnerCapital);
        const opening = post([
          [
            ...(s.E > 0 ? [dr('goodwill', s.E)] : []),
            dr('building', bs.building), dr('machinery', bs.machinery), dr('stock', bs.stock), dr('debtors', bs.debtors), dr('bank', bs.bank),
            cr('creditors', bs.creditors), cr('generalReserve', s.R),
            ...d.olds.map((_, i) => cr(ids[i], s.caps[i])),
          ],
        ]);
        const ledger = post(s.entries.map((e) => e.lines), opening);
        if (['revaluation', 'generalReserve', 'goodwill', 'premiumForGoodwill'].some((id) => balanceOf(ledger, id) !== null)) return null;
        const rows = sheetRows(
          ledger,
          [['creditors', 'Creditors'], ['outstandingExpenses', 'Outstanding Expenses'], ...d.names.map((name, i): [string, string] => [ids[i], `${name}'s Capital`])],
          [['building', 'Building'], ['machinery', 'Machinery'], ['investments', 'Investments'], ['stock', 'Stock'], ['debtors', 'Debtors'], ['bank', 'Bank']],
          bs.debtors,
        );
        if (!rows) return null;
        const total = sum(rows.left.map((r) => r.amount ?? 0)) / 100;
        const bank = (balanceOf(ledger, 'bank')?.amount ?? 0) / 100;
        return {
          task: `Prepare the Balance Sheet of the new firm as at ${s.day}, taking the partners' capitals from the capital accounts; show debtors less any provision for doubtful debts as one figure.`,
          title: `Balance Sheet of ${RET.list(d.names)} as at ${s.day}`,
          left: { title: 'Liabilities', rows: rows.left },
          right: { title: 'Assets', rows: rows.right },
          distractors: ['General Reserve', 'Goodwill', 'Premium for Goodwill', 'Provision for Doubtful Debts', 'Profit on Revaluation', 'Loss on Revaluation'],
          explanation: [
            `Assets and liabilities stand at their new values: ${s.made.map((c) => c.work).join('; ')}.`,
            'The General Reserve, the result of revaluation and the premium have gone to the capital accounts, and goodwill is not an asset of the new firm: none of them is a row here.',
            `The capitals are the balances carried down in the capital accounts: ${rows.left.filter((r) => /'s Capital$/.test(r.label)).map((r) => `${r.label} ${formatINR(r.amount ?? 0)}`).join('; ')}.`,
            `Bank = ${inr(bs.bank)} + ${inr(s.capital)} + ${inr(s.premium)}${s.out.some((o) => o > 0) ? ` - ${inr(sum(s.out))} (premium withdrawn)` : ''} = ${inr(bank)}.`,
            `Each side totals ${inr(total)}.`,
          ],
          hints: [
            'Take each term and ask which rows of the balance sheet it changes: an asset, a liability, or the capitals.',
            "The reserve, the result of revaluation, the premium and goodwill end up in the capital accounts; the bank gains the new partner's capital and the premium, less anything withdrawn.",
          ],
        };
      },
      verify: (q: AccountQuestion) => {
        const text = q.data;
        const d = ADM.readDeal(text.split('\n')[0]);
        if (!d) return false;
        const book = sheetOf(text);
        const changes = revaluedLines(text);
        const G = amountAfter(text, /goodwill of the firm is valued at ₹[\d,]+/);
        const capital = amountAfter(text, /brings ₹[\d,]+ as capital/);
        const premium = G * d.share;
        const withdrawn = /withdraws? half of the premium/.test(text) ? premium / 2 : 0;
        const moved = (row: string): number => sum(changes.filter((c) => c.row === row).map((c) => c.delta));
        // Every row worked out from the old balance sheet and the terms, and the two sides of that working agree.
        const assets: [string, number][] = [
          ['Building', (book.get('Building') ?? 0) + moved('Building')], ['Machinery', (book.get('Machinery') ?? 0) + moved('Machinery')], ['Investments', moved('Investments')],
          ['Stock', (book.get('Stock') ?? 0) + moved('Stock')], ['Debtors', (book.get('Debtors') ?? 0) + moved('Debtors')], ['Bank', (book.get('Bank') ?? 0) + capital + premium - withdrawn],
        ];
        const pool = (book.get('General Reserve') ?? 0) - (book.get('Goodwill') ?? 0) + sum(changes.map((c) => c.effect));
        const liabilities: [string, number][] = [
          ['Creditors', (book.get('Creditors') ?? 0) + moved('Creditors')], ['Outstanding Expenses', moved('Outstanding Expenses')],
          ...d.olds.map((name, i): [string, number] => [`${name}'s Capital`, (book.get(`${name}'s Capital`) ?? NaN) + pool * d.shares[i] + premium * (d.given[i] / d.share) - (withdrawn * d.given[i]) / d.share]),
          [`${/([A-Z][a-z]+) brings ₹[\d,]+ as capital/.exec(text)?.[1] ?? ''}'s Capital`, capital],
        ];
        const holds = (side: 0 | 1, want: [string, number][]): boolean => {
          const shown = want.filter(([, v]) => !near(v, 0));
          return q.sides[side].rows.length === shown.length && shown.every(([label, v]) => near((q.sides[side].rows.find((r) => r.label === label)?.amounts[0] ?? NaN) / 100, v));
        };
        return holds(0, liabilities) && holds(1, assets) && near(sum(liabilities.map(([, v]) => v)), sum(assets.map(([, v]) => v)));
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 8. Retirement: Revaluation A/c, then the capital accounts in columns, then the balance sheet (complex)
// ---------------------------------------------------------------------------------------------------------------

interface RetChain {
  f: RET.Firm;
  opening: string;
  g: RET.Gain;
  made: RET.Change[];
  V: number;
  R: number;
  E: number;
  G: number;
  bs: { building: number; machinery: number; stock: number; debtors: number; creditors: number; bank: number };
  K: number[];
  due: number;
  paid: number;
}

const retirementChain = caseTemplate<RetChain>({
  id: 'case-recon-chain-retirement',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Retirement: revaluation, capitals and the new balance sheet',
  setup: (rng) =>
    RET.attempt(14, () => {
      const f = RET.firm(rng);
      const g = RET.gainOf(rng, f, ['silent', 'split', 'agreed', 'one']);
      if (!g) return null;
      const unit = f.total * 1000;
      const made = RET.changesOf(rng, f.total * 500, 3);
      if (!made || !made.some((c) => c.sign > 0) || !made.some((c) => c.sign < 0)) return null;
      const V = sum(made.map((c) => c.sign * c.amount));
      const R = RET.mult(rng, unit, 30000, 240000);
      const G = RET.mult(rng, f.total * sum(g.w) * 1000, 60000, 480000);
      const E = rng.int(0, 3) === 0 ? RET.mult(rng, unit, 20000, 100000) : 0;
      if (V === 0 || R === null || G === null || E === null || E >= G) return null;
      const change = (kind: RET.ChangeKind): RET.Change | undefined => made.find((c) => c.kind === kind);
      const bs = {
        building: change('building')?.book ?? rng.step(300000, 800000, 50000),
        machinery: change('machinery')?.book ?? rng.step(200000, 500000, 20000),
        stock: change('stock')?.book ?? rng.step(120000, 320000, 10000),
        debtors: change('debtors')?.book ?? rng.step(80000, 300000, 10000),
        creditors: change('creditors')?.book ?? rng.step(90000, 240000, 10000),
        bank: rng.step(60000, 300000, 10000),
      };
      const capitalTotal = E + bs.building + bs.machinery + bs.stock + bs.debtors + bs.bank - bs.creditors - R;
      const weights = f.names.map(() => rng.int(3, 6));
      const K = weights.map((w) => Math.floor((capitalTotal * w) / sum(weights) / 10000) * 10000);
      K[2] = capitalTotal - K[0] - K[1];
      if (K.some((k) => k < 150000)) return null;
      const o = f.names.indexOf(f.out);
      const { s, parts: gw } = RET.goodwillParts(f, g, G);
      const share = RET.inOld(f, R - E + V);
      const due = K[o] + share[o] + s;
      const paid = rng.int(0, 1) === 0 ? (RET.clean(rng, 30000, bs.bank - 30000, 10000, (v) => v <= 0.5 * due) ?? 0) : 0;
      // Each continuing partner is left with a believable capital.
      if (f.stay.some((name, i) => K[f.names.indexOf(name)] + share[f.names.indexOf(name)] - gw[i] < 50000)) return null;
      return { f, opening: RET.intro(rng, f), g, made, V, R, E, G, bs, K, due, paid };
    }),
  context: (s) => {
    const { f, bs } = s;
    return [
      `${s.opening} ${RET.FLUCTUATING} ${f.out} retires on ${RETIRE_ON}; ${s.g.text}.`,
      `Balance Sheet of ${RET.list(f.names)} as at ${RETIRE_ON}, before the retirement:`,
      'Liabilities:',
      `Creditors: ${inr(bs.creditors)}`,
      `General Reserve: ${inr(s.R)}`,
      ...f.names.map((name, i) => `${name}'s Capital: ${inr(s.K[i])}`),
      'Assets:',
      ...(s.E > 0 ? [`Goodwill: ${inr(s.E)}`] : []),
      `Building: ${inr(bs.building)}`,
      `Machinery: ${inr(bs.machinery)}`,
      `Stock: ${inr(bs.stock)}`,
      `Debtors: ${inr(bs.debtors)}`,
      `Bank: ${inr(bs.bank)}`,
      `On ${f.out}'s retirement it is agreed that:`,
      ...s.made.map((c) => c.text),
      RET.RESERVE_IN_FULL,
      `The goodwill of the firm is valued at ${inr(s.G)}. ${RET.goodwillRule(s.E > 0)}`,
      s.paid > 0 ? `${inr(s.paid)} is paid to ${f.out} at once by cheque, and the rest of the amount due is transferred to ${f.out}'s Loan A/c.` : `Nothing is paid to ${f.out} at once: the whole amount due is transferred to ${f.out}'s Loan A/c.`,
    ].join('\n');
  },
  parts: [
    {
      kind: 'account',
      make: (s) => {
        const { f } = s;
        const profit = s.V > 0;
        const entries = [...s.made.map((c) => ({ date: RETIRE_ON, lines: RET.changeLines(c) })), { date: RETIRE_ON, lines: RET.revaluationTransfer(f, s.V) }];
        const losses = s.made.filter((c) => c.sign < 0);
        const gains = s.made.filter((c) => c.sign > 0);
        return {
          task: `Prepare the Revaluation Account on ${f.out}'s retirement on ${RETIRE_ON}, closing it by transfer to the capital accounts of the partners.`,
          title: 'Revaluation A/c',
          ...revaluationSides(entries, f.names, profit),
          distractors: [...f.names.map((name) => RET.transferRow(name, !profit)), 'Balance c/d', 'General Reserve A/c', 'Goodwill A/c', ...(s.made.some((c) => c.kind === 'debtors') ? ['Debtors A/c'] : [])],
          explanation: [
            ...s.made.map((c) => (c.sign > 0 ? `${c.work}: a gain, credited ("By ${ledgerLabel(c.accountId)}").` : `${c.work}: a loss, debited ("To ${ledgerLabel(c.accountId)}").`)),
            `Debit side (losses) = ${RET.added(losses.map((c) => c.amount))}; credit side (gains) = ${RET.added(gains.map((c) => c.amount))}.`,
            `The ${profit ? 'credit' : 'debit'} side is the larger by ${inr(Math.abs(s.V))}: a ${profit ? 'profit' : 'loss'} on revaluation.`,
            `The values changed while ${f.out} was a partner, so all three share the ${profit ? 'profit' : 'loss'} in the old ratio ${RET.rt(f.old)}: ${RET.named(f.names, RET.inOld(f, Math.abs(s.V)))}.`,
            `Each share is a row of its own on the ${profit ? 'debit' : 'credit'} side ("${profit ? 'To' : 'By'} ${RET.transferRow(f.names[0], profit)}"; "${f.names[0]}'s Capital A/c" alone is accepted too), which closes the account.`,
          ],
          hints: [RET.SET_HINTS.retire[0], 'Losses are debited and gains credited. The difference is shared by all the partners, the retiring partner included, in the old ratio.'],
        };
      },
      verify: (q: AccountQuestion) => {
        const g = RET.readFirm(q.data.split('\n')[0]);
        const old = RET.ratiosIn(q.data.split('\n')[0])[0];
        return g !== null && old !== undefined && revaluationHoldsFor(q, g.names, old);
      },
    },
    {
      kind: 'account',
      make: (s) => {
        const { f, g } = s;
        const profit = s.V > 0;
        const settle: RET.Settle = s.paid > 0 ? { kind: 'part', paid: s.paid } : { kind: 'loan' };
        const entries = [
          ...(s.E > 0 ? [RET.stepGoodwillOff(f, s.E)] : []),
          RET.stepAccumulated(f, RET.ACCUMULATED.reserve, s.R),
          RET.stepRevaluation(f, s.V, ''),
          RET.stepGoodwill(f, g, s.G),
          RET.stepSettle(f, s.due, settle, ''),
        ].map((step) => ({ date: RETIRE_ON, lines: step.lines }));
        const view = columnarAccount(entries, f.names.map(partnerCapital), { date: RETIRE_ON, balances: s.K.map((k) => ({ side: 'Cr' as const, amount: rupees(k) })) }, (id) =>
          id === 'revaluation' ? ADM.revaluationRow(profit) : ledgerLabel(id),
        );
        const o = f.names.indexOf(f.out);
        if (view.balances.some((b, i) => (i === o ? b !== null : b === null || b.side !== 'Cr'))) return null;
        const sides = columnarSides(view, { closeOn: RETIRE_ON });
        const { s: gs, parts: gw } = RET.goodwillParts(f, g, s.G);
        const share = (v: number): number[] => RET.inOld(f, v);
        return {
          task: `Prepare the capital accounts of the partners in columns on ${f.out}'s retirement, taking the profit or loss on revaluation from the Revaluation Account; close ${f.out}'s account and carry down the balances of ${RET.list(f.stay)}.`,
          title: "Partners' Capital Accounts",
          columns: partnerColumns(f.names),
          left: { ...sides.left, rows: ADM.plainRevaluation(sides.left.rows) },
          right: { ...sides.right, rows: ADM.plainRevaluation(sides.right.rows) },
          distractors: [...(s.E > 0 ? [] : ['Goodwill A/c']), ADM.revaluationRow(!profit), 'Premium for Goodwill A/c', `${f.out}'s Executor's A/c`, 'Profit and Loss Appropriation A/c', ...(s.paid > 0 ? [] : ['Bank A/c'])],
          explanation: [
            'Each partner has a column. A capital is a credit balance, so the capitals open the credit side ("By Balance b/d").',
            ...(s.E > 0 ? [`The goodwill in the books, ${inr(s.E)}, is written off among all three in the old ratio ("To Goodwill A/c"): ${RET.named(f.names, share(s.E))}.`] : []),
            `The whole of the General Reserve, ${inr(s.R)}, goes to all three in the old ratio ${RET.rt(f.old)} ("By General Reserve A/c"): ${RET.named(f.names, share(s.R))}.`,
            `The ${profit ? 'profit' : 'loss'} on revaluation, ${inr(Math.abs(s.V))}, from the Revaluation Account, is shared in the same ratio ("${profit ? 'By' : 'To'} ${ADM.revaluationRow(profit)}"; "Revaluation A/c" alone is accepted too): ${RET.named(f.names, share(Math.abs(s.V)))}.`,
            `${f.out}'s share of goodwill = ${inr(s.G)} x ${RET.fr(f.x, f.total)} = ${inr(gs)}. ${g.why}: ${f.stay.map((name, i) => (gw[i] > 0 ? `${name} ${inr(gw[i])}` : '')).filter((x) => x !== '').join(', ')}, debited "To ${f.out}'s Capital A/c" and credited in ${f.out}'s column.`,
            `${f.out}'s column comes to ${inr(s.due)}.${s.paid > 0 ? ` ${inr(s.paid)} is paid by cheque ("To Bank A/c") and the rest, ${inr(s.due - s.paid)},` : ' The whole of it'} is transferred "To ${f.out}'s Loan A/c", which closes the column.`,
            `The balances of ${RET.list(f.stay)} are carried down ("To Balance c/d"): ${f.stay.map((name) => `${name} ${inr((view.balances[f.names.indexOf(name)]?.amount ?? 0) / 100)}`).join(', ')}.`,
          ],
          hints: RET.SET_HINTS.retire,
        };
      },
      verify: (q: AccountQuestion) => {
        const text = q.data;
        const first = text.split('\n')[0];
        const g = RET.readFirm(first);
        const gain = g && RET.readGain(first, g);
        if (!g || !gain) return false;
        const book = sheetOf(text);
        const pool = (book.get('General Reserve') ?? 0) - (book.get('Goodwill') ?? 0) + sum(revaluedLines(text).map((c) => c.effect));
        const G = amountAfter(text, /goodwill of the firm is valued at ₹[\d,]+/);
        const paid = amountAfter(text, /^₹[\d,]+ is paid to/m);
        const o = g.names.indexOf(g.out);
        const due = (book.get(`${g.out}'s Capital`) ?? NaN) + (pool + G) * g.x;
        return (
          g.stay.every((name, i) => near(columnFigure(q, 0, (r) => r.closing === true, g.names.indexOf(name)), (book.get(`${name}'s Capital`) ?? NaN) + pool * g.stayShare[i] - G * gain[i])) &&
          near(columnFigure(q, 0, (r) => r.label === `${g.out}'s Loan A/c`, o), due - paid) &&
          near(columnFigure(q, 0, (r) => r.label === 'Bank A/c', o), paid)
        );
      },
    },
    {
      kind: 'account',
      make: (s) => {
        const { f, g, bs } = s;
        const settle: RET.Settle = s.paid > 0 ? { kind: 'part', paid: s.paid } : { kind: 'loan' };
        const opening = post([
          [
            ...(s.E > 0 ? [dr('goodwill', s.E)] : []),
            dr('building', bs.building), dr('machinery', bs.machinery), dr('stock', bs.stock), dr('debtors', bs.debtors), dr('bank', bs.bank),
            cr('creditors', bs.creditors), cr('generalReserve', s.R),
            ...f.names.map((name, i) => cr(partnerCapital(name), s.K[i])),
          ],
        ]);
        const ledger = post(
          [
            ...s.made.map(RET.changeLines),
            RET.revaluationTransfer(f, s.V),
            RET.stepAccumulated(f, RET.ACCUMULATED.reserve, s.R).lines,
            ...(s.E > 0 ? [RET.stepGoodwillOff(f, s.E).lines] : []),
            RET.stepGoodwill(f, g, s.G).lines,
            RET.stepSettle(f, s.due, settle, '').lines,
          ],
          opening,
        );
        if (['revaluation', 'generalReserve', 'goodwill', partnerCapital(f.out)].some((id) => balanceOf(ledger, id) !== null)) return null;
        const rows = sheetRows(
          ledger,
          [['creditors', 'Creditors'], ['outstandingExpenses', 'Outstanding Expenses'], [partnerLoan(f.out), `${f.out}'s Loan`], ...f.stay.map((name): [string, string] => [partnerCapital(name), `${name}'s Capital`])],
          [['building', 'Building'], ['machinery', 'Machinery'], ['investments', 'Investments'], ['stock', 'Stock'], ['debtors', 'Debtors'], ['bank', 'Bank']],
          bs.debtors,
        );
        if (!rows) return null;
        const total = sum(rows.left.map((r) => r.amount ?? 0)) / 100;
        const who = RET.list(f.stay);
        return {
          task: `Prepare the Balance Sheet of ${who} as at ${RETIRE_ON}, immediately after ${f.out}'s retirement, taking the capitals and ${f.out}'s loan from the capital accounts; show debtors less any provision for doubtful debts as one figure.`,
          title: `Balance Sheet of ${who} as at ${RETIRE_ON}`,
          left: { title: 'Liabilities', rows: rows.left },
          right: { title: 'Assets', rows: rows.right },
          distractors: ['General Reserve', 'Goodwill', `${f.out}'s Capital`, 'Provision for Doubtful Debts', 'Profit on Revaluation', 'Loss on Revaluation'],
          explanation: [
            `Assets and liabilities stand at their new values: ${s.made.map((c) => c.work).join('; ')}.`,
            `The General Reserve and the result of revaluation have gone to the capital accounts, goodwill is not an asset of the new firm, and ${f.out}'s Capital A/c is closed: none of them is a row here.`,
            `${f.out}'s Loan is what the capital account transferred to it, ${inr(s.due - s.paid)}: a liability of the firm.`,
            `The capitals of ${who} are the balances carried down: ${rows.left.filter((r) => /'s Capital$/.test(r.label)).map((r) => `${r.label} ${formatINR(r.amount ?? 0)}`).join('; ')}.`,
            `Bank = ${s.paid > 0 ? `${inr(bs.bank)} - ${inr(s.paid)} = ${inr(bs.bank - s.paid)}` : `${inr(bs.bank)}, unchanged, as nothing is paid at once`}.`,
            `Each side totals ${inr(total)}.`,
          ],
          hints: [
            'Work in three steps: the Revaluation Account, then the capital accounts, then the balance sheet of the partners who continue.',
            "The reserve, goodwill and the retiring partner's capital do not appear in the new balance sheet; the retiring partner's loan does. The bank falls by any cheque paid.",
          ],
        };
      },
      verify: (q: AccountQuestion) => {
        const text = q.data;
        const first = text.split('\n')[0];
        const g = RET.readFirm(first);
        const gain = g && RET.readGain(first, g);
        if (!g || !gain) return false;
        const book = sheetOf(text);
        const changes = revaluedLines(text);
        const moved = (row: string): number => sum(changes.filter((c) => c.row === row).map((c) => c.delta));
        const pool = (book.get('General Reserve') ?? 0) - (book.get('Goodwill') ?? 0) + sum(changes.map((c) => c.effect));
        const G = amountAfter(text, /goodwill of the firm is valued at ₹[\d,]+/);
        const paid = amountAfter(text, /^₹[\d,]+ is paid to/m);
        const due = (book.get(`${g.out}'s Capital`) ?? NaN) + (pool + G) * g.x;
        const assets: [string, number][] = [
          ['Building', (book.get('Building') ?? 0) + moved('Building')], ['Machinery', (book.get('Machinery') ?? 0) + moved('Machinery')], ['Investments', moved('Investments')],
          ['Stock', (book.get('Stock') ?? 0) + moved('Stock')], ['Debtors', (book.get('Debtors') ?? 0) + moved('Debtors')], ['Bank', (book.get('Bank') ?? 0) - paid],
        ];
        const liabilities: [string, number][] = [
          ['Creditors', (book.get('Creditors') ?? 0) + moved('Creditors')], ['Outstanding Expenses', moved('Outstanding Expenses')], [`${g.out}'s Loan`, due - paid],
          ...g.stay.map((name, i): [string, number] => [`${name}'s Capital`, (book.get(`${name}'s Capital`) ?? NaN) + pool * g.stayShare[i] - G * gain[i]]),
        ];
        const holds = (side: 0 | 1, want: [string, number][]): boolean => {
          const shown = want.filter(([, v]) => !near(v, 0));
          return q.sides[side].rows.length === shown.length && shown.every(([label, v]) => near((q.sides[side].rows.find((r) => r.label === label)?.amounts[0] ?? NaN) / 100, v));
        };
        return holds(0, liabilities) && holds(1, assets) && near(sum(liabilities.map(([, v]) => v)), sum(assets.map(([, v]) => v)));
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 9. Death: the deceased partner's capital account, then the executor's account over two years (complex). The
//    amount due is the closing row of the capital account; the executor's account starts from it, and the case text
//    does not print it. The drawings are the figure that makes the amount due come out at instalments on which every
//    figure of interest is a round one.
// ---------------------------------------------------------------------------------------------------------------

interface DeathChain {
  f: RET.Firm;
  opening: string;
  g: RET.Gain;
  date: { text: string; months: number };
  K: number;
  r: number;
  interest: number;
  G: number;
  bySales: boolean;
  rate: number;
  S: number;
  P: number;
  S2: number;
  profit: number;
  kind: 'reserve' | 'loss' | 'none';
  A: number;
  drawn: number;
  onDrawn: number;
  due: number;
  agreed: boolean;
  rate2: number;
  count: number;
  instalment: number;
  paid: number;
}

/** The amount due to the executor, worked out again from the printed case: capital, interest, profit and shares, less drawings and interest on them. */
function dueFromText(text: string): number | null {
  const k = readDeath(text);
  if (!k) return null;
  const loss = amountAfter(text, /^Profit and Loss A\/c \(debit balance\): ₹[\d,]+/m);
  const onDrawn = amountAfter(text, /^Interest on [A-Z][a-z]+'s drawings: ₹[\d,]+/m);
  return k.K * (1 + (k.r * k.m) / 1200) + k.profit + (k.G + k.R - loss) * k.x - k.drawn - onDrawn;
}

const deathChain = caseTemplate<DeathChain>({
  id: 'case-recon-chain-death',
  // 2: the context names the account that interest on capital to the date of death goes through.
  version: 2,
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: "Death: the capital account and the executor's account",
  setup: (rng) =>
    RET.attempt(10, () => {
      const f = RET.firm(rng);
      const g = RET.gainOf(rng, f, ['silent', 'silent', 'split', 'agreed', 'one']);
      if (!g) return null;
      const date = rng.pick(RET.DATES_2025);
      const m = date.months;
      const after = 12 - m;
      const K = 60000 * rng.int(2, 10);
      const rates = [5, 6, 8, 10, 12].filter((v) => (K * v * m) % 120000 === 0);
      if (rates.length === 0) return null;
      const r = rng.pick(rates);
      const G = RET.mult(rng, f.total * sum(g.w) * 1000, 60000, 720000);
      const bySales = rng.int(0, 1) === 0;
      const rate = rng.pick([8, 10, 12, 15, 20, 25]);
      const S = 100000 * rng.int(8, 30);
      const P = bySales ? (S * rate) / 100 : RET.profitForTime(rng, f, m);
      const S2 = bySales ? RET.salesForShare(rng, f, S, m, rate) : 0;
      const kind = rng.pick(['reserve', 'reserve', 'loss', 'none'] as const);
      const A = kind === 'none' ? 0 : RET.mult(rng, f.total * 1000, 30000, 200000);
      if (G === null || P === null || S2 === null || A === null) return null;
      const charged = rng.int(0, 1) === 0;
      const interest = (K * r * m) / 1200;
      const profit = bySales ? (S2 * rate * f.x) / (100 * f.total) : (P * m * f.x) / (12 * f.total);
      const { s } = RET.goodwillParts(f, g, G);
      const part = (v: number): number => (v * f.x) / f.total;
      const before = K + interest + profit + s + (kind === 'reserve' ? part(A) : 0) - (kind === 'loss' ? part(A) : 0);
      const agreed = rng.int(0, 3) > 0;
      const rate2 = agreed ? rng.pick([8, 9, 10, 12]) : 6;
      const count = rng.pick([2, 3]);
      const paid = rng.int(0, 1) === 0 ? rng.step(50000, 150000, 10000) : 0;
      // Instalments in ten thousands on which the interest of the months before the payment day, and of the months
      // after it, is in round hundreds, and which leave drawings of a believable size: a whole thousand, with the
      // interest on them (when it is charged) a few hundred rupees, what a rate of 3% to 12% p.a. gives on drawings
      // spread over the months before the death (on average half of them).
      const fits: { instalment: number; drawn: number; onDrawn: number }[] = [];
      for (let v = 40000; v <= 300000; v += 10000) {
        const rest = before - (v * count + paid);
        const drawn = charged ? Math.floor((rest - 500) / 1000) * 1000 : rest;
        const onDrawn = rest - drawn;
        const fairInterest = onDrawn === 0 || (onDrawn * 800 >= drawn * m && onDrawn * 200 <= drawn * m);
        if ((v * rate2 * m) % 120000 === 0 && (v * rate2 * after) % 120000 === 0 && drawn >= 10000 && drawn <= 80000 && drawn % 1000 === 0 && fairInterest) fits.push({ instalment: v, drawn, onDrawn });
      }
      if (fits.length === 0) return null;
      const { instalment, drawn, onDrawn } = rng.pick(fits);
      // Two rows of the second year with the same particulars and the same figure could not be told apart.
      if ((instalment * count * rate2 * m) / 1200 === (instalment * (count - 1) * rate2 * after) / 1200) return null;
      return { f, opening: RET.intro(rng, f), g, date, K, r, interest, G, bySales, rate, S, P, S2, profit, kind, A, drawn, onDrawn, due: instalment * count + paid, agreed, rate2, count, instalment, paid };
    }),
  context: (s) => {
    const { f, date } = s;
    const day = date.text.replace(/ \d{4}$/, '');
    const year = Number(date.text.slice(-4));
    return [
      `${s.opening} ${RET.FLUCTUATING} ${RET.CLOSES} ${f.out} died on ${date.text}; ${s.g.text}.`,
      `Under the partnership deed the executor of a deceased partner is entitled to the capital, interest on it up to the date of death (recorded through Interest on Capital A/c), the share of profit from the last balance sheet to the date of death (worked out ${
        s.bySales ? 'on the sales of that period at the rate of profit on sales earned in the previous year' : 'on the basis of time from the profit of the previous year'
      }), the share of goodwill (adjusted through the capital accounts without opening Goodwill A/c) and the share, in the old ratio, of any reserve or accumulated profit or loss.`,
      `${f.out}'s capital on 1 April 2025: ${inr(s.K)}`,
      `Interest on capital: ${s.r}% p.a.`,
      ...(s.bySales ? RET.salesRows(s.S, s.P, s.S2).split('\n') : [`Profit for the year ended 31 March 2025: ${inr(s.P)}`]),
      `Goodwill of the firm, valued on the death: ${inr(s.G)}`,
      ...(s.kind === 'reserve' ? [`General Reserve: ${inr(s.A)} (the whole of it is distributed among all the partners)`] : s.kind === 'loss' ? [`Profit and Loss A/c (debit balance): ${inr(s.A)} (the whole of it is written off among all the partners)`] : []),
      `${f.out}'s drawings from 1 April 2025 to the date of death: ${inr(s.drawn)}`,
      ...(s.onDrawn > 0 ? [`Interest on ${f.out}'s drawings: ${inr(s.onDrawn)}`] : []),
      `The amount due is transferred to ${f.out}'s Executor's A/c.${s.paid > 0 ? ` ${inr(s.paid)} is paid to the executor by cheque on the date of death.` : ''} The ${s.paid > 0 ? 'balance' : 'amount'} is paid in ${s.count} equal annual instalments of principal on ${day} each year, the first in ${year + 1}, each by cheque together with all the interest due up to that day.`,
      s.agreed ? `Simple interest at ${s.rate2}% p.a. is charged on the principal outstanding.` : 'No rate of interest was agreed, and the executor chose interest rather than a share of the later profits. Interest is simple, on the principal outstanding.',
      `Interest is credited to ${f.out}'s Executor's A/c on each 31 March, for the months since the death or the last payment, and on the day of each payment, for the months since 31 March, before the cheque is entered.`,
    ].join('\n');
  },
  parts: [
    {
      kind: 'account',
      make: (s) => {
        const { f, g, date } = s;
        const m = date.months;
        const dead = date.text;
        const capital = partnerCapital(f.out);
        const drawings = partnerDrawings(f.out);
        const part = (v: number): number => (v * f.x) / f.total;
        const { s: gs, parts: gw } = RET.goodwillParts(f, g, s.G);
        const entries: DatedEntry[] = [
          ...(s.kind === 'none' ? [] : [{ date: dead, lines: RET.stepAccumulated(f, s.kind === 'reserve' ? RET.ACCUMULATED.reserve : RET.ACCUMULATED.loss, s.A).lines }]),
          { date: dead, lines: [dr('interestOnCapital', s.interest), cr(capital, s.interest)] },
          { date: dead, lines: [dr('profitAndLossSuspense', s.profit), cr(capital, s.profit)] },
          { date: dead, lines: RET.stepGoodwill(f, g, s.G).lines },
          { date: dead, lines: [dr(capital, s.drawn), cr(drawings, s.drawn)] },
          ...(s.onDrawn > 0 ? [{ date: dead, lines: [dr(capital, s.onDrawn), cr('interestOnDrawings', s.onDrawn)] }] : []),
          { date: dead, lines: [dr(capital, s.due), cr(executor(f.out), s.due)] },
        ];
        const view = accountOf(entries, capital, { date: '1 April 2025', side: 'Cr', amount: rupees(s.K) }, (id) => (id === drawings ? 'Drawings A/c' : ledgerLabel(id)));
        if (view.balance !== null) return null;
        const sides = ledgerSides(view, { closeOn: dead });
        const executorRow = ledgerLabel(executor(f.out));
        const payers = f.stay.filter((_, i) => gw[i] > 0);
        return {
          task: `Prepare ${f.out}'s Capital A/c up to the date of death, ${dead}, closing it by transfer to ${f.out}'s Executor's A/c.`,
          title: `${f.out}'s Capital A/c`,
          left: { ...sides.left, rows: sides.left.rows.map((row) => (row.label === executorRow ? { ...row, closing: true } : row)) },
          right: sides.right,
          distractors: [`${f.out}'s Capital A/c`, 'Profit and Loss Appropriation A/c', `${f.out}'s Loan A/c`, 'Goodwill A/c', 'Balance c/d', 'Bank A/c', ...(s.kind === 'loss' ? [] : ['Profit and Loss A/c'])],
          explanation: [
            `The account opens with the capital on the credit side ("By Balance b/d"). 1 April 2025 to ${dead} is ${m} months.`,
            ...(s.kind === 'reserve' ? [`The General Reserve belongs to all three in the old ratio: ${f.out}'s share = ${inr(s.A)} x ${RET.fr(f.x, f.total)} = ${inr(part(s.A))} ("By General Reserve A/c").`] : []),
            ...(s.kind === 'loss' ? [`The debit balance of Profit and Loss A/c is a loss of all three in the old ratio: ${f.out}'s share = ${inr(s.A)} x ${RET.fr(f.x, f.total)} = ${inr(part(s.A))} ("To Profit and Loss A/c").`] : []),
            `Interest on capital = ${inr(s.K)} x ${s.r}% x ${m}/12 = ${inr(s.interest)} ("By Interest on Capital A/c").`,
            s.bySales
              ? `Rate of profit on sales last year = ${inr(s.P)} / ${inr(s.S)} x 100 = ${s.rate}%; profit on the sales up to the date of death = ${inr(s.S2)} x ${s.rate}% = ${inr((s.S2 * s.rate) / 100)}; ${f.out}'s share = ${inr(s.profit)} ("By Profit and Loss Suspense A/c").`
              : `Share of profit for the ${m} months = ${inr(s.P)} x ${m}/12 x ${RET.fr(f.x, f.total)} = ${inr(s.profit)} ("By Profit and Loss Suspense A/c").`,
            `Share of goodwill = ${inr(s.G)} x ${RET.fr(f.x, f.total)} = ${inr(gs)}. ${g.why}. ${payers.length === 1 ? `It is credited "By ${payers[0]}'s Capital A/c".` : `It is credited in two rows: ${f.stay.map((name, i) => `"By ${name}'s Capital A/c" ${inr(gw[i])}`).join(' and ')}.`}`,
            `The drawings${s.onDrawn > 0 ? ' and the interest on them' : ''} reduce what is owed ("To Drawings A/c" ${inr(s.drawn)}${s.onDrawn > 0 ? `, "To Interest on Drawings A/c" ${inr(s.onDrawn)}` : ''}).`,
            `The balance, ${inr(s.due)}, is transferred "To ${executorRow}", which closes the account.`,
          ],
          hints: [
            'List what the estate is entitled to (credit side) and what the partner has taken or must bear (debit side). For how many months do interest and the share of profit run?',
            "Credit: capital, interest on capital, share of profit (through Profit and Loss Suspense A/c), share of goodwill and of reserves. Debit: drawings, interest on drawings and any share of a loss. The balance goes to the Executor's A/c.",
          ],
        };
      },
      verify: (q: AccountQuestion) => {
        const due = dueFromText(q.data);
        const out = /([A-Z][a-z]+) died on/.exec(q.data)?.[1] ?? '';
        const transfer = q.sides[0].rows.find((r) => r.label === `${out}'s Executor's A/c`);
        const opening = q.sides[1].rows.find((r) => r.label === 'Balance b/d');
        const total = (side: 0 | 1): number => sum(q.sides[side].rows.map((r) => r.amounts[0])) / 100;
        return due !== null && transfer !== undefined && opening !== undefined && near(transfer.amounts[0] / 100, due) && near(opening.amounts[0] / 100, readDeath(q.data)?.K ?? NaN) && near(total(0), total(1));
      },
    },
    {
      kind: 'account',
      make: (s) => {
        const { f, date } = s;
        const before = date.months;
        const after = 12 - before;
        const day = date.text.replace(/ \d{4}$/, '');
        const year = Number(date.text.slice(-4));
        const principal = s.instalment * s.count;
        const account = executor(f.out);
        const interestOn = (p: number, months: number): number => (p * s.rate2 * months) / 1200;
        const credit = (on: string, amount: number): DatedEntry => ({ date: on, lines: [dr('interestOnLoan', amount), cr(account, amount)] });
        const first = interestOn(principal, after);
        const paidOn = `${day} ${year + 1}`;
        const toDay = interestOn(principal, before);
        const wholeYear = (principal * s.rate2) / 100;
        const left = principal - s.instalment;
        const accrued = interestOn(left, after);
        const entries: DatedEntry[] = [
          { date: date.text, lines: [dr(partnerCapital(f.out), s.due), cr(account, s.due)] },
          ...(s.paid > 0 ? [{ date: date.text, lines: [dr(account, s.paid), cr('bank', s.paid)] }] : []),
          credit('31 March 2026', first),
          credit(paidOn, toDay),
          { date: paidOn, lines: [dr(account, s.instalment + wholeYear), cr('bank', s.instalment + wholeYear)] },
          credit('31 March 2027', accrued),
        ];
        const made = ledgerPeriods(entries, account, [
          { closeOn: '31 March 2026', reopenOn: '1 April 2026', title: `${date.text} to 31 March 2026` },
          { closeOn: '31 March 2027', reopenOn: '1 April 2027', title: 'Year ended 31 March 2027' },
        ]);
        const cheques = new Map([[paidOn, [`Instalment ${inr(s.instalment)}`, `Interest for the year ${inr(wholeYear)}`]]]);
        return {
          task: `Prepare ${f.out}'s Executor's A/c from ${date.text} to 31 March 2027, starting from the amount transferred from ${f.out}'s Capital A/c; balance it on each 31 March, bring the balance down on each 1 April, and enter each cheque as one figure.`,
          title: `${f.out}'s Executor's A/c`,
          ...made,
          left: { ...made.left, rows: RET.withCheques(made.left.rows, cheques) },
          right: { ...made.right, rows: RET.withInterestAlso(made.right.rows) },
          later: made.later?.map((p) => ({ ...p, left: RET.withCheques(p.left, cheques), right: RET.withInterestAlso(p.right) })),
          distractors: [`${f.out}'s Executor's A/c`, `${f.out}'s Loan A/c`, 'Interest on Capital A/c', 'Profit and Loss Suspense A/c', 'Cash A/c'],
          explanation: [
            ...(s.agreed ? [] : [`${RET.SECTION_37} The executor of a deceased partner has the same choice.`]),
            `${date.text}: the amount due from the capital account, ${inr(s.due)}, is credited ("By ${f.out}'s Capital A/c").${s.paid > 0 ? ` The cheque of ${inr(s.paid)} is debited ("To Bank A/c"), which leaves a principal of ${inr(principal)}.` : ''} Each instalment = ${inr(principal)} / ${s.count} = ${inr(s.instalment)}.`,
            `31 March 2026: ${date.text} to 31 March 2026 is ${after} months: interest = ${inr(principal)} x ${s.rate2}% x ${after}/12 = ${inr(first)}, credited ("By ${RET.INTEREST_ROW}"). Balance carried down = ${inr(principal)} + ${inr(first)} = ${inr(principal + first)}.`,
            `${paidOn}: interest since 31 March = ${inr(principal)} x ${s.rate2}% x ${before}/12 = ${inr(toDay)}, credited. The cheque pays the instalment and the interest of the whole year on ${inr(principal)}: ${inr(s.instalment)} + ${inr(wholeYear)} = ${inr(s.instalment + wholeYear)} ("To Bank A/c"). Principal left = ${inr(left)}.`,
            `31 March 2027: interest for the ${after} months since the payment = ${inr(left)} x ${s.rate2}% x ${after}/12 = ${inr(accrued)}, credited. Balance carried down = ${inr(left)} + ${inr(accrued)} = ${inr(left + accrued)}.`,
            RET.INTEREST_NAMES,
          ],
          hints: [
            `The first accounting year is a part year: interest runs only from the date of death to 31 March. In the next year there are ${before} months before the payment and ${after} after it.`,
            'On each 31 March credit the interest accrued since the death or the last payment. On the payment day credit the interest since 31 March, then debit the cheque: the instalment and the interest of the whole year.',
          ],
        };
      },
      verify: (q: AccountQuestion) => {
        const text = q.data;
        const due = dueFromText(text);
        const k = readDeath(text);
        if (due === null || !k) return false;
        const paid = amountAfter(text, /₹[\d,]+ is paid to the executor by cheque/);
        const count = Number(/paid in (\d+) equal annual instalments/.exec(text)?.[1]);
        const rate = /Simple interest at (\d+)% p\.a\./.exec(text) ? Number(/Simple interest at (\d+)% p\.a\./.exec(text)?.[1]) : 6;
        const principal = due - paid;
        const instalment = principal / count;
        const after = 12 - k.m;
        const periods: [FormatRow[], FormatRow[]][] = [[q.sides[0].rows, q.sides[1].rows], ...(q.later ?? [])];
        if (periods.length !== 2) return false;
        const row = (rows: FormatRow[], label: string): number => (rows.find((r) => r.label === label)?.amounts[0] ?? NaN) / 100;
        const interest = (rows: FormatRow[]): number => sum(rows.filter((r) => r.label === RET.INTEREST_ROW).map((r) => r.amounts[0])) / 100;
        const atClose = (p: number): number => p + (p * rate * after) / 1200;
        const [[d0, c0], [d1, c1]] = periods;
        const left = principal - instalment;
        return (
          near(row(c0, `${/([A-Z][a-z]+) died on/.exec(text)?.[1]}'s Capital A/c`), due) &&
          near(interest(c0), atClose(principal) - principal) &&
          (paid > 0 ? near(row(d0, 'Bank A/c'), paid) : d0.every((r) => r.label !== 'Bank A/c')) &&
          near(row(d0, 'Balance c/d'), atClose(principal)) &&
          near(row(c1, 'Balance b/d'), atClose(principal)) &&
          near(interest(c1), (principal * rate * k.m) / 1200 + atClose(left) - left) &&
          near(row(d1, 'Bank A/c'), instalment + (principal * rate) / 100) &&
          near(row(d1, 'Balance c/d'), atClose(left)) &&
          near((q.sides[1].below[0]?.amounts[0] ?? NaN) / 100, atClose(left))
        );
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 10. A change in the ratio: the set of entries (reserves, revaluation, goodwill), then the capital accounts in
//     columns with the capitals made proportionate to the new ratio (complex). The items of the set name what is
//     settled and leave the figures to the case text; the profit or loss on revaluation is worked out in the set and
//     not printed.
// ---------------------------------------------------------------------------------------------------------------

interface ChangeChain {
  ch: CPR.Change;
  f: CPR.Firm;
  R: number;
  second: CPR.Held | null;
  D: number;
  B: number;
  G: number;
  items: CPR.RevItem[];
  open: number[];
  stated: boolean;
  total: number;
  viaBank: boolean;
  target: number[];
  need: number[];
  /** The order of the three groups of the set: balances, revaluation, goodwill. */
  order: number[];
}

/** What an item of revaluation is called as an item of a set: what is recorded, without its figures. */
function revItemTask(it: CPR.RevItem): string {
  const name = (id: string): string => ({ building: 'building', land: 'land', machinery: 'machinery', furniture: 'furniture', stock: 'stock', investments: 'investments', computers: 'computer' })[id] ?? id;
  if (it.cr === 'provisionForDoubtfulDebts') return 'Record the provision for doubtful debts.';
  if (it.cr === 'outstandingExpenses') return 'Record the expenses that are outstanding.';
  if (it.dr === 'creditors') return 'Write back the creditors that are no longer payable.';
  if (it.dr === 'accruedIncome') return 'Bring the accrued income into the books.';
  if (it.dr === 'investments' || it.dr === 'computers') return `Bring the unrecorded ${name(it.dr)} into the books.`;
  return it.effect > 0 ? `Record the rise in the value of the ${name(it.dr)}.` : `Record the fall in the value of the ${name(it.cr)}.`;
}

/** What the case text says of the balances closed: "The whole of the General Reserve is distributed ...". */
function closedSays(second: CPR.Held | null): string {
  const more =
    second === null
      ? ''
      : second.id === 'profitAndLoss'
        ? second.credit
          ? ', and so is the whole of the credit balance of Profit and Loss A/c'
          : '; the whole of the debit balance of Profit and Loss A/c is written off'
        : `; the whole of ${second.label} is written off`;
  return `The whole of the General Reserve is distributed among the partners${more}.`;
}

/** The net of an account after the entries of a set, in rupees: a debit is positive. */
const setNet = (q: JournalSetQuestion, accountId: string): number => (post(q.entries.map((e) => e.expected)).get(accountId) ?? 0) / 100;

/** What the case text of the change gives, read back: the shares, the balances shared in the old ratio, goodwill, and the capitals. */
function readChangeChain(text: string): { g: ReturnType<typeof CPR.given>; pool: number; G: number; B: number; R: number; open: number[]; total: number | null } {
  const lines = text.split('\n');
  const g = CPR.given(lines[0]);
  const R = amountAfter(text, /^General Reserve: ₹[\d,]+/m);
  const second = amountAfter(text, /^Profit and Loss A\/c \(credit balance\): ₹[\d,]+/m) - amountAfter(text, /^Profit and Loss A\/c \(debit balance\): ₹[\d,]+/m) - amountAfter(text, /^Advertisement Suspense A\/c: ₹[\d,]+/m);
  const B = amountAfter(text, /^Goodwill: ₹[\d,]+/m);
  const at = lines.findIndex((l) => /it is agreed that:$/.test(l));
  let V = 0;
  for (const line of lines.slice(at + 1)) {
    if (/^The whole of|^The goodwill|^Every change|^After these/.test(line)) continue;
    V += CPR.effectIn(line);
  }
  const fixed = /total capital of the firm being fixed at (₹[\d,]+)/.exec(text);
  return { g, pool: R + second - B + V, G: amountAfter(text, /goodwill of the firm is valued at ₹[\d,]+/), B, R, open: amountsIn(lineOf(text, /^Capital A\/cs:/)), total: fixed ? amountsIn(fixed[1])[0] : null };
}

const changeChain = caseTemplate<ChangeChain>({
  id: 'case-recon-chain-change-ratio',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'A new ratio: the entries and the capitals',
  setup: (rng) =>
    RET.attempt(6, () => {
      const ch = CPR.anyChange(rng, true);
      const f = CPR.firmOf(rng, ch.old, ch.neu);
      const n = f.names.length;
      const taken: number[] = [];
      const fresh = (min: number, max: number): number | null => {
        const v = CPR.pickAmount(rng, min, max, (x) => CPR.fairIn(x, ch.old) && !taken.includes(x) && (x < 100000 || x % 5000 === 0));
        if (v !== null) taken.push(v);
        return v;
      };
      const R = fresh(40000, 300000);
      const second = rng.pick([null, CPR.HELD[1], CPR.HELD[2], CPR.HELD[3]]);
      const D = second ? fresh(20000, 90000) : 0;
      const B = rng.int(0, 2) === 0 ? fresh(20000, 120000) : 0;
      if (R === null || D === null || B === null) return null;
      const G = CPR.pickAmount(rng, B + 40000, 600000, (v) => CPR.fairMove(v, ch));
      const kinds = rng.shuffle([...rng.shuffle(CPR.WORKED_KINDS).slice(0, 2), ...rng.shuffle(CPR.PLAIN_KINDS).slice(0, rng.int(0, 1))]);
      const items = CPR.workedItems(rng, kinds, (v) => v !== 0 && CPR.fairIn(v, ch.old));
      if (G === null || !items) return null;
      // Debtors that need a provision are at least ₹60,000 beside the other figures of the firm.
      if (items.some((it) => it.cr === 'provisionForDoubtfulDebts' && amountsIn(/debtors of ₹[\d,]+/.exec(it.text)?.[0] ?? '₹60000')[0] < 60000)) return null;
      const V = sum(items.map((it) => it.effect));
      const pool = R + (second ? (second.credit ? D : -D) : 0) - B + V;
      const near0 = CPR.capitalsNear(rng, ch);
      if (!near0) return null;
      const stated = rng.int(0, 2) === 0;
      let open: number[];
      let total: number;
      if (stated) {
        open = near0.caps;
        const present = near0.sum + pool;
        const fixedAt = CPR.pickAmount(rng, present - 150000, present + 150000, (v) => v !== present && CPR.splitsBy(v, ch.neu, 10000));
        if (fixedAt === null) return null;
        total = fixedAt;
      } else {
        const first = near0.caps.slice(0, -1);
        const lastCap = CPR.roundAmount(rng, Math.max(80000, near0.caps[n - 1] - 60000), near0.caps[n - 1] + 60000, (v) => CPR.splitsBy(sum(first) + v + pool, ch.neu, 1000));
        if (lastCap === null) return null;
        open = [...first, lastCap];
        total = sum(open) + pool;
      }
      const adjusted = open.map((o, i) => o + (pool * ch.old[i]) / ch.so + (G * ch.d[i]) / ch.L);
      const target = f.names.map((_, i) => CPR.part(total, ch.neu, i));
      const need = target.map((t, i) => t - adjusted[i]);
      if (adjusted.some((a) => a <= 0) || need.filter((x) => x !== 0).length < 2 || need.some((x) => x !== 0 && Math.abs(x) < 5000)) return null;
      return { ch, f, R, second, D, B, G, items, open, stated, total, viaBank: rng.int(0, 1) === 0, target, need, order: rng.shuffle([0, 1, 2]) };
    }),
  context: (s) => {
    const { f } = s;
    const settle = s.viaBank
      ? "A partner whose capital falls short pays the deficiency into the firm's bank account, and a partner with a surplus is paid it by cheque."
      : "The surplus or deficiency of each partner's capital is transferred to that partner's current account, opened for the purpose.";
    return [
      // Capitals whose surplus or deficiency goes to current accounts are not called fluctuating.
      `${f.intro} ${f.change} ${s.viaBank ? 'The capitals are fluctuating.' : "Every adjustment for the change is made through the partners' capital accounts."}`,
      `Balances in the books on 31 March ${f.year}:`,
      `Capital A/cs: ${CPR.eachOf(f.names, s.open)}`,
      `General Reserve: ${inr(s.R)}`,
      ...(s.second ? [`${s.second.label}: ${inr(s.D)}`] : []),
      ...(s.B > 0 ? [`Goodwill: ${inr(s.B)}`] : []),
      `On 1 April ${f.year} it is agreed that:`,
      ...s.items.map((it) => `${CPR.upper(it.text)}.`),
      closedSays(s.second),
      `The goodwill of the firm is valued at ${inr(s.G)}. No Goodwill A/c is to ${s.B > 0 ? 'remain in the books' : 'be opened'}: a partner who gains compensates a partner who sacrifices.`,
      'Every change in the value of an asset or a liability is recorded through Revaluation A/c.',
      `After these adjustments the capitals are to be made proportionate to the new profit-sharing ratio, ${s.stated ? `the total capital of the firm being fixed at ${inr(s.total)}` : 'on the total capital of the firm as it then stands'}. ${settle}`,
    ].join('\n');
  },
  parts: [
    {
      kind: 'journal_set',
      make: (s) => {
        const { ch, f } = s;
        const names = f.names;
        const balances: CPR.SetItem[] = [
          { ...CPR.heldItem(CPR.HELD[0], s.R, ch, names, false), text: 'Distribute the whole of the General Reserve among the partners.' },
          ...(s.second
            ? [
                {
                  ...CPR.heldItem(s.second, s.D, ch, names, false),
                  text: s.second.id === 'profitAndLoss' ? (s.second.credit ? 'Distribute the whole of the credit balance of Profit and Loss A/c.' : 'Write off the whole of the debit balance of Profit and Loss A/c.') : `Write off the whole of ${s.second.label}.`,
                },
              ]
            : []),
        ];
        const revaluation: CPR.SetItem[] = [
          ...s.items.map((it) => ({ ...CPR.revSetItem(it), text: revItemTask(it) })),
          { ...CPR.transferItem(ch, names, false, s.items.map((it) => it.effect)), text: 'Close Revaluation A/c, transferring its profit or loss to the partners.' },
        ];
        const goodwill: CPR.SetItem[] = [
          ...(s.B > 0 ? [{ ...CPR.writeOffItem(ch, names, s.B, false), text: 'Write off the goodwill that appears in the books.' }] : []),
          { ...CPR.goodwillItem(ch, names, s.G, false), text: 'Adjust the goodwill of the firm between the partners.' },
        ];
        const groups = [balances, revaluation, goodwill];
        return {
          task: 'Pass the journal entries for the reserves, the revaluation and goodwill on the change in the profit-sharing ratio.',
          transactions: s.order.flatMap((k) => groups[k]).map((it, t) => ({ label: `(${'abcdefgh'[t]})`, ...it })),
          hints: [CPR.H.reserves[1], CPR.H.revaluation[1]],
          distractorAccounts: ['profitAndLossAppropriation', 'debtors', partnerCurrent(names[0]), ...(s.B > 0 ? [] : ['goodwill']), ...(s.second?.id === 'profitAndLoss' ? [] : ['profitAndLoss'])],
        };
      },
      verify: (q: JournalSetQuestion) => {
        const k = readChangeChain(q.context ?? '');
        const { g } = k;
        return (
          setHolds()(q) &&
          near(setNet(q, 'revaluation'), 0) &&
          near(setNet(q, 'generalReserve'), k.R) &&
          near(setNet(q, 'goodwill'), -k.B) &&
          g.names.every((name, i) => near(-setNet(q, partnerCapital(name)), k.pool * g.old[i] + k.G * g.give[i]))
        );
      },
    },
    {
      kind: 'account',
      make: (s) => {
        const { ch, f } = s;
        const names = f.names;
        const day = `1 April ${f.year}`;
        const V = sum(s.items.map((it) => it.effect));
        const profit = V > 0;
        const other = (name: string): string => (s.viaBank ? 'bank' : partnerCurrent(name));
        const entries: DatedEntry[] = [
          CPR.heldItem(CPR.HELD[0], s.R, ch, names, false).lines,
          ...(s.second ? [CPR.heldItem(s.second, s.D, ch, names, false).lines] : []),
          ...(s.B > 0 ? [CPR.writeOffItem(ch, names, s.B, false).lines] : []),
          CPR.transferItem(ch, names, false, s.items.map((it) => it.effect)).lines,
          CPR.compensation(ch, names, s.G, false),
          ...names.flatMap((name, i) => (s.need[i] === 0 ? [] : [s.need[i] > 0 ? [dr(other(name), s.need[i]), cr(partnerCapital(name), s.need[i])] : [dr(partnerCapital(name), -s.need[i]), cr(other(name), -s.need[i])]])),
        ].map((lines) => ({ date: day, lines }));
        const ids = names.map(partnerCapital);
        const labelOf = (id: string): string => (id === 'revaluation' ? `Revaluation A/c (${profit ? 'profit' : 'loss'})` : id.startsWith('capital:') ? ledgerLabel(id) : columnLabel(id));
        const view = columnarAccount(entries, ids, { date: day, balances: s.open.map((o) => ({ side: 'Cr' as const, amount: rupees(o) })) }, labelOf);
        if (view.balances.some((b, i) => b === null || b.side !== 'Cr' || b.amount !== rupees(s.target[i]))) return null;
        const pool = s.R + (s.second ? (s.second.credit ? s.D : -s.D) : 0) - s.B + V;
        const adjusted = s.open.map((o, i) => o + (pool * ch.old[i]) / ch.so + (s.G * ch.d[i]) / ch.L);
        const viaLabel = s.viaBank ? 'Bank A/c' : 'Current A/c';
        const shares = (v: number): string => CPR.eachOf(names, names.map((_, i) => CPR.part(v, ch.old, i)));
        return {
          task: `Prepare the partners' capital accounts in columns on ${day} from the entries of the change, with the capitals then made proportionate to the new ratio, and carry the balances down.`,
          title: "Partners' Capital Accounts",
          columns: partnerColumns(names),
          ...CPR.withPlainWording(columnarSides(view, { closeOn: day })),
          distractors: [...new Set([`Revaluation A/c (${profit ? 'loss' : 'profit'})`, ...(s.B > 0 ? [] : ['Goodwill A/c']), ...ch.same.map((i) => ledgerLabel(ids[i])), s.viaBank ? 'Current A/c' : 'Bank A/c', 'Profit and Loss Appropriation A/c', 'Drawings A/c'])],
          explanation: [
            'Each partner has a column. A capital is a credit balance, so the capitals open on the credit side as "By Balance b/d".',
            `General Reserve ${inr(s.R)} in the old ratio ${ch.old.join(':')}: ${shares(s.R)}, "By General Reserve A/c".`,
            ...(s.second ? [`${s.second.what}: ${inr(s.D)} in the old ratio is ${shares(s.D)}, ${s.second.credit ? '"By' : '"To'} ${columnLabel(s.second.id)}".`] : []),
            ...(s.B > 0 ? [`Goodwill in the books, ${inr(s.B)}, is written off in the old ratio: ${shares(s.B)}, "To Goodwill A/c".`] : []),
            `The ${profit ? 'profit' : 'loss'} on revaluation, ${inr(Math.abs(V))}, in the old ratio: ${shares(Math.abs(V))}, ${profit ? '"By Revaluation A/c (profit)"' : '"To Revaluation A/c (loss)"'}; "Revaluation A/c" alone is accepted too.`,
            `${CPR.movesText(ch, names).join(' ')} Goodwill ${inr(s.G)} x the share that moves: ${[...ch.gain, ...ch.sac].map((i) => `${names[i]} ${inr(CPR.moved(s.G, ch, i))}`).join(', ')}; a partner who gains is debited with the name of the partner compensated, and a partner who sacrifices is credited with the name of the partner who pays.`,
            `Capitals after these adjustments: ${CPR.eachOf(names, adjusted)}${s.stated ? `. The total is fixed at ${inr(s.total)}` : `, a total of ${inr(s.total)}`}. In the new ratio ${ch.neu.join(':')}: ${CPR.eachOf(names, s.target)}.`,
            `${names.flatMap((name, i) => (s.need[i] === 0 ? [] : [s.need[i] > 0 ? `${name} has a deficiency of ${inr(s.need[i])}: "By ${viaLabel}".` : `${name} has a surplus of ${inr(-s.need[i])}: "To ${viaLabel}".`])).join(' ')}${s.need.some((x) => x === 0) ? ` ${CPR.listOf(names.filter((_, i) => s.need[i] === 0))} already has the right capital.` : ''}`,
            `The balances carried down are in the new ratio: ${CPR.eachOf(names, s.target)}.`,
          ],
          hints: [CPR.H.capitals[0], CPR.H.capitals[1]],
        };
      },
      verify: (q: AccountQuestion) => {
        const k = readChangeChain(q.data);
        const { g } = k;
        const adjusted = g.names.map((_, i) => k.open[i] + k.pool * g.old[i] + k.G * g.give[i]);
        const total = k.total ?? sum(adjusted);
        const via = /current account, opened/.test(q.data) ? 'Current A/c' : 'Bank A/c';
        return (
          k.open.length === g.names.length &&
          g.names.every((_, i) => {
            const want = total * g.neu[i];
            const moved = columnFigure(q, 1, (r) => r.label === via, i) - columnFigure(q, 0, (r) => r.label === via, i);
            return near(columnFigure(q, 0, (r) => r.closing === true, i), want) && near(moved, want - adjusted[i]);
          })
        );
      },
    },
  ],
});

const cases: CaseTemplate[] = [goodwillPremium, changeOfRatio, hiddenGoodwill, retirementDue, deathExecutor, earmarkedReserve, admissionChain, retirementChain, deathChain, changeChain];

export default cases;
