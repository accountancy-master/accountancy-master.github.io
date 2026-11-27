import type { KitAnswer, KitAsk, KitChoice } from '@/components/simulator/labs/kit/answers';
import { createRng, type Rng } from '@/engine/rng';
import type { Paise } from '@/engine/money';
import { randomMonth } from './examples';
import {
  BOOK_NAME,
  BOOK_ORDER,
  BOOK_TAKES,
  booksOf,
  dateOf,
  goodsTotals,
  inr,
  isGoodsBook,
  ledgerName,
  postingsOfBook,
  recordsOf,
  taxColumnName,
  taxColumns,
  type BookId,
  type Month,
  type PostLine,
  type TxRecord,
} from './model';
import { booksToPost, walkOf, type WalkStep } from './walk';

// ---------------------------------------------------------------------------------------------------------------
// "Try it": quick questions on the picture of a month. The picture stands at `shown` steps of the walk while the
// question is open and moves on to `reveal` once it is answered. Nothing is recorded.
// ---------------------------------------------------------------------------------------------------------------

export const BOE_ASK_KINDS = ['which-book', 'cash-balance', 'book-total', 'posting'] as const;
export type BoeAskKind = (typeof BOE_ASK_KINDS)[number];

export const BOE_ASK_LABEL: Record<BoeAskKind, string> = {
  'which-book': 'Which book?',
  'cash-balance': "The cash book's closing balance",
  'book-total': "What a book's total posts",
  posting: 'Where a row is posted',
};

export interface BoeAsk extends KitAsk {
  kind: BoeAskKind;
  month: Month;
  /** Steps of the walk shown while the question is open, and once it is answered. */
  shown: number;
  reveal: number;
  /** The book the picture opens at. */
  book: BookId;
}

/** The generator of a question: the same seed, kind and number always give the same question. */
export const askRng = (seed: number, kind: BoeAskKind, n: number): Rng => createRng(seed * 7919 + BOE_ASK_KINDS.indexOf(kind) * 104729 + n * 31);

export function boeAsk(kind: BoeAskKind, rng: Rng): BoeAsk {
  const m = randomMonth(rng);
  const records = recordsOf(m);
  const walk = walkOf(m, records);
  switch (kind) {
    case 'which-book':
      return whichBook(rng, m, records);
    case 'cash-balance':
      return cashBalance(rng, m, records);
    case 'book-total':
      return bookTotal(rng, m, records, walk);
    case 'posting':
      return posting(rng, m, records, walk);
  }
}

/** Distinct wrong figures, each with its slip; those equal to the answer or to each other are dropped. */
function mistakesOf(answer: Paise, list: [Paise, string][]): { value: Paise; why: string }[] {
  const seen = new Set([answer]);
  const out: { value: Paise; why: string }[] = [];
  for (const [value, why] of list) {
    if (value > 0 && !seen.has(value)) {
      seen.add(value);
      out.push({ value, why });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Which book?
// ---------------------------------------------------------------------------------------------------------------

const TWO = 'cash+journal';

function whichBook(rng: Rng, m: Month, records: TxRecord[]): BoeAsk {
  // The imprest and the reimbursement are left out: the petty cashier also writes them, in the receipts column.
  const pool = records.filter((r) => r.tx.kind !== 'imprest' && r.tx.kind !== 'reimburse');
  // Lean towards the look-alikes: assets on credit, contra entries, settlements at a discount, returns, goods taken.
  const tricky = pool.filter((r) => ['assetCredit', 'assetPaid', 'deposit', 'withdraw', 'drawings', 'goodsDrawings', 'badDebt', 'purchaseReturn', 'salesReturn'].includes(r.tx.kind) || r.books.length > 1);
  const r = tricky.length > 0 && rng.next() < 0.6 ? rng.pick(tricky) : rng.pick(pool);
  const correct = r.books.join('+');
  const options: KitChoice[] = [
    ...BOOK_ORDER.map((b) => ({ id: b, text: BOOK_NAME[b], why: r.traps[b] ?? `The ${BOOK_NAME[b]} takes: ${BOOK_TAKES[b].toLowerCase()}.` })),
    { id: TWO, text: 'Cash Book and Journal Proper', why: 'Only a settlement at a cash discount needs the two books: the money in one, the discount in the other.' },
  ];
  return {
    kind: 'which-book',
    month: m,
    prompt: `${m.firm}, ${r.date}${m.gst.rate ? ` (GST ${m.gst.intra ? 'within the state' : 'with another state'})` : ''}: ${r.text} In which book is it first recorded?`,
    answer: { type: 'choice', options: options.map((o) => (o.id === correct ? { id: o.id, text: o.text } : o)), correct },
    reason: r.why,
    shown: r.index,
    reveal: r.index + 1,
    book: r.books[0],
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The cash book's closing balance
// ---------------------------------------------------------------------------------------------------------------

/** The balance of a column from the records, with some slips made on purpose. */
function columnBalance(m: Month, records: TxRecord[], column: 'cash' | 'bank', slip: 'none' | 'noOpening' | 'contraBackwards' | 'withDiscount'): Paise {
  let bal = slip === 'noOpening' ? 0 : m.opening[column];
  for (const r of records) {
    for (const p of r.parts) {
      if (p.book !== 'cash') continue;
      const contra = p.lines.length === 2 && p.lines.every((l) => l.accountId === 'cash' || l.accountId === 'bank');
      for (const l of p.lines) {
        if (l.accountId !== column) continue;
        let x = l.side === 'Dr' ? l.amount : -l.amount;
        if (slip === 'contraBackwards' && contra) x = -x;
        if (slip === 'withDiscount' && (r.tx.kind === 'received' || r.tx.kind === 'paid') && r.tx.due) x = Math.sign(x) * r.tx.due;
        bal += x;
      }
    }
  }
  return bal;
}

function cashBalance(rng: Rng, m: Month, records: TxRecord[]): BoeAsk {
  // A column with something left in it: the bank more often, as it can close either way.
  const first: 'cash' | 'bank' = rng.next() < 0.6 ? 'bank' : 'cash';
  const column: 'cash' | 'bank' = columnBalance(m, records, first, 'none') !== 0 ? first : first === 'bank' ? 'cash' : 'bank';
  const right = columnBalance(m, records, column, 'none');
  const end = dateOf(m, m.lastDay);
  const word = (x: Paise) => (x < 0 ? 'od' : 'dr');
  const answer: KitAnswer = {
    type: 'number',
    value: Math.abs(right),
    mistakes: mistakesOf(Math.abs(right), [
      [Math.abs(columnBalance(m, records, column, 'noOpening')), 'Left out the opening balance, "To Balance b/d" (or "By Balance b/d" for an overdraft).'],
      [Math.abs(columnBalance(m, records, column, 'contraBackwards')), 'Turned the contra entries round: cash paid into the bank is a debit in the bank column and a credit in the cash column.'],
      [Math.abs(columnBalance(m, records, column, 'withDiscount')), 'Entered the amount due where an account was settled at a discount: the Cash Book takes only the money that moved.'],
    ]),
    ...(column === 'bank'
      ? {
          tag: {
            label: 'A balance at the bank or an overdraft?',
            options: [
              { id: 'dr', text: 'Balance at the bank', why: 'The credit side (payments) is the larger: the bank has paid out more than was in the account.' },
              { id: 'od', text: 'Overdraft', why: 'The debit side (receipts) is the larger: there is money at the bank.' },
            ],
            correct: word(right),
          },
        }
      : {}),
  };
  const v = booksOf(m, records).cash.view;
  const total = column === 'cash' ? v.totals.cash : v.totals.bank;
  const other = total - Math.abs(right);
  return {
    kind: 'cash-balance',
    month: m,
    prompt: `${m.firm} keeps a Cash Book with cash and bank columns. Its month is written up below, not yet balanced. What balance is carried down in the ${column} column on ${end}?`,
    answer,
    reason:
      column === 'cash'
        ? `The cash column totals ${inr(total)} on its debit side and ${inr(other)} on its credit side: ${inr(Math.abs(right))} is in hand, written on the credit side as "By Balance c/d".`
        : right >= 0
          ? `The bank column totals ${inr(total)} on its debit side and ${inr(other)} on its credit side: a balance at the bank of ${inr(right)}, written on the credit side as "By Balance c/d".`
          : `The bank column totals ${inr(other)} on its debit side and ${inr(total)} on its credit side: the payments are larger, an overdraft of ${inr(-right)}, written on the debit side as "To Balance c/d".`,
    shown: records.length,
    reveal: records.length + 1,
    book: 'cash',
  };
}

// ---------------------------------------------------------------------------------------------------------------
// What a book's total posts
// ---------------------------------------------------------------------------------------------------------------

const TOTAL_ACCOUNT = { purchases: 'Purchases A/c', sales: 'Sales A/c', purchasesReturn: 'Purchases Return A/c', salesReturn: 'Sales Return A/c' } as const;
const TOTAL_SIDE = { purchases: 'debit', sales: 'credit', purchasesReturn: 'credit', salesReturn: 'debit' } as const;

function bookTotal(rng: Rng, m: Month, records: TxRecord[], walk: WalkStep[]): BoeAsk {
  const books = booksOf(m, records);
  const goods = (['purchases', 'sales', 'purchasesReturn', 'salesReturn'] as const).filter((b) => books[b].length > 0);
  const b = rng.pick(goods);
  const t = goodsTotals(books[b]);
  const listTotal = books[b].reduce((s, r) => s + r.invoice.list, 0);
  // The goods dealt in for cash or by cheque in the month, which a careless total takes in as well.
  const cashGoods = records.filter((r) => (b === 'purchases' && r.tx.kind === 'cashPurchase') || (b === 'sales' && r.tx.kind === 'cashSale')).reduce((s, r) => s + ('amount' in r.tx ? r.tx.amount : 0), 0);
  const asset = b === 'purchases' ? records.filter((r) => r.tx.kind === 'assetCredit').reduce((s, r) => s + ('amount' in r.tx ? r.tx.amount : 0), 0) : 0;
  const taxes = taxColumns(m.gst);
  const at = walk.findIndex((s) => s.step.kind === 'post' && s.step.book === b);
  const tax = t.total - t.taxable;
  return {
    kind: 'book-total',
    month: m,
    prompt: `At the end of ${m.month}, what is posted to the ${TOTAL_SIDE[b]} side of ${TOTAL_ACCOUNT[b]} from the ${BOOK_NAME[b]} of ${m.firm}?`,
    answer: {
      type: 'number',
      value: t.taxable,
      mistakes: mistakesOf(t.taxable, [
        [t.total, `Posted the Total column, GST and all: the ${taxes.map((c) => taxColumnName(c, b === 'purchases' || b === 'purchasesReturn')).join(' and ')} go${taxes.length > 1 ? '' : 'es'} to ${taxes.length > 1 ? 'their own accounts' : 'its own account'}.`],
        [listTotal, 'Added the list prices: trade discount is taken off before an invoice or a note is entered, and never recorded.'],
        [t.taxable + cashGoods, `Took in the goods ${b === 'purchases' ? 'bought' : 'sold'} for cash or by cheque: they are in the Cash Book, not this book.`],
        [t.taxable + asset, 'Took in the asset bought on credit: an asset for use goes through the Journal Proper.'],
        [t.taxable - (books[b][0]?.invoice.taxable ?? 0), 'Left out a row of the book.'],
      ]),
    },
    reason: `The ${taxes.length ? 'taxable value column' : 'book'} adds up to ${books[b].length > 1 ? `${books[b].map((r) => inr(r.invoice.taxable)).join(' + ')} = ` : ''}${inr(t.taxable)}, posted once to the ${TOTAL_SIDE[b]} of ${TOTAL_ACCOUNT[b]} ("${TOTAL_SIDE[b] === 'debit' ? 'To' : 'By'} Sundries as per ${BOOK_NAME[b]}").${tax ? ` The tax, ${inr(tax)}, goes to the GST account${taxes.length > 1 ? 's' : ''}, and each party is posted with its own row on the day.` : ' Each party is posted with its own row on the day.'}`,
    shown: Math.max(records.length + 1, at),
    reveal: at + 1,
    book: b,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Where a row is posted
// ---------------------------------------------------------------------------------------------------------------

const sideName = (s: 'Dr' | 'Cr') => (s === 'Dr' ? 'Debit' : 'Credit');
/** A sentence quoted inside another: its first letter lowered, the names in it kept as they are. */
const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const optionId = (accountId: string, side: 'Dr' | 'Cr') => `${accountId}|${side}`;

function posting(rng: Rng, m: Month, records: TxRecord[], walk: WalkStep[]): BoeAsk {
  const books = booksOf(m, records);
  const b = rng.pick(booksToPost(books).filter((x) => x !== 'petty'));
  const lines = postingsOfBook(m, records, b);
  // One question for each row or total: its first posting line stands for it.
  const groups = new Map<string, PostLine[]>();
  for (const l of lines) {
    const key = `${l.from}|${l.total}|${l.contra ? 'c' : ''}|${b === 'journal' || b === 'cash' ? l.date : ''}`;
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  const all = [...groups.values()];
  // In the Cash Book a contra entry now and then; elsewhere any row.
  const pick = rng.pick(all);
  const at = walk.findIndex((s) => s.step.kind === 'post' && s.step.book === b);
  const base = { kind: 'posting' as const, month: m, shown: Math.max(records.length + 1, at), reveal: at + 1, book: b };
  const none = 'none';
  if (pick[0].contra) {
    const r = records.find((x) => x.text === pick[0].from)!;
    const dep = r.tx.kind === 'deposit';
    return {
      ...base,
      prompt: `The Cash Book of ${m.firm} shows on ${r.date} "${dep ? 'To Cash A/c' : 'To Bank A/c'}" ${inr(pick[0].amount)} in the ${dep ? 'bank' : 'cash'} column and "${dep ? 'By Bank A/c' : 'By Cash A/c'}" in the ${dep ? 'cash' : 'bank'} column, marked "C". Where is it posted in the ledger?`,
      answer: {
        type: 'choice',
        correct: none,
        options: [
          { id: optionId('bank', 'Dr'), text: 'Debit of Bank A/c', why: 'The Cash Book is itself the Bank Account: nothing is posted to another one.' },
          { id: optionId('cash', 'Cr'), text: 'Credit of Cash A/c', why: 'The Cash Book is itself the Cash Account: nothing is posted to another one.' },
          { id: optionId('drawings', 'Dr'), text: 'Debit of Drawings A/c', why: 'The money stays in the business: cash has only moved between the office and the bank.' },
          { id: none, text: 'Nowhere: a contra entry is not posted' },
        ],
      },
      reason: `${r.why}`,
    };
  }
  const main = pick[0];
  let prompt: string;
  if (b === 'cash') {
    const r = records.find((x) => x.text === main.from)!;
    const part = r.parts.find((p) => p.book === 'cash')!;
    const column = part.lines.some((l) => l.accountId === 'cash') ? 'cash' : 'bank';
    const bookSide = main.side === 'Dr' ? 'Cr' : 'Dr';
    prompt = `The Cash Book of ${m.firm} shows on ${r.date} "${bookSide === 'Dr' ? 'To' : 'By'} ${ledgerName(main.accountId)}" ${inr(main.amount)} in the ${column} column (${lowerFirst(r.text.replace(/\.$/, ''))}). Where is it posted in the ledger?`;
  } else if (b === 'journal') {
    const r = records.find((x) => x.parts.some((p) => p.narration === main.from))!;
    prompt = `The Journal Proper of ${m.firm} has this entry on ${r.date}: ${r.parts.find((p) => p.narration === main.from)!.lines.map((l) => (l.side === 'Dr' ? `${ledgerName(l.accountId)} Dr ${inr(l.amount)}` : `To ${ledgerName(l.accountId)} ${inr(l.amount)}`)).join('; ')} (${lowerFirst(main.from)}). Where is the ${inr(main.amount)} of ${ledgerName(main.accountId)} posted?`;
  } else if (main.total) {
    prompt = `At the end of ${m.month} the ${BOOK_NAME[b]} of ${m.firm} is totalled: the ${taxColumns(m.gst).length ? 'taxable value column' : 'book'} comes to ${inr(main.amount)}. Where is that total posted?`;
  } else {
    const sum = pick.reduce((s, l) => s + l.amount, 0);
    prompt = `The ${BOOK_NAME[b]} of ${m.firm} has a row for ${main.from}, ${inr(sum)}. Where is that row posted?`;
  }
  // The wrong places: the same account on the other side, and the other accounts of the entry on either side.
  const entryAccounts = new Set<string>([main.accountId]);
  for (const l of lines) if (l.from === main.from && l.accountId !== main.accountId) entryAccounts.add(l.accountId);
  if (b === 'cash') {
    const r = records.find((x) => x.text === main.from)!;
    for (const l of r.parts.find((p) => p.book === 'cash')!.lines) entryAccounts.add(l.accountId);
  }
  if (isGoodsBook(b) && !main.total) {
    const total = lines.find((l) => l.total);
    if (total) entryAccounts.add(total.accountId);
  }
  if (isGoodsBook(b) && main.total) {
    const party = lines.find((l) => !l.total);
    if (party) entryAccounts.add(party.accountId);
  }
  // The items of this one account (a party posted from a row with GST gets one for each account of the row).
  const own = pick.filter((l) => l.accountId === main.accountId);
  const options: KitChoice[] = [{ id: optionId(main.accountId, main.side), text: `${sideName(main.side)} of ${ledgerName(main.accountId)}` }];
  const other: 'Dr' | 'Cr' = main.side === 'Dr' ? 'Cr' : 'Dr';
  options.push({ id: optionId(main.accountId, other), text: `${sideName(other)} of ${ledgerName(main.accountId)}`, why: `Posted on the wrong side: ${ledgerName(main.accountId)} is ${main.side === 'Dr' ? 'debited' : 'credited'} here.` });
  for (const id of entryAccounts) {
    if (id === main.accountId || options.length >= 4) continue;
    const s: 'Dr' | 'Cr' = rng.next() < 0.5 ? 'Dr' : 'Cr';
    const why =
      id === 'cash' || id === 'bank'
        ? `The Cash Book is itself the ${id === 'cash' ? 'Cash' : 'Bank'} Account: the other account of the row is the one posted.`
        : /GST$/.test(id) && isGoodsBook(b)
          ? `${ledgerName(id)} takes the total of its own tax column at the month end, not the ${main.total ? 'taxable value' : 'row'}.`
          : isGoodsBook(b) && main.total
          ? `${ledgerName(id)} is posted with its own row on the day, not with the total.`
          : isGoodsBook(b)
            ? `${ledgerName(id)} gets the total of the book at the month end, not each row.`
            : `${ledgerName(id)} is the other account of the entry.`;
    options.push({ id: optionId(id, s), text: `${sideName(s)} of ${ledgerName(id)}`, why });
  }
  if (options.length < 4) options.push({ id: none, text: 'Nowhere: it needs no posting', why: 'Only a contra entry and the balances brought down are left unposted.' });
  return {
    ...base,
    prompt,
    answer: { type: 'choice', correct: options[0].id, options: rng.shuffle(options) },
    reason:
      b === 'cash'
        ? `The Cash Book is the Cash Account and the Bank Account, so the other account of the row is posted, on the opposite side: "${main.particulars}" in ${ledgerName(main.accountId)}.`
        : main.total
          ? `The total of a subsidiary book is posted once at the month end: "${main.particulars}" on the ${main.side === 'Dr' ? 'debit' : 'credit'} side of ${ledgerName(main.accountId)}.`
          : `${ledgerName(main.accountId)} is ${main.side === 'Dr' ? 'debited' : 'credited'}: "${main.particulars}"${own.length > 1 ? `, with a row for each account on the other side of the entry (${own.map((l) => l.particulars).join('; ')})` : ''}.`,
  };
}
