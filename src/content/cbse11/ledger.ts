import { rupees } from '@/engine/money';
import type { JournalLine } from '@/engine/journal';
import { buildLadder, laterLevels } from '../ladder';
import type { Card, Concept, JournalQuestion, Level, McqQuestion, NumericQuestion, Question, TopicPack, TrueFalseQuestion } from '../types';

const T = 'ledger';

const concepts: Concept[] = [
  { id: 'led-posting', topicId: T, title: 'Posting from the journal to the ledger' },
  { id: 'led-to-by', topicId: T, title: 'The words "To" and "By"' },
  { id: 'led-balancing', topicId: T, title: 'Totalling and balancing an account' },
  { id: 'led-balances', topicId: T, title: 'Debit and credit balances' },
  { id: 'led-opening', topicId: T, title: 'Opening balances and Balance b/d' },
  { id: 'led-normal', topicId: T, title: 'Which accounts normally show which balance' },
  { id: 'led-personal', topicId: T, title: 'Personal accounts: who owes whom' },
  { id: 'led-errors', topicId: T, title: 'Wrong and missing postings' },
  { id: 'led-formats', topicId: T, title: 'Preparing a ledger account' },
  { id: 'led-closing', topicId: T, title: 'Closing nominal accounts at the end of the year' },
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
): Card => ({ id: `led-card-${n}`, topicId: T, conceptId, kind, prompt, answer, explanation, example, commonMistake });

const cards: Card[] = [
  card(1, 'led-posting', 'rule', 'What is posting?',
    "Copying each journal entry into the ledger accounts it names: every debit goes to the debit side of its account and every credit to the credit side of its account, with the same amount.",
    'The journal records transactions once, in date order. The ledger gathers every transaction of one account in one place, and posting is how the figures get there.',
    'Journal: Cash A/c Dr ₹10,000, To Sales A/c ₹10,000. Posted: ₹10,000 on the debit side of Cash A/c and ₹10,000 on the credit side of Sales A/c.',
    'Posting both lines of an entry on the same side, or posting only one of the two accounts.'),
  card(2, 'led-posting', 'format', 'What does a ledger account look like?',
    'A two-sided account headed "<Name> A/c". The debit side is on the left and the credit side on the right. Each side has Date, Particulars, J.F. (journal folio) and Amount columns.',
    'Every account has its own page. The J.F. column holds the page of the journal the entry came from, so any figure can be traced back.',
    'Cash A/c: left side "To Sales A/c ₹5,000" (a receipt); right side "By Rent A/c ₹2,000" (a payment).',
    'Mixing up the sides, or writing the Particulars of an item as the name of the account itself.'),
  card(3, 'led-to-by', 'rule', 'When do you write "To" and when "By"?',
    '"To" begins every item on the debit side and "By" every item on the credit side. The Particulars name the other account of the entry, never the account you are writing in.',
    'The Particulars say where the other half of the entry lives, so the two accounts point at each other.',
    'Cash sales ₹5,000. In Cash A/c (debit side): "To Sales A/c 5,000". In Sales A/c (credit side): "By Cash A/c 5,000".',
    'Writing the account\'s own name after To or By, or using the two words the wrong way round.'),
  card(4, 'led-posting', 'rule', 'How is an entry with a discount posted?',
    "Each line of the entry is posted on its own side to its own account with its own amount. A customer's account is credited with the whole amount settled: the cash received and the discount allowed together.",
    'The party owes (or is owed) the full amount, and both the money and the discount clear it.',
    'Received ₹9,800 in cash from Kiran in full settlement of ₹10,000. Kiran A/c, credit side: "By Cash A/c ₹9,800" and "By Discount Allowed A/c ₹200", ₹10,000 in all.',
    'Crediting the customer with only the cash received, which leaves the discount behind as a balance.'),
  card(5, 'led-balancing', 'rule', 'What are the steps to balance a real or personal account?',
    '1. Total each side. 2. Write the difference on the shorter side as "By Balance c/d" (credit side) or "To Balance c/d" (debit side). 3. Total both sides: the figures are now equal. 4. Bring the balance down on the opposite side as "To Balance b/d" or "By Balance b/d" on the first day of the next period. Only real accounts (assets) and personal accounts (debtors, creditors, capital, loans) are carried down; at the end of the year a nominal account (an expense, an income, purchases, sales) is closed instead, by transfer to Trading A/c or Profit and Loss A/c.',
    'An asset or a debt is still there on the first day of the next period, so its balance carries on. An expense or an income belongs to the year that has ended, so it is not carried into the next one.',
    'Debit side ₹50,000 and credit side ₹32,000: "By Balance c/d ₹18,000" on the credit side. Both sides total ₹50,000. Next day: "To Balance b/d ₹18,000" on the debit side.',
    'Writing the balance on the larger side, so the two sides still differ.'),
  card(6, 'led-balancing', 'format', 'How are Balance c/d and Balance b/d worded?',
    'Balance c/d (carried down) is written on the shorter side at the close. Balance b/d (brought down) is written on the larger side on the first day of the next period. A debit balance is "To Balance b/d"; a credit balance is "By Balance b/d". At the end of the year these two are used only in real and personal accounts: an expense, income, purchases or sales account is closed by transfer to Trading A/c or Profit and Loss A/c, and nothing is brought down.',
    'The balance leaves the old period on one side and re-enters the new period on the opposite side, where it belongs.',
    'A credit balance of ₹7,000: at the close "To Balance c/d ₹7,000" (debit side); on day one "By Balance b/d ₹7,000" (credit side).',
    'Writing b/d at the close, or c/d on the first day.'),
  card(7, 'led-balances', 'formula', 'How is the balance found?',
    'Balance = total of the larger side - total of the smaller side. With an opening balance: Closing balance = Opening balance + Increases - Decreases.',
    'The balance is the difference between the two sides, and it lies on the side with the larger total.',
    'Debit side ₹85,000, credit side ₹62,500: balance ₹22,500, a debit balance.',
    'Adding the two sides, or giving the larger total as the balance.'),
  card(8, 'led-balances', 'rule', 'When is a balance a debit balance, and when a credit balance?',
    'A debit balance when the debit side is larger. A credit balance when the credit side is larger.',
    'Look at which side is larger, not at where "Balance c/d" was written: c/d goes on the shorter side.',
    'Debit total ₹40,000 against credit total ₹25,000: a debit balance of ₹15,000, written as "By Balance c/d" on the credit side.',
    'Taking the side on which Balance c/d is written as the side of the balance.'),
  card(9, 'led-normal', 'shortcut', 'Which accounts normally have debit balances, and which credit?',
    'Debit: assets, expenses, losses, drawings and debtors. Credit: liabilities, capital, incomes, gains and creditors.',
    'An account increases on the side of its balance. Assets and expenses increase on the debit side; liabilities, capital and incomes on the credit side.',
    'Cash, Furniture, Rent, Mohan (a customer): debit. Sales, Capital, Commission Received, Rao (a supplier): credit.',
    'Giving Cash or Rent a credit balance because cash is credited when it is paid out.'),
  card(10, 'led-normal', 'rule', 'Which accounts have the opposite balance to their group?',
    'Drawings (deducted from capital) and Sales Return (deducted from sales) have debit balances. Purchases Return (deducted from purchases), Provision for Depreciation (deducted from fixed assets) and Provision for Doubtful Debts (deducted from debtors) have credit balances.',
    'An account that is deducted from another carries the opposite balance to it.',
    'Capital ₹2,00,000 has a credit balance; Drawings ₹30,000, deducted from it, has a debit balance. Sales has a credit balance; Sales Return has a debit balance.',
    'Giving Drawings a credit balance because it belongs with capital.'),
  card(11, 'led-personal', 'rule', 'How do you read the balance of a personal account?',
    'A debit balance means the person owes the firm (a debtor). A credit balance means the firm owes the person (a creditor).',
    'A debtor is an asset of the firm, so the account shows a debit balance. A creditor is a liability, so the account shows a credit balance.',
    'Mohan A/c: debit balance ₹15,000, so Mohan owes ₹15,000. Rao A/c: credit balance ₹25,000, so the firm owes Rao ₹25,000.',
    "Reading a debit balance as the firm's debt."),
  card(12, 'led-normal', 'rule', 'What if an account shows the balance of the other side?',
    'Cash A/c cannot show a credit balance: one signals an error. A credit balance in Bank A/c is an overdraft. A customer whose account shows a credit balance has paid in advance or overpaid, so the firm owes the customer. A supplier whose account shows a debit balance has been paid in advance or overpaid, so the supplier owes the firm.',
    'The meaning of an unusual balance comes from asking who is now owed money.',
    'Bank A/c credit balance ₹20,000: the firm is overdrawn by ₹20,000 and owes the bank.',
    'Assuming a credit balance in Bank A/c is always a posting error.'),
  card(13, 'led-opening', 'rule', 'How is an opening balance written?',
    'The closing balance of the old period becomes the opening balance of the new one. Assets open with "To Balance b/d" on the debit side. Liabilities and capital open with "By Balance b/d" on the credit side. Only real and personal accounts open a new year with a balance: expenses, incomes, purchases and sales were closed to Trading or Profit and Loss A/c and start the year empty.',
    'An account opens on the side where it normally increases.',
    'Cash ₹40,000 on 1 April: "To Balance b/d ₹40,000" on the debit side. Capital ₹2,00,000: "By Balance b/d ₹2,00,000" on the credit side.',
    'Writing every opening balance as "To Balance b/d".'),
  card(14, 'led-errors', 'rule', 'How does a wrongly posted item change the balance?',
    'An item posted on the wrong side makes the balance wrong by twice its amount. An item left out, or posted twice, makes it wrong by its amount once.',
    'On the wrong side, an item is missing from the right side and added to the other side, so the effect is doubled.',
    'A cash receipt of ₹3,000 posted on the credit side of Cash A/c makes the balance ₹6,000 too low.',
    'Correcting a wrong-side posting by the amount only once.'),
  card(15, 'led-posting', 'rule', 'What is not posted in an account?',
    'Sales A/c takes goods sold only, not the sale of assets or the money collected from customers. Purchases A/c takes goods bought only, not assets or payments to suppliers. Returns go to their own accounts. Repairs are an expense, but installation charges of a machine are part of its cost.',
    'Post an item to the account the entry names, and ask what the transaction really is.',
    'Machinery bought on credit is debited to Machinery A/c, not Purchases A/c. Cash collected from a customer is credited to the customer\'s account, not to Sales A/c.',
    'Posting the collection of an old sale as a new sale.'),
  card(16, 'led-posting', 'rule', 'How is a GST invoice posted?',
    'The party carries the invoice total. Sales or Purchases carries the value of the goods only. GST goes to its own accounts: Output CGST and SGST (or IGST) are credited on sales; Input CGST and SGST (or IGST) are debited on purchases.',
    'Tax is not part of income or cost, so it is kept in separate accounts.',
    'Sold goods ₹10,000 plus 18% IGST to Mohan on credit. Mohan A/c is debited ₹11,800; Sales A/c is credited ₹10,000; Output IGST A/c is credited ₹1,800.',
    'Posting the invoice total, tax included, to Sales or Purchases.'),
  card(17, 'led-closing', 'rule', 'How is a nominal account closed at the end of the year?',
    'An account of an expense, an income, purchases or sales is not carried down. On the last day of the year its balance is transferred, on its shorter side, to Trading A/c (purchases, sales, returns and direct expenses such as wages and carriage inwards) or to Profit and Loss A/c (indirect expenses such as rent, salaries and electricity, and other incomes such as commission received). The two sides then total the same, and the account starts the new year empty.',
    'An expense or an income belongs to the year in which it arose: it is gathered in the Trading or Profit and Loss Account, where the profit of that year is worked out. Assets, liabilities and capital are still there next year, so only they are carried down.',
    'Rent A/c of Kaveri Book House shows payments of ₹48,000 for the year. On 31 March: "By Profit and Loss A/c ₹48,000" on the credit side. In Wages A/c of a furniture workshop the same row reads "By Trading A/c".',
    'Writing "By Balance c/d" in Rent A/c or Purchases A/c and bringing it down into the next year, as if it were an asset.'),
];

// ---------------------------------------------------------------------------------------------------------------
// Authored questions
// ---------------------------------------------------------------------------------------------------------------

const qid = (n: number) => `led-q-${String(n).padStart(3, '0')}`;
const LETTERS = 'abcd';

/** `options` are [text, why]; the right one has no why. */
function mcq(
  n: number,
  conceptId: string,
  difficulty: McqQuestion['difficulty'],
  prompt: string,
  options: [string, string?][],
  correct: number,
  explanation: string,
  hints: string[],
): McqQuestion {
  return {
    id: qid(n),
    topicId: T,
    conceptId,
    difficulty,
    type: 'mcq',
    prompt,
    options: options.map(([text, why], i) => ({ id: LETTERS[i], text, ...(i !== correct && why ? { why } : {}) })),
    correct: LETTERS[correct],
    explanation,
    hints,
  };
}

const AR_OPTIONS = [
  'Both A and R are true, and R is the correct explanation of A',
  'Both A and R are true, but R is not the correct explanation of A',
  'A is true, but R is false',
  'A is false, but R is true',
];

/** An assertion and reason question; `whys` are the mistakes for the three wrong options, in order. */
function ar(
  n: number,
  conceptId: string,
  assertion: string,
  reason: string,
  correct: number,
  whys: [string, string, string],
  explanation: string,
): McqQuestion {
  const wrong = [...whys];
  return mcq(
    n,
    conceptId,
    'medium',
    `Assertion (A): ${assertion} Reason (R): ${reason} Choose the correct option.`,
    AR_OPTIONS.map((t, i) => [t, i === correct ? undefined : wrong.shift()] as [string, string?]),
    correct,
    explanation,
    ['Decide whether A is true on its own, then whether R is true on its own.', 'Only if both are true, ask whether R explains A.'],
  );
}

function tf(n: number, conceptId: string, difficulty: TrueFalseQuestion['difficulty'], prompt: string, correct: boolean, explanation: string, hints: string[]): TrueFalseQuestion {
  return { id: qid(n), topicId: T, conceptId, difficulty, type: 'true_false', prompt, correct, explanation, hints };
}

function num(
  n: number,
  conceptId: string,
  difficulty: NumericQuestion['difficulty'],
  prompt: string,
  answer: number,
  errors: [number, string][],
  working: string[],
  hints: string[],
): NumericQuestion {
  return {
    id: qid(n),
    topicId: T,
    conceptId,
    difficulty,
    type: 'numeric',
    prompt,
    unit: 'rupees',
    answer: rupees(answer),
    commonErrors: errors.map(([value, why]) => ({ value: rupees(value), why })),
    working,
    explanation: working.join(' '),
    hints,
  };
}

function jr(n: number, conceptId: string, prompt: string, expected: JournalLine[], accountChoices: string[], explanation: string, hints: string[]): JournalQuestion {
  return { id: qid(n), topicId: T, conceptId, difficulty: 'easy', type: 'journal_entry', prompt, expected, accountChoices, explanation, hints };
}

const questions: Question[] = [
  mcq(1, 'led-posting', 'easy', 'What is "posting" in accounting?',
    [
      ['Copying the entries of the journal into the proper ledger accounts'],
      ['Writing a transaction in the journal for the first time', 'Confused posting with journalising, which comes first.'],
      ['Totalling the two sides of a ledger account', 'Confused posting with balancing an account.'],
      ['Entering receipts and payments in the cash book', 'Mixed posting up with keeping the cash book.'],
    ], 0, 'Posting transfers each journal entry to the debit and credit accounts it names.',
    ['The journal comes first. What happens next?', 'Think of where each account collects all its transactions.']),
  mcq(2, 'led-posting', 'easy', 'Which statement describes the ledger?',
    [
      ['The book in which all the transactions of each account are brought together'],
      ['The book in which transactions are first recorded in order of date', 'That describes the journal, not the ledger.'],
      ['A list of the balances of all the accounts', 'That describes the trial balance.'],
      ['A statement showing the profit or loss of the year', 'That describes the profit and loss account.'],
    ], 0, 'The ledger has a separate account for each item and gathers all of its transactions in one place.',
    ['The ledger has one account for each item.', 'Which book is the "book of original entry"?']),
  mcq(3, 'led-posting', 'easy', 'A journal entry debits Cash A/c with ₹8,000 and credits Sales A/c with ₹8,000. When it is posted:',
    [
      ['Cash A/c is debited and Sales A/c is credited, each with ₹8,000'],
      ['Both accounts are debited with ₹8,000', 'Posted both lines on the debit side. Each line goes on the side named in the journal.'],
      ['Only Cash A/c is posted, because the money comes in', 'Posted one line only. Every line of an entry is posted.'],
      ['Cash A/c is credited and Sales A/c is debited', 'Reversed the sides of the entry.'],
    ], 0, 'Each line is posted to its own account on the side named in the journal.',
    ['Every line of the entry is posted.', 'Post each line on the side it already has in the journal.']),
  mcq(4, 'led-to-by', 'easy', 'Every item on the debit side of a ledger account begins with:',
    [
      ['To'],
      ['By', 'By begins the items on the credit side.'],
      ['Dr', 'Dr follows the debited account in a journal entry. Ledger items begin with To or By.'],
      ['Cr', 'Cr marks credit in other records. Ledger items begin with To or By.'],
    ], 0, '"To" is written before the Particulars of a debit-side item and "By" before those of a credit-side item.',
    ['There are only two such words.', 'Debit is on the left.']),
  mcq(5, 'led-to-by', 'easy', 'Rent of ₹4,000 is paid in cash. How is the item written in Rent A/c?',
    [
      ['"To Cash A/c" on the debit side'],
      ['"By Cash A/c" on the credit side', 'Put Rent A/c on the credit side. Rent is an expense, so it is debited.'],
      ['"To Rent A/c" on the debit side', "Wrote the account's own name. The Particulars name the other account of the entry."],
      ['"By Rent A/c" on the credit side', "Made both slips: the wrong side and the account's own name."],
    ], 0, 'Rent A/c is debited, so the item is on the debit side and begins with "To". It names the other account, Cash A/c.',
    ['Which account is debited?', 'The Particulars name the other account.']),
  mcq(6, 'led-to-by', 'easy', 'Goods are sold for cash ₹6,000. How is the item written in Sales A/c?',
    [
      ['"By Cash A/c" on the credit side'],
      ['"To Cash A/c" on the debit side', 'Put Sales A/c on the debit side. Sales is an income and is credited.'],
      ['"By Sales A/c" on the credit side', "Wrote the account's own name. The Particulars name the other account of the entry."],
      ['"To Sales A/c" on the debit side', "Made both slips: the wrong side and the account's own name."],
    ], 0, 'Sales A/c is credited, so the item is on the credit side and begins with "By". It names the other account, Cash A/c.',
    ['Is Sales an asset, an expense or an income?', 'The Particulars name the other account.']),
  tf(7, 'led-to-by', 'easy', 'In a ledger account, the Particulars of an item name the account in which the item is written.', false,
    'The Particulars name the other account of the entry. In Rent A/c, the item for rent paid in cash reads "To Cash A/c".',
    ['Which account would you be repeating?', 'The two accounts of an entry point at each other.']),
  mcq(8, 'led-posting', 'easy', 'The J.F. column of a ledger account shows:',
    [
      ['The page of the journal on which the entry appears'],
      ['The number of the voucher', 'Mixed the folio up with the voucher number, which is a different reference.'],
      ['The balance of the account after each item', 'Mixed it up with a running balance column. J.F. is only a page reference.'],
      ['The page of the ledger on which the account is found', 'Reversed it: that is what the journal\'s L.F. column shows.'],
    ], 0, 'J.F. stands for journal folio: the page of the journal from which the entry was posted.',
    ['F stands for folio, a page reference.', 'Where did the entry come from?']),
  mcq(9, 'led-to-by', 'medium', "Received ₹4,900 from Kiran, a customer, in full settlement of ₹5,000. How is this written in Kiran's A/c?",
    [
      ['"By Cash A/c" ₹4,900 and "By Discount Allowed A/c" ₹100'],
      ['"By Cash A/c" ₹4,900 only', "Left out the discount. Kiran's account would still show ₹100 owing."],
      ['"To Cash A/c" ₹4,900 and "To Discount Allowed A/c" ₹100', 'Used "To". The customer\'s account is credited, so the items begin with "By".'],
      ['"By Cash A/c" ₹5,000', 'Posted the whole amount against Cash. Only ₹4,900 was received.'],
    ], 0, "Kiran is credited with ₹5,000 in all: ₹4,900 received in cash and ₹100 discount allowed. Both are credit-side items, so both begin with \"By\".",
    ["A customer owes less after paying, so the customer's account is credited.", 'Both the money and the discount clear the account.']),
  mcq(10, 'led-balancing', 'medium', 'The debit side of an account totals ₹40,000 and the credit side ₹25,000. How is the account balanced?',
    [
      ['"By Balance c/d ₹15,000" on the credit side, so both sides total ₹40,000'],
      ['"To Balance c/d ₹15,000" on the debit side', 'Put the balance on the larger side, so the two sides still differ.'],
      ['"By Balance c/d ₹40,000" on the credit side', 'Wrote the larger total instead of the difference.'],
      ['"To Balance b/d ₹15,000" on the debit side', 'Used b/d at the close. Balance b/d is the opening balance of the next period.'],
    ], 0, 'The difference, ₹15,000, goes on the shorter (credit) side as "By Balance c/d". Both sides then total ₹40,000.',
    ['Which side is shorter?', 'The difference goes on the shorter side.']),
  mcq(11, 'led-balancing', 'easy', 'What does "Balance b/d" mean?',
    [
      ['The balance brought down: the closing balance of the old period, shown as the opening balance of the new one'],
      ['The balance carried down at the close of the period', 'That is Balance c/d.'],
      ['The balance before discount is deducted', 'Mixed up b/d with a discount. It only says "brought down".'],
      ['The balance written in the pass book of the bank', 'Mixed it up with the bank\'s record. b/d is part of the firm\'s own ledger.'],
    ], 0, 'b/d stands for brought down. It is the balance at the end of one period shown at the start of the next.',
    ['d stands for down.', 'Which period does it start?']),
  tf(12, 'led-balancing', 'easy', 'After an account is balanced and totalled, the totals of its two sides are equal.', true,
    'The balance c/d is added to the shorter side, so both sides come to the same total.',
    ['Why is the balance written on the shorter side?', 'The sides are totalled after Balance c/d has been entered.']),
  mcq(13, 'led-balancing', 'medium', 'What is the correct order for balancing an account?',
    [
      ['Total both sides, write the difference on the shorter side, total again, then bring the balance down'],
      ['Write the difference on the larger side, then total both sides', 'Put the balance on the larger side, so the two sides could never come to the same total.'],
      ['Bring the balance down first, then total both sides', 'Brought the balance down before it was carried down.'],
      ['Total the larger side only and ignore the smaller one', 'Both totals are needed to find the difference.'],
    ], 0, 'Total, write the difference on the shorter side, total again so both sides agree, then bring the balance down on the next day.',
    ['You need both totals before you can find the difference.', 'b/d comes last.']),
  mcq(14, 'led-balances', 'medium', 'An account has a debit balance. This means that:',
    [
      ['The total of the debit side is more than the total of the credit side'],
      ['"Balance c/d" was written on the debit side', 'A debit balance has Balance c/d on the credit side, the shorter side.'],
      ['The account has been debited only once', 'Counted entries. The balance depends on the amounts on each side, not on the number of entries.'],
      ['The account is certainly an asset', 'Expenses, losses and drawings also have debit balances, so a debit balance alone does not prove that the account is an asset.'],
    ], 0, 'A debit balance is the excess of the debit side over the credit side.',
    ['Compare the two totals.', 'Where is Balance c/d written?']),
  num(15, 'led-balances', 'easy', 'The debit side of an account totals ₹85,000 and the credit side ₹62,500. What is the balance?', 22500,
    [[147500, 'Added the two sides instead of finding their difference.'], [85000, 'Gave the total of the larger side as the balance.']],
    ['Balance = ₹85,000 - ₹62,500 = ₹22,500, a debit balance.'],
    ['The balance is the difference between the two sides.', 'Subtract the smaller total from the larger.']),
  num(16, 'led-personal', 'medium', "Mohan owed the firm ₹12,000 at the start of the month. Goods worth ₹8,000 were sold to Mohan on credit, and Mohan paid ₹5,000 in cash. What balance is carried down in Mohan's account?", 15000,
    [[25000, 'Added Mohan\'s payment instead of deducting it.'], [3000, "Left out the opening balance of ₹12,000."]],
    ['Debit side: ₹12,000 + ₹8,000 = ₹20,000.', 'Credit side: ₹5,000.', 'Balance = ₹20,000 - ₹5,000 = ₹15,000, owed by Mohan.'],
    ['Opening balance and credit sales are on the debit side.', "Mohan's payment is on the credit side."]),
  num(17, 'led-opening', 'easy', 'Cash in hand at the start of the month was ₹20,000. During the month cash receipts were ₹56,000 and cash payments were ₹41,000. What is the closing balance of Cash A/c?', 35000,
    [[117000, 'Added the payments instead of deducting them.'], [15000, 'Left out the opening cash balance.']],
    ['Debit side: ₹20,000 + ₹56,000 = ₹76,000.', 'Credit side: ₹41,000.', 'Balance = ₹76,000 - ₹41,000 = ₹35,000.'],
    ['The opening balance is a debit item of Cash A/c.', 'Receipts are debits and payments are credits.']),
  tf(18, 'led-personal', 'easy', "A credit balance in a customer's account means that the customer owes money to the firm.", false,
    'A credit balance in a personal account means the firm owes the person. A customer who owes the firm has a debit balance.',
    ['Which balance does a debtor normally have?', 'In a personal account a debit balance means the person owes the firm; a credit balance means the firm owes the person.']),
  tf(19, 'led-personal', 'easy', "A credit balance in a supplier's account means that the firm owes money to the supplier.", true,
    "A supplier is a creditor of the firm. The supplier's account is credited when goods are bought on credit, so a credit balance is what the firm owes.",
    ['Is a supplier a debtor or a creditor?', 'In a personal account a debit balance means the person owes the firm; a credit balance means the firm owes the person.']),
  mcq(20, 'led-posting', 'medium', 'Which of these is NOT posted in Purchases A/c?',
    [
      ['Machinery bought on credit'],
      ['Goods bought for cash', 'Cash purchases of goods are debited to Purchases A/c, so this is posted there.'],
      ['Goods bought on credit from a supplier', 'Credit purchases of goods are debited to Purchases A/c, so this is posted there.'],
      ['Goods bought from a supplier by cheque', 'Purchases of goods by cheque are debited to Purchases A/c, so this is posted there.'],
    ], 0, 'Purchases A/c takes only goods bought for resale. Machinery is an asset and goes to Machinery A/c.',
    ['Is it goods for resale or an asset for use?', 'Purchases A/c records only goods bought for resale, however they are paid for.']),
  mcq(21, 'led-personal', 'easy', "Rao & Co.'s account, a supplier's account, shows a credit balance of ₹25,000. This means:",
    [
      ['The firm owes Rao & Co. ₹25,000'],
      ['Rao & Co. owes the firm ₹25,000', 'Read the credit balance as a debt of the supplier. In a personal account it means the firm owes.'],
      ['The firm has paid Rao & Co. ₹25,000 in advance', 'An advance payment would leave a debit balance.'],
      ['The firm has sold goods worth ₹25,000 to Rao & Co.', 'Mixed the supplier up with a customer.'],
    ], 0, 'A credit balance in a personal account is what the firm owes to that person.',
    ['Who is the creditor?', 'Credit balance: the firm owes.']),
  mcq(22, 'led-opening', 'easy', 'Capital A/c has a credit balance of ₹2,00,000 brought forward from last year. How is it written on the first day of the new year?',
    [
      ['"By Balance b/d" on the credit side'],
      ['"To Balance b/d" on the debit side', 'Treated capital like an asset. Capital opens with a credit balance.'],
      ['"By Balance c/d" on the credit side', 'Used c/d. An opening balance is brought down (b/d).'],
      ['"To Balance c/d" on the debit side', 'Made both slips: the wrong word and the wrong side.'],
    ], 0, 'Capital is a credit balance, so it opens on the credit side as "By Balance b/d".',
    ['Capital is owed to the owner.', 'b/d is for opening balances.']),
  mcq(23, 'led-normal', 'medium', 'Why does Drawings A/c normally have a debit balance?',
    [
      ['Because drawings reduce capital, which has a credit balance'],
      ['Because drawings are an asset of the business', "The owner's drawings are not an asset of the business."],
      ['Because cash is credited when drawings are made', 'Confused the two accounts. Cash is credited, but Drawings itself is debited.'],
      ['Because drawings are a gain of the business', 'Took drawings as a gain. Gains are credited, but drawings are withdrawals.'],
    ], 0, 'Drawings are deducted from capital. Capital has a credit balance, so Drawings carries the opposite, a debit balance.',
    ['Drawings is deducted from capital.', 'What is the normal balance of capital?']),
  ar(24, 'led-normal', 'Cash A/c can never show a credit balance.', 'The cash paid out cannot be more than the cash available.', 0,
    ['R is not a separate fact: it is exactly why A holds.', 'R is true: payments cannot exceed the cash in hand.', 'A is true: a credit balance in Cash A/c would mean negative cash.'],
    'Cash in hand cannot be negative, so payments cannot exceed receipts plus opening cash. This is why Cash A/c cannot have a credit balance.'),
  ar(25, 'led-normal', 'Sales A/c has a credit balance.', 'Cash is debited when goods are sold for cash.', 1,
    ['R does not explain A. Sales is credited because it is an income, not because of what happens to Cash.', 'R is true: cash received is debited.', 'A is true: Sales is an income, so it has a credit balance.'],
    'Both statements are true, but Sales has a credit balance because it is an income. The debit to Cash is the other half of the entry, not the reason.'),
  ar(26, 'led-normal', 'Drawings A/c normally has a debit balance.', 'Drawings are an expense of the business.', 2,
    ['R is false, so it cannot explain A.', 'R is false: drawings are personal withdrawals of the owner, not an expense of the business.', 'A is true; R is the false one.'],
    'Drawings are personal withdrawals by the owner, not a business expense. The account is debited because it reduces capital.'),
  ar(27, 'led-normal', "A debit balance in a supplier's account means that the firm owes money to the supplier.", "A supplier's account normally shows a credit balance.", 3,
    [
      "A is false: a debit balance in a supplier's account means the supplier owes the firm.",
      'A is false: the firm owes the supplier when the balance is a credit balance.',
      'It is the other way round: A is false and R is true, because a supplier is a creditor.',
    ],
    "A supplier's account normally has a credit balance, which is what the firm owes the supplier. A debit balance would mean the firm has paid in advance or overpaid, so A is false."),
  ar(28, 'led-errors', 'An item posted on the wrong side of an account makes the balance wrong by twice the amount.', 'The item is missing from the correct side and is also added to the other side.', 0,
    ['R is the reason A holds.', 'R is true, and it is the reason.', 'A is true: the error is doubled.'],
    'An item on the wrong side has the opposite effect to the one intended. Compared with the correct posting the balance moves by the amount twice over.'),
  jr(29, 'led-posting', 'Goods are sold to Kiran for ₹9,000 on credit. Pass the journal entry that will be posted to the ledger.',
    [{ accountId: 'debtor:Kiran', side: 'Dr', amount: 900000 }, { accountId: 'sales', side: 'Cr', amount: 900000 }],
    ['debtor:Kiran', 'sales', 'cash', 'purchases', 'capital', 'creditor:Rao & Co.'],
    "Kiran owes the firm, so Kiran A/c is debited. Sales is an income, so it is credited. On posting, Kiran A/c shows \"To Sales A/c\" on its debit side and Sales A/c shows \"By Kiran A/c\" on its credit side.",
    ['A credit sale is not a cash sale.', 'Who owes the firm now?']),
  jr(30, 'led-posting', 'Goods worth ₹14,000 are bought from Rao & Co. on credit. Pass the journal entry that will be posted to the ledger.',
    [{ accountId: 'purchases', side: 'Dr', amount: 1400000 }, { accountId: 'creditor:Rao & Co.', side: 'Cr', amount: 1400000 }],
    ['purchases', 'creditor:Rao & Co.', 'cash', 'sales', 'capital', 'debtor:Kiran'],
    "Purchases A/c is debited and the supplier's account is credited, because the firm now owes the supplier. On posting, Purchases A/c shows \"To Rao & Co. A/c\" on its debit side and Rao & Co. A/c shows \"By Purchases A/c\" on its credit side.",
    ['Nothing is paid yet.', 'Goods bought for resale go to Purchases.']),
  mcq(31, 'led-balancing', 'medium', 'At the close of the year the credit side of Capital A/c is larger than the debit side by ₹2,00,000. How is the balance carried down?',
    [
      ['"To Balance c/d ₹2,00,000" on the debit side'],
      ['"By Balance c/d ₹2,00,000" on the credit side', 'Wrote c/d on the side of the balance. It goes on the shorter side, which is the debit side here.'],
      ['"To Balance b/d ₹2,00,000" on the debit side', 'Used b/d at the close. Balance b/d is brought down on the first day of the next period.'],
      ['"By Balance b/d ₹2,00,000" on the credit side', 'Wrote the opening entry of the new year at the close of the old one.'],
    ], 0, 'A credit balance means the credit side is larger. Balance c/d goes on the shorter, debit side as "To Balance c/d". On day one it is brought down on the credit side as "By Balance b/d".',
    ['Which side is shorter?', 'Balance c/d is written on the shorter side.']),
];

// ---------------------------------------------------------------------------------------------------------------
// Ladder
// ---------------------------------------------------------------------------------------------------------------

const EASY_POSTING = ['led-posting-accounts', 'led-posting-words', 'led-opening-wording', 'led-normal-nature'];
const EASY_BALANCING = [
  'led-balance-amount',
  'led-balance-side',
  'led-cd-wording',
  'led-bd-wording',
  'led-opening-closing',
  'led-total-side',
  'led-who-owes',
  'led-balance-after-item',
  'led-balance-from-totals',
];
const GUIDED = ['led-balance-amount', 'led-total-side', 'led-opening-closing'];
const MEDIUM_POSTING = [
  'led-balance-transactions',
  'led-posting-compound',
  'led-posting-compound-words',
  'led-posting-gst',
  'led-asset-balance',
  'led-total-side-transactions',
];
const MEDIUM_BALANCES = [
  'led-balance-side-transactions',
  'led-personal-transactions',
  'led-unusual-balance',
  'led-normal-contra',
  'led-unknown-item',
  'led-wrong-item',
  'led-next-period-balance',
];
const COMPLEX = [
  'led-correct-balance',
  'led-wrong-side-effect',
  'led-balance-from-journal',
  'led-debtor-balance',
  'led-creditor-balance',
  'led-find-opening',
  'led-bank-overdraft',
];

const levels = buildLadder(T, {
  concept: {
    title: 'What Is a Ledger?',
    description: 'See why the journal is not enough, and how posting and balancing give each account its own story.',
    lesson: [
      {
        type: 'text',
        heading: 'From the journal to the ledger',
        body: 'The journal records each transaction once, in the order it happened. But to know how much cash you hold, or what Mohan owes you, you need every transaction of that one item together. The ledger gives each item its own account and gathers them. Copying an entry from the journal into its accounts is called posting.',
      },
      {
        type: 'text',
        heading: 'Two sides and two little words',
        body: 'A ledger account has a debit side on the left and a credit side on the right. A debit in the journal is written on the debit side with the word "To"; a credit is written on the credit side with "By". After To or By you write the other account of the entry, never the account you are in.',
      },
      {
        type: 'example',
        title: 'Sold goods to Mohan on credit for ₹10,000',
        lines: [
          { accountId: 'debtor:Mohan', side: 'Dr', amount: 1000000 },
          { accountId: 'sales', side: 'Cr', amount: 1000000 },
        ],
        note: 'In Mohan A/c, debit side: "To Sales A/c 10,000". In Sales A/c, credit side: "By Mohan A/c 10,000".',
      },
      { type: 'check', questionId: qid(5) },
      {
        type: 'text',
        heading: 'Balancing an account',
        body: 'From time to time each account is totalled. The side with the larger total shows the balance, which is the difference. That difference is written on the shorter side as "Balance c/d" (carried down) so both sides match, and brought down on the opposite side on the first day of the next period as "Balance b/d". A larger debit side is a debit balance; a larger credit side is a credit balance.',
      },
      {
        type: 'table',
        title: 'Worked example 1: an asset with a debit balance. Furniture A/c of Gill Agro Inputs, Moga, for April',
        rows: [
          { label: 'Debit side (Dr)' },
          { label: '1 Apr  To Balance b/d (furniture already owned)', amount: '₹40,000' },
          { label: '6 Apr  To Cash A/c (a new counter bought for cash)', amount: '₹15,000' },
          { label: '30 Apr  Total', amount: '₹55,000', total: true },
          { label: 'Credit side (Cr)' },
          { label: '20 Apr  By Bank A/c (an old rack sold at its book value, cheque banked)', amount: '₹6,000' },
          { label: '30 Apr  By Balance c/d (written on the shorter side)', amount: '₹49,000' },
          { label: '30 Apr  Total', amount: '₹55,000', total: true },
          { label: '1 May  To Balance b/d (debit side, below the totals)', amount: '₹49,000' },
        ],
        note: 'Step 1: total each side: debit ₹55,000, credit ₹6,000. Step 2: the difference, ₹49,000, goes on the shorter (credit) side as "By Balance c/d". Step 3: both sides now total ₹55,000. Step 4: on 1 May the balance comes back on the debit side as "To Balance b/d": the furniture is still owned. Watch out: c/d goes on the shorter side, but the balance is a debit balance, because the debit side is larger.',
      },
      {
        type: 'table',
        title: 'Worked example 2: a supplier with c/d and b/d. Rao & Co. A/c in the books of Sharma Medical Store for May',
        rows: [
          { label: 'Debit side (Dr)' },
          { label: '12 May  To Purchases Return A/c (damaged strips sent back)', amount: '₹3,000' },
          { label: '20 May  To Cash A/c (paid on account)', amount: '₹20,000' },
          { label: '31 May  To Balance c/d', amount: '₹42,000' },
          { label: '31 May  Total', amount: '₹65,000', total: true },
          { label: 'Credit side (Cr)' },
          { label: '1 May  By Balance b/d (owed from April)', amount: '₹25,000' },
          { label: '8 May  By Purchases A/c (medicines bought on credit)', amount: '₹40,000' },
          { label: '31 May  Total', amount: '₹65,000', total: true },
          { label: '1 June  By Balance b/d (credit side, below the totals)', amount: '₹42,000' },
        ],
        note: 'Rao & Co. is a creditor, so the account opens on the credit side and every new purchase on credit is credited. Returns and payments lower the debt, so they are debited. Credit ₹65,000 - debit ₹23,000 = ₹42,000, a credit balance: the store owes Rao & Co. ₹42,000 on 1 June. Watch out: the particulars name the other account ("To Cash A/c"), never "To Rao & Co. A/c" inside Rao & Co. A/c.',
      },
      {
        type: 'table',
        title: 'Worked example 3: an overdrawn bank account. Bank A/c of Nair Auto Spares, Thrissur, for June',
        rows: [
          { label: 'Debit side (Dr)' },
          { label: '10 June  To Cash A/c (cash paid into the bank)', amount: '₹30,000' },
          { label: '24 June  To Kiran A/c (a customer\'s cheque banked)', amount: '₹18,000' },
          { label: '30 June  To Balance c/d', amount: '₹12,000' },
          { label: '30 June  Total', amount: '₹60,000', total: true },
          { label: 'Credit side (Cr)' },
          { label: '1 June  By Balance b/d (overdraft from May)', amount: '₹8,000' },
          { label: '15 June  By Joseph Traders A/c (cheque issued to a supplier)', amount: '₹45,000' },
          { label: '28 June  By Rent A/c (rent paid by cheque)', amount: '₹7,000' },
          { label: '30 June  Total', amount: '₹60,000', total: true },
          { label: '1 July  By Balance b/d (credit side: still overdrawn)', amount: '₹12,000' },
        ],
        note: 'An overdraft is money owed to the bank, so it opens on the credit side as "By Balance b/d". Credit ₹60,000 - debit ₹48,000 = ₹12,000, a credit balance: the business is still overdrawn by ₹12,000. Watch out: a credit balance in Bank A/c is not an error (only Cash A/c can never be in credit), and the overdraft is brought down on the credit side.',
      },
      {
        type: 'table',
        title: 'Worked example 4: closing a nominal account. Wages A/c of Bhatia Furniture Works, Ludhiana, for the year ended 31 March 2026',
        rows: [
          { label: 'Debit side (Dr)' },
          { label: '30 Sept 2025  To Cash A/c (wages of the workshop, April to September)', amount: '₹1,20,000' },
          { label: '31 Mar 2026  To Bank A/c (wages, October to March)', amount: '₹1,35,000' },
          { label: '31 Mar 2026  Total', amount: '₹2,55,000', total: true },
          { label: 'Credit side (Cr)' },
          { label: '31 Mar 2026  By Trading A/c (transfer: wages are a direct expense)', amount: '₹2,55,000' },
          { label: '31 Mar 2026  Total', amount: '₹2,55,000', total: true },
        ],
        note: 'Wages A/c is a nominal account: the wages belong to the year that has ended. So on 31 March it is not balanced with "Balance c/d"; its total is transferred to Trading A/c on the shorter side, and the account starts the new year empty. Indirect expenses such as rent and salaries, and incomes such as commission received, go to Profit and Loss A/c the same way. Watch out: only real and personal accounts are carried down; "Balance b/d" never appears in Wages, Rent, Purchases or Sales A/c at the start of a new year.',
      },
      { type: 'check', questionId: qid(10) },
    ],
  },
  cards: {
    title: 'Posting, Balancing and Balances',
    description: 'Recall the posting words, the balancing steps and which accounts show which balance.',
    cardIds: cards.map((c) => c.id),
  },
  recognition: [
    {
      title: 'Posting and the Words To and By',
      description: 'Say which accounts and which side, and what goes in the Particulars, before any figures.',
      questionIds: [qid(1), qid(2), qid(3), qid(4), qid(5), qid(6), qid(7), qid(8), qid(9), qid(29), qid(30)],
    },
    {
      title: 'Balances and What They Mean',
      description: 'Recognise how an account is balanced and what a debit or credit balance says.',
      questionIds: [qid(10), qid(11), qid(12), qid(13), qid(14), qid(31), qid(18), qid(19), qid(21), qid(22), qid(23), qid(24), qid(26), qid(27)],
    },
  ],
  practice: [
    {
      title: 'Posting Words and Normal Balances',
      description: 'Which accounts, which side, which word, and which balance an account normally has.',
      templateIds: EASY_POSTING,
      count: 8,
    },
    {
      title: 'Balancing and Balances',
      description: 'Find the balance, say whether it is debit or credit, and write Balance c/d and b/d.',
      templateIds: EASY_BALANCING,
      count: 10,
    },
    {
      title: 'Balancing Step by Step (Guided)',
      description: 'Total each side, take the difference and say where it goes, with the method laid out.',
      templateIds: GUIDED,
      count: 6,
      guided: true,
    },
    {
      title: 'Posting Transactions',
      description: 'Post compound entries, GST invoices and asset purchases, and ignore what does not belong.',
      templateIds: MEDIUM_POSTING,
      count: 8,
    },
    {
      title: 'Balances, Personal Accounts and Errors',
      description: 'Work out balances from described transactions, read personal accounts and spot the wrong posting.',
      templateIds: MEDIUM_BALANCES,
      count: 8,
    },
    {
      title: 'Complex Ledger Questions',
      description: 'Settlements with discount, returns, trade discount, wrong-side postings and indirect information.',
      templateIds: COMPLEX,
      count: 7,
    },
  ],
  mixed: { title: 'Mixed Practice', description: 'Everything in this topic, shuffled the way an exam serves it.', count: 10 },
  challenge: { title: 'Challenge: Ledger Mastery', description: 'The hardest ledger questions, mixed together and timed.', count: 8 },
  formats: [
    {
      title: 'Prepare an Account',
      description: "Write up a customer's or a supplier's account and Cash A/c from a month of transactions, row by row, and balance them.",
      templateIds: ['led-fmt-personal', 'led-fmt-cash'],
      count: 4,
    },
    {
      title: 'Prepare an Account: What Belongs in It',
      description: 'Purchases A/c or Sales A/c among transactions that do not belong, closed to Trading A/c, and an account built from GST invoices and settlements at a discount.',
      templateIds: ['led-fmt-goods', 'led-fmt-compound'],
      count: 4,
    },
    // Added after the papers were set (new ids at the end, so no level moves).
    {
      title: 'Close a Nominal Account',
      description: 'Write up an expense or an income account for the year and close it on 31 March to Trading A/c or Profit and Loss A/c, whichever it belongs to.',
      templateIds: ['led-fmt-close-nominal'],
      count: 4,
    },
    {
      title: 'Post a Journal to the Ledger',
      description: 'From a month of journal entries, compound ones among them, post every entry that touches one account, then balance it and bring the balance down.',
      templateIds: ['led-fmt-journal-cash', 'led-fmt-journal-party'],
      count: 4,
    },
  ],
});

const allLevels: Level[] = [
  ...levels,
  ...laterLevels(T, levels, [
    {
      name: 'assertion-reason',
      type: 'medium_practice',
      title: 'Assertion and Reason',
      description: 'Two statements on this topic: decide whether each is true, and whether the Reason explains the Assertion.',
      generate: { templateIds: ['led-assertion-reason'], count: 8 },
    },
  ]),
];

const pack: TopicPack = { topicId: T, concepts, cards, levels: allLevels, questions };

export default pack;
