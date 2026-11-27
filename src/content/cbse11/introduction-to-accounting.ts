import { rupees } from '@/engine/money';
import { buildLadder, laterLevels } from '../ladder';
import type { Card, Concept, Difficulty, McqQuestion, NumericQuestion, Question, TopicPack, TrueFalseQuestion } from '../types';

const T = 'introduction-to-accounting';

const concepts: Concept[] = [
  { id: 'ia-meaning', topicId: T, title: 'Meaning, objectives and branches of accounting' },
  { id: 'ia-process', topicId: T, title: 'The accounting process' },
  { id: 'ia-users', topicId: T, title: 'Users of accounting information and what they need' },
  { id: 'ia-qualities', topicId: T, title: 'Qualitative characteristics of accounting information' },
  { id: 'ia-advantages', topicId: T, title: 'Role, advantages and limitations of accounting' },
  { id: 'ia-assets-liabilities', topicId: T, title: 'Assets, liabilities, capital and drawings' },
  { id: 'ia-income-expense', topicId: T, title: 'Revenue, expense, expenditure, profit, gain and loss' },
  { id: 'ia-trade-terms', topicId: T, title: 'Trade terms: transaction, goods, stock, debtors, creditors, discount' },
];

// ---------------------------------------------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------------------------------------------

let cardNo = 0;
const card = (
  conceptId: string,
  kind: Card['kind'],
  prompt: string,
  answer: string,
  explanation: string,
  example: string,
  commonMistake: string,
): Card => ({ id: `ia-card-${++cardNo}`, topicId: T, conceptId, kind, prompt, answer, explanation, example, commonMistake });

const cards: Card[] = [
  card('ia-meaning', 'rule', 'What is accounting?',
    'The process of identifying, measuring, recording, classifying, summarising, analysing, interpreting and communicating financial information so that its users can take decisions.',
    'Accounting turns the day-to-day dealings of a business into reports that owners, lenders and others can use. It deals only with what can be stated in money. The shortest textbook definition names four of these steps (identifying, measuring, recording and communicating); the fuller list spells out the work that lies between recording and communicating.',
    'A shop sells goods for ₹2,000 on credit. The sale is picked out, valued at ₹2,000, entered in the books, grouped under Sales and the customer\'s account, included in the year-end statements, compared with last year and reported to the owner.',
    'Thinking accounting is only writing entries in the books. That recording work is book-keeping.'),
  card('ia-meaning', 'rule', 'How do book-keeping, accounting and accountancy differ?',
    'Book-keeping records transactions and keeps the books. Accounting goes further: it summarises, analyses, interprets and communicates the records. Accountancy is the body of principles and rules on which both rest.',
    'The three words name three different things: the clerical work, the use of the records, and the knowledge behind them.',
    'A clerk who writes the journal does book-keeping. The accountant who prepares the profit statement and explains it does accounting. The textbook that teaches the rules is accountancy.',
    'Using the three words as if they meant the same thing.'),
  card('ia-process', 'shortcut', 'How can you remember the eight steps of the accounting process?',
    'Identify, Measure, Record, Classify, Summarise, Analyse, Interpret, Communicate: I-M-R-C-S-A-I-C.',
    'The first four deal with single transactions. Summarising makes the statements. The last three turn the figures into understanding and pass it on.',
    'Sale to Mehta for ₹5,000: identified as a transaction, measured at ₹5,000, recorded in the journal, classified in Sales and Mehta\'s accounts, summarised in the statements, analysed against last year, interpreted for the owner and communicated in the annual report.',
    'Putting summarising before classifying, or interpreting before analysing.'),
  card('ia-meaning', 'rule', 'What are the three branches of accounting?',
    'Financial accounting records transactions and prepares statements of profit and position for owners and outsiders. Cost accounting finds and controls the cost of products and services. Management accounting uses accounting information to help managers plan, control and decide.',
    'Each branch serves a different purpose, though they use the same underlying records.',
    'Preparing the profit and loss account for the bank is financial accounting. Working out that a school bag costs ₹180 to make is cost accounting. A budget that helps decide whether to drop a product is management accounting.',
    'Listing book-keeping as a branch. It is the recording work that all the branches depend on.'),
  card('ia-meaning', 'rule', 'What are the objectives of accounting?',
    'To keep systematic records; to find the profit or loss of a period; to show the financial position on a date; and to give information to the people who need it.',
    'Records come first. The profit and the position are worked out from them, and the information is then passed to users.',
    'A year-end set of statements shows the profit and the position. The books behind it are the records. Sending the statements to the bank gives it information.',
    'Listing "to increase profit" as an objective. Accounting reports results; it does not create them.'),
  card('ia-users', 'rule', 'Who are the internal and the external users of accounting information?',
    'Internal users own or manage the business: the owner and the managers. External users stand outside it: investors, lenders, suppliers, customers, tax authorities, government agencies and researchers.',
    'The test is simple: does the user own or manage the business, or only deal with it from outside? Textbooks do not agree on where employees belong, so learn what employees want to know (wages, bonus, job security) rather than a label for them.',
    'The proprietor reading the monthly profit is an internal user. A bank reading the balance sheet before renewing a loan is an external user.',
    'Treating the bank as an internal user because the business owes it money.'),
  card('ia-users', 'rule', 'What does each user mainly want to know?',
    'Owner: profit and capital. Managers: costs, sales and cash, to plan and control. Investors: profitability and safety of their money. Lenders: ability to pay interest and repay. Suppliers: ability to pay for goods on credit. Customers: stability and continued supply. Employees: wages, bonus and job security. Tax authorities: correct income and tax. Government: statistics and policy.',
    'Each user takes a different decision, so each reads different parts of the same information.',
    'A supplier deciding whether to sell on 60 days\' credit looks at the firm\'s debts and cash, not at its sales by region.',
    'Giving every user the same interest, "profit".'),
  card('ia-qualities', 'rule', 'What are the qualitative characteristics of accounting information?',
    'Reliability: free from error and bias, backed by evidence. Relevance: able to affect decisions and available in time. Understandability: users can follow it. Comparability: it can be compared across years and between firms.',
    'These four make information worth using. Figures that fail any of them lose some of their value.',
    'Changing the stock valuation method every year weakens comparability. A report that reaches the manager three months late weakens relevance.',
    'Calling a figure relevant because it is accurate, when it arrives too late to help any decision.'),
  card('ia-advantages', 'rule', 'What are the advantages of accounting?',
    'Systematic records replace memory; profit and position can be found; results can be compared across years; accounts can serve as evidence; tax can be assessed; the business can be valued or sold; users get information for decisions.',
    'Accounting does not make profit. It records and reports what the business has done, so that people can act on it.',
    'A trader who cannot recall what a customer owes looks it up in the books.',
    'Believing accounting itself earns a profit or removes tax.'),
  card('ia-advantages', 'rule', 'What are the limitations of accounting?',
    'It records only what can be measured in money; it shows historical cost, not current value; it depends on estimates and judgement; it may not be free from personal bias.',
    'These limits are why accounting figures should be read with care and not treated as the whole truth about a business.',
    'A skilled and loyal workforce adds value to a firm but appears nowhere in its books.',
    'Thinking accounting figures are exact and final.'),
  card('ia-assets-liabilities', 'rule', 'How are assets classified?',
    'Non-current assets are kept for use over many years: tangible (land, building, machinery, furniture) and intangible (goodwill, patents, trademarks). Current assets are cash or turn into cash within a year: cash, bank balance, debtors, bills receivable and stock.',
    'The test is how long the asset stays in the business and whether it can be touched.',
    'A bakery\'s oven is a tangible non-current asset; its unsold bread is a current asset; the goodwill it paid for is an intangible non-current asset.',
    'Calling goods held for sale a non-current asset because the shop always keeps some stock.'),
  card('ia-assets-liabilities', 'rule', 'How are liabilities classified?',
    'Current liabilities are due within a year: creditors, bills payable, bank overdraft, outstanding expenses. Non-current liabilities are due after more than a year: long-term loans. The time is counted from the balance sheet date.',
    'A liability is what the business owes to an outsider; the only question is when it has to be paid. Capital is owed too, but to the owner: it is called an internal liability and is always shown apart from these liabilities to outsiders.',
    'A loan due nine months after 31 March is a current liability, even if it was taken for ten years.',
    'Judging by the original term of the loan instead of the time left to the due date.'),
  card('ia-assets-liabilities', 'formula', 'How is capital found from assets and liabilities?',
    'Capital = Assets - Liabilities.',
    'What the business owns, less what it owes to outsiders, is what belongs to the owner.',
    'Assets ₹6,00,000 less liabilities ₹2,00,000 gives capital ₹4,00,000.',
    'Adding the liabilities to the assets, or forgetting to deduct them.'),
  card('ia-assets-liabilities', 'rule', 'What are drawings?',
    'Cash or goods taken out of the business by the owner for personal use. Drawings reduce capital and are not an expense of the business.',
    'The business and its owner are separate. What the owner takes out is a withdrawal of capital, not a cost of earning revenue.',
    'The owner takes ₹3,000 from the cash box for household use: drawings of ₹3,000, and the owner\'s capital falls by ₹3,000.',
    'Treating the owner\'s personal withdrawal as a salary or other expense.'),
  card('ia-income-expense', 'rule', 'Capital or revenue: how do I decide?',
    'Capital expenditure buys or improves a long-lasting asset, including the cost of getting it ready for use. Revenue expenditure is a running cost whose benefit is used up within the year. Capital receipts come from the owner, from loans or from the sale of an asset. Revenue receipts come from the regular activity of the business.',
    'Ask whether the money affects something that lasts for years or the day-to-day trading of the year.',
    'A truck for ₹8,00,000 is capital expenditure; its fuel is revenue expenditure. The sale of the old truck is a capital receipt; freight earned is a revenue receipt.',
    'Calling wages paid for building the firm\'s own godown revenue expenditure because wages are usually revenue.'),
  card('ia-income-expense', 'formula', 'How are profit, loss and gain defined?',
    'Profit = Revenue - Expenses, when revenue is larger. Loss = Expenses - Revenue, when expenses are larger. A gain is a profit from an incidental event, such as selling an old asset for more than its value in the books.',
    'Profit and loss are the result of the regular work of the business. A gain or a loss on an asset arises from an event on the side.',
    'Revenue ₹3,00,000 and expenses ₹2,60,000 give a profit of ₹40,000. An old machine sold ₹2,000 above its book value gives a gain of ₹2,000.',
    'Calling the whole sale price of the old machine a gain, instead of only the excess over its book value.'),
  card('ia-trade-terms', 'rule', 'Goods or asset: how do I decide?',
    'Ask what the business does with the item. Bought to resell: goods, recorded in Purchases. Bought to use for years: non-current asset. Used up in daily work: expense. Taken by the owner: drawings.',
    'The same thing can be goods for one business and an asset for another. The purpose decides.',
    'A car bought by a car dealer to sell is goods. A car bought by a grocer to deliver orders is a non-current asset.',
    'Deciding by what the item is rather than by why the business bought it.'),
  card('ia-trade-terms', 'formula', 'How do trade discount and cash discount work?',
    'Trade discount is taken off the list price and is not recorded: net price = list price - trade discount. Cash discount is for prompt payment, is worked on the amount payable after trade discount, and is recorded (discount allowed by the seller, discount received by the buyer).',
    'Trade discount fixes the price. Cash discount is a real concession given for settling early.',
    'List price ₹20,000 with 10% trade discount gives ₹18,000. A 2% cash discount on ₹18,000 is ₹360, so the buyer pays ₹17,640.',
    'Working the cash discount on the list price.'),
  card('ia-trade-terms', 'rule', 'What are debtors, creditors, bills receivable and bills payable?',
    'Debtors owe the business for goods sold on credit; bills receivable are bills accepted by customers. Together they are trade receivables. Creditors are owed by the business for goods bought on credit; bills payable are bills accepted by the business. Together they are trade payables.',
    'A bill of exchange is a written promise to pay on a fixed date. Whether it is receivable or payable depends on whose promise it is.',
    'Mehta owes the firm ₹10,000 on account and has accepted a bill for ₹5,000: trade receivables are ₹15,000.',
    'Including a bank loan in trade payables. A loan is borrowing, not a debt for goods.'),
  card('ia-trade-terms', 'formula', 'How is closing stock worked out from units?',
    'Units left = opening units + units bought - units sold. Closing stock at cost = units left x cost per unit.',
    'Stock is valued at what it cost, not at the higher price it is expected to fetch. (Only if its market value has fallen below cost is the lower figure taken.)',
    'Opening 100 units, bought 400, sold 350, cost ₹60 each: 150 units left, so closing stock = 150 x ₹60 = ₹9,000.',
    'Valuing the stock at selling price, or leaving out the opening stock.'),
  card('ia-trade-terms', 'rule', 'Transaction or event?',
    'A transaction is an exchange of value that can be measured in money and changes assets, liabilities or capital. An enquiry, a decision, an order not yet delivered or a promise for the future is an event that is not yet recorded.',
    'Nothing is recorded until value has actually been given or received.',
    'Buying goods on credit is a transaction. Placing an order for goods that have not arrived is not.',
    'Recording an order as a purchase on the day it is placed.'),
  // Added after the check against the CBSE 2025-26 syllabus (docs/syllabus-coverage.md): accounting as a source of
  // information and its role in business, the types of accounting information, and source documents and vouchers.
  // New cards go at the end, so that the ids of the cards before them do not change.
  card('ia-advantages', 'rule', 'Why is accounting called a source of information, and what is its role in a business?',
    'Accounting works as an information system: it takes in the business\'s transactions, processes them (records, classifies, summarises) and gives out reports that people use for decisions. In a business it keeps the memory of every dealing, measures profit and position, helps managers plan and control, shows owners and lenders how their money is used, and gives the figures that tax and other laws require.',
    'This is why accounting is called the language of business: it turns many separate transactions into information that its users can read.',
    'A shop\'s sales, purchases and expenses go in as data; the profit for the year and the list of what it owns and owes come out as information for the owner and the bank.',
    'Thinking accounting only writes up the books; recording is the first part, and its purpose is the information that comes out of it.'),
  card('ia-users', 'rule', 'What types of accounting information does a business give out?',
    'Three types: (1) information about profit or loss, that is, revenues and expenses (the profit and loss account); (2) information about the financial position, that is, assets, liabilities and capital (the balance sheet); (3) information about the flow of cash in and out of the business.',
    'Different users lean on different types: an owner on the profit, a lender on the position and the cash, a supplier on the cash available to pay.',
    'A bank deciding on a loan looks at the balance sheet (position) and at the flow of cash (ability to repay).',
    'Treating the profit as the only information accounting gives; the position and the cash flows are reported too.'),
  card('ia-trade-terms', 'rule', 'What is the difference between a source document and an accounting voucher, and how is a voucher prepared?',
    'A source document (also called a supporting voucher) is the original evidence of a transaction: a cash memo, an invoice or bill, a receipt, a pay-in slip, a cheque counterfoil, a debit or credit note. An accounting voucher is prepared from one or more source documents and shows the entry to be made. Kinds: cash vouchers (a debit voucher for cash paid, a credit voucher for cash received) and non-cash or transfer (journal) vouchers. A voucher states the name of the firm, its number and date, the account(s) debited and credited with the amounts, a short narration, and the signatures of the person who prepared it and the person who authorised it.',
    'The source document proves that the transaction took place; the voucher, built from it, tells the accountant how to record it.',
    'Rent of ₹10,000 paid in cash: the landlord\'s receipt is the source document; a debit voucher is prepared showing Rent A/c Dr ₹10,000; To Cash A/c ₹10,000, with the date, a number and the signatures.',
    'Treating the source document and the voucher as the same paper, or preparing a voucher with no source document behind it. The source document is also called a supporting voucher; the accounting voucher is the one prepared from it.'),
];

// ---------------------------------------------------------------------------------------------------------------
// Authored questions
// ---------------------------------------------------------------------------------------------------------------

const HINTS: Record<string, string[]> = {
  'ia-meaning': ['Think about what the word covers: only recording, or the whole path up to reporting?', 'Book-keeping records; accounting uses the records; accountancy is the theory; the three branches are financial, cost and management.'],
  'ia-process': ['Picture the path of one transaction from the day it happens to the report that reaches a user.', 'Identify, measure, record, classify, summarise, analyse, interpret, communicate.'],
  'ia-users': ['Ask whether the user owns or runs the business, and what decision that user has to take.', 'Owners and managers are internal; lenders, investors, suppliers, customers, tax and government bodies are external.'],
  'ia-qualities': ['Ask what is wrong with, or good about, the information: can it be trusted, does it help a decision, can it be followed, can it be compared?', 'Reliability, relevance, understandability and comparability.'],
  'ia-advantages': ['Is the point something accounting does well, or something it cannot do?', 'Advantages: records, results, comparison, evidence, tax, sale of business. Limitations: money only, cost not value, estimates, bias.'],
  'ia-assets-liabilities': ['Decide whether the business owns it, owes it, or the owner put it in, and how long it stays.', 'Assets are owned; liabilities are owed to outsiders; capital is the owner\'s investment; drawings are the owner\'s withdrawals.'],
  'ia-income-expense': ['Ask whether money is going out or coming in, and whether it concerns a lasting asset or the year\'s trading.', 'Capital items concern assets, the owner or borrowings; revenue items concern the year\'s regular trading.'],
  'ia-trade-terms': ['Recall the definition of the term and test the situation against it.', 'Trade discount is not recorded; cash discount is. Debtors owe the business; creditors are owed by it.'],
};

let qNo = 0;
const nextId = (): string => `ia-q-${String(++qNo).padStart(3, '0')}`;

/** A multiple-choice question; the right option's place is spread over a, b, c and d by the question's number. */
function mcq(
  conceptId: string,
  difficulty: Difficulty,
  prompt: string,
  correct: string,
  wrong: [string, string][],
  explanation: string,
  hints?: string[],
): McqQuestion {
  const id = nextId();
  const pos = (qNo * 5 + Math.floor(qNo / 4)) % (wrong.length + 1);
  const entries: { text: string; why?: string }[] = wrong.map(([text, why]) => ({ text, why }));
  entries.splice(pos, 0, { text: correct });
  const options = entries.map((o, i) => ({ id: 'abcdefgh'[i], text: o.text, ...(o.why === undefined ? {} : { why: o.why }) }));
  return { id, topicId: T, conceptId, difficulty, type: 'mcq', prompt, options, correct: 'abcdefgh'[pos], explanation, hints: hints ?? HINTS[conceptId] };
}

const tf = (conceptId: string, difficulty: Difficulty, prompt: string, correct: boolean, explanation: string): TrueFalseQuestion => ({
  id: nextId(),
  topicId: T,
  conceptId,
  difficulty,
  type: 'true_false',
  prompt: `True or false: ${prompt}`,
  correct,
  explanation,
  hints: HINTS[conceptId],
});

const AR_OPTIONS = [
  'Both A and R are true, and R is the correct explanation of A',
  'Both A and R are true, but R is not the correct explanation of A',
  'A is true, but R is false',
  'A is false, but R is true',
];
const AR_WHY = [
  'Took both statements as true and R as the explanation without testing each statement and the link between them.',
  'Took both statements as true but R as no explanation, without testing the link between them.',
  'Took A as true and R as false without testing R.',
  'Took A as false and R as true without testing A.',
];

/** An assertion-and-reason item written as multiple choice with the four standard options. */
function ar(conceptId: string, difficulty: Difficulty, assertion: string, reason: string, answer: 'A' | 'B' | 'C' | 'D', explanation: string): McqQuestion {
  const right = 'ABCD'.indexOf(answer);
  return {
    id: nextId(),
    topicId: T,
    conceptId,
    difficulty,
    type: 'mcq',
    prompt: `Assertion (A): ${assertion} Reason (R): ${reason}`,
    options: AR_OPTIONS.map((text, i) => ({ id: 'abcd'[i], text, ...(i === right ? {} : { why: AR_WHY[i] }) })),
    correct: 'abcd'[right],
    explanation,
    hints: HINTS[conceptId],
  };
}

function num(
  conceptId: string,
  difficulty: Difficulty,
  prompt: string,
  answerRupees: number,
  errors: [number, string][],
  working: string[],
): NumericQuestion {
  return {
    id: nextId(),
    topicId: T,
    conceptId,
    difficulty,
    type: 'numeric',
    unit: 'rupees',
    prompt,
    answer: rupees(answerRupees),
    commonErrors: errors.map(([value, why]) => ({ value: rupees(value), why })),
    working,
    explanation: working.join(' '),
    hints: HINTS[conceptId],
  };
}

// Two easy questions that the opening lesson uses for its checks (they are served nowhere else).
const checkOne = mcq('ia-meaning', 'easy',
  'The work of recording transactions in the books of account, such as the journal and the ledger, is called:',
  'Book-keeping',
  [
    ['Accounting', 'Took the whole process for just the recording part; accounting also summarises, analyses and communicates.'],
    ['Accountancy', 'Accountancy is the body of principles and rules, not the clerical work of keeping the books.'],
    ['Auditing', 'Auditing is an independent check of the books, not the keeping of them.'],
  ],
  'Recording and keeping the books is book-keeping. Accounting goes further, accountancy is the body of rules, and auditing is the checking.');

const checkTwo = mcq('ia-assets-liabilities', 'easy',
  'Which of the following is a current asset?',
  'Debtors',
  [
    ['Furniture', 'Furniture is kept in use for many years, so it is a non-current asset.'],
    ['Goodwill', 'Goodwill is a long-term intangible asset, not something turned into cash within the year.'],
    ['Bank loan', 'A bank loan is something the business owes, so it is a liability and not an asset.'],
  ],
  'Debtors are amounts customers owe, expected to be collected within the year, so they are a current asset.');

const meaning: Question[] = [
  mcq('ia-meaning', 'easy', 'Which of the following describes accounting most completely?',
    'Identifying, measuring, recording, classifying, summarising, analysing, interpreting and communicating financial information to those who need it',
    [
      ['Writing the day\'s transactions in the books and nothing more', 'That is book-keeping, the recording part of the work only.'],
      ['Checking the books of a firm by an independent professional', 'That is auditing, not accounting.'],
      ['Working out the income tax payable by the owner', 'Took one use of accounting information (tax) for accounting itself.'],
    ],
    'Accounting covers the whole path from picking out transactions to passing information to users. Book-keeping is only the recording part.'),
  mcq('ia-meaning', 'easy', 'Which one is NOT a branch of accounting?',
    'Book-keeping',
    [
      ['Financial accounting', 'This is one of the three branches.'],
      ['Cost accounting', 'This is one of the three branches.'],
      ['Management accounting', 'This is one of the three branches.'],
    ],
    'The branches are financial, cost and management accounting. Book-keeping is the recording work on which they all depend, not a branch.'),
  mcq('ia-meaning', 'easy', 'Which one is NOT an objective of accounting?',
    'To increase the sales of the business',
    [
      ['To keep systematic records of transactions', 'This is an objective: records are the first purpose of accounting.'],
      ['To find the profit or loss of a period', 'This is an objective: accounting works out the result of trading.'],
      ['To show the financial position of the business', 'This is an objective: the balance sheet shows what the business owns and owes.'],
    ],
    'Accounting reports and records; it does not itself increase sales.'),
  tf('ia-meaning', 'easy', 'Book-keeping and accounting mean exactly the same thing.', false,
    'Book-keeping is the recording of transactions. Accounting also summarises, analyses, interprets and communicates the records.'),
  tf('ia-meaning', 'easy', 'Accounting records only those dealings that can be expressed in money.', true,
    'A dealing enters the books only if it has a money value, which is why the skill of the staff, for example, is not recorded.'),
  mcq('ia-meaning', 'medium', 'Which of these belongs to accounting but not to book-keeping?',
    'Explaining to the owner why this year\'s profit fell',
    [
      ['Writing each credit sale in the sales book', 'Recording a sale is book-keeping.'],
      ['Posting journal entries to the ledger accounts', 'Posting is part of the recording work of book-keeping.'],
      ['Entering a cash payment in the cash book', 'Entering a payment in a book is book-keeping.'],
    ],
    'Interpreting the figures and communicating what they mean goes beyond recording, so it is accounting.'),
  mcq('ia-meaning', 'medium', 'Which statement about financial accounting and management accounting is correct?',
    'Financial accounting reports results and position to owners and outsiders; management accounting supplies information to help managers plan and control',
    [
      ['Financial accounting is meant only for the managers, and management accounting only for the tax authorities', 'Reversed the users: financial accounting serves owners and outsiders, management accounting serves managers.'],
      ['Management accounting records every transaction in the journal, which financial accounting does not', 'Gave the recording of transactions to the wrong branch; financial accounting depends on it.'],
      ['Both are prepared only when the law requires an audit', 'Neither depends on an audit; both are kept to serve users.'],
    ],
    'Financial accounting looks back and reports the results and the position. Management accounting supplies managers with information to plan, control and decide.'),
  ar('ia-meaning', 'medium', 'Accounting is often called the language of business.', 'It communicates the financial affairs of a business to the people who need to know them.', 'A',
    'Both are true, and R explains A: like a language, accounting carries information from the business to those who use it.'),
  ar('ia-meaning', 'complex', 'Cost accounting is a branch of financial accounting.', 'Cost accounting is concerned with finding and controlling the cost of products and services.', 'D',
    'A is false: cost accounting is a branch in its own right, next to financial and management accounting. R is a true description of it.'),
  mcq('ia-meaning', 'complex',
    'In a firm a clerk writes the transactions in the journal, an accountant prepares the final statements and tells the owner what they mean, and an independent chartered accountant examines whether the statements can be relied on. In order, these are:',
    'Book-keeping, accounting, auditing',
    [
      ['Accounting, book-keeping, auditing', 'Swapped the first two: writing in the journal is recording, and preparing and explaining statements is accounting.'],
      ['Book-keeping, auditing, accounting', 'Swapped the last two: explaining the statements is accounting; examining them independently is auditing.'],
      ['Auditing, accounting, book-keeping', 'Reversed the order: the clerk\'s recording is book-keeping and the outside check is auditing.'],
    ],
    'Recording is book-keeping, preparing and explaining statements is accounting, and the independent examination is auditing.'),
];

const process: Question[] = [
  // Not "how many steps are there": textbooks count four, six or eight, so a count has no single right answer.
  mcq('ia-process', 'easy', 'Putting a value in rupees on a transaction, before it is entered in the books, is the step of:',
    'Measuring',
    [
      ['Identifying', 'Identifying is picking out the events that are business transactions; giving one of them a money value is measuring.'],
      ['Recording', 'Recording is entering the transaction in the books of original entry, which is done after it has been valued.'],
      ['Summarising', 'Summarising is preparing the trial balance and the statements from the ledger balances, much later in the process.'],
    ],
    'A transaction can be entered in the books only in terms of money, so it is first measured: given a value in rupees.'),
  mcq('ia-process', 'easy', 'Giving the final statements to the owner, the bank and the tax authorities is the step of:',
    'Communicating',
    [
      ['Interpreting', 'Interpreting is explaining what the figures mean; handing them over is communicating.'],
      ['Summarising', 'Summarising is preparing the statements, not delivering them.'],
      ['Recording', 'Recording is entering transactions in the books of original entry.'],
    ],
    'Passing the information on to its users is the last step, communicating.'),
  mcq('ia-process', 'easy', 'Posting entries from the journal to ledger accounts belongs to the step of:',
    'Classifying',
    [
      ['Recording', 'Recording is writing the entries in the journal; posting groups them under accounts.'],
      ['Summarising', 'Summarising comes later, when the balances are put into a trial balance and statements.'],
      ['Measuring', 'Measuring is putting a money value on a transaction, which happens before it is recorded.'],
    ],
    'Collecting similar entries under one account is classifying.'),
  tf('ia-process', 'medium', 'In the accounting process, interpreting comes before analysing.', false,
    'The figures are first analysed, by comparing and relating them, and only then interpreted, by explaining what they mean.'),
  ar('ia-process', 'medium', 'Identifying is the first step of the accounting process.',
    'Only events that are business transactions have to be accounted for, so they must be picked out first.', 'A',
    'Both are true, and R explains A: before anything is measured or recorded, the transactions that matter must be picked out.'),
  mcq('ia-process', 'complex',
    'Put these in the order in which they happen: (i) preparing the trial balance, (ii) posting to the ledger, (iii) writing the journal, (iv) preparing the financial statements.',
    '(iii), (ii), (i), (iv)',
    [
      ['(ii), (iii), (i), (iv)', 'Posted to the ledger before the journal was written; the journal is the first record.'],
      ['(iii), (i), (ii), (iv)', 'Prepared the trial balance before posting; its balances come from the ledger.'],
      ['(iii), (ii), (iv), (i)', 'Prepared the statements before the trial balance; the trial balance is made first.'],
    ],
    'The journal is written first, the entries are posted to the ledger, the trial balance is prepared from the ledger, and the statements follow.'),
];

const users: Question[] = [
  mcq('ia-users', 'easy', 'Which of the following is an internal user of accounting information?',
    'The owner of the business',
    [
      ['A bank that has lent money to the business', 'The bank stands outside the business, so it is an external user.'],
      ['The income-tax authorities', 'The tax authorities are outside the business: external users.'],
      ['A supplier of goods', 'A supplier deals with the business from outside: an external user.'],
    ],
    'Owners and managers own or run the business, so they are the internal users.'),
  mcq('ia-users', 'easy', 'A bank that has lent money to a firm mainly wants to know whether the firm:',
    'Can pay interest regularly and repay the loan on time',
    [
      ['Is selling more of every product in every region', 'That is the interest of the sales manager, not of the lender.'],
      ['Has charged the correct GST on its sales', 'That is the concern of the tax authorities.'],
      ['Pays its staff a bonus every year', 'That is the concern of the employees.'],
    ],
    'A lender cares about repayment: interest on time and the loan when it falls due.'),
  mcq('ia-users', 'easy', 'Which user needs the accounts to check whether income tax and GST have been correctly worked out?',
    'The tax authorities',
    [
      ['Suppliers', 'Suppliers want to know whether they will be paid for goods sold on credit.'],
      ['Customers', 'Customers want to know whether the firm will keep supplying goods.'],
      ['Employees', 'Employees want to know about wages, bonus and the security of their jobs.'],
    ],
    'Assessing tax needs the correct income and sales figures, so the tax authorities read the accounts for that purpose.'),
  tf('ia-users', 'easy', 'The managers of a business are external users of its accounting information.', false,
    'Managers run the business, so they are internal users.'),
  mcq('ia-users', 'medium', 'A person thinking of putting money into a business will mainly look at its accounts to know:',
    'Whether it is profitable and how safe the money put in would be',
    [
      ['How much it costs to make each unit, so that prices can be fixed', 'That is a manager\'s interest in costs.'],
      ['Whether tax has been paid correctly', 'That is the interest of the tax authorities.'],
      ['Whether it will keep supplying goods under warranty', 'That is the interest of a customer.'],
    ],
    'An investor wants to know how profitable the business is and how safe the money put into it would be.'),
  mcq('ia-users', 'medium', 'Why do different users want different parts of the accounting information?',
    'Each user has a different decision to take',
    [
      ['Accounting is written in a different language for each user', 'Accounting uses one set of records; users differ in what they look for, not in language.'],
      ['The law lets each user see only one statement', 'No such rule exists; users differ in their needs.'],
      ['Only some users are able to read figures', 'Ability to read figures is not the reason; the needs differ.'],
    ],
    'A lender decides whether to lend, an owner whether to expand, a supplier whether to sell on credit: each looks at what bears on that decision.'),
  ar('ia-users', 'medium', 'The owner of a business is an internal user of its accounting information.',
    'The owner owns the business and needs its accounts to take decisions about it.', 'A',
    'Both are true, and R explains A: owning and deciding about the business is what makes the owner an internal user.'),
  mcq('ia-users', 'easy', 'Employees of a firm are interested in its accounts mainly to know whether:',
    'The firm can go on paying wages and a bonus and keep their jobs secure',
    [
      ['The firm has paid its income tax correctly', 'That is the concern of the tax authorities.'],
      ['The firm will pay its suppliers within the credit period', 'That is the concern of the suppliers.'],
      ['The firm will give them a share in its ownership', 'Employees are paid for their work; they do not own the firm by being employed.'],
    ],
    'Employees want to know that wages and bonus will keep being paid and that their jobs are safe.'),
  mcq('ia-users', 'medium', 'Which of the following is NOT an external user of accounting information?',
    'The general manager of the firm',
    [
      ['A supplier who sells goods on credit', 'A supplier deals with the firm from outside: external.'],
      ['A bank considering a loan to the firm', 'A bank stands outside the firm: external.'],
      ['The GST authorities', 'The tax authorities stand outside the firm: external.'],
    ],
    'The general manager runs the firm, so the manager is an internal user. The others stand outside it.'),
];

const qualities: Question[] = [
  mcq('ia-qualities', 'easy', 'Information that is free from error and bias and backed by evidence has the quality of:',
    'Reliability',
    [
      ['Relevance', 'Relevance is about usefulness for a decision and timeliness.'],
      ['Comparability', 'Comparability is about comparing across years or between firms.'],
      ['Understandability', 'Understandability is about users being able to follow the information.'],
    ],
    'Trustworthy, unbiased and supported figures are reliable.'),
  mcq('ia-qualities', 'easy', 'Which characteristic allows the accounts of one firm for two years, or of two firms, to be compared?',
    'Comparability',
    [
      ['Reliability', 'Reliability is about trust in the figures, not comparing them.'],
      ['Relevance', 'Relevance is about usefulness and timeliness.'],
      ['Understandability', 'Understandability is about being easy to follow.'],
    ],
    'Following the same methods year after year, and the same rules as other firms, makes accounts comparable.'),
  mcq('ia-qualities', 'easy', 'Information that reaches the user in time to affect a decision has the quality of:',
    'Relevance',
    [
      ['Comparability', 'Comparability concerns compared periods or firms, not timing.'],
      ['Reliability', 'Reliability concerns freedom from error and bias.'],
      ['Understandability', 'Understandability concerns clarity.'],
    ],
    'Information that can influence a decision, and arrives while the decision is still open, is relevant.'),
  mcq('ia-qualities', 'medium', 'A firm\'s accounts are written in clear language, but the accountant raises the profit figure to please the owner. Which characteristic is mainly lost?',
    'Reliability',
    [
      ['Understandability', 'The language is clear, so this quality is present.'],
      ['Relevance', 'The problem is not timing or usefulness but a biased figure.'],
      ['Comparability', 'The problem is not a change of method but a biased figure.'],
    ],
    'A figure raised to please someone is biased, and biased figures cannot be relied on.'),
  tf('ia-qualities', 'medium', 'Information that reaches the manager long after the decision was taken is still relevant, because it is accurate.', false,
    'Relevance needs timeliness as well as usefulness. Accurate but late information cannot help the decision.'),
  ar('ia-qualities', 'medium', 'A firm should use the same method of valuing stock from year to year.',
    'A steady method makes the results of different years comparable.', 'A',
    'Both are true, and R explains A: changing methods would make the years impossible to compare.'),
  mcq('ia-qualities', 'complex', 'The statements of a firm are accurate and on time but are full of technical terms that a small shareholder cannot follow. Which characteristic is lacking?',
    'Understandability',
    [
      ['Reliability', 'The statements are accurate, so reliability is present.'],
      ['Relevance', 'They are on time, so the timing is not the issue.'],
      ['Comparability', 'Nothing is said about changed methods or other firms; the issue is clarity.'],
    ],
    'Information should be presented so that users can follow it; technical jargon defeats that.'),
];

const advantages: Question[] = [
  mcq('ia-advantages', 'easy', 'Which of these is an advantage of keeping accounts?',
    'Systematic records replace the owner\'s memory',
    [
      ['It guarantees that the business will earn a profit', 'Accounting reports the result of trading; it does not produce a profit.'],
      ['It removes the need to pay tax', 'Accounts help in assessing tax; they do not remove it.'],
      ['It fixes the selling price of all goods', 'Prices are set by the business and the market, not by the records.'],
    ],
    'Records kept in the books can be looked up whenever needed, which a person\'s memory cannot match.'),
  mcq('ia-advantages', 'easy', 'Which of the following is a limitation of accounting?',
    'It leaves out things that cannot be expressed in money, such as the skill of the staff',
    [
      ['It helps in comparing the results of different years', 'That is an advantage, not a limitation.'],
      ['Properly kept accounts can be used as evidence in a court', 'That is an advantage, not a limitation.'],
      ['It provides information on which tax can be assessed', 'That is an advantage, not a limitation.'],
    ],
    'Only items that can be measured in money are recorded, so some valuable things are left out.'),
  tf('ia-advantages', 'easy', 'Properly kept accounts can be used as evidence in a court of law.', true,
    'Books with supporting vouchers are accepted as evidence, which is one advantage of keeping accounts.'),
  tf('ia-advantages', 'easy', 'Accounting figures are always exact because they are based only on facts.', false,
    'Some figures rest on estimates and judgement, such as the life of an asset or the value of stock, so they are not always exact.'),
  mcq('ia-advantages', 'medium', 'Machinery bought ten years ago still appears in the books at its cost less depreciation, although prices have risen. Which limitation does this show?',
    'Accounting does not show the current value of assets',
    [
      ['It ignores things that cannot be measured in money', 'A machine can be measured in money; the issue is which value is used.'],
      ['It depends on the personal bias of the accountant', 'The figure comes from the cost record, not from anyone\'s bias.'],
      ['It cannot be used to compare different years', 'The limitation concerns the value shown, not comparison.'],
    ],
    'Assets are kept at cost, so the books do not show what they are worth now.'),
  mcq('ia-advantages', 'medium', 'The loyalty and skills of a firm\'s workers do not appear in its books because:',
    'Only items that can be measured in money are recorded',
    [
      ['They are classed as current liabilities', 'Staff skills are not a liability; they are simply not recorded.'],
      ['They are an expense of the next year', 'They are not recorded as an expense either.'],
      ['The law forbids their recording', 'No law is involved; the reason is that they cannot be measured in money.'],
    ],
    'Accounting records money items only, so staff skill and loyalty are left out.'),
  ar('ia-advantages', 'medium', 'Accounting helps in comparing the results of different years.',
    'Systematic records give the figures of every year under the same heads and on the same basis, so one year can be set against another.', 'A',
    'Both are true, and R explains A: figures kept under the same heads and on the same basis each year are what make the years comparable.'),
  ar('ia-advantages', 'complex', 'Accounting information may not be completely free from personal bias.',
    'Some figures, such as the life of an asset or the value of stock, depend on estimates and judgement.', 'A',
    'Both are true, and R explains A: where judgement enters, a person\'s bias can enter as well.'),
  mcq('ia-advantages', 'complex', 'A person wants to buy a small business. Which advantage of accounting helps both the buyer and the seller to settle a fair price?',
    'Records of profits, assets and liabilities help to value the business',
    [
      ['The accounts replace the need to negotiate', 'The accounts give a basis for the price; the parties still agree it.'],
      ['The accounts show the exact future profit', 'Accounts record the past; they do not forecast an exact profit.'],
      ['The accounts give the market price of the shop\'s location', 'Accounts record cost, not today\'s market value.'],
    ],
    'The records of past profits and of what the business owns and owes give a basis for valuing it.'),
];

const assetsLiabilities: Question[] = [
  checkTwo,
  checkOne,
  mcq('ia-assets-liabilities', 'easy', 'Goodwill is classified as a:',
    'Non-current intangible asset',
    [
      ['Current asset', 'Goodwill is not turned into cash within the year.'],
      ['Non-current tangible asset', 'Goodwill has no physical form, so it is intangible.'],
      ['Non-current liability', 'Goodwill is something the business owns, not something it owes.'],
    ],
    'Goodwill gives a lasting benefit but cannot be touched: a non-current intangible asset.'),
  mcq('ia-assets-liabilities', 'easy', 'Which of the following is a non-current liability?',
    'A bank loan repayable after five years',
    [
      ['Creditors', 'Creditors are paid within the credit period, under a year: current.'],
      ['Bills payable', 'Bills payable fall due within months: current.'],
      ['Outstanding salaries', 'Outstanding salaries are paid in the coming month: current.'],
    ],
    'A liability not due for more than a year is non-current.'),
  tf('ia-assets-liabilities', 'easy', 'Capital is the amount the owner has put into the business, and the business owes it to the owner.', true,
    'The business is treated as separate from its owner, so what the owner has invested is owed back to the owner as capital.'),
  tf('ia-assets-liabilities', 'easy', 'Drawings increase the capital of the owner.', false,
    'Drawings are withdrawals by the owner for personal use, so they reduce capital.'),
  mcq('ia-assets-liabilities', 'medium', 'Which pair consists only of current assets?',
    'Bills receivable and closing stock',
    [
      ['Debtors and bank loan', 'A bank loan is a liability, not an asset.'],
      ['Land and cash', 'Land is a non-current asset.'],
      ['Furniture and bills receivable', 'Furniture is a non-current asset.'],
    ],
    'Bills receivable are collected within the year and closing stock is sold within the year, so both are current assets.'),
  ar('ia-assets-liabilities', 'medium', 'Debtors are shown among the current assets.', 'Debtors and bills receivable together are called trade receivables.', 'B',
    'Both are true, but R does not explain A: R only gives the name of a group. Debtors are current assets because the amounts they owe are expected to be collected within a year.'),
  ar('ia-assets-liabilities', 'medium', 'Drawings reduce the capital of the owner.', 'Drawings are an expense of the business.', 'C',
    'A is true. R is false: drawings are the owner\'s withdrawals, not an expense; they reduce capital directly.'),
  num('ia-assets-liabilities', 'medium', 'Mehta Traders has assets of ₹7,40,000 and liabilities to outsiders of ₹2,15,000. What is the owner\'s capital?', 525000,
    [[955000, 'Added the liabilities to the assets instead of deducting them.'], [215000, 'Gave the liabilities, not the capital.'], [740000, 'Gave the assets and forgot to deduct the liabilities.']],
    ['Capital = Assets - Liabilities.', '₹7,40,000 - ₹2,15,000 = ₹5,25,000.']),
  mcq('ia-assets-liabilities', 'complex', 'A trader buys a delivery van for ₹6,00,000 on credit, the whole amount to be paid to the dealer after four years. How is the amount owed to the dealer shown?',
    'As a non-current liability',
    [
      ['As a current liability', 'Ignored the due date: the amount is not payable for four years.'],
      ['As a non-current asset', 'Took the van itself, which is the asset, as the item; the amount owed is a liability.'],
      ['As capital', 'The dealer is an outsider, so what is owed to the dealer is not the owner\'s capital.'],
    ],
    'The amount is owed to an outsider and is not due for more than a year, so it is a non-current liability. The van is a separate non-current asset.'),
  mcq('ia-assets-liabilities', 'complex', 'A computer is bought by a computer dealer to sell, and another by a school for its laboratory. How is each treated?',
    'Goods for the dealer, a non-current asset for the school',
    [
      ['A non-current asset for both', 'The dealer buys it to resell, so for the dealer it is goods.'],
      ['Goods for both', 'The school buys it to use for years, so for the school it is an asset.'],
      ['A non-current asset for the dealer, goods for the school', 'Reversed the purpose: the dealer resells it, the school uses it.'],
    ],
    'The purpose decides: bought to resell, it is goods; bought to use for years, it is a non-current asset.'),
  tf('ia-assets-liabilities', 'easy', 'A bank overdraft is a current liability.', true,
    'An overdraft is owed to the bank and is repayable on demand, so it falls due within a year.'),
  tf('ia-assets-liabilities', 'medium', 'Plots of land bought by a property dealer only to resell them are non-current assets.', false,
    'The dealer buys the plots to sell, so for the dealer they are goods, like stock. Land is a non-current asset only for a business that uses it.'),
];

const incomeExpense: Question[] = [
  mcq('ia-income-expense', 'easy', 'Which of the following is a capital expenditure?',
    'Buying a delivery van for use in the business',
    [
      ['Paying the month\'s shop rent', 'Rent is a running cost whose benefit is used up within the period.'],
      ['Paying salaries to the staff', 'Salaries are a running cost: revenue expenditure.'],
      ['Buying goods for resale', 'Goods for resale are bought to be sold within the year: revenue expenditure.'],
    ],
    'A van is a long-lasting asset, so spending on it is capital expenditure.'),
  mcq('ia-income-expense', 'easy', 'Which of the following is a revenue receipt?',
    'Commission received for services given',
    [
      ['A loan taken from a bank', 'A loan has to be repaid and is not earned: a capital receipt.'],
      ['Capital brought in by the owner', 'Capital from the owner is a capital receipt.'],
      ['Sale proceeds of an old machine', 'Selling a long-term asset gives a capital receipt.'],
    ],
    'Commission is earned through the regular work of the business, so it is a revenue receipt.'),
  mcq('ia-income-expense', 'easy', 'Profit is the excess of:',
    'Revenue over expenses',
    [
      ['Expenses over revenue', 'That is a loss.'],
      ['Assets over drawings', 'Drawings are not part of the profit calculation.'],
      ['Capital over liabilities', 'Capital and liabilities are not compared to find profit.'],
    ],
    'Profit = Revenue - Expenses, when revenue is the larger.'),
  tf('ia-income-expense', 'easy', 'Money received from selling an old machine is a revenue receipt.', false,
    'Selling a long-term asset is not the regular activity of the business, so the money is a capital receipt.'),
  mcq('ia-income-expense', 'medium', 'A firm sells an old machine for ₹12,000, which is ₹2,000 more than its value in the books. The extra ₹2,000 is a:',
    'Gain',
    [
      ['Loss', 'A loss would arise if the machine had sold for less than its book value.'],
      ['Expense', 'It is not a cost of running the business; it adds to profit.'],
      ['Capital', 'The excess over the book value is a gain; capital is the owner\'s investment.'],
    ],
    'A profit from an incidental event such as selling an asset above its book value is a gain.'),
  mcq('ia-income-expense', 'medium', '₹5,000 is spent on repairing a second-hand machine, just after buying it, to make it fit for use. This is:',
    'Capital expenditure',
    [
      ['Revenue expenditure', 'Routine repairs are revenue expenditure; this repair brings the machine into working condition, so it adds to its cost.'],
      ['A capital receipt', 'Money is going out, not coming in.'],
      ['A loss', 'The money is spent to get an asset ready for use, not lost.'],
    ],
    'Spending that brings an asset into working condition is added to its cost: capital expenditure.'),
  ar('ia-income-expense', 'medium', 'Money spent on adding a floor to a shop building is capital expenditure.',
    'The spending adds to a long-lasting asset that will earn for many years.', 'A',
    'Both are true, and R explains A.'),
  num('ia-income-expense', 'complex', 'A firm spends ₹60,000 on a machine, ₹5,000 on carriage to bring it to the factory, ₹3,000 on installing it and ₹2,000 on its routine servicing in the first month. What is the capital expenditure?', 68000,
    [[70000, 'Included the routine servicing, which is revenue expenditure.'], [60000, 'Counted only the price and left out the carriage and installation, which are part of getting the machine ready.'], [8000, 'Counted only the carriage and installation.']],
    ['Capital expenditure = price + carriage + installation.', '₹60,000 + ₹5,000 + ₹3,000 = ₹68,000.', 'The routine servicing of ₹2,000 is revenue expenditure.']),
  mcq('ia-income-expense', 'complex', 'A firm pays ₹40,000 as wages to its own workers for building a new godown for the firm. This is:',
    'Capital expenditure, because it creates a lasting asset',
    [
      ['Revenue expenditure, because wages are usually revenue expenditure', 'Wages are normally revenue expenditure, but here they create an asset, so they are part of its cost.'],
      ['A capital receipt', 'Money is paid out, not received.'],
      ['Drawings', 'The wages are paid for the firm\'s own asset, not for the owner\'s personal use.'],
    ],
    'The purpose decides: wages spent on creating a long-lasting asset are added to its cost and are capital expenditure.'),
  mcq('ia-income-expense', 'medium', 'Which of the following is a gain and not a regular revenue of a trading firm?',
    'Profit on selling an old machine for more than its value in the books',
    [
      ['Sale of goods to customers', 'Sale of goods is the regular activity of the firm: revenue, not a gain.'],
      ['Fees received for services given to customers', 'Fees come from the regular work of the firm: revenue.'],
      ['Additional capital brought in by the owner', 'Capital from the owner is a capital receipt; it is not a profit of any kind.'],
    ],
    'A gain arises from an event on the side of the business, such as selling an old asset above its book value.'),
  ar('ia-income-expense', 'medium', 'Interest paid on a bank loan is a revenue expenditure.',
    'The benefit of paying interest is used up within the year.', 'A',
    'Both are true, and R explains A: the interest pays for the use of the money during the year and does not create an asset.'),
];

const tradeTerms: Question[] = [
  mcq('ia-trade-terms', 'easy', 'A person who owes money to the business for goods bought on credit is a:',
    'Debtor',
    [
      ['Creditor', 'A creditor is a person the business owes.'],
      ['Proprietor', 'The proprietor is the owner of the business.'],
      ['Bill payable', 'A bill payable is a document, not a person, and is owed by the business.'],
    ],
    'Someone who owes the business money for goods is its debtor.'),
  mcq('ia-trade-terms', 'easy', 'Which discount is taken off the list price and is not entered in the books?',
    'Trade discount',
    [
      ['Cash discount', 'Cash discount is allowed for prompt payment and is entered in the books.'],
      ['Discount allowed', 'Discount allowed is a cash discount and is entered in the books.'],
      ['Discount received', 'Discount received is a cash discount and is entered in the books.'],
    ],
    'Trade discount fixes the price at which the sale is made, so only the net price is recorded.'),
  mcq('ia-trade-terms', 'easy', 'A cash discount allowed by a seller to a customer is, for the seller:',
    'An expense, recorded as Discount Allowed',
    [
      ['An income, recorded as Discount Received', 'Discount received is the buyer\'s side of the same discount.'],
      ['Not recorded at all', 'That is true of trade discount, not of cash discount.'],
      ['An asset, recorded with the debtors', 'The seller gives the amount up for good; nothing remains to be collected, so it is not an asset.'],
    ],
    'The seller gives up part of the amount due in return for early payment. It is an expense of the seller and is shown in Discount Allowed A/c.'),
  tf('ia-trade-terms', 'easy', 'Every event that happens in a business is a transaction.', false,
    'A transaction is an exchange of value that can be measured in money. An enquiry or a decision is an event but not a transaction.'),
  tf('ia-trade-terms', 'easy', 'The closing stock of one year becomes the opening stock of the next year.', true,
    'Goods unsold at the end of one period are the goods the business starts the next period with.'),
  mcq('ia-trade-terms', 'medium', 'Rao buys goods on credit and accepts a bill of exchange that the seller draws on Rao. For Rao the bill is a:',
    'Bill payable',
    [
      ['Bill receivable', 'A bill receivable is a bill the firm will collect from someone else.'],
      ['Debtor', 'A debtor is a person who owes Rao; here Rao owes the seller.'],
      ['Voucher', 'A voucher is a supporting paper for an entry, not a promise to pay.'],
    ],
    'Rao has promised to pay on the due date, so for Rao the bill is a bill payable.'),
  mcq('ia-trade-terms', 'medium', 'A shopkeeper takes goods worth ₹4,000 from the shop\'s stock for use at home. The amount is recorded as:',
    'Drawings',
    [
      ['Sales', 'No sale has been made; the goods left the business without payment.'],
      ['An expense', 'It is the owner\'s personal use, not a cost of earning revenue.'],
      ['Purchases', 'The goods were already bought; they are now being taken out.'],
    ],
    'Goods taken out by the owner for personal use are drawings, which reduce the owner\'s capital.'),
  num('ia-trade-terms', 'medium', 'A wholesaler\'s list price is ₹50,000, and the wholesaler allows a trade discount of 20%. At what amount is the sale recorded?', 40000,
    [[50000, 'Recorded the list price; the trade discount is deducted before recording.'], [60000, 'Added the discount instead of deducting it.'], [10000, 'Gave the amount of the discount, not the net amount recorded.']],
    ['Trade discount = 20% of ₹50,000 = ₹10,000.', 'Amount recorded = ₹50,000 - ₹10,000 = ₹40,000.']),
  ar('ia-trade-terms', 'complex', 'Trade discount is not recorded in the books of account.',
    'It is only a reduction in the list price at which the goods are sold, so no separate amount is paid or received.', 'A',
    'Both are true, and R explains A: only the net price changes hands, so only the net price is recorded.'),
  mcq('ia-trade-terms', 'complex',
    'A seller invoices goods at a list price of ₹20,000 with a trade discount of 10%. The buyer pays within 10 days and gets a 2% cash discount on the invoice amount. In the seller\'s books:',
    'Sales are ₹18,000 and Discount Allowed is ₹360',
    [
      ['Sales are ₹17,640 and there is no Discount Allowed', 'Deducted the cash discount from sales; it is recorded separately as discount allowed.'],
      ['Sales are ₹20,000 and Discount Allowed is ₹2,360', 'Recorded sales at the list price and counted the trade discount as discount allowed along with the cash discount.'],
      ['Sales are ₹18,000 and Discount Allowed is ₹400', 'Worked the cash discount on the list price instead of the invoice amount of ₹18,000.'],
    ],
    'Invoice amount = ₹20,000 - 10% = ₹18,000, recorded as sales. Cash discount = 2% of ₹18,000 = ₹360, recorded as Discount Allowed. The buyer pays ₹17,640.'),
  mcq('ia-trade-terms', 'easy', 'A cash memo, bill or receipt that proves a transaction and supports its entry in the books is called a:',
    'Supporting voucher (source document)',
    [
      ['Journal', 'The journal is the book in which the entry is made; the supporting voucher is the paper that proves it.'],
      ['Ledger', 'The ledger is the book of accounts into which entries are posted; it is not a proof of the transaction.'],
      ['Bill of exchange', 'A bill of exchange is a written promise to pay on a fixed date, not the proof of an ordinary transaction.'],
    ],
    'The cash memo, bill or receipt is the source document, also called a supporting voucher: it proves the transaction. The accounting voucher that shows the entry (a debit, credit or transfer voucher) is prepared from it.'),
  tf('ia-trade-terms', 'medium', 'Every entry in the books should be supported by a voucher.', true,
    'The supporting voucher (the bill, cash memo or receipt) is the evidence for an entry. Entries backed by vouchers can be checked, which makes the accounts more reliable.'),
  mcq('ia-trade-terms', 'medium', 'Which of the following is a trade payable of a firm?',
    'The amount due to a supplier for goods bought on credit',
    [
      ['A term loan taken from a bank', 'Took borrowing as a trade payable; trade payables arise from buying goods on credit, not from loans.'],
      ['Salaries due to the staff for last month', 'Salaries due are an outstanding expense, not an amount owed for goods bought on credit.'],
      ['The amount the business owes to the owner as capital', 'Capital is the investment of the owner; it is not owed to a supplier for goods.'],
    ],
    'Trade payables are creditors and bills payable: amounts owed to suppliers for goods bought on credit.'),
  mcq('ia-trade-terms', 'easy', 'The amount paid to acquire goods, an asset or a service is called its:',
    'Cost',
    [
      ['Expense', 'An expense is the cost that has been used up in earning revenue; cost is the amount paid to acquire the item.'],
      ['Loss', 'A loss is a shortfall or something lost for nothing in return, not the price paid to acquire an item.'],
      ['Drawings', 'Drawings are what the owner takes out for personal use.'],
    ],
    'Cost is what is paid or given up to acquire something. It becomes an expense only when it is used up in earning revenue.'),
];

const questions: Question[] = [
  ...meaning,
  ...process,
  ...users,
  ...qualities,
  ...advantages,
  ...assetsLiabilities,
  ...incomeExpense,
  ...tradeTerms,
];

// ---------------------------------------------------------------------------------------------------------------
// Ladder
// ---------------------------------------------------------------------------------------------------------------

/** n items from a list, spread evenly along it so that every part of the list is represented. */
const spread = <X,>(list: X[], n: number): X[] => Array.from({ length: Math.min(n, list.length) }, (_, i) => list[Math.floor((i * list.length) / Math.min(n, list.length))]);

const checks = new Set([checkOne.id, checkTwo.id]);
const pool = (difficulty: Difficulty): Question[] => questions.filter((q) => q.difficulty === difficulty && !checks.has(q.id));
const easyQs = pool('easy');
const recognition = spread(easyQs, 12);
const easyLeft = easyQs.filter((q) => !recognition.includes(q));
const ASSET_SIDE = new Set(['ia-assets-liabilities', 'ia-income-expense', 'ia-trade-terms']);
const mediumQs = pool('medium');
const mediumA = mediumQs.filter((q) => ASSET_SIDE.has(q.conceptId));
const mediumB = mediumQs.filter((q) => !ASSET_SIDE.has(q.conceptId));
const complexQs = pool('complex');
const ids = (qs: Question[]): string[] => qs.map((q) => q.id);

const levelsBase = buildLadder(T, {
  concept: {
    title: 'What Is Accounting?',
    description: 'See why a business keeps accounts, how a transaction becomes a report, and the words you will use all along.',
    lesson: [
      {
        type: 'text',
        heading: 'A business needs a memory',
        body: 'A shopkeeper may remember today\'s sales, but not what Mehta owed last March, or whether the shop earned more than it spent this year. Accounting is the system that keeps that memory. It picks out the dealings that matter, gives each a money value, writes it down, and later turns the pile of entries into a few pages a person can read and act on.',
      },
      {
        type: 'text',
        heading: 'From a sale to a report',
        body: 'Take a sale of goods for ₹5,000 on credit to Mehta. It is identified as a transaction, measured at ₹5,000, recorded in the books, classified under Sales and under Mehta\'s account, summarised with all the other figures in the year-end statements, analysed against last year, interpreted for the owner and communicated to the people who need it. Recording and keeping the books is book-keeping; accounting carries on to the end of the path.',
      },
      {
        type: 'text',
        heading: 'Who reads the numbers',
        body: 'The owner and the managers run the business, so they are internal users: they want profit, costs and cash. People and bodies that deal with the business from outside are external users, and each wants something different. A bank asks whether the loan will be repaid, a supplier whether it will be paid for goods on credit, an investor whether the business is profitable and safe, the tax department whether the tax is right. Good information is reliable, relevant, understandable and comparable.',
      },
      {
        type: 'working',
        title: 'Worked example 1: who needs what from Mehra Dairy, Karnal',
        lines: [
          'Mehra Dairy buys milk from farmers, sells milk and paneer, and has a bank loan. Take each user in turn and ask: inside or outside, and what decision does it face?',
          'Harpal Mehra, the owner (internal): did the year\'s trading pay? Needs the profit or loss of the year.',
          'The plant manager (internal): which product costs too much to make? Needs costs and sales by product.',
          'The bank that lent ₹6,00,000 (external): will the interest and the loan be paid on time? Needs the financial position (what is owned and owed) and the flow of cash.',
          'A farmer who supplies milk on 15 days\' credit (external): will the dairy pay within 15 days? Needs the cash coming in and going out over the coming weeks.',
          'The income tax department (external): is the taxable profit correct? Needs the profit of the year.',
        ],
        note: 'Watch out: the bank is an external user even though the dairy owes it money. Owing money to someone does not bring that person inside the business.',
      },
      {
        type: 'text',
        heading: 'Words with exact meanings',
        body: 'What the business owns is an asset. What it owes to outsiders is a liability. What the owner has put in is capital: the business owes it to the owner, so it is sometimes called an internal liability, but it is always kept apart from the liabilities to outsiders. What the owner takes out for personal use is drawings. What it earns from its work is revenue, and what it spends in earning it is an expense. Each word has a test: owned or owed, long-lasting or used up soon, earned or spent.',
      },
      {
        type: 'text',
        heading: 'Worked example: sort five items',
        body: 'Ravi runs a cloth shop. Sort these: (a) ₹60,000 owed to the shop by customers; (b) a bank loan of ₹5,00,000 to be repaid in six years; (c) shop rent of ₹10,000 paid; (d) ₹1,00,000 Ravi put in from personal savings; (e) shop furniture of ₹40,000. Answer: (a) a current asset, because customers will pay within the year; (b) a non-current liability, because it is owed to an outsider and is not due for years; (c) an expense, a cost of running the shop; (d) capital, the owner\'s own investment; (e) a non-current asset, kept in use for years.',
      },
      {
        type: 'working',
        title: 'Worked example 2: capital or revenue? A new machine at Sharma Flour Mill, Indore',
        lines: [
          'The mill buys a grinding machine for ₹2,40,000, pays ₹6,000 to bring it to the mill and ₹4,000 to install it. During the year it pays ₹3,000 for routine servicing and ₹2,000 to insure the machine for the year.',
          'Ask of each payment: does it buy the machine or get it ready to work (capital), or does it keep it running this year (revenue)?',
          'Price, carriage and installation are all needed before the machine can work: capital expenditure = ₹2,40,000 + ₹6,000 + ₹4,000 = ₹2,50,000, the cost of the machine in the books.',
          'Servicing and insurance only keep the machine working this year: revenue expenditure = ₹3,000 + ₹2,000 = ₹5,000, charged against this year\'s profit.',
        ],
        note: 'Watch out: carriage and installation of a new asset are capital expenditure, although carriage and wages are usually revenue items. What decides is what the money was spent on.',
      },
      {
        type: 'table',
        title: 'Worked example 3: the profit of Neha\'s Tea Stall for April',
        rows: [
          { label: 'Revenue: tea and snacks sold', amount: '₹1,20,000' },
          { label: 'Less: expenses' },
          { label: 'Cost of the tea, milk and snacks sold', amount: '(70,000)' },
          { label: 'Rent of the stall', amount: '(12,000)' },
          { label: 'Wages of two helpers', amount: '(18,000)' },
          { label: 'Gas and electricity', amount: '(4,000)' },
          { label: 'Profit for April (revenue - expenses)', amount: '₹16,000', total: true },
        ],
        note: 'Profit = Revenue - Expenses = ₹1,20,000 - ₹1,04,000. Watch out: the ₹25,000 Neha took from the stall for household use is drawings, not an expense, so it does not reduce the profit.',
      },
      {
        type: 'working',
        title: 'Worked example 4: trade and cash discount on one invoice, Sai Electricals, Vijayawada',
        lines: [
          'Sai Electricals buys 50 ceiling fans at a list price of ₹1,600 each from a wholesaler, who allows 10% trade discount and a further 2% cash discount if the bill is paid within 10 days. Sai pays within 10 days. (Ignore GST.)',
          'List price = 50 × ₹1,600 = ₹80,000.',
          'Trade discount = 10% of ₹80,000 = ₹8,000. The invoice is for ₹80,000 - ₹8,000 = ₹72,000, and the purchase is recorded at ₹72,000: the trade discount is never entered in the books.',
          'Cash discount = 2% of the invoice amount ₹72,000 = ₹1,440. It is entered in the books, as discount received.',
          'Amount paid = ₹72,000 - ₹1,440 = ₹70,560.',
        ],
        note: 'Watch out: the cash discount is worked on the amount after trade discount (₹72,000), not on the list price. 2% of ₹80,000 = ₹1,600 is the usual slip.',
      },
      { type: 'check', questionId: checkTwo.id },
      { type: 'check', questionId: checkOne.id },
    ],
  },
  cards: {
    title: 'Terms, Steps and Rules',
    description: 'Recall the meanings, the steps of the process, who uses accounts and the tests for each term.',
    cardIds: cards.map((c) => c.id),
  },
  recognition: [
    {
      title: 'Know Your Terms',
      description: 'Recognise the meaning, the step, the user and the term from short statements.',
      questionIds: ids(recognition),
    },
  ],
  practice: [
    {
      title: 'Sorting the Basics',
      description: 'Classify items, name users, put the steps in order and find a simple profit.',
      templateIds: ['ia-classify-item', 'ia-term-trade', 'ia-term-owner', 'ia-user-profile', 'ia-internal-external', 'ia-process-order', 'ia-profit', 'ia-financial-transaction'],
      count: 8,
    },
    {
      title: 'Guided: Assets and Liabilities',
      description: 'Decide whether an item is owned or owed, how long it lasts, and where it belongs.',
      templateIds: ['ia-asset-class', 'ia-liability-class'],
      count: 6,
      guided: true,
    },
    {
      title: 'Capital, Revenue and Trade Terms',
      description: 'Capital or revenue, goods or asset, and the terms of buying and selling on credit.',
      templateIds: ['ia-exp-type', 'ia-goods-or-asset', 'ia-term-income', 'ia-define-income', 'ia-define-trade', 'ia-define-owner', 'ia-assets-total', 'ia-trade-receivables'],
      count: 8,
    },
    {
      title: 'Users, Process and Qualities',
      description: 'What each user needs, which step of the process, and which quality of information.',
      templateIds: ['ia-user-need', 'ia-process-step', 'ia-quality-match', 'ia-bk-vs-acc', 'ia-branch', 'ia-trade-discount', 'ia-stock-value'],
      count: 7,
    },
    {
      title: 'Complex Situations',
      description: 'Two items at once, loans by due date, capital with a distracting fact, discounts and stock in several steps.',
      templateIds: ['ia-classify-two', 'ia-loan-timing', 'ia-capital-from-list', 'ia-two-discounts', 'ia-closing-stock-flow'],
      count: 5,
    },
  ],
  mixed: { title: 'Mixed Practice', description: 'Everything in this topic, shuffled the way an exam serves it.', count: 12 },
  challenge: { title: 'Challenge: Accounting Basics', description: 'The hardest questions in the topic, mixed together and timed.', count: 5 },
});

// Authored recognition-style questions go with the practice levels they match: easy ones with the first practice
// level, the others with the medium and complex levels. Authored questions are served before the generated ones.
const attach: Record<string, string[]> = {
  'Sorting the Basics': ids(easyLeft),
  'Capital, Revenue and Trade Terms': ids(mediumA),
  'Users, Process and Qualities': ids(mediumB),
  'Complex Situations': ids(complexQs),
};
const levels = levelsBase.map((l) => (attach[l.title] ? { ...l, questionIds: attach[l.title] } : l));

// ---------------------------------------------------------------------------------------------------------------
// The role of accounting and the types of accounting information, added after the check against the CBSE 2025-26
// syllabus: a level of its own after every other level, with an id of its own, so no level a learner has passed
// moves. These questions are kept apart from `questions`, from which the levels above take theirs.
// ---------------------------------------------------------------------------------------------------------------

const roleQuestions: Question[] = [
  tf('ia-users', 'easy', 'The balance sheet gives information about the financial position of a business.', true,
    'True. What the business owns, owes and holds as capital on a date is its financial position, shown in the balance sheet.'),
  mcq('ia-users', 'medium', 'Which list gives the three types of accounting information?',
    'Profit or loss; financial position; flows of cash', [
      ['Assets; liabilities; capital', 'These are the parts of one type, the financial position.'],
      ['Journal; ledger; trial balance', 'These are stages of recording, not types of information.'],
      ['Owners; lenders; tax authorities', 'These are users of the information, not its types.'],
    ], 'Accounting reports how the period went (profit or loss), where the business stands (financial position) and how cash moved.'),
  // ia-q-083: it once repeated ia-q-010 (accounting as the language of business); it now asks about a limitation.
  ar('ia-advantages', 'medium', 'A building that Joshi Traders bought in 2010 may appear in its balance sheet today at much less than it would fetch if sold.', 'Assets are recorded at their historical cost, not at their current market value.', 'A',
    'Both are true, and R explains A: the building stays in the books at what it cost in 2010 (less depreciation), so a rise in its market value does not appear. This is one of the limitations of accounting.'),
  mcq('ia-advantages', 'medium', 'Imran Traders lost its account books in a flood. Which role of accounting has it lost most directly?',
    'The systematic record that serves as the memory of the business', [
      ['Its right to carry on business', 'Losing the books does not end the right to trade.'],
      ['Its profit for the year', 'The profit was earned; what is lost is the record from which it is measured.'],
      ['Its customers', 'Customers are not lost with the books, though what they owe is now hard to prove.'],
    ], 'Without the record, nothing about past dealings can be looked up or proved.'),
];

const pack: TopicPack = {
  topicId: T,
  concepts,
  cards,
  levels: [
    ...levels,
    ...laterLevels(T, levels, [
      {
        name: 'role-and-information',
        type: 'method_recognition',
        title: 'The Role of Accounting and Its Information',
        description: 'What accounting does for a business, what it does not do, and the three types of information it gives.',
        questionIds: roleQuestions.map((q) => q.id),
        generate: { templateIds: ['ia-info-type', 'ia-info-need', 'ia-role', 'ia-role-limit'], count: 6 },
      },
      // Added in the quality pass after the audit of Class 11 (outside the mock papers: generators/outsidePapers.ts).
      {
        name: 'vouchers-qualities-matching',
        type: 'medium_practice',
        title: 'Vouchers, Qualities and Matching',
        description: 'Which voucher a dealing needs, the parts of reliability and relevance, and matching two columns as the board sets them.',
        generate: { templateIds: ['ia-voucher-kind', 'ia-quality-parts', 'ia-match-columns'], count: 8 },
      },
      {
        name: 'assertion-reason',
        type: 'medium_practice',
        title: 'Assertion and Reason',
        description: 'Two statements on this topic: decide whether each is true, and whether the Reason explains the Assertion.',
        generate: { templateIds: ['ia-assertion-reason'], count: 8 },
      },
    ]),
  ],
  questions: [...questions, ...roleQuestions],
};

export default pack;
