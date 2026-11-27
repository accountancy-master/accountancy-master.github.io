import { BEYOND_IGST_CROSS_SET_OFF, beyondCard } from '../beyondSyllabus';
import { buildLadder, laterLevels } from '../ladder';
import type { Card, Concept, Difficulty, McqQuestion, Question, TopicPack, TrueFalseQuestion } from '../types';

const T = 'theory-base';

const concepts: Concept[] = [
  { id: 'thb-gaap', topicId: T, title: 'Generally Accepted Accounting Principles (GAAP)' },
  { id: 'thb-assumptions', topicId: T, title: 'Fundamental accounting assumptions' },
  { id: 'thb-principles', topicId: T, title: 'Accounting principles and concepts' },
  { id: 'thb-systems', topicId: T, title: 'Systems of accounting' },
  { id: 'thb-bases', topicId: T, title: 'Cash basis and accrual basis' },
  { id: 'thb-standards', topicId: T, title: 'Accounting standards, IFRS and Ind AS' },
  { id: 'thb-gst', topicId: T, title: 'Goods and Services Tax: what it is and when each part applies' },
  { id: 'thb-gst-calc', topicId: T, title: 'GST amounts and input tax credit' },
];

// ---------------------------------------------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------------------------------------------

let cardNo = 0;
const card = (conceptId: string, kind: Card['kind'], prompt: string, answer: string, explanation: string, example: string, commonMistake: string): Card => ({
  id: `thb-card-${++cardNo}`,
  topicId: T,
  conceptId,
  kind,
  prompt,
  answer,
  explanation,
  example,
  commonMistake,
});

const cards: Card[] = [
  card('thb-gaap', 'rule', 'What are GAAP?',
    'Generally Accepted Accounting Principles: the rules, conventions and practices that the accounting profession and users accept for recording and reporting transactions.',
    'They are accepted by agreement and practice, not by one firm. They exist so that the accounts of different firms can be compared and relied on. They differ from country to country and change over time.',
    'Two shops record a stock loss in two different ways and show different profits. GAAP narrow the choices so that similar events are recorded in similar ways.',
    'Thinking GAAP are one law of Parliament, or that they are the same in every country.'),
  card('thb-assumptions', 'rule', 'Which three ideas are the fundamental accounting assumptions?',
    'Going concern, consistency and accrual.',
    'Accounting Standard 1 (AS-1) names these three as the fundamental accounting assumptions on which accounts are prepared. If they are followed, nothing need be said; if one of them is not followed, the fact must be disclosed. The other ideas (business entity, money measurement, matching, prudence and so on) are basic concepts or principles and are not among the three.',
    'A firm that follows all three need not say so in its accounts. A firm that is about to close, and so cannot assume going concern, must state that fact.',
    'Listing prudence, matching or materiality among the three fundamental assumptions.'),
  card('thb-assumptions', 'rule', 'What does the going concern assumption say, and what does it justify?',
    'The business will continue for the foreseeable future. So assets are carried at cost less depreciation, not at what they would fetch in a hurried sale, and cost is spread over the life of an asset.',
    'If a firm is about to close, it no longer applies and assets are shown at the amounts they will realise.',
    'A bakery buys an oven for ₹1,20,000 with a 10-year life. It charges ₹12,000 a year because it expects to keep baking.',
    'Charging the whole cost of a long-lived asset in the year of purchase.'),
  card('thb-assumptions', 'rule', 'What does the consistency assumption say?',
    'The same accounting methods are followed from one year to the next, so that results of different years can be compared.',
    'A method may be changed only if the law or a standard requires it or the new method gives a truer picture, and then the change must be disclosed.',
    'A firm that values stock by one method year after year does not switch to another method just because it would raise this year\'s profit.',
    'Believing that a method can never be changed. It can, for a good reason, if the change is disclosed.'),
  card('thb-bases', 'rule', 'What does the accrual assumption say?',
    'Revenue and costs are recorded when they are earned or incurred, not when cash is received or paid.',
    'This is why outstanding and prepaid expenses and accrued and advance incomes are shown in the accounts.',
    'March rent paid in April is an expense of March (outstanding at 31 March). Rent for the next year paid in March is a prepaid expense of the next year.',
    'Recording an item when cash moves. That is the cash basis.'),
  card('thb-principles', 'rule', 'What does the business entity concept say?',
    'The business is treated as separate from its owner. Only the business\'s own transactions are recorded.',
    'Capital is what the business owes the owner; the owner\'s personal spending is drawings, not a business expense.',
    'The proprietor pays a child\'s school fees of ₹8,000 from the shop cash: Drawings A/c Dr ₹8,000; To Cash A/c ₹8,000.',
    'Charging the owner\'s personal expenses to a business expense account.'),
  card('thb-principles', 'rule', 'What does the money measurement concept say?',
    'Only transactions and events that can be expressed in money are recorded.',
    'This gives a common unit for adding unlike things. It also means that a skilled manager or good customer relations, which cannot be measured in money, do not appear in the books.',
    'Furniture bought for ₹25,000 is recorded. The loyalty of the staff is not.',
    'Trying to record a valuable but unmeasurable item, such as the worth of the workforce.'),
  card('thb-principles', 'rule', 'What do the accounting period, matching and revenue recognition principles say?',
    'Accounting period: profit is measured for a fixed period, usually a year. Matching: the expenses of a period are set against the revenue of that period. Revenue recognition: revenue is recognised when it is earned (generally on delivery), not when an order is placed or cash comes in.',
    'Together they decide in which year each income and expense belongs.',
    'Goods sold on credit on 29 March are sales of the year ending 31 March even if paid in May, and the cost of earning that revenue is charged to the same year.',
    'Taking an order, an advance or a cash receipt as revenue before the goods are delivered.'),
  card('thb-principles', 'rule', 'What does the prudence (conservatism) principle say?',
    'Provide for all likely losses, but do not anticipate profits.',
    'This is why stock is valued at the lower of cost and net realisable value and why a provision is made for doubtful debts.',
    'Stock cost ₹80,000 but would now sell for ₹72,000: show ₹72,000. If it would sell for ₹95,000, still show ₹80,000.',
    'Valuing stock at the higher market price to show a bigger profit.'),
  card('thb-principles', 'rule', 'What does the historical cost concept say?',
    'An asset is recorded at the price actually paid for it (with the costs of bringing it to working condition), and later changes in market price are not recorded.',
    'It is objective and verifiable. Cost is spread over the life of a fixed asset through depreciation.',
    'Land bought for ₹40,00,000 stays at ₹40,00,000 even if the market price rises to ₹70,00,000.',
    'Raising an asset to its market price, or leaving out installation and freight from its cost.'),
  card('thb-principles', 'rule', 'What do the full disclosure and materiality principles say?',
    'Full disclosure: all facts that could affect a reader\'s decisions are disclosed, often in notes. Materiality: only items large enough to matter need separate treatment; trivial items may be dealt with in the simplest way.',
    'They pull in two directions: tell readers what matters, but do not clutter the accounts with what does not.',
    'A pending court claim of ₹20,00,000 is noted under the balance sheet. A ₹150 stapler is charged to expenses at once.',
    'Treating a trivial item as an asset, or hiding a large contingent claim.'),
  card('thb-principles', 'formula', 'What is the dual aspect concept in equation form?',
    'Assets = Liabilities + Capital. Every transaction has two equal effects, a debit and a credit.',
    'It is the base of the double entry system. Whatever a transaction does, the two sides of the equation stay equal.',
    'Buying machinery for ₹50,000 on credit: assets +₹50,000 and liabilities +₹50,000.',
    'Recording a transaction in one account only, or in two accounts on the same side.'),
  card('thb-principles', 'rule', 'What does verifiable objectivity ask for?',
    'Entries are based on evidence that anyone can check, such as bills, receipts and vouchers, rather than on personal opinion.',
    'This lets an auditor test the books and makes the accounts reliable.',
    'A purchase is recorded on the supplier\'s invoice and the payment advice, not on the owner\'s estimate.',
    'Recording an amount on the owner\'s say-so with no document.'),
  card('thb-systems', 'rule', 'How do double entry and single entry differ?',
    'Double entry records both aspects of every transaction and gives complete books and a trial balance. Single entry is incomplete: some transactions are recorded in two accounts, some in one and some not at all, and there is no trial balance.',
    'Single entry is cheap and simple for a very small trader but gives only a rough idea of profit.',
    'A shopkeeper who keeps a cash book and a list of debtors and creditors is using single entry. A firm with a ledger, trial balance and final accounts uses double entry.',
    'Saying that double entry means entering each transaction twice in the same book.'),
  card('thb-systems', 'rule', 'What are the main advantages of double entry?',
    'Complete record of every transaction; the trial balance checks arithmetical accuracy; profit and financial position can be found accurately; errors are easier to locate; the accounts are reliable for users.',
    'These follow from the equality of total debits and credits.',
    'If a trial balance totals agree, the arithmetic of the postings is probably right (it does not prove there are no errors of principle or omission).',
    'Claiming that an agreeing trial balance proves the books are free from all errors.'),
  card('thb-bases', 'shortcut', 'How do you convert cash-basis profit to accrual-basis profit?',
    'Accrual profit = Cash profit + income earned but not received + expenses prepaid - income received in advance - expenses outstanding.',
    'Items that raise income or lower expenses of this year are added; items that lower income or raise expenses are deducted. This is for a year with no opening balances; with opening balances, work item by item.',
    'Cash profit ₹2,00,000; accrued income ₹20,000; prepaid expenses ₹5,000; income in advance ₹10,000; outstanding expenses ₹8,000: accrual profit = 2,00,000 + 20,000 + 5,000 - 10,000 - 8,000 = ₹2,07,000.',
    'Adding every adjustment, or adding the advance income and the outstanding expense.'),
  card('thb-bases', 'rule', 'What are the cash basis and the accrual basis?',
    'Cash basis: income and expenses are recorded when cash is received or paid. Accrual (mercantile) basis: they are recorded when earned or incurred, whatever the date of cash.',
    'The accrual basis matches income with the expenses of the same period, so it shows profit more truly; most businesses use it.',
    'A credit sale in March is March income on the accrual basis, but April income on the cash basis if the money comes in April.',
    'Confusing a basis of accounting with a system of accounting (single or double entry).'),
  card('thb-standards', 'rule', 'What are accounting standards and who issues them in India?',
    'Accounting Standards are written policy documents that give detailed rules for recording and reporting particular items. In India they are formulated by the Institute of Chartered Accountants of India (ICAI) and, for companies, notified by the Central Government.',
    'Their objectives are to bring uniformity, reduce alternative treatments and make statements comparable and reliable.',
    'A standard on inventories says that stock is valued at the lower of cost and net realisable value.',
    'Naming the RBI, SEBI or the Income Tax Department as the issuing body.'),
  card('thb-standards', 'rule', 'What are IFRS and Ind AS?',
    'IFRS are International Financial Reporting Standards issued by the International Accounting Standards Board (IASB). Ind AS are the Indian Accounting Standards, converged with IFRS and notified by the Ministry of Corporate Affairs for companies to which they apply.',
    'Convergence makes Indian accounts comparable and understood abroad, which helps investment and cross-border business. Ind AS follow IFRS closely but not word for word.',
    'A foreign investor can read the accounts of an Ind AS company more easily because the rules resemble IFRS.',
    'Saying that Ind AS are identical to IFRS, or that IFRS are issued by ICAI.'),
  card('thb-gst', 'rule', 'Which GST applies on a supply, and who receives it?',
    'Within a state: CGST (to the Centre) and SGST (to the State), each half of the rate. From one state to another: IGST at the full rate, collected by the Centre.',
    'Compare the seller\'s state with the buyer\'s state. Same state: two taxes. Different states: one tax.',
    'A Pune dealer sells to a Nashik dealer: CGST + SGST. A Pune dealer sells to a Chennai dealer: IGST.',
    'Charging IGST on a sale within a state, or CGST and SGST on a sale to another state.'),
  card('thb-gst-calc', 'formula', 'How are GST and the invoice total worked out?',
    'GST = rate % of the taxable value. Within a state: CGST = SGST = half the GST. Invoice total = taxable value + GST. Trade discount is deducted before GST is calculated.',
    'GST is charged on the price after trade discount, not on the list price.',
    'Taxable value ₹50,000 at 18% within the state: GST ₹9,000; CGST ₹4,500; SGST ₹4,500; invoice ₹59,000.',
    'Charging GST on the list price, or taking the whole GST as CGST.'),
  card('thb-gst-calc', 'formula', 'How is GST payable after input tax credit found?',
    'GST payable = Output GST - Input tax credit, head by head: input CGST against output CGST, input SGST against output SGST, never one against the other.',
    'Work each head on its own. If the credit under a head is more than the output tax under it, nothing is payable under that head and the balance of credit is carried forward. (The order in which IGST credit is used across the heads goes beyond the syllabus.)',
    'Output CGST ₹9,000 and input CGST ₹6,000: CGST payable ₹3,000. Same for SGST: total payable ₹6,000.',
    'Adding the input credit to the output tax, or setting off input CGST against output SGST.'),
  card('thb-gst', 'rule', 'What are the characteristics and advantages of GST?',
    'One nation, one tax; a destination-based tax on the supply of goods and services; charged at every stage with input tax credit, so tax is not charged on tax; a dual tax (Centre and States); the final consumer bears it.',
    'Advantages: fewer indirect taxes, no cascading, a common national market and simpler compliance.',
    'A manufacturer pays ₹1,800 GST on inputs and collects ₹3,000 GST on sales, and so pays only ₹1,200 to the government.',
    'Thinking GST is charged only on the last sale, or that it is a tax on income.'),
  card('thb-principles', 'shortcut', 'How do you spot the principle behind a scenario?',
    'Find the one idea in it: owner versus business (entity); can it be stated in money; the year (period); what was paid or promised (cost); a likely loss (prudence); when the goods were delivered (revenue); same method as before (consistency); evidence (objectivity); an item too small to matter (materiality); a fact told to readers (disclosure); expense set against its revenue (matching).',
    'Ask yourself first what the accountant is protecting or measuring.',
    '"Closing stock is shown at the lower of cost and market price": a likely loss is provided for, so prudence.',
    'Choosing the first familiar name instead of the idea the scenario is about.'),
  card('thb-bases', 'shortcut', 'How do you split a prepaid payment between years?',
    'Cost per month = payment / months covered. Charge to this year = cost per month x months from the start date to the year end. The rest is a prepaid expense.',
    'Count the months from the first day of the month of payment up to 31 March, including the month of payment.',
    'Insurance of ₹24,000 for 12 months from 1 October, year end 31 March: ₹2,000 a month; 6 months this year = ₹12,000; prepaid ₹12,000.',
    'Counting one month too many or too few at either end.'),
  // Added after the check against the CBSE 2025-26 syllabus (docs/syllabus-coverage.md), which names the
  // applicability of AS and Ind AS. New cards go at the end, so that the ids of the cards before them do not change.
  card('thb-standards', 'rule', 'Who follows Ind AS, and who follows the Accounting Standards (AS)?',
    'Ind AS are compulsory for companies listed on a stock exchange in India or abroad (other than on an SME exchange) and for unlisted companies with a net worth of ₹250 crore or more, together with their holding, subsidiary, joint venture and associate companies; any other company may adopt them by choice. (Banks and insurance companies move to Ind AS on timetables set by their regulators.) Other companies follow the Accounting Standards notified for companies under the Companies Act, 2013, and non-corporate entities such as sole proprietors and partnership firms follow the Accounting Standards issued by the ICAI.',
    'Once a company has moved to Ind AS it cannot go back to AS. The two sets cover the same ground, but Ind AS follow IFRS closely.',
    'A listed steel company prepares its accounts under Ind AS; a small trader running a grocery shop as a sole proprietor follows the ICAI\'s Accounting Standards.',
    'Thinking that every business in India, a sole proprietor included, must follow Ind AS.'),
  // Added in the quality pass after the audit. The order of using IGST credit, which card 22 used to teach, is beyond
  // the syllabus: it has a card of its own, marked so, and stays off the card revision level.
  beyondCard(card('thb-gst-calc', 'rule', 'In what order is IGST credit used across the heads?',
    'Credit of IGST is used first: against output IGST, and then against output CGST and output SGST. Only then is input CGST set off against output CGST and input SGST against output SGST; a balance of either may then go against output IGST.',
    'The law fixes this order so that IGST credit is used up before the credit of the other heads.',
    'Output CGST ₹20,000 and output SGST ₹20,000; input IGST ₹10,000 used ₹5,000 against each; input CGST ₹8,000 and input SGST ₹8,000: CGST payable ₹7,000 and SGST payable ₹7,000.',
    'Setting input CGST against output SGST, or using CGST credit before the IGST credit.'), BEYOND_IGST_CROSS_SET_OFF),
  card('thb-gst', 'rule', 'What kind of accounts are Input GST and Output GST?',
    'Input CGST, SGST and IGST A/c are assets (debit balances): tax paid on purchases that the dealer will set off. Output CGST, SGST and IGST A/c are liabilities (credit balances): tax collected on sales and owed to the government.',
    'Neither is an expense or an income of the dealer. The tax payable for a period is the output tax less the input credit, head by head.',
    'Bought goods for ₹50,000 + 18% GST within the state: Purchases A/c Dr ₹50,000, Input CGST A/c Dr ₹4,500, Input SGST A/c Dr ₹4,500.',
    'Calling the GST paid on purchases an expense, or the GST collected on sales an income.'),
];

// ---------------------------------------------------------------------------------------------------------------
// Authored questions
// ---------------------------------------------------------------------------------------------------------------

const questions: Question[] = [];
let qNo = 0;
const nextId = () => `thb-q-${String(++qNo).padStart(3, '0')}`;

/** Multiple choice: the right option, three wrong ones each with the mistake behind it. The right option is not always first. */
function mcq(conceptId: string, difficulty: Difficulty, prompt: string, right: string, wrong: [string, string][], explanation: string, hints: string[] = []): string {
  const id = nextId();
  const at = qNo % 4;
  const items: { text: string; why?: string }[] = wrong.map(([text, why]) => ({ text, why }));
  items.splice(at, 0, { text: right });
  const q: McqQuestion = {
    id,
    topicId: T,
    conceptId,
    difficulty,
    type: 'mcq',
    prompt,
    options: items.map((o, i) => ({ id: 'abcd'[i], text: o.text, ...(o.why ? { why: o.why } : {}) })),
    correct: 'abcd'[at],
    explanation,
    hints: hints.length ? hints : ['Recall the exact idea each term stands for.', 'Rule out the options that describe a different principle or term.'],
  };
  questions.push(q);
  return id;
}

/** True or false. The statement often carries its own reason, and the explanation says which half is wrong when it is false. */
/** "True or false: " before a statement that has not got it; the first letter is lowered unless the word is a name (GAAP, Ind AS). */
const LEAD = 'True or false: ';
const withLead = (statement: string): string => {
  if (statement.startsWith(LEAD)) return statement;
  const first = statement.split(' ')[0];
  const lower = /^[A-Z][a-z]*$/.test(first) && first !== 'Ind';
  return LEAD + (lower ? statement[0].toLowerCase() + statement.slice(1) : statement);
};

function tf(conceptId: string, difficulty: Difficulty, prompt: string, correct: boolean, explanation: string): string {
  const id = nextId();
  const q: TrueFalseQuestion = {
    id,
    topicId: T,
    conceptId,
    difficulty,
    type: 'true_false',
    prompt: withLead(prompt),
    correct,
    explanation,
    hints: ['Check both the statement and the reason given in it.', 'A statement is true only if its reason is also true.'],
  };
  questions.push(q);
  return id;
}

/**
 * Assertion and reason, as a multiple-choice item. Say whether the assertion is true, whether the reason is true and,
 * if both are, whether the reason explains the assertion; the right option and a reason for each wrong one follow.
 */
function ar(conceptId: string, difficulty: Difficulty, assertion: string, reason: string, aTrue: boolean, rTrue: boolean, explains: boolean, explanation: string): string {
  const id = nextId();
  const code = aTrue && rTrue ? (explains ? 'a' : 'b') : aTrue ? 'c' : 'd';
  const texts: Record<string, string> = {
    a: 'Both A and R are true, and R is the correct explanation of A',
    b: 'Both A and R are true, but R is not the correct explanation of A',
    c: 'A is true, but R is false',
    d: 'A is false, but R is true',
  };
  const whyWrong: Record<string, string> = {
    a: !aTrue ? 'Called A true, but A is false.' : !rTrue ? 'Called R true, but R is false.' : 'Took R as the explanation of A, but it does not explain A.',
    b: aTrue && rTrue ? 'Judged that R does not explain A, but R is exactly the reason for A.' : 'Called both statements true, but one of them is false.',
    c: !aTrue ? 'Called A true, but A is false.' : 'Called R false, but R is true.',
    d: aTrue ? 'Called A false, but A is true.' : 'Called R true, but R is false.',
  };
  const q: McqQuestion = {
    id,
    topicId: T,
    conceptId,
    difficulty,
    type: 'mcq',
    prompt: `Assertion (A): ${assertion} Reason (R): ${reason} Which of the following is correct?`,
    options: ['a', 'b', 'c', 'd'].map((o) => ({ id: o, text: texts[o], ...(o === code ? {} : { why: whyWrong[o] }) })),
    correct: code,
    explanation,
    hints: ['Decide whether A is true, then whether R is true.', 'If both are true, ask whether R is the reason A holds.'],
  };
  questions.push(q);
  return id;
}

// --- GAAP ---------------------------------------------------------------------------------------------------------

mcq('thb-gaap', 'easy', 'Accounting rules are described as "generally accepted" when:',
  'the accounting profession and the users of accounts widely agree to follow them',
  [
    ['one business adopts them for its own books', 'Took one firm\'s own practice for general acceptance; acceptance is by the profession and users as a whole.'],
    ['the owner of a firm approves them each year', 'Thought the owner grants acceptance; the profession and users do.'],
    ['they give the highest profit to the firm', 'Mixed acceptance with convenience; rules are accepted because they give fair and comparable accounts, not high profit.'],
  ],
  'GAAP draw their authority from wide agreement and practice, which is what makes them "generally accepted".');
tf('thb-gaap', 'easy', 'GAAP are the same in every country, because accounting is a universal language.', false,
  'False. GAAP differ from country to country, which is why standards such as IFRS and Ind AS aim at convergence.');
ar('thb-gaap', 'medium', 'GAAP help users compare the accounts of different firms.',
  'GAAP narrow the alternative treatments available for similar transactions.', true, true, true,
  'Because GAAP limit the choice of treatments, similar transactions are recorded in similar ways, and so the accounts can be compared.');
tf('thb-gaap', 'easy', 'Once framed, GAAP cannot change, because accountants have always followed the same rules.', false,
  'False. GAAP change as business practices, law and the needs of users change.');
mcq('thb-gaap', 'medium', 'Accounting principles are called "guides" rather than "laws" because they:',
  'are developed from practice and agreement and are not themselves legal rules',
  [
    ['are decided afresh by each auditor each year', 'Thought every auditor invents them; they are accepted by the profession as a whole.'],
    ['apply only to the final accounts of a sole trader', 'Limited them to one kind of business; they apply to all.'],
    ['are not followed by any business', 'Confused "not laws" with "ignored"; they are widely followed.'],
  ],
  'Principles come from practice and agreement. They guide accountants, though some are given legal force by company law and standards.');

// --- Assumptions --------------------------------------------------------------------------------------------------

mcq('thb-assumptions', 'easy', 'Which of the following lists the three fundamental accounting assumptions named in Accounting Standard 1 (AS-1)?',
  'Going concern, consistency, accrual',
  [
    ['Going concern, prudence, matching', 'Counted prudence and matching among the three; AS-1 does not name them as fundamental assumptions.'],
    ['Business entity, money measurement, dual aspect', 'Listed three basic concepts; none of these is one of the fundamental assumptions.'],
    ['Consistency, materiality, accrual', 'Counted materiality among the three and left out going concern.'],
  ],
  'AS-1 names going concern, consistency and accrual as the three fundamental accounting assumptions.');
tf('thb-assumptions', 'medium', 'A bakery shows its ovens at cost less depreciation and not at their quick-sale value, because it assumes it will continue in business.', true,
  'True. The going concern assumption justifies carrying assets at cost less depreciation instead of the amount they would fetch in a hurried sale.');
mcq('thb-assumptions', 'easy', 'A firm changes its depreciation method every year to keep its profit high. Which fundamental assumption is not being followed?',
  'Consistency',
  [
    ['Going concern', 'Thought changing methods shows the firm is closing; going concern is about continuing in business.'],
    ['Accrual', 'Took the issue to be timing of income and expenses; the problem is the change of method.'],
    ['Dual aspect', 'Dual aspect is about the two sides of a transaction, not about methods, and it is not one of the three fundamental assumptions.'],
  ],
  'Following the same methods from year to year is the consistency assumption; changing them to alter profit defeats comparison.');
ar('thb-assumptions', 'medium', 'The accounts of different years of a firm can be compared with each other.',
  'The firm follows the same accounting methods from year to year.', true, true, true,
  'The consistency assumption keeps methods the same, so the results of different years are measured alike and can be compared.');
mcq('thb-assumptions', 'medium', 'Under the accrual assumption, rent for March that is paid in April is:',
  'an expense of March, with the unpaid amount shown as outstanding at 31 March',
  [
    ['an expense of April, since the payment is made in April', 'Followed the cash basis: under accrual the expense belongs to the period in which it is incurred.'],
    ['ignored until the payment is made', 'Ignored an expense already incurred; unpaid amounts are recorded as outstanding.'],
    ['an asset at 31 March', 'Took an unpaid expense for an asset; it is a liability, outstanding expense.'],
  ],
  'Accrual records costs when they are incurred, whatever the date of payment, so March rent is an expense of March.');
tf('thb-assumptions', 'medium', 'A firm that has decided to wind up next month can still prepare its accounts on the going concern assumption, because the accounts follow the same rules every year.', false,
  'False. Going concern assumes the business will continue for the foreseeable future; a firm about to close does not meet it, and its assets should be shown at amounts they will realise.');
mcq('thb-assumptions', 'complex', 'Consistency does not forbid every change of accounting method. A change is acceptable when:',
  'the law or a standard requires it, or the new method gives a truer picture, and the change is disclosed',
  [
    ['the owner wants a higher profit this year', 'Allowed a change made to alter profit, which defeats comparison.'],
    ['it would reduce the tax to be paid', 'Treated tax saving as a reason; an accounting change needs an accounting reason.'],
    ['the accountant prefers the other method', 'Treated a personal preference as enough; a change needs a sound reason and disclosure.'],
  ],
  'A change of method is allowed for a good reason such as a legal requirement or a truer view, and it must be disclosed with its effect.');

// --- Principles and concepts --------------------------------------------------------------------------------------

mcq('thb-principles', 'easy', 'Under the business entity concept, the capital brought in by a proprietor is shown in the books as:',
  'a liability of the business to the proprietor',
  [
    ['an income of the business', 'Took capital for income; it does not increase profit.'],
    ['an asset of the business', 'Called capital an asset; it is what the business owes the owner.'],
    ['a loan from outsiders', 'Took the owner\'s money for outsiders\' money; capital comes from the owner.'],
  ],
  'The business is separate from its owner, so the money the owner puts in is owed by the business to the owner.');
tf('thb-principles', 'easy', 'The proprietor\'s personal expenses may be charged to the business as expenses, because the owner and the business are one person.', false,
  'False. Under the business entity concept the owner and the business are separate, so personal expenses are drawings, not business expenses.');
mcq('thb-principles', 'easy', 'Which of the following will be recorded in the books of a firm?',
  'Purchase of a computer for ₹60,000',
  [
    ['The excellent skill of the manager', 'Tried to record something that cannot be measured in money.'],
    ['Good relations with customers', 'Good relations cannot be expressed in money, so they are not recorded.'],
    ['A forecast that sales will rise next year', 'A forecast is not a transaction that has taken place.'],
  ],
  'Money measurement: only transactions that can be expressed in money are recorded.');
ar('thb-principles', 'medium', 'A firm does not record the loyalty of its workers in its books.',
  'Only transactions that can be expressed in money are recorded.', true, true, true,
  'Loyalty cannot be measured in money, so under the money measurement concept it is left out.');
mcq('thb-principles', 'easy', 'Under the accounting period concept, the profit of a business is usually found for:',
  'a period of twelve months',
  [
    ['the whole life of the business, once it closes', 'Thought profit waits for closure; users need results at regular intervals.'],
    ['one month, for every firm', 'Took a month as the fixed period; the usual period is a year.'],
    ['five years at a time', 'Invented a long period; yearly accounts are the rule.'],
  ],
  'Profit is measured for a fixed period, usually a year, because users and the tax authorities need regular results.');
tf('thb-principles', 'easy', 'Under the accounting period concept, profit is calculated only when a business is closed down, because only then is the result final.', false,
  'False. Profit is measured at regular intervals, usually every year, without waiting for the business to close.');
mcq('thb-principles', 'medium', 'Which of the following is an example of the full disclosure principle?',
  'Mentioning a pending court case against the firm in a note under the balance sheet',
  [
    ['Charging a ₹200 pencil sharpener to expenses at once', 'This is materiality: a trivial item is treated in the simplest way.'],
    ['Valuing stock at the lower of cost and market value', 'This is prudence: a likely loss is provided for.'],
    ['Recording a purchase of furniture in two accounts', 'This is the dual aspect concept.'],
  ],
  'Full disclosure means telling readers facts that could affect their decisions, often in notes to the accounts.');
mcq('thb-principles', 'medium', 'For a large firm, which of these would most likely be treated as "not material"?',
  'Pins and paper clips costing ₹300',
  [
    ['A delivery vehicle costing ₹7,50,000', 'A large item that clearly matters, so it is recorded as an asset.'],
    ['A court claim of ₹20,00,000 against the firm', 'A large claim could affect a reader\'s decision and must be disclosed.'],
    ['A bank loan of ₹10,00,000', 'A large liability that readers need to see.'],
  ],
  'Materiality allows trivial items to be written off at once or left in a simple heading; large items matter.');
tf('thb-principles', 'medium', 'Materiality means that every small item, however trivial, must be shown separately, so that nothing is hidden from the reader.', false,
  'False. Materiality says that only items large enough to affect decisions need separate attention; trivial items can be dealt with simply.');
mcq('thb-principles', 'medium', 'Which of these follows the prudence principle?',
  'Providing for an expected loss but not recording an expected profit',
  [
    ['Recording an expected profit as soon as it looks likely', 'Anticipated a profit, which prudence forbids.'],
    ['Recording neither expected profits nor expected losses', 'Left out the likely loss; prudence provides for it.'],
    ['Valuing stock at its expected selling price', 'This would record an unearned profit in the stock figure.'],
  ],
  'Prudence: provide for all likely losses, anticipate no profits.');
mcq('thb-principles', 'medium', 'Closing stock cost ₹80,000 and could now be sold for ₹72,000. Following prudence, it is shown at:',
  '₹72,000',
  [
    ['₹80,000', 'Kept the stock at cost and ignored the likely loss.'],
    ['₹76,000', 'Took an average of the two; prudence needs the lower figure.'],
    ['₹8,000', 'Gave the loss instead of the value of the stock.'],
  ],
  'Stock is valued at the lower of cost and net realisable value: the lower figure is ₹72,000.');
ar('thb-principles', 'medium', 'Stock is valued at cost or net realisable value, whichever is lower.',
  'Prudence requires that likely losses be provided for but unrealised profits not be anticipated.', true, true, true,
  'Valuing stock at the lower figure provides for a likely loss and does not record a profit that has not yet been earned: this is prudence.');
mcq('thb-principles', 'easy', 'A machine was bought for ₹5,00,000 and could now be sold for ₹7,00,000. Ignoring depreciation, the historical cost concept shows it in the books at:',
  '₹5,00,000',
  [
    ['₹7,00,000', 'Used the market price, which the historical cost concept does not record.'],
    ['₹2,00,000', 'Gave the increase in value instead of the machine\'s cost.'],
    ['₹6,00,000', 'Took an average of cost and market price; the books keep the cost.'],
  ],
  'Assets stay at cost (less depreciation); a rise in market price is not entered.');
tf('thb-principles', 'medium', 'Under the historical cost concept, a rise in the market value of land is recorded as a profit in the year it happens, because the business has become richer.', false,
  'False. The land stays at cost. A rise in market value is not recorded until it is realised by a sale.');
mcq('thb-principles', 'medium', 'The matching concept requires that:',
  'the expenses of a period are set against the revenue earned in that period',
  [
    ['total debits equal total credits', 'Mixed matching up with the dual aspect concept.'],
    ['assets equal liabilities plus capital', 'This is the accounting equation, from the dual aspect concept.'],
    ['cash received equals cash paid', 'Mixed matching up with the cash basis; matching compares expenses with revenue, not receipts with payments.'],
  ],
  'Matching sets the cost of earning revenue against that revenue, in the same period.');
mcq('thb-principles', 'medium', 'Salary for March, paid on 5 April, is charged to the year ending 31 March. This is mainly justified by:',
  'the matching concept: the salary helped to earn that year\'s revenue',
  [
    ['the money measurement concept', 'Money measurement decides what is recorded, not which year it belongs to.'],
    ['the historical cost concept', 'Historical cost concerns the value of assets, not salaries.'],
    ['the business entity concept', 'Business entity separates owner and business; it does not decide the year.'],
  ],
  'The March salary is an expense of earning March revenue, so it is matched with that revenue in the year ending 31 March. The accrual assumption points the same way: the salary is recorded when it is incurred.');
mcq('thb-principles', 'easy', 'The dual aspect concept means that:',
  'every transaction has two equal effects, so Assets = Liabilities + Capital always holds',
  [
    ['the business keeps two sets of books', 'Thought "dual" means two books; it means two aspects of each transaction.'],
    ['each transaction is entered twice in the same account', 'Entered twice in one account; the two entries go to different accounts.'],
    ['profit is shown in two accounts', 'Mixed dual aspect up with the final accounts.'],
  ],
  'Every transaction has a receiving side and a giving side of equal amount.');
tf('thb-principles', 'easy', 'When a trader buys goods for cash, the dual aspect is satisfied because both the goods and the cash are recorded.', true,
  'True. Purchases (goods received) are debited and cash (given) is credited, with equal amounts.');
mcq('thb-principles', 'medium', 'A firm receives an advance of ₹50,000 in March for goods to be delivered in May. Its revenue for the year ending 31 March:',
  'does not include the ₹50,000, because the goods have not been delivered',
  [
    ['includes the ₹50,000 because cash has been received', 'Followed the cash receipt; revenue is recognised on delivery.'],
    ['includes ₹25,000, half the advance', 'Invented a split; nothing is earned until delivery.'],
    ['includes the ₹50,000 because the order is firm', 'Treated an order as a sale; revenue needs delivery.'],
  ],
  'Revenue recognition: revenue is recognised when it is earned, generally on delivery. The advance is a liability until then.');
mcq('thb-principles', 'medium', 'A firm closes its books on 31 March every year. Goods are sold and delivered on credit on 29 March 2026, and the money comes in on 15 May 2026. In which accounting year is the sale recognised?',
  'The year ended 31 March 2026, in which the goods were sold',
  [
    ['The year ending 31 March 2027, in which the cash is received', 'Followed cash receipt; credit sales are recognised when made.'],
    ['Half in each year', 'Invented a split.'],
    ['Whichever year the owner chooses', 'Treated it as a choice; the principle fixes the year.'],
  ],
  'A credit sale is recognised when the goods are delivered, whatever the date of payment.');
ar('thb-principles', 'medium', 'A credit sale made on 30 March is included in the sales of the year ending 31 March.',
  'Revenue is recognised when goods are sold and delivered, not when cash is received.', true, true, true,
  'The sale is complete in March; cash is not needed for recognition.');
mcq('thb-principles', 'easy', 'Which document best supports the entry for a cash purchase of goods?',
  'The cash memo issued by the supplier',
  [
    ['The owner\'s own estimate of the purchase', 'An estimate cannot be verified by others.'],
    ['A letter praising the supplier', 'A letter is not evidence of the transaction.'],
    ['Next year\'s budget', 'A budget is a forecast, not evidence of a purchase made.'],
  ],
  'Verifiable objectivity: entries rest on documents such as cash memos, bills and receipts.');
tf('thb-principles', 'easy', 'Verifiable objectivity means that entries should rest on evidence, such as vouchers, that different persons can check.', true,
  'True. This makes the books reliable and lets an auditor verify them.');
mcq('thb-principles', 'medium', 'Which pair correctly matches a treatment with its principle?',
  'Writing off a ₹200 stapler at once: materiality',
  [
    ['Showing furniture at its purchase price: prudence', 'Showing assets at cost is the historical cost concept.'],
    ['Charging March salary to March: money measurement', 'This is matching (and accrual), not money measurement.'],
    ['Not recording the manager\'s skill: historical cost', 'This is money measurement.'],
  ],
  'A trivial item written off at once is materiality; the others are paired with the wrong principle.');
mcq('thb-principles', 'medium', 'A proprietor pays a child\'s school fees from the business cash, and the amount is debited to Salaries A/c. Which concept is violated?',
  'Business entity',
  [
    ['Going concern', 'Going concern is about the business continuing; the mistake here is mixing owner and business.'],
    ['Materiality', 'Materiality is about the size of an item; the mistake is about whose expense it is.'],
    ['Revenue recognition', 'Nothing in the case concerns the timing of revenue.'],
  ],
  'School fees are the owner\'s personal expense; they should be drawings. The business entity concept is broken.');
tf('thb-principles', 'medium', 'Under the business entity concept, the owner\'s capital is not a liability of the business, because the owner and the business are the same person.', false,
  'False. The owner and the business are separate, so capital is an amount the business owes to its owner.');
mcq('thb-principles', 'complex', 'Which statement about prudence and historical cost is correct?',
  'Prudence can require stock to be shown below its cost, while historical cost records a fixed asset at the price paid for it',
  [
    ['Both require every asset to be shown at market value', 'Neither does: historical cost uses cost, and prudence uses the lower of cost and market for stock.'],
    ['Prudence requires expected gains to be recorded as they arise', 'It requires the opposite: gains are not anticipated.'],
    ['Historical cost requires stock to be shown at its selling price', 'Historical cost uses the price paid, not the selling price.'],
  ],
  'Prudence applies a lower-of test to stock; historical cost records fixed assets at cost less depreciation. The two work together.');
mcq('thb-principles', 'complex', 'A firm records a machine bought for ₹3,00,000 together with ₹10,000 freight and ₹15,000 installation as ₹3,25,000. This follows:',
  'the historical cost concept: cost includes what is paid to bring the asset into working condition',
  [
    ['the materiality principle', 'Materiality is about trivial items; this is about what the cost of an asset includes.'],
    ['the prudence principle', 'Prudence provides for likely losses; this is about recording cost.'],
    ['the consistency assumption', 'Consistency concerns methods from year to year.'],
  ],
  'Cost includes freight and installation, which are needed to bring the machine to working condition.');
ar('thb-principles', 'complex', 'A shop that owns land bought years ago for ₹10,00,000 still shows it at ₹10,00,000 although it is now worth ₹25,00,000.',
  'The prudence principle requires that assets always be shown at market value.', true, false, false,
  'A is true (historical cost keeps the land at cost). R is false: prudence does not require market value; the rise in value is not recorded because assets are kept at cost.');
ar('thb-principles', 'medium', 'Goods taken by the proprietor for personal use are not treated as an expense of the business.',
  'The business and its owner are treated as separate entities.', true, true, true,
  'Because the owner and the business are separate, the owner\'s withdrawals are drawings, not expenses.');

// --- Systems of accounting ----------------------------------------------------------------------------------------

mcq('thb-systems', 'easy', 'Which of the following is a feature of the double entry system?',
  'Every transaction is recorded in two accounts, with equal debit and credit',
  [
    ['Only cash transactions are recorded', 'Thought it covers cash only; all transactions are recorded.'],
    ['Records are kept for personal accounts only', 'Took it for a partial system; double entry covers personal, real and nominal accounts.'],
    ['A trial balance cannot be prepared', 'Reversed it: the equality of debits and credits is what makes a trial balance possible.'],
  ],
  'Double entry records both aspects of every transaction with equal amounts on the two sides.');
tf('thb-systems', 'medium', 'If the trial balance of a firm using double entry agrees, the books are proved to be free from all errors, because total debits equal total credits.', false,
  'False. An agreeing trial balance shows only that the totals match. A transaction left out altogether, a posting to the wrong account on the correct side, an error of principle and compensating errors can all still be present.');
mcq('thb-systems', 'medium', 'Which of the following is NOT an advantage of the double entry system?',
  'It is the cheapest and simplest system for a very small trader',
  [
    ['It gives a complete record of every transaction', 'This is an advantage of double entry.'],
    ['Its trial balance helps to test arithmetical accuracy', 'This is an advantage of double entry.'],
    ['It allows profit and financial position to be found accurately', 'This is an advantage of double entry.'],
  ],
  'Double entry is complete and reliable, but it needs more work than a simple system, so it is not the cheapest or simplest.');
mcq('thb-systems', 'easy', 'The single entry system is best described as:',
  'an incomplete system in which some transactions are recorded in two accounts, some in one and some not at all',
  [
    ['a fully scientific system recording both aspects of every transaction', 'This describes double entry.'],
    ['a system in which every transaction is recorded in exactly one book of original entry', 'Confused the single entry system with the use of a single book.'],
    ['a system in which only the capital account is kept', 'Invented a restriction; single entry usually keeps a cash book and personal accounts.'],
  ],
  'Single entry is incomplete and not uniform, which is why it cannot give a trial balance.');
tf('thb-systems', 'easy', 'A trial balance can be prepared from books kept on the single entry system, because every transaction is recorded in two accounts.', false,
  'False. Single entry is incomplete: not every transaction is recorded in two accounts, so there is no trial balance.');
mcq('thb-systems', 'medium', 'Which accounts are generally not kept under the single entry system?',
  'Accounts of expenses and incomes, and most accounts of assets other than cash and debtors',
  [
    ['Accounts of customers who owe money', 'These personal accounts are usually kept.'],
    ['The cash book', 'The cash book is usually the one record kept.'],
    ['Accounts of creditors', 'Accounts of those to whom the trader owes money are usually kept.'],
  ],
  'Single entry usually keeps a cash book and personal accounts; nominal accounts and most real accounts are not kept.');

// --- Cash basis and accrual basis ---------------------------------------------------------------------------------

mcq('thb-bases', 'easy', 'Under the cash basis of accounting, income is recorded when:',
  'cash is actually received',
  [
    ['it is earned', 'This is the accrual basis.'],
    ['the order is received', 'An order is not income on either basis.'],
    ['the invoice is printed', 'Printing an invoice does not decide when income is recorded.'],
  ],
  'On the cash basis items are recorded when cash is received or paid.');
mcq('thb-bases', 'easy', 'Under the accrual basis, the expenses of a year are:',
  'those incurred in the year, whether or not they have been paid',
  [
    ['those paid in cash in the year', 'This is the cash basis.'],
    ['those above ₹10,000', 'Invented a size test; expenses of all sizes belong to the year they are incurred.'],
    ['those the owner approves', 'Approval does not decide the period.'],
  ],
  'Accrual records costs when incurred, so unpaid expenses are included and prepaid ones are carried forward.');
tf('thb-bases', 'medium', 'On a purely cash basis, outstanding and prepaid expenses do not appear in the accounts, because only cash received and paid is recorded.', true,
  'True. Outstanding and prepaid items arise only when the accrual basis is followed.');
ar('thb-bases', 'medium', 'The profit of a year on the accrual basis can differ from the profit on the cash basis.',
  'The accrual basis takes account of income earned but not received and expenses incurred but not paid.', true, true, true,
  'The accrual basis adjusts for these items, which the cash basis ignores, so the two profits can differ.');
mcq('thb-bases', 'medium', 'Which of the following is a weakness of the cash basis?',
  'It does not match the income of a period with the expenses of the same period',
  [
    ['It needs complex adjustments for outstanding and prepaid items', 'These adjustments belong to the accrual basis.'],
    ['It cannot show the cash balance', 'The cash basis shows the cash balance directly.'],
    ['It can be used only with double entry', 'Basis and system are different things; the cash basis can be used with either.'],
  ],
  'Because it follows cash movements, the cash basis can put an expense and its revenue in different years.');
mcq('thb-bases', 'easy', 'Another name for the accrual basis of accounting is:',
  'the mercantile basis',
  [
    ['the cash basis', 'This is the other basis.'],
    ['the receipts and payments basis', 'This describes the cash basis.'],
    ['the single entry basis', 'Single entry is a system, not a basis.'],
  ],
  'The accrual basis is also called the mercantile basis.');
mcq('thb-bases', 'medium', 'A firm receives ₹40,000 in March as rent for the next year. On the accrual basis, for the year ending 31 March, the ₹40,000 is:',
  'not income of the year; it is rent received in advance, a liability',
  [
    ['income of the year just ended', 'Counted cash received as income; the rent is not yet earned.'],
    ['an expense of the year', 'Rent received is an income item, not an expense.'],
    ['capital introduced by the owner', 'Rent from a tenant is not capital brought in by the owner.'],
  ],
  'Income is recognised when earned; money received for a future period is a liability until it is earned.');

// --- Accounting standards, IFRS and Ind AS ------------------------------------------------------------------------

mcq('thb-standards', 'easy', 'Accounting standards are:',
  'detailed written rules for treating particular items in the accounts',
  [
    ['optional suggestions that a firm may ignore', 'Thought they are not binding; those they apply to must follow them.'],
    ['the ledger accounts of a firm', 'Mixed standards up with accounts.'],
    ['laws on indirect taxes', 'Mixed accounting standards up with tax laws such as GST.'],
  ],
  'Standards are written policy documents that give detailed rules for recording and reporting particular items.');
tf('thb-standards', 'easy', 'Accounting standards in India are issued by the Reserve Bank of India, because RBI regulates all financial matters.', false,
  'False. In India accounting standards are formulated by the Institute of Chartered Accountants of India (ICAI) and, for companies, notified by the Central Government.');
mcq('thb-standards', 'medium', 'Which of the following is an objective of accounting standards?',
  'To harmonise accounting policies and reduce the alternative treatments of the same item',
  [
    ['To fix the profit a firm should show', 'Standards set how items are treated, not what profit a firm shows.'],
    ['To abolish depreciation', 'Standards deal with depreciation; they do not abolish it.'],
    ['To remove the need for an audit', 'Standards do not replace the audit.'],
  ],
  'Standards bring uniformity and comparability by limiting the choice of treatments.');
mcq('thb-standards', 'easy', 'Ind AS are based on:',
  'IFRS',
  [
    ['the GST law', 'GST is a tax law, not a source of accounting standards.'],
    ['the Income Tax Act', 'Tax law is separate from accounting standards.'],
    ['the Indian Contract Act', 'The Contract Act deals with agreements, not accounting treatment.'],
  ],
  'Ind AS are Indian standards converged with IFRS.');
tf('thb-standards', 'easy', 'IFRS are issued by the International Accounting Standards Board (IASB).', true,
  'True. The IASB issues IFRS; ICAI frames the Indian standards.');
ar('thb-standards', 'medium', 'India has converged its accounting standards for many companies with IFRS in the form of Ind AS.',
  'Common standards make the accounts of companies in different countries easier to compare.', true, true, true,
  'Convergence is meant to make Indian accounts comparable with accounts elsewhere.');
mcq('thb-standards', 'medium', 'A foreign investor finds it easier to read the accounts of an Indian company that follows Ind AS mainly because:',
  'Ind AS are converged with IFRS, which many countries follow',
  [
    ['Ind AS remove the need for an audit', 'Standards do not remove the audit.'],
    ['Ind AS make every company show the same profit', 'Standards do not equalise profit.'],
    ['Ind AS are issued by the investor\'s own country', 'Ind AS are Indian standards, though based on IFRS.'],
  ],
  'Since Ind AS follow IFRS, an investor used to IFRS finds the accounts familiar.');
mcq('thb-standards', 'medium', 'Which pair is correctly matched?',
  'IASB: IFRS',
  [
    ['ICAI: IFRS', 'ICAI frames Indian standards; IFRS come from the IASB.'],
    ['RBI: Ind AS', 'Ind AS are notified by the Ministry of Corporate Affairs, not by RBI.'],
    ['GST Council: Accounting Standards', 'The GST Council deals with GST, not accounting standards.'],
  ],
  'IFRS are issued by the International Accounting Standards Board.');
tf('thb-standards', 'complex', 'Ind AS and IFRS are identical in every respect, because Ind AS are converged with IFRS.', false,
  'False. Ind AS follow IFRS closely but differ in some places to suit Indian conditions.');

// --- GST ----------------------------------------------------------------------------------------------------------

mcq('thb-gst', 'easy', 'GST is levied on:',
  'the supply of goods and services',
  [
    ['the income of a person', 'This is income tax.'],
    ['the profit of a firm', 'GST is on supplies, not on profit.'],
    ['the ownership of property', 'GST is not a property tax.'],
  ],
  'GST is a tax on the supply of goods and services.');
mcq('thb-gst', 'easy', 'Which tax is levied on a supply of goods from a dealer in Gujarat to a dealer in Maharashtra?',
  'IGST',
  [
    ['CGST and SGST', 'This pair applies when both parties are in the same state.'],
    ['CGST only', 'The Centre\'s half alone is charged only as part of the within-state pair.'],
    ['SGST only', 'The State\'s half alone is charged only as part of the within-state pair.'],
  ],
  'The supply crosses a state border, so IGST is charged.');
mcq('thb-gst', 'medium', 'A dealer in Kerala sells goods to a customer in Kerala. Which statement is correct?',
  'CGST goes to the Central Government and SGST goes to the Government of Kerala',
  [
    ['Both CGST and SGST go to the Central Government', 'SGST goes to the State.'],
    ['Both CGST and SGST go to the Government of Kerala', 'CGST goes to the Centre.'],
    ['IGST goes to the Government of Kerala', 'IGST is not charged on a supply within a state.'],
  ],
  'On a supply within a state, the Centre receives CGST and the State receives SGST.');
tf('thb-gst', 'easy', 'On a supply within a state, a GST rate of 18% means 9% CGST and 9% SGST, because the rate is shared equally between the Centre and the State.', true,
  'True. Within a state the rate is split equally; the total is still 18%.');
tf('thb-gst', 'medium', 'On an inter-state supply, IGST is charged at half the GST rate, because the Centre and the State share it.', false,
  'False. IGST is charged at the full rate (for example 18%); the Centre collects it and passes the destination state\'s share on.');
mcq('thb-gst', 'easy', 'Input tax credit means:',
  'credit for the GST paid on purchases, which is set off against the GST payable on sales',
  [
    ['a loan given by the government to pay GST', 'It is not a loan; it is a set-off.'],
    ['a discount given by the supplier for early payment', 'This is cash discount, which has nothing to do with GST.'],
    ['a refund of GST to the customer', 'Credit is claimed by the registered business, not refunded to customers.'],
  ],
  'Input tax credit lets a business deduct the tax it paid on purchases from the tax it collects on sales.');
ar('thb-gst', 'medium', 'Input tax credit helps to avoid the cascading effect of taxes.',
  'Under GST, tax paid on purchases can be set off against tax payable on sales.', true, true, true,
  'Because tax already paid on inputs is set off, tax is not charged on tax.');
mcq('thb-gst', 'medium', 'In the books of a trader, Output CGST A/c is:',
  'a liability, credited when GST is collected on sales',
  [
    ['an asset, debited when GST is collected on sales', 'Output tax is owed to the government, so it is a liability.'],
    ['an expense of the business', 'The tax collected is not a cost of the seller.'],
    ['an income of the business', 'The seller does not keep the tax; it is paid over.'],
  ],
  'Output tax is a liability to the government until paid or set off against input credit.');
mcq('thb-gst', 'medium', 'Which of the following is a characteristic of GST?',
  'It is a destination-based tax on the consumption of goods and services',
  [
    ['It is an origin-based tax collected only where goods are made', 'GST is destination based, not origin based.'],
    ['It is a direct tax on income', 'GST is an indirect tax on supplies.'],
    ['It is charged only on goods and not on services', 'It applies to both goods and services.'],
  ],
  'GST is levied on the supply of goods and services and is destination based, so the consumer bears it.');
mcq('thb-gst', 'easy', 'Which of the following is an advantage of GST?',
  'It reduces the cascading effect of tax (tax on tax)',
  [
    ['It allows tax to be charged at each stage without credit', 'Credit for tax paid earlier is the feature that stops tax on tax.'],
    ['It increases the number of indirect taxes', 'GST merged many indirect taxes into one.'],
    ['It taxes only the manufacturer', 'GST is charged at every stage of supply.'],
  ],
  'Input tax credit removes tax on tax; GST also merges many taxes and creates a common national market.');
tf('thb-gst', 'medium', 'Input CGST can be set off against output SGST, because both are parts of the same GST.', false,
  'False. Input CGST is set off against output CGST, and input SGST against output SGST. The two are separate heads: CGST credit cannot be used against SGST, nor SGST credit against CGST, though both are parts of GST.');
mcq('thb-gst-calc', 'medium', 'A trader\'s output GST for a month is ₹30,000, and the input tax credit available under the same heads is ₹22,000. How much GST is paid in cash?',
  '₹8,000',
  [
    ['₹52,000', 'Added the credit to the output tax instead of deducting it.'],
    ['₹22,000', 'Gave the credit instead of the tax left to pay.'],
    ['₹30,000', 'Ignored the input tax credit.'],
  ],
  'GST payable = output GST - input tax credit = ₹30,000 - ₹22,000 = ₹8,000.');

// ---------------------------------------------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------------------------------------------

const idsOf = (...c: string[]): string[] => questions.filter((q) => c.includes(q.conceptId)).map((q) => q.id);

const recOne = idsOf('thb-gaap', 'thb-assumptions', 'thb-bases');
// Level 3 had all 30 questions on the principles; it keeps the first 15 (the same level, the same id), and the other 15
// stand on a later level of their own, "More Principles and Concepts" (see the end of the file).
const principleIds = idsOf('thb-principles');
const recTwo = principleIds.slice(0, 15);
const recTwoMore = principleIds.slice(15);
const recThree = idsOf('thb-systems', 'thb-standards', 'thb-gst', 'thb-gst-calc');

const levels = buildLadder(T, {
  concept: {
    title: 'Why Accounting Needs Rules',
    description: 'See why accountants follow agreed rules, and meet the assumptions, principles, bases and GST in plain words.',
    lesson: [
      {
        type: 'text',
        heading: 'One event, one way to record it',
        body: 'Suppose two shopkeepers each lose goods in a fire. One records the loss this year, the other waits until the claim is settled. Their profits cannot be compared. To prevent this, accountants follow generally accepted accounting principles (GAAP): rules that the profession and the users of accounts agree on, so that similar events are recorded in similar ways.',
      },
      {
        type: 'text',
        heading: 'Assumptions and principles',
        body: 'Accounts rest on three basic assumptions: the business will continue (going concern), the same methods are used from year to year (consistency), and items are recorded when earned or incurred (accrual). On top of these sit principles: the business is separate from its owner, only what money can measure is recorded, profit is found for a fixed period, assets are shown at cost, likely losses are provided for but profits are not anticipated, revenue counts when goods are delivered, expenses are set against the revenue they earned, and entries need evidence.',
      },
      {
        type: 'example',
        title: 'Bought furniture for ₹20,000 in cash: the dual aspect',
        lines: [
          { accountId: 'furniture', side: 'Dr', amount: 2000000 },
          { accountId: 'cash', side: 'Cr', amount: 2000000 },
        ],
        note: 'Every transaction has two equal sides: furniture comes in and cash goes out. That is why Assets = Liabilities + Capital always holds, and it is the base of the double entry system.',
      },
      {
        type: 'text',
        heading: 'Cash basis and accrual basis',
        body: 'A tutor teaches in March but is paid in April. On the cash basis the fee is April income, when the money arrives. On the accrual basis it is March income, because it was earned in March, and the unpaid fee is shown as due. Most businesses use the accrual basis, because it sets the income of a period against the expenses of the same period.',
      },
      {
        type: 'text',
        heading: 'GST in one example',
        body: 'GST is charged on every supply of goods and services, with credit for the tax paid on purchases. A dealer sells goods worth ₹10,000 at 18% GST. Within the state, the ₹1,800 splits into CGST ₹900 for the Centre and SGST ₹900 for the State. To another state, the whole ₹1,800 is charged as IGST. The buyer pays ₹11,800 in either case.',
      },
      {
        type: 'working',
        title: 'Name the principle: three decisions at Joshi Bakery, Nagpur',
        lines: [
          'Groceries of ₹6,000 for the owner\'s home were paid from the bakery\'s cash and debited to Purchases. The owner and the bakery are separate, so this violates the business entity concept: the ₹6,000 is drawings.',
          'A new oven costing ₹2,40,000, expected to last 10 years, is charged at ₹24,000 a year. The bakery expects to carry on, so this follows the going concern assumption.',
          'An advance of ₹15,000 for a wedding cake to be delivered in April is not counted in the sales of the year ended 31 March. Nothing has been delivered, so this follows revenue recognition: the advance is a liability until then.',
          'In each case, ask first what the decision is about: whose money, how long the business lasts, or when revenue is earned. That idea names the principle.',
        ],
        note: 'Watch out: decide whether the treatment follows or breaks the principle before naming it. Debiting the owner\'s groceries to Purchases is about business entity, and it breaks it.',
      },
      {
        type: 'working',
        title: 'From cash-basis profit to accrual profit: Sunrise Coaching Centre',
        lines: [
          'Fees received in cash ₹6,40,000 include ₹40,000 received in advance for next year; fees of ₹25,000 for March are still to come. Expenses paid ₹2,10,000 include ₹12,000 rent paid in advance for April; salaries of ₹18,000 for March are unpaid.',
          'Cash-basis profit = ₹6,40,000 - ₹2,10,000 = ₹4,30,000.',
          'Income earned in the year = ₹6,40,000 - ₹40,000 (advance) + ₹25,000 (accrued) = ₹6,25,000.',
          'Expenses incurred in the year = ₹2,10,000 - ₹12,000 (prepaid) + ₹18,000 (outstanding) = ₹2,16,000.',
          'Accrual profit = ₹6,25,000 - ₹2,16,000 = ₹4,09,000.',
          'Check: ₹4,30,000 + ₹25,000 + ₹12,000 - ₹40,000 - ₹18,000 = ₹4,09,000.',
        ],
        note: 'Watch out: the advance fee was received but is not yet earned, so it comes out of income; the unpaid salaries were not paid but are incurred, so they go into expenses. Adding all four items is the usual slip.',
      },
      {
        type: 'table',
        title: 'Closing stock at the lower of cost and net realisable value: Anand Textiles, Surat',
        rows: [
          { label: 'Sarees: cost ₹60,000, net realisable value ₹52,000', amount: '₹52,000' },
          { label: 'Shirts: cost ₹45,000, net realisable value ₹50,000', amount: '₹45,000' },
          { label: 'Towels: cost ₹30,000, net realisable value ₹27,000', amount: '₹27,000' },
          { label: 'Value of closing stock (prudence, lot by lot)', amount: '₹1,24,000', total: true },
        ],
        note: 'Each lot is taken at the lower of its two figures: a likely loss is provided for, a likely gain is not. Watch out: comparing the totals (cost ₹1,35,000 against net realisable value ₹1,29,000) gives ₹1,29,000, which lets the gain on the shirts hide the loss on the other lots.',
      },
      {
        type: 'table',
        title: 'Net GST payable for a month: Kumar Electricals, Pune (all dealings within Maharashtra, GST 18%)',
        rows: [
          { label: 'CGST' },
          { label: 'Output CGST: 9% of sales of ₹5,00,000', amount: '₹45,000' },
          { label: 'Less: Input CGST: 9% of purchases of ₹3,20,000', amount: '(28,800)' },
          { label: 'CGST payable', amount: '₹16,200', total: true },
          { label: 'SGST' },
          { label: 'Output SGST: 9% of ₹5,00,000', amount: '₹45,000' },
          { label: 'Less: Input SGST: 9% of ₹3,20,000', amount: '(28,800)' },
          { label: 'SGST payable', amount: '₹16,200', total: true },
          { label: 'Total GST paid in cash', amount: '₹32,400', total: true },
        ],
        note: 'Each head is worked on its own: CGST credit pays only CGST, SGST credit only SGST. Watch out: if the input credit under a head is larger than the output tax, nothing is paid under that head and the balance is carried forward; it is never used against the other head.',
      },
      { type: 'check', questionId: questions.find((q) => q.conceptId === 'thb-principles')!.id },
    ],
  },
  cards: {
    title: 'Rules, Principles and Formulas',
    description: 'Recall the assumptions, principles, bases, standards and GST rules before using them.',
    cardIds: cards.filter((c) => c.beyondSyllabus === undefined).map((c) => c.id),
  },
  recognition: [
    {
      title: 'GAAP, Assumptions and Bases',
      description: 'Tell the fundamental assumptions apart, and the cash basis from the accrual basis.',
      questionIds: recOne,
    },
    {
      title: 'Principles and Concepts',
      description: 'Name the principle behind a treatment, and judge true and false statements about it.',
      questionIds: recTwo,
    },
    {
      title: 'Systems, Standards and GST',
      description: 'Single and double entry, who issues standards, IFRS and Ind AS, and the parts of GST.',
      questionIds: recThree,
    },
  ],
  practice: [
    {
      title: 'Name It: Principles, Bases and Basic GST',
      description: 'Name the principle behind a scenario, classify it, and work out simple GST.',
      templateIds: [
        'thb-name-principle', 'thb-assumption-or-principle', 'thb-which-basis', 'thb-which-system', 'thb-gaap-facts',
        'thb-gst-which-tax', 'thb-gst-intra', 'thb-gst-inter', 'thb-gc-spread',
      ],
      count: 10,
    },
    {
      title: 'Treatments, Basis Profit and GST Set-off',
      description: 'Choose the right treatment, compare cash and accrual profit, and set off input tax credit.',
      templateIds: [
        'thb-standards-facts', 'thb-gst-facts', 'thb-right-treatment', 'thb-stock-valuation', 'thb-cash-accrual-profit',
        'thb-gst-invoice-discount', 'thb-gst-net-payable', 'thb-premium-period', 'thb-revenue-amount',
      ],
      count: 10,
    },
    {
      title: 'Complex Scenarios',
      description: 'Two events at once, balances brought forward, the cost of an asset, and the profit left once personal bills of the owner are taken out.',
      templateIds: ['thb-two-principles', 'thb-cash-accrual-roll', 'thb-asset-cost', 'thb-entity-profit'],
      count: 8,
    },
  ],
  mixed: { title: 'Mixed Practice', description: 'Everything in this topic, shuffled the way an exam serves it.', count: 12 },
  challenge: { title: 'Challenge: Theory Base Mastery', description: 'The hardest scenarios in the topic, timed.', count: 8 },
});

// ---------------------------------------------------------------------------------------------------------------
// Which entities follow Ind AS and which the Accounting Standards, added after the check against the CBSE 2025-26
// syllabus: a level of its own after every other level, with an id of its own, so no level a learner has passed
// moves. The questions are written after the ladder, so they join none of the levels above.
// ---------------------------------------------------------------------------------------------------------------

const applicability = [
  tf('thb-standards', 'easy', 'True or false: a sole proprietor must prepare accounts under Ind AS.', false,
    'False. Ind AS are for companies (listed ones, those linked to them, and others the rules name). A sole proprietor follows the Accounting Standards issued by the ICAI.'),
  ar('thb-standards', 'medium', 'A cement company listed on the main board of a stock exchange in India prepares its accounts under Ind AS.', 'Ind AS are compulsory for every business in India.', true, false, false,
    'A is true. R is false: sole proprietors, firms and smaller unlisted companies follow the Accounting Standards.'),
  mcq('thb-standards', 'medium', 'Patel Agencies Ltd., an unlisted company outside the Ind AS rules, adopted Ind AS by choice two years ago. It now finds them hard work. What may it do?',
    'Nothing: it must keep to Ind AS', [
      ['Go back to the Accounting Standards from next year', 'A company that has moved to Ind AS cannot go back.'],
      ['Follow the ICAI\'s Accounting Standards, meant for firms', 'Those are for non-corporate entities, and a company on Ind AS stays on them.'],
      ['Stop following any standards until it is listed', 'Every company follows one set of standards or the other.'],
    ], 'Adopting Ind AS by choice is allowed, but it cannot be undone.'),
];

const pack: TopicPack = {
  topicId: T,
  concepts,
  cards,
  levels: [
    ...levels,
    ...laterLevels(T, levels, [
      {
        name: 'standards-applicability',
        type: 'method_recognition',
        title: 'Who Follows Ind AS, Who Follows AS',
        description: 'Which entities follow Ind AS, which the Accounting Standards for companies, and which the ICAI\'s standards.',
        questionIds: applicability,
        generate: { templateIds: ['thb-standards-which-set', 'thb-standards-rule', 'thb-standards-two'], count: 6 },
      },
      // Added in the quality pass after the audit: the second half of the old level 3, and the templates of
      // standards, GST accounts and the two bases (outside the mock papers).
      {
        name: 'principles-more',
        type: 'method_recognition',
        title: 'More Principles and Concepts',
        description: 'Matching, dual aspect, revenue recognition, objectivity, historical cost and the owner\'s separate affairs, in true or false, choice and assertion-reason questions.',
        questionIds: recTwoMore,
      },
      {
        name: 'standards-gst-bases',
        type: 'medium_practice',
        title: 'Standards, GST Accounts and the Two Bases',
        description: 'The benefits and limits of accounting standards, when AS-1 asks for disclosure, what kind of accounts Input and Output GST are, and the cash basis against the accrual basis.',
        generate: { templateIds: ['thb-standards-benefits', 'thb-as1-disclosure', 'thb-gst-accounts', 'thb-cash-vs-accrual'], count: 8 },
      },
      {
        name: 'assertion-reason',
        type: 'medium_practice',
        title: 'Assertion and Reason',
        description: 'Two statements on this topic: decide whether each is true, and whether the Reason explains the Assertion.',
        generate: { templateIds: ['thb-assertion-reason'], count: 8 },
      },
    ]),
  ],
  questions,
};

export default pack;
