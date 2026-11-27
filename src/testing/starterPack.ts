// The small journal-entries pack the app started with, frozen as a fixture: tests of the learning rules use it so
// they do not change when the real question bank grows. It is not registered and never reaches a learner.
import type { Card, Concept, Level, McqQuestion, TopicPack } from '@/content/types';

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
    'Mohan now owes the business, so he is a debtor: an asset that increases.', ['No cash is received yet. Who owes the business?', SIDE_HINT]),
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
      { type: 'check', questionId: 'je-q-001' },
    ],
  }),
  level(1, { type: 'card_revision', title: 'Rules and Format', description: 'Recall the rules of debit and credit before using them.',
    cardIds: cards.map((c) => c.id) }),
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

export const STARTER_PACK: TopicPack = { topicId: T, concepts, cards, levels, questions };
