import { buildLadder, laterLevels } from '../ladder';
import type { Card, Concept, Difficulty, Level, McqQuestion, NumericQuestion, Question, TopicPack, TrueFalseQuestion } from '../types';

const T = 'incomplete-records';

// The CBSE syllabus asks for incomplete records, their features, reasons and limitations, and the ascertainment of
// profit or loss by the statement of affairs method. The conversion method is excluded, so nothing here builds the
// missing accounts up into double entry. There are no sets of journal entries either: the method compares capitals
// and records no entries.

const concepts: Concept[] = [
  { id: 'ir-meaning', topicId: T, title: 'Meaning and features of incomplete records' },
  { id: 'ir-reasons', topicId: T, title: 'Reasons for keeping incomplete records, and their limitations' },
  { id: 'ir-statement', topicId: T, title: 'The statement of affairs, and how it differs from a balance sheet' },
  { id: 'ir-capital', topicId: T, title: 'Capital at the beginning and at the end of the year' },
  { id: 'ir-profit', topicId: T, title: 'Profit or loss by the statement of affairs method' },
  { id: 'ir-adjustments', topicId: T, title: 'Adjusting the profit found' },
  { id: 'ir-formats', topicId: T, title: 'Preparing the statement of affairs and the statement of profit or loss' },
];

// ---------------------------------------------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------------------------------------------

const card = (
  n: number,
  conceptId: string,
  kind: Card['kind'],
  prompt: string,
  answer: string,
  explanation: string,
  example: string,
  commonMistake: string,
): Card => ({ id: `ir-card-${n}`, topicId: T, conceptId, kind, prompt, answer, explanation, example, commonMistake });

const cards: Card[] = [
  card(1, 'ir-meaning', 'rule', 'What are incomplete records?',
    'Accounts kept without following double entry fully: usually only a cash book and the personal accounts of debtors and creditors. The system is also called single entry.',
    'Some transactions are recorded on both sides, some on one side only and some not at all, so the books do not form a complete double entry set.',
    'A grocer notes cash received and paid in a diary and keeps a list of credit customers, but keeps no accounts of rent, wages or sales.',
    'Thinking single entry means every transaction is written once in a journal. It means the records are incomplete, not that a different complete system is used.'),
  card(2, 'ir-meaning', 'rule', 'What are the features of incomplete records?',
    'Only cash and personal accounts are usually kept; nominal accounts are generally not kept; no trial balance can be drawn up; the method differs from business to business; profit can only be estimated; private and business dealings are often mixed; it suits small proprietors.',
    'Because expenses and incomes are not fully recorded, neither a trial balance nor a profit and loss account can be drawn from the books.',
    'A tailor knows what customers owe and what is in the bank, but cannot say how much was spent on thread and electricity in the year.',
    'Saying a trial balance can be drawn up from incomplete records. Without both sides of every transaction it cannot agree.'),
  card(3, 'ir-reasons', 'rule', 'Why do small traders keep incomplete records?',
    'They are simple (no knowledge of double entry is needed), cheap (no trained accountant), quick to keep, and enough for a small business with few transactions.',
    'The owner looks after everything and wants to know only what is owed, what is due and what cash is left.',
    'A two-person bakery cannot afford an accountant, so its owner keeps only a cash book and a list of debtors.',
    'Listing "it shows the exact profit" as a reason. That is exactly what incomplete records cannot do.'),
  card(4, 'ir-reasons', 'rule', 'What are the limitations of incomplete records?',
    'The arithmetic cannot be proved (no trial balance); the true profit cannot be found, only estimated; the true financial position cannot be shown; errors and frauds are hard to find; the figures are hard to support before the tax authorities; results are hard to compare and plan with.',
    'Each limitation comes from the same cause: not every transaction is recorded in full.',
    'A trader who is asked by the income tax office for the profit of the year can give only an estimate from two statements of affairs.',
    'Mixing reasons and limitations: "it is cheap" is a reason to keep incomplete records, not a limitation.'),
  card(5, 'ir-statement', 'format', 'What is a statement of affairs, and how is it set out?',
    'A statement of the assets and liabilities of a business on a date, drawn up from incomplete records to find the capital. Liabilities (creditors, bills payable, loans, outstanding expenses, an overdraft) and the capital stand on one side; the assets on the other. Capital is the balancing figure.',
    'It looks like a balance sheet, but the figures come from the records that exist, from counting and from estimates.',
    'Liabilities ₹1,60,000 and capital ₹2,90,000 = ₹4,50,000 on one side; stock, debtors, furniture and cash of ₹4,50,000 on the other.',
    'Taking the proprietor\'s private house or car into the statement. Only business assets and business liabilities go in.'),
  card(6, 'ir-statement', 'rule', 'How does a statement of affairs differ from a balance sheet?',
    'A balance sheet is drawn up from the ledger balances of complete double entry books and takes the capital from the capital account. A statement of affairs is drawn up from incomplete records and estimates, and finds the capital as the balancing figure. Omissions in a statement of affairs are hard to detect, so it is less reliable.',
    'Both show assets and liabilities on a date; what differs is where the figures come from and what the statement is mainly for.',
    'In a balance sheet, capital ₹3,00,000 comes from the capital account; in a statement of affairs it is assets ₹4,20,000 less liabilities ₹1,20,000.',
    'Thinking the two are the same document under different names.'),
  card(7, 'ir-capital', 'formula', 'How is the capital found on a date?',
    'Capital = Total business assets - Total business liabilities. Leave out the proprietor\'s private assets and private debts.',
    'This is the accounting equation turned round. It is how both the opening and the closing capital are found.',
    'Cash ₹20,000 + debtors ₹80,000 + stock ₹1,50,000 = ₹2,50,000; creditors ₹60,000; capital = ₹1,90,000.',
    'Adding the liabilities, or treating a bank overdraft or an outstanding expense as an asset.'),
  card(8, 'ir-capital', 'shortcut', 'How is an unknown opening capital found from the closing one?',
    'Opening capital = Closing capital + Drawings - Additional capital - Profit (+ Loss).',
    'It is the profit formula solved for the opening capital: undo the year by taking off what increased the capital and putting back what reduced it.',
    'Closing ₹4,20,000, drawings ₹36,000, additional capital ₹40,000, profit ₹75,000: opening = 4,20,000 + 36,000 - 40,000 - 75,000 = ₹3,41,000.',
    'Adding the profit instead of taking it off when going back to the start of the year.'),
  card(9, 'ir-profit', 'formula', 'How is the profit or loss found by the statement of affairs method?',
    'Profit (or loss) = Closing capital + Drawings - Additional capital - Opening capital. A negative figure is a loss.',
    'Drawings lowered the closing capital without being a loss of the business, so they are added back. Additional capital raised it without being earned, so it is deducted.',
    'Closing ₹2,90,000 + drawings ₹48,000 - additional capital ₹30,000 = ₹3,08,000; less opening ₹2,40,000 = profit ₹68,000.',
    'Taking closing capital less opening capital as the profit and forgetting the drawings and the capital brought in.'),
  card(10, 'ir-profit', 'rule', 'What counts as drawings?',
    'Cash taken for private use; goods taken for personal use, at cost; private expenses of the proprietor paid by the business; and a salary the proprietor takes, where the business does not charge it against profit. A monthly figure is multiplied by 12.',
    'Anything the proprietor takes out of the business for private purposes reduces capital and is added back.',
    'Cash ₹4,000 a month (₹48,000), goods costing ₹6,000 (sale price ₹7,500) and a child\'s school fees of ₹12,000 paid by the business: drawings ₹66,000.',
    'Taking goods at their sale price, or leaving out a private bill the business paid.'),
  card(11, 'ir-profit', 'rule', 'What counts as additional capital introduced?',
    'Money or assets the proprietor brings into the business from private sources during the year, including a business expense paid out of private money. A loan to the business is a liability, not capital; selling a business asset brings in no capital.',
    'Additional capital raises the closing capital without any profit being earned, so it is deducted.',
    'The proprietor sells a private plot and pays ₹50,000 into the business, and brings in a personal laptop worth ₹30,000: additional capital ₹80,000.',
    'Counting a loan from a friend or a bank as capital introduced.'),
  card(12, 'ir-adjustments', 'rule', 'What if the closing statement left out depreciation, a provision, or an expense owed or paid ahead?',
    'Correct the profit found: deduct depreciation, a provision for doubtful debts and an outstanding expense; add a prepaid expense and an accrued income. (Making them in the closing statement itself gives the same profit.)',
    'Each item changes the closing capital: a fall in an asset or a liability left out overstated it; an asset left out understated it.',
    'Profit found ₹1,00,000; depreciation ₹8,000, salaries outstanding ₹5,000, prepaid insurance ₹2,000: net profit ₹89,000.',
    'Adding the depreciation, or deducting the prepaid expense.'),
  card(13, 'ir-adjustments', 'formula', 'How is interest on capital treated?',
    'Interest on capital (at the rate given, on the capital at the beginning of the year) is deducted from the profit found.',
    'It is a transfer within the proprietor\'s capital, so the statements of affairs cannot show it: it is made to the profit afterwards.',
    'Profit found ₹1,20,000; interest on capital 10% on ₹3,00,000 = ₹30,000: net profit ₹90,000.',
    'Working the interest on the closing capital, or adding the interest on capital.'),
  card(14, 'ir-formats', 'format', 'How is a Statement of Profit or Loss set out?',
    'Capital at the end of the year; Add: Drawings; Less: Additional capital introduced; = Adjusted capital at the end; Less: Capital at the beginning; = Profit or loss for the year; then the adjustments (Less: Interest on capital, depreciation, provisions, outstanding expenses; Add: prepaid expenses, accrued income); = Net profit or loss.',
    'The statement simply lays out the profit formula, one line to each figure, so that an examiner can follow the working.',
    'Closing ₹2,90,000 + drawings ₹48,000 - additional ₹30,000 = ₹3,08,000 - opening ₹2,40,000 = ₹68,000; less interest on capital ₹12,000 = ₹56,000.',
    'Putting the opening capital before the drawings and the capital introduced have been dealt with, or adding the capital introduced.'),
  card(15, 'ir-profit', 'shortcut', 'Can a business make a profit while its capital falls?',
    'Yes. If the drawings are larger than the profit, the closing capital is lower than the opening capital even in a year of profit. Always add the drawings back before deciding.',
    'A fall in capital alone says nothing about the result: compare the adjusted closing capital with the opening capital.',
    'Capital ₹5,00,000 falls to ₹4,60,000; drawings ₹90,000. Profit = 4,60,000 + 90,000 - 5,00,000 = ₹50,000.',
    'Calling every fall in capital a loss.'),
];

// ---------------------------------------------------------------------------------------------------------------
// Authored questions
// ---------------------------------------------------------------------------------------------------------------

const qid = (n: number): string => `ir-q-${String(n).padStart(3, '0')}`;

/** An mcq: the right option is put at a position that depends on n, so the answers are spread over a, b, c and d. */
function mcq(n: number, conceptId: string, difficulty: Difficulty, prompt: string, correct: string, wrong: [string, string][], explanation: string, hints: string[]): McqQuestion {
  const pos = n % (wrong.length + 1);
  const all: { text: string; why?: string }[] = [...wrong.map(([text, why]) => ({ text, why }))];
  all.splice(pos, 0, { text: correct });
  const options = all.map((o, i) => ({ id: 'abcdefgh'[i], text: o.text, ...(o.why === undefined ? {} : { why: o.why }) }));
  return { id: qid(n), topicId: T, conceptId, difficulty, type: 'mcq', prompt, options, correct: options.find((o) => o.text === correct)!.id, hints, explanation };
}

const tf = (n: number, conceptId: string, difficulty: Difficulty, prompt: string, correct: boolean, explanation: string, hints: string[]): TrueFalseQuestion => ({
  id: qid(n), topicId: T, conceptId, difficulty, type: 'true_false', prompt, correct, hints, explanation,
});

const rs = (n: number): number => n * 100;

const num = (n: number, conceptId: string, difficulty: Difficulty, prompt: string, answer: number, errors: [number, string][], working: string[], hints: string[]): NumericQuestion => ({
  id: qid(n), topicId: T, conceptId, difficulty, type: 'numeric', unit: 'rupees', prompt, answer: rs(answer),
  commonErrors: errors.map(([value, why]) => ({ value: rs(value), why })), working, hints, explanation: working.join(' '),
});

/** The four options of an Assertion-Reason question, word for word and in the order the board's papers print them. */
const AR = {
  both: 'Both Assertion (A) and Reason (R) are true, and R is the correct explanation of A.',
  bothNot: 'Both A and R are true, but R is not the correct explanation of A.',
  aOnly: 'A is true, but R is false.',
  rOnly: 'A is false, but R is true.',
};
type ArKey = keyof typeof AR;

/**
 * An Assertion-Reason question with the board's four options in the board's order (never moved by `n`). `whys` names
 * the mistake behind each wrong option.
 */
function ar(n: number, conceptId: string, a: string, r: string, answer: ArKey, whys: Partial<Record<ArKey, string>>, explanation: string, hints: string[]): McqQuestion {
  const keys = Object.keys(AR) as ArKey[];
  const options = keys.map((k, i) => ({ id: 'abcd'[i], text: AR[k], ...(k === answer ? {} : { why: whys[k] ?? '' }) }));
  return {
    id: qid(n), topicId: T, conceptId, difficulty: 'medium', type: 'mcq',
    prompt: `Assertion (A): ${a}\nReason (R): ${r}\nChoose the correct option.`,
    options, correct: 'abcd'[keys.indexOf(answer)], hints, explanation,
  };
}

const questions: Question[] = [
  // ---- Meaning, features, reasons and limitations ----
  mcq(1, 'ir-meaning', 'easy', 'Accounts that do not follow the double entry system fully are known as:',
    'Incomplete records (the single entry system)',
    [
      ['Subsidiary books', 'Subsidiary books are part of a complete double entry system; they are books of original entry.'],
      ['A suspense account', 'A suspense account holds a difference in the trial balance for a while; it is not a system of keeping accounts.'],
      ['Memorandum records', 'Memorandum records are kept beside the books for information; they are not the name of the system.'],
    ],
    'When double entry is not followed for every transaction, the records are incomplete: the single entry system.',
    ['Which records leave out one side of some transactions?']),
  tf(2, 'ir-meaning', 'easy', 'From incomplete records a trial balance can be prepared to check the arithmetical accuracy of the books.', false,
    'A trial balance needs both sides of every transaction. Incomplete records leave some out, so no trial balance can be drawn up.',
    ['What does a trial balance need from every transaction?']),
  mcq(3, 'ir-meaning', 'easy', 'Under incomplete records, which accounts are usually kept?',
    'The cash book and the personal accounts of debtors and creditors',
    [
      ['Real and nominal accounts only', 'It is the other way round: real and nominal accounts are usually the ones left out.'],
      ['Every account, under double entry', 'That would be complete records, not incomplete ones.'],
      ['Nominal accounts of expenses and incomes only', 'Expenses and incomes are generally not recorded in accounts of their own.'],
    ],
    'A trader keeping incomplete records wants to know the cash, what customers owe and what is owed to suppliers.',
    ['What does a small trader most need to keep track of?']),
  tf(4, 'ir-meaning', 'easy', 'Incomplete records are kept mostly by small traders who run the business themselves.', true,
    'They are simple and cheap, which suits a small business with few transactions.',
    ['Who can manage without a trained accountant?']),
  mcq(5, 'ir-reasons', 'easy', 'Meera runs a small vegetable stall and cannot pay for an accountant, so the accounts are kept in a notebook. Which reason for keeping incomplete records does this show?',
    'It costs less to keep',
    [
      ['It shows the true profit', 'Incomplete records cannot show the true profit; that is one of their limitations.'],
      ['It proves the arithmetic of the books', 'No trial balance can be drawn up from incomplete records.'],
      ['The law requires it of small traders', 'No law requires incomplete records; they are chosen for convenience.'],
    ],
    'Saving the cost of a trained accountant is a main reason why small traders keep incomplete records.',
    ['What is the stall-owner trying to save?']),
  tf(6, 'ir-reasons', 'medium', 'A company may keep its accounts on the single entry system to save cost.', false,
    'Companies must keep complete books of account on the double entry system under the Companies Act, 2013. Incomplete records are found among sole proprietors.',
    ['Does the law leave the choice to a company?']),
  mcq(7, 'ir-reasons', 'easy', 'The profit worked out from incomplete records is:',
    'Only an estimate',
    [
      ['Exact, as in double entry books', 'Without complete records the profit cannot be found exactly.'],
      ['Always more than the true profit', 'The estimate may be more or less than the true profit; nothing makes it always higher.'],
      ['The same as the profit shown by a trial balance', 'A trial balance does not show a profit, and none can be drawn up here.'],
    ],
    'The profit is found by comparing capitals at two dates, so it is only an estimate: a limitation of incomplete records.',
    ['Is anything recorded in full to give an exact profit?']),
  mcq(8, 'ir-statement', 'easy', 'A statement of affairs is:',
    'A statement of the assets and liabilities of a business on a date, drawn up from incomplete records to find its capital',
    [
      ['An account of the incomes and expenses of a year', 'That describes a profit and loss account.'],
      ['A list of ledger balances drawn up to check the arithmetic of the books', 'That describes a trial balance.'],
      ['A statement of the cash received and paid during the year', 'That describes a cash book or a receipts and payments summary.'],
    ],
    'It lists assets and liabilities on a date; the capital is the balancing figure.',
    ['What is the statement drawn up to find?']),
  tf(9, 'ir-statement', 'easy', 'In a statement of affairs, the capital is the balancing figure.', true,
    'No capital account is kept, so capital is found as the excess of the assets over the liabilities.',
    ['Is there a capital account to take the figure from?']),
  ar(10, 'ir-statement',
    'A statement of affairs is less reliable than a balance sheet.',
    'A statement of affairs is drawn up partly from estimates and from records that are not complete.',
    'both',
    {
      bothNot: 'Took R as true but beside the point; it is exactly why the statement is less reliable.',
      aOnly: 'Took R as false; many figures of a statement of affairs are estimated or counted, not read from complete books.',
      rOnly: 'Took A as false; omissions in a statement of affairs are hard to detect, so it is less reliable.',
    },
    'A is true and R is true. A balance sheet rests on complete double entry books that agree through a trial balance; a statement of affairs is put together from a cash book, lists and estimates, so an item left out is hard to notice. R is the reason for A.',
    ['Where do the figures of each statement come from?']),
  ar(11, 'ir-statement',
    "The proprietor's residential flat is shown as an asset in the statement of affairs of the business.",
    'Under the business entity concept, the business is treated as separate from its owner.',
    'rOnly',
    {
      both: 'Took A as true; the flat is a private asset of the proprietor and stays out of the statement of the business.',
      bothNot: 'Took A as true; the flat is not a business asset, so it is not shown.',
      aOnly: 'Took R as false; the business entity concept is exactly what separates the owner from the business.',
    },
    'A is false and R is true. Because the business is separate from its owner (R), only business assets and business liabilities enter the statement of affairs; the flat belongs to the proprietor privately, so it is left out and A is false.',
    ['Does the business own the flat?']),
  tf(12, 'ir-statement', 'easy', 'A bank overdraft is shown on the assets side of a statement of affairs.', false,
    'An overdraft is money the business owes the bank: a liability.',
    ['Who owes whom in an overdraft?']),
  num(13, 'ir-capital', 'easy', 'On 31 March a business had total assets of ₹6,40,000 and total liabilities of ₹1,90,000. What was its capital on that date?', 450000,
    [[830000, 'Added the liabilities to the assets.'], [640000, 'Gave the total assets and left out the liabilities.']],
    ['Capital = Total assets - Total liabilities.', '₹6,40,000 - ₹1,90,000 = ₹4,50,000.'],
    ['Capital is what is left of the assets once the liabilities are met.']),
  mcq(14, 'ir-profit', 'medium', 'Which of these is NOT additional capital introduced by the proprietor?',
    "A loan of ₹50,000 given to the business by the proprietor's cousin",
    [
      ['Cash of ₹50,000 from the sale of the proprietor\'s private shares, paid into the business', 'This is additional capital: private money brought into the business.'],
      ['A personal printer worth ₹20,000 brought into the business for its use', 'An asset brought in from private sources is additional capital.'],
      ['Shop electricity of ₹8,000 paid by the proprietor from private savings', 'A business expense paid with private money is capital brought in.'],
    ],
    'A loan must be repaid, so it is a liability of the business even when it comes from a relative of the proprietor.',
    ['Which one must the business pay back?']),
  tf(15, 'ir-profit', 'medium', 'If the capital at the end of the year is less than the capital at the beginning, the business must have made a loss.', false,
    'Drawings larger than the profit also lower the capital. Add the drawings back (and take off any capital brought in) before deciding.',
    ['What else besides a loss reduces capital?']),
  ar(16, 'ir-profit',
    'Drawings are added to the closing capital in finding the profit by the statement of affairs method.',
    'Drawings reduce the capital, but they are not a loss of the business.',
    'both',
    {
      bothNot: 'Took R as true but beside the point; it is the very reason the drawings are added back.',
      aOnly: 'Took R as false; drawings lower the capital without being a loss of the business.',
      rOnly: 'Took A as false; drawings are added back to the closing capital.',
    },
    'A is true and R is true. The closing capital is lower by what the proprietor took out; since that fall is not a loss of the business (R), the drawings are added back before the capitals are compared. R explains A.',
    ['Why would the closing capital be lower than it should be?']),
  ar(17, 'ir-profit',
    'Additional capital introduced during the year is added to the closing capital in finding the profit.',
    'Additional capital raises the closing capital without any profit being earned.',
    'rOnly',
    {
      both: 'Took A as true; because of R, additional capital is deducted from the closing capital, not added.',
      bothNot: 'Took A as true; the capital brought in is deducted.',
      aOnly: 'Took R as false; capital brought in does raise the closing capital without any profit.',
    },
    'A is false and R is true. Capital brought in during the year raises the closing capital though the business earned nothing by it (R), so it is deducted from the closing capital, never added.',
    ['Does capital brought in come from the earnings of the business?']),
  tf(18, 'ir-profit', 'easy', 'Goods taken by the proprietor for personal use are included in drawings at their cost.', true,
    'True. Goods taken for the home leave the business without being sold, so they lower the closing capital like cash drawn and are added back as drawings. They are valued at what they cost the business, not at the selling price: no sale took place, so no profit was earned on them. Goods costing ₹6,000 that would sell for ₹7,500 add ₹6,000 to the drawings.',
    ['Is the business selling the goods to the proprietor?']),
  num(19, 'ir-profit', 'easy', 'Capital on 1 April ₹3,00,000; capital on 31 March ₹3,80,000; drawings during the year ₹60,000; additional capital introduced ₹50,000. Find the profit for the year.', 90000,
    [[80000, 'Compared the two capitals and left out the drawings and the additional capital.'], [190000, 'Added the additional capital instead of deducting it.'], [140000, 'Left out the additional capital.']],
    ['Adjusted closing capital = ₹3,80,000 + ₹60,000 - ₹50,000 = ₹3,90,000.', 'Profit = ₹3,90,000 - ₹3,00,000 = ₹90,000.'],
    ['Add the drawings back and take the additional capital off before comparing.']),
  num(20, 'ir-capital', 'medium', 'Capital on 31 March was ₹4,20,000. During the year the profit was ₹75,000, drawings were ₹36,000 and additional capital of ₹40,000 was introduced. Find the capital on 1 April, the beginning of the year.', 341000,
    [[345000, 'Took only the profit off the closing capital and left out the drawings and the additional capital.'], [421000, 'Added the additional capital instead of deducting it.'], [269000, 'Deducted the drawings instead of adding them back.']],
    ['Opening capital = Closing capital + Drawings - Additional capital - Profit.', '₹4,20,000 + ₹36,000 - ₹40,000 - ₹75,000 = ₹3,41,000.'],
    ['Undo the year: put back what reduced the capital, take off what increased it.']),
  num(21, 'ir-adjustments', 'medium', 'The profit found by comparing capitals is ₹1,20,000. Interest on capital is to be allowed at 10% p.a. on the opening capital of ₹3,00,000. Find the net profit.', 90000,
    [[120000, 'Made no adjustment.'], [150000, 'Added the interest on capital instead of deducting it.'], [108000, 'Worked the interest on the profit found instead of on the opening capital.']],
    ['Interest on capital = 10% of ₹3,00,000 = ₹30,000, deducted.', 'Net profit = ₹1,20,000 - ₹30,000 = ₹90,000.'],
    ['Interest on capital is a charge against the profit.']),
  mcq(22, 'ir-adjustments', 'medium', 'The closing statement of affairs took debtors at ₹80,000. A provision for doubtful debts of 5% is now to be made. How does this change the profit found?',
    'It reduces the profit by ₹4,000',
    [
      ['It increases the profit by ₹4,000', 'A provision lowers the value of the debtors, so the profit falls.'],
      ['It reduces the profit by ₹80,000', 'Deducted all the debtors instead of 5% of them.'],
      ['It does not change the profit', 'The provision lowers the closing capital, and so the profit.'],
    ],
    'Provision = 5% of ₹80,000 = ₹4,000. It lowers the closing capital and therefore the profit by ₹4,000.',
    ['Does the provision raise or lower the value of an asset?']),
  tf(23, 'ir-adjustments', 'medium', 'Prepaid insurance left out of the closing statement of affairs is added to the profit found by comparing capitals.', true,
    'A prepaid expense is an asset. Leaving it out understated the closing capital, so the profit is raised by it.',
    ['Is prepaid insurance an asset or a liability?']),
  mcq(24, 'ir-adjustments', 'complex', 'Kabir takes ₹10,000 every month from the business as a salary. The business does not charge the proprietor\'s salary against its profit. How is the ₹1,20,000 for the year dealt with when the profit is found by the statement of affairs method?',
    'It is drawings: added back to the closing capital',
    [
      ['It is deducted from the profit as an expense', 'The question says the salary is not charged against profit; the proprietor taking it is a withdrawal.'],
      ['It is additional capital: deducted from the closing capital', 'Money taken out is not capital brought in.'],
      ['It is ignored, as no cash was spent on the business', 'The money left the business, which lowered the closing capital; it must be added back.'],
    ],
    'Money the proprietor takes for private use is drawings, whatever it is called, and drawings are added back to the closing capital.',
    ['Is the proprietor an employee of the business?']),
  mcq(25, 'ir-formats', 'medium', 'In a Statement of Profit or Loss, what follows "Adjusted capital at the end of the year"?',
    'Less: Capital at the beginning of the year',
    [
      ['Add: Drawings during the year', 'Drawings are added before the adjusted closing capital is found.'],
      ['Less: Additional capital introduced', 'Additional capital is deducted before the adjusted closing capital is found.'],
      ['Add: Capital at the beginning of the year', 'The opening capital is deducted, not added.'],
    ],
    'Closing capital, plus drawings, less additional capital, gives the adjusted closing capital; the opening capital is then deducted to give the profit or loss.',
    ['The last step compares the adjusted closing capital with the opening capital.']),
  mcq(26, 'ir-profit', 'complex', "A trader's capital fell from ₹5,00,000 to ₹4,60,000 during the year, and the drawings were ₹90,000. No capital was brought in. What was the result of the year?",
    'Profit of ₹50,000',
    [
      ['Loss of ₹40,000', 'Compared the capitals and left out the drawings.'],
      ['Loss of ₹1,30,000', 'Deducted the drawings instead of adding them back.'],
      ['Profit of ₹90,000', 'Gave the drawings as the result.'],
    ],
    'Profit = ₹4,60,000 + ₹90,000 - ₹5,00,000 = ₹50,000. The capital fell only because the drawings were more than the profit.',
    ['Add the drawings back before comparing the capitals.']),
  tf(27, 'ir-adjustments', 'complex', 'Allowing interest on capital changes the total of the assets in the closing statement of affairs.', false,
    'Interest on capital is credited to the capital and charged against profit: it moves an amount within the capital and changes no asset or liability. That is why it is made to the profit after the comparison.',
    ['Does any cash or other asset move when interest on capital is allowed?']),
  mcq(28, 'ir-meaning', 'medium', 'Which of these is true of incomplete records?',
    'Some transactions are recorded on both sides, some on one side only and some not at all',
    [
      ['Every transaction is recorded on one side only', 'Cash and personal accounts are often kept on both sides; the records are a mix.'],
      ['Every transaction is recorded on both sides, but no ledger is kept', 'If both sides of every transaction were recorded, the records would be complete.'],
      ['Only transactions with debtors and creditors are recorded', 'Cash transactions are usually recorded too, in a cash book.'],
    ],
    'Incomplete records follow no one rule: the cash book and personal accounts are kept, and much else is left out.',
    ['Is there one fixed rule for what is recorded?']),
  num(29, 'ir-capital', 'complex', 'The stock on 31 March was not recorded. Capital on 1 April was ₹2,50,000, the profit for the year was ₹60,000 and drawings were ₹30,000. On 31 March the other assets were cash ₹20,000, debtors ₹90,000 and furniture ₹1,00,000, and creditors were ₹70,000. Find the stock on 31 March.', 140000,
    [[70000, 'Left out the creditors when working back from the capital to the assets.'], [200000, 'Added the drawings to the capital instead of deducting them.'], [20000, 'Deducted the profit instead of adding it.']],
    ['Closing capital = ₹2,50,000 + ₹60,000 - ₹30,000 = ₹2,80,000.', 'Total assets = Capital + Liabilities = ₹2,80,000 + ₹70,000 = ₹3,50,000.', 'Stock = ₹3,50,000 - (₹20,000 + ₹90,000 + ₹1,00,000) = ₹1,40,000.'],
    ['Find the closing capital first, then the total assets the statement must show.']),
  tf(30, 'ir-reasons', 'easy', 'One reason small traders keep incomplete records is that they take less time to keep.', true,
    'Fewer books are written up, which saves time as well as money.',
    ['Are fewer or more books kept?']),
  mcq(31, 'ir-reasons', 'medium', 'An income tax officer is not satisfied with the profit a trader declares from incomplete records. Which limitation of incomplete records does this show?',
    'The figures are hard to support, as the profit is only an estimate',
    [
      ['The records cost too much to keep', 'Incomplete records are cheap to keep; cost is a reason for keeping them.'],
      ['The records take too long to write up', 'They take little time; that too is a reason for keeping them.'],
      ['The records follow the double entry system too strictly', 'Incomplete records do not follow double entry fully.'],
    ],
    'Without complete records the profit is an estimate, which outsiders such as tax authorities find hard to accept.',
    ['What can the trader not prove?']),
  mcq(32, 'ir-statement', 'easy', 'Which of these goes into the statement of affairs of a business?',
    'Rent of the shop still unpaid at the end of the year',
    [
      ["The proprietor's personal car, used only by the family", 'A private asset of the proprietor stays out.'],
      ["A housing loan on the proprietor's home", 'A private debt of the proprietor stays out.'],
      ["Jewellery of the proprietor's family", 'Private property of the family stays out.'],
    ],
    'Unpaid rent is an outstanding expense, a liability of the business. Private assets and debts of the proprietor stay out.',
    ['Which item belongs to the business?']),
];

// ---------------------------------------------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------------------------------------------

const levels = buildLadder(T, {
  concept: {
    title: 'Profit Without Complete Books',
    description: 'See what incomplete records are, how a statement of affairs finds the capital, and how comparing two capitals gives the profit.',
    lesson: [
      {
        type: 'text',
        heading: 'When the books are not complete',
        body: 'Many small traders do not keep books by double entry. They keep a cash book and a list of what customers owe and what is owed to suppliers, and little else: incomplete records, also called the single entry system. It is simple, cheap and quick, but no trial balance can be drawn up and no profit and loss account can be drawn from the books. The profit can still be estimated, by finding the capital at the start and at the end of the year.',
      },
      {
        type: 'table',
        title: 'A statement of affairs on 31 March, in short',
        rows: [
          { label: 'Liabilities' },
          { label: 'Creditors', amount: '₹60,000' },
          { label: 'Bank loan', amount: '₹1,00,000' },
          { label: 'Capital (balancing figure)', amount: '₹2,90,000' },
          { label: 'Total', amount: '₹4,50,000', total: true },
          { label: 'Assets' },
          { label: 'Stock', amount: '₹1,80,000' },
          { label: 'Debtors', amount: '₹1,20,000' },
          { label: 'Furniture', amount: '₹1,10,000' },
          { label: 'Cash in hand', amount: '₹40,000' },
          { label: 'Total', amount: '₹4,50,000', total: true },
        ],
        note: 'Capital = assets ₹4,50,000 - liabilities ₹1,60,000 = ₹2,90,000. The proprietor\'s own house or car never goes in: only what belongs to the business, and what it owes.',
      },
      {
        type: 'working',
        title: 'Profit by comparing the capitals',
        lines: [
          'Capital on 1 April (from the opening statement of affairs) = ₹2,40,000; capital on 31 March = ₹2,90,000.',
          'The proprietor drew ₹4,000 a month: drawings = ₹4,000 x 12 = ₹48,000, added back.',
          'The proprietor brought in ₹30,000 more during the year: deducted.',
          'Adjusted closing capital = ₹2,90,000 + ₹48,000 - ₹30,000 = ₹3,08,000.',
          'Profit = ₹3,08,000 - ₹2,40,000 = ₹68,000.',
        ],
        note: 'Profit = Closing capital + Drawings - Additional capital - Opening capital. A negative answer is a loss.',
      },
      {
        type: 'text',
        heading: 'Putting right what the statements left out',
        body: 'Interest on capital moves an amount within the capital, so no statement of affairs can show it: deduct it from the profit found. If the closing statement left out depreciation, a provision for doubtful debts or an expense still owed, deduct it; if it left out a prepaid expense or an income earned but not received, add it. A salary the proprietor takes from the business, when the business does not charge it against profit, is simply drawings.',
      },
      {
        type: 'working',
        title: 'Nair Bakers: the adjustments after the comparison',
        lines: [
          'The capitals show a profit of ₹1,10,000 for the year. The capital on 1 April was ₹3,00,000.',
          'Interest on capital at 8% on the opening capital: 8% of ₹3,00,000 = ₹24,000. It moves profit into the capital, so it is deducted: ₹86,000.',
          'Depreciation on the oven at 10% on ₹1,20,000 = ₹12,000. The closing statement showed the oven too high, so deduct it: ₹74,000.',
          'Provision for doubtful debts at 5% on debtors of ₹60,000 = ₹3,000, deducted for the same reason: ₹71,000.',
          'Wages of ₹4,000 still owed were left out of the liabilities, so the capital was too high: deduct ₹4,000, ₹67,000.',
          'Insurance of ₹2,500 paid for next year was left out of the assets, so the capital was too low: add ₹2,500. Net profit = ₹69,500.',
        ],
        note: 'Watch out: only the prepaid expense and an income earned but not received are added. Everything that lowers an asset or adds a liability is deducted.',
      },
      {
        type: 'working',
        title: 'Interest on capital brought in during the year',
        lines: [
          'Capital on 1 April ₹4,00,000; interest on capital at 10% p.a.; ₹60,000 more brought in on 1 October.',
          'On the opening capital for the whole year: 10% of ₹4,00,000 = ₹40,000.',
          'On the ₹60,000, only from 1 October to 31 March, 6 months: ₹60,000 x 10% x 6/12 = ₹3,000.',
          'Interest on capital = ₹40,000 + ₹3,000 = ₹43,000, deducted from the profit found.',
        ],
        note: 'Watch out: capital brought in during the year earns interest only for the months it was in the business, never for the whole year.',
      },
      {
        type: 'table',
        title: 'Statement of affairs on 31 March with the adjustments inside it, in short',
        rows: [
          { label: 'Liabilities' },
          { label: 'Creditors', amount: '₹40,000' },
          { label: 'Outstanding rent', amount: '₹6,000' },
          { label: 'Capital (balancing figure)', amount: '₹2,08,100' },
          { label: 'Total', amount: '₹2,54,100', total: true },
          { label: 'Assets' },
          { label: 'Debtors ₹80,000 less bad debts ₹2,000 less provision 5% ₹3,900', amount: '₹74,100' },
          { label: 'Furniture ₹50,000 less depreciation 10% ₹5,000', amount: '₹45,000' },
          { label: 'Stock', amount: '₹1,20,000' },
          { label: 'Cash in hand', amount: '₹15,000' },
          { label: 'Total', amount: '₹2,54,100', total: true },
        ],
        note: 'Made inside the statement, the adjustments give the closing capital directly, and the profit then needs no correction for them. Watch out: the provision is worked on the debtors left after the bad debts (5% of ₹78,000), and neither it nor the depreciation is a liability.',
      },
      { type: 'check', questionId: qid(9) },
      { type: 'check', questionId: qid(19) },
    ],
  },
  cards: {
    title: 'Incomplete Records Rules and Formulas',
    description: 'Recall the features, the statement of affairs, the profit formula and the adjustments.',
    cardIds: cards.map((c) => c.id),
  },
  recognition: [
    {
      title: 'Single Entry: Meaning, Reasons and Limits',
      description: 'What incomplete records are, why traders keep them and what they cannot do.',
      questionIds: [1, 2, 3, 4, 5, 6, 7, 28, 30, 31, 8, 9, 12, 32].map(qid),
    },
    {
      title: 'The Statement of Affairs and the Profit Formula',
      description: 'Assertion and reason, true or false and short situations on capital, drawings, capital brought in and the adjustments.',
      questionIds: [10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 29].map(qid),
    },
  ],
  practice: [
    {
      title: 'Capital and Profit: First Steps',
      description: 'Capital from a list, profit with drawings or with capital brought in, the closing capital and the drawings of a year.',
      templateIds: ['ir-capital-list', 'ir-profit-drawings', 'ir-profit-additional', 'ir-closing-capital', 'ir-total-side', 'ir-formula', 'ir-profit-or-loss', 'ir-drawings-total'],
      count: 8,
    },
    {
      title: 'Single Entry and the Statement of Affairs',
      description: 'Features, reasons and limitations, the statement of affairs against a balance sheet, and what goes into it.',
      templateIds: ['ir-feature', 'ir-reason-limitation', 'ir-sa-vs-bs', 'ir-classify-item', 'ir-capital-or-drawings'],
      count: 8,
    },
    {
      title: 'Drawings and Capital Brought In Together (Guided)',
      description: 'Add the drawings back, take the capital brought in off, then compare: a profit or a loss.',
      templateIds: ['ir-profit-both', 'ir-loss'],
      count: 6,
      guided: true,
    },
    {
      title: 'Unknown Figures and Private Items',
      description: 'The opening capital, the drawings or the capital brought in found from the profit; private items left out; goods drawn at cost.',
      templateIds: ['ir-opening-capital', 'ir-drawings-unknown', 'ir-additional-unknown', 'ir-capital-exclusions', 'ir-profit-goods', 'ir-slip-effect'],
      count: 8,
    },
    {
      title: 'Adjusting the Profit Found',
      description: 'Interest on capital, depreciation and provisions, amounts owed, paid ahead and earned.',
      templateIds: ['ir-interest-capital', 'ir-depreciation-provision', 'ir-outstanding-prepaid', 'ir-adjust-direction'],
      count: 8,
    },
    {
      title: 'Complex Incomplete Records Problems',
      description: 'Both statements of affairs from lists, several adjustments, a missing figure, a salary taken as drawings, a loss, and capital brought in as assets.',
      templateIds: ['ir-profit-two-lists', 'ir-adjusted-profit', 'ir-missing-figure', 'ir-salary-interest', 'ir-loss-adjusted', 'ir-net-result-choice', 'ir-capital-in-kind'],
      count: 8,
    },
  ],
  mixed: { title: 'Mixed Incomplete Records Practice', description: 'Everything in this topic, shuffled the way an exam serves it.', count: 12 },
  // The complex questions read a list of figures before any working starts, so they get more than the usual 90 seconds.
  challenge: { title: 'Challenge: Incomplete Records', description: 'The hardest questions in the topic, against the clock.', count: 8, timerSecondsPerQuestion: 150 },
  formats: [
    {
      title: 'Prepare a Statement of Affairs',
      description: 'The statement of affairs on one date with a private item to leave out, with the adjustments made inside it, and the statements at the start and the end of the year in two columns, with the capital as the balancing figure.',
      // ir-fmt-affairs-adjusted was added in the quality pass: the adjustments made inside the statement.
      templateIds: ['ir-fmt-affairs-one', 'ir-fmt-affairs-two', 'ir-fmt-affairs-adjusted'],
      count: 2,
    },
    {
      title: 'Prepare a Statement of Profit or Loss',
      description: 'From the closing capital to the profit or loss, with drawings in cash and goods and capital brought in, and then with interest on capital, depreciation, provisions and amounts owed or paid ahead.',
      templateIds: ['ir-fmt-profit', 'ir-fmt-profit-adjusted'],
      count: 2,
    },
  ],
});

const allLevels: Level[] = [
  ...levels,
  ...laterLevels(T, levels, [
    // Added in the quality pass: capital brought in during the year earns interest for part of the year.
    {
      name: 'capital-during-year',
      type: 'complex_practice',
      title: 'Interest on Capital Brought In During the Year',
      description: 'Interest on the opening capital for the whole year and on capital brought in for the months it was in the business, and the net profit after it.',
      generate: { templateIds: ['ir-interest-additional-capital'], count: 6 },
    },
    {
      name: 'assertion-reason',
      type: 'medium_practice',
      title: 'Assertion and Reason',
      description: 'Two statements on this topic: decide whether each is true, and whether the Reason explains the Assertion.',
      generate: { templateIds: ['ir-assertion-reason'], count: 8 },
    },
  ]),
];

const pack: TopicPack = { topicId: T, concepts, cards, levels: allLevels, questions };

export default pack;
