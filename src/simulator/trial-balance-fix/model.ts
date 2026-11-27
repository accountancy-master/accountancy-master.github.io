// ---------------------------------------------------------------------------------------------------------------
// The lab "trial-balance-fix": one business's month, walked from its books to a trial balance that will not agree,
// and back. The month's transactions are written in the books as a clerk wrote them, with errors in the recording,
// the posting, the casting and the drawing up of the trial balance. The ledger is posted from those books as rough
// work and balanced; the trial balance does not agree; the difference goes to Suspense A/c; the errors are found and
// rectified; the rectifying entries are posted, Suspense A/c closes and the corrected trial balance agrees.
//
// The true books (the transactions as they should have been recorded) and the books as recorded are both built from
// the case, so every figure the screen shows follows from them: the recorded ledger, the trial balance, the
// difference, and for each error what it left wrong (`delta`, the recorded balance less the true one, account by
// account), its effect on the trial balance, its rectifying entry and its effect on the profit. The tests check the
// two routes against each other: the books corrected by the rectifying entries are the true books.
//
// Conventions (NCERT Class 11, CBSE 2025-26, as the app's topics Ledger, Trial Balance and Rectification of Errors
// teach them):
//  - the ledger: a debit is written on the debit side with "To" and the other account, a credit on the credit side
//    with "By"; each account is balanced on 30 April, "Balance c/d" on the shorter side, both sides totalled, and the
//    balance brought down on 1 May as "Balance b/d". A credit sale or purchase in the Sales (Purchases) Book is posted
//    to the party on its day and the book's total to Sales (Purchases) A/c on 30 April, "By (To) Sundries as per
//    Sales (Purchases) Book";
//  - the trial balance by the balance method only: each account with a balance once, in the column of its balance;
//  - before a Suspense A/c is opened, the trial balance is checked against the ledger (re-added, each balance copied
//    rightly and into its right column): a balance left out or written in the wrong column is an error in drawing up
//    the trial balance, not in the books, and is put right in the trial balance itself, with no journal entry;
//  - what is still different goes to Suspense A/c on the shorter side, as "Difference in Trial Balance";
//  - an error that leaves one account wrong (one-sided) is rectified, once Suspense A/c exists, by an entry whose
//    other side is Suspense A/c; found before the trial balance it is corrected in the account itself, with no
//    journal entry; an error that leaves the totals equal (two-sided: a complete omission, an error of principle, a
//    wrong account, compensating errors) is rectified by an entry between the accounts concerned, never through
//    Suspense A/c;
//  - the profit is corrected for the errors listed only: an expense too low or an income too high overstates it.
// ---------------------------------------------------------------------------------------------------------------

import { normalSide, resolveAccount, type Side } from '@/engine/accounts';
import { BALANCE_BD, BALANCE_CD, ledgerLabel } from '@/engine/books';
import type { JournalLine } from '@/engine/journal';
import { formatINR, type Paise } from '@/engine/money';

export const YEAR = 2026;
/** The day the accounts are balanced and the trial balance is drawn up. */
export const CLOSE_DAY = 30;
export const TB_DATE = `${CLOSE_DAY} April ${YEAR}`;
export const OPEN_SHORT = 'Apr 1';
export const REOPEN_SHORT = 'May 1';
/** What the row a Suspense A/c opens with is called. */
export const DIFFERENCE = 'Difference in Trial Balance';
/** The journal pages: the month's entries, and the rectifying entries. */
export const JOURNAL_FOLIO = 'J1';
export const RECTIFY_FOLIO = 'J2';

export const rupees = (n: number): Paise => Math.round(n * 100);
export const f = formatINR;
export const dayShort = (day: number): string => `Apr ${day}`;
export const dayLong = (day: number): string => `${day} April`;
export const title = (accountId: string): string => ledgerLabel(accountId);
export const sideWord = (s: Side): string => (s === 'Dr' ? 'debit' : 'credit');
export const otherSide = (s: Side): Side => (s === 'Dr' ? 'Cr' : 'Dr');
const signed = (l: { side: Side; amount: Paise }): number => (l.side === 'Dr' ? l.amount : -l.amount);
const lc = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);
const isPartyId = (id: string): boolean => id.startsWith('debtor:') || id.startsWith('creditor:');
/** An account as a sentence names it: "Mohan's account", "Rao & Co.'s account", "Sales A/c". */
export function owned(accountId: string): string {
  if (!isPartyId(accountId)) return title(accountId);
  const name = resolveAccount(accountId).name;
  return `${name.endsWith('s') ? `${name}'` : `${name}'s`} account`;
}
const isNominal = (id: string): boolean => {
  const t = resolveAccount(id).type;
  return t === 'income' || t === 'expense';
};

// ---------------------------------------------------------------------------------------------------------------
// A case, as written.
// ---------------------------------------------------------------------------------------------------------------

export interface OpeningBalance {
  accountId: string;
  side: Side;
  amount: Paise;
}

export interface Txn {
  /** The day of April. */
  day: number;
  /** What happened, as the list of transactions gives it: "Sold goods on credit to Mohan, ₹8,000." */
  text: string;
  /** The transaction as an error names it, taking "was": "A credit sale of ₹8,000 to Mohan". */
  what: string;
  /** The entry as it should be: two lines, the debit first. */
  lines: [JournalLine, JournalLine];
  /** The narration, after "Being". */
  narration: string;
  /** Entered in the case's Sales Book or Purchases Book instead of the journal (a credit sale or purchase of goods). */
  book?: true;
}

export type BookKind = 'sales' | 'purchases';

/** A casting: a side of an account added up wrongly, by `by` (above nil: overcast; below: undercast). */
export interface Casting {
  accountId: string;
  side: Side;
  by: Paise;
}

/** An error, as what was done in place of what should have been. `txn` and `line` index the case's transactions. */
export type ErrorSpec =
  /** The transaction was not recorded at all. */
  | { kind: 'complete-omission'; txn: number }
  /** Recorded with another account of another kind (a machine debited to Purchases A/c). */
  | { kind: 'principle'; txn: number; line: number; as: string }
  /** One line (or a book's row) not posted to its account. */
  | { kind: 'partial-omission'; txn: number; line: number }
  /** Posted to its account with a wrong amount. */
  | { kind: 'wrong-amount'; txn: number; line: number; as: Paise }
  /** Posted to the wrong side of its account. */
  | { kind: 'wrong-side'; txn: number; line: number }
  /** Posted to another account of the same kind, on the right side. */
  | { kind: 'wrong-account'; txn: number; line: number; as: string }
  /** The subsidiary book's total added up as `as`, and that total posted. */
  | { kind: 'book-casting'; as: Paise }
  /** A side of an account added up wrongly. */
  | ({ kind: 'casting' } & Casting)
  /** An account balanced wrongly: its balance carried down (and brought down) as `as`. */
  | { kind: 'wrong-balance'; accountId: string; as: Paise }
  /** Two castings whose effects on the trial balance cancel. */
  | { kind: 'compensating'; a: Casting; b: Casting }
  /** A balance left out of the trial balance. */
  | { kind: 'tb-omitted'; accountId: string }
  /** A balance written in the wrong column of the trial balance. */
  | { kind: 'tb-wrong-column'; accountId: string };

export type ErrorKind = ErrorSpec['kind'];
/** An error of the case, and whether it is found before the trial balance (a posting found wrong while checking). */
export type CaseErrorData = ErrorSpec & { before?: true };

export interface CaseData {
  id: string;
  /** On the case's button: "Asha Stationers". */
  title: string;
  /** "Level 1: three errors". */
  level: string;
  business: string;
  owner: string;
  /** What it does, after "which": "sells stationery". */
  trade: string;
  /** The balances it began April with (none for a new business). */
  opening: OpeningBalance[];
  txns: Txn[];
  errors: CaseErrorData[];
  /** Closing stock at cost on 30 April, given, for the profit. */
  closingStock: Paise;
  /** Played as a detective case in Play: the student finds the posting errors by ticking. */
  detective?: true;
}

// ---------------------------------------------------------------------------------------------------------------
// The books: the journal and the subsidiary book as recorded, and every posting.
// ---------------------------------------------------------------------------------------------------------------

export const BOOK_NAME: Record<BookKind, string> = { sales: 'Sales Book', purchases: 'Purchases Book' };
export const BOOK_FOLIO: Record<BookKind, string> = { sales: 'SB1', purchases: 'PB1' };
const BOOK_ACCOUNT: Record<BookKind, string> = { sales: 'sales', purchases: 'purchases' };
const BOOK_SIDE: Record<BookKind, Side> = { sales: 'Cr', purchases: 'Dr' };

export function bookKindOf(data: CaseData): BookKind | null {
  const t = data.txns.find((x) => x.book);
  if (!t) return null;
  return t.lines.some((l) => l.accountId === 'sales' && l.side === 'Cr') ? 'sales' : 'purchases';
}

/** The line of a book transaction posted on its day: the party's. */
export const partyLine = (t: Txn): number => (isPartyId(t.lines[0].accountId) ? 0 : 1);

/** One ledger posting: an item of an account, with where it came from and the error it carries, if any. */
export interface Post {
  key: string;
  accountId: string;
  side: Side;
  day: number;
  /** The particulars without "To" or "By". */
  label: string;
  amount: Paise;
  jf: string;
  /** The transaction and line it posts; for a book's total, `line` is -1 and `txn` -1. */
  txn: number;
  line: number;
  /** The letter of the error this posting carries, as first posted. */
  letter?: string;
}

export interface JournalLineView {
  accountId: string;
  side: Side;
  amount: Paise;
  /** The ledger folio, written once the line is posted: blank when it was never posted. */
  lf: string;
  /** The folio once the postings found wrong before the trial balance are corrected. */
  lfChecked: string;
  /** The transaction and line. */
  txn: number;
  line: number;
}

export interface JournalEntryView {
  txn: number;
  day: number;
  lines: JournalLineView[];
  narration: string;
  /** The letter of an error in the entry itself (an error of principle). */
  letter?: string;
}

export interface BookRowView {
  txn: number;
  day: number;
  /** The invoice number. */
  invoice: number;
  partyId: string;
  amount: Paise;
  lf: string;
  lfChecked: string;
}

export interface BookView {
  kind: BookKind;
  name: string;
  rows: BookRowView[];
  /** What the rows add up to. */
  sum: Paise;
  /** The total as written (and posted). */
  total: Paise;
  /** The letter of a casting error in the book. */
  letter?: string;
}

// ---------------------------------------------------------------------------------------------------------------
// Errors, worked out.
// ---------------------------------------------------------------------------------------------------------------

export type ErrorClass = 'omission' | 'commission' | 'principle' | 'compensating' | 'trial-balance';
export type When = 'before' | 'tb' | 'after';

export const KIND_NAME: Record<ErrorKind, string> = {
  'complete-omission': 'Complete omission',
  principle: 'Error of principle',
  'partial-omission': 'Partial omission',
  'wrong-amount': 'Wrong amount posted',
  'wrong-side': 'Posted to the wrong side',
  'wrong-account': 'Posted to the wrong account',
  'book-casting': 'Wrong total of a book',
  casting: 'Wrong casting of an account',
  'wrong-balance': 'Wrong balancing of an account',
  compensating: 'Compensating errors',
  'tb-omitted': 'Balance left out of the trial balance',
  'tb-wrong-column': 'Balance in the wrong column',
};

export const CLASS_NAME: Record<ErrorClass, string> = {
  omission: 'Error of omission',
  commission: 'Error of commission',
  principle: 'Error of principle',
  compensating: 'Compensating errors',
  'trial-balance': 'Error in drawing up the trial balance',
};

const CLASS_OF: Record<ErrorKind, ErrorClass> = {
  'complete-omission': 'omission',
  principle: 'principle',
  'partial-omission': 'omission',
  'wrong-amount': 'commission',
  'wrong-side': 'commission',
  'wrong-account': 'commission',
  'book-casting': 'commission',
  casting: 'commission',
  'wrong-balance': 'commission',
  compensating: 'compensating',
  'tb-omitted': 'trial-balance',
  'tb-wrong-column': 'trial-balance',
};

export interface CaseError {
  letter: string;
  /** "(a)". */
  tag: string;
  spec: ErrorSpec;
  kind: ErrorKind;
  when: When;
  cls: ErrorClass;
  name: string;
  /** The error as the case states it, one sentence. */
  text: string;
  /** For a ledger error: the recorded balance less the true one, account by account (debit positive). */
  delta: [string, number][];
  /** Its effect on the trial balance: the debit total less the credit total. */
  gap: number;
  /** It makes the columns differ. */
  oneSided: boolean;
  /** The rectifying entry once Suspense A/c exists (null for an error in drawing up the trial balance). */
  entry: JournalLine[] | null;
  /** The narration of the entry, after "Being". */
  narration: string;
  /** For a one-sided error: how it is put right in the account itself, found before the trial balance. */
  inAccount: string | null;
  /** For an error in the trial balance itself: how the trial balance is put right. */
  inTrialBalance: string | null;
  /** Profit as per the books less the correct profit: above nil when the profit is overstated. */
  profit: number;
  /** The income and expense accounts it leaves wrong, with what each does to the profit, in words. */
  profitWords: string[];
  /** The accounts it touches (not Suspense A/c). */
  accounts: string[];
}

// ---------------------------------------------------------------------------------------------------------------
// The built case.
// ---------------------------------------------------------------------------------------------------------------

export interface Case {
  data: CaseData;
  bookKind: BookKind | null;
  errors: CaseError[];
  /** Every account in the order of its folio (Suspense A/c last). */
  accounts: string[];
  folio: Map<string, number>;
  journal: JournalEntryView[];
  /** The entries left out of the journal altogether (shown as missing once found). */
  missing: JournalEntryView[];
  book: BookView | null;
  /** The postings as first made, and the true postings (as they should have been). */
  posted: Post[];
  truePosts: Post[];
  /** True balances (debit positive) and the balances the recorded ledger carries to the trial balance. */
  trueNet: Map<string, number>;
  recordedNet: Map<string, number>;
  /** The trial balance as first drawn up, and once checked against the ledger (before Suspense A/c). */
  tbDraft: TbRow[];
  tbChecked: TbRow[];
  /** The difference put to Suspense A/c: the side of Suspense A/c in the trial balance, and its amount. */
  suspense: { side: Side; amount: Paise };
  /** The rectifying entries, in the order of the errors found after the trial balance. */
  rectifications: { letter: string; lines: JournalLine[]; narration: string }[];
  correctedNet: Map<string, number>;
  profit: { books: number; corrected: number };
}

export interface TbRow {
  accountId: string;
  title: string;
  folio: number;
  /** The column it is written in. */
  side: Side;
  amount: Paise;
  /** The letter of an error in drawing up the trial balance, in this row. */
  letter?: string;
  /** In the checked trial balance: the row was left out of the draft, or moved from the other column. */
  fixed?: 'added' | 'moved';
}

const lineOf = (data: CaseData, txn: number, line: number): JournalLine => data.txns[txn].lines[line];

/** The entry as the clerk recorded it: an error of principle names another account. */
function recordedLines(data: CaseData, ti: number): JournalLine[] {
  const t = data.txns[ti];
  const p = data.errors.find((e) => e.kind === 'principle' && e.txn === ti) as Extract<ErrorSpec, { kind: 'principle' }> | undefined;
  return t.lines.map((l, li) => (p && p.line === li ? { ...l, accountId: p.as } : l));
}

const omitted = (data: CaseData, ti: number): boolean => data.errors.some((e) => e.kind === 'complete-omission' && e.txn === ti);

/** The postings of the books, as they should have been (`recorded` false) or as first made by the clerk. */
function postsOf(data: CaseData, recorded: boolean, letters: Map<CaseErrorData, string>, kind: BookKind | null): Post[] {
  const posts: Post[] = [];
  const errAt = (ti: number, li: number) =>
    recorded ? data.errors.find((e) => 'line' in e && e.txn === ti && e.line === li && e.kind !== 'principle') : undefined;
  let bookSum = 0;
  data.txns.forEach((t, ti) => {
    if (recorded && omitted(data, ti)) return;
    const lines = recorded ? recordedLines(data, ti) : t.lines;
    if (t.book) bookSum += t.lines[0].amount;
    const which = t.book ? [partyLine(t)] : [0, 1];
    for (const li of which) {
      const l = lines[li];
      const other = lines[1 - li];
      const e = errAt(ti, li);
      const base: Post = {
        key: `p${ti}.${li}`,
        accountId: l.accountId,
        side: l.side,
        day: t.day,
        label: ledgerLabel(other.accountId),
        amount: l.amount,
        jf: t.book && kind ? BOOK_FOLIO[kind] : JOURNAL_FOLIO,
        txn: ti,
        line: li,
      };
      if (!e) {
        posts.push(base);
        continue;
      }
      const letter = letters.get(e)!;
      if (e.kind === 'partial-omission') continue;
      if (e.kind === 'wrong-amount') posts.push({ ...base, amount: e.as, letter });
      else if (e.kind === 'wrong-side') posts.push({ ...base, side: otherSide(l.side), letter });
      else if (e.kind === 'wrong-account') posts.push({ ...base, accountId: e.as, letter });
      else posts.push(base);
    }
  });
  if (kind) {
    const cast = recorded ? (data.errors.find((e) => e.kind === 'book-casting') as Extract<ErrorSpec, { kind: 'book-casting' }> | undefined) : undefined;
    const recordedSum = recorded ? data.txns.reduce((s, t, ti) => s + (t.book && !omitted(data, ti) ? t.lines[0].amount : 0), 0) : bookSum;
    const total = cast ? cast.as : recordedSum;
    if (total > 0) {
      posts.push({
        key: 'book-total',
        accountId: BOOK_ACCOUNT[kind],
        side: BOOK_SIDE[kind],
        day: CLOSE_DAY,
        label: `Sundries as per ${BOOK_NAME[kind]}`,
        amount: total,
        jf: BOOK_FOLIO[kind],
        txn: -1,
        line: -1,
        ...(cast ? { letter: letters.get(cast)! } : {}),
      });
    }
  }
  // In the order of their dates; on one day, in the order of the transactions.
  return posts.sort((a, b) => a.day - b.day || (a.txn === -1 ? 1 : b.txn === -1 ? -1 : a.txn - b.txn || a.line - b.line));
}

const netOf = (opening: readonly OpeningBalance[], posts: readonly Post[]): Map<string, number> => {
  const m = new Map<string, number>();
  for (const o of opening) m.set(o.accountId, (m.get(o.accountId) ?? 0) + signed(o));
  for (const p of posts) m.set(p.accountId, (m.get(p.accountId) ?? 0) + signed(p));
  return m;
};

const add = (m: Map<string, number>, id: string, v: number) => m.set(id, (m.get(id) ?? 0) + v);

/** A balance carried down wrongly: what it should have been, from the rows and castings of the account. */
function rowsBalance(data: CaseData, posts: readonly Post[], accountId: string): number {
  let v = 0;
  for (const o of data.opening) if (o.accountId === accountId) v += signed(o);
  for (const p of posts) if (p.accountId === accountId) v += signed(p);
  for (const c of castingsOf(data)) if (c.accountId === accountId) v += c.side === 'Dr' ? c.by : -c.by;
  return v;
}

/** Every casting of the case's accounts (a compensating pair gives two). */
export function castingsOf(data: CaseData): (Casting & { spec: CaseErrorData })[] {
  const out: (Casting & { spec: CaseErrorData })[] = [];
  for (const e of data.errors) {
    if (e.kind === 'casting') out.push({ accountId: e.accountId, side: e.side, by: e.by, spec: e });
    if (e.kind === 'compensating') out.push({ ...e.a, spec: e }, { ...e.b, spec: e });
  }
  return out;
}

/** What one error leaves wrong in the ledger: recorded less true, account by account. */
function deltaOf(data: CaseData, e: ErrorSpec, kind: BookKind | null, postedForBalance: readonly Post[]): Map<string, number> {
  const d = new Map<string, number>();
  if (e.kind === 'complete-omission') {
    for (const l of data.txns[e.txn].lines) add(d, l.accountId, -signed(l));
  } else if (e.kind === 'principle') {
    const l = lineOf(data, e.txn, e.line);
    add(d, e.as, signed(l));
    add(d, l.accountId, -signed(l));
  } else if (e.kind === 'partial-omission') {
    const l = lineOf(data, e.txn, e.line);
    add(d, l.accountId, -signed(l));
  } else if (e.kind === 'wrong-amount') {
    const l = lineOf(data, e.txn, e.line);
    add(d, l.accountId, signed({ side: l.side, amount: e.as - l.amount }));
  } else if (e.kind === 'wrong-side') {
    const l = lineOf(data, e.txn, e.line);
    add(d, l.accountId, -2 * signed(l));
  } else if (e.kind === 'wrong-account') {
    const l = lineOf(data, e.txn, e.line);
    add(d, e.as, signed(l));
    add(d, l.accountId, -signed(l));
  } else if (e.kind === 'book-casting') {
    const k = kind!;
    const sum = data.txns.reduce((s, t, ti) => s + (t.book && !omitted(data, ti) ? t.lines[0].amount : 0), 0);
    add(d, BOOK_ACCOUNT[k], signed({ side: BOOK_SIDE[k], amount: e.as - sum }));
  } else if (e.kind === 'casting') {
    add(d, e.accountId, e.side === 'Dr' ? e.by : -e.by);
  } else if (e.kind === 'compensating') {
    for (const c of [e.a, e.b]) add(d, c.accountId, c.side === 'Dr' ? c.by : -c.by);
  } else if (e.kind === 'wrong-balance') {
    const right = rowsBalance(data, postedForBalance, e.accountId);
    add(d, e.accountId, (right >= 0 ? 1 : -1) * e.as - right);
  }
  for (const [k, v] of d) if (v === 0) d.delete(k);
  return d;
}

/** The rectifying entry: undo what is wrong, and let Suspense A/c take the difference the error made. */
export function entryOf(delta: readonly [string, number][], gap: number): JournalLine[] {
  const lines: JournalLine[] = delta.map(([accountId, v]) => ({ accountId, side: v > 0 ? 'Cr' : 'Dr', amount: Math.abs(v) }));
  // Debits too large: Suspense A/c stands on the credit side of the trial balance, so the entry debits it.
  if (gap !== 0) lines.push({ accountId: 'suspense', side: gap > 0 ? 'Dr' : 'Cr', amount: Math.abs(gap) });
  return [...lines.filter((l) => l.side === 'Dr'), ...lines.filter((l) => l.side === 'Cr')];
}

export const entryText = (lines: readonly JournalLine[]): string =>
  lines.map((l) => (l.side === 'Dr' ? `${title(l.accountId)} Dr ${f(l.amount)}` : `To ${title(l.accountId)} ${f(l.amount)}`)).join('; ');

const verbOf = (s: Side): string => (s === 'Dr' ? 'debited' : 'credited');

/** The sentence, the narration and the correction in the account, for one error. */
function wordsOf(data: CaseData, e: ErrorSpec, kind: BookKind | null, delta: Map<string, number>, posted: readonly Post[], recNet: Map<string, number>) {
  const at = (ti: number) => `${data.txns[ti].what} on ${dayLong(data.txns[ti].day)}`;
  const where = (ti: number) => (data.txns[ti].book && kind ? `the ${BOOK_NAME[kind]}` : 'the journal');
  const one = [...delta][0];
  const fix = one ? `${one[1] > 0 ? 'Credit' : 'Debit'} ${title(one[0])} with ${f(Math.abs(one[1]))}` : '';
  switch (e.kind) {
    case 'complete-omission':
      return { text: `${at(e.txn)} was not recorded in the books at all.`, narration: `${lc(at(e.txn))}, omitted from the books, now recorded`, inAccount: null };
    case 'principle': {
      const l = lineOf(data, e.txn, e.line);
      return { text: `${at(e.txn)} was ${verbOf(l.side)} to ${title(e.as)}.`, narration: `${lc(data.txns[e.txn].what)} wrongly ${verbOf(l.side)} to ${title(e.as)}, now rectified`, inAccount: null };
    }
    case 'partial-omission': {
      const l = lineOf(data, e.txn, e.line);
      return {
        text: `${at(e.txn)} was entered in ${where(e.txn)} but not posted to ${owned(l.accountId)}.`,
        narration: `${lc(data.txns[e.txn].what)} not posted to ${owned(l.accountId)}, now rectified`,
        inAccount: `${fix}: post the item that was left out ("${l.side === 'Dr' ? 'To' : 'By'} ${ledgerLabel(data.txns[e.txn].lines[1 - e.line].accountId)} ${f(l.amount)}").`,
      };
    }
    case 'wrong-amount': {
      const l = lineOf(data, e.txn, e.line);
      return {
        text: `${at(e.txn)} was posted to ${owned(l.accountId)} as ${f(e.as)}.`,
        narration: `${lc(data.txns[e.txn].what)} posted to ${owned(l.accountId)} as ${f(e.as)} instead of ${f(l.amount)}, now rectified`,
        inAccount: `${fix}: strike out ${f(e.as)} in ${title(l.accountId)} and write ${f(l.amount)}, the amount of the entry.`,
      };
    }
    case 'wrong-side': {
      const l = lineOf(data, e.txn, e.line);
      return {
        text: `${at(e.txn)} was posted to the ${sideWord(otherSide(l.side))} side of ${owned(l.accountId)}.`,
        narration: `${lc(data.txns[e.txn].what)} posted to the ${sideWord(otherSide(l.side))} side of ${owned(l.accountId)}, now rectified`,
        inAccount: `Strike out the ${sideWord(otherSide(l.side))} of ${f(l.amount)} in ${title(l.accountId)} and post ${f(l.amount)} on its ${sideWord(l.side)} side: the balance moves by ${f(2 * l.amount)} to the ${sideWord(l.side)}, ${f(l.amount)} for cancelling the wrong item and ${f(l.amount)} for the right one.`,
      };
    }
    case 'wrong-account': {
      const l = lineOf(data, e.txn, e.line);
      return {
        text: `${at(e.txn)} was ${verbOf(l.side)} to ${owned(e.as)} instead of ${owned(l.accountId)}.`,
        narration: `${lc(data.txns[e.txn].what)} wrongly ${verbOf(l.side)} to ${owned(e.as)}, now rectified`,
        inAccount: null,
      };
    }
    case 'book-casting': {
      const k = kind!;
      const sum = data.txns.reduce((s, t, ti) => s + (t.book && !omitted(data, ti) ? t.lines[0].amount : 0), 0);
      const over = e.as > sum;
      const by = Math.abs(e.as - sum);
      return {
        text: `The ${BOOK_NAME[k]} was ${over ? 'overcast' : 'undercast'} by ${f(by)}: its total was taken as ${f(e.as)} instead of ${f(sum)}, and posted to ${title(BOOK_ACCOUNT[k])}.`,
        narration: `${BOOK_NAME[k]} ${over ? 'overcast' : 'undercast'} by ${f(by)}, now rectified`,
        inAccount: `${fix}: put right the total of the ${BOOK_NAME[k]}, ${f(sum)}, and the amount posted to ${title(BOOK_ACCOUNT[k])}.`,
      };
    }
    case 'casting': {
      const over = e.by > 0;
      return {
        text: `The ${sideWord(e.side)} side of ${title(e.accountId)} was ${over ? 'overcast' : 'undercast'} by ${f(Math.abs(e.by))}.`,
        narration: `${sideWord(e.side)} side of ${title(e.accountId)} ${over ? 'overcast' : 'undercast'} by ${f(Math.abs(e.by))}, now rectified`,
        inAccount: `${fix}: add up the ${sideWord(e.side)} side of ${title(e.accountId)} again and balance it again.`,
      };
    }
    case 'compensating': {
      const part = (c: Casting) => `the ${sideWord(c.side)} side of ${title(c.accountId)} was ${c.by > 0 ? 'overcast' : 'undercast'} by ${f(Math.abs(c.by))}`;
      const t = `${part(e.a)}, and ${part(e.b)}.`;
      const same = e.a.by === e.b.by;
      const cast = (c: Casting) => (c.by > 0 ? 'overcast' : 'undercast');
      return {
        text: t.charAt(0).toUpperCase() + t.slice(1),
        narration: same
          ? `${sideWord(e.a.side)} side of ${title(e.a.accountId)} and ${sideWord(e.b.side)} side of ${title(e.b.accountId)} ${cast(e.a)} by ${f(Math.abs(e.a.by))} each, which compensated each other, now rectified`
          : `${sideWord(e.a.side)} side of ${title(e.a.accountId)} ${cast(e.a)} and ${sideWord(e.b.side)} side of ${title(e.b.accountId)} ${cast(e.b)} by ${f(Math.abs(e.a.by))} each, which compensated each other, now rectified`,
        inAccount: null,
      };
    }
    case 'wrong-balance': {
      const right = Math.abs(rowsBalance(data, posted, e.accountId));
      return {
        text: `The balance of ${title(e.accountId)} was carried down as ${f(e.as)} instead of ${f(right)}.`,
        narration: `balance of ${title(e.accountId)} carried down as ${f(e.as)} instead of ${f(right)}, now rectified`,
        inAccount: `${fix}: strike out the balance carried down and write ${f(right)}.`,
      };
    }
    case 'tb-omitted':
    case 'tb-wrong-column': {
      const v = recNet.get(e.accountId) ?? 0;
      const side: Side = v >= 0 ? 'Dr' : 'Cr';
      return e.kind === 'tb-omitted'
        ? { text: `The ${sideWord(side)} balance of ${title(e.accountId)}, ${f(Math.abs(v))}, was left out of the trial balance.`, narration: '', inAccount: null }
        : { text: `The ${sideWord(side)} balance of ${title(e.accountId)}, ${f(Math.abs(v))}, was written in the ${sideWord(otherSide(side))} column of the trial balance.`, narration: '', inAccount: null };
    }
  }
}

const LETTERS = 'abcdefghijkl';

/** Builds a case: the books as recorded and as they should be, the errors worked out, the trial balance and Suspense. */
export function buildCase(data: CaseData): Case {
  const kind = bookKindOf(data);
  const letters = new Map<CaseErrorData, string>(data.errors.map((e, i) => [e, LETTERS[i]]));
  const posted = postsOf(data, true, letters, kind);
  const truePosts = postsOf(data, false, letters, kind);
  // Posts corrected in the accounts before the trial balance: the ledger the accounts are balanced from.
  const beforeOnes = data.errors.filter((e) => e.before);
  const checkedPosts = applyBefore(data, posted, truePosts, beforeOnes, letters);

  const trueNet = netOf(data.opening, truePosts);
  const balancedNet = netOf(data.opening, checkedPosts);
  for (const c of castingsOf(data)) add(balancedNet, c.accountId, c.side === 'Dr' ? c.by : -c.by);
  for (const e of data.errors) {
    if (e.kind !== 'wrong-balance') continue;
    const right = rowsBalance(data, checkedPosts, e.accountId);
    balancedNet.set(e.accountId, (right >= 0 ? 1 : -1) * e.as);
  }
  const recordedNet = balancedNet;

  // Accounts in the order of their folios: the opening balances, then as first posted, then those only the true books
  // name (opened by a rectifying entry), and Suspense A/c last.
  const accounts: string[] = [];
  const push = (id: string) => {
    if (!accounts.includes(id)) accounts.push(id);
  };
  data.opening.forEach((o) => push(o.accountId));
  posted.forEach((p) => push(p.accountId));
  checkedPosts.forEach((p) => push(p.accountId));
  truePosts.forEach((p) => push(p.accountId));
  push('suspense');
  const folio = new Map(accounts.map((a, i) => [a, i + 1]));

  const errors: CaseError[] = data.errors.map((e, i) => {
    const letter = LETTERS[i];
    const isTb = e.kind === 'tb-omitted' || e.kind === 'tb-wrong-column';
    const deltaMap = isTb ? new Map<string, number>() : deltaOf(data, e, kind, checkedPosts);
    const delta = [...deltaMap];
    let gap = delta.reduce((s, [, v]) => s + v, 0);
    if (isTb) {
      const v = recordedNet.get(e.accountId) ?? 0;
      gap = e.kind === 'tb-omitted' ? -v : -2 * v;
    }
    const w = wordsOf(data, e, kind, deltaMap, checkedPosts, recordedNet);
    const nominal = delta.filter(([id]) => isNominal(id));
    const profit = nominal.reduce((s, [, v]) => s - v, 0);
    const profitWords = nominal.map(([id, v]) => {
      const tooHigh = normalSide(resolveAccount(id)) === (v > 0 ? 'Dr' : 'Cr');
      const overstates = -v > 0;
      return `${title(id)} is ${f(Math.abs(v))} too ${tooHigh ? 'high' : 'low'}: the profit is ${overstates ? 'overstated' : 'understated'} by ${f(Math.abs(v))}.`;
    });
    const touched = isTb ? [e.accountId] : delta.map(([id]) => id);
    return {
      letter,
      tag: `(${letter})`,
      spec: e,
      kind: e.kind,
      when: isTb ? 'tb' : e.before ? 'before' : 'after',
      cls: CLASS_OF[e.kind],
      name: KIND_NAME[e.kind],
      text: w.text,
      delta,
      gap,
      oneSided: gap !== 0,
      entry: isTb ? null : entryOf(delta, gap),
      narration: w.narration,
      inAccount: !isTb && gap !== 0 ? w.inAccount : null,
      inTrialBalance: isTb
        ? e.kind === 'tb-omitted'
          ? `Write the balance of ${title(e.accountId)}, ${f(Math.abs(recordedNet.get(e.accountId) ?? 0))}, in the ${sideWord((recordedNet.get(e.accountId) ?? 0) >= 0 ? 'Dr' : 'Cr')} column of the trial balance. No journal entry: the ledger is right.`
          : `Move the balance of ${title(e.accountId)}, ${f(Math.abs(recordedNet.get(e.accountId) ?? 0))}, to the ${sideWord((recordedNet.get(e.accountId) ?? 0) >= 0 ? 'Dr' : 'Cr')} column of the trial balance. No journal entry: the ledger is right.`
        : null,
      profit,
      profitWords,
      accounts: touched,
    };
  });

  // The trial balance: as drawn up, then checked against the ledger.
  const rowsFrom = (withSlips: boolean): TbRow[] => {
    const rows: TbRow[] = [];
    for (const id of accounts) {
      const v = recordedNet.get(id) ?? 0;
      if (v === 0 || id === 'suspense') continue;
      const slip = errors.find((x) => x.when === 'tb' && x.accounts[0] === id);
      const side: Side = v > 0 ? 'Dr' : 'Cr';
      if (withSlips && slip?.kind === 'tb-omitted') continue;
      rows.push({
        accountId: id,
        title: title(id),
        folio: folio.get(id)!,
        side: withSlips && slip?.kind === 'tb-wrong-column' ? otherSide(side) : side,
        amount: Math.abs(v),
        ...(slip ? { letter: slip.letter } : {}),
        ...(!withSlips && slip ? { fixed: slip.kind === 'tb-omitted' ? ('added' as const) : ('moved' as const) } : {}),
      });
    }
    return rows;
  };
  const tbDraft = rowsFrom(true);
  const tbChecked = rowsFrom(false);
  const { debit, credit } = totalsOf(tbChecked);
  const suspense = { side: (debit > credit ? 'Cr' : 'Dr') as Side, amount: Math.abs(debit - credit) };

  const after = errors.filter((e) => e.when === 'after');
  const rectifications = after.map((e) => ({ letter: e.letter, lines: e.entry!, narration: e.narration }));
  const correctedNet = new Map(recordedNet);
  correctedNet.set('suspense', suspense.side === 'Dr' ? suspense.amount : -suspense.amount);
  for (const r of rectifications) for (const l of r.lines) add(correctedNet, l.accountId, signed(l));

  const profitOf = (net: Map<string, number>) => {
    let p = data.closingStock;
    for (const [id, v] of net) {
      if (isNominal(id)) p -= v;
      if (id === 'stock') p -= v;
    }
    return p;
  };

  const journal: JournalEntryView[] = [];
  const missing: JournalEntryView[] = [];
  data.txns.forEach((t, ti) => {
    if (t.book) return;
    const lines = recordedLines(data, ti).map((l, li) => {
      const p = posted.find((x) => x.txn === ti && x.line === li);
      const lf = p ? String(folio.get(p.accountId)) : '';
      const fixed = data.errors.some((e) => e.before && 'line' in e && e.txn === ti && e.line === li);
      return { accountId: l.accountId, side: l.side, amount: l.amount, lf, lfChecked: fixed ? String(folio.get(l.accountId)) : lf, txn: ti, line: li };
    });
    const principle = data.errors.find((e) => e.kind === 'principle' && e.txn === ti);
    const view: JournalEntryView = { txn: ti, day: t.day, lines: [...lines.filter((l) => l.side === 'Dr'), ...lines.filter((l) => l.side === 'Cr')], narration: t.narration, ...(principle ? { letter: letters.get(principle)! } : {}) };
    if (omitted(data, ti)) {
      const om = data.errors.find((e) => e.kind === 'complete-omission' && e.txn === ti)!;
      missing.push({ ...view, lines: view.lines.map((l) => ({ ...l, lf: '', lfChecked: '' })), letter: letters.get(om)! });
    } else journal.push(view);
  });

  let book: BookView | null = null;
  if (kind) {
    const rows: BookRowView[] = [];
    let invoice = 101;
    data.txns.forEach((t, ti) => {
      if (!t.book) return;
      const n = invoice++;
      if (omitted(data, ti)) return;
      const li = partyLine(t);
      const p = posted.find((x) => x.txn === ti && x.line === li);
      const lf = p ? String(folio.get(p.accountId)) : '';
      const fixed = data.errors.some((e) => e.before && 'line' in e && e.txn === ti);
      rows.push({ txn: ti, day: t.day, invoice: n, partyId: t.lines[li].accountId, amount: t.lines[0].amount, lf, lfChecked: fixed ? String(folio.get(t.lines[li].accountId)) : lf });
    });
    const sum = rows.reduce((s, r) => s + r.amount, 0);
    const cast = data.errors.find((e) => e.kind === 'book-casting') as (Extract<ErrorSpec, { kind: 'book-casting' }> & CaseErrorData) | undefined;
    book = { kind, name: BOOK_NAME[kind], rows, sum, total: cast ? cast.as : sum, ...(cast ? { letter: letters.get(cast)! } : {}) };
  }

  return {
    data,
    bookKind: kind,
    errors,
    accounts,
    folio,
    journal,
    missing,
    book,
    posted,
    truePosts,
    trueNet,
    recordedNet,
    tbDraft,
    tbChecked,
    suspense,
    rectifications,
    correctedNet,
    profit: { books: profitOf(recordedNet), corrected: profitOf(trueNet) },
  };
}

/** The checked posts: each posting error found before the trial balance corrected in its account. */
function applyBefore(data: CaseData, posted: readonly Post[], truePosts: readonly Post[], before: readonly CaseErrorData[], letters: Map<CaseErrorData, string>): Post[] {
  let out = [...posted];
  for (const e of before) {
    if (!('line' in e)) continue;
    const right = truePosts.find((p) => p.txn === e.txn && p.line === e.line)!;
    const letter = letters.get(e)!;
    out = out.filter((p) => !(p.txn === e.txn && p.line === e.line));
    out.push({ ...right, key: `${right.key}.fix`, letter });
  }
  return out.sort((a, b) => a.day - b.day || (a.txn === -1 ? 1 : b.txn === -1 ? -1 : a.txn - b.txn || a.line - b.line));
}

export function totalsOf(rows: readonly { side: Side; amount: Paise }[]): { debit: Paise; credit: Paise } {
  let debit = 0;
  let credit = 0;
  for (const r of rows) {
    if (r.side === 'Dr') debit += r.amount;
    else credit += r.amount;
  }
  return { debit, credit };
}

export const findError = (c: Case, letter: string): CaseError => c.errors.find((e) => e.letter === letter)!;
export const errorsWhen = (c: Case, when: When): CaseError[] => c.errors.filter((e) => e.when === when);

/** The balance of a signed net: its side and amount, or null at nil. */
export const balanceOfNet = (v: number): { side: Side; amount: Paise } | null => (v === 0 ? null : { side: v > 0 ? 'Dr' : 'Cr', amount: Math.abs(v) });

/** The corrected trial balance: every account with a balance once the errors are rectified (Suspense A/c is nil). */
export function correctedTb(c: Case): TbRow[] {
  const rows: TbRow[] = [];
  for (const id of c.accounts) {
    const b = balanceOfNet(c.correctedNet.get(id) ?? 0);
    if (!b) continue;
    rows.push({ accountId: id, title: title(id), folio: c.folio.get(id)!, side: b.side, amount: b.amount });
  }
  return rows;
}

/** "a profit of ₹7,100", "a loss of ₹5,500". */
export const resultWords = (p: number): string => (p >= 0 ? `a profit of ${f(p)}` : `a loss of ${f(-p)}`);

// ---------------------------------------------------------------------------------------------------------------
// The ledger drawn: each account as the board writes it, at a stage of the walk.
// ---------------------------------------------------------------------------------------------------------------

export interface LedgerState {
  /** The postings found wrong before the trial balance are corrected in their accounts. */
  checked: boolean;
  /** The accounts are balanced (c/d, totals, b/d). */
  balanced: boolean;
  /** Suspense A/c is opened with the difference. */
  suspense: boolean;
  /** Errors shown in the picture: their wrong items are marked. */
  revealed: ReadonlySet<string>;
  /** Errors whose rectifying entries are posted. */
  rectified: ReadonlySet<string>;
}

export interface RowView {
  key: string;
  date: string;
  particulars: string;
  jf: string;
  amount: Paise;
  /** The figure struck out and replaced by `amount`; or the whole row struck out (`amount` then is what was struck). */
  struck?: Paise | 'row';
  /** What marks the row: an error in it, a correction made in the account, a rectifying entry, a posting missing. */
  mark?: { letter: string; tone: 'wrong' | 'fixed' | 'rect' | 'missing' };
}

export interface SideView {
  rows: RowView[];
  /** The total as written; null when the side is not totalled. */
  total: Paise | null;
  /** The total is wrongly written (a casting), with the error's letter, once revealed. */
  totalMark?: string;
}

export interface PeriodView {
  title: string;
  dr: SideView;
  cr: SideView;
}

export interface AccountView {
  accountId: string;
  title: string;
  folio: number;
  periods: PeriodView[];
  /** The balance as it now stands (null: nil, or not balanced yet and the sides agree). */
  balance: { side: Side; amount: Paise } | null;
  /** Letters of the errors in it, revealed so far. */
  letters: string[];
  /** The rectifying entries posted to it. */
  rectified: string[];
}

const toBy = (s: Side): string => (s === 'Dr' ? 'To' : 'By');

/** One account as it stands at a stage of the walk; null when nothing is written in it yet. */
export function accountView(c: Case, accountId: string, state: LedgerState): AccountView | null {
  if (accountId === 'suspense') return suspenseView(c, state);
  // The accounts are checked before they are balanced.
  const s: LedgerState = state.balanced && !state.checked ? { ...state, checked: true } : state;
  const errorAt = (txn: number, line: number) => c.errors.find((x) => 'line' in x.spec && x.kind !== 'principle' && x.spec.txn === txn && x.spec.line === line);
  const dr: RowView[] = [];
  const cr: RowView[] = [];
  const sideRows = (side: Side) => (side === 'Dr' ? dr : cr);
  const letters = new Set<string>();

  for (const o of c.data.opening) {
    if (o.accountId !== accountId) continue;
    sideRows(o.side).push({ key: `open:${accountId}`, date: OPEN_SHORT, particulars: `${toBy(o.side)} ${BALANCE_BD}`, jf: '', amount: o.amount });
  }
  // The postings as first made, and the true postings this account never got (left out, made to another account or
  // on the other side): those are written in when a posting found wrong before the trial balance is corrected, and
  // shown as missing once a posting left out is found afterwards.
  const missing = c.truePosts.filter((p) => {
    if (p.accountId !== accountId || p.txn === -1 || !errorAt(p.txn, p.line)) return false;
    return !c.posted.some((q) => q.txn === p.txn && q.line === p.line && q.accountId === accountId && q.side === p.side);
  });
  const all = [...c.posted.filter((p) => p.accountId === accountId).map((p) => ({ p, from: 'posted' as const })), ...missing.map((p) => ({ p, from: 'missing' as const }))].sort(
    (a, b) => a.p.day - b.p.day || (a.p.txn === -1 ? 1 : b.p.txn === -1 ? -1 : a.p.txn - b.p.txn || a.p.line - b.p.line || (a.from === 'posted' ? -1 : 1)),
  );
  for (const { p, from } of all) {
    const e = from === 'posted' ? (p.letter ? findError(c, p.letter) : undefined) : errorAt(p.txn, p.line);
    const fixedHere = e?.when === 'before' && s.checked;
    const base: RowView = { key: `${from}:${p.key}`, date: dayShort(p.day), particulars: `${toBy(p.side)} ${p.label}`, jf: p.jf, amount: p.amount };
    if (from === 'missing') {
      if (fixedHere) {
        sideRows(p.side).push({ ...base, mark: { letter: e!.letter, tone: 'fixed' } });
        letters.add(e!.letter);
      } else if (e && e.when === 'after' && e.kind === 'partial-omission' && s.revealed.has(e.letter)) {
        sideRows(p.side).push({ ...base, mark: { letter: e.letter, tone: 'missing' } });
        letters.add(e.letter);
      }
      continue;
    }
    if (!e) {
      sideRows(p.side).push(base);
    } else if (fixedHere) {
      // Corrected in the account itself: a wrong figure struck out and the right one written; an item on the wrong
      // side struck out (the right item is written on the other side).
      letters.add(e.letter);
      const right = c.truePosts.find((q) => q.txn === p.txn && q.line === p.line)!;
      sideRows(p.side).push(e.kind === 'wrong-amount' ? { ...base, amount: right.amount, struck: p.amount, mark: { letter: e.letter, tone: 'fixed' } } : { ...base, struck: 'row', mark: { letter: e.letter, tone: 'fixed' } });
    } else if (s.revealed.has(e.letter)) {
      letters.add(e.letter);
      sideRows(p.side).push({ ...base, mark: { letter: e.letter, tone: 'wrong' } });
    } else {
      sideRows(p.side).push(base);
    }
  }

  const periods: PeriodView[] = [];
  let balance: { side: Side; amount: Paise } | null = null;
  const live = (r: RowView) => r.struck !== 'row' && r.mark?.tone !== 'missing';
  const sum = (rs: RowView[]) => rs.filter(live).reduce((t, r) => t + r.amount, 0);

  if (dr.length > 0 || cr.length > 0) {
    const period: PeriodView = { title: `April ${YEAR}`, dr: { rows: dr, total: null }, cr: { rows: cr, total: null } };
    balance = balanceOfNet(sum(dr) - sum(cr));
    // An account that holds only a posting shown as missing was never opened by the clerk: nothing to balance.
    const opened = [...dr, ...cr].some(live);
    if (s.balanced && opened) {
      // Balanced by the clerk: each side as it was added up (a casting is in it), the balance carried down as it was
      // written (a wrong balancing is in it), and both sides totalled to the larger side as added.
      const casts = castingsOf(c.data).filter((x) => x.accountId === accountId);
      const added = (side: Side) => sum(side === 'Dr' ? dr : cr) + casts.filter((x) => x.side === side).reduce((t, x) => t + x.by, 0);
      const total = Math.max(added('Dr'), added('Cr'));
      const bal = balanceOfNet(c.recordedNet.get(accountId) ?? 0);
      const balErr = c.errors.find((x) => x.kind === 'wrong-balance' && x.accounts[0] === accountId);
      if (bal) {
        const cdSide = otherSide(bal.side);
        const markCd = balErr && s.revealed.has(balErr.letter) ? { letter: balErr.letter, tone: 'wrong' as const } : undefined;
        if (markCd) letters.add(markCd.letter);
        sideRows(cdSide).push({ key: `cd:${accountId}`, date: dayShort(CLOSE_DAY), particulars: `${toBy(cdSide)} ${BALANCE_CD}`, jf: '', amount: bal.amount, ...(markCd ? { mark: markCd } : {}) });
      }
      period.dr.total = total;
      period.cr.total = total;
      for (const x of casts) {
        const e = c.errors.find((er) => er.spec === x.spec)!;
        if (s.revealed.has(e.letter)) {
          letters.add(e.letter);
          // The casting shows where the side that was added wrongly is the longer one: its total; else its c/d.
          (x.side === 'Dr' ? period.dr : period.cr).totalMark = e.letter;
        }
      }
      balance = bal;
    }
    periods.push(period);
  }

  // After the trial balance: the balance brought down, and the rectifying entries posted to it.
  const rect = c.rectifications.filter((r) => s.rectified.has(r.letter) && r.lines.some((l) => l.accountId === accountId));
  if (s.balanced && (balance || rect.length > 0)) {
    const p2: PeriodView = { title: rect.length ? 'After rectification' : 'May', dr: { rows: [], total: null }, cr: { rows: [], total: null } };
    if (balance) (balance.side === 'Dr' ? p2.dr : p2.cr).rows.push({ key: `bd:${accountId}`, date: REOPEN_SHORT, particulars: `${toBy(balance.side)} ${BALANCE_BD}`, jf: '', amount: balance.amount });
    for (const r of rect) {
      for (const l of r.lines) {
        if (l.accountId !== accountId) continue;
        const others = r.lines.filter((x) => x.side !== l.side);
        for (const o of others) {
          (l.side === 'Dr' ? p2.dr : p2.cr).rows.push({ key: `rect:${r.letter}:${o.accountId}`, date: `(${r.letter})`, particulars: `${toBy(l.side)} ${title(o.accountId)}`, jf: RECTIFY_FOLIO, amount: o.amount, mark: { letter: r.letter, tone: 'rect' } });
        }
      }
    }
    if (rect.length) {
      const net = sum(p2.dr.rows) - sum(p2.cr.rows);
      const b = balanceOfNet(net);
      const total = Math.max(sum(p2.dr.rows), sum(p2.cr.rows));
      if (b) (b.side === 'Dr' ? p2.cr : p2.dr).rows.push({ key: `cd2:${accountId}`, date: '', particulars: `${toBy(otherSide(b.side))} ${BALANCE_CD}`, jf: '', amount: b.amount });
      p2.dr.total = total;
      p2.cr.total = total;
      balance = b;
    }
    periods.push(p2);
  }
  if (periods.length === 0) return null;
  return {
    accountId,
    title: title(accountId),
    folio: c.folio.get(accountId)!,
    periods,
    balance,
    letters: [...letters].sort(),
    rectified: rect.map((r) => r.letter),
  };
}

/** Suspense A/c: opened with the difference, and closed by the rectifying entries that name it. */
function suspenseView(c: Case, s: LedgerState): AccountView | null {
  if (!s.suspense) return null;
  const dr: RowView[] = [];
  const cr: RowView[] = [];
  const open = c.suspense;
  (open.side === 'Dr' ? dr : cr).push({ key: 'diff', date: dayShort(CLOSE_DAY), particulars: `${toBy(open.side)} ${DIFFERENCE}`, jf: '', amount: open.amount });
  const through = c.rectifications.filter((r) => r.lines.some((l) => l.accountId === 'suspense'));
  const done = through.filter((r) => s.rectified.has(r.letter));
  for (const r of done) {
    const l = r.lines.find((x) => x.accountId === 'suspense')!;
    const o = r.lines.find((x) => x.side !== l.side)!;
    (l.side === 'Dr' ? dr : cr).push({ key: `rect:${r.letter}`, date: `(${r.letter})`, particulars: `${toBy(l.side)} ${title(o.accountId)}`, jf: RECTIFY_FOLIO, amount: l.amount, mark: { letter: r.letter, tone: 'rect' } });
  }
  const d = dr.reduce((t, r) => t + r.amount, 0);
  const k = cr.reduce((t, r) => t + r.amount, 0);
  const closed = done.length === through.length;
  return {
    accountId: 'suspense',
    title: title('suspense'),
    folio: c.folio.get('suspense')!,
    periods: [{ title: closed && through.length ? 'Opened with the difference, closed by the rectifications' : 'Opened with the difference', dr: { rows: dr, total: closed ? d : null }, cr: { rows: cr, total: closed ? k : null } }],
    balance: balanceOfNet(d - k),
    letters: done.map((r) => r.letter),
    rectified: done.map((r) => r.letter),
  };
}

/** The balance of Suspense A/c once the given errors are rectified (debit positive). */
export function suspenseLeft(c: Case, rectified: ReadonlySet<string>): number {
  let v = c.suspense.side === 'Dr' ? c.suspense.amount : -c.suspense.amount;
  for (const r of c.rectifications) {
    if (!rectified.has(r.letter)) continue;
    for (const l of r.lines) if (l.accountId === 'suspense') v += signed(l);
  }
  return v;
}

// ---------------------------------------------------------------------------------------------------------------
// Checks a case can stand: used by the tests on the ready cases and by the generator on every case it draws.
// ---------------------------------------------------------------------------------------------------------------

/** Why the case cannot stand, or null. */
export function problemOf(data: CaseData): string | null {
  const days = data.txns.map((t) => t.day);
  if (days.some((d, i) => d < 1 || d > 29 || (i > 0 && d < days[i - 1]))) return 'The transactions are not in the order of their dates within April.';
  for (const t of data.txns) {
    if (t.lines.length !== 2 || t.lines[0].side !== 'Dr' || t.lines[1].side !== 'Cr' || t.lines[0].amount !== t.lines[1].amount || t.lines[0].amount <= 0) return `An entry is not one debit and one equal credit: ${t.text}`;
    if (t.lines.some((l) => l.accountId === 'suspense')) return 'Suspense A/c is not a transaction.';
  }
  const kinds = new Set(data.txns.filter((t) => t.book).map((t) => (t.lines.some((l) => l.accountId === 'sales' && l.side === 'Cr') ? 'sales' : t.lines.some((l) => l.accountId === 'purchases' && l.side === 'Dr') ? 'purchases' : 'other')));
  if (kinds.has('other') || kinds.size > 1) return 'A book holds credit sales only, or credit purchases only.';
  const openNet = data.opening.reduce((s, o) => s + signed(o), 0);
  if (openNet !== 0) return 'The opening balances do not agree.';
  const seen = new Set<number>();
  const castAccounts = new Set<string>();
  for (const e of data.errors) {
    if ('txn' in e) {
      if (e.txn < 0 || e.txn >= data.txns.length) return 'An error names a transaction that is not there.';
      if (seen.has(e.txn)) return 'Two errors in one transaction.';
      seen.add(e.txn);
    }
    if ('line' in e && (e.line < 0 || e.line > 1)) return 'An error names a line that is not there.';
    if (e.kind === 'principle' && data.txns[e.txn].book) return 'An error of principle is made in the journal here.';
    if ((e.kind === 'wrong-amount' || e.kind === 'wrong-side' || e.kind === 'partial-omission' || e.kind === 'wrong-account') && data.txns[e.txn].book && e.line !== partyLine(data.txns[e.txn]))
      return "In a book, only the party's posting is made on the day.";
    if (e.kind === 'wrong-amount' && (e.as <= 0 || e.as === lineOf(data, e.txn, e.line).amount)) return 'A wrong amount must differ from the right one.';
    if ((e.kind === 'wrong-account' || e.kind === 'principle') && e.as === lineOf(data, e.txn, e.line).accountId) return 'The wrong account must be another account.';
    if (e.kind === 'book-casting' && !bookKindOf(data)) return 'A book casting needs a book.';
    if (e.before && !(e.kind === 'partial-omission' || e.kind === 'wrong-amount' || e.kind === 'wrong-side')) return 'Only a posting found wrong is corrected before the trial balance here.';
    for (const x of e.kind === 'casting' ? [e] : e.kind === 'compensating' ? [e.a, e.b] : []) {
      if (x.by === 0) return 'A casting by nil is no error.';
      if (castAccounts.has(x.accountId)) return 'Two castings in one account.';
      castAccounts.add(x.accountId);
    }
    if (e.kind === 'compensating') {
      const g = (e.a.side === 'Dr' ? e.a.by : -e.a.by) + (e.b.side === 'Dr' ? e.b.by : -e.b.by);
      if (g !== 0) return 'Compensating errors must cancel.';
    }
  }
  if (data.errors.filter((e) => e.kind === 'book-casting').length > 1) return 'One book, one casting.';
  const c = buildCase(data);
  // A side added up wrongly has items on it to add (at least two: a single figure is not cast), more than it was
  // undercast by.
  for (const x of castingsOf(data)) {
    const items = [...data.opening.filter((o) => o.accountId === x.accountId && o.side === x.side), ...c.posted.filter((p) => p.accountId === x.accountId && p.side === x.side)];
    if (items.length < 2 || items.reduce((t, i) => t + i.amount, 0) + x.by <= 0) return `The ${sideWord(x.side)} side of ${title(x.accountId)} has nothing to add up wrongly.`;
  }
  for (const e of c.errors) {
    if (e.accounts.includes('stock')) return 'No error touches the opening stock.';
    if (e.when !== 'tb' && e.delta.length === 0) return `Error ${e.tag} changes nothing.`;
    if (e.kind === 'wrong-balance' && (e.spec as { as: Paise }).as <= 0) return 'A balance carried down must be above nil.';
  }
  // Every balance stands on the side it belongs to (or is nil), in the true books and as recorded.
  for (const [label, net] of [
    ['true', c.trueNet],
    ['recorded', c.recordedNet],
  ] as const) {
    for (const [id, v] of net) {
      if (v === 0 || id === 'suspense') continue;
      const side: Side = v > 0 ? 'Dr' : 'Cr';
      if (side !== normalSide(resolveAccount(id))) return `${title(id)} would have a ${sideWord(side)} balance in the ${label} books.`;
    }
  }
  const tbErr = c.errors.filter((e) => e.when === 'tb');
  for (const e of tbErr) if ((c.recordedNet.get(e.accounts[0]) ?? 0) === 0) return 'A balance left out must be a balance.';
  if (c.suspense.amount === 0) return 'The trial balance agrees: no Suspense A/c.';
  const draft = totalsOf(c.tbDraft);
  if (draft.debit === draft.credit) return 'The trial balance as first drawn up agrees: nothing would make anyone check it.';
  if (c.errors.some((e) => e.when === 'after' && e.oneSided) === false) return 'No error found after the trial balance went through Suspense A/c.';
  return null;
}
