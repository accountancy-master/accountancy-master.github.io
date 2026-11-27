import { buildLadder, laterLevels } from '../ladder';
import type { Card, Concept, Level, McqQuestion, NumericQuestion, Question, TopicPack, TrueFalseQuestion, JournalQuestion } from '../types';

const T = 'bank-reconciliation';

const concepts: Concept[] = [
  { id: 'brs-why', topicId: T, title: 'Why the cash book and the pass book differ' },
  { id: 'brs-timing', topicId: T, title: 'Cheques not yet presented or cleared' },
  { id: 'brs-bank-items', topicId: T, title: 'Items the bank records first' },
  { id: 'brs-from-cb', topicId: T, title: 'Starting from the cash book balance' },
  { id: 'brs-from-pb', topicId: T, title: 'Starting from the pass book balance' },
  { id: 'brs-overdraft', topicId: T, title: 'Favourable balance and overdraft' },
  { id: 'brs-errors', topicId: T, title: 'Errors in either book' },
  { id: 'brs-amended', topicId: T, title: 'The amended cash book' },
  { id: 'brs-sets', topicId: T, title: 'Journalising the items that need an entry' },
  { id: 'brs-formats', topicId: T, title: 'Preparing the statement and the amended cash book' },
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
): Card => ({ id: `brs-card-${n}`, topicId: T, conceptId, kind, prompt, answer, explanation, example, commonMistake });

const cards: Card[] = [
  card(1, 'brs-why', 'rule', 'Why can the cash book and the pass book show different bank balances?',
    'They are two records of one bank account, kept by two parties at different times. The difference comes from timing differences, items the bank records first, and errors in either book.',
    'The firm writes an entry when it issues or deposits a cheque. The bank writes its entry only when it pays or collects the cheque, or when it makes a charge or receives money on the firm\'s behalf.',
    'The firm issues a cheque on 30 March and the bank pays it on 3 April: on 31 March the cash book has it and the pass book does not.',
    'Thinking a difference always means somebody has made a mistake.'),
  card(2, 'brs-why', 'rule', 'How is a favourable balance shown in each book?',
    'Cash book (bank column): debit balance. Pass book: credit balance. An overdraft is the opposite: credit balance in the cash book, debit balance in the pass book.',
    'The pass book is the bank\'s record of the firm\'s account. Money the bank holds for the firm is a liability of the bank, so it is a credit there. For the firm the same money is an asset, so it is a debit in the cash book.',
    'Money in the bank ₹40,000: cash book bank column debit ₹40,000; pass book credit ₹40,000.',
    'Reading a debit balance in the pass book as money in the bank.'),
  card(3, 'brs-timing', 'rule', 'What are the two timing differences?',
    'Cheques issued but not yet presented for payment, and cheques deposited but not yet cleared (credited) by the bank.',
    'In both cases the cash book already has the entry and the bank will have it later. They are not mistakes and need no entry in the cash book; they only appear in the reconciliation statement.',
    'Cheque issued ₹5,000 on 31 March, paid by the bank on 4 April: cash book balance lower than pass book balance by ₹5,000 on 31 March.',
    'Entering these cheques in the cash book a second time.'),
  card(4, 'brs-bank-items', 'rule', 'Which items does the bank record before the firm does?',
    'Bank charges, interest debited, interest credited, dividend collected, direct deposits by customers, payments on standing instructions and dishonoured cheques.',
    'The firm learns about them only from the pass book. Each one needs an entry in the cash book once the firm knows.',
    'The bank pays an insurance premium of ₹2,000 on the standing instruction: the pass book is lower by ₹2,000 until the firm records it.',
    'Treating these items as timing differences that will put themselves right.'),
  card(5, 'brs-from-cb', 'shortcut', 'Starting from a favourable cash book balance, which items are added and which are deducted?',
    'Add: cheques issued but not presented, interest credited, dividend collected, direct deposits, wrong credits by the bank. Deduct: cheques deposited but not cleared, bank charges, interest debited, standing instructions, dishonoured cheques, wrong debits by the bank.',
    'Ask whether the pass book balance is higher or lower than the cash book balance because of the item. Higher: add. Lower: deduct.',
    'Cash book ₹50,000; cheque issued not presented ₹4,000; bank charges ₹300. Pass book = 50,000 + 4,000 - 300 = ₹53,700.',
    'Adding every item, or deducting every item, without asking which way each one moves the bank\'s balance.'),
  card(6, 'brs-from-pb', 'shortcut', 'Starting from a favourable pass book balance, what changes?',
    'Every item works the other way round. Cheques issued but not presented are deducted; cheques deposited but not cleared are added; bank charges, interest debited, standing instructions and dishonoured cheques are added back; interest credited, dividend and direct deposits are deducted.',
    'You are going from the bank\'s balance back to the firm\'s balance, so each adjustment is the opposite of the one made from the cash book.',
    'Pass book ₹53,700; cheque issued not presented ₹4,000; bank charges ₹300. Cash book = 53,700 - 4,000 + 300 = ₹50,000.',
    'Using the cash book rule when starting from the pass book.'),
  card(7, 'brs-overdraft', 'rule', 'What changes when the starting balance is an overdraft?',
    'Every add becomes a deduct and every deduct becomes an add. An item that would raise a favourable balance reduces an overdraft.',
    'An overdraft is a negative balance. Moving it towards favourable makes it smaller, so the item is deducted from the overdraft.',
    'Overdraft as per cash book ₹20,000; cheque issued not presented ₹5,000: overdraft as per pass book = 20,000 - 5,000 = ₹15,000.',
    'Using the favourable-balance rule on an overdraft.'),
  card(8, 'brs-overdraft', 'shortcut', 'What is the quick test that works for both a favourable balance and an overdraft?',
    'Ask whether the item makes the other book more favourable. If it does, move your balance towards favourable: add to a favourable balance, deduct from an overdraft. If it makes the other book less favourable, move the other way.',
    'Cheques issued but not presented make the pass book more favourable (the bank has not paid them yet). Charges make it less favourable.',
    'Overdraft as per pass book ₹9,000 includes charges ₹200 not in the cash book. The charges make the pass book less favourable, so the cash book overdraft is smaller: 9,000 - 200 = ₹8,800.',
    'Memorising add and deduct lists for a favourable balance only.'),
  card(9, 'brs-errors', 'rule', 'How are errors in the cash book dealt with?',
    'Find whether the error made the cash book balance too high or too low. Too high: deduct the amount. Too low: add it. After correcting, the cash book balance is right.',
    'Under-casting the payments side makes the balance too high; over-casting it makes the balance too low. For the receipts side it is the other way round. A cheque entered for a wrong amount changes the balance by the difference.',
    'Payments side under-cast by ₹500: cash book balance too high, so deduct ₹500.',
    'Correcting the error in the direction that makes it worse.'),
  card(10, 'brs-errors', 'rule', 'What if the bank makes the mistake?',
    'The firm makes no entry. The bank must correct its own mistake, and the item is shown in the reconciliation statement until it does.',
    'A wrong debit by the bank makes the pass book balance too low; a wrong credit makes it too high.',
    'The bank wrongly debits ₹1,000 to the firm\'s account. Starting from the cash book balance, deduct ₹1,000 to reach the pass book balance.',
    'Entering the bank\'s mistake in the cash book.'),
  card(11, 'brs-from-cb', 'format', 'What is the format of a reconciliation statement?',
    'Heading: Bank reconciliation statement as on (date). First line: balance as per cash book (favourable or overdraft). Then Add: items. Less: items. Last line: balance as per pass book.',
    'Each item is listed on its own line with its amount, so the examiner can see the direction of every item. The last line must equal the pass book balance.',
    'Balance as per cash book ₹50,000; Add: cheque issued not presented ₹4,000; Less: bank charges ₹300; Balance as per pass book ₹53,700.',
    'Leaving out the nature of the balance or the date.'),
  card(12, 'brs-amended', 'rule', 'Which items need an entry in the cash book?',
    'Items first recorded by the bank (charges, interest, dividend, direct deposits, standing instructions, dishonoured cheques) and errors in the cash book. Not: cheques not presented or cleared, and errors of the bank.',
    'The cash book is changed only where the firm\'s own record is incomplete or wrong.',
    'Bank charges ₹300: Bank Charges A/c Dr ₹300, To Bank A/c ₹300.',
    'Passing an entry for a cheque that has not yet cleared.'),
  card(13, 'brs-amended', 'shortcut', 'How do you find the amended cash book balance from the pass book balance?',
    'Amended cash book balance = pass book balance with only the timing differences and the bank\'s own errors reversed.',
    'After the cash book is amended, only those items still keep the two balances apart.',
    'Pass book ₹53,700 with a cheque of ₹4,000 issued but not presented and bank charges of ₹300 not yet entered: amended cash book balance = 53,700 - 4,000 = ₹49,700. (The cash book showed ₹50,000 before; entering the charges brings it to ₹49,700.)',
    'Also reversing the bank charges and interest, which the cash book now enters itself.'),
  card(14, 'brs-bank-items', 'format', 'What entries record a dishonoured cheque and bank charges in the cash book?',
    'Dishonoured cheque: Customer A/c Dr, To Bank A/c. Bank charges: Bank Charges A/c Dr, To Bank A/c. Interest or dividend credited by the bank: Bank A/c Dr, To Interest or Dividend Received A/c.',
    'The bank balance goes down when the bank deducts something and up when it adds something.',
    'Cheque of ₹4,500 from Mohan dishonoured: Mohan A/c Dr ₹4,500, To Bank A/c ₹4,500.',
    'Debiting Bank when the bank has taken money out.'),
  card(15, 'brs-formats', 'format', 'How is a reconciliation statement set out with a Plus column and a Minus column?',
    'A favourable balance is entered in the Plus column and an overdraft in the Minus column. An item that makes the other book more favourable goes in the Plus column; one that makes it less favourable goes in the Minus column. The statement ends on the difference of the two totals: a favourable balance if the Plus total is the larger, an overdraft if the Minus total is.',
    'The Plus column is the Add of the other form and the Minus column its Less. From an overdraft every item keeps the column it would have from a favourable balance: an item in the Plus column is the one deducted from the overdraft, and an item in the Minus column is the one added to it.',
    'Overdraft as per cash book ₹20,000 (Minus); cheque issued not presented ₹5,000 (Plus); bank charges ₹300 (Minus). Plus total ₹5,000, Minus total ₹20,300: overdraft as per pass book ₹15,300.',
    'Putting an overdraft in the Plus column, or naming the closing figure without comparing the two totals.'),
];

// ---------------------------------------------------------------------------------------------------------------
// Authored questions
// ---------------------------------------------------------------------------------------------------------------

const id = (n: number) => `brs-q-${String(n).padStart(3, '0')}`;

/** An mcq whose options are [text, why-if-wrong]; `correct` is the index of the right option. */
const mcq = (
  n: number,
  conceptId: string,
  difficulty: McqQuestion['difficulty'],
  prompt: string,
  options: [string, string?][],
  correct: number,
  explanation: string,
  hints: string[],
): McqQuestion => ({
  id: id(n),
  topicId: T,
  conceptId,
  difficulty,
  type: 'mcq',
  prompt,
  options: options.map(([text, why], i) => ({ id: 'abcd'[i], text, ...(why && i !== correct ? { why } : {}) })),
  correct: 'abcd'[correct],
  explanation,
  hints,
});

const tf = (n: number, conceptId: string, difficulty: TrueFalseQuestion['difficulty'], prompt: string, correct: boolean, explanation: string, hints: string[]): TrueFalseQuestion => ({
  id: id(n), topicId: T, conceptId, difficulty, type: 'true_false', prompt, correct, explanation, hints,
});

const num = (
  n: number,
  conceptId: string,
  difficulty: NumericQuestion['difficulty'],
  prompt: string,
  answerRupees: number,
  commonErrors: [number, string][],
  working: string[],
  hints: string[],
): NumericQuestion => ({
  id: id(n), topicId: T, conceptId, difficulty, type: 'numeric', unit: 'rupees', prompt,
  answer: answerRupees * 100,
  commonErrors: commonErrors.map(([value, why]) => ({ value: value * 100, why })),
  working,
  explanation: working.join(' '),
  hints,
});

const AR = [
  'Both A and R are true and R is the correct explanation of A',
  'Both A and R are true but R is not the correct explanation of A',
  'A is true but R is false',
  'A is false but R is true',
];

const journal = (n: number, conceptId: string, prompt: string, expected: JournalQuestion['expected'], choices: string[], explanation: string): JournalQuestion => ({
  id: id(n), topicId: T, conceptId, difficulty: 'easy', type: 'journal_entry', prompt, expected,
  accountChoices: [...choices].sort(), explanation,
  hints: ['Which account is affected besides the bank?', 'Did the bank balance go up or down because of this item?'],
});

const questions: Question[] = [
  mcq(1, 'brs-why', 'easy', 'What is the main purpose of a bank reconciliation statement?', [
    ['To find the profit of the business for the year', 'Confused a reconciliation with the final accounts.'],
    ['To explain why the bank balance in the cash book differs from the balance in the pass book'],
    ['To replace the cash book as the record of bank transactions', 'The statement is prepared from the two books; it replaces neither.'],
    ['To record cheques received from customers', 'Confused the statement with the cash book, where receipts are recorded.'],
  ], 1, 'The statement lists the items that explain the difference between the two balances, so that the firm can check that both are right.', ['Think about what two things the statement compares.', 'It does not record transactions.']),
  mcq(2, 'brs-why', 'easy', 'The pass book is:', [
    ['The firm\'s own record of cash and bank transactions', 'That is the cash book.'],
    ['A copy of the firm\'s account, written up by the bank', undefined],
    ['A record of the cheques the firm has received but not yet deposited', 'Cheques not yet deposited are in neither the pass book nor the bank column of the cash book.'],
    ['A statement of the bank\'s own profit', 'The pass book shows the firm\'s account, not the bank\'s accounts.'],
  ], 1, 'The bank writes the pass book from its own records of the firm\'s account, so it is the bank\'s version of the same account the cash book keeps.', ['Who writes it?', 'Whose account does it show?']),
  mcq(3, 'brs-timing', 'easy', 'Which of these is a timing difference between the cash book and the pass book?', [
    ['Bank charges debited by the bank', 'Charges are an item the cash book lacks, not a timing difference: the firm never entered them.'],
    ['A cheque issued to a supplier that has not yet been presented at the bank'],
    ['The payments side of the cash book added up wrongly', 'That is a mistake in the cash book, not a timing difference.'],
    ['A cheque of another customer debited to the firm\'s account by mistake', 'That is the bank\'s error, not a timing difference.'],
  ], 1, 'A cheque issued but not yet presented is in the cash book already and will reach the pass book later. That is a timing difference.', ['Which item will put itself right once the bank acts?', 'Timing differences are about when each party writes the entry.']),
  mcq(4, 'brs-timing', 'easy', 'A cheque received from a customer is paid into the bank on the last day of the month, and the bank credits it only in the next month. At the month end it is:', [
    ['In both books', 'The bank has not yet credited it, so the pass book does not show it.'],
    ['In the pass book only', 'The firm entered it when it deposited the cheque, so the cash book has it.'],
    ['In the cash book only'],
    ['In neither book', 'The firm records a cheque when it deposits it.'],
  ], 2, 'The firm entered the cheque when it deposited it. The bank will enter it only when the cheque is cleared.', ['Who has written an entry for it so far?', 'The bank credits only when it collects the money.']),
  mcq(5, 'brs-overdraft', 'easy', 'A firm has an overdraft with its bank. In the bank column of the cash book this appears as:', [
    ['A debit balance', 'A debit balance in the cash book means money in the bank, the opposite of an overdraft.'],
    ['A credit balance'],
    ['A nil balance', 'The firm owes the bank, so the balance is not nil.'],
    ['A balance on the cash column', 'The overdraft is a bank balance, not cash in hand.'],
  ], 1, 'The firm owes the bank, so the bank column is a liability and shows a credit balance.', ['Is an overdraft an asset or a liability?', 'Debit means money in the bank.']),
  mcq(6, 'brs-overdraft', 'easy', 'A favourable balance of the firm appears in the pass book as:', [
    ['A debit balance', 'The pass book is written from the bank\'s side, where money held for the firm is a credit.'],
    ['A credit balance'],
    ['Either side, depending on the bank', 'The side is fixed: money the bank holds for the firm is always a credit in the pass book.'],
    ['A contra entry', 'A contra entry moves money between cash and bank in the cash book.'],
  ], 1, 'The bank owes the firm the money it holds, so in the bank\'s record it is a credit balance.', ['Whose record is the pass book?', 'What does the bank owe the firm?']),
  tf(7, 'brs-overdraft', 'easy', 'A debit balance in the pass book means that the firm has an overdraft.', true,
    'The pass book is the bank\'s record. If the firm owes the bank, the bank shows the balance on the debit side.', ['The pass book is written from the bank\'s side.']),
  tf(8, 'brs-timing', 'easy', 'A cheque issued but not yet presented must be entered again in the cash book when the reconciliation is done.', false,
    'The cash book already has the cheque, entered when it was issued. It is only shown in the reconciliation statement.', ['When did the firm write its entry?']),
  tf(9, 'brs-why', 'easy', 'A bank reconciliation statement is prepared by the bank and sent to the firm.', false,
    'The firm prepares the statement from its cash book and the pass book.', ['Who needs to explain the difference?']),
  tf(10, 'brs-why', 'easy', 'If both the cash book and the pass book show a favourable balance, the two balances must be equal.', false,
    'Timing differences, items first recorded by the bank and errors can all keep two favourable balances apart.', ['Think of a cheque issued but not yet presented.']),
  mcq(11, 'brs-from-cb', 'easy', 'Starting from a favourable cash book balance, interest credited by the bank (not yet in the cash book) is:', [
    ['Added'],
    ['Deducted', 'Treated interest earned as if it were a payment.'],
    ['Ignored, because it is not an error', 'Left out an item that explains part of the difference.'],
    ['Entered again in the cash book', 'The cash book does not have it yet, so it is entered once, not again.'],
  ], 0, 'The bank has added the interest, so the pass book balance is higher than the cash book balance. Going from the cash book to the pass book, add it.', ['Is the pass book higher or lower because of this item?']),
  mcq(12, 'brs-from-pb', 'easy', 'Starting from a favourable pass book balance, cheques deposited but not yet cleared are:', [
    ['Deducted', 'Thought the bank had not credited them, so reduced the balance. The cash book already has them, so its balance is higher.'],
    ['Added'],
    ['Ignored', 'Left out a timing difference.'],
    ['Entered in the pass book', 'The firm cannot write the bank\'s book.'],
  ], 1, 'The cash book already has the receipt but the bank has not added it, so the cash book balance is higher. Going from the pass book to the cash book, add it.', ['Which book has the larger balance?']),
  mcq(13, 'brs-overdraft', 'medium', 'Starting from an overdraft as per cash book, cheques issued but not yet presented are:', [
    ['Added to the overdraft', 'Used the rule for a favourable balance without turning it round.'],
    ['Deducted from the overdraft'],
    ['Ignored', 'Left out a timing difference.'],
    ['Entered again in the cash book', 'The cash book already has them.'],
  ], 1, 'The bank has not yet paid the cheques, so the pass book overdraft is smaller than the cash book overdraft.', ['An overdraft is a negative balance, so what is added to a favourable balance is deducted from it.']),
  mcq(14, 'brs-overdraft', 'medium', 'Starting from an overdraft as per pass book, bank charges debited by the bank (not yet in the cash book) are:', [
    ['Added to the overdraft', 'Used the favourable-balance rule from the pass book without turning it round.'],
    ['Deducted from the overdraft'],
    ['Ignored', 'Left out an item that explains part of the difference.'],
    ['Entered in the pass book', 'The firm cannot write the bank\'s book.'],
  ], 1, 'The pass book overdraft includes the charges, but the cash book does not, so the cash book overdraft is smaller by that amount.', ['Does the cash book overdraft include the charges?']),
  mcq(15, 'brs-amended', 'medium', 'Which of these needs NO entry in the cash book after the reconciliation?', [
    ['Interest credited by the bank', 'The cash book lacks it, so an entry is needed.'],
    ['A cheque issued but not yet presented'],
    ['A direct deposit by a customer', 'The cash book lacks it, so an entry is needed.'],
    ['A payment made by the bank on standing instruction', 'The cash book lacks it, so an entry is needed.'],
  ], 1, 'The cash book already has the cheque. The other three items began with the bank and the firm has not entered them.', ['Which item is already in the cash book?']),
  mcq(16, 'brs-errors', 'medium', 'The bank wrongly debits the firm\'s account with ₹3,000 that belongs to another customer. What does the firm do?', [
    ['Enters ₹3,000 as a payment in the cash book', 'Entered the bank\'s mistake in the firm\'s own book.'],
    ['Asks the bank to correct it and makes no cash book entry'],
    ['Adds ₹3,000 to the cash book balance', 'Changed the cash book for a mistake that is not in it.'],
    ['Treats it as bank charges', 'It is not a charge the firm owes.'],
  ], 1, 'The mistake is in the pass book, so the bank corrects it. The firm shows it in the reconciliation statement until it is put right.', ['Which book is wrong?']),
  mcq(17, 'brs-bank-items', 'medium', 'A customer\'s cheque deposited earlier is dishonoured and the bank debits the firm\'s account. The firm\'s entry is:', [
    ['Bank A/c Dr, To Customer A/c', 'Reversed the entry: the bank balance has gone down, not up.'],
    ['Customer A/c Dr, To Bank A/c'],
    ['Bank A/c Dr, To Sales A/c', 'Treated the dishonour as a new sale.'],
    ['Customer A/c Dr, To Cash A/c', 'The money has left the bank account, not the cash in hand.'],
  ], 1, 'The customer owes the money again, so the customer is debited. The bank has taken the money back, so Bank is credited.', ['Does the customer owe the money again?', 'Did the bank balance go up or down?']),
  mcq(18, 'brs-why', 'easy', 'Why do the cash book and the pass book rarely agree on a given date?', [
    ['One of them is always wrong', 'Differences are usually timing differences and items the bank records first, not mistakes.'],
    ['The pass book records only cash', 'The pass book records every deposit and withdrawal through the bank.'],
    ['Each is written by a different party at a different time, and the bank records some items first'],
    ['The cash book is prepared only once a year', 'The cash book is written as transactions happen.'],
  ], 2, 'The firm writes its entry when it issues or deposits a cheque, the bank when it pays or collects it, and the bank also makes entries the firm does not know about yet.', ['Who writes each book?']),
  mcq(19, 'brs-why', 'easy', 'A firm checks its bank balance by preparing a bank reconciliation statement:', [
    ['Only when the bank asks for it', 'The statement is for the firm\'s own control.'],
    ['At the end of a period, or whenever it wants to check the two balances'],
    ['Only when an error is already known', 'The statement is also how errors are found.'],
    ['Only once, when the business starts', 'It is repeated for every period.'],
  ], 1, 'The statement is the firm\'s own check, usually made at the end of each month.', ['Who needs to check the bank balance?']),
  mcq(20, 'brs-from-cb', 'medium', 'Assertion (A): Cheques issued but not yet presented are added to a favourable balance as per cash book to get the pass book balance. Reason (R): The cash book has already deducted these cheques, but the bank has not.', [
    [AR[0]],
    [AR[1], 'Missed that R is the very reason A is true: the cheques are added back because only the cash book has deducted them.'],
    [AR[2], 'Took R as false, although the firm deducts a cheque when it issues it and the bank only when it pays it.'],
    [AR[3], 'Took A as false, although these cheques make the pass book balance higher, so they are added.'],
  ], 0, 'The cash book is lower than the pass book by these cheques, and the reason is the one in R, so R explains A.', ['Is A true?', 'Does R say why A is true?']),
  mcq(21, 'brs-bank-items', 'medium', 'Assertion (A): Bank charges usually appear in the pass book before they appear in the cash book. Reason (R): The bank debits its charges on its own, and the firm comes to know of them only when it sees the pass book.', [
    [AR[0]],
    [AR[1], 'Missed that R is the very reason A is true: the firm cannot enter a charge it does not yet know about.'],
    [AR[2], 'Took R as false, although the bank does not ask the firm before it debits its charges.'],
    [AR[3], 'Took A as false, although the bank records its charges first and the firm enters them later.'],
  ], 0, 'The cash book cannot show the charges until the firm has seen the pass book, so R is why the pass book has them first.', ['Where does the firm learn about the charges?']),
  mcq(22, 'brs-from-cb', 'medium', 'Assertion (A): Interest debited by the bank is added to a favourable cash book balance in the reconciliation statement. Reason (R): Interest debited by the bank reduces the bank balance in the pass book.', [
    [AR[0], 'Took A as true, although interest debited by the bank lowers the pass book balance and so is deducted, not added.'],
    [AR[1], 'Took A as true, although interest debited by the bank is deducted from a favourable cash book balance.'],
    [AR[2], 'Got both statements the wrong way round: A is the false one, and R is true.'],
    [AR[3]],
  ], 3, 'Interest debited reduces the pass book balance, so going from the cash book to the pass book it is deducted, not added. A is false and R is true.', ['Does the interest raise or lower the pass book balance?']),
  num(23, 'brs-from-cb', 'easy', 'The cash book of a firm shows a favourable balance of ₹60,000. Cheques issued but not yet presented are ₹8,000 and cheques deposited but not yet cleared are ₹5,000. Find the balance as per the pass book (a favourable balance).', 63000, [
    [57000, 'Deducted the cheques issued and added the cheques deposited: both the wrong way round.'],
    [73000, 'Added both items to the cash book balance.'],
    [47000, 'Deducted both items from the cash book balance.'],
  ], ['Balance as per cash book (favourable): ₹60,000', 'Add: Cheques issued but not yet presented ₹8,000', 'Less: Cheques deposited but not yet cleared ₹5,000', 'Balance as per pass book (favourable): ₹63,000'],
  ['Which items make the pass book higher?']),
  num(24, 'brs-from-pb', 'medium', 'The pass book shows a favourable balance of ₹40,000. Bank charges of ₹300 and interest credited by the bank of ₹1,200 are not yet in the cash book. Find the balance as per the cash book (a favourable balance).', 39100, [
    [40900, 'Applied both items the wrong way round: deducted the charges and added the interest.'],
    [41500, 'Added both items to the pass book balance.'],
    [38500, 'Deducted both items from the pass book balance.'],
  ], ['Balance as per pass book (favourable): ₹40,000', 'Add: Bank charges ₹300 (the cash book has not deducted them)', 'Less: Interest credited ₹1,200 (the cash book has not added it)', 'Balance as per cash book (favourable): ₹39,100'],
  ['Going from the bank\'s balance to the firm\'s, each item works the other way round.']),
  num(25, 'brs-overdraft', 'medium', 'The cash book shows an overdraft of ₹25,000. Cheques issued but not yet presented are ₹6,000 and cheques deposited but not yet cleared are ₹4,000. Find the overdraft as per the pass book.', 23000, [
    [27000, 'Used the favourable-balance rule on an overdraft: added the cheques issued and deducted the cheques deposited.'],
    [35000, 'Added both items to the overdraft.'],
    [15000, 'Deducted both items from the overdraft.'],
  ], ['Overdraft as per cash book: ₹25,000', 'Less: Cheques issued but not yet presented ₹6,000', 'Add: Cheques deposited but not yet cleared ₹4,000', 'Overdraft as per pass book: ₹23,000'],
  ['With an overdraft every add and deduct turns round.']),
  num(26, 'brs-amended', 'medium', 'The cash book shows a favourable balance of ₹50,000. Bank charges of ₹400 and a dividend of ₹2,500 collected by the bank are not yet entered. Cheques of ₹7,000 deposited have not yet been cleared. The firm now enters what the cash book lacks. What is the cash book balance (favourable) after that?', 52100, [
    [45100, 'Also deducted the cheques not yet cleared, which are already in the cash book.'],
    [47900, 'Applied the charges and the dividend the wrong way round.'],
    [50000, 'Left the balance unchanged.'],
  ], ['Balance as per cash book: ₹50,000', 'Less: Bank charges ₹400', 'Add: Dividend collected by the bank ₹2,500', 'Amended cash book balance: ₹52,100. The ₹7,000 of cheques is already in the cash book.'],
  ['Which of the three items is already in the cash book?']),
  journal(27, 'brs-bank-items', 'The pass book of a firm shows bank charges of ₹350 that are not yet in the cash book. Pass the entry in the cash book.',
    [{ accountId: 'bankCharges', side: 'Dr', amount: 35000 }, { accountId: 'bank', side: 'Cr', amount: 35000 }],
    ['bankCharges', 'bank', 'cash', 'interestPaid', 'commissionPaid'],
    'Bank charges are an expense, so Bank Charges A/c is debited. The bank has deducted the amount, so Bank A/c is credited.'),
  journal(28, 'brs-bank-items', 'A cheque of ₹4,500 received from Mohan and deposited earlier has been dishonoured, and the bank has debited the firm\'s account. Pass the entry in the cash book.',
    [{ accountId: 'debtor:Mohan', side: 'Dr', amount: 450000 }, { accountId: 'bank', side: 'Cr', amount: 450000 }],
    ['debtor:Mohan', 'bank', 'cash', 'sales', 'badDebts'],
    'Mohan owes the money again, so Mohan\'s account is debited. The bank has taken the money back, so Bank A/c is credited.'),
  mcq(29, 'brs-why', 'easy', 'In the pass book, a deposit made by the firm is shown on the credit side because:', [
    ['The firm has paid money away', 'A deposit is money the firm has paid in, not money paid away.'],
    ['The bank now owes that money to the firm'],
    ['Deposits are always credits in every book', 'In the firm\'s own cash book a deposit is a debit to Bank.'],
    ['The bank has earned income', 'The deposit is not income of the bank.'],
  ], 1, 'The pass book is written from the bank\'s side. Money the firm deposits is a liability of the bank, so it is a credit there.', ['Whose point of view does the pass book take?']),
  mcq(30, 'brs-amended', 'medium', 'After the reconciliation and the entries in the cash book, the figure to show as "Cash at bank" in the balance sheet is:', [
    ['The balance as per pass book', 'The pass book may still leave out cheques the firm has already issued or deposited.'],
    ['The amended cash book balance'],
    ['The cash book balance before the reconciliation', 'That balance is missing items such as bank charges and interest.'],
    ['The average of the two balances', 'There is no such rule.'],
  ], 1, 'The firm\'s records show its position after all its own entries and corrections, which is the amended cash book balance.', ['Which book is the firm\'s own record?']),
  tf(31, 'brs-timing', 'medium', 'When both balances are favourable, cheques deposited but not yet cleared make the pass book balance lower than the cash book balance.', true,
    'The cash book already counts the cheques; the bank does not yet, so the pass book is lower.', ['Which book has counted the cheques?']),
  tf(32, 'brs-errors', 'medium', 'An error in the cash book is corrected by asking the bank to change the pass book.', false,
    'The firm corrects its own cash book. Only the bank\'s own errors are corrected by the bank.', ['Which book contains the error?']),
];

// ---------------------------------------------------------------------------------------------------------------
// Ladder
// ---------------------------------------------------------------------------------------------------------------

const levels = buildLadder(T, {
  concept: {
    title: 'Two Records of One Bank Account',
    description: 'See why the firm\'s cash book and the bank\'s pass book rarely agree, and what the statement is for.',
    lesson: [
      {
        type: 'text',
        heading: 'Two writers, one account',
        body: 'Your firm keeps a cash book. The bank keeps a pass book. Both record the same bank account, but they are written by two people at two different times. The firm writes a cheque into its cash book the day it issues or deposits it. The bank writes it into the pass book only when it pays or collects it.',
      },
      {
        type: 'text',
        heading: 'Why the balances differ',
        body: 'There are three reasons. First, timing: a cheque issued or deposited near the end of the month is in the cash book but not yet in the pass book. Second, items the bank records first: charges, interest, dividends, direct deposits by customers, payments on standing instructions and dishonoured cheques. Third, errors in either book. The statement lists these items and so explains the difference.',
      },
      {
        type: 'text',
        heading: 'Favourable balance and overdraft',
        body: 'A favourable balance means there is money in the bank. A debit balance in the cash book is favourable. In the pass book the same money is a credit balance, because the bank owes it to the firm. An overdraft is the opposite: a credit balance in the cash book and a debit balance in the pass book.',
      },
      {
        type: 'text',
        heading: 'A worked example',
        body: 'Cash book balance ₹50,000 (favourable). A cheque of ₹4,000 issued but not yet presented. Bank charges of ₹300 that the firm has not entered. Ask of each item whether the pass book is higher or lower. The unpresented cheque leaves ₹4,000 in the bank that the cash book has already spent: add it. The charges have been taken by the bank: deduct them. Pass book balance = 50,000 + 4,000 - 300 = ₹53,700.',
      },
      {
        type: 'example',
        title: 'Entering the ₹300 bank charges in the cash book',
        lines: [
          { accountId: 'bankCharges', side: 'Dr', amount: 30000 },
          { accountId: 'bank', side: 'Cr', amount: 30000 },
        ],
        note: 'The bank deducted the charges, so Bank is credited. The charges are an expense, so Bank Charges is debited. The unpresented cheque needs no entry: the cash book has it already.',
      },
      {
        type: 'working',
        title: 'Worked example 1: starting from an overdraft (Shree Ganesh Transport, Nagpur, 31 March)',
        lines: [
          'The cash book (bank column) shows an overdraft (a credit balance) of ₹45,000. Find the overdraft as per pass book.',
          'Cheques deposited but not yet cleared, ₹8,000: the bank has not added them, so the overdraft in the pass book is larger. Add ₹8,000.',
          'Bank charges of ₹500, not yet in the cash book: the bank has taken them, so its overdraft is larger. Add ₹500. Running total ₹53,500.',
          'Cheques issued but not yet presented, ₹12,000: the bank has not yet paid them, so its overdraft is smaller. Deduct ₹12,000.',
          'Interest of ₹1,500 on the firm\'s fixed deposit, credited to this account by the bank: it reduces the overdraft. Deduct ₹1,500.',
          'Overdraft as per pass book = ₹53,500 - ₹12,000 - ₹1,500 = ₹40,000.',
        ],
        note: 'Watch out: from an overdraft the rule turns round. What you would add to a favourable balance is deducted from an overdraft, and the reverse. A bank never credits interest on the overdrawn balance itself; interest credited here is on a fixed deposit.',
      },
      {
        type: 'working',
        title: 'Worked example 2: errors in the cash book (Sai Dental Clinic, Pune, 30 June)',
        lines: [
          'The cash book shows a favourable balance of ₹62,000. Find the balance as per pass book.',
          'The receipts side of the bank column was under-cast by ₹1,000: the cash book balance is ₹1,000 too low, so the pass book is higher. Add ₹1,000.',
          'A cheque for ₹4,750 issued for dental supplies was entered as ₹4,570: the cash book took off ₹180 too little, so it is too high and the pass book is lower. Deduct ₹180.',
          'A cheque for ₹9,000 issued to the landlord has not yet been presented: the bank still holds the money. Add ₹9,000.',
          'Balance as per pass book = ₹62,000 + ₹1,000 + ₹9,000 - ₹180 = ₹71,820.',
        ],
        note: 'Watch out: the amount of a recording error is the difference between the right and the wrong figure (₹4,750 - ₹4,570 = ₹180), never the whole cheque.',
      },
      {
        type: 'table',
        title: 'Worked example 3: the amended cash book first, then the statement (Lakshmi Seeds and Fertilisers, Guntur, 30 September)',
        rows: [
          { label: 'Step 1: Amended Cash Book (bank column)' },
          { label: 'Balance as per cash book (favourable)', amount: '₹38,000' },
          { label: "Add: Direct deposit by Krishna Farmers' Co-operative", amount: '₹12,000' },
          { label: 'Less: Bank charges', amount: '(600)' },
          { label: 'Amended balance as per cash book', amount: '₹49,400', total: true },
          { label: 'Step 2: Bank Reconciliation Statement' },
          { label: 'Amended balance as per cash book', amount: '₹49,400' },
          { label: 'Add: Cheque issued but not yet presented', amount: '₹5,000' },
          { label: 'Less: Cheque deposited but not yet cleared', amount: '(7,500)' },
          { label: 'Balance as per pass book (favourable)', amount: '₹46,900', total: true },
        ],
        note: 'The charges and the direct deposit are entered in the cash book; the two cheques need no entry and stay in the statement. Check: ₹38,000 + ₹5,000 - ₹7,500 - ₹600 + ₹12,000 = ₹46,900. Watch out: once the cash book is amended, do not list the items it now has in the statement again.',
      },
      { type: 'check', questionId: id(3) },
    ],
  },
  cards: {
    title: 'Rules for Reconciling',
    description: 'Recall which items go which way, and what changes with an overdraft.',
    cardIds: cards.map((c) => c.id),
  },
  recognition: [
    {
      title: 'Terms and Balances',
      description: 'Name the books, the balances and the kinds of difference.',
      questionIds: [id(1), id(2), id(3), id(4), id(5), id(6), id(7), id(8), id(9), id(10), id(18), id(19), id(29)],
    },
    {
      title: 'Add, Deduct or Enter?',
      description: 'Decide how each item is treated, with assertions and short calculations.',
      questionIds: [id(11), id(12), id(13), id(14), id(15), id(16), id(17), id(20), id(21), id(22), id(23), id(24), id(25), id(26), id(27), id(28), id(30), id(31), id(32)],
    },
  ],
  practice: [
    {
      title: 'Find the Other Balance',
      description: 'Two or three items, starting from a favourable balance in either book.',
      templateIds: ['brs-cb-to-pb-timing', 'brs-pb-to-cb-timing', 'brs-cb-to-pb-bank', 'brs-pb-to-cb-bank', 'brs-one-item', 'brs-gap'],
      count: 8,
    },
    {
      title: 'Add or Deduct? (Guided)',
      description: 'Decide the direction of one item, and say which book already shows it.',
      templateIds: ['brs-add-or-deduct-cb', 'brs-add-or-deduct-pb', 'brs-which-book', 'brs-dr-cr-meaning'],
      count: 6,
      guided: true,
    },
    {
      title: 'Favourable Balance or Overdraft',
      description: 'Four or five items, an overdraft as the starting point, and debit and credit wording.',
      templateIds: ['brs-cb-to-pb-mixed', 'brs-pb-to-cb-mixed', 'brs-od-cb-to-pb', 'brs-od-pb-to-cb', 'brs-dr-cr-start', 'brs-add-or-deduct-od', 'brs-missing-item'],
      count: 8,
    },
    {
      title: 'Errors in Either Book',
      description: 'Casting errors, wrong amounts and mistakes by the bank.',
      templateIds: ['brs-cast-error', 'brs-record-error', 'brs-bank-error', 'brs-error-direction', 'brs-corrected-cb'],
      count: 8,
    },
    {
      title: 'The Amended Cash Book',
      description: 'Find what needs an entry, pass the entries and find the amended balance.',
      templateIds: ['brs-amended-from-cb', 'brs-amended-from-pb', 'brs-needs-entry', 'brs-count-entries', 'brs-j-bank-debits', 'brs-j-bank-credits', 'brs-j-dishonour'],
      count: 8,
    },
    {
      title: 'Complex Reconciliations',
      description: 'Overdrafts, indirect information, balances that change nature, and decoy items.',
      templateIds: ['brs-cross-zero', 'brs-complex-cb-od', 'brs-complex-pb-od', 'brs-complex-indirect', 'brs-complex-amended', 'brs-nature-result'],
      count: 6,
    },
  ],
  mixed: { title: 'Mixed Practice', description: 'Everything in this topic, shuffled the way an exam serves it.', count: 10 },
  challenge: {
    title: 'Challenge: Reconciliation Mastery',
    description: 'The hardest reconciliations, timed.',
    count: 8,
    timerSecondsPerQuestion: 120,
  },
  sets: [
    {
      title: 'Journalise: Bringing the Cash Book up to Date',
      description: 'Four or five items the pass book shows first, and the entry for each: charges, interest, direct deposits, a dishonoured cheque, standing instructions, dividend.',
      templateIds: ['brs-set-pass-book-items'],
      count: 2,
    },
    {
      title: 'Journalise: Pass Book Items and Cash Book Errors',
      description: 'Six to eight items and the entry for each: what the pass book shows first, and cheques entered at the wrong amount, on the wrong side or twice.',
      templateIds: ['brs-set-with-errors'],
      count: 2,
    },
  ],
  formats: [
    {
      title: 'Prepare the Statement: Favourable Balances',
      description: 'Set out the statement with a Plus column for what is added and a Minus column for what is deducted, from a favourable balance in either book: cheques not yet presented or cleared, and what the bank records first.',
      templateIds: ['brs-fmt-timing', 'brs-fmt-bank-items', 'brs-fmt-from-pass-book'],
      count: 2,
    },
    {
      title: 'Prepare the Amended Cash Book',
      description: 'Bring the bank column up to date as an account: enter what the cash book lacks or has wrong, leave out what belongs in the statement alone, and balance it.',
      templateIds: ['brs-fmt-amended-cash-book'],
      count: 2,
    },
    {
      title: 'Prepare the Statement: Overdrafts and Errors',
      description: 'An overdraft stands in the Minus column: what reduces it goes in the Plus column, what adds to it in the Minus column, and you name what the statement ends on. Then wrong amounts, wrong sides and casting errors in the cash book.',
      templateIds: ['brs-fmt-overdraft', 'brs-fmt-errors'],
      count: 2,
    },
    {
      title: 'Prepare the Statement from Extracts of the Two Books',
      description: 'The bank column of the cash book and the pass book of one month, side by side: work out the cash book balance, tick off what both books show, and reconcile what is left.',
      templateIds: ['brs-fmt-extracts'],
      count: 2,
    },
  ],
});

const allLevels: Level[] = [
  ...levels,
  ...laterLevels(T, levels, [
    // Added after the papers were set; Assertion and Reason stays the last level of the topic.
    {
      name: 'bills-and-earlier-items',
      type: 'medium_practice',
      title: 'Bills, the Cash Column and Last Month\'s Cheques',
      description: 'A bill collected or a discounted bill dishonoured, a cheque written in the cash column, and cheques of the previous month still outstanding.',
      generate: { templateIds: ['brs-bills-items', 'brs-cash-column', 'brs-previous-period'], count: 8 },
    },
    {
      name: 'balance-or-overdraft',
      type: 'complex_practice',
      title: 'Favourable Balance or Overdraft? Say Which',
      description: 'Reconcile and give the result with its nature: from an overdraft, and where the items turn one into the other.',
      generate: { templateIds: ['brs-result-nature'], count: 6 },
    },
    {
      name: 'assertion-reason',
      type: 'medium_practice',
      title: 'Assertion and Reason',
      description: 'Two statements on this topic: decide whether each is true, and whether the Reason explains the Assertion.',
      generate: { templateIds: ['brs-assertion-reason'], count: 8 },
    },
  ]),
];

const pack: TopicPack = { topicId: T, concepts, cards, levels: allLevels, questions };

export default pack;
