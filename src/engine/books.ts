import { isParty, resolveAccount, type Side } from './accounts';
import type { JournalLine } from './journal';
import { formatINR, type Paise } from './money';

/**
 * The balances of a set of books: for each account, debits less credits in paise (so a debit balance is positive
 * and a credit balance negative). Accounts appear in the order they were first posted to.
 */
export type Ledger = Map<string, Paise>;

/** Posts entries (each a list of journal lines) to a ledger, on top of `opening` when given. */
export function post(entries: JournalLine[][], opening?: Ledger): Ledger {
  const ledger: Ledger = new Map(opening);
  for (const line of entries.flat()) {
    ledger.set(line.accountId, (ledger.get(line.accountId) ?? 0) + (line.side === 'Dr' ? line.amount : -line.amount));
  }
  return ledger;
}

export interface Balance {
  side: Side;
  amount: Paise;
}

/** The balance of one account, or null when the account is not in the ledger or its two sides are equal. */
export function balanceOf(ledger: Ledger, accountId: string): Balance | null {
  const net = ledger.get(accountId) ?? 0;
  return net === 0 ? null : { side: net > 0 ? 'Dr' : 'Cr', amount: Math.abs(net) };
}

/** The name an account goes by in a list: "Cash A/c", and for a party (a debtor, a creditor, a vendor) its own name. */
export function accountLabel(accountId: string): string {
  const account = resolveAccount(accountId);
  return isParty(accountId) ? account.name : `${account.name} A/c`;
}

export interface TrialBalanceRow extends Balance {
  accountId: string;
  label: string;
}

export interface TrialBalance {
  /** One row per account with a balance, in ledger order. */
  rows: TrialBalanceRow[];
  debitTotal: Paise;
  creditTotal: Paise;
}

/** The trial balance of a ledger. For entries that each balance, the two totals are equal. */
export function trialBalance(ledger: Ledger): TrialBalance {
  const rows: TrialBalanceRow[] = [];
  for (const accountId of ledger.keys()) {
    const balance = balanceOf(ledger, accountId);
    if (balance) rows.push({ accountId, label: accountLabel(accountId), ...balance });
  }
  const total = (side: Side) => rows.filter((r) => r.side === side).reduce((sum, r) => sum + r.amount, 0);
  return { rows, debitTotal: total('Dr'), creditTotal: total('Cr') };
}

/** Balances written one per line for a question: "Cash A/c: ₹12,000 (Dr)". */
export const listBalances = (rows: { label: string; side: Side; amount: Paise }[]): string =>
  rows.map((r) => `${r.label}: ${formatINR(r.amount)} (${r.side})`).join('\n');

// ---------------------------------------------------------------------------------------------------------------
// One account written up from dated entries: its postings, its balance carried down, and the cash book.
// ---------------------------------------------------------------------------------------------------------------

/** A journal entry with its date ("5 April"), as a ledger account shows it beside every posting. */
export interface DatedEntry {
  date: string;
  lines: JournalLine[];
}

/** What stands in the Particulars when an entry has several accounts on both sides and no one of them answers this one. */
export const SUNDRIES = 'Sundries';
export const BALANCE_BD = 'Balance b/d';
export const BALANCE_CD = 'Balance c/d';

/** The name an account goes by in the Particulars of a ledger account: "Cash A/c", "Rao & Co. A/c". */
export const ledgerLabel = (accountId: string): string => `${resolveAccount(accountId).name} A/c`;

/** One item of a ledger account: on the side the account was posted on, the opposite account as its particulars. */
export interface Posting {
  date: string;
  /** The side of the account the item is written on. */
  side: Side;
  /** The opposite account or accounts of the entry; none for a balance. */
  accountIds: string[];
  /** The particulars without "To" or "By": "Sales A/c", "Sundries", "Balance b/d". */
  label: string;
  amount: Paise;
}

/**
 * The postings of one account from a list of dated entries, in their order. An entry that does not name the account
 * gives none. In a compound entry the account shows one item for each account on the opposite side when it is alone
 * on its own side (a customer settling at a discount: "By Cash A/c" and "By Discount Allowed A/c"), and one item for
 * its own amount when the opposite side has a single account (Cash A/c in the same entry: "To <customer> A/c" for
 * the cash alone). When both sides have several accounts the item reads "Sundries". `labelOf` names an account in
 * the particulars (`ledgerLabel` unless given).
 */
export function postingsOf(entries: readonly DatedEntry[], accountId: string, labelOf: (accountId: string) => string = ledgerLabel): Posting[] {
  const out: Posting[] = [];
  for (const { date, lines } of entries) {
    for (const side of ['Dr', 'Cr'] as const) {
      const sameSide = lines.filter((l) => l.side === side);
      const own = sameSide.filter((l) => l.accountId === accountId);
      if (own.length === 0) continue;
      const amount = own.reduce((sum, l) => sum + l.amount, 0);
      const opposite = lines.filter((l) => l.side !== side);
      if (own.length === sameSide.length && opposite.length > 0) {
        for (const l of opposite) out.push({ date, side, accountIds: [l.accountId], label: labelOf(l.accountId), amount: l.amount });
      } else if (opposite.length === 1) {
        out.push({ date, side, accountIds: [opposite[0].accountId], label: labelOf(opposite[0].accountId), amount });
      } else {
        out.push({ date, side, accountIds: opposite.map((l) => l.accountId), label: SUNDRIES, amount });
      }
    }
  }
  return out;
}

/** A balance an account opens the period with, and the day it is brought down on ("1 April"). */
export interface OpeningBalance extends Balance {
  date: string;
}

const sumOf = <T>(items: readonly T[], amount: (item: T) => Paise): Paise => items.reduce((sum, item) => sum + amount(item), 0);
/** The balance two side totals leave (null when they are equal), and what each side totals once it is carried down. */
const closeOff = (dr: Paise, cr: Paise): { balance: Balance | null; total: Paise } => ({
  balance: dr === cr ? null : { side: dr > cr ? 'Dr' : 'Cr', amount: Math.abs(dr - cr) },
  total: Math.max(dr, cr),
});

export interface AccountView {
  accountId: string;
  /** The items of each side in date order, the opening balance (as "Balance b/d") first on its side. */
  debit: Posting[];
  credit: Posting[];
  /** The balance of the account, on the side that is larger; null when the two sides are equal. */
  balance: Balance | null;
  /** What each side totals once the balance is carried down on the shorter side. */
  total: Paise;
}

/**
 * One account written up: its opening balance and its postings on their sides, and its balance. The balance is
 * carried down on the side opposite to `balance.side` ("By Balance c/d" for a debit balance) and brought down on
 * `balance.side` the next day.
 */
export function accountOf(
  entries: readonly DatedEntry[],
  accountId: string,
  opening?: OpeningBalance | null,
  labelOf?: (accountId: string) => string,
): AccountView {
  const items: Posting[] = [
    ...(opening ? [{ date: opening.date, side: opening.side, accountIds: [], label: BALANCE_BD, amount: opening.amount }] : []),
    ...postingsOf(entries, accountId, labelOf),
  ];
  const debit = items.filter((p) => p.side === 'Dr');
  const credit = items.filter((p) => p.side === 'Cr');
  return { accountId, debit, credit, ...closeOff(sumOf(debit, (p) => p.amount), sumOf(credit, (p) => p.amount)) };
}

/** One row of a cash book with cash and bank columns: a receipt on the debit side, a payment on the credit side. */
export interface CashBookRow {
  date: string;
  side: Side;
  accountIds: string[];
  label: string;
  /** The amount in each column, in paise; 0 where the row leaves the column blank. */
  cash: Paise;
  bank: Paise;
  /** A contra entry: cash paid into the bank or drawn from it, which is on both sides of the book. */
  contra?: true;
}

export interface CashBookView {
  debit: CashBookRow[];
  credit: CashBookRow[];
  /** The balance of each column; a credit bank balance is an overdraft. Null for a column whose sides are equal. */
  cash: Balance | null;
  bank: Balance | null;
  /** What each column totals on either side once its balance is carried down. */
  totals: { cash: Paise; bank: Paise };
}

/**
 * The cash book with cash and bank columns from dated entries: every line of Cash A/c or Bank A/c is a row on its
 * side, with the opposite account as its particulars and its amount in its column. An entry between the two (cash
 * paid into the bank, cash drawn for office use) is a contra entry and is marked so on both sides. An entry that
 * names neither gives nothing. `opening` gives the balances the book starts with; a negative bank balance is an
 * overdraft and opens on the credit side. For a single-column cash book read the `cash` amounts alone.
 */
export function cashBook(
  entries: readonly DatedEntry[],
  opening?: { date: string; cash?: Paise; bank?: Paise } | null,
  labelOf: (accountId: string) => string = ledgerLabel,
): CashBookView {
  const rows: CashBookRow[] = [];
  if (opening) {
    const { date, cash = 0, bank = 0 } = opening;
    const row = (side: Side, c: Paise, b: Paise) => rows.push({ date, side, accountIds: [], label: BALANCE_BD, cash: c, bank: b });
    if (cash > 0 || bank > 0) row('Dr', Math.max(0, cash), Math.max(0, bank));
    if (cash < 0 || bank < 0) row('Cr', Math.max(0, -cash), Math.max(0, -bank));
  }
  // Entry by entry, so that the rows of each side stay in the order of the entries.
  for (const entry of entries) {
    for (const column of ['cash', 'bank'] as const) {
      for (const p of postingsOf([entry], column, labelOf)) {
        const contra = p.accountIds.length === 1 && (p.accountIds[0] === 'cash' || p.accountIds[0] === 'bank');
        const amounts = column === 'cash' ? { cash: p.amount, bank: 0 } : { cash: 0, bank: p.amount };
        rows.push({ date: p.date, side: p.side, accountIds: p.accountIds, label: p.label, ...amounts, ...(contra ? { contra: true as const } : {}) });
      }
    }
  }
  const debit = rows.filter((r) => r.side === 'Dr');
  const credit = rows.filter((r) => r.side === 'Cr');
  const cash = closeOff(sumOf(debit, (r) => r.cash), sumOf(credit, (r) => r.cash));
  const bank = closeOff(sumOf(debit, (r) => r.bank), sumOf(credit, (r) => r.bank));
  return { debit, credit, cash: cash.balance, bank: bank.balance, totals: { cash: cash.total, bank: bank.total } };
}

// ---------------------------------------------------------------------------------------------------------------
// Several accounts written side by side in columns: partners' capital accounts, or their current accounts.
// ---------------------------------------------------------------------------------------------------------------

/** What a partner's own account is called in the particulars of accounts written in columns, where the name is the column. */
const FAMILY_LABEL: Record<string, string> = {
  capital: 'Capital A/c',
  current: 'Current A/c',
  drawings: 'Drawings A/c',
  partnerLoan: 'Loan A/c',
  executor: "Executor's A/c",
};

/**
 * The name an account goes by in the particulars of partners' accounts written in columns. A partner's own account
 * loses the partner's name there ("To Drawings A/c", with an amount in each partner's column); every other account
 * is named as in any ledger account.
 */
export function columnLabel(accountId: string): string {
  const family = accountId.slice(0, Math.max(0, accountId.indexOf(':')));
  return Object.hasOwn(FAMILY_LABEL, family) ? FAMILY_LABEL[family] : ledgerLabel(accountId);
}

/** One row of accounts written in columns: an amount in the column of every account it is posted to, 0 in the others. */
export interface ColumnarRow {
  date: string;
  side: Side;
  /** The particulars without "To" or "By". */
  label: string;
  amounts: Paise[];
}

export interface ColumnarView {
  accountIds: string[];
  debit: ColumnarRow[];
  credit: ColumnarRow[];
  /** The balance of each account, on the side that is larger; null for one whose two sides are equal. */
  balances: (Balance | null)[];
  /** What each column totals on either side once its balance is carried down. */
  totals: Paise[];
}

/**
 * Several accounts written up side by side, a column for each, from dated entries: the capital accounts of the
 * partners of a firm (`columnarAccount(entries, [partnerCapital('Asha'), partnerCapital('Bimal')])`), or their current
 * accounts. Every posting of an account (see `postingsOf`) is an amount in its column, and postings of one day with
 * the same particulars on the same side share a row, so drawings by each partner are one row, "To Drawings A/c". A
 * second posting of the same account under the same particulars on the same day starts a row of its own. `opening`
 * gives the balance each account opens with (null for none), in the order of `accountIds`. `labelOf` names an
 * account in the particulars (`columnLabel` unless given).
 */
export function columnarAccount(
  entries: readonly DatedEntry[],
  accountIds: readonly string[],
  opening?: { date: string; balances: readonly (Balance | null)[] } | null,
  labelOf: (accountId: string) => string = columnLabel,
): ColumnarView {
  const n = accountIds.length;
  const rows: ColumnarRow[] = [];
  const blank = (): Paise[] => Array.from({ length: n }, () => 0);
  if (opening) {
    for (const side of ['Dr', 'Cr'] as const) {
      const amounts = accountIds.map((_, c) => (opening.balances[c]?.side === side ? opening.balances[c]!.amount : 0));
      if (amounts.some((a) => a > 0)) rows.push({ date: opening.date, side, label: BALANCE_BD, amounts });
    }
  }
  // Entry by entry, so that the rows of each side stay in the order of the entries.
  for (const entry of entries) {
    accountIds.forEach((accountId, c) => {
      for (const p of postingsOf([entry], accountId, labelOf)) {
        const open = rows.findLast((r) => r.date === p.date && r.side === p.side && r.label === p.label && r.label !== BALANCE_BD && r.amounts[c] === 0);
        if (open) open.amounts[c] = p.amount;
        else rows.push({ date: p.date, side: p.side, label: p.label, amounts: blank().map((_, k) => (k === c ? p.amount : 0)) });
      }
    });
  }
  const debit = rows.filter((r) => r.side === 'Dr');
  const credit = rows.filter((r) => r.side === 'Cr');
  const closed = accountIds.map((_, c) => closeOff(sumOf(debit, (r) => r.amounts[c]), sumOf(credit, (r) => r.amounts[c])));
  return { accountIds: [...accountIds], debit, credit, balances: closed.map((x) => x.balance), totals: closed.map((x) => x.total) };
}
