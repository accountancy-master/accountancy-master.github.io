import type { AccountQuestion, Difficulty, JournalSetQuestion, McqQuestion, NumericQuestion, StatementQuestion } from '@/content/types';
import { creditor, debtor } from '@/engine/accounts';
import { BALANCE_BD, BALANCE_CD, accountOf, post, postingsOf, type DatedEntry, type OpeningBalance } from '@/engine/books';
import type { JournalLine } from '@/engine/journal';
import type { Rng } from '@/engine/rng';
import {
  PARTIES,
  accountTemplate,
  amount,
  formatINR,
  journalSetTemplate,
  journalTemplate,
  keepFor,
  ledgerSides,
  mcqTemplate,
  numericTemplate,
  party,
  rupees,
  setDays,
  statementTemplate,
  type Paise,
} from '../authoring';
import type { Distractor, FormatRowParts, McqParts, NumericParts, StatementParts, Template } from '../types';
import { assertionReasonTemplate } from '../assertionReason';

const T = 'bank-reconciliation';
const fmt = formatINR;

// ---------------------------------------------------------------------------------------------------------------
// The one place where signs are decided.
//
// A balance is a signed amount: positive = favourable (money in the bank), negative = overdraft. Every reconciling
// item has a `sign`, defined by one sentence: "pass book balance = cash book balance + sign x amount". Cheques
// issued but not yet presented have sign +1 (the bank has not paid them, so the pass book is higher); bank charges
// have sign -1 (the bank has deducted them, so the pass book is lower); and so on. All questions use `reconcile`.
// ---------------------------------------------------------------------------------------------------------------

export type Book = 'cb' | 'pb';
type Group = 'timing' | 'bank' | 'cbCast' | 'cbRecord' | 'bankError' | 'cleared';
/** What the firm does about the item: enter it in its cash book, just list it, ask the bank to fix it, or nothing. */
type Action = 'enter' | 'listOnly' | 'bankFix' | 'none';

export interface Kind {
  id: string;
  group: Group;
  /** pass book balance = cash book balance + sign x amount (0: the item is in both books and has no effect). */
  sign: -1 | 0 | 1;
  inCb: boolean;
  inPb: boolean;
  action: Action;
  /** The line of the reconciliation statement. */
  label: string;
  /** A lower-case noun phrase for the item. */
  short: string;
  /** Rupee range and step of the amount. */
  range: [number, number, number];
  /** A neutral statement of the item (it does not say which book already has it). */
  fact: (x: string, who: string, a: Paise, rng: Rng) => string;
  /** What the prompt adds so that the item is fully determined for a reconciliation. */
  note?: string;
  /** The same item given indirectly, as two figures whose difference is the amount. */
  indirect?: (a: Paise, who: string, rng: Rng) => string;
  /** Why the two balances differ because of this item. */
  reason: string;
  /** The reasoning behind applying the item the wrong way round. */
  mistake: string;
}

/** The cash book balance a pass book balance is reached from, or the reverse: the single reconciliation function. */
export function reconcile(from: Book, balance: Paise, items: readonly Item[]): Paise {
  const net = items.reduce((t, i) => t + i.kind.sign * i.amount, 0);
  return from === 'cb' ? balance + net : balance - net;
}

export interface Item {
  kind: Kind;
  amount: Paise;
  /** The neutral statement. */
  fact: string;
  /** The statement with its note: what a numeric prompt shows. */
  text: string;
}

const effect = (i: Item): Paise => i.kind.sign * i.amount;
const sumEffect = (items: readonly Item[]): Paise => items.reduce((t, i) => t + effect(i), 0);
const sumAbs = (items: readonly Item[]): Paise => items.reduce((t, i) => t + (i.kind.sign === 0 ? 0 : i.amount), 0);
const live = (items: readonly Item[]): Item[] => items.filter((i) => i.kind.sign !== 0);
const adjusts = (i: Item): boolean => i.kind.action === 'enter';

// ---------------------------------------------------------------------------------------------------------------
// The items.
// ---------------------------------------------------------------------------------------------------------------

const issued: Kind = {
  id: 'issued', group: 'timing', sign: 1, inCb: true, inPb: false, action: 'listOnly',
  label: 'Cheques issued but not yet presented',
  short: 'cheques issued but not yet presented at the bank',
  range: [2000, 30000, 500],
  fact: (x, p, _a, rng) =>
    rng.pick([
      `Cheques totalling ${x} issued to suppliers have not yet been presented at the bank.`,
      `A cheque for ${x} issued to ${p} has not yet been presented for payment.`,
      `Cheques for ${x} given to creditors are still with them and have not reached the bank.`,
    ]),
  indirect: (a, _p, rng) => {
    const paid = amount(rng, 5000, 40000, 1000);
    return `Cheques of ${fmt(paid + a)} were issued during the month, and the bank had paid ${fmt(paid)} of them by the month end.`;
  },
  reason: 'The firm entered the cheques in its cash book when it issued them, but the bank pays them only when they are presented.',
  mistake: 'Thought the bank had already paid the cheques, so applied the item the wrong way round.',
};

const deposited: Kind = {
  id: 'deposited', group: 'timing', sign: -1, inCb: true, inPb: false, action: 'listOnly',
  label: 'Cheques deposited but not yet cleared',
  short: 'cheques deposited but not yet collected by the bank',
  range: [2000, 30000, 500],
  fact: (x, p, _a, rng) =>
    rng.pick([
      `Cheques for ${x} were deposited in the bank before the closing date but the bank has not yet collected them.`,
      `A cheque for ${x} received from ${p} was paid into the bank on the last day and is yet to be cleared.`,
      `Cheques worth ${x} sent to the bank for collection have not yet been credited.`,
    ]),
  indirect: (a, _p, rng) => {
    const credited = amount(rng, 5000, 40000, 1000);
    return `Cheques of ${fmt(credited + a)} were deposited during the month, and the bank had credited ${fmt(credited)} of them by the month end.`;
  },
  reason: 'The firm entered the cheques in its cash book when it deposited them, but the bank adds them to the account only once they are collected.',
  mistake: 'Thought the bank had already collected the cheques, so applied the item the wrong way round.',
};

const charges: Kind = {
  id: 'charges', group: 'bank', sign: -1, inCb: false, inPb: true, action: 'enter',
  label: 'Bank charges debited by the bank',
  short: 'bank charges debited by the bank but not yet entered in the cash book',
  range: [100, 2500, 50],
  fact: (x, _p, _a, rng) =>
    rng.pick([`The bank charged ${x} as bank charges.`, `Service charges of ${x} were debited by the bank.`]),
  note: 'The firm has not yet entered them in its cash book.',
  reason: 'The bank deducted the charges from the account, but the firm has not entered them in its cash book.',
  mistake: 'Treated a charge made by the bank as if the firm had received the money.',
};

const interestCr: Kind = {
  id: 'interestCr', group: 'bank', sign: 1, inCb: false, inPb: true, action: 'enter',
  label: 'Interest credited by the bank',
  short: 'interest credited by the bank but not yet entered in the cash book',
  range: [200, 4000, 50],
  fact: (x, _p, _a, rng) =>
    rng.pick([`The bank credited interest of ${x} to the firm's account.`, `Interest of ${x} on the firm's fixed deposit was credited to this account by the bank.`]),
  note: 'It is not yet in the cash book.',
  reason: 'The bank added interest to the account, but the firm has not entered it in its cash book.',
  mistake: 'Treated interest earned as if it were a payment made by the firm.',
};

const interestDr: Kind = {
  id: 'interestDr', group: 'bank', sign: -1, inCb: false, inPb: true, action: 'enter',
  label: 'Interest debited by the bank',
  short: 'interest debited by the bank but not yet entered in the cash book',
  range: [200, 4000, 50],
  fact: (x, _p, _a, rng) =>
    rng.pick([
      `The bank debited ${x} as interest on the overdraft taken earlier in the year.`,
      `Interest of ${x} on the firm's bank loan was debited by the bank.`,
    ]),
  note: 'It is not yet in the cash book.',
  reason: 'The bank deducted interest from the account, but the firm has not entered it in its cash book.',
  mistake: 'Treated interest charged by the bank as if it were income of the firm.',
};

const directDep: Kind = {
  id: 'directDep', group: 'bank', sign: 1, inCb: false, inPb: true, action: 'enter',
  label: 'Direct deposit by a customer',
  short: 'a direct deposit by a customer that the firm has not yet entered',
  range: [2000, 25000, 500],
  fact: (x, p, _a, rng) =>
    rng.pick([`${p} paid ${x} directly into the firm's bank account.`, `A customer, ${p}, transferred ${x} straight to the firm's account.`]),
  note: 'The firm has not yet entered the receipt.',
  reason: "The bank added the customer's payment to the account, but the firm has not yet entered the receipt.",
  mistake: 'Treated a receipt in the bank as if it were a payment.',
};

const standing: Kind = {
  id: 'standing', group: 'bank', sign: -1, inCb: false, inPb: true, action: 'enter',
  label: 'Payment by the bank on standing instruction',
  short: 'a payment made by the bank on standing instruction that the firm has not yet entered',
  range: [500, 8000, 100],
  fact: (x, _p, _a, rng) =>
    rng.pick([
      `The bank paid an insurance premium of ${x} on the firm's standing instruction.`,
      `The bank paid ${x} as a trade association subscription under a standing instruction.`,
      `The bank paid the firm's electricity bill of ${x} under a standing instruction.`,
    ]),
  note: 'The firm has not yet entered the payment.',
  reason: 'The bank paid the amount out of the account, but the firm has not yet entered the payment.',
  mistake: 'Treated a payment made by the bank as if it were a receipt.',
};

const dishonoured: Kind = {
  id: 'dishonoured', group: 'bank', sign: -1, inCb: false, inPb: true, action: 'enter',
  label: 'Cheque deposited and dishonoured',
  short: 'a deposited cheque dishonoured by the bank and not yet entered in the cash book',
  range: [1000, 20000, 500],
  fact: (x, p, _a, rng) =>
    rng.pick([
      `A cheque of ${x} received from ${p} and deposited earlier was returned unpaid, and the bank debited the firm's account with it.`,
      `${poss(p)} cheque for ${x}, which the firm had deposited, was dishonoured, and the bank debited the firm's account with the amount.`,
    ]),
  note: 'The firm has not yet entered the dishonour.',
  reason: 'The firm entered the cheque as a receipt when it deposited it. The bank took the amount back out of the account when the cheque was dishonoured, but the firm has not yet entered the dishonour.',
  mistake: 'Thought a dishonoured cheque still counts as money received.',
};

const dividend: Kind = {
  id: 'dividend', group: 'bank', sign: 1, inCb: false, inPb: true, action: 'enter',
  label: 'Dividend collected by the bank',
  short: 'dividend collected by the bank but not yet entered in the cash book',
  range: [500, 12000, 100],
  fact: (x) => `The bank collected a dividend of ${x} on the firm's investments and credited it to the account.`,
  note: 'It is not yet in the cash book.',
  reason: 'The bank collected the dividend and added it to the account, but the firm has not yet entered it.',
  mistake: 'Treated a dividend received as if it were a payment.',
};

const bankErrDr: Kind = {
  id: 'bankErrDr', group: 'bankError', sign: -1, inCb: false, inPb: true, action: 'bankFix',
  label: 'Amount wrongly debited by the bank',
  short: 'an amount wrongly debited by the bank',
  range: [500, 10000, 100],
  fact: (x, _p, _a, rng) =>
    rng.pick([
      `The bank wrongly debited ${x} to the firm's account; the amount belongs to another customer.`,
      `A cheque of ${x} drawn by another customer was wrongly debited by the bank to the firm's account.`,
    ]),
  reason: 'The bank deducted an amount that is not the firm\'s, so the pass book balance is too low.',
  mistake: "Treated the bank's wrong debit as if it were a credit, so the correction went the wrong way round.",
};

const bankErrCr: Kind = {
  id: 'bankErrCr', group: 'bankError', sign: 1, inCb: false, inPb: true, action: 'bankFix',
  label: 'Amount wrongly credited by the bank',
  short: 'an amount wrongly credited by the bank',
  range: [500, 10000, 100],
  fact: (x, _p, _a, rng) =>
    rng.pick([
      `The bank wrongly credited ${x} to the firm's account; the amount belongs to another customer.`,
      `A deposit of ${x} made by another customer was wrongly credited to the firm's account.`,
    ]),
  reason: "The bank added an amount that is not the firm's, so the pass book balance is too high.",
  mistake: "Treated the bank's wrong credit as if it were a debit, so the correction went the wrong way round.",
};

const cbPayUnder: Kind = {
  id: 'cbPayUnder', group: 'cbCast', sign: -1, inCb: true, inPb: false, action: 'enter',
  label: 'Payments side of the cash book under-cast',
  short: 'an under-casting of the payments side of the cash book',
  range: [200, 5000, 100],
  fact: (x) => `The payments side of the bank column of the cash book was under-cast (added up too low) by ${x}.`,
  reason: 'The payments side was added up too low, so the cash book balance is too high.',
  mistake: 'Thought that a payments side added up too low makes the balance too low.',
};

const cbPayOver: Kind = {
  id: 'cbPayOver', group: 'cbCast', sign: 1, inCb: true, inPb: false, action: 'enter',
  label: 'Payments side of the cash book over-cast',
  short: 'an over-casting of the payments side of the cash book',
  range: [200, 5000, 100],
  fact: (x) => `The payments side of the bank column of the cash book was over-cast (added up too high) by ${x}.`,
  reason: 'The payments side was added up too high, so the cash book balance is too low.',
  mistake: 'Thought that a payments side added up too high makes the balance too high.',
};

const cbRecUnder: Kind = {
  id: 'cbRecUnder', group: 'cbCast', sign: 1, inCb: true, inPb: false, action: 'enter',
  label: 'Receipts side of the cash book under-cast',
  short: 'an under-casting of the receipts side of the cash book',
  range: [200, 5000, 100],
  fact: (x) => `The receipts side of the bank column of the cash book was under-cast (added up too low) by ${x}.`,
  reason: 'The receipts side was added up too low, so the cash book balance is too low.',
  mistake: 'Thought that a receipts side added up too low makes the balance too high.',
};

const cbRecOver: Kind = {
  id: 'cbRecOver', group: 'cbCast', sign: -1, inCb: true, inPb: false, action: 'enter',
  label: 'Receipts side of the cash book over-cast',
  short: 'an over-casting of the receipts side of the cash book',
  range: [200, 5000, 100],
  fact: (x) => `The receipts side of the bank column of the cash book was over-cast (added up too high) by ${x}.`,
  reason: 'The receipts side was added up too high, so the cash book balance is too high.',
  mistake: 'Thought that a receipts side added up too high makes the balance too low.',
};

/** A recording error: the book shows a different amount from the bank's. `a` is the difference. */
const recordBase = (rng: Rng) => amount(rng, 1000, 20000, 100);

const cbPayLess: Kind = {
  id: 'cbPayLess', group: 'cbRecord', sign: -1, inCb: true, inPb: true, action: 'enter',
  label: 'Cheque issued, entered in the cash book for too little (difference)',
  short: 'a cheque issued and paid by the bank but entered in the cash book for too little',
  range: [100, 5000, 100],
  fact: (_x, p, a, rng) => {
    const r = recordBase(rng);
    return `A cheque for ${fmt(r + a)} issued to ${p} was paid by the bank at that amount, but the firm had entered it in the cash book as ${fmt(r)}.`;
  },
  reason: 'The cash book shows a smaller payment than the bank paid, so the cash book balance is too high.',
  mistake: 'Thought that a payment entered for too little makes the cash book balance too low.',
};

const cbPayMore: Kind = {
  id: 'cbPayMore', group: 'cbRecord', sign: 1, inCb: true, inPb: true, action: 'enter',
  label: 'Cheque issued, entered in the cash book for too much (difference)',
  short: 'a cheque issued and paid by the bank but entered in the cash book for too much',
  range: [100, 5000, 100],
  fact: (_x, p, a, rng) => {
    const r = recordBase(rng);
    return `A cheque for ${fmt(r)} issued to ${p} was paid by the bank at that amount, but the firm had entered it in the cash book as ${fmt(r + a)}.`;
  },
  reason: 'The cash book shows a larger payment than the bank paid, so the cash book balance is too low.',
  mistake: 'Thought that a payment entered for too much makes the cash book balance too high.',
};

const cbRecLess: Kind = {
  id: 'cbRecLess', group: 'cbRecord', sign: 1, inCb: true, inPb: true, action: 'enter',
  label: 'Cheque received, entered in the cash book for too little (difference)',
  short: 'a cheque received and credited by the bank but entered in the cash book for too little',
  range: [100, 5000, 100],
  fact: (_x, p, a, rng) => {
    const r = recordBase(rng);
    return `A cheque for ${fmt(r + a)} received from ${p} was deposited and credited by the bank at that amount, but the firm had entered it in the cash book as ${fmt(r)}.`;
  },
  reason: 'The cash book shows a smaller receipt than the bank credited, so the cash book balance is too low.',
  mistake: 'Thought that a receipt entered for too little makes the cash book balance too high.',
};

const cbRecMore: Kind = {
  id: 'cbRecMore', group: 'cbRecord', sign: -1, inCb: true, inPb: true, action: 'enter',
  label: 'Cheque received, entered in the cash book for too much (difference)',
  short: 'a cheque received and credited by the bank but entered in the cash book for too much',
  range: [100, 5000, 100],
  fact: (_x, p, a, rng) => {
    const r = recordBase(rng);
    return `A cheque for ${fmt(r)} received from ${p} was deposited and credited by the bank at that amount, but the firm had entered it in the cash book as ${fmt(r + a)}.`;
  },
  reason: 'The cash book shows a larger receipt than the bank credited, so the cash book balance is too high.',
  mistake: 'Thought that a receipt entered for too much makes the cash book balance too low.',
};

/** A decoy: an item both books already show, with no effect on the reconciliation. */
const cleared: Kind = {
  id: 'cleared', group: 'cleared', sign: 0, inCb: true, inPb: true, action: 'none',
  label: 'Cheque already paid or credited by the bank',
  short: 'a cheque already paid or credited by the bank',
  range: [2000, 30000, 500],
  fact: (x, p, _a, rng) =>
    rng.pick([
      `A cheque for ${x} issued to ${p} was presented and paid by the bank within the month.`,
      `A cheque for ${x} received from ${p} was deposited and credited by the bank within the month.`,
    ]),
  reason: 'The firm entered the cheque when it issued or deposited it, and the bank has already paid or credited it, so both books show it.',
  mistake: 'Adjusted for an item that both books already show.',
};

const TIMING = [issued, deposited];
const BANK = [charges, interestCr, interestDr, directDep, standing, dishonoured, dividend];
const BASIC = [...TIMING, ...BANK];
const CAST = [cbPayUnder, cbPayOver, cbRecUnder, cbRecOver];
const RECORD = [cbPayLess, cbPayMore, cbRecLess, cbRecMore];
const BANK_ERR = [bankErrDr, bankErrCr];
const WITH_ERRORS = [...BASIC, ...CAST, ...RECORD, ...BANK_ERR];
const SIMPLE_BANK = [charges, interestCr, directDep, standing];

/**
 * A bank credits no interest on an overdrawn account. Where either balance of a question is an overdraft, interest
 * credited by the bank is the interest on the firm's fixed deposit, credited to this account (version 2 of the
 * templates that met it otherwise). The amount, and so every answer, stays as it was.
 */
const fdInterest = (x: string) => `Interest of ${x} on the firm's fixed deposit was credited to this account by the bank.`;
function noInterestOnOverdraft(items: readonly Item[]): Item[] {
  return items.map((i) => {
    if (i.kind !== interestCr) return i;
    const fact = fdInterest(fmt(i.amount));
    return i.fact === fact ? i : { ...i, fact, text: i.text.replace(i.fact, fact) };
  });
}

export const KINDS: Kind[] = [...BASIC, ...CAST, ...RECORD, ...BANK_ERR, cleared];

// ---------------------------------------------------------------------------------------------------------------
// Words and sentences.
// ---------------------------------------------------------------------------------------------------------------

const FIRMS = [
  'Kavita Textiles', 'Naveen Hardware', 'Meena Stationers', 'Arun Electricals', 'Gupta Provision Store',
  'Sunita Boutique', 'Raghav Auto Parts', 'Deepa Medicals', 'Iqbal Cycle Mart', 'Lakshmi Sweets',
];
const DATES = ['31 March', '30 June', '30 September', '31 December'];
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'];

type Style = 'plain' | 'drcr';
type Nature = 'fav' | 'od';

const bookName = (b: Book) => (b === 'cb' ? 'cash book' : 'pass book');
const otherBook = (b: Book): Book => (b === 'cb' ? 'pb' : 'cb');
const natureOf = (signed: Paise): Nature => (signed > 0 ? 'fav' : 'od');
/** Possessive of a name: Kiran's, Meena Stationers'. */
const poss = (name: string) => (name.endsWith('s') ? name + "'" : name + "'s");
const an = (w: string) => (/^[aeiou]/i.test(w) ? `an ${w}` : `a ${w}`);

/** How a balance is named. Plain: favourable or overdraft. Debit or credit: a debit balance in the cash book is favourable, in the pass book an overdraft. */
function natureWord(book: Book, signed: Paise, style: Style): string {
  if (style === 'plain') return signed > 0 ? 'favourable balance' : 'overdraft';
  return (book === 'cb') === (signed > 0) ? 'debit balance' : 'credit balance';
}

const bookWithColumn = (b: Book) => (b === 'cb' ? 'cash book (bank column)' : 'pass book');

const itemList = (items: readonly Item[]) => items.map((it, i) => `(${ROMAN[i]}) ${it.text}`).join(' ');

function makeItem(rng: Rng, kind: Kind, indirect = false): Item {
  const a = amount(rng, ...kind.range);
  const who = party(rng);
  if (indirect && kind.indirect) {
    const fact = kind.indirect(a, who, rng);
    return { kind, amount: a, fact, text: fact };
  }
  const fact = kind.fact(fmt(a), who, a, rng);
  return { kind, amount: a, fact, text: kind.note ? `${fact} ${kind.note}` : fact };
}

/** Add or deduct, for an item, when starting from `start` (a signed balance) in book `from`. */
function treatment(from: Book, start: Paise, i: Item): 'add' | 'deduct' {
  const dir = from === 'cb' ? i.kind.sign : -i.kind.sign;
  return dir > 0 === start > 0 ? 'add' : 'deduct';
}

/** The textbook way, by running total in the starting balance's own terms. An independent route to `reconcile`. */
function textbook(from: Book, start: Paise, items: readonly Item[]): Paise {
  let m = Math.abs(start);
  for (const i of live(items)) m += treatment(from, start, i) === 'add' ? i.amount : -i.amount;
  return start > 0 ? m : -m;
}

const balanceLine = (label: string, signed: Paise) => `${label} (${signed > 0 ? 'favourable' : 'overdraft'}): ${fmt(Math.abs(signed))}`;

const sumAmounts = (items: readonly Item[]): Paise => items.reduce((t, i) => t + i.amount, 0);
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const natureText = (signed: Paise) => (signed > 0 ? 'a favourable balance' : 'an overdraft');

/**
 * The reconciliation statement as working lines, in the order the exam expects: the starting balance, the items
 * added and their total, the items deducted, the closing balance. `shown` are the items listed; the end balance
 * follows from them.
 */
function statementLines(from: Book, start: Paise, shown: readonly Item[], endLabel: string): string[] {
  const lines = [balanceLine(`Balance as per ${bookName(from)}`, start)];
  if (start < 0) {
    lines.push('An overdraft is a negative balance, so the rule turns round: what is added to a favourable balance is deducted from an overdraft, and the reverse.');
  }
  const adds = live(shown).filter((i) => treatment(from, start, i) === 'add');
  const lesses = live(shown).filter((i) => treatment(from, start, i) === 'deduct');
  for (const i of adds) lines.push(`Add: ${i.kind.label} ${fmt(i.amount)}`);
  const subtotal = Math.abs(start) + sumAmounts(adds);
  if (adds.length > 0 && lesses.length > 0) lines.push(`Total after the additions: ${fmt(subtotal)}`);
  for (const i of lesses) lines.push(`Less: ${i.kind.label} ${fmt(i.amount)}`);
  const end = reconcile(from, start, shown);
  if (natureOf(end) !== natureOf(start)) {
    const less = sumAmounts(lesses);
    lines.push(
      `The deductions come to ${fmt(less)}, which is ${fmt(less - subtotal)} more than ${fmt(subtotal)}, so ${start > 0 ? 'the favourable balance' : 'the overdraft'} turns into ${natureText(end)} of ${fmt(less - subtotal)}.`,
    );
  }
  lines.push(balanceLine(endLabel, end));
  return lines;
}

/** For a balance given as debit or credit: what that means in this book. */
const drCrLine = (book: Book, signed: Paise) => `${cap(an(natureWord(book, signed, 'drcr')))} in the ${bookName(book)} is ${natureText(signed)}.`;

const DECOY_LINE = 'A cheque that both books already show needs no adjustment.';

// ---------------------------------------------------------------------------------------------------------------
// Checking: each generator remembers how to re-derive its answer, and `verify` looks it up by prompt.
// ---------------------------------------------------------------------------------------------------------------

const numericChecks = new Map<string, (answer: number) => boolean>();
const mcqChecks = new Map<string, (correctText: string) => boolean>();

function remember<V>(map: Map<string, V>, prompt: string, check: V): void {
  if (map.size > 4000) map.clear();
  map.set(prompt, check);
}

const verifyNumeric = (q: NumericQuestion): boolean => numericChecks.get(q.prompt)?.(q.answer) ?? false;
const verifyMcq = (q: McqQuestion): boolean => {
  const text = q.options.find((o) => o.id === q.correct)?.text;
  return text !== undefined && (mcqChecks.get(q.prompt)?.(text) ?? false);
};

/** Reconcile forwards the textbook way, then backwards from the answer: both must agree with the stated balances. */
function checkRoundTrip(from: Book, start: Paise, items: readonly Item[], answerSigned: Paise): boolean {
  return (
    answerSigned !== 0 &&
    textbook(from, start, items) === answerSigned &&
    reconcile(otherBook(from), answerSigned, items) === start
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Wrong answers: each is a mistake students make.
// ---------------------------------------------------------------------------------------------------------------

interface Wrong {
  signed: Paise;
  why: string;
}

function wrongAnswers(from: Book, start: Paise, items: readonly Item[]): Wrong[] {
  const items0 = live(items);
  const out: Wrong[] = [];
  const dirSign = from === 'cb' ? 1 : -1;
  const apply = (xs: readonly Item[], k = 1): Paise => start + dirSign * k * sumEffect(xs);
  const sameSign = (m: number): Paise => (start > 0 ? m : -m);

  out.push({
    signed: apply(items0, -1),
    why:
      start < 0
        ? 'Treated the overdraft as if it were a favourable balance, so every item was added or deducted the wrong way round.'
        : 'Added every item that should have been deducted and deducted every item that should have been added: the whole statement was turned the wrong way round.',
  });
  out.push({ signed: start, why: 'Gave the starting balance back without adjusting it for any of the items.' });
  const timing = items0.filter((i) => i.kind.group === 'timing');
  const rest = items0.filter((i) => i.kind.group !== 'timing');
  if (timing.length > 0 && rest.length > 0) {
    out.push({ signed: apply(rest), why: 'Left out the cheques issued or deposited but not yet cleared, and adjusted only for the other items.' });
    out.push({ signed: apply(timing), why: 'Adjusted only for the cheques issued or deposited but not yet cleared, and left out every other item.' });
  }
  if (items0.length >= 2) {
    for (const i of items0) {
      out.push({ signed: apply(items0) - 2 * dirSign * effect(i), why: `Took ${i.kind.short} the wrong way round (added where it should be deducted, or the reverse).` });
    }
  }
  const total = sumAbs(items0);
  out.push({ signed: sameSign(Math.abs(start) + total), why: 'Added every item to the starting balance, whatever its direction.' });
  out.push({ signed: sameSign(Math.abs(start) - total), why: 'Deducted every item from the starting balance, whatever its direction.' });
  return out;
}

/** Positive, distinct, not the answer, at most six; null when fewer than two are left (the seed is then rejected). */
function tidy(answer: number, list: { value: number; why: string }[]): { value: number; why: string }[] | null {
  const seen = new Set([answer]);
  const out = list.filter((e) => Number.isSafeInteger(e.value) && e.value > 0 && !seen.has(e.value) && seen.add(e.value)).slice(0, 6);
  return out.length >= 2 ? out : null;
}

const HINTS = [
  'Start from the balance you are given. For each item, ask what the other book shows that this book does not.',
  'Cheques not yet presented or cleared are timing differences. Charges, interest, direct deposits and payments on standing instruction are in the pass book only.',
];

const HINTS_OVERDRAFT = [
  'An overdraft is a negative balance. Before you add or deduct, decide what each item does to the other book: does it make that balance more favourable or less favourable?',
  'From an overdraft the rule turns round: what you would add to a favourable balance reduces the overdraft, and what you would deduct adds to it. If the reductions are more than the overdraft, the answer has turned into a favourable balance.',
];

// ---------------------------------------------------------------------------------------------------------------
// The scenario builder shared by the numeric families.
// ---------------------------------------------------------------------------------------------------------------

interface Family {
  id: string;
  conceptId: string;
  difficulty: Difficulty;
  from: Book | 'either';
  nature: Nature | 'either';
  pool: Kind[];
  /** Every one of these is included. */
  must?: Kind[];
  /** One of these is included. */
  mustPick?: Kind[];
  /** Number of real items (decoys not counted). */
  n: [number, number];
  style?: Style | 'either';
  decoys?: number;
  indirect?: boolean;
  /** 'always': the answer's nature differs from the starting balance's; 'maybe': it may. */
  cross?: 'always' | 'maybe';
  /** The prompt does not say whether the answer is a favourable balance or an overdraft (the complex families). */
  hideNature?: boolean;
  /** Hints of the family, when not the common pair. */
  hints?: string[];
  version?: number;
}

interface Scenario {
  from: Book;
  to: Book;
  start: Paise;
  items: Item[];
  result: Paise;
  style: Style;
  firm: string;
  date: string;
}

function pickKinds(rng: Rng, f: Family): Kind[] {
  const n = rng.int(f.n[0], f.n[1]);
  const chosen: Kind[] = [...(f.must ?? [])];
  if (f.mustPick) chosen.push(rng.pick(f.mustPick));
  const rest = rng.shuffle(f.pool.filter((k) => !chosen.includes(k)));
  while (chosen.length < n && rest.length > 0) chosen.push(rest.shift() as Kind);
  return chosen;
}

/** A starting balance for the items that makes the answer cross zero, or null when the items move too little. */
function crossStart(rng: Rng, from: Book, items: readonly Item[]): Paise | null {
  const delta = (from === 'cb' ? 1 : -1) * sumEffect(items);
  const dRupees = Math.abs(delta) / 100;
  if (dRupees < 4000) return null;
  const maxM = Math.floor((dRupees - 2000) / 1000) * 1000;
  if (maxM < 1000) return null;
  const m = rupees(rng.step(1000, maxM, 1000));
  return delta > 0 ? -m : m;
}

function scenario(rng: Rng, f: Family): Scenario | null {
  const from: Book = f.from === 'either' ? rng.pick(['cb', 'pb'] as const) : f.from;
  const nature: Nature = f.nature === 'either' ? rng.pick(['fav', 'od'] as const) : f.nature;
  const style: Style = f.style === 'either' ? rng.pick(['plain', 'plain', 'drcr'] as const) : (f.style ?? 'plain');
  const real = pickKinds(rng, f).map((k) => makeItem(rng, k, f.indirect));
  if (sumEffect(real) === 0) return null;
  let start: Paise;
  const wantCross = f.cross === 'always' || (f.cross === 'maybe' && rng.next() < 0.5);
  if (wantCross) {
    const s = crossStart(rng, from, real);
    if (s === null) return null;
    start = s;
  } else {
    const m = sumAbs(real) + amount(rng, 3000, 60000, 1000);
    start = nature === 'fav' ? m : -m;
  }
  const decoys = Array.from({ length: f.decoys ?? 0 }, () => makeItem(rng, cleared));
  const drawn = rng.shuffle([...real, ...decoys]);
  const result = reconcile(from, start, drawn);
  if (result === 0) return null;
  const items = start < 0 || result < 0 ? noInterestOnOverdraft(drawn) : drawn;
  return { from, to: otherBook(from), start, items, result, style, firm: rng.pick(FIRMS), date: rng.pick(DATES) };
}

function startSentence(s: { firm: string; date: string; from: Book; start: Paise; style: Style }): string {
  return `On ${s.date}, the ${bookWithColumn(s.from)} of ${s.firm} shows ${an(natureWord(s.from, s.start, s.style))} of ${fmt(Math.abs(s.start))}.`;
}

function askSentence(s: Scenario, hideNature = false): string {
  const what = s.to === 'cb' ? 'the balance shown by the cash book before any entry or correction is made in it' : 'the balance as per the pass book';
  // The complex families leave the nature of the answer to the learner (version 2): it is not given away.
  if (hideNature) return `Find ${what}. Type the amount only, without its nature.`;
  return `Find ${what}. It is ${an(natureWord(s.to, s.result, s.style))}; type the amount only.`;
}

function reconcileTemplate(f: Family) {
  return numericTemplate({
    id: f.id,
    topicId: T,
    conceptId: f.conceptId,
    difficulty: f.difficulty,
    unit: 'rupees',
    ...(f.version ? { version: f.version } : {}),
    generate: (rng): NumericParts | null => {
      const s = scenario(rng, f);
      if (!s) return null;
      const answer = Math.abs(s.result);
      const errors = tidy(answer, wrongAnswers(s.from, s.start, s.items).map((w) => ({ value: Math.abs(w.signed), why: w.why })));
      if (!errors) return null;
      const prompt = `${startSentence(s)} On comparing it with the other book, the following were noticed: ${itemList(s.items)} ${askSentence(s, f.hideNature)}`;
      remember(numericChecks, prompt, (a) => checkRoundTrip(s.from, s.start, s.items, s.result) && a === Math.abs(s.result));
      const explanation = statementLines(s.from, s.start, s.items, `Balance as per ${bookName(s.to)}`);
      if (s.style === 'drcr') {
        explanation.unshift(drCrLine(s.from, s.start));
        explanation.push(drCrLine(s.to, s.result));
      }
      if (s.items.some((i) => i.kind.sign === 0)) explanation.push(DECOY_LINE);
      explanation.push(`Check: working back from the ${bookName(s.to)} balance with every item reversed gives ${fmt(Math.abs(s.start))}, the balance we started with.`);
      return { prompt, answer, commonErrors: errors, explanation, hints: f.hints ?? HINTS };
    },
    verify: verifyNumeric,
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Numeric generators: the other book's balance.
// ---------------------------------------------------------------------------------------------------------------

const cbToPbTiming = reconcileTemplate({
  id: 'brs-cb-to-pb-timing', conceptId: 'brs-timing', difficulty: 'easy',
  from: 'cb', nature: 'fav', pool: TIMING, n: [2, 2],
});

const cbToPbBank = reconcileTemplate({
  id: 'brs-cb-to-pb-bank', conceptId: 'brs-bank-items', difficulty: 'easy',
  from: 'cb', nature: 'fav', pool: SIMPLE_BANK, n: [2, 3],
});

const pbToCbTiming = reconcileTemplate({
  id: 'brs-pb-to-cb-timing', conceptId: 'brs-timing', difficulty: 'easy',
  from: 'pb', nature: 'fav', pool: TIMING, n: [2, 2],
});

const pbToCbBank = reconcileTemplate({
  id: 'brs-pb-to-cb-bank', conceptId: 'brs-bank-items', difficulty: 'easy',
  from: 'pb', nature: 'fav', pool: SIMPLE_BANK, n: [2, 3],
});

const oneItem = reconcileTemplate({
  id: 'brs-one-item', conceptId: 'brs-why', difficulty: 'easy',
  from: 'either', nature: 'fav', pool: [...TIMING, ...SIMPLE_BANK, dishonoured, interestDr], n: [1, 1],
});

const cbToPbMixed = reconcileTemplate({
  id: 'brs-cb-to-pb-mixed', conceptId: 'brs-from-cb', difficulty: 'medium',
  from: 'cb', nature: 'fav', pool: BASIC, mustPick: TIMING, n: [4, 5],
});

const pbToCbMixed = reconcileTemplate({
  id: 'brs-pb-to-cb-mixed', conceptId: 'brs-from-pb', difficulty: 'medium',
  from: 'pb', nature: 'fav', pool: BASIC, mustPick: TIMING, n: [4, 5],
});

const odCbToPb = reconcileTemplate({
  id: 'brs-od-cb-to-pb', conceptId: 'brs-overdraft', difficulty: 'medium',
  version: 2, hints: HINTS_OVERDRAFT,
  from: 'cb', nature: 'od', pool: BASIC, mustPick: TIMING, n: [3, 4], style: 'either',
});

const odPbToCb = reconcileTemplate({
  id: 'brs-od-pb-to-cb', conceptId: 'brs-overdraft', difficulty: 'medium',
  version: 2, hints: HINTS_OVERDRAFT,
  from: 'pb', nature: 'od', pool: BASIC, mustPick: TIMING, n: [3, 4], style: 'either',
});

const drCrStart = reconcileTemplate({
  id: 'brs-dr-cr-start', conceptId: 'brs-overdraft', difficulty: 'medium',
  version: 2,
  from: 'either', nature: 'either', pool: BASIC, n: [3, 4], style: 'drcr',
});

const castError = reconcileTemplate({
  id: 'brs-cast-error', conceptId: 'brs-errors', difficulty: 'medium',
  version: 2,
  from: 'either', nature: 'either', pool: BASIC, mustPick: CAST, n: [3, 3],
});

const recordError = reconcileTemplate({
  id: 'brs-record-error', conceptId: 'brs-errors', difficulty: 'medium',
  version: 2,
  from: 'either', nature: 'either', pool: BASIC, mustPick: RECORD, n: [3, 3],
});

const bankError = reconcileTemplate({
  id: 'brs-bank-error', conceptId: 'brs-errors', difficulty: 'medium',
  version: 2,
  from: 'either', nature: 'either', pool: BASIC, mustPick: BANK_ERR, n: [3, 3],
});

const crossZero = reconcileTemplate({
  id: 'brs-cross-zero', conceptId: 'brs-overdraft', difficulty: 'complex',
  version: 2, hideNature: true, hints: HINTS_OVERDRAFT,
  from: 'either', nature: 'either', pool: BASIC, mustPick: TIMING, n: [3, 4], cross: 'always', style: 'either',
});

const complexCbOd = reconcileTemplate({
  id: 'brs-complex-cb-od', conceptId: 'brs-overdraft', difficulty: 'complex',
  version: 2, hideNature: true, hints: HINTS_OVERDRAFT,
  from: 'cb', nature: 'od', pool: WITH_ERRORS, mustPick: TIMING, n: [5, 6], decoys: 1, style: 'either',
});

const complexPbOd = reconcileTemplate({
  id: 'brs-complex-pb-od', conceptId: 'brs-overdraft', difficulty: 'complex',
  version: 2, hideNature: true, hints: HINTS_OVERDRAFT,
  from: 'pb', nature: 'od', pool: WITH_ERRORS, mustPick: TIMING, n: [5, 6], decoys: 1, style: 'either',
});

const complexIndirect = reconcileTemplate({
  id: 'brs-complex-indirect', conceptId: 'brs-timing', difficulty: 'complex',
  version: 2, hideNature: true,
  from: 'either', nature: 'either', pool: [issued, deposited, ...BANK, ...CAST], must: [issued, deposited], n: [4, 4], indirect: true,
});

// ---------------------------------------------------------------------------------------------------------------
// brs-gap: both balances given, one cause; find the amount.
// ---------------------------------------------------------------------------------------------------------------

const brsGap = numericTemplate({
  id: 'brs-gap', topicId: T, conceptId: 'brs-why', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const kind = rng.pick([issued, deposited, charges, interestCr, directDep, standing, dishonoured]);
    const item = makeItem(rng, kind);
    const cb = amount(rng, 20000, 150000, 5000) + item.amount;
    const pb = reconcile('cb', cb, [item]);
    if (pb <= 0) return null;
    const firm = rng.pick(FIRMS);
    const date = rng.pick(DATES);
    const gap = Math.abs(pb - cb);
    const prompt = `On ${date}, the cash book (bank column) of ${firm} shows a favourable balance of ${fmt(cb)} and its pass book shows a favourable balance of ${fmt(pb)}. The whole difference is due to one thing: ${kind.short}. What is the amount of this item?`;
    const errors = tidy(gap, [
      { value: cb + pb, why: 'Added the two balances instead of finding the difference between them.' },
      { value: cb, why: 'Gave the cash book balance instead of the difference between the two balances.' },
      { value: pb, why: 'Gave the pass book balance instead of the difference between the two balances.' },
    ]);
    if (!errors) return null;
    remember(numericChecks, prompt, (a) => reconcile('cb', cb, [item]) === pb && a === item.amount);
    return {
      prompt,
      answer: gap,
      commonErrors: errors,
      explanation: [
        `Difference between the two balances = ${fmt(Math.max(cb, pb))} - ${fmt(Math.min(cb, pb))} = ${fmt(gap)}.`,
        `${kind.reason} The pass book balance is ${pb > cb ? 'higher' : 'lower'} than the cash book balance, and this is the only item, so it is ${fmt(gap)}.`,
      ],
      hints: ['Find the difference between the two balances.', 'The whole difference is one item, so it is the amount of that item.'],
    };
  },
  verify: verifyNumeric,
});

// ---------------------------------------------------------------------------------------------------------------
// brs-missing-item: both balances given, several items known, one unknown.
// ---------------------------------------------------------------------------------------------------------------

const missingItem = numericTemplate({
  id: 'brs-missing-item', topicId: T, conceptId: 'brs-why', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const unknown = rng.pick([issued, deposited, charges, directDep, interestCr, standing]);
    const knownKinds = rng.shuffle(BASIC.filter((k) => k !== unknown)).slice(0, rng.int(1, 2));
    const known = knownKinds.map((k) => makeItem(rng, k));
    const target = makeItem(rng, unknown);
    const all = [...known, target];
    const cb = sumAbs(all) + amount(rng, 5000, 50000, 1000);
    const pb = reconcile('cb', cb, all);
    if (pb <= 0) return null;
    const firm = rng.pick(FIRMS);
    const date = rng.pick(DATES);
    const prompt = `On ${date}, the cash book (bank column) of ${firm} shows a favourable balance of ${fmt(cb)}, while its pass book shows a favourable balance of ${fmt(pb)}. The following are known: ${itemList(known)} The rest of the difference is due to ${unknown.short}. Find the amount of this item.`;
    const delta = pb - cb;
    const errors = tidy(target.amount, [
      { value: Math.abs(delta), why: 'Took the whole difference between the balances as the missing item, ignoring the items already known.' },
      { value: Math.abs(delta + sumEffect(known)), why: 'Applied the known items the wrong way round when finding what is left over.' },
      { value: Math.abs(delta) + sumAbs(known), why: 'Added the known items to the difference instead of allowing for each in its own direction.' },
    ]);
    if (!errors) return null;
    remember(numericChecks, prompt, (a) => reconcile('cb', cb, [...known, { ...target, amount: a }]) === pb);
    const lines = statementLines('cb', cb, known, 'Cash book balance adjusted for the known items');
    const adjusted = reconcile('cb', cb, known);
    lines.push(`Balance as per pass book (given): ${fmt(pb)}`);
    lines.push(`Difference still to be explained = ${fmt(Math.max(adjusted, pb))} - ${fmt(Math.min(adjusted, pb))} = ${fmt(target.amount)}.`);
    lines.push(`For this kind of item (${unknown.label.toLowerCase()}) the pass book balance is ${unknown.sign > 0 ? 'higher' : 'lower'} than the cash book balance, which matches the figures: the item is ${fmt(target.amount)}.`);
    return { prompt, answer: target.amount, commonErrors: errors, explanation: lines, hints: HINTS };
  },
  verify: verifyNumeric,
});

// ---------------------------------------------------------------------------------------------------------------
// Amended cash book.
// ---------------------------------------------------------------------------------------------------------------

interface AmendedSpec {
  id: string;
  conceptId: string;
  difficulty: Difficulty;
  from: Book | 'either';
  nature: Nature | 'either';
  adj: [number, number];
  timing: [number, number];
  withBankError?: boolean;
  decoy?: boolean;
  /** The prompt does not say whether the amended balance is favourable or an overdraft. */
  hideNature?: boolean;
  hints?: string[];
  version?: number;
}

function amendedTemplate(o: AmendedSpec) {
  return numericTemplate({
    id: o.id, topicId: T, conceptId: o.conceptId, difficulty: o.difficulty, unit: 'rupees',
    ...(o.version ? { version: o.version } : {}),
    generate: (rng) => {
      const from: Book = o.from === 'either' ? rng.pick(['cb', 'pb'] as const) : o.from;
      const nature: Nature = o.nature === 'either' ? rng.pick(['fav', 'od'] as const) : o.nature;
      const adjKinds = rng.shuffle([...BANK, ...CAST, ...RECORD]).slice(0, rng.int(o.adj[0], o.adj[1]));
      const timingKinds = rng.shuffle(TIMING).slice(0, rng.int(o.timing[0], o.timing[1]));
      const extraKinds = o.withBankError ? [rng.pick(BANK_ERR)] : [];
      const real = [...adjKinds, ...timingKinds, ...extraKinds].map((k) => makeItem(rng, k));
      if (!real.some(adjusts)) return null;
      const decoys = o.decoy ? [makeItem(rng, cleared)] : [];
      const items = rng.shuffle([...real, ...decoys]);
      const m = sumAbs(items) + amount(rng, 3000, 60000, 1000);
      const start = nature === 'fav' ? m : -m;
      const adj = items.filter(adjusts);
      const stay = live(items).filter((i) => !adjusts(i));
      // The amended cash book balance: the cash book balance plus what the cash book itself must take in.
      const cbBefore = from === 'cb' ? start : reconcile('pb', start, items);
      const amended = cbBefore + sumEffect(adj);
      if (amended === 0 || cbBefore === 0) return null;
      const style: Style = 'plain';
      const firm = rng.pick(FIRMS);
      const date = rng.pick(DATES);
      const sentence = `On ${date}, the ${bookWithColumn(from)} of ${firm} shows ${an(natureWord(from, start, style))} of ${fmt(Math.abs(start))}.`;
      const pbBalance = from === 'pb' ? start : reconcile('cb', start, items);
      const listed = start < 0 || cbBefore < 0 || amended < 0 || pbBalance < 0 ? noInterestOnOverdraft(items) : items;
      const prompt =
        `${sentence} On comparing the two books the following were noticed: ${itemList(listed)} ` +
        `The firm now makes every entry and correction that its own cash book needs. What is the balance of the cash book after that? ` +
        (o.hideNature ? 'Type the amount only, without its nature.' : `It is ${an(natureWord('cb', amended, style))}; type the amount only.`);

      const wrongs: { value: number; why: string }[] = [];
      if (from === 'cb') {
        wrongs.push({ value: Math.abs(reconcile('cb', start, items)), why: 'Adjusted for every item, including the cheques not yet presented or cleared. Those are already in the cash book and need no entry, and the result is the pass book balance.' });
        wrongs.push({ value: Math.abs(start), why: 'Left the cash book balance as it was, without entering anything.' });
        wrongs.push({ value: Math.abs(start - sumEffect(adj)), why: 'Applied every entry and correction the wrong way round.' });
        const bankOnly = adj.filter((i) => i.kind.group === 'bank');
        if (bankOnly.length > 0 && bankOnly.length < adj.length) {
          wrongs.push({ value: Math.abs(start + sumEffect(bankOnly)), why: "Entered the items the bank had recorded but did not correct the cash book's own errors." });
        }
        for (const i of adj) wrongs.push({ value: Math.abs(amended - 2 * effect(i)), why: `Took ${i.kind.short} the wrong way round.` });
      } else {
        wrongs.push({ value: Math.abs(cbBefore), why: 'Reversed every item to find the cash book balance before any entry, and stopped there, without making the entries the cash book needs.' });
        wrongs.push({ value: Math.abs(start), why: 'Took the pass book balance as the cash book balance.' });
        wrongs.push({
          value: Math.abs(start + sumEffect(stay)),
          why: stay.some((i) => i.kind.action === 'bankFix')
            ? "Applied the cheques not yet presented or cleared and the bank's own errors the wrong way round."
            : 'Applied the cheques not yet presented or cleared the wrong way round.',
        });
        for (const i of stay) wrongs.push({ value: Math.abs(amended + 2 * effect(i)), why: `Took ${i.kind.short} the wrong way round.` });
      }
      const errors = tidy(Math.abs(amended), wrongs);
      if (!errors) return null;

      remember(numericChecks, prompt, (a) => {
        // Independent route: the pass book balance, less the items that remain as differences once the cash book is amended.
        const pb = from === 'pb' ? start : textbook('cb', start, items);
        // From the cash book: by way of the pass book. From the pass book: the textbook running total over the items that stay.
        const other = from === 'cb' ? pb - sumEffect(stay) : textbook('pb', start, stay);
        return other === amended && a === Math.abs(amended);
      });

      const lines: string[] = [];
      if (from === 'cb') {
        lines.push('The cash book itself takes in only what it lacks or has wrong. Cheques not yet presented or cleared are already in it and need no entry.');
        lines.push(...statementLines('cb', start, adj, 'Amended balance as per cash book'));
      } else {
        lines.push('Once the cash book is amended, the only differences left between the two books are the timing differences and any errors of the bank. So start from the pass book and reverse just those items.');
        lines.push(...statementLines('pb', start, stay, 'Amended balance as per cash book'));
      }
      if (items.some((i) => i.kind.sign === 0)) lines.push(DECOY_LINE);
      return { prompt, answer: Math.abs(amended), commonErrors: errors, explanation: lines, hints: o.hints ?? HINTS } satisfies NumericParts;
    },
    verify: verifyNumeric,
  });
}

const amendedFromCb = amendedTemplate({
  id: 'brs-amended-from-cb', conceptId: 'brs-amended', difficulty: 'medium', from: 'cb', nature: 'fav', adj: [2, 3], timing: [1, 2],
});

const amendedFromPb = amendedTemplate({
  id: 'brs-amended-from-pb', conceptId: 'brs-amended', difficulty: 'medium', from: 'pb', nature: 'fav', adj: [2, 3], timing: [1, 2],
});

const amendedComplex = amendedTemplate({
  id: 'brs-complex-amended', conceptId: 'brs-amended', difficulty: 'complex', from: 'either', nature: 'od', adj: [3, 3], timing: [2, 2],
  withBankError: true, decoy: true, version: 2, hideNature: true, hints: HINTS_OVERDRAFT,
});

// ---------------------------------------------------------------------------------------------------------------
// brs-corrected-cb: only the cash book's own errors are corrected; the other items are distractors.
// ---------------------------------------------------------------------------------------------------------------

const correctedCb = numericTemplate({
  id: 'brs-corrected-cb', topicId: T, conceptId: 'brs-errors', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const errKinds = rng.shuffle([...CAST, ...RECORD]).slice(0, rng.int(1, 2));
    const timingKinds = rng.shuffle(TIMING).slice(0, rng.int(1, 2));
    const errs = errKinds.map((k) => makeItem(rng, k));
    const timing = timingKinds.map((k) => makeItem(rng, k));
    const items = rng.shuffle([...errs, ...timing]);
    const nature: Nature = rng.pick(['fav', 'od']);
    const m = sumAbs(items) + amount(rng, 3000, 50000, 1000);
    const start = nature === 'fav' ? m : -m;
    const corrected = reconcile('cb', start, errs);
    if (corrected === 0 || sumEffect(errs) === 0) return null;
    const firm = rng.pick(FIRMS);
    const date = rng.pick(DATES);
    const prompt =
      `On ${date}, the cash book (bank column) of ${firm} shows ${an(natureWord('cb', start, 'plain'))} of ${fmt(m)}. ` +
      `While preparing the reconciliation the firm noticed: ${itemList(items)} ` +
      `Correct only the mistakes in the cash book itself. What is the corrected balance of the cash book? ` +
      `It is ${an(natureWord('cb', corrected, 'plain'))}; type the amount only.`;
    const answer = Math.abs(corrected);
    const errors = tidy(answer, [
      { value: Math.abs(reconcile('cb', start, items)), why: 'Also adjusted for the cheques not yet presented or cleared, which are not mistakes in the cash book and give the pass book balance.' },
      { value: Math.abs(start), why: 'Left the cash book balance uncorrected.' },
      { value: Math.abs(start - sumEffect(errs)), why: 'Corrected every error in the wrong direction.' },
      ...errs.map((i) => ({ value: Math.abs(corrected - 2 * effect(i)), why: `Corrected ${i.kind.short} in the wrong direction.` })),
    ]);
    if (!errors) return null;
    remember(numericChecks, prompt, (a) => textbook('cb', start, errs) === corrected && a === Math.abs(corrected));
    const lines = statementLines('cb', start, errs, 'Corrected balance as per cash book');
    lines.push('Cheques issued or deposited but not yet cleared are timing differences, not mistakes: the cash book is already right about them.');
    return { prompt, answer, commonErrors: errors, explanation: lines, hints: HINTS };
  },
  verify: verifyNumeric,
});

// ---------------------------------------------------------------------------------------------------------------
// brs-count-entries: how many items need an entry in the cash book?
// ---------------------------------------------------------------------------------------------------------------

const countEntries = numericTemplate({
  id: 'brs-count-entries', topicId: T, conceptId: 'brs-amended', difficulty: 'medium', unit: 'number',
  generate: (rng) => {
    const kinds = rng.shuffle([...BASIC, ...CAST, ...BANK_ERR]).slice(0, rng.int(4, 6));
    const items = kinds.map((k) => makeItem(rng, k));
    const entries = items.filter(adjusts).length;
    const timing = items.filter((i) => i.kind.group === 'timing').length;
    const bankFix = items.filter((i) => i.kind.action === 'bankFix').length;
    if (entries === 0 || entries === items.length) return null;
    const firm = rng.pick(FIRMS);
    const date = rng.pick(DATES);
    const prompt = `While reconciling its bank balance on ${date}, ${firm} found these differences between the cash book and the pass book: ${itemList(items)} For how many of these items must the firm make an entry or correction in its own cash book?`;
    const errors = tidy(entries, [
      { value: items.length, why: 'Counted every item, although cheques not yet cleared and the errors of the bank need nothing in the cash book.' },
      { value: entries + timing, why: 'Counted cheques not yet presented or cleared, which are already in the cash book.' },
      { value: entries + bankFix, why: 'Counted the errors of the bank, which the bank must correct and the firm must not enter.' },
      { value: items.filter((i) => i.kind.inPb && !i.kind.inCb).length, why: 'Counted everything shown only in the pass book, including the errors of the bank and leaving out the errors in the cash book.' },
    ]);
    if (!errors) return null;
    remember(numericChecks, prompt, (a) => items.filter((i) => i.kind.action === 'enter').length === a);
    const named = items.filter(adjusts).map((i) => i.kind.label.toLowerCase());
    return {
      prompt,
      answer: entries,
      commonErrors: errors,
      explanation: [
        'An entry or correction is needed in the cash book for what it lacks or has wrong: items first recorded by the bank, and errors in the cash book itself.',
        'Cheques not yet presented or cleared are already in the cash book. Errors of the bank are put right by the bank.',
        `Items needing a cash book entry: ${named.join('; ')}, which makes ${entries}.`,
      ],
      hints: ['Sort the items into three groups: timing differences, errors of the bank, and items the cash book lacks or has wrong.', 'Only the last group needs a cash book entry.'],
    };
  },
  verify: verifyNumeric,
});

// ---------------------------------------------------------------------------------------------------------------
// Multiple-choice generators.
// ---------------------------------------------------------------------------------------------------------------

const moreFavourable = (i: Item) => (i.kind.sign > 0 ? 'more favourable' : 'less favourable');

function addDeduct(o: { id: string; conceptId: string; difficulty: Difficulty; from: Book | 'either'; nature: Nature | 'either'; pool: Kind[]; version?: number }) {
  return mcqTemplate({
    id: o.id, topicId: T, conceptId: o.conceptId, difficulty: o.difficulty,
    ...(o.version ? { version: o.version } : {}),
    generate: (rng): McqParts => {
      const from: Book = o.from === 'either' ? rng.pick(['cb', 'pb'] as const) : o.from;
      const nature: Nature = o.nature === 'either' ? rng.pick(['fav', 'od'] as const) : o.nature;
      const drawn = makeItem(rng, rng.pick(o.pool));
      const bal = amount(rng, 20000, 150000, 5000);
      const start = nature === 'fav' ? bal : -bal;
      // Version 2 of the overdraft family: no interest credited on an overdrawn account.
      const [item] = start < 0 ? noInterestOnOverdraft([drawn]) : [drawn];
      const t = treatment(from, start, item);
      const target = nature === 'fav' ? 'the balance' : 'the overdraft';
      const add = `Add it to ${target}`;
      const deduct = `Deduct it from ${target}`;
      const to = otherBook(from);
      const firm = rng.pick(FIRMS);
      const prompt =
        `${poss(firm)} ${bookWithColumn(from)} shows ${an(natureWord(from, start, 'plain'))} of ${fmt(bal)}. ${item.text} ` +
        `A reconciliation statement starts from this balance and ends at the ${to === 'cb' ? 'balance the cash book shows before any entry or correction is made in it' : 'pass book balance'}. How is this item dealt with in it?`;
      const wrongDirWhy = nature === 'fav' ? item.kind.mistake : 'Used the rule for a favourable balance, without turning it round for an overdraft.';
      const distractors: Distractor[] = [
        { text: t === 'add' ? deduct : add, why: wrongDirWhy },
        { text: 'Leave it out, because both books already show it', why: 'Assumed both books already show the item, so nothing needs adjusting.' },
        { text: 'Leave it out of the statement; the bank will sort it out later', why: 'Left out an item that explains part of the difference because it will sort itself out in time.' },
      ];
      // Independent check: an item that is added makes the balance grow in size, whichever kind of balance it is.
      remember(mcqChecks, prompt, (text) => (Math.abs(reconcile(from, start, [item])) > Math.abs(start)) === (text === add));
      return {
        prompt,
        correct: t === 'add' ? add : deduct,
        distractors,
        explanation:
          `${item.kind.reason} This item makes the pass book balance ${moreFavourable(item)} than the cash book balance. ` +
          `Starting from the ${bookName(from)} ${nature === 'fav' ? 'balance' : 'overdraft'}, ${t === 'add' ? 'add it' : 'deduct it'}.` +
          (nature === 'od' ? ' An overdraft is a negative balance, so the rule turns round: what is added to a favourable balance is deducted from an overdraft.' : ''),
        hints: [
          'Ask first whether the pass book balance is more favourable or less favourable than the cash book balance because of this item.',
          nature === 'fav' ? 'If you start from the less favourable book, add; if from the more favourable, deduct.' : 'With an overdraft the rule turns round.',
        ],
      };
    },
    verify: verifyMcq,
  });
}

const addDeductCb = addDeduct({ id: 'brs-add-or-deduct-cb', conceptId: 'brs-from-cb', difficulty: 'easy', from: 'cb', nature: 'fav', pool: [...BASIC] });
const addDeductPb = addDeduct({ id: 'brs-add-or-deduct-pb', conceptId: 'brs-from-pb', difficulty: 'easy', from: 'pb', nature: 'fav', pool: [...BASIC] });
const addDeductOd = addDeduct({ id: 'brs-add-or-deduct-od', conceptId: 'brs-overdraft', difficulty: 'medium', from: 'either', nature: 'od', pool: [...BASIC, ...CAST, ...BANK_ERR], version: 2 });

// -- Which book already shows the item? ---------------------------------------------------------------------------

const WHERE = { cb: 'Cash book only', pb: 'Pass book only', both: 'Both books', none: 'Neither book' } as const;
type Where = keyof typeof WHERE;
const WHERE_WHY: Record<Where, Partial<Record<Where, string>>> = {
  cb: {
    pb: 'Thought the bank has already acted on an item it has not yet processed.',
    both: 'Assumed the bank has also recorded it, although it has not yet paid or collected the cheque.',
    none: 'Forgot that the firm enters its own cheques in the cash book when it issues or deposits them.',
  },
  pb: {
    cb: 'Assumed the firm already knows of an entry that only the bank has made.',
    both: 'Assumed the firm has already recorded an entry that came from the bank.',
    none: 'Overlooked that the bank has already entered it in the pass book.',
  },
  both: {
    cb: 'Forgot that the bank has already paid or credited it, so the pass book shows it too.',
    pb: 'Forgot that the firm records its own cheques in the cash book when it issues or receives them.',
    none: 'Took an item that both books show as one that neither shows.',
  },
  none: {},
};

const whichBook = mcqTemplate({
  id: 'brs-which-book', topicId: T, conceptId: 'brs-why', difficulty: 'easy',
  generate: (rng) => {
    const kind = rng.pick([issued, deposited, charges, interestCr, interestDr, directDep, standing, dishonoured, dividend, bankErrDr, bankErrCr, cleared]);
    const item = makeItem(rng, kind);
    const where: Where = kind.inCb && kind.inPb ? 'both' : kind.inCb ? 'cb' : 'pb';
    const firm = rng.pick(FIRMS);
    const date = rng.pick(DATES);
    const prompt =
      `On ${date}, ${firm} compared its cash book with its pass book. The firm learns of what the bank does on its own only from the pass book, and it has not yet made any entry for what it found. ` +
      `In which book is ${kind === dishonoured ? 'the dishonour described below' : 'the following'} already entered? ${item.fact}`;
    remember(mcqChecks, prompt, (text) => text === WHERE[kind.inCb && kind.inPb ? 'both' : kind.inCb ? 'cb' : 'pb']);
    const others = (Object.keys(WHERE) as Where[]).filter((w) => w !== where);
    return {
      prompt,
      correct: WHERE[where],
      distractors: others.map((w) => ({ text: WHERE[w], why: WHERE_WHY[where][w] ?? 'Misjudged which book has recorded the item.' })),
      explanation:
        where === 'both'
          ? `${kind.reason} Nothing needs adjusting.`
          : where === 'cb'
            ? `${kind.reason} So only the cash book has the entry at this stage.`
            : `${kind.reason} So only the pass book has the entry at this stage.`,
      hints: ['The firm enters its own cheques when it issues or deposits them. The bank enters them when it pays or collects them.', 'Charges, interest and direct deposits begin with the bank.'],
    };
  },
  verify: verifyMcq,
});

// -- What do debit and credit balances mean? ---------------------------------------------------------------------

const drCrMeaning = mcqTemplate({
  id: 'brs-dr-cr-meaning', topicId: T, conceptId: 'brs-overdraft', difficulty: 'easy',
  generate: (rng) => {
    const book: Book = rng.pick(['cb', 'pb'] as const);
    const fav = rng.next() < 0.5;
    const start = fav ? 1 : -1;
    const side = natureWord(book, start, 'drcr'); // 'debit balance' or 'credit balance'
    const otherSide = side === 'debit balance' ? 'credit balance' : 'debit balance';
    const to = otherBook(book);
    const nat = (f: boolean) => (f ? 'A favourable balance' : 'An overdraft');
    const text = (f: boolean, s: string) => `${nat(f)}; the ${bookName(to)} would show ${an(s)}`;
    const firm = rng.pick(FIRMS);
    const x = fmt(amount(rng, 5000, 90000, 5000));
    const prompt = `The ${bookWithColumn(book)} of ${firm} shows ${an(side)} of ${x}. What does this mean, and what would the ${bookName(to)} show for the same balance if the two books agreed?`;
    remember(mcqChecks, prompt, (t) => t === text(fav, otherSide));
    return {
      prompt,
      correct: text(fav, otherSide),
      distractors: [
        { text: text(fav, side), why: 'Knew the nature of the balance but assumed both books show it on the same side. The pass book is the bank\'s mirror image of the firm\'s cash book.' },
        { text: text(!fav, otherSide), why: 'Mixed up the meaning of debit and credit between the two books: a debit balance is favourable in the cash book but an overdraft in the pass book.' },
        { text: text(!fav, side), why: 'Reversed both ideas: read the balance the wrong way and also placed it on the wrong side of the other book.' },
      ],
      explanation:
        `In the cash book a debit balance is favourable and a credit balance is an overdraft. In the pass book it is the other way round, because the bank records the firm's account from its own side. ` +
        `So ${an(side)} in the ${bookName(book)} is ${fav ? 'a favourable balance' : 'an overdraft'}, and the ${bookName(to)} would show ${an(otherSide)}.`,
      hints: ['In the cash book the bank column is an asset: a debit balance means money in the bank.', 'The pass book is kept by the bank, so what is a debit for the firm is a credit for the bank.'],
    };
  },
  verify: verifyMcq,
});

// -- What does the firm do about the item? -----------------------------------------------------------------------

const ACT = {
  enter: 'Make an entry or correction in the cash book',
  listOnly: 'Make no entry; it is a timing difference that disappears once the bank clears it',
  bankFix: 'Make no entry; the bank has to correct its own mistake',
  both: 'Make an entry in the cash book and also ask the bank to change the pass book',
} as const;
type Act = keyof typeof ACT;
const ACT_WHY: Record<Exclude<Act, 'both'>, Record<Act, string>> = {
  enter: {
    enter: '',
    listOnly: 'Treated an item the cash book lacks, or has wrong, as a timing difference that will sort itself out.',
    bankFix: "Blamed the bank, although the bank's entry is right or the mistake is in the firm's own cash book.",
    both: 'Changed both books, though only the book that is wrong or incomplete is corrected.',
  },
  listOnly: {
    enter: 'Entered a cheque a second time: the cash book already has it and will not change.',
    listOnly: '',
    bankFix: 'Blamed the bank for a cheque that has simply not yet been presented or collected.',
    both: 'Changed both books for a cheque both parties will record in time.',
  },
  bankFix: {
    enter: "Changed the cash book for a mistake that is the bank's, which would make the firm's own books wrong.",
    listOnly: 'Treated a mistake of the bank as a timing difference; it will not disappear until the bank corrects it.',
    bankFix: '',
    both: "Changed the firm's books for a mistake that belongs to the bank.",
  },
};

const needsEntry = mcqTemplate({
  id: 'brs-needs-entry', topicId: T, conceptId: 'brs-bank-items', difficulty: 'medium',
  generate: (rng) => {
    const kind = rng.pick([issued, deposited, charges, interestCr, interestDr, directDep, standing, dishonoured, dividend, bankErrDr, bankErrCr, ...CAST]);
    const item = makeItem(rng, kind);
    const act = kind.action as Exclude<Act, 'both'>;
    const firm = rng.pick(FIRMS);
    const date = rng.pick(DATES);
    const prompt = `While reconciling on ${date}, ${firm} found this difference between its cash book and its pass book: ${item.text} What should the firm do about this item?`;
    remember(mcqChecks, prompt, (text) => text === ACT[kind.action as Act]);
    const others = (Object.keys(ACT) as Act[]).filter((a) => a !== act);
    return {
      prompt,
      correct: ACT[act],
      distractors: others.map((a) => ({ text: ACT[a], why: ACT_WHY[act][a] })),
      explanation: `${kind.reason} ${act === 'enter' ? 'The cash book is the book that is incomplete or wrong, so the firm enters or corrects it there.' : act === 'listOnly' ? 'The cash book is already right. The item is only shown in the reconciliation statement.' : 'The pass book is the book that is wrong, so the bank corrects it. The item is shown in the statement until it does.'}`,
      hints: ['Which book is incomplete or wrong, or are both right?', 'Only the book that is wrong or incomplete is changed.'],
    };
  },
  verify: verifyMcq,
});

// -- Is the cash book balance too high or too low? ---------------------------------------------------------------

const errorDirection = mcqTemplate({
  id: 'brs-error-direction', topicId: T, conceptId: 'brs-errors', difficulty: 'medium',
  generate: (rng) => {
    const kind = rng.pick([...CAST, ...RECORD]);
    const item = makeItem(rng, kind);
    const high = kind.sign < 0;
    const text = (h: boolean, correction: 'deduct' | 'add') => `The balance is too ${h ? 'high' : 'low'}; ${correction} the amount of the error`;
    const right = text(high, high ? 'deduct' : 'add');
    const firm = rng.pick(FIRMS);
    const prompt = `${firm} found an error in its cash book while reconciling it with the pass book (take the cash book balance as a favourable balance): ${item.fact} What does the error do to the cash book balance, and how is it corrected?`;
    remember(mcqChecks, prompt, (t) => t === right);
    return {
      prompt,
      correct: right,
      distractors: [
        { text: text(!high, high ? 'add' : 'deduct'), why: kind.mistake },
        { text: text(high, high ? 'add' : 'deduct'), why: 'Saw how the error affects the balance but then moved it further the wrong way instead of correcting it.' },
        { text: text(!high, high ? 'deduct' : 'add'), why: 'Misread what the error did to the balance, although the correction chosen happens to be the right one.' },
      ],
      explanation: `${kind.reason} To correct it, ${high ? 'deduct' : 'add'} ${kind.group === 'cbRecord' ? 'the difference, ' : ''}${fmt(item.amount)}${kind.group === 'cbRecord' ? ',' : ''} ${high ? 'from' : 'to'} the cash book balance.`,
      hints: ['Ask whether the error made the balance bigger or smaller than it should be.', 'Correct it by moving the balance back the other way.'],
    };
  },
  verify: verifyMcq,
});

// -- Favourable balance or overdraft after reconciling? ----------------------------------------------------------

const balanceText = (signed: Paise) => `${fmt(Math.abs(signed))} ${signed > 0 ? 'favourable balance' : 'overdraft'}`;

const natureResult = mcqTemplate({
  id: 'brs-nature-result', topicId: T, conceptId: 'brs-overdraft', difficulty: 'complex', version: 2,
  generate: (rng) => {
    const f: Family = { id: '', conceptId: '', difficulty: 'complex', from: 'either', nature: 'either', pool: BASIC, mustPick: TIMING, n: [3, 4], cross: 'maybe' };
    const s = scenario(rng, f);
    if (!s) return null;
    const wrongs = wrongAnswers(s.from, s.start, s.items);
    const candidates: Distractor[] = [
      { text: balanceText(-s.result), why: 'Found the right amount but gave the wrong nature: called a favourable balance an overdraft, or the reverse.' },
      ...wrongs.map((w) => ({ text: balanceText(w.signed), why: w.why })),
    ];
    const correct = balanceText(s.result);
    const seen = new Set([correct]);
    const usable = candidates.filter((d) => d.text !== correct && !/^₹0 /.test(d.text) && !seen.has(d.text) && seen.add(d.text));
    // Version 2: the right amount with the other nature is always among the three wrong options, so the options never
    // all name one nature (the question asks for the nature as well as the amount).
    const distractors = usable.slice(0, 3);
    if (distractors.length < 3 || distractors[0].text !== balanceText(-s.result)) return null;
    const prompt =
      `${startSentence({ ...s, style: 'plain' })} On comparing it with the other book, the following were noticed: ${itemList(s.items)} ` +
      `What balance does the ${bookName(s.to)} show before any entry or correction is made in it: how much, and is it a favourable balance or an overdraft?`;
    remember(mcqChecks, prompt, (t) => t === balanceText(textbook(s.from, s.start, s.items)) && reconcile(s.to, s.result, s.items) === s.start);
    const explanation = statementLines(s.from, s.start, s.items, `Balance as per ${bookName(s.to)}`);
    return { prompt, correct, distractors, explanation: explanation.join(' '), hints: HINTS_OVERDRAFT };
  },
  verify: verifyMcq,
});

// ---------------------------------------------------------------------------------------------------------------
// Journal generators: entries that follow from a reconciliation.
// ---------------------------------------------------------------------------------------------------------------

// Version 2 of the three: hints of their own in place of the default pair.
const jb = (
  id: string,
  conceptId: string,
  hints: string[],
  build: (rng: Rng) => { prompt: string; lines: { accountId: string; side: 'Dr' | 'Cr'; amount: Paise }[]; explanation: string[]; distractorAccounts?: string[] },
) => journalTemplate({ id, topicId: T, conceptId, difficulty: 'easy', version: 2, generate: (rng) => ({ ...build(rng), hints }) });

const bankPaidExpense = jb('brs-j-bank-debits', 'brs-bank-items', [
  'The bank has already paid this out of the account. What did the money pay for?',
  'Debit the expense the bank paid (charges, interest, premium, bill or rent) and credit Bank A/c, which has gone down.',
], (rng) => {
  const opts = [
    { acc: 'bankCharges', range: [100, 2500, 50], say: (x: string) => `The pass book shows bank charges of ${x} debited by the bank.`, why: 'Bank charges are an expense of the firm.', wrong: ['interestPaid'] },
    { acc: 'insurance', range: [1000, 9000, 100], say: (x: string) => `The bank paid an insurance premium of ${x} on the firm's standing instruction.`, why: 'The insurance premium is an expense of the firm.', wrong: ['prepaidExpenses'] },
    { acc: 'interestPaid', range: [300, 6000, 50], say: (x: string) => `The bank debited ${x} as interest on the firm's overdraft.`, why: 'Interest on the overdraft is an expense of the firm.', wrong: ['interestReceived'] },
    { acc: 'electricity', range: [800, 9000, 100], say: (x: string) => `The bank paid the firm's electricity bill of ${x} under a standing instruction.`, why: 'The electricity bill is an expense of the firm.', wrong: ['powerAndFuel'] },
    { acc: 'rent', range: [3000, 25000, 500], say: (x: string) => `The bank paid the monthly rent of ${x} to the landlord under a standing instruction.`, why: 'Rent is an expense of the firm.', wrong: ['rentReceived'] },
  ];
  const o = rng.pick(opts);
  const a = amount(rng, o.range[0], o.range[1], o.range[2]);
  const x = fmt(a);
  return {
    prompt: `While reconciling its bank balance on ${rng.pick(DATES)}, ${rng.pick(FIRMS)} found an item in the pass book that is not in the cash book: ${o.say(x)} Pass the entry the firm needs to make in its cash book.`,
    lines: [
      { accountId: o.acc, side: 'Dr', amount: a },
      { accountId: 'bank', side: 'Cr', amount: a },
    ],
    explanation: [o.why + ' Expenses are debited.', 'The bank has paid the amount out of the firm\'s account, so Bank A/c, an asset that decreases, is credited.'],
    distractorAccounts: o.wrong,
  };
});

const bankReceivedIncome = jb('brs-j-bank-credits', 'brs-bank-items', [
  'The bank has already added this to the account. Where did the money come from?',
  'Debit Bank A/c, which has gone up, and credit the source: the income earned (interest, dividend) or the customer who paid.',
], (rng) => {
  const who = party(rng);
  const opts = [
    { acc: 'interestReceived', range: [200, 4000, 50], say: (x: string) => `The bank credited interest of ${x} to the firm's account.`, why: 'Interest earned is an income of the firm, so it is credited.', wrong: ['commissionReceived'] },
    { acc: 'dividendReceived', range: [500, 12000, 100], say: (x: string) => `The bank collected a dividend of ${x} on the firm's investments and credited it to the account.`, why: 'Dividend received is an income of the firm, so it is credited.', wrong: ['interestReceived'] },
    { acc: debtor(who), range: [2000, 25000, 500], say: (x: string) => `${who}, a customer who owed the firm money, paid ${x} directly into the firm's bank account.`, why: `${who} paid what was owed, so the debtor's account is credited.`, wrong: ['sales'] },
  ];
  const o = rng.pick(opts);
  const a = amount(rng, o.range[0], o.range[1], o.range[2]);
  const x = fmt(a);
  return {
    prompt: `While reconciling its bank balance on ${rng.pick(DATES)}, ${rng.pick(FIRMS)} found an item in the pass book that is not in the cash book: ${o.say(x)} Pass the entry the firm needs to make in its cash book.`,
    lines: [
      { accountId: 'bank', side: 'Dr', amount: a },
      { accountId: o.acc, side: 'Cr', amount: a },
    ],
    explanation: ["The bank has added the money to the firm's account, so Bank A/c, an asset that increases, is debited.", o.why],
    distractorAccounts: o.wrong,
  };
});

const dishonourEntry = jb('brs-j-dishonour', 'brs-bank-items', [
  'When the cheque was deposited, the firm debited Bank and credited the customer. What does the dishonour undo?',
  'Reverse that receipt: debit the customer, who owes the money again, and credit Bank A/c, from which the bank has taken it back.',
], (rng) => {
  const a = amount(rng, 1000, 40000, 500);
  const who = party(rng);
  return {
    prompt: `A cheque of ${fmt(a)} received from ${who} and deposited earlier was returned unpaid, and the bank has debited the firm's account. Pass the entry the firm needs to make in its cash book.`,
    lines: [
      { accountId: debtor(who), side: 'Dr', amount: a },
      { accountId: 'bank', side: 'Cr', amount: a },
    ],
    explanation: [`${who} has not paid after all, so ${who} owes the firm again: the debtor's account is debited.`, 'The bank has taken the money back out of the account, so Bank A/c is credited.'],
    distractorAccounts: ['sales', 'cash'],
  };
});

// ---------------------------------------------------------------------------------------------------------------
// Sets of entries: "Pass the entries needed to bring the cash book up to date." The firm does so before it prepares
// the statement, with one entry for every item the pass book has and the cash book lacks, and one for every error in
// the cash book. Items that need no entry (cheques not yet presented or collected) are never part of a set. The
// entries are all made on the day of the reconciliation, so the items are lettered, not dated.
// ---------------------------------------------------------------------------------------------------------------

/** One item of a set, before it is given its letter. */
interface SetItem {
  text: string;
  lines: JournalLine[];
  explanation: string[];
}

const debit = (accountId: string, a: Paise): JournalLine => ({ accountId, side: 'Dr', amount: a });
const credit = (accountId: string, a: Paise): JournalLine => ({ accountId, side: 'Cr', amount: a });
const BANK_IN = 'The bank has added the amount to the account: Bank A/c, an asset, is debited.';
const BANK_OUT = 'The bank has taken the amount out of the account: Bank A/c, an asset, is credited.';

type PassKind = 'charges' | 'interest' | 'deposit' | 'dishonour' | 'standing' | 'dividend' | 'rent';
const PASS_KINDS: PassKind[] = ['charges', 'interest', 'deposit', 'dishonour', 'standing', 'dividend', 'rent'];
/** The kinds that can be told so that the amount of the entry has to be worked out. */
const WORKABLE: PassKind[] = ['charges', 'interest', 'deposit', 'standing'];

/**
 * An item the pass book shows and the cash book does not. `worked` asks for the form in which an amount has to be
 * worked out (two charges to add, interest from a rate, a discount, the loan part of an instalment). `name` gives a
 * party not yet used in the set.
 */
function passItem(rng: Rng, kind: PassKind, worked: boolean, name: () => string): SetItem {
  switch (kind) {
    case 'charges': {
      if (!worked) {
        const x = amount(rng, 100, 2500, 50);
        return { text: `The bank debited ${fmt(x)} as bank charges.`, lines: [debit('bankCharges', x), credit('bank', x)], explanation: ['Bank charges are an expense of the firm: Bank Charges A/c is debited.', BANK_OUT] };
      }
      const book = amount(rng, 100, 600, 50);
      const collection = amount(rng, 200, 1500, 50);
      const x = book + collection;
      return {
        text: `The bank debited ${fmt(book)} for a new cheque book and ${fmt(collection)} as charges for collecting outstation cheques.`,
        lines: [debit('bankCharges', x), credit('bank', x)],
        explanation: [`Both are charges made by the bank: ${fmt(book)} + ${fmt(collection)} = ${fmt(x)}.`, 'Bank charges are an expense of the firm: Bank Charges A/c is debited.', BANK_OUT],
      };
    }
    case 'interest': {
      if (!worked) {
        const x = amount(rng, 200, 4000, 50);
        return { text: `The bank credited ${fmt(x)} as interest on the balance in the account.`, lines: [debit('bank', x), credit('interestReceived', x)], explanation: [BANK_IN, 'Interest earned is an income: Interest Received A/c is credited.'] };
      }
      const deposit = amount(rng, 50000, 400000, 10000);
      const rate = rng.pick([6, 8]);
      const months = rng.pick([3, 6]);
      const x = (deposit * rate * months) / 1200;
      return {
        text: `The bank credited ${months === 3 ? 'three' : 'six'} months' interest at ${rate}% a year on the firm's fixed deposit of ${fmt(deposit)}.`,
        lines: [debit('bank', x), credit('interestReceived', x)],
        explanation: [`Interest = ${fmt(deposit)} × ${rate}% × ${months}/12 = ${fmt(x)}.`, BANK_IN, 'Interest earned is an income: Interest Received A/c is credited.'],
      };
    }
    case 'deposit': {
      const who = name();
      if (!worked) {
        const x = amount(rng, 2000, 25000, 500);
        return {
          text: `${who}, a customer who owed the firm money, paid ${fmt(x)} directly into the firm's bank account.`,
          lines: [debit('bank', x), credit(debtor(who), x)],
          explanation: [BANK_IN, `${who} has paid this much of what was owed: ${who} is credited.`],
        };
      }
      const due = amount(rng, 5000, 40000, 1000);
      const disc = (due * rng.pick([2, 5])) / 100;
      return {
        text: `${who}, a customer who owed ${fmt(due)}, paid ${fmt(due - disc)} directly into the firm's bank account in full settlement.`,
        lines: [debit('bank', due - disc), debit('discountAllowed', disc), credit(debtor(who), due)],
        explanation: [
          BANK_IN,
          `The account is settled in full, so the ${fmt(due)} - ${fmt(due - disc)} = ${fmt(disc)} left unpaid is a cash discount: Discount Allowed A/c, a loss, is debited.`,
          `${who} is credited with the whole ${fmt(due)}, which closes the account.`,
        ],
      };
    }
    case 'dishonour': {
      const who = name();
      const x = amount(rng, 1000, 20000, 500);
      return {
        text: `A cheque for ${fmt(x)} received from ${who}, a customer, and deposited earlier was returned unpaid, and the bank debited the account with it.`,
        lines: [debit(debtor(who), x), credit('bank', x)],
        explanation: [`The cheque was entered as a receipt when it was deposited. ${who} has not paid after all and owes the amount again: ${who} is debited.`, BANK_OUT],
      };
    }
    case 'standing': {
      if (worked) {
        const instalment = amount(rng, 5000, 20000, 500);
        const interest = amount(rng, 500, 2500, 100);
        const repaid = instalment - interest;
        return {
          text: `Under a standing instruction the bank paid the monthly instalment of ${fmt(instalment)} on the firm's bank loan; ${fmt(interest)} of it is interest and the rest repays the loan.`,
          lines: [debit('bankLoan', repaid), debit('interestPaid', interest), credit('bank', instalment)],
          explanation: [
            `Loan repaid = ${fmt(instalment)} - ${fmt(interest)} = ${fmt(repaid)}: Bank Loan A/c, a liability that falls, is debited.`,
            'Interest on the loan is an expense: Interest Paid A/c is debited.',
            BANK_OUT,
          ],
        };
      }
      const x = amount(rng, 1000, 9000, 100);
      const [acc, text, why] = rng.pick([
        ['insurance', `The bank paid the insurance premium of ${fmt(x)} on the firm's stock under a standing instruction.`, 'Insurance of the stock is an expense of the firm: Insurance A/c is debited.'],
        [
          'drawings',
          `The bank paid ${fmt(x)}, the premium on the proprietor's own life insurance policy, under a standing instruction.`,
          "The proprietor's life insurance is a personal expense, not one of the firm: Drawings A/c is debited.",
        ],
        ['electricity', `The bank paid the firm's electricity bill of ${fmt(x)} under a standing instruction.`, 'The electricity bill is an expense of the firm: Electricity A/c is debited.'],
      ] as const);
      return { text, lines: [debit(acc, x), credit('bank', x)], explanation: [why, BANK_OUT] };
    }
    case 'dividend': {
      const x = amount(rng, 500, 12000, 100);
      return {
        text: `The bank collected a dividend of ${fmt(x)} on shares the firm holds as an investment and credited it to the account.`,
        lines: [debit('bank', x), credit('dividendReceived', x)],
        explanation: [BANK_IN, 'Dividend is an income of the firm: Dividend Received A/c is credited.'],
      };
    }
    case 'rent': {
      const x = amount(rng, 3000, 15000, 500);
      return {
        text: `The tenant of the firm's spare godown paid the month's rent of ${fmt(x)} directly into the firm's bank account.`,
        lines: [debit('bank', x), credit('rentReceived', x)],
        explanation: [BANK_IN, 'Rent from letting the godown is an income: Rent Received A/c is credited.'],
      };
    }
  }
}

/** The three kinds of error in the cash book; each has a form for a cheque issued and one for a cheque received. */
type ErrorKind = 'amount' | 'side' | 'twice';
const ERROR_KINDS: ErrorKind[] = ['amount', 'side', 'twice'];

/**
 * An error in the bank column of the cash book, and the one entry that puts it right. The direction of every
 * correction follows the reconciling items above: a payment entered for too little or a receipt for too much leaves
 * the cash book balance too high, so the bank column is credited; the opposite errors are corrected by a debit.
 */
function errorItem(rng: Rng, kind: ErrorKind, name: () => string): SetItem {
  const who = name();
  const paid = rng.pick([true, false]);
  const party = paid ? creditor(who) : debtor(who);
  // `high` says the cash book balance is too high, so the correction credits the bank column and debits the party.
  const fix = (high: boolean, a: Paise): JournalLine[] => (high ? [debit(party, a), credit('bank', a)] : [debit('bank', a), credit(party, a)]);
  if (kind === 'amount') {
    const entered = amount(rng, 1000, 20000, 100);
    const a = amount(rng, 100, 5000, 100);
    const less = rng.pick([true, false]);
    const [actual, shown] = less ? [entered + a, entered] : [entered, entered + a];
    const high = paid === less;
    return {
      text: paid
        ? `A cheque for ${fmt(actual)} issued to ${who}, a supplier, was paid by the bank at that amount, but the firm had entered it in the cash book as ${fmt(shown)} and posted ${poss(who)} account with that figure.`
        : `A cheque for ${fmt(actual)} received from ${who}, a customer, was collected by the bank at that amount, but the firm had entered it in the cash book as ${fmt(shown)} and posted ${poss(who)} account with that figure.`,
      lines: fix(high, a),
      explanation: [
        `The ${paid ? 'payment' : 'receipt'} was entered ${fmt(a)} too ${less ? 'low' : 'high'}: ${fmt(Math.max(actual, shown))} - ${fmt(Math.min(actual, shown))} = ${fmt(a)}.`,
        `So the balance of the bank column is ${fmt(a)} too ${high ? 'high' : 'low'}: Bank A/c is ${high ? 'credited' : 'debited'} with the difference.`,
        `${who} was ${paid ? 'debited' : 'credited'} from the cash book with ${fmt(shown)} instead of ${fmt(actual)}, so ${who} is ${high ? 'debited' : 'credited'} with the same ${fmt(a)}.`,
      ],
    };
  }
  const x = amount(rng, 1000, 15000, 500);
  if (kind === 'side') {
    return {
      text: paid
        ? `A cheque for ${fmt(x)} issued to ${who}, a supplier, and paid by the bank was entered on the receipts (debit) side of the bank column, and posted from there to the credit of ${poss(who)} account.`
        : `A cheque for ${fmt(x)} received from ${who}, a customer, and collected by the bank was entered on the payments (credit) side of the bank column, and posted from there to the debit of ${poss(who)} account.`,
      lines: fix(paid, 2 * x),
      explanation: [
        paid
          ? `The entry added ${fmt(x)} to the bank column when ${fmt(x)} should have been taken off it, so the column is ${fmt(2 * x)} too high: ${fmt(x)} to cancel the wrong entry and ${fmt(x)} to record the payment.`
          : `The entry took ${fmt(x)} off the bank column when ${fmt(x)} should have been added to it, so the column is ${fmt(2 * x)} too low: ${fmt(x)} to cancel the wrong entry and ${fmt(x)} to record the receipt.`,
        `Bank A/c is ${paid ? 'credited' : 'debited'} with ${fmt(2 * x)}.`,
        paid
          ? `${who} was credited with ${fmt(x)} from the wrong entry and should have been debited with ${fmt(x)}: ${who} is debited with ${fmt(2 * x)}.`
          : `${who} was debited with ${fmt(x)} from the wrong entry and should have been credited with ${fmt(x)}: ${who} is credited with ${fmt(2 * x)}.`,
      ],
    };
  }
  return {
    text: paid
      ? `A cheque for ${fmt(x)} issued to ${who}, a supplier, was entered twice on the payments side of the bank column, and posted twice to ${poss(who)} account.`
      : `A cheque for ${fmt(x)} received from ${who}, a customer, and deposited was entered twice on the receipts side of the bank column, and posted twice to ${poss(who)} account.`,
    lines: fix(!paid, x),
    explanation: [
      `The second entry is one ${paid ? 'payment' : 'receipt'} too many, so the bank column is ${fmt(x)} too ${paid ? 'low' : 'high'}: Bank A/c is ${paid ? 'debited' : 'credited'} with ${fmt(x)}.`,
      paid
        ? `${who} was debited twice from the cash book and has been paid only once: ${who} is credited with ${fmt(x)}.`
        : `${who} was credited twice from the cash book and has paid only once: ${who} is debited with ${fmt(x)}.`,
    ],
  };
}

/** Every ₹ amount in a text, in order, in paise. */
const rupeesIn = (s: string): Paise[] => (s.match(/₹\d[\d,]*/g) ?? []).map((m) => Number(m.slice(1).replace(/,/g, '')) * 100);

/** A line an entry must have: the account (or, for a party, the kind of party), its side and its amount. */
type Want = [account: string, side: 'Dr' | 'Cr', amount: Paise];
const bankIn = (a: Paise, ...rest: Want[]): Want[] => [['bank', 'Dr', a], ...rest];
const bankOut = (a: Paise, ...rest: Want[]): Want[] => [['bank', 'Cr', a], ...rest];

/**
 * The independent check of the sets: what each item calls for, read again from its own words and figures. Exactly one
 * rule fits an item, and the entry must be the lines that rule gives.
 */
const SET_RULES: { fits: RegExp; error?: true; want: (m: Paise[], found: RegExpExecArray) => Want[] }[] = [
  { fits: /debited ₹[\d,]+ as bank charges\.$/, want: (m) => bankOut(m[0], ['bankCharges', 'Dr', m[0]]) },
  { fits: /for a new cheque book and ₹/, want: (m) => bankOut(m[0] + m[1], ['bankCharges', 'Dr', m[0] + m[1]]) },
  { fits: /as interest on the balance in the account\.$/, want: (m) => bankIn(m[0], ['interestReceived', 'Cr', m[0]]) },
  {
    fits: /credited (three|six) months' interest at (\d+)% a year/,
    want: (m, f) => {
      const x = (m[0] * Number(f[2]) * (f[1] === 'three' ? 3 : 6)) / 1200;
      return bankIn(x, ['interestReceived', 'Cr', x]);
    },
  },
  { fits: /a customer who owed the firm money, paid ₹[\d,]+ directly into/, want: (m) => bankIn(m[0], ['debtor:', 'Cr', m[0]]) },
  { fits: /directly into the firm's bank account in full settlement\.$/, want: (m) => bankIn(m[1], ['discountAllowed', 'Dr', m[0] - m[1]], ['debtor:', 'Cr', m[0]]) },
  { fits: /was returned unpaid/, want: (m) => bankOut(m[0], ['debtor:', 'Dr', m[0]]) },
  { fits: /monthly instalment of ₹[\d,]+ on the firm's bank loan/, want: (m) => bankOut(m[0], ['bankLoan', 'Dr', m[0] - m[1]], ['interestPaid', 'Dr', m[1]]) },
  { fits: /insurance premium of ₹[\d,]+ on the firm's stock/, want: (m) => bankOut(m[0], ['insurance', 'Dr', m[0]]) },
  { fits: /proprietor's own life insurance policy/, want: (m) => bankOut(m[0], ['drawings', 'Dr', m[0]]) },
  { fits: /the firm's electricity bill of/, want: (m) => bankOut(m[0], ['electricity', 'Dr', m[0]]) },
  { fits: /collected a dividend of/, want: (m) => bankIn(m[0], ['dividendReceived', 'Cr', m[0]]) },
  { fits: /paid the month's rent of/, want: (m) => bankIn(m[0], ['rentReceived', 'Cr', m[0]]) },
  // Errors. The cash book shows m[1] where the bank has m[0]: a payment short, or a receipt over, is too much in the bank column.
  {
    fits: /issued to .+, a supplier, was paid by the bank at that amount, but the firm had entered it in the cash book as ₹[\d,]+ and posted .+ account with that figure\.$/,
    error: true,
    want: (m) => (m[0] > m[1] ? bankOut(m[0] - m[1], ['creditor:', 'Dr', m[0] - m[1]]) : bankIn(m[1] - m[0], ['creditor:', 'Cr', m[1] - m[0]])),
  },
  {
    fits: /received from .+, a customer, was collected by the bank at that amount, but the firm had entered it in the cash book as ₹[\d,]+ and posted .+ account with that figure\.$/,
    error: true,
    want: (m) => (m[0] > m[1] ? bankIn(m[0] - m[1], ['debtor:', 'Cr', m[0] - m[1]]) : bankOut(m[1] - m[0], ['debtor:', 'Dr', m[1] - m[0]])),
  },
  { fits: /a supplier, and paid by the bank was entered on the receipts \(debit\) side of the bank column, and posted from there to the credit of /, error: true, want: (m) => bankOut(2 * m[0], ['creditor:', 'Dr', 2 * m[0]]) },
  { fits: /a customer, and collected by the bank was entered on the payments \(credit\) side of the bank column, and posted from there to the debit of /, error: true, want: (m) => bankIn(2 * m[0], ['debtor:', 'Cr', 2 * m[0]]) },
  { fits: /a supplier, was entered twice on the payments side of the bank column, and posted twice to /, error: true, want: (m) => bankIn(m[0], ['creditor:', 'Cr', m[0]]) },
  { fits: /a customer, and deposited was entered twice on the receipts side of the bank column, and posted twice to /, error: true, want: (m) => bankOut(m[0], ['debtor:', 'Dr', m[0]]) },
];

/** How many of the items are errors in the cash book, or null when any entry is not what its item calls for. */
function setErrors(q: JournalSetQuestion): number | null {
  let errors = 0;
  for (const e of q.entries) {
    const rules = SET_RULES.filter((r) => r.fits.test(e.text));
    if (rules.length !== 1) return null;
    const [rule] = rules;
    const want = rule.want(rupeesIn(e.text), rule.fits.exec(e.text)!);
    const has = ([account, side, a]: Want) =>
      e.expected.filter((l) => (account.endsWith(':') ? l.accountId.startsWith(account) : l.accountId === account) && l.side === side && l.amount === a).length === 1;
    if (e.expected.length !== want.length || !want.every(has)) return null;
    if (rule.error) errors++;
  }
  return errors;
}

const SET_TASK = 'Pass the entries needed to bring the cash book up to date.';
const SET_OPENING = (firm: string, date: string, month: string) =>
  `Before preparing its bank reconciliation statement on ${date}, ${firm} compared the bank column of its cash book with the pass book for ${month}.`;
const SET_ONLY = 'Only the items that need an entry are listed: cheques issued but not yet presented and cheques deposited but not yet collected need none.';
const SET_HINTS = [
  'Take the items one at a time. Because of this item, is the bank balance in the cash book too high or too low?',
  'Bank A/c is debited when its balance has to rise and credited when it has to fall. The other account is the party, the income or the expense the item names.',
];

/** The items with their letters. Every entry is made on the day of the reconciliation, so the items carry no dates. */
const lettered = (items: SetItem[]) => items.map((item, i) => ({ label: `(${'abcdefgh'[i]})`, ...item }));

/** Names for the parties of a set, each given out once, so that no name is a customer in one item and a supplier in another. */
const freshNames = (rng: Rng): (() => string) => {
  const left = rng.shuffle(PARTIES);
  return () => left.pop()!;
};

// 1. Items the pass book shows and the cash book does not.
const setPassBookItems = journalSetTemplate({
  id: 'brs-set-pass-book-items',
  topicId: T,
  conceptId: 'brs-sets',
  difficulty: 'medium',
  generate: (rng) => {
    const firm = rng.pick(FIRMS);
    const date = rng.pick(DATES);
    const month = date.split(' ')[1];
    const name = freshNames(rng);
    const kinds = rng.shuffle(PASS_KINDS).slice(0, rng.pick([4, 5]));
    // One amount at least is to be worked out; any other that can be is, one time in three.
    const must = rng.pick(kinds.filter((k) => WORKABLE.includes(k)));
    const items = kinds.map((k) => passItem(rng, k, k === must || (WORKABLE.includes(k) && rng.int(1, 3) === 1), name));
    return {
      task: SET_TASK,
      opening: `${SET_OPENING(firm, date, month)} The pass book shows the items below, and none of them is in the cash book yet. ${SET_ONLY}`,
      transactions: lettered(items),
      hints: SET_HINTS,
      // What a student wrongly reaches for: Insurance for the proprietor's own premium, Bad Debts for a dishonoured cheque, Sales for a customer's deposit.
      distractorAccounts: ['cash', 'insurance', 'drawings', 'badDebts', 'sales', 'interestPaid'],
    };
  },
  verify: (q) => setErrors(q) === 0,
});

// 2. The same, with errors in the cash book among them.
const setWithErrors = journalSetTemplate({
  id: 'brs-set-with-errors',
  topicId: T,
  conceptId: 'brs-sets',
  difficulty: 'complex',
  generate: (rng) => {
    const firm = rng.pick(FIRMS);
    const date = rng.pick(DATES);
    const month = date.split(' ')[1];
    const name = freshNames(rng);
    const errorKinds = rng.shuffle(ERROR_KINDS).slice(0, rng.pick([2, 3]));
    const passKinds = rng.shuffle(PASS_KINDS).slice(0, rng.int(6 - errorKinds.length, 5));
    const items = rng.shuffle([
      ...passKinds.map((k) => passItem(rng, k, WORKABLE.includes(k) && rng.int(1, 3) === 1, name)),
      ...errorKinds.map((k) => errorItem(rng, k, name)),
    ]);
    return {
      task: SET_TASK,
      opening:
        `${SET_OPENING(firm, date, month)} It found the items below: some are in the pass book alone, and the others are errors in the bank column of the cash book. ` +
        `${SET_ONLY} The ledger had been posted from the cash book as it stood, so each error is put right by one entry, in Bank A/c and in the account that was posted wrongly.`,
      transactions: lettered(items),
      hints: SET_HINTS,
      // Suspense and the discount accounts are where a difference is wrongly parked; Bad Debts and Insurance as in the first set.
      distractorAccounts: ['cash', 'suspense', 'discountAllowed', 'discountReceived', 'badDebts', 'insurance', 'drawings'],
    };
  },
  verify: (q) => (setErrors(q) ?? 0) >= 2,
});

// ---------------------------------------------------------------------------------------------------------------
// Formats: the statement itself, with Plus and Minus columns, and the amended cash book.
//
// One layout serves every starting point. A favourable balance stands in the Plus column and an overdraft in the
// Minus column. An item goes in the Plus column when it makes the balance of the book the statement ends on more
// favourable than the balance of the book it starts from, and in the Minus column when it makes it less favourable.
// The statement ends on the difference of the two columns: a favourable balance when the Plus column is the larger,
// an overdraft when the Minus column is. From a favourable balance this is the "add" and "deduct" of the cards. From
// an overdraft, an item in the Plus column is one the cards deduct from the overdraft (it reduces it), and an item in
// the Minus column is one they add to it. Every direction comes from the `sign` of the item, as everywhere above.
// ---------------------------------------------------------------------------------------------------------------

const F_CONCEPT = 'brs-formats';
const BRS_COLUMNS = ['Plus (₹)', 'Minus (₹)'];

/** The day a statement is drawn up on: the last day of a month, and the month that follows it. */
interface Closing {
  /** "31 March 2026" */
  date: string;
  /** "31 March" */
  day: string;
  last: number;
  month: string;
  next: string;
}
const CLOSINGS: Closing[] = [
  { date: '31 March 2026', day: '31 March', last: 31, month: 'March', next: 'April' },
  { date: '30 June 2026', day: '30 June', last: 30, month: 'June', next: 'July' },
  { date: '30 September 2026', day: '30 September', last: 30, month: 'September', next: 'October' },
  { date: '31 December 2025', day: '31 December', last: 31, month: 'December', next: 'January' },
];

/** Names for the parties of a format, each given out once: nobody is a customer in one item and a supplier in another. */
const FORMAT_NAMES = [...PARTIES, 'Verma & Sons', 'Nisha Traders', 'Joseph', 'Patel Agencies'];
const formatNames = (rng: Rng): (() => string) => {
  const left = rng.shuffle(FORMAT_NAMES);
  return () => left.pop()!;
};

/** The first row of a statement and the figure it ends on: a favourable balance or an overdraft as per a book. */
const brsBalanceLabel = (book: Book, signed: Paise): string => (signed > 0 ? `Balance as per ${bookName(book)} (favourable)` : `Overdraft as per ${bookName(book)}`);
/** An amount in the Plus column or in the Minus column. */
const inColumns = (plus: boolean, a: Paise): Paise[] => (plus ? [a, 0] : [0, a]);
/** True when the item makes the balance of the book the statement ends on more favourable than that of the book it starts from. */
const inPlus = (from: Book, i: Item): boolean => (from === 'cb' ? i.kind.sign : -i.kind.sign) > 0;
const addUp = (xs: readonly Paise[]): Paise => xs.reduce((t, x) => t + x, 0);

const BRS_FORMAT_HINTS = [
  'Take the items one at a time. Which book already has the item, and is the balance of the other book more favourable or less favourable because of it?',
  'An item that makes the balance of the book you are working towards more favourable goes in the Plus column; one that makes it less favourable goes in the Minus column. A favourable balance starts in the Plus column and an overdraft in the Minus column.',
];
const BRS_OVERDRAFT_HINTS = [
  BRS_FORMAT_HINTS[0],
  'The overdraft stands in the Minus column. An item that makes the balance of the book you are working towards more favourable reduces the overdraft: Plus column. One that makes it less favourable adds to the overdraft: Minus column. Then compare the totals of the two columns: the statement ends on an overdraft if the Minus column is the larger, and on a favourable balance if the Plus column is. Name it accordingly.',
];

// -- 1. brs-fmt-timing: from the cash book balance, with cheques not yet presented or cleared (easy) ---------------

interface Cheque {
  /** Issued by the firm (true) or deposited by it (false). */
  issued: boolean;
  day: number;
  who: string;
  amount: Paise;
  /** Still to be paid or collected by the bank on the closing date. */
  out: boolean;
  /** The day the bank paid or collected it: "28 March", "3 April". */
  dealt: string;
}
/** The row of one cheque that the pass book does not yet show. */
const chequeLabel = (issued: boolean, who: string): string => (issued ? `Cheque to ${who}, issued but not yet presented` : `Cheque from ${who}, deposited but not yet cleared`);

const fmtTiming = statementTemplate({
  id: 'brs-fmt-timing',
  topicId: T,
  conceptId: F_CONCEPT,
  difficulty: 'easy',
  generate: (rng) => {
    const firm = rng.pick(FIRMS);
    const c = rng.pick(CLOSINGS);
    const start0 = amount(rng, 10000, 80000, 1000);
    const name = formatNames(rng);
    // Five to seven cheques of the last days of the month, two at least of each kind. Every cheque is listed with the
    // day the bank dealt with it, and each cheque that is outstanding on the closing date has a row of its own.
    const nIssued = rng.int(2, 4);
    const kinds = rng.shuffle([...Array<boolean>(nIssued).fill(true), ...Array<boolean>(rng.int(Math.max(2, 5 - nIssued), 7 - nIssued)).fill(false)]);
    const ds = setDays(rng, kinds.length, c.last - 11, c.last);
    // A cheque of the last two days cannot have reached the bank's books by the closing date.
    const cheques: Cheque[] = kinds.map((issued, i) => ({ issued, day: ds[i], who: name(), amount: amount(rng, 2000, 20000, 500), out: ds[i] >= c.last - 1 || rng.next() < 0.5, dealt: '' }));
    if (new Set(cheques.map((q) => q.amount)).size !== cheques.length) return null;
    const outOf = (issued: boolean) => cheques.filter((q) => q.issued === issued && q.out);
    const outCount = () => cheques.filter((q) => q.out).length;
    // Each kind has a cheque that is still outstanding.
    for (const side of [true, false]) {
      const mine = cheques.filter((q) => q.issued === side);
      if (!mine.some((q) => q.out)) mine[mine.length - 1].out = true;
    }
    // Three to five cheques are outstanding (the later ones first), so the statement has four to six rows...
    while (outCount() < 3) [...cheques].reverse().find((q) => !q.out)!.out = true;
    // ...and one cheque at least is in both books already: the earliest that its kind can spare.
    while (outCount() > Math.min(5, cheques.length - 1)) {
      const spare = cheques.find((q) => q.out && q.day < c.last - 1 && outOf(q.issued).length > 1);
      if (!spare) return null;
      spare.out = false;
    }
    for (const q of cheques) q.dealt = q.out ? `${rng.int(1, 6)} ${c.next}` : `${rng.int(q.day + 1, c.last - 1)} ${c.month}`;
    const out = cheques.filter((q) => q.out);
    const settled = cheques.filter((q) => !q.out);
    const sumOut = (issued: boolean) => addUp(outOf(issued).map((q) => q.amount));
    if (sumOut(true) === sumOut(false)) return null;
    // The cash book balance is large enough for the pass book to show a favourable balance too.
    const start = start0 + sumOut(false);
    const end = start + sumOut(true) - sumOut(false);
    const plus = start + sumOut(true);
    const minus = sumOut(false);
    const lines = cheques.map((q) =>
      q.issued
        ? `• ${q.day} ${c.month}: issued a cheque for ${fmt(q.amount)} to ${q.who}; the bank paid it on ${q.dealt}`
        : `• ${q.day} ${c.month}: deposited a cheque for ${fmt(q.amount)} received from ${q.who}; the bank collected it on ${q.dealt}`,
    );
    return {
      task:
        `Prepare the Bank Reconciliation Statement of ${firm} as on ${c.date}, starting from the balance as per cash book. ` +
        `Enter what is added in the Plus column and what is deducted in the Minus column, with a line of its own for each cheque that the bank had not yet paid or collected.`,
      data:
        `On ${c.date}, the cash book (bank column) of ${firm} shows a favourable balance (a debit balance) of ${fmt(start)}. ` +
        `The firm enters a cheque in its cash book on the day it issues or deposits it; the bank enters it in the pass book on the day it pays or collects it. ` +
        `Nothing else keeps the two books apart. These are the cheques of the last days of ${c.month}:\n${lines.join('\n')}`,
      title: `Bank Reconciliation Statement of ${firm} as on ${c.date}`,
      columns: BRS_COLUMNS,
      rows: [{ label: brsBalanceLabel('cb', start), amounts: [start, 0] }, ...out.map((q) => ({ label: chequeLabel(q.issued, q.who), amounts: inColumns(q.issued, q.amount) }))],
      final: { label: brsBalanceLabel('pb', end), amount: end },
      // A cheque the bank dealt with in time is on offer: entering it is the slip.
      distractors: [brsBalanceLabel('cb', -start), ...settled.map((q) => chequeLabel(q.issued, q.who)), charges.label],
      explanation: [
        `The statement starts from the favourable balance as per cash book: ${fmt(start)} in the Plus column.`,
        ...out.map((q) =>
          q.issued
            ? `Cheque to ${q.who}, ${fmt(q.amount)}: the bank paid it on ${q.dealt}, after ${c.day}. The cash book has deducted it and the pass book has not, so the pass book balance is higher: the cheque is added, in the Plus column.`
            : `Cheque from ${q.who}, ${fmt(q.amount)}: the bank collected it on ${q.dealt}, after ${c.day}. The cash book has added it and the pass book has not, so the pass book balance is lower: the cheque is deducted, in the Minus column.`,
        ),
        `Left out: ${settled.map((q) => `the cheque ${q.issued ? 'to' : 'from'} ${q.who}, ${q.issued ? 'paid' : 'collected'} on ${q.dealt}`).join('; ')}. Both books show ${settled.length > 1 ? 'them' : 'it'} on ${c.day}.`,
        `Plus column ${fmt(plus)}, Minus column ${fmt(minus)}: balance as per pass book = ${fmt(plus)} - ${fmt(minus)} = ${fmt(end)}, a favourable balance.`,
      ],
      hints: [
        'Look at the day the bank paid or collected each cheque. Which cheques had the bank not yet dealt with on the closing date? Only those keep the two books apart.',
        'A cheque issued but not yet presented is still in the bank, so the pass book balance is higher: Plus column. A cheque deposited but not yet cleared is not yet in the bank, so the pass book balance is lower: Minus column.',
      ],
    };
  },
  // Read back from the data the student sees: the cheques the bank dealt with only after the closing date, each on its row.
  verify: (q: StatementQuestion) => {
    const [head, ...lines] = q.data.split('\n');
    const c = CLOSINGS.find((x) => head.startsWith(`On ${x.date},`));
    const [start] = rupeesIn(head);
    if (!c || !q.final || !(start > 0) || lines.length < 5 || q.columns.join() !== BRS_COLUMNS.join()) return false;
    const want = [`${brsBalanceLabel('cb', start)}|${start}|0`];
    let end = start;
    for (const line of lines) {
      const one = /^• (\d+) (\w+): (issued a cheque for ₹[\d,]+ to|deposited a cheque for ₹[\d,]+ received from) (.+); the bank (paid|collected) it on (\d+) (\w+)$/.exec(line);
      if (!one) return false;
      const [, day, month, what, who, verb, dealtDay, dealtMonth] = one;
      const plus = what.startsWith('issued');
      const [a] = rupeesIn(line);
      // The cheque is of the month of the statement; the bank dealt with it later, in that month (before its last day) or in the next.
      if (month !== c.month || plus !== (verb === 'paid') || (dealtMonth !== c.next && dealtMonth !== c.month)) return false;
      if (dealtMonth === c.month && !(Number(dealtDay) > Number(day) && Number(dealtDay) < c.last)) return false;
      // A cheque counts when the bank dealt with it in the month after.
      if (dealtMonth !== c.next) continue;
      want.push(`${chequeLabel(plus, who)}|${plus ? `${a}|0` : `0|${a}`}`);
      end += plus ? a : -a;
    }
    return (
      want.length >= 4 &&
      q.rows.length === want.length &&
      want.every((w) => q.rows.some((r) => `${r.label}|${r.amounts.join('|')}` === w)) &&
      q.final.label === brsBalanceLabel('pb', 1) &&
      q.final.amount === end
    );
  },
});

// -- 2 to 5. A statement from a balance and a list of items --------------------------------------------------------

/** A cheque entered on the wrong side of the bank column: the cash book is out by twice the cheque. `a` is that amount. */
const cbPayOnReceipts: Kind = {
  id: 'cbPayOnReceipts', group: 'cbRecord', sign: -1, inCb: true, inPb: true, action: 'enter',
  label: 'Cheque issued, entered on the receipts side of the cash book',
  short: 'a cheque issued and paid by the bank but entered on the receipts side of the cash book',
  range: [2000, 24000, 1000],
  fact: (_x, p, a) => `A cheque for ${fmt(a / 2)} issued to ${p} and paid by the bank was entered on the receipts (debit) side of the bank column of the cash book.`,
  reason: 'The cash book added the cheque when it should have taken it off, so the cash book balance is too high by twice the amount of the cheque.',
  mistake: 'Thought that a payment entered as a receipt makes the cash book balance too low.',
};

const cbRecOnPayments: Kind = {
  id: 'cbRecOnPayments', group: 'cbRecord', sign: 1, inCb: true, inPb: true, action: 'enter',
  label: 'Cheque received, entered on the payments side of the cash book',
  short: 'a cheque received and collected by the bank but entered on the payments side of the cash book',
  range: [2000, 24000, 1000],
  fact: (_x, p, a) => `A cheque for ${fmt(a / 2)} received from ${p}, deposited and collected by the bank, was entered on the payments (credit) side of the bank column of the cash book.`,
  reason: 'The cash book took the cheque off when it should have added it, so the cash book balance is too low by twice the amount of the cheque.',
  mistake: 'Thought that a receipt entered as a payment makes the cash book balance too high.',
};
const WRONG_SIDE = [cbPayOnReceipts, cbRecOnPayments];
/** Each error of the cash book and the same error the other way round. */
const MIRROR = new Map<Kind, Kind>(
  [
    [cbPayUnder, cbPayOver],
    [cbRecUnder, cbRecOver],
    [cbPayLess, cbPayMore],
    [cbRecLess, cbRecMore],
    [cbPayOnReceipts, cbRecOnPayments],
  ].flatMap(([a, b]) => [
    [a, b],
    [b, a],
  ]),
);

/** An item of a format: its amount and its statement, with a name of its own. */
const formatItem = (rng: Rng, kind: Kind, who: string): Item => {
  const a = amount(rng, ...kind.range);
  const fact = kind.fact(fmt(a), who, a, rng);
  return { kind, amount: a, fact, text: fact };
};

/**
 * The particulars of an item's row. The label never says how the amount of an error is found (as the difference of
 * two figures, as twice the cheque): that is the student's to work out, and the solution shows it under the row.
 */
const rowLabel = (k: Kind): string => k.label.replace(/ \(difference\)$/, '');

/** How the amount of an item is worked out, when the data does not state it: shown under its row in the solution. */
function itemWorking(i: Item): string | null {
  if (WRONG_SIDE.includes(i.kind)) return `2 × ${fmt(i.amount / 2)}`;
  if (RECORD.includes(i.kind)) {
    const [x, y] = rupeesIn(i.fact);
    return `${fmt(Math.max(x, y))} - ${fmt(Math.min(x, y))}`;
  }
  return null;
}

/** What a statement is made from: the book and the balance it starts from, and the items in the order they are listed. */
interface BrsScene {
  firm: string;
  closing: Closing;
  from: Book;
  /** Signed: positive is favourable, negative an overdraft. */
  start: Paise;
  /** Every item listed, with any that both books already show. */
  items: Item[];
}
const keptBrs = keepFor<BrsScene>();

interface BrsPlan {
  from: Book;
  overdraft: boolean;
  /** The items that keep the two balances apart. */
  kinds: Kind[];
  /** Also list a cheque that both books already show. */
  decoy?: boolean;
  /** Start from an overdraft small enough for the items to turn it into a favourable balance, when they can. */
  cross?: boolean;
  /** Items a student might wrongly enter, in order: the labels of the first three the statement does not have are offered. */
  lures: Kind[];
}

/** The statement a scene gives. Null when the two balances would be equal or the statement would end on nothing. */
function brsStatement(s: BrsScene, lures: Kind[]): StatementParts | null {
  const to = otherBook(s.from);
  const real = live(s.items);
  const end = reconcile(s.from, s.start, s.items);
  if (end === 0 || end === s.start) return null;
  const size = Math.abs(s.start);
  const overdraft = s.start < 0;
  const rows: FormatRowParts[] = [
    { label: brsBalanceLabel(s.from, s.start), amounts: inColumns(!overdraft, size) },
    ...real.map((i) => {
      const working = itemWorking(i);
      return { label: rowLabel(i.kind), amounts: inColumns(inPlus(s.from, i), i.amount), ...(working ? { details: [working] } : {}) };
    }),
  ];
  const plus = addUp(rows.map((r) => r.amounts![0] ?? 0));
  const minus = addUp(rows.map((r) => r.amounts![1] ?? 0));
  const hasErrors = real.some((i) => itemWorking(i) !== null);
  const startWords = overdraft ? `the overdraft as per ${bookName(s.from)}` : `the balance as per ${bookName(s.from)}`;
  const endWords = to === 'cb' ? ' and ending on the balance the cash book shows before it is amended' : '';
  // From a favourable balance the two columns are the "add" and the "deduct" of the cards. From an overdraft the
  // layout is stated in the task and, in full, in the data.
  const how = overdraft
    ? 'Show an overdraft in the Minus column, and name what the statement ends on: a favourable balance or an overdraft.'
    : 'Enter what is added in the Plus column and what is deducted in the Minus column.';
  const layout = overdraft
    ? ' In the statement, show an overdraft in the Minus column: what reduces the overdraft goes in the Plus column and what adds to it goes in the Minus column, ' +
      'and the statement ends on the difference of the two columns.'
    : '';
  const data =
    `On ${s.closing.date}, the ${bookWithColumn(s.from)} of ${s.firm} shows ${an(natureWord(s.from, s.start, 'plain'))} (${an(natureWord(s.from, s.start, 'drcr'))}) of ${fmt(size)}. ` +
    `On comparing it with the ${bookName(to)}, the firm noted the following. It has not yet made any entry or correction in its cash book for any of them.${layout}\n` +
    s.items.map((it, i) => `(${ROMAN[i]}) ${it.fact}`).join('\n');
  const used = new Set(real.map((i) => i.kind));
  keptBrs.keep(data, s);
  // The same statement in the Add and Less form of the cards: what is added to the overdraft and what is deducted from it.
  const added = addUp(real.filter((i) => !inPlus(s.from, i)).map((i) => i.amount));
  const deducted = addUp(real.filter((i) => inPlus(s.from, i)).map((i) => i.amount));
  const addAndLess =
    end < 0
      ? `In the Add and Less form the answer is the same: overdraft ${fmt(size)}${added > 0 ? ` + ${fmt(added)} added` : ''}${deducted > 0 ? ` - ${fmt(deducted)} deducted` : ''} = an overdraft of ${fmt(-end)}.`
      : `In the Add and Less form the answer is the same: overdraft ${fmt(size)}${added > 0 ? ` + ${fmt(added)} added = ${fmt(size + added)}` : ''}; the ${fmt(deducted)} deducted is ${fmt(end)} more than that, so the overdraft turns into a favourable balance of ${fmt(end)}.`;
  return {
    task: `Prepare the Bank Reconciliation Statement of ${s.firm} as on ${s.closing.date}, starting from ${startWords}${endWords}. ${how}${hasErrors ? ' For an error, enter the amount by which it puts the cash book balance out.' : ''}`,
    data,
    title: `Bank Reconciliation Statement of ${s.firm} as on ${s.closing.date}`,
    columns: BRS_COLUMNS,
    rows,
    // From an overdraft the statement may end on either side of nil, so the student names what it ends on as well.
    final: { label: brsBalanceLabel(to, end), amount: Math.abs(end), ...(overdraft ? { alternatives: [brsBalanceLabel(to, -end)] } : {}) },
    // The other nature of the opening balance, a cheque both books show, and items this statement does not have.
    distractors: [brsBalanceLabel(s.from, -s.start), ...s.items.filter((i) => i.kind.sign === 0).map((i) => rowLabel(i.kind)), ...lures.filter((k) => !used.has(k)).slice(0, 3).map(rowLabel)],
    explanation: [
      overdraft
        ? `An overdraft is a negative balance, so the overdraft as per ${bookName(s.from)}, ${fmt(size)}, stands in the Minus column. Every item then takes the column it would take from a favourable balance. ` +
          `An item in the Plus column reduces the overdraft: the Add and Less form of the statement deducts it from the overdraft. An item in the Minus column adds to the overdraft: that form adds it.`
        : `The statement starts from the favourable balance as per ${bookName(s.from)}: ${fmt(size)} in the Plus column.`,
      ...s.items.map((i) => {
        if (i.kind.sign === 0) return `${rowLabel(i.kind)}: ${i.kind.reason} It is left out of the statement.`;
        const up = inPlus(s.from, i);
        const working = itemWorking(i);
        const column = overdraft
          ? up
            ? 'Plus column (deducted from the overdraft)'
            : 'Minus column (added to the overdraft)'
          : up
            ? 'it is added, in the Plus column'
            : 'it is deducted, in the Minus column';
        return `${rowLabel(i.kind)}, ${working ? `${working} = ` : ''}${fmt(i.amount)}: ${i.kind.reason} So the ${bookName(to)} balance is ${up ? 'more' : 'less'} favourable than the ${bookName(s.from)} balance: ${column}.`;
      }),
      overdraft
        ? `Plus column ${fmt(plus)}, Minus column ${fmt(minus)}. The ${plus > minus ? 'Plus' : 'Minus'} column is larger by ${fmt(Math.abs(end))}, so the statement ends on ${
            end > 0 ? 'a favourable balance, not on an overdraft' : 'an overdraft'
          }: "${brsBalanceLabel(to, end)}" ${fmt(Math.abs(end))}.${end > 0 ? ' The items have turned the overdraft into a favourable balance.' : ''}`
        : `Plus column ${fmt(plus)}, Minus column ${fmt(minus)}. The ${plus > minus ? 'Plus' : 'Minus'} column is larger by ${fmt(Math.abs(end))}: ${end > 0 ? 'a favourable balance' : 'an overdraft'} as per ${bookName(to)} of ${fmt(Math.abs(end))}${
            natureOf(end) !== natureOf(s.start) ? ', so the favourable balance has turned into an overdraft' : ''
          }.`,
      ...(overdraft ? [addAndLess] : []),
    ],
    hints: overdraft ? BRS_OVERDRAFT_HINTS : BRS_FORMAT_HINTS,
  };
}

/**
 * The independent check of a statement: the textbook running total in the opening balance's own terms (add and
 * deduct, turned round for an overdraft) must end where the statement ends, working back from there must give the
 * opening balance, and every item must stand in the column that item alone would move a nil balance to.
 */
function brsHolds(q: StatementQuestion): boolean {
  const s = keptBrs.of(q.data);
  if (!s || !q.final || q.columns.join() !== BRS_COLUMNS.join()) return false;
  const to = otherBook(s.from);
  const end = textbook(s.from, s.start, s.items);
  if (end === 0 || reconcile(to, end, s.items) !== s.start) return false;
  if (q.final.amount !== Math.abs(end) || q.final.label !== brsBalanceLabel(to, end)) return false;
  // From an overdraft the student chooses between the two names of the closing figure, and the task asks for it; from
  // a favourable balance, which these statements never turn into an overdraft, the name is given.
  const names = [brsBalanceLabel(to, 1), brsBalanceLabel(to, -1)].sort().join('|');
  if (s.start < 0 ? [...(q.final.options ?? [])].sort().join('|') !== names || !q.prompt.includes('name what the statement ends on') : q.final.options !== undefined || end < 0) return false;
  const real = live(s.items);
  const at = (plus: boolean) => (plus ? 0 : 1);
  const opening = q.rows.filter((r) => r.label === brsBalanceLabel(s.from, s.start));
  if (q.rows.length !== real.length + 1 || opening.length !== 1) return false;
  if (opening[0].amounts[at(s.start > 0)] !== Math.abs(s.start) || opening[0].amounts[at(s.start < 0)] !== 0) return false;
  if (rupeesIn(q.data)[0] !== Math.abs(s.start) || !q.data.includes(s.start > 0 ? 'favourable balance' : 'an overdraft')) return false;
  // A statement that starts from an overdraft says where the overdraft stands, in the task and in the data.
  if (s.start < 0 && !(q.prompt.includes('overdraft in the Minus column') && q.data.includes('overdraft in the Minus column'))) return false;
  // The data never says which way the closing figure falls: that is part of the answer.
  if (/ends on (a favourable balance|an overdraft)|turns? into/.test(q.data)) return false;
  return real.every((i) => {
    const row = q.rows.filter((r) => r.label === rowLabel(i.kind));
    const plus = reconcile(s.from, 0, [i]) > 0;
    // The figure of the row is in the data: as it stands, as half of it (a cheque on the wrong side) or as the gap between two figures.
    const figures = rupeesIn(i.fact);
    const shown = figures.includes(i.amount) || figures.includes(i.amount / 2) || Math.abs(figures[0] - figures[1]) === i.amount;
    return row.length === 1 && row[0].amounts[at(plus)] === i.amount && row[0].amounts[at(!plus)] === 0 && shown && q.data.includes(i.fact);
  });
}

function brsFormat(o: { id: string; difficulty: Difficulty; version?: number; plan(rng: Rng): BrsPlan }) {
  return statementTemplate({
    id: o.id,
    ...(o.version ? { version: o.version } : {}),
    topicId: T,
    conceptId: F_CONCEPT,
    difficulty: o.difficulty,
    generate: (rng) => {
      const plan = o.plan(rng);
      const firm = rng.pick(FIRMS);
      const closing = rng.pick(CLOSINGS);
      const name = formatNames(rng);
      const real = plan.kinds.map((k) => formatItem(rng, k, name()));
      // What the items do to the balance of the book the statement ends on.
      const net = (plan.from === 'cb' ? 1 : -1) * sumEffect(real);
      const safe = sumAbs(real) + amount(rng, 5000, 60000, 1000);
      let start = plan.overdraft ? -safe : safe;
      if (plan.overdraft && plan.cross && net >= rupees(4000)) start = -rupees(rng.step(1000, Math.floor((net / 100 - 2000) / 1000) * 1000, 1000));
      const drawn = rng.shuffle([...real, ...(plan.decoy ? [formatItem(rng, cleared, name())] : [])]);
      const items = start < 0 || reconcile(plan.from, start, drawn) < 0 ? noInterestOnOverdraft(drawn) : drawn;
      return brsStatement({ firm, closing, from: plan.from, start, items }, plan.lures);
    },
    verify: brsHolds,
  });
}

const some = <X>(rng: Rng, pool: readonly X[], min: number, max: number): X[] => rng.shuffle([...pool]).slice(0, rng.int(min, max));

// 2. From a favourable cash book balance, with the items the bank recorded first as well (medium).
const fmtBankItems = brsFormat({
  id: 'brs-fmt-bank-items',
  difficulty: 'medium',
  plan: (rng) => ({ from: 'cb', overdraft: false, kinds: rng.shuffle([...some(rng, TIMING, 1, 2), ...some(rng, BANK, 3, 4)]), lures: rng.shuffle(BASIC) }),
});

// 3. From a favourable pass book balance to the balance the cash book shows (medium).
const fmtFromPassBook = brsFormat({
  id: 'brs-fmt-from-pass-book',
  difficulty: 'medium',
  // The items are drawn in another order than for the statement from the cash book, so that a seed does not give both the same list.
  plan: (rng) => ({ from: 'pb', overdraft: false, lures: rng.shuffle(BASIC), kinds: rng.shuffle([...some(rng, BANK, 3, 4), ...some(rng, TIMING, 1, 2)]) }),
});

// 4. From an overdraft in either book; in some seeds the items turn it into a favourable balance (complex).
const fmtOverdraft = brsFormat({
  id: 'brs-fmt-overdraft',
  version: 2,
  difficulty: 'complex',
  plan: (rng) => ({
    from: rng.pick(['cb', 'pb'] as const),
    overdraft: true,
    cross: rng.next() < 0.6,
    decoy: rng.next() < 0.4,
    kinds: rng.shuffle([...some(rng, TIMING, 1, 2), ...some(rng, BANK, 3, 4)]),
    lures: rng.shuffle(BASIC),
  }),
});

// 5. With errors among the items: a wrong amount, a wrong side, a casting error, and sometimes an error of the bank (complex).
const fmtErrors = brsFormat({
  id: 'brs-fmt-errors',
  difficulty: 'complex',
  plan: (rng) => {
    const errors = some(rng, [RECORD, CAST, WRONG_SIDE], 2, 3).map((group) => rng.pick(group));
    const bankError = rng.next() < 0.3 ? [rng.pick(BANK_ERR)] : [];
    return {
      from: rng.next() < 0.65 ? 'cb' : 'pb',
      overdraft: false,
      kinds: rng.shuffle([...errors, ...bankError, ...some(rng, TIMING, 1, 2), ...some(rng, BANK, 1, 2)]),
      // The same error the other way round is the label a student wrongly reaches for.
      lures: [...errors.map((k) => MIRROR.get(k)!), ...rng.shuffle(BANK_ERR)],
    };
  },
});

// -- 6. brs-fmt-amended-cash-book: the bank column brought up to date, as an account (medium) ----------------------

interface AmendScene {
  /** The balance the cash book showed, signed. */
  start: Paise;
  /** The entries the cash book needs. */
  entries: DatedEntry[];
  /** The items that need no entry: they stay in the statement. */
  stay: Item[];
}
const keptAmended = keepFor<AmendScene>();

const fmtAmended = accountTemplate({
  id: 'brs-fmt-amended-cash-book',
  topicId: T,
  conceptId: F_CONCEPT,
  difficulty: 'medium',
  generate: (rng) => {
    const firm = rng.pick(FIRMS);
    const c = rng.pick(CLOSINGS);
    const name = formatNames(rng);
    const overdraft = rng.next() < 0.25;
    // An overdrawn account earns no interest on its balance.
    const withError = rng.next() < 0.4;
    // Four or five entries in all, so the account has six or seven rows with its two balances.
    const passKinds = some(rng, PASS_KINDS.filter((k) => !(overdraft && k === 'interest')), withError ? 3 : 4, withError ? 4 : 5);
    const adj: SetItem[] = passKinds.map((k) => passItem(rng, k, false, name));
    if (withError) adj.push(errorItem(rng, rng.pick(ERROR_KINDS), name));
    const stay = [...some(rng, TIMING, 1, 2), ...(rng.next() < 0.4 ? [rng.pick(BANK_ERR)] : [])].map((k) => formatItem(rng, k, name()));
    const entries: DatedEntry[] = adj.map((a) => ({ date: c.day, lines: a.lines }));
    const moves = entries.flatMap((e) => e.lines.filter((l) => l.accountId === 'bank'));
    const size = addUp(moves.map((l) => l.amount)) + amount(rng, 5000, 60000, 1000);
    const start = overdraft ? -size : size;
    const opening: OpeningBalance = { date: c.day, side: start > 0 ? 'Dr' : 'Cr', amount: size };
    const view = accountOf(entries, 'bank', opening);
    if (!view.balance) return null;
    const sides = ledgerSides(view, { closeOn: c.day });
    // Two rows of a side that nothing tells apart cannot be marked.
    for (const side of [sides.left, sides.right]) {
      if (new Set(side.rows.map((r) => `${r.label}|${r.amount}`)).size !== side.rows.length) return null;
    }
    const shown = rng.shuffle([...adj.map((a) => a.text), ...stay.map((i) => i.fact)]);
    const data =
      `On ${c.date}, the cash book (bank column) of ${firm} shows ${start > 0 ? 'a favourable balance (a debit balance)' : 'an overdraft (a credit balance)'} of ${fmt(size)}. ` +
      `On comparing it with the pass book, the firm noted the following. It has not yet made any entry or correction in its cash book for any of them.` +
      `${withError ? ' The ledger was posted from the cash book as it stood, so an error in it is put right by one entry, for the amount by which it puts the bank column out, against the account that was posted wrongly.' : ''}\n` +
      shown.map((text, i) => `(${ROMAN[i]}) ${text}`).join('\n');
    keptAmended.keep(data, { start, entries, stay });
    const pre = (side: 'Dr' | 'Cr') => (side === 'Dr' ? 'To' : 'By');
    const drTotal = addUp(view.debit.map((p) => p.amount));
    const crTotal = addUp(view.credit.map((p) => p.amount));
    const favourable = view.balance.side === 'Dr';
    return {
      task: `Prepare the amended Cash Book (bank column only) of ${firm} on ${c.date} and balance it. Enter only what needs an entry in the cash book, and leave out what belongs in the Bank Reconciliation Statement alone.`,
      data,
      title: `Amended Cash Book (bank column) of ${firm}, ${c.date}`,
      ...sides,
      // What stays in the statement is on offer, with the accounts a student wrongly reaches for.
      distractors: [issued.label, deposited.label, ...stay.filter((i) => i.kind.group === 'bankError').map((i) => i.kind.label), 'Bank A/c', 'Cash A/c', 'Suspense A/c'],
      explanation: [
        start > 0
          ? `The cash book shows a favourable balance, which is a debit balance: "To Balance b/d" ${fmt(size)}.`
          : `The cash book shows an overdraft, which is a credit balance: "By Balance b/d" ${fmt(size)}.`,
        ...adj.map((a, i) => `${postingsOf([entries[i]], 'bank').map((p) => `"${pre(p.side)} ${p.label}" ${fmt(p.amount)}`).join(' and ')}: ${a.explanation.join(' ')}`),
        `Left out: ${stay.map((i) => i.kind.short).join('; ')}. ${stay.some((i) => i.kind.group === 'bankError') ? 'The cash book is right about the cheques, and the bank must correct its own error' : 'The cash book is already right about them'}: they appear only in the Bank Reconciliation Statement.`,
        `Debit side ${fmt(drTotal)}, credit side ${fmt(crTotal)}. The ${favourable ? 'debit' : 'credit'} side is larger by ${fmt(view.balance.amount)}: "${pre(favourable ? 'Cr' : 'Dr')} Balance c/d" ${fmt(view.balance.amount)}, the amended balance as per cash book, ${favourable ? 'a favourable balance' : 'an overdraft'}.`,
      ],
      hints: [
        'Sort the items first: which are missing from the cash book or wrong in it, and which is the cash book already right about?',
        'An amount the bank has added goes on the debit side ("To" the account it came from); an amount the bank has taken out goes on the credit side ("By" the account it went to). An error in the cash book is put right by the amount by which it puts the bank column out. Cheques not yet presented or cleared, and errors of the bank, need no entry.',
      ],
    };
  },
  // Worked out again two other ways: every posting netted into one figure for Bank A/c, and by way of the pass book
  // (the pass book balance with only the items that stay reversed, as the card has it).
  verify: (q: AccountQuestion) => {
    const k = keptAmended.of(q.data);
    if (!k) return false;
    const net = post(k.entries.map((e) => e.lines), new Map([['bank', k.start]])).get('bank') ?? 0;
    if (net === 0) return false;
    const [dr, cr] = q.sides;
    const closing = (net > 0 ? cr : dr).rows.filter((r) => r.closing);
    if (closing.length !== 1 || (net > 0 ? dr : cr).rows.some((r) => r.closing)) return false;
    if (closing[0].label !== BALANCE_CD || closing[0].amounts[0] !== Math.abs(net)) return false;
    const body = (rows: typeof dr.rows) => rows.filter((r) => !r.closing);
    const sumOf = (rows: typeof dr.rows) => addUp(rows.map((r) => r.amounts[0]));
    if (sumOf(body(dr.rows)) - sumOf(body(cr.rows)) !== net) return false;
    if (body(dr.rows).length + body(cr.rows).length !== k.entries.length + 1) return false;
    const opening = (k.start > 0 ? dr : cr).rows.filter((r) => r.label === BALANCE_BD);
    if (opening.length !== 1 || opening[0].amounts[0] !== Math.abs(k.start) || rupeesIn(q.data)[0] !== Math.abs(k.start)) return false;
    const stayLabels = new Set(k.stay.map((i) => i.kind.label));
    if ([...dr.rows, ...cr.rows].some((r) => stayLabels.has(r.label))) return false;
    const pb = net + sumEffect(k.stay);
    return pb === 0 || textbook('pb', pb, k.stay) === net;
  },
});

const formats: Template[] = [fmtTiming, fmtBankItems, fmtFromPassBook, fmtOverdraft, fmtErrors, fmtAmended];

/**
 * What the chained cases of the stage "Cash book to bank reconciliation" (`cases/cash-and-bank.ts`) reuse of the
 * statements and of the amended cash book above: the columns and the names of the balances, the row of a cheque and
 * of an item, the items themselves (with what each does to the two balances) and the entries that bring a cash book
 * up to date.
 */
export type { SetItem as BrsSetItem };
export const BRS_CHAIN = {
  columns: BRS_COLUMNS,
  names: formatNames,
  balanceLabel: brsBalanceLabel,
  chequeLabel,
  rowLabel,
  formatItem,
  timing: TIMING,
  bankErrors: BANK_ERR,
  issued,
  deposited,
  passKinds: PASS_KINDS,
  errorKinds: ERROR_KINDS,
  passItem,
  errorItem,
};

// ---------------------------------------------------------------------------------------------------------------
// Added after the papers were set (outsidePapers keeps them off the papers, worksheets and Look back levels): bills
// receivable, a cheque entered in the cash column, items of the previous month, the nature of the result asked as a
// choice, and a statement prepared from extracts of the two books. The pools of the templates above are unchanged.
// ---------------------------------------------------------------------------------------------------------------

const billCollected: Kind = {
  id: 'billCollected', group: 'bank', sign: 1, inCb: false, inPb: true, action: 'enter',
  label: 'Bill receivable collected by the bank',
  short: 'a bill receivable collected by the bank but not yet entered in the cash book',
  range: [5000, 40000, 500],
  fact: (x, p, _a, rng) =>
    rng.pick([
      `A bill receivable for ${x} accepted by ${p}, left with the bank for collection, was collected by the bank on its due date and credited to the firm's account.`,
      `The bank collected on its due date a bill receivable for ${x} that ${p} had accepted, and credited the amount to the firm's account.`,
    ]),
  note: 'The firm has not yet entered it.',
  reason: 'The bank collected the bill and added the amount to the account, but the firm has not yet entered the collection.',
  mistake: 'Treated the collection of a bill by the bank as if the bank had paid the money out.',
};

const billDishonoured: Kind = {
  id: 'billDishonoured', group: 'bank', sign: -1, inCb: false, inPb: true, action: 'enter',
  label: 'Bill discounted with the bank and dishonoured',
  short: 'a discounted bill dishonoured on its due date and not yet entered in the cash book',
  range: [5000, 40000, 500],
  fact: (x, p) =>
    `A bill receivable for ${x} accepted by ${p}, which the firm had discounted with the bank, was dishonoured on its due date, and the bank debited the firm's account with it.`,
  note: 'The firm has not yet entered the dishonour.',
  reason: 'The bank had paid the firm for the bill when it was discounted; when the bill was dishonoured it took the amount back out of the account, but the firm has not yet entered the dishonour.',
  mistake: 'Thought a bill once discounted is no longer the firm\'s concern, so treated the debit as if it raised the balance.',
};

const cashColumnReceipt: Kind = {
  id: 'cashColumnReceipt', group: 'cbRecord', sign: 1, inCb: true, inPb: true, action: 'enter',
  label: 'Cheque deposited, entered in the cash column',
  short: 'a cheque deposited in the bank but entered in the cash column of the cash book',
  range: [2000, 25000, 500],
  fact: (x, p) =>
    `A cheque for ${x} received from ${p} and paid into the bank the same day was entered in the cash column of the cash book instead of the bank column. The bank has collected it.`,
  reason: 'The bank column does not show a deposit that the bank has credited, so the cash book (bank column) balance is too low.',
  mistake: 'Thought a receipt entered in the wrong column of the cash book makes the bank column too high.',
};

const cashColumnPayment: Kind = {
  id: 'cashColumnPayment', group: 'cbRecord', sign: -1, inCb: true, inPb: true, action: 'enter',
  label: 'Cheque issued, entered in the cash column',
  short: 'a cheque issued and paid by the bank but entered in the cash column of the cash book',
  range: [2000, 25000, 500],
  fact: (x, p) =>
    `A cheque for ${x} issued to ${p} was entered in the cash column of the cash book instead of the bank column. The bank has paid it.`,
  reason: 'The bank column does not show a payment that the bank has made, so the cash book (bank column) balance is too high.',
  mistake: 'Thought a payment entered in the wrong column of the cash book makes the bank column too low.',
};

const previousIssued: Kind = {
  id: 'previousIssued', group: 'timing', sign: 1, inCb: true, inPb: false, action: 'listOnly',
  label: 'Cheques of the previous month still not presented',
  short: 'cheques issued in the previous month and still not presented',
  range: [2000, 20000, 500],
  fact: (_x, _p, a, rng) => {
    const done = amount(rng, 3000, 30000, 500);
    return `Cheques for ${fmt(done + a)} issued in the previous month had not been presented by its end; of these, cheques for ${fmt(done)} were presented and paid during this month, and the rest are still with the payees.`;
  },
  reason: 'The cheques still with the payees are in the cash book (entered when issued) but not yet paid by the bank. Those presented this month are now in both books.',
  mistake: 'Thought the bank had already paid the cheques still with the payees, so applied them the wrong way round.',
};

const previousDeposited: Kind = {
  id: 'previousDeposited', group: 'timing', sign: -1, inCb: true, inPb: false, action: 'listOnly',
  label: 'Cheques of the previous month still not cleared',
  short: 'cheques deposited in the previous month and still not cleared',
  range: [2000, 20000, 500],
  fact: (_x, _p, a, rng) => {
    const done = amount(rng, 3000, 30000, 500);
    return `Outstation cheques for ${fmt(done + a)} deposited in the previous month had not been collected by its end; of these, cheques for ${fmt(done)} were collected and credited during this month, and the rest are still to be collected.`;
  },
  reason: 'The cheques still to be collected are in the cash book (entered when deposited) but not yet credited by the bank. Those collected this month are now in both books.',
  mistake: 'Thought the bank had already credited the cheques still to be collected, so applied them the wrong way round.',
};

const BILLS = [billCollected, billDishonoured];
const CASH_COLUMN = [cashColumnReceipt, cashColumnPayment];
const PREVIOUS = [previousIssued, previousDeposited];

const HINTS_BILLS = [
  'A bill receivable is the firm\'s, whichever way it ends: collected for the firm, or dishonoured after the firm was paid for it on discounting. Which book has the item so far?',
  'The bank records both first. A bill collected raises the pass book balance (add it when you start from the cash book); a discounted bill dishonoured lowers it (deduct it).',
];
const HINTS_CASH_COLUMN = [
  'Look only at the bank column of the cash book: does it show this cheque at all?',
  'A deposit written in the cash column leaves the bank column too low, so the pass book is higher (add, from the cash book). A cheque issued written in the cash column leaves the bank column too high, so the pass book is lower (deduct).',
];
const HINTS_PREVIOUS = [
  'Of last month\'s cheques, which are still outstanding now? Only those keep the two books apart.',
  'Cheques of last month that the bank dealt with this month are in both books: leave them out. Those still with the payees are added from the cash book; those still to be collected are deducted.',
];

const billsItems = reconcileTemplate({
  id: 'brs-bills-items', conceptId: 'brs-bank-items', difficulty: 'medium',
  from: 'either', nature: 'fav', pool: [...BASIC, ...BILLS], mustPick: BILLS, n: [3, 4], hints: HINTS_BILLS,
});

const cashColumn = reconcileTemplate({
  id: 'brs-cash-column', conceptId: 'brs-errors', difficulty: 'medium',
  from: 'either', nature: 'fav', pool: BASIC, mustPick: CASH_COLUMN, n: [3, 3], hints: HINTS_CASH_COLUMN,
});

const previousPeriod = reconcileTemplate({
  id: 'brs-previous-period', conceptId: 'brs-timing', difficulty: 'complex',
  from: 'either', nature: 'fav', pool: [...TIMING, ...SIMPLE_BANK, ...PREVIOUS], must: PREVIOUS, n: [3, 4], hints: HINTS_PREVIOUS,
});

// The result asked as a choice of amount and nature: half the seeds turn the balance into one of the other nature,
// the other half start from an overdraft.
const resultNature = mcqTemplate({
  id: 'brs-result-nature', topicId: T, conceptId: 'brs-overdraft', difficulty: 'complex',
  generate: (rng) => {
    const crossing = rng.next() < 0.5;
    const f: Family = crossing
      ? { id: '', conceptId: '', difficulty: 'complex', from: 'either', nature: 'either', pool: BASIC, mustPick: TIMING, n: [3, 4], cross: 'always' }
      : { id: '', conceptId: '', difficulty: 'complex', from: 'either', nature: 'od', pool: [...BASIC, ...CAST], mustPick: TIMING, n: [3, 4], cross: 'maybe' };
    const s = scenario(rng, f);
    if (!s || (!crossing && s.start > 0)) return null;
    const correct = balanceText(s.result);
    const seen = new Set([correct]);
    const usable = [
      { text: balanceText(-s.result), why: 'Found the right amount but gave the wrong nature: called a favourable balance an overdraft, or the reverse.' },
      ...wrongAnswers(s.from, s.start, s.items).map((w) => ({ text: balanceText(w.signed), why: w.why })),
    ].filter((d) => !/^₹0 /.test(d.text) && !seen.has(d.text) && seen.add(d.text));
    const distractors = usable.slice(0, 3);
    if (distractors.length < 3 || distractors[0].text !== balanceText(-s.result)) return null;
    const prompt =
      `${startSentence({ ...s, style: 'plain' })} On comparing it with the other book, the following were noticed: ${itemList(s.items)} ` +
      `What is the balance as per the ${bookName(s.to)}${s.to === 'cb' ? ' before any entry or correction is made in it' : ''}? Give its amount and say whether it is a favourable balance or an overdraft.`;
    remember(mcqChecks, prompt, (t) => t === balanceText(textbook(s.from, s.start, s.items)) && reconcile(s.to, s.result, s.items) === s.start);
    return { prompt, correct, distractors, explanation: statementLines(s.from, s.start, s.items, `Balance as per ${bookName(s.to)}`).join(' '), hints: HINTS_OVERDRAFT };
  },
  verify: verifyMcq,
});

// -- 7. brs-fmt-extracts: the two books' entries of a month side by side, matched, then the statement (complex) ----

interface BankOnly {
  /** As the pass book shows it. */
  text: string;
  credit: boolean;
  range: [number, number, number];
  why: string;
}
const BANK_ONLY_CREDITS: ((who: string) => BankOnly)[] = [
  () => ({ text: 'Interest on fixed deposit credited', credit: true, range: [300, 3000, 50], why: 'the bank credited the interest on the firm\'s fixed deposit to this account' }),
  (who) => ({ text: `Direct deposit by ${who}`, credit: true, range: [2000, 20000, 500], why: `${who}, a customer, paid straight into the bank` }),
  () => ({ text: 'Dividend collected', credit: true, range: [500, 8000, 100], why: 'the bank collected a dividend on the firm\'s investments' }),
];
const BANK_ONLY_DEBITS: (() => BankOnly)[] = [
  () => ({ text: 'Bank charges', credit: false, range: [100, 1500, 50], why: 'the bank deducted its charges' }),
  () => ({ text: 'Insurance premium paid on standing instruction', credit: false, range: [1000, 9000, 100], why: 'the bank paid the premium on the firm\'s standing instruction' }),
  () => ({ text: 'Electricity bill paid on standing instruction', credit: false, range: [800, 7000, 100], why: 'the bank paid the bill on the firm\'s standing instruction' }),
];
const onlyInPassBook = (text: string) => `${text}, not yet in the cash book`;

const fmtExtracts = statementTemplate({
  id: 'brs-fmt-extracts',
  topicId: T,
  conceptId: F_CONCEPT,
  difficulty: 'complex',
  generate: (rng) => {
    const firm = rng.pick(FIRMS);
    const c = rng.pick(CLOSINGS);
    const name = formatNames(rng);
    const kinds = rng.shuffle([...Array<boolean>(rng.int(3, 4)).fill(false), ...Array<boolean>(rng.int(3, 4)).fill(true)]);
    const cheques = kinds.map((issued) => ({ issued, who: name(), amount: amount(rng, 2000, 30000, 500), day: 0, bankDay: 0, out: false }));
    if (new Set(cheques.map((q) => q.amount)).size !== cheques.length) return null;
    // One or two cheques of each kind are still outstanding on the last day: they were written in its last three days.
    for (const issued of [false, true]) rng.shuffle(cheques.filter((q) => q.issued === issued)).slice(0, rng.int(1, 2)).forEach((q) => (q.out = true));
    for (const q of cheques) {
      q.day = q.out ? rng.int(c.last - 2, c.last) : rng.int(2, c.last - 6);
      q.bankDay = q.out ? 0 : q.day + rng.int(1, 3);
    }
    const credits = rng.shuffle(BANK_ONLY_CREDITS).slice(0, rng.int(1, 2)).map((f) => f(name()));
    const debits = rng.shuffle(BANK_ONLY_DEBITS).slice(0, rng.int(1, 2)).map((f) => f());
    const bankOnly = [...credits, ...debits].map((b) => ({ ...b, amount: amount(rng, ...b.range), day: rng.int(5, c.last) }));
    if (bankOnly.length > 3) bankOnly.pop();
    const sumOf = (xs: { amount: Paise }[]) => addUp(xs.map((x) => x.amount));
    const opening = amount(rng, 40000, 150000, 1000) + sumOf(cheques.filter((q) => q.issued));
    const cashBook = opening + sumOf(cheques.filter((q) => !q.issued)) - sumOf(cheques.filter((q) => q.issued));
    const plusItems = [...cheques.filter((q) => q.out && q.issued).map((q) => ({ label: chequeLabel(true, q.who), amount: q.amount })), ...bankOnly.filter((b) => b.credit).map((b) => ({ label: onlyInPassBook(b.text), amount: b.amount }))];
    const minusItems = [...cheques.filter((q) => q.out && !q.issued).map((q) => ({ label: chequeLabel(false, q.who), amount: q.amount })), ...bankOnly.filter((b) => !b.credit).map((b) => ({ label: onlyInPassBook(b.text), amount: b.amount }))];
    const end = cashBook + sumOf(plusItems) - sumOf(minusItems);
    if (end <= 0) return null;
    const byDay = <X extends { day: number }>(xs: X[]) => [...xs].sort((a, b) => a.day - b.day);
    const line = (day: number, text: string, a: Paise) => `• ${day} ${c.month}: ${text}, ${fmt(a)}`;
    const cbReceipts = byDay(cheques.filter((q) => !q.issued)).map((q) => line(q.day, `Cheque from ${q.who} deposited`, q.amount));
    const cbPayments = byDay(cheques.filter((q) => q.issued)).map((q) => line(q.day, `Cheque issued to ${q.who}`, q.amount));
    const pbEntries = (credit: boolean) =>
      byDay([
        ...cheques.filter((q) => !q.out && q.issued !== credit).map((q) => ({ day: q.bankDay, text: credit ? `Cheque from ${q.who} collected` : `Cheque to ${q.who} paid`, amount: q.amount })),
        ...bankOnly.filter((b) => b.credit === credit),
      ]).map((x) => line(x.day, x.text, x.amount));
    const data = [
      `On 1 ${c.month}, the bank column of the cash book and the pass book of ${firm} showed the same favourable balance, ${fmt(opening)}. These are the entries of ${c.month} in the two books, the opening balance aside:`,
      'Cash book (bank column), receipts:',
      ...cbReceipts,
      'Cash book (bank column), payments:',
      ...cbPayments,
      'Pass book, withdrawals:',
      ...pbEntries(false),
      'Pass book, deposits:',
      ...pbEntries(true),
    ].join('\n');
    const matched = cheques.filter((q) => !q.out);
    return {
      task: `Prepare the Bank Reconciliation Statement of ${firm} as on ${c.date}, starting from the balance as per cash book, which you work out from its entries. Match the entries of the two books: each one that only one book shows goes in the statement, what is added in the Plus column and what is deducted in the Minus column.`,
      data,
      title: `Bank Reconciliation Statement of ${firm} as on ${c.date}`,
      columns: BRS_COLUMNS,
      rows: [
        { label: brsBalanceLabel('cb', cashBook), amounts: [cashBook, 0] },
        ...plusItems.map((i) => ({ label: i.label, amounts: [i.amount, 0] })),
        ...minusItems.map((i) => ({ label: i.label, amounts: [0, i.amount] })),
      ],
      final: { label: brsBalanceLabel('pb', end), amount: end },
      distractors: [brsBalanceLabel('cb', -cashBook), ...rng.shuffle(matched).slice(0, 3).map((q) => chequeLabel(q.issued, q.who))],
      explanation: [
        `Balance as per cash book = ${fmt(opening)} + receipts ${fmt(sumOf(cheques.filter((q) => !q.issued)))} - payments ${fmt(sumOf(cheques.filter((q) => q.issued)))} = ${fmt(cashBook)}, a favourable balance: the Plus column.`,
        `Ticked off in both books: ${matched.map((q) => `the cheque ${q.issued ? 'to' : 'from'} ${q.who} (${fmt(q.amount)})`).join(', ')}. They need no place in the statement.`,
        ...cheques.filter((q) => q.out).map((q) =>
          q.issued
            ? `Cheque to ${q.who}, ${fmt(q.amount)}: in the cash book only; the bank has not yet paid it, so the pass book balance is higher: Plus column.`
            : `Cheque from ${q.who}, ${fmt(q.amount)}: in the cash book only; the bank has not yet collected it, so the pass book balance is lower: Minus column.`,
        ),
        ...bankOnly.map((b) => `${b.text}, ${fmt(b.amount)}: in the pass book only (${b.why}), so the pass book balance is ${b.credit ? 'higher: Plus' : 'lower: Minus'} column.`),
        `Plus column ${fmt(cashBook + sumOf(plusItems))}, Minus column ${fmt(sumOf(minusItems))}: balance as per pass book = ${fmt(end)}, a favourable balance.`,
        'Check: the pass book entries alone give the same figure, the opening balance plus its deposits less its withdrawals.',
      ],
      hints: [
        'First find the cash book balance from its entries. Then tick off each cheque that appears in both books.',
        'What is left unticked goes in the statement: a cheque issued not yet paid and a pass book credit go in the Plus column; a cheque deposited not yet collected and a pass book debit in the Minus column.',
      ],
    };
  },
  // Worked out from the data alone: both books balanced from their own entries, the cheques matched by name and amount.
  verify: (q: StatementQuestion) => {
    if (!q.final || q.columns.join() !== BRS_COLUMNS.join()) return false;
    const lines = q.data.split('\n');
    const opening = rupeesIn(lines[0])[0];
    const sections = new Map<string, { text: string; amount: Paise }[]>();
    let at = '';
    for (const l of lines.slice(1)) {
      const entry = /^• \d+ \w+: (.+), (₹[\d,]+)$/.exec(l);
      if (entry) sections.get(at)?.push({ text: entry[1], amount: rupeesIn(entry[2])[0] });
      else sections.set((at = l), []);
    }
    const get = (k: string) => sections.get(k) ?? [];
    const receipts = get('Cash book (bank column), receipts:');
    const payments = get('Cash book (bank column), payments:');
    const withdrawals = get('Pass book, withdrawals:');
    const deposits = get('Pass book, deposits:');
    const total = (xs: { amount: Paise }[]) => addUp(xs.map((x) => x.amount));
    const cashBook = opening + total(receipts) - total(payments);
    const passBook = opening + total(deposits) - total(withdrawals);
    const has = (xs: { text: string; amount: Paise }[], text: string, a: Paise) => xs.some((x) => x.text === text && x.amount === a);
    const want: string[] = [`${brsBalanceLabel('cb', cashBook)}|${cashBook}|0`];
    for (const r of receipts) {
      const who = r.text.replace(/^Cheque from /, '').replace(/ deposited$/, '');
      if (!has(deposits, `Cheque from ${who} collected`, r.amount)) want.push(`${chequeLabel(false, who)}|0|${r.amount}`);
    }
    for (const p of payments) {
      const who = p.text.replace(/^Cheque issued to /, '');
      if (!has(withdrawals, `Cheque to ${who} paid`, p.amount)) want.push(`${chequeLabel(true, who)}|${p.amount}|0`);
    }
    for (const d of deposits) if (!d.text.startsWith('Cheque from ')) want.push(`${onlyInPassBook(d.text)}|${d.amount}|0`);
    for (const w of withdrawals) if (!w.text.startsWith('Cheque to ')) want.push(`${onlyInPassBook(w.text)}|0|${w.amount}`);
    return (
      passBook > 0 &&
      q.final.amount === passBook &&
      q.final.label === brsBalanceLabel('pb', 1) &&
      q.rows.length === want.length &&
      want.every((w) => q.rows.some((r) => `${r.label}|${r.amounts.join('|')}` === w))
    );
  },
});

const templates: Template[] = [
  // easy
  cbToPbTiming, cbToPbBank, pbToCbTiming, pbToCbBank, oneItem, brsGap,
  addDeductCb, addDeductPb, whichBook, drCrMeaning,
  bankPaidExpense, bankReceivedIncome, dishonourEntry,
  // medium
  cbToPbMixed, pbToCbMixed, odCbToPb, odPbToCb, drCrStart, missingItem, addDeductOd,
  needsEntry, countEntries, amendedFromCb, amendedFromPb, correctedCb,
  castError, recordError, bankError, errorDirection,
  // complex
  crossZero, complexCbOd, complexPbOd, complexIndirect, amendedComplex, natureResult,
  // sets of entries
  setPassBookItems, setWithErrors,
  // statements and the amended cash book to prepare
  ...formats,
];

// Assertion and Reason comes last, and is on its own level and on no mock paper (see assertionReason.ts).
const assertionReason = assertionReasonTemplate({
  prefix: 'brs', topicId: 'bank-reconciliation', conceptId: 'brs-why',
  items: [
    {
      answer: 'explains',
      a: 'A cheque of ₹5,000 deposited but not yet cleared is deducted from a favourable cash book balance to get the pass book balance.',
      r: 'The cash book has added the cheque, but the bank has not yet credited it.',
      aWhy: 'The pass book balance is lower by ₹5,000.',
      rWhy: 'The firm enters the cheque when it is deposited, and the bank only when it is collected.',
      link: 'The pass book is lower because of that gap, which is why the amount is deducted. R explains A.',
    },
    {
      answer: 'explains',
      a: 'A debit balance in a pass book shows an overdraft.',
      r: 'The pass book is the bank\'s record, and money the firm owes the bank is a debit there.',
      aWhy: 'A favourable balance is a credit balance in the pass book, and an overdraft is the opposite.',
      rWhy: 'The bank treats what the firm owes it as an asset of its own.',
      link: 'The balance is a debit because the bank is the one that is owed, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'The cash book and the pass book can show different balances though neither party has made a mistake.',
      r: 'The firm and the bank record some items at different times.',
      aWhy: 'A difference does not by itself mean an error.',
      rWhy: 'A cheque issued today is in the cash book today, and in the pass book only when it is paid.',
      link: 'Timing alone keeps the two balances apart, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'With an overdraft of ₹20,000 as per the cash book and cheques of ₹3,000 issued but not presented, the overdraft as per the pass book is ₹17,000.',
      r: 'The bank has not yet paid those cheques, so the overdraft in its books is smaller.',
      aWhy: 'The overdraft in the pass book is ₹20,000 - ₹3,000 = ₹17,000.',
      rWhy: 'The cash book has counted the cheques as paid, and the bank has not.',
      link: 'The cheques still have to raise the bank\'s figure, which is why it is ₹3,000 lower, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'The firm makes no entry in the cash book for a wrong debit by the bank.',
      r: 'The bank must correct its own mistake.',
      aWhy: 'The cash book is right, and only the pass book is wrong.',
      rWhy: 'The item stays in the statement until the bank puts it right.',
      link: 'The correction belongs in the bank\'s books and not in the firm\'s, so R explains A.',
    },
    {
      answer: 'not-the-reason',
      a: 'Interest of ₹600 credited by the bank needs an entry in the cash book.',
      r: 'Cheques issued but not presented need no entry in the cash book.',
      aWhy: 'The firm learns of the interest from the pass book, so its record is incomplete.',
      rWhy: 'They are already in the cash book.',
      link: 'R is about a timing difference. The interest needs an entry because the cash book does not yet have it.',
    },
    {
      answer: 'not-the-reason',
      a: 'A dividend of ₹2,000 collected by the bank is added to a favourable cash book balance.',
      r: 'Bank charges are deducted from a favourable cash book balance.',
      aWhy: 'The pass book is higher by the dividend, which the cash book does not yet show.',
      rWhy: 'The pass book is lower by the charges.',
      link: 'Each item is adjusted for its own effect on the pass book. The treatment of charges does not explain that of the dividend.',
    },
    {
      answer: 'not-the-reason',
      a: 'A favourable balance is a credit balance in the pass book.',
      r: 'An overdraft is a credit balance in the cash book.',
      aWhy: 'Money held for the firm is a liability of the bank.',
      rWhy: 'The firm owes the bank, so the bank column of its cash book has a credit balance.',
      link: 'R is about an overdraft in the firm\'s own book. A favourable balance is a credit in the pass book because the bank owes the money.',
    },
    {
      answer: 'a-only',
      a: 'A cheque of ₹4,000 returned dishonoured needs an entry in the cash book.',
      r: 'A dishonoured cheque is a timing difference that puts itself right.',
      aWhy: 'The bank has taken the amount back, and the cash book still shows the receipt.',
      rWhy: 'It will not put itself right: the firm has to credit the bank column and debit the customer.',
    },
    {
      answer: 'a-only',
      a: 'Under-casting the payments side of the cash book by ₹1,000 makes the cash book balance too high.',
      r: 'Under-casting the payments side overstates the payments.',
      aWhy: 'Less has been deducted than should have been, so the balance is ₹1,000 too high.',
      rWhy: 'An under-cast makes the total of the payments too low, not too high.',
    },
    {
      answer: 'r-only',
      a: 'Starting from a favourable pass book balance, cheques issued but not presented are added.',
      r: 'Working from the pass book, each item moves the opposite way to the rule from the cash book.',
      aWhy: 'From a favourable pass book balance they are deducted.',
      rWhy: 'The statement is being worked back from the bank\'s balance to the firm\'s.',
    },
    {
      answer: 'r-only',
      a: 'A cheque deposited but not yet cleared needs a further entry in the cash book.',
      r: 'The cash book shows a cheque on the day it is deposited.',
      aWhy: 'A second entry would count it twice; it appears only in the statement.',
      rWhy: 'The firm records the deposit when it is made.',
    },
  ],
});

// The templates added after the papers were set stand last, so that no template before them moves.
const withAssertionReason: Template[] = [...templates, assertionReason, billsItems, cashColumn, previousPeriod, resultNature, fmtExtracts];

export default withAssertionReason;
