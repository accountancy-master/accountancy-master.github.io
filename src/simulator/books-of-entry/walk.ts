import {
  BOOK_NAME,
  booksOf,
  dateOf,
  goodsTotals,
  HEAD_NAME,
  inr,
  PETTY_HEADS,
  pettyTotals,
  postingsOfBook,
  taxColumnName,
  taxColumns,
  type BookId,
  type Books,
  type Month,
  type TxRecord,
} from './model';

// ---------------------------------------------------------------------------------------------------------------
// The walk through a month: each transaction sorted into its book (or books), then the month end: the Cash Book
// balanced, and each book totalled and posted to the ledger. A step is told in words in the board's terms.
// ---------------------------------------------------------------------------------------------------------------

export type Step = { kind: 'card'; index: number } | { kind: 'balance' } | { kind: 'post'; book: BookId };

export interface WalkStep {
  step: Step;
  title: string;
  text: string;
  /** The book the picture opens at this step. */
  book: BookId;
}

const NEXT: Record<string, string> = { January: 'February', February: 'March', March: 'April', April: 'May', May: 'June', June: 'July', July: 'August', August: 'September', September: 'October', October: 'November', November: 'December', December: 'January' };
export const reopenDate = (m: Month): string => `1 ${NEXT[m.month]}`;

/** The order of the month-end postings: the goods books, petty cash, the Cash Book, the Journal Proper. */
const POST_ORDER: readonly BookId[] = ['purchases', 'sales', 'purchasesReturn', 'salesReturn', 'petty', 'cash', 'journal'];

/** The books that have something to post. */
export function booksToPost(b: Books): BookId[] {
  return POST_ORDER.filter((id) => {
    if (id === 'cash') return b.cash.view.debit.length + b.cash.view.credit.length > 0;
    if (id === 'petty') return b.petty.rows.length > 0;
    if (id === 'journal') return b.journal.length > 0;
    return b[id].length > 0;
  });
}

export function walkOf(m: Month, records: TxRecord[]): WalkStep[] {
  const books = booksOf(m, records);
  const cards: WalkStep[] = records.map((r) => ({
    step: { kind: 'card', index: r.index },
    title: `${r.date}: ${r.books.map((b) => BOOK_NAME[b]).join(' and ')}`,
    text: `${r.text} ${r.why}`,
    book: r.books[0],
  }));
  return [
    ...cards,
    { step: { kind: 'balance' }, title: `${dateOf(m, m.lastDay)}: the Cash Book balanced`, text: balanceWords(m, books), book: 'cash' },
    ...booksToPost(books).map((b): WalkStep => ({ step: { kind: 'post', book: b }, title: `Posting the ${BOOK_NAME[b]}`, text: postWords(m, records, books, b), book: b })),
  ];
}

/** What the picture shows after `shown` steps of the walk. */
export interface Standing {
  /** Records sorted into their books. */
  cards: number;
  /** The Cash Book is balanced. */
  closed: boolean;
  posted: Set<BookId>;
  /** The book the picture is about. */
  book: BookId | null;
  /** The book being posted just now. */
  posting: BookId | null;
}

export function standingAfter(walk: readonly WalkStep[], shown: number): Standing {
  const done = walk.slice(0, shown);
  const cards = done.filter((s) => s.step.kind === 'card').length;
  const posted = new Set(done.flatMap((s) => (s.step.kind === 'post' ? [s.step.book] : [])));
  const last = done.at(-1);
  return {
    cards,
    closed: done.some((s) => s.step.kind === 'balance'),
    posted,
    book: last?.book ?? null,
    posting: last?.step.kind === 'post' ? last.step.book : null,
  };
}

/** The balances of the two columns of the Cash Book, in words. */
export function balanceWords(m: Month, books: Books): string {
  const v = books.cash.view;
  const end = dateOf(m, m.lastDay);
  const next = reopenDate(m);
  const cash = v.cash ? `The cash column: its debit side (the opening balance and the receipts) totals ${inr(v.totals.cash)} against ${inr(v.totals.cash - v.cash.amount)} of payments, so ${inr(v.cash.amount)} is in hand: "By Balance c/d" on the credit side, brought down on ${next} as "To Balance b/d".` : 'The cash column has nothing left in it.';
  const bank = !v.bank
    ? ' The bank column has no balance.'
    : v.bank.side === 'Dr'
      ? ` The bank column: a balance at the bank of ${inr(v.bank.amount)}, carried down on the credit side in the same way.`
      : ` The bank column: payments are larger than receipts, so the bank has lent the difference, an overdraft of ${inr(v.bank.amount)}. It is carried down on the debit side ("To Balance c/d") and brought down on the credit side ("By Balance b/d").`;
  return `On ${end} each column is totalled. ${cash}${bank} Both sides then total the same in each column.`;
}

function postWords(m: Month, records: TxRecord[], books: Books, b: BookId): string {
  const end = dateOf(m, m.lastDay);
  if (b === 'cash') {
    const lines = postingsOfBook(m, records, 'cash');
    const contras = lines.filter((l) => l.contra).length;
    return `The Cash Book is itself the Cash Account and the Bank Account, so only the other account of each row is posted: a receipt ("To Sales A/c") to the credit of that account ("By Cash A/c" or "By Bank A/c"), a payment to its debit.${contras ? ` The ${contras === 1 ? 'contra entry, marked "C", is not posted at all: both of its sides are' : `${contras} contra entries, marked "C", are not posted at all: both sides of each are`} already in the Cash Book.` : ''} The balances brought down are not posted.`;
  }
  if (b === 'journal') {
    return `Each entry of the Journal Proper is posted to both of its accounts, the debit to the debit side and the credit to the credit side, each naming the other account of the entry.`;
  }
  if (b === 'petty') {
    const t = pettyTotals(books.petty);
    const heads = PETTY_HEADS.filter((h) => t.byHead[h] > 0);
    return `On ${end} the analysis columns are totalled: ${heads.map((h) => `${HEAD_NAME[h]} ${inr(t.byHead[h])}`).join(', ')}, together ${inr(t.paid)}, the same as the Total column. Each column total is debited to its expense account ("To Petty Cash A/c") and Petty Cash A/c is credited with ${heads.length > 1 ? 'each of them' : 'it'} ("By ${HEAD_NAME[heads[0]]} A/c"${heads.length > 1 ? ' and so on' : ''}), ${inr(t.paid)} in all: one posting a month instead of one for each voucher.`;
  }
  const rows = books[b];
  const t = goodsTotals(rows);
  const purchasesSide = b === 'purchases' || b === 'purchasesReturn';
  const account = { purchases: 'Purchases A/c', sales: 'Sales A/c', purchasesReturn: 'Purchases Return A/c', salesReturn: 'Sales Return A/c' }[b];
  const side = b === 'purchases' || b === 'salesReturn' ? 'debit' : 'credit';
  const partySide = side === 'debit' ? 'credited' : 'debited';
  const who = purchasesSide ? 'supplier' : 'customer';
  const taxes = taxColumns(m.gst);
  const input = purchasesSide;
  const tax = taxes.length ? ` The ${taxes.map((c) => taxColumnName(c, input)).join(' and ')} column${taxes.length > 1 ? 's go' : ' goes'} to the ${side} of ${taxes.length > 1 ? 'their own accounts' : 'its own account'} (${taxes.map((c) => `${taxColumnName(c, input)} ${inr(t[c])}`).join(', ')}).` : '';
  return `Each ${who} was ${partySide} on the day with its own ${b === 'purchases' || b === 'sales' ? 'invoice' : 'note'}${taxes.length ? ' total' : ''} (${rows.map((r) => `${r.party} ${inr(r.invoice.total)}`).join(', ')}). On ${end} the ${taxes.length ? 'taxable value column' : 'book'} is totalled, ${inr(t.taxable)}, and posted once to the ${side} of ${account}: "${side === 'debit' ? 'To' : 'By'} Sundries as per ${BOOK_NAME[b]}".${tax}`;
}
