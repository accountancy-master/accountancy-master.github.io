import { formatINR, type Paise } from '@/engine/money';

// ---------------------------------------------------------------------------------------------------------------
// The bank reconciliation lab: two records of one bank account for a month, the firm's Cash Book (bank column) and
// the bank's Pass Book, written up entry by entry from what happened, and the statement that brings one balance to
// the other. Every figure the screen shows is worked here.
//
// A balance is a signed amount: positive is favourable (money in the bank), negative an overdraft. Every item that
// differs has a `sign`, fixed by one sentence: "pass book balance = cash book balance + sign x amount". From the cash
// book an item moves the balance by sign x amount; from the pass book by -sign x amount. Moving a favourable balance
// up is "Add", an overdraft down (towards favourable) is "Less", and the reverse.
// ---------------------------------------------------------------------------------------------------------------

const inr = formatINR;

export type Book = 'cb' | 'pb';
export const BOOK_NAME: Record<Book, string> = { cb: 'Cash Book', pb: 'Pass Book' };
export const otherBook = (b: Book): Book => (b === 'cb' ? 'pb' : 'cb');

export type KindId = 'issued' | 'deposited' | 'charges' | 'interest' | 'direct' | 'dishonoured' | 'standing' | 'cbError' | 'bankError';
export const KINDS: readonly KindId[] = ['issued', 'deposited', 'charges', 'interest', 'direct', 'dishonoured', 'standing', 'cbError', 'bankError'];

/** Why the two books differ because of an item: the time it takes, the bank recording first, or an error in one book. */
export type Cause = 'timing' | 'bankFirst' | 'cbError' | 'bankError';

export const CAUSE_TEXT: Record<Cause, string> = {
  timing: 'Timing: neither book is wrong',
  bankFirst: 'The bank recorded it first',
  cbError: 'An error in the cash book',
  bankError: 'An error of the bank',
};

export interface Item {
  id: string;
  kind: KindId;
  /** The day of the month it happened. */
  day: number;
  /** The amount by which it makes the books differ. */
  amount: Paise;
  /** The customer, supplier or payee. */
  party: string;
  /** A dishonoured cheque: the day it was first deposited. */
  depositedOn?: number;
  /** A cheque issued and entered in the cash book wrongly: the figure the bank paid (the cash book shows `paid` + or - `amount`). */
  paid?: Paise;
  /** The cash book shows more than was paid (true) or less (false). */
  over?: boolean;
}

/** An entry both books have (a cheque paid or collected within the month): it makes no difference. */
export interface Common {
  day: number;
  /** "Kumar & Co." */
  party: string;
  amount: Paise;
  /** Money into the bank (a deposit) or out of it (a cheque paid). */
  into: boolean;
}

export interface Scenario {
  firm: string;
  /** The month the books are compared at the end of, and its year and last day. */
  month: string;
  year: number;
  lastDay: number;
  /** The balance on the first of the month, agreed in both books (signed). */
  opening: Paise;
  common: Common[];
  items: Item[];
}

export const closingDate = (s: Scenario): string => `${s.lastDay} ${s.month} ${s.year}`;
const on = (s: Scenario, day: number): string => `${day} ${s.month}`;

// ---------------------------------------------------------------------------------------------------------------
// The items: which book has each one, and why.
// ---------------------------------------------------------------------------------------------------------------

export interface Facts {
  /** pass book balance = cash book balance + sign x amount. */
  sign: 1 | -1;
  inCb: boolean;
  inPb: boolean;
  cause: Cause;
  /** The firm passes an entry for it in its cash book (and so it goes into the amended cash book). */
  enter: boolean;
  /** What the card says: "Cheque issued to Patel Traders". */
  title: string;
  /** The line of the reconciliation statement. */
  line: string;
  /** Why it is in one book and not the other (or in both with different figures), and so which way it moves. */
  why: string;
}

/** The account is run as an overdraft (from the first of the month): interest is charged on it, not credited. */
export const onOverdraft = (s: Scenario): boolean => s.opening < 0;

/** What the cash book shows for a cheque it entered wrongly. */
export const recordedOf = (i: Item): Paise => (i.paid ?? 0) + (i.over ? i.amount : -i.amount);

export function factsOf(i: Item, s: Scenario): Facts {
  const a = inr(i.amount);
  switch (i.kind) {
    case 'issued':
      return {
        sign: 1, inCb: true, inPb: false, cause: 'timing', enter: false,
        title: `Cheque issued to ${i.party}`,
        line: `Cheque issued to ${i.party}, not yet presented`,
        why: `The firm entered the cheque in its cash book on ${on(s, i.day)}, when it was issued. ${i.party} has not yet presented it, so the bank has not paid it: the pass book balance is ${a} higher.`,
      };
    case 'deposited':
      return {
        sign: -1, inCb: true, inPb: false, cause: 'timing', enter: false,
        title: `Cheque from ${i.party} deposited`,
        line: `Cheque from ${i.party} deposited, not yet credited`,
        why: `The firm entered the cheque in its cash book on ${on(s, i.day)}, when it was paid in. The bank credits it only once it is collected, which has not happened yet: the pass book balance is ${a} lower.`,
      };
    case 'charges':
      return {
        sign: -1, inCb: false, inPb: true, cause: 'bankFirst', enter: true,
        title: 'Bank charges',
        line: 'Bank charges debited by the bank',
        why: `The bank took ${a} of charges out of the account on ${on(s, i.day)}. The firm learns of them only from the pass book: the pass book balance is ${a} lower.`,
      };
    case 'interest':
      // On an overdrawn account the bank charges interest instead of paying it.
      if (onOverdraft(s))
        return {
          sign: -1, inCb: false, inPb: true, cause: 'bankFirst', enter: true,
          title: 'Interest on overdraft charged by the bank',
          line: 'Interest on overdraft debited by the bank',
          why: `The bank charged ${a} of interest on the overdraft on ${on(s, i.day)}. The firm has not yet entered it: the pass book balance is ${a} less favourable.`,
        };
      return {
        sign: 1, inCb: false, inPb: true, cause: 'bankFirst', enter: true,
        title: 'Interest credited by the bank',
        line: 'Interest credited by the bank',
        why: `The bank added ${a} of interest to the account on ${on(s, i.day)}. The firm has not yet entered it: the pass book balance is ${a} higher.`,
      };
    case 'direct':
      return {
        sign: 1, inCb: false, inPb: true, cause: 'bankFirst', enter: true,
        title: `Direct deposit by ${i.party}`,
        line: `Amount deposited directly by ${i.party}`,
        why: `${i.party}, a customer, paid ${a} straight into the firm's account on ${on(s, i.day)}. The bank has it; the firm has not yet entered the receipt: the pass book balance is ${a} higher.`,
      };
    case 'dishonoured':
      return {
        sign: -1, inCb: false, inPb: true, cause: 'bankFirst', enter: true,
        title: `Cheque from ${i.party} dishonoured`,
        line: `Cheque from ${i.party} deposited and dishonoured`,
        why: `The cheque was deposited on ${on(s, i.depositedOn ?? 1)} and both books show it as received. On ${on(s, i.day)} it came back unpaid and the bank took ${a} back out; the cash book still counts it as received: the pass book balance is ${a} lower.`,
      };
    case 'standing':
      return {
        sign: -1, inCb: false, inPb: true, cause: 'bankFirst', enter: true,
        title: 'Insurance premium paid by the bank',
        line: 'Insurance premium paid by the bank on standing instruction',
        why: `On the firm's standing instruction the bank paid ${a} of insurance premium on ${on(s, i.day)}. The firm has not yet entered the payment: the pass book balance is ${a} lower.`,
      };
    case 'cbError': {
      const shown = recordedOf(i);
      return {
        sign: i.over ? 1 : -1, inCb: true, inPb: true, cause: 'cbError', enter: true,
        title: `Cheque to ${i.party}: ${inr(shown)} in the cash book, ${inr(i.paid ?? 0)} paid`,
        line: `Cheque issued to ${i.party} for ${inr(i.paid ?? 0)}, entered as ${inr(shown)}`,
        why: `The bank paid the cheque at its real figure, ${inr(i.paid ?? 0)}; the cash book entered it as ${inr(shown)}. The cash book is wrong: it shows ${a} too ${i.over ? 'much paid out, so its balance is too low' : 'little paid out, so its balance is too high'}, and the pass book balance is ${a} ${i.over ? 'higher' : 'lower'}.`,
      };
    }
    case 'bankError':
      return {
        sign: -1, inCb: false, inPb: true, cause: 'bankError', enter: false,
        title: 'Wrong debit by the bank',
        line: 'Cheque of another customer wrongly debited by the bank',
        why: `On ${on(s, i.day)} the bank debited the firm's account with ${a} for a cheque that another customer drew. The bank is wrong: the pass book balance is ${a} too low. The firm makes no entry; the bank will put it right.`,
      };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The two books.
// ---------------------------------------------------------------------------------------------------------------

export interface BookRow {
  day: number;
  /** "To Kumar & Co.", "By Patel Traders" in the cash book; "By cheque: Kumar & Co." in the pass book. */
  particulars: string;
  amount: Paise;
  /** The item (by id) this row belongs to, if it is one that differs. */
  item?: string;
}

export interface CashBook {
  /** Receipts (debit side) and payments (credit side) of the bank column, the balance b/d first and c/d last. */
  dr: BookRow[];
  cr: BookRow[];
  /** The closing balance, signed: favourable is a debit balance, an overdraft a credit balance. */
  balance: Paise;
}

export interface PassBookRow {
  day: number;
  particulars: string;
  withdrawal: Paise;
  deposit: Paise;
  /** The balance after the row (signed: negative is an overdraft, shown as Dr). */
  balance: Paise;
  item?: string;
}

export interface PassBook {
  rows: PassBookRow[];
  balance: Paise;
}

const byDay = <T extends { day: number }>(xs: T[]): T[] => xs.map((x, n) => ({ x, n })).sort((a, b) => a.x.day - b.x.day || a.n - b.n).map((e) => e.x);

export function cashBookOf(s: Scenario): CashBook {
  const dr: BookRow[] = [];
  const cr: BookRow[] = [];
  for (const c of s.common) (c.into ? dr : cr).push({ day: c.day, particulars: c.into ? `To ${c.party}` : `By ${c.party}`, amount: c.amount });
  for (const i of s.items) {
    if (i.kind === 'issued') cr.push({ day: i.day, particulars: `By ${i.party}`, amount: i.amount, item: i.id });
    if (i.kind === 'deposited') dr.push({ day: i.day, particulars: `To ${i.party}`, amount: i.amount, item: i.id });
    if (i.kind === 'dishonoured') dr.push({ day: i.depositedOn ?? 1, particulars: `To ${i.party}`, amount: i.amount, item: i.id });
    if (i.kind === 'cbError') cr.push({ day: i.day, particulars: `By ${i.party}`, amount: recordedOf(i), item: i.id });
  }
  const sorted = { dr: byDay(dr), cr: byDay(cr) };
  const balance = s.opening + sorted.dr.reduce((t, r) => t + r.amount, 0) - sorted.cr.reduce((t, r) => t + r.amount, 0);
  if (s.opening >= 0) sorted.dr.unshift({ day: 1, particulars: 'To Balance b/d', amount: s.opening });
  else sorted.cr.unshift({ day: 1, particulars: 'By Balance b/d (overdraft)', amount: -s.opening });
  if (balance >= 0) sorted.cr.push({ day: s.lastDay, particulars: 'By Balance c/d', amount: balance });
  else sorted.dr.push({ day: s.lastDay, particulars: 'To Balance c/d (overdraft)', amount: -balance });
  return { ...sorted, balance };
}

export function passBookOf(s: Scenario): PassBook {
  type Move = { day: number; particulars: string; amount: Paise; into: boolean; item?: string };
  const moves: Move[] = s.common.map((c) => ({ day: c.day, particulars: c.into ? `Cheque deposited: ${c.party}` : `Cheque paid: ${c.party}`, amount: c.amount, into: c.into }));
  for (const i of s.items) {
    if (i.kind === 'charges') moves.push({ day: i.day, particulars: 'Bank charges', amount: i.amount, into: false, item: i.id });
    if (i.kind === 'interest') moves.push({ day: i.day, particulars: onOverdraft(s) ? 'Interest on overdraft' : 'Interest', amount: i.amount, into: !onOverdraft(s), item: i.id });
    if (i.kind === 'direct') moves.push({ day: i.day, particulars: `Direct deposit: ${i.party}`, amount: i.amount, into: true, item: i.id });
    if (i.kind === 'standing') moves.push({ day: i.day, particulars: 'Insurance premium (standing instruction)', amount: i.amount, into: false, item: i.id });
    if (i.kind === 'bankError') moves.push({ day: i.day, particulars: 'Cheque paid: No. 418226', amount: i.amount, into: false, item: i.id });
    if (i.kind === 'cbError') moves.push({ day: i.day, particulars: `Cheque paid: ${i.party}`, amount: i.paid ?? 0, into: false, item: i.id });
    if (i.kind === 'dishonoured') {
      moves.push({ day: i.depositedOn ?? 1, particulars: `Cheque deposited: ${i.party}`, amount: i.amount, into: true, item: i.id });
      moves.push({ day: i.day, particulars: `Cheque returned unpaid: ${i.party}`, amount: i.amount, into: false, item: i.id });
    }
  }
  let balance = s.opening;
  const rows: PassBookRow[] = [{ day: 1, particulars: 'Opening balance', withdrawal: 0, deposit: 0, balance }];
  for (const m of byDay(moves)) {
    balance += m.into ? m.amount : -m.amount;
    rows.push({ day: m.day, particulars: m.particulars, withdrawal: m.into ? 0 : m.amount, deposit: m.into ? m.amount : 0, balance, ...(m.item ? { item: m.item } : {}) });
  }
  return { rows, balance };
}

// ---------------------------------------------------------------------------------------------------------------
// The statement.
// ---------------------------------------------------------------------------------------------------------------

/** Which way an item moves the balance when the statement starts from `from`: +1 towards favourable, -1 away. */
export const directionOf = (from: Book, i: Item, s: Scenario): 1 | -1 => {
  const sign = factsOf(i, s).sign;
  return (from === 'cb' ? sign : -sign) as 1 | -1;
};

/** Add or Less for an item, from a starting balance (signed) in book `from`: an overdraft turns the rule round. */
export const treatmentOf = (from: Book, start: Paise, i: Item, s: Scenario): 'add' | 'less' => ((directionOf(from, i, s) > 0) === (start >= 0) ? 'add' : 'less');

/** "Balance as per Cash Book", "Overdraft as per Pass Book", "Balance as per Amended Cash Book". */
export const balanceLabel = (book: Book, signed: Paise, amended = false): string =>
  `${signed >= 0 ? 'Balance' : 'Overdraft'} as per ${amended && book === 'cb' ? 'Amended ' : ''}${BOOK_NAME[book]}`;

export interface StatementLine {
  item: Item;
  facts: Facts;
  treatment: 'add' | 'less';
  /** In the Plus column (it makes the balance aimed at more favourable) or the Minus column. */
  plus: boolean;
}

export interface Statement {
  from: Book;
  to: Book;
  /** The balance the statement starts from and the one it ends on, signed. */
  start: Paise;
  end: Paise;
  startLabel: string;
  endLabel: string;
  adds: StatementLine[];
  lesses: StatementLine[];
  /** The starting balance (as a figure) plus the additions. */
  afterAdds: Paise;
  plusTotal: Paise;
  minusTotal: Paise;
  /** Amended: the statement starts from the amended cash book (or ends on it) and lists only what is left. */
  amended: boolean;
}

const sum = (xs: readonly StatementLine[]): Paise => xs.reduce((t, l) => t + l.item.amount, 0);

/** Moves a signed balance by the items, from book `from`. */
export const reconcile = (from: Book, start: Paise, items: readonly Item[], s: Scenario): Paise => items.reduce((b, i) => b + directionOf(from, i, s) * i.amount, start);

/**
 * The statement from book `from`. With `amended`, the cash book is first amended (the items it must enter are
 * entered), and the statement lists only the items left: the timing differences and the bank's errors.
 */
export function statementOf(s: Scenario, from: Book, amended = false): Statement {
  const cb = amended ? amendedCashBookOf(s).balance : cashBookOf(s).balance;
  const pb = passBookOf(s).balance;
  const start = from === 'cb' ? cb : pb;
  const items = amended ? s.items.filter((i) => !factsOf(i, s).enter) : s.items;
  const lines = byDay(items).map((item) => {
    const treatment = treatmentOf(from, start, item, s);
    return { item, facts: factsOf(item, s), treatment, plus: directionOf(from, item, s) > 0 };
  });
  const adds = lines.filter((l) => l.treatment === 'add');
  const lesses = lines.filter((l) => l.treatment === 'less');
  const end = reconcile(from, start, items, s);
  const plus = lines.filter((l) => l.plus);
  const minus = lines.filter((l) => !l.plus);
  return {
    from,
    to: otherBook(from),
    start,
    end,
    startLabel: balanceLabel(from, start, amended),
    endLabel: balanceLabel(otherBook(from), end, amended),
    adds,
    lesses,
    afterAdds: Math.abs(start) + sum(adds),
    plusTotal: (start >= 0 ? start : 0) + sum(plus),
    minusTotal: (start < 0 ? -start : 0) + sum(minus),
    amended,
  };
}

/** The amended cash book: the unadjusted balance, then the entries the firm passes for what the bank recorded first and for its own errors. */
export function amendedCashBookOf(s: Scenario): CashBook {
  const before = cashBookOf(s).balance;
  const dr: BookRow[] = [];
  const cr: BookRow[] = [];
  if (before >= 0) dr.push({ day: s.lastDay, particulars: 'To Balance b/d (as per the cash book)', amount: before });
  else cr.push({ day: s.lastDay, particulars: 'By Balance b/d (overdraft, as per the cash book)', amount: -before });
  for (const i of byDay([...s.items])) {
    const row = (particulars: string): BookRow => ({ day: s.lastDay, particulars, amount: i.amount, item: i.id });
    if (i.kind === 'charges') cr.push(row('By Bank Charges A/c'));
    if (i.kind === 'interest') {
      if (onOverdraft(s)) cr.push(row('By Interest on Overdraft A/c'));
      else dr.push(row('To Interest A/c'));
    }
    if (i.kind === 'direct') dr.push(row(`To ${i.party}`));
    if (i.kind === 'dishonoured') cr.push(row(`By ${i.party} (cheque dishonoured)`));
    if (i.kind === 'standing') cr.push(row('By Insurance Premium A/c'));
    if (i.kind === 'cbError') (i.over ? dr : cr).push(row(`${i.over ? 'To' : 'By'} ${i.party} (cheque entered as ${inr(recordedOf(i))}, paid ${inr(i.paid ?? 0)})`));
  }
  const balance = before + s.items.filter((i) => factsOf(i, s).enter).reduce((t, i) => t + factsOf(i, s).sign * i.amount, 0);
  if (balance >= 0) cr.push({ day: s.lastDay, particulars: 'By Balance c/d (amended)', amount: balance });
  else dr.push({ day: s.lastDay, particulars: 'To Balance c/d (overdraft, amended)', amount: -balance });
  return { dr, cr, balance };
}

/** "₹43,500 (favourable)" or "₹8,900 (overdraft)". */
export const balanceWords = (signed: Paise): string => `${inr(Math.abs(signed))} ${signed >= 0 ? '(favourable)' : '(overdraft)'}`;

/** The rule an item follows from a book, in words: why Add or Less. */
export function ruleOf(from: Book, start: Paise, i: Item, s: Scenario): string {
  const to = BOOK_NAME[otherBook(from)];
  const better = directionOf(from, i, s) > 0;
  const t = treatmentOf(from, start, i, s);
  const base = `Because of it the ${to} balance is ${better ? 'more' : 'less'} favourable than the ${BOOK_NAME[from]} balance.`;
  return start >= 0
    ? `${base} From a favourable balance: ${t === 'add' ? 'Add' : 'Less'}.`
    : `${base} From an overdraft the rule turns round: ${better ? 'a more favourable balance is a smaller overdraft' : 'a less favourable balance is a bigger overdraft'}, so ${t === 'add' ? 'Add' : 'Less'}.`;
}

/** The statement with only some of its items carried in yet: its lines so far, its totals so far and where it stands. */
export interface SoFar extends Statement {
  /** Every item is in: `end` is the other book's balance. */
  complete: boolean;
}

export function statementSoFar(s: Scenario, from: Book, amended: boolean, carried: readonly string[]): SoFar {
  const full = statementOf(s, from, amended);
  const inIt = (l: StatementLine) => carried.includes(l.item.id);
  const adds = full.adds.filter(inIt);
  const lesses = full.lesses.filter(inIt);
  const lines = [...adds, ...lesses];
  const end = reconcile(from, full.start, lines.map((l) => l.item), s);
  const complete = lines.length === full.adds.length + full.lesses.length;
  return {
    ...full,
    adds,
    lesses,
    end,
    endLabel: complete ? full.endLabel : `So far (${end >= 0 ? 'favourable' : 'overdraft'})`,
    afterAdds: Math.abs(full.start) + sum(adds),
    plusTotal: (full.start >= 0 ? full.start : 0) + sum(lines.filter((l) => l.plus)),
    minusTotal: (full.start < 0 ? -full.start : 0) + sum(lines.filter((l) => !l.plus)),
    complete,
  };
}
