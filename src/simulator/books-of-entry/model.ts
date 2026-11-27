import { creditor, debtor, isParty, resolveAccount } from '@/engine/accounts';
import { accountOf, cashBook, postingsOf, type DatedEntry, type Posting as LedgerItem } from '@/engine/books';
import type { JournalLine } from '@/engine/journal';
import { formatINR, percentOf, type Paise } from '@/engine/money';

// ---------------------------------------------------------------------------------------------------------------
// The books of original entry of a month, as the topics "subsidiary-books" and "cash-book" teach them (CBSE 2025-26):
//  - the Cash Book with cash and bank columns only (no discount column): receipts on the debit side, payments on the
//    credit side; cash paid into or drawn from the bank for office use is a contra entry, on both sides, marked "C"
//    and not posted; a cash discount is not in the Cash Book: the money alone is, and the discount is a Journal
//    Proper entry (Discount Allowed A/c or Discount Received A/c);
//  - the Petty Cash Book on the imprest system, analytical, its column totals posted at the month end;
//  - the Purchases Book and the Sales Book (credit dealings in the goods of the business only, at the price after
//    trade discount), the Purchases Return Book (debit notes) and the Sales Return Book (credit notes);
//  - with GST, each invoice and note has its taxable value, CGST and SGST (within the state) or IGST (another state)
//    and its total; the party is posted with each invoice on its day, the column totals at the month end;
//  - the Journal Proper for what no other book takes.
// Every figure is in paise. The logic is pure; the screen only draws what it returns.
// ---------------------------------------------------------------------------------------------------------------

export type BookId = 'cash' | 'petty' | 'purchases' | 'sales' | 'purchasesReturn' | 'salesReturn' | 'journal';

export const BOOK_ORDER: readonly BookId[] = ['cash', 'petty', 'purchases', 'sales', 'purchasesReturn', 'salesReturn', 'journal'];

export const BOOK_NAME: Record<BookId, string> = {
  cash: 'Cash Book',
  petty: 'Petty Cash Book',
  purchases: 'Purchases Book',
  sales: 'Sales Book',
  purchasesReturn: 'Purchases Return Book',
  salesReturn: 'Sales Return Book',
  journal: 'Journal Proper',
};

/** What each book takes, in a line. */
export const BOOK_TAKES: Record<BookId, string> = {
  cash: 'Every receipt and payment of cash, or by cheque',
  petty: 'The small payments of the petty cashier (imprest system)',
  purchases: 'Credit purchases of goods for resale (invoices received)',
  sales: 'Credit sales of goods (invoices issued)',
  purchasesReturn: 'Goods sent back to suppliers (debit notes)',
  salesReturn: 'Goods sent back by customers (credit notes)',
  journal: 'Everything no other book takes',
};

export interface GstSetting {
  /** 0: GST is ignored. The two general rates in force, 5% and 18%. */
  rate: 0 | 5 | 18;
  /** Within the state (CGST and SGST, half the rate each) or with another state (IGST at the full rate). */
  intra: boolean;
}
export const NO_GST: GstSetting = { rate: 0, intra: true };

export type PettyHead = 'postage' | 'conveyance' | 'stationery' | 'refreshments';
export const PETTY_HEADS: readonly PettyHead[] = ['postage', 'conveyance', 'stationery', 'refreshments'];
export const HEAD_NAME: Record<PettyHead, string> = { postage: 'Postage', conveyance: 'Conveyance', stationery: 'Stationery', refreshments: 'Refreshments' };

export type ExpenseId = 'rent' | 'wages' | 'salaries' | 'electricity';
export const EXPENSE_NAME: Record<ExpenseId, string> = { rent: 'rent of the shop', wages: 'wages', salaries: 'salaries', electricity: 'the electricity bill' };
export type AssetId = 'furniture' | 'computers' | 'officeEquipment';
export const ASSET_WORDS: Record<AssetId, string> = { furniture: 'a display counter for the shop', computers: 'a computer for the office', officeEquipment: 'an air-conditioner for the shop' };

export type Mode = 'cash' | 'bank';

/** A transaction of the month. Amounts in paise; `list` is the list price before trade discount (`td` %). */
export type Tx = { day: number } & (
  | { kind: 'creditPurchase' | 'creditSale' | 'purchaseReturn' | 'salesReturn'; party: string; list: Paise; td: number; no: number }
  | { kind: 'cashSale' | 'cashPurchase'; amount: Paise; mode: Mode }
  /** Money received from a debtor or paid to a creditor; with `due`, in full settlement of it (the rest is cash discount). */
  | { kind: 'received' | 'paid'; party: string; amount: Paise; mode: Mode; due?: Paise }
  | { kind: 'deposit' | 'withdraw'; amount: Paise }
  | { kind: 'drawings'; amount: Paise; mode: Mode }
  | { kind: 'expense'; expense: ExpenseId; amount: Paise; mode: Mode }
  | { kind: 'assetCredit'; asset: AssetId; party: string; amount: Paise }
  | { kind: 'assetPaid'; asset: AssetId; amount: Paise; mode: Mode }
  | { kind: 'goodsDrawings'; amount: Paise }
  | { kind: 'badDebt'; party: string; amount: Paise }
  | { kind: 'imprest'; amount: Paise }
  | { kind: 'petty'; head: PettyHead; what: string; amount: Paise }
  /** The head cashier makes the petty cash up to the imprest: the amount is what was spent since the last time. */
  | { kind: 'reimburse' }
);
export type TxKind = Tx['kind'];

export interface Month {
  firm: string;
  /** What the business deals in: "electric fans". */
  goods: string;
  month: string;
  year: number;
  lastDay: number;
  opening: { cash: Paise; bank: Paise };
  /** Balances of parties brought down from last month, by name: what a debtor owes (or the firm owes a creditor). */
  owed: { debtors: Record<string, Paise>; creditors: Record<string, Paise> };
  gst: GstSetting;
  txs: Tx[];
}

export const inr = formatINR;
export const dateOf = (m: Month, day: number): string => `${day} ${m.month}`;
export const shortDate = (m: Month, day: number): string => `${m.month.slice(0, 3)} ${day}`;

// ---------------------------------------------------------------------------------------------------------------
// GST and the invoice
// ---------------------------------------------------------------------------------------------------------------

export interface Tax {
  cgst: Paise;
  sgst: Paise;
  igst: Paise;
  tax: Paise;
}
export function taxOn(x: Paise, g: GstSetting): Tax {
  if (g.rate === 0) return { cgst: 0, sgst: 0, igst: 0, tax: 0 };
  if (g.intra) {
    const half = percentOf(x, g.rate / 2);
    return { cgst: half, sgst: half, igst: 0, tax: 2 * half };
  }
  const igst = percentOf(x, g.rate);
  return { cgst: 0, sgst: 0, igst, tax: igst };
}

export interface Invoice extends Tax {
  list: Paise;
  td: number;
  tdAmount: Paise;
  /** The price after trade discount: the amount of the book without GST, the taxable value with it. */
  taxable: Paise;
  total: Paise;
}
export function invoiceOf(list: Paise, td: number, g: GstSetting): Invoice {
  const tdAmount = percentOf(list, td);
  const taxable = list - tdAmount;
  const t = taxOn(taxable, g);
  return { list, td, tdAmount, taxable, ...t, total: taxable + t.tax };
}

/** The tax lines of an amount: input tax (purchases) or output tax (sales), on the side given. */
function taxLines(t: Tax, input: boolean, side: 'Dr' | 'Cr'): JournalLine[] {
  const pre = input ? 'input' : 'output';
  return [
    ...(t.cgst ? [{ accountId: `${pre}CGST`, side, amount: t.cgst }, { accountId: `${pre}SGST`, side, amount: t.sgst }] : []),
    ...(t.igst ? [{ accountId: `${pre}IGST`, side, amount: t.igst }] : []),
  ];
}
const dr = (accountId: string, amount: Paise): JournalLine => ({ accountId, side: 'Dr', amount });
const cr = (accountId: string, amount: Paise): JournalLine => ({ accountId, side: 'Cr', amount });

// ---------------------------------------------------------------------------------------------------------------
// The names of the accounts. Petty cash heads have accounts of their own; "book:x" stands for the total of a book.
// ---------------------------------------------------------------------------------------------------------------

const OWN_NAMES: Record<string, string> = { conveyance: 'Conveyance', refreshments: 'Refreshments' };
/** The name of an account, "Purchases", or a party's own name. */
export function accountName(id: string): string {
  if (id.startsWith('book:')) return `Sundries as per ${BOOK_NAME[id.slice(5) as BookId]}`;
  return OWN_NAMES[id] ?? resolveAccount(id).name;
}
/** The name an account goes by in the particulars of a ledger account or a book: "Purchases A/c", "Rao & Co. A/c". */
export const ledgerName = (id: string): string => (id.startsWith('book:') ? accountName(id) : `${accountName(id)} A/c`);
/** The name of an account in a list: "Purchases A/c", and a party by its name alone. */
export const listName = (id: string): string => (isParty(id) ? accountName(id) : ledgerName(id));

// ---------------------------------------------------------------------------------------------------------------
// Each transaction: its source document, its words, its book or books, and the entry each book holds.
// ---------------------------------------------------------------------------------------------------------------

/** What one book holds of a transaction: the debit and credit it stands for, and the narration of a journal entry. */
export interface Part {
  book: BookId;
  lines: JournalLine[];
  narration: string;
}

export interface TxRecord {
  index: number;
  day: number;
  date: string;
  tx: Tx;
  /** The source document: "Invoice received", "Credit note issued". */
  doc: string;
  /** The transaction in words, as a question gives it. */
  text: string;
  /** Its book (or two books), in order. */
  books: BookId[];
  parts: Part[];
  /** Why it goes there. */
  why: string;
  /** For a book it does not go in, why not (the common slips). */
  traps: Partial<{ [B in BookId]: string }>;
  invoice?: Invoice;
  /** For a petty cash payment, its voucher number; for an imprest or a reimbursement, the amount. */
  voucher?: number;
  amount: Paise;
}

const ofMode = (m: Mode) => (m === 'cash' ? 'in cash' : 'by cheque');
const col = (m: Mode) => (m === 'cash' ? 'cash column' : 'bank column');

/** The words of the price on an invoice or a note: "list price ₹40,000 less 10% trade discount". */
function priceWords(v: Invoice, g: GstSetting): string {
  const price = v.td > 0 ? `list price ${inr(v.list)} less ${v.td}% trade discount` : inr(v.list);
  if (g.rate === 0) return price;
  return `${price}, plus ${g.intra ? `CGST ${g.rate / 2}% and SGST ${g.rate / 2}%` : `IGST ${g.rate}%`}`;
}
const gstWords = (g: GstSetting): string => (g.rate === 0 ? '' : g.intra ? ` plus CGST ${g.rate / 2}% and SGST ${g.rate / 2}%` : ` plus IGST ${g.rate}%`);

/**
 * The records of a month in order. `pettySpent` is carried along so that a reimbursement gives back exactly what was
 * spent since the imprest was last made up.
 */
export function recordsOf(m: Month): TxRecord[] {
  const out: TxRecord[] = [];
  let spent = 0;
  let voucher = 0;
  const g = m.gst;
  m.txs.forEach((tx, index) => {
    const base = { index, day: tx.day, date: dateOf(m, tx.day), tx };
    switch (tx.kind) {
      case 'creditPurchase': {
        const v = invoiceOf(tx.list, tx.td, g);
        const p = creditor(tx.party);
        out.push({
          ...base,
          doc: `Invoice no. ${tx.no} received`,
          text: `Bought ${m.goods} from ${tx.party} on credit: ${priceWords(v, g)}.`,
          books: ['purchases'],
          parts: [{ book: 'purchases', lines: [dr('purchases', v.taxable), ...taxLines(v, true, 'Dr'), cr(p, v.total)], narration: '' }],
          why: `Goods the business deals in, bought on credit: the Purchases Book, at the price after trade discount${g.rate ? ', with its GST in its own columns' : ''}. ${tx.party} is credited with the invoice total on the day.`,
          traps: {
            cash: 'Nothing is paid now: the Cash Book waits until the supplier is paid.',
            journal: 'A credit purchase of goods has a book of its own, the Purchases Book.',
            sales: 'The goods come in: it is a purchase, not a sale.',
            purchasesReturn: 'Nothing is being sent back: it is a new purchase.',
          },
          invoice: v,
          amount: v.total,
        });
        return;
      }
      case 'creditSale': {
        const v = invoiceOf(tx.list, tx.td, g);
        const p = debtor(tx.party);
        out.push({
          ...base,
          doc: `Invoice no. ${tx.no} issued`,
          text: `Sold ${m.goods} to ${tx.party} on credit: ${priceWords(v, g)}.`,
          books: ['sales'],
          parts: [{ book: 'sales', lines: [dr(p, v.total), cr('sales', v.taxable), ...taxLines(v, false, 'Cr')], narration: '' }],
          why: `Goods the business deals in, sold on credit: the Sales Book, at the price after trade discount${g.rate ? ', with the output tax in its own columns' : ''}. ${tx.party} is debited with the invoice total on the day.`,
          traps: {
            cash: 'No money comes in now: the Cash Book waits until the customer pays.',
            journal: 'A credit sale of goods has a book of its own, the Sales Book.',
            purchases: 'The goods go out to a customer: it is a sale.',
            salesReturn: 'Nothing has come back: it is a new sale.',
          },
          invoice: v,
          amount: v.total,
        });
        return;
      }
      case 'purchaseReturn': {
        const v = invoiceOf(tx.list, tx.td, g);
        const p = creditor(tx.party);
        out.push({
          ...base,
          doc: `Debit note no. ${tx.no} sent`,
          text: `Returned to ${tx.party} defective ${m.goods} bought on credit: ${priceWords(v, g)}.`,
          books: ['purchasesReturn'],
          parts: [{ book: 'purchasesReturn', lines: [dr(p, v.total), cr('purchasesReturn', v.taxable), ...taxLines(v, true, 'Cr')], narration: '' }],
          why: `Goods sent back to a supplier: the Purchases Return Book, written up from the debit note, at the price that was charged${g.rate ? ' and with the input tax reversed' : ''}. ${tx.party} is debited.`,
          traps: {
            purchases: 'The goods go back: the return is not deducted inside the Purchases Book, it has a book of its own.',
            salesReturn: 'It is the business that returns the goods, to a supplier: returns outwards, not inwards.',
            journal: 'Returns of goods bought on credit have a book of their own.',
            cash: 'No money moves: the supplier is simply owed less.',
          },
          invoice: v,
          amount: v.total,
        });
        return;
      }
      case 'salesReturn': {
        const v = invoiceOf(tx.list, tx.td, g);
        const p = debtor(tx.party);
        out.push({
          ...base,
          doc: `Credit note no. ${tx.no} issued`,
          text: `${tx.party} returned ${m.goods} sold on credit: ${priceWords(v, g)}.`,
          books: ['salesReturn'],
          parts: [{ book: 'salesReturn', lines: [dr('salesReturn', v.taxable), ...taxLines(v, false, 'Dr'), cr(p, v.total)], narration: '' }],
          why: `Goods sent back by a customer: the Sales Return Book, written up from the credit note${g.rate ? ', the output tax reversed' : ''}. ${tx.party} is credited.`,
          traps: {
            sales: 'The goods come back: the return is not deducted inside the Sales Book, it has a book of its own.',
            purchasesReturn: 'The customer returns the goods to the business: returns inwards, not outwards.',
            journal: 'Returns of goods sold on credit have a book of their own.',
            cash: 'No money moves: the customer simply owes less.',
          },
          invoice: v,
          amount: v.total,
        });
        return;
      }
      case 'cashSale':
      case 'cashPurchase': {
        const t = taxOn(tx.amount, g);
        const sale = tx.kind === 'cashSale';
        const lines = sale
          ? [dr(tx.mode, tx.amount + t.tax), cr('sales', tx.amount), ...taxLines(t, false, 'Cr')]
          : [dr('purchases', tx.amount), ...taxLines(t, true, 'Dr'), cr(tx.mode, tx.amount + t.tax)];
        out.push({
          ...base,
          doc: sale ? (tx.mode === 'cash' ? 'Cash memo issued' : 'Cheque received, banked the same day') : tx.mode === 'cash' ? 'Cash memo received' : 'Cheque issued',
          text: sale
            ? `Sold ${m.goods} for ${inr(tx.amount)}${gstWords(g)}, ${tx.mode === 'cash' ? 'for cash' : 'against a cheque banked the same day'}.`
            : `Bought ${m.goods} for ${inr(tx.amount)}${gstWords(g)}, paid ${ofMode(tx.mode)}.`,
          books: ['cash'],
          parts: [{ book: 'cash', lines, narration: '' }],
          why: `Money ${sale ? 'comes in' : 'goes out'} at once, so it is the Cash Book: the ${sale ? 'debit' : 'credit'} side, ${col(tx.mode)}${g.rate ? `, one row for the goods and one for each tax` : ''}.`,
          traps: sale
            ? { sales: 'The Sales Book takes only credit sales; this one is paid for at once.', journal: 'Money moves, so the Cash Book records it.' }
            : { purchases: 'The Purchases Book takes only credit purchases; this one is paid for at once.', journal: 'Money moves, so the Cash Book records it.' },
          amount: tx.amount + t.tax,
        });
        return;
      }
      case 'received':
      case 'paid': {
        const inward = tx.kind === 'received';
        const p = inward ? debtor(tx.party) : creditor(tx.party);
        const disc = tx.due ? tx.due - tx.amount : 0;
        const money: Part = { book: 'cash', lines: inward ? [dr(tx.mode, tx.amount), cr(p, tx.amount)] : [dr(p, tx.amount), cr(tx.mode, tx.amount)], narration: '' };
        const jp: Part[] = disc
          ? [
              inward
                ? { book: 'journal', lines: [dr('discountAllowed', disc), cr(p, disc)], narration: `Being cash discount allowed to ${tx.party} on settlement of the account` }
                : { book: 'journal', lines: [dr(p, disc), cr('discountReceived', disc)], narration: `Being cash discount received from ${tx.party} on settlement of the account` },
            ]
          : [];
        const how = tx.mode === 'cash' ? `${inr(tx.amount)} in cash` : `a cheque for ${inr(tx.amount)}`;
        out.push({
          ...base,
          doc: inward ? (tx.mode === 'cash' ? 'Receipt issued' : 'Cheque received, banked the same day') : tx.mode === 'cash' ? 'Receipt received' : 'Cheque issued',
          text: inward
            ? `Received ${how} from ${tx.party}${tx.due ? ` in full settlement of ${inr(tx.due)}` : ', on account'}${tx.mode === 'bank' ? '; banked the same day' : ''}.`
            : `Paid ${how} to ${tx.party}${tx.due ? ` in full settlement of ${inr(tx.due)}` : ', on account'}.`,
          books: disc ? ['cash', 'journal'] : ['cash'],
          parts: [money, ...jp],
          why: disc
            ? `Two books: the Cash Book takes only the money that moves, ${inr(tx.amount)} in the ${col(tx.mode)}; the cash discount of ${inr(disc)} never moves as money, so it goes through the Journal Proper (${inward ? `Discount Allowed A/c Dr, To ${tx.party}` : `${tx.party} Dr, To Discount Received A/c`}).`
            : `Money ${inward ? 'comes in' : 'goes out'}: the Cash Book, ${inward ? 'debit' : 'credit'} side, ${col(tx.mode)}.`,
          traps: disc
            ? { cash: 'Right, but only for the money: the discount is recorded in another book as well.', journal: 'Right, but only for the discount: the money is recorded in another book as well.' }
            : inward
              ? { journal: 'Money moves, so the Cash Book records it.', sales: 'The sale was recorded when it was made; this is the money for it.' }
              : { journal: 'Money moves, so the Cash Book records it.', purchases: 'The purchase was recorded when it was made; this is the money for it.' },
          amount: tx.amount,
        });
        return;
      }
      case 'deposit':
      case 'withdraw': {
        const dep = tx.kind === 'deposit';
        out.push({
          ...base,
          doc: dep ? 'Pay-in slip' : 'Cheque drawn to self',
          text: dep ? `Paid ${inr(tx.amount)} of the office cash into the bank.` : `Withdrew ${inr(tx.amount)} from the bank for office use.`,
          books: ['cash'],
          parts: [{ book: 'cash', lines: dep ? [dr('bank', tx.amount), cr('cash', tx.amount)] : [dr('cash', tx.amount), cr('bank', tx.amount)], narration: '' }],
          why: `A contra entry: cash and bank are both columns of the Cash Book, so it is entered on both sides (${dep ? 'bank column debit, cash column credit' : 'cash column debit, bank column credit'}), marked "C", and posted nowhere.`,
          traps: { journal: 'Both accounts are in the Cash Book itself: nothing else is needed.', petty: 'The petty cashier is not involved: the money moves between the office cash and the bank.' },
          amount: tx.amount,
        });
        return;
      }
      case 'drawings':
        out.push({
          ...base,
          doc: tx.mode === 'cash' ? 'Note of cash taken' : 'Cheque drawn to self',
          text: tx.mode === 'cash' ? `The proprietor took ${inr(tx.amount)} from the office cash for personal use.` : `The proprietor withdrew ${inr(tx.amount)} from the bank for personal use.`,
          books: ['cash'],
          parts: [{ book: 'cash', lines: [dr('drawings', tx.amount), cr(tx.mode, tx.amount)], narration: '' }],
          why: `Money leaves the business for the proprietor: the Cash Book, credit side, ${col(tx.mode)}, "By Drawings A/c". ${tx.mode === 'bank' ? 'It is not a contra entry: the cash does not come into the office.' : ''}`.trim(),
          traps: { journal: 'Money moves, so the Cash Book records it; goods taken would go to the Journal Proper.' },
          amount: tx.amount,
        });
        return;
      case 'expense':
        out.push({
          ...base,
          doc: tx.mode === 'cash' ? 'Receipt received' : 'Cheque issued',
          text: `Paid ${EXPENSE_NAME[tx.expense]}, ${inr(tx.amount)}, ${ofMode(tx.mode)}.`,
          books: ['cash'],
          parts: [{ book: 'cash', lines: [dr(tx.expense, tx.amount), cr(tx.mode, tx.amount)], narration: '' }],
          why: `A payment: the Cash Book, credit side, ${col(tx.mode)}. It is too large and too regular for petty cash.`,
          traps: { petty: 'The petty cashier pays only small sums such as postage and fares; this is paid by the head cashier.', journal: 'Money moves, so the Cash Book records it.' },
          amount: tx.amount,
        });
        return;
      case 'assetCredit': {
        const t = taxOn(tx.amount, g);
        out.push({
          ...base,
          doc: 'Invoice received (an asset)',
          text: `Bought ${ASSET_WORDS[tx.asset]} from ${tx.party} on credit: ${inr(tx.amount)}${gstWords(g)}.`,
          books: ['journal'],
          parts: [
            {
              book: 'journal',
              lines: [dr(tx.asset, tx.amount), ...taxLines(t, true, 'Dr'), cr(creditor(tx.party), tx.amount + t.tax)],
              narration: `Being ${ASSET_WORDS[tx.asset].replace(/ for the .*/, '')} bought on credit from ${tx.party}`,
            },
          ],
          why: `An asset for use, not goods for resale, bought on credit: no special book takes it, so the Journal Proper (${accountName(tx.asset)} A/c Dr, To ${tx.party}).`,
          traps: { purchases: 'The Purchases Book takes only goods bought for resale; this is an asset for use in the business.', cash: 'Nothing is paid now.' },
          amount: tx.amount + t.tax,
        });
        return;
      }
      case 'assetPaid': {
        const t = taxOn(tx.amount, g);
        out.push({
          ...base,
          doc: tx.mode === 'cash' ? 'Cash memo received (an asset)' : 'Cheque issued (an asset)',
          text: `Bought ${ASSET_WORDS[tx.asset]} for ${inr(tx.amount)}${gstWords(g)}, paid ${ofMode(tx.mode)}.`,
          books: ['cash'],
          parts: [{ book: 'cash', lines: [dr(tx.asset, tx.amount), ...taxLines(t, true, 'Dr'), cr(tx.mode, tx.amount + t.tax)], narration: '' }],
          why: `Money goes out: the Cash Book, credit side, ${col(tx.mode)}, against ${accountName(tx.asset)} A/c (an asset, not Purchases).`,
          traps: { purchases: 'The Purchases Book takes only goods bought for resale on credit.', journal: 'Money moves, so the Cash Book records it.' },
          amount: tx.amount + t.tax,
        });
        return;
      }
      case 'goodsDrawings':
        out.push({
          ...base,
          doc: 'Note of goods taken',
          text: `The proprietor took ${m.goods} costing ${inr(tx.amount)} for personal use (at cost; ignore GST).`,
          books: ['journal'],
          parts: [{ book: 'journal', lines: [dr('drawings', tx.amount), cr('purchases', tx.amount)], narration: 'Being goods taken by the proprietor for personal use' }],
          why: 'No money moves and it is neither a credit purchase nor a credit sale: the Journal Proper (Drawings A/c Dr, To Purchases A/c, at cost).',
          traps: { sales: 'The goods are not sold: they leave at cost as drawings.', cash: 'No money moves.', purchasesReturn: 'The goods do not go back to a supplier.' },
          amount: tx.amount,
        });
        return;
      case 'badDebt':
        out.push({
          ...base,
          doc: 'Note of the debtor’s insolvency',
          text: `${tx.party}, a customer who owed ${inr(tx.amount)}, became insolvent and nothing could be recovered.`,
          books: ['journal'],
          parts: [{ book: 'journal', lines: [dr('badDebts', tx.amount), cr(debtor(tx.party), tx.amount)], narration: `Being the amount due from ${tx.party} written off as bad debt` }],
          why: 'No money moves and no special book takes it: the Journal Proper (Bad Debts A/c Dr, To the debtor).',
          traps: { cash: 'Nothing is received: the debt is written off.', salesReturn: 'No goods come back: the debt is written off.' },
          amount: tx.amount,
        });
        return;
      case 'imprest':
        out.push({
          ...base,
          doc: 'Cash given to the petty cashier',
          text: `The head cashier gave the petty cashier ${inr(tx.amount)} in cash as the imprest.`,
          books: ['cash', 'petty'],
          parts: [
            { book: 'cash', lines: [dr('pettyCash', tx.amount), cr('cash', tx.amount)], narration: '' },
            { book: 'petty', lines: [], narration: '' },
          ],
          why: `The money leaves the main cash: the Cash Book, credit side, "By Petty Cash A/c". The petty cashier enters it in the receipts column of the Petty Cash Book.`,
          traps: { journal: 'Money moves, so the Cash Book records it.' },
          amount: tx.amount,
        });
        return;
      case 'petty':
        voucher += 1;
        spent += tx.amount;
        out.push({
          ...base,
          doc: `Petty cash voucher no. ${voucher}`,
          text: `The petty cashier paid ${inr(tx.amount)} for ${tx.what}.`,
          books: ['petty'],
          parts: [{ book: 'petty', lines: [dr(tx.head, tx.amount), cr('pettyCash', tx.amount)], narration: '' }],
          why: `A small payment out of the imprest: the Petty Cash Book, in the Total column and again under ${HEAD_NAME[tx.head]}.`,
          traps: { cash: 'The head cashier does not pay small sums one by one: the petty cashier does, out of the imprest.', journal: 'It is a payment of money: the petty cashier records it.' },
          voucher,
          amount: tx.amount,
        });
        return;
      case 'reimburse': {
        const x = spent;
        spent = 0;
        out.push({
          ...base,
          doc: 'Cash given to the petty cashier',
          text: `The head cashier reimbursed the petty cashier what was spent in the month, ${inr(x)}, in cash.`,
          books: ['cash', 'petty'],
          parts: [
            { book: 'cash', lines: x ? [dr('pettyCash', x), cr('cash', x)] : [], narration: '' },
            { book: 'petty', lines: [], narration: '' },
          ],
          why: `Exactly what was spent is given back, so the petty cash stands at the imprest again: the Cash Book, credit side, "By Petty Cash A/c", and the receipts column of the Petty Cash Book.`,
          traps: { journal: 'Money moves, so the Cash Book records it.' },
          amount: x,
        });
        return;
      }
    }
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The books written up from the records
// ---------------------------------------------------------------------------------------------------------------

export interface GoodsRow {
  index: number;
  date: string;
  party: string;
  /** The number of the invoice or the note. */
  no: number;
  invoice: Invoice;
}

export interface CashBookState {
  view: ReturnType<typeof cashBook>;
  /** Index of the record of each row of the debit and credit sides (null for the opening balance). */
  debitFrom: (number | null)[];
  creditFrom: (number | null)[];
}

export interface PettyRow {
  index: number;
  date: string;
  voucher: number;
  what: string;
  head: PettyHead;
  amount: Paise;
}
export interface PettyReceipt {
  index: number;
  date: string;
  label: string;
  amount: Paise;
}

export interface JournalEntry {
  index: number;
  date: string;
  lines: JournalLine[];
  narration: string;
}

export interface Books {
  purchases: GoodsRow[];
  sales: GoodsRow[];
  purchasesReturn: GoodsRow[];
  salesReturn: GoodsRow[];
  cash: CashBookState;
  petty: { receipts: PettyReceipt[]; rows: PettyRow[] };
  journal: JournalEntry[];
}

const GOODS: readonly BookId[] = ['purchases', 'sales', 'purchasesReturn', 'salesReturn'];
export const isGoodsBook = (b: BookId): b is 'purchases' | 'sales' | 'purchasesReturn' | 'salesReturn' => GOODS.includes(b);

/** The name the Cash Book gives an account in its particulars. */
export const cashBookLabel = (id: string): string => ledgerName(id);

/** The books as they stand once the first `n` records are entered. */
export function booksOf(m: Month, records: TxRecord[], n = records.length): Books {
  const shown = records.slice(0, n);
  const goods = (b: BookId): GoodsRow[] =>
    shown
      .filter((r) => r.books.includes(b) && r.invoice)
      .map((r) => ({ index: r.index, date: r.date, party: (r.tx as { party: string }).party, no: (r.tx as { no: number }).no, invoice: r.invoice! }));
  const cashParts = shown.flatMap((r) => r.parts.filter((p) => p.book === 'cash' && p.lines.length > 0).map((p) => ({ r, p })));
  const entries: DatedEntry[] = cashParts.map(({ r, p }) => ({ date: r.date, lines: p.lines }));
  const view = cashBook(entries, { date: dateOf(m, 1), cash: m.opening.cash, bank: m.opening.bank }, cashBookLabel);
  // Which record each row comes from: the rows come entry by entry, each entry's cash rows before its bank rows, one
  // row for each item the account gets from the entry (as the engine writes them).
  const from = (side: 'Dr' | 'Cr'): (number | null)[] => {
    const out: (number | null)[] = [];
    const opens = side === 'Dr' ? m.opening.cash > 0 || m.opening.bank > 0 : m.opening.cash < 0 || m.opening.bank < 0;
    if (opens) out.push(null);
    for (const { r, p } of cashParts) {
      for (const column of ['cash', 'bank'] as const) {
        for (const it of postingsOf([{ date: r.date, lines: p.lines }], column, cashBookLabel)) if (it.side === side) out.push(r.index);
      }
    }
    return out;
  };
  const receipts: PettyReceipt[] = shown
    .filter((r) => (r.tx.kind === 'imprest' || r.tx.kind === 'reimburse') && r.amount > 0)
    .map((r) => ({ index: r.index, date: r.date, label: 'Cash received from the head cashier', amount: r.amount }));
  const rows: PettyRow[] = shown.flatMap((r) => (r.tx.kind === 'petty' ? [{ index: r.index, date: r.date, voucher: r.voucher!, what: r.tx.what, head: r.tx.head, amount: r.tx.amount }] : []));
  const journal: JournalEntry[] = shown.flatMap((r) => r.parts.filter((p) => p.book === 'journal').map((p) => ({ index: r.index, date: r.date, lines: p.lines, narration: p.narration })));
  return {
    purchases: goods('purchases'),
    sales: goods('sales'),
    purchasesReturn: goods('purchasesReturn'),
    salesReturn: goods('salesReturn'),
    cash: { view, debitFrom: from('Dr'), creditFrom: from('Cr') },
    petty: { receipts, rows },
    journal,
  };
}

/** The totals of the columns of a goods book. */
export function goodsTotals(rows: readonly GoodsRow[]): { taxable: Paise; cgst: Paise; sgst: Paise; igst: Paise; total: Paise } {
  const s = (f: (v: Invoice) => Paise) => rows.reduce((t, r) => t + f(r.invoice), 0);
  return { taxable: s((v) => v.taxable), cgst: s((v) => v.cgst), sgst: s((v) => v.sgst), igst: s((v) => v.igst), total: s((v) => v.total) };
}

/** The petty cash book's totals: what was received, what was paid under each head, and the balance. */
export function pettyTotals(p: Books['petty']): { received: Paise; paid: Paise; byHead: Record<PettyHead, Paise>; balance: Paise } {
  const received = p.receipts.reduce((t, r) => t + r.amount, 0);
  const paid = p.rows.reduce((t, r) => t + r.amount, 0);
  const byHead = Object.fromEntries(PETTY_HEADS.map((h) => [h, p.rows.filter((r) => r.head === h).reduce((t, r) => t + r.amount, 0)])) as Record<PettyHead, Paise>;
  return { received, paid, byHead, balance: received - paid };
}

/** The heads of the petty cash book that the month uses, in their order. */
export function headsUsed(m: Month): PettyHead[] {
  return PETTY_HEADS.filter((h) => m.txs.some((t) => t.kind === 'petty' && t.head === h));
}

/** The tax columns of the goods books of a month: none, CGST and SGST, or IGST. */
export function taxColumns(g: GstSetting): ('cgst' | 'sgst' | 'igst')[] {
  return g.rate === 0 ? [] : g.intra ? ['cgst', 'sgst'] : ['igst'];
}
export const taxColumnName = (c: 'cgst' | 'sgst' | 'igst', input: boolean): string => `${input ? 'Input' : 'Output'} ${c.toUpperCase()}`;

// ---------------------------------------------------------------------------------------------------------------
// Posting to the ledger at the month end
// ---------------------------------------------------------------------------------------------------------------

/**
 * One posting of a book: from a row (to a party, or to the account of a Cash Book or Journal Proper row) or from a
 * column total. `to` is the account, `side` the side of it, and `particulars` what is written there.
 */
export interface PostLine {
  book: BookId;
  /** What it is posted from: "Rao & Co., invoice no. 101", "Total of the Purchases Book". */
  from: string;
  /** From a column total at the month end, or from each row on its day. */
  total: boolean;
  accountId: string;
  side: 'Dr' | 'Cr';
  amount: Paise;
  particulars: string;
  date: string;
  /** A contra row: not posted at all. */
  contra?: true;
}

/** The ledger entries each book gives, and which accounts each one is posted to. */
interface LedgerEntry {
  book: BookId;
  entry: DatedEntry;
  /** The accounts this entry is posted to (the others are posted from a total, or are the Cash Book itself). */
  accounts: string[];
  from: string;
  total: boolean;
}

const TOTAL_ACCOUNTS: Record<'purchases' | 'sales' | 'purchasesReturn' | 'salesReturn', { account: string; input: boolean; side: 'Dr' | 'Cr' }> = {
  purchases: { account: 'purchases', input: true, side: 'Dr' },
  sales: { account: 'sales', input: false, side: 'Cr' },
  purchasesReturn: { account: 'purchasesReturn', input: true, side: 'Cr' },
  salesReturn: { account: 'salesReturn', input: false, side: 'Dr' },
};

function ledgerEntries(m: Month, records: TxRecord[]): LedgerEntry[] {
  const last = dateOf(m, m.lastDay);
  const books = booksOf(m, records);
  const out: LedgerEntry[] = [];
  // Each goods book: every row to its party on the day; the column totals at the month end.
  for (const b of GOODS as ('purchases' | 'sales' | 'purchasesReturn' | 'salesReturn')[]) {
    const rows = books[b];
    for (const r of rows) {
      const rec = records[r.index];
      const part = rec.parts.find((p) => p.book === b)!;
      const party = part.lines.find((l) => isParty(l.accountId))!.accountId;
      out.push({ book: b, entry: { date: r.date, lines: part.lines }, accounts: [party], from: `${r.party}, ${b === 'purchases' || b === 'sales' ? 'invoice' : b === 'purchasesReturn' ? 'debit note' : 'credit note'} no. ${r.no}`, total: false });
    }
    if (rows.length > 0) {
      const t = goodsTotals(rows);
      const k = TOTAL_ACCOUNTS[b];
      const pre = k.input ? 'input' : 'output';
      const lines: JournalLine[] = [
        { accountId: k.account, side: k.side, amount: t.taxable },
        ...taxColumns(m.gst).map((c) => ({ accountId: `${pre}${c.toUpperCase()}`, side: k.side, amount: t[c] })),
      ];
      const other: 'Dr' | 'Cr' = k.side === 'Dr' ? 'Cr' : 'Dr';
      out.push({
        book: b,
        entry: { date: last, lines: [...lines, { accountId: `book:${b}`, side: other, amount: t.total }] },
        accounts: lines.map((l) => l.accountId),
        from: `Total of the ${BOOK_NAME[b]}`,
        total: true,
      });
    }
  }
  // The Cash Book: each row to its account, on the other side; contra rows to nothing.
  for (const r of records) {
    for (const p of r.parts) {
      if (p.book === 'cash' && p.lines.length > 0) {
        const accounts = p.lines.filter((l) => l.accountId !== 'cash' && l.accountId !== 'bank').map((l) => l.accountId);
        out.push({ book: 'cash', entry: { date: r.date, lines: p.lines }, accounts, from: r.text, total: false });
      }
      if (p.book === 'journal') out.push({ book: 'journal', entry: { date: r.date, lines: p.lines }, accounts: p.lines.map((l) => l.accountId), from: p.narration, total: false });
    }
  }
  // The Petty Cash Book: each head's column total to its account, and the total of the payments to Petty Cash A/c.
  const pt = pettyTotals(books.petty);
  if (pt.paid > 0) {
    const heads = PETTY_HEADS.filter((h) => pt.byHead[h] > 0);
    out.push({
      book: 'petty',
      entry: { date: last, lines: [...heads.map((h) => ({ accountId: h, side: 'Dr' as const, amount: pt.byHead[h] })), { accountId: 'pettyCash', side: 'Cr', amount: pt.paid }] },
      accounts: [...heads, 'pettyCash'],
      from: 'Totals of the analysis columns of the Petty Cash Book',
      total: true,
    });
  }
  return out;
}

/** The postings of one book, line by line, in the order they are made. */
export function postingsOfBook(m: Month, records: TxRecord[], book: BookId): PostLine[] {
  const out: PostLine[] = [];
  for (const le of ledgerEntries(m, records).filter((e) => e.book === book)) {
    if (book === 'cash' && le.accounts.length === 0) {
      // A contra entry: both sides are in the Cash Book.
      const amount = le.entry.lines[0].amount;
      out.push({ book, from: le.from, total: false, accountId: '', side: 'Dr', amount, particulars: 'Not posted: a contra entry (C)', date: le.entry.date, contra: true });
      continue;
    }
    for (const id of le.accounts) {
      const items = accountOf([le.entry], id, null, ledgerName);
      for (const it of [...items.debit, ...items.credit]) {
        out.push({ book, from: le.from, total: le.total, accountId: id, side: it.side, amount: it.amount, particulars: `${it.side === 'Dr' ? 'To' : 'By'} ${it.label}`, date: it.date });
      }
    }
  }
  return out;
}

export interface LedgerAccount {
  accountId: string;
  title: string;
  debit: (LedgerItem & { book: BookId | null })[];
  credit: (LedgerItem & { book: BookId | null })[];
}

/** The ledger accounts after the books named in `posted` are posted (opening party balances brought down). */
export function ledgerOf(m: Month, records: TxRecord[], posted: ReadonlySet<BookId>): LedgerAccount[] {
  const les = ledgerEntries(m, records).filter((e) => posted.has(e.book));
  const ids: string[] = [];
  const add = (id: string) => {
    if (!ids.includes(id)) ids.push(id);
  };
  for (const name of Object.keys(m.owed.debtors)) add(debtor(name));
  for (const name of Object.keys(m.owed.creditors)) add(creditor(name));
  for (const le of les) for (const id of le.accounts) add(id);
  const open = dateOf(m, 1);
  const out: LedgerAccount[] = [];
  // A ledger account is written in the order of the dates: a total posted on the last day comes after a row of the
  // Cash Book or the Journal Proper of the 14th (the sort keeps the order of the books within a day).
  const dayOf = (e: LedgerEntry) => Number(e.entry.date.split(' ')[0]);
  for (const id of ids) {
    const mine = les.filter((e) => e.accounts.includes(id)).sort((a, b) => dayOf(a) - dayOf(b));
    const opening = id.startsWith('debtor:') ? m.owed.debtors[id.slice(7)] : id.startsWith('creditor:') ? m.owed.creditors[id.slice(9)] : undefined;
    if (mine.length === 0) continue;
    const view = accountOf(
      mine.map((e) => e.entry),
      id,
      opening ? { date: open, side: id.startsWith('debtor:') ? 'Dr' : 'Cr', amount: opening } : null,
      ledgerName,
    );
    // Which book each item came from, in the order accountOf gives them (the opening balance first on its side).
    const bookOf = (side: 'Dr' | 'Cr'): (BookId | null)[] => {
      const list: (BookId | null)[] = [];
      if (opening && (id.startsWith('debtor:') ? 'Dr' : 'Cr') === side) list.push(null);
      for (const e of mine) for (const it of postingsOf([e.entry], id, ledgerName)) if (it.side === side) list.push(e.book);
      return list;
    };
    const db = bookOf('Dr');
    const cb = bookOf('Cr');
    out.push({ accountId: id, title: ledgerName(id), debit: view.debit.map((it, i) => ({ ...it, book: db[i] ?? null })), credit: view.credit.map((it, i) => ({ ...it, book: cb[i] ?? null })) });
  }
  return out;
}

/** The balance of a party's account after all the records (debtor positive, creditor positive). */
export function partyBalance(m: Month, records: TxRecord[], partyId: string, upTo = records.length): Paise {
  const isDebtor = partyId.startsWith('debtor:');
  let bal = isDebtor ? (m.owed.debtors[partyId.slice(7)] ?? 0) : (m.owed.creditors[partyId.slice(9)] ?? 0);
  for (const r of records.slice(0, upTo)) {
    for (const p of r.parts) {
      for (const l of p.lines) {
        if (l.accountId !== partyId) continue;
        bal += (l.side === 'Dr') === isDebtor ? l.amount : -l.amount;
      }
    }
  }
  return bal;
}

// ---------------------------------------------------------------------------------------------------------------
// Checks of a month built in the sandbox
// ---------------------------------------------------------------------------------------------------------------

/**
 * Why a month cannot be as it is, or null. Cash in hand and petty cash never go below nil; a party is never owed
 * the wrong way round (a return or a payment larger than what is owed); a settlement settles what is owed in full;
 * the days run in order within the month.
 */
export function problemOf(m: Month): string | null {
  const records = recordsOf(m);
  let cash = m.opening.cash;
  let petty = 0;
  for (let k = 0; k < records.length; k++) {
    const r = records[k];
    const t = r.tx;
    if (t.day < 1 || t.day > m.lastDay) return `${r.date} is not a day of ${m.month}.`;
    if (k > 0 && t.day < records[k - 1].tx.day) return `The transaction of ${r.date} comes before the one of ${records[k - 1].date}: keep them in the order of their dates.`;
    for (const p of r.parts) for (const l of p.lines) if (l.accountId === 'cash') cash += l.side === 'Dr' ? l.amount : -l.amount;
    if (t.kind === 'imprest' || t.kind === 'reimburse') petty += r.amount;
    if (t.kind === 'petty') petty -= t.amount;
    if (cash < 0) return `On ${r.date} more cash would be paid out than is in hand (${inr(-cash)} more): cash in hand can never fall below nil.`;
    if (petty < 0) return `On ${r.date} the petty cashier would pay out more than the imprest left.`;
    if (t.kind === 'petty' && !records.slice(0, k).some((x) => x.tx.kind === 'imprest')) return `On ${r.date} the petty cashier has no imprest yet.`;
    if ('party' in t) {
      const id = t.kind === 'creditPurchase' || t.kind === 'purchaseReturn' || t.kind === 'paid' || t.kind === 'assetCredit' ? creditor(t.party) : debtor(t.party);
      const before = partyBalance(m, records, id, k);
      const after = partyBalance(m, records, id, k + 1);
      if (after < 0) return `On ${r.date} ${t.party} would be ${id.startsWith('debtor:') ? 'paid back more than' : 'paid more than'} is owed: ${t.party} owed ${inr(Math.max(0, before))}.`;
      if ((t.kind === 'received' || t.kind === 'paid') && t.due !== undefined) {
        if (t.due !== before) return `On ${r.date} a full settlement must settle what is owed, ${inr(before)}.`;
        if (t.amount >= t.due) return `On ${r.date} the money is not less than what is owed: there is no discount.`;
      }
      if (t.kind === 'badDebt' && t.amount !== before) return `On ${r.date} the bad debt written off should be what ${t.party} owed, ${inr(before)}.`;
    }
  }
  return null;
}
