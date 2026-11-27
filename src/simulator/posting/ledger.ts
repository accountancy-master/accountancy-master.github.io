// ---------------------------------------------------------------------------------------------------------------
// From a story's journal to its ledger and trial balance, and the steps the lab plays them in.
//
// Conventions (NCERT Class 11, CBSE 2025-26):
//  - a debit is posted on the debit (left) side of its account with "To" and the other account of the entry; a
//    credit on the credit (right) side with "By". In a compound entry an account alone on its side shows one item for
//    each account on the other side (engine/books.ts, postingsOf);
//  - every account is balanced on 30 April: the difference of the two sides is written on the shorter side as
//    "Balance c/d", both sides are totalled to the same figure, and the balance is brought down on 1 May on the other
//    side as "Balance b/d". An account whose sides are equal is closed by totalling and has no balance;
//  - the trial balance is prepared by the balance method only: each account with a balance is listed once, a debit
//    balance in the debit column and a credit balance in the credit column; an account with no balance is left out.
//    The accounts of incomes and expenses are balanced here only to carry their balances to the trial balance; at the
//    year end they are closed to the Trading and Profit and Loss Account instead.
// ---------------------------------------------------------------------------------------------------------------

import type { Side } from '@/engine/accounts';
import { BALANCE_BD, BALANCE_CD, postingsOf, type Balance } from '@/engine/books';
import { formatINR, type Paise } from '@/engine/money';
import { accountTitle, CLOSE_DAY, kindOf, MONTH, MONTH_SHORT, reasonFor, REOPEN_DATE, REOPEN_SHORT, type PostingStory } from './story';

/** The journal's page: every entry of the month is on page 1. */
export const JOURNAL_FOLIO = 'J1';

export interface LedgerRow {
  /** Stable: `p<txn>.<line>.<k>` for a posting, `cd:<account>`, `bd:<account>`. */
  key: string;
  /** "Apr 3", "May 1". */
  date: string;
  /** With "To" or "By": "To Capital A/c", "By Balance c/d". */
  particulars: string;
  /** The journal folio of a posting; blank for a balance. */
  jf: string;
  amount: Paise;
  kind: 'posting' | 'cd' | 'bd';
  /** The entry and line that made a posting. */
  txn?: number;
  line?: number;
}

export interface TAccount {
  accountId: string;
  /** "Cash A/c". */
  title: string;
  /** Its page in the ledger, in the order accounts are first posted to. */
  folio: number;
  /** The postings of each side, in date order. */
  debit: LedgerRow[];
  credit: LedgerRow[];
  debitSum: Paise;
  creditSum: Paise;
  /** The balance (a debit balance when the debit side is larger), or null when the sides are equal. */
  balance: Balance | null;
  /** "Balance c/d", on the shorter side; null when there is no balance. */
  carriedDown: (LedgerRow & { side: Side }) | null;
  /** What each side totals once the balance is carried down. */
  total: Paise;
  /** "Balance b/d" on 1 May, on the side of the balance. */
  broughtDown: (LedgerRow & { side: Side }) | null;
}

const dateOf = (day: number) => `${MONTH_SHORT} ${day}`;
const opposite = (s: Side): Side => (s === 'Dr' ? 'Cr' : 'Dr');
const sideName = (s: Side) => (s === 'Dr' ? 'debit' : 'credit');

/** The postings one journal line makes in its own account (usually one; more in a compound entry). */
export function postingsOfLine(story: PostingStory, txn: number, line: number): LedgerRow[] {
  const t = story.txns[txn];
  const l = t.lines[line];
  const items = postingsOf([{ date: dateOf(t.day), lines: t.lines }], l.accountId).filter((p) => p.side === l.side);
  // Two lines of one entry may name the same account on the same side (not in this lab's stories): each line then
  // shows its own amount against the same particulars.
  const own = t.lines.filter((x) => x.accountId === l.accountId && x.side === l.side);
  const rows = own.length > 1 ? [{ ...items[0], amount: l.amount }] : items;
  return rows.map((p, k) => ({
    key: `p${txn}.${line}.${k}`,
    date: p.date,
    particulars: `${l.side === 'Dr' ? 'To' : 'By'} ${p.label}`,
    jf: JOURNAL_FOLIO,
    amount: p.amount,
    kind: 'posting' as const,
    txn,
    line,
  }));
}

/** The accounts of a story, written up and balanced, in the order they are first posted to. */
export function ledgerOf(story: PostingStory): TAccount[] {
  const order: string[] = [];
  for (const t of story.txns) for (const l of t.lines) if (!order.includes(l.accountId)) order.push(l.accountId);
  return order.map((accountId, i) => {
    const debit: LedgerRow[] = [];
    const credit: LedgerRow[] = [];
    story.txns.forEach((t, ti) =>
      t.lines.forEach((l, li) => {
        if (l.accountId !== accountId) return;
        (l.side === 'Dr' ? debit : credit).push(...postingsOfLine(story, ti, li));
      }),
    );
    const debitSum = debit.reduce((s, r) => s + r.amount, 0);
    const creditSum = credit.reduce((s, r) => s + r.amount, 0);
    const balance: Balance | null = debitSum === creditSum ? null : { side: debitSum > creditSum ? 'Dr' : 'Cr', amount: Math.abs(debitSum - creditSum) };
    const carriedDown = balance
      ? {
          key: `cd:${accountId}`,
          date: dateOf(CLOSE_DAY),
          particulars: `${opposite(balance.side) === 'Dr' ? 'To' : 'By'} ${BALANCE_CD}`,
          jf: '',
          amount: balance.amount,
          kind: 'cd' as const,
          side: opposite(balance.side),
        }
      : null;
    const broughtDown = balance
      ? { key: `bd:${accountId}`, date: REOPEN_SHORT, particulars: `${balance.side === 'Dr' ? 'To' : 'By'} ${BALANCE_BD}`, jf: '', amount: balance.amount, kind: 'bd' as const, side: balance.side }
      : null;
    return { accountId, title: accountTitle(accountId), folio: i + 1, debit, credit, debitSum, creditSum, balance, carriedDown, total: Math.max(debitSum, creditSum), broughtDown };
  });
}

export interface TrialBalanceRow {
  accountId: string;
  title: string;
  folio: number;
  side: Side;
  amount: Paise;
}

/** The trial balance by the balance method: one row for each account with a balance, in ledger order. */
export function trialBalanceOf(ledger: readonly TAccount[]): { rows: TrialBalanceRow[]; debit: Paise; credit: Paise } {
  const rows = ledger.filter((a) => a.balance).map((a) => ({ accountId: a.accountId, title: a.title, folio: a.folio, side: a.balance!.side, amount: a.balance!.amount }));
  const sum = (s: Side) => rows.filter((r) => r.side === s).reduce((t, r) => t + r.amount, 0);
  return { rows, debit: sum('Dr'), credit: sum('Cr') };
}

// ---------------------------------------------------------------------------------------------------------------
// The steps of the walk-through: every line posted, every account balanced, every balance taken to the trial
// balance, and the totals compared.
// ---------------------------------------------------------------------------------------------------------------

export type PostingStep =
  | { kind: 'post'; txn: number; line: number; accountId: string; side: Side; rows: LedgerRow[]; text: string; reason: string }
  | { kind: 'balance'; accountId: string; text: string }
  | { kind: 'tb'; accountId: string; side: Side | null; amount: Paise; text: string }
  | { kind: 'agree'; debit: Paise; credit: Paise; text: string };

export function postingSteps(story: PostingStory): PostingStep[] {
  const ledger = ledgerOf(story);
  const steps: PostingStep[] = [];
  story.txns.forEach((t, ti) =>
    t.lines.forEach((l, li) => {
      const rows = postingsOfLine(story, ti, li);
      const title = accountTitle(l.accountId);
      const what = rows.map((r) => `"${r.particulars}" ${formatINR(r.amount)}`).join(' and ');
      steps.push({
        kind: 'post',
        txn: ti,
        line: li,
        accountId: l.accountId,
        side: l.side,
        rows,
        text: `${MONTH} ${t.day}: ${title} is ${l.side === 'Dr' ? 'debited' : 'credited'} ${formatINR(l.amount)}, so it is written on the ${sideName(l.side)} side of ${title} as ${what}, naming ${rows.length > 1 ? 'each account on the other side' : 'the other account'} of the entry.`,
        reason: reasonFor(l.accountId, l.side),
      });
    }),
  );
  for (const a of ledger) steps.push({ kind: 'balance', accountId: a.accountId, text: balanceText(a) });
  for (const a of ledger) {
    steps.push(
      a.balance
        ? {
            kind: 'tb',
            accountId: a.accountId,
            side: a.balance.side,
            amount: a.balance.amount,
            text: `${a.title} has a ${sideName(a.balance.side)} balance of ${formatINR(a.balance.amount)} (it is ${kindOf(a.accountId)}), so it goes in the ${sideName(a.balance.side)} column of the trial balance.`,
          }
        : { kind: 'tb', accountId: a.accountId, side: null, amount: 0, text: `${a.title} has no balance, so it is left out of the trial balance.` },
    );
  }
  const tb = trialBalanceOf(ledger);
  steps.push({
    kind: 'agree',
    debit: tb.debit,
    credit: tb.credit,
    text:
      tb.debit === tb.credit
        ? `The debit column totals ${formatINR(tb.debit)} and the credit column ${formatINR(tb.credit)}: the trial balance agrees, because every entry had equal debits and credits.`
        : `The debit column totals ${formatINR(tb.debit)} and the credit column ${formatINR(tb.credit)}: the trial balance does not agree.`,
  });
  return steps;
}

/** How an account is balanced, in words. */
export function balanceText(a: TAccount): string {
  if (!a.balance) {
    return `${a.title}: both sides total ${formatINR(a.total)}, so it has no balance. It is closed by totalling the two sides, and nothing is carried down.`;
  }
  const larger = sideName(a.balance.side);
  const shorter = sideName(opposite(a.balance.side));
  const sides =
    a.debitSum === 0 || a.creditSum === 0
      ? `the ${larger} side adds up to ${formatINR(a.total)} and the ${shorter} side is empty. `
      : `the debit side adds up to ${formatINR(a.debitSum)} and the credit side to ${formatINR(a.creditSum)}. `;
  return (
    `${a.title}: ${sides}` +
    `The difference, ${formatINR(a.balance.amount)}, is written on the shorter ${shorter} side as "${a.carriedDown!.particulars}", so both sides total ${formatINR(a.total)}. ` +
    `It is brought down on ${REOPEN_DATE} on the ${larger} side as "${a.broughtDown!.particulars}": a ${larger} balance.`
  );
}

// ---------------------------------------------------------------------------------------------------------------
// What the picture shows after a number of steps.
// ---------------------------------------------------------------------------------------------------------------

export interface PostingView {
  /** The keys of the ledger rows written so far. */
  rows: ReadonlySet<string>;
  /** The journal lines posted so far (`<txn>.<line>`): their L.F. is filled in. */
  posted: ReadonlySet<string>;
  /** The accounts balanced so far. */
  balanced: ReadonlySet<string>;
  /** The accounts taken to the trial balance so far (with or without a row). */
  listed: ReadonlySet<string>;
  /** The totals of the trial balance are shown. */
  totals: boolean;
}

export function viewAt(steps: readonly PostingStep[], shown: number): PostingView {
  const rows = new Set<string>();
  const posted = new Set<string>();
  const balanced = new Set<string>();
  const listed = new Set<string>();
  let totals = false;
  for (const s of steps.slice(0, shown)) {
    if (s.kind === 'post') {
      for (const r of s.rows) rows.add(r.key);
      posted.add(`${s.txn}.${s.line}`);
    } else if (s.kind === 'balance') balanced.add(s.accountId);
    else if (s.kind === 'tb') listed.add(s.accountId);
    else totals = true;
  }
  return { rows, posted, balanced, listed, totals };
}

/** Everything shown: the sandbox's view of a story, posted, balanced (when asked) and listed. */
export function fullView(steps: readonly PostingStep[], balance: boolean): PostingView {
  const all = viewAt(steps, steps.length);
  return balance ? all : { ...all, balanced: new Set(), listed: new Set(), totals: false };
}
