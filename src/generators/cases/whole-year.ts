/**
 * Integrated case studies of Class 11: the whole year of a sole proprietor's business, drawing on several topics at
 * once (the stage `whole-year` in ./index.ts, after Final Accounts with Adjustments). A case may combine any of the
 * topics of the course: the accounting equation and the theory base, journal, ledger, cash book, subsidiary books,
 * bank reconciliation, trial balance, rectification of errors, depreciation, provisions and reserves, and the final
 * accounts with their adjustments.
 *
 * How a case is made. `setup` draws one business and one year and works every figure out once; each part reads its
 * answer from that scenario. Every `verify` goes the other way: it reads the printed case text back (the figures of
 * each line, the dates, the rates) and works the answer out again by another route, as a student would.
 *
 * Conventions, each stated in the case text wherever a case relies on it (they are those of the topic banks):
 *  - the business is a sole proprietor's, called "the proprietor" in the text; its year ends on 31 March 2026;
 *  - depreciation is charged for the months of use, from the first day of the month of purchase (purchases and sales
 *    fall on the first day of a month), by the method the case names, and written off the asset or credited to
 *    Provision for Depreciation A/c as the case says;
 *  - payments that bring an asset into working order (installation, carriage on it) are part of its cost;
 *  - further bad debts are written off first, and the provision for doubtful debts is a percentage of the debtors
 *    that remain; a new provision is charged to Profit and Loss A/c;
 *  - goods taken by the proprietor, given away or lost are credited to Purchases A/c at cost;
 *  - a profit is corrected only for the items the case lists.
 * Amounts are paise in the code (a rupee value times 100) and whole rupees in every answer.
 */
import type { AccountQuestion, FormatRow, JournalQuestion, JournalSetQuestion, McqQuestion } from '@/content/types';
import { resolveAccount } from '@/engine/accounts';
import { BALANCE_BD, BALANCE_CD, accountOf, trialBalance, type DatedEntry } from '@/engine/books';
import type { JournalLine } from '@/engine/journal';
import type { Rng } from '@/engine/rng';
import { parseRupees } from '@/lib/money-input';
import { amount, caseTemplate, crSide, drSide, formatINR, ledgerPeriods, ledgerSides, rupees as R } from '../authoring';
import { BRS_CHAIN } from '../templates/bank-reconciliation';
import { FA_CHAIN, type ChainBooks } from '../templates/final-accounts';
import { FAA_CHAIN, type FaaAdj, type FaaBal } from '../templates/final-accounts-adjustments';
import { FA_CASES, type FaCaseAdjusted } from './final-accounts';
import type { CaseAccountParts, CaseSetParts, CaseTemplate, Distractor, FormatRowParts, JournalParts, McqParts, NumericParts } from '../types';

const T = 'final-accounts-adjustments';
const C = 'faa-integrated';

// ---------------------------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------------------------

const inr = formatINR;
const dr = (accountId: string, value: number): JournalLine => ({ accountId, side: 'Dr', amount: value });
const cr = (accountId: string, value: number): JournalLine => ({ accountId, side: 'Cr', amount: value });
const sumOf = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
/** `rate` percent of an amount in paise; it may have paise, so a figure is tested with `clean` before it is used. */
const pct = (p: number, rate: number): number => (p * rate) / 100;
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
/** A whole, positive number of rupees. */
const clean = (v: number): boolean => Number.isSafeInteger(v) && v > 0 && v % 100 === 0;
/** "A, B and C". */
const listed = (xs: readonly string[]): string => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
/** "₹a + ₹b = ₹c", or the amount alone when there is only one. */
const added = (xs: readonly number[]): string => (xs.length < 2 ? xs.map(inr).join('') : `${xs.map(inr).join(' + ')} = ${inr(sumOf(xs))}`);

/** The first result `make` gives in a few goes, so that a case rejects few seeds. */
function attempt<S>(goes: number, make: () => S | null): S | null {
  for (let i = 0; i < goes; i++) {
    const made = make();
    if (made !== null) return made;
  }
  return null;
}

// ---- the questions ----

/** A wrong figure and the mistake behind it; either may be left out (null) for a seed where it does not apply. */
type Slip = readonly [value: number | null | undefined | false, why: string | null];

/** A typed amount. A wrong figure that is not a whole positive number of rupees, or that repeats another, is dropped. */
function num(prompt: string, answer: number, slips: readonly Slip[], explanation: string[], hints?: string[]): NumericParts | null {
  if (!clean(answer)) return null;
  const seen = new Set([answer]);
  const commonErrors: { value: number; why: string }[] = [];
  for (const [v, why] of slips) {
    if (typeof v !== 'number' || !why || !clean(v) || seen.has(v)) continue;
    seen.add(v);
    commonErrors.push({ value: v, why });
  }
  return commonErrors.length >= 2 ? { prompt, answer, commonErrors, explanation, ...(hints ? { hints } : {}) } : null;
}

/** A choice; null when fewer than three different wrong options are left. */
function choice(prompt: string, correct: string, wrong: readonly (readonly [string, string])[], explanation: string, hints?: string[]): McqParts | null {
  const seen = new Set([correct]);
  const distractors: Distractor[] = [];
  for (const [text, why] of wrong) {
    if (seen.has(text)) continue;
    seen.add(text);
    distractors.push({ text, why });
  }
  return distractors.length >= 3 ? { prompt, correct, distractors, explanation, ...(hints ? { hints } : {}) } : null;
}

/** A journal entry stated directly. */
const entry = (prompt: string, lines: JournalLine[], explanation: string[], distractorAccounts: string[] = [], hints?: string[]): JournalParts => ({
  prompt,
  lines,
  explanation,
  ...(distractorAccounts.length > 0 ? { distractorAccounts } : {}),
  ...(hints ? { hints } : {}),
});

// ---- reading a case back, for `verify` ----

/** Every rupee amount of a text, in paise and in the order printed. */
const amountsIn = (text: string): number[] => (text.match(/₹\d+(?:,\d+)*/g) ?? []).map((m) => parseRupees(m) ?? NaN);
/** The line of the case that starts with `lead` (or matches it), or an empty string. */
function lineOf(context: string | undefined, lead: string | RegExp): string {
  const lines = (context ?? '').split('\n');
  return (typeof lead === 'string' ? lines.find((l) => l.startsWith(lead)) : lines.find((l) => lead.test(l))) ?? '';
}
/** The first whole number captured by `re` in a text, or NaN. */
const intIn = (text: string, re: RegExp): number => Number(re.exec(text)?.[1] ?? NaN);
/** Lines in an order drawn in `setup`. */
const inOrder = <X>(order: readonly number[], xs: readonly X[]): X[] => order.map((i) => xs[i]);
const picked = (q: McqQuestion): string => q.options.find((o) => o.id === q.correct)?.text ?? '';
/** True when an entry has exactly these lines, in any order. */
function entryIs(q: JournalQuestion, want: readonly JournalLine[]): boolean {
  const key = (l: JournalLine) => `${l.side} ${l.accountId} ${l.amount}`;
  const have = q.expected.map(key).sort();
  const need = want.map(key).sort();
  return have.length === need.length && have.every((k, i) => k === need[i]);
}

// ---- the year: its months and its dates ----

/** The months of the accounting year 2025-26, April first. */
const MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
const YEAR_END = '31 March 2026';
/** The first day of the month `k` of the year 2025-26 (0 is April 2025, 11 is March 2026). */
const dayOf = (k: number): string => `1 ${MONTHS[k]} ${k >= 9 ? 2026 : 2025}`;
/** The month of the year 2025-26 that a printed "1 <Month> <year>" falls in, or NaN. */
function monthIn(text: string): number {
  const m = new RegExp(`\\b1 (${MONTHS.join('|')}) (2025|2026)\\b`).exec(text);
  if (!m) return NaN;
  const k = MONTHS.indexOf(m[1]);
  return (k >= 9) === (m[2] === '2026') ? k : NaN;
}
const monthsWord = (n: number): string => `${n} ${n === 1 ? 'month' : 'months'}`;

// ---- the businesses ----

interface Biz {
  owner: string;
  trade: string;
  city: string;
  /** A machine such a business buys: "a dough mixer". */
  machine: string;
}
const BUSINESSES: Biz[] = [
  { owner: 'Kavita Menon', trade: 'a bakery', city: 'Kochi', machine: 'dough mixer' },
  { owner: 'Harpreet Gill', trade: 'a flour mill', city: 'Ludhiana', machine: 'grinding machine' },
  { owner: 'Ramesh Iyer', trade: 'a printing press', city: 'Chennai', machine: 'paper-cutting machine' },
  { owner: 'Salma Khan', trade: 'a garment unit', city: 'Tiruppur', machine: 'embroidery machine' },
  { owner: 'Anil Deshmukh', trade: 'a packaging unit', city: 'Pune', machine: 'carton-sealing machine' },
  { owner: 'Meera Joshi', trade: 'a spice-grinding unit', city: 'Indore', machine: 'pulveriser' },
  { owner: 'Tenzin Norbu', trade: 'a furniture workshop', city: 'Siliguri', machine: 'wood-planing machine' },
  { owner: 'Lakshmi Rao', trade: 'a fruit-pulp unit', city: 'Nagpur', machine: 'pulping machine' },
  { owner: 'Imran Shaikh', trade: 'a footwear unit', city: 'Agra', machine: 'sole-pressing machine' },
  { owner: 'Deepa Nair', trade: 'a dairy', city: 'Anand', machine: 'cream separator' },
  { owner: 'Gopal Verma', trade: 'a paper-bag unit', city: 'Jaipur', machine: 'bag-folding machine' },
  { owner: 'Farida Ansari', trade: 'a namkeen unit', city: 'Bhopal', machine: 'frying machine' },
];
/** `shift` is the number of the case, so that one seed does not give every case the same business. */
const business = (rng: Rng, shift: number): Biz => BUSINESSES[(rng.int(0, BUSINESSES.length - 1) + shift * 5) % BUSINESSES.length];
/** "a" or "an" before a word. */
const an = (word: string): string => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);

// ---- hints shared by several cases ----

const H = {
  capitalise: ['Which payments were needed before the machine could be used?', 'Such payments are part of the cost of the asset (capital expenditure), not an expense of the year.'],
  partYear: ['Count the months of use from the date of purchase to 31 March.', "Depreciation for part of a year = the year's charge x months of use / 12."],
  debts: ['Write off the further bad debts first: the provision is a percentage of the debtors that remain.', 'The charge to profit = further bad debts + new provision - old provision.'],
  corrected: ['Take the items one at a time: does each raise the profit or lower it?', 'An expense wrongly charged is added back; an expense not yet charged is deducted.'],
};

// ===============================================================================================================
// SHORT CASES
// ===============================================================================================================

// ---------------------------------------------------------------------------------------------------------------
// 1. A new machine and the debtors at the year end (medium). A draft profit, then three things found at the year end:
// the installation of a machine bought during the year was debited to Repairs A/c (rectification), the machine is
// still to be depreciated for its months of use (depreciation), and the debtors call for further bad debts and a
// provision (provisions). The case climbs to the corrected net profit.
// ---------------------------------------------------------------------------------------------------------------

interface NewMachine {
  b: Biz;
  draft: number;
  price: number;
  fit: number;
  k: number;
  rate: number;
  method: 'slm' | 'wdv';
  provisionKept: boolean;
  debtors: number;
  further: number;
  pdd: number;
  old: number;
  /** Which principle the choice question asks about. */
  ask: 'prudence' | 'cost';
  // worked out
  cost: number;
  months: number;
  dep: number;
  newPdd: number;
  charge: number;
  corrected: number;
}

/** The case read back from its text. */
function readNewMachine(context: string | undefined) {
  const draft = amountsIn(lineOf(context, 'The draft Profit'))[0];
  const bought = lineOf(context, '(a)');
  const [price, fit] = amountsIn(bought);
  const rule = lineOf(context, '(b)');
  const debts = lineOf(context, '(c)');
  const [debtors, further, old = 0] = amountsIn(debts);
  return {
    draft,
    price,
    fit,
    months: 12 - monthIn(bought),
    rate: intIn(rule, /at (\d+)% p\.a\./),
    debtors,
    further,
    pdd: intIn(debts, /at (\d+)% of the remaining debtors/),
    old,
  };
}

const newMachineAndDebtors = caseTemplate<NewMachine>({
  id: 'case-wy-new-machine-debtors',
  topicId: T,
  conceptId: C,
  difficulty: 'complex',
  title: 'A new machine and the debtors at the year end',
  setup: (rng) =>
    attempt(20, () => {
      const b = business(rng, 1);
      const price = amount(rng, 120000, 480000, 10000);
      const fit = amount(rng, 4000, 24000, 1000);
      const k = rng.pick([2, 3, 4, 6, 8, 9]);
      const rate = rng.pick([10, 15, 20]);
      const cost = price + fit;
      const months = 12 - k;
      const dep = (cost * rate * months) / 1200;
      const debtors = amount(rng, 120000, 400000, 10000);
      const further = amount(rng, 2000, 10000, 1000);
      const pdd = rng.pick([2, 5, 10]);
      const newPdd = pct(debtors - further, pdd);
      const old = rng.next() < 0.35 ? 0 : Math.round(newPdd * rng.pick([0.5, 0.6, 0.75, 1.25, 1.4]) / R(500)) * R(500);
      const charge = further + newPdd - old;
      const draft = amount(rng, 150000, 500000, 1000);
      const corrected = draft + fit - dep - charge;
      if (![dep, newPdd, charge, corrected].every(clean) || old === newPdd || (old > 0 && !clean(old)) || charge < R(1000)) return null;
      return {
        b, draft, price, fit, k, rate, method: rng.pick(['slm', 'wdv'] as const), provisionKept: rng.next() < 0.4,
        debtors, further, pdd, old, ask: rng.pick(['prudence', 'cost'] as const), cost, months, dep, newPdd, charge, corrected,
      };
    }),
  context: (s) =>
    [
      `${s.b.owner} runs ${s.b.trade} in ${s.b.city} as its sole proprietor. The accounting year ends on 31 March.`,
      `The draft Profit and Loss Account for the year ended ${YEAR_END} shows a net profit of ${inr(s.draft)}. It was drawn up before these were looked into:`,
      `(a) On ${dayOf(s.k)} a new ${s.b.machine} was bought for ${inr(s.price)}. Its installation, ${inr(s.fit)}, was paid the same day and debited to Repairs A/c.`,
      `(b) Machinery is depreciated at ${s.rate}% p.a. on the ${s.method === 'slm' ? 'original cost' : 'written down value'}, for the months of use; depreciation is ${s.provisionKept ? 'credited to Provision for Depreciation A/c' : 'written off the asset'}. The draft charges it on the old machinery, but not on the new ${s.b.machine}.`,
      `(c) Sundry debtors stand at ${inr(s.debtors)}. Write off further bad debts of ${inr(s.further)}, then ${s.old ? 'adjust the provision for doubtful debts' : 'create a provision for doubtful debts'} at ${s.pdd}% of the remaining debtors.${s.old ? ` The provision brought forward is ${inr(s.old)}.` : ''}`,
    ].join('\n'),
  parts: [
    {
      kind: 'journal',
      make: (s) =>
        entry(
          'Pass the entry that puts right the treatment of the installation charges in (a).',
          [dr('machinery', s.fit), cr('repairs', s.fit)],
          [
            `The installation brought the ${s.b.machine} into working order, so it is part of the cost of the machine: capital expenditure.`,
            'It was wrongly charged as an expense: Machinery A/c is debited and Repairs A/c is credited.',
          ],
          ['depreciation', 'wages'],
          H.capitalise,
        ),
      verify: (q) => entryIs(q, [dr('machinery', readNewMachine(q.context).fit), cr('repairs', readNewMachine(q.context).fit)]),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          `What is the depreciation on the new ${s.b.machine} for the year ended ${YEAR_END}?`,
          s.dep,
          [
            [(s.price * s.rate * s.months) / 1200, 'Charged depreciation on the price alone. The installation is part of the cost of the machine.'],
            [pct(s.cost, s.rate), `Charged a full year, although the machine was used for only ${monthsWord(s.months)}.`],
            [(s.cost * s.rate * (s.months - 1)) / 1200, `Counted the months from the month after the purchase. ${dayOf(s.k)} to ${YEAR_END} is ${monthsWord(s.months)}.`],
            [pct(s.price, s.rate), 'Charged a full year on the price alone.'],
          ],
          [
            `Cost of the machine = price ${inr(s.price)} + installation ${inr(s.fit)} = ${inr(s.cost)}.`,
            `Months of use: ${dayOf(s.k)} to ${YEAR_END} = ${monthsWord(s.months)}.`,
            `Depreciation = ${inr(s.cost)} x ${s.rate}/100 x ${s.months}/12 = ${inr(s.dep)}.`,
            ...(s.method === 'wdv' ? ['In the first year the written down value is the cost itself, so the charge is worked on the cost.'] : []),
          ],
          H.partYear,
        ),
      verify: (q) => {
        const c = readNewMachine(q.context);
        return q.answer === ((c.price + c.fit) * c.rate * c.months) / 1200;
      },
    },
    {
      kind: 'mcq',
      make: (s) =>
        s.ask === 'prudence'
          ? choice(
              'The provision for doubtful debts in (c) is made before any of those debts has actually gone bad. Which principle requires it?',
              'Prudence (conservatism): every likely loss is provided for',
              [
                ['Business entity: the business is kept apart from the proprietor', 'Business entity separates the proprietor from the business; it says nothing about a loss that is likely.'],
                ['Money measurement: only what can be stated in money is recorded', 'Money measurement decides what can be recorded at all, not when a likely loss is provided for.'],
                ['Historical cost: assets are recorded at what they cost', 'Historical cost is about the figure at which an asset is recorded, not about losses that are expected.'],
                ['Dual aspect: every transaction has two equal effects', 'Dual aspect explains double entry; it does not ask for a provision.'],
              ],
              'Prudence asks the accountant not to anticipate gains but to provide for every likely loss. A debt that may not be collected is such a loss, so a provision is charged against this year\'s profit.',
              ['Is the loss certain, or only likely?', 'One principle asks for every likely loss to be provided for, but no gain to be anticipated.'],
            )
          : choice(
              `Why is the installation charge of the new ${s.b.machine} added to the cost of the machine?`,
              'It is paid to bring the machine into working condition, so it is capital expenditure',
              [
                ['It is a regular running cost of the factory, so it is revenue expenditure', 'Took the installation for a running cost. It is paid once, to make the machine usable, and its benefit lasts as long as the machine.'],
                ['It is a repair to the machine, so it is charged to Repairs A/c', 'Repairs keep a machine in working order once it is in use; installation puts a new machine into use, so it belongs to its cost.'],
                ['It is added only because it was paid on the same day as the price', 'The day of payment does not decide it: installation is part of the cost whenever it is paid, because it is needed to make the machine work.'],
                ['It is deferred revenue expenditure, written off over three years', 'Installation is not a deferred expense: it is part of the cost of the machine and is depreciated with it.'],
              ],
              'The cost of a fixed asset is everything paid to acquire it and bring it into working condition: price, carriage and installation. Such payments are capital expenditure, recovered through depreciation over the life of the machine.',
              H.capitalise,
            ),
      verify: (q) => {
        const said = picked(q);
        return q.prompt.includes('principle') ? said.startsWith('Prudence') : said.endsWith('so it is capital expenditure');
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          'By how much do the further bad debts and the provision for doubtful debts in (c), taken together, reduce the draft profit?',
          s.charge,
          [
            [s.old ? s.further + s.newPdd : null, `Left out the provision brought forward of ${inr(s.old)}: only the difference between the new and the old provision is charged.`],
            [s.newPdd - s.old, 'Left out the further bad debts, which are a loss of the year as well.'],
            [s.further + pct(s.debtors, s.pdd) - s.old, 'Worked the provision on the debtors before the further bad debts were written off.'],
            [s.newPdd, 'Gave the new provision alone.'],
            [s.old ? s.further + s.old - s.newPdd : null, 'Took the change in the provision the wrong way round.'],
          ],
          [
            `Debtors after the further bad debts = ${inr(s.debtors)} - ${inr(s.further)} = ${inr(s.debtors - s.further)}.`,
            `New provision = ${inr(s.debtors - s.further)} x ${s.pdd}/100 = ${inr(s.newPdd)}.`,
            s.old
              ? `Charge = further bad debts ${inr(s.further)} + new provision ${inr(s.newPdd)} - old provision ${inr(s.old)} = ${inr(s.charge)}.`
              : `Charge = further bad debts ${inr(s.further)} + new provision ${inr(s.newPdd)} = ${inr(s.charge)}.`,
          ],
          H.debts,
        ),
      verify: (q) => {
        const c = readNewMachine(q.context);
        return q.answer === c.further + ((c.debtors - c.further) * c.pdd) / 100 - c.old;
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          `What is the correct net profit for the year ended ${YEAR_END}, after (a), (b) and (c)?`,
          s.corrected,
          [
            [s.draft - s.dep - s.charge, 'Left the installation in the expenses. It was capital expenditure, so it is added back to the draft profit.'],
            [s.draft - s.fit - s.dep - s.charge, 'Deducted the installation again instead of adding it back.'],
            [s.draft + s.fit - (s.price * s.rate * s.months) / 1200 - s.charge, 'Charged depreciation on the price alone, leaving out the installation.'],
            [s.draft + s.fit - pct(s.cost, s.rate) - s.charge, 'Charged a full year of depreciation on the new machine.'],
            [s.draft + s.fit - s.dep - (s.newPdd - s.old), 'Left out the further bad debts.'],
            [s.old ? s.draft + s.fit - s.dep - s.further - s.newPdd : null, 'Charged the whole new provision, without setting the old one against it.'],
          ],
          [
            `Draft net profit = ${inr(s.draft)}.`,
            `Add: installation wrongly charged to repairs ${inr(s.fit)}.`,
            `Less: depreciation on the new machine ${inr(s.dep)}.`,
            `Less: further bad debts and the change in the provision ${inr(s.charge)}.`,
            `Correct net profit = ${inr(s.draft)} + ${inr(s.fit)} - ${inr(s.dep)} - ${inr(s.charge)} = ${inr(s.corrected)}.`,
          ],
          H.corrected,
        ),
      verify: (q) => {
        const c = readNewMachine(q.context);
        const dep = ((c.price + c.fit) * c.rate * c.months) / 1200;
        const charge = c.further + ((c.debtors - c.further) * c.pdd) / 100 - c.old;
        return q.answer === c.draft + c.fit - dep - charge;
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 2. Errors found after the draft final accounts (complex). The trial balance did not agree and the difference went to
// Suspense A/c; four errors are then found: two that upset the trial balance (one of them a posting from the cash
// book or a subsidiary book), one that did not (a bad debt recovered, goods taken by the proprietor), and an asset
// charged as an expense, which also has to be depreciated for its months of use. The case climbs from the Suspense
// balance through two rectifying entries to the corrected profit and the corrected machinery.
// ---------------------------------------------------------------------------------------------------------------

/** One error: its sentence, what it did to the trial balance and to the profit, and its rectifying entry. */
interface Slipup {
  text: string;
  /** Debit total less credit total of the trial balance, caused by the error. */
  gap: number;
  /** What the profit must be raised by to put the error right (negative: lowered). */
  fix: number;
  lines: JournalLine[];
  why: string[];
  /** What the error did to the profit, for the working: "sales were understated". */
  say: string;
  /** The error named in a few words, without its amount, for an item of a set: "Sales Book undercast". */
  name: string;
  /** For the asset charged as an expense: its cost, and the month it was bought in. */
  asset?: { cost: number; k: number };
}

const PEOPLE = ['Mohan', 'Kiran', 'Anita', 'Ravi', 'Suresh', 'Farida', 'Deepak', 'Rekha', 'Naveen', 'Pooja', 'Harish', 'Sunita'];
/** The parties of a business: none shares the proprietor's first name. */
const peopleOf = (b: Biz): string[] => PEOPLE.filter((p) => p !== b.owner.split(' ')[0]);

/** Errors that upset the trial balance; each puts its share of the difference into Suspense A/c. */
const ONE_SIDED: ((rng: Rng, name: string) => Slipup)[] = [
  (rng) => {
    const x = amount(rng, 2000, 15000, 500);
    return {
      text: `The Sales Book was undercast by ${inr(x)}.`,
      gap: x,
      fix: x,
      lines: [dr('suspense', x), cr('sales', x)],
      say: 'sales were understated',
      name: 'Sales Book undercast.',
      why: ['Sales A/c was credited with a total that is too small: the credit column was short.', `Sales A/c is credited with ${inr(x)}; Suspense A/c, which stood in for the shortage, is debited.`],
    };
  },
  (rng) => {
    const x = amount(rng, 1000, 8000, 500);
    return {
      text: `The Purchases Returns Book was overcast by ${inr(x)}.`,
      gap: -x,
      fix: -x,
      lines: [dr('purchasesReturn', x), cr('suspense', x)],
      say: 'purchases returns were overstated',
      name: 'Purchases Returns Book overcast.',
      why: ['Purchases Return A/c was credited with a total that is too large: the credit column was long.', `Purchases Return A/c is debited with ${inr(x)}; the other side goes to Suspense A/c.`],
    };
  },
  (rng) => {
    const x = amount(rng, 1000, 9000, 500);
    return {
      text: `Interest of ${inr(x)} credited by the bank was entered in the cash book but not posted to Interest Received A/c.`,
      gap: x,
      fix: x,
      lines: [dr('suspense', x), cr('interestReceived', x)],
      say: 'an income was left out',
      name: 'Interest credited by the bank not posted.',
      why: ['The bank column was debited but no account was credited: the credit column was short.', `Interest Received A/c is credited with ${inr(x)}; Suspense A/c is debited.`],
    };
  },
  (rng) => {
    // A slip of the digits: ₹450 posted as ₹540, or the reverse.
    const [h, t] = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const x = R(h * 100 + t * 10);
    const y = R(t * 100 + h * 10);
    const d = Math.abs(y - x);
    return y > x
      ? {
          text: `Bank charges of ${inr(x)} in the cash book were posted to Bank Charges A/c as ${inr(y)}.`,
          gap: d,
          fix: d,
          lines: [dr('suspense', d), cr('bankCharges', d)],
          say: 'bank charges were overstated',
      name: 'Bank charges posted at a wrong figure.',
          why: [`Bank Charges A/c was debited ${inr(y)} - ${inr(x)} = ${inr(d)} too much: the debit column was long.`, `Bank Charges A/c is credited with ${inr(d)}; Suspense A/c is debited.`],
        }
      : {
          text: `Bank charges of ${inr(x)} in the cash book were posted to Bank Charges A/c as ${inr(y)}.`,
          gap: -d,
          fix: -d,
          lines: [dr('bankCharges', d), cr('suspense', d)],
          say: 'bank charges were understated',
      name: 'Bank charges posted at a wrong figure.',
          why: [`Bank Charges A/c was debited ${inr(x)} - ${inr(y)} = ${inr(d)} too little: the debit column was short.`, `Bank Charges A/c is debited with ${inr(d)}; Suspense A/c is credited.`],
        };
  },
  (rng, name) => {
    const x = amount(rng, 500, 4000, 100);
    return {
      text: `Discount of ${inr(x)} allowed to ${name} in the cash book was not posted to Discount Allowed A/c.`,
      gap: -x,
      fix: -x,
      lines: [dr('discountAllowed', x), cr('suspense', x)],
      say: 'an expense was left out',
      name: 'Discount allowed not posted to Discount Allowed A/c.',
      why: [`${name}'s account was credited with the discount, but Discount Allowed A/c was not debited: the debit column was short.`, `Discount Allowed A/c is debited with ${inr(x)}; Suspense A/c is credited.`],
    };
  },
  (rng) => {
    const x = amount(rng, 2000, 9000, 500);
    return {
      text: `Rent of ${inr(x)} paid in cash was posted to the credit side of Rent A/c.`,
      gap: -2 * x,
      fix: -2 * x,
      lines: [dr('rent', 2 * x), cr('suspense', 2 * x)],
      say: 'rent was understated by twice the amount',
      name: 'Rent posted to the wrong side of Rent A/c.',
      why: [`Rent A/c was credited ${inr(x)} where it should have been debited ${inr(x)}: the debit column was short by twice the amount, ${inr(2 * x)}.`, `Rent A/c is debited with ${inr(2 * x)}; Suspense A/c is credited.`],
    };
  },
  (rng) => {
    const x = amount(rng, 2000, 9000, 500);
    return {
      text: `Depreciation of ${inr(x)} on furniture was debited to Depreciation A/c but not credited to Furniture A/c.`,
      gap: x,
      fix: 0,
      lines: [dr('suspense', x), cr('furniture', x)],
      say: 'no change to the profit',
      name: 'Depreciation on furniture not credited to Furniture A/c.',
      why: ['The expense was debited but the asset was never reduced: the credit column was short.', `Furniture A/c is credited with ${inr(x)}; Suspense A/c is debited. The profit already bears the depreciation, so it does not change.`],
    };
  },
];

/** Errors that left the trial balance in agreement but the profit wrong. */
const TWO_SIDED: ((rng: Rng, name: string) => Slipup)[] = [
  (rng, name) => {
    const x = amount(rng, 2000, 12000, 500);
    return {
      text: `${inr(x)} received from ${name}, whose debt had been written off as bad last year, was credited to ${name}'s account.`,
      gap: 0,
      fix: x,
      lines: [dr(`debtor:${name}`, x), cr('badDebtsRecovered', x)],
      say: 'an income was left out',
      name: 'A bad debt recovered credited to the debtor.',
      why: [`A debt written off and later recovered is an income of the year it is recovered in: Bad Debts Recovered A/c is credited with ${inr(x)}.`, `${name}'s account was wrongly credited, so it is debited to cancel that credit.`],
    };
  },
  (rng) => {
    const x = amount(rng, 2000, 12000, 500);
    return {
      text: `Goods costing ${inr(x)} taken by the proprietor for personal use were not recorded at all.`,
      gap: 0,
      fix: x,
      lines: [dr('drawings', x), cr('purchases', x)],
      say: 'purchases were overstated',
      name: 'Goods taken by the proprietor not recorded.',
      why: ['Goods taken for personal use are drawings: Drawings A/c is debited.', `They leave the goods bought for sale, at cost: Purchases A/c is credited with ${inr(x)}.`],
    };
  },
];

/** An asset charged as an expense: a machine debited to Purchases A/c, or the wages of installing one debited to Wages A/c. */
function chargedAsExpense(rng: Rng, machine: string): Slipup {
  const k = rng.pick([3, 4, 6, 7, 9]);
  if (rng.next() < 0.5) {
    const x = amount(rng, 40000, 160000, 10000);
    return {
      text: `${cap(an(machine))} bought for ${inr(x)} on ${dayOf(k)} was debited to Purchases A/c.`,
      gap: 0,
      fix: x,
      lines: [dr('machinery', x), cr('purchases', x)],
      say: 'purchases were overstated by the cost of an asset',
      name: 'A machine debited to Purchases A/c.',
      why: ['A machine bought for use in the business is a fixed asset, not goods for resale: Machinery A/c is debited.', `Purchases A/c was wrongly debited, so it is credited with ${inr(x)}.`],
      asset: { cost: x, k },
    };
  }
  const x = amount(rng, 4000, 20000, 1000);
  return {
    text: `Wages of ${inr(x)} paid on ${dayOf(k)} for installing a new ${machine} were debited to Wages A/c.`,
    gap: 0,
    fix: x,
    lines: [dr('machinery', x), cr('wages', x)],
    say: 'wages were overstated by a cost of the machine',
      name: 'Wages for installing a machine debited to Wages A/c.',
      why: ['Wages paid to install a machine are part of its cost: Machinery A/c is debited.', `Wages A/c was wrongly debited, so it is credited with ${inr(x)}.`],
    asset: { cost: x, k },
  };
}

const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'];

interface AfterTb {
  b: Biz;
  draft: number;
  machinery: number;
  rate: number;
  errors: Slipup[];
  /** The one-sided error whose entry is asked for. */
  asked: number;
  /** The asset charged as an expense. */
  capital: number;
  dep: number;
  gap: number;
  corrected: number;
}

/** What an error sentence does, read from its words alone: the difference it makes and what it does to the profit. */
const ERROR_READERS: [RegExp, (x: number[]) => { gap: number; fix: number }, against: string | null][] = [
  [/^The Sales Book was undercast by ₹/, ([x]) => ({ gap: x, fix: x }), 'Sales A/c'],
  [/^The Purchases Returns Book was overcast by ₹/, ([x]) => ({ gap: -x, fix: -x }), 'Purchases Return A/c'],
  [/^Interest of ₹[\d,]+ credited by the bank was entered in the cash book but not posted/, ([x]) => ({ gap: x, fix: x }), 'Interest Received A/c'],
  [/^Bank charges of ₹[\d,]+ in the cash book were posted to Bank Charges A\/c as ₹/, ([x, y]) => ({ gap: y - x, fix: y - x }), 'Bank Charges A/c'],
  [/^Discount of ₹[\d,]+ allowed to .+ was not posted to Discount Allowed A\/c\.$/, ([x]) => ({ gap: -x, fix: -x }), 'Discount Allowed A/c'],
  [/^Rent of ₹[\d,]+ paid in cash was posted to the credit side of Rent A\/c\.$/, ([x]) => ({ gap: -2 * x, fix: -2 * x }), 'Rent A/c'],
  [/^Depreciation of ₹[\d,]+ on furniture was debited to Depreciation A\/c but not credited/, ([x]) => ({ gap: x, fix: 0 }), 'Furniture A/c'],
  [/^₹[\d,]+ received from .+, whose debt had been written off as bad last year, was credited/, ([x]) => ({ gap: 0, fix: x }), null],
  [/^Goods costing ₹[\d,]+ taken by the proprietor for personal use were not recorded/, ([x]) => ({ gap: 0, fix: x }), null],
  [/^An? .+ bought for ₹[\d,]+ on 1 \w+ 20\d\d was debited to Purchases A\/c\.$/, ([x]) => ({ gap: 0, fix: x }), null],
  [/^Wages of ₹[\d,]+ paid on 1 \w+ 20\d\d for installing a new .+ were debited to Wages A\/c\.$/, ([x]) => ({ gap: 0, fix: x }), null],
];


/** The case read back: the draft figures, each error by its own words, and the depreciation on the asset found. */
function readAfterTb(context: string | undefined) {
  const errors = (context ?? '').split('\n').flatMap((line) => {
    const m = /^\(([a-f])\) (.+)$/.exec(line);
    if (!m) return [];
    const hits = ERROR_READERS.filter(([re]) => re.test(m[2]));
    return hits.length === 1 ? [{ letter: m[1], text: m[2], ...hits[0][1](amountsIn(m[2])), against: hits[0][2] }] : [{ letter: m[1], text: m[2], gap: NaN, fix: NaN, against: null }];
  });
  const asset = errors.find((e) => /debited to (Purchases|Wages) A\/c\.$/.test(e.text) && !e.text.startsWith('Goods'));
  const rule = lineOf(context, 'Machinery is depreciated');
  const rate = intIn(rule, /at (\d+)% p\.a\./);
  const cost = asset ? amountsIn(asset.text)[0] : NaN;
  const dep = asset ? (cost * rate * (12 - monthIn(asset.text))) / 1200 : NaN;
  const [draft, machinery] = amountsIn(lineOf(context, 'The draft final accounts'));
  return { errors, gap: sumOf(errors.map((e) => e.gap)), fix: sumOf(errors.map((e) => e.fix)), cost, dep, draft, machinery };
}

/** The difference as a choice: the amount and the side Suspense A/c opened on. */
const suspenseSays = (gap: number): string => `${inr(Math.abs(gap))} on the ${gap > 0 ? 'credit' : 'debit'} side`;

const errorsAfterTb = caseTemplate<AfterTb>({
  id: 'case-wy-errors-after-final-accounts',
  topicId: T,
  conceptId: C,
  difficulty: 'complex',
  title: 'Errors found after the draft final accounts',
  setup: (rng) =>
    attempt(20, () => {
      const b = business(rng, 2);
      const names = rng.shuffle(peopleOf(b));
      const [m1, m2] = rng.shuffle(ONE_SIDED.map((_, i) => i)).slice(0, 2);
      const ones = [ONE_SIDED[m1](rng, names[0]), ONE_SIDED[m2](rng, names[1])];
      const two = rng.pick(TWO_SIDED)(rng, names[2]);
      const capital = chargedAsExpense(rng, b.machine);
      const errors = rng.shuffle([...ones, two, capital]);
      const all = errors.map((e) => amountsIn(e.text)[0]);
      if (new Set(all).size !== all.length) return null;
      const gap = sumOf(errors.map((e) => e.gap));
      if (gap === 0) return null;
      const rate = rng.pick([10, 15, 20]);
      const a = capital.asset!;
      const dep = (a.cost * rate * (12 - a.k)) / 1200;
      const draft = amount(rng, 120000, 400000, 1000);
      const corrected = draft + sumOf(errors.map((e) => e.fix)) - dep;
      const machinery = amount(rng, 200000, 600000, 10000);
      if (!clean(dep) || !clean(corrected)) return null;
      return { b, draft, machinery, rate, errors, asked: errors.indexOf(rng.pick(ones)), capital: errors.indexOf(capital), dep, gap, corrected };
    }),
  context: (s) =>
    [
      `${s.b.owner} runs ${s.b.trade} in ${s.b.city} as its sole proprietor. The trial balance on ${YEAR_END} did not agree; the difference was put to Suspense A/c.`,
      `The draft final accounts show a net profit of ${inr(s.draft)} and machinery of ${inr(s.machinery)}. Later these errors were found:`,
      ...s.errors.map((e, i) => `(${LETTERS[i]}) ${e.text}`),
      `Machinery is depreciated at ${s.rate}% p.a. on cost for the months of use. Nothing has yet been charged on the amount in (${LETTERS[s.capital]}).`,
      'With these errors put right, Suspense A/c is closed. The profit is corrected for these items only.',
    ].join('\n'),
  parts: [
    {
      kind: 'mcq',
      make: (s) => {
        const ones = s.errors.filter((e) => e.gap !== 0);
        const once = sumOf(ones.map((e) => (e.text.includes('credit side of Rent') ? e.gap / 2 : e.gap)));
        const loose = sumOf(ones.map((e) => Math.abs(e.gap)));
        // Each wrong option is a mistake this seed allows: one that does not apply is left out (choice drops what repeats).
        const wrong: [string, string][] = [
          [suspenseSays(-s.gap), 'Put the difference on the side that was too large. Suspense A/c stands on the side that is short, to make the two columns agree.'],
          ...(once !== s.gap && once !== 0 ? [[suspenseSays(once), 'Counted the rent posted to the wrong side only once. It is missing from the debit column and added to the credit column, so it makes a difference of twice the amount.'] as [string, string]] : []),
          ...(loose !== Math.abs(s.gap) ? [[suspenseSays(s.gap > 0 ? loose : -loose), 'Added the errors up without setting a short debit column against a short credit column.'] as [string, string]] : []),
          [suspenseSays(s.gap + (s.gap > 0 ? 1 : -1) * s.errors[s.capital].fix), `Counted the error in (${LETTERS[s.capital]}), which put both sides of the entry in the books, among those that upset the trial balance.`],
          ...ones.flatMap((e): [string, string][] => {
            const left = s.gap - e.gap;
            return left !== 0 && left !== s.gap ? [[suspenseSays(left), `Left out error (${LETTERS[s.errors.indexOf(e)]}), which also left one column of the trial balance short.`]] : [];
          }),
        ];
        return choice(
          'What difference was put to Suspense A/c when the trial balance was drawn up, and on which side?',
          suspenseSays(s.gap),
          wrong,
          [
            ...ones.map((e) => {
              const i = s.errors.indexOf(e);
              return `(${LETTERS[i]}) ${e.gap > 0 ? `credit column short by ${inr(e.gap)}` : `debit column short by ${inr(-e.gap)}`}.`;
            }),
            `The other errors put both sides in the books: they do not upset the trial balance.`,
            `Net: the ${s.gap > 0 ? 'credit' : 'debit'} column was short by ${inr(Math.abs(s.gap))}, so Suspense A/c opened with ${inr(Math.abs(s.gap))} on the ${s.gap > 0 ? 'credit' : 'debit'} side.`,
          ].join(' '),
          ['Which errors leave one side of the trial balance without its amount?', 'Suspense A/c stands on the side that is short, for the net shortage.'],
        );
      },
      verify: (q) => {
        const c = readAfterTb(q.context);
        return Number.isFinite(c.gap) && c.gap !== 0 && picked(q) === suspenseSays(c.gap);
      },
    },
    {
      kind: 'journal',
      make: (s) => {
        const e = s.errors[s.asked];
        return entry(`Pass the rectifying entry for error (${LETTERS[s.asked]}).`, e.lines, e.why, ['profitAndLoss', 'cash'], ['Which account is wrong, and by how much?', 'The error upset the trial balance, so the other side of the rectifying entry is Suspense A/c.']);
      },
      verify: (q) => {
        const c = readAfterTb(q.context);
        const letter = /error \(([a-f])\)/.exec(q.prompt)?.[1];
        const e = c.errors.find((x) => x.letter === letter);
        const onSuspense = q.expected.find((l) => l.accountId === 'suspense');
        // The entry closes this error's share of Suspense A/c: debited when the credit column was short.
        return !!e && !!onSuspense && e.gap !== 0 && onSuspense.amount === Math.abs(e.gap) && onSuspense.side === (e.gap > 0 ? 'Dr' : 'Cr') && q.expected.length === 2;
      },
    },
    {
      kind: 'journal',
      make: (s) => {
        const e = s.errors[s.capital];
        return entry(`Pass the rectifying entry for error (${LETTERS[s.capital]}).`, e.lines, [...e.why, 'Both sides of the original entry were posted, so Suspense A/c is not touched.'], ['suspense', 'depreciation'], H.capitalise);
      },
      verify: (q) => {
        const c = readAfterTb(q.context);
        return Number.isFinite(c.cost) && q.expected.some((l) => l.accountId === 'machinery' && l.side === 'Dr' && l.amount === c.cost) && !q.expected.some((l) => l.accountId === 'suspense');
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const signed = (x: number) => (x >= 0 ? `+ ${inr(x)}` : `- ${inr(-x)}`);
        const fixes = s.errors.map((e, i) => [i, e.fix] as const).filter(([, f]) => f !== 0);
        const rent = s.errors.find((e) => e.text.includes('credit side of Rent'));
        const two = s.errors.find((e) => e.gap === 0 && e !== s.errors[s.capital]);
        return num(
          `What is the correct net profit for the year ended ${YEAR_END}?`,
          s.corrected,
          [
            [s.corrected + s.dep, `Left out the depreciation on the amount in (${LETTERS[s.capital]}), now that it is part of the machinery.`],
            [s.draft + sumOf(s.errors.filter((e) => e.gap !== 0).map((e) => e.fix)), 'Corrected the profit only for the errors that went through Suspense A/c. Errors that left the trial balance in agreement can change the profit too.'],
            [rent ? s.corrected - rent.fix / 2 : null, 'Took the rent posted to the wrong side as an error of the amount once. The expense was understated by twice the amount.'],
            [two ? s.corrected - two.fix : null, `Left out error (${two ? LETTERS[s.errors.indexOf(two)] : ''}), which changes the profit although it did not upset the trial balance.`],
            [s.corrected - 2 * s.errors[s.capital].fix, `Deducted the amount in (${LETTERS[s.capital]}) instead of adding it back: it was an expense that should not have been charged.`],
            [s.draft - s.gap, 'Took the Suspense balance itself as the correction of the profit.'],
          ],
          [
            `Draft net profit ${inr(s.draft)}.`,
            ...fixes.map(([i, f]) => `(${LETTERS[i]}) ${signed(f)}: ${s.errors[i].say}.`),
            ...s.errors.flatMap((e, i) => (e.gap !== 0 && e.fix === 0 ? [`(${LETTERS[i]}) no change: it is about an asset, not about an income or an expense.`] : [])),
            `Depreciation on the amount in (${LETTERS[s.capital]}) = ${inr(s.errors[s.capital].asset!.cost)} x ${s.rate}/100 x ${12 - s.errors[s.capital].asset!.k}/12 = ${inr(s.dep)}, deducted.`,
            `Correct net profit = ${inr(s.draft)} ${fixes.map(([, f]) => signed(f)).join(' ')} - ${inr(s.dep)} = ${inr(s.corrected)}.`,
          ],
          H.corrected,
        );
      },
      verify: (q) => {
        const c = readAfterTb(q.context);
        return c.errors.every((e) => Number.isFinite(e.fix)) && q.answer === c.draft + c.fix - c.dep;
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const a = s.errors[s.capital].asset!;
        return num(
          `At what figure is machinery shown in the corrected balance sheet on ${YEAR_END}?`,
          s.machinery + a.cost - s.dep,
          [
            [s.machinery + a.cost, `Added the amount in (${LETTERS[s.capital]}) but did not depreciate it.`],
            [s.machinery - s.dep, 'Deducted the depreciation but did not add the amount to the machinery.'],
            [s.machinery + a.cost - pct(a.cost, s.rate), `Charged a full year of depreciation, although the amount belongs to the machinery only from ${dayOf(a.k)}.`],
            [s.machinery, 'Left the machinery at the draft figure.'],
          ],
          [
            `Draft machinery ${inr(s.machinery)}.`,
            `Add: the amount wrongly charged as an expense in (${LETTERS[s.capital]}) ${inr(a.cost)}.`,
            `Less: depreciation on it for ${monthsWord(12 - a.k)}, ${inr(s.dep)}.`,
            `Machinery = ${inr(s.machinery)} + ${inr(a.cost)} - ${inr(s.dep)} = ${inr(s.machinery + a.cost - s.dep)}.`,
          ],
          ['The amount that was charged as an expense belongs to the machinery.', 'An asset is shown at its cost less the depreciation charged on it.'],
        );
      },
      verify: (q) => {
        const c = readAfterTb(q.context);
        return q.answer === c.machinery + c.cost - c.dep;
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 3. A machine sold during the year (complex). Machinery A/c holds two machines bought in the two years before; one is
// sold during the year and, in most seeds, a new one is bought. The case climbs from the book value of the machine
// sold (depreciation over part years) through the entry of the sale (journal) and the year's depreciation to the net
// profit (final accounts) and the balance of Machinery A/c (ledger).
// ---------------------------------------------------------------------------------------------------------------

type Method = 'slm' | 'wdv';
const METHOD_WORDS: Record<Method, string> = { slm: 'on the original cost (straight line method)', wdv: 'on the written down value' };

/** Months counted from 1 April 2023: 0 is April 2023, 24 is April 2025, 36 is 1 April 2026. */
const ON = { y2023: 0, y2024: 12, y2025: 24, end: 36 };
/** The first day of a month counted from 1 April 2023: "1 July 2024". */
function dayAt(m: number): string {
  const k = m % 12;
  return `1 ${MONTHS[k]} ${2023 + Math.floor(m / 12) + (k >= 9 ? 1 : 0)}`;
}
/** A printed "1 <Month> <year>" as months counted from 1 April 2023, or NaN. */
function monthAt(text: string): number {
  const m = /\b1 (January|February|March|April|May|June|July|August|September|October|November|December) (20\d\d)\b/.exec(text);
  if (!m) return NaN;
  const k = MONTHS.indexOf(m[1]);
  return (Number(m[2]) - 2023 - (k >= 9 ? 1 : 0)) * 12 + k;
}

/**
 * Depreciation on one machine from the month it was bought (`from`) to `to`, year by year (years start on 1 April): the
 * charge of each year and the book value at `to`. Null when a charge is not a whole number of rupees.
 */
function depreciate(cost: number, method: Method, rate: number, from: number, to: number): { charges: number[]; value: number } | null {
  const charges: number[] = [];
  let value = cost;
  for (let start = Math.floor(from / 12) * 12; start < to; start += 12) {
    const m = Math.min(to, start + 12) - Math.max(from, start);
    if (m <= 0) continue;
    const d = ((method === 'slm' ? cost : value) * rate * m) / 1200;
    if (!clean(d)) return null;
    charges.push(d);
    value -= d;
  }
  return value > 0 ? { charges, value } : null;
}

/** The same book value in one line from the rate (no year-by-year schedule): the check `verify` sets against it. */
function valueByFormula(cost: number, method: Method, rate: number, from: number, to: number): number {
  if (to <= from) return cost;
  if (method === 'slm') return cost * (1 - (rate * (to - from)) / 1200);
  const firstEnd = Math.min(to, (Math.floor(from / 12) + 1) * 12);
  const lastStart = Math.max(firstEnd, Math.floor(to / 12) * 12);
  return cost * (1 - (rate * (firstEnd - from)) / 1200) * (1 - rate / 100) ** ((lastStart - firstEnd) / 12) * (1 - (rate * (to - lastStart)) / 1200);
}
const near = (a: number, b: number): boolean => Math.abs(a - b) < 1;

interface SoldYear {
  b: Biz;
  method: Method;
  rate: number;
  costA: number;
  fromA: number;
  costB: number;
  fromB: number;
  saleAt: number;
  sold: number;
  /** The new machine, when one is bought. */
  costC: number;
  fromC: number;
  draft: number;
  // worked out
  openA: number;
  openB: number;
  depA: number;
  bvSale: number;
  depB: number;
  depC: number;
  closeB: number;
  closeC: number;
  /** The profit on the sale; negative for a loss. */
  result: number;
  totalDep: number;
  net: number;
}

function readSoldYear(context: string | undefined) {
  const rule = lineOf(context, /^.+ runs .+ depreciated at/);
  const method: Method = rule.includes('straight line') ? 'slm' : 'wdv';
  const rate = intIn(rule, /at (\d+)% p\.a\./);
  const held = lineOf(context, 'On 1 April 2025 Machinery A/c');
  const [, costA, costB] = amountsIn(held);
  const [aText = '', bText = ''] = [...held.matchAll(/bought on (1 \w+ 20\d\d)/g)].map((m) => m[1]);
  const sale = lineOf(context, /: Machine A was sold for/);
  const bought = lineOf(context, /: Machine C was bought for/);
  const draft = amountsIn(lineOf(context, 'The draft profit'))[0];
  return {
    method, rate, costA, fromA: monthAt(aText), costB, fromB: monthAt(bText), saleAt: monthAt(sale), sold: amountsIn(sale)[0],
    costC: bought ? amountsIn(bought)[0] : 0, fromC: bought ? monthAt(bought) : ON.end, draft,
  };
}

const soldDuringYear = caseTemplate<SoldYear>({
  id: 'case-wy-machine-sold-during-year',
  topicId: T,
  conceptId: C,
  difficulty: 'complex',
  title: 'A machine sold during the year',
  setup: (rng) =>
    attempt(30, () => {
      const b = business(rng, 3);
      const method = rng.pick<Method>(['slm', 'wdv']);
      const rate = rng.pick(method === 'slm' ? [10, 15, 20] : [10, 15, 20]);
      const fromA = ON.y2023 + rng.pick([0, 3, 6, 9]);
      const fromB = ON.y2024 + rng.pick([0, 3, 6, 9]);
      const saleAt = ON.y2025 + rng.pick([3, 4, 6, 7, 9]);
      const withC = rng.next() < 0.7;
      const fromC = withC ? ON.y2025 + rng.pick([2, 3, 6, 8, 9].filter((k) => ON.y2025 + k !== saleAt)) : ON.end;
      const costA = amount(rng, 160000, 400000, 20000);
      const costB = amount(rng, 160000, 400000, 20000);
      const costC = withC ? amount(rng, 100000, 300000, 20000) : 0;
      if (costA === costB || costB === costC) return null;
      const a = depreciate(costA, method, rate, fromA, saleAt);
      const bb = depreciate(costB, method, rate, fromB, ON.end);
      const c = withC ? depreciate(costC, method, rate, fromC, ON.end) : { charges: [0], value: 0 };
      const aOpen = depreciate(costA, method, rate, fromA, ON.y2025);
      const bOpen = depreciate(costB, method, rate, fromB, ON.y2025);
      if (!a || !bb || !c || !aOpen || !bOpen) return null;
      const depA = a.charges[a.charges.length - 1];
      const depB = bb.charges[bb.charges.length - 1];
      const depC = c.charges[c.charges.length - 1];
      const away = rng.step(4000, 30000, 1000) * 100;
      const sold = Math.round((a.value + (rng.next() < 0.5 ? away : -away)) / R(1000)) * R(1000);
      const result = sold - a.value;
      if (sold <= 0 || Math.abs(result) < R(2000)) return null;
      const draft = amount(rng, 200000, 500000, 1000);
      const totalDep = depA + depB + depC;
      const net = draft - totalDep + result;
      if (!clean(net) || depA === depB) return null;
      return {
        b, method, rate, costA, fromA, costB, fromB, saleAt, sold, costC, fromC, draft,
        openA: aOpen.value, openB: bOpen.value, depA, bvSale: a.value, depB, depC, closeB: bb.value, closeC: c.value, result, totalDep, net,
      };
    }),
  context: (s) =>
    [
      `${s.b.owner} runs ${s.b.trade} in ${s.b.city}; the year ends on 31 March. Machinery is depreciated at ${s.rate}% p.a. ${METHOD_WORDS[s.method]}, for the months of use, and written off Machinery A/c.`,
      `On 1 April 2025 Machinery A/c showed ${inr(s.openA + s.openB)}: machine A, bought on ${dayAt(s.fromA)} for ${inr(s.costA)}, and machine B, bought on ${dayAt(s.fromB)} for ${inr(s.costB)}.`,
      ...[
        [s.saleAt, `${dayAt(s.saleAt)}: Machine A was sold for ${inr(s.sold)} by cheque.`] as const,
        ...(s.costC ? [[s.fromC, `${dayAt(s.fromC)}: Machine C was bought for ${inr(s.costC)} by cheque.`] as const] : []),
      ]
        .sort((x, y) => x[0] - y[0])
        .map(([, line]) => line),
      `The draft profit for the year, before any depreciation of the year and before the sale of machine A was recorded, is ${inr(s.draft)}.`,
      `The depreciation on machine A up to the date of sale is recorded first; the sale itself is then recorded in one entry.${s.costC ? '' : ' No other machine was bought.'}`,
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const months = s.saleAt - ON.y2025;
        return num(
          `What is the book value of machine A on ${dayAt(s.saleAt)}, the date of sale?`,
          s.bvSale,
          [
            [s.openA, `Gave the book value on 1 April 2025, before the depreciation for the ${monthsWord(months)} of the year of sale.`],
            [s.openA - pct(s.method === 'slm' ? s.costA : s.openA, s.rate), 'Charged a full year of depreciation in the year of sale.'],
            [s.method === 'wdv' ? valueByFormula(s.costA, 'slm', s.rate, s.fromA, s.saleAt) : valueByFormula(s.costA, 'wdv', s.rate, s.fromA, s.saleAt), s.method === 'wdv' ? 'Charged the rate on the original cost every year (straight line), not on the written down value.' : 'Charged the rate on the written down value, although the case uses the original cost.'],
            [s.costA - sumOf((depreciate(s.costA, s.method, s.rate, Math.floor(s.fromA / 12) * 12, s.saleAt) ?? { charges: [] }).charges), `Charged a full year in the year of purchase, although machine A was bought on ${dayAt(s.fromA)}.`],
            [s.costA, 'Gave the cost of the machine, without the depreciation charged on it.'],
          ],
          [
            ...(depreciate(s.costA, s.method, s.rate, s.fromA, s.saleAt)?.charges ?? []).map((d, i) => `Depreciation for ${i === 0 ? `${dayAt(s.fromA)} to 31 March 2024` : i === 1 ? 'the year 2024-25' : `1 April 2025 to ${dayAt(s.saleAt)} (${monthsWord(months)})`}: ${inr(d)}.`),
            `Book value on ${dayAt(s.saleAt)} = ${inr(s.costA)} - ${listed((depreciate(s.costA, s.method, s.rate, s.fromA, s.saleAt)?.charges ?? []).map(inr)).replace(' and ', ' - ').replaceAll(', ', ' - ')} = ${inr(s.bvSale)}.`,
          ],
          ['Work out the depreciation of each year from the purchase to the sale.', 'The first year and the year of sale count only their months of use.'],
        );
      },
      verify: (q) => {
        const c = readSoldYear(q.context);
        return near(q.answer, valueByFormula(c.costA, c.method, c.rate, c.fromA, c.saleAt));
      },
    },
    {
      kind: 'journal',
      make: (s) =>
        entry(
          `Pass the journal entry for the sale of machine A on ${dayAt(s.saleAt)}, after its depreciation up to that date has been recorded.`,
          s.result > 0
            ? [dr('bank', s.sold), cr('machinery', s.bvSale), cr('profitOnSaleOfAsset', s.result)]
            : [dr('bank', s.sold), dr('lossOnSaleOfAsset', -s.result), cr('machinery', s.bvSale)],
          [
            `Book value of machine A on the date of sale = ${inr(s.bvSale)}: this is what leaves Machinery A/c, which is credited.`,
            'The price is received by cheque: Bank A/c is debited.',
            s.result > 0
              ? `The price is ${inr(s.sold)} - ${inr(s.bvSale)} = ${inr(s.result)} more than the book value: a profit, credited to Profit on Sale of Asset A/c.`
              : `The price is ${inr(s.bvSale)} - ${inr(s.sold)} = ${inr(-s.result)} less than the book value: a loss, debited to Loss on Sale of Asset A/c.`,
          ],
          ['depreciation', 'assetDisposal', s.result > 0 ? 'lossOnSaleOfAsset' : 'profitOnSaleOfAsset'],
          ['What leaves Machinery A/c: the cost, or the book value on the date of sale?', 'The difference between the price and the book value is the profit or the loss on sale.'],
        ),
      verify: (q) => {
        const c = readSoldYear(q.context);
        const bv = valueByFormula(c.costA, c.method, c.rate, c.fromA, c.saleAt);
        const out = q.expected.find((l) => l.accountId === 'machinery');
        const gain = q.expected.find((l) => l.accountId === 'profitOnSaleOfAsset' || l.accountId === 'lossOnSaleOfAsset');
        return !!out && out.side === 'Cr' && near(out.amount, bv) && !!gain && near(gain.amount, Math.abs(c.sold - bv)) && (gain.accountId === 'profitOnSaleOfAsset') === c.sold > bv;
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const partA = s.saleAt - ON.y2025;
        const partC = ON.end - s.fromC;
        return num(
          `What is the total depreciation on machinery charged to the Profit and Loss Account for the year ended ${YEAR_END}?`,
          s.totalDep,
          [
            [s.depB + s.depC, 'Left out the depreciation on machine A up to the date of sale.'],
            [s.depA + s.depB, s.costC ? 'Left out the depreciation on machine C for its months of use.' : null],
            [s.costC ? s.depA + s.depB + pct(s.costC, s.rate) : null, `Charged a full year on machine C, which was bought on ${dayAt(s.fromC)}.`],
            [pct(s.method === 'slm' ? s.costA : s.openA, s.rate) + s.depB + s.depC, 'Charged a full year on machine A, although it was sold during the year.'],
            [pct(s.openA + s.openB, s.rate) + s.depC, s.method === 'wdv' ? 'Charged the rate on the opening balance of the whole account, as if machine A had been kept all year.' : null],
          ],
          [
            `Machine A, ${monthsWord(partA)} to the date of sale: ${inr(s.depA)}.`,
            `Machine B, the whole year: ${inr(s.depB)}.`,
            ...(s.costC ? [`Machine C, ${monthsWord(partC)} from ${dayAt(s.fromC)}: ${inr(s.depC)}.`] : []),
            `Total depreciation = ${added([s.depA, s.depB, ...(s.costC ? [s.depC] : [])])}.`,
          ],
          H.partYear,
        );
      },
      verify: (q) => {
        const c = readSoldYear(q.context);
        const v = (cost: number, from: number, to: number) => valueByFormula(cost, c.method, c.rate, from, to);
        const dep = v(c.costA, c.fromA, ON.y2025) - v(c.costA, c.fromA, c.saleAt) + v(c.costB, c.fromB, ON.y2025) - v(c.costB, c.fromB, ON.end) + (c.costC ? c.costC - v(c.costC, c.fromC, ON.end) : 0);
        return near(q.answer, dep);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          `What is the net profit for the year ended ${YEAR_END} after the depreciation and the sale of machine A are recorded?`,
          s.net,
          [
            [s.draft - s.totalDep - s.result, s.result > 0 ? 'Deducted the profit on sale instead of adding it.' : 'Added the loss on sale instead of deducting it.'],
            [s.draft - s.totalDep, `Left out the ${s.result > 0 ? 'profit' : 'loss'} on the sale of machine A.`],
            [s.draft - s.totalDep + s.sold - s.costA, 'Took the result of the sale as the price less the cost, ignoring the depreciation charged on machine A.'],
            [s.draft + s.result, 'Left out the depreciation of the year.'],
            [s.draft - s.totalDep + s.result + s.depA, 'Left out the depreciation on machine A up to the date of sale.'],
          ],
          [
            `Draft profit ${inr(s.draft)}.`,
            `Less: depreciation of the year ${inr(s.totalDep)}.`,
            s.result > 0 ? `Add: profit on the sale of machine A ${inr(s.result)}.` : `Less: loss on the sale of machine A ${inr(-s.result)}.`,
            `Net profit = ${inr(s.draft)} - ${inr(s.totalDep)} ${s.result > 0 ? '+' : '-'} ${inr(Math.abs(s.result))} = ${inr(s.net)}.`,
          ],
          ['Depreciation is an expense of the year.', 'A profit on the sale of an asset is a gain, credited to the Profit and Loss Account; a loss is debited to it.'],
        ),
      verify: (q) => {
        const c = readSoldYear(q.context);
        const v = (cost: number, from: number, to: number) => valueByFormula(cost, c.method, c.rate, from, to);
        const bv = v(c.costA, c.fromA, c.saleAt);
        const dep = v(c.costA, c.fromA, ON.y2025) - bv + v(c.costB, c.fromB, ON.y2025) - v(c.costB, c.fromB, ON.end) + (c.costC ? c.costC - v(c.costC, c.fromC, ON.end) : 0);
        return near(q.answer, c.draft - dep + c.sold - bv);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          `What is the balance of Machinery A/c on ${YEAR_END}, after the depreciation of the year?`,
          s.closeB + s.closeC,
          [
            [s.closeB + s.costC, s.costC ? 'Left machine C at its cost, without its depreciation.' : null],
            [s.openA + s.openB + s.costC - s.totalDep - s.sold, 'Took the price of machine A out of the account instead of its book value.'],
            [s.openA + s.openB + s.costC - s.totalDep, 'Left machine A in the account, as if it had not been sold.'],
            [s.closeB + s.closeC + s.depB, 'Left out the depreciation on machine B.'],
          ],
          [
            `Machine B: ${inr(s.openB)} - ${inr(s.depB)} = ${inr(s.closeB)}.`,
            ...(s.costC ? [`Machine C: ${inr(s.costC)} - ${inr(s.depC)} = ${inr(s.closeC)}.`] : []),
            'Machine A has left the account: its book value went out with the sale.',
            `Balance = ${added([s.closeB, ...(s.costC ? [s.closeC] : [])])}.`,
          ],
          ['Which machines are still in the account on 31 March?', 'Each is shown at its cost less all the depreciation charged on it.'],
        ),
      verify: (q) => {
        const c = readSoldYear(q.context);
        return near(q.answer, valueByFormula(c.costB, c.method, c.rate, c.fromB, ON.end) + (c.costC ? valueByFormula(c.costC, c.method, c.rate, c.fromC, ON.end) : 0));
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 4. The bank at the year end (medium). The cash book and the pass book disagree on 31 March: two items are timing
// differences that need no entry, three are known only from the pass book and must be entered in the cash book
// first. The case climbs from which items need an entry (bank reconciliation), through one of those entries
// (journal), to the bank balance of the balance sheet, the pass book balance and the corrected profit.
// ---------------------------------------------------------------------------------------------------------------

/** An item found on comparing the cash book with the pass book. */
interface BankItem {
  text: string;
  /** What entering it does to the cash book balance (nothing for a timing difference). */
  cb: number;
  /** Pass book balance less the amended cash book balance, caused by it (only a timing difference has one). */
  pb: number;
  /** What it does to the profit of the year. */
  profit: number;
  /** Its entry, for an item known only from the pass book. */
  lines?: JournalLine[];
  why?: string[];
}

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi'];

const TIMING_ITEMS: ((rng: Rng) => BankItem)[] = [
  (rng) => {
    const x = amount(rng, 8000, 40000, 500);
    return { text: `Cheques of ${inr(x)} issued to suppliers in March were presented for payment only in April.`, cb: 0, pb: x, profit: 0 };
  },
  (rng) => {
    const x = amount(rng, 8000, 40000, 500);
    return { text: `Cheques of ${inr(x)} paid into the bank on 31 March were credited by the bank only in April.`, cb: 0, pb: -x, profit: 0 };
  },
];

/** Items known only from the pass book: the cash book must take them in. */
const PASS_BOOK_ITEMS: Record<'charges' | 'interest' | 'dishonour' | 'direct' | 'telephone', (rng: Rng, name: string) => BankItem> = {
  charges: (rng) => {
    const x = amount(rng, 300, 2500, 100);
    return {
      text: `Bank charges of ${inr(x)} appear only in the pass book.`,
      cb: -x,
      pb: 0,
      profit: -x,
      lines: [dr('bankCharges', x), cr('bank', x)],
      why: ['Bank charges are an expense of the business: Bank Charges A/c is debited.', 'The bank has taken the money from the account: Bank A/c is credited.'],
    };
  },
  interest: (rng) => {
    const x = amount(rng, 500, 4000, 100);
    return {
      text: `Interest of ${inr(x)} allowed by the bank appears only in the pass book.`,
      cb: x,
      pb: 0,
      profit: x,
      lines: [dr('bank', x), cr('interestReceived', x)],
      why: ['The bank has added the interest to the account: Bank A/c is debited.', 'It is an income of the business: Interest Received A/c is credited.'],
    };
  },
  dishonour: (rng, name) => {
    const x = amount(rng, 4000, 20000, 500);
    return {
      text: `A cheque of ${inr(x)} received from ${name} and paid into the bank in March was dishonoured; only the pass book shows this.`,
      cb: -x,
      pb: 0,
      profit: 0,
      lines: [dr(`debtor:${name}`, x), cr('bank', x)],
      why: [`The cheque was not honoured, so ${name} owes the amount again: ${name}'s account is debited.`, 'The bank has taken back the amount it credited: Bank A/c is credited.'],
    };
  },
  direct: (rng, name) => {
    const x = amount(rng, 4000, 20000, 500);
    return {
      text: `${name}, a customer, paid ${inr(x)} straight into the bank account; only the pass book shows this.`,
      cb: x,
      pb: 0,
      profit: 0,
      lines: [dr('bank', x), cr(`debtor:${name}`, x)],
      why: ['The money is in the bank: Bank A/c is debited.', `${name} has paid and owes that much less: ${name}'s account is credited.`],
    };
  },
  telephone: (rng) => {
    const x = amount(rng, 1000, 5000, 100);
    return {
      text: `The telephone bill of ${inr(x)} for March was paid by the bank under a standing instruction; only the pass book shows this.`,
      cb: -x,
      pb: 0,
      profit: -x,
      lines: [dr('telephone', x), cr('bank', x)],
      why: ['The telephone bill is an expense of this year: Telephone A/c is debited.', 'The bank paid it from the account: Bank A/c is credited.'],
    };
  },
};

/** What a printed item does, read from its words alone. */
const BANK_READERS: [RegExp, (x: number) => Pick<BankItem, 'cb' | 'pb' | 'profit'>][] = [
  [/^Cheques of ₹[\d,]+ issued to suppliers in March were presented for payment only in April\.$/, (x) => ({ cb: 0, pb: x, profit: 0 })],
  [/^Cheques of ₹[\d,]+ paid into the bank on 31 March were credited by the bank only in April\.$/, (x) => ({ cb: 0, pb: -x, profit: 0 })],
  [/^Bank charges of ₹[\d,]+ appear only in the pass book\.$/, (x) => ({ cb: -x, pb: 0, profit: -x })],
  [/^Interest of ₹[\d,]+ allowed by the bank appears only in the pass book\.$/, (x) => ({ cb: x, pb: 0, profit: x })],
  [/^A cheque of ₹[\d,]+ received from .+ was dishonoured; only the pass book shows this\.$/, (x) => ({ cb: -x, pb: 0, profit: 0 })],
  [/^.+, a customer, paid ₹[\d,]+ straight into the bank account; only the pass book shows this\.$/, (x) => ({ cb: x, pb: 0, profit: 0 })],
  [/^The telephone bill of ₹[\d,]+ for March was paid by the bank under a standing instruction; only the pass book shows this\.$/, (x) => ({ cb: -x, pb: 0, profit: -x })],
];

function readBankYear(context: string | undefined) {
  const items = (context ?? '').split('\n').flatMap((line) => {
    const m = /^\(([ivx]+)\) (.+)$/.exec(line);
    if (!m) return [];
    const hits = BANK_READERS.filter(([re]) => re.test(m[2]));
    const x = amountsIn(m[2])[0];
    return [{ no: m[1], ...(hits.length === 1 ? hits[0][1](x) : { cb: NaN, pb: NaN, profit: NaN }) }];
  });
  const book = amountsIn(lineOf(context, /bank column of the cash book shows/))[0];
  const draft = amountsIn(lineOf(context, 'The draft profit'))[0];
  const amended = book + sumOf(items.map((i) => i.cb));
  return { items, book, draft, amended, passBook: amended + sumOf(items.map((i) => i.pb)), profit: draft + sumOf(items.map((i) => i.profit)) };
}

interface BankYear {
  b: Biz;
  book: number;
  draft: number;
  items: BankItem[];
  /** The item whose entry is asked for: a dishonoured cheque or a customer's direct payment. */
  asked: number;
  amended: number;
  passBook: number;
  profit: number;
}

/** "(ii), (iii) and (v)". */
const numerals = (indexes: number[]): string => listed([...indexes].sort((a, b) => a - b).map((i) => `(${ROMAN[i]})`));

const bankAtYearEnd = caseTemplate<BankYear>({
  id: 'case-wy-bank-at-year-end',
  topicId: T,
  conceptId: C,
  difficulty: 'complex',
  title: 'The cash book and the pass book at the year end',
  setup: (rng) =>
    attempt(20, () => {
      const b = business(rng, 4);
      const [n1, n2] = rng.shuffle(peopleOf(b));
      const party = rng.pick(['dishonour', 'direct'] as const);
      const others = rng.shuffle(['charges', 'interest', 'telephone', party === 'dishonour' ? 'direct' : 'dishonour'] as const).slice(0, 2);
      const items = rng.shuffle([
        ...TIMING_ITEMS.map((make) => make(rng)),
        PASS_BOOK_ITEMS[party](rng, n1),
        ...others.map((k) => PASS_BOOK_ITEMS[k](rng, n2)),
      ]);
      const all = items.map((i) => amountsIn(i.text)[0]);
      // Every item changes the profit or not; at least one of those that need an entry must change it.
      if (new Set(all).size !== all.length || !items.some((i) => i.profit !== 0)) return null;
      const book = amount(rng, 40000, 200000, 500);
      const draft = amount(rng, 150000, 450000, 1000);
      const amended = book + sumOf(items.map((i) => i.cb));
      const passBook = amended + sumOf(items.map((i) => i.pb));
      const profit = draft + sumOf(items.map((i) => i.profit));
      if (amended < R(10000) || passBook < R(10000)) return null;
      return { b, book, draft, items, asked: items.findIndex((i) => i.lines?.some((l) => l.accountId.startsWith('debtor:'))), amended, passBook, profit };
    }),
  context: (s) =>
    [
      `${s.b.owner} runs ${s.b.trade} in ${s.b.city}. On ${YEAR_END}, the year end, the bank column of the cash book shows a debit balance of ${inr(s.book)}, which does not agree with the pass book. On comparing the two:`,
      ...s.items.map((it, i) => `(${ROMAN[i]}) ${it.text}`),
      `The draft profit for the year, before any of these items is entered in the books, is ${inr(s.draft)}.`,
    ].join('\n'),
  parts: [
    {
      kind: 'mcq',
      make: (s) => {
        const need = s.items.flatMap((it, i) => (it.lines ? [i] : []));
        const timing = s.items.flatMap((it, i) => (it.lines ? [] : [i]));
        const profitOnly = s.items.flatMap((it, i) => (it.profit !== 0 ? [i] : []));
        return choice(
          'Which items must be entered in the cash book before the bank balance is shown in the balance sheet?',
          `${numerals(need)} only`,
          [
            [`${numerals(timing)} only`, 'Took the timing differences for items to be entered. The cash book already has those cheques; the bank simply had not reached them by 31 March.'],
            [`All five items`, 'Entered the timing differences as well. A cheque issued or paid in is already in the cash book; only what the cash book has not yet heard of is entered.'],
            [`${numerals(profitOnly)} only`, 'Entered only the items that change the profit. A dishonoured cheque or a payment straight into the bank changes no profit, but it changes the bank balance.'],
            [`${numerals([...need.slice(0, -1), timing[0]])} only`, 'Mixed a timing difference in with the items known only from the pass book.'],
          ],
          `Items ${numerals(need)} are known only from the pass book: the business learns of them from it, so the cash book takes them in. Items ${numerals(timing)} are timing differences: the cash book is right, and the bank records them in April. They appear only in the reconciliation statement.`,
          ['Which items has the cash book not heard of until the pass book arrived?', 'A cheque issued or paid in is already in the cash book: the delay is the bank\'s.'],
        );
      },
      verify: (q) => {
        const c = readBankYear(q.context);
        const need = c.items.flatMap((it, i) => (it.cb !== 0 ? [i] : []));
        return c.items.every((it) => Number.isFinite(it.cb)) && picked(q) === `${numerals(need)} only`;
      },
    },
    {
      kind: 'journal',
      make: (s) => {
        const it = s.items[s.asked];
        return entry(`Pass the journal entry for item (${ROMAN[s.asked]}).`, it.lines!, it.why!, ['cash', 'sales', 'bankCharges'], ['Did money come into the bank account, or go out of it?', 'The other account is the customer\'s, who now owes more or less.']);
      },
      verify: (q) => {
        const c = readBankYear(q.context);
        const no = /item \(([ivx]+)\)/.exec(q.prompt)?.[1];
        const it = c.items.find((x) => x.no === no);
        const bank = q.expected.find((l) => l.accountId === 'bank');
        return !!it && !!bank && bank.amount === Math.abs(it.cb) && bank.side === (it.cb > 0 ? 'Dr' : 'Cr') && it.profit === 0;
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const need = s.items.filter((it) => it.lines);
        const timing = s.items.filter((it) => !it.lines);
        return num(
          `At what figure is cash at bank shown in the balance sheet on ${YEAR_END}?`,
          s.amended,
          [
            [s.book, 'Kept the cash book balance as it was, without the items known only from the pass book.'],
            [s.passBook, 'Took the pass book balance. The balance sheet shows the cash book balance once it is brought up to date; the timing differences stay in the reconciliation.'],
            [s.book - sumOf(need.map((it) => it.cb)), 'Entered each item from the pass book on the wrong side of the cash book.'],
            [s.amended + sumOf(timing.map((it) => it.pb)), 'Brought the timing differences into the cash book as well.'],
          ],
          [
            `Cash book balance ${inr(s.book)}.`,
            ...need.map((it) => `${it.cb > 0 ? 'Add' : 'Less'}: (${ROMAN[s.items.indexOf(it)]}) ${inr(Math.abs(it.cb))}.`),
            `Amended balance = ${inr(s.book)} ${need.map((it) => `${it.cb > 0 ? '+' : '-'} ${inr(Math.abs(it.cb))}`).join(' ')} = ${inr(s.amended)}: this is the bank balance of the balance sheet.`,
          ],
          ['First bring the cash book up to date with the items it has not yet recorded.', 'The timing differences need no entry: the cash book is right about them.'],
        );
      },
      verify: (q) => q.answer === readBankYear(q.context).amended,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const timing = s.items.filter((it) => !it.lines);
        return num(
          `What is the balance as per the pass book on ${YEAR_END}?`,
          s.passBook,
          [
            [s.amended - sumOf(timing.map((it) => it.pb)), 'Reversed the timing differences: cheques not yet presented make the pass book balance larger, cheques not yet credited make it smaller.'],
            [s.book + sumOf(timing.map((it) => it.pb)), 'Started from the cash book balance before it was brought up to date with the items known only from the pass book.'],
            [s.amended, 'Took the amended cash book balance, leaving out the timing differences.'],
          ],
          [
            `Start from the amended cash book balance ${inr(s.amended)}.`,
            ...timing.map((it) => `(${ROMAN[s.items.indexOf(it)]}) ${it.pb > 0 ? `Add ${inr(it.pb)}: the bank has not yet paid these cheques.` : `Less ${inr(-it.pb)}: the bank has not yet credited these cheques.`}`),
            `Balance as per pass book = ${inr(s.amended)} ${timing.map((it) => `${it.pb > 0 ? '+' : '-'} ${inr(Math.abs(it.pb))}`).join(' ')} = ${inr(s.passBook)}.`,
          ],
          ['Once the cash book is amended, only the timing differences are left between the two balances.', 'A cheque issued but not presented is still in the bank account; one paid in but not credited is not yet there.'],
        );
      },
      verify: (q) => q.answer === readBankYear(q.context).passBook,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const changing = s.items.filter((it) => it.profit !== 0);
        const party = s.items.filter((it) => it.lines && it.profit === 0);
        return num(
          `What is the net profit for the year after the items are entered in the books?`,
          s.profit,
          [
            [s.draft, 'Left the profit as it was. Bank charges, interest and bills paid by the bank are expenses and incomes of the year.'],
            [s.profit + sumOf(party.map((it) => it.cb)), 'Took a dishonoured cheque or a customer\'s payment into the bank as a loss or a gain. It changes only the debtor and the bank.'],
            [s.draft - sumOf(changing.map((it) => it.profit)), 'Took each item the wrong way round, adding the expenses and deducting the income.'],
            [s.profit + sumOf(s.items.filter((it) => !it.lines).map((it) => it.pb)), 'Took the timing differences into the profit. Cheques issued or paid in are already in the books.'],
          ],
          [
            `Draft profit ${inr(s.draft)}.`,
            ...changing.map((it) => `(${ROMAN[s.items.indexOf(it)]}) ${it.profit > 0 ? `+ ${inr(it.profit)}: an income` : `- ${inr(-it.profit)}: an expense`}.`),
            ...party.map((it) => `(${ROMAN[s.items.indexOf(it)]}) no change: it moves money between the bank and a customer's account.`),
            `Net profit = ${inr(s.draft)} ${changing.map((it) => `${it.profit > 0 ? '+' : '-'} ${inr(Math.abs(it.profit))}`).join(' ')} = ${inr(s.profit)}.`,
          ],
          ['Which of the items are an expense or an income of the year?', 'Timing differences, a dishonoured cheque and a payment by a customer change no profit.'],
        );
      },
      verify: (q) => q.answer === readBankYear(q.context).profit,
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 5. The proprietor's capital through the year (medium). Capital at the start, more brought in during the year in
// most seeds, cash drawn and goods taken, and interest on capital. The case climbs from the interest on capital and the
// entry for the goods taken (journal), through the principle behind the interest (theory base), to the net profit and
// the closing capital (the accounting equation). Version 2 leaves out the interest on drawings it charged until then:
// the Class 11 syllabus lists interest on capital among the adjustments, not interest on drawings.
// ---------------------------------------------------------------------------------------------------------------

interface OwnerYear {
  b: Biz;
  capital: number;
  more: number;
  kMore: number;
  /** Cash drawn: on one day (`kDrawn`), or evenly through the year (`kDrawn` is -1). */
  drawn: number;
  kDrawn: number;
  goods: number;
  price: number;
  kGoods: number;
  rate: number;
  draft: number;
  ioc: number;
  net: number;
  closing: number;
}

function readOwnerYear(context: string | undefined) {
  const capital = amountsIn(lineOf(context, /Capital on 1 April 2025 was/))[0];
  const moreLine = lineOf(context, /brought in further capital/);
  const drawLine = lineOf(context, /^The proprietor withdrew/);
  const goodsLine = lineOf(context, /took goods costing/);
  const rates = lineOf(context, /^Interest is allowed on capital/);
  const evenly = drawLine.includes('evenly');
  return {
    capital,
    more: moreLine ? amountsIn(moreLine)[0] : 0,
    moreMonths: moreLine ? 12 - monthIn(moreLine) : 0,
    drawn: amountsIn(drawLine)[evenly ? 1 : 0],
    goods: amountsIn(goodsLine)[0],
    rate: intIn(rates, /on capital at (\d+)% p\.a\./),
    draft: amountsIn(lineOf(context, 'The profit before'))[0],
  };
}

const ownerYear = caseTemplate<OwnerYear>({
  id: 'case-wy-proprietor-capital',
  version: 2,
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: "The proprietor's capital through the year",
  setup: (rng) =>
    attempt(30, () => {
      const b = business(rng, 5);
      const capital = amount(rng, 300000, 900000, 50000);
      const rate = rng.pick([5, 6, 8, 10]);
      const withMore = rng.next() < 0.65;
      const more = withMore ? amount(rng, 50000, 200000, 10000) : 0;
      const kMore = withMore ? rng.pick([3, 4, 6, 7, 9]) : 0;
      const ioc = pct(capital, rate) + (more * rate * (12 - kMore)) / 1200;
      const evenly = rng.next() < 0.5;
      const kDrawn = evenly ? -1 : rng.pick([3, 4, 6, 7, 9]);
      const drawn = evenly ? 12 * amount(rng, 2000, 8000, 500) : amount(rng, 20000, 80000, 5000);
      const goods = amount(rng, 3000, 15000, 1000);
      const price = pct(goods, rng.pick([120, 125, 150]));
      const kGoods = rng.pick([1, 2, 5, 8, 10]);
      const draft = amount(rng, 150000, 400000, 1000);
      const net = draft + goods - ioc;
      const closing = capital + more + ioc + net - drawn - goods;
      if (![ioc, price, net, closing].every(clean)) return null;
      return { b, capital, more, kMore, drawn, kDrawn, goods, price, kGoods, rate, draft, ioc, net, closing };
    }),
  context: (s) =>
    [
      `${s.b.owner} runs ${s.b.trade} in ${s.b.city}; the year ends on 31 March. Capital on 1 April 2025 was ${inr(s.capital)}.`,
      ...(s.more ? [`On ${dayOf(s.kMore)} the proprietor brought in further capital of ${inr(s.more)} in cash.`] : []),
      s.kDrawn < 0
        ? `The proprietor withdrew ${inr(s.drawn / 12)} in cash every month, ${inr(s.drawn)} in the year, evenly through the year.`
        : `The proprietor withdrew ${inr(s.drawn)} in cash on ${dayOf(s.kDrawn)}; there were no other cash drawings.`,
      `On ${dayOf(s.kGoods)} the proprietor took goods costing ${inr(s.goods)} (selling price ${inr(s.price)}) for personal use; no entry has been made.`,
      `Interest is allowed on capital at ${s.rate}% p.a.`,
      `The profit before interest on capital, and before the goods taken are recorded, is ${inr(s.draft)}.`,
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          `What is the interest on capital for the year ended ${YEAR_END}?`,
          s.ioc,
          [
            [s.more ? pct(s.capital, s.rate) : null, 'Left out the interest on the capital brought in during the year.'],
            [s.more ? pct(s.capital + s.more, s.rate) : null, `Allowed a full year on the capital brought in on ${dayOf(s.kMore)}.`],
            [s.more ? s.ioc - (s.more * s.rate) / 1200 : null, 'Counted the months of the further capital from the month after it was brought in.'],
            [pct(s.capital - s.drawn, s.rate), 'Worked the interest on the capital less the drawings. Interest is allowed on the capital, from the dates it was in the business.'],
            [s.ioc / 2, 'Allowed interest for six months only. Capital earns interest for the whole time it is in the business.'],
          ],
          [
            `On the opening capital, the whole year: ${inr(s.capital)} x ${s.rate}/100 = ${inr(pct(s.capital, s.rate))}.`,
            ...(s.more ? [`On the further capital, ${dayOf(s.kMore)} to ${YEAR_END} (${monthsWord(12 - s.kMore)}): ${inr(s.more)} x ${s.rate}/100 x ${12 - s.kMore}/12 = ${inr((s.more * s.rate * (12 - s.kMore)) / 1200)}.`] : []),
            ...(s.more ? [`Interest on capital = ${added([pct(s.capital, s.rate), (s.more * s.rate * (12 - s.kMore)) / 1200])}.`] : []),
          ],
          ['Interest on capital is for the time the capital was in the business.', 'Capital brought in during the year earns interest from that date only.'],
        ),
      verify: (q) => {
        const c = readOwnerYear(q.context);
        return q.answer === pct(c.capital, c.rate) + (c.more * c.rate * c.moreMonths) / 1200;
      },
    },
    {
      kind: 'journal',
      make: (s) =>
        entry(
          `Pass the journal entry for the goods taken by the proprietor on ${dayOf(s.kGoods)}.`,
          [dr('drawings', s.goods), cr('purchases', s.goods)],
          ['Goods taken for personal use are drawings of the proprietor: Drawings A/c is debited.', `They leave the goods bought for sale at their cost, ${inr(s.goods)}, not at the selling price: Purchases A/c is credited.`],
          ['sales', 'capital'],
          ['Has anything been sold?', 'The goods leave the business at cost, through Purchases A/c.'],
        ),
      verify: (q) => entryIs(q, [dr('drawings', readOwnerYear(q.context).goods), cr('purchases', readOwnerYear(q.context).goods)]),
    },
    {
      kind: 'mcq',
      make: () =>
        choice(
          'The interest on capital is debited to the Profit and Loss Account, although it is only credited to the proprietor\'s own capital. Which principle makes it a charge of the business?',
          'Business entity: the business and the proprietor are treated as separate',
          [
            ['Going concern: the business will go on for the foreseeable future', 'Going concern is about valuing assets on the footing that the business continues; it does not make the owner a separate party.'],
            ['Money measurement: only what can be stated in money is recorded', 'Money measurement decides what is recorded at all, not who is charged.'],
            ['Matching: the expenses of a period are set against its revenue', 'Matching decides the year an expense belongs to; the interest is a charge only because the business is a separate party from the owner.'],
            ['Full disclosure: every material fact is shown in the accounts', 'Full disclosure is about what the statements reveal, not about treating the proprietor as an outsider.'],
          ],
          'Under the business entity principle the business is separate from its owner. The capital is what the business owes the proprietor, so interest on it is a cost to the business, credited to the proprietor like interest to any lender, and the drawings are amounts the proprietor takes out of the business, which reduce the capital.',
          ['Whose books are these, the proprietor\'s or the business\'s?', 'One principle treats the owner as a party apart from the business.'],
        ),
      verify: (q) => picked(q).startsWith('Business entity'),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          `What is the net profit for the year ended ${YEAR_END}?`,
          s.net,
          [
            [s.draft - s.ioc, 'Left the goods taken out. Recording them takes their cost out of purchases, which raises the profit.'],
            [s.draft + s.price - s.ioc, 'Took the goods out of purchases at their selling price instead of their cost.'],
            [s.draft - s.goods - s.ioc, 'Deducted the goods taken from the profit. Recording them takes their cost out of purchases, which raises the profit.'],
            [s.draft + s.goods, 'Left out the interest on capital, which is an expense of the business.'],
            [s.draft + s.goods + s.ioc, 'Added the interest on capital to the profit. It is an expense of the business.'],
          ],
          [
            `Profit before the items ${inr(s.draft)}.`,
            `Add: goods taken, out of purchases at cost ${inr(s.goods)}.`,
            `Less: interest on capital ${inr(s.ioc)}.`,
            `Net profit = ${inr(s.draft)} + ${inr(s.goods)} - ${inr(s.ioc)} = ${inr(s.net)}.`,
          ],
          ['Interest on capital is an expense of the business.', 'Goods taken by the proprietor come out of purchases at cost, which raises the profit.'],
        ),
      verify: (q) => {
        const c = readOwnerYear(q.context);
        const ioc = pct(c.capital, c.rate) + (c.more * c.rate * c.moreMonths) / 1200;
        return q.answer === c.draft + c.goods - ioc;
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          `What is the proprietor's capital on ${YEAR_END}?`,
          s.closing,
          [
            [s.closing + s.goods, 'Left the goods taken out of the drawings.'],
            [s.closing - s.ioc, 'Left out the interest on capital, which is credited to the capital as well as charged in the Profit and Loss Account.'],
            [s.closing + s.ioc, 'Added the interest on capital to the capital without charging it against the profit.'],
            [s.more ? s.closing - s.more : null, 'Left out the further capital brought in.'],
            [s.closing + s.drawn, 'Did not deduct the cash drawn.'],
          ],
          [
            `Opening capital ${inr(s.capital)}${s.more ? ` + further capital ${inr(s.more)}` : ''} + interest on capital ${inr(s.ioc)} + net profit ${inr(s.net)} = ${inr(s.capital + s.more + s.ioc + s.net)}.`,
            `Less: cash drawings ${inr(s.drawn)} and goods taken ${inr(s.goods)}: ${inr(s.drawn + s.goods)}.`,
            `Closing capital = ${inr(s.capital + s.more + s.ioc + s.net)} - ${inr(s.drawn + s.goods)} = ${inr(s.closing)}.`,
          ],
          ['Closing capital = opening capital + further capital + interest on capital + net profit - drawings.', 'Goods taken by the proprietor are drawings too.'],
        ),
      verify: (q) => {
        const c = readOwnerYear(q.context);
        const ioc = pct(c.capital, c.rate) + (c.more * c.rate * c.moreMonths) / 1200;
        const net = c.draft + c.goods - ioc;
        return q.answer === c.capital + c.more + ioc + net - c.drawn - c.goods;
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 6. The gross profit from the books of the year (medium). The totals of the subsidiary books and of the cash book,
// the stocks and the direct expenses, with one entry made in the wrong book and goods taken by the proprietor. The case
// climbs from the book the entry belonged in (subsidiary books) and its rectifying entry (rectification) to the net
// purchases, the cost of goods sold and the gross profit (final accounts).
// ---------------------------------------------------------------------------------------------------------------

interface BooksYear {
  b: Biz;
  os: number;
  cs: number;
  pb: number;
  cp: number;
  pr: number;
  sb: number;
  cashSales: number;
  sr: number;
  wages: number;
  carriageIn: number;
  carriageOut: number;
  goods: number;
  /** The entry made in the wrong book: an asset bought on credit in the Purchases Book, or a customer's return in the Purchases Return Book. */
  slip: 'asset' | 'return';
  asset: 'computers' | 'furniture';
  x: number;
  customer: string;
  // worked out, after the slip is put right
  netPurchases: number;
  netSales: number;
  cogs: number;
  gross: number;
}

const ASSET_BOUGHT = { computers: 'a computer for the office', furniture: 'a showcase for the shop' } as const;

function readBooksYear(context: string | undefined) {
  const get = (label: string) => amountsIn(lineOf(context, `${label}: `))[0] ?? 0;
  const slip = lineOf(context, '(a)');
  const goods = amountsIn(lineOf(context, '(b)'))[0];
  const x = amountsIn(slip)[0];
  const asset = /entered in the Purchases Book/.test(slip);
  const ret = /entered in the Purchases Return Book/.test(slip);
  const netPurchases = get('Purchases Book') - (asset ? x : 0) + get('Cash purchases of goods') - (get('Purchases Return Book') - (ret ? x : 0)) - goods;
  const netSales = get('Sales Book') + get('Cash sales') - get('Sales Return Book') - (ret ? x : 0);
  const cogs = get('Stock on 1 April 2025') + netPurchases + get('Wages') + get('Carriage inwards') - get('Stock on 31 March 2026');
  return { asset, ret, x, netPurchases, netSales, cogs, gross: netSales - cogs, ok: asset !== ret };
}

const booksYear = caseTemplate<BooksYear>({
  id: 'case-wy-gross-profit-from-books',
  topicId: T,
  conceptId: C,
  difficulty: 'complex',
  title: 'The gross profit from the books of the year',
  setup: (rng) =>
    attempt(20, () => {
      const b = business(rng, 6);
      const os = amount(rng, 40000, 120000, 5000);
      const cs = amount(rng, 50000, 150000, 5000);
      const truePb = amount(rng, 300000, 800000, 10000);
      const cp = amount(rng, 20000, 100000, 5000);
      const truePr = amount(rng, 5000, 30000, 1000);
      const goods = amount(rng, 2000, 12000, 1000);
      const wages = amount(rng, 20000, 80000, 2000);
      const carriageIn = amount(rng, 5000, 20000, 1000);
      const carriageOut = amount(rng, 4000, 15000, 1000);
      const slip = rng.pick(['asset', 'return'] as const);
      const x = slip === 'asset' ? amount(rng, 20000, 80000, 5000) : amount(rng, 3000, 15000, 1000);
      const netPurchases = truePb + cp - truePr - goods;
      const cogs = os + netPurchases + wages + carriageIn - cs;
      const gross = Math.round(pct(cogs, rng.pick([20, 25, 30, 35])) / R(1000)) * R(1000);
      const netSales = cogs + gross;
      const trueSr = amount(rng, 5000, 25000, 1000) + (slip === 'return' ? x : 0);
      const cashSales = amount(rng, 30000, 150000, 5000);
      const sb = netSales + trueSr - cashSales;
      const amounts = [x, goods, carriageIn, carriageOut, truePr, trueSr];
      if (sb < R(100000) || gross < R(20000) || new Set(amounts).size !== amounts.length) return null;
      return {
        b, os, cs, pb: truePb + (slip === 'asset' ? x : 0), cp, pr: truePr + (slip === 'return' ? x : 0), sb, cashSales, sr: trueSr - (slip === 'return' ? x : 0),
        wages, carriageIn, carriageOut, goods, slip, asset: rng.pick(['computers', 'furniture'] as const), x, customer: rng.pick(peopleOf(b)), netPurchases, netSales, cogs, gross,
      };
    }),
  context: (s) =>
    [
      `${s.b.owner} runs ${s.b.trade} in ${s.b.city}. The books for the year ended ${YEAR_END} give these totals:`,
      `Purchases Book: ${inr(s.pb)}`,
      `Purchases Return Book: ${inr(s.pr)}`,
      `Sales Book: ${inr(s.sb)}`,
      `Sales Return Book: ${inr(s.sr)}`,
      `Cash purchases of goods: ${inr(s.cp)}`,
      `Cash sales: ${inr(s.cashSales)}`,
      `Wages: ${inr(s.wages)}`,
      `Carriage inwards: ${inr(s.carriageIn)}`,
      `Carriage outwards: ${inr(s.carriageOut)}`,
      `Stock on 1 April 2025: ${inr(s.os)}`,
      `Stock on 31 March 2026: ${inr(s.cs)}`,
      s.slip === 'asset'
        ? `(a) ${cap(ASSET_BOUGHT[s.asset])}, bought on credit for ${inr(s.x)}, was entered in the Purchases Book.`
        : `(a) Goods of ${inr(s.x)} returned by ${s.customer}, a customer, were entered in the Purchases Return Book.`,
      `(b) Goods costing ${inr(s.goods)} were taken by the proprietor for personal use; no entry has been made.`,
    ].join('\n'),
  parts: [
    {
      kind: 'mcq',
      make: (s) =>
        s.slip === 'asset'
          ? choice(
              `In which book should ${ASSET_BOUGHT[s.asset]}, bought on credit, have been entered?`,
              'The journal proper',
              [
                ['The Purchases Book, as it was', 'The Purchases Book records only goods bought on credit for resale. An asset bought for use is not such goods.'],
                ['The cash book', 'Nothing was paid in cash or through the bank: the asset was bought on credit.'],
                ['The Purchases Return Book', 'Nothing was returned to a supplier.'],
                ['The Sales Book', 'Nothing was sold.'],
              ],
              'A credit purchase of an asset is not a purchase of goods for resale, and no cash moves, so no subsidiary book fits it: it is entered in the journal proper, debiting the asset account and crediting the supplier.',
              ['Is the item goods for resale, or an asset for use in the business?', 'Transactions that fit no subsidiary book go to the journal proper.'],
            )
          : choice(
              `In which book should the goods returned by ${s.customer} have been entered?`,
              'The Sales Return Book',
              [
                ['The Purchases Return Book, as it was', 'The Purchases Return Book records goods the business returns to its suppliers, not goods its customers return.'],
                ['The Sales Book', 'A return reverses a sale; it is not a sale.'],
                ['The journal proper', 'Goods returned by a customer have a book of their own, the Sales Return (Return Inwards) Book.'],
                ['The cash book', 'No money moved: the customer\'s account is credited.'],
              ],
              'Goods sent back by a customer are returns inwards: they are entered in the Sales Return Book, debiting Sales Return A/c and crediting the customer.',
              ['Who returned the goods: the business or its customer?', 'Each kind of return has a book of its own.'],
            ),
      verify: (q) => {
        const c = readBooksYear(q.context);
        return c.ok && picked(q) === (c.asset ? 'The journal proper' : 'The Sales Return Book');
      },
    },
    {
      kind: 'journal',
      make: (s) =>
        s.slip === 'asset'
          ? entry(
              'Pass the rectifying entry for (a).',
              [dr(s.asset, s.x), cr('purchases', s.x)],
              ['The total of the Purchases Book was debited to Purchases A/c, so the asset is in purchases: Purchases A/c is credited.', `It is an asset: ${s.asset === 'computers' ? 'Computers' : 'Furniture'} A/c is debited. The supplier was rightly credited, so that account is not touched.`],
              ['suspense', 'stock'],
              ['Which account wrongly holds the amount, and which should hold it?', 'The supplier\'s account is right whichever book was used.'],
            )
          : entry(
              'Pass the rectifying entry for (a).',
              [dr('salesReturn', s.x), dr('purchasesReturn', s.x), cr(`debtor:${s.customer}`, 2 * s.x)],
              [
                `From the Purchases Return Book, ${s.customer}'s account was debited ${inr(s.x)} where it should have been credited: it is credited ${inr(2 * s.x)}.`,
                `Purchases Return A/c was credited ${inr(s.x)} that does not belong to it: it is debited ${inr(s.x)}.`,
                `Sales Return A/c should have been debited ${inr(s.x)}: it is debited now.`,
              ],
              ['suspense', 'sales'],
              ['Write down what was posted and what should have been posted.', 'The customer was debited instead of credited, so the customer\'s account is out by twice the amount.'],
            ),
      verify: (q) => {
        const c = readBooksYear(q.context);
        const purchases = q.expected.find((l) => l.accountId === 'purchases' || l.accountId === 'purchasesReturn');
        return c.ok && !!purchases && purchases.amount === c.x && purchases.side === (c.asset ? 'Cr' : 'Dr') && !q.expected.some((l) => l.accountId === 'suspense');
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const pb = s.pb - (s.slip === 'asset' ? s.x : 0);
        const pr = s.pr - (s.slip === 'return' ? s.x : 0);
        return num(
          'What are the net purchases to be shown in the Trading Account, after (a) and (b)?',
          s.netPurchases,
          [
            [s.slip === 'asset' ? s.netPurchases + s.x : s.netPurchases - s.x, 'Took the books as they stand, without putting (a) right.'],
            [s.netPurchases + s.goods, 'Left out the goods taken by the proprietor, which come out of purchases at cost.'],
            [s.netPurchases - s.cp, 'Left out the cash purchases. The Purchases Book records only purchases on credit.'],
            [s.netPurchases + pr, 'Did not deduct the purchases returns.'],
            [s.netPurchases + s.carriageIn, 'Added the carriage inwards to the purchases; it is a direct expense of its own.'],
          ],
          [
            `Credit purchases = ${inr(s.pb)}${s.slip === 'asset' ? ` - the asset wrongly entered ${inr(s.x)} = ${inr(pb)}` : ''}.`,
            `Add: cash purchases ${inr(s.cp)}.`,
            `Less: purchases returns ${inr(s.pr)}${s.slip === 'return' ? ` - the customer's return wrongly entered ${inr(s.x)} = ${inr(pr)}` : ''}.`,
            `Less: goods taken by the proprietor, at cost ${inr(s.goods)}.`,
            `Net purchases = ${inr(pb)} + ${inr(s.cp)} - ${inr(pr)} - ${inr(s.goods)} = ${inr(s.netPurchases)}.`,
          ],
          ['Purchases = credit purchases + cash purchases.', 'Deduct the returns to suppliers and the goods that left the business without being sold.'],
        );
      },
      verify: (q) => readBooksYear(q.context).netPurchases === q.answer,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          `What is the cost of goods sold for the year ended ${YEAR_END}?`,
          s.cogs,
          [
            [s.cogs + s.carriageOut, 'Added the carriage outwards. It is a cost of delivering goods to customers, an indirect expense.'],
            [s.cogs + s.cs, 'Did not deduct the closing stock.'],
            [s.cogs - 2 * s.os + 2 * s.cs, 'Took the two stocks the wrong way round.'],
            [s.cogs - s.wages - s.carriageIn, 'Left out the direct expenses, wages and carriage inwards.'],
          ],
          [
            `Cost of goods sold = opening stock + net purchases + direct expenses - closing stock.`,
            `= ${inr(s.os)} + ${inr(s.netPurchases)} + wages ${inr(s.wages)} + carriage inwards ${inr(s.carriageIn)} - ${inr(s.cs)} = ${inr(s.cogs)}.`,
            'Carriage outwards is an indirect expense: it belongs to the Profit and Loss Account.',
          ],
          ['Cost of goods sold = opening stock + net purchases + direct expenses - closing stock.', 'Expenses of bringing goods in are direct; expenses of sending them out are not.'],
        ),
      verify: (q) => readBooksYear(q.context).cogs === q.answer,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          `What is the gross profit for the year ended ${YEAR_END}?`,
          s.gross,
          [
            [s.gross - s.cashSales, 'Left out the cash sales. The Sales Book records only sales on credit.'],
            [s.gross + s.sr + (s.slip === 'return' ? s.x : 0), 'Did not deduct the sales returns.'],
            [s.gross - s.carriageOut, 'Charged the carriage outwards in the Trading Account.'],
            [s.slip === 'return' ? s.gross + 2 * s.x : s.gross - s.x, 'Took the books as they stand, without putting (a) right.'],
            [s.gross - s.goods, 'Left the goods taken by the proprietor in purchases.'],
          ],
          [
            `Net sales = credit sales ${inr(s.sb)} + cash sales ${inr(s.cashSales)} - sales returns ${inr(s.sr)}${s.slip === 'return' ? ` - the customer's return ${inr(s.x)}` : ''} = ${inr(s.netSales)}.`,
            `Gross profit = net sales - cost of goods sold = ${inr(s.netSales)} - ${inr(s.cogs)} = ${inr(s.gross)}.`,
          ],
          ['Net sales = credit sales + cash sales - sales returns.', 'Gross profit = net sales - cost of goods sold.'],
        ),
      verify: (q) => readBooksYear(q.context).gross === q.answer,
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 7. Adjustments inside and outside the trial balance (medium). The trial balance already carries outstanding wages
// and prepaid insurance: they were adjusted before it was drawn up, so each is shown once, in the balance sheet.
// Three adjustments are given outside it, and each of those is shown twice. The case climbs from the wages of the
// Trading Account (trial balance) and the gross profit, through where an item inside the trial balance goes, to the
// net profit (adjustments) and the current liabilities (balance sheet).
// ---------------------------------------------------------------------------------------------------------------

interface InsideTb {
  b: Biz;
  os: number;
  purchases: number;
  sales: number;
  wages: number;
  owedWages: number;
  salaries: number;
  insurance: number;
  prepaid: number;
  rentReceived: number;
  creditors: number;
  cs: number;
  owedSalaries: number;
  rentAhead: number;
  /** Which item inside the trial balance the choice question asks about. */
  ask: 'wages' | 'insurance';
  /** The order the trial balance lists its ten balances in. */
  order: number[];
  gross: number;
  net: number;
  current: number;
}

function readInsideTb(context: string | undefined) {
  const get = (label: string) => {
    const line = lineOf(context, `${label}: `);
    return line ? amountsIn(line)[0] : 0;
  };
  const [cs] = amountsIn(lineOf(context, /\(1\) Closing stock/));
  const [owedSalaries] = amountsIn(lineOf(context, '(2)'));
  const [rentAhead] = amountsIn(lineOf(context, '(3)'));
  const gross = get('Sales A/c') - (get('Stock on 1 April 2025') + get('Purchases A/c') + get('Wages A/c') - cs);
  const net = gross - (get('Salaries A/c') + owedSalaries) - get('Insurance A/c') + get('Rent Received A/c') - rentAhead;
  return { wages: get('Wages A/c'), gross, net, current: get('Sundry Creditors') + get('Outstanding Wages A/c') + owedSalaries + rentAhead };
}

const insideTb = caseTemplate<InsideTb>({
  id: 'case-wy-inside-outside-trial-balance',
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: 'Adjustments inside and outside the trial balance',
  setup: (rng) =>
    attempt(20, () => {
      const b = business(rng, 7);
      const os = amount(rng, 40000, 120000, 5000);
      const cs = amount(rng, 50000, 140000, 5000);
      const purchases = amount(rng, 300000, 700000, 10000);
      const wages = amount(rng, 30000, 90000, 2000);
      const owedWages = amount(rng, 2000, 8000, 500);
      const cogs = os + purchases + wages - cs;
      const gross = Math.round(pct(cogs, rng.pick([25, 30, 35, 40])) / R(1000)) * R(1000);
      const sales = cogs + gross;
      const month = amount(rng, 4000, 10000, 500);
      const salaries = 11 * month;
      const insurance = amount(rng, 8000, 24000, 1000);
      const prepaid = amount(rng, 1000, 5000, 500);
      const sublet = amount(rng, 1500, 4000, 500);
      const rentReceived = 13 * sublet;
      const creditors = amount(rng, 40000, 120000, 5000);
      const net = gross - salaries - month - insurance + rentReceived - sublet;
      const current = creditors + owedWages + month + sublet;
      const distinct = [owedWages, prepaid, month, sublet];
      if (net < R(20000) || new Set(distinct).size !== distinct.length) return null;
      return { b, os, purchases, sales, wages, owedWages, salaries, insurance, prepaid, rentReceived, creditors, cs, owedSalaries: month, rentAhead: sublet, ask: rng.pick(['wages', 'insurance'] as const), order: rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), gross, net, current };
    }),
  context: (s) =>
    [
      `The trial balance of ${s.b.owner}, who runs ${s.b.trade} in ${s.b.city}, on ${YEAR_END} includes these balances (its other balances are the capital, the drawings and assets):`,
      ...inOrder(s.order, [
        `Stock on 1 April 2025: ${inr(s.os)} (Dr)`,
        `Purchases A/c: ${inr(s.purchases)} (Dr)`,
        `Sales A/c: ${inr(s.sales)} (Cr)`,
        `Wages A/c: ${inr(s.wages)} (Dr)`,
        `Outstanding Wages A/c: ${inr(s.owedWages)} (Cr)`,
        `Salaries A/c: ${inr(s.salaries)} (Dr)`,
        `Insurance A/c: ${inr(s.insurance)} (Dr)`,
        `Prepaid Insurance A/c: ${inr(s.prepaid)} (Dr)`,
        `Rent Received A/c: ${inr(s.rentReceived)} (Cr)`,
        `Sundry Creditors: ${inr(s.creditors)} (Cr)`,
      ]),
      `Adjustments: (1) Closing stock is valued at ${inr(s.cs)}.`,
      `(2) Salaries of ${inr(s.owedSalaries)} for March have not been paid.`,
      `(3) Rent received includes ${inr(s.rentAhead)} for April 2026. There is no other adjustment.`,
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          'At what figure are wages shown in the Trading Account?',
          s.wages,
          [
            [s.wages + s.owedWages, 'Added the outstanding wages again. They are in the trial balance, so Wages A/c already includes them.'],
            [s.wages - s.owedWages, 'Deducted the outstanding wages from the wages.'],
            [s.wages + s.owedSalaries, 'Added the unpaid salaries to the wages. Salaries are an indirect expense of their own.'],
          ],
          [
            'Outstanding wages appear in the trial balance: the adjusting entry (Wages A/c Dr, Outstanding Wages A/c Cr) was made before it was drawn up.',
            `So Wages A/c already carries them, and wages are shown at the trial balance figure, ${inr(s.wages)}. The outstanding wages go only to the balance sheet.`,
          ],
          ['Has the adjustment for the unpaid wages already been made?', 'An item that appears in the trial balance has had both its effects recorded except the last one: its place in the final accounts.'],
        ),
      verify: (q) => q.answer === readInsideTb(q.context).wages,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          `What is the gross profit for the year ended ${YEAR_END}?`,
          s.gross,
          [
            [s.gross - s.owedWages, 'Added the outstanding wages to the wages once more.'],
            [s.gross - s.cs, 'Left out the closing stock.'],
            [s.gross - 2 * s.cs + 2 * s.os, 'Took the two stocks the wrong way round.'],
            [s.gross + s.wages, 'Left the wages out of the Trading Account.'],
          ],
          [
            `Cost of goods sold = opening stock ${inr(s.os)} + purchases ${inr(s.purchases)} + wages ${inr(s.wages)} - closing stock ${inr(s.cs)} = ${inr(s.sales - s.gross)}.`,
            `Gross profit = sales ${inr(s.sales)} - ${inr(s.sales - s.gross)} = ${inr(s.gross)}.`,
          ],
          ['Gross profit = sales - (opening stock + purchases + direct expenses - closing stock).', 'Wages are at the trial balance figure: the outstanding part is in it already.'],
        ),
      verify: (q) => q.answer === readInsideTb(q.context).gross,
    },
    {
      kind: 'mcq',
      make: (s) =>
        s.ask === 'wages'
          ? choice(
              'Outstanding Wages A/c appears in the trial balance. Where is it shown in the final accounts?',
              'Only on the liabilities side of the balance sheet',
              [
                ['Added to wages in the Trading Account and shown as a liability', 'Treated it as an adjustment given outside the trial balance. It is already in Wages A/c: adding it again counts it twice.'],
                ['Only added to wages in the Trading Account', 'Wages A/c already carries it. What is left to show is the amount owed, a liability.'],
                ['Deducted from wages in the Trading Account', 'Unpaid wages are not taken off the wages: the expense of the year includes them, and Wages A/c already does.'],
                ['On the assets side of the balance sheet', 'Wages still to be paid are owed by the business: a liability, not an asset.'],
              ],
              'An item inside the trial balance has already been through its adjusting entry, so its effect on the expense is in Wages A/c. Its other side, the amount still owed, is shown once: as a current liability in the balance sheet.',
              ['Is it inside the trial balance, or given as an adjustment below it?', 'An item inside the trial balance is shown once; an adjustment outside it is shown twice.'],
            )
          : choice(
              'Prepaid Insurance A/c appears in the trial balance. Where is it shown in the final accounts?',
              'Only on the assets side of the balance sheet',
              [
                ['Deducted from insurance in the Profit and Loss Account and shown as an asset', 'Treated it as an adjustment given outside the trial balance. Insurance A/c has already been reduced by it: deducting it again counts it twice.'],
                ['Only deducted from insurance in the Profit and Loss Account', 'Insurance A/c already excludes it. What is left to show is the benefit still to come, an asset.'],
                ['Added to insurance in the Profit and Loss Account', 'A payment for next year is not an expense of this year.'],
                ['On the liabilities side of the balance sheet', 'Insurance paid in advance is a benefit the business is still to receive: an asset, not a liability.'],
              ],
              'An item inside the trial balance has already been through its adjusting entry, so Insurance A/c no longer includes the part paid for next year. Its other side, the benefit still to come, is shown once: as a current asset in the balance sheet.',
              ['Is it inside the trial balance, or given as an adjustment below it?', 'An item inside the trial balance is shown once; an adjustment outside it is shown twice.'],
            ),
      verify: (q) => picked(q) === (q.prompt.startsWith('Outstanding Wages') ? 'Only on the liabilities side of the balance sheet' : 'Only on the assets side of the balance sheet'),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          `What is the net profit for the year ended ${YEAR_END}?`,
          s.net,
          [
            [s.net + s.prepaid, 'Took the prepaid insurance off the insurance again. Insurance A/c already excludes it.'],
            [s.net + s.owedSalaries, 'Left out the salaries still unpaid.'],
            [s.net + s.rentAhead, 'Left the rent received for April in the income of this year.'],
            [s.net - s.owedWages, 'Charged the outstanding wages once more.'],
            [s.net - 2 * s.rentAhead, 'Added the rent received in advance instead of deducting it.'],
          ],
          [
            `Gross profit ${inr(s.gross)}.`,
            `Less: salaries ${inr(s.salaries)} + ${inr(s.owedSalaries)} outstanding = ${inr(s.salaries + s.owedSalaries)}.`,
            `Less: insurance ${inr(s.insurance)}, the trial balance figure: the prepaid part is already out of it.`,
            `Add: rent received ${inr(s.rentReceived)} - ${inr(s.rentAhead)} received in advance = ${inr(s.rentReceived - s.rentAhead)}.`,
            `Net profit = ${inr(s.gross)} - ${inr(s.salaries + s.owedSalaries)} - ${inr(s.insurance)} + ${inr(s.rentReceived - s.rentAhead)} = ${inr(s.net)}.`,
          ],
          ['The adjustments below the trial balance change an expense or an income here, and show again in the balance sheet.', 'Items inside the trial balance are already in the figures.'],
        ),
      verify: (q) => q.answer === readInsideTb(q.context).net,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          `What is the total of the current liabilities in the balance sheet on ${YEAR_END}?`,
          s.current,
          [
            [s.current - s.owedWages, 'Left out the outstanding wages, which are a liability although they appear in the trial balance.'],
            [s.current - s.rentAhead, 'Left out the rent received in advance: the business owes the use of the premises for April.'],
            [s.current - s.owedSalaries, 'Left out the salaries still unpaid.'],
            [s.current + s.prepaid, 'Took the prepaid insurance for a liability. It is an asset.'],
          ],
          [
            `Sundry creditors ${inr(s.creditors)}.`,
            `Outstanding wages ${inr(s.owedWages)} (from the trial balance) and outstanding salaries ${inr(s.owedSalaries)} (adjustment 2).`,
            `Rent received in advance ${inr(s.rentAhead)} (adjustment 3).`,
            `Current liabilities = ${added([s.creditors, s.owedWages, s.owedSalaries, s.rentAhead])}.`,
          ],
          ['What does the business owe on 31 March, to be settled within the year?', 'An income received in advance is owed until it is earned.'],
        ),
      verify: (q) => q.answer === readInsideTb(q.context).current,
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 8. Income earned, income received ahead, and the manager's commission (complex). A draft profit, then interest
// earned on a fixed deposit and not received, rent received for months that run past 31 March, an expense unpaid, a
// premium that covers part of next year, and a manager paid a commission on the profit (before or after charging it).
// The case climbs from the interest accrued, the entry for the rent received ahead (journal) and the principle that
// brings income in when it is earned (theory base), to the profit before the commission and the commission itself.
// ---------------------------------------------------------------------------------------------------------------

interface Accruals {
  b: Biz;
  draft: number;
  deposit: number;
  dRate: number;
  kDeposit: number;
  rent: number;
  kRent: number;
  salaries: number;
  premium: number;
  kPremium: number;
  cRate: number;
  basis: 'before' | 'after';
  accrued: number;
  ahead: number;
  prepaid: number;
  before: number;
  commission: number;
}

function readAccruals(context: string | undefined) {
  const draft = amountsIn(lineOf(context, /shows a net profit of/))[0];
  const a = lineOf(context, '(a)');
  const bLine = lineOf(context, '(b)');
  const c = lineOf(context, '(c)');
  const d = lineOf(context, '(d)');
  const e = lineOf(context, '(e)');
  const accrued = (amountsIn(a)[0] * intIn(a, /at (\d+)% p\.a\./) * (12 - monthIn(a))) / 1200;
  // Six months from the month the rent was received; those after March are next year's.
  const ahead = (amountsIn(bLine)[0] * (6 - (12 - monthIn(bLine)))) / 6;
  const prepaid = (amountsIn(d)[0] * monthIn(d)) / 12;
  const before = draft + accrued - ahead - amountsIn(c)[0] + prepaid;
  const rate = intIn(e, /commission of (\d+)%/);
  const commission = e.includes('after charging') ? (before * rate) / (100 + rate) : (before * rate) / 100;
  return { accrued, ahead, before, commission };
}

const accrualsAndCommission = caseTemplate<Accruals>({
  id: 'case-wy-accruals-and-commission',
  topicId: T,
  conceptId: C,
  difficulty: 'complex',
  title: "Income earned, income received ahead, and the manager's commission",
  setup: (rng) =>
    attempt(30, () => {
      const b = business(rng, 8);
      const deposit = amount(rng, 100000, 500000, 50000);
      const dRate = rng.pick([6, 8, 9, 10, 12]);
      const kDeposit = rng.pick([2, 3, 4, 6, 7, 9]);
      const accrued = (deposit * dRate * (12 - kDeposit)) / 1200;
      const month = amount(rng, 2000, 6000, 500);
      const kRent = rng.pick([7, 8, 9, 10]);
      const ahead = month * (kRent - 6);
      const salaries = amount(rng, 5000, 15000, 500);
      const premium = 12 * amount(rng, 1000, 3000, 250);
      const kPremium = rng.pick([3, 4, 6, 7, 9]);
      const prepaid = (premium * kPremium) / 12;
      const basis = rng.pick(['before', 'after'] as const);
      const cRate = basis === 'after' ? rng.pick([5, 10, 20, 25]) : rng.pick([5, 8, 10]);
      // The profit before the commission is drawn so that the commission is whole; the draft follows from it.
      const commission = basis === 'after' ? amount(rng, 8000, 40000, 1000) : 0;
      // On the profit before charging it, a multiple of (100 + rate) hundreds, so that the other basis is whole too.
      const before = basis === 'after' ? (commission * (100 + cRate)) / cRate : R((100 + cRate) * 100 * rng.int(15, 40));
      const draft = before - accrued + ahead + salaries - prepaid;
      const c = basis === 'after' ? commission : pct(before, cRate);
      const other = basis === 'after' ? pct(before, cRate) : (before * cRate) / (100 + cRate);
      const figures = [accrued, ahead, salaries, prepaid];
      // The wrong figures the commission is asked with must be whole too: the other basis, and the rate on the draft.
      if (![accrued, prepaid, before, draft, c, other, pct(draft, cRate)].every(clean) || before < R(100000) || new Set(figures).size !== figures.length) return null;
      return { b, draft, deposit, dRate, kDeposit, rent: 6 * month, kRent, salaries, premium, kPremium, cRate, basis, accrued, ahead, prepaid, before, commission: c };
    }),
  context: (s) =>
    [
      `${s.b.owner} runs ${s.b.trade} in ${s.b.city}. The Profit and Loss Account for the year ended ${YEAR_END}, drawn up before the items below, shows a net profit of ${inr(s.draft)}.`,
      `(a) The business has held a fixed deposit of ${inr(s.deposit)} at ${s.dRate}% p.a. since ${dayOf(s.kDeposit)}; no interest on it has yet been received or recorded.`,
      `(b) Rent of ${inr(s.rent)} for six months, received on ${dayOf(s.kRent)} from a sub-tenant for the six months beginning that day, was all credited to Rent Received A/c.`,
      `(c) Salaries of ${inr(s.salaries)} for March have not been paid.`,
      `(d) An insurance premium of ${inr(s.premium)} for one year from ${dayOf(s.kPremium)} was paid on that day and charged in full as an expense.`,
      `(e) The manager is entitled to a commission of ${s.cRate}% of the net profit ${s.basis} charging such commission, worked out after (a) to (d).`,
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const m = 12 - s.kDeposit;
        return num(
          'What is the interest accrued on the fixed deposit on 31 March 2026?',
          s.accrued,
          [
            [pct(s.deposit, s.dRate), `Took a full year of interest, although the deposit was made on ${dayOf(s.kDeposit)}.`],
            [(s.deposit * s.dRate * (m - 1)) / 1200, 'Counted the months from the month after the deposit was made.'],
            [(s.deposit * s.dRate * 6) / 1200, 'Took interest for six months as an average; the deposit earns interest for every month it is held.'],
            [(s.deposit * s.dRate * (12 - m)) / 1200, 'Counted the months before the deposit was made instead of those after it.'],
          ],
          [`The deposit has earned interest for ${monthsWord(m)}, ${dayOf(s.kDeposit)} to ${YEAR_END}.`, `Interest accrued = ${inr(s.deposit)} x ${s.dRate}/100 x ${m}/12 = ${inr(s.accrued)}.`],
          ['For how many months has the deposit been held this year?', 'Interest = principal x rate x months / 12.'],
        );
      },
      verify: (q) => q.answer === readAccruals(q.context).accrued,
    },
    {
      kind: 'journal',
      make: (s) =>
        entry(
          'Pass the adjusting entry for the rent in (b).',
          [dr('rentReceived', s.ahead), cr('incomeReceivedInAdvance', s.ahead)],
          [
            `Of the six months from ${dayOf(s.kRent)}, ${s.kRent - 6} ${s.kRent - 6 === 1 ? 'falls' : 'fall'} after 31 March: ${inr(s.rent)} x ${s.kRent - 6}/6 = ${inr(s.ahead)} is next year's income.`,
            'It is taken out of this year\'s income: Rent Received A/c is debited.',
            'The business owes the sub-tenant the use of the premises for those months, a liability: Income Received in Advance A/c is credited.',
          ],
          ['accruedIncome', 'rent'],
          ['How many of the six months fall after 31 March?', 'Income received for next year is a liability until it is earned.'],
        ),
      verify: (q) => {
        const c = readAccruals(q.context);
        return q.expected.some((l) => l.accountId === 'incomeReceivedInAdvance' && l.side === 'Cr' && l.amount === c.ahead);
      },
    },
    {
      kind: 'mcq',
      make: () =>
        choice(
          'The interest in (a) has not been received, yet it is taken into this year\'s profit. Which principle requires this?',
          'Accrual: income is recorded in the period it is earned, whether or not the money has come in',
          [
            ['Prudence: no income is recorded until it is received in cash', 'Prudence keeps out income that is uncertain. This interest is earned and certain; prudence does not say income must wait for the cash.'],
            ['Going concern: the business will continue for the foreseeable future', 'Going concern is about valuing assets on the footing that the business continues, not about the period an income belongs to.'],
            ['Consistency: the same methods are used from year to year', 'Consistency asks for the same treatment every year; it does not decide when an income is earned.'],
            ['Money measurement: only what can be stated in money is recorded', 'Money measurement decides what is recorded at all, not the year it belongs to.'],
          ],
          'Under the accrual principle an income belongs to the period in which it is earned. The deposit earned the interest this year, so it is income of this year and an asset (accrued income) until it is received.',
          ['When was the interest earned, and when will the money come?', 'One principle records income and expenses in the period they belong to, not when cash moves.'],
        ),
      verify: (q) => picked(q).startsWith('Accrual'),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          "What is the net profit after (a) to (d), before the manager's commission?",
          s.before,
          [
            [s.before + 2 * s.ahead, 'Added the rent received in advance instead of deducting it.'],
            [s.before - s.rent + s.ahead, 'Deducted the whole of the six months\' rent, although part of it belongs to this year.'],
            [s.before - s.prepaid, 'Left out the prepaid insurance, which reduces this year\'s expense.'],
            [s.before - s.accrued, 'Left out the interest accrued.'],
            [s.before + s.salaries, 'Left out the unpaid salaries.'],
            [s.before - 2 * s.prepaid, 'Added the prepaid insurance to the expense instead of taking it out.'],
          ],
          [
            `Draft net profit ${inr(s.draft)}.`,
            `(a) Add: interest accrued ${inr(s.accrued)}.`,
            `(b) Less: rent received in advance ${inr(s.ahead)}.`,
            `(c) Less: salaries outstanding ${inr(s.salaries)}.`,
            `(d) Add: insurance prepaid, ${inr(s.premium)} x ${s.kPremium}/12 = ${inr(s.prepaid)}: ${monthsWord(s.kPremium)} of the cover fall after 31 March.`,
            `Net profit before the commission = ${inr(s.draft)} + ${inr(s.accrued)} - ${inr(s.ahead)} - ${inr(s.salaries)} + ${inr(s.prepaid)} = ${inr(s.before)}.`,
          ],
          ['An income earned and an expense paid in advance raise the profit; an income received in advance and an expense unpaid lower it.', 'Leave the commission for last.'],
        ),
      verify: (q) => q.answer === readAccruals(q.context).before,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const other = s.basis === 'after' ? pct(s.before, s.cRate) : (s.before * s.cRate) / (100 + s.cRate);
        return num(
          "What is the manager's commission?",
          s.commission,
          [
            [other, s.basis === 'after' ? 'Took the commission on the profit before charging it. The case gives it on the profit after charging it.' : 'Took the commission on the profit after charging it. The case gives it on the profit before charging it.'],
            [pct(s.draft, s.cRate), 'Worked the commission on the draft profit, before (a) to (d).'],
            [s.basis === 'after' ? (s.before * s.cRate) / (100 - s.cRate) : null, `Divided by ${100 - s.cRate} instead of ${100 + s.cRate}.`],
          ],
          s.basis === 'after'
            ? [
                `The commission is ${s.cRate}% of the profit left after it, so the profit before it is ${100 + s.cRate} parts and the commission ${s.cRate} of them.`,
                `Commission = ${inr(s.before)} x ${s.cRate}/${100 + s.cRate} = ${inr(s.commission)}.`,
                `Check: ${inr(s.before)} - ${inr(s.commission)} = ${inr(s.before - s.commission)}, and ${s.cRate}% of that is ${inr(s.commission)}.`,
              ]
            : [`Commission = ${s.cRate}% of the profit before charging it = ${inr(s.before)} x ${s.cRate}/100 = ${inr(s.commission)}.`],
          ['Is the commission on the profit before it is charged, or after?', `On the profit after charging it: commission = profit before commission x rate / (100 + rate).`],
        );
      },
      verify: (q) => {
        const c = readAccruals(q.context);
        return Math.abs(q.answer - c.commission) < 1;
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 9. Which method of depreciation, and what it does to the year (medium). A machine bought part-way through last year;
// this year's charge under each method at the same rate, the principle that holds the business to the method it
// chooses, and the chosen method carried into the net profit and the balance sheet.
// ---------------------------------------------------------------------------------------------------------------

interface Methods {
  b: Biz;
  cost: number;
  k: number;
  rate: number;
  chosen: Method;
  draft: number;
  first: number;
  slm: number;
  wdv: number;
  net: number;
  value: number;
}

function readMethods(context: string | undefined) {
  const bought = lineOf(context, /was bought on/);
  const cost = amountsIn(bought)[0];
  const from = monthAt(bought);
  const rate = intIn(lineOf(context, /depreciated at \d+% p\.a\./), /at (\d+)% p\.a\./);
  const chosen: Method = /adopts the straight line method/.test(context ?? '') ? 'slm' : 'wdv';
  const draft = amountsIn(lineOf(context, /profit for the year ended 31 March 2026 before depreciation/))[0];
  const dep = (m: Method) => valueByFormula(cost, m, rate, from, ON.y2025) - valueByFormula(cost, m, rate, from, ON.end);
  return { slm: dep('slm'), wdv: dep('wdv'), net: draft - dep(chosen), value: valueByFormula(cost, chosen, rate, from, ON.end) };
}

const methodsAndProfit = caseTemplate<Methods>({
  id: 'case-wy-method-and-profit',
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: 'Which method of depreciation, and what it does to the year',
  setup: (rng) =>
    attempt(30, () => {
      const b = business(rng, 9);
      const k = rng.pick([3, 4, 6, 7, 9]);
      const rate = rng.pick([10, 15, 20, 25]);
      const cost = amount(rng, 200000, 800000, 20000);
      const first = (cost * rate * (12 - k)) / 1200;
      const slm = pct(cost, rate);
      const wdv = pct(cost - first, rate);
      const chosen = rng.pick<Method>(['slm', 'wdv']);
      const draft = amount(rng, 200000, 600000, 1000);
      const dep = chosen === 'slm' ? slm : wdv;
      if (![first, slm, wdv].every(clean)) return null;
      return { b, cost, k, rate, chosen, draft, first, slm, wdv, net: draft - dep, value: cost - first - dep };
    }),
  context: (s) =>
    [
      `${s.b.owner} runs ${s.b.trade} in ${s.b.city}; the year ends on 31 March. A ${s.b.machine} was bought on ${dayAt(ON.y2024 + s.k)} for ${inr(s.cost)}, the only machine of the business.`,
      `It is depreciated at ${s.rate}% p.a., for the months of use in the year of purchase. The charge for the year ended 31 March 2025, the same under either method, has been made.`,
      `For the year ended ${YEAR_END} the proprietor weighs the straight line method (on the original cost) against the written down value method at that rate, and adopts the ${s.chosen === 'slm' ? 'straight line method' : 'written down value method'} for this and later years.`,
      `The profit for the year ended 31 March 2026 before depreciation is ${inr(s.draft)}.`,
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          `What would the depreciation for the year ended ${YEAR_END} be under the straight line method?`,
          s.slm,
          [
            [s.wdv, 'Applied the rate to the written down value: that is the other method.'],
            [s.first, 'Gave the depreciation of the first year, which covered only the months of use.'],
            [s.slm + s.first, 'Added the first year\'s depreciation to this year\'s.'],
          ],
          ['The straight line method charges the same amount every full year, on the original cost.', `Depreciation = ${inr(s.cost)} x ${s.rate}/100 = ${inr(s.slm)}.`],
          ['Straight line: the rate is applied to the original cost every year.', 'This is a full year of use.'],
        ),
      verify: (q) => near(q.answer, readMethods(q.context).slm),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          `What would the depreciation for the year ended ${YEAR_END} be under the written down value method?`,
          s.wdv,
          [
            [s.slm, 'Applied the rate to the original cost: that is the straight line method.'],
            [pct(s.cost - pct(s.cost, s.rate), s.rate), `Took a full year of depreciation in the first year, although the machine was bought on ${dayAt(ON.y2024 + s.k)}.`],
            [s.cost - s.first - s.wdv, 'Gave the book value at the end of the year instead of the depreciation.'],
            [s.first, 'Gave the depreciation of the first year.'],
          ],
          [
            `First year, ${monthsWord(12 - s.k)}: ${inr(s.cost)} x ${s.rate}/100 x ${12 - s.k}/12 = ${inr(s.first)}.`,
            `Written down value on 1 April 2025 = ${inr(s.cost)} - ${inr(s.first)} = ${inr(s.cost - s.first)}.`,
            `Depreciation = ${inr(s.cost - s.first)} x ${s.rate}/100 = ${inr(s.wdv)}.`,
          ],
          ['Written down value: the rate is applied to the book value at the start of the year.', 'Book value = cost - depreciation charged so far.'],
        ),
      verify: (q) => near(q.answer, readMethods(q.context).wdv),
    },
    {
      kind: 'mcq',
      make: (s) =>
        choice(
          `Once the proprietor has chosen the ${s.chosen === 'slm' ? 'straight line' : 'written down value'} method, may it be changed next year simply to show a higher profit?`,
          'No: consistency requires the same method year after year, so that the results of different years can be compared',
          [
            ['Yes: the proprietor may pick whichever method gives the higher profit each year', 'Changing methods to suit the profit makes the accounts of different years impossible to compare; that is what consistency forbids.'],
            ['No: prudence requires the method that charges more depreciation every year', 'Prudence does not dictate the method of depreciation; the rule that holds the business to its method is consistency.'],
            ['Yes: going concern allows any method as long as the business continues', 'Going concern is about valuing assets on the footing that the business continues; it says nothing about changing methods.'],
            ['No: the law fixes the straight line method for every sole proprietor', 'No such rule fixes one method for a sole proprietor; the business chooses a method and then keeps to it.'],
          ],
          'The consistency principle asks a business to follow the same accounting methods from year to year. A method may be changed only for a sound reason, such as a better picture of the business, and the effect of the change is then disclosed; never merely to raise the profit of one year.',
          ['What would happen to the comparison of one year with the next if methods kept changing?', 'One principle asks for the same methods every year.'],
        ),
      verify: (q) => picked(q).startsWith('No: consistency'),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          `Under the method the proprietor chooses, what is the net profit for the year ended ${YEAR_END}?`,
          s.net,
          [
            [s.draft - (s.chosen === 'slm' ? s.wdv : s.slm), 'Charged the depreciation of the other method.'],
            [s.draft - s.first, 'Charged the depreciation of the first year.'],
            [s.draft, 'Left out the depreciation, which is an expense of the year.'],
          ],
          [`Depreciation under the ${s.chosen === 'slm' ? 'straight line' : 'written down value'} method = ${inr(s.chosen === 'slm' ? s.slm : s.wdv)}.`, `Net profit = ${inr(s.draft)} - ${inr(s.chosen === 'slm' ? s.slm : s.wdv)} = ${inr(s.net)}.`],
          ['Which method did the proprietor choose?', 'Depreciation is deducted from the profit before depreciation.'],
        ),
      verify: (q) => near(q.answer, readMethods(q.context).net),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          `At what figure is the machine shown in the balance sheet on ${YEAR_END}, under the method chosen?`,
          s.value,
          [
            [s.cost - s.first - (s.chosen === 'slm' ? s.wdv : s.slm), 'Deducted the depreciation of the other method for this year.'],
            [s.cost - (s.chosen === 'slm' ? s.slm : s.wdv), 'Deducted only this year\'s depreciation from the cost, leaving out the first year\'s.'],
            [s.cost - s.first, 'Gave the book value on 1 April 2025, before this year\'s depreciation.'],
            [s.cost, 'Showed the machine at cost.'],
          ],
          [`Book value = cost ${inr(s.cost)} - first year ${inr(s.first)} - this year ${inr(s.chosen === 'slm' ? s.slm : s.wdv)} = ${inr(s.value)}.`],
          ['The balance sheet shows the machine at cost less all the depreciation charged so far.', 'Two years of depreciation have now been charged.'],
        ),
      verify: (q) => near(q.answer, readMethods(q.context).value),
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 10. The profit from the capital at the two ends of the year (medium). What the business owns and owes on 1 April and
// on 31 March, the machinery to be depreciated and a provision to be made on the debtors at the year end, and the
// capital brought in and drawn. The case climbs from the opening capital (the accounting equation), through the
// machinery after depreciation and what a provision does to the equation, to the closing capital and the profit.
// ---------------------------------------------------------------------------------------------------------------

interface Comparison {
  b: Biz;
  machinery: number;
  stock0: number;
  debtors0: number;
  bank0: number;
  creditors0: number;
  stock1: number;
  debtors1: number;
  bank1: number;
  creditors1: number;
  owed: number;
  rate: number;
  pdd: number;
  more: number;
  drawn: number;
  opening: number;
  dep: number;
  provision: number;
  closing: number;
  profit: number;
}

function readComparison(context: string | undefined) {
  const [m0, s0, d0, b0, c0] = amountsIn(lineOf(context, 'On 1 April 2025:'));
  const [m1, s1, d1, b1, c1, owed] = amountsIn(lineOf(context, 'On 31 March 2026, before'));
  const adj = lineOf(context, 'At the year end');
  const rate = intIn(adj, /machinery at (\d+)% p\.a\./);
  const pdd = intIn(adj, /at (\d+)% of the debtors/);
  const during = lineOf(context, 'During the year');
  const more = parseRupees(/further capital of (₹[\d,]+)/.exec(during)?.[1] ?? '') ?? 0;
  const drawn = parseRupees(/withdrew (₹[\d,]+)/.exec(during)?.[1] ?? '') ?? NaN;
  const opening = m0 + s0 + d0 + b0 - c0;
  const closing = m1 - (m1 * rate) / 100 + s1 + d1 - (d1 * pdd) / 100 + b1 - c1 - owed;
  return { opening, machinery: m1 - (m1 * rate) / 100, closing, profit: closing - opening + drawn - more, provision: (d1 * pdd) / 100 };
}

const capitalComparison = caseTemplate<Comparison>({
  id: 'case-wy-profit-from-capital',
  topicId: T,
  conceptId: C,
  difficulty: 'complex',
  title: 'The profit from the capital at the two ends of the year',
  setup: (rng) =>
    attempt(30, () => {
      const b = business(rng, 10);
      const machinery = amount(rng, 200000, 600000, 20000);
      const rate = rng.pick([10, 15, 20]);
      const pdd = rng.pick([2, 4, 5]);
      const [stock0, stock1] = [amount(rng, 60000, 200000, 5000), amount(rng, 60000, 200000, 5000)];
      const [debtors0, debtors1] = [amount(rng, 50000, 200000, 5000), amount(rng, 50000, 200000, 5000)];
      const [bank0, bank1] = [amount(rng, 20000, 150000, 1000), amount(rng, 20000, 150000, 1000)];
      const [creditors0, creditors1] = [amount(rng, 40000, 160000, 5000), amount(rng, 40000, 160000, 5000)];
      const owed = amount(rng, 2000, 9000, 500);
      const more = rng.next() < 0.6 ? amount(rng, 25000, 150000, 5000) : 0;
      const drawn = amount(rng, 30000, 120000, 5000);
      const opening = machinery + stock0 + debtors0 + bank0 - creditors0;
      const dep = pct(machinery, rate);
      const provision = pct(debtors1, pdd);
      const closing = machinery - dep + stock1 + debtors1 - provision + bank1 - creditors1 - owed;
      const profit = closing - opening + drawn - more;
      if (![dep, provision, closing, profit].every(clean) || profit < R(30000) || profit * 3 > opening) return null;
      return { b, machinery, stock0, debtors0, bank0, creditors0, stock1, debtors1, bank1, creditors1, owed, rate, pdd, more, drawn, opening, dep, provision, closing, profit };
    }),
  context: (s) =>
    [
      `${s.b.owner} runs ${s.b.trade} in ${s.b.city}; the year ends on 31 March. What the business owned and owed:`,
      `On 1 April 2025: machinery ${inr(s.machinery)}, stock ${inr(s.stock0)}, debtors ${inr(s.debtors0)}, bank ${inr(s.bank0)}; creditors ${inr(s.creditors0)}.`,
      `On 31 March 2026, before the adjustments below: machinery ${inr(s.machinery)}, stock ${inr(s.stock1)}, debtors ${inr(s.debtors1)}, bank ${inr(s.bank1)}; creditors ${inr(s.creditors1)}, rent outstanding ${inr(s.owed)}.`,
      `At the year end depreciate machinery at ${s.rate}% p.a. on its book value (no machine was bought or sold during the year), and create a provision for doubtful debts at ${s.pdd}% of the debtors.`,
      s.more
        ? `During the year the proprietor brought in further capital of ${inr(s.more)} and withdrew ${inr(s.drawn)} for personal use.`
        : `During the year the proprietor brought in no further capital and withdrew ${inr(s.drawn)} for personal use.`,
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          'What was the capital on 1 April 2025?',
          s.opening,
          [
            [s.opening + 2 * s.creditors0, 'Added the creditors to the assets instead of deducting them.'],
            [s.opening + s.creditors0, 'Did not deduct the creditors.'],
            [s.opening - s.machinery, 'Left out the machinery.'],
          ],
          [`Capital = assets - liabilities.`, `Assets = ${added([s.machinery, s.stock0, s.debtors0, s.bank0])}.`, `Capital = ${inr(s.machinery + s.stock0 + s.debtors0 + s.bank0)} - creditors ${inr(s.creditors0)} = ${inr(s.opening)}.`],
          ['Capital = assets - liabilities.', 'Creditors are what the business owes.'],
        ),
      verify: (q) => q.answer === readComparison(q.context).opening,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          'At what figure is machinery shown on 31 March 2026, after depreciation?',
          s.machinery - s.dep,
          [
            [s.machinery, 'Left out the depreciation of the year.'],
            [s.dep, 'Gave the depreciation instead of the value left.'],
            [s.machinery - (s.machinery * s.rate) / 200, 'Charged depreciation for half a year; the machinery was used all year.'],
          ],
          [`Depreciation = ${inr(s.machinery)} x ${s.rate}/100 = ${inr(s.dep)}.`, `Machinery = ${inr(s.machinery)} - ${inr(s.dep)} = ${inr(s.machinery - s.dep)}.`],
          H.partYear,
        ),
      verify: (q) => q.answer === readComparison(q.context).machinery,
    },
    {
      kind: 'mcq',
      make: (s) =>
        choice(
          `What does creating the provision for doubtful debts of ${inr(s.provision)} do to the accounting equation?`,
          `Assets and capital both fall by ${inr(s.provision)}`,
          [
            [`Liabilities rise and capital falls by ${inr(s.provision)}`, 'Took the provision for a liability. It is deducted from the debtors, so it reduces the assets.'],
            [`Assets fall and liabilities rise by ${inr(s.provision)}`, 'A provision is not owed to anyone; the charge for it reduces the profit, and so the capital.'],
            [`One asset rises and another falls by ${inr(s.provision)}`, 'Nothing is received for the provision: the debtors are written down and the loss falls on the capital.'],
            ['Nothing: no money leaves the business', 'An expense need not involve money. The debtors are now worth less, and the profit, which belongs to the capital, is less.'],
          ],
          'The provision is a charge against the profit (capital falls) and is deducted from the debtors in the balance sheet (assets fall). Both sides of the equation fall by the same amount.',
          ['Where does the provision appear in the balance sheet?', 'An expense of the year reduces the profit, which is part of the capital.'],
        ),
      verify: (q) => picked(q) === `Assets and capital both fall by ${inr(readComparison(q.context).provision)}`,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          'What is the capital on 31 March 2026, after the adjustments?',
          s.closing,
          [
            [s.closing + s.dep, 'Left the machinery at its figure before depreciation.'],
            [s.closing + s.provision, 'Left the debtors at their full figure, without the provision.'],
            [s.closing + s.owed, 'Left out the rent outstanding, which the business owes.'],
            [s.closing + s.dep + s.provision, 'Made neither year-end adjustment.'],
          ],
          [
            `Assets = machinery ${inr(s.machinery - s.dep)} + stock ${inr(s.stock1)} + debtors ${inr(s.debtors1)} - provision ${inr(s.provision)} + bank ${inr(s.bank1)} = ${inr(s.machinery - s.dep + s.stock1 + s.debtors1 - s.provision + s.bank1)}.`,
            `Liabilities = creditors ${inr(s.creditors1)} + rent outstanding ${inr(s.owed)} = ${inr(s.creditors1 + s.owed)}.`,
            `Capital = ${inr(s.machinery - s.dep + s.stock1 + s.debtors1 - s.provision + s.bank1)} - ${inr(s.creditors1 + s.owed)} = ${inr(s.closing)}.`,
          ],
          ['Capital = assets - liabilities, on the last day of the year.', 'Assets are taken after depreciation and after the provision.'],
        ),
      verify: (q) => q.answer === readComparison(q.context).closing,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          'What is the profit for the year ended 31 March 2026?',
          s.profit,
          [
            [s.closing - s.opening, 'Took the rise in capital as the profit, without adding back the drawings or taking out the capital brought in.'],
            [s.closing - s.opening - s.drawn - s.more, 'Deducted the drawings instead of adding them back.'],
            [s.more ? s.closing - s.opening + s.drawn : null, 'Did not take out the further capital, which is not a profit.'],
            [s.more ? s.closing - s.opening + s.drawn + s.more : null, 'Added the further capital instead of deducting it.'],
            [s.profit + s.dep + s.provision, 'Worked the closing capital before the year-end adjustments.'],
          ],
          [
            'Profit = closing capital - opening capital + drawings - further capital brought in.',
            `= ${inr(s.closing)} - ${inr(s.opening)} + ${inr(s.drawn)}${s.more ? ` - ${inr(s.more)}` : ''} = ${inr(s.profit)}.`,
          ],
          ['Closing capital = opening capital + further capital + profit - drawings.', 'Turn it round to find the profit.'],
        ),
      verify: (q) => {
        const c = readComparison(q.context);
        return q.answer === c.profit;
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 11. Doubtful debts over two years (complex). A provision that stands, bad debts set off against it at each year end,
// the provision brought to a rate of the debtors through Profit and Loss A/c, and a debt written off years ago that is
// recovered. The case climbs from the charge of the first year (provisions), through the entry of the recovery
// (journal) and the charge or write-back of the second year, to the debtors of the balance sheet and the net profit.
// ---------------------------------------------------------------------------------------------------------------

interface TwoYears {
  b: Biz;
  p0: number;
  bad1: number;
  d1: number;
  r1: number;
  bad2: number;
  d2: number;
  r2: number;
  recovered: number;
  name: string;
  draft: number;
  p1: number;
  p2: number;
  charge1: number;
  /** The charge of the second year; negative when the excess is written back. */
  charge2: number;
  net: number;
}

const PROVISION_RULE = 'A debt that proves bad is written off to Bad Debts A/c. At each year end the bad debts of the year are set off against the provision for doubtful debts, which is then brought to the amount needed through Profit and Loss A/c.';

function readTwoYears(context: string | undefined) {
  const p0 = amountsIn(lineOf(context, /stood at/))[0];
  const y1 = lineOf(context, 'Year ended 31 March 2025:');
  const y2 = lineOf(context, 'Year ended 31 March 2026:');
  const [bad1, d1] = amountsIn(y1);
  const nums2 = amountsIn(y2);
  const [bad2, recovered, d2] = nums2;
  const r1 = intIn(y1, /to be (\d+)% of the debtors/);
  const r2 = intIn(y2, /to be (\d+)% of the debtors/);
  const p1 = (d1 * r1) / 100;
  const p2 = (d2 * r2) / 100;
  const draft = amountsIn(lineOf(context, 'The profit for the year ended 31 March 2026'))[0];
  const charge2 = bad2 + p2 - p1;
  return { charge1: bad1 + p1 - p0, charge2, recovered, debtors: d2 - p2, net: draft - charge2 + recovered };
}

/** "Charged with ₹x" or "Credited with ₹x (excess written back)": what the provision does to the profit of a year. */
const plSays = (charge: number): string => (charge > 0 ? `Profit and Loss A/c is charged with ${inr(charge)}` : `Profit and Loss A/c is credited with ${inr(-charge)}, the excess written back`);

const doubtfulTwoYears = caseTemplate<TwoYears>({
  id: 'case-wy-doubtful-debts-two-years',
  topicId: T,
  conceptId: C,
  difficulty: 'complex',
  title: 'Doubtful debts over two years',
  setup: (rng) =>
    attempt(30, () => {
      const b = business(rng, 11);
      const r1 = rng.pick([4, 5, 10]);
      const r2 = rng.next() < 0.6 ? r1 : rng.pick([2, 4, 5, 10].filter((r) => r !== r1));
      const d0 = amount(rng, 200000, 600000, 20000);
      const p0 = pct(d0, r1);
      const d1 = Math.max(R(120000), d0 + R(20000) * rng.int(-5, 6));
      const d2 = Math.max(R(120000), d1 + R(20000) * rng.int(-8, 6));
      const p1 = pct(d1, r1);
      const p2 = pct(d2, r2);
      const bad1 = amount(rng, 2000, Math.max(3000, Math.floor(((p0 / 100) * 3) / 4 / 1000) * 1000), 500);
      const bad2 = amount(rng, 2000, Math.max(3000, Math.floor(((p1 / 100) * 3) / 4 / 1000) * 1000), 500);
      const recovered = amount(rng, 1000, 8000, 500);
      const charge1 = bad1 + p1 - p0;
      const charge2 = bad2 + p2 - p1;
      const draft = amount(rng, 150000, 450000, 1000);
      const net = draft - charge2 + recovered;
      const figures = [bad1, bad2, recovered, Math.abs(charge2)];
      if (bad1 >= p0 || bad2 >= p1 || charge1 <= 0 || charge2 === 0 || ![p0, p1, p2].every(clean) || new Set(figures).size !== figures.length) return null;
      return { b, p0, bad1, d1, r1, bad2, d2, r2, recovered, name: rng.pick(peopleOf(b)), draft, p1, p2, charge1, charge2, net };
    }),
  context: (s) =>
    [
      `${s.b.owner} runs ${s.b.trade} in ${s.b.city} and sells on credit; the books close on 31 March. ${PROVISION_RULE}`,
      `On 1 April 2024 Provision for Doubtful Debts A/c stood at ${inr(s.p0)}.`,
      `Year ended 31 March 2025: bad debts of ${inr(s.bad1)} were written off. Debtors at the year end, after them, were ${inr(s.d1)}; the provision is to be ${s.r1}% of the debtors.`,
      `Year ended 31 March 2026: bad debts of ${inr(s.bad2)} were written off, and a cheque for ${inr(s.recovered)} was received from ${s.name}, whose debt had been written off as bad in 2022. Debtors at the year end, after the bad debts, were ${inr(s.d2)}; the provision is to be ${s.r2}% of the debtors.`,
      `The profit for the year ended 31 March 2026, before the bad debts, the provision and the amount recovered, is ${inr(s.draft)}.`,
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          'What amount is charged to Profit and Loss A/c for bad and doubtful debts in the year ended 31 March 2025?',
          s.charge1,
          [
            [s.p1, 'Charged the whole new provision, as if none had stood before.'],
            [s.p1 - s.p0, 'Left out the bad debts, which are set off against the provision and must be made good.'],
            [s.bad1 + s.p1, 'Did not set the old provision against the charge.'],
            [s.p0 - s.bad1, 'Gave what was left of the old provision after the bad debts.'],
          ],
          [
            `New provision = ${inr(s.d1)} x ${s.r1}/100 = ${inr(s.p1)}.`,
            `The old provision of ${inr(s.p0)} meets the bad debts of ${inr(s.bad1)}, leaving ${inr(s.p0 - s.bad1)}.`,
            `Charge = bad debts ${inr(s.bad1)} + new provision ${inr(s.p1)} - old provision ${inr(s.p0)} = ${inr(s.charge1)}.`,
          ],
          H.debts,
        ),
      verify: (q) => q.answer === readTwoYears(q.context).charge1,
    },
    {
      kind: 'journal',
      make: (s) =>
        entry(
          `Pass the journal entry for the cheque received from ${s.name}.`,
          [dr('bank', s.recovered), cr('badDebtsRecovered', s.recovered)],
          [
            'The cheque is paid into the bank: Bank A/c is debited.',
            `${s.name}'s debt was written off years ago, so ${s.name}'s account is closed; the money is a gain of this year: Bad Debts Recovered A/c is credited.`,
          ],
          [`debtor:${s.name}`, 'provisionForDoubtfulDebts', 'badDebts'],
          ['Is the debt still in the books?', 'A debt recovered after it was written off is an income of the year it is received in.'],
        ),
      verify: (q) => entryIs(q, [dr('bank', readTwoYears(q.context).recovered), cr('badDebtsRecovered', readTwoYears(q.context).recovered)]),
    },
    {
      kind: 'mcq',
      make: (s) =>
        choice(
          'In the year ended 31 March 2026, once the bad debts are set off and the provision is brought to the amount needed, what happens to Profit and Loss A/c?',
          plSays(s.charge2),
          [
            [plSays(-s.charge2), s.charge2 > 0 ? 'Took the provision as more than enough. After the bad debts are set off, it falls short of the amount needed.' : 'Took the provision as falling short. After the bad debts are set off, it still holds more than is needed.'],
            [plSays(s.p2 - s.p1 === 0 ? s.p2 : s.p2 - s.p1), 'Left the bad debts out: they are set off against the provision, which must then be made good.'],
            [plSays(s.bad2 + s.p2), 'Did not set the old provision against the charge.'],
            [plSays(s.charge2 - s.recovered), 'Set the amount recovered against the provision. It is a separate income, credited to Bad Debts Recovered A/c.'],
          ],
          `The provision of ${inr(s.p1)} meets the bad debts of ${inr(s.bad2)}, leaving ${inr(s.p1 - s.bad2)}. Needed: ${inr(s.d2)} x ${s.r2}/100 = ${inr(s.p2)}. ${
            s.charge2 > 0 ? `The account is short by ${inr(s.charge2)}, charged to Profit and Loss A/c.` : `The account holds ${inr(-s.charge2)} more than is needed, written back to Profit and Loss A/c.`
          } (Bad debts + new provision - old provision = ${inr(s.bad2)} + ${inr(s.p2)} - ${inr(s.p1)}.)`,
          H.debts,
        ),
      verify: (q) => picked(q) === plSays(readTwoYears(q.context).charge2),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          `At what figure are the debtors shown in the balance sheet on ${YEAR_END}?`,
          s.d2 - s.p2,
          [
            [s.d2, 'Showed the debtors without deducting the provision.'],
            [s.d2 - s.p2 - s.bad2, 'Deducted the bad debts again. The debtors given are after them.'],
            [s.d2 - s.p1, 'Deducted last year\'s provision instead of this year\'s.'],
            [s.d2 + s.p2, 'Added the provision to the debtors.'],
          ],
          [`Provision needed = ${inr(s.d2)} x ${s.r2}/100 = ${inr(s.p2)}.`, `Debtors are shown at ${inr(s.d2)} - ${inr(s.p2)} = ${inr(s.d2 - s.p2)}.`],
          ['The provision is shown as a deduction from the debtors.', 'The debtors given are already after the bad debts.'],
        ),
      verify: (q) => q.answer === readTwoYears(q.context).debtors,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          'What is the net profit for the year ended 31 March 2026?',
          s.net,
          [
            [s.draft - s.charge2, 'Left out the amount recovered, which is an income of the year.'],
            [s.draft + s.charge2 + s.recovered, s.charge2 > 0 ? 'Added the charge for doubtful debts instead of deducting it.' : 'Deducted the amount written back instead of adding it.'],
            [s.draft - s.bad2 - s.p2 + s.recovered, 'Charged the bad debts and the whole new provision, without the old provision.'],
            [s.draft - s.charge2 - s.recovered, 'Deducted the amount recovered.'],
          ],
          [
            `Profit before these items ${inr(s.draft)}.`,
            s.charge2 > 0 ? `Less: charge for bad and doubtful debts ${inr(s.charge2)}.` : `Add: excess provision written back ${inr(-s.charge2)}.`,
            `Add: bad debts recovered ${inr(s.recovered)}.`,
            `Net profit = ${inr(s.draft)} ${s.charge2 > 0 ? '-' : '+'} ${inr(Math.abs(s.charge2))} + ${inr(s.recovered)} = ${inr(s.net)}.`,
          ],
          ['The charge (or the write-back) of the provision and the recovery both reach the profit.', 'A debt recovered is an income; it does not pass through the provision.'],
        ),
      verify: (q) => q.answer === readTwoYears(q.context).net,
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 12. A provision charged, a reserve set aside (medium). Depreciation and a new provision for doubtful debts reduce the
// profit; a transfer to General Reserve is made out of the profit once it is found. The case climbs from the entry
// for the provision (journal) and the net profit, through which item is an appropriation (provisions and reserves),
// to the transfer and the capital at the year end (the accounting equation).
// ---------------------------------------------------------------------------------------------------------------

interface ProvisionReserve {
  b: Biz;
  draft: number;
  furniture: number;
  rate: number;
  debtors: number;
  pdd: number;
  share: number;
  capital: number;
  drawn: number;
  dep: number;
  provision: number;
  net: number;
  reserve: number;
  closing: number;
}

function readProvisionReserve(context: string | undefined) {
  const draft = amountsIn(lineOf(context, /profit before the items below/))[0];
  const a = lineOf(context, '(a)');
  const bLine = lineOf(context, '(b)');
  const c = lineOf(context, '(c)');
  const dep = (amountsIn(a)[0] * intIn(a, /at (\d+)% p\.a\./)) / 100;
  const provision = (amountsIn(bLine)[0] * intIn(bLine, /at (\d+)% of/)) / 100;
  const net = draft - dep - provision;
  const reserve = (net * intIn(c, /transfers (\d+)%/)) / 100;
  const [capital, drawn] = amountsIn(lineOf(context, 'Capital on 1 April 2025'));
  return { provision, net, reserve, closing: capital + net - reserve - drawn };
}

const provisionAndReserve = caseTemplate<ProvisionReserve>({
  id: 'case-wy-provision-and-reserve',
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: 'A provision charged, a reserve set aside',
  setup: (rng) =>
    attempt(30, () => {
      const b = business(rng, 12);
      const draft = amount(rng, 200000, 600000, 10000);
      const furniture = amount(rng, 60000, 200000, 10000);
      const rate = rng.pick([5, 10, 15]);
      const debtors = amount(rng, 100000, 400000, 10000);
      const pdd = rng.pick([2, 4, 5]);
      const share = rng.pick([10, 20, 25]);
      const capital = amount(rng, 400000, 1000000, 50000);
      const drawn = amount(rng, 40000, 120000, 5000);
      const dep = pct(furniture, rate);
      const provision = pct(debtors, pdd);
      const net = draft - dep - provision;
      const reserve = pct(net, share);
      const closing = capital + net - reserve - drawn;
      if (![dep, provision, net, reserve, closing, pct(draft, share)].every(clean)) return null;
      return { b, draft, furniture, rate, debtors, pdd, share, capital, drawn, dep, provision, net, reserve, closing };
    }),
  context: (s) =>
    [
      `${s.b.owner} runs ${s.b.trade} in ${s.b.city}. For the year ended ${YEAR_END} the profit before the items below is ${inr(s.draft)}.`,
      `(a) Depreciate furniture of ${inr(s.furniture)} at ${s.rate}% p.a.; it was held all year.`,
      `(b) Create a provision for doubtful debts at ${s.pdd}% of the debtors of ${inr(s.debtors)}; there was none before.`,
      `(c) Out of the net profit, the proprietor transfers ${s.share}% to General Reserve; the rest is added to the capital.`,
      `Capital on 1 April 2025 was ${inr(s.capital)}, and the proprietor drew ${inr(s.drawn)} during the year. No capital was brought in.`,
    ].join('\n'),
  parts: [
    {
      kind: 'journal',
      make: (s) =>
        entry(
          'Pass the journal entry for the provision in (b).',
          [dr('profitAndLoss', s.provision), cr('provisionForDoubtfulDebts', s.provision)],
          [`Provision = ${inr(s.debtors)} x ${s.pdd}/100 = ${inr(s.provision)}.`, 'A new provision is a charge against the profit of the year: Profit and Loss A/c is debited.', 'It is kept against the debtors: Provision for Doubtful Debts A/c is credited.'],
          ['badDebts', 'generalReserve'],
          ['Is the provision a loss already suffered, or one expected?', 'A new provision is charged to Profit and Loss A/c.'],
        ),
      verify: (q) => {
        const c = readProvisionReserve(q.context);
        return entryIs(q, [dr('profitAndLoss', c.provision), cr('provisionForDoubtfulDebts', c.provision)]);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          `What is the net profit for the year ended ${YEAR_END}?`,
          s.net,
          [
            [s.net - s.reserve, 'Deducted the transfer to General Reserve as if it were an expense. It is made out of the net profit after it is found.'],
            [s.draft - s.dep, 'Left out the provision for doubtful debts, which is a charge against profit.'],
            [s.draft - s.provision, 'Left out the depreciation.'],
            [s.net - pct(s.draft, s.share), 'Took the reserve on the profit before the charges and deducted it as an expense.'],
          ],
          [`Net profit = ${inr(s.draft)} - depreciation ${inr(s.dep)} - provision ${inr(s.provision)} = ${inr(s.net)}.`, 'The transfer to General Reserve is not deducted here: it is made out of this net profit.'],
          ['Which items are charges against the profit, and which come out of it once it is found?', 'Depreciation and provisions are charges.'],
        ),
      verify: (q) => q.answer === readProvisionReserve(q.context).net,
    },
    {
      kind: 'mcq',
      make: () =>
        choice(
          'Which of (a), (b) and (c) is an appropriation of profit rather than a charge against it?',
          '(c) only',
          [
            ['(b) only', 'A provision for doubtful debts is a charge: it is made to meet a likely loss and reduces the net profit.'],
            ['(a) and (c)', 'Depreciation is a charge against profit, like the provision: it is an expense of using the furniture.'],
            ['(b) and (c)', 'A provision is a charge against profit; only the reserve is set aside out of profit already found.'],
            ['All three', 'Only the transfer to General Reserve is made out of the profit after it is found; depreciation and the provision are charges.'],
          ],
          'Depreciation and a provision are charges against profit: they must be made, profit or no profit, before the net profit is known. A transfer to General Reserve is made out of the net profit once it is found, to strengthen the business: an appropriation.',
          ['Is the amount needed to find the profit, or is it a use of the profit found?', 'A reserve is set aside out of profit; a provision is charged against it.'],
        ),
      verify: (q) => picked(q) === '(c) only',
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          'How much is transferred to General Reserve?',
          s.reserve,
          [
            [pct(s.draft, s.share), 'Took the percentage of the profit before the depreciation and the provision.'],
            [s.net - s.reserve, 'Gave the profit left for the capital instead of the transfer.'],
            [pct(s.draft - s.dep, s.share), 'Took the percentage before the provision was charged.'],
          ],
          [`Transfer = ${s.share}% of the net profit = ${inr(s.net)} x ${s.share}/100 = ${inr(s.reserve)}.`],
          ['First find the net profit.', 'The reserve is a percentage of the net profit.'],
        ),
      verify: (q) => q.answer === readProvisionReserve(q.context).reserve,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          `What is the proprietor's capital on ${YEAR_END}?`,
          s.closing,
          [
            [s.closing + s.reserve, 'Added the whole net profit to the capital; the part transferred to General Reserve is kept apart.'],
            [s.closing + s.drawn, 'Left out the drawings.'],
            [s.closing - s.reserve, 'Deducted the reserve twice.'],
            [s.capital + s.draft - s.drawn, 'Added the profit before the charges and left out the reserve.'],
          ],
          [`Profit added to capital = ${inr(s.net)} - ${inr(s.reserve)} = ${inr(s.net - s.reserve)}.`, `Capital = ${inr(s.capital)} + ${inr(s.net - s.reserve)} - drawings ${inr(s.drawn)} = ${inr(s.closing)}.`],
          ['What part of the profit is added to the capital?', 'Closing capital = opening capital + profit added - drawings.'],
        ),
      verify: (q) => q.answer === readProvisionReserve(q.context).closing,
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 13. Goods lost by fire near the year end (medium). Part of the stock burns; the insurer admits a part of the cost;
// nothing has been entered. The case climbs from the entry for the fire (journal), through the gross profit and the net
// profit (final accounts with adjustments), to where the claim stands in the balance sheet.
// ---------------------------------------------------------------------------------------------------------------

interface Fire {
  b: Biz;
  os: number;
  purchases: number;
  sales: number;
  wages: number;
  cs: number;
  expenses: number;
  goods: number;
  share: number;
  claim: number;
  k: number;
  gross: number;
  net: number;
}

function readFire(context: string | undefined) {
  const [os, purchases, sales, wages] = amountsIn(lineOf(context, /For the year ended 31 March 2026: opening stock/));
  const fire = lineOf(context, /destroyed by fire/);
  const goods = amountsIn(fire)[0];
  const share = intIn(fire, /claim for (\d+)% of their cost/);
  const claim = /They were not insured\./.test(fire) ? 0 : (goods * share) / 100;
  const cs = amountsIn(lineOf(context, /stock counted on 31 March 2026/))[0];
  const expenses = amountsIn(lineOf(context, /indirect expenses/))[0];
  const gross = sales - (os + purchases - goods + wages - cs);
  return { goods, claim, gross, net: gross - expenses - (goods - claim) };
}

const fireLoss = caseTemplate<Fire>({
  id: 'case-wy-fire-near-year-end',
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: 'Goods lost by fire near the year end',
  setup: (rng) =>
    attempt(30, () => {
      const b = business(rng, 13);
      const os = amount(rng, 40000, 120000, 5000);
      const cs = amount(rng, 40000, 120000, 5000);
      const purchases = amount(rng, 300000, 700000, 10000);
      const wages = amount(rng, 20000, 60000, 2000);
      const goods = amount(rng, 20000, 80000, 5000);
      const share = rng.pick([0, 50, 60, 75, 80]);
      const claim = pct(goods, share);
      const cogs = os + purchases - goods + wages - cs;
      const gross = Math.round(pct(cogs, rng.pick([25, 30, 35])) / R(1000)) * R(1000);
      const sales = cogs + gross;
      const expenses = amount(rng, 40000, Math.max(50000, Math.floor((gross / 100) * 0.6 / 1000) * 1000), 1000);
      const net = gross - expenses - (goods - claim);
      if (!clean(net) || (share && !clean(claim)) || net < R(10000)) return null;
      return { b, os, purchases, sales, wages, cs, expenses, goods, share, claim, k: rng.pick([9, 10, 11]), gross, net };
    }),
  context: (s) =>
    [
      `${s.b.owner} runs ${s.b.trade} in ${s.b.city}. For the year ended ${YEAR_END}: opening stock ${inr(s.os)}, purchases ${inr(s.purchases)}, sales ${inr(s.sales)}, wages ${inr(s.wages)}.`,
      `On ${dayOf(s.k)} goods costing ${inr(s.goods)} were destroyed by fire. ${s.share ? `The insurer admitted a claim for ${s.share}% of their cost, not yet received.` : 'They were not insured.'} No entry has been made.`,
      `The stock counted on 31 March 2026, after the fire, was ${inr(s.cs)}.`,
      `The indirect expenses of the year come to ${inr(s.expenses)}; there is no other item. Goods lost are credited to Purchases A/c at cost.`,
    ].join('\n'),
  parts: [
    {
      kind: 'journal',
      make: (s) =>
        entry(
          'Pass the journal entry for the goods destroyed by fire.',
          s.share ? [dr('insuranceClaimReceivable', s.claim), dr('lossByFire', s.goods - s.claim), cr('purchases', s.goods)] : [dr('lossByFire', s.goods), cr('purchases', s.goods)],
          [
            ...(s.share ? [`Claim admitted = ${inr(s.goods)} x ${s.share}/100 = ${inr(s.claim)}, due from the insurer: Insurance Claim Receivable A/c is debited.`, `The part not covered, ${inr(s.goods)} - ${inr(s.claim)} = ${inr(s.goods - s.claim)}, is the loss: Loss by Fire A/c is debited.`] : ['The goods were not insured, so their whole cost is a loss: Loss by Fire A/c is debited.']),
            'The goods leave the stock bought for sale at cost: Purchases A/c is credited.',
          ],
          ['stock', 'insurance'],
          ['What part of the cost will the insurer pay?', 'The goods come out of purchases at cost; what is not covered is a loss.'],
        ),
      verify: (q) => {
        const c = readFire(q.context);
        return q.expected.some((l) => l.accountId === 'purchases' && l.side === 'Cr' && l.amount === c.goods) && q.expected.some((l) => l.accountId === 'lossByFire' && l.amount === c.goods - c.claim);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          `What is the gross profit for the year ended ${YEAR_END}?`,
          s.gross,
          [
            [s.gross - s.goods, 'Left the burnt goods in purchases: they were not sold, so they come out of the cost of goods sold.'],
            [s.gross - s.goods + s.claim, 'Took only the uninsured part out of purchases. The whole cost of the goods lost comes out; the claim is dealt with separately.'],
            [s.gross + s.goods, 'Added the goods lost to the closing stock as well as taking them out of purchases.'],
            [s.gross - (s.goods - s.claim), 'Charged the loss by fire in the Trading Account.'],
          ],
          [
            `Purchases = ${inr(s.purchases)} - goods lost ${inr(s.goods)} = ${inr(s.purchases - s.goods)}.`,
            `Cost of goods sold = ${inr(s.os)} + ${inr(s.purchases - s.goods)} + wages ${inr(s.wages)} - ${inr(s.cs)} = ${inr(s.sales - s.gross)}.`,
            `Gross profit = ${inr(s.sales)} - ${inr(s.sales - s.gross)} = ${inr(s.gross)}.`,
          ],
          ['Goods lost by fire were not sold: take their cost out of purchases.', 'The loss itself belongs to the Profit and Loss Account.'],
        ),
      verify: (q) => q.answer === readFire(q.context).gross,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          `What is the net profit for the year ended ${YEAR_END}?`,
          s.net,
          [
            [s.net + s.goods - s.claim, 'Left out the loss by fire.'],
            [s.share ? s.net - s.claim : null, 'Charged the whole cost of the goods as a loss, ignoring the claim admitted.'],
            [s.share ? s.net + s.claim : null, 'Took the claim as an income of the year as well as reducing the loss.'],
            [s.net - s.goods, 'Left the goods lost in purchases and charged the loss as well.'],
          ],
          [`Gross profit ${inr(s.gross)}.`, `Less: indirect expenses ${inr(s.expenses)}.`, `Less: loss by fire ${inr(s.goods - s.claim)}${s.share ? ` (cost ${inr(s.goods)} - claim ${inr(s.claim)})` : ''}.`, `Net profit = ${inr(s.gross)} - ${inr(s.expenses)} - ${inr(s.goods - s.claim)} = ${inr(s.net)}.`],
          ['The part of the loss the insurer does not bear is charged to the Profit and Loss Account.', 'Net profit = gross profit - expenses and losses.'],
        ),
      verify: (q) => q.answer === readFire(q.context).net,
    },
    {
      kind: 'mcq',
      make: (s) =>
        s.share
          ? choice(
              `Where is the claim of ${inr(s.claim)} shown on ${YEAR_END}?`,
              'In the balance sheet, as a current asset: Insurance Claim Receivable',
              [
                ['In the Profit and Loss Account, as an income', 'The claim is set against the loss, which is charged only for the part not covered; it is not an income besides.'],
                ['In the balance sheet, as a current liability', 'The insurer owes the business, not the other way round.'],
                ['Added to the closing stock', 'The goods are gone; what the business holds is a claim on the insurer.'],
                ['Nowhere until the money is received', 'The claim is admitted, so it is an amount due: an asset now, under the accrual principle.'],
              ],
              'The insurer has admitted the claim but not paid it: the business has an amount to receive within the year, a current asset, Insurance Claim Receivable.',
              ['Who owes whom?', 'An amount to be received within the year is a current asset.'],
            )
          : choice(
              'The goods were not insured. Where does their cost finally go?',
              'To the Profit and Loss Account, as Loss by Fire',
              [
                ['It stays in the Trading Account inside purchases', 'Goods lost were not sold. Their cost is taken out of purchases and charged as a loss.'],
                ['To the balance sheet, as an asset', 'Nothing is left to claim: the goods are gone and no one owes the business for them.'],
                ['To the proprietor\'s drawings', 'The proprietor did not take the goods; the business lost them.'],
                ['Nowhere: a loss not insured is not recorded', 'Every loss is recorded; one that is not insured falls wholly on the profit.'],
              ],
              'With no insurance, the whole cost of the goods lost is a loss of the year: it leaves purchases at cost and is charged in the Profit and Loss Account as Loss by Fire.',
              ['Was anything recovered?', 'Goods lost are taken out of purchases at cost; what is not recovered is a loss.'],
            ),
      verify: (q) => {
        const c = readFire(q.context);
        return picked(q) === (c.claim > 0 ? 'In the balance sheet, as a current asset: Insurance Claim Receivable' : 'To the Profit and Loss Account, as Loss by Fire');
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 14. Capital or revenue: the payments of the year (medium). A new machine with carriage and installation, repairs to
// an old machine, a second-hand van overhauled before use, and the running costs of the year. The case climbs from the
// cost of the machine (capital expenditure), through which payment is revenue expenditure and the depreciation for the
// months of use, to what the year's profit bears and the principle that spreads a cost over the years.
// ---------------------------------------------------------------------------------------------------------------

interface Payments {
  b: Biz;
  price: number;
  carriage: number;
  fitting: number;
  k: number;
  rate: number;
  repairs: number;
  van: number;
  overhaul: number;
  kVan: number;
  vanRate: number;
  whitewash: number;
  cost: number;
  dep: number;
  vanDep: number;
  charged: number;
}

function readPayments(context: string | undefined) {
  const a = lineOf(context, '(a)');
  const [price, carriage, fitting] = amountsIn(a);
  const k = monthIn(a);
  const repairs = amountsIn(lineOf(context, '(b)'))[0];
  const c = lineOf(context, '(c)');
  const [van, overhaul] = amountsIn(c);
  const kVan = monthIn(c);
  const whitewash = amountsIn(lineOf(context, '(d)'))[0];
  const rule = lineOf(context, 'Depreciation:');
  const rate = intIn(rule, /machinery at (\d+)% p\.a\./);
  const vanRate = intIn(rule, /vehicles at (\d+)% p\.a\./);
  const cost = price + carriage + fitting;
  const dep = (cost * rate * (12 - k)) / 1200;
  const vanDep = ((van + overhaul) * vanRate * (12 - kVan)) / 1200;
  return { cost, dep, charged: repairs + whitewash + dep + vanDep };
}

const capitalOrRevenue = caseTemplate<Payments>({
  id: 'case-wy-capital-or-revenue',
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: 'Capital or revenue: the payments of the year',
  setup: (rng) =>
    attempt(30, () => {
      const b = business(rng, 14);
      const price = amount(rng, 150000, 500000, 10000);
      const carriage = amount(rng, 2000, 10000, 500);
      const fitting = amount(rng, 5000, 25000, 1000);
      const k = rng.pick([2, 3, 4, 6, 8, 9]);
      const rate = rng.pick([10, 15, 20]);
      const repairs = amount(rng, 3000, 20000, 500);
      const van = amount(rng, 100000, 300000, 10000);
      const overhaul = amount(rng, 10000, 40000, 2000);
      const kVan = rng.pick([3, 4, 6, 9].filter((m) => m !== k));
      const vanRate = rng.pick([10, 20]);
      const whitewash = amount(rng, 4000, 18000, 1000);
      const cost = price + carriage + fitting;
      const dep = (cost * rate * (12 - k)) / 1200;
      const vanDep = ((van + overhaul) * vanRate * (12 - kVan)) / 1200;
      const figures = [carriage, fitting, repairs, overhaul, whitewash];
      if (![dep, vanDep].every(clean) || new Set(figures).size !== figures.length) return null;
      return { b, price, carriage, fitting, k, rate, repairs, van, overhaul, kVan, vanRate, whitewash, cost, dep, vanDep, charged: repairs + whitewash + dep + vanDep };
    }),
  context: (s) =>
    [
      `${s.b.owner} runs ${s.b.trade} in ${s.b.city}; the year ends on 31 March. Among the payments of the year ended ${YEAR_END}:`,
      `(a) On ${dayOf(s.k)}, a new ${s.b.machine} for ${inr(s.price)}, with ${inr(s.carriage)} for carriage to the works and ${inr(s.fitting)} for its installation.`,
      `(b) ${inr(s.repairs)} for repairs to an old machine that broke down during the year.`,
      `(c) On ${dayOf(s.kVan)}, a second-hand delivery van for ${inr(s.van)}, and ${inr(s.overhaul)} to overhaul it before it was first used.`,
      `(d) ${inr(s.whitewash)} for whitewashing the office, as is done every year.`,
      `Depreciation: machinery at ${s.rate}% p.a. and vehicles at ${s.vanRate}% p.a. on cost, for the months of use.`,
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          `At what cost is the new ${s.b.machine} recorded in Machinery A/c?`,
          s.cost,
          [
            [s.price, 'Recorded the price alone. Carriage and installation are needed to bring the machine into use, so they are part of its cost.'],
            [s.price + s.fitting, 'Left out the carriage to the works.'],
            [s.price + s.carriage, 'Left out the installation.'],
            [s.cost + s.repairs, 'Added the repairs to the old machine, which keep an existing asset going: revenue expenditure.'],
          ],
          [`Cost = price ${inr(s.price)} + carriage ${inr(s.carriage)} + installation ${inr(s.fitting)} = ${inr(s.cost)}.`],
          H.capitalise,
        ),
      verify: (q) => q.answer === readPayments(q.context).cost,
    },
    {
      kind: 'mcq',
      make: (s) =>
        choice(
          'Which of these payments is revenue expenditure?',
          `The ${inr(s.repairs)} for repairs to the old machine`,
          [
            [`The ${inr(s.overhaul)} to overhaul the second-hand van before it was first used`, 'Putting a newly bought asset into working order before its first use is part of its cost: capital expenditure.'],
            [`The ${inr(s.fitting)} for installing the new ${s.b.machine}`, 'Installation brings the new machine into use: capital expenditure.'],
            [`The ${inr(s.carriage)} for carriage of the new ${s.b.machine} to the works`, 'Carriage on a new asset is part of its cost: capital expenditure.'],
            [`The ${inr(s.van)} paid for the second-hand van`, 'A van bought for use in the business for years is a fixed asset: capital expenditure.'],
          ],
          'Repairs to an asset already in use only keep it working: they bring no new benefit for later years, so they are revenue expenditure, charged to the year. The other payments buy an asset or make a new one ready for use: capital expenditure.',
          ['Does the payment bring a benefit lasting beyond the year, or only keep an asset going?', 'Payments that make a newly bought asset ready for use are part of its cost.'],
        ),
      verify: (q) => picked(q).includes('repairs to the old machine'),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          `What is the depreciation on the new ${s.b.machine} for the year?`,
          s.dep,
          [
            [(s.price * s.rate * (12 - s.k)) / 1200, 'Charged depreciation on the price alone.'],
            [pct(s.cost, s.rate), `Charged a full year, although the machine was bought on ${dayOf(s.k)}.`],
            [(s.cost * s.rate * (11 - s.k)) / 1200, 'Counted the months from the month after the purchase.'],
          ],
          [`Months of use: ${dayOf(s.k)} to ${YEAR_END} = ${monthsWord(12 - s.k)}.`, `Depreciation = ${inr(s.cost)} x ${s.rate}/100 x ${12 - s.k}/12 = ${inr(s.dep)}.`],
          H.partYear,
        ),
      verify: (q) => {
        const c = readPayments(q.context);
        return q.answer === c.dep;
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          'Of these payments and the assets they bought, how much is charged against the profit of the year, depreciation included?',
          s.charged,
          [
            [s.repairs + s.whitewash, 'Left out the depreciation, which is how the capital expenditure reaches the profit.'],
            [s.charged + s.overhaul - ((s.overhaul * s.vanRate * (12 - s.kVan)) / 1200), 'Charged the overhaul of the van as revenue expenditure instead of adding it to the van.'],
            [s.charged + s.carriage + s.fitting - (((s.carriage + s.fitting) * s.rate * (12 - s.k)) / 1200), 'Charged the carriage and installation as expenses of the year.'],
            [s.repairs + s.whitewash + s.dep, 'Left out the depreciation on the van.'],
            [s.charged - s.repairs, 'Took the repairs to the old machine for capital expenditure and left them out of the charge. They only keep an existing machine going: revenue expenditure.'],
          ],
          [
            `Revenue expenditure: repairs ${inr(s.repairs)} + whitewashing ${inr(s.whitewash)} = ${inr(s.repairs + s.whitewash)}.`,
            `Depreciation on the machine ${inr(s.dep)}.`,
            `Depreciation on the van = (${inr(s.van)} + ${inr(s.overhaul)}) x ${s.vanRate}/100 x ${12 - s.kVan}/12 = ${inr(s.vanDep)}.`,
            `Charged against profit = ${added([s.repairs, s.whitewash, s.dep, s.vanDep])}.`,
          ],
          ['Revenue expenditure is charged in full; capital expenditure only through depreciation.', 'The overhaul is part of the cost of the van.'],
        ),
      verify: (q) => q.answer === readPayments(q.context).charged,
    },
    {
      kind: 'mcq',
      make: (s) =>
        choice(
          `Why is the cost of the new ${s.b.machine} not charged in full against the profit of this year?`,
          'Matching: the machine serves many years, so its cost is spread over them by depreciation',
          [
            ['Prudence: profits must not be shown lower than they are', 'Prudence leans the other way, towards lower profits; it is not why a cost is spread over years.'],
            ['Money measurement: the machine cannot be valued in money', 'The machine has a cost in money; it is recorded at that cost.'],
            ['Going concern: the machine will be sold when the business closes', 'Going concern assumes the business continues; the cost is spread because the machine serves the years ahead.'],
            ['Consistency: the same method must be used every year', 'Consistency is about keeping to one method; it does not explain why a cost is spread.'],
          ],
          'The machine earns revenue for many years. Matching sets each year\'s expenses against that year\'s revenue, so the cost is spread over the years of use through depreciation instead of being charged at once.',
          ['How long will the machine be used?', 'One principle sets the expenses of a period against the revenue they help to earn.'],
        ),
      verify: (q) => picked(q).startsWith('Matching'),
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 15. Cash basis or accrual basis (medium). A service business whose records follow the cash: fees and expenses
// received and paid, with what belongs to last year, this year and next year. The case climbs from the profit on the
// cash basis (theory base), through the income and the profit of the year on the accrual basis, to an adjusting entry
// (journal) and the principle the accrual basis follows.
// ---------------------------------------------------------------------------------------------------------------

const SERVICES: Biz[] = [
  { owner: 'Asha Pillai', trade: 'a courier service', city: 'Kochi', machine: '' },
  { owner: 'Manish Tiwari', trade: 'a coaching centre', city: 'Kota', machine: '' },
  { owner: 'Zoya Mirza', trade: 'a beauty parlour', city: 'Lucknow', machine: '' },
  { owner: 'Rohan Kulkarni', trade: 'a computer repair service', city: 'Pune', machine: '' },
  { owner: 'Nirmala Das', trade: 'an event-planning service', city: 'Bhubaneswar', machine: '' },
  { owner: 'Karthik Raman', trade: 'a travel agency', city: 'Madurai', machine: '' },
];

interface CashBasis {
  b: Biz;
  fees: number;
  feesLast: number;
  feesDue: number;
  feesAhead: number;
  paid: number;
  paidLast: number;
  paidAhead: number;
  owed: number;
  cash: number;
  income: number;
  expense: number;
  accrual: number;
}

function readCashBasis(context: string | undefined) {
  const a = lineOf(context, 'Fees received');
  const [fees, feesLast, feesAhead] = amountsIn(a);
  const feesDue = amountsIn(lineOf(context, /fees earned this year/))[0];
  const p = lineOf(context, 'Expenses paid');
  const [paid, paidLast, paidAhead] = amountsIn(p);
  const owed = amountsIn(lineOf(context, /still to be paid/))[0];
  const income = fees - feesLast - feesAhead + feesDue;
  const expense = paid - paidLast - paidAhead + owed;
  return { cash: fees - paid, income, accrual: income - expense, owed };
}

const cashOrAccrual = caseTemplate<CashBasis>({
  id: 'case-wy-cash-or-accrual',
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: 'Cash basis or accrual basis',
  setup: (rng) =>
    attempt(30, () => {
      const b = rng.pick(SERVICES);
      const fees = amount(rng, 400000, 900000, 10000);
      const feesLast = amount(rng, 10000, 40000, 1000);
      const feesAhead = amount(rng, 5000, 30000, 1000);
      const feesDue = amount(rng, 10000, 50000, 1000);
      const paid = amount(rng, 200000, Math.floor((fees / 100) * 0.7 / 10000) * 10000, 10000);
      const paidLast = amount(rng, 5000, 25000, 1000);
      const paidAhead = amount(rng, 3000, 20000, 1000);
      const owed = amount(rng, 5000, 30000, 1000);
      const income = fees - feesLast - feesAhead + feesDue;
      const expense = paid - paidLast - paidAhead + owed;
      const figures = [feesLast, feesAhead, feesDue, paidLast, paidAhead, owed];
      if (new Set(figures).size !== figures.length || income - expense < R(30000) || income - expense === fees - paid) return null;
      return { b, fees, feesLast, feesDue, feesAhead, paid, paidLast, paidAhead, owed, cash: fees - paid, income, expense, accrual: income - expense };
    }),
  context: (s) =>
    [
      `${s.b.owner} runs ${s.b.trade} in ${s.b.city}. Its records for the year ended ${YEAR_END} follow the cash: an item is entered when money comes in or goes out.`,
      `Fees received in the year: ${inr(s.fees)}. They include ${inr(s.feesLast)} for work done last year and ${inr(s.feesAhead)} received in advance for work to be done next year.`,
      `Of the fees earned this year, ${inr(s.feesDue)} had not been received by 31 March.`,
      `Expenses paid in the year: ${inr(s.paid)}. They include ${inr(s.paidLast)} owed for last year and ${inr(s.paidAhead)} paid in advance for next year.`,
      `Expenses of this year still to be paid on 31 March: ${inr(s.owed)} (salaries for March).`,
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          'What is the profit for the year on the cash basis?',
          s.cash,
          [
            [s.accrual, 'Worked the profit on the accrual basis. The cash basis takes only the money received and paid.'],
            [s.fees - s.paid + s.feesDue - s.owed, 'Brought in the amounts still to be received and paid, which the cash basis ignores.'],
            [s.fees, 'Gave the fees received, without deducting the expenses paid.'],
          ],
          [`Cash basis: profit = fees received - expenses paid = ${inr(s.fees)} - ${inr(s.paid)} = ${inr(s.cash)}.`],
          ['On the cash basis an item counts only when money moves.', 'Profit = money received - money paid.'],
        ),
      verify: (q) => q.answer === readCashBasis(q.context).cash,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          'What is the fee income of the year on the accrual basis?',
          s.income,
          [
            [s.fees + s.feesDue, 'Added the fees still to be received but did not take out last year\'s fees or those received in advance.'],
            [s.fees - s.feesLast + s.feesDue, 'Left the fees received in advance in this year\'s income.'],
            [s.fees - s.feesAhead + s.feesDue, 'Left last year\'s fees in this year\'s income.'],
            [s.fees - s.feesLast - s.feesAhead, 'Left out the fees earned this year and not yet received.'],
          ],
          [`Income = fees received ${inr(s.fees)} - last year's ${inr(s.feesLast)} - next year's ${inr(s.feesAhead)} + earned but not received ${inr(s.feesDue)} = ${inr(s.income)}.`],
          ['Which of the fees were earned this year?', 'Take out what belongs to other years; add what was earned this year and not yet received.'],
        ),
      verify: (q) => q.answer === readCashBasis(q.context).income,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          'What is the profit for the year on the accrual basis?',
          s.accrual,
          [
            [s.cash, 'Gave the profit on the cash basis.'],
            [s.income - s.paid, 'Took the expenses at the amount paid, without adjusting them.'],
            [s.income - (s.paid + s.paidLast + s.paidAhead + s.owed), 'Added last year\'s and next year\'s payments to the expenses instead of taking them out.'],
            [s.income - (s.paid - s.paidLast - s.paidAhead), 'Left out the expenses still to be paid.'],
          ],
          [
            `Expenses of the year = paid ${inr(s.paid)} - last year's ${inr(s.paidLast)} - next year's ${inr(s.paidAhead)} + still to be paid ${inr(s.owed)} = ${inr(s.expense)}.`,
            `Profit = ${inr(s.income)} - ${inr(s.expense)} = ${inr(s.accrual)}.`,
          ],
          ['Adjust the expenses the same way as the income.', 'Profit on the accrual basis = income of the year - expenses of the year.'],
        ),
      verify: (q) => q.answer === readCashBasis(q.context).accrual,
    },
    {
      kind: 'journal',
      make: (s) =>
        entry(
          'On the accrual basis, pass the adjusting entry on 31 March for the salaries still to be paid.',
          [dr('salaries', s.owed), cr('outstandingExpenses', s.owed)],
          ['The salaries belong to this year, though unpaid: Salaries A/c is debited.', 'They are owed to the staff, a liability: Outstanding Expenses A/c is credited.'],
          ['prepaidExpenses', 'cash'],
          ['Is the expense of this year or the next?', 'An unpaid expense of the year is a liability on 31 March.'],
        ),
      verify: (q) => entryIs(q, [dr('salaries', readCashBasis(q.context).owed), cr('outstandingExpenses', readCashBasis(q.context).owed)]),
    },
    {
      kind: 'mcq',
      make: () =>
        choice(
          'Why do the final accounts of a business follow the accrual basis rather than the cash basis?',
          'Because incomes and expenses are matched with the year they belong to, which gives the true profit of the year',
          [
            ['Because the accrual basis always shows a higher profit', 'The accrual basis may show a higher or a lower profit; it is chosen for its accuracy, not its result.'],
            ['Because the cash basis cannot be used for a business with a bank account', 'A bank account has nothing to do with it; the cash basis simply ignores amounts due and paid ahead.'],
            ['Because under the accrual basis no money is ever owed at the year end', 'Under the accrual basis amounts owed are recognised and shown as liabilities; they do not disappear.'],
            ['Because the cash basis does not record expenses at all', 'The cash basis records expenses when they are paid; it does not leave them out.'],
          ],
          'The accrual basis records an income when it is earned and an expense when it is incurred, whatever the time of payment. Each year bears its own incomes and expenses, so the profit is that of the year; the cash basis mixes in amounts of other years.',
          ['What does each basis do with an amount that belongs to another year?', 'The accrual basis records items in the period they relate to.'],
        ),
      verify: (q) => picked(q).startsWith('Because incomes and expenses are matched'),
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 16. Machinery at cost and its provision for depreciation (medium). The trial balance carries machinery at cost and the
// provision for depreciation brought forward; a machine was bought during the year. The case climbs from the year's
// depreciation and its entry (depreciation, journal), through the provision at the year end (provisions), to how
// machinery is shown in the balance sheet and at what figure.
// ---------------------------------------------------------------------------------------------------------------

interface AtCost {
  b: Biz;
  machinery: number;
  added: number;
  k: number;
  provision: number;
  rate: number;
  dep: number;
  closing: number;
}

function readAtCost(context: string | undefined) {
  const machinery = amountsIn(lineOf(context, 'Machinery A/c (at cost):'))[0];
  const provision = amountsIn(lineOf(context, 'Provision for Depreciation A/c:'))[0];
  const note = lineOf(context, /bought on/);
  const added = amountsIn(note)[0];
  const rate = intIn(lineOf(context, /on cost \(straight line\)/), /at (\d+)% p\.a\./);
  const dep = ((machinery - added) * rate) / 100 + (added * rate * (12 - monthIn(note))) / 1200;
  return { machinery, added, dep, closing: provision + dep };
}

const atCost = caseTemplate<AtCost>({
  id: 'case-wy-machinery-at-cost',
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: 'Machinery at cost and its provision for depreciation',
  setup: (rng) =>
    attempt(30, () => {
      const b = business(rng, 16);
      const old = amount(rng, 300000, 800000, 20000);
      const added = amount(rng, 60000, 240000, 20000);
      const k = rng.pick([3, 4, 6, 7, 9]);
      const rate = rng.pick([10, 15, 20]);
      const years = rng.int(1, 3);
      const provision = pct(old, rate) * years;
      const dep = pct(old, rate) + (added * rate * (12 - k)) / 1200;
      if (!clean(dep) || !clean(provision) || provision + dep >= old + added) return null;
      return { b, machinery: old + added, added, k, provision, rate, dep, closing: provision + dep };
    }),
  context: (s) =>
    [
      `${s.b.owner} runs ${s.b.trade} in ${s.b.city}. The trial balance on ${YEAR_END} includes:`,
      `Machinery A/c (at cost): ${inr(s.machinery)} (Dr)`,
      `Provision for Depreciation A/c: ${inr(s.provision)} (Cr), as on 1 April 2025`,
      `The machinery includes ${an(s.b.machine)} bought on ${dayOf(s.k)} for ${inr(s.added)}; the rest was held all year.`,
      `Depreciation is charged at ${s.rate}% p.a. on cost (straight line), for the months of use, and credited to Provision for Depreciation A/c; Machinery A/c stays at cost.`,
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          `What is the depreciation on machinery for the year ended ${YEAR_END}?`,
          s.dep,
          [
            [pct(s.machinery, s.rate), `Charged a full year on the ${s.b.machine} bought on ${dayOf(s.k)}.`],
            [pct(s.machinery - s.provision, s.rate), 'Applied the rate to the cost less the provision: that is the written down value method, not the straight line.'],
            [pct(s.machinery - s.added, s.rate), `Left out the ${s.b.machine} bought during the year.`],
          ],
          [
            `On the machinery held all year: (${inr(s.machinery)} - ${inr(s.added)}) x ${s.rate}/100 = ${inr(pct(s.machinery - s.added, s.rate))}.`,
            `On the ${s.b.machine}, ${monthsWord(12 - s.k)}: ${inr(s.added)} x ${s.rate}/100 x ${12 - s.k}/12 = ${inr((s.added * s.rate * (12 - s.k)) / 1200)}.`,
            `Depreciation = ${added([pct(s.machinery - s.added, s.rate), (s.added * s.rate * (12 - s.k)) / 1200])}.`,
          ],
          H.partYear,
        ),
      verify: (q) => q.answer === readAtCost(q.context).dep,
    },
    {
      kind: 'journal',
      make: (s) =>
        entry(
          'Pass the journal entry for the depreciation of the year.',
          [dr('depreciation', s.dep), cr('provisionForDepreciation', s.dep)],
          ['Depreciation is an expense of the year: Depreciation A/c is debited.', 'Machinery A/c stays at cost, so the depreciation is credited to Provision for Depreciation A/c.'],
          ['machinery', 'profitAndLoss'],
          ['Which account collects the depreciation here?', 'With a provision account, the asset account is never credited with depreciation.'],
        ),
      verify: (q) => entryIs(q, [dr('depreciation', readAtCost(q.context).dep), cr('provisionForDepreciation', readAtCost(q.context).dep)]),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          `What is the balance of Provision for Depreciation A/c on ${YEAR_END}?`,
          s.closing,
          [
            [s.dep, 'Gave the depreciation of the year alone; the provision collects every year\'s depreciation.'],
            [s.provision, 'Gave the balance on 1 April 2025, before this year\'s depreciation.'],
            [s.machinery - s.closing, 'Gave the book value of the machinery instead of the provision.'],
          ],
          [`Provision = ${inr(s.provision)} brought forward + ${inr(s.dep)} for the year = ${inr(s.closing)}.`],
          ['The provision grows by each year\'s depreciation.', 'It is not reduced until a machine is sold.'],
        ),
      verify: (q) => q.answer === readAtCost(q.context).closing,
    },
    {
      kind: 'mcq',
      make: () =>
        choice(
          'How is the provision for depreciation shown in the balance sheet?',
          'Deducted from machinery at cost, on the assets side',
          [
            ['On the liabilities side, as a provision owed to others', 'The provision is not owed to anyone: it shows how much of the cost has been used up, so it reduces the asset.'],
            ['Added to machinery on the assets side', 'The provision records the fall in value; adding it would overstate the machinery.'],
            ['It is not shown: it is closed to Profit and Loss A/c each year', 'Only the year\'s depreciation goes to Profit and Loss A/c; the provision is carried forward and grows each year.'],
            ['Added to the capital, as a reserve', 'A provision for depreciation is not a reserve: it is a charge, kept against the asset.'],
          ],
          'Machinery is shown at its original cost, and the provision for depreciation is deducted from it on the assets side, so the balance sheet shows both the cost and the book value.',
          ['Is the provision owed to anyone?', 'A provision for depreciation reduces the asset it relates to.'],
        ),
      verify: (q) => picked(q) === 'Deducted from machinery at cost, on the assets side',
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          `At what net figure does machinery stand in the balance sheet on ${YEAR_END}?`,
          s.machinery - s.closing,
          [
            [s.machinery - s.provision, 'Deducted only the provision brought forward, leaving out this year\'s depreciation.'],
            [s.machinery - s.dep, 'Deducted only this year\'s depreciation.'],
            [s.machinery, 'Showed machinery at cost, without the provision.'],
          ],
          [`Machinery at cost ${inr(s.machinery)} - provision for depreciation ${inr(s.closing)} = ${inr(s.machinery - s.closing)}.`],
          ['Net figure = cost - all the depreciation provided so far.', 'This year\'s depreciation is in the provision too.'],
        ),
      verify: (q) => {
        const c = readAtCost(q.context);
        return q.answer === c.machinery - c.closing;
      },
    },
  ],
});

// ===============================================================================================================
// CHAINED CASES: a set of entries or a format among the parts, on at least two kinds of book
// ===============================================================================================================

/** A row a reading expects: its particulars and its amount. */
type Want = readonly [label: string, amount: number];
/** True when a list of rows holds exactly these, each once, and only `closing` (if given) is a closing row. */
function rowsAre(rows: readonly FormatRow[], want: readonly Want[], closing?: string): boolean {
  const key = (label: string, a: number) => `${label}|${a}`;
  const have = rows.map((r) => key(r.label, r.amounts[0])).sort();
  const need = want.map(([label, a]) => key(label, a)).sort();
  return have.length === need.length && have.every((k, i) => k === need[i]) && rows.every((r) => Boolean(r.closing) === (r.label === closing));
}
/** What an entry does to the profit: the credits to incomes and expenses less the debits to them. */
const profitOfLines = (lines: readonly JournalLine[]): number =>
  sumOf(lines.map((l) => (['income', 'expense'].includes(resolveAccount(l.accountId).type) ? (l.side === 'Cr' ? l.amount : -l.amount) : 0)));

// ---------------------------------------------------------------------------------------------------------------
// C1. Errors, the Suspense A/c and the corrected profit (complex). Three errors that upset the trial balance, one that
// did not, and an asset charged as an expense, which also needs its depreciation. The student passes the rectifying
// entries (journal), prepares the Suspense A/c and finds the difference it opened with (ledger, trial balance), and
// works out the corrected profit (final accounts). The errors are those of short case 2, so their wording and entries
// are one; the Suspense A/c follows the format of the rectification topic: the difference it opened with is entered
// as "Difference in trial balance", and every other row carries the letter of its error.
// ---------------------------------------------------------------------------------------------------------------

const DIFFERENCE = 'Difference in trial balance';

interface SuspenseChain {
  b: Biz;
  draft: number;
  rate: number;
  errors: Slipup[];
  capital: number;
  dep: number;
  gap: number;
  corrected: number;
}

function readSuspenseChain(context: string | undefined) {
  const c = readAfterTb(context);
  const draft = amountsIn(lineOf(context, /the draft final accounts show a net profit of/))[0];
  const capital = c.errors.find((e) => /debited to (Purchases|Wages) A\/c\.$/.test(e.text) && !e.text.startsWith('Goods'));
  return { ...c, draft, capital, corrected: draft + c.fix - c.dep };
}

const chainSuspense = caseTemplate<SuspenseChain>({
  id: 'case-wy-chain-errors-suspense-profit',
  topicId: T,
  conceptId: C,
  difficulty: 'complex',
  title: 'Rectifying entries, the Suspense A/c and the corrected profit',
  setup: (rng) =>
    attempt(30, () => {
      const b = business(rng, 21);
      const names = rng.shuffle(peopleOf(b));
      const picks = rng.shuffle(ONE_SIDED.map((_, i) => i)).slice(0, 3);
      const ones = picks.map((i, n) => ONE_SIDED[i](rng, names[n]));
      const two = rng.pick(TWO_SIDED)(rng, names[3]);
      const capital = chargedAsExpense(rng, b.machine);
      const errors = rng.shuffle([...ones, two, capital]);
      const all = errors.map((e) => amountsIn(e.text)[0]);
      const gap = sumOf(errors.map((e) => e.gap));
      // Every one-sided error makes a row of Suspense A/c on its own side; the opening difference makes one more.
      if (new Set(all).size !== all.length || gap === 0) return null;
      const rate = rng.pick([10, 15, 20]);
      const a = capital.asset!;
      const dep = (a.cost * rate * (12 - a.k)) / 1200;
      const draft = amount(rng, 120000, 400000, 1000);
      const corrected = draft + sumOf(errors.map((e) => e.fix)) - dep;
      if (!clean(dep) || !clean(corrected)) return null;
      return { b, draft, rate, errors, capital: errors.indexOf(capital), dep, gap, corrected };
    }),
  context: (s) =>
    [
      `${s.b.owner} runs ${s.b.trade} in ${s.b.city}. The trial balance on ${YEAR_END} did not agree: the difference was put to Suspense A/c, and the draft final accounts show a net profit of ${inr(s.draft)}. These errors were then found:`,
      ...s.errors.map((e, i) => `(${LETTERS[i]}) ${e.text}`),
      `Machinery is depreciated at ${s.rate}% p.a. on cost for the months of use, written off the asset. Nothing has yet been charged on the amount in (${LETTERS[s.capital]}).`,
      'With these errors put right, Suspense A/c is closed. The profit is corrected for these items only.',
    ].join('\n'),
  parts: [
    {
      kind: 'journal_set',
      make: (s): CaseSetParts => {
        const a = s.errors[s.capital].asset!;
        return {
          task: `Pass the rectifying entries, one for each error, and then the entry for the depreciation on the amount in (${LETTERS[s.capital]}).`,
          transactions: [
            ...s.errors.map((e, i) => ({
              label: `(${LETTERS[i]})`,
              text: e.name,
              lines: e.lines,
              explanation: [...e.why, ...(e.gap === 0 ? ['Both sides of the original entry were posted, so Suspense A/c is not touched.'] : [])],
            })),
            {
              label: 'Depreciation',
              text: `Depreciation on the amount in (${LETTERS[s.capital]}) for the year.`,
              lines: [dr('depreciation', s.dep), cr('machinery', s.dep)],
              explanation: [
                `${inr(a.cost)} x ${s.rate}/100 x ${12 - a.k}/12 = ${inr(s.dep)}, for the ${monthsWord(12 - a.k)} from ${dayOf(a.k)}.`,
                'Depreciation is an expense: Depreciation A/c is debited. It is written off the asset: Machinery A/c is credited.',
              ],
            },
          ],
          hints: ['Take the errors one at a time: what was posted, and what should have been?', 'An error that upset the trial balance is put right through Suspense A/c; one that did not, without it.'],
          distractorAccounts: ['profitAndLoss', 'provisionForDepreciation'],
        };
      },
      verify: (q: JournalSetQuestion) => {
        const c = readSuspenseChain(q.context);
        if (!c.capital || !Number.isFinite(c.dep)) return false;
        const items = q.entries.map((e) => ({ e, read: c.errors.find((x) => `(${x.letter})` === e.label) }));
        const fits = items.every(({ e, read }) => {
          if (!read) return e.label === 'Depreciation' && profitOfLines(e.expected) === -c.dep;
          const sus = e.expected.filter((l) => l.accountId === 'suspense');
          const suspenseRight = read.gap === 0 ? sus.length === 0 : sus.length === 1 && sus[0].amount === Math.abs(read.gap) && sus[0].side === (read.gap > 0 ? 'Dr' : 'Cr');
          return suspenseRight && profitOfLines(e.expected) === read.fix;
        });
        return fits && items.length === c.errors.length + 1;
      },
    },
    {
      kind: 'account',
      make: (s): CaseAccountParts | null => {
        const entries: DatedEntry[] = s.errors.map((e, i) => ({ date: `(${LETTERS[i]})`, lines: e.lines }));
        const view = accountOf(entries, 'suspense', { date: YEAR_END, side: s.gap > 0 ? 'Cr' : 'Dr', amount: Math.abs(s.gap) });
        if (view.balance) return null;
        const row = (p: (typeof view.debit)[number]): FormatRowParts =>
          p.accountIds.length === 0 ? { date: p.date, label: DIFFERENCE, also: [BALANCE_BD], amount: p.amount } : { ref: p.date, label: p.label, amount: p.amount };
        const [debits, credits] = [view.debit.map(row), view.credit.map(row)];
        const used = new Set([...debits, ...credits].map((r) => r.label));
        const tempting = [...new Set(s.errors.flatMap((e) => e.lines.map((l) => l.accountId)).filter((id) => id !== 'suspense').map((id) => `${resolveAccount(id).name} A/c`))].filter((l) => !used.has(l)).slice(0, 4);
        const ones = s.errors.map((e, i) => [e, i] as const).filter(([e]) => e.gap !== 0);
        return {
          task: `Prepare the Suspense A/c of ${s.b.owner} and find the difference it was opened with; enter that difference as "${DIFFERENCE}".`,
          title: 'Suspense A/c',
          left: drSide(debits),
          right: crSide(credits),
          distractors: ['Suspense A/c', ...tempting, BALANCE_CD, 'Profit and Loss A/c'],
          explanation: [
            ...ones.map(([e, i]) => `(${LETTERS[i]}) Rectifying entry: ${e.lines.map((l) => `${resolveAccount(l.accountId).name} A/c ${l.side} ${inr(l.amount)}`).join('; ')}. Suspense A/c is ${e.gap > 0 ? 'debited' : 'credited'}: "${e.gap > 0 ? 'To' : 'By'} ${e.lines.find((l) => l.accountId !== 'suspense')!.accountId === 'suspense' ? '' : `${resolveAccount(e.lines.find((l) => l.accountId !== 'suspense')!.accountId).name} A/c`} ${inr(Math.abs(e.gap))}".`),
            ...s.errors.flatMap((e, i) => (e.gap === 0 ? [`(${LETTERS[i]}) The error left both sides in the books, so its rectifying entry does not touch Suspense A/c: no row.`] : [])),
            `Every error behind the difference has been found, so the account must close. The ${s.gap > 0 ? 'credit' : 'debit'} side is short by ${inr(Math.abs(s.gap))}: that is what the account opened with, "${s.gap > 0 ? 'By' : 'To'} ${DIFFERENCE} ${inr(Math.abs(s.gap))}".`,
            `So the ${s.gap > 0 ? 'credit' : 'debit'} total of the trial balance was ${inr(Math.abs(s.gap))} short. Both sides now total ${inr(view.total)}.`,
          ],
          hints: ['Enter the Suspense A/c side of each rectifying entry first.', 'The account closes, so the difference it opened with is what makes the two sides equal.'],
        };
      },
      verify: (q: AccountQuestion) => {
        const c = readSuspenseChain(q.context);
        const ones = c.errors.filter((e) => e.gap !== 0);
        if (ones.some((e) => !e.against) || !Number.isFinite(c.gap) || c.gap === 0) return false;
        const debit: Want[] = [...ones.filter((e) => e.gap > 0).map((e): Want => [e.against!, e.gap]), ...(c.gap < 0 ? [[DIFFERENCE, -c.gap] as Want] : [])];
        const credit: Want[] = [...ones.filter((e) => e.gap < 0).map((e): Want => [e.against!, -e.gap]), ...(c.gap > 0 ? [[DIFFERENCE, c.gap] as Want] : [])];
        return rowsAre(q.sides[0].rows, debit) && rowsAre(q.sides[1].rows, credit) && q.sides.every((side) => side.below.length === 0);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const two = s.errors.find((e) => e.gap === 0 && e !== s.errors[s.capital]);
        const signed = (x: number) => (x >= 0 ? `+ ${inr(x)}` : `- ${inr(-x)}`);
        const fixes = s.errors.map((e, i) => [i, e.fix] as const).filter(([, f]) => f !== 0);
        return num(
          `What is the correct net profit for the year ended ${YEAR_END}?`,
          s.corrected,
          [
            [s.corrected + s.dep, `Left out the depreciation on the amount in (${LETTERS[s.capital]}).`],
            [s.draft + sumOf(s.errors.filter((e) => e.gap !== 0).map((e) => e.fix)), 'Corrected the profit only for the errors that went through Suspense A/c.'],
            [two ? s.corrected - two.fix : null, `Left out error (${two ? LETTERS[s.errors.indexOf(two)] : ''}), which changes the profit although it did not upset the trial balance.`],
            [s.corrected - 2 * s.errors[s.capital].fix, `Deducted the amount in (${LETTERS[s.capital]}) instead of adding it back.`],
            [s.draft - s.gap, 'Took the difference in the trial balance as the correction of the profit.'],
          ],
          [
            `Draft net profit ${inr(s.draft)}.`,
            ...fixes.map(([i, f]) => `(${LETTERS[i]}) ${signed(f)}: ${s.errors[i].say}.`),
            ...s.errors.flatMap((e, i) => (e.gap !== 0 && e.fix === 0 ? [`(${LETTERS[i]}) no change: it is about an asset, not about an income or an expense.`] : [])),
            `Less: depreciation on the amount in (${LETTERS[s.capital]}) ${inr(s.dep)}.`,
            `Correct net profit = ${inr(s.draft)} ${fixes.map(([, f]) => signed(f)).join(' ')} - ${inr(s.dep)} = ${inr(s.corrected)}.`,
          ],
          H.corrected,
        );
      },
      verify: (q) => {
        const c = readSuspenseChain(q.context);
        return c.errors.every((e) => Number.isFinite(e.fix)) && q.answer === c.corrected;
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// C2. The proprietor's Capital A/c for the year (medium). Capital brought in, goods taken, interest on capital, the net
// profit and the drawings closed to capital: the student passes the entries (journal), prepares Capital A/c (ledger)
// and says what the goods taken did to the accounting equation. Version 2 leaves out the interest on drawings it
// charged until then: the Class 11 syllabus lists interest on capital among the adjustments, not interest on drawings.
// ---------------------------------------------------------------------------------------------------------------

interface CapitalChain {
  b: Biz;
  capital: number;
  more: number;
  kMore: number;
  drawn: number;
  goods: number;
  price: number;
  kGoods: number;
  rate: number;
  net: number;
  ioc: number;
  entries: (DatedEntry & { text: string; why: string[] })[];
}

function readCapitalChain(context: string | undefined) {
  const capital = amountsIn(lineOf(context, /Capital A\/c stood at/))[0];
  const moreLine = lineOf(context, /brought in a further/);
  const more = moreLine ? amountsIn(moreLine)[0] : 0;
  const drawn = amountsIn(lineOf(context, /^Drawings A\/c shows/))[0];
  const goods = amountsIn(lineOf(context, /took goods costing/))[0];
  const rates = lineOf(context, /^Interest on capital is allowed/);
  const rate = intIn(rates, /allowed at (\d+)% p\.a\./);
  const net = amountsIn(lineOf(context, /^The net profit/))[0];
  const ioc = (capital * rate) / 100 + (more * rate * (moreLine ? 12 - monthIn(moreLine) : 0)) / 1200;
  return { capital, more, drawn, goods, net, ioc, closing: capital + more + ioc + net - drawn - goods };
}

const chainCapital = caseTemplate<CapitalChain>({
  id: 'case-wy-chain-capital-account',
  version: 2,
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: "The proprietor's Capital A/c for the year",
  setup: (rng) =>
    attempt(30, () => {
      const b = business(rng, 22);
      const capital = amount(rng, 300000, 900000, 50000);
      const withMore = rng.next() < 0.6;
      const more = withMore ? amount(rng, 50000, 200000, 10000) : 0;
      const kMore = withMore ? rng.pick([2, 3, 4, 6, 7, 9]) : 0;
      const rate = rng.pick([5, 6, 8, 10]);
      const drawn = 12 * amount(rng, 3000, 8000, 500);
      const goods = amount(rng, 3000, 15000, 1000);
      const kGoods = rng.pick([1, 4, 5, 8, 10].filter((k) => k !== kMore));
      const price = pct(goods, rng.pick([120, 125, 150]));
      const ioc = pct(capital, rate) + (more * rate * (12 - kMore)) / 1200;
      const net = amount(rng, 120000, 400000, 1000);
      if (![ioc, price].every(clean)) return null;
      const end = YEAR_END;
      const entries = [
        ...(more ? [{ date: dayOf(kMore), lines: [dr('bank', more), cr('capital', more)], text: 'Further capital brought in by cheque.', why: ['The money goes into the bank: Bank A/c is debited.', 'It is more capital from the proprietor: Capital A/c is credited.'], k: kMore }] : []),
        {
          date: dayOf(kGoods),
          lines: [dr('drawings', goods), cr('purchases', goods)],
          text: 'Goods taken by the proprietor for personal use.',
          why: ['Goods taken for personal use are drawings: Drawings A/c is debited.', `They leave the goods bought for sale at cost, ${inr(goods)}, not at the selling price: Purchases A/c is credited.`],
          k: kGoods,
        },
      ]
        .sort((x, y) => x.k - y.k)
        .map((e) => ({ date: e.date, lines: e.lines, text: e.text, why: e.why }));
      entries.push(
        {
          date: end,
          lines: [dr('interestOnCapital', ioc), cr('capital', ioc)],
          text: 'Interest on capital for the year.',
          why: [
            more
              ? `On ${inr(capital)} for the year, ${inr(pct(capital, rate))}; on ${inr(more)} from ${dayOf(kMore)}, ${inr(more)} x ${rate}/100 x ${12 - kMore}/12 = ${inr((more * rate * (12 - kMore)) / 1200)}: in all ${inr(ioc)}.`
              : `${inr(capital)} x ${rate}/100 = ${inr(ioc)}.`,
            'It is an expense of the business: Interest on Capital A/c is debited; it is due to the proprietor: Capital A/c is credited.',
          ],
        },
        {
          date: end,
          lines: [dr('profitAndLoss', net), cr('capital', net)],
          text: 'Net profit transferred to Capital A/c.',
          why: ['The profit belongs to the proprietor: Profit and Loss A/c is debited and Capital A/c credited.'],
        },
        {
          date: end,
          lines: [dr('capital', drawn + goods), cr('drawings', drawn + goods)],
          text: 'Drawings A/c closed to Capital A/c.',
          why: [`Drawings = cash ${inr(drawn)} + goods ${inr(goods)} = ${inr(drawn + goods)}.`, 'Drawings reduce the capital: Capital A/c is debited and Drawings A/c credited, closing it.'],
        },
      );
      return { b, capital, more, kMore, drawn, goods, price, kGoods, rate, net, ioc, entries };
    }),
  context: (s) =>
    [
      `${s.b.owner} runs ${s.b.trade} in ${s.b.city}; the year ends on 31 March. Capital A/c stood at ${inr(s.capital)} on 1 April 2025.`,
      ...(s.more ? [`On ${dayOf(s.kMore)} the proprietor brought in a further ${inr(s.more)} by cheque.`] : []),
      `Drawings A/c shows ${inr(s.drawn)} of cash drawn evenly during the year (${inr(s.drawn / 12)} a month).`,
      `On ${dayOf(s.kGoods)} the proprietor took goods costing ${inr(s.goods)} (selling price ${inr(s.price)}) for personal use; no entry has been made.`,
      `Interest on capital is allowed at ${s.rate}% p.a.`,
      `The net profit, after the interest on capital, is ${inr(s.net)}. At the year end it is transferred to Capital A/c, and Drawings A/c is closed to Capital A/c.`,
    ].join('\n'),
  parts: [
    {
      kind: 'journal_set',
      make: (s): CaseSetParts => ({
        task: 'Pass the journal entries for the year that touch the capital or the drawings, ending with the closing of Drawings A/c.',
        transactions: s.entries.map((e) => ({ date: e.date, text: e.text, lines: e.lines, explanation: e.why })),
        hints: ['Interest on capital is credited to Capital A/c; goods taken are debited to Drawings A/c.', 'At the year end the net profit and the drawings are both closed to Capital A/c.'],
        distractorAccounts: ['sales', 'interestReceived', 'cash'],
      }),
      verify: (q: JournalSetQuestion) => {
        const c = readCapitalChain(q.context);
        const want: JournalLine[][] = [
          ...(c.more ? [[dr('bank', c.more), cr('capital', c.more)]] : []),
          [dr('drawings', c.goods), cr('purchases', c.goods)],
          [dr('interestOnCapital', c.ioc), cr('capital', c.ioc)],
          [dr('profitAndLoss', c.net), cr('capital', c.net)],
          [dr('capital', c.drawn + c.goods), cr('drawings', c.drawn + c.goods)],
        ];
        const key = (ls: readonly JournalLine[]) => ls.map((l) => `${l.side} ${l.accountId} ${l.amount}`).sort().join(';');
        const have = q.entries.map((e) => key(e.expected)).sort();
        const need = want.map(key).sort();
        return have.length === need.length && have.every((k, i) => k === need[i]);
      },
    },
    {
      kind: 'account',
      make: (s): CaseAccountParts => {
        const view = accountOf(s.entries, 'capital', { date: '1 April 2025', side: 'Cr', amount: s.capital });
        return {
          task: `Prepare Capital A/c of ${s.b.owner} for the year ended ${YEAR_END}, balance it and bring the balance down on 1 April 2026.`,
          title: 'Capital A/c',
          ...ledgerSides(view, { closeOn: YEAR_END, reopenOn: '1 April 2026' }),
          distractors: ['Capital A/c', 'Purchases A/c', 'Sales A/c', 'Cash A/c', 'Balance c/d'],
          explanation: [
            `The account opens with the capital, a credit balance: "By Balance b/d ${inr(s.capital)}".`,
            ...(s.more ? [`The further capital is credited: "By Bank A/c ${inr(s.more)}".`] : []),
            `Interest on capital and the net profit are credited: "By Interest on Capital A/c ${inr(s.ioc)}", "By Profit and Loss A/c ${inr(s.net)}".`,
            `Drawings, closed at the year end, are debited at their total: cash ${inr(s.drawn)} + goods ${inr(s.goods)} = ${inr(s.drawn + s.goods)}, "To Drawings A/c". Goods taken reach the capital only through Drawings A/c.`,
            `The credit side is larger by ${inr(view.balance!.amount)}: "To Balance c/d", brought down on 1 April 2026.`,
          ],
          hints: ['What increases the capital goes on the credit side; drawings go on the debit side.', 'Drawings A/c brings its whole total, goods included, in one row.'],
        };
      },
      verify: (q: AccountQuestion) => {
        const c = readCapitalChain(q.context);
        const credit: Want[] = [[BALANCE_BD, c.capital], ...(c.more ? [['Bank A/c', c.more] as Want] : []), ['Interest on Capital A/c', c.ioc], ['Profit and Loss A/c', c.net]];
        const debit: Want[] = [['Drawings A/c', c.drawn + c.goods], [BALANCE_CD, c.closing]];
        return rowsAre(q.sides[0].rows, debit, BALANCE_CD) && rowsAre(q.sides[1].rows, credit) && rowsAre(q.sides[1].below, [[BALANCE_BD, c.closing]]);
      },
    },
    {
      kind: 'mcq',
      make: (s) =>
        choice(
          'What did the goods taken by the proprietor do to the accounting equation of the business?',
          `Assets and capital both fell by ${inr(s.goods)}`,
          [
            [`Assets and capital both fell by ${inr(s.price)}`, 'Took the goods at their selling price. They leave the business at cost.'],
            [`Assets fell and liabilities rose by ${inr(s.goods)}`, 'The proprietor owes nothing for the goods as a creditor would: taking them reduces the capital.'],
            ['Nothing changed, as no money was paid', 'Goods are assets: taking them out reduces what the business owns, and the capital with it.'],
            [`Assets rose and capital fell by ${inr(s.goods)}`, 'Nothing came into the business: its goods went out.'],
          ],
          `Goods worth ${inr(s.goods)} at cost left the business (assets fall), and they are drawings, which reduce the proprietor's capital (capital falls).`,
          ['Did the business gain or lose an asset?', 'Drawings of any kind reduce the capital.'],
        ),
      verify: (q) => picked(q) === `Assets and capital both fell by ${inr(readCapitalChain(q.context).goods)}`,
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// C3. A machine sold: the entries, Machinery A/c and the charge to profit (complex). The machines of short case 3,
// told for one year: the student journalises the year's machinery entries (the sale in two steps, as the depreciation
// topic records it in its account), prepares Machinery A/c for the year (ledger) and finds what the machinery costs
// the profit of the year (final accounts).
// ---------------------------------------------------------------------------------------------------------------

const TWO_STEP_SALE = 'A sale is recorded in two steps: the whole price is first credited to Machinery A/c, and the profit or loss is then transferred from it to Profit on Sale of Asset A/c or Loss on Sale of Asset A/c.';

interface SaleChain extends SoldYear {
  entries: (DatedEntry & { text: string; why: string[] })[];
}

const chainMachineSale = caseTemplate<SaleChain>({
  id: 'case-wy-chain-machine-sold',
  topicId: T,
  conceptId: C,
  difficulty: 'complex',
  title: 'A machine sold: the entries, Machinery A/c and the charge to profit',
  setup: (rng) => {
    rng.int(0, 9); // a draw first, so that a seed does not tell the story of short case 3 again with the same figures
    return attempt(30, () => {
      const b = business(rng, 23);
      const method = rng.pick<Method>(['slm', 'wdv']);
      const rate = rng.pick([10, 15, 20]);
      const fromA = ON.y2023 + rng.pick([0, 3, 6, 9]);
      const fromB = ON.y2024 + rng.pick([0, 3, 6, 9]);
      const saleAt = ON.y2025 + rng.pick([3, 4, 6, 7, 9]);
      const withC = rng.next() < 0.7;
      const fromC = withC ? ON.y2025 + rng.pick([2, 3, 6, 8, 9].filter((k) => ON.y2025 + k !== saleAt)) : ON.end;
      const costA = amount(rng, 160000, 400000, 20000);
      const costB = amount(rng, 160000, 400000, 20000);
      const costC = withC ? amount(rng, 100000, 300000, 20000) : 0;
      if (costA === costB || costB === costC) return null;
      const a = depreciate(costA, method, rate, fromA, saleAt);
      const bb = depreciate(costB, method, rate, fromB, ON.end);
      const c = withC ? depreciate(costC, method, rate, fromC, ON.end) : { charges: [0], value: 0 };
      const aOpen = depreciate(costA, method, rate, fromA, ON.y2025);
      const bOpen = depreciate(costB, method, rate, fromB, ON.y2025);
      if (!a || !bb || !c || !aOpen || !bOpen) return null;
      const depA = a.charges[a.charges.length - 1];
      const depB = bb.charges[bb.charges.length - 1];
      const depC = c.charges[c.charges.length - 1];
      const away = rng.step(4000, 30000, 1000) * 100;
      const sold = Math.round((a.value + (rng.next() < 0.5 ? away : -away)) / R(1000)) * R(1000);
      const result = sold - a.value;
      // The two depreciation rows of the year must differ, and the price must not repeat another figure of the account.
      if (sold <= 0 || Math.abs(result) < R(2000) || depA === depB + depC || [costC, depA, depB + depC, Math.abs(result)].includes(sold)) return null;
      const totalDep = depA + depB + depC;
      const saleDay = dayAt(saleAt);
      const gain = result > 0;
      const entries: (DatedEntry & { text: string; why: string[]; at: number })[] = [
        ...(withC
          ? [{ at: fromC, date: dayAt(fromC), lines: [dr('machinery', costC), cr('bank', costC)], text: 'Bought machine C by cheque.', why: ['A machine bought for use is a fixed asset: Machinery A/c is debited at its cost.', 'The cheque is paid from the bank: Bank A/c is credited.'] }]
          : []),
        {
          at: saleAt,
          date: saleDay,
          lines: [dr('depreciation', depA), cr('machinery', depA)],
          text: 'Depreciation on machine A up to the date of sale.',
          why: [`Machine A from 1 April 2025 to ${saleDay}, ${monthsWord(saleAt - ON.y2025)}: ${inr(depA)}.`, 'Depreciation is an expense: Depreciation A/c is debited. It is written off the asset: Machinery A/c is credited.'],
        },
        {
          at: saleAt + 0.1,
          date: saleDay,
          lines: [dr('bank', sold), cr('machinery', sold)],
          text: 'Received the price of machine A by cheque.',
          why: ['The money goes into the bank: Bank A/c is debited.', 'The first step of the sale: the whole price is credited to Machinery A/c.'],
        },
        {
          at: saleAt + 0.2,
          date: saleDay,
          lines: gain ? [dr('machinery', result), cr('profitOnSaleOfAsset', result)] : [dr('lossOnSaleOfAsset', -result), cr('machinery', -result)],
          text: 'Transferred the profit or loss on the sale of machine A.',
          why: gain
            ? [`Book value on the date of sale ${inr(a.value)}; price ${inr(sold)}: a profit of ${inr(result)}.`, 'The profit is taken out of Machinery A/c by a debit and credited to Profit on Sale of Asset A/c.']
            : [`Book value on the date of sale ${inr(a.value)}; price ${inr(sold)}: a loss of ${inr(-result)}.`, 'The loss is debited to Loss on Sale of Asset A/c and credited to Machinery A/c, which then holds nothing of machine A.'],
        },
        {
          at: ON.end,
          date: YEAR_END,
          lines: [dr('depreciation', depB + depC), cr('machinery', depB + depC)],
          text: `Depreciation for the year on machine B${withC ? ' and machine C' : ''}.`,
          why: [`Machine B, the whole year: ${inr(depB)}.${withC ? ` Machine C, ${monthsWord(ON.end - fromC)} from ${dayAt(fromC)}: ${inr(depC)}. In all ${inr(depB + depC)}.` : ''}`, 'Depreciation A/c is debited; Machinery A/c is credited.'],
        },
      ];
      entries.sort((x, y) => x.at - y.at);
      return {
        b, method, rate, costA, fromA, costB, fromB, saleAt, sold, costC, fromC, draft: 0,
        openA: aOpen.value, openB: bOpen.value, depA, bvSale: a.value, depB, depC, closeB: bb.value, closeC: c.value, result, totalDep, net: 0,
        entries: entries.map((e) => ({ date: e.date, lines: e.lines, text: e.text, why: e.why })),
      };
    });
  },
  context: (s) =>
    [
      `${s.b.owner} runs ${s.b.trade} in ${s.b.city}; the year ends on 31 March. Machinery is depreciated at ${s.rate}% p.a. ${METHOD_WORDS[s.method]}, for the months of use, and written off Machinery A/c; no provision account is kept.`,
      `On 1 April 2025 Machinery A/c showed ${inr(s.openA + s.openB)}: machine A, bought on ${dayAt(s.fromA)} for ${inr(s.costA)}, and machine B, bought on ${dayAt(s.fromB)} for ${inr(s.costB)}.`,
      ...[
        [s.saleAt, `${dayAt(s.saleAt)}: Machine A was sold for ${inr(s.sold)} by cheque.`] as const,
        ...(s.costC ? [[s.fromC, `${dayAt(s.fromC)}: Machine C was bought for ${inr(s.costC)} by cheque.`] as const] : []),
      ]
        .sort((x, y) => x[0] - y[0])
        .map(([, line]) => line),
      `The depreciation on machine A up to the date of sale is recorded first. ${TWO_STEP_SALE}${s.costC ? '' : ' No other machine was bought.'}`,
    ].join('\n'),
  parts: [
    {
      kind: 'journal_set',
      make: (s): CaseSetParts => ({
        task: `Journalise the machinery transactions of the year ended ${YEAR_END}, the depreciation included.`,
        transactions: s.entries.map((e) => ({ date: e.date, text: e.text, lines: e.lines, explanation: e.why })),
        hints: ['Record the depreciation on machine A up to the date of sale before the sale itself.', TWO_STEP_SALE],
        distractorAccounts: ['assetDisposal', 'provisionForDepreciation', s.result > 0 ? 'lossOnSaleOfAsset' : 'profitOnSaleOfAsset', 'profitAndLoss'],
      }),
      verify: (q: JournalSetQuestion) => {
        const c = readSoldYear(q.context);
        const v = (cost: number, from: number, to: number) => valueByFormula(cost, c.method, c.rate, from, to);
        const bv = v(c.costA, c.fromA, c.saleAt);
        const depA = v(c.costA, c.fromA, ON.y2025) - bv;
        const yearEnd = v(c.costB, c.fromB, ON.y2025) - v(c.costB, c.fromB, ON.end) + (c.costC ? c.costC - v(c.costC, c.fromC, ON.end) : 0);
        const gap = c.sold - bv;
        const want: [string, string, number][] = [
          ...(c.costC ? [['machinery', 'bank', c.costC] as [string, string, number]] : []),
          ['depreciation', 'machinery', depA],
          ['bank', 'machinery', c.sold],
          gap > 0 ? ['machinery', 'profitOnSaleOfAsset', gap] : ['lossOnSaleOfAsset', 'machinery', -gap],
          ['depreciation', 'machinery', yearEnd],
        ];
        return (
          q.entries.length === want.length &&
          want.every(([d, k, x]) => q.entries.some((e) => e.expected.length === 2 && e.expected.some((l) => l.side === 'Dr' && l.accountId === d && near(l.amount, x)) && e.expected.some((l) => l.side === 'Cr' && l.accountId === k && near(l.amount, x))))
        );
      },
    },
    {
      kind: 'account',
      make: (s): CaseAccountParts => {
        const view = accountOf(s.entries, 'machinery', { date: '1 April 2025', side: 'Dr', amount: s.openA + s.openB });
        const sides = ledgerSides(view, { closeOn: YEAR_END, reopenOn: '1 April 2026' });
        // The depreciation of the year end is on two machines: the solution shows what the figure is made of.
        const withDetails = (rows: FormatRowParts[]) => rows.map((r) => (s.costC && r.date === YEAR_END && r.label === 'Depreciation A/c' ? { ...r, details: [`Machine B ${inr(s.depB)}`, `Machine C ${inr(s.depC)}`] } : r));
        return {
          task: `Prepare Machinery A/c for the year ended ${YEAR_END}, balance it and bring the balance down on 1 April 2026. Enter each depreciation entry as a row of its own.`,
          title: 'Machinery A/c',
          ...sides,
          right: { ...sides.right, rows: withDetails(sides.right.rows) },
          distractors: ['Machinery A/c', 'Asset Disposal A/c', 'Provision for Depreciation A/c', s.result > 0 ? 'Loss on Sale of Asset A/c' : 'Profit on Sale of Asset A/c', 'Profit and Loss A/c'],
          explanation: [
            `The account opens with the book value of the two machines: "To Balance b/d ${inr(s.openA + s.openB)}" (${inr(s.openA)} + ${inr(s.openB)}).`,
            ...(s.costC ? [`Machine C is debited at its cost: "To Bank A/c ${inr(s.costC)}".`] : []),
            `On ${dayAt(s.saleAt)}: "By Depreciation A/c ${inr(s.depA)}" on machine A, then the price, "By Bank A/c ${inr(s.sold)}", and the ${s.result > 0 ? `profit, "To Profit on Sale of Asset A/c ${inr(s.result)}"` : `loss, "By Loss on Sale of Asset A/c ${inr(-s.result)}"`}. Together they take machine A's book value, ${inr(s.bvSale)}, out of the account.`,
            `On ${YEAR_END}: "By Depreciation A/c ${inr(s.depB + s.depC)}" on what is left.`,
            `The balance, ${inr(s.closeB + s.closeC)}, is the book value of machine B${s.costC ? ' and machine C' : ''}: "By Balance c/d", brought down on 1 April 2026.`,
          ],
          hints: ['Every machinery entry of the journal has its row here.', 'After the sale nothing of machine A may be left in the account.'],
        };
      },
      verify: (q: AccountQuestion) => {
        const c = readSoldYear(q.context);
        const v = (cost: number, from: number, to: number) => valueByFormula(cost, c.method, c.rate, from, to);
        const open = v(c.costA, c.fromA, ON.y2025) + v(c.costB, c.fromB, ON.y2025);
        const bv = v(c.costA, c.fromA, c.saleAt);
        const close = v(c.costB, c.fromB, ON.end) + (c.costC ? v(c.costC, c.fromC, ON.end) : 0);
        const gap = c.sold - bv;
        const debit: Want[] = ([[BALANCE_BD, open], ...(c.costC ? [['Bank A/c', c.costC] as Want] : []), ...(gap > 0 ? [['Profit on Sale of Asset A/c', gap] as Want] : [])] as Want[]).map(([l, x]): Want => [l, Math.round(x)]);
        const credit: Want[] = [
          ['Depreciation A/c', v(c.costA, c.fromA, ON.y2025) - bv],
          ['Bank A/c', c.sold],
          ...(gap < 0 ? [['Loss on Sale of Asset A/c', -gap] as Want] : []),
          ['Depreciation A/c', v(c.costB, c.fromB, ON.y2025) - v(c.costB, c.fromB, ON.end) + (c.costC ? c.costC - v(c.costC, c.fromC, ON.end) : 0)],
          [BALANCE_CD, close],
        ].map(([l, x]) => [l as string, Math.round(x as number)]);
        return rowsAre(q.sides[0].rows, debit) && rowsAre(q.sides[1].rows, credit, BALANCE_CD) && rowsAre(q.sides[0].below, [[BALANCE_BD, Math.round(close)]]);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          `By how much do the depreciation and the ${s.result > 0 ? 'profit' : 'loss'} on the sale of machine A, taken together, reduce the profit of the year?`,
          s.totalDep - s.result,
          [
            [s.totalDep, `Left out the ${s.result > 0 ? 'profit' : 'loss'} on the sale.`],
            [s.totalDep + s.result, s.result > 0 ? 'Deducted the profit on the sale instead of setting it against the depreciation.' : 'Set the loss on the sale against the depreciation instead of adding it.'],
            [s.totalDep - s.depA - s.result, 'Left out the depreciation on machine A up to the date of sale.'],
            [s.costA - s.sold + s.depB + s.depC, 'Treated machine A as if it had never been depreciated: charged its cost less the price as a loss, and no depreciation on it.'],
          ],
          [
            `Depreciation of the year = ${added([s.depA, s.depB + s.depC])}.`,
            s.result > 0 ? `Less: profit on the sale, a gain, ${inr(s.result)}.` : `Add: loss on the sale ${inr(-s.result)}.`,
            `Reduction in profit = ${inr(s.totalDep)} ${s.result > 0 ? '-' : '+'} ${inr(Math.abs(s.result))} = ${inr(s.totalDep - s.result)}.`,
          ],
          ['Depreciation and a loss on sale are charges; a profit on sale is a gain.', 'Both Depreciation A/c and the account of the profit or loss are closed to the Profit and Loss Account.'],
        ),
      verify: (q) => {
        const c = readSoldYear(q.context);
        const v = (cost: number, from: number, to: number) => valueByFormula(cost, c.method, c.rate, from, to);
        const bv = v(c.costA, c.fromA, c.saleAt);
        const dep = v(c.costA, c.fromA, ON.y2025) - bv + v(c.costB, c.fromB, ON.y2025) - v(c.costB, c.fromB, ON.end) + (c.costC ? c.costC - v(c.costC, c.fromC, ON.end) : 0);
        return near(q.answer, dep - (c.sold - bv));
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// C4. Bad debts and the provision for doubtful debts over two years (medium). The second year journalised (bad debts
// written off, a debt recovered, the bad debts set off against the provision and the provision brought to the amount
// needed), then Provision for Doubtful Debts A/c for the two years (ledger, the format of the provisions topic), then
// the debtors of the balance sheet (final accounts).
// ---------------------------------------------------------------------------------------------------------------

interface DebtsChain {
  b: Biz;
  p0: number;
  bad1: number;
  d1: number;
  r1: number;
  /** The debts of the second year, in date order: who, how much, and the day. */
  debts: { name: string; x: number; day: string }[];
  recovered: { name: string; x: number; day: string };
  d2: number;
  r2: number;
  p1: number;
  p2: number;
  charge1: number;
  charge2: number;
  entries: (DatedEntry & { text: string; why: string[] })[];
  year1: DatedEntry[];
}

/** A day of the year 2025-26 that is not the first of the month, for an event of a set: "14 September 2025". */
const dayIn = (k: number, d: number): string => `${d} ${MONTHS[k]} ${k >= 9 ? 2026 : 2025}`;

function readDebtsChain(context: string | undefined) {
  const p0 = amountsIn(lineOf(context, /stood at/))[0];
  const y1 = lineOf(context, 'Year ended 31 March 2025:');
  const [bad1, d1] = amountsIn(y1);
  const r1 = intIn(y1, /to be (\d+)% of the debtors/);
  const lines = (context ?? '').split('\n');
  const bad2 = sumOf(lines.filter((l) => /was declared insolvent; nothing could be recovered\.$/.test(l)).map((l) => amountsIn(l)[0]));
  const recovered = amountsIn(lines.find((l) => /whose debt had been written off as bad/.test(l)) ?? '')[0];
  const end = lineOf(context, '31 March 2026:');
  const d2 = amountsIn(end)[0];
  const r2 = intIn(end, /to be (\d+)% of the debtors/);
  const p1 = (d1 * r1) / 100;
  const p2 = (d2 * r2) / 100;
  return { p0, bad1, p1, bad2, recovered, p2, d2, charge1: bad1 + p1 - p0, charge2: bad2 + p2 - p1 };
}

const PDD = 'provisionForDoubtfulDebts';

const chainDoubtful = caseTemplate<DebtsChain>({
  id: 'case-wy-chain-doubtful-debts',
  topicId: T,
  conceptId: C,
  difficulty: 'complex',
  title: 'Bad debts and the provision over two years: entries and the account',
  setup: (rng) =>
    attempt(30, () => {
      rng.int(0, 99); // a draw first, so that a seed does not repeat the figures of short case 11
      const b = business(rng, 24);
      const r1 = rng.pick([4, 5, 10]);
      const r2 = rng.next() < 0.6 ? r1 : rng.pick([2, 4, 5, 10].filter((r) => r !== r1));
      const d0 = amount(rng, 200000, 600000, 20000);
      const p0 = pct(d0, r1);
      const d1 = Math.max(R(120000), d0 + R(20000) * rng.int(-5, 6));
      const d2 = Math.max(R(120000), d1 + R(20000) * rng.int(-8, 6));
      const p1 = pct(d1, r1);
      const p2 = pct(d2, r2);
      const bad1 = amount(rng, 2000, Math.max(3000, Math.floor(((p0 / 100) * 3) / 4 / 1000) * 1000), 500);
      const names = rng.shuffle(peopleOf(b));
      const two = rng.next() < 0.4;
      const most = Math.max(3000, Math.floor(((p1 / 100) * 3) / 4 / (two ? 2 : 1) / 1000) * 1000);
      const months = rng.shuffle([3, 4, 5, 6, 7, 8, 9, 10]).slice(0, two ? 3 : 2).sort((x, y) => x - y);
      const debtDays = months.map((k) => dayIn(k, rng.int(5, 25)));
      const recoveredAt = rng.int(0, debtDays.length - 1);
      const recovered = { name: names[two ? 2 : 1], x: amount(rng, 1000, 8000, 500), day: debtDays[recoveredAt] };
      const debtDayList = debtDays.filter((_, i) => i !== recoveredAt);
      const debts = debtDayList.map((day, i) => ({ name: names[i], x: amount(rng, 2000, most, 500), day }));
      const bad2 = sumOf(debts.map((d) => d.x));
      const charge1 = bad1 + p1 - p0;
      const charge2 = bad2 + p2 - p1;
      const figures = [bad1, ...debts.map((d) => d.x), recovered.x, Math.abs(charge2), bad2];
      if (bad1 >= p0 || bad2 >= p1 || charge1 <= 0 || charge2 === 0 || ![p0, p1, p2].every(clean) || new Set(figures).size !== figures.length) return null;
      const dated = [
        ...debts.map((d) => ({
          date: d.day,
          lines: [dr('badDebts', d.x), cr(`debtor:${d.name}`, d.x)],
          text: `${d.name} declared insolvent; the debt written off.`,
          why: ['The debt cannot be recovered, a loss: Bad Debts A/c is debited.', `Nothing more can be collected from ${d.name}: ${d.name}'s account is credited.`],
        })),
        {
          date: recovered.day,
          lines: [dr('bank', recovered.x), cr('badDebtsRecovered', recovered.x)],
          text: `Cheque received from ${recovered.name} for a debt written off earlier.`,
          why: ['The cheque is paid into the bank: Bank A/c is debited.', `The debt was written off long ago, so ${recovered.name} has no account: the money is a gain, credited to Bad Debts Recovered A/c.`],
        },
      ].sort((x, y) => monthIn(`1 ${x.date.split(' ').slice(1).join(' ')}`) - monthIn(`1 ${y.date.split(' ').slice(1).join(' ')}`));
      const entries = [
        ...dated,
        {
          date: YEAR_END,
          lines: [dr(PDD, bad2), cr('badDebts', bad2)],
          text: 'Bad debts of the year set off against the provision.',
          why: [`Bad debts of the year = ${added(debts.map((d) => d.x))}.`, 'They are met out of the provision: Provision for Doubtful Debts A/c is debited and Bad Debts A/c credited.'],
        },
        {
          date: YEAR_END,
          lines: charge2 > 0 ? [dr('profitAndLoss', charge2), cr(PDD, charge2)] : [dr(PDD, -charge2), cr('profitAndLoss', -charge2)],
          text: 'Provision brought to the amount needed.',
          why: [
            `The provision is left with ${inr(p1)} - ${inr(bad2)} = ${inr(p1 - bad2)}; needed: ${inr(d2)} x ${r2}/100 = ${inr(p2)}.`,
            charge2 > 0 ? `It is short by ${inr(charge2)}: Profit and Loss A/c is debited and the provision credited.` : `It holds ${inr(-charge2)} too much: the provision is debited and the excess written back to Profit and Loss A/c.`,
          ],
        },
      ];
      const year1: DatedEntry[] = [
        { date: '31 March 2025', lines: [dr(PDD, bad1), cr('badDebts', bad1)] },
        { date: '31 March 2025', lines: [dr('profitAndLoss', charge1), cr(PDD, charge1)] },
      ];
      return { b, p0, bad1, d1, r1, debts, recovered, d2, r2, p1, p2, charge1, charge2, entries, year1 };
    }),
  context: (s) =>
    [
      `${s.b.owner} runs ${s.b.trade} in ${s.b.city} and sells on credit; the books close on 31 March. ${PROVISION_RULE} Money is received by cheque.`,
      `On 1 April 2024 Provision for Doubtful Debts A/c stood at ${inr(s.p0)}.`,
      `Year ended 31 March 2025: bad debts of ${inr(s.bad1)} were written off. Debtors on 31 March 2025, after them, were ${inr(s.d1)}; the provision is to be ${s.r1}% of the debtors.`,
      ...[
        ...s.debts.map((d) => [d.day, `${d.day}: ${d.name}, a customer who owed ${inr(d.x)}, was declared insolvent; nothing could be recovered.`] as const),
        [s.recovered.day, `${s.recovered.day}: A cheque for ${inr(s.recovered.x)} was received from ${s.recovered.name}, whose debt had been written off as bad in 2022.`] as const,
      ]
        .sort((x, y) => monthIn(`1 ${x[0].split(' ').slice(1).join(' ')}`) - monthIn(`1 ${y[0].split(' ').slice(1).join(' ')}`))
        .map(([, line]) => line),
      `31 March 2026: debtors, after the bad debts of the year, were ${inr(s.d2)}; the provision is to be ${s.r2}% of the debtors.`,
    ].join('\n'),
  parts: [
    {
      kind: 'journal_set',
      make: (s): CaseSetParts => ({
        task: `Journalise the transactions of the year ended ${YEAR_END} about the debtors, and the year-end entries for the bad debts and the provision.`,
        transactions: s.entries.map((e) => ({ date: e.date, text: e.text, lines: e.lines, explanation: e.why })),
        hints: ['A bad debt is written off to Bad Debts A/c; a debt recovered after it was written off is an income.', 'At the year end the bad debts go to the provision, and the provision is then brought to the amount needed through Profit and Loss A/c.'],
        distractorAccounts: ['provisionForDoubtfulDebts', 'sales', 'cash'],
      }),
      verify: (q: JournalSetQuestion) => {
        const c = readDebtsChain(q.context);
        const has = (d: string, k: string, x: number) => q.entries.some((e) => e.expected.length === 2 && e.expected.some((l) => l.side === 'Dr' && l.accountId === d && l.amount === x) && e.expected.some((l) => l.side === 'Cr' && l.accountId === k && l.amount === x));
        const written = q.entries.filter((e) => e.expected.some((l) => l.accountId === 'badDebts' && l.side === 'Dr'));
        return (
          sumOf(written.map((e) => e.expected[0].amount)) === c.bad2 &&
          has('bank', 'badDebtsRecovered', c.recovered) &&
          has(PDD, 'badDebts', c.bad2) &&
          (c.charge2 > 0 ? has('profitAndLoss', PDD, c.charge2) : has(PDD, 'profitAndLoss', -c.charge2))
        );
      },
    },
    {
      kind: 'account',
      make: (s): CaseAccountParts => {
        const yearEnd = s.entries.filter((e) => e.date === YEAR_END);
        const periods = ledgerPeriods(
          [...s.year1, ...yearEnd],
          PDD,
          [
            { closeOn: '31 March 2025', reopenOn: '1 April 2025', title: 'Year ended 31 March 2025' },
            { closeOn: YEAR_END, reopenOn: '1 April 2026', title: `Year ended ${YEAR_END}` },
          ],
          { date: '1 April 2024', side: 'Cr', amount: s.p0 },
        );
        const year = (end: string, held: number, lost: number, needed: number, charge: number) =>
          `${end}: the bad debts of the year, ${inr(lost)}, are set off: "To Bad Debts A/c ${inr(lost)}", leaving ${inr(held - lost)}. Needed: ${inr(needed)}. ${
            charge > 0 ? `The account is short by ${inr(charge)}: "By Profit and Loss A/c ${inr(charge)}".` : `It holds ${inr(-charge)} too much, written back: "To Profit and Loss A/c ${inr(-charge)}".`
          } The provision needed is the balance carried down, ${inr(needed)}.`;
        return {
          task: `Prepare Provision for Doubtful Debts A/c for the two years ended ${YEAR_END}. Balance it on each 31 March and bring the balance down on each 1 April; enter the bad debts set off at a year end as one figure.`,
          title: 'Provision for Doubtful Debts A/c',
          ...periods,
          distractors: ['Provision for Doubtful Debts A/c', 'Bad Debts Recovered A/c', 'Bank A/c', `${s.debts[0].name} A/c`, 'Sales A/c'],
          explanation: [
            `The account opens with the provision held: "By Balance b/d ${inr(s.p0)}".`,
            year('31 March 2025', s.p0, s.bad1, s.p1, s.charge1),
            year(YEAR_END, s.p1, sumOf(s.debts.map((d) => d.x)), s.p2, s.charge2),
            `The cheque from ${s.recovered.name} went to Bad Debts Recovered A/c: it does not touch the provision.`,
          ],
          hints: ['Take one year at a time: the provision held, the bad debts set off, the provision needed.', 'The difference between what is left and what is needed goes to Profit and Loss A/c.'],
        };
      },
      verify: (q: AccountQuestion) => {
        const c = readDebtsChain(q.context);
        if (q.later?.length !== 1) return false;
        const pl = 'Profit and Loss A/c';
        const yearOne = rowsAre(q.sides[0].rows, [['Bad Debts A/c', c.bad1], [BALANCE_CD, c.p1]], BALANCE_CD) && rowsAre(q.sides[1].rows, [[BALANCE_BD, c.p0], [pl, c.charge1]]);
        const [debit, credit] = q.later[0];
        const yearTwo =
          rowsAre(debit, [['Bad Debts A/c', c.bad2], ...(c.charge2 < 0 ? [[pl, -c.charge2] as Want] : []), [BALANCE_CD, c.p2]], BALANCE_CD) &&
          rowsAre(credit, [[BALANCE_BD, c.p1], ...(c.charge2 > 0 ? [[pl, c.charge2] as Want] : [])]);
        return yearOne && yearTwo && rowsAre(q.sides[1].below, [[BALANCE_BD, c.p2]]);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        num(
          `At what figure are the debtors shown in the balance sheet on ${YEAR_END}?`,
          s.d2 - s.p2,
          [
            [s.d2, 'Showed the debtors without deducting the provision.'],
            [s.d2 - s.p1, 'Deducted last year\'s provision.'],
            [s.d2 - s.p2 - sumOf(s.debts.map((d) => d.x)), 'Deducted the bad debts again. The debtors given are after them.'],
            [s.d2 - s.p2 + s.recovered.x, 'Added the amount recovered to the debtors. It was received by cheque and is owed by no one.'],
          ],
          [`Provision needed = ${inr(s.d2)} x ${s.r2}/100 = ${inr(s.p2)}.`, `Debtors are shown at ${inr(s.d2)} - ${inr(s.p2)} = ${inr(s.d2 - s.p2)}.`],
          ['The provision is shown as a deduction from the debtors.', 'Use the provision needed at this year end.'],
        ),
      verify: (q) => {
        const c = readDebtsChain(q.context);
        return q.answer === c.d2 - c.p2;
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// C5. The bank at the year end: amended cash book, reconciliation and profit (medium). The items of short case 4: the
// student brings the bank column of the cash book up to date (cash book), reconciles the amended balance with the pass
// book (bank reconciliation, in the format of that topic) and finds the profit after the items (final accounts).
// ---------------------------------------------------------------------------------------------------------------

const chainBank = caseTemplate<BankYear>({
  id: 'case-wy-chain-amended-cash-book',
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: 'The amended cash book, the reconciliation and the profit',
  setup: (rng) => {
    rng.int(0, 99); // a draw first, so that a seed does not repeat the figures of short case 4
    return attempt(20, () => {
      const b = business(rng, 25);
      const names = rng.shuffle(peopleOf(b));
      const kinds = rng.shuffle(['charges', 'interest', 'telephone', 'dishonour', 'direct'] as const).slice(0, 3);
      const items = rng.shuffle([...TIMING_ITEMS.map((make) => make(rng)), ...kinds.map((k, i) => PASS_BOOK_ITEMS[k](rng, names[i]))]);
      const all = items.map((i) => amountsIn(i.text)[0]);
      if (new Set(all).size !== all.length || !items.some((i) => i.profit !== 0)) return null;
      const book = amount(rng, 40000, 200000, 500);
      const draft = amount(rng, 150000, 450000, 1000);
      const amended = book + sumOf(items.map((i) => i.cb));
      const passBook = amended + sumOf(items.map((i) => i.pb));
      const profit = draft + sumOf(items.map((i) => i.profit));
      if (amended < R(10000) || passBook < R(10000) || amended === book) return null;
      return { b, book, draft, items, asked: -1, amended, passBook, profit };
    });
  },
  context: (s) =>
    [
      `${s.b.owner} runs ${s.b.trade} in ${s.b.city}. On ${YEAR_END}, the year end, the bank column of the cash book shows a debit balance of ${inr(s.book)}, which does not agree with the pass book. On comparing the two:`,
      ...s.items.map((it, i) => `(${ROMAN[i]}) ${it.text}`),
      `The draft profit for the year, before any of these items is entered in the books, is ${inr(s.draft)}.`,
    ].join('\n'),
  parts: [
    {
      kind: 'account',
      make: (s): CaseAccountParts | null => {
        const entries: DatedEntry[] = s.items.flatMap((it, i) => (it.lines ? [{ date: `(${ROMAN[i]})`, lines: it.lines }] : []));
        const view = accountOf(entries, 'bank', { date: YEAR_END, side: 'Dr', amount: s.book });
        if (view.balance?.side !== 'Dr') return null;
        const row = (p: (typeof view.debit)[number]): FormatRowParts => (p.accountIds.length === 0 ? { date: YEAR_END, label: p.label, amount: p.amount } : { ref: p.date, label: p.label, amount: p.amount });
        const left = [...view.debit.map(row)];
        const right = [...view.credit.map(row), { label: BALANCE_CD, amount: view.balance.amount, closing: true }];
        const need = s.items.map((it, i) => [it, i] as const).filter(([it]) => it.lines);
        return {
          task: `Prepare the amended Cash Book (bank column only) of ${s.b.owner} on ${YEAR_END} and balance it. Enter only what needs an entry in the cash book.`,
          title: `Amended Cash Book (bank column) of ${s.b.owner}, ${YEAR_END}`,
          left: drSide(left),
          right: crSide(right),
          distractors: [BRS_CHAIN.issued.label, BRS_CHAIN.deposited.label, 'Bank A/c', 'Cash A/c', 'Suspense A/c'],
          explanation: [
            `The cash book shows a favourable balance, a debit balance: "To Balance b/d ${inr(s.book)}".`,
            ...need.map(([it, i]) => `(${ROMAN[i]}) ${it.cb > 0 ? 'The bank has added money to the account: debit side' : 'The bank has taken money out of the account: credit side'}, "${it.cb > 0 ? 'To' : 'By'} ${it.lines!.map((l) => l.accountId).filter((id) => id !== 'bank').map((id) => `${resolveAccount(id).name} A/c`)[0]} ${inr(Math.abs(it.cb))}".`),
            `Left out: the cheques the bank has still to pay or to collect. The cash book is right about them; they belong only in the reconciliation statement.`,
            `The debit side is larger by ${inr(s.amended)}: "By Balance c/d ${inr(s.amended)}", the amended balance, which the balance sheet shows as cash at bank.`,
          ],
          hints: ['Which items has the cash book not yet heard of?', 'Money added by the bank goes on the debit side; money taken out by it on the credit side.'],
        };
      },
      verify: (q: AccountQuestion) => {
        const c = readBankYear(q.context);
        if (!c.items.every((it) => Number.isFinite(it.cb))) return false;
        const of = (rows: readonly FormatRow[]) => sumOf(rows.filter((r) => !r.closing).map((r) => r.amounts[0]));
        const ups = c.items.filter((it) => it.cb > 0).length;
        const downs = c.items.filter((it) => it.cb < 0).length;
        const closing = q.sides[1].rows.filter((r) => r.closing);
        return (
          of(q.sides[0].rows) === c.book + sumOf(c.items.filter((it) => it.cb > 0).map((it) => it.cb)) &&
          of(q.sides[1].rows) === -sumOf(c.items.filter((it) => it.cb < 0).map((it) => it.cb)) &&
          q.sides[0].rows.length === ups + 1 &&
          q.sides[1].rows.length === downs + 1 &&
          closing.length === 1 &&
          closing[0].amounts[0] === c.amended
        );
      },
    },
    {
      kind: 'statement',
      make: (s) => {
        const timing = s.items.filter((it) => !it.lines);
        const rows = [
          { label: BRS_CHAIN.balanceLabel('cb', s.amended), amounts: [s.amended, 0] },
          ...timing.map((it) => ({ label: it.pb > 0 ? BRS_CHAIN.issued.label : BRS_CHAIN.deposited.label, amounts: it.pb > 0 ? [it.pb, 0] : [0, -it.pb] })),
        ];
        return {
          task: `Prepare the Bank Reconciliation Statement of ${s.b.owner} as on ${YEAR_END}, starting from the balance the amended cash book ends on. Enter what is added in the Plus column and what is deducted in the Minus column.`,
          title: `Bank Reconciliation Statement of ${s.b.owner} as on ${YEAR_END}`,
          columns: BRS_CHAIN.columns,
          rows,
          final: { label: BRS_CHAIN.balanceLabel('pb', s.passBook), amount: s.passBook },
          distractors: [BRS_CHAIN.balanceLabel('cb', -s.amended), 'Bank charges debited by the bank', 'Interest credited by the bank', 'Cheque deposited and dishonoured'],
          explanation: [
            `The statement starts from the amended balance as per cash book, ${inr(s.amended)}, in the Plus column.`,
            ...timing.map((it) =>
              it.pb > 0
                ? `Cheques issued but not yet presented, ${inr(it.pb)}: the bank has not yet paid them, so the pass book balance is higher: Plus column.`
                : `Cheques deposited but not yet cleared, ${inr(-it.pb)}: the bank has not yet credited them, so the pass book balance is lower: Minus column.`,
            ),
            'The items known only from the pass book are now in the amended cash book: they no longer keep the balances apart.',
            `Plus ${inr(sumOf(rows.map((r) => r.amounts[0])))} - Minus ${inr(sumOf(rows.map((r) => r.amounts[1])))} = ${inr(s.passBook)}: the balance as per pass book.`,
          ],
          hints: ['Only the timing differences are left once the cash book is amended.', 'A cheque issued but not presented makes the pass book balance higher; one deposited but not cleared makes it lower.'],
        };
      },
      verify: (q) => {
        const c = readBankYear(q.context);
        const timing = c.items.filter((it) => it.pb !== 0);
        const start = q.rows.find((r) => r.label === BRS_CHAIN.balanceLabel('cb', 1));
        const plus = sumOf(q.rows.map((r) => r.amounts[0]));
        const minus = sumOf(q.rows.map((r) => r.amounts[1]));
        return (
          !!start &&
          start.amounts[0] === c.amended &&
          q.rows.length === timing.length + 1 &&
          plus - minus === c.passBook &&
          q.final?.amount === c.passBook &&
          timing.every((it) => q.rows.some((r) => r.amounts[it.pb > 0 ? 0 : 1] === Math.abs(it.pb)))
        );
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const changing = s.items.filter((it) => it.profit !== 0);
        const party = s.items.filter((it) => it.lines && it.profit === 0);
        return num(
          'What is the net profit for the year after the items are entered in the books?',
          s.profit,
          [
            [s.draft, 'Left the profit as it was. Bank charges, interest and bills paid by the bank are expenses and incomes of the year.'],
            [party.length ? s.profit + sumOf(party.map((it) => it.cb)) : null, 'Took a dishonoured cheque or a customer\'s payment into the bank as a loss or a gain. It changes only the debtor and the bank.'],
            [s.draft - sumOf(changing.map((it) => it.profit)), 'Took each item the wrong way round, adding the expenses and deducting the income.'],
            [s.profit + sumOf(s.items.filter((it) => !it.lines).map((it) => it.pb)), 'Took the timing differences into the profit. Cheques issued or paid in are already in the books.'],
            [s.draft + s.amended - s.book, 'Took the whole change in the bank balance as a change in the profit.'],
          ],
          [
            `Draft profit ${inr(s.draft)}.`,
            ...changing.map((it) => `(${ROMAN[s.items.indexOf(it)]}) ${it.profit > 0 ? `+ ${inr(it.profit)}: an income` : `- ${inr(-it.profit)}: an expense`}.`),
            ...party.map((it) => `(${ROMAN[s.items.indexOf(it)]}) no change: it moves money between the bank and a customer's account.`),
            `Net profit = ${inr(s.profit)}.`,
          ],
          ['Which of the items are an expense or an income of the year?', 'Timing differences, a dishonoured cheque and a payment by a customer change no profit.'],
        );
      },
      verify: (q) => q.answer === readBankYear(q.context).profit,
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// The long question with a year's adjustments, from a trial balance (cases C6 to C8). The trial balance, the
// adjustments, the three statements and their checks are those of the chained cases of the final accounts stage
// (`FA_CASES` in ./final-accounts.ts, built on `FAA_CHAIN`): the same wording, rows and working. What these cases add
// is the book before the statements (the adjusting entries, the entries for the items of the pass book, the rectifying
// entries) and, in C7 and C8, adjustments of other topics: the bank items of a reconciliation and errors found after the
// trial balance. Those are written here as adjustments of the same shape, with their stated effects, which
// `FA_CASES.chainBooks` checks against their entries; the reading of a printed case (`workedWith`) reads them from
// their words, strips them out, lets the reading of the final accounts stage work the rest, and adds them back.
// ---------------------------------------------------------------------------------------------------------------

const F = FAA_CHAIN;
const FC = FA_CASES;

/** A short name for an adjustment of a set, from its entry: what kind of adjustment it is, without its amount. */
function adjustmentName(a: FaaAdj): string {
  const has = (side: 'Dr' | 'Cr', id: string) => a.lines.some((l) => l.side === side && l.accountId === id);
  const debited = a.lines.find((l) => l.side === 'Dr')!.accountId;
  if (has('Cr', 'outstandingExpenses')) return `${resolveAccount(debited).name} still unpaid on 31 March.`;
  if (has('Dr', 'prepaidExpenses')) return `${resolveAccount(a.lines.find((l) => l.side === 'Cr')!.accountId).name} paid for the next year.`;
  const income = (id: string) => resolveAccount(id).name.replace(/ Received$/, '');
  if (has('Dr', 'accruedIncome')) return `${income(a.lines.find((l) => l.side === 'Cr')!.accountId)} earned but not yet received.`;
  if (has('Cr', 'incomeReceivedInAdvance')) return `${income(debited)} received for the next year.`;
  if (has('Dr', 'depreciation')) return `Depreciation on ${resolveAccount(a.lines.find((l) => l.side === 'Cr')!.accountId).name.toLowerCase()} for the year.`;
  if (has('Dr', 'interestOnCapital')) return 'Interest on capital.';
  if (has('Cr', 'interestOnDrawings')) return 'Interest on drawings.';
  if (has('Dr', 'drawings') && has('Cr', 'purchases')) return 'Goods taken by the proprietor.';
  return 'Adjustment.';
}

/** Why an adjusting entry debits and credits what it does: the working of the adjustment, then the rule. */
function adjustmentWhy(a: FaaAdj): string[] {
  const work = a.trading ?? a.pl ?? a.bs ?? '';
  const dr1 = a.lines.filter((l) => l.side === 'Dr').map((l) => `${resolveAccount(l.accountId).name} A/c`);
  const cr1 = a.lines.filter((l) => l.side === 'Cr').map((l) => `${resolveAccount(l.accountId).name} A/c`);
  return [...(work ? [work] : []), `${listed(dr1)} ${dr1.length > 1 ? 'are' : 'is'} debited; ${listed(cr1)} ${cr1.length > 1 ? 'are' : 'is'} credited.`];
}

/** The printed adjustments of a case as `(n) text`, the closing stock (1) left out. */
const printedAdjustments = (data: string): { no: number; text: string }[] =>
  data.split('\n').flatMap((line) => {
    const m = /^(?:Adjustments: )?\((\d+)\) (.+)$/.exec(line);
    return m && m[1] !== '1' ? [{ no: Number(m[1]), text: m[2] }] : [];
  });

// ---------------------------------------------------------------------------------------------------------------
// C6. A year's adjustments: the adjusting entries, then the final accounts (complex). Expenses unpaid or paid ahead,
// an income still to come or received ahead, depreciation (sometimes on an item bought during the year), and in some
// seeds interest on capital and goods taken by the proprietor. The student passes the adjusting entries (journal),
// then prepares the Trading Account, the Profit and Loss Account and the Balance Sheet. Version 2: interest on drawings
// of a sole proprietor, beyond the Class 11 syllabus, is no longer drawn.
// ---------------------------------------------------------------------------------------------------------------

const chainAdjusting = caseTemplate<FaCaseAdjusted>({
  id: 'case-wy-chain-adjusting-entries-final-accounts',
  version: 2,
  topicId: T,
  conceptId: C,
  difficulty: 'complex',
  title: 'Adjusting entries, then the final accounts',
  setup: (rng) =>
    F.attempt(14, () => {
      const firm = rng.pick(F.firms);
      const carried = F.drawCarried(rng, rng.pick([['out'], ['pre'], ['out', 'pre']]), ['wages', 'salaries', 'rent']);
      const fixed = F.drawFixed(rng, 1, 0.5);
      const earned = rng.next() < 0.6 ? FC.drawIncome(rng, rng.pick(FC.incomeKinds)) : null;
      const goods = rng.next() < 0.45 ? FC.drawGoods(rng, 'drawn') : null;
      const known = [...carried.adjs.map((a) => [a]), fixed.adjs, ...(earned ? [[earned.adj]] : []), ...(goods ? [[goods.adj]] : [])];
      const t = F.tb(rng, {
        fixed: fixed.fixed,
        directs: [[F.heads.wages.id, carried.wages]],
        indirect: [[F.heads.salaries.id, carried.salaries], [F.heads.insurance.id, carried.insurance], ...(carried.rentUsed ? [[F.heads.rent.id, carried.rent] as FaaBal] : [])],
        incomes: earned ? [earned.balance] : [],
        ...FC.drawReturns(rng, true),
        debtors: amount(rng, 60000, 180000, 5000),
        drawings: amount(rng, 24000, 60000, 6000),
        profit: F.round(amount(rng, 80000, 160000, 1000) - F.net(known.flat())),
      });
      if (!t) return null;
      const ioc = rng.next() < 0.5 ? [[F.interestOnCapital(rng.pick([5, 6, 8, 10]), t.capital, undefined, false, true)]] : [];
      const adjs = rng.shuffle([...known, ...ioc]).flat();
      // Three to five adjusting entries: with the three statements after them, the case stays a question of six marks.
      if (adjs.length < 3 || adjs.length > 5) return null;
      return FC.chained(FC.chainBooks(rng, firm, t, adjs), rng.pick(FC.orders));
    }),
  context: FC.text,
  parts: [
    {
      kind: 'journal_set',
      make: ({ c }): CaseSetParts => ({
        task: `Pass the adjusting entries for adjustment (2) onwards on ${F.date}.`,
        transactions: c.adjs.map((a) => ({ label: `(${F.no(c, a)})`, text: adjustmentName(a), lines: a.lines, explanation: adjustmentWhy(a) })),
        hints: ['Each adjustment touches one expense or income (or the drawings) and one asset, liability or capital account.', 'Depreciation is written off the asset; goods taken leave Purchases A/c at cost.'],
        distractorAccounts: ['profitAndLoss', 'trading', 'cash'],
      }),
      // The entries, posted on the printed trial balance, must give the profits the words of the adjustments give.
      verify: (q: JournalSetQuestion) => {
        const w = FC.workedByHand(q.context ?? '');
        const h = F.read(q.context ?? '');
        if (!w || !h || q.entries.length !== printedAdjustments(q.context ?? '').length) return false;
        const e = q.entries.map((x) => F.effect(x.expected));
        const gross = h.gross + sumOf(e.map((x) => x.gp));
        const net = gross + h.inc + sumOf(e.map((x) => x.inc)) - h.exp - sumOf(e.map((x) => x.exp));
        return gross === w.gross && net === w.net;
      },
    },
    { kind: 'account', make: FC.trading, verify: FC.tradingHolds },
    { kind: 'account', make: FC.profitAndLoss, verify: FC.profitAndLossHolds },
    { kind: 'account', make: FC.balanceSheet, verify: FC.balanceSheetHolds },
  ],
});

// ---- adjustments of other topics, in the shape of the final accounts stage, and their reading ----

type FaaWant = [label: string, amount: number];
const { gpCd: GP_CD, gpBd: GP_BD, netProfit: NET_PROFIT } = F.labels;

/** An adjustment of another topic: everything not given is nothing. */
const otherAdj = (a: Pick<FaaAdj, 'text' | 'lines'> & Partial<FaaAdj>): FaaAdj => ({ gp: 0, exp: 0, inc: 0, cap: 0, liab: 0, notes: [], slips: [], bsSlips: [], ...a });

/** What one adjustment of another topic does to the rows of the statements, read from its words. */
interface Extra {
  re: RegExp;
  apply(m: RegExpExecArray, w: Lists): boolean;
}
interface Lists {
  cost: FaaWant[];
  sales: FaaWant[];
  debit: FaaWant[];
  credit: FaaWant[];
  assets: FaaWant[];
  liabilities: FaaWant[];
}
/** Adds to the row of that name, or adds the row; false when a row would fall to nothing or below. */
function addTo(list: FaaWant[], label: string, x: number): boolean {
  const i = list.findIndex((w) => w[0] === label);
  if (i < 0) list.push([label, x]);
  else list[i] = [label, list[i][1] + x];
  return list.every((w) => w[1] > 0);
}
const rupee = (text: string): number => parseRupees(text) ?? NaN;

/**
 * The three statements worked from a printed case that has adjustments of other topics: those lines are read by
 * `extras`, taken out (the others numbered again), the rest is worked by the reading of the final accounts stage, and
 * the extras are then added to its rows. Null when a line matches two readings or the reading of the stage fails.
 */
function workedWith(data: string, extras: readonly Extra[]) {
  const kept: string[] = [];
  const found: { extra: Extra; m: RegExpExecArray }[] = [];
  let next = 2;
  for (const line of data.split('\n')) {
    const m = /^(Adjustments: )?\((\d+)\) (.+)$/.exec(line);
    if (!m || m[2] === '1') {
      kept.push(line);
      continue;
    }
    const hits = extras.flatMap((extra) => {
      const x = extra.re.exec(m[3]);
      return x ? [{ extra, m: x }] : [];
    });
    if (hits.length > 1) return null;
    if (hits.length === 1) found.push(hits[0]);
    else kept.push(`${m[1] ?? ''}(${next++}) ${m[3]}`);
  }
  const w = FC.workedByHand(kept.join('\n'));
  if (!w || found.length === 0) return null;
  const lists: Lists = { cost: [...w.cost], sales: [...w.sales], debit: [...w.debit], credit: w.credit.filter((x) => x[0] !== GP_BD), assets: [...w.assets], liabilities: [...w.liabilities] };
  if (!found.every(({ extra, m }) => extra.apply(m, lists))) return null;
  const gross = sumOf(lists.sales.map((x) => x[1])) - sumOf(lists.cost.map((x) => x[1]));
  const credit: FaaWant[] = [[GP_BD, gross], ...lists.credit];
  const net = sumOf(credit.map((x) => x[1])) - sumOf(lists.debit.map((x) => x[1]));
  if (gross <= 0 || net <= 0 || !addTo(lists.liabilities, 'Capital', net - w.net)) return null;
  return { ...lists, credit, gross, net };
}

/** The checks of the three statements against `workedWith`. */
const holdsWith = (extras: readonly Extra[]) => ({
  trading: (q: AccountQuestion): boolean => {
    const w = workedWith(q.data, extras);
    return !!w && F.sideIs(q.sides[0], [...w.cost, [GP_CD, w.gross]], GP_CD) && F.sideIs(q.sides[1], w.sales);
  },
  profitAndLoss: (q: AccountQuestion): boolean => {
    const w = workedWith(q.data, extras);
    return !!w && F.sideIs(q.sides[0], [...w.debit, [NET_PROFIT, w.net]], NET_PROFIT) && F.sideIs(q.sides[1], w.credit);
  },
  balanceSheet: (q: AccountQuestion): boolean => {
    const w = workedWith(q.data, extras);
    const total = (xs: FaaWant[]) => sumOf(xs.map((x) => x[1]));
    return !!w && total(w.assets) === total(w.liabilities) && q.sides[0].title === 'Liabilities' && F.sideIs(q.sides[0], w.liabilities) && F.sideIs(q.sides[1], w.assets);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// C7. The pass book at the year end, then the final accounts (complex). Beside the usual adjustments, the pass book
// shows items the cash book has not yet taken in (bank charges, interest, a dishonoured cheque, a customer's payment
// straight into the bank) and a cheque not yet presented, which needs no entry. The student passes the entries for the
// pass book items (cash book and bank reconciliation), then prepares the three statements.
// ---------------------------------------------------------------------------------------------------------------

const BANK_EXTRAS: Extra[] = [
  {
    re: /^The pass book shows bank charges of (₹[\d,]+), not yet in the cash book\.$/,
    apply: (m, w) => addTo(w.debit, 'Bank Charges', rupee(m[1])) && addTo(w.assets, 'Cash at Bank', -rupee(m[1])),
  },
  {
    re: /^The pass book shows interest of (₹[\d,]+) allowed by the bank, not yet in the cash book\.$/,
    apply: (m, w) => addTo(w.credit, 'Interest Received', rupee(m[1])) && addTo(w.assets, 'Cash at Bank', rupee(m[1])),
  },
  {
    re: /^A customer's cheque for (₹[\d,]+), paid into the bank in March, was dishonoured; only the pass book shows it\.$/,
    apply: (m, w) => addTo(w.assets, 'Sundry Debtors', rupee(m[1])) && addTo(w.assets, 'Cash at Bank', -rupee(m[1])),
  },
  {
    re: /^A customer paid (₹[\d,]+) straight into the bank account; only the pass book shows it\.$/,
    apply: (m, w) => addTo(w.assets, 'Sundry Debtors', -rupee(m[1])) && addTo(w.assets, 'Cash at Bank', rupee(m[1])),
  },
  // A timing difference: the cash book is right, and nothing changes.
  { re: /^Cheques for ₹[\d,]+ issued to suppliers in March had not been presented for payment by 31 March\.$/, apply: () => true },
];
const BANK_HOLDS = holdsWith(BANK_EXTRAS);

/** The items of the pass book as adjustments: the four that need an entry, and the cheque not yet presented. */
const PASS_BOOK_ADJ = {
  charges: (x: number) =>
    otherAdj({
      text: `The pass book shows bank charges of ${inr(x)}, not yet in the cash book.`,
      lines: [dr('bankCharges', x), cr('bank', x)],
      exp: x,
      pl: `Bank charges of ${inr(x)}, known only from the pass book, are an expense of the year: "To Bank Charges".`,
      bs: `The bank charges of ${inr(x)} have reduced the bank balance.`,
      slips: ['Bank Charges'],
    }),
  interest: (x: number) =>
    otherAdj({
      text: `The pass book shows interest of ${inr(x)} allowed by the bank, not yet in the cash book.`,
      lines: [dr('bank', x), cr('interestReceived', x)],
      inc: x,
      pl: `Interest of ${inr(x)} allowed by the bank is an income of the year: "By Interest Received".`,
      bs: `The interest of ${inr(x)} has added to the bank balance.`,
      slips: ['Interest Received'],
    }),
  dishonour: (x: number) =>
    otherAdj({
      text: `A customer's cheque for ${inr(x)}, paid into the bank in March, was dishonoured; only the pass book shows it.`,
      lines: [dr(F.debtors, x), cr('bank', x)],
      notes: [[F.debtors, `Add: Cheque dishonoured ${inr(x)}`]],
      pl: 'Not an item of this account: a dishonoured cheque changes only the debtors and the bank, not the profit.',
      bs: `The dishonoured cheque of ${inr(x)} is owed by the customer again: it is added back to the debtors and taken out of the bank balance.`,
    }),
  direct: (x: number) =>
    otherAdj({
      text: `A customer paid ${inr(x)} straight into the bank account; only the pass book shows it.`,
      lines: [dr('bank', x), cr(F.debtors, x)],
      notes: [[F.debtors, `Less: Paid straight into the bank ${inr(x)}`]],
      pl: "Not an item of this account: a customer's payment changes only the debtors and the bank, not the profit.",
      bs: `The ${inr(x)} paid straight into the bank is no longer owed: it comes off the debtors and is added to the bank balance.`,
    }),
  notPresented: (x: number) =>
    otherAdj({
      text: `Cheques for ${inr(x)} issued to suppliers in March had not been presented for payment by 31 March.`,
      lines: [],
      pl: 'Not an item of this account: the cheques not yet presented are already in the cash book, and they keep the pass book apart only until the bank pays them.',
      bs: `The cheques of ${inr(x)} not yet presented need no entry: the cash book, and so the balance sheet, is right about them.`,
    }),
};

interface BankFinal extends FaCaseAdjusted {
  /** The adjustments that are items of the pass book needing an entry. */
  passBook: FaaAdj[];
}

/** The Balance Sheet of a case whose bank balance an adjustment changed: its working says so instead of "at the trial balance figure". */
function bankBalanceSheet(s: FaCaseAdjusted): CaseAccountParts {
  const p = FC.balanceSheet(s);
  const bank = s.c.books.get('bank') ?? 0;
  const tbBank = s.c.tb.get('bank') ?? 0;
  return {
    ...p,
    explanation: p.explanation.map((line) =>
      line.startsWith('At the trial balance figure') && bank !== tbBank
        ? `${line.replace(/, cash at bank ₹[\d,]+|cash at bank ₹[\d,]+, /, '').replace(/ and cash at bank ₹[\d,]+/, '')} Cash at bank = ${inr(tbBank)} as in the trial balance, brought up to date with the items of the pass book: ${inr(bank)}.`
        : line,
    ),
  };
}

const chainBankFinal = caseTemplate<BankFinal>({
  id: 'case-wy-chain-pass-book-final-accounts',
  // Version 2 (Class 11 quality pass review): the hints of the Profit and Loss Account and the Balance Sheet no longer name
  // interest on drawings, which is beyond the Class 11 syllabus.
  version: 2,
  topicId: T,
  conceptId: C,
  difficulty: 'complex',
  title: 'The pass book at the year end, then the final accounts',
  setup: (rng) =>
    F.attempt(14, () => {
      const firm = rng.pick(F.firms);
      const carried = F.drawCarried(rng, rng.pick([['out'], ['pre'], ['out', 'pre']]), ['wages', 'salaries', 'rent']);
      const fixed = F.drawFixed(rng, 1, 0.4);
      const kinds = rng.shuffle(['charges', 'interest', 'dishonour', 'direct'] as const).slice(0, 3);
      const passBook = kinds.map((k) => PASS_BOOK_ADJ[k](amount(rng, k === 'charges' ? 500 : k === 'interest' ? 1000 : 4000, k === 'charges' ? 3000 : k === 'interest' ? 6000 : 20000, k === 'charges' || k === 'interest' ? 100 : 500)));
      const timing = PASS_BOOK_ADJ.notPresented(amount(rng, 5000, 30000, 500));
      const all = [...passBook, timing].map((a) => amountsIn(a.text)[0]);
      if (new Set(all).size !== all.length) return null;
      const known = [...carried.adjs.map((a) => [a]), fixed.adjs, ...passBook.map((a) => [a])];
      const t = F.tb(rng, {
        fixed: fixed.fixed,
        directs: [[F.heads.wages.id, carried.wages]],
        indirect: [[F.heads.salaries.id, carried.salaries], [F.heads.insurance.id, carried.insurance], ...(carried.rentUsed ? [[F.heads.rent.id, carried.rent] as FaaBal] : [])],
        ...FC.drawReturns(rng, true),
        debtors: amount(rng, 60000, 180000, 5000),
        drawings: amount(rng, 24000, 60000, 6000),
        profit: F.round(amount(rng, 80000, 160000, 1000) - F.net(known.flat())),
      });
      if (!t) return null;
      // The bank balance must stay well above nothing once the items have taken from it.
      const out = sumOf(passBook.flatMap((a) => a.lines.filter((l) => l.accountId === 'bank' && l.side === 'Cr').map((l) => l.amount)));
      if (t.bank - out < R(10000)) return null;
      const adjs = rng.shuffle([...known, [timing]]).flat();
      const s = FC.chained(FC.chainBooks(rng, firm, t, adjs), rng.pick(FC.orders));
      return s && { ...s, passBook: s.c.adjs.filter((a) => a.lines.some((l) => l.accountId === 'bank')) };
    }),
  context: FC.text,
  parts: [
    {
      kind: 'journal_set',
      make: ({ c, passBook }): CaseSetParts => ({
        task: 'Pass the entries that bring the cash book up to date with the pass book, before the final accounts are prepared.',
        transactions: passBook.map((a) => ({
          label: `(${F.no(c, a)})`,
          text: a.lines.some((l) => l.accountId === 'bankCharges') ? 'Bank charges shown only in the pass book.' : a.lines.some((l) => l.accountId === 'interestReceived') ? 'Interest allowed by the bank.' : a.lines[0].side === 'Dr' && a.lines[0].accountId === 'bank' ? "A customer's payment straight into the bank." : "A customer's cheque dishonoured.",
          lines: a.lines,
          explanation: [
            a.lines.find((l) => l.accountId === 'bank')!.side === 'Dr' ? 'The bank has added money to the account: Bank A/c is debited.' : 'The bank has taken money out of the account: Bank A/c is credited.',
            ...a.lines.filter((l) => l.accountId !== 'bank').map((l) => `${resolveAccount(l.accountId).name}${l.accountId === F.debtors ? '' : ' A/c'} is ${l.side === 'Dr' ? 'debited' : 'credited'}${l.accountId === F.debtors ? (l.side === 'Dr' ? ': the customer owes the amount again' : ': the customer owes that much less') : ''}.`),
          ],
        })),
        hints: ['Which items has the cash book not yet heard of? The cheques not yet presented are already in it.', 'Money added by the bank is debited to Bank A/c; money taken out by it is credited.'],
        distractorAccounts: ['profitAndLoss', 'cash', 'suspense'],
      }),
      verify: (q: JournalSetQuestion) => {
        const w = workedWith(q.context ?? '', BANK_EXTRAS);
        const read = printedAdjustments(q.context ?? '').filter((a) => BANK_EXTRAS.slice(0, 4).some((e) => e.re.test(a.text)));
        if (!w || q.entries.length !== read.length) return false;
        // Each entry is the one its item needs: the bank moves by the item's amount, the right way.
        return read.every((a) => {
          const e = q.entries.find((x) => x.label === `(${a.no})`);
          const bank = e?.expected.find((l) => l.accountId === 'bank');
          const x = amountsIn(a.text)[0];
          const up = /interest|straight into the bank/.test(a.text);
          return !!bank && bank.amount === x && bank.side === (up ? 'Dr' : 'Cr') && profitOfLines(e!.expected) === (/bank charges/.test(a.text) ? -x : /interest/.test(a.text) ? x : 0);
        });
      },
    },
    { kind: 'account', make: FC.trading, verify: BANK_HOLDS.trading },
    { kind: 'account', make: FC.profitAndLoss, verify: BANK_HOLDS.profitAndLoss },
    { kind: 'account', make: bankBalanceSheet, verify: BANK_HOLDS.balanceSheet },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// C8. Errors found after the trial balance, then the final accounts (complex). The trial balance agrees, but a machine
// bought during the year was debited to Purchases A/c, and a bad debt recovered was credited to the debtors; beside
// them, the usual adjustments. The student passes the rectifying entries and the depreciation on the machine
// (rectification, depreciation), then prepares the three statements.
// ---------------------------------------------------------------------------------------------------------------

const ERROR_EXTRAS: Extra[] = [
  {
    re: /^A machine bought for (₹[\d,]+) on (1 [A-Z][a-z]+ 20\d\d) was debited to Purchases A\/c\. Depreciate it at (\d+)% p\.a\. from that date; write it off the asset\.$/,
    apply: (m, w) => {
      const x = rupee(m[1]);
      const d = (x * Number(m[3]) * (12 - monthIn(m[2]))) / 1200;
      return clean(d) && addTo(w.cost, 'Purchases', -x) && addTo(w.debit, 'Depreciation on Machinery', d) && addTo(w.assets, 'Machinery', x - d);
    },
  },
  {
    re: /^(₹[\d,]+) received from a customer whose debt had been written off as bad two years ago was credited to Sundry Debtors\.$/,
    apply: (m, w) => addTo(w.credit, 'Bad Debts Recovered', rupee(m[1])) && addTo(w.assets, 'Sundry Debtors', rupee(m[1])),
  },
];
const ERROR_HOLDS = holdsWith(ERROR_EXTRAS);

interface ErrorFinal extends FaCaseAdjusted {
  machine: FaaAdj;
  recovered: FaaAdj;
  cost: number;
  dep: number;
  k: number;
  rate: number;
}

const chainErrorsFinal = caseTemplate<ErrorFinal>({
  id: 'case-wy-chain-errors-final-accounts',
  // Version 2 (Class 11 quality pass review): the hints of the Profit and Loss Account and the Balance Sheet no longer name
  // interest on drawings, which is beyond the Class 11 syllabus.
  version: 2,
  topicId: T,
  conceptId: C,
  difficulty: 'complex',
  title: 'Errors found after the trial balance, then the final accounts',
  setup: (rng) =>
    F.attempt(14, () => {
      const firm = rng.pick(F.firms);
      const carried = F.drawCarried(rng, rng.pick([['out'], ['pre']]), ['wages', 'salaries', 'rent']);
      const fixed = F.drawFixed(rng, 1, 0.3);
      // The machine found among the purchases is the only machinery: the other fixed asset is not machinery.
      if (fixed.fixed[0][0] === 'machinery') return null;
      const k = rng.pick([3, 4, 6, 7, 9]);
      const rate = rng.pick([10, 15, 20]);
      const cost = amount(rng, 40000, 120000, 10000);
      const dep = (cost * rate * (12 - k)) / 1200;
      const got = amount(rng, 2000, 9000, 500);
      if (!clean(dep)) return null;
      const machine = otherAdj({
        text: `A machine bought for ${inr(cost)} on ${dayOf(k)} was debited to Purchases A/c. Depreciate it at ${rate}% p.a. from that date; write it off the asset.`,
        lines: [dr('machinery', cost), cr('purchases', cost), dr('depreciation', dep), cr('machinery', dep)],
        gp: cost,
        exp: dep,
        notes: [['purchases', `Less: Machine wrongly debited ${inr(cost)}`], ['machinery', `Add: Machine wrongly debited to Purchases ${inr(cost)}`], ['machinery', `Less: Depreciation ${inr(dep)}`]],
        own: { account: 'depreciation', label: 'Depreciation on Machinery', amount: dep },
        trading: `The machine is a fixed asset, not goods for resale: its cost, ${inr(cost)}, comes out of purchases.`,
        pl: `Depreciation on the machine = ${inr(cost)} × ${rate}% × ${12 - k}/12 = ${inr(dep)}, for the months from ${dayOf(k)}: "To Depreciation on Machinery".`,
        bs: `Machinery = ${inr(cost)} − depreciation ${inr(dep)} = ${inr(cost - dep)}.`,
        slips: ['Machinery'],
        bsSlips: ['Purchases'],
      });
      const recovered = otherAdj({
        text: `${inr(got)} received from a customer whose debt had been written off as bad two years ago was credited to Sundry Debtors.`,
        lines: [dr(F.debtors, got), cr('badDebtsRecovered', got)],
        inc: got,
        notes: [[F.debtors, `Add: Bad debt recovered wrongly credited ${inr(got)}`]],
        pl: `A debt recovered after it was written off is an income of the year: "By Bad Debts Recovered ${inr(got)}".`,
        bs: `The ${inr(got)} wrongly credited to the debtors is added back to them: no customer paid it on a debt still owed.`,
        slips: ['Sundry Debtors'],
      });
      const goods = rng.next() < 0.5 ? FC.drawGoods(rng, 'drawn') : null;
      const known = [...carried.adjs.map((a) => [a]), fixed.adjs, [machine], [recovered], ...(goods ? [[goods.adj]] : [])];
      const t = F.tb(rng, {
        fixed: fixed.fixed,
        directs: [[F.heads.wages.id, carried.wages]],
        indirect: [[F.heads.salaries.id, carried.salaries], [F.heads.insurance.id, carried.insurance], ...(carried.rentUsed ? [[F.heads.rent.id, carried.rent] as FaaBal] : [])],
        debtors: amount(rng, 60000, 180000, 5000),
        drawings: amount(rng, 24000, 60000, 6000),
        profit: F.round(amount(rng, 80000, 160000, 1000) - F.net(known.flat())),
      });
      if (!t) return null;
      // The machine is a small part of what was entered as purchases, as a slip of this kind would be.
      const bought = t.others.find((l) => l.accountId === 'purchases')?.amount ?? 0;
      if (cost * 5 > bought) return null;
      const s = FC.chained(FC.chainBooks(rng, firm, t, rng.shuffle(known).flat()), rng.pick(FC.orders));
      if (!s) return null;
      const [m, r] = [s.c.adjs.find((a) => a.text === machine.text)!, s.c.adjs.find((a) => a.text === recovered.text)!];
      return { ...s, machine: m, recovered: r, cost, dep, k, rate };
    }),
  context: FC.text,
  parts: [
    {
      kind: 'journal_set',
      make: (s): CaseSetParts => ({
        task: `Pass the rectifying entries for adjustments (${F.no(s.c, s.machine)}) and (${F.no(s.c, s.recovered)}), and the entry for the depreciation on the machine.`,
        transactions: [
          {
            label: `(${F.no(s.c, s.machine)})`,
            text: 'A machine debited to Purchases A/c.',
            lines: [dr('machinery', s.cost), cr('purchases', s.cost)],
            explanation: ['The machine is a fixed asset: Machinery A/c is debited.', 'Purchases A/c, wrongly debited, is credited. Both sides of the first entry were posted, so the trial balance agreed and no Suspense A/c is needed.'],
          },
          {
            label: 'Depreciation',
            text: 'Depreciation on the machine for the year.',
            lines: [dr('depreciation', s.dep), cr('machinery', s.dep)],
            explanation: [`${inr(s.cost)} x ${s.rate}/100 x ${12 - s.k}/12 = ${inr(s.dep)}.`, 'Depreciation A/c is debited; it is written off the asset: Machinery A/c is credited.'],
          },
          {
            label: `(${F.no(s.c, s.recovered)})`,
            text: 'A bad debt recovered credited to the debtors.',
            lines: s.recovered.lines,
            explanation: ['The debt was written off long ago, so no customer owes it: the credit to Sundry Debtors is cancelled by a debit.', 'The money recovered is an income: Bad Debts Recovered A/c is credited.'],
          },
        ],
        hints: ['Write down what was posted and what should have been posted.', 'An asset charged as goods comes out of purchases; once it is an asset, it is depreciated for its months of use.'],
        distractorAccounts: ['suspense', 'sales', 'badDebts'],
      }),
      verify: (q: JournalSetQuestion) => {
        const w = workedWith(q.context ?? '', ERROR_EXTRAS);
        const lines = printedAdjustments(q.context ?? '');
        const m = lines.find((a) => ERROR_EXTRAS[0].re.test(a.text));
        const r = lines.find((a) => ERROR_EXTRAS[1].re.test(a.text));
        if (!w || !m || !r) return false;
        const [cost] = amountsIn(m.text);
        const dep = (cost * intIn(m.text, /at (\d+)% p\.a\./) * (12 - monthIn(m.text))) / 1200;
        const all = q.entries.flatMap((e) => e.expected);
        // Together the entries move the profit by what the words give: the cost out of purchases, less the depreciation, plus the recovery.
        return q.entries.length === 3 && profitOfLines(all) === cost - dep + amountsIn(r.text)[0] && !all.some((l) => l.accountId === 'suspense');
      },
    },
    { kind: 'account', make: FC.trading, verify: ERROR_HOLDS.trading },
    { kind: 'account', make: FC.profitAndLoss, verify: ERROR_HOLDS.profitAndLoss },
    { kind: 'account', make: FC.balanceSheet, verify: ERROR_HOLDS.balanceSheet },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// C9. From the ledger balances to the net profit (medium). The balances of the ledger, given without their sides; the
// student sorts them into a Trial Balance (ledger, trial balance), then prepares the Trading Account and the Profit and
// Loss Account (final accounts, in the formats of that topic: `FA_CHAIN`). Each statement is checked by sorting the
// printed balances by their names and handing them, with their sides, to the checks of the final accounts topic.
// ---------------------------------------------------------------------------------------------------------------

const TB_LABEL: Record<string, string> = { stock: 'Opening Stock' };
/** The balances that stand in the credit column, by the names the case prints. */
const isCreditName = (label: string): boolean =>
  / Received A\/c$/.test(label) || ['Capital A/c', 'Sales A/c', 'Purchases Return A/c', 'Sundry Creditors', 'Bank Loan A/c', 'Loan A/c', 'Bills Payable A/c'].includes(label);

/** The printed balances with the sides their names give, as the final accounts topic prints a trial balance. */
function withSides(context: string): string {
  return context
    .split('\n')
    .map((line) => {
      const m = /^(.+): (₹[\d,]+)$/.exec(line);
      return m ? `${m[1]}: ${m[2]} (${isCreditName(m[1]) ? 'Cr' : 'Dr'})` : line;
    })
    .join('\n');
}

const chainLedgerToProfit = caseTemplate<ChainBooks>({
  id: 'case-wy-chain-balances-to-net-profit',
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: 'From the ledger balances to the net profit',
  setup: (rng) =>
    FA_CHAIN.books(rng, {
      fixed: rng.pick([1, 2]),
      directs: rng.pick([1, 2]),
      indirect: rng.pick([3, 4]),
      incomes: 1,
      returns: rng.pick(['none', 'purchases', 'sales', 'both'] as const),
      loan: rng.next() < 0.3,
      cash: rng.next() < 0.5,
    }),
  context: (b) =>
    [
      `${b.name}, ${b.trade}, closes the books on ${YEAR_END}. The balances of the ledger on that date, each account written as it stands in the ledger:`,
      ...trialBalance(b.ledger).rows.map((r) => `${TB_LABEL[r.accountId] ?? r.label}: ${inr(r.amount)}`),
      `Closing stock is valued at ${inr(b.cs)}; it is not in the trial balance.`,
      'There is no other adjustment. No capital was brought in during the year.',
    ].join('\n'),
  parts: [
    {
      kind: 'statement',
      make: (b) => {
        const tb = trialBalance(b.ledger);
        return {
          task: `Prepare the Trial Balance of ${b.name} as on ${YEAR_END} from these balances.`,
          title: `Trial Balance of ${b.name} as on ${YEAR_END}`,
          heading: 'Name of account',
          columns: ['Debit (₹)', 'Credit (₹)'],
          totalsAgree: true,
          rows: tb.rows.map((r) => ({ label: TB_LABEL[r.accountId] ?? r.label, amounts: r.side === 'Dr' ? [r.amount, 0] : [0, r.amount] })),
          distractors: ['Closing Stock', 'Suspense A/c', 'Net Profit'],
          explanation: [
            `Debit balances: the assets, the expenses and losses, the opening stock, purchases${b.ledger.has('salesReturn') ? ', sales returns' : ''} and drawings.`,
            `Credit balances: the capital, the liabilities, sales${b.ledger.has('purchasesReturn') ? ', purchases returns' : ''} and the incomes.`,
            `The closing stock is not a ledger balance: it is valued after the books are closed and goes straight to the final accounts.`,
            `Both columns total ${inr(tb.debitTotal)}.`,
          ],
          hints: ['Does the account show something owned or spent (debit), or something owed, earned or put in by the owner (credit)?', 'The closing stock is not one of the balances.'],
        };
      },
      verify: (q) => {
        const lines = (q.context ?? '').split('\n').flatMap((l) => {
          const m = /^(.+): (₹[\d,]+)$/.exec(l);
          return m ? [{ label: m[1], x: rupee(m[2]) }] : [];
        });
        const dr1 = sumOf(lines.filter((l) => !isCreditName(l.label)).map((l) => l.x));
        const cr1 = sumOf(lines.filter((l) => isCreditName(l.label)).map((l) => l.x));
        return (
          dr1 === cr1 &&
          q.rows.length === lines.length &&
          lines.every((l) => q.rows.some((r) => r.label === l.label && r.amounts[isCreditName(l.label) ? 1 : 0] === l.x && r.amounts[isCreditName(l.label) ? 0 : 1] === 0))
        );
      },
    },
    { kind: 'account', make: FA_CHAIN.trading, verify: (q) => FA_CHAIN.tradingHolds({ ...q, data: withSides(q.data) }) },
    { kind: 'account', make: FA_CHAIN.profitAndLoss, verify: (q) => FA_CHAIN.profitAndLossHolds({ ...q, data: withSides(q.data) }) },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// C10. Two years of machinery with a provision for depreciation (medium). A machine bought at the start of the first
// year and another during the second; depreciation is credited to Provision for Depreciation A/c. The student
// journalises the two years (journal, depreciation), prepares the provision account for the two years (ledger,
// provisions) and finds the figure of machinery in the balance sheet (final accounts).
// ---------------------------------------------------------------------------------------------------------------

interface ProvisionYears {
  b: Biz;
  method: Method;
  rate: number;
  costA: number;
  costB: number;
  kB: number;
  depA1: number;
  depA2: number;
  depB: number;
  entries: (DatedEntry & { text: string; why: string[] })[];
}

function readProvisionYears(context: string | undefined) {
  const rule = lineOf(context, /Depreciation is charged at/);
  const method: Method = rule.includes('original cost') ? 'slm' : 'wdv';
  const rate = intIn(rule, /at (\d+)% p\.a\./);
  const a = lineOf(context, /^1 April 2024: Bought/);
  const bLine = lineOf(context, /: Bought a second/);
  const costA = amountsIn(a)[0];
  const costB = amountsIn(bLine)[0];
  const fromB = monthAt(bLine);
  const v = (cost: number, from: number, to: number) => valueByFormula(cost, method, rate, from, to);
  const depA1 = costA - v(costA, ON.y2024, ON.y2025);
  const year2 = v(costA, ON.y2024, ON.y2025) - v(costA, ON.y2024, ON.end) + costB - v(costB, fromB, ON.end);
  return { costA, costB, depA1, year2, provision: depA1 + year2 };
}

const chainProvisionYears = caseTemplate<ProvisionYears>({
  id: 'case-wy-chain-provision-for-depreciation',
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: 'Two years of machinery with a provision for depreciation',
  setup: (rng) =>
    attempt(30, () => {
      const b = business(rng, 30);
      const method = rng.pick<Method>(['slm', 'wdv']);
      const rate = rng.pick([10, 15, 20]);
      const costA = amount(rng, 200000, 600000, 20000);
      const costB = amount(rng, 100000, 300000, 20000);
      const kB = rng.pick([3, 4, 6, 7, 9]);
      const depA1 = pct(costA, rate);
      const depA2 = pct(method === 'slm' ? costA : costA - depA1, rate);
      const depB = (costB * rate * (12 - kB)) / 1200;
      if (![depA1, depA2, depB].every(clean) || costA === costB) return null;
      const entries = [
        { date: '1 April 2024', lines: [dr('machinery', costA), cr('bank', costA)], text: 'Bought the first machine by cheque.', why: ['A machine is a fixed asset: Machinery A/c is debited at cost.', 'Bank A/c is credited.'] },
        {
          date: '31 March 2025',
          lines: [dr('depreciation', depA1), cr('provisionForDepreciation', depA1)],
          text: 'Depreciation for the first year.',
          why: [`${inr(costA)} x ${rate}/100 = ${inr(depA1)}.`, 'Depreciation A/c is debited; Machinery A/c stays at cost, so Provision for Depreciation A/c is credited.'],
        },
        { date: dayOf(kB), lines: [dr('machinery', costB), cr('bank', costB)], text: 'Bought the second machine by cheque.', why: ['Machinery A/c is debited at the cost of the second machine.', 'Bank A/c is credited.'] },
        {
          date: YEAR_END,
          lines: [dr('depreciation', depA2 + depB), cr('provisionForDepreciation', depA2 + depB)],
          text: 'Depreciation for the second year.',
          why: [
            method === 'slm'
              ? `First machine, on its cost: ${inr(costA)} x ${rate}/100 = ${inr(depA2)}.`
              : `First machine, on its written down value (cost less the provision on it): (${inr(costA)} - ${inr(depA1)}) x ${rate}/100 = ${inr(depA2)}.`,
            `Second machine, ${monthsWord(12 - kB)} from ${dayOf(kB)}: ${inr(costB)} x ${rate}/100 x ${12 - kB}/12 = ${inr(depB)}. In all ${inr(depA2 + depB)}.`,
            'Depreciation A/c is debited and Provision for Depreciation A/c credited.',
          ],
        },
      ];
      return { b, method, rate, costA, costB, kB, depA1, depA2, depB, entries };
    }),
  context: (s) =>
    [
      `${s.b.owner} runs ${s.b.trade} in ${s.b.city}; the year ends on 31 March.`,
      `1 April 2024: Bought ${an(s.b.machine)} for ${inr(s.costA)} by cheque.`,
      `${dayOf(s.kB)}: Bought a second ${s.b.machine} for ${inr(s.costB)} by cheque.`,
      `Depreciation is charged at ${s.rate}% p.a. on the ${s.method === 'slm' ? 'original cost' : 'written down value'}, for the months of use, and credited to Provision for Depreciation A/c; Machinery A/c stays at cost.`,
    ].join('\n'),
  parts: [
    {
      kind: 'journal_set',
      make: (s): CaseSetParts => ({
        task: `Journalise the machinery transactions and the depreciation of the two years ended ${YEAR_END}.`,
        transactions: s.entries.map((e) => ({ date: e.date, text: e.text, lines: e.lines, explanation: e.why })),
        hints: ['With a provision account, depreciation is never credited to Machinery A/c.', 'The second machine is depreciated only for its months of use.'],
        distractorAccounts: ['machinery', 'profitAndLoss', 'cash'],
      }),
      verify: (q: JournalSetQuestion) => {
        const c = readProvisionYears(q.context);
        const has = (d: string, k: string, x: number) => q.entries.some((e) => e.expected.length === 2 && e.expected.some((l) => l.side === 'Dr' && l.accountId === d && near(l.amount, x)) && e.expected.some((l) => l.side === 'Cr' && l.accountId === k && near(l.amount, x)));
        return q.entries.length === 4 && has('machinery', 'bank', c.costA) && has('machinery', 'bank', c.costB) && has('depreciation', 'provisionForDepreciation', c.depA1) && has('depreciation', 'provisionForDepreciation', c.year2);
      },
    },
    {
      kind: 'account',
      make: (s): CaseAccountParts => ({
        task: `Prepare Provision for Depreciation A/c for the two years ended ${YEAR_END}. Balance it on each 31 March and bring the balance down on each 1 April.`,
        title: 'Provision for Depreciation A/c',
        ...ledgerPeriods(
          s.entries,
          'provisionForDepreciation',
          [
            { closeOn: '31 March 2025', reopenOn: '1 April 2025', title: 'Year ended 31 March 2025' },
            { closeOn: YEAR_END, reopenOn: '1 April 2026', title: `Year ended ${YEAR_END}` },
          ],
        ),
        distractors: ['Machinery A/c', 'Bank A/c', 'Profit and Loss A/c', 'Provision for Depreciation A/c'],
        explanation: [
          `Year ended 31 March 2025: the depreciation is credited, "By Depreciation A/c ${inr(s.depA1)}", and carried down as the balance.`,
          `Year ended ${YEAR_END}: "By Balance b/d ${inr(s.depA1)}" and "By Depreciation A/c ${inr(s.depA2 + s.depB)}". The balance, ${inr(s.depA1 + s.depA2 + s.depB)}, is carried down and brought down on 1 April 2026.`,
          'The purchases of the machines go to Machinery A/c, which stays at cost: they have no row here.',
        ],
        hints: ['The provision collects every year\'s depreciation; it is a credit balance.', 'Only the depreciation entries touch this account.'],
      }),
      verify: (q: AccountQuestion) => {
        const c = readProvisionYears(q.context);
        if (q.later?.length !== 1) return false;
        const r = (x: number) => Math.round(x);
        return (
          rowsAre(q.sides[0].rows, [[BALANCE_CD, r(c.depA1)]], BALANCE_CD) &&
          rowsAre(q.sides[1].rows, [['Depreciation A/c', r(c.depA1)]]) &&
          rowsAre(q.later[0][0], [[BALANCE_CD, r(c.provision)]], BALANCE_CD) &&
          rowsAre(q.later[0][1], [[BALANCE_BD, r(c.depA1)], ['Depreciation A/c', r(c.year2)]]) &&
          rowsAre(q.sides[1].below, [[BALANCE_BD, r(c.provision)]])
        );
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const prov = s.depA1 + s.depA2 + s.depB;
        return num(
          `At what net figure is machinery shown in the balance sheet on ${YEAR_END}?`,
          s.costA + s.costB - prov,
          [
            [s.costA + s.costB, 'Showed machinery at cost without deducting the provision.'],
            [s.costA + s.costB - s.depA2 - s.depB, 'Deducted only the depreciation of the second year.'],
            [s.costA + s.costB - s.depA1 - s.depA2 - pct(s.costB, s.rate), 'Charged a full year on the second machine.'],
            [s.costA - prov, 'Left out the second machine.'],
          ],
          [`Machinery at cost = ${inr(s.costA)} + ${inr(s.costB)} = ${inr(s.costA + s.costB)}.`, `Less: provision for depreciation ${inr(prov)}.`, `Net figure = ${inr(s.costA + s.costB - prov)}.`],
          ['Machinery is shown at cost, less the provision for depreciation.', 'The provision holds the depreciation of both years.'],
        );
      },
      verify: (q) => {
        const c = readProvisionYears(q.context);
        return near(q.answer, c.costA + c.costB - c.provision);
      },
    },
  ],
});

const cases: CaseTemplate[] = [
  newMachineAndDebtors, errorsAfterTb, soldDuringYear, bankAtYearEnd, ownerYear, booksYear, insideTb, accrualsAndCommission, methodsAndProfit, capitalComparison,
  doubtfulTwoYears, provisionAndReserve, fireLoss, capitalOrRevenue, cashOrAccrual, atCost,
  chainSuspense, chainCapital, chainMachineSale, chainDoubtful, chainBank, chainAdjusting, chainBankFinal, chainErrorsFinal, chainLedgerToProfit, chainProvisionYears,
];

export default cases;
