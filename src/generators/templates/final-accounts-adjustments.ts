import type { AccountQuestion, Difficulty, JournalQuestion, JournalSetQuestion, McqQuestion } from '@/content/types';
import { creditor, debtor, resolveAccount } from '@/engine/accounts';
import { listBalances, post, trialBalance, type Ledger } from '@/engine/books';
import type { JournalLine } from '@/engine/journal';
import type { Rng } from '@/engine/rng';
import { parseRupees } from '@/lib/money-input';
import { BEYOND_INTEREST_ON_DRAWINGS } from '@/content/beyondSyllabus';
import { PARTIES, accountTemplate, amount, beyondSyllabus, factsTemplate, crSide, drSide, formatINR as inr, interleave, journalSetTemplate, journalTemplate, keepFor, mcqTemplate, numericTemplate, rupees } from '../authoring';
import type { AccountParts, Distractor, FormatRowParts, JournalParts, McqParts, NumericParts, Template } from '../types';
import { assertionReasonTemplate } from '../assertionReason';

const T = 'final-accounts-adjustments';

// Concepts (defined in the pack file).
const C_TWO = 'faa-two-effects';
const C_OUT = 'faa-outstanding-prepaid';
const C_ACC = 'faa-accrued-advance';
const C_DEP = 'faa-stock-depreciation';
const C_BAD = 'faa-bad-debts';
const C_INT = 'faa-interest';
const C_COM = 'faa-commission';
const C_GDS = 'faa-goods-loss';
const C_NET = 'faa-net-profit';

const FIRMS = [
  'Sharma Traders', 'Kiran Stores', 'Meera Garments', 'Rao Electricals', 'Anita Stationers', 'Gupta Hardware',
  'Lakshmi Fabrics', 'Iqbal Auto Parts', 'Nair Provisions', 'Bose Medical Agency',
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const isWhole = (...xs: number[]) => xs.every((x) => Number.isInteger(x) && x % 100 === 0);
/** `r` percent of an amount in paise (exact for whole-rupee amounts and whole rates). */
const pc = (p: number, r: number) => (p * r) / 100;
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

// ---------------------------------------------------------------------------------------------------------------
// Builders. Every numeric template remembers the values behind the question it has just made, so that `verify` can
// re-derive the answer from them by a different route (a ledger balancing figure, the other basis, and so on) and
// can check that every figure the answer rests on is actually printed in the prompt.
// ---------------------------------------------------------------------------------------------------------------

interface Made<F> {
  parts: NumericParts;
  facts: F;
  /** Amounts (paise) that the prompt must show. */
  shown: number[];
}

function num<F>(
  id: string,
  conceptId: string,
  difficulty: Difficulty,
  generate: (rng: Rng) => Made<F> | null,
  recheck: (facts: F) => number,
) {
  let last: { prompt: string; facts: F; shown: number[] } | undefined;
  return numericTemplate({
    id,
    topicId: T,
    conceptId,
    difficulty,
    unit: 'rupees',
    generate: (rng) => {
      const made = generate(rng);
      if (!made) return null;
      // Reject a seed whose wrong answers collapse into the answer, into each other or to a non-positive figure.
      // Wrong answers that are not whole rupees (a commission worked out on the wrong basis can be) are dropped.
      const seen = new Set([made.parts.answer]);
      const usable = made.parts.commonErrors.filter((e) => Number.isSafeInteger(e.value) && e.value > 0 && e.value % 100 === 0 && !seen.has(e.value) && seen.add(e.value));
      if (usable.length < 2) return null;
      made.parts.commonErrors = usable;
      last ={ prompt: made.parts.prompt, facts: made.facts, shown: made.shown };
      return made.parts;
    },
    verify: (q) =>
      last !== undefined &&
      last.prompt === q.prompt &&
      last.shown.every((x) => q.prompt.includes(inr(x))) &&
      recheck(last.facts) === q.answer,
  });
}

function entry(id: string, conceptId: string, difficulty: Difficulty, generate: (rng: Rng) => JournalParts | null) {
  return journalTemplate({ id, topicId: T, conceptId, difficulty, generate });
}

function mcq(id: string, conceptId: string, difficulty: Difficulty, generate: (rng: Rng) => McqParts | null, verify?: (q: McqQuestion) => boolean) {
  return mcqTemplate({ id, topicId: T, conceptId, difficulty, generate, verify });
}

const wrongs = (xs: [string, string][]): Distractor[] => xs.map(([text, why]) => ({ text, why }));

// ---------------------------------------------------------------------------------------------------------------
// Outstanding and prepaid expenses
// ---------------------------------------------------------------------------------------------------------------

const EXP_OUT = [
  { id: 'rent', name: 'rent' }, { id: 'salaries', name: 'salaries' }, { id: 'wages', name: 'wages' },
  { id: 'electricity', name: 'electricity charges' }, { id: 'telephone', name: 'telephone charges' }, { id: 'auditFees', name: 'audit fees' },
] as const;
const EXP_PRE = [
  { id: 'insurance', name: 'insurance premium' }, { id: 'rent', name: 'rent' },
  { id: 'advertisement', name: 'advertisement expenses' }, { id: 'salaries', name: 'salaries' },
] as const;
const INCOMES = [
  { id: 'commissionReceived', name: 'commission', recd: 'commission' },
  { id: 'rentReceived', name: 'rent', recd: 'rent from a sub-tenant' },
  { id: 'interestReceived', name: 'interest', recd: 'interest on its investments' },
] as const;

const expenseOutstanding = num(
  'faa-expense-outstanding', C_OUT, 'easy',
  (rng) => {
    const e = rng.pick(EXP_OUT), firm = rng.pick(FIRMS), n = e.name;
    const out = amount(rng, 2000, 24000, 1000), paid = amount(rng, 24000, 180000, 6000);
    const charge = paid + out;
    const [P, O, C] = [inr(paid), inr(out), inr(charge)];
    const kind = rng.pick(['charge', 'charge', 'outstanding', 'paid'] as const);
    let parts: NumericParts;
    if (kind === 'charge') {
      parts = {
        prompt: rng.pick([
          `${firm} paid ${n} of ${P} during the year. A further ${O} of ${n} for the year is still unpaid on 31 March. What amount of ${n} is charged in the final accounts for the year?`,
          `The books of ${firm} show ${n} paid of ${P} during the year. A further ${O} of ${n} relating to the year had not been paid by 31 March. What is the expense for ${n} for the year?`,
        ]),
        answer: charge,
        commonErrors: [
          { value: paid - out, why: 'Deducted the outstanding amount, which is how a prepaid expense is treated.' },
          { value: paid, why: 'Gave the cash paid and left out the outstanding amount.' },
        ],
        explanation: [`Expense for the year = amount paid + amount outstanding.`, `${P} + ${O} = ${C}.`],
      };
    } else if (kind === 'outstanding') {
      parts = {
        prompt: `${firm} shows ${n} of ${C} as the expense for the year. The cash actually paid for ${n} during the year was ${P}. How much ${n} is outstanding on 31 March?`,
        answer: out,
        commonErrors: [
          { value: charge, why: 'Gave the expense for the year instead of the part of it that is unpaid.' },
          { value: paid, why: 'Gave the cash paid instead of the amount still owing.' },
          { value: charge + paid, why: 'Added the two figures instead of finding their difference.' },
        ],
        explanation: [`Outstanding = expense for the year - amount paid.`, `${C} - ${P} = ${O}.`],
      };
    } else {
      parts = {
        prompt: `The final accounts of ${firm} charge ${C} for ${n} for the year, of which ${O} is outstanding on 31 March. How much was actually paid for ${n} during the year?`,
        answer: paid,
        commonErrors: [
          { value: charge + out, why: 'Added the outstanding amount to the expense instead of deducting it.' },
          { value: charge, why: 'Gave the expense for the year, forgetting that part of it is still unpaid.' },
        ],
        explanation: [`Amount paid = expense for the year - amount outstanding.`, `${C} - ${O} = ${P}.`],
      };
    }
    return { parts, facts: { paid, out, charge, kind }, shown: kind === 'charge' ? [paid, out] : kind === 'outstanding' ? [charge, paid] : [charge, out] };
  },
  // The expense account as a ledger: cash paid + outstanding carried down = transfer to Profit and Loss.
  (f) => (f.kind === 'charge' ? f.paid + f.out : f.kind === 'outstanding' ? f.charge - f.paid : f.charge - f.out),
);

const expensePrepaid = num(
  'faa-expense-prepaid', C_OUT, 'easy',
  (rng) => {
    const e = rng.pick(EXP_PRE), firm = rng.pick(FIRMS), n = e.name;
    const adv = amount(rng, 2000, 30000, 1000), paid = amount(rng, 36000, 150000, 6000);
    const charge = paid - adv;
    const [P, A, C] = [inr(paid), inr(adv), inr(charge)];
    const ask = rng.pick(['charge', 'charge', 'prepaid'] as const);
    const parts: NumericParts =
      ask === 'charge'
        ? {
            prompt: rng.pick([
              `${firm} paid ${n} of ${P} during the year; ${A} of this relates to the next year. What is charged to the Profit and Loss Account for the year?`,
              `Of the ${n} of ${P} paid by ${firm} during the year, ${A} was paid in advance for the following year. What is the expense for ${n} for the year?`,
            ]),
            answer: charge,
            commonErrors: [
              { value: paid + adv, why: 'Added the prepaid amount, which is how an outstanding expense is treated.' },
              { value: paid, why: 'Gave the cash paid and left out the prepaid amount.' },
            ],
            explanation: [`Expense for the year = amount paid - amount prepaid.`, `${P} - ${A} = ${C}.`],
          }
        : {
            prompt: `${firm} paid ${n} of ${P} during the year, and the expense for the year works out to ${C}. What amount is shown as prepaid (a current asset) in the balance sheet?`,
            answer: adv,
            commonErrors: [
              { value: charge, why: 'Gave the expense for the year instead of the part paid in advance.' },
              { value: paid, why: 'Gave the whole payment instead of only the part that belongs to next year.' },
              { value: paid + charge, why: 'Added the two figures instead of finding their difference.' },
            ],
            explanation: [`Prepaid = amount paid - expense for the year.`, `${P} - ${C} = ${A}.`],
          };
    return { parts, facts: { paid, adv, charge, ask }, shown: ask === 'charge' ? [paid, adv] : [paid, charge] };
  },
  (f) => (f.ask === 'charge' ? f.paid - f.adv : f.paid - f.charge),
);

type Kind = 'owed' | 'ahead';
const KINDS: Kind[] = ['owed', 'ahead'];

/**
 * Expense (or income) for the year when an opening and a closing balance are given. For an expense "owed" is
 * outstanding and "ahead" is prepaid; for an income "owed" is accrued and "ahead" is received in advance. An opening
 * "owed" balance was settled during the year (deduct it); an opening "ahead" balance was paid in the earlier year
 * (add it); a closing "owed" balance is added and a closing "ahead" balance is deducted.
 */
function openClose(id: string, side: 'expense' | 'income') {
  return num(
    id, side === 'expense' ? C_OUT : C_ACC, 'medium',
    (rng) => {
      const firm = rng.pick(FIRMS);
      const n = side === 'expense' ? rng.pick(['rent', 'salaries', 'insurance premium', 'advertisement expenses', 'electricity charges']) : rng.pick(['commission', 'rent', 'interest']);
      const opening = rng.pick(KINDS), closing = rng.pick(KINDS);
      const x = amount(rng, 60000, 240000, 10000);
      const o = amount(rng, 3000, 18000, 1000), c = amount(rng, 3000, 18000, 1000);
      if (o === c) return null;
      const tOpen = opening === 'owed' ? -o : o;
      const tClose = closing === 'owed' ? c : -c;
      const answer = x + tOpen + tClose;
      const [X, O, C] = [inr(x), inr(o), inr(c)];
      const head = side === 'expense' ? `${firm} paid ${n} of ${X} in cash during the year.` : `${firm} received ${n} of ${X} in cash during the year.`;
      const open =
        side === 'expense'
          ? opening === 'owed'
            ? `At the start of the year ${O} of ${n} for the previous year was outstanding; it was paid this year and is included in the payments above.`
            : `At the start of the year ${O} of ${n} had been paid in the previous year for this year; it is not included in the payments above.`
          : opening === 'owed'
            ? `At the start of the year ${O} of ${n} earned in the previous year was still to be received; it was received this year and is included above.`
            : `At the start of the year ${O} of ${n} had been received in advance in the previous year for this year; it is not included above.`;
      const close =
        side === 'expense'
          ? closing === 'owed'
            ? `At the end of the year ${C} of ${n} for the year is outstanding.`
            : `At the end of the year ${C} of the ${n} paid relates to the next year.`
          : closing === 'owed'
            ? `At the end of the year ${C} of ${n} earned this year is still to be received.`
            : `At the end of the year ${C} of the ${n} received relates to the next year.`;
      const tail = side === 'expense' ? `What is charged to the Profit and Loss Account for ${n} for the year?` : `What is credited to the Profit and Loss Account for ${n} for the year?`;
      const parts: NumericParts = {
        prompt: `${head} ${open} ${close} ${tail}`,
        answer,
        commonErrors: [
          { value: x, why: 'Gave the cash figure with no adjustment for the opening and closing balances.' },
          { value: x + tClose, why: 'Adjusted for the closing balance but forgot the opening balance of the previous year.' },
          { value: x + tOpen, why: 'Adjusted for the opening balance but forgot the closing balance.' },
          { value: x - tOpen - tClose, why: 'Reversed the sign of both adjustments: added what should be deducted and deducted what should be added.' },
          { value: x - tOpen + tClose, why: 'Reversed the sign of the opening balance only: a balance settled this year is deducted, and one paid (or received) earlier for this year is added.' },
        ],
        explanation: [
          `Start from the cash figure: ${X}.`,
          `Opening balance ${O}: ${opening === 'owed' ? 'it belongs to the previous year but is inside the cash figure, so deduct it' : 'it belongs to this year but is not inside the cash figure, so add it'}.`,
          `Closing balance ${C}: ${closing === 'owed' ? 'it belongs to this year but is not inside the cash figure, so add it' : 'it belongs to next year but is inside the cash figure, so deduct it'}.`,
          `${X} ${tOpen < 0 ? '-' : '+'} ${O} ${tClose < 0 ? '-' : '+'} ${C} = ${inr(answer)}.`,
        ],
      };
      return { parts, facts: { x, o, c, opening, closing }, shown: [x, o, c] };
    },
    // The account as a ledger: the side that carries the cash, plus an opening balance paid in advance, plus a
    // closing balance owed, less the other side's items; the transfer to the Profit and Loss Account balances it.
    (f) => {
      const cashSide = f.x + (f.opening === 'ahead' ? f.o : 0) + (f.closing === 'owed' ? f.c : 0);
      const otherSide = (f.opening === 'owed' ? f.o : 0) + (f.closing === 'ahead' ? f.c : 0);
      return cashSide - otherSide;
    },
  );
}
const expenseOpenClose = openClose('faa-expense-opening-closing', 'expense');
const incomeOpenClose = openClose('faa-income-opening-closing', 'income');

const MONTHS_USED = [
  { start: '1 June', used: 10 }, { start: '1 July', used: 9 }, { start: '1 August', used: 8 }, { start: '1 September', used: 7 },
  { start: '1 October', used: 6 }, { start: '1 November', used: 5 }, { start: '1 December', used: 4 }, { start: '1 January', used: 3 },
  { start: '1 February', used: 2 },
];

const prepaidByMonths = num(
  'faa-insurance-months', C_OUT, 'medium',
  (rng) => {
    const firm = rng.pick(FIRMS);
    const item = rng.pick(['an insurance premium for a policy covering 12 months', 'an annual subscription to a trade journal covering 12 months', 'a licence fee for a licence valid for 12 months']);
    const m = rng.pick(MONTHS_USED);
    const x = amount(rng, 12000, 120000, 6000);
    const used = (x / 12) * m.used, ahead = x - used;
    if (!isWhole(used, ahead)) return null;
    const ask = rng.pick(['prepaid', 'charge'] as const);
    const [X, U, A] = [inr(x), inr(used), inr(ahead)];
    const intro = `On ${m.start}, ${firm} paid ${X} as ${item}, starting from that date. The financial year ends on 31 March.`;
    const parts: NumericParts =
      ask === 'prepaid'
        ? {
            prompt: `${intro} What amount is shown as prepaid (a current asset) in the balance sheet?`,
            answer: ahead,
            commonErrors: [
              { value: used, why: 'Gave the part already used up in the year, which is the expense, not the prepaid part.' },
              { value: x, why: 'Treated the whole payment as prepaid.' },
              { value: x / 2, why: 'Took half the payment as prepaid without counting the months that remain.' },
            ],
            explanation: [`The payment covers 12 months; ${m.used} of them fall before 31 March and ${12 - m.used} fall after it.`, `Prepaid = ${X} x ${12 - m.used}/12 = ${A}.`],
          }
        : {
            prompt: `${intro} What is charged to the Profit and Loss Account for the year?`,
            answer: used,
            commonErrors: [
              { value: ahead, why: 'Gave the part that belongs to next year (the prepaid amount) instead of the part used this year.' },
              { value: x, why: 'Charged the whole payment and made no adjustment for the months of next year.' },
              { value: x / 2, why: 'Charged half the payment without counting the months used.' },
            ],
            explanation: [`The payment covers 12 months; ${m.used} of them fall before 31 March.`, `Charge for the year = ${X} x ${m.used}/12 = ${U}.`],
          };
    return { parts, facts: { x, used: m.used, ask }, shown: [x] };
  },
  (f) => (f.ask === 'prepaid' ? f.x - (f.x / 12) * f.used : (f.x / 12) * f.used),
);

// ---------------------------------------------------------------------------------------------------------------
// Accrued income and income received in advance
// ---------------------------------------------------------------------------------------------------------------

const incomeAdjust = num(
  'faa-income-adjust', C_ACC, 'easy',
  (rng) => {
    const inc = rng.pick(INCOMES), firm = rng.pick(FIRMS);
    const adj = amount(rng, 2000, 24000, 1000), recd = amount(rng, 24000, 180000, 6000);
    const accrued = rng.pick([true, false]);
    const ask = rng.pick(['income', 'income', 'cash'] as const);
    const earned = accrued ? recd + adj : recd - adj;
    const [R, A, E] = [inr(recd), inr(adj), inr(earned)];
    let parts: NumericParts;
    if (ask === 'income') {
      parts = {
        prompt: accrued
          ? `${firm} received ${R} as ${inc.recd} during the year. A further ${A} of ${inc.name} has been earned for the year but is not yet received. What ${inc.name} is credited to the Profit and Loss Account for the year?`
          : `${firm} received ${R} as ${inc.recd} during the year. This includes ${A} received in advance for the next year. What ${inc.name} is credited to the Profit and Loss Account for the year?`,
        answer: earned,
        commonErrors: accrued
          ? [
              { value: recd - adj, why: 'Deducted the accrued amount, which is how income received in advance is treated.' },
              { value: recd, why: 'Gave the amount received and left out the accrued income.' },
            ]
          : [
              { value: recd + adj, why: 'Added the advance amount, which is how accrued income is treated.' },
              { value: recd, why: 'Gave the amount received and left out the part that belongs to next year.' },
            ],
        explanation: accrued
          ? [`Income for the year = amount received + amount accrued.`, `${R} + ${A} = ${E}.`]
          : [`Income for the year = amount received - amount received in advance.`, `${R} - ${A} = ${E}.`],
      };
    } else {
      parts = {
        prompt: accrued
          ? `The ${inc.name} earned by ${firm} for the year is ${E}, of which ${A} is still to be received on 31 March. How much ${inc.name} was actually received in cash during the year?`
          : `The ${inc.name} earned by ${firm} for the year is ${E}. The cash received during the year included ${A} for the next year. How much ${inc.name} was actually received in cash during the year?`,
        answer: recd,
        commonErrors: accrued
          ? [
              { value: earned + adj, why: 'Added the accrued amount to the income instead of deducting it.' },
              { value: earned, why: 'Gave the income earned, forgetting that part of it has not been received.' },
            ]
          : [
              { value: earned - adj, why: 'Deducted the advance amount instead of adding it: cash received is more than the income earned.' },
              { value: earned, why: 'Gave the income earned, forgetting the cash received in advance.' },
            ],
        explanation: accrued
          ? [`Cash received = income earned - income accrued.`, `${E} - ${A} = ${R}.`]
          : [`Cash received = income earned + income received in advance.`, `${E} + ${A} = ${R}.`],
      };
    }
    return { parts, facts: { recd, adj, earned, accrued, ask }, shown: ask === 'income' ? [recd, adj] : [earned, adj] };
  },
  // The income account as a ledger: cash received (plus accrued, less advance) is the income credited to Profit and Loss.
  (f) => (f.ask === 'income' ? f.recd + (f.accrued ? f.adj : -f.adj) : f.earned + (f.accrued ? -f.adj : f.adj)),
);

const interestAccrued = num(
  'faa-interest-accrued', C_ACC, 'medium',
  (rng) => {
    const firm = rng.pick(FIRMS);
    const p = amount(rng, 100000, 800000, 50000), r = rng.pick([6, 8, 9, 10, 12]);
    const kind = rng.pick(['asset', 'loan'] as const);
    // Six months settled is left out: the settled and unsettled parts would then be equal and the wrong answers collapse.
    const upto = rng.pick([
      { k: 3, date: '30 June' }, { k: 7, date: '31 October' }, { k: 8, date: '30 November' }, { k: 9, date: '31 December' }, { k: 10, date: '31 January' },
    ]);
    const rest = 12 - upto.k;
    const unpaid = (p * r * rest) / 1200, year = (p * r) / 100;
    if (!isWhole(unpaid, year)) return null;
    const ask = rng.pick(['balance', 'year'] as const);
    const [P, U, Y] = [inr(p), inr(unpaid), inr(year)];
    const intro =
      kind === 'asset'
        ? `Throughout the financial year ending 31 March, ${firm} held a fixed deposit of ${P} carrying interest at ${r}% per annum. Interest for the year has been received only up to ${upto.date}.`
        : `Throughout the financial year ending 31 March, ${firm} owed a loan of ${P} carrying interest at ${r}% per annum. Interest for the year has been paid only up to ${upto.date}.`;
    const parts: NumericParts =
      ask === 'balance'
        ? {
            prompt: `${intro} ${kind === 'asset' ? 'What is the accrued interest shown in the balance sheet?' : 'What is the outstanding interest shown in the balance sheet?'}`,
            answer: unpaid,
            commonErrors: [
              { value: year - unpaid, why: `Calculated the interest for the ${upto.k} months already settled instead of the ${rest} months still unsettled.` },
              { value: year, why: 'Took the interest for the full year as the balance, though part of it has been settled.' },
            ],
            explanation: [`Months not yet settled = 12 - ${upto.k} = ${rest}.`, `${P} x ${r}/100 x ${rest}/12 = ${U}.`],
          }
        : {
            prompt: `${intro} What interest ${kind === 'asset' ? 'income is credited' : 'expense is debited'} to the Profit and Loss Account for the year?`,
            answer: year,
            commonErrors: [
              { value: year - unpaid, why: `Counted only the ${upto.k} months already settled and left out the ${rest} months accrued.` },
              { value: unpaid, why: 'Counted only the months still unsettled.' },
            ],
            explanation: [`The interest belongs to the whole year, settled or not.`, `${P} x ${r}/100 = ${Y}.`],
          };
    return { parts, facts: { p, r, k: upto.k, ask }, shown: [p] };
  },
  (f) => (f.ask === 'balance' ? ((f.p / 100) * f.r * (12 - f.k)) / 12 : (f.p / 100) * f.r),
);

// ---------------------------------------------------------------------------------------------------------------
// Closing stock and depreciation
// ---------------------------------------------------------------------------------------------------------------

const ASSETS = [
  { id: 'machinery', name: 'machinery' }, { id: 'furniture', name: 'furniture' }, { id: 'computers', name: 'computers' },
  { id: 'vehicles', name: 'delivery vehicles' }, { id: 'officeEquipment', name: 'office equipment' },
] as const;

const depreciationCharge = num(
  'faa-depreciation-charge', C_DEP, 'easy',
  (rng) => {
    const a = rng.pick(ASSETS), firm = rng.pick(FIRMS);
    const cost = amount(rng, 50000, 600000, 50000), r = rng.pick([5, 10, 15, 20]);
    const dep = pc(cost, r), book = cost - dep;
    const ask = rng.pick(['charge', 'book'] as const);
    const [C, D, B] = [inr(cost), inr(dep), inr(book)];
    const intro = `${firm} bought ${a.name} costing ${C} on 1 April, the first day of the year. Depreciation is charged at ${r}% per annum on cost for the full year, and there were no other additions or sales.`;
    const parts: NumericParts =
      ask === 'charge'
        ? {
            prompt: `${intro} What is the depreciation charged to the Profit and Loss Account for the year?`,
            answer: dep,
            commonErrors: [
              { value: book, why: 'Gave the value of the asset after depreciation instead of the depreciation itself.' },
              { value: dep / 2, why: 'Charged only half a year, though the asset was held for the whole year.' },
            ],
            explanation: [`Depreciation = cost x rate.`, `${C} x ${r}/100 = ${D}.`],
          }
        : {
            prompt: `${intro} At what value is the asset shown in the balance sheet at the end of the year?`,
            answer: book,
            commonErrors: [
              { value: dep, why: 'Gave the depreciation instead of the value left after deducting it.' },
              { value: cost, why: 'Showed the asset at cost and forgot to deduct the depreciation.' },
              { value: cost + dep, why: 'Added the depreciation to the cost instead of deducting it.' },
            ],
            explanation: [`Depreciation = ${C} x ${r}/100 = ${D}.`, `Value in the balance sheet = ${C} - ${D} = ${B}.`],
          };
    return { parts, facts: { cost, r, ask }, shown: [cost] };
  },
  (f) => (f.ask === 'charge' ? (f.cost / 100) * f.r : (f.cost * (100 - f.r)) / 100),
);

const depreciationNewAsset = num(
  'faa-depreciation-new-asset', C_DEP, 'medium',
  (rng) => {
    const firm = rng.pick(FIRMS);
    const opening = amount(rng, 200000, 800000, 50000), added = amount(rng, 40000, 200000, 20000), r = rng.pick([5, 10, 15, 20]);
    const when = rng.pick([{ d: '1 July', m: 9 }, { d: '1 October', m: 6 }, { d: '1 December', m: 4 }, { d: '1 January', m: 3 }]);
    const depOld = pc(opening, r), depNew = (pc(added, r) * when.m) / 12;
    if (!isWhole(depNew)) return null;
    const total = depOld + depNew, book = opening + added - total;
    const ask = rng.pick(['total', 'book'] as const);
    const [O, A, DO, DN, TOT, BK] = [inr(opening), inr(added), inr(depOld), inr(depNew), inr(total), inr(book)];
    const intro = `${firm} started business on 1 April, the first day of the year, and bought machinery for ${O} on that date. On ${when.d} it bought more machinery for ${A}. Depreciation is charged at ${r}% per annum on cost, for the months each machine was in use in the year (the year ends on 31 March). No machinery was sold.`;
    const parts: NumericParts =
      ask === 'total'
        ? {
            prompt: `${intro} What is the total depreciation for the year?`,
            answer: total,
            commonErrors: [
              { value: depOld + pc(added, r), why: `Charged a full year on the machinery bought on ${when.d}, though it was in use for only ${when.m} months.` },
              { value: depOld, why: `Left out the depreciation on the machinery bought on ${when.d}.` },
              { value: depNew, why: 'Charged depreciation on the later purchase only and forgot the machinery bought on 1 April.' },
            ],
            explanation: [`Machinery bought on 1 April: ${O} x ${r}/100 = ${DO} for the full year.`, `Machinery bought on ${when.d} (${when.m} months in use): ${A} x ${r}/100 x ${when.m}/12 = ${DN}.`, `Total = ${DO} + ${DN} = ${TOT}.`],
          }
        : {
            prompt: `${intro} At what total value is the machinery shown in the balance sheet at the end of the year?`,
            answer: book,
            commonErrors: [
              { value: opening + added, why: 'Showed the machinery at cost and forgot to deduct the depreciation.' },
              { value: opening + added - depOld - pc(added, r), why: `Charged a full year of depreciation on the machinery bought on ${when.d}, which was in use for only ${when.m} months.` },
              { value: total, why: 'Gave the depreciation instead of the value left after deducting it.' },
            ],
            explanation: [`Total cost = ${O} + ${A} = ${inr(opening + added)}.`, `Depreciation = ${DO} + ${DN} = ${TOT}.`, `Value in the balance sheet = ${inr(opening + added)} - ${TOT} = ${BK}.`],
          };
    return { parts, facts: { opening, added, r, m: when.m, ask }, shown: [opening, added] };
  },
  (f) => {
    const dep = (f.opening / 100) * f.r + ((f.added / 100) * f.r * f.m) / 12;
    return f.ask === 'total' ? dep : f.opening + f.added - dep;
  },
);

const closingStockGp = num(
  'faa-closing-stock-gp', C_DEP, 'easy',
  (rng) => {
    const firm = rng.pick(FIRMS);
    const os = amount(rng, 20000, 80000, 5000), purchases = amount(rng, 150000, 500000, 10000), wages = amount(rng, 10000, 50000, 5000);
    const cs = amount(rng, 20000, 120000, 5000), gp = amount(rng, 40000, 200000, 5000);
    const cogs = os + purchases + wages - cs, sales = cogs + gp;
    const ask = rng.pick(['gp', 'cogs'] as const);
    const [S, OS, P, W, CS, G, CG] = [sales, os, purchases, wages, cs, gp, cogs].map(inr);
    const given = `opening stock ${OS}, purchases ${P} and wages (a direct expense) ${W}`;
    const parts: NumericParts =
      ask === 'gp'
        ? {
            prompt: `${firm} had sales of ${S}, ${given}. The closing stock at the year end, valued at ${CS}, is given as an adjustment outside the trial balance. What is the gross profit for the year?`,
            answer: gp,
            commonErrors: [
              { value: sales - (os + purchases + wages), why: 'Left the closing stock out of the Trading Account.' },
              { value: sales - (os + purchases + wages + cs), why: 'Put the closing stock on the debit side with the opening stock.' },
              { value: sales - (purchases + wages - cs), why: 'Left out the opening stock.' },
            ],
            explanation: [`Cost of goods sold = opening stock + purchases + wages - closing stock = ${OS} + ${P} + ${W} - ${CS} = ${CG}.`, `Gross profit = sales - cost of goods sold = ${S} - ${CG} = ${G}.`],
          }
        : {
            prompt: `${firm} had sales of ${S}, ${given}. The closing stock at the year end, valued at ${CS}, is given as an adjustment outside the trial balance. What is the cost of goods sold?`,
            answer: cogs,
            commonErrors: [
              { value: os + purchases + wages, why: 'Left the closing stock out: the cost of goods sold covers only the goods that have been sold.' },
              { value: os + purchases + wages + cs, why: 'Added the closing stock to the cost instead of deducting it.' },
              { value: sales, why: 'Gave the sales figure, which includes the profit.' },
            ],
            explanation: [`Cost of goods sold = opening stock + purchases + wages - closing stock.`, `${OS} + ${P} + ${W} - ${CS} = ${CG}.`],
          };
    return { parts, facts: { sales, os, purchases, wages, cs, ask }, shown: [sales, os, purchases, wages, cs] };
  },
  // Trading Account by sides: debit = opening stock + purchases + wages + profit; credit = sales + closing stock.
  (f) => (f.ask === 'gp' ? f.sales + f.cs - (f.os + f.purchases + f.wages) : f.os + f.purchases + f.wages - f.cs),
);

const stockValuation = num(
  'faa-stock-valuation', C_DEP, 'medium',
  (rng) => {
    const firm = 'a mobile accessories shop';
    const names = rng.shuffle(['mobile phones', 'chargers', 'headphones', 'phone covers', 'speakers', 'power banks']).slice(0, 3);
    // At least one line is worth less than its cost and at least one more, in any position.
    const factors = rng.shuffle([rng.pick([80, 90]), rng.pick([110, 120]), rng.pick([80, 90, 110, 120])]);
    const costs = names.map(() => amount(rng, 20000, 90000, 5000));
    const nrvs = costs.map((c, i) => pc(c, factors[i]));
    const values = costs.map((c, i) => Math.min(c, nrvs[i]));
    if (!isWhole(...nrvs)) return null;
    const answer = sum(values);
    const lines = names.map((n, i) => `${n} (cost ${inr(costs[i])}, net realisable value ${inr(nrvs[i])})`).join('; ');
    const parts: NumericParts = {
      prompt: `At the year end the closing stock of ${firm} consists of: ${lines}. Stock is valued on the prudent basis: each line at the lower of its cost and its net realisable value. At what total value is the closing stock shown?`,
      answer,
      commonErrors: [
        { value: sum(costs), why: 'Valued every line at cost and ignored the lines whose realisable value is lower.' },
        { value: sum(nrvs), why: 'Valued every line at net realisable value, including those worth more than they cost: a gain must not be taken before it is earned.' },
        { value: sum(costs.map((c, i) => Math.max(c, nrvs[i]))), why: 'Took the higher of cost and realisable value for each line, the opposite of the prudence rule.' },
      ],
      explanation: names.map((n, i) => `${cap(n)}: lower of ${inr(costs[i])} and ${inr(nrvs[i])} = ${inr(values[i])}.`).concat(`Total = ${inr(answer)}.`),
    };
    return { parts, facts: { costs, nrvs }, shown: [...costs, ...nrvs] };
  },
  (f) => f.costs.reduce((s, c, i) => s + (f.nrvs[i] < c ? f.nrvs[i] : c), 0),
);

// ---------------------------------------------------------------------------------------------------------------
// Bad debts, provision for doubtful debts, provision for discount on debtors
// ---------------------------------------------------------------------------------------------------------------

const provisionNew = num(
  'faa-provision-new', C_BAD, 'easy',
  (rng) => {
    const firm = rng.pick(FIRMS);
    const d = amount(rng, 100000, 900000, 50000), p = rng.pick([2, 5, 10]);
    const prov = pc(d, p), net = d - prov;
    const ask = rng.pick(['provision', 'net'] as const);
    const [D, PR, N] = [inr(d), inr(prov), inr(net)];
    const intro = `At the end of the year the debtors of ${firm} total ${D}. There was no provision for doubtful debts before, and ${p}% of the debtors are to be provided for as doubtful.`;
    const parts: NumericParts =
      ask === 'provision'
        ? {
            prompt: `${intro} What provision is charged to the Profit and Loss Account?`,
            answer: prov,
            commonErrors: [
              { value: net, why: 'Gave the debtors left after the provision instead of the provision itself.' },
              { value: d, why: 'Provided for all the debtors instead of the given percentage.' },
            ],
            explanation: [`Provision = debtors x rate.`, `${D} x ${p}/100 = ${PR}.`],
          }
        : {
            prompt: `${intro} What figure of debtors is shown in the balance sheet after deducting the provision?`,
            answer: net,
            commonErrors: [
              { value: d, why: 'Showed the debtors without deducting the provision.' },
              { value: prov, why: 'Gave the provision itself instead of the debtors left.' },
              { value: d + prov, why: 'Added the provision to the debtors instead of deducting it.' },
            ],
            explanation: [`Provision = ${D} x ${p}/100 = ${PR}.`, `Debtors shown = ${D} - ${PR} = ${N}.`],
          };
    return { parts, facts: { d, p, ask }, shown: [d] };
  },
  (f) => (f.ask === 'provision' ? (f.d / 100) * f.p : (f.d * (100 - f.p)) / 100),
);

const debtorsNet = num(
  'faa-debtors-net', C_BAD, 'medium',
  (rng) => {
    const firm = rng.pick(FIRMS);
    const d = amount(rng, 100000, 900000, 50000), b = amount(rng, 4000, 30000, 2000), p = rng.pick([2, 4, 5, 8, 10]);
    const base = d - b, prov = pc(base, p), net = base - prov;
    if (!isWhole(prov)) return null;
    const ask = rng.pick(['net', 'provision'] as const);
    const [D, B, BASE, PR, N] = [inr(d), inr(b), inr(base), inr(prov), inr(net)];
    const intro = `The trial balance of ${firm} shows sundry debtors of ${D}. The adjustments are: (i) further bad debts of ${B} are to be written off; (ii) a provision for doubtful debts of ${p}% is to be made on the remaining debtors. There was no provision earlier.`;
    const parts: NumericParts =
      ask === 'net'
        ? {
            prompt: `${intro} What figure of debtors is shown in the balance sheet?`,
            answer: net,
            commonErrors: [
              { value: pc(d, 100 - p), why: 'Forgot to write off the further bad debts before working out the provision.' },
              { value: base, why: 'Wrote off the bad debts but did not deduct the provision.' },
              { value: d - b - pc(d, p), why: 'Calculated the provision on the original debtors instead of on the debtors left after bad debts.' },
            ],
            explanation: [`Debtors after bad debts = ${D} - ${B} = ${BASE}.`, `Provision = ${BASE} x ${p}/100 = ${PR}.`, `Debtors shown = ${BASE} - ${PR} = ${N}.`],
          }
        : {
            prompt: `${intro} What provision for doubtful debts is required?`,
            answer: prov,
            commonErrors: [
              { value: pc(d, p), why: 'Calculated the provision on the original debtors, before writing off the further bad debts.' },
              { value: net, why: 'Gave the debtors shown in the balance sheet instead of the provision.' },
              { value: pc(b, p), why: 'Applied the rate to the bad debts instead of to the remaining debtors.' },
            ],
            explanation: [`Debtors after bad debts = ${D} - ${B} = ${BASE}.`, `Provision = ${BASE} x ${p}/100 = ${PR}.`],
          };
    return { parts, facts: { d, b, p, ask }, shown: [d, b] };
  },
  (f) => {
    const good = f.d - f.b;
    return f.ask === 'net' ? (good * (100 - f.p)) / 100 : (good / 100) * f.p;
  },
);

/** Provision figures for a question with an old provision: the new provision and the old one. */
function provisionDraw(rng: Rng, direction: 'up' | 'down') {
  const d = amount(rng, 150000, 900000, 50000), b = amount(rng, 4000, 30000, 2000), p = rng.pick([4, 5, 8, 10]);
  const newProv = pc(d - b, p);
  if (!isWhole(newProv)) return null;
  const nr = newProv / 100;
  let old: number;
  if (direction === 'up') {
    const lo = Math.max(500, Math.ceil((nr * 0.3) / 500) * 500), hi = Math.floor((nr * 0.8) / 500) * 500;
    if (hi < lo) return null;
    old = amount(rng, lo, hi, 500);
  } else {
    const lo = Math.ceil((nr * 1.3) / 500) * 500, hi = Math.floor((nr * 2.2) / 500) * 500;
    if (hi < lo) return null;
    old = amount(rng, lo, hi, 500);
  }
  return { d, b, p, newProv, old };
}

const provisionIncrease = num(
  'faa-provision-increase', C_BAD, 'medium',
  (rng) => {
    const firm = rng.pick(FIRMS);
    const x = provisionDraw(rng, 'up');
    if (!x) return null;
    const { d, b, p, newProv, old } = x;
    const charge = newProv - old;
    const ask = rng.pick(['charge', 'closing'] as const);
    const [D, B, O, NP, CH] = [inr(d), inr(b), inr(old), inr(newProv), inr(charge)];
    const intro = `${firm} has sundry debtors of ${D} and a Provision for Doubtful Debts account with a credit balance of ${O}. Further bad debts of ${B} are to be written off, and the provision is to be kept at ${p}% of the debtors remaining after that.`;
    const parts: NumericParts =
      ask === 'charge'
        ? {
            prompt: `${intro} The further bad debts are charged to the Profit and Loss Account as a separate item. What additional amount is charged to the Profit and Loss Account to raise the provision to the required figure?`,
            answer: charge,
            commonErrors: [
              { value: newProv, why: 'Charged the whole new provision and forgot that the old provision already stands in the books.' },
              { value: pc(d, p) - old, why: 'Worked out the new provision on the debtors before writing off the further bad debts.' },
              { value: newProv + old, why: 'Added the old provision instead of deducting it.' },
            ],
            explanation: [`Debtors after bad debts = ${D} - ${B} = ${inr(d - b)}.`, `New provision = ${inr(d - b)} x ${p}/100 = ${NP}.`, `Charge = new provision - old provision = ${NP} - ${O} = ${CH}.`],
          }
        : {
            prompt: `${intro} What is the new (closing) provision for doubtful debts?`,
            answer: newProv,
            commonErrors: [
              { value: pc(d, p), why: 'Calculated the provision on the debtors before writing off the further bad debts.' },
              { value: charge, why: 'Gave the extra charge for the year instead of the full closing provision.' },
              { value: newProv + old, why: 'Added the old provision to the new one, but the new provision is the full amount to be held.' },
            ],
            explanation: [`Debtors after bad debts = ${D} - ${B} = ${inr(d - b)}.`, `New provision = ${inr(d - b)} x ${p}/100 = ${NP}.`],
          };
    return { parts, facts: { d, b, p, old, ask }, shown: [d, b, old] };
  },
  (f) => {
    const np = ((f.d - f.b) / 100) * f.p;
    return f.ask === 'charge' ? np - f.old : np;
  },
);

const provisionWriteBack = num(
  'faa-provision-writeback', C_BAD, 'medium',
  (rng) => {
    const firm = rng.pick(FIRMS);
    const x = provisionDraw(rng, 'down');
    if (!x) return null;
    const { d, b, p, newProv, old } = x;
    const credit = old - newProv;
    const [D, B, O, NP, CR] = [inr(d), inr(b), inr(old), inr(newProv), inr(credit)];
    const parts: NumericParts = {
      prompt: `${firm} has sundry debtors of ${D} and a Provision for Doubtful Debts account with a credit balance of ${O}. Further bad debts of ${B} are to be written off, and the provision is to be kept at ${p}% of the debtors remaining after that. The further bad debts are charged to the Profit and Loss Account as a separate item. What amount of the old provision is no longer required and is written back (credited) to the Profit and Loss Account?`,
      answer: credit,
      commonErrors: [
        { value: newProv, why: 'Gave the new provision instead of the amount by which the provision falls.' },
        { value: old, why: 'Gave the old provision: only the excess over the new provision is released.' },
        { value: old + newProv, why: 'Added the old and the new provision instead of finding their difference.' },
      ],
      explanation: [`Debtors after bad debts = ${D} - ${B} = ${inr(d - b)}.`, `New provision = ${inr(d - b)} x ${p}/100 = ${NP}.`, `The old provision ${O} is more than the new one, so the excess is written back: ${O} - ${NP} = ${CR}.`],
    };
    return { parts, facts: { d, b, p, old }, shown: [d, b, old] };
  },
  (f) => f.old - ((f.d - f.b) / 100) * f.p,
);

const badDebtsCharge = num(
  'faa-bad-debts-charge', C_BAD, 'complex',
  (rng) => {
    const firm = rng.pick(FIRMS);
    const b0 = amount(rng, 2000, 15000, 500), d = amount(rng, 100000, 600000, 20000), b = amount(rng, 4000, 20000, 2000);
    const old = amount(rng, 5000, 30000, 1000), p = rng.pick([5, 10]);
    const newProv = pc(d - b, p);
    if (!isWhole(newProv) || newProv === old) return null;
    // When the old provision is the larger one, the excess is set against the bad debts; the item must stay a debit.
    const total = b0 + b + newProv - old;
    if (total <= 0) return null;
    const [B0, D, B, O, NP, TOT] = [inr(b0), inr(d), inr(b), inr(old), inr(newProv), inr(total)];
    const parts: NumericParts = {
      prompt: `Extracts from the trial balance of ${firm}: Bad debts ${B0} (debit); Sundry debtors ${D} (debit); Provision for doubtful debts ${O} (credit). Adjustments: (i) further bad debts of ${B} are to be written off; (ii) the provision for doubtful debts is to be maintained at ${p}% of the debtors. Bad debts and the change in the provision are shown together as one item on the debit side of the Profit and Loss Account. What is the net amount of that item (all bad debts, plus the new provision, less the old provision)?`,
      answer: total,
      commonErrors: [
        { value: b0 + b + newProv, why: 'Charged the whole new provision and ignored the old provision already in the books.' },
        { value: b0 + newProv - old, why: 'Left out the further bad debts.' },
        { value: b + newProv - old, why: 'Left out the bad debts already shown in the trial balance.' },
        { value: b0 + b + pc(d, p) - old, why: 'Calculated the new provision on the debtors before deducting the further bad debts.' },
      ],
      explanation: [
        `Bad debts: ${B0} + ${B} = ${inr(b0 + b)}.`,
        `Debtors after further bad debts = ${D} - ${B} = ${inr(d - b)}; new provision at ${p}% = ${NP}.`,
        newProv >= old
          ? `The provision rises from ${O} to ${NP}: a further charge of ${inr(newProv - old)}.`
          : `The old provision ${O} is more than the new one ${NP}, so ${inr(old - newProv)} is no longer needed; it is set against the bad debts and reduces the charge.`,
        `Net charge = bad debts + new provision - old provision = ${inr(b0 + b)} + ${NP} - ${O} = ${TOT}.`,
      ],
    };
    return { parts, facts: { b0, d, b, old, p }, shown: [b0, d, b, old] };
  },
  // The two accounts closed one after the other: Bad Debts A/c total, then the Provision A/c adjusted to its new balance.
  (f) => {
    const badDebts = f.b0 + f.b;
    const provisionAfter = ((f.d - f.b) / 100) * f.p;
    return badDebts + (provisionAfter - f.old);
  },
);

const discountProvision = num(
  'faa-discount-provision', C_BAD, 'complex',
  (rng) => {
    const firm = rng.pick(FIRMS);
    const d = amount(rng, 200000, 800000, 20000), b = amount(rng, 4000, 20000, 2000);
    const p = rng.pick([5, 10]), q = rng.pick([2, 3, 5]);
    const base = d - b, pdd = pc(base, p), good = base - pdd, disc = pc(good, q);
    if (!isWhole(pdd, disc)) return null;
    const net = good - disc;
    const ask = rng.pick(['discount', 'net', 'charge'] as const);
    let oldDisc = 0;
    if (ask === 'charge') {
      const nr = disc / 100;
      const lo = Math.max(200, Math.ceil((nr * 0.3) / 100) * 100), hi = Math.floor((nr * 0.8) / 100) * 100;
      if (hi < lo) return null;
      oldDisc = amount(rng, lo, hi, 100);
    }
    const [D, B, BASE, PDD, GOOD, DISC, NET] = [inr(d), inr(b), inr(base), inr(pdd), inr(good), inr(disc), inr(net)];
    const intro = `The trial balance of ${firm} shows sundry debtors of ${D}. Adjustments: (i) further bad debts of ${B}; (ii) a provision for doubtful debts of ${p}%; (iii) a provision for discount of ${q}% on the good debtors.`;
    const steps = [`Debtors after bad debts = ${D} - ${B} = ${BASE}.`, `Provision for doubtful debts = ${BASE} x ${p}/100 = ${PDD}.`, `Good debtors = ${BASE} - ${PDD} = ${GOOD}.`, `Provision for discount = ${GOOD} x ${q}/100 = ${DISC}.`];
    let parts: NumericParts;
    if (ask === 'discount') {
      parts = {
        prompt: `${intro} What is the provision for discount on debtors?`,
        answer: disc,
        commonErrors: [
          { value: pc(base, q), why: 'Calculated the discount on the debtors before deducting the provision for doubtful debts: discount is only expected from debtors who will pay.' },
          { value: pc(d, q), why: 'Calculated the discount on the original debtors, ignoring both the bad debts and the provision for doubtful debts.' },
          { value: pc(d - pc(d, p), q), why: 'Deducted the provision for doubtful debts but forgot to write off the further bad debts first.' },
        ],
        explanation: steps,
      };
    } else if (ask === 'net') {
      parts = {
        prompt: `${intro} What figure of debtors is shown in the balance sheet after both provisions?`,
        answer: net,
        commonErrors: [
          { value: good, why: 'Deducted the provision for doubtful debts but not the provision for discount.' },
          { value: base - disc, why: 'Deducted the provision for discount but not the provision for doubtful debts.' },
          { value: base - pdd - pc(base, q), why: 'Calculated the discount on the debtors before deducting the provision for doubtful debts.' },
        ],
        explanation: [...steps, `Debtors shown = ${GOOD} - ${DISC} = ${NET}.`],
      };
    } else {
      parts = {
        prompt: `${intro} The Provision for Discount on Debtors account has a credit balance of ${inr(oldDisc)}. What amount is charged to the Profit and Loss Account for the provision for discount?`,
        answer: disc - oldDisc,
        commonErrors: [
          { value: disc, why: 'Charged the whole new provision and ignored the old provision for discount.' },
          { value: pc(base, q) - oldDisc, why: 'Calculated the discount on the debtors before deducting the provision for doubtful debts.' },
          { value: disc + oldDisc, why: 'Added the old provision instead of deducting it.' },
        ],
        explanation: [...steps, `Charge = new provision - old provision = ${DISC} - ${inr(oldDisc)} = ${inr(disc - oldDisc)}.`],
      };
    }
    return { parts, facts: { d, b, p, q, oldDisc, ask }, shown: [d, b, ...(ask === 'charge' ? [oldDisc] : [])] };
  },
  // The order of operations, worked as three successive percentages of what is left.
  (f) => {
    const afterBad = f.d - f.b;
    const afterPdd = (afterBad * (100 - f.p)) / 100;
    const disc = (afterPdd * f.q) / 100;
    return f.ask === 'discount' ? disc : f.ask === 'net' ? afterPdd - disc : disc - f.oldDisc;
  },
);

// ---------------------------------------------------------------------------------------------------------------
// Interest on capital and on drawings
// ---------------------------------------------------------------------------------------------------------------

const interestOnCapital = num(
  'faa-int-capital', C_INT, 'easy',
  (rng) => {
    const firm = rng.pick(FIRMS);
    const c = amount(rng, 100000, 1000000, 50000), r = rng.pick([5, 6, 8, 10, 12]);
    const ioc = pc(c, r);
    const ask = rng.pick(['interest', 'profit'] as const);
    const profit = amount(rng, 150000, 500000, 10000);
    if (profit <= ioc) return null;
    const [C, I, P, A] = [inr(c), inr(ioc), inr(profit), inr(profit - ioc)];
    const intro = `The proprietor of ${firm} had a capital of ${C} at the start of the year and introduced or withdrew no capital during it. Interest on capital is allowed at ${r}% per annum.`;
    const parts: NumericParts =
      ask === 'interest'
        ? {
            prompt: `${intro} What is the interest on capital for the year?`,
            answer: ioc,
            commonErrors: [
              { value: ioc / 2, why: 'Charged only half a year, though the capital was in the business for the whole year.' },
              { value: c + ioc, why: 'Added the interest to the capital instead of giving the interest itself.' },
            ],
            explanation: [`Interest on capital = capital x rate x time.`, `${C} x ${r}/100 x 12/12 = ${I}.`],
          }
        : {
            prompt: `${intro} The net profit before interest on capital is ${P}. What is the net profit after charging interest on capital?`,
            answer: profit - ioc,
            commonErrors: [
              { value: profit + ioc, why: 'Added the interest on capital to the profit, but it is an expense of the business.' },
              { value: profit, why: 'Left the interest on capital out of the Profit and Loss Account.' },
              { value: ioc, why: 'Gave the interest itself instead of the profit left after it.' },
            ],
            explanation: [`Interest on capital = ${C} x ${r}/100 = ${I}.`, `It is an expense: ${P} - ${I} = ${A}.`],
          };
    return { parts, facts: { c, r, profit, ask }, shown: ask === 'interest' ? [c] : [c, profit] };
  },
  (f) => (f.ask === 'interest' ? (f.c / 100) * f.r : f.profit - (f.c / 100) * f.r),
);

const interestOnCapitalIntroduced = num(
  'faa-int-capital-introduced', C_INT, 'medium',
  (rng) => {
    const firm = rng.pick(FIRMS);
    const c = amount(rng, 200000, 1000000, 50000), add = amount(rng, 40000, 300000, 20000), r = rng.pick([5, 6, 8, 10, 12]);
    const when = rng.pick([{ d: '1 July', m: 9 }, { d: '1 October', m: 6 }, { d: '1 December', m: 4 }, { d: '1 January', m: 3 }]);
    const onOld = pc(c, r), onNew = (pc(add, r) * when.m) / 12;
    if (!isWhole(onNew)) return null;
    const ask = rng.pick(['total', 'total', 'new'] as const);
    const [C, A, ON, OLD] = [inr(c), inr(add), inr(onNew), inr(onOld)];
    const intro = `The proprietor of ${firm} had a capital of ${C} on 1 April and introduced a further ${A} on ${when.d}. Interest on capital is allowed at ${r}% per annum, for the period each amount was in the business during the year ending 31 March.`;
    const parts: NumericParts =
      ask === 'total'
        ? {
            prompt: `${intro} What is the total interest on capital for the year?`,
            answer: onOld + onNew,
            commonErrors: [
              { value: onOld + pc(add, r), why: 'Allowed a full year of interest on the capital introduced during the year.' },
              { value: onOld, why: 'Left out the interest on the additional capital.' },
              { value: onNew, why: 'Gave the interest on the additional capital only.' },
            ],
            explanation: [`On ${C} for 12 months: ${C} x ${r}/100 = ${OLD}.`, `On ${A} for ${when.m} months: ${A} x ${r}/100 x ${when.m}/12 = ${ON}.`, `Total = ${OLD} + ${ON} = ${inr(onOld + onNew)}.`],
          }
        : {
            prompt: `${intro} What is the interest on the additional capital alone?`,
            answer: onNew,
            commonErrors: [
              { value: pc(add, r), why: 'Allowed a full year of interest though the capital was in the business for only part of the year.' },
              { value: onOld + onNew, why: 'Gave the interest on all the capital instead of on the additional capital only.' },
              { value: (pc(add, r) * (12 - when.m)) / 12, why: `Counted the months before the capital came in instead of the ${when.m} months after.` },
            ],
            explanation: [`The additional capital was in the business from ${when.d} to 31 March: ${when.m} months.`, `${A} x ${r}/100 x ${when.m}/12 = ${ON}.`],
          };
    return { parts, facts: { c, add, r, m: when.m, ask }, shown: [c, add] };
  },
  (f) => {
    const newPart = ((f.add / 100) * f.r * f.m) / 12;
    return f.ask === 'new' ? newPart : (f.c / 100) * f.r + newPart;
  },
);

const interestOnDrawings = num(
  'faa-int-drawings', C_INT, 'easy',
  (rng) => {
    const firm = rng.pick(FIRMS), owner = `The proprietor of ${firm}`;
    const x = amount(rng, 20000, 120000, 10000), r = rng.pick([6, 8, 10, 12]);
    const dated = rng.pick([true, true, false]);
    const when = rng.pick([{ d: '1 July', m: 9 }, { d: '1 October', m: 6 }, { d: '1 December', m: 4 }, { d: '1 January', m: 3 }, { d: '1 February', m: 2 }]);
    const m = dated ? when.m : 6;
    const interest = (x * r * m) / 1200;
    if (!isWhole(interest)) return null;
    const [X, I] = [inr(x), inr(interest)];
    const parts: NumericParts = dated
      ? {
          prompt: `${owner} withdrew ${X} for personal use on ${when.d}. Interest on drawings is charged at ${r}% per annum from the date of withdrawal to 31 March. What is the interest on drawings?`,
          answer: interest,
          commonErrors: [
            { value: pc(x, r), why: 'Charged a full year of interest though the money was drawn part-way through the year.' },
            { value: (x * r * (12 - m)) / 1200, why: `Counted the ${12 - m} months before the withdrawal instead of the ${m} months after it.` },
            { value: x + interest, why: 'Added the interest to the drawings instead of giving the interest itself.' },
          ],
          explanation: [`The money was out of the business from ${when.d} to 31 March: ${m} months.`, `${X} x ${r}/100 x ${m}/12 = ${I}.`],
        }
      : {
          prompt: `${owner} withdrew ${X} during the year in irregular amounts. Interest on drawings is charged at ${r}% per annum for an average period of 6 months. What is the interest on drawings?`,
          answer: interest,
          commonErrors: [
            { value: pc(x, r), why: 'Charged a full year of interest instead of the stated average of 6 months.' },
            { value: x + interest, why: 'Added the interest to the drawings instead of giving the interest itself.' },
          ],
          explanation: [`Interest = drawings x rate x average period.`, `${X} x ${r}/100 x 6/12 = ${I}.`],
        };
    return { parts, facts: { x, r, m }, shown: [x] };
  },
  (f) => ((f.x / 100) * f.r * f.m) / 12,
);

const DRAWING_PATTERNS = [
  { desc: 'at the beginning of each month', n: 12, avg2: 13, other: 11, range: [2000, 10000, 1000] },
  { desc: 'at the end of each month', n: 12, avg2: 11, other: 13, range: [2000, 10000, 1000] },
  { desc: 'in the middle of each month', n: 12, avg2: 12, other: 13, range: [2000, 10000, 1000] },
  { desc: 'at the beginning of each quarter', n: 4, avg2: 15, other: 9, range: [10000, 40000, 5000] },
  { desc: 'at the end of each quarter', n: 4, avg2: 9, other: 15, range: [10000, 40000, 5000] },
  { desc: 'at the beginning of each half year', n: 2, avg2: 18, other: 6, range: [20000, 80000, 10000] },
  { desc: 'at the end of each half year', n: 2, avg2: 6, other: 18, range: [20000, 80000, 10000] },
] as const;

const interestOnDrawingsRegular = num(
  'faa-int-drawings-regular', C_INT, 'medium',
  (rng) => {
    const firm = rng.pick(FIRMS);
    const pat = rng.pick(DRAWING_PATTERNS);
    const each = amount(rng, pat.range[0], pat.range[1], pat.range[2]), r = rng.pick([6, 8, 10, 12]);
    const total = each * pat.n;
    const interest = (total * r * pat.avg2) / 2400;
    if (!isWhole(interest)) return null;
    const avg = pat.avg2 / 2;
    const [E, TOT, I] = [inr(each), inr(total), inr(interest)];
    const parts: NumericParts = {
      prompt: `The proprietor of ${firm} withdrew ${E} ${pat.desc} during the year ending 31 March, ${TOT} in all. Interest on drawings is charged at ${r}% per annum from the date of each withdrawal to 31 March. What is the interest on drawings for the year?`,
      answer: interest,
      commonErrors: [
        { value: pc(total, r), why: 'Charged a full year of interest on the total drawings, though each withdrawal was out of the business for only part of the year.' },
        { value: (total * r * 6) / 1200, why: 'Used 6 months as the average period for every pattern; the average depends on whether the withdrawals fall at the beginning, middle or end of each period.' },
        { value: (total * r * pat.other) / 2400, why: pat.desc.includes('middle') ? 'Treated the withdrawals as made at the beginning of each month, but they fall in the middle.' : 'Mixed up the beginning and the end of each period: withdrawals at the beginning stay out longer, so the average period is longer.' },
      ],
      explanation: [
        `Total drawings = ${E} x ${pat.n} = ${TOT}.`,
        `Average period of a withdrawal made ${pat.desc} = ${avg} months (counted to 31 March).`,
        `Interest = ${TOT} x ${r}/100 x ${avg}/12 = ${I}.`,
      ],
    };
    return { parts, facts: { total, r, avg2: pat.avg2 }, shown: [each, total] };
  },
  (f) => ((f.total / 100) * f.r * (f.avg2 / 2)) / 12,
);

// ---------------------------------------------------------------------------------------------------------------
// Manager's commission
// ---------------------------------------------------------------------------------------------------------------

const commissionBefore = num(
  'faa-commission-before', C_COM, 'easy',
  (rng) => {
    const firm = rng.pick(FIRMS);
    const p = amount(rng, 100000, 500000, 10000), r = rng.pick([5, 8, 10, 12, 20]);
    const c = pc(p, r);
    const ask = rng.pick(['commission', 'after'] as const);
    const [P, C, AFTER] = [inr(p), inr(c), inr(p - c)];
    const intro = `The manager of ${firm} is entitled to a commission of ${r}% of the net profit before charging the commission. The net profit before charging the commission is ${P}.`;
    const parts: NumericParts =
      ask === 'commission'
        ? {
            prompt: `${intro} What is the manager's commission?`,
            answer: c,
            commonErrors: [
              { value: Math.round((p * r) / (100 + r)), why: 'Used the other basis (profit after charging the commission), but this commission is on the profit before it.' },
              { value: p - c, why: 'Gave the profit left after the commission instead of the commission.' },
            ],
            explanation: [`The basis is the profit before the commission, which is given: ${P}.`, `Commission = ${P} x ${r}/100 = ${C}.`],
          }
        : {
            prompt: `${intro} What is the net profit after charging the commission?`,
            answer: p - c,
            commonErrors: [
              { value: p + c, why: 'Added the commission to the profit, but it is an expense.' },
              { value: c, why: 'Gave the commission instead of the profit left after it.' },
              { value: Math.round((p * 100) / (100 + r)), why: 'Used the other basis (commission on profit after charging it).' },
            ],
            explanation: [`Commission = ${P} x ${r}/100 = ${C}.`, `Net profit after commission = ${P} - ${C} = ${AFTER}.`],
          };
    return { parts, facts: { p, r, ask }, shown: [p] };
  },
  (f) => (f.ask === 'commission' ? (f.p * f.r) / 100 : f.p - (f.p * f.r) / 100),
);

const commissionAfter = num(
  'faa-commission-after', C_COM, 'medium',
  (rng) => {
    const firm = rng.pick(FIRMS);
    const c = amount(rng, 5000, 40000, 1000), r = rng.pick([5, 8, 10, 20, 25]);
    const p = (c * (100 + r)) / r;
    if (!isWhole(p)) return null;
    const ask = rng.pick(['commission', 'after'] as const);
    const [P, C, AFTER] = [inr(p), inr(c), inr(p - c)];
    const intro = `The manager of ${firm} is entitled to a commission of ${r}% of the net profit after charging the commission. The net profit before charging the commission is ${P}.`;
    const parts: NumericParts =
      ask === 'commission'
        ? {
            prompt: `${intro} What is the manager's commission?`,
            answer: c,
            commonErrors: [
              { value: pc(p, r), why: 'Took the commission on the profit before charging it, but this commission is on the profit after it.' },
              { value: Math.round((p * r) / (100 - r)), why: 'Used 100 - rate instead of 100 + rate: the commission is part of the figure it is calculated on, so the profit before it is 100 + rate parts.' },
              { value: p - c, why: 'Gave the profit left after the commission instead of the commission.' },
            ],
            explanation: [`Let the profit after commission be 100; the commission is ${r}; the profit before commission is ${100 + r}.`, `Commission = ${P} x ${r}/${100 + r} = ${C}.`],
          }
        : {
            prompt: `${intro} What is the net profit after charging the commission?`,
            answer: p - c,
            commonErrors: [
              { value: p - pc(p, r), why: 'Deducted the commission worked out on the profit before it; this commission is on the profit after it.' },
              { value: c, why: 'Gave the commission instead of the profit left after it.' },
              { value: p, why: 'Left the commission out.' },
            ],
            explanation: [`Profit after commission = profit before commission x 100/${100 + r}.`, `${P} x 100/${100 + r} = ${AFTER}.`, `(Check: commission = ${C}, which is ${r}% of ${AFTER}.)`],
          };
    return { parts, facts: { p, r, ask }, shown: [p] };
  },
  // Check the other way round: the commission must be r% of the profit that is left after it.
  (f) => {
    const after = (f.p * 100) / (100 + f.r);
    const c = f.p - after;
    return Math.abs((after * f.r) / 100 - c) < 1e-6 ? (f.ask === 'commission' ? c : after) : -1;
  },
);

const ADJ_COMMISSION = [
  { sign: -1, text: (a: string) => `depreciation of ${a} on machinery has not been charged` },
  { sign: -1, text: (a: string) => `salaries of ${a} for the last month are outstanding` },
  { sign: 1, text: (a: string) => `${a} of the insurance premium paid relates to the next year` },
  { sign: 1, text: (a: string) => `interest of ${a} earned by the firm on its investments has not yet been received` },
  { sign: -1, text: (a: string) => `interest on capital of ${a} is to be allowed` },
  // Version 2: interest on drawings (beyond the Class 11 syllabus) gave way to a provision for discount on debtors.
  { sign: -1, text: (a: string) => `a provision for discount on debtors of ${a} is to be made` },
] as const;

const commissionCombined = num(
  'faa-commission-combined', C_COM, 'complex',
  (rng) => {
    const firm = rng.pick(FIRMS);
    const picks = rng.shuffle(ADJ_COMMISSION).slice(0, 3);
    const amounts = picks.map(() => amount(rng, 3000, 20000, 1000));
    const net = sum(picks.map((a, i) => a.sign * amounts[i]));
    const r = rng.pick([5, 10, 20, 25]);
    const after = rng.pick([true, false]);
    // Fix the adjusted profit first (so that the commission is a whole number), then work back to the book profit.
    let adjusted: number, commission: number;
    if (after) {
      const c = amount(rng, 3000, 30000, 1000);
      adjusted = (c * (100 + r)) / r;
      commission = c;
    } else {
      adjusted = amount(rng, 150000, 600000, 10000);
      commission = pc(adjusted, r);
    }
    if (!isWhole(adjusted, commission)) return null;
    const book = adjusted - net;
    if (book <= 0) return null;
    const basis = after ? 'after charging the commission' : 'before charging the commission';
    const other = after ? pc(adjusted, r) : Math.round((adjusted * r) / (100 + r));
    const onBook = after ? Math.round((book * r) / (100 + r)) : pc(book, r);
    const allDown = book - sum(amounts);
    const onAllDown = allDown > 0 ? (after ? Math.round((allDown * r) / (100 + r)) : pc(allDown, r)) : -1;
    const [BOOK, ADJ] = [inr(book), inr(adjusted)];
    const list = picks.map((a, i) => `(${['i', 'ii', 'iii'][i]}) ${a.text(inr(amounts[i]))}`).join('; ');
    const parts: NumericParts = {
      prompt: `The net profit of ${firm} as per its books, before the adjustments below and before the manager's commission, is ${BOOK}. Adjustments: ${list}. The manager is entitled to a commission of ${r}% of the net profit ${basis}, worked out after making all the adjustments. What is the manager's commission?`,
      answer: commission,
      commonErrors: [
        { value: onBook, why: 'Worked out the commission on the book profit without making the adjustments first.' },
        { value: other, why: `Used the other basis: the commission here is on the profit ${basis}.` },
        { value: onAllDown, why: 'Treated every adjustment as a deduction from profit, although some of them increase it.' },
      ],
      explanation: [
        `Profit after the adjustments = ${BOOK} ${picks.map((a, i) => `${a.sign < 0 ? '-' : '+'} ${inr(amounts[i])}`).join(' ')} = ${ADJ}.`,
        after
          ? `The commission is on the profit after charging it, so commission = ${ADJ} x ${r}/${100 + r} = ${inr(commission)}.`
          : `The commission is on the profit before charging it, so commission = ${ADJ} x ${r}/100 = ${inr(commission)}.`,
      ],
    };
    return { parts, facts: { book, signed: picks.map((a, i) => a.sign * amounts[i]), r, after }, shown: [book, ...amounts] };
  },
  (f) => {
    const adjusted = f.book + sum(f.signed);
    return Math.round(f.after ? (adjusted * f.r) / (100 + f.r) : (adjusted * f.r) / 100);
  },
);

// ---------------------------------------------------------------------------------------------------------------
// Goods taken, given away or lost
// ---------------------------------------------------------------------------------------------------------------

const fireLoss = num(
  'faa-fire-loss', C_GDS, 'medium',
  (rng) => {
    const firm = rng.pick(FIRMS);
    const x = amount(rng, 40000, 200000, 10000), claimPct = rng.pick([50, 60, 75, 80]);
    const claim = pc(x, claimPct), loss = x - claim;
    const selling = rng.pick([0, 0, 120, 125, 150]);
    const price = selling ? pc(x, selling) : 0;
    if (!isWhole(claim, price)) return null;
    const ask = rng.pick(['loss', 'claim'] as const);
    const [X, CL, LS] = [inr(x), inr(claim), inr(loss)];
    const note = selling ? `, and which would have sold for ${inr(price)}` : '';
    const intro = `A fire destroyed goods of ${firm} that had cost ${X}${note}. The insurance company has admitted a claim for ${claimPct}% of the cost of the goods.`;
    const parts: NumericParts =
      ask === 'loss'
        ? {
            prompt: `${intro} What amount of loss by fire is charged to the Profit and Loss Account?`,
            answer: loss,
            commonErrors: [
              { value: x, why: 'Charged the whole cost and ignored the insurance claim.' },
              { value: claim, why: 'Gave the amount to be recovered from the insurer instead of the part that is lost.' },
              ...(selling ? [{ value: price - claim, why: 'Used the selling price of the goods: a loss of stock is measured at cost, never at selling price.' }] : [{ value: x + claim, why: 'Added the claim to the cost instead of deducting it.' }]),
            ],
            explanation: [`Goods lost, at cost = ${X}${selling ? ' (the selling price is not used)' : ''}.`, `Insurance claim admitted = ${X} x ${claimPct}/100 = ${CL}.`, `Loss by fire = ${X} - ${CL} = ${LS}.`],
          }
        : {
            prompt: `${intro} What amount is shown as Insurance Claim Receivable (a current asset) in the balance sheet?`,
            answer: claim,
            commonErrors: [
              { value: loss, why: 'Gave the part that is lost instead of the part to be recovered.' },
              { value: x, why: 'Treated the whole cost as recoverable.' },
              ...(selling ? [{ value: price, why: 'Used the selling price of the goods; the claim is a percentage of the cost.' }] : [{ value: x + claim, why: 'Added the claim to the cost.' }]),
            ],
            explanation: [`Insurance claim admitted = ${X} x ${claimPct}/100 = ${CL}.`, `It has not yet been received, so it is an asset: Insurance Claim Receivable.`],
          };
    return { parts, facts: { x, claimPct, ask }, shown: [x] };
  },
  (f) => (f.ask === 'loss' ? f.x - (f.x * f.claimPct) / 100 : (f.x * f.claimPct) / 100),
);

const gpGoodsDrawn = num(
  'faa-gp-goods-drawn', C_GDS, 'complex',
  (rng) => {
    const firm = rng.pick(FIRMS);
    const os = amount(rng, 20000, 80000, 5000), purchases = amount(rng, 200000, 500000, 10000), wages = amount(rng, 10000, 50000, 5000);
    const g = amount(rng, 5000, 30000, 1000), cs = amount(rng, 30000, 120000, 5000), gp = amount(rng, 60000, 200000, 5000);
    const cogs = os + (purchases - g) + wages - cs, sales = cogs + gp;
    const ask = rng.pick(['gp', 'cogs'] as const);
    const [S, OS, P, W, G, CS, GP, CG] = [sales, os, purchases, wages, g, cs, gp, cogs].map(inr);
    const intro = `${firm} reports: sales ${S}, opening stock ${OS}, purchases ${P}, wages (a direct expense) ${W}. Closing stock, counted at the year end, is ${CS}. The proprietor took goods costing ${G} for personal use during the year; no entry has been made for it and the goods are included in the purchases above.`;
    const parts: NumericParts =
      ask === 'gp'
        ? {
            prompt: `${intro} What is the gross profit?`,
            answer: gp,
            commonErrors: [
              { value: gp - g, why: 'Left the goods taken by the proprietor in the purchases, so the cost of goods sold was overstated.' },
              { value: gp - 2 * g, why: 'Added the goods taken to the cost instead of deducting them from purchases.' },
              { value: gp - cs, why: 'Left out the closing stock.' },
            ],
            explanation: [`Purchases for the Trading Account = ${P} - ${G} = ${inr(purchases - g)} (the goods taken go to Drawings).`, `Cost of goods sold = ${OS} + ${inr(purchases - g)} + ${W} - ${CS} = ${CG}.`, `Gross profit = ${S} - ${CG} = ${GP}.`],
          }
        : {
            prompt: `${intro} What is the cost of goods sold?`,
            answer: cogs,
            commonErrors: [
              { value: cogs + g, why: 'Left the goods taken by the proprietor in the purchases.' },
              { value: cogs + 2 * g, why: 'Added the goods taken to the cost instead of deducting them from purchases.' },
              { value: cogs + cs, why: 'Left out the closing stock.' },
            ],
            explanation: [`Purchases for the Trading Account = ${P} - ${G} = ${inr(purchases - g)}.`, `Cost of goods sold = ${OS} + ${inr(purchases - g)} + ${W} - ${CS} = ${CG}.`],
          };
    return { parts, facts: { sales, os, purchases, wages, g, cs, ask }, shown: [sales, os, purchases, wages, g, cs] };
  },
  // Trading Account by sides, with the goods taken shown as a deduction on the debit side.
  (f) => {
    const debit = f.os + f.purchases + f.wages - f.g;
    const credit = f.sales + f.cs;
    return f.ask === 'gp' ? credit - debit : debit - f.cs;
  },
);

// ---------------------------------------------------------------------------------------------------------------
// Net profit and balance sheet figures after adjustments
// ---------------------------------------------------------------------------------------------------------------

interface Adj {
  sign: 1 | -1;
  text: (a: string) => string;
  effect: string;
}
const ADJ: Adj[] = [
  { sign: -1, text: (a) => `Salaries of ${a} for the last month are outstanding.`, effect: 'An outstanding expense is a further expense of the year, so it reduces profit' },
  { sign: 1, text: (a) => `Insurance premium of ${a} paid during the year relates to the next year.`, effect: 'A prepaid expense is taken out of this year\'s expenses, so it increases profit' },
  { sign: 1, text: (a) => `Commission of ${a} has been earned but not yet received.`, effect: 'Accrued income is extra income of the year, so it increases profit' },
  { sign: -1, text: (a) => `Rent of ${a} received during the year is for the next year.`, effect: 'Income received in advance belongs to next year, so it reduces this year\'s profit' },
  { sign: -1, text: (a) => `Depreciation of ${a} on machinery has not yet been charged.`, effect: 'Depreciation is an expense, so it reduces profit' },
  { sign: -1, text: (a) => `Further bad debts of ${a} are to be written off.`, effect: 'Bad debts are a loss, so they reduce profit' },
  { sign: -1, text: (a) => `Interest on capital of ${a} is to be allowed to the proprietor.`, effect: 'Interest on capital is an expense of the business, so it reduces profit' },
  // Version 2 of the templates that draw from this list: interest on drawings (beyond the Class 11 syllabus) gave way to
  // interest on a loan that is due and unpaid.
  { sign: -1, text: (a) => `Interest of ${a} on the bank loan for the year is due and has not been paid.`, effect: 'Interest on a loan that is due is an expense of the year, though unpaid, so it reduces profit' },
];

const profitOne = num(
  'faa-profit-one', C_NET, 'easy',
  (rng) => {
    const firm = rng.pick(FIRMS), adj = rng.pick(ADJ);
    const a = amount(rng, 2000, 24000, 500), p = amount(rng, 60000, 300000, 5000);
    const ask = rng.pick(['after', 'after', 'before'] as const);
    const after = p + adj.sign * a;
    const [P, A, AF] = [inr(p), inr(a), inr(after)];
    const parts: NumericParts =
      ask === 'after'
        ? {
            prompt: `The net profit of ${firm} before the adjustment below is ${P}. ${adj.text(A)} What is the net profit after the adjustment?`,
            answer: after,
            commonErrors: [
              { value: p - adj.sign * a, why: `Applied the adjustment in the wrong direction (${adj.sign > 0 ? 'deducted it' : 'added it'}).` },
              { value: p, why: 'Left the profit unchanged and ignored the adjustment.' },
            ],
            explanation: [`${adj.effect}.`, `${P} ${adj.sign > 0 ? '+' : '-'} ${A} = ${AF}.`],
          }
        : {
            prompt: `After the adjustment below, the net profit of ${firm} is ${AF}. ${adj.text(A)} What was the net profit before the adjustment?`,
            answer: p,
            commonErrors: [
              { value: after + adj.sign * a, why: `Applied the adjustment again in the same direction instead of reversing it.` },
              { value: after, why: 'Gave the adjusted profit as the profit before the adjustment.' },
            ],
            explanation: [`${adj.effect}.`, `To undo it, the profit before the adjustment is the adjusted profit ${adj.sign > 0 ? 'less' : 'plus'} ${A}.`, `${AF} ${adj.sign > 0 ? '-' : '+'} ${A} = ${P}.`],
          };
    return { parts, facts: { p, a, sign: adj.sign, ask, after }, shown: ask === 'after' ? [p, a] : [after, a] };
  },
  (f) => (f.ask === 'after' ? f.p + f.sign * f.a : f.after - f.sign * f.a),
);

const profitMulti = num(
  'faa-profit-multi', C_NET, 'medium',
  (rng) => {
    const firm = rng.pick(FIRMS);
    const picks = rng.shuffle(ADJ).slice(0, 3);
    const amounts = picks.map(() => amount(rng, 2000, 24000, 500));
    if (new Set(amounts).size < 3) return null;
    const signed = picks.map((a, i) => a.sign * amounts[i]);
    const p = amount(rng, 80000, 300000, 5000);
    const answer = p + sum(signed);
    if (answer <= 0) return null;
    const list = picks.map((a, i) => `(${['i', 'ii', 'iii'][i]}) ${a.text(inr(amounts[i]))}`).join(' ');
    const [P, AN] = [inr(p), inr(answer)];
    const parts: NumericParts = {
      prompt: `The net profit of ${firm} before the adjustments below is ${P}. ${list} What is the net profit after all three adjustments?`,
      answer,
      commonErrors: [
        { value: p - sum(signed), why: 'Reversed the direction of every adjustment: added what should be deducted and deducted what should be added.' },
        { value: p - sum(amounts), why: 'Deducted all three adjustments, although some of them increase profit.' },
        { value: p + sum(amounts), why: 'Added all three adjustments, although some of them reduce profit.' },
        { value: p + sum(signed.filter((s) => s < 0)), why: 'Applied only the adjustments that reduce profit and ignored those that increase it.' },
        { value: p + sum(signed.filter((s) => s > 0)), why: 'Applied only the adjustments that increase profit and ignored those that reduce it.' },
      ],
      explanation: [
        ...picks.map((a, i) => `${a.effect}: ${a.sign > 0 ? '+' : '-'} ${inr(amounts[i])}.`),
        `${P} ${signed.map((s) => `${s < 0 ? '-' : '+'} ${inr(Math.abs(s))}`).join(' ')} = ${AN}.`,
      ],
    };
    return { parts, facts: { p, plus: sum(signed.filter((s) => s > 0)), minus: sum(signed.filter((s) => s < 0)) }, shown: [p, ...amounts] };
  },
  (f) => f.p + f.plus + f.minus,
);

interface GoodsAdj {
  key: string;
  /** The effect on net profit, given the cost of the goods (or the amount) g and the insurance claim c. */
  effect: (g: number, c: number) => number;
  /** What a student who treats the loss as a plain expense (without taking the goods out of Purchases) would apply. */
  naive: (g: number, c: number) => number;
  text: (g: string, c: string) => string;
  note: string;
}
const GOODS_ADJ: GoodsAdj[] = [
  { key: 'drawn', effect: (g) => g, naive: () => 0, text: (g) => `Goods costing ${g} were taken by the proprietor for personal use.`, note: 'Goods taken by the proprietor leave Purchases (Cr) and go to Drawings (Dr): profit rises by their cost' },
  { key: 'samples', effect: () => 0, naive: (g) => -g, text: (g) => `Goods costing ${g} were distributed as free samples.`, note: 'Free samples: Purchases is credited and Advertisement is debited by the same amount, so profit does not change' },
  { key: 'charity', effect: () => 0, naive: (g) => -g, text: (g) => `Goods costing ${g} were given to a charitable trust.`, note: 'Goods given as charity: Purchases is credited and Charity is debited by the same amount, so profit does not change' },
  { key: 'fireIns', effect: (_g, c) => c, naive: (g, c) => -(g - c), text: (g, c) => `Goods costing ${g} were destroyed by fire; the insurance company has admitted a claim of ${c}.`, note: 'Goods destroyed by fire: Purchases is credited with the cost, Loss by Fire is debited with the part not claimed, so profit rises by the claim admitted' },
  { key: 'fireNo', effect: () => 0, naive: (g) => -g, text: (g) => `Goods costing ${g} were destroyed by fire; there is no insurance cover.`, note: 'Uninsured fire loss: Purchases is credited and Loss by Fire is debited by the same amount, so profit does not change' },
];

const profitGoods = num(
  'faa-profit-goods', C_NET, 'complex',
  (rng) => {
    const firm = rng.pick(FIRMS);
    const goods = rng.shuffle(GOODS_ADJ).slice(0, rng.pick([2, 3]));
    const withDep = goods.length === 2 || rng.pick([true, false]);
    if (!goods.some((x) => x.key === 'drawn' || x.key === 'fireIns') && !withDep) return null;
    const costs = goods.map(() => amount(rng, 5000, 40000, 1000));
    const claims = costs.map((c) => pc(c, 60));
    const dep = withDep ? amount(rng, 3000, 20000, 1000) : 0;
    const p = amount(rng, 80000, 300000, 5000);
    const effects = goods.map((x, i) => x.effect(costs[i], claims[i]));
    const answer = p + sum(effects) - dep;
    if (answer <= 0) return null;
    const items = goods.map((x, i) => x.text(inr(costs[i]), inr(claims[i])));
    if (withDep) items.push(`Depreciation of ${inr(dep)} on machinery is to be charged.`);
    const list = items.map((t, i) => `(${['i', 'ii', 'iii', 'iv'][i]}) ${t}`).join(' ');
    const naive = p + sum(goods.map((x, i) => x.naive(costs[i], claims[i]))) - dep;
    const parts: NumericParts = {
      prompt: `The net profit of ${firm} before the items below is ${inr(p)}; it already allows for closing stock counted at the year end, which does not include the goods mentioned. None of the items has been recorded. ${list} Goods are to be taken out of Purchases. What is the net profit after recording all the items?`,
      answer,
      commonErrors: [
        { value: naive, why: 'Treated each loss or gift of goods as a plain expense without crediting Purchases for the goods taken out.' },
        { value: p - dep, why: 'Ignored the goods items on the ground that they do not involve cash.' },
        { value: p - sum(costs) - dep, why: 'Charged the whole cost of every item of goods to the Profit and Loss Account.' },
      ],
      explanation: [
        ...goods.map((x, i) => `${x.note}: ${effects[i] === 0 ? 'no change' : '+ ' + inr(effects[i])}.`),
        ...(withDep ? [`Depreciation: - ${inr(dep)}.`] : []),
        `${inr(p)} + ${inr(sum(effects))}${withDep ? ` - ${inr(dep)}` : ''} = ${inr(answer)}.`,
      ],
    };
    return { parts, facts: { p, effects, dep }, shown: [p, ...costs] };
  },
  (f) => f.p + f.effects.reduce((s, e) => s + e, 0) - f.dep,
);

const plBuild = num(
  'faa-pl-build', C_NET, 'complex',
  (rng) => {
    const firm = rng.pick(FIRMS);
    const g = amount(rng, 150000, 400000, 10000);
    const commR = amount(rng, 5000, 20000, 1000), commA = amount(rng, 1000, 6000, 500);
    const salP = amount(rng, 40000, 100000, 5000), salO = amount(rng, 3000, 10000, 500);
    const insP = amount(rng, 12000, 30000, 1000), insPre = amount(rng, 2000, 8000, 500);
    const dep = amount(rng, 5000, 25000, 1000);
    const withBad = rng.pick([true, true, false]);
    const bad = amount(rng, 2000, 8000, 500), oldP = amount(rng, 3000, 8000, 500), newP = oldP + amount(rng, 2000, 8000, 500);
    const income = g + commR + commA;
    const expenses = salP + salO + insP - insPre + dep + (withBad ? bad + (newP - oldP) : 0);
    const answer = income - expenses;
    if (answer <= 0) return null;
    const bit = withBad
      ? ` Further bad debts of ${inr(bad)} are to be written off, and the Provision for Doubtful Debts account (credit balance ${inr(oldP)}) is to be raised to ${inr(newP)}.`
      : '';
    const wrongNoAccruals = g + commR - salP - insP - dep - (withBad ? bad + (newP - oldP) : 0);
    const wrongSigns = g + commR - commA - (salP - salO) - (insP + insPre) - dep - (withBad ? bad + (newP - oldP) : 0);
    const parts: NumericParts = {
      prompt: `${firm} has a gross profit of ${inr(g)}. Commission received is ${inr(commR)}, and a further ${inr(commA)} has been earned but not yet received. Salaries paid are ${inr(salP)}, and ${inr(salO)} of salaries is outstanding. Insurance paid is ${inr(insP)}, of which ${inr(insPre)} relates to the next year. Depreciation of ${inr(dep)} is to be charged.${bit} What is the net profit for the year?`,
      answer,
      commonErrors: [
        { value: wrongNoAccruals, why: 'Used the cash figures and ignored the accrued commission, the outstanding salaries and the prepaid insurance.' },
        { value: wrongSigns, why: 'Applied the outstanding, prepaid and accrued adjustments in the wrong direction (for instance, deducted accrued income and added prepaid insurance).' },
        withBad
          ? { value: answer - oldP, why: 'Charged the whole new provision instead of only the increase over the old provision.' }
          : { value: answer + dep, why: 'Left out the depreciation.' },
      ],
      explanation: [
        `Income: gross profit ${inr(g)} + commission (${inr(commR)} + ${inr(commA)}) = ${inr(income)}.`,
        `Expenses: salaries (${inr(salP)} + ${inr(salO)}) = ${inr(salP + salO)}; insurance (${inr(insP)} - ${inr(insPre)}) = ${inr(insP - insPre)}; depreciation ${inr(dep)}${withBad ? `; bad debts ${inr(bad)}; increase in provision (${inr(newP)} - ${inr(oldP)}) = ${inr(newP - oldP)}` : ''}.`,
        `Total expenses = ${inr(expenses)}.`,
        `Net profit = ${inr(income)} - ${inr(expenses)} = ${inr(answer)}.`,
      ],
    };
    return { parts, facts: { g, commR, commA, salP, salO, insP, insPre, dep, withBad, bad, oldP, newP }, shown: [g, commR, commA, salP, salO, insP, insPre, dep] };
  },
  // Start from the cash figures and apply each adjustment as a correction.
  (f) => {
    const fromCash = f.g + f.commR - f.salP - f.insP - f.dep - (f.withBad ? f.bad + f.newP - f.oldP : 0);
    return fromCash + f.commA - f.salO + f.insPre;
  },
);

const closingCapital = num(
  'faa-closing-capital', C_INT, 'complex',
  (rng) => {
    const firm = rng.pick(FIRMS);
    const c = amount(rng, 200000, 1000000, 50000), r = rng.pick([5, 6, 8, 10]);
    const ioc = pc(c, r);
    const p = amount(rng, 100000, 400000, 10000), d = amount(rng, 40000, 150000, 5000), iod = amount(rng, 1000, 9000, 500);
    if (ioc === iod || p + c <= d) return null;
    const answer = c + p - d;
    const [C, P, D, IOD] = [inr(c), inr(p), inr(d), inr(iod)];
    const parts: NumericParts = {
      prompt: `The capital of the proprietor of ${firm} was ${C} on 1 April, and no further capital was introduced during the year. The net profit for the year before interest on capital and interest on drawings is ${P}. Interest on capital is allowed at ${r}% per annum on the opening capital. The proprietor's drawings were ${D}, and interest of ${IOD} is charged on them. What is the capital at the end of the year, after all these items?`,
      answer,
      commonErrors: [
        { value: c + p - ioc + iod - d, why: 'Used the adjusted profit but did not add the interest on capital to the capital or the interest on drawings to the drawings.' },
        { value: c + p + ioc - d - iod, why: 'Added the interest on capital to the capital and the interest on drawings to the drawings but forgot to adjust the profit.' },
        { value: c + p + ioc - d, why: 'Added the interest on capital to the capital but forgot the interest on drawings, and did not adjust the profit.' },
      ],
      explanation: [
        `Interest on capital = ${C} x ${r}/100 = ${inr(ioc)}.`,
        `Adjusted profit = ${P} - ${inr(ioc)} + ${IOD} = ${inr(p - ioc + iod)}.`,
        `Closing capital = ${C} + adjusted profit + interest on capital - drawings - interest on drawings = ${C} + ${inr(p - ioc + iod)} + ${inr(ioc)} - ${D} - ${IOD} = ${inr(answer)}.`,
        `Interest on capital and on drawings cancel out: each is charged to the profit and credited to the capital (or the other way round).`,
      ],
    };
    return { parts, facts: { c, r, p, d, iod }, shown: [c, p, d, iod] };
  },
  (f) => {
    const ioc = (f.c / 100) * f.r;
    const adjustedProfit = f.p - ioc + f.iod;
    const capitalAfterInterest = f.c + ioc;
    const drawingsWithInterest = f.d + f.iod;
    return capitalAfterInterest + adjustedProfit - drawingsWithInterest;
  },
);

const currentAssets = num(
  'faa-current-assets', C_NET, 'complex',
  (rng) => {
    const firm = rng.pick(FIRMS);
    const stock = amount(rng, 40000, 150000, 5000), d = amount(rng, 100000, 500000, 20000), b = amount(rng, 4000, 20000, 2000), p = rng.pick([5, 10]);
    const cash = amount(rng, 5000, 30000, 1000), bank = amount(rng, 20000, 90000, 5000), furniture = amount(rng, 40000, 120000, 5000);
    const pre = amount(rng, 2000, 9000, 500), acc = amount(rng, 1000, 6000, 500);
    const base = d - b, prov = pc(base, p), netD = base - prov;
    if (!isWhole(prov)) return null;
    const total = stock + netD + cash + bank + pre + acc;
    const parts: NumericParts = {
      prompt: `At the year end ${firm} has closing stock ${inr(stock)}, sundry debtors ${inr(d)} (before adjustments), cash ${inr(cash)}, bank balance ${inr(bank)} and furniture ${inr(furniture)}. Adjustments: (i) further bad debts of ${inr(b)}; (ii) a provision for doubtful debts of ${p}% on the remaining debtors; (iii) prepaid insurance ${inr(pre)}; (iv) commission accrued ${inr(acc)}. What is the total of the current assets in the balance sheet?`,
      answer: total,
      commonErrors: [
        { value: total + prov, why: 'Wrote off the bad debts but did not deduct the provision for doubtful debts.' },
        { value: total + furniture, why: 'Included furniture, which is a fixed asset, not a current asset.' },
        { value: total - pre - acc, why: 'Left out the prepaid insurance and the accrued commission, which are current assets.' },
        { value: total - netD + (d - pc(d, p)), why: 'Forgot to write off the further bad debts before working out the provision.' },
      ],
      explanation: [
        `Debtors after bad debts = ${inr(d)} - ${inr(b)} = ${inr(base)}; provision at ${p}% = ${inr(prov)}; debtors shown = ${inr(netD)}.`,
        `Current assets = stock ${inr(stock)} + debtors ${inr(netD)} + cash ${inr(cash)} + bank ${inr(bank)} + prepaid ${inr(pre)} + accrued ${inr(acc)} = ${inr(total)}.`,
        `Furniture is a fixed asset and is left out.`,
      ],
    };
    return { parts, facts: { stock, d, b, p, cash, bank, pre, acc }, shown: [stock, d, b, cash, bank, furniture, pre, acc] };
  },
  (f) => {
    const good = ((f.d - f.b) * (100 - f.p)) / 100;
    return [f.stock, good, f.cash, f.bank, f.pre, f.acc].reduce((s, x) => s + x, 0);
  },
);

const currentLiabilities = num(
  'faa-current-liabilities', C_NET, 'medium',
  (rng) => {
    const firm = rng.pick(FIRMS);
    const creditors = amount(rng, 60000, 200000, 10000), bills = amount(rng, 10000, 50000, 5000);
    const outW = amount(rng, 3000, 12000, 500), advRent = amount(rng, 4000, 16000, 500);
    const loan = amount(rng, 100000, 300000, 50000), prepaid = amount(rng, 2000, 9000, 500);
    const total = creditors + bills + outW + advRent;
    const parts: NumericParts = {
      prompt: `${firm} reports at the year end: sundry creditors ${inr(creditors)}; bills payable ${inr(bills)}; a bank loan of ${inr(loan)} repayable after four years; and the following adjustments: wages outstanding ${inr(outW)}, rent received in advance ${inr(advRent)}, insurance prepaid ${inr(prepaid)}. What is the total of the current liabilities?`,
      answer: total,
      commonErrors: [
        { value: total + loan, why: 'Included the bank loan repayable after four years, which is a long-term liability, not a current one.' },
        { value: total - advRent, why: 'Left out the rent received in advance, which is a current liability.' },
        { value: total + prepaid, why: 'Included the prepaid insurance, which is an asset.' },
        { value: total - outW, why: 'Left out the outstanding wages, which are a current liability.' },
      ],
      explanation: [
        `Current liabilities = creditors ${inr(creditors)} + bills payable ${inr(bills)} + outstanding wages ${inr(outW)} + rent received in advance ${inr(advRent)} = ${inr(total)}.`,
        `The loan is repayable after four years (a long-term liability) and the prepaid insurance is an asset, so both are left out.`,
      ],
    };
    return { parts, facts: { items: [creditors, bills, outW, advRent] }, shown: [creditors, bills, loan, outW, advRent, prepaid] };
  },
  (f) => f.items.reduce((s, x) => s + x, 0),
);

// ---------------------------------------------------------------------------------------------------------------
// Adjusting entries (journal, entry stated directly)
// ---------------------------------------------------------------------------------------------------------------

const dr = (accountId: string, amt: number): JournalLine => ({ accountId, side: 'Dr', amount: amt });
const cr = (accountId: string, amt: number): JournalLine => ({ accountId, side: 'Cr', amount: amt });

const OUT_J = [
  { id: 'salaries', name: 'salaries', acc: 'Salaries' }, { id: 'rent', name: 'rent', acc: 'Rent' }, { id: 'wages', name: 'wages', acc: 'Wages' },
  { id: 'electricity', name: 'electricity charges', acc: 'Electricity' }, { id: 'telephone', name: 'telephone charges', acc: 'Telephone' },
  { id: 'auditFees', name: 'audit fees', acc: 'Audit Fees' },
] as const;
const PRE_J = [
  { id: 'insurance', name: 'insurance premium', acc: 'Insurance' }, { id: 'rent', name: 'rent', acc: 'Rent' },
  { id: 'advertisement', name: 'advertisement expenses', acc: 'Advertisement' }, { id: 'salaries', name: 'salaries', acc: 'Salaries' },
] as const;
const INC_J = [
  { id: 'commissionReceived', name: 'commission', acc: 'Commission Received' }, { id: 'rentReceived', name: 'rent', acc: 'Rent Received' },
  { id: 'interestReceived', name: 'interest', acc: 'Interest Received' },
] as const;
const ASSET_ACC: Record<string, string> = {
  machinery: 'Machinery', furniture: 'Furniture', computers: 'Computers', vehicles: 'Vehicles', officeEquipment: 'Office Equipment',
};

const entryOutstanding = entry('faa-entry-outstanding', C_OUT, 'easy', (rng) => {
  const e = rng.pick(OUT_J), a = amount(rng, 2000, 40000, 500), A = inr(a);
  return {
    prompt: rng.pick([
      `An amount of ${A} for ${e.name} relating to the year is still unpaid at the year end. Pass the adjusting entry.`,
      `At the end of the year ${A} is owing for ${e.name} of the year. Pass the adjusting entry.`,
    ]),
    lines: [dr(e.id, a), cr('outstandingExpenses', a)],
    explanation: [`The unpaid ${e.name} is an expense of this year: ${e.acc} A/c is debited.`, 'The amount is owed to others, so it is a liability: Outstanding Expenses A/c is credited.'],
    distractorAccounts: ['prepaidExpenses', 'accruedIncome'],
  };
});

const entryPrepaid = entry('faa-entry-prepaid', C_OUT, 'easy', (rng) => {
  const e = rng.pick(PRE_J), a = amount(rng, 2000, 40000, 500), A = inr(a);
  return {
    prompt: rng.pick([
      `${A} of the ${e.name} paid during the year relates to the next year. Pass the adjusting entry at the year end.`,
      `The ${e.name} paid in the year includes ${A} for the following year. Pass the adjusting entry.`,
    ]),
    lines: [dr('prepaidExpenses', a), cr(e.id, a)],
    explanation: [`The part of the ${e.name} that belongs to next year is an asset, a benefit still to come: Prepaid Expenses A/c is debited.`, `This year's expense is reduced by it: ${e.acc} A/c is credited.`],
    distractorAccounts: ['outstandingExpenses', 'accruedIncome'],
  };
});

const entryAccrued = entry('faa-entry-accrued', C_ACC, 'easy', (rng) => {
  const inc = rng.pick(INC_J), a = amount(rng, 2000, 40000, 500), A = inr(a);
  return {
    prompt: rng.pick([
      `${cap(inc.name)} of ${A} has been earned during the year but has not yet been received. Pass the adjusting entry.`,
      `At the year end ${A} of ${inc.name} for the year is due to the business but still unreceived. Pass the adjusting entry.`,
    ]),
    lines: [dr('accruedIncome', a), cr(inc.id, a)],
    explanation: [`The amount is due to the business: it is an asset, so Accrued Income A/c is debited.`, `The income belongs to this year: ${inc.acc} A/c is credited.`],
    distractorAccounts: ['incomeReceivedInAdvance', 'prepaidExpenses'],
  };
});

const entryAdvance = entry('faa-entry-advance', C_ACC, 'easy', (rng) => {
  const inc = rng.pick(INC_J), a = amount(rng, 2000, 40000, 500), A = inr(a);
  return {
    prompt: rng.pick([
      `${cap(inc.name)} of ${A} received during the year relates to the next year. Pass the adjusting entry.`,
      `The ${inc.name} received in the year includes ${A} for the following year. Pass the adjusting entry at the year end.`,
    ]),
    lines: [dr(inc.id, a), cr('incomeReceivedInAdvance', a)],
    explanation: [`The part that belongs to next year is not this year's income: ${inc.acc} A/c is debited.`, `The business owes that service or benefit, so it is a liability: Income Received in Advance A/c is credited.`],
    distractorAccounts: ['accruedIncome', 'outstandingExpenses'],
  };
});

const entryDepreciation = entry('faa-entry-depreciation', C_DEP, 'easy', (rng) => {
  const a = rng.pick(ASSETS), amt = amount(rng, 5000, 60000, 500), A = inr(amt);
  const direct = rng.pick([true, false]);
  const accName = ASSET_ACC[a.id];
  return direct
    ? {
        prompt: `Depreciation of ${A} is to be charged on ${a.name} for the year. The firm writes depreciation off directly from the asset account. Pass the adjusting entry.`,
        lines: [dr('depreciation', amt), cr(a.id, amt)],
        explanation: ['Depreciation is an expense of the year: Depreciation A/c is debited.', `The asset loses value and the firm reduces the asset account directly: ${accName} A/c is credited.`],
        distractorAccounts: ['provisionForDepreciation'],
      }
    : {
        prompt: `Depreciation of ${A} is to be charged on ${a.name} for the year. The firm keeps a Provision for Depreciation account and leaves the asset at cost. Pass the adjusting entry.`,
        lines: [dr('depreciation', amt), cr('provisionForDepreciation', amt)],
        explanation: ['Depreciation is an expense of the year: Depreciation A/c is debited.', `The asset account stays at cost, so the reduction is credited to Provision for Depreciation A/c.`],
        distractorAccounts: [a.id],
      };
});

const entryBadDebts = entry('faa-entry-bad-debts', C_BAD, 'easy', (rng) => {
  const name = rng.pick(PARTIES), a = amount(rng, 2000, 40000, 500), A = inr(a);
  return {
    prompt: rng.pick([
      `${name}, a debtor, owes ${A} and has been declared insolvent: the amount cannot be recovered. Pass the entry to write it off.`,
      `A debt of ${A} due from ${name} is found to be irrecoverable. Pass the adjusting entry to write it off as bad.`,
    ]),
    lines: [dr('badDebts', a), cr(debtor(name), a)],
    explanation: ['The irrecoverable debt is a loss: Bad Debts A/c is debited.', `The debtor no longer owes anything that can be collected: ${name}'s account is credited.`],
    distractorAccounts: ['provisionForDoubtfulDebts', 'sales'],
  };
});

/**
 * Bad debts set off against an existing provision. The entries that create, raise or reduce a provision are passed
 * through the Profit and Loss Account, which is not an account a learner can pick here, so the journal questions on
 * the provision ask for the transfer of bad debts to it; the amount of the charge or write-back is asked as a figure
 * (see `faa-provision-increase`, `faa-provision-writeback` and `faa-bad-debts-charge`).
 */
const entryProvision = entry('faa-entry-provision', C_BAD, 'medium', (rng) => {
  const bad = amount(rng, 2000, 12000, 500), old = bad + amount(rng, 2000, 20000, 500);
  const [B, O] = [inr(bad), inr(old)];
  return {
    prompt: rng.pick([
      `Bad debts of ${B} written off during the year stand on the debit side of Bad Debts A/c. The firm has a Provision for Doubtful Debts A/c with a credit balance of ${O}, built up in earlier years to meet such losses, and sets its bad debts off against it. Pass the entry that transfers the bad debts to the provision.`,
      `A trial balance shows Bad Debts ${B} (debit) and Provision for Doubtful Debts ${O} (credit). The firm sets its bad debts off against the provision before it works out the provision needed for next year. Pass the entry for the set-off.`,
      `A firm keeps a Provision for Doubtful Debts A/c, which has a credit balance of ${O}. At the year end its Bad Debts A/c shows ${B} written off during the year. Pass the entry that closes Bad Debts A/c by transfer to the provision.`,
    ]),
    lines: [dr('provisionForDoubtfulDebts', bad), cr('badDebts', bad)],
    explanation: [
      'The provision was made in earlier years to absorb exactly this loss, so part of it is now used up: Provision for Doubtful Debts A/c is debited.',
      'Bad Debts A/c is closed by the transfer: Bad Debts A/c is credited.',
      `The provision is left with ${O} - ${B} = ${inr(old - bad)}. Only the difference between this balance and the provision now required goes to the Profit and Loss Account.`,
    ],
    distractorAccounts: ['debtor:Mohan', 'badDebtsRecovered'],
  };
});

const entryIntCapital = entry('faa-entry-int-capital', C_INT, 'easy', (rng) => {
  const c = amount(rng, 100000, 800000, 50000), r = rng.pick([5, 6, 8, 10, 12]);
  const i = pc(c, r);
  return {
    prompt: `Interest on capital for the year, ${inr(i)} (${r}% on the proprietor's capital of ${inr(c)}), is to be allowed to the proprietor and added to the capital. Pass the adjusting entry.`,
    lines: [dr('interestOnCapital', i), cr('capital', i)],
    explanation: ['Interest on capital is an expense of the business: Interest on Capital A/c is debited.', 'It is added to the proprietor\'s capital: Capital A/c is credited.'],
    distractorAccounts: ['drawings', 'interestReceived'],
  };
});

const entryIntDrawings = entry('faa-entry-int-drawings', C_INT, 'easy', (rng) => {
  const i = amount(rng, 500, 15000, 250);
  return {
    prompt: rng.pick([
      `Interest on the proprietor's drawings for the year amounts to ${inr(i)}. It is to be charged to the proprietor by debiting the Drawings account. Pass the adjusting entry.`,
      `The proprietor is to be charged interest of ${inr(i)} on the amounts withdrawn during the year; the interest is added to the drawings. Pass the adjusting entry.`,
      `Interest on drawings of ${inr(i)} has not yet been recorded. The firm debits such interest to the proprietor's Drawings account. Pass the adjusting entry.`,
    ]),
    lines: [dr('drawings', i), cr('interestOnDrawings', i)],
    explanation: ['The proprietor owes this interest, and it increases the proprietor\'s drawings: Drawings A/c is debited.', 'Interest charged on drawings is an income of the business: Interest on Drawings A/c is credited.'],
    distractorAccounts: ['interestOnCapital', 'capital'],
  };
});

const H_COMMISSION_ENTRY = [
  'First find the commission on the basis stated; then ask what the business owes at the year end.',
  "The commission is an expense of the year (Manager's Commission A/c Dr), and the unpaid amount is a liability (To Outstanding Manager's Commission A/c).",
];
const entryCommission = entry('faa-entry-commission', C_COM, 'medium', (rng) => {
  const firm = rng.pick(FIRMS);
  const r = rng.pick([5, 8, 10, 12, 20, 25]);
  const p = amount(rng, 60000, 400000, 5000);
  const after = rng.pick([true, false]);
  const c = after ? (p * r) / (100 + r) : pc(p, r);
  if (!isWhole(c) || c <= 0) return null;
  const basis = after
    ? `${r}% of the net profit after charging the commission`
    : `${r}% of the net profit before charging the commission`;
  return {
    prompt: `The manager of ${firm} is entitled to a commission of ${basis}, which works out to ${inr(c)} (the net profit before charging it is ${inr(p)}). The commission has not been paid by the year end. Pass the adjusting entry for the manager's commission.`,
    // Version 2: the accounts the board uses, Manager's Commission A/c and Outstanding Manager's Commission A/c.
    lines: [dr('managersCommission', c), cr('outstandingManagersCommission', c)],
    explanation: [
      after
        ? `On the profit after the commission, commission = ${inr(p)} x ${r}/${100 + r} = ${inr(c)}.`
        : `On the profit before the commission, commission = ${inr(p)} x ${r}/100 = ${inr(c)}.`,
      "The commission is an expense of the year: Manager's Commission A/c is debited.",
      "It is unpaid, so the firm owes it to the manager, a current liability: Outstanding Manager's Commission A/c is credited.",
    ],
    hints: H_COMMISSION_ENTRY,
    distractorAccounts: ['commissionPaid', 'outstandingExpenses', 'commissionReceived', 'salaries'],
  };
});

const entryGoodsDrawn = entry('faa-entry-goods-drawn', C_GDS, 'easy', (rng) => {
  const a = amount(rng, 2000, 40000, 500);
  return {
    prompt: rng.pick([
      `The proprietor took goods costing ${inr(a)} from the shop for personal use, and no entry was made. Pass the adjusting entry, taking the goods out of Purchases A/c.`,
      `Goods costing ${inr(a)} were used at the proprietor's home during the year. Pass the adjusting entry, taking the goods out of Purchases A/c.`,
    ]),
    lines: [dr('drawings', a), cr('purchases', a)],
    explanation: ['Goods taken for personal use are the proprietor\'s drawings: Drawings A/c is debited.', 'The goods leave the stock bought for sale: Purchases A/c is credited at cost.'],
    distractorAccounts: ['sales', 'stock'],
  };
});

const entryCharitySamples = entry('faa-entry-charity-samples', C_GDS, 'medium', (rng) => {
  const a = amount(rng, 2000, 40000, 500);
  const samples = rng.pick([true, false]);
  return samples
    ? {
        prompt: `Goods costing ${inr(a)} were distributed free to prospective customers as samples, and no entry was made. Pass the adjusting entry, taking the goods out of Purchases A/c.`,
        lines: [dr('advertisement', a), cr('purchases', a)],
        explanation: ['Free samples are given to promote sales: Advertisement A/c is debited.', 'The goods leave the stock bought for sale: Purchases A/c is credited at cost.'],
        distractorAccounts: ['charity', 'drawings'],
      }
    : {
        prompt: `Goods costing ${inr(a)} were given to a charitable trust, and no entry was made. Pass the adjusting entry, taking the goods out of Purchases A/c.`,
        lines: [dr('charity', a), cr('purchases', a)],
        explanation: ['A gift to a charitable trust is a donation: Charity A/c is debited.', 'The goods leave the stock bought for sale: Purchases A/c is credited at cost.'],
        distractorAccounts: ['advertisement', 'drawings'],
      };
});

const entryFireUninsured = entry('faa-entry-fire-uninsured', C_GDS, 'medium', (rng) => {
  const a = amount(rng, 5000, 80000, 500);
  return {
    prompt: rng.pick([
      `Goods costing ${inr(a)} were destroyed by fire, and there is no insurance cover. Pass the adjusting entry, taking the goods out of Purchases A/c.`,
      `A fire in the godown destroyed goods that had cost ${inr(a)}. The goods were not insured. Pass the adjusting entry, taking the goods out of Purchases A/c.`,
    ]),
    lines: [dr('lossByFire', a), cr('purchases', a)],
    explanation: ['The whole cost is lost and nothing can be claimed: Loss by Fire A/c is debited.', 'The goods leave the stock bought for sale: Purchases A/c is credited at cost.'],
    distractorAccounts: ['stock', 'insuranceClaimReceivable'],
  };
});

const entryFireInsured = journalTemplate({
  id: 'faa-entry-fire-insured', topicId: T, conceptId: C_GDS, difficulty: 'complex',
  generate: (rng) => {
    const x = amount(rng, 10000, 100000, 5000), claimPct = rng.pick([50, 60, 75, 80]);
    const claim = pc(x, claimPct), loss = x - claim;
    if (!isWhole(claim, loss) || loss <= 0) return null;
    return {
      prompt: `Goods costing ${inr(x)} were destroyed by fire. The insurance company has admitted a claim of ${inr(claim)}, which has not yet been received. Pass one compound adjusting entry: take the goods out of Purchases A/c at cost, show the claim as receivable, and charge only the part not covered as the loss.`,
      lines: [dr('insuranceClaimReceivable', claim), dr('lossByFire', loss), cr('purchases', x)],
      explanation: ['The admitted claim is due from the insurer: Insurance Claim Receivable A/c is debited.', `The part not recoverable (${inr(x)} - ${inr(claim)} = ${inr(loss)}) is the loss: Loss by Fire A/c is debited.`, 'The whole cost leaves the stock bought for sale: Purchases A/c is credited.'],
      distractorAccounts: ['stock', 'insurance'],
    };
  },
  // The two debits must add up to the credit, and the prompt must show the cost and the claim.
  verify: (q) => {
    const get = (id: string) => q.expected.find((l) => l.accountId === id)?.amount ?? -1;
    return get('insuranceClaimReceivable') + get('lossByFire') === get('purchases') && q.prompt.includes(inr(get('purchases'))) && q.prompt.includes(inr(get('insuranceClaimReceivable')));
  },
});

/**
 * A debtor declared insolvent who pays part of the debt: a compound entry with the amount recovered and the amount
 * lost. (It replaces `faa-entry-bad-debts-provision`, whose entry charged an increase in the provision to Bad Debts
 * A/c; the standard entry debits the Profit and Loss Account, which a learner cannot pick here.)
 */
const entryInsolventDebtor = (() => {
  let last: { prompt: string; owed: number; paise: number } | undefined;
  const t = entry('faa-entry-insolvent-debtor', C_BAD, 'complex', (rng) => {
    const name = rng.pick(PARTIES);
    const owed = amount(rng, 10000, 80000, 2000), paise = rng.pick([20, 25, 30, 40, 60, 70, 75]);
    const got = pc(owed, paise), lost = owed - got;
    if (!isWhole(got)) return null;
    const byCheque = rng.pick([true, false]);
    const prompt = `After the trial balance was drawn up, it was learnt that ${name}, a debtor owing ${inr(owed)}, had been declared insolvent. A first and final payment of ${paise} paise in the rupee was received from the estate ${byCheque ? 'by cheque, which was deposited into the bank the same day' : 'in cash'}; the rest cannot be recovered. No entry has been made. Pass one compound entry to close the debtor's account.`;
    last = { prompt, owed, paise };
    return {
      prompt,
      lines: [dr(byCheque ? 'bank' : 'cash', got), dr('badDebts', lost), cr(debtor(name), owed)],
      explanation: [
        `Amount received = ${inr(owed)} x ${paise}/100 = ${inr(got)}: ${byCheque ? 'Bank' : 'Cash'} A/c is debited.`,
        `The rest, ${inr(owed)} - ${inr(got)} = ${inr(lost)}, is irrecoverable: Bad Debts A/c is debited.`,
        `Nothing more can be collected, so the debtor's account is closed: it is credited with the full ${inr(owed)}.`,
        `In the final accounts the ${inr(lost)} is a further bad debt, charged to the Profit and Loss Account, and sundry debtors fall by ${inr(owed)}.`,
      ],
      distractorAccounts: ['discountAllowed', 'provisionForDoubtfulDebts'],
    };
  });
  return {
    ...t,
    // Worked the other way: the loss is the paise not paid on each rupee, and the two debits close the account.
    verify: (q: JournalQuestion) => {
      if (!last || last.prompt !== q.prompt) return false;
      const lost = (last.owed / 100) * (100 - last.paise);
      const bad = q.expected.find((l) => l.accountId === 'badDebts');
      const credit = q.expected.find((l) => l.side === 'Cr');
      const sumDr = q.expected.filter((l) => l.side === 'Dr').reduce((x, l) => x + l.amount, 0);
      return bad?.side === 'Dr' && bad.amount === lost && credit?.amount === last.owed && sumDr === last.owed && q.prompt.includes(inr(last.owed));
    },
  };
})();

// ---------------------------------------------------------------------------------------------------------------
// Choice questions: where each effect of an adjustment appears, and the order of operations on debtors
// ---------------------------------------------------------------------------------------------------------------

interface EffectItem {
  scenario: (x: string) => string;
  /** Where the first effect appears (in the Trading or Profit and Loss Account), and the second (balance sheet). */
  pl: string;
  bs: string;
  /** Why the two effects are what they are (shown in the explanation). */
  reason: string;
  wrong: [string, string, string][];
}

const EFFECT_ITEMS: EffectItem[] = [
  {
    scenario: (x) => `Closing stock of ${x} is given as an adjustment at the year end.`,
    pl: 'Credited in the Trading Account', bs: 'shown as a current asset',
    reason: 'Unsold goods are taken out of the cost of the goods sold, and the business still owns them.',
    wrong: [
      ['Debited in the Trading Account', 'shown as a current asset', 'Put the closing stock on the debit side with the opening stock.'],
      ['Credited in the Trading Account', 'not shown in the balance sheet', 'Remembered only the Trading Account effect: the unsold goods are also an asset still owned.'],
      ['Credited in the Profit and Loss Account as an income', 'shown as a current asset', 'Treated closing stock as an income of the Profit and Loss Account instead of a Trading Account item.'],
      ['Debited in the Trading Account', 'shown as a current liability', 'Treated unsold goods as something the business owes.'],
    ],
  },
  {
    scenario: (x) => `Rent of ${x} for the last month of the year is outstanding.`,
    pl: 'Added to rent on the debit side of the Profit and Loss Account', bs: 'shown as a current liability',
    reason: 'The rent belongs to this year although it is unpaid, and the unpaid amount is owed to the landlord.',
    wrong: [
      ['Deducted from rent on the debit side of the Profit and Loss Account', 'shown as a current asset', 'Treated the outstanding rent like a prepaid expense.'],
      ['Added to rent on the debit side of the Profit and Loss Account', 'shown as a current asset', 'Took an amount the business owes as something it owns.'],
      ['Deducted from rent on the debit side of the Profit and Loss Account', 'shown as a current liability', 'Deducted the unpaid rent from the expense, though it is a further expense of the year.'],
      ['Left unchanged in the Profit and Loss Account', 'shown as a current liability', 'Waited for the cash payment before charging the rent, ignoring that the expense belongs to this year.'],
    ],
  },
  {
    scenario: (x) => `Insurance premium of ${x} paid during the year relates to the next year.`,
    pl: 'Deducted from insurance on the debit side of the Profit and Loss Account', bs: 'shown as a current asset',
    reason: 'The part paid for next year is not an expense of this year; it is a benefit still to come.',
    wrong: [
      ['Added to insurance on the debit side of the Profit and Loss Account', 'shown as a current liability', 'Treated the prepaid insurance like an outstanding expense.'],
      ['Deducted from insurance on the debit side of the Profit and Loss Account', 'shown as a current liability', 'Took money paid in advance as a debt of the business.'],
      ['Added to insurance on the debit side of the Profit and Loss Account', 'shown as a current asset', 'Added the prepaid amount to the expense instead of taking it out.'],
      ['Left unchanged in the Profit and Loss Account', 'shown as a current asset', 'Charged the whole cash payment as this year\'s expense, ignoring the part that belongs to next year.'],
    ],
  },
  {
    scenario: (x) => `Commission of ${x} has been earned during the year but not yet received.`,
    pl: 'Added to commission received on the credit side of the Profit and Loss Account', bs: 'shown as a current asset',
    reason: 'The commission was earned this year although the cash has not come in, and the amount is due to the business.',
    wrong: [
      ['Deducted from commission received on the credit side of the Profit and Loss Account', 'shown as a current liability', 'Treated accrued commission like income received in advance.'],
      ['Added to commission received on the credit side of the Profit and Loss Account', 'shown as a current liability', 'Took money the business is yet to receive as a debt it owes.'],
      ['Added to expenses on the debit side of the Profit and Loss Account', 'shown as a current asset', 'Treated the commission earned as an expense.'],
      ['Left unchanged in the Profit and Loss Account', 'shown as a current asset', 'Waited for the cash before recording the income, ignoring that it was earned this year.'],
    ],
  },
  {
    scenario: (x) => `Rent of ${x} received during the year is for the next year.`,
    pl: 'Deducted from rent received on the credit side of the Profit and Loss Account', bs: 'shown as a current liability',
    reason: 'The rent belongs to next year, and until then the business owes the tenant the use of the premises.',
    wrong: [
      ['Added to rent received on the credit side of the Profit and Loss Account', 'shown as a current asset', 'Treated rent received in advance like accrued income.'],
      ['Deducted from rent received on the credit side of the Profit and Loss Account', 'shown as a current asset', 'Took money received as something the business owns, though it still owes the tenant the use of the premises.'],
      ['Added to rent received on the credit side of the Profit and Loss Account', 'shown as a current liability', 'Added the advance to this year\'s income instead of taking it out.'],
      ['Left unchanged in the Profit and Loss Account', 'shown as a current liability', 'Counted all the cash received as this year\'s income.'],
    ],
  },
  {
    scenario: (x) => `Depreciation of ${x} is to be charged on machinery.`,
    pl: 'Debited as an expense in the Profit and Loss Account', bs: 'deducted from the machinery',
    reason: 'The fall in value is an expense of the year, and the machinery is worth that much less.',
    wrong: [
      ['Debited as an expense in the Profit and Loss Account', 'shown as a current liability', 'Treated depreciation as an amount the business owes.'],
      ['Debited as an expense in the Profit and Loss Account', 'not shown; the machinery stays at its original cost', 'Forgot the second effect: the value of the asset must be reduced.'],
      ['Credited as an income in the Profit and Loss Account', 'deducted from the machinery', 'Took the reduction of the asset as an income.'],
      ['Debited as an expense in the Profit and Loss Account', 'added to the machinery', 'Added the depreciation to the asset instead of deducting it.'],
    ],
  },
  {
    scenario: (x) => `Further bad debts of ${x} are to be written off.`,
    pl: 'Debited as a loss in the Profit and Loss Account', bs: 'deducted from sundry debtors',
    reason: 'The amount will never be collected: it is a loss of the year, and those debtors are no longer an asset.',
    wrong: [
      ['Debited as a loss in the Profit and Loss Account', 'added to sundry debtors', 'Added the bad debts to the debtors instead of deducting them.'],
      ['Debited as a loss in the Profit and Loss Account', 'shown as a current liability', 'Treated the bad debts as an amount the business owes.'],
      ['Left unchanged in the Profit and Loss Account', 'deducted from sundry debtors', 'Reduced the debtors but forgot that the loss must be charged to profit.'],
      ['Credited as a gain in the Profit and Loss Account', 'deducted from sundry debtors', 'Took the write-off of a debt as a gain.'],
    ],
  },
  {
    scenario: (x) => `Interest on capital of ${x} is to be allowed to the proprietor.`,
    pl: 'Debited as an expense in the Profit and Loss Account', bs: 'added to the proprietor\'s capital',
    reason: 'The business treats the interest as a cost of using the money of the proprietor, and the proprietor\'s claim on the business grows by it.',
    wrong: [
      ['Credited as an income in the Profit and Loss Account', 'added to the proprietor\'s capital', 'Treated interest on capital as an income of the business.'],
      ['Debited as an expense in the Profit and Loss Account', 'deducted from the proprietor\'s capital', 'Confused it with drawings, which reduce capital.'],
      ['Debited as an expense in the Profit and Loss Account', 'shown as a current liability', 'Showed the interest as a liability instead of adding it to capital.'],
      ['Credited as an income in the Profit and Loss Account', 'deducted from the proprietor\'s capital', 'Reversed both effects.'],
    ],
  },
  // Interest on drawings of a sole proprietor is beyond the Class 11 syllabus: this place (version 2) is a provision for
  // discount on debtors.
  {
    scenario: (x) => `A provision for discount on debtors of ${x} is to be made on the good debtors.`,
    pl: 'Debited as a charge in the Profit and Loss Account', bs: 'deducted from sundry debtors',
    reason: 'The discount the good debtors are expected to take is a cost of this year\'s sales, and the debtors are shown at what is expected to come in.',
    wrong: [
      ['Credited as a gain in the Profit and Loss Account', 'deducted from sundry debtors', 'Took the discount the business expects to allow as a discount it will receive.'],
      ['Debited as a charge in the Profit and Loss Account', 'shown as a current liability', 'Showed the provision as a liability instead of deducting it from the debtors.'],
      ['Debited as a charge in the Profit and Loss Account', 'added to sundry debtors', 'Added the provision to the debtors instead of deducting it.'],
      ['Left unchanged in the Profit and Loss Account', 'deducted from sundry debtors', 'Reduced the debtors but did not charge the provision to profit.'],
    ],
  },
  {
    scenario: (x) => `A manager's commission of ${x} for the year has been calculated but not yet paid.`,
    pl: 'Debited as an expense in the Profit and Loss Account', bs: 'shown as a current liability (outstanding commission)',
    reason: 'The commission is a cost of this year, and until it is paid the firm owes it to the manager.',
    wrong: [
      ['Debited as an expense in the Profit and Loss Account', 'shown as a current asset', 'Treated an amount payable as an amount receivable.'],
      ['Credited as an income in the Profit and Loss Account', 'shown as a current liability (outstanding commission)', 'Took commission payable to the manager as an income.'],
      ['Left unchanged in the Profit and Loss Account', 'shown as a current liability (outstanding commission)', 'Waited for the payment before charging the commission, ignoring that it is earned this year.'],
      ['Debited as an expense in the Profit and Loss Account', 'deducted from the proprietor\'s capital', 'Treated the commission as the proprietor\'s drawings.'],
    ],
  },
  {
    scenario: (x) => `The proprietor took goods costing ${x} for personal use, and no entry has been made.`,
    pl: 'Deducted from purchases in the Trading Account', bs: 'added to drawings, so capital is reduced',
    reason: 'The goods were not bought for sale after all, so they come out of purchases at cost and are charged to the proprietor.',
    wrong: [
      ['Debited as an expense in the Profit and Loss Account', 'added to drawings, so capital is reduced', 'Treated the goods taken as an expense instead of taking them out of purchases.'],
      ['Deducted from sales in the Trading Account', 'added to drawings, so capital is reduced', 'Reduced sales, although the goods were not sold.'],
      ['Deducted from purchases in the Trading Account', 'shown as a current asset', 'Showed the goods taken as an asset though they have left the business.'],
      ['Not recorded, since no cash is involved', 'not recorded', 'Thought a transaction without cash needs no entry.'],
    ],
  },
  {
    scenario: (x) => `A provision for doubtful debts of ${x} is to be created.`,
    pl: 'Debited as a charge in the Profit and Loss Account', bs: 'deducted from sundry debtors',
    reason: 'The probable loss is charged in the year of the sale, and debtors are shown at the amount expected to be collected.',
    wrong: [
      ['Debited as a charge in the Profit and Loss Account', 'shown as a current liability', 'Showed the provision as a liability instead of deducting it from the debtors.'],
      ['Debited as a charge in the Profit and Loss Account', 'added to sundry debtors', 'Added the provision to the debtors instead of deducting it.'],
      ['Credited as a gain in the Profit and Loss Account', 'deducted from sundry debtors', 'Took the provision as a gain, though it is a charge against profit.'],
      ['Left unchanged in the Profit and Loss Account', 'deducted from sundry debtors', 'Reduced the debtors but did not charge the provision to profit.'],
    ],
  },
];

const effectsWhere = mcq(
  'faa-effects-where', C_TWO, 'easy',
  (rng) => {
    const it = rng.pick(EFFECT_ITEMS);
    const x = inr(amount(rng, 2000, 60000, 500));
    const text = (pl: string, bs: string) => `${pl}, and ${bs}`;
    return {
      prompt: `${it.scenario(x)} Which option shows where the two effects of this adjustment appear in the final accounts of a sole proprietor?`,
      correct: text(it.pl, it.bs),
      distractors: it.wrong.map(([pl, bs, why]) => ({ text: text(pl, bs), why })),
      explanation: `Every adjustment has two effects. Here it is ${it.pl.charAt(0).toLowerCase() + it.pl.slice(1)}, and it is ${it.bs}. ${it.reason}`,
      hints: ['Name the two accounts the adjustment changes: one in the Trading or Profit and Loss Account, one in the balance sheet.', 'Is it something the business owns (asset), owes (liability), or a change in an expense or income?'],
    };
  },
);

// Only indirect expenses and incomes: wages and other direct expenses are adjusted in the Trading Account.
// Each line is [the name used in the sentence, the name of the item in the Profit and Loss Account].
const PL_EXPENSES_OUT: [string, string][] = [['rent', 'rent'], ['salaries', 'salaries'], ['electricity charges', 'electricity charges'], ['telephone charges', 'telephone charges']];
const PL_EXPENSES_PRE: [string, string][] = [['insurance premium', 'insurance'], ['rent', 'rent'], ['advertisement expenses', 'advertisement'], ['salaries', 'salaries']];
const PL_INCOMES: [string, string][] = [['commission', 'commission received'], ['rent', 'rent received'], ['interest', 'interest received']];
const PL_ITEMS = [
  { kind: 'out', add: true, debit: true, lines: PL_EXPENSES_OUT, scenario: (l: string, x: string) => `An amount of ${x} for ${l} of the last month of the year is unpaid at the year end.`, confused: 'a prepaid expense', adj: 'outstanding expense' },
  { kind: 'pre', add: false, debit: true, lines: PL_EXPENSES_PRE, scenario: (l: string, x: string) => `Of the ${l} paid during the year, ${x} relates to the next year.`, confused: 'an outstanding expense', adj: 'prepaid expense' },
  { kind: 'acc', add: true, debit: false, lines: PL_INCOMES, scenario: (l: string, x: string) => `${cap(l)} of ${x} has been earned for the year but has not yet been received.`, confused: 'income received in advance', adj: 'accrued income' },
  { kind: 'adv', add: false, debit: false, lines: PL_INCOMES, scenario: (l: string, x: string) => `Of the ${l} received during the year, ${x} relates to the next year.`, confused: 'accrued income', adj: 'income received in advance' },
] as const;

const plSideText = (line: string, add: boolean, debit: boolean) =>
  `${add ? 'Added to' : 'Deducted from'} ${line} on the ${debit ? 'debit' : 'credit'} side of the Profit and Loss Account`;

const plSide = (() => {
  let last: { prompt: string; kind: string } | undefined;
  const t = mcq(
    'faa-pl-side', C_TWO, 'easy',
    (rng) => {
      const it = rng.pick(PL_ITEMS), [named, line] = rng.pick(it.lines);
      const x = inr(amount(rng, 2000, 60000, 500));
      const prompt = `${it.scenario(named, x)} How is this adjustment shown in the Profit and Loss Account?`;
      last = { prompt, kind: it.kind };
      const why = (add: boolean, debit: boolean): string => {
        if (debit !== it.debit && add !== it.add) return 'Reversed both the sign and the side of the adjustment.';
        if (debit !== it.debit) return it.debit ? 'Put an expense on the income (credit) side of the account.' : 'Put an income on the expense (debit) side of the account.';
        return `Applied the treatment of ${it.confused}: ${it.add ? 'deducted the amount where it should be added' : 'added the amount where it should be deducted'}.`;
      };
      const combos: [boolean, boolean][] = [[true, true], [false, true], [true, false], [false, false]];
      const [right, ...others] = [[it.add, it.debit] as [boolean, boolean], ...combos.filter(([a, d]) => !(a === it.add && d === it.debit))];
      return {
        prompt,
        correct: plSideText(line, right[0], right[1]),
        distractors: others.map(([a, d]) => ({ text: plSideText(line, a, d), why: why(a, d) })),
        explanation: `${cap(it.adj)}: ${it.add ? 'added to' : 'deducted from'} ${line} on the ${it.debit ? 'debit (expense)' : 'credit (income)'} side. ${it.add ? 'The amount belongs to this year, so it increases the figure.' : 'The amount belongs to the next year, so it is taken out of this year\'s figure.'}`,
      };
    },
    // Independent rule: an outstanding expense or accrued income is added; a prepaid expense or advance is deducted;
    // expenses sit on the debit side and incomes on the credit side.
    (q) => {
      if (!last || last.prompt !== q.prompt) return false;
      const right = q.options.find((o) => o.id === q.correct)?.text ?? '';
      const expectAdd = last.kind === 'out' || last.kind === 'acc';
      const expectDebit = last.kind === 'out' || last.kind === 'pre';
      return right.startsWith(expectAdd ? 'Added to' : 'Deducted from') && right.includes(expectDebit ? 'debit side' : 'credit side');
    },
  );
  return t;
})();

const BS_OPTIONS = {
  asset: 'A current asset',
  liability: 'A current liability',
  debtors: 'Deducted from sundry debtors',
  addCapital: 'Added to the proprietor\'s capital',
  lessCapital: 'Deducted from the proprietor\'s capital',
  fixed: 'Deducted from the value of the asset it relates to',
  none: 'Not shown in the balance sheet',
};
type BsKey = keyof typeof BS_OPTIONS;

const BS_REASONS: Record<BsKey, string> = {
  asset: 'The business owns it, or is still to receive the money or the benefit, within the coming year.',
  liability: 'The business owes the money or the service, and must settle it within the coming year.',
  debtors: 'A provision against debtors is not owed to anyone: it brings the debtors down to the amount expected to be collected.',
  addCapital: 'It is credited to the proprietor, so the proprietor\'s claim on the business grows.',
  lessCapital: 'It is charged to the proprietor as drawings, and drawings are deducted from capital.',
  fixed: 'The asset has lost that much of its value, so it is shown at the reduced figure.',
  none: 'It leaves nothing owned or owed at the year end.',
};

const BS_ITEMS: { scenario: (x: string) => string; right: BsKey; wrong: [BsKey, string][] }[] = [
  { scenario: (x) => `Salaries of ${x} for the last month are outstanding.`, right: 'liability',
    wrong: [['asset', 'Took an amount the business owes as something it owns.'], ['none', 'Thought an unpaid expense does not appear in the balance sheet, though the amount owed is a liability.'], ['debtors', 'Mixed it up with a provision against debtors.']] },
  { scenario: (x) => `Insurance premium of ${x} has been paid in advance for the next year.`, right: 'asset',
    wrong: [['liability', 'Took money paid in advance as a debt of the business.'], ['none', 'Forgot that the unused cover is an asset.'], ['fixed', 'Deducted it from a fixed asset, as is done with depreciation.']] },
  { scenario: (x) => `Interest of ${x} has been earned on investments but not yet received.`, right: 'asset',
    wrong: [['liability', 'Took interest still to be received as a debt owed by the business.'], ['none', 'Forgot that interest earned but not received is an asset.'], ['debtors', 'Mixed it up with a provision against debtors.']] },
  { scenario: (x) => `Commission of ${x} received during the year is for the next year.`, right: 'liability',
    wrong: [['asset', 'Took money received as something the business owns, though it owes the service.'], ['none', 'Forgot that money received in advance is owed in service to the payer.'], ['addCapital', 'Treated the advance as profit already earned and added it to capital.']] },
  { scenario: (x) => `A provision for doubtful debts of ${x} has been created.`, right: 'debtors',
    wrong: [['liability', 'Showed the provision as a liability instead of deducting it from the debtors.'], ['asset', 'Showed the provision as a current asset.'], ['none', 'Forgot the balance sheet effect of the provision.']] },
  { scenario: (x) => `Interest on capital of ${x} has been allowed to the proprietor.`, right: 'addCapital',
    wrong: [['lessCapital', 'Confused it with drawings, which reduce capital.'], ['liability', 'Showed the interest as a liability instead of adding it to capital.'], ['none', 'Forgot that the interest increases the proprietor\'s capital.']] },
  // Version 2: a provision for discount on debtors in the place of interest on drawings (beyond the Class 11 syllabus).
  { scenario: (x) => `A provision for discount on debtors of ${x} has been made on the good debtors.`, right: 'debtors',
    wrong: [['liability', 'Showed the provision as a liability instead of deducting it from the debtors.'], ['lessCapital', 'Treated the provision as if the proprietor had taken it out.'], ['none', 'Forgot the balance sheet effect of the provision.']] },
  { scenario: (x) => `Closing stock of ${x} is given as an adjustment at the year end.`, right: 'asset',
    wrong: [['none', 'Remembered only the Trading Account effect: the unsold goods are also an asset still owned.'], ['liability', 'Treated unsold goods as something the business owes.'], ['fixed', 'Deducted it from a fixed asset.']] },
  { scenario: (x) => `Depreciation of ${x} has been charged on machinery.`, right: 'fixed',
    wrong: [['liability', 'Treated depreciation as an amount the business owes.'], ['asset', 'Showed the depreciation as a current asset.'], ['none', 'Forgot that the value of the machinery is reduced.']] },
];

const bsPlacement = mcq(
  'faa-bs-placement', C_TWO, 'medium',
  (rng) => {
    const it = rng.pick(BS_ITEMS);
    const x = inr(amount(rng, 2000, 60000, 500));
    return {
      prompt: `${it.scenario(x)} How does this adjustment appear in the balance sheet of a sole proprietor?`,
      correct: BS_OPTIONS[it.right],
      distractors: it.wrong.map(([k, why]) => ({ text: BS_OPTIONS[k], why })),
      explanation: `${BS_OPTIONS[it.right]}. ${BS_REASONS[it.right]}`,
      hints: ['Does the business own it, owe it, or does it change the owner\'s claim?', 'Assets and liabilities that are short-term are current.'],
    };
  },
);

const OMITTED_ITEMS: { scenario: (x: string) => string; right: (x: string) => string; wrong: ((x: string) => [string, string])[] }[] = [
  { scenario: (x) => `an outstanding expense of ${x}`, right: (x) => `Net profit overstated by ${x}; liabilities understated by ${x}`,
    wrong: [
      (x) => [`Net profit understated by ${x}; liabilities understated by ${x}`, 'Thought leaving out an expense lowers profit; an omitted expense makes profit too high.'],
      (x) => [`Net profit overstated by ${x}; assets overstated by ${x}`, 'Thought the missing amount belongs among the assets, but an outstanding expense is a liability.'],
      (x) => [`Net profit understated by ${x}; assets understated by ${x}`, 'Treated the omission as if it were a prepaid expense.'],
      (x) => [`Net profit not affected; liabilities understated by ${x}`, 'Thought an unpaid expense does not change profit; the expense belongs to the year whether paid or not.'],
    ] },
  { scenario: (x) => `a prepaid expense of ${x}`, right: (x) => `Net profit understated by ${x}; assets understated by ${x}`,
    wrong: [
      (x) => [`Net profit overstated by ${x}; assets understated by ${x}`, 'Reversed the effect on profit: leaving out a prepaid amount leaves the expense too high, so profit too low.'],
      (x) => [`Net profit understated by ${x}; liabilities understated by ${x}`, 'Treated the prepaid amount as a liability.'],
      (x) => [`Net profit overstated by ${x}; liabilities understated by ${x}`, 'Treated the omission as if it were an outstanding expense.'],
      (x) => [`Net profit not affected; assets understated by ${x}`, 'Thought only the balance sheet is affected; the expense of the year is overstated as well.'],
    ] },
  { scenario: (x) => `accrued income of ${x}`, right: (x) => `Net profit understated by ${x}; assets understated by ${x}`,
    wrong: [
      (x) => [`Net profit overstated by ${x}; assets understated by ${x}`, 'Reversed the effect on profit: leaving out income lowers profit.'],
      (x) => [`Net profit understated by ${x}; liabilities understated by ${x}`, 'Treated accrued income as a liability.'],
      (x) => [`Net profit overstated by ${x}; liabilities understated by ${x}`, 'Treated the omission as if it were income received in advance.'],
      (x) => [`Net profit not affected; assets understated by ${x}`, 'Thought income not yet received does not change profit; it belongs to this year.'],
    ] },
  { scenario: (x) => `income received in advance of ${x}`, right: (x) => `Net profit overstated by ${x}; liabilities understated by ${x}`,
    wrong: [
      (x) => [`Net profit understated by ${x}; liabilities understated by ${x}`, 'Reversed the effect on profit: the advance is wrongly counted as this year\'s income, so profit is too high.'],
      (x) => [`Net profit overstated by ${x}; assets overstated by ${x}`, 'Thought the advance is an asset; it is a liability.'],
      (x) => [`Net profit understated by ${x}; assets understated by ${x}`, 'Treated the omission as if it were accrued income.'],
      (x) => [`Net profit not affected; liabilities understated by ${x}`, 'Thought money already received does not affect profit; part of it belongs to next year.'],
    ] },
  { scenario: (x) => `depreciation of ${x} on machinery`, right: (x) => `Net profit overstated by ${x}; assets overstated by ${x}`,
    wrong: [
      (x) => [`Net profit understated by ${x}; assets overstated by ${x}`, 'Thought leaving out an expense lowers profit; an omitted expense makes profit too high.'],
      (x) => [`Net profit overstated by ${x}; liabilities understated by ${x}`, 'Treated depreciation as a liability, like an outstanding expense.'],
      (x) => [`Net profit not affected; assets overstated by ${x}`, 'Thought a non-cash item does not touch profit; depreciation is an expense.'],
      (x) => [`Net profit overstated by ${x}; assets understated by ${x}`, 'Reversed the effect on the machinery: without depreciation it is shown too high, not too low.'],
    ] },
  { scenario: (x) => `further bad debts of ${x}`, right: (x) => `Net profit overstated by ${x}; assets overstated by ${x}`,
    wrong: [
      (x) => [`Net profit understated by ${x}; assets overstated by ${x}`, 'Thought leaving out a loss lowers profit; an omitted loss makes profit too high.'],
      (x) => [`Net profit overstated by ${x}; liabilities understated by ${x}`, 'Treated bad debts as a liability.'],
      (x) => [`Net profit not affected; assets overstated by ${x}`, 'Thought a debt that has not been collected does not touch profit; the loss belongs to this year.'],
      (x) => [`Net profit overstated by ${x}; assets understated by ${x}`, 'Reversed the effect on debtors: without the write-off they are shown too high.'],
    ] },
  { scenario: (x) => `closing stock of ${x} (from both the Trading Account and the balance sheet)`, right: (x) => `Net profit understated by ${x}; assets understated by ${x}`,
    wrong: [
      (x) => [`Net profit overstated by ${x}; assets understated by ${x}`, 'Reversed the effect on profit: without closing stock the cost of goods sold is too high, so profit is too low.'],
      (x) => [`Net profit understated by ${x}; liabilities understated by ${x}`, 'Treated unsold stock as a liability.'],
      (x) => [`Net profit not affected; assets understated by ${x}`, 'Thought stock matters only to the balance sheet; it also changes the gross profit.'],
      (x) => [`Net profit overstated by ${x}; liabilities understated by ${x}`, 'Mixed it up with an outstanding expense.'],
    ] },
];

const omittedEffect = mcq(
  'faa-omitted-effect', C_TWO, 'medium',
  (rng) => {
    const it = rng.pick(OMITTED_ITEMS), firm = rng.pick(FIRMS);
    const x = inr(amount(rng, 2000, 60000, 500));
    return {
      prompt: `While preparing the final accounts of ${firm}, the accountant completely left out ${it.scenario(x)}. Nothing else was wrong. Which statement describes the effect of the omission on the final accounts?`,
      correct: it.right(x),
      distractors: it.wrong.map((w) => {
        const [text, why] = w(x);
        return { text, why };
      }),
      explanation: `${cap(it.scenario(x).replace(/ \(.*\)$/, ''))} has two effects, in the Trading or Profit and Loss Account and in the balance sheet. Leaving it out leaves both wrong: ${it.right(x).toLowerCase()}.`,
      hints: ['Work out what the correct entry would have done to profit and to the balance sheet, then reverse it.', 'An omitted expense (or advance income) leaves profit too high; an omitted income (or prepaid item) leaves it too low.'],
    };
  },
);

const discountBase = (() => {
  let last: { prompt: string; d: number; b: number; p: number } | undefined;
  const t = mcq(
    'faa-discount-base', C_BAD, 'complex',
    (rng) => {
      const firm = rng.pick(FIRMS);
      const d = amount(rng, 200000, 800000, 20000), b = amount(rng, 4000, 20000, 2000), p = rng.pick([5, 10]), q = rng.pick([2, 3, 5]);
      const base = d - b, pdd = pc(base, p);
      if (!isWhole(pdd)) return null;
      const good = base - pdd;
      const prompt = `The sundry debtors of ${firm} are ${inr(d)}. Further bad debts of ${inr(b)} are to be written off, a provision for doubtful debts of ${p}% is to be made, and then a provision for discount of ${q}% is to be made. On what amount is the provision for discount calculated?`;
      last = { prompt, d, b, p };
      return {
        prompt,
        correct: inr(good),
        distractors: wrongs([
          [inr(d), 'Applied the discount to the original debtors, ignoring both the bad debts and the provision for doubtful debts.'],
          [inr(base), 'Deducted the bad debts but not the provision for doubtful debts: discount is expected only from the debtors who will pay.'],
          [inr(d - pc(d, p)), 'Deducted the provision for doubtful debts but worked it out on the original debtors and forgot the bad debts.'],
          [inr(good - pc(good, q)), 'Deducted the provision for discount from the base before working it out.'],
        ]),
        explanation: `Order: first write off the further bad debts (${inr(d)} - ${inr(b)} = ${inr(base)}); then provide for doubtful debts on that (${p}% = ${inr(pdd)}); then provide for discount on the good debtors: ${inr(base)} - ${inr(pdd)} = ${inr(good)}.`,
        hints: ['Which debtors can still be expected to pay, and so to claim discount?', 'Bad debts first, then the provision for doubtful debts, and only then the provision for discount.'],
      };
    },
    (q) => {
      if (!last || last.prompt !== q.prompt) return false;
      const good = ((last.d - last.b) * (100 - last.p)) / 100;
      return q.options.find((o) => o.id === q.correct)?.text === inr(good);
    },
  );
  return t;
})();

const pddBase = (() => {
  let last: { prompt: string; d: number; b: number } | undefined;
  return mcq(
    'faa-pdd-base', C_BAD, 'medium',
    (rng) => {
      const firm = rng.pick(FIRMS);
      const d = amount(rng, 150000, 800000, 50000), b = amount(rng, 4000, 30000, 2000), old = amount(rng, 5000, 25000, 1000), p = rng.pick([4, 5, 8, 10]);
      if (new Set([d, d - b, d - b - old, d - old]).size < 4) return null;
      const prompt = `The trial balance of ${firm} shows sundry debtors of ${inr(d)} and a Provision for Doubtful Debts account with a credit balance of ${inr(old)}. Further bad debts of ${inr(b)} are to be written off, and the provision is to be ${p}% of the debtors. On what amount of debtors is the new provision calculated?`;
      last = { prompt, d, b };
      return {
        prompt,
        correct: inr(d - b),
        distractors: wrongs([
          [inr(d), 'Calculated the provision on the original debtors, before writing off the further bad debts.'],
          [inr(d - b - old), 'Deducted the old provision from the debtors before applying the rate: the old provision is compared with the new one afterwards, not deducted from the base.'],
          [inr(d - old), 'Deducted the old provision and forgot the further bad debts.'],
        ]),
        explanation: `The new provision is worked out on the debtors left after writing off the further bad debts: ${inr(d)} - ${inr(b)} = ${inr(d - b)}. The old provision of ${inr(old)} is only compared with the new one to find the charge or the write-back.`,
        hints: ['Which debtors are still on the books after the bad debts are written off?', 'The old provision is not part of the base.'],
      };
    },
    (q) => last !== undefined && last.prompt === q.prompt && q.options.find((o) => o.id === q.correct)?.text === inr(last.d - last.b),
  );
})();

interface GoodsScenario {
  text: (x: string) => string;
  right: string;
  wrong: [string, string][];
}
const GOODS_SCENARIOS: GoodsScenario[] = [
  { text: (x) => `The proprietor took goods costing ${x} from the shop for personal use.`, right: 'Drawings A/c Dr; Purchases A/c Cr',
    wrong: [['Charity A/c Dr; Purchases A/c Cr', 'Treated the goods taken for personal use as a gift to charity.'], ['Drawings A/c Dr; Sales A/c Cr', 'Credited Sales, though the goods were not sold.'], ['Capital A/c Dr; Purchases A/c Cr', 'Debited Capital directly instead of the Drawings account.'], ['Purchases A/c Dr; Drawings A/c Cr', 'Reversed the entry.']] },
  { text: (x) => `Goods costing ${x} were distributed free to prospective customers as samples.`, right: 'Advertisement A/c Dr; Purchases A/c Cr',
    wrong: [['Charity A/c Dr; Purchases A/c Cr', 'Treated free samples as charity, but they are given to promote sales.'], ['Drawings A/c Dr; Purchases A/c Cr', 'Treated samples as goods taken by the proprietor.'], ['Advertisement A/c Dr; Sales A/c Cr', 'Credited Sales, though the goods were given away free.'], ['Loss by Fire A/c Dr; Purchases A/c Cr', 'Treated the samples as a loss by fire.']] },
  { text: (x) => `Goods costing ${x} were given to a charitable trust.`, right: 'Charity A/c Dr; Purchases A/c Cr',
    wrong: [['Advertisement A/c Dr; Purchases A/c Cr', 'Treated a gift to charity as advertisement.'], ['Drawings A/c Dr; Purchases A/c Cr', 'Treated the gift as the proprietor\'s personal use.'], ['Charity A/c Dr; Sales A/c Cr', 'Credited Sales, though the goods were given away.'], ['Charity A/c Dr; Stock A/c Cr', 'Credited Stock, but goods bought in the year are recorded in Purchases and the closing stock is taken as counted.']] },
  { text: (x) => `Goods costing ${x} were destroyed by fire, and there is no insurance cover.`, right: 'Loss by Fire A/c Dr; Purchases A/c Cr',
    wrong: [['Drawings A/c Dr; Purchases A/c Cr', 'Treated a loss of the business as the proprietor\'s withdrawal.'], ['Loss by Fire A/c Dr; Sales A/c Cr', 'Credited Sales, though the goods were not sold.'], ['Insurance Claim Receivable A/c Dr; Purchases A/c Cr', 'Showed a claim although there is no insurance cover.'], ['Purchases A/c Dr; Loss by Fire A/c Cr', 'Reversed the entry.']] },
  { text: (x) => `Goods costing ${x} were destroyed by fire, and the insurer has admitted the claim in full but has not yet paid.`, right: 'Insurance Claim Receivable A/c Dr; Purchases A/c Cr',
    wrong: [['Purchases A/c Dr; Insurance Claim Receivable A/c Cr', 'Reversed the entry.'], ['Cash A/c Dr; Purchases A/c Cr', 'Debited cash though the claim has been admitted but not yet received.'], ['Insurance A/c Dr; Purchases A/c Cr', 'Debited the Insurance expense account instead of showing the claim as an asset.'], ['Insurance Claim Receivable A/c Dr; Sales A/c Cr', 'Credited Sales, though the goods were not sold.']] },
];

const goodsAccounts = mcq(
  'faa-goods-accounts', C_GDS, 'medium',
  (rng) => {
    const s = rng.pick(GOODS_SCENARIOS);
    const x = inr(amount(rng, 2000, 60000, 500));
    return {
      prompt: `${s.text(x)} No entry has been made. Which single adjusting entry records the whole of it? (The goods are taken out of Purchases A/c.)`,
      correct: s.right,
      distractors: wrongs(s.wrong),
      explanation: `${s.right}. The goods leave the stock bought for sale, so Purchases is credited at cost; the debit shows why they left.`,
      hints: ['Why did the goods leave the business?', 'Purchases is credited because the goods are no longer part of the cost of goods sold.'],
    };
  },
);

const LOSS_OPTIONS = {
  absorbed: 'Absorbed in the cost of goods sold in the Trading Account, with no separate loss account',
  separate: 'Taken out of the cost of goods in the Trading Account at cost, and shown as a separate loss in the Profit and Loss Account',
  drawings: 'Debited to the proprietor\'s Drawings account',
  none: 'Not recorded until the goods would have been sold',
};
type LossKey = keyof typeof LOSS_OPTIONS;
const LOSS_ITEMS: { text: (x: string) => string; right: LossKey; wrong: [LossKey, string][] }[] = [
  { text: (x) => `A sugar trader always loses a little weight in stock through drying and handling, about the same each year; this year's usual shrinkage cost ${x}.`, right: 'absorbed',
    wrong: [['separate', 'Treated an expected, ordinary shrinkage as an abnormal loss.'], ['drawings', 'Treated a business loss as the proprietor\'s withdrawal.'], ['none', 'Thought a loss of unsold goods needs no entry, but the loss has already happened.']] },
  { text: (x) => `Fruit bought by a wholesaler normally dries out a little in storage, as in every year; this year's usual wastage cost ${x}.`, right: 'absorbed',
    wrong: [['separate', 'Treated an expected, ordinary wastage as an abnormal loss.'], ['drawings', 'Treated a business loss as the proprietor\'s withdrawal.'], ['none', 'Thought a loss of unsold goods needs no entry, but the loss has already happened.']] },
  { text: (x) => `A flood destroyed goods costing ${x} in the godown of a trader.`, right: 'separate',
    wrong: [['absorbed', 'Treated an unusual loss as part of the ordinary cost of goods; an abnormal loss is shown separately.'], ['drawings', 'Treated a business loss as the proprietor\'s withdrawal.'], ['none', 'Thought the goods need no entry because they were not sold, but they are gone and must be written off.']] },
  { text: (x) => `Goods costing ${x} were stolen from a shop in a burglary.`, right: 'separate',
    wrong: [['absorbed', 'Treated a theft as part of the ordinary cost of goods; an abnormal loss is shown separately.'], ['drawings', 'Treated the theft as the proprietor\'s withdrawal.'], ['none', 'Thought the goods need no entry because they were not sold, but they are gone and must be written off.']] },
  { text: (x) => `The proprietor's family used goods costing ${x} from the shop.`, right: 'drawings',
    wrong: [['absorbed', 'Treated the goods used at home as part of the ordinary cost of goods sold.'], ['separate', 'Treated personal use as an abnormal business loss.'], ['none', 'Thought a transaction without cash needs no entry.']] },
];

const lossClassify = mcq(
  'faa-loss-classify', C_GDS, 'medium',
  (rng) => {
    const it = rng.pick(LOSS_ITEMS);
    const x = inr(amount(rng, 2000, 60000, 500));
    return {
      prompt: `${it.text(x)} How is it treated in the final accounts of a sole proprietor?`,
      correct: LOSS_OPTIONS[it.right],
      distractors: it.wrong.map(([k, why]) => ({ text: LOSS_OPTIONS[k], why })),
      explanation: `${LOSS_OPTIONS[it.right]}. A normal loss is part of the cost of doing business and stays in the cost of goods sold; an abnormal loss (fire, theft, flood) is taken out at cost and shown separately, net of any insurance claim; goods used by the proprietor are drawings.`,
      hints: ['Was the loss expected in the ordinary course of business, or unusual?', 'Goods the proprietor uses at home are drawings.'],
    };
  },
);

// ---------------------------------------------------------------------------------------------------------------


// ---------------------------------------------------------------------------------------------------------------
// Goods given to the staff for their welfare, added after the check against the CBSE 2025-26 syllabus, which names
// it among the adjustments. At cost: Staff Welfare Expenses A/c is debited (an indirect expense, in the Profit and
// Loss Account) and Purchases A/c is credited (so the goods come out of purchases in the Trading Account). Like the
// other goods that leave without a sale, it raises the gross profit and leaves the net profit as it was.
// ---------------------------------------------------------------------------------------------------------------

const STAFF_GIFTS = ['as a Diwali gift', 'as a Pongal gift', 'for the staff canteen', 'at the annual staff function'];

const staffWelfarePurchases = num(
  'faa-staff-welfare-purchases', C_GDS, 'medium',
  (rng) => {
    const firm = rng.pick(FIRMS);
    const p = amount(rng, 200000, 900000, 10000), a = amount(rng, 2000, 15000, 500), b = amount(rng, 2000, 20000, 500);
    const samples = rng.pick([0, amount(rng, 1000, 8000, 500)]);
    if (a === b || b === samples || a === samples) return null;
    const answer = p - a - b - samples;
    const items = rng.shuffle([
      `goods costing ${inr(a)} were taken by the proprietor for personal use`,
      `goods costing ${inr(b)} were given to the employees ${rng.pick(STAFF_GIFTS)}`,
      ...(samples > 0 ? [`goods costing ${inr(samples)} were distributed as free samples`] : []),
    ]);
    const parts: NumericParts = {
      prompt: `The trial balance of ${firm} shows Purchases of ${inr(p)}. During the year ${items.join('; ')}. None of these has been recorded. At what figure are purchases shown in the Trading Account?`,
      answer,
      commonErrors: [
        { value: p - a - samples, why: 'Left the goods given to the staff in purchases; they left the business without a sale, so they come out of purchases too.' },
        { value: p, why: 'Made no adjustment: goods that leave otherwise than by sale are deducted from purchases.' },
        { value: p - a - samples + b, why: 'Added the goods given to the staff to purchases instead of deducting them.' },
        { value: p - b, why: 'Deducted only the goods given to the staff.' },
      ],
      explanation: [
        `Each lot of goods left the business without being sold, so each is taken out of purchases at cost.`,
        `Purchases = ${inr(p)} - ${inr(a)}${samples > 0 ? ` - ${inr(samples)}` : ''} - ${inr(b)} = ${inr(answer)}.`,
        'The goods given to the staff are also shown as Staff Welfare Expenses on the debit side of the Profit and Loss Account.',
      ],
    };
    return { parts, facts: { p, out: [a, b, samples] }, shown: [p, a, b] };
  },
  // Purchases less every lot that left otherwise than by sale.
  (f) => f.out.reduce((left, x) => left - x, f.p),
);

const staffWelfareEffect = mcq('faa-staff-welfare-effect', C_GDS, 'complex', (rng) => {
  const b = amount(rng, 2000, 30000, 500);
  const firm = rng.pick(FIRMS);
  const B = inr(b);
  return {
    prompt: `Goods costing ${B} given to the employees of ${firm} ${rng.pick(STAFF_GIFTS)} have not been recorded. When the adjustment is made in the final accounts, what happens to the gross profit and to the net profit?`,
    correct: `Gross profit rises by ${B}; net profit does not change`,
    distractors: [
      { text: `Both fall by ${B}`, why: 'Treated the goods as a loss in both accounts; taking them out of purchases raises the gross profit.' },
      { text: `Gross profit does not change; net profit falls by ${B}`, why: 'Charged the staff welfare expense but did not take the goods out of purchases.' },
      { text: `Both rise by ${B}`, why: 'Took the goods out of purchases but forgot to charge them as Staff Welfare Expenses in the Profit and Loss Account.' },
      { text: `Gross profit falls by ${B}; net profit does not change`, why: 'Turned the trading effect round: deducting goods from purchases lowers the cost of goods sold and so raises the gross profit.' },
    ],
    explanation: `Purchases fall by ${B}, so the gross profit rises by ${B}. Staff Welfare Expenses of ${B} are charged in the Profit and Loss Account, so the net profit is back where it was.`,
    hints: ['Where does each of the two effects go: the Trading Account or the Profit and Loss Account?', 'Less in purchases raises the gross profit; an expense lowers the net profit.'],
  };
}, (q) => {
  // The amount in the prompt, and the right option says the gross profit rises by it and the net profit stands.
  const amt = /costing (₹[\d,]+)/.exec(q.prompt)?.[1];
  const right = q.options.find((o) => o.id === q.correct)?.text ?? '';
  return amt !== undefined && right === `Gross profit rises by ${amt}; net profit does not change`;
});

const staffWelfareWhere = factsTemplate({
  id: 'faa-staff-welfare-where', topicId: T, conceptId: C_GDS, difficulty: 'easy',
  facts: [
    {
      prompt: 'Goods given to the staff for their welfare are an adjustment outside the trial balance. Where are its two effects shown?',
      correct: 'Deducted from Purchases in the Trading Account, and shown as Staff Welfare Expenses in the Profit and Loss Account',
      distractors: [
        { text: 'Added to Sales in the Trading Account, and shown as Staff Welfare Expenses in the Profit and Loss Account', why: 'Treated the goods as sold; nothing was sold, so they come out of purchases.' },
        { text: 'Deducted from Purchases in the Trading Account, and deducted from Capital in the Balance Sheet', why: 'Treated the goods as drawings; they went to the staff, not to the proprietor.' },
        { text: 'Shown only as Staff Welfare Expenses in the Profit and Loss Account', why: 'Gave one effect only: the goods must also come out of purchases.' },
      ],
      explanation: 'Every adjustment has two effects: here purchases fall in the Trading Account and an expense appears in the Profit and Loss Account.',
    },
    {
      prompt: 'Goods given to the staff for their welfare are recorded at:',
      correct: 'Their cost',
      distractors: [
        { text: 'Their selling price', why: 'Recorded the goods as if sold; nothing was sold, so the profit margin is never recorded.' },
        { text: 'Their selling price less a trade discount', why: 'No sale took place, so no selling price or discount comes into it.' },
        { text: 'Nil, because the staff paid nothing', why: 'The goods cost the business money and must come out of purchases, so they are recorded at cost.' },
      ],
      explanation: 'Goods that leave the business otherwise than by sale (taken by the owner, given to the staff, given as samples or to charity) are recorded at cost.',
    },
    {
      prompt: 'Which account is debited for goods given to the employees as a festival gift?',
      correct: 'Staff Welfare Expenses A/c',
      distractors: [
        { text: 'Drawings A/c', why: 'Drawings are for what the proprietor takes; these goods went to the employees.' },
        { text: 'Charity A/c', why: 'Charity is a gift to an outside cause; a gift to the business\'s own staff is a staff welfare expense.' },
        { text: 'Sales A/c', why: 'Nothing was sold, and Sales A/c is credited, not debited, on a sale.' },
      ],
      explanation: 'The entry is Staff Welfare Expenses A/c Dr; To Purchases A/c, at cost.',
    },
    {
      prompt: 'In the final accounts, Staff Welfare Expenses are shown as:',
      correct: 'An indirect expense, on the debit side of the Profit and Loss Account',
      distractors: [
        { text: 'A direct expense, on the debit side of the Trading Account', why: 'Staff welfare does not go into making or buying the goods; it is a cost of running the business.' },
        { text: 'A current liability in the Balance Sheet', why: 'Nothing is owed to the staff for the goods: they were given and the cost is borne.' },
        { text: 'A deduction from capital in the Balance Sheet', why: 'Mixed it up with goods taken by the proprietor, which are drawings.' },
      ],
      explanation: 'Welfare of the staff is a running cost of the business, charged against the gross profit in the Profit and Loss Account.',
    },
  ],
});

const staffWelfareTemplates: Template[] = [staffWelfareWhere, staffWelfarePurchases, staffWelfareEffect];

// ---------------------------------------------------------------------------------------------------------------
// Hints of the topic's own, in the place of the two general ones, and the versions raised by the quality pass. A
// template whose questions changed (its hints, or a fix) is raised to the version given, so that the questions its
// seeds made before keep their ids apart from those it makes now.
// ---------------------------------------------------------------------------------------------------------------

/** The template at `version`, every question it makes carrying `hints` (when given) in place of its own. */
function revised<X extends Template>(t: X, version: number, hints?: string[]): X {
  if (!hints) return { ...t, version };
  const generate = t.generate as (rng: Rng) => object | null;
  return { ...t, version, generate: (rng: Rng) => {
    const parts = generate(rng);
    return parts && { ...parts, hints };
  } } as unknown as X;
}

const H = {
  /** The debtors, one step after another (the guided level and the base of each provision). */
  debtorsSteps: [
    'Which debtors are already lost, and which are only doubtful? Take the debts off in that order before you apply any rate.',
    'Debtors − further bad debts = the base of the provision for doubtful debts; that base − the provision = the good debtors, the base of any provision for discount.',
  ],
  /** The charge for bad debts and the provision, or the amount written back. */
  provisionCharge: [
    'The old provision is already in the books: only the difference between what is needed now and what is there touches this year\'s profit.',
    'Charge = bad debts (in the trial balance and further) + new provision − old provision. Only when the old provision is larger than the bad debts and the new provision together is the difference written back.',
  ],
  /** The manager's commission on either basis. */
  commission: [
    'Is the commission on the profit before charging it or after charging it? Make every other adjustment to the profit first.',
    'Before: profit × rate/100. After: profit before commission × rate/(100 + rate); check that the rate on the profit left gives the same commission.',
  ],
  /** An expense or an income with balances at both ends of the year. */
  openClose: [
    'The cash paid or received belongs partly to last year and partly to next year. Which balances add to it and which come off?',
    'Expense = paid − opening outstanding + closing outstanding + opening prepaid − closing prepaid. Income = received − opening accrued + closing accrued + opening advance − closing advance.',
  ],
  /** Goods lost by fire, and goods taken or given away. */
  goods: [
    'Goods that leave without being sold come out of purchases at cost. What happens to the cost after that: a loss, a claim, drawings?',
    'Purchases are reduced by the cost; only the part the insurer does not pay is a loss in the Profit and Loss Account; the claim admitted is an asset; goods taken by the proprietor are drawings.',
  ],
  /** Several adjustments to one profit. */
  profit: [
    'Take each adjustment on its own: does it add an expense or remove one, add an income or remove one?',
    'Outstanding expenses, income received in advance, depreciation, bad debts, provisions and interest on capital lower the profit; prepaid expenses and accrued income raise it. Goods given away or lost change the gross profit but not the net profit, unless a claim is admitted.',
  ],
  /** Figures for the balance sheet. */
  balanceSheet: [
    'Each adjustment has a second effect in the balance sheet. Is it something owned, something owed, or a deduction from an asset?',
    'Current assets: closing stock, debtors less bad debts and provisions, prepaid expenses, accrued income, cash and bank. Current liabilities: creditors, outstanding expenses, income received in advance.',
  ],
  /** Interest on capital brought in during the year. */
  interestOnCapital: [
    'The opening capital earns interest for the whole year; how long was the capital brought in during the year in the business?',
    'Interest = opening capital × rate + capital brought in × rate × months from that date to 31 March / 12.',
  ],
};

const templates: Template[] = [
  // Outstanding and prepaid expenses
  expenseOutstanding, expensePrepaid, revised(expenseOpenClose, 2, H.openClose), prepaidByMonths, entryOutstanding, entryPrepaid,
  // Accrued income and income received in advance
  incomeAdjust, revised(incomeOpenClose, 2, H.openClose), interestAccrued, entryAccrued, entryAdvance,
  // Closing stock and depreciation
  depreciationCharge, depreciationNewAsset, closingStockGp, stockValuation, entryDepreciation,
  // Bad debts and provisions
  // Version 2: hints of the topic's own.
  revised(provisionNew, 2, H.debtorsSteps), revised(debtorsNet, 2, H.debtorsSteps), revised(provisionIncrease, 2, H.provisionCharge),
  revised(provisionWriteBack, 2, H.provisionCharge), revised(badDebtsCharge, 2, H.provisionCharge), revised(discountProvision, 2, H.debtorsSteps),
  entryBadDebts, revised(entryProvision, 2, H.provisionCharge), entryInsolventDebtor, pddBase, discountBase,
  // Interest. Interest on drawings is beyond the Class 11 syllabus: on no level and in no mock paper.
  interestOnCapital, revised(interestOnCapitalIntroduced, 2, H.interestOnCapital),
  beyondSyllabus(interestOnDrawings, BEYOND_INTEREST_ON_DRAWINGS), beyondSyllabus(interestOnDrawingsRegular, BEYOND_INTEREST_ON_DRAWINGS),
  beyondSyllabus(closingCapital, BEYOND_INTEREST_ON_DRAWINGS),
  // Version 2 of both entries: worded without "his" or "him" (the house rule: no gendered pronouns).
  revised(entryIntCapital, 2), beyondSyllabus(revised(entryIntDrawings, 2), BEYOND_INTEREST_ON_DRAWINGS),
  // Manager's commission
  // Version 2: hints of their own; the combined one draws no interest on drawings; the entry uses the accounts the board
  // writes, Manager's Commission A/c and Outstanding Manager's Commission A/c. Version 3 of the first two: the
  // commission is charged before or after "the commission", not "his commission" (no gendered pronouns).
  revised(commissionBefore, 3, H.commission), revised(commissionAfter, 3, H.commission), revised(commissionCombined, 2, H.commission), revised(entryCommission, 2),
  // Goods taken, given away or lost
  // Version 2 of the last: its hint says goods the proprietor uses at home "are drawings", not "his drawings".
  revised(fireLoss, 2, H.goods), revised(gpGoodsDrawn, 2, H.goods), entryGoodsDrawn, entryCharitySamples, entryFireUninsured, revised(entryFireInsured, 2, H.goods), goodsAccounts, revised(lossClassify, 2),
  // Net profit and balance sheet figures
  // Version 2 of the first two: interest on a loan due in the place of interest on drawings (beyond the syllabus).
  revised(profitOne, 2), revised(profitMulti, 2, H.profit), revised(profitGoods, 2, H.profit), revised(plBuild, 2, H.profit),
  revised(currentAssets, 2, H.balanceSheet), revised(currentLiabilities, 2, H.balanceSheet),
  // Where the two effects appear
  // Version 2: a provision for discount on debtors in the place of interest on drawings (beyond the syllabus). Version 3
  // of both: the reasons about interest on capital and drawings speak of "the proprietor's" claim, not "his".
  revised(effectsWhere, 3), plSide, revised(bsPlacement, 3), omittedEffect,
];

// ---------------------------------------------------------------------------------------------------------------
// Sets of adjusting entries ("Pass the adjusting entries"): one business, a list of year-end adjustments, one entry
// for each. Adjusting entries are all passed on the last day of the year: the opening line says so once, and the
// items carry labels, (a), (b), ..., in place of a date. The opening line is kept short enough for a phone. It names
// the business and states only the conventions that several items of a set share: the four accounts for amounts
// carried forward, how depreciation is recorded, Purchases A/c for goods that left otherwise than by sale. A
// convention that one item alone relies on is stated in that item: the debtor's own account for a bad debt, Profit
// and Loss A/c for a new provision, Capital A/c and Drawings A/c for the two kinds of interest, the claim still to be
// received, Commission Paid A/c for the manager.
// ---------------------------------------------------------------------------------------------------------------

const C_SET = 'faa-adjusting-sets';
const SET_TASK = 'Pass the adjusting entries.';

/** The conventions an opening line may state, in the order they are stated. A set states those its own items need. */
const SET_NOTES = {
  carried: 'Amounts carried into the next year go to Outstanding Expenses A/c, Prepaid Expenses A/c, Accrued Income A/c or Income Received in Advance A/c.',
  depDirect: 'Depreciation is worked out on the balance shown and written off the asset account itself.',
  depProvision: 'Depreciation is worked out on the balance shown and credited to Provision for Depreciation A/c.',
  goods: 'Goods taken by the proprietor, given away or lost are credited to Purchases A/c at cost.',
} as const;
type SetNote = keyof typeof SET_NOTES;

/** The balances an opening line may list for the items that need them. */
const SET_DEBTORS = 'Sundry debtors, including the debtors named below';
const SET_CAPITAL = 'Capital on 1 April';

const SET_HINTS = [
  'Take the items one at a time. First find the amount: a rate, a number of months or a part of a payment may have to be worked out.',
  'Every adjustment touches one expense or income and one asset, liability or capital account. An expense or an asset goes up on the debit side; an income, a liability or capital on the credit side.',
];

/** One adjustment of a set: its item and its entry, and what the opening line has to say for it. */
interface SetAdj {
  text: string;
  lines: JournalLine[];
  explanation: string[];
  notes: SetNote[];
  /** Balances the opening line must list for this item: [label, amount]. */
  balances?: [string, number][];
  /** Accounts a student might wrongly pick for this item. */
  distractors?: string[];
}

const pair = (debit: string, credit: string, a: number): JournalLine[] => [dr(debit, a), cr(credit, a)];
/** A purchase during the year, and the months from it to 31 March. */
const SET_SINCE = [{ d: '1 July', m: 9 }, { d: '1 October', m: 6 }, { d: '1 January', m: 3 }] as const;

// ---- outstanding and prepaid expenses, accrued income and income received in advance ----

/** Rupees: the least and the most an amount may be, and the step between. */
type Range = [min: number, max: number, step: number];

interface SetExpense {
  id: string;
  acc: string;
  /** The size of the amount when it is printed. */
  range: Range;
  /** The size of one month's amount, where the item gives a monthly or a yearly figure. */
  month?: Range;
  /** The item when the amount is printed. */
  printed(a: string): string;
  /** The item when a monthly amount and the unpaid months are given. */
  monthly?(m: string, months: string): string;
  /** The item when the charge for the year and the amount paid are given. */
  yearly?(y: string, paid: string): string;
  /** The item when a payment covering 12 months from a date is given. */
  months?(x: string, start: string): string;
}

const SET_OUT: SetExpense[] = [
  {
    id: 'salaries', acc: 'Salaries', range: [12000, 40000, 500], month: [12000, 40000, 1000],
    printed: (a) => `Salaries of ${a} for March have not been paid.`,
    monthly: (m, months) => `Salaries are ${m} a month, and the salaries for ${months} have not been paid.`,
  },
  {
    id: 'rent', acc: 'Rent', range: [8000, 30000, 500], month: [8000, 30000, 1000],
    printed: (a) => `Rent of ${a} for March has not been paid.`,
    monthly: (m, months) => `The rent of the shop is ${m} a month, and the rent for ${months} has not been paid.`,
    yearly: (y, paid) => `The rent of the shop for the year is ${y}, of which ${paid} has been paid.`,
  },
  { id: 'wages', acc: 'Wages', range: [3000, 15000, 500], printed: (a) => `Wages of ${a} for the last week of March have not been paid.` },
  { id: 'electricity', acc: 'Electricity', range: [1500, 9000, 500], printed: (a) => `The electricity bill of ${a} for March has not been paid.` },
  { id: 'telephone', acc: 'Telephone', range: [1000, 6000, 500], printed: (a) => `The telephone bill of ${a} for March has not been paid.` },
  { id: 'auditFees', acc: 'Audit Fees', range: [10000, 40000, 1000], printed: (a) => `Audit fees of ${a} for the year have not been paid.` },
];

const SET_PRE: SetExpense[] = [
  {
    id: 'insurance', acc: 'Insurance', range: [2000, 20000, 500],
    printed: (a) => `The insurance premium paid during the year includes ${a} for the period after 31 March.`,
    months: (x, start) => `An insurance premium of ${x} was paid on ${start} for the 12 months beginning on that date.`,
  },
  { id: 'rent', acc: 'Rent', range: [8000, 30000, 500], printed: (a) => `The rent paid during the year includes ${a} for April of the next year.` },
  {
    id: 'advertisement', acc: 'Advertisement', range: [2000, 20000, 500],
    printed: (a) => `${a} of the advertisement charges paid during the year is for the next year.`,
    months: (x, start) => `An advertising contract for the 12 months beginning on ${start} was paid for in full on that date: ${x}.`,
  },
];

function setOutstanding(rng: Rng, e: SetExpense, must = false): SetAdj {
  const tail = [`The unpaid amount is an expense of this year: ${e.acc} A/c is debited.`, 'It is owed to others, so it is a liability: Outstanding Expenses A/c is credited.'];
  const common = { notes: ['carried'] as SetNote[], distractors: ['prepaidExpenses'] };
  const worked = [...(e.monthly ? ['monthly'] : []), ...(e.yearly ? ['yearly'] : [])];
  const kind = rng.pick(must && worked.length > 0 ? worked : ['printed', ...worked]);
  const month: Range = e.month ?? e.range;
  if (kind === 'monthly' && e.monthly) {
    const m = amount(rng, ...month), n = rng.pick([2, 3]);
    const a = m * n;
    return {
      ...common,
      text: e.monthly(inr(m), n === 2 ? 'February and March' : 'January, February and March'),
      lines: pair(e.id, 'outstandingExpenses', a),
      explanation: [`Unpaid for ${n} months = ${inr(m)} x ${n} = ${inr(a)}.`, ...tail],
    };
  }
  if (kind === 'yearly' && e.yearly) {
    const m = amount(rng, ...month), n = rng.pick([1, 2, 3]);
    const year = 12 * m, paid = (12 - n) * m;
    const a = year - paid;
    return {
      ...common,
      text: e.yearly(inr(year), inr(paid)),
      lines: pair(e.id, 'outstandingExpenses', a),
      explanation: [`Unpaid = charge for the year - amount paid = ${inr(year)} - ${inr(paid)} = ${inr(a)}.`, ...tail],
    };
  }
  const a = amount(rng, ...e.range);
  return { ...common, text: e.printed(inr(a)), lines: pair(e.id, 'outstandingExpenses', a), explanation: tail };
}

function setPrepaid(rng: Rng, e: SetExpense, must = false): SetAdj {
  const tail = ['The part that belongs to the next year is a benefit still to come, an asset: Prepaid Expenses A/c is debited.', `This year's expense is reduced by it: ${e.acc} A/c is credited.`];
  const common = { notes: ['carried'] as SetNote[], distractors: ['outstandingExpenses'] };
  if (e.months && (must || rng.pick([true, false]))) {
    const when = rng.pick(MONTHS_USED), x = amount(rng, 12000, 96000, 6000);
    const ahead = 12 - when.used, a = (x / 12) * ahead;
    return {
      ...common,
      text: e.months(inr(x), when.start),
      lines: pair('prepaidExpenses', e.id, a),
      explanation: [`The payment covers 12 months, of which ${ahead} fall after 31 March: ${inr(x)} x ${ahead}/12 = ${inr(a)}.`, ...tail],
    };
  }
  const a = amount(rng, ...e.range);
  return { ...common, text: e.printed(inr(a)), lines: pair('prepaidExpenses', e.id, a), explanation: tail };
}

interface SetIncome {
  id: string;
  acc: string;
  /** The size of the amount when it is printed. A sub-tenant pays less than the business pays for its own shop. */
  range: Range;
  printed(a: string): string;
}

const SET_ACCRUED: SetIncome[] = [
  { id: 'commissionReceived', acc: 'Commission Received', range: [2000, 20000, 500], printed: (a) => `Commission of ${a} earned in March has not been received.` },
  { id: 'rentReceived', acc: 'Rent Received', range: [2000, 6000, 500], printed: (a) => `Rent of ${a} for March is due from the sub-tenant and has not been received.` },
  { id: 'interestReceived', acc: 'Interest Received', range: [2000, 20000, 500], printed: (a) => `Interest of ${a} earned on investments up to 31 March has not been received.` },
];
const SET_ADVANCE: SetIncome[] = [
  { id: 'rentReceived', acc: 'Rent Received', range: [2000, 6000, 500], printed: (a) => `The rent received from the sub-tenant includes ${a} for April of the next year.` },
  { id: 'commissionReceived', acc: 'Commission Received', range: [2000, 20000, 500], printed: (a) => `The commission received includes ${a} for work to be done after 31 March.` },
];

function setAccrued(rng: Rng, inc: SetIncome, must = false): SetAdj {
  const tail = ['The amount is due to the business, an asset: Accrued Income A/c is debited.', `The income belongs to this year: ${inc.acc} A/c is credited.`];
  const common = { notes: ['carried'] as SetNote[], distractors: ['incomeReceivedInAdvance'] };
  if (inc.id === 'interestReceived' && (must || rng.pick([true, true, false]))) {
    const p = amount(rng, 100000, 600000, 50000), r = rng.pick([6, 8, 9, 10, 12]);
    const upto = rng.pick([{ k: 3, date: '30 June' }, { k: 6, date: '30 September' }, { k: 9, date: '31 December' }]);
    const rest = 12 - upto.k, a = (p * r * rest) / 1200;
    return {
      ...common,
      text: `The business held a fixed deposit of ${inr(p)} at ${r}% per annum throughout the year. Interest on it has been received only up to ${upto.date}.`,
      lines: pair('accruedIncome', inc.id, a),
      explanation: [`Interest for the ${rest} months not yet received = ${inr(p)} x ${r}/100 x ${rest}/12 = ${inr(a)}.`, ...tail],
    };
  }
  const a = amount(rng, ...inc.range);
  return { ...common, text: inc.printed(inr(a)), lines: pair('accruedIncome', inc.id, a), explanation: tail };
}

function setAdvance(rng: Rng, inc: SetIncome, must = false): SetAdj {
  const common = { notes: ['carried'] as SetNote[], distractors: ['accruedIncome'] };
  const debit = `The part that belongs to the next year is not income of this year: ${inc.acc} A/c is debited.`;
  if (inc.id === 'rentReceived' && (must || rng.pick([true, false]))) {
    const when = rng.pick([{ d: '1 November', ahead: 1 }, { d: '1 December', ahead: 2 }, { d: '1 January', ahead: 3 }, { d: '1 February', ahead: 4 }]);
    const x = amount(rng, 12000, 36000, 6000), a = (x / 6) * when.ahead;
    return {
      ...common,
      text: `Rent of ${inr(x)} was received from the sub-tenant on ${when.d} for the six months beginning on that date.`,
      lines: pair(inc.id, 'incomeReceivedInAdvance', a),
      explanation: [
        `Of the six months, ${when.ahead} ${when.ahead === 1 ? 'falls' : 'fall'} after 31 March: ${inr(x)} x ${when.ahead}/6 = ${inr(a)}.`,
        debit,
        'The business still owes the use of the premises for those months, a liability: Income Received in Advance A/c is credited.',
      ],
    };
  }
  const a = amount(rng, ...inc.range);
  return {
    ...common,
    text: inc.printed(inr(a)),
    lines: pair(inc.id, 'incomeReceivedInAdvance', a),
    explanation: [debit, 'The business still owes what the money was received for, a liability: Income Received in Advance A/c is credited.'],
  };
}

type CarriedKind = 'outstanding' | 'prepaid' | 'accrued' | 'advance';

/**
 * `kinds` adjustments of the four kinds that carry an amount into the next year, each on an account of its own (an
 * expense is not both unpaid and prepaid, an income not both accrued and received in advance). One of them, drawn
 * from the seed, is always an item whose amount has to be worked out (months, a rate, a part of a payment). Null
 * when the accounts run out.
 */
function setCarried(rng: Rng, kinds: CarriedKind[]): SetAdj[] | null {
  const used = new Set<string>();
  const fresh = <X extends { id: string }>(pool: X[]): X | undefined => {
    const x = rng.shuffle(pool).find((p) => !used.has(p.id));
    if (x) used.add(x.id);
    return x;
  };
  const make = (kind: CarriedKind, must: boolean): SetAdj | null => {
    if (kind === 'outstanding' || kind === 'prepaid') {
      const pool = kind === 'outstanding' ? SET_OUT : SET_PRE;
      const e = fresh(must ? pool.filter((x) => x.monthly || x.yearly || x.months) : pool);
      return e ? (kind === 'outstanding' ? setOutstanding(rng, e, must) : setPrepaid(rng, e, must)) : null;
    }
    const pool = kind === 'accrued' ? SET_ACCRUED : SET_ADVANCE;
    const inc = fresh(must ? pool.filter((x) => x.id === (kind === 'accrued' ? 'interestReceived' : 'rentReceived')) : pool);
    return inc ? (kind === 'accrued' ? setAccrued(rng, inc, must) : setAdvance(rng, inc, must)) : null;
  };
  // The item that must be worked out takes its account first, so that no other item has used it up.
  const worked = rng.int(0, kinds.length - 1);
  const out: (SetAdj | null)[] = kinds.map(() => null);
  out[worked] = make(kinds[worked], true);
  kinds.forEach((kind, i) => {
    if (i !== worked) out[i] = make(kind, false);
  });
  return out.every((a) => a !== null) ? (out as SetAdj[]) : null;
}

// ---- depreciation, further bad debts and a new provision for doubtful debts ----

type DepMethod = 'direct' | 'provision';
/** The yearly rates and the size of the balance (rupees) that suit each kind of asset. */
const SET_ASSET_TERMS: Record<string, { rates: number[]; min: number; max: number }> = {
  machinery: { rates: [10, 15], min: 200000, max: 600000 },
  furniture: { rates: [5, 10], min: 60000, max: 200000 },
  computers: { rates: [20, 25], min: 60000, max: 240000 },
  vehicles: { rates: [10, 15, 20], min: 200000, max: 500000 },
  officeEquipment: { rates: [10, 15], min: 80000, max: 300000 },
};

function setDepreciation(rng: Rng, asset: (typeof ASSETS)[number], method: DepMethod): SetAdj {
  const acc = ASSET_ACC[asset.id], name = acc.toLowerCase();
  const terms = SET_ASSET_TERMS[asset.id];
  const r = rng.pick(terms.rates);
  const old = amount(rng, terms.min, terms.max, 10000);
  // One time in three a part of the balance was bought during the year, and is depreciated for its months only.
  const when = rng.pick([null, null, rng.pick(SET_SINCE)]);
  const added = when ? amount(rng, 20000, Math.min(80000, terms.min), 20000) : 0;
  const balance = old + added;
  const depOld = pc(old, r), depNew = when ? (pc(added, r) * when.m) / 12 : 0;
  const dep = depOld + depNew;
  const working = when
    ? [
        `On the ${name} held for the whole year: (${inr(balance)} - ${inr(added)}) x ${r}/100 = ${inr(depOld)}.`,
        `On the ${name} bought on ${when.d}, held for ${when.m} months: ${inr(added)} x ${r}/100 x ${when.m}/12 = ${inr(depNew)}.`,
        `Depreciation for the year = ${inr(depOld)} + ${inr(depNew)} = ${inr(dep)}.`,
      ]
    : [`Depreciation = ${inr(balance)} x ${r}/100 = ${inr(dep)}.`];
  return {
    text: when
      ? `Charge depreciation on ${name} at ${r}% per annum. The balance includes ${name} bought for ${inr(added)} on ${when.d}, to be depreciated from that date.`
      : `Charge depreciation on ${name} at ${r}% per annum.`,
    lines: pair('depreciation', method === 'direct' ? asset.id : 'provisionForDepreciation', dep),
    explanation: [
      ...working,
      'Depreciation is an expense of the year: Depreciation A/c is debited.',
      method === 'direct'
        ? `The asset is written down directly: ${acc} A/c is credited.`
        : `${acc} A/c stays at cost, so the reduction is credited to Provision for Depreciation A/c.`,
    ],
    notes: [method === 'direct' ? 'depDirect' : 'depProvision'],
    balances: [[acc, balance]],
    distractors: [method === 'direct' ? 'provisionForDepreciation' : asset.id],
  };
}

function setBadDebt(rng: Rng, name: string, min = 2000, max = 12000): SetAdj & { bad: number } {
  const bad = amount(rng, min, max, 1000), B = inr(bad);
  return {
    bad,
    text: rng.pick([
      `${B} due from ${name}, a debtor, cannot be recovered and is to be written off this debtor's account as a bad debt.`,
      `${name}, a debtor who owes ${B}, has been declared insolvent and nothing can be recovered. Write the debt off this debtor's account.`,
    ]),
    lines: pair('badDebts', debtor(name), bad),
    explanation: [
      'The irrecoverable debt is a loss: Bad Debts A/c is debited.',
      `Nothing more can be collected from this debtor: the account of ${name} is credited, and the sundry debtors fall by ${B}.`,
    ],
    notes: [],
    distractors: ['badDebtsRecovered'],
  };
}

/** A provision created where there was none, on the debtors left after the bad debts of the same set. */
function setProvision(rng: Rng, debtors: number, bads: number[]): SetAdj | null {
  const p = rng.pick([2, 4, 5, 10]);
  const base = debtors - sum(bads), prov = pc(base, p);
  if (!isWhole(prov)) return null;
  return {
    text: `The books have no provision for doubtful debts yet. Create one at ${p}% of the sundry debtors left after the bad ${bads.length > 1 ? 'debts' : 'debt'} written off above, and charge it to Profit and Loss A/c.`,
    lines: pair('profitAndLoss', 'provisionForDoubtfulDebts', prov),
    explanation: [
      `Sundry debtors after the bad ${bads.length > 1 ? 'debts' : 'debt'} = ${[debtors, ...bads].map(inr).join(' - ')} = ${inr(base)}.`,
      `Provision = ${inr(base)} x ${p}/100 = ${inr(prov)}.`,
      'A new provision is a charge against the profit of the year: Profit and Loss A/c is debited.',
      'It is kept against the debtors and deducted from them in the balance sheet: Provision for Doubtful Debts A/c is credited.',
    ],
    notes: [],
    balances: [[SET_DEBTORS, debtors]],
  };
}

/**
 * One or two debtors written off and then the provision on what is left, in that order; null for an odd provision.
 * A debtor does not share a name with the business (Kiran is not a debtor of Kiran Stores).
 */
function setDebtors(rng: Rng, count: number, firm: string): SetAdj[] | null {
  const first = (s: string) => s.split(' ')[0];
  const names = rng.shuffle(PARTIES).filter((n) => first(n) !== first(firm)).slice(0, count);
  // Two debts written off in one set are of different amounts.
  const bads = count === 1 ? [setBadDebt(rng, names[0])] : rng.shuffle([setBadDebt(rng, names[0], 2000, 6000), setBadDebt(rng, names[1], 7000, 12000)]);
  const provision = setProvision(rng, amount(rng, 100000, 600000, 10000), bads.map((b) => b.bad));
  return provision ? [...bads, provision] : null;
}

// ---- interest on capital (interest on drawings of a sole proprietor is beyond the Class 11 syllabus) ----

function setInterestOnCapital(rng: Rng): SetAdj {
  const c = amount(rng, 500000, 1500000, 50000), r = rng.pick([5, 6, 8, 10, 12]);
  // One time in three the proprietor brought in more capital during the year, which earns interest for its months only.
  const when = rng.pick([null, null, rng.pick(SET_SINCE)]);
  const add = when ? amount(rng, 40000, 200000, 20000) : 0;
  const onOld = pc(c, r), onNew = when ? (pc(add, r) * when.m) / 12 : 0;
  const i = onOld + onNew;
  const working = when
    ? [
        `On ${inr(c)} for the whole year: ${inr(c)} x ${r}/100 = ${inr(onOld)}.`,
        `On ${inr(add)} for the ${when.m} months from ${when.d}: ${inr(add)} x ${r}/100 x ${when.m}/12 = ${inr(onNew)}.`,
        `Interest on capital = ${inr(onOld)} + ${inr(onNew)} = ${inr(i)}.`,
      ]
    : [`Interest on capital = ${inr(c)} x ${r}/100 = ${inr(i)}.`];
  return {
    text: when
      ? `Allow interest on capital at ${r}% per annum, to be added to the capital. The proprietor brought in a further ${inr(add)} on ${when.d}, which is not in the capital shown for 1 April and earns interest from that date.`
      : `Allow interest on capital at ${r}% per annum, to be added to the capital. No capital was brought in during the year.`,
    lines: pair('interestOnCapital', 'capital', i),
    explanation: [
      ...working,
      'Interest on capital is an expense of the business: Interest on Capital A/c is debited.',
      'It is due to the proprietor and is added to the capital: Capital A/c is credited.',
    ],
    notes: [],
    balances: [[SET_CAPITAL, c]],
    distractors: ['interestPaid'],
  };
}

// ---- goods taken by the proprietor, given away or lost by fire ----

type GoodsKind = 'drawn' | 'charity' | 'samples';
/** `item` writes the adjustment from the cost and, where it is given, the price the goods would have sold for. */
const SET_GOODS: Record<GoodsKind, { debit: string; item: (cost: string, price?: string) => string; why: string }> = {
  drawn: {
    debit: 'drawings',
    item: (cost, price) => (price ? `The proprietor took goods for use at home. They had cost ${cost} and would have sold for ${price}.` : `The proprietor took goods costing ${cost} for use at home.`),
    why: 'Goods taken for personal use are drawings of the proprietor: Drawings A/c is debited.',
  },
  charity: {
    debit: 'charity',
    item: (cost, price) => `Goods ${price ? `that had cost ${cost}, and would have sold for ${price},` : `costing ${cost}`} were given to a charitable trust.`,
    why: 'A gift to a charitable trust is a donation: Charity A/c is debited.',
  },
  samples: {
    debit: 'advertisement',
    item: (cost, price) => `Goods ${price ? `that had cost ${cost}, and would have sold for ${price},` : `costing ${cost}`} were distributed as free samples to likely customers.`,
    why: 'Free samples are given to promote sales: Advertisement A/c is debited.',
  },
};

/** A cost not yet used by another goods item of the set (`taken`), so that no two items of a set show the same figure. */
function freshCost(rng: Rng, taken: Set<number>, min: number, max: number, step: number): number {
  let a = amount(rng, min, max, step);
  while (taken.has(a)) a += step * 100;
  taken.add(a);
  return a;
}

function setGoods(rng: Rng, kind: GoodsKind, taken: Set<number>): SetAdj {
  const g = SET_GOODS[kind];
  const a = freshCost(rng, taken, 2000, 30000, 1000);
  // Half the time the selling price is printed beside the cost; the entry is at cost all the same.
  const markup = rng.pick([0, 0, 0, 20, 25, 50]);
  const price = a + pc(a, markup);
  return {
    text: `${g.item(inr(a), markup ? inr(price) : undefined)} No entry has been made.`,
    lines: pair(g.debit, 'purchases', a),
    explanation: [
      g.why,
      'The goods leave the stock bought for sale: Purchases A/c is credited at cost.',
      ...(markup ? [`The entry is made at the cost, ${inr(a)}. The price of ${inr(price)} is not used: nothing was sold.`] : []),
    ],
    notes: ['goods'],
    distractors: ['sales'],
  };
}

/**
 * Goods lost by fire and insured: one compound entry, as the topic's own entry question has it (the claim admitted
 * is receivable, only the part not covered is the loss, and Purchases A/c is credited with the whole cost). A claim
 * admitted in full leaves no loss, so that entry has two lines; the item asks for one entry all the same.
 */
function setFire(rng: Rng, taken: Set<number>): SetAdj {
  const x = freshCost(rng, taken, 20000, 100000, 5000), pct = rng.pick([50, 60, 75, 80]);
  const kind = rng.pick(['percent', 'percent', 'amount', 'full'] as const);
  const claim = kind === 'full' ? x : pc(x, pct);
  const loss = x - claim;
  const [X, CL, LS] = [inr(x), inr(claim), inr(loss)];
  const lead = `Goods costing ${X} were destroyed by fire in the godown, and no entry has been made.`;
  const ask = 'which is still to be received. Pass one entry.';
  const out = 'The whole cost leaves the stock bought for sale: Purchases A/c is credited at cost.';
  const notes: SetNote[] = ['goods'];
  if (kind === 'full') {
    return {
      notes,
      distractors: ['lossByFire', 'stock', 'insurance'],
      text: `${lead} The insurer has admitted a claim for the whole cost, ${ask}`,
      lines: pair('insuranceClaimReceivable', 'purchases', x),
      explanation: ['The whole cost is due from the insurer: Insurance Claim Receivable A/c is debited.', out, 'Nothing is left uncovered, so no amount goes to Loss by Fire A/c.'],
    };
  }
  return {
    notes,
    distractors: ['stock', 'insurance'],
    text: kind === 'percent' ? `${lead} The insurer has admitted a claim for ${pct}% of the cost, ${ask}` : `${lead} The insurer has admitted a claim of ${CL}, ${ask}`,
    lines: [dr('insuranceClaimReceivable', claim), dr('lossByFire', loss), cr('purchases', x)],
    explanation: [
      kind === 'percent'
        ? `Claim admitted = ${X} x ${pct}/100 = ${CL}. It is due from the insurer: Insurance Claim Receivable A/c is debited.`
        : `The claim admitted, ${CL}, is due from the insurer: Insurance Claim Receivable A/c is debited.`,
      `The part not covered, ${X} - ${CL} = ${LS}, is the loss: Loss by Fire A/c is debited.`,
      out,
    ],
  };
}

// ---- the manager's commission ----

/** Stated with its basis and the profit it is worked out on; always the last item, because it follows every other adjustment. */
function setCommission(rng: Rng): SetAdj | null {
  const after = rng.pick([true, false]);
  const r = after ? rng.pick([5, 10, 20, 25]) : rng.pick([5, 8, 10, 12, 20]);
  const c = after ? amount(rng, 5000, 40000, 1000) : 0;
  const p = after ? (c * (100 + r)) / r : amount(rng, 100000, 500000, 10000);
  const commission = after ? c : pc(p, r);
  if (!isWhole(p, commission)) return null;
  const [P, CM] = [inr(p), inr(commission)];
  return {
    text: `The manager is entitled to a commission of ${r}% of the net profit ${after ? 'after' : 'before'} charging the commission. With every other adjustment made, the net profit before charging the commission is ${P}. The commission has not been paid.`,
    // As the board writes it (version 2 of the set): Manager's Commission A/c Dr; To Outstanding Manager's Commission A/c.
    lines: pair('managersCommission', 'outstandingManagersCommission', commission),
    explanation: [
      after
        ? `The commission is on the profit after charging it: commission = ${P} x ${r}/${100 + r} = ${CM}. (Check: the profit left is ${inr(p - commission)}, and ${r}% of it is ${CM}.)`
        : `The commission is on the profit before charging it: commission = ${P} x ${r}/100 = ${CM}.`,
      'The commission is an expense of the year: Manager\'s Commission A/c is debited.',
      'It is unpaid, so the business owes it to the manager: Outstanding Manager\'s Commission A/c is credited.',
    ],
    notes: [],
    distractors: ['commissionReceived', 'commissionPaid', 'outstandingExpenses'],
  };
}

/**
 * A provision for discount on debtors, after the bad debts and the provision for doubtful debts of the same set: a rate
 * on the good debtors, those left after both (`debtors` less the bad debts less the provision).
 */
function setDiscountProvision(rng: Rng, debtors: number, bads: number[], doubtful: number): SetAdj | null {
  const good = debtors - sum(bads) - doubtful;
  // A rate that gives a provision in tens of rupees, as a question would set it.
  const fits = [2, 2, 1, 3, 5].filter((r) => pc(good, r) % rupees(10) === 0);
  if (fits.length === 0) return null;
  const p = rng.pick(fits), d = pc(good, p);
  return {
    text: `Create a provision for discount on debtors at ${p}% of the good debtors (the sundry debtors left after the bad debt and the provision for doubtful debts above), and charge it to Profit and Loss A/c.`,
    lines: pair('profitAndLoss', 'provisionForDiscountOnDebtors', d),
    explanation: [
      `Good debtors = ${[debtors, ...bads, doubtful].map(inr).join(' - ')} = ${inr(good)}.`,
      `Provision for discount = ${inr(good)} x ${p}/100 = ${inr(d)}.`,
      'The discount the good debtors are expected to take is a charge against this year\'s profit: Profit and Loss A/c is debited.',
      'It is deducted from the debtors in the balance sheet: Provision for Discount on Debtors A/c is credited.',
    ],
    notes: [],
    distractors: ['discountAllowed', 'discountReceived'],
  };
}

// ---- the independent check: every entry is worked out again from the words of the question alone ----

const GOODS_DEBITS = ['drawings', 'charity', 'advertisement', 'lossByFire', 'insuranceClaimReceivable'];

/**
 * True when an entry has the form of one of the adjustments of this topic, whatever its amount: the rules of the
 * cards, stated once more and apart from the functions that build the entries.
 */
function isAdjustingEntry(lines: JournalLine[]): boolean {
  const debits = lines.filter((l) => l.side === 'Dr').map((l) => l.accountId);
  const credits = lines.filter((l) => l.side === 'Cr').map((l) => l.accountId);
  const typeOf = (id: string) => resolveAccount(id).type;
  const only = (ids: string[], id: string) => ids.length === 1 && ids[0] === id;
  if (credits.length !== 1) return false;
  const [credit] = credits;
  // Goods that left the business otherwise than by sale: any of the goods debits, and with a claim the loss beside it.
  if (credit === 'purchases') {
    return debits.every((id) => GOODS_DEBITS.includes(id)) && (debits.length === 1 || (debits.length === 2 && debits.includes('insuranceClaimReceivable') && debits.includes('lossByFire')));
  }
  if (debits.length !== 1) return false;
  const [debit] = debits;
  if (credit === 'outstandingExpenses') return typeOf(debit) === 'expense';
  if (debit === 'prepaidExpenses') return typeOf(credit) === 'expense';
  if (debit === 'accruedIncome') return typeOf(credit) === 'income';
  if (credit === 'incomeReceivedInAdvance') return typeOf(debit) === 'income';
  if (debit === 'depreciation') return credit === 'provisionForDepreciation' || credit in ASSET_ACC;
  if (debit === 'badDebts') return credit.startsWith('debtor:');
  if (credit === 'provisionForDoubtfulDebts' || credit === 'provisionForDiscountOnDebtors') return only(debits, 'profitAndLoss');
  if (credit === 'outstandingManagersCommission') return debit === 'managersCommission';
  if (debit === 'interestOnCapital') return credit === 'capital';
  if (credit === 'interestOnDrawings') return debit === 'drawings';
  return false;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** The months from the first day of the month of a date ("1 July", "30 June") to 31 March, both months counted (July: 9). */
const monthsToYearEnd = (date: string): number => ((3 - (MONTH_NAMES.indexOf(date.split(' ')[1]) + 1) + 12) % 12) + 1;
/** Every rupee amount printed in a text, in paise and in the order printed. */
const rupeesIn = (text: string): number[] => (text.match(/₹[\d,]+/g) ?? []).map((m) => Number(m.replace(/[^\d]/g, '')) * 100);
/** The date ("1 July") that follows the words `lead` in a text. */
const dateAfter = (text: string, lead: string): string | undefined => new RegExp(`${lead} (\\d{1,2} (?:${MONTH_NAMES.join('|')}))`).exec(text)?.[1];
/** Words that name the expense or the income of an item, and the account each stands for. */
const READ_EXPENSES: [RegExp, string][] = [
  [/salar/i, 'salaries'], [/\brent\b/i, 'rent'], [/\bwages\b/i, 'wages'], [/electricity/i, 'electricity'], [/telephone/i, 'telephone'],
  [/audit fees/i, 'auditFees'], [/insurance/i, 'insurance'], [/advertis/i, 'advertisement'],
];
const READ_INCOMES: [RegExp, string][] = [[/commission/i, 'commissionReceived'], [/\brent\b/i, 'rentReceived'], [/interest/i, 'interestReceived']];
const namedIn = (table: [RegExp, string][], text: string): string | undefined => table.find(([re]) => re.test(text))?.[1];

/** What the question says outside its items, and the debts its earlier items have written off. */
interface SetRead {
  /** The conventions of the opening line. */
  said: string;
  /** The balances listed under it. */
  balances: Map<string, number>;
  badDebts: number[];
  /** The provision for doubtful debts an earlier item made, if any. */
  doubtful?: number;
}

/**
 * The entry an item calls for, worked out from its words and from the opening line alone: the months are counted
 * from the dates, the rates and the figures are read from the text, and the accounts follow the rules of the cards.
 * Nothing is taken from the function that built the item. Null when the item cannot be read or its amount is not a
 * whole number of paise.
 */
function readAdjustment(text: string, read: SetRead): JournalLine[] | null {
  const [a, b] = rupeesIn(text);
  const rate = Number(/(\d+)%/.exec(text)?.[1]);
  const entry = (debit: string | undefined, credit: string | undefined, x: number): JournalLine[] | null =>
    debit && credit && Number.isInteger(x) && x > 0 ? pair(debit, credit, x) : null;

  // The manager's commission: a percentage of the profit before it, or the same percentage of what is left after it.
  const basis = /of the net profit (before|after) charging the commission/.exec(text)?.[1];
  if (basis) {
    if (!/The commission has not been paid\.$/.test(text)) return null;
    return entry('managersCommission', 'outstandingManagersCommission', basis === 'after' ? (a * rate) / (100 + rate) : (a * rate) / 100);
  }

  // A provision for discount on the good debtors: the debtors less the bad debts and the provision for doubtful debts above.
  if (/provision for discount on debtors/.test(text)) {
    const debtors = read.balances.get(SET_DEBTORS);
    if (debtors === undefined || read.badDebts.length === 0 || read.doubtful === undefined || !/charge it to Profit and Loss A\/c/.test(text)) return null;
    return entry('profitAndLoss', 'provisionForDiscountOnDebtors', ((debtors - sum(read.badDebts) - read.doubtful) * rate) / 100);
  }

  // Goods lost by fire: Purchases at cost, the claim admitted as receivable, and only the part not covered as the loss.
  if (/destroyed by fire/.test(text)) {
    const claim = /claim for the whole cost/.test(text) ? a : /claim for \d+% of the cost/.test(text) ? (a * rate) / 100 : /claim of ₹/.test(text) ? b : NaN;
    if (!Number.isInteger(claim) || claim <= 0 || claim > a || !/Pass one entry\.$/.test(text)) return null;
    return [dr('insuranceClaimReceivable', claim), ...(claim < a ? [dr('lossByFire', a - claim)] : []), cr('purchases', a)];
  }

  // Goods taken or given away: at cost, the first figure, which is the smaller when a selling price is printed too.
  const goodsDebit = /took goods/.test(text) ? 'drawings' : /charitable trust/.test(text) ? 'charity' : /free samples/.test(text) ? 'advertisement' : undefined;
  if (goodsDebit) return b === undefined || b > a ? entry(goodsDebit, 'purchases', a) : null;

  // Depreciation: the rate on the balance listed, and on a part bought during the year only for the months held.
  const asset = /^Charge depreciation on (.+?) at \d+% per annum\./.exec(text)?.[1];
  if (asset) {
    const id = Object.keys(ASSET_ACC).find((k) => ASSET_ACC[k].toLowerCase() === asset);
    const balance = id === undefined ? undefined : read.balances.get(ASSET_ACC[id]);
    if (id === undefined || balance === undefined) return null;
    const since = dateAfter(text, 'bought for \\u20B9[\\d,]+ on');
    const charge = since ? ((balance - a) * rate) / 100 + (a * rate * monthsToYearEnd(since)) / 1200 : a === undefined ? (balance * rate) / 100 : NaN;
    const credit = read.said.includes(SET_NOTES.depProvision) ? 'provisionForDepreciation' : read.said.includes(SET_NOTES.depDirect) ? id : undefined;
    return entry('depreciation', credit, charge);
  }

  // A provision where there was none: the rate on the debtors left after the debts written off by the items above.
  if (/provision for doubtful debts/.test(text)) {
    const debtors = read.balances.get(SET_DEBTORS);
    if (debtors === undefined || read.badDebts.length === 0 || !/no provision for doubtful debts yet/.test(text) || !/charge it to Profit and Loss A\/c/.test(text)) return null;
    read.doubtful = ((debtors - sum(read.badDebts)) * rate) / 100;
    return entry('profitAndLoss', 'provisionForDoubtfulDebts', read.doubtful);
  }
  const owing = /^(.+), a debtor who owes ₹/.exec(text)?.[1] ?? /due from (.+), a debtor,/.exec(text)?.[1];
  if (owing) {
    if (!/this debtor's account/.test(text)) return null;
    read.badDebts.push(a);
    return entry('badDebts', debtor(owing), a);
  }

  // Interest on capital: a full year on the capital of 1 April, and the months in the business on capital brought in later.
  if (/^Allow interest on capital/.test(text)) {
    const capital = read.balances.get(SET_CAPITAL);
    const since = dateAfter(text, 'brought in a further \\u20B9[\\d,]+ on');
    if (capital === undefined || !/to be added to the capital/.test(text) || (since === undefined) !== /No capital was brought in during the year\.$/.test(text)) return null;
    return entry('interestOnCapital', 'capital', (capital * rate) / 100 + (since ? (a * rate * monthsToYearEnd(since)) / 1200 : 0));
  }
  // Interest on drawings: for the months from the withdrawal to 31 March, or for the average period given.
  if (/^The proprietor withdrew ₹/.test(text)) {
    const since = dateAfter(text, 'in cash on');
    const months = since ? monthsToYearEnd(since) : Number(/for an average period of (\d+) months/.exec(text)?.[1]);
    return /debit it to Drawings A\/c\.$/.test(text) ? entry('drawings', 'interestOnDrawings', (a * rate * months) / 1200) : null;
  }

  // Income earned and not yet received, or received for a time after 31 March.
  if (/fixed deposit/.test(text)) {
    const upto = dateAfter(text, 'received only up to');
    return upto ? entry('accruedIncome', 'interestReceived', (a * rate * (monthsToYearEnd(upto) - 1)) / 1200) : null;
  }
  const income = namedIn(READ_INCOMES, text);
  if (/has not been received\.$/.test(text)) return entry('accruedIncome', income, a);
  const sixFrom = dateAfter(text, 'received from the sub-tenant on');
  if (sixFrom) return /for the six months beginning on that date\.$/.test(text) ? entry('rentReceived', 'incomeReceivedInAdvance', (a * (6 - monthsToYearEnd(sixFrom))) / 6) : null;
  if (/received (?:from the sub-tenant )?includes ₹/.test(text)) return entry(income, 'incomeReceivedInAdvance', a);

  // An expense paid for a time after 31 March, or not yet paid.
  const expense = namedIn(READ_EXPENSES, text);
  if (/for the 12 months beginning on/.test(text)) {
    const from = dateAfter(text, 'paid on') ?? dateAfter(text, 'beginning on');
    return from ? entry('prepaidExpenses', expense, (a * (12 - monthsToYearEnd(from))) / 12) : null;
  }
  if (/paid during the year (?:includes ₹|is for the next year)/.test(text)) return entry('prepaidExpenses', expense, a);
  if (/not been paid\.$/.test(text)) {
    const months = /a month, and the .+ for (.+) ha(?:s|ve) not been paid\.$/.exec(text)?.[1];
    return entry(expense, 'outstandingExpenses', months === undefined ? a : a * MONTH_NAMES.filter((m) => months.includes(m)).length);
  }
  if (/for the year is ₹[\d,]+, of which ₹[\d,]+ has been paid\.$/.test(text)) return entry(expense, 'outstandingExpenses', a - b);
  return null;
}

const CARRIED_ACCOUNTS = ['outstandingExpenses', 'prepaidExpenses', 'accruedIncome', 'incomeReceivedInAdvance'];
const sameEntry = (x: JournalLine[], y: JournalLine[]): boolean => {
  const key = (ls: JournalLine[]) => ls.map((l) => `${l.side} ${l.accountId} ${l.amount}`).sort().join('|');
  return key(x) === key(y);
};

/**
 * The independent check of a set of adjusting entries. The finished question is read again: the opening line must
 * say that the entries are passed on 31 March and state each shared convention that an entry of the set relies on,
 * and every entry must have the form of an adjustment and be the entry that `readAdjustment` works out from the
 * words of its own item (with the balances listed, and the bad debts of the items before it).
 */
function adjustmentsHold(q: JournalSetQuestion): boolean {
  const [task, said = '', ...rows] = q.prompt.split('\n');
  if (task !== SET_TASK || !said.includes('every entry below is passed on 31 March, the last day of its year.')) return false;
  const balances = new Map<string, number>();
  for (const row of rows) {
    const m = /^(.+): (₹[\d,]+)$/.exec(row);
    if (!m || balances.has(m[1])) return false;
    balances.set(m[1], rupeesIn(m[2])[0]);
  }
  const all = q.entries.flatMap((e) => e.expected);
  const states = (note: SetNote) => said.includes(SET_NOTES[note]);
  if (all.some((l) => CARRIED_ACCOUNTS.includes(l.accountId)) && !states('carried')) return false;
  if (all.some((l) => l.accountId === 'purchases') && !states('goods')) return false;
  if (all.some((l) => l.accountId === 'depreciation') && states('depDirect') === states('depProvision')) return false;
  const read: SetRead = { said, balances, badDebts: [] };
  return q.entries.every((e) => {
    const worked = readAdjustment(e.text, read);
    return e.label !== undefined && isAdjustingEntry(e.expected) && worked !== null && sameEntry(worked, e.expected);
  });
}

// ---- putting a set together ----

/**
 * A set of adjusting entries. `build` draws the adjustments in the order they are listed (null rejects the seed);
 * the opening line is made from them: the business, the day of the entries, the conventions their entries share
 * and the balances they need.
 */
function adjustingSet(id: string, difficulty: Difficulty, build: (rng: Rng, firm: string) => SetAdj[] | null) {
  return journalSetTemplate({
    id,
    topicId: T,
    conceptId: C_SET,
    difficulty,
    generate: (rng) => {
      const firm = rng.pick(FIRMS);
      const adjs = build(rng, firm);
      if (!adjs) return null;
      const notes = (Object.keys(SET_NOTES) as SetNote[]).filter((k) => adjs.some((a) => a.notes.includes(k)));
      const balances = [...new Map(adjs.flatMap((a) => a.balances ?? []))];
      const said = [
        `${firm} has drawn up its trial balance, and every entry below is passed on 31 March, the last day of its year. Work out any amount that is not given.`,
        ...notes.map((k) => SET_NOTES[k]),
        ...(balances.length > 0 ? ['Balances in the books:'] : []),
      ];
      return {
        task: SET_TASK,
        opening: [said.join(' '), ...balances.map(([label, a]) => `${label}: ${inr(a)}`)].join('\n'),
        transactions: adjs.map((a, i) => ({ label: `(${'abcdefgh'[i]})`, text: a.text, lines: a.lines, explanation: a.explanation })),
        hints: SET_HINTS,
        distractorAccounts: [...new Set(adjs.flatMap((a) => a.distractors ?? []))].slice(0, 6),
      };
    },
    verify: adjustmentsHold,
  });
}

/** `n` different assets depreciated by the method of the set. */
const setDepreciations = (rng: Rng, n: number, method: DepMethod): SetAdj[] => rng.shuffle(ASSETS).slice(0, n).map((a) => setDepreciation(rng, a, method));

// 1. Easy: three or four amounts carried into the next year.
const setCarriedForward = adjustingSet('faa-set-carried-forward', 'easy', (rng) => {
  const kinds = rng.shuffle<CarriedKind>(['outstanding', 'outstanding', 'prepaid', 'accrued', 'advance']).slice(0, rng.pick([3, 4]));
  // A set of this kind has an expense and an income in it.
  if (!kinds.some((k) => k === 'outstanding' || k === 'prepaid') || !kinds.some((k) => k === 'accrued' || k === 'advance')) return null;
  return setCarried(rng, kinds);
});

// 2. Medium: depreciation, further bad debts and a new provision for doubtful debts (four or five entries).
const setAssetsAndDebtors = adjustingSet('faa-set-assets-debtors', 'medium', (rng, firm) => {
  const [deps, bads] = rng.pick([[2, 1], [1, 2], [2, 2], [3, 1]]);
  const method = rng.pick<DepMethod>(['direct', 'direct', 'provision']);
  const debtors = setDebtors(rng, bads, firm);
  return debtors && interleave(rng, [setDepreciations(rng, deps, method), debtors]);
});

// 3. Medium: interest on capital, and goods that left the business otherwise than by sale (four or five). Version 2:
// interest on drawings of a sole proprietor, beyond the Class 11 syllabus, is no longer one of the items.
const setProprietorAndGoods = adjustingSet('faa-set-proprietor-goods', 'medium', (rng) => {
  const n = rng.pick([4, 5]);
  const costs = new Set<number>();
  const interest = [setInterestOnCapital(rng)];
  // The goods items of the set, the fire among them more often than not.
  const goods = rng
    .shuffle(['fire', 'fire', 'drawn', 'charity', 'samples'] as const)
    .filter((k, i, all) => all.indexOf(k) === i)
    .slice(0, n - interest.length)
    .map((k) => (k === 'fire' ? setFire(rng, costs) : setGoods(rng, k, costs)));
  return rng.shuffle([...interest, ...goods]);
});

// 4. Complex: a full year end, six to eight adjustments of every kind, ending with the manager's commission. Version 2:
// no interest on drawings (beyond the Class 11 syllabus); the debtors may end with a provision for discount on the good
// debtors; the commission is entered as the board writes it, to Manager's Commission A/c and Outstanding Manager's
// Commission A/c.
const setYearEnd = adjustingSet('faa-set-year-end', 'complex', (rng, firm) => {
  // Five or four adjustments are always there; then nothing more, one more of the goods, the debtors with their
  // provision, or the debtors with both provisions (and one amount carried forward fewer): six to eight items in all.
  const more = rng.pick(['none', 'one', 'debtors', 'discount'] as const);
  const carried = setCarried(rng, rng.shuffle<CarriedKind>(['outstanding', 'prepaid', 'accrued', 'advance']).slice(0, more === 'discount' ? 1 : 2));
  const method = rng.pick<DepMethod>(['direct', 'direct', 'provision']);
  const goods = rng.shuffle(['fire', 'drawn', 'charity', 'samples'] as const);
  const costs = new Set<number>();
  const makeGoods = (k: (typeof goods)[number]) => (k === 'fire' ? setFire(rng, costs) : setGoods(rng, k, costs));
  const singles = [...(carried ?? []), ...setDepreciations(rng, 1, method), setInterestOnCapital(rng), makeGoods(goods[0])];
  if (more === 'one') singles.push(makeGoods(goods[1]));
  let debtors = more === 'debtors' || more === 'discount' ? setDebtors(rng, 1, firm) : [];
  if (debtors && more === 'discount') {
    const [bad, doubtful] = debtors;
    const balance = doubtful.balances?.find(([label]) => label === SET_DEBTORS)?.[1];
    const discount = balance === undefined ? null : setDiscountProvision(rng, balance, [bad.lines[0].amount], doubtful.lines[0].amount);
    debtors = discount ? [...debtors, discount] : null;
  }
  const commission = setCommission(rng);
  if (!carried || !debtors || !commission) return null;
  return [...interleave(rng, [rng.shuffle(singles), debtors]), commission];
});

// Version 2 of the last two: no interest on drawings (beyond the Class 11 syllabus); the year end may provide for
// discount on debtors and enters the manager's commission as the board writes it.
const sets: Template[] = [setCarriedForward, setAssetsAndDebtors, revised(setProprietorAndGoods, 2), revised(setYearEnd, 2)];

// ---------------------------------------------------------------------------------------------------------------
// FORMATS: the Trading Account, the Profit and Loss Account and the Balance Sheet after the year-end adjustments,
// prepared row by row. The data is a whole trial balance that agrees, the closing stock and a short numbered list of
// adjustments, written as the case studies of the final accounts write theirs and under the same conventions, each
// stated where it matters: closing stock is outside the trial balance; goods taken by the proprietor, given away or
// lost are credited to Purchases A/c at cost; the provision for doubtful debts is a percentage of the debtors left
// after the further bad debts, and bad debts and the change in the provision are one net charge; depreciation is a
// rate on the balance shown, for the full year unless a date of purchase is given, and is written off the asset; an
// unpaid manager's commission is an outstanding expense, and its basis is stated. Depreciation is a row for each
// asset ("To Depreciation on Machinery"), as a textbook sets the Profit and Loss Account out.
//
// The trial balance carries what a statement needs and the balances a student must know to leave out, and no more:
// a question on one account has no creditors (nor debtors, unless a provision is made on them), and a Balance Sheet
// lists, of the expenses, salaries and those its adjustments are about.
//
// Every adjustment is an `FAdj`: its wording, its adjusting entry and the effect its author says it has. The entries
// are posted on top of the trial balance and the rows are read from those books, each balance going to its statement
// by the type of its account. `verify` goes the other way, twice: it reads the trial balance back from the printed
// data, places every printed balance by its name and adds the stated effects of the adjustments; and then it reads
// every adjustment from its printed words alone and builds each row of the statement again.
// ---------------------------------------------------------------------------------------------------------------

const C_FMT = 'faa-formats';
const F_DATE = '31 March 2026';
/** The chart has no "sundry" accounts, so the totals of debtors and creditors are written as party accounts. */
const F_DEBTORS = debtor('Sundry Debtors');
const F_CREDITORS = creditor('Sundry Creditors');
const F_PROVISION = 'provisionForDoubtfulDebts';
const F_GP_CD = 'Gross Profit c/d';
const F_GP_BD = 'Gross Profit b/d';
const F_NET_PROFIT = 'Net Profit transferred to Capital A/c';
const F_NET_LOSS = 'Net Loss transferred to Capital A/c';
/** The direct expenses; with the stocks, purchases, sales and their returns they make up the Trading Account. */
const F_DIRECT = ['wages', 'carriageInwards', 'powerAndFuel'];
const F_TRADING = ['stock', 'purchases', 'purchasesReturn', 'sales', 'salesReturn', ...F_DIRECT];

type FBal = readonly [id: string, amount: number];
const fTotal = (xs: readonly FBal[]): number => xs.reduce((s, x) => s + x[1], 0);
const F_NAMES: Record<string, string> = { stock: 'Opening Stock', commissionPaid: "Manager's Commission" };
/** The name a row gives an account: "Wages", "Sundry Debtors", "Manager's Commission". */
const fName = (id: string): string => F_NAMES[id] ?? resolveAccount(id).name;
/** What an expense is called when an amount of it is carried into the next year: "Outstanding Telephone Charges". */
const fCarriedName = (id: string): string => (id === 'telephone' ? 'Telephone Charges' : fName(id));
/** "A, B and C". */
const fList = (xs: string[]): string => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
/** "₹a + ₹b = ₹c", or the amount alone when there is only one. */
const fAdded = (xs: number[]): string => (xs.length < 2 ? xs.map(inr).join('') : `${xs.map(inr).join(' + ')} = ${inr(sum(xs))}`);

/** The first result `make` gives in a few goes: a format tries other figures before it gives a seed up. */
function fTry<P>(goes: number, make: () => P | null): P | null {
  for (let i = 0; i < goes; i++) {
    const made = make();
    if (made) return made;
  }
  return null;
}

/** An expense or an income: its account, the name used in a sentence, and the range its balance is drawn from. */
interface FHead {
  id: string;
  name: string;
  /** True for a plural name ("salaries are"). */
  many: boolean;
  range: Range;
}
const fHead = (id: string, name: string, range: Range, many = false): FHead => ({ id, name, many, range });
const fBe = (h: { many: boolean }): string => (h.many ? 'are' : 'is');
const fDraw = (rng: Rng, h: FHead): number => amount(rng, ...h.range);

const F_WAGES = fHead('wages', 'wages', [18000, 60000, 2000], true);
const F_CARRIAGE_IN = fHead('carriageInwards', 'carriage inwards', [6000, 24000, 1000]);
const F_POWER = fHead('powerAndFuel', 'power and fuel', [8000, 30000, 1000]);
const F_SALARIES = fHead('salaries', 'salaries', [36000, 96000, 6000], true);
const F_RENT = fHead('rent', 'rent', [24000, 72000, 6000]);
const F_INSURANCE = fHead('insurance', 'insurance', [14000, 30000, 2000]);
const F_TELEPHONE = fHead('telephone', 'telephone charges', [9000, 18000, 1000], true);
const F_ADVERTISEMENT = fHead('advertisement', 'advertisement', [10000, 30000, 2000]);
const F_CARRIAGE_OUT = fHead('carriageOutwards', 'carriage outwards', [5000, 20000, 1000]);
const F_STATIONERY = fHead('stationery', 'stationery', [3000, 12000, 1000]);
const F_COMMISSION = fHead('commissionReceived', 'commission', [9000, 24000, 1000]);
const F_RENT_RECEIVED = fHead('rentReceived', 'rent', [12000, 36000, 1000]);
const F_DISCOUNT_RECEIVED = fHead('discountReceived', 'discount', [3000, 12000, 1000]);
const F_INTEREST = fHead('interestReceived', 'interest', [3000, 12000, 1000]);

/** A fixed asset that is depreciated: `one` is a single item of it, for an addition during the year. */
interface FAsset {
  id: string;
  name: string;
  many: boolean;
  one: string;
}
/** The most permanent first. */
const F_ASSETS: FAsset[] = [
  { id: 'machinery', name: 'machinery', many: false, one: 'machine' },
  { id: 'furniture', name: 'furniture', many: false, one: 'showcase' },
  { id: 'vehicles', name: 'vehicles', many: true, one: 'van' },
  { id: 'officeEquipment', name: 'office equipment', many: false, one: 'photocopier' },
  { id: 'computers', name: 'computers', many: true, one: 'server' },
];
/** A day in the year, and the months from it to 31 March. */
const F_PART_YEAR = [
  { date: '1 July', months: 9 },
  { date: '1 October', months: 6 },
  { date: '1 December', months: 4 },
  { date: '1 January', months: 3 },
] as const;
const F_QUARTERS = F_PART_YEAR.filter((w) => w.months % 3 === 0);

// ---- adjustments ----

/** One adjustment of a format. */
interface FAdj {
  /** The adjustment as the data prints it. */
  text: string;
  /** True when the data prints it on the line of the adjustment before it, under the same number (its `text` may be empty). */
  joined?: boolean;
  /** Its adjusting entry, posted on top of the trial balance. */
  lines: JournalLine[];
  /**
   * What its author says it does: to the gross profit, to the debit side (`exp`) and the credit side (`inc`) of the
   * Profit and Loss Account, to the capital apart from the profit, and to the liabilities.
   */
  gp: number;
  exp: number;
  inc: number;
  cap: number;
  liab: number;
  /** The lines of working it puts under a row, by the account of the row: ['wages', 'Add: Outstanding ₹4,000']. */
  notes: [row: string, line: string][];
  /** A step of the working: what it does in the Trading Account, in the Profit and Loss Account, in the Balance Sheet. */
  trading?: string;
  pl?: string;
  bs?: string;
  /** What it adds to the capital or takes from it in the Balance Sheet, apart from the profit: "Interest on Capital". */
  capital?: { add: boolean; name: string; amount: number };
  /** The row it adds to the Balance Sheet: on the liabilities side (`L`) or the assets side (`A`). */
  position?: { side: 'L' | 'A'; label: string; amount: number };
  /**
   * A row of its own in the Profit and Loss Account, for its part of what it posts to `account`: the depreciation of
   * each asset is a row ("Depreciation on Machinery"), although one Depreciation A/c holds the charge of the year.
   */
  own?: { account: string; label: string; amount: number; details?: string[] };
  /** Labels a student might wrongly enter for it, in an account and in the Balance Sheet. */
  slips: string[];
  bsSlips: string[];
}
type FAdjInit = Pick<FAdj, 'text' | 'lines'> & Partial<FAdj>;
const fAdj = (a: FAdjInit): FAdj => ({ gp: 0, exp: 0, inc: 0, cap: 0, liab: 0, notes: [], slips: [], bsSlips: [], ...a });

/** An expense of the year that is still unpaid on 31 March. `paid` is its trial balance figure. */
function fOutstanding(h: FHead, x: number, paid: number, when: string): FAdj {
  const direct = F_DIRECT.includes(h.id);
  const label = fName(h.id);
  const owed = `Outstanding ${fCarriedName(h.id)}`;
  const work = `${label} = ${inr(paid)} + ${inr(x)} outstanding = ${inr(paid + x)}: the unpaid amount is ${direct ? 'a cost of the goods of this year' : 'an expense of this year'}.`;
  return fAdj({
    text: `${cap(h.name)} of ${inr(x)} ${when} ${fBe(h)} still unpaid.`,
    lines: [dr(h.id, x), cr('outstandingExpenses', x)],
    gp: direct ? -x : 0,
    exp: direct ? 0 : x,
    liab: x,
    notes: [[h.id, `Add: Outstanding ${inr(x)}`]],
    ...(direct ? { trading: work } : { pl: work }),
    bs: `The ${h.name} of ${inr(x)} still unpaid ${fBe(h)} owed on 31 March: a liability, ${owed}.`,
    position: { side: 'L', label: owed, amount: x },
    slips: [owed],
    bsSlips: [`Prepaid ${fCarriedName(h.id)}`],
  });
}

/** Part of an expense paid in the year that belongs to the next year. `how` says how the part was found. */
function fPrepaid(h: FHead, x: number, paid: number, text: string, how?: string): FAdj {
  const label = fName(h.id);
  return fAdj({
    text,
    lines: [dr('prepaidExpenses', x), cr(h.id, x)],
    exp: -x,
    notes: [[h.id, `Less: Prepaid ${inr(x)}`]],
    pl: `${how ? `${how} ` : ''}${label} = ${inr(paid)} − ${inr(x)} prepaid = ${inr(paid - x)}: the part paid for next year is not an expense of this year.`,
    bs: `${how ? `${how} ` : ''}The ${h.name} of ${inr(x)} paid for next year is a benefit still to come: an asset, Prepaid ${label}.`,
    position: { side: 'A', label: `Prepaid ${label}`, amount: x },
    slips: [`Prepaid ${label}`],
    bsSlips: [`Outstanding ${label}`],
  });
}

/** Income earned in the year and not yet received. `recd` is the trial balance figure. */
function fAccrued(h: FHead, x: number, recd: number, text: string): FAdj {
  const label = fName(h.id);
  return fAdj({
    text,
    lines: [dr('accruedIncome', x), cr(h.id, x)],
    inc: x,
    notes: [[h.id, `Add: Accrued ${inr(x)}`]],
    pl: `${label} = ${inr(recd)} + ${inr(x)} accrued = ${inr(recd + x)}: it was earned this year although the cash has not come in.`,
    bs: `The ${h.name} of ${inr(x)} earned and not yet received is due to the business: an asset, Accrued ${cap(h.name)}.`,
    position: { side: 'A', label: `Accrued ${cap(h.name)}`, amount: x },
    slips: [`Accrued ${cap(h.name)}`],
    bsSlips: [`${label} in Advance`],
  });
}

/** Income received in the year that belongs to the next year. */
function fAdvance(h: FHead, x: number, recd: number, text: string): FAdj {
  const label = fName(h.id);
  return fAdj({
    text,
    lines: [dr(h.id, x), cr('incomeReceivedInAdvance', x)],
    inc: -x,
    liab: x,
    notes: [[h.id, `Less: Received in Advance ${inr(x)}`]],
    pl: `${label} = ${inr(recd)} − ${inr(x)} received in advance = ${inr(recd - x)}: the part received for next year is not income of this year.`,
    bs: `The ${h.name} of ${inr(x)} received for next year is owed until it is earned: a liability, ${label} in Advance.`,
    position: { side: 'L', label: `${label} in Advance`, amount: x },
    slips: [`${label} in Advance`],
    bsSlips: [`Accrued ${cap(h.name)}`],
  });
}

/** Depreciation written off the asset. `add` is an item bought during the year and included in the balance. */
function fDepreciation(a: FAsset, rate: number, bal: number, add?: { cost: number; date: string; months: number }): FAdj {
  const label = fName(a.id);
  const oldPart = pc(bal - (add?.cost ?? 0), rate);
  const newPart = add ? (pc(add.cost, rate) * add.months) / 12 : 0;
  const d = oldPart + newPart;
  const work = add
    ? `Depreciation on ${a.name}: on the balance held all year, (${inr(bal)} − ${inr(add.cost)}) × ${rate}% = ${inr(oldPart)}; on the ${a.one}, ${add.date} to 31 March (${add.months} months), ${inr(add.cost)} × ${rate}% × ${add.months}/12 = ${inr(newPart)}; in all ${inr(d)}.`
    : `Depreciation on ${a.name} = ${inr(bal)} × ${rate}% = ${inr(d)}, for the full year.`;
  return fAdj({
    text: add
      ? `${cap(a.name)} ${a.many ? 'include' : 'includes'} a ${a.one} bought for ${inr(add.cost)} on ${add.date}. Depreciate at ${rate}% p.a. on the balance shown (the ${a.one} from that date only); write it off the asset.`
      : `Depreciate ${a.name} at ${rate}% p.a. on the balance shown, for the full year; write it off the asset.`,
    lines: [dr('depreciation', d), cr(a.id, d)],
    exp: d,
    notes: [[a.id, `Less: Depreciation ${inr(d)}`]],
    own: {
      account: 'depreciation',
      label: `Depreciation on ${label}`,
      amount: d,
      ...(add ? { details: [`On the balance held all year ${inr(oldPart)}`, `Add: On the ${a.one}, for ${add.months} months ${inr(newPart)}`] } : {}),
    },
    pl: `${work} It is an expense of the year, on the debit side: "To Depreciation on ${label}".`,
    bs: `${work} ${label} ${a.many ? 'are' : 'is'} shown at ${inr(bal)} − ${inr(d)} = ${inr(bal - d)}.`,
    slips: [label],
    bsSlips: ['Depreciation'],
  });
}

/** The figures of the debtors: further bad debts, then a provision on what is left. */
interface FDebts {
  further: number;
  rate: number;
  /** The debtors left after the further bad debts. */
  good: number;
  /** The provision and the bad debts already in the trial balance (either may be nothing). */
  old: number;
  tbBad: number;
}

/**
 * Further bad debts written off, and then the provision for doubtful debts on the debtors that are left: one line of
 * the data, and one net charge in the Profit and Loss Account. The change in the provision is posted to Bad Debts
 * A/c, as the case studies post it, so that the account carries the net charge; it is not an entry a student passes.
 */
function fDebts(d: FDebts, oneItem: boolean): FAdj {
  const nw = pc(d.good, d.rate);
  const diff = nw - d.old;
  const debtors = d.good + d.further;
  const charge = d.tbBad + d.further + diff;
  return fAdj({
    text: `Write off further bad debts of ${inr(d.further)}. Then ${d.old ? 'maintain the' : 'create a'} provision for doubtful debts at ${d.rate}% of the remaining debtors.${oneItem ? ' Show bad debts and the change in the provision as one item, Bad Debts.' : ''}`,
    lines: [dr('badDebts', d.further), cr(F_DEBTORS, d.further), ...(diff > 0 ? [dr('badDebts', diff), cr(F_PROVISION, diff)] : [dr(F_PROVISION, -diff), cr('badDebts', -diff)])],
    exp: d.further + diff,
    notes: [
      ['badDebts', `Add: Further Bad Debts ${inr(d.further)}`],
      ['badDebts', `Add: New Provision for Doubtful Debts ${inr(nw)}`],
      ...(d.old ? [['badDebts', `Less: Old Provision for Doubtful Debts ${inr(d.old)}`] as [string, string]] : []),
      [F_DEBTORS, `Less: Further Bad Debts ${inr(d.further)}`],
      [F_DEBTORS, `Less: Provision for Doubtful Debts ${inr(nw)}`],
    ],
    pl: `Debtors after the further bad debts = ${inr(debtors)} − ${inr(d.further)} = ${inr(d.good)}; new provision = ${inr(d.good)} × ${d.rate}% = ${inr(nw)}. Bad Debts, one net charge = ${[...(d.tbBad ? [`bad debts ${inr(d.tbBad)}`] : []), `further bad debts ${inr(d.further)}`, `new provision ${inr(nw)}`].join(' + ')}${d.old ? ` − old provision ${inr(d.old)}` : ''} = ${inr(charge)}.`,
    bs: `Sundry debtors = ${inr(debtors)} − further bad debts ${inr(d.further)} = ${inr(d.good)}; less the provision, ${inr(d.good)} × ${d.rate}% = ${inr(nw)}, they are shown at ${inr(d.good - nw)}. The provision is deducted from the debtors; it is not a liability${d.old ? `, and the old provision of ${inr(d.old)} is replaced by the new one` : ''}.`,
    slips: ['Provision for Doubtful Debts', 'Sundry Debtors'],
    bsSlips: ['Provision for Doubtful Debts', 'Bad Debts'],
  });
}

/** The text of a provision for discount on debtors in the data of a format. */
const fDiscountText = (rate: number): string => `Create a provision for discount on debtors at ${rate}% of the debtors left after the provision for doubtful debts.`;

/**
 * A provision for discount on debtors, on the good debtors: those left after the further bad debts and the provision
 * for doubtful debts of `d`. The charge is a row of its own in the Profit and Loss Account ("Provision for Discount on
 * Debtors"); in the Balance Sheet it is the last deduction from the debtors. (In the books of the format it is posted
 * through Discount Allowed A/c, an expense the trial balances of the formats never carry, so that the row is read
 * from the books like any other.)
 */
function fDiscount(d: FDebts, rate: number): FAdj {
  const doubtful = pc(d.good, d.rate);
  const good = d.good - doubtful;
  const x = pc(good, rate);
  const work = `Good debtors = ${inr(d.good)} (after the further bad debts) − ${inr(doubtful)} (provision for doubtful debts) = ${inr(good)}; provision for discount = ${inr(good)} × ${rate}% = ${inr(x)}.`;
  return fAdj({
    text: fDiscountText(rate),
    lines: [dr('discountAllowed', x), cr('provisionForDiscountOnDebtors', x)],
    exp: x,
    notes: [[F_DEBTORS, `Less: Provision for Discount on Debtors ${inr(x)}`]],
    own: { account: 'discountAllowed', label: 'Provision for Discount on Debtors', amount: x },
    pl: `${work} The discount the good debtors are expected to take is a charge against this year's profit: "To Provision for Discount on Debtors".`,
    bs: `${work} It is the last deduction from the debtors, after the provision for doubtful debts; it is not a liability.`,
    slips: ['Discount Allowed', 'Discount Received'],
    bsSlips: ['Provision for Discount on Debtors'],
  });
}

/**
 * `tbBadAllowed` says whether the trial balance may carry bad debts already written off (one more line of it);
 * `oneItem` has the data say that the bad debts and the provision make one item of the Profit and Loss Account.
 */
function fDrawDebts(rng: Rng, tbBadAllowed: boolean, oneItem: boolean): (FDebts & { adj: FAdj }) | null {
  const rate = rng.pick([5, 10]);
  const good = amount(rng, 100000, 300000, 20000);
  const further = amount(rng, 2000, 12000, 1000);
  const nw = pc(good, rate);
  const hasOld = rng.next() < 0.65;
  const rising = rng.next() < 0.65;
  const old = hasOld ? rupees(1000) * Math.round(pc(nw, rising ? rng.int(30, 80) : rng.int(120, 180)) / rupees(1000)) : 0;
  if (hasOld && (old <= 0 || old === nw)) return null;
  const tbBad = tbBadAllowed && ((hasOld && !rising) || rng.next() < 0.6) ? amount(rng, 2000, 9000, 1000) : 0;
  // The provision released must not swallow the bad debts: the item stays a charge.
  if (tbBad + further + nw - old < rupees(1000)) return null;
  const d: FDebts = { rate, good, further, old, tbBad };
  return { ...d, adj: fDebts(d, oneItem) };
}

/**
 * Interest on capital. `add` is capital brought in during the year and included in the trial balance figure; `said`
 * is false when the data says elsewhere that no capital was brought in.
 */
function fInterestOnCapital(rate: number, capital: number, add?: { amount: number; date: string; months: number }, said = true, plain = false): FAdj {
  const onOld = pc(capital - (add?.amount ?? 0), rate);
  const onNew = add ? (pc(add.amount, rate) * add.months) / 12 : 0;
  const i = onOld + onNew;
  const work = add
    ? `Interest on capital: on the capital held all year, (${inr(capital)} − ${inr(add.amount)}) × ${rate}% = ${inr(onOld)}; on the ${inr(add.amount)} brought in, ${add.date} to 31 March (${add.months} months), ${inr(add.amount)} × ${rate}% × ${add.months}/12 = ${inr(onNew)}; in all ${inr(i)}.`
    : `Interest on capital = ${inr(capital)} × ${rate}% = ${inr(i)}.`;
  // `plain` (the formats at version 2) says in so many words that the rest of the capital earns interest for the full
  // year, and offers no interest on drawings (beyond the Class 11 syllabus) among the labels.
  const brought = (d: string): string => (plain ? `: on that amount from ${d}, and on the rest of the capital for the full year.` : `, on that amount from ${d}.`);
  return fAdj({
    text: add
      ? `Capital includes ${inr(add.amount)} brought in on ${add.date}. Allow interest on capital at ${rate}% p.a.${brought(add.date)}`
      : `Allow interest on capital at ${rate}% p.a.${said ? '; no capital was brought in during the year.' : ''}`,
    lines: [dr('interestOnCapital', i), cr('capital', i)],
    exp: i,
    cap: i,
    capital: { add: true, name: 'Interest on Capital', amount: i },
    pl: `${work} It is an expense of the business, on the debit side.`,
    bs: `${work} It is due to the proprietor, so it is added to the capital.`,
    slips: [plain ? 'Interest Paid' : 'Interest on Drawings'],
    bsSlips: ['Interest on Capital'],
  });
}

/** Interest on the drawings of the trial balance, for the months `when` says they were out of the business. */
function fInterestOnDrawings(rate: number, drawings: number, when: { date: string; months: number }): FAdj {
  const j = (drawings * rate * when.months) / 1200;
  const work = `Interest on drawings = ${inr(drawings)} × ${rate}% × ${when.months}/12 = ${inr(j)}.`;
  return fAdj({
    text: when.date
      ? `The drawings were all made on ${when.date}. Charge interest on them at ${rate}% p.a. up to 31 March.`
      : `The drawings were made evenly through the year. Charge interest on them at ${rate}% p.a. for an average of six months.`,
    lines: [dr('drawings', j), cr('interestOnDrawings', j)],
    inc: j,
    cap: -j,
    capital: { add: false, name: 'Interest on Drawings', amount: j },
    pl: `${work} It is an income of the business, on the credit side.`,
    bs: `${work} It is charged to the proprietor, so it is deducted from the capital with the drawings.`,
    slips: ['Drawings'],
    bsSlips: ['Interest on Drawings'],
  });
}

type FBasis = 'before' | 'after';

/** The manager's commission on `p`, the net profit before charging it; unpaid on 31 March. */
function fCommission(rate: number, basis: FBasis, p: number): FAdj {
  const c = basis === 'after' ? (p * rate) / (100 + rate) : (p * rate) / 100;
  return fAdj({
    text: `The manager gets a commission of ${rate}% of the net profit ${basis} charging such commission, reckoned after all the other adjustments; it is unpaid.`,
    lines: [dr('commissionPaid', c), cr('outstandingExpenses', c)],
    exp: c,
    liab: c,
    pl:
      basis === 'after'
        ? `With every other item entered, the net profit before the commission is ${inr(p)}. The commission is on the profit after charging it: ${inr(p)} × ${rate}/${100 + rate} = ${inr(c)} (check: ${rate}% of the ${inr(p - c)} left is ${inr(c)}). It is an expense, on the debit side; being unpaid, it is also an outstanding expense in the Balance Sheet.`
        : `With every other item entered, the net profit before the commission is ${inr(p)}. The commission is on the profit before charging it: ${inr(p)} × ${rate}/100 = ${inr(c)}. It is an expense, on the debit side; being unpaid, it is also an outstanding expense in the Balance Sheet.`,
    slips: ['Outstanding Commission', 'Commission Received'],
  });
}

/** No entry has been made for the goods, and they leave the books through Purchases A/c (not Sales or Trading A/c). */
const F_GOODS_NOTE = 'No entry was made; credit Purchases A/c.';

/** Goods the proprietor took for personal use, credited to Purchases at cost. `price` is what they sell for. */
const fGoodsDrawn = (g: number, price: number): FAdj =>
  fAdj({
    text: `The proprietor took goods costing ${inr(g)} (selling price ${inr(price)}) for personal use. ${F_GOODS_NOTE}`,
    lines: [dr('drawings', g), cr('purchases', g)],
    gp: g,
    cap: -g,
    notes: [['purchases', `Less: Goods taken by the proprietor ${inr(g)}`]],
    trading: `The goods taken by the proprietor were not sold: they leave purchases at their cost, ${inr(g)}, not at the selling price of ${inr(price)}, and are added to the drawings in the Balance Sheet.`,
    slips: ['Drawings'],
  });

/** Goods given away as free samples or to a charity, credited to Purchases at cost. */
const fGoodsGiven = (g: number, to: 'samples' | 'charity'): FAdj =>
  fAdj({
    text: `Goods costing ${inr(g)} were ${to === 'samples' ? 'given away as free samples' : 'given to a charitable trust'}. ${F_GOODS_NOTE}`,
    lines: [dr(to === 'samples' ? 'advertisement' : 'charity', g), cr('purchases', g)],
    gp: g,
    exp: g,
    notes: [['purchases', `Less: Goods given ${to === 'samples' ? 'as free samples' : 'to charity'} ${inr(g)}`]],
    trading: `The goods given ${to === 'samples' ? 'as free samples' : 'to charity'} were not sold: they leave purchases at their cost, ${inr(g)}, and are charged as ${to === 'samples' ? 'advertisement' : 'charity'} in the Profit and Loss Account.`,
    slips: [to === 'samples' ? 'Advertisement' : 'Charity'],
  });

/** Goods lost by fire, credited to Purchases at cost; `claim` is what the insurer has admitted (it may be nothing). */
const fGoodsBurnt = (g: number, claim: number, cover: string): FAdj =>
  fAdj({
    text: `Goods costing ${inr(g)} were lost by fire; ${cover} ${F_GOODS_NOTE}`,
    lines: [...(claim ? [dr('insuranceClaimReceivable', claim)] : []), dr('lossByFire', g - claim), cr('purchases', g)],
    gp: g,
    exp: g - claim,
    notes: [['purchases', `Less: Goods lost by fire ${inr(g)}`]],
    trading: claim
      ? `The goods lost by fire leave purchases at their cost, ${inr(g)}. The loss, ${inr(g)} − the claim of ${inr(claim)} = ${inr(g - claim)}, is charged in the Profit and Loss Account, and the claim is an asset in the Balance Sheet.`
      : `The goods lost by fire leave purchases at their cost, ${inr(g)}. The loss is charged in the Profit and Loss Account, not in the Trading Account.`,
    slips: ['Loss by Fire', ...(claim ? ['Insurance Claim Receivable'] : [])],
  });

/** Two assets depreciated for the full year, said in one line of the data: the second adjustment shares the number of the first. */
function fDepreciationPair(a: FAsset, rateA: number, balA: number, b: FAsset, rateB: number, balB: number): FAdj[] {
  return [
    { ...fDepreciation(a, rateA, balA), text: `Depreciate ${a.name} at ${rateA}% p.a. and ${b.name} at ${rateB}% p.a. on the balances shown, for the full year; write it off the assets.` },
    { ...fDepreciation(b, rateB, balB), text: '', joined: true },
  ];
}

/**
 * A fixed asset and its depreciation: the whole balance for the year, or with an item bought during the year, whose
 * cost is fixed by the rate so that a month of its depreciation is ₹500 or ₹1,000.
 */
function fDrawDepreciation(rng: Rng, asset: FAsset, withAddition: boolean): { asset: string; balance: number; adj: FAdj } {
  const rate = rng.pick([10, 15, 20]);
  if (!withAddition) {
    const balance = amount(rng, 100000, 300000, 20000);
    return { asset: asset.id, balance, adj: fDepreciation(asset, rate, balance) };
  }
  const cost = rupees((rng.pick([500, 1000]) * 1200) / rate);
  const balance = amount(rng, 100000, 240000, 20000) + cost;
  const when = rng.pick(F_PART_YEAR);
  return { asset: asset.id, balance, adj: fDepreciation(asset, rate, balance, { cost, date: when.date, months: when.months }) };
}

/**
 * The fixed assets of a format and their depreciation, as blocks of adjustments that stay together: one asset (with an
 * item bought during the year as often as `additions` says), or two assets, each for the full year, in one line.
 */
function fDrawFixed(rng: Rng, count: number, additions: number): { fixed: FBal[]; adjs: FAdj[] } {
  const [a, b] = rng.shuffle(F_ASSETS);
  if (count === 1) {
    const d = fDrawDepreciation(rng, a, rng.next() < additions);
    return { fixed: [[a.id, d.balance]], adjs: [d.adj] };
  }
  const [rateA, rateB] = [rng.pick([10, 15, 20]), rng.pick([10, 15, 20])];
  const [balA, balB] = [amount(rng, 100000, 300000, 20000), amount(rng, 100000, 300000, 20000)];
  return { fixed: [[a.id, balA], [b.id, balB]], adjs: fDepreciationPair(a, rateA, balA, b, rateB, balB) };
}

/**
 * The drawings of the year and the interest on them, at a rate and for a time that make the interest a round figure
 * (a multiple of ₹500), so that the figures it leads to stay round.
 */
function fDrawDrawings(rng: Rng): { drawings: number; adj: FAdj } {
  const whens = [{ date: '', months: 6 }, { date: '', months: 6 }, ...F_QUARTERS];
  for (let go = 0; go < 20; go++) {
    const rate = rng.pick([5, 6, 8, 10, 12]);
    const when = rng.pick(whens);
    const fits = [24000, 30000, 36000, 40000, 45000, 48000, 50000, 54000, 60000].map(rupees).filter((d) => ((d * rate * when.months) / 1200) % rupees(500) === 0);
    if (fits.length > 0) {
      const drawings = rng.pick(fits);
      return { drawings, adj: fInterestOnDrawings(rate, drawings, when) };
    }
  }
  // A rate and a time that always fit.
  return { drawings: rupees(30000), adj: fInterestOnDrawings(10, rupees(30000), whens[0]) };
}

// ---- the trial balance and the books ----

interface FTbSpec {
  fixed: FBal[];
  directs: FBal[];
  indirect: FBal[];
  incomes?: FBal[];
  purchasesReturn?: number;
  salesReturn?: number;
  badDebts?: number;
  /** Left out for a statement that has no use for the debtors: one balance fewer to read. */
  debtors?: number;
  provision?: number;
  /** False for a statement that has no use for the creditors. */
  creditors?: boolean;
  drawings: number;
  cash?: number;
  /** The net profit the trial balance and the closing stock give before any other adjustment. */
  profit: number;
}

/** A trial balance before it is written up: the sales and the bank balance can still be moved together. */
interface FTb {
  others: JournalLine[];
  sales: number;
  bank: number;
  capital: number;
  cs: number;
}

/**
 * A trial balance that agrees, drawn as the case studies draw theirs. The gross profit follows from the profit
 * wanted; the cost of goods sold from a margin; purchases and sales from those. The capital is what the other
 * balances need, taken to the next ₹50,000, and the bank balance is the balancing figure. Null for a business whose
 * balances would not be believable.
 */
function fTb(rng: Rng, t: FTbSpec): FTb | null {
  const incomes = t.incomes ?? [];
  const debtors = t.debtors ?? 0;
  const gp = fTotal(t.indirect) + (t.badDebts ?? 0) - fTotal(incomes) + t.profit;
  if (gp < rupees(60000)) return null;
  const costAt = (margin: number): number => Math.round((gp * 100) / margin / rupees(10000)) * rupees(10000);
  // Debtors in proportion to the turnover.
  const margins = [20, 25, 30, 40].filter((m) => (costAt(m) + gp) * 2 >= debtors * 5);
  if (margins.length === 0) return null;
  const cogs = costAt(rng.pick(margins));
  const round5 = (v: number): number => Math.round(v / rupees(5000)) * rupees(5000);
  const os = round5(pc(cogs, rng.int(8, 16)));
  const counted = round5(pc(cogs, rng.int(9, 18)));
  const cs = counted === os ? os + rupees(5000) : counted;
  const pr = t.purchasesReturn ?? 0;
  const sr = t.salesReturn ?? 0;
  const purchases = cogs - os - fTotal(t.directs) + cs + pr;
  if (purchases < rupees(100000)) return null;
  const others: JournalLine[] = [
    dr('drawings', t.drawings),
    ...t.fixed.map(([id, v]) => dr(id, v)),
    dr('stock', os),
    dr('purchases', purchases),
    ...(pr ? [cr('purchasesReturn', pr)] : []),
    ...(sr ? [dr('salesReturn', sr)] : []),
    ...[...t.directs, ...t.indirect].map(([id, v]) => dr(id, v)),
    ...(t.badDebts ? [dr('badDebts', t.badDebts)] : []),
    ...incomes.map(([id, v]) => cr(id, v)),
    ...(debtors ? [dr(F_DEBTORS, debtors)] : []),
    ...(t.provision ? [cr(F_PROVISION, t.provision)] : []),
    ...(t.creditors === false ? [] : [cr(F_CREDITORS, round5(pc(cogs, rng.int(8, 18))))]),
    ...(t.cash ? [dr('cash', t.cash)] : []),
  ];
  const sales = cogs + gp + sr;
  // What the capital less the bank balance must be for the two columns to agree.
  const gap = others.reduce((x, l) => x + (l.side === 'Dr' ? l.amount : -l.amount), 0) - sales;
  const capital = Math.ceil((gap + amount(rng, 12000, 40000, 1000)) / rupees(50000)) * rupees(50000);
  if (capital < rupees(150000)) return null;
  return { others, sales, bank: capital - gap, capital, cs };
}

/** The books of a format: the trial balance, and the same books with the adjusting entries posted. */
interface FCase {
  firm: string;
  tb: Ledger;
  books: Ledger;
  cs: number;
  adjs: FAdj[];
}

/** What an entry does to the final accounts, each of its accounts placed by its type: the check on what its author says. */
function fEffect(lines: JournalLine[]): Pick<FAdj, 'gp' | 'exp' | 'inc' | 'cap' | 'liab'> {
  const e = { gp: 0, exp: 0, inc: 0, cap: 0, liab: 0 };
  for (const [id, net] of post([lines])) {
    const type = resolveAccount(id).type;
    if (F_TRADING.includes(id)) e.gp -= net;
    else if (type === 'expense') e.exp += net;
    else if (type === 'income') e.inc -= net;
    else if (type === 'liability') e.liab -= net;
    else if (type === 'capital') e.cap -= net;
  }
  return e;
}

/**
 * The books of a format, written up in an order drawn from the seed (a trial balance lists the accounts as the
 * ledger has them). Null for an adjustment that is not a whole number of rupees, or a profit out of proportion to
 * the capital.
 */
function fCase(rng: Rng, firm: string, t: FTb, adjs: FAdj[]): FCase | null {
  if (adjs.some((a) => a.lines.some((l) => !isWhole(l.amount) || l.amount <= 0))) return null;
  for (const a of adjs) {
    const e = fEffect(a.lines);
    if (e.gp !== a.gp || e.exp !== a.exp || e.inc !== a.inc || e.cap !== a.cap || e.liab !== a.liab) throw new Error(`final accounts format: the entry of "${a.text}" does not have its stated effect`);
  }
  if (t.bank < rupees(5000)) return null;
  const tb = post([rng.shuffle([cr('capital', t.capital), ...t.others, cr('sales', t.sales), dr('bank', t.bank)])]);
  const c: FCase = { firm, tb, books: post(adjs.map((a) => a.lines), tb), cs: t.cs, adjs };
  const net = fFigures(c.books, c.cs).net;
  return net < rupees(20000) || net * 100 > t.capital * 40 ? null : c;
}

/** The final accounts a set of books and a closing stock give. */
interface FFigures {
  os: number;
  pur: number;
  pr: number;
  directs: FBal[];
  sales: number;
  sr: number;
  /** The two sides of the Trading Account before its balance. */
  debit: number;
  credit: number;
  gross: number;
  /** The indirect expenses and the incomes other than sales, in the order of the books. */
  expenses: FBal[];
  incomes: FBal[];
  net: number;
}

function fFigures(books: Ledger, cs: number): FFigures {
  const of = (id: string): number => books.get(id) ?? 0;
  const typed = (type: string): FBal[] => [...books].filter(([id, x]) => x !== 0 && !F_TRADING.includes(id) && resolveAccount(id).type === type);
  const directs: FBal[] = F_DIRECT.filter((id) => of(id) !== 0).map((id) => [id, of(id)]);
  const expenses = typed('expense');
  const incomes = typed('income').map(([id, x]): FBal => [id, -x]);
  const [os, pur, pr, sales, sr] = [of('stock'), of('purchases'), -of('purchasesReturn'), -of('sales'), of('salesReturn')];
  const debit = os + pur - pr + fTotal(directs);
  const credit = sales - sr + cs;
  const gross = credit - debit;
  return { os, pur, pr, directs, sales, sr, debit, credit, gross, expenses, incomes, net: gross - fTotal(expenses) + fTotal(incomes) };
}

/** The lines the adjustments put under the row of an account. */
const fNotes = (c: FCase, id: string): string[] => c.adjs.flatMap((a) => a.notes.filter(([row]) => row === id).map(([, line]) => line));

/**
 * The row of an account at `now`, its figure after the adjustments. When an adjustment changed it, the trial balance
 * figure and the adjustments are shown under it; an item that was not in the trial balance starts with its first note.
 */
function fRow(c: FCase, id: string, now: number, extra: string[] = []): FormatRowParts {
  const label = fName(id);
  const notes = [...extra, ...fNotes(c, id)];
  if (notes.length === 0) return { label, amount: now };
  const before = Math.abs(c.tb.get(id) ?? 0);
  return { label, amount: now, details: before ? [`${label} ${inr(before)}`, ...notes] : [notes[0].replace(/^Add: /, ''), ...notes.slice(1)] };
}

/** The number an adjustment carries in the data: the closing stock is (1), and a joined adjustment shares a number. */
const fNo = (c: FCase, a: FAdj): number => c.adjs.slice(0, c.adjs.indexOf(a) + 1).filter((x) => !x.joined).length + 1;

/** The data of a format: the business and the day, the trial balance, the numbered adjustments, and a last line. */
function fData(c: FCase, last?: string): string {
  return [
    `${c.firm} closes its books on ${F_DATE}, the end of its accounting year. The trial balance on that date:`,
    listBalances(trialBalance(c.tb).rows.map((r) => ({ ...r, label: r.accountId === 'stock' ? F_NAMES.stock : r.label }))),
    `Adjustments: (1) Closing stock is valued at ${inr(c.cs)}; it is not in the trial balance.`,
    ...c.adjs.filter((a) => !a.joined).map((a) => `(${fNo(c, a)}) ${a.text}`),
    ...(last ? [last] : []),
  ].join('\n');
}

/** What a format is made from, kept for its `verify`. */
const fKept = keepFor<FCase>();
const fLower = (xs: readonly FBal[]): string[] => xs.map(([id]) => fName(id).toLowerCase());
/** The balances of the trial balance that no adjustment touched, with their figures: "rent ₹36,000". */
const fPlain = (c: FCase, xs: readonly FBal[]): string[] => xs.filter(([id]) => fNotes(c, id).length === 0 && c.tb.has(id)).map(([id, a]) => `${fName(id).toLowerCase()} ${inr(a)}`);

// ---- the three statements ----

/** The Trading Account after the adjustments that touch it. */
function fTradingParts(c: FCase): AccountParts {
  const f = fFigures(c.books, c.cs);
  const before = fFigures(c.tb, c.cs);
  const taken = c.adjs.flatMap((a) => a.lines.filter((l) => l.accountId === 'purchases' && l.side === 'Cr').map((l) => l.amount));
  const leftOut = [...before.expenses, ...before.incomes];
  const data = fData(c);
  fKept.keep(data, c);
  return {
    task: `Prepare the Trading Account of ${c.firm} for the year ended ${F_DATE}, after the adjustments; enter each item at its net figure.`,
    data,
    title: `Trading Account of ${c.firm} for the year ended ${F_DATE}`,
    left: drSide([
      fRow(c, 'stock', f.os),
      fRow(c, 'purchases', f.pur - f.pr, f.pr ? [`Less: Purchases Return ${inr(f.pr)}`] : []),
      ...f.directs.map(([id, a]) => fRow(c, id, a)),
      { label: F_GP_CD, amount: f.gross, closing: true },
    ]),
    right: crSide([fRow(c, 'sales', f.sales - f.sr, f.sr ? [`Less: Sales Return ${inr(f.sr)}`] : []), { label: 'Closing Stock', amount: c.cs }]),
    // The account an adjustment sends the goods or the unpaid amount to, an indirect expense offered for the Trading
    // Account, the balance brought down where it is carried down, the capital, and a return as a row of its own.
    distractors: [
      ...new Set([
        ...c.adjs.filter((a) => a.trading).flatMap((a) => a.slips),
        ...leftOut.slice(0, 2).map(([id]) => fName(id)),
        F_GP_BD,
        'Drawings',
        'Capital',
        ...(f.pr ? ['Purchases Return'] : []),
        ...(f.sr ? ['Sales Return'] : []),
      ]),
    ],
    explanation: [
      `The debit side takes the cost of the goods: opening stock ${inr(f.os)}, purchases and the direct ${f.directs.length > 1 ? 'expenses' : 'expense'}, ${fList(fLower(f.directs))}. The credit side takes the sales and the closing stock of ${inr(c.cs)}.`,
      ...c.adjs.map((a) => `(${fNo(c, a)}) ${a.trading ?? `Not an item of the Trading Account: it changes an indirect expense, which belongs to the Profit and Loss Account. There, ${a.pl ?? ''}`}`),
      `Purchases = ${inr(before.pur)}${f.pr ? ` − the return of ${inr(f.pr)}` : ''}${taken.map((x) => ` − ${inr(x)}`).join('')} = ${inr(f.pur - f.pr)}.${f.sr ? ` Sales = ${inr(f.sales)} − the return of ${inr(f.sr)} = ${inr(f.sales - f.sr)}.` : ''}`,
      `${cap(fList(fLower(leftOut)))} are indirect items: they wait for the Profit and Loss Account. Capital, drawings, the assets and the liabilities go to the Balance Sheet.`,
      `Debit side = ${fAdded([f.os, f.pur - f.pr, ...f.directs.map((d) => d[1])])}. Credit side = ${inr(f.sales - f.sr)} + ${inr(c.cs)} = ${inr(f.credit)}.`,
      `The credit side is larger by ${inr(f.gross)}: the gross profit. It is entered on the debit side as "To ${F_GP_CD}", and both sides then total ${inr(f.credit)}.`,
    ],
    hints: [
      'Take the adjustments one at a time. Does it change the cost of the goods? If it does, which item of the Trading Account does it change, and does it add to it or take away from it?',
      'An unpaid direct expense is added to that expense. Goods that left the business without being sold (taken by the proprietor, given away, lost) are deducted from purchases at cost. The closing stock goes on the credit side.',
    ],
  };
}

/** The Profit and Loss Account after the adjustments, from the gross profit the data gives. */
function fProfitAndLossParts(c: FCase, hints?: string[]): AccountParts {
  const f = fFigures(c.books, c.cs);
  const directs = fFigures(c.tb, c.cs).directs;
  const plain = [...fPlain(c, f.expenses), ...fPlain(c, f.incomes)];
  const data = fData(c, `The Trading Account for the year, already prepared, shows a gross profit of ${inr(f.gross)}.`);
  fKept.keep(data, c);
  const credit = f.gross + fTotal(f.incomes);
  // An account whose charge the adjustments set out row by row (the depreciation of each asset) gives those rows.
  const debit = f.expenses.flatMap(([id, a]): FormatRowParts[] => {
    const own = c.adjs.flatMap((x) => (x.own?.account === id ? [x.own] : []));
    if (own.length === 0) return [fRow(c, id, a)];
    if (sum(own.map((o) => o.amount)) !== a) throw new Error(`final accounts format: the rows of ${fName(id)} do not come to its balance`);
    return own.map((o) => ({ label: o.label, amount: o.amount, ...(o.details ? { details: o.details } : {}) }));
  });
  // A fixed asset that no adjustment depreciates: the working says why nothing is charged on it.
  const idle = F_ASSETS.filter((a) => c.tb.has(a.id) && !c.adjs.some((x) => x.lines.some((l) => l.accountId === a.id)));
  return {
    task: `Prepare the Profit and Loss Account of ${c.firm} for the year ended ${F_DATE} from the gross profit given, after the adjustments; enter each item at its net figure.`,
    data,
    title: `Profit and Loss Account of ${c.firm} for the year ended ${F_DATE}`,
    left: drSide([...debit, { label: F_NET_PROFIT, amount: f.net, closing: true }]),
    right: crSide([{ label: F_GP_BD, amount: f.gross }, ...f.incomes.map(([id, a]) => fRow(c, id, a))]),
    // The gross profit carried down where it is brought down, a direct expense offered for the Profit and Loss
    // Account, the owner's accounts, and what an adjustment leaves in the Balance Sheet entered as a row here.
    distractors: [...new Set([F_GP_CD, ...directs.map(([id]) => fName(id)), 'Drawings', 'Capital', ...c.adjs.flatMap((a) => a.slips), 'Closing Stock', F_NET_LOSS])].slice(0, 10),
    explanation: [
      `The gross profit of ${inr(f.gross)} is brought down from the Trading Account to the credit side: "By ${F_GP_BD}".`,
      ...c.adjs.map((a) => `(${fNo(c, a)}) ${a.pl ?? ''}`),
      ...(plain.length > 0 ? [`At the trial balance figure: ${fList(plain)}.`] : []),
      ...(idle.length > 0 ? [`No adjustment asks for depreciation on the ${fList(idle.map((a) => a.name))}, so none is charged: only the adjustments listed are made.`] : []),
      `${cap(fList(fLower(directs)))}, the stocks, purchases and sales were used in the Trading Account. Capital, drawings, the assets and the liabilities go to the Balance Sheet.`,
      `Debit side = ${fAdded(debit.map((r) => r.amount ?? 0))}. Credit side = ${fAdded([f.gross, ...f.incomes.map((x) => x[1])])}.`,
      `The credit side is larger by ${inr(f.net)}: the net profit. It is entered on the debit side as "To ${F_NET_PROFIT}", and both sides then total ${inr(credit)}.`,
    ],
    hints: hints ?? [
      'Take the adjustments one at a time. Which item of this account does it change, and does it add to it or take away from it? Is it an expense or an income of the business?',
      'An unpaid expense and an income earned but not received are added; an expense paid for next year and an income received for next year are deducted. Depreciation (a row for each asset), interest on capital and a commission to the manager are expenses.',
    ],
  };
}

type FMarshal = 'liquidity' | 'permanence';

/** The Balance Sheet after the adjustments, the net profit given: every asset and liability at its adjusted figure. */
function fBalanceSheetParts(c: FCase, order: FMarshal): AccountParts {
  const f = fFigures(c.books, c.cs);
  const of = (id: string): number => c.books.get(id) ?? 0;
  const capital = -(c.tb.get('capital') ?? 0);
  const drawings = c.tb.get('drawings') ?? 0;
  const closing = -of('capital') + f.net - of('drawings');
  const moved = c.adjs.flatMap((a) => (a.capital ? [a.capital] : []));
  const plus = moved.filter((m) => m.add);
  const minus = moved.filter((m) => !m.add);
  const placed = (side: 'L' | 'A'): FormatRowParts[] => c.adjs.flatMap((a) => (a.position?.side === side ? [{ label: a.position.label, amount: a.position.amount }] : []));
  // Both sides in the order of permanence; the order of liquidity is the same lists read from the other end. An
  // amount paid ahead never turns into cash, so it stands as the least liquid of the current assets.
  const assets: FormatRowParts[] = [
    ...F_ASSETS.filter((a) => c.books.has(a.id)).map((a) => fRow(c, a.id, of(a.id))),
    ...placed('A'),
    { label: 'Closing Stock', amount: c.cs },
    fRow(c, F_DEBTORS, of(F_DEBTORS) + of(F_PROVISION) + of('provisionForDiscountOnDebtors')),
    { label: 'Cash at Bank', amount: of('bank') },
    ...(c.books.has('cash') ? [{ label: 'Cash in Hand', amount: of('cash') }] : []),
  ];
  const liabilities: FormatRowParts[] = [
    {
      label: 'Capital',
      amount: closing,
      details: [
        `Opening Capital ${inr(capital)}`,
        ...plus.map((m) => `Add: ${m.name} ${inr(m.amount)}`),
        `Add: Net Profit ${inr(f.net)}`,
        `Less: Drawings ${inr(drawings)}`,
        ...minus.map((m) => `Less: ${m.name} ${inr(m.amount)}`),
      ],
    },
    { label: 'Sundry Creditors', amount: -of(F_CREDITORS) },
    ...placed('L'),
  ];
  const inOrder = (rows: FormatRowParts[]): FormatRowParts[] => (order === 'permanence' ? rows : [...rows].reverse());
  const total = assets.reduce((x, r) => x + (r.amount ?? 0), 0);
  const data = fData(c, `The Profit and Loss Account, prepared after all these adjustments, shows a net profit of ${inr(f.net)}. No capital was brought in during the year.`);
  fKept.keep(data, c);
  return {
    task: `Prepare the Balance Sheet of ${c.firm} as at ${F_DATE} in the order of ${order}, after the adjustments; enter each item at its net figure.`,
    data,
    title: `Balance Sheet of ${c.firm} as at ${F_DATE}`,
    left: { title: 'Liabilities', rows: inOrder(liabilities) },
    right: { title: 'Assets', rows: inOrder(assets) },
    // What belongs inside another row entered as a row of its own (drawings, the profit, the provision, the
    // depreciation), the amount carried forward under the name of the opposite kind, and the stock of the wrong day.
    distractors: [...new Set(['Drawings', 'Net Profit', ...c.adjs.flatMap((a) => a.bsSlips), 'Opening Stock', 'Bank Overdraft'])].slice(0, 10),
    explanation: [
      ...c.adjs.map((a) => `(${fNo(c, a)}) ${a.bs ?? ''}`),
      `Capital = ${[`opening capital ${inr(capital)}`, ...plus.map((m) => `${m.name.toLowerCase()} ${inr(m.amount)}`), `net profit ${inr(f.net)}`].join(' + ')} − drawings ${inr(drawings)}${minus.map((m) => ` − ${m.name.toLowerCase()} ${inr(m.amount)}`).join('')} = ${inr(closing)}. Neither the profit nor the drawings is a row of its own.`,
      `The closing stock of ${inr(c.cs)} is an asset although it is not in the trial balance. The opening stock is not: it went into the cost of the goods in the Trading Account.`,
      'The expenses and the incomes, with their adjustments, went into the net profit; none of them is a row here.',
      order === 'liquidity'
        ? 'Order of liquidity: the assets begin with the one nearest to cash and end with the most lasting; the liabilities begin with the one to be paid soonest and end with the capital.'
        : 'Order of permanence: the assets begin with the most lasting and end with cash; the liabilities begin with the capital and end with the one to be paid soonest.',
      `Liabilities = ${fAdded(inOrder(liabilities).map((r) => r.amount ?? 0))}. Assets = ${fAdded(inOrder(assets).map((r) => r.amount ?? 0))}. Both sides total ${inr(total)}.`,
    ],
    hints: [
      'Every adjustment has a second effect, and it is the one that shows here: something still owed, something still to come, or an asset or the capital at a new figure. Take them one at a time.',
      'Fixed assets less depreciation; debtors less further bad debts, then less the provision for doubtful debts, then less any provision for discount; prepaid expenses and accrued income are assets, outstanding expenses and income received in advance are liabilities; capital plus interest on capital and net profit, less drawings.',
    ],
  };
}

// ---- the independent reading: the printed trial balance worked by hand, then the stated effects of the adjustments ----

const F_READ_COST = ['Opening Stock', 'Purchases A/c', 'Purchases Return A/c', 'Wages A/c', 'Carriage Inwards A/c', 'Power and Fuel A/c'];
const F_READ_SALES = ['Sales A/c', 'Sales Return A/c'];
/** What the business owns; the provision, a credit balance, is a deduction from the debtors. */
const F_READ_ASSETS = [
  'Machinery A/c', 'Furniture A/c', 'Vehicles A/c', 'Office Equipment A/c', 'Computers A/c', 'Sundry Debtors', 'Provision for Doubtful Debts A/c', 'Bank A/c', 'Cash A/c',
];
const F_READ_LIABILITIES = ['Sundry Creditors'];
const F_READ_OWNER = ['Capital A/c', 'Drawings A/c'];
/** Every printed balance that is not an indirect expense or an income other than sales. */
const F_READ_ELSEWHERE = new Set([...F_READ_COST, ...F_READ_SALES, ...F_READ_ASSETS, ...F_READ_LIABILITIES, ...F_READ_OWNER]);

/** What the printed trial balance and the closing stock give before any adjustment. */
interface FHand {
  /** A printed balance, a debit as a positive figure (0 when the trial balance has no such line). */
  get(label: string): number;
  /** The printed balances, in the order of the data. */
  labels: string[];
  cs: number;
  /** The debit side of the Trading Account, the net sales and the gross profit. */
  cost: number;
  netSales: number;
  gross: number;
  /** The indirect expenses and the incomes other than sales. */
  exp: number;
  inc: number;
  /** What is owed to outsiders, and the capital less the drawings. */
  liab: number;
  own: number;
  /** What the data says an account already prepared shows. */
  given: { level: string; profit: number } | null;
}

/** Null for data whose trial balance does not agree, lists an account twice or has no closing stock beside it. */
function fRead(data: string): FHand | null {
  const printed = new Map<string, number>();
  for (const line of data.split('\n')) {
    const m = /^(.+): (₹[\d,]+) \((Dr|Cr)\)$/.exec(line);
    const x = m ? parseRupees(m[2]) : null;
    if (!m || x === null) continue;
    if (printed.has(m[1])) return null;
    printed.set(m[1], m[3] === 'Dr' ? x : -x);
  }
  const stock = /\(1\) Closing stock is valued at (₹[\d,]+);/.exec(data);
  const cs = stock ? (parseRupees(stock[1]) ?? 0) : 0;
  const get = (label: string): number => printed.get(label) ?? 0;
  const sumOf = (labels: readonly string[]): number => labels.reduce((x, l) => x + get(l), 0);
  const labels = [...printed.keys()];
  if (cs <= 0 || sumOf(labels) !== 0) return null;
  const nominal = labels.filter((l) => !F_READ_ELSEWHERE.has(l)).map(get);
  const cost = sumOf(F_READ_COST);
  const netSales = -sumOf(F_READ_SALES);
  const said = /shows a (gross|net) profit of (₹[\d,]+)\./.exec(data);
  const profit = said ? parseRupees(said[2]) : null;
  return {
    get,
    labels,
    cs,
    cost,
    netSales,
    gross: netSales + cs - cost,
    exp: sum(nominal.filter((x) => x > 0)),
    inc: -sum(nominal.filter((x) => x < 0)),
    liab: -sumOf(F_READ_LIABILITIES),
    own: -sumOf(F_READ_OWNER),
    given: said && profit !== null ? { level: said[1], profit } : null,
  };
}

/** The final accounts of a question worked by hand: the printed trial balance, then what each adjustment is said to do. */
function fWorked(q: AccountQuestion) {
  const c = fKept.of(q.data);
  const h = fRead(q.data);
  // Every adjustment the books were made with must be in the data the student reads.
  if (!c || !h || c.adjs.some((a) => !q.data.includes(a.text))) return null;
  const all = (pick: (a: FAdj) => number): number => sum(c.adjs.map(pick));
  const gross = h.gross + all((a) => a.gp);
  const exp = h.exp + all((a) => a.exp);
  const inc = h.inc + all((a) => a.inc);
  const net = gross + inc - exp;
  return { c, h, gross, exp, inc, net, liab: h.liab + all((a) => a.liab), own: h.own + all((a) => a.cap) + net, less: all((a) => a.gp) };
}

/** The total of the rows of a side, its closing row apart. */
const fSide = (q: AccountQuestion, i: 0 | 1): number => sum(q.sides[i].rows.filter((r) => !r.closing).map((r) => r.amounts[0]));
/** True when the account has one closing row, on the debit side, with this label and amount. */
function fClosesOn(q: AccountQuestion, label: string, amt: number): boolean {
  const closing = q.sides[0].rows.filter((r) => r.closing);
  return amt > 0 && closing.length === 1 && closing[0].label === label && closing[0].amounts[0] === amt && q.sides[1].rows.every((r) => !r.closing);
}
const fRowIs = (q: AccountQuestion, i: 0 | 1, label: string, amt: number): boolean => q.sides[i].rows.filter((r) => r.label === label && r.amounts[0] === amt).length === 1;

function fTradingHolds(q: AccountQuestion): boolean {
  const w = fWorked(q);
  if (!w) return false;
  // Every adjustment that changes the gross profit does so on the debit side: an unpaid direct expense raises it,
  // goods credited to Purchases A/c lower it.
  const taken = sum(w.c.adjs.flatMap((a) => a.lines.filter((l) => l.accountId === 'purchases').map((l) => (l.side === 'Cr' ? l.amount : -l.amount))));
  return (
    fSide(q, 0) === w.h.cost - w.less &&
    fSide(q, 1) === w.h.netSales + w.h.cs &&
    fRowIs(q, 0, 'Purchases', w.h.get('Purchases A/c') + w.h.get('Purchases Return A/c') - taken) &&
    fRowIs(q, 1, 'Sales', w.h.netSales) &&
    fClosesOn(q, F_GP_CD, w.gross)
  );
}

function fProfitAndLossHolds(q: AccountQuestion): boolean {
  const w = fWorked(q);
  // The gross profit the data gives must be the one its trial balance and closing stock give.
  if (!w || w.h.given?.level !== 'gross' || w.h.given.profit !== w.gross) return false;
  return fSide(q, 0) === w.exp && fSide(q, 1) === w.gross + w.inc && fRowIs(q, 1, F_GP_BD, w.gross) && fClosesOn(q, F_NET_PROFIT, w.net);
}

function fBalanceSheetHolds(q: AccountQuestion): boolean {
  const w = fWorked(q);
  // The net profit the data gives must be the one the trial balance and the adjustments give.
  if (!w || w.h.given?.level !== 'net' || w.h.given.profit !== w.net) return false;
  // The liabilities side worked from the printed balances and the stated effects; the assets side, which the rows
  // take from the books, must come to the same total.
  const total = w.liab + w.own;
  return (
    q.sides[0].title === 'Liabilities' &&
    q.sides[1].title === 'Assets' &&
    q.sides.every((s) => s.rows.every((r) => !r.closing) && s.below.length === 0) &&
    fSide(q, 0) === total &&
    fSide(q, 1) === total &&
    fRowIs(q, 0, 'Capital', w.own) &&
    fRowIs(q, 1, 'Closing Stock', w.h.cs)
  );
}

// ---- the second reading: every adjustment read from its printed words alone, and each row of the statement built again ----

type FWant = [label: string, amount: number];

const F_READ_DIRECT = ['Wages A/c', 'Carriage Inwards A/c', 'Power and Fuel A/c'];
const F_READ_FIXED = ['Machinery A/c', 'Furniture A/c', 'Vehicles A/c', 'Office Equipment A/c', 'Computers A/c'];
/** An unpaid expense as its adjustment names it: the printed balance it adds to, and what follows "Outstanding" in the Balance Sheet. */
const F_READ_UNPAID: Record<string, [balance: string, owed: string]> = {
  Wages: ['Wages A/c', 'Wages'],
  Salaries: ['Salaries A/c', 'Salaries'],
  Rent: ['Rent A/c', 'Rent'],
  'Telephone charges': ['Telephone A/c', 'Telephone Charges'],
};
/** The months of the accounting year, April to March. */
const F_READ_YEAR = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
/** The months from the first day of a month to 31 March: "1 October" gives 6. */
function fMonthsLeft(date: string): number | null {
  const at = F_READ_YEAR.indexOf(date.replace(/^1 /, ''));
  return at < 0 ? null : 12 - at;
}
/** "Wages A/c" as the row of a statement names it. */
const fPlainLabel = (printed: string): string => printed.replace(/ A\/c$/, '');

/** What the printed adjustments do to the final accounts. */
interface FReadAdjs {
  /** Goods credited to Purchases A/c at cost. */
  goods: number;
  /** What is added to the row of a printed expense or income (negative: taken from it), by its printed balance. */
  change: Map<string, number>;
  /** The rows they add to the debit and to the credit side of the Profit and Loss Account. */
  debit: FWant[];
  credit: FWant[];
  /** The rows they add to the liabilities and to the assets of the Balance Sheet. */
  owed: FWant[];
  owned: FWant[];
  /** What they take off an asset, by its printed balance: depreciation, further bad debts and the new provision. */
  off: Map<string, number>;
  /** True when the debtors were dealt with: the printed bad debts and provision are then inside its one item. */
  debts: boolean;
  /** True when the data says that bad debts and the provision make one item of the Profit and Loss Account. */
  oneItem: boolean;
  /** What they add to the capital apart from the profit: interest on capital, less interest on drawings and goods taken. */
  capital: number;
  /** Capital the data says was brought in during the year, and whether an adjustment says there was none. */
  brought: number;
  noneBrought: boolean;
  commission: { rate: number; basis: string } | null;
  /** The rate of a provision for discount on debtors, and the good debtors it is reckoned on (after both other steps). */
  discount: number | null;
  good: number;
}

/**
 * The numbered adjustments of the data, each read from its words by the rule a student would apply. Null when the
 * numbers do not run from (1), when a line is not an adjustment this reading knows, or when a figure it leads to is
 * not a whole number of rupees.
 */
function fReadAdjustments(data: string, h: FHand): FReadAdjs | null {
  const texts = data.split('\n').flatMap((line) => {
    const m = /^(?:Adjustments: )?\((\d+)\) (.+)$/.exec(line);
    return m ? [{ no: Number(m[1]), text: m[2] }] : [];
  });
  if (texts.length < 2 || texts.some((t, i) => t.no !== i + 1) || !/^Closing stock is valued at ₹[\d,]+; it is not in the trial balance\.$/.test(texts[0].text)) return null;
  const r: FReadAdjs = { goods: 0, change: new Map(), debit: [], credit: [], owed: [], owned: [], off: new Map(), debts: false, oneItem: false, capital: 0, brought: 0, noneBrought: false, commission: null, discount: null, good: 0 };
  const add = (map: Map<string, number>, key: string, x: number): void => void map.set(key, (map.get(key) ?? 0) + x);
  const capital = -h.get('Capital A/c');
  const drawings = h.get('Drawings A/c');
  /** Depreciation on the printed balance of an asset, an item bought during the year for its months only. */
  const depreciate = (asset: string, rate: number, bought?: { cost: number; months: number }): boolean => {
    const title = asset.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
    const balance = h.get(`${title} A/c`);
    if (!F_READ_FIXED.includes(`${title} A/c`) || balance <= 0 || (bought && bought.cost >= balance)) return false;
    const d = ((balance - (bought?.cost ?? 0)) * rate) / 100 + (bought ? (bought.cost * rate * bought.months) / 1200 : 0);
    r.debit.push([`Depreciation on ${title}`, d]);
    add(r.off, `${title} A/c`, d);
    return true;
  };
  const prepaid = (balance: string, name: string, x: number): boolean => {
    add(r.change, balance, -x);
    r.owned.push([`Prepaid ${name}`, x]);
    return true;
  };
  const goods = (cost: string): number | null => {
    const g = parseRupees(cost);
    if (g !== null) r.goods += g;
    return g;
  };
  // Each rule: the words of an adjustment, and what it does. A rule answers false for figures it cannot use.
  const rules: [RegExp, (m: RegExpExecArray) => boolean][] = [
    [
      /^(Wages|Salaries|Rent|Telephone charges) of (₹[\d,]+) for (?:the last week of March|March) (?:is|are) still unpaid\.$/,
      (m) => {
        const x = parseRupees(m[2]);
        if (x === null) return false;
        add(r.change, F_READ_UNPAID[m[1]][0], x);
        r.owed.push([`Outstanding ${F_READ_UNPAID[m[1]][1]}`, x]);
        return true;
      },
    ],
    [
      /^Insurance includes (₹[\d,]+) paid for the next year\.$/,
      (m) => {
        const x = parseRupees(m[1]);
        return x !== null && prepaid('Insurance A/c', 'Insurance', x);
      },
    ],
    [
      // One premium for twelve months: the months that fall after 31 March are paid ahead.
      /^The insurance is one premium, paid on (1 [A-Z][a-z]+) for one year's cover from that date\.$/,
      (m) => {
        const months = fMonthsLeft(m[1]);
        return months !== null && prepaid('Insurance A/c', 'Insurance', (h.get('Insurance A/c') * (12 - months)) / 12);
      },
    ],
    [
      /^Rent includes (₹[\d,]+) paid in advance for April\.$/,
      (m) => {
        const x = parseRupees(m[1]);
        return x !== null && prepaid('Rent A/c', 'Rent', x);
      },
    ],
    [
      /^Commission of (₹[\d,]+) earned in March has not yet been received\.$/,
      (m) => {
        const x = parseRupees(m[1]);
        if (x === null) return false;
        add(r.change, 'Commission Received A/c', x);
        r.owned.push(['Accrued Commission', x]);
        return true;
      },
    ],
    [
      /^(?:(Rent) received includes (₹[\d,]+) for April|(Commission) received includes (₹[\d,]+) for work to be done next year)\.$/,
      (m) => {
        const income = `${m[1] ?? m[3]} Received`;
        const x = parseRupees(m[2] ?? m[4]);
        if (x === null) return false;
        add(r.change, `${income} A/c`, -x);
        r.owed.push([`${income} in Advance`, x]);
        return true;
      },
    ],
    [
      /^Depreciate ([a-z ]+?) at (\d+)% p\.a\. and ([a-z ]+?) at (\d+)% p\.a\. on the balances shown, for the full year; write it off the assets\.$/,
      (m) => m[1] !== m[3] && depreciate(m[1], Number(m[2])) && depreciate(m[3], Number(m[4])),
    ],
    [/^Depreciate ([a-z ]+?) at (\d+)% p\.a\. on the balance shown, for the full year; write it off the asset\.$/, (m) => depreciate(m[1], Number(m[2]))],
    [
      /^([A-Z][a-z ]+?) includes? a ([a-z]+) bought for (₹[\d,]+) on (1 [A-Z][a-z]+)\. Depreciate at (\d+)% p\.a\. on the balance shown \(the \2 from that date only\); write it off the asset\.$/,
      (m) => {
        const cost = parseRupees(m[3]);
        const months = fMonthsLeft(m[4]);
        return cost !== null && months !== null && depreciate(m[1].toLowerCase(), Number(m[5]), { cost, months });
      },
    ],
    [
      // Further bad debts first; the provision on the debtors that are left; the old provision is already in the books.
      /^Write off further bad debts of (₹[\d,]+)\. Then (maintain the|create a) provision for doubtful debts at (\d+)% of the remaining debtors\.( Show bad debts and the change in the provision as one item, Bad Debts\.)?$/,
      (m) => {
        const further = parseRupees(m[1]);
        const old = -h.get('Provision for Doubtful Debts A/c');
        if (further === null || r.debts || (m[2] === 'maintain the') !== (old > 0)) return false;
        const left = h.get('Sundry Debtors') - further;
        const provision = (left * Number(m[3])) / 100;
        r.debts = true;
        r.oneItem = Boolean(m[4]);
        r.debit.push(['Bad Debts', h.get('Bad Debts A/c') + further + provision - old]);
        add(r.off, 'Sundry Debtors', further + provision);
        r.good = left - provision;
        return left > 0;
      },
    ],
    [
      /^(?:Capital includes (₹[\d,]+) brought in on (1 [A-Z][a-z]+)\. )?Allow interest on capital at (\d+)% p\.a\.(?:(; no capital was brought in during the year\.)|(, on that amount from 1 [A-Z][a-z]+\.|: on that amount from 1 [A-Z][a-z]+, and on the rest of the capital for the full year\.))?$/,
      (m) => {
        const rate = Number(m[3]);
        let interest = (capital * rate) / 100;
        if (m[1]) {
          // The capital brought in earns interest for its months only.
          const x = parseRupees(m[1]);
          const months = fMonthsLeft(m[2]);
          if (x === null || months === null || x >= capital || ![`, on that amount from ${m[2]}.`, `: on that amount from ${m[2]}, and on the rest of the capital for the full year.`].includes(m[5])) return false;
          interest = ((capital - x) * rate) / 100 + (x * rate * months) / 1200;
          r.brought = x;
        } else if (m[5]) return false;
        r.noneBrought = Boolean(m[4]);
        r.debit.push(['Interest on Capital', interest]);
        r.capital += interest;
        return true;
      },
    ],
    [
      /^(?:The drawings were all made on (1 [A-Z][a-z]+)\. Charge interest on them at (\d+)% p\.a\. up to 31 March|The drawings were made evenly through the year\. Charge interest on them at (\d+)% p\.a\. for an average of six months)\.$/,
      (m) => {
        const months = m[1] ? fMonthsLeft(m[1]) : 6;
        if (months === null) return false;
        const interest = (drawings * Number(m[2] ?? m[3]) * months) / 1200;
        r.credit.push(['Interest on Drawings', interest]);
        r.capital -= interest;
        return true;
      },
    ],
    [
      // A provision for discount on the good debtors: reckoned once the debtors' line has been read, whatever its place.
      /^Create a provision for discount on debtors at (\d+)% of the debtors left after the provision for doubtful debts\.$/,
      (m) => {
        if (r.discount !== null) return false;
        r.discount = Number(m[1]);
        return true;
      },
    ],
    [
      /^The manager gets a commission of (\d+)% of the net profit (before|after) charging such commission, reckoned after all the other adjustments; it is unpaid\.$/,
      (m) => {
        if (r.commission) return false;
        r.commission = { rate: Number(m[1]), basis: m[2] };
        return true;
      },
    ],
    [
      // Goods that left without being sold come out of purchases at cost, whatever they would have sold for.
      /^The proprietor took goods costing (₹[\d,]+) \(selling price ₹[\d,]+\) for personal use\. No entry was made; credit Purchases A\/c\.$/,
      (m) => {
        const g = goods(m[1]);
        if (g !== null) r.capital -= g;
        return g !== null;
      },
    ],
    [/^Goods costing (₹[\d,]+) were (?:given away as free samples|given to a charitable trust)\. No entry was made; credit Purchases A\/c\.$/, (m) => goods(m[1]) !== null],
    [
      /^Goods costing (₹[\d,]+) were lost by fire; (?:they were not insured\.|the insurer admitted a claim of ₹[\d,]+, not yet received\.|the insurer admitted a claim for \d+% of their cost, not yet received\.) No entry was made; credit Purchases A\/c\.$/,
      (m) => goods(m[1]) !== null,
    ],
  ];
  for (const { text } of texts.slice(1)) {
    const hit = rules.flatMap(([words, act]) => {
      const m = words.exec(text);
      return m ? [act(m)] : [];
    });
    if (hit.length !== 1 || !hit[0]) return null;
  }
  if (r.discount !== null) {
    if (!r.debts || r.good <= 0) return null;
    const x = (r.good * r.discount) / 100;
    r.debit.push(['Provision for Discount on Debtors', x]);
    add(r.off, 'Sundry Debtors', x);
  }
  // An adjustment changes a balance the trial balance prints, and every figure is a whole number of rupees.
  if ([...r.change.keys(), ...r.off.keys()].some((label) => h.get(label) === 0)) return null;
  const figures = [r.goods, r.capital, ...r.change.values(), ...r.off.values(), ...[...r.debit, ...r.credit, ...r.owed, ...r.owned].map((w) => w[1])];
  return isWhole(...figures) ? r : null;
}

/** True when a side holds exactly the rows wanted, each once at its amount, with the row named as its closing row and no other. */
function fSideIs(side: AccountQuestion['sides'][number], want: FWant[], closing?: string): boolean {
  return (
    side.below.length === 0 &&
    side.rows.length === want.length &&
    new Set(want.map((w) => w[0])).size === want.length &&
    want.every(([label, a]) => a > 0 && isWhole(a) && side.rows.filter((row) => row.label === label && row.amounts.length === 1 && row.amounts[0] === a && Boolean(row.closing) === (label === closing)).length === 1)
  );
}

/** The final accounts worked from the printed data alone: the rows of each statement, and the two profits. */
function fByHand(data: string) {
  const h = fRead(data);
  const r = h && fReadAdjustments(data, h);
  if (!h || !r) return null;
  const now = (label: string): number => Math.abs(h.get(label)) + (r.change.get(label) ?? 0);
  const total = (want: FWant[]): number => sum(want.map((w) => w[1]));
  // The Trading Account: goods credited to Purchases A/c come out of purchases, an unpaid direct expense is added to it.
  const cost: FWant[] = [
    ['Opening Stock', h.get('Opening Stock')],
    ['Purchases', h.get('Purchases A/c') + h.get('Purchases Return A/c') - r.goods],
    ...F_READ_DIRECT.filter((l) => h.get(l) !== 0).map((l): FWant => [fPlainLabel(l), now(l)]),
  ];
  const sales: FWant[] = [['Sales', h.netSales], ['Closing Stock', h.cs]];
  const gross = total(sales) - total(cost);
  // The Profit and Loss Account: every other expense and income at its adjusted figure, and the rows the adjustments add.
  const nominal = h.labels.filter((l) => !F_READ_ELSEWHERE.has(l));
  const debit: FWant[] = [...nominal.filter((l) => h.get(l) > 0 && !(r.debts && l === 'Bad Debts A/c')).map((l): FWant => [fPlainLabel(l), now(l)]), ...r.debit];
  const credit: FWant[] = [[F_GP_BD, gross], ...nominal.filter((l) => h.get(l) < 0).map((l): FWant => [fPlainLabel(l), now(l)]), ...r.credit];
  // The manager's commission is reckoned last, on the profit that every other item leaves.
  const before = total(credit) - total(debit);
  const commission = r.commission ? (r.commission.basis === 'after' ? (before * r.commission.rate) / (100 + r.commission.rate) : (before * r.commission.rate) / 100) : 0;
  if (r.commission) debit.push(["Manager's Commission", commission]);
  const net = before - commission;
  // The Balance Sheet: each asset less what was written off it, what is owed and owned on the last day, and the capital.
  const worth = (label: string): number => h.get(label) - (r.off.get(label) ?? 0);
  const assets: FWant[] = [
    ...F_READ_FIXED.filter((l) => h.get(l) !== 0).map((l): FWant => [fPlainLabel(l), worth(l)]),
    ['Closing Stock', h.cs],
    ...(h.get('Sundry Debtors') ? [['Sundry Debtors', r.debts ? worth('Sundry Debtors') : h.get('Sundry Debtors') + h.get('Provision for Doubtful Debts A/c')] as FWant] : []),
    ...r.owned,
    ['Cash at Bank', h.get('Bank A/c')],
    ...(h.get('Cash A/c') ? [['Cash in Hand', h.get('Cash A/c')] as FWant] : []),
  ];
  const liabilities: FWant[] = [
    ['Capital', -h.get('Capital A/c') + r.capital + net - h.get('Drawings A/c')],
    ...(h.get('Sundry Creditors') ? [['Sundry Creditors', -h.get('Sundry Creditors')] as FWant] : []),
    ...r.owed,
  ];
  return { h, r, cost, sales, gross, debit, credit, net, assets, liabilities, total };
}

/**
 * Every row of the statement, built again from the printed trial balance and the printed adjustments: the same
 * particulars at the same amounts, nothing more and nothing less, and the closing row where it belongs.
 */
function fRowsHold(q: AccountQuestion, statement: 'trading' | 'profitAndLoss' | 'balanceSheet'): boolean {
  const w = fByHand(q.data);
  if (!w || w.gross <= 0 || !isWhole(w.gross)) return false;
  if (statement === 'trading') return fSideIs(q.sides[0], [...w.cost, [F_GP_CD, w.gross]], F_GP_CD) && fSideIs(q.sides[1], w.sales);
  // Beyond the Trading Account this reading does not follow goods that were given away or lost, nor a commission
  // into the Balance Sheet: no format asks for them there.
  if (w.r.goods !== 0 || w.net <= 0 || !isWhole(w.net)) return false;
  if (statement === 'profitAndLoss') {
    // The data gives the gross profit, says how bad debts and the provision are shown, and settles what the
    // interest on capital is reckoned on.
    const settled = w.r.brought > 0 || w.r.noneBrought || !w.r.debit.some(([label]) => label === 'Interest on Capital');
    return (
      w.h.given?.level === 'gross' &&
      w.h.given.profit === w.gross &&
      (!w.r.debts || w.r.oneItem) &&
      settled &&
      fSideIs(q.sides[0], [...w.debit, [F_NET_PROFIT, w.net]], F_NET_PROFIT) &&
      fSideIs(q.sides[1], w.credit)
    );
  }
  return (
    w.h.given?.level === 'net' &&
    w.h.given.profit === w.net &&
    !w.r.commission &&
    w.r.brought === 0 &&
    /No capital was brought in during the year\./.test(q.data) &&
    w.h.get('Bank A/c') > 0 &&
    w.total(w.assets) === w.total(w.liabilities) &&
    q.sides[0].title === 'Liabilities' &&
    q.sides[1].title === 'Assets' &&
    fSideIs(q.sides[0], w.liabilities) &&
    fSideIs(q.sides[1], w.assets)
  );
}

// ---- the four formats ----

/** A profit taken to the nearest thousand rupees, so that the trial balance it leads to is in round figures. */
const fRound = (p: number): number => Math.round(p / rupees(1000)) * rupees(1000);
/** What a list of adjustments does to the net profit. */
const fNet = (adjs: readonly FAdj[]): number => sum(adjs.map((a) => a.gp + a.inc - a.exp));

/** An expense still unpaid or paid ahead, or both: the heads it touches, their balances and the adjustments. */
interface FCarried {
  salaries: number;
  rent: number;
  insurance: number;
  telephone: number;
  wages: number;
  /** True when the trial balance must carry rent: an adjustment is about it. */
  rentUsed: boolean;
  /** The heads the adjustments are about: "salaries", "insurance". */
  touched: string[];
  adjs: FAdj[];
}

/**
 * The expenses carried into the next year. `kinds` says whether one is unpaid ('out'), one is paid ahead ('pre') or
 * both; `outHeads` are the expenses that may be the unpaid one. A prepaid amount is given, or is to be worked out from
 * a premium that covers twelve months, or is a month of rent paid ahead (never rent that is also unpaid for March).
 */
function fDrawCarried(rng: Rng, kinds: string[], outHeads: readonly ('salaries' | 'rent' | 'telephone' | 'wages')[]): FCarried {
  const monthlySalary = amount(rng, 4000, 9000, 500);
  const monthlyRent = amount(rng, 2000, 6000, 500);
  const c: FCarried = { salaries: monthlySalary * 12, rent: monthlyRent * 12, insurance: fDraw(rng, F_INSURANCE), telephone: 0, wages: fDraw(rng, F_WAGES), rentUsed: false, touched: [], adjs: [] };
  const outHead = rng.pick(outHeads);
  if (kinds.includes('out')) {
    c.touched.push(outHead);
    if (outHead === 'salaries') {
      c.salaries = monthlySalary * 11;
      c.adjs.push(fOutstanding(F_SALARIES, monthlySalary, c.salaries, 'for March'));
    } else if (outHead === 'rent') {
      c.rent = monthlyRent * 11;
      c.rentUsed = true;
      c.adjs.push(fOutstanding(F_RENT, monthlyRent, c.rent, 'for March'));
    } else if (outHead === 'telephone') {
      c.telephone = fDraw(rng, F_TELEPHONE);
      c.adjs.push(fOutstanding(F_TELEPHONE, amount(rng, 1000, 3000, 500), c.telephone, 'for March'));
    } else {
      c.adjs.push(fOutstanding(F_WAGES, amount(rng, 2000, 6000, 500), c.wages, 'for the last week of March'));
    }
  }
  const preKind = rng.pick(c.rentUsed ? (['amount', 'policy'] as const) : (['amount', 'policy', 'rent'] as const));
  if (kinds.includes('pre')) {
    c.touched.push(preKind === 'rent' ? 'rent' : 'insurance');
    if (preKind === 'amount') {
      const x = amount(rng, 2000, 6000, 500);
      c.adjs.push(fPrepaid(F_INSURANCE, x, c.insurance, `Insurance includes ${inr(x)} paid for the next year.`));
    } else if (preKind === 'policy') {
      const when = rng.pick(F_PART_YEAR);
      c.insurance = 12 * amount(rng, 1000, 3000, 500);
      const x = (c.insurance * (12 - when.months)) / 12;
      c.adjs.push(
        fPrepaid(
          F_INSURANCE,
          x,
          c.insurance,
          `The insurance is one premium, paid on ${when.date} for one year's cover from that date.`,
          `The premium covers 12 months, of which ${12 - when.months} fall after 31 March: ${inr(c.insurance)} × ${12 - when.months}/12 = ${inr(x)}.`,
        ),
      );
    } else {
      c.rent = monthlyRent * 13;
      c.rentUsed = true;
      c.adjs.push(fPrepaid(F_RENT, monthlyRent, c.rent, `Rent includes ${inr(monthlyRent)} paid in advance for April.`));
    }
  }
  return c;
}

// faa-fmt-trading: the Trading Account with the adjustments that touch it: unpaid wages, and goods taken by the
// proprietor, given away or lost by fire, credited to Purchases at cost (medium)
const faaFmtTrading = accountTemplate({
  id: 'faa-fmt-trading',
  topicId: T,
  conceptId: C_FMT,
  difficulty: 'medium',
  generate: (rng) =>
    fTry(10, () => {
      const firm = rng.pick(FIRMS);
      // Two or three adjustments: one or two lots of goods, the unpaid wages, and sometimes unpaid salaries, which
      // are no part of this account.
      const shape = rng.pick([
        { goods: 1, wages: true, salaries: false },
        { goods: 2, wages: false, salaries: false },
        { goods: 2, wages: true, salaries: false },
        { goods: 1, wages: true, salaries: true },
        { goods: 2, wages: false, salaries: true },
      ]);
      const kinds = rng
        .shuffle(['drawn', 'drawn', 'fire', 'fire', 'samples', 'charity'] as const)
        .filter((k, i, all) => all.indexOf(k) === i)
        .slice(0, shape.goods);
      const costs = new Set<number>();
      const goods = kinds.map((k): FAdj => {
        if (k === 'drawn') {
          const g = amount(rng, 4000, 20000, 1000);
          costs.add(g);
          return fGoodsDrawn(g, pc(g, rng.pick([120, 125, 140, 150])));
        }
        if (k === 'fire') {
          const g = amount(rng, 20000, 60000, 5000);
          costs.add(g);
          const share = rng.pick([50, 60, 75, 80]);
          const cover = rng.pick(['none', 'amount', 'share'] as const);
          const claim = cover === 'none' ? 0 : pc(g, share);
          return fGoodsBurnt(
            g,
            claim,
            cover === 'none' ? 'they were not insured.' : cover === 'amount' ? `the insurer admitted a claim of ${inr(claim)}, not yet received.` : `the insurer admitted a claim for ${share}% of their cost, not yet received.`,
          );
        }
        const g = amount(rng, 2000, 12000, 1000);
        costs.add(g);
        return fGoodsGiven(g, k);
      });
      // Two lots of goods at the same cost could not be told apart in the working.
      if (costs.size < kinds.length) return null;
      // The direct expenses: wages whenever some are unpaid, and otherwise any one or two of the three.
      const others = rng.shuffle([F_CARRIAGE_IN, F_POWER]);
      const heads = shape.wages ? [F_WAGES, ...others.slice(0, rng.pick([0, 1, 1]))] : rng.shuffle([F_WAGES, ...others]).slice(0, rng.pick([1, 2]));
      const directs = heads.map((h): FBal => [h.id, fDraw(rng, h)]);
      const monthlySalary = amount(rng, 4000, 9000, 500);
      const salaries = monthlySalary * (shape.salaries ? 11 : 12);
      const adjs = rng.shuffle([
        ...goods,
        ...(shape.wages ? [fOutstanding(F_WAGES, amount(rng, 2000, 6000, 500), directs[0][1], 'for the last week of March')] : []),
        ...(shape.salaries ? [fOutstanding(F_SALARIES, monthlySalary, salaries, 'for March')] : []),
      ]);
      // Carriage outwards beside carriage inwards: the pair students mix up.
      const second = heads.includes(F_CARRIAGE_IN) ? F_CARRIAGE_OUT : rng.pick([F_RENT, F_ADVERTISEMENT, F_STATIONERY]);
      const returns = rng.pick(['none', 'purchases', 'sales', 'both'] as const);
      const t = fTb(rng, {
        fixed: [[rng.pick(F_ASSETS).id, amount(rng, 100000, 300000, 20000)]],
        directs,
        indirect: [[F_SALARIES.id, salaries], [second.id, fDraw(rng, second)]],
        ...(returns === 'purchases' || returns === 'both' ? { purchasesReturn: amount(rng, 4000, 20000, 1000) } : {}),
        ...(returns === 'sales' || returns === 'both' ? { salesReturn: amount(rng, 4000, 20000, 1000) } : {}),
        creditors: false,
        drawings: amount(rng, 24000, 60000, 6000),
        profit: amount(rng, 60000, 140000, 1000),
      });
      const c = t && fCase(rng, firm, t, adjs);
      return c ? fTradingParts(c) : null;
    }),
  verify: (q) => fTradingHolds(q) && fRowsHold(q, 'trading'),
});

// faa-fmt-pl-accruals: the Profit and Loss Account, the gross profit given, with an unpaid or a prepaid expense (or
// both), an income accrued or received in advance (or both) and depreciation (medium)
// Version 2: its second hint no longer names interest on drawings, which is beyond the Class 11 syllabus.
const faaFmtPlAccruals = accountTemplate({
  id: 'faa-fmt-pl-accruals',
  version: 2,
  topicId: T,
  conceptId: C_FMT,
  difficulty: 'medium',
  generate: (rng) =>
    fTry(10, () => {
      const firm = rng.pick(FIRMS);
      const expenseKinds = rng.pick([['out'], ['pre'], ['out', 'pre'], ['out', 'pre']]);
      const incomeKinds = expenseKinds.length === 2 ? rng.pick([['acc'], ['adv']]) : rng.pick([['acc'], ['adv'], ['acc', 'adv']]);
      const carried = fDrawCarried(rng, expenseKinds, ['salaries', 'rent', 'telephone']);

      const incomes: FBal[] = [];
      const earned: FAdj[] = [];
      if (incomeKinds.includes('acc')) {
        const recd = fDraw(rng, F_COMMISSION);
        const x = amount(rng, 1000, 4000, 500);
        incomes.push([F_COMMISSION.id, recd]);
        earned.push(fAccrued(F_COMMISSION, x, recd, `Commission of ${inr(x)} earned in March has not yet been received.`));
      }
      if (incomeKinds.includes('adv')) {
        // Commission is not both still to come and received ahead in one question.
        if (incomeKinds.includes('acc') || rng.next() < 0.6) {
          const sublet = amount(rng, 1000, 3000, 500);
          incomes.push([F_RENT_RECEIVED.id, sublet * 13]);
          earned.push(fAdvance(F_RENT_RECEIVED, sublet, sublet * 13, `Rent received includes ${inr(sublet)} for April.`));
        } else {
          const recd = fDraw(rng, F_COMMISSION);
          const x = amount(rng, 1000, 4000, 500);
          incomes.push([F_COMMISSION.id, recd]);
          earned.push(fAdvance(F_COMMISSION, x, recd, `Commission received includes ${inr(x)} for work to be done next year.`));
        }
      }
      // Depreciation on one asset, or on two (in one line of the data) when the list of adjustments is short.
      const assets = fDrawFixed(rng, carried.adjs.length + earned.length <= 2 && rng.next() < 0.5 ? 2 : 1, 0.4);
      // Each block keeps its order; the blocks come in an order drawn from the seed.
      const adjs = rng.shuffle([...carried.adjs.map((a) => [a]), ...earned.map((a) => [a]), assets.adjs]).flat();
      const t = fTb(rng, {
        fixed: assets.fixed,
        directs: [[F_WAGES.id, carried.wages]],
        indirect: [
          [F_SALARIES.id, carried.salaries],
          [F_INSURANCE.id, carried.insurance],
          ...(carried.rentUsed || rng.next() < 0.5 ? [[F_RENT.id, carried.rent] as FBal] : []),
          ...(carried.telephone ? [[F_TELEPHONE.id, carried.telephone] as FBal] : []),
        ],
        incomes,
        creditors: false,
        drawings: amount(rng, 24000, 60000, 6000),
        // The net profit wanted after the adjustments, less what they do to it, in a round figure.
        profit: fRound(amount(rng, 60000, 140000, 1000) - fNet(adjs)),
      });
      const c = t && fCase(rng, firm, t, adjs);
      return c ? fProfitAndLossParts(c) : null;
    }),
  verify: (q) => fProfitAndLossHolds(q) && fRowsHold(q, 'profitAndLoss'),
});

// faa-fmt-pl-provisions: the Profit and Loss Account, the gross profit given, with further bad debts and the
// provision for doubtful debts as one net charge, a provision for discount on the good debtors, interest on capital
// and, in most seeds, the commission of the manager on the profit before or after charging it (complex). Version 2:
// the provision for discount takes the place of interest on drawings, which is beyond the Class 11 syllabus, and the
// interest on capital brought in during the year says that the rest of the capital earns it for the full year.
const F_PL_HINTS = [
  'Work the debtors first: further bad debts off the debtors, then the provision for doubtful debts on what is left, then the provision for discount on what is left after that. Leave the manager\'s commission to the very end.',
  'Bad debts in the trial balance + further bad debts + new provision − old provision is one charge, "Bad Debts". The provision for discount and interest on capital are rows of their own. The commission is worked on the profit every other row leaves: rate/100 before charging it, rate/(100 + rate) after.',
];
const faaFmtPlProvisions = accountTemplate({
  id: 'faa-fmt-pl-provisions',
  version: 2,
  topicId: T,
  conceptId: C_FMT,
  difficulty: 'complex',
  generate: (rng) =>
    fTry(10, () => {
      const firm = rng.pick(FIRMS);
      const debts = fDrawDebts(rng, true, true);
      if (!debts) return null;
      const drawn = { drawings: amount(rng, 24000, 60000, 6000), adj: fDiscount(debts, rng.pick([1, 2, 2, 3])) };
      // The fourth adjustment: the manager's commission, or depreciation, or unpaid salaries.
      const extra = rng.pick(['commission', 'commission', 'commission', 'depreciation', 'outstanding'] as const);
      const monthlySalary = amount(rng, 4000, 9000, 500);
      const salaries = monthlySalary * (extra === 'outstanding' ? 11 : 12);
      const dep = fDrawDepreciation(rng, rng.pick(F_ASSETS), false);
      const known = [debts.adj, drawn.adj, ...(extra === 'depreciation' ? [dep.adj] : extra === 'outstanding' ? [fOutstanding(F_SALARIES, monthlySalary, salaries, 'for March')] : [])];
      // With both bad debts and a provision in the trial balance, one expense fewer keeps the list short.
      const crowded = debts.tbBad > 0 && debts.old > 0;
      const plain = rng.shuffle([F_RENT, F_INSURANCE, F_ADVERTISEMENT, F_CARRIAGE_OUT, F_TELEPHONE]).slice(0, crowded ? 1 : rng.pick([1, 2]));
      const income = rng.next() < 0.5 ? [rng.pick([F_DISCOUNT_RECEIVED, F_INTEREST, F_COMMISSION])] : [];
      const direct = rng.pick([F_WAGES, F_CARRIAGE_IN]);
      // The net profit wanted before interest on capital and the commission, less what the other adjustments do to it.
      const profit = fRound(amount(rng, 80000, 160000, 1000) - fNet(known));
      const t = fTb(rng, {
        fixed: [[dep.asset, dep.balance]],
        directs: [[direct.id, fDraw(rng, direct)]],
        indirect: [[F_SALARIES.id, salaries], ...plain.map((h): FBal => [h.id, fDraw(rng, h)])],
        incomes: income.map((h): FBal => [h.id, fDraw(rng, h)]),
        badDebts: debts.tbBad,
        debtors: debts.good + debts.further,
        provision: debts.old,
        creditors: false,
        drawings: drawn.drawings,
        profit,
      });
      if (!t) return null;
      const rate = rng.pick([5, 6, 8, 10]);
      // Capital brought in during the year, when the capital is large enough to have had some from the start and the
      // interest on it for its months is a round figure.
      const quarters = F_QUARTERS.filter((w) => ((rupees(100000) * rate * w.months) / 1200) % rupees(500) === 0);
      const brought = rng.next() < 0.3 && t.capital >= rupees(300000) && quarters.length > 0 ? { amount: rupees(100000), ...rng.pick(quarters) } : undefined;
      const ioc = fInterestOnCapital(rate, t.capital, brought, true, true);
      // The provision for discount stays next to the debtors' line it follows.
      const adjs = rng.shuffle([[debts.adj, drawn.adj], ...known.slice(2).map((a) => [a]), [ioc]]).flat();
      // The net profit before the commission, with every other adjustment made.
      let p = profit + fNet(adjs);
      if (extra === 'commission') {
        const basis = rng.pick<FBasis>(['before', 'after']);
        const share = basis === 'before' ? rng.pick([5, 8, 10]) : rng.pick([5, 10, 20, 25]);
        // That profit is brought to a figure on which the commission is a whole number of thousands (on the profit
        // after it) or of rupees: sales and the bank balance move together, so the trial balance still agrees.
        const unit = basis === 'before' ? rupees(1000) : rupees(((100 + share) * 1000) / share);
        const over = p % unit;
        const shift = over === 0 ? 0 : t.bank - over >= rupees(10000) ? -over : unit - over;
        t.sales += shift;
        t.bank += shift;
        p += shift;
        // Always the last adjustment: it is reckoned after all the others.
        adjs.push(fCommission(share, basis, p));
      }
      if (p < rupees(40000)) return null;
      const c = fCase(rng, firm, t, adjs);
      if (!c) return null;
      // The profit the commission was worked on must be the one the books give before it.
      if (fFigures(c.books, c.cs).net + (c.books.get('commissionPaid') ?? 0) !== p) throw new Error('final accounts format: the profit before the commission is not the one the books give');
      return fProfitAndLossParts(c, F_PL_HINTS);
    }),
  verify: (q) => fProfitAndLossHolds(q) && fRowsHold(q, 'profitAndLoss'),
});

// faa-fmt-balance-sheet: the Balance Sheet after the adjustments, the net profit given: fixed assets less
// depreciation, debtors less further bad debts, the provision for doubtful debts and (in some seeds) a provision for
// discount, amounts owed and paid ahead, and the capital with the interest on capital (complex). Version 2: the
// provision for discount takes the place of interest on drawings, which is beyond the Class 11 syllabus.
const faaFmtBalanceSheet = accountTemplate({
  id: 'faa-fmt-balance-sheet',
  version: 2,
  topicId: T,
  conceptId: C_FMT,
  difficulty: 'complex',
  generate: (rng) =>
    fTry(10, () => {
      const firm = rng.pick(FIRMS);
      const two = rng.next() < 0.45;
      // Bad debts already written off are one more line of the trial balance: only when there is one fixed asset.
      const debts = fDrawDebts(rng, !two && rng.next() < 0.5, false);
      if (!debts) return null;
      const assets = fDrawFixed(rng, two ? 2 : 1, 0.4);
      // Five lines of adjustments beside the closing stock at the most: when an expense is unpaid and another paid
      // ahead, there is interest on capital or a provision for discount, not both.
      const kinds = rng.pick([['out'], ['pre'], ['out', 'pre'], ['out', 'pre']]);
      const interest = kinds.length === 2 ? rng.pick([['ioc'], ['disc']]) : rng.pick([['ioc'], ['disc'], ['ioc', 'disc'], ['ioc', 'disc']]);
      const carried = fDrawCarried(rng, kinds, ['salaries', 'salaries', 'wages', 'rent']);
      const drawn = { drawings: amount(rng, 24000, 60000, 6000), adj: fDiscount(debts, rng.pick([1, 2, 2, 3])) };
      const known = [assets.adjs, interest.includes('disc') ? [debts.adj, drawn.adj] : [debts.adj], ...carried.adjs.map((a) => [a])];
      const profit = fRound(amount(rng, 80000, 160000, 1000) - fNet(known.flat()));
      // Of the expenses, the trial balance lists salaries (the expense every business has, and one to leave out of
      // a Balance Sheet) and those the adjustments are about: any other would be a line to read and then leave out.
      const about = (id: string): boolean => carried.touched.includes(id);
      const t = fTb(rng, {
        fixed: assets.fixed,
        directs: about('wages') ? [[F_WAGES.id, carried.wages]] : [],
        indirect: [
          [F_SALARIES.id, carried.salaries],
          ...(about('insurance') ? [[F_INSURANCE.id, carried.insurance] as FBal] : []),
          ...(about('rent') ? [[F_RENT.id, carried.rent] as FBal] : []),
        ],
        badDebts: debts.tbBad,
        debtors: debts.good + debts.further,
        provision: debts.old,
        drawings: drawn.drawings,
        // Cash in hand is one more asset, where the trial balance is not already at its longest.
        ...(!carried.rentUsed && !(kinds.length === 2 && (two || debts.tbBad > 0)) && rng.next() < 0.5 ? { cash: amount(rng, 4000, 20000, 1000) } : {}),
        profit,
      });
      if (!t) return null;
      // The data says once, at its end, that no capital was brought in.
      const blocks = [...known, ...(interest.includes('ioc') ? [[fInterestOnCapital(rng.pick([5, 6, 8, 10]), t.capital, undefined, false, true)]] : [])];
      const c = fCase(rng, firm, t, rng.shuffle(blocks).flat());
      return c ? fBalanceSheetParts(c, rng.pick<FMarshal>(['liquidity', 'permanence'])) : null;
    }),
  verify: (q) => fBalanceSheetHolds(q) && fRowsHold(q, 'balanceSheet'),
});

const formats: Template[] = [faaFmtTrading, faaFmtPlAccruals, faaFmtPlProvisions, faaFmtBalanceSheet];

/** An adjustment of a format, a balance, its books and its trial balance, a row a reading expects, and the basis of a commission. */
export type FaaAdj = FAdj;
export type FaaBal = FBal;
export type FaaBooks = FCase;
export type FaaTb = FTb;
export type FaaWant = FWant;
export type FaaBasis = FBasis;

/**
 * What the formats above are made of, for the cases that chain the three statements on one trial balance with its
 * adjustments (`case-fa-chain-...` in `cases/final-accounts.ts`): the adjustments with their wording, entries and
 * the working they put under a row; the trial balance; the row of an account after the adjustments; and the two
 * readings of the printed data. Nothing here is changed by being listed: the formats make what they made.
 */
export const FAA_CHAIN = {
  firms: FIRMS,
  date: F_DATE,
  debtors: F_DEBTORS,
  creditors: F_CREDITORS,
  provision: F_PROVISION,
  labels: { gpCd: F_GP_CD, gpBd: F_GP_BD, netProfit: F_NET_PROFIT, netLoss: F_NET_LOSS },
  heads: {
    wages: F_WAGES,
    carriageIn: F_CARRIAGE_IN,
    power: F_POWER,
    salaries: F_SALARIES,
    rent: F_RENT,
    insurance: F_INSURANCE,
    telephone: F_TELEPHONE,
    advertisement: F_ADVERTISEMENT,
    carriageOut: F_CARRIAGE_OUT,
    stationery: F_STATIONERY,
    commission: F_COMMISSION,
    rentReceived: F_RENT_RECEIVED,
    discountReceived: F_DISCOUNT_RECEIVED,
    interest: F_INTEREST,
  },
  assets: F_ASSETS,
  // The adjustments, and the draws that give them figures that come out whole.
  outstanding: fOutstanding,
  prepaid: fPrepaid,
  accrued: fAccrued,
  advance: fAdvance,
  interestOnCapital: fInterestOnCapital,
  commission: fCommission,
  goodsDrawn: fGoodsDrawn,
  goodsGiven: fGoodsGiven,
  goodsBurnt: fGoodsBurnt,
  drawDebts: fDrawDebts,
  drawFixed: fDrawFixed,
  drawDrawings: fDrawDrawings,
  drawCarried: fDrawCarried,
  draw: fDraw,
  // The trial balance, what an entry does to the final accounts, and the figures of a set of books.
  tb: fTb,
  effect: fEffect,
  figures: fFigures,
  round: fRound,
  net: fNet,
  attempt: fTry,
  // The printed data and the rows.
  data: fData,
  no: fNo,
  row: fRow,
  name: fName,
  list: fList,
  added: fAdded,
  lower: fLower,
  plain: fPlain,
  // The readings of the printed data: the trial balance, each adjustment from its words, and a side against its rows.
  read: fRead,
  readAdjustments: fReadAdjustments,
  sideIs: fSideIs,
  readDirect: F_READ_DIRECT,
  readFixed: F_READ_FIXED,
  readElsewhere: F_READ_ELSEWHERE,
  plainLabel: fPlainLabel,
};

// Goods given to the staff come last: they were added after the check against the CBSE 2025-26 syllabus.
// ---------------------------------------------------------------------------------------------------------------
// Added by the quality pass, after the mock papers were set (each id is in `outsidePapers.ts`, so no paper, worksheet
// or Look back level draws on it): the provision for discount on debtors as an entry and as a set of adjusting
// entries, and a loss of goods by fire the way the NCERT book records it, through the Trading Account.
// ---------------------------------------------------------------------------------------------------------------

const H_DISCOUNT_ENTRY = [
  'Which debtors will take a discount for paying early? Take the bad debts and the doubtful debts off first.',
  'Good debtors = debtors − further bad debts − provision for doubtful debts; the provision for discount is the rate on them: Profit and Loss A/c Dr; To Provision for Discount on Debtors A/c.',
];

// faa-entry-discount-provision: the entry for a new provision for discount on the good debtors (medium)
const entryDiscountProvision = journalTemplate({
  id: 'faa-entry-discount-provision',
  topicId: T,
  conceptId: C_BAD,
  difficulty: 'medium',
  computed: true,
  generate: (rng) => {
    const firm = rng.pick(FIRMS);
    const further = amount(rng, 2000, 15000, 1000);
    const debtors = amount(rng, 100000, 500000, 10000) + further;
    const r = rng.pick([5, 10]);
    const left = debtors - further, doubtful = pc(left, r), good = left - doubtful;
    const fits = [2, 2, 1, 3].filter((k) => pc(good, k) % rupees(10) === 0);
    if (fits.length === 0) return null;
    const p = rng.pick(fits), d = pc(good, p);
    return {
      prompt: `The sundry debtors of ${firm} are ${inr(debtors)} on 31 March, before the adjustments. Further bad debts of ${inr(further)} are to be written off, a provision for doubtful debts of ${r}% is to be made on the debtors that remain, and then a provision for discount on debtors at ${p}% on the good debtors. There was no provision for discount before. Pass the entry for the provision for discount.`,
      lines: [dr('profitAndLoss', d), cr('provisionForDiscountOnDebtors', d)],
      explanation: [
        `Debtors after the further bad debts = ${inr(debtors)} − ${inr(further)} = ${inr(left)}.`,
        `Provision for doubtful debts = ${inr(left)} × ${r}% = ${inr(doubtful)}; good debtors = ${inr(left)} − ${inr(doubtful)} = ${inr(good)}.`,
        `Provision for discount = ${inr(good)} × ${p}% = ${inr(d)}.`,
        'It is a charge against the profit of the year: Profit and Loss A/c is debited.',
        'It is kept against the debtors and deducted from them in the balance sheet: Provision for Discount on Debtors A/c is credited.',
      ],
      hints: H_DISCOUNT_ENTRY,
      distractorAccounts: ['discountAllowed', 'discountReceived', 'provisionForDoubtfulDebts'],
    };
  },
});

const H_FIRE_TRADING = [
  'The NCERT way takes the goods lost out of the Trading Account at cost, and then shares the loss between the insurer and the Profit and Loss Account.',
  'First: Loss by Fire A/c Dr; To Trading A/c (the cost). Then: Insurance Claim A/c Dr (the claim admitted) and Profit and Loss A/c Dr (the rest); To Loss by Fire A/c.',
];

// faa-entry-fire-trading: a loss of stock by fire the way the NCERT book records it: the cost credited to Trading A/c,
// then the loss closed to the insurer's claim and to Profit and Loss A/c. Either entry is asked (medium).
const entryFireTrading = journalTemplate({
  id: 'faa-entry-fire-trading',
  topicId: T,
  conceptId: C_GDS,
  difficulty: 'medium',
  generate: (rng) => {
    const firm = rng.pick(FIRMS);
    const x = amount(rng, 20000, 150000, 5000);
    const pct = rng.pick([0, 50, 60, 75, 80]);
    const claim = pc(x, pct);
    if (!isWhole(claim)) return null;
    const ask = rng.pick(['first', 'second', 'second'] as const);
    const cover = pct ? `The insurance company has admitted a claim for ${pct}% of the cost.` : 'The goods were not insured.';
    const lead = `On 20 March a fire destroyed stock of ${firm} that had cost ${inr(x)}. ${cover} The firm records the loss as the NCERT book does: the cost of the goods lost is credited to Trading A/c, and Loss by Fire A/c is then closed.`;
    if (ask === 'first') {
      return {
        prompt: `${lead} Pass the first entry, which takes the goods lost out of the Trading Account.`,
        lines: [dr('lossByFire', x), cr('trading', x)],
        explanation: [
          `The goods lost cost ${inr(x)}; a loss of goods is always taken at cost.`,
          'The loss is collected in an account of its own: Loss by Fire A/c is debited.',
          'The goods will not be sold, so they come out of the cost of goods in the Trading Account, which shows "By Loss by Fire": Trading A/c is credited.',
        ],
        hints: H_FIRE_TRADING,
        distractorAccounts: ['purchases', 'stock', 'insuranceClaimReceivable', 'profitAndLoss'],
      };
    }
    const rest = x - claim;
    return {
      prompt: `${lead} Loss by Fire A/c has already been debited with the cost. Pass the entry that closes Loss by Fire A/c.`,
      lines: [...(claim ? [dr('insuranceClaimReceivable', claim)] : []), dr('profitAndLoss', rest), cr('lossByFire', x)],
      explanation: [
        ...(claim ? [`Claim admitted = ${inr(x)} × ${pct}% = ${inr(claim)}: it is due from the insurer, an asset: the insurance claim account is debited.`] : ['There is no claim: the whole loss is borne by the business.']),
        `The part not covered, ${inr(x)}${claim ? ` − ${inr(claim)}` : ''} = ${inr(rest)}, is an abnormal loss: Profit and Loss A/c is debited.`,
        `Loss by Fire A/c is closed by crediting it with the whole ${inr(x)}.`,
      ],
      hints: H_FIRE_TRADING,
      distractorAccounts: ['purchases', 'trading', 'stock'],
    };
  },
});

// faa-set-debtors-commission: a year end of the debtors and the manager: amounts carried forward, depreciation, a bad
// debt, both provisions on the debtors, and the commission last (complex, six to eight entries)
const setDebtorsCommission = adjustingSet('faa-set-debtors-commission', 'complex', (rng, firm) => {
  const carried = setCarried(rng, rng.shuffle<CarriedKind>(['outstanding', 'prepaid', 'accrued', 'advance']).slice(0, rng.pick([1, 2])));
  const method = rng.pick<DepMethod>(['direct', 'provision']);
  // The debtors and their two provisions, drawn again until both provisions come out in round figures.
  const ledger = fTry(8, () => {
    const debtors = setDebtors(rng, 1, firm);
    if (!debtors) return null;
    const [bad, doubtful] = debtors;
    const balance = doubtful.balances?.find(([label]) => label === SET_DEBTORS)?.[1];
    const discount = balance === undefined ? null : setDiscountProvision(rng, balance, [bad.lines[0].amount], doubtful.lines[0].amount);
    return discount && [...debtors, discount];
  });
  const commission = setCommission(rng);
  if (!carried || !ledger || !commission) return null;
  return [...interleave(rng, [rng.shuffle([...carried, ...setDepreciations(rng, 1, method)]), ledger]), commission];
});

/** The rows of a Trading Account that shows a loss of goods by fire as the NCERT book does, kept for `verify`. */
interface FireTrading {
  os: number;
  purchases: number;
  directs: [string, number][];
  sales: number;
  cs: number;
  lost: number;
}
const fireKept = keepFor<FireTrading>();

// faa-fmt-trading-fire: the Trading Account with goods lost by fire credited to it at cost ("By Loss by Fire"), as the
// NCERT book sets it out; purchases stay at the trial balance figure (medium)
const fmtTradingFire = accountTemplate({
  id: 'faa-fmt-trading-fire',
  topicId: T,
  conceptId: C_FMT,
  difficulty: 'medium',
  generate: (rng) => {
    const firm = rng.pick(FIRMS);
    const purchases = amount(rng, 300000, 900000, 10000);
    const os = amount(rng, 40000, 150000, 5000);
    const lost = amount(rng, 20000, 90000, 5000);
    const pct = rng.pick([0, 50, 60, 75, 80]);
    const claim = pc(lost, pct);
    const heads = rng.shuffle([['wages', 'Wages', 'Wages A/c'], ['carriageInwards', 'Carriage Inwards', 'Carriage Inwards A/c'], ['freight', 'Freight Inwards', 'Freight A/c']] as const).slice(0, rng.pick([1, 2]));
    const directs: [string, number][] = heads.map(([, label]) => [label, amount(rng, 10000, 60000, 2000)]);
    const cs = amount(rng, 50000, 200000, 5000);
    const cost = os + purchases + sum(directs.map((d) => d[1]));
    const gp = pc(cost - cs - lost, rng.pick([20, 25, 30]));
    const sales = Math.round((cost - cs - lost + gp) / rupees(1000)) * rupees(1000);
    const gross = sales + cs + lost - cost;
    if (!isWhole(claim) || gross <= 0 || cost - cs - lost <= 0) return null;
    const lines = [
      `${firm} closes its books on ${F_DATE}. From its trial balance and records:`,
      `Opening stock: ${inr(os)}`,
      `Purchases: ${inr(purchases)}`,
      ...heads.map(([, label], i) => `${label}: ${inr(directs[i][1])}`),
      `Sales: ${inr(sales)}`,
      `Closing stock, as counted on 31 March: ${inr(cs)}`,
      `On 15 February a fire destroyed goods that had cost ${inr(lost)}. ${pct ? `The insurer has admitted a claim for ${pct}% of their cost, not yet received.` : 'They were not insured.'} No entry has been made for the loss.`,
    ];
    const data = lines.join('\n');
    fireKept.keep(data, { os, purchases, directs, sales, cs, lost });
    return {
      task: `Prepare the Trading Account of ${firm} for the year ended ${F_DATE}, showing the goods lost by fire on the credit side at cost, as the NCERT book does (purchases stay as they are).`,
      data,
      title: `Trading Account of ${firm} for the year ended ${F_DATE}`,
      ...{
        left: drSide([
          { label: 'Opening Stock', amount: os },
          { label: 'Purchases', amount: purchases },
          ...directs.map(([label, a]) => ({ label, amount: a })),
          { label: F_GP_CD, amount: gross, closing: true },
        ]),
        right: crSide([
          { label: 'Sales', amount: sales },
          { label: 'Loss by Fire', amount: lost },
          { label: 'Closing Stock', amount: cs },
        ]),
      },
      distractors: ['Insurance Claim', 'Purchases Return', F_GP_BD, 'Net Loss'],
      explanation: [
        'The debit side takes the cost of the goods: opening stock, purchases at the trial balance figure, and the direct expenses.',
        `The goods lost had cost ${inr(lost)}. In this layout they are not taken off purchases: the Trading Account is credited with their cost, "By Loss by Fire ${inr(lost)}", so the gross profit is that of the goods that were sold or are still in stock.`,
        pct
          ? `The claim admitted, ${inr(lost)} × ${pct}% = ${inr(claim)}, is an asset (Insurance Claim A/c); the rest, ${inr(lost - claim)}, is charged in the Profit and Loss Account. Neither is a row of the Trading Account.`
          : `There is no claim, so the whole ${inr(lost)} is charged in the Profit and Loss Account. It is not a row of the debit side here.`,
        `Debit side = ${fAdded([os, purchases, ...directs.map((d) => d[1])])}. Credit side = ${fAdded([sales, lost, cs])}.`,
        `The credit side is larger by ${inr(gross)}: the gross profit, entered as "To ${F_GP_CD}".`,
      ],
      hints: H_FIRE_TRADING,
    };
  },
  verify: (q) => {
    const k = fireKept.of(q.data);
    if (!k) return false;
    // The goods lost are a credit of the Trading Account, so purchases are not reduced: the gross profit is the
    // credit side (sales, closing stock, goods lost) less the debit side (opening stock, purchases, direct expenses).
    const debit = k.os + k.purchases + sum(k.directs.map((d) => d[1]));
    const gross = k.sales + k.cs + k.lost - debit;
    const row = (i: 0 | 1, label: string) => q.sides[i].rows.find((r) => r.label === label)?.amounts[0];
    return gross > 0 && row(0, F_GP_CD) === gross && row(1, 'Loss by Fire') === k.lost && row(0, 'Purchases') === k.purchases && q.data.includes(inr(k.lost));
  },
});

const added: Template[] = [entryDiscountProvision, entryFireTrading, setDebtorsCommission, fmtTradingFire];

// The templates of the quality pass come after those of the staff (they were added later still).
const withSets: Template[] = [...templates, ...sets, ...formats, ...staffWelfareTemplates, ...added];

// Assertion and Reason comes last, and is on its own level and on no mock paper (see assertionReason.ts).
// Version 2: the item on goods taken by the proprietor states that the goods are still in the purchases and not in the
// closing stock, the condition on which its assertion holds.
const assertionReason = revised(assertionReasonTemplate({
  prefix: 'faa', topicId: 'final-accounts-adjustments', conceptId: 'faa-two-effects',
  items: [
    {
      answer: 'explains',
      a: 'Outstanding salaries of ₹6,000 are added to salaries and shown as a current liability.',
      r: 'The service was used in the year, and the unpaid amount is owed.',
      aWhy: 'That is the two-fold treatment of an outstanding expense.',
      rWhy: 'The cost belongs to the year although it has not been paid.',
      link: 'The cost of the year goes to the Profit and Loss Account and the debt goes to the balance sheet, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'Rent of ₹9,000 received in advance is deducted from the rent received.',
      r: 'The income belongs to the next year, and the business still owes the service.',
      aWhy: 'It is also shown as a current liability.',
      rWhy: 'Cash has come in, but the rent has not been earned.',
      link: 'It is taken out because it is not an income of this year, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'Recording accrued interest of ₹3,000 raises the net profit by ₹3,000.',
      r: 'Income earned in the year belongs to the year, even though it has not been received.',
      aWhy: 'The amount is added to the income in the Profit and Loss Account.',
      rWhy: 'That is the accrual treatment of an income.',
      link: 'The interest is an income of this year, which is why the profit rises, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'If the profit before commission is ₹1,10,000 and the manager gets 10% on the profit after charging the commission, the commission is ₹10,000.',
      r: 'On this basis the commission is itself part of the profit before commission, which is 110 parts.',
      aWhy: '₹1,10,000 × 10/110 = ₹10,000.',
      rWhy: 'Profit after commission is 100 parts and the commission is 10 parts.',
      link: 'The rate is applied as 10/110 because of those parts, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'Allowing interest of ₹12,000 on capital does not change the closing capital of the proprietor.',
      r: 'The interest reduces the net profit and is added to the capital by the same amount.',
      aWhy: 'The closing capital is what it would have been without the interest.',
      rWhy: 'The entry is Interest on Capital A/c Dr; To Capital A/c.',
      link: 'The two effects on capital cancel out, so R explains A.',
    },
    {
      answer: 'not-the-reason',
      a: 'A machine costing ₹1,20,000, bought on 1 July and depreciated at 10% a year on cost, is charged ₹9,000 for the year ending 31 March.',
      r: 'Depreciation is a non-cash expense.',
      aWhy: '₹1,20,000 × 10% × 9/12 = ₹9,000.',
      rWhy: 'No money is paid when it is charged.',
      link: 'The figure comes from the nine months of use, which R does not mention.',
    },
    {
      answer: 'not-the-reason',
      a: 'Further bad debts of ₹2,000 are deducted from debtors in the balance sheet.',
      r: 'The provision for doubtful debts is also deducted from debtors in the balance sheet.',
      aWhy: 'The amount will not be received, so it is no longer a debtor.',
      rWhy: 'A provision is deducted from the asset.',
      link: 'R is about a different item. Bad debts are deducted because they are a loss that has already happened.',
    },
    {
      answer: 'not-the-reason',
      a: 'Closing stock raises the gross profit.',
      r: 'Closing stock is a current asset.',
      aWhy: 'It is credited to the Trading Account.',
      rWhy: 'It is shown among the current assets in the balance sheet.',
      link: 'The gross profit rises because closing stock reduces the cost of goods sold, not because it is an asset.',
    },
    {
      answer: 'a-only',
      a: 'Goods costing ₹5,000 taken by the proprietor are still in the purchases, and not in the closing stock counted. Recording them raises the net profit by ₹5,000.',
      r: 'Goods taken by the proprietor are an expense of the business.',
      aWhy: 'Purchases are reduced by ₹5,000, and no expense takes their place.',
      rWhy: 'They are drawings, which reduce capital and never enter the Profit and Loss Account.',
    },
    {
      answer: 'a-only',
      a: 'Outstanding wages of ₹5,000 reduce the gross profit.',
      r: 'Wages are charged in the Profit and Loss Account.',
      aWhy: 'Wages are a direct expense, so the amount is added to them in the Trading Account.',
      rWhy: 'Wages are charged in the Trading Account.',
    },
    {
      answer: 'r-only',
      a: 'A prepaid expense is added to the expense of the year.',
      r: 'The part paid for the next year is not an expense of this year.',
      aWhy: 'It is deducted from the expense and shown as a current asset.',
      rWhy: 'That part is a benefit still to come.',
    },
    {
      answer: 'r-only',
      a: 'A provision for doubtful debts is shown on the liabilities side of the balance sheet.',
      r: 'A provision for doubtful debts is deducted from debtors on the assets side.',
      aWhy: 'It is not shown as a liability.',
      rWhy: 'Debtors appear net of the provision.',
    },
  ],
}), 2);

const withAssertionReason: Template[] = [...withSets, assertionReason];

export default withAssertionReason;
