import type { AccountQuestion, Difficulty, JournalSetQuestion, NumericQuestion, StatementQuestion } from '@/content/types';
import { creditor, debtor } from '@/engine/accounts';
import { BALANCE_BD, BALANCE_CD, accountLabel, cashBook, post, type CashBookRow, type CashBookView, type DatedEntry } from '@/engine/books';
import { columnTotals, type FormatRow } from '@/engine/formats';
import type { JournalLine } from '@/engine/journal';
import type { Rng } from '@/engine/rng';
import {
  CASH_BOOK_COLUMNS,
  PARTIES,
  accountTemplate,
  amount,
  cashBookSides,
  crSide,
  drSide,
  formatINR,
  interleave,
  journalSetTemplate,
  journalTemplate,
  keepFor,
  mcqTemplate,
  numericTemplate,
  percentOf,
  setDays,
  statementTemplate,
  storyHolds,
  type Closing,
  type Paise,
} from '../authoring';
import { MAX_ATTEMPTS, attemptRng, parseGenId } from '../engine';
import type { AccountParts, Distractor, Template } from '../types';
import { assertionReasonTemplate } from '../assertionReason';

const T = 'cash-book';
const f = formatINR;
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const party = (rng: Rng) => rng.pick(PARTIES);
// Customers and suppliers come from separate lists, so that one month never shows the same name as both.
const DEBTORS = ['Mohan', 'Anita Traders', 'Kiran', 'Verma & Sons', 'Meena Stores'];
const CREDITORS = ['Rao & Co.', 'Sharma Bros', 'Lakshmi Stores', 'Iyer Agencies', 'Deepak Suppliers'];
const customer = (rng: Rng) => rng.pick(DEBTORS);
const supplier = (rng: Rng) => rng.pick(CREDITORS);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------------------------------------------
// A small model of a month's transactions in a firm's cash book. Every scenario generator builds one, shows it as a
// dated list in the prompt, and asks about one figure. The answer is worked from the model by one route and checked
// again (in `verify`) by another.
// ---------------------------------------------------------------------------------------------------------------

type Col = 'cash' | 'bank';
type Side = 'Dr' | 'Cr';
type Group = 'cashIn' | 'cashOut' | 'bankIn' | 'bankOut' | 'deposit' | 'withdraw' | 'credit' | 'settleIn' | 'settleOut' | 'slip';

interface Leg {
  col: Col;
  side: Side;
}

interface Tx {
  group: Group;
  /** The sentence for the dated list; `a` is the amount as text. */
  say: (a: string) => string;
  /** The amount entered in the cash book (paise). */
  amt: Paise;
  /** Where it is entered. Empty for an item that never reaches the cash book. */
  legs: Leg[];
  contra?: boolean;
  /** The full amount due, which a student who ignores a discount would enter instead. */
  naive?: Paise;
  /** Where a student who wrongly enters a non-cash item would put it. */
  mistaken?: Leg[];
  /** The owner drawing on the bank for personal use, which students often take for a contra entry. */
  ownerBank?: boolean;
  /** How the amount entered was worked out, when the prompt does not state it directly. */
  calc?: string;
}

type Kind = (rng: Rng) => Tx;

const CASH_DR: Leg[] = [{ col: 'cash', side: 'Dr' }];
const CASH_CR: Leg[] = [{ col: 'cash', side: 'Cr' }];
const BANK_DR: Leg[] = [{ col: 'bank', side: 'Dr' }];
const BANK_CR: Leg[] = [{ col: 'bank', side: 'Cr' }];

const tx = (group: Group, amt: Paise, legs: Leg[], say: Tx['say'], more: Partial<Tx> = {}): Tx => ({ group, amt, legs, say, ...more });
const amt = (rng: Rng, lo = 2000, hi = 25000): Paise => amount(rng, lo, hi, 500);

const EXPENSES = ['rent', 'salaries', 'wages', 'electricity charges', 'carriage', 'repairs', 'advertising', 'stationery'];

const CASH_IN: Kind[] = [
  (r) => tx('cashIn', amt(r), CASH_DR, (a) => `Cash sales of ${a}`),
  (r) => {
    const p = customer(r);
    return tx('cashIn', amt(r), CASH_DR, (a) => `Received ${a} in cash from ${p}, a debtor`);
  },
  (r) => tx('cashIn', amt(r, 1000, 8000), CASH_DR, (a) => `Received commission of ${a} in cash`),
  (r) => tx('cashIn', amt(r, 5000, 30000), CASH_DR, (a) => `The owner brought ${a} in cash as additional capital`),
  (r) => tx('cashIn', amt(r, 3000, 15000), CASH_DR, (a) => `Sold old furniture for ${a} in cash`),
];

const CASH_OUT: Kind[] = [
  (r) => tx('cashOut', amt(r), CASH_CR, (a) => `Bought goods for ${a}, paid in cash`),
  (r) => {
    const p = supplier(r);
    return tx('cashOut', amt(r), CASH_CR, (a) => `Paid ${a} in cash to ${p}, a creditor`);
  },
  (r) => {
    const e = r.pick(EXPENSES);
    return tx('cashOut', amt(r, 1000, 12000), CASH_CR, (a) => `Paid ${a} in cash for ${e}`);
  },
  (r) => tx('cashOut', amt(r, 2000, 10000), CASH_CR, (a) => `The owner withdrew ${a} in cash for personal use`),
];

const BANK_IN: Kind[] = [
  (r) => {
    const p = customer(r);
    return tx('bankIn', amt(r), BANK_DR, (a) => `Received a cheque for ${a} from ${p}, a debtor, and banked it the same day`);
  },
  (r) => tx('bankIn', amt(r), BANK_DR, (a) => `Sold goods for ${a}; the customer paid by cheque, banked the same day`),
  (r) => tx('bankIn', amt(r, 3000, 15000), BANK_DR, (a) => `Rent of ${a} was received by cheque and banked the same day`),
];

const BANK_OUT: Kind[] = [
  (r) => {
    const p = supplier(r);
    return tx('bankOut', amt(r), BANK_CR, (a) => `Paid ${a} by cheque to ${p}, a creditor`);
  },
  (r) => tx('bankOut', amt(r), BANK_CR, (a) => `Bought goods for ${a}, paid by cheque`),
  (r) => {
    const e = r.pick(EXPENSES);
    return tx('bankOut', amt(r, 1000, 12000), BANK_CR, (a) => `Paid ${a} by cheque for ${e}`);
  },
  (r) => tx('bankOut', amt(r, 2000, 10000), BANK_CR, (a) => `The owner withdrew ${a} by cheque for personal use`, { ownerBank: true }),
];

const DEPOSIT: Kind = (r) => {
  const which = r.pick([0, 1]);
  return tx('deposit', amt(r, 3000, 25000), [...CASH_CR, ...BANK_DR], (a) => (which === 0 ? `Deposited ${a} of cash into the bank` : `Paid surplus cash of ${a} into the bank account`), {
    contra: true,
  });
};
const WITHDRAW: Kind = (r) => {
  const which = r.pick([0, 1]);
  return tx('withdraw', amt(r, 3000, 25000), [...CASH_DR, ...BANK_CR], (a) => (which === 0 ? `Withdrew ${a} from the bank for office use` : `Drew ${a} in cash from the bank for office expenses`), {
    contra: true,
  });
};

// These items stand in months that open with an overdraft. A bank charges interest on an overdraft (a debit); the
// interest it credits is earned elsewhere, on a fixed deposit of the firm, and is paid into its current account.
const SLIPS: Kind[] = [
  (r) => tx('slip', amt(r, 500, 3000), BANK_CR, (a) => `The bank debited ${a} as bank charges`),
  (r) => tx('slip', amt(r, 500, 2500), BANK_CR, (a) => `The bank debited ${a} as interest on the overdraft`),
  (r) => tx('slip', amt(r, 1000, 6000), BANK_DR, (a) => `The bank credited ${a} to the current account as interest on the firm's fixed deposit`),
  (r) => {
    const p = customer(r);
    return tx('slip', amt(r, 3000, 15000), BANK_CR, (a) => `A cheque for ${a}, received from ${p}, a debtor, and banked earlier, was returned dishonoured by the bank`);
  },
];

/** Items that never reach the cash book. `mistaken` is where a careless student would enter them. */
const NON_CASH: Kind[] = [
  (r) => {
    const p = customer(r);
    return tx('credit', amt(r, 3000, 30000), [], (a) => `Sold goods on credit to ${p} for ${a}`, { mistaken: CASH_DR });
  },
  (r) => {
    const p = supplier(r);
    return tx('credit', amt(r, 3000, 30000), [], (a) => `Bought goods on credit from ${p} for ${a}`, { mistaken: CASH_CR });
  },
  (r) => tx('credit', amt(r, 1000, 8000), [], (a) => `Depreciation of ${a} was charged on machinery`, { mistaken: CASH_CR }),
  (r) => tx('credit', amt(r, 1000, 8000), [], (a) => `Salaries of ${a} for the month were due but not yet paid`, { mistaken: CASH_CR }),
];

/** A debtor or creditor settles in full after a cash discount. The prompt gives the amount due and the rate, not the amount paid. */
const SETTLE_IN: Kind = (r) => {
  const due = amount(r, 5000, 40000, 1000);
  const pct = r.pick([2, 3, 4, 5, 10]);
  const p = customer(r);
  return tx('settleIn', due - percentOf(due, pct), BANK_DR, () => `${p}, a debtor who owed ${f(due)}, settled the account in full by cheque after a ${pct}% cash discount; the cheque was banked the same day`, {
    naive: due,
    calc: `Cheque received from ${p} = ${f(due)} less ${pct}% (${f(percentOf(due, pct))}) = ${f(due - percentOf(due, pct))}.`,
  });
};
const SETTLE_OUT: Kind = (r) => {
  const due = amount(r, 5000, 40000, 1000);
  const pct = r.pick([2, 3, 4, 5, 10]);
  const p = supplier(r);
  return tx('settleOut', due - percentOf(due, pct), BANK_CR, () => `The firm owed ${p}, a creditor, ${f(due)} and settled the account in full by cheque after getting a ${pct}% cash discount`, {
    naive: due,
    calc: `Cheque paid to ${p} = ${f(due)} less ${pct}% (${f(percentOf(due, pct))}) = ${f(due - percentOf(due, pct))}.`,
  });
};

const FIRMS = ['Madan Traders', 'Sri Murugan Stores', 'Gupta Electricals', 'Bharat Stationers', 'Kaveri Textiles', 'Ganesh Provision Store', 'Joshi Hardware', 'Nair Spices', 'Patel Garments', 'Rathi Cycle Mart'];
const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'];

interface Model {
  style: 'single' | 'double';
  firm: string;
  month: string;
  /** Opening cash balance. */
  cash0: Paise;
  /** Opening bank balance; negative for an overdraft. */
  bank0: Paise;
  txs: Tx[];
  dates: string[];
}

const delta = (t: Tx, col: Col) => sum(t.legs.filter((l) => l.col === col).map((l) => (l.side === 'Dr' ? t.amt : -t.amt)));

interface Plan {
  style: Model['style'];
  n: number;
  cash0: Paise;
  bank0?: Paise;
  pool: Kind[];
  /** Kinds that must each appear once. */
  need?: Kind[];
  /** The bank column may go into overdraft during the month. */
  overdraft?: boolean;
}

/** Draws the transactions one by one, never letting cash (or the bank, unless overdrafts are allowed) go below nil. */
function build(rng: Rng, p: Plan): Model | null {
  let cash = p.cash0;
  let bank = p.bank0 ?? 0;
  const need = p.need ?? [];
  // Different kinds of transaction, so that a month does not repeat the same item over and over.
  const bag = rng.shuffle(p.pool.filter((k) => !need.includes(k)));
  const slots = rng.shuffle([
    ...need.map((k) => ({ k, must: true })),
    ...Array.from({ length: Math.max(0, p.n - need.length) }, (_, i) => ({ k: bag[i % bag.length], must: false })),
  ]);
  const txs: Tx[] = [];
  for (const s of slots) {
    let placed: Tx | null = null;
    for (let i = 0; i < 6 && !placed; i++) {
      const t = (i === 0 || s.must ? s.k : rng.pick(p.pool))(rng);
      if (cash + delta(t, 'cash') >= 0 && (p.overdraft || bank + delta(t, 'bank') >= 0)) placed = t;
    }
    if (!placed) return null;
    cash += delta(placed, 'cash');
    bank += delta(placed, 'bank');
    txs.push(placed);
  }
  let day = rng.int(1, 3);
  const gap = p.n <= 8 ? 3 : 2;
  const month = rng.pick(MONTHS);
  const dates = txs.map(() => `${(day += rng.int(1, gap))} ${month}`);
  return { style: p.style, firm: rng.pick(FIRMS), month, cash0: p.cash0, bank0: p.bank0 ?? 0, txs, dates };
}

const singleSetup = (rng: Rng, n: [number, number] = [4, 6]): Model | null =>
  build(rng, { style: 'single', n: rng.int(...n), cash0: amount(rng, 10000, 60000, 1000), pool: [...CASH_IN, ...CASH_OUT] });

const BASE = [...CASH_IN, ...CASH_OUT, ...BANK_IN, ...BANK_OUT];

function doubleSetup(rng: Rng, o: { n: [number, number]; pool?: Kind[]; need?: Kind[]; overdraft?: boolean }): Model | null {
  return build(rng, {
    style: 'double',
    n: rng.int(...o.n),
    cash0: amount(rng, 10000, 60000, 1000),
    bank0: o.overdraft ? -amount(rng, 5000, 45000, 5000) : amount(rng, 30000, 120000, 5000),
    pool: o.pool ?? [...BASE, DEPOSIT, WITHDRAW],
    need: o.need ?? [DEPOSIT],
    overdraft: o.overdraft,
  });
}

/** The question stem: who, the opening position, and the dated list of transactions. */
function promptOf(m: Model, question: string, hide?: Col, hidden?: number): string {
  const day1 = `1 ${m.month}`;
  const bankText = m.bank0 < 0 ? `the bank account was overdrawn by ${f(-m.bank0)}` : `the balance at bank was ${f(m.bank0)}`;
  let intro: string;
  if (m.style === 'single') {
    intro = `${m.firm} keeps a single column cash book.${hide === 'cash' ? '' : ` On ${day1} it had ${f(m.cash0)} in cash.`} Its cash transactions during the month were:`;
  } else {
    const opening =
      hide === 'cash' ? `On ${day1} ${bankText}.` : hide === 'bank' ? `On ${day1} the cash balance was ${f(m.cash0)}.` : `On ${day1} the cash balance was ${f(m.cash0)} and ${bankText}.`;
    intro = `${m.firm} keeps a double column cash book with a cash column and a bank column, and banks every cheque on the day it is received. ${opening} Transactions during the month were:`;
  }
  const rows = m.txs.map((t, i) => `${m.dates[i]}: ${t.say(i === hidden ? '₹x' : f(t.amt))}.`);
  return [intro, ...rows, question].join('\n');
}

// ---- Working out a column ---------------------------------------------------------------------------------------

const sideTotal = (m: Model, col: Col, side: Side) => sum(m.txs.flatMap((t) => t.legs.filter((l) => l.col === col && l.side === side).map(() => t.amt)));
/** Closing balance as opening plus debits less credits, the way a column is balanced. */
const closeBySides = (m: Model, col: Col) => {
  const o = col === 'cash' ? m.cash0 : m.bank0;
  return Math.max(o, 0) + sideTotal(m, col, 'Dr') - (Math.max(-o, 0) + sideTotal(m, col, 'Cr'));
};

interface Mods {
  skipOpening?: boolean;
  payAdds?: boolean;
  skipContra?: boolean;
  naive?: boolean;
  credit?: boolean;
  bothCols?: boolean;
  odPositive?: boolean;
  reverseContra?: boolean;
}

/** Closing balance by running through the transactions, with optional slips that reproduce a student's mistake. */
function balance(m: Model, col: Col, mods: Mods = {}): number {
  let b = mods.skipOpening ? 0 : col === 'cash' ? m.cash0 : mods.odPositive ? Math.abs(m.bank0) : m.bank0;
  for (const t of m.txs) {
    if (t.contra && mods.skipContra) continue;
    const legs = mods.credit && t.mistaken ? t.mistaken : t.legs;
    const a = mods.naive && t.naive ? t.naive : t.amt;
    for (const l of legs) {
      if (l.col !== col && !mods.bothCols) continue;
      const debit = (l.side === 'Dr') !== (mods.reverseContra === true && t.contra === true);
      b += debit || mods.payAdds ? a : -a;
    }
  }
  return b;
}

function columnLines(m: Model, col: Col): string[] {
  const open = col === 'cash' ? m.cash0 : m.bank0;
  const dr: Paise[] = open > 0 ? [open] : [];
  const cr: Paise[] = open < 0 ? [-open] : [];
  for (const t of m.txs) for (const l of t.legs) if (l.col === col) (l.side === 'Dr' ? dr : cr).push(t.amt);
  const D = sum(dr);
  const C = sum(cr);
  const list = (xs: Paise[]) => (xs.length === 0 ? 'nil' : xs.length === 1 ? f(xs[0]) : `${xs.map(f).join(' + ')} = ${f(sum(xs))}`);
  const name = col === 'cash' ? 'Cash' : 'Bank';
  const head = (side: string) => (m.style === 'single' ? cap(side) : `${name} column, ${side}`);
  // An overdraft is decided by the two sides as a whole (the opening overdraft is on the credit side), not by the month's payments alone.
  const closing =
    D < C
      ? `The credit side is the larger one, so the bank account is overdrawn at the close by ${f(C)} - ${f(D)} = ${f(C - D)}. The overdraft is written on the debit side as "To Balance c/d".`
      : C === 0
        ? `Nothing is on the credit side, so the closing ${name.toLowerCase()} balance is ${f(D)}.`
        : `Closing ${name.toLowerCase()} balance = ${f(D)} - ${f(C)} = ${f(D - C)}${col === 'bank' && open < 0 ? ', a favourable balance' : ''}.`;
  return [
    `${head('debit side')}${open > 0 ? ' (opening balance and receipts)' : ' (receipts)'}: ${list(dr)}.`,
    `${head('credit side')}${open < 0 ? ' (opening overdraft and payments)' : ' (payments)'}: ${list(cr)}.`,
    closing,
  ];
}

function notes(m: Model): string[] {
  const out: string[] = [];
  if (m.txs.some((t) => t.contra)) out.push('Contra entries (cash deposited into the bank, cash drawn from the bank) are entered in both columns.');
  if (m.txs.some((t) => t.group === 'credit')) out.push('Credit sales and purchases, depreciation and unpaid expenses do not touch cash or bank, so the cash book ignores them.');
  if (m.txs.some((t) => t.naive)) out.push('Only the amount actually received or paid is entered in the cash book; the discount is recorded through the journal.');
  if (m.txs.some((t) => t.group === 'slip')) out.push('Bank charges, interest on the overdraft and a dishonoured cheque reduce the bank balance (credit side of the bank column); interest on a fixed deposit credited by the bank adds to it (debit side).');
  return out;
}

type Err = [number, string];
const clean = (answer: number, errs: Err[]) => {
  const seen = new Set<number>([answer]);
  return errs.filter(([v]) => Number.isSafeInteger(v) && v > 0 && !seen.has(v) && seen.add(v)).map(([value, why]) => ({ value, why }));
};

interface Ask {
  question: string;
  answer: number;
  errors: Err[];
  working: string[];
  /** The answer again, worked another way from the same model. */
  recheck: (m: Model) => number;
  /** Which opening balance the prompt leaves out. */
  hide?: Col;
  /** Index of a transaction whose amount is shown as x. */
  hidden?: number;
}

function numericRun<R extends { prompt: string; answer: number; errors: Err[]; working: string[]; recheck: () => number }>(def: {
  id: string;
  conceptId: string;
  difficulty: Difficulty;
  unit?: 'rupees' | 'number' | 'percent';
  /** Hints of its own; left out, the default pair (as every template written before them has it). */
  hints?: HintPair;
  run: (rng: Rng) => R | null;
}) {
  const go = (rng: Rng) => {
    const r = def.run(rng);
    return r && clean(r.answer, r.errors).length >= 2 ? r : null;
  };
  return numericTemplate({
    id: def.id,
    topicId: T,
    conceptId: def.conceptId,
    difficulty: def.difficulty,
    unit: def.unit ?? 'rupees',
    generate: (rng) => {
      const r = go(rng);
      return r && { prompt: r.prompt, answer: r.answer, commonErrors: clean(r.answer, r.errors), explanation: r.working, ...(def.hints ? { hints: [...def.hints] } : {}) };
    },
    // Replays the seed (as the engine did) and recomputes the answer another way from the same scenario.
    verify: (q: NumericQuestion) => {
      const id = parseGenId(q.id);
      if (!id) return false;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const r = go(attemptRng(id.seed, attempt));
        if (r && r.prompt === q.prompt) return r.recheck() === q.answer;
      }
      return false;
    },
  });
}

function scenario(def: {
  id: string;
  conceptId: string;
  difficulty: Difficulty;
  unit?: 'rupees' | 'number';
  setup: (rng: Rng) => Model | null;
  ask: (rng: Rng, m: Model) => Ask | null;
}) {
  return numericRun({
    id: def.id,
    conceptId: def.conceptId,
    difficulty: def.difficulty,
    unit: def.unit,
    run: (rng) => {
      const m = def.setup(rng);
      const a = m && def.ask(rng, m);
      if (!m || !a) return null;
      return { prompt: promptOf(m, a.question, a.hide, a.hidden), answer: a.answer, errors: a.errors, working: a.working, recheck: () => a.recheck(m) };
    },
  });
}

// ---- Reusable questions about a model ---------------------------------------------------------------------------

function closingAsk(m: Model, col: Col): Ask | null {
  const answer = balance(m, col);
  if (answer <= 0) return null;
  const name = col === 'cash' ? 'cash' : 'bank';
  const errors: Err[] = [
    [balance(m, col, { skipOpening: true }), 'Left out the opening balance.'],
    [balance(m, col, { payAdds: true }), 'Added the payments instead of deducting them.'],
    [balance(m, col, { skipContra: true }), 'Left out the contra entries, which change this column too.'],
    [balance(m, col, { naive: true }), 'Entered the full amount due where a discount was allowed, instead of the amount actually received or paid.'],
    [balance(m, col, { credit: true }), 'Entered credit transactions as if cash or a cheque had changed hands.'],
  ];
  if (m.style === 'double') errors.push([balance(m, col, { bothCols: true }), 'Mixed the other column\'s receipts and payments into this one.']);
  if (col === 'bank' && m.bank0 < 0) errors.push([balance(m, col, { odPositive: true }), 'Took the opening overdraft as a favourable balance.']);
  return {
    question: m.style === 'double' ? `What is the closing balance of the ${name} column at the end of the month?` : 'What is the closing cash balance in the cash book at the end of the month?',
    answer,
    errors,
    working: [...columnLines(m, col), ...notes(m)],
    recheck: (mm) => closeBySides(mm, col),
  };
}

function bankOrOverdraftAsk(m: Model): Ask | null {
  const close = balance(m, 'bank');
  if (close === 0) return null;
  const errors: Err[] = [
    [Math.abs(balance(m, 'bank', { odPositive: true })), 'Took the opening overdraft as a favourable balance and put it with the receipts.'],
    [Math.abs(balance(m, 'bank', { skipOpening: true })), m.bank0 < 0 ? 'Left out the opening overdraft.' : 'Left out the opening balance.'],
    [Math.abs(balance(m, 'bank', { payAdds: true })), 'Added the payments to the receipts instead of putting them on the credit side.'],
    [Math.abs(balance(m, 'bank', { skipContra: true })), 'Left out the contra entries, which change the bank column too.'],
    [Math.abs(balance(m, 'bank', { bothCols: true })), 'Mixed the cash column\'s receipts and payments into the bank column.'],
  ];
  return {
    question: 'Find the closing balance of the bank column. If the account is still overdrawn at the end of the month, give the amount of the overdraft.',
    answer: Math.abs(close),
    errors,
    working: [...columnLines(m, 'bank'), ...notes(m)],
    recheck: (mm) => Math.abs(closeBySides(mm, 'bank')),
  };
}

/** The total of cash and bank balances at the close: contra entries only move money between them. */
function combinedAsk(m: Model): Ask | null {
  const cash = balance(m, 'cash');
  const bank = balance(m, 'bank');
  const answer = cash + bank;
  if (answer <= 0) return null;
  const contraTotal = sum(m.txs.filter((t) => t.contra).map((t) => t.amt));
  const errors: Err[] = [
    [cash, 'Gave only the closing cash balance.'],
    [bank, 'Gave only the closing bank balance.'],
    [answer + contraTotal, 'Added the contra entries as if they were new money coming into the firm.'],
    [answer - contraTotal, 'Treated the contra entries as money leaving the firm.'],
    [balance(m, 'cash', { skipOpening: true }) + balance(m, 'bank', { skipOpening: true }), 'Left out the opening balances.'],
  ];
  return {
    question: 'What is the total of the closing cash balance and the closing bank balance?',
    answer,
    errors,
    working: [
      ...columnLines(m, 'cash'),
      ...columnLines(m, 'bank'),
      `Total of cash and bank = ${f(cash)} + ${f(bank)} = ${f(answer)}.`,
      'Check: a contra entry only moves money between the two columns, so it does not change this total.',
    ],
    // Only the transactions that are not contra entries change the combined funds.
    recheck: (mm) =>
      mm.cash0 + mm.bank0 + sum(mm.txs.filter((t) => !t.contra).map((t) => delta(t, 'cash') + delta(t, 'bank'))),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Single column cash book
// ---------------------------------------------------------------------------------------------------------------

const cbScClosing = scenario({
  id: 'cb-sc-closing',
  conceptId: 'cb-single',
  difficulty: 'easy',
  setup: (rng) => singleSetup(rng),
  ask: (_rng, m) => closingAsk(m, 'cash'),
});

const cbScTotal = scenario({
  id: 'cb-sc-total',
  conceptId: 'cb-single',
  difficulty: 'easy',
  setup: (rng) => singleSetup(rng),
  ask: (rng, m) => {
    const receipts = sideTotal(m, 'cash', 'Dr');
    const payments = sideTotal(m, 'cash', 'Cr');
    const answer = m.cash0 + receipts;
    const closing = answer - payments;
    if (rng.pick(['before', 'after'] as const) === 'before') {
      return {
        question: 'What is the total of the debit side (the opening balance plus every receipt) before the cash book is balanced?',
        answer,
        errors: [
          [receipts, 'Left out the opening balance.'],
          [answer + payments, 'Added the payments to the receipts.'],
          [closing, 'Gave the closing balance, which is the balancing figure, not the total.'],
        ],
        working: [`Debit side = ${[m.cash0, ...m.txs.filter((t) => t.group === 'cashIn').map((t) => t.amt)].map(f).join(' + ')} = ${f(answer)}.`, 'Payments are on the credit side and are not part of this total.'],
        recheck: (mm) => payments + closeBySides(mm, 'cash'),
      };
    }
    return {
      question: 'After the cash book is balanced, at what figure do the debit side and the credit side both total?',
      answer,
      errors: [
        [payments, 'Gave the total of the payments only, before the balance carried down is added.'],
        [closing, 'Gave the balance carried down instead of the total of the side.'],
        [answer + payments, 'Added the two sides together instead of reading one of them.'],
      ],
      working: [
        `Debit side = opening ${f(m.cash0)} + receipts ${f(receipts)} = ${f(answer)}.`,
        `Credit side = payments ${f(payments)} + balance c/d ${f(closing)} = ${f(answer)}.`,
        'The balance carried down is the figure that makes the two sides equal.',
      ],
      recheck: (mm) => payments + closeBySides(mm, 'cash'),
    };
  },
});

const cbScMissing = scenario({
  id: 'cb-sc-missing',
  conceptId: 'cb-single',
  difficulty: 'medium',
  setup: (rng) => singleSetup(rng, [5, 7]),
  ask: (rng, m) => {
    const outs = m.txs.map((t, i) => ({ t, i })).filter((x) => x.t.group === 'cashOut');
    if (outs.length === 0) return null;
    const { t: gap, i } = rng.pick(outs);
    const closing = closeBySides(m, 'cash');
    const knownPayments = sideTotal(m, 'cash', 'Cr') - gap.amt;
    const receipts = sideTotal(m, 'cash', 'Dr');
    return {
      question: `The cash book closed the month with a cash balance of ${f(closing)}. Find x, the amount of the payment shown as ₹x.`,
      answer: gap.amt,
      errors: [
        [m.cash0 + receipts - closing, 'Took everything that went out as this one payment, forgetting the other payments listed.'],
        [m.cash0 + receipts + knownPayments - closing, 'Added the known payments instead of deducting them.'],
        [Math.abs(closing - m.cash0), 'Compared only the opening and closing balances, ignoring the other receipts and payments.'],
      ],
      working: [
        `Total of the debit side = ${f(m.cash0)} + ${f(receipts)} = ${f(m.cash0 + receipts)}.`,
        `Payments that are known = ${f(knownPayments)}.`,
        `Debit total = payments (known + x) + closing balance, so x = ${f(m.cash0 + receipts)} - ${f(knownPayments)} - ${f(closing)} = ${f(gap.amt)}.`,
      ],
      recheck: (mm) => {
        // Run the balance forward without the unknown payment, then see what is missing to reach the closing figure.
        let running = mm.cash0;
        mm.txs.forEach((t, j) => {
          if (j !== i) running += delta(t, 'cash');
        });
        return running - closing;
      },
      hidden: i,
    };
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Which side, which column
// ---------------------------------------------------------------------------------------------------------------

interface SideCase {
  say: (x: string, p: string) => string;
  side: Side;
  account: (p: string) => string;
}

const SIDE_CASES: SideCase[] = [
  { say: (x) => `Goods were sold for ${x} in cash.`, side: 'Dr', account: () => 'Sales A/c' },
  { say: (x, p) => `${p}, a debtor, paid ${x} in cash.`, side: 'Dr', account: (p) => p },
  { say: (x) => `Rent of ${x} was paid in cash.`, side: 'Cr', account: () => 'Rent A/c' },
  { say: (x) => `Goods costing ${x} were bought for cash.`, side: 'Cr', account: () => 'Purchases A/c' },
  { say: (x) => `The owner brought ${x} in cash as capital.`, side: 'Dr', account: () => 'Capital A/c' },
  { say: (x) => `The owner took ${x} in cash for personal use.`, side: 'Cr', account: () => 'Drawings A/c' },
  { say: (x) => `Commission of ${x} was received in cash.`, side: 'Dr', account: () => 'Commission Received A/c' },
  { say: (x) => `Salaries of ${x} were paid in cash.`, side: 'Cr', account: () => 'Salaries A/c' },
  { say: (x, p) => `${x} was paid in cash to ${p}, a creditor.`, side: 'Cr', account: (p) => p },
  { say: (x) => `Old furniture was sold for ${x} in cash.`, side: 'Dr', account: () => 'Furniture A/c' },
];

const cbSide = mcqTemplate({
  id: 'cb-side',
  topicId: T,
  conceptId: 'cb-sides',
  difficulty: 'easy',
  generate: (rng) => {
    const c = rng.pick(SIDE_CASES);
    const x = f(amount(rng, 2000, 60000, 500));
    const p = party(rng);
    const acct = c.account(p);
    const word = (s: Side) => (s === 'Dr' ? 'To' : 'By');
    const name = (s: Side) => (s === 'Dr' ? 'Debit' : 'Credit');
    const label = (s: Side, w: string) => `${name(s)} side, shown as "${w} ${acct}"`;
    const opp: Side = c.side === 'Dr' ? 'Cr' : 'Dr';
    return {
      prompt: `${c.say(x, p)} In a single column cash book, on which side is it entered, and how does the particulars column read?`,
      correct: label(c.side, word(c.side)),
      distractors: [
        {
          text: label(opp, word(opp)),
          why: c.side === 'Dr' ? 'Treated money received as a payment and put it on the credit side.' : 'Treated money paid out as a receipt and put it on the debit side.',
        },
        { text: label(c.side, word(opp)), why: `Chose the right side but wrote "${word(opp)}", which belongs on the ${name(opp).toLowerCase()} side.` },
        { text: label(opp, word(c.side)), why: `Put the entry on the wrong side and used the wording of the right side.` },
      ],
      explanation:
        c.side === 'Dr'
          ? 'Cash comes in, so the entry goes on the debit (receipts) side, and the particulars column names the other account with "To".'
          : 'Cash goes out, so the entry goes on the credit (payments) side, and the particulars column names the other account with "By".',
    };
  },
  verify: (q) => {
    const t = q.options.find((o) => o.id === q.correct)?.text ?? '';
    return /^Debit side, shown as "To /.test(t) || /^Credit side, shown as "By /.test(t);
  },
});

interface ColCase {
  say: (x: string, p: string) => string;
  side: Side;
  col: Col;
}

const COL_CASES: ColCase[] = [
  { say: (x) => `Goods worth ${x} were sold for cash.`, side: 'Dr', col: 'cash' },
  { say: (x, p) => `${p}, a debtor, paid ${x} by cheque, which was banked the same day.`, side: 'Dr', col: 'bank' },
  { say: (x, p) => `${p}, a creditor, was paid ${x} by cheque.`, side: 'Cr', col: 'bank' },
  { say: (x) => `Wages of ${x} were paid in cash.`, side: 'Cr', col: 'cash' },
  { say: (x) => `The bank credited ${x} as interest to the firm's account.`, side: 'Dr', col: 'bank' },
  { say: (x) => `The bank debited ${x} as service charges.`, side: 'Cr', col: 'bank' },
  { say: (x) => `Furniture costing ${x} was bought and paid for by cheque.`, side: 'Cr', col: 'bank' },
  { say: (x) => `The owner withdrew ${x} in cash for personal use.`, side: 'Cr', col: 'cash' },
  { say: (x) => `The owner paid ${x} as capital straight into the firm's bank account.`, side: 'Dr', col: 'bank' },
  { say: (x) => `Goods costing ${x} were bought for cash.`, side: 'Cr', col: 'cash' },
  { say: (x) => `Commission of ${x} was received in cash.`, side: 'Dr', col: 'cash' },
];

const sideCol = (s: Side, c: Col) => `${s === 'Dr' ? 'Debit' : 'Credit'} side of the ${c} column`;

const cbColumn = mcqTemplate({
  id: 'cb-column',
  topicId: T,
  conceptId: 'cb-sides',
  difficulty: 'easy',
  generate: (rng) => {
    const c = rng.pick(COL_CASES);
    const x = f(amount(rng, 2000, 60000, 500));
    const p = party(rng);
    const oppSide: Side = c.side === 'Dr' ? 'Cr' : 'Dr';
    const oppCol: Col = c.col === 'cash' ? 'bank' : 'cash';
    return {
      prompt: `${c.say(x, p)} In a double column cash book, where is it entered?`,
      correct: sideCol(c.side, c.col),
      distractors: [
        { text: sideCol(oppSide, c.col), why: c.side === 'Dr' ? 'Entered a receipt on the credit side.' : 'Entered a payment on the debit side.' },
        {
          text: sideCol(c.side, oppCol),
          why: c.col === 'bank' ? 'Used the cash column although the money moved through the bank.' : 'Used the bank column although the money was received or paid in cash.',
        },
        { text: sideCol(oppSide, oppCol), why: 'Mixed up both the side and the column.' },
      ],
      explanation: `${c.side === 'Dr' ? 'Money comes in, so the debit side' : 'Money goes out, so the credit side'}; it moves ${c.col === 'bank' ? 'through the bank, so the bank column' : 'as cash, so the cash column'}.`,
    };
  },
});

const cbChequeTiming = mcqTemplate({
  id: 'cb-cheque-timing',
  topicId: T,
  conceptId: 'cb-sides',
  difficulty: 'medium',
  generate: (rng) => {
    const x = f(amount(rng, 5000, 80000, 1000));
    const mo = rng.pick(MONTHS);
    const D = (n: number) => `${n} ${mo}`;
    const mode = rng.pick(['receipt', 'deposit', 'issued'] as const);
    if (mode !== 'issued') {
      // Books differ on a cheque that is held for some days, so the question states the practice it follows: the
      // NCERT one, where the cheque counts as cash until it is deposited and the deposit is a contra entry.
      const p = customer(rng);
      const r = rng.int(2, 12);
      const d = r + rng.int(2, 5);
      const practice = 'A firm treats a cheque that is not banked on the day it is received as cash until it is deposited.';
      if (mode === 'receipt') {
        return {
          prompt: `${practice} It received a cheque for ${x} from ${p}, a debtor, on ${D(r)} and deposited it in the bank on ${D(d)}. How is the cheque entered in the double column cash book on ${D(r)}, the day it is received?`,
          correct: `Debit side of the cash column, "To ${p}"`,
          distractors: [
            { text: `Debit side of the bank column, "To ${p}"`, why: 'Entered it as if it had been banked the same day; it reaches the bank column only when it is deposited.' },
            { text: `No entry until the cheque is deposited on ${D(d)}`, why: 'Waited for the deposit; under the stated practice a cheque in hand is entered as cash on the day it is received.' },
            { text: `Credit side of the cash column, "By ${p}"`, why: 'Put a receipt on the payments side.' },
            { text: 'Debit side of the bank column and credit side of the cash column', why: 'Made the contra entry too early; that is the entry on the day the cheque is deposited.' },
          ],
          explanation: `Until it is deposited the cheque is treated as cash, so on ${D(r)} it is a cash receipt: debit side of the cash column, "To ${p}". On ${D(d)} a contra entry moves the amount to the bank column.`,
        };
      }
      return {
        prompt: `${practice} It received a cheque for ${x} from ${p}, a debtor, on ${D(r)} and entered it in the cash column that day. It deposited the cheque in the bank on ${D(d)}. How is the deposit entered in the double column cash book on ${D(d)}?`,
        correct: 'Debit side of the bank column and credit side of the cash column',
        distractors: [
          { text: `Debit side of the bank column only, "To ${p}"`, why: `Entered a fresh receipt from ${p}; the receipt is already in the cash column, so ${p} would be credited twice.` },
          { text: 'Debit side of the cash column and credit side of the bank column', why: 'Reversed the contra entry; that is how cash drawn from the bank is entered.' },
          { text: `No entry, because the receipt was entered on ${D(r)}`, why: 'Forgot that the cheque leaves the cash column and reaches the bank when it is deposited.' },
          { text: 'Credit side of the cash column only', why: 'Took the cheque out of the cash column but did not add it to the bank column.' },
        ],
        explanation: `The cheque was entered as cash on ${D(r)}. Depositing it is like paying cash into the bank: a contra entry on ${D(d)}, on the debit side of the bank column ("To Cash A/c") and the credit side of the cash column ("By Bank A/c").`,
      };
    }
    const p = supplier(rng);
    const i = rng.int(2, 12);
    const c = i + rng.int(2, 5);
    return {
      prompt: `A firm issued a cheque for ${x} to ${p}, a creditor, on ${D(i)}. ${p} presented it, and the bank paid it out of the firm's account on ${D(c)}. When and where does the firm enter the payment in its double column cash book?`,
      correct: `On ${D(i)}, credit side of the bank column`,
      distractors: [
        { text: `On ${D(c)}, credit side of the bank column`, why: 'Waited for the bank to pay the cheque before entering it.' },
        { text: `On ${D(i)}, credit side of the cash column`, why: 'Entered a cheque payment in the cash column.' },
        { text: `On ${D(i)}, debit side of the bank column`, why: 'Put a payment on the receipts side.' },
        { text: `On ${D(c)}, credit side of the cash column`, why: 'Waited for the bank to pay and then used the cash column, though no cash was paid.' },
      ],
      explanation: `A cheque is entered in the cash book on the day it is issued (${D(i)}), on the credit side of the bank column. The firm does not wait for the bank to pay it: until then the cheque is only a timing difference between the cash book and the bank's record.`,
    };
  },
});

const cbDishonour = mcqTemplate({
  id: 'cb-dishonour',
  topicId: T,
  conceptId: 'cb-sides',
  difficulty: 'medium',
  generate: (rng) => {
    const x = f(amount(rng, 5000, 60000, 1000));
    const p = customer(rng);
    const mo = rng.pick(MONTHS);
    const d1 = rng.int(2, 10);
    const d2 = d1 + rng.int(3, 8);
    const story = `A cheque for ${x} received from ${p}, a debtor, was banked on ${d1} ${mo} and entered in the bank column of the cash book. On ${d2} ${mo} the bank returned it dishonoured`;
    if (rng.pick(['where', 'account'] as const) === 'where') {
      return {
        prompt: `${story}. How is the dishonour entered in the double column cash book on ${d2} ${mo}?`,
        correct: 'Credit side of the bank column',
        distractors: [
          { text: 'Debit side of the bank column', why: 'Repeated the earlier receipt instead of reversing it.' },
          { text: 'Credit side of the cash column', why: 'Used the cash column, although the cheque was banked and it is the bank balance that falls.' },
          { text: 'No entry in the cash book', why: 'Thought a dishonour only concerns the debtor; the bank has taken the amount back, so the bank column needs an entry.' },
          { text: 'Debit side of the cash column', why: 'Treated the dishonoured cheque as cash received back.' },
        ],
        explanation: `The amount that was added to the bank balance on ${d1} ${mo} is taken back, so it is entered on the credit side of the bank column, "By ${p}". The account of ${p} is debited, because ${p} owes the amount again.`,
      };
    }
    return {
      prompt: `${story}, and the firm entered ${x} on the credit side of the bank column. Which account is debited when this entry is posted to the ledger?`,
      correct: `The account of ${p}, who owes the amount again`,
      distractors: [
        { text: 'Bad Debts A/c, because the amount is lost', why: 'Wrote the debt off; a dishonoured cheque only means that the payment failed, and the debtor still owes the amount.' },
        { text: 'Sales Return A/c, because the sale is cancelled', why: 'Cancelled the sale; no goods came back, only the payment failed.' },
        { text: 'Bank Charges A/c, because the bank took the money back', why: 'Treated the amount as a charge made by the bank; the bank only reversed a cheque that was not paid.' },
        { text: 'Discount Allowed A/c, because less was received than was due', why: 'Treated the unpaid cheque as a discount; the firm gave nothing up, and the debtor still owes the amount.' },
      ],
      explanation: `When the cheque was banked, ${p} was credited. The dishonour reverses that receipt: the bank column is credited ("By ${p}") and the account of ${p} is debited, so ${p} is shown as a debtor for ${x} again.`,
    };
  },
});

// ---------------------------------------------------------------------------------------------------------------
// What is (and is not) entered in a cash book
// ---------------------------------------------------------------------------------------------------------------

const NOT_RECORDED: { say: (x: string, p: string) => string }[] = [
  { say: (x, p) => `Goods sold on credit to ${p} for ${x}` },
  { say: (x, p) => `Goods bought on credit from ${p} for ${x}` },
  { say: (x) => `Depreciation of ${x} charged on machinery` },
  { say: (x) => `Salaries of ${x} due but not yet paid` },
  { say: (x, p) => `Goods worth ${x} returned to ${p}, a supplier, and a debit note issued` },
];

const RECORDED: { say: (x: string, p: string) => string; why: string }[] = [
  { say: (x) => `Rent of ${x} paid by cheque`, why: 'Thought a payment by cheque needs no cash book entry; it is entered in the bank column.' },
  { say: (x) => `Cash of ${x} deposited into the bank`, why: 'Thought moving money from cash to bank is not a transaction; it is a contra entry in the cash book.' },
  { say: (x, p) => `A cheque of ${x} received from ${p} and banked`, why: 'Treated a cheque as a credit item; once banked it is entered in the bank column.' },
  { say: (x) => `Goods bought for ${x} in cash`, why: 'Thought purchases are recorded only in the purchases book; the cash paid is also in the cash book.' },
  { say: (x) => `Salaries of ${x} paid in cash`, why: 'Thought expenses are recorded only in the journal; the cash paid goes in the cash book.' },
];

const cbNotRecorded = mcqTemplate({
  id: 'cb-not-recorded',
  topicId: T,
  conceptId: 'cb-single',
  difficulty: 'easy',
  generate: (rng) => {
    const x = f(amount(rng, 2000, 60000, 500));
    const p = party(rng);
    const pickRecorded = () => rng.shuffle(RECORDED).slice(0, 4);
    if (rng.pick(['not', 'is'] as const) === 'not') {
      const right = rng.pick(NOT_RECORDED);
      return {
        prompt: 'Which one of these is NOT entered in the cash book?',
        correct: right.say(x, p),
        distractors: pickRecorded().map((r) => ({ text: r.say(x, p), why: r.why })),
        explanation: 'The cash book records only receipts and payments of cash or by cheque. A credit transaction or a non-cash adjustment is recorded in another book.',
      };
    }
    const right = rng.pick(RECORDED);
    const others = rng.shuffle(NOT_RECORDED).slice(0, 4);
    return {
      prompt: 'Which one of these is entered in the cash book?',
      correct: right.say(x, p),
      distractors: others.map((o) => ({ text: o.say(x, p), why: 'No cash or cheque changes hands in this transaction, so it is recorded in another book, not the cash book.' })),
      explanation: 'The cash book records money actually received or paid (cash or by cheque). The other items are credit transactions or adjustments.',
    };
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Double column cash book
// ---------------------------------------------------------------------------------------------------------------

const cbDcClosingCash = scenario({
  id: 'cb-dc-closing-cash',
  conceptId: 'cb-double',
  difficulty: 'medium',
  setup: (rng) => doubleSetup(rng, { n: [6, 8] }),
  ask: (_rng, m) => closingAsk(m, 'cash'),
});

const cbDcClosingBank = scenario({
  id: 'cb-dc-closing-bank',
  conceptId: 'cb-double',
  difficulty: 'medium',
  setup: (rng) => doubleSetup(rng, { n: [6, 8] }),
  ask: (_rng, m) => closingAsk(m, 'bank'),
});

const cbDcIgnoreCredit = scenario({
  id: 'cb-dc-ignore-credit',
  conceptId: 'cb-double',
  difficulty: 'complex',
  setup: (rng) => doubleSetup(rng, { n: [7, 9], pool: [...BASE, DEPOSIT, WITHDRAW, ...NON_CASH], need: [DEPOSIT, ...rng.shuffle(NON_CASH).slice(0, 2)] }),
  ask: (rng, m) => closingAsk(m, rng.pick(['cash', 'bank'] as const)),
});

const cbDcCombined = scenario({
  id: 'cb-dc-combined',
  conceptId: 'cb-double',
  difficulty: 'complex',
  setup: (rng) => doubleSetup(rng, { n: [6, 8], need: [DEPOSIT, WITHDRAW] }),
  ask: (_rng, m) => combinedAsk(m),
});

// ---------------------------------------------------------------------------------------------------------------
// Balancing, overdraft
// ---------------------------------------------------------------------------------------------------------------

const cbScOpening = scenario({
  id: 'cb-sc-opening',
  conceptId: 'cb-balancing',
  difficulty: 'medium',
  setup: (rng) => singleSetup(rng),
  ask: (_rng, m) => {
    const closing = closeBySides(m, 'cash');
    const receipts = sideTotal(m, 'cash', 'Dr');
    const payments = sideTotal(m, 'cash', 'Cr');
    if (closing <= 0) return null;
    return {
      question: `The cash book closed the month with ${f(closing)} in cash. How much cash did the firm have on 1 ${m.month}?`,
      answer: m.cash0,
      errors: [
        [closing + receipts - payments, 'Applied the month\'s receipts and payments forwards from the closing balance instead of working back.'],
        [closing - receipts - payments, 'Deducted both the receipts and the payments when working back.'],
        [closing + receipts + payments, 'Added both the receipts and the payments when working back.'],
      ],
      working: [
        'Closing balance = opening balance + receipts - payments, so opening balance = closing balance - receipts + payments.',
        `Receipts = ${f(receipts)} and payments = ${f(payments)}.`,
        `Opening balance = ${f(closing)} - ${f(receipts)} + ${f(payments)} = ${f(m.cash0)}.`,
      ],
      recheck: (mm) => closing - sum(mm.txs.map((t) => delta(t, 'cash'))),
      hide: 'cash',
    };
  },
});

const cbBalOpeningDc = scenario({
  id: 'cb-bal-opening-dc',
  conceptId: 'cb-balancing',
  difficulty: 'medium',
  setup: (rng) => doubleSetup(rng, { n: [5, 7] }),
  ask: (rng, m) => {
    const cashClose = closeBySides(m, 'cash');
    const bankClose = closeBySides(m, 'bank');
    if (cashClose <= 0 || bankClose <= 0) return null;
    const col = rng.pick(['cash', 'bank'] as const);
    const close = col === 'cash' ? cashClose : bankClose;
    const answer = col === 'cash' ? m.cash0 : m.bank0;
    const drs = sideTotal(m, col, 'Dr');
    const crs = sideTotal(m, col, 'Cr');
    const contra = sum(m.txs.filter((t) => t.contra).map((t) => delta(t, col)));
    return {
      question: `At the end of the month the cash balance was ${f(cashClose)} and the bank balance was ${f(bankClose)}. What was the opening ${col} balance on 1 ${m.month}?`,
      answer,
      errors: [
        [close + drs - crs, `Worked forwards from the closing ${col} balance instead of backwards.`],
        [close - (drs - crs - contra), `Left the contra entries out of the ${col} column when working back.`],
        [close - drs - crs, 'Deducted both the receipts and the payments when working back.'],
        [col === 'cash' ? m.bank0 : m.cash0, 'Gave the opening balance of the other column.'],
      ],
      working: [
        `Debits in the ${col} column during the month = ${f(drs)} and credits = ${f(crs)}.`,
        `Opening ${col} balance = closing balance - debits + credits = ${f(close)} - ${f(drs)} + ${f(crs)} = ${f(answer)}.`,
        'Contra entries are part of the debits and credits of both columns.',
      ],
      recheck: (mm) => close - sum(mm.txs.map((t) => delta(t, col))),
      hide: col,
    };
  },
});

const cbDcOverdraft = scenario({
  id: 'cb-dc-overdraft',
  conceptId: 'cb-balancing',
  difficulty: 'medium',
  setup: (rng) => doubleSetup(rng, { n: [5, 7], overdraft: true }),
  ask: (_rng, m) => bankOrOverdraftAsk(m),
});

const cbDcBankComplex = scenario({
  id: 'cb-dc-bank-complex',
  conceptId: 'cb-balancing',
  difficulty: 'complex',
  setup: (rng) => doubleSetup(rng, { n: [7, 9], overdraft: true, pool: [...BASE, DEPOSIT, WITHDRAW, ...SLIPS], need: [DEPOSIT, ...rng.shuffle(SLIPS).slice(0, 2)] }),
  ask: (_rng, m) => bankOrOverdraftAsk(m),
});

const cbDcTotals = scenario({
  id: 'cb-dc-totals',
  conceptId: 'cb-balancing',
  difficulty: 'complex',
  setup: (rng) => doubleSetup(rng, { n: [6, 8], overdraft: true, pool: [...BASE, DEPOSIT, WITHDRAW, ...SLIPS] }),
  ask: (_rng, m) => {
    const open = m.bank0;
    const drItems = Math.max(open, 0) + sideTotal(m, 'bank', 'Dr');
    const crItems = Math.max(-open, 0) + sideTotal(m, 'bank', 'Cr');
    const close = drItems - crItems;
    if (close === 0) return null;
    const answer = Math.max(drItems, crItems);
    return {
      question: 'After the bank column is balanced, at what figure do its debit side and credit side both total?',
      answer,
      errors: [
        [Math.min(drItems, crItems), 'Gave the smaller side, before the balance carried down was added to it.'],
        [drItems + crItems, 'Added the two sides together instead of reading one of them.'],
        [Math.abs(close), 'Gave the balancing figure (the closing balance or overdraft) instead of the total of the side.'],
        [Math.max(sideTotal(m, 'bank', 'Dr'), sideTotal(m, 'bank', 'Cr')), 'Left the opening balance (or overdraft) out of the totals.'],
      ],
      working: [
        ...columnLines(m, 'bank').slice(0, 2),
        close >= 0 ? `The credit side is smaller by ${f(close)}, so "By Balance c/d ${f(close)}" is entered on it.` : `The debit side is smaller by ${f(-close)}, so "To Balance c/d ${f(-close)}" (the overdraft) is entered on it.`,
        `Both sides therefore total ${f(answer)}.`,
      ],
      // The larger side equals the smaller side plus the balancing figure.
      recheck: (mm) => {
        const o = mm.bank0;
        const dr = Math.max(o, 0) + sideTotal(mm, 'bank', 'Dr');
        const cr = Math.max(-o, 0) + sideTotal(mm, 'bank', 'Cr');
        return Math.min(dr, cr) + Math.abs(dr - cr);
      },
    };
  },
});

const cbBalFromTotals = numericRun({
  id: 'cb-bal-from-totals',
  conceptId: 'cb-balancing',
  difficulty: 'easy',
  run: (rng) => {
    const col = rng.pick(['cash', 'bank'] as const);
    const a = amount(rng, 20000, 100000, 1000);
    const b = col === 'cash' ? a - amount(rng, 2000, 15000, 1000) : amount(rng, 20000, 100000, 1000);
    if (a === b || b <= 0) return null;
    const answer = Math.abs(a - b);
    if (col === 'cash') {
      return {
        prompt: `The debit side of a firm's cash column totals ${f(a)} (the opening balance and all receipts) and the credit side totals ${f(b)} (all payments). What is the closing cash balance?`,
        answer,
        errors: [
          [a + b, 'Added the payments to the receipts.'],
          [a, 'Gave the total of the receipts and forgot to deduct the payments.'],
          [b, 'Gave the total of the payments instead of the balance.'],
        ],
        working: [`Closing cash balance = debit side - credit side = ${f(a)} - ${f(b)} = ${f(answer)}.`, 'It is entered on the credit side as "By Balance c/d" to make the two sides equal.'],
        recheck: () => a - b,
      };
    }
    return {
      prompt: `In a firm's bank column the debit side totals ${f(a)} (including any opening favourable balance) and the credit side totals ${f(b)} (including any opening overdraft). What is the closing balance? If the account is overdrawn, give the amount of the overdraft.`,
      answer,
      errors: [
        [a + b, 'Added the two sides together.'],
        [Math.max(a, b), 'Gave the larger side instead of the difference.'],
        [Math.min(a, b), 'Gave the smaller side instead of the difference.'],
      ],
      working: [
        a > b ? `Debit side ${f(a)} is larger, so there is a favourable bank balance of ${f(a)} - ${f(b)} = ${f(answer)}.` : `Credit side ${f(b)} is larger, so the account is overdrawn by ${f(b)} - ${f(a)} = ${f(answer)}.`,
        a > b ? 'It is entered on the credit side as "By Balance c/d".' : 'The overdraft is entered on the debit side as "To Balance c/d".',
      ],
      recheck: () => (a > b ? a - b : b - a),
    };
  },
});

interface BalCase {
  say: (x: string) => string;
  side: Side;
  col: Col;
  sideWhy: string;
  colWhy: string;
}

const BAL_CASES: BalCase[] = [
  {
    say: (x) => `After all the entries of the month, the debit side of the cash column (the opening balance and the receipts) is larger than its credit side (the payments) by ${x}. The closing cash balance is entered to balance the column.`,
    side: 'Cr', col: 'cash',
    sideWhy: 'Put the closing balance on the debit side, which is already the larger side; the balance goes on the smaller side.',
    colWhy: 'Used the bank column for a balance of cash in hand.',
  },
  {
    say: (x) => `After all the entries of the month, the debit side of the bank column is larger than its credit side by ${x}. The favourable closing bank balance is entered to balance the column.`,
    side: 'Cr', col: 'bank',
    sideWhy: 'Put the closing balance on the debit side, which is already the larger side; the balance goes on the smaller side.',
    colWhy: 'Used the cash column for a bank balance.',
  },
  {
    say: (x) => `After all the entries of the month, the credit side of the bank column is larger than its debit side by ${x}, so the account is overdrawn. The closing overdraft is entered to balance the column.`,
    side: 'Dr', col: 'bank',
    sideWhy: 'Treated the overdraft like a favourable balance and put it on the credit side; here the debit side is the smaller one.',
    colWhy: 'Put an overdraft in the cash column, though it is a bank figure.',
  },
  {
    say: (x) => `On 1 May the firm's bank account was overdrawn by ${x}. The opening overdraft is entered at the start of the double column cash book.`,
    side: 'Cr', col: 'bank',
    sideWhy: 'Treated the opening overdraft as a favourable balance and put it on the debit side.',
    colWhy: 'Put an overdraft in the cash column, though it is a bank figure.',
  },
  {
    say: (x) => `On 1 May the firm had ${x} in cash. The opening cash balance is entered at the start of the double column cash book.`,
    side: 'Dr', col: 'cash',
    sideWhy: 'Entered the opening cash balance on the credit side as if it were a payment.',
    colWhy: 'Put the opening cash balance in the bank column.',
  },
  {
    say: (x) => `On 1 May the firm had ${x} at the bank, a favourable balance. The opening bank balance is entered at the start of the double column cash book.`,
    side: 'Dr', col: 'bank',
    sideWhy: 'Entered the opening bank balance on the credit side as if it were a payment.',
    colWhy: 'Put the opening bank balance in the cash column.',
  },
];

/** One explanation for each of the cases above, in the same order. */
const BAL_EXPLAIN = [
  'The debit side is the larger one, so the closing cash balance goes on the smaller credit side as "By Balance c/d" to make the two sides equal. It is brought down on the debit side as "To Balance b/d".',
  'The debit side is the larger one, so the favourable closing bank balance goes on the smaller credit side of the bank column as "By Balance c/d". It is brought down on the debit side as "To Balance b/d".',
  'The credit side is the larger one, so the debit side is the smaller. The overdraft is entered there, on the debit side of the bank column, as "To Balance c/d", and brought down on the credit side as "By Balance b/d".',
  'An overdraft is a credit balance of the bank column, so it opens on the credit side as "By Balance b/d".',
  'Cash in hand is an asset, a debit balance, so it opens on the debit side of the cash column as "To Balance b/d".',
  'A favourable bank balance is an asset, a debit balance, so it opens on the debit side of the bank column as "To Balance b/d".',
];

const cbBalSide = mcqTemplate({
  id: 'cb-bal-side',
  topicId: T,
  conceptId: 'cb-balancing',
  difficulty: 'medium',
  generate: (rng) => {
    const i = rng.int(0, BAL_CASES.length - 1);
    const c = BAL_CASES[i];
    const x = f(amount(rng, 5000, 90000, 1000));
    const oppSide: Side = c.side === 'Dr' ? 'Cr' : 'Dr';
    const oppCol: Col = c.col === 'cash' ? 'bank' : 'cash';
    return {
      prompt: `${c.say(x)} On which side of which column does it appear?`,
      correct: sideCol(c.side, c.col),
      distractors: [
        { text: sideCol(oppSide, c.col), why: c.sideWhy },
        { text: sideCol(c.side, oppCol), why: c.colWhy },
        { text: sideCol(oppSide, oppCol), why: 'Got both the side and the column wrong.' },
      ],
      explanation: BAL_EXPLAIN[i],
    };
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Contra entries
// ---------------------------------------------------------------------------------------------------------------

const CONTRAS = [
  (x: string) => `${x} of cash was deposited into the bank`,
  (x: string) => `Surplus cash of ${x} was paid into the bank account`,
  (x: string) => `${x} was withdrawn from the bank for office use`,
  (x: string) => `${x} was drawn in cash from the bank for use in the office`,
];

const NOT_CONTRA: { say: (x: string, p: string) => string; why: string }[] = [
  { say: (x, p) => `A cheque for ${x} was received from ${p}, a debtor, and banked the same day`, why: 'Saw money going into the bank and called it contra, but the other account is a debtor, not cash.' },
  { say: (x) => `The owner withdrew ${x} from the bank for personal use`, why: 'Both cash and bank are in the story, but the other account is Drawings, not Cash; for a contra both accounts are in the cash book.' },
  { say: (x, p) => `A cheque for ${x} was paid to ${p}, a creditor`, why: 'Took a payment by cheque as a contra; only the bank column and a creditor are involved.' },
  { say: (x) => `Goods were sold for ${x} in cash`, why: 'Thought any cash receipt is a contra entry; the other account is Sales, not Bank.' },
  { say: (x) => `Rent of ${x} was paid in cash`, why: 'Thought a cash payment is a contra entry; the other account is Rent, not Bank.' },
  { say: (x, p) => `${p}, a debtor, paid ${x} in cash`, why: 'Took a cash receipt for a contra entry; the other account is a debtor.' },
];

const cbContraIdentify = mcqTemplate({
  id: 'cb-contra-identify',
  topicId: T,
  conceptId: 'cb-contra',
  difficulty: 'easy',
  generate: (rng) => {
    const x = f(amount(rng, 2000, 60000, 500));
    const p = party(rng);
    if (rng.pick(['is', 'not'] as const) === 'is') {
      const right = rng.pick(CONTRAS);
      return {
        prompt: 'Which one of these is a contra entry?',
        correct: right(x),
        distractors: rng.shuffle(NOT_CONTRA).slice(0, 4).map((n) => ({ text: n.say(x, p), why: n.why })),
        explanation: 'A contra entry is one in which both the cash and the bank account are involved: cash is paid into the bank, or drawn from it. It appears on opposite sides of the two columns.',
      };
    }
    // Three different contra entries (one deposit of cash, one withdrawal, one cheque in hand banked), so that no two
    // options describe the same transaction.
    const right = rng.pick(NOT_CONTRA);
    const held = customer(rng);
    const y = f(amount(rng, 2000, 60000, 500));
    const contras = [rng.pick(CONTRAS.slice(0, 2))(x), rng.pick(CONTRAS.slice(2))(y), `A cheque for ${y} received from ${held} two days earlier, and kept in the office, was paid into the bank`];
    return {
      prompt: 'The firm treats a cheque that is not banked on the day it is received as cash until it is deposited. Which one of these is NOT a contra entry?',
      correct: right.say(x, p),
      distractors: contras.map((text) => ({ text, why: 'Took a movement of money between cash and bank for an ordinary entry; this one is a contra.' })),
      explanation: 'A contra entry moves money between cash and bank, so both columns are used; the other three options do exactly that (a cheque kept in the office stands in the cash column until it is banked). This transaction uses only one of the two columns, with another account (a debtor, a creditor, an expense, an income or drawings) on the other side.',
    };
  },
});

const cbContraEffect = mcqTemplate({
  id: 'cb-contra-effect',
  topicId: T,
  conceptId: 'cb-contra',
  difficulty: 'easy',
  generate: (rng) => {
    const x = f(amount(rng, 2000, 60000, 500));
    const mode = rng.pick(['deposit', 'withdraw', 'total'] as const);
    if (mode === 'total') {
      return {
        prompt: `${x} of cash is deposited into the firm's bank account. What is the effect on the total of the cash balance and the bank balance taken together?`,
        correct: 'No change in the total',
        distractors: [
          { text: `The total rises by ${x}`, why: 'Counted the rise in the bank balance and ignored the matching fall in cash.' },
          { text: `The total falls by ${x}`, why: 'Counted the fall in cash as money leaving the firm; it only moved to the bank.' },
          { text: `The total rises by twice ${x}`, why: 'Counted the amount twice, once in each column.' },
        ],
        explanation: 'A contra entry only moves money from one column to the other. What one balance loses, the other gains.',
      };
    }
    const dep = mode === 'deposit';
    return {
      prompt: dep
        ? `${x} of cash is deposited into the firm's bank account. What is the effect on the balances in the cash book?`
        : `${x} is withdrawn from the firm's bank account for office use. What is the effect on the balances in the cash book?`,
      correct: dep ? `Cash balance falls by ${x} and bank balance rises by ${x}` : `Cash balance rises by ${x} and bank balance falls by ${x}`,
      distractors: [
        { text: dep ? `Cash balance rises by ${x} and bank balance falls by ${x}` : `Cash balance falls by ${x} and bank balance rises by ${x}`, why: 'Reversed the direction of the contra entry.' },
        { text: `Both balances rise by ${x}`, why: 'Counted the receipt in one column and forgot that the money leaves the other.' },
        { text: `Both balances fall by ${x}`, why: 'Treated the transfer as a payment that leaves the business.' },
        { text: `Only the ${dep ? 'bank' : 'cash'} balance changes, by ${x}`, why: 'Forgot the second leg: a contra entry changes both columns.' },
      ],
      explanation: dep ? 'Cash is paid out of hand (credit, cash column) and the bank receives it (debit, bank column).' : 'The bank pays out (credit, bank column) and the cash in hand rises (debit, cash column).',
    };
  },
});

const cbContraSides = mcqTemplate({
  id: 'cb-contra-sides',
  topicId: T,
  conceptId: 'cb-contra',
  difficulty: 'easy',
  generate: (rng) => {
    const x = f(amount(rng, 2000, 60000, 500));
    const dep = rng.pick([true, false]);
    const dr = dep ? 'bank' : 'cash';
    const cr = dep ? 'cash' : 'bank';
    return {
      prompt: dep
        ? `${x} of cash is deposited into the bank. How is the contra entry made in the double column cash book?`
        : `${x} is drawn from the bank for office use. How is the contra entry made in the double column cash book?`,
      correct: `Debit side of the ${dr} column and credit side of the ${cr} column`,
      distractors: [
        { text: `Debit side of the ${cr} column and credit side of the ${dr} column`, why: dep ? 'Reversed it: that is how a withdrawal from the bank is entered.' : 'Reversed it: that is how a deposit into the bank is entered.' },
        { text: 'Debit side of both columns', why: 'Treated it as a receipt in both columns.' },
        { text: 'Credit side of both columns', why: 'Treated it as a payment in both columns.' },
        { text: `Debit side of the ${dr} column only`, why: 'Left out the credit to the other column; a contra entry has two parts.' },
      ],
      explanation: `The ${dr} column receives the money (debit) and the ${cr} column gives it up (credit). The entry is marked "C" in the L.F. column and is not posted to the ledger.`,
    };
  },
});

const cbContraEntry = journalTemplate({
  id: 'cb-contra-entry',
  topicId: T,
  conceptId: 'cb-contra',
  difficulty: 'easy',
  generate: (rng) => {
    const a = amount(rng, 5000, 80000, 1000);
    const dep = rng.pick([true, false]);
    const lines: JournalLine[] = dep
      ? [{ accountId: 'bank', side: 'Dr', amount: a }, { accountId: 'cash', side: 'Cr', amount: a }]
      : [{ accountId: 'cash', side: 'Dr', amount: a }, { accountId: 'bank', side: 'Cr', amount: a }];
    return {
      prompt: dep
        ? `Cash of ${f(a)} was deposited into the firm's bank account. Show the two accounts of the contra entry, with the side of each.`
        : `${f(a)} was withdrawn from the bank for use in the office. Show the two accounts of the contra entry, with the side of each.`,
      lines,
      explanation: dep
        ? ['The bank balance rises, so Bank A/c is debited.', 'Cash goes out of hand, so Cash A/c is credited.', 'Both accounts are in the cash book, so this is a contra entry.']
        : ['Cash in hand rises, so Cash A/c is debited.', 'The bank balance falls, so Bank A/c is credited.', 'Both accounts are in the cash book, so this is a contra entry.'],
      distractorAccounts: ['drawings', 'bankOverdraft'],
    };
  },
});

const contraSetup = (rng: Rng) => doubleSetup(rng, { n: [6, 8], need: [DEPOSIT, WITHDRAW] });

const cbContraTotal = scenario({
  id: 'cb-contra-total',
  conceptId: 'cb-contra',
  difficulty: 'medium',
  setup: contraSetup,
  ask: (_rng, m) => {
    const contras = m.txs.filter((t) => t.contra);
    const answer = sum(contras.map((t) => t.amt));
    const dep = sum(contras.filter((t) => t.group === 'deposit').map((t) => t.amt));
    const wd = sum(contras.filter((t) => t.group === 'withdraw').map((t) => t.amt));
    return {
      question: 'What is the total value of the contra entries in the month? Count each contra entry once.',
      answer,
      errors: [
        [answer * 2, 'Counted every contra entry twice, once for each column.'],
        [dep, 'Counted only the deposits into the bank.'],
        [wd, 'Counted only the withdrawals from the bank.'],
        [sum(m.txs.filter((t) => t.group === 'bankIn' || t.group === 'bankOut').map((t) => t.amt)) + answer, 'Counted ordinary cheque receipts and payments as contra entries as well.'],
      ],
      working: [
        `Contra entries: ${contras.map((t) => f(t.amt)).join(' + ')} = ${f(answer)}.`,
        'Only a movement between cash and bank is a contra entry. Cheques from debtors, payments to creditors and drawings are not.',
        'Each contra entry is one transaction, even though it is entered in both columns.',
      ],
      recheck: (mm) => sum(mm.txs.filter((t) => t.legs.length === 2).flatMap((t) => t.legs.filter((l) => l.col === 'cash').map(() => t.amt))),
    };
  },
});

const cbContraCount = scenario({
  id: 'cb-contra-count',
  conceptId: 'cb-contra',
  difficulty: 'medium',
  unit: 'number',
  // One to four contra entries among the ordinary items, so that the count is not the same in every question.
  setup: (rng) =>
    doubleSetup(rng, { n: [6, 9], pool: BASE, need: Array.from({ length: rng.int(1, 4) }, () => rng.pick([DEPOSIT, WITHDRAW])) }),
  ask: (_rng, m) => {
    const contras = m.txs.map((t, i) => ({ t, i })).filter((x) => x.t.contra);
    const n = contras.length;
    const touchingBank = m.txs.filter((t) => t.legs.some((l) => l.col === 'bank')).length;
    const touchingCash = m.txs.filter((t) => t.legs.some((l) => l.col === 'cash')).length;
    const ownerBank = m.txs.filter((t) => t.ownerBank).length;
    const banked = m.txs.filter((t) => t.group === 'bankIn').length;
    return {
      question: 'How many of these transactions are contra entries?',
      answer: n,
      errors: [
        [n * 2, 'Counted each contra entry twice, once for each column it appears in.'],
        [n + ownerBank, 'Counted the owner\'s withdrawal from the bank for personal use as a contra entry; the other account is Drawings, not Cash.'],
        [n + banked, 'Counted cheques banked as contra entries; the other account is a customer or an income, not Cash.'],
        [touchingBank, 'Counted every transaction that touches the bank column.'],
        [touchingCash, 'Counted every transaction that touches the cash column.'],
      ],
      working: [
        `Contra entries (cash paid into the bank, or cash drawn from the bank for the office): ${contras.map((x) => m.dates[x.i]).join(', ')}. That is ${n} of the ${m.txs.length} transactions.`,
        'A contra entry has cash on one side and bank on the other, with no outside account such as a debtor, an expense or drawings.',
      ],
      recheck: (mm) => mm.txs.filter((t) => t.legs.length === 2 && t.legs[0].col !== t.legs[1].col).length,
    };
  },
});

const cbContraBalance = scenario({
  id: 'cb-contra-balance',
  conceptId: 'cb-contra',
  difficulty: 'easy',
  setup: (rng) =>
    build(rng, {
      style: 'double',
      n: rng.int(2, 3),
      cash0: amount(rng, 20000, 60000, 1000),
      bank0: amount(rng, 20000, 100000, 5000),
      pool: [DEPOSIT, WITHDRAW],
      need: [DEPOSIT],
    }),
  // A deposit and a withdrawal take turns: two of a kind on days next to each other would read as one transaction twice.
  ask: (rng, m) => {
    if (m.txs.some((t, i) => i > 0 && t.group === m.txs[i - 1].group)) return null;
    const which = rng.pick(['cash', 'bank', 'both'] as const);
    if (which === 'both') return combinedAsk(m);
    const a = closingAsk(m, which);
    if (!a) return null;
    return { ...a, errors: [...a.errors, [balance(m, which, { reverseContra: true }), 'Reversed the direction of the contra entries.']] };
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Discount (the current treatment: the cash book has only cash and bank columns)
// ---------------------------------------------------------------------------------------------------------------

const cbDiscWhere = mcqTemplate({
  id: 'cb-disc-where',
  topicId: T,
  conceptId: 'cb-discount',
  difficulty: 'easy',
  generate: (rng) => {
    const due = amount(rng, 5000, 80000, 1000);
    const pct = rng.pick([2, 5, 10]);
    const disc = percentOf(due, pct);
    const paid = due - disc;
    const p = party(rng);
    const [D, P, S] = [f(due), f(paid), f(disc)];
    const base = 'In the current treatment the cash book has only a cash column and a bank column, with no discount column.';
    if (rng.pick(['debtor', 'creditor'] as const) === 'debtor') {
      return {
        prompt: `${p}, a debtor, owed the firm ${D} and settled the account in full by paying ${P} by cheque, banked the same day. ${base} Where is the discount of ${S} recorded?`,
        correct: 'By a journal entry debiting Discount Allowed A/c',
        distractors: [
          { text: 'In a discount column on the debit side of the cash book', why: 'Used the old three column cash book; here the cash book has no discount column.' },
          { text: `In the bank column of the cash book, which then shows ${D}`, why: `Entered the full amount due, although only ${P} reached the bank.` },
          { text: 'By a journal entry crediting Discount Received A/c', why: 'Mixed up discount allowed and discount received; the firm gave this discount away.' },
          { text: 'It is not recorded anywhere, because no money moves', why: 'Thought a discount needs no entry; the debtor still has to be credited with the full amount, so the discount must be recorded.' },
        ],
        explanation: `Only the ${P} actually received is entered in the cash book. The ${S} the firm gave up is a loss, recorded by a journal entry: Discount Allowed A/c Dr, To ${p}.`,
      };
    }
    return {
      prompt: `The firm owed ${p}, a creditor, ${D} and settled the account in full by paying ${P} by cheque. ${base} Where is the discount of ${S} recorded?`,
      correct: 'By a journal entry crediting Discount Received A/c',
      distractors: [
        { text: 'In a discount column on the credit side of the cash book', why: 'Used the old three column cash book; here the cash book has no discount column.' },
        { text: `In the bank column of the cash book, which then shows ${D}`, why: `Entered the full amount due, although only ${P} left the bank.` },
        { text: 'By a journal entry debiting Discount Allowed A/c', why: 'Mixed up discount allowed and discount received; the supplier gave this discount to the firm.' },
        { text: 'It is not recorded anywhere, because no money moves', why: 'Thought a discount needs no entry; the creditor must be debited with the full amount, so the discount must be recorded.' },
      ],
      explanation: `Only the ${P} actually paid is entered in the cash book. The ${S} saved is a gain, recorded by a journal entry: ${p} Dr, To Discount Received A/c.`,
    };
  },
});

const cbDiscAccount = mcqTemplate({
  id: 'cb-disc-account',
  topicId: T,
  conceptId: 'cb-discount',
  difficulty: 'easy',
  generate: (rng) => {
    const x = f(amount(rng, 100, 5000, 100));
    const p = party(rng);
    const allowed = 'Discount Allowed A/c is debited (a loss)';
    const received = 'Discount Received A/c is credited (a gain)';
    const options = {
      allowed,
      received,
      allowedCr: 'Discount Allowed A/c is credited (a gain)',
      receivedDr: 'Discount Received A/c is debited (a loss)',
      none: 'No entry is made; only the net price is recorded',
    };
    type K = keyof typeof options;
    const cases: { prompt: string; right: K; wrong: [K, string][]; why: string }[] = [
      {
        prompt: `${p}, a debtor, paid the account promptly and the firm allowed a cash discount of ${x}. How is the discount recorded?`,
        right: 'allowed',
        wrong: [
          ['received', 'Mixed up discount allowed and discount received; the firm gave this one away.'],
          ['allowedCr', 'Treated discount given to a customer as a gain.'],
          ['none', 'Treated a cash discount like a trade discount, which is not recorded.'],
          ['receivedDr', 'Chose the right side but the wrong account.'],
        ],
        why: 'The firm gave up money to get paid early, which is a loss, so Discount Allowed A/c is debited.',
      },
      {
        prompt: `The firm paid ${p}, a creditor, promptly and the creditor allowed it a cash discount of ${x}. How is the discount recorded?`,
        right: 'received',
        wrong: [
          ['allowed', 'Mixed up discount allowed and discount received; here the firm gained.'],
          ['receivedDr', 'Treated a discount received from a supplier as a loss.'],
          ['none', 'Treated a cash discount like a trade discount, which is not recorded.'],
          ['allowedCr', 'Chose the right side but the wrong account.'],
        ],
        why: 'The firm paid less than it owed, which is a gain, so Discount Received A/c is credited.',
      },
      {
        prompt: `A supplier sells goods to the firm at the list price less ${x} trade discount, shown on the invoice. How is the trade discount recorded?`,
        right: 'none',
        wrong: [
          ['received', 'Treated the trade discount as a cash discount received.'],
          ['receivedDr', 'Treated a trade discount as a loss.'],
          ['allowed', 'Treated a discount on the purchase as a discount allowed.'],
          ['allowedCr', 'Treated a trade discount as a gain through Discount Allowed.'],
        ],
        why: 'A trade discount is deducted from the list price before anything is recorded; the books show only the net price.',
      },
    ];
    const c = rng.pick(cases);
    return {
      prompt: c.prompt,
      correct: options[c.right],
      distractors: c.wrong.map(([k, why]) => ({ text: options[k], why })),
      explanation: c.why,
    };
  },
});

const discDeal = (rng: Rng) => {
  const due = amount(rng, 5000, 80000, 1000);
  const pct = rng.pick([2, 3, 4, 5, 10]);
  const disc = percentOf(due, pct);
  return { due, pct, disc, paid: due - disc, p: party(rng) };
};

const cbDiscCashReceived = numericRun({
  id: 'cb-disc-cash-received',
  conceptId: 'cb-discount',
  difficulty: 'medium',
  run: (rng) => {
    const { due, pct, disc, paid, p } = discDeal(rng);
    const how = rng.pick(['cash', 'bank'] as const);
    const incoming = rng.pick([true, false]);
    const mode = how === 'cash' ? 'in cash' : 'by cheque, banked the same day';
    const column = how === 'cash' ? 'cash' : 'bank';
    const note = 'The cash book has only cash and bank columns, and the discount is recorded elsewhere.';
    return {
      prompt: incoming
        ? `${p}, a debtor, owed the firm ${f(due)} and settled the account in full ${mode} after a cash discount of ${pct}%. ${note} What amount is entered on the debit side of the ${column} column?`
        : `The firm owed ${p}, a creditor, ${f(due)} and settled the account in full ${how === 'cash' ? 'in cash' : 'by cheque'}, ${p} allowing a cash discount of ${pct}%. ${note} What amount is entered on the credit side of the ${column} column?`,
      answer: paid,
      errors: [
        [due, 'Entered the full amount due, ignoring that the discount was not paid.'],
        [disc, 'Entered the discount instead of the amount actually paid or received.'],
        [due + disc, 'Added the discount to the amount due.'],
      ],
      working: [
        `Discount = ${pct}% of ${f(due)} = ${f(disc)}.`,
        `Amount actually ${incoming ? 'received' : 'paid'} = ${f(due)} - ${f(disc)} = ${f(paid)}.`,
        `Only ${f(paid)} is entered in the cash book; the ${f(disc)} discount is recorded in ${incoming ? 'Discount Allowed' : 'Discount Received'} A/c through the journal.`,
      ],
      recheck: () => Math.round((due * (100 - pct)) / 100),
    };
  },
});

const cbDiscAmount = numericRun({
  id: 'cb-disc-amount',
  conceptId: 'cb-discount',
  difficulty: 'medium',
  run: (rng) => {
    const { due, pct, disc, paid, p } = discDeal(rng);
    const incoming = rng.pick([true, false]);
    const account = incoming ? 'Discount Allowed A/c' : 'Discount Received A/c';
    if (rng.pick(['given', 'rate'] as const) === 'given') {
      return {
        prompt: incoming
          ? `${p}, a debtor, owed ${f(due)} and settled in full by paying ${f(paid)}. What amount is recorded in Discount Allowed A/c?`
          : `The firm owed ${p}, a creditor, ${f(due)} and settled in full by paying ${f(paid)}. What amount is recorded in Discount Received A/c?`,
        answer: disc,
        errors: [
          [paid, 'Gave the amount actually paid instead of the discount.'],
          [due, 'Gave the amount due instead of the discount.'],
          [due + paid, 'Added the amount due and the amount paid.'],
        ],
        working: [`Discount = amount due - amount paid = ${f(due)} - ${f(paid)} = ${f(disc)}.`, `${f(disc)} is recorded in ${account}.`],
        recheck: () => Math.round((due * pct) / 100),
      };
    }
    return {
      prompt: incoming
        ? `${p}, a debtor, settled the account in full by paying ${f(paid)} after the firm allowed a ${pct}% cash discount on the amount due. What amount is recorded in Discount Allowed A/c?`
        : `The firm settled its account with ${p}, a creditor, in full by paying ${f(paid)} after ${p} allowed a ${pct}% cash discount on the amount due. What amount is recorded in Discount Received A/c?`,
      answer: disc,
      errors: [
        [percentOf(paid, pct), 'Took the percentage on the amount paid instead of on the amount due.'],
        [paid, 'Gave the amount actually paid instead of the discount.'],
        [due, 'Gave the amount due instead of the discount.'],
      ],
      working: [
        `The amount paid is (100 - ${pct})% = ${100 - pct}% of the amount due, so the amount due = ${f(paid)} x 100 / ${100 - pct} = ${f(due)}.`,
        `Discount = ${pct}% of ${f(due)} = ${f(disc)}.`,
        `${f(disc)} is recorded in ${account}.`,
      ],
      recheck: () => Math.round((paid * 100) / (100 - pct)) - paid,
    };
  },
});

const cbDiscRate = numericRun({
  id: 'cb-disc-rate',
  conceptId: 'cb-discount',
  difficulty: 'medium',
  unit: 'percent',
  run: (rng) => {
    const { due, pct, disc, paid, p } = discDeal(rng);
    const incoming = rng.pick([true, false]);
    return {
      prompt: incoming
        ? `${p}, a debtor, owed ${f(due)} and settled in full by paying ${f(paid)}. What rate of cash discount (on the amount due) did the firm allow?`
        : `The firm owed ${p}, a creditor, ${f(due)} and settled in full by paying ${f(paid)}. What rate of cash discount (on the amount due) did ${p} allow?`,
      answer: pct * 100,
      errors: [
        [Math.round((disc / paid) * 10000), 'Took the discount as a percentage of the amount paid instead of the amount due.'],
        [(100 - pct) * 100, 'Gave the percentage that was paid, not the percentage of discount.'],
      ],
      working: [`Discount = ${f(due)} - ${f(paid)} = ${f(disc)}.`, `Rate = discount / amount due x 100 = ${f(disc)} / ${f(due)} x 100 = ${pct}%.`],
      recheck: () => Math.round(((due - paid) * 10000) / due),
    };
  },
});

const cbDiscJournal = journalTemplate({
  id: 'cb-disc-journal',
  topicId: T,
  conceptId: 'cb-discount',
  difficulty: 'medium',
  generate: (rng) => {
    const { due, disc, paid } = discDeal(rng);
    const incoming = rng.pick([true, false]);
    const p = incoming ? customer(rng) : supplier(rng);
    const lines: JournalLine[] = incoming
      ? [{ accountId: 'discountAllowed', side: 'Dr', amount: disc }, { accountId: debtor(p), side: 'Cr', amount: disc }]
      : [{ accountId: creditor(p), side: 'Dr', amount: disc }, { accountId: 'discountReceived', side: 'Cr', amount: disc }];
    // The cash book has no discount column, so the cheque alone is in it and the personal account is still open by the discount.
    const book = 'The firm\'s cash book has cash and bank columns only, with no discount column';
    return {
      prompt: incoming
        ? `${p}, a debtor who owed ${f(due)}, was allowed a cash discount of ${f(disc)} and settled the account in full by a cheque for ${f(paid)}. ${book}, and the cheque has already been entered in its bank column. Pass the journal entry that records the discount only.`
        : `The firm owed ${p}, a creditor, ${f(due)}. ${p} allowed a cash discount of ${f(disc)}, and the firm settled the account in full by a cheque for ${f(paid)}. ${book}, and the cheque has already been entered in its bank column. Pass the journal entry that records the discount only.`,
      lines,
      explanation: incoming
        ? [
            `The cash book already credits ${p} with the ${f(paid)} received, so ${f(disc)} of the ${f(due)} is still open in the account.`,
            'The discount is a loss, so Discount Allowed A/c is debited.',
            `${p} is credited with the discount, which closes the account. Bank A/c is not part of this entry.`,
          ]
        : [
            `The cash book already debits ${p} with the ${f(paid)} paid, so ${f(disc)} of the ${f(due)} is still open in the account.`,
            `${p} is debited with the discount, which closes the account. Bank A/c is not part of this entry.`,
            'The discount is a gain, so Discount Received A/c is credited.',
          ],
      distractorAccounts: ['discountReceived', 'discountAllowed', incoming ? 'sales' : 'purchases'],
    };
  },
  // Reads the three amounts back from the prompt: the entry is for the discount, and the discount is what was due less the cheque.
  verify: (q) => {
    const nums = (q.prompt.match(/₹\d(?:[\d,]*\d)?/g) ?? []).map((s) => Number(s.slice(1).replace(/,/g, '')) * 100);
    return nums.length === 3 && q.expected.every((l) => l.amount === nums[1]) && nums[0] - nums[2] === nums[1];
  },
});

const cbDiscClosing = scenario({
  id: 'cb-disc-closing',
  conceptId: 'cb-discount',
  difficulty: 'complex',
  setup: (rng) =>
    doubleSetup(rng, { n: [6, 8], pool: [...BASE, DEPOSIT, WITHDRAW, SETTLE_IN, SETTLE_OUT], need: [SETTLE_IN, SETTLE_OUT, DEPOSIT] }),
  ask: (_rng, m) => {
    const a = closingAsk(m, 'bank');
    if (!a) return null;
    return {
      ...a,
      question: 'The cash book has no discount column, so discounts are recorded through the journal. What is the closing balance of the bank column at the end of the month?',
      working: [...m.txs.flatMap((t) => (t.calc ? [t.calc] : [])), ...a.working],
    };
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Petty cash book and the imprest system
// ---------------------------------------------------------------------------------------------------------------

interface PettyItem {
  head: string;
  what: string;
}

const PETTY: PettyItem[] = [
  { head: 'Postage', what: 'postage stamps' },
  { head: 'Postage', what: 'speed post charges for a letter' },
  { head: 'Postage', what: 'registered post fee' },
  { head: 'Conveyance', what: 'taxi fare for a messenger' },
  { head: 'Conveyance', what: 'auto fare to the post office' },
  { head: 'Conveyance', what: 'bus tickets for an errand' },
  { head: 'Stationery', what: 'pens and file covers' },
  { head: 'Stationery', what: 'printer paper' },
  { head: 'Stationery', what: 'a stapler and pins' },
  { head: 'Refreshments', what: 'tea and snacks for visitors' },
  { head: 'Refreshments', what: 'tea for the staff' },
  { head: 'Refreshments', what: 'cold drinks for a customer' },
  { head: 'Repairs', what: 'repair of a chair' },
  { head: 'Repairs', what: 'repair of a door lock' },
  { head: 'Repairs', what: 'servicing a table fan' },
];
const HEADS = ['Postage', 'Conveyance', 'Stationery', 'Refreshments', 'Repairs'];
const MEANS: Record<string, string> = {
  Postage: 'stamps and postal charges',
  Conveyance: 'local travel fares',
  Stationery: 'paper, pens and office writing material',
  Refreshments: 'tea and snacks',
  Repairs: 'mending damaged items',
};
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Spend extends PettyItem {
  day: string;
  amt: Paise;
}

function spends(rng: Rng, n: number, heads?: string[]): Spend[] {
  const pool = heads ? PETTY.filter((p) => heads.includes(p.head)) : PETTY;
  const days = rng.shuffle(DAYS).slice(0, Math.min(n, DAYS.length));
  while (days.length < n) days.push(rng.pick(DAYS));
  days.sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b));
  const items = rng.shuffle(pool);
  return days.map((day, i) => ({ ...items[i % items.length], day, amt: amount(rng, 100, 900, 50) }));
}
const spendRows = (xs: Spend[]) => xs.map((s) => `${s.day}: ${cap(s.what)} ${f(s.amt)}.`).join('\n');
const total = (xs: Spend[]) => sum(xs.map((s) => s.amt));
const imprestFor = (rng: Rng, spent: Paise): Paise | null => {
  const imprest = amount(rng, 3000, 10000, 500);
  return spent < imprest ? imprest : null;
};

const cbPcReimburse = numericRun({
  id: 'cb-pc-reimburse',
  conceptId: 'cb-petty',
  difficulty: 'easy',
  run: (rng) => {
    const items = spends(rng, rng.int(4, 6));
    const spent = total(items);
    const imprest = imprestFor(rng, spent);
    if (imprest === null) return null;
    const hand = imprest - spent;
    if (rng.pick(['list', 'hand'] as const) === 'list') {
      return {
        prompt: `A firm keeps its petty cash on the imprest system with an imprest of ${f(imprest)}. During the week the petty cashier paid:\n${spendRows(items)}\nHow much must the head cashier give the petty cashier at the end of the week to restore the imprest?`,
        answer: spent,
        errors: [
          [hand, 'Gave the cash still left with the petty cashier instead of the amount spent.'],
          [imprest, 'Gave the whole imprest again, although the petty cashier still holds part of it.'],
          [imprest + spent, 'Added the spending to the imprest.'],
        ],
        working: [`Payments = ${items.map((s) => f(s.amt)).join(' + ')} = ${f(spent)}.`, 'Under the imprest system the head cashier gives back exactly what was spent, which restores the fixed amount.', `Cash left with the petty cashier = ${f(imprest)} - ${f(spent)} = ${f(hand)}.`],
        recheck: () => imprest - hand,
      };
    }
    return {
      prompt: `A firm keeps its petty cash on the imprest system with an imprest of ${f(imprest)}. At the end of the week the petty cashier has ${f(hand)} left. How much must the head cashier give the petty cashier to restore the imprest?`,
      answer: spent,
      errors: [
        [hand, 'Gave the cash still in hand instead of the amount spent.'],
        [imprest, 'Gave the whole imprest again, although the petty cashier still holds part of it.'],
        [imprest + hand, 'Added the cash in hand to the imprest.'],
      ],
      working: [`Amount spent = imprest - cash in hand = ${f(imprest)} - ${f(hand)} = ${f(spent)}.`, 'The head cashier reimburses exactly the amount spent, so the petty cashier is back to the imprest.'],
      recheck: () => imprest - hand,
    };
  },
});

const cbPcBalance = numericRun({
  id: 'cb-pc-balance',
  conceptId: 'cb-petty',
  difficulty: 'easy',
  run: (rng) => {
    const items = spends(rng, rng.int(3, 6));
    const spent = total(items);
    const imprest = imprestFor(rng, spent);
    if (imprest === null) return null;
    return {
      prompt: `On Monday morning the petty cashier held the imprest of ${f(imprest)}. During the week the petty cashier paid:\n${spendRows(items)}\nHow much cash is left with the petty cashier at the end of the week, before being reimbursed?`,
      answer: imprest - spent,
      errors: [
        [spent, 'Gave the total spent instead of what is left.'],
        [imprest + spent, 'Added the spending to the imprest.'],
        [imprest, 'Forgot to deduct the payments.'],
      ],
      working: [`Total payments = ${items.map((s) => f(s.amt)).join(' + ')} = ${f(spent)}.`, `Balance in hand = ${f(imprest)} - ${f(spent)} = ${f(imprest - spent)}.`],
      recheck: () => imprest - sum(items.map((s) => s.amt)),
    };
  },
});

const cbPcImprestAmount = numericRun({
  id: 'cb-pc-imprest-amount',
  conceptId: 'cb-petty',
  difficulty: 'medium',
  run: (rng) => {
    const imprest = amount(rng, 3000, 10000, 500);
    const spent = amount(rng, 1000, imprest / 100 - 500, 50);
    const hand = imprest - spent;
    if (hand <= 0) return null;
    const asVouchers = rng.pick([true, false]);
    return {
      prompt: asVouchers
        ? `Under the imprest system a petty cashier starts the month holding a fixed sum (the imprest). By the end of the month the vouchers for the payments made total ${f(spent)} and ${f(hand)} is still held in cash. What is the imprest?`
        : `A firm keeps its petty cash on the imprest system. At the end of a month the head cashier reimbursed ${f(spent)} to the petty cashier, who had ${f(hand)} in hand before the reimbursement. What is the imprest?`,
      answer: imprest,
      errors: [
        [Math.abs(spent - hand), 'Took the difference between the spending and the cash in hand instead of adding them.'],
        [spent, 'Took the amount spent as the imprest, forgetting the cash still in hand.'],
        [hand, 'Took the cash in hand as the imprest, forgetting the amount spent.'],
      ],
      working: [`Imprest = amount spent + cash still in hand = ${f(spent)} + ${f(hand)} = ${f(imprest)}.`, asVouchers ? 'The cash in hand and the vouchers together account for the whole imprest.' : 'The reimbursement restores the imprest, so the imprest equals the cash in hand plus the reimbursement.'],
      recheck: () => hand + spent,
    };
  },
});

const cbPcAnalysis = numericRun({
  id: 'cb-pc-analysis',
  conceptId: 'cb-petty',
  difficulty: 'medium',
  run: (rng) => {
    const three = ['Postage', 'Conveyance', 'Stationery'];
    if (rng.pick(['list', 'gap'] as const) === 'list') {
      const items = spends(rng, 6, three);
      const col = rng.pick(three);
      const mine = items.filter((s) => s.head === col);
      if (mine.length < 2) return null;
      const others = three.filter((h) => h !== col).map((h) => sum(items.filter((s) => s.head === h).map((s) => s.amt)));
      return {
        prompt: `A petty cash book has analysis columns for Postage, Conveyance and Stationery. The petty cashier's payments for the week were:\n${items.map((s) => `${s.day}: ${cap(s.what)} ${f(s.amt)} (${s.head}).`).join('\n')}\nWhat is the total of the ${col} column?`,
        answer: sum(mine.map((s) => s.amt)),
        errors: [
          [total(items), 'Gave the total of all the payments instead of one analysis column.'],
          ...others.map((o): Err => [o, 'Gave the total of a different analysis column.']),
          [total(items) - sum(mine.map((s) => s.amt)), 'Gave everything except this column.'],
        ],
        working: [`${col} payments: ${mine.map((s) => f(s.amt)).join(' + ')} = ${f(sum(mine.map((s) => s.amt)))}.`, `The three analysis columns together equal the payments column, ${f(total(items))}.`],
        recheck: () => total(items) - sum(items.filter((s) => s.head !== col).map((s) => s.amt)),
      };
    }
    const [a, b, c, d] = [0, 0, 0, 0].map(() => amount(rng, 300, 1500, 50));
    const whole = a + b + c + d;
    return {
      prompt: `The payments column of a petty cash book totals ${f(whole)} for the month. The analysis columns show Postage ${f(a)}, Conveyance ${f(b)} and Stationery ${f(c)}. The rest of the payments are in the Refreshments column. What is the total of the Refreshments column?`,
      answer: d,
      errors: [
        [a + b + c, 'Added the three known columns instead of deducting them from the total.'],
        [whole, 'Gave the whole payments column.'],
        [whole - a - b, 'Forgot to deduct the Stationery column.'],
      ],
      working: [`The analysis columns add up to the payments column.`, `Refreshments = ${f(whole)} - ${f(a)} - ${f(b)} - ${f(c)} = ${f(d)}.`],
      recheck: () => whole - (a + b + c),
    };
  },
});

const cbPcRaise = numericRun({
  id: 'cb-pc-raise',
  conceptId: 'cb-petty',
  difficulty: 'complex',
  run: (rng) => {
    const old = amount(rng, 3000, 8000, 500);
    const spent = amount(rng, 1000, old / 100 - 500, 50);
    const hand = old - spent;
    const raised = old + amount(rng, 500, 3000, 500);
    return {
      prompt: `A firm's petty cashier works on the imprest system with an imprest of ${f(old)}. At the end of the month ${f(hand)} remains with the petty cashier. From the next month the firm raises the imprest to ${f(raised)}. How much in all must the head cashier hand over at the end of the month, so that the petty cashier starts the next month holding the new imprest?`,
      answer: raised - hand,
      errors: [
        [spent, 'Restored only the old imprest and ignored the increase.'],
        [raised - old, 'Gave only the increase in the imprest.'],
        [raised, 'Gave the whole new imprest, forgetting that the petty cashier still holds some cash.'],
        [raised + spent, 'Added the amount spent to the new imprest.'],
      ],
      working: [
        `Amount spent = ${f(old)} - ${f(hand)} = ${f(spent)}; reimbursing it restores the old imprest.`,
        `Increase in the imprest = ${f(raised)} - ${f(old)} = ${f(raised - old)}.`,
        `Total to hand over = ${f(spent)} + ${f(raised - old)} = ${f(raised - hand)}.`,
        `Check: ${f(hand)} in hand + ${f(raised - hand)} handed over = the new imprest ${f(raised)}.`,
      ],
      recheck: () => spent + (raised - old),
    };
  },
});

const cbPcAdvance = numericRun({
  id: 'cb-pc-advance',
  conceptId: 'cb-petty',
  difficulty: 'complex',
  run: (rng) => {
    const items = spends(rng, rng.int(3, 5));
    const adv = amount(rng, 500, 1500, 100);
    const spent = total(items);
    const imprest = imprestFor(rng, spent + adv);
    if (imprest === null) return null;
    return {
      prompt: `A firm's petty cashier works on the imprest system with an imprest of ${f(imprest)}, made up at the end of every week. During one week the petty cashier paid:\n${spendRows(items)}\nThe petty cashier also gave a clerk an advance of ${f(adv)} out of the petty cash, to be recovered from the clerk's salary at the end of the month. How much must the head cashier give the petty cashier at the end of the week to restore the imprest?`,
      answer: spent + adv,
      errors: [
        [spent, 'Left out the advance because it is not an expense; it was still paid out of the petty cash.'],
        [spent - adv, 'Deducted the advance because it will be recovered; the cash has still gone out and must be replaced.'],
        [imprest - spent - adv, 'Gave the cash left in hand instead of the amount paid out.'],
        [imprest, 'Gave the whole imprest again.'],
      ],
      working: [`Expenses = ${items.map((s) => f(s.amt)).join(' + ')} = ${f(spent)}.`, `Total paid out of the petty cash = ${f(spent)} + advance ${f(adv)} = ${f(spent + adv)}.`, 'The advance is not an expense, but the cash has left the petty cashier, so it is reimbursed with the rest.'],
      recheck: () => imprest - (imprest - spent - adv),
    };
  },
});

const cbPcImprestMcq = mcqTemplate({
  id: 'cb-pc-imprest-mcq',
  topicId: T,
  conceptId: 'cb-petty',
  difficulty: 'easy',
  generate: (rng) => {
    const imprest = amount(rng, 3000, 10000, 500);
    const spent = amount(rng, 1000, imprest / 100 - 500, 50);
    const hand = imprest - spent;
    if (hand === spent) return null; // The two wrong amounts would coincide.
    if (rng.pick(['amount', 'idea'] as const) === 'amount') {
      return {
        prompt: `Under the imprest system the petty cashier's imprest is ${f(imprest)}. At the end of the month the petty cashier has spent ${f(spent)} and holds ${f(hand)}. How much does the head cashier give the petty cashier to restore the imprest?`,
        correct: f(spent),
        distractors: [
          { text: f(hand), why: 'Gave the amount still in hand instead of the amount spent.' },
          { text: f(imprest), why: 'Gave the whole imprest again, although part of it is still in hand.' },
          { text: f(imprest + spent), why: 'Added the spending to the imprest.' },
        ],
        explanation: `The head cashier reimburses exactly the amount spent, ${f(spent)}, so the petty cashier is back to ${f(imprest)}.`,
      };
    }
    return {
      prompt: 'Under the imprest system, at the end of each period the head cashier gives the petty cashier:',
      correct: 'The amount spent during the period, restoring the fixed imprest',
      distractors: [
        { text: 'The full imprest again, whatever was spent', why: 'Forgot that the petty cashier still holds the unspent part of the imprest.' },
        { text: 'The cash balance still in hand', why: 'Gave back what the petty cashier already holds instead of what has been spent.' },
        { text: 'Whatever amount the petty cashier asks for', why: 'Thought the amount is open-ended; an imprest is a fixed sum restored by the exact amount spent.' },
      ],
      explanation: 'An imprest is a fixed sum. Reimbursing exactly what was spent brings it back to the fixed amount at the start of every period.',
    };
  },
});

const cbPcHead = mcqTemplate({
  id: 'cb-pc-head',
  topicId: T,
  conceptId: 'cb-petty',
  difficulty: 'easy',
  generate: (rng) => {
    const item = rng.pick(PETTY);
    const x = f(amount(rng, 100, 900, 50));
    const others = rng.shuffle(HEADS.filter((h) => h !== item.head));
    return {
      prompt: `The petty cashier paid ${x} for ${item.what}. In which analysis column of the petty cash book is it entered?`,
      correct: item.head,
      distractors: others.map((h): Distractor => ({ text: h, why: `The ${h} column is for ${MEANS[h]}; ${item.what} is a different kind of expense.` })),
      explanation: `${cap(item.what)} is a ${item.head.toLowerCase()} expense: the ${item.head} column covers ${MEANS[item.head]}.`,
    };
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Sets of entries: "Journalise the following transactions". What the cash book records, shown in journal form: one
// business, several dated transactions, one entry for each. The opening line of a set states the balances it starts
// with and every practice its entries rely on. Both are journals of dated transactions, so they keep the usual task.
// ---------------------------------------------------------------------------------------------------------------

/** One transaction of a set, before it is given its date. */
interface SetTx {
  text: string;
  lines: JournalLine[];
  explanation: string[];
}
type Mode = 'cash' | 'bank';

const debit = (accountId: string, a: Paise): JournalLine => ({ accountId, side: 'Dr', amount: a });
const credit = (accountId: string, a: Paise): JournalLine => ({ accountId, side: 'Cr', amount: a });
const SET_MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February'];
const LAST_DAY: Record<string, number> = { April: 30, May: 31, June: 30, July: 31, August: 31, September: 30, October: 31, November: 30, December: 31, January: 31, February: 28 };
const listOf = (parts: string[]): string => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

/** Every ₹ amount in a text, in order, in paise. */
const rupeesIn = (s: string): Paise[] => (s.match(/₹\d[\d,]*/g) ?? []).map((m) => Number(m.slice(1).replace(/,/g, '')) * 100);

/** A line an entry must have: the account (or, for a party, the kind of party), its side and its amount. */
type Want = [account: string, side: 'Dr' | 'Cr', amount: Paise];
/** True when the entry is exactly the lines wanted. */
const isEntry = (lines: JournalLine[], want: Want[]): boolean =>
  lines.length === want.length &&
  want.every(([account, side, a]) => lines.filter((l) => (account.endsWith(':') ? l.accountId.startsWith(account) : l.accountId === account) && l.side === side && l.amount === a).length === 1);

/**
 * True when cash and bank never run out as the entries of a set are taken in order, starting from the two balances
 * its opening line gives (the first two amounts of the prompt). Debtors and creditors are left out: the business
 * was already running, and what they owed or were owed before the set began is not part of it.
 */
function fundsHold(q: JournalSetQuestion): boolean {
  const [cash, bank] = rupeesIn(q.prompt);
  const own = q.entries.map((e) => ({ lines: e.expected.filter((l) => !l.accountId.includes(':')) }));
  return cash > 0 && bank > 0 && storyHolds(own, { cash, bank });
}

const modeOf = (words: string): Mode => (/cheque/.test(words) ? 'bank' : 'cash');
const paidIn = (m: Mode) => (m === 'bank' ? 'by cheque' : 'in cash');

// ---- 1. A week of contra entries and of entries that only look like them ----

const CONTRA_IN = 'The money only moves from the cash box to the bank, and both accounts are in the cash book: a contra entry. The bank balance rises: Bank A/c is debited.';
const CONTRA_OUT = 'The money stays in the business and only moves from the bank to the cash box: a contra entry. Cash in hand rises: Cash A/c is debited.';

type WeekKind = 'deposit' | 'withdraw' | 'personal' | 'split' | 'sameDay' | 'chequeSale';
const WEEK_KINDS: WeekKind[] = ['deposit', 'withdraw', 'personal', 'split', 'sameDay', 'chequeSale'];

function weekItem(rng: Rng, kind: WeekKind, customer1: string): SetTx {
  switch (kind) {
    case 'deposit': {
      const x = amount(rng, 5000, 20000, 1000);
      return { text: `Paid ${f(x)} of the office cash into the bank.`, lines: [debit('bank', x), credit('cash', x)], explanation: [CONTRA_IN, 'Cash in hand falls: Cash A/c is credited.'] };
    }
    case 'withdraw': {
      const x = amount(rng, 5000, 30000, 1000);
      return { text: `Withdrew ${f(x)} from the bank for office use.`, lines: [debit('cash', x), credit('bank', x)], explanation: [CONTRA_OUT, 'The bank balance falls: Bank A/c is credited.'] };
    }
    case 'personal': {
      const x = amount(rng, 2000, 10000, 500);
      const m: Mode = rng.pick(['bank', 'cash']);
      return {
        text: m === 'bank' ? `The proprietor withdrew ${f(x)} from the bank for personal use.` : `The proprietor took ${f(x)} from the office cash for personal use.`,
        lines: [debit('drawings', x), credit(m, x)],
        explanation: [
          'The money leaves the business for the proprietor, so it is drawings and not a contra entry: Drawings A/c is debited.',
          m === 'bank' ? 'The bank balance falls: Bank A/c is credited.' : 'Cash in hand falls: Cash A/c is credited.',
        ],
      };
    }
    case 'split': {
      const total = amount(rng, 10000, 40000, 5000);
      const office = amount(rng, 3000, total / 100 - 3000, 1000);
      return {
        text: `Withdrew ${f(total)} from the bank: ${f(office)} for office use and the rest for the proprietor's personal use.`,
        lines: [debit('cash', office), debit('drawings', total - office), credit('bank', total)],
        explanation: [
          `Only the ${f(office)} kept in the office moves from the bank to the cash box (a contra): Cash A/c is debited with ${f(office)}.`,
          `The rest, ${f(total)} - ${f(office)} = ${f(total - office)}, goes to the proprietor: Drawings A/c is debited.`,
          `The bank paid out ${f(total)} in all: Bank A/c is credited.`,
        ],
      };
    }
    case 'sameDay': {
      const x = amount(rng, 4000, 30000, 500);
      return {
        text: `Received a cheque for ${f(x)} from ${customer1}, a debtor, and banked it the same day.`,
        lines: [debit('bank', x), credit(debtor(customer1), x)],
        explanation: [
          'The cheque is banked on the day it is received, so it goes straight to the bank: Bank A/c is debited.',
          `${customer1} has paid: ${customer1} is credited. The other account is a debtor, not Cash, so this is not a contra entry.`,
        ],
      };
    }
    case 'chequeSale': {
      const x = amount(rng, 4000, 30000, 500);
      return {
        text: `Sold goods for ${f(x)}; the customer paid by cheque, which was banked the same day.`,
        lines: [debit('bank', x), credit('sales', x)],
        explanation: ['The cheque is banked on the day it is received: Bank A/c is debited.', 'Goods sold are credited to Sales A/c. The other account is Sales, not Cash, so this is not a contra entry.'],
      };
    }
  }
}

/**
 * True when the notes in the cash box and the bank balance never run out. A cheque that is kept is cash in the books
 * until it is deposited, but it is not money that can be paid into the bank as "office cash" or taken by the
 * proprietor, so it is left out of the cash here: the receipt adds nothing and its deposit takes nothing away.
 */
function notesHold(entries: readonly { text: string; lines: JournalLine[] }[], funds: { cash: Paise; bank: Paise }): boolean {
  const keptCheque = (text: string) => /It was not banked that day\.$/.test(text) || /^Deposited into the bank the cheque received from /.test(text);
  return storyHolds(
    entries.map((e) => ({ lines: e.lines.filter((l) => !l.accountId.includes(':') && !(keptCheque(e.text) && l.accountId === 'cash')) })),
    funds,
  );
}

const cbSetContraWeek = journalSetTemplate({
  id: 'cb-set-contra-week',
  topicId: T,
  conceptId: 'cb-sets',
  difficulty: 'medium',
  generate: (rng) => {
    const firm = rng.pick(FIRMS);
    const month = rng.pick(SET_MONTHS);
    const first = rng.pick([1, 8, 15, 22]);
    const cash = amount(rng, 20000, 60000, 5000);
    const bank = amount(rng, 80000, 250000, 10000);
    const [customer1, customer2] = rng.shuffle(DEBTORS);
    const held = rng.int(1, 10) <= 7;
    // A withdrawal split between the office and the proprietor stands in for the two plain withdrawals.
    const kinds: WeekKind[] = [];
    const target = held ? rng.pick([2, 3]) : rng.pick([4, 5]);
    for (const k of rng.shuffle(WEEK_KINDS)) {
      if (kinds.length === target) break;
      const clash = k === 'split' ? kinds.includes('withdraw') || kinds.includes('personal') : (k === 'withdraw' || k === 'personal') && kinds.includes('split');
      if (!clash) kinds.push(k);
    }
    if (kinds.length < (held ? 2 : 4)) return null;

    // Each step is given its day when the week is put in order: the deposit of the cheque that was kept names the day it came.
    const threads: ((day: number) => SetTx)[][] = kinds.map((k) => {
      const tx = weekItem(rng, k, customer1);
      return [() => tx];
    });
    if (held) {
      const x = amount(rng, 4000, 30000, 500);
      let came = 0;
      threads.push([
        (day) => {
          came = day;
          return {
            text: `Received a cheque for ${f(x)} from ${customer2}, a debtor. It was not banked that day.`,
            lines: [debit('cash', x), credit(debtor(customer2), x)],
            explanation: ['Under the stated practice a cheque that is not banked on the day it is received is treated as cash: Cash A/c is debited, not Bank A/c.', `${customer2} has paid: ${customer2} is credited.`],
          };
        },
        () => ({
          text: `Deposited into the bank the cheque received from ${customer2} on ${came} ${month}.`,
          lines: [debit('bank', x), credit('cash', x)],
          explanation: [
            `The cheque of ${f(x)} was entered as cash when it was received, so paying it in moves that amount from cash to bank: a contra entry. Bank A/c is debited.`,
            'Cash A/c is credited.',
          ],
        }),
      ]);
    }
    const steps = interleave(rng, threads);
    const days = setDays(rng, steps.length, first, first + 6);
    const transactions = steps.map((step, i) => ({ date: `${days[i]} ${month}`, ...step(days[i]) }));
    if (!notesHold(transactions, { cash, bank })) return null;
    return {
      opening:
        `On the morning of ${first} ${month}, ${firm} had ${f(cash)} in cash and ${f(bank)} at the bank. These are transactions of the week that followed, all of them recorded in its double column cash book. ` +
        'A cheque received is banked the same day unless the transaction says otherwise; a cheque that is not banked on the day it is received is treated as cash until it is deposited.',
      transactions,
      distractorAccounts: ['drawings', 'capital', 'sales', 'bankOverdraft'],
    };
  },
  verify: (q) => {
    const [cash, bank] = rupeesIn(q.prompt);
    if (!fundsHold(q) || !notesHold(q.entries.map((e) => ({ text: e.text, lines: e.expected })), { cash, bank })) return false;
    const contras = q.entries.filter((e) => e.expected.length === 2 && e.expected.every((l) => l.accountId === 'cash' || l.accountId === 'bank'));
    return (
      contras.length >= 1 &&
      contras.length < q.entries.length &&
      q.entries.every((e) => {
        const m = rupeesIn(e.text);
        if (/of the office cash into the bank\.$/.test(e.text)) return isEntry(e.expected, [['bank', 'Dr', m[0]], ['cash', 'Cr', m[0]]]);
        if (/from the bank for office use\.$/.test(e.text)) return isEntry(e.expected, [['cash', 'Dr', m[0]], ['bank', 'Cr', m[0]]]);
        if (/withdrew ₹[\d,]+ from the bank for personal use\.$/.test(e.text)) return isEntry(e.expected, [['drawings', 'Dr', m[0]], ['bank', 'Cr', m[0]]]);
        if (/from the office cash for personal use\.$/.test(e.text)) return isEntry(e.expected, [['drawings', 'Dr', m[0]], ['cash', 'Cr', m[0]]]);
        if (/for office use and the rest for the proprietor/.test(e.text)) return m[0] > m[1] && isEntry(e.expected, [['cash', 'Dr', m[1]], ['drawings', 'Dr', m[0] - m[1]], ['bank', 'Cr', m[0]]]);
        if (/a debtor, and banked it the same day\.$/.test(e.text)) return isEntry(e.expected, [['bank', 'Dr', m[0]], ['debtor:', 'Cr', m[0]]]);
        if (/^Sold goods for/.test(e.text)) return isEntry(e.expected, [['bank', 'Dr', m[0]], ['sales', 'Cr', m[0]]]);
        if (/It was not banked that day\.$/.test(e.text)) return isEntry(e.expected, [['cash', 'Dr', m[0]], ['debtor:', 'Cr', m[0]]]);
        // The cheque deposited later: its amount is the one received from that debtor on the day named.
        const later = /^Deposited into the bank the cheque received from (.+) on (\d+ \w+)\.$/.exec(e.text);
        const receipt = later && q.entries.find((r) => r.date === later[2] && r.expected.some((l) => l.accountId === debtor(later[1]) && l.side === 'Cr'));
        return !!receipt && receipt !== e && isEntry(e.expected, [['bank', 'Dr', rupeesIn(receipt.text)[0]], ['cash', 'Cr', rupeesIn(receipt.text)[0]]]);
      })
    );
  },
});

// ---- 2. Cash discount allowed and received, and a month of petty cash on the imprest system ----

/** Petty expenses that have an account of their own: the account, and the name of the analysis column. */
const PETTY_HEADS: [string, string][] = [
  ['postage', 'postage'],
  ['stationery', 'stationery'],
  ['repairs', 'repairs'],
  ['carriageOutwards', 'carriage outwards'],
  ['telephone', 'telephone'],
  ['travellingExpenses', 'travelling expenses'],
  ['generalExpenses', 'general expenses'],
];

const moneyMoves = (m: Mode, coming: boolean): string =>
  coming
    ? m === 'bank'
      ? 'The cheque is banked the same day: Bank A/c is debited'
      : 'Cash comes in: Cash A/c is debited'
    : m === 'bank'
      ? 'The bank balance falls: Bank A/c is credited'
      : 'Cash goes out: Cash A/c is credited';

/** A debtor settles in full less cash discount. `byRate` gives the rate; otherwise the amount paid is given and the discount is the difference. */
function discountAllowed(rng: Rng, who: string): SetTx {
  const due = amount(rng, 5000, 40000, 1000);
  const pct = rng.pick([2, 3, 4, 5]);
  const disc = percentOf(due, pct);
  const paid = due - disc;
  const m: Mode = rng.pick(['bank', 'cash']);
  const byRate = rng.pick([true, false]);
  return {
    text: byRate
      ? `${who}, a debtor who owed ${f(due)}, settled the account in full ${paidIn(m)} after deducting the ${pct}% cash discount allowed for prompt payment.`
      : `Received ${m === 'bank' ? `a cheque for ${f(paid)}` : `${f(paid)} in cash`} from ${who}, a debtor, in full settlement of ${f(due)}.`,
    lines: [debit(m, paid), debit('discountAllowed', disc), credit(debtor(who), due)],
    explanation: [
      byRate ? `Cash discount = ${pct}% of ${f(due)} = ${f(disc)}, so ${who} paid ${f(due)} - ${f(disc)} = ${f(paid)}.` : `The account is settled in full, so the cash discount is ${f(due)} - ${f(paid)} = ${f(disc)}.`,
      `${moneyMoves(m, true)} with ${f(paid)}.`,
      `The discount is a loss to the firm: Discount Allowed A/c is debited with ${f(disc)}.`,
      `${who} is credited with the full ${f(due)}, which closes the account.`,
    ],
  };
}

function discountReceived(rng: Rng, who: string): SetTx {
  const due = amount(rng, 5000, 40000, 1000);
  const pct = rng.pick([2, 3, 4, 5]);
  const disc = percentOf(due, pct);
  const paid = due - disc;
  const m: Mode = rng.pick(['bank', 'cash']);
  const byRate = rng.pick([true, false]);
  return {
    text: byRate
      ? `Paid ${who}, a creditor, ${paidIn(m)} in full settlement of ${f(due)} owed, after deducting the ${pct}% cash discount ${who} allows for prompt payment.`
      : `Paid ${f(paid)} ${paidIn(m)} to ${who}, a creditor, in full settlement of ${f(due)} owed.`,
    lines: [debit(creditor(who), due), credit(m, paid), credit('discountReceived', disc)],
    explanation: [
      byRate ? `Cash discount = ${pct}% of ${f(due)} = ${f(disc)}, so the firm paid ${f(due)} - ${f(disc)} = ${f(paid)}.` : `The account is settled in full, so the cash discount is ${f(due)} - ${f(paid)} = ${f(disc)}.`,
      `${who} is debited with the full ${f(due)}, which closes the account.`,
      `${moneyMoves(m, false)} with ${f(paid)}.`,
      `The discount is a gain to the firm: Discount Received A/c is credited with ${f(disc)}.`,
    ],
  };
}

/** A part payment: nothing is settled in full, so there is no discount to record. */
function onAccount(rng: Rng, customer2: string, supplier2: string): SetTx {
  const x = amount(rng, 3000, 20000, 500);
  const partPayment = '"On account" means a part payment: the account is not settled, so no discount arises.';
  return rng.pick([true, false])
    ? {
        text: `Received ${f(x)} in cash from ${customer2}, a debtor, on account.`,
        lines: [debit('cash', x), credit(debtor(customer2), x)],
        explanation: [partPayment, `${moneyMoves('cash', true)}.`, `${customer2} owes that much less: ${customer2} is credited.`],
      }
    : {
        text: `Paid ${f(x)} by cheque to ${supplier2}, a creditor, on account.`,
        lines: [debit(creditor(supplier2), x), credit('bank', x)],
        explanation: [partPayment, `${supplier2} is owed that much less: ${supplier2} is debited.`, `${moneyMoves('bank', false)}.`],
      };
}

const cbSetDiscountPetty = journalSetTemplate({
  id: 'cb-set-discount-petty',
  topicId: T,
  conceptId: 'cb-sets',
  difficulty: 'medium',
  generate: (rng) => {
    const firm = rng.pick(FIRMS);
    const month = rng.pick(SET_MONTHS);
    const cash = amount(rng, 20000, 60000, 5000);
    const bank = amount(rng, 100000, 300000, 10000);
    const [customer1, customer2] = rng.shuffle(DEBTORS);
    const [supplier1, supplier2] = rng.shuffle(CREDITORS);
    const m: Mode = rng.pick(['bank', 'cash']);

    // The petty cash of the month: the imprest, what was paid under each head, and the reimbursement that restores it.
    const heads = rng
      .shuffle(PETTY_HEADS)
      .slice(0, rng.pick([3, 4]))
      .map(([id, name]) => ({ id, name, spent: amount(rng, 150, 900, 50) }));
    const spent = sum(heads.map((h) => h.spent));
    // A round imprest that the month's payments leave ₹500 or more of.
    const imprest = Math.ceil((spent + 50000 * rng.int(1, 3)) / 50000) * 50000;
    const advance: SetTx = {
      text: `Started a petty cash book on the imprest system: gave the petty cashier ${f(imprest)} ${paidIn(m)} as the imprest.`,
      lines: [debit('pettyCash', imprest), credit(m, imprest)],
      explanation: ['The imprest is money of the firm held by the petty cashier, an asset: Petty Cash A/c is debited.', `${moneyMoves(m, false)}.`],
    };
    const expenses: SetTx = {
      text: `The analysis columns of the petty cash book for the month were totalled: ${listOf(heads.map((h) => `${h.name} ${f(h.spent)}`))}.`,
      lines: [...heads.map((h) => debit(h.id, h.spent)), credit('pettyCash', spent)],
      explanation: [
        'Each analysis column is an expense of the firm: its account is debited with the total of the column.',
        `Total paid out of petty cash = ${heads.map((h) => f(h.spent)).join(' + ')} = ${f(spent)}: Petty Cash A/c is credited with ${f(spent)}.`,
      ],
    };
    const fromLeft = rng.pick([true, false]);
    const reimbursement: SetTx = {
      text: fromLeft
        ? `The petty cashier had ${f(imprest - spent)} left. The head cashier gave ${m === 'bank' ? 'a cheque' : 'cash'} to bring the petty cash back to the imprest of ${f(imprest)}.`
        : `The head cashier reimbursed the petty cashier ${paidIn(m)} for the month's payments, which brings the petty cash back to the imprest.`,
      lines: [debit('pettyCash', spent), credit(m, spent)],
      explanation: [
        fromLeft
          ? `Amount needed = imprest - cash left = ${f(imprest)} - ${f(imprest - spent)} = ${f(spent)}, which is exactly what was spent.`
          : `Under the imprest system the petty cashier is given back exactly what was spent: ${f(spent)}, the total of the petty cash book for the month.`,
        `Petty Cash A/c is debited with ${f(spent)} and stands at the imprest again.`,
        `${moneyMoves(m, false)}.`,
      ],
    };

    // One or two receipts and payments in between, at least one of them with a cash discount.
    const kinds = rng.shuffle(['allowed', 'received', 'account'] as const);
    const chosen = kinds.slice(0, rng.pick([1, 2]));
    if (!chosen.includes('allowed') && !chosen.includes('received')) chosen[0] = rng.pick(['allowed', 'received'] as const);
    const between = chosen.map((k) => (k === 'allowed' ? discountAllowed(rng, customer1) : k === 'received' ? discountReceived(rng, supplier1) : onAccount(rng, customer2, supplier2)));
    const days = setDays(rng, between.length, 4, 27);
    const last = `${LAST_DAY[month]} ${month}`;
    const transactions = [
      { date: `${rng.int(1, 3)} ${month}`, ...advance },
      ...between.map((tx, i) => ({ date: `${days[i]} ${month}`, ...tx })),
      { date: last, ...expenses },
      { date: last, ...reimbursement },
    ];
    if (!storyHolds(transactions.map((t) => ({ lines: t.lines.filter((l) => !l.accountId.includes(':')) })), { cash, bank })) return null;
    return {
      opening:
        `On 1 ${month}, ${firm} had ${f(cash)} in cash and ${f(bank)} at the bank. Its cash book has a cash column and a bank column and no discount column, so each receipt or payment is journalised in one entry together with any cash discount on it. Cheques received are banked the same day. ` +
        'Petty cash is kept on the imprest system and Petty Cash A/c is an account of the ledger: on the last day of the month the totals of the analysis columns of the petty cash book are debited to the expense accounts, and the petty cashier is then reimbursed.',
      transactions,
      distractorAccounts: ['discountAllowed', 'discountReceived', 'cash', 'generalExpenses'],
    };
  },
  verify: (q) => {
    if (!fundsHold(q)) return false;
    let petty = 0;
    let imprest = 0;
    let spent = 0;
    for (const e of q.entries) {
      const m = rupeesIn(e.text);
      const pct = Number(/(\d+)% cash discount/.exec(e.text)?.[1] ?? 0);
      const mode = modeOf(e.text);
      let want: Want[];
      if (/as the imprest\.$/.test(e.text)) {
        imprest = m[0];
        want = [['pettyCash', 'Dr', m[0]], [mode, 'Cr', m[0]]];
      } else if (/^The analysis columns of the petty cash book/.test(e.text)) {
        // Every column is debited to an expense account, and their total is what the petty cashier paid out.
        spent = m.reduce((s, x) => s + x, 0);
        const debits = e.expected.filter((l) => l.side === 'Dr');
        if (debits.length !== m.length || debits.some((l, i) => l.amount !== m[i] || PETTY_HEADS.every(([id]) => id !== l.accountId))) return false;
        want = [...debits.map((l): Want => [l.accountId, 'Dr', l.amount]), ['pettyCash', 'Cr', spent]];
      } else if (/back to the imprest/.test(e.text)) {
        // What restores the imprest is what was spent, whichever way the item is told.
        if (spent === 0 || (m.length === 2 && m[1] - m[0] !== spent) || (m.length === 2 && m[1] !== imprest)) return false;
        want = [['pettyCash', 'Dr', spent], [mode, 'Cr', spent]];
      } else if (/a debtor who owed .+ settled the account in full/.test(e.text)) {
        want = [[mode, 'Dr', (m[0] * (100 - pct)) / 100], ['discountAllowed', 'Dr', (m[0] * pct) / 100], ['debtor:', 'Cr', m[0]]];
      } else if (/a debtor, in full settlement of/.test(e.text)) {
        want = [[mode, 'Dr', m[0]], ['discountAllowed', 'Dr', m[1] - m[0]], ['debtor:', 'Cr', m[1]]];
      } else if (/a creditor, (by cheque|in cash) in full settlement of .+ after deducting/.test(e.text)) {
        want = [['creditor:', 'Dr', m[0]], [mode, 'Cr', (m[0] * (100 - pct)) / 100], ['discountReceived', 'Cr', (m[0] * pct) / 100]];
      } else if (/a creditor, in full settlement of/.test(e.text)) {
        want = [['creditor:', 'Dr', m[1]], [mode, 'Cr', m[0]], ['discountReceived', 'Cr', m[1] - m[0]]];
      } else if (/a debtor, on account\.$/.test(e.text)) {
        want = [['cash', 'Dr', m[0]], ['debtor:', 'Cr', m[0]]];
      } else if (/a creditor, on account\.$/.test(e.text)) {
        want = [['creditor:', 'Dr', m[0]], ['bank', 'Cr', m[0]]];
      } else return false;
      if (!isEntry(e.expected, want)) return false;
      for (const l of e.expected) if (l.accountId === 'pettyCash') petty += l.side === 'Dr' ? l.amount : -l.amount;
      if (petty < 0) return false;
    }
    return imprest > 0 && spent > 0 && petty === imprest;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Formats: cash books the student prepares, row by row. Each is written up from the dated entries of its
// transactions with `cashBook`, so the book cannot disagree with the data, and verified by posting the same entries
// another way (`post`, which nets every line into one figure for each account). The particulars follow the cards of
// this topic: a customer or a supplier by name ("To Kiran"), every other account as "<name> A/c".
// ---------------------------------------------------------------------------------------------------------------

const NEXT_MONTH: Record<string, string> = {
  April: 'May', May: 'June', June: 'July', July: 'August', August: 'September', September: 'October',
  October: 'November', November: 'December', December: 'January', January: 'February', February: 'March',
};

/** One transaction as the data tells it: its sentence, its entry, and why it stands where it does in the cash book. */
interface Deal {
  text: string;
  why: string;
  lines: JournalLine[];
  /** An entry that goes with the transaction but is made in the journal, not in the cash book: a cash discount. */
  journal?: JournalLine[];
}

const receive = (col: Col, from: string, a: Paise): JournalLine[] => [debit(col, a), credit(from, a)];
const payOut = (col: Col, to: string, a: Paise): JournalLine[] => [debit(to, a), credit(col, a)];

/** The first thing `make` gives in a few goes: a template tries other amounts and another order before it gives a seed up. */
function several<P>(goes: number, make: () => P | null): P | null {
  for (let i = 0; i < goes; i++) {
    const made = make();
    if (made) return made;
  }
  return null;
}

/**
 * Expenses of a shop, each with an account of its own, and what is paid for them in a month. Each is worded so that
 * it can be nothing else: stationery for the office (a stationer also buys stationery to sell, which is Purchases)
 * and insurance of the shop (a premium on the proprietor's own life would be Drawings).
 */
const FMT_EXPENSES: { id: string; what: string; lo: number; hi: number }[] = [
  { id: 'rent', what: 'rent of the shop', lo: 3000, hi: 9000 },
  { id: 'salaries', what: 'salaries', lo: 6000, hi: 15000 },
  { id: 'wages', what: 'wages', lo: 2000, hi: 8000 },
  { id: 'electricity', what: 'the electricity bill', lo: 1000, hi: 4000 },
  { id: 'stationery', what: 'office stationery', lo: 500, hi: 2500 },
  { id: 'advertisement', what: 'an advertisement in a newspaper', lo: 1500, hi: 6000 },
  { id: 'repairs', what: 'repairs to the shop', lo: 1000, hi: 5000 },
  { id: 'telephone', what: 'the telephone bill', lo: 500, hi: 2500 },
  { id: 'insurance', what: 'the fire insurance premium of the shop', lo: 2000, hi: 6000 },
];
type FmtExpense = (typeof FMT_EXPENSES)[number];

const CONTRA_WHY = 'Both accounts are in the cash book, so this is a contra entry, entered on both sides.';

/**
 * The transactions a cash book is made of, each with an amount drawn for it. `single` words the dealings with the
 * bank for a single column cash book, where they are ordinary receipts and payments of cash and not contra entries.
 */
function dealsFor(rng: Rng, single: boolean) {
  const x = (lo: number, hi: number) => amount(rng, lo, hi, 500);
  const deal = (text: string, why: string, lines: JournalLine[]): Deal => ({ text, why, lines });
  // Cash paid into the bank and cash drawn from it are never of one amount in a book: the two rows would read alike.
  const moved: Paise[] = [];
  const between = (): Paise => {
    let a = x(5000, 20000);
    while (moved.includes(a)) a = x(5000, 20000);
    moved.push(a);
    return a;
  };
  return {
    cashSale: () => {
      const a = x(6000, 30000);
      return deal(`Cash sales, ${f(a)}`, 'Cash is received for goods sold.', receive('cash', 'sales', a));
    },
    debtorCash: (p: string) => {
      const a = x(4000, 20000);
      return deal(`Received ${f(a)} in cash from ${p}, a debtor`, `${p} pays in cash: a receipt.`, receive('cash', debtor(p), a));
    },
    commission: () => {
      const a = x(1000, 6000);
      return deal(`Received commission of ${f(a)} in cash`, 'Cash is received as commission, an income.', receive('cash', 'commissionReceived', a));
    },
    capitalCash: () => {
      const a = x(10000, 40000);
      return deal(`The proprietor brought in ${f(a)} in cash as additional capital`, 'Cash comes in from the proprietor as capital.', receive('cash', 'capital', a));
    },
    furnitureSold: () => {
      const a = x(3000, 12000);
      return deal(`Sold old office furniture for ${f(a)} in cash, which was its book value`, 'Cash is received for an asset sold, not for goods: the other account is Furniture, not Sales.', receive('cash', 'furniture', a));
    },
    cashPurchase: () => {
      const a = x(5000, 20000);
      return deal(`Bought goods for cash, ${f(a)}`, 'Cash is paid for goods bought.', payOut('cash', 'purchases', a));
    },
    creditorCash: (p: string) => {
      const a = x(4000, 15000);
      return deal(`Paid ${f(a)} in cash to ${p}, a creditor`, `${p} is paid in cash: a payment.`, payOut('cash', creditor(p), a));
    },
    expense: (e: FmtExpense, col: Col) => {
      const a = x(e.lo, e.hi);
      return deal(
        `Paid ${f(a)} ${col === 'cash' ? 'in cash' : 'by cheque'} for ${e.what}`,
        col === 'cash' ? 'An expense is paid in cash.' : 'An expense is paid by cheque: the bank balance falls.',
        payOut(col, e.id, a),
      );
    },
    drawingsCash: () => {
      const a = x(2000, 8000);
      return deal(`The proprietor took ${f(a)} from the office cash for personal use`, 'Cash leaves the business for the proprietor: drawings.', payOut('cash', 'drawings', a));
    },
    deposit: () => {
      const a = between();
      return deal(
        `Paid ${f(a)} of the office cash into the bank`,
        single ? 'Cash leaves the office for the bank: a payment of cash.' : `Cash moves from the office to the bank. ${CONTRA_WHY}`,
        [debit('bank', a), credit('cash', a)],
      );
    },
    withdraw: () => {
      const a = between();
      return deal(
        `Withdrew ${f(a)} from the bank for office use`,
        single ? 'Cash comes into the office from the bank: a receipt of cash.' : `Cash comes from the bank into the office. ${CONTRA_WHY}`,
        [debit('cash', a), credit('bank', a)],
      );
    },
    debtorCheque: (p: string) => {
      const a = x(5000, 25000);
      return deal(`Received a cheque for ${f(a)} from ${p}, a debtor, and banked it the same day`, 'A cheque banked on the day it is received goes straight to the bank column: a receipt.', receive('bank', debtor(p), a));
    },
    chequeSale: () => {
      const a = x(6000, 30000);
      return deal(`Sold goods for ${f(a)}; the customer paid by cheque, which was banked the same day`, 'The cheque for the goods sold is banked the same day: a receipt in the bank column.', receive('bank', 'sales', a));
    },
    creditorCheque: (p: string) => {
      const a = x(5000, 25000);
      return deal(`Paid ${f(a)} by cheque to ${p}, a creditor`, `A cheque is issued to ${p}: the bank balance falls.`, payOut('bank', creditor(p), a));
    },
    chequePurchase: () => {
      const a = x(5000, 25000);
      return deal(`Bought goods for ${f(a)} and paid by cheque`, 'Goods are paid for by cheque: the bank balance falls.', payOut('bank', 'purchases', a));
    },
    drawingsBank: () => {
      const a = x(2000, 10000);
      return deal(`The proprietor withdrew ${f(a)} from the bank for personal use`, 'The money leaves the business for the proprietor: it is drawings, not a contra entry.', payOut('bank', 'drawings', a));
    },
    furnitureCheque: () => {
      const a = x(4000, 15000);
      return deal(`Bought a steel cupboard for the office for ${f(a)} and paid by cheque`, 'An asset is paid for by cheque: the other account is Furniture, not Purchases.', payOut('bank', 'furniture', a));
    },
  };
}

/** A cash book as a template plans it: what it opens with, its transactions in date order, and when it is closed. */
interface Book {
  /** A single column cash book; otherwise one with cash and bank columns. */
  single: boolean;
  /** The balances on the first day. A bank balance below nil is an overdraft. */
  opening: { date: string; cash: Paise; bank: Paise };
  deals: Deal[];
  dates: string[];
  closeOn: string;
  reopenOn: string;
}

/** What a cash book was made from, kept for its `verify`. */
interface KeptBook {
  single: boolean;
  opening: Book['opening'];
  entries: DatedEntry[];
}
const keptBook = keepFor<KeptBook>();

const entriesOf = (b: Book): DatedEntry[] =>
  b.deals.flatMap((d, i) => [{ date: b.dates[i], lines: d.lines }, ...(d.journal ? [{ date: b.dates[i], lines: d.journal }] : [])]);

/**
 * True when, taking the transactions in order, the cash in the office never runs out and the bank account is never
 * overdrawn (unless `overdraft` allows it). `cheques` are the transactions whose cash is a cheque in hand: it stands
 * in the cash column but cannot be spent, so it is left out of the cash here.
 */
function fundsLast(b: Book, o: { overdraft?: boolean; cheques?: Deal[] } = {}): boolean {
  let cash = b.opening.cash;
  let bank = b.opening.bank;
  for (const d of b.deals) {
    for (const l of d.lines) {
      const by = l.side === 'Dr' ? l.amount : -l.amount;
      if (l.accountId === 'cash' && !o.cheques?.includes(d)) cash += by;
      if (l.accountId === 'bank') bank += by;
    }
    if (cash < 0 || (bank < 0 && !o.overdraft && !b.single)) return false;
  }
  return true;
}

/** The two sides of a single column cash book: the cash amounts of `cashBook` alone, balanced and brought down. */
function singleColumnSides(view: CashBookView, closing: Closing): Pick<AccountParts, 'left' | 'right'> {
  const rows = (side: CashBookRow[]) => side.filter((r) => r.cash > 0).map((r) => ({ date: r.date, label: r.label, amount: r.cash }));
  const inHand = view.cash?.amount ?? 0;
  return {
    left: drSide(rows(view.debit), closing.reopenOn ? [{ date: closing.reopenOn, label: BALANCE_BD, amount: inHand }] : []),
    right: crSide([...rows(view.credit), { date: closing.closeOn, label: BALANCE_CD, amount: inHand, closing: true }]),
  };
}

/** Where one transaction is entered, as the working says it: the side, the column and the particulars of each row. */
function placed(d: Deal, single: boolean): string {
  const view = cashBook([{ date: '', lines: d.lines }], null, accountLabel);
  const rows = [...view.debit, ...view.credit].filter((r) => !single || r.cash > 0);
  if (rows.length === 0) return 'It is not entered in the cash book.';
  const one = (r: CashBookRow) =>
    `${r.side === 'Dr' ? 'debit' : 'credit'} side${single ? '' : r.cash > 0 ? ', cash column' : ', bank column'}: "${r.side === 'Dr' ? 'To' : 'By'} ${r.label}" ${f(r.cash || r.bank)}`;
  return `${cap(rows.map(one).join('; '))}${!single && rows.some((r) => r.contra) ? ', each marked C' : ''}.`;
}

/** The working a cash book ends on: each column totalled and balanced, and the balances brought down. */
function bookWork(view: CashBookView, b: Book): string[] {
  const column = (col: Col): string => {
    const bal = view[col];
    if (!bal) return '';
    const of = (rows: CashBookRow[]) => rows.map((r) => r[col]).filter((a) => a > 0);
    const list = (xs: Paise[]) => (xs.length === 0 ? 'nil' : xs.length === 1 ? f(xs[0]) : `${xs.map(f).join(' + ')} = ${f(sum(xs))}`);
    const name = b.single ? 'The cash book' : col === 'cash' ? 'Cash column' : 'Bank column';
    const total = f(view.totals[col]);
    const close =
      bal.side === 'Dr'
        ? `The debit side is larger by ${f(bal.amount)}, the ${col === 'cash' ? 'cash in hand' : 'balance at the bank'} on ${b.closeOn}: it is entered on the credit side as "By Balance c/d", and both sides then total ${total}.`
        : `The credit side is larger by ${f(bal.amount)}, so the bank account is overdrawn on ${b.closeOn}: the overdraft is entered on the debit side as "To Balance c/d", and both sides then total ${total}.`;
    return `${name}: debit side ${list(of(view.debit))}; credit side ${list(of(view.credit))}. ${close}`;
  };
  const down = (col: Col): string => {
    const bal = view[col];
    if (!bal) return '';
    return bal.side === 'Dr'
      ? `the ${col === 'cash' ? 'cash in hand' : 'balance at the bank'} of ${f(bal.amount)} on the debit side ("To Balance b/d")`
      : `the overdraft of ${f(bal.amount)} on the credit side ("By Balance b/d")`;
  };
  return b.single
    ? [column('cash'), `On ${b.reopenOn} the balance is brought down on the debit side, below the totals: "To Balance b/d" ${f(view.cash?.amount ?? 0)}.`]
    : [
        column('cash'),
        column('bank'),
        view.bank?.side === 'Dr'
          ? `On ${b.reopenOn} the balances are brought down below the totals, in one row on the debit side: "To Balance b/d" ${f(view.cash?.amount ?? 0)} in the cash column and ${f(view.bank.amount)} in the bank column.`
          : `On ${b.reopenOn} the balances are brought down below the totals: ${down('cash')} and ${down('bank')}.`,
      ];
}

/**
 * What a cash book template returns once its transactions are known: the two sides from `cashBook`, the data (the
 * `intro` and then one transaction to a line), the working (the `lead`, a step for every transaction, the balancing),
 * and the entries kept for `verify`. Null for a book that cannot be asked: a column with nothing to carry down, cash
 * that is overdrawn, or two rows of one side that nothing tells apart.
 */
function cashBookFrom(
  b: Book,
  rest: Omit<AccountParts, 'left' | 'right' | 'data' | 'columns' | 'explanation'> & { intro: string; lead: string[] },
): AccountParts | null {
  const entries = entriesOf(b);
  const view = cashBook(entries, b.opening, accountLabel);
  if (view.cash?.side !== 'Dr' || (!b.single && !view.bank)) return null;
  const closing: Closing = { closeOn: b.closeOn, reopenOn: b.reopenOn };
  const sides = b.single ? singleColumnSides(view, closing) : cashBookSides(view, closing);
  for (const side of [sides.left, sides.right]) {
    const keys = side.rows.map((r) => `${r.label}|${r.amount ?? ''}|${(r.amounts ?? []).join('|')}`);
    if (new Set(keys).size !== keys.length) return null;
  }
  const { intro, lead, ...parts } = rest;
  const data = [intro, ...b.deals.map((d, i) => `${b.dates[i]}: ${d.text}.`)].join('\n');
  keptBook.keep(data, { single: b.single, opening: b.opening, entries });
  return {
    ...parts,
    data,
    ...(b.single ? {} : { columns: CASH_BOOK_COLUMNS }),
    ...sides,
    explanation: [...lead, ...b.deals.map((d, i) => `${b.dates[i]}: ${d.why} ${placed(d, b.single)}`), ...bookWork(view, b)],
  };
}

/**
 * True when a cash book made from kept entries holds. The entries are posted again with `post`, which knows nothing
 * of sides or columns: the balance of each column must be carried down on the side opposite to its own and brought
 * down on its own (an overdraft is carried down on the debit side); each side of each column must carry exactly the
 * lines the entries debit and credit to Cash A/c and Bank A/c, with the opening balance the data states; every row
 * must name an account an entry sets against cash or bank; and the contra entries must be marked on both sides.
 */
function cashBookHolds(q: AccountQuestion): boolean {
  const kept = keptBook.of(q.data);
  if (!kept) return false;
  const { single, opening, entries } = kept;
  const cols: Col[] = single ? ['cash'] : ['cash', 'bank'];
  if (q.columns.length !== cols.length) return false;
  const told = rupeesIn(q.data.split('\n')[0]);
  if (!told.includes(opening.cash) || (!single && !told.includes(Math.abs(opening.bank)))) return false;
  const ledger = post(entries.map((e) => e.lines), new Map([['cash', opening.cash], ['bank', opening.bank]]));
  const inColumn = (rows: FormatRow[], c: number) => sum(rows.map((r) => r.amounts[c]));
  const columnsHold = cols.every((col, c) => {
    const net = ledger.get(col) ?? 0;
    if (net === 0 || (col === 'cash' && net < 0)) return false;
    const [mine, other] = net > 0 ? [q.sides[0], q.sides[1]] : [q.sides[1], q.sides[0]];
    if (inColumn(other.rows.filter((r) => r.closing), c) !== Math.abs(net) || inColumn(mine.rows.filter((r) => r.closing), c) !== 0) return false;
    if (inColumn(mine.below, c) !== Math.abs(net) || inColumn(other.below, c) !== 0) return false;
    const open = col === 'cash' ? opening.cash : opening.bank;
    return (['Dr', 'Cr'] as const).every((side, i) => {
      const posted = entries.flatMap((e) => e.lines.filter((l) => l.accountId === col && l.side === side));
      const opens = (side === 'Dr' ? open > 0 : open < 0) ? Math.abs(open) : 0;
      const rows = q.sides[i].rows.filter((r) => !r.closing && r.amounts[c] > 0);
      return inColumn(rows, c) === sum(posted.map((l) => l.amount)) + opens && rows.length === posted.length + (opens > 0 ? 1 : 0);
    });
  });
  if (!columnsHold) return false;
  // The accounts an entry sets against cash or bank, by the name the cash book gives them.
  const against = new Set(
    entries.flatMap((e) => e.lines.filter((l) => (cols as string[]).includes(l.accountId)).flatMap((own) => e.lines.filter((l) => l.side !== own.side).map((l) => accountLabel(l.accountId)))),
  );
  const rows = q.sides.flatMap((s) => s.rows);
  if (rows.some((r) => (r.closing ? r.label !== BALANCE_CD : r.label !== BALANCE_BD && !against.has(r.label)))) return false;
  if (q.sides.some((s) => s.below.some((r) => r.label !== BALANCE_BD))) return false;
  const contras = single ? 0 : entries.filter((e) => e.lines.every((l) => l.accountId === 'cash' || l.accountId === 'bank')).length;
  return q.sides.every((s) => s.rows.filter((r) => r.contra).length === contras);
}

const HINT_SIDES = 'Money coming in is a receipt, on the debit side ("To"); money going out is a payment, on the credit side ("By"). The particulars name the other account of the entry.';

// cb-fmt-single: a single column cash book for a week or a fortnight, balanced and brought down (easy)
const cbFmtSingle = accountTemplate({
  id: 'cb-fmt-single',
  topicId: T,
  conceptId: 'cb-formats',
  difficulty: 'easy',
  generate: (rng) =>
    several(16, () => {
      const firm = rng.pick(FIRMS);
      const month = rng.pick(SET_MONTHS);
      const fortnight = rng.next() < 0.5;
      const first = fortnight ? 1 : rng.pick(month === 'February' ? [1, 8, 15] : [1, 8, 15, 22]);
      const last = first + (fortnight ? 14 : 6);
      const period = fortnight ? 'fortnight' : 'week';
      const make = dealsFor(rng, true);
      const [e1, e2] = rng.shuffle(FMT_EXPENSES);
      const sale = make.cashSale();
      const receipts = rng.shuffle([make.debtorCash(customer(rng)), make.commission(), make.capitalCash(), make.furnitureSold(), make.withdraw()]);
      const payments = rng.shuffle([make.cashPurchase(), make.creditorCash(supplier(rng)), make.expense(e1, 'cash'), make.expense(e2, 'cash'), make.drawingsCash(), make.deposit()]);
      // Goods are sold for cash on one day of a week and on two days of a fortnight.
      const nIn = fortnight ? 2 : rng.int(1, 2);
      const nOut = fortnight ? rng.int(3, 4) : 3;
      const used = [sale, ...(fortnight ? [make.cashSale()] : []), ...receipts.slice(0, nIn), ...payments.slice(0, nOut)];
      const deals = rng.shuffle(used);
      const dates = setDays(rng, deals.length, first, last).map((d) => `${d} ${month}`);
      const book: Book = {
        single: true,
        opening: { date: `${first} ${month}`, cash: amount(rng, 10000, 40000, 1000), bank: 0 },
        deals,
        dates,
        closeOn: `${last} ${month}`,
        reopenOn: `${last + 1} ${month}`,
      };
      if (!fundsLast(book)) return null;
      const unused = [...receipts.slice(nIn), ...payments.slice(nOut)].map((d) => accountLabel(d.lines.find((l) => l.accountId !== 'cash')!.accountId));
      return cashBookFrom(book, {
        task: `Prepare the single column cash book of ${firm} for the ${period} ended ${book.closeOn}. Balance it on ${book.closeOn} and bring the balance down on ${book.reopenOn}.`,
        intro: `${firm} keeps a single column cash book. On ${book.opening.date} it had ${f(book.opening.cash)} in cash. These are its cash transactions of the ${period} from ${book.opening.date} to ${book.closeOn}:`,
        title: `Single Column Cash Book of ${firm}`,
        distractors: ['Cash A/c', ...unused],
        lead: [`The cash in hand on ${book.opening.date} opens the debit side: "To Balance b/d" ${f(book.opening.cash)}.`],
        hints: ['Take the transactions one at a time: is cash coming in or going out?', HINT_SIDES],
      });
    }),
  verify: cashBookHolds,
});

// cb-fmt-single-select: a single column cash book from all the transactions of a month, some of which do not belong (medium)
const cbFmtSingleSelect = accountTemplate({
  id: 'cb-fmt-single-select',
  topicId: T,
  conceptId: 'cb-formats',
  difficulty: 'medium',
  generate: (rng) =>
    several(16, () => {
      const firm = rng.pick(FIRMS);
      const month = rng.pick(SET_MONTHS);
      const d = customer(rng);
      const c = supplier(rng);
      const make = dealsFor(rng, true);
      const x = (lo: number, hi: number) => amount(rng, lo, hi, 500);
      const [e1, e2] = rng.shuffle(FMT_EXPENSES);
      // The dealings with a customer: goods sold on credit, perhaps some returned, and cash received on account.
      const sold = x(15000, 40000);
      const backIn = x(1000, 5000);
      const got = x(5000, (sold - 600000) / 100);
      const creditSale: Deal = { text: `Sold goods to ${d} on credit, ${f(sold)}`, why: `Goods are sold on credit: no cash is received until ${d} pays.`, lines: [debit(debtor(d), sold), credit('sales', sold)] };
      const returnIn: Deal = { text: `${d} returned goods of ${f(backIn)} out of those sold on credit`, why: `The goods that come back reduce what ${d} owes: no cash moves.`, lines: [debit('salesReturn', backIn), credit(debtor(d), backIn)] };
      const fromCustomer: Deal = { text: `Received ${f(got)} in cash from ${d} on account`, why: `${d} pays in cash: a receipt.`, lines: receive('cash', debtor(d), got) };
      // The dealings with a supplier: goods bought on credit, perhaps some sent back, and cash paid on account.
      const bought = x(15000, 40000);
      const backOut = x(1000, 5000);
      const paid = x(5000, (bought - 600000) / 100);
      const creditBuy: Deal = { text: `Bought goods from ${c} on credit, ${f(bought)}`, why: `Goods are bought on credit: no cash is paid until ${c} is paid.`, lines: [debit('purchases', bought), credit(creditor(c), bought)] };
      const returnOut: Deal = { text: `Returned to ${c} goods of ${f(backOut)} out of those bought on credit`, why: `The goods sent back reduce what is owed to ${c}: no cash moves.`, lines: [debit(creditor(c), backOut), credit('purchasesReturn', backOut)] };
      const toSupplier: Deal = { text: `Paid ${f(paid)} in cash to ${c} on account`, why: `${c} is paid in cash: a payment.`, lines: payOut('cash', creditor(c), paid) };
      const worn = x(1000, 4000);
      const depreciation: Deal = { text: `Charged depreciation of ${f(worn)} on furniture for the month`, why: 'Depreciation is a fall in the value of an asset: no cash is paid.', lines: [debit('depreciation', worn), credit('furniture', worn)] };

      // Two or three transactions that do not belong: a credit sale or a credit purchase at least, then a return or depreciation.
      const hasSale = rng.next() < 0.7;
      const hasBuy = !hasSale || rng.next() < 0.6;
      const returned = hasSale && rng.next() < 0.5 ? 'in' : hasBuy && rng.next() < 0.5 ? 'out' : null;
      let hasDepreciation = rng.next() < 0.5;
      const strangers = (hasSale ? 1 : 0) + (hasBuy ? 1 : 0) + (returned ? 1 : 0);
      if (strangers < 2) hasDepreciation = true;
      if (strangers > 2) hasDepreciation = false;
      const customerThread = hasSale ? [creditSale, ...(returned === 'in' ? [returnIn] : []), ...(rng.next() < 0.8 ? [fromCustomer] : [])] : [];
      const supplierThread = hasBuy ? [creditBuy, ...(returned === 'out' ? [returnOut] : []), ...(rng.next() < 0.8 ? [toSupplier] : [])] : [];
      const linked = [customerThread, supplierThread].flat().filter((t) => t === fromCustomer || t === toSupplier).length;
      // Five or six transactions that do belong: cash sales and an expense always, then others.
      const extras = rng.shuffle([make.cashPurchase(), make.expense(e2, 'cash'), make.drawingsCash(), make.commission()]);
      const loose = [make.cashSale(), make.expense(e1, 'cash'), ...extras.slice(0, rng.int(5, 6) - 2 - linked)];
      const deals = interleave(rng, [customerThread, supplierThread, ...loose.map((t) => [t])]);
      const last = LAST_DAY[month];
      const dates = setDays(rng, deals.length, 2, 27).map((day) => `${day} ${month}`);
      // Depreciation for the month is charged on its last day.
      if (hasDepreciation) {
        deals.push(depreciation);
        dates.push(`${last} ${month}`);
      }
      const book: Book = {
        single: true,
        opening: { date: `1 ${month}`, cash: amount(rng, 10000, 40000, 1000), bank: 0 },
        deals,
        dates,
        closeOn: `${last} ${month}`,
        reopenOn: `1 ${NEXT_MONTH[month]}`,
      };
      if (!fundsLast(book)) return null;
      return cashBookFrom(book, {
        task: `Prepare the single column cash book of ${firm} for ${month}. Balance it on ${book.closeOn} and bring the balance down on ${book.reopenOn}.`,
        intro: `${firm} keeps a single column cash book. On 1 ${month} it had ${f(book.opening.cash)} in cash. These are all the transactions of ${month} in its books, not only those in cash:`,
        title: `Single Column Cash Book of ${firm}`,
        distractors: ['Cash A/c', 'Purchases A/c', 'Depreciation A/c', 'Sales Return A/c', 'Purchases Return A/c', 'Furniture A/c', ...(hasSale ? [d] : []), ...(hasBuy ? [c] : [])],
        lead: [
          'The cash book takes only receipts and payments of cash. Goods sold or bought on credit, goods returned and depreciation move no cash, so they are left out of it.',
          `The cash in hand on 1 ${month} opens the debit side: "To Balance b/d" ${f(book.opening.cash)}.`,
        ],
        hints: [
          'Go down the list and ask of each transaction: was cash received or paid? Only those transactions are entered.',
          `Credit sales and purchases, goods returned and depreciation are recorded in other books. ${HINT_SIDES}`,
        ],
      });
    }),
  verify: cashBookHolds,
});

const HINT_COLUMNS =
  'Receipts go on the debit side and payments on the credit side; cash goes in the cash column and cheques in the bank column. Cash paid into the bank, or drawn from it for the office, is a contra entry: it is entered on both sides, once in each column.';
const doubleTask = (firm: string, month: string, note = '') =>
  `Prepare the double column cash book of ${firm}, with cash and bank columns, for ${month}${note}. Balance it on ${LAST_DAY[month]} ${month} and bring the balances down on 1 ${NEXT_MONTH[month]}.`;
const openingLead = (b: Book) =>
  `The opening balances stand first on the debit side, in one row: "To Balance b/d" ${f(b.opening.cash)} in the cash column and ${f(b.opening.bank)} in the bank column.`;
/** The label a transaction that was not used would have given: the account it sets against cash or bank. */
const otherLabels = (deals: Deal[]) => deals.map((d) => accountLabel(d.lines.find((l) => l.accountId !== 'cash' && l.accountId !== 'bank')!.accountId));

// cb-fmt-double: a cash book with cash and bank columns, with one or two contra entries (medium)
const cbFmtDouble = accountTemplate({
  id: 'cb-fmt-double',
  topicId: T,
  conceptId: 'cb-formats',
  difficulty: 'medium',
  generate: (rng) =>
    several(16, () => {
      const firm = rng.pick(FIRMS);
      const month = rng.pick(SET_MONTHS);
      const [d1, d2] = rng.shuffle(DEBTORS);
      const [c1, c2] = rng.shuffle(CREDITORS);
      const make = dealsFor(rng, false);
      const [e1, e2] = rng.shuffle(FMT_EXPENSES);
      const cashIn = rng.shuffle([make.cashSale(), make.debtorCash(d1), make.commission()]);
      const cashOut = rng.shuffle([make.cashPurchase(), make.expense(e1, 'cash'), make.drawingsCash(), make.creditorCash(c1)]);
      const bankIn = rng.shuffle([make.debtorCheque(d2), make.chequeSale()]);
      const bankOut = rng.shuffle([make.creditorCheque(c2), make.expense(e2, 'bank'), make.chequePurchase(), make.drawingsBank(), make.furnitureCheque()]);
      const [nCashIn, nCashOut, nBankOut] = [rng.int(1, 2), rng.int(1, 2), rng.int(1, 2)];
      const paidIn = make.deposit();
      const drawn = make.withdraw();
      const contras = rng.pick([[paidIn], [drawn], [paidIn, drawn]]);
      const deals = rng.shuffle([...cashIn.slice(0, nCashIn), ...cashOut.slice(0, nCashOut), bankIn[0], ...bankOut.slice(0, nBankOut), ...contras]);
      // The proprietor draws once in the month, in cash or from the bank.
      if (deals.filter((t) => t.lines.some((l) => l.accountId === 'drawings')).length > 1) return null;
      const book: Book = {
        single: false,
        opening: { date: `1 ${month}`, cash: amount(rng, 10000, 40000, 1000), bank: amount(rng, 30000, 90000, 5000) },
        deals,
        dates: setDays(rng, deals.length, 2, 27).map((day) => `${day} ${month}`),
        closeOn: `${LAST_DAY[month]} ${month}`,
        reopenOn: `1 ${NEXT_MONTH[month]}`,
      };
      if (!fundsLast(book)) return null;
      return cashBookFrom(book, {
        task: doubleTask(firm, month),
        intro: `${firm} keeps a cash book with cash and bank columns. Every cheque received is paid into the bank on the day it is received. On 1 ${month} cash in hand was ${f(book.opening.cash)} and the balance at the bank was ${f(book.opening.bank)}. These are its transactions of ${month}:`,
        title: `Double Column Cash Book of ${firm}`,
        distractors: ['Capital A/c', 'Bank Charges A/c', ...otherLabels([...cashIn.slice(nCashIn), ...cashOut.slice(nCashOut), bankIn[1], ...bankOut.slice(nBankOut)])],
        lead: [openingLead(book)],
        hints: ['For each transaction decide two things: is money coming in or going out, and is it cash or the bank?', HINT_COLUMNS],
      });
    }),
  verify: cashBookHolds,
});

// cb-fmt-overdraft: cash and bank columns opening with an overdraft, cheques banked the same day and one kept (complex)
const cbFmtOverdraft = accountTemplate({
  id: 'cb-fmt-overdraft',
  topicId: T,
  conceptId: 'cb-formats',
  difficulty: 'complex',
  generate: (rng) =>
    several(24, () => {
      const firm = rng.pick(FIRMS);
      const month = rng.pick(SET_MONTHS);
      const [d1, d2] = rng.shuffle(DEBTORS);
      const c1 = supplier(rng);
      const make = dealsFor(rng, false);
      const [e1, e2] = rng.shuffle(FMT_EXPENSES);
      const hasSale = rng.next() < 0.5;
      const issued = rng.shuffle([make.creditorCheque(c1), make.expense(e1, 'bank'), make.chequePurchase(), make.drawingsBank()]);
      const inCash = rng.shuffle([make.cashSale(), make.expense(e2, 'cash'), make.cashPurchase()]);
      const nCash = hasSale ? 1 : rng.int(1, 2);
      const banked = [make.debtorCheque(d2), ...(hasSale ? [make.chequeSale()] : [])];
      // The cheque that is kept: cash when it comes, and a contra entry on the day it is deposited, which names the day it came.
      const kept = amount(rng, 6000, 30000, 500);
      const receipt: Deal = {
        text: `Received a cheque for ${f(kept)} from ${d1}, a debtor. It was not banked that day`,
        why: 'The cheque is not banked on the day it is received, so it is treated as cash: a receipt in the cash column.',
        lines: receive('cash', debtor(d1), kept),
      };
      const paidIn = (came: number): Deal => ({
        text: `Deposited into the bank the cheque received from ${d1} on ${came} ${month}`,
        why: `The cheque was entered in the cash column when it came, so depositing it moves ${f(kept)} from the cash column to the bank column. ${CONTRA_WHY}`,
        lines: [debit('bank', kept), credit('cash', kept)],
      });
      const steps = interleave<Deal | 'deposit'>(rng, [[receipt, 'deposit'], ...[...banked, ...issued.slice(0, 2), ...inCash.slice(0, nCash)].map((t) => [t])]);
      const days = setDays(rng, steps.length, 2, 27);
      const deals = steps.map((s) => (s === 'deposit' ? paidIn(days[steps.indexOf(receipt)]) : s));
      const overdraft = amount(rng, 10000, 45000, 1000);
      const book: Book = {
        single: false,
        opening: { date: `1 ${month}`, cash: amount(rng, 8000, 30000, 1000), bank: -overdraft },
        deals,
        dates: days.map((day) => `${day} ${month}`),
        closeOn: `${LAST_DAY[month]} ${month}`,
        reopenOn: `1 ${NEXT_MONTH[month]}`,
      };
      if (!fundsLast(book, { overdraft: true, cheques: [receipt, deals[steps.indexOf('deposit')]] })) return null;
      return cashBookFrom(book, {
        task: doubleTask(firm, month),
        intro:
          `${firm} keeps a cash book with cash and bank columns. A cheque received is banked the same day unless the transaction says otherwise; a cheque that is not banked on the day it is received is treated as cash until it is deposited. ` +
          `On 1 ${month} cash in hand was ${f(book.opening.cash)} and the bank account was overdrawn by ${f(overdraft)}. These are its transactions of ${month}:`,
        title: `Double Column Cash Book of ${firm}`,
        distractors: ['Bank Overdraft A/c', 'Capital A/c', ...otherLabels([...issued.slice(2), ...inCash.slice(nCash)])],
        lead: [
          `Cash in hand is a debit balance: it opens on the debit side of the cash column, "To Balance b/d" ${f(book.opening.cash)}. An overdraft is a credit balance of the bank column: it opens on the credit side, "By Balance b/d" ${f(overdraft)}.`,
        ],
        hints: [
          'Start with the opening balances: on which side does an overdraft stand? Then take each cheque received: was it banked that day, or kept?',
          'An overdraft opens on the credit side of the bank column and, if the account is still overdrawn at the end, is carried down on the debit side. A cheque that is kept is entered in the cash column, and depositing it later is a contra entry.',
        ],
      });
    }),
  verify: cashBookHolds,
});

/**
 * A debtor or a creditor settles in full at a cash discount. The cash book takes the money alone; the discount goes
 * through the journal. Either the money is stated beside the amount due, or the rate is and the money is worked out.
 */
function settlement(rng: Rng, incoming: boolean, who: string): Deal {
  const due = amount(rng, 8000, 40000, 1000);
  const pct = rng.pick([2, 4, 5, 10]);
  const disc = percentOf(due, pct);
  const money = due - disc;
  const col: Col = rng.pick(['bank', 'cash']);
  const byRate = rng.pick([true, false]);
  const how = col === 'bank' ? 'by cheque' : 'in cash';
  const account = incoming ? debtor(who) : creditor(who);
  const through = incoming ? `Discount Allowed A/c Dr, To ${who}` : `${who} Dr, To Discount Received A/c`;
  const moved = incoming ? 'received' : 'paid';
  return {
    text: incoming
      ? byRate
        ? `${who}, a debtor who owed ${f(due)}, settled the account in full, ${how}, after deducting a cash discount of ${pct}%`
        : `Received ${col === 'bank' ? `a cheque for ${f(money)}` : `${f(money)} in cash`} from ${who}, a debtor, in full settlement of ${f(due)}`
      : byRate
        ? `Settled in full, ${how}, the ${f(due)} owed to ${who}, a creditor, after deducting a cash discount of ${pct}%`
        : `Paid ${f(money)} ${how} to ${who}, a creditor, in full settlement of ${f(due)}`,
    why: byRate
      ? `Cash discount = ${pct}% of ${f(due)} = ${f(disc)}, so the money ${moved} is ${f(due)} - ${f(disc)} = ${f(money)}. Only the money is entered; the discount goes through the journal (${through}).`
      : `Only the ${f(money)} ${moved} is entered. The discount, ${f(due)} - ${f(money)} = ${f(disc)}, goes through the journal (${through}).`,
    lines: incoming ? receive(col, account, money) : payOut(col, account, money),
    journal: incoming ? [debit('discountAllowed', disc), credit(account, disc)] : [debit(account, disc), credit('discountReceived', disc)],
  };
}

/**
 * True when every settlement told in the data is in the cash book for the money alone: the amount is read from the
 * line (stated, or the amount due less the percentage), and a row of that amount must name the party, on the debit
 * side for a debtor and on the credit side for a creditor, in the column the line says. No row may name a discount.
 */
function settlementsHold(q: AccountQuestion): boolean {
  const has = (side: 0 | 1, who: string, line: string, money: Paise) => {
    const at = /cheque/.test(line) ? 1 : 0;
    return q.sides[side].rows.some((r) => r.label === who && r.amounts[at] === money && r.amounts[1 - at] === 0);
  };
  let settled = 0;
  const lines = q.data.split('\n').slice(1);
  const each = lines.every((line) => {
    const m = rupeesIn(line);
    const pct = Number(/cash discount of (\d+)%/.exec(line)?.[1] ?? 0);
    const found =
      /: (.+), a debtor who owed/.exec(line) ?? /from (.+), a debtor, in full settlement of/.exec(line) ?? /owed to (.+), a creditor, after/.exec(line) ?? /to (.+), a creditor, in full settlement of/.exec(line);
    if (!found) return true;
    settled++;
    const incoming = /a debtor/.test(line);
    // With a rate the line gives the amount due alone; otherwise the money first and then the amount due.
    const money = pct > 0 ? (m[0] * (100 - pct)) / 100 : m[0];
    return (pct > 0 ? m.length === 1 : m.length === 2 && m[0] < m[1]) && has(incoming ? 0 : 1, found[1], line, money);
  });
  return each && settled > 0 && q.sides.every((s) => s.rows.every((r) => !/Discount/.test(r.label)));
}

// cb-fmt-discount: cash and bank columns with accounts settled at a cash discount, which the cash book does not show (medium)
const cbFmtDiscount = accountTemplate({
  id: 'cb-fmt-discount',
  topicId: T,
  conceptId: 'cb-formats',
  difficulty: 'medium',
  generate: (rng) =>
    several(16, () => {
      const firm = rng.pick(FIRMS);
      const month = rng.pick(SET_MONTHS);
      const [d1, d2] = rng.shuffle(DEBTORS);
      const [c1, c2] = rng.shuffle(CREDITORS);
      const make = dealsFor(rng, false);
      const e1 = rng.pick(FMT_EXPENSES);
      const allowed = settlement(rng, true, d1);
      const received = settlement(rng, false, c1);
      const onAccount = 'A part payment: the account is not settled, so no discount arises.';
      const a = amount(rng, 4000, 15000, 500);
      const partIn: Deal = { text: `Received ${f(a)} in cash from ${d2}, a debtor, on account`, why: `${onAccount} Cash is received.`, lines: receive('cash', debtor(d2), a) };
      const partOut: Deal = { text: `Paid ${f(a)} by cheque to ${c2}, a creditor, on account`, why: `${onAccount} The bank balance falls.`, lines: payOut('bank', creditor(c2), a) };
      const settled = rng.pick([[allowed, received], [allowed, received, rng.pick([partIn, partOut])], [allowed, partOut], [received, partIn]]);
      const others = rng.shuffle([make.cashSale(), make.expense(e1, rng.pick(['cash', 'bank'] as const)), make.cashPurchase(), make.chequeSale(), make.drawingsCash()]);
      const nOthers = rng.int(3, 4);
      const contra = rng.pick([[], [make.deposit()], [make.withdraw()]]);
      const deals = rng.shuffle([...settled, ...others.slice(0, nOthers), ...contra]);
      const book: Book = {
        single: false,
        opening: { date: `1 ${month}`, cash: amount(rng, 10000, 40000, 1000), bank: amount(rng, 40000, 100000, 5000) },
        deals,
        dates: setDays(rng, deals.length, 2, 27).map((day) => `${day} ${month}`),
        closeOn: `${LAST_DAY[month]} ${month}`,
        reopenOn: `1 ${NEXT_MONTH[month]}`,
      };
      if (!fundsLast(book)) return null;
      return cashBookFrom(book, {
        task: doubleTask(firm, month, ', entering only the money received or paid where an account is settled at a discount'),
        intro:
          `${firm} keeps a cash book with cash and bank columns only. It has no discount column: a cash discount allowed or received is recorded through the journal, and the cash book shows the money alone. ` +
          `Every cheque received is paid into the bank on the day it is received. On 1 ${month} cash in hand was ${f(book.opening.cash)} and the balance at the bank was ${f(book.opening.bank)}. These are its transactions of ${month}:`,
        title: `Double Column Cash Book of ${firm}`,
        distractors: ['Discount Allowed A/c', 'Discount Received A/c', 'Capital A/c', ...otherLabels(others.slice(nOthers))],
        lead: [
          'The cash book has no discount column, so it shows only the money that moves. Each discount is recorded by a journal entry, in Discount Allowed A/c or Discount Received A/c.',
          openingLead(book),
        ],
        hints: [
          'Where an account is settled at a discount, how much money actually changed hands? That is the only figure the cash book takes.',
          `Money received or paid = amount due - cash discount. The discount is not entered in the cash book. ${HINT_COLUMNS}`,
        ],
      });
    }),
  verify: (q) => cashBookHolds(q) && settlementsHold(q),
});

// cb-fmt-month: a full month in the cash book with cash and bank columns: a dishonoured cheque, items from the pass book, a contra entry (complex)
const cbFmtMonth = accountTemplate({
  id: 'cb-fmt-month',
  topicId: T,
  conceptId: 'cb-formats',
  difficulty: 'complex',
  // 2: the interest the bank credits is the quarter's interest on a fixed deposit, of a size that fits the balances.
  version: 2,
  generate: (rng) =>
    several(24, () => {
      const firm = rng.pick(FIRMS);
      const month = rng.pick(SET_MONTHS);
      const last = LAST_DAY[month];
      const d1 = customer(rng);
      const make = dealsFor(rng, false);
      const e1 = rng.pick(FMT_EXPENSES);
      // Goods are bought in cash or by cheque, or both ways; when they are bought one way only, goods are usually also
      // sold for a cheque. That keeps the book to 14 rows at most, the balances brought down included.
      const both = rng.next() < 0.5;
      const chequeSale = !both && rng.next() < 0.75;
      const purchases = both ? [make.cashPurchase(), make.chequePurchase()] : [rng.pick([true, false]) ? make.cashPurchase() : make.chequePurchase()];
      const expense = make.expense(e1, rng.pick(['cash', 'bank'] as const));
      const drawings = rng.pick([true, false]) ? make.drawingsCash() : make.drawingsBank();
      const contra = rng.pick([true, false]) ? make.deposit() : make.withdraw();
      // A cheque from a debtor, banked the day it came and returned by the bank later in the month.
      const cheque = make.debtorCheque(d1);
      const bounced = cheque.lines[0].amount;
      const dishonour = (came: number): Deal => ({
        text: `The bank returned dishonoured the cheque for ${f(bounced)} received from ${d1} on ${came} ${month}`,
        why: `The cheque was not paid, so the bank takes back the ${f(bounced)} it had added, and ${d1} owes the amount again: a credit in the bank column.`,
        lines: [debit(debtor(d1), bounced), credit('bank', bounced)],
      });
      const steps = interleave<Deal | 'dishonour'>(rng, [
        [cheque, 'dishonour'],
        ...[make.cashSale(), ...purchases, expense, drawings, contra, ...(chequeSale ? [make.chequeSale()] : [])].map((t) => [t]),
      ]);
      const days = setDays(rng, steps.length, 2, 27);
      // What the pass book shows is entered on the day it is noticed, the last day of the month.
      const charges = amount(rng, 200, 1500, 100);
      // A current account earns no interest: what the bank credits is the quarter's interest on a fixed deposit.
      const interest = amount(rng, 600, 2400, 100);
      const passBook: Deal[] = rng.shuffle([
        { text: `The pass book showed that the bank had debited ${f(charges)} as bank charges`, why: 'The bank has taken its charges out of the account: the bank balance falls.', lines: payOut('bank', 'bankCharges', charges) },
        { text: `The pass book showed that the bank had credited ${f(interest)} to the current account as the quarter's interest on the firm's fixed deposit`, why: 'The bank has added the interest to the current account: the bank balance rises.', lines: receive('bank', 'interestReceived', interest) },
      ]);
      const deals = [...steps.map((s) => (s === 'dishonour' ? dishonour(days[steps.indexOf(cheque)]) : s)), ...passBook];
      const book: Book = {
        single: false,
        opening: { date: `1 ${month}`, cash: amount(rng, 10000, 40000, 1000), bank: amount(rng, 40000, 120000, 5000) },
        deals,
        dates: [...days, ...passBook.map(() => last)].map((day) => `${day} ${month}`),
        closeOn: `${last} ${month}`,
        reopenOn: `1 ${NEXT_MONTH[month]}`,
      };
      if (!fundsLast(book)) return null;
      return cashBookFrom(book, {
        task: doubleTask(firm, month),
        intro: `${firm} keeps a cash book with cash and bank columns. Every cheque received is paid into the bank on the day it is received. On 1 ${month} cash in hand was ${f(book.opening.cash)} and the balance at the bank was ${f(book.opening.bank)}. These are its transactions of ${month}:`,
        title: `Double Column Cash Book of ${firm}`,
        distractors: ['Bad Debts A/c', 'Interest Paid A/c', 'Capital A/c', 'Sales Return A/c', 'Bank Overdraft A/c'],
        lead: [openingLead(book), 'Bank charges and interest are known only from the pass book: each is entered in the bank column on the day it is noticed.'],
        hints: [
          'Take the transactions in date order. For each: is money coming in or going out, and is it cash or the bank? A dishonoured cheque undoes a receipt.',
          `A cheque that is dishonoured is entered on the credit side of the bank column against the customer. Bank charges are a payment out of the bank and interest credited is a receipt into it. ${HINT_COLUMNS}`,
        ],
      });
    }),
  verify: cashBookHolds,
});

// cb-fmt-petty: a week of petty cash on the imprest system as a statement: receipts, payments by head, balance in hand (medium)
const PETTY_COLUMNS = ['Receipts (₹)', 'Payments (₹)'];
const PETTY_RECEIVED = 'Cash received from the head cashier';
const PETTY_BALANCE = 'Balance in hand';

const cbFmtPetty = statementTemplate({
  id: 'cb-fmt-petty',
  topicId: T,
  conceptId: 'cb-formats',
  difficulty: 'medium',
  generate: (rng) => {
    const firm = rng.pick(FIRMS);
    const month = rng.pick(SET_MONTHS);
    const first = rng.pick([1, 8, 15, 22]);
    const last = first + 5;
    // Seven to nine vouchers under four or five heads: every head has one, and at least two heads have several.
    const heads = rng.shuffle(HEADS).slice(0, rng.int(4, 5));
    const left = heads.map((h) => rng.shuffle(PETTY.filter((p) => p.head === h)));
    const picked: PettyItem[] = left.map((items) => items.shift()!);
    const more = rng.int(3, 4);
    for (let i = 0; i < more; i++) {
      const open = left.filter((items) => items.length > 0);
      picked.push(rng.pick(open).shift()!);
    }
    // No more than two payments on a day, and no two of the same amount.
    const week = Array.from({ length: last - first + 1 }, (_, i) => first + i);
    const days = rng.shuffle([...week, ...week]).slice(0, picked.length).sort((a, b) => a - b);
    const amounts = rng.shuffle(Array.from({ length: 55 }, (_, i) => 6000 + 1000 * i)).slice(0, picked.length);
    const vouchers = rng.shuffle(picked).map((p, i) => ({ ...p, day: days[i], amt: amounts[i] }));
    const spent = sum(vouchers.map((v) => v.amt));
    // A round imprest that the week's payments leave ₹300 or more of.
    const imprest = Math.ceil((spent + 30000 + 50000 * rng.int(0, 2)) / 50000) * 50000;
    const inHand = imprest - spent;
    // How the week starts: the imprest given for the first time, or last week's balance made up to the imprest.
    const start = rng.pick(['first', 'stated', 'madeUp'] as const);
    const before = amount(rng, 100, imprest / 100 - 500, 10);
    const day1 = `${first} ${month}`;
    const opening =
      start === 'first'
        ? `On ${day1} the head cashier started the system by giving the petty cashier the imprest of ${f(imprest)}.`
        : start === 'stated'
          ? `The imprest is ${f(imprest)}. On ${day1} the petty cashier had ${f(before)} in hand from the week before and received ${f(imprest - before)} from the head cashier.`
          : `The imprest is ${f(imprest)}. On ${day1} the petty cashier had ${f(before)} in hand from the week before, and the head cashier made the petty cash up to the imprest.`;
    const receipts =
      start === 'first'
        ? [{ date: day1, label: PETTY_RECEIVED, amounts: [imprest, 0] }]
        : [
            { date: day1, label: BALANCE_BD, amounts: [before, 0] },
            { date: day1, label: PETTY_RECEIVED, amounts: [imprest - before, 0] },
          ];
    const under = (h: string) => vouchers.filter((v) => v.head === h);
    const end = `${last} ${month}`;
    return {
      task: `Prepare a statement of the petty cash of ${firm} for the week ended ${end}: the receipts, the payments of the week as one total under each head of expense, and the balance in hand on ${end}.`,
      data: `${firm} keeps its petty cash on the imprest system: at the start of every week the head cashier makes the petty cash up to the imprest. Its petty cash book analyses the payments under five heads: Postage, Conveyance, Stationery, Refreshments and Repairs. ${opening} These are the petty cashier's payments of the week from ${day1} to ${end}:\n${vouchers.map((v) => `${v.day} ${month}: ${cap(v.what)}, ${f(v.amt)}.`).join('\n')}`,
      title: `Petty Cash Statement of ${firm} for the week ended ${end}`,
      columns: PETTY_COLUMNS,
      rows: [...receipts, ...heads.map((h) => ({ label: h, amounts: [0, sum(under(h).map((v) => v.amt))], details: under(h).map((v) => `${cap(v.what)} ${f(v.amt)}`) }))],
      final: { label: PETTY_BALANCE, amount: inHand },
      // "Imprest" is offered only where the cash received is less than the imprest: where it is the imprest, the name would be defensible.
      distractors: [...HEADS.filter((h) => !heads.includes(h)), 'Bank A/c', 'Drawings', ...(start === 'first' ? [BALANCE_BD] : ['Imprest'])],
      explanation: [
        start === 'first'
          ? `Receipts: the imprest of ${f(imprest)} received from the head cashier. Nothing was in hand before, so there is no balance brought down.`
          : start === 'stated'
            ? `Receipts: the balance of ${f(before)} brought down from last week and ${f(imprest - before)} received from the head cashier, ${f(imprest)} in all, which is the imprest.`
            : `Receipts: the balance of ${f(before)} brought down from last week, and what makes it up to the imprest: ${f(imprest)} - ${f(before)} = ${f(imprest - before)} received from the head cashier.`,
        ...heads.map((h) => `${h} (${MEANS[h]}): ${under(h).length === 1 ? f(under(h)[0].amt) : `${under(h).map((v) => f(v.amt)).join(' + ')} = ${f(sum(under(h).map((v) => v.amt)))}`}.`),
        `Total payments = ${heads.map((h) => f(sum(under(h).map((v) => v.amt)))).join(' + ')} = ${f(spent)}.`,
        `Balance in hand on ${end} = receipts - payments = ${f(imprest)} - ${f(spent)} = ${f(inHand)}.`,
        `At the start of the next week the head cashier gives exactly what was spent, ${f(spent)}, which makes the petty cash up to the imprest of ${f(imprest)} again.`,
      ],
      hints: [
        'Enter what the petty cashier started the week with in the receipts column. Then sort the payments by head and add up each head.',
        'Each payment belongs under one head: Postage, Conveyance, Stationery, Refreshments or Repairs. Balance in hand = total receipts - total payments, and the amount to be reimbursed equals the payments.',
      ],
    };
  },
  // Read back from the data the student sees: the imprest and what was in hand, each voucher under the head its
  // item belongs to, and the balance as what the imprest has left once the vouchers are paid.
  verify: (q: StatementQuestion) => {
    const [intro, ...lines] = q.data.split('\n');
    const told = rupeesIn(intro);
    const imprest = told[0];
    const byHead = new Map<string, Paise>();
    for (const line of lines) {
      const m = /^\d+ \w+: (.+), ₹([\d,]+)\.$/.exec(line);
      const item = m && PETTY.find((p) => cap(p.what) === m[1]);
      if (!m || !item) return false;
      byHead.set(item.head, (byHead.get(item.head) ?? 0) + Number(m[2].replace(/,/g, '')) * 100);
    }
    const spent = sum([...byHead.values()]);
    const receipts = q.rows.filter((r) => r.amounts[0] > 0);
    const payments = q.rows.filter((r) => r.amounts[1] > 0);
    const totals = columnTotals(q.rows, 2);
    // What was in hand (when the week did not start the system) is brought down, and the rest of the imprest is received.
    const before = told.length > 1 ? told[1] : 0;
    const want = before > 0 ? [[BALANCE_BD, before], [PETTY_RECEIVED, imprest - before]] : [[PETTY_RECEIVED, imprest]];
    return (
      lines.length >= 5 &&
      q.rows.every((r) => r.amounts[0] === 0 || r.amounts[1] === 0) &&
      receipts.length === want.length &&
      want.every(([label, a]) => receipts.some((r) => r.label === label && r.amounts[0] === a)) &&
      (told.length < 3 || told[2] === imprest - before) &&
      payments.length === byHead.size &&
      payments.every((r) => byHead.get(r.label) === r.amounts[1]) &&
      totals[0] === imprest &&
      totals[1] === spent &&
      q.final?.label === PETTY_BALANCE &&
      q.final.amount === imprest - spent
    );
  },
});

// cb-fmt-petty-book: the payments of a week in an analytical petty cash book: every voucher in the Total payment
// column and in the column of its head, and the balance carried down (medium)
const PETTY_TOTAL = 'Total payment (₹)';
/** The number of amount columns of the petty cash book asked for: the total payment and three heads. */
const PETTY_BOOK_COLUMNS = 4;

const cbFmtPettyBook = statementTemplate({
  id: 'cb-fmt-petty-book',
  topicId: T,
  conceptId: 'cb-formats',
  difficulty: 'medium',
  generate: (rng) => {
    const firm = rng.pick(FIRMS);
    const month = rng.pick(SET_MONTHS);
    const first = rng.pick([1, 8, 15, 22]);
    const last = first + 5;
    // Three of the heads of the topic, in the order the topic names them, as the analysis columns.
    const chosen = rng.shuffle(HEADS).slice(0, PETTY_BOOK_COLUMNS - 1);
    const heads = HEADS.filter((h) => chosen.includes(h));
    // Six to eight vouchers, each for a different thing (so no two rows read alike): every head has one at least.
    const left = heads.map((h) => rng.shuffle(PETTY.filter((p) => p.head === h)));
    const picked: PettyItem[] = left.map((items) => items.shift()!);
    const more = rng.int(3, 5);
    for (let i = 0; i < more; i++) {
      const open = left.filter((items) => items.length > 0);
      picked.push(rng.pick(open).shift()!);
    }
    // No more than two payments on a day, and no two of the same amount. Vouchers are numbered in date order.
    const week = Array.from({ length: last - first + 1 }, (_, i) => first + i);
    const days = rng.shuffle([...week, ...week]).slice(0, picked.length).sort((a, b) => a - b);
    const amounts = rng.shuffle(Array.from({ length: 55 }, (_, i) => 6000 + 1000 * i)).slice(0, picked.length);
    const vouchers = rng.shuffle(picked).map((p, i) => ({ ...p, no: i + 1, day: days[i], amt: amounts[i] }));
    const spent = sum(vouchers.map((v) => v.amt));
    // A round imprest that the week's payments leave ₹300 or more of.
    const imprest = Math.ceil((spent + 30000 + 50000 * rng.int(0, 2)) / 50000) * 50000;
    const inHand = imprest - spent;
    // How the week starts: the imprest given for the first time, or last week's balance (half the imprest at most, as
    // after a week like this one) made up to the imprest.
    const start = rng.pick(['first', 'stated', 'madeUp'] as const);
    const before = amount(rng, 100, imprest / 200, 10);
    const day1 = `${first} ${month}`;
    const end = `${last} ${month}`;
    const opening =
      start === 'first'
        ? `On ${day1} the head cashier started the system by giving the petty cashier the imprest of ${f(imprest)}.`
        : start === 'stated'
          ? `The imprest is ${f(imprest)}. On ${day1} the petty cashier had ${f(before)} in hand from the week before and received ${f(imprest - before)} from the head cashier.`
          : `The imprest is ${f(imprest)}. On ${day1} the petty cashier had ${f(before)} in hand from the week before, and the head cashier made the petty cash up to the imprest.`;
    const under = (h: string) => vouchers.filter((v) => v.head === h);
    const added = (xs: Paise[]) => (xs.length === 1 ? f(xs[0]) : `${xs.map(f).join(' + ')} = ${f(sum(xs))}`);
    const headTotals = heads.map((h) => sum(under(h).map((v) => v.amt)));
    return {
      task: `Write up the payments of the week ended ${end} in the analytical petty cash book of ${firm}, each in the Total payment column and in the column of its head, and give the balance of petty cash carried down on ${end}.`,
      data:
        `${firm} keeps an analytical petty cash book on the imprest system: at the start of every week the head cashier makes the petty cash up to the imprest. ` +
        `Beside the Total payment column the book has three analysis columns: ${heads[0]}, ${heads[1]} and ${heads[2]}. ${opening} ` +
        `These are the petty cashier's payments of the week from ${day1} to ${end}, each with the number of its voucher:\n` +
        vouchers.map((v) => `${v.day} ${month} (voucher ${v.no}): ${cap(v.what)}, ${f(v.amt)}.`).join('\n'),
      title: `Analytical Petty Cash Book of ${firm}: payments of the week ended ${end}`,
      columns: [PETTY_TOTAL, ...heads.map((h) => `${h} (₹)`)],
      rows: vouchers.map((v) => ({ date: `${v.day} ${month}`, ref: `V${v.no}`, label: cap(v.what), amounts: [v.amt, ...heads.map((h) => (h === v.head ? v.amt : 0))] })),
      final: { label: BALANCE_CD, amount: inHand },
      // What the petty cashier receives or brings down stands in the receipts column: it is not a payment of the week.
      distractors: [PETTY_RECEIVED, BALANCE_BD, 'Imprest'],
      explanation: [
        'Every payment has a line of its own and is entered on it twice: in the Total payment column, and again in the analysis column of its head. What the petty cashier receives or brings down is not a payment: it stands in the receipts column and is not entered here.',
        ...heads.map((h) => `${h} column (${MEANS[h]}): ${under(h).map((v) => `${v.what} ${f(v.amt)}`).join(', ')}${under(h).length > 1 ? `; total ${f(sum(under(h).map((v) => v.amt)))}` : ''}.`),
        `Total payment column = ${added(vouchers.map((v) => v.amt))}. The three analysis columns add up to the same figure: ${added(headTotals)}.`,
        start === 'first'
          ? `The petty cashier received the imprest of ${f(imprest)} and had nothing in hand before.`
          : start === 'stated'
            ? `The petty cashier had the balance of ${f(before)} brought down and ${f(imprest - before)} received from the head cashier: ${f(before)} + ${f(imprest - before)} = ${f(imprest)}, the imprest.`
            : `The petty cashier had the balance of ${f(before)} brought down, and the head cashier made it up to the imprest of ${f(imprest)} by giving ${f(imprest)} - ${f(before)} = ${f(imprest - before)}.`,
        `Balance c/d on ${end} = cash the petty cashier had - total payments = ${f(imprest)} - ${f(spent)} = ${f(inHand)}. It is the petty cash in hand, and it closes the book for the week.`,
        `At the start of the next week the head cashier gives exactly what was spent, ${f(spent)}, which makes the petty cash up to the imprest of ${f(imprest)} again.`,
      ],
      hints: [
        'Take the vouchers one at a time. The amount goes in the Total payment column and once more under one head: which head is the payment for?',
        `${heads.map((h) => `${h} is for ${MEANS[h]}`).join('; ')}. Balance c/d = the imprest the petty cashier started the week with - the total of the Total payment column.`,
      ],
    };
  },
  // Read back from the data the student sees: each voucher goes under the head its item belongs to, the columns are
  // added again from the vouchers, and the balance is what the cash the petty cashier had leaves once they are paid.
  verify: (q: StatementQuestion) => {
    const [intro, ...lines] = q.data.split('\n');
    const heads = q.columns.slice(1).map((c) => c.replace(/ \(₹\)$/, ''));
    if (q.columns.length !== PETTY_BOOK_COLUMNS || q.columns[0] !== PETTY_TOTAL || heads.some((h) => !HEADS.includes(h) || !intro.includes(h))) return false;
    if (lines.length < 6 || lines.length !== q.rows.length || new Set(q.rows.map((r) => r.label)).size !== q.rows.length) return false;
    // The imprest; then, when the week did not start the system, what was in hand and (where it is stated) what was received.
    const told = rupeesIn(intro);
    const imprest = told[0];
    const had = told.length === 3 ? told[1] + told[2] : imprest;
    if (told.length < 1 || told.length > 3 || had !== imprest || (told.length > 1 && told[1] >= imprest)) return false;
    const columns = Array.from({ length: PETTY_BOOK_COLUMNS }, () => 0);
    for (const [i, line] of lines.entries()) {
      const m = /^\d+ \w+ \(voucher (\d+)\): (.+), ₹([\d,]+)\.$/.exec(line);
      const item = m && PETTY.find((p) => cap(p.what) === m[2]);
      const at = item ? heads.indexOf(item.head) : -1;
      if (!m || at < 0 || Number(m[1]) !== i + 1) return false;
      const paid = Number(m[3].replace(/,/g, '')) * 100;
      // The voucher's own row: the amount in the Total payment column and in the column of its head, and nowhere else.
      const row = q.rows.find((r) => r.label === m[2]);
      if (!row || row.amounts.some((a, c) => a !== (c === 0 || c === at + 1 ? paid : 0))) return false;
      columns[0] += paid;
      columns[at + 1] += paid;
    }
    const totals = columnTotals(q.rows, PETTY_BOOK_COLUMNS);
    return (
      totals.every((t, c) => t === columns[c]) &&
      totals[0] === sum(totals.slice(1)) &&
      totals.slice(1).every((t) => t > 0) &&
      q.final?.label === BALANCE_CD &&
      q.final.amount === had - totals[0]
    );
  },
});

const formats: Template[] = [cbFmtSingle, cbFmtSingleSelect, cbFmtDouble, cbFmtOverdraft, cbFmtDiscount, cbFmtMonth, cbFmtPetty, cbFmtPettyBook];

/**
 * What the chained cases of the stage "Cash book to bank reconciliation" (`cases/cash-and-bank.ts`) reuse of the
 * cash books above, so that a cash book prepared as one part of a case has the rows, the wording and the working of
 * the formats of this topic: the transactions with their sentences, the book written up from them (`book`, whose
 * `data` a case replaces with its own text), and the heads of the petty cash book.
 */
export type { Deal as CashBookDeal, Book as CashBookPlan, PettyItem };
export const CB_CHAIN = {
  lastDay: LAST_DAY,
  nextMonth: NEXT_MONTH,
  expenses: FMT_EXPENSES,
  deals: dealsFor,
  several,
  fundsLast,
  entriesOf,
  book: cashBookFrom,
  doubleTask,
  openingLead,
  otherLabels,
  contraWhy: CONTRA_WHY,
  hintSides: HINT_SIDES,
  hintColumns: HINT_COLUMNS,
  petty: { items: PETTY, heads: HEADS, means: MEANS, totalColumn: PETTY_TOTAL, received: PETTY_RECEIVED },
};

// ---------------------------------------------------------------------------------------------------------------
// Hints. Each family of questions has its own pair: a first nudge, then a stronger hint that names the step. A
// template given its pair here makes a different question (the hints are part of it), so it is at its next version;
// the templates whose figures were also put right at that version say so where they are defined.
// ---------------------------------------------------------------------------------------------------------------

type HintPair = readonly [string, string];

/** The template at `version` (the one after its own), with `hints` in place of the default pair. */
function revised<X extends Template>(t: X, version: number, hints: HintPair): X {
  if (t.version !== version - 1) throw new Error(`${t.id} is at version ${t.version}, not ${version - 1}`);
  const generate = (rng: Rng, seed: number) => {
    const parts = (t.generate as (r: Rng, s: number) => object | null)(rng, seed);
    return parts && { ...parts, hints: [...hints] };
  };
  return { ...t, version, generate } as X;
}

const H_CLOSING: HintPair = [
  'Start from the opening balance of the column asked for. Which items bring money into that column, and which take money out?',
  'Closing balance = opening balance + the debits of the column - its credits. A contra entry is in both columns, once on each side; a credit sale or purchase is in neither.',
];
const H_IGNORE_CREDIT: HintPair = [
  'Before adding anything, strike out what moved no money: goods sold or bought on credit, depreciation, an expense that is only due.',
  'Then work the column asked for: opening balance + its receipts - its payments, counting each contra entry in this column too.',
];
const H_SIDE_TOTAL: HintPair = [
  'The debit side holds the opening balance and every receipt; the credit side holds every payment and, once the book is balanced, the balance c/d.',
  'Debit total = opening balance + receipts. The balance c/d is the figure that brings the credit side up to that same total.',
];
const H_WORK_BACK: HintPair = [
  'Write the column as one line: opening balance + receipts = payments + closing balance.',
  'Put in every figure you know and solve for the one that is missing. Working back, a receipt is taken off and a payment added back.',
];
const H_COMBINED: HintPair = [
  'A contra entry only moves money between the two columns. Which transactions bring money into the firm, or take it out?',
  'Cash + bank at the close = cash + bank at the start + receipts from outside - payments to outside. The contra entries cancel out.',
];
const H_CONTRA_FIGURES: HintPair = [
  'Each contra entry changes both columns, in opposite directions. On each date, which column gains and which loses?',
  'Deposit of cash: bank column debit, cash column credit. Cash drawn for the office: cash column debit, bank column credit. Closing balance = opening + debits - credits; cash and bank together do not change.',
];
const H_OVERDRAFT: HintPair = [
  'An opening overdraft is a credit balance: it starts on the credit side of the bank column, not among the receipts.',
  'Total the debit side and the credit side of the bank column. If the credit side is larger, the account is overdrawn by the difference.',
];
const H_OVERDRAFT_ITEMS: HintPair = [
  'Put the opening overdraft on the credit side of the bank column, then take the items from the bank one at a time: does each add to the bank balance or take from it?',
  'Bank charges, interest on the overdraft and a dishonoured cheque go on the credit side; interest on a fixed deposit credited by the bank goes on the debit side. The larger side decides between a balance and an overdraft.',
];
const H_SIDE_TOTALS_BANK: HintPair = [
  'List every debit and every credit of the bank column, with the opening balance or overdraft on its own side.',
  'After balancing, both sides total the larger side: the balance c/d is added to the smaller side to make it equal.',
];
const H_FROM_TOTALS: HintPair = [
  'Compare the two totals: which side is larger?',
  'Balance = larger side - smaller side. A larger debit side is money in hand (or a favourable bank balance); a larger credit side of the bank column is an overdraft.',
];
const H_BALANCE_SIDE: HintPair = [
  'Is it a balance the column opens with, or the closing balance that balances it?',
  'Cash in hand and a favourable bank balance open on the debit side, an overdraft on the credit side. A closing balance is written on the smaller side, as "Balance c/d".',
];
const H_SIDE: HintPair = ['Is cash coming into the firm or going out of it?', HINT_SIDES];
const H_COLUMN: HintPair = [
  'Two questions: is money coming in or going out, and did notes and coins move or did the money pass through the bank?',
  HINT_COLUMNS,
];
const H_NOT_RECORDED: HintPair = [
  'Did any cash or cheque change hands on that day?',
  'The cash book records only money received or paid, in cash or through the bank. Credit dealings, goods returned on credit and adjustments such as depreciation are recorded elsewhere.',
];
const H_CHEQUE: HintPair = [
  'Was the cheque banked the day it came, kept for some days, or issued by the firm?',
  'Banked the same day: bank column. Kept: cash column when it comes, then a contra entry when it is banked. Issued: credit side of the bank column on the day it is issued.',
];
const H_DISHONOUR: HintPair = [
  'What does the bank do with the amount it added when the cheque was paid in?',
  'A dishonour undoes the receipt: credit side of the bank column, and the customer is debited because the amount is owed again.',
];
const H_CONTRA: HintPair = [
  'Are both accounts of the entry, Cash and Bank, inside the cash book?',
  'A contra entry moves money between the cash column and the bank column only: the column that receives is debited, the one that gives is credited. Drawings, cheques from debtors and payments to creditors are not contra entries.',
];
const H_CONTRA_COUNT: HintPair = [
  'Pick out only the transactions in which cash and bank are the two accounts.',
  'Cash paid into the bank or drawn from it for the office is a contra entry, counted once although it is written in both columns. A cheque from a customer, or money drawn by the owner for personal use, is not.',
];
const H_DISC_WHERE: HintPair = [
  'Did the discount move any money?',
  'Only money received or paid enters the cash book. Cash discount allowed is a loss (Discount Allowed A/c is debited); cash discount received is a gain (Discount Received A/c is credited); trade discount is never recorded.',
];
const H_DISC_FIGURES: HintPair = [
  'Is the rate worked on the amount due or on the amount paid?',
  'Discount = rate x amount due; amount paid = amount due - discount. The cash book shows the amount paid, the journal the discount.',
];
const H_DISC_JOURNAL: HintPair = [
  'The cheque is already in the cash book. How much is still open in the account of the debtor or creditor?',
  'Discount allowed: Discount Allowed A/c Dr, To the debtor. Discount received: the creditor Dr, To Discount Received A/c. Bank A/c has no part in it.',
];
const H_DISC_CLOSING: HintPair = [
  'Work out each settlement first: the amount due less the cash discount is what passes through the bank.',
  'Then balance the bank column: opening balance + cheques banked - cheques issued, using only the amounts actually received or paid.',
];
const H_IMPREST: HintPair = [
  'Three figures are tied together: the imprest, the amount spent and the cash in hand. Which two do you know?',
  'Imprest = amount spent + cash in hand. At the end of the period the head cashier reimburses exactly the amount spent.',
];
const H_PETTY_HEAD: HintPair = [
  'What kind of expense is it: postage, a local fare, office supplies, tea, or mending something?',
  'Postage is for stamps and postal charges, Conveyance for local fares, Stationery for paper and pens, Refreshments for tea and snacks, Repairs for mending damaged items.',
];
const H_PETTY_ANALYSIS: HintPair = [
  'Which head of expense does each payment belong to?',
  'Every payment is in the total column and once more under its head, so the analysis columns add up to the total column.',
];
const H_PETTY_MORE: HintPair = [
  'What has gone out of the petty cash this period, whatever it was for?',
  'The head cashier replaces everything paid out (an advance too) and adds any rise in the imprest, so that the petty cashier starts the next period with the imprest.',
];
const H_SET_CONTRA: HintPair = [
  'Take the dates in order. Are cash and bank the two accounts (a contra entry), or does another account come in?',
  'Cash paid into the bank: Bank A/c Dr, To Cash A/c. Cash drawn for the office: Cash A/c Dr, To Bank A/c. Drawn for the owner: Drawings A/c Dr. A cheque kept in the office is cash until it is banked.',
];
const H_SET_DISCOUNT_PETTY: HintPair = [
  'Take the dates in order. What moved, and how much was actually received or paid?',
  'A settlement with discount: cash or bank for the amount paid, and Discount Allowed or Received for the rest. Imprest given: Petty Cash A/c Dr. Petty expenses: each expense A/c Dr, To Petty Cash A/c. Reimbursement: Petty Cash A/c Dr, To Cash or Bank A/c.',
];

// ---------------------------------------------------------------------------------------------------------------
// Added after the mock papers were set, so they stand on levels of their own and on no paper, worksheet or Look back
// level (src/generators/outsidePapers.ts): a balance of the bank column asked with its nature, cheques endorsed to a
// creditor, GST in the cash book, and the full analytical petty cash book.
// ---------------------------------------------------------------------------------------------------------------

/** A balance of the bank column in words: positive is money at the bank, negative an overdraft. */
const natureOf = (b: number): string => (b > 0 ? `A favourable balance of ${f(b)}` : `An overdraft of ${f(-b)}`);
/** The same amount told the other way: what a student who reads the larger side wrongly says. */
const otherNature = (b: number): string => (b > 0 ? `An overdraft of ${f(b)}` : `A favourable balance of ${f(-b)}`);
const WRONG_WAY = (b: number) =>
  b > 0
    ? 'Found the difference but called it an overdraft: a larger debit side means the bank holds money for the firm.'
    : 'Found the difference but called it a favourable balance: a larger credit side of the bank column means the firm owes the bank.';

interface McqRun {
  prompt: string;
  correct: string;
  distractors: Distractor[];
  explanation: string;
  /** The right option again, worked another way from the same figures. */
  recheck: () => string;
}

/** An mcq worked out from drawn figures, as `numericRun` is: `verify` replays the seed and works the answer out again. */
function mcqRun(def: { id: string; conceptId: string; difficulty: Difficulty; hints: HintPair; run: (rng: Rng) => McqRun | null }) {
  return mcqTemplate({
    id: def.id,
    topicId: T,
    conceptId: def.conceptId,
    difficulty: def.difficulty,
    generate: (rng) => {
      const r = def.run(rng);
      const seen = new Set([r?.correct]);
      const distractors = (r?.distractors ?? []).filter((d) => !seen.has(d.text) && seen.add(d.text));
      return r && distractors.length >= 3 ? { prompt: r.prompt, correct: r.correct, distractors, explanation: r.explanation, hints: [...def.hints] } : null;
    },
    verify: (q) => {
      const id = parseGenId(q.id);
      if (!id) return false;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const r = def.run(attemptRng(id.seed, attempt));
        if (r && r.prompt === q.prompt) return r.recheck() === q.options.find((o) => o.id === q.correct)?.text;
      }
      return false;
    },
  });
}

/** Businesses of other kinds, for questions about one bank account where no goods need to be named. */
const BANK_FIRMS = ['Sharma Dental Clinic', 'Vidya Coaching Centre', 'Kaveri Agro Inputs', 'Sai Ram Transport Company', 'Annapurna Caterers', 'Prakash Printing Works', 'Green Leaf Nursery', 'Mehta Motor Garage'];

const H_NATURE: HintPair = [
  'Which side of the bank column is larger once everything, the opening balance or overdraft too, is on its side?',
  'The difference is the balance. A larger debit side is a favourable balance (the bank owes the firm); a larger credit side is an overdraft (the firm owes the bank).',
];

// cb-nature-totals: the two totals of the bank column given; the balance asked with its nature (easy)
const cbNatureTotals = mcqRun({
  id: 'cb-nature-totals',
  conceptId: 'cb-balancing',
  difficulty: 'easy',
  hints: H_NATURE,
  run: (rng) => {
    const a = amount(rng, 20000, 150000, 1000);
    const b = amount(rng, 20000, 150000, 1000);
    if (a === b) return null;
    const firm = rng.pick(BANK_FIRMS);
    const month = rng.pick(SET_MONTHS);
    // Some months open with an overdraft, which stands on the credit side with the cheques issued.
    const od = rng.pick([true, false]) ? amount(rng, 5000, Math.min(60000, b / 100 - 5000), 1000) : 0;
    if (od < 0) return null;
    const close = a - b;
    const prompt =
      `At the end of ${month} the bank column of the cash book of ${firm} is added up. Its debit side (cheques banked and cash paid in) totals ${f(a)}. ` +
      `Its credit side totals ${f(b)}: ${od > 0 ? `the overdraft of ${f(od)} it opened with on 1 ${month}, and ` : ''}the cheques issued and the bank charges. What does the bank column show at the end of the month?`;
    const distractors: Distractor[] = [
      { text: otherNature(close), why: WRONG_WAY(close) },
      { text: (close > 0 ? natureOf : otherNature)(a + b), why: 'Added the two sides together instead of finding the difference.' },
      { text: natureOf(Math.max(a, b) * Math.sign(close)), why: 'Gave the larger side instead of the difference between the sides.' },
      { text: natureOf(Math.min(a, b) * Math.sign(close)), why: 'Gave the smaller side instead of the difference between the sides.' },
      ...(od > 0 && a - (b - od) !== 0 ? [{ text: natureOf(a - (b - od)), why: 'Left the opening overdraft out of the credit side.' }] : []),
    ];
    return {
      prompt,
      correct: natureOf(close),
      distractors,
      explanation:
        close > 0
          ? `The debit side (${f(a)}) is larger than the credit side (${f(b)}) by ${f(close)}: the firm has a favourable balance of ${f(close)} at the bank. It is written on the credit side as "By Balance c/d".`
          : `The credit side (${f(b)}${od > 0 ? `, the opening overdraft included` : ''}) is larger than the debit side (${f(a)}) by ${f(-close)}: the account is overdrawn by ${f(-close)}. The overdraft is written on the debit side as "To Balance c/d".`,
      recheck: () => (a > b ? `A favourable balance of ${f(a - b)}` : `An overdraft of ${f(b - a)}`),
    };
  },
});

/** A month that opens with an overdraft, and the balance it closes with, told with its nature. */
function natureMonth(rng: Rng, m: Model | null, more: string[] = []): McqRun | null {
  if (!m) return null;
  const close = balance(m, 'bank');
  if (close === 0) return null;
  const told = (mods: Mods) => balance(m, 'bank', mods);
  const slips: [number, string][] = [
    [told({ odPositive: true }), 'Took the opening overdraft as a favourable balance and put it with the receipts.'],
    [told({ skipOpening: true }), 'Left out the opening overdraft.'],
    [told({ skipContra: true }), 'Left out the contra entries, which change the bank column too.'],
    [told({ bothCols: true }), "Mixed the cash column's receipts and payments into the bank column."],
    [told({ payAdds: true }), 'Added the payments to the receipts instead of putting them on the credit side.'],
  ];
  return {
    prompt: promptOf(m, 'What does the bank column show at the end of the month?'),
    correct: natureOf(close),
    distractors: [{ text: otherNature(close), why: WRONG_WAY(close) }, ...slips.filter(([v]) => v !== 0).map(([v, why]) => ({ text: natureOf(v), why }))],
    explanation: [...columnLines(m, 'bank'), ...more, ...notes(m)].join(' '),
    recheck: () => natureOf(closeBySides(m, 'bank')),
  };
}

// cb-nature-month: a month that opens with an overdraft; the closing balance or overdraft, with its nature (medium)
const cbNatureMonth = mcqRun({
  id: 'cb-nature-month',
  conceptId: 'cb-balancing',
  difficulty: 'medium',
  hints: H_NATURE,
  // A cheque banked in every month, so that about as many months close with a balance as with an overdraft.
  run: (rng) => natureMonth(rng, doubleSetup(rng, { n: [5, 7], overdraft: true, need: [DEPOSIT, rng.pick(BANK_IN), rng.pick(BANK_IN)] })),
});

// cb-nature-complex: the same with items known only from the bank (charges, interest, a dishonoured cheque) (complex)
const cbNatureComplex = mcqRun({
  id: 'cb-nature-complex',
  conceptId: 'cb-balancing',
  difficulty: 'complex',
  hints: H_OVERDRAFT_ITEMS,
  run: (rng) =>
    natureMonth(
      rng,
      doubleSetup(rng, { n: [7, 9], overdraft: true, pool: [...BASE, DEPOSIT, WITHDRAW, ...SLIPS], need: [DEPOSIT, rng.pick(BANK_IN), rng.pick(BANK_IN), ...rng.shuffle(SLIPS).slice(0, 2)] }),
    ),
});

const H_ENDORSE: HintPair = [
  'Did the cheque ever reach the firm\'s bank account, or did it go straight on to the creditor?',
  'A cheque endorsed to a creditor settles what the firm owes: the creditor is debited and the customer who gave the cheque credited. It touches the bank column only if it was banked, and the cash column only if it was being held as cash.',
];

// cb-endorse-entry: a cheque received and endorsed to a creditor, or such a cheque dishonoured (medium)
const cbEndorseEntry = journalTemplate({
  id: 'cb-endorse-entry',
  topicId: T,
  conceptId: 'cb-sides',
  difficulty: 'medium',
  generate: (rng) => {
    const firm = rng.pick(FIRMS);
    const d = customer(rng);
    const c = supplier(rng);
    const a = amount(rng, 4000, 60000, 500);
    const day = rng.int(2, 26);
    const month = rng.pick(SET_MONTHS);
    if (rng.int(1, 3) === 1) {
      return {
        prompt: `${firm} had endorsed to ${c}, a creditor, a cheque for ${f(a)} received from ${d}, a debtor. On ${day} ${month} ${c} reported that the cheque had been dishonoured. Pass the journal entry in the books of ${firm}.`,
        lines: [{ accountId: debtor(d), side: 'Dr', amount: a }, { accountId: creditor(c), side: 'Cr', amount: a }],
        explanation: [
          `When the cheque was endorsed, ${c} was debited and ${d} credited.`,
          `The dishonour undoes that: ${d} owes the amount again, so ${d} is debited.`,
          `${c} has not been paid after all, so ${c} is credited. The firm's bank account was never touched, so Bank A/c has no part in the entry.`,
        ],
        distractorAccounts: ['bank', 'badDebts', 'bankCharges'],
        hints: [...H_ENDORSE],
      };
    }
    const full = rng.pick([true, false]);
    return {
      prompt: `On ${day} ${month} ${firm} received a cheque for ${f(a)} from ${d}, a debtor, and endorsed it the same day to ${c}, a creditor, ${full ? 'in full settlement of the amount owed to' : 'on account of what it owed to'} ${c}. The cheque was never paid into the firm's bank. Pass the journal entry.`,
      lines: [{ accountId: creditor(c), side: 'Dr', amount: a }, { accountId: debtor(d), side: 'Cr', amount: a }],
      explanation: [
        `${c} is paid with the cheque, so what the firm owes ${c} falls: ${c} is debited.`,
        `${d} has paid with it, so what ${d} owes falls: ${d} is credited.`,
        'The cheque passed straight from the debtor to the creditor and never reached the firm\'s bank, so neither Bank A/c nor Cash A/c is in the entry, and the cash book records nothing.',
      ],
      distractorAccounts: ['bank', 'cash', 'discountReceived'],
      hints: [...H_ENDORSE],
    };
  },
  // The cheque's amount is the only one in the prompt; the debtor and the creditor are the ones it names, and which
  // of them is debited turns on whether the cheque came back dishonoured.
  verify: (q) => {
    const [a] = rupeesIn(q.prompt);
    const dr = q.expected.find((l) => l.side === 'Dr')?.accountId ?? '';
    const cr = q.expected.find((l) => l.side === 'Cr')?.accountId ?? '';
    const named = (id: string, role: string) => q.prompt.includes(`${id.slice(id.indexOf(':') + 1)}, a ${role}`);
    const dishonoured = /dishonoured/.test(q.prompt);
    return (
      q.expected.length === 2 &&
      q.expected.every((l) => l.amount === a) &&
      (dishonoured ? dr.startsWith('debtor:') && cr.startsWith('creditor:') : dr.startsWith('creditor:') && cr.startsWith('debtor:')) &&
      named(dishonoured ? dr : cr, 'debtor') &&
      named(dishonoured ? cr : dr, 'creditor')
    );
  },
});

// cb-endorse-where: where an endorsed cheque stands in the double column cash book (medium)
const cbEndorseWhere = mcqTemplate({
  id: 'cb-endorse-where',
  topicId: T,
  conceptId: 'cb-sides',
  difficulty: 'medium',
  generate: (rng) => {
    const d = customer(rng);
    const c = supplier(rng);
    const x = f(amount(rng, 4000, 60000, 500));
    const month = rng.pick(SET_MONTHS);
    const d1 = rng.int(2, 20);
    if (rng.pick(['same', 'held'] as const) === 'same') {
      return {
        prompt: `A firm banks every cheque on the day it is received unless it says otherwise. On ${d1} ${month} it received a cheque for ${x} from ${d}, a debtor, and endorsed it the same day to ${c}, a creditor, without banking it. How is this recorded?`,
        correct: `No entry in the cash book: ${c} is debited and ${d} credited by a journal entry`,
        distractors: [
          { text: `Debit side of the bank column, "To ${d}", and credit side of the bank column, "By ${c}"`, why: 'Passed the cheque through the bank, although it was never paid in.' },
          { text: `Debit side of the bank column only, "To ${d}"`, why: 'Treated the cheque as banked; it went straight on to the creditor.' },
          { text: `Credit side of the bank column, "By ${c}"`, why: 'Treated it as a cheque the firm wrote on its own account; the firm only passed on a cheque it had received.' },
          { text: `Debit side of the cash column, "To ${d}"`, why: 'Entered the cheque as cash in hand, although it left the firm on the day it came.' },
        ],
        explanation: `Neither the firm's cash nor its bank balance changes: the cheque goes from ${d} to ${c}. The journal records it: ${c} Dr, To ${d}, ${x}.`,
        hints: [...H_ENDORSE],
      };
    }
    const d2 = d1 + rng.int(2, 5);
    return {
      prompt: `A firm treats a cheque that is not banked on the day it is received as cash until it is deposited. On ${d1} ${month} it received a cheque for ${x} from ${d}, a debtor, kept it in the office and entered it in the cash column. On ${d2} ${month} it endorsed the cheque to ${c}, a creditor. How is the endorsement entered in the double column cash book on ${d2} ${month}?`,
      correct: `Credit side of the cash column, "By ${c}"`,
      distractors: [
        { text: `Credit side of the bank column, "By ${c}"`, why: 'Treated the endorsement as a cheque drawn on the firm\'s own bank account.' },
        { text: 'Debit side of the bank column and credit side of the cash column', why: 'Entered a deposit; the cheque went to the creditor, not to the bank.' },
        { text: 'No entry in the cash book', why: 'Forgot that the cheque stands in the cash column and must leave it when it is handed over.' },
        { text: `Debit side of the cash column, "To ${c}"`, why: 'Put the cheque that is going out on the receipts side.' },
      ],
      explanation: `On ${d1} ${month} the cheque came into the cash column as cash ("To ${d}"). Handing it to ${c} on ${d2} ${month} is a payment out of that cash: credit side of the cash column, "By ${c}", and ${c} is debited in the ledger.`,
      hints: [...H_ENDORSE],
    };
  },
  verify: (q) => {
    const right = q.options.find((o) => o.id === q.correct)?.text ?? '';
    return /without banking it/.test(q.prompt) ? right.startsWith('No entry in the cash book') : /entered it in the cash column/.test(q.prompt) && right.startsWith('Credit side of the cash column');
  },
});

/** Goods with the GST rate that applies to them (5% or 18%), and a business that sells them. */
const GST_GOODS: { firm: string; goods: string; rate: 5 | 18 }[] = [
  { firm: 'Nair Spices of Kochi', goods: 'packets of spices', rate: 5 },
  { firm: 'Kaveri Tea Traders of Coonoor', goods: 'packets of tea', rate: 5 },
  { firm: 'Sri Murugan Oil Stores of Madurai', goods: 'tins of groundnut oil', rate: 5 },
  { firm: 'Patel Fabrics of Surat', goods: 'rolls of cotton fabric', rate: 5 },
  { firm: 'Gupta Electricals of Jaipur', goods: 'electrical wires and switches', rate: 18 },
  { firm: 'Joshi Hardware of Pune', goods: 'tins of paint', rate: 18 },
  { firm: 'Bharat Computers of Indore', goods: 'printer cartridges', rate: 18 },
];
const gstWords = (rate: number, inter: boolean) => (inter ? `IGST at ${rate}%` : `GST at ${rate}% (CGST ${rate / 2}% and SGST ${rate / 2}%)`);

const H_GST_CASH: HintPair = [
  'Work out the taxable value first: the price after any trade discount. Then the GST on it.',
  'The cash book shows what actually changes hands: taxable value + CGST + SGST within the state, or taxable value + IGST between states. The GST is part of the money received or paid.',
];

// cb-gst-amount: the amount a sale or purchase with GST puts in the cash or bank column (medium)
const cbGstAmount = numericRun({
  id: 'cb-gst-amount',
  conceptId: 'cb-double',
  difficulty: 'medium',
  hints: H_GST_CASH,
  run: (rng) => {
    const g = rng.pick(GST_GOODS);
    const inter = rng.pick([true, false]);
    const kind = rng.pick(['cashSale', 'chequeSale', 'chequePurchase'] as const);
    const discounted = rng.int(1, 3) === 1;
    const list = amount(rng, 10000, 80000, 2000);
    const taxable = discounted ? (list * 9) / 10 : list;
    const tax = percentOf(taxable, g.rate);
    const answer = taxable + tax;
    const price = discounted ? `goods listed at ${f(list)} less a trade discount of 10%` : `goods worth ${f(list)}`;
    const where = inter ? 'in another state' : 'in the same state';
    const words = gstWords(g.rate, inter);
    const [what, column] =
      kind === 'cashSale'
        ? [`${g.firm} sold ${g.goods} (${price}) to a customer ${where}, charging ${words}. The customer paid in cash.`, 'the debit side of the cash column']
        : kind === 'chequeSale'
          ? [`${g.firm} sold ${g.goods} (${price}) to a customer ${where}, charging ${words}. The customer paid by cheque, which was banked the same day.`, 'the debit side of the bank column']
          : [`A shop bought ${g.goods} (${price}) from ${g.firm}, a supplier ${where}, and was charged ${words}. It paid by cheque at once.`, 'the credit side of the bank column of the shop\'s cash book'];
    const errors: Err[] = [
      [taxable, 'Left the GST out; the GST is part of the money that changes hands.'],
      [tax, 'Gave only the GST.'],
      ...(inter
        ? ([[taxable + tax / 2, 'Charged IGST at half the rate, as if it were CGST alone.']] as Err[])
        : ([[taxable + tax / 2, 'Added only one of CGST and SGST.'], [taxable + 2 * tax, 'Charged CGST and SGST each at the full rate.']] as Err[])),
      ...(discounted ? ([[list + percentOf(list, g.rate), 'Worked the GST on the list price and left out the trade discount.'], [list + tax, 'Added the GST to the list price instead of to the price after trade discount.']] as Err[]) : []),
    ];
    return {
      prompt: `${what} What amount is entered on ${column}?`,
      answer,
      errors,
      working: [
        ...(discounted ? [`Taxable value = ${f(list)} - 10% trade discount (${f(list - taxable)}) = ${f(taxable)}. The trade discount is never recorded.`] : [`Taxable value = ${f(taxable)}.`]),
        inter
          ? `IGST = ${g.rate}% of ${f(taxable)} = ${f(tax)}.`
          : `CGST = ${g.rate / 2}% of ${f(taxable)} = ${f(tax / 2)} and SGST = ${f(tax / 2)}: GST ${f(tax)} in all.`,
        `Money that changes hands = ${f(taxable)} + ${f(tax)} = ${f(answer)}, entered on ${column}.`,
      ],
      recheck: () => Math.round((taxable * (100 + g.rate)) / 100),
    };
  },
});

// cb-gst-entry: the entry for a cash sale or a cheque purchase with GST, as the cash book records it (medium)
const cbGstEntry = journalTemplate({
  id: 'cb-gst-entry',
  topicId: T,
  conceptId: 'cb-double',
  difficulty: 'medium',
  generate: (rng) => {
    const g = rng.pick(GST_GOODS);
    const inter = rng.pick([true, false]);
    const sale = rng.pick([true, false]);
    const x = amount(rng, 10000, 80000, 1000);
    const tax = percentOf(x, g.rate);
    const total = x + tax;
    const taxLines = (side: 'Dr' | 'Cr'): JournalLine[] => {
      const head = side === 'Cr' ? 'output' : 'input';
      return inter ? [{ accountId: `${head}IGST`, side, amount: tax }] : [{ accountId: `${head}CGST`, side, amount: tax / 2 }, { accountId: `${head}SGST`, side, amount: tax / 2 }];
    };
    const where = inter ? 'in another state' : 'in the same state';
    if (sale) {
      return {
        prompt: `${g.firm} sold ${g.goods} for ${f(x)} in cash to a customer ${where}, charging ${gstWords(g.rate, inter)}. Pass the journal entry (the receipt is entered in the cash column of its cash book).`,
        lines: [{ accountId: 'cash', side: 'Dr', amount: total }, { accountId: 'sales', side: 'Cr', amount: x }, ...taxLines('Cr')],
        explanation: [
          inter ? `IGST = ${g.rate}% of ${f(x)} = ${f(tax)}.` : `CGST = SGST = ${g.rate / 2}% of ${f(x)} = ${f(tax / 2)} each.`,
          `Cash received = ${f(x)} + ${f(tax)} = ${f(total)}: Cash A/c is debited with it.`,
          `Sales A/c is credited with ${f(x)} only. The GST collected is owed to the government: ${inter ? 'Output IGST A/c is' : 'Output CGST A/c and Output SGST A/c are'} credited.`,
        ],
        distractorAccounts: ['inputCGST', 'inputIGST', 'outputIGST', 'outputCGST'],
        hints: [...H_GST_CASH],
      };
    }
    return {
      prompt: `A shop bought ${g.goods} for ${f(x)} from ${g.firm}, a supplier ${where}, and was charged ${gstWords(g.rate, inter)}. It paid by cheque at once. Pass the journal entry in the books of the shop (the payment is entered in the bank column of its cash book).`,
      lines: [{ accountId: 'purchases', side: 'Dr', amount: x }, ...taxLines('Dr'), { accountId: 'bank', side: 'Cr', amount: total }],
      explanation: [
        `Purchases A/c is debited with the price of the goods, ${f(x)}.`,
        inter ? `IGST paid = ${g.rate}% of ${f(x)} = ${f(tax)}: Input IGST A/c is debited, as it will be set off against GST due.` : `CGST and SGST paid = ${f(tax / 2)} each: Input CGST A/c and Input SGST A/c are debited, as they will be set off against GST due.`,
        `The cheque is for ${f(x)} + ${f(tax)} = ${f(total)}: Bank A/c is credited.`,
      ],
      distractorAccounts: ['outputCGST', 'outputIGST', 'inputIGST', 'inputCGST'],
      hints: [...H_GST_CASH],
    };
  },
  // From the price and the rate in the prompt, every line again: the goods at the price, the tax at the rate (split
  // equally within the state), and cash or bank for the two together.
  verify: (q) => {
    const [x] = rupeesIn(q.prompt);
    const rate = Number(/(?:GST|IGST) at (\d+)%/.exec(q.prompt)?.[1] ?? 0);
    const tax = Math.round((x * rate) / 100);
    const inter = /IGST at/.test(q.prompt);
    const by = (id: string) => q.expected.find((l) => l.accountId === id)?.amount ?? 0;
    const taxIds = q.expected.filter((l) => /^(input|output)(C|S|I)GST$/.test(l.accountId));
    const taxOk = inter ? taxIds.length === 1 && taxIds[0].amount === tax && /IGST$/.test(taxIds[0].accountId) : taxIds.length === 2 && taxIds.every((l) => l.amount === tax / 2 && !/IGST$/.test(l.accountId));
    return (rate === 5 || rate === 18) && taxOk && (by('sales') === x || by('purchases') === x) && by('cash') + by('bank') === x + tax;
  },
});

// cb-fmt-petty-full: a week of the analytical petty cash book in full: receipts, every voucher in the Total payment
// column and under its head, the balance carried down, the totals, and below them the balance brought down and the
// cash that restores the imprest (medium)
const PETTY_FULL_HEADS = 2;
const PETTY_RECEIPTS = 'Receipts (₹)';
const PETTY_FULL_TOTAL = 'Total';
const PETTY_FIRMS = ['Sharma Dental Clinic', 'Vidya Coaching Centre', 'Sai Ram Transport Company', 'Prakash Printing Works', 'Green Leaf Nursery', 'Kaveri Agro Inputs'];

const cbFmtPettyFull = statementTemplate({
  id: 'cb-fmt-petty-full',
  topicId: T,
  conceptId: 'cb-formats',
  difficulty: 'medium',
  generate: (rng) => {
    const firm = rng.pick(PETTY_FIRMS);
    const month = rng.pick(SET_MONTHS);
    const first = rng.pick([1, 8, 15, 22]);
    const last = first + 5;
    // Two heads of the topic, in its order, as the analysis columns; five or six vouchers, every one for a different thing.
    const chosen = rng.shuffle(HEADS).slice(0, PETTY_FULL_HEADS);
    const heads = HEADS.filter((h) => chosen.includes(h));
    const left = heads.map((h) => rng.shuffle(PETTY.filter((p) => p.head === h)));
    const picked: PettyItem[] = left.flatMap((items) => items.splice(0, 2));
    if (rng.next() < 0.6) picked.push(rng.pick(left.filter((items) => items.length > 0)).shift()!);
    const week = Array.from({ length: last - first + 1 }, (_, i) => first + i);
    const days = rng.shuffle([...week, ...week]).slice(0, picked.length).sort((a, b) => a - b);
    const amounts = rng.shuffle(Array.from({ length: 45 }, (_, i) => 8000 + 1000 * i)).slice(0, picked.length);
    const vouchers = rng.shuffle(picked).map((p, i) => ({ ...p, no: i + 1, day: days[i], amt: amounts[i] }));
    const spent = sum(vouchers.map((v) => v.amt));
    // A round imprest that the week's payments leave ₹300 or more of.
    const imprest = Math.ceil((spent + 30000 + 50000 * rng.int(0, 2)) / 50000) * 50000;
    const inHand = imprest - spent;
    const madeUp = rng.pick([true, false]);
    const before = amount(rng, 100, imprest / 200, 10);
    const day1 = `${first} ${month}`;
    const end = `${last} ${month}`;
    const next = `${last + 1} ${month}`;
    const under = (h: string) => vouchers.filter((v) => v.head === h);
    const headTotals = heads.map((h) => sum(under(h).map((v) => v.amt)));
    const opening = madeUp
      ? `The imprest is ${f(imprest)}. On ${day1} the petty cashier had ${f(before)} in hand from the week before, and the head cashier made the petty cash up to the imprest.`
      : `On ${day1} the head cashier started the system by giving the petty cashier the imprest of ${f(imprest)}.`;
    const received = madeUp
      ? [{ date: day1, label: BALANCE_BD, amounts: [before, 0, 0, 0] }, { date: day1, label: PETTY_RECEIVED, amounts: [imprest - before, 0, 0, 0] }]
      : [{ date: day1, label: PETTY_RECEIVED, amounts: [imprest, 0, 0, 0] }];
    const added = (xs: Paise[]) => (xs.length === 1 ? f(xs[0]) : `${xs.map(f).join(' + ')} = ${f(sum(xs))}`);
    return {
      task: `Prepare the analytical petty cash book of ${firm} for the week ended ${end}: the receipts, each payment in the Total payment column and under its head, the balance carried down and the totals; then, below the totals, the balance brought down on ${next} and the cash the head cashier gives that day to restore the imprest.`,
      data:
        `${firm} keeps an analytical petty cash book on the imprest system: at the start of every week the head cashier gives the petty cashier what was spent in the week before. ` +
        `The book has a Receipts column, a Total payment column and two analysis columns: ${heads[0]} and ${heads[1]}. ${opening} ` +
        `These are the petty cashier's payments of the week from ${day1} to ${end}, each with the number of its voucher:\n` +
        vouchers.map((v) => `${v.day} ${month} (voucher ${v.no}): ${cap(v.what)}, ${f(v.amt)}.`).join('\n'),
      title: `Analytical Petty Cash Book of ${firm} for the week ended ${end}`,
      columns: [PETTY_RECEIPTS, PETTY_TOTAL, ...heads.map((h) => `${h} (₹)`)],
      rows: [
        ...received,
        ...vouchers.map((v) => ({ date: `${v.day} ${month}`, ref: `V${v.no}`, label: cap(v.what), amounts: [0, v.amt, ...heads.map((h) => (h === v.head ? v.amt : 0))] })),
        { date: end, label: BALANCE_CD, amounts: [0, inHand, 0, 0] },
        { subtotal: PETTY_FULL_TOTAL, amounts: [imprest, imprest, ...headTotals], sum: 'all' },
        { date: next, label: BALANCE_BD, amounts: [inHand, 0, 0, 0] },
        { date: next, label: PETTY_RECEIVED, amounts: [spent, 0, 0, 0] },
      ],
      distractors: ['Imprest', 'Bank A/c', 'Drawings', ...HEADS.filter((h) => !heads.includes(h))],
      explanation: [
        madeUp
          ? `Receipts: the balance of ${f(before)} brought down and ${f(imprest)} - ${f(before)} = ${f(imprest - before)} received from the head cashier: ${f(imprest)}, the imprest.`
          : `Receipts: the imprest of ${f(imprest)} received from the head cashier; nothing was in hand before, so there is no balance brought down.`,
        'Every payment has a line of its own, with its amount in the Total payment column and again in the column of its head.',
        ...heads.map((h) => `${h} column (${MEANS[h]}): ${added(under(h).map((v) => v.amt))}.`),
        `Total of the payments = ${added(vouchers.map((v) => v.amt))}, the same as the two analysis columns together (${added(headTotals)}).`,
        `Balance c/d on ${end} = ${f(imprest)} - ${f(spent)} = ${f(inHand)}, written in the Total payment column so that it too totals ${f(imprest)}, as the Receipts column does.`,
        `Below the totals, on ${next}: "Balance b/d" ${f(inHand)} in the Receipts column, and the cash received from the head cashier, exactly what was spent, ${f(spent)}. Together they make ${f(imprest)}, the imprest again.`,
      ],
      hints: [
        'Receipts first: what did the petty cashier hold at the start of the week? Then each voucher in the Total payment column and under its head.',
        'Balance c/d = receipts - total payments, entered in the Total payment column so that both columns total the same. After the totals the balance comes down, and the head cashier gives exactly the amount spent.',
      ],
    };
  },
  // Read back from the data: each voucher under the head its item belongs to, the receipts the imprest, the balance
  // what is left of it, the totals the columns added up, and below them the balance and the amount spent again.
  verify: (q: StatementQuestion) => {
    const [intro, ...lines] = q.data.split('\n');
    const heads = q.columns.slice(2).map((c) => c.replace(/ \(₹\)$/, ''));
    if (q.columns.length !== 2 + PETTY_FULL_HEADS || q.columns[0] !== PETTY_RECEIPTS || q.columns[1] !== PETTY_TOTAL) return false;
    if (heads.some((h) => !HEADS.includes(h) || !intro.includes(h))) return false;
    const told = rupeesIn(intro);
    const imprest = told[0];
    const before = told.length === 2 ? told[1] : 0;
    const heads2 = [0, 0];
    let spent = 0;
    for (const line of lines) {
      const m = /^\d+ \w+ \(voucher \d+\): (.+), ₹([\d,]+)\.$/.exec(line);
      const item = m && PETTY.find((p) => cap(p.what) === m[1]);
      const at = item ? heads.indexOf(item.head) : -1;
      if (!m || at < 0) return false;
      const paid = Number(m[2].replace(/,/g, '')) * 100;
      const row = q.rows.find((r) => r.label === m[1]);
      if (!row || row.amounts.some((a, c) => a !== (c === 1 || c === at + 2 ? paid : 0))) return false;
      heads2[at] += paid;
      spent += paid;
    }
    const total = (q.lines ?? []).find((l) => 'subtotal' in l);
    if (!total || !('amounts' in total)) return false;
    const above = q.rows.slice(0, total.at);
    const below = q.rows.slice(total.at);
    const inReceipts = (rows: typeof q.rows, label: string) => rows.filter((r) => r.label === label).map((r) => r.amounts[0]);
    return (
      lines.length >= 4 &&
      sum(above.map((r) => r.amounts[0])) === imprest &&
      (before === 0 ? inReceipts(above, BALANCE_BD).length === 0 : inReceipts(above, BALANCE_BD)[0] === before) &&
      above.find((r) => r.label === BALANCE_CD)?.amounts[1] === imprest - spent &&
      total.amounts.join() === [imprest, imprest, ...heads2].join() &&
      below.length === 2 &&
      inReceipts(below, BALANCE_BD)[0] === imprest - spent &&
      inReceipts(below, PETTY_RECEIVED)[0] === spent
    );
  },
});

const ADDED_LATER: Template[] = [cbNatureTotals, cbNatureMonth, cbNatureComplex, cbEndorseEntry, cbEndorseWhere, cbGstAmount, cbGstEntry, cbFmtPettyFull];

const templates: Template[] = [
  // Single column, and which side or column
  revised(cbScClosing, 2, H_CLOSING),
  revised(cbScTotal, 2, H_SIDE_TOTAL),
  revised(cbScMissing, 2, H_WORK_BACK),
  revised(cbNotRecorded, 2, H_NOT_RECORDED),
  revised(cbSide, 2, H_SIDE),
  revised(cbColumn, 2, H_COLUMN),
  revised(cbChequeTiming, 2, H_CHEQUE),
  revised(cbDishonour, 2, H_DISHONOUR),
  // Double column
  revised(cbDcClosingCash, 2, H_CLOSING),
  revised(cbDcClosingBank, 2, H_CLOSING),
  revised(cbDcIgnoreCredit, 2, H_IGNORE_CREDIT),
  revised(cbDcCombined, 2, H_COMBINED),
  // Contra
  // 2: no two options of "which is NOT a contra entry" are the same transaction; and hints of its own.
  revised(cbContraIdentify, 2, H_CONTRA),
  revised(cbContraEffect, 2, H_CONTRA),
  revised(cbContraSides, 2, H_CONTRA),
  revised(cbContraEntry, 2, H_CONTRA),
  // 2: a deposit and a withdrawal take turns, never two alike on days next to each other; and hints of its own.
  revised(cbContraBalance, 2, H_CONTRA_FIGURES),
  revised(cbContraTotal, 2, H_CONTRA_COUNT),
  revised(cbContraCount, 2, H_CONTRA_COUNT),
  // Discount
  revised(cbDiscWhere, 2, H_DISC_WHERE),
  revised(cbDiscAccount, 2, H_DISC_WHERE),
  revised(cbDiscCashReceived, 2, H_DISC_FIGURES),
  revised(cbDiscAmount, 2, H_DISC_FIGURES),
  revised(cbDiscRate, 2, H_DISC_FIGURES),
  revised(cbDiscJournal, 2, H_DISC_JOURNAL),
  revised(cbDiscClosing, 2, H_DISC_CLOSING),
  // Petty cash
  revised(cbPcReimburse, 2, H_IMPREST),
  revised(cbPcBalance, 2, H_IMPREST),
  revised(cbPcImprestMcq, 2, H_IMPREST),
  revised(cbPcHead, 2, H_PETTY_HEAD),
  revised(cbPcImprestAmount, 2, H_IMPREST),
  revised(cbPcAnalysis, 2, H_PETTY_ANALYSIS),
  revised(cbPcRaise, 2, H_PETTY_MORE),
  revised(cbPcAdvance, 2, H_PETTY_MORE),
  // Balancing
  revised(cbBalFromTotals, 2, H_FROM_TOTALS),
  revised(cbBalSide, 2, H_BALANCE_SIDE),
  revised(cbScOpening, 2, H_WORK_BACK),
  revised(cbBalOpeningDc, 2, H_WORK_BACK),
  revised(cbDcOverdraft, 2, H_OVERDRAFT),
  // 2: an overdrawn account is charged interest on the overdraft; interest credited is on a fixed deposit; and hints.
  revised(cbDcBankComplex, 2, H_OVERDRAFT_ITEMS),
  // 2: as cb-dc-bank-complex, no interest credited on the overdraft itself; and hints of its own.
  revised(cbDcTotals, 2, H_SIDE_TOTALS_BANK),
  // Sets of entries
  revised(cbSetContraWeek, 2, H_SET_CONTRA),
  revised(cbSetDiscountPetty, 2, H_SET_DISCOUNT_PETTY),
  // Cash books to prepare
  ...formats,
];

// Assertion and Reason comes last, and is on its own level and on no mock paper (see assertionReason.ts).
const assertionReason = assertionReasonTemplate({
  prefix: 'cb', topicId: 'cash-book', conceptId: 'cb-double',
  items: [
    {
      answer: 'explains',
      a: 'Cash of ₹5,000 paid into the bank is entered on both sides of a double column cash book.',
      r: 'Both the cash account and the bank account are affected, and both are in the cash book.',
      aWhy: 'The bank column is debited and the cash column is credited.',
      rWhy: 'The cash book holds the cash account and the bank account together.',
      link: 'Each side of the entry falls inside the cash book, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'A contra entry is not posted to the ledger.',
      r: 'Its debit and its credit are both in the cash book.',
      aWhy: 'It is marked "C" in the L.F. column in place of a posting.',
      rWhy: 'A contra entry moves money between the two columns of the cash book.',
      link: 'Both sides are already recorded in the cash book, so nothing is left to post. R explains A.',
    },
    {
      answer: 'explains',
      a: 'Drawing ₹12,000 from the bank for office use leaves the total of cash and bank unchanged.',
      r: 'The bank balance falls and the cash balance rises by the same amount.',
      aWhy: 'Money has moved from one column to the other, and no money has come in or gone out.',
      rWhy: 'The bank column is credited and the cash column is debited with ₹12,000.',
      link: 'The two changes cancel, which is why the total stays as it was, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'With an imprest of ₹5,000, of which ₹3,800 has been spent, the head cashier gives the petty cashier ₹3,800.',
      r: 'The head cashier reimburses exactly what was spent, which restores the imprest.',
      aWhy: 'The petty cashier holds ₹1,200, and ₹3,800 brings it back to ₹5,000.',
      rWhy: 'That is how the imprest system works.',
      link: 'The amount paid is the amount spent, by the rule of the system, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'A customer who owes ₹5,000 pays ₹4,900 in cash in full settlement, and only ₹4,900 is entered in the cash book.',
      r: 'The cash book shows the money that actually moves, and the discount is recorded by a journal entry.',
      aWhy: 'Only ₹4,900 has been received.',
      rWhy: 'A discount is money that never moves, so it does not belong in the cash book.',
      link: 'The ₹100 of discount is left out because no money moved, so R explains A.',
    },
    {
      answer: 'not-the-reason',
      a: 'Goods sold for cash are entered in the cash book.',
      r: 'Goods sold on credit are entered in the Sales Book.',
      aWhy: 'Cash has been received, so it is entered on the debit side.',
      rWhy: 'A credit sale moves no money on the day of the sale.',
      link: 'R tells where a credit sale goes. A cash sale goes in the cash book because money has moved.',
    },
    {
      answer: 'not-the-reason',
      a: 'An opening bank overdraft of ₹8,000 is entered on the credit side of the bank column.',
      r: 'The cash column of a cash book cannot show a credit balance.',
      aWhy: 'An overdraft is a credit balance of the bank account.',
      rWhy: 'A firm cannot pay out more notes and coins than it has.',
      link: 'R is about the cash column. The overdraft is a credit because the firm owes the bank.',
    },
    {
      answer: 'not-the-reason',
      a: 'In an analytical petty cash book, each payment is entered in the total column and in one analysis column.',
      r: 'Petty expenses are small and frequent.',
      aWhy: 'The analysis columns must add up to the total payment column.',
      rWhy: 'Postage, fares and tea are typical petty expenses.',
      link: 'R is why a petty cash book is kept at all. The two entries are made so that each head of expense can be totalled and posted.',
    },
    {
      answer: 'a-only',
      a: 'A cheque received and banked on the same day is entered on the debit side of the bank column.',
      r: 'Every cheque received is entered in the cash column.',
      aWhy: 'Money has come into the bank, so the bank column is debited.',
      rWhy: 'Only a cheque held for some days before it is banked goes in the cash column first.',
    },
    {
      answer: 'a-only',
      a: 'Depreciation of ₹2,000 on furniture is not entered in the cash book.',
      r: 'The cash book records every expense of the business.',
      aWhy: 'Charging depreciation moves no money.',
      rWhy: 'The cash book records only money received or paid, so an expense with no payment is not in it.',
    },
    {
      answer: 'r-only',
      a: 'A discount of ₹100 received from a supplier is entered in a discount column of the double column cash book.',
      r: 'The double column cash book has a cash column and a bank column only.',
      aWhy: 'There is no discount column; the discount is recorded by a journal entry.',
      rWhy: 'Those are its two columns.',
    },
    {
      answer: 'r-only',
      a: 'Cash of ₹5,000 withdrawn from the bank by the owner for personal use is a contra entry.',
      r: 'A contra entry is one in which both the cash and the bank accounts are affected.',
      aWhy: 'It is drawings: only the bank column is affected, and Drawings A/c is debited.',
      rWhy: 'That is what a contra entry is.',
    },
  ],
});

// The templates added after the papers were set come after it, so that every template before them keeps its place.
const withAssertionReason: Template[] = [...templates, assertionReason, ...ADDED_LATER];

export default withAssertionReason;
