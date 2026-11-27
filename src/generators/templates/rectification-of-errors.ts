import type { AccountQuestion, Difficulty, JournalQuestion, JournalSetQuestion, McqQuestion, StatementQuestion } from '@/content/types';
import { CLASS11_ACCOUNTS, creditor, debtor, normalSide, resolveAccount, type Side } from '@/engine/accounts';
import { BALANCE_BD, BALANCE_CD, accountOf, type DatedEntry, type Posting } from '@/engine/books';
import type { JournalLine } from '@/engine/journal';
import type { Rng } from '@/engine/rng';
import { parseRupees } from '@/lib/money-input';
import { accountTemplate, amount, crSide, drSide, formatINR, journalSetTemplate, journalTemplate, mcqTemplate, numericTemplate, statementTemplate, type Paise } from '../authoring';
import type { AccountParts, Distractor, FormatRowParts, Template } from '../types';
import { assertionReasonTemplate } from '../assertionReason';

const T = 'rectification-of-errors';
const f = formatINR;

// ---------------------------------------------------------------------------------------------------------------
// The error model. Every scenario is written as what was posted (`done`) and what should have been posted (`should`).
// Everything else (the effect on the trial balance, the rectifying entry, the effect on profit) is worked out from
// those two lists, so a scenario cannot disagree with its own answer.
//
// Conventions used throughout (CBSE Class 11):
//  - an error found BEFORE the trial balance is corrected in the account itself; no Suspense A/c exists;
//  - the trial balance difference goes to Suspense A/c, on the side that is short;
//  - an error found AFTER it, if it left only one account wrong, is rectified through Suspense A/c; if two accounts
//    are wrong by equal and opposite amounts, the trial balance agreed and Suspense A/c is not used;
//  - goods taken by the owner for personal use are recorded as Drawings A/c Dr, Purchases A/c Cr.
// ---------------------------------------------------------------------------------------------------------------

type ErrorClass = 'omission' | 'commission' | 'principle' | 'compensating';

interface Post {
  account: string;
  side: Side;
  amount: Paise;
}
const dr = (account: string, a: Paise): Post => ({ account, side: 'Dr', amount: a });
const cr = (account: string, a: Paise): Post => ({ account, side: 'Cr', amount: a });

interface Case {
  /** What went wrong, as one or two sentences that end with a full stop. */
  text: string;
  kind: ErrorClass;
  /** The postings as they were made (or the net wrong effect of the error). */
  done: Post[];
  /** The postings that should have been made. Always balanced. */
  should: Post[];
  /** Explanation line about what was recorded; the default lists `done`. */
  recorded?: string;
  /** Explanation line about the correct entry; the default lists `should`, `null` leaves it out. */
  correct?: string | null;
  /** Wrong answers that a learner who slips on this particular error gives for the trial balance difference. */
  slips?: { value: Paise; why: string }[];
  /** Wrong answers for the effect on profit that this error invites: `effect` is signed like `profitEffect`. */
  profitSlips?: { effect: number; why: string }[];
}
type Maker = (rng: Rng) => Case | null;

const signed = (p: Post): number => (p.side === 'Dr' ? p.amount : -p.amount);
const sum = (ps: Post[]): number => ps.reduce((s, p) => s + signed(p), 0);

/** Debit total minus credit total of the trial balance, caused by the error. Positive: the debit side is larger. */
const tbNet = (c: Case): number => sum(c.done) - sum(c.should);

/** The rectifying entry: undo what is wrong, post what is right, and let Suspense A/c take any difference. */
function rectifyingEntry(c: Case): JournalLine[] {
  const net = new Map<string, number>();
  for (const p of c.should) net.set(p.account, (net.get(p.account) ?? 0) + signed(p));
  for (const p of c.done) net.set(p.account, (net.get(p.account) ?? 0) - signed(p));
  const lines: JournalLine[] = [];
  for (const [accountId, v] of net) if (v !== 0) lines.push({ accountId, side: v > 0 ? 'Dr' : 'Cr', amount: Math.abs(v) });
  const gap = tbNet(c);
  // Debit total too large: Suspense was credited in the trial balance, so the entry debits it (and the other way round).
  if (gap !== 0) lines.push({ accountId: 'suspense', side: gap > 0 ? 'Dr' : 'Cr', amount: Math.abs(gap) });
  return [...lines.filter((l) => l.side === 'Dr'), ...lines.filter((l) => l.side === 'Cr')];
}

/** Profit as shown by the books minus the correct profit: positive means profit is overstated. */
function profitEffect(c: Case): number {
  const pl = (p: Post): number => {
    const type = resolveAccount(p.account).type;
    if (type !== 'income' && type !== 'expense') return 0;
    return p.side === 'Cr' ? p.amount : -p.amount;
  };
  return c.done.reduce((s, p) => s + pl(p), 0) - c.should.reduce((s, p) => s + pl(p), 0);
}

const accountName = (id: string): string => `${resolveAccount(id).name} A/c`;
const postsText = (ps: Post[]): string => ps.map((p) => `${accountName(p.account)} ${p.side} ${f(p.amount)}`).join('; ');
const entryText = (ls: JournalLine[]): string => ls.map((l) => `${accountName(l.accountId)} ${l.side} ${f(l.amount)}`).join('; ');
const debitsFirst = (ls: JournalLine[]): JournalLine[] => [...ls.filter((l) => l.side === 'Dr'), ...ls.filter((l) => l.side === 'Cr')];
const accountsOf = (c: Case): string[] => [...new Set([...c.done, ...c.should].map((p) => p.account))];

function tbSentence(gap: number): string {
  if (gap === 0) return 'The error leaves debits and credits equal, so it does not disturb the trial balance and no Suspense A/c is involved.';
  if (gap > 0) return `Debits exceed credits by ${f(gap)}, so Suspense A/c is opened on the credit side of the trial balance; the rectifying entry debits it.`;
  return `Credits exceed debits by ${f(-gap)}, so Suspense A/c is opened on the debit side of the trial balance; the rectifying entry credits it.`;
}

/** The first lines of every explanation: what went wrong and what it did to the trial balance. */
function effectLines(c: Case): string[] {
  const out = [
    c.recorded ??
      (c.done.length > 0 ? `Recorded wrongly: ${postsText(c.done)}.` : 'Nothing was recorded: the transaction was left out of the books altogether.'),
  ];
  if (c.correct !== null) out.push(c.correct ?? `Should have been: ${postsText(c.should)}.`);
  out.push(tbSentence(tbNet(c)));
  return out;
}

const explainCase = (c: Case): string[] => [...effectLines(c), `Rectifying entry: ${entryText(rectifyingEntry(c))}.`];

/** A scenario where only part of a transaction was posted. */
const partial = (text: string, done: Post[], should: Post[]): Case => ({
  text,
  kind: 'omission',
  done,
  should,
  recorded: `Only this was posted: ${postsText(done)}.`,
  correct: `The full posting should have been: ${postsText(should)}.`,
});

// ---------------------------------------------------------------------------------------------------------------
// Helpers for drawing values and wording
// ---------------------------------------------------------------------------------------------------------------

const NAMES = [
  'Mohan Lal',
  'Ravi Kumar',
  'Sunita Rao',
  'Priya Mart',
  'Vikram Agency',
  'Deepak Joshi',
  'Farida Khan',
  'Suresh Nair',
  'Anil Verma',
  'Kavita Iyer',
];
const who = (rng: Rng, n: number): string[] => rng.shuffle(NAMES).slice(0, n);
/** Businesses of several kinds, for the questions that once spoke of "a trader". */
const FIRMS = [
  'Kaveri Agro Inputs, Erode',
  'Shree Ganesh Transport, Nagpur',
  'Mehta Dental Clinic, Surat',
  'Vidya Coaching Centre, Kota',
  'Qureshi Bakers, Bhopal',
  'Sandhu Sports, Jalandhar',
  'Nair Spice Traders, Kochi',
  'Bansal Footwear, Agra',
  'Green Valley Nursery, Pune',
  'Lakshmi Tailoring Works, Madurai',
];
const firmOf = (rng: Rng): string => rng.pick(FIRMS);
/** The convention every profit question states: an asset booked as an expense (or the reverse) moves profit by its full cost. */
const IGNORE_DEPRECIATION = 'Ignore depreciation.';
const money = (rng: Rng, min: number, max: number, step = 500): Paise => amount(rng, min, max, step);
const modeOf = (rng: Rng): 'cash' | 'bank' => rng.pick(['cash', 'bank'] as const);
const how = (m: 'cash' | 'bank'): string => (m === 'cash' ? 'in cash' : 'by cheque');
/** How a payment for each kind of expense reads in a sentence: "paid in cash as rent", "paid by cheque for repairs". */
const PAID: Record<string, string> = {
  rent: 'as rent',
  salaries: 'as salaries',
  wages: 'as wages',
  repairs: 'for repairs',
  advertisement: 'for advertisement',
  insurance: 'as insurance premium',
};

/** Wrong options without repeats or copies of the answer; null when fewer than the three the engine needs remain. */
function distinctOptions(correct: string, list: Distractor[]): Distractor[] | null {
  const seen = new Set<string>([correct]);
  const out = list.filter((d) => !seen.has(d.text) && seen.add(d.text));
  return out.length >= 3 ? out : null;
}

const pickDistinct = <A>(rng: Rng, items: readonly A[], n: number): A[] => rng.shuffle(items).slice(0, n);

/** Run makers until n distinct, non-null cases are drawn; null when that fails. */
function drawCases(rng: Rng, makers: readonly Maker[], n: number): Case[] | null {
  const out: Case[] = [];
  for (const maker of pickDistinct(rng, makers, n)) {
    const c = maker(rng);
    if (c === null) return null;
    out.push(c);
  }
  return out;
}

const overlap = (a: Case, b: Case): boolean => {
  const mine = new Set(accountsOf(a).filter((id) => id !== 'cash' && id !== 'bank'));
  return accountsOf(b).some((id) => mine.has(id));
};

/** Three different cases that touch different accounts and pass `accept`; a few draws are tried before giving up. */
function threeApart(rng: Rng, makers: readonly Maker[], accept: (cases: Case[]) => boolean = () => true): Case[] | null {
  for (let i = 0; i < 6; i++) {
    const cases = drawCases(rng, makers, 3);
    if (cases && !cases.some((a, k) => cases.some((b, j) => j > k && (overlap(a, b) || a.text === b.text))) && accept(cases)) return cases;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Scenario banks. Each maker draws its own amounts and names.
// ---------------------------------------------------------------------------------------------------------------

interface Pair {
  right: string;
  wrong: string;
  income?: true;
  /** Largest believable amount in rupees, where the usual range would be too much. */
  max?: number;
  text: (x: string, h: string) => string;
}
const PAIRS: Pair[] = [
  { right: 'rent', wrong: 'salaries', text: (x, h) => `Rent of ${x} paid ${h} was debited to Salaries A/c.` },
  { right: 'wages', wrong: 'salaries', text: (x, h) => `Wages of ${x} paid ${h} to factory workers were debited to Salaries A/c.` },
  { right: 'repairs', wrong: 'wages', text: (x, h) => `Repairs to a shop shutter, ${x}, paid ${h}, were debited to Wages A/c.` },
  { right: 'postage', wrong: 'stationery', max: 4000, text: (x, h) => `Postage stamps costing ${x} bought ${h} were debited to Stationery A/c.` },
  { right: 'advertisement', wrong: 'insurance', text: (x, h) => `Advertisement charges of ${x} paid ${h} were debited to Insurance A/c.` },
  { right: 'electricity', wrong: 'telephone', text: (x, h) => `An electricity bill of ${x} paid ${h} was debited to Telephone A/c.` },
  { right: 'interestPaid', wrong: 'commissionPaid', text: (x, h) => `Interest of ${x} paid on a loan ${h} was debited to Commission Paid A/c.` },
  {
    right: 'interestReceived',
    wrong: 'commissionReceived',
    income: true,
    text: (x, h) => `Interest of ${x} received ${h} on an investment was credited to Commission Received A/c.`,
  },
  {
    right: 'commissionReceived',
    wrong: 'rentReceived',
    income: true,
    text: (x, h) => `Commission of ${x} received ${h} was credited to Rent Received A/c.`,
  },
];

/** Two-sided, commission: an item posted to the wrong account of the same type. */
const wrongExpense: Maker[] = [
  (rng) => {
    const pair = rng.pick(PAIRS);
    const x = pair.max ? money(rng, 500, pair.max) : money(rng, 1000, 40000);
    const m = modeOf(rng);
    const [right, wrong] = pair.income
      ? [[dr(m, x), cr(pair.right, x)], [dr(m, x), cr(pair.wrong, x)]]
      : [[dr(pair.right, x), cr(m, x)], [dr(pair.wrong, x), cr(m, x)]];
    return { text: pair.text(f(x), how(m)), kind: 'commission', done: wrong, should: right };
  },
];

/** Two-sided, commission: the right transaction, posted to the wrong party. */
const wrongParty: Maker[] = [
  (rng) => {
    const [a, b] = who(rng, 2);
    const x = money(rng, 2000, 60000);
    return {
      text: `Goods worth ${f(x)} sold on credit to ${a} were debited to ${b}'s account by mistake.`,
      kind: 'commission',
      done: [dr(debtor(b), x), cr('sales', x)],
      should: [dr(debtor(a), x), cr('sales', x)],
    };
  },
  (rng) => {
    const [a, b] = who(rng, 2);
    const x = money(rng, 2000, 60000);
    return {
      text: `Goods worth ${f(x)} bought on credit from ${a} were credited to ${b}'s account by mistake.`,
      kind: 'commission',
      done: [dr('purchases', x), cr(creditor(b), x)],
      should: [dr('purchases', x), cr(creditor(a), x)],
    };
  },
  (rng) => {
    const [a, b] = who(rng, 2);
    const x = money(rng, 1000, 40000);
    return {
      text: `${f(x)} received in cash from ${a}, a customer, was credited to ${b}'s account by mistake.`,
      kind: 'commission',
      done: [dr('cash', x), cr(debtor(b), x)],
      should: [dr('cash', x), cr(debtor(a), x)],
    };
  },
  (rng) => {
    const [a, b] = who(rng, 2);
    const x = money(rng, 1000, 40000);
    return {
      text: `${f(x)} paid by cheque to ${a}, a supplier, was debited to ${b}'s account by mistake.`,
      kind: 'commission',
      done: [dr(creditor(b), x), cr('bank', x)],
      should: [dr(creditor(a), x), cr('bank', x)],
    };
  },
];

/** Two-sided, omission: a transaction left out of the books altogether. */
const omit = (text: string, should: Post[]): Case => ({ text, kind: 'omission', done: [], should });
const omissions: Maker[] = [
  (rng) => {
    const [p] = who(rng, 1);
    const x = money(rng, 2000, 60000);
    return omit(`A credit purchase of goods worth ${f(x)} from ${p} was not entered in any book.`, [dr('purchases', x), cr(creditor(p), x)]);
  },
  (rng) => {
    const [p] = who(rng, 1);
    const x = money(rng, 2000, 60000);
    return omit(`A credit sale of goods worth ${f(x)} to ${p} was left out of the books altogether.`, [dr(debtor(p), x), cr('sales', x)]);
  },
  (rng) => {
    const e = rng.pick(['rent', 'salaries', 'wages', 'repairs', 'advertisement'] as const);
    const x = money(rng, 1000, 30000);
    const m = modeOf(rng);
    return omit(`${f(x)} paid ${how(m)} ${PAID[e]} was not recorded in any book.`, [dr(e, x), cr(m, x)]);
  },
  (rng) => {
    const [p] = who(rng, 1);
    const x = money(rng, 1000, 40000);
    const m = modeOf(rng);
    return omit(`${f(x)} received ${how(m)} from ${p}, a customer, was not entered in any book.`, [dr(m, x), cr(debtor(p), x)]);
  },
  (rng) => {
    const [p] = who(rng, 1);
    const x = money(rng, 1000, 40000);
    return omit(`${f(x)} paid by cheque to ${p}, a supplier, was not entered in any book.`, [dr(creditor(p), x), cr('bank', x)]);
  },
  (rng) => {
    const [p] = who(rng, 1);
    const x = money(rng, 500, 15000);
    return omit(`Goods worth ${f(x)} returned by ${p}, a customer, were not recorded in any book.`, [dr('salesReturn', x), cr(debtor(p), x)]);
  },
  (rng) => {
    const [p] = who(rng, 1);
    const x = money(rng, 500, 15000);
    return omit(`Goods worth ${f(x)} returned to ${p}, a supplier, were not recorded in any book.`, [dr(creditor(p), x), cr('purchasesReturn', x)]);
  },
  (rng) => {
    const x = money(rng, 500, 10000);
    const m = modeOf(rng);
    return omit(`Commission of ${f(x)} received ${how(m)} was not recorded in any book.`, [dr(m, x), cr('commissionReceived', x)]);
  },
  (rng) => {
    const x = money(rng, 1000, 20000);
    return {
      ...omit(`The owner took goods costing ${f(x)} for personal use and no entry was made.`, [dr('drawings', x), cr('purchases', x)]),
      correct: `Goods taken by the owner are drawings at cost, and they are no longer a purchase of the business: Drawings A/c Dr ${f(x)}; Purchases A/c Cr ${f(x)}.`,
    };
  },
];

const ASSETS: [string, string][] = [
  ['furniture', 'furniture'],
  ['machinery', 'machinery'],
  ['computers', 'a computer'],
  ['vehicles', 'a delivery van'],
  ['officeEquipment', 'office equipment'],
];

/** Principle: capital and revenue items confused. */
const principleA: Maker[] = [
  (rng) => {
    const [asset, label] = rng.pick(ASSETS);
    const x = money(rng, 5000, 150000, 1000);
    const m = modeOf(rng);
    return {
      text: `${label.charAt(0).toUpperCase()}${label.slice(1)} bought for ${f(x)} ${m === 'cash' ? 'in cash' : 'by cheque'} was debited to Purchases A/c.`,
      kind: 'principle',
      done: [dr('purchases', x), cr(m, x)],
      should: [dr(asset, x), cr(m, x)],
    };
  },
  (rng) => {
    const [asset, label] = rng.pick(ASSETS);
    const [p] = who(rng, 1);
    const x = money(rng, 5000, 150000, 1000);
    return {
      text: `${label.charAt(0).toUpperCase()}${label.slice(1)} bought on credit from ${p} for ${f(x)} was debited to Purchases A/c.`,
      kind: 'principle',
      done: [dr('purchases', x), cr(creditor(p), x)],
      should: [dr(asset, x), cr(creditor(p), x)],
    };
  },
  (rng) => {
    const asset = rng.pick(['machinery', 'furniture', 'building', 'vehicles', 'computers'] as const);
    const label = { machinery: 'machinery', furniture: 'furniture', building: 'the building', vehicles: 'the delivery van', computers: 'the computers' }[asset];
    const x = money(rng, 1000, 30000);
    const m = modeOf(rng);
    return {
      text: `Repairs to ${label} costing ${f(x)}, paid ${how(m)}, were debited to ${resolveAccount(asset).name} A/c.`,
      kind: 'principle',
      done: [dr(asset, x), cr(m, x)],
      should: [dr('repairs', x), cr(m, x)],
    };
  },
  (rng) => {
    const x = money(rng, 2000, 40000);
    const m = modeOf(rng);
    return {
      text: `Wages of ${f(x)} paid ${how(m)} for installing a new machine were debited to Wages A/c.`,
      kind: 'principle',
      done: [dr('wages', x), cr(m, x)],
      should: [dr('machinery', x), cr(m, x)],
    };
  },
];

/** Principle: business and personal items, or capital and income, confused. */
const principleB: Maker[] = [
  (rng) => {
    const item = rng.pick([
      ['insurance', 'The premium on the owner\'s personal life insurance policy'],
      ['rent', 'The rent of the owner\'s residence'],
      ['salaries', 'The salary of a servant employed at the owner\'s home'],
      ['electricity', 'The electricity bill of the owner\'s house'],
    ] as const);
    const x = money(rng, 1000, 20000);
    const m = modeOf(rng);
    return {
      text: `${item[1]}, ${f(x)}, was paid by the firm ${how(m)} and debited to ${resolveAccount(item[0]).name} A/c.`,
      kind: 'principle',
      done: [dr(item[0], x), cr(m, x)],
      should: [dr('drawings', x), cr(m, x)],
    };
  },
  (rng) => {
    const x = money(rng, 2000, 30000);
    return {
      text: `Old furniture was sold for ${f(x)} in cash, which was its book value, and the amount was credited to Sales A/c.`,
      kind: 'principle',
      done: [dr('cash', x), cr('sales', x)],
      should: [dr('cash', x), cr('furniture', x)],
    };
  },
  (rng) => {
    const x = money(rng, 10000, 200000, 5000);
    const m = modeOf(rng);
    return {
      text: `Capital of ${f(x)} brought into the business by the owner ${m === 'cash' ? 'in cash' : 'by cheque'} was credited to Sales A/c.`,
      kind: 'principle',
      done: [dr(m, x), cr('sales', x)],
      should: [dr(m, x), cr('capital', x)],
    };
  },
  (rng) => {
    const x = money(rng, 10000, 200000, 5000);
    return {
      text: `A bank loan of ${f(x)}, received into the business bank account, was credited to Miscellaneous Income A/c.`,
      kind: 'principle',
      done: [dr('bank', x), cr('miscellaneousIncome', x)],
      should: [dr('bank', x), cr('bankLoan', x)],
    };
  },
];

/** Compensating: two errors of equal amount that cancel each other. */
const compensating: Maker[] = [
  (rng) => {
    const [a, b] = rng.pick([
      ['rent', 'salaries'],
      ['wages', 'repairs'],
      ['telephone', 'electricity'],
      ['stationery', 'postage'],
    ] as const);
    const x = money(rng, 500, 8000);
    return {
      text: `The debit side of ${resolveAccount(a).name} A/c was overcast by ${f(x)} and the debit side of ${resolveAccount(b).name} A/c was undercast by the same amount.`,
      kind: 'compensating',
      done: [dr(a, x), cr(b, x)],
      should: [],
      recorded: `Net effect of the two errors: ${accountName(a)} Dr ${f(x)} too much and ${accountName(b)} Dr ${f(x)} too little.`,
      correct: null,
    };
  },
  (rng) => {
    const [a, b] = rng.pick([
      ['sales', 'commissionReceived'],
      ['interestReceived', 'rentReceived'],
      ['discountReceived', 'commissionReceived'],
    ] as const);
    const x = money(rng, 500, 8000);
    return {
      text: `The credit side of ${resolveAccount(a).name} A/c was overcast by ${f(x)} and the credit side of ${resolveAccount(b).name} A/c was undercast by the same amount.`,
      kind: 'compensating',
      done: [cr(a, x), dr(b, x)],
      should: [],
      recorded: `Net effect of the two errors: ${accountName(a)} Cr ${f(x)} too much and ${accountName(b)} Cr ${f(x)} too little.`,
      correct: null,
    };
  },
  (rng) => {
    const x = money(rng, 1000, 20000, 1000);
    return {
      text: `The Sales Book and the Purchases Book were both overcast by ${f(x)}.`,
      kind: 'compensating',
      done: [cr('sales', x), dr('purchases', x)],
      should: [],
      recorded: `Net effect of the two errors: Sales A/c Cr ${f(x)} too much and Purchases A/c Dr ${f(x)} too much.`,
      correct: null,
    };
  },
  (rng) => {
    const [a, b] = who(rng, 2);
    const x = money(rng, 500, 8000);
    return {
      text: `${a}'s account, a customer, was debited ${f(x)} too much and the account of ${b}, also a customer, was debited ${f(x)} too little.`,
      kind: 'compensating',
      done: [dr(debtor(a), x), cr(debtor(b), x)],
      should: [],
      recorded: `Net effect of the two errors: ${a} Dr ${f(x)} too much and ${b} Dr ${f(x)} too little.`,
      correct: null,
    };
  },
];

/** Commission: an entry written the wrong way round, so both accounts are on the wrong side. */
const reversed: Maker[] = [
  (rng) => {
    const x = money(rng, 2000, 60000);
    const m = modeOf(rng);
    return {
      text: `Goods bought for ${f(x)}, paid ${how(m)}, were recorded by debiting ${resolveAccount(m).name} A/c and crediting Purchases A/c.`,
      kind: 'commission',
      done: [dr(m, x), cr('purchases', x)],
      should: [dr('purchases', x), cr(m, x)],
    };
  },
  (rng) => {
    const [p] = who(rng, 1);
    const x = money(rng, 2000, 60000);
    return {
      text: `A credit sale of ${f(x)} to ${p} was recorded by debiting Sales A/c and crediting ${p}'s account.`,
      kind: 'commission',
      done: [dr('sales', x), cr(debtor(p), x)],
      should: [dr(debtor(p), x), cr('sales', x)],
    };
  },
  (rng) => {
    const [p] = who(rng, 1);
    const x = money(rng, 1000, 40000);
    return {
      text: `${f(x)} paid in cash to ${p}, a supplier, was recorded by debiting Cash A/c and crediting ${p}'s account.`,
      kind: 'commission',
      done: [dr('cash', x), cr(creditor(p), x)],
      should: [dr(creditor(p), x), cr('cash', x)],
    };
  },
  (rng) => {
    const e = rng.pick(['salaries', 'wages', 'rent'] as const);
    const x = money(rng, 1000, 30000);
    return {
      text: `${f(x)} paid in cash as ${resolveAccount(e).name.toLowerCase()} was recorded by debiting Cash A/c and crediting ${resolveAccount(e).name} A/c.`,
      kind: 'commission',
      done: [dr('cash', x), cr(e, x)],
      should: [dr(e, x), cr('cash', x)],
    };
  },
  (rng) => {
    const [p] = who(rng, 1);
    const x = money(rng, 1000, 40000);
    return {
      text: `${f(x)} received in cash from ${p}, a customer, was recorded by debiting ${p}'s account and crediting Cash A/c.`,
      kind: 'commission',
      done: [dr(debtor(p), x), cr('cash', x)],
      should: [dr('cash', x), cr(debtor(p), x)],
    };
  },
];

/** Omission (partial): the transaction reached one account but not the other. One-sided, so the trial balance differs. */
const notPosted: Maker[] = [
  (rng) => {
    const [p] = who(rng, 1);
    const x = money(rng, 2000, 60000);
    return partial(
      `A credit sale of ${f(x)} to ${p} was entered in the Sales Book and posted to Sales A/c, but was not posted to ${p}'s account.`,
      [cr('sales', x)],
      [dr(debtor(p), x), cr('sales', x)],
    );
  },
  (rng) => {
    const [p] = who(rng, 1);
    const x = money(rng, 2000, 60000);
    return partial(
      `A credit sale of ${f(x)} to ${p} was posted to ${p}'s account, but the amount was never posted to Sales A/c.`,
      [dr(debtor(p), x)],
      [dr(debtor(p), x), cr('sales', x)],
    );
  },
  (rng) => {
    const [p] = who(rng, 1);
    const x = money(rng, 2000, 60000);
    return partial(
      `A credit purchase of ${f(x)} from ${p} was posted to Purchases A/c, but was not posted to ${p}'s account.`,
      [dr('purchases', x)],
      [dr('purchases', x), cr(creditor(p), x)],
    );
  },
  (rng) => {
    const [p] = who(rng, 1);
    const x = money(rng, 2000, 60000);
    return partial(
      `A credit purchase of ${f(x)} from ${p} was posted to ${p}'s account, but the amount was never posted to Purchases A/c.`,
      [cr(creditor(p), x)],
      [dr('purchases', x), cr(creditor(p), x)],
    );
  },
  (rng) => {
    const e = rng.pick(['rent', 'salaries', 'wages', 'insurance'] as const);
    const x = money(rng, 1000, 30000);
    const m = modeOf(rng);
    return partial(
      `${f(x)} paid ${how(m)} ${PAID[e]} was entered in the ${m === 'cash' ? 'Cash' : 'Bank'} column of the cash book, but was not posted to ${resolveAccount(e).name} A/c.`,
      [cr(m, x)],
      [dr(e, x), cr(m, x)],
    );
  },
  (rng) => {
    const [p] = who(rng, 1);
    const x = money(rng, 1000, 40000);
    return partial(
      `${f(x)} received in cash from ${p}, a customer, was entered in the Cash Book but was not posted to ${p}'s account.`,
      [dr('cash', x)],
      [dr('cash', x), cr(debtor(p), x)],
    );
  },
  (rng) => {
    const [p] = who(rng, 1);
    const x = money(rng, 1000, 40000);
    return partial(
      `${f(x)} paid in cash to ${p}, a supplier, was entered in the Cash Book but was not posted to ${p}'s account.`,
      [cr('cash', x)],
      [dr(creditor(p), x), cr('cash', x)],
    );
  },
  (rng) => {
    const x = money(rng, 500, 10000);
    return partial(
      `Commission of ${f(x)} received in cash was entered in the Cash Book but was not posted to Commission Received A/c.`,
      [dr('cash', x)],
      [dr('cash', x), cr('commissionReceived', x)],
    );
  },
];

/** A figure and the same two digits swapped ("slip of the pen"), or a nearby figure. Returns [true amount, wrong amount]. */
function wrongPair(rng: Rng): [Paise, Paise] | null {
  if (rng.pick([true, false])) {
    const a = rng.int(1, 9);
    const b = rng.int(1, 9);
    if (a === b) return null;
    const scale = rng.pick([10, 100]);
    return [(10 * a + b) * scale * 100, (10 * b + a) * scale * 100];
  }
  const x = money(rng, 3000, 60000);
  const y = x + rng.pick([-1, 1]) * money(rng, 500, 2500);
  return y > 0 ? [x, y] : null;
}

/** Commission: the right amount in one book and a wrong amount in one ledger account. One-sided. */
const wrongAmount: Maker[] = [
  (rng) => {
    const w = wrongPair(rng);
    if (!w) return null;
    const [x, y] = w;
    const [p] = who(rng, 1);
    return {
      text: `Goods worth ${f(x)} were bought on credit from ${p}. The Purchases Book is right, but ${p}'s account was credited with ${f(y)}.`,
      kind: 'commission',
      done: [dr('purchases', x), cr(creditor(p), y)],
      should: [dr('purchases', x), cr(creditor(p), x)],
      slips: [
        { value: x, why: 'Gave one of the two amounts instead of the difference between them.' },
        { value: y, why: 'Gave the wrong figure that was posted instead of the difference.' },
        { value: x + y, why: 'Added the two figures instead of finding their difference.' },
      ],
    };
  },
  (rng) => {
    const w = wrongPair(rng);
    if (!w) return null;
    const [x, y] = w;
    const [p] = who(rng, 1);
    return {
      text: `Goods worth ${f(x)} were sold on credit to ${p}. The Sales Book is right, but ${p}'s account was debited with ${f(y)}.`,
      kind: 'commission',
      done: [dr(debtor(p), y), cr('sales', x)],
      should: [dr(debtor(p), x), cr('sales', x)],
      slips: [
        { value: x, why: 'Gave one of the two amounts instead of the difference between them.' },
        { value: y, why: 'Gave the wrong figure that was posted instead of the difference.' },
        { value: x + y, why: 'Added the two figures instead of finding their difference.' },
      ],
    };
  },
  (rng) => {
    const w = wrongPair(rng);
    if (!w) return null;
    const [x, y] = w;
    const e = rng.pick(['rent', 'salaries', 'wages'] as const);
    return {
      text: `${f(x)} was paid in cash as ${resolveAccount(e).name.toLowerCase()}. The Cash Book is right, but ${resolveAccount(e).name} A/c was debited with ${f(y)}.`,
      kind: 'commission',
      done: [dr(e, y), cr('cash', x)],
      should: [dr(e, x), cr('cash', x)],
      slips: [
        { value: x, why: 'Gave one of the two amounts instead of the difference between them.' },
        { value: y, why: 'Gave the wrong figure that was posted instead of the difference.' },
        { value: x + y, why: 'Added the two figures instead of finding their difference.' },
      ],
    };
  },
  (rng) => {
    const w = wrongPair(rng);
    if (!w) return null;
    const [x, y] = w;
    const [p] = who(rng, 1);
    return {
      text: `${f(x)} was received in cash from ${p}, a customer. The Cash Book is right, but ${p}'s account was credited with ${f(y)}.`,
      kind: 'commission',
      done: [dr('cash', x), cr(debtor(p), y)],
      should: [dr('cash', x), cr(debtor(p), x)],
      slips: [
        { value: x, why: 'Gave one of the two amounts instead of the difference between them.' },
        { value: y, why: 'Gave the wrong figure that was posted instead of the difference.' },
        { value: x + y, why: 'Added the two figures instead of finding their difference.' },
      ],
    };
  },
  (rng) => {
    const w = wrongPair(rng);
    if (!w) return null;
    const [x, y] = w;
    const [p] = who(rng, 1);
    return {
      text: `Goods worth ${f(x)} were returned to ${p}, a supplier. The Purchases Return Book is right, but ${p}'s account was debited with ${f(y)}.`,
      kind: 'commission',
      done: [dr(creditor(p), y), cr('purchasesReturn', x)],
      should: [dr(creditor(p), x), cr('purchasesReturn', x)],
      slips: [
        { value: x, why: 'Gave one of the two amounts instead of the difference between them.' },
        { value: y, why: 'Gave the wrong figure that was posted instead of the difference.' },
        { value: x + y, why: 'Added the two figures instead of finding their difference.' },
      ],
    };
  },
];

const WRONG_SIDE_SLIP = {
  why: 'Counted the posting once. A posting on the wrong side moves the difference by twice its amount: it is missing from one side and has been added to the other.',
};

/** Commission: one account posted on the wrong side. One-sided; the trial balance differs by twice the amount. */
const wrongSide: Maker[] = [
  (rng) => {
    const x = money(rng, 1000, 30000);
    return {
      text: `Rent of ${f(x)} paid in cash was entered correctly in the Cash Book, but was posted to the credit of Rent A/c.`,
      kind: 'commission',
      done: [cr('cash', x), cr('rent', x)],
      should: [dr('rent', x), cr('cash', x)],
      slips: [{ value: x, ...WRONG_SIDE_SLIP }],
    };
  },
  (rng) => {
    const [p] = who(rng, 1);
    const x = money(rng, 1000, 40000);
    return {
      text: `${f(x)} received in cash from ${p}, a customer, was entered correctly in the Cash Book, but was posted to the debit of ${p}'s account.`,
      kind: 'commission',
      done: [dr('cash', x), dr(debtor(p), x)],
      should: [dr('cash', x), cr(debtor(p), x)],
      slips: [{ value: x, ...WRONG_SIDE_SLIP }],
    };
  },
  (rng) => {
    const x = money(rng, 2000, 50000);
    return {
      text: `A cash sale of ${f(x)} was entered correctly in the Cash Book, but was posted to the debit of Sales A/c.`,
      kind: 'commission',
      done: [dr('cash', x), dr('sales', x)],
      should: [dr('cash', x), cr('sales', x)],
      slips: [{ value: x, ...WRONG_SIDE_SLIP }],
    };
  },
  (rng) => {
    const [p] = who(rng, 1);
    const x = money(rng, 2000, 60000);
    return {
      text: `Goods worth ${f(x)} bought on credit from ${p} were posted correctly to Purchases A/c, but ${p}'s account was debited instead of credited.`,
      kind: 'commission',
      done: [dr('purchases', x), dr(creditor(p), x)],
      should: [dr('purchases', x), cr(creditor(p), x)],
      slips: [{ value: x, ...WRONG_SIDE_SLIP }],
    };
  },
  (rng) => {
    const [p] = who(rng, 1);
    const x = money(rng, 1000, 40000);
    return {
      text: `${f(x)} paid in cash to ${p}, a supplier, was entered correctly in the Cash Book, but was posted to the credit of ${p}'s account.`,
      kind: 'commission',
      done: [cr('cash', x), cr(creditor(p), x)],
      should: [dr(creditor(p), x), cr('cash', x)],
      slips: [{ value: x, ...WRONG_SIDE_SLIP }],
    };
  },
  (rng) => {
    const [p] = who(rng, 1);
    const x = money(rng, 2000, 60000);
    return {
      text: `Goods worth ${f(x)} sold on credit to ${p} were posted correctly to Sales A/c, but ${p}'s account was credited instead of debited.`,
      kind: 'commission',
      done: [cr(debtor(p), x), cr('sales', x)],
      should: [dr(debtor(p), x), cr('sales', x)],
      slips: [{ value: x, ...WRONG_SIDE_SLIP }],
    };
  },
];

/** Commission: a book or account added up wrongly. One account is wrong, so the trial balance differs. */
const casting: Maker[] = [
  (rng) => {
    const x = money(rng, 1000, 30000, 1000);
    return {
      text: `The Sales Book was overcast by ${f(x)}, and the wrong total was posted to Sales A/c.`,
      kind: 'commission',
      done: [cr('sales', x)],
      should: [],
      recorded: `Sales A/c was credited with ${f(x)} too much.`,
      correct: null,
    };
  },
  (rng) => {
    const x = money(rng, 1000, 30000, 1000);
    return {
      text: `The Sales Book was undercast by ${f(x)}, and the wrong total was posted to Sales A/c.`,
      kind: 'commission',
      done: [dr('sales', x)],
      should: [],
      recorded: `Sales A/c was credited with ${f(x)} too little, which has the same effect as a debit of ${f(x)}.`,
      correct: null,
    };
  },
  (rng) => {
    const x = money(rng, 1000, 30000, 1000);
    return {
      text: `The Purchases Book was overcast by ${f(x)}, and the wrong total was posted to Purchases A/c.`,
      kind: 'commission',
      done: [dr('purchases', x)],
      should: [],
      recorded: `Purchases A/c was debited with ${f(x)} too much.`,
      correct: null,
    };
  },
  (rng) => {
    const x = money(rng, 1000, 30000, 1000);
    return {
      text: `The Purchases Book was undercast by ${f(x)}, and the wrong total was posted to Purchases A/c.`,
      kind: 'commission',
      done: [cr('purchases', x)],
      should: [],
      recorded: `Purchases A/c was debited with ${f(x)} too little, which has the same effect as a credit of ${f(x)}.`,
      correct: null,
    };
  },
  (rng) => {
    const x = money(rng, 500, 10000);
    return {
      text: `The Purchases Return Book was overcast by ${f(x)}, and the wrong total was posted to Purchases Return A/c.`,
      kind: 'commission',
      done: [cr('purchasesReturn', x)],
      should: [],
      recorded: `Purchases Return A/c was credited with ${f(x)} too much.`,
      correct: null,
    };
  },
  (rng) => {
    const x = money(rng, 500, 10000);
    return {
      text: `The Sales Return Book was overcast by ${f(x)}, and the wrong total was posted to Sales Return A/c.`,
      kind: 'commission',
      done: [dr('salesReturn', x)],
      should: [],
      recorded: `Sales Return A/c was debited with ${f(x)} too much.`,
      correct: null,
    };
  },
  (rng) => {
    const e = rng.pick(['wages', 'rent', 'repairs', 'salaries'] as const);
    const x = money(rng, 500, 10000);
    return {
      text: `The debit side of ${resolveAccount(e).name} A/c was added up ${f(x)} too high.`,
      kind: 'commission',
      done: [dr(e, x)],
      should: [],
      recorded: `${accountName(e)} was debited with ${f(x)} too much.`,
      correct: null,
    };
  },
  (rng) => {
    const x = money(rng, 1000, 30000, 1000);
    return {
      text: `The receipts side of the Cash Book was overcast by ${f(x)}.`,
      kind: 'commission',
      done: [dr('cash', x)],
      should: [],
      recorded: `Cash A/c was debited with ${f(x)} too much.`,
      correct: null,
    };
  },
];

/** Commission, two-sided: a transaction entered in the wrong book of original entry. */
const wrongBook: Maker[] = [
  (rng) => {
    const [p] = who(rng, 1);
    const x = money(rng, 2000, 60000);
    return {
      text: `A credit sale of ${f(x)} to ${p} was entered in the Purchases Book instead of the Sales Book, so ${p}'s account was credited.`,
      kind: 'commission',
      done: [dr('purchases', x), cr(debtor(p), x)],
      should: [dr(debtor(p), x), cr('sales', x)],
    };
  },
  (rng) => {
    const [p] = who(rng, 1);
    const x = money(rng, 2000, 60000);
    return {
      text: `A credit purchase of goods worth ${f(x)} from ${p} was entered in the Sales Book instead of the Purchases Book, so ${p}'s account was debited.`,
      kind: 'commission',
      done: [dr(creditor(p), x), cr('sales', x)],
      should: [dr('purchases', x), cr(creditor(p), x)],
    };
  },
  (rng) => {
    const [p] = who(rng, 1);
    const x = money(rng, 500, 15000);
    return {
      text: `Goods worth ${f(x)} returned by ${p}, a customer, were entered in the Purchases Return Book instead of the Sales Return Book, so ${p}'s account was debited.`,
      kind: 'commission',
      done: [dr(debtor(p), x), cr('purchasesReturn', x)],
      should: [dr('salesReturn', x), cr(debtor(p), x)],
    };
  },
  (rng) => {
    const [p] = who(rng, 1);
    const x = money(rng, 500, 15000);
    return {
      text: `Goods worth ${f(x)} returned to ${p}, a supplier, were entered in the Sales Return Book instead of the Purchases Return Book, so ${p}'s account was credited.`,
      kind: 'commission',
      done: [dr('salesReturn', x), cr(creditor(p), x)],
      should: [dr(creditor(p), x), cr('purchasesReturn', x)],
    };
  },
];

/** Wrong answers for the effect on profit when an asset and a cost that belongs to it were both charged as expenses. */
const partSlips = (x: Paise, y: Paise, second: string): Case['profitSlips'] => [
  { effect: -x, why: `Counted only the price that was charged to the wrong account and missed the ${second}, which is also part of the cost of the asset.` },
  { effect: -y, why: `Counted only the ${second} and missed the price of the asset itself.` },
];

/** Principle, with two parts: an asset booked as an expense together with a cost that belongs to it. */
const principleCombined: Maker[] = [
  (rng) => {
    const [asset, label] = rng.pick(ASSETS.slice(0, 3));
    const [p] = who(rng, 1);
    const x = money(rng, 40000, 150000, 5000);
    const y = money(rng, 1000, 9000, 500);
    return {
      text: `${label.charAt(0).toUpperCase()}${label.slice(1)} bought on credit from ${p} for ${f(x)} was debited to Purchases A/c, and ${f(y)} paid in cash for installing it was debited to Wages A/c.`,
      kind: 'principle',
      done: [dr('purchases', x), cr(creditor(p), x), dr('wages', y), cr('cash', y)],
      should: [dr(asset, x + y), cr(creditor(p), x), cr('cash', y)],
      correct: `Installation is part of the cost of the asset. Should have been: ${accountName(asset)} Dr ${f(x + y)}; ${p} A/c Cr ${f(x)}; Cash A/c Cr ${f(y)}.`,
      profitSlips: partSlips(x, y, 'installation cost'),
    };
  },
  (rng) => {
    const x = money(rng, 40000, 150000, 5000);
    const y = money(rng, 1000, 9000, 500);
    const m = modeOf(rng);
    return {
      text: `A machine bought for ${f(x)}, paid ${how(m)}, was debited to Repairs A/c, and ${f(y)} paid ${how(m)} as carriage on it was debited to Carriage Inwards A/c.`,
      kind: 'principle',
      done: [dr('repairs', x), cr(m, x), dr('carriageInwards', y), cr(m, y)],
      should: [dr('machinery', x + y), cr(m, x + y)],
      correct: `Carriage on a machine is part of its cost. Should have been: Machinery A/c Dr ${f(x + y)}; ${accountName(m)} Cr ${f(x + y)}.`,
      profitSlips: partSlips(x, y, 'carriage'),
    };
  },
  (rng) => {
    const [p] = who(rng, 1);
    const x = money(rng, 60000, 150000, 5000);
    const y = money(rng, 2000, 18000, 1000);
    return {
      text: `Materials costing ${f(x)}, bought on credit from ${p} to build a new godown, were debited to Purchases A/c, and wages of ${f(y)} paid in cash to the masons who built it were debited to Wages A/c.`,
      kind: 'principle',
      done: [dr('purchases', x), cr(creditor(p), x), dr('wages', y), cr('cash', y)],
      should: [dr('building', x + y), cr(creditor(p), x), cr('cash', y)],
      correct: `Materials and wages used to put up a building are its cost. Should have been: Building A/c Dr ${f(x + y)}; ${p} A/c Cr ${f(x)}; Cash A/c Cr ${f(y)}.`,
      profitSlips: partSlips(x, y, 'wages of construction'),
    };
  },
];

/**
 * Two errors of principle between the same two accounts, in opposite directions. Kept out of the journal generators:
 * each error is rectified by its own entry, and an answer of two entries cannot be matched against a single net one.
 */
const principleOffsetting: Maker[] = [
  (rng) => {
    const x = money(rng, 2000, 9000, 500);
    const y = money(rng, 20000, 90000, 5000);
    return {
      text: `Repairs to machinery of ${f(x)} were debited to Machinery A/c, and a new machine bought for ${f(y)} was debited to Repairs A/c; both were paid in cash.`,
      kind: 'principle',
      done: [dr('machinery', x), cr('cash', x), dr('repairs', y), cr('cash', y)],
      should: [dr('repairs', x), cr('cash', x), dr('machinery', y), cr('cash', y)],
      recorded: `Recorded wrongly: Machinery A/c Dr ${f(x)} for the repairs, and Repairs A/c Dr ${f(y)} for the new machine.`,
      correct: `Should have been: Repairs A/c Dr ${f(x)}, and Machinery A/c Dr ${f(y)}. Repairs A/c is therefore ${f(y - x)} too high and Machinery A/c ${f(y - x)} too low.`,
      profitSlips: [
        { effect: -(x + y), why: 'Added the two amounts, although the repairs left out of expenses raise the profit and the machine charged to expenses lowers it.' },
        { effect: -y, why: 'Counted only the machine charged to Repairs A/c and missed the repairs that were added to Machinery A/c.' },
        { effect: x, why: 'Counted only the repairs added to Machinery A/c and missed the machine charged to Repairs A/c.' },
      ],
    };
  },
];

const ONE_SIDED: Maker[] = [...notPosted, ...wrongAmount, ...wrongSide, ...casting];
const TWO_SIDED_SIMPLE: Maker[] = [...wrongExpense, ...wrongParty, ...omissions, ...principleA, ...principleB, ...reversed];
const TWO_SIDED_COMPLEX: Maker[] = [...wrongBook, ...principleCombined, ...principleOffsetting];
const EVERYTHING: Maker[] = [...ONE_SIDED, ...TWO_SIDED_SIMPLE, ...compensating, ...TWO_SIDED_COMPLEX];

// ---------------------------------------------------------------------------------------------------------------
// Wording of "when was it found"
// ---------------------------------------------------------------------------------------------------------------

const FOUND_BEFORE = 'This is found before the trial balance is prepared, so no Suspense A/c exists.';
const FOUND_AFTER_AGREED = 'This is found after the trial balance was prepared; the trial balance agreed, so no Suspense A/c was opened.';
const FOUND_AFTER_SUSPENSE = 'The trial balance did not agree and the difference was put to a Suspense A/c; this error is found afterwards.';

const foundWhen = (rng: Rng, gap: number): string => (gap !== 0 ? FOUND_AFTER_SUSPENSE : rng.pick([FOUND_BEFORE, FOUND_AFTER_AGREED]));

// ---------------------------------------------------------------------------------------------------------------
// verify helpers: re-read the answer from the figures in the prompt
// ---------------------------------------------------------------------------------------------------------------

const RUPEES = /₹\d(?:[\d,]*\d)?/g;
const amountsIn = (prompt: string): number[] =>
  (prompt.match(RUPEES) ?? []).map((s) => parseRupees(s)).filter((n): n is number => n !== null);

/** True when `target` is a whole-number combination (coefficients -k..k) of the given figures. */
function reachable(target: number, given: number[], k: number): boolean {
  let sums = new Set<number>([0]);
  for (const g of given) {
    const next = new Set<number>();
    for (const s of sums) for (let c = -k; c <= k; c++) next.add(s + c * g);
    sums = next;
  }
  return sums.has(target);
}

// ---------------------------------------------------------------------------------------------------------------
// A second, independent reading of every scenario, used only by `verify`.
//
// Each line below states, from the wording of the sentence alone, what the error does to the trial balance (debit
// total minus credit total) and to the profit shown by the books (positive: overstated). Nothing here looks at `done`
// or `should`, so a scenario whose postings were modelled wrongly disagrees with its line and the question is refused.
// A new scenario needs a line here before any generator will serve it.
// In a pattern, # stands for an amount and ~ for any run of words inside one sentence.
// ---------------------------------------------------------------------------------------------------------------

type Reading = (a: number[]) => number;
interface Reader {
  re: RegExp;
  tb: Reading;
  profit: Reading;
}
const times =
  (n: number): Reading =>
  (a) =>
    n * a[0];
const NIL: Reading = () => 0;
const both: Reading = (a) => a[0] + a[1];
const reader = (pattern: string, tb: Reading, profit: Reading): Reader => ({
  re: new RegExp(
    pattern
      .replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
      .replace(/#/g, '(₹[\\d,]+)')
      .replace(/~/g, '[^.;]*?'),
  ),
  tb,
  profit,
});

const READERS: Reader[] = [
  // One posting left out: the side it belongs to is short. Profit moves only if the missing posting is an income or expense.
  reader('credit sale of # to ~ was entered in the Sales Book and posted to Sales A/c, but was not posted to', times(-1), NIL),
  reader('credit sale of # to ~ account, but the amount was never posted to Sales A/c', times(1), times(-1)),
  reader('credit purchase of # from ~ was posted to Purchases A/c, but was not posted to', times(1), NIL),
  reader('credit purchase of # from ~ account, but the amount was never posted to Purchases A/c', times(-1), times(1)),
  reader('# paid ~ was entered in the ~ column of the cash book, but was not posted to', times(-1), times(1)),
  reader('# received in cash from ~, a customer, was entered in the Cash Book but was not posted to', times(1), NIL),
  reader('# paid in cash to ~, a supplier, was entered in the Cash Book but was not posted to', times(-1), NIL),
  reader('Commission of # received in cash was entered in the Cash Book but was not posted to', times(1), times(-1)),
  // One account posted with the second figure in place of the first.
  reader('Goods worth # were bought on credit from ~. The Purchases Book is right, but ~ account was credited with #.', (a) => a[0] - a[1], NIL),
  reader('Goods worth # were sold on credit to ~. The Sales Book is right, but ~ account was debited with #.', (a) => a[1] - a[0], NIL),
  reader('# was paid in cash as ~. The Cash Book is right, but ~ A/c was debited with #.', (a) => a[1] - a[0], (a) => a[0] - a[1]),
  reader('# was received in cash from ~, a customer. The Cash Book is right, but ~ account was credited with #.', (a) => a[0] - a[1], NIL),
  reader('Goods worth # were returned to ~, a supplier. The Purchases Return Book is right, but ~ account was debited with #.', (a) => a[1] - a[0], NIL),
  // One account posted on the wrong side: twice the amount.
  reader('Rent of # paid in cash was entered correctly in the Cash Book, but was posted to the credit of Rent A/c', times(-2), times(2)),
  reader('# received in cash from ~, a customer, was entered correctly in the Cash Book, but was posted to the debit of', times(2), NIL),
  reader('cash sale of # was entered correctly in the Cash Book, but was posted to the debit of Sales A/c', times(2), times(-2)),
  reader('Goods worth # bought on credit from ~ were posted correctly to Purchases A/c, but ~ account was debited instead of credited', times(2), NIL),
  reader('# paid in cash to ~, a supplier, was entered correctly in the Cash Book, but was posted to the credit of', times(-2), NIL),
  reader('Goods worth # sold on credit to ~ were posted correctly to Sales A/c, but ~ account was credited instead of debited', times(-2), NIL),
  // A wrong total in one book or account.
  reader('The Sales Book was overcast by #, and', times(-1), times(1)),
  reader('The Sales Book was undercast by #, and', times(1), times(-1)),
  reader('The Purchases Book was overcast by #, and', times(1), times(-1)),
  reader('The Purchases Book was undercast by #, and', times(-1), times(1)),
  reader('The Purchases Return Book was overcast by #, and', times(-1), times(1)),
  reader('The Sales Return Book was overcast by #, and', times(1), times(-1)),
  reader('The debit side of ~ A/c was added up # too high', times(1), times(-1)),
  reader('The receipts side of the Cash Book was overcast by #', times(1), NIL),
  // Wrong account of the same kind, or the wrong person: the totals and the profit are untouched.
  reader('Rent of # paid ~ was debited to Salaries A/c', NIL, NIL),
  reader('Wages of # paid ~ to factory workers were debited to Salaries A/c', NIL, NIL),
  reader('Repairs to a shop shutter, #, paid ~, were debited to Wages A/c', NIL, NIL),
  reader('Postage stamps costing # bought ~ were debited to Stationery A/c', NIL, NIL),
  reader('Advertisement charges of # paid ~ were debited to Insurance A/c', NIL, NIL),
  reader('An electricity bill of # paid ~ was debited to Telephone A/c', NIL, NIL),
  reader('Interest of # paid on a loan ~ was debited to Commission Paid A/c', NIL, NIL),
  reader('Interest of # received ~ on an investment was credited to Commission Received A/c', NIL, NIL),
  reader('Commission of # received ~ was credited to Rent Received A/c', NIL, NIL),
  reader('# ~ account by mistake.', NIL, NIL),
  // A transaction left out of every book: the totals agree; profit moves if an income or expense is missing.
  reader('A credit purchase of goods worth # from ~ was not entered in any book', NIL, times(1)),
  reader('A credit sale of goods worth # to ~ was left out of the books altogether', NIL, times(-1)),
  reader('# paid ~ was not recorded in any book', NIL, times(1)),
  reader('# received ~ from ~, a customer, was not entered in any book', NIL, NIL),
  reader('# paid by cheque to ~, a supplier, was not entered in any book', NIL, NIL),
  reader('Goods worth # returned by ~, a customer, were not recorded in any book', NIL, times(1)),
  reader('Goods worth # returned to ~, a supplier, were not recorded in any book', NIL, times(-1)),
  reader('Commission of # received ~ was not recorded in any book', NIL, times(-1)),
  reader('The owner took goods costing # for personal use and no entry was made', NIL, times(-1)),
  // Errors of principle: an asset or a personal item charged as an expense understates profit; the reverse overstates it.
  reader('bought for # ~ was debited to Purchases A/c.', NIL, times(-1)),
  reader('bought on credit from ~ for # was debited to Purchases A/c.', NIL, times(-1)),
  reader('Repairs to ~ costing #, paid ~, were debited to ~ A/c.', NIL, times(1)),
  reader('Wages of # paid ~ for installing a new machine were debited to Wages A/c', NIL, times(-1)),
  reader(', #, was paid by the firm ~ and debited to', NIL, times(-1)),
  reader('Old furniture was sold for # in cash, which was its book value, and the amount was credited to Sales A/c', NIL, times(1)),
  reader('Capital of # brought into the business by the owner ~ was credited to Sales A/c', NIL, times(1)),
  reader('A bank loan of #, received into the business bank account, was credited to Miscellaneous Income A/c', NIL, times(1)),
  reader('bought on credit from ~ for # was debited to Purchases A/c, and # paid in cash for installing it was debited to Wages A/c', NIL, (a) => -both(a)),
  reader('A machine bought for #, paid ~, was debited to Repairs A/c, and # paid ~ as carriage on it was debited to Carriage Inwards A/c', NIL, (a) => -both(a)),
  reader('Materials costing #, bought on credit from ~ to build a new godown, were debited to Purchases A/c, and wages of # paid', NIL, (a) => -both(a)),
  reader('Repairs to machinery of # were debited to Machinery A/c, and a new machine bought for # was debited to Repairs A/c', NIL, (a) => a[0] - a[1]),
  // Two errors that cancel in the trial balance and in the profit.
  reader('side of ~ A/c was overcast by # and the ~ side of ~ A/c was undercast by the same amount', NIL, NIL),
  reader('The Sales Book and the Purchases Book were both overcast by #', NIL, NIL),
  reader('was debited # too much and the account of ~, also a customer, was debited # too little', NIL, NIL),
  // An entry the wrong way round: balanced, but an income or expense on the wrong side moves profit by twice the amount.
  reader('Goods bought for #, paid ~, were recorded by debiting ~ A/c and crediting Purchases A/c', NIL, times(2)),
  reader('A credit sale of # to ~ was recorded by debiting Sales A/c and crediting', NIL, times(-2)),
  reader('# paid in cash to ~, a supplier, was recorded by debiting Cash A/c and crediting', NIL, NIL),
  reader('# paid in cash as ~ was recorded by debiting Cash A/c and crediting', NIL, times(2)),
  reader('# received in cash from ~, a customer, was recorded by debiting ~ account and crediting Cash A/c', NIL, NIL),
  // The wrong book of original entry: balanced, but two trading items are each wrong by the amount, the same way.
  reader('A credit sale of # to ~ was entered in the Purchases Book instead of the Sales Book', NIL, times(-2)),
  reader('A credit purchase of goods worth # from ~ was entered in the Sales Book instead of the Purchases Book', NIL, times(2)),
  reader('Goods worth # returned by ~, a customer, were entered in the Purchases Return Book instead of the Sales Return Book', NIL, times(2)),
  reader('Goods worth # returned to ~, a supplier, were entered in the Sales Return Book instead of the Purchases Return Book', NIL, times(-2)),
];

interface Read {
  /** Debit total minus credit total of the trial balance. */
  tb: number;
  /** Profit shown minus correct profit. */
  profit: number;
}

/** Reads the one scenario in a piece of text; null unless exactly one line of READERS fits it. */
function read(text: string): Read | null {
  let out: Read | null = null;
  for (const r of READERS) {
    const m = r.re.exec(text);
    if (!m) continue;
    if (out !== null) return null;
    const a = m.slice(1).map((s) => parseRupees(s));
    if (a.some((n) => n === null)) return null;
    out = { tb: r.tb(a as number[]), profit: r.profit(a as number[]) };
  }
  return out;
}

/** Reads the numbered errors of a prompt, "(i) ... (ii) ... (iii) ...": null unless there are `n` and each is understood. */
function readItems(prompt: string, n: number): Read[] | null {
  const parts = prompt.split(/\((?:i|ii|iii)\) /).slice(1);
  if (parts.length !== n) return null;
  const out: Read[] = [];
  for (const part of parts) {
    const r = read(part);
    if (r === null) return null;
    out.push(r);
  }
  return out;
}

const sumOf = (rs: Read[], key: keyof Read): number => rs.reduce((s, r) => s + r[key], 0);

/** A debit excess in the trial balance sits in Suspense A/c as a credit, so the entry that clears it debits Suspense A/c. */
const clearsSuspense = (q: JournalQuestion, tb: number): boolean => {
  const lines = q.expected.filter((l) => l.accountId === 'suspense');
  if (tb === 0) return lines.length === 0;
  return lines.length === 1 && lines[0].amount === Math.abs(tb) && lines[0].side === (tb > 0 ? 'Dr' : 'Cr');
};

const balancedFromPrompt = (q: JournalQuestion): boolean => {
  const given = amountsIn(q.prompt);
  const side = (s: Side) => q.expected.filter((l) => l.side === s).reduce((sum, l) => sum + l.amount, 0);
  return side('Dr') === side('Cr') && q.expected.every((l) => reachable(l.amount, given, 2));
};

/** What passing the entry does to the profit: a credit to an income or expense account raises it, a debit lowers it. */
const profitMovedBy = (q: JournalQuestion): number =>
  q.expected.reduce((s, l) => {
    const type = resolveAccount(l.accountId).type;
    return type === 'income' || type === 'expense' ? s + (l.side === 'Cr' ? l.amount : -l.amount) : s;
  }, 0);

/**
 * A rectifying entry is right only if it clears exactly the difference the error put into Suspense A/c (none for an
 * error that left the trial balance in agreement) and takes back exactly the misstatement of profit the error caused.
 */
const rectifies = (q: JournalQuestion, tb: number, profit: number): boolean =>
  clearsSuspense(q, tb) && profitMovedBy(q) === -profit && balancedFromPrompt(q);

function verifyEntry(suspense: 'never' | 'always') {
  return (q: JournalQuestion): boolean => {
    const r = read(q.prompt);
    if (r === null || (r.tb !== 0) !== (suspense === 'always')) return false;
    return rectifies(q, r.tb, r.profit);
  };
}

const correctText = (q: McqQuestion): string => q.options.find((o) => o.id === q.correct)?.text ?? '';

/** The names under which income and expense accounts are printed in an entry: everything else is a balance sheet account. */
const NOMINAL_NAMES = new Set(CLASS11_ACCOUNTS.filter((a) => a.type === 'income' || a.type === 'expense').map((a) => `${a.name} A/c`));

/**
 * An entry printed as "X A/c Dr ₹a; Y A/c Cr ₹b", checked like a journal answer for an error that left the trial
 * balance in agreement: it balances, leaves Suspense A/c alone and takes back exactly the misstatement of profit.
 */
function printedEntryRectifies(text: string, r: Read): boolean {
  let debits = 0;
  let credits = 0;
  let profit = 0;
  for (const part of text.split('; ')) {
    const m = /^(.+ A\/c) (Dr|Cr) (₹[\d,]+)$/.exec(part);
    const amt = m ? parseRupees(m[3]) : null;
    if (!m || amt === null || m[1] === 'Suspense A/c') return false;
    if (m[2] === 'Dr') debits += amt;
    else credits += amt;
    if (NOMINAL_NAMES.has(m[1])) profit += m[2] === 'Cr' ? amt : -amt;
  }
  return r.tb === 0 && debits > 0 && debits === credits && profit === -r.profit;
}

const ENTRY_HINTS = [
  'Work out what was recorded and what should have been recorded. Which accounts are wrong, and on which side?',
  'Undo the wrong effect and post the right one. If only one account was wrong, the other side of the entry is Suspense A/c; if two accounts were wrong by equal and opposite amounts, no Suspense A/c is needed.',
];

// ---------------------------------------------------------------------------------------------------------------
// Journal generators: the rectifying entry
// ---------------------------------------------------------------------------------------------------------------

/**
 * `worked` is given for the errors whose correction is not a figure of the sentence (twice the amount, or the
 * difference between two figures): `computed` then leaves that amount for the student to work out, so the prompt
 * neither states it nor says how much was put to Suspense A/c, which is the same figure.
 */
function rectifyTemplate(
  id: string,
  conceptId: string,
  difficulty: Difficulty,
  makers: Maker[],
  suspense: 'never' | 'always',
  { hints = ENTRY_HINTS, ...worked }: { computed?: boolean; version?: number; hints?: string[] } = {},
) {
  return journalTemplate({
    id,
    topicId: T,
    conceptId,
    difficulty,
    ...worked,
    generate: (rng) => {
      const c = rng.pick(makers)(rng);
      if (c === null) return null;
      const gap = tbNet(c);
      if ((gap !== 0) !== (suspense === 'always')) return null;
      const lines = rectifyingEntry(c);
      // What the student works out must not happen to be a figure of the sentence (₹3,000 posted as ₹1,500 is corrected by ₹1,500).
      if (worked.computed && lines.some((l) => amountsIn(c.text).includes(l.amount))) return null;
      const used = new Set(lines.map((l) => l.accountId));
      const distractorAccounts = [...accountsOf(c), 'suspense'].filter((a) => !used.has(a));
      // An entry written the wrong way round is corrected for twice its amount, which is none of the figures in the
      // sentence. It could also be put right by two entries, so the question asks for a single one.
      const single = gap === 0 && !lines.some((l) => c.text.includes(f(l.amount)));
      const found =
        gap === 0
          ? foundWhen(rng, gap)
          : worked.computed
            ? FOUND_AFTER_SUSPENSE
            : `The trial balance did not agree: a difference of ${f(Math.abs(gap))} was put to a Suspense A/c, and this error is found afterwards.`;
      return {
        prompt: `${c.text} ${found} Pass ${single ? 'a single rectifying journal entry.' : 'the rectifying journal entry.'}`,
        lines,
        explanation: explainCase(c),
        distractorAccounts,
        hints,
      };
    },
    verify: verifyEntry(suspense),
  });
}

const rectWrongExpense = rectifyTemplate('roe-wrong-expense', 'roe-two-sided', 'easy', wrongExpense, 'never');
const rectWrongParty = rectifyTemplate('roe-wrong-party', 'roe-two-sided', 'easy', wrongParty, 'never');
const rectOmitted = rectifyTemplate('roe-omitted-transaction', 'roe-two-sided', 'easy', omissions, 'never');
const rectPrincipleAsset = rectifyTemplate('roe-principle-asset', 'roe-two-sided', 'easy', principleA, 'never');
const rectPrincipleOther = rectifyTemplate('roe-principle-other', 'roe-two-sided', 'medium', principleB, 'never');
const rectCompensating = rectifyTemplate('roe-compensating', 'roe-two-sided', 'medium', compensating, 'never');
const rectReversed = rectifyTemplate('roe-reversed-entry', 'roe-two-sided', 'medium', reversed, 'never', { computed: true, version: 2 });
const rectNotPosted = rectifyTemplate('roe-not-posted', 'roe-suspense', 'medium', notPosted, 'always');
const rectWrongAmount = rectifyTemplate('roe-wrong-amount-posting', 'roe-suspense', 'medium', wrongAmount, 'always', { computed: true, version: 2 });
const rectWrongSide = rectifyTemplate('roe-wrong-side-posting', 'roe-suspense', 'medium', wrongSide, 'always', { computed: true, version: 2 });
const rectCasting = rectifyTemplate('roe-book-casting', 'roe-suspense', 'easy', casting, 'always');
const rectWrongBook = rectifyTemplate('roe-wrong-book', 'roe-two-sided', 'complex', wrongBook, 'never');
const rectPrincipleCombined = rectifyTemplate('roe-principle-combined', 'roe-two-sided', 'complex', principleCombined, 'never');

/** Two one-sided errors found together: one combined entry, with the Suspense amounts netted. */
const rectTwoErrors = journalTemplate({
  id: 'roe-two-errors-combined',
  topicId: T,
  conceptId: 'roe-suspense',
  difficulty: 'complex',
  // The net amount of Suspense A/c is what the student works out, so the prompt does not say how much was put to it.
  computed: true,
  version: 2,
  generate: (rng) => {
    const pair = drawCases(rng, ONE_SIDED, 2);
    if (!pair) return null;
    const [a, b] = pair;
    if (overlap(a, b) || a.text === b.text) return null;
    const merged: Case = { text: '', kind: 'commission', done: [...a.done, ...b.done], should: [...a.should, ...b.should] };
    const lines = rectifyingEntry(merged);
    const netLine = lines.find((l) => l.accountId === 'suspense');
    if (!netLine) return null;
    // The net amount is the student's to work out: a pair whose net happens to be a figure of one of the sentences
    // (errors of ₹2,000 and ₹4,000 on opposite sides) would print the answer, so it is not asked.
    if ([a, b].some((c) => amountsIn(c.text).includes(netLine.amount))) return null;
    const used = new Set(lines.map((l) => l.accountId));
    const opposite = tbNet(a) > 0 !== tbNet(b) > 0;
    return {
      prompt: `The trial balance did not agree, and the difference was put to a Suspense A/c. Two errors, which together account for that difference, are now found. (i) ${a.text} (ii) ${b.text} Pass one combined rectifying journal entry for both, showing Suspense A/c once, for its net amount.`,
      lines,
      explanation: [
        `For (i): ${entryText(rectifyingEntry(a))}.`,
        `For (ii): ${entryText(rectifyingEntry(b))}.`,
        opposite
          ? `Combine them. Suspense A/c is debited in one entry and credited in the other, so only the difference between the two amounts is shown: ${entryText(lines)}.`
          : `Combine them. Suspense A/c is on the same side in both entries, so the two amounts are added: ${entryText(lines)}.`,
        'The Suspense A/c line equals the difference that was put to it, so the account is closed.',
      ],
      distractorAccounts: [...accountsOf(merged), 'purchases', 'sales'].filter((x) => !used.has(x)),
      hints: ENTRY_HINTS,
    };
  },
  verify: (q) => {
    const items = readItems(q.prompt, 2);
    if (items === null || items.some((r) => r.tb === 0)) return false;
    const net = sumOf(items, 'tb');
    // The two errors are the whole of the difference, so the entry has to clear what they did to the totals between them.
    // The net amount is worked out, so it is not among the figures on the page.
    if (net === 0 || amountsIn(q.prompt).includes(Math.abs(net))) return false;
    return q.prompt.includes('which together account for that difference') && rectifies(q, net, sumOf(items, 'profit'));
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Numeric generators
// ---------------------------------------------------------------------------------------------------------------

/** Drop figures that are not positive, and the answer itself; the engine also drops duplicates. */
function errs(answer: number, list: { value: number; why: string }[]): { value: number; why: string }[] {
  const seen = new Set<number>([answer]);
  return list.filter((e) => Number.isSafeInteger(e.value) && e.value > 0 && !seen.has(e.value) && seen.add(e.value));
}

const GENERIC_DIFF_SLIPS = (d: number) => [
  { value: 2 * d, why: 'Doubled the difference, as if the error had upset both columns of the trial balance by the full amount.' },
  { value: d / 2, why: 'Halved the difference, as if it were shared between the two columns.' },
];

const sideWord = (gap: number): string => (gap > 0 ? 'debit' : 'credit');

const tbDifference = numericTemplate({
  id: 'roe-tb-difference',
  topicId: T,
  conceptId: 'roe-tb-effect',
  difficulty: 'easy',
  unit: 'rupees',
  generate: (rng) => {
    const c = rng.pick(ONE_SIDED)(rng);
    if (c === null) return null;
    const gap = tbNet(c);
    const d = Math.abs(gap);
    return {
      prompt: `${c.text} Considering this error alone, by what amount will the two totals of the trial balance differ?`,
      answer: d,
      commonErrors: errs(d, [...(c.slips ?? []), ...GENERIC_DIFF_SLIPS(d)]),
      explanation: [...effectLines(c), `The totals differ by ${f(d)}, and the ${sideWord(gap)} side is the larger.`],
    };
  },
  verify: (q) => {
    const r = read(q.prompt);
    return r !== null && r.tb !== 0 && q.answer === Math.abs(r.tb);
  },
});

const suspenseOpening = numericTemplate({
  id: 'roe-suspense-opening',
  topicId: T,
  conceptId: 'roe-suspense',
  difficulty: 'easy',
  unit: 'rupees',
  generate: (rng) => {
    const big = money(rng, 100000, 900000, 500);
    const d = money(rng, 500, 20000, 500);
    const small = big - d;
    const debitBig = rng.pick([true, false]);
    const [D, C] = debitBig ? [big, small] : [small, big];
    switch (rng.pick(['difference', 'missing', 'agreed'] as const)) {
      case 'difference':
        return {
          prompt: `The debit column of a trial balance adds up to ${f(D)} and the credit column to ${f(C)}. What amount has to be entered in Suspense A/c to make the two columns agree?`,
          answer: d,
          commonErrors: [
            { value: D + C, why: 'Added the two totals instead of finding their difference.' },
            { value: big, why: 'Gave the larger total instead of the difference between the totals.' },
            { value: small, why: 'Gave the smaller total instead of the difference between the totals.' },
          ],
          explanation: [`Difference = ${f(big)} - ${f(small)} = ${f(d)}.`, `It is entered on the ${debitBig ? 'credit' : 'debit'} side, the side that is short.`],
        };
      case 'missing':
        return {
          prompt: `The ${debitBig ? 'debit' : 'credit'} column of a trial balance adds up to ${f(big)}. To make the columns agree, ${f(d)} was entered in Suspense A/c on the ${debitBig ? 'credit' : 'debit'} side. What did the ${debitBig ? 'credit' : 'debit'} column add up to before Suspense A/c was entered?`,
          answer: small,
          commonErrors: [
            { value: big + d, why: 'Added the Suspense amount to the larger total instead of deducting it.' },
            { value: d, why: 'Gave the Suspense amount itself, not the column total it was added to.' },
          ],
          explanation: [
            `The Suspense amount fills the gap, so the short column was smaller than the other by ${f(d)}.`,
            `${f(big)} - ${f(d)} = ${f(small)}.`,
          ],
        };
      default:
        return {
          prompt: `The debit column of a trial balance adds up to ${f(D)} and the credit column to ${f(C)}. The difference is entered in Suspense A/c. What will each column add up to after that?`,
          answer: big,
          commonErrors: [
            { value: D + C, why: 'Added the two totals; each column ends at the larger total, not at their sum.' },
            { value: small, why: 'Took the smaller total, forgetting that Suspense A/c is added to the short column to match the larger one.' },
            { value: d, why: 'Gave the Suspense amount instead of the column total after it is added.' },
          ],
          explanation: [`Suspense A/c is added to the short side so that it equals the larger side.`, `Each column adds up to ${f(big)}.`],
        };
    }
  },
  verify: (q) => {
    // Worked again from the two figures in the question, according to what it asks for.
    const g = amountsIn(q.prompt);
    if (g.length !== 2 || q.answer <= 0) return false;
    if (q.prompt.includes('before Suspense A/c was entered')) return q.answer === g[0] - g[1];
    if (q.prompt.includes('What will each column add up to')) return q.answer === Math.max(g[0], g[1]);
    return q.prompt.includes('What amount has to be entered in Suspense A/c') && q.answer === Math.abs(g[0] - g[1]);
  },
});

const DEBIT_ITEMS = ['Cash', 'Purchases', 'Rent', 'Debtors', 'Furniture', 'Wages', 'Salaries', 'Machinery'];
const CREDIT_ITEMS = ['Capital', 'Sales', 'Creditors', 'Bank Loan', 'Commission Received'];

const suspenseFromBalances = numericTemplate({
  id: 'roe-suspense-from-balances',
  topicId: T,
  conceptId: 'roe-suspense',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const debits = pickDistinct(rng, DEBIT_ITEMS, 4);
    const credits = pickDistinct(rng, CREDIT_ITEMS, 3);
    const c = [money(rng, 10000, 300000, 1000), money(rng, 10000, 300000, 1000), money(rng, 10000, 300000, 1000)];
    const dFirst = [money(rng, 5000, 150000, 1000), money(rng, 5000, 150000, 1000), money(rng, 5000, 150000, 1000)];
    const d = money(rng, 500, 9000, 500);
    const sd = rng.pick([1, -1]) * d;
    const last = c[0] + c[1] + c[2] - (dFirst[0] + dFirst[1] + dFirst[2]) + sd;
    if (last < 100000) return null;
    const dAll = [...dFirst, last];
    const list = (names: string[], vals: number[]) => names.map((n, i) => `${n} ${f(vals[i])}`).join(', ');
    const sumC = c[0] + c[1] + c[2];
    const commonErrors = errs(d, [
      { value: sumC + dAll.reduce((s, v) => s + v, 0), why: 'Added all the balances together instead of comparing the debit total with the credit total.' },
      { value: Math.abs(dAll.reduce((s, v) => s + v, 0) - (sumC - c[2])), why: 'Left the last credit balance out when adding the credit column.' },
      { value: Math.abs(dFirst.reduce((s, v) => s + v, 0) - sumC), why: 'Left the last debit balance out when adding the debit column.' },
    ]);
    if (commonErrors.length < 2) return null;
    return {
      prompt: `The trial balance of ${firmOf(rng)} has these debit balances: ${list(debits, dAll)}. Its credit balances are: ${list(credits, c)}. The two columns do not agree. What is the amount of the difference that has to be entered in Suspense A/c?`,
      answer: d,
      commonErrors,
      explanation: [
        `Debit column = ${dAll.map(f).join(' + ')} = ${f(dAll.reduce((s, v) => s + v, 0))}.`,
        `Credit column = ${c.map(f).join(' + ')} = ${f(sumC)}.`,
        `Difference = ${f(d)}; the ${sd > 0 ? 'debit' : 'credit'} column is larger, so Suspense A/c goes on the ${sd > 0 ? 'credit' : 'debit'} side.`,
      ],
    };
  },
  verify: (q) => {
    const g = amountsIn(q.prompt);
    if (g.length !== 7) return false;
    const dSum = g.slice(0, 4).reduce((s, v) => s + v, 0);
    const cSum = g.slice(4).reduce((s, v) => s + v, 0);
    return Math.abs(dSum - cSum) === q.answer;
  },
});

/** How a debtor or creditor balance is corrected by something not posted or posted wrongly. */
const correctedBalance = numericTemplate({
  id: 'roe-corrected-balance',
  topicId: T,
  conceptId: 'roe-before-tb',
  difficulty: 'easy',
  unit: 'rupees',
  generate: (rng) => {
    const [p] = who(rng, 1);
    const b = money(rng, 20000, 100000, 1000);
    const x = money(rng, 1000, 15000, 500);
    if (b === 2 * x) return null; // x would then equal b - x, which is one of the answers a learner could give by mistake
    switch (rng.pick(['sale', 'receipt', 'purchase', 'payment'] as const)) {
      case 'sale':
        return {
          prompt: `Before the trial balance was prepared, ${p}'s account in the ledger showed a debit balance of ${f(b)}. It was then found that a credit sale of ${f(x)} to ${p} had not been posted to the account. What is the correct balance?`,
          answer: b + x,
          commonErrors: [
            { value: b - x, why: 'Deducted the sale; a sale on credit increases what the customer owes.' },
            { value: x, why: 'Gave the unposted sale alone instead of adding it to the balance.' },
          ],
          explanation: ['A credit sale is debited to the customer.', `${f(b)} + ${f(x)} = ${f(b + x)} debit.`],
        };
      case 'receipt':
        return {
          prompt: `Before the trial balance was prepared, ${p}'s account in the ledger showed a debit balance of ${f(b)}. It was then found that ${f(x)} received from ${p} had been entered in the Cash Book but not posted to the account. What is the correct balance?`,
          answer: b - x,
          commonErrors: [
            { value: b + x, why: 'Added the receipt; money received from a customer reduces what the customer owes.' },
            { value: x, why: 'Gave the unposted receipt alone instead of deducting it from the balance.' },
          ],
          explanation: ['Cash received is credited to the customer.', `${f(b)} - ${f(x)} = ${f(b - x)} debit.`],
        };
      case 'purchase':
        return {
          prompt: `Before the trial balance was prepared, ${p}'s account in the ledger showed a credit balance of ${f(b)}. It was then found that a credit purchase of ${f(x)} from ${p} had not been posted to the account. What is the correct balance?`,
          answer: b + x,
          commonErrors: [
            { value: b - x, why: 'Deducted the purchase; a purchase on credit increases what is owed to the supplier.' },
            { value: x, why: 'Gave the unposted purchase alone instead of adding it to the balance.' },
          ],
          explanation: ['A credit purchase is credited to the supplier.', `${f(b)} + ${f(x)} = ${f(b + x)} credit.`],
        };
      default:
        return {
          prompt: `Before the trial balance was prepared, ${p}'s account in the ledger showed a credit balance of ${f(b)}. It was then found that ${f(x)} paid to ${p} had been entered in the Cash Book but not posted to the account. What is the correct balance?`,
          answer: b - x,
          commonErrors: [
            { value: b + x, why: 'Added the payment; money paid to a supplier reduces what is owed to the supplier.' },
            { value: x, why: 'Gave the unposted payment alone instead of deducting it from the balance.' },
          ],
          explanation: ['Cash paid is debited to the supplier.', `${f(b)} - ${f(x)} = ${f(b - x)} credit.`],
        };
    }
  },
  verify: (q) => {
    // A sale adds to what a customer owes and a receipt reduces it; a purchase adds to what a supplier is owed and a payment reduces it.
    const g = amountsIn(q.prompt);
    const kind = /a credit sale of/.test(q.prompt) ? 'sale' : /a credit purchase of/.test(q.prompt) ? 'purchase' : /received from/.test(q.prompt) ? 'receipt' : /paid to/.test(q.prompt) ? 'payment' : null;
    const customer = q.prompt.includes('a debit balance of');
    if (g.length !== 2 || kind === null || customer !== (kind === 'sale' || kind === 'receipt')) return false;
    return q.answer === (kind === 'sale' || kind === 'purchase' ? g[0] + g[1] : g[0] - g[1]);
  },
});

const correctedBalanceSide = numericTemplate({
  id: 'roe-corrected-balance-side',
  topicId: T,
  conceptId: 'roe-before-tb',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const [p] = who(rng, 1);
    const x = money(rng, 1000, 15000, 500);
    const b = money(rng, 40000, 120000, 1000);
    switch (rng.pick(['receipt', 'payment', 'sale', 'amount'] as const)) {
      case 'receipt':
        return {
          prompt: `Before the trial balance was prepared, ${p}'s account showed a debit balance of ${f(b)}. It was then found that ${f(x)} received from ${p} had been posted to the debit of the account instead of the credit. What is the correct balance?`,
          answer: b - 2 * x,
          commonErrors: [
            { value: b - x, why: 'Corrected the posting once; the wrong debit has to be removed and the right credit added, so the balance moves by twice the amount.' },
            { value: b + x, why: 'Moved the balance the wrong way, although the receipt should reduce what the customer owes.' },
          ],
          explanation: [`The receipt should have been credited. A debit of ${f(x)} was posted instead.`, `Correct balance = ${f(b)} - 2 × ${f(x)} = ${f(b - 2 * x)} debit.`],
        };
      case 'payment':
        return {
          prompt: `Before the trial balance was prepared, ${p}'s account showed a credit balance of ${f(b)}. It was then found that ${f(x)} paid to ${p} had been posted to the credit of the account instead of the debit. What is the correct balance?`,
          answer: b - 2 * x,
          commonErrors: [
            { value: b - x, why: 'Corrected the posting once; the wrong credit has to be removed and the right debit added, so the balance moves by twice the amount.' },
            { value: b + x, why: 'Moved the balance the wrong way, although the payment should reduce what is owed to the supplier.' },
          ],
          explanation: [`The payment should have been debited. A credit of ${f(x)} was posted instead.`, `Correct balance = ${f(b)} - 2 × ${f(x)} = ${f(b - 2 * x)} credit.`],
        };
      case 'sale':
        return {
          prompt: `Before the trial balance was prepared, ${p}'s account showed a debit balance of ${f(b)}. It was then found that a credit sale of ${f(x)} to ${p} had been posted to the credit of the account instead of the debit. What is the correct balance?`,
          answer: b + 2 * x,
          commonErrors: [
            { value: b + x, why: 'Corrected the posting once; the wrong credit has to be removed and the right debit added, so the balance moves by twice the amount.' },
            { value: b - x, why: 'Moved the balance the wrong way, although a sale increases what the customer owes.' },
          ],
          explanation: [`The sale should have been debited. A credit of ${f(x)} was posted instead.`, `Correct balance = ${f(b)} + 2 × ${f(x)} = ${f(b + 2 * x)} debit.`],
        };
      default: {
        const w = wrongPair(rng);
        if (!w) return null;
        const [t, wrong] = w;
        return {
          prompt: `Before the trial balance was prepared, ${p}'s account showed a debit balance of ${f(b)}. It was then found that a credit sale of ${f(t)} to ${p} had been posted to the account as ${f(wrong)}. What is the correct balance?`,
          answer: b - wrong + t,
          commonErrors: [
            { value: b + t, why: 'Added the correct sale without first removing the wrong figure that had been posted.' },
            { value: b - wrong, why: 'Removed the wrong figure but forgot to post the correct one.' },
            { value: b + wrong - t, why: 'Moved the balance the wrong way: the difference was applied in the opposite direction.' },
          ],
          explanation: [`Remove the wrong figure and post the right one: ${f(b)} - ${f(wrong)} + ${f(t)} = ${f(b - wrong + t)} debit.`],
        };
      }
    }
  },
  verify: (q) => {
    const g = amountsIn(q.prompt);
    // A wrong figure: take it out and put the right one in.
    if (q.prompt.includes('had been posted to the account as')) return g.length === 3 && q.answer === g[0] - g[2] + g[1];
    // A wrong side: a posting sitting on the side of the balance has to leave it and go to the other side, which lowers
    // the balance by twice the amount; a posting sitting on the other side raises it by twice the amount.
    const m = /a (debit|credit) balance of .* had been posted to the (debit|credit) of the account instead of the (debit|credit)\./.exec(q.prompt);
    if (m === null || g.length !== 2 || m[2] === m[3]) return false;
    return q.answer === (m[1] === m[2] ? g[0] - 2 * g[1] : g[0] + 2 * g[1]);
  },
});

/** The largest single figure in a scenario: the amount of the transaction. */
const biggest = (c: Case): number => Math.max(...[...c.done, ...c.should].map((p) => p.amount));

/** The income and expense accounts an error leaves wrong, with the amount by which each one's balance is too high (+) or too low (-). */
function wrongNominal(c: Case): { account: string; excess: number }[] {
  const net = new Map<string, number>();
  const add = (p: Post, sign: number) => {
    const type = resolveAccount(p.account).type;
    if (type === 'income' || type === 'expense') net.set(p.account, (net.get(p.account) ?? 0) + sign * signed(p));
  };
  c.done.forEach((p) => add(p, 1));
  c.should.forEach((p) => add(p, -1));
  // `signed` is debit-positive: a debit excess is "too high" for an account that normally has a debit balance.
  return [...net]
    .filter(([, v]) => v !== 0)
    .map(([account, v]) => ({ account, excess: normalSide(resolveAccount(account)) === 'Dr' ? v : -v }));
}

/** One sentence naming the income or expense that is wrong, as the working of a profit question needs it. */
const profitReason = (c: Case): string =>
  `${wrongNominal(c)
    .map((w) => `${accountName(w.account)} is ${f(Math.abs(w.excess))} too ${w.excess > 0 ? 'high' : 'low'}`)
    .join(' and ')}.`;

const PROFIT_MAKERS: Maker[] = [...principleA, ...principleB, ...casting, ...notPosted, ...omissions, ...reversed, ...wrongSide];

/** A scenario that changes profit, drawn from makers until one does. */
function profitCase(rng: Rng, makers: readonly Maker[]): Case | null {
  for (let i = 0; i < 12; i++) {
    const c = rng.pick(makers)(rng);
    if (c !== null && profitEffect(c) !== 0) return c;
  }
  return null;
}

const profitOne = numericTemplate({
  id: 'roe-profit-correct-one',
  topicId: T,
  conceptId: 'roe-profit',
  difficulty: 'medium',
  version: 2,
  unit: 'rupees',
  generate: (rng) => {
    const c = profitCase(rng, PROFIT_MAKERS);
    if (c === null) return null;
    const e = profitEffect(c);
    const profit = money(rng, 100000, 500000, 5000);
    const answer = profit - e;
    if (answer <= 0) return null;
    const commonErrors = errs(answer, [
      { value: profit + e, why: 'Moved the profit in the wrong direction: when an expense is too low or an income too high the profit shown is too high and must come down, and the other way round.' },
      { value: profit, why: 'Left the profit unchanged, thinking an error in the books does not matter to profit.' },
      { value: profit - 2 * e, why: 'Applied the correction twice, once for each account in the entry.' },
      ...(Math.abs(e) === 2 * biggest(c)
        ? [{ value: profit - e / 2, why: 'Corrected the amount once; an income or expense on the wrong side of its account moves the profit by twice the amount.' }]
        : []),
    ]);
    if (commonErrors.length < 2) return null;
    return {
      prompt: `The net profit of ${firmOf(rng)} for the year, as shown by the books, is ${f(profit)}. Later it is found that: ${c.text} The profit is to be corrected for this error only. ${IGNORE_DEPRECIATION} What is the correct net profit?`,
      answer,
      commonErrors,
      explanation: [
        ...effectLines(c).slice(0, -1),
        e > 0
          ? `Profit is overstated by ${f(e)} (expenses too low or incomes too high), so the correct profit is ${f(profit)} - ${f(e)} = ${f(answer)}.`
          : `Profit is understated by ${f(-e)} (expenses too high or incomes too low), so the correct profit is ${f(profit)} + ${f(-e)} = ${f(answer)}.`,
      ],
    };
  },
  verify: (q) => {
    // The profit shown by the books is the first figure; the error is read again from its sentence.
    const r = read(q.prompt);
    return r !== null && r.profit !== 0 && q.answer === amountsIn(q.prompt)[0] - r.profit;
  },
});

const profitMany = numericTemplate({
  id: 'roe-corrected-profit',
  topicId: T,
  conceptId: 'roe-profit',
  difficulty: 'complex',
  version: 2,
  unit: 'rupees',
  generate: (rng) => {
    const cases: Case[] = [];
    for (const maker of pickDistinct(rng, PROFIT_MAKERS, 8)) {
      const c = maker(rng);
      if (c !== null && profitEffect(c) !== 0 && cases.every((o) => !overlap(o, c))) cases.push(c);
      if (cases.length === 3) break;
    }
    if (cases.length < 3) return null;
    const effects = cases.map(profitEffect);
    const total = effects.reduce((s, v) => s + v, 0);
    const profit = money(rng, 100000, 600000, 5000);
    const answer = profit - total;
    if (total === 0 || answer <= 0) return null;
    const roman = ['(i)', '(ii)', '(iii)'];
    const gross = effects.reduce((s, v) => s + Math.abs(v), 0);
    const commonErrors = errs(answer, [
      { value: profit - gross, why: 'Treated every error as one that overstates profit, without checking which way each one moves it.' },
      { value: profit + gross, why: 'Treated every error as one that understates profit, without checking which way each one moves it.' },
      { value: profit, why: 'Left the profit unchanged, thinking none of these errors reaches the profit and loss account.' },
      { value: profit + total, why: 'Applied the net effect in the wrong direction.' },
    ]);
    if (commonErrors.length < 2) return null;
    return {
      prompt: `The books of ${firmOf(rng)} show a net profit of ${f(profit)}. The following errors were found afterwards. ${cases.map((c, i) => `${roman[i]} ${c.text}`).join(' ')} The profit is to be corrected for these errors only. ${IGNORE_DEPRECIATION} What is the correct net profit?`,
      answer,
      commonErrors,
      explanation: [
        ...cases.map((c, i) => `${roman[i]} ${profitReason(c)} Profit is ${effects[i] > 0 ? 'overstated' : 'understated'} by ${f(Math.abs(effects[i]))}.`),
        `Net effect: profit is ${total > 0 ? 'overstated' : 'understated'} by ${f(Math.abs(total))}.`,
        `Correct profit = ${f(profit)} ${total > 0 ? '-' : '+'} ${f(Math.abs(total))} = ${f(answer)}.`,
      ],
    };
  },
  verify: (q) => {
    // Each numbered error is read again from its own sentence, and the profit corrected for the three together.
    const items = readItems(q.prompt, 3);
    return items !== null && items.every((r) => r.profit !== 0) && q.answer === amountsIn(q.prompt)[0] - sumOf(items, 'profit');
  },
});

interface Effect {
  text: (x: string) => string;
  /** Change in the account's balance once the error is corrected, as a multiple of the amount. */
  times: number;
  /** Why the balance moves that way, for the working. */
  because: string;
}
const PURCHASES_EFFECTS: Effect[] = [
  { text: (x) => `The Purchases Book was overcast by ${x}.`, times: -1, because: 'the total posted to the debit of Purchases A/c was too high' },
  { text: (x) => `The Purchases Book was undercast by ${x}.`, times: 1, because: 'the total posted to the debit of Purchases A/c was too low' },
  { text: (x) => `A computer costing ${x} bought on credit was debited to Purchases A/c.`, times: -1, because: 'a computer is an asset, not goods bought for resale, so it comes out of Purchases A/c' },
  { text: (x) => `Goods costing ${x} taken by the owner for personal use were not recorded anywhere.`, times: -1, because: 'goods taken by the owner are credited to Purchases A/c (Drawings A/c Dr)' },
  { text: (x) => `A credit purchase of goods for ${x} was not entered in the Purchases Book at all.`, times: 1, because: 'a purchase that was left out has still to be debited' },
  { text: (x) => `Goods bought for ${x} in cash were wrongly debited to Repairs A/c.`, times: 1, because: 'the purchase is moved from Repairs A/c to the debit of Purchases A/c' },
  { text: (x) => `A credit purchase of goods for ${x} was entered in the Sales Book by mistake.`, times: 1, because: 'the purchase never reached Purchases A/c and has still to be debited' },
];
const SALES_EFFECTS: Effect[] = [
  { text: (x) => `The Sales Book was overcast by ${x}.`, times: -1, because: 'the total posted to the credit of Sales A/c was too high' },
  { text: (x) => `The Sales Book was undercast by ${x}.`, times: 1, because: 'the total posted to the credit of Sales A/c was too low' },
  { text: (x) => `A credit sale of ${x} was posted to the customer's account but not to Sales A/c.`, times: 1, because: 'the credit to Sales A/c is missing' },
  { text: (x) => `Old furniture sold at its book value for ${x} was credited to Sales A/c.`, times: -1, because: 'the sale of an asset is credited to the asset account, not to Sales A/c' },
  { text: (x) => `A cash sale of ${x} was posted to the debit of Sales A/c instead of the credit.`, times: 2, because: 'the wrong debit is removed and the right credit added, which is twice the amount' },
  { text: (x) => `Capital of ${x} brought in by the owner was credited to Sales A/c.`, times: -1, because: 'capital brought in is credited to Capital A/c, not to Sales A/c' },
  { text: (x) => `A credit sale of ${x} was entered in the Purchases Book by mistake.`, times: 1, because: 'the sale never reached Sales A/c and has still to be credited' },
];

/**
 * A second reading of the errors above, used only by `verify`: what each sentence does to the balance of the account
 * named in the question (Purchases A/c, a debit balance, or Sales A/c, a credit balance), as a multiple of its amount.
 */
const ACCOUNT_READINGS: [RegExp, number][] = [
  [/Book was overcast by/, -1],
  [/Book was undercast by/, 1],
  [/A computer costing .* was debited to Purchases A\/c/, -1],
  [/taken by the owner for personal use were not recorded/, -1],
  [/was not entered in the Purchases Book at all/, 1],
  [/were wrongly debited to Repairs A\/c/, 1],
  [/A credit purchase of goods for .* was entered in the Sales Book by mistake/, 1],
  [/was posted to the customer's account but not to Sales A\/c/, 1],
  [/Old furniture sold at its book value for .* was credited to Sales A\/c/, -1],
  [/was posted to the debit of Sales A\/c instead of the credit/, 2],
  [/Capital of .* brought in by the owner was credited to Sales A\/c/, -1],
  [/A credit sale of .* was entered in the Purchases Book by mistake/, 1],
];

const correctedAccount = numericTemplate({
  id: 'roe-corrected-account',
  topicId: T,
  conceptId: 'roe-before-tb',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const purchases = rng.pick([true, false]);
    const bank = purchases ? PURCHASES_EFFECTS : SALES_EFFECTS;
    const [e1, e2] = pickDistinct(rng, bank, 2);
    const x1 = money(rng, 1000, 20000, 1000);
    const x2 = money(rng, 1000, 20000, 1000);
    const d1 = e1.times * x1;
    const d2 = e2.times * x2;
    const balance = money(rng, 100000, 600000, 5000);
    const answer = balance + d1 + d2;
    if (d1 + d2 === 0) return null; // the two corrections would cancel and leave the balance as it was
    const name = purchases ? 'Purchases' : 'Sales';
    return {
      prompt: `${name} A/c in the ledger of ${firmOf(rng)} shows a ${purchases ? 'debit' : 'credit'} balance of ${f(balance)}. These errors were found before the trial balance was prepared. (i) ${e1.text(f(x1))} (ii) ${e2.text(f(x2))} What is the correct balance of ${name} A/c?`,
      answer,
      commonErrors: errs(answer, [
        { value: balance + d1, why: 'Corrected the first error only and missed the second.' },
        { value: balance + d2, why: 'Corrected the second error only and missed the first.' },
        { value: balance - d1 - d2, why: 'Moved the balance in the opposite direction for both errors.' },
        ...(Math.abs(e1.times) === 2 || Math.abs(e2.times) === 2
          ? [
              {
                value: balance + (Math.abs(e1.times) === 2 ? d1 / 2 : d1) + (Math.abs(e2.times) === 2 ? d2 / 2 : d2),
                why: 'Corrected the wrong-side posting once; the wrong debit has to be removed and the right credit added, so the balance moves by twice the amount.',
              },
            ]
          : []),
      ]),
      explanation: [
        `(i) ${name} A/c ${d1 > 0 ? '+' : '-'}${f(Math.abs(d1))}: ${e1.because}.`,
        `(ii) ${name} A/c ${d2 > 0 ? '+' : '-'}${f(Math.abs(d2))}: ${e2.because}.`,
        `Correct balance = ${f(balance)} ${d1 > 0 ? '+' : '-'} ${f(Math.abs(d1))} ${d2 > 0 ? '+' : '-'} ${f(Math.abs(d2))} = ${f(answer)}.`,
      ],
    };
  },
  verify: (q) => {
    // Each numbered error is read again from its own sentence, and the balance (the first figure) is moved by each.
    const parts = q.prompt.split(/\((?:i|ii)\) /).slice(1);
    if (parts.length !== 2) return false;
    let balance = amountsIn(q.prompt)[0];
    for (const part of parts) {
      const fits = ACCOUNT_READINGS.filter(([re]) => re.test(part));
      const given = amountsIn(part);
      if (fits.length !== 1 || given.length !== 1) return false;
      balance += fits[0][1] * given[0];
    }
    return q.answer > 0 && q.answer === balance;
  },
});

/** The Suspense story shared by the typed-amount and the choice question about what is left in Suspense A/c. */
interface SuspenseStory {
  found: Case[];
  /** Opening balance of Suspense A/c: positive is a debit balance. */
  opening: number;
  /** What remains after the found errors are rectified: positive is a debit balance. */
  remaining: number;
  prompt: string;
}
function suspenseStory(rng: Rng): SuspenseStory | null {
  const found = threeApart(rng, ONE_SIDED);
  if (!found) return null;
  const foundGap = found.reduce((s, c) => s + tbNet(c), 0);
  const unknown = rng.pick([1, -1]) * money(rng, 500, 5000);
  const total = foundGap + unknown; // trial balance debit total minus credit total
  // Version 2: an opening balance in whole hundreds of rupees (no ₹39,680 from a transposed ₹240).
  if (total === 0 || total % 10000 !== 0) return null;
  const opening = -total; // a debit excess in the trial balance puts Suspense A/c on the credit side
  const remaining = opening + foundGap; // each rectifying entry moves Suspense A/c by that error's own gap
  const roman = ['(i)', '(ii)', '(iii)'];
  return {
    found,
    opening,
    remaining,
    prompt: `The trial balance of ${firmOf(rng)} did not agree, and Suspense A/c was opened with a ${opening > 0 ? 'debit' : 'credit'} balance of ${f(Math.abs(opening))}. Three of the errors behind the difference were then found and rectified. ${found.map((c, i) => `${roman[i]} ${c.text}`).join(' ')} Other errors, not yet found, make up the rest of the difference.`,
  };
}

/** Wrong balances a learner reaches, signed like `remaining` (positive: debit). */
const suspenseSlips = (s: SuspenseStory) => {
  const gaps = s.found.map(tbNet);
  const sign = s.opening > 0 ? 1 : -1;
  const open = Math.abs(s.opening);
  const all = gaps.reduce((a, g) => a + Math.abs(g), 0);
  return [
    { value: sign * (open - all), why: 'Took every correction as reducing the Suspense balance, whichever side of Suspense A/c it fell on.' },
    { value: sign * (open + all), why: 'Took every correction as adding to the Suspense balance, whichever side of Suspense A/c it fell on.' },
    { value: s.opening + gaps.slice(1).reduce((a, g) => a + g, 0), why: 'Left the first error out of the corrections.' },
  ];
};

/** The working of the Suspense A/c, error by error and then as the two sides of the account. */
function suspenseWorking(s: SuspenseStory): string[] {
  const gaps = s.found.map(tbNet);
  const debits = [...(s.opening > 0 ? [s.opening] : []), ...gaps.filter((g) => g > 0)];
  const credits = [...(s.opening < 0 ? [-s.opening] : []), ...gaps.filter((g) => g < 0).map((g) => -g)];
  const side = (items: number[]) => (items.length === 0 ? 'nil' : `${items.map(f).join(' + ')}${items.length > 1 ? ` = ${f(items.reduce((a, b) => a + b, 0))}` : ''}`);
  return [
    ...gaps.map(
      (g, i) =>
        `(${'i'.repeat(i + 1)}) The error made the ${sideWord(g)} total larger by ${f(Math.abs(g))}, so its rectifying entry ${g > 0 ? 'debits' : 'credits'} Suspense A/c with ${f(Math.abs(g))}.`,
    ),
    `Suspense A/c, with its opening balance of ${f(Math.abs(s.opening))} on the ${s.opening > 0 ? 'debit' : 'credit'} side: debit side ${side(debits)}; credit side ${side(credits)}.`,
    `Balance left: ${f(Math.abs(s.remaining))} ${s.remaining > 0 ? 'debit' : 'credit'}, which is the effect of the errors not yet found.`,
  ];
}

/** The balance left in Suspense A/c, worked out again from the wording of the prompt alone (positive: debit). */
function suspenseLeft(prompt: string): number | null {
  const m = /opened with a (debit|credit) balance of (₹[\d,]+)/.exec(prompt);
  const items = readItems(prompt, 3);
  const open = m ? parseRupees(m[2]) : null;
  if (!m || open === null || items === null || items.some((r) => r.tb === 0)) return null;
  // A rectifying entry debits Suspense A/c when the error had made the debit total larger, and credits it otherwise.
  return (m[1] === 'debit' ? open : -open) + sumOf(items, 'tb');
}

const suspenseAfter = numericTemplate({
  id: 'roe-suspense-after-errors',
  topicId: T,
  conceptId: 'roe-suspense-balance',
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const s = suspenseStory(rng);
    if (!s) return null;
    const answer = Math.abs(s.remaining);
    const commonErrors = errs(
      answer,
      suspenseSlips(s).map((e) => ({ ...e, value: Math.abs(e.value) })),
    );
    if (commonErrors.length < 2) return null;
    return {
      prompt: `${s.prompt} What amount remains in Suspense A/c? (Give the amount only.)`,
      answer,
      commonErrors,
      explanation: suspenseWorking(s),
    };
  },
  verify: (q) => {
    const left = suspenseLeft(q.prompt);
    return left !== null && left !== 0 && q.answer === Math.abs(left);
  },
});

const netDifference = numericTemplate({
  id: 'roe-net-tb-difference',
  topicId: T,
  conceptId: 'roe-tb-effect',
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    // The three must not all fall on the same side, or there is nothing to net.
    const cases = threeApart(rng, ONE_SIDED, (cs) => {
      const gs = cs.map(tbNet);
      return gs.reduce((s, g) => s + g, 0) !== 0 && gs.some((g) => g > 0) && gs.some((g) => g < 0);
    });
    if (!cases) return null;
    const gaps = cases.map(tbNet);
    const net = gaps.reduce((s, g) => s + g, 0);
    const roman = ['(i)', '(ii)', '(iii)'];
    const answer = Math.abs(net);
    const commonErrors = errs(answer, [
      { value: gaps.reduce((s, g) => s + Math.abs(g), 0), why: 'Added the three differences, ignoring that errors that fall on opposite sides partly cancel.' },
      { value: Math.max(...gaps.map(Math.abs)), why: 'Gave only the largest single difference.' },
      { value: Math.abs(gaps[0] + gaps[1]), why: 'Left the third error out of the total.' },
    ]);
    if (commonErrors.length < 2) return null;
    return {
      prompt: `Three errors, not yet corrected, were made in the books of ${firmOf(rng)}. ${cases.map((c, i) => `${roman[i]} ${c.text}`).join(' ')} Taken together, by what amount do the two totals of the trial balance differ?`,
      answer,
      commonErrors,
      explanation: [
        ...cases.map((c, i) => `${roman[i]} ${tbSentence(gaps[i]).split(', so')[0]}.`),
        `Debit excess = ${gaps.map((g) => `${g > 0 ? '+' : '-'}${f(Math.abs(g))}`).join(' ')} = ${net > 0 ? '+' : '-'}${f(answer)}.`,
        `The two totals differ by ${f(answer)}, the ${sideWord(net)} side being larger.`,
      ],
    };
  },
  verify: (q) => {
    // Each numbered error is read again from its own sentence; debit excesses and credit excesses are netted.
    const items = readItems(q.prompt, 3);
    return items !== null && items.every((r) => r.tb !== 0) && sumOf(items, 'tb') !== 0 && q.answer === Math.abs(sumOf(items, 'tb'));
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Multiple-choice generators
// ---------------------------------------------------------------------------------------------------------------

const CLASS_LABEL: Record<ErrorClass, string> = {
  omission: 'Error of omission',
  commission: 'Error of commission',
  principle: 'Error of principle',
  compensating: 'Compensating error',
};
const CLASS_WHY: Record<ErrorClass, Record<ErrorClass, string>> = {
  omission: {
    omission: '',
    commission: 'Took a transaction that was left out or only partly posted for one that was posted wrongly.',
    principle: 'Took it for a confusion between capital and revenue items; here something is missing from the books.',
    compensating: 'Took it for two errors that cancel out; here a posting is simply missing.',
  },
  commission: {
    commission: '',
    omission: 'Took it for a transaction that was left out; here it was recorded, but posted or added up wrongly.',
    principle: 'Took it for a breach of an accounting principle; the rule was applied correctly and the slip is in the posting, the side, the amount or the total.',
    compensating: 'Took it for two errors that cancel out; here a single slip has been made.',
  },
  principle: {
    principle: '',
    omission: 'Took it for a missing entry; here the entry was made, but in the wrong kind of account.',
    commission: 'Took it for a slip in posting; the amount and sides are right, but a capital item was treated as revenue (or business as personal, or the reverse).',
    compensating: 'Took it for two errors that cancel out; here one principle is broken.',
  },
  compensating: {
    compensating: '',
    omission: 'Took it for a missing entry; here entries exist, but two mistakes of equal amount offset each other.',
    commission: 'Took it for a single slip in posting; here two errors of equal amount on opposite sides cancel each other.',
    principle: 'Took it for a breach of an accounting principle; here the accounts are the right ones and two wrong amounts offset each other.',
  },
};
const CLASS_EXPLAIN: Record<ErrorClass, string> = {
  omission: 'An error of omission is a transaction left out of the books altogether (complete) or entered in one place and not posted to one of its accounts (partial).',
  commission: 'An error of commission is a slip in recording or posting: the wrong account of the same type, the wrong side, the wrong amount, or a wrong total.',
  principle: 'An error of principle breaks an accounting principle, as when a capital item is treated as revenue, or a personal item as a business one.',
  compensating: 'Compensating errors are two or more errors of equal amount that cancel each other, so the trial balance still agrees.',
};
const CLASS_BANKS: Record<ErrorClass, Maker[]> = {
  omission: [...omissions, ...notPosted],
  commission: [...wrongExpense, ...wrongParty, ...reversed, ...wrongSide, ...wrongAmount, ...casting],
  principle: [...principleA, ...principleB],
  compensating,
};
const CLASSES: ErrorClass[] = ['omission', 'commission', 'principle', 'compensating'];

const classOfError = mcqTemplate({
  id: 'roe-class-of-error',
  topicId: T,
  conceptId: 'roe-classes',
  difficulty: 'easy',
  generate: (rng) => {
    const kind = rng.pick(CLASSES);
    const c = rng.pick(CLASS_BANKS[kind])(rng);
    if (c === null || c.kind !== kind) return null;
    return {
      prompt: `${c.text} Which class of error is this?`,
      correct: CLASS_LABEL[kind],
      distractors: CLASSES.filter((k) => k !== kind).map((k) => ({ text: CLASS_LABEL[k], why: CLASS_WHY[kind][k] })),
      explanation: CLASS_EXPLAIN[kind],
    };
  },
});

const TB_AGREES = 'The trial balance still agrees';
const TB_DEBIT = 'The trial balance does not agree; its debit total is larger';
const TB_CREDIT = 'The trial balance does not agree; its credit total is larger';
const TB_DEPENDS = 'It depends on whether a Suspense A/c is opened';

const affectsTb = mcqTemplate({
  id: 'roe-affects-tb',
  topicId: T,
  conceptId: 'roe-tb-effect',
  difficulty: 'easy',
  generate: (rng) => {
    const c = rng.pick(EVERYTHING)(rng);
    if (c === null) return null;
    const gap = tbNet(c);
    const right = gap === 0 ? TB_AGREES : gap > 0 ? TB_DEBIT : TB_CREDIT;
    const opts: Distractor[] = [
      {
        text: TB_AGREES,
        why: 'Took the error for a harmless one; it leaves a single account wrong, or the two sides unequal, so the totals differ.',
      },
      {
        text: TB_DEBIT,
        why: gap === 0 ? 'Took the error for one that upsets the trial balance; the accounts concerned are wrong by amounts that cancel each other, so the totals still agree.' : 'Named the wrong side: the credit total is the larger one.',
      },
      {
        text: TB_CREDIT,
        why: gap === 0 ? 'Took the error for one that upsets the trial balance; the accounts concerned are wrong by amounts that cancel each other, so the totals still agree.' : 'Named the wrong side: the debit total is the larger one.',
      },
      {
        text: TB_DEPENDS,
        why: 'Mixed up the effect of the error with a later step: the trial balance either agrees or it does not, whether or not Suspense A/c is opened afterwards.',
      },
    ].filter((o) => o.text !== right);
    return {
      prompt: `${c.text} What is the effect of this error on the trial balance?`,
      correct: right,
      distractors: opts,
      explanation: effectLines(c).join(' '),
    };
  },
  verify: (q) => {
    const r = read(q.prompt);
    return r !== null && correctText(q) === (r.tb === 0 ? TB_AGREES : r.tb > 0 ? TB_DEBIT : TB_CREDIT);
  },
});

const suspenseSide = mcqTemplate({
  id: 'roe-suspense-side',
  topicId: T,
  conceptId: 'roe-suspense',
  difficulty: 'easy',
  generate: (rng) => {
    const big = money(rng, 100000, 900000, 500);
    const d = money(rng, 500, 20000, 500);
    const small = big - d;
    const debitBig = rng.pick([true, false]);
    const [D, C] = debitBig ? [big, small] : [small, big];
    const right = debitBig ? 'credit' : 'debit';
    const wrong = debitBig ? 'debit' : 'credit';
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    return {
      prompt: `The debit column of a trial balance adds up to ${f(D)} and the credit column to ${f(C)}. On which side, and for what amount, is Suspense A/c entered to make the columns agree?`,
      correct: `${cap(right)} side, ${f(d)}`,
      distractors: [
        { text: `${cap(wrong)} side, ${f(d)}`, why: 'Put the difference on the side that is already larger; it belongs on the side that is short.' },
        { text: `${cap(right)} side, ${f(big)}`, why: 'Gave the larger total as the amount instead of the difference between the totals.' },
        { text: `${cap(wrong)} side, ${f(big)}`, why: 'Gave the larger total as the amount and put it on the side that is already larger.' },
        { text: `${cap(right)} side, ${f(D + C)}`, why: 'Added the two totals instead of finding their difference.' },
      ],
      explanation: `The ${wrong} column is larger by ${f(d)}, so the ${right} side is short and Suspense A/c of ${f(d)} goes on the ${right} side.`,
    };
  },
  verify: (q) => {
    const [D, C] = amountsIn(q.prompt);
    const text = q.options.find((o) => o.id === q.correct)?.text ?? '';
    return text === `${D > C ? 'Credit' : 'Debit'} side, ${f(Math.abs(D - C))}`;
  },
});

const oneOrTwoSided = mcqTemplate({
  id: 'roe-one-or-two-sided',
  topicId: T,
  conceptId: 'roe-tb-effect',
  difficulty: 'easy',
  generate: (rng) => {
    const c = rng.pick([...ONE_SIDED, ...TWO_SIDED_SIMPLE, ...TWO_SIDED_COMPLEX])(rng);
    if (c === null) return null;
    const one = tbNet(c) !== 0;
    const ONE_DIS = 'One-sided error: the trial balance will not agree';
    const TWO_AGREE = 'Two-sided error: the trial balance will still agree';
    const TWO_DIS = 'Two-sided error: the trial balance will not agree';
    const ONE_AGREE = 'One-sided error: the trial balance will still agree';
    return {
      prompt: `Treat an error as one-sided if it leaves only one account wrong, and as two-sided if it leaves two or more accounts wrong by amounts that cancel each other in the trial balance. ${c.text} What kind of error is this, and what does it do to the trial balance?`,
      correct: one ? ONE_DIS : TWO_AGREE,
      distractors: [
        one
          ? { text: TWO_AGREE, why: 'Took a one-sided error for a two-sided one; here only one account is wrong, so nothing offsets it.' }
          : { text: ONE_DIS, why: 'Took a two-sided error for a one-sided one; here more than one account is wrong, by amounts that cancel each other.' },
        one
          ? { text: TWO_DIS, why: 'Called it two-sided, and then still expected the trial balance to disagree; only one account is wrong here.' }
          : { text: TWO_DIS, why: 'Believed every error upsets the trial balance; wrong amounts that cancel each other leave the totals equal.' },
        one
          ? { text: ONE_AGREE, why: 'Believed a single wrong account can leave the totals equal; the other side of the entry is correct, so they cannot.' }
          : { text: ONE_AGREE, why: 'Called it one-sided, and expected the totals to agree; more than one account is wrong here.' },
      ],
      explanation: effectLines(c).join(' '),
    };
  },
  verify: (q) => {
    const r = read(q.prompt);
    return r !== null && correctText(q).startsWith(r.tb !== 0 ? 'One-sided error: the trial balance will not agree' : 'Two-sided error: the trial balance will still agree');
  },
});

const whichAccount = mcqTemplate({
  id: 'roe-which-account-debited',
  topicId: T,
  conceptId: 'roe-two-sided',
  difficulty: 'easy',
  generate: (rng) => {
    const c = rng.pick(TWO_SIDED_SIMPLE)(rng);
    if (c === null) return null;
    const lines = rectifyingEntry(c);
    const side = rng.pick(['Dr', 'Cr'] as const);
    const on = lines.filter((l) => l.side === side);
    if (on.length !== 1) return null;
    const right = on[0].accountId;
    const other = lines.filter((l) => l.side !== side).map((l) => l.accountId);
    const candidates: [string, string][] = [
      ...other.map((id): [string, string] => [id, `Put it on the wrong side: that account is ${side === 'Dr' ? 'credited' : 'debited'} in the rectifying entry.`]),
      ...accountsOf(c)
        .filter((id) => id !== right && !other.includes(id))
        .map((id): [string, string] => [id, 'That account was posted correctly the first time, so the rectifying entry leaves it alone.']),
      ['suspense', 'Brought in Suspense A/c, but this error does not upset the trial balance, so there is nothing in Suspense to clear.'],
      [
        'cash',
        lines.some((l) => l.accountId === 'bank')
          ? 'Named Cash A/c, but the money moved by cheque, so the account concerned is Bank A/c.'
          : accountsOf(c).includes('bank')
            ? 'Brought in Cash A/c, but the payment was by cheque and Bank A/c was posted correctly; correcting the error moves no money.'
            : 'Brought in Cash A/c, but no cash is involved in this error; correcting an error moves no money.',
      ],
      ['capital', 'Brought in Capital A/c, which this error does not touch.'],
    ];
    const distractors = distinctOptions(
      accountName(right),
      candidates.map(([id, why]) => ({ text: accountName(id), why })),
    );
    if (distractors === null) return null;
    return {
      prompt: `${c.text} ${foundWhen(rng, 0)} In the rectifying entry, which account is ${side === 'Dr' ? 'debited' : 'credited'}?`,
      correct: accountName(right),
      distractors,
      explanation: explainCase(c).join(' '),
    };
  },
  verify: (q) => {
    // The error is read again from its sentence: it must leave the totals equal, so Suspense A/c is never the answer.
    const r = read(q.prompt);
    const answer = correctText(q);
    if (r === null || r.tb !== 0 || answer === 'Suspense A/c') return false;
    // An error that misstates the profit has one income or expense account in its two-line entry. An overstated profit
    // is put right by debiting that account and an understated one by crediting it, so the answer is an income or
    // expense account exactly when the question asks for that side.
    if (r.profit === 0) return true;
    const asked = q.prompt.includes('which account is debited?') ? 'debited' : 'credited';
    return NOMINAL_NAMES.has(answer) === (asked === (r.profit > 0 ? 'debited' : 'credited'));
  },
});

const pickEntry = mcqTemplate({
  id: 'roe-pick-entry',
  topicId: T,
  conceptId: 'roe-two-sided',
  difficulty: 'easy',
  generate: (rng) => {
    const c = rng.pick(TWO_SIDED_SIMPLE)(rng);
    if (c === null) return null;
    const lines = rectifyingEntry(c);
    const flip = (l: JournalLine): JournalLine => ({ ...l, side: l.side === 'Dr' ? 'Cr' : 'Dr' });
    const swapAt = (at: number, accountId: string) => lines.map((l, i) => (i === at ? { ...l, accountId } : l));
    // Every option lists its debits first, so the order of the lines does not mark out the reversed entry.
    const candidates: [string, string][] = [
      [entryText(debitsFirst(lines.map(flip))), 'Wrote the entry the wrong way round: that debits what should be credited and widens the error instead of removing it.'],
      [entryText(swapAt(lines.length - 1, 'suspense')), 'Credited Suspense A/c, but this error leaves the trial balance in agreement, so there is no difference to clear.'],
      [entryText(swapAt(0, 'suspense')), 'Debited Suspense A/c, but this error leaves the trial balance in agreement, so there is no difference to clear.'],
    ];
    if (c.done.length > 0) {
      candidates.push([postsText(c.done), 'Repeated the original wrong entry instead of correcting it.']);
      candidates.push([
        postsText(c.should),
        lines.every((l) => l.amount === 2 * biggest(c))
          ? 'Passed the entry for the amount once; that only cancels the entry made the wrong way round, and the transaction itself is still not recorded.'
          : 'Passed the entry that should have been made, without first undoing the wrong one, so the wrong posting stays in the books.',
      ]);
    }
    if (!lines.some((l) => l.accountId === 'cash')) {
      candidates.push([entryText(swapAt(0, 'cash')), 'Put Cash A/c in place of the account that has to be corrected; correcting an error moves no money.']);
    }
    const right = entryText(lines);
    const distractors = distinctOptions(right, candidates.map(([text, why]) => ({ text, why })));
    if (distractors === null) return null;
    return {
      prompt: `${c.text} ${foundWhen(rng, 0)} Which is the correct rectifying entry?`,
      correct: right,
      distractors,
      explanation: explainCase(c).join(' '),
    };
  },
  verify: (q) => {
    const r = read(q.prompt);
    return r !== null && printedEntryRectifies(correctText(q), r);
  },
});

/** One-sided errors that leave exactly one real account (not cash or bank) to correct. */
const singleAccount = (c: Case): JournalLine | null => {
  const real = rectifyingEntry(c).filter((l) => l.accountId !== 'suspense');
  return real.length === 1 && real[0].accountId !== 'cash' && real[0].accountId !== 'bank' ? real[0] : null;
};

const beforeAfter = mcqTemplate({
  id: 'roe-before-after-entry',
  topicId: T,
  conceptId: 'roe-before-tb',
  difficulty: 'medium',
  generate: (rng) => {
    const c = rng.pick(ONE_SIDED)(rng);
    if (c === null) return null;
    const line = singleAccount(c);
    if (line === null) return null;
    const lines = rectifyingEntry(c);
    const name = accountName(line.accountId);
    const sideName = (s: Side) => (s === 'Dr' ? 'debit' : 'credit');
    const opposite: Side = line.side === 'Dr' ? 'Cr' : 'Dr';
    const flip = (l: JournalLine): JournalLine => ({ ...l, side: l.side === 'Dr' ? 'Cr' : 'Dr' });
    const direct = (s: Side) => `Post ${f(line.amount)} straight to the ${sideName(s)} side of ${name}; no Suspense A/c is used`;
    const withCash = `Pass an entry between ${name} and Cash A/c for ${f(line.amount)}`;
    const noCash = 'Brought Cash A/c in, although no cash is received or paid when an error is corrected.';
    if (rng.pick([true, false])) {
      return {
        prompt: `${c.text} The error is found before the trial balance is prepared, so there is no Suspense A/c. How is it corrected?`,
        correct: direct(line.side),
        distractors: [
          { text: `Pass the entry ${entryText(lines)}`, why: 'Used Suspense A/c, but none exists before the trial balance is prepared: no difference has been carried to it.' },
          { text: direct(opposite), why: 'Put the correction on the wrong side of the account.' },
          { text: 'Leave it until the trial balance is prepared and let the Suspense A/c absorb it', why: 'An error already found is corrected at once; Suspense A/c is for differences nobody has traced.' },
          { text: withCash, why: noCash },
        ],
        explanation: `Only ${name} is wrong, and there is no Suspense A/c yet, so the account itself is corrected: ${sideName(line.side)} ${f(line.amount)}.`,
      };
    }
    return {
      prompt: `${c.text} The error is found after the trial balance was prepared and its difference was put to a Suspense A/c. How is it corrected?`,
      correct: `Pass the entry ${entryText(lines)}`,
      distractors: [
        { text: `Pass the entry ${entryText(debitsFirst(lines.map(flip)))}`, why: 'Reversed the entry, which makes the error and the Suspense balance bigger instead of clearing them.' },
        { text: `Post ${f(line.amount)} straight to the ${sideName(line.side)} side of ${name} and leave Suspense A/c alone`, why: 'Corrected the account only; the difference sitting in Suspense A/c is never cleared.' },
        { text: withCash, why: `${noCash} The other side of the correction is Suspense A/c.` },
        { text: 'Pass no entry; Suspense A/c clears itself when the final accounts are prepared', why: 'Thought Suspense A/c clears itself; it stays until the error behind it is rectified.' },
      ],
      explanation: `Only ${name} is wrong. The trial balance difference sits in Suspense A/c, so the entry is: ${entryText(lines)}.`,
    };
  },
  verify: (q) => {
    const r = read(q.prompt);
    if (r === null || r.tb === 0) return false;
    const amt = f(Math.abs(r.tb));
    // A debit excess is put right by a credit to the account that is wrong (and a debit to Suspense A/c, once it exists).
    return q.prompt.includes('before the trial balance')
      ? correctText(q).startsWith(`Post ${amt} straight to the ${r.tb > 0 ? 'credit' : 'debit'} side of `)
      : correctText(q).includes(`Suspense A/c ${r.tb > 0 ? 'Dr' : 'Cr'} ${amt}`);
  },
});

const useSuspense = mcqTemplate({
  id: 'roe-use-suspense',
  topicId: T,
  conceptId: 'roe-suspense',
  difficulty: 'medium',
  generate: (rng) => {
    const c = rng.pick(EVERYTHING)(rng);
    if (c === null) return null;
    const x = biggest(c);
    const lines = rectifyingEntry(c);
    const susp = lines.find((l) => l.accountId === 'suspense');
    const dText = (a: number) => `Yes: Suspense A/c is debited with ${f(a)}`;
    const cText = (a: number) => `Yes: Suspense A/c is credited with ${f(a)}`;
    const NO = 'No: only the accounts affected by the error are corrected';
    // The same opening for every error, so that the wording does not say whether this one reached Suspense A/c.
    const prompt = `The trial balance of ${firmOf(rng)} did not agree, and the difference was put to a Suspense A/c. Later this error is found: ${c.text} Does Suspense A/c appear in the entry that rectifies this error, and if so how?`;
    if (susp) {
      const slip = (c.slips ?? [])[0];
      const same = (a: number) => (susp.side === 'Dr' ? dText(a) : cText(a));
      const opposite = (a: number) => (susp.side === 'Dr' ? cText(a) : dText(a));
      const right = same(susp.amount);
      const distractors = distinctOptions(right, [
        { text: opposite(susp.amount), why: `Put Suspense A/c on the wrong side. This error made the ${susp.side === 'Dr' ? 'debit' : 'credit'} total larger, so the entry ${susp.side === 'Dr' ? 'debits' : 'credits'} Suspense A/c to undo it, whatever side the whole difference stands on.` },
        { text: NO, why: 'Forgot that the difference sits in Suspense A/c and has to be cleared by the same entry.' },
        { text: same(slip ? slip.value : 2 * susp.amount), why: slip ? slip.why : 'Doubled the amount, counting the error on both sides of the trial balance.' },
        { text: opposite(x), why: 'Gave a figure from the question, and the wrong side, instead of the difference the error caused in the trial balance.' },
      ]);
      if (distractors === null) return null;
      return {
        prompt,
        correct: right,
        distractors,
        explanation: explainCase(c).join(' '),
      };
    }
    const notThisError = 'Brought Suspense A/c in for an error that leaves the two totals equal; the difference held in Suspense A/c was caused by other errors.';
    return {
      prompt,
      correct: NO,
      distractors: [
        { text: dText(x), why: notThisError },
        { text: cText(x), why: notThisError },
        { text: 'Yes: every error found after the trial balance is rectified through Suspense A/c', why: 'Believed all errors found after the trial balance go through Suspense; only those that left a difference in it do.' },
      ],
      explanation: `${explainCase(c).join(' ')} The balance in Suspense A/c comes from other errors and is left as it is.`,
    };
  },
  verify: (q) => {
    const r = read(q.prompt);
    if (r === null) return false;
    return correctText(q) === (r.tb === 0 ? 'No: only the accounts affected by the error are corrected' : `Yes: Suspense A/c is ${r.tb > 0 ? 'debited' : 'credited'} with ${f(Math.abs(r.tb))}`);
  },
});

const notRevealed = mcqTemplate({
  id: 'roe-which-not-revealed',
  topicId: T,
  conceptId: 'roe-tb-effect',
  difficulty: 'medium',
  generate: (rng) => {
    const hidden = rng.pick([...TWO_SIDED_SIMPLE, ...compensating, ...TWO_SIDED_COMPLEX])(rng);
    const shown = drawCases(rng, ONE_SIDED, 3);
    if (hidden === null || !shown) return null;
    return {
      prompt: 'Which one of these errors will not be revealed by the trial balance?',
      correct: hidden.text,
      distractors: shown.map((c) => ({
        text: c.text,
        why: 'This error leaves one account wrong (or the two sides unequal), so the trial balance disagrees and reveals it.',
      })),
      explanation: `${hidden.text} ${tbSentence(0)} Each of the other three leaves one account wrong, so the two totals differ.`,
    };
  },
  verify: (q) =>
    q.options.every((o) => {
      const r = read(o.text);
      return r !== null && (r.tb === 0) === (o.id === q.correct);
    }),
});

const PROFIT_WHY = {
  opposite: 'Got the direction wrong: profit is overstated when expenses are too low or incomes too high, and understated in the opposite case.',
  none: 'Thought the error does not reach profit; an income or expense account is wrongly stated.',
  onceWrongSide: 'Counted the amount once; the item sits on the wrong side of an income or expense account, so taking it out and putting it right moves the profit by twice the amount.',
  onceTwoAccounts: 'Counted only one of the two accounts; both are trading items, each wrong by the amount, and both move the profit the same way.',
  twiceTwoAccounts: 'Counted the amount for both accounts, but only one of them is an income or expense; the other is a balance sheet item.',
  twiceOneAccount: 'Doubled the amount; a wrong total changes one account, and so the profit, by the amount once.',
  balanceSheetOnly: 'Treated a balance sheet account (a person, cash or another asset or liability) as if it were an income or an expense.',
  cancels: 'Counted one of the income or expense items and missed the other, which cancels it.',
  addedBoth: 'Added the two income or expense items together, although they move the profit in opposite directions and cancel.',
};

function profitChoice(c: Case): { correct: string; distractors: Distractor[]; explain: string } {
  const e = profitEffect(c);
  const x = biggest(c);
  const over = (a: number) => `Overstated by ${f(a)}`;
  const under = (a: number) => `Understated by ${f(a)}`;
  const label = (effect: number) => (effect > 0 ? over(effect) : under(-effect));
  if (e === 0) {
    // Only an income or expense that the error leaves wrong counts; one that was posted correctly (Sales A/c when the wrong customer was debited) does not.
    const nominal = wrongNominal(c).length > 0;
    const why = nominal ? PROFIT_WHY.cancels : PROFIT_WHY.balanceSheetOnly;
    return {
      correct: 'Not affected',
      distractors: [
        { text: over(x), why },
        { text: under(x), why },
        { text: over(2 * x), why: nominal ? PROFIT_WHY.addedBoth : why },
      ],
      explain: nominal
        ? `${profitReason(c)} The two cancel each other, so the net profit is the same.`
        : 'No income or expense account is wrong: the error lies only in balance sheet accounts (persons, cash, other assets or liabilities), so the net profit is the same.',
    };
  }
  const a = Math.abs(e);
  const wrong = wrongNominal(c);
  const distractors: Distractor[] = [
    { text: label(-e), why: PROFIT_WHY.opposite },
    { text: 'Not affected', why: PROFIT_WHY.none },
  ];
  if (c.profitSlips) distractors.push(...c.profitSlips.map((sl) => ({ text: label(sl.effect), why: sl.why })));
  else if (a === 2 * x) distractors.push({ text: label(e / 2), why: wrong.length > 1 ? PROFIT_WHY.onceTwoAccounts : PROFIT_WHY.onceWrongSide });
  else if (a === x) distractors.push({ text: label(2 * e), why: accountsOf(c).length > 1 ? PROFIT_WHY.twiceTwoAccounts : PROFIT_WHY.twiceOneAccount });
  else distractors.push(...(c.slips ?? []).map((sl) => ({ text: label(e > 0 ? sl.value : -sl.value), why: sl.why })));
  return {
    correct: label(e),
    distractors,
    explain: `${profitReason(c)} ${e > 0 ? 'Expenses are too low or incomes too high' : 'Expenses are too high or incomes too low'}, so profit is ${e > 0 ? 'overstated' : 'understated'} by ${f(a)}.`,
  };
}

function profitDirection(id: string, difficulty: Difficulty, makers: Maker[], zeroShare: number) {
  return mcqTemplate({
    id,
    topicId: T,
    conceptId: 'roe-profit',
    difficulty,
    version: 2,
    generate: (rng) => {
      const wantZero = rng.next() < zeroShare;
      let c: Case | null = null;
      for (let i = 0; i < 20 && c === null; i++) {
        const t = rng.pick(makers)(rng);
        if (t !== null && (profitEffect(t) === 0) === wantZero) c = t;
      }
      if (c === null) return null;
      const { correct, distractors, explain } = profitChoice(c);
      const options = distinctOptions(correct, distractors);
      if (options === null) return null;
      return {
        prompt: `${c.text} The error is not found before the final accounts are prepared. ${IGNORE_DEPRECIATION} Considering this error alone, what is its effect on the net profit for the year?`,
        correct,
        distractors: options,
        explanation: `${effectLines(c).slice(0, -1).join(' ')} ${explain}`,
      };
    },
    verify: (q) => {
      const r = read(q.prompt);
      if (r === null) return false;
      return correctText(q) === (r.profit === 0 ? 'Not affected' : `${r.profit > 0 ? 'Overstated' : 'Understated'} by ${f(Math.abs(r.profit))}`);
    },
  });
}

const COMPLEX_PROFIT: Maker[] = [...wrongBook, ...principleCombined, ...principleOffsetting];
const profitDirectionMedium = profitDirection('roe-profit-direction', 'medium', EVERYTHING.filter((m) => !COMPLEX_PROFIT.includes(m)), 0.25);
const profitDirectionComplex = profitDirection('roe-profit-complex', 'complex', [...COMPLEX_PROFIT, ...reversed], 0);

const suspenseSideAfter = mcqTemplate({
  id: 'roe-suspense-side-after',
  topicId: T,
  conceptId: 'roe-suspense-balance',
  difficulty: 'complex',
  generate: (rng) => {
    const s = suspenseStory(rng);
    if (!s) return null;
    const bal = (n: number) => `${n > 0 ? 'Debit' : 'Credit'} balance of ${f(Math.abs(n))}`;
    const correct = bal(s.remaining);
    const distractors = distinctOptions(correct, [
      { text: bal(-s.remaining), why: 'Got the amount right but the side wrong: check which side of Suspense A/c is the heavier after the three entries.' },
      ...suspenseSlips(s)
        .filter((sl) => sl.value !== 0)
        .map((sl) => ({ text: bal(sl.value), why: sl.why })),
    ]);
    if (distractors === null) return null;
    return {
      prompt: `${s.prompt} What balance remains in Suspense A/c after the three errors are rectified?`,
      correct,
      distractors,
      explanation: suspenseWorking(s).join(' '),
    };
  },
  verify: (q) => {
    const left = suspenseLeft(q.prompt);
    return left !== null && left !== 0 && correctText(q) === `${left > 0 ? 'Debit' : 'Credit'} balance of ${f(Math.abs(left))}`;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Hints of their own for the templates that had the default pair: a first nudge, then the step to take. Each such
// template is one version up (`revised`); the profit templates also state "Ignore depreciation", the Suspense
// templates name a business and open with a balance in whole hundreds, and the choice about Suspense A/c gives the
// right reason for its wrong side.
// ---------------------------------------------------------------------------------------------------------------

const H_ENTRY = [
  'Write down what was recorded and what should have been recorded.',
  'Credit what was wrongly debited and debit what should have been debited (the other way round for a credit). A posting that was right the first time is not repeated.',
];
const H_PROFIT = [
  'Find the income or expense account the error left wrong. A person, cash or an asset on its own does not touch the profit.',
  'An expense too low or an income too high overstates the profit; an expense too high or an income too low understates it. Two such accounts wrong in opposite ways cancel. Depreciation is ignored.',
];
const H_CORRECT_PROFIT = [
  'Take each error in turn: is the profit shown too high or too low because of it, and by how much?',
  'Corrected profit = profit as per books - overstatements + understatements. An asset booked as an expense (or the reverse) moves the profit by its full cost, since depreciation is ignored.',
];
const H_SUSPENSE_COLUMNS = [
  'Total each column of the trial balance. Which one is short?',
  'Suspense A/c = larger total - smaller total, written in the short column, so both columns then show the larger total.',
];
const H_SUSPENSE_LEFT = [
  'Start from the side and the amount Suspense A/c opened with.',
  'Each rectifying entry debits Suspense A/c when its error made the debit total larger, and credits it when the error made the credit total larger. Net those postings against the opening balance; what is left belongs to errors not yet found.',
];

const ROE_HINTS: Record<string, string[]> = {
  // The guided level first.
  'roe-corrected-balance': [
    'Before the trial balance there is no Suspense A/c: the missing posting is simply put into the account.',
    "A credit sale adds to what a customer owes and cash received reduces it; a credit purchase adds to what a supplier is owed and a payment reduces it.",
  ],
  'roe-tb-difference': [
    'Does the error leave one account wrong, or two accounts wrong by equal amounts? Only a one-sided error makes the totals differ.',
    'A posting left out or a wrong total moves one column by that amount; a wrong figure by the gap between the right and the wrong figure; a posting on the wrong side by twice the amount.',
  ],
  'roe-net-tb-difference': [
    'Work out each error alone: which column does it make larger, and by how much?',
    'Add the excesses of the debit column and set off those of the credit column. The net figure is the difference between the totals.',
  ],
  'roe-suspense-opening': H_SUSPENSE_COLUMNS,
  'roe-suspense-from-balances': H_SUSPENSE_COLUMNS,
  'roe-corrected-balance-side': [
    'Ask where the posting stands in the account, and where it should stand.',
    'A posting on the wrong side is taken out and put on the right side, so the balance moves by twice the amount; a wrong figure is replaced by the right one, so the balance moves by the gap between them.',
  ],
  'roe-corrected-account': [
    'Take the errors one at a time and ask what each one did to this account alone.',
    'An overcast or a wrong extra debit comes off a debit balance; an undercast or a debit that was missed goes on (the other way round for a credit balance). Apply both corrections to the balance.',
  ],
  'roe-profit-correct-one': H_CORRECT_PROFIT,
  'roe-corrected-profit': H_CORRECT_PROFIT,
  'roe-profit-direction': H_PROFIT,
  'roe-profit-complex': H_PROFIT,
  'roe-suspense-after-errors': H_SUSPENSE_LEFT,
  'roe-suspense-side-after': H_SUSPENSE_LEFT,
  'roe-class-of-error': [
    'Was something left out, slipped in recording, against a principle, or two slips that cancel?',
    'Omission: left out wholly or partly. Commission: a wrong amount, side, total or account of the same kind. Principle: capital and revenue (or business and personal) mixed up. Compensating: two errors that cancel each other.',
  ],
  'roe-affects-tb': [
    'Did both halves of the entry reach the ledger, on the right sides and with the same amount?',
    'If one account alone is wrong, the totals differ and the column that got too much is the larger. If two accounts are wrong by equal and opposite amounts, the trial balance still agrees.',
  ],
  'roe-suspense-side': H_SUSPENSE_COLUMNS,
  'roe-one-or-two-sided': [
    'Count the accounts the error leaves wrong.',
    'One account wrong: a one-sided error, and the trial balance differs. Two or more accounts wrong by amounts that cancel: a two-sided error, and the trial balance agrees.',
  ],
  'roe-which-account-debited': H_ENTRY,
  'roe-pick-entry': H_ENTRY,
  'roe-before-after-entry': [
    'Is there a Suspense A/c yet? Before the trial balance there is none.',
    'Before the trial balance, correct the one wrong account directly. After it, a one-sided error goes through Suspense A/c, on the side that undoes that error.',
  ],
  'roe-use-suspense': [
    'Did this error, on its own, make the totals of the trial balance differ?',
    'If it left one account wrong, its entry posts Suspense A/c: debit it when the error made the debit total larger, credit it when the error made the credit total larger. A two-sided error leaves Suspense A/c alone.',
  ],
  'roe-which-not-revealed': [
    'For each error, ask whether the debits still equal the credits.',
    'A complete omission, a wrong account on the right side, an error of principle and compensating errors leave the totals equal, so the trial balance does not reveal them.',
  ],
};

/** A template given its own hints: one version up, and the same questions otherwise. */
function revised(t: Template): Template {
  const hints = ROE_HINTS[t.id];
  if (!hints) return t;
  const generate = t.generate as (rng: Rng) => object | null;
  return {
    ...t,
    version: t.version + 1,
    generate: (rng: Rng) => {
      const parts = generate(rng);
      return parts === null ? null : { ...parts, hints };
    },
  } as Template;
}

const templates: Template[] = [
  // journal
  rectWrongExpense,
  rectWrongParty,
  rectOmitted,
  rectPrincipleAsset,
  rectCasting,
  rectPrincipleOther,
  rectCompensating,
  rectReversed,
  rectNotPosted,
  rectWrongAmount,
  rectWrongSide,
  rectWrongBook,
  rectPrincipleCombined,
  rectTwoErrors,
  // numeric
  tbDifference,
  suspenseOpening,
  correctedBalance,
  suspenseFromBalances,
  correctedBalanceSide,
  correctedAccount,
  profitOne,
  profitMany,
  suspenseAfter,
  netDifference,
  // mcq
  classOfError,
  affectsTb,
  suspenseSide,
  oneOrTwoSided,
  whichAccount,
  pickEntry,
  beforeAfter,
  useSuspense,
  notRevealed,
  profitDirectionMedium,
  profitDirectionComplex,
  suspenseSideAfter,
].map(revised);

// ---------------------------------------------------------------------------------------------------------------
// Sets of rectifying entries ("Pass the rectifying entries"): a list of errors found in the books of one business,
// one rectifying entry for each.
//
// A set is built from the same scenarios as the single questions (`done` and `should`), so every entry comes from
// `rectifyingEntry`. What a set adds:
//  - its opening line says whether a Suspense A/c exists. Where one does, it gives the balance it opened with, and
//    the errors of the set together account for the whole of it, so the entries of the set close the account;
//  - one rectifying entry for each error, with no posting repeated that was right the first time;
//  - the task line is "Pass the rectifying entries." and the errors are labelled "Error 1", "Error 2", ..., not dated;
//  - no two errors of a set call for the same shape of entry, concern the same person or contradict each other;
//  - an error is no harder than the label of its set: an entry in the wrong book, and an asset charged to two expense
//    accounts at once, are complex as single questions and stand only in the complex sets.
// Compensating errors are kept out: with a Suspense A/c open, each half could as well be put through it on its own.
// `setHolds` does not fit these sets (a correction may credit a customer whose balance the set does not give); the
// check is `verifySet`, which reads every error again from its own sentence.
// ---------------------------------------------------------------------------------------------------------------

const isParty = (id: string): boolean => id.startsWith('debtor:') || id.startsWith('creditor:');

/** A figure and the same figure with its two digits changed over (₹5,400 and ₹4,500): [the right one, the wrong one]. */
function transposed(rng: Rng): [Paise, Paise] {
  const [a, b] = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const scale = rng.pick([100, 1000]);
  return [(10 * a + b) * scale * 100, (10 * b + a) * scale * 100];
}

/** Two-sided, commission: the slip is in the book of original entry, so both accounts carry it. */
const bookSlip: Maker[] = [
  (rng) => {
    const [p] = who(rng, 1);
    const x = money(rng, 2000, 60000);
    return {
      text: `An invoice for goods worth ${f(x)} bought on credit from ${p} was entered twice in the Purchases Book, so Purchases A/c and ${p}'s account both carry it twice.`,
      kind: 'commission',
      done: [dr('purchases', 2 * x), cr(creditor(p), 2 * x)],
      should: [dr('purchases', x), cr(creditor(p), x)],
      recorded: `Entered twice, so in all: Purchases A/c Dr ${f(2 * x)}; ${p} A/c Cr ${f(2 * x)}.`,
    };
  },
  (rng) => {
    const [p] = who(rng, 1);
    const x = money(rng, 2000, 60000);
    return {
      text: `An invoice for goods worth ${f(x)} sold on credit to ${p} was entered twice in the Sales Book, so ${p}'s account and Sales A/c both carry it twice.`,
      kind: 'commission',
      done: [dr(debtor(p), 2 * x), cr('sales', 2 * x)],
      should: [dr(debtor(p), x), cr('sales', x)],
      recorded: `Entered twice, so in all: ${p} A/c Dr ${f(2 * x)}; Sales A/c Cr ${f(2 * x)}.`,
    };
  },
  (rng) => {
    const [x, y] = transposed(rng);
    const [p] = who(rng, 1);
    return {
      text: `A credit purchase of ${f(x)} from ${p} was entered in the Purchases Book as ${f(y)}, so Purchases A/c and ${p}'s account both carry the wrong figure.`,
      kind: 'commission',
      done: [dr('purchases', y), cr(creditor(p), y)],
      should: [dr('purchases', x), cr(creditor(p), x)],
    };
  },
  (rng) => {
    const [x, y] = transposed(rng);
    const [p] = who(rng, 1);
    return {
      text: `A credit sale of ${f(x)} to ${p} was entered in the Sales Book as ${f(y)}, so ${p}'s account and Sales A/c both carry the wrong figure.`,
      kind: 'commission',
      done: [dr(debtor(p), y), cr('sales', y)],
      should: [dr(debtor(p), x), cr('sales', x)],
    };
  },
];

/** Principle: a cost of bringing a new machine into use, charged as an expense. */
const carriageOnMachine: Maker[] = [
  (rng) => {
    const y = money(rng, 1000, 9000);
    const m = modeOf(rng);
    return {
      text: `Carriage of ${f(y)} paid ${how(m)} on a new machine was debited to Carriage Inwards A/c.`,
      kind: 'principle',
      done: [dr('carriageInwards', y), cr(m, y)],
      should: [dr('machinery', y), cr(m, y)],
      correct: `Carriage on a new machine is part of its cost. Should have been: Machinery A/c Dr ${f(y)}; ${accountName(m)} Cr ${f(y)}.`,
    };
  },
];

/** Principle: an asset bought or sold on credit and passed through the book kept for goods. */
const bookedAsGoods: Maker[] = [
  (rng) => {
    const [asset, label] = rng.pick(ASSETS);
    const [p] = who(rng, 1);
    const x = money(rng, 5000, 150000, 1000);
    return {
      text: `${label.charAt(0).toUpperCase()}${label.slice(1)} bought on credit from ${p} for ${f(x)} was entered in the Purchases Book, so ${p}'s account was credited, which is right, but the amount was debited to Purchases A/c.`,
      kind: 'principle',
      done: [dr('purchases', x), cr(creditor(p), x)],
      should: [dr(asset, x), cr(creditor(p), x)],
    };
  },
  (rng) => {
    const [p] = who(rng, 1);
    const x = money(rng, 2000, 30000);
    return {
      text: `Old furniture was sold on credit to ${p} for ${f(x)}, its book value. The sale was entered in the Sales Book, so ${p}'s account was debited, which is right, but the amount was credited to Sales A/c.`,
      kind: 'principle',
      done: [dr(debtor(p), x), cr('sales', x)],
      should: [dr(debtor(p), x), cr('furniture', x)],
    };
  },
];

/** Goods taken by the owner and not recorded, in the words of the single questions, so that the same line reads it. */
const goodsTaken: Maker[] = [
  (rng) => {
    const x = money(rng, 1000, 20000);
    return {
      ...omit(`The owner took goods costing ${f(x)} for personal use and no entry was made.`, [dr('drawings', x), cr('purchases', x)]),
      correct: `Goods taken by the owner are drawings at cost, and they are no longer a purchase of the business: Drawings A/c Dr ${f(x)}; Purchases A/c Cr ${f(x)}.`,
    };
  },
];

/**
 * A posting with a wrong figure, for a list: the single questions also draw figures of a few hundred rupees (₹320
 * posted as ₹230), which no trader's salaries, rent or invoices come to, so a list takes ₹1,000 and more.
 */
const wrongAmountOfSet: Maker[] = wrongAmount.map((maker) => (rng) => {
  const c = maker(rng);
  return c !== null && c.done.every((p) => p.amount >= 1000 * 100) ? c : null;
});

/**
 * An asset and a cost that belongs to it, both charged as expenses: one entry with three lines. In a list the item
 * says that the credits were right, so that correcting the two debits together is the only entry to pass.
 */
const assetWithItsCost: Maker[] = principleCombined.map((maker) => (rng) => {
  const c = maker(rng);
  if (c === null) return null;
  const credited = [...new Set(c.done.filter((p) => p.side === 'Cr').map((p) => p.account))].map((id) =>
    isParty(id) ? `${resolveAccount(id).name}'s account` : accountName(id),
  );
  return { ...c, text: `${c.text} Only the two debits were wrong: ${credited.join(' and ')} ${credited.length > 1 ? 'were' : 'was'} credited correctly.` };
});

/** The owner's personal expense charged to the business: left out of a set that is about the class of the errors. */
const isPersonalExpense = (c: Case): boolean => c.kind === 'principle' && c.should.some((p) => p.account === 'drawings');

/** The second reading (see READERS) of the scenarios only the sets use. */
const SET_READERS: Reader[] = [
  // A slip in the book of original entry reaches both accounts: the totals agree, and the trading item is wrong.
  reader('goods worth # bought on credit from ~ was entered twice in the Purchases Book', NIL, times(-1)),
  reader('goods worth # sold on credit to ~ was entered twice in the Sales Book', NIL, times(1)),
  reader('A credit purchase of # from ~ was entered in the Purchases Book as #, so', NIL, (a) => a[0] - a[1]),
  reader('A credit sale of # to ~ was entered in the Sales Book as #, so', NIL, (a) => a[1] - a[0]),
  // Capital items passed through expense or trading accounts.
  reader('Carriage of # paid ~ on a new machine was debited to Carriage Inwards A/c', NIL, times(-1)),
  reader('bought on credit from ~ for # was entered in the Purchases Book', NIL, times(-1)),
  reader('Old furniture was sold on credit to ~ for #, its book value. The sale was entered in the Sales Book', NIL, times(1)),
];

/** Reads the one error in the text of an item of a set; null unless exactly one line of the two lists fits it. */
function readError(text: string): Read | null {
  let out: Read | null = null;
  for (const r of [...READERS, ...SET_READERS]) {
    const m = r.re.exec(text);
    if (!m) continue;
    if (out !== null) return null;
    const a = m.slice(1).map((s) => parseRupees(s));
    if (a.some((n) => n === null)) return null;
    out = { tb: r.tb(a as number[]), profit: r.profit(a as number[]) };
  }
  return out;
}

/**
 * An entry of a set, checked against the reading of its own sentence as a single answer is (see `rectifies`): it
 * clears exactly the difference the error put into Suspense A/c, takes back exactly the misstatement of profit,
 * balances, and has no amount that cannot be worked out from the figures the sentence gives.
 */
function entryRectifies(text: string, lines: JournalLine[], r: Read): boolean {
  const suspense = lines.filter((l) => l.accountId === 'suspense');
  const cleared =
    r.tb === 0 ? suspense.length === 0 : suspense.length === 1 && suspense[0].amount === Math.abs(r.tb) && suspense[0].side === (r.tb > 0 ? 'Dr' : 'Cr');
  const side = (s: Side) => lines.filter((l) => l.side === s).reduce((n, l) => n + l.amount, 0);
  const moved = lines.reduce((n, l) => {
    const type = resolveAccount(l.accountId).type;
    return type === 'income' || type === 'expense' ? n + (l.side === 'Cr' ? l.amount : -l.amount) : n;
  }, 0);
  const given = amountsIn(text);
  return cleared && side('Dr') > 0 && side('Dr') === side('Cr') && moved === -r.profit && lines.every((l) => reachable(l.amount, given, 2));
}

/** Whether the errors of a set go through Suspense A/c: none of them (no such account exists), all of them, or some. */
type SetSuspense = 'none' | 'all' | 'mixed';

const verifySet =
  (suspense: SetSuspense) =>
  (q: JournalSetQuestion): boolean => {
    const reads: Read[] = [];
    for (const e of q.entries) {
      const r = readError(e.text);
      if (r === null || !entryRectifies(e.text, e.expected, r)) return false;
      reads.push(r);
    }
    const through = reads.filter((r) => r.tb !== 0).length;
    const opened = /opened with a (debit|credit) balance of (₹[\d,]+)/.exec(q.prompt);
    if (suspense === 'none') return through === 0 && opened === null && q.prompt.includes('no Suspense A/c');
    const open = opened ? parseRupees(opened[2]) : null;
    if (!opened || open === null || open <= 0) return false;
    if (suspense === 'all' ? through !== reads.length : through === 0 || through === reads.length) return false;
    // Each entry moves Suspense A/c by the difference its own error had caused, and together they must close the account.
    return (opened[1] === 'debit' ? open : -open) + sumOf(reads, 'tb') === 0;
  };

// ---- which errors can stand in one list ----

const FIXED_ASSETS = new Set<string>([...ASSETS.map(([id]) => id), 'building']);
const BOOK = /\b(?:Sales Return|Purchases Return|Sales|Purchases|Cash) Book\b/g;
/** "The Purchases Book is right": said of a book of goods, it would jar beside another error entered in that book. */
const BOOK_IS_RIGHT = /The (?:Sales Return|Purchases Return|Sales|Purchases) Book is right/g;

/**
 * A credit sale or purchase said to have reached (or missed) Sales A/c or Purchases A/c by a posting of its own, in a
 * sentence that names no book of original entry. Beside an error that speaks of that book, whose total is what
 * reaches the account, it would be a second way of keeping the same books.
 */
const POSTED_SINGLY = /(?:posted(?: correctly)? to|by debiting) (Sales|Purchases) A\/c/g;
const postedSingly = (c: Case): string[] => [...c.text.matchAll(POSTED_SINGLY)].map((m) => `${m[1]} Book`).filter((book) => !c.text.includes(book));

/** The entry an error calls for, without names and amounts: "asset:Dr", "purchases:Cr". */
const shapeOf = (c: Case): string[] =>
  rectifyingEntry(c).map((l) => {
    const id = l.accountId;
    return `${id.startsWith('debtor:') ? 'debtor' : id.startsWith('creditor:') ? 'creditor' : FIXED_ASSETS.has(id) ? 'asset' : id}:${l.side}`;
  });

/** The income and expense accounts an entry corrects, but for Sales and Purchases, which many errors touch. */
const correctedNominal = (c: Case): string[] =>
  rectifyingEntry(c)
    .map((l) => l.accountId)
    .filter((id) => !isParty(id) && id !== 'sales' && id !== 'purchases' && ['income', 'expense'].includes(resolveAccount(id).type));

/**
 * True when two errors should not stand in the same list: they concern the same person (a name must not be a customer
 * in one error and a supplier in another, and the picker shows a person once), call for the same shape of entry (or
 * one that only adds a line to the other, as a machine and its installation do to the machine alone), correct the
 * same expense or income, or one says something of a whole book (its total is wrong, or "the Sales Book is right")
 * and the other speaks of that book too, or one has a credit sale or purchase posted singly to Sales A/c or
 * Purchases A/c and the other speaks of the Sales Book or the Purchases Book.
 */
function clash(a: Case, b: Case): boolean {
  if (a.text === b.text) return true;
  const names = (c: Case) => accountsOf(c).filter(isParty).map((id) => resolveAccount(id).name);
  if (names(a).some((n) => names(b).includes(n))) return true;
  const [sa, sb] = [shapeOf(a), shapeOf(b)];
  if (sa.every((t) => sb.includes(t)) || sb.every((t) => sa.includes(t))) return true;
  if (correctedNominal(a).some((id) => correctedNominal(b).includes(id))) return true;
  const wholeBooks = (c: Case): string[] => (c.should.length === 0 ? (c.text.match(BOOK) ?? []) : (c.text.match(BOOK_IS_RIGHT) ?? []).map((s) => s.slice(4, -9)));
  const speaksOfBookOf = (c: Case, other: Case) => [...wholeBooks(c), ...postedSingly(c)].some((book) => other.text.includes(book));
  return speaksOfBookOf(a, b) || speaksOfBookOf(b, a);
}

/** A part of a set: so many errors, one from each group in turn (a group none of whose errors fits is passed over). */
interface SetPart {
  groups: readonly (readonly Maker[])[];
  take: number;
  accept?: (c: Case) => boolean;
}

/** The errors of a set, drawn part by part; null when a part cannot be filled. No scenario is used twice. */
function drawErrors(rng: Rng, parts: readonly SetPart[]): Case[] | null {
  const out: Case[] = [];
  const used = new Set<Maker>();
  for (const part of parts) {
    let taken = 0;
    for (const group of part.groups) {
      if (taken === part.take) break;
      for (let i = 0; i < 6; i++) {
        const maker = rng.pick(group);
        const c = used.has(maker) ? null : maker(rng);
        if (c === null || (part.accept && !part.accept(c)) || out.some((o) => clash(o, c))) continue;
        used.add(maker);
        out.push(c);
        taken++;
        break;
      }
    }
    if (taken < part.take) return null;
  }
  return out;
}

// ---- the story and the wording of a set ----

/** Small makers who also trade, so that wages, a workshop, machines and a delivery van are all at home in the books. */
const TRADERS = [
  { owner: 'Asha Menon', firm: 'Menon Garments', what: 'makes and sells readymade garments in Kochi' },
  { owner: 'Imran Qureshi', firm: 'Qureshi Bakers', what: 'makes and sells bakery products in Bhopal' },
  { owner: 'Gurpreet Sandhu', firm: 'Sandhu Sports', what: 'makes and sells sports goods in Jalandhar' },
  { owner: 'Lata Deshpande', firm: 'Deshpande Masale', what: 'grinds and sells spices in Pune' },
  { owner: 'Rohit Bansal', firm: 'Bansal Footwear', what: 'makes and sells footwear in Agra' },
  { owner: 'Nandini Hegde', firm: 'Hegde Agarbatti', what: 'makes and sells incense sticks in Mysuru' },
];
/** The end of the accounting year, when the trial balance is drawn up and the final accounts follow. */
const YEAR_END = '31 March';

const SET_TASK = 'Pass the rectifying entries.';
/** The convention every entry of a set relies on, said in the opening of every set. */
const SET_CONVENTION = 'Each error is put right by one entry, and a posting that was right the first time is not repeated.';
/** Errors found after the trial balance are found in time to be put right in the accounts of the same year. */
const FOUND_AFTER = 'The errors below were found afterwards, before the final accounts were prepared';
/** Said where a list has goods taken by the owner, as the case studies say it (`cases/errors-and-suspense.ts`). */
const GOODS_TAKEN_NOTE = 'Goods taken by the owner are credited to Purchases A/c, at cost.';
const SET_HINT_FIRST = 'Take the errors one at a time. For each one, write what was recorded and what should have been recorded.';
const SET_HINTS_SUSPENSE = [SET_HINT_FIRST, ENTRY_HINTS[1]];
const SET_HINTS_NO_SUSPENSE = [
  SET_HINT_FIRST,
  'Credit what was wrongly debited and debit what should have been debited (the other way round for a credit). No Suspense A/c exists here: each of these errors left the debit and credit totals equal, so the entry goes between the accounts that are wrong.',
];

/**
 * Where the amount of a correction is not a figure of the sentence: an account posted on the wrong side is corrected
 * by the two amounts together, and one posted with a wrong figure by the difference between the two.
 */
function amountNotes(c: Case): string[] {
  const net = (ps: Post[], account: string) => ps.filter((p) => p.account === account).reduce((s, p) => s + signed(p), 0);
  const verb = (n: number) => (n > 0 ? 'debited' : 'credited');
  const out: string[] = [];
  for (const account of accountsOf(c)) {
    const [d, s] = [net(c.done, account), net(c.should, account)];
    const v = s - d;
    if (d === 0 || s === 0 || v === 0) continue;
    const [was, right, by] = [f(Math.abs(d)), f(Math.abs(s)), f(Math.abs(v))];
    out.push(
      d > 0 !== s > 0
        ? `${accountName(account)} was ${verb(d)} with ${was} when it should have been ${verb(s)} with ${right}: the wrong posting is taken out and the right one made, so it is ${verb(v)} with ${was} + ${right} = ${by}.`
        : `${accountName(account)} was ${verb(d)} with ${was} in place of ${right}: it is ${verb(v)} with the difference, ${f(Math.max(Math.abs(d), Math.abs(s)))} - ${f(Math.min(Math.abs(d), Math.abs(s)))} = ${by}.`,
    );
  }
  return out;
}

/** The steps for one error of a set: what was recorded, what should have been, the amounts, Suspense A/c, the entry. */
function setSteps(c: Case, suspenseOpen: boolean): string[] {
  const gap = tbNet(c);
  const by = f(Math.abs(gap));
  let suspenseStep: string;
  if (gap !== 0) {
    suspenseStep = `Taken alone, this error leaves the ${sideWord(gap)} total of the trial balance ${by} more than the ${sideWord(-gap)} total, so its rectifying entry ${gap > 0 ? 'debits' : 'credits'} Suspense A/c with ${by}.`;
  } else if (c.done.length === 0) {
    suspenseStep = suspenseOpen
      ? 'Neither side was posted, so debits and credits stayed equal and the trial balance was not upset: the entry that was left out is passed now, without Suspense A/c.'
      : 'Neither side was posted, so debits and credits stayed equal: the entry that was left out is passed now, and no Suspense A/c is needed.';
  } else {
    suspenseStep = suspenseOpen
      ? 'The error left debits and credits equal, so it did not upset the trial balance: Suspense A/c is not used.'
      : 'The error leaves debits and credits equal, and no Suspense A/c exists: the entry goes between the accounts that are wrong.';
  }
  return [...effectLines(c).slice(0, -1), ...amountNotes(c), suspenseStep, `Rectifying entry: ${entryText(rectifyingEntry(c))}.`];
}

/** When the errors of a set without a Suspense A/c were found: before the trial balance, after one that agreed, or either. */
type SetTiming = 'before' | 'agreed' | 'beforeOrAgreed';

function rectifySet(id: string, difficulty: Difficulty, suspense: SetSuspense, plan: (rng: Rng) => SetPart[], timing: SetTiming = 'before') {
  return journalSetTemplate({
    id,
    topicId: T,
    conceptId: 'roe-sets',
    difficulty,
    generate: (rng) => {
      const trader = rng.pick(TRADERS);
      const errors = drawErrors(rng, plan(rng));
      if (errors === null) return null;
      const gaps = errors.map(tbNet);
      const net = gaps.reduce((s, g) => s + g, 0);
      const through = gaps.filter((g) => g !== 0).length;
      let found: string;
      if (suspense === 'none') {
        if (through !== 0) return null;
        const after = timing === 'agreed' || (timing === 'beforeOrAgreed' && rng.pick([true, false]));
        found = after
          ? `The trial balance of ${YEAR_END} agreed, so no Suspense A/c was opened. ${FOUND_AFTER}.`
          : 'The errors below were found while the books were being checked, before the trial balance was prepared, so no Suspense A/c exists.';
      } else {
        // Errors that cancel in total would have left the trial balance in agreement, and no Suspense A/c would exist.
        if (net === 0 || (suspense === 'all' ? through !== errors.length : through === 0 || through === errors.length)) return null;
        // A debit excess in the trial balance is made up by Suspense A/c on the credit side, the side that is short.
        found = `The trial balance of ${YEAR_END} did not agree, and the difference was put to a Suspense A/c, which opened with a ${net > 0 ? 'credit' : 'debit'} balance of ${f(Math.abs(net))}. ${FOUND_AFTER}; together they account for the whole of that difference${suspense === 'mixed' ? ', although some of them had not upset the trial balance at all' : ''}.`;
      }
      const listed = rng.shuffle(errors);
      const transactions = listed.map((c, i) => ({
        label: `Error ${i + 1}`,
        text: c.text,
        lines: rectifyingEntry(c),
        explanation: setSteps(c, suspense !== 'none'),
      }));
      const inEntries = new Set(transactions.flatMap((t) => t.lines.map((l) => l.accountId)));
      return {
        task: SET_TASK,
        opening: `${trader.owner} owns ${trader.firm}, which ${trader.what}. ${found} ${SET_CONVENTION}${listed.some((c) => c.text.startsWith('The owner took goods')) ? ` ${GOODS_TAKEN_NOTE}` : ''}`,
        transactions,
        hints: suspense === 'none' ? SET_HINTS_NO_SUSPENSE : SET_HINTS_SUSPENSE,
        // Suspense A/c, and the accounts the errors name that were right the first time, tempt a wrong entry.
        distractorAccounts: [...new Set(['suspense', ...listed.flatMap(accountsOf)])].filter((a) => !inEntries.has(a)),
      };
    },
    verify: verifySet(suspense),
  });
}

const ONE_SIDED_GROUPS: Maker[][] = [casting, notPosted, wrongSide, wrongAmountOfSet];

/** 1. Two-sided errors found before any Suspense A/c exists: a wrong account, a wrong person, a wrong class, an omission. */
const setBeforeTrialBalance = rectifySet('roe-set-before-trial-balance', 'easy', 'none', (rng) => [
  { groups: rng.shuffle([wrongExpense, wrongParty, principleA, omissions]), take: rng.pick([3, 4]) },
]);

/** 2. A first Suspense A/c: wrong totals and postings left out, each corrected for the figure given. */
const setTotalsAndPostings = rectifySet('roe-set-totals-and-postings', 'easy', 'all', (rng) => [
  { groups: rng.shuffle([casting, notPosted, casting, notPosted]), take: rng.pick([3, 4]) },
]);

/** 3. One-sided errors of all four kinds: a wrong total, a posting left out, a wrong side, a wrong figure. */
const setThroughSuspense = rectifySet('roe-set-through-suspense', 'medium', 'all', (rng) => [
  { groups: [...rng.shuffle(ONE_SIDED_GROUPS), ...rng.shuffle(ONE_SIDED_GROUPS)], take: rng.pick([4, 5]) },
]);

/** 4. One-sided and two-sided errors after the trial balance: Suspense A/c is in some entries and not in others. */
const setSuspenseOrNot = rectifySet('roe-set-suspense-or-not', 'medium', 'mixed', (rng) => {
  const n = rng.pick([4, 5]);
  const oneSided = n === 4 ? 2 : rng.pick([2, 3]);
  return [
    { groups: rng.shuffle(ONE_SIDED_GROUPS), take: oneSided },
    { groups: rng.shuffle([wrongExpense, wrongParty, omissions, principleA, principleB, reversed]), take: n - oneSided },
  ];
});

/** 5. Amounts to work out: a wrong side, a wrong figure, an invoice entered twice or with its digits changed over. */
const setWorkedAmounts = rectifySet('roe-set-worked-amounts', 'complex', 'mixed', (rng) => {
  const n = rng.pick([6, 7, 8]);
  return [
    { groups: [wrongSide, wrongAmountOfSet, bookSlip], take: 3 },
    { groups: rng.shuffle([reversed, wrongBook, assetWithItsCost, bookSlip, wrongSide, wrongAmountOfSet]), take: n - 5 },
    { groups: rng.shuffle([casting, notPosted]), take: 1 },
    { groups: rng.shuffle([wrongExpense, wrongParty, principleA, omissions]), take: 1 },
  ];
});

/** Capital items charged as expenses (and repairs added to an asset); items passed through the goods books, or goods taken out. */
const CAPITAL_AS_EXPENSE: Maker[] = [...principleA, ...carriageOnMachine];
const THROUGH_THE_GOODS: Maker[] = [...bookedAsGoods, ...goodsTaken];

/** 6. Errors of principle and their neighbours: capital items charged as expenses or passed through the goods books. */
const setPrinciple = rectifySet(
  'roe-set-principle',
  'medium',
  'none',
  (rng) => {
    const groups = [CAPITAL_AS_EXPENSE, THROUGH_THE_GOODS, principleB];
    // Each group is gone through twice, so that no one error stands in nearly every list.
    return [{ groups: [...rng.shuffle(groups), ...rng.shuffle(groups)], take: rng.pick([4, 5]), accept: (c) => !isPersonalExpense(c) }];
  },
  'beforeOrAgreed',
);

/** 7. What a trial balance that agrees can hide: entries the wrong way round, wrong books, slips in a book, omissions. */
const setTrialBalanceAgreed = rectifySet(
  'roe-set-trial-balance-agreed',
  'complex',
  'none',
  (rng) => [
    { groups: [reversed, wrongBook, bookSlip], take: 3 },
    {
      groups: rng.shuffle([wrongExpense, wrongParty, omissions, principleA, principleB, assetWithItsCost, bookedAsGoods, carriageOnMachine, goodsTaken, bookSlip, reversed]),
      take: rng.pick([3, 4, 5]),
    },
  ],
  'agreed',
);

const sets: Template[] = [
  setBeforeTrialBalance,
  setTotalsAndPostings,
  setThroughSuspense,
  setSuspenseOrNot,
  setWorkedAmounts,
  setPrinciple,
  setTrialBalanceAgreed,
];

// ---------------------------------------------------------------------------------------------------------------
// Formats: the Suspense A/c, prepared row by row.
//
// The data is a list of errors found after the trial balance, as in the sets, with one-sided and two-sided errors
// mixed. Every error has its rectifying entry (`rectifyingEntry`), and the account is written up from those entries by
// `accountOf`, so a two-sided error, whose entry does not name Suspense A/c, gives no row: the student has to leave
// it out, and to work out the side and the amount of each of the others.
//  - `roe-fmt-suspense` gives the balance the account opened with. Some seeds close the account; in others errors
//    not yet found leave a balance, which is carried down and brought down (and the data does not say which).
//  - `roe-fmt-suspense-find` does not give it: the errors account for the whole difference, so the opening figure is
//    the one that makes the account close, on the side that is short.
// The item the account opens with is called "Difference in trial balance", and the task says so: the topic speaks of
// "the difference put to a Suspense A/c" (its cards, its sets and its case studies), and the account is opened by the
// trial balance of 31 March, not brought down from an earlier period. "Balance b/d" is the name of a balance brought
// down below the totals. For the opening item it is other wording and not a mistake, so that row is also right as
// "Balance b/d" (`also`), in both formats and in the chained cases that prepare this account. It never makes two rows
// alike: the opening item stands above the totals, where no other row is called "Balance b/d", and a balance that is
// left (`roe-fmt-suspense`) is brought down below them, in a list of its own. There "Balance b/d" stays what it was:
// right for the balance that is left, and an extra row when none is. "Balance c/d" stays a wrong choice where the
// account closes: carrying the balancing figure down, when every error is found, is a mistake.
// `verify` reads every error again from its own sentence (`readError`, as the sets do) and builds the account from
// those readings.
// ---------------------------------------------------------------------------------------------------------------

const DIFFERENCE = 'Difference in trial balance';
const ITEM_TAGS = ['(a)', '(b)', '(c)', '(d)', '(e)', '(f)', '(g)', '(h)'];
const TO_BY = (side: Side): string => (side === 'Dr' ? 'To' : 'By');

function suspenseAccount(rng: Rng, mode: 'given' | 'find', plan: (rng: Rng) => SetPart[]): AccountParts | null {
  const trader = rng.pick(TRADERS);
  const errors = drawErrors(rng, plan(rng));
  if (errors === null) return null;
  const listed = rng.shuffle(errors);
  const gaps = listed.map(tbNet);
  const found = gaps.reduce((s, g) => s + g, 0);
  const through = gaps.filter((g) => g !== 0).length;
  // At least three rectifications in the account, and at least one error that has to be left out of it.
  if (through < 3 || through === listed.length) return null;
  // Where the opening balance is given, two seeds in five have errors still to be found, which leave a balance.
  const unknown = mode === 'given' && rng.int(0, 4) < 2 ? rng.pick([1, -1]) * money(rng, 500, 5000) : 0;
  // A debit excess in the trial balance is made up by Suspense A/c on the credit side: a debit balance is positive here.
  const opening = -(found + unknown);
  if (opening === 0) return null;
  const account = suspenseParts(trader.firm, listed, opening, mode);
  if (account === null) return null;
  const data = [
    `${trader.owner} owns ${trader.firm}, which ${trader.what}.${listed.some(takesGoods) ? ` ${GOODS_TAKEN_NOTE}` : ''} ` +
      (mode === 'given'
        ? `The trial balance of ${YEAR_END} did not agree, and the difference was put to a Suspense A/c, which opened with a ${sideWord(opening)} balance of ${f(Math.abs(opening))}. ${FOUND_AFTER}, and each has been rectified. Some of them had not upset the trial balance at all.`
        : `The trial balance of ${YEAR_END} did not agree, and the difference was put to a Suspense A/c. ${FOUND_AFTER}, and each has been rectified. Together they account for the whole of the difference, although some of them had not upset the trial balance at all.`),
    ...listed.map((c, i) => `${ITEM_TAGS[i]} ${c.text}`),
  ].join('\n');
  const { task, ...rest } = account;
  return { task, data, ...rest };
}

/** True for the error in which the owner takes goods: a list that has it states how such goods are recorded. */
const takesGoods = (c: Case): boolean => c.text.startsWith('The owner took goods');

/**
 * The Suspense A/c of one list of errors, in the order they are listed, without its data: every row, the task, the
 * wrong particulars on offer and the working. `opening` is the balance the account opened with (a debit balance is
 * positive) and `on` the date of the trial balance that opened it. Null when a side would have no row, or two rows of
 * a side could not be told apart. The format of the topic adds its data; a chained case study gives the same account
 * on its own case text.
 */
function suspenseParts(firm: string, listed: readonly Case[], opening: number, mode: 'given' | 'find', on: string = YEAR_END): Omit<AccountParts, 'data'> | null {
  const gaps = listed.map(tbNet);
  // Each entry carries the tag of its error where a dated entry has its date: it becomes the `ref` of the row.
  const entries: DatedEntry[] = listed.map((c, i) => ({ date: ITEM_TAGS[i], lines: rectifyingEntry(c) }));
  const view = accountOf(entries, 'suspense', { date: on, side: opening > 0 ? 'Dr' : 'Cr', amount: Math.abs(opening) });
  const left = view.balance;
  // The row the account opens with has its own name and the date of the trial balance; every other row refers to
  // its error ("(a)"), which the solution shows beside it. The errors have no dates, so those rows have none.
  const rowOf = (p: Posting): FormatRowParts =>
    p.accountIds.length === 0 ? { date: p.date, label: DIFFERENCE, also: [BALANCE_BD], amount: p.amount } : { ref: p.date, label: p.label, amount: p.amount };
  const rowsOf = (side: Side): FormatRowParts[] => [
    ...(side === 'Dr' ? view.debit : view.credit).map(rowOf),
    ...(left && left.side !== side ? [{ label: BALANCE_CD, amount: left.amount, closing: true }] : []),
  ];
  const belowOf = (side: Side): FormatRowParts[] => (left && left.side === side ? [{ label: BALANCE_BD, amount: left.amount }] : []);
  const [debits, credits] = [rowsOf('Dr'), rowsOf('Cr')];
  if (debits.length === 0 || credits.length === 0) return null;
  // Two rows of one side with the same particulars and amount could not be told apart.
  for (const rows of [debits, credits]) if (new Set(rows.map((r) => `${r.label}|${r.amount}`)).size < rows.length) return null;

  const opened = f(Math.abs(opening));
  const openSide: Side = opening > 0 ? 'Dr' : 'Cr';

  const steps = listed.map((c, i) => {
    const entry = rectifyingEntry(c);
    if (gaps[i] === 0) {
      return `${ITEM_TAGS[i]} Debits and credits stayed equal, so this error did not upset the trial balance. Its rectifying entry (${entryText(entry)}) does not touch Suspense A/c: no row.`;
    }
    const by = f(Math.abs(gaps[i]));
    const other = entry.find((l) => l.accountId !== 'suspense')!;
    const notes = amountNotes(c).map((n) => `${n} `).join('');
    return `${ITEM_TAGS[i]} ${notes}Taken alone, this error leaves the ${sideWord(gaps[i])} total of the trial balance ${by} more than the ${sideWord(-gaps[i])} total. Rectifying entry: ${entryText(entry)}. Suspense A/c is ${gaps[i] > 0 ? 'debited' : 'credited'}: "${TO_BY(gaps[i] > 0 ? 'Dr' : 'Cr')} ${accountName(other.accountId)} ${by}".`;
  });
  const total = (side: Side): string => {
    const xs = gaps.filter((g) => (side === 'Dr' ? g > 0 : g < 0)).map((g) => Math.abs(g));
    return xs.length === 0 ? 'nothing' : `${xs.map(f).join(' + ')}${xs.length > 1 ? ` = ${f(xs.reduce((a, b) => a + b, 0))}` : ''}`;
  };
  const openRow = `"${TO_BY(openSide)} ${DIFFERENCE} ${opened}"`;
  const explanation =
    mode === 'given'
      ? [
          `Suspense A/c opens with the difference on its ${sideWord(opening)} side, the side on which the trial balance was short: ${openRow}. It is the difference in the trial balance of ${on}, with which the account was opened, and is entered under that name.`,
          ...steps,
          `Beside the opening difference, the rectifications put ${total('Dr')} on the debit side and ${total('Cr')} on the credit side.`,
          left
            ? `The ${left.side === 'Dr' ? 'debit' : 'credit'} side is larger by ${f(left.amount)}: errors not yet found are still in the account. The balance is carried down, "${TO_BY(left.side === 'Dr' ? 'Cr' : 'Dr')} ${BALANCE_CD} ${f(left.amount)}", and brought down below the totals, "${TO_BY(left.side)} ${BALANCE_BD} ${f(left.amount)}". Until those errors are found it is shown in the balance sheet, on the ${left.side === 'Dr' ? 'assets' : 'liabilities'} side.`
            : `The two sides agree at ${f(view.total)}: the errors found account for the whole difference, so Suspense A/c is closed and nothing is carried down.`,
        ]
      : [
          ...steps,
          `The rectifications put ${total('Dr')} on the debit side of Suspense A/c and ${total('Cr')} on the credit side.`,
          `Every error behind the difference has been found, so the account must close. The ${sideWord(opening)} side is short by ${opened}: that is what the account opened with, ${openRow}.`,
          `So the ${sideWord(opening)} total of the trial balance had been ${opened} less than the ${sideWord(-opening)} total. Both sides of Suspense A/c now total ${f(view.total)}.`,
        ];

  const used = new Set([...debits, ...credits].map((r) => r.label));
  // The accounts of the errors that have no row (two-sided errors first) are what a student wrongly enters.
  const order = [...listed.filter((_, i) => gaps[i] === 0), ...listed.filter((_, i) => gaps[i] !== 0)];
  const named = order.flatMap((c) => [...rectifyingEntry(c).map((l) => l.accountId), ...accountsOf(c)]).filter((id) => id !== 'suspense').map(accountName);
  const tempting = [...new Set(named)].filter((label) => !used.has(label)).slice(0, 4);
  return {
    task:
      mode === 'given'
        ? `Prepare the Suspense A/c of ${firm} after these errors are rectified. Enter the difference it opened with as "${DIFFERENCE}"; if a balance is left, carry it down and bring it down.`
        : `Prepare the Suspense A/c of ${firm} and find the difference with which it was opened. Enter that difference as "${DIFFERENCE}".`,
    title: 'Suspense A/c',
    left: drSide(debits, belowOf('Dr')),
    right: crSide(credits, belowOf('Cr')),
    // The task asks for any balance to be brought down, so its place is shown whether or not one is left.
    ...(mode === 'given' ? { broughtDown: true } : {}),
    distractors: ['Suspense A/c', ...tempting, ...(mode === 'given' ? [BALANCE_BD] : []), BALANCE_CD, ...(tempting.length < 2 ? ['Profit and Loss A/c', 'Capital A/c'] : [])],
    explanation,
    hints:
      mode === 'given'
        ? [
            'Take the errors one at a time: did it leave one account wrong, or two accounts wrong by the same amount? Only the first kind is rectified through Suspense A/c.',
            'An error that made the debit total too large is rectified by a credit to the account that is wrong, so Suspense A/c is debited; and the other way round.',
          ]
        : [
            'Enter the rectifications first, each on its side of Suspense A/c, and leave out the errors that did not upset the trial balance.',
            'Once every error is found the account closes, so the difference it opened with is the figure that makes the two sides agree.',
          ],
  };
}

/** The first account `suspenseAccount` gives in a few goes: a list that cannot stand is drawn again before the seed is given up. */
function suspenseFormat(id: string, difficulty: Difficulty, mode: 'given' | 'find', plan: (rng: Rng) => SetPart[]) {
  return accountTemplate({
    id,
    topicId: T,
    conceptId: 'roe-formats',
    difficulty,
    generate: (rng) => {
      for (let go = 0; go < 4; go++) {
        const made = suspenseAccount(rng, mode, plan);
        if (made) return made;
      }
      return null;
    },
    // Every error is read again from its own sentence: an error that upset the trial balance has one row, for the
    // difference it caused, on the side its rectifying entry posts to Suspense A/c; an error that did not has none.
    verify: (q: AccountQuestion) => {
      const [head, ...items] = q.data.split('\n');
      const reads = items.map((item) => readError(item.replace(/^\([a-h]\) /, '')));
      if (reads.length < 4 || reads.some((r) => r === null)) return false;
      const tbs = reads.map((r) => r!.tb);
      const net = tbs.reduce((s, g) => s + g, 0);
      const given = /opened with a (debit|credit) balance of (₹[\d,]+)/.exec(head);
      const stated = given ? parseRupees(given[2]) : null;
      if (mode === 'given' ? stated === null || stated <= 0 : given !== null) return false;
      // Where the difference is not given, the errors account for all of it: the account opens with what closes it.
      const open = mode === 'given' ? (given![1] === 'debit' ? stated! : -stated!) : -net;
      return suspenseHolds(q, tbs, open, mode);
    },
  });
}

/**
 * A Suspense A/c checked against its errors as they were read again from their own sentences. `tbs` is what each
 * error did to the trial balance (debit total less credit total) and `open` the balance the account opened with (a
 * debit balance is positive). The account must open with that difference, have one row for every error that upset
 * the trial balance, on the side its rectifying entry posts to Suspense A/c, and carry down and bring down whatever
 * is left; where the difference had to be found, nothing may be left. Only the row it opens with has another wording,
 * "Balance b/d", and no row above the totals has that name of its own.
 */
function suspenseHolds(q: AccountQuestion, tbs: readonly number[], open: number, mode: 'given' | 'find'): boolean {
  const left = open + tbs.reduce((s, g) => s + g, 0); // each rectifying entry moves Suspense A/c by the difference its own error had caused
  if (open === 0 || (mode === 'find' && left !== 0)) return false;
  const key = (rows: { label: string; amounts: number[] }[]) => rows.map((r) => r.amounts[0]).sort((a, b) => a - b).join();
  const wanted = (side: 0 | 1) => tbs.filter((g) => (side === 0 ? g > 0 : g < 0)).map((g) => ({ label: '', amounts: [Math.abs(g)] }));
  for (const side of [0, 1] as const) {
    const rows = q.sides[side].rows;
    const first = rows.filter((r) => r.label === DIFFERENCE);
    const carried = rows.filter((r) => r.closing);
    const openHere = open > 0 === (side === 0);
    if (openHere ? first.length !== 1 || first[0].amounts[0] !== Math.abs(open) : first.length !== 0) return false;
    if (rows.some((r) => (r.label === DIFFERENCE ? r.also?.join() !== BALANCE_BD : r.also !== undefined || r.label === BALANCE_BD))) return false;
    // A balance that is left is carried down on the shorter side and brought down on its own.
    const carriedHere = left !== 0 && left > 0 === (side === 1);
    if (carriedHere ? carried.length !== 1 || carried[0].label !== BALANCE_CD || carried[0].amounts[0] !== Math.abs(left) : carried.length !== 0) return false;
    const below = q.sides[side].below;
    const broughtHere = left !== 0 && left > 0 === (side === 0);
    if (broughtHere ? below.length !== 1 || below[0].label !== BALANCE_BD || below[0].also !== undefined || below[0].amounts[0] !== Math.abs(left) : below.length !== 0) return false;
    if (key(rows.filter((r) => r.label !== DIFFERENCE && !r.closing)) !== key(wanted(side))) return false;
  }
  return true;
}

/** 1. The opening balance given: three or four rectifications through Suspense A/c among five or six errors, closing or not. */
const fmtSuspense = suspenseFormat('roe-fmt-suspense', 'medium', 'given', (rng) => [
  { groups: rng.shuffle([casting, notPosted, casting, notPosted, wrongSide]), take: rng.pick([3, 4]) },
  { groups: rng.shuffle([wrongExpense, wrongParty, omissions, principleA, principleB]), take: rng.pick([1, 2]) },
]);

/** 2. The opening balance to be found: wrong sides and wrong figures among the rectifications, and the account closes. */
const fmtSuspenseFind = suspenseFormat('roe-fmt-suspense-find', 'complex', 'find', (rng) => [
  { groups: rng.shuffle([wrongSide, wrongAmountOfSet]), take: 2 },
  { groups: rng.shuffle([casting, notPosted, casting, notPosted]), take: rng.pick([2, 3]) },
  { groups: rng.shuffle([reversed, wrongBook, bookSlip, wrongExpense, principleA, omissions]), take: rng.pick([1, 2]) },
]);

const formats: Template[] = [fmtSuspense, fmtSuspenseFind];

// ---------------------------------------------------------------------------------------------------------------
// For the chained case studies of the stage "Finding and correcting errors" (`cases/errors-and-suspense.ts`): one
// list of errors on which the student passes the rectifying entries and then prepares the Suspense A/c. A case draws
// its own errors and hands them over in the shape of this file, so that the working of its entries and its Suspense
// A/c are those of the sets and the formats above. Nothing here makes a question of this file.
// ---------------------------------------------------------------------------------------------------------------

/** An error as the sets and the formats of this topic model it. */
export type RoeError = Case;

export const ROE_CHAIN = {
  /** What the item a Suspense A/c opens with is called. */
  difference: DIFFERENCE,
  /** The working of one rectifying entry of a list; the second argument says whether a Suspense A/c is open. */
  setSteps,
  /** The Suspense A/c of a list of errors, without its data, and the check of it against the errors as read. */
  suspense: suspenseParts,
  suspenseHolds,
};

// ---------------------------------------------------------------------------------------------------------------
// Added after the papers were set (outsidePapers keeps these off the papers, the worksheets and the Look back levels):
// errors in carrying forward, a wrong opening balance brought down, combined errors (a wrong figure on the wrong side),
// errors in the trial balance itself, and the "effect of errors" statement. Each new sentence has its reading in
// READERS (pushed below), so the checks stay independent of the postings modelled here.
// ---------------------------------------------------------------------------------------------------------------

/**
 * A figure carried forward, brought down or posted, and the wrong one used instead: two digits transposed (₹3,700 as
 * ₹7,300, ₹46,000 as ₹64,000) or a figure near it. Of the size of a page total or a balance, never equal.
 */
function slipPair(rng: Rng): [Paise, Paise] | null {
  if (rng.pick([true, false])) {
    const a = rng.int(1, 9);
    const b = rng.int(1, 9);
    if (a === b) return null;
    const scale = rng.pick([100, 1000]);
    return [(10 * a + b) * scale * 100, (10 * b + a) * scale * 100];
  }
  const x = money(rng, 5000, 80000);
  const y = x + rng.pick([-1, 1]) * money(rng, 500, 5000);
  return y > 0 && y !== x ? [x, y] : null;
}

const CF_EXPENSES = ['wages', 'salaries', 'rent', 'advertisement'] as const;

/** A page total of a book, or the side total of an account, carried forward to the next page as another figure. */
const carryForward: Maker[] = [
  (rng) => {
    const w = slipPair(rng);
    if (!w) return null;
    const [x, y] = w;
    return { text: `The total of one page of the Sales Book, ${f(x)}, was carried forward to the next page as ${f(y)}.`, kind: 'commission', done: [cr('sales', y)], should: [cr('sales', x)] };
  },
  (rng) => {
    const w = slipPair(rng);
    if (!w) return null;
    const [x, y] = w;
    return { text: `The total of one page of the Purchases Book, ${f(x)}, was carried forward to the next page as ${f(y)}.`, kind: 'commission', done: [dr('purchases', y)], should: [dr('purchases', x)] };
  },
  (rng) => {
    const w = slipPair(rng);
    if (!w) return null;
    const [x, y] = w;
    return { text: `The total of one page of the Purchases Return Book, ${f(x)}, was carried forward to the next page as ${f(y)}.`, kind: 'commission', done: [cr('purchasesReturn', y)], should: [cr('purchasesReturn', x)] };
  },
  (rng) => {
    const w = slipPair(rng);
    if (!w) return null;
    const [x, y] = w;
    const account = rng.pick(CF_EXPENSES);
    return { text: `The total of the debit side of ${accountName(account)}, ${f(x)}, was carried forward to the next page as ${f(y)}.`, kind: 'commission', done: [dr(account, y)], should: [dr(account, x)] };
  },
  (rng) => {
    const w = slipPair(rng);
    if (!w) return null;
    const [x, y] = w;
    const [p] = who(rng, 1);
    return { text: `The total of the debit side of the account of ${p}, a customer, ${f(x)}, was carried forward to the next page as ${f(y)}.`, kind: 'commission', done: [dr(debtor(p), y)], should: [dr(debtor(p), x)] };
  },
  (rng) => {
    const w = slipPair(rng);
    if (!w) return null;
    const [x, y] = w;
    const [p] = who(rng, 1);
    return { text: `The total of the credit side of the account of ${p}, a supplier, ${f(x)}, was carried forward to the next page as ${f(y)}.`, kind: 'commission', done: [cr(creditor(p), y)], should: [cr(creditor(p), x)] };
  },
];

/** Real accounts whose opening balance is brought down, with their usual side. */
const BD_ACCOUNTS = ['furniture', 'machinery', 'billsReceivable', 'bankLoan', 'billsPayable'] as const;

/** An opening balance brought down as a wrong figure. */
const wrongBalance: Maker[] = [
  (rng) => {
    const w = slipPair(rng);
    if (!w) return null;
    const [x, y] = w;
    const account = rng.pick(BD_ACCOUNTS);
    const post = normalSide(resolveAccount(account)) === 'Dr' ? dr : cr;
    return { text: `The opening balance of ${accountName(account)} was brought down as ${f(y)} instead of ${f(x)}.`, kind: 'commission', done: [post(account, y)], should: [post(account, x)] };
  },
  (rng) => {
    const w = slipPair(rng);
    if (!w) return null;
    const [x, y] = w;
    const [p] = who(rng, 1);
    return { text: `The opening balance of the account of ${p}, a customer, was brought down as ${f(y)} instead of ${f(x)}.`, kind: 'commission', done: [dr(debtor(p), y)], should: [dr(debtor(p), x)] };
  },
  (rng) => {
    const w = slipPair(rng);
    if (!w) return null;
    const [x, y] = w;
    const [p] = who(rng, 1);
    return { text: `The opening balance of the account of ${p}, a supplier, was brought down as ${f(y)} instead of ${f(x)}.`, kind: 'commission', done: [cr(creditor(p), y)], should: [cr(creditor(p), x)] };
  },
];

const CB_EXPENSES: [string, string][] = [
  ['rent', 'Rent'],
  ['salaries', 'Salaries'],
  ['wages', 'Wages'],
  ['advertisement', 'Advertisement charges'],
];
const CB_INCOMES: [string, string][] = [
  ['commissionReceived', 'Commission'],
  ['rentReceived', 'Rent'],
];

/** A wrong figure posted on the wrong side: the account is out by the right figure and the wrong one together. */
const combined: Maker[] = [
  (rng) => {
    const w = slipPair(rng);
    if (!w) return null;
    const [x, y] = w;
    const [p] = who(rng, 1);
    return { text: `${f(x)} received from ${p}, a customer, was recorded correctly in the Cash Book, but in the account of ${p} it was posted as a debit of ${f(y)}.`, kind: 'commission', done: [dr(debtor(p), y)], should: [cr(debtor(p), x)] };
  },
  (rng) => {
    const w = slipPair(rng);
    if (!w) return null;
    const [x, y] = w;
    const [p] = who(rng, 1);
    return { text: `${f(x)} paid to ${p}, a supplier, was recorded correctly in the Cash Book, but in the account of ${p} it was posted as a credit of ${f(y)}.`, kind: 'commission', done: [cr(creditor(p), y)], should: [dr(creditor(p), x)] };
  },
  (rng) => {
    const w = slipPair(rng);
    if (!w) return null;
    const [x, y] = w;
    const [account, what] = rng.pick(CB_EXPENSES);
    return { text: `${what} of ${f(x)} paid by cheque was recorded correctly in the Cash Book, but ${accountName(account)} was credited with ${f(y)}.`, kind: 'commission', done: [cr(account, y)], should: [dr(account, x)] };
  },
  (rng) => {
    const w = slipPair(rng);
    if (!w) return null;
    const [x, y] = w;
    const [account, what] = rng.pick(CB_INCOMES);
    return { text: `${what} of ${f(x)} received by cheque was recorded correctly in the Cash Book, but ${accountName(account)} was debited with ${f(y)}.`, kind: 'commission', done: [dr(account, y)], should: [cr(account, x)] };
  },
  (rng) => {
    const w = slipPair(rng);
    if (!w) return null;
    const [x, y] = w;
    const [p] = who(rng, 1);
    return { text: `Goods sold on credit to ${p} for ${f(x)} were entered correctly in the Sales Book, but the account of ${p} was credited with ${f(y)}.`, kind: 'commission', done: [cr(debtor(p), y)], should: [dr(debtor(p), x)] };
  },
];

/** Accounts whose balance is copied into the trial balance wrongly: the ledger is right, only the trial balance is not. */
const TB_ACCOUNTS = ['furniture', 'machinery', 'rent', 'wages', 'salaries', 'billsReceivable', 'drawings', 'bankLoan', 'billsPayable', 'commissionReceived', 'rentReceived'] as const;

interface TbSlip {
  text: string;
  /** Debit total minus credit total of the trial balance, caused by the slip. */
  tb: number;
  account: string;
}

/** A slip in the trial balance itself: a balance left out, in the wrong column, or copied as a wrong figure. */
function tbSlip(rng: Rng): TbSlip | null {
  const account = rng.pick(TB_ACCOUNTS);
  const debit = normalSide(resolveAccount(account)) === 'Dr';
  const name = accountName(account);
  const sign = debit ? 1 : -1;
  switch (rng.pick(['left out', 'column', 'figure'] as const)) {
    case 'left out': {
      const x = money(rng, 2000, 60000);
      return { text: `The balance of ${name}, ${f(x)}, was left out of the trial balance.`, tb: -sign * x, account };
    }
    case 'column': {
      const x = money(rng, 2000, 40000);
      return { text: `The balance of ${name}, ${f(x)}, was written in the ${debit ? 'credit' : 'debit'} column of the trial balance.`, tb: -sign * 2 * x, account };
    }
    default: {
      const w = slipPair(rng);
      if (!w) return null;
      const [x, y] = w;
      return { text: `The balance of ${name}, ${f(x)}, was written in the trial balance as ${f(y)}.`, tb: sign * (y - x), account };
    }
  }
}

const minus = (a: number[]) => a[0] - a[1];
const plusBoth = (a: number[]) => a[0] + a[1];
const negBoth = (a: number[]) => -(a[0] + a[1]);
const backwards = (a: number[]) => a[1] - a[0];

READERS.push(
  // Carried forward: the first figure is the right total, the second the one carried.
  reader('The total of one page of the Sales Book, #, was carried forward to the next page as #', minus, backwards),
  reader('The total of one page of the Purchases Book, #, was carried forward to the next page as #', backwards, minus),
  reader('The total of one page of the Purchases Return Book, #, was carried forward to the next page as #', minus, backwards),
  ...CF_EXPENSES.map((id) => reader(`The total of the debit side of ${accountName(id)}, #, was carried forward to the next page as #`, backwards, minus)),
  reader('The total of the debit side of the account of ~, a customer, #, was carried forward to the next page as #', backwards, NIL),
  reader('The total of the credit side of the account of ~, a supplier, #, was carried forward to the next page as #', minus, NIL),
  // Brought down as the first figure instead of the second.
  ...BD_ACCOUNTS.map((id) => reader(`The opening balance of ${accountName(id)} was brought down as # instead of #`, normalSide(resolveAccount(id)) === 'Dr' ? minus : backwards, NIL)),
  reader('The opening balance of the account of ~, a customer, was brought down as # instead of #', minus, NIL),
  reader('The opening balance of the account of ~, a supplier, was brought down as # instead of #', backwards, NIL),
  // A wrong figure on the wrong side: the right figure and the wrong one together.
  reader('# received from ~, a customer, was recorded correctly in the Cash Book, but in the account of ~ it was posted as a debit of #', plusBoth, NIL),
  reader('# paid to ~, a supplier, was recorded correctly in the Cash Book, but in the account of ~ it was posted as a credit of #', negBoth, NIL),
  ...CB_EXPENSES.map(([id, what]) => reader(`${what} of # paid by cheque was recorded correctly in the Cash Book, but ${accountName(id)} was credited with #`, negBoth, plusBoth)),
  ...CB_INCOMES.map(([id, what]) => reader(`${what} of # received by cheque was recorded correctly in the Cash Book, but ${accountName(id)} was debited with #`, plusBoth, negBoth)),
  reader('Goods sold on credit to ~ for # were entered correctly in the Sales Book, but the account of ~ was credited with #', negBoth, NIL),
  // The trial balance itself: the ledger is right, so the profit is untouched.
  ...TB_ACCOUNTS.flatMap((id) => {
    const debit = normalSide(resolveAccount(id)) === 'Dr';
    const name = accountName(id);
    return [
      reader(`The balance of ${name}, #, was left out of the trial balance`, times(debit ? -1 : 1), NIL),
      reader(`The balance of ${name}, #, was written in the ${debit ? 'credit' : 'debit'} column of the trial balance`, times(debit ? -2 : 2), NIL),
      reader(`The balance of ${name}, #, was written in the trial balance as #`, debit ? backwards : minus, NIL),
    ];
  }),
);

const CF_HINTS = [
  'Which account received the wrong figure when the total was carried forward or the balance brought down?',
  'Only that account is wrong, by the gap between the right and the wrong figure, so the entry corrects it and takes Suspense A/c as the other side: debit Suspense A/c if the slip made the debit total larger, credit it if it made the credit total larger.',
];
const COMBINED_HINTS = [
  'Two things went wrong at once: the side and the figure. What should the account show, and what does it show?',
  'Take out the wrong posting and put in the right one: the account moves by the right figure and the wrong figure together, and Suspense A/c takes the other side.',
];

const rectCarryForward = rectifyTemplate('roe-carry-forward', 'roe-suspense', 'medium', carryForward, 'always', { computed: true, hints: CF_HINTS });
const rectWrongBalanceBd = rectifyTemplate('roe-wrong-balance-bd', 'roe-suspense', 'medium', wrongBalance, 'always', { computed: true, hints: CF_HINTS });
const rectCombined = rectifyTemplate('roe-combined-error', 'roe-suspense', 'complex', combined, 'always', { computed: true, hints: COMBINED_HINTS });

/** "The trial balance is corrected and Suspense A/c is credited with ₹x": the treatment of a slip in the trial balance. */
const tbTreatment = (name: string, side: 'debited' | 'credited', a: number) =>
  `No entry in ${name}: the trial balance is corrected, and Suspense A/c is ${side} with ${f(a)}`;
const TB_SLIP_SENTENCE = /The balance of (.+? A\/c), (₹[\d,]+), was (left out of the trial balance|written in the (debit|credit) column of the trial balance|written in the trial balance as (₹[\d,]+))\./;

const omittedBalance = mcqTemplate({
  id: 'roe-omitted-balance',
  topicId: T,
  conceptId: 'roe-suspense',
  difficulty: 'medium',
  generate: (rng) => {
    const s = tbSlip(rng);
    if (!s || s.tb === 0) return null;
    const name = accountName(s.account);
    const a = Math.abs(s.tb);
    const right = s.tb > 0 ? 'debited' : 'credited';
    const wrong = s.tb > 0 ? 'credited' : 'debited';
    const amounts = amountsIn(s.text);
    const leftOut = s.text.includes('left out');
    const otherAmount = leftOut ? 2 * a : s.text.includes('column') ? a / 2 : amounts[1];
    const distractors = distinctOptions(tbTreatment(name, right, a), [
      { text: tbTreatment(name, wrong, a), why: `Put Suspense A/c on the wrong side: the slip made the ${s.tb > 0 ? 'debit' : 'credit'} total larger, so Suspense A/c is ${right} to undo it.` },
      {
        text: tbTreatment(name, right, otherAmount),
        why: leftOut
          ? 'Doubled the amount: a balance left out puts one column out by its amount once.'
          : s.text.includes('column')
            ? 'Counted the amount once: a balance in the wrong column is missing from one column and added to the other, twice its amount.'
            : 'Gave the figure written in the trial balance instead of the gap between it and the right balance.',
      },
      {
        text: `${name} is ${right === 'debited' ? 'credited' : 'debited'} with ${f(a)}, and Suspense A/c is ${right} with ${f(a)}`,
        why: 'Corrected the ledger account, which was right all along; the slip was made only in copying the balance into the trial balance.',
      },
      { text: 'Only the trial balance is redrawn; Suspense A/c is left as it is', why: 'Forgot that this slip is part of the difference held in Suspense A/c, so putting it right changes Suspense A/c too.' },
    ]);
    if (distractors === null) return null;
    return {
      prompt: `The trial balance of ${firmOf(rng)} did not agree, and the difference was put to a Suspense A/c. Later it is found that: ${s.text} The ledger account itself is correct. How is this put right?`,
      correct: tbTreatment(name, right, a),
      distractors,
      explanation: `${name} is right in the ledger; only the trial balance was wrong. The slip made the ${s.tb > 0 ? 'debit' : 'credit'} total larger by ${f(a)}, so no journal entry is passed between ledger accounts: the trial balance is corrected and Suspense A/c is ${right} with ${f(a)} (an entry in Suspense A/c alone).`,
      hints: [
        'Is any ledger account wrong here, or only the trial balance drawn from it?',
        'When only the trial balance is wrong, no account is corrected: the figure is put right in the trial balance and Suspense A/c is debited or credited by the gap the slip caused, on the side that undoes it.',
      ],
    };
  },
  verify: (q) => {
    const m = TB_SLIP_SENTENCE.exec(q.prompt);
    const r = read(q.prompt);
    if (!m || !r || r.tb === 0) return false;
    return correctText(q) === tbTreatment(m[1], r.tb > 0 ? 'debited' : 'credited', Math.abs(r.tb));
  },
});

const suspenseBalances = numericTemplate({
  id: 'roe-suspense-balances',
  topicId: T,
  conceptId: 'roe-suspense-balance',
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const slip = tbSlip(rng);
    const c1 = rng.pick(carryForward)(rng);
    const c2 = rng.pick([...wrongBalance, ...combined])(rng);
    if (!slip || !c1 || !c2 || overlap(c1, c2) || accountsOf(c1).includes(slip.account) || accountsOf(c2).includes(slip.account)) return null;
    const items = rng.shuffle([
      { text: slip.text, tb: slip.tb },
      { text: c1.text, tb: tbNet(c1) },
      { text: c2.text, tb: tbNet(c2) },
    ]);
    if (items.some((i) => i.tb === 0)) return null;
    const foundGap = items.reduce((s, i) => s + i.tb, 0);
    // The difference the trial balance showed, in whole hundreds of rupees; errors not yet found make up the rest.
    const total = Math.round((foundGap + rng.pick([1, -1]) * money(rng, 500, 5000)) / 10000) * 10000;
    if (total === 0 || Math.abs(total - foundGap) < 10000) return null;
    const opening = -total;
    const remaining = opening + foundGap;
    const answer = Math.abs(remaining);
    const all = items.reduce((s, i) => s + Math.abs(i.tb), 0);
    const sign = opening > 0 ? 1 : -1;
    const commonErrors = errs(answer, [
      { value: Math.abs(sign * (Math.abs(opening) - all)), why: 'Took every correction as reducing the Suspense balance, whichever side of Suspense A/c it fell on.' },
      { value: Math.abs(opening) + all, why: 'Took every correction as adding to the Suspense balance, whichever side of Suspense A/c it fell on.' },
      { value: Math.abs(opening + foundGap - items.find((i) => i.text === slip.text)!.tb), why: 'Left the slip in the trial balance out, thinking that what needs no journal entry needs no change in Suspense A/c.' },
    ]);
    if (commonErrors.length < 2) return null;
    const roman = ['(i)', '(ii)', '(iii)'];
    const sideOf = (n: number) => (n > 0 ? 'debit' : 'credit');
    return {
      prompt: `The trial balance of ${firmOf(rng)} did not agree, and Suspense A/c was opened with a ${sideOf(opening)} balance of ${f(Math.abs(opening))}. Three of the errors behind the difference were then found and put right. ${items.map((i, k) => `${roman[k]} ${i.text}`).join(' ')} Other errors, not yet found, make up the rest of the difference. What amount remains in Suspense A/c? (Give the amount only.)`,
      answer,
      commonErrors,
      explanation: [
        ...items.map((i, k) => `${roman[k]} The slip made the ${sideOf(i.tb)} total larger by ${f(Math.abs(i.tb))}, so putting it right ${i.tb > 0 ? 'debits' : 'credits'} Suspense A/c with ${f(Math.abs(i.tb))}.`),
        `Suspense A/c opened with ${f(Math.abs(opening))} ${sideOf(opening)}; net of the three, ${f(Math.abs(foundGap))} ${sideOf(foundGap)}.`,
        `Balance left: ${f(answer)} ${sideOf(remaining)}, the effect of the errors not yet found.`,
      ],
      hints: [
        'Treat each slip on its own: which total did it make larger, and by how much? A balance copied wrongly into the trial balance counts too, though it needs no journal entry.',
        'Each correction debits Suspense A/c when its slip made the debit total larger and credits it otherwise. Net them against the opening balance.',
      ],
    };
  },
  verify: (q) => {
    const left = suspenseLeft(q.prompt);
    return left !== null && left !== 0 && q.answer === Math.abs(left);
  },
});

// roe-fmt-effect: the effect of each error on the trial balance and on the profit, in a statement of four columns.
const EFFECT_COLUMNS = ['Debit total larger by (₹)', 'Credit total larger by (₹)', 'Profit overstated by (₹)', 'Profit understated by (₹)'];
const EFFECT_TAGS = ['(i)', '(ii)', '(iii)', '(iv)', '(v)'];
const effectRow = (tb: number, profit: number): number[] => [Math.max(tb, 0), Math.max(-tb, 0), Math.max(profit, 0), Math.max(-profit, 0)];

const fmtEffect = statementTemplate({
  id: 'roe-fmt-effect',
  topicId: T,
  conceptId: 'roe-formats',
  difficulty: 'complex',
  generate: (rng) => {
    const groups: Maker[][] = [ONE_SIDED, ONE_SIDED, [...principleA, ...principleB, ...reversed], [...carryForward, ...combined], EVERYTHING];
    const cases: Case[] = [];
    for (const group of groups) {
      let c: Case | null = null;
      for (let i = 0; i < 8 && c === null; i++) {
        const t = rng.pick(group)(rng);
        if (t && (tbNet(t) !== 0 || profitEffect(t) !== 0) && cases.every((o) => !overlap(o, t) && o.text !== t.text)) c = t;
      }
      if (c === null) return null;
      cases.push(c);
    }
    const shown = rng.shuffle(cases);
    const firm = firmOf(rng);
    const profit = money(rng, 150000, 600000, 5000);
    const rows = shown.map((c, i) => ({ label: `Error ${EFFECT_TAGS[i]}`, amounts: effectRow(tbNet(c), profitEffect(c)) }));
    const totals = [0, 1, 2, 3].map((k) => rows.reduce((s, r) => s + r.amounts[k], 0));
    const netTb = totals[0] - totals[1];
    const netProfit = totals[2] - totals[3];
    const corrected = profit - netProfit;
    if (corrected <= 0) return null;
    return {
      task: `Show, for each error, by how much it made the debit or the credit total of the trial balance larger and by how much it overstated or understated the profit; then total the columns.`,
      data: `${firm}: the trial balance on 31 March did not agree, and the profit as per the books is ${f(profit)}. The errors below were found after the final accounts had been prepared. ${IGNORE_DEPRECIATION} Leave a column at nil where an error has no such effect.\n${shown.map((c, i) => `${EFFECT_TAGS[i]} ${c.text}`).join('\n')}`,
      title: `Effect of the errors in the books of ${firm}`,
      heading: 'Error',
      columns: EFFECT_COLUMNS,
      rows: [...rows, { subtotal: 'Total', amounts: totals, sum: 'all' as const }],
      distractors: ['Error (vi)', 'Error (vii)'],
      explanation: [
        ...shown.map((c, i) => {
          const tb = tbNet(c);
          const pe = profitEffect(c);
          const tbPart = tb === 0 ? 'the trial balance still agrees' : `the ${tb > 0 ? 'debit' : 'credit'} total is larger by ${f(Math.abs(tb))}`;
          const pPart = pe === 0 ? 'the profit is not affected' : `profit is ${pe > 0 ? 'overstated' : 'understated'} by ${f(Math.abs(pe))}`;
          return `${EFFECT_TAGS[i]} ${tbPart}; ${pPart}.`;
        }),
        netTb === 0
          ? 'Together these errors leave the two totals equal.'
          : `Together they make the ${netTb > 0 ? 'debit' : 'credit'} total larger by ${f(Math.abs(netTb))}: that much of the difference held in Suspense A/c is explained.`,
        netProfit === 0
          ? `Their effects on profit cancel: the corrected profit is ${f(profit)}.`
          : `Net, the profit is ${netProfit > 0 ? 'overstated' : 'understated'} by ${f(Math.abs(netProfit))}: corrected profit = ${f(profit)} ${netProfit > 0 ? '-' : '+'} ${f(Math.abs(netProfit))} = ${f(corrected)}.`,
      ],
      hints: [
        'Take one error at a time and ask two questions: did it leave one account wrong (the trial balance) and did it leave an income or an expense wrong (the profit)?',
        'A one-sided error makes one total larger by the gap it caused; an expense too low or an income too high overstates the profit. Put each figure in its column and leave the others at nil.',
      ],
    };
  },
  verify: (q: StatementQuestion) => {
    const lines = q.data.split('\n').slice(1);
    if (lines.length !== EFFECT_TAGS.length) return false;
    const expected: number[][] = [];
    for (const [i, line] of lines.entries()) {
      if (!line.startsWith(`${EFFECT_TAGS[i]} `)) return false;
      const r = read(line);
      if (r === null || (r.tb === 0 && r.profit === 0)) return false;
      expected.push(effectRow(r.tb, r.profit));
    }
    const plain = q.rows;
    const total = q.lines?.find((l) => 'subtotal' in l) as { amounts: number[] } | undefined;
    const sums = [0, 1, 2, 3].map((k) => expected.reduce((s, e) => s + e[k], 0));
    return (
      plain.length === expected.length &&
      plain.every((row, i) => row.label === `Error ${EFFECT_TAGS[i]}` && row.amounts.join() === expected[i].join()) &&
      total !== undefined &&
      total.amounts.join() === sums.join()
    );
  },
});

const laterTemplates: Template[] = [rectCarryForward, rectWrongBalanceBd, rectCombined, omittedBalance, suspenseBalances, fmtEffect];

const all: Template[] = [...templates, ...sets, ...formats];

// Assertion and Reason comes last, and is on its own level and on no mock paper (see assertionReason.ts).
const assertionReasonBank = assertionReasonTemplate({
  prefix: 'roe', topicId: 'rectification-of-errors', conceptId: 'roe-tb-effect',
  items: [
    {
      answer: 'explains',
      a: 'A transaction left out of the books altogether does not affect the agreement of the trial balance.',
      r: 'Neither its debit nor its credit has been recorded.',
      aWhy: 'The two totals are lower by the same amount, so they still agree.',
      rWhy: 'That is what a complete omission is.',
      link: 'With both sides missing, the totals remain equal, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'Cash of ₹2,000 received from Rao was entered in the cash book but not posted to Rao\'s account, so the trial balance disagrees by ₹2,000.',
      r: 'One half of the entry is missing.',
      aWhy: 'The debit stands and the credit does not, so the credit total is short by ₹2,000.',
      rWhy: 'This is a partial omission.',
      link: 'The totals differ because only one side was recorded, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'Repairs of ₹3,000 wrongly debited to Machinery A/c overstate the profit.',
      r: 'An expense has been treated as an asset, so the expenses are too low.',
      aWhy: 'The expense is missing from the Profit and Loss Account, so the profit shown is too high.',
      rWhy: 'This is an error of principle.',
      link: 'The profit is too high because the expense was left out of the Profit and Loss Account, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'A credit sale of ₹4,000 to Asha, entered as a debit to Sales A/c and a credit to Asha, is rectified with ₹8,000.',
      r: 'The wrong entry has to be cancelled first, and the right one then passed.',
      aWhy: 'Asha is debited and Sales A/c is credited with 2 × ₹4,000.',
      rWhy: 'Each step needs the original amount.',
      link: 'Undoing and redoing make two amounts of ₹4,000, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'Rent of ₹6,000 wrongly debited to Salaries A/c is rectified without a Suspense A/c.',
      r: 'The error leaves the debit and the credit totals equal.',
      aWhy: 'The entry is Rent A/c Dr; To Salaries A/c.',
      rWhy: 'One debit stands in the wrong account, but the amount is still debited once.',
      link: 'The error caused no difference, so there is nothing to clear through Suspense A/c, and R explains A.',
    },
    {
      answer: 'not-the-reason',
      a: 'Wages of ₹4,000 wrongly debited to Salaries A/c leave the net profit unchanged.',
      r: 'The trial balance still agrees in spite of this error.',
      aWhy: 'Both are charged before the net profit is found, so the total of the expenses is the same.',
      rWhy: 'The amount is still debited once and credited once.',
      link: 'Many errors leave the trial balance agreeing and still change the profit. Here the profit stands because both are expenses.',
    },
    {
      answer: 'not-the-reason',
      a: 'Furniture of ₹10,000 debited to Purchases A/c is an error of principle.',
      r: 'An error of principle leaves the trial balance in agreement.',
      aWhy: 'A capital item has been treated as revenue.',
      rWhy: 'The amount is debited once and credited once.',
      link: 'R is what follows from such an error. The class of error comes from the wrong treatment of the capital item.',
    },
    {
      answer: 'not-the-reason',
      a: 'A Suspense A/c is opened when the two columns of the trial balance differ.',
      r: 'A two-sided error is rectified without a Suspense A/c.',
      aWhy: 'It holds the difference until the errors are found.',
      rWhy: 'A two-sided error causes no difference.',
      link: 'R tells when the account is not used. It is opened to make the columns agree for the time being.',
    },
    {
      answer: 'a-only',
      a: 'A wrong amount written in the journal and posted from there to both accounts does not affect the agreement of the trial balance.',
      r: 'Every error of commission upsets the agreement of the trial balance.',
      aWhy: 'The same wrong amount is debited and credited.',
      rWhy: 'Some do and some do not; an error that is equal on both sides leaves the totals equal.',
    },
    {
      answer: 'a-only',
      a: 'Salaries of ₹5,000 paid in cash were not posted to Salaries A/c; found after the trial balance, this is rectified by debiting Salaries A/c and crediting Suspense A/c.',
      r: 'Every rectifying entry posts Suspense A/c on the side opposite to the one it had in the trial balance.',
      aWhy: 'Salaries A/c needs the debit. The missing debit made the credit total larger, so Suspense A/c is credited to undo it.',
      rWhy: 'Not every entry: each one posts Suspense A/c on the side that undoes its own error. When errors pull the columns opposite ways, an entry may post it on the same side it had in the trial balance.',
    },
    {
      answer: 'r-only',
      a: 'Every error changes the net profit.',
      r: 'An error between two balance sheet items leaves the net profit unchanged.',
      aWhy: 'Only an error that leaves the total of expenses or of incomes wrong changes it.',
      rWhy: 'Such an error never reaches the Profit and Loss Account.',
    },
    {
      answer: 'r-only',
      a: 'The complete omission of a credit sale of ₹7,000 is rectified through a Suspense A/c.',
      r: 'A complete omission leaves the debits equal to the credits.',
      aWhy: 'The entry is simply passed now, with no Suspense A/c, since it caused no difference.',
      rWhy: 'Neither side was recorded.',
    },
  ],
});

// Version 2: the item on the side of Suspense A/c no longer teaches "the opposite side" as a rule.
const assertionReason: Template = { ...assertionReasonBank, version: 2 };

// The templates added after the papers were set stand last, so that no template before them moves.
const withAssertionReason: Template[] = [...all, assertionReason, ...laterTemplates];

export default withAssertionReason;
