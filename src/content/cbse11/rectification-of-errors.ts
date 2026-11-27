import { buildLadder, laterLevels } from '../ladder';
import type { Card, Concept, Difficulty, JournalQuestion, Level, McqQuestion, NumericQuestion, Question, TopicPack, TrueFalseQuestion } from '../types';

const T = 'rectification-of-errors';
const rupees = (n: number): number => n * 100;

const concepts: Concept[] = [
  { id: 'roe-classes', topicId: T, title: 'Classes of error' },
  { id: 'roe-tb-effect', topicId: T, title: 'Errors that do and do not affect the trial balance' },
  { id: 'roe-before-tb', topicId: T, title: 'Rectifying before the trial balance' },
  { id: 'roe-suspense', topicId: T, title: 'Suspense account and one-sided errors' },
  { id: 'roe-two-sided', topicId: T, title: 'Rectifying entries for two-sided errors' },
  { id: 'roe-suspense-balance', topicId: T, title: 'Suspense balance after corrections' },
  { id: 'roe-profit', topicId: T, title: 'Effect of errors on profit' },
  { id: 'roe-sets', topicId: T, title: 'Rectifying a list of errors' },
  { id: 'roe-formats', topicId: T, title: 'Preparing the Suspense account' },
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
): Card => ({ id: `roe-card-${n}`, topicId: T, conceptId, kind, prompt, answer, explanation, example, commonMistake });

const cards: Card[] = [
  card(
    1,
    'roe-classes',
    'rule',
    'What are the four classes of error in the books?',
    'Omission (a transaction left out, wholly or partly), commission (a slip in recording, posting or totalling), principle (an accounting principle broken, such as capital treated as revenue) and compensating (errors that cancel each other).',
    'The class depends on what went wrong, which decides whether the trial balance notices it and how it is rectified.',
    'Credit sale not entered anywhere: omission. Rent debited to Salaries A/c: commission. Furniture debited to Purchases A/c: principle. Sales Book and Purchases Book both overcast by ₹1,000: compensating.',
    'Calling every error one of commission; the class follows from what went wrong, not from who made the slip.',
  ),
  card(
    2,
    'roe-tb-effect',
    'rule',
    'Which errors do NOT show up in the trial balance?',
    'Complete omission, errors of principle, compensating errors, and errors of commission that leave two accounts wrong by equal amounts (wrong account of the same kind, entry written the wrong way round, wrong book).',
    'In each of these the debit total and the credit total are still equal, so the trial balance agrees.',
    'Rent ₹3,000 debited to Salaries A/c: Rent is ₹3,000 short and Salaries is ₹3,000 too high on the same (debit) side, so the totals are unchanged.',
    'Believing that a trial balance that agrees proves the books are free of errors.',
  ),
  card(
    3,
    'roe-tb-effect',
    'rule',
    'Which errors DO show up in the trial balance?',
    'Partial omission (posted to one account only), a wrong amount in one account, one account posted on the wrong side, and wrong totalling or balancing.',
    'Each leaves the debit total different from the credit total, so a difference appears and goes to Suspense A/c.',
    'A credit sale not posted to the customer\'s account: the debit side is short by the amount of the sale.',
    'Thinking an item that was entered in the books cannot upset the trial balance, even though one of its postings is missing or wrong.',
  ),
  card(
    4,
    'roe-tb-effect',
    'rule',
    'What are one-sided and two-sided errors?',
    'A one-sided error leaves a single account wrong, so the trial balance disagrees. A two-sided error leaves two (or more) accounts wrong by amounts that cancel each other, so the debit and credit totals stay equal.',
    'The test is whether the totals still agree. That decides whether a Suspense A/c exists to correct through.',
    'Not posting a credit sale to the customer: one-sided. Debiting Kiran instead of Mohan: two-sided.',
    'Treating a wrong-side posting as two-sided because two accounts are named in the question; only one account is wrongly posted.',
  ),
  card(
    5,
    'roe-suspense',
    'rule',
    'When is a Suspense A/c opened, and with what?',
    'When the two columns of the trial balance differ, the difference is entered in Suspense A/c on the side that is short, so that the columns agree.',
    'Suspense A/c is a temporary account. It holds the difference until the errors behind it are found and rectified. A balance still left when the final accounts are prepared is shown in the balance sheet: a debit balance on the assets side, a credit balance on the liabilities side.',
    'Debit ₹2,35,000 and credit ₹2,32,500: Suspense A/c ₹2,500 on the credit side.',
    'Putting the difference on the side that is already larger.',
  ),
  card(
    6,
    'roe-suspense',
    'shortcut',
    'Quick way to the side of Suspense A/c in the trial balance',
    'Find the shorter column: Suspense A/c goes there. Debit total larger: credit side. Credit total larger: debit side.',
    'The Suspense amount is whatever makes the short column match the longer one.',
    'Credit total ₹4,10,000 and debit total ₹4,07,000: Suspense A/c ₹3,000 on the debit side.',
    'Writing the Suspense amount on the larger side, which would widen the gap.',
  ),
  card(
    7,
    'roe-before-tb',
    'rule',
    'How is an error found BEFORE the trial balance corrected?',
    'A one-sided error is corrected in the account itself: post the missing item, remove the wrong one, or put the total right. No Suspense A/c exists yet, so none is used. A two-sided error is corrected by a journal entry between the accounts concerned, as at any other time.',
    'A one-sided error found before the trial balance is prepared never reaches the trial balance as a difference, so there is nothing to clear.',
    'A credit sale of ₹6,000 not posted to Mohan\'s account: debit Mohan\'s account with ₹6,000 directly.',
    'Passing an entry through Suspense A/c before any Suspense A/c has been opened.',
  ),
  card(
    8,
    'roe-suspense',
    'rule',
    'How is an error found AFTER the trial balance rectified?',
    'A one-sided error goes through Suspense A/c: the account that is wrong is corrected and Suspense A/c is debited or credited for the other side. A two-sided error is corrected between the accounts affected, with no Suspense A/c.',
    'The Suspense A/c was opened for the difference. Only an error that caused the difference can clear it.',
    'Sales Book overcast by ₹5,000: Sales A/c Dr ₹5,000; To Suspense A/c ₹5,000.',
    'Sending a two-sided error through Suspense A/c as well.',
  ),
  card(
    9,
    'roe-suspense',
    'format',
    'What does a rectifying entry through Suspense A/c look like?',
    'Journal format: the account to be debited first with "Dr", then "To" the account credited, then a narration beginning "Being ...". Suspense A/c takes the side that undoes the error being corrected: debit it if that error made the debit column larger, credit it if the error made the credit column larger.',
    "Each entry undoes one error's own effect on the columns. When one error caused the whole difference, this clears the balance Suspense A/c opened with. When several errors pull the columns opposite ways, the entry for an error that worked against the rest posts Suspense A/c on the same side it had in the trial balance.",
    "Credit sale of ₹8,000 not posted to Mohan's account: the missing debit made the credit column larger, so Mohan A/c Dr ₹8,000; To Suspense A/c ₹8,000 (Being a credit sale to Mohan not posted to Mohan's account, now rectified).",
    'Leaving out the narration, or deciding the side of Suspense A/c from where it stood in the trial balance instead of from the error being corrected.',
  ),
  card(
    10,
    'roe-two-sided',
    'shortcut',
    'A method that works for every rectifying entry',
    'Three steps: write what was done, write what should have been done, then pass the entry that turns the first into the second. Credit what was wrongly debited, debit what should have been debited. If the two sets do not balance, the gap is Suspense A/c.',
    'Starting from the difference, not from the original transaction, keeps the entry short and the sides right.',
    'Rent debited to Salaries A/c. Done: Salaries Dr. Should be: Rent Dr. Entry: Rent A/c Dr; To Salaries A/c.',
    'Writing the entry from memory of the original transaction and repeating the cash side that was already right.',
  ),
  card(
    11,
    'roe-two-sided',
    'rule',
    'How is an error of principle rectified?',
    'Debit the account that should have been debited and credit the account that was wrongly debited (the reverse for an income). Typical pairs: an asset debited to Purchases; repairs debited to an asset; the owner\'s personal expense debited to an expense, which belongs in Drawings A/c.',
    'It is a two-sided error, so the trial balance agreed and no Suspense A/c is used.',
    'Furniture ₹20,000 debited to Purchases A/c: Furniture A/c Dr ₹20,000; To Purchases A/c ₹20,000.',
    'Crediting Cash again; the cash was recorded correctly the first time.',
  ),
  card(
    12,
    'roe-two-sided',
    'rule',
    'How are compensating errors rectified?',
    'Correct each error separately. Because the two amounts are equal and opposite, the two corrections combine into one entry between the two accounts. No Suspense A/c is needed.',
    'The trial balance agreed, so there is no difference to clear.',
    'Rent over-added by ₹500 and Salaries under-added by ₹500, both on the debit side: Salaries A/c Dr ₹500; To Rent A/c ₹500.',
    'Ignoring them because the trial balance agrees.',
  ),
  card(
    13,
    'roe-two-sided',
    'rule',
    'How is an entry written the wrong way round rectified?',
    'Undo it and post the right one: the correction is twice the original amount. The account that should have been debited is debited with twice the amount, and the other is credited with twice the amount.',
    'The wrong entry has to be cancelled first, then the right one passed, so each account moves by double.',
    'A cash purchase of ₹4,000 recorded as Cash A/c Dr and Purchases A/c Cr: Purchases A/c Dr ₹8,000; To Cash A/c ₹8,000.',
    'Passing the reversal for the original amount only, which leaves the books half corrected.',
  ),
  card(
    14,
    'roe-two-sided',
    'rule',
    'How is an omitted transaction rectified?',
    'A transaction left out of every book: pass the entry that should have been passed. A transaction posted to one account only (partial omission): post the missing side, with Suspense A/c as the other side if the trial balance has already been prepared.',
    'A complete omission leaves debits equal to credits; a partial omission does not.',
    'A credit purchase of ₹7,000 from Rao left out: Purchases A/c Dr ₹7,000; To Rao ₹7,000.',
    'Using Suspense A/c for an omission that was complete.',
  ),
  card(
    15,
    'roe-profit',
    'rule',
    'How does an error affect the profit?',
    'An expense too low or an income too high: profit is overstated. An expense too high or an income too low: profit is understated. An error between two balance sheet items, or between two expenses or two incomes, leaves the net profit unchanged.',
    'Only an error that leaves the total of expenses or of incomes wrong changes the net profit.',
    'Machinery repairs of ₹10,000 debited to Machinery A/c: repairs are ₹10,000 too low, so profit is overstated by ₹10,000.',
    'Thinking that every error changes the profit.',
  ),
  card(
    16,
    'roe-profit',
    'formula',
    'How is the corrected profit worked out?',
    'Corrected profit = profit as per books - overstatements + understatements.',
    'Take each error in turn and decide its direction, then apply the total.',
    'Profit ₹80,000. Furniture ₹12,000 debited to Purchases A/c understates profit: ₹80,000 + ₹12,000 = ₹92,000.',
    'Deducting the amount every time because "an error was made".',
  ),
  card(
    17,
    'roe-suspense-balance',
    'formula',
    'How is what remains in Suspense A/c worked out?',
    'Start with the opening balance of Suspense A/c and apply each rectifying entry: a debit to Suspense raises a debit balance, a credit lowers it. What is left comes from errors not yet found.',
    'Each correction moves Suspense A/c by the difference that error had caused in the trial balance.',
    'Suspense A/c Dr ₹9,000. Corrections credit it ₹4,000 and ₹1,500. Balance: ₹9,000 - ₹4,000 - ₹1,500 = ₹3,500 Dr.',
    'Adding every correction to the opening balance without checking its side.',
  ),
];

// ---------------------------------------------------------------------------------------------------------------
// Authored questions
// ---------------------------------------------------------------------------------------------------------------

const id = (n: number): string => `roe-q-${String(n).padStart(3, '0')}`;
const DEFAULT_HINTS = [
  'Work out which accounts are affected, and whether the debit and credit totals are still equal.',
  'Think about what the error does to each account, one at a time.',
];

/** The correct option is `options[correct]`; each wrong option is [text, the mistake behind it]. */
function mcq(
  n: number,
  conceptId: string,
  difficulty: Difficulty,
  prompt: string,
  options: [string, string | null][],
  correct: number,
  explanation: string,
  hints: string[] = DEFAULT_HINTS,
): McqQuestion {
  return {
    id: id(n),
    topicId: T,
    conceptId,
    difficulty,
    type: 'mcq',
    prompt,
    hints,
    explanation,
    options: options.map(([text, why], i) => ({ id: 'abcd'[i], text, ...(why && i !== correct ? { why } : {}) })),
    correct: 'abcd'[correct],
  };
}

const tf = (n: number, conceptId: string, difficulty: Difficulty, prompt: string, correct: boolean, explanation: string, hints: string[] = DEFAULT_HINTS): TrueFalseQuestion => ({
  id: id(n),
  topicId: T,
  conceptId,
  difficulty,
  type: 'true_false',
  prompt,
  hints,
  explanation,
  correct,
});

const numeric = (
  n: number,
  conceptId: string,
  difficulty: Difficulty,
  prompt: string,
  answer: number,
  commonErrors: { value: number; why: string }[],
  working: string[],
  hints: string[] = DEFAULT_HINTS,
): NumericQuestion => ({
  id: id(n),
  topicId: T,
  conceptId,
  difficulty,
  type: 'numeric',
  prompt,
  hints,
  explanation: working.join(' '),
  unit: 'rupees',
  answer: rupees(answer),
  commonErrors: commonErrors.map((e) => ({ ...e, value: rupees(e.value) })),
  working,
});

const journal = (
  n: number,
  conceptId: string,
  difficulty: Difficulty,
  prompt: string,
  expected: { accountId: string; side: 'Dr' | 'Cr'; amount: number }[],
  extraChoices: string[],
  explanation: string,
): JournalQuestion => ({
  id: id(n),
  topicId: T,
  conceptId,
  difficulty,
  type: 'journal_entry',
  prompt,
  hints: [
    'Work out what was recorded and what should have been recorded.',
    'If the error left only one account wrong after the trial balance, the other side of the entry is Suspense A/c; if two accounts were wrong, no Suspense A/c is needed.',
  ],
  explanation,
  expected: expected.map((l) => ({ ...l, amount: rupees(l.amount) })),
  accountChoices: [...new Set([...expected.map((l) => l.accountId), ...extraChoices])].sort(),
});

const AR_OPTIONS = (whyB: string, whyC: string, whyD: string): [string, string | null][] => [
  ['Both A and R are true, and R is the correct explanation of A.', null],
  ['Both A and R are true, but R is not the correct explanation of A.', whyB],
  ['A is true, but R is false.', whyC],
  ['A is false, but R is true.', whyD],
];

const questions: Question[] = [
  mcq(1, 'roe-classes', 'easy', 'A credit purchase of goods from Rao & Co. was not entered in any book. This is an error of:', [
    ['Omission', null],
    ['Commission', 'Took a transaction that was never recorded for one that was recorded wrongly.'],
    ['Principle', 'Took it for a confusion between capital and revenue items; here nothing was recorded at all.'],
    ['Compensating', 'Took it for two errors that cancel out; here a single entry is missing.'],
  ], 0, 'A transaction left out of the books altogether is a (complete) error of omission.'),
  mcq(2, 'roe-classes', 'easy', 'A computer bought for ₹40,000 was debited to Purchases A/c. This is an error of:', [
    ['Principle', null],
    ['Omission', 'Nothing was left out; the purchase was recorded, in the wrong kind of account.'],
    ['Commission', 'The amounts and sides are right. The slip is in treating a capital item (an asset) as a revenue one (purchases).'],
    ['Compensating', 'Only one error has been made, so there is nothing for it to cancel against.'],
  ], 0, 'A fixed asset is capital expenditure. Debiting it to Purchases treats it as revenue, which breaks an accounting principle.'),
  mcq(3, 'roe-classes', 'easy', 'Goods sold on credit to Kiran were debited to Mohan\'s account; both are customers. This is an error of:', [
    ['Commission', null],
    ['Omission', 'The sale was recorded in full; it went to the wrong person\'s account.'],
    ['Principle', 'No capital item was treated as revenue: both accounts are customers\' accounts of the same kind.'],
    ['Compensating', 'Only one slip has been made, so nothing offsets it.'],
  ], 0, 'A transaction posted to the wrong account of the same kind is an error of commission.'),
  mcq(4, 'roe-classes', 'easy', 'Two or more errors whose effects on the totals of the trial balance are equal and opposite, so that it still agrees, are called:', [
    ['Compensating errors', null],
    ['Errors of omission', 'Nothing is missing; the entries exist but two mistakes offset each other.'],
    ['Errors of principle', 'No accounting principle is broken; two wrong amounts cancel out.'],
    ['Errors of commission only', 'Each slip alone is an error of commission, but errors that cancel each other have their own name.'],
  ], 0, 'Errors that cancel each other so that the totals still agree are compensating errors.'),
  tf(5, 'roe-tb-effect', 'easy', 'An error of principle does not affect the agreement of the trial balance.', true, 'The entry is complete and balanced; only the kind of account is wrong, so debits still equal credits.'),
  tf(6, 'roe-tb-effect', 'easy', 'A trial balance that agrees proves that the books are free from errors.', false, 'Errors of principle, complete omissions, compensating errors and wrong accounts of the same kind all leave the trial balance in agreement.'),
  mcq(7, 'roe-tb-effect', 'medium', 'Which one of these errors will NOT be disclosed by the trial balance?', [
    ['Rent of ₹3,000 paid in cash was debited to Salaries A/c', null],
    ['The Sales Book was overcast by ₹5,000', 'A wrong total leaves one account wrong, so the credit side is ₹5,000 too large and the trial balance disagrees.'],
    ['A credit sale of ₹8,000 to Mohan was posted to Sales A/c but not to Mohan\'s account', 'Only half of the entry was posted, so the debit side is ₹8,000 short and the trial balance disagrees.'],
    ['₹2,500 received from Kiran was posted to the debit of Kiran\'s account', 'A posting on the wrong side makes the debit side ₹5,000 too large, so the trial balance disagrees.'],
  ], 0, 'Rent short by ₹3,000 and Salaries over by ₹3,000, both on the debit side, leave the totals equal. The other three each leave one account wrong.'),
  mcq(8, 'roe-classes', 'medium', 'Which of these is an error of omission?', [
    ['A credit sale of ₹6,000 to Anil was not entered in any book', null],
    ['Furniture bought was debited to Purchases A/c', 'This transaction was recorded; it is an error of principle.'],
    ['The Sales Book was added up ₹1,000 too high', 'Everything was recorded; the total was wrong, which is an error of commission.'],
    ['Rent paid was debited to Salaries A/c', 'The payment was recorded in the wrong account: an error of commission.'],
  ], 0, 'A transaction that does not appear in the books at all is an error of omission.'),
  tf(9, 'roe-tb-effect', 'medium', 'If a transaction is left out of all the books, the trial balance still agrees.', true, 'Neither the debit nor the credit was posted, so the totals remain equal.'),
  tf(10, 'roe-tb-effect', 'medium', 'If a credit sale is posted to Sales A/c but not to the customer\'s account, the trial balance still agrees.', false, 'The credit to Sales is there but the matching debit to the customer is missing, so the credit total is larger.'),
  mcq(11, 'roe-tb-effect', 'medium', 'Assertion (A): Compensating errors are not disclosed by the trial balance. Reason (R): In compensating errors, the effect of one error on the totals of the trial balance is cancelled by an equal and opposite effect of another.',
    AR_OPTIONS(
      'R is the very reason A is true, so it does explain it.',
      'R is true: it describes how the two errors offset one another.',
      'A is true: because the totals still agree, the trial balance gives no sign of the error.',
    ), 0, 'Equal and opposite errors leave debits equal to credits, so the trial balance shows nothing.'),
  mcq(12, 'roe-suspense', 'medium', 'Assertion (A): An error of principle is rectified without a Suspense A/c. Reason (R): An error of principle leaves the trial balance in agreement.',
    AR_OPTIONS(
      'R is the reason A is true: with no difference in the trial balance there is nothing in Suspense A/c to clear.',
      'R is true: an error of principle does not upset the totals.',
      'A is true: the entry goes between the two accounts affected.',
    ), 0, 'Suspense A/c holds only a trial balance difference. An error of principle causes none, so it is corrected between the accounts concerned.'),
  mcq(13, 'roe-suspense', 'easy', 'The debit column of a trial balance adds up to ₹3,52,000 and the credit column to ₹3,49,500. The difference is shown in Suspense A/c:', [
    ['On the credit side, ₹2,500', null],
    ['On the debit side, ₹2,500', 'Put the difference on the side that is already larger; it belongs on the side that is short.'],
    ['On the credit side, ₹7,01,500', 'Added the two totals instead of finding their difference.'],
    ['On the debit side, ₹3,49,500', 'Gave the smaller total instead of the difference between the totals.'],
  ], 0, 'The debit column is larger by ₹2,500, so the credit side is short and Suspense A/c of ₹2,500 goes there.', [
    'Which column is the larger? Suspense goes on the other side.',
    'The amount is the difference between the two totals.',
  ]),
  mcq(14, 'roe-suspense', 'easy', 'Suspense A/c is best described as:', [
    ['A temporary account that holds a trial balance difference until the errors behind it are found', null],
    ['A permanent liability of the business', 'Suspense A/c is not a debt of the business; it is a temporary holding account.'],
    ['An expense that is charged to the profit and loss account every year', 'It is not an expense; it holds an unexplained difference until it is cleared.'],
    ['An account kept to record doubtful debts', 'Doubtful debts have their own provision account; Suspense A/c holds a trial balance difference.'],
  ], 0, 'Suspense A/c is opened to make the trial balance agree and is closed when the errors are located and rectified.'),
  tf(15, 'roe-suspense', 'medium', 'If the errors behind a Suspense A/c are not found before the final accounts are prepared, a debit balance of Suspense A/c is shown on the assets side of the balance sheet.', true, 'The balance is carried to the balance sheet until the errors are found: a debit balance on the assets side, a credit balance on the liabilities side.'),
  mcq(16, 'roe-suspense', 'medium', 'The trial balance did not agree and a Suspense A/c was opened. Which of these errors found later is rectified through Suspense A/c?', [
    ['The Sales Book was added up ₹4,000 too high', null],
    ['Rent paid was debited to Salaries A/c', 'Both accounts are wrong by equal and opposite amounts, so this error caused no difference in the trial balance and Suspense A/c is not used.'],
    ['Machinery bought was debited to Purchases A/c', 'An error of principle leaves the trial balance in agreement, so nothing sits in Suspense A/c for it.'],
    ['A credit sale was left out of every book', 'A complete omission leaves debits equal to credits, so Suspense A/c is not involved.'],
  ], 0, 'Only an error that left one account wrong caused the difference now held in Suspense A/c.'),
  journal(17, 'roe-two-sided', 'easy',
    'Rent of ₹3,000 paid in cash was debited to Salaries A/c. The error is found after the trial balance was prepared; the trial balance agreed, so no Suspense A/c was opened for it. Pass the rectifying journal entry.',
    [{ accountId: 'rent', side: 'Dr', amount: 3000 }, { accountId: 'salaries', side: 'Cr', amount: 3000 }],
    ['cash', 'suspense', 'wages'],
    'Rent should have been debited and Salaries was debited by mistake. Debit Rent, credit Salaries. Both accounts are wrong by the same amount, so no Suspense A/c is needed.'),
  journal(18, 'roe-suspense', 'medium',
    'The Sales Book was overcast by ₹5,000, and the wrong total was posted to Sales A/c. The trial balance did not agree and the difference was put to a Suspense A/c; this error is found afterwards. Pass the rectifying journal entry.',
    [{ accountId: 'sales', side: 'Dr', amount: 5000 }, { accountId: 'suspense', side: 'Cr', amount: 5000 }],
    ['cash', 'purchases', 'bank'],
    'Sales A/c was credited with ₹5,000 too much, so the credit side was larger and Suspense A/c was opened on the debit side. Debit Sales to remove the excess and credit Suspense to clear it.'),
  journal(19, 'roe-suspense', 'medium',
    'A credit sale of ₹8,000 to Mohan was entered in the Sales Book and posted to Sales A/c, but was not posted to Mohan\'s account. The trial balance did not agree and the difference was put to a Suspense A/c; this error is found afterwards. Pass the rectifying journal entry.',
    [{ accountId: 'debtor:Mohan', side: 'Dr', amount: 8000 }, { accountId: 'suspense', side: 'Cr', amount: 8000 }],
    ['sales', 'cash', 'bank'],
    'The debit to Mohan is missing, so the debit side was short and Suspense A/c was opened on the debit side. Debit Mohan and credit Suspense.'),
  journal(20, 'roe-two-sided', 'medium',
    'Furniture bought on credit from Rao for ₹20,000 was debited to Purchases A/c. The error is found before the trial balance is prepared, so no Suspense A/c exists. Pass the rectifying journal entry.',
    [{ accountId: 'furniture', side: 'Dr', amount: 20000 }, { accountId: 'purchases', side: 'Cr', amount: 20000 }],
    ['creditor:Rao', 'suspense', 'cash'],
    'Furniture is an asset, so it should have been debited to Furniture A/c. Debit Furniture and credit Purchases; Rao\'s account was right and is not touched.'),
  mcq(21, 'roe-before-tb', 'medium', 'Before the trial balance is prepared, a credit sale of ₹6,000 to Mohan is found not to have been posted to Mohan\'s account. How is it corrected?', [
    ['Debit Mohan\'s account with ₹6,000 directly; no Suspense A/c is used', null],
    ['Debit Mohan\'s account and credit Suspense A/c with ₹6,000', 'Used Suspense A/c, but none exists before the trial balance is prepared; nothing has been carried to it.'],
    ['Credit Mohan\'s account with ₹6,000', 'Put the correction on the wrong side; a credit sale is debited to the customer.'],
    ['Debit Mohan\'s account and credit Sales A/c with ₹6,000', 'Sales A/c was already credited; crediting it again would double the sale.'],
  ], 0, 'Only Mohan\'s account is wrong and there is no Suspense A/c yet, so the account itself is corrected with a debit of ₹6,000.'),
  tf(22, 'roe-before-tb', 'medium', 'An error that leaves only one account wrong must always be rectified through a Suspense A/c, even when it is found before the trial balance is prepared.', false, 'Before the trial balance there is no Suspense A/c. The one account is corrected directly.'),
  numeric(23, 'roe-suspense', 'easy', 'The debit column of a trial balance adds up to ₹4,52,000 and the credit column to ₹4,47,500. What amount is entered in Suspense A/c?', 4500, [
    { value: 899500, why: 'Added the two totals instead of finding their difference.' },
    { value: 447500, why: 'Gave the smaller total instead of the difference between the totals.' },
  ], ['Difference = ₹4,52,000 - ₹4,47,500 = ₹4,500.', 'It goes on the credit side, the side that is short.']),
  numeric(24, 'roe-profit', 'medium', 'A trader\'s net profit as shown by the books is ₹80,000. Furniture costing ₹12,000 bought for cash was debited to Purchases A/c. The profit is to be corrected for this error only. What is the correct net profit?', 92000, [
    { value: 68000, why: 'Deducted the amount; but an asset charged to Purchases made the expenses too high, so the profit was understated.' },
    { value: 80000, why: 'Left the profit unchanged, thinking an error in the books does not matter to profit.' },
    { value: 104000, why: 'Added the amount twice, once for each account in the entry.' },
  ], ['Purchases was debited with ₹12,000 that should have been debited to Furniture.', 'Expenses were too high, so profit was understated by ₹12,000.', 'Correct profit = ₹80,000 + ₹12,000 = ₹92,000.']),
  numeric(25, 'roe-suspense-balance', 'complex', 'Suspense A/c was opened with a debit balance of ₹9,000. Two errors were then found and rectified: (i) the Purchases Book was undercast by ₹4,000; (ii) a credit sale of ₹1,500 to Kiran was not posted to Kiran\'s account. What amount remains in Suspense A/c?', 3500, [
    { value: 14500, why: 'Added both corrections to the opening balance instead of deducting them.' },
    { value: 5000, why: 'Corrected only the Purchases Book error and missed the unposted sale.' },
    { value: 7500, why: 'Corrected only the unposted sale and missed the Purchases Book error.' },
  ], [
    '(i) Purchases is too low by ₹4,000: Purchases A/c Dr ₹4,000; To Suspense A/c ₹4,000.',
    '(ii) Kiran\'s debit is missing: Kiran A/c Dr ₹1,500; To Suspense A/c ₹1,500.',
    'Suspense: ₹9,000 Dr - ₹4,000 - ₹1,500 = ₹3,500 Dr, left by errors not yet found.',
  ]),
  numeric(26, 'roe-tb-effect', 'medium', '₹3,500 received in cash from Anil was entered correctly in the Cash Book but posted to the debit of Anil\'s account. By what amount do the two totals of the trial balance differ because of this error?', 7000, [
    { value: 3500, why: 'Counted the posting once; a posting on the wrong side moves the difference by twice its amount.' },
    { value: 1750, why: 'Halved the amount, thinking the difference is shared between the two columns.' },
  ], ['The credit of ₹3,500 to Anil is missing and a debit of ₹3,500 has been added.', 'Debit side is too large by ₹3,500 + ₹3,500 = ₹7,000.']),
  mcq(27, 'roe-profit', 'medium', 'Which one of these errors will cause the net profit to be overstated?', [
    ['Repairs to machinery, ₹10,000, were debited to Machinery A/c', null],
    ['Furniture bought for ₹10,000 was debited to Purchases A/c', 'This overcharges expenses and so understates profit; it does not overstate it.'],
    ['A credit sale of ₹10,000 was left out of the books', 'Sales are too low, so profit is understated.'],
    ['Rent was debited to Salaries A/c', 'Both are expenses of the same kind; the total expense and so the profit are unchanged.'],
  ], 0, 'Repairs are an expense. Debiting them to an asset leaves expenses ₹10,000 too low, so profit is overstated by ₹10,000.'),
  mcq(28, 'roe-two-sided', 'medium', 'A servant\'s salary of ₹4,000 at the proprietor\'s house was paid in cash by the firm and debited to Salaries A/c. Found before the trial balance was prepared, the rectifying entry is:', [
    ['Drawings A/c Dr ₹4,000; To Salaries A/c ₹4,000', null],
    ['Salaries A/c Dr ₹4,000; To Drawings A/c ₹4,000', 'Reversed the entry, which doubles the error instead of removing it.'],
    ['Drawings A/c Dr ₹4,000; To Cash A/c ₹4,000', 'Credited Cash again; the cash was recorded correctly the first time.'],
    ['Drawings A/c Dr ₹4,000; To Suspense A/c ₹4,000', 'Used Suspense A/c, but this error leaves the trial balance in agreement and no Suspense A/c exists.'],
  ], 0, 'A personal expense of the owner is Drawings, not an expense of the business. Debit Drawings and credit Salaries, which was debited wrongly.'),
  tf(29, 'roe-two-sided', 'medium', 'An error of principle can be rectified only through Suspense A/c.', false, 'An error of principle leaves the trial balance in agreement, so it is corrected between the accounts affected.'),
  mcq(30, 'roe-classes', 'medium', 'Which of these is a compensating error?', [
    ['The Sales Book and the Purchases Book were both overcast by ₹2,000', null],
    ['The Sales Book was overcast by ₹2,000 and Rent A/c was debited ₹1,000 too much', 'The two amounts are not equal, so they do not cancel; the trial balance differs by ₹1,000.'],
    ['A credit sale of ₹2,000 was not posted to the customer\'s account', 'This is a single error with nothing to offset it; the trial balance disagrees.'],
    ['Furniture bought for ₹2,000 was debited to Purchases A/c', 'This is one error of principle, not two errors cancelling each other.'],
  ], 0, 'Sales is ₹2,000 too high on the credit side and Purchases ₹2,000 too high on the debit side. The two cancel in the trial balance.'),
  mcq(31, 'roe-tb-effect', 'easy', 'A two-sided error is one that:', [
    ['Leaves two or more accounts wrong by amounts that cancel each other, so the debit and credit totals stay equal and the trial balance agrees', null],
    ['Is made twice in the books', 'The "two" in two-sided is about the accounts affected, not about how often the error is made.'],
    ['Affects only one account, so the trial balance disagrees', 'That describes a one-sided error.'],
    ['Makes the debit total larger and the credit total smaller', 'That describes an error that makes the trial balance disagree.'],
  ], 0, 'The usual convention: an error is one-sided if it leaves only one account wrong, and two-sided if it leaves two or more accounts wrong by amounts that cancel each other in the trial balance. Rent debited to Salaries A/c is two-sided: Salaries is too high and Rent too low by the same amount, so the totals still agree and no Suspense A/c is needed.'),
  mcq(32, 'roe-tb-effect', 'medium', 'Which of these is a one-sided error?', [
    ['Cash received from a customer was entered in the Cash Book but not posted to the customer\'s account', null],
    ['Goods sold to Kiran were debited to Mohan\'s account', 'Two accounts are wrong by equal and opposite amounts, so this is a two-sided error.'],
    ['Machinery bought was debited to Purchases A/c', 'Two accounts are wrong by equal and opposite amounts; this is a two-sided error of principle.'],
    ['A credit purchase was left out of every book', 'Neither side was posted, so this is a two-sided (complete) omission.'],
  ], 0, 'Only the customer\'s account is wrong, so the credit total is short of the debit total and the trial balance disagrees.'),
];

// ---------------------------------------------------------------------------------------------------------------
// Lesson and ladder
// ---------------------------------------------------------------------------------------------------------------

const EASY_A = [
  'roe-class-of-error',
  'roe-one-or-two-sided',
  'roe-affects-tb',
  'roe-suspense-side',
  'roe-tb-difference',
  'roe-suspense-opening',
];
const EASY_B = [
  'roe-wrong-expense',
  'roe-wrong-party',
  'roe-omitted-transaction',
  'roe-principle-asset',
  'roe-which-account-debited',
  'roe-pick-entry',
];
const GUIDED = ['roe-book-casting', 'roe-corrected-balance'];
const MEDIUM_A = [
  'roe-not-posted',
  'roe-wrong-amount-posting',
  'roe-wrong-side-posting',
  'roe-suspense-from-balances',
  'roe-use-suspense',
  'roe-before-after-entry',
  'roe-corrected-balance-side',
  'roe-corrected-account',
];
const MEDIUM_B = [
  'roe-principle-other',
  'roe-compensating',
  'roe-reversed-entry',
  'roe-which-not-revealed',
  'roe-profit-direction',
  'roe-profit-correct-one',
];
const COMPLEX = [
  'roe-wrong-book',
  'roe-principle-combined',
  'roe-two-errors-combined',
  'roe-net-tb-difference',
  'roe-suspense-after-errors',
  'roe-suspense-side-after',
  'roe-corrected-profit',
  'roe-profit-complex',
];

const levels = buildLadder(T, {
  concept: {
    title: 'What Is Rectification of Errors?',
    description: 'See how books go wrong, which errors the trial balance catches, and when a Suspense account is needed.',
    lesson: [
      {
        type: 'text',
        heading: 'Books can go wrong in four ways',
        body: 'A transaction can be left out of the books (omission). It can be recorded or posted wrongly: the wrong account, the wrong side, the wrong amount or a wrong total (commission). A capital item can be treated as revenue, or a personal item as a business one (principle). Or two mistakes can cancel each other (compensating).',
      },
      {
        type: 'text',
        heading: 'Does the trial balance notice?',
        body: 'The trial balance only checks that debits equal credits. An error that leaves two accounts wrong by equal and opposite amounts (a wrong account of the same kind, a complete omission, an error of principle) goes unnoticed. An error that leaves a single account wrong (a posting left out, a wrong amount, a wrong total) makes the totals differ.',
      },
      {
        type: 'text',
        heading: 'Before or after the trial balance?',
        body: 'An error that made one account wrong, found before the trial balance is prepared, is simply corrected in that account; there is no Suspense account yet. If the totals of the trial balance differ, the difference is put to a Suspense account on the short side, and a one-sided error found afterwards is rectified through Suspense A/c. A two-sided error is corrected by a journal entry between the accounts concerned whenever it is found, and never goes through Suspense.',
      },
      {
        type: 'example',
        title: 'Sales Book overcast by ₹5,000 (found after the trial balance)',
        lines: [
          { accountId: 'sales', side: 'Dr', amount: 500000 },
          { accountId: 'suspense', side: 'Cr', amount: 500000 },
        ],
        note: 'Sales A/c was credited with ₹5,000 too much, so the trial balance had too much on the credit side and Suspense A/c was opened on the debit side. Debiting Sales removes the excess; crediting Suspense clears the difference.',
      },
      {
        type: 'example',
        title: 'Worked example 1: a two-sided error (Sandhu Sports, Jalandhar)',
        lines: [
          { accountId: 'salaries', side: 'Dr', amount: 1200000 },
          { accountId: 'wages', side: 'Cr', amount: 1200000 },
        ],
        note: 'Salaries of ₹12,000 paid in cash were debited to Wages A/c. Recorded: Wages A/c Dr ₹12,000, Cash A/c Cr ₹12,000. Should have been: Salaries A/c Dr ₹12,000, Cash A/c Cr ₹12,000. The cash side is right; Wages has ₹12,000 too much and Salaries ₹12,000 too little, so the trial balance agreed and no Suspense A/c is used. Both are expenses, so the net profit is unchanged. Watch out: do not credit Cash A/c again; a posting that was right the first time is never repeated.',
      },
      {
        type: 'example',
        title: 'Worked example 2: an entry the wrong way round (Kaveri Agro Inputs, Erode)',
        lines: [
          { accountId: 'purchases', side: 'Dr', amount: 1600000 },
          { accountId: 'cash', side: 'Cr', amount: 1600000 },
        ],
        note: 'Seeds bought for resale for ₹8,000 in cash were recorded as Cash A/c Dr ₹8,000 and Purchases A/c Cr ₹8,000. The right entry is Purchases A/c Dr ₹8,000; To Cash A/c ₹8,000. Cancelling the wrong entry takes ₹8,000 and passing the right one another ₹8,000, so each account moves by ₹16,000. The trial balance agreed, so there is no Suspense A/c. Watch out: rectifying for ₹8,000 only leaves both accounts still wrong by ₹8,000.',
      },
      {
        type: 'working',
        title: 'Worked example 3: Suspense A/c debited and credited in turn (Nair Spice Traders, Kochi)',
        lines: [
          'The trial balance does not agree: the debit column is short by ₹1,800, so Suspense A/c is opened with a debit balance of ₹1,800.',
          '(a) Rent of ₹4,200 paid in cash was not posted to Rent A/c. The missing debit made the credit column larger by ₹4,200: Rent A/c Dr ₹4,200; To Suspense A/c ₹4,200. Suspense A/c is credited.',
          '(b) The Purchases Book was overcast by ₹2,400. Purchases A/c got ₹2,400 too much on its debit side, which made the debit column larger: Suspense A/c Dr ₹2,400; To Purchases A/c ₹2,400. Suspense A/c is debited, the same side as its opening balance.',
          'Suspense A/c: debit side ₹1,800 + ₹2,400 = ₹4,200; credit side ₹4,200. The two errors explain the whole difference, and the account is closed.',
        ],
        note: 'Watch out: an entry does not credit Suspense A/c just because it opened with a debit balance. Each entry takes the side that undoes its own error (debit Suspense if the error made the debit column larger); only all of them together clear it.',
      },
      {
        type: 'table',
        title: 'Worked example 4: correcting the profit (Bansal Footwear, Agra)',
        rows: [
          { label: 'Net profit as per the books', amount: '₹2,40,000' },
          { label: 'Add: Machinery bought for ₹30,000 debited to Purchases A/c (an expense too high)', amount: '₹30,000' },
          { label: 'Add: Sales Book undercast by ₹6,000 (an income too low)', amount: '₹6,000' },
          { label: 'Less: Repairs of ₹4,000 debited to Machinery A/c (an expense too low)', amount: '(4,000)' },
          { label: 'Corrected net profit', amount: '₹2,72,000', total: true },
        ],
        note: 'Depreciation on the machinery is ignored, as such questions say. Watch out: an asset charged to Purchases understates the profit (the expenses are too high), so its cost is added back, not deducted; repairs charged to an asset overstate it, so they are deducted.',
      },
      {
        type: 'text',
        heading: 'Does the profit change?',
        body: 'Only if the error leaves an expense or an income wrong. An expense too low or an income too high overstates the profit; an expense too high or an income too low understates it. An error between two persons, or between two expenses, leaves the net profit as it was.',
      },
      { type: 'check', questionId: id(1) },
      { type: 'check', questionId: id(13) },
    ],
  },
  cards: {
    title: 'Classes, Suspense and the Rules',
    description: 'Recall the classes of error, what the trial balance shows, and how each kind is corrected.',
    cardIds: cards.map((c) => c.id),
  },
  recognition: [
    {
      title: 'Name the Error',
      description: 'Class of error, and whether the trial balance catches it.',
      questionIds: [id(1), id(2), id(3), id(4), id(5), id(6), id(8), id(11), id(30)],
    },
    {
      title: 'Suspense and Timing',
      description: 'Which errors go through Suspense, and what changes before the trial balance.',
      questionIds: [id(7), id(9), id(10), id(12), id(13), id(14), id(15), id(16), id(21), id(22), id(28), id(29), id(31), id(32)],
    },
  ],
  practice: [
    {
      title: 'Classes and Effects',
      description: 'Classify errors, say what they do to the trial balance, and find the Suspense difference.',
      templateIds: EASY_A,
      count: 8,
    },
    {
      title: 'First Rectifying Entries',
      description: 'Two-sided errors: wrong accounts, omissions and assets booked as expenses.',
      templateIds: EASY_B,
      count: 6,
    },
    {
      title: 'Casting and Corrected Balances (Guided)',
      description: 'A wrong total through Suspense, and a corrected account balance, with the method laid out.',
      templateIds: GUIDED,
      count: 5,
      guided: true,
    },
    {
      title: 'Suspense Entries and Balances',
      description: 'Postings left out, wrong amounts and wrong sides, before and after the trial balance.',
      templateIds: MEDIUM_A,
      count: 8,
    },
    {
      title: 'Entries and Effect on Profit',
      description: 'Principle, compensating and reversed entries, and what each does to profit.',
      templateIds: MEDIUM_B,
      count: 8,
    },
    {
      title: 'Complex Errors',
      description: 'Wrong books, combined errors, the Suspense balance and corrected profit.',
      templateIds: COMPLEX,
      count: 8,
    },
  ],
  mixed: { title: 'Mixed Practice', description: 'Everything in this topic, shuffled the way an exam serves it.', count: 12 },
  challenge: {
    title: 'Challenge: Rectification Mastery',
    description: 'The hardest questions in the topic, mixed together and timed.',
    count: 8,
  },
  // "Pass the rectifying entries": a list of errors found in the books of one business, one entry for each.
  sets: [
    {
      title: 'Rectify a List of Errors',
      description: 'Three or four errors of one business, one rectifying entry for each: lists found before any Suspense account exists, and lists that close one.',
      templateIds: ['roe-set-before-trial-balance', 'roe-set-totals-and-postings'],
      count: 4,
    },
    {
      title: 'Longer Lists: Suspense or Not?',
      description: 'Four or five errors in a list: wrong totals, sides and figures through Suspense, errors that leave Suspense alone, and capital items booked as expenses or goods.',
      templateIds: ['roe-set-through-suspense', 'roe-set-suspense-or-not', 'roe-set-principle'],
      count: 4,
    },
    {
      title: 'A Full List to Work Out',
      description: 'Six to eight errors after the trial balance, many with an amount to work out: one list that closes Suspense, and one the trial balance never showed.',
      templateIds: ['roe-set-worked-amounts', 'roe-set-trial-balance-agreed'],
      count: 4,
    },
  ],
  // The Suspense A/c itself, prepared from a list of errors: which of them have a row in it, and on which side.
  formats: [
    {
      title: 'Prepare the Suspense A/c',
      description: 'Write up Suspense A/c from a list of errors found after the trial balance: leave out the errors that never upset it, and carry down what is left, or find the difference the account opened with.',
      templateIds: ['roe-fmt-suspense', 'roe-fmt-suspense-find'],
      count: 4,
    },
    {
      title: 'Effect of Errors on the Trial Balance and the Profit',
      description: 'Five errors in a statement of four columns: by how much each made the debit or the credit total larger, and by how much it overstated or understated the profit; then the totals.',
      templateIds: ['roe-fmt-effect'],
      count: 2,
    },
  ],
});

const allLevels: Level[] = [
  ...levels,
  ...laterLevels(T, levels, [
    // Added after the papers were set: they stand before Assertion and Reason, which stays the last level.
    {
      name: 'carry-forward-and-balances',
      type: 'medium_practice',
      title: 'Carrying Forward, Balances Brought Down and the Trial Balance Itself',
      description: 'A page total carried forward wrongly, an opening balance brought down as the wrong figure, and a balance left out of the trial balance or put in the wrong column: what each does to Suspense A/c.',
      generate: { templateIds: ['roe-carry-forward', 'roe-wrong-balance-bd', 'roe-omitted-balance'], count: 8 },
    },
    {
      name: 'combined-errors',
      type: 'complex_practice',
      title: 'Combined Errors and What Is Left in Suspense',
      description: 'A wrong figure posted on the wrong side, rectified for both together, and the balance left in Suspense A/c after slips of every kind.',
      generate: { templateIds: ['roe-combined-error', 'roe-suspense-balances'], count: 8 },
    },
    {
      name: 'assertion-reason',
      type: 'medium_practice',
      title: 'Assertion and Reason',
      description: 'Two statements on this topic: decide whether each is true, and whether the Reason explains the Assertion.',
      generate: { templateIds: ['roe-assertion-reason'], count: 8 },
    },
  ]),
];

const pack: TopicPack = { topicId: T, concepts, cards, levels: allLevels, questions };

export default pack;
