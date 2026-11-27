import { BEYOND_INTEREST_ON_DRAWINGS, beyondQuestion } from '../beyondSyllabus';
import { laterLevels, setLevels } from '../ladder';
import type { Card, Concept, JournalQuestion, Level, McqQuestion, NumericQuestion, Question, TopicPack, TrueFalseQuestion } from '../types';

const T = 'journal-entries';

const concepts: Concept[] = [
  { id: 'je-rules', topicId: T, title: 'Rules of debit and credit' },
  { id: 'je-capital-drawings', topicId: T, title: 'Capital and drawings' },
  { id: 'je-goods', topicId: T, title: 'Cash purchases and sales of goods' },
  { id: 'je-assets-expenses', topicId: T, title: 'Assets, expenses and incomes' },
  { id: 'je-credit', topicId: T, title: 'Credit purchases and sales' },
  { id: 'je-settlement', topicId: T, title: 'Settlements and cash discount' },
  { id: 'je-bank', topicId: T, title: 'Cash and bank transfers' },
  { id: 'je-returns', topicId: T, title: 'Returns of goods' },
  { id: 'je-gst', topicId: T, title: 'GST and trade discount' },
  { id: 'je-adjustments', topicId: T, title: 'Adjusting entries, bad debts, depreciation and interest' },
  { id: 'je-goods-otherwise', topicId: T, title: 'Goods used otherwise than for sale' },
  { id: 'je-losses-claims', topicId: T, title: 'Losses of goods and insurance claims' },
  { id: 'je-assets', topicId: T, title: 'Fixed assets bought and sold' },
  { id: 'je-banking', topicId: T, title: 'Bank charges, interest and cheques' },
  { id: 'je-compound', topicId: T, title: 'Opening, advances and compound entries' },
  { id: 'je-expenses-incomes', topicId: T, title: 'Salary, rent, commission and carriage' },
  { id: 'je-sets', topicId: T, title: 'Journalising a set of transactions' },
  // Added after the check against the CBSE 2025-26 syllabus, which opens the unit with source documents and vouchers.
  { id: 'je-vouchers', topicId: T, title: 'Source documents and vouchers' },
  // Added in the quality pass after the audit of Class 11.
  { id: 'je-gst-settlement', topicId: T, title: 'GST set-off and payment' },
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
): Card => ({ id: `je-card-${n}`, topicId: T, conceptId, kind, prompt, answer, explanation, example, commonMistake });

const cards: Card[] = [
  card(1, 'je-rules', 'rule', 'On which side does an asset increase?', 'Debit. A decrease in an asset is credited.',
    'Assets are what the business owns. More of an asset is a debit; less of it is a credit.',
    'Bought furniture ₹5,000 for cash: Furniture A/c Dr ₹5,000; To Cash A/c ₹5,000.',
    'Crediting the asset bought because "money went out". The money is Cash; the furniture came in.'),
  card(2, 'je-rules', 'rule', 'On which side does a liability increase?', 'Credit. A decrease in a liability is debited.',
    'Liabilities are what the business owes to outsiders. Owing more is a credit; paying it off is a debit.',
    'Bought goods ₹8,000 on credit from Rao: Purchases A/c Dr; To Rao ₹8,000.',
    'Debiting the supplier at the time of a credit purchase.'),
  card(3, 'je-capital-drawings', 'rule', 'How is capital brought in by the owner recorded?', 'Cash or Bank A/c Dr; To Capital A/c.',
    'The business and its owner are separate. Capital is what the business owes the owner, so it increases on the credit side.',
    'Started business with cash ₹1,00,000: Cash A/c Dr ₹1,00,000; To Capital A/c ₹1,00,000.',
    'Treating capital as an asset of the business.'),
  card(4, 'je-capital-drawings', 'rule', 'How are drawings recorded?', 'Drawings A/c Dr; To Cash or Bank A/c.',
    'Drawings reduce capital, so the Drawings account is debited.',
    'Owner took ₹2,000 cash for personal use: Drawings A/c Dr ₹2,000; To Cash A/c ₹2,000.',
    'Debiting an expense account for the owner\'s personal spending.'),
  card(5, 'je-rules', 'rule', 'On which side are expenses and incomes recorded?', 'Expenses and losses are debited. Incomes and gains are credited.',
    'An expense reduces capital and an income increases it, so they sit on opposite sides.',
    'Paid rent ₹3,000: Rent A/c Dr; To Cash A/c. Received commission ₹500: Cash A/c Dr; To Commission Received A/c.',
    'Crediting an expense because cash was paid.'),
  card(6, 'je-rules', 'format', 'What is the format of a journal entry?',
    'Date | Particulars | L.F. | Debit ₹ | Credit ₹. The debited account comes first with "Dr"; the credited account follows on the next line starting with "To"; a narration in brackets ends the entry.',
    'The fixed layout lets anyone read which account was debited, which was credited and why.',
    'Furniture A/c Dr 5,000 / To Cash A/c 5,000 / (Being furniture bought for cash)',
    'Leaving out the narration, or writing "To" before the debited account.'),
  card(7, 'je-settlement', 'rule', 'How do trade discount and cash discount differ in the books?',
    'Trade discount is deducted from the list price and never recorded. Cash discount is recorded: Discount Allowed is debited, Discount Received is credited.',
    'Trade discount fixes the price; cash discount rewards prompt payment and is a real loss or gain.',
    'Received ₹4,900 from Kiran in full settlement of ₹5,000: Cash A/c Dr 4,900; Discount Allowed A/c Dr 100; To Kiran 5,000. Paid ₹9,800 to Rao in full settlement of ₹10,000: Rao Dr 10,000; To Cash A/c 9,800; To Discount Received A/c 200.',
    'Opening a "Trade Discount" account.'),
  card(8, 'je-gst', 'rule', 'Which GST accounts are used on purchases and on sales?',
    'Purchases: Input CGST and Input SGST (within the state) or Input IGST (another state) are debited. Sales: Output CGST and Output SGST, or Output IGST, are credited.',
    'Input tax can be set off later, so it is an asset. Output tax is owed to the government, so it is a liability.',
    'Bought goods ₹10,000 plus 18% within the state on credit from Rao: Purchases A/c Dr 10,000; Input CGST A/c Dr 900; Input SGST A/c Dr 900; To Rao 11,800.',
    'Adding the tax to the Purchases or Sales amount.'),
  card(9, 'je-returns', 'rule', 'How are returns of goods recorded?',
    'Goods returned to a supplier: Supplier A/c Dr; To Purchases Return A/c. Goods returned by a customer: Sales Return A/c Dr; To Customer A/c.',
    'A return reverses part of the earlier purchase or sale through its own return account.',
    'Returned goods ₹1,000 to Rao: Rao Dr 1,000; To Purchases Return A/c 1,000.',
    'Crediting Purchases or debiting Sales directly.'),
  card(10, 'je-bank', 'rule', 'How are cash deposited into, or withdrawn from, the business bank account recorded?',
    'Deposit: Bank A/c Dr; To Cash A/c. Withdrawal for office use: Cash A/c Dr; To Bank A/c.',
    'Cash and Bank are both assets, so the money only moves from one to the other (a contra entry). The asset that increases is debited and the one that decreases is credited.',
    'Deposited ₹20,000 cash into the bank: Bank A/c Dr ₹20,000; To Cash A/c ₹20,000. Withdrew ₹5,000 from the bank for office use: Cash A/c Dr ₹5,000; To Bank A/c ₹5,000.',
    'Treating a withdrawal for office use as Drawings. Drawings is only for money the owner takes for personal use.'),
  card(11, 'je-goods', 'rule', 'How are goods bought for cash and goods sold for cash recorded?',
    'Bought: Purchases A/c Dr; To Cash or Bank A/c. Sold: Cash or Bank A/c Dr; To Sales A/c.',
    'Goods bought for resale go to Purchases and goods sold go to Sales. Payment is made at once, so no supplier or customer account is involved.',
    'Bought goods ₹6,000 for cash: Purchases A/c Dr ₹6,000; To Cash A/c ₹6,000. Sold goods ₹9,000 for cash: Cash A/c Dr ₹9,000; To Sales A/c ₹9,000.',
    'Using a "Goods" account, or debiting the supplier when cash is paid immediately.'),
];

const mcq = (
  n: number,
  conceptId: string,
  prompt: string,
  options: [string, string, string, string],
  correct: 'a' | 'b' | 'c' | 'd',
  explanation: string,
  hints: string[],
): McqQuestion => ({
  id: `je-q-${String(n).padStart(3, '0')}`,
  topicId: T,
  conceptId,
  difficulty: 'easy',
  type: 'mcq',
  prompt,
  options: options.map((text, i) => ({ id: 'abcd'[i], text })),
  correct,
  explanation,
  hints,
});

const TYPE_HINT = 'First decide what type of account it is.';
const SIDE_HINT = 'Assets and expenses increase on the debit side; liabilities, capital and incomes on the credit side.';

const questions: McqQuestion[] = [
  mcq(1, 'je-rules', 'Every transaction affects at least how many accounts?', ['One', 'Two', 'Three', 'Four'], 'b',
    'Each transaction has a debit and a credit of equal amount, so at least two accounts change.',
    ['Think of what is received and what is given.', 'Debits must equal credits.']),
  mcq(2, 'je-rules', 'Machinery is bought for cash. Machinery A/c is:',
    ['Debited, because an asset increases', 'Credited, because cash is paid', 'Debited, because it is an expense', 'Credited, because an asset increases'], 'a',
    'Machinery is an asset and the business now has more of it, so it is debited.', [TYPE_HINT, SIDE_HINT]),
  mcq(3, 'je-assets-expenses', 'Rent is paid by cheque. Which account is credited?', ['Rent', 'Cash', 'Landlord', 'Bank'], 'd',
    'A cheque reduces the bank balance. Bank is an asset that decreases, so it is credited.', ['Where did the money come from?', SIDE_HINT]),
  mcq(4, 'je-capital-drawings', 'The owner brings cash into the business as capital. Capital A/c is:',
    ['Debited, because cash comes in', 'Credited, because it is an income', 'Credited, because capital increases', 'Debited, because capital increases'], 'c',
    'Capital increases on the credit side. Cash, the asset received, is debited.', [TYPE_HINT, SIDE_HINT]),
  mcq(5, 'je-credit', 'Goods are sold to Mohan on credit. Which account is debited?', ['Sales', 'Mohan', 'Cash', 'Purchases'], 'b',
    'Mohan now owes the business, so Mohan is a debtor: an asset that increases.', ['No cash is received yet. Who owes the business?', SIDE_HINT]),
  mcq(6, 'je-capital-drawings', 'The owner withdraws cash for personal use. Which account is debited?',
    ['Sales', 'Cash', 'Drawings', 'Salaries'], 'c',
    'Personal withdrawals are recorded in Drawings, which reduces capital and is therefore debited.',
    ['Is this a business expense?', 'Drawings reduce capital.']),
  mcq(7, 'je-credit', 'Goods are bought from Rao on credit. Which pair of accounts is affected?',
    ['Goods and Rao', 'Purchases and Cash', 'Rao and Cash', 'Purchases and Rao'], 'd',
    'Rao becomes a creditor. In this course goods bought for resale are recorded in Purchases A/c, so no separate "Goods" account is used.',
    ['Nothing is paid now.', 'Goods bought for resale are recorded in Purchases.']),
  mcq(8, 'je-gst', 'Goods of list price ₹10,000 are bought at 10% trade discount. Purchases A/c is debited with:',
    ['₹9,000', '₹10,000', '₹1,000', '₹11,000'], 'a',
    'Trade discount is deducted before recording: 10,000 − 1,000 = 9,000.',
    ['Is trade discount recorded in the books?', 'Record the net price only.']),
  mcq(9, 'je-gst', 'Goods are purchased within the same state with GST. Which accounts record the tax?',
    ['Input IGST', 'Output CGST and Output SGST', 'Output IGST', 'Input CGST and Input SGST'], 'd',
    'Tax on purchases is input tax, and within a state it is split into CGST and SGST.',
    ['Is tax on a purchase input or output?', 'IGST applies between states.']),
  mcq(10, 'je-settlement', 'Received ₹4,900 from Kiran in full settlement of ₹5,000. The ₹100 is recorded in:',
    ['Discount Received A/c (credit)', 'Sales A/c (debit)', 'Discount Allowed A/c (debit)', 'It is not recorded'], 'c',
    'The business gave up ₹100, a loss, so Discount Allowed is debited.',
    ['Who gave the discount?', 'Losses and expenses are debited.']),
];

const level = (order: number, rest: Omit<Level, 'id' | 'topicId' | 'order'>): Level => ({
  id: `${T}-level-${order}`,
  topicId: T,
  order,
  ...rest,
});

const EASY = ['je-capital', 'je-drawings', 'je-cash-purchase', 'je-cash-sale', 'je-asset-purchase', 'je-expense-paid', 'je-income-received'];
const CREDIT = ['je-credit-purchase', 'je-credit-sale'];
const SETTLE = ['je-payment-discount', 'je-receipt-discount'];
const BANK_RETURNS = ['je-bank-contra', 'je-returns'];
const GST = ['je-gst-purchase', 'je-gst-sale'];

const levels: Level[] = [
  level(0, {
    type: 'concept',
    title: 'What Is a Journal Entry?',
    description: 'Build the idea first: every transaction has two equal sides.',
    lesson: [
      { type: 'text', heading: 'Two sides to every transaction',
        body: 'When a business buys a table for cash, two things happen together: a table comes in and cash goes out. Accounting records both. Every entry has at least one account debited and at least one account credited, and the total of the debits always equals the total of the credits.' },
      { type: 'text', heading: 'Five kinds of accounts',
        body: 'Every account is an asset, a liability, capital, an income or an expense. Assets and expenses increase on the debit side. Liabilities, capital and incomes increase on the credit side. A decrease goes on the opposite side. The owner\'s withdrawals are recorded in Drawings, which reduces capital and is therefore debited.' },
      { type: 'example', title: 'Bought furniture for ₹5,000 cash',
        lines: [
          { accountId: 'furniture', side: 'Dr', amount: 500000 },
          { accountId: 'cash', side: 'Cr', amount: 500000 },
        ],
        note: 'Furniture, an asset, increases: debit. Cash, an asset, decreases: credit.' },
      // Worked examples added in the quality pass: credit, discounts and GST come before level 3 asks about them.
      { type: 'text', heading: 'Buying and selling on credit',
        body: 'Goods bought for resale always go to Purchases A/c, and goods sold to Sales A/c; there is no "Goods A/c". On credit nothing is paid at once: the supplier becomes a creditor (a liability, credited) and a customer becomes a debtor (an asset, debited). When the money moves later, the party\'s account is cleared and Cash or Bank takes the other side.' },
      { type: 'example', title: 'Ganesh Hardware of Pune buys goods for ₹40,000 on credit from Rao & Co.',
        lines: [
          { accountId: 'purchases', side: 'Dr', amount: 4000000 },
          { accountId: 'creditor:Rao & Co.', side: 'Cr', amount: 4000000 },
        ],
        note: 'Goods for resale came in: Purchases A/c is debited. Rao & Co. is now owed ₹40,000, a liability that grows: Rao & Co. is credited. Watch out: Cash A/c has no place here, because nothing was paid.' },
      { type: 'text', heading: 'Trade discount and cash discount',
        body: 'Trade discount is a cut in the list price that a supplier gives a trader who buys for resale. It is taken off on the invoice, before anything else, and is never entered in the books: the entry shows the price after it. Cash discount is given for paying on time, and it is entered: the business that receives less than is due debits Discount Allowed A/c (a loss), and the business that pays less than it owes credits Discount Received A/c (a gain). The party\'s account is always cleared with the whole amount due.' },
      { type: 'example', title: 'Kiran owes Ganesh Hardware ₹20,000 and pays ₹19,600 by cheque in full settlement',
        lines: [
          { accountId: 'bank', side: 'Dr', amount: 1960000 },
          { accountId: 'discountAllowed', side: 'Dr', amount: 40000 },
          { accountId: 'debtor:Kiran', side: 'Cr', amount: 2000000 },
        ],
        note: 'Bank A/c takes what really came in, ₹19,600. The ₹400 given up is a loss: Discount Allowed A/c is debited. Kiran owes nothing now, so Kiran is credited with the full ₹20,000. Watch out: crediting Kiran with ₹19,600 only would leave ₹400 still owing in the books.' },
      { type: 'example', title: 'Ganesh Hardware pays Rao & Co. ₹39,200 in cash in full settlement of ₹40,000',
        lines: [
          { accountId: 'creditor:Rao & Co.', side: 'Dr', amount: 4000000 },
          { accountId: 'cash', side: 'Cr', amount: 3920000 },
          { accountId: 'discountReceived', side: 'Cr', amount: 80000 },
        ],
        note: 'The whole ₹40,000 owed is cleared: Rao & Co. is debited with it. Cash goes out, ₹39,200: Cash A/c is credited. The ₹800 not paid is a gain: Discount Received A/c is credited. Watch out: a discount the business receives is credited, one it allows is debited.' },
      { type: 'text', heading: 'GST on purchases and sales',
        body: 'GST paid on a purchase is input tax: it can be set off later against the tax collected on sales, so it is an asset and is debited (Input CGST and Input SGST within the state, Input IGST from another state). GST charged on a sale is output tax: it is owed to the government, so it is a liability and is credited (Output CGST and Output SGST, or Output IGST). Within the state the rate is split equally between CGST and SGST. GST is worked on the price after trade discount, and the party\'s account takes the invoice total.' },
      { type: 'working', title: 'An invoice with trade discount and GST: Rao & Co. sells goods of list price ₹50,000 to Ganesh Hardware',
        lines: [
          'List price: ₹50,000. Trade discount at 10% = ₹5,000.',
          'Price after trade discount = ₹50,000 - ₹5,000 = ₹45,000. This is the amount debited to Purchases A/c.',
          'Both firms are in Maharashtra, so GST at 18% is split: CGST 9% of ₹45,000 = ₹4,050 and SGST 9% of ₹45,000 = ₹4,050.',
          'Invoice total = ₹45,000 + ₹4,050 + ₹4,050 = ₹53,100, which Ganesh Hardware owes Rao & Co.',
        ],
        note: 'Watch out: GST is never worked on the list price, and the ₹5,000 of trade discount is not entered anywhere.' },
      { type: 'example', title: 'The same purchase on credit, with GST',
        lines: [
          { accountId: 'purchases', side: 'Dr', amount: 4500000 },
          { accountId: 'inputCGST', side: 'Dr', amount: 405000 },
          { accountId: 'inputSGST', side: 'Dr', amount: 405000 },
          { accountId: 'creditor:Rao & Co.', side: 'Cr', amount: 5310000 },
        ],
        note: 'Purchases A/c takes the price after trade discount. The two input taxes are assets, debited. Rao & Co. is credited with the invoice total, ₹53,100. Watch out: the tax is not added to Purchases A/c; it has accounts of its own.' },
      { type: 'example', title: 'Ganesh Hardware sells goods for ₹30,000 on credit to Mohan, in Pune, plus GST at 18%',
        lines: [
          { accountId: 'debtor:Mohan', side: 'Dr', amount: 3540000 },
          { accountId: 'sales', side: 'Cr', amount: 3000000 },
          { accountId: 'outputCGST', side: 'Cr', amount: 270000 },
          { accountId: 'outputSGST', side: 'Cr', amount: 270000 },
        ],
        note: 'Mohan owes the invoice total, ₹30,000 + ₹2,700 + ₹2,700 = ₹35,400: Mohan is debited. Sales A/c takes ₹30,000. The tax collected is owed to the government: Output CGST and Output SGST are credited. Had Mohan been in another state, one line of Output IGST, ₹5,400, would take their place.' },
      { type: 'text', heading: 'Adjustments, and goods that leave without a sale',
        body: 'At the year end some expenses are still unpaid: they are charged to the year all the same, and the amount owed is a liability. Goods taken by the owner, given away as charity or as free samples, or lost by fire, leave the business without being sold: they are taken out of Purchases A/c at cost, and the debit says why they left.' },
      { type: 'example', title: 'Salaries of ₹18,000 for March are unpaid on 31 March',
        lines: [
          { accountId: 'salaries', side: 'Dr', amount: 1800000 },
          { accountId: 'outstandingExpenses', side: 'Cr', amount: 1800000 },
        ],
        note: 'March\'s salaries are an expense of this year: Salaries A/c is debited. They are owed to the staff, a liability: Outstanding Expenses A/c is credited. Watch out: Cash A/c is not touched, since nothing has been paid.' },
      { type: 'example', title: 'Goods costing ₹5,000 are given to a flood relief fund (ignore GST)',
        lines: [
          { accountId: 'charity', side: 'Dr', amount: 500000 },
          { accountId: 'purchases', side: 'Cr', amount: 500000 },
        ],
        note: 'A donation is an expense: Charity A/c is debited. The goods leave without a sale, so Purchases A/c is credited at cost. Watch out: Sales A/c is not used, and the selling price is not used.' },
      { type: 'example', title: 'Goods costing ₹60,000 are destroyed by fire; the insurer admits a claim of ₹45,000',
        lines: [
          { accountId: 'insuranceClaimReceivable', side: 'Dr', amount: 4500000 },
          { accountId: 'lossByFire', side: 'Dr', amount: 1500000 },
          { accountId: 'purchases', side: 'Cr', amount: 6000000 },
        ],
        note: 'The ₹45,000 due from the insurer is an asset (the NCERT book calls the account Insurance Claim A/c or Insurance Company A/c). Only the ₹15,000 the insurer will not pay is a loss: Loss by Fire A/c. Purchases A/c is credited with the whole cost. Watch out: the whole ₹60,000 is not a loss when a claim is admitted.' },
      { type: 'check', questionId: 'je-q-001' },
    ],
  }),
  level(1, { type: 'card_revision', title: 'Rules and Format', description: 'Recall the rules of debit and credit before using them.',
    cardIds: ['je-card-1', 'je-card-2', 'je-card-3', 'je-card-4', 'je-card-5', 'je-card-6', 'je-card-7', 'je-card-8', 'je-card-9', 'je-card-10', 'je-card-11'] }),
  level(2, { type: 'rule_recognition', title: 'Which Side?', description: 'Name the account type and the side, before writing any entry.',
    questionIds: ['je-q-002', 'je-q-003', 'je-q-004', 'je-q-005', 'je-q-006'] }),
  level(3, { type: 'method_recognition', title: 'Which Accounts?', description: 'Pick the right accounts and avoid the usual traps.',
    questionIds: ['je-q-007', 'je-q-008', 'je-q-009', 'je-q-010'] }),
  level(4, { type: 'easy_practice', title: 'Simple Cash Entries', description: 'One debit, one credit: capital, drawings, goods, assets, expenses and incomes.',
    generate: { templateIds: EASY, count: 8 } }),
  level(5, { type: 'guided_practice', title: 'Credit Transactions (Guided)', description: 'Buying and selling on credit, with the method laid out.',
    generate: { templateIds: CREDIT, count: 6 } }),
  level(6, { type: 'medium_practice', title: 'Settlements and Discounts', description: 'Paying and receiving in full settlement.',
    generate: { templateIds: SETTLE, count: 6 } }),
  level(7, { type: 'medium_practice', title: 'Bank Transfers and Returns', description: 'Contra entries and goods returned.',
    generate: { templateIds: BANK_RETURNS, count: 6 } }),
  level(8, { type: 'medium_practice', title: 'Entries with GST', description: 'CGST, SGST and IGST on purchases and sales.',
    generate: { templateIds: GST, count: 6 } }),
  level(9, { type: 'complex_practice', title: 'Complex Entries', description: 'Trade discount with GST, and settlements with discount, in one entry.',
    generate: { templateIds: ['je-trade-discount', ...GST, ...SETTLE], count: 7 } }),
  level(10, { type: 'mixed_practice', title: 'Mixed Practice', description: 'Everything in this topic, shuffled the way an exam serves it.',
    generate: { templateIds: [...EASY, ...CREDIT, ...SETTLE, ...BANK_RETURNS, ...GST, 'je-trade-discount'], count: 10 } }),
  level(11, { type: 'challenge', title: 'Challenge: Journal Mastery', description: 'The hardest entries in the topic, mixed together.',
    generate: { templateIds: ['je-trade-discount', ...GST, ...SETTLE, 'je-returns'], count: 8 }, timerSecondsPerQuestion: 90 }),
];

// ===============================================================================================================
// Added later: more cards, authored questions and levels 12 onwards. Everything above is unchanged.
// ===============================================================================================================

const moreCards: Card[] = [
  card(12, 'je-compound', 'format', 'How is an opening entry passed?',
    'Every asset is debited, every amount owed to outsiders is credited, and Capital is credited with the difference (assets less liabilities).',
    'At the start of a new year the closing balances of the old year are entered in the new books. When the capital is not given, it is the balancing figure.',
    'Cash ₹20,000, stock ₹50,000 and Mohan (debtor) ₹30,000; Rao (creditor) ₹15,000: Cash A/c Dr 20,000; Stock A/c Dr 50,000; Mohan Dr 30,000; To Rao 15,000; To Capital A/c 85,000.',
    'Leaving Capital out, or crediting it with the total of the assets instead of assets less liabilities.'),
  card(13, 'je-adjustments', 'rule', 'How are outstanding and prepaid expenses adjusted?',
    'Outstanding: Expense A/c Dr; To Outstanding Expenses A/c. Prepaid: Prepaid Expenses A/c Dr; To Expense A/c.',
    'An unpaid expense of this year is still a cost of this year and a liability. A payment that belongs to next year is taken out of this year\'s cost and shown as an asset.',
    'Rent of ₹5,000 for March unpaid: Rent A/c Dr 5,000; To Outstanding Expenses A/c 5,000. Insurance paid ₹12,000 includes ₹3,000 for next year: Prepaid Expenses A/c Dr 3,000; To Insurance A/c 3,000.',
    'Debiting Outstanding Expenses: it is a liability, so it is credited.'),
  card(14, 'je-adjustments', 'rule', 'How are accrued income and income received in advance adjusted?',
    'Accrued: Accrued Income A/c Dr; To Income A/c. Received in advance: Income A/c Dr; To Income Received in Advance A/c.',
    'Income earned but not yet received is an asset. Income received for a later year is a liability, because the business still owes the service.',
    'Interest ₹2,000 earned but not received: Accrued Income A/c Dr 2,000; To Interest Received A/c 2,000. Rent received includes ₹4,000 for next year: Rent Received A/c Dr 4,000; To Income Received in Advance A/c 4,000.',
    'Mixing the two: calling income received in advance an asset because cash came in.'),
  card(15, 'je-adjustments', 'rule', 'How are bad debts and bad debts recovered recorded?',
    'Bad debt: Bad Debts A/c Dr; To Debtor. Recovery of a debt written off earlier: Cash or Bank A/c Dr; To Bad Debts Recovered A/c.',
    'A debt that cannot be collected is a loss. When it is written off the debtor\'s account is closed, so a later recovery is a gain and does not go through the debtor.',
    'Kiran\'s ₹4,000 is irrecoverable: Bad Debts A/c Dr 4,000; To Kiran 4,000. Later ₹4,000 is received in cash: Cash A/c Dr 4,000; To Bad Debts Recovered A/c 4,000.',
    'Crediting the debtor\'s account again when the money comes in.'),
  card(16, 'je-adjustments', 'rule', 'How is depreciation recorded?',
    'Depreciation A/c Dr; To the Asset A/c (reducing it directly) or To Provision for Depreciation A/c (the asset stays at cost).',
    'Depreciation is the part of an asset used up in the year: an expense. The question says which way to credit it; follow it.',
    'Depreciation ₹8,000 on machinery, asset reduced directly: Depreciation A/c Dr 8,000; To Machinery A/c 8,000.',
    'Crediting Cash: depreciation is not a payment.'),
  card(17, 'je-goods-otherwise', 'rule', 'How are goods taken by the owner, used for staff welfare, given as charity or distributed as free samples recorded?',
    'At cost, with Purchases A/c credited: Drawings A/c Dr (owner); Staff Welfare Expenses A/c Dr (goods given to the staff); Charity A/c Dr (donation); Advertisement A/c Dr (free samples).',
    'The goods leave without being sold, so they are taken out of Purchases at cost. The debit says why they left.',
    'Goods costing ₹3,000 taken by the owner: Drawings A/c Dr 3,000; To Purchases A/c 3,000.',
    'Crediting Sales, or recording the goods at selling price.'),
  card(18, 'je-losses-claims', 'rule', 'How are goods lost by fire or theft recorded, with and without insurance?',
    'No insurance: Loss by Fire (or Theft) A/c Dr; To Purchases A/c. Insured, as one combined entry: Insurance Claim Receivable A/c Dr for the claim admitted; Loss by Fire A/c Dr for the rest; To Purchases A/c for the whole cost.',
    'The goods were debited to Purchases A/c when they were bought and have left without being sold, so their cost is taken out of Purchases A/c; Stock A/c and Sales A/c are not used. The claim is an amount due from the insurer, an asset. Only the part the insurer will not pay is a loss. The NCERT book names the claim account Insurance Claim A/c or Insurance Company A/c: it is the same account as Insurance Claim Receivable A/c here.',
    'Goods ₹20,000 burnt, claim admitted ₹15,000: Insurance Claim Receivable A/c Dr 15,000; Loss by Fire A/c Dr 5,000; To Purchases A/c 20,000.',
    'Crediting Stock or Sales instead of Purchases, or leaving the whole cost in Loss by Fire even though a claim is admitted.'),
  card(19, 'je-adjustments', 'formula', 'How is interest on capital recorded?',
    'Interest on Capital A/c Dr; To Capital A/c. Interest = capital x rate x months / 12.',
    'Interest on capital is an expense to the business, and it is due to the owner, whose capital grows by it. Capital brought in during the year earns interest only for the months left to the year end.',
    'Capital ₹2,00,000 for the whole year at 6%: ₹12,000. ₹40,000 more brought in on 1 October, year ending 31 March: 40,000 x 6% x 6/12 = ₹1,200. Interest on Capital A/c Dr 13,200; To Capital A/c 13,200.',
    'Crediting Interest on Capital A/c, as if the interest were an income of the business.'),
  card(20, 'je-banking', 'rule', 'How are bank charges and interest credited by the bank recorded?',
    'Bank charges: Bank Charges A/c Dr; To Bank A/c. Interest credited by the bank: Bank A/c Dr; To Interest Received A/c.',
    'Bank moves with the money: a deduction by the bank is credited, an addition is debited.',
    'Bank charges ₹300: Bank Charges A/c Dr 300; To Bank A/c 300. Interest credited ₹1,200: Bank A/c Dr 1,200; To Interest Received A/c 1,200.',
    'Crediting Cash although the bank, not the till, was involved.'),
  card(21, 'je-assets', 'rule', 'How are the purchase and sale of a fixed asset on credit recorded?',
    'Purchase: Asset A/c Dr; To Supplier (any transport and installation paid is added to the asset). Sale: Buyer Dr; To Asset A/c at book value; a gain is credited to Profit on Sale of Asset A/c and a loss debited to Loss on Sale of Asset A/c.',
    'An asset is not goods for resale, so Purchases and Sales are never used for it. The NCERT book names the gain or loss after the asset (Profit on Sale of Machinery A/c, Loss on Sale of Furniture A/c): the same accounts as Profit on Sale of Asset A/c and Loss on Sale of Asset A/c here.',
    'Furniture book value ₹10,000 sold on credit to Mohan for ₹12,000: Mohan Dr 12,000; To Furniture A/c 10,000; To Profit on Sale of Asset A/c 2,000.',
    'Crediting Sales for an asset sold.'),
  card(22, 'je-banking', 'rule', 'How are a cheque received, deposited and dishonoured recorded?',
    'Received and banked: Bank A/c Dr; To Debtor. Banked later, after being treated as cash: Bank A/c Dr; To Cash A/c. Dishonoured: Debtor Dr; To Bank A/c (with any bank charges that are to be recovered from the debtor added to both sides).',
    'A cheque not banked on the day it is received is treated as cash until it is deposited. A dishonoured cheque undoes the receipt, so the debtor owes again.',
    'Mohan\'s cheque for ₹6,000 is returned unpaid: Mohan Dr 6,000; To Bank A/c 6,000.',
    'Debiting Sales Return or Bad Debts: the debt still stands.'),
  card(23, 'je-compound', 'shortcut', 'How do you write a compound entry quickly?',
    'List every debit line, then every credit line, and check that the two totals are equal.',
    'A compound entry has several debits, several credits, or both. One narration covers the whole entry.',
    'Paid by cheque: rent ₹4,000, salaries ₹9,000: Rent A/c Dr 4,000; Salaries A/c Dr 9,000; To Bank A/c 13,000.',
    'Crediting Bank twice, once per expense, or forgetting to add the credit lines.'),
  card(24, 'je-settlement', 'formula', 'How do trade discount and cash discount work together?',
    'Net amount = list price less trade discount. Cash discount = rate x net amount. Amount paid = net amount less cash discount.',
    'Trade discount is deducted first and never recorded. Cash discount applies to what is left and is recorded.',
    'List ₹20,000, trade discount 10%, cash discount 5%: net ₹18,000; discount ₹900; paid ₹17,100. Creditor Dr 18,000; To Bank A/c 17,100; To Discount Received A/c 900.',
    'Working out the cash discount on the list price.'),
  card(25, 'je-compound', 'rule', 'How are advances received and paid recorded?',
    'Advance received: Cash or Bank A/c Dr; To the customer\'s A/c. Advance paid: Supplier\'s A/c Dr; To Cash or Bank A/c.',
    'Nothing has been sold or bought yet, so Sales and Purchases are not used. Here the party\'s own account carries the advance until the goods move: a customer who has paid ahead shows a credit balance, a supplier paid ahead a debit balance. Some books open a separate Advance from Customers A/c instead; the effect is the same.',
    'Received ₹5,000 by cheque from Kiran as advance: Bank A/c Dr 5,000; To Kiran 5,000.',
    'Crediting Sales when an advance is received.'),
  card(26, 'je-rules', 'rule', 'Which side does a contra account increase on?',
    'On the opposite side to the account it reduces. Drawings and Sales Return increase on the debit side; Purchases Return and Provision for Depreciation on the credit side.',
    'A contra account reduces another account, so it works opposite to it.',
    'Drawings reduce Capital (credit), so Drawings is debited. Purchases Return reduces Purchases (debit), so it is credited.',
    'Treating Drawings as part of capital and crediting it.'),
  card(27, 'je-rules', 'rule', 'Which adjustment accounts are assets and which are liabilities?',
    'Assets: Prepaid Expenses, Accrued Income, Insurance Claim Receivable. Liabilities: Outstanding Expenses, Income Received in Advance.',
    'An amount the business is owed, or has paid ahead, is an asset. An amount the business owes, or an income it has taken ahead of earning, is a liability.',
    'Outstanding rent is owed, so it is a liability (credit). Prepaid insurance is paid ahead, so it is an asset (debit).',
    'Calling an outstanding expense an expense or an asset: the account Outstanding Expenses is a liability.'),
];

const base = (n: number, conceptId: string, difficulty: 'easy' | 'medium' | 'complex', hints: string[]) => ({
  id: `je-q-${String(n).padStart(3, '0')}`,
  topicId: T,
  conceptId,
  difficulty,
  hints,
});

const tf = (n: number, conceptId: string, difficulty: 'easy' | 'medium' | 'complex', prompt: string, correct: boolean, explanation: string, hints: string[]): TrueFalseQuestion => ({
  ...base(n, conceptId, difficulty, hints), type: 'true_false', prompt, correct, explanation,
});

const num = (
  n: number, conceptId: string, difficulty: 'easy' | 'medium' | 'complex', prompt: string, answerRupees: number,
  errors: [number, string][], working: string[], hints: string[],
): NumericQuestion => ({
  ...base(n, conceptId, difficulty, hints), type: 'numeric', prompt, unit: 'rupees', answer: answerRupees * 100,
  commonErrors: errors.map(([value, why]) => ({ value: value * 100, why })), working, explanation: working.join(' '),
});

const je = (
  n: number, conceptId: string, difficulty: 'easy' | 'medium' | 'complex', prompt: string,
  expected: [string, 'Dr' | 'Cr', number][], extraAccounts: string[], explanation: string, hints: string[],
): JournalQuestion => ({
  ...base(n, conceptId, difficulty, hints), type: 'journal_entry', prompt,
  expected: expected.map(([accountId, side, rupeesAmount]) => ({ accountId, side, amount: rupeesAmount * 100 })),
  accountChoices: [...new Set([...expected.map((e) => e[0]), ...extraAccounts])].sort(), explanation,
});

const moreQuestions: Question[] = [
  tf(11, 'je-rules', 'easy', 'True or false: a decrease in a liability is recorded on the debit side.', true,
    'Liabilities increase on the credit side, so paying off what is owed, which decreases them, is a debit.', [TYPE_HINT, SIDE_HINT]),
  tf(12, 'je-adjustments', 'medium', 'True or false: outstanding expenses are shown as an asset because they will be paid later.', false,
    'Outstanding expenses are owed to someone, so they are a liability, credited when recorded.', ['Does the business own it or owe it?', 'Amounts owed are liabilities.']),
  tf(13, 'je-adjustments', 'medium', 'True or false: prepaid insurance is an asset until the cover period is used up.', true,
    'The business has paid for a benefit it has not yet received, which is an asset (Prepaid Expenses A/c) that is used up with time.', ['Has the benefit been used yet?', 'Paid in advance means the business holds a right.']),
  tf(14, 'je-adjustments', 'medium', 'True or false: when a debt written off as bad in an earlier year is recovered in cash, the gain is shown by crediting Bad Debts A/c.', false,
    'Bad Debts A/c is the expense account for debts written off. A recovery of a debt written off in an earlier year is a gain of this year: Cash A/c is debited and Bad Debts Recovered A/c is credited.', ['Which account records a gain from an old debt?', 'Recoveries are gains, shown in an account of their own.']),
  tf(15, 'je-goods-otherwise', 'medium', 'True or false: when the owner takes goods for personal use, Sales A/c is credited.', false,
    'Nothing is sold. Drawings A/c is debited and Purchases A/c is credited with the cost of the goods.', ['Is anything sold?', 'Goods leave Purchases at cost.']),
  tf(16, 'je-goods-otherwise', 'easy', 'True or false: goods distributed as free samples are debited to Advertisement A/c at cost.', true,
    'Free samples are a selling cost. Advertisement A/c is debited and Purchases A/c is credited with the cost.', ['Why were the goods given away?', 'Samples promote sales.']),
  // Interest on drawings is beyond the Class 11 syllabus: this question stands on no level and in no mock paper.
  beyondQuestion(tf(17, 'je-adjustments', 'medium', 'True or false: interest on drawings is an income of the business.', true,
    'The business charges the owner interest, which it earns. Drawings A/c is debited and Interest on Drawings A/c is credited.', ['Who earns the interest?', 'Incomes are credited.']), BEYOND_INTEREST_ON_DRAWINGS),
  tf(18, 'je-adjustments', 'medium', 'True or false: interest on capital allowed to the owner is an income of the business.', false,
    'The business allows it to the owner, so for the business it is an expense: Interest on Capital A/c is debited and Capital A/c is credited.', ['Who bears the interest?', 'Expenses are debited.']),
  tf(19, 'je-compound', 'easy', 'True or false: in an opening entry, the excess of the assets over the amounts owed to outsiders is credited to Capital A/c.', true,
    'Assets are debited, outside liabilities are credited, and Capital A/c is credited with the difference, which is what the business owes its owner.', ['What does the difference between assets and outside liabilities belong to?', 'Assets = Liabilities + Capital.']),
  tf(20, 'je-banking', 'medium', 'True or false: when a cheque received from a debtor is dishonoured, the debtor\'s account is debited.', true,
    'The receipt is undone: the debtor owes again (Dr) and the bank balance is reduced (Cr).', ['Does the debtor still owe?', 'The debtor\'s account was credited when the cheque came in.']),
  tf(21, 'je-losses-claims', 'medium', 'True or false: when the insurer admits in full the claim for goods destroyed by fire, the business is still left with a loss equal to the cost of the goods.', false,
    'A claim admitted in full means the insurer pays the whole cost. The amount due from the insurer, Insurance Claim Receivable A/c, takes the place of the goods and no loss is left for the business to bear.', ['What will the insurer pay?', 'Only the part not claimed is a loss.']),
  tf(22, 'je-assets', 'medium', 'True or false: transport and installation charges paid on a new machine are debited to the Machinery A/c.', true,
    'They are needed to bring the machine into use, so they form part of its cost.', ['Do they make the machine ready for use?', 'Everything spent to bring an asset into use is part of its cost.']),
  tf(23, 'je-banking', 'medium', 'True or false: bank charges deducted by the bank are credited to Bank Charges A/c.', false,
    'Bank Charges is an expense and is debited. Bank A/c, an asset that falls, is credited.', ['Which of the two is the expense?', 'Expenses are debited.']),
  num(24, 'je-adjustments', 'medium', 'Machinery costing ₹2,40,000 is depreciated at 10% a year on cost (straight-line method) for a full year. What amount is debited to Depreciation A/c?', 24000,
    [[216000, 'Gave the value left after depreciation instead of the depreciation.'], [240000, 'Gave the cost of the machinery.']],
    ['Depreciation = ₹2,40,000 x 10% = ₹24,000.'], ['Depreciation = cost x rate.', 'Write the rate as a fraction of 100.']),
  num(25, 'je-adjustments', 'medium', 'The owner\'s capital is ₹4,00,000 throughout the year and interest on capital is allowed at 6% a year. What amount is credited to Capital A/c as interest?', 24000,
    [[2000, 'Took one month of interest instead of the full year.'], [424000, 'Gave the capital after adding the interest instead of the interest.']],
    ['Interest = ₹4,00,000 x 6% = ₹24,000.'], ['Interest = capital x rate x time.', 'The rate is for a full year.']),
  num(26, 'je-compound', 'medium', 'On 1 April a trader\'s assets are ₹5,50,000 and amounts owed to outsiders are ₹1,80,000. What amount is credited to Capital A/c in the opening entry?', 370000,
    [[730000, 'Added the liabilities to the assets instead of deducting them.'], [550000, 'Forgot to deduct the liabilities.']],
    ['Capital = assets - liabilities = ₹5,50,000 - ₹1,80,000 = ₹3,70,000.'], ['Capital is the balancing figure.', 'Assets = Liabilities + Capital.']),
  num(27, 'je-losses-claims', 'medium', 'Goods costing ₹80,000 are destroyed by fire. The insurer admits a claim for 75% of the cost. What amount is debited to Loss by Fire A/c?', 20000,
    [[60000, 'Gave the claim admitted, which is debited to Insurance Claim Receivable instead.'], [80000, 'Debited the whole cost although most of it will be claimed.']],
    ['Claim admitted = 75% of ₹80,000 = ₹60,000.', 'Loss borne = ₹80,000 - ₹60,000 = ₹20,000.'], ['Only the part not claimed is a loss.', 'Find the claim first.']),
  je(28, 'je-adjustments', 'medium', 'Wages of ₹12,000 for the last month of the year are unpaid on 31 March. Pass the adjusting entry.',
    [['wages', 'Dr', 12000], ['outstandingExpenses', 'Cr', 12000]], ['prepaidExpenses', 'cash', 'bank'],
    'The wages belong to this year, so Wages A/c is debited; the unpaid amount is a liability, so Outstanding Expenses A/c is credited.', [TYPE_HINT, SIDE_HINT]),
  je(29, 'je-adjustments', 'medium', 'The insurance premium of ₹18,000 paid during the year includes ₹6,000 for the next year. Pass the adjusting entry.',
    [['prepaidExpenses', 'Dr', 6000], ['insurance', 'Cr', 6000]], ['outstandingExpenses', 'cash', 'bank'],
    'The part for next year is an asset, so Prepaid Expenses A/c is debited; it is taken out of this year\'s Insurance A/c, which is credited.', [TYPE_HINT, SIDE_HINT]),
  je(30, 'je-goods-otherwise', 'easy', 'The owner took goods costing ₹4,000 from the shop for use at home. Pass the entry. Ignore GST.',
    [['drawings', 'Dr', 4000], ['purchases', 'Cr', 4000]], ['sales', 'capital', 'cash'],
    'Personal withdrawals are debited to Drawings A/c; the goods leave Purchases A/c, which is credited at cost.', [TYPE_HINT, SIDE_HINT]),
  je(31, 'je-adjustments', 'medium', 'Mohan, a debtor who owed ₹7,500, has been declared insolvent and nothing can be recovered. Write off the amount.',
    [['badDebts', 'Dr', 7500], ['debtor:Mohan', 'Cr', 7500]], ['sales', 'discountAllowed', 'cash'],
    'The loss is debited to Bad Debts A/c; Mohan\'s account, an asset, is credited.', [TYPE_HINT, SIDE_HINT]),
  je(32, 'je-losses-claims', 'complex', 'Goods costing ₹15,000, bought during the year, are destroyed by fire. The insurer admits a claim of ₹10,000. Pass one combined entry for the loss and the claim.',
    [['insuranceClaimReceivable', 'Dr', 10000], ['lossByFire', 'Dr', 5000], ['purchases', 'Cr', 15000]], ['stock', 'lossByTheft', 'cash', 'bank'],
    'The claim is an asset; the balance of ₹5,000 is a loss; Purchases A/c, where the goods were debited when bought, is credited with the whole cost. Stock A/c is not used.', [TYPE_HINT, 'Only the part not claimed is a loss.']),
  je(33, 'je-banking', 'medium', 'A cheque for ₹9,000 from Kiran, deposited into the bank, has been returned unpaid. Pass the entry.',
    [['debtor:Kiran', 'Dr', 9000], ['bank', 'Cr', 9000]], ['sales', 'badDebts', 'cash'],
    'Kiran owes again, so Kiran\'s account is debited; the bank balance falls, so Bank A/c is credited.', [TYPE_HINT, SIDE_HINT]),
  je(34, 'je-banking', 'easy', 'The bank credited ₹2,400 to the business account as interest. Pass the entry.',
    [['bank', 'Dr', 2400], ['interestReceived', 'Cr', 2400]], ['interestPaid', 'bankCharges', 'cash'],
    'Bank A/c increases and is debited; interest earned is an income, so Interest Received A/c is credited.', [TYPE_HINT, SIDE_HINT]),
  // Beyond the Class 11 syllabus, as question 17.
  beyondQuestion(je(35, 'je-adjustments', 'medium', 'Interest of ₹1,500 is charged to the owner on drawings. Pass the entry, charging it through the owner\'s Drawings A/c.',
    [['drawings', 'Dr', 1500], ['interestOnDrawings', 'Cr', 1500]], ['interestOnCapital', 'interestReceived', 'capital'],
    'The owner is charged, so Drawings A/c is debited; the business earns the interest, so Interest on Drawings A/c is credited.', ['Who earns this interest, and who bears it?', SIDE_HINT]), BEYOND_INTEREST_ON_DRAWINGS),
];

const NEW_RECALL = ['je-rules-which-debited', 'je-rules-which-credited', 'je-rules-side', 'je-rules-type', 'je-rules-accounts-affected', 'je-rules-debit-side', 'je-rules-credit-side', 'je-rules-type-adjusted'];
const RULES_AMOUNTS = ['je-rules-pair', 'je-rules-which-transaction', 'je-rules-capital-effect', 'je-rules-accounts-affected-compound', 'je-rules-gst-credit', 'je-rules-party-amount', 'je-rules-asset-cost', 'je-rules-discount-amount', 'je-rules-opening-count'];
const ADJUSTMENTS = ['je-outstanding-expense', 'je-prepaid-expense', 'je-accrued-income', 'je-income-advance', 'je-bad-debts-written-off', 'je-bad-debts-recovered', 'je-depreciation-charged', 'je-interest-capital', 'je-outstanding-amount'];
const GOODS_OTHERWISE = ['je-goods-personal', 'je-goods-charity', 'je-goods-samples', 'je-goods-staff-welfare', 'je-goods-staff-welfare-price'];
const LOSSES = ['je-loss-fire', 'je-loss-theft', 'je-loss-claim-full'];
const ASSETS_COMPOUND = ['je-asset-purchase-credit', 'je-asset-sale-credit', 'je-opening-entry', 'je-compound-expenses', 'je-compound-sale-part-cash', 'je-compound-capital-assets', 'je-advance-received', 'je-advance-paid'];
const BANKING = ['je-bank-charges', 'je-bank-interest-credited', 'je-cheque-received', 'je-cheque-deposited', 'je-cheque-dishonoured', 'je-salary-cheque', 'je-rent-received', 'je-commission-paid', 'je-carriage'];
const COMPLEX_ENTRIES = ['je-opening-entry-complex', 'je-loss-claim-partial', 'je-cheque-dishonoured-charges', 'je-asset-installation', 'je-asset-sale-gain-loss', 'je-advance-adjusted', 'je-compound-purchase-mixed', 'je-outstanding-paid', 'je-rent-received-advance', 'je-carriage-purchase'];
const HARD_MIX = ['je-opening-entry-complex', 'je-purchase-trade-cash', 'je-sale-trade-cash', 'je-commission-expenses', 'je-prepaid-amount', 'je-depreciation-amount', 'je-interest-capital-months', 'je-goods-cost-amount', 'je-rules-party-amount-purchase', 'je-rules-asset-cost-repairs', 'je-loss-claim-partial', 'je-bad-debts-partial'];

/** Authored questions asked at the start of a level: practice serves an authored question only once a level has listed it. */
const qids = (...ns: number[]): string[] => ns.map((n) => `je-q-${String(n).padStart(3, '0')}`);

const moreLevels: Level[] = [
  level(12, { type: 'card_revision', title: 'Adjustments and Special Entries', description: 'Recall the entries for adjustments, losses, assets, banking and compound entries.',
    cardIds: moreCards.map((c) => c.id) }),
  level(13, { type: 'rule_recognition', title: 'Rules at Speed', description: 'Name the account, its type and its side for simple transactions, and judge statements about the adjustment accounts.',
    questionIds: qids(11, 12, 13, 18), generate: { templateIds: NEW_RECALL, count: 8 } }),
  level(14, { type: 'method_recognition', title: 'Rules with Amounts', description: 'Pairs of accounts, types of entry, the amount that goes to a party\'s account and the amounts of simple adjustments.',
    questionIds: qids(14, 24, 25, 26, 27), generate: { templateIds: RULES_AMOUNTS, count: 9 } }),
  level(15, { type: 'medium_practice', title: 'Adjusting Entries', description: 'Outstanding and prepaid, accrued and advance, bad debts, depreciation and interest.',
    questionIds: qids(28, 29, 31), generate: { templateIds: ADJUSTMENTS, count: 10 } }),
  level(16, { type: 'easy_practice', title: 'Goods Used Otherwise Than for Sale', description: 'Goods taken by the owner, given to the staff, given as charity or distributed as free samples.',
    questionIds: qids(15, 16, 30, 48, 49), generate: { templateIds: GOODS_OTHERWISE, count: 6 } }),
  level(17, { type: 'medium_practice', title: 'Losses and Insurance Claims', description: 'Goods lost by fire or theft, with and without an insurance claim.',
    questionIds: qids(21, 32), generate: { templateIds: LOSSES, count: 6 } }),
  level(18, { type: 'medium_practice', title: 'Assets, Opening and Compound Entries', description: 'Assets bought and sold on credit, the opening entry, advances and entries with several lines.',
    questionIds: qids(19, 22), generate: { templateIds: ASSETS_COMPOUND, count: 8 } }),
  level(19, { type: 'medium_practice', title: 'Banking and Everyday Entries', description: 'Bank charges and interest, cheques, salary, rent, commission and carriage.',
    questionIds: qids(20, 23, 33, 34), generate: { templateIds: BANKING, count: 9 } }),
  level(20, { type: 'complex_practice', title: 'Complex Entries 2', description: 'Partial claims, dishonoured cheques with charges, assets sold at a gain or loss, and entries with several lines.',
    generate: { templateIds: COMPLEX_ENTRIES, count: 10 } }),
  level(21, { type: 'mixed_practice', title: 'Mixed Practice 2', description: 'Entries and rules from the whole second half of the topic, shuffled.',
    generate: { templateIds: [...NEW_RECALL, ...RULES_AMOUNTS, ...ADJUSTMENTS, ...GOODS_OTHERWISE, ...LOSSES, ...ASSETS_COMPOUND, ...BANKING], count: 12 } }),
  level(22, { type: 'challenge', title: 'Challenge: Adjustments and Discounts', description: 'Entries that need working out: discounts together, part-year interest and depreciation, claims and opening entries.',
    generate: { templateIds: HARD_MIX, count: 10 }, timerSecondsPerQuestion: 90 }),
];

/**
 * "Journalise the following transactions": several dated transactions of one business, one entry for each. These
 * levels come after every other one and have ids of their own, so the ids of the levels above never move.
 */
const setsLevels: Level[] = setLevels(T, levels.length + moreLevels.length, [
  { title: 'Journalise a Set of Transactions', description: 'One business, three to five dated transactions, one entry for each: a first week, cash and bank, credit, returns, expenses and drawings.',
    templateIds: ['je-set-first-week', 'je-set-cash-and-bank', 'je-set-credit', 'je-set-returns', 'je-set-expenses-drawings'], count: 3 },
  { title: 'Journalise a Longer Set of Transactions', description: 'Six to eight transactions of one month: trade discount and GST, an opening entry, cheques kept and banked, goods that leave without being sold.',
    templateIds: ['je-set-gst', 'je-set-opening-month', 'je-set-mixed-month'], count: 2 },
]);

// ---------------------------------------------------------------------------------------------------------------
// Added after the check against the CBSE 2025-26 syllabus: source documents and vouchers, and goods given to the
// staff for their welfare. The questions on vouchers stand on two levels of their own after every other level, with
// ids of their own, so no level a learner has passed moves.
// ---------------------------------------------------------------------------------------------------------------

const laterCards: Card[] = [
  card(28, 'je-vouchers', 'rule', 'Which accounting voucher does a transaction need?',
    'A debit voucher for money paid out, in cash or by cheque: it names the account debited. A credit voucher for money received, in cash or into the bank: it names the account credited. A transfer (journal) voucher for a transaction in which no cash or bank moves: a credit purchase or sale, depreciation, goods taken by the owner. Nothing at all for an order or an agreement, which is not yet a transaction.',
    'Each voucher is prepared from a source document (a cash memo, an invoice, a receipt, a cheque counterfoil, a pay-in-slip, a debit or credit note), numbered in order, and signed by the person who prepared it and the person who authorised it.',
    'Rent ₹8,000 paid by cheque: a debit voucher, Rent A/c debited, supported by the cheque counterfoil and the landlord\'s receipt. Goods sold on credit to Mohan ₹12,000: a transfer voucher, supported by the copy of the invoice.',
    'Preparing a credit voucher for a payment, or a cash voucher for a credit purchase in which no money moves.'),
  // Added in the quality pass: the rule behind the level "GST: Set-off and Payment".
  card(29, 'je-gst-settlement', 'rule', 'How are input tax set off and the balance of GST paid?',
    'At the end of the month the input tax is set off against the output tax of the same head: Output CGST A/c Dr; Output SGST A/c Dr; To Input CGST A/c; To Input SGST A/c (between states, Output IGST A/c Dr; To Input IGST A/c), each with the smaller of the two amounts. The output tax still left is paid: Output CGST A/c Dr; Output SGST A/c Dr; To Bank A/c.',
    'Input tax is an asset (a credit to be used) and output tax a liability (owed to the government). The set-off cancels one against the other head by head: CGST credit never pays SGST, nor SGST credit CGST. Input tax larger than the output tax of its head stays in the books and is carried forward.',
    'Output CGST ₹9,000, Input CGST ₹6,500; the same for SGST. Set-off: Output CGST A/c Dr ₹6,500; Output SGST A/c Dr ₹6,500; To Input CGST A/c ₹6,500; To Input SGST A/c ₹6,500. Payment: Output CGST A/c Dr ₹2,500; Output SGST A/c Dr ₹2,500; To Bank A/c ₹5,000.',
    'Debiting the input accounts and crediting the output accounts, setting input CGST against output SGST, or debiting a GST expense account with the tax paid.'),
];

/** A multiple-choice question with the mistake behind every wrong option, the right one at `correct`. */
const vmcq = (
  n: number, conceptId: string, difficulty: 'easy' | 'medium' | 'complex', prompt: string,
  options: [string, string | undefined][], correct: number, explanation: string, hints: string[],
): McqQuestion => ({
  ...base(n, conceptId, difficulty, hints), type: 'mcq', prompt,
  options: options.map(([text, why], i) => ({ id: 'abcdef'[i], text, ...(i === correct || why === undefined ? {} : { why }) })),
  correct: 'abcdef'[correct], explanation,
});
const AR = (a: string, r: string) => `Assertion (A): ${a} Reason (R): ${r}`;
const AR_TEXT = [
  'Both A and R are true, and R is the correct explanation of A',
  'Both A and R are true, but R is not the correct explanation of A',
  'A is true, but R is false',
  'A is false, but R is true',
];
const VOUCHER_HINTS = ['Does money go out, come in, or not move at all?', 'A source document is evidence from the transaction; a voucher is prepared from it.'];

const laterQuestions: Question[] = [
  vmcq(36, 'je-vouchers', 'easy', 'Which of these is a source document, and not an accounting voucher?', [
    ['A cash memo', undefined],
    ['A debit voucher', 'A debit voucher is prepared inside the business from a source document; it is not the source document itself.'],
    ['A transfer voucher', 'A transfer voucher is an accounting voucher, prepared from a source document such as an invoice.'],
    ['A credit voucher', 'A credit voucher is an accounting voucher, prepared from a source document such as a receipt.'],
  ], 0, 'A cash memo comes from the transaction itself (the sale). Debit, credit and transfer vouchers are prepared from such documents.', VOUCHER_HINTS),
  vmcq(37, 'je-vouchers', 'medium', AR('A transfer voucher is prepared for goods sold on credit.', 'In a credit sale no cash or bank changes hands.'), [
    [AR_TEXT[0], undefined],
    [AR_TEXT[1], 'Both statements are true, and the absence of cash is exactly why a transfer voucher is used, so R does explain A.'],
    [AR_TEXT[2], 'R is true: in a credit sale the customer pays later, so no money moves now.'],
    [AR_TEXT[3], 'A is true: a credit sale is a non-cash transaction, which is recorded on a transfer (journal) voucher.'],
  ], 0, 'A transfer voucher is for transactions in which no cash or bank moves, and a credit sale is one: R explains A.', VOUCHER_HINTS),
  vmcq(38, 'je-vouchers', 'medium', AR('An accountant may prepare a voucher without any source document when the amount is known.', 'Every accounting voucher must be supported by documentary evidence.'), [
    [AR_TEXT[0], 'A is false: a voucher without a source document cannot be checked, so it is never prepared.'],
    [AR_TEXT[1], 'A is false: a voucher always rests on a source document.'],
    [AR_TEXT[2], 'Took the two the wrong way round: R is the true statement and A is the false one.'],
    [AR_TEXT[3], undefined],
  ], 3, 'R is true: a voucher rests on a source document, which proves the transaction took place. So A, a voucher with no document behind it, is false.', VOUCHER_HINTS),
  tf(39, 'je-vouchers', 'easy', 'True or false: a debit voucher is prepared when the business pays rent by cheque.', true,
    'A debit voucher is prepared for every payment, whether it is made in cash or by cheque. It names Rent A/c, the account debited.', VOUCHER_HINTS),
  tf(40, 'je-vouchers', 'medium', 'True or false: a debit note and a debit voucher are the same document.', false,
    'A debit note is a source document that a buyer sends to a supplier when goods are returned. A debit voucher is an accounting voucher prepared for a payment of money.', VOUCHER_HINTS),
  tf(41, 'je-vouchers', 'easy', 'True or false: an order received from a customer is recorded on a credit voucher, because the customer will pay later.', false,
    'An order is not a transaction: nothing has been sold and nothing received. No voucher is prepared until the goods are supplied or money is received.', VOUCHER_HINTS),
  vmcq(42, 'je-vouchers', 'medium', 'The accountant of Sun Electricals finds that voucher No. 47 is missing: the file goes from No. 46 to No. 48. What does this show?', [
    ['Nothing: vouchers are numbered in no particular order', 'Vouchers are numbered one after another precisely so that a gap shows.'],
    ['A voucher may have been lost or removed, and it must be traced before the books are closed', undefined],
    ['Transaction No. 47 must have been a non-cash one, which needs no voucher', 'Non-cash transactions have transfer vouchers, numbered like the others.'],
    ['The bank has not yet cleared voucher No. 47', 'A voucher is an internal record and never goes to the bank.'],
  ], 1, 'Serial numbers make every voucher traceable: a gap means a voucher is missing, and the transaction behind it may have gone unrecorded.', VOUCHER_HINTS),
  vmcq(43, 'je-vouchers', 'medium', 'Rohan Traders pays ₹15,000 to Kiran, a supplier, by cheque. Which voucher is prepared, and what supports it?', [
    ['A credit voucher, supported by the pay-in-slip', 'Took a payment as a receipt, and used the document of a deposit into the bank.'],
    ['A transfer voucher, supported by Kiran\'s invoice', 'Thought paying a creditor involves no money; the invoice supported the purchase made earlier.'],
    ['A debit voucher, supported by the cheque counterfoil and Kiran\'s receipt', undefined],
    ['A debit voucher, supported by a debit note', 'A debit note goes with goods returned, not with a payment.'],
  ], 2, 'Money leaves the bank, so a debit voucher is prepared (Kiran debited, Bank credited). The cheque counterfoil and the receipt from Kiran are the evidence.', VOUCHER_HINTS),
  vmcq(44, 'je-vouchers', 'complex', 'Put these in the order in which they come: (i) posting to the ledger; (ii) the source document; (iii) the accounting voucher; (iv) the entry in the journal.', [
    ['(iii), (ii), (iv), (i)', 'Put the voucher before the document it is prepared from.'],
    ['(ii), (iv), (iii), (i)', 'Put the journal entry before the voucher; the entry is made from the voucher.'],
    ['(ii), (iii), (i), (iv)', 'Posted to the ledger before journalising; the ledger is written up from the book of original entry.'],
    ['(ii), (iii), (iv), (i)', undefined],
  ], 3, 'The transaction gives a source document; a voucher is prepared from it; the voucher is entered in the journal (or another book of original entry); the entry is posted to the ledger.', VOUCHER_HINTS),
  tf(45, 'je-vouchers', 'medium', 'True or false: the signature of the person who authorises a voucher guards against payments that were never approved.', true,
    'A voucher is recorded only once it is signed by the person who prepared it and by an officer with the authority to approve the transaction.', VOUCHER_HINTS),
  vmcq(46, 'je-vouchers', 'easy', 'Depreciation of ₹12,000 is charged on the machinery for the year. Which voucher records it?', [
    ['A debit voucher', 'Thought an expense always needs a debit voucher; a debit voucher is for money paid out, and none is paid here.'],
    ['A transfer (journal) voucher', undefined],
    ['A credit voucher', 'Thought the credit to Machinery A/c makes it a credit voucher; a credit voucher is for money received.'],
    ['A cash memo', 'A cash memo is a source document of a cash sale, not a voucher.'],
  ], 1, 'No cash or bank moves when depreciation is charged, so the entry (Depreciation A/c Dr; To Machinery A/c) is on a transfer voucher.', VOUCHER_HINTS),
  vmcq(47, 'je-vouchers', 'medium', 'A debit voucher for ₹8,000 shows "Debit: Repairs A/c". Which entry does it record?', [
    ['Cash A/c Dr ₹8,000; To Repairs A/c ₹8,000', 'Read the debit voucher as money received; it records money paid.'],
    ['Repairs A/c Dr ₹8,000; To the repairer\'s account ₹8,000', 'Took it as repairs done on credit; that would be on a transfer voucher, as no money moves.'],
    ['Cash A/c Dr ₹8,000; To Capital A/c ₹8,000', 'Took the voucher as the owner bringing in money.'],
    ['Repairs A/c Dr ₹8,000; To Cash (or Bank) A/c ₹8,000', undefined],
  ], 3, 'A debit voucher is a payment: the account it names (Repairs) is debited and Cash or Bank, whichever paid, is credited.', VOUCHER_HINTS),
  tf(48, 'je-goods-otherwise', 'easy', 'True or false: goods given to the employees as a festival gift are credited to Sales A/c at their selling price.', false,
    'Nothing is sold. Staff Welfare Expenses A/c is debited and Purchases A/c is credited, at the cost of the goods.', ['Is anything sold?', 'Goods leave Purchases at cost.']),
  je(49, 'je-goods-otherwise', 'easy', 'Goods costing ₹6,000 were given to the staff as a Diwali gift. Pass the entry. Ignore GST.',
    [['staffWelfare', 'Dr', 6000], ['purchases', 'Cr', 6000]], ['salaries', 'sales', 'drawings', 'charity'],
    'Goods given to the staff for their welfare are an expense: Staff Welfare Expenses A/c is debited. They leave without a sale, so Purchases A/c is credited at cost.', ['Is this a gift to the staff, to the owner or to charity?', SIDE_HINT]),
];

const vouchersLevels: Level[] = laterLevels(T, [...levels, ...moreLevels, ...setsLevels], [
  {
    name: 'vouchers',
    type: 'rule_recognition',
    title: 'Source Documents and Vouchers',
    description: 'Which document supports a transaction, what a voucher shows, and which voucher a transaction needs.',
    questionIds: qids(36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47),
    generate: { templateIds: ['je-voucher-source-doc', 'je-voucher-contents', 'je-voucher-kind'], count: 6 },
  },
  {
    name: 'vouchers-practice',
    type: 'medium_practice',
    title: 'Preparing Vouchers',
    description: 'The entry a voucher shows, the account it names, and the vouchers of a day counted and added up.',
    generate: { templateIds: ['je-voucher-kind', 'je-voucher-account', 'je-voucher-entry', 'je-voucher-total', 'je-voucher-count'], count: 8 },
  },
  // Added in the quality pass after the audit of Class 11: on no mock paper, worksheet or Look back level.
  {
    name: 'gst-set-off',
    type: 'medium_practice',
    title: 'GST: Set-off and Payment',
    description: 'Set off input tax against output tax, head by head, and pay the balance to the government.',
    generate: { templateIds: ['je-gst-set-off-intra', 'je-gst-set-off-igst', 'je-gst-payment'], count: 8 },
  },
  {
    name: 'discounts-and-gst-assets',
    type: 'complex_practice',
    title: 'Discounts on One Deal, and Assets with GST',
    description: 'Trade and cash discount on a deal settled partly at once, and an asset bought with GST.',
    generate: { templateIds: ['je-purchase-trade-cash-immediate', 'je-sale-trade-cash-immediate', 'je-asset-gst'], count: 6 },
  },
  {
    name: 'assertion-reason',
    type: 'medium_practice',
    title: 'Assertion and Reason',
    description: 'Two statements on this topic: decide whether each is true, and whether the Reason explains the Assertion.',
    generate: { templateIds: ['je-assertion-reason'], count: 8 },
  },
]);

export const JOURNAL_ENTRIES: TopicPack = {
  topicId: T,
  concepts,
  cards: [...cards, ...moreCards, ...laterCards],
  levels: [...levels, ...moreLevels, ...setsLevels, ...vouchersLevels],
  questions: [...questions, ...moreQuestions, ...laterQuestions],
};
