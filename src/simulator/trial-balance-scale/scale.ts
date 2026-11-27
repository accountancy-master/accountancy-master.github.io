// ---------------------------------------------------------------------------------------------------------------
// The lab "trial-balance-scale": the trial balance as a scale, the debit balances on one pan and the credit balances
// on the other. An error is a card dropped on it: some tip the scale (the trial balance does not agree), some do not.
// A Suspense weight on the lighter pan levels a tipped scale, and the rectifying entry puts the weights right and
// takes Suspense away.
//
// Every error is written as what was posted (`done`) and what should have been posted (`should`), as in the topic's
// generators, so that its effect, its Suspense and its rectifying entry all follow from those two lists.
//
// Conventions (NCERT Class 11, CBSE 2025-26):
//  - the trial balance is prepared by the balance method; the difference of its columns goes to Suspense A/c on the
//    side that is short;
//  - an error that leaves one account wrong (one-sided) makes the columns differ; found BEFORE the trial balance is
//    prepared it is corrected in that account itself, with no journal entry and no Suspense A/c; found AFTER, it is
//    rectified by a journal entry whose other side is Suspense A/c;
//  - an error that leaves two accounts wrong by amounts that cancel (two-sided) does not disturb the agreement; it is
//    rectified by a journal entry between the accounts concerned, before or after, never through Suspense A/c.
// ---------------------------------------------------------------------------------------------------------------

import { creditor, debtor, resolveAccount, type Side } from '@/engine/accounts';
import type { JournalLine } from '@/engine/journal';
import { formatINR, type Paise } from '@/engine/money';
import { createRng, type Rng } from '@/engine/rng';

export const TB_DATE = '31 March 2026';
export const rupees = (n: number): Paise => n * 100;
const f = formatINR;

export interface ScaleBooks {
  business: string;
  /** The balances of the trial balance as it should be (it agrees). */
  balances: { accountId: string; side: Side; amount: Paise }[];
  /** The two debtors and the creditor the errors name. */
  debtors: [string, string];
  creditor: string;
}

const dr = (accountId: string, amount: Paise): JournalLine => ({ accountId, side: 'Dr', amount });
const cr = (accountId: string, amount: Paise): JournalLine => ({ accountId, side: 'Cr', amount });

export const title = (accountId: string): string => `${resolveAccount(accountId).name} A/c`;
/** The possessive of a party's name: "Mohan's", "Jain Brothers'", "Rao & Co.'s". */
const their = (name: string): string => (name.endsWith('s') ? `${name}'` : `${name}'s`);

function booksOf(business: string, debtors: [string, string], cred: string, d: [number, number, number, number, number, number], c: [number, number, number]): ScaleBooks {
  const [cash, furniture, purchases, rent, d1, d2] = d.map(rupees);
  const [capital, sales, owed] = c.map(rupees);
  return {
    business,
    debtors,
    creditor: cred,
    balances: [
      { accountId: 'cash', side: 'Dr', amount: cash },
      { accountId: 'furniture', side: 'Dr', amount: furniture },
      { accountId: 'purchases', side: 'Dr', amount: purchases },
      { accountId: 'rent', side: 'Dr', amount: rent },
      { accountId: debtor(debtors[0]), side: 'Dr', amount: d1 },
      { accountId: debtor(debtors[1]), side: 'Dr', amount: d2 },
      { accountId: 'capital', side: 'Cr', amount: capital },
      { accountId: 'sales', side: 'Cr', amount: sales },
      { accountId: creditor(cred), side: 'Cr', amount: owed },
    ],
  };
}

/** The books of the walk-through: Kiran Traders, whose trial balance agrees at ₹2,80,000. */
export const KIRAN: ScaleBooks = booksOf('Kiran Traders', ['Mohan', 'Priya'], 'Rao & Co.', [40000, 60000, 120000, 18000, 25000, 17000], [150000, 110000, 20000]);

const NAMES = ['Mohan', 'Priya', 'Ravi', 'Sunita', 'Imran', 'Deepa'];
const FIRMS = ['Kiran Traders', 'Asha Stationers', 'Meera Electricals', 'Farhan Book House'];
const CREDITORS = ['Rao & Co.', 'Jain Brothers', 'Bharat Suppliers'];

/** Books for a seed, always a trial balance that agrees with every balance on its usual side. */
export function booksFromSeed(seed: number): ScaleBooks {
  for (let i = 0; ; i++) {
    const rng = createRng(seed * 104729 + i);
    const names = rng.shuffle(NAMES);
    const d: [number, number, number, number, number, number] = [
      rng.step(20000, 60000, 1000),
      rng.step(30000, 90000, 5000),
      rng.step(80000, 160000, 5000),
      rng.step(9000, 24000, 1000),
      rng.step(15000, 40000, 1000),
      rng.step(10000, 30000, 1000),
    ];
    const sales = rng.step(80000, 150000, 5000);
    const owed = rng.step(10000, 40000, 1000);
    const capital = d.reduce((s, x) => s + x, 0) - sales - owed;
    if (capital >= 50000 || i > 100) return booksOf(rng.pick(FIRMS), [names[0], names[1]], rng.pick(CREDITORS), d, [Math.max(capital, 1000), sales, owed]);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The error cards.
// ---------------------------------------------------------------------------------------------------------------

export type ErrorClass = 'omission' | 'commission' | 'principle' | 'compensating';

export type ErrorId = 'complete-omission' | 'partial-omission' | 'wrong-account' | 'wrong-amount' | 'wrong-side' | 'wrong-carry' | 'principle' | 'compensating';

export interface ErrorInput {
  /** The amount of the transaction (or of the overcasting). */
  amount: Paise;
  /** The wrong figure, for an error of a wrong amount or a wrong total carried forward. */
  wrongAs?: Paise;
}

export interface ErrorCase {
  id: ErrorId;
  cls: ErrorClass;
  /** On the card: "Partial omission". */
  title: string;
  /** What went wrong, in a sentence. */
  text: string;
  done: JournalLine[];
  should: JournalLine[];
  /** The narration of the rectifying entry, after "Being". */
  narration: string;
  /** For a one-sided error: why the account itself is corrected by that amount, after the instruction. */
  beforeWhy: string | null;
}

export interface ErrorSpec {
  id: ErrorId;
  title: string;
  cls: ErrorClass;
  /** The second figure it needs: the wrong amount posted, or the wrong total carried forward. */
  wrongAsLabel?: string;
  /** The amount's label in the sandbox. */
  amountLabel: string;
  make(books: ScaleBooks, input: ErrorInput): ErrorCase;
  /** Figures for the seed that suit the books. */
  sample(rng: Rng, books: ScaleBooks): ErrorInput;
}

const swapDigits = (rng: Rng, base: number): [Paise, Paise] => {
  let a = 0;
  let b = 0;
  while (a === b) {
    a = rng.int(1, 9);
    b = rng.int(1, 9);
  }
  return [rupees(base + (10 * a + b) * 100), rupees(base + (10 * b + a) * 100)];
};

export const ERRORS: readonly ErrorSpec[] = [
  {
    id: 'complete-omission',
    title: 'Complete omission',
    cls: 'omission',
    amountLabel: 'Credit sale (₹)',
    make: (b, { amount }) => ({
      id: 'complete-omission',
      cls: 'omission',
      title: 'Complete omission',
      text: `A credit sale of ${f(amount)} to ${b.debtors[0]} was not recorded in the books at all.`,
      done: [],
      should: [dr(debtor(b.debtors[0]), amount), cr('sales', amount)],
      narration: `credit sale to ${b.debtors[0]} omitted from the books, now recorded`,
      beforeWhy: null,
    }),
    sample: (rng) => ({ amount: rupees(rng.step(3000, 12000, 500)) }),
  },
  {
    id: 'partial-omission',
    title: 'Partial omission',
    cls: 'omission',
    amountLabel: 'Credit sale (₹)',
    make: (b, { amount }) => ({
      id: 'partial-omission',
      cls: 'omission',
      title: 'Partial omission',
      text: `A credit sale of ${f(amount)} to ${b.debtors[0]} was entered in the Sales Book but not posted to ${their(b.debtors[0])} account.`,
      done: [cr('sales', amount)],
      should: [dr(debtor(b.debtors[0]), amount), cr('sales', amount)],
      narration: `credit sale to ${b.debtors[0]} not posted to ${their(b.debtors[0])} account, now rectified`,
      beforeWhy: `the posting that was left out ("To Sales A/c ${f(amount)}")`,
    }),
    sample: (rng) => ({ amount: rupees(rng.step(3000, 12000, 500)) }),
  },
  {
    id: 'wrong-account',
    title: 'Wrong account',
    cls: 'commission',
    amountLabel: 'Cash received (₹)',
    make: (b, { amount }) => ({
      id: 'wrong-account',
      cls: 'commission',
      title: 'Wrong account',
      text: `${f(amount)} received in cash from ${b.debtors[0]} was credited to ${their(b.debtors[1])} account.`,
      done: [dr('cash', amount), cr(debtor(b.debtors[1]), amount)],
      should: [dr('cash', amount), cr(debtor(b.debtors[0]), amount)],
      narration: `cash received from ${b.debtors[0]} wrongly credited to ${their(b.debtors[1])} account, now rectified`,
      beforeWhy: null,
    }),
    sample: (rng) => ({ amount: rupees(rng.step(2000, 8000, 500)) }),
  },
  {
    id: 'wrong-amount',
    title: 'Wrong amount in one account',
    cls: 'commission',
    amountLabel: 'Credit purchase (₹)',
    wrongAsLabel: 'Posted to the supplier as (₹)',
    make: (b, { amount, wrongAs = amount }) => ({
      id: 'wrong-amount',
      cls: 'commission',
      title: 'Wrong amount in one account',
      text: `A credit purchase of ${f(amount)} from ${b.creditor} was entered correctly in the Purchases Book but posted to ${their(b.creditor)} account as ${f(wrongAs)}.`,
      done: [dr('purchases', amount), cr(creditor(b.creditor), wrongAs)],
      should: [dr('purchases', amount), cr(creditor(b.creditor), amount)],
      narration: `credit purchase from ${b.creditor} posted to its account as ${f(wrongAs)} instead of ${f(amount)}, now rectified`,
      beforeWhy: wrongAs < amount ? 'the amount by which the posting fell short' : 'the amount posted in excess',
    }),
    sample: (rng) => {
      const [amount, wrongAs] = swapDigits(rng, 0);
      return { amount, wrongAs };
    },
  },
  {
    id: 'wrong-side',
    title: 'Wrong side',
    cls: 'commission',
    amountLabel: 'Cash received (₹)',
    make: (b, { amount }) => ({
      id: 'wrong-side',
      cls: 'commission',
      title: 'Wrong side',
      text: `${f(amount)} received in cash from ${b.debtors[1]} was posted to the debit side of ${their(b.debtors[1])} account.`,
      done: [dr('cash', amount), dr(debtor(b.debtors[1]), amount)],
      should: [dr('cash', amount), cr(debtor(b.debtors[1]), amount)],
      narration: `cash received from ${b.debtors[1]} wrongly posted to the debit of ${their(b.debtors[1])} account, now rectified`,
      beforeWhy: `${f(amount)} to cancel the wrong debit and ${f(amount)} for the credit that was due`,
    }),
    sample: (rng) => ({ amount: rupees(rng.step(1000, 5000, 500)) }),
  },
  {
    id: 'wrong-carry',
    title: 'Wrong total carried forward',
    cls: 'commission',
    amountLabel: 'Page total (₹)',
    wrongAsLabel: 'Carried forward as (₹)',
    make: (_b, { amount, wrongAs = amount }) => ({
      id: 'wrong-carry',
      cls: 'commission',
      title: 'Wrong total carried forward',
      text: `The total of a page of the Purchases Book, ${f(amount)}, was carried forward to the next page as ${f(wrongAs)}, and the wrong total was posted to Purchases A/c.`,
      done: [dr('purchases', wrongAs)],
      should: [dr('purchases', amount)],
      narration: `total of a page of the Purchases Book carried forward as ${f(wrongAs)} instead of ${f(amount)}, now rectified`,
      beforeWhy: wrongAs < amount ? 'the amount by which the total was carried forward short' : 'the amount by which the total was carried forward in excess',
    }),
    sample: (rng) => {
      const [amount, wrongAs] = swapDigits(rng, 30000);
      return { amount, wrongAs };
    },
  },
  {
    id: 'principle',
    title: 'Error of principle',
    cls: 'principle',
    amountLabel: 'Furniture bought (₹)',
    make: (_b, { amount }) => ({
      id: 'principle',
      cls: 'principle',
      title: 'Error of principle',
      text: `Furniture bought for ${f(amount)} in cash was debited to Purchases A/c.`,
      done: [dr('purchases', amount), cr('cash', amount)],
      should: [dr('furniture', amount), cr('cash', amount)],
      narration: 'purchase of furniture wrongly debited to Purchases A/c, now rectified',
      beforeWhy: null,
    }),
    sample: (rng) => ({ amount: rupees(rng.step(5000, 15000, 1000)) }),
  },
  {
    id: 'compensating',
    title: 'Compensating errors',
    cls: 'compensating',
    amountLabel: 'Overcast by (₹)',
    make: (_b, { amount }) => ({
      id: 'compensating',
      cls: 'compensating',
      title: 'Compensating errors',
      text: `Sales A/c was overcast by ${f(amount)}, and Rent A/c was also overcast by ${f(amount)}.`,
      // An overcast is an excess on the side of the account's balance.
      done: [dr('rent', amount), cr('sales', amount)],
      should: [],
      narration: 'overcasting of Sales A/c and of Rent A/c, which compensated each other, now rectified',
      beforeWhy: null,
    }),
    sample: (rng) => ({ amount: rupees(rng.step(500, 3000, 500)) }),
  },
];

export const findError = (id: string): ErrorSpec | undefined => ERRORS.find((e) => e.id === id);

// ---------------------------------------------------------------------------------------------------------------
// What an error does.
// ---------------------------------------------------------------------------------------------------------------

const signed = (l: JournalLine): number => (l.side === 'Dr' ? l.amount : -l.amount);
const sumOf = (ls: readonly JournalLine[]): number => ls.reduce((s, l) => s + signed(l), 0);

/** Debit total less credit total of the trial balance, caused by the error: positive when the debit pan is heavier. */
export const gapOf = (e: ErrorCase): Paise => sumOf(e.done) - sumOf(e.should);

/** One-sided: the columns differ. */
export const isOneSided = (e: ErrorCase): boolean => gapOf(e) !== 0;

/** The Suspense A/c that levels the trial balance: on the shorter side, for the difference. */
export function suspenseOf(e: ErrorCase): { side: Side; amount: Paise } | null {
  const g = gapOf(e);
  return g === 0 ? null : { side: g > 0 ? 'Cr' : 'Dr', amount: Math.abs(g) };
}

/** The balances (debits positive) with the error in them. */
export function balancesWith(books: ScaleBooks, e: ErrorCase | null): Map<string, Paise> {
  const net = new Map<string, Paise>(books.balances.map((b) => [b.accountId, b.side === 'Dr' ? b.amount : -b.amount]));
  if (e) {
    for (const l of e.done) net.set(l.accountId, (net.get(l.accountId) ?? 0) + signed(l));
    for (const l of e.should) net.set(l.accountId, (net.get(l.accountId) ?? 0) - signed(l));
  }
  return net;
}

/** Why the figures do not suit these books, or null. */
export function problemOf(books: ScaleBooks, e: ErrorCase, input: ErrorInput): string | null {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) return 'Give an amount above nil.';
  if (input.wrongAs !== undefined && (!Number.isSafeInteger(input.wrongAs) || input.wrongAs <= 0)) return 'Give the wrong figure, above nil.';
  if (input.wrongAs !== undefined && input.wrongAs === input.amount) return 'The two figures are the same, so there is no error. Change one of them.';
  const before = balancesWith(books, null);
  const after = balancesWith(books, e);
  for (const [id, v] of after) {
    const was = before.get(id) ?? 0;
    if (Math.sign(v) !== Math.sign(was) || v === 0) return `That is too large for these books: ${title(id)} stands at only ${f(Math.abs(was))}.`;
  }
  return null;
}

/** The rectifying entry: undo what is wrong, post what is right, and let Suspense A/c take any difference. */
export function rectifyingEntry(e: ErrorCase): JournalLine[] {
  const net = new Map<string, number>();
  for (const l of e.should) net.set(l.accountId, (net.get(l.accountId) ?? 0) + signed(l));
  for (const l of e.done) net.set(l.accountId, (net.get(l.accountId) ?? 0) - signed(l));
  const lines: JournalLine[] = [];
  for (const [accountId, v] of net) if (v !== 0) lines.push({ accountId, side: v > 0 ? 'Dr' : 'Cr', amount: Math.abs(v) });
  const s = suspenseOf(e);
  // Suspense stood on one side of the trial balance; the entry puts it on the other, which clears it.
  if (s) lines.push({ accountId: 'suspense', side: s.side === 'Dr' ? 'Cr' : 'Dr', amount: s.amount });
  return [...lines.filter((l) => l.side === 'Dr'), ...lines.filter((l) => l.side === 'Cr')];
}

export interface BeforeCorrection {
  /** No journal entry: the account (or each account) itself is corrected. */
  inAccount: true;
  /** The accounts corrected. */
  accountIds: string[];
  /** Why no entry is passed: "Only one account is wrong and there is no Suspense A/c yet, so ...". */
  intro: string;
  /** "Debit Mohan A/c with ₹8,000: the posting that was left out (...)." */
  words: string;
}

/**
 * How the error is put right when it is found before the trial balance is prepared, in the account itself with no
 * journal entry: a one-sided error, and each of two compensating errors of casting (each is a wrong total in one
 * account). Any other two-sided error is put right by the same journal entry as afterwards (`null` here).
 */
export function beforeCorrection(e: ErrorCase): BeforeCorrection | null {
  if (e.cls === 'compensating') {
    const each = e.done.map((l) => `the total of the ${sideName(l.side)} side of ${title(l.accountId)} (${f(l.amount)} too much)`);
    return {
      inAccount: true,
      accountIds: e.done.map((l) => l.accountId),
      intro: 'Each of the two errors is a wrong total in one account and there is no Suspense A/c yet, so each account is corrected in itself:',
      words: `Correct ${each.join(' and ')}.`,
    };
  }
  if (!isOneSided(e)) return null;
  const line = rectifyingEntry(e).find((l) => l.accountId !== 'suspense')!;
  const verb = line.side === 'Dr' ? 'Debit' : 'Credit';
  return {
    inAccount: true,
    accountIds: [line.accountId],
    intro: 'Only one account is wrong and there is no Suspense A/c yet, so the account itself is corrected:',
    words: `${verb} ${title(line.accountId)} with ${f(line.amount)}: ${e.beforeWhy}.`,
  };
}

/** Why a two-sided error is put right by a journal entry, found before or after: in words, ending in a colon. */
export function entryIntro(e: ErrorCase, when: When): string {
  if (e.done.length === 0) return 'The transaction was left out of the books altogether, so the entry that was left out is passed now:';
  if (e.cls === 'compensating') return 'The trial balance agreed and there is no Suspense A/c. Corrected one by one, the two errors make one entry between the two accounts:';
  return when === 'before' ? 'Two accounts are wrong, so a journal entry between them puts it right:' : 'The trial balance agreed and there is no Suspense A/c, so the entry is between the two accounts:';
}

// ---------------------------------------------------------------------------------------------------------------
// The scale, frame by frame.
// ---------------------------------------------------------------------------------------------------------------

export type When = 'before' | 'after';
export type Tilt = 'level' | 'Dr' | 'Cr';

export interface Weight {
  accountId: string;
  title: string;
  side: Side;
  amount: Paise;
  /** The change since the frame before. */
  delta: Paise;
}

export interface Frame {
  /** "The error", "The trial balance". */
  label: string;
  text: string;
  /** The weights of each pan, in the order of the books. */
  weights: Weight[];
  suspense: { side: Side; amount: Paise } | null;
  /** The totals of the pans, Suspense included. */
  debit: Paise;
  credit: Paise;
  /** Which pan is heavier, or level. */
  tilt: Tilt;
}

const sideName = (s: Side) => (s === 'Dr' ? 'debit' : 'credit');

function frameOf(books: ScaleBooks, e: ErrorCase | null, suspense: Frame['suspense'], prev: Frame | null, label: string, text: string): Frame {
  const net = balancesWith(books, e);
  const weights = books.balances.map((b) => {
    const v = net.get(b.accountId)!;
    const amount = Math.abs(v);
    const was = prev?.weights.find((w) => w.accountId === b.accountId)?.amount ?? amount;
    return { accountId: b.accountId, title: title(b.accountId), side: b.side, amount, delta: amount - was };
  });
  const sum = (s: Side) => weights.filter((w) => w.side === s).reduce((t, w) => t + w.amount, 0) + (suspense?.side === s ? suspense.amount : 0);
  const debit = sum('Dr');
  const credit = sum('Cr');
  return { label, text, weights, suspense, debit, credit, tilt: debit === credit ? 'level' : debit > credit ? 'Dr' : 'Cr' };
}

/** "Mohan A/c ₹8,000 less", for every weight the error moved. */
function movedWords(fr: Frame): string {
  return fr.weights
    .filter((w) => w.delta !== 0)
    .map((w) => `${w.title} ${f(Math.abs(w.delta))} ${w.delta > 0 ? 'more' : 'less'} (${sideName(w.side)} pan)`)
    .join(', ');
}

export const entryText = (ls: readonly JournalLine[]): string => ls.map((l) => (l.side === 'Dr' ? `${title(l.accountId)} Dr ${f(l.amount)}` : `To ${title(l.accountId)} ${f(l.amount)}`)).join('; ');

/** The frames of one error, found before or after the trial balance: as it should be, then three steps. */
export function framesOf(books: ScaleBooks, e: ErrorCase, when: When): Frame[] {
  const start = frameOf(books, null, null, null, 'As it should be', '');
  start.text = `The trial balance of ${books.business} as it should be: Debit ${f(start.debit)} = Credit ${f(start.credit)}. The scale is level.`;
  const s = suspenseOf(e);
  const g = gapOf(e);
  const err = frameOf(books, e, null, start, 'The error', '');
  err.text =
    `${e.text} ${movedWords(err)}. ` +
    (g === 0
      ? `The pans still weigh the same (Debit ${f(err.debit)}, Credit ${f(err.credit)}), so the scale stays level: this error does not disturb the agreement of the trial balance.`
      : `The ${sideName(g > 0 ? 'Dr' : 'Cr')} pan is now heavier by ${f(Math.abs(g))} (Debit ${f(err.debit)}, Credit ${f(err.credit)}): the scale tips.`);
  const entry = rectifyingEntry(e);
  if (when === 'after') {
    const tb = frameOf(books, e, s, err, 'The trial balance', '');
    tb.text = s
      ? `The trial balance is prepared and does not agree. The ${sideName(s.side)} column is short by ${f(s.amount)}, so Suspense A/c ${f(s.amount)} is written in the ${sideName(s.side)} column. The scale is level again, but only because Suspense stands in for the error.`
      : `The trial balance is prepared and agrees at ${f(tb.debit)}, so no Suspense A/c is opened. Agreement does not prove the books are free of errors.`;
    const done = frameOf(books, null, null, tb, 'Rectified', '');
    done.text = s
      ? `The error is found and rectified: ${entryText(entry)}. ${movedWords(done)}, and Suspense A/c, ${s.side === 'Dr' ? 'credited' : 'debited'} ${f(s.amount)}, is cleared: it leaves the pan.`
      : `The error is found and rectified by an entry between the accounts concerned, with no Suspense A/c: ${entryText(entry)}. ${movedWords(done)}; the scale stays level.`;
    return [start, err, tb, done];
  }
  const b = beforeCorrection(e);
  const fixed = frameOf(books, null, null, err, 'Corrected', '');
  fixed.text = !b
    ? `Found before the trial balance is prepared. ${entryIntro(e, 'before').replace(/:$/, '')}: ${entryText(entry)}. ${movedWords(fixed)}.`
    : e.cls === 'compensating'
      ? `Found before the trial balance is prepared, so there is no Suspense A/c and no journal entry. Each error is a wrong total in one account, and each account is corrected in itself: ${b.words} ${movedWords(fixed)}; the scale stays level.`
      : `Found before the trial balance is prepared, so there is no Suspense A/c. Only one account is wrong, and it is corrected in the account itself, with no journal entry: ${b.words} The scale is level again.`;
  const tb = frameOf(books, null, null, fixed, 'The trial balance', '');
  tb.text = `The trial balance is now prepared and agrees at ${f(tb.debit)}. No Suspense A/c is needed, because the error was put right first.`;
  return [start, err, fixed, tb];
}

/** The figures each card is played with in the walk-through, on the books of Kiran Traders. */
export const WATCH_INPUTS: Record<ErrorId, ErrorInput> = {
  'partial-omission': { amount: rupees(8000) },
  'wrong-amount': { amount: rupees(7200), wrongAs: rupees(2700) },
  'wrong-side': { amount: rupees(3000) },
  'wrong-carry': { amount: rupees(38400), wrongAs: rupees(34800) },
  'complete-omission': { amount: rupees(8000) },
  'wrong-account': { amount: rupees(5000) },
  principle: { amount: rupees(12000) },
  compensating: { amount: rupees(1000) },
};
