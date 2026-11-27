import { buildLadder, laterLevels } from '../ladder';
import type { Card, Concept, Difficulty, JournalQuestion, McqQuestion, NumericQuestion, Question, TopicPack, TrueFalseQuestion } from '../types';

const T = 'subsidiary-books';

const concepts: Concept[] = [
  { id: 'sb-which-book', topicId: T, title: 'Which book records the transaction' },
  { id: 'sb-documents', topicId: T, title: 'Invoice, debit note and credit note' },
  { id: 'sb-trade-discount', topicId: T, title: 'Trade discount and the invoice' },
  { id: 'sb-gst', topicId: T, title: 'GST on invoices' },
  { id: 'sb-book-totals', topicId: T, title: 'Totals of a subsidiary book' },
  { id: 'sb-returns', topicId: T, title: 'Returns, net purchases and net sales' },
  { id: 'sb-posting', topicId: T, title: 'Posting to the ledger' },
  { id: 'sb-journal-proper', topicId: T, title: 'The Journal Proper' },
  { id: 'sb-sets', topicId: T, title: 'Journalising a set of transactions' },
  { id: 'sb-formats', topicId: T, title: 'Writing up a subsidiary book' },
];

const card = (
  n: number,
  conceptId: string,
  kind: Card['kind'],
  prompt: string,
  answer: string,
  explanation: string,
  example: string,
  commonMistake: string,
): Card => ({ id: `sb-card-${n}`, topicId: T, conceptId, kind, prompt, answer, explanation, example, commonMistake });

const cards: Card[] = [
  card(1, 'sb-which-book', 'rule', 'What does the Purchases Book record?',
    'Only credit purchases of goods in which the business deals (goods bought for resale), written up from the suppliers\' invoices.',
    'Each subsidiary book collects one kind of transaction, so the entries can be posted to the ledger as a periodic total. Anything that is not a credit purchase of goods for resale goes elsewhere.',
    'Goods ₹40,000 bought on credit from Rao & Co.: Purchases Book. The same goods bought for cash: Cash Book. Furniture ₹40,000 bought on credit: Journal Proper.',
    'Putting cash purchases, or assets bought on credit, in the Purchases Book.'),
  card(2, 'sb-which-book', 'rule', 'What does the Sales Book record?',
    'Only credit sales of goods in which the business deals, written up from copies of the invoices sent to customers.',
    'It mirrors the Purchases Book on the selling side. Cash sales go to the Cash Book and the sale of an old asset goes to the Journal Proper.',
    'Goods ₹25,000 sold on credit to Kiran: Sales Book. Old furniture ₹25,000 sold on credit to Kiran: Journal Proper.',
    'Entering the credit sale of a fixed asset, or a cash sale, in the Sales Book.'),
  card(3, 'sb-returns', 'rule', 'Which books record returns of goods?',
    'Goods returned to a supplier: Purchases Return Book (returns outwards). Goods returned by a customer: Sales Return Book (returns inwards).',
    'Returns are kept apart from purchases and sales so that net figures can be found. The books are written from debit notes and credit notes.',
    'Returned damaged goods ₹3,000 to Rao & Co.: Purchases Return Book. Mohan sent back goods ₹2,000: Sales Return Book.',
    'Mixing up outwards and inwards, or deducting the return inside the Purchases or Sales Book.'),
  card(4, 'sb-journal-proper', 'rule', 'What is recorded in the Journal Proper?',
    'Every transaction that no other book takes: opening entry, closing and transfer entries, adjusting entries, rectifying entries, credit purchase or sale of assets, goods taken by the owner, bad debts written off.',
    'The Journal Proper is the residual book. It has the same debit-and-credit layout as the journal, with a narration.',
    'Machinery ₹80,000 bought on credit from Rao: Machinery A/c Dr; To Rao ₹80,000. Goods ₹5,000 taken by the owner: Drawings A/c Dr; To Purchases A/c ₹5,000.',
    'Sending these entries to the Purchases Book or Cash Book because they look like a purchase or a payment.'),
  card(5, 'sb-which-book', 'shortcut', 'How do I decide quickly which book a transaction goes in?',
    'Ask three questions: Was cash or a cheque paid or received? Then Cash Book. Goods in which the business deals, on credit? Then the Purchases or Sales Book, or its return book. Anything else: Journal Proper.',
    'The test looks first at the money, then at what the item is, then at which way it moves.',
    'A dealer in fans buys 10 fans on credit to sell: Purchases Book. The same dealer buys a fan for its own office on credit: Journal Proper.',
    'Looking only at the word "bought" or "sold" and ignoring whether it is cash, credit, goods or an asset.'),
  card(6, 'sb-documents', 'rule', 'What is the difference between a debit note and a credit note?',
    'Debit note: sent by the buyer to the supplier for goods returned (supplier debited). Credit note: sent by the seller to the customer for goods taken back (customer credited).',
    'Each note tells the other party that its account has been debited (debit note) or credited (credit note) in the sender\'s books. Each is the source of a return book.',
    'Goods of ₹3,000 are returned to Rao & Co.: the buyer sends a debit note, and Rao & Co., on taking the goods back, sends a credit note. The buyer writes its Purchases Return Book from the debit note; Rao & Co. writes its Sales Return Book from the credit note.',
    'Swapping the two notes. The name of a note says what its sender has done to the other party\'s account: the buyer debits the supplier, the seller credits the customer.'),
  card(7, 'sb-documents', 'format', 'What does an invoice show?',
    'Invoice number and date; names of seller and buyer; description, quantity and rate of goods; trade discount; taxable value; GST (CGST and SGST, or IGST); invoice total; terms of payment.',
    'The invoice is the source document for the Purchases Book (buyer) and the Sales Book (seller).',
    'Invoice 214, 4 June: 50 units at ₹800 less 10% = ₹36,000; CGST 9% ₹3,240; SGST 9% ₹3,240; total ₹42,480.',
    'Forgetting that GST is charged on the price after trade discount, not on the list price.'),
  card(8, 'sb-trade-discount', 'rule', 'How is trade discount treated in the books?',
    'It is deducted from the list price on the invoice and never recorded. Only the net amount enters the book.',
    'Trade discount fixes the price, like a lower catalogue price. Cash discount, allowed for prompt payment, is different: it is recorded, in Discount Allowed or Discount Received A/c, by an entry in the Journal Proper, while the Cash Book shows only the money received or paid.',
    'List price ₹50,000 less 20% trade discount: Purchases Book shows ₹40,000, with no discount entry.',
    'Opening a Trade Discount account, or entering the list price.'),
  card(9, 'sb-trade-discount', 'formula', 'How do I find the net price and the list price?',
    'Net price = List price - trade discount. If the net price is given: List price = Net price × 100 ÷ (100 - trade discount %).',
    'The discount is a percentage of the list price, not of the net price, so working back needs a division.',
    'Net ₹36,000 after 10% trade discount: list price = 36,000 × 100 ÷ 90 = ₹40,000.',
    'Adding the discount percentage to the net price (36,000 + 10% = 39,600).'),
  card(10, 'sb-gst', 'formula', 'How is the invoice total worked out?',
    'Taxable value = list price - trade discount. GST = taxable value × rate. Invoice total = taxable value + GST. Within the state, CGST = SGST = half the GST.',
    'GST is charged on the price after trade discount, and the buyer pays the invoice total.',
    '₹60,000 net, 18% within the state: CGST ₹5,400, SGST ₹5,400, invoice total ₹70,800.',
    'Charging GST on the list price, or adding only CGST to the price.'),
  card(11, 'sb-gst', 'rule', 'Which GST columns are used, and in which accounts are they posted?',
    'Same state: CGST and SGST. Another state: IGST. On purchases they are input tax (debit). On sales they are output tax (credit).',
    'Input tax can be set off against the output tax later, so it is an asset. Output tax is owed to the government, so it is a liability.',
    'Purchase from another state: Input IGST A/c Dr. Sale within the state: Output CGST A/c and Output SGST A/c Cr.',
    'Using the output accounts for a purchase, or IGST for a sale within the state.'),
  card(12, 'sb-gst', 'shortcut', 'How do I take the GST out of an invoice total?',
    'Taxable value = invoice total × 100 ÷ (100 + GST rate). GST = invoice total - taxable value.',
    'The tax is a percentage of the price before tax, so the total is (100 + rate)% of that price.',
    'Total ₹1,18,000 with 18% GST: taxable value = 1,18,000 × 100 ÷ 118 = ₹1,00,000; GST ₹18,000.',
    'Taking 18% of the total (₹21,240) as the GST.'),
  card(13, 'sb-book-totals', 'format', 'What does the ruling of a Purchases Book look like?',
    'Date | Particulars (supplier) | Invoice No. | L.F. | Details or amount after trade discount | Input CGST | Input SGST (or Input IGST) | Total. The columns are added at the end of the period.',
    'The Sales Book has the same layout with output tax columns and customers. The total column holds what is owed to the suppliers (or by the customers).',
    'Rao & Co., invoice 214: ₹36,000 | ₹3,240 | ₹3,240 | ₹42,480.',
    'Putting the list price, not the price after trade discount, in the amount column.'),
  card(14, 'sb-posting', 'rule', 'How are the Purchases Book and the Sales Book posted to the ledger?',
    'Each invoice is posted at once to the party\'s account (supplier credited, customer debited). The period totals are posted once: Purchases A/c Dr and Input GST Dr; Sales A/c Cr and Output GST Cr.',
    'Posting totals saves a ledger entry for every invoice. The party accounts and the totals together balance.',
    'An invoice from Rao & Co.: goods ₹36,000 + GST ₹6,480 = ₹42,480. Rao & Co. is credited with ₹42,480 when the invoice is entered. At the period end the column totals are posted: Purchases A/c Dr ₹36,000 and the Input GST accounts Dr ₹6,480.',
    'Posting the grand total (with GST) to the Purchases or Sales A/c.'),
  card(15, 'sb-posting', 'rule', 'How are the return books posted?',
    'Purchases Return Book: supplier debited with each note; Purchases Return A/c credited and Input GST credited with the totals. Sales Return Book: customer credited with each note; Sales Return A/c debited and Output GST debited with the totals.',
    'A return reverses the original posting, so every side is opposite to that of the book it undoes.',
    'Debit note ₹3,540 (goods ₹3,000, GST ₹540): Rao & Co. Dr ₹3,540; Purchases Return A/c Cr ₹3,000; Input GST Cr ₹540.',
    'Posting the return on the same side as the original purchase or sale.'),
  card(16, 'sb-returns', 'formula', 'How are net purchases and net sales found?',
    'Net purchases = Purchases - Purchases returns. Net sales = Sales - Sales returns. Use figures before GST.',
    'Returns reduce the goods bought or sold, so they are deducted from the same side.',
    'Purchases ₹3,45,000; returns ₹27,500: net purchases = ₹3,17,500.',
    'Adding the returns, or deducting a return that includes GST from a figure that does not.'),
  card(17, 'sb-journal-proper', 'format', 'How are a credit purchase of an asset and an opening entry written?',
    'Asset bought on credit: Asset A/c Dr; To Supplier. Opening entry: every asset Dr; To every liability and To Capital (the balancing figure).',
    'Both go in the Journal Proper with a narration. Capital = total assets - total liabilities.',
    'Cash ₹20,000 and stock ₹60,000, owing Rao ₹15,000: Cash Dr 20,000; Stock Dr 60,000; To Rao 15,000; To Capital 65,000.',
    'Passing the asset purchase through Purchases A/c, or putting capital on the debit side.'),
  // Added after the check against the CBSE 2025-26 syllabus (docs/syllabus-coverage.md), whose note on the books asks
  // for trade discount, freight and cartage in simple GST calculations.
  card(18, 'sb-gst', 'rule', 'How are freight and cartage treated in a GST calculation?',
    'Freight or cartage that the supplier charges on the invoice is part of the value of the supply: add it to the price after trade discount, and work the GST on the total. Freight or cartage that the buyer pays separately on a bill that carries GST is recorded like a purchase with GST: Carriage Inwards (or Freight) A/c is debited with the amount before tax, and Input CGST and Input SGST (or Input IGST) with the tax.',
    'Trade discount comes off first, freight charged by the supplier goes on next, and the GST is worked last, on the taxable value.',
    'List price ₹40,000, trade discount 10%, freight on the invoice ₹1,000, GST 18% within the state: taxable value ₹36,000 + ₹1,000 = ₹37,000; CGST ₹3,330 and SGST ₹3,330; invoice total ₹43,660.',
    'Working the GST before deducting the trade discount, or leaving freight charged on the invoice out of the taxable value.'),
];

// ---------------------------------------------------------------------------------------------------------------
// Authored questions
// ---------------------------------------------------------------------------------------------------------------

const qid = (n: number): string => `sb-q-${String(n).padStart(3, '0')}`;

/** An mcq whose right option sits at a position that follows the question number, so that the answer is not always "a". */
function mcq(
  n: number,
  conceptId: string,
  difficulty: Difficulty,
  prompt: string,
  correct: string,
  wrongs: [string, string][],
  explanation: string,
  hints: string[],
): McqQuestion {
  const all = [...wrongs.map(([text, why]) => ({ text, why })), { text: correct, why: undefined as string | undefined }];
  const at = n % 4;
  const ordered = [...all.slice(0, at), all[all.length - 1], ...all.slice(at, all.length - 1)];
  const options = ordered.map((o, i) => ({ id: 'abcd'[i], text: o.text, ...(o.why === undefined ? {} : { why: o.why }) }));
  return { id: qid(n), topicId: T, conceptId, difficulty, type: 'mcq', prompt, options, correct: options.find((o) => o.text === correct)!.id, explanation, hints };
}

const tf = (n: number, conceptId: string, difficulty: Difficulty, prompt: string, correct: boolean, explanation: string, hints: string[]): TrueFalseQuestion => ({
  id: qid(n), topicId: T, conceptId, difficulty, type: 'true_false', prompt, correct, explanation, hints,
});

const AR = (a: string, r: string) => `Assertion (A): ${a} Reason (R): ${r}`;
const AR_BOTH_EXPLAINS = 'Both A and R are true, and R explains A';
const AR_BOTH = 'Both A and R are true, but R does not explain A';
const AR_A_ONLY = 'A is true, but R is false';
const AR_R_ONLY = 'A is false, but R is true';

const BOOK_HINT = ['Is any cash or cheque involved? Are they goods for resale or an asset?', 'Credit goods go to the purchases or sales books, returns to the return books, cash to the Cash Book, the rest to Journal Proper.'];
const GST_HINT = ['Same state or another state? Purchase or sale?', 'Same state: CGST and SGST. Another state: IGST. Purchases: input (debit). Sales: output (credit).'];
const POST_HINT = ['Is this an individual entry or a period total?', 'Party accounts are posted entry by entry; Purchases, Sales and their returns are posted as totals.'];

const mcqs: McqQuestion[] = [
  mcq(1, 'sb-which-book', 'easy', 'A trader buys goods for resale on credit from a supplier. In which book is it first recorded?', 'Purchases Book', [
    ['Sales Book', 'Took goods bought for goods sold.'],
    ['Cash Book', 'Treated it as a cash transaction, but nothing is paid at the time.'],
    ['Journal Proper', 'Used the residual book, but credit purchases of goods have a book of their own.'],
  ], 'Goods bought on credit for resale are recorded in the Purchases Book.', BOOK_HINT),
  mcq(2, 'sb-which-book', 'easy', 'Credit sales of goods are recorded first in the:', 'Sales Book', [
    ['Purchases Book', 'Took goods sold for goods bought.'],
    ['Sales Return Book', 'Mixed a sale with a sales return.'],
    ['Cash Book', 'Treated it as a cash sale, but no money is received at the time.'],
  ], 'Goods sold on credit are recorded first in the Sales Book, from the copy of the invoice sent to the customer. The customer\'s account is debited from each entry, and the total of the month is credited to Sales A/c. A cash sale would go to the Cash Book instead, and goods a customer sends back to the Sales Return Book.', BOOK_HINT),
  mcq(3, 'sb-which-book', 'easy', 'A customer who bought goods on credit sends some back. The entry is made in the:', 'Sales Return Book', [
    ['Purchases Return Book', 'Mixed up returns inwards and returns outwards.'],
    ['Sales Book', 'Recorded it as another sale, although the goods have come back.'],
    ['Journal Proper', 'Used the residual book, but returns by customers have a book of their own.'],
  ], 'Goods that customers send back are returns inwards, recorded in the Sales Return Book.', BOOK_HINT),
  mcq(4, 'sb-which-book', 'easy', 'A business sends damaged goods back to a supplier from whom it bought on credit. The entry is made in the:', 'Purchases Return Book', [
    ['Sales Return Book', 'Mixed up returns outwards and returns inwards.'],
    ['Purchases Book', 'Recorded the return as a fresh purchase, although the goods are going back.'],
    ['Sales Book', 'Thought goods leaving the business must be a sale.'],
  ], 'Goods returned to a supplier are returns outwards, recorded in the Purchases Return Book.', BOOK_HINT),
  mcq(5, 'sb-journal-proper', 'medium', 'Which one of these is recorded in the Journal Proper?', 'Furniture bought on credit from a dealer', [
    ['Goods bought on credit from a supplier', 'Chose a credit purchase of goods, which goes to the Purchases Book.'],
    ['Goods sold on credit to a customer', 'Chose a credit sale of goods, which goes to the Sales Book.'],
    ['Goods sold for cash', 'Chose a cash sale, which goes to the Cash Book.'],
  ], 'Furniture is an asset, not goods for resale, so its credit purchase is a Journal Proper entry.', BOOK_HINT),
  mcq(6, 'sb-which-book', 'easy', 'A cash purchase of goods is recorded in the:', 'Cash Book', [
    ['Purchases Book', 'Thought every purchase of goods goes to the Purchases Book; it takes only credit purchases.'],
    ['Journal Proper', 'Used the residual book, but anything paid in cash goes to the Cash Book.'],
    ['Purchases Return Book', 'Mixed buying goods with returning them.'],
  ], 'Everything paid or received in cash goes to the Cash Book, so a cash purchase never enters the Purchases Book.', BOOK_HINT),
  mcq(7, 'sb-documents', 'easy', 'For goods sold on credit, the seller sends the buyer a(n):', 'Invoice', [
    ['Debit note', 'A debit note is for goods returned, not goods sold.'],
    ['Credit note', 'A credit note is for goods taken back, not goods sold.'],
    ['Cash memo', 'A cash memo is for goods sold for cash.'],
  ], 'The seller sends an invoice with goods sold on credit. It shows the quantity, the list price, the trade discount, the GST and the amount the buyer owes. The seller writes its Sales Book from its copy, and the buyer writes its Purchases Book from the one it receives. A cash memo is for a cash sale; debit and credit notes are for goods returned.', ['Which document shows quantity, price, discount and GST?', 'The invoice is sent with the goods.']),
  mcq(8, 'sb-documents', 'easy', 'A buyer who returns goods to a supplier sends the supplier a:', 'Debit note', [
    ['Credit note', 'Mixed up the two notes: the credit note comes from the seller.'],
    ['Invoice', 'An invoice is for goods sold, not returned.'],
    ['Cash memo', 'A cash memo is for goods sold for cash.'],
  ], 'The buyer debits the supplier\'s account and informs the supplier by a debit note.', ['Who is sending the note: the buyer or the seller?', 'The buyer debits the supplier.']),
  mcq(9, 'sb-documents', 'easy', 'A credit note is issued by:', 'The seller, when goods are taken back from the buyer', [
    ['The buyer, when returning goods', 'Mixed up the two notes: the buyer sends a debit note.'],
    ['The seller, when goods are sold on credit', 'Took the credit note for the invoice.'],
    ['The buyer, when paying cash', 'A payment is acknowledged by a receipt, not a credit note.'],
  ], 'The seller credits the customer\'s account for goods taken back and informs the customer by a credit note.', ['Who credits whose account?', 'The seller credits the customer.']),
  mcq(10, 'sb-trade-discount', 'easy', 'Which statement about trade discount is correct?', 'It is deducted on the invoice and no account is opened for it', [
    ['The seller debits it to Discount Allowed A/c', 'Mixed it with cash discount, which is the one recorded.'],
    ['The buyer credits it to Discount Received A/c', 'Mixed it with cash discount, which is the one recorded.'],
    ['It is allowed only if the buyer pays within a stated period', 'Described cash discount, which rewards prompt payment.'],
  ], 'Trade discount fixes the net price on the invoice, so only the net amount reaches the books.', ['Is the discount part of the price or a reward for early payment?', 'Trade discount is deducted on the invoice.']),
  mcq(11, 'sb-trade-discount', 'medium', 'Goods of list price ₹50,000 are sold on credit at 20% trade discount (ignore GST). The Sales Book shows:', '₹40,000', [
    ['₹50,000', 'Entered the list price; trade discount is deducted before entry.'],
    ['₹10,000', 'Entered the discount instead of the price after discount.'],
    ['₹60,000', 'Added the trade discount to the list price instead of deducting it.'],
  ], 'Trade discount = 20% of ₹50,000 = ₹10,000. Net price = ₹50,000 - ₹10,000 = ₹40,000. The Sales Book shows ₹40,000, the amount the customer owes; trade discount is taken off on the invoice and never appears in the books, so there is no Discount A/c for it.', ['Work out the discount first, then deduct it.', 'Net = list price - trade discount.']),
  mcq(12, 'sb-gst', 'easy', 'Goods are sold to a customer in another state. The tax charged is:', 'IGST', [
    ['CGST and SGST', 'Used the tax for a sale within the state.'],
    ['CGST only', 'Charged only the central part; between states the whole tax is IGST.'],
    ['SGST only', 'Charged only the state part; between states the whole tax is IGST.'],
  ], 'A sale between states (inter-state) carries IGST at the full rate of the goods: at 18%, IGST is 18% of the taxable value. CGST and SGST, each at half the rate, are charged only when the seller and the buyer are in the same state. The seller credits Output IGST A/c with the tax.', GST_HINT),
  mcq(13, 'sb-gst', 'easy', 'In the Purchases Book, GST paid on goods bought within the state is posted to the:', 'Debit of Input CGST A/c and Input SGST A/c', [
    ['Credit of Output CGST A/c and Output SGST A/c', 'Used the output accounts, which are for tax collected on sales.'],
    ['Debit of Purchases A/c together with the price', 'Added the tax to the cost of goods instead of recording it as input tax.'],
    ['Debit of Input IGST A/c', 'Used IGST, which applies to purchases from other states.'],
  ], 'Tax paid on purchases is input tax, an asset, so it is debited; within a state it is split into CGST and SGST.', GST_HINT),
  mcq(14, 'sb-posting', 'easy', 'At the end of the month, the total of the Sales Book (before GST) is posted to the:', 'Credit side of Sales A/c', [
    ['Debit side of Sales A/c', 'Posted it to the wrong side: Sales is an income, increased by a credit.'],
    ['Credit side of Sales Return A/c', 'Mixed the Sales Book with the Sales Return Book.'],
    ['Debit side of Purchases A/c', 'Took goods sold for goods bought.'],
  ], 'Sales are an income and are increased by a credit, so the month\'s total of the Sales Book (the taxable values, before GST) is posted to the credit side of Sales A/c: "By Sundries as per Sales Book". The GST columns go to the credit of the Output tax accounts, and each customer\'s account is debited entry by entry with the invoice total.', POST_HINT),
  mcq(15, 'sb-posting', 'medium', 'The monthly total of the Purchases Return Book is posted to the:', 'Credit side of Purchases Return A/c', [
    ['Debit side of Purchases Return A/c', 'Posted it to the wrong side: Purchases Return reduces purchases, so it is credited.'],
    ['Debit side of Purchases A/c', 'Posted to Purchases A/c, forgetting that returns have an account of their own.'],
    ['Credit side of Sales Return A/c', 'Mixed purchases returns with sales returns.'],
  ], 'Purchases Return A/c increases by a credit, and the suppliers are debited individually.', POST_HINT),
  mcq(16, 'sb-journal-proper', 'easy', 'The opening entry at the start of a new year is passed in the:', 'Journal Proper', [
    ['Cash Book', 'No cash is received or paid when balances are brought forward.'],
    ['Purchases Book', 'An opening entry is not a purchase.'],
    ['Sales Book', 'An opening entry is not a sale.'],
  ], 'It is an entry no other book takes, so it is made in the Journal Proper.', BOOK_HINT),
  mcq(17, 'sb-returns', 'easy', 'Net sales are:', 'Sales less sales returns', [
    ['Sales plus sales returns', 'Added the returns instead of deducting them.'],
    ['Sales less purchases', 'Took net sales as a profit-type figure.'],
    ['Sales less purchases returns', 'Deducted the returns of the other side.'],
  ], 'Goods that customers send back cancel part of the sales made, so net sales = sales - sales returns (returns inwards). With a Sales Book total of ₹2,00,000 and a Sales Return Book total of ₹15,000, net sales are ₹1,85,000. Purchases returns belong with purchases, not with sales.', ['Which returns belong with sales?', 'Net sales = sales - sales returns.']),
  mcq(18, 'sb-journal-proper', 'medium', 'Which one of these is NOT passed in the Journal Proper?', 'A credit sale of goods to a customer', [
    ['A rectifying entry', 'Chose an entry that does go through the Journal Proper.'],
    ['An adjusting entry for outstanding rent', 'Chose an entry that does go through the Journal Proper.'],
    ['Purchase of machinery on credit', 'Chose an entry that does go through the Journal Proper.'],
  ], 'A credit sale of goods is recorded in the Sales Book. The other three have no book of their own.', BOOK_HINT),
  mcq(19, 'sb-which-book', 'medium', AR('Goods returned by a customer are not entered in the Sales Book.', 'Returns of goods sold have a book of their own, the Sales Return Book.'), AR_BOTH_EXPLAINS, [
    [AR_BOTH, 'Saw both statements as true but missed that the second one is the very reason for the first.'],
    [AR_A_ONLY, 'Doubted the reason, but the Sales Return Book exists for this purpose.'],
    [AR_R_ONLY, 'Doubted the assertion, but a return is not a sale.'],
  ], 'Both are true: the Sales Book records sales, and returns go to their own book, which is why they are not in the Sales Book.', BOOK_HINT),
  mcq(20, 'sb-which-book', 'medium', AR('Furniture bought on credit is not entered in the Purchases Book.', 'The Purchases Book records only credit purchases of goods in which the business deals.'), AR_BOTH_EXPLAINS, [
    [AR_BOTH, 'Saw both statements as true but missed that the second one is the very reason for the first.'],
    [AR_A_ONLY, 'Doubted the reason, which is the definition of the Purchases Book.'],
    [AR_R_ONLY, 'Doubted the assertion, but furniture bought on credit is an asset and goes to the Journal Proper.'],
  ], 'Furniture is an asset, not goods for resale, so it is outside the Purchases Book.', BOOK_HINT),
  mcq(21, 'sb-trade-discount', 'medium', AR('Trade discount is debited to the Discount Allowed account of the seller.', 'Trade discount is deducted on the invoice itself.'), AR_R_ONLY, [
    [AR_BOTH_EXPLAINS, 'Treated trade discount as a recorded item; it is deducted on the invoice and never recorded.'],
    [AR_BOTH, 'Treated trade discount as a recorded item; it is deducted on the invoice and never recorded.'],
    [AR_A_ONLY, 'Mixed trade discount with cash discount, and doubted the true reason.'],
  ], 'The assertion is false: only cash discount is recorded as Discount Allowed. The reason is true.', ['Which discount is recorded in the books?', 'Trade discount is never recorded.']),
  mcq(22, 'sb-posting', 'easy', 'When one invoice of the Sales Book is posted to the ledger, which account is debited?', 'The customer\'s account', [
    ['Sales A/c', 'Posted the sale to Sales A/c, but that is done once for the whole period, and on the credit side.'],
    ['Cash A/c', 'Nothing is received at the time of a credit sale.'],
    ['Sales Return A/c', 'Mixed the Sales Book with the Sales Return Book.'],
  ], 'The customer owes the business, so the customer\'s account is debited.', POST_HINT),
  mcq(23, 'sb-documents', 'easy', 'The Sales Return Book is written up from the:', 'Credit notes issued', [
    ['Debit notes issued', 'Mixed up the two notes: debit notes feed the Purchases Return Book.'],
    ['Invoices issued', 'Invoices are for goods sold, and feed the Sales Book.'],
    ['Cash memos issued', 'Cash memos support cash sales, which go to the Cash Book.'],
  ], 'The seller issues a credit note for goods taken back, and records the return from it.', ['Which note does the seller issue?', 'The seller issues credit notes.']),
  mcq(24, 'sb-gst', 'easy', 'Goods are sold within the same state and GST is 18%. The invoice shows:', 'CGST 9% and SGST 9%', [
    ['CGST 18% and SGST 18%', 'Charged the full rate twice.'],
    ['IGST 9% and CGST 9%', 'Mixed the taxes of a sale within the state and of a sale between states.'],
    ['IGST 18%', 'Used the tax for a sale between states.'],
  ], 'Within the state, the rate is shared equally between CGST and SGST.', GST_HINT),
  mcq(25, 'sb-returns', 'medium', 'Goods bought from a supplier are returned. The input tax originally claimed on them is:', 'Reversed by crediting the Input GST accounts', [
    ['Left unchanged, because tax is never reversed', 'Forgot that tax on goods returned is no longer claimable.'],
    ['Debited again to the Input GST accounts', 'Posted it on the same side as the original purchase instead of reversing it.'],
    ['Credited to the Output GST accounts', 'Used the output tax account, which is for tax on sales.'],
  ], 'A return reverses the purchase: the input tax debited when the goods were bought can no longer be claimed on them, so the Input GST accounts are credited.', GST_HINT),
];

const tfs: TrueFalseQuestion[] = [
  tf(26, 'sb-which-book', 'easy', 'A cash purchase of goods is entered in the Purchases Book.', false, 'False. The Purchases Book records only credit purchases of goods; a cash purchase goes to the Cash Book.', BOOK_HINT),
  tf(27, 'sb-trade-discount', 'easy', 'Trade discount is shown in a separate account in the ledger.', false, 'False. Trade discount is deducted on the invoice, so only the net amount is recorded.', ['Is trade discount recorded?', 'Only cash discount is recorded.']),
  tf(28, 'sb-posting', 'easy', 'The total of the Sales Book is posted once a period to the credit side of Sales A/c.', true, 'True. Sales are an income, and the period total is posted in one entry.', POST_HINT),
  tf(29, 'sb-documents', 'easy', 'A debit note is sent by a buyer who returns goods to a supplier.', true, 'True. The buyer debits the supplier and informs the supplier by a debit note.', ['Who sends it?', 'The buyer debits the supplier.']),
  tf(30, 'sb-which-book', 'medium', 'The credit sale of an old piece of furniture belonging to the business is entered in the Sales Book.', false, 'False. Furniture is an asset, not goods in which the business deals: the entry goes to the Journal Proper.', BOOK_HINT),
  tf(31, 'sb-returns', 'easy', 'Net purchases are purchases less purchases returns.', true, 'True. Goods sent back to suppliers (returns outwards) cancel part of the purchases, so net purchases = purchases - purchases returns. With a Purchases Book total of ₹1,50,000 and a Purchases Return Book total of ₹9,000, net purchases are ₹1,41,000.', ['Which returns belong with purchases?', 'Net purchases = purchases - purchases returns.']),
  tf(32, 'sb-gst', 'easy', 'IGST is charged on a sale to a customer in the same state.', false, 'False. A sale within the state carries CGST and SGST; IGST is for sales between states.', GST_HINT),
  tf(33, 'sb-journal-proper', 'medium', 'The Journal Proper records transactions that no other subsidiary book takes.', true, 'True. Opening, closing, adjusting and rectifying entries, and credit purchases or sales of assets, are examples.', BOOK_HINT),
  tf(34, 'sb-posting', 'medium', 'Each invoice of the Purchases Book is posted to the credit of the supplier\'s account.', true, 'True. The business owes the supplier, so the supplier\'s account is credited.', POST_HINT),
  tf(35, 'sb-documents', 'medium', 'A credit note issued to a customer reduces the amount the customer owes.', true, 'True. The customer\'s account is credited when goods are taken back.', ['Whose account is credited?', 'Crediting a debtor reduces what the debtor owes.']),
];

const numeric = (
  n: number,
  conceptId: string,
  difficulty: Difficulty,
  prompt: string,
  answer: number,
  commonErrors: NumericQuestion['commonErrors'],
  working: string[],
  hints: string[],
): NumericQuestion => ({
  id: qid(n), topicId: T, conceptId, difficulty, type: 'numeric', unit: 'rupees', prompt, answer, commonErrors, working, explanation: working.join(' '), hints,
});
const R = (rupees: number): number => rupees * 100;

const numerics: NumericQuestion[] = [
  numeric(36, 'sb-gst', 'medium',
    'A supplier in the same state invoices goods of list price ₹80,000 less 25% trade discount, with GST at 18% (CGST 9% and SGST 9%) charged on the price after trade discount. What is the invoice total?',
    R(70800),
    [
      { value: R(94400), why: 'Ignored the trade discount and charged GST on the full list price.' },
      { value: R(60000), why: 'Left GST out of the invoice total.' },
      { value: R(65400), why: 'Added only CGST to the price after discount.' },
    ],
    ['Trade discount = 25% of ₹80,000 = ₹20,000; price after discount = ₹60,000.', 'GST = 18% of ₹60,000 = ₹10,800 (CGST ₹5,400 + SGST ₹5,400).', 'Invoice total = ₹60,000 + ₹10,800 = ₹70,800.'],
    ['Deduct the trade discount first.', 'GST is charged on the price after trade discount.']),
  numeric(37, 'sb-returns', 'easy',
    'The Purchases Book of a firm shows ₹3,45,000 for the year and the Purchases Return Book shows ₹27,500. What are the net purchases?',
    R(317500),
    [
      { value: R(372500), why: 'Added the returns instead of deducting them.' },
      { value: R(345000), why: 'Gave the purchases before returns.' },
    ],
    ['Net purchases = purchases - purchases returns.', '₹3,45,000 - ₹27,500 = ₹3,17,500.'],
    ['Which returns belong with purchases?', 'Deduct them.']),
];

const direct = (n: number, conceptId: string, difficulty: Difficulty, prompt: string, expected: JournalQuestion['expected'], accountChoices: string[], explanation: string, hints: string[]): JournalQuestion => ({
  id: qid(n), topicId: T, conceptId, difficulty, type: 'journal_entry', prompt, expected, accountChoices: [...accountChoices].sort(), explanation, hints,
});

const journals: JournalQuestion[] = [
  direct(38, 'sb-journal-proper', 'medium',
    'Machinery costing ₹1,20,000 was bought on credit from Rao & Co. for use in the factory. Pass the entry made in the Journal Proper. (Ignore GST.)',
    [{ accountId: 'machinery', side: 'Dr', amount: R(120000) }, { accountId: 'creditor:Rao & Co.', side: 'Cr', amount: R(120000) }],
    ['machinery', 'creditor:Rao & Co.', 'purchases', 'cash', 'bank', 'furniture'],
    'Machinery is an asset, not goods for resale, so the entry is in the Journal Proper. Machinery A/c is debited as the asset comes in, and Rao & Co. is credited because the business owes it the price.',
    ['Is this goods for resale or an asset?', 'The asset that comes in is debited; the supplier who is owed is credited.']),
  direct(39, 'sb-journal-proper', 'easy',
    'The owner took goods costing ₹6,000 from the shop for personal use. Pass the entry made in the Journal Proper, recording the goods at cost. (Ignore GST.)',
    [{ accountId: 'drawings', side: 'Dr', amount: R(6000) }, { accountId: 'purchases', side: 'Cr', amount: R(6000) }],
    ['drawings', 'purchases', 'sales', 'cash', 'stock', 'capital'],
    'Goods taken by the owner are drawings, which reduce capital, so Drawings A/c is debited. The goods leave the purchases of the year, so Purchases A/c is credited.',
    ['Is this a sale? Which account shows what the owner takes out?', 'Debit Drawings; credit Purchases.']),
  direct(40, 'sb-returns', 'complex',
    'Goods worth ₹20,000 (after trade discount) were sold to Mohan Traders in another state on credit, and Mohan Traders returned all of them. The sale carried IGST at 18%, and the seller issued a credit note for the goods and the tax. Pass the entry for the return in the books of the seller.',
    [
      { accountId: 'salesReturn', side: 'Dr', amount: R(20000) },
      { accountId: 'outputIGST', side: 'Dr', amount: R(3600) },
      { accountId: 'debtor:Mohan Traders', side: 'Cr', amount: R(23600) },
    ],
    ['salesReturn', 'outputIGST', 'debtor:Mohan Traders', 'sales', 'inputIGST', 'cash'],
    'The return reverses the sale. Sales Return A/c is debited with ₹20,000 and Output IGST (18% of ₹20,000 = ₹3,600) is debited, since the tax is no longer owed. Mohan Traders is credited with ₹23,600.',
    ['A return undoes the sale. What was debited and credited then?', 'Reverse each side, using Sales Return A/c for the goods.']),
];

const questions: Question[] = [...mcqs, ...tfs, ...numerics, ...journals].sort((a, b) => a.id.localeCompare(b.id));

// ---------------------------------------------------------------------------------------------------------------
// Ladder
// ---------------------------------------------------------------------------------------------------------------

const EASY_BOOKS = ['sb-which-book', 'sb-which-document', 'sb-doc-to-book', 'sb-total-posting', 'sb-party-posting', 'sb-asset-credit-purchase', 'sb-asset-credit-sale'];
const EASY_VALUES = ['sb-net-invoice', 'sb-trade-or-cash-discount', 'sb-gst-intra', 'sb-gst-inter', 'sb-gst-rate', 'sb-which-gst-columns', 'sb-book-total-simple', 'sb-net-figure'];
const GUIDED = ['sb-net-invoice', 'sb-gst-intra', 'sb-gst-inter'];
const MED_VALUES = ['sb-invoice-total', 'sb-debit-note-amount', 'sb-return-at-net', 'sb-gst-on-returns'];
const MED_TOTALS = ['sb-purchases-book-gst', 'sb-sales-book-gst', 'sb-purchases-book-sort', 'sb-sales-book-sort', 'sb-creditor-balance', 'sb-debtor-balance'];
const MED_ENTRIES = ['sb-opening-entry', 'sb-goods-not-sold', 'sb-debit-note-entry', 'sb-credit-note-entry', 'sb-adjusting-entry', 'sb-not-in-purchases-book', 'sb-not-in-sales-book'];
const COMPLEX = ['sb-purpose-matters', 'sb-mixed-state-total', 'sb-reverse-gst', 'sb-net-sales-gst', 'sb-supplier-due', 'sb-net-gst-payable', 'sb-credit-note-gst', 'sb-count-entries'];

const levels = buildLadder(T, {
  concept: {
    title: 'What Are Subsidiary Books?',
    description: 'See why a business keeps one book for each kind of transaction, and which transaction goes where.',
    lesson: [
      {
        type: 'text',
        heading: 'One book for each kind of transaction',
        body: 'A busy shop buys and sells goods on credit dozens of times a day. Writing each in the journal and then in the ledger would take far too long. So the business keeps separate books for the commonest transactions, writes each entry once, and posts only the total to the ledger each period. These are the subsidiary books.',
      },
      {
        type: 'text',
        heading: 'Which book takes what',
        body: 'Credit purchases of goods for resale go in the Purchases Book, and credit sales in the Sales Book. Goods sent back to a supplier go in the Purchases Return Book, and goods a customer sends back in the Sales Return Book. Everything paid or received in cash or by cheque goes in the Cash Book. What is left over, such as an asset bought on credit, goes in the Journal Proper.',
      },
      {
        type: 'text',
        heading: 'From the invoice to the book',
        body: 'Each book is written from a document. The invoice is the source of the Purchases Book and the Sales Book; debit notes and credit notes are the source of the return books. On an invoice, trade discount is taken off the list price first, and GST is charged on what remains: CGST and SGST within the state, IGST between states.',
      },
      {
        type: 'example',
        title: 'Furniture of ₹30,000 bought on credit from Rao & Co.',
        lines: [
          { accountId: 'furniture', side: 'Dr', amount: 3000000 },
          { accountId: 'creditor:Rao & Co.', side: 'Cr', amount: 3000000 },
        ],
        note: 'Furniture is an asset, not goods for resale, so this is not a purchase for the Purchases Book. The entry is made in the Journal Proper.',
      },
      {
        type: 'working',
        title: 'Worked example 1: an invoice within the state',
        lines: [
          'Raj Provisions of Jaipur buys packaged tea on credit from Gupta Agencies, also of Jaipur: list price ₹40,000, trade discount 10%, GST 5%.',
          'Trade discount = 10% of ₹40,000 = ₹4,000. Price after discount (the taxable value) = ₹36,000.',
          'Both are in Rajasthan, so the 5% is split: CGST 2.5% = ₹900 and SGST 2.5% = ₹900.',
          'Invoice total = ₹36,000 + ₹900 + ₹900 = ₹37,800.',
          'Purchases Book: Gupta Agencies, taxable value ₹36,000, CGST ₹900, SGST ₹900, total ₹37,800. Gupta Agencies is credited with ₹37,800.',
        ],
        note: 'Watch out: GST is charged on the price after trade discount, never on the list price, and the books never show the ₹4,000 of trade discount.',
      },
      {
        type: 'working',
        title: 'Worked example 2: an invoice across states, with freight',
        lines: [
          'Singh Hardware of Ludhiana buys power tools on credit from Patel & Sons of Ahmedabad: list price ₹80,000, trade discount 15%, freight ₹2,000 charged on the same invoice, GST 18%.',
          'Trade discount = 15% of ₹80,000 = ₹12,000. Price after discount = ₹68,000.',
          'Freight charged by the supplier on the invoice is part of the supply: taxable value = ₹68,000 + ₹2,000 = ₹70,000.',
          'Punjab and Gujarat are different states, so the whole 18% is IGST: 18% of ₹70,000 = ₹12,600.',
          'Invoice total = ₹70,000 + ₹12,600 = ₹82,600, the amount credited to Patel & Sons.',
        ],
        note: 'Watch out: trade discount off, freight on, GST last. Freight added after the tax, or IGST split into halves, are the two usual slips.',
      },
      {
        type: 'table',
        title: 'Worked example 3: the Purchases Book of New India Textiles, April (GST 5%, suppliers in the same state)',
        rows: [
          { label: '5 April, Rao & Co.: list ₹50,000 less 10% (taxable ₹45,000)' },
          { label: 'CGST ₹1,125 + SGST ₹1,125: invoice total', amount: '₹47,250' },
          { label: '12 April, Kiran Stores: list ₹30,000, no discount (taxable ₹30,000)' },
          { label: 'CGST ₹750 + SGST ₹750: invoice total', amount: '₹31,500' },
          { label: '26 April, Verma Enterprises: list ₹40,000 less 20% (taxable ₹32,000)' },
          { label: 'CGST ₹800 + SGST ₹800: invoice total', amount: '₹33,600' },
          { label: 'Taxable value column', amount: '₹1,07,000' },
          { label: 'CGST column', amount: '₹2,675' },
          { label: 'SGST column', amount: '₹2,675' },
          { label: 'Total column (₹1,07,000 + ₹2,675 + ₹2,675)', amount: '₹1,12,350', total: true },
        ],
        note: 'Posting: each supplier is credited with its own invoice total on its date; at the month end Purchases A/c is debited with ₹1,07,000, Input CGST A/c with ₹2,675 and Input SGST A/c with ₹2,675. The debits (₹1,12,350) equal the credits to the three suppliers. Watch out: Purchases A/c gets the taxable value only, never the total with GST.',
      },
      {
        type: 'working',
        title: 'Worked example 4: a return with GST, and the net figure',
        lines: [
          'On 28 April New India Textiles sends back to Kiran Stores fabric invoiced at ₹6,000 (taxable value), with a debit note.',
          'The goods go back at the price charged: ₹6,000, plus CGST 2.5% ₹150 and SGST 2.5% ₹150. Debit note = ₹6,300.',
          'Purchases Return Book: Kiran Stores ₹6,000, CGST ₹150, SGST ₹150, total ₹6,300. Kiran Stores is debited with ₹6,300.',
          'Month-end totals: Purchases Return A/c is credited with ₹6,000; Input CGST A/c and Input SGST A/c are credited with ₹150 each.',
          'Net purchases for April = ₹1,07,000 - ₹6,000 = ₹1,01,000.',
        ],
        note: 'Watch out: a return reverses the tax as well as the goods: a purchase return credits the Input tax accounts, it does not add to them.',
      },
      { type: 'check', questionId: qid(1) },
      { type: 'check', questionId: qid(5) },
    ],
  },
  cards: {
    title: 'Books, Documents and Totals',
    description: 'Recall what each book records, the notes, trade discount, GST and how totals are posted.',
    cardIds: cards.map((c) => c.id),
  },
  recognition: [
    {
      title: 'Books, Documents and Discounts',
      description: 'Pick the book, the document and the treatment, before any figures.',
      questionIds: [1, 2, 3, 4, 6, 7, 8, 9, 10, 12, 14, 16].map(qid),
    },
  ],
  practice: [
    { title: 'Which Book and Which Document?', description: 'Choose the book, the document and the posting for each transaction.', templateIds: EASY_BOOKS, count: 8 },
    { title: 'Invoices, GST and Totals', description: 'Trade discount, CGST, SGST and IGST, totals of a book and net figures.', templateIds: EASY_VALUES, count: 8 },
    { title: 'Invoice Values (Guided)', description: 'Net price, GST and invoice total with the method laid out.', templateIds: GUIDED, count: 6, guided: true },
    { title: 'Invoice Values and Returns', description: 'Invoice totals, notes for returned goods and the tax on returns.', templateIds: MED_VALUES, count: 8 },
    { title: 'Book Totals and Balances', description: 'Totals of the Purchases and Sales Books and the balances they leave in party accounts.', templateIds: MED_TOTALS, count: 8 },
    { title: 'Journal Proper and Exceptions', description: 'Entries the other books cannot take, and what does not belong in a book.', templateIds: MED_ENTRIES, count: 8 },
    { title: 'Complex Subsidiary Books', description: 'Several steps with trade discount, GST, returns and posting.', templateIds: COMPLEX, count: 8 },
  ],
  mixed: { title: 'Mixed Practice', description: 'Everything in this topic, shuffled the way an exam serves it.', count: 12 },
  challenge: { title: 'Challenge: Subsidiary Books Mastery', description: 'The hardest questions of the topic, timed.', count: 8, timerSecondsPerQuestion: 150 },
  sets: [
    {
      title: 'Journalise: the Journal Proper of a Month',
      description: 'Four or five dated entries that no other book takes: an opening entry, assets on credit, goods that leave without a sale, year-end adjustments.',
      templateIds: ['sb-set-journal-proper', 'sb-set-journal-or-book'],
      count: 3,
    },
    {
      title: 'Journalise: Invoices, Debit Notes and Credit Notes with GST',
      description: 'Six to eight dated entries: credit purchases and sales, goods returned and allowances, with the GST on each.',
      templateIds: ['sb-set-notes-gst'],
      count: 2,
    },
  ],
  formats: [
    {
      title: 'Write up a Return Book',
      description: 'The Purchases Return Book from debit notes or the Sales Return Book from credit notes: each note against its party, among transactions that belong elsewhere.',
      templateIds: ['sb-fmt-return-book'],
      count: 2,
    },
    {
      title: 'Write up the Purchases Book and the Sales Book',
      description: 'A month of transactions: enter only the credit invoices for goods, each at its amount after trade discount, and leave out cash dealings, assets and returns.',
      templateIds: ['sb-fmt-purchases-book', 'sb-fmt-sales-book'],
      count: 2,
    },
    {
      title: 'Write up a Book with GST',
      description: 'The Purchases Book or the Sales Book with all its columns: the taxable value after trade discount, then CGST and SGST within the state or IGST across states, and the Total of each invoice.',
      templateIds: ['sb-fmt-gst-book'],
      count: 2,
    },
    // Added after the papers were set: new ids (formats-4 and formats-5), so no level a learner has passed moves.
    {
      title: 'Write up a Return Book with GST',
      description: 'The Purchases Return Book from debit notes or the Sales Return Book from credit notes, with the taxable value, the GST it reverses and the total of each note.',
      templateIds: ['sb-fmt-return-book-gst'],
      count: 2,
    },
    {
      title: 'A Book with CGST, SGST and IGST Together',
      description: 'One month of credit invoices, some within the state and some across states: the taxable value of each, and CGST and SGST or IGST in their own columns.',
      templateIds: ['sb-fmt-gst-book-mixed'],
      count: 2,
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Freight and cartage in GST sums, added after the check against the CBSE 2025-26 syllabus: a level of its own after
// every other level, with an id of its own, so no level a learner has passed moves.
// ---------------------------------------------------------------------------------------------------------------

const FREIGHT_HINT = ['What does the supplier charge on the invoice?', 'Trade discount off, freight on, GST last.'];
const freightQuestions: Question[] = [
  tf(41, 'sb-gst', 'easy', 'Freight that the supplier charges on the invoice is left out of the value on which GST is worked.', false,
    'False. Freight charged by the supplier on the invoice is part of the value of the supply: it is added to the price after trade discount, and GST is worked on the total.', FREIGHT_HINT),
  mcq(42, 'sb-gst', 'medium', AR('GST on an invoice is worked after the trade discount has been deducted and the freight added.', 'Trade discount is not shown in the books of either party.'),
    AR_BOTH, [
      [AR_BOTH_EXPLAINS, 'Both are true, but R speaks of the books, not of how the taxable value is worked, so it does not explain A.'],
      [AR_A_ONLY, 'R is true: the books show the price after trade discount only.'],
      [AR_R_ONLY, 'A is true: the taxable value is the price after discount plus the freight charged on the invoice.'],
    ], 'Both statements are true. A follows from what the taxable value is (the price after discount plus the freight charged); R is about recording, and does not explain A.', FREIGHT_HINT),
  numeric(43, 'sb-gst', 'medium',
    'Sharma Bros, of the same state, supply goods to a retailer at a list price of ₹60,000 less 10% trade discount, and charge freight of ₹2,000 on the invoice. GST is 18% (CGST 9% and SGST 9%). What is the invoice total?',
    R(66080),
    [
      { value: R(65720), why: 'Added the freight after working the GST, so no tax was charged on it.' },
      { value: R(63720), why: 'Left the freight out of the invoice.' },
      { value: R(73160), why: 'Ignored the trade discount and worked the GST on the list price plus freight.' },
    ],
    ['Price after discount = ₹60,000 - ₹6,000 = ₹54,000.', 'Taxable value = ₹54,000 + ₹2,000 freight = ₹56,000.', 'CGST 9% = ₹5,040; SGST 9% = ₹5,040.', 'Invoice total = ₹56,000 + ₹10,080 = ₹66,080.'],
    FREIGHT_HINT),
  mcq(44, 'sb-gst', 'medium', 'Kavya Traders buys goods from a supplier in another state. The invoice shows the price after trade discount ₹30,000 and freight ₹1,000, with IGST at 5%. Kavya Traders also pays a local cart-puller ₹400 in cash to bring the goods to the shop. What is the IGST on the invoice?',
    '₹1,550', [
      ['₹1,500', 'Left the freight charged on the invoice out of the taxable value.'],
      ['₹1,570', 'Added the cartage paid to the cart-puller, which the supplier does not charge, to the supplier\'s taxable value.'],
      ['₹775', 'Halved the tax as for a supply within the state; across states the whole of it is IGST.'],
    ], 'Taxable value = ₹30,000 + ₹1,000 = ₹31,000; IGST 5% = ₹1,550. The ₹400 paid to the cart-puller is recorded separately in Carriage Inwards A/c.', FREIGHT_HINT),
];

const pack: TopicPack = {
  topicId: T,
  concepts,
  cards,
  levels: [
    ...levels,
    ...laterLevels(T, levels, [
      {
        name: 'freight-gst',
        type: 'medium_practice',
        title: 'Freight and Cartage in GST Sums',
        description: 'Freight on the invoice added to the price after trade discount, GST at 5% or 18% on the total, the invoice total and the entry.',
        questionIds: freightQuestions.map((q) => q.id),
        generate: { templateIds: ['sb-freight-facts', 'sb-freight-taxable', 'sb-freight-gst', 'sb-freight-invoice-total', 'sb-freight-entry'], count: 8 },
      },
      {
        name: 'assertion-reason',
        type: 'medium_practice',
        title: 'Assertion and Reason',
        description: 'Two statements on this topic: decide whether each is true, and whether the Reason explains the Assertion.',
        generate: { templateIds: ['sb-assertion-reason'], count: 8 },
      },
    ]),
  ],
  questions: [...questions, ...freightQuestions],
};

export default pack;
