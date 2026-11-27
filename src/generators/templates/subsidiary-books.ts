import type { Difficulty, JournalSetQuestion, StatementQuestion } from '@/content/types';
import { creditor, debtor } from '@/engine/accounts';
import { accountLabel, postingsOf } from '@/engine/books';
import type { JournalLine } from '@/engine/journal';
import type { Rng } from '@/engine/rng';
import { parseRupees } from '@/lib/money-input';
import {
  amount,
  factsTemplate,
  formatINR as F,
  interleave,
  journalSetTemplate,
  journalTemplate,
  mcqTemplate,
  numericTemplate,
  percentOf,
  rupees,
  setDays,
  setHolds,
  statementTemplate,
  type Paise,
} from '../authoring';
import type { Distractor, FormatRowParts, Template } from '../types';
import { assertionReasonTemplate } from '../assertionReason';

const T = 'subsidiary-books';
const K = {
  book: 'sb-which-book',
  doc: 'sb-documents',
  td: 'sb-trade-discount',
  gst: 'sb-gst',
  totals: 'sb-book-totals',
  returns: 'sb-returns',
  posting: 'sb-posting',
  jp: 'sb-journal-proper',
  sets: 'sb-sets',
} as const;

// ---------------------------------------------------------------------------------------------------------------
// Shared data and helpers
// ---------------------------------------------------------------------------------------------------------------

interface Biz {
  name: string;
  goods: string;
}
const BIZ: Biz[] = [
  { name: 'Kumar Electricals', goods: 'LED bulbs' },
  { name: 'New India Garments', goods: 'cotton shirts' },
  { name: 'Ganesh Stationers', goods: 'notebooks' },
  { name: 'Madhu Footwear', goods: 'sports shoes' },
  { name: 'Singh Hardware', goods: 'power tools' },
  { name: 'Raj Provisions', goods: 'packaged tea' },
  { name: 'Sundaram Toys', goods: 'board games' },
];
const PEOPLE = [
  'Rao & Co.',
  'Sharma Bros',
  'Anita Traders',
  'Lakshmi Stores',
  'Gupta Agencies',
  'Verma Enterprises',
  'Patel & Sons',
  'Nair Distributors',
  'Iyer Trading Co.',
  'Joshi Brothers',
  'Mohan Traders',
  'Kiran Stores',
];
const MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
const RATES = [5, 18];

const pickBiz = (rng: Rng): Biz => rng.pick(BIZ);

/**
 * The businesses of the questions that charge GST, each with the rate its goods carry (5% or 18%, the two rates the
 * course works with), so that one kind of goods is never taxed at two rates. Printed books, which are exempt, are
 * never among them. Templates without GST keep `BIZ`.
 */
interface GstBiz extends Biz {
  rate: number;
}
const GST_BIZ: GstBiz[] = [
  { name: 'Kumar Electricals', goods: 'electrical wires and switches', rate: 18 },
  { name: 'Singh Hardware', goods: 'power tools', rate: 18 },
  { name: 'Sai Computer Supplies', goods: 'printer cartridges', rate: 18 },
  { name: 'Shree Plywood House', goods: 'plywood sheets', rate: 18 },
  { name: 'Raj Provisions', goods: 'packaged tea', rate: 5 },
  { name: 'New India Textiles', goods: 'cotton fabric', rate: 5 },
  { name: 'Mehta Spice Traders', goods: 'whole spices', rate: 5 },
  { name: 'Annapurna Oil Depot', goods: 'groundnut oil', rate: 5 },
];
const pickGstBiz = (rng: Rng): GstBiz => rng.pick(GST_BIZ);
/** The GST of a business's goods, or null when a base would give tax that is not whole rupees. */
const gstOfGoods = (b: GstBiz, intra: boolean, bases: Paise[]): Gst | null =>
  bases.every((base) => taxOn(base, { rate: b.rate, intra }) !== null) ? { rate: b.rate, intra } : null;
const people = (rng: Rng, n: number): string[] => rng.shuffle(PEOPLE).slice(0, n);
const month = (rng: Rng): string => rng.pick(MONTHS);
/** n distinct days of a month, in order. */
const days = (rng: Rng, n: number): number[] =>
  rng
    .shuffle(Array.from({ length: 28 }, (_, i) => i + 1))
    .slice(0, n)
    .sort((a, b) => a - b);
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
/**
 * Invoice numbers for the items of one list, all different. A seller numbers its own invoices in order, so those
 * rise with the date; invoices received come from different suppliers, so those are unrelated.
 */
const invoiceNos = (rng: Rng, n: number, own: boolean): number[] => {
  const first = rng.int(101, 880);
  return Array.from({ length: n }, (_, i) => (own ? first + i : 101 + ((first + i * 173) % 800)));
};
/** A wrong answer rounded to a whole rupee, as a student would type it. */
const whole = (p: Paise): Paise => Math.round(p / 100) * 100;

/** Every ₹ amount in a text, in order, in paise (used by the independent checks). */
const moneyIn = (s: string): Paise[] => (s.match(/₹\d(?:[\d,]*\d)?/g) ?? []).map((m) => parseRupees(m) ?? NaN);
/** Every number written before a % sign. */
const pctIn = (s: string): number[] => [...s.matchAll(/(\d+(?:\.\d+)?)%/g)].map((m) => Number(m[1]));

interface Gst {
  rate: number;
  intra: boolean;
}

interface Tax {
  cgst: Paise;
  sgst: Paise;
  igst: Paise;
  tax: Paise;
}
const NO_TAX: Tax = { cgst: 0, sgst: 0, igst: 0, tax: 0 };
/** GST on a taxable value, or null when any part is not a whole number of rupees. */
function taxOn(base: Paise, g: Gst): Tax | null {
  const tax = (base * g.rate) / 100;
  if (!Number.isInteger(tax) || tax % 100 !== 0) return null;
  if (!g.intra) return { cgst: 0, sgst: 0, igst: tax, tax };
  const half = tax / 2;
  return half % 100 === 0 ? { cgst: half, sgst: half, igst: 0, tax } : null;
}


interface Inv extends Tax {
  day: number;
  party: string;
  list: Paise;
  td: number;
  net: Paise;
  total: Paise;
  intra: boolean;
}
/** An invoice: list price less trade discount, then GST on the net price. Null unless every figure is whole rupees. */
function makeInv(day: number, party: string, list: Paise, td: number, g: Gst | null): Inv | null {
  const net = list - percentOf(list, td);
  if (net % 100 !== 0) return null;
  let t = NO_TAX;
  if (g) {
    const x = taxOn(net, g);
    if (!x) return null;
    t = x;
  }
  return { day, party, list, td, net, total: net + t.tax, intra: g?.intra ?? true, ...t };
}

// ---------------------------------------------------------------------------------------------------------------
// Which book? (classification)
// ---------------------------------------------------------------------------------------------------------------

type Book = 'pb' | 'sb' | 'prb' | 'srb' | 'cb' | 'jp';
const BOOK: Record<Book, string> = {
  pb: 'Purchases Book',
  sb: 'Sales Book',
  prb: 'Purchases Return Book',
  srb: 'Sales Return Book',
  cb: 'Cash Book',
  jp: 'Journal Proper',
};
const ALL_BOOKS = Object.keys(BOOK) as Book[];

/** What a student who picks a wrong book for a transaction of the right book has mixed up. */
const WRONG: Record<Book, Partial<Record<Book, string>>> = {
  pb: {
    sb: 'Took a purchase for a sale: the Sales Book records goods sold, not goods bought.',
    prb: 'Mixed buying goods with sending them back; the Purchases Return Book takes only goods returned to a supplier.',
    srb: 'Mixed up the direction: the Sales Return Book is for goods that customers send back.',
    cb: 'Treated it as a cash transaction, but nothing is paid at the time, so the Cash Book is not used.',
    jp: 'Used Journal Proper, which is only for entries that no other book takes; credit purchases of goods have a book of their own.',
  },
  sb: {
    pb: 'Took a sale for a purchase: the Purchases Book records goods bought.',
    prb: 'Used the book for goods sent back to suppliers, but these goods are being sold to a customer.',
    srb: 'Mixed a sale with a sales return; the Sales Return Book is for goods that customers send back.',
    cb: 'Treated it as a cash sale, but no money is received at the time, so the Cash Book is not used.',
    jp: 'Used Journal Proper, but credit sales of goods have a book of their own.',
  },
  prb: {
    pb: 'Recorded the return as a fresh purchase, although the goods are going back to the supplier.',
    sb: 'Thought goods leaving the business must be a sale, but these goods are being returned, not sold.',
    srb: 'Mixed up returns outwards and returns inwards: here the goods go back to a supplier, so it is a purchases return.',
    cb: 'Treated the return as a cash payment, but no cash or cheque changes hands.',
    jp: 'Used Journal Proper, but returns of goods bought on credit have a book of their own.',
  },
  srb: {
    pb: 'Took the goods coming back as a purchase from the customer.',
    sb: 'Recorded it as another sale, although the goods have come back.',
    prb: 'Mixed up returns inwards and returns outwards: here a customer sends goods back, so it is a sales return.',
    cb: "Treated it as a cash refund, but the customer's account is simply credited and no cash moves.",
    jp: 'Used Journal Proper, but returns by customers have a book of their own.',
  },
  cb: {
    pb: 'Used the Purchases Book, which takes only credit purchases of goods, never a payment made at once.',
    sb: 'Used the Sales Book, which takes only credit sales of goods; money here changes hands at once.',
    prb: 'Used the Purchases Return Book, but no goods are going back to a supplier.',
    srb: 'Used the Sales Return Book, but no customer is sending goods back.',
    jp: 'Used Journal Proper, but anything paid or received in cash or by cheque goes to the Cash Book.',
  },
  jp: {
    pb: 'Used the Purchases Book, which takes only credit purchases of goods for resale, and this is not one.',
    sb: 'Used the Sales Book, which takes only credit sales of goods, and this is not one.',
    prb: 'Used the Purchases Return Book, but no goods are being returned to a supplier.',
    srb: 'Used the Sales Return Book, but no customer is sending goods back.',
    cb: 'Used the Cash Book, but no cash or cheque is received or paid in this transaction.',
  },
};

const bookOptions = (right: Book): Distractor[] =>
  ALL_BOOKS.filter((b) => b !== right).map((b) => ({ text: BOOK[b], why: WRONG[right][b] ?? 'Chose a book that does not record this kind of transaction.' }));

const isBookName = (text: string | undefined): boolean => Object.values(BOOK).includes(text ?? '');

interface Scene {
  book: Book;
  text: (x: string, p: string, b: Biz) => string;
  because: string;
}
const CASH_RULE = 'Everything paid or received in cash or by cheque is recorded in the Cash Book.';
const SCENES: Scene[] = [
  { book: 'pb', text: (x, p, b) => `${b.name} bought ${b.goods} worth ${x} from ${p} on 30 days' credit.`, because: 'Goods bought on credit for resale are entered first in the Purchases Book.' },
  { book: 'pb', text: (x, p, b) => `${p} sent ${b.name} an invoice for ${x}, the price of ${b.goods} supplied on credit.`, because: 'An invoice for goods bought on credit is entered in the Purchases Book.' },
  { book: 'sb', text: (x, p, b) => `${b.name} sold ${b.goods} worth ${x} to ${p}, who will pay next month.`, because: 'Goods sold on credit are entered first in the Sales Book.' },
  { book: 'sb', text: (x, p, b) => `${b.name} raised an invoice for ${x} on ${p} for ${b.goods} supplied on credit.`, because: 'The copy of the invoice for a credit sale is entered in the Sales Book.' },
  { book: 'prb', text: (x, p, b) => `${b.name} returned damaged ${b.goods} worth ${x} to ${p}, from whom they had been bought on credit.`, because: 'Goods sent back to a supplier are entered in the Purchases Return Book.' },
  { book: 'prb', text: (x, p, b) => `${b.name} sent ${p} a debit note for ${x} for ${b.goods} returned as defective; the goods had been bought on credit.`, because: 'A debit note for goods sent back is entered in the Purchases Return Book.' },
  { book: 'srb', text: (x, p, b) => `${p}, a credit customer, sent back ${b.goods} worth ${x} supplied by ${b.name}, which issued a credit note.`, because: 'Goods that a customer sends back are entered in the Sales Return Book, from the credit note.' },
  { book: 'srb', text: (x, p, b) => `${b.name} took back unsold ${b.goods} worth ${x} from ${p}, to whom they had been sold on credit.`, because: 'Goods taken back from a credit customer are entered in the Sales Return Book.' },
  { book: 'cb', text: (x, _p, b) => `${b.name} bought ${b.goods} worth ${x} and paid cash on the spot.`, because: CASH_RULE },
  { book: 'cb', text: (x, _p, b) => `${b.name} sold ${b.goods} worth ${x} and received the amount by cheque on the spot.`, because: CASH_RULE },
  { book: 'cb', text: (x, _p, b) => `${b.name} paid shop rent of ${x} by cheque.`, because: CASH_RULE },
  { book: 'jp', text: (x, p, b) => `${b.name} bought an air conditioner for its office, costing ${x}, on credit from ${p}.`, because: 'An asset bought on credit is not goods for resale, so it goes to the Journal Proper.' },
  { book: 'jp', text: (x, p, b) => `${b.name} sold its old computer, a fixed asset, to ${p} for ${x} on credit.`, because: 'An asset sold on credit is not goods in which the business deals, so it goes to the Journal Proper.' },
  { book: 'jp', text: (x, _p, b) => `The owner of ${b.name} took ${b.goods} costing ${x} from the shop for use at home.`, because: 'Goods taken by the owner are not a sale and involve no cash, so the entry is made in the Journal Proper.' },
  { book: 'jp', text: (x, p, b) => `${b.name} wrote off ${x} that ${p}, a customer, could not pay, as a bad debt.`, because: 'A write-off is an adjustment with no book of its own, so it goes to the Journal Proper.' },
  { book: 'jp', text: (x, _p, b) => `${b.name} found that rent of ${x} had been debited to Salaries A/c by mistake, and corrected it.`, because: 'A rectifying entry is made in the Journal Proper.' },
];

const sbWhichBook = mcqTemplate({
  id: 'sb-which-book',
  topicId: T,
  conceptId: K.book,
  difficulty: 'easy',
  generate: (rng) => {
    const s = rng.pick(SCENES);
    const x = F(amount(rng, 3000, 90000, 500));
    return {
      prompt: `${s.text(x, people(rng, 1)[0], pickBiz(rng))} In which book is this transaction first recorded?`,
      correct: BOOK[s.book],
      distractors: bookOptions(s.book),
      explanation: s.because,
      hints: ['Is any cash or cheque involved? Are goods bought or sold, and are they coming or going?', 'Credit purchases and sales of goods, and their returns, have a book each. Cash goes to the Cash Book. Everything else goes to the Journal Proper.'],
    };
  },
  verify: (q) => isBookName(q.options.find((o) => o.id === q.correct)?.text),
});

// ---------------------------------------------------------------------------------------------------------------
// Which document? And which book is written from it?
// ---------------------------------------------------------------------------------------------------------------

type Doc = 'Invoice' | 'Debit note' | 'Credit note' | 'Cash memo' | 'Receipt';
const DOCS: Doc[] = ['Invoice', 'Debit note', 'Credit note', 'Cash memo', 'Receipt'];
const WRONG_DOC: Record<Doc, Partial<Record<Doc, string>>> = {
  Invoice: {
    'Debit note': 'Chose the debit note, but that is sent when goods are returned, not when they are sold.',
    'Credit note': 'Chose the credit note, but that is sent when goods come back, not when they are sold.',
    'Cash memo': 'Chose the cash memo, which is for sales paid for at once; this sale is on credit.',
    Receipt: 'Took a bill for a receipt; a receipt only acknowledges money received.',
  },
  'Debit note': {
    Invoice: 'Chose the invoice, which the seller sends when goods are sold, not when they are returned.',
    'Credit note': 'Mixed up the two notes: the buyer who returns goods debits the supplier and sends a debit note; the credit note comes from the seller.',
    'Cash memo': 'Chose the cash memo, which is given for goods sold for cash.',
    Receipt: 'Chose a receipt, which acknowledges money received; no money is involved in a return.',
  },
  'Credit note': {
    Invoice: 'Chose the invoice, which the seller sends when goods are sold, not when they are taken back.',
    'Debit note': 'Mixed up the two notes: the seller who accepts a return credits the customer and sends a credit note; the debit note comes from the buyer.',
    'Cash memo': 'Chose the cash memo, which is given for goods sold for cash.',
    Receipt: 'Chose a receipt, which acknowledges money received; no money is involved when goods are taken back.',
  },
  'Cash memo': {
    Invoice: 'Chose the invoice, which is for credit sales; this sale was paid for at once.',
    'Debit note': 'Chose the debit note, which is sent when goods are returned.',
    'Credit note': 'Chose the credit note, which is sent when goods are taken back.',
    Receipt: 'Chose a receipt, but the document for a counter sale of goods is the cash memo.',
  },
  Receipt: {
    Invoice: 'Chose the invoice, which asks for payment; a receipt acknowledges the money received.',
    'Debit note': 'Chose the debit note, which is about goods returned, not money received.',
    'Credit note': 'Chose the credit note, which is about goods taken back, not money received.',
    'Cash memo': 'Chose the cash memo, which is for goods sold for cash; here a debtor is paying an old bill.',
  },
};

interface DocScene {
  doc: Doc;
  text: (x: string, p: string, b: Biz) => string;
  because: string;
}
const DOC_SCENES: DocScene[] = [
  { doc: 'Invoice', text: (x, p, b) => `${b.name} sells ${b.goods} worth ${x} on credit to ${p}. Which document does ${b.name} send with the goods, showing the quantity, price, trade discount and GST?`, because: 'The seller sends an invoice for goods sold on credit.' },
  { doc: 'Debit note', text: (x, p, b) => `${b.name} returns defective ${b.goods} worth ${x} to ${p}, a supplier, and informs ${p} that it has debited the account of ${p} in its books with this amount. Which document does ${b.name} send?`, because: 'A buyer who returns goods debits the supplier and informs the supplier by a debit note.' },
  { doc: 'Credit note', text: (x, p, b) => `${b.name} agrees to take back ${b.goods} worth ${x} from ${p}, a credit customer, and informs ${p} that it has credited the account of ${p} in its books with this amount. Which document does ${b.name} send?`, because: 'A seller who takes goods back credits the customer and informs the customer by a credit note.' },
  { doc: 'Cash memo', text: (x, _p, b) => `A customer buys ${b.goods} worth ${x} at the counter of ${b.name} and pays at once. Which document does ${b.name} hand over?`, because: 'A sale for cash is supported by a cash memo.' },
  { doc: 'Receipt', text: (x, p, b) => `${p} pays ${x} to ${b.name} to settle an invoice. Which document does ${b.name} issue to acknowledge the money?`, because: 'A receipt acknowledges money received.' },
];

const sbWhichDocument = mcqTemplate({
  id: 'sb-which-document',
  topicId: T,
  conceptId: K.doc,
  difficulty: 'easy',
  generate: (rng) => {
    const s = rng.pick(DOC_SCENES);
    const x = F(amount(rng, 3000, 80000, 500));
    return {
      prompt: s.text(x, people(rng, 1)[0], pickBiz(rng)),
      correct: s.doc,
      distractors: DOCS.filter((d) => d !== s.doc).map((d) => ({ text: d, why: WRONG_DOC[s.doc][d] ?? 'Chose a document that does not fit this transaction.' })),
      explanation: s.because,
    };
  },
  verify: (q) => DOCS.includes((q.options.find((o) => o.id === q.correct)?.text ?? '') as Doc),
});

interface BookScene {
  book: Book;
  text: (x: string, p: string, b: Biz) => string;
  because: string;
}
const DOC_BOOK_SCENES: BookScene[] = [
  { book: 'pb', text: (x, p, b) => `${b.name} receives an invoice for ${x} from ${p} for goods bought on credit. In which book is the purchase entered from this invoice?`, because: 'Invoices received for goods bought on credit are the source of the Purchases Book.' },
  { book: 'sb', text: (x, p, b) => `${b.name} makes out an invoice for ${x} for goods sold on credit to ${p}, and keeps a copy. In which book is the sale entered from that copy?`, because: 'The copies of invoices issued for credit sales are the source of the Sales Book.' },
  { book: 'prb', text: (x, p, b) => `${b.name} issues a debit note for ${x} to ${p} for goods it is returning. In which book does ${b.name} enter the return from this note?`, because: 'Debit notes issued for goods returned to suppliers are the source of the Purchases Return Book.' },
  { book: 'srb', text: (x, p, b) => `${b.name} issues a credit note for ${x} to ${p} for goods taken back. In which book does ${b.name} enter the return from this note?`, because: 'Credit notes issued for goods taken back from customers are the source of the Sales Return Book.' },
];
const sbDocToBook = mcqTemplate({
  id: 'sb-doc-to-book',
  topicId: T,
  conceptId: K.doc,
  difficulty: 'easy',
  generate: (rng) => {
    const s = rng.pick(DOC_BOOK_SCENES);
    const x = F(amount(rng, 3000, 80000, 500));
    return {
      prompt: s.text(x, people(rng, 1)[0], pickBiz(rng)),
      correct: BOOK[s.book],
      distractors: bookOptions(s.book),
      explanation: s.because,
    };
  },
  verify: (q) => isBookName(q.options.find((o) => o.id === q.correct)?.text),
});

// ---------------------------------------------------------------------------------------------------------------
// Trade discount and the invoice
// ---------------------------------------------------------------------------------------------------------------

const sbNetInvoice = numericTemplate({
  id: 'sb-net-invoice',
  topicId: T,
  conceptId: K.td,
  difficulty: 'easy',
  unit: 'rupees',
  generate: (rng) => {
    const b = pickBiz(rng);
    const [p] = people(rng, 1);
    const list = amount(rng, 6000, 120000, 2000);
    const td = rng.pick([5, 10, 15, 20, 25]);
    const disc = percentOf(list, td);
    const net = list - disc;
    if (disc % 100 !== 0) return null;
    const working = [`Trade discount = ${td}% of ${F(list)} = ${F(disc)}.`, `Net amount = ${F(list)} - ${F(disc)} = ${F(net)}.`];
    switch (rng.pick(['buy', 'sell', 'discount', 'list'] as const)) {
      case 'buy':
        return {
          prompt: `${p} supplied ${b.goods} to ${b.name} on credit. The invoice shows a list price of ${F(list)} less ${td}% trade discount. At what amount does ${b.name} enter the purchase in the Purchases Book? (Ignore GST.)`,
          answer: net,
          commonErrors: [
            { value: list, why: 'Entered the list price; trade discount is deducted before the entry is made.' },
            { value: disc, why: 'Entered the trade discount itself instead of the price after deducting it.' },
            { value: list + disc, why: 'Added the trade discount to the list price instead of deducting it.' },
          ],
          explanation: working,
        };
      case 'sell':
        return {
          prompt: `${b.name} sold ${b.goods} to ${p} on credit at a list price of ${F(list)} less ${td}% trade discount. What amount is entered in the Sales Book? (Ignore GST.)`,
          answer: net,
          commonErrors: [
            { value: list, why: 'Entered the list price; trade discount is deducted before the entry is made.' },
            { value: disc, why: 'Entered the trade discount itself instead of the price after deducting it.' },
            { value: list + disc, why: 'Added the trade discount to the list price instead of deducting it.' },
          ],
          explanation: working,
        };
      case 'discount':
        return {
          prompt: `An invoice for ${b.goods} has a list price of ${F(list)} and a trade discount of ${td}%. How much is the trade discount?`,
          answer: disc,
          commonErrors: [
            { value: net, why: 'Gave the price after discount instead of the discount itself.' },
            { value: list, why: 'Gave the list price instead of the discount.' },
          ],
          explanation: [`Trade discount = ${td}% of ${F(list)} = ${F(disc)}.`],
        };
      default:
        return {
          prompt: `${b.name} entered a credit purchase of ${b.goods} in the Purchases Book at ${F(net)}, which was the price after a ${td}% trade discount on the list price. What was the list price?`,
          answer: list,
          commonErrors: [
            { value: net, why: 'Gave the net amount as the list price, without working back from the discount.' },
            { value: net + percentOf(net, td), why: `Took ${td}% of the net amount; the discount is ${td}% of the list price, which is a larger sum.` },
          ],
          explanation: [`Net amount = ${100 - td}% of the list price.`, `List price = ${F(net)} × 100 ÷ ${100 - td} = ${F(list)}.`],
        };
    }
  },
  verify: (q) => {
    const [m] = moneyIn(q.prompt);
    const [td] = pctIn(q.prompt);
    if (q.prompt.includes('What was the list price')) return q.answer * (100 - td) === m * 100;
    if (q.prompt.includes('How much is the trade discount')) return q.answer * 100 === m * td;
    return q.answer * 100 === m * (100 - td);
  },
});

interface DiscScene {
  trade: boolean;
  text: (pct: number, b: Biz) => string;
}
const DISC_SCENES: DiscScene[] = [
  { trade: true, text: (pct, b) => `${b.name} deducts ${pct}% from its catalogue prices on the invoice for every dealer who orders 100 or more items.` },
  { trade: true, text: (pct, b) => `A wholesaler shows ${pct}% less than the list price on the bill of every retailer, such as ${b.name}.` },
  { trade: true, text: (pct, b) => `${b.name} buys in bulk and the supplier reduces the list price by ${pct}% on the invoice.` },
  { trade: false, text: (pct, b) => `A supplier offers ${pct}% off the amount due if ${b.name} pays within 10 days, and ${b.name} pays on the 7th day.` },
  { trade: false, text: (pct, b) => `${b.name} allows a customer ${pct}% less than the invoice amount for payment within a fortnight, and the customer pays in time.` },
  { trade: false, text: (pct, b) => `${b.name} pays its supplier early and is allowed ${pct}% off the invoice amount as a reward for prompt payment.` },
];
const TRADE_TREATMENT = 'deducted on the invoice; only the net amount is recorded and no discount account is used';
const CASH_TREATMENT = 'recorded in the books: Discount Allowed by the seller and Discount Received by the buyer';
const sbTradeOrCash = mcqTemplate({
  id: 'sb-trade-or-cash-discount',
  topicId: T,
  conceptId: K.td,
  difficulty: 'easy',
  generate: (rng) => {
    const s = rng.pick(DISC_SCENES);
    // A trade discount runs to 20% or more; a cash discount for paying a few days early is a few per cent.
    const pct = s.trade ? rng.pick([5, 10, 15, 20, 25]) : rng.pick([1, 2, 3, 5]);
    const right = s.trade ? `Trade discount, ${TRADE_TREATMENT}` : `Cash discount, ${CASH_TREATMENT}`;
    const otherLabel = s.trade ? `Cash discount, ${CASH_TREATMENT}` : `Trade discount, ${TRADE_TREATMENT}`;
    return {
      prompt: `${s.text(pct, pickBiz(rng))} How is this discount treated in the books?`,
      correct: right,
      distractors: s.trade
        ? [
            { text: otherLabel, why: 'Called a deduction made on the invoice itself a cash discount; cash discount is a reward for prompt payment.' },
            { text: `Trade discount, ${CASH_TREATMENT}`, why: 'Named it correctly but recorded it, although trade discount never reaches the books.' },
            { text: `Cash discount, ${TRADE_TREATMENT}`, why: 'Mixed the two discounts completely: the label and the treatment both belong to the other kind.' },
          ]
        : [
            { text: otherLabel, why: 'Called a reward for prompt payment a trade discount; trade discount is deducted on the invoice.' },
            { text: `Cash discount, ${TRADE_TREATMENT}`, why: 'Named it correctly but ignored it in the books, although cash discount is recorded as a loss or a gain.' },
            { text: `Trade discount, ${CASH_TREATMENT}`, why: 'Mixed the two discounts completely: the label and the treatment both belong to the other kind.' },
          ],
      explanation: s.trade
        ? 'Trade discount is allowed on the list price and shown on the invoice, so books record only the net price. It is never a separate entry.'
        : 'Cash discount is allowed for prompt payment, after the sale, so it is recorded: it is a loss for the seller and a gain for the buyer.',
    };
  },
  verify: (q) => (q.options.find((o) => o.id === q.correct)?.text ?? '').startsWith(/list price|catalogue/.test(q.prompt) ? 'Trade discount' : 'Cash discount'),
});

// ---------------------------------------------------------------------------------------------------------------
// GST on an invoice
// ---------------------------------------------------------------------------------------------------------------

const sbGstIntra = numericTemplate({
  id: 'sb-gst-intra',
  topicId: T,
  conceptId: K.gst,
  difficulty: 'easy',
  unit: 'rupees',
  generate: (rng) => {
    const b = pickGstBiz(rng);
    const [p] = people(rng, 1);
    const base = amount(rng, 10000, 100000, 2000);
    const rate = b.rate;
    const t = taxOn(base, { rate, intra: true });
    if (!t) return null;
    const buy = rng.pick([true, false]);
    const total = base + t.tax;
    const head = buy
      ? `${b.name} buys ${b.goods} for ${F(base)} (after trade discount) from ${p}, a supplier in the same state.`
      : `${b.name} sells ${b.goods} for ${F(base)} (after trade discount) to ${p}, a customer in the same state.`;
    const rule = `GST at ${rate}% is charged as CGST and SGST in equal parts.`;
    const steps = [`GST = ${rate}% of ${F(base)} = ${F(t.tax)}.`, `CGST = SGST = ${F(t.tax)} ÷ 2 = ${F(t.cgst)}.`];
    if (rng.pick(['component', 'total'] as const) === 'component') {
      const ask = buy ? 'How much is debited to Input CGST A/c for this invoice?' : 'How much is credited to Output SGST A/c for this invoice?';
      return {
        prompt: `${head} ${rule} ${ask}`,
        answer: t.cgst,
        commonErrors: [
          { value: t.tax, why: 'Gave the whole GST, charging the full rate for one tax; CGST and SGST are each only half of it.' },
          { value: total, why: 'Gave the invoice total instead of one part of the tax.' },
          { value: base, why: 'Gave the price of the goods instead of the tax on it.' },
        ],
        explanation: steps,
      };
    }
    const ask = buy ? `What is the invoice total payable to ${p}?` : `What is the invoice total to be recovered from ${p}?`;
    return {
      prompt: `${head} ${rule} ${ask}`,
      answer: total,
      commonErrors: [
        { value: base + t.cgst, why: 'Added only one of the two taxes (CGST) to the price.' },
        { value: base, why: 'Left GST out of the invoice total.' },
        { value: base + 2 * t.tax, why: 'Charged GST twice, once as CGST and once as SGST at the full rate.' },
      ],
      explanation: [...steps, `Invoice total = ${F(base)} + ${F(t.tax)} = ${F(total)}.`],
    };
  },
  verify: (q) => {
    const [base] = moneyIn(q.prompt);
    const [rate] = pctIn(q.prompt);
    return /invoice total/.test(q.prompt) ? q.answer * 100 === base * (100 + rate) : q.answer * 200 === base * rate;
  },
});

const sbGstInter = numericTemplate({
  id: 'sb-gst-inter',
  topicId: T,
  conceptId: K.gst,
  difficulty: 'easy',
  unit: 'rupees',
  generate: (rng) => {
    const b = pickGstBiz(rng);
    const [p] = people(rng, 1);
    const base = amount(rng, 10000, 100000, 2000);
    const rate = b.rate;
    const t = taxOn(base, { rate, intra: false });
    if (!t) return null;
    const buy = rng.pick([true, false]);
    const total = base + t.tax;
    const head = buy
      ? `${b.name} buys ${b.goods} for ${F(base)} (after trade discount) from ${p}, a supplier in another state.`
      : `${b.name} sells ${b.goods} for ${F(base)} (after trade discount) to ${p}, a customer in another state.`;
    const rule = `GST at ${rate}% is charged as IGST.`;
    if (rng.pick(['igst', 'total'] as const) === 'igst') {
      const ask = buy ? 'How much is debited to Input IGST A/c for this invoice?' : 'How much is credited to Output IGST A/c for this invoice?';
      return {
        prompt: `${head} ${rule} ${ask}`,
        answer: t.igst,
        commonErrors: [
          { value: t.igst / 2, why: 'Gave only half the tax, as if it were split into CGST and SGST; a supply between states carries IGST in full.' },
          { value: total, why: 'Gave the invoice total instead of the tax.' },
          { value: base, why: 'Gave the price of the goods instead of the tax on it.' },
        ],
        explanation: [`IGST = ${rate}% of ${F(base)} = ${F(t.igst)}.`],
      };
    }
    const ask = buy ? `What is the invoice total payable to ${p}?` : `What is the invoice total to be recovered from ${p}?`;
    return {
      prompt: `${head} ${rule} ${ask}`,
      answer: total,
      commonErrors: [
        { value: base + t.igst / 2, why: 'Added only half the tax, as if CGST and SGST were being charged; IGST is charged in full.' },
        { value: base, why: 'Left GST out of the invoice total.' },
        { value: t.igst, why: 'Gave the tax alone as the invoice total.' },
      ],
      explanation: [`IGST = ${rate}% of ${F(base)} = ${F(t.igst)}.`, `Invoice total = ${F(base)} + ${F(t.igst)} = ${F(total)}.`],
    };
  },
  verify: (q) => {
    const [base] = moneyIn(q.prompt);
    const [rate] = pctIn(q.prompt);
    return /invoice total/.test(q.prompt) ? q.answer * 100 === base * (100 + rate) : q.answer * 100 === base * rate;
  },
});

const sbGstRate = numericTemplate({
  id: 'sb-gst-rate',
  topicId: T,
  conceptId: K.gst,
  difficulty: 'easy',
  unit: 'percent',
  generate: (rng) => {
    const b = pickBiz(rng);
    const rate = rng.pick(RATES);
    switch (rng.pick(['cgst', 'igst', 'sgst'] as const)) {
      case 'cgst':
        return {
          prompt: `A product carries GST at ${rate}%. ${b.name} sells it to a customer in the same state. At what rate, in per cent, is CGST charged on the invoice?`,
          answer: rate * 50,
          commonErrors: [
            { value: rate * 100, why: 'Took the whole GST rate as CGST; the rate is shared equally between CGST and SGST.' },
            { value: rate * 200, why: 'Doubled the rate instead of halving it.' },
          ],
          explanation: [`Within a state, GST is split equally between CGST and SGST.`, `CGST rate = ${rate}% ÷ 2 = ${rate / 2}%.`],
        };
      case 'igst':
        return {
          prompt: `${b.name} buys goods from a supplier in the same state, and the invoice shows CGST at ${rate / 2}% and SGST at ${rate / 2}%. At what rate, in per cent, would IGST be charged if the supplier were in another state?`,
          answer: rate * 100,
          commonErrors: [
            { value: rate * 50, why: 'Charged IGST at the rate of just one of the two taxes; IGST equals CGST and SGST together.' },
            { value: rate * 200, why: 'Charged IGST on top of CGST and SGST; IGST takes their place, at their combined rate.' },
          ],
          explanation: ['IGST takes the place of CGST and SGST together.', `IGST rate = ${rate / 2}% + ${rate / 2}% = ${rate}%.`],
        };
      default:
        return {
          prompt: `A customer in another state is charged IGST at ${rate}%. At what rate, in per cent, would SGST be charged if the customer were in the same state?`,
          answer: rate * 50,
          commonErrors: [
            { value: rate * 100, why: 'Took the whole IGST rate as SGST; SGST is only half of it.' },
            { value: rate * 200, why: 'Doubled the rate instead of halving it.' },
          ],
          explanation: ['Within a state, the IGST rate is split equally between CGST and SGST.', `SGST rate = ${rate}% ÷ 2 = ${rate / 2}%.`],
        };
    }
  },
  verify: (q) => {
    const [pct] = pctIn(q.prompt);
    if (q.prompt.includes('would IGST be charged')) return q.answer === Math.round(pct * 2 * 100);
    return q.answer * 2 === Math.round(pct * 100);
  },
});

const sbWhichGstColumns = mcqTemplate({
  id: 'sb-which-gst-columns',
  topicId: T,
  conceptId: K.gst,
  difficulty: 'easy',
  generate: (rng) => {
    const b = pickBiz(rng);
    const [p] = people(rng, 1);
    const [s1, s2] = rng.shuffle(['Karnataka', 'Maharashtra', 'Tamil Nadu', 'Gujarat', 'Kerala', 'Punjab', 'Rajasthan', 'Uttar Pradesh']);
    const buy = rng.pick([true, false]);
    const intra = rng.pick([true, false]);
    const dir = buy ? 'Input' : 'Output';
    const side = buy ? 'debit' : 'credit';
    const other = buy ? 'Output' : 'Input';
    const otherSide = buy ? 'credit' : 'debit';
    const book = buy ? 'Purchases Book' : 'Sales Book';
    const cgst = (d: string, s: string) => `CGST and SGST columns, posted to ${d} CGST A/c and ${d} SGST A/c (${s})`;
    const igst = (d: string, s: string) => `IGST column, posted to ${d} IGST A/c (${s})`;
    const where = intra ? `${s1}` : `${s2}`;
    const prompt = buy
      ? `${b.name} of ${s1} buys goods on credit from ${p} of ${where}. In which GST columns of the Purchases Book is the tax shown?`
      : `${b.name} of ${s1} sells goods on credit to ${p} of ${where}. In which GST columns of the Sales Book is the tax shown?`;
    const right = intra ? cgst(dir, side) : igst(dir, side);
    const wrongKind = intra ? igst(dir, side) : cgst(dir, side);
    const oppositeDir = intra ? cgst(other, otherSide) : igst(other, otherSide);
    const bothWrong = intra ? igst(other, otherSide) : cgst(other, otherSide);
    return {
      prompt,
      correct: right,
      distractors: [
        { text: wrongKind, why: 'Mixed up the two kinds of tax: CGST and SGST are charged within a state, IGST between states.' },
        { text: oppositeDir, why: buy ? 'Used the output tax accounts for tax paid on a purchase; tax paid on purchases is input tax.' : 'Used the input tax accounts for tax collected on a sale; tax collected on sales is output tax.' },
        { text: bothWrong, why: 'Mixed up both the kind of tax and whether it is input or output.' },
        { text: `No separate column; the tax is added to the ${buy ? 'Purchases' : 'Sales'} A/c`, why: buy ? 'Added the tax to the cost of goods instead of recording it separately as input tax.' : 'Added the tax to sales instead of recording it separately as output tax owed to the government.' },
      ],
      explanation: intra
        ? `Both parties are in ${s1}, so the supply is within the state: tax is charged as CGST and SGST and shown in the ${book} ${buy ? 'as input tax (debit)' : 'as output tax (credit)'}.`
        : `The parties are in different states (${s1} and ${s2}), so tax is charged as IGST and shown in the ${book} ${buy ? 'as input tax (debit)' : 'as output tax (credit)'}.`,
    };
  },
  verify: (q) => {
    const right = q.options.find((o) => o.id === q.correct)?.text ?? '';
    const m = /of ([A-Za-z ]+?) (?:buys|sells) .* of ([A-Za-z ]+)\. In which/.exec(q.prompt);
    if (!m) return false;
    return right.startsWith(m[1] === m[2] ? 'CGST' : 'IGST') && right.includes(q.prompt.includes(' buys ') ? 'Input' : 'Output');
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Totals of a book, net figures
// ---------------------------------------------------------------------------------------------------------------

const sbBookTotalSimple = numericTemplate({
  id: 'sb-book-total-simple',
  topicId: T,
  conceptId: K.totals,
  difficulty: 'easy',
  unit: 'rupees',
  generate: (rng) => {
    const b = pickBiz(rng);
    const m = month(rng);
    const n = rng.pick([3, 4]);
    const ds = days(rng, n);
    const ps = people(rng, n);
    const amts = Array.from({ length: n }, () => amount(rng, 4000, 60000, 500));
    const purchases = rng.pick([true, false]);
    const book = purchases ? 'Purchases Book' : 'Sales Book';
    const kind = purchases ? 'credit purchase' : 'credit sale';
    const line = (i: number) => `${ds[i]} ${m}: ${ps[i]}, ${F(amts[i])}`;
    const total = sum(amts);
    if (rng.pick(['total', 'missing'] as const) === 'total') {
      return {
        prompt: `${b.name} writes its ${book} for ${m} from these ${kind} invoices (no GST): ${amts.map((_, i) => `(${i + 1}) ${line(i)}`).join('; ')}. What is the total of the ${book} for the month?`,
        answer: total,
        commonErrors: [
          { value: total - amts[n - 1], why: 'Left out the last invoice.' },
          { value: total - amts[0], why: 'Left out the first invoice.' },
          { value: total + amts[0], why: 'Counted the first invoice twice.' },
        ],
        explanation: [`Total = ${amts.map(F).join(' + ')}.`, `Total of the ${book} = ${F(total)}.`],
      };
    }
    const shown = amts.slice(0, n - 1);
    return {
      prompt: `The ${book} of ${b.name} for ${m} totals ${F(total)}. The ${kind} invoices already found are: ${shown.map((_, i) => `(${i + 1}) ${line(i)}`).join('; ')}. The last invoice, ${purchases ? 'from' : 'to'} ${ps[n - 1]} on ${ds[n - 1]} ${m}, is missing. What is its amount?`,
      answer: amts[n - 1],
      commonErrors: [
        { value: total + sum(shown), why: 'Added the invoices already found to the total instead of deducting them.' },
        { value: sum(shown), why: 'Gave the total of the invoices already found instead of the missing one.' },
        { value: total - shown[0], why: 'Deducted only the first invoice instead of all the invoices already found.' },
      ],
      explanation: [`Invoices found = ${shown.map(F).join(' + ')} = ${F(sum(shown))}.`, `Missing invoice = ${F(total)} - ${F(sum(shown))} = ${F(amts[n - 1])}.`],
    };
  },
  verify: (q) => {
    const m = moneyIn(q.prompt);
    return q.prompt.includes('is missing') ? q.answer === m[0] - sum(m.slice(1)) : q.answer === sum(m);
  },
});

const sbNetFigure = numericTemplate({
  id: 'sb-net-figure',
  topicId: T,
  conceptId: K.returns,
  difficulty: 'easy',
  unit: 'rupees',
  generate: (rng) => {
    const b = pickBiz(rng);
    const m = month(rng);
    const gross = amount(rng, 20000, 400000, 5000);
    const ret = amount(rng, 1000, Math.floor(gross / 100 / 4), 500);
    const net = gross - ret;
    const purchases = rng.pick([true, false]);
    const [bk, rbk, noun] = purchases ? ['Purchases Book', 'Purchases Return Book', 'purchases'] : ['Sales Book', 'Sales Return Book', 'sales'];
    switch (rng.pick(['net', 'gross', 'returns'] as const)) {
      case 'net':
        return {
          prompt: `For ${m}, the ${bk} of ${b.name} totals ${F(gross)} and the ${rbk} totals ${F(ret)}. What are the net ${noun} for the month?`,
          answer: net,
          commonErrors: [
            { value: gross + ret, why: `Added the returns to the ${noun} instead of deducting them.` },
            { value: gross, why: `Gave the ${noun} before returns.` },
            { value: ret, why: 'Gave the returns instead of the net figure.' },
          ],
          explanation: [`Net ${noun} = ${noun} - returns.`, `${F(gross)} - ${F(ret)} = ${F(net)}.`],
        };
      case 'gross':
        return {
          prompt: `After returns of ${F(ret)}, the net ${noun} of ${b.name} for ${m} came to ${F(net)}. What was the total of the ${bk} for the month?`,
          answer: gross,
          commonErrors: [
            { value: net - ret, why: 'Deducted the returns again instead of adding them back.' },
            { value: net, why: 'Gave the net figure, which is already after returns.' },
          ],
          explanation: [`Net ${noun} = ${noun} - returns, so ${noun} = net ${noun} + returns.`, `${F(net)} + ${F(ret)} = ${F(gross)}.`],
        };
      default:
        return {
          prompt: `For ${m}, the ${bk} of ${b.name} totals ${F(gross)} and the net ${noun} are ${F(net)}. What is the total of the ${rbk}?`,
          answer: ret,
          commonErrors: [
            { value: gross + net, why: 'Added the two figures instead of finding the difference.' },
            { value: net, why: 'Gave the net figure instead of the returns.' },
          ],
          explanation: [`Returns = ${noun} - net ${noun}.`, `${F(gross)} - ${F(net)} = ${F(ret)}.`],
        };
    }
  },
  verify: (q) => {
    const [a, c] = moneyIn(q.prompt);
    if (q.prompt.includes('What are the net')) return q.answer === a - c;
    if (q.prompt.includes('What was the total of the')) return q.answer === a + c;
    return q.answer === Math.abs(a - c);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Posting
// ---------------------------------------------------------------------------------------------------------------

interface TotalScene {
  book: Book;
  correct: string;
  wrong: [string, string][];
}
const TOTAL_SCENES: TotalScene[] = [
  {
    book: 'pb',
    correct: 'Debit Purchases A/c',
    wrong: [
      ['Credit Purchases A/c', 'Posted it to the wrong side: Purchases is an expense, so it is increased by a debit.'],
      ['Credit Purchases Return A/c', 'Mixed the Purchases Book with the Purchases Return Book.'],
      ['Debit Sales A/c', 'Mixed up the two books: goods bought go to the Purchases A/c, not the Sales A/c.'],
      ['Credit Sales A/c', 'Took goods bought for goods sold.'],
    ],
  },
  {
    book: 'sb',
    correct: 'Credit Sales A/c',
    wrong: [
      ['Debit Sales A/c', 'Posted it to the wrong side: Sales is an income, so it is increased by a credit.'],
      ['Debit Sales Return A/c', 'Mixed the Sales Book with the Sales Return Book.'],
      ['Credit Purchases A/c', 'Mixed up the two books: goods sold go to the Sales A/c, not the Purchases A/c.'],
      ['Debit Purchases A/c', 'Took goods sold for goods bought.'],
    ],
  },
  {
    book: 'prb',
    correct: 'Credit Purchases Return A/c',
    wrong: [
      ['Debit Purchases Return A/c', 'Posted it to the wrong side: Purchases Return reduces purchases, so it is increased by a credit.'],
      ['Debit Purchases A/c', 'Posted to the Purchases A/c, forgetting that returns have an account of their own.'],
      ['Credit Sales Return A/c', 'Mixed purchases returns with sales returns.'],
      ['Debit Sales Return A/c', 'Mixed purchases returns with sales returns, and used the wrong side as well.'],
    ],
  },
  {
    book: 'srb',
    correct: 'Debit Sales Return A/c',
    wrong: [
      ['Credit Sales Return A/c', 'Posted it to the wrong side: Sales Return reduces sales, so it is increased by a debit.'],
      ['Credit Sales A/c', 'Posted to the Sales A/c, forgetting that returns have an account of their own.'],
      ['Debit Purchases Return A/c', 'Mixed sales returns with purchases returns.'],
      ['Credit Purchases Return A/c', 'Mixed sales returns with purchases returns, and used the wrong side as well.'],
    ],
  },
];
const sbTotalPosting = mcqTemplate({
  id: 'sb-total-posting',
  topicId: T,
  conceptId: K.posting,
  difficulty: 'easy',
  generate: (rng) => {
    const s = rng.pick(TOTAL_SCENES);
    const b = pickBiz(rng);
    return {
      prompt: `At the end of ${month(rng)}, ${b.name} posts the totals of its subsidiary books to the ledger. The ${BOOK[s.book]} for the month adds up to ${F(amount(rng, 20000, 400000, 5000))} (before GST). Which posting is made for this total?`,
      correct: s.correct,
      distractors: s.wrong.map(([text, why]) => ({ text, why })),
      explanation: `The periodic total of the ${BOOK[s.book]} is posted once: ${s.correct}.`,
    };
  },
  verify: (q) => {
    const right = q.options.find((o) => o.id === q.correct)?.text ?? '';
    const scene = TOTAL_SCENES.find((s) => q.prompt.includes(`The ${BOOK[s.book]} for the month`));
    return scene !== undefined && right === scene.correct;
  },
});

interface PartyScene {
  book: Book;
  text: (x: string, p: string, b: Biz) => string;
  correct: (p: string) => string;
  wrong: (p: string) => [string, string][];
}
const PARTY_SCENES: PartyScene[] = [
  {
    book: 'pb',
    text: (x, p, b) => `${b.name} enters an invoice for ${x} from ${p}, for goods bought on credit, in the Purchases Book.`,
    correct: (p) => `Credit ${p} A/c`,
    wrong: (p) => [
      [`Debit ${p} A/c`, `Debited the supplier; the business now owes ${p}, so the account of ${p} is credited.`],
      [`Debit Purchases A/c with this invoice, leaving ${p} A/c alone`, `Skipped the supplier's account; each invoice is posted to the supplier's account, and the Purchases A/c is posted with the total later.`],
      ['Credit Purchases A/c with this invoice', 'Credited Purchases, but purchases are an expense, increased by a debit; the supplier is the account credited.'],
    ],
  },
  {
    book: 'sb',
    text: (x, p, b) => `${b.name} enters an invoice for ${x} to ${p}, for goods sold on credit, in the Sales Book.`,
    correct: (p) => `Debit ${p} A/c`,
    wrong: (p) => [
      [`Credit ${p} A/c`, `Credited the customer; ${p} now owes the business, so the account of ${p} is debited.`],
      [`Credit Sales A/c with this invoice, leaving ${p} A/c alone`, `Skipped the customer's account; each invoice is posted to the customer's account, and the Sales A/c is posted with the total later.`],
      ['Debit Sales A/c with this invoice', 'Debited Sales, but sales are an income, increased by a credit; the customer is the account debited.'],
    ],
  },
  {
    book: 'prb',
    text: (x, p, b) => `${b.name} enters a debit note for ${x} to ${p}, for goods returned to ${p}, in the Purchases Return Book.`,
    correct: (p) => `Debit ${p} A/c`,
    wrong: (p) => [
      [`Credit ${p} A/c`, `Credited the supplier again, as at the purchase; a return reduces what is owed, so the account of ${p} is debited.`],
      [`Credit Purchases Return A/c with this note, leaving ${p} A/c alone`, `Skipped the supplier's account; each debit note is posted to the supplier's account, and the Purchases Return A/c is posted with the total later.`],
      ['Debit Purchases Return A/c with this note', 'Debited Purchases Return, but it increases by a credit; the supplier is the account debited.'],
    ],
  },
  {
    book: 'srb',
    text: (x, p, b) => `${b.name} enters a credit note for ${x} to ${p}, for goods returned by ${p}, in the Sales Return Book.`,
    correct: (p) => `Credit ${p} A/c`,
    wrong: (p) => [
      [`Debit ${p} A/c`, `Debited the customer again, as at the sale; a return reduces what ${p} owes, so the account of ${p} is credited.`],
      [`Debit Sales Return A/c with this note, leaving ${p} A/c alone`, `Skipped the customer's account; each credit note is posted to the customer's account, and the Sales Return A/c is posted with the total later.`],
      ['Credit Sales Return A/c with this note', 'Credited Sales Return, but it increases by a debit; the customer is the account credited.'],
    ],
  },
];
const sbPartyPosting = mcqTemplate({
  id: 'sb-party-posting',
  topicId: T,
  conceptId: K.posting,
  difficulty: 'easy',
  generate: (rng) => {
    const s = rng.pick(PARTY_SCENES);
    const [p] = people(rng, 1);
    const x = F(amount(rng, 3000, 80000, 500));
    return {
      prompt: `${s.text(x, p, pickBiz(rng))} Which posting is made to the ledger for this one entry?`,
      correct: s.correct(p),
      distractors: s.wrong(p).map(([text, why]) => ({ text, why })),
      explanation: `Individual entries of a book are posted to the party's account: ${s.correct(p)}.`,
    };
  },
  verify: (q) => {
    const right = q.options.find((o) => o.id === q.correct)?.text ?? '';
    const debit = q.prompt.includes('Sales Book') || q.prompt.includes('Purchases Return Book');
    return right.startsWith(debit ? 'Debit' : 'Credit') && right.endsWith(' A/c') && !/Purchases|Sales/.test(right);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Journal proper: assets on credit (easy), then entries (medium)
// ---------------------------------------------------------------------------------------------------------------

const ASSETS = [
  { id: 'furniture', name: 'Furniture', bought: 'furniture for the office', sold: 'old furniture' },
  { id: 'machinery', name: 'Machinery', bought: 'a machine for the workshop', sold: 'an old machine' },
  { id: 'computers', name: 'Computers', bought: 'computers for the billing counter', sold: 'old computers' },
  { id: 'officeEquipment', name: 'Office Equipment', bought: 'an air-conditioner for the shop', sold: 'an old air-conditioner' },
  { id: 'vehicles', name: 'Vehicles', bought: 'a delivery van', sold: 'an old delivery van' },
];

const sbAssetCreditPurchase = journalTemplate({
  id: 'sb-asset-credit-purchase',
  topicId: T,
  conceptId: K.jp,
  difficulty: 'easy',
  generate: (rng) => {
    const b = pickBiz(rng);
    const [p] = people(rng, 1);
    const a = rng.pick(ASSETS);
    const x = amount(rng, 10000, 300000, 5000);
    return {
      prompt: `${b.name} bought ${a.bought} for ${F(x)} on credit from ${p}. Pass the entry made in the Journal Proper. (Ignore GST.)`,
      lines: [
        { accountId: a.id, side: 'Dr', amount: x },
        { accountId: creditor(p), side: 'Cr', amount: x },
      ],
      explanation: [
        `${a.name} is a fixed asset, not goods for resale, so the Purchases Book is not used: the entry is made in the Journal Proper.`,
        `${a.name} A/c is debited because the asset comes in.`,
        `${p} is credited because the business owes ${p} the price.`,
      ],
      distractorAccounts: ['purchases'],
      hints: ['Is this an asset or goods for resale? Nothing is paid now, so who is owed?', 'The asset that comes in is debited; the supplier who is owed is credited.'],
    };
  },
  verify: (q) => {
    const [x] = moneyIn(q.prompt);
    return q.expected.length === 2 && q.expected.every((l) => l.amount === x) && !q.expected.some((l) => l.accountId === 'purchases');
  },
});

const sbAssetCreditSale = journalTemplate({
  id: 'sb-asset-credit-sale',
  topicId: T,
  conceptId: K.jp,
  difficulty: 'easy',
  generate: (rng) => {
    const b = pickBiz(rng);
    const [p] = people(rng, 1);
    const a = rng.pick(ASSETS);
    const x = amount(rng, 5000, 200000, 5000);
    return {
      prompt: `${b.name} sold ${a.sold} to ${p} on credit at book value (${F(x)}), so there is no profit or loss. Pass the entry made in the Journal Proper. (Ignore GST.)`,
      lines: [
        { accountId: debtor(p), side: 'Dr', amount: x },
        { accountId: a.id, side: 'Cr', amount: x },
      ],
      explanation: [
        `${a.name} is a fixed asset, not goods in which the business deals, so the Sales Book is not used: the entry is made in the Journal Proper.`,
        `${p} owes the business the price, so ${p} is debited.`,
        `${a.name} A/c is credited because the asset goes out.`,
      ],
      distractorAccounts: ['sales'],
      hints: ['Is this an asset or goods in which the business deals? Nothing is received now, so who owes?', 'The customer who owes is debited; the asset that goes out is credited.'],
    };
  },
  verify: (q) => {
    const [x] = moneyIn(q.prompt);
    return q.expected.length === 2 && q.expected.every((l) => l.amount === x) && !q.expected.some((l) => l.accountId === 'sales');
  },
});

// ---------------------------------------------------------------------------------------------------------------
// MEDIUM: invoice value, book totals, returns
// ---------------------------------------------------------------------------------------------------------------

const sbInvoiceTotal = numericTemplate({
  id: 'sb-invoice-total',
  topicId: T,
  conceptId: K.td,
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const b = pickGstBiz(rng);
    const [p] = people(rng, 1);
    const list = amount(rng, 12000, 200000, 4000);
    const td = rng.pick([10, 20, 25]);
    const g: Gst = { rate: b.rate, intra: rng.pick([true, false]) };
    const inv = makeInv(1, p, list, td, g);
    const onList = taxOn(list, g);
    if (!inv || !onList) return null;
    const how = g.intra ? `CGST and SGST, ${p} being in the same state` : `IGST, ${p} being in another state`;
    const head = `${p} invoices ${b.name} for ${b.goods} at a list price of ${F(list)} less ${td}% trade discount. GST at ${g.rate}% (${how}) is charged on the price after trade discount.`;
    const steps = [
      `Trade discount = ${td}% of ${F(list)} = ${F(list - inv.net)}; price after discount = ${F(inv.net)}.`,
      `GST = ${g.rate}% of ${F(inv.net)} = ${F(inv.tax)}${g.intra ? ` (CGST ${F(inv.cgst)} + SGST ${F(inv.sgst)})` : ' (IGST)'}.`,
    ];
    switch (rng.pick(['total', 'tax', 'net'] as const)) {
      case 'total':
        return {
          prompt: `${head} What is the invoice total, which is the amount credited to the account of ${p}?`,
          answer: inv.total,
          commonErrors: [
            { value: inv.net, why: 'Left GST out of the invoice total.' },
            { value: list + onList.tax, why: 'Ignored the trade discount and charged GST on the full list price.' },
            { value: inv.net + onList.tax, why: 'Charged GST on the list price instead of the price after trade discount.' },
          ],
          explanation: [...steps, `Invoice total = ${F(inv.net)} + ${F(inv.tax)} = ${F(inv.total)}.`],
        };
      case 'tax':
        return {
          prompt: `${head} What is the total GST shown on the invoice?`,
          answer: inv.tax,
          commonErrors: [
            { value: onList.tax, why: 'Charged GST on the list price instead of the price after trade discount.' },
            { value: inv.total, why: 'Gave the invoice total instead of the GST alone.' },
            { value: g.intra ? inv.cgst : inv.igst / 2, why: g.intra ? 'Gave only CGST; the invoice shows CGST and SGST together.' : 'Halved the tax as if it were split into CGST and SGST.' },
          ],
          explanation: steps,
        };
      default:
        return {
          prompt: `${head} At what amount is the purchase debited to Purchases A/c?`,
          answer: inv.net,
          commonErrors: [
            { value: list, why: 'Debited the list price; trade discount is deducted before the entry.' },
            { value: inv.total, why: 'Included the GST in Purchases A/c; GST is debited to the Input GST accounts.' },
            { value: list + onList.tax, why: 'Debited the list price plus GST on it, ignoring the trade discount.' },
          ],
          explanation: [steps[0], 'Purchases A/c is debited with the price after trade discount only; the GST goes to the Input GST accounts.'],
        };
    }
  },
  verify: (q) => {
    const [list] = moneyIn(q.prompt);
    const [td, rate] = pctIn(q.prompt);
    const net = (list * (100 - td)) / 100;
    if (q.prompt.includes('What is the invoice total')) return q.answer * 10000 === list * (100 - td) * (100 + rate);
    if (q.prompt.includes('total GST')) return q.answer * 10000 === list * (100 - td) * rate;
    return q.answer === net;
  },
});

/** Purchases Book or Sales Book written from three invoices with trade discount and GST. */
function bookTotals(id: string, purchases: boolean) {
  return numericTemplate({
    id,
    topicId: T,
    conceptId: K.totals,
    difficulty: 'medium',
    unit: 'rupees',
    generate: (rng) => {
      const b = pickGstBiz(rng);
      const m = month(rng);
      const g: Gst = { rate: b.rate, intra: rng.pick([true, false]) };
      const ds = days(rng, 3);
      const ps = people(rng, 3);
      const invs: Inv[] = [];
      for (let i = 0; i < 3; i++) {
        const inv = makeInv(ds[i], ps[i], amount(rng, 12000, 120000, 4000), rng.pick([10, 20, 25]), g);
        if (!inv) return null;
        invs.push(inv);
      }
      const onList = invs.map((v) => taxOn(v.list, g));
      if (onList.some((t) => t === null)) return null;
      const listTax = sum(onList.map((t) => t!.tax));
      const [net, tax, total, cgst, igst, list] = [
        sum(invs.map((v) => v.net)),
        sum(invs.map((v) => v.tax)),
        sum(invs.map((v) => v.total)),
        sum(invs.map((v) => v.cgst)),
        sum(invs.map((v) => v.igst)),
        sum(invs.map((v) => v.list)),
      ];
      const [party, side] = purchases ? ['suppliers', 'Input'] : ['customers', 'Output'];
      const [book, acct] = purchases ? ['Purchases Book', 'Purchases A/c'] : ['Sales Book', 'Sales A/c'];
      const how = g.intra ? `CGST ${g.rate / 2}% + SGST ${g.rate / 2}%` : 'IGST';
      const who = purchases ? 'All the suppliers' : 'All the customers';
      const where = g.intra ? 'are in the same state' : 'are in other states';
      const lines = invs.map((v, i) => `(${i + 1}) ${v.day} ${m}: ${v.party}, list price ${F(v.list)} less ${v.td}% trade discount`).join('; ');
      const head = `${b.name} writes its ${book} for ${m} from these invoices for ${b.goods}. ${who} ${where}, and GST at ${g.rate}% (${how}) is charged on the price after trade discount. ${lines}.`;
      const asks: ('total' | 'net' | 'column')[] = ['total', 'net', 'column'];
      const ask = rng.pick(asks);
      if (ask === 'total') {
        return {
          prompt: `${head} What is the grand total of the book, which is the total of the ${party}' accounts?`,
          answer: total,
          commonErrors: [
            { value: net, why: 'Left GST out of the grand total.' },
            { value: list + listTax, why: 'Ignored the trade discount and charged GST on the list prices.' },
            { value: net + listTax, why: 'Charged GST on the list prices instead of the prices after trade discount.' },
          ],
          explanation: [`Prices after trade discount: ${invs.map((v) => F(v.net)).join(' + ')} = ${F(net)}.`, `GST = ${g.rate}% of ${F(net)} = ${F(tax)}.`, `Grand total = ${F(net)} + ${F(tax)} = ${F(total)}.`],
        };
      }
      if (ask === 'net') {
        return {
          prompt: `${head} What amount is ${purchases ? 'debited to' : 'credited to'} ${acct} when the total of the book is posted?`,
          answer: net,
          commonErrors: [
            { value: list, why: 'Posted the list prices; trade discount is deducted before the entry.' },
            { value: total, why: `Posted the grand total; the GST goes to the ${side} GST accounts, not to ${acct}.` },
            { value: list + listTax, why: 'Posted the list prices with GST on them, ignoring the trade discount.' },
          ],
          explanation: [`Prices after trade discount: ${invs.map((v) => F(v.net)).join(' + ')} = ${F(net)}.`, `${acct} gets the total of these prices; GST is posted separately.`],
        };
      }
      const colName = g.intra ? `${side} CGST` : `${side} IGST`;
      const colAmount = g.intra ? cgst : igst;
      return {
        prompt: `${head} What is the total of the ${colName} column?`,
        answer: colAmount,
        commonErrors: g.intra
          ? [
              { value: tax, why: 'Gave CGST and SGST together; the CGST column holds only half the tax.' },
              { value: sum(onList.map((t) => t!.cgst)), why: 'Worked out GST on the list prices instead of the prices after trade discount.' },
              { value: net, why: 'Gave the total of the prices instead of the tax column.' },
            ]
          : [
              { value: sum(onList.map((t) => t!.igst)), why: 'Worked out GST on the list prices instead of the prices after trade discount.' },
              { value: igst / 2, why: 'Halved the tax as if it were split into CGST and SGST.' },
              { value: net, why: 'Gave the total of the prices instead of the tax column.' },
            ],
        explanation: [`Prices after trade discount: ${invs.map((v) => F(v.net)).join(' + ')} = ${F(net)}.`, `${colName} = ${g.intra ? `${g.rate / 2}%` : `${g.rate}%`} of ${F(net)} = ${F(colAmount)}.`],
      };
    },
    verify: (q) => {
      const lists = moneyIn(q.prompt);
      const tds = [...q.prompt.matchAll(/less (\d+)% trade discount/g)].map((x) => Number(x[1]));
      const rate = Number(/GST at (\d+)%/.exec(q.prompt)?.[1]);
      const intra = q.prompt.includes('CGST');
      if (lists.length !== 3 || tds.length !== 3 || !(rate > 0)) return false;
      const nets = lists.map((l, i) => (l * (100 - tds[i])) / 100);
      const netSum = sum(nets);
      if (q.prompt.includes('grand total')) return q.answer * 100 === netSum * (100 + rate);
      if (q.prompt.includes('when the total of the book is posted')) return q.answer === netSum;
      return intra ? q.answer * 200 === netSum * rate : q.answer * 100 === netSum * rate;
    },
  });
}
const sbPurchasesBookGst = bookTotals('sb-purchases-book-gst', true);
const sbSalesBookGst = bookTotals('sb-sales-book-gst', false);

/** Five or six transactions of a month; the total of the Purchases (or Sales) Book is only the credit ones in goods. */
function bookSort(id: string, purchases: boolean) {
  return numericTemplate({
    id,
    topicId: T,
    conceptId: K.book,
    difficulty: 'medium',
    unit: 'rupees',
    generate: (rng) => {
      const b = pickBiz(rng);
      const m = month(rng);
      const nCredit = rng.pick([2, 3]);
      const kinds = rng.shuffle<'credit' | 'cash' | 'asset' | 'ret'>([...Array<'credit'>(nCredit).fill('credit'), 'cash', 'asset', 'ret']);
      const ds = days(rng, kinds.length);
      const ps = people(rng, kinds.length);
      const amts = kinds.map((k) => (k === 'ret' ? amount(rng, 1000, 6000, 500) : amount(rng, 3000, 60000, 500)));
      if (new Set(amts).size !== amts.length) return null;
      const assetAt = rng.int(0, 3);
      const assetBought = ['furniture for the office', 'a computer for the office', 'an air-conditioner for the office', 'a refrigerator for the staff room'][assetAt];
      const assetSold = ['old furniture', 'an old computer', 'an old air-conditioner', 'an old refrigerator'][assetAt];
      const nos = invoiceNos(rng, kinds.length, !purchases);
      const text = (kind: string, i: number): string => {
        const inv = `invoice no. ${nos[i]}`;
        switch (kind) {
          case 'credit':
            return purchases ? `goods bought on credit from ${ps[i]} (${inv})` : `goods sold on credit to ${ps[i]} (${inv})`;
          case 'cash':
            return purchases ? 'goods bought and paid for in cash' : 'goods sold for cash over the counter';
          case 'asset':
            return purchases ? `${assetBought} bought on credit from ${ps[i]}` : `${assetSold} of the business sold on credit to ${ps[i]}`;
          default:
            return purchases ? `goods returned to ${ps[i]}, from whom they were bought on credit` : `goods returned by ${ps[i]}, to whom they were sold on credit`;
        }
      };
      const items = kinds.map((k, i) => `(${i + 1}) ${ds[i]} ${m}: ${text(k, i)}, ${F(amts[i])}`);
      const pick = (k: string) => sum(amts.filter((_, i) => kinds[i] === k));
      const answer = pick('credit');
      const book = purchases ? 'Purchases Book' : 'Sales Book';
      return {
        prompt: `These transactions of ${b.name} took place in ${m}: ${items.join('; ')}. What is the total of the ${book} for the month?`,
        answer,
        commonErrors: [
          { value: answer + pick('cash'), why: `Included a cash ${purchases ? 'purchase' : 'sale'}; cash transactions go to the Cash Book.` },
          { value: answer + pick('asset'), why: `Included an asset ${purchases ? 'bought' : 'sold'} on credit; that is a Journal Proper entry, because an asset is not goods in which the business deals.` },
          { value: answer - pick('ret'), why: `Deducted the goods returned; returns have their own book, so the ${book} total is shown before them.` },
          { value: answer + pick('cash') + pick('asset'), why: `Included everything ${purchases ? 'bought' : 'sold'}, whether for cash or on credit, goods or asset; only credit ${purchases ? 'purchases' : 'sales'} of goods belong in the ${book}.` },
        ],
        explanation: [
          `Only credit ${purchases ? 'purchases' : 'sales'} of goods are recorded in the ${book}.`,
          `Cash ${purchases ? 'purchases' : 'sales'} go to the Cash Book, the asset to the Journal Proper and the return to the ${purchases ? 'Purchases' : 'Sales'} Return Book.`,
          `Total = ${amts.filter((_, i) => kinds[i] === 'credit').map(F).join(' + ')} = ${F(answer)}.`,
        ],
      };
    },
    verify: (q) => {
      const key = purchases ? 'goods bought on credit from' : 'goods sold on credit to';
      const parts = q.prompt.split(/\(\d+\) /).filter((s) => s.includes(key));
      return q.answer === sum(parts.flatMap((s) => moneyIn(s)));
    },
  });
}
const sbPurchasesBookSort = bookSort('sb-purchases-book-sort', true);
const sbSalesBookSort = bookSort('sb-sales-book-sort', false);

const sbReturnAtNet = numericTemplate({
  id: 'sb-return-at-net',
  topicId: T,
  conceptId: K.returns,
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const b = pickBiz(rng);
    const [p] = people(rng, 1);
    const list = amount(rng, 20000, 200000, 4000);
    const ret = amount(rng, 2000, Math.floor(list / 100 / 2), 2000);
    const td = rng.pick([5, 10, 20, 25]);
    const netList = list - percentOf(list, td);
    const netRet = ret - percentOf(ret, td);
    if (netList % 100 !== 0 || netRet % 100 !== 0) return null;
    const purchases = rng.pick([true, false]);
    const head = purchases
      ? `${b.name} bought ${b.goods} of list price ${F(list)} from ${p} on credit at ${td}% trade discount. Later, goods of list price ${F(ret)} were returned to ${p}.`
      : `${b.name} sold ${b.goods} of list price ${F(list)} to ${p} on credit at ${td}% trade discount. Later, ${p} returned goods of list price ${F(ret)}.`;
    const rbk = purchases ? 'Purchases Return Book' : 'Sales Return Book';
    const noun = purchases ? 'purchases' : 'sales';
    const steps = [
      `Original ${noun} at net price = ${F(list)} - ${td}% = ${F(netList)}.`,
      `Return at net price = ${F(ret)} - ${td}% = ${F(netRet)}, because the goods were charged at the discounted price.`,
    ];
    if (rng.pick(['ret', 'net'] as const) === 'ret') {
      return {
        prompt: `${head} At what amount is the return entered in the ${rbk}? (Ignore GST.)`,
        answer: netRet,
        commonErrors: [
          { value: ret, why: 'Entered the return at list price; the goods were charged at the price after trade discount, so they come back at that price.' },
          { value: percentOf(ret, td), why: 'Entered the trade discount on the returned goods instead of their net price.' },
          { value: ret + percentOf(ret, td), why: 'Added the trade discount to the list price of the returned goods.' },
        ],
        explanation: [steps[1]],
      };
    }
    return {
      prompt: `${head} What are the net ${noun} from this dealing with ${p}, after the return? (Ignore GST.)`,
      answer: netList - netRet,
      commonErrors: [
        { value: netList - ret, why: 'Deducted the return at list price from the net amount, but both must be at the discounted price.' },
        { value: list - ret, why: 'Ignored the trade discount altogether.' },
        { value: netList, why: 'Forgot to deduct the goods returned.' },
      ],
      explanation: [...steps, `Net ${noun} = ${F(netList)} - ${F(netRet)} = ${F(netList - netRet)}.`],
    };
  },
  verify: (q) => {
    const [list, ret] = moneyIn(q.prompt);
    const [td] = pctIn(q.prompt);
    return q.prompt.includes('At what amount is the return') ? q.answer * 100 === ret * (100 - td) : q.answer * 100 === (list - ret) * (100 - td);
  },
});

const UNIT_GOODS = (b: Biz) => `units of ${b.goods}`;
const sbDebitNoteAmount = numericTemplate({
  id: 'sb-debit-note-amount',
  topicId: T,
  conceptId: K.doc,
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const b = pickBiz(rng);
    const [p] = people(rng, 1);
    const qty = rng.pick([40, 50, 60, 80, 100, 120, 150, 200]);
    const ret = rng.pick([5, 8, 10, 12, 15, 20]);
    const price = rupees(rng.step(100, 1500, 50));
    const td = rng.pick([10, 20, 25]);
    const unitNet = (price * (100 - td)) / 100;
    if (!Number.isInteger(unitNet) || unitNet % 100 !== 0 || (ret * price * td) % 10000 !== 0) return null;
    const retNet = ret * unitNet;
    const buyer = rng.pick([true, false]);
    const note = buyer ? 'debit note' : 'credit note';
    const head = buyer
      ? `${b.name} bought ${qty} ${UNIT_GOODS(b)} from ${p} on credit at ${F(price)} per unit (list price) less ${td}% trade discount. ${ret} units were damaged and sent back.`
      : `${b.name} sold ${qty} ${UNIT_GOODS(b)} to ${p} on credit at ${F(price)} per unit (list price) less ${td}% trade discount. ${p} sent back ${ret} units that were damaged.`;
    return {
      prompt: `${head} What is the amount of the ${note} issued by ${b.name}? (Ignore GST.)`,
      answer: retNet,
      commonErrors: [
        { value: ret * price, why: 'Valued the returned units at list price; they were charged at the price after trade discount.' },
        { value: qty * unitNet, why: 'Raised the note for the whole invoice instead of only the units returned.' },
        { value: (ret * price * td) / 100, why: 'Gave the trade discount on the returned units instead of their net value.' },
      ],
      explanation: [`Net price per unit = ${F(price)} - ${td}% = ${F(unitNet)}.`, `${note[0].toUpperCase() + note.slice(1)} = ${ret} × ${F(unitNet)} = ${F(retNet)}.`],
    };
  },
  verify: (q) => {
    const [price] = moneyIn(q.prompt);
    const [qty, ret] = [...q.prompt.matchAll(/(\d+) units/g)].map((m) => Number(m[1]));
    const td = Number(/(\d+)% trade discount/.exec(q.prompt)?.[1]);
    return qty > ret && q.answer * 100 === ret * price * (100 - td);
  },
});

function partyBalance(id: string, creditorSide: boolean) {
  return numericTemplate({
    id,
    topicId: T,
    conceptId: K.posting,
    difficulty: 'medium',
    unit: 'rupees',
    generate: (rng) => {
      const b = pickBiz(rng);
      const m = month(rng);
      const [p] = people(rng, 1);
      const open = amount(rng, 10000, 80000, 1000);
      const a1 = amount(rng, 5000, 60000, 1000);
      const a2 = amount(rng, 5000, 60000, 1000);
      const r = amount(rng, 1000, Math.floor(Math.min(a1, a2) / 100), 500);
      const total = open + a1 + a2 - r;
      const pay = amount(rng, 1000, Math.floor(total / 100 / 2), 1000);
      const answer = total - pay;
      const head = creditorSide
        ? `At the start of ${m}, ${b.name} owed ${p} ${F(open)}. During ${m} the Purchases Book showed two invoices from ${p}, of ${F(a1)} and ${F(a2)} (each including GST); the Purchases Return Book showed a debit note for ${F(r)}; and ${F(pay)} was paid to ${p} by cheque. How much does ${b.name} owe ${p} at the end of ${m}?`
        : `At the start of ${m}, ${p} owed ${b.name} ${F(open)}. During ${m} the Sales Book showed two invoices to ${p}, of ${F(a1)} and ${F(a2)} (each including GST); the Sales Return Book showed a credit note for ${F(r)}; and ${F(pay)} was received from ${p} by cheque. How much does ${p} owe ${b.name} at the end of ${m}?`;
      return {
        prompt: head,
        answer,
        commonErrors: [
          { value: open + a1 + a2 + r - pay, why: `Added the ${creditorSide ? 'debit' : 'credit'} note instead of deducting it; a return reduces the balance.` },
          { value: open + a1 + a2 - r, why: 'Forgot the cheque, which also reduces the balance (it is recorded in the Cash Book).' },
          { value: a1 + a2 - r - pay, why: 'Left out the opening balance.' },
        ],
        explanation: [
          creditorSide ? "Credit side of the supplier's account: opening balance and the invoices." : "Debit side of the customer's account: opening balance and the invoices.",
          creditorSide ? 'Debit side: the debit note and the payment.' : 'Credit side: the credit note and the receipt.',
          `Balance = ${F(open)} + ${F(a1)} + ${F(a2)} - ${F(r)} - ${F(pay)} = ${F(answer)}.`,
        ],
      };
    },
    verify: (q) => {
      const [open, a1, a2, r, pay] = moneyIn(q.prompt);
      return q.answer === open + a1 + a2 - r - pay;
    },
  });
}
const sbCreditorBalance = partyBalance('sb-creditor-balance', true);
const sbDebtorBalance = partyBalance('sb-debtor-balance', false);

// GST on returns: which account and which side
const sbGstOnReturns = mcqTemplate({
  id: 'sb-gst-on-returns',
  topicId: T,
  conceptId: K.returns,
  difficulty: 'medium',
  generate: (rng) => {
    const b = pickBiz(rng);
    const [p] = people(rng, 1);
    const purchase = rng.pick([true, false]);
    const intra = rng.pick([true, false]);
    const tax = F(amount(rng, 1000, 30000, 500));
    const note = purchase ? 'debit note' : 'credit note';
    const book = purchase ? 'Purchases Return Book' : 'Sales Return Book';
    const kind = intra ? 'CGST and SGST' : 'IGST';
    const prompt = purchase
      ? `${b.name} returns goods bought from ${p} ${intra ? 'of the same state' : 'of another state'} and issues a ${note}. The ${note} shows ${intra ? `${tax} as CGST and the same amount as SGST` : `${tax} as IGST`}. How is the tax posted from the ${book}?`
      : `${p} ${intra ? 'of the same state' : 'of another state'} returns goods bought from ${b.name}, which issues a ${note}. The ${note} shows ${intra ? `${tax} as CGST and the same amount as SGST` : `${tax} as IGST`}. How is the tax posted from the ${book}?`;
    const acc = (dir: 'Input' | 'Output', side: 'Debit' | 'Credit') => (intra ? `${side} ${dir} CGST A/c and ${dir} SGST A/c` : `${side} ${dir} IGST A/c`);
    const [rightDir, rightSide] = purchase ? (['Input', 'Credit'] as const) : (['Output', 'Debit'] as const);
    const [otherDir, otherSide] = purchase ? (['Output', 'Debit'] as const) : (['Input', 'Credit'] as const);
    const flip = (s: 'Debit' | 'Credit') => (s === 'Debit' ? 'Credit' : 'Debit');
    return {
      prompt,
      correct: acc(rightDir, rightSide),
      distractors: [
        { text: acc(rightDir, flip(rightSide)), why: `Posted the tax on the same side as the original ${purchase ? 'purchase' : 'sale'}; a return reverses it, so it goes on the opposite side.` },
        {
          text: acc(otherDir, otherSide),
          why: purchase
            ? 'Posted it as if it were a sales return: output tax is debited when a customer sends goods back, not when goods go back to a supplier.'
            : 'Posted it as if it were a purchases return: input tax is credited when goods go back to a supplier, not when a customer sends goods back.',
        },
        {
          text: acc(otherDir, flip(otherSide)),
          why: purchase ? 'Chose the right side but the output tax accounts; the tax on goods bought is input tax.' : 'Chose the right side but the input tax accounts; the tax on goods sold is output tax.',
        },
        { text: purchase ? 'Credit Purchases Return A/c with the tax as well' : 'Debit Sales Return A/c with the tax as well', why: 'Added the tax to the return account instead of reversing it in the GST accounts.' },
      ],
      explanation: `The original ${purchase ? 'purchase' : 'sale'} ${purchase ? 'debited' : 'credited'} the ${rightDir.toLowerCase()} tax (${kind}); the return reverses it, so the posting is: ${acc(rightDir, rightSide)}.`,
    };
  },
  verify: (q) => {
    const right = q.options.find((o) => o.id === q.correct)?.text ?? '';
    const purchase = q.prompt.includes('Purchases Return Book');
    return purchase ? right.startsWith('Credit Input') : right.startsWith('Debit Output');
  },
});

// Which one is NOT recorded in the Purchases (Sales) Book
interface Item {
  text: (x: string, p: string, b: Biz) => string;
  goesTo?: string;
}
const PB_IN: Item[] = [
  { text: (x, p) => `goods worth ${x} bought on credit from ${p}` },
  { text: (x, p, b) => `${b.goods} costing ${x} bought on 45 days' credit from ${p}` },
  { text: (x, p) => `goods worth ${x} received from ${p} with an invoice, payment due next month` },
  { text: (x, p) => `a lot of goods worth ${x} bought on credit from ${p}, GST charged separately` },
];
const PB_OUT: Item[] = [
  { text: (x) => `goods worth ${x} bought for cash`, goesTo: 'the Cash Book' },
  { text: (x) => `goods worth ${x} bought and paid for by cheque`, goesTo: 'the Cash Book' },
  { text: (x, p) => `furniture worth ${x} bought on credit from ${p}`, goesTo: 'the Journal Proper' },
  { text: (x, p) => `a computer for the office, worth ${x}, bought on credit from ${p}`, goesTo: 'the Journal Proper' },
  { text: (x, p) => `goods worth ${x} returned to ${p}, from whom they had been bought on credit`, goesTo: 'the Purchases Return Book' },
  { text: (x, p) => `goods worth ${x} sold on credit to ${p}`, goesTo: 'the Sales Book' },
];
const SB_IN: Item[] = [
  { text: (x, p) => `goods worth ${x} sold on credit to ${p}` },
  { text: (x, p, b) => `${b.goods} worth ${x} supplied to ${p} on 30 days' credit` },
  { text: (x, p) => `goods worth ${x} sent to ${p} with an invoice, payment due next month` },
  { text: (x, p) => `a lot of goods worth ${x} sold on credit to ${p}, GST charged separately` },
];
const SB_OUT: Item[] = [
  { text: (x) => `goods worth ${x} sold for cash`, goesTo: 'the Cash Book' },
  { text: (x) => `goods worth ${x} sold against a cheque received on the spot`, goesTo: 'the Cash Book' },
  { text: (x, p) => `old furniture of the business sold for ${x} on credit to ${p}`, goesTo: 'the Journal Proper' },
  { text: (x, p) => `an old computer of the business sold for ${x} on credit to ${p}`, goesTo: 'the Journal Proper' },
  { text: (x, p) => `goods worth ${x} returned by ${p}, to whom they had been sold on credit`, goesTo: 'the Sales Return Book' },
  { text: (x, p) => `goods worth ${x} bought on credit from ${p}`, goesTo: 'the Purchases Book' },
];
const cap = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);
function notInBook(id: string, purchases: boolean) {
  const inPool = purchases ? PB_IN : SB_IN;
  const outPool = purchases ? PB_OUT : SB_OUT;
  const book = purchases ? 'Purchases Book' : 'Sales Book';
  return mcqTemplate({
    id,
    topicId: T,
    conceptId: K.book,
    difficulty: 'medium',
    generate: (rng) => {
      const b = pickBiz(rng);
      const ps = people(rng, 4);
      const xs = rng.shuffle([3000, 4500, 6000, 7500, 9000, 12000, 15000, 18000, 24000, 30000, 36000, 45000]).slice(0, 4).map(rupees);
      const out = rng.pick(outPool);
      const ins = rng.shuffle(inPool).slice(0, 3);
      const right = cap(out.text(F(xs[0]), ps[0], b));
      return {
        prompt: `Which one of these transactions of ${b.name} is NOT recorded in the ${book}?`,
        correct: right,
        distractors: ins.map((it, i) => ({
          text: cap(it.text(F(xs[i + 1]), ps[i + 1], b)),
          why: `This is a credit ${purchases ? 'purchase of goods for resale' : 'sale of goods in which the business deals'}, which is exactly what the ${book} records.`,
        })),
        explanation: `${right.charAt(0).toUpperCase() + right.slice(1)} belongs in ${out.goesTo}. The other three are credit ${purchases ? 'purchases' : 'sales'} of goods, which the ${book} records.`,
      };
    },
    verify: (q) => {
      const right = q.options.find((o) => o.id === q.correct)?.text ?? '';
      const credit = purchases ? /bought on credit from|on 45 days|received from .* with an invoice|a lot of goods/ : /sold on credit to|supplied to|sent to .* with an invoice|a lot of goods/;
      const isIn = (t: string) => credit.test(t) && !/furniture|computer|returned/i.test(t);
      return !isIn(right) && q.options.filter((o) => o.id !== q.correct).every((o) => isIn(o.text));
    },
  });
}
const sbNotInPurchasesBook = notInBook('sb-not-in-purchases-book', true);
const sbNotInSalesBook = notInBook('sb-not-in-sales-book', false);

// ---------------------------------------------------------------------------------------------------------------
// MEDIUM journal proper entries
// ---------------------------------------------------------------------------------------------------------------

const sbOpeningEntry = journalTemplate({
  id: 'sb-opening-entry',
  topicId: T,
  conceptId: K.jp,
  difficulty: 'medium',
  generate: (rng) => {
    const b = pickBiz(rng);
    const [d, c] = people(rng, 2);
    const asset = rng.pick([
      { id: 'furniture', name: 'furniture' },
      { id: 'machinery', name: 'machinery' },
      { id: 'vehicles', name: 'a delivery van' },
    ]);
    const cash = amount(rng, 2000, 40000, 1000);
    const stock = amount(rng, 40000, 200000, 5000);
    const fixed = amount(rng, 20000, 100000, 5000);
    const owed = amount(rng, 10000, 60000, 1000);
    const owing = amount(rng, 10000, 80000, 1000);
    const capital = cash + stock + fixed + owed - owing;
    return {
      prompt: `On 1 April ${b.name} began the new year with: cash ${F(cash)}, stock of goods ${F(stock)}, ${asset.name} ${F(fixed)}, ${d} owing the business ${F(owed)}, and the business owing ${c} ${F(owing)}. Pass the opening entry in the Journal Proper, taking capital as the balancing figure.`,
      lines: [
        { accountId: 'cash', side: 'Dr', amount: cash },
        { accountId: 'stock', side: 'Dr', amount: stock },
        { accountId: asset.id, side: 'Dr', amount: fixed },
        { accountId: debtor(d), side: 'Dr', amount: owed },
        { accountId: creditor(c), side: 'Cr', amount: owing },
        { accountId: 'capital', side: 'Cr', amount: capital },
      ],
      explanation: [
        'An opening entry brings the old balances into the new books: every asset is debited and every liability and capital is credited.',
        `Assets = ${F(cash)} + ${F(stock)} + ${F(fixed)} + ${F(owed)} = ${F(cash + stock + fixed + owed)}.`,
        `Capital = assets - liabilities = ${F(cash + stock + fixed + owed)} - ${F(owing)} = ${F(capital)}.`,
      ],
      distractorAccounts: ['purchases', 'sales', 'bank'],
      hints: ['Which balances are assets and which are liabilities? Capital is what is left.', 'Assets are debited. Liabilities and capital are credited.'],
    };
  },
  verify: (q) => {
    const dr = sum(q.expected.filter((l) => l.side === 'Dr').map((l) => l.amount));
    const owing = q.expected.find((l) => l.accountId.startsWith('creditor:'))?.amount ?? 0;
    const capital = q.expected.find((l) => l.accountId === 'capital')?.amount ?? 0;
    const given = moneyIn(q.prompt);
    return dr - owing === capital && sum(given) === dr + owing;
  },
});

const GOODS_OUT = [
  { id: 'drawings', text: (x: string, b: Biz) => `The owner of ${b.name} took ${b.goods} costing ${x} from the shop for personal use.`, why: 'Goods taken by the owner for personal use are drawings.' },
  { id: 'advertisement', text: (x: string, b: Biz) => `${b.name} gave ${b.goods} costing ${x} as free samples to prospective customers.`, why: 'Free samples are an advertising expense.' },
  { id: 'lossByFire', text: (x: string, b: Biz) => `${b.goods} costing ${x} were destroyed in a fire at ${b.name}; there was no insurance.`, why: 'Goods destroyed by fire without insurance are a loss.' },
  { id: 'lossByTheft', text: (x: string, b: Biz) => `${b.goods} costing ${x} were stolen from the godown of ${b.name}; there was no insurance.`, why: 'Goods stolen without insurance are a loss.' },
  { id: 'charity', text: (x: string, b: Biz) => `${b.name} donated ${b.goods} costing ${x} to a relief fund.`, why: 'Goods given away as a donation are a charity expense.' },
];
const sbGoodsNotSold = journalTemplate({
  id: 'sb-goods-not-sold',
  topicId: T,
  conceptId: K.jp,
  difficulty: 'medium',
  generate: (rng) => {
    const b = pickBiz(rng);
    const s = rng.pick(GOODS_OUT);
    const x = amount(rng, 2000, 60000, 500);
    return {
      prompt: `${cap(s.text(F(x), b))} Pass the entry in the Journal Proper, recording the goods at cost. (Ignore GST.)`,
      lines: [
        { accountId: s.id, side: 'Dr', amount: x },
        { accountId: 'purchases', side: 'Cr', amount: x },
      ],
      explanation: [`${s.why}`, 'No cash and no customer is involved, so the entry cannot go in the Cash Book or the Sales Book: it is a Journal Proper entry.', 'The goods were bought for resale but will not be sold, so they are taken out of purchases at cost: Purchases A/c is credited, not Sales A/c.'],
      distractorAccounts: ['sales', 'stock'],
      hints: ['No one pays for these goods, so this is not a sale. Where did the goods go?', 'Debit the account that describes where the goods went; credit the account to which the goods were debited when they were bought.'],
    };
  },
  verify: (q) => {
    const [x] = moneyIn(q.prompt);
    return q.expected.length === 2 && q.expected[1].accountId === 'purchases' && q.expected.every((l) => l.amount === x);
  },
});

function noteEntry(id: string, purchases: boolean) {
  return journalTemplate({
    id,
    topicId: T,
    conceptId: K.returns,
    difficulty: 'medium',
    generate: (rng) => {
      const b = pickGstBiz(rng);
      const [p] = people(rng, 1);
      const net = amount(rng, 6000, 100000, 2000);
      const g: Gst = { rate: b.rate, intra: rng.pick([true, false]) };
      const t = taxOn(net, g);
      if (!t) return null;
      const total = net + t.tax;
      const where = g.intra ? `CGST ${g.rate / 2}% and SGST ${g.rate / 2}%, within the state` : `IGST ${g.rate}%, between states`;
      const dir = purchases ? 'input' : 'output';
      const taxLine = (acc: string, a: Paise): JournalLine => ({ accountId: acc, side: purchases ? 'Cr' : 'Dr', amount: a });
      const taxes: JournalLine[] = g.intra
        ? [taxLine(`${dir}CGST`, t.cgst), taxLine(`${dir}SGST`, t.sgst)]
        : [taxLine(`${dir}IGST`, t.igst)];
      const lines: JournalLine[] = purchases
        ? [{ accountId: creditor(p), side: 'Dr', amount: total }, { accountId: 'purchasesReturn', side: 'Cr', amount: net }, ...taxes]
        : [{ accountId: 'salesReturn', side: 'Dr', amount: net }, ...taxes, { accountId: debtor(p), side: 'Cr', amount: total }];
      return {
        prompt: purchases
          ? `${b.name} returns goods to ${p}, a supplier, and sends a debit note: goods worth ${F(net)} after trade discount, plus GST (${where}) as charged on the original invoice. Pass the entry in the books of ${b.name}.`
          : `${p}, a credit customer, returns goods to ${b.name}, which sends a credit note: goods worth ${F(net)} after trade discount, plus GST (${where}) as charged on the original invoice. Pass the entry in the books of ${b.name}.`,
        lines,
        explanation: purchases
          ? [`The return reverses the purchase: ${p} is debited with the full amount, ${F(total)}.`, `Purchases Return A/c is credited with ${F(net)}.`, `The input tax claimed on the purchase is given back, so Input ${g.intra ? 'CGST and SGST are' : 'IGST is'} credited.`]
          : [`The return reverses the sale: Sales Return A/c is debited with ${F(net)}.`, `The output tax collected is no longer owed, so Output ${g.intra ? 'CGST and SGST are' : 'IGST is'} debited.`, `${p} is credited with the full amount, ${F(total)}.`],
        distractorAccounts: purchases ? ['purchases', 'inputIGST', 'inputCGST'] : ['sales', 'outputIGST', 'outputCGST'],
        hints: purchases ? ['A return undoes the purchase. Which accounts were debited and credited then?', 'Reverse each side of the original purchase entry, using Purchases Return A/c for the goods.'] : ['A return undoes the sale. Which accounts were debited and credited then?', 'Reverse each side of the original sale entry, using Sales Return A/c for the goods.'],
      };
    },
    verify: (q) => {
      const dr = sum(q.expected.filter((l) => l.side === 'Dr').map((l) => l.amount));
      const [net] = moneyIn(q.prompt);
      const goods = q.expected.find((l) => l.accountId === (purchases ? 'purchasesReturn' : 'salesReturn'));
      const party = q.expected.find((l) => l.accountId.startsWith(purchases ? 'creditor:' : 'debtor:'));
      return goods?.amount === net && party !== undefined && party.amount === sum(q.expected.filter((l) => l !== party).map((l) => l.amount)) && dr > net;
    },
  });
}
const sbDebitNoteEntry = noteEntry('sb-debit-note-entry', true);
const sbCreditNoteEntry = noteEntry('sb-credit-note-entry', false);

const ADJUST = [
  { text: (x: string, b: Biz) => `At the year end, ${b.name} owes ${x} of rent for the last month, which has not been paid.`, dr: 'rent', cr: 'outstandingExpenses', why: ['Rent for the year is a full expense even though the last month is unpaid.', 'Rent A/c is debited with the unpaid rent; Outstanding Expenses is a liability, so it is credited.'] },
  { text: (x: string, b: Biz) => `${b.name} paid an insurance premium and debited all of it to Insurance A/c; ${x} of it relates to the next year.`, dr: 'prepaidExpenses', cr: 'insurance', why: ['Only the part of the premium that belongs to this year is an expense.', 'Prepaid Expenses is an asset, so it is debited; Insurance A/c is reduced by crediting it.'] },
  { text: (x: string, b: Biz) => `${b.name} has earned interest of ${x} on its investments, but has not received it by the year end.`, dr: 'accruedIncome', cr: 'interestReceived', why: ['Interest earned belongs to this year even though it is not yet received.', 'Accrued Income is an asset, so it is debited; Interest Received is an income, so it is credited.'] },
  { text: (x: string, b: Biz) => `${b.name} received ${x} of rent for the next year in advance, and has credited it all to Rent Received A/c.`, dr: 'rentReceived', cr: 'incomeReceivedInAdvance', why: ['Rent for the next year is not an income of this year.', 'Rent Received A/c is debited to take it out; Income Received in Advance is a liability, so it is credited.'] },
  { text: (x: string, b: Biz) => `${b.name} has not yet paid the salary of ${x} for the last month of the year.`, dr: 'salaries', cr: 'outstandingExpenses', why: ['Salary for the year is a full expense even though the last month is unpaid.', 'Salaries A/c is debited with the unpaid salary; Outstanding Expenses is a liability, so it is credited.'] },
];
const sbAdjustingEntry = journalTemplate({
  id: 'sb-adjusting-entry',
  topicId: T,
  conceptId: K.jp,
  difficulty: 'medium',
  generate: (rng) => {
    const b = pickBiz(rng);
    const s = rng.pick(ADJUST);
    const x = amount(rng, 1000, 40000, 500);
    return {
      prompt: `${s.text(F(x), b)} Pass the adjusting entry in the Journal Proper.`,
      lines: [
        { accountId: s.dr, side: 'Dr', amount: x },
        { accountId: s.cr, side: 'Cr', amount: x },
      ],
      explanation: [...s.why, 'No cash moves, so the entry is made in the Journal Proper.'],
      distractorAccounts: ['cash', 'prepaidExpenses', 'outstandingExpenses'],
      hints: ['Decide which year the amount belongs to, and whether it is an asset, a liability, an income or an expense.', 'Assets and expenses are debited; liabilities and incomes are credited.'],
    };
  },
  verify: (q) => {
    const [x] = moneyIn(q.prompt);
    return q.expected.length === 2 && q.expected.every((l) => l.amount === x);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// COMPLEX
// ---------------------------------------------------------------------------------------------------------------

interface Dealer {
  who: string;
  item: string;
  one: string;
  /** Price of one item in rupees: lowest, highest, step. */
  price: [number, number, number];
}
const DEALERS: Dealer[] = [
  { who: 'A computer shop', item: 'laptops', one: 'a laptop', price: [30000, 60000, 5000] },
  { who: 'A furniture showroom', item: 'office tables', one: 'an office table', price: [4000, 12000, 500] },
  { who: 'An electrical goods shop', item: 'ceiling fans', one: 'a ceiling fan', price: [1500, 4000, 100] },
  { who: 'A bicycle shop', item: 'bicycles', one: 'a bicycle', price: [4000, 9000, 500] },
  { who: 'A mobile phone shop', item: 'mobile phones', one: 'a mobile phone', price: [8000, 30000, 1000] },
];
/** `lot` marks the scenes that deal in several items; the others deal in one. */
// Each scene carries a true detail that tempts a wrong book (an invoice comes with an asset as well as with goods),
// in place of the unrelated sentences version 1 added.
const PURPOSE: { book: Book; lot: boolean; text: (d: Dealer, x: string, p: string, n: number) => string; because: string; decoy: (p: string) => string }[] = [
  { book: 'pb', lot: true, text: (d, x, p, n) => `${d.who} buys ${n} ${d.item} from ${p} on credit for ${x}, to sell to its customers.`, because: 'The items are goods in which the business deals, bought on credit for resale: Purchases Book.', decoy: (p) => `${p} sent an invoice with the goods, payable in 30 days.` },
  { book: 'jp', lot: false, text: (d, x, p) => `${d.who} buys ${d.one} from ${p} on credit for ${x}, to use in the business itself and not to sell.`, because: 'Bought for use in the business, not for resale, so it is an asset bought on credit: Journal Proper.', decoy: (p) => `${p} sent an invoice with it, payable in 30 days.` },
  { book: 'sb', lot: true, text: (d, x, p, n) => `${d.who} sells ${n} ${d.item} from its stock to ${p} on credit for ${x}.`, because: 'The items are goods in which the business deals, sold on credit: Sales Book.', decoy: (p) => `An invoice was sent to ${p} with the goods.` },
  { book: 'jp', lot: false, text: (d, x, p) => `${d.who} sells ${d.one} that it had been using in the business itself, as a fixed asset, to ${p} on credit for ${x}.`, because: 'An asset used in the business, not goods for resale, sold on credit: Journal Proper.', decoy: (p) => `An invoice was sent to ${p} with it.` },
  { book: 'cb', lot: true, text: (d, x, _p, n) => `${d.who} buys ${n} ${d.item} for resale and pays ${x} by cheque at the time of purchase.`, because: 'Paid at once by cheque, so it is a Cash Book entry, not a credit purchase.', decoy: () => 'The supplier sent an invoice with the goods.' },
  { book: 'jp', lot: false, text: (d, x) => `The owner of ${d.who.toLowerCase()} takes ${d.one} from its stock for use at home; it cost ${x}.`, because: 'No sale, no cash and no supplier: goods taken by the owner are a Journal Proper entry.', decoy: () => 'The item is shown in the stock register at its cost.' },
];
const sbPurposeMatters = mcqTemplate({
  id: 'sb-purpose-matters',
  topicId: T,
  conceptId: K.book,
  difficulty: 'complex',
  generate: (rng) => {
    const d = rng.pick(DEALERS);
    const s = rng.pick(PURPOSE);
    const [p] = people(rng, 1);
    const n = rng.pick([4, 6, 8, 10, 12]);
    const x = F(amount(rng, ...d.price) * (s.lot ? n : 1));
    return {
      prompt: `${s.text(d, x, p, n)} ${s.decoy(p)} In which book is the transaction first recorded?`,
      correct: BOOK[s.book],
      distractors: bookOptions(s.book),
      explanation: s.because,
      hints: ['The same item can be goods in one transaction and an asset in another. What is it being used for here?', 'Goods for resale on credit go to the Purchases or Sales Book. An asset on credit goes to the Journal Proper. Paid at once goes to the Cash Book.'],
    };
  },
  verify: (q) => isBookName(q.options.find((o) => o.id === q.correct)?.text),
});

const sbMixedStateTotal = numericTemplate({
  id: 'sb-mixed-state-total',
  topicId: T,
  conceptId: K.gst,
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const b = pickGstBiz(rng);
    const m = month(rng);
    const rate = b.rate;
    const n = 4;
    const flags = rng.shuffle([true, false, rng.pick([true, false]), rng.pick([true, false])]);
    const ds = days(rng, n);
    const ps = people(rng, n);
    const here = rng.shuffle(['Pune', 'Nagpur', 'Nashik', 'Mumbai']);
    const there = rng.shuffle(['Indore', 'Surat', 'Hyderabad', 'Chennai', 'Jaipur', 'Kolkata']);
    const invs: Inv[] = [];
    for (let i = 0; i < n; i++) {
      const inv = makeInv(ds[i], ps[i], amount(rng, 12000, 120000, 4000), rng.pick([10, 20, 25]), { rate, intra: flags[i] });
      if (!inv) return null;
      invs.push(inv);
    }
    const cities = flags.map((f, i) => (f ? here[i] : there[i]));
    const lines = invs.map((v, i) => `(${i + 1}) ${v.day} ${m}: ${v.party} (${cities[i]}, ${flags[i] ? 'same state' : 'other state'}), list price ${F(v.list)} less ${v.td}% trade discount`).join('; ');
    const [net, cgst, sgst, igst, total, tax] = [
      sum(invs.map((v) => v.net)),
      sum(invs.map((v) => v.cgst)),
      sum(invs.map((v) => v.sgst)),
      sum(invs.map((v) => v.igst)),
      sum(invs.map((v) => v.total)),
      sum(invs.map((v) => v.tax)),
    ];
    const sameNet = sum(invs.filter((_, i) => flags[i]).map((v) => v.net));
    const head = `${b.name}, a trader in Maharashtra, records these credit purchases for ${m} in its Purchases Book. GST at ${rate}% is charged on the price after trade discount, as CGST and SGST when the supplier is in the same state and as IGST otherwise. ${lines}.`;
    const working = [`Prices after trade discount: ${invs.map((v) => F(v.net)).join(', ')}.`, `Same-state invoices carry CGST and SGST (each half the rate); other-state invoices carry IGST at the full rate.`];
    switch (rng.pick(['sgst', 'igst', 'total'] as const)) {
      case 'sgst':
        return {
          prompt: `${head} What is the total of the Input SGST column?`,
          answer: sgst,
          commonErrors: [
            { value: cgst + sgst, why: 'Added the CGST column to the SGST column; each column is posted to its own account.' },
            { value: tax / 2, why: 'Halved the IGST as well; IGST is not split into CGST and SGST.' },
            { value: igst, why: 'Gave the IGST column instead of the SGST column.' },
          ],
          explanation: [...working, `Same-state prices total ${F(sameNet)}; Input SGST = ${rate / 2}% of ${F(sameNet)} = ${F(sgst)}.`],
        };
      case 'igst':
        return {
          prompt: `${head} What is the total of the Input IGST column?`,
          answer: igst,
          commonErrors: [
            { value: tax, why: 'Included the CGST and SGST of the same-state invoices in the IGST column.' },
            { value: igst / 2, why: 'Halved the IGST as if it were split into CGST and SGST.' },
            { value: cgst + sgst, why: 'Gave the tax of the same-state invoices instead of the other-state ones.' },
          ],
          explanation: [...working, `Other-state prices total ${F(net - sameNet)}; Input IGST = ${rate}% of ${F(net - sameNet)} = ${F(igst)}.`],
        };
      default:
        return {
          prompt: `${head} What is the grand total of the book, which is the total of the suppliers' accounts?`,
          answer: total,
          commonErrors: [
            { value: net, why: 'Left all GST out of the grand total.' },
            { value: net + cgst + sgst, why: 'Left out the IGST of the other-state invoices.' },
            { value: net + igst, why: 'Left out the CGST and SGST of the same-state invoices.' },
          ],
          explanation: [...working, `Prices total ${F(net)}; the tax is ${rate}% of every invoice whichever way it is split, so GST = ${F(tax)}.`, `Grand total = ${F(net)} + ${F(tax)} = ${F(total)}.`],
        };
    }
  },
  verify: (q) => {
    const rate = Number(/GST at (\d+)%/.exec(q.prompt)?.[1]);
    const rows = [...q.prompt.matchAll(/\((?:[A-Za-z]+), (same state|other state)\), list price (₹[\d,]+) less (\d+)% trade discount/g)];
    if (rows.length !== 4) return false;
    const nets = rows.map((r) => ((parseRupees(r[2]) ?? NaN) * (100 - Number(r[3]))) / 100);
    const same = rows.map((r) => r[1] === 'same state');
    const taxOf = (i: number) => (nets[i] * rate) / 100;
    if (q.prompt.includes('Input SGST')) return q.answer * 2 === sum(nets.map((_, i) => (same[i] ? taxOf(i) : 0)));
    if (q.prompt.includes('Input IGST')) return q.answer === sum(nets.map((_, i) => (same[i] ? 0 : taxOf(i))));
    return q.answer === sum(nets) + sum(nets.map((_, i) => taxOf(i)));
  },
});

const sbReverseGst = numericTemplate({
  id: 'sb-reverse-gst',
  topicId: T,
  conceptId: K.gst,
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const b = pickGstBiz(rng);
    const [p] = people(rng, 1);
    const list = amount(rng, 20000, 200000, 4000);
    const td = rng.pick([10, 20, 25]);
    const g: Gst = { rate: b.rate, intra: rng.pick([true, false]) };
    const inv = makeInv(1, p, list, td, g);
    if (!inv) return null;
    const how = g.intra ? 'CGST and SGST' : 'IGST';
    const head = `${p} sent ${b.name} an invoice for ${b.goods} totalling ${F(inv.total)}. This includes GST at ${g.rate}% (${how}), charged on the price after a trade discount of ${td}% on the list price.`;
    const steps = [`Invoice total = price after discount × (100 + ${g.rate}) ÷ 100, so price after discount = ${F(inv.total)} × 100 ÷ ${100 + g.rate} = ${F(inv.net)}.`];
    switch (rng.pick(['list', 'net', 'tax'] as const)) {
      case 'list':
        return {
          prompt: `${head} What was the list price of the goods?`,
          answer: list,
          commonErrors: [
            { value: inv.net, why: 'Found the price after trade discount but forgot to work back to the list price.' },
            { value: whole(inv.total - percentOf(inv.total, g.rate)), why: `Deducted ${g.rate}% of the total to remove the GST; the GST is ${g.rate}% of the price before tax, which is smaller than ${g.rate}% of the total.` },
            { value: inv.total, why: 'Took the invoice total as the list price.' },
          ],
          explanation: [...steps, `Price after discount = ${100 - td}% of the list price, so list price = ${F(inv.net)} × 100 ÷ ${100 - td} = ${F(list)}.`],
        };
      case 'net':
        return {
          prompt: `${head} At what amount is the purchase debited to Purchases A/c?`,
          answer: inv.net,
          commonErrors: [
            { value: whole(inv.total - percentOf(inv.total, g.rate)), why: `Deducted ${g.rate}% of the total to remove the GST; the GST is ${g.rate}% of the price before tax, not of the total.` },
            { value: inv.total, why: 'Debited the invoice total to Purchases A/c, which would include the GST.' },
            { value: list, why: 'Gave the list price; Purchases A/c is debited with the price after trade discount.' },
          ],
          explanation: steps,
        };
      default:
        return {
          prompt: `${head} How much of the invoice total is GST?`,
          answer: inv.tax,
          commonErrors: [
            { value: whole(percentOf(inv.total, g.rate)), why: `Took ${g.rate}% of the total; the GST is ${g.rate}% of the price before tax.` },
            { value: percentOf(list, g.rate), why: 'Worked out GST on the list price; the tax is on the price after trade discount.' },
            { value: inv.net, why: 'Gave the price before tax instead of the tax.' },
          ],
          explanation: [...steps, `GST = ${F(inv.total)} - ${F(inv.net)} = ${F(inv.tax)}.`],
        };
    }
  },
  verify: (q) => {
    const [total] = moneyIn(q.prompt);
    const [rate, td] = pctIn(q.prompt);
    const net = (total * 100) / (100 + rate);
    if (!Number.isInteger(net)) return false;
    if (q.prompt.includes('list price of the goods')) return q.answer * (100 - td) === net * 100;
    if (q.prompt.includes('debited to Purchases')) return q.answer === net;
    return q.answer === total - net;
  },
});

const sbNetSalesGst = numericTemplate({
  id: 'sb-net-sales-gst',
  topicId: T,
  conceptId: K.returns,
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const b = pickGstBiz(rng);
    const m = month(rng);
    const g: Gst = { rate: b.rate, intra: rng.pick([true, false]) };
    const gross = amount(rng, 60000, 600000, 20000);
    const retNet = amount(rng, 4000, 40000, 2000);
    const t = taxOn(retNet, g);
    if (!t) return null;
    const retTotal = retNet + t.tax;
    const sales = rng.pick([true, false]);
    const [bk, rbk, note, noun] = sales ? ['Sales Book', 'Sales Return Book', 'credit notes', 'sales'] : ['Purchases Book', 'Purchases Return Book', 'debit notes', 'purchases'];
    return {
      prompt: `For ${m}, the ${bk} of ${b.name} shows ${noun} of ${F(gross)} before GST. During the month ${note} totalling ${F(retTotal)}, including GST at ${g.rate}%, were ${sales ? 'issued to customers' : 'sent to suppliers'} for goods returned. What are the net ${noun} for the month, before GST?`,
      answer: gross - retNet,
      commonErrors: [
        { value: gross - retTotal, why: `Deducted the ${note} with GST included; the ${rbk} figure for goods is before GST.` },
        { value: gross - whole(retTotal - percentOf(retTotal, g.rate)), why: `Removed GST as ${g.rate}% of the total; the GST is ${g.rate}% of the price before tax.` },
        { value: gross, why: 'Forgot to deduct the goods returned.' },
      ],
      explanation: [`The ${note} include GST, so the returns of goods = ${F(retTotal)} × 100 ÷ ${100 + g.rate} = ${F(retNet)}.`, `Net ${noun} = ${F(gross)} - ${F(retNet)} = ${F(gross - retNet)}.`],
    };
  },
  verify: (q) => {
    const [gross, retTotal] = moneyIn(q.prompt);
    const [rate] = pctIn(q.prompt);
    const ret = (retTotal * 100) / (100 + rate);
    return Number.isInteger(ret) && q.answer === gross - ret;
  },
});

const sbSupplierDue = numericTemplate({
  id: 'sb-supplier-due',
  topicId: T,
  conceptId: K.posting,
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const b = pickGstBiz(rng);
    const [p] = people(rng, 1);
    const qty = rng.pick([100, 150, 200, 250, 300]);
    const ret = rng.pick([10, 20, 25, 30, 40]);
    const price = rupees(rng.step(200, 1000, 100));
    const td = rng.pick([10, 20, 25]);
    const unitNet = (price * (100 - td)) / 100;
    if (!Number.isInteger(unitNet)) return null;
    const g = gstOfGoods(b, rng.pick([true, false]), [qty * unitNet, ret * unitNet]);
    if (!g) return null;
    const taxBill = taxOn(qty * unitNet, g);
    const taxRet = taxOn(ret * unitNet, g);
    if (!taxBill || !taxRet) return null;
    const bill = qty * unitNet + taxBill.tax;
    const credit = ret * unitNet + taxRet.tax;
    const due = bill - credit;
    const payRupees = Math.floor(due / 100 / 3 / 1000) * 1000;
    if (payRupees < 1000) return null;
    const pay = rupees(payRupees);
    const how = g.intra ? 'CGST and SGST' : 'IGST';
    return {
      prompt: `${b.name} bought ${qty} units of ${b.goods} from ${p} on credit at ${F(price)} per unit (list price) less ${td}% trade discount, with GST at ${g.rate}% (${how}) charged on the price after discount. It returned ${ret} units as defective and sent ${p} a debit note for their net value plus GST, which ${p} accepted. ${b.name} later paid ${F(pay)} by cheque. How much does ${b.name} still owe ${p}?`,
      answer: due - pay,
      commonErrors: [
        { value: bill - pay, why: 'Forgot the goods returned, which reduce the amount owed.' },
        { value: due, why: 'Forgot the cheque paid, which also reduces the amount owed.' },
        { value: qty * unitNet - ret * unitNet - pay, why: 'Left GST out of the invoice and the debit note.' },
      ],
      explanation: [
        `Net price per unit = ${F(price)} - ${td}% = ${F(unitNet)}.`,
        `Invoice = ${qty} × ${F(unitNet)} = ${F(qty * unitNet)}, plus GST ${F(taxBill.tax)} = ${F(bill)}.`,
        `Debit note = ${ret} × ${F(unitNet)} = ${F(ret * unitNet)}, plus GST ${F(taxRet.tax)} = ${F(credit)}.`,
        `Owed = ${F(bill)} - ${F(credit)} - ${F(pay)} = ${F(due - pay)}.`,
      ],
    };
  },
  verify: (q) => {
    const [price, pay] = moneyIn(q.prompt);
    const [qty, ret] = [...q.prompt.matchAll(/(\d+) units/g)].map((m) => Number(m[1]));
    const td = Number(/(\d+)% trade discount/.exec(q.prompt)?.[1]);
    const rate = Number(/GST at (\d+)%/.exec(q.prompt)?.[1]);
    const left = price * (qty - ret) * (100 - td) * (100 + rate);
    return left % 10000 === 0 && q.answer === left / 10000 - pay;
  },
});

const sbNetGstPayable = numericTemplate({
  id: 'sb-net-gst-payable',
  topicId: T,
  conceptId: K.gst,
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const b = pickBiz(rng);
    const m = month(rng);
    const out = amount(rng, 30000, 120000, 1000);
    const outRet = amount(rng, 1000, 15000, 500);
    const inp = amount(rng, 10000, 80000, 1000);
    const inRet = amount(rng, 500, 8000, 500);
    const answer = out - outRet - (inp - inRet);
    if (answer <= 0) return null;
    return {
      prompt: `For ${m}, the CGST columns of the four books of ${b.name} total: Sales Book ${F(out)}, Sales Return Book ${F(outRet)}, Purchases Book ${F(inp)} and Purchases Return Book ${F(inRet)}. These totals are posted to Output CGST A/c and Input CGST A/c, and the balance of Input CGST A/c is then set off against Output CGST A/c. Neither account had an opening balance, and no IGST is involved. How much CGST remains payable to the government for the month?`,
      answer,
      commonErrors: [
        { value: out - inp, why: 'Ignored the returns on both sides: sales returns reduce the output tax and purchase returns reduce the input tax.' },
        { value: out - outRet - inp, why: 'Deducted the sales returns but forgot that purchase returns reduce the input tax that can be set off.' },
        { value: out - (inp - inRet), why: 'Forgot that sales returns reduce the output tax.' },
        { value: out - outRet - inp - inRet, why: 'Deducted the tax on purchase returns as if it were more input tax; it reduces the input tax, so it is added back.' },
        { value: out - outRet, why: 'Gave the balance of Output CGST A/c without setting off the input tax.' },
      ],
      explanation: [
        `Output CGST A/c: credited ${F(out)} from the Sales Book and debited ${F(outRet)} from the Sales Return Book; balance ${F(out - outRet)} (credit).`,
        `Input CGST A/c: debited ${F(inp)} from the Purchases Book and credited ${F(inRet)} from the Purchases Return Book; balance ${F(inp - inRet)} (debit).`,
        `CGST payable = ${F(out - outRet)} - ${F(inp - inRet)} = ${F(answer)}.`,
      ],
    };
  },
  verify: (q) => {
    const [out, outRet, inp, inRet] = moneyIn(q.prompt);
    return q.answer === out - outRet - inp + inRet;
  },
});

const sbCreditNoteGst = numericTemplate({
  id: 'sb-credit-note-gst',
  topicId: T,
  conceptId: K.doc,
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const b = pickGstBiz(rng);
    const [p] = people(rng, 1);
    const qty = rng.pick([60, 80, 100, 120, 150, 200]);
    const ret = rng.pick([10, 12, 15, 20, 25]);
    const price = rupees(rng.step(200, 1000, 100));
    const td = rng.pick([10, 20, 25]);
    const unitNet = (price * (100 - td)) / 100;
    if (!Number.isInteger(unitNet)) return null;
    const g = gstOfGoods(b, rng.pick([true, false]), [qty * unitNet, ret * unitNet, ret * price]);
    if (!g) return null;
    const bill = taxOn(qty * unitNet, g);
    const t = taxOn(ret * unitNet, g);
    const onList = taxOn(ret * price, g);
    if (!bill || !t || !onList) return null;
    const retNet = ret * unitNet;
    const how = g.intra ? 'CGST and SGST' : 'IGST';
    const head = `${b.name} sold ${qty} units of ${b.goods} to ${p} on credit at ${F(price)} per unit (list price) less ${td}% trade discount, with GST at ${g.rate}% (${how}) charged on the price after discount. ${p} returned ${ret} units as defective, and ${b.name} issued a credit note.`;
    if (rng.pick(['total', 'gst'] as const) === 'total') {
      return {
        prompt: `${head} What is the total amount of the credit note, GST included?`,
        answer: retNet + t.tax,
        commonErrors: [
          { value: ret * price + onList.tax, why: 'Valued the returned units at list price and ignored the trade discount.' },
          { value: retNet, why: 'Left GST out of the credit note; GST charged on the sale is also given back.' },
          { value: qty * unitNet + bill.tax, why: 'Raised the credit note for the whole invoice instead of only the units returned.' },
        ],
        explanation: [`Net price per unit = ${F(price)} - ${td}% = ${F(unitNet)}.`, `Goods returned = ${ret} × ${F(unitNet)} = ${F(retNet)}.`, `GST = ${g.rate}% of ${F(retNet)} = ${F(t.tax)}.`, `Credit note = ${F(retNet)} + ${F(t.tax)} = ${F(retNet + t.tax)}.`],
      };
    }
    return {
      prompt: `${head} How much GST is shown on the credit note?`,
      answer: t.tax,
      commonErrors: [
        { value: onList.tax, why: 'Worked out GST on the list price of the returned units, ignoring the trade discount.' },
        { value: bill.tax, why: 'Gave the GST of the whole invoice instead of only the units returned.' },
        { value: retNet, why: 'Gave the price of the returned goods instead of the tax on them.' },
      ],
      explanation: [`Net price per unit = ${F(price)} - ${td}% = ${F(unitNet)}.`, `Goods returned = ${ret} × ${F(unitNet)} = ${F(retNet)}.`, `GST = ${g.rate}% of ${F(retNet)} = ${F(t.tax)}.`],
    };
  },
  verify: (q) => {
    const [price] = moneyIn(q.prompt);
    const [qty, ret] = [...q.prompt.matchAll(/(\d+) units/g)].map((m) => Number(m[1]));
    const [td, rate] = pctIn(q.prompt);
    const retNetTimes100 = ret * price * (100 - td); // paise × 100
    if (q.prompt.includes('How much GST')) return qty > ret && q.answer * 10000 === retNetTimes100 * rate;
    return qty > ret && q.answer * 10000 === retNetTimes100 * (100 + rate);
  },
});

const sbCountEntries = numericTemplate({
  id: 'sb-count-entries',
  topicId: T,
  conceptId: K.book,
  difficulty: 'complex',
  unit: 'number',
  generate: (rng) => {
    const b = pickBiz(rng);
    const m = month(rng);
    const purchases = rng.pick([true, false]);
    const nCredit = rng.pick([2, 3, 4]);
    const nCash = rng.pick([1, 2]);
    const nAsset = rng.pick([1, 2]);
    const nRet = rng.pick([1, 2]);
    const kinds = rng.shuffle<'credit' | 'cash' | 'asset' | 'ret'>([
      ...Array<'credit'>(nCredit).fill('credit'),
      ...Array<'cash'>(nCash).fill('cash'),
      ...Array<'asset'>(nAsset).fill('asset'),
      ...Array<'ret'>(nRet).fill('ret'),
    ]);
    const ds = days(rng, kinds.length);
    const ps = people(rng, kinds.length);
    const nos = invoiceNos(rng, kinds.length, !purchases);
    const text = (k: string, i: number): string => {
      const inv = `invoice no. ${nos[i]}`;
      switch (k) {
        case 'credit':
          return purchases ? `goods bought on credit from ${ps[i]} (${inv})` : `goods sold on credit to ${ps[i]} (${inv})`;
        case 'cash':
          return purchases ? 'goods bought for cash' : 'goods sold for cash';
        case 'asset':
          return purchases ? `a printer for the office bought on credit from ${ps[i]}` : `an old printer of the business sold on credit to ${ps[i]}`;
        default:
          return purchases ? `goods returned to ${ps[i]}, from whom they were bought on credit` : `goods returned by ${ps[i]}, to whom they were sold on credit`;
      }
    };
    const book = purchases ? 'Purchases Book' : 'Sales Book';
    const items = kinds.map((k, i) => `(${i + 1}) ${ds[i]} ${m}: ${text(k, i)}`);
    // Two different slips can give the same count, so slips that share a count are named together.
    const slips = new Map<number, string[]>();
    const slip = (value: number, why: string) => slips.set(value, [...(slips.get(value) ?? []), why]);
    slip(nCredit + nCash, `the cash ${purchases ? 'purchase' : 'sale'}${nCash > 1 ? 's' : ''} (Cash Book)`);
    slip(nCredit + nAsset, `the asset${nAsset > 1 ? 's' : ''} ${purchases ? 'bought' : 'sold'} on credit (Journal Proper)`);
    slip(nCredit + nRet, `the goods returned (${purchases ? 'Purchases' : 'Sales'} Return Book)`);
    slip(nCredit + nCash + nAsset, `everything ${purchases ? 'bought' : 'sold'}, whether for cash or on credit, goods or asset`);
    return {
      prompt: `These transactions of ${b.name} took place in ${m}: ${items.join('; ')}. How many of them are entered in the ${book}?`,
      answer: nCredit,
      commonErrors: [...slips].map(([value, whys]) => ({
        value,
        why: `Counted too many: this is the count if you include ${whys.join(', or ')}. Only credit ${purchases ? 'purchases' : 'sales'} of goods belong in the ${book}.`,
      })),
      explanation: [`Only credit ${purchases ? 'purchases' : 'sales'} of goods go in the ${book}: ${nCredit}.`, `The other items do not belong: ${nCash} cash item${nCash > 1 ? 's' : ''} (Cash Book), ${nAsset} asset item${nAsset > 1 ? 's' : ''} (Journal Proper) and ${nRet} return${nRet > 1 ? 's' : ''} (${purchases ? 'Purchases' : 'Sales'} Return Book).`],
    };
  },
  verify: (q) => {
    const key = q.prompt.includes('Purchases Book?') ? 'goods bought on credit from' : 'goods sold on credit to';
    return q.answer === q.prompt.split(/\(\d+\) /).filter((s) => s.includes(key)).length;
  },
});

// ===============================================================================================================
// Sets of entries. One business, several dated transactions, one entry for each. A set is one story, its opening
// line states every convention the entries rely on, and which transactions occur, and in what order, changes with
// the seed. The two Journal Proper sets ask for exactly that ("Pass the entries in the Journal Proper."); the set
// of invoices and notes is journalised.
// ===============================================================================================================

/** One transaction of a set, before it is given its date. */
interface SetTx {
  text: string;
  lines: JournalLine[];
  explanation: string[];
}
type Asset = (typeof ASSETS)[number];

const dr = (accountId: string, a: Paise): JournalLine => ({ accountId, side: 'Dr', amount: a });
const cr = (accountId: string, a: Paise): JournalLine => ({ accountId, side: 'Cr', amount: a });
const listOf = (parts: string[]): string => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);
const SET_RULES = 'Ignore GST. Goods that leave the business other than by sale are recorded at cost.';
const JP_TASK = 'Pass the entries in the Journal Proper.';

// ---- the Journal Proper entries the first two sets are built from ----

/** What each asset costs new, and the book value at which an old one is sold: rupee ranges with their steps. */
const ASSET_VALUE: Record<string, { cost: [number, number, number]; old: [number, number, number] }> = {
  furniture: { cost: [20000, 80000, 4000], old: [4000, 16000, 1000] },
  machinery: { cost: [80000, 320000, 8000], old: [15000, 60000, 5000] },
  computers: { cost: [40000, 160000, 4000], old: [5000, 30000, 1000] },
  officeEquipment: { cost: [32000, 64000, 4000], old: [4000, 12000, 1000] },
  vehicles: { cost: [320000, 720000, 8000], old: [40000, 120000, 5000] },
};

/**
 * An asset bought on credit (never of the kind `not`, the one the set sells); `discounted` gives a list price less
 * trade discount, so the amount has to be worked out.
 */
function jpAssetBuy(rng: Rng, p: string, discounted: boolean, not?: Asset): SetTx {
  const a = rng.pick(ASSETS.filter((x) => x !== not));
  const why = `The purchase is of a fixed asset (${a.name}), not of goods for resale, so the Purchases Book cannot take it: it is journalised.`;
  const posting = (x: Paise) => [`${a.name} A/c is debited with ${F(x)}: the asset comes in.`, `${p} is credited: the business owes ${p} the price.`];
  const list = amount(rng, ...ASSET_VALUE[a.id].cost);
  if (!discounted) {
    const x = list;
    return { text: `Bought ${a.bought} from ${p} on credit for ${F(x)}.`, lines: [dr(a.id, x), cr(creditor(p), x)], explanation: [why, ...posting(x)] };
  }
  const td = rng.pick([5, 10, 20, 25]);
  const net = list - percentOf(list, td);
  return {
    text: `Bought ${a.bought} from ${p} on credit: list price ${F(list)} less ${td}% trade discount.`,
    lines: [dr(a.id, net), cr(creditor(p), net)],
    explanation: [why, `Trade discount is never recorded: price = ${F(list)} - ${td}% (${F(list - net)}) = ${F(net)}.`, ...posting(net)],
  };
}

/** An old asset sold on credit at its book value, so that no profit or loss arises. */
function jpAssetSell(rng: Rng, a: Asset, p: string): SetTx {
  const x = amount(rng, ...ASSET_VALUE[a.id].old);
  return {
    text: `Sold ${a.sold} to ${p} on credit at book value, ${F(x)}.`,
    lines: [dr(debtor(p), x), cr(a.id, x)],
    explanation: [
      `The sale is of a fixed asset (${a.name}), not of goods in which the business deals, so the Sales Book cannot take it: it is journalised.`,
      `${p} is debited: ${p} owes the business ${F(x)}.`,
      `${a.name} A/c is credited: the asset goes out at its book value, so there is no profit or loss.`,
    ],
  };
}

type GoodsOut = 'drawings' | 'samples' | 'charity' | 'loss';
const GOODS_KINDS: readonly string[] = ['drawings', 'samples', 'charity', 'loss'];
/** `g` is the goods, `v` their value as words: "costing ₹4,000" or "priced to sell at ₹5,000". */
const JP_GOODS: Record<GoodsOut, { id: string; text: (g: string, v: string) => string; why: string }[]> = {
  drawings: [
    { id: 'drawings', text: (g, v) => `The proprietor took ${g} ${v} from the shop for personal use.`, why: 'Goods taken by the proprietor for personal use are drawings: Drawings A/c is debited.' },
  ],
  samples: [
    { id: 'advertisement', text: (g, v) => `Gave away ${g} ${v} as free samples to likely customers.`, why: 'Free samples make the goods known, which is an advertising expense: Advertisement A/c is debited.' },
  ],
  charity: [
    { id: 'charity', text: (g, v) => `Donated ${g} ${v} to a relief camp.`, why: 'Goods given away as a donation are a charity expense: Charity A/c is debited.' },
    { id: 'charity', text: (g, v) => `Gave ${g} ${v} free of charge to an orphanage.`, why: 'Goods given away as a donation are a charity expense: Charity A/c is debited.' },
  ],
  loss: [
    { id: 'lossByFire', text: (g, v) => `A fire in the godown destroyed ${g} ${v}; the goods were not insured.`, why: 'Goods destroyed by fire without insurance are a loss: Loss by Fire A/c is debited.' },
    { id: 'lossByTheft', text: (g, v) => `Thieves took ${g} ${v} from the godown; the goods were not insured.`, why: 'Goods stolen without insurance are a loss: Loss by Theft A/c is debited.' },
  ],
};

/** Goods that leave without being sold; `fromPrice` gives their selling price and the mark-up, so the cost has to be worked out. */
function jpGoodsOut(rng: Rng, b: Biz, kind: GoodsOut, fromPrice: boolean): SetTx {
  const s = rng.pick(JP_GOODS[kind]);
  const noBook = 'No customer is charged and no cash moves, so neither the Sales Book nor the Cash Book takes it: it is journalised.';
  const credit = 'The goods were bought for resale but will not be sold, so they leave purchases at cost: Purchases A/c is credited, not Sales A/c.';
  if (!fromPrice) {
    // A loss by fire or theft can be large; what the proprietor takes or gives away is small.
    const x = kind === 'loss' ? amount(rng, 5000, 40000, 1000) : amount(rng, 1000, 8000, 500);
    return { text: s.text(b.goods, `costing ${F(x)}`), lines: [dr(s.id, x), cr('purchases', x)], explanation: [s.why, noBook, credit] };
  }
  const cost = amount(rng, 2000, 8000, 1000);
  const up = rng.pick([20, 25, 50]);
  const price = cost + percentOf(cost, up);
  return {
    text: `${s.text(b.goods, `priced to sell at ${F(price)}`)} The business fixes its selling prices at cost plus ${up}%.`,
    lines: [dr(s.id, cost), cr('purchases', cost)],
    explanation: [s.why, `The goods are recorded at cost, not at selling price: cost = ${F(price)} × 100 ÷ ${100 + up} = ${F(cost)}.`, noBook, credit],
  };
}

const jpBadDebt = (d: string, x: Paise): SetTx => ({
  text: `${F(x)} of the amount due from ${d} proved irrecoverable and was written off as a bad debt.`,
  lines: [dr('badDebts', x), cr(debtor(d), x)],
  explanation: ['A debt that cannot be recovered is a loss: Bad Debts A/c is debited.', `${d} no longer owes this part of the debt: ${d} is credited.`, 'No cash is received, so the write-off is journalised.'],
});

/** How the opening entry names each kind of asset: always the whole class, of which the set may later sell one old item. */
const OPEN_NAME: Record<string, string> = { furniture: 'furniture', machinery: 'machinery', computers: 'computers', officeEquipment: 'office equipment', vehicles: 'delivery vans' };

/** The opening entry of a year: every asset debited, the creditor credited, capital the balancing figure. */
function jpOpening(o: { cash: Paise; bank: Paise | null; stock: Paise; asset: Asset; fixed: Paise; debtor: [string, Paise] | null; creditor: [string, Paise] }): SetTx {
  const assets: { line: JournalLine; say: string }[] = [
    { line: dr('cash', o.cash), say: `cash ${F(o.cash)}` },
    ...(o.bank === null ? [] : [{ line: dr('bank', o.bank), say: `bank balance ${F(o.bank)}` }]),
    { line: dr('stock', o.stock), say: `stock of goods ${F(o.stock)}` },
    { line: dr(o.asset.id, o.fixed), say: `${OPEN_NAME[o.asset.id]} ${F(o.fixed)}` },
    ...(o.debtor === null ? [] : [{ line: dr(debtor(o.debtor[0]), o.debtor[1]), say: `${o.debtor[0]} owing the business ${F(o.debtor[1])}` }]),
  ];
  const [c, owing] = o.creditor;
  const total = sum(assets.map((a) => a.line.amount));
  const capital = total - owing;
  return {
    text: `The books of the new year were opened with these balances brought forward: ${listOf(assets.map((a) => a.say))}. The business owed ${c} ${F(owing)}.`,
    lines: [...assets.map((a) => a.line), cr(creditor(c), owing), cr('capital', capital)],
    explanation: [
      "An opening entry brings last year's closing balances into the new books: every asset is debited, every liability is credited and capital is the balancing figure.",
      `Assets = ${assets.map((a) => F(a.line.amount)).join(' + ')} = ${F(total)}.`,
      `Capital = assets - liabilities = ${F(total)} - ${F(owing)} = ${F(capital)}.`,
      'It is not a receipt, a payment, a purchase or a sale, so it is passed in the Journal Proper.',
    ],
  };
}

/** Where a premium paid for twelve months from the 1st of a month stands on 31 March: the months still to come. */
const PREPAID: Record<string, [number, string]> = { July: [3, 'April to June'], October: [6, 'April to September'], January: [9, 'April to December'] };

/** Adjustments made when the books are closed on 31 March. Two of them leave the amount to be worked out. */
const JP_ADJUST: ((rng: Rng) => SetTx)[] = [
  (rng) => {
    const [id, name] = rng.pick([['salaries', 'Salaries'], ['rent', 'Rent'], ['wages', 'Wages']] as const);
    const x = amount(rng, 4000, 40000, 500);
    return {
      text: `${name} of ${F(x)} for March had not been paid when the books were closed.`,
      lines: [dr(id, x), cr('outstandingExpenses', x)],
      explanation: [`The amount is an expense of this year although it is unpaid: ${name} A/c is debited.`, 'It is owed at the year end: Outstanding Expenses A/c, a liability, is credited.', 'No cash moves, so the adjustment is journalised.'],
    };
  },
  (rng) => {
    const start = rng.pick(Object.keys(PREPAID));
    const [months, span] = PREPAID[start];
    const premium = amount(rng, 6000, 36000, 1200);
    const prepaid = (premium * months) / 12;
    return {
      text: `Insurance premium of ${F(premium)} was paid on 1 ${start} for the twelve months from that date and was debited to Insurance A/c in full.`,
      lines: [dr('prepaidExpenses', prepaid), cr('insurance', prepaid)],
      explanation: [
        `The premium covers twelve months from 1 ${start}, so on 31 March ${months} months (${span}) are still to come.`,
        `Prepaid insurance = ${F(premium)} × ${months}/12 = ${F(prepaid)}.`,
        "Prepaid Expenses A/c, an asset, is debited and Insurance A/c is credited, so that only this year's premium remains an expense.",
      ],
    };
  },
  (rng) => {
    const invested = amount(rng, 50000, 300000, 10000);
    const rate = rng.pick([6, 8, 9, 10, 12]);
    const interest = (invested * rate) / 200;
    return {
      text: `Investments of ${F(invested)} carry interest at ${rate}% a year. The interest for the half-year ended 31 March has been earned but not yet received.`,
      lines: [dr('accruedIncome', interest), cr('interestReceived', interest)],
      explanation: [
        `Interest for six months = ${F(invested)} × ${rate}% × 6/12 = ${F(interest)}.`,
        'It is earned but not yet received: Accrued Income A/c, an asset, is debited.',
        'It is an income of this year: Interest Received A/c is credited.',
      ],
    };
  },
  (rng) => {
    const x = amount(rng, 3000, 20000, 500);
    return {
      text: `Rent received from a tenant and credited to Rent Received A/c includes ${F(x)} for April of the next year.`,
      lines: [dr('rentReceived', x), cr('incomeReceivedInAdvance', x)],
      explanation: ['Rent for April is not an income of this year: Rent Received A/c is debited to take it out.', 'It has been received before it is earned: Income Received in Advance A/c, a liability, is credited.', 'No cash moves, so the adjustment is journalised.'],
    };
  },
];

/** `n` kinds from the pool in an order drawn from the seed, with no more than `most` of them goods that leave without a sale. */
function pickKinds<X extends string>(rng: Rng, pool: readonly X[], n: number, most: number): X[] | null {
  const out: X[] = [];
  let goods = 0;
  for (const k of rng.shuffle(pool)) {
    if (out.length === n) break;
    if (GOODS_KINDS.includes(k)) {
      if (goods === most) continue;
      goods++;
    }
    out.push(k);
  }
  return out.length === n ? out : null;
}

/**
 * What each Journal Proper item calls for, read again from its own words: the account debited and the account
 * credited ("asset" for a fixed asset, "debtor:" or "creditor:" for a party). Exactly one rule fits an item.
 */
const JP_RULES: [fits: RegExp, debited: string, credited: string][] = [
  [/^Bought (?!stationery).+ from .+ on credit(:| for) /, 'asset', 'creditor:'],
  [/^Sold .+ on credit at book value/, 'debtor:', 'asset'],
  [/^The proprietor took /, 'drawings', 'purchases'],
  [/ as free samples to likely customers\./, 'advertisement', 'purchases'],
  [/^Donated .+ to a relief camp\.|^Gave .+ free of charge to an orphanage\./, 'charity', 'purchases'],
  [/^A fire in the godown destroyed /, 'lossByFire', 'purchases'],
  [/^Thieves took /, 'lossByTheft', 'purchases'],
  [/written off as a bad debt\.$/, 'badDebts', 'debtor:'],
  [/^Salaries of .+ had not been paid when the books were closed\.$/, 'salaries', 'outstandingExpenses'],
  [/^Rent of .+ had not been paid when the books were closed\.$/, 'rent', 'outstandingExpenses'],
  [/^Wages of .+ had not been paid when the books were closed\.$/, 'wages', 'outstandingExpenses'],
  [/^Insurance premium of .+ debited to Insurance A\/c in full\.$/, 'prepaidExpenses', 'insurance'],
  [/^Investments of .+ earned but not yet received\.$/, 'accruedIncome', 'interestReceived'],
  [/^Rent received from a tenant and credited to Rent Received A\/c/, 'rentReceived', 'incomeReceivedInAdvance'],
  [/^Bought stationery for office use from .+ on credit/, 'stationery', 'creditor:'],
  [/ repaired the delivery van; the bill of /, 'repairs', 'creditor:'],
  [/ printed handbills to advertise the shop; the bill of /, 'advertisement', 'creditor:'],
  [/ were found debited to Wages A\/c, and the error was corrected\.$/, 'machinery', 'wages'],
  [/ was found debited to Rent A\/c, and the error was corrected\.$/, 'drawings', 'rent'],
  [/ was found entered in the Purchases Book, and the error was corrected\.$/, 'furniture', 'purchases'],
];

/**
 * The independent check of one Journal Proper entry. The accounts and their sides are read again from the words of
 * the item, and the amount is worked out again from its figures (a balancing capital, a trade discount, a cost from
 * a selling price, a part of a year). Nothing but an opening entry touches cash or bank.
 */
function jpEntryHolds(e: { text: string; expected: JournalLine[] }): boolean {
  const m = moneyIn(e.text);
  const debits = e.expected.filter((l) => l.side === 'Dr');
  const credits = e.expected.filter((l) => l.side === 'Cr');
  if (e.text.includes('balances brought forward')) {
    // Every asset named is a debit, the one creditor a credit, and capital the difference between them.
    const capital = credits.find((l) => l.accountId === 'capital')?.amount ?? 0;
    const owing = credits.filter((l) => l.accountId !== 'capital');
    const assets = sum(debits.map((l) => l.amount));
    return (
      owing.length === 1 &&
      owing[0].accountId.startsWith('creditor:') &&
      debits.every((l) => !l.accountId.startsWith('creditor:') && l.accountId !== 'capital') &&
      capital > 0 &&
      capital === assets - owing[0].amount &&
      sum(m) === assets + owing[0].amount
    );
  }
  const rules = JP_RULES.filter(([fits]) => fits.test(e.text));
  if (rules.length !== 1 || debits.length !== 1 || credits.length !== 1 || debits[0].amount !== credits[0].amount) return false;
  const is = (accountId: string, want: string) => (want === 'asset' ? ASSETS.some((a) => a.id === accountId) : want.endsWith(':') ? accountId.startsWith(want) : accountId === want);
  if (!is(debits[0].accountId, rules[0][1]) || !is(credits[0].accountId, rules[0][2])) return false;
  const a = debits[0].amount;
  const discount = /less (\d+)% trade discount/.exec(e.text);
  if (discount) return a * 100 === m[0] * (100 - Number(discount[1]));
  const markUp = /cost plus (\d+)%/.exec(e.text);
  if (markUp) return a * (100 + Number(markUp[1])) === m[0] * 100;
  const premium = /paid on 1 (\w+) for the twelve months/.exec(e.text);
  if (premium) return a * 12 === m[0] * (PREPAID[premium[1]]?.[0] ?? 0);
  const halfYear = /interest at (\d+)% a year\. The interest for the half-year/.exec(e.text);
  if (halfYear) return a * 200 === m[0] * Number(halfYear[1]);
  return a === m[0];
}

const jpSetHolds = (q: JournalSetQuestion): boolean => setHolds()(q) && q.entries.every(jpEntryHolds);
const JP_DISTRACTORS = ['purchases', 'sales', 'stock', 'cash'];

/// 1. The Journal Proper of a month: in April with the opening entry, in March with the year-end adjustments.
type JpKind = 'buy' | 'sell' | GoodsOut | 'badDebt';
const sbSetJournalProper = journalSetTemplate({
  id: 'sb-set-journal-proper',
  topicId: T,
  conceptId: K.sets,
  difficulty: 'medium',
  generate: (rng) => {
    const b = pickBiz(rng);
    const [supplier, buyer, oldDebtor, oldCreditor] = people(rng, 4);
    const variant = rng.pick(['april', 'march', 'mid'] as const);
    const size = rng.pick([4, 5]);
    const pool: JpKind[] = ['buy', 'sell', 'drawings', 'samples', 'charity', 'loss'];
    const head = `${b.name} deals in ${b.goods}.`;
    // The asset the set sells. In April the opening entry brings it in; an asset bought is always of another kind.
    const old = rng.pick(ASSETS);
    const owed = amount(rng, 10000, 60000, 1000);
    const make = (k: JpKind, discounted: boolean): SetTx =>
      k === 'buy'
        ? jpAssetBuy(rng, supplier, discounted, old)
        : k === 'sell'
          ? jpAssetSell(rng, old, buyer)
          : k === 'badDebt'
            ? jpBadDebt(oldDebtor, amount(rng, 1000, Math.floor(owed / 200), 500))
            : jpGoodsOut(rng, b, k, false);

    if (variant === 'april') {
      const withDebtor = rng.pick([true, true, false]);
      const opening = jpOpening({
        cash: amount(rng, 3000, 40000, 1000),
        bank: rng.pick([true, false]) ? amount(rng, 20000, 150000, 5000) : null,
        stock: amount(rng, 40000, 200000, 5000),
        asset: old,
        fixed: amount(rng, ...ASSET_VALUE[old.id].cost),
        debtor: withDebtor ? [oldDebtor, owed] : null,
        creditor: [oldCreditor, amount(rng, 10000, 80000, 1000)],
      });
      const kinds = pickKinds<JpKind>(rng, withDebtor ? [...pool, 'badDebt'] : pool, size - 1, 2);
      if (!kinds) return null;
      const days = setDays(rng, kinds.length, 2, 28);
      return {
        task: JP_TASK,
        opening: `${head} Its accounting year began on 1 April. Of all that happened in April, only what belongs in the Journal Proper is listed. ${SET_RULES} Capital is the balancing figure of the opening entry.`,
        transactions: [{ date: '1 April', ...opening }, ...kinds.map((k, i) => ({ date: `${days[i]} April`, ...make(k, rng.pick([true, false])) }))],
        distractorAccounts: JP_DISTRACTORS,
      };
    }

    if (variant === 'march') {
      const adjustments = rng
        .shuffle(JP_ADJUST)
        .slice(0, rng.pick([1, 2]))
        .map((adjust) => adjust(rng));
      const kinds = pickKinds<JpKind>(rng, pool, size - adjustments.length, 2);
      if (!kinds) return null;
      const days = setDays(rng, kinds.length, 1, 28);
      const last = adjustments.length === 1 ? 'the last item is a year-end adjustment' : 'the last two items are year-end adjustments';
      return {
        task: JP_TASK,
        opening: `${head} It closes its books on 31 March. Of all that happened in March, only what belongs in the Journal Proper is listed; ${last}. ${SET_RULES}`,
        transactions: [...kinds.map((k, i) => ({ date: `${days[i]} March`, ...make(k, rng.pick([true, false])) })), ...adjustments.map((tx) => ({ date: '31 March', ...tx }))],
        // The four accounts an adjustment can call for are all offered, so that the right one has to be chosen.
        distractorAccounts: [...JP_DISTRACTORS, 'outstandingExpenses', 'prepaidExpenses', 'accruedIncome', 'incomeReceivedInAdvance'],
      };
    }

    // Any other month: no opening entry and no adjustment, and the asset is bought at a list price less trade discount.
    const month = rng.pick(MONTHS.filter((m) => m !== 'April' && m !== 'March'));
    const others = pickKinds<JpKind>(
      rng,
      pool.filter((k) => k !== 'buy'),
      size - 1,
      3,
    );
    if (!others) return null;
    const kinds = rng.shuffle<JpKind>(['buy', ...others]);
    const days = setDays(rng, kinds.length, 1, 28);
    return {
      task: JP_TASK,
      opening: `${head} Of the transactions of ${month}, only those that belong in the Journal Proper are listed. ${SET_RULES}`,
      transactions: kinds.map((k, i) => ({ date: `${days[i]} ${month}`, ...make(k, true) })),
      distractorAccounts: JP_DISTRACTORS,
    };
  },
  verify: jpSetHolds,
});

// 2. A trader with a full set of subsidiary books: only what none of them takes is journalised, and one amount is worked out.
const CREDIT_EXPENSES: { id: string; name: string; most: number; text: (x: string, p: string) => string }[] = [
  { id: 'stationery', name: 'Stationery', most: 5000, text: (x, p) => `Bought stationery for office use from ${p} on credit for ${x}.` },
  { id: 'repairs', name: 'Repairs', most: 9000, text: (x, p) => `${p} repaired the delivery van; the bill of ${x} is to be paid next month.` },
  { id: 'advertisement', name: 'Advertisement', most: 8000, text: (x, p) => `${p} printed handbills to advertise the shop; the bill of ${x} is to be paid next month.` },
];

const jpCreditExpense = (rng: Rng, p: string): SetTx => {
  const e = rng.pick(CREDIT_EXPENSES);
  const x = amount(rng, 1500, e.most, 500);
  return {
    text: e.text(F(x), p),
    lines: [dr(e.id, x), cr(creditor(p), x)],
    explanation: [
      'Nothing here is goods for resale, so the Purchases Book cannot take it, and nothing is paid yet, so the Cash Book cannot either: it is journalised.',
      `${e.name} A/c, an expense, is debited.`,
      `${p} is credited: the bill is still owed.`,
    ],
  };
};

const jpRectify = (rng: Rng, p: string): SetTx => {
  const x = amount(rng, 2000, 30000, 500);
  const paid = 'The payment itself is already in the Cash Book. Only the account debited is wrong, and a correction has no book but the Journal Proper.';
  return rng.pick<SetTx>([
    {
      text: `Wages of ${F(x)} paid in cash for installing a new machine were found debited to Wages A/c, and the error was corrected.`,
      lines: [dr('machinery', x), cr('wages', x)],
      explanation: [paid, 'Wages for installing a machine are part of its cost: Machinery A/c is debited.', 'Wages A/c was debited by mistake, so it is credited.'],
    },
    {
      text: `A cheque of ${F(x)} paid for the rent of the proprietor's house was found debited to Rent A/c, and the error was corrected.`,
      lines: [dr('drawings', x), cr('rent', x)],
      explanation: [paid, "Rent of the proprietor's house is a personal expense: Drawings A/c is debited.", 'Rent A/c was debited by mistake, so it is credited.'],
    },
    {
      text: `Office furniture bought on credit from ${p} for ${F(x)} was found entered in the Purchases Book, and the error was corrected.`,
      lines: [dr('furniture', x), cr('purchases', x)],
      explanation: [
        `${p} was rightly credited from the Purchases Book. Only the account debited is wrong, and a correction has no book but the Journal Proper.`,
        'Furniture for the office is an asset: Furniture A/c is debited.',
        'Being in the Purchases Book, the amount is debited to Purchases A/c with the total of that book: Purchases A/c is credited to take it out.',
      ],
    },
  ]);
};

type BookKind = 'buy' | 'sell' | GoodsOut | 'expense' | 'rectify';
const sbSetJournalOrBook = journalSetTemplate({
  id: 'sb-set-journal-or-book',
  topicId: T,
  conceptId: K.sets,
  difficulty: 'medium',
  generate: (rng) => {
    const b = pickBiz(rng);
    const [supplier, buyer, biller, furnisher] = people(rng, 4);
    const month = rng.pick(MONTHS);
    const kinds = pickKinds<BookKind>(rng, ['buy', 'sell', 'drawings', 'samples', 'charity', 'loss', 'expense', 'rectify'], rng.pick([4, 5]), 2);
    if (!kinds) return null;
    // One amount at least is worked out: a trade discount on the asset, or the cost of goods from their selling price.
    const workable = (k: BookKind) => k === 'buy' || k === 'drawings' || k === 'samples' || k === 'charity';
    if (!kinds.some(workable)) kinds[rng.int(0, kinds.length - 1)] = 'buy';
    const worked = rng.pick(kinds.filter(workable));
    const days = setDays(rng, kinds.length, 1, 28);
    const old = rng.pick(ASSETS);
    const transactions = kinds.map((k, i) => {
      const tx =
        k === 'buy'
          ? jpAssetBuy(rng, supplier, worked === 'buy', old)
          : k === 'sell'
            ? jpAssetSell(rng, old, buyer)
            : k === 'expense'
              ? jpCreditExpense(rng, biller)
              : k === 'rectify'
                ? jpRectify(rng, furnisher)
                : jpGoodsOut(rng, b, k, worked === k);
      return { date: `${days[i]} ${month}`, ...tx };
    });
    // The supplier of the furniture was rightly credited from the Purchases Book: crediting the supplier again is the slip to offer.
    const misbooked = transactions.some((tx) => tx.text.includes('was found entered in the Purchases Book'));
    return {
      task: JP_TASK,
      opening: `${b.name} deals in ${b.goods}. It keeps a Cash Book, a Purchases Book, a Sales Book, a Purchases Return Book and a Sales Return Book; only what none of these books can take goes through the Journal Proper. Of the transactions of ${month}, only those that belong in the Journal Proper are listed. ${SET_RULES}`,
      transactions,
      distractorAccounts: [...JP_DISTRACTORS, 'outstandingExpenses', ...(misbooked ? [creditor(furnisher)] : [])],
    };
  },
  verify: jpSetHolds,
});

// 3. Invoices, and the debit notes and credit notes that follow them, with GST.
const NOTE_STATES = ['Karnataka', 'Maharashtra', 'Tamil Nadu', 'Gujarat', 'Kerala', 'Punjab', 'Rajasthan', 'Uttar Pradesh'];
/** A note is for goods returned (R) or for an allowance on goods that are kept (A). */
type Note = 'R' | 'A';
interface NotePlan {
  sale: boolean;
  notes: Note[];
}
const SALE = (...notes: Note[]): NotePlan => ({ sale: true, notes });
const PURCHASE = (...notes: Note[]): NotePlan => ({ sale: false, notes });
/** Every plan has a return inwards, a return outwards and an allowance, and six to eight entries in all. */
const NOTE_PLANS: NotePlan[][] = [
  [SALE('R', 'A'), PURCHASE('R', 'A')],
  [SALE('R'), PURCHASE('R'), SALE('A')],
  [SALE('R'), PURCHASE('R'), PURCHASE('A')],
  [SALE('R', 'A'), PURCHASE('R'), PURCHASE('A')],
  [SALE('R'), SALE('A'), PURCHASE('R', 'A')],
  [SALE('R', 'A'), PURCHASE('R'), PURCHASE('R')],
  [SALE('R'), SALE('R'), PURCHASE('R', 'A')],
  [SALE('R', 'A'), PURCHASE('R', 'A'), SALE('R')],
  [SALE('R', 'A'), PURCHASE('R', 'A'), PURCHASE('R')],
  [SALE('R'), SALE('A'), PURCHASE('R'), PURCHASE('A')],
];

const gstLines = (t: Tax, g: Gst, input: boolean, side: 'Dr' | 'Cr'): JournalLine[] => {
  const dir = input ? 'input' : 'output';
  return g.intra
    ? [
        { accountId: `${dir}CGST`, side, amount: t.cgst },
        { accountId: `${dir}SGST`, side, amount: t.sgst },
      ]
    : [{ accountId: `${dir}IGST`, side, amount: t.igst }];
};
const gstStep = (base: Paise, t: Tax, g: Gst): string =>
  g.intra ? `GST = ${g.rate}% of ${F(base)} = ${F(t.tax)}: CGST ${F(t.cgst)} and SGST ${F(t.sgst)}.` : `IGST = ${g.rate}% of ${F(base)} = ${F(t.tax)}.`;
const gstNames = (g: Gst, input: boolean): string => {
  const dir = input ? 'Input' : 'Output';
  return g.intra ? `${dir} CGST A/c and ${dir} SGST A/c are` : `${dir} IGST A/c is`;
};

/**
 * One dealing: an invoice and the notes that follow it, each a step that is given its day when the set is put in
 * order (a note names the day of its invoice). Null when a figure would not be whole rupees.
 */
function noteThread(rng: Rng, b: Biz, g: Gst, month: string, plan: NotePlan, who: string): ((day: number) => SetTx)[] | null {
  const td = rng.pick([0, 10, 20, 25]);
  const list = amount(rng, 40000, 200000, 4000);
  const back = amount(rng, 4000, Math.floor(list / 400), 4000);
  const off = amount(rng, 1000, 5000, 200);
  const net = list - percentOf(list, td);
  const backNet = back - percentOf(back, td);
  const [tax, backTax, offTax] = [taxOn(net, g), taxOn(backNet, g), taxOn(off, g)];
  if (!tax || !backTax || !offTax) return null;
  let invoiceDay = 0;
  const atDiscount = td > 0 ? `, which was at ${td}% trade discount` : '';
  const priced = td > 0 ? `of list price ${F(back)}` : `invoiced at ${F(back)} before GST`;
  const netStep = (l: Paise, n: Paise) => (td > 0 ? [`Price after trade discount = ${F(l)} - ${td}% (${F(l - n)}) = ${F(n)}.`] : []);

  const invoice = (day: number): SetTx => {
    invoiceDay = day;
    const total = net + tax.tax;
    const terms = td > 0 ? `: list price ${F(list)} less ${td}% trade discount, plus GST` : ` for ${F(net)} plus GST`;
    return plan.sale
      ? {
          text: `Sold ${b.goods} to ${who} on credit${terms}.`,
          lines: [dr(debtor(who), total), cr('sales', net), ...gstLines(tax, g, false, 'Cr')],
          explanation: [
            ...netStep(list, net),
            gstStep(net, tax, g),
            `${who} owes the invoice total, ${F(net)} + ${F(tax.tax)} = ${F(total)}: ${who} is debited.`,
            `Sales A/c is credited with the price of the goods, ${F(net)}.`,
            `The tax collected is owed to the government: ${gstNames(g, false)} credited.`,
          ],
        }
      : {
          text: `Bought ${b.goods} from ${who} on credit${terms}.`,
          lines: [dr('purchases', net), ...gstLines(tax, g, true, 'Dr'), cr(creditor(who), total)],
          explanation: [
            ...netStep(list, net),
            gstStep(net, tax, g),
            `Purchases A/c is debited with the price of the goods, ${F(net)}.`,
            `The tax paid can be set off against output tax: ${gstNames(g, true)} debited.`,
            `${who} is owed the invoice total, ${F(net)} + ${F(tax.tax)} = ${F(total)}: ${who} is credited.`,
          ],
        };
  };

  const goodsBack = (): SetTx => {
    const total = backNet + backTax.tax;
    const price = td > 0 ? [`The goods go back at the price charged for them: ${F(back)} - ${td}% (${F(back - backNet)}) = ${F(backNet)}.`] : [];
    return plan.sale
      ? {
          text: `${who} returned ${b.goods} ${priced} from the sale of ${invoiceDay} ${month}${atDiscount}. A credit note was sent to ${who} for the goods and the GST on them.`,
          lines: [dr('salesReturn', backNet), ...gstLines(backTax, g, false, 'Dr'), cr(debtor(who), total)],
          explanation: [
            ...price,
            gstStep(backNet, backTax, g),
            `The seller who takes goods back sends a credit note: Sales Return A/c is debited with ${F(backNet)}.`,
            `The output tax on these goods is no longer owed: ${gstNames(g, false)} debited.`,
            `${who} is credited with ${F(total)} and owes that much less.`,
          ],
        }
      : {
          text: `Returned to ${who}, as defective, ${b.goods} ${priced} from the purchase of ${invoiceDay} ${month}${atDiscount}. A debit note was sent to ${who} for the goods and the GST on them.`,
          lines: [dr(creditor(who), total), cr('purchasesReturn', backNet), ...gstLines(backTax, g, true, 'Cr')],
          explanation: [
            ...price,
            gstStep(backNet, backTax, g),
            `The buyer who returns goods sends a debit note: ${who} is debited with ${F(total)} and is owed that much less.`,
            `Purchases Return A/c is credited with ${F(backNet)}.`,
            `The input tax on these goods can no longer be claimed: ${gstNames(g, true)} credited.`,
          ],
        };
  };

  const allowance = (): SetTx => {
    const total = off + offTax.tax;
    const kept = 'The goods are kept and only their price is reduced; under the stated practice the allowance is recorded like a return.';
    return plan.sale
      ? {
          text: `Part of the ${b.goods} kept by ${who} from the sale of ${invoiceDay} ${month} had been damaged in transit. ${who} was allowed ${F(off)} off the price before GST, and a credit note was sent for the allowance and the GST on it.`,
          lines: [dr('salesReturn', off), ...gstLines(offTax, g, false, 'Dr'), cr(debtor(who), total)],
          explanation: [
            kept,
            gstStep(off, offTax, g),
            `Sales Return A/c is debited with ${F(off)}, and the output tax on it is no longer owed: ${gstNames(g, false)} debited.`,
            `${who} is credited with ${F(off)} + ${F(offTax.tax)} = ${F(total)}.`,
          ],
        }
      : {
          text: `Part of the ${b.goods} kept from the purchase of ${invoiceDay} ${month} from ${who} was found damaged. ${who} agreed to take ${F(off)} off the price before GST, and a debit note was sent to ${who} for the allowance and the GST on it.`,
          lines: [dr(creditor(who), total), cr('purchasesReturn', off), ...gstLines(offTax, g, true, 'Cr')],
          explanation: [
            kept,
            gstStep(off, offTax, g),
            `${who} is debited with ${F(off)} + ${F(offTax.tax)} = ${F(total)} and is owed that much less.`,
            `Purchases Return A/c is credited with ${F(off)}, and the input tax on it can no longer be claimed: ${gstNames(g, true)} credited.`,
          ],
        };
  };

  return [invoice, ...rng.shuffle(plan.notes).map((n) => (n === 'R' ? goodsBack : allowance))];
}

/** The independent check of one entry with GST: goods, tax and party are worked out again from its text and the rate in the opening line. */
function noteEntryHolds(e: { text: string; expected: JournalLine[] }, g: Gst): boolean {
  const kind = (['sales', 'purchases', 'salesReturn', 'purchasesReturn'] as const).find((id) => e.expected.some((l) => l.accountId === id));
  if (!kind) return false;
  const [first] = moneyIn(e.text);
  const discount = /(\d+)% trade discount/.exec(e.text);
  const goods = discount ? (first * (100 - Number(discount[1]))) / 100 : first;
  const tax = (goods * g.rate) / 100;
  const input = kind === 'purchases' || kind === 'purchasesReturn';
  // A sale debits the customer; a purchase and its taxes are debits; each note is the reverse of its invoice.
  const partySide: JournalLine['side'] = kind === 'sales' || kind === 'purchasesReturn' ? 'Dr' : 'Cr';
  const otherSide: JournalLine['side'] = partySide === 'Dr' ? 'Cr' : 'Dr';
  const dir = input ? 'input' : 'output';
  const want: JournalLine[] = [
    { accountId: (input ? creditor : debtor)(e.expected.find((l) => l.accountId.includes(':'))?.accountId.split(':')[1] ?? ''), side: partySide, amount: goods + tax },
    { accountId: kind, side: otherSide, amount: goods },
    ...(g.intra
      ? [
          { accountId: `${dir}CGST`, side: otherSide, amount: tax / 2 },
          { accountId: `${dir}SGST`, side: otherSide, amount: tax / 2 },
        ]
      : [{ accountId: `${dir}IGST`, side: otherSide, amount: tax }]),
  ];
  return e.expected.length === want.length && want.every((w) => e.expected.some((l) => l.accountId === w.accountId && l.side === w.side && l.amount === w.amount));
}

const sbSetNotesGst = journalSetTemplate({
  id: 'sb-set-notes-gst',
  topicId: T,
  conceptId: K.sets,
  difficulty: 'complex',
  generate: (rng) => {
    const b = pickGstBiz(rng);
    const g: Gst = { rate: b.rate, intra: rng.pick([true, false]) };
    const state = rng.pick(NOTE_STATES);
    const month = rng.pick(MONTHS);
    const plans = rng.pick(NOTE_PLANS);
    const names = people(rng, plans.length);
    const threads: ((day: number) => SetTx)[][] = [];
    for (const [i, plan] of plans.entries()) {
      const thread = noteThread(rng, b, g, month, plan, names[i]);
      if (!thread) return null;
      threads.push(thread);
    }
    const steps = interleave(rng, threads);
    const days = setDays(rng, steps.length, 1, 28);
    const where = g.intra
      ? `Every supplier and customer named is in ${state} as well, so each invoice and each note carries CGST at ${g.rate / 2}% and SGST at ${g.rate / 2}%.`
      : `Every supplier and customer named is in another state, so each invoice and each note carries IGST at ${g.rate}%.`;
    return {
      opening:
        `${b.name} of ${state} deals in ${b.goods}, taxed under GST at ${g.rate}%. ${where} GST is charged on the price after trade discount. ` +
        `Goods returned go back at the price charged for them. An allowance on goods that are kept is recorded like a return, in Sales Return A/c or Purchases Return A/c, with the GST on it reversed. ` +
        `These are the credit dealings of ${month} with the parties named.`,
      transactions: steps.map((step, i) => ({ date: `${days[i]} ${month}`, ...step(days[i]) })),
      distractorAccounts: ['discountAllowed', 'discountReceived', ...(g.intra ? ['inputIGST', 'outputIGST'] : ['inputCGST', 'outputCGST'])],
    };
  },
  verify: (q) => {
    const rate = Number(/taxed under GST at (\d+)%/.exec(q.prompt)?.[1]);
    const g: Gst = { rate, intra: q.prompt.includes('CGST') };
    const has = (id: string) => q.entries.some((e) => e.expected.some((l) => l.accountId === id));
    return RATES.includes(rate) && setHolds()(q) && has('salesReturn') && has('purchasesReturn') && q.entries.every((e) => noteEntryHolds(e, g));
  },
});

const sets: Template[] = [sbSetJournalProper, sbSetJournalOrBook, sbSetNotesGst];

// ===============================================================================================================
// Formats: a subsidiary book written up for a month. The data is a list of dated transactions, some of which do not
// belong in the book; each row is the party with the amount of one invoice or one note. The rows are the postings
// the entries of the month give the book's account against a supplier or a customer (`postingsOf`), so a book cannot
// disagree with its transactions; `verify` works every row out again from the lines the student reads.
// ===============================================================================================================

const SB_YEAR = 2026;
const FMT = 'sb-formats';
/** The assets a shop buys for its own use, and sells when they are old. */
const SHOP_ASSETS = ASSETS.filter((a) => ['furniture', 'computers', 'officeEquipment'].includes(a.id));

/** One transaction of the month. */
interface BookTx {
  text: string;
  lines: JournalLine[];
  /** For one that belongs in the book: the lines shown under its row, and how its amount is found. */
  details?: string[];
  work?: string;
  /** For one that does not belong: what it is and where it goes instead. */
  out?: string;
}

/**
 * The rows of a book: one for every entry that posts to the book's account against a party of the book's kind (a
 * credit purchase debits Purchases A/c against a supplier), with the party as its particulars. With `taxAccounts`,
 * a column for each holds what the same entry posts to that account, and a last column, the Total, holds what it
 * posts to the party.
 */
function bookRows(txs: BookTx[], dates: string[], account: string, partyKind: 'creditor:' | 'debtor:', taxAccounts?: string[]): FormatRowParts[] {
  const rows: FormatRowParts[] = [];
  txs.forEach((t, i) => {
    const entry = [{ date: dates[i], lines: t.lines }];
    const [goods] = postingsOf(entry, account, accountLabel);
    if (!goods || goods.accountIds.length !== 1 || !goods.accountIds[0].startsWith(partyKind)) return;
    const amounts = taxAccounts
      ? { amounts: [goods.amount, ...taxAccounts.map((a) => postingsOf(entry, a)[0]?.amount ?? 0), sum(t.lines.filter((l) => l.accountId === goods.accountIds[0]).map((l) => l.amount))] }
      : { amount: goods.amount };
    rows.push({ date: dates[i], label: goods.label, ...amounts, ...(t.details ? { details: t.details } : {}) });
  });
  return rows;
}

/** True when two rows have the same particulars and the same amounts: nothing would tell them apart. */
const hasTwins = (rows: FormatRowParts[]): boolean => new Set(rows.map((r) => `${r.label}|${r.amount ?? r.amounts?.join('|')}`)).size !== rows.length;
/** A row as `verify` compares it: its particulars and its amounts. */
const rowKey = (label: string, amounts: readonly number[]): string => `${label}|${amounts.join('|')}`;
const sameRows = (q: StatementQuestion, want: string[]): boolean =>
  q.rows.length === want.length && [...want].sort().join('\n') === q.rows.map((r) => rowKey(r.label, r.amounts)).sort().join('\n');
/** The lines of the data after its first, each without its bullet and date. */
const dataItems = (data: string): string[] => data.split('\n').slice(1).map((l) => l.slice(l.indexOf(': ') + 2));

type BookSlot = 'credit' | 'cash' | 'cheque' | 'asset' | 'ret';

/**
 * The Purchases Book or the Sales Book of a month from a list of transactions. `purchases: null` draws the book from
 * the seed. With `gst`, each invoice carries GST and the book has its columns in full: the taxable value, the Input
 * (or Output) IGST and the Total when the business deals on credit with other states (three columns); the taxable
 * value, the CGST, the SGST and the Total when it deals within its own state (four). The task names the columns.
 */
function goodsBook(o: { id: string; purchases: boolean | null; gst: boolean; difficulty: Difficulty }) {
  return statementTemplate({
    id: o.id,
    topicId: T,
    conceptId: FMT,
    difficulty: o.difficulty,
    generate: (rng) => {
      const purchases = o.purchases ?? rng.pick([true, false]);
      // The Sales Book starts two draws further on, so that a seed does not give it the month of the Purchases Book in mirror image.
      if (o.purchases === false) rng.int(0, rng.int(0, 1));
      const b = o.gst ? pickGstBiz(rng) : pickBiz(rng);
      const m = month(rng);
      const g: Gst | null = o.gst ? { rate: (b as GstBiz).rate, intra: rng.pick([true, false]) } : null;
      const state = rng.pick(NOTE_STATES);
      // A row of the book with GST has three or four amounts, so that book has fewer rows.
      const nCredit = o.gst ? rng.int(3, 6) : rng.int(4, 7);
      const names = people(rng, nCredit + 2);
      // Sometimes the last invoice is a second one for the first party: one name on two rows, with different amounts.
      const again = nCredit >= 4 && rng.next() < 0.35;
      const outs = rng.shuffle<BookSlot>([rng.pick(['cash', 'cheque'] as const), 'asset', 'ret']).slice(0, rng.int(2, 3));
      const slots = rng.shuffle<BookSlot>([...Array<BookSlot>(nCredit).fill('credit'), ...outs]);
      // Goods go back only after they have come: the return follows the first invoice, whose goods it is of.
      const [back, first] = [slots.indexOf('ret'), slots.indexOf('credit')];
      if (back >= 0 && back < first) [slots[back], slots[first]] = [slots[first], slots[back]];
      const ds = days(rng, slots.length);
      const dates = ds.map((d) => `${d} ${m}`);
      const nos = invoiceNos(rng, nCredit, !purchases);
      const noteNo = rng.int(11, 90);
      const asset = rng.pick(SHOP_ASSETS);
      const [book, verb, prep, party] = purchases ? ['Purchases Book', 'bought', 'from', 'supplier'] : ['Sales Book', 'sold', 'to', 'customer'];
      const returnBook = purchases ? 'Purchases Return Book' : 'Sales Return Book';
      const partyId = purchases ? creditor : debtor;
      const plusGst = g ? ' plus GST' : '';
      const taxOf = (x: Paise): Tax | null => (g ? taxOn(x, g) : NO_TAX);
      const taxLines = (t: Tax, side: 'Dr' | 'Cr'): JournalLine[] => (g ? gstLines(t, g, purchases, side) : []);
      // The tax columns of the book, as they are named and as accounts: CGST and SGST within the state, IGST across states.
      const taxKinds = g ? (g.intra ? ['CGST', 'SGST'] : ['IGST']) : [];
      const taxNames = taxKinds.map((k) => `${purchases ? 'Input' : 'Output'} ${k}`);
      const allOf = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : (xs[0] ?? ''));
      /** Goods bought or sold for `x` before tax, the price settled through `account` (a party, cash or the bank). */
      const goodsLines = (x: Paise, t: Tax, account: string): JournalLine[] =>
        purchases ? [dr('purchases', x), ...taxLines(t, 'Dr'), cr(account, x + t.tax)] : [dr(account, x + t.tax), cr('sales', x), ...taxLines(t, 'Cr')];
      const invs: Inv[] = [];
      const txs: BookTx[] = [];
      const strangers: string[] = [];
      for (const [i, slot] of slots.entries()) {
        if (slot === 'credit') {
          const k = invs.length;
          const who = again && k === nCredit - 1 ? names[0] : names[k];
          const inv = makeInv(ds[i], who, amount(rng, 12000, 120000, 4000), rng.pick([0, 10, 20, 25]), g);
          if (!inv) return null;
          invs.push(inv);
          const price = inv.td > 0 ? `${F(inv.list)} - ${inv.td}% (${F(inv.list - inv.net)}) = ${F(inv.net)}` : `${F(inv.net)}, with no trade discount`;
          txs.push({
            text: `${verb} ${b.goods} ${prep} ${who} on credit, invoice no. ${nos[k]}: ${inv.td > 0 ? `list price ${F(inv.list)} less ${inv.td}% trade discount` : F(inv.list)}${g ? ', plus GST' : ''}`,
            lines: goodsLines(inv.net, inv, partyId(who)),
            details: [`Invoice no. ${nos[k]}`, ...(inv.td > 0 ? [`List price ${F(inv.list)}`, `Less: Trade discount ${inv.td}% ${F(inv.list - inv.net)}`] : [])],
            work:
              `${dates[i]}, ${who}: ${price}` +
              (g
                ? g.intra
                  ? `; ${taxNames[0]} = ${g.rate / 2}% of ${F(inv.net)} = ${F(inv.cgst)}, and ${taxNames[1]} the same; Total = ${F(inv.net)} + ${F(inv.cgst)} + ${F(inv.sgst)} = ${F(inv.total)}.`
                  : `; ${taxNames[0]} = ${g.rate}% of ${F(inv.net)} = ${F(inv.igst)}; Total = ${F(inv.net)} + ${F(inv.igst)} = ${F(inv.total)}.`
                : '.'),
          });
          continue;
        }
        if (slot === 'ret') {
          const [inv] = invs;
          const list = amount(rng, 4000, 8000, 4000);
          const net = list - percentOf(list, inv.td);
          const t = taxOf(net);
          if (!t) return null;
          const priced = inv.td > 0 ? `list price ${F(list)}` : `invoiced at ${F(list)}`;
          txs.push({
            text: purchases
              ? `returned to ${inv.party} defective ${b.goods} from invoice no. ${nos[0]}, ${priced}; debit note no. ${noteNo} sent${g ? ' for the goods and the GST on them' : ''}`
              : `${inv.party} returned defective ${b.goods} from invoice no. ${nos[0]}, ${priced}; credit note no. ${noteNo} issued${g ? ' for the goods and the GST on them' : ''}`,
            lines: purchases
              ? [dr(creditor(inv.party), net + t.tax), cr('purchasesReturn', net), ...taxLines(t, 'Cr')]
              : [dr('salesReturn', net), ...taxLines(t, 'Dr'), cr(debtor(inv.party), net + t.tax)],
            out: `the goods returned on ${dates[i]}, which go to the ${returnBook}`,
          });
          continue;
        }
        const x = amount(rng, 8000, 40000, g ? 4000 : 500);
        const t = taxOf(x);
        if (!t) return null;
        if (slot === 'cash') {
          txs.push({
            text: `${verb} ${b.goods} for cash: ${F(x)}${plusGst}`,
            lines: goodsLines(x, t, 'cash'),
            out: `the cash ${purchases ? 'purchase' : 'sale'} of ${dates[i]}, which goes to the Cash Book`,
          });
        } else if (slot === 'cheque') {
          const who = names[nCredit];
          strangers.push(who);
          txs.push({
            text: purchases ? `bought ${b.goods} from ${who} and paid by cheque the same day: ${F(x)}${plusGst}` : `sold ${b.goods} to ${who}, who paid by cheque the same day: ${F(x)}${plusGst}`,
            lines: goodsLines(x, t, 'bank'),
            out: `the ${purchases ? 'purchase' : 'sale'} of ${dates[i]} settled by cheque at once, which goes to the Cash Book`,
          });
        } else {
          const who = names[nCredit + 1];
          strangers.push(who);
          txs.push({
            // The old asset goes at its book value, with nothing about tax: it is not goods of the business, and its line is only to be left out.
            text: purchases ? `bought ${asset.bought} from ${who} on credit: ${F(x)}${plusGst}` : `sold ${asset.sold} of the business to ${who} on credit, at book value: ${F(x)}`,
            lines: purchases ? [dr(asset.id, x), ...taxLines(t, 'Dr'), cr(creditor(who), x + t.tax)] : [dr(debtor(who), x), cr(asset.id, x)],
            out: `the ${asset.name.toLowerCase()} ${purchases ? 'bought' : 'sold'} on credit on ${dates[i]}, an asset and not goods ${purchases ? 'for resale' : 'in which the business deals'}, for which the entry is made in the Journal Proper`,
          });
        }
      }
      const taxAccounts = g ? taxKinds.map((k) => `${purchases ? 'input' : 'output'}${k}`) : undefined;
      const rows = bookRows(txs, dates, purchases ? 'purchases' : 'sales', purchases ? 'creditor:' : 'debtor:', taxAccounts);
      if (rows.length !== nCredit || hasTwins(rows)) return null;
      const netTotal = sum(invs.map((v) => v.net));
      const head = g
        ? `${b.name} of ${state} deals in ${b.goods}, taxed under GST at ${g.rate}%. ` +
          `It ${purchases ? `buys ${b.goods} on credit only from suppliers` : `sells ${b.goods} on credit only to dealers`} ` +
          (g.intra
            ? `in ${state} itself, so each credit invoice carries CGST at ${g.rate / 2}% and SGST at ${g.rate / 2}%. `
            : `in other states, so each credit invoice carries IGST at ${g.rate}%. `) +
          `GST is charged on the price after trade discount. These are some of its transactions of ${m} ${SB_YEAR}:`
        : `${b.name} deals in ${b.goods}. Ignore GST. These are some of its transactions of ${m} ${SB_YEAR}:`;
      const task = g
        ? `Prepare the ${book} of ${b.name} for ${m} ${SB_YEAR}. Enter each invoice that belongs in it against the ${party}, filling every column: ` +
          `its taxable value (its amount after trade discount), its ${allOf(taxNames)}, and its Total (taxable value plus tax).`
        : `Prepare the ${book} of ${b.name} for ${m} ${SB_YEAR}. Enter each invoice that belongs in it against the ${party}, at its amount after trade discount.`;
      const posted = purchases ? 'debit of Purchases A/c' : 'credit of Sales A/c';
      const totals = g
        ? `Taxable value column: ${invs.map((v) => F(v.net)).join(' + ')} = ${F(netTotal)}, posted to the ${posted}. ` +
          (g.intra
            ? `${taxNames[0]} column ${F(sum(invs.map((v) => v.cgst)))} and ${taxNames[1]} column ${F(sum(invs.map((v) => v.sgst)))}, each posted to the ${purchases ? 'debit' : 'credit'} of its own account. `
            : `${taxNames[0]} column: ${F(sum(invs.map((v) => v.igst)))}, posted to the ${purchases ? 'debit' : 'credit'} of ${taxNames[0]} A/c. `) +
          `Total column: ${F(sum(invs.map((v) => v.total)))}, which is the taxable value and the tax together; each ${party} is ${purchases ? 'credited' : 'debited'} with the Total of its own invoice.`
        : `Total of the ${book} = ${invs.map((v) => F(v.net)).join(' + ')} = ${F(netTotal)}, posted to the ${posted} at the end of the month. Each ${party} is ${purchases ? 'credited' : 'debited'} with its own invoice.`;
      return {
        task,
        data: `${head}\n${txs.map((t, i) => `• ${dates[i]}: ${t.text}`).join('\n')}`,
        title: `${book} of ${b.name} for ${m} ${SB_YEAR}`,
        heading: `Particulars (${party})`,
        ...(g ? { columns: ['Taxable value (₹)', ...taxNames.map((n) => `${n} (₹)`), 'Total (₹)'] } : {}),
        rows,
        // What a student wrongly enters: the cash dealing, the asset, the return, and the account the total is posted to.
        distractors: [purchases ? 'Cash purchases' : 'Cash sales', purchases ? 'Purchases A/c' : 'Sales A/c', purchases ? 'Purchases Return A/c' : 'Sales Return A/c', `${asset.name} A/c`, ...strangers],
        explanation: [
          `The ${book} takes only ${b.goods}, the goods in which the business deals, ${verb} on credit. Each invoice is entered against the ${party} at its amount after trade discount${g ? ', which is its taxable value' : ''}.`,
          ...txs.flatMap((t) => (t.work ? [t.work] : [])),
          `Left out: ${txs.flatMap((t) => (t.out ? [t.out] : [])).join('; ')}.`,
          totals,
        ],
        hints: [
          `Go down the list and ask of each transaction: is it ${b.goods}, the goods of the business, and is it ${verb} on credit? Only those are entered in the ${book}.`,
          `Trade discount comes off before the entry: amount = list price less trade discount. Cash and cheque dealings go to the Cash Book, an asset ${verb} on credit to the Journal Proper, and goods returned to the ${returnBook}.${
            g ? ` ${g.intra ? 'CGST and SGST are each half the GST rate' : 'IGST is the full GST rate'} on the taxable value, and the Total is the taxable value plus the tax.` : ''
          }`,
        ],
      };
    },
    // Read again from the list: every line that is a credit invoice for the goods of the business, its list price less its trade discount, and the tax on that.
    verify: (q: StatementQuestion) => {
      const head = q.data.split('\n')[0];
      const purchases = q.title.startsWith('Purchases Book');
      const goods = /deals in (.+?)[.,]/.exec(head)?.[1];
      if (!goods || (!purchases && !q.title.startsWith('Sales Book'))) return false;
      const rate = Number(/GST at (\d+)%/.exec(head)?.[1] ?? 0);
      // Within the state the tax is halved between a CGST and an SGST column; across states it is one IGST column. The last column is the Total.
      const intra = head.includes('CGST');
      if (o.gst !== rate > 0 || (o.gst && intra === head.includes('IGST'))) return false;
      const side = purchases ? 'Input' : 'Output';
      const columns = !o.gst ? ['Amount (₹)'] : ['Taxable value (₹)', ...(intra ? [`${side} CGST (₹)`, `${side} SGST (₹)`] : [`${side} IGST (₹)`]), 'Total (₹)'];
      // The book has those columns, and the task names each of them.
      if (q.columns.join('|') !== columns.join('|') || (o.gst && !columns.slice(1).every((c) => q.prompt.includes(c.replace(' (₹)', ''))))) return false;
      const key = purchases ? `bought ${goods} from ` : `sold ${goods} to `;
      const want = dataItems(q.data)
        .filter((t) => t.startsWith(key) && t.includes(' on credit, invoice no. '))
        .map((t) => {
          const who = t.slice(key.length).split(' on credit, invoice no. ')[0];
          const [list] = moneyIn(t);
          const net = (list * (100 - Number(/less (\d+)% trade discount/.exec(t)?.[1] ?? 0))) / 100;
          const tax = (net * rate) / 100;
          return rowKey(who, !o.gst ? [net] : intra ? [net, tax / 2, tax / 2, net + tax] : [net, tax, net + tax]);
        });
      return want.length >= (o.gst ? 3 : 4) && sameRows(q, want);
    },
  });
}

// sb-fmt-purchases-book, sb-fmt-sales-book: the book of a month among transactions that do not belong in it (medium)
const sbFmtPurchasesBook = goodsBook({ id: 'sb-fmt-purchases-book', purchases: true, gst: false, difficulty: 'medium' });
const sbFmtSalesBook = goodsBook({ id: 'sb-fmt-sales-book', purchases: false, gst: false, difficulty: 'medium' });
// sb-fmt-gst-book: either book with GST, as its taxable value column and one tax column (complex)
const sbFmtGstBook = goodsBook({ id: 'sb-fmt-gst-book', purchases: null, gst: true, difficulty: 'complex' });

// sb-fmt-return-book: the Purchases Return Book or the Sales Return Book, each return with its note (easy)
type ReturnSlot = 'ret' | 'other' | 'invoice';
const sbFmtReturnBook = statementTemplate({
  id: 'sb-fmt-return-book',
  topicId: T,
  conceptId: FMT,
  difficulty: 'easy',
  generate: (rng) => {
    // Returns outwards (the Purchases Return Book, from debit notes) or inwards (the Sales Return Book, from credit notes).
    const outwards = rng.pick([true, false]);
    const b = pickBiz(rng);
    const m = month(rng);
    const n = rng.int(4, 7);
    const names = people(rng, n + 2);
    const slots = rng.shuffle<ReturnSlot>([...Array<ReturnSlot>(n).fill('ret'), 'other', ...(rng.next() < 0.5 ? (['invoice'] as const) : [])]);
    const ds = days(rng, slots.length);
    const dates = ds.map((d) => `${d} ${m}`);
    // The firm numbers its own notes in order; the note of the other kind has a series of its own.
    const firstNote = rng.int(11, 90);
    const otherNote = rng.int(11, 90);
    const invoiceNo = rng.int(101, 900);
    // At most one of the returns is of goods that carried a trade discount.
    const discounted = rng.next() < 0.7 ? rng.int(0, n - 1) : -1;
    const [book, party, note] = outwards ? ['Purchases Return Book', 'supplier', 'debit note'] : ['Sales Return Book', 'customer', 'credit note'];
    const otherBook = outwards ? 'Sales Return Book' : 'Purchases Return Book';
    /** Goods sent back to a supplier (`out`) or sent back by a customer, with the note for them. */
    const returned = (out: boolean, who: string, priced: (traded: string) => string, no: number): string =>
      out ? `returned to ${who} ${b.goods} ${priced('bought')}; debit note no. ${no} sent to ${who}` : `${who} returned ${b.goods} ${priced('sold')}; credit note no. ${no} issued to ${who}`;
    const lines = (out: boolean, who: string, x: Paise): JournalLine[] => (out ? [dr(creditor(who), x), cr('purchasesReturn', x)] : [dr('salesReturn', x), cr(debtor(who), x)]);
    const txs: BookTx[] = [];
    const nets: Paise[] = [];
    for (const [i, slot] of slots.entries()) {
      if (slot === 'ret') {
        const k = nets.length;
        const who = names[k];
        const td = k === discounted ? rng.pick([10, 20, 25]) : 0;
        const list = td > 0 ? amount(rng, 2000, 12000, 2000) : amount(rng, 1000, 9000, 500);
        const net = list - percentOf(list, td);
        nets.push(net);
        txs.push({
          text: returned(outwards, who, (traded) => (td > 0 ? `of list price ${F(list)}, ${traded} on credit at ${td}% trade discount` : `${traded} on credit for ${F(list)}`), firstNote + k),
          lines: lines(outwards, who, net),
          details: [`${outwards ? 'Debit' : 'Credit'} note no. ${firstNote + k}`, ...(td > 0 ? [`List price ${F(list)}`, `Less: Trade discount ${td}% ${F(list - net)}`] : [])],
          work: `${dates[i]}, ${who}, ${note} no. ${firstNote + k}: ${td > 0 ? `${F(list)} - ${td}% (${F(list - net)}) = ${F(net)}, the price that was charged for the goods` : F(net)}.`,
        });
      } else if (slot === 'other') {
        const x = amount(rng, 1000, 9000, 500);
        txs.push({
          text: returned(!outwards, names[n], (traded) => `${traded} on credit for ${F(x)}`, otherNote),
          lines: lines(!outwards, names[n], x),
          out: outwards
            ? `the goods ${names[n]}, a customer, returned on ${dates[i]}: the firm issued a credit note, so they go to the ${otherBook}`
            : `the goods returned to ${names[n]}, a supplier, on ${dates[i]}: the firm sent a debit note, so they go to the ${otherBook}`,
        });
      } else {
        const x = amount(rng, 10000, 60000, 1000);
        txs.push({
          text: outwards ? `bought ${b.goods} from ${names[n + 1]} on credit, invoice no. ${invoiceNo}: ${F(x)}` : `sold ${b.goods} to ${names[n + 1]} on credit, invoice no. ${invoiceNo}: ${F(x)}`,
          lines: outwards ? [dr('purchases', x), cr(creditor(names[n + 1]), x)] : [dr(debtor(names[n + 1]), x), cr('sales', x)],
          out: `the goods ${outwards ? 'bought' : 'sold'} on credit on ${dates[i]}: an invoice, entered in the ${outwards ? 'Purchases Book' : 'Sales Book'}`,
        });
      }
    }
    const rows = bookRows(txs, dates, outwards ? 'purchasesReturn' : 'salesReturn', outwards ? 'creditor:' : 'debtor:');
    if (rows.length !== n || hasTwins(rows)) return null;
    const account = outwards ? 'Purchases Return A/c' : 'Sales Return A/c';
    return {
      task: `Prepare the ${book} of ${b.name} for ${m} ${SB_YEAR}. Enter each ${note} that belongs in it against the ${party}, at the price that was charged for the goods returned.`,
      data:
        `${b.name} deals in ${b.goods}, buying and selling on credit. Ignore GST. Goods returned go back at the price charged for them, after trade discount. ` +
        `These are some of its transactions of ${m} ${SB_YEAR}:\n${txs.map((t, i) => `• ${dates[i]}: ${t.text}`).join('\n')}`,
      title: `${book} of ${b.name} for ${m} ${SB_YEAR}`,
      heading: `Particulars (${party})`,
      rows,
      // The party of the other return, the party of the invoice, and the accounts the totals are posted to.
      distractors: [...names.slice(n, n + (slots.includes('invoice') ? 2 : 1)), 'Purchases Return A/c', 'Sales Return A/c', outwards ? 'Purchases A/c' : 'Sales A/c'],
      explanation: [
        outwards
          ? `The Purchases Return Book takes goods the firm sends back to its suppliers. The buyer debits the supplier and says so by a debit note, and the book is written up from the debit notes sent.`
          : `The Sales Return Book takes goods that customers send back to the firm. The seller credits the customer and says so by a credit note, and the book is written up from the credit notes issued.`,
        ...txs.flatMap((t) => (t.work ? [t.work] : [])),
        `Left out: ${txs.flatMap((t) => (t.out ? [t.out] : [])).join('; ')}.`,
        `Total of the ${book} = ${nets.map(F).join(' + ')} = ${F(sum(nets))}, posted to the ${outwards ? 'credit' : 'debit'} of ${account} at the end of the month. Each ${party} is ${outwards ? 'debited' : 'credited'} with its own note.`,
      ],
      hints: [
        `Who sent the goods back, and to whom? The ${book} takes only goods ${outwards ? 'the firm returns to a supplier' : 'a customer returns to the firm'}.`,
        `A debit note is sent by the buyer who returns goods; a credit note is issued by the seller who takes them back. The ${book} is written up from the ${note}s, each at the price charged for the goods: list price less trade discount.`,
      ],
    };
  },
  // Read again from the list: every line in which goods go back the way of this book, at its price less its trade discount.
  verify: (q: StatementQuestion) => {
    const outwards = q.title.startsWith('Purchases Return Book');
    const goods = /deals in (.+?)[.,]/.exec(q.data)?.[1];
    if (!goods || (!outwards && !q.title.startsWith('Sales Return Book'))) return false;
    const want = dataItems(q.data)
      .filter((t) => (outwards ? t.startsWith('returned to ') && t.includes('; debit note no. ') : t.includes(` returned ${goods} `) && t.includes('; credit note no. ')))
      .map((t) => {
        const who = outwards ? t.slice('returned to '.length).split(` ${goods} `)[0] : t.split(` returned ${goods} `)[0];
        const [price] = moneyIn(t);
        return rowKey(who, [(price * (100 - Number(/at (\d+)% trade discount/.exec(t)?.[1] ?? 0))) / 100]);
      });
    return want.length >= 4 && q.columns.length === 1 && sameRows(q, want);
  },
});

const formats: Template[] = [sbFmtReturnBook, sbFmtPurchasesBook, sbFmtSalesBook, sbFmtGstBook];

// ---------------------------------------------------------------------------------------------------------------
// Books with GST added after the papers were set (outsidePapers keeps them off the papers, worksheets and Look back
// levels): a return book with its GST columns, and a book whose invoices of one month are some within the state
// and some across states.
// ---------------------------------------------------------------------------------------------------------------

/** "Ravi Traders of Kerala": a party and its state, as the data of the mixed book names them. */
const STATE_OF = /^(.+) of ([A-Za-z ]+)$/;

// sb-fmt-gst-book-mixed: the Purchases Book or the Sales Book of a month in which some invoices carry CGST and SGST
// and others IGST, in four columns (complex)
const sbFmtGstBookMixed = statementTemplate({
  id: 'sb-fmt-gst-book-mixed',
  topicId: T,
  conceptId: FMT,
  difficulty: 'complex',
  generate: (rng) => {
    const purchases = rng.pick([true, false]);
    const b = pickGstBiz(rng);
    const m = month(rng);
    const [home, ...away] = rng.shuffle(NOTE_STATES);
    const n = rng.int(4, 5);
    const names = people(rng, n + 1);
    // At least one invoice of each kind, in an order drawn from the seed.
    const within = rng.shuffle([true, false, ...Array.from({ length: n - 2 }, () => rng.pick([true, false]))]);
    const outSlot = rng.int(0, n);
    const ds = days(rng, n + 1);
    const nos = invoiceNos(rng, n, !purchases);
    const [book, verb, prep, party] = purchases ? ['Purchases Book', 'bought', 'from', 'supplier'] : ['Sales Book', 'sold', 'to', 'customer'];
    const side = purchases ? 'Input' : 'Output';
    const lines: string[] = [];
    const rows: FormatRowParts[] = [];
    const work: string[] = [];
    const invs: Inv[] = [];
    let k = 0;
    for (let i = 0; i <= n; i++) {
      const date = `${ds[i]} ${m}`;
      if (i === outSlot) {
        // One dealing that is not a credit invoice for the goods: paid at once, so it goes to the Cash Book.
        const x = amount(rng, 8000, 40000, 4000);
        lines.push(`• ${date}: ${verb} ${b.goods} ${prep} ${names[n]} of ${home} and ${purchases ? 'paid' : 'received'} the amount by cheque the same day: ${F(x)} plus GST`);
        work.push(`${date}: settled by cheque at once, so it goes to the Cash Book and not to the ${book}.`);
        continue;
      }
      const intra = within[k];
      const where = intra ? home : away[k % away.length];
      const who = names[k];
      const inv = makeInv(ds[i], who, amount(rng, 12000, 120000, 4000), rng.pick([0, 10, 20, 25]), { rate: b.rate, intra });
      if (!inv) return null;
      invs.push(inv);
      lines.push(
        `• ${date}: ${verb} ${b.goods} on credit ${prep} ${who} of ${where}, invoice no. ${nos[k]}: ${inv.td > 0 ? `list price ${F(inv.list)} less ${inv.td}% trade discount` : F(inv.list)}, plus GST`,
      );
      rows.push({ date, label: who, amounts: [inv.net, inv.cgst, inv.sgst, inv.igst], details: [`Invoice no. ${nos[k]}`, `${who} of ${where}`] });
      work.push(
        `${date}, ${who} (${intra ? `${home}, the same state` : `${where}, another state`}): taxable value ${inv.td > 0 ? `${F(inv.list)} - ${inv.td}% = ${F(inv.net)}` : F(inv.net)}; ` +
          (intra ? `CGST ${b.rate / 2}% = ${F(inv.cgst)} and SGST ${b.rate / 2}% = ${F(inv.sgst)}; invoice total ${F(inv.total)}.` : `IGST ${b.rate}% = ${F(inv.igst)}; invoice total ${F(inv.total)}.`),
      );
      k++;
    }
    if (hasTwins(rows)) return null;
    const col = (f: (v: Inv) => Paise) => F(sum(invs.map(f)));
    return {
      task: `Prepare the ${book} of ${b.name} for ${m} ${SB_YEAR}, with columns for the taxable value, ${side} CGST, ${side} SGST and ${side} IGST. Enter each credit invoice against the ${party}, and 0 in a tax column the invoice does not carry.`,
      data:
        `${b.name} of ${home} deals in ${b.goods}, taxed under GST at ${b.rate}%. GST is charged on the price after trade discount: as CGST and SGST in equal halves on a supply within ${home}, and as IGST on a supply between states. These are some of its transactions of ${m} ${SB_YEAR}:\n` +
        lines.join('\n'),
      title: `${book} of ${b.name} for ${m} ${SB_YEAR}`,
      heading: `Particulars (${party})`,
      columns: ['Taxable value (₹)', `${side} CGST (₹)`, `${side} SGST (₹)`, `${side} IGST (₹)`],
      rows,
      distractors: [names[n], purchases ? 'Purchases A/c' : 'Sales A/c', `${side} IGST A/c`],
      explanation: [
        `The ${book} takes the credit invoices for ${b.goods}. Where the ${party} is in ${home}, the ${b.rate}% is split into CGST and SGST; where the ${party} is in another state, the whole ${b.rate}% is IGST.`,
        ...work,
        `Column totals: taxable value ${col((v) => v.net)}, posted to the ${purchases ? 'debit of Purchases A/c' : 'credit of Sales A/c'}; ${side} CGST ${col((v) => v.cgst)}, ${side} SGST ${col((v) => v.sgst)} and ${side} IGST ${col((v) => v.igst)}, each posted to the ${purchases ? 'debit' : 'credit'} of its own account.`,
        `Each ${party} is ${purchases ? 'credited' : 'debited'} with the total of its own invoice: ${invs.map((v) => `${v.party} ${F(v.total)}`).join(', ')}.`,
      ],
      hints: [
        `Sort the invoices first: is the ${party} in ${home} or in another state? Leave out what was settled at once.`,
        'For each invoice: taxable value = list price - trade discount. Within the state, CGST and SGST are each half the rate on it; between states, IGST is the whole rate. Put 0 in the tax columns the invoice does not use.',
      ],
    };
  },
  // Read again from the list: each credit invoice, its net price, and the tax as the two states decide it.
  verify: (q: StatementQuestion) => {
    const home = /^.+? of (.+?) deals in /.exec(q.data)?.[1];
    const rate = Number(/GST at (\d+)%/.exec(q.data)?.[1] ?? 0);
    if (!home || !RATES.includes(rate)) return false;
    const want = dataItems(q.data)
      .filter((t) => t.includes(' on credit '))
      .map((t) => {
        const [head] = t.split(', invoice no. ');
        const m = STATE_OF.exec(head.replace(/^.* on credit (?:from|to) /, ''));
        if (!m) return 'unread';
        const [list] = moneyIn(t);
        const net = (list * (100 - Number(/less (\d+)% trade discount/.exec(t)?.[1] ?? 0))) / 100;
        const tax = (net * rate) / 100;
        return rowKey(m[1], m[2] === home ? [net, tax / 2, tax / 2, 0] : [net, 0, 0, tax]);
      });
    const kinds = new Set(q.rows.map((r) => (r.amounts[3] > 0 ? 'inter' : 'intra')));
    return want.length >= 4 && kinds.size === 2 && sameRows(q, want);
  },
});

// sb-fmt-return-book-gst: the Purchases Return Book or the Sales Return Book with its GST columns (medium)
const sbFmtReturnBookGst = statementTemplate({
  id: 'sb-fmt-return-book-gst',
  topicId: T,
  conceptId: FMT,
  difficulty: 'medium',
  generate: (rng) => {
    const outwards = rng.pick([true, false]);
    const b = pickGstBiz(rng);
    const m = month(rng);
    const intra = rng.pick([true, false]);
    const state = rng.pick(NOTE_STATES);
    const g: Gst = { rate: b.rate, intra };
    const n = rng.int(3, 4);
    const names = people(rng, n + 1);
    const nOut = rng.int(1, 2);
    const slots = rng.shuffle<'ret' | 'other' | 'invoice'>([...Array<'ret'>(n).fill('ret'), ...(nOut === 2 ? (['other', 'invoice'] as const) : [rng.pick(['other', 'invoice'] as const)])]);
    const ds = days(rng, slots.length);
    const firstNote = rng.int(11, 90);
    const [book, party, note] = outwards ? ['Purchases Return Book', 'supplier', 'debit note'] : ['Sales Return Book', 'customer', 'credit note'];
    const side = outwards ? 'Input' : 'Output';
    const taxNames = intra ? [`${side} CGST`, `${side} SGST`] : [`${side} IGST`];
    const lines: string[] = [];
    const rows: FormatRowParts[] = [];
    const work: string[] = [];
    const left: string[] = [];
    const notes: Inv[] = [];
    for (const [i, slot] of slots.entries()) {
      const date = `${ds[i]} ${m}`;
      if (slot === 'ret') {
        const k = notes.length;
        const who = names[k];
        const td = rng.pick([0, 10, 20]);
        const inv = makeInv(ds[i], who, amount(rng, 4000, 40000, 4000), td, g);
        if (!inv) return null;
        notes.push(inv);
        const priced = td > 0 ? `list price ${F(inv.list)}, invoiced at ${td}% trade discount` : `invoiced at ${F(inv.list)}`;
        lines.push(
          outwards
            ? `• ${date}: returned to ${who} defective ${b.goods}, ${priced}; debit note no. ${firstNote + k} sent for the goods and the GST on them`
            : `• ${date}: ${who} returned ${b.goods}, ${priced}; credit note no. ${firstNote + k} issued for the goods and the GST on them`,
        );
        rows.push({ date, label: who, amounts: intra ? [inv.net, inv.cgst, inv.sgst, inv.total] : [inv.net, inv.igst, inv.total], details: [`${outwards ? 'Debit' : 'Credit'} note no. ${firstNote + k}`] });
        work.push(
          `${date}, ${who}: ${td > 0 ? `${F(inv.list)} - ${td}% = ${F(inv.net)}` : F(inv.net)}; ` +
            (intra ? `${taxNames[0]} ${b.rate / 2}% = ${F(inv.cgst)}, ${taxNames[1]} ${F(inv.sgst)}` : `${taxNames[0]} ${b.rate}% = ${F(inv.igst)}`) +
            `; total ${F(inv.total)}.`,
        );
      } else if (slot === 'other') {
        const x = amount(rng, 4000, 20000, 4000);
        lines.push(
          outwards
            ? `• ${date}: ${names[n]}, a customer, returned ${b.goods} invoiced at ${F(x)}; credit note issued for the goods and the GST on them`
            : `• ${date}: returned to ${names[n]}, a supplier, ${b.goods} invoiced at ${F(x)}; debit note sent for the goods and the GST on them`,
        );
        left.push(`the return of ${date} goes the other way, so it belongs in the ${outwards ? 'Sales Return Book' : 'Purchases Return Book'}`);
      } else {
        const x = amount(rng, 12000, 60000, 4000);
        lines.push(`• ${date}: ${outwards ? `bought ${b.goods} on credit from ${names[0]}` : `sold ${b.goods} on credit to ${names[0]}`}, invoice for ${F(x)} plus GST`);
        left.push(`the invoice of ${date} belongs in the ${outwards ? 'Purchases Book' : 'Sales Book'}`);
      }
    }
    if (hasTwins(rows)) return null;
    const col = (f: (v: Inv) => Paise) => F(sum(notes.map(f)));
    const account = outwards ? 'Purchases Return A/c' : 'Sales Return A/c';
    return {
      task: `Prepare the ${book} of ${b.name} for ${m} ${SB_YEAR}, with columns for the taxable value, ${taxNames.join(' and ')}, and the Total. Enter each ${note} that belongs in it against the ${party}.`,
      data:
        `${b.name} of ${state} deals in ${b.goods}, taxed under GST at ${b.rate}%. Its suppliers and customers are all ${intra ? `in ${state} itself, so its invoices and notes carry CGST and SGST in equal halves` : 'in other states, so its invoices and notes carry IGST'}. ` +
        `Goods returned go back at the price charged for them, after trade discount, and the note covers the GST on them. These are some of its transactions of ${m} ${SB_YEAR}:\n` +
        lines.join('\n'),
      title: `${book} of ${b.name} for ${m} ${SB_YEAR}`,
      heading: `Particulars (${party})`,
      columns: ['Taxable value (₹)', ...taxNames.map((t) => `${t} (₹)`), 'Total (₹)'],
      rows,
      distractors: [names[n], account, outwards ? 'Purchases A/c' : 'Sales A/c'],
      explanation: [
        outwards
          ? `The Purchases Return Book is written up from the debit notes sent to suppliers. A return reverses part of the purchase, the input tax on it as well.`
          : `The Sales Return Book is written up from the credit notes issued to customers. A return reverses part of the sale, the output tax on it as well.`,
        ...work,
        ...(left.length ? [`Left out: ${left.join('; ')}.`] : []),
        `Column totals: taxable value ${col((v) => v.net)}, posted to the ${outwards ? 'credit' : 'debit'} of ${account}; ` +
          (intra ? `${taxNames[0]} ${col((v) => v.cgst)} and ${taxNames[1]} ${col((v) => v.sgst)}` : `${taxNames[0]} ${col((v) => v.igst)}`) +
          `, posted to the ${outwards ? 'credit' : 'debit'} of the tax account${intra ? 's' : ''}. Each ${party} is ${outwards ? 'debited' : 'credited'} with the total of its note.`,
      ],
      hints: [
        `Who sent the goods back, and to whom? The ${book} takes only the ${note}s.`,
        `Each note: taxable value = the price charged (list price less trade discount); ${intra ? 'CGST and SGST each at half the rate' : 'IGST at the full rate'} on it; total = taxable value + tax.`,
      ],
    };
  },
  // Read again from the list: each note of this book's kind, its price less its trade discount, and the tax on that.
  verify: (q: StatementQuestion) => {
    const outwards = q.title.startsWith('Purchases Return Book');
    const rate = Number(/GST at (\d+)%/.exec(q.data)?.[1] ?? 0);
    const intra = q.data.includes('CGST and SGST');
    if (!RATES.includes(rate)) return false;
    const want = dataItems(q.data)
      .filter((t) => (outwards ? t.startsWith('returned to ') && t.includes('; debit note no. ') : t.includes(' returned ') && t.includes('; credit note no. ')))
      .map((t) => {
        const who = outwards ? t.slice('returned to '.length).split(' defective ')[0] : t.split(' returned ')[0];
        const [price] = moneyIn(t);
        const net = (price * (100 - Number(/at (\d+)% trade discount/.exec(t)?.[1] ?? 0))) / 100;
        const tax = (net * rate) / 100;
        return rowKey(who, intra ? [net, tax / 2, tax / 2, net + tax] : [net, tax, net + tax]);
      });
    return want.length >= 3 && q.columns.length === (intra ? 4 : 3) && sameRows(q, want);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Freight and cartage in GST sums. Added after the check against the CBSE 2025-26 syllabus, whose note on the books
// asks for "trade discount, freight and cartage expenses for simple GST calculation". Freight or cartage that the
// supplier charges on the invoice is part of the value of the supply: trade discount comes off the list price, the
// freight goes on, and GST (5% or 18%) is worked on that total. Cartage the buyer pays to someone else is not.
// ---------------------------------------------------------------------------------------------------------------

/** Every rupee amount written in a text, in order, in paise; and every percentage. Used by `verify` to re-read a prompt. */
const rupeesIn = (text: string): Paise[] => Array.from(text.matchAll(/₹(\d[\d,]*)/g), (m) => rupees(Number(m[1].replace(/,/g, ''))));
const percentsIn = (text: string): number[] => Array.from(text.matchAll(/(\d+(?:\.\d+)?)%/g), (m) => Number(m[1]));

/** An invoice that charges freight: the list price, the trade discount, the freight and the GST worked on the lot. */
interface FreightInvoice {
  firm: Biz;
  supplier: string;
  list: Paise;
  td: number;
  freight: Paise;
  g: Gst;
  net: Paise;
  taxable: Paise;
  tax: Tax;
  /** GST on the price after discount alone, the slip of leaving the freight out. */
  taxOnGoods: Tax;
}

function freightInvoice(rng: Rng): FreightInvoice | null {
  const firm = pickGstBiz(rng);
  const [supplier] = people(rng, 1);
  const list = amount(rng, 20000, 200000, 4000);
  const td = rng.pick([5, 10, 20, 25]);
  const freight = amount(rng, 500, 6000, 500);
  const g: Gst = { rate: firm.rate, intra: rng.pick([true, false]) };
  const net = list - percentOf(list, td);
  const taxable = net + freight;
  const tax = taxOn(taxable, g);
  const taxOnGoods = taxOn(net, g);
  if (net % 100 !== 0 || !tax || !taxOnGoods) return null;
  return { firm, supplier, list, td, freight, g, net, taxable, tax, taxOnGoods };
}

const freightHead = (v: FreightInvoice): string =>
  `${v.supplier} supplies ${v.firm.goods} to ${v.firm.name} at a list price of ${F(v.list)} less ${v.td}% trade discount, and charges freight of ${F(v.freight)} on the same invoice for delivering them. GST is ${v.g.rate}% (${v.g.intra ? `CGST ${v.g.rate / 2}% and SGST ${v.g.rate / 2}%, both being in the same state` : 'IGST, the supplier being in another state'}).`;

const freightSteps = (v: FreightInvoice): string[] => [
  `Trade discount = ${v.td}% of ${F(v.list)} = ${F(v.list - v.net)}; price after discount = ${F(v.net)}.`,
  `Freight charged on the invoice is part of the value of the supply: taxable value = ${F(v.net)} + ${F(v.freight)} = ${F(v.taxable)}.`,
  v.g.intra
    ? `CGST = ${v.g.rate / 2}% of ${F(v.taxable)} = ${F(v.tax.cgst)}; SGST = ${F(v.tax.sgst)}.`
    : `IGST = ${v.g.rate}% of ${F(v.taxable)} = ${F(v.tax.igst)}.`,
];

/** The taxable value a prompt of this family gives, worked out again from its figures: list less discount, plus freight. */
function taxableFrom(prompt: string): Paise | null {
  const [list, freight] = rupeesIn(prompt);
  const [td] = percentsIn(prompt);
  if (list === undefined || freight === undefined || td === undefined) return null;
  return (list * (100 - td)) / 100 + freight;
}

const sbFreightTaxable = numericTemplate({
  id: 'sb-freight-taxable', topicId: T, conceptId: K.gst, difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const v = freightInvoice(rng);
    if (!v) return null;
    const discountOnAll = v.list + v.freight - percentOf(v.list + v.freight, v.td);
    return {
      prompt: `${freightHead(v)} On what value is the GST worked out?`,
      answer: v.taxable,
      commonErrors: [
        { value: v.net, why: 'Left the freight out; freight that the supplier charges on the invoice is part of the value on which GST is charged.' },
        { value: v.list + v.freight, why: 'Forgot to deduct the trade discount before working the GST.' },
        ...(discountOnAll % 100 === 0 && discountOnAll !== v.taxable ? [{ value: discountOnAll, why: 'Took the trade discount on the freight as well; the discount is allowed on the list price of the goods only.' }] : []),
        { value: v.taxable + v.tax.tax, why: 'Gave the invoice total, with the GST in it, instead of the value the GST is worked on.' },
      ],
      explanation: freightSteps(v).slice(0, 2),
    };
  },
  verify: (q) => taxableFrom(q.prompt) === q.answer,
});

const sbFreightGst = numericTemplate({
  id: 'sb-freight-gst', topicId: T, conceptId: K.gst, difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const v = freightInvoice(rng);
    if (!v) return null;
    const head = v.g.intra ? 'CGST' : 'IGST';
    const answer = v.g.intra ? v.tax.cgst : v.tax.igst;
    const onList = taxOn(v.list + v.freight, v.g);
    return {
      prompt: `${freightHead(v)} How much ${head} does the invoice show?`,
      answer,
      commonErrors: [
        { value: v.g.intra ? v.taxOnGoods.cgst : v.taxOnGoods.igst, why: 'Worked the tax on the goods alone and left the freight out of the taxable value.' },
        v.g.intra
          ? { value: v.tax.tax, why: 'Gave the whole GST; CGST is half of it, the other half being SGST.' }
          : { value: v.tax.igst / 2, why: 'Split the tax into two halves as for a supply within the state; across states the whole of it is IGST.' },
        ...(onList ? [{ value: v.g.intra ? onList.cgst : onList.igst, why: 'Worked the tax before deducting the trade discount.' }] : []),
      ],
      explanation: freightSteps(v),
    };
  },
  verify: (q) => {
    const taxable = taxableFrom(q.prompt);
    const rate = percentsIn(q.prompt)[1];
    if (taxable === null || rate === undefined) return false;
    const whole = (taxable * rate) / 100;
    return q.answer === (/How much CGST/.test(q.prompt) ? whole / 2 : whole);
  },
});

const sbFreightInvoiceTotal = numericTemplate({
  id: 'sb-freight-invoice-total', topicId: T, conceptId: K.gst, difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const v = freightInvoice(rng);
    if (!v) return null;
    const total = v.taxable + v.tax.tax;
    return {
      prompt: `${freightHead(v)} What is the invoice total, the amount credited to ${v.supplier} in the books of ${v.firm.name}?`,
      answer: total,
      commonErrors: [
        { value: v.net + v.taxOnGoods.tax + v.freight, why: 'Added the freight after the tax, so no GST was charged on it.' },
        { value: v.net + v.taxOnGoods.tax, why: 'Left the freight out of the invoice altogether.' },
        { value: v.taxable, why: 'Left the GST out of the invoice total.' },
      ],
      explanation: [...freightSteps(v), `Invoice total = ${F(v.taxable)} + ${F(v.tax.tax)} = ${F(total)}.`],
    };
  },
  verify: (q) => {
    const taxable = taxableFrom(q.prompt);
    const rate = percentsIn(q.prompt)[1];
    return taxable !== null && rate !== undefined && q.answer === taxable + (taxable * rate) / 100;
  },
});

const sbFreightEntry = journalTemplate({
  id: 'sb-freight-entry', topicId: T, conceptId: K.gst, difficulty: 'medium',
  generate: (rng) => {
    const v = freightInvoice(rng);
    if (!v) return null;
    const total = v.taxable + v.tax.tax;
    const tax: JournalLine[] = v.g.intra
      ? [{ accountId: 'inputCGST', side: 'Dr', amount: v.tax.cgst }, { accountId: 'inputSGST', side: 'Dr', amount: v.tax.sgst }]
      : [{ accountId: 'inputIGST', side: 'Dr', amount: v.tax.igst }];
    return {
      prompt: `${freightHead(v)} The goods are bought on credit, and ${v.firm.name} debits freight on purchases to Carriage Inwards A/c. Pass the entry in the books of ${v.firm.name}.`,
      lines: [
        { accountId: 'purchases', side: 'Dr', amount: v.net },
        { accountId: 'carriageInwards', side: 'Dr', amount: v.freight },
        ...tax,
        { accountId: creditor(v.supplier), side: 'Cr', amount: total },
      ],
      explanation: [
        ...freightSteps(v),
        `Purchases A/c is debited with the price after discount, ${F(v.net)}, and Carriage Inwards A/c with the freight, ${F(v.freight)}.`,
        `The GST paid can be set off later, so ${v.g.intra ? 'Input CGST and Input SGST are' : 'Input IGST is'} debited. ${v.supplier} is credited with the invoice total, ${F(total)}.`,
      ],
      distractorAccounts: ['carriageOutwards', 'freight', v.g.intra ? 'inputIGST' : 'inputCGST', 'sales'],
    };
  },
  verify: (q) => {
    const taxable = taxableFrom(q.prompt);
    const rate = percentsIn(q.prompt)[1];
    const [list, freight] = rupeesIn(q.prompt);
    if (taxable === null || rate === undefined) return false;
    const line = (id: string) => q.expected.find((l) => l.accountId === id)?.amount ?? 0;
    const gst = line('inputCGST') + line('inputSGST') + line('inputIGST');
    return line('carriageInwards') === freight && line('purchases') + freight === taxable && list > line('purchases') && gst * 100 === taxable * rate;
  },
});

const sbFreightFacts = factsTemplate({
  id: 'sb-freight-facts', topicId: T, conceptId: K.gst, difficulty: 'easy',
  facts: [
    {
      prompt: 'A supplier charges freight on the invoice for delivering the goods. How is the freight treated in the GST calculation?',
      correct: 'It is added to the price after trade discount, and GST is charged on the total',
      distractors: [
        { text: 'It is left out of the taxable value, because it is not the price of the goods', why: 'Missed that freight charged by the supplier on the invoice is part of the value of the supply.' },
        { text: 'It is deducted from the price, like a trade discount', why: 'Freight is a charge the buyer pays, not an allowance the buyer gets.' },
        { text: 'It is added after the GST has been worked, with no tax on it', why: 'Worked the tax first and added the freight later, so the freight escaped GST.' },
      ],
      explanation: 'Freight that the supplier charges on the invoice is part of what the buyer pays for the supply, so it is in the taxable value.',
    },
    {
      prompt: 'On an invoice with a trade discount and freight, in what order are the figures worked?',
      correct: 'Trade discount off the list price, freight added, then GST on the total',
      distractors: [
        { text: 'GST on the list price, then trade discount, then freight', why: 'Worked the tax before the trade discount, so GST was charged on an amount the buyer never pays.' },
        { text: 'Trade discount off the list price, GST worked, then freight added', why: 'Added the freight after the tax, leaving it out of the taxable value.' },
        { text: 'Freight added to the list price, trade discount off the total, then GST', why: 'Allowed the trade discount on the freight as well; it is allowed on the list price of the goods only.' },
      ],
      explanation: 'The taxable value is the price after trade discount plus the freight charged on the invoice; GST comes last.',
    },
    {
      prompt: 'The buyer pays cartage in cash to a local transporter to bring goods from the station, apart from the supplier\'s invoice. Is the cartage part of the taxable value on the supplier\'s invoice?',
      correct: 'No: the supplier does not charge it, so it is recorded on its own in Carriage Inwards A/c',
      distractors: [
        { text: 'Yes: every cost of bringing the goods in is added to the supplier\'s taxable value', why: 'Only what the supplier charges on the invoice is part of the supplier\'s value; this cartage is paid to someone else.' },
        { text: 'Yes, and the supplier must charge GST on it', why: 'The supplier neither pays nor charges this cartage, so it cannot appear on the supplier\'s invoice.' },
        { text: 'No, and it is not recorded at all, because it was paid in cash', why: 'Every expense paid is recorded, in cash or not: cartage on purchases is debited to Carriage Inwards A/c.' },
      ],
      explanation: 'Cartage that the buyer pays to a transporter is a direct expense of the buyer, debited to Carriage Inwards A/c; it does not change the supplier\'s invoice.',
    },
    {
      prompt: 'Freight is charged on the invoice for goods taxed at 18%. At what rate is GST charged on the freight?',
      correct: 'At 18%, the rate of the goods it goes with',
      distractors: [
        { text: 'At nil, because freight is not goods', why: 'Freight charged with the goods on one invoice is part of the value of that supply.' },
        { text: 'At 5%, the rate of the transport alone, worked separately', why: 'Treated the freight as a separate supply; charged by the supplier with the goods, it takes the rate of the goods.' },
        { text: 'At 9%, half the rate of the goods', why: 'Took CGST alone as the rate; within a state 9% CGST and 9% SGST make 18%.' },
      ],
      explanation: 'The goods and their delivery, charged together by the supplier on one invoice, make one supply whose main part is the goods: the whole taxable value, freight included, bears the rate of the goods.',
    },
    {
      prompt: 'An invoice shows: list price, less trade discount, add freight, add GST. Which figure is credited to the supplier in the buyer\'s books when the goods are bought on credit?',
      correct: 'The invoice total, freight and GST included',
      distractors: [
        { text: 'The list price', why: 'Ignored the trade discount, the freight and the GST; the supplier is owed what the invoice comes to.' },
        { text: 'The price after trade discount', why: 'Left out the freight and the GST, which the buyer owes the supplier as well.' },
        { text: 'The price after trade discount plus GST, without the freight', why: 'Left out the freight, which the supplier charged on the same invoice.' },
      ],
      explanation: 'The buyer owes the supplier the whole invoice: price after discount, freight and GST.',
    },
  ],
});

const freightTemplates: Template[] = [sbFreightFacts, sbFreightTaxable, sbFreightGst, sbFreightInvoiceTotal, sbFreightEntry];

// ---------------------------------------------------------------------------------------------------------------
// Version 2. Every template below the line made something new in version 2: hints of its own in place of the
// default pair, GST at the rate its goods carry (GST_BIZ), a cash discount of a few per cent, a customer never
// called "Suppliers", and decoys that belong to the scene. `revised` raises the version by exactly one and puts in
// the hints; a template whose own hints stay gets `null`.
// ---------------------------------------------------------------------------------------------------------------

type HintPair = readonly [string, string];

const H_TD: HintPair = [
  'Trade discount comes off the list price before anything is written in the books.',
  'Amount entered = list price - trade discount. A return goes back at the same net price the goods were invoiced at, never at the list price.',
];
const H_DISCOUNT_KIND: HintPair = [
  'When is the discount given: on the invoice when the goods are sold, or later, for paying early?',
  'Trade discount is taken off the list price on the invoice and never recorded. Cash discount is allowed for prompt payment and is recorded: Discount Allowed by the seller, Discount Received by the buyer.',
];
const H_DOCUMENT: HintPair = [
  'Who sends the document, and why: goods sold, goods sent back, goods taken back, or money paid?',
  'Credit sale: invoice. Goods returned by the buyer: debit note, sent by the buyer. Goods taken back by the seller: credit note. Cash sale: cash memo. Money received: receipt.',
];
const H_DOC_BOOK: HintPair = [
  'Name the document first, and who issued it: the buyer or the seller.',
  'Invoice received: Purchases Book. Copy of an invoice sent: Sales Book. Debit note (goods returned to a supplier): Purchases Return Book. Credit note (goods taken back from a customer): Sales Return Book.',
];
const H_GST_INTRA: HintPair = [
  'Same state: the GST is shared equally between two taxes.',
  'GST = rate × price after trade discount; CGST = SGST = half of it; invoice total = price + CGST + SGST.',
];
const H_GST_INTER: HintPair = [
  'Another state: one tax carries the whole rate.',
  'IGST = full rate × price after trade discount; invoice total = price + IGST.',
];
const H_GST_RATE: HintPair = [
  'Same state or another state? That decides which taxes appear on the invoice.',
  'Within the state the rate is split equally into CGST and SGST; between states the whole rate is charged as IGST.',
];
const H_GST_COLUMNS: HintPair = [
  'Are the seller and the buyer in the same state?',
  'Same state: the CGST and SGST columns; different states: the IGST column. A Purchases Book posts them to Input tax accounts (debit), a Sales Book to Output tax accounts (credit).',
];
const H_GST_RETURNS: HintPair = [
  'A return reverses part of the original invoice, the tax on it included.',
  'A purchase return reduces the input tax: Input CGST and Input SGST (or IGST) are credited. A sales return reduces the output tax: Output CGST and SGST (or IGST) are debited.',
];
const H_INVOICE: HintPair = [
  'Work the invoice in order: trade discount off the list price first, GST last.',
  'Taxable value = list price - trade discount; GST = rate × taxable value (CGST and SGST in halves, or IGST whole); invoice total = taxable value + GST.',
];
const H_GST_BOOK: HintPair = [
  'Work each invoice on its own line: trade discount off, then GST on the net price.',
  'The taxable-value column adds the net prices, each tax column adds its tax, and the Total column is taxable value + tax. Check that the columns cross-add.',
];
const H_MIXED_STATE: HintPair = [
  'Sort the invoices by state first: same-state invoices carry CGST and SGST, other-state invoices IGST.',
  'For each invoice: taxable value = list price - trade discount; tax at the rate of the goods, split or whole by state. Then add only the column asked for.',
];
const H_SORT: HintPair = [
  'Go down the list and ask two things of each item: is it the goods the business deals in, and is it on credit?',
  'Only credit purchases of goods go to the Purchases Book (credit sales of goods to the Sales Book). Cash and cheque deals go to the Cash Book, assets and other items to the Journal Proper, returns to the return books.',
];
const H_NOT_IN: HintPair = [
  'Look for the one item that is not goods bought (or sold) on credit.',
  'A cash or cheque deal goes to the Cash Book and an asset bought or sold on credit to the Journal Proper, so neither is entered in the Purchases Book or the Sales Book.',
];
const H_BOOK_TOTAL: HintPair = [
  'Check that each invoice belongs in the book: goods, on credit.',
  'Add the amounts of the invoices entered. At the month end the total is posted to Purchases A/c (debit) or Sales A/c (credit).',
];
const H_NET_FIGURE: HintPair = [
  'Returns reduce the gross figure of the month.',
  'Net sales = Sales Book total - Sales Return Book total; net purchases = Purchases Book total - Purchases Return Book total.',
];
const H_TOTAL_POSTING: HintPair = [
  'The total of a book goes to the ledger account the book is named after.',
  'Purchases Book total: Purchases A/c debited. Sales Book: Sales A/c credited. Purchases Return Book: Purchases Return A/c credited. Sales Return Book: Sales Return A/c debited.',
];
const H_PARTY_POSTING: HintPair = [
  "Each entry is posted, on its own day, to the party's personal account.",
  'Purchases Book: the supplier is credited. Sales Book: the customer is debited. Purchases Return Book (debit note): the supplier is debited. Sales Return Book (credit note): the customer is credited.',
];
const H_PARTY_BALANCE: HintPair = [
  "Build the party's account: what raises the amount owed, and what reduces it?",
  'Balance = opening balance + invoices (with GST) - returns (the debit or credit notes) - money paid or received.',
];
const H_REVERSE: HintPair = [
  'Work backwards: take the GST out of the invoice total first.',
  'Taxable value = total × 100 ÷ (100 + rate); then list price = taxable value × 100 ÷ (100 - trade discount).',
];
const H_NET_SALES_GST: HintPair = [
  'The credit notes include GST, but net sales are wanted before GST.',
  'Returns before GST = credit notes × 100 ÷ (100 + rate); net sales = Sales Book before GST - returns before GST.',
];
const H_UNITS_DUE: HintPair = [
  'Find the net price of one unit after trade discount first.',
  'Invoice = units × net price + GST; debit note = units returned × net price + GST; still owed = invoice - debit note - payment.',
];
const H_CREDIT_NOTE: HintPair = [
  'Price the units sent back the way they were invoiced: list price less trade discount.',
  'Credit note = units returned × net price per unit, plus GST at the same rate (CGST and SGST, or IGST).',
];
const H_NET_GST: HintPair = [
  'Net each tax account first: a return reduces the tax it reverses.',
  'Output CGST = Sales Book - Sales Return Book; Input CGST = Purchases Book - Purchases Return Book; payable = output - input.',
];
const H_FREIGHT_FACTS: HintPair = [
  'Freight charged on the invoice is part of the supply of the goods.',
  'It takes the GST rate of the goods it delivers and is added to the taxable value before GST is worked out.',
];
const H_FREIGHT: HintPair = [
  'Trade discount off the list price first; then add the freight charged on the same invoice.',
  'Taxable value = list price - trade discount + freight; GST at the rate of the goods on that value; invoice total = taxable value + GST.',
];
const H_FREIGHT_ENTRY: HintPair = [
  'Split the invoice into its parts: the goods, the freight and the tax.',
  'Purchases A/c with the price after trade discount, Carriage Inwards A/c with the freight, the Input tax accounts with the GST; the supplier is credited with the invoice total.',
];
const H_SET_JP: HintPair = [
  'For each item ask first: would the Cash Book or a goods book take it? Only what none of them takes is journalised here.',
  'The Journal Proper takes assets bought or sold on credit, goods withdrawn or given away (Purchases A/c credited at cost), opening entries, adjustments and corrections.',
];
const H_SET_NOTES: HintPair = [
  'Each note reverses part of an invoice: the goods and the GST on them.',
  'Debit note (purchase return): debit the supplier; credit Purchases Return A/c and the Input tax. Credit note (sales return): debit Sales Return A/c and the Output tax; credit the customer.',
];

const REVISED: Record<string, HintPair | null> = {
  // hints of their own (the guided level first: sb-net-invoice, sb-gst-intra, sb-gst-inter)
  'sb-net-invoice': H_TD,
  'sb-gst-intra': H_GST_INTRA,
  'sb-gst-inter': H_GST_INTER,
  'sb-which-document': H_DOCUMENT,
  'sb-doc-to-book': H_DOC_BOOK,
  'sb-trade-or-cash-discount': H_DISCOUNT_KIND,
  'sb-gst-rate': H_GST_RATE,
  'sb-which-gst-columns': H_GST_COLUMNS,
  'sb-book-total-simple': H_BOOK_TOTAL,
  'sb-net-figure': H_NET_FIGURE,
  'sb-total-posting': H_TOTAL_POSTING,
  'sb-party-posting': H_PARTY_POSTING,
  'sb-invoice-total': H_INVOICE,
  'sb-purchases-book-gst': H_GST_BOOK,
  'sb-sales-book-gst': H_GST_BOOK,
  'sb-purchases-book-sort': H_SORT,
  'sb-sales-book-sort': H_SORT,
  'sb-return-at-net': H_TD,
  'sb-debit-note-amount': H_TD,
  'sb-creditor-balance': H_PARTY_BALANCE,
  'sb-debtor-balance': H_PARTY_BALANCE,
  'sb-gst-on-returns': H_GST_RETURNS,
  'sb-not-in-purchases-book': H_NOT_IN,
  'sb-not-in-sales-book': H_NOT_IN,
  'sb-mixed-state-total': H_MIXED_STATE,
  'sb-reverse-gst': H_REVERSE,
  'sb-net-sales-gst': H_NET_SALES_GST,
  'sb-supplier-due': H_UNITS_DUE,
  'sb-net-gst-payable': H_NET_GST,
  'sb-credit-note-gst': H_CREDIT_NOTE,
  'sb-count-entries': H_SORT,
  'sb-set-journal-proper': H_SET_JP,
  'sb-set-journal-or-book': H_SET_JP,
  'sb-set-notes-gst': H_SET_NOTES,
  'sb-freight-facts': H_FREIGHT_FACTS,
  'sb-freight-taxable': H_FREIGHT,
  'sb-freight-gst': H_FREIGHT,
  'sb-freight-invoice-total': H_FREIGHT,
  'sb-freight-entry': H_FREIGHT_ENTRY,
  // their own hints stay; what they make changed (GST of the goods, the customer's name, the decoys)
  'sb-which-book': null,
  'sb-asset-credit-purchase': null,
  'sb-asset-credit-sale': null,
  'sb-opening-entry': null,
  'sb-debit-note-entry': null,
  'sb-credit-note-entry': null,
  'sb-purpose-matters': null,
  'sb-fmt-return-book': null,
  'sb-fmt-purchases-book': null,
  'sb-fmt-sales-book': null,
  'sb-fmt-gst-book': null,
};

/**
 * Raised one version more, after `revised`, for wording without a gendered pronoun (the house rule): the reason a
 * debit or credit note is sent once told the buyer or seller to inform "him". sb-which-document is at version 3.
 */
const WITHOUT_PRONOUN: ReadonlySet<string> = new Set(['sb-which-document']);
const withoutPronoun = (t: Template): Template => (WITHOUT_PRONOUN.has(t.id) ? { ...t, version: t.version + 1 } : t);

/** The template at the next version, with its hints put in when it is given a pair. */
function revised(t: Template): Template {
  if (!Object.hasOwn(REVISED, t.id)) return t;
  if (t.version !== 1) throw new Error(`${t.id} is at version ${t.version}, not 1`);
  const hints = REVISED[t.id];
  if (!hints) return { ...t, version: 2 };
  const generate = (rng: Rng, seed: number) => {
    const parts = (t.generate as (r: Rng, s: number) => object | null)(rng, seed);
    return parts && { ...parts, hints: [...hints] };
  };
  return { ...t, version: 2, generate } as Template;
}

const templates: Template[] = [
  // easy
  sbWhichBook,
  sbWhichDocument,
  sbDocToBook,
  sbNetInvoice,
  sbTradeOrCash,
  sbGstIntra,
  sbGstInter,
  sbGstRate,
  sbWhichGstColumns,
  sbBookTotalSimple,
  sbNetFigure,
  sbTotalPosting,
  sbPartyPosting,
  sbAssetCreditPurchase,
  sbAssetCreditSale,
  // medium
  sbInvoiceTotal,
  sbPurchasesBookGst,
  sbSalesBookGst,
  sbPurchasesBookSort,
  sbSalesBookSort,
  sbReturnAtNet,
  sbDebitNoteAmount,
  sbCreditorBalance,
  sbDebtorBalance,
  sbGstOnReturns,
  sbNotInPurchasesBook,
  sbNotInSalesBook,
  sbOpeningEntry,
  sbGoodsNotSold,
  sbDebitNoteEntry,
  sbCreditNoteEntry,
  sbAdjustingEntry,
  // complex
  sbPurposeMatters,
  sbMixedStateTotal,
  sbReverseGst,
  sbNetSalesGst,
  sbSupplierDue,
  sbNetGstPayable,
  sbCreditNoteGst,
  sbCountEntries,
  // sets of entries
  ...sets,
  // books to write up
  ...formats,
  // freight and cartage in GST sums (added after the check against the CBSE 2025-26 syllabus)
  ...freightTemplates,
].map(revised).map(withoutPronoun);

// Assertion and Reason comes last, and is on its own level and on no mock paper (see assertionReason.ts).
const assertionReason = assertionReasonTemplate({
  prefix: 'sb', topicId: 'subsidiary-books', conceptId: 'sb-which-book',
  items: [
    {
      answer: 'explains',
      a: 'Goods bought for cash are not entered in the Purchases Book.',
      r: 'The Purchases Book takes credit purchases of goods only, and a cash purchase belongs in the Cash Book.',
      aWhy: 'Money has been paid, so the purchase goes in the Cash Book.',
      rWhy: 'A subsidiary book collects one kind of transaction.',
      link: 'The purchase is kept out because it was not on credit, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'A buyer who returns goods to a supplier sends a debit note.',
      r: 'The note tells the supplier that the buyer has debited the supplier\'s account.',
      aWhy: 'The debit note goes from the buyer to the supplier.',
      rWhy: 'The return reduces what the buyer owes, so the supplier is debited in the buyer\'s books.',
      link: 'The note takes its name from what its sender has done to the other party\'s account, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'The sale of old furniture on credit for ₹12,000 is entered in the Journal Proper.',
      r: 'The Journal Proper takes what no other book takes, and furniture is not the goods in which the business deals.',
      aWhy: 'It is not a sale of goods, and no money has moved.',
      rWhy: 'The Journal Proper is the residual book.',
      link: 'The sale does not fit the Sales Book or the Cash Book, so it falls to the Journal Proper. R explains A.',
    },
    {
      answer: 'explains',
      a: 'With purchases of ₹80,000 and purchases returns of ₹5,000, net purchases are ₹75,000.',
      r: 'Returns reduce the goods bought, so they are deducted from purchases.',
      aWhy: 'Net purchases = ₹80,000 - ₹5,000 = ₹75,000.',
      rWhy: 'Goods sent back are no longer goods bought.',
      link: 'The returns are deducted for that reason, which gives the net figure, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'On goods listed at ₹20,000, with a trade discount of 10% and GST at 18%, the invoice total is ₹21,240.',
      r: 'GST is worked on the price after trade discount.',
      aWhy: 'Taxable value ₹18,000 + GST ₹3,240 = ₹21,240.',
      rWhy: 'Trade discount comes off first, and the tax is charged on what is left.',
      link: 'The total comes to ₹21,240 only because the tax is taken on ₹18,000, so R explains A.',
    },
    {
      answer: 'not-the-reason',
      a: 'The total of the Purchases Book is posted to Purchases A/c at the end of the period.',
      r: 'Each supplier\'s account is credited with the amount of each invoice.',
      aWhy: 'One periodic total goes to Purchases A/c.',
      rWhy: 'Each invoice is posted to the supplier\'s account as it is entered.',
      link: 'R is the other half of the posting. The total is posted once to save an entry in Purchases A/c for every invoice.',
    },
    {
      answer: 'not-the-reason',
      a: 'The Sales Return Book is written up from credit notes.',
      r: 'Sales returns are deducted from sales to find net sales.',
      aWhy: 'The credit note that the seller sends is the source of the entry.',
      rWhy: 'Net sales = Sales - Sales returns.',
      link: 'R is about what the returns do to the sales. The book is written from credit notes because they are its source document.',
    },
    {
      answer: 'not-the-reason',
      a: 'A Sales Book has CGST and SGST columns for sales within the state.',
      r: 'Output tax is a liability of the business.',
      aWhy: 'A sale within the state bears CGST and SGST.',
      rWhy: 'Output tax is owed to the government.',
      link: 'R tells what the tax is. The two columns are there because a sale within the state bears two taxes.',
    },
    {
      answer: 'a-only',
      a: 'Input CGST and Input SGST on a credit purchase are debited.',
      r: 'Output CGST and Output SGST on a credit sale are debited too.',
      aWhy: 'Input tax can be set off later, so it is an asset.',
      rWhy: 'Output tax is owed to the government, so it is credited.',
    },
    {
      answer: 'a-only',
      a: 'Freight of ₹500 charged by the supplier on the invoice is part of the taxable value.',
      r: 'GST is worked before the freight on the invoice is added.',
      aWhy: 'Freight charged on the invoice is part of the value of the supply.',
      rWhy: 'The freight goes on first, and the GST is worked last, on the total.',
    },
    {
      answer: 'r-only',
      a: 'Machinery bought on credit from Rao & Co. is entered in the Purchases Book.',
      r: 'The Journal Proper records the credit purchase of an asset.',
      aWhy: 'Machinery is not bought for resale, so it stays out of the Purchases Book.',
      rWhy: 'No other book takes it.',
    },
    {
      answer: 'r-only',
      a: 'Goods sold for ₹6,000 in cash are entered in the Sales Book.',
      r: 'A sale for cash is recorded in the Cash Book.',
      aWhy: 'The Sales Book takes credit sales of goods only.',
      rWhy: 'Money has come in, so the sale goes in the Cash Book.',
    },
  ],
});

// The books with GST added after the papers were set stand last, so no template before them moves.
const withAssertionReason: Template[] = [...templates, assertionReason, sbFmtReturnBookGst, sbFmtGstBookMixed];

export default withAssertionReason;
