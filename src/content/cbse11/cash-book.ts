import { buildLadder, laterLevels } from '../ladder';
import type { Card, Concept, Difficulty, JournalQuestion, Level, McqQuestion, NumericQuestion, Question, TopicPack, TrueFalseQuestion } from '../types';

const T = 'cash-book';

const concepts: Concept[] = [
  { id: 'cb-single', topicId: T, title: 'Single column cash book' },
  { id: 'cb-sides', topicId: T, title: 'Which side and which column' },
  { id: 'cb-double', topicId: T, title: 'Double column cash book' },
  { id: 'cb-contra', topicId: T, title: 'Contra entries' },
  { id: 'cb-discount', topicId: T, title: 'Discount and the cash book' },
  { id: 'cb-petty', topicId: T, title: 'Petty cash book and the imprest system' },
  { id: 'cb-balancing', topicId: T, title: 'Balancing and bank overdraft' },
  { id: 'cb-sets', topicId: T, title: 'Journalising a set of cash and bank transactions' },
  { id: 'cb-formats', topicId: T, title: 'Preparing a cash book' },
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
): Card => ({ id: `cb-card-${n}`, topicId: T, conceptId, kind, prompt, answer, explanation, example, commonMistake });

const cards: Card[] = [
  card(1, 'cb-single', 'rule', 'What does the cash book record, and on which sides?',
    'Every receipt and payment of cash, in date order: receipts on the debit side, payments on the credit side. It is both a book of original entry and the Cash Account of the ledger.',
    'Cash is an asset. It increases (a receipt) on the debit side and decreases (a payment) on the credit side. Because the cash book is itself the Cash Account, nothing in it is posted back to a Cash Account in the ledger.',
    'Cash sales ₹5,000 go on the debit side ("To Sales A/c"). Rent paid ₹2,000 goes on the credit side ("By Rent A/c").',
    'Writing a second Cash Account in the ledger and posting the cash book to it.'),
  card(2, 'cb-single', 'format', 'What is the format of a single column cash book?',
    'Two sides, each with Date | Particulars | L.F. | Amount (₹). The debit (receipts) side names each account with "To"; the credit (payments) side uses "By".',
    '"To" and "By" name the other account of each entry. The opening balance is the first item on the debit side ("To Balance b/d").',
    'Debit side: 1 Apr To Balance b/d 20,000; 3 Apr To Sales A/c 8,000. Credit side: 5 Apr By Rent A/c 3,000.',
    'Using "By" on the debit side or "To" on the credit side.'),
  card(3, 'cb-single', 'rule', 'How is a cash book balanced?',
    'Total both sides. The difference is the closing balance: write it on the smaller (credit) side as "By Balance c/d", total both sides at the same figure, then bring it down on the debit side as "To Balance b/d".',
    'Receipts (with the opening balance) are always at least the payments, because you cannot pay out more cash than you have. So the credit side is the smaller one and takes the balance c/d.',
    'Debit side ₹60,000; payments ₹45,000. By Balance c/d ₹15,000 makes the credit side ₹60,000. Next day: To Balance b/d ₹15,000.',
    'Writing the closing balance on the larger (debit) side.'),
  card(4, 'cb-double', 'format', 'What is the format of the double column cash book?',
    'Date | Particulars | L.F. | Cash ₹ | Bank ₹ on each side. Receipts of cash and of cheques banked go on the debit side; payments in cash and by cheque go on the credit side.',
    'The cash column and the bank column are two accounts in one book. In the current CBSE treatment there is no discount column: the double column cash book has a cash column and a bank column only.',
    'A cheque of ₹6,000 from Kiran, banked the same day: debit side, bank column, "To Kiran". Wages ₹4,000 in cash: credit side, cash column, "By Wages A/c".',
    'Adding a discount column from the old three column cash book.'),
  card(5, 'cb-sides', 'rule', 'Which column does a transaction go in?',
    'If cash notes and coins move, use the cash column. If money moves through the bank (a cheque banked, a cheque issued, bank charges, interest credited), use the bank column.',
    'The column follows the form of the money, the side follows the direction: money coming in is the debit side, money going out is the credit side.',
    'Paid creditor ₹7,000 by cheque: credit side, bank column. Cash sales ₹7,000: debit side, cash column.',
    'Using the cash column for a payment made by cheque.'),
  card(6, 'cb-sides', 'rule', 'When is a cheque entered in the cash book, and how is a dishonoured cheque treated?',
    'A cheque received and banked the same day goes straight to the debit side of the bank column. A cheque held for some days is treated as cash when received (debit side, cash column) and moved by a contra entry on the day it is deposited. A cheque issued is entered on the day it is issued, on the credit side of the bank column. A cheque received that the bank returns dishonoured is entered on the credit side of the bank column.',
    'This is the treatment these questions follow, and a question says so whenever a cheque is not banked at once. A dishonour reverses the earlier receipt: the bank balance falls and the customer owes the amount again, so the customer is debited.',
    'Cheque of ₹9,000 from Rao received on 2 May and deposited on 4 May: 2 May, cash column debit ₹9,000 ("To Rao"); 4 May, contra entry, bank column debit and cash column credit ₹9,000. Dishonoured on 9 May: bank column credit ₹9,000 ("By Rao").',
    'Waiting for the bank to pay a cheque issued before entering it, or entering a dishonour on the debit side or in the cash column.'),
  card(7, 'cb-contra', 'rule', 'What is a contra entry, and how is it made?',
    'A transaction in which both the cash and the bank accounts are affected, so both sides are in the cash book. Cash deposited into the bank: debit bank column, credit cash column. Cash drawn from the bank for office use: debit cash column, credit bank column. It is marked "C" in the L.F. column and is not posted to the ledger.',
    'The debit and the credit are both inside the cash book, so there is nothing to post anywhere else.',
    'Deposited ₹10,000 cash into the bank: Bank column debit ₹10,000 ("To Cash A/c") and cash column credit ₹10,000 ("By Bank A/c"), both marked C.',
    'Treating cash withdrawn by the owner for personal use as a contra entry. That is drawings.'),
  card(8, 'cb-contra', 'shortcut', 'How do contra entries affect the total of cash and bank together?',
    'They do not change it. A contra entry moves money from one column to the other: one balance falls and the other rises by the same amount.',
    'Use this to check a long question: the combined cash and bank funds change only through the non-contra transactions.',
    'Cash ₹30,000 and bank ₹50,000. After depositing ₹10,000 cash: cash ₹20,000, bank ₹60,000; together still ₹80,000.',
    'Counting a contra entry as new money coming in or going out.'),
  card(9, 'cb-discount', 'rule', 'Where is cash discount recorded in the current treatment?',
    'Not in the cash book. The cash book (cash and bank columns only) shows the amount actually received or paid. The discount is recorded by a journal entry in Discount Allowed A/c or Discount Received A/c.',
    'The firm records money as it moves. A discount is money that never moves, so it is recorded separately, and the personal account is cleared by the journal entry.',
    'A debtor owing ₹5,000 pays ₹4,900 by cheque in full settlement. Cash book: bank column debit ₹4,900. Journal: Discount Allowed A/c Dr ₹100, To the debtor ₹100.',
    'Entering the full ₹5,000 in the cash book.'),
  card(10, 'cb-discount', 'rule', 'Discount allowed, discount received and trade discount: which is which?',
    'Discount allowed (to a customer) is a loss: debit Discount Allowed A/c. Discount received (from a supplier) is a gain: credit Discount Received A/c. Trade discount is cut from the list price and is not recorded at all.',
    'A cash discount is given for prompt payment. A trade discount is a reduction in price, agreed before the sale.',
    'Allowed ₹100 to a debtor: Discount Allowed A/c Dr 100, To Debtor 100. Received ₹200 from a creditor: Creditor Dr 200, To Discount Received A/c 200.',
    'Swapping allowed and received, or opening an account for trade discount.'),
  card(11, 'cb-balancing', 'rule', 'How is a bank overdraft shown in the cash book?',
    'An overdraft at the start is entered on the credit side of the bank column ("By Balance b/d"). An overdraft at the close is the balancing figure on the debit side of the bank column ("To Balance c/d").',
    'An overdraft means the bank has paid more than the firm has deposited. The bank column then has a credit balance, the opposite of the usual debit balance, so everything is mirrored.',
    'Opening overdraft ₹12,000 ("By Balance b/d"), cheques banked ₹40,000, cheques issued ₹33,000: debit side ₹40,000; credit side ₹45,000. The credit side is larger, so the closing overdraft of ₹5,000 is entered on the debit side ("To Balance c/d") and brought down on the credit side.',
    'Entering an opening overdraft on the debit side as if it were a favourable balance.'),
  card(12, 'cb-balancing', 'formula', 'What is the closing balance of a column?',
    'Closing balance = opening balance + receipts - payments. For an overdraft, count the opening overdraft as a negative opening balance; a negative result is the closing overdraft.',
    'Cash can never close below nil, so the cash column never shows a credit balance. The bank column can, and that is an overdraft.',
    'Cash: ₹20,000 + ₹15,000 - ₹12,000 = ₹23,000. Bank: -₹10,000 + ₹6,000 - ₹9,000 = -₹13,000, an overdraft of ₹13,000.',
    'Adding the payments, or forgetting the opening balance.'),
  card(13, 'cb-double', 'shortcut', 'Which transactions never appear in the cash book?',
    'Credit sales and credit purchases, goods returned on credit, depreciation, expenses due but not paid and similar adjustments. Only money that actually moves (cash or cheque) is entered.',
    'The cash book is a record of cash and bank movements. A credit transaction is recorded in the sales or purchases book and the personal account; the cash book sees it only when the money is paid.',
    'Goods sold on credit to Mohan for ₹12,000: not in the cash book. Mohan pays ₹12,000 by cheque: bank column debit ₹12,000.',
    'Entering a credit sale as a cash receipt.'),
  card(14, 'cb-petty', 'rule', 'What is the imprest system?',
    'The head cashier gives the petty cashier a fixed sum (the imprest) at the start. At the end of each period the head cashier reimburses exactly what was spent, which restores the imprest.',
    'Petty expenses (postage, fares, tea) are small and frequent. The imprest system keeps the head cashier in control: the petty cashier can spend only the sum given in advance.',
    'Imprest ₹5,000, spent ₹3,650, cash left ₹1,350. The head cashier gives ₹3,650, so the petty cashier again has ₹5,000.',
    'Giving the whole imprest again instead of only the amount spent.'),
  card(15, 'cb-petty', 'formula', 'What are the three petty cash figures and how are they related?',
    'Cash in hand = imprest - payments. Amount to reimburse = payments = imprest - cash in hand. Imprest = payments + cash in hand.',
    'Any one of the three can be found from the other two.',
    'Imprest ₹6,000 and payments ₹4,150: cash in hand ₹1,850; reimbursement ₹4,150, which brings the cash back to ₹6,000.',
    'Reimbursing the cash in hand instead of the payments.'),
  card(16, 'cb-petty', 'format', 'What is the format of an analytical petty cash book?',
    'Receipts | Date | Particulars | Voucher No. | Total payment | analysis columns (Postage, Conveyance, Stationery, Refreshments, Repairs and so on). Each payment appears in the total column and again in one analysis column.',
    'The analysis columns add up to the total payment column. At the end of the period each analysis total is posted to the ledger account of that expense.',
    'Taxi fare ₹150: total payment ₹150 and Conveyance column ₹150.',
    'Entering a payment in two analysis columns, or in the analysis column only.'),
];

// ---------------------------------------------------------------------------------------------------------------
// Authored questions
// ---------------------------------------------------------------------------------------------------------------

const hints = (a: string, b: string) => [a, b];
const R = (n: number) => n * 100;
const id = (n: number) => `cb-q-${String(n).padStart(3, '0')}`;

/** An mcq: the right text goes at index `at`, the wrong ones (each with its mistake) fill the other places. */
function mcq(
  n: number,
  conceptId: string,
  difficulty: Difficulty,
  prompt: string,
  correct: string,
  at: number,
  wrong: [string, string][],
  explanation: string,
  hint: [string, string],
): McqQuestion {
  const texts: { text: string; why?: string }[] = wrong.map(([text, why]) => ({ text, why }));
  texts.splice(at, 0, { text: correct });
  const options = texts.map((o, i) => ({ id: 'abcd'[i], text: o.text, ...(o.why ? { why: o.why } : {}) }));
  return { id: id(n), topicId: T, conceptId, difficulty, type: 'mcq', prompt, options, correct: 'abcd'[at], hints: hints(...hint), explanation };
}

const tf = (n: number, conceptId: string, difficulty: Difficulty, prompt: string, correct: boolean, explanation: string, hint: [string, string]): TrueFalseQuestion => ({
  id: id(n), topicId: T, conceptId, difficulty, type: 'true_false', prompt, correct, hints: hints(...hint), explanation,
});

const num = (
  n: number,
  conceptId: string,
  difficulty: Difficulty,
  prompt: string,
  answer: number,
  commonErrors: [number, string][],
  working: string[],
  hint: [string, string],
): NumericQuestion => ({
  id: id(n), topicId: T, conceptId, difficulty, type: 'numeric', unit: 'rupees', prompt, answer: R(answer),
  commonErrors: commonErrors.map(([v, why]) => ({ value: R(v), why })), working, explanation: working.join(' '), hints: hints(...hint),
});

const AR = [
  'Both Assertion and Reason are true, and the Reason explains the Assertion',
  'Both are true, but the Reason does not explain the Assertion',
  'The Assertion is true but the Reason is false',
  'The Assertion is false but the Reason is true',
];
/** An assertion-and-reason question; `right` is the index of the correct statement in AR. */
const ar = (n: number, conceptId: string, difficulty: Difficulty, assertion: string, reason: string, right: number, whys: [string, string, string], explanation: string): McqQuestion => {
  const wrong = AR.map((text, i) => [text, whys[i < right ? i : i - 1]] as [string, string]).filter((_, i) => i !== right);
  return mcq(n, conceptId, difficulty, `Assertion (A): ${assertion}\nReason (R): ${reason}\nWhich is correct?`, AR[right], right, wrong, explanation, ['Decide whether A is true, then whether R is true.', 'If both are true, ask whether R is the reason for A.']);
};

const journalQ = (
  n: number,
  conceptId: string,
  difficulty: Difficulty,
  prompt: string,
  expected: JournalQuestion['expected'],
  accountChoices: string[],
  explanation: string,
  hint: [string, string],
): JournalQuestion => ({ id: id(n), topicId: T, conceptId, difficulty, type: 'journal_entry', prompt, expected, accountChoices, hints: hints(...hint), explanation });

const questions: Question[] = [
  mcq(1, 'cb-single', 'easy', 'The cash book is special because it is:', 'A book of original entry and also the Cash Account of the ledger', 0, [
    ['A subsidiary book for credit purchases only', 'Confused it with the purchases book; the cash book records cash and cheque movements.'],
    ['Only a ledger account, written up from the journal', 'Thought cash transactions are first journalised; they are entered directly in the cash book.'],
    ['A statement sent by the bank each month', 'Confused it with the pass book.'],
  ], 'Cash transactions are entered straight into the cash book, which is also the Cash Account, so no separate ledger account for cash is needed.', ['Where are cash transactions first written?', 'Does the ledger keep a second Cash Account?']),
  mcq(2, 'cb-single', 'easy', 'Which balance can the cash column of a cash book never show?', 'A credit balance', 2, [
    ['A debit balance', 'Thought cash always has a credit balance; a debit balance is the normal one.'],
    ['A nil balance', 'Thought a column cannot close at nothing; it can, if all the cash is spent.'],
    ['An opening balance', 'Thought a cash book cannot start with cash; it normally does.'],
  ], 'Payments cannot exceed the cash available, so receipts (with the opening balance) are never less than payments: the cash column never has a credit balance.', ['Can you pay out more cash than you have?', 'A credit balance would mean payments exceed receipts.']),
  mcq(3, 'cb-single', 'easy', 'On the debit side of a cash book, the account named in the particulars column begins with:', 'To', 1, [
    ['By', 'Used the word for the credit side.'],
    ['Dr', 'Wrote the abbreviation for debit in place of the word that begins the particulars.'],
    ['From', 'Wrote ordinary English instead of the accounting word.'],
  ], 'On the debit side the particulars begin with "To", on the credit side with "By".', ['Which word is used on the receipts side?', '"To" is for debit, "By" for credit.']),
  tf(4, 'cb-single', 'easy', 'Goods sold on credit to a customer are entered on the debit side of the cash book.', false, 'A credit sale involves no cash or cheque. It is recorded in the sales book and the customer\'s account; the cash book records it only when the customer pays.', ['Has any money been received?', 'The cash book records only cash and cheque movements.']),
  mcq(5, 'cb-sides', 'easy', 'A cheque from a debtor is banked on the day it is received. In the double column cash book it is entered in the:', 'Bank column, on the debit side', 2, [
    ['Cash column, on the debit side', 'Treated a cheque as cash; a banked cheque is a bank receipt.'],
    ['Bank column, on the credit side', 'Put a receipt on the payments side.'],
    ['Cash column, on the credit side', 'Mixed up both the side and the column.'],
  ], 'The money reaches the bank, so the bank column; it is a receipt, so the debit side.', ['Which column follows the bank?', 'A receipt is on the debit side.']),
  ar(6, 'cb-sides', 'medium', 'A cheque issued to a creditor is entered on the credit side of the bank column.', 'A cheque issued reduces the firm\'s bank balance.', 0, [
    'Did not see that the fall in the bank balance is exactly why the payment is credited.',
    'Doubted that a cheque issued reduces the bank balance.',
    'Doubted that a cheque payment is credited in the bank column.',
  ], 'Both statements are true. The bank balance falls, and a fall in an asset is a credit, so the Reason explains the Assertion.'),
  tf(7, 'cb-sides', 'easy', 'A cheque received from a debtor and banked the same day is entered in the cash column.', false, 'Once the cheque is banked, the money is in the bank account, so it is entered in the bank column.', ['Where does the money go?', 'Cash column is for notes and coins.']),
  mcq(8, 'cb-double', 'easy', 'In the current CBSE treatment, the two amount columns on each side of a double column cash book are:', 'Cash and bank', 1, [
    ['Cash and discount', 'Used the old three column cash book; discount is not a column of the cash book now.'],
    ['Bank and discount', 'Dropped the cash column and kept a discount column; the discount is recorded outside the cash book.'],
    ['Cash and capital', 'Confused a column of the cash book with an account.'],
  ], 'A double column cash book has a cash column and a bank column. Discount is recorded by journal entries in Discount Allowed and Discount Received.', ['How many kinds of money does a firm have to track?', 'Which column is not part of the cash book now?']),
  num(9, 'cb-single', 'medium',
    'A single column cash book opens with ₹15,000 in cash. During the month the firm made cash sales of ₹40,000, received ₹12,000 in cash from a debtor, bought goods for ₹25,000 in cash and paid rent of ₹5,000 in cash. What is the closing cash balance?',
    37000, [[97000, 'Added all the items, receipts and payments alike.'], [22000, 'Left out the opening balance.'], [67000, 'Left out the payments.']],
    ['Debit side = 15,000 + 40,000 + 12,000 = ₹67,000.', 'Credit side = 25,000 + 5,000 = ₹30,000.', 'Closing balance = 67,000 - 30,000 = ₹37,000.'], ['Add the receipts to the opening balance.', 'Then deduct the payments.']),
  mcq(10, 'cb-contra', 'easy', 'What is a contra entry?', 'An entry in which both the cash and the bank accounts are affected, so it appears on both sides of the cash book', 3, [
    ['An entry made to correct an earlier mistake', 'Confused it with a rectifying entry.'],
    ['An entry that is wrong because the debit and credit are in the same column', 'Took "contra" to mean "against the rules".'],
    ['An entry written in the journal proper', 'Thought entries outside the main books are contra entries; a contra entry is made in the cash book itself.'],
  ], 'Cash and bank are both accounts in the cash book, so the debit and the credit are both inside it. Cash paid into the bank, or drawn from it, is the standard example.', ['Which two accounts are involved?', 'Where are both sides of the entry recorded?']),
  mcq(11, 'cb-contra', 'easy', 'A contra entry is marked in the L.F. column with the letter:', 'C', 0, [
    ['J', 'Used the mark for the journal folio.'],
    ['L', 'Used the mark for a ledger folio.'],
    ['P', 'Used the mark for posting; a contra entry is not posted.'],
  ], 'Both sides of a contra entry are in the cash book, so there is no ledger folio to quote. "C" marks it as a contra entry.', ['Is a contra entry posted to the ledger?', 'It has no ledger page, so a special letter is used.']),
  tf(12, 'cb-contra', 'medium', 'A contra entry is posted from the cash book to the ledger.', false, 'Both the debit and the credit are in the cash book, so there is nothing to post.', ['Which accounts are affected?', 'Are they both in the cash book?']),
  tf(13, 'cb-contra', 'medium', 'Cash withdrawn from the firm\'s bank account by the owner for personal use is a contra entry.', false, 'The other account is Drawings, not Cash. A contra entry needs cash and bank on opposite sides of the cash book.', ['Who gets the money?', 'Is the other account Cash?']),
  num(14, 'cb-contra', 'easy',
    'A firm has ₹30,000 in cash and ₹90,000 at the bank. It deposits ₹10,000 of cash into the bank, and later withdraws ₹6,000 from the bank for office use. What is the closing bank balance?',
    94000, [[86000, 'Reversed both contra entries.'], [106000, 'Added the withdrawal to the bank balance.'], [100000, 'Counted only the deposit as a change in the bank balance.']],
    ['Bank balance after the deposit = 90,000 + 10,000 = ₹1,00,000.', 'Bank balance after the withdrawal = 1,00,000 - 6,000 = ₹94,000.'], ['A deposit adds to the bank balance.', 'A withdrawal takes from it.']),
  journalQ(15, 'cb-contra', 'easy', 'Cash of ₹15,000 was deposited into the firm\'s bank account. Show the accounts of the contra entry with the side of each.',
    [{ accountId: 'bank', side: 'Dr', amount: R(15000) }, { accountId: 'cash', side: 'Cr', amount: R(15000) }], ['bank', 'cash', 'capital', 'drawings', 'bankOverdraft'],
    'The bank balance rises (debit Bank) and cash in hand falls (credit Cash).', ['Which balance rises?', 'Debit what rises, credit what falls.']),
  mcq(16, 'cb-discount', 'easy', 'In the current treatment, which of these is NOT a column of the double column cash book?', 'Discount', 1, [
    ['Cash', 'Thought the cash column is not part of a cash book.'],
    ['Bank', 'Thought the bank column is not part of a double column cash book.'],
    ['Folio (L.F.)', 'Thought the folio column is not a column of the cash book; it is, but it carries no amount.'],
  ], 'The cash book has cash and bank amount columns. Discounts are recorded through the journal in Discount Allowed and Discount Received accounts.', ['Which amount columns are there?', 'Is discount money that actually moves?']),
  ar(17, 'cb-discount', 'medium', 'Discount allowed to a debtor is a loss to the firm.', 'The firm receives less than the amount due from the debtor.', 0, [
    'Did not see that receiving less than is due is exactly why the discount is a loss.',
    'Thought the firm does not receive less when it allows a discount.',
    'Thought discount allowed is a gain, so the Assertion is false.',
  ], 'Both are true and the Reason explains the Assertion: the firm gives up the discount, so it is a loss, recorded by debiting Discount Allowed A/c.'),
  tf(18, 'cb-discount', 'medium', 'Discount received from a creditor is recorded by debiting Discount Received A/c.', false, 'Discount received is a gain, so Discount Received A/c is credited. The creditor\'s account is debited.', ['Is it a gain or a loss?', 'Gains and incomes are credited.']),
  journalQ(19, 'cb-discount', 'medium', 'The firm owed Rao, a creditor, ₹10,000. Rao allowed a cash discount of ₹200, and the firm settled the account in full by a cheque for ₹9,800. The firm\'s cash book has cash and bank columns only, with no discount column, and the cheque has already been entered in its bank column. Pass the journal entry that records the discount only.',
    [{ accountId: 'creditor:Rao', side: 'Dr', amount: R(200) }, { accountId: 'discountReceived', side: 'Cr', amount: R(200) }], ['creditor:Rao', 'discountReceived', 'discountAllowed', 'bank', 'purchases'],
    'The cash book already debits Rao with the ₹9,800 paid, so ₹200 of the ₹10,000 is still open in Rao\'s account. Rao is debited with the ₹200, which closes the account, and the gain is credited to Discount Received A/c. Bank A/c is not part of this entry.', ['Is the discount a gain or a loss?', 'The cash book has already recorded the money paid.']),
  mcq(20, 'cb-discount', 'medium', 'A debtor owing ₹20,000 pays ₹19,600 by cheque, banked the same day, in full settlement. What does the bank column of the cash book show?', '₹19,600 on the debit side', 0, [
    ['₹20,000 on the debit side', 'Entered the full amount due, although only ₹19,600 reached the bank.'],
    ['₹400 on the debit side', 'Entered only the discount.'],
    ['₹19,600 on the credit side', 'Put a receipt on the payments side.'],
  ], 'The cash book records only what moves: ₹19,600 in the bank column. The ₹400 discount is recorded in Discount Allowed A/c through the journal.', ['How much reached the bank?', 'Is the discount money that moved?']),
  mcq(21, 'cb-petty', 'easy', 'Under the imprest system the petty cashier is given:', 'A fixed sum in advance, made up again at the end of each period by the amount spent', 1, [
    ['A different sum every day, as the petty cashier asks', 'Thought an imprest is open-ended; it is a fixed sum.'],
    ['Nothing in advance; the petty cashier pays first and is repaid later', 'Thought the petty cashier pays out of private money; the imprest is given in advance.'],
    ['The whole of the day\'s cash receipts', 'Confused petty cash with the main cash book.'],
  ], 'The imprest is a fixed sum given in advance. Each period the exact amount spent is replaced.', ['Is the amount fixed or variable?', 'Who provides the money first?']),
  mcq(22, 'cb-petty', 'easy', 'The petty cash book is kept by:', 'The petty cashier', 0, [
    ['The head cashier', 'Thought the main cashier writes it; the head cashier only supplies and checks the imprest.'],
    ['The owner of the firm', 'Thought small payments are written up by the owner.'],
    ['The bank manager', 'Confused it with a record kept by the bank.'],
  ], 'The petty cashier handles the small payments and writes up the petty cash book; the head cashier reimburses the petty cashier.', ['Who pays the small expenses?', 'Who writes down each small payment?']),
  mcq(23, 'cb-petty', 'medium', 'A petty cash book with columns for Postage, Conveyance and Stationery, besides the total payment column, is called:', 'An analytical petty cash book', 2, [
    ['A simple petty cash book', 'Thought only one amount column is used; a simple one has no analysis columns.'],
    ['A three column cash book', 'Confused it with the old cash book that had cash, bank and discount columns.'],
    ['A bank cash book', 'Confused it with a book that records only bank transactions.'],
  ], 'The analysis columns group the payments by type, and each analysis total is posted to the ledger account of that expense.', ['What do the extra columns do?', 'They split the payments into heads.']),
  num(24, 'cb-petty', 'medium',
    'A firm\'s imprest is ₹8,000. At the end of the month the petty cashier has ₹2,350 left. How much must the head cashier give the petty cashier to restore the imprest?',
    5650, [[2350, 'Gave the cash still in hand instead of the amount spent.'], [8000, 'Gave the whole imprest again.'], [10350, 'Added the cash in hand to the imprest.']],
    ['Amount spent = imprest - cash in hand = 8,000 - 2,350 = ₹5,650.', 'The head cashier reimburses ₹5,650, so the petty cashier is back to ₹8,000.'], ['How much has been spent?', 'Reimburse exactly that.']),
  tf(25, 'cb-petty', 'medium', 'Under the imprest system, reimbursing exactly the amount spent during a period brings the petty cash back to the imprest.', true, 'The petty cashier started with the imprest; the amount spent is replaced, so the petty cashier again holds the imprest.', ['What was given at first?', 'What has gone out since?']),
  tf(26, 'cb-petty', 'easy', 'The petty cash book is used to record large payments made by cheque.', false, 'Large payments by cheque go through the main cash book. The petty cash book is for small, frequent payments such as postage, fares and tea.', ['What does "petty" mean?', 'Which payments are small and frequent?']),
  mcq(27, 'cb-balancing', 'medium', 'In a double column cash book, an opening bank overdraft is entered on:', 'The credit side of the bank column', 1, [
    ['The debit side of the bank column', 'Treated the overdraft like a favourable opening balance.'],
    ['The credit side of the cash column', 'Put a bank figure in the cash column.'],
    ['The debit side of the cash column', 'Put a bank figure in the cash column and on the wrong side.'],
  ], 'An overdraft is a credit balance of the bank column, so it opens on the credit side as "By Balance b/d".', ['Is an overdraft a favourable or an unfavourable bank balance?', 'A favourable one opens on the debit side.']),
  tf(28, 'cb-balancing', 'medium', 'If the credit side of the bank column totals more than its debit side, the closing overdraft is entered on the debit side to balance the column.', true, 'The debit side is the smaller one, so "To Balance c/d" (the overdraft) is entered on it to make the two sides equal. It is brought down on the credit side.', ['Which side is smaller?', 'The balancing figure goes on the smaller side.']),
  num(29, 'cb-balancing', 'medium',
    'The bank column of a firm opens with an overdraft of ₹20,000. During the month cheques of ₹70,000 are received and banked, and cheques of ₹35,000 are issued. What is the closing bank balance?',
    15000, [[55000, 'Took the opening overdraft as a favourable balance.'], [105000, 'Added the cheques issued and ignored the overdraft.'], [50000, 'Left out the cheques issued.']],
    ['Debit side = cheques received = ₹70,000.', 'Credit side = opening overdraft 20,000 + cheques issued 35,000 = ₹55,000.', 'Closing balance = 70,000 - 55,000 = ₹15,000 favourable.'], ['The opening overdraft is on the credit side.', 'Compare the two sides.']),
  mcq(30, 'cb-balancing', 'medium', 'The debit side of a firm\'s bank column totals ₹80,000 (including a favourable opening balance of ₹30,000) and the credit side totals ₹95,000. The bank column shows:', 'An overdraft of ₹15,000', 3, [
    ['A favourable balance of ₹15,000', 'Subtracted correctly but did not notice that the credit side is the larger one.'],
    ['A favourable balance of ₹1,75,000', 'Added the two sides together.'],
    ['An overdraft of ₹95,000', 'Gave the larger side instead of the difference.'],
  ], 'Payments (₹95,000) are more than the receipts with the opening balance (₹80,000), so the bank is overdrawn by ₹15,000; it is the balancing figure on the debit side.', ['Which side is larger?', 'The difference is the balance; the larger credit side means overdraft.']),
];

// ---------------------------------------------------------------------------------------------------------------
// Ladder
// ---------------------------------------------------------------------------------------------------------------

const EASY = [
  'cb-sc-closing', 'cb-sc-total', 'cb-side', 'cb-column', 'cb-not-recorded', 'cb-contra-identify', 'cb-contra-effect', 'cb-contra-sides',
  'cb-contra-entry', 'cb-contra-balance', 'cb-bal-from-totals', 'cb-disc-where', 'cb-disc-account', 'cb-pc-reimburse', 'cb-pc-balance',
  'cb-pc-imprest-mcq', 'cb-pc-head',
];
const MEDIUM_DOUBLE = ['cb-sc-missing', 'cb-sc-opening', 'cb-bal-opening-dc', 'cb-dc-closing-cash', 'cb-dc-closing-bank', 'cb-dc-overdraft', 'cb-bal-side'];
const MEDIUM_CONTRA = ['cb-contra-total', 'cb-contra-count', 'cb-cheque-timing', 'cb-dishonour', 'cb-disc-cash-received', 'cb-disc-amount', 'cb-disc-rate', 'cb-disc-journal'];
// The two easy petty cash templates stand on the easy level only, so that this medium level is medium throughout.
const MEDIUM_PETTY = ['cb-pc-imprest-amount', 'cb-pc-analysis'];
const COMPLEX = ['cb-dc-ignore-credit', 'cb-dc-combined', 'cb-dc-bank-complex', 'cb-dc-totals', 'cb-disc-closing', 'cb-pc-raise', 'cb-pc-advance'];

const levels = buildLadder(T, {
  concept: {
    title: 'What Is a Cash Book?',
    description: 'See why a business keeps one book for all its money coming in and going out, and how the bank and petty cash fit in.',
    lesson: [
      {
        type: 'text',
        heading: 'A diary of money',
        body: 'A shopkeeper takes cash from customers, pays the rent, deposits money at the bank and writes cheques. If every one of these were scattered over many books, nobody could say how much cash the shop holds. The cash book is one book that records every receipt and every payment, in date order. Cash is an asset, so a receipt goes on the debit side and a payment on the credit side.',
      },
      {
        type: 'text',
        heading: 'Two columns: cash and bank',
        body: 'Most firms also have a bank account. The double column cash book keeps a cash column and a bank column side by side. Notes and coins go in the cash column. A cheque banked, a cheque issued, bank charges and bank interest go in the bank column. When cash is paid into the bank or drawn from it, both columns change, and the entry is called a contra entry. Discount is not a column of the cash book: it is recorded separately in the Discount Allowed and Discount Received accounts.',
      },
      {
        type: 'example',
        title: 'Cash of ₹20,000 paid into the bank',
        lines: [
          { accountId: 'bank', side: 'Dr', amount: 2000000 },
          { accountId: 'cash', side: 'Cr', amount: 2000000 },
        ],
        note: 'The bank balance rises (debit the bank column) and cash in hand falls (credit the cash column). Both are inside the cash book, so it is a contra entry and nothing is posted to the ledger. Total cash plus bank stays the same.',
      },
      {
        type: 'text',
        heading: 'Balancing and overdraft',
        body: 'At the end of the period each column is totalled. The difference is the closing balance, written on the smaller side as "By Balance c/d" and brought down as "To Balance b/d". Cash can never be overdrawn, but a bank account can: an overdraft is a credit balance of the bank column, so it starts on the credit side and closes on the debit side.',
      },
      {
        type: 'working',
        title: 'Worked example 1: a week of Meena Tailors, Lucknow (single column cash book)',
        lines: [
          '1 May: cash in hand ₹8,000. It opens the debit side: "To Balance b/d" ₹8,000.',
          '2 May: stitching charges of ₹3,500 received in cash: money comes in, debit side, "To Stitching Charges A/c".',
          '3 May: thread and buttons bought for ₹1,800 in cash: money goes out, credit side, "By Purchases A/c".',
          '4 May: electricity bill of ₹1,200 paid in cash: credit side, "By Electricity A/c".',
          '5 May: stitching charges of ₹2,200 received in cash: debit side.',
          '6 May: wages of ₹4,000 paid in cash: credit side, "By Wages A/c".',
          'Debit side = 8,000 + 3,500 + 2,200 = ₹13,700. Credit side = 1,800 + 1,200 + 4,000 = ₹7,000.',
          'Closing balance = 13,700 - 7,000 = ₹6,700, written on the smaller (credit) side as "By Balance c/d". Both sides now total ₹13,700.',
          '7 May: the balance is brought down on the debit side: "To Balance b/d" ₹6,700.',
        ],
        note: 'Watch out: the balance c/d goes on the smaller side, which for cash is always the credit side. Leaving out the opening balance is the other common slip: it belongs on the debit side before any receipt.',
      },
      {
        type: 'working',
        title: 'Worked example 2: a month of Kaveri Agro Inputs, Erode (double column, opening overdraft)',
        lines: [
          '1 June: cash ₹15,000 and an overdraft of ₹12,000. Cash opens on the debit side ("To Balance b/d" ₹15,000); the overdraft opens on the credit side of the bank column ("By Balance b/d" ₹12,000).',
          '3 June: cash sales ₹18,000: debit side, cash column.',
          '5 June: a cheque of ₹9,000 from Ramesh, a farmer who owed the firm, kept in the office: under the practice followed it is cash until banked, so debit side, cash column, "To Ramesh".',
          '8 June: ₹10,000 of cash paid into the bank: contra entry, bank column debit and cash column credit, both marked C.',
          '9 June: Ramesh\'s cheque deposited: another contra entry of ₹9,000, bank column debit and cash column credit.',
          '12 June: a cheque of ₹14,000 from Suresh, banked the same day: debit side, bank column, "To Suresh".',
          '18 June: ₹16,000 paid by cheque to Sri Lakshmi Fertilisers, a creditor: credit side, bank column.',
          '22 June: Suresh\'s cheque returned dishonoured: the receipt is undone, credit side of the bank column, "By Suresh" ₹14,000; Suresh owes the amount again.',
          '25 June: wages ₹3,500 paid in cash: credit side, cash column.',
          '28 June: ₹5,000 drawn from the bank for office use: contra entry, cash column debit and bank column credit.',
        ],
        note: 'Watch out: the opening overdraft is not a receipt. Put it on the credit side of the bank column; on the debit side it would turn a debt to the bank into money in hand.',
      },
      {
        type: 'table',
        title: 'Worked example 2, balanced on 30 June',
        rows: [
          { label: 'Cash column' },
          { label: 'Debit side: 15,000 + 18,000 + 9,000 + 5,000', amount: '₹47,000' },
          { label: 'Credit side: 10,000 + 9,000 + 3,500', amount: '₹22,500' },
          { label: '"By Balance c/d": cash in hand', amount: '₹24,500', total: true },
          { label: 'Bank column' },
          { label: 'Debit side: 10,000 + 9,000 + 14,000', amount: '₹33,000' },
          { label: 'Credit side: 12,000 + 16,000 + 14,000 + 5,000', amount: '₹47,000' },
          { label: '"To Balance c/d": the overdraft, on the smaller debit side', amount: '₹14,000', total: true },
        ],
        note: 'On 1 July cash in hand of ₹24,500 is brought down on the debit side and the overdraft of ₹14,000 on the credit side. Watch out: the dishonoured cheque is a credit in the bank column, never a debit in the cash column.',
      },
      {
        type: 'working',
        title: 'Worked example 3: balance or overdraft? Sharma Dental Clinic',
        lines: [
          'At the end of the month the bank column of the clinic shows a debit side of ₹62,000 (cheques banked and cash paid in).',
          'Its credit side is ₹75,000: the overdraft of ₹8,000 it opened with, cheques issued and bank charges.',
          'The credit side is larger by 75,000 - 62,000 = ₹13,000.',
          'So the bank column shows an overdraft of ₹13,000: the clinic owes the bank. It is written on the debit side as "To Balance c/d" and brought down on the credit side.',
        ],
        note: 'Watch out: the subtraction gives ₹13,000 whichever way it is done. Which side is larger is what tells a favourable balance (debit side larger) from an overdraft (credit side larger).',
      },
      {
        type: 'text',
        heading: 'Petty cash',
        body: 'A firm does not want its chief cashier to write up every stamp and cup of tea. Under the imprest system the head cashier gives a petty cashier a fixed sum. The petty cashier pays the small expenses and writes them in a petty cash book. At the end of the period the head cashier hands over exactly the amount spent, so the petty cashier is back at the fixed sum.',
      },
      {
        type: 'table',
        title: 'Worked example 4: a week of petty cash at Vidya Coaching Centre (imprest ₹2,000)',
        rows: [
          { label: '1 August: cash received from the head cashier (the imprest)', amount: '₹2,000' },
          { label: 'Payments, each under its head' },
          { label: 'Postage: stamps 90 + speed post 150', amount: '₹240' },
          { label: 'Conveyance: auto fare 120 + bus tickets 60', amount: '₹180' },
          { label: 'Stationery: marker pens 250 + printer paper 310', amount: '₹560' },
          { label: 'Total payments', amount: '₹980', total: true },
          { label: '6 August: "Balance c/d" = 2,000 - 980', amount: '₹1,020', total: true },
          { label: '8 August: "Balance b/d"', amount: '₹1,020' },
          { label: '8 August: cash from the head cashier, the amount spent', amount: '₹980' },
          { label: 'Petty cash in hand again: the imprest', amount: '₹2,000', total: true },
        ],
        note: 'Each payment is written in the Total payment column and again under its head, so the three heads add up to ₹980. Watch out: the head cashier gives back the ₹980 spent, not the ₹1,020 in hand and not the whole ₹2,000.',
      },
      {
        type: 'example',
        title: 'Worked example 5: a cash sale with GST at Nair Spices, Kochi (spices at 5%: CGST 2.5% and SGST 2.5%)',
        lines: [
          { accountId: 'cash', side: 'Dr', amount: 1050000 },
          { accountId: 'sales', side: 'Cr', amount: 1000000 },
          { accountId: 'outputCGST', side: 'Cr', amount: 25000 },
          { accountId: 'outputSGST', side: 'Cr', amount: 25000 },
        ],
        note: 'Spices worth ₹10,000 sold within the state for cash: CGST ₹250 and SGST ₹250, so ₹10,500 is received and entered on the debit side of the cash column. Watch out: Sales A/c is credited with ₹10,000 only; the ₹500 of GST is owed to the government.',
      },
      { type: 'check', questionId: id(2) },
      { type: 'check', questionId: id(5) },
    ],
  },
  cards: {
    title: 'Formats and Rules to Remember',
    description: 'The format of the cash book, contra entries, discount, overdraft and the imprest, in short cards.',
    cardIds: cards.map((c) => c.id),
  },
  recognition: [
    {
      title: 'Cash Book Basics',
      description: 'Which side, which column, and what a contra entry is.',
      questionIds: [id(1), id(2), id(3), id(4), id(5), id(7), id(8), id(10), id(11), id(12)],
    },
    {
      title: 'Discount, Petty Cash and Overdraft',
      description: 'Where discount is recorded, how the imprest works, and how an overdraft is shown.',
      questionIds: [id(6), id(13), id(16), id(17), id(18), id(20), id(21), id(22), id(23), id(25), id(26), id(27), id(28), id(30)],
    },
  ],
  practice: [
    {
      title: 'Single Column and Simple Entries',
      description: 'Closing balances, which side and column, contra entries and petty cash basics.',
      templateIds: EASY,
      count: 10,
    },
    {
      title: 'Double Column Cash Book (Guided)',
      description: 'Work out the closing cash and bank balances from a dated list, one column at a time.',
      templateIds: ['cb-dc-closing-cash', 'cb-dc-closing-bank'],
      count: 5,
      guided: true,
    },
    {
      title: 'Double Column and Balancing',
      description: 'Opening and closing balances, missing items, overdrafts and where the balance goes.',
      templateIds: MEDIUM_DOUBLE,
      count: 8,
    },
    {
      title: 'Contra, Cheques and Discount',
      description: 'Contra entries, cheques banked or dishonoured, and where cash discount is recorded.',
      templateIds: MEDIUM_CONTRA,
      count: 8,
    },
    {
      title: 'Petty Cash and Imprest',
      description: 'The amount to reimburse, the imprest, the balance in hand and analysis columns.',
      templateIds: MEDIUM_PETTY,
      count: 6,
    },
    {
      title: 'Complex Cash Book Problems',
      description: 'Credit items to ignore, overdrafts with bank charges, combined funds, discount and a changed imprest.',
      templateIds: COMPLEX,
      count: 7,
    },
  ],
  mixed: { title: 'Mixed Cash Book Practice', description: 'Everything in this topic, shuffled the way an exam serves it.', count: 12 },
  challenge: { title: 'Challenge: Cash Book Mastery', description: 'The hardest cash book problems, timed.', count: 8 },
  sets: [
    {
      title: 'Journalise: Contra Entries and Their Look-alikes',
      description: 'Four or five dated transactions of one week: cash paid in and drawn out, drawings, and cheques banked at once or later.',
      templateIds: ['cb-set-contra-week'],
      count: 2,
    },
    {
      title: 'Journalise: Cash Discount and Petty Cash',
      description: 'Four or five dated transactions of one month: accounts settled less cash discount, the imprest given and the petty cashier reimbursed.',
      templateIds: ['cb-set-discount-petty'],
      count: 2,
    },
  ],
  formats: [
    {
      title: 'Prepare a Single Column Cash Book and a Petty Cash Statement',
      description: 'Write up the cash book of a week, a fortnight or a month row by row, leaving out what does not belong, balance it and bring the balance down; then a week of petty cash on the imprest system.',
      templateIds: ['cb-fmt-single', 'cb-fmt-single-select', 'cb-fmt-petty'],
      count: 3,
    },
    {
      title: 'Prepare a Double Column Cash Book',
      description: 'Cash and bank columns for a month: contra entries marked on both sides, and accounts settled at a cash discount that the cash book does not show.',
      templateIds: ['cb-fmt-double', 'cb-fmt-discount'],
      count: 2,
    },
    {
      title: 'Double Column Cash Book: Overdraft and a Full Month',
      description: 'A month that opens with a bank overdraft and a cheque kept before it is banked, and a full month with a dishonoured cheque, bank charges and interest from the pass book.',
      templateIds: ['cb-fmt-overdraft', 'cb-fmt-month'],
      count: 2,
    },
    {
      title: 'Prepare an Analytical Petty Cash Book',
      description: 'A week of vouchers on the imprest system: each payment in the Total payment column and under its head of expense, and the balance of petty cash carried down.',
      templateIds: ['cb-fmt-petty-book'],
      count: 2,
    },
    {
      title: 'Prepare a Full Petty Cash Book',
      description: 'A whole week of the analytical petty cash book: what was received, each voucher under its head, the balance carried down, the totals, and the imprest restored below them.',
      templateIds: ['cb-fmt-petty-full'],
      count: 2,
    },
  ],
});

const allLevels: Level[] = [
  ...levels,
  ...laterLevels(T, levels, [
    {
      name: 'balance-or-overdraft',
      type: 'medium_practice',
      title: 'Balance or Overdraft?',
      description: 'Close the bank column and say what it shows: a favourable balance or an overdraft, and of how much.',
      generate: { templateIds: ['cb-nature-totals', 'cb-nature-month', 'cb-nature-complex'], count: 6 },
    },
    {
      name: 'gst-and-endorsed-cheques',
      type: 'medium_practice',
      title: 'GST and Endorsed Cheques',
      description: 'Sales and purchases with GST through the cash and bank columns, and cheques passed on to a creditor.',
      generate: { templateIds: ['cb-gst-amount', 'cb-gst-entry', 'cb-endorse-entry', 'cb-endorse-where'], count: 8 },
    },
    // Assertion and Reason stays the last level of the topic (src/generators/assertionReason.test.ts).
    {
      name: 'assertion-reason',
      type: 'medium_practice',
      title: 'Assertion and Reason',
      description: 'Two statements on this topic: decide whether each is true, and whether the Reason explains the Assertion.',
      generate: { templateIds: ['cb-assertion-reason'], count: 8 },
    },
  ]),
];

const pack: TopicPack = { topicId: T, concepts, cards, levels: allLevels, questions };

export default pack;
