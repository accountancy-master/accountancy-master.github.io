import type { BankRow, JournalEntry, JournalLine, StatementLine, TwoYearLine, Voucher } from './types';

// Arithmetic on the worked outlines of the project guides: the ledger a journal makes, the balances of the two bank
// books, the form of a voucher, percentages and ratios. The page uses it to draw the ledger, the running balances of
// the pass book and the form of each voucher; figures.test.ts uses it to check every figure the outlines state.

/** A posting in a ledger account: the date, the other account(s) of the entry, and the amount. */
export interface Posting {
  date: string;
  /** "To Cash A/c" on the debit side, "By Sales A/c" on the credit side. */
  particulars: string;
  amount: number;
}

/** A ledger account: its postings on each side, the totals and the balance. */
export interface LedgerAccount {
  name: string;
  debit: Posting[];
  credit: Posting[];
  /** The larger side's total: both sides add up to it once the balance is carried down. */
  total: number;
  /** The balance and its side; 0 with side null when the account is closed. */
  balance: number;
  side: 'Dr' | 'Cr' | null;
}

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

/** The debit total and the credit total of some lines. */
export function totals(lines: readonly JournalLine[]): { dr: number; cr: number } {
  return { dr: sum(lines.map((l) => l.dr ?? 0)), cr: sum(lines.map((l) => l.cr ?? 0)) };
}

/** The account as it is named in the ledger: "Cash" becomes "Cash A/c"; a name that already ends with "A/c" stays. */
export const accountTitle = (name: string): string => (/A\/c$/.test(name) ? name : `${name} A/c`);

/**
 * The ledger of a journal: every account in the order it is first met, each posting naming the other side of its
 * entry ("To Capital A/c"; "To Sundries A/c" for an entry with several accounts on the other side).
 */
export function ledgerOf(journal: readonly JournalEntry[]): LedgerAccount[] {
  const accounts = new Map<string, { debit: Posting[]; credit: Posting[] }>();
  const of = (name: string) => {
    let a = accounts.get(name);
    if (!a) accounts.set(name, (a = { debit: [], credit: [] }));
    return a;
  };
  for (const e of journal) {
    const drs = e.lines.filter((l) => l.dr);
    const crs = e.lines.filter((l) => l.cr);
    for (const l of e.lines) of(l.account);
    for (const l of drs) of(l.account).debit.push({ date: e.date, particulars: `To ${crs.length === 1 ? accountTitle(crs[0].account) : 'Sundries A/c'}`, amount: l.dr! });
    for (const l of crs) of(l.account).credit.push({ date: e.date, particulars: `By ${drs.length === 1 ? accountTitle(drs[0].account) : 'Sundries A/c'}`, amount: l.cr! });
  }
  return [...accounts.entries()].map(([name, { debit, credit }]) => {
    const dr = sum(debit.map((p) => p.amount));
    const cr = sum(credit.map((p) => p.amount));
    return { name, debit, credit, total: Math.max(dr, cr), balance: Math.abs(dr - cr), side: dr > cr ? 'Dr' : cr > dr ? 'Cr' : null };
  });
}

/** The balance of every account of a journal: positive for a debit balance, negative for a credit balance. */
export function balancesOf(journal: readonly JournalEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of journal) for (const l of e.lines) out.set(l.account, (out.get(l.account) ?? 0) + (l.dr ?? 0) - (l.cr ?? 0));
  return out;
}

/** The lowest balance an account reaches over the journal, entry by entry (for cash: it may never go below nil). */
export function lowestBalance(journal: readonly JournalEntry[], account: string): number {
  let now = 0;
  let low = 0;
  for (const e of journal) {
    for (const l of e.lines) if (l.account === account) now += (l.dr ?? 0) - (l.cr ?? 0);
    low = Math.min(low, now);
  }
  return low;
}

/** The total of the lines of one side of a statement. */
export const sideTotal = (lines: readonly StatementLine[]): number => sum(lines.map((l) => l.amount));

/** What the parts of a statement line come to: each added, or taken away when it is `less`. */
export const partsTotal = (line: StatementLine): number => sum((line.parts ?? []).map((p) => (p.less ? -p.amount : p.amount)));

/**
 * The balance of a bank book after every row: deposits less withdrawals, from the opening balance (its first row,
 * ref 'opening'). Positive is money at the bank.
 */
export function runningBalances(rows: readonly BankRow[]): number[] {
  let now = 0;
  return rows.map((r) => (now += (r.deposit ?? 0) - (r.withdrawal ?? 0)));
}

/** The closing balance of a bank book: positive is money at the bank. */
export const closingBalance = (rows: readonly BankRow[]): number => runningBalances(rows).at(-1) ?? 0;

/**
 * Each ref of either book, with what it adds to the bank balance in the cash book and in the pass book. A ref the two
 * books record alike adds the same to both; a difference is an item of the reconciliation.
 */
export function bookDifferences(cashBook: readonly BankRow[], passBook: readonly BankRow[]): Map<string, { cash: number; bank: number }> {
  const out = new Map<string, { cash: number; bank: number }>();
  const add = (rows: readonly BankRow[], key: 'cash' | 'bank') => {
    for (const r of rows) {
      const now = out.get(r.ref) ?? { cash: 0, bank: 0 };
      now[key] += (r.deposit ?? 0) - (r.withdrawal ?? 0);
      out.set(r.ref, now);
    }
  };
  add(cashBook, 'cash');
  add(passBook, 'bank');
  return out;
}

/** The form of a voucher: one account on each side (simple), several on one side (compound), several on both (complex). */
export function voucherForm(v: Pick<Voucher, 'lines'>): 'simple' | 'compound' | 'complex' {
  const drs = v.lines.filter((l) => l.dr).length;
  const crs = v.lines.filter((l) => l.cr).length;
  return drs > 1 && crs > 1 ? 'complex' : drs > 1 || crs > 1 ? 'compound' : 'simple';
}

/** Rounded to two decimals, as every percentage and ratio of the outlines is given. */
export const round2 = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;

/** The change from last year to this year in per cent of last year, to two decimals. */
export const percentChange = (cy: number, py: number): number => round2(((cy - py) / py) * 100);

/** A part as a per cent of a whole, to two decimals. */
export const percentOf = (part: number, whole: number): number => round2((part / whole) * 100);

/** A line of two years by id, from any of the lists given; an error when there is none (the checks name it). */
export function lineOf(lists: readonly (readonly TwoYearLine[])[], id: string): TwoYearLine {
  for (const list of lists) {
    const found = list.find((l) => l.id === id);
    if (found) return found;
  }
  throw new Error(`no line ${id}`);
}

/** "₹1,25,000": whole rupees with Indian digit grouping (a negative amount in brackets, as statements show it). */
export function rupees(n: number, symbol = true): string {
  const text = Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const body = symbol ? `₹${text}` : text;
  return n < 0 ? `(${body})` : body;
}

/** An ISO day as a statement writes it: "2025-04-01" is "1 Apr". */
export function dayMonth(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]}`;
}
