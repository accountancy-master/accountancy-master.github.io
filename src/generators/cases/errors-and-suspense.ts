/**
 * Case studies of the stage "Finding and correcting errors", played after Rectification of Errors.
 *
 * Every error is written twice. A maker states what was posted (`done`) and what should have been posted (`should`);
 * the effect on the trial balance, the rectifying entry and the effect on profit are worked out from those two lists,
 * so the questions of a case cannot disagree with each other. Separately, READERS says for every sentence, from its
 * wording alone, what the error does to the trial balance and to the profit; `verify` reads the case text again with
 * it and recomputes each answer by another route.
 *
 * Conventions (those of `templates/rectification-of-errors.ts`):
 *  - the difference in a trial balance goes to Suspense A/c on the side that is short;
 *  - an error that left one account wrong is rectified through Suspense A/c once that account exists; an error that
 *    left the totals equal never touches it; before the trial balance a one-sided error is corrected in the account;
 *  - goods taken by the proprietor: Drawings A/c Dr, Purchases A/c Cr, and the case text says so;
 *  - a profit is corrected for the errors listed and for nothing else, and the case text says so in those words: the
 *    stage comes before Depreciation, so an asset booked as an expense (or the reverse) raises no charge on it and the
 *    case text does not name one;
 *  - a corrected trial balance takes every account to stand in its usual column, and the case text says so;
 *  - the class of an error is asked only where textbooks agree on it: a proprietor's personal expense charged to the
 *    business (of principle in most books, of commission in some) appears in no case that asks for classes.
 *
 * The chained cases at the end (a set of rectifying entries, then the Suspense A/c, a trial balance or the correct
 * profit) are made from the same errors. Their Suspense A/c is the account of the topic's formats, written up from
 * the entries of the set: see the note above them.
 */
import type { AccountQuestion, JournalQuestion, JournalSetQuestion, McqQuestion, NumericQuestion, StatementQuestion } from '@/content/types';
import { creditor, debtor, normalSide, resolveAccount, type Side } from '@/engine/accounts';
import type { JournalLine } from '@/engine/journal';
import type { Rng } from '@/engine/rng';
import { parseRupees } from '@/lib/money-input';
import { amount, caseTemplate, formatINR, type Paise } from '../authoring';
import { ROE_CHAIN, type RoeError } from '../templates/rectification-of-errors';
import type { CaseAccountParts, CaseSetParts, CaseTemplate, Distractor, JournalParts, McqParts, NumericParts } from '../types';

const T = 'rectification-of-errors';
const CONCEPT = 'roe-case';
const f = formatINR;

// ---------------------------------------------------------------------------------------------------------------
// The error model
// ---------------------------------------------------------------------------------------------------------------

export type ErrorClass = 'omission' | 'commission' | 'principle' | 'compensating';
export type Group = 'notPosted' | 'casting' | 'wrongSide' | 'wrongAmount' | 'omitted' | 'wrongAccount' | 'principle' | 'compensating' | 'wrongBook' | 'bookEntry';

export interface Err {
  /** The error as the case states it: one sentence. */
  text: string;
  kind: ErrorClass;
  group: Group;
  /** The amount the sentence names first. */
  x: Paise;
  /** The postings as they were made (or the net wrong effect of the error). */
  done: JournalLine[];
  /** The postings that should have been made. Always balanced. */
  should: JournalLine[];
  /** Working line about what was recorded; the default lists `done`. */
  recorded?: string;
  /** Working line about the right posting; the default lists `should`, `null` leaves it out. */
  correct?: string | null;
}

const dr = (accountId: string, a: Paise): JournalLine => ({ accountId, side: 'Dr', amount: a });
const cr = (accountId: string, a: Paise): JournalLine => ({ accountId, side: 'Cr', amount: a });
const signed = (l: JournalLine): number => (l.side === 'Dr' ? l.amount : -l.amount);
const sumOf = (ns: number[]): number => ns.reduce((s, n) => s + n, 0);
const net = (ls: JournalLine[]): number => sumOf(ls.map(signed));

/** Debit total minus credit total of the trial balance, caused by the error. Positive: the debit column is larger. */
export const tbNet = (e: Err): number => net(e.done) - net(e.should);

/** The rectifying entry once Suspense A/c exists: undo what is wrong, post what is right, Suspense takes the difference. */
export function rectifyingEntry(e: Err): JournalLine[] {
  const fix = new Map<string, number>();
  for (const l of e.should) fix.set(l.accountId, (fix.get(l.accountId) ?? 0) + signed(l));
  for (const l of e.done) fix.set(l.accountId, (fix.get(l.accountId) ?? 0) - signed(l));
  const lines: JournalLine[] = [];
  for (const [accountId, v] of fix) if (v !== 0) lines.push({ accountId, side: v > 0 ? 'Dr' : 'Cr', amount: Math.abs(v) });
  const gap = tbNet(e);
  // Debits too large: Suspense A/c stands on the credit side, so the entry debits it (and the other way round).
  if (gap !== 0) lines.push({ accountId: 'suspense', side: gap > 0 ? 'Dr' : 'Cr', amount: Math.abs(gap) });
  return [...lines.filter((l) => l.side === 'Dr'), ...lines.filter((l) => l.side === 'Cr')];
}

const isNominal = (id: string): boolean => {
  const type = resolveAccount(id).type;
  return type === 'income' || type === 'expense';
};
const isParty = (id: string): boolean => id.startsWith('debtor:') || id.startsWith('creditor:');

/** What a set of postings adds to the profit: a credit to an income or expense account raises it, a debit lowers it. */
export const profitOf = (ls: JournalLine[]): number => sumOf(ls.filter((l) => isNominal(l.accountId)).map((l) => -signed(l)));

/** Profit shown by the books minus the correct profit: positive means the profit is overstated. */
export const profitEffect = (e: Err): number => profitOf(e.done) - profitOf(e.should);

/** The accounts the error left wrong, as the lines that put them right (Suspense A/c left out). */
export const wrongLines = (e: Err): JournalLine[] => rectifyingEntry(e).filter((l) => l.accountId !== 'suspense');
export const accountsOf = (e: Err): string[] => [...new Set([...e.done, ...e.should].map((l) => l.accountId))];

/** The column of the trial balance in which the one account a one-sided error left wrong is listed. */
function columnOf(e: Err): Side | null {
  const wrong = wrongLines(e);
  return wrong.length === 1 ? normalSide(resolveAccount(wrong[0].accountId)) : null;
}

export const accountName = (id: string): string => `${resolveAccount(id).name} A/c`;
/** An account as a sentence names it: "Kiran's account", "Sales A/c". */
const owned = (id: string): string => (isParty(id) ? `${resolveAccount(id).name}'s account` : accountName(id));
export const entryText = (ls: JournalLine[]): string => ls.map((l) => `${accountName(l.accountId)} ${l.side} ${f(l.amount)}`).join('; ');
const sideName = (s: Side): string => (s === 'Dr' ? 'debit' : 'credit');
export const balWord = (signedBalance: number): string => (signedBalance > 0 ? 'debit' : 'credit');
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The income and expense accounts an error leaves wrong, with what it does to each balance. */
const profitReason = (e: Err): string =>
  `${wrongLines(e)
    .filter((l) => isNominal(l.accountId))
    .map((l) => `${accountName(l.accountId)} is ${f(l.amount)} too ${normalSide(resolveAccount(l.accountId)) === l.side ? 'low' : 'high'}`)
    .join(' and ')}`;

function tbLine(gap: number): string {
  if (gap === 0) return 'Debits and credits are still equal, so the trial balance was not disturbed and Suspense A/c is not used.';
  // The whole Suspense balance may lie on the other side (other errors); this is the share this one error put there.
  return gap > 0
    ? `By itself this error leaves the debits ${f(gap)} more than the credits, which put ${f(gap)} on the credit side of Suspense A/c; the entry debits Suspense A/c to clear it.`
    : `By itself this error leaves the credits ${f(-gap)} more than the debits, which put ${f(-gap)} on the debit side of Suspense A/c; the entry credits Suspense A/c to clear it.`;
}

/** The working of a rectifying entry: what was recorded, what was right, the trial balance, the entry. */
export const explainErr = (e: Err): string[] => [
  e.recorded ?? (e.done.length > 0 ? `As recorded: ${entryText(e.done)}.` : 'Nothing was recorded: the transaction is missing from every book.'),
  ...(e.correct === null ? [] : [e.correct ?? `It should have been: ${entryText(e.should)}.`]),
  tbLine(tbNet(e)),
  `Rectifying entry: ${entryText(rectifyingEntry(e))}.`,
];

// ---------------------------------------------------------------------------------------------------------------
// Drawing values, names and wording
// ---------------------------------------------------------------------------------------------------------------

const money = (rng: Rng, min: number, max: number, step = 500): Paise => amount(rng, min, max, step);

const OWNERS = ['Meena', 'Arjun', 'Fatima', 'Gurpreet', 'Joseph', 'Nandini', 'Farhan', 'Lakshmi', 'Ritu', 'Vikram'];
const TRADES = ['stationery shop', 'hardware store', 'garment shop', 'grocery store', 'book shop', 'toy shop', 'sports goods shop', 'utensils store', 'footwear shop', 'paint shop'];
const TOWNS = ['Pune', 'Kochi', 'Jaipur', 'Indore', 'Madurai', 'Lucknow', 'Nagpur', 'Surat', 'Mysuru', 'Patna'];
const PARTIES = ['Mohan', 'Kiran', 'Anita', 'Ravi', 'Suresh', 'Farida', 'Deepak', 'Kavita', 'Imran', 'Gopal', 'Sunita', 'Anil', 'Rekha', 'Naveen', 'Pooja', 'Harish'];
const YEAR_END = '31 March 2026';

interface Shop {
  owner: string;
  intro: string;
}
function business(rng: Rng): Shop {
  const owner = rng.pick(OWNERS);
  return { owner, intro: `${owner} runs a ${rng.pick(TRADES)} in ${rng.pick(TOWNS)}.` };
}

/** Customers and suppliers for one case, each name used once. A failed draw gives its names back. */
interface Names {
  take(): string;
  mark(): string[];
  reset(mark: string[]): void;
}
function nameSupply(rng: Rng): Names {
  let free = rng.shuffle(PARTIES);
  return {
    take: () => free.pop() ?? 'Mohan',
    mark: () => [...free],
    reset: (mark) => {
      free = mark;
    },
  };
}

type Maker = (rng: Rng, names: Names) => Err | null;

interface Expense {
  id: string;
  label: string;
  verb: 'was' | 'were';
}
const EXPENSES: Expense[] = [
  { id: 'rent', label: 'Rent', verb: 'was' },
  { id: 'salaries', label: 'Salaries', verb: 'were' },
  { id: 'wages', label: 'Wages', verb: 'were' },
  { id: 'insurance', label: 'Insurance premium', verb: 'was' },
  { id: 'advertisement', label: 'Advertisement charges', verb: 'were' },
  { id: 'electricity', label: 'Electricity charges', verb: 'were' },
];

/** A figure and the same digits the other way round (a slip of the pen), or a nearby figure: [true amount, wrong amount]. */
function wrongPair(rng: Rng): [Paise, Paise] | null {
  if (rng.pick([true, false])) {
    const a = rng.int(1, 9);
    const b = rng.int(1, 9);
    if (a === b) return null;
    const scale = rng.pick([100, 1000]);
    return [(10 * a + b) * scale * 100, (10 * b + a) * scale * 100];
  }
  const x = money(rng, 4000, 40000);
  const y = x + rng.pick([-1, 1]) * money(rng, 500, 3000);
  // Half the true amount would make the difference equal to the figure posted, and a wrong reading would pass as right.
  return x === 2 * y ? null : [x, y];
}

// ---------------------------------------------------------------------------------------------------------------
// One-sided errors: one account is left wrong, so the trial balance does not agree
// ---------------------------------------------------------------------------------------------------------------

/** Partial omission: the transaction reached one account and not the other. */
const partial = (text: string, x: Paise, done: JournalLine[], should: JournalLine[]): Err => ({
  text,
  kind: 'omission',
  group: 'notPosted',
  x,
  done,
  should,
  recorded: `Only one side was posted: ${entryText(done)}.`,
  correct: `The whole posting is: ${entryText(should)}.`,
});

const notPostedParty: Maker[] = [
  (rng, n) => {
    const p = n.take();
    const x = money(rng, 2000, 40000);
    return partial(`A credit sale of ${f(x)} to ${p} was not posted to ${p}'s account.`, x, [cr('sales', x)], [dr(debtor(p), x), cr('sales', x)]);
  },
  (rng, n) => {
    const p = n.take();
    const x = money(rng, 2000, 40000);
    return partial(`A credit purchase of ${f(x)} from ${p} was not posted to ${p}'s account.`, x, [dr('purchases', x)], [dr('purchases', x), cr(creditor(p), x)]);
  },
  (rng, n) => {
    const p = n.take();
    const x = money(rng, 1000, 30000);
    return partial(`Cash ${f(x)} received from ${p}, a customer, was not posted to ${p}'s account.`, x, [dr('cash', x)], [dr('cash', x), cr(debtor(p), x)]);
  },
  (rng, n) => {
    const p = n.take();
    const x = money(rng, 1000, 30000);
    return partial(`Cash ${f(x)} paid to ${p}, a supplier, was not posted to ${p}'s account.`, x, [cr('cash', x)], [dr(creditor(p), x), cr('cash', x)]);
  },
];

const notPostedNominal: Maker[] = [
  (rng) => {
    const e = rng.pick(EXPENSES);
    const x = money(rng, 1000, 24000);
    return partial(`${e.label} of ${f(x)} paid in cash ${e.verb} not posted to ${accountName(e.id)}.`, x, [cr('cash', x)], [dr(e.id, x), cr('cash', x)]);
  },
  (rng) => {
    const x = money(rng, 500, 12000);
    return partial(`Commission of ${f(x)} received in cash was not posted to Commission Received A/c.`, x, [dr('cash', x)], [dr('cash', x), cr('commissionReceived', x)]);
  },
];

/** A wrong total: `line` is the net wrong effect on the one account the total was posted to. */
const cast = (text: string, x: Paise, line: JournalLine, recorded: string): Err => ({
  text,
  kind: 'commission',
  group: 'casting',
  x,
  done: [line],
  should: [],
  recorded,
  correct: null,
});
const ONE_BY_ONE = 'The personal accounts are posted entry by entry, so they are right.';

const casting: Maker[] = [
  (rng) => {
    const x = money(rng, 1000, 20000, 1000);
    return cast(`The Sales Book was undercast by ${f(x)}.`, x, dr('sales', x), `The total credited to Sales A/c was ${f(x)} too low. ${ONE_BY_ONE}`);
  },
  (rng) => {
    const x = money(rng, 1000, 20000, 1000);
    return cast(`The Sales Book was overcast by ${f(x)}.`, x, cr('sales', x), `The total credited to Sales A/c was ${f(x)} too high. ${ONE_BY_ONE}`);
  },
  (rng) => {
    const x = money(rng, 1000, 20000, 1000);
    return cast(`The Purchases Book was undercast by ${f(x)}.`, x, cr('purchases', x), `The total debited to Purchases A/c was ${f(x)} too low. ${ONE_BY_ONE}`);
  },
  (rng) => {
    const x = money(rng, 1000, 20000, 1000);
    return cast(`The Purchases Book was overcast by ${f(x)}.`, x, dr('purchases', x), `The total debited to Purchases A/c was ${f(x)} too high. ${ONE_BY_ONE}`);
  },
  (rng) => {
    const x = money(rng, 500, 8000);
    return cast(`The Sales Return Book was undercast by ${f(x)}.`, x, cr('salesReturn', x), `The total debited to Sales Return A/c was ${f(x)} too low. ${ONE_BY_ONE}`);
  },
  (rng) => {
    const x = money(rng, 500, 8000);
    return cast(`The Purchases Return Book was undercast by ${f(x)}.`, x, dr('purchasesReturn', x), `The total credited to Purchases Return A/c was ${f(x)} too low. ${ONE_BY_ONE}`);
  },
  (rng) => {
    const e = rng.pick(EXPENSES.slice(0, 3));
    const x = money(rng, 500, 9000);
    return cast(`The debit side of ${accountName(e.id)} was overcast by ${f(x)}.`, x, dr(e.id, x), `${accountName(e.id)} was added up ${f(x)} too high, so its debit balance is ${f(x)} too high.`);
  },
];

const wrongSideOf = (text: string, x: Paise, done: JournalLine[], should: JournalLine[]): Err => ({
  text,
  kind: 'commission',
  group: 'wrongSide',
  x,
  done,
  should,
});

const wrongSideParty: Maker[] = [
  (rng, n) => {
    const p = n.take();
    const x = money(rng, 1000, 20000);
    return wrongSideOf(`Cash ${f(x)} received from ${p}, a customer, was posted to the debit of ${p}'s account.`, x, [dr('cash', x), dr(debtor(p), x)], [dr('cash', x), cr(debtor(p), x)]);
  },
  (rng, n) => {
    const p = n.take();
    const x = money(rng, 1000, 20000);
    return wrongSideOf(`Cash ${f(x)} paid to ${p}, a supplier, was posted to the credit of ${p}'s account.`, x, [cr('cash', x), cr(creditor(p), x)], [dr(creditor(p), x), cr('cash', x)]);
  },
  (rng, n) => {
    const p = n.take();
    const x = money(rng, 2000, 20000);
    return wrongSideOf(`A credit sale of ${f(x)} to ${p} was posted to the credit of ${p}'s account.`, x, [cr(debtor(p), x), cr('sales', x)], [dr(debtor(p), x), cr('sales', x)]);
  },
  (rng, n) => {
    const p = n.take();
    const x = money(rng, 500, 9000);
    return wrongSideOf(`Goods of ${f(x)} returned by ${p}, a customer, were posted to the debit of ${p}'s account.`, x, [dr('salesReturn', x), dr(debtor(p), x)], [dr('salesReturn', x), cr(debtor(p), x)]);
  },
];

const wrongSideNominal: Maker[] = [
  (rng) => {
    const e = rng.pick(EXPENSES);
    const x = money(rng, 1000, 15000);
    return wrongSideOf(`${e.label} of ${f(x)} paid in cash ${e.verb} posted to the credit of ${accountName(e.id)}.`, x, [cr('cash', x), cr(e.id, x)], [dr(e.id, x), cr('cash', x)]);
  },
  (rng, n) => {
    const p = n.take();
    const x = money(rng, 500, 6000);
    return wrongSideOf(`Discount of ${f(x)} received from ${p} was posted to the debit of Discount Received A/c.`, x, [dr(creditor(p), x), dr('discountReceived', x)], [dr(creditor(p), x), cr('discountReceived', x)]);
  },
];

const wrongAmountOf = (text: string, x: Paise, y: Paise, done: JournalLine[], should: JournalLine[]): Err => ({
  text,
  kind: 'commission',
  group: 'wrongAmount',
  x,
  done,
  should,
  recorded: `As recorded: ${entryText(done)}. One account carries ${f(y)} where ${f(x)} belongs.`,
});

const wrongAmountParty: Maker[] = [
  (rng, n) => {
    const w = wrongPair(rng);
    if (!w) return null;
    const [x, y] = w;
    const p = n.take();
    return wrongAmountOf(`A credit sale of ${f(x)} to ${p} was posted to ${p}'s account as ${f(y)}.`, x, y, [dr(debtor(p), y), cr('sales', x)], [dr(debtor(p), x), cr('sales', x)]);
  },
  (rng, n) => {
    const w = wrongPair(rng);
    if (!w) return null;
    const [x, y] = w;
    const p = n.take();
    return wrongAmountOf(`A credit purchase of ${f(x)} from ${p} was posted to ${p}'s account as ${f(y)}.`, x, y, [dr('purchases', x), cr(creditor(p), y)], [dr('purchases', x), cr(creditor(p), x)]);
  },
  (rng, n) => {
    const w = wrongPair(rng);
    if (!w) return null;
    const [x, y] = w;
    const p = n.take();
    return wrongAmountOf(`Cash ${f(x)} received from ${p}, a customer, was posted to ${p}'s account as ${f(y)}.`, x, y, [dr('cash', x), cr(debtor(p), y)], [dr('cash', x), cr(debtor(p), x)]);
  },
];

const wrongAmountNominal: Maker[] = [
  (rng) => {
    const w = wrongPair(rng);
    if (!w) return null;
    const [x, y] = w;
    const e = rng.pick(EXPENSES);
    return wrongAmountOf(`${e.label} of ${f(x)} paid in cash ${e.verb} posted to ${accountName(e.id)} as ${f(y)}.`, x, y, [dr(e.id, y), cr('cash', x)], [dr(e.id, x), cr('cash', x)]);
  },
];

const notPosted: Maker[] = [...notPostedParty, ...notPostedNominal];
const wrongSide: Maker[] = [...wrongSideParty, ...wrongSideNominal];
const wrongAmount: Maker[] = [...wrongAmountParty, ...wrongAmountNominal];
const ONE_SIDED_GROUPS: Maker[][] = [notPosted, casting, wrongSide, wrongAmount];

// ---------------------------------------------------------------------------------------------------------------
// Two-sided errors: the accounts are wrong by amounts that cancel, so the trial balance still agrees
// ---------------------------------------------------------------------------------------------------------------

const omit = (text: string, x: Paise, should: JournalLine[], correct?: string): Err => ({ text, kind: 'omission', group: 'omitted', x, done: [], should, correct });

const omittedProfit: Maker[] = [
  (rng, n) => {
    const p = n.take();
    const x = money(rng, 2000, 40000);
    return omit(`A credit purchase of ${f(x)} from ${p} was not entered in the books at all.`, x, [dr('purchases', x), cr(creditor(p), x)]);
  },
  (rng, n) => {
    const p = n.take();
    const x = money(rng, 2000, 40000);
    return omit(`A credit sale of ${f(x)} to ${p} was not entered in the books at all.`, x, [dr(debtor(p), x), cr('sales', x)]);
  },
  (rng, n) => {
    const p = n.take();
    const x = money(rng, 500, 9000);
    return omit(`Goods of ${f(x)} returned by ${p}, a customer, were not entered in the books at all.`, x, [dr('salesReturn', x), cr(debtor(p), x)]);
  },
  (rng) => {
    const x = money(rng, 1000, 12000);
    return omit(
      `Goods costing ${f(x)} taken by the proprietor for personal use were not recorded.`,
      x,
      [dr('drawings', x), cr('purchases', x)],
      `Goods taken by the proprietor are drawings at cost and are no longer purchases of the business: Drawings A/c Dr ${f(x)}; Purchases A/c Cr ${f(x)}.`,
    );
  },
  (rng) => {
    const e = rng.pick(EXPENSES);
    const x = money(rng, 1000, 24000);
    return omit(`${e.label} of ${f(x)} paid by cheque ${e.verb} not entered in the books at all.`, x, [dr(e.id, x), cr('bank', x)]);
  },
];

const omittedNoProfit: Maker[] = [
  (rng, n) => {
    const p = n.take();
    const x = money(rng, 10000, 60000, 1000);
    return omit(`Furniture of ${f(x)} bought on credit from ${p} was not entered in the books at all.`, x, [dr('furniture', x), cr(creditor(p), x)]);
  },
  (rng) => {
    const x = money(rng, 5000, 40000, 1000);
    return omit(`Cash ${f(x)} deposited into the bank was not entered in the books at all.`, x, [dr('bank', x), cr('cash', x)]);
  },
];

const misposted = (text: string, x: Paise, done: JournalLine[], should: JournalLine[]): Err => ({ text, kind: 'commission', group: 'wrongAccount', x, done, should });

const SAME_KIND: [Expense, string][] = [
  [EXPENSES[0], 'salaries'],
  [EXPENSES[2], 'salaries'],
  [EXPENSES[5], 'telephone'],
  [EXPENSES[4], 'insurance'],
  [{ id: 'postage', label: 'Postage', verb: 'was' }, 'stationery'],
];

const wrongAccount: Maker[] = [
  (rng, n) => {
    const p = n.take();
    const q = n.take();
    const x = money(rng, 2000, 40000);
    return misposted(`A credit sale of ${f(x)} to ${p} was debited to ${q}'s account.`, x, [dr(debtor(q), x), cr('sales', x)], [dr(debtor(p), x), cr('sales', x)]);
  },
  (rng, n) => {
    const p = n.take();
    const q = n.take();
    const x = money(rng, 1000, 30000);
    return misposted(`Cash ${f(x)} received from ${p}, a customer, was credited to ${q}'s account.`, x, [dr('cash', x), cr(debtor(q), x)], [dr('cash', x), cr(debtor(p), x)]);
  },
  (rng) => {
    const [e, wrong] = rng.pick(SAME_KIND);
    const x = e.id === 'postage' ? money(rng, 500, 4000) : money(rng, 1000, 24000);
    return misposted(`${e.label} of ${f(x)} paid in cash ${e.verb} debited to ${accountName(wrong)}.`, x, [dr(wrong, x), cr('cash', x)], [dr(e.id, x), cr('cash', x)]);
  },
  (rng, n) => {
    const p = n.take();
    const q = n.take();
    const x = money(rng, 2000, 40000);
    return misposted(`A credit purchase of ${f(x)} from ${p} was credited to ${q}'s account.`, x, [dr('purchases', x), cr(creditor(q), x)], [dr('purchases', x), cr(creditor(p), x)]);
  },
];

const principleOf = (text: string, x: Paise, done: JournalLine[], should: JournalLine[], correct?: string): Err => ({
  text,
  kind: 'principle',
  group: 'principle',
  x,
  done,
  should,
  correct,
});

const principleSimple: Maker[] = [
  (rng) => {
    const [asset, label] = rng.pick([
      ['furniture', 'Furniture'],
      ['computers', 'A computer'],
      ['machinery', 'A machine'],
      ['officeEquipment', 'Office equipment'],
    ] as const);
    const x = money(rng, 10000, 80000, 1000);
    return principleOf(
      `${label} bought for ${f(x)} by cheque was debited to Purchases A/c.`,
      x,
      [dr('purchases', x), cr('bank', x)],
      [dr(asset, x), cr('bank', x)],
      `An asset bought for use in the business is not goods for resale: ${accountName(asset)} Dr ${f(x)}; Bank A/c Cr ${f(x)}.`,
    );
  },
  (rng) => {
    const [asset, thing] = rng.pick([
      ['machinery', 'machinery'],
      ['building', 'the shop building'],
      ['vehicles', 'the delivery van'],
      ['furniture', 'furniture'],
    ] as const);
    const x = money(rng, 1000, 15000);
    return principleOf(
      `Repairs of ${f(x)} to ${thing}, paid in cash, were debited to ${accountName(asset)}.`,
      x,
      [dr(asset, x), cr('cash', x)],
      [dr('repairs', x), cr('cash', x)],
      `Repairs keep an asset working and are an expense: Repairs A/c Dr ${f(x)}; Cash A/c Cr ${f(x)}.`,
    );
  },
  (rng) => {
    // A cost of bringing a new machine into use, charged to the expense account that usually takes such a payment.
    const [expense, paidAs, what] = rng.pick([
      ['wages', 'wages for installing a new machine', 'Wages paid to install a machine are'],
      ['carriageInwards', 'carriage on a new machine', 'Carriage paid to bring in a machine is'],
    ] as const);
    const x = money(rng, 2000, 15000);
    return principleOf(
      `Cash ${f(x)} paid as ${paidAs} was debited to ${accountName(expense)}.`,
      x,
      [dr(expense, x), cr('cash', x)],
      [dr('machinery', x), cr('cash', x)],
      `${what} part of its cost: Machinery A/c Dr ${f(x)}; Cash A/c Cr ${f(x)}.`,
    );
  },
  (rng) => {
    const [expense, item] = rng.pick([
      ['rent', 'house rent'],
      ['insurance', 'life insurance premium'],
      ['electricity', 'home electricity bill'],
    ] as const);
    const x = money(rng, 2000, 18000);
    return principleOf(
      `A cheque of ${f(x)} for the proprietor's ${item} was debited to ${accountName(expense)}.`,
      x,
      [dr(expense, x), cr('bank', x)],
      [dr('drawings', x), cr('bank', x)],
      `A personal expense of the proprietor paid by the business is drawings: Drawings A/c Dr ${f(x)}; Bank A/c Cr ${f(x)}.`,
    );
  },
  (rng) => {
    const x = money(rng, 3000, 20000);
    return principleOf(
      `Old furniture sold for ${f(x)} cash, its book value, was credited to Sales A/c.`,
      x,
      [dr('cash', x), cr('sales', x)],
      [dr('cash', x), cr('furniture', x)],
      `The sale of a fixed asset is credited to the asset, not to Sales A/c: Cash A/c Dr ${f(x)}; Furniture A/c Cr ${f(x)}.`,
    );
  },
];

/** An asset booked as an expense together with a cost that belongs to it. */
const principleCompound: Maker[] = [
  (rng) => {
    const x = money(rng, 40000, 120000, 5000);
    const y = money(rng, 1000, 9000);
    // How the two amounts were paid does not matter to the error, so the sentence leaves it out.
    return {
      ...principleOf(
        `A machine of ${f(x)} was debited to Purchases A/c, and ${f(y)} paid to install it to Wages A/c.`,
        x,
        [dr('purchases', x), dr('wages', y), cr('bank', x + y)],
        [dr('machinery', x + y), cr('bank', x + y)],
        `The price and the cost of installing it are both the cost of the machine: Machinery A/c Dr ${f(x + y)}.`,
      ),
      recorded: `As recorded: Purchases A/c Dr ${f(x)}; Wages A/c Dr ${f(y)}.`,
    };
  },
];

const offsetting = (text: string, x: Paise, done: JournalLine[], recorded: string): Err => ({
  text,
  kind: 'compensating',
  group: 'compensating',
  x,
  done,
  should: [],
  recorded,
  correct: null,
});

const compensating: Maker[] = [
  (rng) => {
    const [a, b] = rng.pick([
      ['wages', 'salaries'],
      ['rent', 'insurance'],
      ['electricity', 'telephone'],
      ['advertisement', 'repairs'],
    ] as const);
    const x = money(rng, 500, 8000);
    return offsetting(
      `On the debit side, ${accountName(a)} was overcast and ${accountName(b)} undercast, by ${f(x)} each.`,
      x,
      [dr(a, x), cr(b, x)],
      `Net effect of the two slips: ${accountName(a)} is ${f(x)} too high and ${accountName(b)} ${f(x)} too low.`,
    );
  },
  (rng, n) => {
    const p = n.take();
    const q = n.take();
    const x = money(rng, 500, 8000);
    return offsetting(
      `Customer ${p}'s account was debited ${f(x)} too much and customer ${q}'s ${f(x)} too little.`,
      x,
      [dr(debtor(p), x), cr(debtor(q), x)],
      `Net effect of the two slips: ${p}'s account is ${f(x)} too high and ${q}'s account ${f(x)} too low.`,
    );
  },
  (rng) => {
    const x = money(rng, 1000, 12000, 1000);
    return offsetting(
      `The Sales Book and the Purchases Book were both overcast by ${f(x)}.`,
      x,
      [cr('sales', x), dr('purchases', x)],
      `Net effect of the two slips: Sales A/c is ${f(x)} too high (a credit) and Purchases A/c ${f(x)} too high (a debit).`,
    );
  },
];

const inWrongBook = (text: string, x: Paise, done: JournalLine[], should: JournalLine[]): Err => ({ text, kind: 'commission', group: 'wrongBook', x, done, should });

/** A transaction entered in the wrong book of original entry: balanced, but the party and two trading accounts are wrong. */
const wrongBook: Maker[] = [
  (rng, n) => {
    const p = n.take();
    const x = money(rng, 2000, 30000);
    return inWrongBook(`A credit sale of ${f(x)} to ${p} was entered in the Purchases Book.`, x, [dr('purchases', x), cr(debtor(p), x)], [dr(debtor(p), x), cr('sales', x)]);
  },
  (rng, n) => {
    const p = n.take();
    const x = money(rng, 2000, 30000);
    return inWrongBook(`A credit purchase of ${f(x)} from ${p} was entered in the Sales Book.`, x, [dr(creditor(p), x), cr('sales', x)], [dr('purchases', x), cr(creditor(p), x)]);
  },
  (rng, n) => {
    const p = n.take();
    const x = money(rng, 500, 9000);
    return inWrongBook(
      `Goods of ${f(x)} returned by ${p}, a customer, were entered in the Purchases Return Book.`,
      x,
      [dr(debtor(p), x), cr('purchasesReturn', x)],
      [dr('salesReturn', x), cr(debtor(p), x)],
    );
  },
];

const omitted: Maker[] = [...omittedProfit, ...omittedNoProfit];

// ---------------------------------------------------------------------------------------------------------------
// Putting errors together for a case
// ---------------------------------------------------------------------------------------------------------------

/** Two errors that would blur each other: the same sentence, a shared figure, or the same account left wrong. */
function clash(a: Err, b: Err): boolean {
  if (a.text === b.text) return true;
  const figures = (e: Err) => [e.x, Math.abs(tbNet(e)), ...wrongLines(e).map((l) => l.amount)];
  const mine = new Set(figures(a));
  if (figures(b).some((v) => v !== 0 && mine.has(v))) return true;
  const wrong = new Set(wrongLines(a).map((l) => l.accountId));
  return wrongLines(b).some((l) => wrong.has(l.accountId));
}

/** One error from a pool that passes `accept` and does not clash with those already taken; null after a few tries. */
function draw(rng: Rng, pool: readonly Maker[], names: Names, taken: Err[], accept: (e: Err) => boolean = () => true): Err | null {
  for (let i = 0; i < 10; i++) {
    const mark = names.mark();
    const e = rng.pick(pool)(rng, names);
    if (e !== null && accept(e) && taken.every((o) => !clash(o, e))) return e;
    names.reset(mark);
  }
  return null;
}

/** One error from each pool, in that order. */
function drawSet(rng: Rng, pools: readonly (readonly Maker[])[], names: Names): Err[] | null {
  const out: Err[] = [];
  for (const pool of pools) {
    const e = draw(rng, pool, names, out);
    if (e === null) return null;
    out.push(e);
  }
  return out;
}

/** Runs `make` until it gives a scenario, a few times at most, so that an awkward draw seldom rejects the seed. */
function attempt<S>(times: number, make: () => S | null): S | null {
  for (let i = 0; i < times; i++) {
    const s = make();
    if (s !== null) return s;
  }
  return null;
}

const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'];
export const tag = (i: number): string => `(${LETTERS[i]})`;
const listed = (errors: Err[]): string[] => errors.map((e, i) => `${tag(i)} ${e.text}`);
/** Conventions the case has to state for the errors in it, so that only one answer is defensible. */
const notes = (errors: Err[]): string[] =>
  errors.some((e) => e.text.includes('taken by the proprietor')) ? ['Goods taken by the proprietor are credited to Purchases A/c, at cost.'] : [];

/** Why an error that leaves the profit as it is does so. */
const unchangedBecause = (e: Err): string =>
  wrongLines(e).some((l) => isNominal(l.accountId)) ? 'the incomes and expenses it left wrong cancel each other' : 'no income or expense account is wrong';

/** Errors named together: "(b) only", "(a) and (c)", "(a), (c) and (d)". */
function tags(indexes: number[]): string {
  const ls = [...indexes].sort((a, b) => a - b).map(tag);
  return ls.length === 1 ? `${ls[0]} only` : `${ls.slice(0, -1).join(', ')} and ${ls[ls.length - 1]}`;
}

/** Errors named in a working line: "error (b)", "errors (a) and (c)". */
const named = (indexes: number[]): string => (indexes.length === 1 ? `error ${tag(indexes[0])}` : `errors ${tags(indexes)}`);

export type Slip = { value: number; why: string };
/** Wrong answers that are positive and differ from the answer and from each other. */
export function slips(answer: number, list: Slip[]): Slip[] {
  const seen = new Set<number>([answer]);
  return list.filter((e) => Number.isSafeInteger(e.value) && e.value > 0 && !seen.has(e.value) && seen.add(e.value));
}

/** A typed-amount question; null (the seed is rejected) when fewer than two distinct wrong answers remain. */
export function typed(prompt: string, answer: number, list: Slip[], explanation: string[]): NumericParts | null {
  const commonErrors = slips(answer, list);
  return answer > 0 && commonErrors.length >= 2 ? { prompt, answer, commonErrors, explanation } : null;
}

/** The trial balance difference a learner gets who counts a posting on the wrong side once. */
const gapOnce = (e: Err): number => (e.group === 'wrongSide' ? tbNet(e) / 2 : tbNet(e));
/** The difference a learner gets who takes the whole amount of a wrongly posted figure instead of the shortfall. */
const gapWhole = (e: Err): number => (e.group === 'wrongAmount' ? Math.sign(tbNet(e)) * e.x : tbNet(e));

const ONCE_WHY = 'Counted the posting on the wrong side once; it is missing from one side and has been added to the other, so the totals differ by twice the amount.';
const WHOLE_WHY = 'Took the whole amount of the item posted at a wrong figure; only the difference between the two figures upsets the totals.';

/** What one error did to the two totals, for a working line. */
function gapLine(e: Err, i: number): string {
  const gap = tbNet(e);
  if (gap === 0) return `${tag(i)} leaves the two totals equal.`;
  const note = e.group === 'wrongSide' ? ' (twice the amount: missing from one side, added to the other)' : e.group === 'wrongAmount' ? ' (the difference between the two figures)' : '';
  return `${tag(i)} makes the ${gap > 0 ? 'debit' : 'credit'} total larger by ${f(Math.abs(gap))}${note}.`;
}

/** Suspense A/c step by step. Balances are signed: positive is a debit balance. */
export function suspenseSteps(opening: number, steps: { index: number; gap: number }[]): string[] {
  const out = [`Suspense A/c opens with a ${balWord(opening)} balance of ${f(Math.abs(opening))}.`];
  let balance = opening;
  for (const s of steps) {
    balance += s.gap;
    out.push(
      `The entry for ${tag(s.index)} ${s.gap > 0 ? 'debits' : 'credits'} Suspense A/c with ${f(Math.abs(s.gap))}: balance ${balance === 0 ? 'nil' : `${f(Math.abs(balance))} ${balWord(balance)}`}.`,
    );
  }
  return out;
}

export const ENTRY_HINTS = [
  'What was posted, and what should have been posted? Which accounts are wrong, and on which side?',
  'Cancel the wrong posting and make the right one. If only one account is wrong and the difference went to Suspense A/c, the other side of the entry is Suspense A/c; if the wrong amounts cancel each other, Suspense A/c is not used.',
];

/** The rectifying entry of one error of the case, as a question. */
export function entryParts(e: Err, i: number, lead = '', tail = ''): JournalParts {
  const lines = rectifyingEntry(e);
  const used = new Set(lines.map((l) => l.accountId));
  return {
    prompt: `${lead}${lead ? 'pass' : 'Pass'} the rectifying journal entry for error ${tag(i)}${tail}.`,
    lines,
    explanation: explainErr(e),
    distractorAccounts: [...accountsOf(e), 'suspense', 'sales', 'purchases'].filter((id) => !used.has(id)),
    hints: ENTRY_HINTS,
  };
}

/** The side of the opening Suspense balance, when the totals are not given: `gap` is debit total less credit total. */
export function suspenseSideParts(prompt: string, gap: number, working: string[]): McqParts {
  const big = gap > 0 ? 'debit' : 'credit';
  const small = gap > 0 ? 'credit' : 'debit';
  const option = (balance: string, column: string) => `${cap(balance)} balance: the ${column} column was the larger`;
  return {
    prompt,
    correct: option(small, big),
    distractors: [
      { text: option(big, small), why: `Got the larger column wrong: the errors that upset the totals made the ${big} column the larger one.` },
      { text: option(big, big), why: 'Put Suspense A/c on the side that was already larger; it goes on the shorter side, so that the two columns agree.' },
      { text: option(small, small), why: `Named the wrong column as the larger one, and then put Suspense A/c on that larger side as well; the ${big} column was the larger and Suspense A/c went on the ${small} side.` },
    ],
    explanation: working.join(' '),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// A second, independent reading of every error sentence, used only by `verify`.
//
// Each line states, from the wording alone, what the error does to the trial balance (debit total minus credit total),
// to the profit shown by the books (positive: overstated) and, for a one-sided error, in which column of the trial
// balance the account it left wrong is listed. Nothing here looks at `done` or `should`, so an error whose postings
// were modelled wrongly disagrees with its line and the case is refused. In a pattern, # is an amount and ~ any words.
// ---------------------------------------------------------------------------------------------------------------

type Reading = (a: number[]) => number;
interface Read {
  tb: number;
  profit: number;
  col: Side | null;
}
const times =
  (k: number): Reading =>
  (a) =>
    k * a[0];
const NIL: Reading = () => 0;
const reader = (pattern: string, tb: Reading, profit: Reading, col: Side | null = null) => ({
  re: new RegExp(
    `^${pattern
      .replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
      .replace(/#/g, '(₹\\d(?:[\\d,]*\\d)?)')
      .replace(/~/g, '[^.;]*?')}$`,
  ),
  tb,
  profit,
  col,
});

const READERS = [
  // One posting left out: the side it belongs to is short.
  reader('A credit sale of # to ~ was not posted to ~ account.', times(-1), NIL, 'Dr'),
  reader('A credit purchase of # from ~ was not posted to ~ account.', times(1), NIL, 'Cr'),
  reader('Cash # received from ~, a customer, was not posted to ~ account.', times(1), NIL, 'Dr'),
  reader('Cash # paid to ~, a supplier, was not posted to ~ account.', times(-1), NIL, 'Cr'),
  reader('~ of # paid in cash ~ not posted to ~ A/c.', times(-1), times(1), 'Dr'),
  reader('Commission of # received in cash was not posted to Commission Received A/c.', times(1), times(-1), 'Cr'),
  // A wrong total posted to one account.
  reader('The Sales Book was undercast by #.', times(1), times(-1), 'Cr'),
  reader('The Sales Book was overcast by #.', times(-1), times(1), 'Cr'),
  reader('The Purchases Book was undercast by #.', times(-1), times(1), 'Dr'),
  reader('The Purchases Book was overcast by #.', times(1), times(-1), 'Dr'),
  reader('The Sales Return Book was undercast by #.', times(-1), times(1), 'Dr'),
  reader('The Purchases Return Book was undercast by #.', times(1), times(-1), 'Cr'),
  reader('The debit side of ~ A/c was overcast by #.', times(1), times(-1), 'Dr'),
  // One account posted on the wrong side: twice the amount.
  reader('Cash # received from ~, a customer, was posted to the debit of ~ account.', times(2), NIL, 'Dr'),
  reader('Cash # paid to ~, a supplier, was posted to the credit of ~ account.', times(-2), NIL, 'Cr'),
  reader('A credit sale of # to ~ was posted to the credit of ~ account.', times(-2), NIL, 'Dr'),
  reader('Goods of # returned by ~, a customer, were posted to the debit of ~ account.', times(2), NIL, 'Dr'),
  reader('~ of # paid in cash ~ posted to the credit of ~ A/c.', times(-2), times(2), 'Dr'),
  reader('Discount of # received from ~ was posted to the debit of Discount Received A/c.', times(2), times(-2), 'Cr'),
  // One account posted with the second figure in place of the first.
  reader('A credit sale of # to ~ was posted to ~ account as #.', (a) => a[1] - a[0], NIL, 'Dr'),
  reader('A credit purchase of # from ~ was posted to ~ account as #.', (a) => a[0] - a[1], NIL, 'Cr'),
  reader('Cash # received from ~, a customer, was posted to ~ account as #.', (a) => a[0] - a[1], NIL, 'Dr'),
  reader('~ of # paid in cash ~ posted to ~ A/c as #.', (a) => a[1] - a[0], (a) => a[0] - a[1], 'Dr'),
  // Left out of every book: the totals agree; the profit moves if an income or expense is missing.
  reader('A credit purchase of # from ~ was not entered in the books at all.', NIL, times(1)),
  reader('A credit sale of # to ~ was not entered in the books at all.', NIL, times(-1)),
  reader('Goods of # returned by ~, a customer, were not entered in the books at all.', NIL, times(1)),
  reader('Goods costing # taken by the proprietor for personal use were not recorded.', NIL, times(-1)),
  reader('~ of # paid by cheque ~ not entered in the books at all.', NIL, times(1)),
  reader('Furniture of # bought on credit from ~ was not entered in the books at all.', NIL, NIL),
  reader('Cash # deposited into the bank was not entered in the books at all.', NIL, NIL),
  // The wrong account of the same kind, or the wrong person: neither the totals nor the profit move.
  reader('A credit sale of # to ~ was debited to ~ account.', NIL, NIL),
  reader('Cash # received from ~, a customer, was credited to ~ account.', NIL, NIL),
  reader('~ of # paid in cash ~ debited to ~ A/c.', NIL, NIL),
  reader('A credit purchase of # from ~ was credited to ~ account.', NIL, NIL),
  // Errors of principle: an asset or a personal item charged as an expense understates profit; the reverse overstates it.
  reader('~ bought for # by cheque was debited to Purchases A/c.', NIL, times(-1)),
  reader('Repairs of # to ~, paid in cash, were debited to ~ A/c.', NIL, times(1)),
  reader('Cash # paid as wages for installing a new machine was debited to Wages A/c.', NIL, times(-1)),
  reader('Cash # paid as carriage on a new machine was debited to Carriage Inwards A/c.', NIL, times(-1)),
  reader("A cheque of # for the proprietor's ~ was debited to ~ A/c.", NIL, times(-1)),
  reader('Old furniture sold for # cash, its book value, was credited to Sales A/c.', NIL, times(1)),
  reader('A machine of # was debited to Purchases A/c, and # paid to install it to Wages A/c.', NIL, (a) => -(a[0] + a[1])),
  // Two slips that cancel in the trial balance and in the profit.
  reader('On the debit side, ~ A/c was overcast and ~ A/c undercast, by # each.', NIL, NIL),
  reader('Customer ~ account was debited # too much and customer ~ # too little.', NIL, NIL),
  reader('The Sales Book and the Purchases Book were both overcast by #.', NIL, NIL),
  // The wrong book: balanced, but two trading accounts are each wrong by the amount, the same way.
  reader('A credit sale of # to ~ was entered in the Purchases Book.', NIL, times(-2)),
  reader('A credit purchase of # from ~ was entered in the Sales Book.', NIL, times(2)),
  reader('Goods of # returned by ~, a customer, were entered in the Purchases Return Book.', NIL, times(2)),
  reader('Goods of # returned by ~ were entered in the Sales Book.', NIL, times(2)),
  reader('Goods of # returned to ~ were entered in the Purchases Book.', NIL, times(-2)),
  // A wrong entry in a day book reaches the party and the total alike.
  reader('An invoice of # to ~ was entered in the Sales Book as #.', NIL, (a) => a[1] - a[0]),
  reader('An invoice of # to ~ was entered in the Sales Book twice.', NIL, times(1)),
  reader('An invoice of # to ~ was not entered in the Sales Book at all.', NIL, times(-1)),
  reader('An invoice of # from ~ was entered in the Purchases Book as #.', NIL, (a) => a[0] - a[1]),
  reader('An invoice of # from ~ was entered in the Purchases Book twice.', NIL, times(-1)),
  reader('An invoice of # from ~ was not entered in the Purchases Book at all.', NIL, times(1)),
];

const RUPEES = /₹\d(?:[\d,]*\d)?/g;
const rupeesIn = (text: string): number[] => (text.match(RUPEES) ?? []).map((s) => parseRupees(s)).filter((n): n is number => n !== null);

/** Reads one error sentence; null unless exactly one line of READERS fits it. */
function read(text: string): Read | null {
  let out: Read | null = null;
  for (const r of READERS) {
    const m = r.re.exec(text);
    if (!m) continue;
    if (out !== null) return null;
    const a = m.slice(1).map((s) => parseRupees(s));
    if (a.some((v) => v === null)) return null;
    out = { tb: r.tb(a as number[]), profit: r.profit(a as number[]), col: r.col };
  }
  return out;
}

type Asked = { context?: string; prompt: string };

/** The errors of a case, by letter, read again from its text; null if any one is not understood. */
function readCase(q: Asked): Map<string, Read> | null {
  const out = new Map<string, Read>();
  for (const line of (q.context ?? '').split('\n')) {
    const m = /^\(([a-f])\) (.+)$/.exec(line);
    if (!m) continue;
    const r = read(m[2]);
    if (r === null) return null;
    out.set(m[1], r);
  }
  return out.size > 0 ? out : null;
}

/** The letters of the errors a prompt (or an option) names, in order. */
const lettersIn = (text: string): string[] => [...text.matchAll(/\(([a-f])\)/g)].map((m) => m[1]);
const correctText = (q: McqQuestion): string => q.options.find((o) => o.id === q.correct)?.text ?? '';
/** The first amount that follows `label` in the case text. */
function figureAfter(q: Asked, label: string): number | null {
  const at = (q.context ?? '').indexOf(label);
  return at < 0 ? null : (rupeesIn((q.context ?? '').slice(at + label.length))[0] ?? null);
}

/**
 * An entry rectifies an error only if it balances, clears exactly the difference the error put into Suspense A/c
 * (nothing for an error that left the totals equal) and takes back exactly the misstatement of profit.
 */
function verifyEntry(q: JournalQuestion): boolean {
  const r = readCase(q)?.get(lettersIn(q.prompt)[0]);
  if (!r) return false;
  const suspense = q.expected.filter((l) => l.accountId === 'suspense');
  const cleared = r.tb === 0 ? suspense.length === 0 : suspense.length === 1 && suspense[0].amount === Math.abs(r.tb) && suspense[0].side === (r.tb > 0 ? 'Dr' : 'Cr');
  return cleared && net(q.expected) === 0 && profitOf(q.expected) === -r.profit;
}

/** The side question whose options name the balance and the larger column, checked against the errors as read. */
function verifySuspenseSide(q: McqQuestion): boolean {
  const all = readCase(q);
  if (!all) return false;
  const gap = sumOf([...all.values()].map((r) => r.tb));
  return gap !== 0 && correctText(q) === (gap > 0 ? 'Credit balance: the debit column was the larger' : 'Debit balance: the credit column was the larger');
}

// ---------------------------------------------------------------------------------------------------------------
// Case 1 (medium): a trial balance that does not agree, one-sided errors only
// ---------------------------------------------------------------------------------------------------------------

const oneSidedCase = caseTemplate({
  id: 'case-roe-suspense-one-sided',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'A trial balance that does not agree',
  setup: (rng) =>
    attempt(4, () => {
      const shop = business(rng);
      const errors = drawSet(rng, rng.shuffle(ONE_SIDED_GROUPS).slice(0, 3), nameSupply(rng));
      if (!errors) return null;
      const gaps = errors.map(tbNet);
      const cols = errors.map(columnOf);
      const gap = sumOf(gaps);
      if (gap === 0 || cols.some((c) => c === null)) return null;
      // The right total, and the two columns as the errors left them: an error sits in the column of its account.
      const right = amount(rng, 400000, 950000, 500);
      const debit = right + sumOf(gaps.filter((_, i) => cols[i] === 'Dr'));
      const credit = right - sumOf(gaps.filter((_, i) => cols[i] === 'Cr'));
      return { shop, errors, gaps, cols, gap, debit, credit, opening: -gap };
    }),
  context: (s) =>
    [
      `${s.shop.intro} The trial balance on ${YEAR_END} did not agree.`,
      `Debit column total: ${f(s.debit)}`,
      `Credit column total: ${f(s.credit)}`,
      'The difference was put to a Suspense A/c. These errors were then found; there are no others.',
      ...listed(s.errors),
      // An account posted on the wrong side is still taken to stand in its usual column, an expense as much as a customer.
      'Every account has a balance on its usual side (customers debit, suppliers credit).',
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        typed(
          'For what amount is the Suspense A/c opened in the trial balance?',
          Math.abs(s.gap),
          [
            { value: s.debit + s.credit, why: 'Added the two column totals instead of finding the difference between them.' },
            { value: sumOf(s.errors.map((e) => e.x)), why: 'Added up the amounts named in the three errors; the Suspense A/c is opened for the difference between the two column totals.' },
            { value: Math.max(s.debit, s.credit), why: 'Gave the larger column total instead of the difference between the two totals.' },
            { value: Math.min(s.debit, s.credit), why: 'Gave the shorter column total instead of the difference between the two totals.' },
          ],
          [
            `The ${s.gap > 0 ? 'debit' : 'credit'} column is the larger: ${f(Math.max(s.debit, s.credit))} - ${f(Math.min(s.debit, s.credit))} = ${f(Math.abs(s.gap))}.`,
            `The Suspense A/c is opened for ${f(Math.abs(s.gap))}.`,
            `Check with the errors: ${s.errors.map((e, i) => gapLine(e, i)).join(' ')} Net: ${f(Math.abs(s.gap))}.`,
          ],
        ),
      verify: (q: NumericQuestion) => {
        const all = readCase(q);
        const debit = figureAfter(q, 'Debit column total:');
        const credit = figureAfter(q, 'Credit column total:');
        if (!all || debit === null || credit === null) return false;
        return q.answer === Math.abs(debit - credit) && debit - credit === sumOf([...all.values()].map((r) => r.tb));
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const short = s.gap > 0 ? 'credit' : 'debit';
        const long = s.gap > 0 ? 'debit' : 'credit';
        return {
          prompt: 'On which side of the trial balance is the Suspense A/c entered?',
          correct: `On the ${short} side, the shorter column`,
          distractors: [
            { text: `On the ${long} side, the larger column`, why: 'Put the difference on the side that is already larger, which widens the gap; it belongs on the side that is short.' },
            { text: 'Half on each side, to share the difference', why: 'Shared the difference between the columns; adding the same amount to both leaves them just as unequal.' },
            { text: 'On neither side: it is kept out of the trial balance until the errors are found', why: 'Left the trial balance unequal; the Suspense A/c is opened precisely so that the two columns agree for the time being.' },
          ],
          explanation: `The ${long} column is larger by ${f(Math.abs(s.gap))}, so the ${short} column is short. The Suspense A/c goes on the ${short} side: it has a ${short} balance of ${f(Math.abs(s.gap))}.`,
        };
      },
      verify: (q: McqQuestion) => {
        const debit = figureAfter(q, 'Debit column total:');
        const credit = figureAfter(q, 'Credit column total:');
        return debit !== null && credit !== null && debit !== credit && correctText(q) === `On the ${debit < credit ? 'debit' : 'credit'} side, the shorter column`;
      },
    },
    { kind: 'journal', make: (s) => entryParts(s.errors[0], 0), verify: verifyEntry },
    { kind: 'journal', make: (s) => entryParts(s.errors[1], 1), verify: verifyEntry },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const open = Math.abs(s.opening);
        const [a, b, c] = s.gaps;
        const left = s.opening + a + b;
        return typed(
          'Errors (a) and (b) have been rectified. What balance is now left in the Suspense A/c? Give the amount only.',
          Math.abs(left),
          [
            { value: Math.abs(open - Math.abs(a) - Math.abs(b)), why: 'Took both entries as reducing the Suspense balance, whichever side of the account each one fell on.' },
            { value: open + Math.abs(a) + Math.abs(b), why: 'Took both entries as adding to the Suspense balance, whichever side of the account each one fell on.' },
            { value: Math.abs(s.opening + a), why: 'Rectified error (a) only and left error (b) out.' },
            { value: Math.abs(s.opening + b), why: 'Rectified error (b) only and left error (a) out.' },
            { value: open, why: 'Gave the opening balance, as if the two entries had not touched the Suspense A/c.' },
            { value: Math.abs(gapOnce(s.errors[2])), why: `Gave the amount named in error (c). ${ONCE_WHY}` },
            { value: Math.abs(s.opening + gapOnce(s.errors[0]) + gapOnce(s.errors[1])), why: ONCE_WHY },
            { value: Math.abs(s.opening + gapWhole(s.errors[0]) + gapWhole(s.errors[1])), why: WHOLE_WHY },
          ],
          [
            ...suspenseSteps(s.opening, [
              { index: 0, gap: a },
              { index: 1, gap: b },
            ]),
            `Check: error (c), still in the books, ${gapLine(s.errors[2], 2).slice(4)} The ${f(Math.abs(c))} left in Suspense A/c is held for it.`,
          ],
        );
      },
      // By another route: with (a) and (b) gone, Suspense holds exactly what error (c) did to the totals.
      verify: (q: NumericQuestion) => {
        const c = readCase(q)?.get('c');
        return !!c && c.tb !== 0 && q.answer === Math.abs(c.tb);
      },
    },
    { kind: 'journal', make: (s) => entryParts(s.errors[2], 2, '', ', the entry that closes the Suspense A/c'), verify: verifyEntry },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const inDebit = s.errors.map((_, i) => i).filter((i) => s.cols[i] === 'Dr');
        const inCredit = s.errors.map((_, i) => i).filter((i) => s.cols[i] === 'Cr');
        const drShift = sumOf(inDebit.map((i) => s.gaps[i]));
        const crShift = sumOf(inCredit.map((i) => s.gaps[i]));
        const answer = s.debit - drShift;
        // A learner works from one column; each slip is given for the column in which the error it concerns lies.
        const viaDebit = (g: (e: Err) => number) => s.debit - sumOf(inDebit.map((i) => g(s.errors[i])));
        const viaCredit = (g: (e: Err) => number) => s.credit + sumOf(inCredit.map((i) => g(s.errors[i])));
        const leftOut: Slip[] = [
          ...(inDebit.length > 1 ? inDebit.map((i) => ({ value: answer + s.gaps[i], why: `Left error ${tag(i)} out of the debit column; every error that lies in a column has to be applied to it.` })) : []),
          ...(inCredit.length > 1 ? inCredit.map((i) => ({ value: answer - s.gaps[i], why: `Left error ${tag(i)} out of the credit column; every error that lies in a column has to be applied to it.` })) : []),
        ];
        const move = (i: number, column: Side) => {
          const up = column === 'Dr' ? s.gaps[i] < 0 : s.gaps[i] > 0;
          return `${tag(i)} ${up ? '+' : '-'} ${f(Math.abs(s.gaps[i]))}`;
        };
        const column = (name: string, start: number, list: number[], side: Side) =>
          list.length === 0
            ? `${name} column: no error lies in it, so it stays at ${f(start)}.`
            : `${name} column: ${f(start)}, ${list.map((i) => move(i, side)).join(', ')} = ${f(answer)}.`;
        return typed(
          'All three errors are now rectified and the Suspense A/c is closed. What does each column of the corrected trial balance add up to?',
          answer,
          [
            { value: Math.max(s.debit, s.credit), why: 'Kept the total the trial balance had with the Suspense A/c in it; the rectifying entries change the balances in the columns.' },
            { value: Math.min(s.debit, s.credit), why: 'Took the shorter column as it stood, without applying the errors that lie in it.' },
            { value: s.debit + drShift, why: 'Moved the debit column the wrong way: a balance that is too high has to come down, and one that is too low has to go up.' },
            { value: s.credit - crShift, why: 'Moved the credit column the wrong way: a balance that is too high has to come down, and one that is too low has to go up.' },
            { value: viaDebit(gapOnce), why: ONCE_WHY },
            { value: viaCredit(gapOnce), why: ONCE_WHY },
            { value: viaDebit(gapWhole), why: WHOLE_WHY },
            { value: viaCredit(gapWhole), why: WHOLE_WHY },
            ...leftOut,
          ],
          [
            'Each error left one balance wrong; correct the column in which that balance stands.',
            column('Debit', s.debit, inDebit, 'Dr'),
            column('Credit', s.credit, inCredit, 'Cr'),
            `Both columns add up to ${f(answer)}, and Suspense A/c has no balance.`,
          ],
        );
      },
      // The answer is worked from the debit column; here it is worked again from the credit column.
      verify: (q: NumericQuestion) => {
        const all = readCase(q);
        const credit = figureAfter(q, 'Credit column total:');
        if (!all || credit === null) return false;
        return q.answer === credit + sumOf([...all.values()].filter((r) => r.col === 'Cr').map((r) => r.tb));
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Case 2 (easy): the trial balance agreed, two-sided errors only
// ---------------------------------------------------------------------------------------------------------------

export const CLASS_LABEL: Record<ErrorClass, string> = {
  omission: 'Error of omission',
  commission: 'Error of commission',
  principle: 'Error of principle',
  compensating: 'Compensating error',
};
export const CLASS_A: Record<ErrorClass, string> = {
  omission: 'an error of omission',
  commission: 'an error of commission',
  principle: 'an error of principle',
  compensating: 'a compensating error',
};
export const CLASS_GIST: Record<ErrorClass, string> = {
  omission: 'a transaction was left out of the books',
  commission: 'the transaction was recorded, but in the wrong account of the right kind',
  principle: 'a capital item was treated as a revenue item, or a revenue item as a capital one',
  compensating: 'two slips of the same amount offset each other',
};
export const CLASSES: ErrorClass[] = ['omission', 'commission', 'principle', 'compensating'];

const HARMLESS: Maker[] = [...wrongAccount, ...compensating, ...omittedNoProfit];
// A personal expense of the proprietor charged to the business (principleSimple[3]) is kept out of this case: its
// questions ask for the class of each error, and textbooks differ on whether that one is of principle or of commission.
const UNDERSTATING: Maker[] = [principleSimple[0], principleSimple[2], omittedProfit[1], omittedProfit[3]];
const OVERSTATING: Maker[] = [principleSimple[1], principleSimple[4], omittedProfit[0], omittedProfit[2], omittedProfit[4]];

/** The corrected profit and the wrong figures learners reach, from the profit shown and what each kind of error did. */
export function correctedProfit(prompt: string, shown: Paise, over: number, under: number, extra: Slip[], working: string[]): NumericParts | null {
  const effect = over - under;
  return typed(
    prompt,
    shown - effect,
    [
      { value: shown + effect, why: 'Applied the net effect the wrong way: an overstated profit has to be reduced, and an understated one increased.' },
      { value: shown - over - under, why: 'Deducted every amount, as if all the errors had overstated the profit.' },
      { value: shown + over + under, why: 'Added every amount, as if all the errors had understated the profit.' },
      { value: shown - over, why: 'Corrected only the errors that overstate the profit.' },
      { value: shown + under, why: 'Corrected only the errors that understate the profit.' },
      ...extra,
    ],
    working,
  );
}

const twoSidedCase = caseTemplate({
  id: 'case-roe-two-sided-profit',
  version: 2,
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'easy',
  title: 'Errors the trial balance did not show',
  setup: (rng) =>
    attempt(12, () => {
      const shop = business(rng);
      const drawn = drawSet(rng, [HARMLESS, UNDERSTATING, OVERSTATING], nameSupply(rng));
      if (!drawn || new Set(drawn.map((e) => e.kind)).size < 3) return null;
      const errors = rng.shuffle(drawn);
      const effects = errors.map(profitEffect);
      const effect = sumOf(effects);
      if (effect === 0) return null;
      const at = (e: Err) => errors.indexOf(e);
      return {
        shop,
        errors,
        effects,
        effect,
        harmless: at(drawn[0]),
        under: at(drawn[1]),
        over: at(drawn[2]),
        // The class the second question asks the student to find: that of error (b) or of error (c).
        seek: rng.pick([1, 2]),
        shown: amount(rng, 150000, 600000, 5000),
      };
    }),
  context: (s) =>
    [
      `${s.shop.intro} The trial balance on ${YEAR_END} agreed.`,
      `The books show a net profit of ${f(s.shown)} for the year.`,
      'These errors were then found; there are no others. The profit is to be corrected for these errors only.',
      ...listed(s.errors),
      ...notes(s.errors),
    ].join('\n'),
  parts: [
    {
      kind: 'mcq',
      make: (s) => {
        const kind = s.errors[0].kind;
        return {
          prompt: 'Which class of error is error (a)?',
          correct: CLASS_LABEL[kind],
          distractors: CLASSES.filter((k) => k !== kind).map((k) => ({ text: CLASS_LABEL[k], why: `Took it for ${CLASS_A[k]}; here ${CLASS_GIST[kind]}.` })),
          explanation: `${CLASS_LABEL[kind]}: ${CLASS_GIST[kind]}.`,
        };
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const kind = s.errors[s.seek].kind;
        return {
          prompt: `Which of the three errors is ${CLASS_A[kind]}?`,
          correct: `Error ${tag(s.seek)}`,
          distractors: [
            ...s.errors.flatMap((e, i) => (i === s.seek ? [] : [{ text: `Error ${tag(i)}`, why: `Took error ${tag(i)} for ${CLASS_A[kind]}; it is ${CLASS_A[e.kind]}: ${CLASS_GIST[e.kind]}.` }])),
            { text: 'None of them', why: `Missed error ${tag(s.seek)}, in which ${CLASS_GIST[kind]}.` },
          ],
          explanation: `In error ${tag(s.seek)} ${CLASS_GIST[kind]}, which makes it ${CLASS_A[kind]}. ${s.errors.flatMap((e, i) => (i === s.seek ? [] : [`Error ${tag(i)} is ${CLASS_A[e.kind]}.`])).join(' ')}`,
        };
      },
    },
    { kind: 'journal', make: (s) => entryParts(s.errors[0], 0), verify: verifyEntry },
    { kind: 'journal', make: (s) => entryParts(s.errors[1], 1), verify: verifyEntry },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const o = s.effects[s.over];
        const u = -s.effects[s.under];
        const answer = Math.abs(s.effect);
        return typed(
          'By what amount is the net profit shown by the books wrong, taking the three errors together? Give the amount only.',
          answer,
          [
            { value: o + u, why: `Added the two amounts, although error ${tag(s.over)} overstates the profit and error ${tag(s.under)} understates it.` },
            { value: answer + s.errors[s.harmless].x, why: `Counted error ${tag(s.harmless)} as well, although it does not change the profit.` },
            { value: o, why: `Counted only error ${tag(s.over)} and missed error ${tag(s.under)}.` },
            { value: u, why: `Counted only error ${tag(s.under)} and missed error ${tag(s.over)}.` },
          ],
          [
            `${tag(s.over)} ${cap(profitReason(s.errors[s.over]))}: profit overstated by ${f(o)}.`,
            `${tag(s.under)} ${cap(profitReason(s.errors[s.under]))}: profit understated by ${f(u)}.`,
            `${tag(s.harmless)} does not change the profit: ${unchangedBecause(s.errors[s.harmless])}.`,
            `Net: ${f(Math.max(o, u))} - ${f(Math.min(o, u))} = ${f(answer)} ${s.effect > 0 ? 'overstated' : 'understated'}.`,
          ],
        );
      },
      verify: (q: NumericQuestion) => {
        const all = readCase(q);
        return !!all && q.answer === Math.abs(sumOf([...all.values()].map((r) => r.profit)));
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const o = s.effects[s.over];
        const u = -s.effects[s.under];
        return {
          prompt: `Is the net profit of ${f(s.shown)} overstated or understated?`,
          correct: s.effect > 0 ? 'Overstated' : 'Understated',
          distractors: [
            {
              text: s.effect > 0 ? 'Understated' : 'Overstated',
              why: `Read the net effect the wrong way: the ${f(Math.max(o, u))} by which the profit is ${s.effect > 0 ? 'overstated' : 'understated'} is the larger of the two amounts.`,
            },
            { text: 'Neither: the trial balance agreed, so the profit is right', why: 'Took an agreeing trial balance as proof that the profit is right; errors that leave the totals equal can still change an income or an expense.' },
            { text: 'Neither: the errors cancel each other', why: `Assumed that errors in opposite directions cancel completely; ${f(o)} one way and ${f(u)} the other leave ${f(Math.abs(s.effect))}.` },
          ],
          explanation: `Overstated by ${f(o)} (error ${tag(s.over)}) and understated by ${f(u)} (error ${tag(s.under)}): on balance the profit is ${s.effect > 0 ? 'overstated' : 'understated'} by ${f(Math.abs(s.effect))}.`,
        };
      },
      verify: (q: McqQuestion) => {
        const all = readCase(q);
        const effect = all ? sumOf([...all.values()].map((r) => r.profit)) : 0;
        return effect !== 0 && correctText(q) === (effect > 0 ? 'Overstated' : 'Understated');
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const o = s.effects[s.over];
        const u = -s.effects[s.under];
        return correctedProfit(
          'What is the correct net profit for the year?',
          s.shown,
          o,
          u,
          [{ value: s.shown, why: 'Left the profit as the books show it, because the trial balance agreed.' }],
          [
            `Profit shown by the books: ${f(s.shown)}.`,
            `Less the overstatement, error ${tag(s.over)}: ${f(o)}. Add the understatement, error ${tag(s.under)}: ${f(u)}.`,
            `Correct net profit = ${f(s.shown)} - ${f(o)} + ${f(u)} = ${f(s.shown - s.effect)}.`,
          ],
        );
      },
      verify: (q: NumericQuestion) => {
        const all = readCase(q);
        const shown = figureAfter(q, 'net profit of');
        return !!all && shown !== null && q.answer === shown - sumOf([...all.values()].map((r) => r.profit));
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Case 3 (complex): one-sided and two-sided errors together; the Suspense balance has to be worked out
// ---------------------------------------------------------------------------------------------------------------

const mixedCase = caseTemplate({
  id: 'case-roe-mixed-suspense',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Which errors went through Suspense?',
  setup: (rng) =>
    attempt(6, () => {
      const shop = business(rng);
      const drawn = drawSet(rng, [notPosted, casting, wrongSide, wrongAmount, principleSimple, [...omitted, ...wrongAccount, ...compensating, ...wrongBook]], nameSupply(rng));
      if (!drawn) return null;
      const errors = rng.shuffle(drawn);
      const at = (e: Err) => errors.indexOf(e);
      const gaps = errors.map(tbNet);
      const oneSided = errors.map((_, i) => i).filter((i) => gaps[i] !== 0);
      const gap = sumOf(gaps);
      // The four differences must not all fall on one side, or there is nothing to set off.
      if (gap === 0 || !gaps.some((g) => g > 0) || !gaps.some((g) => g < 0) || gaps.some((g) => Math.abs(g) === Math.abs(gap))) return null;
      // Two of the four are rectified first; the other two must still leave a balance.
      const first = rng
        .shuffle(oneSided)
        .slice(0, 2)
        .sort((a, b) => a - b);
      const rest = oneSided.filter((i) => !first.includes(i));
      const left = -gap + gaps[first[0]] + gaps[first[1]];
      if (left === 0) return null;
      return { shop, errors, gaps, gap, opening: -gap, oneSided, first, rest, left, side: at(drawn[2]), figure: at(drawn[3]), principle: at(drawn[4]), other: at(drawn[5]) };
    }),
  context: (s) =>
    [
      `${s.shop.intro} The trial balance on ${YEAR_END} did not agree.`,
      'The difference was put to a Suspense A/c; its amount is not given here.',
      'These errors were then found; there are no others.',
      ...listed(s.errors),
      ...notes(s.errors),
    ].join('\n'),
  parts: [
    {
      kind: 'mcq',
      make: (s) => {
        const twoSided = [s.principle, s.other];
        return {
          prompt: 'Which of the errors are rectified through the Suspense A/c?',
          correct: cap(tags(s.oneSided)),
          distractors: [
            { text: 'All six', why: 'Sent every error found after the trial balance through Suspense A/c; only an error that left the two totals unequal has anything there to clear.' },
            { text: cap(tags(twoSided)), why: 'Picked the errors that left the totals equal; those are put right between the accounts concerned, without Suspense A/c.' },
            { text: cap(tags([...s.oneSided, s.principle])), why: `Included error ${tag(s.principle)}: it uses the wrong kind of account, but its debit and credit are still equal, so the totals agreed.` },
            { text: cap(tags(s.oneSided.filter((i) => i !== s.side))), why: `Left out error ${tag(s.side)}: a posting on the wrong side makes the totals differ by twice its amount.` },
            { text: cap(tags([...s.oneSided, s.other])), why: `Included error ${tag(s.other)}: the accounts it left wrong are out by amounts that cancel, so the totals agreed.` },
          ],
          explanation: `An error goes through Suspense A/c only if it made the two totals differ. ${s.errors.map((e, i) => gapLine(e, i)).join(' ')}`,
        };
      },
      verify: (q: McqQuestion) => {
        const all = readCase(q);
        if (!all) return false;
        const want = [...all].filter(([, r]) => r.tb !== 0).map(([l]) => l);
        return want.length > 0 && lettersIn(correctText(q)).join() === want.join();
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const e = s.errors[s.figure];
        const [x, y] = rupeesIn(e.text);
        return typed(
          `Taken alone, by what amount did error ${tag(s.figure)} make the two totals of the trial balance differ?`,
          Math.abs(s.gaps[s.figure]),
          [
            { value: x, why: 'Gave the right amount of the item; the totals differ only by the difference between the two figures.' },
            { value: y, why: 'Gave the wrong figure that was posted; the totals differ only by the difference between the two figures.' },
            { value: x + y, why: 'Added the two figures instead of finding the difference between them.' },
            { value: 2 * Math.abs(s.gaps[s.figure]), why: 'Doubled the difference, as for a posting made on the wrong side; here the posting is on the right side, at a wrong figure.' },
          ],
          [
            `One account was posted with ${f(y)} and the other with ${f(x)}.`,
            `Difference = ${f(Math.max(x, y))} - ${f(Math.min(x, y))} = ${f(Math.abs(s.gaps[s.figure]))}; the ${s.gaps[s.figure] > 0 ? 'debit' : 'credit'} total is the larger.`,
          ],
        );
      },
      verify: (q: NumericQuestion) => {
        const r = readCase(q)?.get(lettersIn(q.prompt)[0]);
        return !!r && r.tb !== 0 && q.answer === Math.abs(r.tb);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const answer = Math.abs(s.gap);
        return typed(
          'With what balance was the Suspense A/c opened? Give the amount only.',
          answer,
          [
            { value: sumOf(s.gaps.map(Math.abs)), why: 'Added the four differences, although errors that fall on opposite sides partly cancel.' },
            { value: Math.abs(sumOf(s.errors.map(gapOnce))), why: ONCE_WHY },
            { value: Math.abs(sumOf(s.errors.map(gapWhole))), why: WHOLE_WHY },
            { value: answer + s.errors[s.principle].x, why: `Brought in error ${tag(s.principle)}, which left the two totals equal.` },
            { value: Math.abs(s.gap - s.gaps[s.side]), why: `Left out error ${tag(s.side)}, a posting on the wrong side, which does upset the totals.` },
          ],
          [
            ...s.errors.map((e, i) => gapLine(e, i)),
            `Debit total larger by ${f(sumOf(s.gaps.filter((g) => g > 0)))} in all, credit total larger by ${f(-sumOf(s.gaps.filter((g) => g < 0)))} in all.`,
            `Net: the ${s.gap > 0 ? 'debit' : 'credit'} total was larger by ${f(answer)}, so the Suspense A/c was opened with ${f(answer)}.`,
          ],
        );
      },
      verify: (q: NumericQuestion) => {
        const all = readCase(q);
        return !!all && q.answer === Math.abs(sumOf([...all.values()].map((r) => r.tb)));
      },
    },
    {
      kind: 'mcq',
      make: (s) =>
        suspenseSideParts('What kind of balance did the Suspense A/c have when it was opened, and why?', s.gap, [
          `The one-sided errors together made the ${s.gap > 0 ? 'debit' : 'credit'} total larger by ${f(Math.abs(s.gap))}.`,
          `Suspense A/c goes on the shorter side, so it opened with a ${balWord(s.opening)} balance.`,
        ]),
      verify: verifySuspenseSide,
    },
    { kind: 'journal', make: (s) => entryParts(s.errors[s.side], s.side), verify: verifyEntry },
    { kind: 'journal', make: (s) => entryParts(s.errors[s.principle], s.principle), verify: verifyEntry },
    {
      kind: 'mcq',
      make: (s) => {
        const [i, j] = s.first;
        const right = `${cap(balWord(s.left))} balance`;
        return {
          prompt: `Errors ${tag(i)} and ${tag(j)} are rectified first. What kind of balance does the Suspense A/c then show?`,
          correct: right,
          distractors: [
            {
              text: `${cap(balWord(-s.left))} balance`,
              why: `Took the wrong side: the errors still in the books make the ${s.left > 0 ? 'credit' : 'debit'} total the larger, so the balance held for them is a ${balWord(s.left)} one.`,
            },
            { text: 'No balance: the account is closed', why: `Stopped too soon: errors ${tag(s.rest[0])} and ${tag(s.rest[1])} are still in the books, and their effect stays in Suspense A/c.` },
            { text: 'It cannot be found without the totals of the trial balance', why: 'Thought the totals were needed; since there are no other errors, the opening balance follows from the errors themselves.' },
          ],
          explanation: suspenseSteps(s.opening, [
            { index: i, gap: s.gaps[i] },
            { index: j, gap: s.gaps[j] },
          ]).join(' '),
        };
      },
      // With two errors rectified, Suspense holds what the other one-sided errors did to the totals, on the opposite side.
      verify: (q: McqQuestion) => {
        const all = readCase(q);
        if (!all) return false;
        const done = lettersIn(q.prompt);
        const stillWrong = sumOf([...all].filter(([l]) => !done.includes(l)).map(([, r]) => r.tb));
        return stillWrong !== 0 && correctText(q) === (stillWrong > 0 ? 'Credit balance' : 'Debit balance');
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const [i, j] = s.first;
        const open = Math.abs(s.opening);
        const [a, b] = [s.gaps[i], s.gaps[j]];
        const [c, d] = [s.gaps[s.rest[0]], s.gaps[s.rest[1]]];
        return typed(
          `Errors ${tag(i)} and ${tag(j)} are rectified first. What amount is then left in the Suspense A/c?`,
          Math.abs(s.left),
          [
            { value: Math.abs(open - Math.abs(a) - Math.abs(b)), why: 'Took both entries as reducing the Suspense balance, whichever side of the account each one fell on.' },
            { value: open + Math.abs(a) + Math.abs(b), why: 'Took both entries as adding to the Suspense balance, whichever side of the account each one fell on.' },
            { value: Math.abs(s.opening + a), why: `Rectified error ${tag(i)} only and left error ${tag(j)} out.` },
            { value: Math.abs(c) + Math.abs(d), why: `Added the effects of errors ${tag(s.rest[0])} and ${tag(s.rest[1])}, which fall on opposite sides and partly cancel.` },
            { value: Math.abs(gapOnce(s.errors[s.rest[0]]) + gapOnce(s.errors[s.rest[1]])), why: ONCE_WHY },
            { value: open, why: 'Gave the opening balance, as if the two entries had not touched the Suspense A/c.' },
          ],
          [
            ...suspenseSteps(s.opening, [
              { index: i, gap: a },
              { index: j, gap: b },
            ]),
            `Check with the errors still in the books: ${gapLine(s.errors[s.rest[0]], s.rest[0])} ${gapLine(s.errors[s.rest[1]], s.rest[1])} Net ${f(Math.abs(s.left))}.`,
          ],
        );
      },
      verify: (q: NumericQuestion) => {
        const all = readCase(q);
        if (!all) return false;
        const done = lettersIn(q.prompt);
        return done.length === 2 && q.answer === Math.abs(sumOf([...all].filter(([l]) => !done.includes(l)).map(([, r]) => r.tb)));
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Case 4 (medium): the same errors found before the trial balance and after it
// ---------------------------------------------------------------------------------------------------------------

/** A believable ledger balance for an account that has to stay on its usual side after a correction of `shift`. */
function ledgerBalance(rng: Rng, accountId: string, shift: number): Paise | null {
  const small = ['salesReturn', 'purchasesReturn', 'discountReceived', 'commissionReceived'].includes(accountId);
  const [lo, hi, step] = isParty(accountId) ? [30000, 90000, 1000] : accountId === 'sales' || accountId === 'purchases' ? [200000, 600000, 5000] : small ? [18000, 48000, 500] : [40000, 150000, 1000];
  for (let i = 0; i < 6; i++) {
    const b = amount(rng, lo, hi, step);
    if (b >= shift + (small ? 600000 : 1000000)) return b;
  }
  return null;
}

/** The balance of the one account a one-sided error left wrong, after the correction, and how learners miss it. */
function correctedBalance(prompt: string, e: Err, i: number, balance: Paise): NumericParts | null {
  const line = wrongLines(e)[0];
  const side = normalSide(resolveAccount(line.accountId));
  // A correction on the side of the balance raises it; one on the other side lowers it.
  const shift = line.side === side ? line.amount : -line.amount;
  const answer = balance + shift;
  const posted = e.should.find((l) => l.accountId === line.accountId);
  const way = posted && posted.side !== side ? -1 : 1;
  const [x, y] = rupeesIn(e.text);
  // A balance that happens to equal a figure of the error would mark a learner right who only copied that figure.
  if (answer === line.amount || answer === x || answer === y) return null;
  const list: Slip[] = [{ value: balance - shift, why: 'Moved the balance the wrong way: ask whether the account has too much or too little on the side of its balance.' }];
  if (e.group === 'wrongSide') {
    list.push({ value: balance + shift / 2, why: 'Corrected the posting once; the wrong posting has to be cancelled and the right one made, so the balance moves by twice the amount.' });
    list.push({ value: balance - shift / 2, why: 'Moved the balance the wrong way, and by the amount once instead of twice.' });
  }
  if (e.group === 'wrongAmount') {
    list.push({ value: balance + way * x, why: 'Brought in the right figure without first taking out the wrong figure that was posted.' });
    list.push({ value: balance - way * y, why: 'Took out the wrong figure but did not put the right one in its place.' });
  }
  list.push({ value: line.amount, why: 'Gave the amount of the correction instead of the balance after it.' });
  if (e.group !== 'wrongSide') {
    list.push({ value: balance + 2 * shift, why: 'Doubled the correction, as for a posting made on the wrong side; here the item is only missing or misstated, so the balance moves by the amount once.' });
  }
  list.push({ value: balance, why: 'Left the balance as it stands; the error is in this very account, so its balance has to change.' });
  return typed(prompt, answer, list, [
    `${owned(line.accountId)} stands at ${f(balance)} (${side}).`,
    e.recorded ?? `As recorded: ${entryText(e.done)}.`,
    `To put error ${tag(i)} right, ${owned(line.accountId)} is ${line.side === 'Dr' ? 'debited' : 'credited'} with ${f(line.amount)}.`,
    `Correct balance = ${f(balance)} ${shift > 0 ? '+' : '-'} ${f(line.amount)} = ${f(answer)} (${side}).`,
  ]);
}

/** The balance asked for, worked again from the case text: the error as read, applied to the balance printed for the account. */
function verifyBalance(q: NumericQuestion): boolean {
  const r = readCase(q)?.get(lettersIn(q.prompt)[0]);
  const m = /balance of (.+?) once error/.exec(q.prompt);
  if (!r || !m || r.col === null) return false;
  const name = m[1].replace(/'s account$/, '');
  const printed = new RegExp(`${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')} (₹\\d(?:[\\d,]*\\d)?) \\((Dr|Cr)\\)`).exec(q.context ?? '');
  const balance = printed ? parseRupees(printed[1]) : null;
  if (!printed || balance === null || printed[2] !== r.col) return false;
  // A debit excess sits in a debit balance and is taken out of it; it is missing from a credit balance and is added to it.
  return q.answer === (r.col === 'Dr' ? balance - r.tb : balance + r.tb);
}

const beforeAfterCase = caseTemplate({
  id: 'case-roe-before-after',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Found before the trial balance, or after it',
  setup: (rng) =>
    attempt(6, () => {
      const shop = business(rng);
      const names = nameSupply(rng);
      const personal = draw(rng, [...wrongSideParty, ...wrongAmountParty, ...notPostedParty], names, []);
      if (!personal) return null;
      const nominal = draw(rng, [...casting, ...notPostedNominal, ...wrongSideNominal, ...wrongAmountNominal], names, [personal]);
      if (!nominal) return null;
      const balanced = draw(rng, [...wrongAccount, ...principleSimple, ...omitted], names, [personal, nominal]);
      if (!balanced) return null;
      const errors = rng.shuffle([personal, nominal, balanced]);
      const gap = tbNet(personal) + tbNet(nominal);
      if (gap === 0) return null;
      const b1 = ledgerBalance(rng, wrongLines(personal)[0].accountId, Math.abs(tbNet(personal)));
      const b2 = ledgerBalance(rng, wrongLines(nominal)[0].accountId, Math.abs(tbNet(nominal)));
      if (b1 === null || b2 === null) return null;
      return { shop, errors, gap, personal, nominal, balanced, p: errors.indexOf(personal), n: errors.indexOf(nominal), t: errors.indexOf(balanced), b1, b2 };
    }),
  context: (s) => {
    const shown = (e: Err, b: Paise) => {
      const id = wrongLines(e)[0].accountId;
      return `${isParty(id) ? resolveAccount(id).name : accountName(id)} ${f(b)} (${normalSide(resolveAccount(id))})`;
    };
    return [
      `${s.shop.intro} These errors were made in the books for March 2026.`,
      ...listed(s.errors),
      ...notes(s.errors),
      `Ledger balances as they stand: ${shown(s.personal, s.b1)}; ${shown(s.nominal, s.b2)}.`,
      'Situation 1: the errors are found before the trial balance is prepared.',
      'Situation 2: they are found after it, when its difference has been put to a Suspense A/c.',
      'There are no other errors.',
    ].join('\n');
  },
  parts: [
    {
      kind: 'mcq',
      make: (s) => {
        const e = s.personal;
        const line = wrongLines(e)[0];
        const name = owned(line.accountId);
        const other: Side = line.side === 'Dr' ? 'Cr' : 'Dr';
        const direct = (side: Side, a: Paise) => `Post ${f(a)} to the ${sideName(side)} of ${name}; no journal entry is passed`;
        const distractors: Distractor[] = [
          { text: `Pass the entry ${entryText(rectifyingEntry(e))}`, why: 'Used Suspense A/c, but in Situation 1 no trial balance has been drawn up, so no Suspense A/c exists.' },
          { text: direct(other, line.amount), why: 'Put the correction on the wrong side of the account, which makes the error larger.' },
          { text: `Pass an entry between ${name} and Cash A/c for ${f(line.amount)}`, why: `Brought in Cash A/c, which is not wrong; only ${name} has to be corrected, and no money moves when an error is put right.` },
          { text: 'Leave it, and let the Suspense A/c take the difference when the trial balance is prepared', why: 'Put off an error that is already known; Suspense A/c is for a difference nobody has traced yet.' },
        ];
        if (e.group === 'wrongSide') {
          distractors.unshift({ text: direct(line.side, line.amount / 2), why: 'Corrected the posting once; the wrong posting has to be cancelled and the right one made, which is twice the amount.' });
        }
        return {
          prompt: `In Situation 1, how is error ${tag(s.p)} put right?`,
          correct: direct(line.side, line.amount),
          distractors,
          explanation: `Only ${name} is wrong, and before the trial balance there is no Suspense A/c. The account itself is corrected: ${f(line.amount)} is posted to its ${sideName(line.side)}.`,
        };
      },
      verify: (q: McqQuestion) => {
        const r = readCase(q)?.get(lettersIn(q.prompt)[0]);
        // A debit excess is put right by a credit to the account that is wrong.
        return !!r && r.tb !== 0 && correctText(q).startsWith(`Post ${f(Math.abs(r.tb))} to the ${r.tb > 0 ? 'credit' : 'debit'} of `);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => correctedBalance(`In Situation 1, what is the balance of ${owned(wrongLines(s.personal)[0].accountId)} once error ${tag(s.p)} has been put right?`, s.personal, s.p, s.b1),
      verify: verifyBalance,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => correctedBalance(`In Situation 1, what is the balance of ${owned(wrongLines(s.nominal)[0].accountId)} once error ${tag(s.n)} has been put right?`, s.nominal, s.n, s.b2),
      verify: verifyBalance,
    },
    {
      kind: 'mcq',
      make: (s) => ({
        prompt: 'Which of the errors is put right by the same journal entry in both situations?',
        correct: `Error ${tag(s.t)}`,
        distractors: [
          ...[s.p, s.n].map((i) => ({
            text: `Error ${tag(i)}`,
            why: `Error ${tag(i)} left a single account wrong: before the trial balance that account is corrected directly, and after it the entry needs Suspense A/c as well.`,
          })),
          { text: 'None of them', why: `Missed error ${tag(s.t)}: it left the totals equal, so Suspense A/c never comes into it and the same entry serves both times.` },
          { text: 'All three', why: 'Overlooked that a one-sided error is corrected in the account itself before the trial balance, and through Suspense A/c after it.' },
        ],
        explanation: `Error ${tag(s.t)} left the accounts wrong by amounts that cancel, so it never disturbs the trial balance and Suspense A/c never comes into it. Whenever it is found, the entry is ${entryText(rectifyingEntry(s.balanced))}. Errors ${tag(Math.min(s.p, s.n))} and ${tag(Math.max(s.p, s.n))} each left one account wrong: that account is corrected directly before the trial balance, and through Suspense A/c after it.`,
      }),
      verify: (q: McqQuestion) => {
        const all = readCase(q);
        if (!all) return false;
        const same = [...all].filter(([, r]) => r.tb === 0).map(([l]) => l);
        return same.length === 1 && correctText(q) === `Error (${same[0]})`;
      },
    },
    { kind: 'journal', make: (s) => entryParts(s.personal, s.p, 'In Situation 2, '), verify: verifyEntry },
    { kind: 'journal', make: (s) => entryParts(s.nominal, s.n, 'In Situation 2, '), verify: verifyEntry },
    {
      kind: 'mcq',
      make: (s) =>
        suspenseSideParts('In Situation 2, what kind of balance did the Suspense A/c have when it was opened, and why?', s.gap, [
          gapLine(s.errors[Math.min(s.p, s.n)], Math.min(s.p, s.n)),
          gapLine(s.errors[Math.max(s.p, s.n)], Math.max(s.p, s.n)),
          `Together the ${s.gap > 0 ? 'debit' : 'credit'} total was larger by ${f(Math.abs(s.gap))}, so Suspense A/c went on the ${s.gap > 0 ? 'credit' : 'debit'} side.`,
        ]),
      verify: verifySuspenseSide,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const [a, b] = [tbNet(s.personal), tbNet(s.nominal)];
        const answer = Math.abs(s.gap);
        const together = a > 0 === b > 0;
        return typed(
          'In Situation 2, for what amount was the Suspense A/c opened?',
          answer,
          [
            together
              ? { value: Math.abs(Math.abs(a) - Math.abs(b)), why: 'Set one error against the other, although both make the same total too large.' }
              : { value: Math.abs(a) + Math.abs(b), why: 'Added the two differences, although they fall on opposite sides and partly cancel.' },
            { value: Math.abs(gapOnce(s.personal) + gapOnce(s.nominal)), why: ONCE_WHY },
            { value: Math.abs(gapWhole(s.personal) + gapWhole(s.nominal)), why: WHOLE_WHY },
            { value: answer + s.balanced.x, why: `Brought in error ${tag(s.t)}, which left the two totals equal.` },
            { value: Math.abs(a), why: `Counted error ${tag(s.p)} only.` },
            { value: Math.abs(b), why: `Counted error ${tag(s.n)} only.` },
          ],
          [
            ...s.errors.map((e, i) => gapLine(e, i)),
            `Net: the ${s.gap > 0 ? 'debit' : 'credit'} total was larger by ${f(answer)}.`,
            `The Suspense A/c was opened with a ${s.gap > 0 ? 'credit' : 'debit'} balance of ${f(answer)}, and the two entries through it close it.`,
          ],
        );
      },
      verify: (q: NumericQuestion) => {
        const all = readCase(q);
        return !!all && q.answer === Math.abs(sumOf([...all.values()].map((r) => r.tb)));
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Case 5 (medium): errors in a subsidiary book
// ---------------------------------------------------------------------------------------------------------------

/**
 * A second reading of the errors of this case, used only by `verify`: by how much the total of the book has to
 * change to be right, and by how much the balance of the party named in the sentence has to change.
 */
const BOOK_READERS: { re: RegExp; total: Reading; party: Reading }[] = [
  { re: /^The (?:Sales|Purchases) Book was undercast by (₹\d(?:[\d,]*\d)?)\.$/, total: times(1), party: NIL },
  { re: /^The (?:Sales|Purchases) Book was overcast by (₹\d(?:[\d,]*\d)?)\.$/, total: times(-1), party: NIL },
  { re: /^An invoice of (₹\d(?:[\d,]*\d)?) (?:to|from) \w+ was entered in the \w+ Book as (₹\d(?:[\d,]*\d)?)\.$/, total: (a) => a[0] - a[1], party: (a) => a[0] - a[1] },
  { re: /^An invoice of (₹\d(?:[\d,]*\d)?) (?:to|from) \w+ was entered in the \w+ Book twice\.$/, total: times(-1), party: times(-1) },
  { re: /^An invoice of (₹\d(?:[\d,]*\d)?) (?:to|from) \w+ was not entered in the \w+ Book at all\.$/, total: times(1), party: times(1) },
  { re: /^A credit sale of (₹\d(?:[\d,]*\d)?) to \w+ was entered in the Purchases Book\.$/, total: times(1), party: times(2) },
  { re: /^A credit purchase of (₹\d(?:[\d,]*\d)?) from \w+ was entered in the Sales Book\.$/, total: times(1), party: times(2) },
  { re: /^Goods of (₹\d(?:[\d,]*\d)?) returned by \w+ were entered in the Sales Book\.$/, total: times(-1), party: times(-2) },
  { re: /^Goods of (₹\d(?:[\d,]*\d)?) returned to \w+ were entered in the Purchases Book\.$/, total: times(-1), party: times(-2) },
];

function readBook(q: Asked): { text: string; total: number; party: number }[] | null {
  const out: { text: string; total: number; party: number }[] = [];
  for (const line of (q.context ?? '').split('\n')) {
    const m = /^\([a-f]\) (.+)$/.exec(line);
    if (!m) continue;
    const fits = BOOK_READERS.filter((r) => r.re.test(m[1]));
    if (fits.length !== 1) return null;
    const a = rupeesIn(m[1]);
    out.push({ text: m[1], total: fits[0].total(a), party: fits[0].party(a) });
  }
  return out.length === 3 ? out : null;
}

/** A party's balance worked again: the balance printed for the name, moved by the one error that names the party. */
function verifyPartyBalance(q: NumericQuestion): boolean {
  const name = /balance of (\w+)'s account/.exec(q.prompt)?.[1];
  const book = readBook(q);
  if (!name || !book) return false;
  const printed = new RegExp(`${name} (₹\\d(?:[\\d,]*\\d)?) \\((?:Dr|Cr)\\)`).exec(q.context ?? '');
  const balance = printed ? parseRupees(printed[1]) : null;
  const mine = book.filter((b) => new RegExp(`\\b${name}\\b`).test(b.text));
  return balance !== null && mine.length === 1 && q.answer === balance + mine[0].party;
}

const dayBookCase = caseTemplate({
  id: 'case-roe-subsidiary-books',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Errors in a subsidiary book',
  setup: (rng) =>
    attempt(6, () => {
      const shop = business(rng);
      const sales = rng.pick([true, false]);
      const book = sales ? 'Sales' : 'Purchases';
      const account = sales ? 'sales' : 'purchases';
      const names = nameSupply(rng);
      const [k, m] = [names.take(), names.take()];
      const party = sales ? debtor : creditor;
      // What the book did with an invoice of `a`: the party and the total, posted alike.
      const booked = (name: string, a: Paise): JournalLine[] => (sales ? [dr(party(name), a), cr('sales', a)] : [dr('purchases', a), cr(party(name), a)]);
      const toFrom = sales ? 'to' : 'from';

      const u = money(rng, 1000, 9000, 1000);
      const under = rng.pick([true, false]);
      const castLine = under === sales ? dr(account, u) : cr(account, u);
      const miscast = cast(
        `The ${book} Book was ${under ? 'undercast' : 'overcast'} by ${f(u)}.`,
        u,
        castLine,
        `The total ${sales ? 'credited to Sales A/c' : 'debited to Purchases A/c'} was ${f(u)} too ${under ? 'low' : 'high'}. ${ONE_BY_ONE}`,
      );

      const variant = rng.pick(['figure', 'twice', 'left out'] as const);
      let entry: Err;
      if (variant === 'figure') {
        const w = wrongPair(rng);
        // The party's balance has to be able to hold the figure that was posted.
        if (!w || Math.max(w[0], w[1]) > 4000000) return null;
        const [x, y] = w;
        entry = {
          text: `An invoice of ${f(x)} ${toFrom} ${k} was entered in the ${book} Book as ${f(y)}.`,
          kind: 'commission',
          group: 'bookEntry',
          x,
          done: booked(k, y),
          should: booked(k, x),
          recorded: `The book carried ${f(y)} to both ${k}'s account and the total, where ${f(x)} belongs: ${entryText(booked(k, y))}.`,
        };
      } else {
        const x = money(rng, 3000, 20000);
        entry =
          variant === 'twice'
            ? {
                text: `An invoice of ${f(x)} ${toFrom} ${k} was entered in the ${book} Book twice.`,
                kind: 'commission',
                group: 'bookEntry',
                x,
                done: booked(k, 2 * x),
                should: booked(k, x),
                recorded: `The invoice reached ${k}'s account and the total twice: ${entryText(booked(k, 2 * x))}.`,
              }
            : {
                text: `An invoice of ${f(x)} ${toFrom} ${k} was not entered in the ${book} Book at all.`,
                kind: 'omission',
                group: 'bookEntry',
                x,
                done: [],
                should: booked(k, x),
              };
      }

      const z = money(rng, 2000, 12000);
      const moved = rng.pick([true, false]);
      const misplaced: Err = moved
        ? sales
          ? inWrongBook(`A credit sale of ${f(z)} to ${m} was entered in the Purchases Book.`, z, [dr('purchases', z), cr(debtor(m), z)], [dr(debtor(m), z), cr('sales', z)])
          : inWrongBook(`A credit purchase of ${f(z)} from ${m} was entered in the Sales Book.`, z, [dr(creditor(m), z), cr('sales', z)], [dr('purchases', z), cr(creditor(m), z)])
        : sales
          ? inWrongBook(`Goods of ${f(z)} returned by ${m} were entered in the Sales Book.`, z, [dr(debtor(m), z), cr('sales', z)], [dr('salesReturn', z), cr(debtor(m), z)])
          : inWrongBook(`Goods of ${f(z)} returned to ${m} were entered in the Purchases Book.`, z, [dr('purchases', z), cr(creditor(m), z)], [dr(creditor(m), z), cr('purchasesReturn', z)]);
      // The three errors share accounts by design; only their figures have to be told apart.
      const figures = [u, z, 2 * z, ...rupeesIn(entry.text), wrongLines(entry)[0].amount];
      if (new Set(figures).size < new Set([...rupeesIn(entry.text), wrongLines(entry)[0].amount]).size + 3) return null;

      const errors = rng.shuffle([miscast, entry, misplaced]);
      // What each rectifying entry adds to the account the book is posted to, on the side of its balance.
      const side: Side = sales ? 'Cr' : 'Dr';
      const toTotal = (e: Err) => sumOf(wrongLines(e).filter((l) => l.accountId === account).map((l) => (l.side === side ? l.amount : -l.amount)));
      const partySide: Side = sales ? 'Dr' : 'Cr';
      const toParty = (e: Err, name: string) => sumOf(wrongLines(e).filter((l) => l.accountId === party(name)).map((l) => (l.side === partySide ? l.amount : -l.amount)));
      return {
        shop,
        book,
        sales,
        k,
        m,
        partySide,
        errors,
        miscast,
        entry,
        misplaced,
        c: errors.indexOf(miscast),
        e: errors.indexOf(entry),
        w: errors.indexOf(misplaced),
        total: amount(rng, 150000, 480000, 1000),
        shifts: { cast: toTotal(miscast), entry: toTotal(entry), misplaced: toTotal(misplaced) },
        kBalance: amount(rng, 45000, 90000, 1000),
        mBalance: amount(rng, 40000, 90000, 1000),
        kShift: toParty(entry, k),
        mShift: toParty(misplaced, m),
        variant,
        // Why the wrong entry in the book left debits equal to credits.
        alike:
          variant === 'figure'
            ? `an invoice entered at a wrong figure carries that figure to ${k}'s account and to the total alike`
            : variant === 'twice'
              ? `an invoice entered twice reaches ${k}'s account and the total twice`
              : `an invoice left out of the book is missing from ${k}'s account and from the total alike`,
      };
    }),
  context: (s) =>
    [
      s.shop.intro,
      `The ${s.book} Book for March 2026 was totalled at ${f(s.total)} and posted to ${s.book} A/c.`,
      `${s.sales ? "Customers'" : "Suppliers'"} balances in the ledger: ${s.k} ${f(s.kBalance)} (${s.partySide}); ${s.m} ${f(s.mBalance)} (${s.partySide}).`,
      'The trial balance did not agree, and the difference was put to a Suspense A/c.',
      'These errors were then found; there are no others.',
      ...listed(s.errors),
    ].join('\n'),
  parts: [
    {
      kind: 'mcq',
      make: (s) => ({
        prompt: 'Which of the errors made the trial balance disagree?',
        correct: `Error ${tags([s.c])}`,
        distractors: [
          { text: `Error ${tags([s.e])}`, why: `${cap(s.alike)}, so debits still equal credits.` },
          { text: `Error ${tags([s.w])}`, why: `An entry in the wrong book is still posted on both sides for the same amount, so debits still equal credits.` },
          { text: `Errors ${tags([s.c, s.e])}`, why: `Included error ${tag(s.e)}: ${s.alike}, so it left the totals equal.` },
          { text: 'All three', why: 'Assumed every error upsets the trial balance; only an error that leaves one account wrong does.' },
        ],
        explanation: `${s.errors.map((e, i) => gapLine(e, i)).join(' ')} Only the wrong addition left one account, ${s.book} A/c, out on its own.`,
      }),
      verify: (q: McqQuestion) => {
        const all = readCase(q);
        if (!all) return false;
        const oneSided = [...all].filter(([, r]) => r.tb !== 0).map(([l]) => l);
        return oneSided.length === 1 && correctText(q) === `Error (${oneSided[0]}) only`;
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const answer = s.kBalance + s.kShift;
        const [x, y] = rupeesIn(s.entry.text);
        const list: Slip[] = [{ value: s.kBalance - s.kShift, why: `Moved the balance the wrong way: ask whether ${s.k}'s account holds too much or too little.` }];
        if (s.variant === 'figure') {
          list.push({ value: Math.abs(s.kShift), why: 'Gave the amount of the correction instead of the balance after it.' });
          list.push({ value: s.kBalance + x, why: 'Brought in the right figure without first taking out the wrong figure that was posted.' });
          list.push({ value: s.kBalance - y, why: 'Took out the wrong figure but did not put the right one in its place.' });
        } else if (s.variant === 'twice') {
          list.push({ value: s.kBalance - 2 * x, why: 'Took the invoice out twice; one of the two entries is right and stays.' });
          list.push({ value: x, why: 'Gave the amount of the invoice instead of the balance after the correction.' });
        } else {
          list.push({ value: x, why: 'Gave the amount of the invoice instead of the balance after the correction.' });
          list.push({ value: s.kBalance + 2 * x, why: 'Added the invoice twice; it has to be posted once.' });
        }
        list.push({ value: s.kBalance, why: `Left the balance as it stands; ${s.k}'s account is posted from the book, so an error in the book is in the account too.` });
        return typed(`What is the correct balance of ${s.k}'s account?`, answer, list, [
          `${s.k}'s account stands at ${f(s.kBalance)} (${s.partySide}).`,
          s.entry.recorded ?? `The invoice never reached ${s.k}'s account.`,
          `Correct balance = ${f(s.kBalance)} ${s.kShift > 0 ? '+' : '-'} ${f(Math.abs(s.kShift))} = ${f(answer)} (${s.partySide}).`,
        ]);
      },
      verify: verifyPartyBalance,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const answer = s.mBalance + s.mShift;
        const z = s.misplaced.x;
        return typed(
          `What is the correct balance of ${s.m}'s account?`,
          answer,
          [
            { value: s.mBalance + s.mShift / 2, why: 'Corrected the posting once; the wrong posting has to be cancelled and the right one made, so the balance moves by twice the amount.' },
            { value: s.mBalance - s.mShift, why: `Moved the balance the wrong way: ask on which side of ${s.m}'s account the item should have been posted.` },
            { value: s.mBalance - s.mShift / 2, why: 'Moved the balance the wrong way, and by the amount once instead of twice.' },
            { value: 2 * z, why: 'Gave the amount of the correction instead of the balance after it.' },
          ],
          [
            `${s.m}'s account stands at ${f(s.mBalance)} (${s.partySide}).`,
            `As recorded: ${entryText(s.misplaced.done)}. It should have been: ${entryText(s.misplaced.should)}.`,
            `${s.m}'s account was posted with ${f(z)} on the wrong side, so it moves by 2 × ${f(z)} = ${f(2 * z)}.`,
            `Correct balance = ${f(s.mBalance)} ${s.mShift > 0 ? '+' : '-'} ${f(2 * z)} = ${f(answer)} (${s.partySide}).`,
          ],
        );
      },
      verify: verifyPartyBalance,
    },
    { kind: 'journal', make: (s) => entryParts(s.entry, s.e), verify: verifyEntry },
    { kind: 'journal', make: (s) => entryParts(s.misplaced, s.w), verify: verifyEntry },
    {
      kind: 'mcq',
      make: (s) => {
        const gap = tbNet(s.miscast);
        return suspenseSideParts('What kind of balance did the Suspense A/c have when it was opened, and why?', gap, [
          s.miscast.recorded ?? '',
          `So the ${gap > 0 ? 'debit' : 'credit'} total was larger by ${f(Math.abs(gap))}, and Suspense A/c went on the ${gap > 0 ? 'credit' : 'debit'} side with ${f(Math.abs(gap))}.`,
        ]);
      },
      verify: verifySuspenseSide,
    },
    { kind: 'journal', make: (s) => entryParts(s.miscast, s.c, '', ', the entry that closes the Suspense A/c'), verify: verifyEntry },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { cast: a, entry: b, misplaced: c } = s.shifts;
        const answer = s.total + a + b + c;
        const step = (v: number) => `${v > 0 ? '+' : '-'} ${f(Math.abs(v))}`;
        return typed(
          `What is the correct total of the ${s.book} Book for March 2026?`,
          answer,
          [
            { value: s.total + a, why: 'Corrected the addition only, and left the wrong entries in the book as they were.' },
            { value: s.total - a + b + c, why: 'Applied the wrong addition the wrong way round: a total that is undercast has to be raised, and one that is overcast lowered.' },
            { value: s.total + a + b + 2 * c, why: `Used twice the amount for error ${tag(s.w)}; that is the correction to ${s.m}'s account, while the total of the book changes by the amount once.` },
            { value: s.total + a + b, why: `Left out error ${tag(s.w)}, which also changes what belongs in this book.` },
            { value: s.total + b + c, why: `Left out error ${tag(s.c)}, the wrong addition.` },
            { value: s.total + a - b + c, why: `Applied error ${tag(s.e)} the wrong way round.` },
          ],
          [
            `Total as cast: ${f(s.total)}.`,
            `${tag(s.c)} the addition: ${step(a)}.`,
            `${tag(s.e)} the invoice of ${s.k}: ${step(b)}.`,
            `${tag(s.w)} the item of ${s.m}, which ${c > 0 ? 'belongs in this book and is missing from it' : 'does not belong in this book'}: ${step(c)}.`,
            `Correct total = ${f(s.total)} ${step(a)} ${step(b)} ${step(c)} = ${f(answer)}.`,
          ],
        );
      },
      verify: (q: NumericQuestion) => {
        const book = readBook(q);
        const total = figureAfter(q, 'totalled at');
        return !!book && total !== null && q.answer === total + sumOf(book.map((b) => b.total));
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Case 6 (complex): the profit shown by the books and a list of errors
// ---------------------------------------------------------------------------------------------------------------

const DOUBLED: Maker[] = [...wrongSideNominal, ...wrongBook];
const PRINCIPLE: Maker[] = [...principleSimple, ...principleCompound, ...principleCompound];
const PLAIN_PROFIT: Maker[] = [...casting, ...notPostedNominal, ...wrongAmountNominal, ...omittedProfit];
const NO_PROFIT: Maker[] = [...wrongAccount, ...notPostedParty, ...wrongSideParty, ...wrongAmountParty, ...omittedNoProfit, ...compensating];

const profitSetup = (rng: Rng) =>
  attempt(8, () => {
    const shop = business(rng);
    const drawn = drawSet(rng, [DOUBLED, PRINCIPLE, PLAIN_PROFIT, rng.pick([PLAIN_PROFIT, NO_PROFIT]), NO_PROFIT], nameSupply(rng));
    if (!drawn) return null;
    const errors = rng.shuffle(drawn);
    const effects = errors.map(profitEffect);
    const all = errors.map((_, i) => i);
    const over = all.filter((i) => effects[i] > 0);
    const under = all.filter((i) => effects[i] < 0);
    const none = all.filter((i) => effects[i] === 0);
    const effect = sumOf(effects);
    if (over.length === 0 || under.length === 0 || effect === 0) return null;
    return { shop, errors, effects, over, under, none, effect, doubled: errors.indexOf(drawn[0]), principle: errors.indexOf(drawn[1]), shown: amount(rng, 250000, 800000, 5000) };
  });
type ProfitScenario = NonNullable<ReturnType<typeof profitSetup>>;

const profitCase = caseTemplate<ProfitScenario>({
  id: 'case-roe-corrected-profit',
  version: 2,
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'From the profit in the books to the correct profit',
  setup: profitSetup,
  context: (s) =>
    [
      s.shop.intro,
      `For the year ended ${YEAR_END} the books show a net profit of ${f(s.shown)}.`,
      'These errors were then found; there are no others. The profit is to be corrected for these errors only.',
      ...listed(s.errors),
      ...notes(s.errors),
    ].join('\n'),
  parts: [
    {
      kind: 'mcq',
      make: (s) => {
        const plain = [...s.over, ...s.under].find((i) => i !== s.doubled && i !== s.principle);
        const distractors: Distractor[] = [
          { text: cap(tags([...s.none, s.principle])), why: `Included error ${tag(s.principle)}: an asset or a personal item booked as an expense, or the reverse, changes an expense or an income.` },
          { text: cap(tags([...s.none, s.doubled])), why: `Included error ${tag(s.doubled)}: an income or expense account is wrong in it, so the profit is wrong too.` },
          { text: 'None of them: every error changes the profit', why: `Assumed every error reaches the profit; in error ${tag(s.none[0])} ${unchangedBecause(s.errors[s.none[0]])}.` },
        ];
        if (s.none.length > 1) distractors.push({ text: cap(tags(s.none.slice(1))), why: `Missed error ${tag(s.none[0])}, which also leaves the profit unchanged: ${unchangedBecause(s.errors[s.none[0]])}.` });
        if (plain !== undefined) distractors.push({ text: cap(tags([...s.none, plain])), why: `Included error ${tag(plain)}: ${profitReason(s.errors[plain])}, which changes the profit.` });
        return {
          prompt: 'Which of the errors leave the net profit unchanged?',
          correct: cap(tags(s.none)),
          distractors,
          explanation: `An error changes the profit only if it leaves an income or an expense wrong. ${s.errors
            .map((e, i) => (s.effects[i] === 0 ? `${tag(i)} No effect: ${unchangedBecause(e)}.` : `${tag(i)} ${cap(profitReason(e))}.`))
            .join(' ')}`,
        };
      },
      verify: (q: McqQuestion) => {
        const all = readCase(q);
        if (!all) return false;
        const want = [...all].filter(([, r]) => r.profit === 0).map(([l]) => l);
        return want.length > 0 && lettersIn(correctText(q)).join() === want.join();
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const e = s.errors[s.doubled];
        const effect = s.effects[s.doubled];
        const label = (v: number) => `${v > 0 ? 'Overstated' : 'Understated'} by ${f(Math.abs(v))}`;
        return {
          prompt: `What is the effect of error ${tag(s.doubled)} alone on the net profit shown by the books?`,
          correct: label(effect),
          distractors: [
            {
              text: label(effect / 2),
              why:
                e.group === 'wrongBook'
                  ? 'Counted only one of the two accounts; two trading accounts are each wrong by the amount, and both move the profit the same way.'
                  : 'Counted the amount once; the item sits on the wrong side of its account, so cancelling it and posting it correctly moves the profit by twice the amount.',
            },
            { text: label(-effect), why: 'Got the direction wrong: profit is overstated when an expense is too low or an income too high, and understated in the opposite case.' },
            { text: label(-effect / 2), why: 'Got the direction wrong, and also counted the amount once instead of twice.' },
            { text: 'Not affected', why: 'Thought a slip in posting does not reach the profit; here an income or expense account is wrong.' },
          ],
          explanation: `${e.done.length > 0 ? `As recorded: ${entryText(e.done)}. ` : ''}It should have been: ${entryText(e.should)}. ${cap(profitReason(e))}, so the profit is ${effect > 0 ? 'overstated' : 'understated'} by ${f(Math.abs(effect))}.`,
        };
      },
      verify: (q: McqQuestion) => {
        const r = readCase(q)?.get(lettersIn(q.prompt)[0]);
        return !!r && r.profit !== 0 && correctText(q) === `${r.profit > 0 ? 'Overstated' : 'Understated'} by ${f(Math.abs(r.profit))}`;
      },
    },
    { kind: 'journal', make: (s) => entryParts(s.errors[s.principle], s.principle), verify: verifyEntry },
    ...(['over', 'under'] as const).map((way) => ({
      kind: 'numeric' as const,
      unit: 'rupees' as const,
      make: (s: ProfitScenario): NumericParts | null => {
        const mine = s[way];
        const others = way === 'over' ? s.under : s.over;
        const word = way === 'over' ? 'overstate' : 'understate';
        const answer = sumOf(mine.map((i) => Math.abs(s.effects[i])));
        const list: Slip[] = [];
        if (mine.includes(s.doubled)) list.push({ value: answer - Math.abs(s.effects[s.doubled]) / 2, why: `Counted error ${tag(s.doubled)} once; it moves the profit by twice its amount.` });
        list.push({ value: answer + s.errors[s.none[0]].x, why: `Included error ${tag(s.none[0])}, which does not change the profit.` });
        for (const i of others) list.push({ value: answer + Math.abs(s.effects[i]), why: `Included error ${tag(i)}, which ${way === 'over' ? 'understates' : 'overstates'} the profit.` });
        if (mine.length > 1) for (const i of mine) list.push({ value: answer - Math.abs(s.effects[i]), why: `Left out error ${tag(i)}, which also ${word}s the profit.` });
        return typed(
          `Add up the errors that ${word} the net profit. By what amount in all do they ${word} it?`,
          answer,
          list,
          [
            ...mine.map((i) => `${tag(i)} ${cap(profitReason(s.errors[i]))}: ${word}d by ${f(Math.abs(s.effects[i]))}.`),
            `Total ${word}ment: ${f(answer)}. Profit is ${way === 'over' ? 'overstated when an expense is too low or an income too high' : 'understated when an expense is too high or an income too low'}.`,
          ],
        );
      },
      verify: (q: NumericQuestion) => {
        const all = readCase(q);
        if (!all) return false;
        const sign = q.prompt.includes('that overstate') ? 1 : -1;
        return q.answer === sumOf([...all.values()].map((r) => Math.max(0, sign * r.profit)));
      },
    })),
    {
      kind: 'mcq',
      make: (s) => {
        const o = sumOf(s.over.map((i) => s.effects[i]));
        const u = -sumOf(s.under.map((i) => s.effects[i]));
        return {
          prompt: `Taking all the errors together, is the net profit of ${f(s.shown)} overstated or understated?`,
          correct: s.effect > 0 ? 'Overstated' : 'Understated',
          distractors: [
            {
              text: s.effect > 0 ? 'Understated' : 'Overstated',
              why: `Read the net effect the wrong way: the errors overstate the profit by ${f(o)} and understate it by ${f(u)}, and the ${s.effect > 0 ? 'overstatement' : 'understatement'} is the larger.`,
            },
            { text: 'Neither: the overstatements and the understatements cancel', why: `Assumed that errors in opposite directions cancel completely; ${f(o)} one way and ${f(u)} the other leave ${f(Math.abs(s.effect))}.` },
            { text: 'Neither: the errors change the trial balance, not the profit', why: 'Kept the trial balance and the profit apart; an income or expense account that is wrong changes the profit whether or not the totals agree.' },
          ],
          explanation: `Overstated by ${f(o)} in all, understated by ${f(u)} in all: on balance the profit is ${s.effect > 0 ? 'overstated' : 'understated'} by ${f(Math.abs(s.effect))}.`,
        };
      },
      verify: (q: McqQuestion) => {
        const all = readCase(q);
        const effect = all ? sumOf([...all.values()].map((r) => r.profit)) : 0;
        return effect !== 0 && correctText(q) === (effect > 0 ? 'Overstated' : 'Understated');
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const o = sumOf(s.over.map((i) => s.effects[i]));
        const u = -sumOf(s.under.map((i) => s.effects[i]));
        const half = s.effects[s.doubled] / 2;
        return correctedProfit(
          'What is the correct net profit for the year?',
          s.shown,
          o,
          u,
          [
            { value: s.shown - s.effect + half, why: `Counted error ${tag(s.doubled)} once; it moves the profit by twice its amount.` },
            { value: s.shown, why: 'Left the profit as the books show it.' },
          ],
          [
            `Profit shown by the books: ${f(s.shown)}.`,
            `Less the overstatement, ${named(s.over)}: ${f(o)}.`,
            `Add the understatement, ${named(s.under)}: ${f(u)}.`,
            `Correct net profit = ${f(s.shown)} - ${f(o)} + ${f(u)} = ${f(s.shown - s.effect)}.`,
          ],
        );
      },
      verify: (q: NumericQuestion) => {
        const all = readCase(q);
        const shown = figureAfter(q, 'net profit of');
        return !!all && shown !== null && q.answer === shown - sumOf([...all.values()].map((r) => r.profit));
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Chained cases: the long question on one list of errors, as an examiner sets it. The student passes the rectifying
// entries (a set), then prepares the Suspense A/c those entries post to (an account), redrafts a trial balance (a
// statement) or works out the correct profit.
//
// The errors are those of the cases above: the same makers and sentences, drawn by the same rules (`drawSet`: no two
// errors of a case share a figure or leave the same account wrong, and no compensating pair is among them), and every
// entry is `rectifyingEntry`. The working of an entry of a set and the Suspense A/c are those of the topic's sets and
// formats (`ROE_CHAIN` in `templates/rectification-of-errors.ts`), which are handed the errors in the topic's own
// shape (`asTopicError`): the account is written up from the very entries the set asks for, so the two parts cannot
// disagree. `verify` reads every error again from its sentence in the printed case (READERS) and checks each part,
// entry by entry and row by row, against that reading.
// ---------------------------------------------------------------------------------------------------------------

const R = ROE_CHAIN;

/** An error of this file in the shape of the topic's model, with the first lines of its working in the words used above. */
function asTopicError(e: Err): RoeError {
  const posts = (ls: JournalLine[]) => ls.map((l) => ({ account: l.accountId, side: l.side, amount: l.amount }));
  return {
    text: e.text,
    kind: e.kind,
    done: posts(e.done),
    should: posts(e.should),
    recorded: e.recorded ?? (e.done.length > 0 ? `As recorded: ${entryText(e.done)}.` : 'Nothing was recorded: the transaction is missing from every book.'),
    correct: e.correct === null ? null : (e.correct ?? `It should have been: ${entryText(e.should)}.`),
  };
}

/**
 * What an error is about, in a few words without its amounts: the text of its item in a set, where the case text
 * above has the whole sentence. In a pattern `#` is an amount and `@` the name of a person.
 */
const naming = (pattern: string, say: (m: RegExpExecArray) => string) => ({
  re: new RegExp(`^${pattern.replace(/#/g, '₹[\\d,]+').replace(/@/g, '([A-Z][a-z]+)')}`),
  say,
});
const NAMINGS = [
  naming('The (Sales Return|Purchases Return|Sales|Purchases) Book was (?:under|over)cast by #', (m) => `The total of the ${m[1]} Book.`),
  naming('The debit side of (.+ A/c) was overcast by #', (m) => `The total of the debit side of ${m[1]}.`),
  naming('A credit sale of # to @ ', (m) => `The credit sale to ${m[1]}.`),
  naming('A credit purchase of # from @ ', (m) => `The credit purchase from ${m[1]}.`),
  naming('Cash # received from @, a customer,', (m) => `The cash received from ${m[1]}.`),
  naming('Cash # paid to @, a supplier,', (m) => `The cash paid to ${m[1]}.`),
  naming('Cash # paid as (wages for installing a new machine|carriage on a new machine) ', (m) => `The ${m[1]}.`),
  naming('Cash # deposited into the bank ', () => 'The cash deposited into the bank.'),
  naming('Commission of # received in cash ', () => 'The commission received in cash.'),
  naming('Discount of # received from @ ', (m) => `The discount received from ${m[1]}.`),
  naming('Goods of # returned by @, a customer,', (m) => `The goods returned by ${m[1]}.`),
  naming('Goods costing # taken by the proprietor ', () => 'The goods taken by the proprietor.'),
  naming('Furniture of # bought on credit from @ ', (m) => `The furniture bought on credit from ${m[1]}.`),
  naming('(Furniture|A computer|A machine|Office equipment) bought for # by cheque ', (m) => `The ${m[1].replace(/^A /, '').toLowerCase()} bought by cheque.`),
  naming('Repairs of # to (.+?), paid in cash,', (m) => `The repairs to ${m[1]}.`),
  naming("A cheque of # for the proprietor's (.+?) was ", (m) => `The cheque for the proprietor's ${m[1]}.`),
  naming('Old furniture sold for # cash,', () => 'The sale of old furniture.'),
  naming('A machine of # was debited to Purchases A/c, and # paid to install it ', () => 'The machine and the cost of installing it.'),
  naming('([A-Z][a-z]+(?: [a-z]+)?) of # paid (in cash|by cheque) (?:was|were) ', (m) => `The ${m[1].toLowerCase()} paid ${m[2]}.`),
];
function nameOf(sentence: string): string | null {
  for (const n of NAMINGS) {
    const m = n.re.exec(sentence);
    if (m) return n.say(m);
  }
  return null;
}

/** The errors of one chained case in the order they are listed, each with the few words that name it in the set. */
interface ErrorList {
  errors: Err[];
  names: string[];
  /** What each error did to the trial balance: debit total less credit total. */
  gaps: number[];
}
/** One error from each pool, listed in an order of its own; null when a pool gives none or two errors would be named alike. */
function errorList(rng: Rng, pools: readonly (readonly Maker[])[]): ErrorList | null {
  const drawn = drawSet(rng, pools, nameSupply(rng));
  if (!drawn || drawn.length > LETTERS.length) return null;
  const errors = rng.shuffle(drawn);
  const names = errors.map((e) => nameOf(e.text));
  if (names.some((n) => n === null) || new Set(names).size < names.length) return null;
  return { errors, names: names as string[], gaps: errors.map(tbNet) };
}

const SET_TASK = 'Pass the rectifying journal entries, one for each error.';
const SET_HINT_FIRST = 'Take the errors one at a time. For each one, write what was posted and what should have been posted.';
const SET_HINTS_SUSPENSE = [SET_HINT_FIRST, ENTRY_HINTS[1]];
const SET_HINTS_NO_SUSPENSE = [
  SET_HINT_FIRST,
  'Cancel the wrong posting and make the right one. The trial balance agreed, so each of these errors left the two totals equal: the entry goes between the accounts that are wrong, and no Suspense A/c is used.',
];

/** The rectifying entries of a list as one set: an item for each error, called by its letter. */
function rectifyingSet(s: ErrorList, suspenseOpen: boolean): CaseSetParts {
  const transactions = s.errors.map((e, i) => ({ label: tag(i), text: s.names[i], lines: rectifyingEntry(e), explanation: R.setSteps(asTopicError(e), suspenseOpen) }));
  const inEntries = new Set(transactions.flatMap((t) => t.lines.map((l) => l.accountId)));
  return {
    task: SET_TASK,
    transactions,
    hints: suspenseOpen ? SET_HINTS_SUSPENSE : SET_HINTS_NO_SUSPENSE,
    // Suspense A/c, and the accounts the errors name that were right the first time, tempt a wrong entry.
    distractorAccounts: [...new Set(['suspense', ...s.errors.flatMap(accountsOf)])].filter((a) => !inEntries.has(a)),
  };
}

/** The Suspense A/c of a list, as the topic's format prepares it, in the books of this case. */
function suspenseOf(owner: string, errors: Err[], opening: number, mode: 'given' | 'find'): CaseAccountParts | null {
  const made = R.suspense(owner, errors.map(asTopicError), opening, mode, YEAR_END);
  if (made === null) return null;
  return {
    ...made,
    task:
      mode === 'given'
        ? `Prepare the Suspense A/c in the books of ${owner} after these errors are rectified. Enter the difference it opened with as "${R.difference}"; if a balance is left, carry it down and bring it down.`
        : `Prepare the Suspense A/c in the books of ${owner} and find the difference with which it was opened. Enter that difference as "${R.difference}".`,
  };
}

/** The errors a case text lists, each read again from its sentence; null if one is not understood. */
interface Listed {
  letter: string;
  sentence: string;
  r: Read;
}
function errorsIn(text: string | undefined): Listed[] | null {
  const out: Listed[] = [];
  for (const line of (text ?? '').split('\n')) {
    const m = /^\(([a-f])\) (.+)$/.exec(line);
    if (!m) continue;
    const r = read(m[2]);
    if (r === null) return null;
    out.push({ letter: m[1], sentence: m[2], r });
  }
  return out.length > 0 ? out : null;
}

/**
 * An entry against the reading of its error: it balances, clears exactly the difference the error put into Suspense
 * A/c (nothing for an error that left the totals equal), takes back exactly the misstatement of profit, and for a
 * one-sided error corrects one account, which stands in the column of the trial balance the reading names.
 */
function entryHolds(lines: JournalLine[], r: Read): boolean {
  const suspense = lines.filter((l) => l.accountId === 'suspense');
  const others = lines.filter((l) => l.accountId !== 'suspense');
  const cleared = r.tb === 0 ? suspense.length === 0 : suspense.length === 1 && suspense[0].amount === Math.abs(r.tb) && suspense[0].side === (r.tb > 0 ? 'Dr' : 'Cr');
  const placed = r.tb === 0 || (others.length === 1 && normalSide(resolveAccount(others[0].accountId)) === r.col);
  return cleared && placed && others.length > 0 && net(lines) === 0 && profitOf(lines) === -r.profit;
}

/**
 * A set checked against the printed case: an entry for every error, under its letter and its few words, that
 * rectifies the error as its sentence is read again. Where no Suspense A/c exists, none of the errors may have upset
 * the trial balance.
 */
const setRectifies =
  (suspense: 'open' | 'none') =>
  (q: JournalSetQuestion): boolean => {
    const all = errorsIn(q.context);
    if (!all || all.length < 3 || all.length !== q.entries.length) return false;
    return q.entries.every((e, i) => {
      const { letter, sentence, r } = all[i];
      return e.label === `(${letter})` && e.text === nameOf(sentence) && (suspense === 'open' || r.tb === 0) && entryHolds(e.expected, r);
    });
  };

/**
 * A Suspense A/c checked against the printed case: it opens with `open` (a debit balance is positive), carries what
 * is left (`suspenseHolds`), and every other row refers to an error that upset the trial balance, by its letter, for
 * the amount and on the side that the reading of the sentence gives: debits too large are cleared by a debit to
 * Suspense A/c. An error that left the totals equal has no row.
 */
function suspenseAgrees(q: AccountQuestion, all: Listed[], open: number, mode: 'given' | 'find'): boolean {
  if (!R.suspenseHolds(q, all.map((l) => l.r.tb), open, mode)) return false;
  const rows = q.sides.flatMap((side, i) => side.rows.filter((row) => row.label !== R.difference && !row.closing).map((row) => ({ row, debit: i === 0 })));
  const through = all.filter((l) => l.r.tb !== 0);
  return (
    rows.length === through.length &&
    through.every((l) => rows.filter(({ row, debit }) => row.ref === `(${l.letter})` && row.amounts[0] === Math.abs(l.r.tb) && debit === l.r.tb > 0).length === 1)
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Chain 1 (medium): the difference in the trial balance is given; the entries, then the Suspense A/c
// ---------------------------------------------------------------------------------------------------------------

const chainEntriesAndSuspense = caseTemplate({
  id: 'case-roe-chain-entries-and-suspense',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Rectifying entries and the Suspense A/c',
  setup: (rng) =>
    attempt(8, () => {
      const shop = business(rng);
      // Three or four errors that went through Suspense A/c, and one or two that never touched it.
      const list = errorList(rng, [
        ...rng.shuffle([notPosted, casting, wrongSide, notPosted, casting]).slice(0, rng.pick([3, 4])),
        ...rng.shuffle([wrongAccount, omitted, principleSimple]).slice(0, rng.pick([1, 2])),
      ]);
      if (!list) return null;
      // Two seeds in five have errors still to be traced, which leave a balance in the account.
      const untraced = rng.int(0, 4) < 2 ? rng.pick([1, -1]) * money(rng, 500, 5000) : 0;
      // A debit excess in the trial balance is made up by Suspense A/c on the credit side: a debit balance is positive.
      const opening = -(sumOf(list.gaps) + untraced);
      // The difference, and a balance that is left, are figures of their own: neither is the amount of one of the entries.
      if (opening === 0 || list.gaps.some((g) => g !== 0 && [Math.abs(opening), Math.abs(untraced)].includes(Math.abs(g))) || Math.abs(opening) === Math.abs(untraced)) return null;
      const account = suspenseOf(shop.owner, list.errors, opening, 'given');
      return account && { shop, ...list, opening, account };
    }),
  context: (s) =>
    [
      `${s.shop.intro} The trial balance on ${YEAR_END} did not agree.`,
      `The difference was put to a Suspense A/c, which opened with a ${balWord(s.opening)} balance of ${f(Math.abs(s.opening))}.`,
      // Whether these are all the errors is for the account to show: it closes, or a balance is left.
      'These errors were then found; others may still be in the books.',
      ...listed(s.errors),
      ...notes(s.errors),
    ].join('\n'),
  parts: [
    { kind: 'journal_set', make: (s) => rectifyingSet(s, true), verify: setRectifies('open') },
    {
      kind: 'account',
      make: (s) => s.account,
      // The account opens with the balance the case gives, and each error read again from its sentence has its row.
      verify: (q: AccountQuestion) => {
        const all = errorsIn(q.data);
        const given = /opened with a (debit|credit) balance of (₹[\d,]+)\./.exec(q.data);
        const stated = given ? parseRupees(given[2]) : null;
        if (!all || all.length < 3 || !given || stated === null || stated <= 0) return false;
        return suspenseAgrees(q, all, given[1] === 'debit' ? stated : -stated, 'given');
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Chain 2 (complex): the difference is not given; the entries, then the Suspense A/c that finds it
// ---------------------------------------------------------------------------------------------------------------

const chainFindDifference = caseTemplate({
  id: 'case-roe-chain-find-difference',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Finding the difference in the trial balance',
  setup: (rng) =>
    attempt(8, () => {
      const shop = business(rng);
      // A posting on the wrong side and one at a wrong figure, whose amounts have to be worked out, are always among them.
      // With them one or two more that went through Suspense A/c and one or two that did not: five or six errors in all.
      const more = rng.pick([1, 2]);
      const list = errorList(rng, [
        wrongSide,
        wrongAmount,
        ...rng.shuffle([casting, notPosted, casting, notPosted]).slice(0, more),
        ...rng.shuffle([wrongBook, wrongAccount, principleSimple, omitted, principleCompound]).slice(0, more === 1 ? 2 : rng.pick([1, 2])),
      ]);
      if (!list) return null;
      // The errors account for the whole difference, so the account opened with what closes it: a figure of its own,
      // not the amount of one of the entries.
      const opening = -sumOf(list.gaps);
      if (opening === 0 || list.gaps.some((g) => Math.abs(g) === Math.abs(opening))) return null;
      const account = suspenseOf(shop.owner, list.errors, opening, 'find');
      return account && { shop, ...list, opening, account };
    }),
  context: (s) =>
    [
      `${s.shop.intro} The trial balance on ${YEAR_END} did not agree.`,
      'The difference was put to a Suspense A/c; its amount is not given here.',
      'These errors were then found; there are no others.',
      ...listed(s.errors),
      ...notes(s.errors),
    ].join('\n'),
  parts: [
    { kind: 'journal_set', make: (s) => rectifyingSet(s, true), verify: setRectifies('open') },
    {
      kind: 'account',
      make: (s) => s.account,
      // Nothing is given and there are no other errors: the errors as read again must close the account, so it opens
      // with what they leave short.
      verify: (q: AccountQuestion) => {
        const all = errorsIn(q.data);
        if (!all || all.length < 3 || /opened with/.test(q.data) || !q.data.includes('there are no others')) return false;
        return suspenseAgrees(q, all, -sumOf(all.map((l) => l.r.tb)), 'find');
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Chain 3 (complex): a clerk's trial balance redrafted, its difference put to Suspense A/c, and the error behind it
//
// The case prints a trial balance in which every balance is as the ledger has it and several stand in the wrong
// column. The ledger itself holds one error, which left one account wrong, and that account is a line of the trial
// balance (never a customer or a supplier inside Sundry debtors or Sundry creditors). So the redrafted columns do not
// agree: the difference goes to Suspense A/c, a row of the statement, on the side that is short. The rectifying entry
// then closes Suspense A/c, and the last question asks what the columns add up to after it.
// The true balances agree (Capital is what makes them agree); the balance of the account the error left wrong is
// printed as the error left it. `verify` places every printed balance by a list of its own (DEBIT_NAMES and
// CREDIT_NAMES) and reads the error again from its sentence: the difference of the redrafted columns must be what
// that reading says the error did to the trial balance.
// ---------------------------------------------------------------------------------------------------------------

interface TbAccount {
  name: string;
  side: Side;
  /** What the balance is, for the working: "an asset", "a reduction of the sales". */
  is: string;
  /** The range of a believable balance, in rupees. */
  min: number;
  max: number;
  step: number;
}
const tbAccount =
  (side: Side) =>
  (name: string, is: string, min: number, max: number, step: number): TbAccount => ({ name, side, is, min, max, step });
const debitBalance = tbAccount('Dr');
const creditBalance = tbAccount('Cr');

// The names and ranges are those of the trial balances of the topic Trial Balance.
const TB = {
  cash: debitBalance('Cash in hand', 'an asset', 3000, 40000, 500),
  debtors: debitBalance('Sundry debtors', 'an asset', 40000, 150000, 1000),
  furniture: debitBalance('Furniture', 'an asset', 15000, 90000, 1000),
  computers: debitBalance('Computers', 'an asset', 30000, 150000, 1000),
  billsReceivable: debitBalance('Bills receivable', 'an asset (money due to the business on bills)', 5000, 60000, 500),
  openingStock: debitBalance('Opening stock', 'an asset brought forward from last year', 20000, 150000, 1000),
  purchases: debitBalance('Purchases', 'an expense', 100000, 500000, 1000),
  salesReturns: debitBalance('Sales returns', 'a reduction of the sales', 3000, 30000, 500),
  wages: debitBalance('Wages', 'an expense', 10000, 60000, 500),
  rent: debitBalance('Rent paid', 'an expense', 6000, 48000, 500),
  salaries: debitBalance('Salaries', 'an expense', 20000, 120000, 500),
  insurance: debitBalance('Insurance premium', 'an expense', 2000, 20000, 500),
  advertisement: debitBalance('Advertisement charges', 'an expense', 2000, 30000, 500),
  electricity: debitBalance('Electricity charges', 'an expense', 2000, 24000, 500),
  discountAllowed: debitBalance('Discount allowed', 'a loss to the business', 1000, 12000, 500),
  drawings: debitBalance('Drawings', 'a reduction of the capital', 5000, 60000, 500),
  capital: creditBalance('Capital', 'what the business owes its proprietor', 0, 0, 0),
  sales: creditBalance('Sales', 'an income', 0, 0, 0),
  purchasesReturns: creditBalance('Purchases returns', 'a reduction of the purchases', 3000, 30000, 500),
  creditors: creditBalance('Sundry creditors', 'a liability', 20000, 90000, 1000),
  loan: creditBalance('Bank loan', 'a liability', 50000, 200000, 5000),
  billsPayable: creditBalance('Bills payable', 'a liability', 5000, 60000, 500),
  discountReceived: creditBalance('Discount received', 'a gain to the business', 1000, 12000, 500),
  commission: creditBalance('Commission received', 'an income', 2000, 30000, 500),
  overdraft: creditBalance('Bank overdraft', 'a liability to the bank', 10000, 80000, 1000),
};
/** The line of the trial balance in which the ledger account an error left wrong stands. */
const TB_OF: Record<string, TbAccount> = {
  sales: TB.sales,
  purchases: TB.purchases,
  salesReturn: TB.salesReturns,
  purchasesReturn: TB.purchasesReturns,
  rent: TB.rent,
  salaries: TB.salaries,
  wages: TB.wages,
  insurance: TB.insurance,
  advertisement: TB.advertisement,
  electricity: TB.electricity,
  commissionReceived: TB.commission,
  discountReceived: TB.discountReceived,
};
const TB_EXPENSES = [TB.wages, TB.rent, TB.salaries, TB.insurance, TB.advertisement, TB.electricity];
/** The balances a beginner puts in the wrong column. Opening stock, which every trial balance here lists, is one more. */
const TB_TRAPS = [
  TB.salesReturns,
  TB.purchasesReturns,
  TB.discountAllowed,
  TB.discountReceived,
  TB.drawings,
  TB.billsReceivable,
  TB.billsPayable,
  TB.loan,
  TB.commission,
  TB.overdraft,
];
/** Names a student may take one for the other. */
const TB_TWINS: [string, string][] = [
  ['Sales returns', 'Purchases returns'],
  ['Discount allowed', 'Discount received'],
  ['Bills receivable', 'Bills payable'],
];
const SUSPENSE_ROW = 'Suspense A/c';
const TB_COLUMNS = ['Debit (₹)', 'Credit (₹)'];
const inColumn = (side: Side, a: Paise): Paise[] => (side === 'Dr' ? [a, 0] : [0, a]);
const otherSide = (side: Side): Side => (side === 'Dr' ? 'Cr' : 'Dr');

/** One-sided errors that leave wrong an account of its own in the trial balance, not a customer's or a supplier's. */
const CLERK_ERRORS: Maker[] = [...casting, ...notPostedNominal, ...wrongSideNominal, ...wrongAmountNominal];

const clerkSetup = (rng: Rng) =>
  attempt(30, () => {
    const shop = business(rng);
    // The one error in the ledger, and the line of the trial balance it left wrong.
    const error = draw(rng, CLERK_ERRORS, nameSupply(rng), []);
    if (!error) return null;
    const gap = tbNet(error);
    const fixes = wrongLines(error);
    if (gap === 0 || fixes.length !== 1) return null;
    const fix = fixes[0];
    const wrong = TB_OF[fix.accountId];
    if (!wrong || wrong.side !== normalSide(resolveAccount(fix.accountId))) return null;
    // What the rectifying entry does to that balance: a posting on the side of the balance raises it.
    const delta = fix.side === wrong.side ? fix.amount : -fix.amount;
    // One item of the year is well within the year's balance of its account: wages of ₹74,000 in one payment are not
    // found beside wages of ₹60,000 in all.
    const figures = rupeesIn(error.text);
    const item = Math.max(...figures);
    if (wrong.max > 0 && item > (wrong.max * 100) / 2) return null;

    const expense = TB_EXPENSES.includes(wrong) ? wrong : rng.pick(TB_EXPENSES);
    const others = rng.shuffle(TB_TRAPS.filter((a) => a !== wrong)).slice(0, 3);
    const accounts = [...new Set([TB.cash, TB.debtors, TB.openingStock, TB.purchases, TB.sales, TB.creditors, rng.pick([TB.furniture, TB.computers]), expense, wrong, ...others])];

    // The true balances, in round figures. The sales of the year are more than its purchases.
    const right = new Map<TbAccount, Paise>();
    for (const a of accounts) if (a !== TB.sales) right.set(a, amount(rng, a.min, a.max, a.step));
    right.set(TB.sales, right.get(TB.purchases)! + amount(rng, 20000, 120000, 1000));
    // The account the error went through holds more than the one item, both as it should stand and as it stands.
    const least = item + (wrong.min * 100) / 2;
    const short = least - Math.min(right.get(wrong)!, right.get(wrong)! - delta);
    if (short > 0) right.set(wrong, right.get(wrong)! + Math.ceil(short / 100000) * 100000);
    // The expenses of a shop are a modest part of its sales.
    if (right.get(expense)! > right.get(TB.sales)! / 4) return null;
    const trueOf = (a: TbAccount): Paise => right.get(a)!;
    const columnOf = (side: Side): Paise => sumOf(accounts.filter((a) => a.side === side).map(trueOf));
    // Capital is what makes the true balances agree: a believable capital, twice the drawings at least and not less
    // than what the business has borrowed from the bank.
    const capital = columnOf('Dr') - columnOf('Cr');
    const borrowed = (right.get(TB.loan) ?? 0) + (right.get(TB.overdraft) ?? 0);
    if (capital < 10000000 || capital > 150000000 || capital < 2 * (right.get(TB.drawings) ?? 0) || capital < borrowed) return null;
    // Every balance as it stands in the ledger: the true one, but for the account the error left wrong.
    const stands = new Map<TbAccount, Paise>([...right, [TB.capital, capital]]);
    stands.set(wrong, right.get(wrong)! - delta);

    // The clerk's trial balance: three or four of the balances a beginner misplaces stand in the wrong column.
    const traps = [TB.openingStock, ...accounts.filter((a) => TB_TRAPS.includes(a))];
    const misplaced = new Set(rng.shuffle(traps).slice(0, rng.int(3, 4)));
    const lines = rng.shuffle([...accounts, TB.capital]).map((a) => ({ a, amt: stands.get(a)!, clerk: misplaced.has(a) ? otherSide(a.side) : a.side }));
    const sumWhere = (keep: (l: (typeof lines)[number]) => boolean): Paise => sumOf(lines.filter(keep).map((l) => l.amt));
    const debit = sumWhere((l) => l.a.side === 'Dr');
    const credit = sumWhere((l) => l.a.side === 'Cr');
    const total = columnOf('Dr');
    const redrafted = Math.max(debit, credit);
    // The redrafted columns differ by what the error did, and the entry that closes Suspense A/c brings them to the true total.
    if (debit - credit !== gap || total !== (delta < 0 ? redrafted - Math.abs(gap) : redrafted)) return null;
    // A balance of the same amount as the difference, or as a figure of the error, would look like its cause, and two
    // equal balances like a slip.
    if (lines.some((l) => l.amt === Math.abs(gap) || figures.includes(l.amt)) || new Set(lines.map((l) => l.amt)).size < lines.length) return null;
    return { shop, error, gap, fix, wrong, delta, lines, debit, credit, redrafted, total };
  });
type ClerkScenario = NonNullable<ReturnType<typeof clerkSetup>>;

// The second reading of the printed trial balance, used only by `verify`: which names are debit balances and which
// credit balances, written out here and not taken from the accounts above.
const DEBIT_NAMES = new Set([
  'Cash in hand',
  'Sundry debtors',
  'Furniture',
  'Computers',
  'Bills receivable',
  'Opening stock',
  'Purchases',
  'Sales returns',
  'Wages',
  'Rent paid',
  'Salaries',
  'Insurance premium',
  'Advertisement charges',
  'Electricity charges',
  'Discount allowed',
  'Drawings',
]);
const CREDIT_NAMES = new Set(['Capital', 'Sales', 'Purchases returns', 'Sundry creditors', 'Bank loan', 'Bills payable', 'Discount received', 'Commission received', 'Bank overdraft']);

interface ClerkRead {
  list: { name: string; amt: number; clerk: Side; side: Side }[];
  /** The two columns once every balance stands where it belongs, before Suspense A/c. */
  debit: number;
  credit: number;
  /** The one error the case gives, as its sentence is read again. */
  r: Read;
}
/** The clerk's trial balance and the error, read from the printed case; null unless every line is understood. */
function readClerk(text: string | undefined): ClerkRead | null {
  const list: ClerkRead['list'] = [];
  for (const line of (text ?? '').split('\n')) {
    const m = /^(.+): (₹[\d,]+) \((Dr|Cr)\)$/.exec(line);
    if (!m) continue;
    const amt = parseRupees(m[2]);
    if (amt === null || DEBIT_NAMES.has(m[1]) === CREDIT_NAMES.has(m[1])) return null;
    list.push({ name: m[1], amt, clerk: m[3] as Side, side: DEBIT_NAMES.has(m[1]) ? 'Dr' : 'Cr' });
  }
  const sum = (side: Side): number => sumOf(list.filter((l) => l.side === side).map((l) => l.amt));
  const errors = errorsIn(text);
  if (!errors || errors.length !== 1 || list.length < 10 || new Set(list.map((l) => l.name)).size < list.length) return null;
  return { list, debit: sum('Dr'), credit: sum('Cr'), r: errors[0].r };
}

const chainRedraftedTrialBalance = caseTemplate<ClerkScenario>({
  id: 'case-roe-chain-redrafted-trial-balance',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: "A clerk's trial balance, redrafted",
  setup: clerkSetup,
  context: (s) =>
    [
      `${s.shop.intro} A new clerk drew up this trial balance on ${YEAR_END} (the clerk's column in brackets):`,
      ...s.lines.map((l) => `${l.a.name}: ${f(l.amt)} (${l.clerk})`),
      'Every amount is as the ledger shows it, but some balances stand in the wrong column.',
      'The difference left after redrafting is put to a Suspense A/c. Then this error is found; there is no other:',
      `${tag(0)} ${s.error.text}`,
    ].join('\n'),
  parts: [
    {
      kind: 'statement',
      make: (s) => {
        const short: Side = s.gap > 0 ? 'Cr' : 'Dr';
        const by = f(Math.abs(s.gap));
        const rows = [...s.lines.map((l) => ({ label: l.a.name, amounts: inColumn(l.a.side, l.amt) })), { label: SUSPENSE_ROW, amounts: inColumn(short, Math.abs(s.gap)) }];
        const used = new Set(rows.map((r) => r.label));
        const twins = TB_TWINS.flatMap(([a, b]) => (used.has(a) !== used.has(b) ? [used.has(a) ? b : a] : []));
        const column = (side: Side): string => {
          const mine = s.lines.filter((l) => l.a.side === side);
          return `${cap(sideName(side))} column: ${mine.map((l) => `${l.a.name} ${f(l.amt)}`).join(' + ')} = ${f(side === 'Dr' ? s.debit : s.credit)}.`;
        };
        return {
          task: `Redraft the Trial Balance of ${s.shop.owner} as on ${YEAR_END} with every balance in its right column, and enter the difference that remains as "${SUSPENSE_ROW}".`,
          title: `Trial Balance of ${s.shop.owner} as on ${YEAR_END}`,
          heading: 'Name of account',
          columns: TB_COLUMNS,
          totalsAgree: true,
          rows,
          // Closing stock is not a ledger balance, and no bank balance is listed; the other names are those a student
          // takes for one in the list.
          distractors: ['Closing stock', 'Cash at bank', ...twins],
          explanation: [
            'Assets, expenses, losses and drawings are debit balances; capital, liabilities, incomes and gains are credit balances. Returns stand on the side opposite to the account they reduce.',
            ...s.lines.filter((l) => l.clerk !== l.a.side).map((l) => `${l.a.name}: ${l.a.is}, so a ${sideName(l.a.side)} balance. The clerk had it in the ${sideName(l.clerk)} column.`),
            column('Dr'),
            column('Cr'),
            `The ${sideName(otherSide(short))} column is larger by ${by}, so the ${sideName(short)} column is short. ${SUSPENSE_ROW} is entered in the ${sideName(short)} column with ${by}, and both columns total ${f(s.redrafted)}.`,
            `The difference is the work of error ${tag(0)}, which is still in the ledger: taken alone it leaves the ${sideName(otherSide(short))} total ${by} more than the ${sideName(short)} total.`,
          ],
          hints: [
            'Decide what each balance is before you place it: an asset, an expense, a liability, capital or an income.',
            'Assets, expenses, losses and drawings are debit balances; capital, liabilities, incomes and gains are credit balances; returns stand opposite to the account they reduce. Then total the two columns and enter the difference in the shorter one as Suspense A/c.',
          ],
        };
      },
      // From the printed trial balance alone: each balance in the column its name calls for, at least three of them moved
      // from where the clerk had them, and Suspense A/c for the difference, which is what the error is read to have done.
      verify: (q: StatementQuestion) => {
        const c = readClerk(q.data);
        if (!c || q.rows.length !== c.list.length + 1) return false;
        const gap = c.debit - c.credit;
        if (gap === 0 || gap !== c.r.tb || c.list.filter((l) => l.clerk !== l.side).length < 3) return false;
        const has = (label: string, side: Side, amt: number) => q.rows.filter((r) => r.label === label && r.amounts.join() === inColumn(side, amt).join()).length === 1;
        return c.list.every((l) => has(l.name, l.side, l.amt)) && has(SUSPENSE_ROW, gap > 0 ? 'Cr' : 'Dr', Math.abs(gap));
      },
    },
    { kind: 'journal', make: (s) => entryParts(s.error, 0, '', ', the entry that closes the Suspense A/c'), verify: verifyEntry },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const by = Math.abs(s.gap);
        const short: Side = s.gap > 0 ? 'Cr' : 'Dr';
        const tooHigh = s.delta < 0;
        const stood = s.lines.find((l) => l.a === s.wrong)!.amt;
        return typed(
          `Error ${tag(0)} has been rectified and the Suspense A/c is closed. What does each column of the trial balance now add up to?`,
          s.total,
          [
            tooHigh
              ? { value: s.redrafted, why: 'Kept the total of the redrafted trial balance. The entry brings down a balance that was too high and takes Suspense A/c out of the other column, so both columns fall by the amount.' }
              : { value: s.redrafted - by, why: 'Gave the shorter column as it stood before Suspense A/c was entered. The entry raises the balance in it that was too low, up to the total of the other column.' },
            { value: s.redrafted + by, why: 'Added the amount of the correction to the total of the redrafted trial balance. Nothing raises a column above that total: Suspense A/c goes out as the wrong balance is put right.' },
            { value: s.total - by, why: 'Took the amount of the correction out once too often: only a balance that was too high comes down, and Suspense A/c goes out of the other column with it.' },
            // A posting on the wrong side left the balance too low by twice the item: corrected once, the column is short.
            ...(s.error.group === 'wrongSide' ? [{ value: s.redrafted - by / 2, why: ONCE_WHY }] : []),
          ],
          [
            `The redrafted trial balance totals ${f(s.redrafted)} in each column, with ${SUSPENSE_ROW} ${f(by)} in the ${sideName(short)} column.`,
            `The entry ${s.fix.side === 'Dr' ? 'debits' : 'credits'} ${accountName(s.fix.accountId)} with ${f(by)}: ${s.wrong.name}, a ${sideName(s.wrong.side)} balance, ${tooHigh ? 'falls' : 'rises'} from ${f(stood)} to ${f(stood + s.delta)}.`,
            tooHigh
              ? `The same entry closes ${SUSPENSE_ROW}, which goes out of the ${sideName(short)} column. Each column falls by ${f(by)}: ${f(s.redrafted)} - ${f(by)} = ${f(s.total)}.`
              : `The same entry closes ${SUSPENSE_ROW}, which goes out of the ${sideName(short)} column, the column ${s.wrong.name} stands in: that column still adds up to ${f(s.redrafted)}, and the ${sideName(otherSide(short))} column is not touched.`,
            `Each column of the trial balance now adds up to ${f(s.total)}, and no Suspense A/c is left.`,
          ],
        );
      },
      // By another route: the column the wrong account does not stand in was right all along, and is the total.
      verify: (q: NumericQuestion) => {
        const c = readClerk(q.context);
        return !!c && c.r.col !== null && c.r.tb !== 0 && q.answer === (c.r.col === 'Dr' ? c.credit : c.debit);
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Chain 4 (medium): the trial balance agreed; the entries, then the correct profit
// ---------------------------------------------------------------------------------------------------------------

const chainProfit = caseTemplate({
  id: 'case-roe-chain-profit',
  version: 2,
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Rectifying entries and the correct profit',
  setup: (rng) =>
    attempt(12, () => {
      const shop = business(rng);
      // Errors a trial balance that agrees does not show: three that reach the profit, one or two that do not.
      const list = errorList(rng, [
        ...rng.shuffle([principleSimple, omittedProfit, rng.pick([wrongBook, principleCompound, principleSimple, omittedProfit])]),
        ...rng.shuffle([wrongAccount, omittedNoProfit]).slice(0, rng.pick([1, 1, 2])),
      ]);
      if (!list || list.gaps.some((g) => g !== 0)) return null;
      const effects = list.errors.map(profitEffect);
      const over = sumOf(effects.filter((e) => e > 0));
      const under = -sumOf(effects.filter((e) => e < 0));
      const shown = amount(rng, 250000, 800000, 5000);
      // The errors pull the profit both ways, do not cancel, and leave a profit.
      if (over === 0 || under === 0 || over === under || shown - over + under < 10000000) return null;
      return { shop, ...list, effects, over, under, shown };
    }),
  context: (s) =>
    [
      `${s.shop.intro} The trial balance on ${YEAR_END} agreed.`,
      `The books show a net profit of ${f(s.shown)} for the year.`,
      'These errors were then found; there are no others. The profit is to be corrected for these errors only.',
      ...listed(s.errors),
      ...notes(s.errors),
    ].join('\n'),
  parts: [
    { kind: 'journal_set', make: (s) => rectifyingSet(s, false), verify: setRectifies('none') },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const all = s.errors.map((_, i) => i);
        const overs = all.filter((i) => s.effects[i] > 0);
        const unders = all.filter((i) => s.effects[i] < 0);
        // An item in the wrong book leaves two trading accounts wrong, each by its amount, the same way.
        const doubled = all.filter((i) => s.errors[i].group === 'wrongBook');
        return correctedProfit(
          'What is the correct net profit for the year?',
          s.shown,
          s.over,
          s.under,
          [
            ...doubled.map((i) => ({
              value: s.shown - (s.over - s.under) + s.effects[i] / 2,
              why: `Counted error ${tag(i)} once. It left two accounts wrong, each by the amount and both the same way for the profit, so the profit is out by twice the amount.`,
            })),
            { value: s.shown, why: 'Left the profit as the books show it, because the trial balance agreed; errors that leave the totals equal can still change an income or an expense.' },
          ],
          [
            `Profit shown by the books: ${f(s.shown)}. It is overstated when an expense is too low or an income too high, and understated in the opposite case.`,
            ...s.errors.map((e, i) =>
              s.effects[i] === 0 ? `${tag(i)} No effect: ${unchangedBecause(e)}.` : `${tag(i)} ${cap(profitReason(e))}: profit ${s.effects[i] > 0 ? 'overstated' : 'understated'} by ${f(Math.abs(s.effects[i]))}.`,
            ),
            `Less the overstatement, ${named(overs)}: ${f(s.over)}.`,
            `Add the understatement, ${named(unders)}: ${f(s.under)}.`,
            `Correct net profit = ${f(s.shown)} - ${f(s.over)} + ${f(s.under)} = ${f(s.shown - s.over + s.under)}.`,
          ],
        );
      },
      // The profit printed in the case, less what each error is read to have added to it.
      verify: (q: NumericQuestion) => {
        const all = errorsIn(q.context);
        const shown = figureAfter(q, 'net profit of');
        if (!all || shown === null || all.length < 3 || all.some((l) => l.r.tb !== 0)) return false;
        return q.answer === shown - sumOf(all.map((l) => l.r.profit));
      },
    },
  ],
});

const cases: CaseTemplate[] = [
  oneSidedCase,
  twoSidedCase,
  mixedCase,
  beforeAfterCase,
  dayBookCase,
  profitCase,
  chainEntriesAndSuspense,
  chainFindDifference,
  chainRedraftedTrialBalance,
  chainProfit,
];

export default cases;
