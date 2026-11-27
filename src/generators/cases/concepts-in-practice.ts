/**
 * Case studies of the Theory Base of Accounting: one business and the decisions its accountant took, each to be named
 * as the concept, assumption or principle it follows or breaks, as the board's case-based questions ask; and the
 * figures those concepts decide (accrual profit, stock at the lower of cost and net realisable value, the cost of an
 * asset). They stay outside the mock papers (`STAGES_OUTSIDE_PAPERS` in learning/paperBlueprints.ts).
 *
 * Conventions, stated in the case text where a question relies on them: the year ends on 31 March; GST paid on an asset
 * is claimed as input tax credit; stock is valued lot by lot; there were no outstanding, prepaid, accrued or advance
 * items at the start of the year. Every typed part is worked out again by its `verify` from the printed case text, and
 * every naming part finds its decision again in the bank by its wording.
 */
import type { McqQuestion } from '@/content/types';
import type { Rng } from '@/engine/rng';
import { parseRupees } from '@/lib/money-input';
import { caseTemplate, formatINR, rupees } from '../authoring';
import type { CaseTemplate, Distractor } from '../types';

const TOPIC = 'theory-base';
const CONCEPT = 'thb-case';
const common = { topicId: TOPIC, conceptId: CONCEPT };

/** A rupee figure as the case prints it. */
const inr = (r: number): string => formatINR(rupees(r));
/** The case text a question was made from. */
const ctx = (q: { context?: string }): string => q.context ?? '';
const RUPEE_G = /₹\d(?:[\d,]*\d)?/g;
/** Every rupee figure of a line, in whole rupees. */
const amountsIn = (line: string): number[] => (line.match(RUPEE_G) ?? []).map((m) => (parseRupees(m) ?? NaN) / 100);
/** The line of the case text that starts with `start`. */
const lineOf = (text: string, start: string): string => text.split('\n').find((l) => l.startsWith(start)) ?? '';
const correctText = (q: McqQuestion): string | undefined => q.options.find((o) => o.id === q.correct)?.text;

/** The answer and its common errors in paise, without a slip that is the answer, a repeat or not above nil. */
function numeric(answer: number, errs: [number, string][]): { answer: number; commonErrors: { value: number; why: string }[] } | null {
  if (!(answer > 0) || !Number.isInteger(answer)) return null;
  const seen = new Set([answer]);
  const commonErrors = errs.filter(([v]) => v > 0 && Number.isInteger(v) && !seen.has(v) && seen.add(v)).map(([v, why]) => ({ value: rupees(v), why }));
  return commonErrors.length >= 2 ? { answer: rupees(answer), commonErrors } : null;
}

// ---------------------------------------------------------------------------------------------------------------
// The concepts, as the options name them
// ---------------------------------------------------------------------------------------------------------------

type Pr =
  | 'entity' | 'money' | 'goingConcern' | 'period' | 'disclosure' | 'materiality' | 'prudence'
  | 'cost' | 'matching' | 'dual' | 'revenue' | 'objectivity' | 'consistency' | 'accrual';

const NAME: Record<Pr, string> = {
  entity: 'Business entity',
  money: 'Money measurement',
  goingConcern: 'Going concern (AS-1 assumption)',
  period: 'Accounting period',
  disclosure: 'Full disclosure',
  materiality: 'Materiality',
  prudence: 'Prudence (conservatism)',
  cost: 'Historical cost',
  matching: 'Matching',
  dual: 'Dual aspect',
  revenue: 'Revenue recognition',
  objectivity: 'Verifiable objectivity',
  consistency: 'Consistency (AS-1 assumption)',
  accrual: 'Accrual (AS-1 assumption)',
};
const GIST: Record<Pr, string> = {
  entity: 'keeping the owner\'s affairs apart from the business',
  money: 'recording only what can be stated in money',
  goingConcern: 'assuming the business will carry on',
  period: 'finding the result for a fixed period such as a year',
  disclosure: 'telling readers every fact that could matter to them',
  materiality: 'giving strict treatment only to items large enough to matter',
  prudence: 'providing for likely losses but not anticipating gains',
  cost: 'keeping assets at what was paid for them',
  matching: 'setting a period\'s expenses against that period\'s revenue',
  dual: 'recording both sides of every transaction',
  revenue: 'counting revenue only when it is earned, generally on delivery',
  objectivity: 'entering only what evidence supports',
  consistency: 'using the same methods year after year',
  accrual: 'recording items when earned or incurred, not when cash moves',
};
/** The ones a student most often takes each one for. */
const CONFUSED: Record<Pr, Pr[]> = {
  entity: ['dual', 'money', 'objectivity', 'disclosure', 'matching'],
  money: ['objectivity', 'cost', 'entity', 'materiality', 'disclosure'],
  goingConcern: ['matching', 'period', 'cost', 'prudence', 'consistency'],
  period: ['goingConcern', 'matching', 'accrual', 'consistency', 'revenue'],
  disclosure: ['materiality', 'prudence', 'consistency', 'objectivity', 'accrual'],
  materiality: ['disclosure', 'prudence', 'matching', 'cost', 'money'],
  prudence: ['cost', 'matching', 'revenue', 'disclosure', 'consistency'],
  cost: ['objectivity', 'prudence', 'money', 'goingConcern', 'matching'],
  matching: ['accrual', 'period', 'revenue', 'prudence', 'goingConcern'],
  dual: ['entity', 'money', 'cost', 'objectivity', 'accrual'],
  revenue: ['accrual', 'matching', 'prudence', 'period', 'objectivity'],
  objectivity: ['cost', 'money', 'disclosure', 'consistency', 'dual'],
  consistency: ['period', 'disclosure', 'goingConcern', 'accrual', 'materiality'],
  accrual: ['matching', 'revenue', 'period', 'goingConcern', 'consistency'],
};
/** Far from most decisions: to top up the wrong options of one whose close neighbours would fit it too. */
const FAR: Pr[] = ['dual', 'money', 'period', 'materiality', 'entity', 'consistency'];

// ---------------------------------------------------------------------------------------------------------------
// 1. Followed or broken: four decisions of one business
// ---------------------------------------------------------------------------------------------------------------

interface Biz {
  name: string;
  kind: string;
  owner: string;
  asset: string;
}
const BUSINESSES: Biz[] = [
  { name: 'Joshi Bakery, Nagpur', kind: 'a bakery', owner: 'Prakash Joshi', asset: 'the new oven' },
  { name: 'Kaveri Agro Inputs, Mandya', kind: 'a shop selling seeds and fertilisers', owner: 'Kaveri Gowda', asset: 'the storage shed' },
  { name: 'Lakshmi Sweets, Madurai', kind: 'a sweet shop', owner: 'Lakshmi Sundaram', asset: 'the display counters' },
  { name: 'Qureshi Footwear, Agra', kind: 'a footwear shop', owner: 'Imran Qureshi', asset: 'the shop furniture' },
  { name: 'Bhatia Garments, Jalandhar', kind: 'a small garment maker', owner: 'Simran Bhatia', asset: 'the stitching machines' },
  { name: 'Ansari Furniture Works, Moradabad', kind: 'a small furniture workshop', owner: 'Salim Ansari', asset: 'the wood-cutting machine' },
  { name: 'Mehta Electricals, Rajkot', kind: 'a shop selling electrical goods', owner: 'Nisha Mehta', asset: 'the delivery van' },
];

/** A round amount, one and a half times it, a few hundred rupees, and the price of land or a building (and its rise). */
interface Amounts {
  x: string;
  y: string;
  z: string;
  w: string;
  v: string;
}
type Verdict = 'follows' | 'breaks';
interface Decision {
  a: Pr;
  v: Verdict;
  text: (b: Biz, m: Amounts) => string;
  /** Why the answer is right, in a phrase. */
  point: string;
  /** Concepts that would also fit, which must not be offered as wrong options. */
  skip?: Pr[];
}

const DECISIONS: Decision[] = [
  { a: 'entity', v: 'follows', point: 'a private debt of the owner is not a debt of the business',
    text: (b, m) => `An instalment of ${m.x} on ${b.owner}'s private car loan was paid from ${b.owner}'s own bank account and was not recorded in the books of the business.` },
  { a: 'entity', v: 'breaks', point: 'the owner\'s family expense is drawings, not a wage of the business',
    text: (b, m) => `${b.owner} took ${m.x} from the cash box to pay for a family wedding, and the accountant debited it to Wages A/c.` },
  { a: 'money', v: 'follows', skip: ['objectivity'], point: 'the skill and loyalty of the staff cannot be stated in money',
    text: () => 'The books say nothing about the loyal and skilled staff, though customers keep coming back because of them.' },
  { a: 'goingConcern', v: 'follows', skip: ['matching', 'cost'], point: 'the business is expected to carry on, so the cost is spread over the years of use',
    text: (b, m) => `The cost of ${b.asset}, ${m.x}, is spread over the ten years it will be used, and not charged in one year.` },
  { a: 'period', v: 'follows', point: 'the result is found for each year without waiting for the business to end',
    text: () => 'The books are closed on 31 March every year and the profit of that year is worked out.' },
  { a: 'period', v: 'breaks', skip: ['goingConcern'], point: 'profit must be found at regular intervals, not only when the business ends',
    text: (b) => `${b.owner} wants the profit worked out only when the business is finally sold, so no yearly accounts are prepared.` },
  { a: 'disclosure', v: 'follows', skip: ['prudence', 'materiality'], point: 'a fact that could change a reader\'s view is told in a note',
    text: (_b, m) => `A customer has filed a claim of ${m.y} against the business; the case is pending, and a note to the accounts tells readers about it.` },
  // Materiality is left out: a pledge of the stock is a material fact, so "breaks materiality" could be defended too.
  { a: 'disclosure', v: 'breaks', skip: ['materiality'], point: 'a pledge of the stock is a fact the readers must be told',
    text: (_b, m) => `The stock is pledged with a bank against a loan of ${m.x}, but the balance sheet does not mention the pledge.` },
  { a: 'materiality', v: 'follows', skip: ['matching', 'prudence'], point: 'an amount this small is not worth spreading over several years',
    text: (_b, m) => `A stapler costing ${m.z} that will last for years was charged to expenses at once.` },
  { a: 'prudence', v: 'follows', skip: ['cost'], point: 'a likely loss on the stock is provided for',
    text: (_b, m) => `Stock that cost ${m.y} would now sell for only ${m.x}, so it is shown at ${m.x}.` },
  { a: 'prudence', v: 'breaks', skip: ['cost'], point: 'a fall in the value of the stock must be provided for',
    text: (_b, m) => `Stock that cost ${m.y} would now sell for only ${m.x}, but it is still shown at ${m.y}.` },
  { a: 'cost', v: 'follows', skip: ['objectivity', 'prudence', 'goingConcern', 'consistency'], point: 'the land stays at what was paid for it',
    text: (_b, m) => `Land bought for ${m.w} some years ago is still shown at ${m.w}, though similar land now sells for ${m.v}.` },
  { a: 'cost', v: 'breaks', skip: ['objectivity', 'prudence', 'consistency'], point: 'a rise in market price is not entered in the books',
    text: (_b, m) => `The accountant raised the value of the building from ${m.w} to ${m.v} because property prices in the area have gone up.` },
  { a: 'matching', v: 'follows', skip: ['accrual', 'period'], point: 'the salaries helped earn this year\'s revenue, so they are set against it',
    text: (_b, m) => `Salaries of ${m.x} for March, to be paid in April, were charged against the revenue of the year ended 31 March.` },
  { a: 'matching', v: 'breaks', skip: ['accrual', 'period'], point: 'the commission was an expense of earning this year\'s sales',
    text: (_b, m) => `Commission of ${m.x} on the sales of March was charged to the next year, when it was paid.` },
  { a: 'dual', v: 'follows', skip: ['entity'], point: 'both the cash received and the rise in capital are recorded',
    text: (b, m) => `When ${b.owner} brought in ${m.x} as further capital, the books recorded both the cash received and the increase in capital.` },
  { a: 'revenue', v: 'follows', skip: ['accrual', 'matching', 'prudence', 'period'], point: 'an advance is not revenue until the goods are delivered',
    text: (_b, m) => `An advance of ${m.x} for an order to be delivered in April was not counted in the revenue of the year ended 31 March.` },
  { a: 'revenue', v: 'breaks', skip: ['accrual', 'matching', 'prudence'], point: 'an order is not a sale; revenue is recognised on delivery',
    text: (_b, m) => `An order worth ${m.y} received on 30 March was recorded as revenue of March, though it will be delivered in April.` },
  { a: 'objectivity', v: 'follows', skip: ['cost'], point: 'the entry rests on a document anyone can check',
    text: (_b, m) => `A cash purchase of ${m.x} was entered only after the accountant had seen the supplier's bill.` },
  { a: 'objectivity', v: 'breaks', skip: ['cost'], point: 'an entry needs a bill or receipt, not memory',
    text: (b, m) => `A receipt of ${m.x} was entered on the strength of what ${b.owner} remembered, with no bill or receipt to support it.` },
  { a: 'consistency', v: 'follows', point: 'the same method keeps the years comparable',
    text: (b) => `Depreciation on ${b.asset} was charged by the same method as in earlier years.` },
  { a: 'consistency', v: 'breaks', skip: ['disclosure'], point: 'a method is not changed from year to year just to raise the profit',
    text: () => 'The method of valuing stock was changed this year only because the new method shows a higher profit.' },
  { a: 'accrual', v: 'follows', skip: ['matching', 'revenue'], point: 'an expense is recorded when it is incurred, whatever the date of payment',
    text: (_b, m) => `Rent of ${m.x} for March, to be paid on 5 April, was recorded as an expense of March.` },
  { a: 'accrual', v: 'breaks', skip: ['matching', 'revenue', 'period'], point: 'income earned in the year belongs to the year, even if the cash comes later',
    text: (_b, m) => `Commission of ${m.x} earned in March but received in April was left out of the income of the year ended 31 March.` },
];

const LETTERS = ['a', 'b', 'c', 'd'] as const;
const PLACE: Amounts = { x: '₹#', y: '₹#', z: '₹#', w: '₹#', v: '₹#' };
const masked = (t: string): string => t.replace(RUPEE_G, '₹#');
const verdictText = (v: Verdict, p: Pr): string => `${v === 'follows' ? 'Follows' : 'Breaks'}: ${NAME[p]}`;

/** The decisions printed in the case, found again in the bank by their wording, in the order (a) to (d). */
function decisionsIn(text: string): (Decision | undefined)[] {
  const biz = BUSINESSES.find((b) => text.startsWith(b.name));
  if (!biz) return [];
  return LETTERS.map((l) => {
    const line = masked(lineOf(text, `(${l}) `).slice(4));
    const hits = DECISIONS.filter((d) => d.text(biz, PLACE) === line);
    return hits.length === 1 ? hits[0] : undefined;
  });
}

/** The options of a naming part: the right verdict and concept, the other verdict, and two concepts it is taken for. */
function namingOptions(d: Decision): { correct: string; distractors: Distractor[] } {
  const fits = [d.a, ...(d.skip ?? [])];
  const close = CONFUSED[d.a].filter((p) => !fits.includes(p));
  const far = FAR.filter((p) => !fits.includes(p) && !close.includes(p)).slice(0, Math.max(0, 3 - close.length));
  const other: Verdict = d.v === 'follows' ? 'breaks' : 'follows';
  return {
    correct: verdictText(d.v, d.a),
    distractors: [
      {
        text: verdictText(other, d.a),
        why: d.v === 'follows'
          ? `Named the right concept but judged it broken; the decision does what the concept asks: ${d.point}.`
          : `Named the right concept but judged it followed; the decision goes against it: ${d.point}.`,
      },
      // Exactly three, so the engine keeps them all: the other verdict is always offered, and the verdict is judged.
      ...[...close, ...far].slice(0, 2).map((p) => ({
        text: verdictText(d.v, p),
        why: `Took it for ${NAME[p]}, which is about ${GIST[p]}. Here the point is that ${d.point}.`,
      })),
    ],
  };
}

const NAMING_HINTS = [
  'Find the one idea the decision turns on: whose money, can it be stated in money, which year, what was paid, a likely loss, delivery, evidence, the same method?',
  'Name the concept that is about that idea; then ask whether the accountant did what it asks (follows) or the opposite (breaks).',
];

interface FourDecisions {
  biz: Biz;
  picks: Decision[];
  amounts: Amounts[];
}

const followedOrBroken = caseTemplate<FourDecisions>({
  id: 'case-thb-followed-or-broken',
  ...common,
  difficulty: 'medium',
  title: 'Four decisions: followed or broken?',
  setup: (rng: Rng) => {
    const biz = rng.pick(BUSINESSES);
    // One or three of the four are broken, so that the count asked at the end is never 2 (where the slip of counting
    // the followed ones would give the right number). Four different concepts, in an order drawn from the seed.
    const broken = rng.pick([1, 3]);
    const picks: Decision[] = [];
    const room = (v: Verdict) => (v === 'breaks' ? broken : 4 - broken) > picks.filter((p) => p.v === v).length;
    for (const d of rng.shuffle(DECISIONS)) {
      if (picks.length === 4) break;
      if (!picks.some((p) => p.a === d.a) && room(d.v)) picks.push(d);
    }
    if (picks.length < 4) return null;
    const amounts = picks.map(() => {
      const x = rng.step(10000, 150000, 5000);
      const w = rng.step(500000, 3000000, 100000);
      return { x: inr(x), y: inr((x * 3) / 2), z: inr(rng.pick([90, 120, 150, 250, 350])), w: inr(w), v: inr((w * 3) / 2) };
    });
    return { biz, picks, amounts };
  },
  context: (s) =>
    [
      `${s.biz.name} is ${s.biz.kind} owned by ${s.biz.owner}. Its accountant took these decisions in the year ended 31 March:`,
      ...s.picks.map((d, i) => `(${LETTERS[i]}) ${d.text(s.biz, s.amounts[i])}`),
    ].join('\n'),
  parts: [
    ...LETTERS.map((l, i) => ({
      kind: 'mcq' as const,
      make: (s: FourDecisions) => {
        const d = s.picks[i];
        return {
          prompt: `Decision (${l}): does it follow or break a concept, assumption or principle of accounting, and which?`,
          ...namingOptions(d),
          explanation: `${verdictText(d.v, d.a)}: ${d.point}.`,
          hints: NAMING_HINTS,
        };
      },
      verify: (q: McqQuestion) => {
        const d = decisionsIn(ctx(q))[i];
        return d !== undefined && correctText(q) === verdictText(d.v, d.a);
      },
    })),
    {
      kind: 'numeric',
      unit: 'number',
      make: (s) => {
        const broken = s.picks.filter((d) => d.v === 'breaks').length;
        return {
          prompt: `How many of the four decisions break a concept, assumption or principle, and so should be put right?`,
          answer: broken,
          commonErrors: [
            { value: 4 - broken, why: 'Counted the decisions that follow a concept instead of those that break one.' },
            { value: 4, why: 'Counted every decision, though some of them do just what a concept asks.' },
          ],
          explanation: [
            ...s.picks.map((d, i) => `(${LETTERS[i]}) ${verdictText(d.v, d.a)}.`),
            `Decisions that break a concept: ${broken}.`,
          ],
          hints: ['Go through (a) to (d) and mark each one "follows" or "breaks".', 'A decision breaks a concept when the accountant did the opposite of what it asks; count only those.'],
        };
      },
      verify: (q) => {
        const found = decisionsIn(ctx(q));
        if (found.some((d) => d === undefined)) return false;
        return q.answer === found.filter((d) => d!.v === 'breaks').length;
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 2. A service business on the accrual basis: income, expenses and profit, and the concepts behind them
// ---------------------------------------------------------------------------------------------------------------

interface Service {
  name: string;
  owner: string;
  fees: string;
  personal: string;
}
const SERVICES: Service[] = [
  { name: 'Bright Minds Coaching, Patna', owner: 'Ritu Sinha', fees: 'Tuition fees', personal: 'electricity bill of the owner\'s home' },
  { name: 'Thomas Dental Clinic, Kochi', owner: 'Dr. Ann Thomas', fees: 'Fees from patients', personal: 'school fees of the owner\'s son' },
  { name: 'Nair Driving School, Thrissur', owner: 'Suresh Nair', fees: 'Training fees', personal: 'house rent of the owner\'s family' },
  { name: 'Kapoor Fitness Studio, Chandigarh', owner: 'Neha Kapoor', fees: 'Membership fees', personal: 'family holiday of the owner' },
  { name: 'Rao Computer Classes, Vijayawada', owner: 'Kiran Rao', fees: 'Course fees', personal: 'insurance premium on the owner\'s life' },
];

interface Accrual {
  sv: Service;
  received: number;
  advance: number;
  due: number;
  paid: number;
  prepaid: number;
  outstanding: number;
  personal: number;
}

const accrualCase = caseTemplate<Accrual>({
  id: 'case-thb-accrual-profit',
  ...common,
  difficulty: 'medium',
  title: 'A service business on the accrual basis',
  setup: (rng: Rng) => {
    const s: Accrual = {
      sv: rng.pick(SERVICES),
      received: rng.step(400000, 900000, 10000),
      advance: rng.step(10000, 60000, 5000),
      due: rng.step(10000, 60000, 5000),
      paid: rng.step(150000, 350000, 10000),
      prepaid: rng.step(5000, 30000, 1000),
      outstanding: rng.step(5000, 40000, 1000),
      personal: rng.step(3000, 25000, 1000),
    };
    // Equal figures would let two different slips give the same number.
    if (s.advance === s.due || s.prepaid === s.outstanding || s.personal === s.prepaid || s.personal === s.outstanding) return null;
    return s;
  },
  context: (s) =>
    [
      `${s.sv.name} is run by ${s.sv.owner} and keeps its accounts on the accrual basis. Its cash records for the year ended 31 March show:`,
      `${s.sv.fees} received: ${inr(s.received)}, which includes ${inr(s.advance)} received in advance for next year`,
      `${s.sv.fees} earned in March, still to be received: ${inr(s.due)}`,
      `Expenses paid: ${inr(s.paid)}, which include ${inr(s.prepaid)} of rent paid in advance for next year and ${inr(s.personal)} paid for the ${s.sv.personal}`,
      `Salaries for March, unpaid at 31 March: ${inr(s.outstanding)}`,
      'There were no amounts due, owing or paid in advance at the start of the year.',
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const income = s.received - s.advance + s.due;
        const n = numeric(income, [
          [s.received, 'Took the fees received in cash as the income of the year.'],
          [s.received + s.due, 'Added the fees still to come but left in the fees received in advance, which are not yet earned.'],
          [s.received - s.advance, 'Took out the advance but left out the fees earned in March and still to be received.'],
          [s.received + s.advance + s.due, 'Added the advance instead of taking it out.'],
        ]);
        return n && {
          prompt: `What is the income from fees for the year on the accrual basis?`,
          ...n,
          explanation: [
            'Income of the year = fees received - received in advance for next year + earned but not yet received.',
            `${inr(s.received)} - ${inr(s.advance)} + ${inr(s.due)} = ${inr(income)}.`,
          ],
          hints: ['Which fees were earned in this year, whenever the cash came?', 'Take out the advance (not yet earned) and add the fees earned in March but still to come.'],
        };
      },
      verify: (q) => {
        const t = ctx(q);
        const [received, advance] = amountsIn(t.split('\n')[1]);
        const [due] = amountsIn(t.split('\n')[2]);
        return q.answer === rupees(received - advance + due);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const expenses = s.paid - s.prepaid - s.personal + s.outstanding;
        const n = numeric(expenses, [
          [s.paid - s.prepaid + s.outstanding, `Left the ${s.sv.personal} among the expenses; it is the owner's, so it is drawings.`],
          [s.paid - s.personal + s.outstanding, 'Left in the rent paid for next year, which is a prepaid expense of next year.'],
          [s.paid - s.prepaid - s.personal, 'Left out the unpaid salaries for March, which were incurred this year.'],
          [s.paid, 'Took the expenses paid in cash as the expenses of the year.'],
        ]);
        return n && {
          prompt: `What are the expenses of the business for the year on the accrual basis?`,
          ...n,
          explanation: [
            `The ${s.sv.personal} is the owner's own expense: drawings, not an expense of the business (business entity).`,
            'Expenses of the year = expenses paid - paid in advance for next year - drawings + outstanding.',
            `${inr(s.paid)} - ${inr(s.prepaid)} - ${inr(s.personal)} + ${inr(s.outstanding)} = ${inr(expenses)}.`,
          ],
          hints: ['Which of the payments were costs of running the business in this year?', 'Take out the rent paid for next year and the owner\'s private bill (drawings); add the unpaid salaries for March.'],
        };
      },
      verify: (q) => {
        const t = ctx(q);
        const [paid, prepaid, personal] = amountsIn(t.split('\n')[3]);
        const [outstanding] = amountsIn(t.split('\n')[4]);
        return q.answer === rupees(paid - prepaid - personal + outstanding);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const income = s.received - s.advance + s.due;
        const expenses = s.paid - s.prepaid - s.personal + s.outstanding;
        const profit = income - expenses;
        const n = numeric(profit, [
          [s.received - s.paid, 'Gave the cash-basis profit: cash received less cash paid.'],
          [profit - s.personal, 'Charged the owner\'s private bill as an expense of the business.'],
          [s.received - s.advance - (s.paid - s.prepaid - s.personal), 'Left out the fees still to come and the unpaid salaries, which both belong to this year.'],
          [profit + 2 * s.advance, 'Added the advance fees to the income instead of taking them out.'],
        ]);
        return n && {
          prompt: `What is the profit of the year on the accrual basis?`,
          ...n,
          explanation: [
            `Income = ${inr(s.received)} - ${inr(s.advance)} + ${inr(s.due)} = ${inr(income)}.`,
            `Expenses = ${inr(s.paid)} - ${inr(s.prepaid)} - ${inr(s.personal)} + ${inr(s.outstanding)} = ${inr(expenses)}.`,
            `Profit = ${inr(income)} - ${inr(expenses)} = ${inr(profit)}.`,
          ],
          hints: ['Work out the income of the year and the expenses of the year first.', 'Profit = income earned in the year - expenses incurred in the year; the owner\'s private bill is drawings and is not charged.'],
        };
      },
      verify: (q) => {
        const lines = ctx(q).split('\n');
        const [received, advance] = amountsIn(lines[1]);
        const [due] = amountsIn(lines[2]);
        const [paid, prepaid, personal] = amountsIn(lines[3]);
        const [outstanding] = amountsIn(lines[4]);
        return q.answer === rupees(received - advance + due - (paid - prepaid - personal + outstanding));
      },
    },
    {
      kind: 'mcq',
      make: (s) => ({
        prompt: `The accountant leaves the ${inr(s.advance)} received in advance out of the income of the year. Which principle does this follow?`,
        correct: 'Revenue recognition',
        distractors: [
          { text: 'Historical cost', why: 'Historical cost is about recording assets at what was paid for them, not about when income is earned.' },
          { text: 'Business entity', why: 'Business entity keeps the owner\'s affairs apart; the advance is the business\'s own receipt.' },
          { text: 'Money measurement', why: 'The advance can be stated in money; the question is when it becomes income.' },
          { text: 'Dual aspect', why: 'Dual aspect is about recording both sides of the receipt, not about which year it is income of.' },
        ],
        explanation: 'Revenue recognition: revenue is counted when it is earned, by giving the service. Until then the advance is a liability, income received in advance.',
        hints: ['Has the business done anything yet for the advance?', 'Revenue is counted only when it is earned; money received for a service still to be given is a liability until then.'],
      }),
    },
    {
      kind: 'mcq',
      make: (s) => ({
        prompt: `The ${s.sv.personal} (${inr(s.personal)}) was paid out of the cash of ${s.sv.name}. How is it treated, and which concept decides it?`,
        correct: 'As drawings of the owner, under the business entity concept',
        distractors: [
          { text: 'As an expense of the business, under the matching concept', why: 'Matching sets the business\'s own costs against its revenue; this bill earned the business nothing.' },
          { text: 'As drawings of the owner, under the prudence principle', why: 'The treatment is right, but it is the separation of owner and business that decides it, not prudence.' },
          { text: 'As an expense of the business, under the accrual assumption', why: 'Accrual decides when an expense is recorded, not whether a private bill is the business\'s expense at all.' },
          { text: 'As capital brought in, under the dual aspect concept', why: 'Money taken out for the owner reduces capital; it is not capital brought in.' },
        ],
        explanation: 'Business entity: the business is separate from its owner, so the owner\'s private bill paid from business cash is drawings and reduces capital; it is not an expense.',
        hints: ['Whose bill is it: the business\'s or the owner\'s?', 'A private bill of the owner paid by the business is drawings, because the business and its owner are kept apart.'],
      }),
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 3. The year end of a trader: stock, a new machine, land and the stock method
// ---------------------------------------------------------------------------------------------------------------

interface Trader {
  name: string;
  lots: [string, string, string];
  machine: string;
}
const TRADERS: Trader[] = [
  { name: 'Anand Textiles, Surat', lots: ['sarees', 'shirting cloth', 'towels'], machine: 'a cloth-folding machine' },
  { name: 'Iyer Hardware, Coimbatore', lots: ['pipes and fittings', 'hand tools', 'paints'], machine: 'a pipe-threading machine' },
  { name: 'Patel Kitchenware, Ahmedabad', lots: ['steel utensils', 'pressure cookers', 'mixer grinders'], machine: 'a packing machine' },
  { name: 'Bose Stationery Mart, Kolkata', lots: ['notebooks', 'pens', 'files and folders'], machine: 'a binding machine' },
  { name: 'Reddy Footwear, Hyderabad', lots: ['school shoes', 'sandals', 'sports shoes'], machine: 'a shoe-stitching machine' },
];

interface YearEnd {
  t: Trader;
  cost: [number, number, number];
  nrv: [number, number, number];
  list: number;
  discount: number;
  freight: number;
  install: number;
  amc: number;
  land: number;
  landNow: number;
  changed: boolean;
}

const yearEnd = caseTemplate<YearEnd>({
  id: 'case-thb-year-end-values',
  ...common,
  difficulty: 'complex',
  title: 'The year end of a trader: stock, a machine and land',
  setup: (rng: Rng) => {
    const cost = [0, 1, 2].map(() => rng.step(20000, 120000, 5000)) as [number, number, number];
    const nrv = cost.map((c) => c + rng.pick([-20000, -15000, -10000, -5000, 5000, 10000, 15000])) as [number, number, number];
    const fell = nrv.filter((n, i) => n < cost[i]).length;
    if (fell === 0 || fell === 3 || Math.min(...nrv) < 10000) return null;
    const list = rng.step(100000, 500000, 10000);
    const discount = rng.pick([5, 10, 20]);
    if (((list * discount) / 100) % 1 !== 0) return null;
    const land = rng.step(500000, 2000000, 100000);
    return {
      t: rng.pick(TRADERS),
      cost,
      nrv,
      list,
      discount,
      freight: rng.step(2000, 12000, 500),
      install: rng.step(3000, 15000, 500),
      amc: rng.step(4000, 20000, 1000),
      land,
      landNow: land + rng.step(200000, 1000000, 100000),
      changed: rng.next() < 0.5,
    };
  },
  context: (s) =>
    [
      `${s.t.name} closes its books on 31 March. At the year end:`,
      ...s.t.lots.map((l, i) => `Stock of ${l}: cost ${inr(s.cost[i])}, net realisable value ${inr(s.nrv[i])}`),
      `It bought ${s.t.machine}: list price ${inr(s.list)}, trade discount ${s.discount}%, GST 18% on the price after discount (claimed as input tax credit)`,
      `Freight on the machine ${inr(s.freight)}; installation ${inr(s.install)}; a one-year maintenance contract ${inr(s.amc)}`,
      `Land bought years ago for ${inr(s.land)} would now sell for ${inr(s.landNow)}.`,
      s.changed
        ? 'This year the method of valuing stock was changed only because the new method shows a higher profit, and the accounts say nothing about it.'
        : 'Stock is valued by the same method as in earlier years.',
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const value = s.cost.reduce((t, c, i) => t + Math.min(c, s.nrv[i]), 0);
        const totalCost = s.cost.reduce((a, b) => a + b, 0);
        const totalNrv = s.nrv.reduce((a, b) => a + b, 0);
        const n = numeric(value, [
          [totalCost, 'Valued all the stock at cost, ignoring the lots whose value has fallen.'],
          [totalNrv, 'Valued all the stock at net realisable value, which takes in the gain on the lots that have risen.'],
          [Math.min(totalCost, totalNrv), 'Compared the totals instead of each lot, so a gain on one lot hid a loss on another.'],
          [s.cost.reduce((t, c, i) => t + Math.max(c, s.nrv[i]), 0), 'Took the higher of the two figures for each lot; prudence needs the lower.'],
        ]);
        return n && {
          prompt: 'At what value is the closing stock shown, valuing each lot separately?',
          ...n,
          explanation: [
            'Each lot is valued at the lower of its cost and its net realisable value.',
            ...s.t.lots.map((l, i) => `${l[0].toUpperCase()}${l.slice(1)}: lower of ${inr(s.cost[i])} and ${inr(s.nrv[i])} = ${inr(Math.min(s.cost[i], s.nrv[i]))}.`),
            `Closing stock = ${inr(value)}.`,
          ],
          hints: ['Look at one lot at a time: is it worth more or less than it cost?', 'Take the lower of cost and net realisable value for each lot, then add the three.'],
        };
      },
      verify: (q) => {
        const lines = ctx(q).split('\n').filter((l) => l.startsWith('Stock of '));
        if (lines.length !== 3) return false;
        return q.answer === rupees(lines.reduce((t, l) => { const [c, n] = amountsIn(l); return t + Math.min(c, n); }, 0));
      },
    },
    {
      kind: 'mcq',
      make: () => ({
        prompt: 'Which principle makes the trader show each lot of stock at the lower of its cost and its net realisable value?',
        correct: 'Prudence (conservatism)',
        distractors: [
          { text: 'Matching', why: 'Matching sets the expenses of a period against its revenue; the rule here is to provide for a likely loss.' },
          { text: 'Business entity', why: 'Business entity keeps the owner apart from the business; nothing here concerns the owner.' },
          { text: 'Full disclosure', why: 'Disclosure is about telling readers facts; this is about the value put on the stock.' },
          { text: 'Money measurement', why: 'The stock can be stated in money either way; the question is which figure to use.' },
        ],
        explanation: 'Prudence: a likely loss (a lot worth less than it cost) is provided for at once, but a likely gain is not taken until the goods are sold.',
        hints: ['What happens to a lot that is worth less than it cost, and to one worth more?', 'Likely losses are provided for; likely gains wait. Name the principle that says so.'],
      }),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const net = s.list - (s.list * s.discount) / 100;
        const gst = (net * 18) / 100;
        const cost = net + s.freight + s.install;
        if (!Number.isInteger(gst)) return null;
        const n = numeric(cost, [
          [cost + gst, 'Added the GST, which is claimed back as input tax credit and so is not part of the cost.'],
          [cost + s.amc, 'Added the maintenance contract, a running expense of the year, not a cost of the machine.'],
          [s.list + s.freight + s.install, 'Ignored the trade discount; the cost is the price actually paid.'],
          [net + s.freight, 'Left out the installation, which is needed to make the machine ready to work.'],
        ]);
        return n && {
          prompt: 'Under the historical cost concept, at what cost is the new machine recorded in the books?',
          ...n,
          explanation: [
            `Price after ${s.discount}% trade discount = ${inr(s.list)} - ${inr(s.list - net)} = ${inr(net)}.`,
            `Cost = ${inr(net)} + freight ${inr(s.freight)} + installation ${inr(s.install)} = ${inr(cost)}.`,
            `Not included: GST ${inr(gst)} (claimed as input tax credit) and the maintenance contract ${inr(s.amc)} (a running expense).`,
          ],
          hints: ['Which of the amounts were spent to get the machine and make it ready to work?', 'Cost = price after trade discount + freight + installation; leave out the GST claimed back and the maintenance contract.'],
        };
      },
      verify: (q) => {
        const t = ctx(q);
        const [list] = amountsIn(lineOf(t, 'It bought '));
        const discount = Number(/trade discount (\d+)%/.exec(t)?.[1]);
        const [freight, install] = amountsIn(lineOf(t, 'Freight on the machine'));
        return q.answer === rupees(list - (list * discount) / 100 + freight + install);
      },
    },
    {
      kind: 'mcq',
      make: (s) => ({
        prompt: `The land is shown in the balance sheet at ${inr(s.land)}, not at ${inr(s.landNow)}. Which concept does this follow?`,
        correct: 'Historical cost',
        distractors: [
          { text: 'Money measurement', why: 'Both figures are in money; the point is that the price paid is kept, not the market price.' },
          { text: 'Matching', why: 'Matching sets expenses against revenue; land is not charged against revenue here.' },
          { text: 'Business entity', why: 'The land belongs to the business either way; the question is the figure it is shown at.' },
          { text: 'Dual aspect', why: 'Dual aspect is about the two sides of a transaction; no transaction has taken place.' },
        ],
        explanation: 'Historical cost: an asset stays at the price paid for it; a later rise in its market price is not recorded.',
        hints: ['Which figure is the price the trader actually paid?', 'Assets are kept at what was paid for them; changes in market price are not entered.'],
      }),
    },
    {
      kind: 'mcq',
      make: (s) => s.changed
        ? {
          prompt: 'The method of valuing stock was changed only to show a higher profit, and the change is not disclosed. Which fundamental assumption does this break?',
          correct: 'Consistency',
          distractors: [
            { text: 'Going concern', why: 'Going concern is about the business carrying on; nothing suggests it will close.' },
            { text: 'Accrual', why: 'Accrual decides when items are recorded; the problem is the change of method.' },
            { text: 'Materiality', why: 'Materiality is about the size of an item; here a method was changed to alter the profit.' },
            { text: 'Dual aspect', why: 'Dual aspect is a basic concept, not a fundamental assumption, and is about the two sides of a transaction.' },
          ],
          explanation: 'Consistency: the same methods are used year after year so that results can be compared. A change made only to raise the profit, and not disclosed, breaks it.',
          hints: ['What did the accountant do differently from last year, and why?', 'Changing a method just to alter the profit defeats the comparison of years: name that assumption.'],
        }
        : {
          prompt: 'Stock is valued by the same method as in earlier years. Which fundamental assumption does this follow?',
          correct: 'Consistency',
          distractors: [
            { text: 'Going concern', why: 'Going concern is about the business carrying on, not about keeping the same method.' },
            { text: 'Accrual', why: 'Accrual decides when items are recorded, not which method is used for stock.' },
            { text: 'Materiality', why: 'Materiality is about the size of an item, not about using one method year after year.' },
            { text: 'Dual aspect', why: 'Dual aspect is a basic concept, not a fundamental assumption, and is about the two sides of a transaction.' },
          ],
          explanation: 'Consistency: the same methods are used year after year, so that the results of different years can be compared.',
          hints: ['What stays the same from one year to the next?', 'Using the same method year after year is one of the three fundamental assumptions of AS-1.'],
        },
      verify: (q) => correctText(q) === 'Consistency' && (q.prompt.includes('changed') === ctx(q).includes('was changed')),
    },
  ],
});

const cases: CaseTemplate[] = [followedOrBroken, accrualCase, yearEnd];

export default cases;
